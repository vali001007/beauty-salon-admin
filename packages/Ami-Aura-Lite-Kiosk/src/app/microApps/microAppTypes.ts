import type {
  createAutomationDraft,
  getAutomationTodaySummary,
  getBeauticianCustomerList,
  getBeauticianDashboard,
  getBeauticianScheduleFlow,
  getCardOpeningFlow,
  getCardVerificationFlow,
  getCashierFlow,
  getCustomerCard,
  getCustomerGrowthCandidates,
  getFollowUpTasksView,
  getInventoryAlerts,
  getManagerDashboard,
  getOperationResult,
  getTodayPrintDocuments,
  getReceptionDashboard,
  getRechargeFlow,
  getRefundFlow,
  getRegistrationFlow,
  getServiceRecordFlow,
  getStaffSchedules,
} from "../services/auraCoreService";
import type { AgentRunResult } from "@/types/agent";
import type { BusinessQueryResponse } from "@/types/businessQuery";
import type { AiSuggestionData, MessageType } from "../types";

export type AuraPayload =
  | { kind: "manager"; data: Awaited<ReturnType<typeof getManagerDashboard>> }
  | { kind: "reception"; data: Awaited<ReturnType<typeof getReceptionDashboard>> }
  | { kind: "beautician"; data: Awaited<ReturnType<typeof getBeauticianDashboard>>; focus?: "schedule" | "commission" }
  | { kind: "beauticianCustomers"; data: Awaited<ReturnType<typeof getBeauticianCustomerList>> }
  | { kind: "beauticianSchedule"; data: Awaited<ReturnType<typeof getBeauticianScheduleFlow>> }
  | { kind: "staff"; data: Awaited<ReturnType<typeof getStaffSchedules>> }
  | { kind: "growth"; data: Awaited<ReturnType<typeof getCustomerGrowthCandidates>> }
  | { kind: "followUpTasks"; data: Awaited<ReturnType<typeof getFollowUpTasksView>> }
  | { kind: "inventory"; data: Awaited<ReturnType<typeof getInventoryAlerts>> }
  | { kind: "printDocuments"; data: Awaited<ReturnType<typeof getTodayPrintDocuments>> }
  | { kind: "customer"; data: NonNullable<Awaited<ReturnType<typeof getCustomerCard>>> }
  | { kind: "cardVerification"; data: Awaited<ReturnType<typeof getCardVerificationFlow>> }
  | { kind: "cashier"; data: Awaited<ReturnType<typeof getCashierFlow>> }
  | { kind: "cardOpening"; data: Awaited<ReturnType<typeof getCardOpeningFlow>> }
  | { kind: "registration"; data: Awaited<ReturnType<typeof getRegistrationFlow>> }
  | { kind: "recharge"; data: Awaited<ReturnType<typeof getRechargeFlow>> }
  | { kind: "refund"; data: Awaited<ReturnType<typeof getRefundFlow>> }
  | { kind: "serviceRecord"; data: Awaited<ReturnType<typeof getServiceRecordFlow>> }
  | { kind: "operation"; data: Awaited<ReturnType<typeof getOperationResult>> }
  | { kind: "automation"; data: Awaited<ReturnType<typeof createAutomationDraft>> }
  | { kind: "automationSummary"; data: Awaited<ReturnType<typeof getAutomationTodaySummary>> }
  | { kind: "agentRun"; data: AgentRunResult }
  | { kind: "businessQuery"; data: BusinessQueryResponse }
  | { kind: "ai"; data: AiSuggestionData };

export interface MicroAppMessage {
  type: MessageType;
  payload?: AuraPayload | { text: string; source?: string };
  title?: string;
}

export interface MicroAppRunResult {
  messages: MicroAppMessage[];
  aiSummary?: string;
  aiCommand?: string;
  cacheMeta?: {
    key: string;
    refreshStatus: 'idle' | 'refreshing' | 'failed';
    updatedAt?: number;
    isStale?: boolean;
    error?: string;
  };
  refresh?: Promise<MicroAppRunResult>;
}
