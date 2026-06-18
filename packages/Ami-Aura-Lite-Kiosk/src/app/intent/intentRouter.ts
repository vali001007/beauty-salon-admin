import type { AuraResolvedIntent, ResolveIntentOptions } from "./intentTypes";
import { isBusinessRelevant } from "./relevanceGuard";
import { parseQuickActionIntent, parseRuleIntent } from "./ruleIntentParser";
import { buildSlots } from "./slotUtils";

function buildTextInputIntent(options: ResolveIntentOptions, source: "text" | "voice"): AuraResolvedIntent {
  const businessRelevant = isBusinessRelevant(options.command);
  const canAskBusinessQuery = (options.definition.availableActions as string[]).includes("business.query");

  if (businessRelevant && !canAskBusinessQuery) {
    return {
      name: "unknown.clarify",
      role: options.role,
      action: null,
      source,
      confidence: 1,
      slots: buildSlots(options.command),
      missingSlots: [],
      riskLevel: "none",
      requiresConfirmation: false,
      showUserCommand: true,
      loadingLabel: "正在理解问题",
      deniedReason: `当前角色「${options.definition.title}」无权执行该操作。`,
    };
  }

  return {
    name: businessRelevant ? "business_query.ask" : "unknown.clarify",
    role: options.role,
    action: businessRelevant ? "business.query" : null,
    source,
    confidence: businessRelevant ? 1 : 0.3,
    slots: buildSlots(options.command),
    missingSlots: [],
    riskLevel: "none",
    requiresConfirmation: false,
    showUserCommand: true,
    loadingLabel: businessRelevant ? "正在查询 Ami_Core 运营数据" : "正在基于 Ami_Core 生成回答",
  };
}

export async function resolveCommandIntent(options: ResolveIntentOptions): Promise<AuraResolvedIntent> {
  const source = options.source ?? "text";

  if (source === "quick_action") {
    return parseQuickActionIntent(options.command, options.role, options.definition);
  }

  if (source === "text" || source === "voice") {
    return buildTextInputIntent(options, source);
  }

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
