import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;
const DEFAULT_ACCEPTANCE_MARKER = '库存验收';

function argValue(name: string, fallback?: string) {
  const dashName = name.startsWith('--') ? name : `--${name}`;
  const index = process.argv.indexOf(dashName);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const prefix = `${dashName}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseSinceDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function acceptanceMarker() {
  const marker = argValue('marker', DEFAULT_ACCEPTANCE_MARKER);
  const normalized = String(marker ?? '').trim();
  return normalized && normalized.toLowerCase() !== 'none' ? normalized : undefined;
}

function withRemarkMarker(where: any, marker?: string) {
  if (!marker) return where;
  return { ...where, remark: { contains: marker } };
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function summarizeMovement(movement: any) {
  if (!movement) return null;
  return {
    id: movement.id,
    movementNo: movement.movementNo,
    product: movement.product ? `${movement.product.name} / ${movement.product.sku}` : movement.productId,
    movementType: movement.movementType,
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    quantity: toNumber(movement.quantity),
    beforeStock: movement.beforeStock === null ? null : toNumber(movement.beforeStock),
    afterStock: movement.afterStock === null ? null : toNumber(movement.afterStock),
    occurredAt: movement.occurredAt,
  };
}

function purchaseOrderStoreId(order: any) {
  const payload = order.items && typeof order.items === 'object' && !Array.isArray(order.items) ? order.items : undefined;
  return payload?.storeId ? Number(payload.storeId) : undefined;
}

function evidenceText(evidence: any) {
  if (!evidence) return '-';
  if (evidence.productCount !== undefined) return `商品数 ${evidence.productCount}`;
  if (evidence.movementNo) {
    return `${evidence.movementType}/${evidence.sourceType}/${evidence.movementNo}/数量 ${evidence.quantity}/库存 ${evidence.beforeStock ?? '-'} -> ${evidence.afterStock ?? '-'}`;
  }
  if (evidence.orderNo) return `${evidence.orderNo}/状态 ${evidence.status}/门店 ${evidence.storeId ?? '未指定'}`;
  if ('transferOut' in evidence || 'transferIn' in evidence) {
    return [
      evidence.transferOut ? `出库 ${evidence.transferOut.movementNo}` : '出库缺失',
      evidence.transferIn ? `入库 ${evidence.transferIn.movementNo}` : '入库缺失',
    ].join('；');
  }
  return JSON.stringify(evidence);
}

function renderMarkdown(result: any) {
  const rows = result.checks.map((check: any) => [
    check.optional ? `${check.label}（可选）` : check.label,
    check.passed ? '通过' : '缺失',
    evidenceText(check.evidence),
  ]);
  return `# 库存发布前验收核验报告

生成时间：${new Date().toISOString()}
门店：${result.store.name}（ID: ${result.store.id}）
核验结论：${result.ok ? '通过' : '未通过'}

## 1. 核验窗口

${table(['字段', '值'], [
  ['基线 StockMovement.id', result.window.sinceMovementId ?? '-'],
  ['基线时间', formatDateTime(result.window.sinceDate)],
  ['验收标记', result.window.marker ?? '未启用'],
  ['当前最新流水', result.window.latestMovement ? `${result.window.latestMovement.id} / ${result.window.latestMovement.movementType} / ${result.window.latestMovement.movementNo}` : '-'],
])}

## 2. 核验结果

${table(['核验项', '状态', '证据'], rows)}

## 3. 缺失必选项

${result.missingRequired.length ? result.missingRequired.map((item: string) => `- ${item}`).join('\n') : '- 无'}

## 4. 使用说明

- 本报告只读生成，不修改数据库。
- 默认只把备注包含 \`${result.window.marker ?? '未启用'}\` 的库存流水识别为发布验收动作；如确需放宽，可传 \`--marker none\`。
- 次卡核销扣耗材也按同一验收标记识别；执行时需保留 runbook payload 中的 \`remark\`。
- 若仍有缺失必选项，说明对应真实验收动作尚未完成，或动作没有写入预期的库存流水/采购单。
- 完成真实验收后，使用同一个基线 \`StockMovement.id\` 重新运行核验命令。
`;
}

async function selectStore() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId'));
  if (Number.isInteger(storeId) && storeId > 0) {
    const store = await prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new Error(`门店不存在：${storeId}`);
    return store;
  }
  const storeName = argValue('store-name') ?? argValue('storeName') ?? 'Ami 全量演示门店';
  const store = await prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
  if (!store) throw new Error(`门店不存在：${storeName}`);
  return store;
}

async function findMovement(where: any) {
  return prisma.stockMovement.findFirst({
    where,
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { id: 'desc' },
  });
}

async function main() {
  const store = await selectStore();
  const storeId = Number(store.id);
  const sinceMovementId = Number(argValue('since-movement-id') ?? argValue('sinceMovementId') ?? 0);
  const explicitSinceDate = parseSinceDate(argValue('since') ?? argValue('since-date') ?? argValue('sinceDate'));
  const sinceMovement = sinceMovementId > 0
    ? await prisma.stockMovement.findUnique({ where: { id: sinceMovementId } })
    : null;
  const sinceDate = explicitSinceDate ?? sinceMovement?.occurredAt;
  const marker = acceptanceMarker();
  const movementWhereBase: any = {
    storeId,
    ...(sinceMovementId > 0 ? { id: { gt: sinceMovementId } } : {}),
    ...(sinceDate ? { occurredAt: { gte: sinceDate } } : {}),
  };

  const [
    productCount,
    latestMovement,
    inbound,
    manualOutbound,
    projectBom,
    cardUsageBom,
    purchaseReceipt,
    transferOut,
    scrapOut,
    stocktake,
    purchaseOrders,
  ] = await Promise.all([
    prisma.product.count({ where: { storeId, deletedAt: null } }),
    prisma.stockMovement.findFirst({
      where: { storeId },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { id: 'desc' },
    }),
    findMovement(withRemarkMarker({ ...movementWhereBase, movementType: 'inbound', sourceType: 'stock_batch' }, marker)),
    findMovement(withRemarkMarker({ ...movementWhereBase, movementType: 'manual_outbound', sourceType: 'inventory_adjustment' }, marker)),
    findMovement(withRemarkMarker({ ...movementWhereBase, movementType: { in: ['service_consume', 'service_consumption'] }, sourceType: 'project_order' }, marker)),
    findMovement(withRemarkMarker({ ...movementWhereBase, movementType: { in: ['service_consume', 'service_consumption'] }, sourceType: 'card_usage' }, marker)),
    findMovement(withRemarkMarker({
      ...movementWhereBase,
      OR: [
        { movementType: 'inbound', sourceType: 'purchase_order' },
        { movementType: 'purchase_inbound', sourceType: 'supply_platform_order' },
      ],
    }, marker)),
    findMovement(withRemarkMarker({ ...movementWhereBase, movementType: 'transfer_out', sourceType: 'transfer_order' }, marker)),
    findMovement(withRemarkMarker({ ...movementWhereBase, movementType: 'scrap_out', sourceType: 'inventory_adjustment' }, marker)),
    findMovement({ ...movementWhereBase, movementType: { in: ['stocktake_gain', 'stocktake_loss'] }, sourceType: 'stocktake' }),
    prisma.purchaseOrder.findMany({
      where: {
        ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
        ...(marker ? { supplier: { contains: marker } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 200,
    }),
  ]);

  const scopedPurchaseOrders = purchaseOrders.filter((order: any) => {
    const payloadStoreId = purchaseOrderStoreId(order);
    return !payloadStoreId || payloadStoreId === storeId;
  });
  const purchaseOrderCreated = scopedPurchaseOrders[0] ?? null;
  const transferIn = transferOut
    ? await findMovement(withRemarkMarker({
        ...(sinceMovementId > 0 ? { id: { gt: sinceMovementId } } : {}),
        ...(sinceDate ? { occurredAt: { gte: sinceDate } } : {}),
        movementType: 'transfer_in',
        sourceType: 'transfer_order',
        sourceId: transferOut.sourceId,
      }, marker))
    : null;
  const transferPair = Boolean(
    transferOut && transferIn && (!transferOut.sourceId || !transferIn.sourceId || transferOut.sourceId === transferIn.sourceId),
  );
  const checks = [
    {
      key: 'inventory_page_data',
      label: '管理端库存页有真实商品数据',
      passed: productCount > 0,
      evidence: { productCount },
    },
    {
      key: 'real_inbound',
      label: '真实入库已写入 stock_batch 来源 inbound 流水',
      passed: Boolean(inbound),
      evidence: summarizeMovement(inbound),
    },
    {
      key: 'manual_outbound',
      label: '手工出库已写入 inventory_adjustment 来源 manual_outbound 流水',
      passed: Boolean(manualOutbound),
      evidence: summarizeMovement(manualOutbound),
    },
    {
      key: 'project_bom_deduction',
      label: '项目订单或终端收银已写入 project_order 来源 BOM 扣减流水',
      passed: Boolean(projectBom),
      evidence: summarizeMovement(projectBom),
    },
    {
      key: 'card_usage_bom_deduction',
      label: '次卡核销已写入 card_usage 来源 BOM 扣减流水',
      passed: Boolean(cardUsageBom),
      evidence: summarizeMovement(cardUsageBom),
    },
    {
      key: 'purchase_order_created',
      label: '补货建议已生成采购单',
      passed: Boolean(purchaseOrderCreated),
      evidence: purchaseOrderCreated
        ? {
            id: purchaseOrderCreated.id,
            orderNo: purchaseOrderCreated.orderNo,
            status: purchaseOrderCreated.status,
            supplier: purchaseOrderCreated.supplier,
            storeId: purchaseOrderStoreId(purchaseOrderCreated),
            createdAt: purchaseOrderCreated.createdAt,
          }
        : null,
    },
    {
      key: 'purchase_receipt',
      label: '采购单或平台订单收货已写入入库流水',
      passed: Boolean(purchaseReceipt),
      evidence: summarizeMovement(purchaseReceipt),
    },
    {
      key: 'transfer_completed',
      label: '调拨完成已写入 transfer_out 和 transfer_in 双向流水',
      passed: transferPair,
      evidence: {
        transferOut: summarizeMovement(transferOut),
        transferIn: summarizeMovement(transferIn),
      },
    },
    {
      key: 'scrap_out',
      label: '临期/过期报废已写入 scrap_out 流水',
      passed: Boolean(scrapOut),
      evidence: summarizeMovement(scrapOut),
    },
    {
      key: 'stocktake_optional',
      label: '盘点调整已写入 stocktake 流水（T8.3 非必选，但用于补充核验）',
      passed: Boolean(stocktake),
      optional: true,
      evidence: summarizeMovement(stocktake),
    },
  ];

  const requiredChecks = checks.filter((check) => !check.optional);
  const result = {
    ok: requiredChecks.every((check) => check.passed),
    store: { id: store.id, name: store.name },
    window: {
      sinceMovementId: sinceMovementId || null,
      sinceDate: sinceDate ?? null,
      marker: marker ?? null,
      latestMovement: summarizeMovement(latestMovement),
    },
    checks,
    missingRequired: requiredChecks.filter((check) => !check.passed).map((check) => check.key),
  };

  const outPath = argValue('out');
  if (outPath) {
    const resolvedOutPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedOutPath), { recursive: true });
    writeFileSync(resolvedOutPath, renderMarkdown(result), 'utf8');
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && process.argv.includes('--strict')) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
