-- Expand the existing Ask-only customer profile with governed behavior facts.
-- Exact birthday, phone, tags, health information and raw lifecycle evidence remain excluded.
CREATE OR REPLACE VIEW ask_data_customer_profile_summary_view AS
WITH order_summary AS (
  SELECT
    orders."storeId" AS store_id,
    orders."customerId" AS customer_id,
    MIN(orders."createdAt") FILTER (WHERE orders."status" NOT IN ('cancelled', 'void')) AS first_order_at,
    MAX(orders."createdAt") FILTER (WHERE orders."status" NOT IN ('cancelled', 'void')) AS last_order_at,
    COUNT(*) FILTER (WHERE orders."status" NOT IN ('cancelled', 'void'))::integer AS order_count,
    COALESCE(SUM(orders."netAmount") FILTER (WHERE orders."status" NOT IN ('cancelled', 'void')), 0)::numeric AS total_paid_amount
  FROM "ProductOrder" orders
  WHERE orders."storeId" IS NOT NULL AND orders."customerId" IS NOT NULL
  GROUP BY orders."storeId", orders."customerId"
),
reservation_summary AS (
  SELECT
    reservation."storeId" AS store_id,
    reservation."customerId" AS customer_id,
    MIN(reservation."date") AS first_reservation_at,
    MAX(reservation."date") AS last_reservation_at,
    COUNT(*)::integer AS reservation_count,
    COUNT(*) FILTER (WHERE reservation."status" IN ('checked_in', 'completed'))::integer AS completed_reservation_count,
    MIN(reservation."date") FILTER (WHERE reservation."status" IN ('checked_in', 'completed')) AS first_completed_visit_at,
    MAX(reservation."date") FILTER (WHERE reservation."status" IN ('checked_in', 'completed')) AS last_completed_visit_at
  FROM "Reservation" reservation
  GROUP BY reservation."storeId", reservation."customerId"
),
card_summary AS (
  SELECT
    customer."storeId" AS store_id,
    card."customerId" AS customer_id,
    COUNT(*) FILTER (WHERE card."status" = 'active' AND card."expiryDate" >= CURRENT_DATE)::integer AS active_card_count,
    COALESCE(SUM(card."remainingTimes") FILTER (WHERE card."status" = 'active' AND card."expiryDate" >= CURRENT_DATE), 0)::integer AS remaining_card_times,
    COUNT(*) FILTER (
      WHERE card."status" = 'active'
        AND card."expiryDate" >= CURRENT_DATE
        AND card."remainingTimes" = card."totalTimes"
    )::integer AS unused_card_count,
    COUNT(*) FILTER (
      WHERE card."status" = 'active'
        AND card."expiryDate" >= CURRENT_DATE
        AND card."remainingTimes" BETWEEN 1 AND 2
    )::integer AS low_remaining_card_count,
    MIN(card."createdAt") AS first_card_purchase_at,
    MAX(card."createdAt") AS last_card_purchase_at
  FROM "CustomerCard" card
  JOIN "Customer" customer ON customer."id" = card."customerId"
  GROUP BY customer."storeId", card."customerId"
),
usage_summary AS (
  SELECT
    COALESCE(usage."storeId", customer."storeId") AS store_id,
    usage."customerId" AS customer_id,
    COALESCE(SUM(usage."times"), 0)::integer AS card_usage_times,
    MAX(usage."verifiedAt") AS last_card_usage_at
  FROM "CardUsageRecord" usage
  JOIN "Customer" customer ON customer."id" = usage."customerId"
  GROUP BY COALESCE(usage."storeId", customer."storeId"), usage."customerId"
)
SELECT
  customer."storeId" AS store_id,
  store."name" AS store_name,
  customer."id" AS customer_id,
  CASE
    WHEN customer."name" IS NULL OR customer."name" = '' THEN NULL
    ELSE concat(left(customer."name", 1), '***')
  END AS customer_name_masked,
  customer."memberLevel" AS member_level,
  GREATEST(customer."lastVisitDate", reservation.last_completed_visit_at, orders.last_order_at)::timestamp(3) AS last_visit_at,
  orders.last_order_at,
  COALESCE(orders.total_paid_amount, customer."totalSpent", 0)::decimal(65, 30) AS total_paid_amount,
  COALESCE(orders.order_count, 0)::integer AS order_count,
  NULLIF(customer."source", '') AS source_channel,
  CASE
    WHEN customer."birthday" IS NULL THEN 'unknown'
    WHEN date_part('year', age(CURRENT_DATE, customer."birthday")) < 25 THEN 'under_25'
    WHEN date_part('year', age(CURRENT_DATE, customer."birthday")) < 35 THEN '25_34'
    WHEN date_part('year', age(CURRENT_DATE, customer."birthday")) < 45 THEN '35_44'
    WHEN date_part('year', age(CURRENT_DATE, customer."birthday")) < 55 THEN '45_54'
    ELSE '55_plus'
  END AS age_band,
  CASE
    WHEN birthday.this_birthday IS NULL THEN NULL
    WHEN birthday.this_birthday >= CURRENT_DATE THEN birthday.this_birthday
    ELSE (birthday.this_birthday + INTERVAL '1 year')::date
  END AS next_birthday_date,
  CASE
    WHEN birthday.this_birthday IS NULL THEN NULL
    WHEN birthday.this_birthday >= CURRENT_DATE THEN birthday.this_birthday - CURRENT_DATE
    ELSE (birthday.this_birthday + INTERVAL '1 year')::date - CURRENT_DATE
  END::integer AS days_until_birthday,
  orders.first_order_at,
  reservation.first_reservation_at,
  reservation.last_reservation_at,
  COALESCE(reservation.reservation_count, 0)::integer AS reservation_count,
  COALESCE(reservation.completed_reservation_count, 0)::integer AS completed_reservation_count,
  CASE
    WHEN GREATEST(customer."lastVisitDate", reservation.last_completed_visit_at, orders.last_order_at) IS NULL THEN NULL
    ELSE CURRENT_DATE - GREATEST(customer."lastVisitDate", reservation.last_completed_visit_at, orders.last_order_at)::date
  END::integer AS days_since_last_visit,
  CASE
    WHEN COALESCE(reservation.completed_reservation_count, 0) <= 1 THEN NULL
    ELSE ROUND(
      (reservation.last_completed_visit_at::date - reservation.first_completed_visit_at::date)::numeric
      / NULLIF(reservation.completed_reservation_count - 1, 0),
      2
    )
  END AS average_return_interval_days,
  COALESCE(cards.active_card_count, 0)::integer AS active_card_count,
  COALESCE(cards.remaining_card_times, 0)::integer AS remaining_card_times,
  COALESCE(cards.unused_card_count, 0)::integer AS unused_card_count,
  COALESCE(cards.low_remaining_card_count, 0)::integer AS low_remaining_card_count,
  cards.first_card_purchase_at,
  cards.last_card_purchase_at,
  COALESCE(usage.card_usage_times, 0)::integer AS card_usage_times,
  usage.last_card_usage_at,
  lifecycle."lifecycleStage" AS lifecycle_stage,
  lifecycle."ltvTier" AS ltv_tier,
  lifecycle."churnRiskLevel" AS churn_risk_level,
  CASE
    WHEN GREATEST(customer."lastVisitDate", reservation.last_completed_visit_at, orders.last_order_at) < CURRENT_DATE - INTERVAL '90 days'
      THEN 'inactive'
    WHEN COALESCE(orders.order_count, 0) = 0 THEN 'prospect'
    WHEN COALESCE(orders.order_count, 0) = 1 THEN 'new'
    ELSE 'repeat'
  END AS customer_status,
  GREATEST(customer."updatedAt", orders.last_order_at, reservation.last_reservation_at, usage.last_card_usage_at, lifecycle."computedAt") AS data_as_of
FROM "Customer" customer
JOIN "Store" store ON store."id" = customer."storeId"
LEFT JOIN order_summary orders
  ON orders.store_id = customer."storeId" AND orders.customer_id = customer."id"
LEFT JOIN reservation_summary reservation
  ON reservation.store_id = customer."storeId" AND reservation.customer_id = customer."id"
LEFT JOIN card_summary cards
  ON cards.store_id = customer."storeId" AND cards.customer_id = customer."id"
LEFT JOIN usage_summary usage
  ON usage.store_id = customer."storeId" AND usage.customer_id = customer."id"
LEFT JOIN "CustomerLifecycleSnapshot" lifecycle
  ON lifecycle."storeId" = customer."storeId" AND lifecycle."customerId" = customer."id"
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN customer."birthday" IS NULL THEN NULL
    ELSE (
      customer."birthday"::date
      + make_interval(
          years => extract(year FROM CURRENT_DATE)::integer
            - extract(year FROM customer."birthday")::integer
        )
    )::date
  END AS this_birthday
) birthday ON TRUE
WHERE customer."deletedAt" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON ask_data_customer_profile_summary_view TO ask_data_free_sql_readonly;
  END IF;
END
$$;
