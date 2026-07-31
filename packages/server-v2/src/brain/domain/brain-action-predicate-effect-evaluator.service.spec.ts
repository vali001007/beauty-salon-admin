import { BadRequestException } from '@nestjs/common';
import {
  curatedActionEffectRef,
  curatedActionPredicateRef,
} from '../../semantic-data/brain-action-predicate-effect-catalog.js';
import { buildPurchaseOrderCreationFingerprint } from '../../inventory/purchase-order-idempotency.js';
import { buildReservationCreationFingerprint } from '../../reservations/reservation-idempotency.js';
import {
  buildBusinessMutationReceipt,
  buildBusinessMutationRequestFingerprint,
} from '../../common/mutation-receipt.js';
import { createTestPersistedBusinessDatabaseWriteSet } from '../../common/database-write-set.testing.js';
import { BrainActionPredicateEffectEvaluatorService } from './brain-action-predicate-effect-evaluator.service.js';

describe('BrainActionPredicateEffectEvaluatorService', () => {
  it('evaluates every governed purchase precondition with fresh deterministic evidence', async () => {
    const prisma = prismaFixture();
    prisma.product.count.mockResolvedValue(1);
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.create_purchase_order',
      [
        'context_store_resolved',
        'product_belongs_to_context_store',
        'quantity_positive',
        'supplier_present_before_execution',
      ],
      ['purchase_order_draft_created_in_context_store'],
    );

    const result = await service.assertPreconditions({
      action: action as never,
      capabilityKey: 'create_purchase_order',
      storeId: 6,
      args: { supplier: '供应商 A', items: [{ productId: 8, quantity: 3 }] },
      now: new Date('2026-07-30T10:00:00.000Z'),
    });

    expect(result).toHaveLength(4);
    expect(result.every((item) => item.status === 'satisfied')).toBe(true);
    expect(result.map((item) => item.predicateKey)).toEqual(action.preconditions);
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: { id: { in: [8] }, storeId: 6, deletedAt: null },
    });
  });

  it('fails closed when a product is outside the current store', async () => {
    const prisma = prismaFixture();
    prisma.product.count.mockResolvedValue(0);
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.create_purchase_order',
      ['product_belongs_to_context_store'],
      ['purchase_order_draft_created_in_context_store'],
    );

    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'create_purchase_order',
        storeId: 6,
        args: { items: [{ productId: 8, quantity: 3 }] },
      }),
    ).rejects.toThrow('action_precondition_violated:product_belongs_to_context_store');
  });

  it('checks the same beautician window during preview and rejects an overlapping reservation', async () => {
    const prisma = prismaFixture();
    prisma.project.findFirst.mockResolvedValue({ duration: 60 });
    prisma.reservation.findMany.mockResolvedValue([
      { id: 88, startTime: '15:30', endTime: '16:30', project: { duration: 60 } },
    ]);
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.create_reservation',
      ['reservation_window_available'],
      ['reservation_created_in_context_store'],
    );

    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'create_reservation',
        storeId: 6,
        args: {
          projectId: 22,
          beauticianId: 31,
          appointmentTime: '2026-08-01 15:00:00',
          duration: 60,
        },
        phase: 'preview',
      }),
    ).rejects.toThrow('action_precondition_violated:reservation_window_available:reservation_window_conflict');
  });

  it('rechecks unknown evidence once and then rejects instead of treating it as false or satisfied', async () => {
    const prisma = prismaFixture();
    prisma.product.count.mockRejectedValue(Object.assign(new Error('connection failed'), { code: 'P1001' }));
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.create_purchase_order',
      ['product_belongs_to_context_store'],
      ['purchase_order_draft_created_in_context_store'],
    );

    const error = await service
      .assertPreconditions({
        action: action as never,
        capabilityKey: 'create_purchase_order',
        storeId: 6,
        args: { items: [{ productId: 8, quantity: 3 }] },
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(String((error as Error).message)).toContain(
      'action_precondition_unknown:product_belongs_to_context_store:P1001',
    );
    expect(prisma.product.count).toHaveBeenCalledTimes(2);
  });

  it('accepts purchase order submission only for the frozen draft version in the current store', async () => {
    const prisma = prismaFixture();
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 31,
      status: '草稿',
      updatedAt: new Date('2026-07-30T10:00:00.000Z'),
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.submit_purchase_order_for_approval',
      ['context_store_resolved', 'purchase_order_draft_belongs_to_context_store'],
      ['purchase_order_submitted_for_approval'],
    );

    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'submit_purchase_order_for_approval',
        storeId: 6,
        args: { purchaseOrderId: 31, expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ predicateKey: 'context_store_resolved', status: 'satisfied' }),
      expect.objectContaining({
        predicateKey: 'purchase_order_draft_belongs_to_context_store',
        status: 'satisfied',
      }),
    ]);
  });

  it('rejects purchase order submission after the frozen version becomes stale', async () => {
    const prisma = prismaFixture();
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 31,
      status: '草稿',
      updatedAt: new Date('2026-07-30T10:00:01.000Z'),
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.submit_purchase_order_for_approval',
      ['purchase_order_draft_belongs_to_context_store'],
      ['purchase_order_submitted_for_approval'],
    );

    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'submit_purchase_order_for_approval',
        storeId: 6,
        args: { purchaseOrderId: 31, expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' },
      }),
    ).rejects.toThrow('purchase_order_version_changed_reapproval_required');
  });

  it('rejects purchase order submission when the target is no longer a draft', async () => {
    const prisma = prismaFixture();
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 31,
      status: '待审核',
      updatedAt: new Date('2026-07-30T10:00:00.000Z'),
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.submit_purchase_order_for_approval',
      ['purchase_order_draft_belongs_to_context_store'],
      ['purchase_order_submitted_for_approval'],
    );

    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'submit_purchase_order_for_approval',
        storeId: 6,
        args: { purchaseOrderId: 31, expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' },
      }),
    ).rejects.toThrow('action_precondition_violated:purchase_order_draft_belongs_to_context_store');
  });

  it('does not attribute a cancellation from final state without a persisted causal receipt', async () => {
    const prisma = prismaFixture();
    prisma.reservation.findFirst.mockResolvedValue({
      id: 31,
      status: 'cancelled',
      updatedAt: new Date('2026-07-30T10:00:01.000Z'),
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.cancel_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_cancelled'],
    );

    const observations = await service.observeEffects({
      action: action as never,
      storeId: 6,
      args: { reservationId: 31, expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z' },
      receipt: {
        capabilityKey: 'cancel_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 31,
        result: { status: 'cancelled' },
      },
      now: new Date('2026-07-30T10:00:00.000Z'),
    });

    expect(observations).toEqual([
      expect.objectContaining({
        effectKey: 'reservation_cancelled',
        status: 'unobserved',
        evidenceCode: 'business_mutation_receipt_missing',
      }),
    ]);
  });

  it('observes a cancellation only when its causal receipt was committed with the mutation', async () => {
    const prisma = prismaFixture();
    const args = { reservationId: 31, expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z' };
    const mutation = mutationEvidence('cancel_reservation', args, ['status']);
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(mutation.row);
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.cancel_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_cancelled'],
    );

    await expect(
      service.observeEffects({
        action: action as never,
        storeId: 6,
        args,
        receipt: mutation.capabilityReceipt,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'observed',
        evidenceCode: 'reservation_cancel_mutation_receipt_observed',
      }),
    ]);
  });

  it('rechecks an unobserved effect only after the governed interval and preserves the original deadline', async () => {
    const prisma = prismaFixture();
    const args = { reservationId: 31, expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z' };
    const mutation = mutationEvidence('cancel_reservation', args, ['status']);
    prisma.businessMutationReceipt.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(mutation.row);
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.cancel_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_cancelled'],
    );
    const receipt = mutation.capabilityReceipt;
    const initialNow = new Date('2026-07-30T10:00:00.000Z');
    const initial = await service.observeEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      now: initialNow,
    });
    const reconciliation = service.buildEffectReconciliation({
      action: action as never,
      effectObservations: initial,
      now: initialNow,
    });

    expect(reconciliation).toMatchObject({
      status: 'pending',
      attemptCount: 1,
      maxAttempts: 3,
      nextAttemptAt: '2026-07-30T10:00:00.500Z',
      verificationDeadline: '2026-07-30T10:00:05.000Z',
    });
    const tooEarly = await service.reconcileEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      previousObservations: initial,
      reconciliation,
      now: new Date('2026-07-30T10:00:00.250Z'),
    });
    expect(tooEarly.reconciliation.attemptCount).toBe(1);
    expect(prisma.businessMutationReceipt.findUnique).toHaveBeenCalledTimes(1);

    const reconciled = await service.reconcileEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      previousObservations: initial,
      reconciliation,
      now: new Date('2026-07-30T10:00:00.500Z'),
    });
    expect(reconciled.effectObservations).toEqual([
      expect.objectContaining({
        status: 'observed',
        verificationDeadline: '2026-07-30T10:00:05.000Z',
      }),
    ]);
    expect(reconciled.reconciliation).toMatchObject({
      status: 'succeeded',
      attemptCount: 2,
      reasonCode: 'all_effects_observed',
    });
    expect(prisma.businessMutationReceipt.findUnique).toHaveBeenCalledTimes(2);
  });

  it('stops effect reconciliation at the fixed deadline without replaying the action', async () => {
    const prisma = prismaFixture();
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.cancel_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_cancelled'],
    );
    const receipt = {
      capabilityKey: 'cancel_reservation',
      businessObjectType: 'reservation',
      businessObjectId: 31,
      result: { status: 'cancelled' },
    };
    const args = { reservationId: 31, expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z' };
    const initialNow = new Date('2026-07-30T10:00:00.000Z');
    const initial = await service.observeEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      now: initialNow,
    });
    const reconciliation = service.buildEffectReconciliation({
      action: action as never,
      effectObservations: initial,
      now: initialNow,
    });

    const expired = await service.reconcileEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      previousObservations: initial,
      reconciliation,
      now: new Date('2026-07-30T10:00:05.000Z'),
    });

    expect(expired.reconciliation).toMatchObject({
      status: 'manual_reconcile_required',
      attemptCount: 1,
      reasonCode: 'effect_verification_deadline_exceeded',
      nextAttemptAt: null,
    });
    expect(prisma.businessMutationReceipt.findUnique).not.toHaveBeenCalled();
  });

  it('exhausts the governed observation count before the deadline and requires manual reconciliation', async () => {
    const prisma = prismaFixture();
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.cancel_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_cancelled'],
    );
    const receipt = {
      capabilityKey: 'cancel_reservation',
      businessObjectType: 'reservation',
      businessObjectId: 31,
      result: { status: 'cancelled' },
    };
    const args = { reservationId: 31, expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z' };
    const initialNow = new Date('2026-07-30T10:00:00.000Z');
    const initial = await service.observeEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      now: initialNow,
    });
    const initialReconciliation = service.buildEffectReconciliation({
      action: action as never,
      effectObservations: initial,
      now: initialNow,
    });
    const second = await service.reconcileEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      previousObservations: initial,
      reconciliation: initialReconciliation,
      now: new Date('2026-07-30T10:00:00.500Z'),
    });
    const third = await service.reconcileEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt,
      previousObservations: second.effectObservations,
      reconciliation: second.reconciliation,
      now: new Date('2026-07-30T10:00:01.000Z'),
    });

    expect(second.reconciliation).toMatchObject({ status: 'pending', attemptCount: 2 });
    expect(third.reconciliation).toMatchObject({
      status: 'manual_reconcile_required',
      attemptCount: 3,
      reasonCode: 'effect_observation_attempts_exhausted',
      verificationDeadline: '2026-07-30T10:00:05.000Z',
    });
    expect(prisma.businessMutationReceipt.findUnique).not.toHaveBeenCalled();
  });

  it('runs execution-only predicates only after the user confirms the preview', async () => {
    const service = new BrainActionPredicateEffectEvaluatorService(prismaFixture() as never);
    const action = actionDefinition(
      'action.create_customer',
      ['customer_name_present', 'customer_phone_valid_before_execution'],
      ['customer_created_in_context_store'],
    );

    const preview = await service.assertPreconditions({
      action: action as never,
      capabilityKey: 'create_customer',
      storeId: 6,
      args: { name: '王静怡', phone: '138xxxx807' },
      phase: 'preview',
    });

    expect(preview.map((item) => item.predicateKey)).toEqual(['customer_name_present']);
    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'create_customer',
        storeId: 6,
        args: { name: '王静怡', phone: '138xxxx807' },
        phase: 'execution',
      }),
    ).rejects.toThrow('action_precondition_violated:customer_phone_valid_before_execution');
  });

  it('rejects a cancellation preview when the reservation is already cancelled', async () => {
    const prisma = prismaFixture();
    prisma.reservation.findFirst.mockResolvedValue({
      id: 31,
      status: 'cancelled',
      updatedAt: new Date('2026-07-30T10:00:00.000Z'),
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.cancel_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_cancelled'],
    );

    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'cancel_reservation',
        storeId: 6,
        args: { reservationId: 31, expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z' },
        phase: 'preview',
      }),
    ).rejects.toThrow('action_precondition_violated:reservation_belongs_to_context_store');
  });

  it('observes a reschedule from its persisted causal receipt even when the approved time uses UTC text', async () => {
    const prisma = prismaFixture();
    const args = {
      reservationId: 31,
      appointmentTime: '2026-07-13T16:30:00.000Z',
      expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
    };
    const mutation = mutationEvidence('reschedule_reservation', args, ['date', 'startTime']);
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(mutation.row);
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.reschedule_reservation',
      ['reservation_belongs_to_context_store', 'appointment_time_resolved'],
      ['reservation_time_updated'],
    );

    const observations = await service.observeEffects({
      action: action as never,
      storeId: 6,
      args,
      receipt: mutation.capabilityReceipt,
    });

    expect(observations).toEqual([
      expect.objectContaining({ effectKey: 'reservation_time_updated', status: 'observed' }),
    ]);
  });

  it('does not attribute a matching reservation state to a failed mutation without a causal receipt', async () => {
    const prisma = prismaFixture();
    prisma.reservation.findFirst.mockResolvedValue({
      id: 31,
      storeId: 6,
      status: 'confirmed',
      date: new Date('2026-07-14T07:00:00.000Z'),
      startTime: '15:00',
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.reschedule_reservation',
      ['reservation_belongs_to_context_store', 'appointment_time_resolved'],
      ['reservation_time_updated'],
    );

    const receipt = await service.recoverCommittedEffect({
      action: action as never,
      capabilityKey: 'reschedule_reservation',
      storeId: 6,
      args: { reservationId: 31, appointmentTime: '2026-07-14T07:00:00.000Z' },
      idempotencyKey: 'retry-31',
      now: new Date('2026-07-30T10:00:00.000Z'),
    });

    expect(receipt).toBeUndefined();
    expect(prisma.reservation.findFirst).not.toHaveBeenCalled();
  });

  it('recovers a committed reservation mutation by idempotency identity without replaying it', async () => {
    const prisma = prismaFixture();
    const args = {
      reservationId: 31,
      appointmentTime: '2026-08-01 16:00:00',
      expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
    };
    const mutation = mutationEvidence('reschedule_reservation', args, ['startTime']);
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(mutation.row);
    prisma.businessDatabaseWriteSet.findUnique.mockResolvedValue(
      persistedWriteSet('reschedule_reservation', mutation.row.idempotencyKey, 'Reservation', 'update', ['startTime']),
    );
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.reschedule_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_time_updated'],
    );

    await expect(
      service.recoverCommittedEffect({
        action: action as never,
        capabilityKey: 'reschedule_reservation',
        storeId: 6,
        args,
        idempotencyKey: 'brain-action-reschedule_reservation-31',
      }),
    ).resolves.toMatchObject({
      status: 'succeeded',
      recovered: true,
      mutationReceipt: { receiptFingerprint: mutation.receipt.receiptFingerprint },
      databaseWriteSet: { capabilityKey: 'reschedule_reservation' },
      effectObservations: [expect.objectContaining({ status: 'observed' })],
    });
  });

  it('captures and enforces the reservation version used by the approval preview', async () => {
    const prisma = prismaFixture();
    prisma.reservation.findFirst
      .mockResolvedValueOnce({ updatedAt: new Date('2026-07-30T10:00:00.000Z') })
      .mockResolvedValueOnce({
        id: 31,
        status: 'confirmed',
        updatedAt: new Date('2026-07-30T10:00:01.000Z'),
      });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.reschedule_reservation',
      ['reservation_belongs_to_context_store'],
      ['reservation_time_updated'],
    );

    const args = await service.captureApprovalEvidence({
      action: action as never,
      storeId: 6,
      args: { reservationId: 31, appointmentTime: '2026-08-01T10:00:00.000Z' },
    });

    expect(args.expectedReservationUpdatedAt).toBe('2026-07-30T10:00:00.000Z');
    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'reschedule_reservation',
        storeId: 6,
        args,
      }),
    ).rejects.toThrow('reservation_version_changed_reapproval_required');
  });

  it('observes create effects only when the business object matches the approved payload fingerprint', async () => {
    const prisma = prismaFixture();
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const purchaseArgs = { supplier: '供应商 A', items: [{ productId: 8, quantity: 3 }] };
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 41,
      status: '草稿',
      creationFingerprint: buildPurchaseOrderCreationFingerprint({
        ...purchaseArgs,
        storeId: 6,
        source: 'ami_brain',
        status: '草稿',
      }),
    });
    const reservationArgs = {
      customerId: 11,
      projectId: 22,
      appointmentTime: '2026-08-01T07:00:00.000Z',
    };
    prisma.reservation.findFirst.mockResolvedValue({
      id: 42,
      creationFingerprint: buildReservationCreationFingerprint({
        ...reservationArgs,
        storeId: 6,
        bookingSource: 'ami_brain',
      }),
    });

    await expect(
      service.observeEffects({
        action: actionDefinition(
          'action.create_purchase_order',
          [],
          ['purchase_order_draft_created_in_context_store'],
        ) as never,
        storeId: 6,
        args: purchaseArgs,
        receipt: {
          capabilityKey: 'create_purchase_order',
          businessObjectType: 'purchase_order',
          businessObjectId: 41,
          result: {},
        },
      }),
    ).resolves.toEqual([expect.objectContaining({ status: 'observed' })]);
    await expect(
      service.observeEffects({
        action: actionDefinition('action.create_reservation', [], ['reservation_created_in_context_store']) as never,
        storeId: 6,
        args: reservationArgs,
        receipt: {
          capabilityKey: 'create_reservation',
          businessObjectType: 'reservation',
          businessObjectId: 42,
          result: {},
        },
      }),
    ).resolves.toEqual([expect.objectContaining({ status: 'observed' })]);
  });

  it('requires a persisted purchase-order mutation receipt before observing submission', async () => {
    const prisma = prismaFixture();
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(null);
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const args = { purchaseOrderId: 31, expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' };

    await expect(
      service.observeEffects({
        action: actionDefinition(
          'action.submit_purchase_order_for_approval',
          ['purchase_order_draft_belongs_to_context_store'],
          ['purchase_order_submitted_for_approval'],
        ) as never,
        storeId: 6,
        args,
        receipt: {
          capabilityKey: 'submit_purchase_order_for_approval',
          businessObjectType: 'purchase_order',
          businessObjectId: 31,
          result: { status: '待审核' },
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ status: 'unobserved', evidenceCode: 'business_mutation_receipt_missing' }),
    ]);
  });

  it('observes and recovers purchase-order submission from its persisted causal receipt', async () => {
    const prisma = prismaFixture();
    const args = { purchaseOrderId: 31, expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' };
    const mutation = mutationEvidence('submit_purchase_order_for_approval', args, ['status']);
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(mutation.row);
    prisma.businessDatabaseWriteSet.findUnique.mockResolvedValue(
      persistedWriteSet('submit_purchase_order_for_approval', mutation.row.idempotencyKey, 'PurchaseOrder', 'update', [
        'status',
      ]),
    );
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.submit_purchase_order_for_approval',
      ['purchase_order_draft_belongs_to_context_store'],
      ['purchase_order_submitted_for_approval'],
    );

    await expect(
      service.observeEffects({ action: action as never, storeId: 6, args, receipt: mutation.capabilityReceipt }),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'observed',
        evidenceCode: 'purchase_order_submission_mutation_receipt_observed',
      }),
    ]);
    await expect(
      service.recoverCommittedEffect({
        action: action as never,
        capabilityKey: 'submit_purchase_order_for_approval',
        storeId: 6,
        args,
        idempotencyKey: mutation.row.idempotencyKey,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'succeeded',
        recovered: true,
        businessObjectId: 31,
        businessObjectType: 'purchase_order',
        mutationReceipt: expect.objectContaining({ changedFields: ['status'] }),
        databaseWriteSet: expect.objectContaining({ capabilityKey: 'submit_purchase_order_for_approval' }),
      }),
    );
  });

  it('recovers customer creation from the transaction write-set without creating a duplicate', async () => {
    const prisma = prismaFixture();
    const idempotencyKey = 'customer-create-1256';
    prisma.businessDatabaseWriteSet.findUnique.mockResolvedValue(
      createTestPersistedBusinessDatabaseWriteSet({
        capabilityKey: 'create_customer',
        idempotencyKey,
        businessObjectId: 1256,
        entries: [
          {
            modelName: 'Customer',
            tableName: 'Customer',
            operation: 'create',
            changedFields: ['id', 'name', 'phone', 'storeId'],
            afterStateFingerprint: '3'.repeat(64),
          },
          {
            modelName: 'CustomerHealthProfile',
            tableName: 'CustomerHealthProfile',
            operation: 'create',
            changedFields: ['customerId', 'id'],
            afterStateFingerprint: '4'.repeat(64),
          },
        ],
      }),
    );
    prisma.customer.findFirst.mockResolvedValue({
      id: 1256,
      storeId: 6,
      name: '王静怡',
      phone: '13800138807',
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.create_customer',
      ['context_store_resolved', 'customer_name_present', 'customer_phone_valid_before_execution'],
      ['customer_created_in_context_store'],
    );

    await expect(
      service.recoverCommittedEffect({
        action: action as never,
        capabilityKey: 'create_customer',
        storeId: 6,
        args: { name: '王静怡', phone: '13800138807' },
        idempotencyKey,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'succeeded',
        recovered: true,
        businessObjectId: 1256,
        businessObjectType: 'customer',
        databaseWriteSet: expect.objectContaining({ capabilityKey: 'create_customer', entryCount: 2 }),
      }),
    );
  });

  it('rejects a committed create object when the idempotency key belongs to different approved arguments', async () => {
    const prisma = prismaFixture();
    prisma.reservation.findUnique.mockResolvedValue({
      id: 32,
      storeId: 6,
      status: 'pending',
      date: new Date('2026-08-01T07:00:00.000Z'),
      startTime: '15:00',
      creationFingerprint: '0'.repeat(64),
    });
    const service = new BrainActionPredicateEffectEvaluatorService(prisma as never);
    const action = actionDefinition(
      'action.create_reservation',
      ['customer_and_project_in_context_store', 'appointment_time_resolved'],
      ['reservation_created_in_context_store'],
    );

    await expect(
      service.recoverCommittedEffect({
        action: action as never,
        capabilityKey: 'create_reservation',
        storeId: 6,
        args: { customerId: 11, projectId: 22, appointmentTime: '2026-08-01T07:00:00.000Z' },
        idempotencyKey: 'reservation-32',
      }),
    ).rejects.toThrow('action_idempotency_payload_conflict:create_reservation');
  });

  it('rejects an ActionDefinition whose string keys and versioned refs are not the same set', async () => {
    const service = new BrainActionPredicateEffectEvaluatorService(prismaFixture() as never);
    const action = actionDefinition(
      'action.create_customer',
      ['context_store_resolved'],
      ['customer_created_in_context_store'],
    );
    action.preconditionPredicateRefs = [];

    await expect(
      service.assertPreconditions({
        action: action as never,
        capabilityKey: 'create_customer',
        storeId: 6,
        args: {},
      }),
    ).rejects.toThrow('action_predicate_contract_set_mismatch:action.create_customer');
  });
});

function actionDefinition(actionKey: string, preconditions: string[], effects: string[]) {
  return {
    actionKey,
    preconditions,
    preconditionPredicateRefs: preconditions.map(curatedActionPredicateRef),
    effects,
    effectAssertionRefs: effects.map(curatedActionEffectRef),
  };
}

function prismaFixture() {
  return {
    product: { count: jest.fn() },
    customer: { findFirst: jest.fn() },
    project: { findFirst: jest.fn() },
    reservation: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    beauticianTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    beauticianAvailability: { findMany: jest.fn().mockResolvedValue([]) },
    purchaseOrder: { findFirst: jest.fn(), findUnique: jest.fn() },
    businessMutationReceipt: { findUnique: jest.fn() },
    businessDatabaseWriteSet: { findUnique: jest.fn() },
  };
}

function persistedWriteSet(
  capabilityKey: string,
  idempotencyKey: string,
  modelName: string,
  operation: 'create' | 'update',
  changedFields: string[],
) {
  return createTestPersistedBusinessDatabaseWriteSet({
    capabilityKey,
    idempotencyKey,
    businessObjectId: 31,
    entries: [
      {
        modelName,
        tableName: modelName,
        operation,
        changedFields: [...changedFields, 'updatedAt'],
        beforeStateFingerprint: '3'.repeat(64),
        afterStateFingerprint: '4'.repeat(64),
      },
      {
        modelName: 'BusinessMutationReceipt',
        tableName: 'business_mutation_receipt',
        operation: 'create',
        changedFields: ['id', 'storeId'],
        afterStateFingerprint: '5'.repeat(64),
      },
    ],
  });
}

function mutationEvidence(
  capabilityKey: 'reschedule_reservation' | 'cancel_reservation' | 'submit_purchase_order_for_approval',
  args: Record<string, unknown>,
  changedFields: string[],
) {
  const businessObjectType = capabilityKey === 'submit_purchase_order_for_approval' ? 'purchase_order' : 'reservation';
  const mutationKind = capabilityKey === 'reschedule_reservation' ? 'update' : 'state_transition';
  const idempotencyKey = `brain-action-${capabilityKey}-31`;
  const requestFingerprint = buildBusinessMutationRequestFingerprint({
    capabilityKey,
    storeId: 6,
    businessObjectType,
    businessObjectId: 31,
    requestPayload: args,
  });
  const receipt = buildBusinessMutationReceipt({
    storeId: 6,
    context: { capabilityKey, idempotencyKey, mutationKind, requestPayload: args },
    businessObjectType,
    businessObjectId: 31,
    requestFingerprint,
    beforeVersion: '2026-07-30T10:00:00.000Z',
    afterVersion: '2026-07-30T10:00:01.000Z',
    beforeStateFingerprint: '1'.repeat(64),
    afterStateFingerprint: '2'.repeat(64),
    changedFields,
    committedAt: new Date('2026-07-30T10:00:01.000Z'),
  });
  const row = {
    storeId: 6,
    capabilityKey,
    idempotencyKey,
    businessObjectType,
    businessObjectId: '31',
    mutationKind,
    requestFingerprint,
    beforeVersion: receipt.before.version,
    afterVersion: receipt.after.version,
    beforeStateFingerprint: receipt.before.stateFingerprint,
    afterStateFingerprint: receipt.after.stateFingerprint,
    changedFields,
    receiptFingerprint: receipt.receiptFingerprint,
    committedAt: new Date(receipt.committedAt),
  };
  return {
    receipt,
    row,
    capabilityReceipt: {
      capabilityKey,
      businessObjectType,
      businessObjectId: 31,
      result: { id: 31 },
      mutationReceipt: receipt,
    },
  };
}
