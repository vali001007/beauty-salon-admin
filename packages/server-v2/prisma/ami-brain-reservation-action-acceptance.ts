import { BrainActionTargetResolverService } from '../src/brain/domain/brain-action-target-resolver.service.js';
import { BrainActionConfirmationService } from '../src/brain/skills/brain-action-confirmation.service.js';
import { BrainCapabilityGatewayService } from '../src/brain/skills/brain-capability-gateway.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CustomerWaitingService } from '../src/reservations/customer-waiting.service.js';
import { ReservationsService } from '../src/reservations/reservations.service.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') && args.has('--yes');
const databaseUrl = process.env.DATABASE_URL ?? '';

function assertIsolatedDatabase(urlText: string) {
  const url = new URL(urlText);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  const database = url.pathname.replace(/^\//, '');
  if (!loopback || !database.startsWith('ami_brain_reservation_')) {
    throw new Error(`unsafe_database_target:${url.hostname}/${database}`);
  }
  return { host: url.hostname, port: Number(url.port || 5432), database };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`acceptance_failed:${message}`);
}

async function main() {
  const target = assertIsolatedDatabase(databaseUrl);
  if (!apply) {
    console.log(JSON.stringify({ status: 'plan_only', databaseWritePerformed: false, target, requiredFlags: ['--apply', '--yes'] }, null, 2));
    return;
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const store = await prisma.store.create({ data: { name: `Brain Reservation Acceptance ${suffix}` } });
    const operator = await prisma.user.create({
      data: { username: `brain_reservation_${suffix}`, passwordHash: 'isolated-acceptance-only', name: '隔离库验收操作员' },
    });
    const customer = await prisma.customer.create({
      data: { storeId: store.id, name: '隔离库预约客户', phone: '13800000002', tags: [] },
    });
    const project = await prisma.project.create({
      data: { storeId: store.id, name: '隔离库预约项目', price: 380, duration: 60, status: 'active' },
    });
    const beautician = await prisma.beautician.create({
      data: { storeId: store.id, userId: operator.id, name: '隔离库预约美容师', status: 'active' },
    });
    const run = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_reservation_acceptance' } },
    });

    const reservationService = new ReservationsService(prisma, new CustomerWaitingService(prisma));
    const gateway = new BrainCapabilityGatewayService(reservationService);
    const targetResolver = new BrainActionTargetResolverService(prisma);
    const confirmationService = new BrainActionConfirmationService(prisma, gateway, undefined, targetResolver);
    const idempotencyKey = `reservation-action-${suffix}`;
    const payload = {
      customerId: customer.id,
      projectId: project.id,
      beauticianId: beautician.id,
      appointmentTime: '2027-01-15T15:00:00+08:00',
      duration: 60,
      remark: 'Ami Brain 隔离库预约验收',
    };
    const confirmation = await confirmationService.createPreview({
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      preview: { summary: '隔离库创建预约' },
      payload,
      idempotencyKey,
      planId: `reservation-acceptance:${suffix}`,
    });
    const firstExecution = await confirmationService.confirmAndExecute({
      actionId: confirmation.actionId,
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:store:reservations'],
    });
    const duplicateConfirmation = await confirmationService.confirmAndExecute({
      actionId: confirmation.actionId,
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:store:reservations'],
    });
    const duplicateConfirmationShortCircuited = Boolean(
      duplicateConfirmation && 'duplicated' in duplicateConfirmation && duplicateConfirmation.duplicated === true,
    );
    const businessReplay = await gateway.execute({
      skillKey: 'create_reservation',
      payload,
      context: { userId: operator.id, storeId: store.id, permissions: ['core:store:reservations'], idempotencyKey },
    });
    await prisma.reservation.update({
      where: { id: businessReplay.businessObjectId as number },
      data: { date: new Date('2027-02-01T10:00:00+08:00'), startTime: '10:00', endTime: '11:00', beauticianId: null, remark: '创建后已改期' },
    });
    const postMutationReplay = await gateway.execute({
      skillKey: 'create_reservation',
      payload,
      context: { userId: operator.id, storeId: store.id, permissions: ['core:store:reservations'], idempotencyKey },
    });
    let mismatchedReplayRejected = false;
    try {
      await gateway.execute({
        skillKey: 'create_reservation',
        payload: { ...payload, projectId: project.id, appointmentTime: '2027-01-16T15:00:00+08:00' },
        context: { userId: operator.id, storeId: store.id, permissions: ['core:store:reservations'], idempotencyKey },
      });
    } catch (error) {
      mismatchedReplayRejected = error instanceof Error && error.message.includes('幂等键已用于另一笔预约');
    }

    const reservations = await prisma.reservation.findMany({ where: { storeId: store.id, bookingSource: 'ami_brain' } });
    const executions = await prisma.brainActionExecution.findMany({ where: { actionId: confirmation.actionId } });
    assert(firstExecution?.status === 'succeeded', 'first_execution_not_succeeded');
    assert(duplicateConfirmationShortCircuited, 'duplicate_confirmation_not_short_circuited');
    assert(reservations.length === 1, 'brain_reservation_count_not_one');
    assert(businessReplay.businessObjectId === reservations[0].id, 'business_replay_returned_different_reservation');
    assert(postMutationReplay.businessObjectId === reservations[0].id, 'post_mutation_replay_returned_different_reservation');
    assert(mismatchedReplayRejected, 'mismatched_idempotent_replay_not_rejected');
    assert(typeof reservations[0].idempotencyKey === 'string' && reservations[0].idempotencyKey.length === 64, 'reservation_idempotency_key_missing');
    assert(executions.length === 1 && executions[0].status === 'succeeded', 'execution_receipt_not_persisted');

    const recoveryRun = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_reservation_receipt_recovery' } },
    });
    const recoveryKey = `reservation-recovery-${suffix}`;
    const recoveryPayload = { ...payload, appointmentTime: '2027-01-17T15:00:00+08:00' };
    const recoveryConfirmation = await confirmationService.createPreview({
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      preview: { summary: '隔离库预约回执恢复' },
      payload: recoveryPayload,
      idempotencyKey: recoveryKey,
      planId: `reservation-recovery:${suffix}`,
    });
    const confirmationDelegate = prisma.brainActionConfirmation;
    const executionDelegate = prisma.brainActionExecution;
    let failReceiptPersistence = true;
    const faultingPrisma = {
      brainActionConfirmation: {
        findFirst: (input: Parameters<typeof confirmationDelegate.findFirst>[0]) => confirmationDelegate.findFirst(input),
        update: (input: Parameters<typeof confirmationDelegate.update>[0]) => confirmationDelegate.update(input),
      },
      brainActionExecution: {
        findUnique: (input: Parameters<typeof executionDelegate.findUnique>[0]) => executionDelegate.findUnique(input),
        update: (input: Parameters<typeof executionDelegate.update>[0]) => {
          const data = input.data as Record<string, unknown>;
          if (failReceiptPersistence && data.status === 'succeeded') {
            failReceiptPersistence = false;
            throw new Error('acceptance_receipt_persist_failure');
          }
          return executionDelegate.update(input);
        },
      },
      $transaction: prisma.$transaction.bind(prisma),
    };
    const faultingConfirmationService = new BrainActionConfirmationService(faultingPrisma as never, gateway, undefined, targetResolver);
    const failedReceipt = await faultingConfirmationService.confirmAndExecute({
      actionId: recoveryConfirmation.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:store:reservations'],
    });
    const failedReceiptRetryable = Boolean(failedReceipt && 'retryable' in failedReceipt && failedReceipt.retryable === true);
    assert(failedReceipt?.status === 'failed' && failedReceiptRetryable, 'receipt_failure_not_marked_safe_replay');
    const committedBeforeRetry = await prisma.reservation.findMany({ where: { storeId: store.id, bookingSource: 'ami_brain' } });
    assert(committedBeforeRetry.length === 2, 'business_write_not_committed_before_receipt_failure');
    const recoveredReceipt = await faultingConfirmationService.retryFailedExecution({
      actionId: recoveryConfirmation.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:store:reservations'],
    });
    const recoveredReceiptRetried = Boolean(recoveredReceipt && 'retried' in recoveredReceipt && recoveredReceipt.retried === true);
    const committedAfterRetry = await prisma.reservation.findMany({ where: { storeId: store.id, bookingSource: 'ami_brain' } });
    assert(recoveredReceipt?.status === 'succeeded' && recoveredReceiptRetried, 'receipt_safe_replay_not_succeeded');
    assert(committedAfterRetry.length === 2, 'safe_replay_created_duplicate_reservation');

    const concurrentKey = `reservation-concurrent-${suffix}`;
    const concurrentPayload = { ...payload, appointmentTime: '2027-01-18T15:00:00+08:00' };
    const concurrentResults = await Promise.all([
      gateway.execute({
        skillKey: 'create_reservation',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions: ['core:store:reservations'], idempotencyKey: concurrentKey },
      }),
      gateway.execute({
        skillKey: 'create_reservation',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions: ['core:store:reservations'], idempotencyKey: concurrentKey },
      }),
    ]);
    const concurrentReservations = await prisma.reservation.findMany({
      where: { storeId: store.id, bookingSource: 'ami_brain', date: new Date('2027-01-18T15:00:00+08:00') },
    });
    assert(concurrentReservations.length === 1, 'concurrent_replay_created_duplicate_reservation');
    assert(concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId, 'concurrent_replay_returned_different_reservations');

    const sharedRawKey = `shared-source-key-${suffix}`;
    const adminReservation = await reservationService.createIdempotent({
      ...payload,
      storeId: store.id,
      appointmentTime: '2027-01-19T15:00:00+08:00',
      bookingSource: 'admin',
      idempotencyKey: sharedRawKey,
    });
    const glowReservation = await reservationService.createIdempotent({
      ...payload,
      storeId: store.id,
      appointmentTime: '2027-01-20T15:00:00+08:00',
      bookingSource: 'ami_glow',
      idempotencyKey: sharedRawKey,
    });
    assert(adminReservation.reservation.id !== glowReservation.reservation.id, 'cross_source_raw_key_collided');

    const anonymousPhone = `139${String(Date.now()).slice(-8)}`;
    const terminalKey = `terminal-anonymous-${suffix}`;
    const terminalInput = {
      storeId: store.id,
      customerName: '隔离库终端新客户',
      customerPhone: anonymousPhone,
      projectId: project.id,
      beauticianId: beautician.id,
      appointmentTime: '2027-01-21T15:00:00+08:00',
      duration: 60,
      bookingSource: 'ami_aura_lite',
      idempotencyKey: terminalKey,
      allowCreateCustomer: true,
    };
    const terminalResults = await Promise.all([
      reservationService.createIdempotent(terminalInput),
      reservationService.createIdempotent(terminalInput),
    ]);
    const [terminalReservations, terminalCustomers] = await Promise.all([
      prisma.reservation.findMany({ where: { storeId: store.id, bookingSource: 'ami_aura_lite' } }),
      prisma.customer.findMany({ where: { storeId: store.id, phone: anonymousPhone } }),
    ]);
    assert(terminalResults[0].reservation.id === terminalResults[1].reservation.id, 'terminal_concurrent_replay_returned_different_reservations');
    assert(terminalReservations.length === 1, 'terminal_concurrent_replay_created_duplicate_reservation');
    assert(terminalCustomers.length === 1, 'terminal_concurrent_replay_created_duplicate_customer');

    console.log(JSON.stringify({
      status: 'passed',
      databaseWritePerformed: true,
      target,
      evidence: {
        actionId: confirmation.actionId,
        reservationId: reservations[0].id,
        duplicateConfirmationShortCircuited,
        businessReplayReturnedSameReservation: businessReplay.businessObjectId === reservations[0].id,
        postMutationReplayReturnedSameReservation: postMutationReplay.businessObjectId === reservations[0].id,
        mismatchedReplayRejected,
        receiptFailureDetectedAfterBusinessCommit: failedReceipt?.status === 'failed',
        receiptSafeReplaySucceeded: recoveredReceipt?.status === 'succeeded',
        receiptSafeReplayReservationCount: committedAfterRetry.length,
        concurrentReplayReservationCount: concurrentReservations.length,
        concurrentReplaySameBusinessObject: concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId,
        crossSourceSameRawKeySeparated: adminReservation.reservation.id !== glowReservation.reservation.id,
        terminalConcurrentReservationCount: terminalReservations.length,
        terminalConcurrentCustomerCount: terminalCustomers.length,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
