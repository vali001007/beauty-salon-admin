import { Injectable } from '@nestjs/common';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainDomainAnswer } from '../domain/brain-domain-adapter.types.js';
import type { BrainCompletionResult } from '../execution/brain-completion-verifier.service.js';
import type { BrainObservation } from '../execution/brain-observation.service.js';
import { BrainAnswerCompletionGuardService } from './brain-answer-completion-guard.service.js';
import type { BrainResponseBlock, BrainResponseEnvelope } from './brain-response.types.js';

@Injectable()
export class BrainGroundedAnswerComposerService {
  constructor(private readonly guard: BrainAnswerCompletionGuardService) {}

  compose(input: {
    observations: readonly BrainObservation[];
    completion: Pick<BrainCompletionResult, 'status' | 'missingCriteria'>;
    intent?: Pick<BrainSemanticIntent, 'intent' | 'answerShape' | 'comparisonTarget'>;
  }): BrainResponseEnvelope {
    const completed = input.observations.filter(
      (item) => item.status === 'completed' || (item.status === 'no_data' && item.grounding !== 'none'),
    );
    const citations = uniqueCitations(completed.flatMap((item) => [...item.citations]));
    const blocks: BrainResponseBlock[] = [];
    const limitations = [...input.completion.missingCriteria];

    for (const observation of completed) {
      const citationIds = observation.citations.map((citation) => citation.sourceId);
      const sourceBlocks = Array.isArray(observation.data.blocks) ? observation.data.blocks : [];
      const blockCountBeforeObservation = blocks.length;
      for (const value of sourceBlocks) {
        const block = normalizeBlock(value, citationIds, limitations);
        if (block?.kind === 'action_preview') appendActionPreview(blocks, block.actions);
        else if (block) blocks.push(block);
      }
      const observationBlocks = blocks.slice(blockCountBeforeObservation);
      const onlyEmptyCollections = observationBlocks.length > 0 && observationBlocks.every(
        (block) => (block.kind === 'ranking' || block.kind === 'table') && block.rows.length === 0,
      );
      if (
        (blocks.length === blockCountBeforeObservation || (observation.status === 'no_data' && onlyEmptyCollections)) &&
        observation.summary.trim() &&
        (citationIds.length || observation.grounding === 'template_skill')
      ) {
        blocks.push({ kind: 'text', text: observation.summary.trim(), ...(citationIds.length ? { citationIds } : {}) });
      }
      const actions = Array.isArray(observation.data.suggestedActions) ? observation.data.suggestedActions : [];
      if (actions.length) appendActionPreview(blocks, actions);
    }
    if (limitations.length) blocks.push({ kind: 'limitations', items: [...new Set(limitations)] });
    if (citations.length) blocks.push({ kind: 'evidence', citations });

    const answer = blocks.map(renderBlockText).filter(Boolean).join('\n\n') ||
      (input.completion.status === 'complete' ? '已完成经营任务，结构化结果见下方。' : '已返回可完成部分，未完成范围见下方。');
    const envelope: BrainResponseEnvelope = {
      answer,
      blocks,
      citations,
      suggestedActions: uniqueActions(
        blocks.filter((block) => block.kind === 'action_preview').flatMap((block) => block.actions),
      ),
      completion: { status: input.completion.status, missingCriteria: [...input.completion.missingCriteria] },
    };
    this.guard.assertValid(envelope);
    if (input.intent) this.guard.assertMatchesIntent(input.intent, envelope);
    return envelope;
  }

  composeDomainAnswer(
    answer: BrainDomainAnswer,
    intent?: Pick<BrainSemanticIntent, 'intent' | 'answerShape' | 'comparisonTarget'>,
  ): BrainResponseEnvelope {
    const observation: BrainObservation = {
      nodeId: 'single_capability',
      capabilityKey: String(answer.metadata?.capabilityKey ?? 'single_capability'),
      capabilityVersion: Number(answer.metadata?.capabilityVersion ?? 1),
      status: answer.status === 'completed' ? 'completed' : 'failed',
      grounding: answer.grounding,
      summary: answer.answer,
      data: { blocks: answer.blocks ?? [], metadata: answer.metadata ?? {}, suggestedActions: answer.suggestedActions ?? [] },
      citations: answer.citations,
      startedAt: new Date(0).toISOString(),
      completedAt: new Date(0).toISOString(),
    };
    return this.compose({
      observations: [observation],
      completion: answer.status === 'completed'
        ? { status: 'complete', missingCriteria: [] }
        : { status: 'incomplete', missingCriteria: ['capability_failed'] },
      intent,
    });
  }
}

function appendActionPreview(blocks: BrainResponseBlock[], actions: unknown[]) {
  const normalized = uniqueActions(actions);
  if (!normalized.length) return;
  const existing = blocks.find((block) => block.kind === 'action_preview');
  if (existing?.kind === 'action_preview') {
    existing.actions = uniqueActions([...existing.actions, ...normalized]);
    return;
  }
  blocks.push({ kind: 'action_preview', actions: normalized });
}

function uniqueActions(actions: unknown[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const record = isRecord(action) ? action : undefined;
    const actionId = record && typeof record.actionId === 'string' ? record.actionId : undefined;
    const key = actionId ? `actionId:${actionId}` : JSON.stringify(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBlock(value: unknown, citationIds: string[], limitations: string[]): BrainResponseBlock | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const block = value as Record<string, unknown>;
  if (block.kind === 'ranking') {
    const rows = Array.isArray(block.rows) ? block.rows.filter(isRecord) : [];
    if (!rows.length) {
      limitations.push('no_data:ranking');
    }
    return { kind: 'ranking', rows, columns: stringArray(block.columns), citationIds };
  }
  if (block.kind === 'table') {
    const rows = Array.isArray(block.rows) ? block.rows.filter(isRecord) : [];
    if (!rows.length) limitations.push('no_data:table');
    return { kind: 'table', rows, columns: stringArray(block.columns), citationIds };
  }
  if (block.kind === 'kpi') {
    const items = Array.isArray(block.items)
      ? block.items.flatMap((item) => isRecord(item) && typeof item.label === 'string' && typeof item.value === 'string'
        ? [{ label: item.label, value: item.value, ...(typeof item.hint === 'string' ? { hint: item.hint } : {}) }]
        : [])
      : [];
    return items.length ? { kind: 'kpi', items, citationIds } : undefined;
  }
  if (block.kind === 'chart') {
    const rows = Array.isArray(block.rows) ? block.rows.filter(isRecord) : [];
    const chartType = block.chartType === 'bar' || block.chartType === 'line' ? block.chartType : undefined;
    const xKey = typeof block.xKey === 'string' ? block.xKey : undefined;
    const yKeys = stringArray(block.yKeys);
    return chartType && xKey && yKeys.length && rows.length
      ? { kind: 'chart', chartType, rows, xKey, yKeys, citationIds }
      : undefined;
  }
  if (block.kind === 'comparison') {
    const items = Array.isArray(block.items)
      ? block.items.flatMap((item) => {
          if (!isRecord(item) || typeof item.label !== 'string' || typeof item.current !== 'string' || typeof item.previous !== 'string') {
            return [];
          }
          return [{
            label: item.label,
            current: item.current,
            previous: item.previous,
            ...(typeof item.delta === 'string' ? { delta: item.delta } : {}),
          }];
        })
      : [];
    return items.length ? { kind: 'comparison', items, citationIds } : undefined;
  }
  if (block.kind === 'diagnosis') {
    const findings = Array.isArray(block.findings)
      ? block.findings.flatMap((item) => {
          if (
            !isRecord(item) ||
            typeof item.title !== 'string' ||
            typeof item.detail !== 'string' ||
            !['info', 'warning', 'critical'].includes(String(item.severity))
          ) {
            return [];
          }
          return [{
            title: item.title,
            detail: item.detail,
            severity: item.severity as 'info' | 'warning' | 'critical',
          }];
        })
      : [];
    return findings.length ? { kind: 'diagnosis', findings, citationIds } : undefined;
  }
  if (block.kind === 'clarification' && typeof block.question === 'string') {
    const options = Array.isArray(block.options)
      ? block.options.flatMap((item) =>
          isRecord(item) && typeof item.id === 'string' && typeof item.label === 'string'
            ? [{ id: item.id, label: item.label, value: item.value }]
            : [],
        )
      : [];
    return { kind: 'clarification', question: block.question, options };
  }
  if (block.kind === 'action_preview') {
    return { kind: 'action_preview', actions: Array.isArray(block.actions) ? block.actions : [] };
  }
  if (block.kind === 'limitations') {
    limitations.push(...stringArray(block.items));
    return undefined;
  }
  if (block.kind === 'evidence') return undefined;
  if (block.kind === 'text' && typeof block.text === 'string') return { kind: 'text', text: block.text, citationIds };
  return undefined;
}

function renderBlockText(block: BrainResponseBlock): string {
  if (block.kind === 'text') return block.text.trim();
  if (block.kind === 'kpi') {
    return block.items.map((item) => `${item.label}：${item.value}${item.hint ? `（${item.hint}）` : ''}`).join('；') + '。';
  }
  if (block.kind === 'ranking') {
    if (!block.rows.length) return '排行：当前时间范围没有可排行的数据。';
    return `排行：\n${block.rows.map((row, index) => `${index + 1}. ${renderRow(row, block.columns)}`).join('\n')}`;
  }
  if (block.kind === 'table') {
    if (!block.rows.length) return '明细：当前没有匹配数据。';
    return `明细：\n${block.rows.map((row, index) => `${index + 1}. ${renderRow(row, block.columns)}`).join('\n')}`;
  }
  if (block.kind === 'chart') {
    return `${block.chartType === 'line' ? '趋势' : '分布'}数据：\n${block.rows
      .map((row, index) => `${index + 1}. ${renderRow(row, [block.xKey, ...block.yKeys])}`)
      .join('\n')}`;
  }
  if (block.kind === 'comparison') {
    return `对比：${block.items
      .map((item) => `${item.label}，当前 ${item.current}，上一期 ${item.previous}${item.delta ? `，变化 ${item.delta}` : ''}`)
      .join('；')}。`;
  }
  if (block.kind === 'diagnosis') {
    const severity = { info: '提示', warning: '预警', critical: '严重风险' } as const;
    return `诊断：\n${block.findings
      .map((item, index) => `${index + 1}. [${severity[item.severity]}] ${item.title}：${item.detail}`)
      .join('\n')}`;
  }
  if (block.kind === 'clarification') {
    const options = block.options.length ? ` 可选：${block.options.map((item) => item.label).join('、')}。` : '';
    return `需要确认：${block.question}${options}`;
  }
  if (block.kind === 'action_preview') return `待确认操作：共 ${block.actions.length} 项，尚未执行。`;
  if (block.kind === 'limitations') {
    const label = block.items.every((item) => item.startsWith('no_data:')) ? '说明' : '未完成范围';
    return `${label}：${block.items.map(renderLimitation).join('；')}。`;
  }
  if (block.kind === 'evidence') {
    return `数据依据：${block.citations.map((item) => item.label ?? item.sourceId).join('；')}。`;
  }
  return '';
}

function renderLimitation(value: string) {
  if (value === 'no_data:ranking') return '当前时间范围没有可排行的数据';
  if (value === 'no_data:table') return '当前时间范围没有匹配的明细数据';
  if (value === 'no_data:touch_preview') {
    return '当前能力只能为唯一客户生成触达预览，不能把上一轮客户群体直接群发；请改用已启用的自动触达策略并在发送前审批受众与渠道';
  }
  return value.replace(/[。；;]+$/u, '');
}

function renderRow(row: Record<string, unknown>, columns: string[]) {
  const keys = columns.length ? columns : Object.keys(row);
  return keys
    .filter((key) => row[key] !== undefined && !HIDDEN_TEXT_COLUMNS.has(key))
    .map((key) => `${COLUMN_LABELS[key] ?? key}=${renderColumnValue(key, row[key])}`)
    .join('，');
}

const COLUMN_LABELS: Readonly<Record<string, string>> = {
  name: '名称',
  value: '数值',
  project: '项目',
  projectName: '项目',
  projectType: '项目类型',
  price: '价格',
  recommended: '门店推荐',
  project_service_count: '服务次数',
  serviceCount: '服务次数',
  performanceScore: '员工表现评分',
  uniqueCustomerCount: '服务客户数',
  repeatCustomerCount: '复购客户数',
  revenueAmount: '业绩实收',
  commissionAmount: '提成金额',
  timeOffHours: '请假时长',
  date: '日期',
  day: '星期',
  revenue: '实收',
  currentDate: '本期日期',
  currentRevenue: '本期实收',
  previousDate: '上期日期',
  previousRevenue: '上期实收',
  delta: '差额',
  staff: '员工',
  appointmentCount: '预约数',
  status: '状态',
  nextAvailableAt: '下次可用时间',
  customer: '客户',
  customerName: '客户',
  tier: '消费层级',
  range: '消费范围',
  customerCount: '客户数',
  examples: '客户示例',
  basicProjects: '基础项目',
  lastVisitDate: '最近到店',
  memberLevel: '会员等级',
  totalSpent: '累计消费',
  matchReason: '匹配依据',
  customerSource: '客户来源',
  newCustomerCount: '新客数',
  timePeriod: '时间段',
  share: '占比',
  amount: '金额',
  startTime: '开始时间',
  appointmentTime: '预约时间',
  attentionItems: '注意事项',
  product: '商品',
  productName: '商品',
  product_sales_quantity: '销量',
  stock: '当前库存',
  currentStock: '当前库存',
  safetyStock: '安全库存',
  shortage: '缺口数量',
  outboundQty: '出库量',
  coverageDays: '可用天数',
  suggestedQty: '建议采购量',
  supplier: '供应商',
  estimatedCost: '预计成本',
  paymentMethod: '支付方式',
  count: '笔数',
  costCategory: '成本类别',
  priority: '优先级',
  opportunityType: '机会类型',
  score: '评分',
  channel: '渠道',
  reached: '触达人数',
  converted: '转化人数',
  conversionRate: '转化率',
  strategy: '策略',
  attributedRevenue: '归因收入',
  executionType: '执行方式',
  lastExecutedAt: '最近执行时间',
};

const HIDDEN_TEXT_COLUMNS = new Set(['productId', 'projectId', 'customerId', 'staffId', 'beauticianId']);

function renderValue(value: unknown) {
  if (value === null) return '空';
  if (value === '') return '暂无';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '[结构化值]';
}

function renderColumnValue(key: string, value: unknown) {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (
    typeof value === 'number' &&
    ['revenue', 'revenueAmount', 'commissionAmount', 'estimatedCost', 'amount', 'currentRevenue', 'previousRevenue', 'totalSpent', 'price'].includes(key)
  ) {
    return value.toFixed(2);
  }
  return renderValue(value);
}

function uniqueCitations(citations: BrainDomainAnswer['citations']) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.sourceType}:${citation.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
