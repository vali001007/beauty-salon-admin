CREATE TABLE "agent_knowledge_graph_overrides" (
  "id" SERIAL NOT NULL,
  "overrideType" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "sourceNodeId" TEXT,
  "targetNodeId" TEXT,
  "value" TEXT,
  "label" TEXT,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'manual_override',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "payloadJson" JSONB,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_knowledge_graph_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_knowledge_graph_overrides_overrideType_status_idx" ON "agent_knowledge_graph_overrides"("overrideType", "status");
CREATE INDEX "agent_knowledge_graph_overrides_sourceNodeId_idx" ON "agent_knowledge_graph_overrides"("sourceNodeId");
CREATE INDEX "agent_knowledge_graph_overrides_targetNodeId_idx" ON "agent_knowledge_graph_overrides"("targetNodeId");
CREATE INDEX "agent_knowledge_graph_overrides_createdBy_idx" ON "agent_knowledge_graph_overrides"("createdBy");
CREATE INDEX "agent_knowledge_graph_overrides_updatedAt_idx" ON "agent_knowledge_graph_overrides"("updatedAt");
