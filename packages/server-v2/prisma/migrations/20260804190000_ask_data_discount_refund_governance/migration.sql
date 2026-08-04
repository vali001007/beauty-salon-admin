-- Ami Ask Coverage R2: governed order-discount and refund facts.
-- This view exposes review signals and linkage evidence only. It must not be
-- interpreted as proof that a refund approval workflow was compliant.

CREATE VIEW ask_data_discount_refund_governance_view AS
WITH payment_rollup AS (
  SELECT
    payment."orderId" AS order_id,
    SUM(payment."amount") FILTER (
      WHERE LOWER(payment."status") IN ('success', 'completed', 'paid')
    )::numeric AS paid_amount,
    COUNT(*) FILTER (
      WHERE LOWER(payment."status") IN ('success', 'completed', 'paid')
    )::integer AS successful_payment_count,
    MAX(payment."paidAt") FILTER (
      WHERE LOWER(payment."status") IN ('success', 'completed', 'paid')
    ) AS last_paid_at
  FROM "PaymentRecord" payment
  GROUP BY payment."orderId"
), refund_rollup AS (
  SELECT
    refund."orderId" AS order_id,
    COUNT(*)::integer AS refund_request_count,
    SUM(refund."amount")::numeric AS refund_request_amount,
    COUNT(*) FILTER (
      WHERE LOWER(refund."status") IN ('pending', 'requested', 'processing', 'reviewing')
    )::integer AS pending_refund_count,
    COALESCE(SUM(refund."amount") FILTER (
      WHERE LOWER(refund."status") IN ('pending', 'requested', 'processing', 'reviewing')
    ), 0)::numeric AS pending_refund_amount,
    COUNT(*) FILTER (
      WHERE LOWER(refund."status") IN ('success', 'completed', 'refunded')
    )::integer AS successful_refund_count,
    COALESCE(SUM(refund."amount") FILTER (
      WHERE LOWER(refund."status") IN ('success', 'completed', 'refunded')
    ), 0)::numeric AS refund_amount,
    COUNT(*) FILTER (
      WHERE LOWER(refund."status") IN ('failed', 'cancelled', 'canceled', 'rejected')
    )::integer AS failed_refund_count,
    MIN(refund."createdAt") AS first_refund_requested_at,
    MAX(refund."createdAt") AS last_refund_requested_at,
    MAX(refund."refundedAt") FILTER (
      WHERE LOWER(refund."status") IN ('success', 'completed', 'refunded')
    ) AS last_refunded_at,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (refund."refundedAt" - refund."createdAt")) / 3600.0
    ) FILTER (
      WHERE LOWER(refund."status") IN ('success', 'completed', 'refunded')
        AND refund."refundedAt" IS NOT NULL
        AND refund."refundedAt" >= refund."createdAt"
    ), 0)::numeric AS successful_refund_processing_hours,
    COUNT(*) FILTER (
      WHERE LOWER(refund."status") IN ('success', 'completed', 'refunded')
        AND refund."refundedAt" IS NOT NULL
        AND refund."refundedAt" >= refund."createdAt"
    )::integer AS timed_successful_refund_count,
    CASE
      WHEN COUNT(DISTINCT refund."refundMode") = 1 THEN MAX(refund."refundMode")
      ELSE 'mixed'
    END::text AS refund_mode,
    CASE
      WHEN COUNT(DISTINCT refund."inventoryStatus") = 1 THEN MAX(refund."inventoryStatus")
      ELSE 'mixed'
    END::text AS refund_inventory_status
  FROM "RefundRecord" refund
  GROUP BY refund."orderId"
), order_item_rollup AS (
  SELECT
    item."orderId" AS order_id,
    COUNT(DISTINCT item."beauticianId") FILTER (
      WHERE item."beauticianId" IS NOT NULL
    )::integer AS staff_count,
    MIN(item."beauticianId") FILTER (
      WHERE item."beauticianId" IS NOT NULL
    )::integer AS only_staff_id,
    BOOL_OR(
      LOWER(COALESCE(item."discountSource", 'none')) IN ('manual', 'override', 'staff')
    ) AS has_manual_item_discount,
    COUNT(DISTINCT item."serviceTaskId") FILTER (
      WHERE item."serviceTaskId" IS NOT NULL
    )::integer AS service_task_count,
    COUNT(DISTINCT item."serviceTaskId") FILTER (
      WHERE service."status"::text = 'completed'
    )::integer AS completed_service_count
  FROM "OrderItem" item
  LEFT JOIN "ServiceTask" service
    ON service."id" = item."serviceTaskId"
  GROUP BY item."orderId"
), governed_orders AS (
  SELECT
    orders."id" AS order_id,
    orders."storeId" AS store_id,
    store."name" AS store_name,
    orders."createdAt" AS order_created_at,
    orders."status" AS order_status,
    orders."customerId" AS customer_id,
    CASE
      WHEN customer."name" IS NULL OR customer."name" = '' THEN NULL
      ELSE CONCAT(LEFT(customer."name", 1), '***')
    END AS customer_name_masked,
    orders."listAmount"::numeric AS list_amount,
    orders."totalDiscountAmount"::numeric AS total_discount_amount,
    CASE
      WHEN orders."listAmount" > 0
      THEN orders."totalDiscountAmount" / orders."listAmount"
      ELSE NULL
    END::numeric AS discount_rate,
    orders."netAmount"::numeric AS net_amount,
    orders."discountSource" AS discount_source,
    orders."promotionId" AS promotion_id,
    promotion."name" AS promotion_name,
    promotion."approvalStatus" AS promotion_approval_status,
    orders."couponId" AS coupon_id,
    COALESCE(item.staff_count, 0)::integer AS attributed_staff_count,
    CASE
      WHEN COALESCE(item.staff_count, 0) = 1 THEN item.only_staff_id
      ELSE NULL
    END::integer AS primary_staff_id,
    CASE
      WHEN COALESCE(item.staff_count, 0) = 0 THEN 'missing'
      WHEN item.staff_count = 1 THEN 'unique'
      ELSE 'multiple'
    END::text AS staff_attribution_status,
    COALESCE(item.service_task_count, 0)::integer AS service_task_count,
    COALESCE(item.completed_service_count, 0)::integer AS completed_service_count,
    COALESCE(payment.paid_amount, 0)::numeric AS paid_amount,
    COALESCE(payment.successful_payment_count, 0)::integer AS successful_payment_count,
    payment.last_paid_at,
    COALESCE(refund.refund_request_count, 0)::integer AS refund_request_count,
    COALESCE(refund.refund_request_amount, 0)::numeric AS refund_request_amount,
    COALESCE(refund.pending_refund_count, 0)::integer AS pending_refund_count,
    COALESCE(refund.pending_refund_amount, 0)::numeric AS pending_refund_amount,
    COALESCE(refund.successful_refund_count, 0)::integer AS successful_refund_count,
    COALESCE(refund.refund_amount, 0)::numeric AS refund_amount,
    COALESCE(refund.failed_refund_count, 0)::integer AS failed_refund_count,
    refund.first_refund_requested_at,
    refund.last_refund_requested_at,
    refund.last_refunded_at,
    COALESCE(refund.successful_refund_processing_hours, 0)::numeric AS successful_refund_processing_hours,
    COALESCE(refund.timed_successful_refund_count, 0)::integer AS timed_successful_refund_count,
    refund.refund_mode,
    refund.refund_inventory_status,
    CASE
      WHEN orders."totalDiscountAmount" <= 0 THEN 'not_discounted'
      WHEN orders."promotionId" IS NOT NULL
        AND LOWER(COALESCE(promotion."approvalStatus", 'missing')) = 'approved'
      THEN 'linked_approved_promotion'
      WHEN orders."promotionId" IS NOT NULL THEN 'review_promotion_not_approved'
      WHEN orders."couponId" IS NOT NULL THEN 'linked_coupon'
      WHEN LOWER(COALESCE(orders."discountSource", 'none')) IN ('manual', 'override', 'staff')
        OR COALESCE(item.has_manual_item_discount, false)
      THEN 'review_manual_source'
      WHEN orders."promotionId" IS NULL AND orders."couponId" IS NULL
      THEN 'review_unlinked_discount'
      ELSE 'source_recorded'
    END::text AS discount_governance_status,
    CASE
      WHEN orders."totalDiscountAmount" <= 0 THEN false
      WHEN orders."promotionId" IS NOT NULL
        AND LOWER(COALESCE(promotion."approvalStatus", 'missing')) <> 'approved'
      THEN true
      WHEN LOWER(COALESCE(orders."discountSource", 'none')) IN ('manual', 'override', 'staff')
        OR COALESCE(item.has_manual_item_discount, false)
      THEN true
      WHEN orders."promotionId" IS NULL AND orders."couponId" IS NULL THEN true
      ELSE false
    END AS discount_review_required,
    CASE
      WHEN COALESCE(refund.refund_request_count, 0) = 0 THEN 'no_refund'
      WHEN COALESCE(refund.pending_refund_count, 0) > 0 THEN 'pending'
      WHEN COALESCE(refund.successful_refund_count, 0) > 0
        AND COALESCE(refund.failed_refund_count, 0) > 0
      THEN 'mixed_result'
      WHEN COALESCE(refund.successful_refund_count, 0) > 0 THEN 'completed'
      ELSE 'failed_or_cancelled'
    END::text AS refund_governance_status
  FROM "ProductOrder" orders
  JOIN "Store" store
    ON store."id" = orders."storeId"
  LEFT JOIN "Customer" customer
    ON customer."id" = orders."customerId"
  LEFT JOIN "Promotion" promotion
    ON promotion."id" = orders."promotionId"
  LEFT JOIN order_item_rollup item
    ON item.order_id = orders."id"
  LEFT JOIN payment_rollup payment
    ON payment.order_id = orders."id"
  LEFT JOIN refund_rollup refund
    ON refund.order_id = orders."id"
  WHERE orders."storeId" IS NOT NULL
), with_staff AS (
  SELECT
    governed.*,
    staff."name" AS primary_staff_name
  FROM governed_orders governed
  LEFT JOIN "Beautician" staff
    ON staff."id" = governed.primary_staff_id
), with_repurchase AS (
  SELECT
    governed.*,
    repurchase.next_order_at
  FROM with_staff governed
  LEFT JOIN LATERAL (
    SELECT MIN(next_order."createdAt") AS next_order_at
    FROM "ProductOrder" next_order
    WHERE governed.customer_id IS NOT NULL
      AND governed.last_refunded_at IS NOT NULL
      AND next_order."storeId" = governed.store_id
      AND next_order."customerId" = governed.customer_id
      AND next_order."id" <> governed.order_id
      AND next_order."status" NOT IN ('cancelled', 'canceled', 'voided')
      AND next_order."createdAt" > governed.last_refunded_at
      AND next_order."createdAt" <= governed.last_refunded_at + INTERVAL '7 days'
  ) repurchase ON true
)
SELECT
  governed.*,
  (
    governed.successful_refund_count > 0
    AND governed.completed_service_count > 0
  ) AS refund_after_completed_service,
  (governed.next_order_at IS NOT NULL) AS repurchased_within_7d,
  (
    governed.last_refunded_at IS NOT NULL
    AND DATE_TRUNC('month', governed.order_created_at) <> DATE_TRUNC('month', governed.last_refunded_at)
  ) AS cross_month_refund,
  CURRENT_TIMESTAMP AS data_as_of
FROM with_repurchase governed;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON ask_data_discount_refund_governance_view TO ask_data_free_sql_readonly;
  END IF;
END
$$;
