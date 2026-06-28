import { Injectable } from '@nestjs/common';
import { AgentPersonaService, type AgentPersonaCode, type PersonaSummary } from './agent-persona.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import type { AgentActor, AgentRouteDecision } from './agent.types.js';

type RouteInput = {
  message: string;
  actor: AgentActor;
  context?: Record<string, unknown>;
  manualPersonaCode?: string | null;
  previousPersonaCode?: string | null;
};

type PersonaCandidate = AgentRouteDecision['candidates'][number];

const DEFAULT_PERSONA_BY_ROLE: Record<AgentActor['role'], AgentPersonaCode> = {
  manager: 'manager',
  reception: 'reception',
  beautician: 'beautician',
};

const PERSONA_KEYWORDS: Record<AgentPersonaCode, string[]> = {
  manager: ['经营', '风险', '重点', '关注', '今日', '今天', '日报', '概览', '业绩', '员工', '排班', '收入', '营收'],
  marketing: ['营销', '活动', '召回', '复购', '回访', '沉睡', '流失', '文案', '优惠', '客群', '转化', '触达'],
  reception: ['预约', '到店', '客户', '会员', '卡项', '权益', '核销', '收银', '办卡', '充值', '登记', '前台'],
  beautician: ['我的', '我今天', '我的客户', '客户', '美容师', '服务', '护理', '下一个客户', '护理记录', '提成', '手法', '皮肤', '复购承接'],
  inventory: ['库存', '缺货', '补货', '采购', '临期', '过期', '效期', '周转', '供应商', '耗材', '商品'],
  finance: ['财务', '利润', '毛利', '成本', '实收', '退款', '折扣', '流水', '对账', '日结', '预收', '负债'],
};

@Injectable()
export class AgentRouterService {
  constructor(
    private readonly personaService: AgentPersonaService,
    private readonly toolRegistry: AgentToolRegistryService,
  ) {}

  async route(input: RouteInput): Promise<AgentRouteDecision> {
    const allowedPersonas = await this.getAllowedPersonas(input.actor.role);
    const manual = this.normalizePersonaCode(input.manualPersonaCode);
    if (manual) {
      const allowed = allowedPersonas.some((persona) => persona.code === manual);
      return this.buildDecision({
        personaCode: allowed ? manual : DEFAULT_PERSONA_BY_ROLE[input.actor.role],
        mode: allowed ? 'manual' : 'role_default',
        confidence: allowed ? 1 : 0.55,
        reason: allowed ? '请求显式指定角色 Agent，已按手动分诊执行。' : `当前角色无权使用 ${manual} Agent，已回退到默认 Agent。`,
        candidates: this.rankCandidates(input.message, allowedPersonas),
        deniedReason: allowed ? null : `当前角色 ${input.actor.role} 无权使用 ${manual} Agent。`,
      });
    }

    const ranked = this.rankCandidates(input.message, allowedPersonas);
    const previous = this.normalizePersonaCode(input.previousPersonaCode);
    const top = ranked[0];
    const previousCandidate = previous ? ranked.find((candidate) => candidate.personaCode === previous) : null;
    const messageLooksLikeContinuation = this.isContinuation(input.message);
    if (previous && previousCandidate && (messageLooksLikeContinuation || !this.shouldSwitchRoute(top, previousCandidate))) {
      return this.buildDecision({
        personaCode: previous,
        mode: 'context_inherit',
        confidence: Math.max(0.72, Math.min(0.95, previousCandidate.score || 0.72)),
        reason: messageLooksLikeContinuation ? '当前输入是上一轮追问，沿用上一轮 Agent。' : '当前输入未明显跨域，沿用上一轮 Agent。',
        candidates: ranked,
      });
    }

    if (top && top.score >= 0.58) {
      return this.buildDecision({
        personaCode: top.personaCode as AgentPersonaCode,
        mode: 'auto',
        confidence: Math.min(0.95, Math.max(0.6, top.score)),
        reason: `根据问题语义和能力目录，自动分诊到 ${this.getPersonaName(top.personaCode, allowedPersonas)}。`,
        candidates: ranked,
        routeChanged: Boolean(previous && previous !== top.personaCode),
      });
    }

    const fallback = DEFAULT_PERSONA_BY_ROLE[input.actor.role];
    return this.buildDecision({
      personaCode: fallback,
      mode: 'role_default',
      confidence: 0.52,
      reason: '未命中明确专业 Agent，回退到当前角色默认经营智能体。',
      candidates: ranked,
    });
  }

  private async getAllowedPersonas(role: AgentActor['role']) {
    const personas = await this.personaService.listAll();
    const allowed = personas.filter((persona) => persona.targetRoles.includes(role));
    return allowed.length ? allowed : personas.filter((persona) => persona.code === DEFAULT_PERSONA_BY_ROLE[role]);
  }

  private rankCandidates(message: string, personas: PersonaSummary[]): PersonaCandidate[] {
    const normalizedMessage = this.normalizeText(message);
    const tools = this.toolRegistry.list();
    const toolDescriptions = new Map(tools.map((tool) => [tool.name, `${tool.name} ${tool.description}`]));

    return personas
      .map((persona) => {
        const matched = new Set<string>();
        const keywordScore = this.scoreTerms(normalizedMessage, PERSONA_KEYWORDS[persona.code] ?? [], matched);
        const questionScore = this.scoreTerms(normalizedMessage, persona.suggestedQuestions, matched, 0.85);
        const descriptionScore = this.scoreTerms(normalizedMessage, [persona.name, persona.description, ...persona.toolGroups], matched, 0.65);
        const toolScore = this.scoreTerms(
          normalizedMessage,
          persona.toolGroups.map((group) => toolDescriptions.get(group) ?? group),
          matched,
          0.75,
        );
        const rawScore = keywordScore + questionScore + descriptionScore + toolScore;
        return {
          personaCode: persona.code,
          score: Math.min(0.99, Number(rawScore.toFixed(2))),
          matchedCapabilities: Array.from(matched).slice(0, 6),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private scoreTerms(message: string, terms: string[], matched: Set<string>, weight = 1) {
    if (!message) return 0;
    let score = 0;
    for (const term of terms) {
      const normalized = this.normalizeText(term);
      if (!normalized) continue;
      if (message.includes(normalized)) {
        matched.add(term);
        score += 0.65 * weight;
        continue;
      }
      const parts = normalized.split(/\s+/).filter((part) => part.length >= 2);
      const partialHits = parts.filter((part) => message.includes(part));
      if (partialHits.length) {
        matched.add(term);
        score += Math.min(0.35, partialHits.length * 0.08) * weight;
      }
    }
    return Math.min(1, score);
  }

  private shouldSwitchRoute(top: PersonaCandidate | undefined, previous: PersonaCandidate) {
    if (!top) return false;
    return top.personaCode !== previous.personaCode && top.score >= 0.65 && top.score - previous.score >= 0.18;
  }

  private isContinuation(message: string) {
    const text = this.normalizeText(message);
    return /^(那|这个|这些|继续|再|帮我|怎么处理|如何处理|下一步|生成|安排|执行|就按)/.test(text) && text.length <= 24;
  }

  private buildDecision(input: {
    personaCode: AgentPersonaCode;
    mode: AgentRouteDecision['mode'];
    confidence: number;
    reason: string;
    candidates: PersonaCandidate[];
    deniedReason?: string | null;
    routeChanged?: boolean;
  }): AgentRouteDecision {
    return {
      personaCode: input.personaCode,
      confidence: Number(input.confidence.toFixed(2)),
      reason: input.reason,
      candidates: input.candidates,
      clarificationNeeded: false,
      clarificationQuestion: null,
      deniedReason: input.deniedReason ?? null,
      mode: input.mode,
      routeChanged: input.routeChanged,
    };
  }

  private getPersonaName(personaCode: string, personas: PersonaSummary[]) {
    return personas.find((persona) => persona.code === personaCode)?.name ?? `${personaCode} Agent`;
  }

  private normalizePersonaCode(value?: string | null): AgentPersonaCode | null {
    const normalized = String(value ?? '').trim();
    return ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance'].includes(normalized)
      ? (normalized as AgentPersonaCode)
      : null;
  }

  private normalizeText(value: string) {
    return String(value ?? '').toLowerCase().replace(/[，。！？、,.!?;；:：()[\]【】"'“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
