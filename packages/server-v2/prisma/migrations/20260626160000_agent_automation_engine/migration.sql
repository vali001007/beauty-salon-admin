CREATE TABLE "agent_automation_definitions" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "personaCode" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "triggerType" TEXT NOT NULL,
  "triggerConfigJson" JSONB NOT NULL,
  "actionPlanJson" JSONB NOT NULL,
  "approvalPolicyJson" JSONB,
  "scheduleJson" JSONB,
  "riskLevel" TEXT NOT NULL DEFAULT 'medium',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "sourceRunId" INTEGER,
  "createdBy" INTEGER,
  "lastTriggeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_automation_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_automation_runs" (
  "id" SERIAL NOT NULL,
  "definitionId" INTEGER,
  "storeId" INTEGER NOT NULL,
  "personaCode" TEXT,
  "triggerType" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL,
  "triggeredBy" INTEGER,
  "inputJson" JSONB,
  "outputJson" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "agent_automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_automation_effects" (
  "id" SERIAL NOT NULL,
  "definitionId" INTEGER,
  "runId" INTEGER,
  "storeId" INTEGER NOT NULL,
  "effectType" TEXT NOT NULL,
  "objectType" TEXT,
  "objectId" INTEGER,
  "customerId" INTEGER,
  "metricKey" TEXT,
  "impactJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_automation_effects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_automation_definitions_storeId_status_idx" ON "agent_automation_definitions"("storeId", "status");
CREATE INDEX "agent_automation_definitions_storeId_personaCode_status_idx" ON "agent_automation_definitions"("storeId", "personaCode", "status");
CREATE INDEX "agent_automation_definitions_triggerType_idx" ON "agent_automation_definitions"("triggerType");
CREATE INDEX "agent_automation_definitions_riskLevel_idx" ON "agent_automation_definitions"("riskLevel");
CREATE INDEX "agent_automation_definitions_sourceRunId_idx" ON "agent_automation_definitions"("sourceRunId");

CREATE INDEX "agent_automation_runs_definitionId_startedAt_idx" ON "agent_automation_runs"("definitionId", "startedAt");
CREATE INDEX "agent_automation_runs_storeId_startedAt_idx" ON "agent_automation_runs"("storeId", "startedAt");
CREATE INDEX "agent_automation_runs_storeId_status_idx" ON "agent_automation_runs"("storeId", "status");
CREATE INDEX "agent_automation_runs_triggerType_idx" ON "agent_automation_runs"("triggerType");

CREATE INDEX "agent_automation_effects_definitionId_idx" ON "agent_automation_effects"("definitionId");
CREATE INDEX "agent_automation_effects_runId_idx" ON "agent_automation_effects"("runId");
CREATE INDEX "agent_automation_effects_storeId_occurredAt_idx" ON "agent_automation_effects"("storeId", "occurredAt");
CREATE INDEX "agent_automation_effects_effectType_idx" ON "agent_automation_effects"("effectType");
CREATE INDEX "agent_automation_effects_customerId_idx" ON "agent_automation_effects"("customerId");
CREATE INDEX "agent_automation_effects_status_idx" ON "agent_automation_effects"("status");
