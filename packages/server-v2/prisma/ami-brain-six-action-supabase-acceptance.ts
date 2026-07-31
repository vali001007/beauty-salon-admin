import 'reflect-metadata';
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ForbiddenException, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { BrainRiskLevel } from '@prisma/client';
import { BrainModule } from '../src/brain/brain.module.js';
import { BrainCapabilityCatalogService } from '../src/brain/capability/brain-capability-catalog.service.js';
import type { BrainCapabilityCard } from '../src/brain/capability/brain-capability.types.js';
import type { BrainRequestContext } from '../src/brain/context/brain-request-context.js';
import { BrainResultReferenceService } from '../src/brain/context/brain-result-reference.service.js';
import { createBrainActionSituationContext } from '../src/brain/cognition/brain-action-situation-context.js';
import type { BrainActionExecutionProvenance } from '../src/brain/cognition/brain-action-execution-provenance.types.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from '../src/brain/cognition/business-definition-snapshot.types.js';
import { BrainOntologyRuntimeService } from '../src/brain/cognition/brain-ontology-runtime.service.js';
import { createBrainActionExecutionParticipants } from '../src/brain/cognition/business-action-participant-profile.js';
import { BrainActionPredicateEffectEvaluatorService } from '../src/brain/domain/brain-action-predicate-effect-evaluator.service.js';
import { BrainActionTargetResolverService } from '../src/brain/domain/brain-action-target-resolver.service.js';
import { extractBrainReleaseDefinitionVersionIds } from '../src/brain/governance/brain-release-definition-versions.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { BrainTraceService } from '../src/brain/governance/brain-trace.service.js';
import { BrainActionConfirmationService } from '../src/brain/skills/brain-action-confirmation.service.js';
import { BrainActionExecutionIdentityService } from '../src/brain/skills/brain-action-execution-identity.service.js';
import { BrainCapabilityGatewayService } from '../src/brain/skills/brain-capability-gateway.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, BrainModule] })
class AmiBrainSixActionAcceptanceModule {}

type JsonRecord = Record<string, unknown>;

const ACTIONS = [
  'create_customer',
  'create_purchase_order',
  'submit_purchase_order_for_approval',
  'create_reservation',
  'reschedule_reservation',
  'cancel_reservation',
] as const;

const ACTION_DEFINITION_KEYS: Record<(typeof ACTIONS)[number], string> = {
  create_customer: 'action.create_customer',
  create_purchase_order: 'action.create_purchase_order',
  submit_purchase_order_for_approval: 'action.submit_purchase_order_for_approval',
  create_reservation: 'action.create_reservation',
  reschedule_reservation: 'action.reschedule_reservation',
  cancel_reservation: 'action.cancel_reservation',
};

const options = parseOptions(process.argv.slice(2));
const target = approvedSupabaseTarget(process.env.DATABASE_URL ?? '');

if (!options.apply) {
  console.log(
    JSON.stringify(
      {
        status: 'plan_only',
        databaseWritePerformed: false,
        target,
        releaseId: options.releaseId,
        actions: ACTIONS,
        requiredFlags: ['--apply', '--yes'],
        requiredEnvironment: 'AMI_BRAIN_APPROVED_SUPABASE_ACTION_ACCEPTANCE=1',
        cleanupPolicy: 'temporary_store_ids_and_exact_fixture_ids',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (process.env.AMI_BRAIN_APPROVED_SUPABASE_ACTION_ACCEPTANCE !== '1') {
  throw new Error('approved_supabase_action_acceptance_flag_missing');
}

const fixture = {
  prefix: `Brain Action Acceptance ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`,
  storeIds: [] as number[],
  userId: 0,
  conversationIds: [] as number[],
  runIds: [] as number[],
};
let cleanup = { attempted: false, passed: false, remaining: {} as JsonRecord };

async function main() {
  const app = await NestFactory.createApplicationContext(AmiBrainSixActionAcceptanceModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  if (options.cleanupOnly) {
    fixture.storeIds.push(...options.cleanupStoreIds);
    fixture.userId = options.cleanupUserId;
    fixture.runIds.push(...options.cleanupRunIds);
    fixture.conversationIds.push(...options.cleanupConversationIds);
    cleanup = await cleanupFixture(prisma, fixture);
    await app.close();
    console.log(JSON.stringify({ status: cleanup.passed ? 'cleanup_passed' : 'cleanup_failed', cleanup }, null, 2));
    if (!cleanup.passed) process.exitCode = 1;
    return;
  }

  try {
  const releaseService = app.get(BrainReleaseService);
  const catalog = app.get(BrainCapabilityCatalogService);
  const ontologyRuntime = app.get(BrainOntologyRuntimeService);
  const confirmation = app.get(BrainActionConfirmationService);
  const gateway = app.get(BrainCapabilityGatewayService);
  const frozenRelease = await releaseService.freezeEvaluationRelease(options.releaseId);
  const cards = await catalog.listEnabledCapabilities(frozenRelease.capabilityCandidates);
  const snapshot = await ontologyRuntime.loadEvaluationSnapshot(
    extractBrainReleaseDefinitionVersionIds(frozenRelease.capabilityCandidates),
  );
  const releaseRecord = await prisma.brainRelease.findUnique({
    where: { id: options.releaseId },
    select: { id: true, releaseKey: true, status: true, rollout: true },
  });
  assert(releaseRecord, `release_missing:${options.releaseId}`);
  const rollout = record(releaseRecord.rollout);
  assert(
    releaseRecord.status === 'draft' && rollout.evaluationOnly === true && rollout.mode === 'shadow',
    'release_not_draft_shadow_evaluation_only',
  );

  const prepared = await prepareFixture(prisma, fixture);
  const context: BrainRequestContext = {
    userId: prepared.user.id,
    storeId: prepared.store.id,
    visibleStoreIds: [prepared.store.id],
    roles: ['store_manager'],
    permissions: ['core:customer:create', 'core:inventory:purchase', 'core:store:reservations'],
    deniedPermissions: [],
    requestId: `six-action-acceptance-${Date.now()}`,
    timezone: 'Asia/Shanghai',
    requestChannel: 'acceptance_script',
    governanceEvalReleaseId: frozenRelease.releaseId,
    governanceEvalReleaseSnapshot: frozenRelease,
  };

  const harness = new ActionHarness({
    prisma,
    confirmation,
    gateway,
    snapshot,
    cards,
    release: { releaseId: frozenRelease.releaseId, releaseFingerprint: frozenRelease.releaseFingerprint },
    context,
    otherStoreId: prepared.otherStore.id,
    fixture,
    faultingConfirmationFactory: () => faultingConfirmationService(app, prisma, gateway),
  });

  const customerNormalPhone = phoneFrom(Date.now(), 11);
  const customerRecoveryPhone = phoneFrom(Date.now(), 22);
  progress('create_customer:start');
  const customerEvidence = await harness.run({
    skillKey: 'create_customer',
    permission: 'core:customer:create',
    payload: { name: `${fixture.prefix} 客户 A`, phone: customerNormalPhone },
    recoveryPayload: { name: `${fixture.prefix} 客户 B`, phone: customerRecoveryPhone },
    state: async (payload) =>
      prisma.customer.count({
        where: { storeId: prepared.store.id, phone: String(payload.phone), deletedAt: null },
      }),
    expectedStateAfterExecution: 1,
  });
  progress('create_customer:passed');

  progress('create_purchase_order:start');
  const purchaseEvidence = await harness.run({
    skillKey: 'create_purchase_order',
    permission: 'core:inventory:purchase',
    payload: purchasePayload(prepared.product.id, prepared.product.name, prepared.product.sku, `${fixture.prefix} 供应商 A`),
    recoveryPayload: purchasePayload(
      prepared.product.id,
      prepared.product.name,
      prepared.product.sku,
      `${fixture.prefix} 供应商 B`,
    ),
    state: async (payload) =>
      prisma.purchaseOrder.count({
        where: { storeId: prepared.store.id, supplier: String(payload.supplier) },
      }),
    expectedStateAfterExecution: 1,
    crossStorePayload: purchasePayload(
      prepared.otherProduct.id,
      prepared.otherProduct.name,
      prepared.otherProduct.sku,
      `${fixture.prefix} 跨店供应商`,
    ),
  });
  progress('create_purchase_order:passed');

  const purchaseOrderId = positiveId(purchaseEvidence.normal.businessObjectId, 'purchase_order_id');
  const recoveryPurchaseOrderId = positiveId(
    purchaseEvidence.recovery.businessObjectId,
    'recovery_purchase_order_id',
  );
  const [purchaseOrderVersion, recoveryPurchaseOrderVersion] = await Promise.all([
    prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId }, select: { updatedAt: true } }),
    prisma.purchaseOrder.findUniqueOrThrow({ where: { id: recoveryPurchaseOrderId }, select: { updatedAt: true } }),
  ]);
  progress('submit_purchase_order_for_approval:start');
  const submitEvidence = await harness.run({
    skillKey: 'submit_purchase_order_for_approval',
    permission: 'core:inventory:purchase',
    payload: { purchaseOrderId, expectedPurchaseOrderUpdatedAt: purchaseOrderVersion.updatedAt.toISOString() },
    recoveryPayload: {
      purchaseOrderId: recoveryPurchaseOrderId,
      expectedPurchaseOrderUpdatedAt: recoveryPurchaseOrderVersion.updatedAt.toISOString(),
    },
    state: async (payload) =>
      prisma.purchaseOrder.findUnique({ where: { id: Number(payload.purchaseOrderId) }, select: { status: true } }),
    expectedStateAfterExecution: { status: '待审核' },
    crossStorePayload: {
      purchaseOrderId: prepared.otherPurchaseOrder.id,
      expectedPurchaseOrderUpdatedAt: prepared.otherPurchaseOrder.updatedAt.toISOString(),
    },
    mutationReceiptRequired: true,
    institutionalEffectRequired: true,
  });
  progress('submit_purchase_order_for_approval:passed');

  progress('create_reservation:start');
  const reservationEvidence = await harness.run({
    skillKey: 'create_reservation',
    permission: 'core:store:reservations',
    payload: {
      customerId: prepared.customer.id,
      projectId: prepared.project.id,
      appointmentTime: '2027-02-10T10:00:00+08:00',
      duration: 60,
      remark: `${fixture.prefix} 预约 A`,
    },
    recoveryPayload: {
      customerId: prepared.customer.id,
      projectId: prepared.project.id,
      appointmentTime: '2027-02-11T11:00:00+08:00',
      duration: 60,
      remark: `${fixture.prefix} 预约 B`,
    },
    state: async (payload) =>
      prisma.reservation.count({
        where: {
          storeId: prepared.store.id,
          customerId: Number(payload.customerId),
          remark: String(payload.remark),
        },
      }),
    expectedStateAfterExecution: 1,
    crossStorePayload: {
      customerId: prepared.otherCustomer.id,
      projectId: prepared.otherProject.id,
      appointmentTime: '2027-02-12T10:00:00+08:00',
      duration: 60,
    },
  });
  progress('create_reservation:passed');

  const reservationId = positiveId(reservationEvidence.normal.businessObjectId, 'reservation_id');
  const recoveryReservationId = positiveId(
    reservationEvidence.recovery.businessObjectId,
    'recovery_reservation_id',
  );
  const [reservationVersion, recoveryReservationVersion] = await Promise.all([
    prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, select: { updatedAt: true } }),
    prisma.reservation.findUniqueOrThrow({ where: { id: recoveryReservationId }, select: { updatedAt: true } }),
  ]);
  progress('reschedule_reservation:start');
  const rescheduleEvidence = await harness.run({
    skillKey: 'reschedule_reservation',
    permission: 'core:store:reservations',
    payload: {
      reservationId,
      appointmentTime: '2027-02-14T14:00:00+08:00',
      duration: 60,
      reason: `${fixture.prefix} 改期 A`,
      expectedReservationUpdatedAt: reservationVersion.updatedAt.toISOString(),
    },
    recoveryPayload: {
      reservationId: recoveryReservationId,
      appointmentTime: '2027-02-15T15:00:00+08:00',
      duration: 60,
      reason: `${fixture.prefix} 改期 B`,
      expectedReservationUpdatedAt: recoveryReservationVersion.updatedAt.toISOString(),
    },
    state: async (payload) =>
      prisma.reservation.findUnique({
        where: { id: Number(payload.reservationId) },
        select: { date: true, startTime: true, status: true },
      }),
    expectedStateAfterExecution: { date: new Date('2027-02-14T00:00:00.000Z'), startTime: '14:00', status: 'pending' },
    recoveryExpectedStateAfterExecution: {
      date: new Date('2027-02-15T00:00:00.000Z'),
      startTime: '15:00',
      status: 'pending',
    },
    crossStorePayload: {
      reservationId: prepared.otherReservation.id,
      appointmentTime: '2027-02-16T16:00:00+08:00',
      duration: 60,
      expectedReservationUpdatedAt: prepared.otherReservation.updatedAt.toISOString(),
    },
    mutationReceiptRequired: true,
  });
  progress('reschedule_reservation:passed');

  const [cancelReservationVersion, cancelRecoveryReservationVersion] = await Promise.all([
    prisma.reservation.findUniqueOrThrow({ where: { id: reservationId }, select: { updatedAt: true } }),
    prisma.reservation.findUniqueOrThrow({ where: { id: recoveryReservationId }, select: { updatedAt: true } }),
  ]);
  progress('cancel_reservation:start');
  const cancelEvidence = await harness.run({
    skillKey: 'cancel_reservation',
    permission: 'core:store:reservations',
    payload: {
      reservationId,
      reason: `${fixture.prefix} 取消 A`,
      expectedReservationUpdatedAt: cancelReservationVersion.updatedAt.toISOString(),
    },
    recoveryPayload: {
      reservationId: recoveryReservationId,
      reason: `${fixture.prefix} 取消 B`,
      expectedReservationUpdatedAt: cancelRecoveryReservationVersion.updatedAt.toISOString(),
    },
    state: async (payload) =>
      prisma.reservation.findUnique({
        where: { id: Number(payload.reservationId) },
        select: { status: true },
      }),
    expectedStateAfterExecution: { status: 'cancelled' },
    crossStorePayload: {
      reservationId: prepared.otherReservation.id,
      reason: `${fixture.prefix} 跨店取消`,
      expectedReservationUpdatedAt: prepared.otherReservation.updatedAt.toISOString(),
    },
    mutationReceiptRequired: true,
    institutionalEffectRequired: true,
  });
  progress('cancel_reservation:passed');

  const actionEvidence = {
    create_customer: customerEvidence,
    create_purchase_order: purchaseEvidence,
    submit_purchase_order_for_approval: submitEvidence,
    create_reservation: reservationEvidence,
    reschedule_reservation: rescheduleEvidence,
    cancel_reservation: cancelEvidence,
  };
  assert(Object.values(actionEvidence).every((item) => item.passed), 'six_action_acceptance_not_all_passed');

  const result = {
    schemaVersion: 'ami-brain-six-action-supabase-acceptance/v1',
    status: 'passed',
    databaseWritePerformed: true,
    target,
    release: {
      id: releaseRecord.id,
      releaseKey: releaseRecord.releaseKey,
      status: releaseRecord.status,
      evaluationOnly: rollout.evaluationOnly === true,
      mode: rollout.mode,
      fingerprint: frozenRelease.releaseFingerprint,
      ontologyFingerprint: snapshot.fingerprint,
    },
    actionCount: ACTIONS.length,
    actionEvidence,
    generatedAt: new Date().toISOString(),
  };
  writeOutput(options.out, result);
  console.log(JSON.stringify(result, null, 2));
  } finally {
    cleanup = await cleanupFixture(prisma, fixture);
    await app.close();
    if (!cleanup.passed) {
      console.error(JSON.stringify({ status: 'cleanup_failed', cleanup }, null, 2));
      process.exitCode = 1;
    } else {
      console.error(JSON.stringify({ status: 'cleanup_passed', cleanup }, null, 2));
    }
  }
}

class ActionHarness {
  constructor(
    private readonly services: {
      prisma: PrismaService;
      confirmation: BrainActionConfirmationService;
      gateway: BrainCapabilityGatewayService;
      snapshot: ProductionReadyBusinessDefinitionSnapshot;
      cards: readonly BrainCapabilityCard[];
      release: { releaseId: number; releaseFingerprint: string };
      context: BrainRequestContext;
      otherStoreId: number;
      fixture: typeof fixture;
      faultingConfirmationFactory: () => BrainActionConfirmationService;
    },
  ) {}

  async run(input: {
    skillKey: (typeof ACTIONS)[number];
    permission: string;
    payload: JsonRecord;
    recoveryPayload: JsonRecord;
    state: (payload: JsonRecord) => Promise<unknown>;
    expectedStateAfterExecution: unknown;
    recoveryExpectedStateAfterExecution?: unknown;
    crossStorePayload?: JsonRecord;
    mutationReceiptRequired?: boolean;
    institutionalEffectRequired?: boolean;
  }) {
    if (input.crossStorePayload) {
      const crossRun = await this.createRun(`${input.skillKey}:cross_store`);
      const crossProvenance = this.provenance(input.skillKey, crossRun.runId, crossRun.conversationId);
      let crossStoreRejected = false;
      try {
        await this.services.confirmation.createPreview({
          runId: crossRun.runId,
          userId: this.services.context.userId,
          storeId: this.services.context.storeId,
          skillKey: input.skillKey,
          riskLevel: this.risk(input.skillKey),
          preview: { summary: `cross-store ${input.skillKey}` },
          payload: input.crossStorePayload as never,
          actionProvenance: crossProvenance,
          idempotencyKey: `${input.skillKey}:cross:${Date.now()}`,
          planId: `six-action:${input.skillKey}:cross`,
        });
      } catch (error) {
        crossStoreRejected = errorCode(error).startsWith('action_precondition_violated');
      }
      assert(crossStoreRejected, `${input.skillKey}:cross_store_not_rejected`);
    }

    const normal = await this.execute(input, input.payload, false);
    const recovery = await this.execute(input, input.recoveryPayload, true);
    return {
      passed: true,
      permissionDeniedBeforeWrite: normal.permissionDeniedBeforeWrite,
      crossStoreRejected: input.crossStorePayload ? true : normal.scopeMismatchRejected,
      previewDidNotWrite: normal.previewDidNotWrite && recovery.previewDidNotWrite,
      explicitConfirmationRequired: true,
      idempotentReplay: normal.idempotentReplay,
      writeSetObserved: normal.writeSetObserved && recovery.writeSetObserved,
      predicateEffectObserved: normal.predicateEffectObserved && recovery.predicateEffectObserved,
      mutationReceiptObserved: input.mutationReceiptRequired
        ? normal.mutationReceiptObserved && recovery.mutationReceiptObserved
        : null,
      institutionalEffectObserved: input.institutionalEffectRequired
        ? normal.institutionalEffectObserved && recovery.institutionalEffectObserved
        : null,
      recoveryReceiptObserved: recovery.recoveryReceiptObserved,
      normal: normal.summary,
      recovery: recovery.summary,
    };
  }

  private async execute(
    input: Parameters<ActionHarness['run']>[0],
    payload: JsonRecord,
    recoveryMode: boolean,
  ) {
    const before = await input.state(payload);
    const run = await this.createRun(`${input.skillKey}:${recoveryMode ? 'recovery' : 'normal'}`);
    const provenance = this.provenance(input.skillKey, run.runId, run.conversationId);
    const idempotencyKey = `${input.skillKey}:${recoveryMode ? 'recovery' : 'normal'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const preview = await this.services.confirmation.createPreview({
      runId: run.runId,
      userId: this.services.context.userId,
      storeId: this.services.context.storeId,
      skillKey: input.skillKey,
      riskLevel: this.risk(input.skillKey),
      preview: { summary: `${recoveryMode ? 'recovery ' : ''}${input.skillKey}` },
      payload: payload as never,
      actionProvenance: provenance,
      idempotencyKey,
      planId: `six-action:${input.skillKey}:${recoveryMode ? 'recovery' : 'normal'}`,
    });
    const afterPreview = await input.state(payload);
    assert(deepEqual(before, afterPreview), `${input.skillKey}:preview_wrote_business_data`);

    let permissionDenied = false;
    let permissionError = 'no_exception';
    try {
      await this.services.confirmation.confirmAndExecute({
        actionId: preview.actionId,
        runId: run.runId,
        userId: this.services.context.userId,
        storeId: this.services.context.storeId,
        permissions: [],
        roles: ['store_manager'],
        requestChannel: this.services.context.requestChannel,
      });
    } catch (error) {
      permissionError = errorCode(error);
      permissionDenied =
        error instanceof ForbiddenException && errorCode(error).includes(`missing_permission:${input.permission}`);
    }
    assert(permissionDenied, `${input.skillKey}:permission_denial_missing:${permissionError}`);
    assert(deepEqual(before, await input.state(payload)), `${input.skillKey}:permission_denial_wrote_business_data`);

    const scopeMismatch = await this.services.confirmation.confirmAndExecute({
      actionId: preview.actionId,
      runId: run.runId,
      userId: this.services.context.userId,
      storeId: this.services.otherStoreId,
      permissions: [input.permission],
      roles: ['store_manager'],
      requestChannel: this.services.context.requestChannel,
    });
    assert(scopeMismatch === null, `${input.skillKey}:confirmation_scope_mismatch_not_rejected`);

    const executor = recoveryMode ? this.services.faultingConfirmationFactory() : this.services.confirmation;
    const first = await executor.confirmAndExecute({
      actionId: preview.actionId,
      runId: run.runId,
      userId: this.services.context.userId,
      storeId: this.services.context.storeId,
      permissions: [input.permission],
      roles: ['store_manager'],
      requestChannel: this.services.context.requestChannel,
    });
    assert(first, `${input.skillKey}:execution_missing`);

    let final = first;
    let recoveryReceiptObserved = false;
    if (recoveryMode) {
      assert(first.status === 'failed', `${input.skillKey}:receipt_fault_not_detected`);
      assert(Boolean('retryable' in first && first.retryable), `${input.skillKey}:receipt_fault_not_retryable`);
      assert(
        deepEqual(
          input.recoveryExpectedStateAfterExecution ?? input.expectedStateAfterExecution,
          await input.state(payload),
        ),
        `${input.skillKey}:business_effect_missing_before_receipt_recovery`,
      );
      final = await executor.retryFailedExecution({
        actionId: preview.actionId,
        runId: run.runId,
        userId: this.services.context.userId,
        storeId: this.services.context.storeId,
        permissions: [input.permission],
        roles: ['store_manager'],
        requestChannel: this.services.context.requestChannel,
      });
      assert(final?.status === 'succeeded', `${input.skillKey}:receipt_recovery_failed`);
      recoveryReceiptObserved = Boolean(final && 'recovered' in final && final.recovered === true);
      assert(recoveryReceiptObserved, `${input.skillKey}:recovered_receipt_flag_missing`);
    } else {
      assert(
        first.status === 'succeeded',
        `${input.skillKey}:execution_not_succeeded:${JSON.stringify(normalize(first))}`,
      );
    }

    const expected = recoveryMode
      ? input.recoveryExpectedStateAfterExecution ?? input.expectedStateAfterExecution
      : input.expectedStateAfterExecution;
    assert(deepEqual(expected, await input.state(payload)), `${input.skillKey}:business_state_mismatch`);

    const duplicate = await this.services.confirmation.confirmAndExecute({
      actionId: preview.actionId,
      runId: run.runId,
      userId: this.services.context.userId,
      storeId: this.services.context.storeId,
      permissions: [input.permission],
      roles: ['store_manager'],
      requestChannel: this.services.context.requestChannel,
    });
    assert(Boolean(duplicate && 'duplicated' in duplicate && duplicate.duplicated), `${input.skillKey}:idempotent_replay_failed`);
    assert(deepEqual(expected, await input.state(payload)), `${input.skillKey}:idempotent_replay_changed_business_state`);

    const finalRecord = record(final);
    const receipt = record(finalRecord.receipt);
    const writeSet = record(receipt.databaseWriteSet);
    const effectObservations = Array.isArray(receipt.effectObservations) ? receipt.effectObservations.map(record) : [];
    const invariant = record(receipt.actionInvariantEvaluation);
    const institutional = record(receipt.institutionalEffectEvaluation);
    const businessObjectId = receipt.businessObjectId;
    assert(writeSet.entryCount === (Array.isArray(writeSet.entries) ? writeSet.entries.length : -1), `${input.skillKey}:write_set_missing`);
    assert(Number(writeSet.entryCount) > 0, `${input.skillKey}:write_set_empty`);
    assert(effectObservations.length > 0 && effectObservations.every((item) => item.status === 'observed'), `${input.skillKey}:effect_not_observed`);
    assert(invariant.status === 'satisfied', `${input.skillKey}:invariant_not_satisfied`);
    if (input.mutationReceiptRequired) assert(Boolean(receipt.mutationReceipt), `${input.skillKey}:mutation_receipt_missing`);
    if (input.institutionalEffectRequired) assert(institutional.status === 'effective', `${input.skillKey}:institutional_effect_not_effective`);

    return {
      permissionDeniedBeforeWrite: permissionDenied,
      scopeMismatchRejected: scopeMismatch === null,
      previewDidNotWrite: deepEqual(before, afterPreview),
      idempotentReplay: Boolean(duplicate && 'duplicated' in duplicate && duplicate.duplicated),
      writeSetObserved: Number(writeSet.entryCount) > 0,
      predicateEffectObserved: effectObservations.every((item) => item.status === 'observed') && invariant.status === 'satisfied',
      mutationReceiptObserved: Boolean(receipt.mutationReceipt),
      institutionalEffectObserved: institutional.status === 'effective',
      recoveryReceiptObserved,
      summary: {
        actionId: preview.actionId,
        executionId: finalRecord.executionId ?? null,
        businessObjectId,
        writeSetId: writeSet.writeSetId,
        writeSetEntryCount: writeSet.entryCount,
        effectKeys: effectObservations.map((item) => item.effectKey),
        invariantStatus: invariant.status,
        institutionalEffectStatus: institutional.status ?? null,
        recovered: recoveryReceiptObserved,
      },
    };
  }

  private risk(skillKey: string): BrainRiskLevel {
    return this.services.gateway.resolve(skillKey).riskLevel;
  }

  private async createRun(source: string) {
    const conversation = await this.services.prisma.brainConversation.create({
      data: {
        storeId: this.services.context.storeId,
        userId: this.services.context.userId,
        title: `${this.services.fixture.prefix} ${source}`.slice(0, 100),
      },
    });
    this.services.fixture.conversationIds.push(conversation.id);
    const run = await this.services.prisma.brainRun.create({
      data: {
        conversationId: conversation.id,
        storeId: this.services.context.storeId,
        userId: this.services.context.userId,
        status: 'running',
        input: { source: 'six_action_supabase_acceptance', action: source },
      },
    });
    this.services.fixture.runIds.push(run.id);
    return { runId: run.id, conversationId: conversation.id };
  }

  private provenance(skillKey: (typeof ACTIONS)[number], runId: number, conversationId: number): BrainActionExecutionProvenance {
    const actionKey = ACTION_DEFINITION_KEYS[skillKey];
    const action = this.services.snapshot.actions.find((item) => item.actionKey === actionKey);
    assert(action, `action_definition_missing:${actionKey}`);
    const binding = action.capabilityBindings.find(
      (item) => item.enabled && item.bindingMode === 'preview_and_execute' && (item.gatewayActionKey ?? item.capabilityKey) === skillKey,
    );
    assert(binding, `action_binding_missing:${actionKey}:${skillKey}`);
    const card = this.services.cards.find((item) => item.key === binding.capabilityKey);
    assert(card, `action_card_missing:${binding.capabilityKey}`);
    const situationContext = createBrainActionSituationContext({
      profileFingerprint: action.situationContext.fingerprint,
      runId,
      conversationId,
      context: this.services.context,
      qualifiedRole: 'store_manager',
    });
    const participants = action.participantProfile
      ? createBrainActionExecutionParticipants({
          profile: action.participantProfile,
          userId: this.services.context.userId,
          storeId: this.services.context.storeId,
          businessDate: situationContext.businessDate,
          gatewayActionKey: skillKey,
          actionSlots: [],
        })
      : undefined;
    return {
      schemaVersion: action.institutionalEffect ? '1.2' : action.participantProfile && action.relationProfile ? '1.1' : '1.0',
      actionRef: {
        definitionType: 'action',
        definitionKey: action.definitionKey,
        definitionVersion: action.version,
        definitionFingerprint: action.definitionFingerprint,
        sourceFingerprint: action.sourceFingerprint,
      },
      actionBindingFingerprint: action.bindingFingerprint,
      actionSituationContextProfileFingerprint: action.situationContext.fingerprint,
      actionModalityPolicyFingerprint: action.modalityPolicy.fingerprint,
      actionInformationArtifactProfileFingerprint: action.informationArtifact.fingerprint,
      actionSideEffectInvariantProfileFingerprint: action.sideEffectInvariant.fingerprint,
      ...(action.participantProfile && action.relationProfile
        ? {
            actionParticipantProfileFingerprint: action.participantProfile.fingerprint,
            actionRelationProfileFingerprint: action.relationProfile.fingerprint,
          }
        : {}),
      ...(action.institutionalEffect
        ? { actionInstitutionalEffectProfileFingerprint: action.institutionalEffect.fingerprint }
        : {}),
      ontologySnapshotFingerprint: this.services.snapshot.fingerprint,
      situationContext,
      informationArtifacts: [],
      ...(participants ? { participants } : {}),
      capability: { key: card.key, version: card.version, sourceFingerprint: card.sourceFingerprint },
      gatewayActionKey: skillKey,
      release: this.services.release,
    };
  }
}

function faultingConfirmationService(
  appContext: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  prisma: PrismaService,
  gateway: BrainCapabilityGatewayService,
) {
  let failSuccessfulReceiptPersistence = true;
  const proxy = new Proxy(prisma as object, {
    get(target, property) {
      if (property === 'brainActionExecution') {
        const delegate = Reflect.get(target, property) as JsonRecord;
        return new Proxy(delegate, {
          get(delegateTarget, delegateProperty) {
            const value = Reflect.get(delegateTarget, delegateProperty);
            if (delegateProperty === 'update') {
              return async (input: JsonRecord) => {
                const data = record(input.data);
                if (failSuccessfulReceiptPersistence && data.status === 'succeeded') {
                  failSuccessfulReceiptPersistence = false;
                  throw new Error('acceptance_receipt_persist_failure');
                }
                return (value as (args: JsonRecord) => Promise<unknown>).call(delegateTarget, input);
              };
            }
            return typeof value === 'function' ? value.bind(delegateTarget) : value;
          },
        });
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new BrainActionConfirmationService(
    proxy as never,
    gateway,
    appContext.get(BrainTraceService),
    appContext.get(BrainActionTargetResolverService),
    appContext.get(BrainActionExecutionIdentityService),
    appContext.get(BrainActionPredicateEffectEvaluatorService),
    appContext.get(BrainResultReferenceService),
  );
}

async function prepareFixture(prisma: PrismaService, state: typeof fixture) {
  const suffix = state.prefix.replace(/[^a-zA-Z0-9]/g, '').slice(-20).toLowerCase();
  const [store, otherStore] = await Promise.all([
    prisma.store.create({ data: { name: `${state.prefix} Store A` } }),
    prisma.store.create({ data: { name: `${state.prefix} Store B` } }),
  ]);
  state.storeIds.push(store.id, otherStore.id);
  const role = await prisma.role.findUnique({ where: { key: 'store_manager' }, select: { id: true } });
  assert(role, 'store_manager_role_missing');
  const user = await prisma.user.create({
    data: {
      username: `brain_action_acceptance_${suffix}`,
      passwordHash: 'acceptance-only-not-a-login-secret',
      name: `${state.prefix} Operator`,
      stores: { create: [{ storeId: store.id }] },
      roles: { create: [{ roleId: role.id }] },
    },
  });
  state.userId = user.id;
  const [customer, otherCustomer, project, otherProject, product, otherProduct] = await Promise.all([
    prisma.customer.create({ data: { storeId: store.id, name: `${state.prefix} Base Customer`, phone: phoneFrom(Date.now(), 31), tags: [] } }),
    prisma.customer.create({ data: { storeId: otherStore.id, name: `${state.prefix} Other Customer`, phone: phoneFrom(Date.now(), 32), tags: [] } }),
    prisma.project.create({ data: { storeId: store.id, name: `${state.prefix} Project A`, price: 380, duration: 60, status: 'active' } }),
    prisma.project.create({ data: { storeId: otherStore.id, name: `${state.prefix} Project B`, price: 380, duration: 60, status: 'active' } }),
    prisma.product.create({ data: { storeId: store.id, name: `${state.prefix} Product A`, sku: `BAA-A-${suffix}`, unit: '瓶', currentStock: 2, safetyStock: 10, costPrice: 20, status: 'active' } }),
    prisma.product.create({ data: { storeId: otherStore.id, name: `${state.prefix} Product B`, sku: `BAA-B-${suffix}`, unit: '瓶', currentStock: 2, safetyStock: 10, costPrice: 20, status: 'active' } }),
  ]);
  const otherPurchaseOrder = await prisma.purchaseOrder.create({
    data: {
      storeId: otherStore.id,
      orderNo: `BAA-PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      supplier: `${state.prefix} Other Supplier`,
      status: '草稿',
      totalAmount: 20,
      items: [{ productId: otherProduct.id, productName: otherProduct.name, sku: otherProduct.sku, quantity: 1, unitPrice: 20 }],
    },
  });
  const otherReservation = await prisma.reservation.create({
    data: {
      storeId: otherStore.id,
      customerId: otherCustomer.id,
      projectId: otherProject.id,
      date: new Date('2027-02-13T05:00:00.000Z'),
      startTime: '13:00',
      endTime: '14:00',
      status: 'pending',
      bookingSource: 'admin',
      remark: `${state.prefix} Other Reservation`,
    },
  });
  return { store, otherStore, user, customer, otherCustomer, project, otherProject, product, otherProduct, otherPurchaseOrder, otherReservation };
}

async function cleanupFixture(prisma: PrismaService, state: typeof fixture) {
  const storeIds = [...new Set(state.storeIds)];
  const runIds = [...new Set(state.runIds)];
  const conversationIds = [...new Set(state.conversationIds)];
  const result = { attempted: true, passed: false, remaining: {} as JsonRecord };
  try {
    if (storeIds.length) {
      await prisma.businessDatabaseWriteSet.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.businessMutationReceipt.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.brainActionExecution.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.brainActionConfirmation.deleteMany({ where: { storeId: { in: storeIds } } });
    }
    if (runIds.length) {
      await prisma.brainRunStep.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.brainRun.deleteMany({ where: { id: { in: runIds } } });
    }
    if (conversationIds.length) {
      await prisma.brainMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await prisma.brainConversation.deleteMany({ where: { id: { in: conversationIds } } });
    }
    if (storeIds.length) {
      await prisma.purchaseOrder.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.reservation.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.customer.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.product.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.project.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.beautician.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.userStore.deleteMany({ where: { storeId: { in: storeIds } } });
    }
    if (state.userId) {
      await prisma.userRole.deleteMany({ where: { userId: state.userId } });
      await prisma.user.deleteMany({ where: { id: state.userId, username: { startsWith: 'brain_action_acceptance_' } } });
    }
    if (storeIds.length) {
      await prisma.store.deleteMany({ where: { id: { in: storeIds }, name: { startsWith: 'Brain Action Acceptance ' } } });
    }
    const [stores, user, runs, conversations, writeSets, receipts, confirmations, executions] = await Promise.all([
      storeIds.length ? prisma.store.count({ where: { id: { in: storeIds } } }) : 0,
      state.userId ? prisma.user.count({ where: { id: state.userId } }) : 0,
      runIds.length ? prisma.brainRun.count({ where: { id: { in: runIds } } }) : 0,
      conversationIds.length ? prisma.brainConversation.count({ where: { id: { in: conversationIds } } }) : 0,
      storeIds.length ? prisma.businessDatabaseWriteSet.count({ where: { storeId: { in: storeIds } } }) : 0,
      storeIds.length ? prisma.businessMutationReceipt.count({ where: { storeId: { in: storeIds } } }) : 0,
      storeIds.length ? prisma.brainActionConfirmation.count({ where: { storeId: { in: storeIds } } }) : 0,
      storeIds.length ? prisma.brainActionExecution.count({ where: { storeId: { in: storeIds } } }) : 0,
    ]);
    result.remaining = { stores, user, runs, conversations, writeSets, mutationReceipts: receipts, confirmations, executions };
    result.passed = Object.values(result.remaining).every((value) => value === 0);
    return result;
  } catch (error) {
    result.remaining = { cleanupError: errorCode(error), storeIds, userId: state.userId, runIds, conversationIds };
    return result;
  }
}

function purchasePayload(productId: number, productName: string, sku: string, supplier: string) {
  return { supplier, items: [{ productId, productName, sku, quantity: 10, unitPrice: 20 }] };
}

function phoneFrom(seed: number, discriminator: number) {
  const tail = String((seed + discriminator) % 100_000_000).padStart(8, '0');
  return `139${tail}`;
}

function parseOptions(args: string[]) {
  const set = new Set(args);
  const releaseArg = args.find((arg) => arg.startsWith('--release-id='));
  const outArg = args.find((arg) => arg.startsWith('--out='));
  const releaseId = Number(releaseArg?.slice('--release-id='.length) ?? '418');
  if (!Number.isInteger(releaseId) || releaseId <= 0) throw new Error('release_id_invalid');
  const integerList = (name: string) => {
    const value = args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
    if (!value) return [];
    const items = value.split(',').map(Number);
    if (items.some((item) => !Number.isInteger(item) || item <= 0)) throw new Error(`${name}_invalid`);
    return items;
  };
  return {
    apply: set.has('--apply') && set.has('--yes'),
    releaseId,
    out: outArg?.slice('--out='.length),
    cleanupOnly: set.has('--cleanup-only'),
    cleanupStoreIds: integerList('--cleanup-store-ids'),
    cleanupUserId: Number(args.find((arg) => arg.startsWith('--cleanup-user-id='))?.slice('--cleanup-user-id='.length) ?? 0),
    cleanupRunIds: integerList('--cleanup-run-ids'),
    cleanupConversationIds: integerList('--cleanup-conversation-ids'),
  };
}

function approvedSupabaseTarget(urlText: string) {
  const url = new URL(urlText);
  const database = url.pathname.replace(/^\//, '');
  if (!url.hostname.includes('.supabase.') || database !== 'postgres') {
    throw new Error(`unsafe_database_target:${url.hostname}/${database}`);
  }
  return { hostname: url.hostname, port: Number(url.port || 5432), database };
}

function writeOutput(path: string | undefined, value: unknown) {
  if (!path) return;
  const absolute = resolve(process.cwd(), path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function positiveId(value: unknown, field: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`invalid_${field}`);
  return id;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^BadRequestException:\s*/u, '').replace(/^ForbiddenException:\s*/u, '');
}

function progress(stage: string) {
  console.error(JSON.stringify({ progress: stage, at: new Date().toISOString() }));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`acceptance_failed:${message}`);
}

await main();
