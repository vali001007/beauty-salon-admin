-- Ask treats service-task status as a governed text dimension. Keeping the
-- PostgreSQL enum in the semantic view makes an unknown model literal fail the
-- entire read-only query instead of simply returning no match.
DROP VIEW agent_v3_service_quality_view;

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
  st."status"::text AS status,
  st."appointmentTime" AS appointment_time,
  st."completedAt" AS completed_at
FROM "ServiceTask" st
JOIN "Store" s ON s."id" = st."storeId"
JOIN "Project" p ON p."id" = st."projectId"
LEFT JOIN "Beautician" b ON b."id" = st."beauticianId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON agent_v3_service_quality_view TO ask_data_free_sql_readonly;
  END IF;
END
$$;
