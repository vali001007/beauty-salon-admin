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

function argValue(name: string, fallback?: string) {
  const dashName = name.startsWith('--') ? name : `--${name}`;
  const index = process.argv.indexOf(dashName);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const prefix = `${dashName}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  const dashName = name.startsWith('--') ? name : `--${name}`;
  return process.argv.includes(dashName);
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

function managementCodePathState() {
  const routes = readFirstExisting(['../../src/app/routes.tsx', 'src/app/routes.tsx']);
  const stockPage = readFirstExisting(['../../src/app/pages/StockManagement.tsx', 'src/app/pages/StockManagement.tsx']);
  const purchasePage = readFirstExisting(['../../src/app/pages/PurchaseManagement.tsx', 'src/app/pages/PurchaseManagement.tsx']);
  const transferPage = readFirstExisting(['../../src/app/pages/StoreTransfer.tsx', 'src/app/pages/StoreTransfer.tsx']);
  const expiryPage = readFirstExisting(['../../src/app/pages/ExpiryManagement.tsx', 'src/app/pages/ExpiryManagement.tsx']);
  const servicePage = readFirstExisting(['../../src/app/pages/ServiceConsumption.tsx', 'src/app/pages/ServiceConsumption.tsx']);
  const inventoryFacade = readFirstExisting(['../../src/api/inventory.ts', 'src/api/inventory.ts']);
  const inventoryRealApi = readFirstExisting(['../../src/api/real/inventory.ts', 'src/api/real/inventory.ts']);

  const checks = {
    routesFile: Boolean(routes.path),
    inventoryRoutes: ['inventory/stock', 'inventory/purchase', 'inventory/expiry', 'inventory/transfer', 'inventory/consumption'].every((path) => routes.content.includes(path)),
    stockPageActions: stockPage.content.includes('createInbound') && stockPage.content.includes('createInventoryAdjustment') && stockPage.content.includes('getBatches'),
    purchasePageActions: purchasePage.content.includes('PurchaseManagement') && inventoryRealApi.content.includes('/inventory/purchase-orders'),
    transferPageActions: transferPage.content.includes('createTransfer') && transferPage.content.includes('getTransferOrdersPaginated'),
    expiryPageActions: expiryPage.content.includes('createInventoryAdjustment') && expiryPage.content.includes('getExpiringProductsPaginated'),
    serviceConsumptionPage: servicePage.content.includes('ServiceConsumption'),
    inventoryApiFacade: ['createInbound', 'createInventoryAdjustment', 'createTransfer'].every((name) => inventoryFacade.content.includes(name)),
  };
  return {
    passed: Object.values(checks).every(Boolean),
    files: {
      routes: routes.path,
      stockPage: stockPage.path,
      purchasePage: purchasePage.path,
      transferPage: transferPage.path,
      expiryPage: expiryPage.path,
      servicePage: servicePage.path,
      inventoryFacade: inventoryFacade.path,
      inventoryRealApi: inventoryRealApi.path,
    },
    checks,
  };
}

function managementUiEvidenceState(storeName: string) {
  const evidencePath = argValue('ui-evidence') ?? argValue('uiEvidence') ?? argValue('management-ui-evidence') ?? argValue('managementUiEvidence');
  const evidenceAfter = parseEvidenceDate(argValue('evidence-after') ?? argValue('evidenceAfter'));
  const emptyChecks = {
    operator: false,
    checkedAt: false,
    checkedAfterMinimum: false,
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
    return {
      required: hasFlag('require-ui-evidence'),
      evidenceAfter,
      path: null,
      exists: false,
      passed: false,
      checks: emptyChecks,
    };
  }

  const resolvedPath = resolve(process.cwd(), evidencePath);
  if (!existsSync(resolvedPath)) {
    return {
      required: hasFlag('require-ui-evidence'),
      evidenceAfter,
      path: resolvedPath,
      exists: false,
      passed: false,
      checks: emptyChecks,
    };
  }

  const content = readFileSync(resolvedPath, 'utf8');
  const checkedAt = parseEvidenceDate(fieldValue(content, '验收时间'));
  const checks = {
    operator: hasFilledField(content, '验收人'),
    checkedAt: Boolean(checkedAt),
    checkedAfterMinimum: Boolean(!evidenceAfter || (checkedAt && checkedAt.getTime() >= evidenceAfter.getTime())),
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
    required: hasFlag('require-ui-evidence'),
    evidenceAfter,
    path: resolvedPath,
    exists: true,
    passed: Object.values(checks).every(Boolean),
    checks,
  };
}

async function selectStore() {
  const storeId = Number(argValue('store-id') ?? argValue('storeId'));
  if (Number.isInteger(storeId) && storeId > 0) {
    return prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
  }
  const storeName = argValue('store-name') ?? argValue('storeName') ?? DEFAULT_STORE_NAME;
  return prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
}

async function buildReadiness() {
  const store = await selectStore();
  if (!store) throw new Error(`门店不存在：${argValue('store-id') ?? argValue('store-name') ?? DEFAULT_STORE_NAME}`);
  const storeId = Number(store.id);
  const [productCount, batchCount, movementCount, lowStockCount, purchaseOrderCount, transferOrderCount] = await Promise.all([
    prisma.product.count({ where: { storeId, deletedAt: null } }),
    prisma.stockBatch.count({ where: { product: { storeId, deletedAt: null } } }),
    prisma.stockMovement.count({ where: { storeId } }),
    prisma.product.count({ where: { storeId, deletedAt: null, currentStock: { lte: prisma.product.fields.safetyStock } } }),
    prisma.purchaseOrder.count(),
    prisma.transferOrder.count({ where: { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] } }),
  ]);
  const dataChecks = {
    stockProducts: productCount > 0,
    batches: batchCount > 0,
    movements: movementCount > 0,
    lowStockSignal: lowStockCount > 0,
  };
  const codePath = managementCodePathState();
  const uiEvidence = managementUiEvidenceState(store.name);
  const dataPassed = Object.values(dataChecks).every(Boolean);
  const passed = dataPassed && codePath.passed && (!uiEvidence.required || uiEvidence.passed);

  return {
    store: { id: store.id, name: store.name },
    generatedAt: new Date().toISOString(),
    counts: {
      products: productCount,
      batches: batchCount,
      movements: movementCount,
      lowStock: lowStockCount,
      purchaseOrders: purchaseOrderCount,
      transferOrders: transferOrderCount,
    },
    dataChecks,
    dataPassed,
    codePath,
    uiEvidence,
    passed,
  };
}

function renderMarkdown(result: any) {
  return `# 库存管理端登录态就绪度报告

生成时间：${result.generatedAt}
门店：${result.store.name}（ID: ${result.store.id}）
总状态：${result.dataPassed && result.codePath.passed ? (result.uiEvidence.passed ? '已就绪（数据、代码路径与登录态均通过）' : '数据和代码路径已就绪，登录态未验收') : '未就绪'}

## 1. 数据口径

${table(['检查项', '状态', '说明'], [
  ['库存商品数据', result.dataChecks.stockProducts ? '通过' : '缺失', `商品数：${result.counts.products}`],
  ['批次数据', result.dataChecks.batches ? '通过' : '缺失', `批次数：${result.counts.batches}`],
  ['库存流水', result.dataChecks.movements ? '通过' : '缺失', `流水数：${result.counts.movements}`],
  ['低库存信号', result.dataChecks.lowStockSignal ? '通过' : '缺失', `低库存商品数：${result.counts.lowStock}`],
  ['手动采购单', '参考', `采购单数：${result.counts.purchaseOrders}`],
  ['调拨单', '参考', `相关调拨单数：${result.counts.transferOrders}`],
])}

## 2. 管理端代码路径

${table(['检查项', '状态', '说明'], [
  ['路由文件', result.codePath.checks.routesFile ? '通过' : '缺失', result.codePath.files.routes ?? '未找到 routes.tsx'],
  ['库存相关路由', result.codePath.checks.inventoryRoutes ? '通过' : '缺失', '需包含 stock/purchase/expiry/transfer/consumption'],
  ['库存页动作', result.codePath.checks.stockPageActions ? '通过' : '缺失', '需包含入库、调整和批次查询动作'],
  ['采购页动作', result.codePath.checks.purchasePageActions ? '通过' : '缺失', '需接手动采购单接口'],
  ['调拨页动作', result.codePath.checks.transferPageActions ? '通过' : '缺失', '需接创建调拨和调拨列表'],
  ['临期页动作', result.codePath.checks.expiryPageActions ? '通过' : '缺失', '需接临期列表和报废调整'],
  ['服务消耗页', result.codePath.checks.serviceConsumptionPage ? '通过' : '缺失', '需保留 BOM/消耗入口'],
  ['库存 API 门面', result.codePath.checks.inventoryApiFacade ? '通过' : '缺失', '需导出入库、调整和调拨方法'],
])}

## 3. 管理端登录态验收证据

${table(['检查项', '状态', '说明'], [
  ['是否要求登录态证据', result.uiEvidence.required ? '要求' : '未要求', '传入 --require-ui-evidence 后会纳入本脚本总状态'],
  ['证据文件', result.uiEvidence.path ? (result.uiEvidence.exists ? '存在' : '缺失') : '未提供', result.uiEvidence.path ?? '可通过 --ui-evidence <path> 指定'],
  ['验收人', result.uiEvidence.checks.operator ? '通过' : '未通过', '需填写非占位符验收人'],
  ['验收时间', result.uiEvidence.checks.checkedAt ? '通过' : '未通过', '需填写可解析的非占位符验收时间'],
  ['验收时间下限', result.uiEvidence.evidenceAfter ? (result.uiEvidence.checks.checkedAfterMinimum ? '通过' : '未通过') : '未要求', result.uiEvidence.evidenceAfter ? `不早于 ${result.uiEvidence.evidenceAfter.toISOString()}（${formatBeijingDateTime(result.uiEvidence.evidenceAfter)}）` : '可通过 --evidence-after <ISO时间> 指定'],
  ['门店匹配', result.uiEvidence.checks.storeMatched ? '通过' : '未通过', `需包含门店名：${result.store.name}`],
  ['库存页', result.uiEvidence.checks.inventoryPage ? '通过' : '未通过', '需记录“库存页：通过”或勾选完成'],
  ['真实入库', result.uiEvidence.checks.inbound ? '通过' : '未通过', '需记录“真实入库：通过”或勾选完成'],
  ['手工出库', result.uiEvidence.checks.manualOutbound ? '通过' : '未通过', '需记录“手工出库：通过”或勾选完成'],
  ['项目 BOM', result.uiEvidence.checks.projectBom ? '通过' : '未通过', '需记录“项目 BOM：通过”或勾选完成'],
  ['次卡核销', result.uiEvidence.checks.cardUsageBom ? '通过' : '未通过', '需记录“次卡核销：通过”或勾选完成'],
  ['生成采购单', result.uiEvidence.checks.purchaseOrderCreated ? '通过' : '未通过', '需记录“生成采购单：通过”或勾选完成'],
  ['采购单收货', result.uiEvidence.checks.purchaseReceipt ? '通过' : '未通过', '需记录“采购单收货：通过”或勾选完成'],
  ['完成调拨', result.uiEvidence.checks.transfer ? '通过' : '未通过', '需记录“完成调拨：通过”或勾选完成'],
  ['临期报废', result.uiEvidence.checks.scrapOut ? '通过' : '未通过', '需记录“临期报废：通过”或勾选完成'],
])}

建议证据模板：

\`\`\`markdown
# 库存管理端登录态验收

验收人：<姓名>
验收时间：<YYYY-MM-DD HH:mm>
门店：${result.store.name}
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

## 4. 说明

- 本报告只读生成，不调用管理端接口，不修改数据库。
- 人工填写的验收时间按北京时间解析；如填写 ISO 时间并带时区，则按 ISO 时区解析。
- 代码路径检查为源码静态检查，用于确认管理端库存页、采购、调拨、临期、消耗入口没有断开；真实展示仍以登录态验收为准。
- 如要把登录态证据纳入本脚本严格结果，传入 \`--require-ui-evidence --ui-evidence <path>\`。
- 发布前最终仍需 \`inventory:release-gate --management-ui-evidence <path> --terminal-ui-evidence <path> --strict\` 通过。
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
  if (!result.passed && process.argv.includes('--strict')) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
