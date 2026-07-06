import { Injectable, Optional } from '@nestjs/common';
import type { AgentActor } from '../agent/agent.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type AgentV2GrayMode =
  | 'legacy_regex'
  | 'shadow'
  | 'kg_llm_preferred'
  | 'kg_llm_only'
  | 'legacy_retired';

export type AgentV2GrayEngine = 'legacy_regex' | 'shadow' | 'kg_llm';

export type AgentV2GrayStrategy = {
  mode: AgentV2GrayMode;
  engine: AgentV2GrayEngine;
  source: 'context' | 'db_rule' | 'env_rule' | 'env_global' | 'env_legacy' | 'default';
  reason: string;
  allowLegacyFallback: boolean;
  recordShadow: boolean;
  legacyRetired: boolean;
  matchedRule?: string;
};

type AgentV2GrayRule = {
  name?: string;
  mode?: AgentV2GrayMode | string;
  source?: 'db' | 'env';
  priority?: number;
  storeIds?: Array<number | string>;
  personaCodes?: string[];
  roles?: string[];
  entrypoints?: string[];
  capabilityIds?: string[];
};

@Injectable()
export class AgentV2GrayStrategyService {
  private dbRulesCache: { loadedAt: number; rules: AgentV2GrayRule[] } | null = null;
  private readonly dbRuleCacheTtlMs = 30_000;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  resolve(input: {
    actor: AgentActor;
    context?: Record<string, unknown>;
    capabilityId?: string | null;
    capabilityIds?: Array<string | number | null | undefined>;
  }): AgentV2GrayStrategy {
    const contextMode = this.modeFromContext(input.context);
    if (contextMode) {
      return this.toStrategy(contextMode, 'context', '调试上下文显式指定灰度模式。');
    }

    const dbRule = this.matchRule(this.cachedDbRules(), input);
    if (dbRule?.mode && isGrayMode(dbRule.mode)) {
      return this.toStrategy(dbRule.mode, 'db_rule', dbRule.name ? `命中治理中心灰度规则：${dbRule.name}。` : '命中治理中心灰度规则。', dbRule.name);
    }

    const rule = this.matchRule(this.parseRules(process.env.AGENT_V2_GRAY_RULES), input);
    if (rule?.mode && isGrayMode(rule.mode)) {
      return this.toStrategy(rule.mode, 'env_rule', '命中 AGENT_V2_GRAY_RULES 灰度规则。', rule.name);
    }

    const globalMode = process.env.AGENT_V2_GRAY_MODE;
    if (isGrayMode(globalMode)) {
      return this.toStrategy(globalMode, 'env_global', '命中 AGENT_V2_GRAY_MODE 全局灰度模式。');
    }

    const legacyMode = this.modeFromLegacyEnv();
    if (legacyMode) {
      return this.toStrategy(legacyMode.mode, 'env_legacy', legacyMode.reason);
    }

    const defaultMode = defaultAgentV2GrayMode();
    return this.toStrategy(defaultMode.mode, 'default', defaultMode.reason);
  }

  async resolveAsync(input: {
    actor: AgentActor;
    context?: Record<string, unknown>;
    capabilityId?: string | null;
    capabilityIds?: Array<string | number | null | undefined>;
  }): Promise<AgentV2GrayStrategy> {
    const contextMode = this.modeFromContext(input.context);
    if (contextMode) {
      return this.toStrategy(contextMode, 'context', '调试上下文显式指定灰度模式。');
    }

    const dbRule = this.matchRule(await this.loadDbRules(), input);
    if (dbRule?.mode && isGrayMode(dbRule.mode)) {
      return this.toStrategy(dbRule.mode, 'db_rule', dbRule.name ? `命中治理中心灰度规则：${dbRule.name}。` : '命中治理中心灰度规则。', dbRule.name);
    }

    return this.resolve(input);
  }

  hasCapabilityScopedRules() {
    return [...this.cachedDbRules(), ...this.parseRules(process.env.AGENT_V2_GRAY_RULES)]
      .some((rule) => Boolean(rule.capabilityIds?.length));
  }

  async hasCapabilityScopedRulesAsync() {
    return [...await this.loadDbRules(), ...this.parseRules(process.env.AGENT_V2_GRAY_RULES)]
      .some((rule) => Boolean(rule.capabilityIds?.length));
  }

  async refreshDbRules() {
    this.dbRulesCache = null;
    return this.loadDbRules();
  }

  private modeFromContext(context?: Record<string, unknown>) {
    const candidates = [
      context?.agentV2GrayMode,
      context?.grayMode,
      this.asObject(context?.agentV2GrayStrategy)?.mode,
      this.asObject(context?.agentV2Debug)?.grayMode,
    ];
    return candidates.map((value) => String(value ?? '')).find(isGrayMode) as AgentV2GrayMode | undefined;
  }

  private modeFromLegacyEnv(): { mode: AgentV2GrayMode; reason: string } | null {
    const legacyEngine = process.env.AGENT_INTENT_ENGINE;
    const shadowCompare = this.isTruthy(process.env.AGENT_INTENT_SHADOW_COMPARE);
    if (legacyEngine === 'shadow' || shadowCompare) {
      return {
        mode: 'shadow',
        reason: legacyEngine === 'shadow'
          ? '兼容 AGENT_INTENT_ENGINE=shadow。'
          : '兼容 AGENT_INTENT_SHADOW_COMPARE=true，开启影子对比。',
      };
    }
    if (legacyEngine === 'kg_llm') {
      return {
        mode: 'kg_llm_preferred',
        reason: '兼容 AGENT_INTENT_ENGINE=kg_llm，默认保留旧链路回退。',
      };
    }
    if (isGrayMode(legacyEngine)) {
      return {
        mode: legacyEngine,
        reason: `兼容 AGENT_INTENT_ENGINE=${legacyEngine}。`,
      };
    }
    return null;
  }

  private matchRule(
    rules: AgentV2GrayRule[],
    input: {
      actor: AgentActor;
      context?: Record<string, unknown>;
      capabilityId?: string | null;
      capabilityIds?: Array<string | number | null | undefined>;
    },
  ): AgentV2GrayRule | null {
    return rules.find((rule) => this.ruleMatches(rule, input)) ?? null;
  }

  private ruleMatches(
    rule: AgentV2GrayRule,
    input: {
      actor: AgentActor;
      context?: Record<string, unknown>;
      capabilityId?: string | null;
      capabilityIds?: Array<string | number | null | undefined>;
    },
  ) {
    if (!isGrayMode(rule.mode)) return false;
    if (rule.storeIds?.length && !rule.storeIds.map(String).includes(String(input.actor.storeId))) return false;
    if (rule.personaCodes?.length && !rule.personaCodes.includes(String(input.actor.personaCode ?? ''))) return false;
    if (rule.roles?.length && !rule.roles.includes(String(input.actor.role))) return false;
    if (rule.entrypoints?.length && !rule.entrypoints.includes(String(input.actor.entrypoint))) return false;
    if (rule.capabilityIds?.length) {
      const capabilityIds = this.capabilityCandidates(input);
      if (!rule.capabilityIds.some((capabilityId) => capabilityIds.includes(String(capabilityId)))) return false;
    }
    return true;
  }

  private capabilityCandidates(input: {
    context?: Record<string, unknown>;
    capabilityId?: string | null;
    capabilityIds?: Array<string | number | null | undefined>;
  }) {
    const contextCapabilityPlan = this.asObject(input.context?.capabilityPlan);
    const candidates = [
      input.capabilityId,
      ...(input.capabilityIds ?? []),
      input.context?.capabilityId,
      contextCapabilityPlan?.capabilityId,
    ];
    return Array.from(new Set(candidates.map((value) => String(value ?? '').trim()).filter(Boolean)));
  }

  private parseRules(raw?: string): AgentV2GrayRule[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item) => item && typeof item === 'object').map((item) => ({ ...(item as AgentV2GrayRule), source: 'env' }))
        : [];
    } catch {
      return [];
    }
  }

  private cachedDbRules() {
    if (!this.dbRulesCache) return [];
    if (Date.now() - this.dbRulesCache.loadedAt > this.dbRuleCacheTtlMs) return [];
    return this.dbRulesCache.rules;
  }

  private async loadDbRules(): Promise<AgentV2GrayRule[]> {
    const cached = this.cachedDbRules();
    if (cached.length || this.dbRulesCache) return cached;
    const delegate = (this.prisma as any)?.agentV2GrayRule;
    if (!delegate?.findMany) {
      this.dbRulesCache = { loadedAt: Date.now(), rules: [] };
      return [];
    }
    try {
      const rows = await delegate.findMany({
        where: { status: 'active' },
        orderBy: [{ priority: 'asc' }, { id: 'asc' }],
        take: 500,
      });
      const rules = (rows as Array<Record<string, unknown>>).map((row) => this.mapDbRule(row)).filter(Boolean) as AgentV2GrayRule[];
      this.dbRulesCache = { loadedAt: Date.now(), rules };
      return rules;
    } catch {
      this.dbRulesCache = { loadedAt: Date.now(), rules: [] };
      return [];
    }
  }

  private mapDbRule(row: Record<string, unknown>): AgentV2GrayRule | null {
    const mode = String(row.mode ?? '');
    if (!isGrayMode(mode)) return null;
    return {
      source: 'db',
      name: String(row.name ?? ''),
      mode,
      priority: Number(row.priority ?? 100),
      storeIds: this.arrayValue(row.storeIds),
      personaCodes: this.arrayValue(row.personaCodes).map(String),
      roles: this.arrayValue(row.roles).map(String),
      entrypoints: this.arrayValue(row.entrypoints).map(String),
      capabilityIds: this.arrayValue(row.capabilityIds).map(String),
    };
  }

  private arrayValue(value: unknown): Array<string | number> {
    return Array.isArray(value) ? value.map((item) => typeof item === 'number' ? item : String(item)).filter((item) => String(item).trim()) : [];
  }

  private toStrategy(
    mode: AgentV2GrayMode,
    source: AgentV2GrayStrategy['source'],
    reason: string,
    matchedRule?: string,
  ): AgentV2GrayStrategy {
    const guarded = this.guardLegacyRetiredMode(mode, reason);
    return {
      mode: guarded.mode,
      source,
      reason: guarded.reason,
      matchedRule,
      engine: guarded.mode === 'legacy_regex' ? 'legacy_regex' : guarded.mode === 'shadow' ? 'shadow' : 'kg_llm',
      allowLegacyFallback: guarded.mode === 'kg_llm_preferred' || guarded.mode === 'shadow',
      recordShadow: guarded.mode === 'shadow',
      legacyRetired: guarded.mode === 'legacy_retired',
    };
  }

  private guardLegacyRetiredMode(mode: AgentV2GrayMode, reason: string): { mode: AgentV2GrayMode; reason: string } {
    if (mode !== 'legacy_retired') return { mode, reason };
    if (!this.isProductionRuntime() || this.isTruthy(process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED)) {
      return { mode, reason };
    }
    return {
      mode: 'kg_llm_preferred',
      reason: `${reason} 生产 legacy_retired 需要 AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true；当前自动降级到 kg_llm_preferred，保留旧链路回退。`,
    };
  }

  private isProductionRuntime() {
    return String(process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private isTruthy(value: unknown) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
  }
}

export function isGrayMode(value: unknown): value is AgentV2GrayMode {
  return (
    value === 'legacy_regex' ||
    value === 'shadow' ||
    value === 'kg_llm_preferred' ||
    value === 'kg_llm_only' ||
    value === 'legacy_retired'
  );
}

export function defaultAgentV2GrayMode(): { mode: AgentV2GrayMode; reason: string } {
  const runtimeEnv = String(process.env.NODE_ENV ?? '').trim().toLowerCase();
  if (runtimeEnv === 'development' || runtimeEnv === 'test') {
    return {
      mode: 'kg_llm_preferred',
      reason: '非生产环境默认进入 kg_llm_preferred，保留旧链路回退。',
    };
  }
  return {
    mode: 'legacy_regex',
    reason: '生产或未知环境默认保持旧正则正式链路。',
  };
}
