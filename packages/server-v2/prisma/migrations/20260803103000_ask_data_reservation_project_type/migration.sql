CREATE OR REPLACE VIEW agent_v3_reservation_view AS
SELECT
  r."storeId" AS store_id,
  s."name" AS store_name,
  r."id" AS reservation_id,
  r."customerId" AS customer_id,
  CASE
    WHEN c."name" IS NULL OR c."name" = '' THEN NULL
    ELSE concat(left(c."name", 1), '***')
  END AS customer_name_masked,
  r."projectId" AS project_id,
  p."name" AS project_name,
  r."beauticianId" AS beautician_id,
  b."name" AS beautician_name,
  r."date",
  r."startTime" AS start_time,
  r."status",
  pt."name" AS project_type
FROM "Reservation" r
JOIN "Store" s ON s."id" = r."storeId"
JOIN "Customer" c ON c."id" = r."customerId"
JOIN "Project" p ON p."id" = r."projectId"
LEFT JOIN "ProjectType" pt ON pt."id" = p."typeId"
LEFT JOIN "Beautician" b ON b."id" = r."beauticianId";
