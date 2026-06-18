CREATE TABLE "agent_definitions" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "roleScope" JSONB,
  "configJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "agent_definitions_status_idx" ON "agent_definitions"("status");

CREATE TABLE "agent_runs" (
  "id" SERIAL PRIMARY KEY,
  "runNo" TEXT NOT NULL UNIQUE,
  "storeId" INTEGER NOT NULL,
  "userId" INTEGER,
  "deviceId" INTEGER,
  "role" TEXT NOT NULL,
  "entrypoint" TEXT NOT NULL DEFAULT 'api',
  "agentCode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "userInput" TEXT NOT NULL,
  "planJson" JSONB,
  "contextJson" JSONB,
  "evidenceJson" JSONB,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "agent_runs_storeId_createdAt_idx" ON "agent_runs"("storeId", "createdAt");
CREATE INDEX "agent_runs_userId_idx" ON "agent_runs"("userId");
CREATE INDEX "agent_runs_deviceId_idx" ON "agent_runs"("deviceId");
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");
CREATE INDEX "agent_runs_agentCode_idx" ON "agent_runs"("agentCode");

CREATE TABLE "agent_messages" (
  "id" SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "agent_messages_runId_createdAt_idx" ON "agent_messages"("runId", "createdAt");

CREATE TABLE "agent_steps" (
  "id" SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL,
  "stepType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "inputJson" JSONB,
  "outputJson" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3)
);

CREATE INDEX "agent_steps_runId_startedAt_idx" ON "agent_steps"("runId", "startedAt");
CREATE INDEX "agent_steps_status_idx" ON "agent_steps"("status");

CREATE TABLE "agent_tool_calls" (
  "id" SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL,
  "toolName" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "argsJson" JSONB NOT NULL,
  "resultJson" JSONB,
  "approvalId" INTEGER,
  "idempotencyKey" TEXT,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE INDEX "agent_tool_calls_runId_createdAt_idx" ON "agent_tool_calls"("runId", "createdAt");
CREATE INDEX "agent_tool_calls_toolName_idx" ON "agent_tool_calls"("toolName");
CREATE INDEX "agent_tool_calls_riskLevel_idx" ON "agent_tool_calls"("riskLevel");
CREATE INDEX "agent_tool_calls_status_idx" ON "agent_tool_calls"("status");
CREATE INDEX "agent_tool_calls_approvalId_idx" ON "agent_tool_calls"("approvalId");

CREATE TABLE "agent_approvals" (
  "id" SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL,
  "toolCallId" INTEGER,
  "status" TEXT NOT NULL,
  "requestedBy" INTEGER,
  "approvedBy" INTEGER,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3)
);

CREATE INDEX "agent_approvals_runId_createdAt_idx" ON "agent_approvals"("runId", "createdAt");
CREATE INDEX "agent_approvals_toolCallId_idx" ON "agent_approvals"("toolCallId");
CREATE INDEX "agent_approvals_status_idx" ON "agent_approvals"("status");

CREATE TABLE "agent_eval_cases" (
  "id" SERIAL PRIMARY KEY,
  "scenario" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "expectedTool" TEXT,
  "expectedOutcome" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "agent_eval_cases_scenario_idx" ON "agent_eval_cases"("scenario");
CREATE INDEX "agent_eval_cases_status_idx" ON "agent_eval_cases"("status");

CREATE TABLE "agent_eval_runs" (
  "id" SERIAL PRIMARY KEY,
  "caseId" INTEGER,
  "runId" INTEGER,
  "status" TEXT NOT NULL,
  "score" DECIMAL(65,30),
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "agent_eval_runs_caseId_idx" ON "agent_eval_runs"("caseId");
CREATE INDEX "agent_eval_runs_runId_idx" ON "agent_eval_runs"("runId");
CREATE INDEX "agent_eval_runs_status_idx" ON "agent_eval_runs"("status");
