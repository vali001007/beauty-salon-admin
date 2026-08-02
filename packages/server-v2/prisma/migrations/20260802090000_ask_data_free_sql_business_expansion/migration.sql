-- Repair two existing semantic views whose store scope no longer matches the
-- current management-side schema.
CREATE OR REPLACE VIEW agent_v3_marketing_activity_view AS
SELECT
  ma."storeId" AS store_id,
  s."name" AS store_name,
  ma."id" AS activity_id,
  ma."title" AS activity_title,
  ma."status",
  ma."publishStatus" AS publish_status,
  ma."startDate" AS start_at,
  ma."endDate" AS end_at,
  ma."participants",
  ma."conversion"
FROM "MarketingActivity" ma
JOIN "Store" s ON s."id" = ma."storeId";

CREATE OR REPLACE VIEW agent_v3_promotion_offer_view AS
SELECT
  s."id" AS store_id,
  s."name" AS store_name,
  p."id" AS promotion_id,
  p."name" AS promotion_name,
  p."type",
  p."scenario",
  p."discountText" AS discount_text,
  p."issuedCount" AS issued_count,
  p."usedCount" AS used_count,
  p."status",
  p."startAt" AS start_at,
  p."endAt" AS end_at,
  CASE WHEN p."storeId" IS NULL THEN 'global' ELSE 'store' END AS scope_type
FROM "Promotion" p
JOIN "Store" s ON p."storeId" = s."id" OR p."storeId" IS NULL;

CREATE VIEW ask_data_confirmed_profit_view AS
WITH latest_confirmed AS (
  SELECT DISTINCT ON (close."storeId", close."periodMonth")
    close.*
  FROM "MonthlyProfitClose" close
  WHERE close."status" = 'confirmed'
  ORDER BY close."storeId", close."periodMonth", close."version" DESC
)
SELECT
  close."storeId" AS store_id,
  store."name" AS store_name,
  to_date(close."periodMonth" || '-01', 'YYYY-MM-DD') AS period_month,
  close."version",
  close."operatingRevenue" AS operating_revenue,
  close."materialCost" AS material_cost,
  close."productCost" AS product_cost,
  close."commissionCost" AS commission_cost,
  close."operatingCost" AS operating_cost,
  close."grossProfit" AS gross_profit,
  close."operatingProfit" AS operating_profit,
  CASE
    WHEN close."operatingRevenue" = 0 THEN NULL
    ELSE close."grossProfit" / close."operatingRevenue"
  END AS gross_margin_rate,
  CASE
    WHEN close."operatingRevenue" = 0 THEN NULL
    ELSE close."operatingProfit" / close."operatingRevenue"
  END AS operating_margin_rate,
  close."confirmedAt" AS confirmed_at
FROM latest_confirmed close
JOIN "Store" store ON store."id" = close."storeId";

CREATE VIEW ask_data_reconciliation_issue_view AS
SELECT
  issue."storeId" AS store_id,
  store."name" AS store_name,
  issue."id" AS issue_id,
  issue."businessDate" AS business_date,
  run."status" AS run_status,
  issue."category",
  issue."severity",
  issue."status" AS issue_status,
  issue."title",
  issue."amount",
  issue."firstDetectedAt" AS first_detected_at,
  issue."lastDetectedAt" AS last_detected_at,
  issue."resolvedAt" AS resolved_at
FROM "FinanceReconciliationIssue" issue
JOIN "FinanceReconciliationRun" run ON run."id" = issue."runId"
JOIN "Store" store ON store."id" = issue."storeId";

CREATE VIEW ask_data_member_liability_view AS
WITH latest_confirmed AS (
  SELECT DISTINCT ON (snapshot."storeId", snapshot."snapshotDate")
    snapshot.*
  FROM "MemberLiabilitySnapshot" snapshot
  WHERE snapshot."status" = 'confirmed'
  ORDER BY snapshot."storeId", snapshot."snapshotDate", snapshot."version" DESC
)
SELECT
  snapshot."storeId" AS store_id,
  store."name" AS store_name,
  snapshot."snapshotDate" AS snapshot_date,
  snapshot."version",
  snapshot."cashContractLiability" AS cash_contract_liability,
  snapshot."giftObligation" AS gift_obligation,
  snapshot."cardLiability" AS card_liability,
  (snapshot."cashContractLiability" + snapshot."giftObligation" + snapshot."cardLiability")::numeric AS total_liability,
  snapshot."remainingTimes" AS remaining_times,
  snapshot."additions",
  snapshot."releases",
  snapshot."refunds",
  snapshot."expirations",
  snapshot."adjustments",
  snapshot."confirmedAt" AS confirmed_at
FROM latest_confirmed snapshot
JOIN "Store" store ON store."id" = snapshot."storeId";

CREATE VIEW ask_data_staff_capacity_view AS
WITH schedule_daily AS (
  SELECT
    schedule."storeId" AS store_id,
    schedule."beauticianId" AS staff_id,
    schedule."date"::date AS work_date,
    SUM(
      CASE WHEN schedule."status" IN ('available', 'busy') THEN
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (
            schedule."date"::date + schedule."endTime"::time
            - (schedule."date"::date + schedule."startTime"::time)
          )) / 60
        )
      ELSE 0 END
    )::numeric AS scheduled_minutes,
    SUM(
      CASE WHEN schedule."status" = 'leave' THEN
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (
            schedule."date"::date + schedule."endTime"::time
            - (schedule."date"::date + schedule."startTime"::time)
          )) / 60
        )
      ELSE 0 END
    )::numeric AS leave_minutes
  FROM "Schedule" schedule
  GROUP BY schedule."storeId", schedule."beauticianId", schedule."date"::date
), reservation_daily AS (
  SELECT
    reservation."storeId" AS store_id,
    reservation."beauticianId" AS staff_id,
    reservation."date"::date AS work_date,
    SUM(
      CASE WHEN reservation."status" NOT IN ('cancelled', 'canceled', 'voided', '已取消', '取消') THEN
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (
            reservation."date"::date
              + COALESCE(
                  NULLIF(reservation."endTime", '')::time,
                  reservation."startTime"::time + make_interval(mins => COALESCE(project."duration", 60))
                )
            - (reservation."date"::date + reservation."startTime"::time)
          )) / 60
        )
      ELSE 0 END
    )::numeric AS booked_minutes,
    COUNT(*) FILTER (
      WHERE reservation."status" NOT IN ('cancelled', 'canceled', 'voided', '已取消', '取消')
    )::integer AS reservation_count,
    COUNT(*) FILTER (WHERE reservation."status" = 'completed')::integer AS completed_count,
    COUNT(*) FILTER (
      WHERE reservation."status" IN ('cancelled', 'canceled', 'voided', '已取消', '取消')
    )::integer AS cancelled_count
  FROM "Reservation" reservation
  LEFT JOIN "Project" project ON project."id" = reservation."projectId"
  WHERE reservation."beauticianId" IS NOT NULL
  GROUP BY reservation."storeId", reservation."beauticianId", reservation."date"::date
), capacity_keys AS (
  SELECT store_id, staff_id, work_date FROM schedule_daily
  UNION
  SELECT store_id, staff_id, work_date FROM reservation_daily
)
SELECT
  keys.store_id,
  store."name" AS store_name,
  keys.staff_id,
  beautician."name" AS staff_name,
  keys.work_date,
  COALESCE(schedule.scheduled_minutes, 0)::numeric AS scheduled_minutes,
  COALESCE(schedule.leave_minutes, 0)::numeric AS leave_minutes,
  COALESCE(reservation.booked_minutes, 0)::numeric AS booked_minutes,
  GREATEST(COALESCE(schedule.scheduled_minutes, 0) - COALESCE(reservation.booked_minutes, 0), 0)::numeric AS idle_minutes,
  GREATEST(COALESCE(reservation.booked_minutes, 0) - COALESCE(schedule.scheduled_minutes, 0), 0)::numeric AS overbooked_minutes,
  CASE
    WHEN COALESCE(schedule.scheduled_minutes, 0) = 0 THEN NULL
    ELSE COALESCE(reservation.booked_minutes, 0) / schedule.scheduled_minutes
  END::numeric AS utilization_rate,
  COALESCE(reservation.reservation_count, 0)::integer AS reservation_count,
  COALESCE(reservation.completed_count, 0)::integer AS completed_count,
  COALESCE(reservation.cancelled_count, 0)::integer AS cancelled_count
FROM capacity_keys keys
JOIN "Store" store ON store."id" = keys.store_id
JOIN "Beautician" beautician ON beautician."id" = keys.staff_id
LEFT JOIN schedule_daily schedule
  ON schedule.store_id = keys.store_id
 AND schedule.staff_id = keys.staff_id
 AND schedule.work_date = keys.work_date
LEFT JOIN reservation_daily reservation
  ON reservation.store_id = keys.store_id
 AND reservation.staff_id = keys.staff_id
 AND reservation.work_date = keys.work_date;

CREATE VIEW ask_data_transfer_status_view AS
SELECT
  transfer."fromStoreId" AS store_id,
  source_store."name" AS store_name,
  transfer."id" AS transfer_id,
  transfer."orderNo" AS transfer_no,
  'outbound'::text AS direction,
  transfer."toStoreId" AS counterpart_store_id,
  target_store."name" AS counterpart_store_name,
  transfer."productCount" AS product_count,
  transfer."status",
  transfer."createdAt" AS created_at,
  transfer."updatedAt" AS updated_at
FROM "TransferOrder" transfer
JOIN "Store" source_store ON source_store."id" = transfer."fromStoreId"
JOIN "Store" target_store ON target_store."id" = transfer."toStoreId"
UNION ALL
SELECT
  transfer."toStoreId" AS store_id,
  target_store."name" AS store_name,
  transfer."id" AS transfer_id,
  transfer."orderNo" AS transfer_no,
  'inbound'::text AS direction,
  transfer."fromStoreId" AS counterpart_store_id,
  source_store."name" AS counterpart_store_name,
  transfer."productCount" AS product_count,
  transfer."status",
  transfer."createdAt" AS created_at,
  transfer."updatedAt" AS updated_at
FROM "TransferOrder" transfer
JOIN "Store" source_store ON source_store."id" = transfer."fromStoreId"
JOIN "Store" target_store ON target_store."id" = transfer."toStoreId";

CREATE VIEW ask_data_bom_consumption_variance_view AS
WITH movement_context AS (
  SELECT
    movement.*,
    COALESCE(
      card_usage."projectId",
      service_task."projectId",
      CASE WHEN direct_item."itemType" = 'project' THEN direct_item."itemId" END,
      fallback_item."itemId"
    ) AS resolved_project_id,
    COALESCE(
      NULLIF(card_usage."times", 0),
      NULLIF(direct_item."quantity", 0),
      NULLIF(fallback_item."quantity", 0),
      1
    )::numeric AS service_times
  FROM "StockMovement" movement
  LEFT JOIN "CardUsageRecord" card_usage
    ON movement."sourceType" = 'card_usage'
   AND card_usage."id" = movement."sourceId"
  LEFT JOIN "ServiceTask" service_task
    ON movement."sourceType" IN ('service_task', 'service_record')
   AND service_task."id" = movement."sourceId"
  LEFT JOIN "OrderItem" direct_item
    ON direct_item."id" = movement."orderItemId"
  LEFT JOIN "ProductOrder" source_order
    ON movement."sourceType" IN ('project_order', 'product_order')
   AND (
     source_order."id" = movement."sourceId"
     OR (movement."sourceNo" IS NOT NULL AND source_order."orderNo" = movement."sourceNo")
   )
  LEFT JOIN LATERAL (
    SELECT item."itemId", item."quantity"
    FROM "OrderItem" item
    WHERE direct_item."id" IS NULL
      AND item."orderId" = source_order."id"
      AND item."itemType" = 'project'
    ORDER BY
      CASE
        WHEN movement."remark" IS NOT NULL AND item."name" IS NOT NULL
          AND movement."remark" LIKE '%' || item."name" || '%'
        THEN 0 ELSE 1
      END,
      item."id"
    LIMIT 1
  ) fallback_item ON true
  WHERE movement."movementType" IN ('service_consume', 'service_consumption')
    AND movement."quantity" < 0
), calculated AS (
  SELECT
    movement."storeId" AS store_id,
    movement."id" AS movement_id,
    movement."occurredAt" AS occurred_at,
    movement.resolved_project_id AS project_id,
    movement."productId" AS product_id,
    movement.service_times,
    ABS(movement."quantity")::numeric AS actual_qty,
    CASE
      WHEN bom."standardQty" IS NULL THEN NULL
      ELSE (bom."standardQty" * movement.service_times)::numeric
    END AS standard_qty,
    movement."sourceType" AS source_type,
    movement."sourceId" AS source_id
  FROM movement_context movement
  LEFT JOIN "ProjectBomItem" bom
    ON bom."projectId" = movement.resolved_project_id
   AND bom."productId" = movement."productId"
)
SELECT
  calculated.store_id,
  store."name" AS store_name,
  calculated.movement_id,
  calculated.occurred_at,
  calculated.project_id,
  project."name" AS project_name,
  calculated.product_id,
  product."name" AS product_name,
  product."sku",
  calculated.service_times,
  calculated.standard_qty,
  calculated.actual_qty,
  CASE
    WHEN calculated.standard_qty IS NULL THEN NULL
    ELSE calculated.actual_qty - calculated.standard_qty
  END::numeric AS deviation_qty,
  CASE
    WHEN calculated.standard_qty IS NULL OR calculated.standard_qty = 0 THEN NULL
    ELSE (calculated.actual_qty - calculated.standard_qty) / calculated.standard_qty
  END::numeric AS deviation_rate,
  CASE
    WHEN calculated.standard_qty IS NULL OR calculated.standard_qty = 0 THEN false
    ELSE ABS((calculated.actual_qty - calculated.standard_qty) / calculated.standard_qty) > 0.2
  END AS is_abnormal,
  CASE
    WHEN calculated.project_id IS NULL THEN 'project_unresolved'
    WHEN calculated.standard_qty IS NULL OR calculated.standard_qty = 0 THEN 'standard_missing'
    ELSE 'matched'
  END AS standard_status,
  calculated.source_type,
  calculated.source_id
FROM calculated
JOIN "Store" store ON store."id" = calculated.store_id
JOIN "Product" product ON product."id" = calculated.product_id
LEFT JOIN "Project" project ON project."id" = calculated.project_id;

CREATE VIEW ask_data_customer_feedback_view AS
SELECT
  feedback."storeId" AS store_id,
  store."name" AS store_name,
  feedback."id" AS feedback_id,
  feedback."customerId" AS customer_id,
  CASE
    WHEN customer."name" IS NULL OR customer."name" = '' THEN NULL
    ELSE concat(left(customer."name", 1), '***')
  END AS customer_name_masked,
  feedback."beauticianId" AS staff_id,
  beautician."name" AS staff_name,
  feedback."projectId" AS project_id,
  project."name" AS project_name,
  feedback."feedbackType" AS feedback_type,
  feedback."rating",
  feedback."category",
  feedback."severity",
  feedback."status",
  feedback."occurredAt" AS occurred_at,
  feedback."handledAt" AS handled_at,
  feedback."resolvedAt" AS resolved_at
FROM "customer_service_feedback" feedback
JOIN "Store" store ON store."id" = feedback."storeId"
LEFT JOIN "Customer" customer ON customer."id" = feedback."customerId"
LEFT JOIN "Beautician" beautician ON beautician."id" = feedback."beauticianId"
LEFT JOIN "Project" project ON project."id" = feedback."projectId";

CREATE VIEW ask_data_customer_lifecycle_view AS
SELECT
  lifecycle."storeId" AS store_id,
  store."name" AS store_name,
  lifecycle."customerId" AS customer_id,
  CASE
    WHEN customer."name" IS NULL OR customer."name" = '' THEN NULL
    ELSE concat(left(customer."name", 1), '***')
  END AS customer_name_masked,
  lifecycle."lifecycleStage" AS lifecycle_stage,
  lifecycle."ltvTier" AS ltv_tier,
  lifecycle."churnRiskLevel" AS churn_risk_level,
  lifecycle."touchFatigueScore" AS touch_fatigue_score,
  lifecycle."computedAt" AS computed_at,
  COALESCE(opportunity_count.open_opportunity_count, 0)::integer AS open_opportunity_count,
  top_opportunity."opportunityType" AS top_opportunity_type,
  top_opportunity."priority" AS top_priority,
  top_opportunity."score" AS top_score,
  top_opportunity."expiresAt" AS opportunity_expires_at
FROM "CustomerLifecycleSnapshot" lifecycle
JOIN "Store" store ON store."id" = lifecycle."storeId"
JOIN "Customer" customer ON customer."id" = lifecycle."customerId"
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS open_opportunity_count
  FROM "CustomerOpportunity" opportunity
  WHERE opportunity."storeId" = lifecycle."storeId"
    AND opportunity."customerId" = lifecycle."customerId"
    AND opportunity."status" NOT IN ('closed', 'resolved', 'expired')
) opportunity_count ON true
LEFT JOIN LATERAL (
  SELECT
    opportunity."opportunityType",
    opportunity."priority",
    opportunity."score",
    opportunity."expiresAt"
  FROM "CustomerOpportunity" opportunity
  WHERE opportunity."storeId" = lifecycle."storeId"
    AND opportunity."customerId" = lifecycle."customerId"
    AND opportunity."status" NOT IN ('closed', 'resolved', 'expired')
  ORDER BY
    CASE opportunity."priority"
      WHEN 'P0' THEN 0
      WHEN 'P1' THEN 1
      WHEN 'P2' THEN 2
      ELSE 3
    END,
    opportunity."score" DESC,
    opportunity."updatedAt" DESC
  LIMIT 1
) top_opportunity ON true;

CREATE VIEW ask_data_marketing_roi_view AS
WITH daily_effect AS (
  SELECT
    fact."storeId" AS store_id,
    fact."occurredAt"::date AS effect_date,
    fact."activityId" AS activity_id,
    fact."promotionId" AS promotion_id,
    fact."strategyId" AS strategy_id,
    fact."channel",
    SUM(
      CASE WHEN fact."factType" IN ('exposure', 'delivery')
        THEN COALESCE(fact."countValue", 1) ELSE 0 END
    )::numeric AS exposure_count,
    SUM(
      CASE WHEN fact."factType" = 'click'
        THEN COALESCE(fact."countValue", 1) ELSE 0 END
    )::numeric AS click_count,
    SUM(
      CASE WHEN fact."factType" = 'conversion'
        THEN COALESCE(fact."countValue", 1) ELSE 0 END
    )::numeric AS conversion_count,
    SUM(
      CASE WHEN fact."factType" IN ('revenue', 'revenue_refund')
        THEN COALESCE(fact."amountValue", 0) ELSE 0 END
    )::numeric AS attributed_net_revenue,
    SUM(
      CASE WHEN fact."factType" = 'cost'
        THEN COALESCE(fact."amountValue", 0) ELSE 0 END
    )::numeric AS marketing_cost,
    COUNT(*) FILTER (WHERE fact."factType" = 'cost')::integer AS cost_fact_count,
    BOOL_AND(fact."metricSource" = 'actual') FILTER (WHERE fact."factType" = 'cost') AS all_cost_actual,
    BOOL_AND(fact."metricSource" = 'estimated') FILTER (WHERE fact."factType" = 'cost') AS all_cost_estimated,
    MAX(fact."occurredAt") AS latest_event_at
  FROM "MarketingEffectFact" fact
  WHERE fact."isPrimary" IS NOT FALSE
  GROUP BY
    fact."storeId",
    fact."occurredAt"::date,
    fact."activityId",
    fact."promotionId",
    fact."strategyId",
    fact."channel"
)
SELECT
  effect.store_id,
  store."name" AS store_name,
  effect.effect_date,
  effect.activity_id,
  activity."title" AS activity_title,
  effect.promotion_id,
  promotion."name" AS promotion_name,
  effect.strategy_id,
  strategy."name" AS strategy_name,
  effect.channel,
  effect.exposure_count,
  effect.click_count,
  effect.conversion_count,
  effect.attributed_net_revenue,
  effect.marketing_cost,
  CASE
    WHEN effect.exposure_count = 0 THEN NULL
    ELSE effect.conversion_count / effect.exposure_count
  END::numeric AS conversion_rate,
  CASE
    WHEN effect.marketing_cost = 0 THEN NULL
    ELSE effect.attributed_net_revenue / effect.marketing_cost
  END::numeric AS roi,
  CASE
    WHEN effect.cost_fact_count = 0 THEN 'missing'
    WHEN effect.all_cost_actual THEN 'actual'
    WHEN effect.all_cost_estimated THEN 'estimated'
    ELSE 'mixed'
  END AS cost_source,
  effect.latest_event_at
FROM daily_effect effect
JOIN "Store" store ON store."id" = effect.store_id
LEFT JOIN "MarketingActivity" activity ON activity."id" = effect.activity_id
LEFT JOIN "Promotion" promotion ON promotion."id" = effect.promotion_id
LEFT JOIN "MarketingAutomationStrategy" strategy ON strategy."id" = effect.strategy_id;
