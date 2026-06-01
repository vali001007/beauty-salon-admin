import type {
  getAiSuggestion,
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
} from "../services/auraCoreService";
import type { MessageType } from "../types";

export type AuraPayload =
  | { kind: "manager"; data: Awaited<ReturnType<typeof getManagerDashboard>> }
  | { kind: "reception"; data: Awaited<ReturnType<typeof getReceptionDashboard>> }
  | { kind: "beautician"; data: Awaited<ReturnType<typeof getBeauticianDashboard>> }
  | { kind: "staff"; data: Awaited<ReturnType<typeof getStaffSchedules>> }
  | { kind: "growth"; data: Awaited<ReturnType<typeof getCustomerGrowthCandidates>> }
  | { kind: "inventory"; data: Awaited<ReturnType<typeof getInventoryAlerts>> }
  | { kind: "customer"; data: NonNullable<Awaited<ReturnType<typeof getCustomerCard>>> }
  | { kind: "cardVerification"; data: Awaited<ReturnType<typeof getCardVerificationFlow>> }
  | { kind: "cashier"; data: Awaited<ReturnType<typeof getCashierFlow>> }
  | { kind: "cardOpening"; data: Awaited<ReturnType<typeof getCardOpeningFlow>> }
  | { kind: "registration"; data: Awaited<ReturnType<typeof getRegistrationFlow>> }
  | { kind: "recharge"; data: Awaited<ReturnType<typeof getRechargeFlow>> }
  | { kind: "operation"; data: Awaited<ReturnType<typeof getOperationResult>> }
  | { kind: "ai"; data: Awaited<ReturnType<typeof getAiSuggestion>> };

export interface MicroAppMessage {
  type: MessageType;
  payload?: AuraPayload | { text: string; source?: string };
  title?: string;
}

export interface MicroAppRunResult {
  messages: MicroAppMessage[];
  aiSummary?: string;
  aiCommand?: string;
}

