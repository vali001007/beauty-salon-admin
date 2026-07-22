import { FinanceMetricsService } from '../src/finance-metrics/finance-metrics.service.js';
import { StoreMetricsService } from '../src/store-metrics/store-metrics.service.js';
import { StoreMetricsScriptPrisma } from './store-metrics-script-prisma.js';

type Args = { apply: boolean; yes: boolean; from: string; to: string; storeId?: number; concurrency: number };

function parseArgs(): Args {
  const values = new Map(process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }));
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    apply: values.get('apply') === 'true',
    yes: values.get('yes') === 'true',
    from: values.get('from') ?? '2025-10-04',
    to: values.get('to') ?? yesterday,
    storeId: values.has('storeId') ? Number(values.get('storeId')) : undefined,
    concurrency: Math.max(1, Math.min(8, Number(values.get('concurrency') ?? 4))),
  };
}

async function activeDates(prisma: StoreMetricsScriptPrisma, args: Args) {
  const storeFilter = args.storeId ? `AND source."storeId" = ${args.storeId}` : '';
  return prisma.$queryRawUnsafe<Array<{ storeId: number; day: string }>>(`
    SELECT DISTINCT source."storeId", source.day::text AS day
    FROM (
      SELECT "storeId", ("date" AT TIME ZONE 'Asia/Shanghai')::date AS day FROM "Reservation"
      UNION ALL SELECT "storeId", ("createdAt" AT TIME ZONE 'Asia/Shanghai')::date FROM "ProductOrder" WHERE "storeId" IS NOT NULL
      UNION ALL SELECT "storeId", ("verifiedAt" AT TIME ZONE 'Asia/Shanghai')::date FROM "CardUsageRecord"
      UNION ALL SELECT "storeId", ("date" AT TIME ZONE 'Asia/Shanghai')::date FROM "Schedule"
      UNION ALL SELECT "storeId", ("appointmentTime" AT TIME ZONE 'Asia/Shanghai')::date FROM "ServiceTask"
      UNION ALL SELECT po."storeId", (pr."paidAt" AT TIME ZONE 'Asia/Shanghai')::date FROM "PaymentRecord" pr JOIN "ProductOrder" po ON po.id=pr."orderId" WHERE po."storeId" IS NOT NULL AND pr."paidAt" IS NOT NULL
      UNION ALL SELECT po."storeId", (rr."refundedAt" AT TIME ZONE 'Asia/Shanghai')::date FROM "RefundRecord" rr JOIN "ProductOrder" po ON po.id=rr."orderId" WHERE po."storeId" IS NOT NULL AND rr."refundedAt" IS NOT NULL
      UNION ALL SELECT "storeId", ("settleDate" AT TIME ZONE 'Asia/Shanghai')::date FROM "DailySettlementSnapshot" WHERE "supersededAt" IS NULL
    ) source
    WHERE source.day BETWEEN DATE '${args.from}' AND DATE '${args.to}' ${storeFilter}
    ORDER BY 1, 2
  `);
}

const args = parseArgs();
if (args.apply && !args.yes) throw new Error('Applying store metric backfill requires --apply --yes');
if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from) || !/^\d{4}-\d{2}-\d{2}$/.test(args.to) || args.from > args.to) {
  throw new Error('Invalid --from/--to date range');
}

const prisma = new StoreMetricsScriptPrisma();
await prisma.$connect();
try {
  const stores = await prisma.store.findMany({
    where: { deletedAt: null, ...(args.storeId ? { id: args.storeId } : {}) },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  const dateRows = await activeDates(prisma, args);
  const planned = dateRows.length * 12;
  if (!args.apply) {
    console.log(JSON.stringify({ mode: 'dry-run', stores, from: args.from, to: args.to, activeStoreDates: dateRows.length, plannedSnapshots: planned, concurrency: args.concurrency }));
    process.exitCode = 0;
  } else {
    const finance = new FinanceMetricsService(prisma as any);
    const service = new StoreMetricsService(prisma as any, finance);
    const financeOverrides = new Map<string, { dailyFinance: any; monthlyFinance: any; confirmedSnapshot: boolean }>();
    for (const store of stores) {
      const [live, confirmed] = await Promise.all([
        finance.getDailyMetrics({ storeId: store.id, dateFrom: args.from, dateTo: args.to, mode: 'live' }),
        finance.getDailyMetrics({ storeId: store.id, dateFrom: args.from, dateTo: args.to, mode: 'confirmed' }),
      ]);
      const liveByDate = new Map(live.items.map((item) => [item.date, item]));
      const confirmedByDate = new Map(confirmed.items.map((item) => [item.date, item]));
      for (const row of dateRows.filter((item) => item.storeId === store.id)) {
        const liveItem = liveByDate.get(row.day)!;
        const confirmedItem = confirmedByDate.get(row.day);
        const monthPrefix = row.day.slice(0, 7);
        const monthItems = live.items.filter((item) => item.date.startsWith(monthPrefix) && item.date <= row.day);
        const monthlySummary = {
          operatingRevenue: monthItems.reduce((sum, item) => sum + item.operatingRevenue, 0),
          orderCount: monthItems.reduce((sum, item) => sum + item.orderCount, 0),
        };
        financeOverrides.set(`${store.id}:${row.day}`, {
          dailyFinance: { summary: confirmedItem ?? liveItem },
          monthlyFinance: { summary: monthlySummary },
          confirmedSnapshot: Boolean(confirmedItem),
        });
      }
    }
    const quality: Record<string, number> = {};
    let nextIndex = 0;
    let completedDates = 0;
    const workers = Array.from({ length: args.concurrency }, async () => {
      while (nextIndex < dateRows.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = dateRows[index];
        const overview = await service.rebuildSnapshot(item.storeId, item.day, financeOverrides.get(`${item.storeId}:${item.day}`));
        for (const metric of overview.metrics) quality[metric.quality.status] = (quality[metric.quality.status] ?? 0) + 1;
        completedDates += 1;
        if (completedDates % 10 === 0) console.log(JSON.stringify({ progress: completedDates, totalDates: dateRows.length }));
      }
    });
    await Promise.all(workers);
    const snapshotCount = await prisma.storeMetricSnapshot.count({
      where: {
        ...(args.storeId ? { storeId: args.storeId } : {}),
        metricDate: { gte: new Date(`${args.from}T00:00:00+08:00`), lt: new Date(new Date(`${args.to}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000) },
      },
    });
    console.log(JSON.stringify({ mode: 'applied', stores, from: args.from, to: args.to, completedDates, quality, snapshotCount }));
  }
} finally {
  await prisma.$disconnect();
}
