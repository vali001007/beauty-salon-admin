import type { RoleDefinition } from "../types";
import { resolveTerminalIntent } from "@/api";
import type { AuraAction } from "@/types/aura";
import { getCommandByAction } from "./commandRegistry";
import type { AuraCommandSource } from "./intentTypes";
import type { AuraResolvedIntent } from "./intentTypes";
import { parseRuleIntent } from "./ruleIntentParser";
import { buildSlots } from "./slotUtils";

const MIN_AI_CONFIDENCE = 0.65;

function getDefaultAction(role: RoleDefinition["role"], definition: RoleDefinition): AuraAction | null {
  const preferred =
    role === "manager" ? "manager.dashboard" : role === "beautician" ? "beautician.schedule" : "reception.appointments";
  return (definition.availableActions as string[]).includes(preferred)
    ? (preferred as AuraAction)
    : (definition.availableActions[0] ?? null);
}

function buildResolvedFromAction(params: {
  command: string;
  role: RoleDefinition["role"];
  source: AuraCommandSource;
  action: AuraAction | null;
  confidence: number;
  slots?: Record<string, unknown>;
  missingSlots?: string[];
  reason?: string;
}): AuraResolvedIntent {
  const commandDefinition = params.action ? getCommandByAction(params.action) : undefined;
  return {
    name: commandDefinition?.intent ?? "unknown.clarify",
    role: params.role,
    action: params.action,
    source: params.source,
    confidence: params.confidence,
    slots: {
      ...buildSlots(params.command),
      ...(params.slots ?? {}),
    },
    missingSlots: params.missingSlots ?? [],
    riskLevel: commandDefinition?.riskLevel ?? "none",
    requiresConfirmation: commandDefinition?.requiresConfirmation ?? false,
    showUserCommand: true,
    loadingLabel: commandDefinition?.loadingLabel ?? "正在处理指令",
    deniedReason: params.action ? undefined : params.reason,
  };
}

function buildRuleDefault(params: {
  command: string;
  role: RoleDefinition["role"];
  definition: RoleDefinition;
  source: AuraCommandSource;
}) {
  return buildResolvedFromAction({
    command: params.command,
    role: params.role,
    source: params.source,
    action: getDefaultAction(params.role, params.definition),
    confidence: 0.45,
    reason: "AI 意图解析暂不可用，已回退到当前角色默认入口",
  });
}

export async function parseAiIntentFallback(params: {
  command: string;
  role: RoleDefinition["role"];
  definition: RoleDefinition;
  source: AuraCommandSource;
}) {
  try {
    const result = await resolveTerminalIntent({
      role: params.role,
      command: params.command,
      availableActions: params.definition.availableActions,
      quickActions: params.definition.quickActions.map((item) => ({
        label: item.label,
        action: item.action,
      })),
      currentStoreName: undefined,
    });

    const allowed = new Set(params.definition.availableActions as string[]);
    const action = result.action && allowed.has(result.action) ? (result.action as AuraAction) : null;
    if (!action || result.confidence < MIN_AI_CONFIDENCE) {
      return buildRuleDefault(params);
    }

    return buildResolvedFromAction({
      command: params.command,
      role: params.role,
      source: params.source,
      action,
      confidence: result.confidence,
      slots: result.slots,
      missingSlots: result.missingSlots,
      reason: result.reason,
    });
  } catch (error) {
    console.warn("Ami Aura Lite AI 意图解析失败，已回退到规则入口", error);
    const ruleResult = parseRuleIntent(params.command, params.role, params.definition, params.source);
    return ruleResult.name === "unknown.clarify" ? buildRuleDefault(params) : ruleResult;
  }
}
