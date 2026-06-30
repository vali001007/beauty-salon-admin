import type { AuraAction } from "../../../../../src/types/aura";
import type { Role, RoleDefinition } from "../types";

export type AuraIntentName =
  | "manager.dashboard.view"
  | "manager.staff.view"
  | "manager.customer_growth.view"
  | "manager.inventory.view"
  | "customer.followup.view"
  | "business_query.ask"
  | "appointment.today.view"
  | "appointment.confirm"
  | "appointment.reschedule"
  | "appointment.cancel"
  | "appointment.check_in"
  | "customer.search"
  | "customer.profile.view"
  | "card.consume"
  | "cashier.checkout"
  | "card_order.create"
  | "recharge.create"
  | "order.refund"
  | "customer.quick_create"
  | "beautician.schedule.view"
  | "beautician.commission.view"
  | "beautician.customer.view"
  | "service_record.create"
  | "care_advice.generate"
  | "service_task.complete"
  | "print.receipt"
  | "unknown.clarify";

export type AuraCommandSource = "quick_action" | "text" | "voice" | "system";
export type AuraRiskLevel = "none" | "low" | "medium" | "high";

export interface AuraIntentSlots {
  customerName?: string;
  customerPhone?: string;
  appointmentId?: number;
  cardName?: string;
  projectName?: string;
  amount?: number;
  paymentMethod?: string;
  rawText?: string;
}

export interface AuraResolvedIntent {
  name: AuraIntentName;
  role: Role;
  action: AuraAction | `customer:${string}` | `appointment:${string}:${number}` | null;
  source: AuraCommandSource;
  confidence: number;
  slots: AuraIntentSlots;
  missingSlots: string[];
  riskLevel: AuraRiskLevel;
  requiresConfirmation: boolean;
  showUserCommand: boolean;
  loadingLabel: string;
  deniedReason?: string;
}

export interface ResolveIntentOptions {
  command: string;
  role: Role;
  definition: RoleDefinition;
  source?: AuraCommandSource;
}
