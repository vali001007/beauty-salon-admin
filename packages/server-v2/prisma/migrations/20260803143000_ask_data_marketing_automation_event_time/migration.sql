-- Ask needs the time predicate to constrain the task facts themselves.  The
-- legacy view grouped all historical tasks first and exposed MAX(createdAt),
-- so a recent-date filter selected groups whose counts still included older
-- tasks.  Preserve the public column contract while exposing one task fact per
-- row; Ask can then aggregate task_count/completed_count after applying the
-- governed event-time range.
CREATE OR REPLACE VIEW agent_v3_marketing_automation_view AS
SELECT
  task."storeId" AS store_id,
  store."name" AS store_name,
  task."source" AS automation_source,
  task."triggerType" AS trigger_type,
  task."status",
  1::integer AS task_count,
  task."createdAt"::timestamp without time zone AS latest_task_at,
  CASE WHEN task."completedAt" IS NULL THEN 0 ELSE 1 END::integer AS completed_count
FROM "TerminalFollowUpTask" task
JOIN "Store" store ON store."id" = task."storeId"
WHERE task."deletedAt" IS NULL;

CREATE INDEX "TerminalFollowUpTask_storeId_createdAt_active_idx"
  ON "TerminalFollowUpTask"("storeId", "createdAt")
  WHERE "deletedAt" IS NULL;
