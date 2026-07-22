import { Prisma } from '@prisma/client';
import { BrainActionTargetResolverService } from '../src/brain/domain/brain-action-target-resolver.service.js';
import { BrainActionConfirmationService } from '../src/brain/skills/brain-action-confirmation.service.js';
import { BrainCapabilityGatewayService } from '../src/brain/skills/brain-capability-gateway.service.js';
import { CardsService } from '../src/cards/cards.service.js';
import { CommissionService } from '../src/commission/commission.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply') && args.has('--yes');
const databaseUrl = process.env.DATABASE_URL ?? '';

function assertIsolatedDatabase(urlText: string) {
  const url = new URL(urlText);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  const database = url.pathname.replace(/^\//, '');
  if (!loopback || !database.startsWith('ami_brain_action_')) {
    throw new Error(`unsafe_database_target:${url.hostname}/${database}`);
  }
  return { host: url.hostname, port: Number(url.port || 5432), database };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`acceptance_failed:${message}`);
}

function number(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
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
    const store = await prisma.store.create({ data: { name: `Brain Action Acceptance ${suffix}` } });
    const operator = await prisma.user.create({
      data: { username: `brain_action_${suffix}`, passwordHash: 'isolated-acceptance-only', name: '隔离库验收操作员' },
    });
    const customer = await prisma.customer.create({
      data: { storeId: store.id, name: '隔离库验收客户', phone: '13800000001', tags: [] },
    });
    const project = await prisma.project.create({
      data: { storeId: store.id, name: '隔离库深层补水护理', price: 380, duration: 60 },
    });
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        sku: `ACTION-${suffix}`,
        name: '隔离库补水精华',
        unit: '瓶',
        specUnit: '瓶',
        costPrice: 20,
        retailPrice: 80,
        currentStock: 10,
      },
    });
    const batch = await prisma.stockBatch.create({
      data: { productId: product.id, batchNo: `BATCH-${suffix}`, stock: 10, unitCost: 20, expiryDate: new Date('2027-12-31T00:00:00.000Z') },
    });
    await prisma.projectBomItem.create({
      data: { projectId: project.id, productId: product.id, standardQty: 0.5, unit: '瓶' },
    });
    const card = await prisma.card.create({
      data: {
        storeId: store.id,
        name: '隔离库补水 10 次卡',
        totalTimes: 10,
        price: 1000,
        projects: [{ projectId: project.id, projectName: project.name, timesPerCard: 10 }],
      },
    });
    const customerCard = await prisma.customerCard.create({
      data: {
        customerId: customer.id,
        cardId: card.id,
        operatorId: operator.id,
        cardName: card.name,
        totalTimes: 10,
        remainingTimes: 10,
        paidAmount: 1000,
        recognizedUnitValue: 100,
        pricingSnapshot: { recognizedUnitValue: 100, totalTimes: 10, paidAmount: 1000 },
        expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      },
    });
    const beautician = await prisma.beautician.create({
      data: { storeId: store.id, userId: operator.id, name: '隔离库验收美容师' },
    });
    const commissionRule = await prisma.commissionRule.create({
      data: {
        storeId: store.id,
        name: '隔离库项目提成 10%',
        type: 'project',
        targetType: 'specific',
        targetId: project.id,
        userId: operator.id,
        rate: 0.1,
        calcBase: 'total',
      },
    });
    await prisma.commissionRuleAssignment.create({
      data: {
        storeId: store.id,
        ruleId: commissionRule.id,
        type: 'project',
        targetType: 'specific',
        targetId: project.id,
        userId: operator.id,
      },
    });
    const run = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_card_usage_acceptance' } },
    });

    const commissionService = new CommissionService(prisma);
    const cardsService = new CardsService(prisma, commissionService);
    const gateway = new BrainCapabilityGatewayService(undefined, undefined, undefined, prisma, cardsService);
    const targetResolver = new BrainActionTargetResolverService(prisma);
    const confirmationService = new BrainActionConfirmationService(prisma, gateway, undefined, targetResolver);
    const idempotencyKey = `card-usage-action-${suffix}`;
    const payload = {
      customerCardId: customerCard.id,
      customerId: customer.id,
      projectId: project.id,
      projectName: project.name,
      times: 2,
      beauticianId: beautician.id,
      remark: 'Ami Brain 隔离库次卡核销验收',
    };
    const confirmation = await confirmationService.createPreview({
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'verify_card_usage',
      riskLevel: 'critical',
      preview: { summary: '隔离库次卡核销 2 次' },
      payload,
      idempotencyKey,
      planId: `acceptance:${suffix}`,
    });
    const firstExecution = await confirmationService.confirmAndExecute({
      actionId: confirmation.actionId,
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:order:card-usage'],
    });
    const duplicateConfirmation = await confirmationService.confirmAndExecute({
      actionId: confirmation.actionId,
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:order:card-usage'],
    });
    const businessReplay = await gateway.execute({
      skillKey: 'verify_card_usage',
      payload,
      context: {
        userId: operator.id,
        storeId: store.id,
        permissions: ['core:order:card-usage'],
        idempotencyKey,
      },
    });
    let mismatchedReplayRejected = false;
    try {
      await gateway.execute({
        skillKey: 'verify_card_usage',
        payload: { ...payload, times: 1 },
        context: {
          userId: operator.id,
          storeId: store.id,
          permissions: ['core:order:card-usage'],
          idempotencyKey,
        },
      });
    } catch (error) {
      mismatchedReplayRejected = error instanceof Error && error.message.includes('幂等键已用于另一笔次卡核销');
    }

    const [storedCard, storedBatch, storedProduct, usages, executions, storedConfirmation] = await Promise.all([
      prisma.customerCard.findUniqueOrThrow({ where: { id: customerCard.id } }),
      prisma.stockBatch.findUniqueOrThrow({ where: { id: batch.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.cardUsageRecord.findMany({ where: { customerCardId: customerCard.id } }),
      prisma.brainActionExecution.findMany({ where: { actionId: confirmation.actionId } }),
      prisma.brainActionConfirmation.findUniqueOrThrow({ where: { actionId: confirmation.actionId } }),
    ]);
    const usage = usages[0];
    assert(usage, 'card_usage_missing');
    const [movements, commissions] = await Promise.all([
      prisma.stockMovement.findMany({ where: { sourceType: 'card_usage', sourceId: usage.id } }),
      prisma.commissionRecord.findMany({ where: { sourceType: 'card_usage', cardUsageRecordId: usage.id } }),
    ]);
    const movement = movements[0];
    const commission = commissions[0];

    assert(firstExecution?.status === 'succeeded', 'first_execution_not_succeeded');
    assert(duplicateConfirmation?.duplicated === true, 'duplicate_confirmation_not_short_circuited');
    assert(usages.length === 1, 'card_usage_count_not_one');
    assert(businessReplay.businessObjectId === usage.id, 'business_replay_returned_different_usage');
    assert(mismatchedReplayRejected, 'mismatched_idempotent_replay_not_rejected');
    assert(storedCard.remainingTimes === 8, 'customer_card_remaining_times_not_eight');
    assert(usage.times === 2 && usage.remainingTimes === 8, 'usage_times_or_remaining_times_incorrect');
    assert(number(usage.recognizedUnitValue) === 100 && number(usage.recognizedAmount) === 200, 'recognized_revenue_incorrect');
    assert(typeof usage.idempotencyKey === 'string' && usage.idempotencyKey.length === 64, 'business_idempotency_key_missing');
    assert(number(storedProduct.currentStock) === 9 && number(storedBatch.stock) === 9, 'inventory_not_deducted_once');
    assert(movements.length === 1 && number(movement.quantity) === -1, 'stock_movement_not_exactly_once');
    assert(number(movement.costAmount) === 20 && movement.costSource === 'batch_snapshot', 'inventory_cost_snapshot_incorrect');
    assert(commissions.length === 1, 'commission_count_not_one');
    assert(number(commission.sourceAmount) === 200 && number(commission.rate) === 0.1 && number(commission.amount) === 20, 'commission_amount_incorrect');
    assert(commission.cardUsageRecordId === usage.id, 'commission_not_linked_to_usage');
    assert(executions.length === 1 && executions[0].status === 'succeeded', 'action_execution_receipt_not_persisted');
    assert(executions[0].businessObjectId === String(usage.id), 'execution_business_object_mismatch');
    assert(storedConfirmation.status === 'succeeded', 'confirmation_status_not_succeeded');

    const recoveryCard = await prisma.customerCard.create({
      data: {
        customerId: customer.id,
        cardId: card.id,
        operatorId: operator.id,
        cardName: `${card.name} 回执恢复`,
        totalTimes: 10,
        remainingTimes: 10,
        paidAmount: 1000,
        recognizedUnitValue: 100,
        pricingSnapshot: { recognizedUnitValue: 100, totalTimes: 10, paidAmount: 1000 },
        expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      },
    });
    const recoveryRun = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_receipt_recovery_acceptance' } },
    });
    const recoveryIdempotencyKey = `card-usage-recovery-${suffix}`;
    const recoveryPayload = { ...payload, customerCardId: recoveryCard.id, times: 1 };
    const recoveryConfirmation = await confirmationService.createPreview({
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'verify_card_usage',
      riskLevel: 'critical',
      preview: { summary: '隔离库核销回执恢复' },
      payload: recoveryPayload,
      idempotencyKey: recoveryIdempotencyKey,
      planId: `acceptance-recovery:${suffix}`,
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
    const faultingConfirmationService = new BrainActionConfirmationService(
      faultingPrisma as never,
      gateway,
      undefined,
      targetResolver,
    );
    const failedReceipt = await faultingConfirmationService.confirmAndExecute({
      actionId: recoveryConfirmation.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:order:card-usage'],
    });
    assert(failedReceipt?.status === 'failed' && failedReceipt.retryable === true, 'receipt_failure_not_marked_safe_replay');
    const committedBeforeRetry = await prisma.cardUsageRecord.findMany({ where: { customerCardId: recoveryCard.id } });
    assert(committedBeforeRetry.length === 1, 'business_write_not_committed_before_receipt_failure');
    const recoveredReceipt = await faultingConfirmationService.retryFailedExecution({
      actionId: recoveryConfirmation.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions: ['core:order:card-usage'],
    });
    const [recoveryCardAfter, committedAfterRetry, recoveryMovements, recoveryCommissions, recoveryExecution] = await Promise.all([
      prisma.customerCard.findUniqueOrThrow({ where: { id: recoveryCard.id } }),
      prisma.cardUsageRecord.findMany({ where: { customerCardId: recoveryCard.id } }),
      prisma.stockMovement.findMany({ where: { sourceType: 'card_usage', sourceId: committedBeforeRetry[0].id } }),
      prisma.commissionRecord.findMany({ where: { cardUsageRecordId: committedBeforeRetry[0].id } }),
      prisma.brainActionExecution.findUniqueOrThrow({
        where: { storeId_capabilityKey_idempotencyKey: { storeId: store.id, capabilityKey: 'verify_card_usage', idempotencyKey: recoveryIdempotencyKey } },
      }),
    ]);
    assert(recoveredReceipt?.status === 'succeeded' && recoveredReceipt.retried === true, 'receipt_safe_replay_not_succeeded');
    assert(committedAfterRetry.length === 1, 'safe_replay_created_duplicate_usage');
    assert(recoveryCardAfter.remainingTimes === 9, 'safe_replay_deducted_card_twice');
    assert(recoveryMovements.length === 1, 'safe_replay_deducted_inventory_twice');
    assert(recoveryCommissions.length === 1, 'safe_replay_created_duplicate_commission');
    assert(recoveryExecution.status === 'succeeded', 'recovered_execution_not_succeeded');

    const concurrentCard = await prisma.customerCard.create({
      data: {
        customerId: customer.id,
        cardId: card.id,
        operatorId: operator.id,
        cardName: `${card.name} 并发验收`,
        totalTimes: 10,
        remainingTimes: 10,
        paidAmount: 1000,
        recognizedUnitValue: 100,
        pricingSnapshot: { recognizedUnitValue: 100, totalTimes: 10, paidAmount: 1000 },
        expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      },
    });
    const concurrentIdempotencyKey = `card-usage-concurrent-${suffix}`;
    const concurrentPayload = { ...payload, customerCardId: concurrentCard.id, times: 1 };
    const concurrentResults = await Promise.all([
      gateway.execute({
        skillKey: 'verify_card_usage',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions: ['core:order:card-usage'], idempotencyKey: concurrentIdempotencyKey },
      }),
      gateway.execute({
        skillKey: 'verify_card_usage',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions: ['core:order:card-usage'], idempotencyKey: concurrentIdempotencyKey },
      }),
    ]);
    const concurrentUsages = await prisma.cardUsageRecord.findMany({ where: { customerCardId: concurrentCard.id } });
    assert(concurrentUsages.length === 1, 'concurrent_replay_created_duplicate_usage');
    const [concurrentCardAfter, concurrentMovements, concurrentCommissions] = await Promise.all([
      prisma.customerCard.findUniqueOrThrow({ where: { id: concurrentCard.id } }),
      prisma.stockMovement.findMany({ where: { sourceType: 'card_usage', sourceId: concurrentUsages[0].id } }),
      prisma.commissionRecord.findMany({ where: { cardUsageRecordId: concurrentUsages[0].id } }),
    ]);
    assert(concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId, 'concurrent_replay_returned_different_records');
    assert(concurrentCardAfter.remainingTimes === 9, 'concurrent_replay_deducted_card_twice');
    assert(concurrentMovements.length === 1, 'concurrent_replay_deducted_inventory_twice');
    assert(concurrentCommissions.length === 1, 'concurrent_replay_created_duplicate_commission');

    console.log(JSON.stringify({
      status: 'passed',
      databaseWritePerformed: true,
      target,
      evidence: {
        actionId: confirmation.actionId,
        executionId: executions[0].id,
        cardUsageRecordId: usage.id,
        remainingTimes: storedCard.remainingTimes,
        projectRemainingTimes: 8,
        recognizedAmount: number(usage.recognizedAmount),
        productStock: number(storedProduct.currentStock),
        batchStock: number(storedBatch.stock),
        stockMovementQuantity: number(movement.quantity),
        stockMovementCost: number(movement.costAmount),
        commissionAmount: number(commission.amount),
        duplicateConfirmationShortCircuited: duplicateConfirmation?.duplicated === true,
        businessReplayReturnedSameRecord: businessReplay.businessObjectId === usage.id,
        mismatchedReplayRejected,
        receiptFailureDetectedAfterBusinessCommit: failedReceipt?.status === 'failed',
        receiptSafeReplaySucceeded: recoveredReceipt?.status === 'succeeded',
        receiptSafeReplayUsageCount: committedAfterRetry.length,
        receiptSafeReplayCardRemainingTimes: recoveryCardAfter.remainingTimes,
        receiptSafeReplayMovementCount: recoveryMovements.length,
        receiptSafeReplayCommissionCount: recoveryCommissions.length,
        concurrentReplayUsageCount: concurrentUsages.length,
        concurrentReplaySameBusinessObject: concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId,
        concurrentReplayCardRemainingTimes: concurrentCardAfter.remainingTimes,
        concurrentReplayMovementCount: concurrentMovements.length,
        concurrentReplayCommissionCount: concurrentCommissions.length,
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
