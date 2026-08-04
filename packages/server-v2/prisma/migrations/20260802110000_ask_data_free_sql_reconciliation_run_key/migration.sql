-- Expose the non-sensitive run key required to group issues from the latest
-- reconciliation run, while continuing to omit stack traces and internal notes.
CREATE OR REPLACE VIEW ask_data_reconciliation_issue_view AS
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
  issue."resolvedAt" AS resolved_at,
  issue."runId" AS run_id
FROM "FinanceReconciliationIssue" issue
JOIN "FinanceReconciliationRun" run ON run."id" = issue."runId"
JOIN "Store" store ON store."id" = issue."storeId";
