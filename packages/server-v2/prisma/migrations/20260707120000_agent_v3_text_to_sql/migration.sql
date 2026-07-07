-- Agent V3 controlled Text-to-SQL: audit tables and whitelist semantic views.
-- Runtime must only execute guarded SELECTs against these views through a read-only connection.

CREATE TABLE IF NOT EXISTS "agent_v3_text_to_sql_runs" (
  "id" SERIAL PRIMARY KEY,
  "question" TEXT NOT NULL,
  "normalizedIntentJson" JSONB,
  "userId" INTEGER,
  "storeScopeJson" JSONB NOT NULL,
  "selectedViewsJson" JSONB NOT NULL,
  "generatedSqlHash" TEXT,
  "redactedSql" TEXT,
  "safeSqlHash" TEXT,
  "status" TEXT NOT NULL,
  "blockedReason" TEXT,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "executionMs" INTEGER,
  "evidenceJson" JSONB,
  "queryTraceJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_runs_status_idx" ON "agent_v3_text_to_sql_runs" ("status");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_runs_userId_idx" ON "agent_v3_text_to_sql_runs" ("userId");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_runs_blockedReason_idx" ON "agent_v3_text_to_sql_runs" ("blockedReason");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_runs_createdAt_idx" ON "agent_v3_text_to_sql_runs" ("createdAt");

CREATE TABLE IF NOT EXISTS "agent_v3_text_to_sql_semantic_views" (
  "id" SERIAL PRIMARY KEY,
  "viewName" TEXT NOT NULL UNIQUE,
  "domain" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requiredPermissionsJson" JSONB NOT NULL,
  "storeScopeField" TEXT,
  "defaultTimeField" TEXT,
  "fieldPoliciesJson" JSONB NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "adminOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_semantic_views_domain_idx" ON "agent_v3_text_to_sql_semantic_views" ("domain");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_semantic_views_isEnabled_idx" ON "agent_v3_text_to_sql_semantic_views" ("isEnabled");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_semantic_views_adminOnly_idx" ON "agent_v3_text_to_sql_semantic_views" ("adminOnly");

CREATE TABLE IF NOT EXISTS "agent_v3_text_to_sql_feedback" (
  "id" SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL,
  "userId" INTEGER,
  "rating" INTEGER,
  "feedbackText" TEXT,
  "isUseful" BOOLEAN,
  "isWrongAnswer" BOOLEAN NOT NULL DEFAULT false,
  "isPermissionConcern" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_v3_text_to_sql_feedback_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "agent_v3_text_to_sql_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_feedback_runId_idx" ON "agent_v3_text_to_sql_feedback" ("runId");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_feedback_userId_idx" ON "agent_v3_text_to_sql_feedback" ("userId");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_feedback_rating_idx" ON "agent_v3_text_to_sql_feedback" ("rating");
CREATE INDEX IF NOT EXISTS "agent_v3_text_to_sql_feedback_createdAt_idx" ON "agent_v3_text_to_sql_feedback" ("createdAt");

DROP VIEW IF EXISTS
  agent_v3_store_summary_view,
  agent_v3_customer_profile_summary_view,
  agent_v3_customer_behavior_view,
  agent_v3_customer_health_skin_view,
  agent_v3_order_summary_view,
  agent_v3_order_item_sales_view,
  agent_v3_project_service_sales_view,
  agent_v3_payment_refund_view,
  agent_v3_daily_settlement_view,
  agent_v3_cashier_shift_view,
  agent_v3_product_inventory_view,
  agent_v3_stock_movement_view,
  agent_v3_inventory_scrap_view,
  agent_v3_purchase_procurement_view,
  agent_v3_supplier_performance_view,
  agent_v3_project_catalog_view,
  agent_v3_card_asset_view,
  agent_v3_card_usage_view,
  agent_v3_customer_balance_view,
  agent_v3_reservation_view,
  agent_v3_schedule_resource_view,
  agent_v3_staff_profile_view,
  agent_v3_staff_performance_view,
  agent_v3_service_quality_view,
  agent_v3_marketing_activity_view,
  agent_v3_marketing_conversion_view,
  agent_v3_marketing_automation_view,
  agent_v3_promotion_offer_view,
  agent_v3_customer_app_funnel_view,
  agent_v3_recommendation_prediction_view,
  agent_v3_terminal_device_view,
  agent_v3_print_job_view,
  agent_v3_appointment_gap_view,
  agent_v3_industry_template_view,
  agent_v3_operating_cost_view,
  agent_v3_store_comparison_view,
  agent_v3_user_role_permission_view,
  agent_v3_agent_governance_view,
  agent_v3_ai_audit_view,
  agent_v3_data_quality_view
CASCADE;

CREATE VIEW agent_v3_store_summary_view AS
SELECT
  s."id" AS store_id,
  s."name" AS store_name,
  s."city",
  s."status",
  s."createdAt" AS created_at
FROM "Store" s
WHERE s."deletedAt" IS NULL;

CREATE VIEW agent_v3_customer_profile_summary_view AS
SELECT
  c."storeId" AS store_id,
  s."name" AS store_name,
  c."id" AS customer_id,
  CASE WHEN c."name" IS NULL OR c."name" = '' THEN NULL ELSE concat(left(c."name", 1), '***') END AS customer_name_masked,
  right(COALESCE(c."phone", ''), 4) AS phone_last4,
  c."memberLevel" AS member_level,
  c."lastVisitDate" AS last_visit_at,
  MAX(po."createdAt") AS last_order_at,
  c."totalSpent" AS total_paid_amount,
  c."visitCount" AS order_count,
  array_to_string(c."tags", ',') AS tags_summary
FROM "Customer" c
JOIN "Store" s ON s."id" = c."storeId"
LEFT JOIN "ProductOrder" po ON po."customerId" = c."id"
WHERE c."deletedAt" IS NULL
GROUP BY c."id", s."name";

CREATE VIEW agent_v3_customer_behavior_view AS
SELECT
  e."storeId" AS store_id,
  s."name" AS store_name,
  e."customerId" AS customer_id,
  CASE WHEN c."name" IS NULL OR c."name" = '' THEN NULL ELSE concat(left(c."name", 1), '***') END AS customer_name_masked,
  e."eventType" AS event_type,
  e."occurredAt" AS event_at,
  COALESCE(e."targetType", 'unknown') AS event_source,
  NULL::numeric AS amount,
  COALESCE(e."sessionId", 'unknown') AS channel
FROM "CustomerBehaviorEvent" e
JOIN "Store" s ON s."id" = e."storeId"
LEFT JOIN "Customer" c ON c."id" = e."customerId";

CREATE VIEW agent_v3_customer_health_skin_view AS
SELECT
  c."storeId" AS store_id,
  s."name" AS store_name,
  c."id" AS customer_id,
  CASE WHEN c."name" IS NULL OR c."name" = '' THEN NULL ELSE concat(left(c."name", 1), '***') END AS customer_name_masked,
  COALESCE(h."skinType", c."skinType") AS skin_type,
  COALESCE(h."skinStatus", c."skinCondition") AS skin_condition_summary,
  h."lastCheck" AS test_at,
  h."recommendedCare" AS recommendation_summary
FROM "Customer" c
JOIN "Store" s ON s."id" = c."storeId"
LEFT JOIN "CustomerHealthProfile" h ON h."customerId" = c."id"
WHERE c."deletedAt" IS NULL;

CREATE VIEW agent_v3_order_summary_view AS
SELECT
  po."storeId" AS store_id,
  s."name" AS store_name,
  po."id" AS order_id,
  po."createdAt" AS order_created_at,
  po."customerId" AS customer_id,
  CASE WHEN COALESCE(c."name", po."customerName") IS NULL OR COALESCE(c."name", po."customerName") = '' THEN NULL ELSE concat(left(COALESCE(c."name", po."customerName"), 1), '***') END AS customer_name_masked,
  po."status" AS order_status,
  po."totalAmount" AS total_amount,
  po."netAmount" AS paid_amount,
  COALESCE(refunds.refund_amount, 0)::numeric AS refund_amount,
  (po."netAmount" - COALESCE(refunds.refund_amount, 0))::numeric AS net_amount,
  po."payMethod" AS pay_method
FROM "ProductOrder" po
LEFT JOIN "Store" s ON s."id" = po."storeId"
LEFT JOIN "Customer" c ON c."id" = po."customerId"
LEFT JOIN (
  SELECT "orderId", SUM("amount") AS refund_amount
  FROM "RefundRecord"
  GROUP BY "orderId"
) refunds ON refunds."orderId" = po."id";

CREATE VIEW agent_v3_order_item_sales_view AS
SELECT
  po."storeId" AS store_id,
  s."name" AS store_name,
  po."id" AS order_id,
  po."createdAt" AS order_created_at,
  oi."itemId" AS product_id,
  oi."name" AS product_name,
  p."sku" AS sku,
  NULL::text AS category_name,
  oi."quantity" AS quantity,
  oi."subtotal" AS gross_amount,
  oi."totalDiscountAmount" AS discount_amount,
  oi."netAmount" AS net_amount,
  0::numeric AS refund_amount,
  po."status" AS order_status
FROM "OrderItem" oi
JOIN "ProductOrder" po ON po."id" = oi."orderId"
LEFT JOIN "Store" s ON s."id" = po."storeId"
LEFT JOIN "Product" p ON p."id" = oi."itemId"
WHERE oi."itemType" IN ('product', 'goods');

CREATE VIEW agent_v3_project_service_sales_view AS
SELECT
  po."storeId" AS store_id,
  s."name" AS store_name,
  oi."itemId" AS project_id,
  oi."name" AS project_name,
  pt."name" AS project_type,
  po."createdAt" AS order_created_at,
  oi."quantity" AS service_quantity,
  oi."netAmount" AS net_amount,
  0::numeric AS estimated_material_cost,
  oi."netAmount" AS estimated_margin
FROM "OrderItem" oi
JOIN "ProductOrder" po ON po."id" = oi."orderId"
LEFT JOIN "Store" s ON s."id" = po."storeId"
LEFT JOIN "Project" p ON p."id" = oi."itemId"
LEFT JOIN "ProjectType" pt ON pt."id" = p."typeId"
WHERE oi."itemType" IN ('project', 'service');

CREATE VIEW agent_v3_payment_refund_view AS
SELECT
  po."storeId" AS store_id,
  s."name" AS store_name,
  po."id" AS order_id,
  pay.paid_at,
  ref.refunded_at,
  pay.payment_method,
  COALESCE(pay.payment_amount, 0)::numeric AS payment_amount,
  COALESCE(ref.refund_amount, 0)::numeric AS refund_amount,
  pay.payment_status,
  ref.refund_status,
  ref.refund_reason_category
FROM "ProductOrder" po
LEFT JOIN "Store" s ON s."id" = po."storeId"
LEFT JOIN (
  SELECT "orderId", MAX("paidAt") AS paid_at, MAX("method") AS payment_method, SUM("amount") AS payment_amount, MAX("status") AS payment_status
  FROM "PaymentRecord"
  GROUP BY "orderId"
) pay ON pay."orderId" = po."id"
LEFT JOIN (
  SELECT "orderId", MAX("refundedAt") AS refunded_at, SUM("amount") AS refund_amount, MAX("status") AS refund_status, MAX("reason") AS refund_reason_category
  FROM "RefundRecord"
  GROUP BY "orderId"
) ref ON ref."orderId" = po."id";

CREATE VIEW agent_v3_daily_settlement_view AS
SELECT
  ds."storeId" AS store_id,
  s."name" AS store_name,
  ds."settleDate" AS settlement_date,
  ds."totalRevenue" AS revenue_amount,
  ds."totalRevenue" AS paid_amount,
  ds."refundAmount" AS refund_amount,
  (ds."totalRevenue" - ds."refundAmount")::numeric AS net_amount,
  ds."orderCount" AS order_count,
  ds."customerCount" AS customer_count
FROM "DailySettlement" ds
JOIN "Store" s ON s."id" = ds."storeId";

CREATE VIEW agent_v3_cashier_shift_view AS
SELECT
  cs."storeId" AS store_id,
  s."name" AS store_name,
  cs."id" AS shift_id,
  u."name" AS cashier_name,
  cs."startedAt" AS opened_at,
  cs."endedAt" AS closed_at,
  cs."status" AS shift_status,
  COALESCE(cs."systemCash", cs."closingCash", 0)::numeric AS system_cash,
  COALESCE(cs."cashDiff", 0)::numeric AS cash_diff
FROM "CashierShift" cs
JOIN "Store" s ON s."id" = cs."storeId"
LEFT JOIN "User" u ON u."id" = cs."operatorId";

CREATE VIEW agent_v3_product_inventory_view AS
SELECT
  p."storeId" AS store_id,
  s."name" AS store_name,
  p."id" AS product_id,
  p."name" AS product_name,
  p."sku",
  p."unit",
  p."currentStock" AS current_stock,
  p."safetyStock" AS safety_stock,
  (p."currentStock" * p."costPrice")::numeric AS stock_value,
  p."status",
  MIN(sb."expiryDate") AS nearest_expiry_date
FROM "Product" p
JOIN "Store" s ON s."id" = p."storeId"
LEFT JOIN "StockBatch" sb ON sb."productId" = p."id"
WHERE p."deletedAt" IS NULL
GROUP BY p."id", s."name";

CREATE VIEW agent_v3_stock_movement_view AS
SELECT
  sm."storeId" AS store_id,
  s."name" AS store_name,
  sm."id" AS movement_id,
  sm."productId" AS product_id,
  p."name" AS product_name,
  p."sku",
  sm."movementType" AS movement_type,
  sm."quantity",
  sm."beforeStock" AS before_stock,
  sm."afterStock" AS after_stock,
  sm."sourceType" AS source_type,
  sm."occurredAt" AS occurred_at
FROM "StockMovement" sm
JOIN "Store" s ON s."id" = sm."storeId"
JOIN "Product" p ON p."id" = sm."productId";

CREATE VIEW agent_v3_inventory_scrap_view AS
SELECT
  sm."storeId" AS store_id,
  s."name" AS store_name,
  sm."id" AS movement_id,
  sm."productId" AS product_id,
  p."name" AS product_name,
  p."sku",
  ABS(sm."quantity") AS scrap_quantity,
  (ABS(sm."quantity") * p."costPrice")::numeric AS loss_amount,
  sm."occurredAt" AS occurred_at,
  u."name" AS operator_name,
  CASE WHEN sm."remark" IS NULL THEN NULL ELSE left(sm."remark", 80) END AS remark_summary
FROM "StockMovement" sm
JOIN "Store" s ON s."id" = sm."storeId"
JOIN "Product" p ON p."id" = sm."productId"
LEFT JOIN "User" u ON u."id" = sm."operatorId"
WHERE sm."movementType" IN ('scrap_out', 'scrap', 'loss', 'damage_out');

CREATE VIEW agent_v3_purchase_procurement_view AS
SELECT
  po."storeId" AS store_id,
  s."name" AS store_name,
  po."id" AS procurement_id,
  po."orderNo" AS procurement_no,
  po."supplierId" AS supplier_id,
  ss."name" AS supplier_name,
  po."status",
  po."totalAmount" AS total_amount,
  po."expectedArrivalDate" AS expected_arrival_date,
  po."createdAt" AS created_at,
  po."receivedAt" AS received_at
FROM "ProcurementOrder" po
JOIN "Store" s ON s."id" = po."storeId"
JOIN "SupplySupplier" ss ON ss."id" = po."supplierId";

CREATE VIEW agent_v3_supplier_performance_view AS
SELECT
  po."storeId" AS store_id,
  s."name" AS store_name,
  ss."id" AS supplier_id,
  ss."name" AS supplier_name,
  COUNT(po."id")::integer AS procurement_count,
  SUM(po."totalAmount")::numeric AS procurement_amount,
  AVG(EXTRACT(EPOCH FROM (COALESCE(po."receivedAt", po."updatedAt") - po."createdAt")) / 86400)::numeric AS avg_delivery_days,
  MAX(po."createdAt") AS last_procurement_at
FROM "SupplySupplier" ss
JOIN "ProcurementOrder" po ON po."supplierId" = ss."id"
JOIN "Store" s ON s."id" = po."storeId"
GROUP BY po."storeId", s."name", ss."id", ss."name";

CREATE VIEW agent_v3_project_catalog_view AS
SELECT
  p."storeId" AS store_id,
  s."name" AS store_name,
  p."id" AS project_id,
  p."name" AS project_name,
  pt."name" AS project_type,
  p."price",
  p."duration",
  p."careCycleWeeks" AS care_cycle_weeks,
  p."treatmentCourseTimes" AS treatment_course_times,
  p."status",
  p."updatedAt" AS updated_at
FROM "Project" p
JOIN "Store" s ON s."id" = p."storeId"
LEFT JOIN "ProjectType" pt ON pt."id" = p."typeId"
WHERE p."deletedAt" IS NULL;

CREATE VIEW agent_v3_card_asset_view AS
SELECT
  c."storeId" AS store_id,
  s."name" AS store_name,
  cc."customerId" AS customer_id,
  CASE WHEN c."name" IS NULL OR c."name" = '' THEN NULL ELSE concat(left(c."name", 1), '***') END AS customer_name_masked,
  cc."id" AS customer_card_id,
  cc."cardName" AS card_name,
  cc."totalTimes" AS total_times,
  cc."remainingTimes" AS remaining_times,
  cc."paidAmount" AS paid_amount,
  cc."expiryDate" AS expiry_date,
  cc."status"
FROM "CustomerCard" cc
JOIN "Customer" c ON c."id" = cc."customerId"
JOIN "Store" s ON s."id" = c."storeId";

CREATE VIEW agent_v3_card_usage_view AS
SELECT
  cur."storeId" AS store_id,
  s."name" AS store_name,
  cur."customerId" AS customer_id,
  CASE WHEN cur."customerName" IS NULL OR cur."customerName" = '' THEN NULL ELSE concat(left(cur."customerName", 1), '***') END AS customer_name_masked,
  cur."cardName" AS card_name,
  cur."projectName" AS project_name,
  cur."times",
  cur."remainingTimes" AS remaining_times,
  cur."recognizedAmount" AS recognized_amount,
  cur."verifiedAt" AS verified_at
FROM "CardUsageRecord" cur
LEFT JOIN "Store" s ON s."id" = cur."storeId";

CREATE VIEW agent_v3_customer_balance_view AS
SELECT
  a."storeId" AS store_id,
  s."name" AS store_name,
  a."customerId" AS customer_id,
  CASE WHEN c."name" IS NULL OR c."name" = '' THEN NULL ELSE concat(left(c."name", 1), '***') END AS customer_name_masked,
  a."cashBalance" AS cash_balance,
  a."giftBalance" AS gift_balance,
  a."status",
  a."updatedAt" AS updated_at
FROM "CustomerBalanceAccount" a
JOIN "Store" s ON s."id" = a."storeId"
JOIN "Customer" c ON c."id" = a."customerId";

CREATE VIEW agent_v3_reservation_view AS
SELECT
  r."storeId" AS store_id,
  s."name" AS store_name,
  r."id" AS reservation_id,
  r."customerId" AS customer_id,
  CASE WHEN c."name" IS NULL OR c."name" = '' THEN NULL ELSE concat(left(c."name", 1), '***') END AS customer_name_masked,
  r."projectId" AS project_id,
  p."name" AS project_name,
  r."beauticianId" AS beautician_id,
  b."name" AS beautician_name,
  r."date",
  r."startTime" AS start_time,
  r."status"
FROM "Reservation" r
JOIN "Store" s ON s."id" = r."storeId"
JOIN "Customer" c ON c."id" = r."customerId"
JOIN "Project" p ON p."id" = r."projectId"
LEFT JOIN "Beautician" b ON b."id" = r."beauticianId";

CREATE VIEW agent_v3_schedule_resource_view AS
SELECT
  sr."storeId" AS store_id,
  s."name" AS store_name,
  sr."id" AS resource_id,
  sr."name" AS resource_name,
  sr."type" AS resource_type,
  sr."status",
  COUNT(rb."id")::integer AS booking_count,
  MAX(rb."date") AS latest_booking_date
FROM "StoreResource" sr
JOIN "Store" s ON s."id" = sr."storeId"
LEFT JOIN "ResourceBooking" rb ON rb."resourceId" = sr."id"
GROUP BY sr."id", s."name";

CREATE VIEW agent_v3_staff_profile_view AS
SELECT
  b."storeId" AS store_id,
  s."name" AS store_name,
  b."id" AS staff_id,
  b."name" AS staff_name,
  bl."name" AS level_name,
  b."status",
  b."createdAt" AS created_at
FROM "Beautician" b
JOIN "Store" s ON s."id" = b."storeId"
LEFT JOIN "BeauticianLevel" bl ON bl."id" = b."levelId";

CREATE VIEW agent_v3_staff_performance_view AS
SELECT
  cr."storeId" AS store_id,
  s."name" AS store_name,
  COALESCE(cr."beauticianId", cr."staffUserId") AS staff_id,
  COALESCE(b."name", u."name") AS staff_name,
  cr."settleMonth" AS settle_month,
  SUM(cr."sourceAmount")::numeric AS paid_amount,
  AVG(cr."sourceAmount")::numeric AS average_order_amount,
  SUM(cr."amount")::numeric AS commission_amount,
  COUNT(cr."id")::integer AS service_count
FROM "CommissionRecord" cr
JOIN "Store" s ON s."id" = cr."storeId"
LEFT JOIN "Beautician" b ON b."id" = cr."beauticianId"
LEFT JOIN "User" u ON u."id" = cr."staffUserId"
GROUP BY cr."storeId", s."name", COALESCE(cr."beauticianId", cr."staffUserId"), COALESCE(b."name", u."name"), cr."settleMonth";

CREATE VIEW agent_v3_service_quality_view AS
SELECT
  st."storeId" AS store_id,
  s."name" AS store_name,
  st."id" AS service_task_id,
  st."customerId" AS customer_id,
  st."projectId" AS project_id,
  p."name" AS project_name,
  st."beauticianId" AS beautician_id,
  b."name" AS beautician_name,
  st."status",
  st."appointmentTime" AS appointment_time,
  st."completedAt" AS completed_at
FROM "ServiceTask" st
JOIN "Store" s ON s."id" = st."storeId"
JOIN "Project" p ON p."id" = st."projectId"
LEFT JOIN "Beautician" b ON b."id" = st."beauticianId";

CREATE VIEW agent_v3_marketing_activity_view AS
SELECT
  COALESCE(mp."storeId", p."storeId", 0) AS store_id,
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
LEFT JOIN "MarketingPage" mp ON mp."activityId" = ma."id"
LEFT JOIN "Promotion" p ON p."id" = ma."primaryPromotionId"
LEFT JOIN "Store" s ON s."id" = COALESCE(mp."storeId", p."storeId");

CREATE VIEW agent_v3_marketing_conversion_view AS
SELECT
  COALESCE(mp."storeId", mpl."storeId", po."storeId", 0) AS store_id,
  s."name" AS store_name,
  mp."activityId" AS activity_id,
  ma."title" AS activity_title,
  COUNT(DISTINCT mpe."id")::integer AS event_count,
  COUNT(DISTINCT mpl."id")::integer AS lead_count,
  COUNT(DISTINCT mpa."id")::integer AS conversion_count,
  SUM(COALESCE(mpa."attributedRevenue", 0))::numeric AS attributed_revenue,
  MAX(COALESCE(mpa."createdAt", mpe."occurredAt", mpl."createdAt")) AS latest_event_at
FROM "MarketingPage" mp
LEFT JOIN "MarketingActivity" ma ON ma."id" = mp."activityId"
LEFT JOIN "MarketingPageEvent" mpe ON mpe."pageId" = mp."id"
LEFT JOIN "MarketingPageLead" mpl ON mpl."pageId" = mp."id"
LEFT JOIN "MarketingPageAttribution" mpa ON mpa."pageId" = mp."id"
LEFT JOIN "ProductOrder" po ON po."id" = mpa."orderId"
LEFT JOIN "Store" s ON s."id" = COALESCE(mp."storeId", mpl."storeId", po."storeId")
GROUP BY COALESCE(mp."storeId", mpl."storeId", po."storeId", 0), s."name", mp."activityId", ma."title";

CREATE VIEW agent_v3_marketing_automation_view AS
SELECT
  t."storeId" AS store_id,
  s."name" AS store_name,
  t."source" AS automation_source,
  t."triggerType" AS trigger_type,
  t."status",
  COUNT(t."id")::integer AS task_count,
  MAX(t."createdAt") AS latest_task_at,
  COUNT(t."completedAt")::integer AS completed_count
FROM "TerminalFollowUpTask" t
JOIN "Store" s ON s."id" = t."storeId"
WHERE t."deletedAt" IS NULL
GROUP BY t."storeId", s."name", t."source", t."triggerType", t."status";

CREATE VIEW agent_v3_promotion_offer_view AS
SELECT
  COALESCE(p."storeId", 0) AS store_id,
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
  p."endAt" AS end_at
FROM "Promotion" p
LEFT JOIN "Store" s ON s."id" = p."storeId";

CREATE VIEW agent_v3_customer_app_funnel_view AS
SELECT
  cae."storeId" AS store_id,
  s."name" AS store_name,
  cae."channel",
  cae."eventType" AS event_type,
  COUNT(cae."id")::integer AS event_count,
  COUNT(DISTINCT cae."customerId")::integer AS customer_count,
  MAX(cae."occurredAt") AS latest_event_at
FROM "CustomerAppEvent" cae
JOIN "Store" s ON s."id" = cae."storeId"
GROUP BY cae."storeId", s."name", cae."channel", cae."eventType";

CREATE VIEW agent_v3_recommendation_prediction_view AS
SELECT
  COALESCE(mrs."storeId", 0) AS store_id,
  s."name" AS store_name,
  mrs."scope",
  mrs."type",
  mrs."cardCount" AS card_count,
  mrs."sourceVersion" AS source_version,
  mrs."generatedAt" AS generated_at,
  mrs."expiresAt" AS expires_at
FROM "MarketingRecommendationSnapshot" mrs
LEFT JOIN "Store" s ON s."id" = mrs."storeId";

CREATE VIEW agent_v3_terminal_device_view AS
SELECT
  td."storeId" AS store_id,
  s."name" AS store_name,
  td."id" AS device_id,
  td."deviceCode" AS device_code,
  td."name" AS device_name,
  td."model",
  td."status",
  td."appVersion" AS app_version,
  td."printerStatus" AS printer_status,
  td."lastOnlineAt" AS last_online_at
FROM "TerminalDevice" td
JOIN "Store" s ON s."id" = td."storeId";

CREATE VIEW agent_v3_print_job_view AS
SELECT
  pj."storeId" AS store_id,
  s."name" AS store_name,
  pj."id" AS print_job_id,
  pj."jobNo" AS job_no,
  pj."sourceType" AS source_type,
  pj."title",
  pj."copies",
  pj."status",
  pj."createdAt" AS created_at,
  pj."completedAt" AS completed_at
FROM "PrintJob" pj
JOIN "Store" s ON s."id" = pj."storeId";

CREATE VIEW agent_v3_appointment_gap_view AS
SELECT
  ago."storeId" AS store_id,
  s."name" AS store_name,
  ago."id" AS opportunity_id,
  ago."date",
  ago."startTime" AS start_time,
  ago."endTime" AS end_time,
  ago."availableCapacity" AS available_capacity,
  ago."estimatedRevenue" AS estimated_revenue,
  ago."candidateCount" AS candidate_count,
  ago."status"
FROM "AppointmentGapOpportunity" ago
JOIN "Store" s ON s."id" = ago."storeId";

CREATE VIEW agent_v3_industry_template_view AS
SELECT
  0 AS store_id,
  NULL::text AS store_name,
  ist."id" AS template_id,
  ist."name" AS template_name,
  ist."category",
  concat(COALESCE(ist."referencePriceMin"::text, ''), '-', COALESCE(ist."referencePriceMax"::text, '')) AS price_range,
  ist."careCycleWeeks" AS care_cycle_weeks,
  ist."treatmentCourseTimes" AS treatment_course_times,
  ist."status",
  ist."updatedAt" AS updated_at
FROM "IndustryServiceTemplate" ist
WHERE ist."deletedAt" IS NULL;

CREATE VIEW agent_v3_operating_cost_view AS
SELECT
  oc."storeId" AS store_id,
  s."name" AS store_name,
  oc."id" AS cost_id,
  oc."periodMonth" AS period_month,
  oc."costDate" AS cost_date,
  oc."category",
  oc."amount",
  oc."allocationType" AS allocation_type
FROM "OperatingCost" oc
JOIN "Store" s ON s."id" = oc."storeId";

CREATE VIEW agent_v3_store_comparison_view AS
SELECT
  ds."storeId" AS store_id,
  s."name" AS store_name,
  date_trunc('month', ds."settleDate")::date AS period_month,
  SUM(ds."totalRevenue")::numeric AS revenue_amount,
  SUM(ds."refundAmount")::numeric AS refund_amount,
  SUM(ds."orderCount")::integer AS order_count,
  SUM(ds."customerCount")::integer AS customer_count
FROM "DailySettlement" ds
JOIN "Store" s ON s."id" = ds."storeId"
GROUP BY ds."storeId", s."name", date_trunc('month', ds."settleDate")::date;

CREATE VIEW agent_v3_user_role_permission_view AS
SELECT
  us."storeId" AS store_id,
  s."name" AS store_name,
  u."id" AS user_id,
  u."name" AS user_name,
  r."key" AS role_key,
  r."name" AS role_name,
  r."permissions" AS permissions,
  u."status" AS user_status
FROM "User" u
JOIN "UserStore" us ON us."userId" = u."id"
JOIN "Store" s ON s."id" = us."storeId"
LEFT JOIN "UserRole" ur ON ur."userId" = u."id"
LEFT JOIN "Role" r ON r."id" = ur."roleId";

CREATE VIEW agent_v3_agent_governance_view AS
SELECT
  apr."id" AS run_id,
  apr."runNo" AS run_no,
  apr."status",
  apr."sourceVersionId" AS source_version_id,
  apr."targetVersionId" AS target_version_id,
  apr."startedAt" AS started_at,
  apr."completedAt" AS completed_at,
  apr."errorMessage" AS error_message
FROM "agent_capability_publish_runs" apr;

CREATE VIEW agent_v3_ai_audit_view AS
SELECT
  aal."storeId" AS store_id,
  s."name" AS store_name,
  aal."id" AS audit_id,
  aal."userId" AS user_id,
  aal."model" AS model_name,
  aal."scenario",
  aal."status",
  aal."createdAt" AS created_at
FROM "AiAuditLog" aal
LEFT JOIN "Store" s ON s."id" = aal."storeId";

CREATE VIEW agent_v3_data_quality_view AS
SELECT
  s."id" AS store_id,
  s."name" AS store_name,
  (SELECT COUNT(*) FROM "Customer" c WHERE c."storeId" = s."id" AND c."deletedAt" IS NULL)::integer AS customer_count,
  (SELECT COUNT(*) FROM "Product" p WHERE p."storeId" = s."id" AND p."deletedAt" IS NULL)::integer AS product_count,
  (SELECT COUNT(*) FROM "ProductOrder" po WHERE po."storeId" = s."id")::integer AS order_count,
  (SELECT COUNT(*) FROM "Customer" c WHERE c."storeId" = s."id" AND (c."phone" IS NULL OR c."phone" = '') AND c."deletedAt" IS NULL)::integer AS missing_phone_customer_count,
  now() AS checked_at
FROM "Store" s
WHERE s."deletedAt" IS NULL;

CREATE OR REPLACE FUNCTION agent_v3_text_to_sql_field_policies(masked_fields text[] DEFAULT ARRAY[]::text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_array(jsonb_build_object('field', '*', 'policy', 'allow'))
    || COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('field', masked_field, 'policy', 'mask'))
        FROM unnest(masked_fields) AS masked_field
      ),
      '[]'::jsonb
    );
$$;

INSERT INTO "agent_v3_text_to_sql_semantic_views" (
  "viewName",
  "domain",
  "description",
  "requiredPermissionsJson",
  "storeScopeField",
  "defaultTimeField",
  "fieldPoliciesJson",
  "isEnabled"
)
VALUES
  ('agent_v3_order_summary_view', 'order', '订单、成交、实收、退款和客单价摘要。', '["core:order:view"]'::jsonb, 'store_id', 'order_created_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), true),
  ('agent_v3_order_item_sales_view', 'product', '商品销售明细、销量排行和销售额排行。', '["core:order:view","core:product:view"]'::jsonb, 'store_id', 'order_created_at', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_project_service_sales_view', 'project', '项目服务次数、项目销售额和项目毛利估算。', '["core:order:view","core:project:view"]'::jsonb, 'store_id', 'order_created_at', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_payment_refund_view', 'finance', '支付、退款和售后退款摘要。', '["core:finance:view"]'::jsonb, 'store_id', 'paid_at', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_daily_settlement_view', 'finance', '日结、营收、退款、净收和订单数。', '["core:finance:view"]'::jsonb, 'store_id', 'settlement_date', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_product_inventory_view', 'inventory', '商品库存、库存金额和临期状态。', '["core:inventory:view"]'::jsonb, 'store_id', 'nearest_expiry_date', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_stock_movement_view', 'inventory', '库存流水、入库、出库、盘点和报废。', '["core:inventory:view"]'::jsonb, 'store_id', 'occurred_at', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_inventory_scrap_view', 'inventory', '已发生报废库存流水。', '["core:inventory:view"]'::jsonb, 'store_id', 'occurred_at', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_customer_profile_summary_view', 'customer', '客户档案、会员等级、最近到店和消费摘要。', '["core:customer:view"]'::jsonb, 'store_id', 'last_order_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked','phone_last4']), true),
  ('agent_v3_staff_profile_view', 'staff', '员工和美容师基础资料。', '["core:staff:view"]'::jsonb, 'store_id', 'created_at', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_staff_performance_view', 'staff', '员工人效、提成、服务和客单价摘要。', '["core:staff:view","core:finance:view"]'::jsonb, 'store_id', 'settle_month', agent_v3_text_to_sql_field_policies(), true),
  ('agent_v3_reservation_view', 'reservation', '预约记录、项目、客户和美容师。', '["core:reservation:view"]'::jsonb, 'store_id', 'date', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), true),
  ('agent_v3_marketing_conversion_view', 'marketing', '营销页面浏览、线索和成交归因。', '["core:marketing:view"]'::jsonb, 'store_id', 'latest_event_at', agent_v3_text_to_sql_field_policies(), true)
ON CONFLICT ("viewName") DO UPDATE SET
  "domain" = EXCLUDED."domain",
  "description" = EXCLUDED."description",
  "requiredPermissionsJson" = EXCLUDED."requiredPermissionsJson",
  "storeScopeField" = EXCLUDED."storeScopeField",
  "defaultTimeField" = EXCLUDED."defaultTimeField",
  "fieldPoliciesJson" = EXCLUDED."fieldPoliciesJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "agent_v3_text_to_sql_semantic_views" (
  "viewName",
  "domain",
  "description",
  "requiredPermissionsJson",
  "storeScopeField",
  "defaultTimeField",
  "fieldPoliciesJson",
  "isEnabled"
)
VALUES
  ('agent_v3_store_summary_view', 'store', '门店基础资料和经营范围摘要。', '["core:store:view"]'::jsonb, 'store_id', 'created_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_customer_behavior_view', 'customer', '客户消费、预约、小程序和营销互动行为。', '["core:customer:view"]'::jsonb, 'store_id', 'event_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_customer_health_skin_view', 'customer', '客户肤况、皮肤测试和护理建议摘要。', '["core:customer:view"]'::jsonb, 'store_id', 'test_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_cashier_shift_view', 'finance', '收银班次、交接班和班次收入。', '["core:finance:view"]'::jsonb, 'store_id', 'opened_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_purchase_procurement_view', 'supply', '采购订单、供应商和到货状态。', '["core:supply:view"]'::jsonb, 'store_id', 'created_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_supplier_performance_view', 'supply', '供应商交付和采购表现。', '["core:supply:view"]'::jsonb, 'store_id', 'last_procurement_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_project_catalog_view', 'project', '项目目录、价格、护理周期和疗程次数。', '["core:project:view"]'::jsonb, 'store_id', 'updated_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_card_asset_view', 'card', '客户卡项资产、剩余次数和到期情况。', '["core:card:view"]'::jsonb, 'store_id', 'expiry_date', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_card_usage_view', 'card', '卡项核销、项目和确认记录。', '["core:card:view"]'::jsonb, 'store_id', 'verified_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_customer_balance_view', 'card', '客户储值余额和赠送余额。', '["core:card:view"]'::jsonb, 'store_id', 'updated_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_schedule_resource_view', 'schedule', '资源、房间、仪器和预约占用。', '["core:schedule:view"]'::jsonb, 'store_id', 'latest_booking_date', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_service_quality_view', 'service', '服务任务、完成状态和项目履约。', '["core:service:view"]'::jsonb, 'store_id', 'appointment_time', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_marketing_activity_view', 'marketing', '营销活动、发布状态和参与情况。', '["core:marketing:view"]'::jsonb, 'store_id', 'start_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_marketing_automation_view', 'marketing', '自动化触达任务和完成情况。', '["core:marketing:view"]'::jsonb, 'store_id', 'latest_task_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_promotion_offer_view', 'marketing', '促销权益、发放和使用情况。', '["core:marketing:view"]'::jsonb, 'store_id', 'start_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_customer_app_funnel_view', 'channel', '客户小程序渠道事件和客户转化漏斗。', '["core:customer:view"]'::jsonb, 'store_id', 'latest_event_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked','app_user_hash']), false),
  ('agent_v3_recommendation_prediction_view', 'recommendation', '推荐和预测快照。', '["core:marketing:view"]'::jsonb, 'store_id', 'generated_at', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_terminal_device_view', 'terminal', '终端设备在线、版本和打印状态。', '["core:terminal:view"]'::jsonb, 'store_id', 'last_online_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_print_job_view', 'terminal', '打印任务状态和来源。', '["core:terminal:view"]'::jsonb, 'store_id', 'created_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_appointment_gap_view', 'reservation', '预约空档机会和可填充容量。', '["core:reservation:view"]'::jsonb, 'store_id', 'date', agent_v3_text_to_sql_field_policies(ARRAY['customer_name_masked']), false),
  ('agent_v3_industry_template_view', 'industry', '行业项目模板和参考价格。', '["core:industry:view"]'::jsonb, 'store_id', 'updated_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_operating_cost_view', 'finance', '经营成本、月份和类别。', '["core:finance:view"]'::jsonb, 'store_id', 'cost_date', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_store_comparison_view', 'store', '多门店营收、退款和订单对比。', '["core:store:view","core:finance:view"]'::jsonb, 'store_id', 'period_month', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_user_role_permission_view', 'system', '用户角色权限只读摘要。', '["core:system:permissions"]'::jsonb, 'store_id', NULL, agent_v3_text_to_sql_field_policies(ARRAY['phone_last4']), false),
  ('agent_v3_agent_governance_view', 'agent', 'Agent 运行和治理审计摘要。', '["core:agent-governance:view"]'::jsonb, NULL, 'started_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_ai_audit_view', 'agent', 'AI 调用审计摘要。', '["core:agent-governance:view"]'::jsonb, 'store_id', 'created_at', agent_v3_text_to_sql_field_policies(), false),
  ('agent_v3_data_quality_view', 'system', '门店主数据质量摘要。', '["core:system:view"]'::jsonb, 'store_id', 'checked_at', agent_v3_text_to_sql_field_policies(), false)
ON CONFLICT ("viewName") DO UPDATE SET
  "domain" = EXCLUDED."domain",
  "description" = EXCLUDED."description",
  "requiredPermissionsJson" = EXCLUDED."requiredPermissionsJson",
  "storeScopeField" = EXCLUDED."storeScopeField",
  "defaultTimeField" = EXCLUDED."defaultTimeField",
  "fieldPoliciesJson" = EXCLUDED."fieldPoliciesJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "updatedAt" = CURRENT_TIMESTAMP;

DROP FUNCTION agent_v3_text_to_sql_field_policies(text[]);
