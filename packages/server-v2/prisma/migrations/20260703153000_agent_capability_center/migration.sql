CREATE TABLE "agent_capability_drafts" (
  "id" SERIAL NOT NULL,
  "capabilityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "source" TEXT NOT NULL DEFAULT 'auto_scan_draft',
  "displayName" TEXT NOT NULL,
  "displayNameZh" TEXT,
  "description" TEXT,
  "domain" TEXT NOT NULL,
  "businessObject" TEXT NOT NULL,
  "actionCodes" JSONB,
  "personaCodes" JSONB,
  "releaseStrategy" TEXT NOT NULL DEFAULT 'approval_required',
  "riskLevel" TEXT NOT NULL DEFAULT 'low',
  "permissionSource" TEXT,
  "permissionCodes" JSONB,
  "sourceModels" JSONB,
  "sourceApis" JSONB,
  "sourceDtos" JSONB,
  "sourceRoutes" JSONB,
  "outputKinds" JSONB,
  "executorJson" JSONB,
  "storeScope" TEXT,
  "fieldPoliciesJson" JSONB,
  "triggerKeywords" JSONB,
  "examples" JSONB,
  "negativeExamples" JSONB,
  "boundaryNotes" JSONB,
  "governanceIssues" JSONB,
  "scannerFingerprint" TEXT,
  "reviewedBy" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_capability_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_capability_reviews" (
  "id" SERIAL NOT NULL,
  "draftId" INTEGER,
  "capabilityId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "comment" TEXT,
  "changesJson" JSONB,
  "reviewerId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_capability_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_capability_manifest_versions" (
  "id" SERIAL NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "source" TEXT NOT NULL DEFAULT 'capability_center',
  "title" TEXT,
  "summary" TEXT,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "autoPublishedCount" INTEGER NOT NULL DEFAULT 0,
  "approvalRequiredCount" INTEGER NOT NULL DEFAULT 0,
  "writeBlockedCount" INTEGER NOT NULL DEFAULT 0,
  "evalReportJson" JSONB,
  "publishedBy" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_capability_manifest_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_capability_manifest_items" (
  "id" SERIAL NOT NULL,
  "versionId" INTEGER NOT NULL,
  "capabilityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'enabled',
  "source" TEXT NOT NULL DEFAULT 'capability_center',
  "releaseStrategy" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "permissionCodes" JSONB,
  "manifestJson" JSONB NOT NULL,
  "draftId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_capability_manifest_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_capability_publish_runs" (
  "id" SERIAL NOT NULL,
  "runNo" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sourceVersionId" INTEGER,
  "targetVersionId" INTEGER,
  "requestedBy" INTEGER,
  "inputJson" JSONB,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_capability_publish_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_tool_query_key_registry" (
  "id" SERIAL NOT NULL,
  "queryKey" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "businessObject" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "source" TEXT NOT NULL DEFAULT 'auto_scan',
  "requiredPermissions" JSONB,
  "sourceModels" JSONB,
  "sourceApis" JSONB,
  "outputKinds" JSONB,
  "implementationRef" TEXT,
  "validationJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_tool_query_key_registry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_capability_drafts_capabilityId_key" ON "agent_capability_drafts"("capabilityId");
CREATE INDEX "agent_capability_drafts_status_idx" ON "agent_capability_drafts"("status");
CREATE INDEX "agent_capability_drafts_domain_idx" ON "agent_capability_drafts"("domain");
CREATE INDEX "agent_capability_drafts_riskLevel_idx" ON "agent_capability_drafts"("riskLevel");
CREATE INDEX "agent_capability_drafts_releaseStrategy_idx" ON "agent_capability_drafts"("releaseStrategy");
CREATE INDEX "agent_capability_drafts_updatedAt_idx" ON "agent_capability_drafts"("updatedAt");

CREATE INDEX "agent_capability_reviews_draftId_idx" ON "agent_capability_reviews"("draftId");
CREATE INDEX "agent_capability_reviews_capabilityId_idx" ON "agent_capability_reviews"("capabilityId");
CREATE INDEX "agent_capability_reviews_decision_idx" ON "agent_capability_reviews"("decision");
CREATE INDEX "agent_capability_reviews_reviewerId_idx" ON "agent_capability_reviews"("reviewerId");

CREATE UNIQUE INDEX "agent_capability_manifest_versions_version_key" ON "agent_capability_manifest_versions"("version");
CREATE INDEX "agent_capability_manifest_versions_status_idx" ON "agent_capability_manifest_versions"("status");
CREATE INDEX "agent_capability_manifest_versions_publishedAt_idx" ON "agent_capability_manifest_versions"("publishedAt");

CREATE UNIQUE INDEX "agent_capability_manifest_items_versionId_capabilityId_key" ON "agent_capability_manifest_items"("versionId", "capabilityId");
CREATE INDEX "agent_capability_manifest_items_capabilityId_idx" ON "agent_capability_manifest_items"("capabilityId");
CREATE INDEX "agent_capability_manifest_items_status_idx" ON "agent_capability_manifest_items"("status");
CREATE INDEX "agent_capability_manifest_items_releaseStrategy_idx" ON "agent_capability_manifest_items"("releaseStrategy");
CREATE INDEX "agent_capability_manifest_items_riskLevel_idx" ON "agent_capability_manifest_items"("riskLevel");

CREATE UNIQUE INDEX "agent_capability_publish_runs_runNo_key" ON "agent_capability_publish_runs"("runNo");
CREATE INDEX "agent_capability_publish_runs_status_idx" ON "agent_capability_publish_runs"("status");
CREATE INDEX "agent_capability_publish_runs_requestedBy_idx" ON "agent_capability_publish_runs"("requestedBy");
CREATE INDEX "agent_capability_publish_runs_startedAt_idx" ON "agent_capability_publish_runs"("startedAt");

CREATE UNIQUE INDEX "agent_tool_query_key_registry_queryKey_key" ON "agent_tool_query_key_registry"("queryKey");
CREATE INDEX "agent_tool_query_key_registry_toolName_idx" ON "agent_tool_query_key_registry"("toolName");
CREATE INDEX "agent_tool_query_key_registry_domain_idx" ON "agent_tool_query_key_registry"("domain");
CREATE INDEX "agent_tool_query_key_registry_status_idx" ON "agent_tool_query_key_registry"("status");

ALTER TABLE "agent_capability_manifest_items"
  ADD CONSTRAINT "agent_capability_manifest_items_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "agent_capability_manifest_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
