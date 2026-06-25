import type { Role } from '../types';

/**
 * 对话上下文管理
 *
 * 三层记忆：
 * - 短期：recentTurns（当前会话最近 6 轮，in-context）
 * - 中期：activeEntities（当前活跃的业务实体，用于代词解析）
 * - 长期：门店知识库（由后端 RAG 注入，前端侧不管理）
 */

export interface RecentTurn {
  userInput: string;
  resolvedAction: string | null;
  keyEntities: Record<string, unknown>;
  timestamp: number;
}

export interface ActiveEntities {
  customer?: { id: string | number; name: string };
  appointment?: { id: string | number; time?: string };
  dateRange?: { from: string; to: string };
  beautician?: { id: string | number; name: string };
  product?: { id: string | number; name: string };
}

export interface ConversationContext {
  sessionId: string;
  role: Role;
  storeId: number | undefined;
  recentTurns: RecentTurn[];
  activeEntities: ActiveEntities;
}

const MAX_TURNS = 6;

export function createConversationContext(role: Role, storeId?: number): ConversationContext {
  return {
    sessionId: `session_${Date.now()}`,
    role,
    storeId,
    recentTurns: [],
    activeEntities: {},
  };
}

/**
 * 每轮对话结束后更新上下文。
 * 提取关键实体并更新 activeEntities，保持 recentTurns 最近 6 条。
 */
export function updateConversationContext(
  ctx: ConversationContext,
  turn: { userInput: string; resolvedAction: string | null; responseText?: string },
): ConversationContext {
  const keyEntities = extractKeyEntities(turn.userInput, turn.responseText);
  const newTurn: RecentTurn = {
    userInput: turn.userInput,
    resolvedAction: turn.resolvedAction,
    keyEntities,
    timestamp: Date.now(),
  };

  const recentTurns = [...ctx.recentTurns, newTurn].slice(-MAX_TURNS);

  // 更新活跃实体：新轮次中的实体覆盖旧实体
  const activeEntities: ActiveEntities = {
    ...ctx.activeEntities,
    ...(keyEntities.customer ? { customer: keyEntities.customer as ActiveEntities['customer'] } : {}),
    ...(keyEntities.appointment ? { appointment: keyEntities.appointment as ActiveEntities['appointment'] } : {}),
    ...(keyEntities.dateRange ? { dateRange: keyEntities.dateRange as ActiveEntities['dateRange'] } : {}),
    ...(keyEntities.beautician ? { beautician: keyEntities.beautician as ActiveEntities['beautician'] } : {}),
  };

  return { ...ctx, recentTurns, activeEntities };
}

/**
 * 将代词（她/他/它/这位/上面那个）解析为活跃实体中的具体对象，
 * 并将其注入到用户输入中，让 AI 意图解析拿到完整信息。
 */
export function resolvePronouns(input: string, ctx: ConversationContext): string {
  const { activeEntities } = ctx;
  let resolved = input;

  const pronounsForCustomer = ['她', '他', '这位顾客', '这个客户', '那位', '上面那个'];
  const hasCustomerPronoun = pronounsForCustomer.some((p) => resolved.includes(p));

  if (hasCustomerPronoun && activeEntities.customer) {
    for (const p of pronounsForCustomer) {
      resolved = resolved.replace(new RegExp(p, 'g'), `${activeEntities.customer.name}（客户ID:${activeEntities.customer.id}）`);
    }
  }

  return resolved;
}

/**
 * 构建上下文摘要字符串，注入 AI 意图解析的 system prompt。
 * 只包含真正有用的上下文，避免噪音过多。
 */
export function buildContextSummary(ctx: ConversationContext): string {
  const parts: string[] = [];

  if (ctx.activeEntities.customer) {
    parts.push(`当前关注客户：${ctx.activeEntities.customer.name}（ID:${ctx.activeEntities.customer.id}）`);
  }
  if (ctx.activeEntities.dateRange) {
    parts.push(`当前时间范围：${ctx.activeEntities.dateRange.from} 至 ${ctx.activeEntities.dateRange.to}`);
  }
  if (ctx.activeEntities.beautician) {
    parts.push(`当前关注美容师：${ctx.activeEntities.beautician.name}`);
  }

  if (ctx.recentTurns.length > 0) {
    const lastTurn = ctx.recentTurns[ctx.recentTurns.length - 1];
    if (lastTurn.resolvedAction) {
      parts.push(`上一个操作：${lastTurn.resolvedAction}`);
    }
  }

  return parts.length > 0 ? `[上下文] ${parts.join('；')}` : '';
}

/** 重置对话上下文（用户主动清除时调用）*/
export function resetConversationContext(ctx: ConversationContext): ConversationContext {
  return {
    ...ctx,
    recentTurns: [],
    activeEntities: {},
  };
}

// ─── 内部工具 ──────────────────────────────────────────────────────────────────

function extractKeyEntities(input: string, responseText?: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};

  // 简单的日期范围提取（后续可扩展为 NLP）
  const monthMatch = input.match(/(\d{1,2})月/);
  if (monthMatch) {
    const month = parseInt(monthMatch[1], 10);
    const year = new Date().getFullYear();
    entities.dateRange = {
      from: `${year}-${String(month).padStart(2, '0')}-01`,
      to: `${year}-${String(month).padStart(2, '0')}-31`,
    };
  }

  // 从响应文本中提取提到的客户名（启发式，依赖后端更精确提取）
  // 生产环境应由后端在 renderedBlocks 中显式返回活跃实体
  if (responseText) {
    const customerMatch = responseText.match(/客户[：:]\s*([^\s，。]+)/);
    if (customerMatch) {
      entities.customerHint = customerMatch[1];
    }
  }

  return entities;
}
