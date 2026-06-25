import type { AuraResolvedIntent, ResolveIntentOptions } from "./intentTypes";
import { parseQuickActionIntent, parseRuleIntent } from "./ruleIntentParser";
import { parseAiIntentFallback } from "./aiIntentParser";
import type { ConversationContext } from "./conversationContext";
import { resolvePronouns, buildContextSummary } from "./conversationContext";

/**
 * 意图解析路由（AI 优先策略）
 *
 * 路由优先级：
 * 1. quick_action → parseQuickActionIntent（规则快捷路，直接映射，无需 AI）
 * 2. 系统命令（锁屏/切角色）→ parseRuleIntent（高确定性规则）
 * 3. text/voice → AI 意图解析（parseAiIntentFallback）+ 对话上下文注入
 *    - 代词解析：把"她/他/这位"替换为活跃实体
 *    - 上下文摘要：注入最近操作和活跃实体
 * 4. system → parseRuleIntent
 *
 * 与旧版差异：旧版 text/voice 走 isBusinessRelevant 关键词判断，
 * 新版一律走 AI 解析，AI 失败时才 fallback 到 business.query 通道。
 */
export async function resolveCommandIntent(
  options: ResolveIntentOptions,
  conversationContext?: ConversationContext,
): Promise<AuraResolvedIntent> {
  const source = options.source ?? "text";

  // 1. 快捷操作直接分发，不走 AI
  if (source === "quick_action") {
    return parseQuickActionIntent(options.command, options.role, options.definition);
  }

  // 2. 系统命令（system source）走规则
  if (source === "system") {
    return parseRuleIntent(options.command, options.role, options.definition, source);
  }

  // 3. text / voice → AI 优先解析
  if (source === "text" || source === "voice") {
    // 代词解析：把"她/他/这位顾客"替换为活跃实体
    let resolvedCommand = options.command;
    if (conversationContext) {
      resolvedCommand = resolvePronouns(options.command, conversationContext);
    }

    // 上下文摘要注入（作为额外 hint 传给 AI 解析）
    const contextHint = conversationContext ? buildContextSummary(conversationContext) : "";
    const commandWithContext = contextHint
      ? `${resolvedCommand}\n${contextHint}`
      : resolvedCommand;

    return parseAiIntentFallback({
      command: commandWithContext,
      role: options.role,
      definition: options.definition,
      source,
    });
  }

  // 4. 其他 source 走规则兜底
  return parseRuleIntent(options.command, options.role, options.definition, source);
}

export function shouldDisplayUserCommand(intent: AuraResolvedIntent) {
  const fixedFlowActions = new Set([
    "operation.verify",
    "operation.register",
    "operation.cashier",
    "operation.card",
    "operation.recharge",
    "operation.print",
    "operation.service-complete",
    "customer.followup",
    "reception.appointments",
    "beautician.schedule",
    "beautician.commission",
    "beautician.customer",
    "beautician.record",
    "beautician.advice",
  ]);
  return (
    (intent.source === "text" || intent.source === "voice") &&
    intent.showUserCommand &&
    !intent.action?.startsWith("appointment:") &&
    (!intent.action || !fixedFlowActions.has(intent.action))
  );
}

