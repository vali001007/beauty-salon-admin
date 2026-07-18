import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BrainActionTargetResolverService } from '../src/brain/domain/brain-action-target-resolver.service.js';
import { BrainActionConfirmationService } from '../src/brain/skills/brain-action-confirmation.service.js';
import { BrainCapabilityGatewayService } from '../src/brain/skills/brain-capability-gateway.service.js';
import { buildFollowUpTaskIdempotencyKey } from '../src/terminal/follow-up-task-idempotency.js';
import { TerminalService } from '../src/terminal/terminal.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') && args.has('--yes');
const databaseUrl = process.env.DATABASE_URL ?? '';

function argValue(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertIsolatedDatabase(urlText: string) {
  const url = new URL(urlText);
  const database = url.pathname.replace(/^\//, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || !database.startsWith('ami_brain_followup_')) {
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
    console.log(JSON.stringify({ status: 'plan_only', databaseWritePerformed: false, target }, null, 2));
    return;
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const store = await prisma.store.create({ data: { name: `Brain Follow-up Acceptance ${suffix}` } });
    const operator = await prisma.user.create({
      data: { username: `brain_followup_${suffix}`, passwordHash: 'isolated-acceptance-only', name: '隔离库跟进验收操作员' },
    });
    await prisma.userStore.create({ data: { userId: operator.id, storeId: store.id } });
    await prisma.beautician.create({ data: { storeId: store.id, userId: operator.id, name: '隔离库跟进顾问' } });
    const customer = await prisma.customer.create({
      data: { storeId: store.id, name: '隔离库跟进客户', phone: `138${String(Date.now()).slice(-8)}` },
    });
    const run = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_follow_up_acceptance' } },
    });

    const terminalService = new TerminalService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      { invalidate: () => undefined } as never,
    );
    const gateway = new BrainCapabilityGatewayService(undefined, undefined, terminalService, prisma);
    const targetResolver = new BrainActionTargetResolverService(prisma);
    const confirmationService = new BrainActionConfirmationService(prisma, gateway, undefined, targetResolver);
    const permissions = ['assist:followup:create', 'core:marketing:create'];
    const idempotencyKey = `follow-up-action-${suffix}`;
    const payload = {
      customerId: customer.id,
      title: '七天护理回访',
      note: '确认护理反馈',
      script: '您好，想了解护理后的感受。',
      channel: 'phone',
    };
    const confirmation = await confirmationService.createPreview({
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'create_customer_followup',
      riskLevel: 'medium',
      preview: { summary: '隔离库创建客户跟进任务' },
      payload,
      idempotencyKey,
      planId: `follow-up-acceptance:${suffix}`,
    });
    const firstExecution = await confirmationService.confirmAndExecute({
      actionId: confirmation.actionId,
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      permissions,
    });
    const duplicateConfirmation = await confirmationService.confirmAndExecute({
      actionId: confirmation.actionId,
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      permissions,
    });
    const duplicateConfirmationShortCircuited = Boolean(
      duplicateConfirmation && 'duplicated' in duplicateConfirmation && duplicateConfirmation.duplicated === true,
    );
    const businessReplay = await gateway.execute({
      skillKey: 'create_customer_followup',
      payload,
      context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey },
    });
    await prisma.terminalFollowUpTask.update({
      where: { id: Number(businessReplay.businessObjectId) },
      data: { status: 'completed', completedAt: new Date() },
    });
    const postMutationReplay = await gateway.execute({
      skillKey: 'create_customer_followup',
      payload,
      context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey },
    });
    let mismatchedReplayRejected = false;
    try {
      await gateway.execute({
        skillKey: 'create_customer_followup',
        payload: { ...payload, script: '另一条回访话术' },
        context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey },
      });
    } catch (error) {
      mismatchedReplayRejected = error instanceof Error && error.message.includes('幂等键已用于另一条客户跟进任务');
    }

    const businessKey = buildFollowUpTaskIdempotencyKey(store.id, 'brain_followup', idempotencyKey)!;
    const tasks = await prisma.terminalFollowUpTask.findMany({ where: { idempotencyKey: businessKey } });
    const executions = await prisma.brainActionExecution.findMany({ where: { actionId: confirmation.actionId } });
    assert(firstExecution?.status === 'succeeded', 'first_execution_not_succeeded');
    assert(duplicateConfirmationShortCircuited, 'duplicate_confirmation_not_short_circuited');
    assert(tasks.length === 1, 'brain_follow_up_count_not_one');
    assert(businessReplay.businessObjectId === tasks[0].id, 'business_replay_returned_different_task');
    assert(postMutationReplay.businessObjectId === tasks[0].id, 'post_mutation_replay_returned_different_task');
    assert(mismatchedReplayRejected, 'mismatched_idempotent_replay_not_rejected');
    assert(tasks[0].idempotencyKey?.length === 64, 'follow_up_idempotency_key_missing');
    assert(tasks[0].creationFingerprint?.length === 64, 'follow_up_creation_fingerprint_missing');
    assert(!JSON.stringify(tasks[0].payload).includes(idempotencyKey), 'raw_idempotency_key_leaked_to_payload');
    assert(executions.length === 1 && executions[0].status === 'succeeded', 'execution_receipt_not_persisted');

    const recoveryRun = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_follow_up_receipt_recovery' } },
    });
    const recoveryKey = `follow-up-recovery-${suffix}`;
    const recoveryPayload = { ...payload, title: '回执恢复任务' };
    const recoveryConfirmation = await confirmationService.createPreview({
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'create_customer_followup',
      riskLevel: 'medium',
      preview: { summary: '隔离库跟进回执恢复' },
      payload: recoveryPayload,
      idempotencyKey: recoveryKey,
      planId: `follow-up-recovery:${suffix}`,
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
      permissions,
    });
    const failedReceiptRetryable = Boolean(failedReceipt && 'retryable' in failedReceipt && failedReceipt.retryable === true);
    assert(failedReceipt?.status === 'failed' && failedReceiptRetryable, 'receipt_failure_not_marked_safe_replay');
    const recoveryBusinessKey = buildFollowUpTaskIdempotencyKey(store.id, 'brain_followup', recoveryKey)!;
    const committedBeforeRetry = await prisma.terminalFollowUpTask.count({ where: { idempotencyKey: recoveryBusinessKey } });
    assert(committedBeforeRetry === 1, 'business_write_not_committed_before_receipt_failure');
    const recoveredReceipt = await faultingConfirmationService.retryFailedExecution({
      actionId: recoveryConfirmation.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions,
    });
    const committedAfterRetry = await prisma.terminalFollowUpTask.count({ where: { idempotencyKey: recoveryBusinessKey } });
    const recoveredReceiptRetried = Boolean(recoveredReceipt && 'retried' in recoveredReceipt && recoveredReceipt.retried === true);
    assert(recoveredReceipt?.status === 'succeeded' && recoveredReceiptRetried, 'receipt_safe_replay_not_succeeded');
    assert(committedAfterRetry === 1, 'safe_replay_created_duplicate_follow_up');

    const concurrentKey = `follow-up-concurrent-${suffix}`;
    const concurrentPayload = { ...payload, title: '并发跟进任务' };
    const concurrentResults = await Promise.all([
      gateway.execute({
        skillKey: 'create_customer_followup',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey: concurrentKey },
      }),
      gateway.execute({
        skillKey: 'create_customer_followup',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey: concurrentKey },
      }),
    ]);
    const concurrentBusinessKey = buildFollowUpTaskIdempotencyKey(store.id, 'brain_followup', concurrentKey)!;
    const concurrentCount = await prisma.terminalFollowUpTask.count({ where: { idempotencyKey: concurrentBusinessKey } });
    assert(concurrentCount === 1, 'concurrent_replay_created_duplicate_follow_up');
    assert(concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId, 'concurrent_replay_returned_different_tasks');

    const sharedRawKey = `follow-up-shared-source-${suffix}`;
    const followUpReceipt = await gateway.execute({
      skillKey: 'create_customer_followup',
      payload: { ...payload, title: '共享键客户回访' },
      context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey: sharedRawKey },
    });
    const marketingReceipt = await gateway.execute({
      skillKey: 'create_marketing_touch_draft',
      payload: { ...payload, title: '共享键营销草稿' },
      context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey: sharedRawKey },
    });
    assert(followUpReceipt.businessObjectId !== marketingReceipt.businessObjectId, 'cross_source_raw_key_collided');

    const marketingDeliveryJobCount = await prisma.marketingDeliveryJob.count({ where: { storeId: store.id } });
    const marketingTouchCount = await prisma.marketingAutomationTouch.count({ where: { customerId: customer.id } });
    assert(marketingDeliveryJobCount === 0, 'marketing_draft_created_delivery_job');
    assert(marketingTouchCount === 0, 'marketing_draft_created_external_touch');

    const result = {
      status: 'passed',
      databaseWritePerformed: true,
      target,
      evidence: {
        actionId: confirmation.actionId,
        followUpTaskId: tasks[0].id,
        duplicateConfirmationShortCircuited,
        businessReplayReturnedSameTask: businessReplay.businessObjectId === tasks[0].id,
        postMutationReplayReturnedSameTask: postMutationReplay.businessObjectId === tasks[0].id,
        mismatchedReplayRejected,
        rawIdempotencyKeyAbsentFromPayload: !JSON.stringify(tasks[0].payload).includes(idempotencyKey),
        receiptFailureDetectedAfterBusinessCommit: failedReceipt?.status === 'failed',
        receiptSafeReplaySucceeded: recoveredReceipt?.status === 'succeeded',
        receiptSafeReplayFollowUpCount: committedAfterRetry,
        concurrentReplayFollowUpCount: concurrentCount,
        concurrentReplaySameBusinessObject: concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId,
        crossSourceSameRawKeySeparated: followUpReceipt.businessObjectId !== marketingReceipt.businessObjectId,
        marketingDeliveryJobCount,
        marketingTouchCount,
      },
    };
    const output = `${JSON.stringify(result, null, 2)}\n`;
    const outPath = argValue('out');
    if (outPath) {
      const resolvedPath = resolve(process.cwd(), outPath);
      mkdirSync(dirname(resolvedPath), { recursive: true });
      writeFileSync(resolvedPath, output, 'utf8');
    }
    console.log(output.trim());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
