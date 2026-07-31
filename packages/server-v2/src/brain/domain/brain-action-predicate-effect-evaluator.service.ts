import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  buildBusinessMutationRequestFingerprint,
  restoreBusinessMutationReceipt,
  type BusinessMutationReceipt,
} from '../../common/mutation-receipt.js';
import { loadBusinessDatabaseWriteSet } from '../../common/database-write-set.js';
import {
  buildPurchaseOrderCreationFingerprint,
  buildPurchaseOrderIdempotencyKey,
} from '../../inventory/purchase-order-idempotency.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  buildReservationCreationFingerprint,
  buildReservationIdempotencyKey,
} from '../../reservations/reservation-idempotency.js';
import {
  assertReservationWindowAvailable,
  normalizeReservationWindow,
} from '../../reservations/reservation-window-policy.js';
import {
  resolveCuratedActionEffectContract,
  resolveCuratedActionPredicateContract,
  type CuratedActionEffectContract,
  type CuratedActionPredicateContract,
} from '../../semantic-data/brain-action-predicate-effect-catalog.js';
import type { BusinessActionDefinitionSnapshot } from '../cognition/business-definition-snapshot.types.js';
import type { BrainCapabilityReceipt } from '../skills/brain-capability-gateway.service.js';

export type BrainActionPredicateStatus = 'satisfied' | 'violated' | 'unknown' | 'stale';
export type BrainActionEffectStatus = 'observed' | 'unobserved' | 'unknown';

export interface BrainActionPredicateEvaluation {
  readonly predicateKey: string;
  readonly version: number;
  readonly fingerprint: string;
  readonly status: BrainActionPredicateStatus;
  readonly evidenceCode: string;
  readonly evaluatedAt: string;
  readonly expiresAt: string;
}

export interface BrainActionEffectObservation {
  readonly effectKey: string;
  readonly version: number;
  readonly fingerprint: string;
  readonly status: BrainActionEffectStatus;
  readonly evidenceCode: string;
  readonly observedAt: string;
  readonly verificationDeadline: string;
}

export type BrainActionEffectReconciliationStatus =
  | 'not_required'
  | 'pending'
  | 'succeeded'
  | 'manual_reconcile_required';

export interface BrainActionEffectReconciliation {
  readonly status: BrainActionEffectReconciliationStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly verificationDeadline: string;
  readonly lastAttemptAt: string;
  readonly nextAttemptAt: string | null;
  readonly reasonCode:
    | 'all_effects_observed'
    | 'effect_recheck_pending'
    | 'effect_verification_deadline_exceeded'
    | 'effect_observation_attempts_exhausted'
    | 'action_invariant_evidence_incomplete'
    | 'institutional_effect_not_effective'
    | 'effect_reconciliation_context_invalid';
}

export interface BrainActionEffectReconciliationResult {
  readonly effectObservations: readonly BrainActionEffectObservation[];
  readonly reconciliation: BrainActionEffectReconciliation;
}

export interface BrainRecoveredActionEffectReceipt extends BrainCapabilityReceipt {
  readonly status: 'succeeded';
  readonly recovered: true;
  readonly effectObservations: readonly BrainActionEffectObservation[];
}

@Injectable()
export class BrainActionPredicateEffectEvaluatorService {
  constructor(private readonly prisma: PrismaService) {}

  async captureApprovalEvidence(input: {
    action: BusinessActionDefinitionSnapshot;
    storeId: number;
    args: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (input.action.actionKey === 'action.submit_purchase_order_for_approval') {
      const purchaseOrderId = this.positiveId(input.args.purchaseOrderId);
      if (!purchaseOrderId) return { ...input.args };
      const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, storeId: input.storeId },
        select: { updatedAt: true },
      });
      return {
        ...input.args,
        ...(purchaseOrder ? { expectedPurchaseOrderUpdatedAt: purchaseOrder.updatedAt.toISOString() } : {}),
      };
    }
    if (!['action.reschedule_reservation', 'action.cancel_reservation'].includes(input.action.actionKey)) {
      return { ...input.args };
    }
    const reservationId = this.positiveId(input.args.reservationId);
    if (!reservationId) return { ...input.args };
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, storeId: input.storeId },
      select: { updatedAt: true },
    });
    return {
      ...input.args,
      ...(reservation ? { expectedReservationUpdatedAt: reservation.updatedAt.toISOString() } : {}),
    };
  }

  async assertPreconditions(input: {
    action: BusinessActionDefinitionSnapshot;
    capabilityKey: string;
    storeId: number;
    args: Record<string, unknown>;
    phase?: 'preview' | 'execution';
    now?: Date;
  }): Promise<readonly BrainActionPredicateEvaluation[]> {
    this.assertActionContracts(input.action);
    const now = input.now ?? new Date();
    const evaluations: BrainActionPredicateEvaluation[] = [];
    for (const reference of input.action.preconditionPredicateRefs) {
      const contract = resolveCuratedActionPredicateContract(reference);
      if (!contract) throw new BadRequestException(`action_predicate_contract_drift:${reference.key}`);
      if (!contract.evaluatedAt.includes(input.phase ?? 'execution')) continue;
      let evaluation = await this.evaluatePredicate(contract, input, now);
      if (evaluation.status === 'unknown' || evaluation.status === 'stale') {
        evaluation = await this.evaluatePredicate(contract, input, new Date());
      }
      evaluations.push(evaluation);
      if (evaluation.status !== 'satisfied') {
        throw new BadRequestException(
          `action_precondition_${evaluation.status}:${evaluation.predicateKey}:${evaluation.evidenceCode}`,
        );
      }
    }
    return evaluations;
  }

  async observeEffects(input: {
    action: BusinessActionDefinitionSnapshot;
    storeId: number;
    args: Record<string, unknown>;
    receipt: BrainCapabilityReceipt;
    now?: Date;
  }): Promise<readonly BrainActionEffectObservation[]> {
    this.assertActionContracts(input.action);
    const now = input.now ?? new Date();
    const observations: BrainActionEffectObservation[] = [];
    for (const reference of input.action.effectAssertionRefs) {
      const contract = resolveCuratedActionEffectContract(reference);
      if (!contract) throw new BadRequestException(`action_effect_contract_drift:${reference.key}`);
      observations.push(await this.observeEffect(contract, input, now));
    }
    return observations;
  }

  buildEffectReconciliation(input: {
    action: BusinessActionDefinitionSnapshot;
    effectObservations: readonly BrainActionEffectObservation[];
    attemptCount?: number;
    now?: Date;
  }): BrainActionEffectReconciliation {
    this.assertActionContracts(input.action);
    const contracts = this.effectContracts(input.action);
    this.assertEffectObservationContracts(contracts, input.effectObservations);
    const now = input.now ?? new Date();
    const attemptCount = Math.max(1, Math.floor(input.attemptCount ?? 1));
    const maxAttempts = contracts.length ? Math.min(...contracts.map((item) => item.maxObservationAttempts)) : 1;
    const verificationDeadline = this.earliestTimestamp(
      input.effectObservations.map((item) => item.verificationDeadline),
      now,
    );
    const lastAttemptAt = this.latestTimestamp(
      input.effectObservations.map((item) => item.observedAt),
      now,
    );
    const allObserved = input.effectObservations.every((item) => item.status === 'observed');
    if (allObserved) {
      return {
        status: attemptCount === 1 ? 'not_required' : 'succeeded',
        attemptCount,
        maxAttempts,
        verificationDeadline: verificationDeadline.toISOString(),
        lastAttemptAt: lastAttemptAt.toISOString(),
        nextAttemptAt: null,
        reasonCode: 'all_effects_observed',
      };
    }
    if (now.getTime() >= verificationDeadline.getTime()) {
      return {
        status: 'manual_reconcile_required',
        attemptCount,
        maxAttempts,
        verificationDeadline: verificationDeadline.toISOString(),
        lastAttemptAt: lastAttemptAt.toISOString(),
        nextAttemptAt: null,
        reasonCode: 'effect_verification_deadline_exceeded',
      };
    }
    if (attemptCount >= maxAttempts) {
      return {
        status: 'manual_reconcile_required',
        attemptCount,
        maxAttempts,
        verificationDeadline: verificationDeadline.toISOString(),
        lastAttemptAt: lastAttemptAt.toISOString(),
        nextAttemptAt: null,
        reasonCode: 'effect_observation_attempts_exhausted',
      };
    }
    const minimumRecheckIntervalMs = contracts.length
      ? Math.max(...contracts.map((item) => item.minimumRecheckIntervalMs))
      : 0;
    const nextAttemptAt = new Date(
      Math.min(lastAttemptAt.getTime() + minimumRecheckIntervalMs, verificationDeadline.getTime()),
    );
    return {
      status: 'pending',
      attemptCount,
      maxAttempts,
      verificationDeadline: verificationDeadline.toISOString(),
      lastAttemptAt: lastAttemptAt.toISOString(),
      nextAttemptAt: nextAttemptAt.toISOString(),
      reasonCode: 'effect_recheck_pending',
    };
  }

  async reconcileEffects(input: {
    action: BusinessActionDefinitionSnapshot;
    storeId: number;
    args: Record<string, unknown>;
    receipt: BrainCapabilityReceipt;
    previousObservations: readonly BrainActionEffectObservation[];
    reconciliation: BrainActionEffectReconciliation;
    now?: Date;
  }): Promise<BrainActionEffectReconciliationResult> {
    const now = input.now ?? new Date();
    const current = this.buildEffectReconciliation({
      action: input.action,
      effectObservations: input.previousObservations,
      attemptCount: input.reconciliation.attemptCount,
      now,
    });
    if (current.status !== 'pending') {
      return { effectObservations: input.previousObservations, reconciliation: current };
    }
    const nextAttemptAt = this.timestamp(current.nextAttemptAt);
    if (nextAttemptAt && now.getTime() < nextAttemptAt.getTime()) {
      return { effectObservations: input.previousObservations, reconciliation: current };
    }

    const previousByKey = new Map(input.previousObservations.map((item) => [item.effectKey, item]));
    const effectObservations: BrainActionEffectObservation[] = [];
    for (const contract of this.effectContracts(input.action)) {
      const previous = previousByKey.get(contract.key);
      if (!previous) throw new BadRequestException(`action_effect_observation_missing:${contract.key}`);
      effectObservations.push(
        previous.status === 'observed'
          ? previous
          : await this.observeEffect(contract, input, now, previous.verificationDeadline),
      );
    }
    return {
      effectObservations,
      reconciliation: this.buildEffectReconciliation({
        action: input.action,
        effectObservations,
        attemptCount: current.attemptCount + 1,
        now,
      }),
    };
  }

  async recoverCommittedEffect(input: {
    action: BusinessActionDefinitionSnapshot;
    capabilityKey: string;
    storeId: number;
    args: Record<string, unknown>;
    idempotencyKey: string;
    now?: Date;
  }): Promise<BrainRecoveredActionEffectReceipt | undefined> {
    this.assertActionContracts(input.action);
    const committed = await this.findCommittedBusinessObject(input);
    if (!committed) return undefined;
    const databaseWriteSet = await loadBusinessDatabaseWriteSet(this.prisma, {
      storeId: input.storeId,
      capabilityKey: input.capabilityKey,
      idempotencyKey: input.idempotencyKey,
    });
    const receipt: BrainCapabilityReceipt = {
      capabilityKey: input.capabilityKey,
      businessObjectType: committed.businessObjectType,
      businessObjectId: committed.id,
      result: committed.result,
      ...(committed.mutationReceipt ? { mutationReceipt: committed.mutationReceipt } : {}),
      ...(databaseWriteSet ? { databaseWriteSet } : {}),
    };
    const effectObservations = await this.observeEffects({
      action: input.action,
      storeId: input.storeId,
      args: input.args,
      receipt,
      now: input.now,
    });
    if (!effectObservations.length || effectObservations.some((item) => item.status !== 'observed')) return undefined;
    return {
      ...receipt,
      status: 'succeeded',
      recovered: true,
      effectObservations,
      message: '已核对到同一审批与幂等身份对应的业务效果，返回原业务结果，未重复执行。',
    };
  }

  private async evaluatePredicate(
    contract: CuratedActionPredicateContract,
    input: {
      action: BusinessActionDefinitionSnapshot;
      capabilityKey: string;
      storeId: number;
      args: Record<string, unknown>;
    },
    now: Date,
  ): Promise<BrainActionPredicateEvaluation> {
    try {
      const result = await this.evaluatePredicateValue(contract.evaluatorKey, { ...input, now });
      return {
        predicateKey: contract.key,
        version: contract.version,
        fingerprint: contract.fingerprint,
        status: result.satisfied ? 'satisfied' : 'violated',
        evidenceCode: result.code,
        evaluatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + contract.evidenceFreshnessTtlMs).toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      return {
        predicateKey: contract.key,
        version: contract.version,
        fingerprint: contract.fingerprint,
        status: 'unknown',
        evidenceCode: this.errorCode(error),
        evaluatedAt: now.toISOString(),
        expiresAt: now.toISOString(),
      };
    }
  }

  private async evaluatePredicateValue(
    evaluatorKey: string,
    input: {
      action: BusinessActionDefinitionSnapshot;
      capabilityKey: string;
      storeId: number;
      args: Record<string, unknown>;
      now: Date;
    },
  ): Promise<{ satisfied: boolean; code: string }> {
    switch (evaluatorKey) {
      case 'context_store_resolved':
        return this.booleanResult(Number.isInteger(input.storeId) && input.storeId > 0, 'store_context_resolved');
      case 'customer_name_present':
        return this.booleanResult(this.text(input.args.name).length > 0, 'customer_name_present');
      case 'customer_phone_valid_before_execution':
        return this.booleanResult(/^1\d{10}$/u.test(this.text(input.args.phone)), 'customer_phone_valid');
      case 'product_belongs_to_context_store': {
        const items = this.items(input.args.items);
        const ids = [
          ...new Set(
            items.map((item) => this.positiveId(item.productId)).filter((id): id is number => id !== undefined),
          ),
        ];
        if (!ids.length || ids.length !== items.length)
          return this.booleanResult(false, 'purchase_product_ids_invalid');
        const matched = await this.prisma.product.count({
          where: { id: { in: ids }, storeId: input.storeId, deletedAt: null },
        });
        return this.booleanResult(matched === ids.length, 'purchase_products_scoped');
      }
      case 'quantity_positive': {
        const items = this.items(input.args.items);
        return this.booleanResult(
          items.length > 0 &&
            items.every((item) => Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0),
          'purchase_quantities_positive',
        );
      }
      case 'supplier_present_before_execution':
        return this.booleanResult(this.text(input.args.supplier).length > 0, 'purchase_supplier_present');
      case 'purchase_order_draft_belongs_to_context_store': {
        const purchaseOrderId = this.positiveId(input.args.purchaseOrderId);
        if (!purchaseOrderId) return this.booleanResult(false, 'purchase_order_id_invalid');
        const order = await this.prisma.purchaseOrder.findFirst({
          where: { id: purchaseOrderId, storeId: input.storeId },
          select: { id: true, status: true, updatedAt: true },
        });
        if (!order) return this.booleanResult(false, 'purchase_order_not_in_context_store');
        const expectedUpdatedAt = this.timestamp(input.args.expectedPurchaseOrderUpdatedAt);
        if (!expectedUpdatedAt) return this.booleanResult(false, 'purchase_order_version_snapshot_missing');
        if (order.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          return this.booleanResult(false, 'purchase_order_version_changed_reapproval_required');
        }
        return this.booleanResult(String(order.status) === '草稿', 'purchase_order_draft_in_context_store');
      }
      case 'customer_and_project_in_context_store': {
        const customerId = this.positiveId(input.args.customerId);
        const projectId = this.positiveId(input.args.projectId);
        if (!customerId || !projectId) return this.booleanResult(false, 'reservation_targets_invalid');
        const [customer, project] = await Promise.all([
          this.prisma.customer.findFirst({
            where: { id: customerId, storeId: input.storeId, deletedAt: null },
            select: { id: true },
          }),
          this.prisma.project.findFirst({
            where: { id: projectId, storeId: input.storeId, deletedAt: null },
            select: { id: true },
          }),
        ]);
        return this.booleanResult(Boolean(customer && project), 'reservation_customer_project_scoped');
      }
      case 'appointment_time_resolved': {
        try {
          const window = normalizeReservationWindow({
            appointmentTime: input.args.appointmentTime,
            duration: input.args.duration,
            fallbackDuration: 60,
          });
          return this.booleanResult(window.appointment.getTime() > input.now.getTime(), 'appointment_time_future');
        } catch (error) {
          if (error instanceof BadRequestException) return this.booleanResult(false, 'appointment_time_invalid');
          throw error;
        }
      }
      case 'reservation_window_available': {
        try {
          const reservationId = this.positiveId(input.args.reservationId);
          const current = reservationId
            ? await this.prisma.reservation.findFirst({
                where: { id: reservationId, storeId: input.storeId },
                select: {
                  id: true,
                  projectId: true,
                  beauticianId: true,
                  project: { select: { duration: true } },
                },
              })
            : undefined;
          if (reservationId && !current) return this.booleanResult(false, 'reservation_window_target_missing');
          const projectId = this.positiveId(input.args.projectId) ?? current?.projectId;
          const project =
            current?.project ??
            (projectId
              ? await this.prisma.project.findFirst({
                  where: { id: projectId, storeId: input.storeId, deletedAt: null },
                  select: { duration: true },
                })
              : undefined);
          if (!project) return this.booleanResult(false, 'reservation_window_project_missing');
          const window = normalizeReservationWindow({
            appointmentTime: input.args.appointmentTime,
            duration: input.args.duration,
            fallbackDuration: project.duration,
          });
          await assertReservationWindowAvailable(this.prisma, {
            ...window,
            storeId: input.storeId,
            beauticianId: this.positiveId(input.args.beauticianId) ?? current?.beauticianId,
            excludeReservationId: current?.id,
          });
          return this.booleanResult(true, 'reservation_window_available');
        } catch (error) {
          if (error instanceof BadRequestException || error instanceof ConflictException) {
            return this.booleanResult(false, 'reservation_window_conflict');
          }
          throw error;
        }
      }
      case 'reservation_belongs_to_context_store': {
        const reservationId = this.positiveId(input.args.reservationId);
        if (!reservationId) return this.booleanResult(false, 'reservation_id_invalid');
        const reservation = await this.prisma.reservation.findFirst({
          where: { id: reservationId, storeId: input.storeId },
          select: { id: true, status: true, updatedAt: true },
        });
        if (!reservation) return this.booleanResult(false, 'reservation_not_in_context_store');
        const expectedUpdatedAt = this.timestamp(input.args.expectedReservationUpdatedAt);
        if (!expectedUpdatedAt) return this.booleanResult(false, 'reservation_version_snapshot_missing');
        if (reservation.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          return this.booleanResult(false, 'reservation_version_changed_reapproval_required');
        }
        const final = ['completed', '已完成'].includes(String(reservation.status));
        const cancelled = ['cancelled', 'canceled', '已取消'].includes(String(reservation.status));
        const actionable = !final && !cancelled;
        return this.booleanResult(actionable, 'reservation_actionable_in_context_store');
      }
      default:
        throw new Error(`action_predicate_evaluator_missing:${evaluatorKey}`);
    }
  }

  private async observeEffect(
    contract: CuratedActionEffectContract,
    input: {
      action: BusinessActionDefinitionSnapshot;
      storeId: number;
      args: Record<string, unknown>;
      receipt: BrainCapabilityReceipt;
    },
    now: Date,
    verificationDeadline?: string,
  ): Promise<BrainActionEffectObservation> {
    let status: BrainActionEffectStatus = 'unknown';
    let evidenceCode = 'effect_observation_unavailable';
    try {
      const objectId = this.positiveId(input.receipt.businessObjectId);
      if (!objectId) {
        status = 'unobserved';
        evidenceCode = 'receipt_business_object_id_invalid';
      } else {
        const result = await this.observeEffectValue(contract.observerKey, objectId, input);
        status = result.observed ? 'observed' : 'unobserved';
        evidenceCode = result.code;
      }
    } catch (error) {
      status = 'unknown';
      evidenceCode = this.errorCode(error);
    }
    return {
      effectKey: contract.key,
      version: contract.version,
      fingerprint: contract.fingerprint,
      status,
      evidenceCode,
      observedAt: now.toISOString(),
      verificationDeadline:
        verificationDeadline ?? new Date(now.getTime() + contract.verificationDeadlineMs).toISOString(),
    };
  }

  private async observeEffectValue(
    observerKey: string,
    objectId: number,
    input: {
      storeId: number;
      args: Record<string, unknown>;
      receipt: BrainCapabilityReceipt;
    },
  ): Promise<{ observed: boolean; code: string }> {
    switch (observerKey) {
      case 'customer_created_in_context_store': {
        const row = await this.prisma.customer.findFirst({
          where: { id: objectId, storeId: input.storeId, deletedAt: null },
          select: { id: true, name: true, phone: true },
        });
        const observed = Boolean(
          row && row.name === this.text(input.args.name) && String(row.phone ?? '') === this.text(input.args.phone),
        );
        return { observed, code: observed ? 'customer_created_observed' : 'customer_creation_payload_mismatch' };
      }
      case 'purchase_order_draft_created_in_context_store': {
        const row = await this.prisma.purchaseOrder.findFirst({
          where: { id: objectId, storeId: input.storeId },
          select: { id: true, status: true, creationFingerprint: true },
        });
        const expectedFingerprint = buildPurchaseOrderCreationFingerprint({
          ...input.args,
          storeId: input.storeId,
          source: 'ami_brain',
          status: '草稿',
        });
        const observed = Boolean(
          row && String(row.status) === '草稿' && row.creationFingerprint === expectedFingerprint,
        );
        return {
          observed,
          code: observed ? 'purchase_order_draft_created_observed' : 'purchase_order_creation_payload_mismatch',
        };
      }
      case 'purchase_order_submitted_for_approval': {
        const mutation = await this.observeBusinessMutationReceipt({
          capabilityKey: 'submit_purchase_order_for_approval',
          businessObjectType: 'purchase_order',
          mutationKind: 'state_transition',
          requiredChangedFields: ['status'],
          objectId,
          input,
        });
        return {
          observed: mutation.observed,
          code: mutation.observed ? 'purchase_order_submission_mutation_receipt_observed' : mutation.code,
        };
      }
      case 'reservation_created_in_context_store': {
        const row = await this.prisma.reservation.findFirst({
          where: { id: objectId, storeId: input.storeId },
          select: { id: true, creationFingerprint: true },
        });
        const expectedFingerprint = buildReservationCreationFingerprint({
          ...input.args,
          storeId: input.storeId,
          bookingSource: 'ami_brain',
        });
        const observed = Boolean(row && row.creationFingerprint === expectedFingerprint);
        return {
          observed,
          code: observed ? 'reservation_created_observed' : 'reservation_creation_payload_mismatch',
        };
      }
      case 'reservation_time_updated': {
        const mutation = await this.observeBusinessMutationReceipt({
          capabilityKey: 'reschedule_reservation',
          businessObjectType: 'reservation',
          mutationKind: 'update',
          requiredChangedFields: ['date', 'startTime', 'endTime', 'beauticianId', 'projectId'],
          objectId,
          input,
        });
        return {
          observed: mutation.observed,
          code: mutation.observed ? 'reservation_time_mutation_receipt_observed' : mutation.code,
        };
      }
      case 'reservation_cancelled': {
        const mutation = await this.observeBusinessMutationReceipt({
          capabilityKey: 'cancel_reservation',
          businessObjectType: 'reservation',
          mutationKind: 'state_transition',
          requiredChangedFields: ['status'],
          objectId,
          input,
        });
        return {
          observed: mutation.observed,
          code: mutation.observed ? 'reservation_cancel_mutation_receipt_observed' : mutation.code,
        };
      }
      default:
        throw new Error(`action_effect_observer_missing:${observerKey}`);
    }
  }

  private assertActionContracts(action: BusinessActionDefinitionSnapshot) {
    const predicateKeys = action.preconditionPredicateRefs.map((item) => item.key).sort();
    const effectKeys = action.effectAssertionRefs.map((item) => item.key).sort();
    if (JSON.stringify(predicateKeys) !== JSON.stringify([...action.preconditions].sort())) {
      throw new BadRequestException(`action_predicate_contract_set_mismatch:${action.actionKey}`);
    }
    if (JSON.stringify(effectKeys) !== JSON.stringify([...action.effects].sort())) {
      throw new BadRequestException(`action_effect_contract_set_mismatch:${action.actionKey}`);
    }
  }

  private effectContracts(action: BusinessActionDefinitionSnapshot): readonly CuratedActionEffectContract[] {
    return action.effectAssertionRefs.map((reference) => {
      const contract = resolveCuratedActionEffectContract(reference);
      if (!contract) throw new BadRequestException(`action_effect_contract_drift:${reference.key}`);
      return contract;
    });
  }

  private assertEffectObservationContracts(
    contracts: readonly CuratedActionEffectContract[],
    observations: readonly BrainActionEffectObservation[],
  ) {
    if (contracts.length !== observations.length) {
      throw new BadRequestException('action_effect_observation_set_mismatch');
    }
    const observationByKey = new Map(observations.map((item) => [item.effectKey, item]));
    for (const contract of contracts) {
      const observation = observationByKey.get(contract.key);
      if (
        !observation ||
        observation.version !== contract.version ||
        observation.fingerprint !== contract.fingerprint ||
        !this.timestamp(observation.observedAt) ||
        !this.timestamp(observation.verificationDeadline)
      ) {
        throw new BadRequestException(`action_effect_observation_contract_drift:${contract.key}`);
      }
    }
  }

  private earliestTimestamp(values: readonly string[], fallback: Date) {
    const timestamps = values
      .map((value) => this.timestamp(value))
      .filter((value): value is Date => Boolean(value))
      .map((value) => value.getTime());
    return timestamps.length ? new Date(Math.min(...timestamps)) : fallback;
  }

  private latestTimestamp(values: readonly string[], fallback: Date) {
    const timestamps = values
      .map((value) => this.timestamp(value))
      .filter((value): value is Date => Boolean(value))
      .map((value) => value.getTime());
    return timestamps.length ? new Date(Math.max(...timestamps)) : fallback;
  }

  private async findCommittedBusinessObject(input: {
    capabilityKey: string;
    storeId: number;
    args: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<
    | {
        id: number;
        businessObjectType: string;
        result: unknown;
        mutationReceipt?: BusinessMutationReceipt;
      }
    | undefined
  > {
    switch (input.capabilityKey) {
      case 'create_customer': {
        const writeSet = await loadBusinessDatabaseWriteSet(this.prisma, {
          storeId: input.storeId,
          capabilityKey: input.capabilityKey,
          idempotencyKey: input.idempotencyKey,
        });
        const customerEntry = writeSet?.entries.find(
          (entry) => entry.modelName === 'Customer' && entry.operation === 'create',
        );
        const customerId = this.positiveId(customerEntry?.rowIdentity.id);
        if (!customerId) return undefined;
        const row = await this.prisma.customer.findFirst({
          where: { id: customerId, storeId: input.storeId, deletedAt: null },
          select: { id: true, storeId: true, name: true, phone: true },
        });
        if (!row) return undefined;
        if (row.name !== this.text(input.args.name) || String(row.phone ?? '') !== this.text(input.args.phone)) {
          throw new BadRequestException('action_idempotency_payload_conflict:create_customer');
        }
        return { id: row.id, businessObjectType: 'customer', result: row };
      }
      case 'create_reservation': {
        const idempotencyKey = buildReservationIdempotencyKey(input.storeId, 'ami_brain', input.idempotencyKey);
        if (!idempotencyKey) return undefined;
        const row = await this.prisma.reservation.findUnique({
          where: { idempotencyKey },
          select: {
            id: true,
            storeId: true,
            status: true,
            date: true,
            startTime: true,
            creationFingerprint: true,
          },
        });
        if (row) {
          const expectedFingerprint = buildReservationCreationFingerprint({
            ...input.args,
            storeId: input.storeId,
            bookingSource: 'ami_brain',
          });
          if (row.creationFingerprint !== expectedFingerprint) {
            throw new BadRequestException('action_idempotency_payload_conflict:create_reservation');
          }
        }
        return row?.storeId === input.storeId
          ? { id: row.id, businessObjectType: 'reservation', result: row }
          : undefined;
      }
      case 'create_purchase_order': {
        const idempotencyKey = buildPurchaseOrderIdempotencyKey(input.storeId, 'ami_brain', input.idempotencyKey);
        if (!idempotencyKey) return undefined;
        const row = await this.prisma.purchaseOrder.findUnique({
          where: { idempotencyKey },
          select: { id: true, storeId: true, status: true, creationFingerprint: true },
        });
        if (row) {
          const expectedFingerprint = buildPurchaseOrderCreationFingerprint({
            ...input.args,
            storeId: input.storeId,
            source: 'ami_brain',
            status: '草稿',
          });
          if (row.creationFingerprint !== expectedFingerprint) {
            throw new BadRequestException('action_idempotency_payload_conflict:create_purchase_order');
          }
        }
        return row?.storeId === input.storeId
          ? { id: row.id, businessObjectType: 'purchase_order', result: row }
          : undefined;
      }
      case 'submit_purchase_order_for_approval': {
        const row = await this.prisma.businessMutationReceipt.findUnique({
          where: {
            storeId_capabilityKey_idempotencyKey: {
              storeId: input.storeId,
              capabilityKey: input.capabilityKey,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (!row) return undefined;
        const objectId = this.positiveId(row.businessObjectId);
        if (!objectId || row.businessObjectType !== 'purchase_order') {
          throw new BadRequestException(`action_mutation_receipt_object_invalid:${input.capabilityKey}`);
        }
        const expectedFingerprint = buildBusinessMutationRequestFingerprint({
          capabilityKey: input.capabilityKey,
          storeId: input.storeId,
          businessObjectType: 'purchase_order',
          businessObjectId: objectId,
          requestPayload: input.args,
        });
        if (row.requestFingerprint !== expectedFingerprint) {
          throw new BadRequestException(`action_idempotency_payload_conflict:${input.capabilityKey}`);
        }
        const mutationReceipt = restoreBusinessMutationReceipt(row);
        return {
          id: objectId,
          businessObjectType: 'purchase_order',
          result: { id: objectId, mutationReceipt, mutationReplayed: true },
          mutationReceipt,
        };
      }
      case 'reschedule_reservation':
      case 'cancel_reservation': {
        const row = await this.prisma.businessMutationReceipt.findUnique({
          where: {
            storeId_capabilityKey_idempotencyKey: {
              storeId: input.storeId,
              capabilityKey: input.capabilityKey,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (!row) return undefined;
        const objectId = this.positiveId(row.businessObjectId);
        if (!objectId || row.businessObjectType !== 'reservation') {
          throw new BadRequestException(`action_mutation_receipt_object_invalid:${input.capabilityKey}`);
        }
        const expectedFingerprint = buildBusinessMutationRequestFingerprint({
          capabilityKey: input.capabilityKey,
          storeId: input.storeId,
          businessObjectType: 'reservation',
          businessObjectId: objectId,
          requestPayload: input.args,
        });
        if (row.requestFingerprint !== expectedFingerprint) {
          throw new BadRequestException(`action_idempotency_payload_conflict:${input.capabilityKey}`);
        }
        const mutationReceipt = restoreBusinessMutationReceipt(row);
        return {
          id: objectId,
          businessObjectType: 'reservation',
          result: { id: objectId, mutationReceipt, mutationReplayed: true },
          mutationReceipt,
        };
      }
      default:
        return undefined;
    }
  }

  private async observeBusinessMutationReceipt(input: {
    capabilityKey: 'reschedule_reservation' | 'cancel_reservation' | 'submit_purchase_order_for_approval';
    businessObjectType: 'reservation' | 'purchase_order';
    mutationKind: 'update' | 'state_transition';
    requiredChangedFields: readonly string[];
    objectId: number;
    input: { storeId: number; args: Record<string, unknown>; receipt: BrainCapabilityReceipt };
  }): Promise<{ observed: boolean; code: string }> {
    const claimed = input.input.receipt.mutationReceipt;
    if (!claimed) return { observed: false, code: 'business_mutation_receipt_missing' };
    if (
      claimed.schemaVersion !== '1.0' ||
      claimed.capabilityKey !== input.capabilityKey ||
      claimed.storeId !== input.input.storeId ||
      claimed.businessObjectType !== input.businessObjectType ||
      claimed.businessObjectId !== String(input.objectId) ||
      claimed.mutationKind !== input.mutationKind
    ) {
      return { observed: false, code: 'business_mutation_receipt_identity_mismatch' };
    }
    const expectedRequestFingerprint = buildBusinessMutationRequestFingerprint({
      capabilityKey: input.capabilityKey,
      storeId: input.input.storeId,
      businessObjectType: input.businessObjectType,
      businessObjectId: input.objectId,
      requestPayload: input.input.args,
    });
    if (claimed.requestFingerprint !== expectedRequestFingerprint) {
      return { observed: false, code: 'business_mutation_receipt_request_mismatch' };
    }
    const persisted = await this.prisma.businessMutationReceipt.findUnique({
      where: { receiptFingerprint: claimed.receiptFingerprint },
    });
    if (!persisted) return { observed: false, code: 'business_mutation_receipt_not_persisted' };
    let restored: BusinessMutationReceipt;
    try {
      restored = restoreBusinessMutationReceipt(persisted);
    } catch {
      return { observed: false, code: 'business_mutation_receipt_fingerprint_invalid' };
    }
    if (
      restored.receiptFingerprint !== claimed.receiptFingerprint ||
      restored.requestFingerprint !== expectedRequestFingerprint ||
      restored.before.version !== claimed.before.version ||
      restored.after.version !== claimed.after.version ||
      restored.after.stateFingerprint !== claimed.after.stateFingerprint
    ) {
      return { observed: false, code: 'business_mutation_receipt_persistence_mismatch' };
    }
    const hasExpectedChange = restored.changedFields.some((field) => input.requiredChangedFields.includes(field));
    return hasExpectedChange
      ? { observed: true, code: 'business_mutation_receipt_observed' }
      : { observed: false, code: 'business_mutation_receipt_no_expected_change' };
  }

  private booleanResult(satisfied: boolean, code: string) {
    return { satisfied, code };
  }

  private items(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
  }

  private positiveId(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private timestamp(value: unknown): Date | undefined {
    const date = new Date(this.text(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private errorCode(error: unknown) {
    if (!error || typeof error !== 'object') return 'unknown_error';
    const record = error as { code?: unknown; name?: unknown };
    if (typeof record.code === 'string' && record.code) return record.code;
    return typeof record.name === 'string' && record.name ? record.name : 'unknown_error';
  }
}
