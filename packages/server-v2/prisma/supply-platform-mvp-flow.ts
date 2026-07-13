import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const verifyOnly = process.argv.includes('--verify');
const dryRun = !verifyOnly && (!apply || !confirmed || process.argv.includes('--dry-run'));
const lowStockSampleEnabled = !process.argv.includes('--skip-low-stock-sample');
const FLOW_KEY = 'supply-platform-mvp-flow';
const DEFAULT_STORE_NAME = 'Ami 全量演示门店';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

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

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function table(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  if (!rows.length) return '暂无。';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
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
    lowStockSample: product
      ? {
          enabled: lowStockSampleEnabled,
          currentStock: money(product.currentStock),
          currentSafetyStock: money(product.safetyStock),
          targetSafetyStockAfterReceipt: lowStockSampleEnabled
            ? money(product.currentStock) + Math.max(5, Number(argValue('quantity', '5'))) + 10
            : null,
        }
      : null,
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
            ...(lowStockSampleEnabled ? ['set sample product safetyStock above currentStock for low-stock routing verification'] : []),
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
  const writeAudit: Array<Record<string, unknown>> = [];
  const audit = (
    model: string,
    action: 'create' | 'update' | 'reuse' | 'skip',
    id: number | string | null,
    summary: string,
    rollbackHint: string,
    before?: Record<string, unknown>,
  ) => {
    writeAudit.push({ model, action, id, summary, rollbackHint, before: before ?? null });
  };

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
  audit(
    'SupplySupplier',
    existingSupplier ? 'update' : 'create',
    supplier.id,
    existingSupplier ? '供应商状态、资质和费率已校准为 MVP 验收可用' : '创建供应链 MVP 验收供应商',
    existingSupplier ? '如需回滚，按 before 字段恢复该供应商状态、资质和费率。' : '如需回滚，先删除依赖的结算、发货、采购、报价、SKU、映射后再删除该供应商。',
    existingSupplier
      ? {
          qualificationStatus: existingSupplier.qualificationStatus,
          status: existingSupplier.status,
          rebateRate: money(existingSupplier.rebateRate),
          platformFeeRate: money(existingSupplier.platformFeeRate),
        }
      : undefined,
  );

  const skuPayload = {
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
  };
  const existingSku = await prisma.supplySku.findFirst({ where: { barcode: `${FLOW_KEY}:${plan.product.id}` } });
  const sku = existingSku
    ? await prisma.supplySku.update({
        where: { id: existingSku.id },
        data: {
          supplierId: supplier.id,
          status: 'active',
          auditStatus: 'approved',
          deletedAt: null,
        },
      })
    : await prisma.supplySku.create({ data: skuPayload });
  audit(
    'SupplySku',
    existingSku ? 'update' : 'create',
    sku.id,
    existingSku ? '供应链 SKU 已校准为 active/approved' : '创建供应链 MVP 验收 SKU',
    existingSku ? '如需回滚，按 before 字段恢复 SKU 供应商、状态、审核状态和删除标记。' : '如需回滚，先删除依赖报价、映射、采购明细后再删除该 SKU。',
    existingSku
      ? {
          supplierId: existingSku.supplierId,
          status: existingSku.status,
          auditStatus: existingSku.auditStatus,
          deletedAt: existingSku.deletedAt,
        }
      : undefined,
  );

  const existingQuote = await prisma.supplyQuote.findFirst({ where: { supplySkuId: sku.id, supplierId: supplier.id } });
  const quote = existingQuote
    ? await prisma.supplyQuote.update({
        where: { id: existingQuote.id },
        data: {
          price: money(existingQuote.price) || 12,
          taxIncluded: true,
          moq: Math.max(1, Number(existingQuote.moq ?? 5)),
          leadDays: Number(existingQuote.leadDays ?? 3),
          stockStatus: 'available',
          availableStock: Math.max(500, Number(existingQuote.availableStock ?? 0)),
          status: 'active',
          auditStatus: 'approved',
          validFrom: null,
          validTo: null,
          deletedAt: null,
        },
      })
    : await prisma.supplyQuote.create({
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
      });
  audit(
    'SupplyQuote',
    existingQuote ? 'update' : 'create',
    quote.id,
    existingQuote ? '供应链报价已校准为 active/approved/available' : '创建供应链 MVP 验收报价',
    existingQuote ? '如需回滚，按 before 字段恢复报价、MOQ、交期、库存和有效期。' : '如需回滚，删除依赖采购明细后再删除该报价。',
    existingQuote
      ? {
          price: money(existingQuote.price),
          moq: existingQuote.moq,
          leadDays: existingQuote.leadDays,
          stockStatus: existingQuote.stockStatus,
          availableStock: existingQuote.availableStock,
          status: existingQuote.status,
          auditStatus: existingQuote.auditStatus,
          validFrom: existingQuote.validFrom,
          validTo: existingQuote.validTo,
          deletedAt: existingQuote.deletedAt,
        }
      : undefined,
  );

  const mapping = await prisma.supplyCatalogMapping.findFirst({ where: { supplySkuId: sku.id, productId: plan.product.id, storeId: plan.store.id } });
  const unsetPreferredMappings = await prisma.supplyCatalogMapping.updateMany({
    where: { productId: plan.product.id, storeId: plan.store.id, isPreferred: true },
    data: { isPreferred: false },
  });
  if (unsetPreferredMappings.count > 0) {
    audit(
      'SupplyCatalogMapping',
      'update',
      `${plan.store.id}:${plan.product.id}:preferred`,
      `取消同门店同产品既有首选映射 ${unsetPreferredMappings.count} 条`,
      '如需回滚，按 apply 前 readiness/数据库快照恢复原首选映射。',
    );
  }
  let activeMapping = mapping;
  if (mapping) {
    activeMapping = await prisma.supplyCatalogMapping.update({
      where: { id: mapping.id },
      data: {
        mappingStatus: 'active',
        isPreferred: true,
      },
    });
  } else {
    activeMapping = await prisma.supplyCatalogMapping.create({
      data: {
        supplySkuId: sku.id,
        productId: plan.product.id,
        storeId: plan.store.id,
        mappingStatus: 'active',
        isPreferred: true,
      },
    });
  }
  audit(
    'SupplyCatalogMapping',
    mapping ? 'update' : 'create',
    activeMapping.id,
    mapping ? '供应链映射已校准为 active/preferred' : '创建本地产品到供应链 SKU 的首选映射',
    mapping ? '如需回滚，按 before 字段恢复映射状态和首选标记。' : '如需回滚，删除该映射并恢复原首选映射。',
    mapping ? { mappingStatus: mapping.mappingStatus, isPreferred: mapping.isPreferred } : undefined,
  );

  let order = await prisma.procurementOrder.findFirst({
    where: { sourceType: FLOW_KEY, storeId: plan.store.id, supplierId: supplier.id },
    include: { items: true, shipments: { include: { items: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const reusedOrder = Boolean(order);
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
    audit(
      'ProcurementOrder',
      'create',
      order.id,
      `创建 MVP 验收平台采购单 ${order.orderNo}`,
      '如需回滚，先删除入库流水、批次、发货、结算和采购明细后再删除采购单。',
    );
    for (const item of order.items) {
      audit(
        'ProcurementOrderItem',
        'create',
        item.id,
        `创建采购明细 productId=${item.productId} quantity=${item.quantity}`,
        '如需回滚，先删除依赖发货明细和入库记录后再删除采购明细。',
      );
    }
  } else {
    audit('ProcurementOrder', 'reuse', order.id, `复用已有 MVP 验收平台采购单 ${order.orderNo}`, '复用对象不需要删除；如需重跑可保留该订单作为验收证据。');
  }

  if (order.status === 'pending_supplier_confirm') {
    const beforeStatus = order.status;
    order = await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { status: 'accepted', acceptedAt: now },
      include: { items: true, shipments: { include: { items: true } } },
    });
    audit(
      'ProcurementOrder',
      'update',
      order.id,
      `采购单状态 ${beforeStatus} -> accepted`,
      '如需回滚，恢复采购单 status/acceptedAt。',
      { status: beforeStatus, acceptedAt: null },
    );
  } else if (reusedOrder) {
    audit('ProcurementOrder', 'skip', order.id, `采购单当前状态为 ${order.status}，无需确认`, '无需回滚。');
  }

  const findMatchingOrderItem = (items: typeof order.items) =>
    items.find(
      (item) => Number(item.productId) === Number(plan.product.id) && Number(item.supplySkuId) === Number(sku.id),
    );

  let orderItem = findMatchingOrderItem(order.items);
  if (!orderItem) {
    const quantity = Math.max(5, Number(argValue('quantity', '5')));
    const unitPrice = money(quote.price);
    orderItem = await prisma.procurementOrderItem.create({
      data: {
        orderId: order.id,
        productId: plan.product.id,
        supplySkuId: sku.id,
        quoteId: quote.id,
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice,
      },
    });
    await prisma.procurementOrder.update({
      where: { id: order.id },
      data: {
        totalAmount: quantity * unitPrice,
        platformFee: quantity * unitPrice * 0.02,
        rebateAmount: quantity * unitPrice * 0.05,
        netAmount: quantity * unitPrice * 0.95,
      },
    });
    order = await prisma.procurementOrder.findFirst({
      where: { id: order.id },
      include: { items: true, shipments: { include: { items: true } } },
    });
    if (!order) {
      throw new Error(`采购单 ${orderItem.orderId} 创建明细后未能重新读取`);
    }
    orderItem = findMatchingOrderItem(order.items);
    if (!orderItem) {
      throw new Error(`采购单 ${order.id} 未找到产品 ${plan.product.id} / 供应 SKU ${sku.id} 对应明细`);
    }
    audit(
      'ProcurementOrderItem',
      'create',
      orderItem.id,
      `补齐半成品采购单缺失明细 productId=${orderItem.productId} supplySkuId=${orderItem.supplySkuId} quantity=${orderItem.quantity}`,
      '如需回滚，先删除依赖发货明细和入库记录后再删除该采购明细，并恢复采购单金额。',
    );
  } else if (reusedOrder) {
    audit(
      'ProcurementOrderItem',
      'reuse',
      orderItem.id,
      `复用匹配当前样本商品的采购明细 productId=${orderItem.productId} supplySkuId=${orderItem.supplySkuId}`,
      '复用对象不需要删除。',
    );
  }

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
    audit(
      'SupplierShipment',
      'create',
      shipment.id,
      `创建供应商发货单 ${shipment.shipmentNo}`,
      '如需回滚，先删除发货明细及相关入库记录后再删除发货单。',
    );
    for (const item of shipment.items) {
      audit(
        'SupplierShipmentItem',
        'create',
        item.id,
        `创建发货明细 supplySkuId=${item.supplySkuId} shippedQty=${item.shippedQty}`,
        '如需回滚，先恢复采购明细/发货明细 receivedQty，再删除该发货明细。',
      );
    }
    const beforeStatus = order.status;
    order = await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { status: 'shipped', shippedAt: now },
      include: { items: true, shipments: { include: { items: true } } },
    });
    audit(
      'ProcurementOrder',
      'update',
      order.id,
      `采购单状态 ${beforeStatus} -> shipped`,
      '如需回滚，恢复采购单 status/shippedAt。',
      { status: beforeStatus, shippedAt: null },
    );
  } else {
    audit('SupplierShipment', 'reuse', shipment.id, `复用已有发货单 ${shipment.shipmentNo}`, '复用对象不需要删除。');
  }
  const findMatchingShipmentItem = (items: typeof shipment.items) =>
    items.find(
      (item) => Number(item.orderItemId) === Number(orderItem.id) && Number(item.supplySkuId) === Number(sku.id),
    );

  let shipmentItem = findMatchingShipmentItem(shipment.items);
  if (!shipmentItem) {
    shipmentItem = await prisma.supplierShipmentItem.create({
      data: {
        shipmentId: shipment.id,
        orderItemId: orderItem.id,
        supplySkuId: sku.id,
        shippedQty: orderItem.quantity,
        batchNo: `B-MVP-${order.id}`,
        productionDate: now,
        expiryDate: new Date(now.getTime() + 365 * 86400000),
      },
    });
    shipment = await prisma.supplierShipment.findFirst({
      where: { id: shipment.id },
      include: { items: true },
    });
    if (!shipment) {
      throw new Error(`发货单 ${shipmentItem.shipmentId} 创建明细后未能重新读取`);
    }
    shipmentItem = findMatchingShipmentItem(shipment.items);
    if (!shipmentItem) {
      throw new Error(`发货单 ${shipment.id} 未找到采购明细 ${orderItem.id} / 供应 SKU ${sku.id} 对应发货明细`);
    }
    audit(
      'SupplierShipmentItem',
      'create',
      shipmentItem.id,
      `补齐半成品发货单缺失明细 orderItemId=${shipmentItem.orderItemId} supplySkuId=${shipmentItem.supplySkuId} shippedQty=${shipmentItem.shippedQty}`,
      '如需回滚，先恢复采购明细/发货明细 receivedQty，再删除该发货明细。',
    );
  } else {
    audit(
      'SupplierShipmentItem',
      'reuse',
      shipmentItem.id,
      `复用匹配当前采购明细的发货明细 orderItemId=${shipmentItem.orderItemId} supplySkuId=${shipmentItem.supplySkuId}`,
      '复用对象不需要删除。',
    );
  }

  const movement = await prisma.stockMovement.findFirst({ where: { sourceType: 'supply_platform_order', sourceId: order.id, productId: plan.product.id } });
  if (!movement) {
    const product = await prisma.product.findFirst({ where: { id: plan.product.id, storeId: plan.store.id, deletedAt: null } });
    const beforeStock = money(product.currentStock);
    const remainingQty = shipmentItem.shippedQty - shipmentItem.receivedQty;
    const receivedQty = remainingQty > 0 ? remainingQty : shipmentItem.shippedQty;
    const batch = await prisma.stockBatch.create({
      data: {
        productId: plan.product.id,
        batchNo: shipmentItem.batchNo ?? `B-MVP-${order.id}`,
        stock: receivedQty,
        productionDate: shipmentItem.productionDate,
        expiryDate: shipmentItem.expiryDate,
      },
    });
    audit(
      'StockBatch',
      'create',
      batch.id,
      `创建入库批次 ${batch.batchNo} stock=${batch.stock}`,
      '如需回滚，先删除引用该批次的库存流水，再删除批次。',
    );
    await prisma.product.update({ where: { id: plan.product.id }, data: { currentStock: { increment: receivedQty } } });
    audit(
      'Product',
      'update',
      plan.product.id,
      `产品库存 ${beforeStock} -> ${beforeStock + receivedQty}`,
      '如需回滚，扣回本次入库数量并恢复 currentStock。',
      { currentStock: beforeStock },
    );
    const stockMovement = await prisma.stockMovement.create({
      data: {
        storeId: plan.store.id,
        productId: plan.product.id,
        batchId: batch.id,
        movementNo: `SPI-MVP-${Date.now()}`,
        movementType: 'purchase_inbound',
        quantity: receivedQty,
        beforeStock,
        afterStock: beforeStock + receivedQty,
        unit: product.specUnit ?? product.unit,
        sourceType: 'supply_platform_order',
        sourceId: order.id,
        sourceNo: order.orderNo,
        remark: '供应链平台 MVP 闭环验收收货入库',
      },
    });
    audit(
      'StockMovement',
      'create',
      stockMovement.id,
      `创建平台采购入库流水 ${stockMovement.movementNo}`,
      '如需回滚，删除该入库流水并同步回滚产品库存/批次库存。',
    );
    if (remainingQty > 0) {
      await prisma.supplierShipmentItem.update({ where: { id: shipmentItem.id }, data: { receivedQty: { increment: receivedQty } } });
    }
    audit(
      'SupplierShipmentItem',
      remainingQty > 0 ? 'update' : 'skip',
      shipmentItem.id,
      remainingQty > 0
        ? `发货明细已收 ${shipmentItem.receivedQty} -> ${shipmentItem.receivedQty + receivedQty}`
        : `发货明细已收 ${shipmentItem.receivedQty}，无需递增`,
      remainingQty > 0 ? '如需回滚，恢复发货明细 receivedQty。' : '无需回滚。',
      { receivedQty: shipmentItem.receivedQty },
    );
    if (remainingQty > 0) {
      await prisma.procurementOrderItem.update({ where: { id: orderItem.id }, data: { receivedQty: { increment: receivedQty } } });
    }
    audit(
      'ProcurementOrderItem',
      remainingQty > 0 ? 'update' : 'skip',
      orderItem.id,
      remainingQty > 0
        ? `采购明细已收 ${orderItem.receivedQty} -> ${orderItem.receivedQty + receivedQty}`
        : `采购明细已收 ${orderItem.receivedQty}，无需递增`,
      remainingQty > 0 ? '如需回滚，恢复采购明细 receivedQty。' : '无需回滚。',
      { receivedQty: orderItem.receivedQty },
    );
    const beforeStatus = order.status;
    order = await prisma.procurementOrder.update({
      where: { id: order.id },
      data: { status: 'received', receivedAt: now },
      include: { items: true, shipments: { include: { items: true } } },
    });
    audit(
      'ProcurementOrder',
      'update',
      order.id,
      `采购单状态 ${beforeStatus} -> received`,
      '如需回滚，恢复采购单 status/receivedAt。',
      { status: beforeStatus, receivedAt: null },
    );
  } else {
    audit('StockMovement', 'reuse', movement.id, `复用已有入库流水 ${movement.movementNo}`, '复用对象不需要删除。');
  }

  if (lowStockSampleEnabled) {
    const productAfterReceipt = await prisma.product.findFirst({ where: { id: plan.product.id, storeId: plan.store.id, deletedAt: null } });
    const currentStock = money(productAfterReceipt?.currentStock ?? plan.product.currentStock);
    const targetSafetyStock = currentStock + 10;
    const beforeSafetyStock = money(productAfterReceipt?.safetyStock ?? plan.product.safetyStock);
    await prisma.product.update({
      where: { id: plan.product.id },
      data: {
        safetyStock: targetSafetyStock,
      },
    });
    audit(
      'Product',
      'update',
      plan.product.id,
      `产品安全库存 ${beforeSafetyStock} -> ${targetSafetyStock}`,
      '如需回滚，恢复产品 safetyStock。',
      { safetyStock: beforeSafetyStock },
    );
  }

  const existingSettlement = await prisma.supplySettlement.findUnique({
    where: { supplierId_settleMonth: { supplierId: supplier.id, settleMonth } },
  });
  const settlement = await prisma.supplySettlement.upsert({
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
  audit(
    'SupplySettlement',
    existingSettlement ? 'update' : 'create',
    settlement.id,
    existingSettlement ? `更新供应商 ${settleMonth} 月结算单` : `创建供应商 ${settleMonth} 月结算单`,
    existingSettlement ? '如需回滚，按 before 字段恢复结算金额和状态。' : '如需回滚，删除该结算单。',
    existingSettlement
      ? {
          orderCount: existingSettlement.orderCount,
          totalAmount: money(existingSettlement.totalAmount),
          rebateAmount: money(existingSettlement.rebateAmount),
          platformFee: money(existingSettlement.platformFee),
          netPayable: money(existingSettlement.netPayable),
          status: existingSettlement.status,
          confirmedAt: existingSettlement.confirmedAt,
        }
      : undefined,
  );

  return { ...plan, writeAudit, verification: await verifyFlow(plan.store.id) };
}

function reportPaths(mode: string) {
  return {
    md: resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/supply-platform-mvp-flow-${mode}-${today}.md`),
    json: resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/supply-platform-mvp-flow-${mode}-${today}.json`),
  };
}

function statusText(value: boolean) {
  return value ? '通过' : '未通过';
}

function renderReport(result: Awaited<ReturnType<typeof buildPlan>>) {
  const schemaRows = Object.entries(result.schema).map(([name, exists]) => [name, exists ? '已存在' : '缺失']);
  const verification = result.verification;
  const writeAudit = ((result as any).writeAudit ?? []) as Array<Record<string, unknown>>;
  return `# 供应链平台 MVP flow ${result.mode} 报告

生成时间：${new Date().toISOString()}

模式：${result.mode}

## 1. 汇总

${table(
  ['检查项', '状态'],
  [
    ['dryRun', result.dryRun],
    ['applyAllowed', result.applyAllowed],
    ['blockers', result.blockers.length],
    ['verification.complete', verification.complete],
  ],
)}

## 2. 样本

${table(
  ['对象', '值'],
  [
    ['门店', result.store ? `${result.store.name} / ${result.store.id}` : '缺失'],
    ['产品', result.product ? `${result.product.name} / ${result.product.sku} / ${result.product.id}` : '缺失'],
    ['当前库存', result.product?.currentStock ?? '-'],
    [
      '低库存验收样本',
      result.lowStockSample?.enabled
        ? `启用；当前安全库存 ${result.lowStockSample.currentSafetyStock}，预计收货后安全库存 ${result.lowStockSample.targetSafetyStockAfterReceipt}`
        : '未启用',
    ],
  ],
)}

## 3. Schema

${table(['表', '状态'], schemaRows)}

## 4. Blockers

${result.blockers.length ? result.blockers.map((item) => `- ${item}`).join('\n') : '暂无。'}

## 5. 计划步骤

${result.plannedSteps.length ? result.plannedSteps.map((item, index) => `${index + 1}. ${item}`).join('\n') : '暂无。'}

## 6. 验证结果

${table(
  ['对象', '状态'],
  [
    ['闭环完成', statusText(verification.complete)],
    ['采购单', verification.order ? `${verification.order.orderNo} / ${verification.order.status}` : '缺失'],
    ['入库流水', verification.stockMovements.length],
    ['结算单', verification.settlement ? `${verification.settlement.id} / ${verification.settlement.status}` : '缺失'],
  ],
)}

## 7. 写入审计与回滚线索

${table(
  ['模型', '动作', 'ID', '摘要', '回滚线索'],
  writeAudit.map((item) => [item.model as string, item.action as string, item.id as string, item.summary as string, item.rollbackHint as string]),
)}

说明：dry-run 和 verify 不写入数据库；真实执行必须使用 \`supply-platform:mvp-flow\` 对应的 \`--apply --yes\` 脚本命令。
`;
}

function writeReport(result: Awaited<ReturnType<typeof buildPlan>>) {
  const paths = reportPaths(result.mode);
  ensureOutput(paths.md);
  ensureOutput(paths.json);
  writeFileSync(paths.md, renderReport(result), 'utf8');
  writeFileSync(paths.json, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote ${paths.md}`);
  console.log(`Wrote ${paths.json}`);
}

async function main() {
  const plan = await buildPlan();
  if (verifyOnly || dryRun || plan.blockers.length > 0) {
    writeReport(plan);
    console.log(JSON.stringify(plan, null, 2));
    if (verifyOnly && !plan.verification.complete) process.exitCode = 2;
    return;
  }
  const result = await applyFlow(plan);
  writeReport(result);
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
