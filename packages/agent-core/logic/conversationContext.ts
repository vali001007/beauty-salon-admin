import type { ActiveEntities, ConversationContext, RecentTurn } from '../types/conversation';
import type { AgentEvidence, AgentPlan, AgentSuggestedAction, AgentToolResult } from '../types/result';

const MAX_TURNS = 6;

export function createConversationContext(role: string, storeId?: number): ConversationContext {
  return {
    sessionId: `session_${Date.now()}`,
    role,
    storeId,
    recentTurns: [],
    activeEntities: {},
  };
}

export function updateConversationContext(
  ctx: ConversationContext,
  turn: { userInput: string; resolvedAction?: string | null; action?: string | null; responseText?: string; runId?: number | null },
): ConversationContext {
  const keyEntities = extractKeyEntities(turn.userInput, turn.responseText);
  const resolvedAction = turn.resolvedAction ?? turn.action ?? null;
  const now = Date.now();
  const newTurn: RecentTurn = {
    userInput: turn.userInput,
    resolvedAction,
    action: resolvedAction,
    keyEntities,
    runId: turn.runId,
    timestamp: now,
    createdAt: new Date(now).toISOString(),
  };

  const recentTurns = [...ctx.recentTurns, newTurn].slice(-MAX_TURNS);
  const activeEntities: ActiveEntities = {
    ...ctx.activeEntities,
    ...(keyEntities.customer ? { customer: keyEntities.customer as ActiveEntities['customer'] } : {}),
    ...(keyEntities.appointment ? { appointment: keyEntities.appointment as ActiveEntities['appointment'] } : {}),
    ...(keyEntities.dateRange ? { dateRange: keyEntities.dateRange as ActiveEntities['dateRange'] } : {}),
    ...(keyEntities.beautician ? { beautician: keyEntities.beautician as ActiveEntities['beautician'] } : {}),
    ...(keyEntities.product ? { product: keyEntities.product as ActiveEntities['product'] } : {}),
  };

  if (activeEntities.customer) {
    activeEntities.customerId = activeEntities.customer.id;
    activeEntities.customerName = activeEntities.customer.name;
  }
  if (activeEntities.product) {
    activeEntities.productId = activeEntities.product.id;
    activeEntities.productName = activeEntities.product.name;
  }

  return { ...ctx, recentTurns, activeEntities };
}

export function resolvePronouns(input: string, ctx: ConversationContext): string {
  const { activeEntities } = ctx;
  let resolved = input;

  const pronounsForCustomer = ['她', '他', '这位顾客', '这个客户', '那位', '上面那个'];
  const hasCustomerPronoun = pronounsForCustomer.some((pronoun) => resolved.includes(pronoun));
  const customer = activeEntities.customer ?? (
    activeEntities.customerName
      ? { id: activeEntities.customerId ?? 'unknown', name: String(activeEntities.customerName) }
      : undefined
  );

  if (hasCustomerPronoun && customer) {
    for (const pronoun of pronounsForCustomer) {
      resolved = resolved.replace(new RegExp(pronoun, 'g'), `${customer.name}（客户ID:${customer.id}）`);
    }
  }

  return resolved;
}

export function buildContextSummary(ctx: ConversationContext): string {
  const parts: string[] = [];
  const customer = ctx.activeEntities.customer ?? (
    ctx.activeEntities.customerName
      ? { id: ctx.activeEntities.customerId ?? 'unknown', name: String(ctx.activeEntities.customerName) }
      : undefined
  );

  if (customer) {
    parts.push(`当前关注客户：${customer.name}（ID:${customer.id}）`);
  }
  if (ctx.activeEntities.dateRange) {
    parts.push(`当前时间范围：${ctx.activeEntities.dateRange.from} 至 ${ctx.activeEntities.dateRange.to}`);
  }
  if (ctx.activeEntities.beautician) {
    parts.push(`当前关注美容师：${ctx.activeEntities.beautician.name}`);
  }
  if (ctx.activeEntities.product) {
    parts.push(`当前关注商品：${ctx.activeEntities.product.name}`);
  }

  if (ctx.recentTurns.length > 0) {
    const lastTurn = ctx.recentTurns[ctx.recentTurns.length - 1];
    const action = lastTurn.resolvedAction ?? lastTurn.action;
    if (action) {
      parts.push(`上一个操作：${action}`);
    }
  }

  return parts.length > 0 ? `[上下文] ${parts.join('；')}` : '';
}

export function resetConversationContext(ctx: ConversationContext): ConversationContext {
  return {
    ...ctx,
    recentTurns: [],
    activeEntities: {},
  };
}

export interface AgentRunContextSource {
  runId: number;
  runNo?: string;
  status?: string;
  plan?: AgentPlan;
  toolResults?: AgentToolResult[];
  actions?: AgentSuggestedAction[];
  evidence?: AgentEvidence;
}

export interface LatestAgentContextOptions<TMessage, TBusinessQuery = unknown> {
  getAgentRun(message: TMessage): AgentRunContextSource | null | undefined;
  getBusinessQuery?: (message: TMessage) => TBusinessQuery | null | undefined;
}

export function buildPreviousRunContext(run: AgentRunContextSource): Record<string, unknown> {
  return {
    previousRun: {
      runId: run.runId,
      runNo: run.runNo,
      status: run.status,
      plan: run.plan,
      toolResults: run.toolResults,
      actions: run.actions,
      evidence: run.evidence,
    },
  };
}

export function getLatestAgentContextFromMessages<TMessage, TBusinessQuery = unknown>(
  messages: TMessage[],
  options: LatestAgentContextOptions<TMessage, TBusinessQuery>,
): Record<string, unknown> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const agentRun = options.getAgentRun(message);
    if (agentRun) return buildPreviousRunContext(agentRun);
    const businessQuery = options.getBusinessQuery?.(message);
    if (businessQuery) return { previousBusinessQuery: businessQuery };
  }
  return undefined;
}

function extractKeyEntities(input: string, responseText?: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};

  const monthMatch = input.match(/(\d{1,2})月/);
  if (monthMatch) {
    const month = parseInt(monthMatch[1], 10);
    const year = new Date().getFullYear();
    entities.dateRange = {
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: `${year}-${String(month).padStart(2, '0')}-31`,
    };
  }

  if (responseText) {
    const customerMatch = responseText.match(/客户[：:]\s*([^\s，。]+)/);
    if (customerMatch) {
      entities.customerHint = customerMatch[1];
    }
  }

  return entities;
}
