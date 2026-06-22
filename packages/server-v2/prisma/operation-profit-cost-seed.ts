import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type CostSeedArgs = {
  storeId: number;
  periodMonth: string;
  costDate: Date;
  createdBy?: number;
  apply: boolean;
  yes: boolean;
};

type PlannedCost = {
  storeId: number;
  periodMonth: string;
  costDate: string;
  category: string;
  amount: number;
  allocationType: string;
  remark: string;
  createdBy?: number;
};

type TableExistsResult = {
  exists: boolean;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

const DEFAULT_COSTS = [
  { category: 'rent', label: '房租物业', amount: 12000 },
  { category: 'salary', label: '固定工资', amount: 30000 },
  { category: 'marketing', label: '营销成本', amount: 5000 },
  { category: 'utilities', label: '水电杂费', amount: 2500 },
  { category: 'depreciation', label: '折旧摊销', amount: 3500 },
  { category: 'other', label: '其他费用', amount: 2000 },
];

function parseArgs(): CostSeedArgs {
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--') && !arg.includes('=')));
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }

  const storeId = Number(args.get('storeId'));
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new Error('--storeId is required and must be a positive integer');
  }

  const now = new Date();
  const periodMonth = args.get('periodMonth') ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    throw new Error('--periodMonth must be in YYYY-MM format');
  }
  const costDateText = args.get('costDate') ?? `${periodMonth}-01`;
  const costDate = new Date(`${costDateText}T00:00:00.000Z`);
  if (Number.isNaN(costDate.getTime())) {
    throw new Error('--costDate must be a valid date string like 2026-06-01');
  }

  const createdBy = args.get('createdBy') ? Number(args.get('createdBy')) : undefined;
  if (createdBy !== undefined && (!Number.isInteger(createdBy) || createdBy <= 0)) {
    throw new Error('--createdBy must be a positive integer');
  }

  return { storeId, periodMonth, costDate, createdBy, apply: flags.has('--apply'), yes: flags.has('--yes') };
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<TableExistsResult[]>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = current_schema()
        and table_name = ${tableName}
    ) as "exists"
  `;
  return Boolean(rows[0]?.exists);
}

function printMigrationRequired(args: CostSeedArgs, store: { id: number; name: string; status: string }) {
  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        store,
        periodMonth: args.periodMonth,
        status: 'migration_required',
        schemaPrecheck: {
          table: 'OperatingCost',
          exists: false,
        },
        message: 'OperatingCost table does not exist in the current database. Run Prisma migration before seeding operation costs.',
        nextStep: 'Run npm.cmd --prefix packages/server-v2 run db:migrate:prod against the intended test database after confirmation.',
      },
      null,
      2,
    ),
  );
}

async function main() {
  const args = parseArgs();
  if (args.apply && !args.yes) {
    throw new Error('写入经营成本必须同时传入 --apply --yes；不传 --apply 时只 dry-run。');
  }

  const store = await prisma.store.findUnique({ where: { id: args.storeId }, select: { id: true, name: true, status: true } });
  if (!store) {
    throw new Error(`Store not found: ${args.storeId}`);
  }

  if (!(await tableExists('OperatingCost'))) {
    printMigrationRequired(args, store);
    return;
  }

  let existing: { id: number; category: string; amount: unknown; remark: string | null }[] = [];
  try {
    existing = await prisma.operatingCost.findMany({
      where: { storeId: args.storeId, periodMonth: args.periodMonth },
      select: { id: true, category: true, amount: true, remark: true },
      orderBy: { id: 'asc' },
    });
  } catch (error: any) {
    if (error?.code === 'P2021') {
      printMigrationRequired(args, store);
      return;
    }
    throw error;
  }
  const existingCategories = new Set(existing.map((item) => item.category));
  const planned: PlannedCost[] = DEFAULT_COSTS.filter((item) => !existingCategories.has(item.category)).map((item) => ({
    storeId: args.storeId,
    periodMonth: args.periodMonth,
    costDate: args.costDate.toISOString(),
    category: item.category,
    amount: item.amount,
    allocationType: 'store_month',
    remark: `经营利润验收样例-${item.label}`,
    ...(args.createdBy ? { createdBy: args.createdBy } : {}),
  }));

  const created: any[] = [];
  if (args.apply) {
    for (const item of planned) {
      const record = await prisma.operatingCost.create({
        data: {
          storeId: item.storeId,
          periodMonth: item.periodMonth,
          costDate: new Date(item.costDate),
          category: item.category,
          amount: item.amount,
          allocationType: item.allocationType,
          remark: item.remark,
          ...(item.createdBy ? { createdBy: item.createdBy } : {}),
        },
        select: { id: true, storeId: true, periodMonth: true, category: true, amount: true },
      });
      created.push(record);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        store,
        periodMonth: args.periodMonth,
        costDate: args.costDate.toISOString(),
        summary: {
          existingCosts: existing.length,
          plannedCosts: planned.length,
          createdCosts: created.length,
          skippedExistingCategories: existing.length,
          plannedAmount: planned.reduce((sum, item) => sum + item.amount, 0),
          existingAmount: existing.reduce((sum, item) => sum + Number(item.amount), 0),
        },
        existing,
        planned,
        created,
        nextStep: args.apply
          ? 'Open /operation-profit/costs and /operation-profit/overview to verify cost visibility.'
          : 'Review planned costs. Re-run with --apply --yes only after confirming this is a test or trial store.',
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
