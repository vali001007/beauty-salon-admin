CREATE TABLE "agent_run_audit_details" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "storeId" INTEGER,
  "userId" INTEGER,
  "role" TEXT,
  "entrypoint" TEXT,
  "agentCode" TEXT,
  "personaCode" TEXT,
  "question" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "capabilityId" TEXT,
  "knowledgeGraphJson" JSONB,
  "llmPromptJson" JSONB,
  "llmResponseJson" JSONB,
  "structuredIntentJson" JSONB,
  "capabilityMappingJson" JSONB,
  "policyDecisionJson" JSONB,
  "toolTraceJson" JSONB,
  "contractValidationJson" JSONB,
  "latencyBreakdownJson" JSONB,
  "costJson" JSONB,
  "riskJson" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_run_audit_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_eval_case_results" (
  "id" SERIAL NOT NULL,
  "evalRunId" INTEGER,
  "caseId" INTEGER,
  "questionId" TEXT,
  "question" TEXT NOT NULL,
  "roleGroup" TEXT,
  "expectedCapabilityId" TEXT,
  "actualCapabilityId" TEXT,
  "expectedOutputKind" TEXT,
  "actualOutputKind" TEXT,
  "status" TEXT NOT NULL,
  "pass" BOOLEAN NOT NULL DEFAULT false,
  "score" DOUBLE PRECISION,
  "failureCategory" TEXT,
  "errorMessage" TEXT,
  "latencyMs" INTEGER,
  "cacheHit" BOOLEAN,
  "fallbackUsed" BOOLEAN,
  "resultJson" JSONB,
  "traceJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_eval_case_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_auto_publish_logs" (
  "id" SERIAL NOT NULL,
  "runNo" TEXT,
  "source" TEXT NOT NULL DEFAULT 'ci',
  "scanMode" TEXT NOT NULL DEFAULT 'hash',
  "status" TEXT NOT NULL,
  "capabilityId" TEXT,
  "draftId" INTEGER,
  "publishRunId" INTEGER,
  "releaseStrategy" TEXT,
  "riskLevel" TEXT,
  "decision" TEXT,
  "summary" TEXT,
  "inputJson" JSONB,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "triggeredBy" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_auto_publish_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_health_metrics" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER,
  "metricKey" TEXT NOT NULL,
  "metricType" TEXT NOT NULL DEFAULT 'gauge',
  "valueFloat" DOUBLE PRECISION,
  "valueInt" INTEGER,
  "valueText" TEXT,
  "unit" TEXT,
  "windowStart" TIMESTAMP(3),
  "windowEnd" TIMESTAMP(3),
  "dimensionsJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'normal',
  "source" TEXT NOT NULL DEFAULT 'agent_v2_governance',
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_health_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_run_audit_details_runId_key" ON "agent_run_audit_details"("runId");
CREATE INDEX "agent_run_audit_details_storeId_createdAt_idx" ON "agent_run_audit_details"("storeId", "createdAt");
CREATE INDEX "agent_run_audit_details_userId_idx" ON "agent_run_audit_details"("userId");
CREATE INDEX "agent_run_audit_details_status_idx" ON "agent_run_audit_details"("status");
CREATE INDEX "agent_run_audit_details_capabilityId_idx" ON "agent_run_audit_details"("capabilityId");
CREATE INDEX "agent_run_audit_details_agentCode_idx" ON "agent_run_audit_details"("agentCode");
CREATE INDEX "agent_run_audit_details_personaCode_idx" ON "agent_run_audit_details"("personaCode");

CREATE INDEX "agent_eval_case_results_evalRunId_idx" ON "agent_eval_case_results"("evalRunId");
CREATE INDEX "agent_eval_case_results_caseId_idx" ON "agent_eval_case_results"("caseId");
CREATE INDEX "agent_eval_case_results_questionId_idx" ON "agent_eval_case_results"("questionId");
CREATE INDEX "agent_eval_case_results_status_idx" ON "agent_eval_case_results"("status");
CREATE INDEX "agent_eval_case_results_pass_idx" ON "agent_eval_case_results"("pass");
CREATE INDEX "agent_eval_case_results_expectedCapabilityId_idx" ON "agent_eval_case_results"("expectedCapabilityId");
CREATE INDEX "agent_eval_case_results_actualCapabilityId_idx" ON "agent_eval_case_results"("actualCapabilityId");
CREATE INDEX "agent_eval_case_results_failureCategory_idx" ON "agent_eval_case_results"("failureCategory");

CREATE INDEX "agent_auto_publish_logs_runNo_idx" ON "agent_auto_publish_logs"("runNo");
CREATE INDEX "agent_auto_publish_logs_source_idx" ON "agent_auto_publish_logs"("source");
CREATE INDEX "agent_auto_publish_logs_scanMode_idx" ON "agent_auto_publish_logs"("scanMode");
CREATE INDEX "agent_auto_publish_logs_status_idx" ON "agent_auto_publish_logs"("status");
CREATE INDEX "agent_auto_publish_logs_capabilityId_idx" ON "agent_auto_publish_logs"("capabilityId");
CREATE INDEX "agent_auto_publish_logs_draftId_idx" ON "agent_auto_publish_logs"("draftId");
CREATE INDEX "agent_auto_publish_logs_publishRunId_idx" ON "agent_auto_publish_logs"("publishRunId");
CREATE INDEX "agent_auto_publish_logs_triggeredBy_idx" ON "agent_auto_publish_logs"("triggeredBy");
CREATE INDEX "agent_auto_publish_logs_startedAt_idx" ON "agent_auto_publish_logs"("startedAt");

CREATE INDEX "agent_health_metrics_storeId_collectedAt_idx" ON "agent_health_metrics"("storeId", "collectedAt");
CREATE INDEX "agent_health_metrics_metricKey_collectedAt_idx" ON "agent_health_metrics"("metricKey", "collectedAt");
CREATE INDEX "agent_health_metrics_metricType_idx" ON "agent_health_metrics"("metricType");
CREATE INDEX "agent_health_metrics_status_idx" ON "agent_health_metrics"("status");
CREATE INDEX "agent_health_metrics_source_idx" ON "agent_health_metrics"("source");
CREATE INDEX "agent_health_metrics_collectedAt_idx" ON "agent_health_metrics"("collectedAt");

ALTER TABLE "agent_eval_case_results"
  ADD CONSTRAINT "agent_eval_case_results_evalRunId_fkey"
  FOREIGN KEY ("evalRunId") REFERENCES "agent_eval_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
