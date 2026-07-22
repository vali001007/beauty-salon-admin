import { FinanceMetricsService } from '../src/finance-metrics/finance-metrics.service.js';
import { StoreMetricsService } from '../src/store-metrics/store-metrics.service.js';
import { StoreMetricsScriptPrisma } from './store-metrics-script-prisma.js';

const prisma = new StoreMetricsScriptPrisma();
await prisma.$connect();
try {
  const candidates = await prisma.$queryRawUnsafe<Array<{ storeId: number; day: string; complete: number; estimated: number; unavailable: number; frozen: number }>>(`
    SELECT "storeId", "metricDate"::date::text AS day,
      COUNT(*) FILTER (WHERE "qualityStatus"='complete')::int AS complete,
      COUNT(*) FILTER (WHERE "qualityStatus"='estimated')::int AS estimated,
      COUNT(*) FILTER (WHERE "qualityStatus"='unavailable')::int AS unavailable,
      COUNT(*) FILTER (WHERE "qualityStatus"='frozen')::int AS frozen
    FROM store_metric_snapshot
    GROUP BY "storeId", "metricDate"::date
    ORDER BY frozen DESC, estimated DESC, complete DESC, day DESC
  `);
  const selected: typeof candidates = [];
  for (const predicate of [
    (item: typeof candidates[number]) => item.frozen > 0,
    (item: typeof candidates[number]) => item.estimated > 0,
    (item: typeof candidates[number]) => item.complete >= 5,
    (item: typeof candidates[number]) => item.unavailable >= 8,
  ]) {
    const match = candidates.find((item) => predicate(item) && !selected.some((existing) => existing.storeId === item.storeId && existing.day === item.day));
    if (match) selected.push(match);
  }
  for (const candidate of candidates) {
    if (selected.length >= 4) break;
    if (!selected.some((existing) => existing.storeId === candidate.storeId && existing.day === candidate.day)) selected.push(candidate);
  }
  const service = new StoreMetricsService(prisma as any, new FinanceMetricsService(prisma as any));
  const cases = [];
  for (const sample of selected) {
    const overview = await service.getOverview(sample.storeId, sample.day, { cache: false, persist: false });
    const snapshots = await prisma.storeMetricSnapshot.findMany({ where: { storeId: sample.storeId, metricDate: new Date(`${sample.day}T00:00:00+08:00`) }, orderBy: { metricKey: 'asc' } });
    const start = new Date(`${sample.day}T00:00:00+08:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const [reservationIds, orderIds, taskIds, cardIds] = await Promise.all([
      prisma.reservation.findMany({ where: { storeId: sample.storeId, date: { gte: start, lt: end } }, select: { id: true }, take: 10 }).then((rows) => rows.map((row) => row.id)),
      prisma.productOrder.findMany({ where: { storeId: sample.storeId, createdAt: { gte: start, lt: end } }, select: { id: true }, take: 10 }).then((rows) => rows.map((row) => row.id)),
      prisma.serviceTask.findMany({ where: { storeId: sample.storeId, appointmentTime: { gte: start, lt: end } }, select: { id: true }, take: 10 }).then((rows) => rows.map((row) => row.id)),
      prisma.customerCard.findMany({ where: { customer: { storeId: sample.storeId }, createdAt: { gte: start, lt: end } }, select: { id: true }, take: 10 }).then((rows) => rows.map((row) => row.id)),
    ]);
    const checks = snapshots.map((snapshot) => {
      const fresh = overview.metrics.find((metric) => metric.key === snapshot.metricKey);
      const value = snapshot.value === null ? null : Number(snapshot.value);
      const numerator = snapshot.numerator === null ? null : Number(snapshot.numerator);
      const denominator = snapshot.denominator === null ? null : Number(snapshot.denominator);
      const directMetric = ['store.paid_revenue.today', 'store.operating_revenue.today'].includes(snapshot.metricKey);
      const recomputed = directMetric ? numerator : denominator !== null && denominator > 0 && numerator !== null ? numerator / denominator : null;
      const arithmeticPass = value === null ? recomputed === null : recomputed !== null && Math.abs(value - recomputed) < 0.011;
      const freshPass = fresh?.value === null ? value === null : fresh !== undefined && value !== null && Math.abs(fresh.value - value) < 0.011;
      const estimatedSnapshot = snapshot.sourceVersion === 'store_metrics_estimated_v1';
      return { metricKey: snapshot.metricKey, value, numerator, denominator, recomputed, quality: snapshot.qualityStatus, sourceVersion: snapshot.sourceVersion, arithmeticPass, freshPass, pass: arithmeticPass && (estimatedSnapshot || freshPass) };
    });
    cases.push({
      storeId: sample.storeId,
      date: sample.day,
      qualitySummary: sample,
      evidenceIds: { reservationIds, orderIds, taskIds, cardIds },
      checks,
      pass: checks.length === 12 && checks.every((item) => item.pass),
    });
  }
  console.log(JSON.stringify({ selectedCases: cases.length, cases, pass: cases.length >= 4 && cases.every((item) => item.pass) }));
} finally {
  await prisma.$disconnect();
}
