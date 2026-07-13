CREATE TABLE "agent_v2_gray_rules" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "storeIds" JSONB,
  "personaCodes" JSONB,
  "roles" JSONB,
  "entrypoints" JSONB,
  "capabilityIds" JSONB,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'governance_config',
  "payloadJson" JSONB,
  "createdBy" INTEGER,
  "updatedBy" INTEGER,
  "deletedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_v2_gray_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_v2_gray_rules_status_idx" ON "agent_v2_gray_rules"("status");
CREATE INDEX "agent_v2_gray_rules_mode_idx" ON "agent_v2_gray_rules"("mode");
CREATE INDEX "agent_v2_gray_rules_priority_idx" ON "agent_v2_gray_rules"("priority");
CREATE INDEX "agent_v2_gray_rules_updatedAt_idx" ON "agent_v2_gray_rules"("updatedAt");
