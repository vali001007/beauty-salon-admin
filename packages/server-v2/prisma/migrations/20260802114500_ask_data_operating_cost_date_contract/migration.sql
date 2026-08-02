CREATE VIEW ask_data_operating_cost_view AS
SELECT
  cost.store_id,
  cost.store_name,
  cost.cost_id,
  CASE
    WHEN cost.period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
      THEN TO_DATE(cost.period_month || '-01', 'YYYY-MM-DD')
    ELSE NULL
  END AS period_month,
  cost.cost_date,
  cost.category,
  cost.amount,
  cost.allocation_type
FROM agent_v3_operating_cost_view cost;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON ask_data_operating_cost_view TO ask_data_free_sql_readonly;
  END IF;
END
$$;
