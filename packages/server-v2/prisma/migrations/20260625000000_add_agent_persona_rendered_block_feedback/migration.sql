-- AlterTable: add personaCode to AgentRun
ALTER TABLE "agent_runs" ADD COLUMN "personaCode" TEXT;
CREATE INDEX "agent_runs_personaCode_idx" ON "agent_runs"("personaCode");

-- CreateTable: AgentPersona
CREATE TABLE "agent_personas" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetRoles" JSONB NOT NULL,
    "toolGroups" JSONB NOT NULL,
    "defaultStyle" JSONB,
    "riskPolicy" JSONB,
    "suggestedQuestions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_personas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_personas_code_key" ON "agent_personas"("code");
CREATE INDEX "agent_personas_status_idx" ON "agent_personas"("status");

-- CreateTable: AgentRenderedBlock
CREATE TABLE "agent_rendered_blocks" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "blockKind" TEXT NOT NULL,
    "title" TEXT,
    "payloadJson" JSONB NOT NULL,
    "actionsJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_rendered_blocks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_rendered_blocks_runId_sortOrder_idx" ON "agent_rendered_blocks"("runId", "sortOrder");
CREATE INDEX "agent_rendered_blocks_blockKind_idx" ON "agent_rendered_blocks"("blockKind");

-- CreateTable: AgentFeedback
CREATE TABLE "agent_feedbacks" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "userId" INTEGER,
    "storeId" INTEGER,
    "rating" INTEGER,
    "adopted" BOOLEAN,
    "comment" TEXT,
    "businessActionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_feedbacks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_feedbacks_runId_idx" ON "agent_feedbacks"("runId");
CREATE INDEX "agent_feedbacks_userId_idx" ON "agent_feedbacks"("userId");
CREATE INDEX "agent_feedbacks_storeId_createdAt_idx" ON "agent_feedbacks"("storeId", "createdAt");
