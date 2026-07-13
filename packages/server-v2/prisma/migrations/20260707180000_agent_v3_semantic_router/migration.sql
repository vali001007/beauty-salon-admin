-- Agent V3 independent semantic router state.
-- These tables keep V3 KG snapshots, routing examples and routing feedback separate from Agent V2 runtime state.

CREATE TABLE IF NOT EXISTS "agent_v3_semantic_kg_snapshots" (
  "id" SERIAL PRIMARY KEY,
  "version" TEXT NOT NULL UNIQUE,
  "source" TEXT NOT NULL DEFAULT 'v3_kg_local_fixture',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "snapshotJson" JSONB NOT NULL,
  "statsJson" JSONB,
  "generatedFromVersion" TEXT,
  "activatedAt" TIMESTAMP(3),
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agent_v3_semantic_kg_snapshots_status_idx" ON "agent_v3_semantic_kg_snapshots" ("status");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_kg_snapshots_source_idx" ON "agent_v3_semantic_kg_snapshots" ("source");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_kg_snapshots_createdAt_idx" ON "agent_v3_semantic_kg_snapshots" ("createdAt");

CREATE TABLE IF NOT EXISTS "agent_v3_semantic_entities" (
  "id" SERIAL PRIMARY KEY,
  "entityType" TEXT NOT NULL UNIQUE,
  "canonicalName" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "aliasesJson" JSONB NOT NULL,
  "expectedFields" JSONB NOT NULL,
  "forbiddenFields" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'v3_kg_snapshot',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agent_v3_semantic_entities_domain_idx" ON "agent_v3_semantic_entities" ("domain");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_entities_status_idx" ON "agent_v3_semantic_entities" ("status");

CREATE TABLE IF NOT EXISTS "agent_v3_semantic_metrics" (
  "id" SERIAL PRIMARY KEY,
  "canonicalName" TEXT NOT NULL UNIQUE,
  "metricType" TEXT NOT NULL,
  "aliasesJson" JSONB NOT NULL,
  "fieldsJson" JSONB NOT NULL,
  "sortDirection" TEXT,
  "defaultByEntity" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'v3_kg_snapshot',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agent_v3_semantic_metrics_metricType_idx" ON "agent_v3_semantic_metrics" ("metricType");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_metrics_status_idx" ON "agent_v3_semantic_metrics" ("status");

CREATE TABLE IF NOT EXISTS "agent_v3_semantic_view_bindings" (
  "id" SERIAL PRIMARY KEY,
  "entityType" TEXT NOT NULL,
  "metricName" TEXT NOT NULL,
  "viewName" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reasonsJson" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'v3_kg_snapshot',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_v3_semantic_view_bindings_entityType_metricName_viewName_key"
  ON "agent_v3_semantic_view_bindings" ("entityType", "metricName", "viewName");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_view_bindings_entityType_idx" ON "agent_v3_semantic_view_bindings" ("entityType");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_view_bindings_metricName_idx" ON "agent_v3_semantic_view_bindings" ("metricName");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_view_bindings_viewName_idx" ON "agent_v3_semantic_view_bindings" ("viewName");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_view_bindings_status_idx" ON "agent_v3_semantic_view_bindings" ("status");

CREATE TABLE IF NOT EXISTS "agent_v3_semantic_routing_examples" (
  "id" SERIAL PRIMARY KEY,
  "question" TEXT NOT NULL,
  "expectedEntity" TEXT,
  "expectedMetric" TEXT,
  "expectedView" TEXT,
  "negativeViewsJson" JSONB,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_examples_expectedEntity_idx" ON "agent_v3_semantic_routing_examples" ("expectedEntity");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_examples_expectedMetric_idx" ON "agent_v3_semantic_routing_examples" ("expectedMetric");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_examples_expectedView_idx" ON "agent_v3_semantic_routing_examples" ("expectedView");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_examples_status_idx" ON "agent_v3_semantic_routing_examples" ("status");

CREATE TABLE IF NOT EXISTS "agent_v3_semantic_routing_feedback" (
  "id" SERIAL PRIMARY KEY,
  "question" TEXT NOT NULL,
  "routeIntentJson" JSONB,
  "selectedView" TEXT,
  "expectedView" TEXT,
  "isWrongAnswer" BOOLEAN NOT NULL DEFAULT false,
  "feedbackText" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdBy" INTEGER,
  "resolvedBy" INTEGER,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_feedback_selectedView_idx" ON "agent_v3_semantic_routing_feedback" ("selectedView");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_feedback_expectedView_idx" ON "agent_v3_semantic_routing_feedback" ("expectedView");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_feedback_isWrongAnswer_idx" ON "agent_v3_semantic_routing_feedback" ("isWrongAnswer");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_feedback_status_idx" ON "agent_v3_semantic_routing_feedback" ("status");
CREATE INDEX IF NOT EXISTS "agent_v3_semantic_routing_feedback_createdAt_idx" ON "agent_v3_semantic_routing_feedback" ("createdAt");
