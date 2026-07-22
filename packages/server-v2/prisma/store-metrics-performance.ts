import { performance } from 'node:perf_hooks';
import { FinanceMetricsService } from '../src/finance-metrics/finance-metrics.service.js';
import { StoreMetricsService } from '../src/store-metrics/store-metrics.service.js';
import { StoreMetricsScriptPrisma } from './store-metrics-script-prisma.js';

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

async function measure(task: () => Promise<unknown>, runs: number) {
  const values: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    await task();
    values.push(performance.now() - startedAt);
  }
  return { runs, minMs: Math.min(...values), avgMs: values.reduce((sum, item) => sum + item, 0) / values.length, p95Ms: percentile(values, 0.95), maxMs: Math.max(...values) };
}

const prisma = new StoreMetricsScriptPrisma();
await prisma.$connect();
try {
  const store = await prisma.store.findFirst({ where: { deletedAt: null }, orderBy: { id: 'asc' }, select: { id: true } });
  if (!store) throw new Error('No active store');
  const service = new StoreMetricsService(prisma as any, new FinanceMetricsService(prisma as any));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  service.invalidate(store.id);
  const cold = await measure(() => service.getOverview(store.id, date, { cache: false, persist: false }), 5);
  await service.getOverview(store.id, date, { persist: false });
  const cached = await measure(() => service.getOverview(store.id, date, { persist: false }), 30);
  const drilldown = await measure(() => service.getDrilldown('reservation.no_show_rate', { storeId: store.id, date, page: 1, pageSize: 20 }), 10);
  console.log(JSON.stringify({ storeId: store.id, date, cold, cached, drilldown, gates: { cachedP95Under800: cached.p95Ms < 800, coldP95Under2000: cold.p95Ms < 2000, drilldownP95Under2000: drilldown.p95Ms < 2000 } }));
} finally {
  await prisma.$disconnect();
}
