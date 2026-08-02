import { createHash } from 'node:crypto';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';

export const ACTION_PREDICATE_EFFECT_SCHEMA_VERSION = '1.0' as const;
export const ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE =
  'packages/server-v2/src/brain/domain/brain-action-predicate-effect-evaluator.service.ts';
export const ACTION_PREDICATE_EVALUATOR_SYMBOL = 'BrainActionPredicateEffectEvaluatorService.assertPreconditions';
export const ACTION_EFFECT_OBSERVER_SYMBOL = 'BrainActionPredicateEffectEvaluatorService.observeEffects';

export interface CuratedActionSemanticContractRef {
  readonly key: string;
  readonly version: number;
  readonly fingerprint: string;
}

export interface CuratedActionPredicateContract extends CuratedActionSemanticContractRef {
  readonly schemaVersion: typeof ACTION_PREDICATE_EFFECT_SCHEMA_VERSION;
  readonly evaluatorKey: string;
  readonly evaluatorSource: {
    readonly path: typeof ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE;
    readonly symbol: typeof ACTION_PREDICATE_EVALUATOR_SYMBOL;
  };
  readonly evaluatedAt: readonly ('preview' | 'execution')[];
  readonly dataSources: readonly string[];
  readonly evidenceFreshnessTtlMs: number;
  readonly unknownPolicy: 'recheck_then_reject';
  readonly stalePolicy: 'recheck_then_reject';
}

export interface CuratedActionEffectContract extends CuratedActionSemanticContractRef {
  readonly schemaVersion: typeof ACTION_PREDICATE_EFFECT_SCHEMA_VERSION;
  readonly observerKey: string;
  readonly observerSource: {
    readonly path: typeof ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE;
    readonly symbol: typeof ACTION_EFFECT_OBSERVER_SYMBOL;
  };
  readonly assertionType: 'created' | 'updated' | 'state_transition';
  readonly dataSources: readonly string[];
  readonly verificationDeadlineMs: number;
  readonly maxObservationAttempts: number;
  readonly minimumRecheckIntervalMs: number;
  readonly observationMode: 'read_after_write';
  readonly unobservedPolicy: 'mark_partially_succeeded_and_reconcile';
}

type PredicateInput = Omit<CuratedActionPredicateContract, 'fingerprint' | 'schemaVersion' | 'evaluatorSource'>;
type EffectInput = Omit<CuratedActionEffectContract, 'fingerprint' | 'schemaVersion' | 'observerSource'>;

export const CURATED_ACTION_PREDICATE_CATALOG: readonly CuratedActionPredicateContract[] = deepFreeze([
  predicate('context_store_resolved', 'context_store_resolved', ['auth.store_context'], 60_000),
  predicate('customer_name_present', 'customer_name_present', ['payload.name'], 15 * 60_000),
  predicate(
    'customer_phone_valid_before_execution',
    'customer_phone_valid_before_execution',
    ['payload.phone'],
    15 * 60_000,
    2,
    ['execution'],
  ),
  predicate(
    'product_belongs_to_context_store',
    'product_belongs_to_context_store',
    ['Product.id', 'Product.storeId', 'Product.deletedAt'],
    5_000,
  ),
  predicate('quantity_positive', 'quantity_positive', ['payload.items.quantity'], 15 * 60_000),
  predicate(
    'supplier_present_before_execution',
    'supplier_present_before_execution',
    ['payload.supplier'],
    15 * 60_000,
  ),
  predicate(
    'purchase_order_draft_belongs_to_context_store',
    'purchase_order_draft_belongs_to_context_store',
    [
      'PurchaseOrder.id',
      'PurchaseOrder.storeId',
      'PurchaseOrder.status',
      'PurchaseOrder.updatedAt',
      'approval.expectedPurchaseOrderUpdatedAt',
    ],
    5_000,
    1,
  ),
  predicate(
    'customer_and_project_in_context_store',
    'customer_and_project_in_context_store',
    ['Customer.id', 'Customer.storeId', 'Customer.deletedAt', 'Project.id', 'Project.storeId', 'Project.deletedAt'],
    5_000,
  ),
  predicate('appointment_time_resolved', 'appointment_time_resolved', ['payload.appointmentTime'], 60_000),
  predicate(
    'reservation_window_available',
    'reservation_window_available',
    [
      'payload.appointmentTime',
      'payload.duration',
      'payload.beauticianId',
      'Reservation.date',
      'Reservation.startTime',
      'Reservation.endTime',
      'Reservation.status',
      'Project.duration',
      'BeauticianAvailability',
      'BeauticianTimeOff',
    ],
    5_000,
  ),
  predicate(
    'reservation_belongs_to_context_store',
    'reservation_belongs_to_context_store',
    [
      'Reservation.id',
      'Reservation.storeId',
      'Reservation.status',
      'Reservation.updatedAt',
      'approval.expectedReservationUpdatedAt',
    ],
    5_000,
    2,
  ),
]);

export const CURATED_ACTION_EFFECT_CATALOG: readonly CuratedActionEffectContract[] = deepFreeze([
  effect(
    'customer_created_in_context_store',
    'customer_created_in_context_store',
    'created',
    ['Customer.id', 'Customer.storeId', 'Customer.name', 'Customer.phone'],
    3,
  ),
  effect(
    'purchase_order_draft_created_in_context_store',
    'purchase_order_draft_created_in_context_store',
    'created',
    ['PurchaseOrder.id', 'PurchaseOrder.storeId', 'PurchaseOrder.status', 'PurchaseOrder.creationFingerprint'],
    1,
  ),
  effect(
    'purchase_order_submitted_for_approval',
    'purchase_order_submitted_for_approval',
    'state_transition',
    [
      'PurchaseOrder.id',
      'PurchaseOrder.storeId',
      'PurchaseOrder.status',
      'PurchaseOrder.updatedAt',
      'approval.expectedPurchaseOrderUpdatedAt',
      'BusinessMutationReceipt.requestFingerprint',
      'BusinessMutationReceipt.beforeVersion',
      'BusinessMutationReceipt.afterVersion',
      'BusinessMutationReceipt.receiptFingerprint',
    ],
    1,
  ),
  effect(
    'reservation_created_in_context_store',
    'reservation_created_in_context_store',
    'created',
    ['Reservation.id', 'Reservation.storeId', 'Reservation.status', 'Reservation.creationFingerprint'],
    3,
  ),
  effect(
    'reservation_time_updated',
    'reservation_time_updated',
    'updated',
    [
      'Reservation.id',
      'Reservation.storeId',
      'Reservation.date',
      'Reservation.startTime',
      'Reservation.updatedAt',
      'approval.expectedReservationUpdatedAt',
      'BusinessMutationReceipt.requestFingerprint',
      'BusinessMutationReceipt.beforeVersion',
      'BusinessMutationReceipt.afterVersion',
      'BusinessMutationReceipt.receiptFingerprint',
    ],
    4,
  ),
  effect(
    'reservation_cancelled',
    'reservation_cancelled',
    'state_transition',
    [
      'Reservation.id',
      'Reservation.storeId',
      'Reservation.status',
      'Reservation.updatedAt',
      'approval.expectedReservationUpdatedAt',
      'BusinessMutationReceipt.requestFingerprint',
      'BusinessMutationReceipt.beforeVersion',
      'BusinessMutationReceipt.afterVersion',
      'BusinessMutationReceipt.receiptFingerprint',
    ],
    4,
  ),
]);

const PREDICATES_BY_KEY = new Map(CURATED_ACTION_PREDICATE_CATALOG.map((item) => [item.key, item]));
const EFFECTS_BY_KEY = new Map(CURATED_ACTION_EFFECT_CATALOG.map((item) => [item.key, item]));

export function curatedActionPredicateRef(key: string): CuratedActionSemanticContractRef {
  const contract = PREDICATES_BY_KEY.get(key);
  if (!contract) throw new Error(`action_predicate_contract_missing:${key}`);
  return { key: contract.key, version: contract.version, fingerprint: contract.fingerprint };
}

export function curatedActionEffectRef(key: string): CuratedActionSemanticContractRef {
  const contract = EFFECTS_BY_KEY.get(key);
  if (!contract) throw new Error(`action_effect_contract_missing:${key}`);
  return { key: contract.key, version: contract.version, fingerprint: contract.fingerprint };
}

export function resolveCuratedActionPredicateContract(
  ref: CuratedActionSemanticContractRef,
): CuratedActionPredicateContract | undefined {
  const contract = PREDICATES_BY_KEY.get(ref.key);
  return contract && contract.version === ref.version && contract.fingerprint === ref.fingerprint
    ? contract
    : undefined;
}

export function resolveCuratedActionEffectContract(
  ref: CuratedActionSemanticContractRef,
): CuratedActionEffectContract | undefined {
  const contract = EFFECTS_BY_KEY.get(ref.key);
  return contract && contract.version === ref.version && contract.fingerprint === ref.fingerprint
    ? contract
    : undefined;
}

function predicate(
  key: string,
  evaluatorKey: string,
  dataSources: readonly string[],
  evidenceFreshnessTtlMs: number,
  version = 1,
  evaluatedAt: CuratedActionPredicateContract['evaluatedAt'] = ['preview', 'execution'],
): CuratedActionPredicateContract {
  const input: PredicateInput = {
    key,
    version,
    evaluatorKey,
    evaluatedAt: [...evaluatedAt],
    dataSources: [...dataSources],
    evidenceFreshnessTtlMs,
    unknownPolicy: 'recheck_then_reject',
    stalePolicy: 'recheck_then_reject',
  };
  return withFingerprint({
    schemaVersion: ACTION_PREDICATE_EFFECT_SCHEMA_VERSION,
    evaluatorSource: {
      path: ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE,
      symbol: ACTION_PREDICATE_EVALUATOR_SYMBOL,
    },
    ...input,
  });
}

function effect(
  key: string,
  observerKey: string,
  assertionType: CuratedActionEffectContract['assertionType'],
  dataSources: readonly string[],
  version = 1,
): CuratedActionEffectContract {
  const input: EffectInput = {
    key,
    version,
    observerKey,
    assertionType,
    dataSources: [...dataSources],
    verificationDeadlineMs: 5_000,
    maxObservationAttempts: 3,
    minimumRecheckIntervalMs: 500,
    observationMode: 'read_after_write',
    unobservedPolicy: 'mark_partially_succeeded_and_reconcile',
  };
  return withFingerprint({
    schemaVersion: ACTION_PREDICATE_EFFECT_SCHEMA_VERSION,
    observerSource: {
      path: ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE,
      symbol: ACTION_EFFECT_OBSERVER_SYMBOL,
    },
    ...input,
  });
}

function withFingerprint<T extends { key: string; version: number }>(value: T): T & { fingerprint: string } {
  return {
    ...value,
    fingerprint: createHash('sha256').update(canonicalizeBusinessDefinition(value)).digest('hex'),
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
