import { createHash } from 'node:crypto';
import type { BusinessMutationReceipt } from '../common/mutation-receipt.js';
import {
  assertBusinessDatabaseWriteSetEvidence,
  type BusinessDatabaseWriteSetEvidence,
} from '../common/database-write-set.js';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';

export const ACTION_INVARIANT_CATALOG_SCHEMA_VERSION = '1.1' as const;
export const ACTION_INVARIANT_CATALOG_SOURCE = 'packages/server-v2/src/semantic-data/brain-action-invariant-catalog.ts';

export interface CuratedActionInvariantContractRef {
  readonly key: string;
  readonly version: number;
  readonly fingerprint: string;
}

export interface CuratedActionDeclaredWriteTarget {
  readonly model: string;
  readonly operation: 'create' | 'update';
  readonly evidenceSource: 'database_write_set';
}

export interface CuratedActionInvariantContract extends CuratedActionInvariantContractRef {
  readonly schemaVersion: typeof ACTION_INVARIANT_CATALOG_SCHEMA_VERSION;
  readonly actionKey: string;
  readonly capabilityKey: string;
  readonly businessObjectType: string;
  readonly mutationKind: 'create' | 'update' | 'state_transition';
  readonly declaredWriteTargets: readonly CuratedActionDeclaredWriteTarget[];
  readonly allowedChangedFields: readonly string[];
  readonly requiredChangedFieldGroups: readonly (readonly string[])[];
  readonly evidencePolicy: 'effect_observation' | 'effect_observation_and_transactional_mutation_receipt';
  readonly unexpectedEvidencePolicy: 'manual_reconcile_required';
  readonly coverageBoundary: 'database_trigger_observed_public_tables';
}

export interface ActionInvariantEvaluation {
  readonly schemaVersion: '1.0';
  readonly contractRef: CuratedActionInvariantContractRef;
  readonly actionKey: string;
  readonly status: 'satisfied' | 'manual_reconcile_required';
  readonly observedWriteTargets: readonly string[];
  readonly changedFields: readonly string[];
  readonly evidenceCodes: readonly string[];
  readonly coverageBoundary: 'database_trigger_observed_public_tables';
  readonly evaluatedAt: string;
  readonly evaluationFingerprint: string;
}

type InvariantInput = Omit<
  CuratedActionInvariantContract,
  'schemaVersion' | 'key' | 'version' | 'fingerprint' | 'unexpectedEvidencePolicy' | 'coverageBoundary'
>;

export const CURATED_ACTION_INVARIANT_CATALOG: readonly CuratedActionInvariantContract[] = deepFreeze([
  invariant({
    actionKey: 'action.create_customer',
    capabilityKey: 'create_customer',
    businessObjectType: 'customer',
    mutationKind: 'create',
    declaredWriteTargets: [
      writeTarget('Customer', 'create', 'database_write_set'),
      writeTarget('CustomerHealthProfile', 'create', 'database_write_set'),
    ],
    allowedChangedFields: [],
    requiredChangedFieldGroups: [],
    evidencePolicy: 'effect_observation',
  }),
  invariant({
    actionKey: 'action.create_purchase_order',
    capabilityKey: 'create_purchase_order',
    businessObjectType: 'purchase_order',
    mutationKind: 'create',
    declaredWriteTargets: [writeTarget('PurchaseOrder', 'create', 'database_write_set')],
    allowedChangedFields: [],
    requiredChangedFieldGroups: [],
    evidencePolicy: 'effect_observation',
  }),
  invariant({
    actionKey: 'action.submit_purchase_order_for_approval',
    capabilityKey: 'submit_purchase_order_for_approval',
    businessObjectType: 'purchase_order',
    mutationKind: 'state_transition',
    declaredWriteTargets: [
      writeTarget('PurchaseOrder', 'update', 'database_write_set'),
      writeTarget('BusinessMutationReceipt', 'create', 'database_write_set'),
    ],
    allowedChangedFields: ['status'],
    requiredChangedFieldGroups: [['status']],
    evidencePolicy: 'effect_observation_and_transactional_mutation_receipt',
  }),
  invariant({
    actionKey: 'action.create_reservation',
    capabilityKey: 'create_reservation',
    businessObjectType: 'reservation',
    mutationKind: 'create',
    declaredWriteTargets: [writeTarget('Reservation', 'create', 'database_write_set')],
    allowedChangedFields: [],
    requiredChangedFieldGroups: [],
    evidencePolicy: 'effect_observation',
  }),
  invariant({
    actionKey: 'action.reschedule_reservation',
    capabilityKey: 'reschedule_reservation',
    businessObjectType: 'reservation',
    mutationKind: 'update',
    declaredWriteTargets: [
      writeTarget('Reservation', 'update', 'database_write_set'),
      writeTarget('BusinessMutationReceipt', 'create', 'database_write_set'),
    ],
    allowedChangedFields: ['beauticianId', 'date', 'endTime', 'projectId', 'remark', 'startTime'],
    requiredChangedFieldGroups: [['beauticianId', 'date', 'endTime', 'projectId', 'startTime']],
    evidencePolicy: 'effect_observation_and_transactional_mutation_receipt',
  }),
  invariant({
    actionKey: 'action.cancel_reservation',
    capabilityKey: 'cancel_reservation',
    businessObjectType: 'reservation',
    mutationKind: 'state_transition',
    declaredWriteTargets: [
      writeTarget('Reservation', 'update', 'database_write_set'),
      writeTarget('BusinessMutationReceipt', 'create', 'database_write_set'),
    ],
    allowedChangedFields: ['remark', 'status'],
    requiredChangedFieldGroups: [['status']],
    evidencePolicy: 'effect_observation_and_transactional_mutation_receipt',
  }),
]);

const INVARIANTS_BY_ACTION = new Map(CURATED_ACTION_INVARIANT_CATALOG.map((item) => [item.actionKey, item]));
const INVARIANTS_BY_KEY = new Map(CURATED_ACTION_INVARIANT_CATALOG.map((item) => [item.key, item]));

export function curatedActionInvariantRef(actionKey: string): CuratedActionInvariantContractRef {
  const contract = INVARIANTS_BY_ACTION.get(actionKey);
  if (!contract) throw new Error(`action_invariant_contract_missing:${actionKey}`);
  return { key: contract.key, version: contract.version, fingerprint: contract.fingerprint };
}

export function resolveCuratedActionInvariantContract(
  ref: CuratedActionInvariantContractRef,
): CuratedActionInvariantContract | undefined {
  const contract = INVARIANTS_BY_KEY.get(ref.key);
  return contract && contract.version === ref.version && contract.fingerprint === ref.fingerprint
    ? contract
    : undefined;
}

export function evaluateCuratedActionInvariant(input: {
  actionKey: string;
  contractRef: CuratedActionInvariantContractRef;
  receipt: {
    capabilityKey: string;
    businessObjectType: string;
    businessObjectId: number | string;
    mutationReceipt?: BusinessMutationReceipt;
    databaseWriteSet?: BusinessDatabaseWriteSetEvidence;
  };
  effectObservations: readonly { effectKey: string; status: string }[];
  evaluatedAt?: Date;
}): ActionInvariantEvaluation {
  const contract = resolveCuratedActionInvariantContract(input.contractRef);
  if (!contract || contract.actionKey !== input.actionKey) {
    throw new Error(`action_invariant_contract_drift:${input.actionKey}`);
  }
  const evidenceCodes: string[] = [];
  const observedWriteTargets: string[] = [];
  let changedFields = [...new Set(input.receipt.mutationReceipt?.changedFields ?? [])].sort();
  const effectsObserved =
    input.effectObservations.length > 0 && input.effectObservations.every((item) => item.status === 'observed');
  if (!effectsObserved) evidenceCodes.push('declared_effect_observation_incomplete');
  if (input.receipt.capabilityKey !== contract.capabilityKey) evidenceCodes.push('capability_identity_mismatch');
  if (input.receipt.businessObjectType !== contract.businessObjectType) {
    evidenceCodes.push('business_object_type_mismatch');
  }

  const mutationReceipt = input.receipt.mutationReceipt;
  const requiresMutationReceipt = contract.evidencePolicy === 'effect_observation_and_transactional_mutation_receipt';
  if (requiresMutationReceipt && !mutationReceipt) {
    evidenceCodes.push('transactional_mutation_receipt_missing');
  }
  if (!requiresMutationReceipt && mutationReceipt) {
    evidenceCodes.push('unexpected_transactional_mutation_receipt');
  }
  if (mutationReceipt) {
    if (mutationReceipt.capabilityKey !== contract.capabilityKey) evidenceCodes.push('mutation_capability_mismatch');
    if (mutationReceipt.businessObjectType !== contract.businessObjectType) {
      evidenceCodes.push('mutation_business_object_type_mismatch');
    }
    if (String(mutationReceipt.businessObjectId) !== String(input.receipt.businessObjectId)) {
      evidenceCodes.push('mutation_business_object_identity_mismatch');
    }
    if (mutationReceipt.mutationKind !== contract.mutationKind) evidenceCodes.push('mutation_kind_mismatch');
    const allowedChangedFields = new Set(contract.allowedChangedFields);
    if (changedFields.some((field) => !allowedChangedFields.has(field))) {
      evidenceCodes.push('mutation_changed_fields_outside_contract');
    }
    for (const group of contract.requiredChangedFieldGroups) {
      if (!group.some((field) => changedFields.includes(field))) {
        evidenceCodes.push(`mutation_required_change_missing:${group.join('|')}`);
      }
    }
  }

  const databaseWriteSet = input.receipt.databaseWriteSet;
  if (!databaseWriteSet) {
    evidenceCodes.push('database_write_set_missing');
  } else {
    try {
      assertBusinessDatabaseWriteSetEvidence(databaseWriteSet);
      if (databaseWriteSet.capabilityKey !== contract.capabilityKey) {
        evidenceCodes.push('database_write_set_capability_mismatch');
      }
      if (mutationReceipt && databaseWriteSet.idempotencyKeyFingerprint !== mutationReceipt.idempotencyKeyFingerprint) {
        evidenceCodes.push('database_write_set_idempotency_mismatch');
      }
      for (const entry of databaseWriteSet.entries) {
        observedWriteTargets.push(`${entry.modelName}:${entry.operation}`);
        if (entry.operation === 'delete') evidenceCodes.push('database_write_set_delete_forbidden');
      }
      const primaryModel = contract.declaredWriteTargets.find(
        (item) => item.model !== 'BusinessMutationReceipt',
      )?.model;
      const primaryEntries = databaseWriteSet.entries.filter((entry) => entry.modelName === primaryModel);
      if (
        !primaryEntries.some((entry) => String(entry.rowIdentity.id ?? '') === String(input.receipt.businessObjectId))
      ) {
        evidenceCodes.push('database_write_set_business_object_identity_mismatch');
      }
      if (contract.mutationKind !== 'create') {
        changedFields = [
          ...new Set(
            primaryEntries.flatMap((entry) =>
              entry.changedFields.filter((field) => !['createdAt', 'updatedAt'].includes(field)),
            ),
          ),
        ].sort();
      }
    } catch {
      evidenceCodes.push('database_write_set_fingerprint_invalid');
    }
  }

  const databaseAllowedChangedFields = new Set(contract.allowedChangedFields);
  if (changedFields.some((field) => !databaseAllowedChangedFields.has(field))) {
    evidenceCodes.push('database_write_set_changed_fields_outside_contract');
  }
  for (const group of contract.requiredChangedFieldGroups) {
    if (!group.some((field) => changedFields.includes(field))) {
      evidenceCodes.push(`database_write_set_required_change_missing:${group.join('|')}`);
    }
  }

  const declaredWriteTargets = contract.declaredWriteTargets.map(writeTargetKey).sort();
  const observed = [...new Set(observedWriteTargets)].sort();
  if (JSON.stringify(observed) !== JSON.stringify(declaredWriteTargets)) {
    evidenceCodes.push('declared_transaction_footprint_mismatch');
  }
  const uniqueEvidenceCodes = [...new Set(evidenceCodes)].sort();
  const evaluatedAt = (input.evaluatedAt ?? new Date()).toISOString();
  const body = {
    schemaVersion: '1.0' as const,
    contractRef: { ...input.contractRef },
    actionKey: input.actionKey,
    status: uniqueEvidenceCodes.length ? ('manual_reconcile_required' as const) : ('satisfied' as const),
    observedWriteTargets: observed,
    changedFields,
    evidenceCodes: uniqueEvidenceCodes,
    coverageBoundary: contract.coverageBoundary,
    evaluatedAt,
  };
  return { ...body, evaluationFingerprint: fingerprint(body) };
}

function invariant(input: InvariantInput): CuratedActionInvariantContract {
  const body = {
    schemaVersion: ACTION_INVARIANT_CATALOG_SCHEMA_VERSION,
    key: `${input.actionKey}.mutation_footprint`,
    version: 2,
    ...input,
    declaredWriteTargets: input.declaredWriteTargets.map((item) => ({ ...item })),
    allowedChangedFields: [...input.allowedChangedFields].sort(),
    requiredChangedFieldGroups: input.requiredChangedFieldGroups.map((group) => [...group].sort()),
    unexpectedEvidencePolicy: 'manual_reconcile_required' as const,
    coverageBoundary: 'database_trigger_observed_public_tables' as const,
  };
  return { ...body, fingerprint: fingerprint(body) };
}

function writeTarget(
  model: string,
  operation: CuratedActionDeclaredWriteTarget['operation'],
  evidenceSource: CuratedActionDeclaredWriteTarget['evidenceSource'],
): CuratedActionDeclaredWriteTarget {
  return { model, operation, evidenceSource };
}

function writeTargetKey(target: CuratedActionDeclaredWriteTarget) {
  return `${target.model}:${target.operation}`;
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(canonicalizeBusinessDefinition(value)).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
