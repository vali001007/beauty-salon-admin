import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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
const SKU_MIGRATION_NAME = '20260629102000_product_sku_store_scope';
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

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function checkEvidenceLine(content: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\n)\\s*(-\\s*\\[x\\]\\s*)?.*${escaped}.*(通过|已通过|完成|已完成)`, 'i').test(content);
}

function fieldValue(content: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*[:：]\\s*(.+)`, 'i'));
  return String(match?.[2] ?? '').trim();
}

function hasFilledField(content: string, field: string) {
  const value = fieldValue(content, field);
  return Boolean(value && !value.includes('<') && !value.includes('>'));
}

function parseEvidenceDate(value?: string | null) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.includes('<') || normalized.includes('>')) return null;
  const localMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const parsed = normalized.includes('T') && /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
    ? new Date(normalized)
    : localMatch
      ? new Date(Date.UTC(
          Number(localMatch[1]),
          Number(localMatch[2]) - 1,
          Number(localMatch[3]),
          Number(localMatch[4]) - 8,
          Number(localMatch[5]),
          Number(localMatch[6] ?? 0),
        ))
      : new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBeijingDateTime(value?: Date | string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16)} 北京时间`;
}

function readFirstExisting(relativePaths: string[]) {
  for (const relativePath of relativePaths) {
    const fullPath = resolve(process.cwd(), relativePath);
    if (existsSync(fullPath)) return { path: fullPath, content: readFileSync(fullPath, 'utf8') };
  }
  return { path: null, content: '' };
}

function terminalCodePathState() {
  const microApp = readFirstExisting([
    '../Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts',
    'packages/Ami-Aura-Lite-Kiosk/src/app/microApps/runMicroApp.ts',
  ]);
  const coreService = readFirstExisting([
    '../Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts',
    'packages/Ami-Aura-Lite-Kiosk/src/app/services/auraCoreService.ts',
  ]);
  const appContent = readFirstExisting([
    '../Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx',
    'packages/Ami-Aura-Lite-Kiosk/src/app/AppContent.tsx',
  ]);
  const terminalApi = readFirstExisting([
    '../../src/api/real/terminal.ts',
    'src/api/real/terminal.ts',
  ]);
  const checks = {
    microAppFile: Boolean(microApp.path),
    inventoryAction: microApp.content.includes("action === 'manager.inventory'") || microApp.content.includes('action === "manager.inventory"'),
    loaderWired: microApp.content.includes('loader: getInventoryAlerts') && microApp.content.includes("kind: 'inventory'"),
    serviceApiPath: coreService.content.includes('getTerminalInventoryAlertsDashboard') && terminalApi.content.includes('/terminal/dashboard/inventory-alerts'),
    quickAction: appContent.content.includes('"manager.inventory"') || appContent.content.includes("'manager.inventory'"),
  };
  return {
    passed: Object.values(checks).every(Boolean),
    files: {
      microApp: microApp.path,
      coreService: coreService.path,
      appContent: appContent.path,
      terminalApi: terminalApi.path,
    },
    checks,
  };
}

function terminalUiEvidenceState(storeName: string, notBefore?: Date | string | null) {
  const evidencePath = argValue('terminal-ui-evidence') ?? argValue('terminalUiEvidence') ?? argValue('ui-evidence') ?? argValue('uiEvidence');
  const minimumCheckedAt = notBefore ? new Date(notBefore) : null;
  if (!evidencePath) {
    return {
      minimumCheckedAt,
      path: null,
      exists: false,
      passed: false,
      checks: {
        operator: false,
        checkedAt: false,
        checkedAfterBaseline: false,
        storeMatched: false,
        inventoryEntry: false,
        lowStock: false,
        expiring: false,
        replenishment: false,
      },
    };
  }
  const resolvedPath = resolve(process.cwd(), evidencePath);
  if (!existsSync(resolvedPath)) {
    return {
      minimumCheckedAt,
      path: resolvedPath,
      exists: false,
      passed: false,
      checks: {
        operator: false,
        checkedAt: false,
        checkedAfterBaseline: false,
        storeMatched: false,
        inventoryEntry: false,
        lowStock: false,
        expiring: false,
        replenishment: false,
      },
    };
  }
  const content = readFileSync(resolvedPath, 'utf8');
  const checkedAt = parseEvidenceDate(fieldValue(content, '验收时间'));
  const checks = {
    operator: hasFilledField(content, '验收人'),
    checkedAt: Boolean(checkedAt),
    checkedAfterBaseline: Boolean(!minimumCheckedAt || (checkedAt && checkedAt.getTime() >= minimumCheckedAt.getTime())),
    storeMatched: content.includes(storeName),
    inventoryEntry: checkEvidenceLine(content, '库存入口'),
    lowStock: checkEvidenceLine(content, '低库存'),
    expiring: checkEvidenceLine(content, '临期'),
    replenishment: checkEvidenceLine(content, '补货建议'),
  };
  return {
    minimumCheckedAt,
    path: resolvedPath,
    exists: true,
    passed: Object.values(checks).every(Boolean),
    checks,
  };
}

function managementUiEvidenceState(storeName: string, notBefore?: Date | string | null) {
  const evidencePath = argValue('management-ui-evidence') ?? argValue('managementUiEvidence') ?? argValue('admin-ui-evidence') ?? argValue('adminUiEvidence');
  const minimumCheckedAt = notBefore ? new Date(notBefore) : null;
  const emptyChecks = {
    operator: false,
    checkedAt: false,
    checkedAfterBaseline: false,
    storeMatched: false,
    inventoryPage: false,
    inbound: false,
    manualOutbound: false,
    projectBom: false,
    cardUsageBom: false,
    purchaseOrderCreated: false,
    purchaseReceipt: false,
    transfer: false,
    scrapOut: false,
  };
  if (!evidencePath) {
    return { minimumCheckedAt, path: null, exists: false, passed: false, checks: emptyChecks };
  }
  const resolvedPath = resolve(process.cwd(), evidencePath);
  if (!existsSync(resolvedPath)) {
    return { minimumCheckedAt, path: resolvedPath, exists: false, passed: false, checks: emptyChecks };
  }
  const content = readFileSync(resolvedPath, 'utf8');
  const checkedAt = parseEvidenceDate(fieldValue(content, '验收时间'));
  const checks = {
    operator: hasFilledField(content, '验收人'),
    checkedAt: Boolean(checkedAt),
    checkedAfterBaseline: Boolean(!minimumCheckedAt || (checkedAt && checkedAt.getTime() >= minimumCheckedAt.getTime())),
    storeMatched: content.includes(storeName),
    inventoryPage: checkEvidenceLine(content, '库存页'),
    inbound: checkEvidenceLine(content, '真实入库'),
    manualOutbound: checkEvidenceLine(content, '手工出库'),
    projectBom: checkEvidenceLine(content, '项目 BOM'),
    cardUsageBom: checkEvidenceLine(content, '次卡核销'),
    purchaseOrderCreated: checkEvidenceLine(content, '生成采购单'),
    purchaseReceipt: checkEvidenceLine(content, '采购单收货'),
    transfer: checkEvidenceLine(content, '完成调拨'),
    scrapOut: checkEvidenceLine(content, '临期报废'),
  };
  return {
    minimumCheckedAt,
    path: resolvedPath,
    exists: true,
    passed: Object.values(checks).every(Boolean),
    checks,
  };
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function passedText(value: boolean) {
  return value ? '通过' : '未通过';
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

function purchaseOrderStoreId(order: any) {
  const payload = order.items && typeof order.items === 'object' && !Array.isArray(order.items) ? order.items : undefined;
  const storeId = Number(payload?.storeId);
  return Number.isInteger(storeId) && storeId > 0 ? storeId : undefined;
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
    const store = await prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new Error(`门店不存在：${storeId}`);
    return store;
  }
  const storeName = argValue('store-name') ?? argValue('storeName') ?? DEFAULT_STORE_NAME;
  const store = await prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
  if (!store) throw new Error(`门店不存在：${storeName}`);
  return store;
}

async function productSkuIndexState() {
  const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `select indexname from pg_indexes where schemaname = current_schema() and tablename = 'Product' and indexname in ('Product_storeId_sku_key', 'Product_sku_key')`,
  );
  const names = new Set(rows.map((row) => row.indexname));
  return {
    globalUnique: names.has('Product_sku_key'),
    storeScopedUnique: names.has('Product_storeId_sku_key'),
    indexes: [...names],
  };
}

async function prismaMigrationState() {
  const tableRows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `select to_regclass('_prisma_migrations') is not null as exists`,
  );
  if (!tableRows[0]?.exists) return { tableExists: false, applied: false, finishedAt: null };
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>(
    `select migration_name, finished_at, rolled_back_at
     from "_prisma_migrations"
     where migration_name = $1
     order by started_at desc
     limit 1`,
    SKU_MIGRATION_NAME,
  );
  const row = rows[0];
  return {
    tableExists: true,
    applied: Boolean(row?.finished_at && !row?.rolled_back_at),
    finishedAt: row?.finished_at ?? null,
    rolledBackAt: row?.rolled_back_at ?? null,
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

async function findCardUsageCandidate(projectId: number) {
  const cards = await prisma.customerCard.findMany({
    where: { status: 'active', remainingTimes: { gt: 0 }, card: { status: 'active' } },
    include: { customer: true, card: true },
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

async function findMovement(where: any) {
  return prisma.stockMovement.findFirst({ where, orderBy: { id: 'desc' } });
}

async function acceptanceState(storeId: number, sinceMovement: any, marker?: string) {
  const movementWhereBase: any = {
    storeId,
    ...(sinceMovement?.id ? { id: { gt: sinceMovement.id } } : {}),
  };
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
        ...(sinceMovement?.occurredAt ? { createdAt: { gte: sinceMovement.occurredAt } } : {}),
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
        ...(sinceMovement?.id ? { id: { gt: sinceMovement.id } } : {}),
        movementType: 'transfer_in',
        sourceType: 'transfer_order',
        sourceId: transferOut.sourceId,
      }, marker))
    : null;
  const checks = {
    inbound: Boolean(inbound),
    manualOutbound: Boolean(manualOutbound),
    projectBom: Boolean(projectBom),
    cardUsageBom: Boolean(cardUsageBom),
    purchaseOrderCreated: Boolean(purchaseOrderCreated),
    purchaseReceipt: Boolean(purchaseReceipt),
    transfer: Boolean(transferOut && transferIn && (!transferOut.sourceId || transferOut.sourceId === transferIn.sourceId)),
    scrapOut: Boolean(scrapOut),
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    missing: Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key),
    marker: marker ?? null,
  };
}

async function terminalInventoryState(storeId: number, storeName: string, baselineAt?: Date | string | null) {
  const now = new Date();
  const alertBefore = new Date(now);
  alertBefore.setDate(alertBefore.getDate() + 30);
  const [products, expiringBatches] = await Promise.all([
    prisma.product.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true },
      orderBy: { currentStock: 'asc' },
      take: 200,
    }),
    prisma.stockBatch.findMany({
      where: {
        product: { storeId, deletedAt: null },
        stock: { gt: 0 },
        expiryDate: { not: null, lte: alertBefore },
      },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 50,
    }),
  ]);
  const lowStock = products.filter((item: any) => toNumber(item.currentStock) <= toNumber(item.safetyStock));
  const expiring = expiringBatches.map((batch: any) => ({
    id: batch.id,
    productName: batch.product.name,
    sku: batch.product.sku,
    batchNo: batch.batchNo,
    remainingDays: batch.expiryDate ? Math.ceil((batch.expiryDate.getTime() - now.getTime()) / 86400000) : 0,
  }));
  const replenishment = lowStock.map((item: any) => ({ id: item.id, sku: item.sku }));
  const checks = {
    stockData: products.length > 0,
    lowStockUsesSafetyStock: lowStock.every((item: any) => toNumber(item.currentStock) <= toNumber(item.safetyStock)),
    expiringUsesBatchWindow: expiring.every((item: any) => item.remainingDays <= 30),
    replenishmentMatchesLowStock: replenishment.length === lowStock.length,
  };
  const dataPassed = Object.values(checks).every(Boolean);
  const codePath = terminalCodePathState();
  const uiEvidence = terminalUiEvidenceState(storeName, baselineAt);
  return {
    passed: dataPassed && codePath.passed && uiEvidence.passed,
    dataPassed,
    codePath,
    uiEvidence,
    checks,
    counts: { products: products.length, lowStock: lowStock.length, expiring: expiring.length, replenishment: replenishment.length },
  };
}

async function baselineCompareState(storeId: number, sinceMovement: any) {
  if (!sinceMovement?.id) {
    return {
      passed: false,
      movementCount: 0,
      productCount: 0,
      inconsistentProductCount: 0,
      hasPostBaselineMovements: false,
      truncated: false,
    };
  }
  const where = { storeId, id: { gt: sinceMovement.id } };
  const [movementCount, movements] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true, currentStock: true } } },
      orderBy: { id: 'asc' },
      take: 5000,
    }),
  ]);
  const latestByProduct = new Map<number, any>();
  for (const movement of movements) {
    latestByProduct.set(Number(movement.productId), movement);
  }
  const inconsistentProducts = [...latestByProduct.values()].filter((movement: any) => {
    if (movement.afterStock === null || movement.afterStock === undefined) return false;
    return toNumber(movement.product?.currentStock) !== toNumber(movement.afterStock);
  });
  const truncated = movementCount > movements.length;
  return {
    passed: movementCount > 0 && inconsistentProducts.length === 0 && !truncated,
    movementCount,
    productCount: latestByProduct.size,
    inconsistentProductCount: inconsistentProducts.length,
    hasPostBaselineMovements: movementCount > 0,
    truncated,
  };
}

async function buildReleaseGate() {
  const store = await selectStore();
  const storeId = Number(store.id);
  const sinceMovementId = Number(argValue('since-movement-id') ?? argValue('sinceMovementId') ?? 0);
  const latestMovement = await prisma.stockMovement.findFirst({ where: { storeId }, orderBy: { id: 'desc' } });
  const sinceMovement = sinceMovementId > 0
    ? await prisma.stockMovement.findFirst({ where: { id: sinceMovementId, storeId } })
    : latestMovement;
  const marker = acceptanceMarker();
  const [indexes, prismaMigration, duplicateSkuCount, noBomProject, projectBomScore, transferCandidate, terminal] = await Promise.all([
    productSkuIndexState(),
    prismaMigrationState(),
    duplicateStoreSkuCount(),
    prisma.project.findFirst({ where: { storeId, deletedAt: null, bomItems: { none: {} } }, orderBy: { id: 'asc' } }),
    findProjectWithDeductibleBom(storeId),
    findTransferCandidate(),
    terminalInventoryState(storeId, store.name, sinceMovement?.occurredAt),
  ]);
  const projectWithBom = projectBomScore?.project ?? null;
  const cardUsageCandidate = projectWithBom ? await findCardUsageCandidate(projectWithBom.id) : null;
  const [acceptance, baselineCompare] = await Promise.all([
    acceptanceState(storeId, sinceMovement, marker),
    baselineCompareState(storeId, sinceMovement),
  ]);
  const managementUiEvidence = managementUiEvidenceState(store.name, sinceMovement?.occurredAt);

  const gates = {
    migrationDataReady: duplicateSkuCount === 0,
    migrationApplied: indexes.storeScopedUnique && !indexes.globalUnique && prismaMigration.applied,
    fixturesReady: Boolean(noBomProject && projectBomScore?.deductibleCount > 0 && cardUsageCandidate && transferCandidate),
    baselineReady: Boolean(sinceMovement),
    acceptancePassed: acceptance.passed,
    managementUiEvidenceReady: managementUiEvidence.passed,
    baselineComparePassed: baselineCompare.passed,
    terminalInventoryReady: terminal.passed,
  };
  const blockers = [
    !gates.migrationDataReady
      ? { key: 'migrationDataReady', type: 'data_fix_required', owner: '技术/数据', action: '处理同门店重复 SKU 后重新预检。' }
      : null,
    !gates.migrationApplied
      ? { key: 'migrationApplied', type: 'authorization_required', owner: '技术/授权', action: `授权后执行 ${SKU_MIGRATION_NAME} migration。` }
      : null,
    !gates.fixturesReady
      ? { key: 'fixturesReady', type: 'authorization_required', owner: '技术/授权', action: `授权后执行 inventory:acceptance-fixtures -- --store-id ${storeId} --apply --yes 补齐验收样本。` }
      : null,
    !gates.baselineReady
      ? { key: 'baselineReady', type: 'preflight_required', owner: '技术', action: '先执行 inventory:baseline 生成基线窗口。' }
      : null,
    !gates.acceptancePassed
      ? { key: 'acceptancePassed', type: 'manual_acceptance_required', owner: '业务/测试', action: '按 runbook 完成真实入库、出库、项目 BOM、次卡、采购、调拨和报废验收。' }
      : null,
    !gates.managementUiEvidenceReady
      ? { key: 'managementUiEvidenceReady', type: 'management_manual_evidence_required', owner: '业务/测试', action: '补充管理端登录态验收证据，并确保验收时间不早于基线。' }
      : null,
    !gates.baselineComparePassed
      ? { key: 'baselineComparePassed', type: 'post_acceptance_verify_required', owner: '技术/测试', action: '真实验收后执行 baseline-compare，确认基线后有库存流水且库存一致。' }
      : null,
    terminal.dataPassed && terminal.codePath.passed && !terminal.uiEvidence.passed
      ? { key: 'terminalInventoryReady', type: 'terminal_manual_evidence_required', owner: '业务/测试', action: '补充 Ami Aura Lite 终端登录态验收证据，并确保验收时间不早于基线。' }
      : null,
    (!terminal.dataPassed || !terminal.codePath.passed)
      ? { key: 'terminalInventoryReady', type: 'terminal_fix_required', owner: '技术', action: '修复终端库存数据口径或 Kiosk 代码路径。' }
      : null,
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    store: { id: store.id, name: store.name },
    baseline: {
      source: sinceMovementId > 0 ? 'explicit' : 'latest',
      sinceMovementId: sinceMovement?.id ?? null,
      sinceMovementAt: sinceMovement?.occurredAt ?? null,
    },
    migration: {
      duplicateSkuCount,
      globalUnique: indexes.globalUnique,
      storeScopedUnique: indexes.storeScopedUnique,
      indexes: indexes.indexes,
      prismaMigration,
    },
    fixtures: {
      noBomProject: noBomProject ? { id: noBomProject.id, name: noBomProject.name } : null,
      projectWithBom: projectWithBom ? { id: projectWithBom.id, name: projectWithBom.name } : null,
      projectBomDeductibleCount: projectBomScore?.deductibleCount ?? 0,
      cardUsageCandidate: cardUsageCandidate ? { id: cardUsageCandidate.id, cardName: cardUsageCandidate.cardName } : null,
      transferCandidate: transferCandidate
        ? {
            source: `${transferCandidate.source.store?.name ?? transferCandidate.source.storeId} / ${transferCandidate.source.name} / ${transferCandidate.source.sku}`,
            target: `${transferCandidate.target.store?.name ?? transferCandidate.target.storeId} / ${transferCandidate.target.name} / ${transferCandidate.target.sku}`,
          }
        : null,
    },
    acceptance,
    managementUiEvidence,
    baselineCompare,
    terminal,
    gates,
    blockers,
    releaseReady: Object.values(gates).every(Boolean),
  };
}

function renderMarkdown(result: any) {
  const failedGates = Object.entries(result.gates).filter(([, passed]) => !passed).map(([key]) => key);
  const nextActions = [
    !result.gates.migrationDataReady ? '先处理同门店重复 SKU，再执行 SKU migration。' : null,
    !result.gates.migrationApplied ? '授权后执行 `20260629102000_product_sku_store_scope` migration。' : null,
    !result.gates.fixturesReady ? `授权后执行 \`inventory:acceptance-fixtures -- --store-id ${result.store.id} --apply --yes\` 补齐验收样本。` : null,
    !result.gates.acceptancePassed ? '按 runbook 完成真实写库验收，并复跑 `inventory:acceptance-verify --strict`。' : null,
    !result.gates.managementUiEvidenceReady ? '补充管理端登录态验收证据，并通过 `--management-ui-evidence <path>` 传给发布门禁。' : null,
    !result.gates.baselineComparePassed ? `执行 \`inventory:baseline-compare -- --store-id ${result.store.id} --since-movement-id <基线最大流水ID> --require-movements --strict\`，确认基线后有库存流水且商品库存与最新 afterStock 一致。` : null,
    !result.terminal.dataPassed ? '复查 Ami Aura Lite 终端库存入口数据口径。' : null,
    result.terminal.dataPassed && !result.terminal.codePath.passed ? '复查 Ami Aura Lite 终端库存 action、loader、API 路径和快捷入口是否仍然接通。' : null,
    result.terminal.dataPassed && !result.terminal.uiEvidence.passed ? '补充 Ami Aura Lite 终端登录态验收证据，并通过 `--terminal-ui-evidence <path>` 传给发布门禁。' : null,
  ].filter(Boolean);

  return `# 库存发布门禁报告

生成时间：${result.generatedAt}
门店：${result.store.name}（ID: ${result.store.id}）
总状态：${result.releaseReady ? '允许发布' : '不允许发布'}

## 1. 门禁总览

${table(['门禁项', '状态', '说明'], [
  ['SKU migration 数据条件', passedText(result.gates.migrationDataReady), `同门店重复 SKU 数：${result.migration.duplicateSkuCount}`],
  ['SKU migration 已应用', passedText(result.gates.migrationApplied), `全局唯一：${result.migration.globalUnique ? '存在' : '不存在'}；门店内唯一：${result.migration.storeScopedUnique ? '存在' : '不存在'}；Prisma 记录：${result.migration.prismaMigration.applied ? '已应用' : result.migration.prismaMigration.tableExists ? '未应用' : '迁移表不存在'}`],
  ['验收样本齐备', passedText(result.gates.fixturesReady), `无 BOM 项目：${result.fixtures.noBomProject ? '有' : '缺'}；可扣 BOM：${result.fixtures.projectBomDeductibleCount}；次卡：${result.fixtures.cardUsageCandidate ? '有' : '缺'}；调拨：${result.fixtures.transferCandidate ? '有' : '缺'}`],
  ['基线窗口', passedText(result.gates.baselineReady), result.baseline.sinceMovementId ? `StockMovement.id ${result.baseline.sinceMovementId} / ${formatDateTime(result.baseline.sinceMovementAt)} / ${result.baseline.source}` : '缺失'],
  ['真实写库验收', passedText(result.gates.acceptancePassed), result.acceptance.missing.length ? `缺失：${result.acceptance.missing.join(', ')}` : '全部通过'],
  ['管理端登录态验收', passedText(result.gates.managementUiEvidenceReady), result.managementUiEvidence.path ? `证据文件：${result.managementUiEvidence.exists ? '存在' : '缺失'}；验收人：${passedText(result.managementUiEvidence.checks.operator)}；验收时间：${passedText(result.managementUiEvidence.checks.checkedAt)}；不早于基线：${passedText(result.managementUiEvidence.checks.checkedAfterBaseline)}；${result.managementUiEvidence.path}` : `未提供；需传 --management-ui-evidence <path>；基线时间：${formatBeijingDateTime(result.baseline.sinceMovementAt)}`],
  ['基线库存一致性', passedText(result.gates.baselineComparePassed), `基线后流水 ${result.baselineCompare.movementCount}；涉及商品 ${result.baselineCompare.productCount}；不一致 ${result.baselineCompare.inconsistentProductCount}${result.baselineCompare.truncated ? '；流水超过 5000 条需单独复核' : ''}`],
  ['终端库存看板数据', passedText(result.terminal.dataPassed), `商品 ${result.terminal.counts.products}；低库存 ${result.terminal.counts.lowStock}；临期 ${result.terminal.counts.expiring}；补货 ${result.terminal.counts.replenishment}`],
  ['终端 Kiosk 代码路径', passedText(result.terminal.codePath.passed), `action：${passedText(result.terminal.codePath.checks.inventoryAction)}；loader：${passedText(result.terminal.codePath.checks.loaderWired)}；API：${passedText(result.terminal.codePath.checks.serviceApiPath)}；快捷入口：${passedText(result.terminal.codePath.checks.quickAction)}`],
  ['终端登录态验收', passedText(result.terminal.uiEvidence.passed), result.terminal.uiEvidence.path ? `证据文件：${result.terminal.uiEvidence.exists ? '存在' : '缺失'}；验收人：${passedText(result.terminal.uiEvidence.checks.operator)}；验收时间：${passedText(result.terminal.uiEvidence.checks.checkedAt)}；不早于基线：${passedText(result.terminal.uiEvidence.checks.checkedAfterBaseline)}；${result.terminal.uiEvidence.path}` : `未提供；需传 --terminal-ui-evidence <path>；基线时间：${formatBeijingDateTime(result.baseline.sinceMovementAt)}`],
])}

## 2. 失败门禁

${failedGates.length ? failedGates.map((item) => `- ${item}`).join('\n') : '- 无'}

## 3. 阻断归类

${result.blockers.length ? table(['阻断项', '类型', '责任', '下一步'], result.blockers.map((item: any) => [item.key, item.type, item.owner, item.action])) : '- 无'}

## 4. 样本与登录态证据

${table(['对象', '当前值'], [
  ['可扣 BOM 项目', result.fixtures.projectWithBom ? `${result.fixtures.projectWithBom.name} / ${result.fixtures.projectWithBom.id}` : '缺失'],
  ['未配置 BOM 项目', result.fixtures.noBomProject ? `${result.fixtures.noBomProject.name} / ${result.fixtures.noBomProject.id}` : '缺失'],
  ['次卡核销候选', result.fixtures.cardUsageCandidate ? `${result.fixtures.cardUsageCandidate.cardName} / ${result.fixtures.cardUsageCandidate.id}` : '缺失'],
  ['调拨候选', result.fixtures.transferCandidate ? `${result.fixtures.transferCandidate.source} -> ${result.fixtures.transferCandidate.target}` : '缺失'],
  ['管理端登录态证据', result.managementUiEvidence.path ?? '未提供'],
  ['终端入口', 'GET /api/terminal/dashboard/inventory-alerts；Kiosk action: manager.inventory'],
  ['终端 Kiosk 文件', result.terminal.codePath.files.microApp ?? '未找到 runMicroApp.ts'],
  ['终端登录态证据', result.terminal.uiEvidence.path ?? '未提供'],
])}

## 5. 下一步

${nextActions.length ? nextActions.map((item) => `- ${item}`).join('\n') : '- 无，当前门禁允许发布。'}

## 6. 说明

- 本报告只读生成，不执行 migration，不写样本，不修改库存。
- 人工填写的验收时间按北京时间解析；如填写 ISO 时间并带时区，则按 ISO 时区解析。当前基线时间：${formatBeijingDateTime(result.baseline.sinceMovementAt)}。
- 阻断归类用于区分授权动作、真实业务验收、管理端/终端登录态证据和技术修复，避免把只读通过误认为可发布。
- 发布门禁要求管理端登录态验收证据通过；证据文件需填写验收人、验收时间、门店名，并记录“库存页、真实入库、手工出库、项目 BOM、次卡核销、生成采购单、采购单收货、完成调拨、临期报废”通过，且验收时间不能早于本次基线窗口。
- 发布门禁同时要求终端库存数据口径通过、Kiosk 代码路径接通，以及 Ami Aura Lite 终端登录态验收证据通过；证据文件需填写验收人、验收时间、门店名，并记录“库存入口、低库存、临期、补货建议”通过，且验收时间不能早于本次基线窗口。
- 真实写库验收默认只识别备注或采购供应商包含 \`${result.acceptance.marker ?? '未启用'}\` 的发布验收动作；如确需放宽，可传 \`--marker none\`。
- 次卡核销扣耗材也按同一验收标记识别；执行时需保留 runbook payload 中的 \`remark\`。
- SKU migration 门禁同时检查数据库索引和 \`_prisma_migrations\` 成功记录，避免索引和 Prisma 迁移状态不一致。
- 未传 \`--since-movement-id\` 时默认以当前最新库存流水作为基线，因此真实写库验收通常会显示未通过；发布前应传入基线快照中的最大 \`StockMovement.id\`。
`;
}

async function main() {
  const result = await buildReleaseGate();
  const outPath = argValue('out');
  if (outPath) {
    const resolvedOutPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedOutPath), { recursive: true });
    writeFileSync(resolvedOutPath, renderMarkdown(result), 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.releaseReady && process.argv.includes('--strict')) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
