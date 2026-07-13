CREATE TABLE "brain_inspection_run" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "ruleCount" INTEGER NOT NULL DEFAULT 0,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "error" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brain_inspection_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_inspection_finding" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER,
    "storeId" INTEGER NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "severity" "BrainRiskLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "suggestion" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "disposition" TEXT,
    "dispositionNote" TEXT,
    "feedback" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_inspection_finding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brain_inspection_run_storeId_startedAt_idx" ON "brain_inspection_run"("storeId", "startedAt");
CREATE INDEX "brain_inspection_run_status_startedAt_idx" ON "brain_inspection_run"("status", "startedAt");
CREATE UNIQUE INDEX "brain_inspection_finding_storeId_dedupeKey_key" ON "brain_inspection_finding"("storeId", "dedupeKey");
CREATE INDEX "brain_inspection_finding_storeId_status_severity_idx" ON "brain_inspection_finding"("storeId", "status", "severity");
CREATE INDEX "brain_inspection_finding_ruleKey_status_idx" ON "brain_inspection_finding"("ruleKey", "status");
CREATE INDEX "brain_inspection_finding_runId_idx" ON "brain_inspection_finding"("runId");
ALTER TABLE "brain_inspection_finding" ADD CONSTRAINT "brain_inspection_finding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "brain_inspection_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
