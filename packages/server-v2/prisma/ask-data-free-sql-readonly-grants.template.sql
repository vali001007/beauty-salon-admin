-- Fill in the role password locally and apply with a database administrator.
-- Do not commit credentials or paste them into chat.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    CREATE ROLE ask_data_free_sql_readonly
      LOGIN PASSWORD '<SET_LOCALLY>'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    -- Supabase's postgres role may rotate a non-superuser password, but supautils
    -- rejects restating NOSUPERUSER on an existing role. Attribute convergence is
    -- enforced by the strict admin-side preflight immediately after this transaction.
    ALTER ROLE ask_data_free_sql_readonly PASSWORD '<SET_LOCALLY>';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON DATABASE postgres FROM ask_data_free_sql_readonly;
GRANT CONNECT ON DATABASE postgres TO ask_data_free_sql_readonly;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM ask_data_free_sql_readonly;
GRANT USAGE ON SCHEMA public TO ask_data_free_sql_readonly;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ask_data_free_sql_readonly;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ask_data_free_sql_readonly;

-- Ami Ask reads only the 37 registered views. No base-table access is granted.
GRANT SELECT ON
  agent_v3_order_summary_view,
  agent_v3_order_item_sales_view,
  agent_v3_project_service_sales_view,
  ask_data_item_margin_view,
  agent_v3_payment_refund_view,
  agent_v3_daily_settlement_view,
  agent_v3_product_inventory_view,
  agent_v3_stock_movement_view,
  agent_v3_inventory_scrap_view,
  ask_data_customer_profile_summary_view,
  agent_v3_staff_profile_view,
  ask_data_staff_performance_view,
  agent_v3_reservation_view,
  agent_v3_marketing_conversion_view,
  agent_v3_card_asset_view,
  agent_v3_card_usage_view,
  agent_v3_customer_balance_view,
  agent_v3_service_quality_view,
  agent_v3_appointment_gap_view,
  agent_v3_project_catalog_view,
  agent_v3_marketing_activity_view,
  agent_v3_marketing_automation_view,
  agent_v3_promotion_offer_view,
  ask_data_operating_cost_view,
  agent_v3_purchase_procurement_view,
  agent_v3_supplier_performance_view,
  ask_data_supplier_quote_terms_view,
  ask_data_confirmed_profit_view,
  ask_data_reconciliation_issue_view,
  ask_data_member_liability_view,
  ask_data_staff_capacity_view,
  ask_data_transfer_status_view,
  ask_data_bom_consumption_variance_view,
  ask_data_customer_feedback_view,
  ask_data_customer_lifecycle_view,
  ask_data_marketing_roi_view,
  ask_data_inventory_turnover_view
TO ask_data_free_sql_readonly;

ALTER ROLE ask_data_free_sql_readonly SET default_transaction_read_only = on;
ALTER ROLE ask_data_free_sql_readonly SET search_path = public;
