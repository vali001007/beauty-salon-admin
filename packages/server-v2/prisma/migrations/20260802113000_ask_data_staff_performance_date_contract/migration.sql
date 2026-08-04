CREATE VIEW ask_data_staff_performance_view AS
SELECT
  performance.store_id,
  performance.store_name,
  performance.staff_id,
  performance.staff_name,
  CASE
    WHEN performance.settle_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
      THEN TO_DATE(performance.settle_month || '-01', 'YYYY-MM-DD')
    ELSE NULL
  END AS settle_month,
  performance.paid_amount,
  performance.average_order_amount,
  performance.commission_amount,
  performance.service_count
FROM agent_v3_staff_performance_view performance;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON ask_data_staff_performance_view TO ask_data_free_sql_readonly;
  END IF;
END
$$;
