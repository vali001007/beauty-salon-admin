import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SupplyPlatformService } from '../src/supply-platform/supply-platform.service.js';

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
  if (!loopback || !database.startsWith('ami_brain_supply_')) {
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
    console.log(
      JSON.stringify(
        { status: 'plan_only', databaseWritePerformed: false, target, requiredFlags: ['--apply', '--yes'] },
        null,
        2,
      ),
    );
    return;
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const store = await prisma.store.create({ data: { name: `Supply Acceptance ${suffix}` } });
    const operator = await prisma.user.create({
      data: {
        username: `supply_acceptance_${suffix}`,
        passwordHash: 'isolated-acceptance-only',
        name: '隔离库供应链验收操作员',
      },
    });
    const products = await Promise.all([
      prisma.product.create({
        data: {
          storeId: store.id,
          sku: `SUPPLY-A-${suffix}`,
          name: '隔离库补货商品 A',
          unit: '盒',
          currentStock: 2,
          safetyStock: 10,
        },
      }),
      prisma.product.create({
        data: {
          storeId: store.id,
          sku: `SUPPLY-B-${suffix}`,
          name: '隔离库补货商品 B',
          unit: '瓶',
          currentStock: 3,
          safetyStock: 10,
        },
      }),
    ]);
    const suppliers = await Promise.all([
      prisma.supplySupplier.create({
        data: {
          name: `验收供应商 A ${suffix}`,
          status: 'active',
          qualificationStatus: 'approved',
          platformFeeRate: 0.02,
        },
      }),
      prisma.supplySupplier.create({
        data: {
          name: `验收供应商 B ${suffix}`,
          status: 'active',
          qualificationStatus: 'approved',
          platformFeeRate: 0.02,
        },
      }),
    ]);
    const skus = await Promise.all(
      suppliers.map((supplier, index) =>
        prisma.supplySku.create({
          data: {
            supplierId: supplier.id,
            name: `验收供应商品 ${index + 1}`,
            unit: index === 0 ? '盒' : '瓶',
            status: 'active',
            auditStatus: 'approved',
          },
        }),
      ),
    );
    const quotes = await Promise.all(
      skus.map((sku, index) =>
        prisma.supplyQuote.create({
          data: {
            supplySkuId: sku.id,
            supplierId: suppliers[index].id,
            price: 12 + index,
            moq: 10,
            status: 'active',
            auditStatus: 'approved',
          },
        }),
      ),
    );
    const mappings = await Promise.all(
      skus.map((sku, index) =>
        prisma.supplyCatalogMapping.create({
          data: {
            supplySkuId: sku.id,
            productId: products[index].id,
            storeId: store.id,
            mappingStatus: 'active',
            isPreferred: true,
          },
        }),
      ),
    );

    const service = new SupplyPlatformService(prisma);
    const managerActor = { id: operator.id, permissions: ['core:supply:manage'] };
    const batchKey = `supply-batch-${suffix}`;
    const batchPayload = {
      idempotencyKey: batchKey,
      storeId: store.id,
      sourceNo: `REP-${suffix}`,
      items: products.map((product, index) => ({
        productId: product.id,
        mappingId: mappings[index].id,
        supplySkuId: skus[index].id,
        quoteId: quotes[index].id,
        quantity: 4,
      })),
    };
    const concurrentBatches = await Promise.all([
      service.createOrdersFromReplenishment(batchPayload),
      service.createOrdersFromReplenishment(batchPayload),
    ]);
    const createdOrders = await prisma.procurementOrder.findMany({
      where: { storeId: store.id, sourceNo: batchPayload.sourceNo },
      include: { items: true },
      orderBy: { supplierId: 'asc' },
    });
    assert(createdOrders.length === 2, 'batch_did_not_split_into_two_supplier_orders');
    assert(
      concurrentBatches.some((result) => result.duplicated),
      'concurrent_batch_replay_not_detected',
    );
    assert(
      createdOrders.every((order) => order.idempotencyKey?.length === 64 && order.idempotencyKey !== batchKey),
      'raw_batch_key_persisted',
    );
    assert(
      createdOrders.every((order) => order.creationFingerprint?.length === 64),
      'child_order_fingerprint_missing',
    );
    assert(
      createdOrders.every((order) => order.batchIdempotencyKey?.length === 64),
      'batch_idempotency_hash_missing',
    );

    await prisma.supplyQuote.updateMany({
      where: { id: { in: quotes.map((quote) => quote.id) } },
      data: { status: 'inactive' },
    });
    const lostResponseReplay = await service.createOrdersFromReplenishment(batchPayload);
    assert(
      lostResponseReplay.duplicated === true && lostResponseReplay.total === 2,
      'lost_response_batch_replay_failed',
    );
    let mismatchedBatchRejected = false;
    try {
      await service.createOrdersFromReplenishment({
        ...batchPayload,
        items: [{ ...batchPayload.items[0], quantity: 5 }, batchPayload.items[1]],
      });
    } catch (error) {
      mismatchedBatchRejected = error instanceof Error && error.message.includes('幂等键已用于另一批供应链采购单');
    }
    assert(mismatchedBatchRejected, 'mismatched_batch_replay_not_rejected');

    const receiptEvidence = [];
    for (const [index, order] of createdOrders.entries()) {
      await service.updateOrderStatus(order.id, { status: 'accepted' }, managerActor);
      const shipment = await service.createShipment(
        order.id,
        {
          logisticsCompany: '隔离库物流',
          trackingNo: `TRACK-${suffix}-${index}`,
          items: order.items.map((item) => ({
            orderItemId: item.id,
            supplySkuId: item.supplySkuId,
            shippedQty: item.quantity,
            batchNo: `BATCH-${suffix}-${index}`,
          })),
        },
        managerActor,
      );
      const receiptPayload = {
        idempotencyKey: `receipt-${suffix}-${index}`,
        operatorId: operator.id,
        remark: '隔离库完整收货',
        items: shipment.items.map((item) => ({
          shipmentItemId: item.id,
          productId: order.items.find((orderItem) => orderItem.id === item.orderItemId)?.productId,
          receivedQty: item.shippedQty,
        })),
      };
      if (index === 0) {
        const concurrentReceipts = await Promise.all([
          service.receiveOrder(order.id, receiptPayload),
          service.receiveOrder(order.id, receiptPayload),
        ]);
        assert(
          concurrentReceipts.some((result) => result.duplicated),
          'concurrent_receipt_replay_not_detected',
        );
        const replay = await service.receiveOrder(order.id, receiptPayload);
        assert(replay.duplicated === true, 'lost_response_receipt_replay_failed');
        let mismatchedReceiptRejected = false;
        try {
          await service.receiveOrder(order.id, {
            ...receiptPayload,
            items: [{ ...receiptPayload.items[0], receivedQty: receiptPayload.items[0].receivedQty - 1 }],
          });
        } catch (error) {
          mismatchedReceiptRejected = error instanceof Error && error.message.includes('幂等键已用于另一笔采购收货');
        }
        assert(mismatchedReceiptRejected, 'mismatched_receipt_replay_not_rejected');
        receiptEvidence.push({ orderId: order.id, mode: 'same_key_replay', mismatchedReceiptRejected });
      } else {
        const competing = await Promise.allSettled([
          service.receiveOrder(order.id, receiptPayload),
          service.receiveOrder(order.id, {
            ...receiptPayload,
            idempotencyKey: `${receiptPayload.idempotencyKey}-other`,
          }),
        ]);
        assert(
          competing.filter((result) => result.status === 'fulfilled').length === 1,
          'competing_receipts_did_not_serialize',
        );
        assert(
          competing.filter((result) => result.status === 'rejected').length === 1,
          'competing_receipt_over_receive_not_rejected',
        );
        receiptEvidence.push({
          orderId: order.id,
          mode: 'different_key_race',
          outcomes: competing.map((result) => result.status),
        });
      }
    }

    const finalProducts = await prisma.product.findMany({
      where: { id: { in: products.map((product) => product.id) } },
      orderBy: { id: 'asc' },
    });
    const receiptCount = await prisma.procurementReceipt.count({ where: { storeId: store.id } });
    const batchCount = await prisma.stockBatch.count({
      where: { productId: { in: products.map((product) => product.id) } },
    });
    const movementCount = await prisma.stockMovement.count({
      where: { storeId: store.id, sourceType: 'supply_platform_order' },
    });
    const refreshedOrderItems = await prisma.procurementOrderItem.findMany({
      where: { orderId: { in: createdOrders.map((order) => order.id) } },
    });
    assert(receiptCount === 2, 'receipt_fact_count_not_two');
    assert(batchCount === 2, 'stock_batch_count_not_two');
    assert(movementCount === 2, 'stock_movement_count_not_two');
    assert(
      finalProducts[0].currentStock.toNumber() === 12 && finalProducts[1].currentStock.toNumber() === 13,
      'inventory_incremented_more_than_once',
    );
    assert(
      refreshedOrderItems.every((item) => item.receivedQty === item.quantity),
      'procurement_order_item_receipt_quantity_mismatch',
    );

    const result = {
      status: 'passed',
      databaseWritePerformed: true,
      target,
      evidence: {
        batchSupplierOrderCount: createdOrders.length,
        concurrentBatchReplayDetected: concurrentBatches.some((item) => item.duplicated),
        lostResponseBatchReplayDetected: lostResponseReplay.duplicated,
        mismatchedBatchRejected,
        receiptCount,
        stockBatchCount: batchCount,
        stockMovementCount: movementCount,
        finalStocks: finalProducts.map((product) => ({
          productId: product.id,
          currentStock: product.currentStock.toNumber(),
        })),
        receiptEvidence,
        rawIdempotencyKeysPersisted: false,
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
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
