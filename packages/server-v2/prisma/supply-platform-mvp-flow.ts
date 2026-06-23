import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const verifyOnly = process.argv.includes('--verify');
const dryRun = !verifyOnly && (!apply || !confirmed || process.argv.includes('--dry-run'));
const FLOW_KEY = 'supply-platform-mvp-flow';
const DEFAULT_STORE_NAME = 'Ami 全量演示门店';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

function argValue(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function money(value: unknown) {
  return Number(value ?? 0);
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    'select exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = $1) as exists',
    tableName,
  );
  return Boolean(rows[0]?.exists);
}

async function checkSchema() {
  const required = [
    'SupplySupplier',
    'SupplySku',
    'SupplyQuote',
    'SupplyCatalogMapping',
    'ProcurementOrder',
    'ProcurementOrderItem',
    'SupplierShipment',
    'SupplierShipmentItem',
    'SupplySettlement',
    'StockMovement',
  ];
  const entries = await Promise.all(required.map(async (table) => [table, await tableExists(table)] as const));
  return Object.fromEntries(entries) as Record<string, boolean>;
}

async function findStore() {
  const storeId = argValue('storeId');
  if (storeId) return prisma.store.findFirst({ where: { id: Number(storeId), deletedAt: null } });
  const storeName = argValue('storeName', DEFAULT_STORE_NAME);
  return prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
}

async function findProduct(storeId: number) {
  const productId = argValue('productId');
  if (productId) return prisma.product.findFirst({ where: { id: Number(productId), storeId, deletedAt: null } });
  return prisma.product.findFirst({ where: { storeId, deletedAt: null, status: 'active' }, orderBy: { id: 'asc' } });
}

async function verifyFlow(storeId?: number) {
  const order = await prisma.procurementOrder.findFirst({
    where: { sourceType: FLOW_KEY, ...(storeId ? { storeId } : {}) },
    include: { items: true, shipments: { include: { items: true } }, supplier: true, store: true },
    orderBy: { createdAt: 'desc' },
  });
  const movements = order
    ? await prisma.stockMovement.findMany({
        where: { sourceType: 'supply_platform_order', sourceId: order.id },
        include: { product: true, batch: true },
        orderBy: { id: 'asc' },
      })
    : [];
  const settlement = order
    ? await prisma.supplySettlement.findFirst({ where: { supplierId: order.supplierId, settleMonth: new Date().toISOString().slice(0, 7) } })
    : null;
  return {
    complete: Boolean(order && order.status === 'received' && order.items.length > 0 && order.shipments.length > 0 && movements.length > 0 && settlement),
    order: order
      ? {
          id: order.id,
          orderNo: order.orderNo,
          storeName: order.store?.name,
          supplierName: order.supplier?.name,
          status: order.status,
          itemCount: order.items.length,
          shipmentCount: order.shipments.length,
          totalAmount: money(order.totalAmount),
          netAmount: money(order.netAmount),
        }
      : null,
    stockMovements: movements.map((item: any) => ({
      id: item.id,
      movementNo: item.movementNo,
      productName: item.product?.name,
      batchNo: item.batch?.batchNo,
      quantity: money(item.quantity),
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      sourceNo: item.sourceNo,
    })),
    settlement: settlement
      ? {
          id: settlement.id,
          settleMonth: settlement.settleMonth,
          orderCount: settlement.orderCount,
          totalAmount: money(settlement.totalAmount),
          netPayable: money(settlement.netPayable),
          status: settlement.status,
        }
      : null,
  };
}

async function buildPlan() {
  const schema = await checkSchema();
  const missingTables = Object.entries(schema)
    .filter(([, exists]) => !exists)
    .map(([table]) => table);
  const readinessSkipped = missingTables.length > 0;
  const store = readinessSkipped ? null : await findStore();
  const product = store ? await findProduct(store.id) : null;
  const verification = readinessSkipped ? { complete: false, order: null, stockMovements: [], settlement: null } : store ? await verifyFlow(store.id) : await verifyFlow();
  const blockers = [
    ...missingTables.map((table) => `missing table ${table}`),
    !readinessSkipped && !store ? `demo store not found: ${argValue('storeId') ?? argValue('storeName', DEFAULT_STORE_NAME)}` : null,
    !readinessSkipped && store && !product ? `active product not found in store ${store.id}` : null,
  ].filter(Boolean);
  return {
    mode: verifyOnly ? 'verify' : dryRun ? 'dry-run' : 'apply',
    dryRun,
    applyAllowed: blockers.length === 0 && apply && confirmed,
    flowKey: FLOW_KEY,
    store: store ? { id: store.id, name: store.name } : null,
    product: product ? { id: product.id, name: product.name, sku: product.sku, currentStock: money(product.currentStock) } : null,
    readiness: {
      storeCheckSkipped: readinessSkipped,
      productCheckSkipped: readinessSkipped || !store,
      reason: readinessSkipped ? 'supply platform tables are missing; run Prisma migration before store/product readiness check' : null,
    },
    schema,
    blockers,
    plannedSteps:
      blockers.length > 0
        ? []
        : [
            'ensure active SupplySupplier',
            'ensure approved SupplySku and SupplyQuote',
            'ensure SupplyCatalogMapping to Ami_Core Product',
            'create or reuse ProcurementOrder',
            'supplier accepts order',
            'supplier ships order',
            'store receives order and writes StockBatch + StockMovement',
            'generate SupplySettlement',
          ],
    verification,
  };
}

async function applyFlow(plan: Awaited<ReturnType<typeof buildPlan>>) {
  if (plan.blockers.length > 0) return plan;
  if (!plan.store || !plan.product) return plan;

  const now = new Date();
  const settleMonth = now.toISOString().slice(0, 7);
  const existingSupplier = await prisma.supplySupplier.findFirst({ where: { companyName: FLOW_KEY } });
  const supplier = existingSupplier
    ? await prisma.supplySupplier.update({
        where: { id: existingSupplier.id },
        data: {
          qualificationStatus: 'approved',
          status: 'active',
          rebateRate: 0.05,
          platformFeeRate: 0.02,
        },
      })
    : await prisma.supplySupplier.create({
        data: {
          name: 'Ami MVP 供应商',
          companyName: FLOW_KEY,
          contactName: '供应商演示账号',
          phone: '13800000000',
          qualificationStatus: 'approved',
          settlementMode: 'monthly',
          paymentTerms: '月结30天',
          rebateRate: 0.05,
          platformFeeRate: 0.02,
          status: 'active',
        },
      });

  const existingSku = await prisma.supplySku.findFirst({ where: { barcode: `${FLOW_KEY}:${plan.product.id}` } });
  const sku =
    existingSku ??
    (await prisma.supplySku.create({
      data: {
        supplierId: supplier.id,
        name: `${plan.product.name} 官方供货`,
        spec: 'MVP 验收装',
        unit: '件',
        barcode: `${FLOW_KEY}:${plan.product.id}`,
        status: 'active',
        auditStatus: 'approved',
        images: ['/demo-assets/ami-demo-full/products/supply-platform-mvp.png'],
        qualificationFiles: ['/demo-assets/ami-demo-full/qualification/supply-platform-mvp.pdf'],
        description: '供应链平台 MVP 闭环验收商品',
      },
    }));

  const quote =
    (await prisma.supplyQuote.findFirst({ where: { supplySkuId: sku.id, supplierId: supplier.id, deletedAt: null } })) ??
    (await prisma.supplyQuote.create({
      data: {
        supplySkuId: sku.id,
        supplierId: supplier.id,
        price: 12,
        taxIncluded: true,
        moq: 5,
        leadDays: 3,
        stockStatus: 'available',
        availableStock: 500,
        status: 'active',
        auditStatus: 'approved',
      },
    }));

  const mapping = await prisma.supplyCatalogMapping.findFirst({ where: { supplySkuId: sku.id, productId: plan.product.id, storeId: plan.store.id } });
  if (!mapping) {
    await prisma.supplyCatalogMapping.create({
      data: {
        supplySkuId: sku.id,
        productId: plan.product.id,
        storeId: plan.store.id,
        mappingStatus: 'active',
        isPreferred: true,
      },
    });
  }

  let order = await prisma.procurementOrder.findFirst({
    where: { sourceType: FLOW_KEY, storeId: plan.store.id, supplierId: supplier.id },
    include: { items: true, shipments: { include: { items: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) {
    const quantity = Math.max(5, Number(argValue('quantity', '5')));
    const unitPrice = money(quote.price);
    order = await prisma.procurementOrder.create({
      data: {
        orderNo: `SP-MVP-${Date.now()}`,
        storeId: plan.store.id,
        supplierId: supplier.id,
        status: 'pending_supplier_confirm',
        totalAmount: quantity * unitPrice,
        platformFee: quantity * unitPrice * 0.02,
        rebateAmount: quantity * unitPrice * 0.05,
        netAmount: quantity * unitPrice * 0.95,
        expectedArrivalDate: new Date(now.getTime() + 3 * 86400000),
        sourceType: FLOW_KEY,
        sourceNo: `${FLOW_KEY}:${plan.store.id}:${plan.product.id}`,
        items: {
          create: [
            {
              productId: plan.product.id,
              supplySkuId: sku.id,
              quoteId: quote.id,
              quantity,
              unitPrice,
              subtotal: quantity * unitPrice,
            },
          ],
        },
      },
      include: { items: true, shipments: { include: { items: true } } },
    });
  }

  if (order.status === 'pending_supplier_confirm') {
    order = await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { status: 'accepted', acceptedAt: now },
      include: { items: true, shipments: { include: { items: true } } },
    });
  }

  const orderItem = order.items[0];
  let shipment = order.shipments[0];
  if (!shipment) {
    shipment = await prisma.supplierShipment.create({
      data: {
        orderId: order.id,
        supplierId: supplier.id,
        shipmentNo: `SHP-MVP-${Date.now()}`,
        status: 'shipped',
        shippedAt: now,
        expectedArrivalAt: new Date(now.getTime() + 2 * 86400000),
        items: {
          create: [
            {
              orderItemId: orderItem.id,
              supplySkuId: sku.id,
              shippedQty: orderItem.quantity,
              batchNo: `B-MVP-${order.id}`,
              productionDate: now,
              expiryDate: new Date(now.getTime() + 365 * 86400000),
            },
          ],
        },
      },
      include: { items: true },
    });
    order = await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { status: 'shipped', shippedAt: now },
      include: { items: true, shipments: { include: { items: true } } },
    });
  }

  const movement = await prisma.stockMovement.findFirst({ where: { sourceType: 'supply_platform_order', sourceId: order.id, productId: plan.product.id } });
  if (!movement) {
    const shipmentItem = shipment.items[0];
    const product = await prisma.product.findFirst({ where: { id: plan.product.id, storeId: plan.store.id, deletedAt: null } });
    const beforeStock = money(product.currentStock);
    const receivedQty = shipmentItem.shippedQty - shipmentItem.receivedQty;
    const batch = await prisma.stockBatch.create({
      data: {
        productId: plan.product.id,
        batchNo: shipmentItem.batchNo ?? `B-MVP-${order.id}`,
        stock: receivedQty,
        productionDate: shipmentItem.productionDate,
        expiryDate: shipmentItem.expiryDate,
      },
    });
    await prisma.product.update({ where: { id: plan.product.id }, data: { currentStock: { increment: receivedQty } } });
    await prisma.stockMovement.create({
      data: {
        storeId: plan.store.id,
        productId: plan.product.id,
        batchId: batch.id,
        movementNo: `SPI-MVP-${Date.now()}`,
        movementType: 'purchase_inbound',
        quantity: receivedQty,
        beforeStock,
        afterStock: beforeStock + receivedQty,
        unit: product.unit,
        sourceType: 'supply_platform_order',
        sourceId: order.id,
        sourceNo: order.orderNo,
        remark: '供应链平台 MVP 闭环验收收货入库',
      },
    });
    await prisma.supplierShipmentItem.update({ where: { id: shipmentItem.id }, data: { receivedQty: { increment: receivedQty } } });
    await prisma.procurementOrderItem.update({ where: { id: orderItem.id }, data: { receivedQty: { increment: receivedQty } } });
    order = await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { status: 'received', receivedAt: now },
      include: { items: true, shipments: { include: { items: true } } },
    });
  }

  await prisma.supplySettlement.upsert({
    where: { supplierId_settleMonth: { supplierId: supplier.id, settleMonth } },
    create: {
      supplierId: supplier.id,
      settleMonth,
      orderCount: 1,
      totalAmount: order.totalAmount,
      rebateAmount: order.rebateAmount,
      platformFee: order.platformFee,
      netPayable: order.netAmount,
      status: 'generated',
      confirmedAt: now,
    },
    update: {
      orderCount: 1,
      totalAmount: order.totalAmount,
      rebateAmount: order.rebateAmount,
      platformFee: order.platformFee,
      netPayable: order.netAmount,
      status: 'generated',
      confirmedAt: now,
    },
  });

  return { ...plan, verification: await verifyFlow(plan.store.id) };
}

async function main() {
  const plan = await buildPlan();
  if (verifyOnly || dryRun || plan.blockers.length > 0) {
    console.log(JSON.stringify(plan, null, 2));
    if (verifyOnly && !plan.verification.complete) process.exitCode = 2;
    return;
  }
  const result = await applyFlow(plan);
  console.log(JSON.stringify(result, null, 2));
  if (!result.verification.complete) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
