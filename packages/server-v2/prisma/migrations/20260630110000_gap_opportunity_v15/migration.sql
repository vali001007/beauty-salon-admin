-- Demand heatmap gap opportunity V1.5

CREATE TABLE IF NOT EXISTS "AppointmentGapOpportunity" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "beauticianIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "projectIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "durationMinutes" INTEGER NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "bookedCount" INTEGER NOT NULL DEFAULT 0,
  "availableCapacity" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'heatmap',
  "gapType" TEXT NOT NULL DEFAULT 'available_capacity',
  "score" INTEGER NOT NULL DEFAULT 0,
  "estimatedRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expectedFillRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "confirmationDraftJson" JSONB,
  "payload" JSONB,
  "expiresAt" TIMESTAMP(3),
  "lastGeneratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AppointmentGapCandidate" (
  "id" SERIAL PRIMARY KEY,
  "opportunityId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "projectId" INTEGER,
  "followUpTaskId" INTEGER,
  "score" INTEGER NOT NULL DEFAULT 0,
  "expectedFillRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "estimatedRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "recommendedChannel" TEXT NOT NULL DEFAULT 'phone',
  "messageDraft" TEXT,
  "reasonJson" JSONB,
  "riskJson" JSONB,
  "scoreBreakdown" JSONB,
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AppointmentGapOpportunityEvent" (
  "id" SERIAL PRIMARY KEY,
  "opportunityId" INTEGER NOT NULL,
  "candidateId" INTEGER,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER,
  "eventType" TEXT NOT NULL,
  "note" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapOpportunity_storeId_fkey') THEN
    ALTER TABLE "AppointmentGapOpportunity" ADD CONSTRAINT "AppointmentGapOpportunity_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapCandidate_opportunityId_fkey') THEN
    ALTER TABLE "AppointmentGapCandidate" ADD CONSTRAINT "AppointmentGapCandidate_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES "AppointmentGapOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapCandidate_storeId_fkey') THEN
    ALTER TABLE "AppointmentGapCandidate" ADD CONSTRAINT "AppointmentGapCandidate_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapCandidate_customerId_fkey') THEN
    ALTER TABLE "AppointmentGapCandidate" ADD CONSTRAINT "AppointmentGapCandidate_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapCandidate_projectId_fkey') THEN
    ALTER TABLE "AppointmentGapCandidate" ADD CONSTRAINT "AppointmentGapCandidate_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapCandidate_followUpTaskId_fkey') THEN
    ALTER TABLE "AppointmentGapCandidate" ADD CONSTRAINT "AppointmentGapCandidate_followUpTaskId_fkey"
      FOREIGN KEY ("followUpTaskId") REFERENCES "TerminalFollowUpTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapOpportunityEvent_opportunityId_fkey') THEN
    ALTER TABLE "AppointmentGapOpportunityEvent" ADD CONSTRAINT "AppointmentGapOpportunityEvent_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES "AppointmentGapOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapOpportunityEvent_candidateId_fkey') THEN
    ALTER TABLE "AppointmentGapOpportunityEvent" ADD CONSTRAINT "AppointmentGapOpportunityEvent_candidateId_fkey"
      FOREIGN KEY ("candidateId") REFERENCES "AppointmentGapCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapOpportunityEvent_storeId_fkey') THEN
    ALTER TABLE "AppointmentGapOpportunityEvent" ADD CONSTRAINT "AppointmentGapOpportunityEvent_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppointmentGapOpportunityEvent_customerId_fkey') THEN
    ALTER TABLE "AppointmentGapOpportunityEvent" ADD CONSTRAINT "AppointmentGapOpportunityEvent_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentGapOpportunity_storeId_date_startTime_endTime_key"
  ON "AppointmentGapOpportunity"("storeId", "date", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "AppointmentGapOpportunity_storeId_date_idx"
  ON "AppointmentGapOpportunity"("storeId", "date");
CREATE INDEX IF NOT EXISTS "AppointmentGapOpportunity_storeId_status_date_idx"
  ON "AppointmentGapOpportunity"("storeId", "status", "date");
CREATE INDEX IF NOT EXISTS "AppointmentGapOpportunity_expiresAt_idx"
  ON "AppointmentGapOpportunity"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AppointmentGapCandidate_opportunityId_customerId_key"
  ON "AppointmentGapCandidate"("opportunityId", "customerId");
CREATE INDEX IF NOT EXISTS "AppointmentGapCandidate_storeId_status_idx"
  ON "AppointmentGapCandidate"("storeId", "status");
CREATE INDEX IF NOT EXISTS "AppointmentGapCandidate_customerId_status_idx"
  ON "AppointmentGapCandidate"("customerId", "status");
CREATE INDEX IF NOT EXISTS "AppointmentGapCandidate_followUpTaskId_idx"
  ON "AppointmentGapCandidate"("followUpTaskId");
CREATE INDEX IF NOT EXISTS "AppointmentGapCandidate_projectId_idx"
  ON "AppointmentGapCandidate"("projectId");

CREATE INDEX IF NOT EXISTS "AppointmentGapOpportunityEvent_opportunityId_createdAt_idx"
  ON "AppointmentGapOpportunityEvent"("opportunityId", "createdAt");
CREATE INDEX IF NOT EXISTS "AppointmentGapOpportunityEvent_candidateId_idx"
  ON "AppointmentGapOpportunityEvent"("candidateId");
CREATE INDEX IF NOT EXISTS "AppointmentGapOpportunityEvent_storeId_eventType_createdAt_idx"
  ON "AppointmentGapOpportunityEvent"("storeId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "AppointmentGapOpportunityEvent_customerId_idx"
  ON "AppointmentGapOpportunityEvent"("customerId");
