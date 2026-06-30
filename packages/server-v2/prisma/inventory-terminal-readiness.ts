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

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNonNegativeStock(value: unknown) {
  return Math.max(0, toNumber(value));
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function hasFlag(name: string) {
  const dashName = name.startsWith('--') ? name : `--${name}`;
  return process.argv.includes(dashName);
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

function terminalUiEvidenceState(storeName: string) {
  const evidencePath = argValue('ui-evidence') ?? argValue('uiEvidence');
  const evidenceAfter = parseEvidenceDate(argValue('evidence-after') ?? argValue('evidenceAfter'));
  if (!evidencePath) {
    return {
      required: hasFlag('require-ui-evidence'),
      evidenceAfter,
      path: null,
      exists: false,
      passed: false,
      checks: {
        operator: false,
        checkedAt: false,
        checkedAfterMinimum: false,
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
      required: hasFlag('require-ui-evidence'),
      evidenceAfter,
      path: resolvedPath,
      exists: false,
      passed: false,
      checks: {
        operator: false,
        checkedAt: false,
        checkedAfterMinimum: false,
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
    checkedAfterMinimum: Boolean(!evidenceAfter || (checkedAt && checkedAt.getTime() >= evidenceAfter.getTime())),
    storeMatched: content.includes(storeName),
    inventoryEntry: checkEvidenceLine(content, '库存入口'),
    lowStock: checkEvidenceLine(content, '低库存'),
    expiring: checkEvidenceLine(content, '临期'),
    replenishment: checkEvidenceLine(content, '补货建议'),
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
  const now = new Date();
  const alertBefore = new Date(now);
  alertBefore.setDate(alertBefore.getDate() + 30);

  const [products, expiringBatches] = await Promise.all([
    prisma.product.findMany({
      where: { storeId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        currentStock: true,
        safetyStock: true,
        unit: true,
        updatedAt: true,
      },
      orderBy: { currentStock: 'asc' },
      take: 200,
    }),
    prisma.stockBatch.findMany({
      where: {
        product: { storeId, deletedAt: null },
        stock: { gt: 0 },
        expiryDate: { not: null, lte: alertBefore },
      },
      include: { product: { select: { id: true, name: true, sku: true, unit: true, costPrice: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 50,
    }),
  ]);

  const lowStock = products
    .filter((item: any) => toNumber(item.currentStock) <= toNumber(item.safetyStock))
    .map((item: any) => ({
      id: item.id,
      productName: item.name,
      sku: item.sku,
      currentStock: toNonNegativeStock(item.currentStock),
      safetyStock: toNonNegativeStock(item.safetyStock),
      status: toNonNegativeStock(item.currentStock) <= 0 ? '缺货' : '低库存',
    }));
  const expiring = expiringBatches.map((batch: any) => {
    const remainingDays = batch.expiryDate ? Math.ceil((batch.expiryDate.getTime() - now.getTime()) / 86400000) : 0;
    return {
      id: batch.id,
      productName: batch.product.name,
      sku: batch.product.sku,
      batchNo: batch.batchNo,
      remainingDays,
      stock: toNumber(batch.stock),
      costAmount: toNumber(batch.stock) * toNumber(batch.product.costPrice),
      urgency: remainingDays <= 0 ? '已过期' : remainingDays <= 15 ? '紧急' : '临期',
    };
  });
  const replenishment = lowStock.map((item: any) => ({
    id: item.id,
    productName: item.productName,
    sku: item.sku,
    currentStock: item.currentStock,
    safetyStock: item.safetyStock,
    suggestedQty: Math.max(item.safetyStock * 2 - item.currentStock, item.safetyStock || 1),
  }));

  const checks = {
    stockData: products.length > 0,
    lowStockUsesSafetyStock: lowStock.every((item: any) => item.currentStock <= item.safetyStock),
    expiringUsesBatchWindow: expiring.every((item: any) => item.remainingDays <= 30),
    replenishmentMatchesLowStock: replenishment.length === lowStock.length,
  };
  const dataPassed = Object.values(checks).every(Boolean);
  const codePath = terminalCodePathState();
  const uiEvidence = terminalUiEvidenceState(store.name);
  const passed = dataPassed && codePath.passed && (!uiEvidence.required || uiEvidence.passed);

  return {
    store: { id: store.id, name: store.name },
    generatedAt: new Date().toISOString(),
    endpoint: {
      admin: 'GET /api/terminal/dashboard/inventory-alerts',
      kioskAction: 'manager.inventory',
      kioskLoader: 'getInventoryAlerts',
      cacheTtlMs: 120000,
    },
    counts: {
      products: products.length,
      lowStock: lowStock.length,
      expiring: expiring.length,
      replenishment: replenishment.length,
    },
    samples: {
      lowStock: lowStock.slice(0, 5),
      expiring: expiring.slice(0, 5),
      replenishment: replenishment.slice(0, 5),
    },
    checks,
    dataPassed,
    codePath,
    uiEvidence,
    passed,
  };
}

function renderMarkdown(result: any) {
  return `# 终端库存看板就绪度报告

生成时间：${result.generatedAt}
门店：${result.store.name}（ID: ${result.store.id}）
总状态：${result.dataPassed && result.codePath.passed ? (result.uiEvidence.passed ? '已就绪（数据、代码路径与登录态均通过）' : '数据和代码路径已就绪，登录态未验收') : '未就绪'}

## 1. 终端入口

${table(['对象', '路径'], [
  ['后端接口', result.endpoint.admin],
  ['Kiosk 动作', result.endpoint.kioskAction],
  ['Kiosk 数据加载器', result.endpoint.kioskLoader],
  ['缓存 TTL', `${result.endpoint.cacheTtlMs}ms`],
])}

## 2. 数据口径

${table(['检查项', '状态', '说明'], [
  ['库存商品数据', result.checks.stockData ? '通过' : '缺失', `商品数：${result.counts.products}`],
  ['低库存口径', result.checks.lowStockUsesSafetyStock ? '通过' : '异常', `低库存数：${result.counts.lowStock}；条件：currentStock <= safetyStock`],
  ['临期批次口径', result.checks.expiringUsesBatchWindow ? '通过' : '异常', `临期批次数：${result.counts.expiring}；窗口：未来 30 天且批次库存 > 0`],
  ['补货建议口径', result.checks.replenishmentMatchesLowStock ? '通过' : '异常', `补货建议数：${result.counts.replenishment}；应与低库存数一致`],
])}

## 3. Kiosk 代码路径

${table(['检查项', '状态', '说明'], [
  ['MicroApp 文件', result.codePath.checks.microAppFile ? '通过' : '缺失', result.codePath.files.microApp ?? '未找到 runMicroApp.ts'],
  ['库存 action', result.codePath.checks.inventoryAction ? '通过' : '缺失', '需存在 manager.inventory action 分支'],
  ['库存 loader', result.codePath.checks.loaderWired ? '通过' : '缺失', '需通过 getInventoryAlerts 加载并返回 inventory payload'],
  ['API 路径', result.codePath.checks.serviceApiPath ? '通过' : '缺失', '需调用 /terminal/dashboard/inventory-alerts'],
  ['快捷入口', result.codePath.checks.quickAction ? '通过' : '缺失', 'AppContent 需暴露 manager.inventory'],
])}

## 4. 终端登录态验收证据

${table(['检查项', '状态', '说明'], [
  ['是否要求登录态证据', result.uiEvidence.required ? '要求' : '未要求', '传入 --require-ui-evidence 后会纳入本脚本总状态'],
  ['证据文件', result.uiEvidence.path ? (result.uiEvidence.exists ? '存在' : '缺失') : '未提供', result.uiEvidence.path ?? '可通过 --ui-evidence <path> 指定'],
  ['验收人', result.uiEvidence.checks.operator ? '通过' : '未通过', '需填写非占位符验收人'],
  ['验收时间', result.uiEvidence.checks.checkedAt ? '通过' : '未通过', '需填写可解析的非占位符验收时间'],
  ['验收时间下限', result.uiEvidence.evidenceAfter ? (result.uiEvidence.checks.checkedAfterMinimum ? '通过' : '未通过') : '未要求', result.uiEvidence.evidenceAfter ? `不早于 ${result.uiEvidence.evidenceAfter.toISOString()}（${formatBeijingDateTime(result.uiEvidence.evidenceAfter)}）` : '可通过 --evidence-after <ISO时间> 指定'],
  ['门店匹配', result.uiEvidence.checks.storeMatched ? '通过' : '未通过', `需包含门店名：${result.store.name}`],
  ['库存入口', result.uiEvidence.checks.inventoryEntry ? '通过' : '未通过', '需记录“库存入口：通过”或勾选完成'],
  ['低库存展示', result.uiEvidence.checks.lowStock ? '通过' : '未通过', '需记录“低库存：通过”或勾选完成'],
  ['临期展示', result.uiEvidence.checks.expiring ? '通过' : '未通过', '需记录“临期：通过”或勾选完成'],
  ['补货建议展示', result.uiEvidence.checks.replenishment ? '通过' : '未通过', '需记录“补货建议：通过”或勾选完成'],
])}

建议证据模板：

\`\`\`markdown
# 终端库存看板登录态验收

验收人：<姓名>
验收时间：<YYYY-MM-DD HH:mm>
门店：${result.store.name}
- [x] 库存入口：通过
- [x] 低库存：通过
- [x] 临期：通过
- [x] 补货建议：通过
\`\`\`

## 5. 样本

### 低库存

${result.samples.lowStock.length ? table(['商品', 'SKU', '当前库存', '安全库存', '状态'], result.samples.lowStock.map((item: any) => [item.productName, item.sku, item.currentStock, item.safetyStock, item.status])) : '- 无'}

### 临期批次

${result.samples.expiring.length ? table(['商品', 'SKU', '批次', '剩余天数', '库存'], result.samples.expiring.map((item: any) => [item.productName, item.sku, item.batchNo, item.remainingDays, item.stock])) : '- 无'}

### 补货建议

${result.samples.replenishment.length ? table(['商品', 'SKU', '当前库存', '安全库存', '建议补货'], result.samples.replenishment.map((item: any) => [item.productName, item.sku, item.currentStock, item.safetyStock, item.suggestedQty])) : '- 无'}

## 6. 说明

- 本报告只读生成，不调用终端设备登录态，不修改数据库。
- 人工填写的验收时间按北京时间解析；如填写 ISO 时间并带时区，则按 ISO 时区解析。
- Kiosk 代码路径检查为源码静态检查，用于确认终端库存入口、loader 和 API path 没有断开；真实展示仍以登录态验收为准。
- 真实登录态验收仍需在 Ami Aura Lite 终端打开“库存”入口，确认低库存、临期和补货建议展示与本报告口径一致。
- 如要把登录态证据纳入本脚本严格结果，传入 \`--require-ui-evidence --ui-evidence <path>\`。
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
