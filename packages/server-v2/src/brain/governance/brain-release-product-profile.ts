import { createHash } from 'node:crypto';

export const BRAIN_QUERY_ONLY_PRODUCT_PROFILE = 'query_only_v1' as const;
export const BRAIN_QUERY_ONLY_CAPABILITY_MANIFEST = 'ami-brain-query-only-v1' as const;
export const BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY = 'deny' as const;

export const BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS = Object.freeze([
  'appointment_gap_list',
  'beautician_customer_card_progress',
  'beautician_material_preparation',
  'beautician_personal_performance',
  'beautician_service_overview',
  'customer_facts',
  'customer_priority_recommendation',
  'customer_waiting_loss_overview',
  'finance_material_cost_summary',
  'finance_payment_breakdown',
  'finance_risk_overview',
  'finance_staff_refund_rate_boundary',
  'finance_transaction_anomaly_review',
  'front_desk_operations_overview',
  'inventory_operations_overview',
  'inventory_procurement_advice',
  'inventory_receipt_discrepancy_guidance',
  'inventory_risk_ranking',
  'manager_staff_overview',
  'marketing_automation_rule_preview',
  'marketing_campaign_cost_attribution_review',
  'marketing_campaign_plan',
  'marketing_customer_segment',
  'marketing_growth_overview',
  'marketing_message_draft',
  'order_revenue_analysis',
  'product_sales_ranking',
  'project_margin_analysis',
  'project_material_consumption_analysis',
  'project_service_ranking',
  'reservation_list',
  'staff_performance_ranking',
  'store_operations_overview',
] as const);

export const BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS = Object.freeze([
  'card_usage_action_preview',
  'customer_follow_up_draft',
  'gap_fill_touch_preview',
  'marketing_strategy_execute_preview',
  'marketing_touch_draft',
  'purchase_order_draft',
  'reservation_action_preview',
  'service_record_completion_preview',
] as const);

export interface BrainReleaseProductProfileSummary {
  productProfile: string | null;
  actionsEnabled: boolean;
  actionExecutionPolicy: string | null;
  allowedCapabilityManifest: string | null;
  allowedCapabilityCount: number | null;
  sideEffectCapabilityCount: number | null;
  productProfileFingerprint: string | null;
}

type CapabilityLike = {
  key?: unknown;
  readOnly?: unknown;
  sideEffect?: unknown;
};

const QUERY_ONLY_CONTRACT = Object.freeze({
  productProfile: BRAIN_QUERY_ONLY_PRODUCT_PROFILE,
  actionsEnabled: false,
  allowedCapabilityManifest: BRAIN_QUERY_ONLY_CAPABILITY_MANIFEST,
  allowedCapabilityCount: BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length,
  sideEffectCapabilityCount: 0,
  actionExecutionPolicy: BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY,
});

export function normalizeBrainReleaseProductProfileRollout(
  rollout: Record<string, unknown>,
): Record<string, unknown> {
  if (rollout.productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE) return { ...rollout };
  const blockers = validateExplicitQueryOnlyContract(rollout);
  if (blockers.length) throw new Error(blockers[0]);
  return {
    ...rollout,
    ...QUERY_ONLY_CONTRACT,
    productProfileFingerprint: queryOnlyProductProfileFingerprint(),
  };
}

export function validateBrainReleaseProductProfile(
  rollout: Record<string, unknown>,
  capabilities: readonly CapabilityLike[],
): string[] {
  if (rollout.productProfile === undefined || rollout.productProfile === null || rollout.productProfile === '') {
    return [];
  }
  if (rollout.productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE) {
    return ['brain_release_product_profile_unknown'];
  }
  const blockers = validateExplicitQueryOnlyContract(rollout);
  const expectedFingerprint = queryOnlyProductProfileFingerprint();
  if (rollout.productProfileFingerprint !== expectedFingerprint) {
    blockers.push('brain_query_only_product_profile_fingerprint_mismatch');
  }

  const allowed = new Set<string>(BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS);
  const actual = capabilities
    .map((capability) => String(capability.key ?? '').trim())
    .filter(Boolean)
    .sort();
  const actualSet = new Set(actual);
  const missing = BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.filter((key) => !actualSet.has(key));
  const extra = actual.filter((key) => !allowed.has(key));
  if (missing.length || extra.length || actual.length !== actualSet.size) {
    blockers.push(
      `brain_query_only_capability_manifest_mismatch:missing=${missing.join(',') || 'none'}:extra=${extra.join(',') || 'none'}`,
    );
  }
  for (const capability of capabilities) {
    const key = String(capability.key ?? '').trim() || 'unknown';
    if (capability.readOnly !== true || capability.sideEffect !== false) {
      blockers.push(`brain_query_only_side_effect_capability:${key}`);
    }
  }
  return [...new Set(blockers)];
}

export function filterCapabilitiesForBrainReleaseProductProfile<T extends CapabilityLike>(
  rollout: Record<string, unknown>,
  capabilities: readonly T[],
): readonly T[] {
  if (rollout.productProfile !== BRAIN_QUERY_ONLY_PRODUCT_PROFILE) return capabilities;
  const allowed = new Set<string>(BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS);
  return capabilities.filter(
    (capability) =>
      allowed.has(String(capability.key ?? '').trim()) &&
      capability.readOnly === true &&
      capability.sideEffect === false,
  );
}

export function brainReleaseProductProfileSummary(
  rollout: Record<string, unknown>,
): BrainReleaseProductProfileSummary {
  const productProfile = text(rollout.productProfile);
  return {
    productProfile,
    actionsEnabled: rollout.actionsEnabled !== false,
    actionExecutionPolicy: text(rollout.actionExecutionPolicy),
    allowedCapabilityManifest: text(rollout.allowedCapabilityManifest),
    allowedCapabilityCount: integer(rollout.allowedCapabilityCount),
    sideEffectCapabilityCount: integer(rollout.sideEffectCapabilityCount),
    productProfileFingerprint: text(rollout.productProfileFingerprint),
  };
}

export function brainReleaseActionsEnabled(rollout: Record<string, unknown>): boolean {
  if (rollout.productProfile === BRAIN_QUERY_ONLY_PRODUCT_PROFILE) return false;
  return rollout.actionsEnabled !== false && rollout.actionExecutionPolicy !== BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY;
}

export function queryOnlyProductProfileFingerprint(): string {
  return createHash('sha256').update(JSON.stringify(QUERY_ONLY_CONTRACT)).digest('hex');
}

function validateExplicitQueryOnlyContract(rollout: Record<string, unknown>): string[] {
  const blockers: string[] = [];
  if (rollout.actionsEnabled !== undefined && rollout.actionsEnabled !== false) {
    blockers.push('brain_query_only_actions_must_be_disabled');
  }
  if (
    rollout.actionExecutionPolicy !== undefined &&
    rollout.actionExecutionPolicy !== BRAIN_QUERY_ONLY_ACTION_EXECUTION_POLICY
  ) {
    blockers.push('brain_query_only_action_execution_policy_invalid');
  }
  if (
    rollout.allowedCapabilityManifest !== undefined &&
    rollout.allowedCapabilityManifest !== BRAIN_QUERY_ONLY_CAPABILITY_MANIFEST
  ) {
    blockers.push('brain_query_only_manifest_invalid');
  }
  if (
    rollout.allowedCapabilityCount !== undefined &&
    rollout.allowedCapabilityCount !== BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS.length
  ) {
    blockers.push('brain_query_only_allowed_capability_count_invalid');
  }
  if (rollout.sideEffectCapabilityCount !== undefined && rollout.sideEffectCapabilityCount !== 0) {
    blockers.push('brain_query_only_side_effect_capability_count_invalid');
  }
  return blockers;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number | null {
  return Number.isInteger(value) ? Number(value) : null;
}
