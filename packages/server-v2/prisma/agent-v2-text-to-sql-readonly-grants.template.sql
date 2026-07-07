-- Agent V2 controlled Text-to-SQL readonly role template.
-- Run this as a DBA after applying migration 20260707013000_agent_v2_text_to_sql.
-- Replace the role name and password before execution.

DO $$
DECLARE
  readonly_role text := 'agent_v2_text_to_sql_readonly';
  readonly_password text := 'REPLACE_WITH_STRONG_PASSWORD';
  semantic_views text[] := ARRAY[
    'agent_v2_store_summary_view',
    'agent_v2_customer_profile_summary_view',
    'agent_v2_customer_behavior_view',
    'agent_v2_customer_health_skin_view',
    'agent_v2_order_summary_view',
    'agent_v2_order_item_sales_view',
    'agent_v2_project_service_sales_view',
    'agent_v2_payment_refund_view',
    'agent_v2_daily_settlement_view',
    'agent_v2_cashier_shift_view',
    'agent_v2_product_inventory_view',
    'agent_v2_stock_movement_view',
    'agent_v2_inventory_scrap_view',
    'agent_v2_purchase_procurement_view',
    'agent_v2_supplier_performance_view',
    'agent_v2_project_catalog_view',
    'agent_v2_card_asset_view',
    'agent_v2_card_usage_view',
    'agent_v2_customer_balance_view',
    'agent_v2_reservation_view',
    'agent_v2_schedule_resource_view',
    'agent_v2_staff_profile_view',
    'agent_v2_staff_performance_view',
    'agent_v2_service_quality_view',
    'agent_v2_marketing_activity_view',
    'agent_v2_marketing_conversion_view',
    'agent_v2_marketing_automation_view',
    'agent_v2_promotion_offer_view',
    'agent_v2_customer_app_funnel_view',
    'agent_v2_recommendation_prediction_view',
    'agent_v2_terminal_device_view',
    'agent_v2_print_job_view',
    'agent_v2_appointment_gap_view',
    'agent_v2_industry_template_view',
    'agent_v2_operating_cost_view',
    'agent_v2_store_comparison_view',
    'agent_v2_user_role_permission_view',
    'agent_v2_agent_governance_view',
    'agent_v2_ai_audit_view',
    'agent_v2_data_quality_view'
  ];
  missing_views text[];
  view_name text;
BEGIN
  SELECT array_agg(expected_view)
  INTO missing_views
  FROM unnest(semantic_views) AS expected_view
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = expected_view
  );

  IF COALESCE(array_length(missing_views, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Missing Agent V2 semantic views: %', missing_views;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = readonly_role) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', readonly_role, readonly_password);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', readonly_role, readonly_password);
  END IF;

  EXECUTE format('ALTER ROLE %I SET default_transaction_read_only = on', readonly_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', readonly_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', readonly_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', readonly_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', readonly_role);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', readonly_role);

  FOREACH view_name IN ARRAY semantic_views LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO %I', view_name, readonly_role);
  END LOOP;

  IF has_schema_privilege(readonly_role, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Readonly role % still has CREATE privilege on schema public, possibly through PUBLIC. Revoke schema CREATE before using this role.', readonly_role;
  END IF;
END $$;
