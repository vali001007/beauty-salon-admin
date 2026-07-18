import { ConfigService } from '@nestjs/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BrainMarketingDomainAdapter } from '../src/brain/domain/adapters/brain-marketing-domain.adapter.js';
import { BrainActionTargetResolverService } from '../src/brain/domain/brain-action-target-resolver.service.js';
import { BrainActionConfirmationService } from '../src/brain/skills/brain-action-confirmation.service.js';
import { BrainCapabilityGatewayService } from '../src/brain/skills/brain-capability-gateway.service.js';
import { MarketingAudienceService } from '../src/marketing/automation/marketing-audience.service.js';
import { MarketingDeliveryWorkerService } from '../src/marketing/automation/marketing-delivery-worker.service.js';
import { MarketingExecutionService } from '../src/marketing/automation/marketing-execution.service.js';
import { MarketingChannelService } from '../src/marketing/marketing-channel.service.js';
import { MarketingFeatureFlagsService } from '../src/marketing/marketing-feature-flags.service.js';
import { MarketingService } from '../src/marketing/marketing.service.js';
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
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  const database = url.pathname.replace(/^\//, '');
  if (!loopback || !database.startsWith('ami_brain_marketing_action_')) {
    throw new Error(`unsafe_database_target:${url.hostname}/${database}`);
  }
  return { host: url.hostname, port: Number(url.port || 5432), database };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`acceptance_failed:${message}`);
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function createPredictionRun(prisma: PrismaService, storeId: number, suffix: string, label: string) {
  return prisma.predictionRun.create({
    data: {
      storeId,
      businessDate: new Date('2026-07-18T00:00:00.000Z'),
      runKey: `brain-marketing-${label}-${suffix}`,
      modelVersion: 'isolated-acceptance-v1',
      status: 'completed',
      finishedAt: new Date(),
      customerCount: 0,
      summaryJson: { source: 'ami_brain_marketing_action_acceptance' },
    },
  });
}

async function createAudienceCustomer(
  prisma: PrismaService,
  input: { storeId: number; runId: number; suffix: string; index: number },
) {
  const customer = await prisma.customer.create({
    data: {
      storeId: input.storeId,
      name: `营销动作验收客户 ${input.index}`,
      phone: `139${String(input.index).padStart(8, '0')}`,
      memberLevel: 'VIP',
      totalSpent: 3000 + input.index,
      visitCount: 5,
      lastVisitDate: new Date('2026-04-01T00:00:00.000Z'),
      tags: ['隔离库验收'],
    },
  });
  await prisma.customerPredictionSnapshot.create({
    data: {
      runId: input.runId,
      customerId: customer.id,
      storeId: input.storeId,
      modelVersion: 'isolated-acceptance-v1',
      churnScore: 85,
      churnLevel: 'high',
      repurchase30dScore: 70,
      marketingResponseScore: 80,
      ltv6m: 6000,
      ltv12m: 12000,
      ltvTier: '黄金',
      featureJson: { lastVisitDays: 108, currentGapRatio: 2.1 },
      reasonJson: ['长期未到店', '营销响应高'],
      recommendedActionsJson: ['in_app_recall'],
    },
  });
  return customer;
}

async function createStrategy(
  prisma: PrismaService,
  input: { storeId: number; name: string; channel: 'in_app' | 'sms'; content: string },
) {
  return prisma.marketingAutomationStrategy.create({
    data: {
      storeId: input.storeId,
      name: input.name,
      description: 'Ami Brain 隔离库营销策略执行验收',
      status: 'enabled',
      executionType: 'manual',
      source: 'ami_brain_acceptance',
      schedule: { type: 'manual' },
      triggerRules: [],
      ruleRelation: 'AND',
      actions: [{ channel: input.channel, title: input.name, content: input.content }],
    },
  });
}

async function createRun(prisma: PrismaService, storeId: number, userId: number, source: string) {
  return prisma.brainRun.create({
    data: { storeId, userId, status: 'running', input: { source } },
  });
}

async function previewStrategy(
  adapter: BrainMarketingDomainAdapter,
  input: { runId: number; userId: number; storeId: number; strategyName: string },
) {
  const answer = await adapter.execute({
    runId: input.runId,
    context: {
      userId: input.userId,
      storeId: input.storeId,
      visibleStoreIds: [input.storeId],
      permissions: ['core:brain:use', 'core:marketing:update'],
      deniedPermissions: [],
      requestId: `acceptance-${input.runId}`,
      timezone: 'Asia/Shanghai',
    },
    dto: { message: `执行自动触达策略 ${input.strategyName}`, roleHint: 'marketing', timezone: 'Asia/Shanghai' },
    cognition: {} as never,
    runtimeIntent: {} as never,
    plan: {
      role: 'marketing',
      domain: 'marketing_growth',
      intent: 'action',
      answerShape: 'non_metric',
      adapterKey: 'marketing_growth',
      capabilityKey: 'marketing_strategy_execute_preview',
      requiredPermissions: ['core:marketing:update'],
      confidence: 1,
      grounding: 'preview_action',
      reason: 'marketing_strategy_execute_preview',
    },
  });
  const action = asRecord(answer?.suggestedActions?.[0]);
  assert(answer?.status === 'completed', 'strategy_preview_not_completed');
  assert(typeof action.actionId === 'string', 'strategy_preview_action_missing');
  return {
    answer,
    actionId: String(action.actionId),
    approvedAudienceCount: Number(answer?.metadata?.approvedAudienceCount ?? 0),
  };
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
    const store = await prisma.store.create({ data: { name: `Brain Marketing Action Acceptance ${suffix}` } });
    const operator = await prisma.user.create({
      data: {
        username: `brain_marketing_action_${suffix}`,
        passwordHash: 'isolated-acceptance-only',
        name: '隔离库营销动作验收操作员',
      },
    });
    const featureFlags = {
      deliveryJobEngine: true,
      effectFactWrite: false,
      isEnabledForStore: (flag: string, storeId: number) => flag === 'deliveryJobEngine' && storeId === store.id,
      enabledStoreIds: (flag: string) => flag === 'deliveryJobEngine' ? [store.id] : [],
    } as unknown as MarketingFeatureFlagsService;
    const audienceService = new MarketingAudienceService(prisma);
    const executionService = new MarketingExecutionService(prisma, audienceService);
    const marketingService = new MarketingService(
      prisma,
      new ConfigService({}),
      undefined,
      undefined,
      undefined,
      undefined,
      audienceService,
      executionService,
      featureFlags,
    );
    const gateway = new BrainCapabilityGatewayService(
      undefined,
      undefined,
      undefined,
      prisma,
      undefined,
      marketingService,
    );
    const targetResolver = new BrainActionTargetResolverService(prisma);
    const confirmationService = new BrainActionConfirmationService(prisma, gateway, undefined, targetResolver);
    const adapter = new BrainMarketingDomainAdapter(
      undefined as never,
      undefined as never,
      undefined as never,
      confirmationService,
      targetResolver,
      undefined,
      undefined,
      marketingService,
    );
    const channelService = new MarketingChannelService(prisma, undefined as never);
    const worker = new MarketingDeliveryWorkerService(prisma, channelService, featureFlags);

    const primaryPredictionRun = await createPredictionRun(prisma, store.id, suffix, 'primary');
    await createAudienceCustomer(prisma, { storeId: store.id, runId: primaryPredictionRun.id, suffix, index: 1 });
    await prisma.predictionRun.update({ where: { id: primaryPredictionRun.id }, data: { customerCount: 1 } });

    const driftStrategy = await createStrategy(prisma, {
      storeId: store.id,
      name: `受众漂移门禁策略 ${suffix}`,
      channel: 'in_app',
      content: '受众漂移验收消息',
    });
    const driftRun = await createRun(prisma, store.id, operator.id, 'marketing_audience_drift_acceptance');
    const driftPreview = await previewStrategy(adapter, {
      runId: driftRun.id,
      userId: operator.id,
      storeId: store.id,
      strategyName: driftStrategy.name,
    });
    assert(driftPreview.approvedAudienceCount === 1, 'initial_drift_audience_not_one');
    for (let index = 2; index <= 12; index += 1) {
      await createAudienceCustomer(prisma, { storeId: store.id, runId: primaryPredictionRun.id, suffix, index });
    }
    await prisma.predictionRun.update({ where: { id: primaryPredictionRun.id }, data: { customerCount: 12 } });
    const driftResult = await confirmationService.confirmAndExecute({
      actionId: driftPreview.actionId,
      runId: driftRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:marketing:update'],
    });
    const driftExecutionCount = await prisma.marketingAutomationExecution.count({ where: { strategyId: driftStrategy.id } });
    assert(driftResult?.status === 'failed', 'audience_drift_not_rejected');
    assert(driftExecutionCount === 0, 'audience_drift_created_business_execution');

    const successStrategy = await createStrategy(prisma, {
      storeId: store.id,
      name: `站内召回成功策略 ${suffix}`,
      channel: 'in_app',
      content: '欢迎查看您的专属护理提醒',
    });
    const successRun = await createRun(prisma, store.id, operator.id, 'marketing_delivery_success_acceptance');
    const successPreview = await previewStrategy(adapter, {
      runId: successRun.id,
      userId: operator.id,
      storeId: store.id,
      strategyName: successStrategy.name,
    });
    assert(successPreview.approvedAudienceCount === 12, 'success_preview_audience_not_twelve');
    const firstExecution = await confirmationService.confirmAndExecute({
      actionId: successPreview.actionId,
      runId: successRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:marketing:update'],
    });
    assert(firstExecution?.status === 'executing', 'queued_marketing_action_not_executing');
    const duplicateConfirmation = await confirmationService.confirmAndExecute({
      actionId: successPreview.actionId,
      runId: successRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:marketing:update'],
    });
    assert(
      duplicateConfirmation && 'duplicated' in duplicateConfirmation && duplicateConfirmation.duplicated === true,
      'duplicate_marketing_confirmation_not_short_circuited',
    );
    const successBusinessExecution = await prisma.marketingAutomationExecution.findFirstOrThrow({
      where: { strategyId: successStrategy.id },
    });
    const successConfirmation = await prisma.brainActionConfirmation.findUniqueOrThrow({
      where: { actionId: successPreview.actionId },
    });
    const successEnvelope = asRecord(successConfirmation.payload);
    const successBusinessReplay = await gateway.execute({
      skillKey: 'execute_marketing_strategy',
      payload: { strategyId: successStrategy.id, strategyName: successStrategy.name, approvedAudienceCount: 12 },
      context: {
        userId: operator.id,
        storeId: store.id,
        permissions: ['core:marketing:update'],
        idempotencyKey: String(successEnvelope.idempotencyKey),
      },
    });
    assert(successBusinessReplay.businessObjectId === successBusinessExecution.id, 'business_replay_changed_execution');
    assert(await prisma.marketingAutomationTouch.count({ where: { executionId: successBusinessExecution.id } }) === 12, 'success_touch_count_not_twelve');
    assert(await prisma.marketingDeliveryJob.count({ where: { executionId: successBusinessExecution.id } }) === 12, 'success_job_count_not_twelve');
    const successWorkerResult = await worker.processBatch('acceptance-success-worker', new Date());
    assert(successWorkerResult.processed === 12, 'success_jobs_not_processed');
    assert(await prisma.marketingInAppNotification.count({ where: { executionId: successBusinessExecution.id } }) === 12, 'in_app_notification_count_not_twelve');
    const successStatus = await confirmationService.listExecutionStatuses({ runId: successRun.id, userId: operator.id, storeId: store.id });
    assert(successStatus[0]?.status === 'succeeded', 'brain_action_not_reconciled_to_succeeded');
    const successExecutionAfterDelivery = await prisma.marketingAutomationExecution.findUniqueOrThrow({ where: { id: successBusinessExecution.id } });
    assert(successExecutionAfterDelivery.status === 'success', 'business_execution_not_success');
    assert(successExecutionAfterDelivery.reachedCount === 12 && successExecutionAfterDelivery.failedCount === 0, 'success_delivery_counts_incorrect');
    const duplicateWorkerResult = await worker.processBatch('acceptance-success-worker-replay', new Date());
    assert(duplicateWorkerResult.claimed === 0, 'delivered_jobs_claimed_twice');

    const recoveryPredictionRun = await createPredictionRun(prisma, store.id, suffix, 'recovery');
    for (let index = 101; index <= 102; index += 1) {
      await createAudienceCustomer(prisma, { storeId: store.id, runId: recoveryPredictionRun.id, suffix, index });
    }
    await prisma.predictionRun.update({ where: { id: recoveryPredictionRun.id }, data: { customerCount: 2 } });
    const recoveryStrategy = await createStrategy(prisma, {
      storeId: store.id,
      name: `回执恢复策略 ${suffix}`,
      channel: 'in_app',
      content: '回执恢复验收消息',
    });
    const recoveryRun = await createRun(prisma, store.id, operator.id, 'marketing_receipt_recovery_acceptance');
    const recoveryPreview = await previewStrategy(adapter, {
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      strategyName: recoveryStrategy.name,
    });
    assert(recoveryPreview.approvedAudienceCount === 2, 'recovery_preview_audience_not_two');
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
          if (failReceiptPersistence && data.status === 'executing' && data.receiptPayload) {
            failReceiptPersistence = false;
            throw new Error('acceptance_marketing_receipt_persist_failure');
          }
          return executionDelegate.update(input);
        },
      },
      $transaction: prisma.$transaction.bind(prisma),
    };
    const faultingConfirmationService = new BrainActionConfirmationService(faultingPrisma as never, gateway, undefined, targetResolver);
    const failedReceipt = await faultingConfirmationService.confirmAndExecute({
      actionId: recoveryPreview.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:marketing:update'],
    });
    assert(failedReceipt?.status === 'failed', 'receipt_fault_not_detected');
    const recoveryExecution = await prisma.marketingAutomationExecution.findFirstOrThrow({ where: { strategyId: recoveryStrategy.id } });
    const recoveryJobCountBeforeRetry = await prisma.marketingDeliveryJob.count({ where: { executionId: recoveryExecution.id } });
    const recoveredReceipt = await faultingConfirmationService.retryFailedExecution({
      actionId: recoveryPreview.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:marketing:update'],
    });
    const recoveryJobCountAfterRetry = await prisma.marketingDeliveryJob.count({ where: { executionId: recoveryExecution.id } });
    assert(recoveredReceipt?.status === 'executing', 'receipt_safe_replay_not_restored');
    assert(recoveryJobCountBeforeRetry === 2 && recoveryJobCountAfterRetry === 2, 'receipt_retry_created_duplicate_jobs');
    await worker.processBatch('acceptance-recovery-worker', new Date());
    const recoveredStatus = await confirmationService.listExecutionStatuses({ runId: recoveryRun.id, userId: operator.id, storeId: store.id });
    assert(recoveredStatus[0]?.status === 'succeeded', 'recovered_action_not_reconciled_to_succeeded');

    const failedStrategy = await createStrategy(prisma, {
      storeId: store.id,
      name: `未配置短信渠道策略 ${suffix}`,
      channel: 'sms',
      content: '短信渠道失败验收消息',
    });
    const failedRun = await createRun(prisma, store.id, operator.id, 'marketing_delivery_failure_acceptance');
    const failedPreview = await previewStrategy(adapter, {
      runId: failedRun.id,
      userId: operator.id,
      storeId: store.id,
      strategyName: failedStrategy.name,
    });
    assert(failedPreview.approvedAudienceCount === 2, 'failed_channel_preview_audience_not_two');
    const failedQueued = await confirmationService.confirmAndExecute({
      actionId: failedPreview.actionId,
      runId: failedRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:marketing:update'],
    });
    assert(failedQueued?.status === 'executing', 'failed_channel_not_initially_queued');
    await worker.processBatch('acceptance-failed-worker', new Date());
    const failedStatus = await confirmationService.listExecutionStatuses({ runId: failedRun.id, userId: operator.id, storeId: store.id });
    assert(failedStatus[0]?.status === 'failed', 'dead_letter_not_reconciled_to_failed');
    assert(failedStatus[0]?.retryable === false && failedStatus[0]?.recovery === 'manual_reconcile', 'dead_letter_offered_invalid_safe_replay');
    const failedBusinessExecution = await prisma.marketingAutomationExecution.findFirstOrThrow({ where: { strategyId: failedStrategy.id } });
    assert(failedBusinessExecution.status === 'failed' && failedBusinessExecution.failedCount === 2, 'failed_execution_counts_incorrect');
    assert(await prisma.marketingDeliveryJob.count({ where: { executionId: failedBusinessExecution.id, status: 'dead_letter' } }) === 2, 'dead_letter_count_not_two');

    const result = {
      status: 'passed',
      databaseWritePerformed: true,
      externalChannelWritePerformed: false,
      target,
      evidence: {
        audienceDriftRejected: driftResult?.status === 'failed',
        audienceDriftBusinessExecutionCount: driftExecutionCount,
        queuedActionStatus: firstExecution?.status,
        duplicateConfirmationShortCircuited: Boolean(duplicateConfirmation && 'duplicated' in duplicateConfirmation && duplicateConfirmation.duplicated),
        businessReplayReturnedSameExecution: successBusinessReplay.businessObjectId === successBusinessExecution.id,
        successfulDelivery: {
          executionId: successBusinessExecution.id,
          queuedCount: successExecutionAfterDelivery.queuedCount,
          reachedCount: successExecutionAfterDelivery.reachedCount,
          failedCount: successExecutionAfterDelivery.failedCount,
          notificationCount: await prisma.marketingInAppNotification.count({ where: { executionId: successBusinessExecution.id } }),
          actionStatus: successStatus[0]?.status,
          duplicateWorkerClaimed: duplicateWorkerResult.claimed,
        },
        receiptRecovery: {
          executionId: recoveryExecution.id,
          failedReceiptDetected: failedReceipt?.status === 'failed',
          retryStatus: recoveredReceipt?.status,
          jobsBeforeRetry: recoveryJobCountBeforeRetry,
          jobsAfterRetry: recoveryJobCountAfterRetry,
          finalActionStatus: recoveredStatus[0]?.status,
        },
        failedChannel: {
          executionId: failedBusinessExecution.id,
          status: failedBusinessExecution.status,
          failedCount: failedBusinessExecution.failedCount,
          actionStatus: failedStatus[0]?.status,
          retryable: failedStatus[0]?.retryable,
          recovery: failedStatus[0]?.recovery,
          deadLetterCount: await prisma.marketingDeliveryJob.count({ where: { executionId: failedBusinessExecution.id, status: 'dead_letter' } }),
        },
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
