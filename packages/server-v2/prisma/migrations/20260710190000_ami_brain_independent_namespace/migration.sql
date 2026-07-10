-- Ami Brain independent namespace.
-- Creates only brain_* owned tables, enums, indexes and internal foreign keys.

CREATE TYPE "BrainMessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE "BrainMemoryType" AS ENUM ('working', 'session', 'episodic', 'semantic', 'procedural');
CREATE TYPE "BrainSkillType" AS ENUM ('query', 'analysis', 'risk', 'action', 'prediction');
CREATE TYPE "BrainRiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "BrainRunStatus" AS ENUM ('queued', 'running', 'needs_confirmation', 'completed', 'failed', 'cancelled');
CREATE TYPE "BrainReleaseStatus" AS ENUM ('draft', 'active', 'rolled_back', 'archived');

CREATE TABLE "brain_conversation" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "brain_conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_message" (
  "id" SERIAL NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "role" "BrainMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "brain_message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_memory" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "userId" INTEGER,
  "type" "BrainMemoryType" NOT NULL,
  "subjectKey" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "sourceRunId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "brain_memory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_ontology_entity" (
  "id" SERIAL NOT NULL,
  "domain" TEXT NOT NULL,
  "entityKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "synonyms" JSONB NOT NULL,
  "attributes" JSONB NOT NULL,
  "tableMap" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_ontology_entity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_ontology_relation" (
  "id" SERIAL NOT NULL,
  "relationKey" TEXT NOT NULL,
  "fromEntityKey" TEXT NOT NULL,
  "toEntityKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "joinPath" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_ontology_relation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_kg_node" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER,
  "nodeKey" TEXT NOT NULL,
  "entityKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_kg_node_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_kg_edge" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER,
  "edgeKey" TEXT NOT NULL,
  "fromNodeKey" TEXT NOT NULL,
  "toNodeKey" TEXT NOT NULL,
  "relationKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_kg_edge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_metric" (
  "id" SERIAL NOT NULL,
  "metricKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "formula" JSONB NOT NULL,
  "sourceTables" JSONB NOT NULL,
  "defaultFilters" JSONB,
  "permissions" JSONB NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_metric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_dimension" (
  "id" SERIAL NOT NULL,
  "dimensionKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "source" JSONB NOT NULL,
  "permissions" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_dimension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_skill_registry" (
  "id" SERIAL NOT NULL,
  "skillKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "BrainSkillType" NOT NULL,
  "inputSchema" JSONB NOT NULL,
  "outputSchema" JSONB NOT NULL,
  "permissions" JSONB NOT NULL,
  "riskLevel" "BrainRiskLevel" NOT NULL DEFAULT 'low',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_skill_registry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_agent_profile" (
  "id" SERIAL NOT NULL,
  "roleKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "systemPrompt" TEXT NOT NULL,
  "allowedSkills" JSONB NOT NULL,
  "dataScopeRules" JSONB NOT NULL,
  "knowledgePack" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_agent_profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_inspection_rule" (
  "id" SERIAL NOT NULL,
  "ruleKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "scheduleCron" TEXT,
  "eventTrigger" TEXT,
  "condition" JSONB NOT NULL,
  "suggestionTpl" JSONB NOT NULL,
  "riskLevel" "BrainRiskLevel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_inspection_rule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_run" (
  "id" SERIAL NOT NULL,
  "conversationId" INTEGER,
  "storeId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" "BrainRunStatus" NOT NULL DEFAULT 'queued',
  "input" JSONB NOT NULL,
  "output" JSONB,
  "cost" JSONB,
  "latencyMs" INTEGER,
  "error" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_run_step" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "stepKey" TEXT NOT NULL,
  "layer" TEXT NOT NULL,
  "input" JSONB,
  "output" JSONB,
  "status" TEXT NOT NULL,
  "latencyMs" INTEGER,
  "error" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "brain_run_step_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_eval_case" (
  "id" SERIAL NOT NULL,
  "caseKey" TEXT NOT NULL,
  "roleKey" TEXT,
  "scenario" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "expected" JSONB NOT NULL,
  "assertionType" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_eval_case_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_eval_run" (
  "id" SERIAL NOT NULL,
  "releaseId" INTEGER,
  "status" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "results" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "brain_eval_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_release" (
  "id" SERIAL NOT NULL,
  "releaseKey" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "versionMap" JSONB NOT NULL,
  "rollout" JSONB NOT NULL,
  "status" "BrainReleaseStatus" NOT NULL DEFAULT 'draft',
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_release_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_feedback" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "rating" TEXT NOT NULL,
  "correction" JSONB,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_action_confirmation" (
  "id" SERIAL NOT NULL,
  "actionId" TEXT NOT NULL,
  "runId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "skillKey" TEXT NOT NULL,
  "riskLevel" "BrainRiskLevel" NOT NULL,
  "preview" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "confirmedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brain_action_confirmation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brain_conversation_storeId_userId_updatedAt_idx" ON "brain_conversation"("storeId", "userId", "updatedAt");

CREATE INDEX "brain_message_conversationId_createdAt_idx" ON "brain_message"("conversationId", "createdAt");

CREATE INDEX "brain_memory_storeId_type_subjectKey_idx" ON "brain_memory"("storeId", "type", "subjectKey");
CREATE INDEX "brain_memory_expiresAt_idx" ON "brain_memory"("expiresAt");

CREATE UNIQUE INDEX "brain_ontology_entity_entityKey_version_key" ON "brain_ontology_entity"("entityKey", "version");
CREATE INDEX "brain_ontology_entity_domain_status_idx" ON "brain_ontology_entity"("domain", "status");

CREATE UNIQUE INDEX "brain_ontology_relation_relationKey_version_key" ON "brain_ontology_relation"("relationKey", "version");
CREATE INDEX "brain_ontology_relation_fromEntityKey_toEntityKey_idx" ON "brain_ontology_relation"("fromEntityKey", "toEntityKey");

CREATE UNIQUE INDEX "brain_kg_node_storeId_nodeKey_key" ON "brain_kg_node"("storeId", "nodeKey");
CREATE INDEX "brain_kg_node_entityKey_idx" ON "brain_kg_node"("entityKey");

CREATE UNIQUE INDEX "brain_kg_edge_storeId_edgeKey_key" ON "brain_kg_edge"("storeId", "edgeKey");
CREATE INDEX "brain_kg_edge_fromNodeKey_toNodeKey_idx" ON "brain_kg_edge"("fromNodeKey", "toNodeKey");

CREATE UNIQUE INDEX "brain_metric_metricKey_version_key" ON "brain_metric"("metricKey", "version");
CREATE INDEX "brain_metric_domain_status_idx" ON "brain_metric"("domain", "status");

CREATE UNIQUE INDEX "brain_dimension_dimensionKey_version_key" ON "brain_dimension"("dimensionKey", "version");
CREATE INDEX "brain_dimension_domain_status_idx" ON "brain_dimension"("domain", "status");

CREATE UNIQUE INDEX "brain_skill_registry_skillKey_version_key" ON "brain_skill_registry"("skillKey", "version");
CREATE INDEX "brain_skill_registry_type_enabled_idx" ON "brain_skill_registry"("type", "enabled");

CREATE UNIQUE INDEX "brain_agent_profile_roleKey_version_key" ON "brain_agent_profile"("roleKey", "version");
CREATE INDEX "brain_agent_profile_enabled_idx" ON "brain_agent_profile"("enabled");

CREATE UNIQUE INDEX "brain_inspection_rule_ruleKey_version_key" ON "brain_inspection_rule"("ruleKey", "version");
CREATE INDEX "brain_inspection_rule_domain_enabled_idx" ON "brain_inspection_rule"("domain", "enabled");

CREATE INDEX "brain_run_storeId_userId_createdAt_idx" ON "brain_run"("storeId", "userId", "createdAt");
CREATE INDEX "brain_run_status_idx" ON "brain_run"("status");

CREATE INDEX "brain_run_step_runId_createdAt_idx" ON "brain_run_step"("runId", "createdAt");

CREATE UNIQUE INDEX "brain_eval_case_caseKey_key" ON "brain_eval_case"("caseKey");
CREATE INDEX "brain_eval_case_scenario_enabled_idx" ON "brain_eval_case"("scenario", "enabled");

CREATE INDEX "brain_eval_run_releaseId_createdAt_idx" ON "brain_eval_run"("releaseId", "createdAt");

CREATE UNIQUE INDEX "brain_release_releaseKey_key" ON "brain_release"("releaseKey");
CREATE INDEX "brain_release_scope_status_idx" ON "brain_release"("scope", "status");

CREATE INDEX "brain_feedback_storeId_status_createdAt_idx" ON "brain_feedback"("storeId", "status", "createdAt");

CREATE UNIQUE INDEX "brain_action_confirmation_actionId_key" ON "brain_action_confirmation"("actionId");
CREATE INDEX "brain_action_confirmation_runId_status_idx" ON "brain_action_confirmation"("runId", "status");

ALTER TABLE "brain_message"
  ADD CONSTRAINT "brain_message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "brain_conversation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brain_run"
  ADD CONSTRAINT "brain_run_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "brain_conversation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_run_step"
  ADD CONSTRAINT "brain_run_step_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "brain_run"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
