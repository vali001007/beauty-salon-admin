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

function formatDateTime(value?: Date | string | null) {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function purchaseOrderStoreId(order: any) {
  const payload = order.items && typeof order.items === 'object' && !Array.isArray(order.items) ? order.items : undefined;
  const storeId = Number(payload?.storeId);
  return Number.isInteger(storeId) && storeId > 0 ? storeId : undefined;
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

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
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
    indexes: [...names],
  };
}

async function duplicateStoreSkuCount() {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `select count(*) as count
     from (
       select p."storeId", p.sku
       from "Product" p
       where p."deletedAt" is null and p.sku is not null and trim(p.sku) <> ''
       group by p."storeId", p.sku
       having count(*) > 1
     ) duplicated`,
  );
  return Number(rows[0]?.count ?? 0);
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

async function findCardUsageCandidate(projectId: number) {
  const cards = await prisma.customerCard.findMany({
    where: { status: 'active', remainingTimes: { gt: 0 }, card: { status: 'active' } },
    include: { customer: { select: { name: true } }, card: true },
    take: 1000,
    orderBy: { id: 'asc' },
  });
  return cards.find((customerCard: any) => parseProjectIdsFromCard(customerCard.card?.projects).includes(projectId)) ?? null;
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

async function findMovement(where: any) {
  return prisma.stockMovement.findFirst({ where, orderBy: { id: 'desc' } });
}

async function buildReadiness() {
  const store = await selectStore();
  if (!store) throw new Error(`门店不存在：${argValue('store-id') ?? argValue('store-name') ?? DEFAULT_STORE_NAME}`);
  const storeId = Number(store.id);
  const [indexes, duplicateSkuCount, noBomProject, projectBomScore, transferCandidate, latestMovement] = await Promise.all([
    indexState(),
    duplicateStoreSkuCount(),
    prisma.project.findFirst({ where: { storeId, deletedAt: null, bomItems: { none: {} } }, orderBy: { id: 'asc' } }),
    findProjectWithDeductibleBom(storeId),
    findTransferCandidate(),
    prisma.stockMovement.findFirst({ where: { storeId }, orderBy: { id: 'desc' } }),
  ]);
  const projectWithBom = projectBomScore?.project ?? null;
  const cardUsageCandidate = projectWithBom ? await findCardUsageCandidate(projectWithBom.id) : null;
  const sourceProduct = await prisma.product.findFirst({
    where: { storeId, deletedAt: null, currentStock: { gt: 0 }, sku: { not: '' } },
    orderBy: { currentStock: 'desc' },
  });
  const movementWhereBase: any = {
    storeId,
    ...(latestMovement?.id ? { id: { gt: latestMovement.id } } : {}),
  };
  const marker = acceptanceMarker();
  const [
    inbound,
    manualOutbound,
    projectBom,
    cardUsageBom,
    purchaseReceipt,
    transferOut,
    scrapOut,
    purchaseOrders,
  ] = await Promise.all([
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
    prisma.purchaseOrder.findMany({
      where: {
        ...(latestMovement?.occurredAt ? { createdAt: { gte: latestMovement.occurredAt } } : {}),
        ...(marker ? { supplier: { contains: marker } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 200,
    }),
  ]);
  const purchaseOrderCreated = purchaseOrders.find((order: any) => {
    const payloadStoreId = purchaseOrderStoreId(order);
    return !payloadStoreId || payloadStoreId === storeId;
  }) ?? null;
  const transferIn = transferOut
    ? await findMovement(withRemarkMarker({
        ...(latestMovement?.id ? { id: { gt: latestMovement.id } } : {}),
        movementType: 'transfer_in',
        sourceType: 'transfer_order',
        sourceId: transferOut.sourceId,
      }, marker))
    : null;

  const migrationDataReady = duplicateSkuCount === 0;
  const migrationApplied = indexes.storeScopedUnique && !indexes.globalUnique;
  const projectBomDeductible = Boolean(projectBomScore && projectBomScore.deductibleCount > 0);
  const fixtureReady = Boolean(noBomProject && projectBomDeductible && cardUsageCandidate && transferCandidate);
  const fixtureApplyBlockedByMigration = !migrationApplied && !transferCandidate;
  const acceptanceChecks = {
    inbound: Boolean(inbound),
    manualOutbound: Boolean(manualOutbound),
    projectBom: Boolean(projectBom),
    cardUsageBom: Boolean(cardUsageBom),
    purchaseOrderCreated: Boolean(purchaseOrderCreated),
    purchaseReceipt: Boolean(purchaseReceipt),
    transfer: Boolean(transferOut && transferIn && (!transferOut.sourceId || transferOut.sourceId === transferIn.sourceId)),
    scrapOut: Boolean(scrapOut),
  };
  const acceptancePassed = Object.values(acceptanceChecks).every(Boolean);
  const blockers = [
    !migrationDataReady
      ? { key: 'migrationDataReady', type: 'data_fix_required', owner: '技术/数据', action: '先处理同门店重复 SKU，再执行 SKU migration。' }
      : null,
    migrationDataReady && !migrationApplied
      ? { key: 'migrationApplied', type: 'authorization_required', owner: '技术/授权', action: '授权后执行 20260629102000_product_sku_store_scope migration。' }
      : null,
    !projectBomDeductible
      ? { key: 'projectBomDeductible', type: 'data_fix_required', owner: '业务/数据', action: '准备至少一个已配置 BOM 且有可扣库存的项目。' }
      : null,
    projectBomDeductible && !noBomProject
      ? { key: 'noBomProject', type: 'authorization_required', owner: '技术/授权', action: '授权执行 inventory:acceptance-fixtures --apply --yes，写入未配置 BOM 项目样本。' }
      : null,
    projectBomDeductible && !cardUsageCandidate
      ? { key: 'cardUsageCandidate', type: 'authorization_required', owner: '技术/授权', action: '授权执行 inventory:acceptance-fixtures --apply --yes，写入验收客户、次卡和客户次卡。' }
      : null,
    !transferCandidate
      ? {
          key: 'transferCandidate',
          type: 'authorization_required',
          owner: '技术/授权',
          action: migrationApplied
            ? '授权执行 inventory:acceptance-fixtures --apply --yes，写入跨店同 SKU 调拨样本。'
            : '先授权应用 SKU migration，再执行 fixtures 写入跨店同 SKU 调拨样本。',
        }
      : null,
    !latestMovement
      ? { key: 'baseline', type: 'preflight_required', owner: '技术', action: '先执行 inventory:baseline 生成库存验收基线。' }
      : null,
    !acceptancePassed
      ? { key: 'acceptancePassed', type: 'manual_acceptance_required', owner: '业务/测试', action: '样本齐备后按 runbook 完成真实入库、出库、项目 BOM、次卡、采购、调拨和报废验收。' }
      : null,
  ].filter(Boolean);

  return {
    store: { id: store.id, name: store.name },
    migration: {
      dataReady: migrationDataReady,
      applied: migrationApplied,
      globalUnique: indexes.globalUnique,
      storeScopedUnique: indexes.storeScopedUnique,
      duplicateSkuCount,
    },
    fixtures: {
      ready: fixtureReady,
      applyBlockedByMigration: fixtureApplyBlockedByMigration,
      noBomProject: noBomProject ? { id: noBomProject.id, name: noBomProject.name } : null,
      projectWithBom: projectWithBom ? { id: projectWithBom.id, name: projectWithBom.name } : null,
      projectBomDeductible,
      projectBomDeductibleCount: projectBomScore?.deductibleCount ?? 0,
      cardUsageCandidate: cardUsageCandidate
        ? { id: cardUsageCandidate.id, cardName: cardUsageCandidate.cardName, customerName: cardUsageCandidate.customer?.name }
        : null,
      transferCandidate: transferCandidate
        ? {
            source: `${transferCandidate.source.store?.name ?? transferCandidate.source.storeId} / ${transferCandidate.source.name} / ${transferCandidate.source.sku}`,
            target: `${transferCandidate.target.store?.name ?? transferCandidate.target.storeId} / ${transferCandidate.target.name} / ${transferCandidate.target.sku}`,
          }
        : null,
      transferSourceProduct: sourceProduct ? { id: sourceProduct.id, name: sourceProduct.name, sku: sourceProduct.sku } : null,
    },
    baseline: {
      latestMovementId: latestMovement?.id ?? null,
      latestMovementAt: latestMovement?.occurredAt ?? null,
    },
    acceptance: {
      passed: acceptancePassed,
      marker: marker ?? null,
      checks: acceptanceChecks,
      evidence: {
        purchaseOrderCreated: purchaseOrderCreated
          ? {
              id: purchaseOrderCreated.id,
              orderNo: purchaseOrderCreated.orderNo,
              status: purchaseOrderCreated.status,
              storeId: purchaseOrderStoreId(purchaseOrderCreated),
              createdAt: purchaseOrderCreated.createdAt,
            }
        : null,
      },
    },
    blockers,
    readyForManualAcceptance: migrationApplied && fixtureReady,
  };
}

function statusText(passed: boolean) {
  return passed ? '已就绪' : '未就绪';
}

function renderMarkdown(result: any) {
  const nextActions = result.readyForManualAcceptance
    ? [
        '执行 `inventory:baseline -- --store-id 6` 固化验收窗口。',
        '通过管理端/API 完成真实入库、出库、项目 BOM、次卡、采购、调拨、报废验收。',
        '执行 `inventory:acceptance-verify -- --store-id 6 --since-movement-id <基线最大流水ID> --strict --out <报告路径>`。',
      ]
    : [
        result.migration.dataReady && !result.migration.applied
          ? '授权后执行 `20260629102000_product_sku_store_scope` migration。'
          : null,
        result.fixtures.applyBlockedByMigration
          ? 'migration 应用后执行 `inventory:acceptance-fixtures -- --store-id 6 --apply --yes` 准备验收样本。'
          : !result.fixtures.ready
            ? '执行或补齐验收样本准备。'
            : null,
        '复跑本就绪度报告，直到“可进入真实手动验收”为已就绪。',
      ].filter(Boolean);

  return `# 库存验收就绪度报告

生成时间：${new Date().toISOString()}
门店：${result.store.name}（ID: ${result.store.id}）
总状态：${result.readyForManualAcceptance ? '可进入真实手动验收' : '尚未可进入真实手动验收'}

## 1. 就绪度总览

${table(['检查项', '状态', '说明'], [
  ['SKU migration 数据条件', statusText(result.migration.dataReady), `同门店重复 SKU 数：${result.migration.duplicateSkuCount}`],
  ['SKU migration 已应用', statusText(result.migration.applied), `全局唯一索引：${result.migration.globalUnique ? '存在' : '不存在'}；门店内唯一索引：${result.migration.storeScopedUnique ? '存在' : '不存在'}`],
  ['验收样本齐备', statusText(result.fixtures.ready), `无 BOM 项目：${result.fixtures.noBomProject ? '有' : '缺'}；可扣 BOM 项目：${result.fixtures.projectBomDeductible ? `有(${result.fixtures.projectBomDeductibleCount})` : '缺'}；次卡候选：${result.fixtures.cardUsageCandidate ? '有' : '缺'}；调拨候选：${result.fixtures.transferCandidate ? '有' : '缺'}`],
  ['基线窗口', result.baseline.latestMovementId ? '已生成' : '缺失', result.baseline.latestMovementId ? `StockMovement.id ${result.baseline.latestMovementId} / ${formatDateTime(result.baseline.latestMovementAt)}` : '当前门店无库存流水'],
  ['验收标记', result.acceptance.marker ?? '未启用', '真实验收动作需保留该备注/供应商标记'],
  ['真实验收通过', result.acceptance.passed ? '已通过' : '未通过', Object.entries(result.acceptance.checks).filter(([, passed]) => !passed).map(([key]) => key).join(', ') || '全部通过'],
])}

## 2. 样本候选

${table(['样本', '当前对象'], [
  ['已配置 BOM 项目', result.fixtures.projectWithBom ? `${result.fixtures.projectWithBom.name} / ${result.fixtures.projectWithBom.id}` : '缺失'],
  ['未配置 BOM 项目', result.fixtures.noBomProject ? `${result.fixtures.noBomProject.name} / ${result.fixtures.noBomProject.id}` : '缺失'],
  ['次卡核销候选', result.fixtures.cardUsageCandidate ? `${result.fixtures.cardUsageCandidate.cardName} / ${result.fixtures.cardUsageCandidate.customerName ?? '-'}` : '缺失'],
  ['调拨候选', result.fixtures.transferCandidate ? `${result.fixtures.transferCandidate.source} -> ${result.fixtures.transferCandidate.target}` : '缺失'],
  ['调拨源商品', result.fixtures.transferSourceProduct ? `${result.fixtures.transferSourceProduct.name} / ${result.fixtures.transferSourceProduct.sku}` : '缺失'],
])}

## 3. 阻断归类

${result.blockers.length ? table(['阻断项', '类型', '责任', '下一步'], result.blockers.map((item: any) => [item.key, item.type, item.owner, item.action])) : '- 无'}

## 4. 下一步

${nextActions.map((item) => `- ${item}`).join('\n')}

## 5. 说明

- 本报告只读生成，不执行 migration，不写入样本，不修改库存。
- 阻断归类用于区分数据修复、授权写库、样本准备和真实业务验收，避免把只读就绪项误判为可进入手动验收。
- 真实验收通过状态默认只识别备注或采购供应商包含 \`${result.acceptance.marker ?? '未启用'}\` 的发布验收动作；如确需放宽，可传 \`--marker none\`。
- “SKU migration 数据条件”已就绪不等于 migration 已应用；真实库索引必须从全局唯一切换到门店内唯一后，调拨样本才能准备。
`;
}

async function main() {
  const result = await buildReadiness();
  const outPath = argValue('out');
  if (outPath) {
    const resolvedOutPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedOutPath), { recursive: true });
    writeFileSync(resolvedOutPath, renderMarkdown(result), 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.readyForManualAcceptance && process.argv.includes('--strict')) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
