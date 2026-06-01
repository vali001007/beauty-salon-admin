import type { AuraResolvedIntent } from "../intent/intentTypes";
import {
  getBeauticianDashboard,
  getCardOpeningFlow,
  getCardVerificationFlow,
  getCashierFlow,
  getCustomerCard,
  getCustomerGrowthCandidates,
  getInventoryAlerts,
  getManagerDashboard,
  getOperationResult,
  getReceptionDashboard,
  getRechargeFlow,
  getRegistrationFlow,
  getStaffSchedules,
  updateAppointmentAction,
} from "../services/auraCoreService";
import type { MicroAppRunResult } from "./microAppTypes";

export async function runMicroAppIntent(intent: AuraResolvedIntent, command: string): Promise<MicroAppRunResult> {
  const action = intent.action;

  if (intent.deniedReason) {
    return {
      messages: [{ type: "error", payload: { text: intent.deniedReason, source: "permission" } }],
    };
  }

  if (!action) {
    return {
      messages: [
        {
          type: "error",
          payload: {
            text: "暂时无法识别这个指令。可以试试：今日预约、核销次卡、收银、办卡、充值、客户登记。",
            source: "intent",
          },
        },
      ],
    };
  }

  if (action === "manager.dashboard") {
    const data = await getManagerDashboard();
    return { messages: [{ type: "dashboard", payload: { kind: "manager", data } }], aiSummary: data.summary, aiCommand: command };
  }

  if (action === "manager.staff") {
    const data = await getStaffSchedules();
    return {
      messages: [{ type: "dashboard", payload: { kind: "staff", data } }],
      aiSummary: `员工排班共 ${data.length} 人，优先关注占用率和服务状态。`,
      aiCommand: command,
    };
  }

  if (action === "manager.customers") {
    const data = await getCustomerGrowthCandidates();
    return {
      messages: [{ type: "dashboard", payload: { kind: "growth", data } }],
      aiSummary: `筛选出 ${data.length} 位客户增长或流失风险对象。`,
      aiCommand: command,
    };
  }

  if (action === "manager.inventory") {
    const data = await getInventoryAlerts();
    return { messages: [{ type: "dashboard", payload: { kind: "inventory", data } }], aiSummary: data.summary, aiCommand: command };
  }

  if (action === "reception.appointments") {
    const data = await getReceptionDashboard();
    return { messages: [{ type: "dashboard", payload: { kind: "reception", data } }], aiSummary: data.summary, aiCommand: command };
  }

  if (action === "operation.verify") {
    const data = await getCardVerificationFlow();
    return { messages: [{ type: "cardVerification", payload: { kind: "cardVerification", data } }] };
  }

  if (action === "operation.cashier") {
    const data = await getCashierFlow();
    return { messages: [{ type: "cashier", payload: { kind: "cashier", data } }] };
  }

  if (action === "operation.card") {
    const data = await getCardOpeningFlow();
    return { messages: [{ type: "cardOpening", payload: { kind: "cardOpening", data } }] };
  }

  if (action === "operation.register") {
    const data = await getRegistrationFlow();
    return { messages: [{ type: "registration", payload: { kind: "registration", data } }] };
  }

  if (action === "operation.recharge") {
    const data = await getRechargeFlow();
    return { messages: [{ type: "recharge", payload: { kind: "recharge", data } }] };
  }

  if (action === "beautician.schedule") {
    const data = await getBeauticianDashboard();
    return { messages: [{ type: "dashboard", payload: { kind: "beautician", data } }], aiSummary: data.summary, aiCommand: command };
  }

  if (action === "beautician.customer" || action.startsWith("customer:")) {
    const keyword = action.startsWith("customer:") ? action.slice("customer:".length) : command;
    const data = await getCustomerCard(keyword);
    if (!data) {
      return { messages: [{ type: "error", payload: { text: "未找到匹配客户", source: "core" } }] };
    }
    return { messages: [{ type: "dashboard", payload: { kind: "customer", data } }], aiSummary: data.summary, aiCommand: command };
  }

  if (action === "beautician.advice") {
    const data = await getCustomerCard();
    if (!data) {
      return { messages: [{ type: "error", payload: { text: "暂无可生成护理建议的客户档案", source: "core" } }] };
    }

    return {
      messages: [
        {
          type: "dashboard",
          payload: {
            kind: "customer",
            data: {
              ...data,
              summary: `${data.customer.name} 的护理建议已基于 Ami_Core 档案生成，重点关注 ${
                data.customer.skinCondition ?? "当前皮肤状态"
              }。`,
            },
          },
        },
      ],
      aiSummary: data.summary,
      aiCommand: command,
    };
  }

  if (action === "beautician.record") {
    const data = await getOperationResult("operation.service-complete");
    return { messages: [{ type: "operation", payload: { kind: "operation", data } }] };
  }

  if (action.startsWith("appointment:")) {
    const data = await updateAppointmentAction(action);
    const latest = await getReceptionDashboard();
    return {
      messages: [
        { type: "operation", payload: { kind: "operation", data } },
        { type: "dashboard", payload: { kind: "reception", data: latest } },
      ],
    };
  }

  const data = await getOperationResult(action);
  return { messages: [{ type: "operation", payload: { kind: "operation", data } }] };
}

