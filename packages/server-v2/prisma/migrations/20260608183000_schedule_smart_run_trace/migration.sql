-- Add smart scheduling trace to published schedules
ALTER TABLE "Schedule" ADD COLUMN "smartRunId" TEXT;

CREATE INDEX "Schedule_smartRunId_idx" ON "Schedule"("smartRunId");

ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_smartRunId_fkey" FOREIGN KEY ("smartRunId") REFERENCES "SmartSchedulingRun"("runId") ON DELETE SET NULL ON UPDATE CASCADE;
