import { StoreMetricsScriptPrisma } from './store-metrics-script-prisma.js';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const from = args.get('from') ?? '2025-10-04';
const to = args.get('to') ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
if (args.get('apply') !== 'true' || args.get('yes') !== 'true') throw new Error('Estimated backfill requires --apply --yes');
if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error('Invalid date range');

const prisma = new StoreMetricsScriptPrisma();
await prisma.$connect();
try {
  const before = await prisma.$queryRawUnsafe<Array<{ count: number }>>('SELECT COUNT(*)::int AS count FROM store_metric_snapshot');
  await prisma.$executeRawUnsafe(`
    WITH active_dates AS (
      SELECT DISTINCT source.store_id, source.business_day
      FROM (
        SELECT "storeId" store_id, (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date AS business_day FROM "Reservation"
        UNION ALL SELECT "storeId", (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date FROM "ProductOrder" WHERE "storeId" IS NOT NULL
        UNION ALL SELECT "storeId", (("verifiedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date FROM "CardUsageRecord"
        UNION ALL SELECT "storeId", (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date FROM "Schedule"
        UNION ALL SELECT "storeId", (("appointmentTime" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date FROM "ServiceTask"
      ) source
      WHERE source.business_day BETWEEN DATE '${from}' AND DATE '${to}'
    ), facts AS (
      SELECT d.store_id, d.business_day,
        COALESCE((SELECT SUM(pr.amount) FROM "PaymentRecord" pr JOIN "ProductOrder" po ON po.id=pr."orderId" WHERE po."storeId"=d.store_id AND pr.status IN ('success','completed','paid') AND (((pr."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day),0)
        - COALESCE((SELECT SUM(rr.amount) FROM "RefundRecord" rr JOIN "ProductOrder" po ON po.id=rr."orderId" WHERE po."storeId"=d.store_id AND rr.status IN ('success','completed','refunded','paid') AND (((rr."refundedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day),0) paid_revenue,
        COALESCE((SELECT SUM(oi."netAmount") FROM "OrderItem" oi JOIN "ProductOrder" po ON po.id=oi."orderId" WHERE po."storeId"=d.store_id AND (((COALESCE(oi."recognizedAt",oi."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day),0)
        + COALESCE((SELECT SUM(cur."recognizedAmount") FROM "CardUsageRecord" cur WHERE cur."storeId"=d.store_id AND ((((cur."verifiedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day)),0) operating_revenue,
        (SELECT COUNT(*) FROM "Reservation" r WHERE r."storeId"=d.store_id AND (((r.date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day AND r.status <> 'cancelled') reservation_total,
        (SELECT COUNT(*) FROM "Reservation" r WHERE r."storeId"=d.store_id AND (((r.date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day AND (r."checkedInAt" IS NOT NULL OR r.status IN ('checked_in','completed'))) arrival_total,
        (SELECT COUNT(*) FROM "Reservation" r WHERE r."storeId"=d.store_id AND (((r.date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day AND r.status='completed') completed_total,
        (SELECT COUNT(*) FROM "Reservation" r WHERE r."storeId"=d.store_id AND (((r.date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day AND r.status IN ('no_show','cancelled')) no_show_total,
        COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (s."endTime"::time-s."startTime"::time))/60) FROM "Schedule" s WHERE s."storeId"=d.store_id AND (((s.date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day AND s.status IN ('available','working','published')),0) available_minutes,
        COALESCE((SELECT SUM(COALESCE(EXTRACT(EPOCH FROM (st."completedAt"-st."startedAt"))/60,st.duration)) FROM "ServiceTask" st WHERE st."storeId"=d.store_id AND (((st."appointmentTime" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date)=d.business_day AND st.status='completed'),0) actual_minutes,
        (SELECT COUNT(*) FROM "CustomerCard" cc JOIN "Customer" c ON c.id=cc."customerId" WHERE c."storeId"=d.store_id AND (cc."expiryDate" < (date_trunc('month',d.business_day)+interval '1 month') OR cc."remainingTimes" <= CEIL(cc."totalTimes"*0.2))) renewal_candidates,
        (SELECT COUNT(*) FROM "CustomerCard" cc JOIN "Customer" c ON c.id=cc."customerId" WHERE c."storeId"=d.store_id AND cc."saleType"='renewal' AND cc."createdAt" >= date_trunc('month',d.business_day) AND cc."createdAt" < date_trunc('month',d.business_day)+interval '1 month') renewals
      FROM active_dates d
    ), metrics(metric_key, unit_name) AS (VALUES
      ('store.paid_revenue.today','direct'),('store.operating_revenue.today','direct'),('store.gross_margin_rate.today','ratio'),
      ('customer.first_visit_arrival_rate','ratio'),('customer.first_visit_conversion_rate','ratio'),('customer.new_customer_30d_repurchase_rate','ratio'),
      ('reservation.checkout_rebooking_rate','ratio'),('reservation.no_show_rate','ratio'),('staff.service_time_utilization_rate','ratio'),
      ('staff.operating_revenue_per_service_hour','ratio'),('member.renewal_rate','ratio'),('store.monthly_target_completion_rate','ratio')
    ), values_to_insert AS (
      SELECT f.*, m.metric_key,
        CASE m.metric_key
          WHEN 'store.paid_revenue.today' THEN f.paid_revenue
          WHEN 'store.operating_revenue.today' THEN f.operating_revenue
          WHEN 'customer.first_visit_arrival_rate' THEN CASE WHEN f.reservation_total>0 THEN f.arrival_total::numeric/f.reservation_total END
          WHEN 'reservation.no_show_rate' THEN CASE WHEN f.reservation_total>0 THEN f.no_show_total::numeric/f.reservation_total END
          WHEN 'staff.service_time_utilization_rate' THEN CASE WHEN f.available_minutes>0 THEN f.actual_minutes/f.available_minutes END
          WHEN 'staff.operating_revenue_per_service_hour' THEN CASE WHEN f.actual_minutes>0 THEN f.operating_revenue/(f.actual_minutes/60) END
          WHEN 'member.renewal_rate' THEN CASE WHEN f.renewal_candidates>0 THEN f.renewals::numeric/f.renewal_candidates END
          ELSE NULL END metric_value,
        CASE m.metric_key
          WHEN 'store.paid_revenue.today' THEN f.paid_revenue WHEN 'store.operating_revenue.today' THEN f.operating_revenue
          WHEN 'customer.first_visit_arrival_rate' THEN f.arrival_total WHEN 'reservation.no_show_rate' THEN f.no_show_total
          WHEN 'staff.service_time_utilization_rate' THEN f.actual_minutes WHEN 'staff.operating_revenue_per_service_hour' THEN f.operating_revenue
          WHEN 'member.renewal_rate' THEN f.renewals ELSE NULL END numerator,
        CASE m.metric_key
          WHEN 'customer.first_visit_arrival_rate' THEN f.reservation_total WHEN 'reservation.no_show_rate' THEN f.reservation_total
          WHEN 'staff.service_time_utilization_rate' THEN f.available_minutes WHEN 'staff.operating_revenue_per_service_hour' THEN f.actual_minutes/60
          WHEN 'member.renewal_rate' THEN f.renewal_candidates ELSE NULL END denominator
      FROM facts f CROSS JOIN metrics m
    )
    INSERT INTO store_metric_snapshot ("storeId","metricKey","metricDate",granularity,value,numerator,denominator,"sampleCount","qualityStatus","qualityReasons","definitionVersion","calculationMode","sourceVersion","generatedAt")
    SELECT store_id, metric_key, business_day::timestamp-interval '8 hours','day',metric_value,numerator,denominator,COALESCE(denominator,0)::int,
      CASE WHEN metric_value IS NULL THEN 'unavailable' ELSE 'estimated' END,
      CASE WHEN metric_value IS NULL THEN '["historical_explicit_relation_missing"]'::jsonb ELSE '["historical_sql_inference"]'::jsonb END,
      1,'backfill','store_metrics_estimated_v1',NOW()
    FROM values_to_insert
    ON CONFLICT ("storeId","metricKey","metricDate",granularity,"definitionVersion") DO NOTHING
  `);
  const after = await prisma.$queryRawUnsafe<Array<{ count: number; dates: number }>>('SELECT COUNT(*)::int AS count, COUNT(DISTINCT ("storeId","metricDate"))::int AS dates FROM store_metric_snapshot');
  console.log(JSON.stringify({ mode: 'applied', from, to, before: before[0].count, after: after[0].count, inserted: after[0].count - before[0].count, dates: after[0].dates }));
} finally {
  await prisma.$disconnect();
}
