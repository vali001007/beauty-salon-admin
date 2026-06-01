import type { AuraAction } from "../../../../../src/types/aura";
import type { Role, RoleDefinition } from "../types";
import { getCommandByAction } from "./commandRegistry";
import type { AuraCommandSource, AuraResolvedIntent } from "./intentTypes";
import { buildSlots, extractCustomerKeyword, normalizeCommandText } from "./slotUtils";

function buildResolvedIntent(params: {
  action: AuraResolvedIntent["action"];
  role: Role;
  source: AuraCommandSource;
  command: string;
  confidence?: number;
  showUserCommand?: boolean;
  loadingLabel?: string;
  deniedReason?: string;
}): AuraResolvedIntent {
  const actionText = params.action ?? "";
  const commandDefinition = actionText ? getCommandByAction(actionText) : undefined;
  const slots = buildSlots(params.command);

  if (actionText.startsWith("customer:")) {
    slots.customerName = actionText.slice("customer:".length) || extractCustomerKeyword(params.command);
    return {
      name: "customer.search",
      role: params.role,
      action: params.action,
      source: params.source,
      confidence: params.confidence ?? 0.86,
      slots,
      missingSlots: slots.customerName ? [] : ["customerName"],
      riskLevel: "none",
      requiresConfirmation: false,
      showUserCommand: params.showUserCommand ?? true,
      loadingLabel: params.loadingLabel ?? "正在调取客户档案",
      deniedReason: params.deniedReason,
    };
  }

  if (actionText.startsWith("appointment:")) {
    const [, operation, idText] = actionText.split(":");
    const appointmentId = Number(idText);
    const intentMap = {
      confirm: "appointment.confirm",
      reschedule: "appointment.reschedule",
      cancel: "appointment.cancel",
      checkin: "appointment.check_in",
    } as const;
    return {
      name: intentMap[operation as keyof typeof intentMap] ?? "appointment.today.view",
      role: params.role,
      action: params.action,
      source: params.source,
      confidence: params.confidence ?? 1,
      slots: { ...slots, appointmentId },
      missingSlots: appointmentId ? [] : ["appointmentId"],
      riskLevel: operation === "cancel" || operation === "reschedule" ? "medium" : "low",
      requiresConfirmation: operation === "cancel" || operation === "reschedule",
      showUserCommand: params.showUserCommand ?? false,
      loadingLabel: params.loadingLabel ?? "正在处理预约",
      deniedReason: params.deniedReason,
    };
  }

  return {
    name: commandDefinition?.intent ?? "unknown.clarify",
    role: params.role,
    action: params.action,
    source: params.source,
    confidence: params.confidence ?? (commandDefinition ? 0.95 : 0.3),
    slots,
    missingSlots: [],
    riskLevel: commandDefinition?.riskLevel ?? "none",
    requiresConfirmation: commandDefinition?.requiresConfirmation ?? false,
    showUserCommand: params.showUserCommand ?? true,
    loadingLabel: params.loadingLabel ?? commandDefinition?.loadingLabel ?? "正在处理指令",
    deniedReason: params.deniedReason,
  };
}

function isActionAllowed(action: string, definition: RoleDefinition) {
  if (action.startsWith("customer:") || action.startsWith("appointment:")) return true;
  return (definition.availableActions as string[]).includes(action);
}

function withPermissionCheck(
  action: AuraResolvedIntent["action"],
  role: Role,
  definition: RoleDefinition,
  command: string,
  source: AuraCommandSource,
  showUserCommand: boolean,
) {
  if (action && !isActionAllowed(action, definition)) {
    return buildResolvedIntent({
      action: null,
      role,
      source,
      command,
      showUserCommand,
      deniedReason: `当前角色「${definition.title}」无权执行该操作。`,
      loadingLabel: "正在检查权限",
      confidence: 1,
    });
  }

  return buildResolvedIntent({ action, role, source, command, showUserCommand });
}

export function parseRuleIntent(command: string, role: Role, definition: RoleDefinition, source: AuraCommandSource) {
  const text = normalizeCommandText(command);

  if (!text) {
    return withPermissionCheck(definition.availableActions[0] ?? "reception.appointments", role, definition, command, source, false);
  }

  if ((definition.availableActions as string[]).includes(text)) {
    return withPermissionCheck(text as AuraAction, role, definition, command, source, false);
  }

  if (text.startsWith("appointment:")) {
    return withPermissionCheck(text as `appointment:${string}:${number}`, role, definition, command, source, false);
  }

  const quickMatch = definition.quickActions.find((item) => text === item.label || text.includes(item.label));
  if (quickMatch) {
    return withPermissionCheck(quickMatch.action, role, definition, command, source, false);
  }

  if (text.includes("经营") || text.includes("报表") || text.includes("概览") || text.includes("今日经营")) {
    return withPermissionCheck("manager.dashboard", role, definition, command, source, true);
  }
  if (text.includes("员工") || text.includes("排班") || text.includes("绩效")) {
    return withPermissionCheck("manager.staff", role, definition, command, source, true);
  }
  if (text.includes("流失") || text.includes("增长") || text.includes("高价值")) {
    return withPermissionCheck("manager.customers", role, definition, command, source, true);
  }
  if (text.includes("库存") || text.includes("补货") || text.includes("临期")) {
    return withPermissionCheck("manager.inventory", role, definition, command, source, true);
  }

  if (text.includes("预约")) {
    return withPermissionCheck(role === "beautician" ? "beautician.schedule" : "reception.appointments", role, definition, command, source, true);
  }
  if (text.includes("核销")) return withPermissionCheck("operation.verify", role, definition, command, source, true);
  if (text.includes("登记") || text.includes("新增客户")) return withPermissionCheck("operation.register", role, definition, command, source, true);
  if (text.includes("收银") || text.includes("开单")) return withPermissionCheck("operation.cashier", role, definition, command, source, true);
  if (text.includes("办卡") || text.includes("开卡")) return withPermissionCheck("operation.card", role, definition, command, source, true);
  if (text.includes("充值")) return withPermissionCheck("operation.recharge", role, definition, command, source, true);
  if (text.includes("打印")) return withPermissionCheck("operation.print", role, definition, command, source, true);
  if (text.includes("完成服务")) return withPermissionCheck("operation.service-complete", role, definition, command, source, true);
  if (text.includes("客户档案") || text.includes("皮肤") || text.includes("服务记录")) {
    return withPermissionCheck("beautician.customer", role, definition, command, source, true);
  }
  if (text.includes("护理建议") || text.includes("适合做什么护理")) {
    return withPermissionCheck("beautician.advice", role, definition, command, source, true);
  }
  if (text.startsWith("查") || text.includes("客户")) {
    const keyword = extractCustomerKeyword(text) ?? text;
    return withPermissionCheck(`customer:${keyword}`, role, definition, command, source, true);
  }

  return buildResolvedIntent({
    action: null,
    role,
    source,
    command,
    showUserCommand: true,
    loadingLabel: "正在理解指令",
    confidence: 0.35,
  });
}
