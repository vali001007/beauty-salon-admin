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

const RULE_KEYWORDS: Array<{ action: AuraAction; roles?: Role[]; keywords: string[] }> = [
  {
    action: "manager.dashboard",
    roles: ["manager"],
    keywords: ["经营", "报表", "概览", "今日经营", "今天怎么样", "业绩", "营业额", "收入", "数据", "店里怎么样", "情况"],
  },
  {
    action: "manager.staff",
    roles: ["manager"],
    keywords: ["员工", "排班", "绩效", "人员", "今天谁在", "谁上班", "美容师", "忙不忙", "人手"],
  },
  {
    action: "manager.customers",
    roles: ["manager"],
    keywords: ["流失", "增长", "高价值", "没来", "很久没到店", "沉睡", "回访", "客户情况", "会员情况", "老客"],
  },
  {
    action: "manager.inventory",
    roles: ["manager"],
    keywords: ["库存", "补货", "临期", "缺货", "快用完", "过期", "库存预警", "耗材", "产品不够"],
  },
  {
    action: "beautician.schedule",
    roles: ["beautician"],
    keywords: ["我今天做什么", "我的客户", "我的预约", "今天安排", "我排了什么", "我的排班", "今天服务谁"],
  },
  {
    action: "beautician.record",
    roles: ["beautician"],
    keywords: ["写记录", "补记录", "服务记录", "护理记录", "记录一下"],
  },
  {
    action: "beautician.customer",
    roles: ["beautician"],
    keywords: ["客户档案", "皮肤", "肤况", "上次做什么", "上次做了什么", "服务历史", "过敏", "禁忌"],
  },
  {
    action: "beautician.advice",
    roles: ["beautician"],
    keywords: ["护理建议", "适合做什么护理", "推荐什么", "适合做", "怎么护理", "下次做什么", "护理方案"],
  },
  {
    action: "reception.appointments",
    roles: ["reception", "manager"],
    keywords: ["预约", "有没有预约", "今天来几个", "排了什么", "到店", "今日预约", "确认预约", "爽约"],
  },
  {
    action: "operation.verify",
    keywords: ["核销", "扣次", "消次", "次卡使用", "用卡", "划次"],
  },
  {
    action: "operation.register",
    keywords: ["登记", "新增客户", "新客户", "没有档案", "建档", "录客户", "建个档"],
  },
  {
    action: "operation.cashier",
    keywords: ["收银", "开单", "买单", "结算", "多少钱", "付款", "支付", "收费"],
  },
  {
    action: "operation.card",
    keywords: ["办卡", "开卡", "买卡", "办张", "买张", "办张卡", "开一张", "开一张卡"],
  },
  {
    action: "operation.recharge",
    keywords: ["充值", "充钱", "储值", "充会员卡", "余额充值"],
  },
  {
    action: "operation.print",
    keywords: ["打印", "小票", "补打", "打票"],
  },
  {
    action: "operation.service-complete",
    keywords: ["完成服务", "服务做完", "结束服务", "做完了", "服务结束"],
  },
];

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function matchKeywordRule(text: string, role: Role) {
  return RULE_KEYWORDS.find((rule) => (!rule.roles || rule.roles.includes(role)) && hasAnyKeyword(text, rule.keywords));
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

  const keywordRule = matchKeywordRule(text, role);
  if (keywordRule) {
    return withPermissionCheck(keywordRule.action, role, definition, command, source, true);
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
