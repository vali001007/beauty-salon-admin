import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DEFAULT_STORE_NAME = 'Ami 全量演示门店';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

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

function formatDate(value?: Date | string | null) {
  if (!value) return undefined;
  return new Date(value).toISOString().slice(0, 10);
}

function formatBeijingDateTime(value?: Date | string | null) {
  if (!value) return '<基线北京时间>';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '<基线北京时间>';
  return `${new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16)} 北京时间`;
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function jsonBlock(value: unknown) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function parseProjectIdsFromCard(cardProjects: unknown) {
  const rawItems = Array.isArray(cardProjects) ? cardProjects : [];
  return rawItems
    .map((item: any) => Number(item?.projectId ?? item?.id ?? item))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function selectStore() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId'));
  if (Number.isInteger(storeId) && storeId > 0) {
    return prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
  }
  const storeName = argValue('store-name') ?? argValue('storeName') ?? DEFAULT_STORE_NAME;
  return prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
}

async function indexState() {
  const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `select indexname from pg_indexes where schemaname = current_schema() and tablename = 'Product' and indexname in ('Product_sku_key', 'Product_storeId_sku_key')`,
  );
  const names = new Set(rows.map((row) => row.indexname));
  return {
    globalUnique: names.has('Product_sku_key'),
    storeScopedUnique: names.has('Product_storeId_sku_key'),
  };
}

async function findCardUsageCandidate(projectId: number) {
  const cards = await prisma.customerCard.findMany({
    where: { status: 'active', remainingTimes: { gt: 0 }, card: { status: 'active' } },
    include: { customer: { select: { id: true, name: true } }, card: true },
    take: 1000,
    orderBy: { id: 'asc' },
  });
  return cards.find((customerCard: any) => parseProjectIdsFromCard(customerCard.card?.projects).includes(projectId)) ?? null;
}

async function findTransferCandidate() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, sku: { not: '' } },
    select: {
      id: true,
      storeId: true,
      sku: true,
      name: true,
      currentStock: true,
      safetyStock: true,
      unit: true,
      store: { select: { name: true } },
    },
    take: 3000,
  });
  const bySku = new Map<string, any[]>();
  for (const product of products) {
    const list = bySku.get(product.sku) ?? [];
    list.push(product);
    bySku.set(product.sku, list);
  }
  for (const list of bySku.values()) {
    if (list.length < 2) continue;
    const source = [...list].sort((a, b) => toNumber(b.currentStock) - toNumber(a.currentStock))[0];
    const target = [...list].sort((a, b) => toNumber(a.currentStock) - toNumber(b.currentStock))[0];
    if (source.id !== target.id && toNumber(source.currentStock) > 0) return { source, target };
  }
  return null;
}

async function findProjectWithDeductibleBom(storeId: number) {
  const projects = await prisma.project.findMany({
    where: { storeId, deletedAt: null, bomItems: { some: {} } },
    include: {
      bomItems: {
        include: { product: { select: { id: true, name: true, sku: true, currentStock: true } } },
        take: 20,
      },
    },
    orderBy: { id: 'asc' },
    take: 100,
  });
  const scored = projects.map((project: any) => {
    const deductibleCount = project.bomItems.filter((item: any) => toNumber(item.product?.currentStock) > 0 && toNumber(item.standardQty) > 0).length;
    const enoughCount = project.bomItems.filter((item: any) => toNumber(item.product?.currentStock) >= toNumber(item.standardQty) && toNumber(item.standardQty) > 0).length;
    return { project, deductibleCount, enoughCount };
  });
  return scored.sort((a, b) => b.enoughCount - a.enoughCount || b.deductibleCount - a.deductibleCount || a.project.id - b.project.id)[0] ?? null;
}

async function buildRunbook() {
  const store = await selectStore();
  if (!store) throw new Error(`门店不存在：${argValue('store-id') ?? argValue('store-name') ?? DEFAULT_STORE_NAME}`);
  const storeId = Number(store.id);
  const [indexes, productCount, normalProduct, lowStockProduct, batchProduct, expiringBatch, projectBomScore, latestMovement] = await Promise.all([
    indexState(),
    prisma.product.count({ where: { storeId, deletedAt: null } }),
    prisma.product.findFirst({ where: { storeId, deletedAt: null, currentStock: { gt: prisma.product.fields.safetyStock } }, orderBy: { currentStock: 'desc' } }),
    prisma.product.findFirst({ where: { storeId, deletedAt: null, currentStock: { lte: prisma.product.fields.safetyStock } }, orderBy: { currentStock: 'asc' } }),
    prisma.product.findFirst({
      where: { storeId, deletedAt: null, batches: { some: { stock: { gt: 0 }, expiryDate: { not: null } } } },
      include: { batches: { where: { stock: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }], take: 1 } },
      orderBy: { id: 'asc' },
    }),
    prisma.stockBatch.findFirst({
      where: { stock: { gt: 0 }, expiryDate: { not: null }, product: { storeId, deletedAt: null } },
      include: { product: true },
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    }),
    findProjectWithDeductibleBom(storeId),
    prisma.stockMovement.findFirst({ where: { storeId }, orderBy: { id: 'desc' } }),
  ]);
  const projectWithBom = projectBomScore?.project ?? null;
  const [cardUsageCandidate, transferCandidate] = await Promise.all([
    projectWithBom ? findCardUsageCandidate(projectWithBom.id) : null,
    findTransferCandidate(),
  ]);

  const inboundPayload = normalProduct
    ? {
        productId: normalProduct.id,
        batchNo: `ACCEPT-IN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        quantity: 1,
        productionDate: new Date().toISOString().slice(0, 10),
        expiryDate: formatDate(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)),
        remark: '库存验收-真实入库',
      }
    : null;
  const manualOutboundPayload = batchProduct
    ? {
        productId: batchProduct.id,
        batchId: batchProduct.batches?.[0]?.id,
        adjustmentType: 'manual_outbound',
        quantity: 1,
        reason: '库存验收-手工出库',
      }
    : null;
  const projectOrderPayload = projectWithBom
    ? {
        storeId,
        customerName: '库存验收客户',
        status: 'completed',
        items: [
          {
            projectId: projectWithBom.id,
            itemId: projectWithBom.id,
            projectName: projectWithBom.name,
            quantity: 1,
            unitPrice: 0,
          },
        ],
        remark: '库存验收-项目 BOM 扣减',
      }
    : null;
  const cardUsagePayload = cardUsageCandidate
    ? {
        customerCardId: cardUsageCandidate.id,
        customerId: cardUsageCandidate.customerId,
        projectId: projectWithBom?.id,
        projectName: projectWithBom?.name,
        times: 1,
        remark: '库存验收-次卡核销 BOM 扣减',
      }
    : null;
  const purchaseOrderPayload = lowStockProduct
    ? {
        storeId,
        storeName: store.name,
        supplier: '库存验收供应商',
        status: '已审核',
        expectedDate: new Date().toISOString().slice(0, 10),
        items: [
          {
            productName: lowStockProduct.name,
            sku: lowStockProduct.sku,
            quantity: 1,
            unitPrice: toNumber(lowStockProduct.costPrice),
          },
        ],
      }
    : null;
  const purchaseReceivePayload = lowStockProduct
    ? {
        items: [
          {
            sku: lowStockProduct.sku,
            receivedQty: 1,
            batchNo: `ACCEPT-PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
            productionDate: new Date().toISOString().slice(0, 10),
            expiryDate: formatDate(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)),
          },
        ],
        remark: '库存验收-采购收货',
      }
    : null;
  const transferPayload = transferCandidate
    ? {
        fromStoreId: transferCandidate.source.storeId,
        toStoreId: transferCandidate.target.storeId,
        status: 'completed',
        applyStock: true,
        reason: '库存验收-调拨',
        items: [
          {
            productId: transferCandidate.source.id,
            quantity: 1,
          },
        ],
      }
    : null;
  const scrapPayload = expiringBatch
    ? {
        productId: expiringBatch.productId,
        batchId: expiringBatch.id,
        adjustmentType: 'scrap_out',
        quantity: 1,
        reason: '库存验收-临期报废',
      }
    : null;

  return {
    store: { id: store.id, name: store.name },
    baseline: { latestMovementId: latestMovement?.id ?? null, latestMovementAt: latestMovement?.occurredAt ?? null },
    inventory: { productCount },
    prerequisites: {
      skuMigrationApplied: indexes.storeScopedUnique && !indexes.globalUnique,
      projectBomDeductible: Boolean(projectBomScore && projectBomScore.deductibleCount > 0),
      cardUsageCandidateReady: Boolean(cardUsageCandidate),
      transferCandidateReady: Boolean(transferCandidate),
    },
    samples: {
      normalProduct,
      lowStockProduct,
      batchProduct,
      expiringBatch: expiringBatch ? { ...expiringBatch, productName: expiringBatch.product?.name, sku: expiringBatch.product?.sku } : null,
      projectWithBom,
      projectBomDeductibleCount: projectBomScore?.deductibleCount ?? 0,
      projectBomEnoughCount: projectBomScore?.enoughCount ?? 0,
      cardUsageCandidate,
      transferCandidate,
    },
    payloads: {
      inboundPayload,
      manualOutboundPayload,
      projectOrderPayload,
      cardUsagePayload,
      purchaseOrderPayload,
      purchaseReceivePayload,
      transferPayload,
      scrapPayload,
    },
  };
}

function renderStep(title: string, method: string, path: string, payload: any, evidence: string, note?: string) {
  const payloadContent = payload === false
    ? '无需请求体。'
    : payload
      ? jsonBlock(payload)
      : '当前缺少候选对象，需先补齐样本后再执行。';
  return `### ${title}

- API：\`${method} ${path}\`
- 证据：${evidence}
${note ? `- 注意：${note}\n` : ''}
${payloadContent}
`;
}

function renderMarkdown(runbook: any) {
  const authHeader = 'Authorization: Bearer <token>';
  const storeHeader = `X-Store-Id: ${runbook.store.id}`;
  const managementEvidencePath = '../../docs/04-测试数据/库存管理端登录态验收-<日期>.md';
  const terminalEvidencePath = '../../docs/04-测试数据/终端库存看板登录态验收-<日期>.md';
  const evidenceAfter = runbook.baseline.latestMovementAt
    ? new Date(runbook.baseline.latestMovementAt).toISOString()
    : '<基线时间>';
  const evidenceAfterBeijing = formatBeijingDateTime(runbook.baseline.latestMovementAt);
  return `# 库存发布前真实验收执行清单

生成时间：${new Date().toISOString()}
门店：${runbook.store.name}（ID: ${runbook.store.id}）
基线窗口：${runbook.baseline.latestMovementId ? `StockMovement.id ${runbook.baseline.latestMovementId}` : '缺失'}

## 1. 执行前置条件

${table(['条件', '状态'], [
  ['请求头', `${authHeader}；${storeHeader}`],
  ['SKU migration 已应用', runbook.prerequisites.skuMigrationApplied ? '是' : '否，调拨样本仍会被阻塞'],
  ['项目 BOM 可扣库存', runbook.prerequisites.projectBomDeductible ? `是，候选项目 ${runbook.samples.projectWithBom?.name}，可扣明细 ${runbook.samples.projectBomDeductibleCount}` : '否，需先补耗材库存'],
  ['次卡核销候选', runbook.prerequisites.cardUsageCandidateReady ? '已就绪' : '缺失，需先跑 acceptance fixtures'],
  ['调拨候选', runbook.prerequisites.transferCandidateReady ? '已就绪' : '缺失，需先应用 migration 并跑 acceptance fixtures'],
])}

## 2. 授权后准备命令

以下命令会变更数据库结构或写入验收样本，只能在获得明确授权后执行：

\`\`\`powershell
npm.cmd --prefix packages/server-v2 run inventory:sku-migration-preflight -- --out "../../docs/04-测试数据/Product-SKU门店唯一迁移预检-<日期>.md"
npm.cmd --prefix packages/server-v2 run db:migrate:prod
npm.cmd --prefix packages/server-v2 run inventory:acceptance-fixtures -- --store-id ${runbook.store.id} --apply --yes --out "../../docs/04-测试数据/库存验收样本预检-<日期>.md"
npm.cmd --prefix packages/server-v2 run inventory:acceptance-readiness -- --store-id ${runbook.store.id} --out "../../docs/04-测试数据/库存验收就绪度报告-<日期>.md"
npm.cmd --prefix packages/server-v2 run inventory:baseline -- --store-id ${runbook.store.id}
npm.cmd --prefix packages/server-v2 run inventory:acceptance-runbook -- --store-id ${runbook.store.id} --out "../../docs/04-测试数据/库存发布前真实验收执行清单-<日期>.md"
\`\`\`

## 3. 操作步骤

${renderStep('1. 打开库存页并确认真实数据', 'GET', '/api/inventory/stock/paginated?page=1&pageSize=20', false, `返回商品数大于 0；当前门店商品数为 ${runbook.inventory.productCount}。`, '这是读操作，可先执行。')}

${renderStep('2. 真实入库', 'POST', '/api/inventory/inbound', runbook.payloads.inboundPayload, '新增 stock_batch 来源 inbound 流水，Product.currentStock 增加。')}

${renderStep('3. 手工出库', 'POST', '/api/inventory/adjustments', runbook.payloads.manualOutboundPayload, '新增 inventory_adjustment 来源 manual_outbound 流水，批次和主库存减少。')}

${renderStep('4. 项目订单/终端收银扣 BOM', 'POST', '/api/orders/project', runbook.payloads.projectOrderPayload, '新增 project_order 来源 service_consume 流水。', runbook.prerequisites.projectBomDeductible ? undefined : '当前 BOM 商品无可扣库存，需先补耗材库存。')}

${renderStep('5. 次卡核销扣 BOM', 'POST', '/api/cards/usage', runbook.payloads.cardUsagePayload, '新增 card_usage 来源 service_consume 流水。', runbook.payloads.cardUsagePayload ? undefined : '当前缺候选，需先执行 acceptance fixtures。')}

${renderStep('6. 生成采购单', 'POST', '/api/inventory/purchase-orders', runbook.payloads.purchaseOrderPayload, '新增采购单；未收货前库存不变。')}

${renderStep('7. 采购单收货', 'POST', '/api/inventory/purchase-orders/<上一步采购单ID>/receive', runbook.payloads.purchaseReceivePayload, '新增 purchase_order 来源 inbound 流水，批次和库存增加。')}

${renderStep('8. 完成调拨', 'POST', '/api/inventory/transfers', runbook.payloads.transferPayload, '同一 transfer_order 同时产生 transfer_out 和 transfer_in 流水。', runbook.payloads.transferPayload ? undefined : '当前缺跨门店同 SKU 候选，需先应用 SKU migration 并执行 acceptance fixtures。')}

${renderStep('9. 临期报废', 'POST', '/api/inventory/adjustments', runbook.payloads.scrapPayload, '新增 inventory_adjustment 来源 scrap_out 流水，损耗统计变化。')}

## 4. 管理端登录态证据

完成第 3 节真实动作后，将管理端验收结果保存为 \`${managementEvidencePath}\`。发布门禁会读取该文件，必须填写验收人、验收时间和门店名，并记录库存页、入库、出库、项目 BOM、次卡、采购、调拨、报废均通过；验收时间必须不早于本次基线时间 \`${evidenceAfter}\`（${evidenceAfterBeijing}）。
该证据会在第 6 节 \`inventory:release-gate --management-ui-evidence <path>\` 中校验；证据格式通过不代表发布通过，仍需数据库流水核验和基线库存一致性同时通过。
人工填写的 \`YYYY-MM-DD HH:mm\` 会按北京时间解析；如填写 ISO 时间并带时区，则按 ISO 时区解析。

\`\`\`markdown
# 库存管理端登录态验收

验收人：<姓名>
验收时间：<YYYY-MM-DD HH:mm>
门店：${runbook.store.name}
- [x] 库存页：通过
- [x] 真实入库：通过
- [x] 手工出库：通过
- [x] 项目 BOM：通过
- [x] 次卡核销：通过
- [x] 生成采购单：通过
- [x] 采购单收货：通过
- [x] 完成调拨：通过
- [x] 临期报废：通过
\`\`\`

可先用只读脚本校验证据格式：

\`\`\`powershell
npm.cmd --prefix packages/server-v2 run inventory:management-readiness -- --store-id ${runbook.store.id} --require-ui-evidence --ui-evidence "${managementEvidencePath}" --evidence-after "${evidenceAfter}" --strict --out "../../docs/04-测试数据/库存管理端登录态就绪度报告-<日期>.md"
\`\`\`

## 5. 终端登录态证据

在 Ami Aura Lite 终端登录后打开“库存”入口，将验收结果保存为 \`${terminalEvidencePath}\`。发布门禁会读取该文件，必须填写验收人、验收时间和门店名，并记录库存入口、低库存、临期、补货建议均通过；验收时间必须不早于本次基线时间 \`${evidenceAfter}\`（${evidenceAfterBeijing}）。
人工填写的 \`YYYY-MM-DD HH:mm\` 会按北京时间解析；如填写 ISO 时间并带时区，则按 ISO 时区解析。

\`\`\`markdown
# 终端库存看板登录态验收

验收人：<姓名>
验收时间：<YYYY-MM-DD HH:mm>
门店：${runbook.store.name}
- [x] 库存入口：通过
- [x] 低库存：通过
- [x] 临期：通过
- [x] 补货建议：通过
\`\`\`

可先用只读脚本校验证据格式：

\`\`\`powershell
npm.cmd --prefix packages/server-v2 run inventory:terminal-readiness -- --store-id ${runbook.store.id} --require-ui-evidence --ui-evidence "${terminalEvidencePath}" --evidence-after "${evidenceAfter}" --strict --out "../../docs/04-测试数据/终端库存看板就绪度报告-<日期>.md"
\`\`\`

## 6. 验收核验

真实动作执行完成后运行：

\`\`\`powershell
npm.cmd --prefix packages/server-v2 run inventory:acceptance-verify -- --store-id ${runbook.store.id} --since-movement-id ${runbook.baseline.latestMovementId ?? '<基线最大流水ID>'} --strict --out "../../docs/04-测试数据/库存发布前验收核验-<日期>.md"
npm.cmd --prefix packages/server-v2 run inventory:release-gate -- --store-id ${runbook.store.id} --since-movement-id ${runbook.baseline.latestMovementId ?? '<基线最大流水ID>'} --management-ui-evidence "${managementEvidencePath}" --terminal-ui-evidence "${terminalEvidencePath}" --strict --out "../../docs/04-测试数据/库存发布门禁报告-<日期>.md"
npm.cmd --prefix packages/server-v2 run inventory:baseline-compare -- --store-id ${runbook.store.id} --since-movement-id ${runbook.baseline.latestMovementId ?? '<基线最大流水ID>'} --require-movements --strict --out "../../docs/04-测试数据/库存基线对比报告-<日期>.md"
\`\`\`

## 7. 说明

- 本清单只读生成，不调用 API，不修改数据库。
- 若步骤 payload 显示缺候选，先执行第 2 节的授权后准备命令。
- 发布验收核验默认按 \`库存验收\` 标记识别真实动作；执行 API 或管理端操作时需保留 payload 中的备注、原因或供应商标记。
- 采购单收货步骤中的 \`<上一步采购单ID>\` 需要使用操作步骤第 6 步返回的采购单 ID。
- 三个核验命令、管理端登录态证据和终端证据格式校验必须全部通过；其中发布门禁要求总状态为“允许发布”，基线对比要求真实验收后存在基线后库存流水且商品库存与最新流水一致。
`;
}

async function main() {
  const runbook = await buildRunbook();
  const outPath = argValue('out');
  if (outPath) {
    const resolvedOutPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedOutPath), { recursive: true });
    writeFileSync(resolvedOutPath, renderMarkdown(runbook), 'utf8');
  }
  console.log(JSON.stringify({
    store: runbook.store,
    baseline: runbook.baseline,
    inventory: runbook.inventory,
    prerequisites: runbook.prerequisites,
    generated: Boolean(outPath),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
