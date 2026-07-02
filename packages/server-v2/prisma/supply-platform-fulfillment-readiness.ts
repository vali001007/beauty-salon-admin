import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 1),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

const today = new Date().toISOString().slice(0, 10);
const REPLENISHMENT_SOURCE_TYPES = ['inventory_replenishment', 'replenishment', 'supply-platform-mvp-flow'];

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function money(value: unknown) {
  return Number(value ?? 0);
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function status(passed: boolean) {
  return passed ? '通过' : '未通过';
}

async function resolveStore(storeId: number) {
  if (!storeId) return null;
  const store = await prisma.store.findFirst({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) throw new Error(`未找到门店：${storeId}`);
  return store;
}

async function main() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId') ?? 0);
  const store = await resolveStore(storeId);
  const mappingWhere = { mappingStatus: 'active', ...(store ? { storeId: store.id } : {}) };
  const orderWhere = store ? { storeId: store.id } : {};
  const replenishmentOrderWhere = { ...orderWhere, sourceType: { in: REPLENISHMENT_SOURCE_TYPES } };
  const receivedOrderWhere = { ...orderWhere, status: { in: ['received', 'settlement_pending', 'settled'] } };
  const stockMovementWhere = {
    ...(store ? { storeId: store.id } : {}),
    movementType: 'purchase_inbound',
    sourceType: { in: ['supply_platform_order', 'procurement_order'] },
  };
  const outMd = resolve(
    process.cwd(),
    argValue('out-md') ?? `../../docs/04-测试数据/supply-platform-fulfillment-readiness-${today}.md`,
  );
  const outJson = resolve(
    process.cwd(),
    argValue('out-json') ?? `../../docs/04-测试数据/supply-platform-fulfillment-readiness-${today}.json`,
  );

  const now = new Date();
  const supplierIds = store
    ? [
        ...new Set(
          (
            await prisma.procurementOrder.findMany({
              where: orderWhere,
              select: { supplierId: true },
            })
          ).map((order: any) => order.supplierId),
        ),
      ]
    : [];

  const [
    activeMappings,
    preferredMappings,
    mappingsWithQuote,
    replenishmentOrders,
    procurementOrderItems,
    shipments,
    shipmentItems,
    receivedOrders,
    stockMovements,
    settlements,
    latestOrder,
  ] = await Promise.all([
    prisma.supplyCatalogMapping.count({ where: mappingWhere }),
    prisma.supplyCatalogMapping.count({ where: { ...mappingWhere, isPreferred: true } }),
    prisma.supplyCatalogMapping.count({
      where: {
        ...mappingWhere,
        supplySku: {
          status: 'active',
          auditStatus: 'approved',
          deletedAt: null,
          quotes: {
            some: {
              status: 'active',
              auditStatus: 'approved',
              deletedAt: null,
              stockStatus: { notIn: ['out_of_stock', 'unavailable'] },
              AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }],
            },
          },
        },
      },
    }),
    prisma.procurementOrder.count({ where: replenishmentOrderWhere }),
    prisma.procurementOrderItem.count({ where: store ? { order: orderWhere } : {} }),
    prisma.supplierShipment.count({ where: store ? { order: orderWhere } : {} }),
    prisma.supplierShipmentItem.count({ where: store ? { shipment: { order: orderWhere } } : {} }),
    prisma.procurementOrder.count({ where: receivedOrderWhere }),
    prisma.stockMovement.count({ where: stockMovementWhere }),
    store && supplierIds.length === 0 ? 0 : prisma.supplySettlement.count({ where: store ? { supplierId: { in: supplierIds } } : {} }),
    prisma.procurementOrder.findFirst({
      where: replenishmentOrderWhere,
      include: {
        store: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        items: { include: { supplySku: true, quote: true, shipmentItems: true } },
        shipments: { include: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const latestMovements = latestOrder
    ? await prisma.stockMovement.findMany({
        where: { ...stockMovementWhere, sourceId: latestOrder.id },
        include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNo: true, stock: true } } },
        orderBy: { id: 'asc' },
      })
    : [];
  const latestSettlement = latestOrder
    ? await prisma.supplySettlement.findFirst({
        where: { supplierId: latestOrder.supplierId },
        orderBy: [{ settleMonth: 'desc' }, { createdAt: 'desc' }],
      })
    : null;

  const gates = {
    mappingReady: mappingsWithQuote > 0,
    replenishmentOrderReady: replenishmentOrders > 0,
    shipmentReady: shipments > 0 && shipmentItems > 0,
    receiptReady: receivedOrders > 0 && stockMovements > 0,
    settlementReady: settlements > 0,
    latestOrderTraceable: Boolean(latestOrder && latestMovements.length > 0),
  };
  const complete = Object.values(gates).every(Boolean);

  const result = {
    checkedAt: new Date().toISOString(),
    scope: store ? { storeId: store.id, storeName: store.name } : { storeId: null, storeName: '全部门店' },
    complete,
    counts: {
      activeMappings,
      preferredMappings,
      mappingsWithQuote,
      replenishmentOrders,
      procurementOrderItems,
      shipments,
      shipmentItems,
      receivedOrders,
      stockMovements,
      settlements,
    },
    gates,
    latestOrder: latestOrder
      ? {
          id: latestOrder.id,
          orderNo: latestOrder.orderNo,
          sourceType: latestOrder.sourceType,
          status: latestOrder.status,
          storeName: latestOrder.store?.name,
          supplierName: latestOrder.supplier?.name,
          itemCount: latestOrder.items.length,
          shipmentCount: latestOrder.shipments.length,
          totalAmount: money(latestOrder.totalAmount),
          netAmount: money(latestOrder.netAmount),
        }
      : null,
    latestMovements: latestMovements.map((item: any) => ({
      id: item.id,
      productName: item.product?.name,
      sku: item.product?.sku,
      batchNo: item.batch?.batchNo,
      quantity: money(item.quantity),
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      sourceNo: item.sourceNo,
    })),
    latestSettlement: latestSettlement
      ? {
          id: latestSettlement.id,
          settleMonth: latestSettlement.settleMonth,
          orderCount: latestSettlement.orderCount,
          totalAmount: money(latestSettlement.totalAmount),
          netPayable: money(latestSettlement.netPayable),
          status: latestSettlement.status,
        }
      : null,
  };

  const missingActions = [
    !gates.mappingReady ? '先在行业数据平台/供应链映射中建立本地商品到已审核供应链 SKU 的首选映射，并确保存在有效报价。' : null,
    !gates.replenishmentOrderReady ? '从库存采购建议生成平台采购单，或执行授权后的供应链履约样本脚本。' : null,
    !gates.shipmentReady ? '供应商确认订单并创建发货单。' : null,
    !gates.receiptReady ? '门店执行平台采购收货，写入批次、商品库存和采购入库流水。' : null,
    !gates.settlementReady ? '对已收货订单生成供应商月结记录。' : null,
  ].filter(Boolean) as string[];

const md = `# 供应链平台采购履约闭环就绪度报告

生成时间：${result.checkedAt}

验收范围：${store ? `${store.name}（ID ${store.id}）` : '全部门店'}

总状态：${complete ? '已闭环' : '未闭环'}

## 1. 关键门禁

${table(
  ['门禁', '结果', '说明'],
  [
    ['可采购映射', status(gates.mappingReady), `有效映射+报价 ${mappingsWithQuote} 条`],
    ['补货来源平台采购单', status(gates.replenishmentOrderReady), `补货来源订单 ${replenishmentOrders} 张`],
    ['供应商发货', status(gates.shipmentReady), `发货单 ${shipments} 张，发货明细 ${shipmentItems} 条`],
    ['门店收货入库', status(gates.receiptReady), `已收货订单 ${receivedOrders} 张，平台采购入库流水 ${stockMovements} 条`],
    ['供应商结算', status(gates.settlementReady), `结算单 ${settlements} 张`],
    ['最新订单可追溯', status(gates.latestOrderTraceable), latestOrder ? `订单 ${latestOrder.orderNo}，流水 ${latestMovements.length} 条` : '暂无补货来源平台订单'],
  ],
)}

## 2. 对象计数

${table(
  ['对象', '数量'],
  [
    ['active SupplyCatalogMapping', activeMappings],
    ['preferred SupplyCatalogMapping', preferredMappings],
    ['mapping with active quote', mappingsWithQuote],
    ['replenishment ProcurementOrder', replenishmentOrders],
    ['ProcurementOrderItem', procurementOrderItems],
    ['SupplierShipment', shipments],
    ['SupplierShipmentItem', shipmentItems],
    ['received ProcurementOrder', receivedOrders],
    ['purchase_inbound StockMovement', stockMovements],
    ['SupplySettlement', settlements],
  ],
)}

## 3. 最新补货来源平台订单

${latestOrder ? table(
  ['字段', '值'],
  [
    ['订单号', latestOrder.orderNo],
    ['来源', latestOrder.sourceType],
    ['状态', latestOrder.status],
    ['门店', latestOrder.store?.name ?? '-'],
    ['供应商', latestOrder.supplier?.name ?? '-'],
    ['明细数', latestOrder.items.length],
    ['发货单数', latestOrder.shipments.length],
    ['采购金额', money(latestOrder.totalAmount).toFixed(2)],
    ['净额', money(latestOrder.netAmount).toFixed(2)],
  ],
) : '暂无补货来源平台订单。'}

## 4. 最新订单库存流水

${latestMovements.length ? table(
  ['流水ID', '产品', 'SKU', '批次', '数量', '来源类型', '来源单号'],
  latestMovements.map((item: any) => [item.id, item.product?.name ?? '-', item.product?.sku ?? '-', item.batch?.batchNo ?? '-', money(item.quantity), item.sourceType ?? '-', item.sourceNo ?? '-']),
) : '暂无可追溯的平台采购入库流水。'}

## 5. 缺口与下一步

${missingActions.length ? missingActions.map((item) => `- ${item}`).join('\n') : '- 当前平台采购履约链路已具备闭环证据。'}

说明：

- 本脚本只读，不会创建映射、采购单、发货单、批次、库存流水或结算单。
- 当前库存流水兼容识别 \`sourceType=supply_platform_order\` 和计划中的 \`sourceType=procurement_order\`；仓内既有供应链方案和页面以 \`supply_platform_order\` 为主。
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, md, 'utf8');
  writeFileSync(outJson, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
