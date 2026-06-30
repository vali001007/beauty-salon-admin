-- One-click smart scheduling V1

ALTER TABLE "Schedule"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "versionId" INTEGER,
  ADD COLUMN IF NOT EXISTS "optimizationRunId" TEXT;

ALTER TABLE "SchedulingRuleConfig"
  ADD COLUMN IF NOT EXISTS "algorithmMode" TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS "objectiveWeights" JSONB,
  ADD COLUMN IF NOT EXISTS "allowReassignUnconfirmedReservation" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowReassignConfirmedReservation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "walkInBufferRules" JSONB,
  ADD COLUMN IF NOT EXISTS "lockedAfterPublished" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "SmartSchedulingRun"
  ADD COLUMN IF NOT EXISTS "algorithmVersion" TEXT NOT NULL DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS "objectiveWeights" JSONB,
  ADD COLUMN IF NOT EXISTS "inputSummary" JSONB,
  ADD COLUMN IF NOT EXISTS "solutionSummary" JSONB,
  ADD COLUMN IF NOT EXISTS "alternatives" JSONB,
  ADD COLUMN IF NOT EXISTS "runtimeMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "solverStatus" TEXT NOT NULL DEFAULT 'feasible',
  ADD COLUMN IF NOT EXISTS "publishedScheduleVersionId" INTEGER;

CREATE TABLE IF NOT EXISTS "ScheduleVersion" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'published',
  "sourceRunId" TEXT,
  "publishedById" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "rollbackFromVersionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Schedule_versionId_fkey') THEN
    ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_versionId_fkey"
      FOREIGN KEY ("versionId") REFERENCES "ScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SmartSchedulingRun_publishedScheduleVersionId_fkey') THEN
    ALTER TABLE "SmartSchedulingRun" ADD CONSTRAINT "SmartSchedulingRun_publishedScheduleVersionId_fkey"
      FOREIGN KEY ("publishedScheduleVersionId") REFERENCES "ScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleVersion_storeId_fkey') THEN
    ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleVersion_sourceRunId_fkey') THEN
    ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_sourceRunId_fkey"
      FOREIGN KEY ("sourceRunId") REFERENCES "SmartSchedulingRun"("runId") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleVersion_publishedById_fkey') THEN
    ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_publishedById_fkey"
      FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleVersion_rollbackFromVersionId_fkey') THEN
    ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_rollbackFromVersionId_fkey"
      FOREIGN KEY ("rollbackFromVersionId") REFERENCES "ScheduleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Schedule_versionId_idx" ON "Schedule"("versionId");
CREATE INDEX IF NOT EXISTS "Schedule_optimizationRunId_idx" ON "Schedule"("optimizationRunId");
CREATE INDEX IF NOT EXISTS "SmartSchedulingRun_publishedScheduleVersionId_idx" ON "SmartSchedulingRun"("publishedScheduleVersionId");
CREATE INDEX IF NOT EXISTS "ScheduleVersion_storeId_weekStart_idx" ON "ScheduleVersion"("storeId", "weekStart");
CREATE INDEX IF NOT EXISTS "ScheduleVersion_status_idx" ON "ScheduleVersion"("status");
CREATE INDEX IF NOT EXISTS "ScheduleVersion_sourceRunId_idx" ON "ScheduleVersion"("sourceRunId");
CREATE INDEX IF NOT EXISTS "ScheduleVersion_publishedById_idx" ON "ScheduleVersion"("publishedById");
