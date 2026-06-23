import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type ReadinessArgs = {
  storeId?: number;
  from: Date;
  to: Date;
  periodMonth: string;
  assigneeManualReviewFile?: string;
};

type CheckResult = {
  key: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  evidence?: Record<string, unknown>;
  nextStep?: string;
};

type RequiredColumn = {
  table: string;
  column: string;
  purpose: string;
};

type RequiredIndex = {
  table: string;
  indexName: string;
  purpose: string;
};

type RequiredMigration = {
  name: string;
  purpose: string;
};

type MarginItem = {
  order: any;
  item: any;
  type: 'product' | 'project';
};

type CommissionRuleCoverage = {
  covered: Set<number>;
  missing: MarginItem[];
};

type ConfirmedManualException = {
  orderItemId: number;
  resolution: string;
  confirmedBy: string;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

const REQUIRED_COLUMNS: RequiredColumn[] = [
  { table: 'OperatingCost', column: 'storeId', purpose: '经营成本按门店归集' },
  { table: 'OperatingCost', column: 'periodMonth', purpose: '经营成本按月份归集' },
  { table: 'OperatingCost', column: 'category', purpose: '经营成本分类展示' },
  { table: 'OperatingCost', column: 'amount', purpose: '经营成本金额汇总' },
  { table: 'OperatingCost', column: 'costDate', purpose: '经营成本日期筛选' },
  { table: 'CommissionRule', column: 'userId', purpose: '商品/项目提成规则按指定员工匹配' },
  { table: 'CommissionRecord', column: 'staffUserId', purpose: '商品/项目毛利按员工用户汇总提成' },
  { table: 'CommissionRecord', column: 'beauticianId', purpose: '兼容美容师维度提成记录' },
  { table: 'CommissionSettlement', column: 'staffUserId', purpose: '月度提成按员工用户结算' },
  { table: 'CustomerBalanceTransaction', column: 'operatorId', purpose: '会员卡充值/赠送/扣减记录操作人追踪' },
  { table: 'CustomerCard', column: 'operatorId', purpose: '客户办卡记录操作人追踪' },
  { table: 'OrderItem', column: 'beauticianId', purpose: '历史订单服务人归属与提成回填' },
  { table: 'Beautician', column: 'userId', purpose: '美容师绑定系统用户以匹配员工提成规则' },
];

const REQUIRED_MIGRATIONS: RequiredMigration[] = [
  { name: '20260619093000_operation_profit', purpose: '新增 OperatingCost 经营成本表' },
  { name: '20260619110000_commission_rule_user', purpose: '提成规则支持指定系统用户' },
  { name: '20260619113000_commission_staff_user', purpose: '提成记录/月结支持 staffUserId' },
  { name: '20260619121500_member_card_operator', purpose: '会员卡余额流水支持操作人追踪' },
  { name: '20260619124500_customer_card_operator', purpose: '客户办卡记录支持操作人追踪' },
  { name: '20260619131500_operation_profit_query_indexes', purpose: '经营利润月度订单查询组合索引' },
];

const REQUIRED_INDEXES: RequiredIndex[] = [
  {
    table: 'ProductOrder',
    indexName: 'ProductOrder_storeId_createdAt_idx',
    purpose: '经营利润按门店和月份查询商品/项目订单',
  },
];

function parseArgs(): ReadinessArgs {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }

  const now = new Date();
  const defaultPeriodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const periodMonth = args.get('periodMonth') ?? defaultPeriodMonth;
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    throw new Error('--periodMonth must be in YYYY-MM format');
  }

  const fromText = args.get('from') ?? `${periodMonth}-01`;
  const toText = args.get('to') ?? `${periodMonth}-${String(new Date(Number(periodMonth.slice(0, 4)), Number(periodMonth.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : undefined;
  const assigneeManualReviewFile = args.get('assigneeManualReviewFile');
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }

  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('--from/--to must be valid date strings like 2026-06-01');
  }
  return { storeId, from, to, periodMonth, assigneeManualReviewFile };
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function itemType(value: unknown) {
  const type = String(value ?? '').toLowerCase();
  if (['product', 'goods'].includes(type)) return 'product';
  if (['project', 'service', 'service_project'].includes(type)) return 'project';
  return undefined;
}

function isBusinessConfirmed(value: unknown) {
  const confirmedBy = String(value ?? '').trim();
  const placeholders = new Set(['pending_business_confirmation', '业务确认人', '待确认', 'TODO', 'todo']);
  return Boolean(confirmedBy && !placeholders.has(confirmedBy) && !confirmedBy.toLowerCase().includes('todo'));
}

function resolveFile(file: string) {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`File not found: ${file}`);
  }
  return filePath;
}

function loadConfirmedManualExceptions(file?: string) {
  if (!file) return { file: null, items: [] as ConfirmedManualException[] };
  const parsed = JSON.parse(readFileSync(resolveFile(file), 'utf8'));
  const items = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(items)) {
    throw new Error('Assignee manual review file must be a JSON array or an object with items array.');
  }
  const exceptions = items
    .map((item: any) => ({
      orderItemId: toNumber(item.orderItemId ?? item.itemId),
      resolution: String(item.resolution ?? '').trim(),
      confirmedBy: String(item.confirmedBy ?? '').trim(),
    }))
    .filter(
      (item: ConfirmedManualException) =>
        Number.isInteger(item.orderItemId) &&
        item.orderItemId > 0 &&
        isBusinessConfirmed(item.confirmedBy) &&
        ['historical_exception', 'ignore_non_margin'].includes(item.resolution),
    );
  return { file, items: exceptions };
}

function hasPositivePayloadCost(payload: unknown) {
  if (!payload || typeof payload !== 'object') return false;
  const source = payload as Record<string, unknown>;
  return ['costPrice', 'productCostPrice', 'costAmount', 'productCostAmount'].some((key) => toNumber(source[key]) > 0);
}

function normalizeTargetType(value: unknown) {
  return String(value ?? 'all').toLowerCase();
}

function ruleMatchesItem(rule: any, item: MarginItem, categoryId?: number) {
  const targetType = normalizeTargetType(rule.targetType);
  if (targetType === 'all') return true;
  if (targetType === 'category') return Boolean(categoryId && toNumber(rule.targetId) === categoryId);
  if (targetType === 'specific') return Boolean(item.item.itemId && toNumber(rule.targetId) === toNumber(item.item.itemId));
  return false;
}

function ruleMatchesAssignee(rule: any, assignee?: { userId?: number | null; levelId?: number | null }) {
  const userId = toNumber(rule.userId);
  const levelId = toNumber(rule.levelId);
  if (userId > 0 && userId !== toNumber(assignee?.userId)) return false;
  if (levelId > 0 && levelId !== toNumber(assignee?.levelId)) return false;
  return true;
}

function evaluateCommissionRuleCoverage(
  marginItems: MarginItem[],
  rules: any[],
  categoryByItemKey: Map<string, number | null>,
  assigneeByBeauticianId: Map<number, { userId?: number | null; levelId?: number | null }>,
): CommissionRuleCoverage {
  const covered = new Set<number>();
  const missing: MarginItem[] = [];
  for (const marginItem of marginItems) {
    const orderItemId = toNumber(marginItem.item.id);
    const assignee = assigneeByBeauticianId.get(toNumber(marginItem.item.beauticianId));
    const categoryId = categoryByItemKey.get(`${marginItem.type}:${toNumber(marginItem.item.itemId)}`) ?? undefined;
    const matched = rules.some(
      (rule) => rule.type === marginItem.type && rule.status === 'active' && ruleMatchesAssignee(rule, assignee) && ruleMatchesItem(rule, marginItem, categoryId),
    );
    if (matched) covered.add(orderItemId);
    else missing.push(marginItem);
  }
  return { covered, missing };
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    'select exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = $1) as exists',
    tableName,
  );
  return Boolean(rows[0]?.exists);
}

async function appliedMigrations(requiredMigrations: RequiredMigration[]) {
  const migrationTableExists = await tableExists('_prisma_migrations');
  if (!migrationTableExists) {
    return { migrationTableExists, applied: new Set<string>() };
  }
  const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    'select migration_name from "_prisma_migrations" where migration_name = any($1::text[]) and rolled_back_at is null',
    requiredMigrations.map((item) => item.name),
  );
  return { migrationTableExists, applied: new Set(rows.map((row) => row.migration_name)) };
}

async function existingColumns(requiredColumns: RequiredColumn[]) {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = current_schema()
        and table_name = any($1::text[])`,
    [...new Set(requiredColumns.map((item) => item.table))],
  );
  return new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
}

async function existingIndexes(requiredIndexes: RequiredIndex[]) {
  const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `select indexname
       from pg_indexes
      where schemaname = current_schema()
        and indexname = any($1::text[])`,
    requiredIndexes.map((item) => item.indexName),
  );
  return new Set(rows.map((row) => row.indexname));
}

async function main() {
  const args = parseArgs();
  const checks: CheckResult[] = [];
  const confirmedManualExceptions = loadConfirmedManualExceptions(args.assigneeManualReviewFile);
  const confirmedManualExceptionIds = new Set(confirmedManualExceptions.items.map((item) => item.orderItemId));

  const store = args.storeId
    ? await prisma.store.findUnique({ where: { id: args.storeId }, select: { id: true, name: true, status: true } })
    : null;
  if (args.storeId && !store) {
    checks.push({
      key: 'store',
      status: 'fail',
      message: `Store ${args.storeId} does not exist.`,
      nextStep: 'Choose an existing test or trial store before readiness check.',
    });
  } else if (store) {
    checks.push({ key: 'store', status: 'pass', message: `Store found: ${store.name}`, evidence: store });
  } else {
    checks.push({ key: 'store', status: 'warn', message: 'No storeId provided. Readiness is aggregated across stores.' });
  }

  const migrationStatus = await appliedMigrations(REQUIRED_MIGRATIONS);
  const missingMigrations = REQUIRED_MIGRATIONS.filter((item) => !migrationStatus.applied.has(item.name));
  checks.push({
    key: 'required_prisma_migrations',
    status: migrationStatus.migrationTableExists && missingMigrations.length === 0 ? 'pass' : 'fail',
    message: !migrationStatus.migrationTableExists
      ? '_prisma_migrations table does not exist in the current database.'
      : missingMigrations.length
        ? 'Some required operation-profit release Prisma migrations are not applied.'
        : 'Required operation-profit release Prisma migrations are applied.',
    evidence: {
      migrationTableExists: migrationStatus.migrationTableExists,
      missing: missingMigrations,
      checked: REQUIRED_MIGRATIONS.length,
    },
    nextStep:
      migrationStatus.migrationTableExists && missingMigrations.length === 0
        ? undefined
        : 'Run pending Prisma migrations against the intended test database, then re-run operation-profit:readiness.',
  });

  const availableColumns = await existingColumns(REQUIRED_COLUMNS);
  const hasColumn = (table: string, column: string) => availableColumns.has(`${table}.${column}`);
  const missingColumns = REQUIRED_COLUMNS.filter((item) => !availableColumns.has(`${item.table}.${item.column}`));
  checks.push({
    key: 'schema_migration_columns',
    status: missingColumns.length ? 'fail' : 'pass',
    message: missingColumns.length ? 'Some required operation-profit schema columns are missing.' : 'Required operation-profit schema columns exist.',
    evidence: {
      missing: missingColumns,
      checked: REQUIRED_COLUMNS.length,
    },
    nextStep: missingColumns.length ? 'Run pending Prisma migrations before readiness can pass.' : undefined,
  });

  const availableIndexes = await existingIndexes(REQUIRED_INDEXES);
  const missingIndexes = REQUIRED_INDEXES.filter((item) => !availableIndexes.has(item.indexName));
  checks.push({
    key: 'schema_migration_indexes',
    status: missingIndexes.length ? 'fail' : 'pass',
    message: missingIndexes.length ? 'Some required operation-profit query indexes are missing.' : 'Required operation-profit query indexes exist.',
    evidence: {
      missing: missingIndexes,
      checked: REQUIRED_INDEXES.length,
    },
    nextStep: missingIndexes.length ? 'Run pending Prisma migrations before page performance validation.' : undefined,
  });

  const operatingCostTableExists = await tableExists('OperatingCost');
  if (!operatingCostTableExists) {
    checks.push({
      key: 'operating_cost_migration',
      status: 'fail',
      message: 'OperatingCost table does not exist in the current database.',
      nextStep: 'Run the operation-profit Prisma migration against the intended test database.',
    });
  } else {
    checks.push({
      key: 'operating_cost_migration',
      status: 'pass',
      message: 'OperatingCost table exists.',
    });
  }

  let operatingCosts: any[] = [];
  if (operatingCostTableExists) {
    operatingCosts = await prisma.operatingCost.findMany({
      where: {
        ...(args.storeId ? { storeId: args.storeId } : {}),
        periodMonth: args.periodMonth,
      },
      select: { id: true, storeId: true, periodMonth: true, category: true, amount: true },
      orderBy: { id: 'asc' },
    });
    const totalCost = operatingCosts.reduce((sum, item) => sum + toNumber(item.amount), 0);
    checks.push({
      key: 'operating_cost_data',
      status: operatingCosts.length ? 'pass' : 'fail',
      message: operatingCosts.length ? 'Operating cost data exists for the period.' : 'No operating cost data found for the period.',
      evidence: { count: operatingCosts.length, totalCost },
      nextStep: operatingCosts.length ? undefined : 'Run operation-profit:cost-seed in dry-run, then write after confirmation.',
    });
  }

  const canRunMarginDataChecks =
    hasColumn('OrderItem', 'beauticianId') &&
    hasColumn('CommissionRecord', 'staffUserId') &&
    hasColumn('Beautician', 'userId') &&
    hasColumn('CommissionRule', 'userId');
  if (!canRunMarginDataChecks) {
    checks.push({
      key: 'margin_data_checks',
      status: 'fail',
      message: 'Margin data checks were skipped because required schema columns are missing.',
      evidence: {
        requiredColumns: ['OrderItem.beauticianId', 'CommissionRecord.staffUserId', 'Beautician.userId', 'CommissionRule.userId'],
      },
      nextStep: 'Run pending Prisma migrations, then re-run operation-profit:readiness.',
    });
    const failed = checks.filter((check) => check.status === 'fail');
    const warned = checks.filter((check) => check.status === 'warn');
    console.log(
      JSON.stringify(
        {
          mode: 'read-only',
          readinessStatus: 'blocked',
          storeId: args.storeId ?? null,
          periodMonth: args.periodMonth,
          from: args.from.toISOString(),
          to: args.to.toISOString(),
          summary: {
            pass: checks.filter((check) => check.status === 'pass').length,
            warn: warned.length,
            fail: failed.length,
          },
          checks,
          nextRequiredActions: checks.filter((check) => check.nextStep).map((check) => ({ key: check.key, nextStep: check.nextStep })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const orders = await prisma.productOrder.findMany({
    where: {
      ...(args.storeId ? { storeId: args.storeId } : {}),
      createdAt: { gte: args.from, lte: args.to },
      status: { in: ['paid', 'completed'] },
    },
    include: { orderItems: true },
    orderBy: { createdAt: 'desc' },
  });
  const productItems = orders.flatMap((order) =>
    order.orderItems
      .filter((item) => itemType(item.itemType) === 'product')
      .map((item) => ({ order, item, type: 'product' as const })),
  );
  const projectItems = orders.flatMap((order) =>
    order.orderItems
      .filter((item) => itemType(item.itemType) === 'project')
      .map((item) => ({ order, item, type: 'project' as const })),
  );
  const allMarginItems = [...productItems, ...projectItems];
  const orderItemIds = allMarginItems.map(({ item }) => item.id);
  const productIds = [...new Set(productItems.map(({ item }) => item.itemId).filter((id): id is number => Boolean(id)))];
  const projectIds = [...new Set(projectItems.map(({ item }) => item.itemId).filter((id): id is number => Boolean(id)))];
  const beauticianIds = [...new Set(allMarginItems.map(({ item }) => item.beauticianId).filter((id): id is number => Boolean(id)))];

  const [products, projects, projectBomItems, commissionRecords, commissionRules, beauticians] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, ...(args.storeId ? { storeId: args.storeId } : {}) },
          select: { id: true, categoryId: true, costPrice: true },
        })
      : [],
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds }, ...(args.storeId ? { storeId: args.storeId } : {}) },
          select: { id: true, typeId: true },
        })
      : [],
    projectIds.length ? prisma.projectBomItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true } }) : [],
    orderItemIds.length
      ? prisma.commissionRecord.findMany({
          where: { orderItemId: { in: orderItemIds }, status: { not: 'cancelled' } },
          select: { orderItemId: true },
        })
      : [],
    allMarginItems.length
      ? prisma.commissionRule.findMany({
          where: { ...(args.storeId ? { storeId: args.storeId } : {}), type: { in: ['product', 'project'] }, status: 'active' },
          select: { id: true, type: true, targetType: true, targetId: true, levelId: true, userId: true, status: true },
        })
      : [],
    beauticianIds.length
      ? prisma.beautician.findMany({
          where: { id: { in: beauticianIds }, ...(args.storeId ? { storeId: args.storeId } : {}) },
          select: { id: true, userId: true, levelId: true },
        })
      : [],
  ]);

  const productCostById = new Map<number, number>(products.map((product): [number, number] => [product.id, toNumber(product.costPrice)]));
  const projectMasterIds = new Set(projects.map((project) => project.id));
  const categoryByItemKey = new Map<string, number | null>();
  for (const product of products) categoryByItemKey.set(`product:${product.id}`, product.categoryId ?? null);
  for (const project of projects) categoryByItemKey.set(`project:${project.id}`, project.typeId ?? null);
  const assigneeByBeauticianId = new Map<number, { userId?: number | null; levelId?: number | null }>(
    beauticians.map((beautician): [number, { userId?: number | null; levelId?: number | null }] => [
      beautician.id,
      { userId: beautician.userId, levelId: beautician.levelId },
    ]),
  );
  const projectIdsWithBom = new Set(projectBomItems.map((item) => item.projectId));
  const orderItemIdsWithCommission = new Set(commissionRecords.map((record) => record.orderItemId).filter(Boolean));
  const commissionRuleCoverage = evaluateCommissionRuleCoverage(allMarginItems, commissionRules, categoryByItemKey, assigneeByBeauticianId);
  const productItemsMissingCost = productItems.filter(({ item }) => {
    if (hasPositivePayloadCost(item.payload)) return false;
    if (!item.itemId) return true;
    return toNumber(productCostById.get(item.itemId)) <= 0;
  });
  const projectItemsMissingProjectMaster = projectItems.filter(({ item }) => item.itemId && !projectMasterIds.has(item.itemId));
  const projectItemsMissingBom = projectItems.filter(({ item }) => item.itemId && projectMasterIds.has(item.itemId) && !projectIdsWithBom.has(item.itemId));
  const productItemsMissingBeauticianRaw = productItems.filter(({ item }) => !item.beauticianId);
  const projectItemsMissingBeauticianRaw = projectItems.filter(({ item }) => !item.beauticianId);
  const productItemsMissingBeautician = productItemsMissingBeauticianRaw.filter(({ item }) => !confirmedManualExceptionIds.has(item.id));
  const projectItemsMissingBeautician = projectItemsMissingBeauticianRaw.filter(({ item }) => !confirmedManualExceptionIds.has(item.id));
  const marginItemsMissingCommissionRaw = allMarginItems.filter(({ item }) => !orderItemIdsWithCommission.has(item.id));
  const marginItemsMissingCommission = marginItemsMissingCommissionRaw.filter(({ item }) => !confirmedManualExceptionIds.has(item.id));
  const confirmedExceptionCommissionGaps = marginItemsMissingCommissionRaw.length - marginItemsMissingCommission.length;
  const confirmedExceptionAssigneeGaps =
    productItemsMissingBeauticianRaw.length + projectItemsMissingBeauticianRaw.length - productItemsMissingBeautician.length - projectItemsMissingBeautician.length;

  checks.push({
    key: 'margin_source_orders',
    status: allMarginItems.length ? 'pass' : 'fail',
    message: allMarginItems.length ? 'Product/project margin source orders exist.' : 'No product/project order items found for readiness period.',
    evidence: {
      orderCount: orders.length,
      productOrderItemCount: productItems.length,
      projectOrderItemCount: projectItems.length,
    },
  });
  checks.push({
    key: 'product_cost_data',
    status: productItemsMissingCost.length ? 'fail' : 'pass',
    message: productItemsMissingCost.length ? 'Some product items are missing product cost.' : 'Product item costs are available.',
    evidence: { missing: productItemsMissingCost.length, total: productItems.length },
    nextStep: productItemsMissingCost.length ? 'Fill product costs or accept missing-cost quality flags before business sign-off.' : undefined,
  });
  checks.push({
    key: 'project_master_data',
    status: projectItemsMissingProjectMaster.length ? 'warn' : 'pass',
    message: projectItemsMissingProjectMaster.length
      ? 'Some project order items reference missing project master records.'
      : 'Project order items can be linked to project master records.',
    evidence: { missing: projectItemsMissingProjectMaster.length, total: projectItems.length },
    nextStep: projectItemsMissingProjectMaster.length
      ? 'Confirm whether missing project references should be repaired or marked as historical data gaps.'
      : undefined,
  });
  checks.push({
    key: 'project_bom_data',
    status: projectItemsMissingBom.length ? 'warn' : 'pass',
    message: projectItemsMissingBom.length ? 'Some project items are missing BOM data.' : 'Project BOM data is available.',
    evidence: { missing: projectItemsMissingBom.length, total: projectItems.length },
    nextStep: projectItemsMissingBom.length ? 'Complete project BOM or mark historical gap before interpreting project margins.' : undefined,
  });
  checks.push({
    key: 'assignee_data',
    status: productItemsMissingBeautician.length || projectItemsMissingBeautician.length ? 'fail' : 'pass',
    message:
      productItemsMissingBeautician.length || projectItemsMissingBeautician.length
        ? 'Some product/project items are missing beautician ownership.'
        : 'Product/project item ownership is complete.',
    evidence: {
      productMissingBeautician: productItemsMissingBeautician.length,
      projectMissingBeautician: projectItemsMissingBeautician.length,
      rawProductMissingBeautician: productItemsMissingBeauticianRaw.length,
      rawProjectMissingBeautician: projectItemsMissingBeauticianRaw.length,
      confirmedExceptionGaps: confirmedExceptionAssigneeGaps,
      assigneeManualReviewFile: confirmedManualExceptions.file,
    },
    nextStep:
      productItemsMissingBeautician.length || projectItemsMissingBeautician.length
        ? 'Run operation-profit:assignee-audit, confirm assignments, then dry-run operation-profit:assignee-backfill.'
        : undefined,
  });
  checks.push({
    key: 'commission_data',
    status: marginItemsMissingCommission.length ? 'warn' : 'pass',
    message: marginItemsMissingCommission.length ? 'Some product/project items are missing commission records.' : 'Commission records are linked to margin items.',
    evidence: { missing: marginItemsMissingCommission.length, total: allMarginItems.length, confirmedExceptionGaps: confirmedExceptionCommissionGaps },
    nextStep: marginItemsMissingCommission.length ? 'After ownership is fixed, run operation-profit:backfill dry-run.' : undefined,
  });
  checks.push({
    key: 'commission_rule_coverage',
    status: commissionRuleCoverage.missing.length ? 'warn' : 'pass',
    message: commissionRuleCoverage.missing.length
      ? 'Some product/project items do not match active commission rules.'
      : 'Active commission rules cover product/project margin items.',
    evidence: {
      covered: commissionRuleCoverage.covered.size,
      missing: commissionRuleCoverage.missing.length,
      total: allMarginItems.length,
      activeRuleCount: commissionRules.length,
    },
    nextStep: commissionRuleCoverage.missing.length
      ? 'Create active product/project commission rules for uncovered items before commission backfill and business sign-off.'
      : undefined,
  });

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn');
  const readinessStatus = failed.length ? 'blocked' : warned.length ? 'conditional' : 'ready';

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        readinessStatus,
        storeId: args.storeId ?? null,
        periodMonth: args.periodMonth,
        from: args.from.toISOString(),
        to: args.to.toISOString(),
        summary: {
          pass: checks.filter((check) => check.status === 'pass').length,
          warn: warned.length,
          fail: failed.length,
        },
        checks,
        nextRequiredActions: checks.filter((check) => check.nextStep).map((check) => ({ key: check.key, nextStep: check.nextStep })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
