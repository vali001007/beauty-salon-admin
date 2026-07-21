import { BrainActionTargetResolverService } from '../src/brain/domain/brain-action-target-resolver.service.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BrainActionConfirmationService } from '../src/brain/skills/brain-action-confirmation.service.js';
import { BrainCapabilityGatewayService } from '../src/brain/skills/brain-capability-gateway.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { buildPurchaseOrderIdempotencyKey } from '../src/inventory/purchase-order-idempotency.js';
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
  if (!loopback || !database.startsWith('ami_brain_purchase_')) {
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
    const store = await prisma.store.create({ data: { name: `Brain Purchase Acceptance ${suffix}` } });
    const operator = await prisma.user.create({
      data: { username: `brain_purchase_${suffix}`, passwordHash: 'isolated-acceptance-only', name: '隔离库采购验收操作员' },
    });
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        name: '隔离库采购商品',
        sku: `PUR-SKU-${suffix}`,
        unit: '瓶',
        currentStock: 2,
        safetyStock: 10,
        costPrice: 20,
        status: 'active',
      },
    });
    const run = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_purchase_acceptance' } },
    });

    const inventoryService = new InventoryService(prisma, { invalidate: () => undefined } as never);
    const gateway = new BrainCapabilityGatewayService(undefined, inventoryService, undefined, prisma);
    const targetResolver = new BrainActionTargetResolverService(prisma);
    const confirmationService = new BrainActionConfirmationService(prisma, gateway, undefined, targetResolver);
    const permissions = ['core:supply:manage'];
    const idempotencyKey = `purchase-action-${suffix}`;
    const supplier = `采购验收供应商-${suffix}-normal`;
    const payload = {
      supplier,
      submitForApproval: true,
      items: [{ productId: product.id, productName: product.name, sku: product.sku, quantity: 10, unitPrice: 20 }],
    };
    const confirmation = await confirmationService.createPreview({
      runId: run.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'create_purchase_order',
      riskLevel: 'high',
      preview: { summary: '隔离库创建采购单' },
      payload,
      idempotencyKey,
      planId: `purchase-acceptance:${suffix}`,
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
      skillKey: 'create_purchase_order',
      payload,
      context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey },
    });
    await prisma.purchaseOrder.update({ where: { id: Number(businessReplay.businessObjectId) }, data: { status: '已下单' } });
    const postMutationReplay = await gateway.execute({
      skillKey: 'create_purchase_order',
      payload,
      context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey },
    });
    let mismatchedReplayRejected = false;
    try {
      await gateway.execute({
        skillKey: 'create_purchase_order',
        payload: { ...payload, items: [{ ...payload.items[0], quantity: 11 }] },
        context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey },
      });
    } catch (error) {
      mismatchedReplayRejected = error instanceof Error && error.message.includes('幂等键已用于另一张采购单');
    }

    const businessKey = buildPurchaseOrderIdempotencyKey(store.id, 'ami_brain', idempotencyKey)!;
    const orders = await prisma.purchaseOrder.findMany({ where: { idempotencyKey: businessKey } });
    const executions = await prisma.brainActionExecution.findMany({ where: { actionId: confirmation.actionId } });
    assert(firstExecution?.status === 'succeeded', 'first_execution_not_succeeded');
    assert(duplicateConfirmationShortCircuited, 'duplicate_confirmation_not_short_circuited');
    assert(orders.length === 1, 'brain_purchase_order_count_not_one');
    assert(businessReplay.businessObjectId === orders[0].id, 'business_replay_returned_different_purchase_order');
    assert(postMutationReplay.businessObjectId === orders[0].id, 'post_mutation_replay_returned_different_purchase_order');
    assert(mismatchedReplayRejected, 'mismatched_idempotent_replay_not_rejected');
    assert(orders[0].idempotencyKey?.length === 64, 'purchase_order_idempotency_key_missing');
    assert(orders[0].creationFingerprint?.length === 64, 'purchase_order_creation_fingerprint_missing');
    assert(Number(orders[0].totalAmount) === 200, 'purchase_order_total_amount_mismatch');
    assert(executions.length === 1 && executions[0].status === 'succeeded', 'execution_receipt_not_persisted');

    const recoveryRun = await prisma.brainRun.create({
      data: { storeId: store.id, userId: operator.id, status: 'running', input: { source: 'isolated_purchase_receipt_recovery' } },
    });
    const recoveryKey = `purchase-recovery-${suffix}`;
    const recoverySupplier = `采购验收供应商-${suffix}-recovery`;
    const recoveryPayload = { ...payload, supplier: recoverySupplier };
    const recoveryConfirmation = await confirmationService.createPreview({
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      skillKey: 'create_purchase_order',
      riskLevel: 'high',
      preview: { summary: '隔离库采购回执恢复' },
      payload: recoveryPayload,
      idempotencyKey: recoveryKey,
      planId: `purchase-recovery:${suffix}`,
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
    const committedBeforeRetry = await prisma.purchaseOrder.count({ where: { supplier: recoverySupplier } });
    assert(committedBeforeRetry === 1, 'business_write_not_committed_before_receipt_failure');
    const recoveredReceipt = await faultingConfirmationService.retryFailedExecution({
      actionId: recoveryConfirmation.actionId,
      runId: recoveryRun.id,
      userId: operator.id,
      storeId: store.id,
      permissions,
    });
    const recoveredReceiptRetried = Boolean(recoveredReceipt && 'retried' in recoveredReceipt && recoveredReceipt.retried === true);
    const committedAfterRetry = await prisma.purchaseOrder.count({ where: { supplier: recoverySupplier } });
    assert(recoveredReceipt?.status === 'succeeded' && recoveredReceiptRetried, 'receipt_safe_replay_not_succeeded');
    assert(committedAfterRetry === 1, 'safe_replay_created_duplicate_purchase_order');

    const concurrentKey = `purchase-concurrent-${suffix}`;
    const concurrentSupplier = `采购验收供应商-${suffix}-concurrent`;
    const concurrentPayload = { ...payload, supplier: concurrentSupplier };
    const concurrentResults = await Promise.all([
      gateway.execute({
        skillKey: 'create_purchase_order',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey: concurrentKey },
      }),
      gateway.execute({
        skillKey: 'create_purchase_order',
        payload: concurrentPayload,
        context: { userId: operator.id, storeId: store.id, permissions, idempotencyKey: concurrentKey },
      }),
    ]);
    const concurrentCount = await prisma.purchaseOrder.count({ where: { supplier: concurrentSupplier } });
    assert(concurrentCount === 1, 'concurrent_replay_created_duplicate_purchase_order');
    assert(concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId, 'concurrent_replay_returned_different_purchase_orders');

    const sharedRawKey = `purchase-shared-source-${suffix}`;
    const sharedInput = {
      storeId: store.id,
      storeName: store.name,
      supplier: `采购验收供应商-${suffix}-source`,
      expectedDate: '2027-01-31',
      status: '草稿',
      items: payload.items,
      idempotencyKey: sharedRawKey,
    };
    const adminOrder = await inventoryService.createPurchaseOrderIdempotent({ ...sharedInput, source: 'admin' });
    const brainOrder = await inventoryService.createPurchaseOrderIdempotent({ ...sharedInput, source: 'ami_brain' });
    assert(adminOrder.purchaseOrder.id !== brainOrder.purchaseOrder.id, 'cross_source_raw_key_collided');

    const stockMovementCount = await prisma.stockMovement.count({ where: { storeId: store.id } });
    assert(stockMovementCount === 0, 'purchase_creation_modified_inventory');

    const result = {
      status: 'passed',
      databaseWritePerformed: true,
      target,
      evidence: {
        actionId: confirmation.actionId,
        purchaseOrderId: orders[0].id,
        purchaseOrderStatusAfterMutation: (postMutationReplay.result as { status?: string }).status,
        purchaseOrderTotalAmount: Number(orders[0].totalAmount),
        duplicateConfirmationShortCircuited,
        businessReplayReturnedSamePurchaseOrder: businessReplay.businessObjectId === orders[0].id,
        postMutationReplayReturnedSamePurchaseOrder: postMutationReplay.businessObjectId === orders[0].id,
        mismatchedReplayRejected,
        receiptFailureDetectedAfterBusinessCommit: failedReceipt?.status === 'failed',
        receiptSafeReplaySucceeded: recoveredReceipt?.status === 'succeeded',
        receiptSafeReplayPurchaseOrderCount: committedAfterRetry,
        concurrentReplayPurchaseOrderCount: concurrentCount,
        concurrentReplaySameBusinessObject: concurrentResults[0].businessObjectId === concurrentResults[1].businessObjectId,
        crossSourceSameRawKeySeparated: adminOrder.purchaseOrder.id !== brainOrder.purchaseOrder.id,
        stockMovementCount,
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
