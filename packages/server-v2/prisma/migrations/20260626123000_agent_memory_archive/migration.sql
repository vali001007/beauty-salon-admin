CREATE TABLE "agent_memories" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "userId" INTEGER,
    "personaCode" TEXT,
    "memoryType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "sourceRunId" INTEGER,
    "sourceJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_daily_archives" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "archiveDate" TIMESTAMP(3) NOT NULL,
    "personaCode" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metricsJson" JSONB,
    "highlightsJson" JSONB,
    "risksJson" JSONB,
    "actionsJson" JSONB,
    "sourceRunIds" JSONB,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_daily_archives_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_memories_storeId_personaCode_status_idx" ON "agent_memories"("storeId", "personaCode", "status");
CREATE INDEX "agent_memories_storeId_memoryType_status_idx" ON "agent_memories"("storeId", "memoryType", "status");
CREATE INDEX "agent_memories_userId_idx" ON "agent_memories"("userId");
CREATE INDEX "agent_memories_sourceRunId_idx" ON "agent_memories"("sourceRunId");

CREATE UNIQUE INDEX "agent_daily_archives_storeId_archiveDate_personaCode_key" ON "agent_daily_archives"("storeId", "archiveDate", "personaCode");
CREATE INDEX "agent_daily_archives_storeId_archiveDate_idx" ON "agent_daily_archives"("storeId", "archiveDate");
CREATE INDEX "agent_daily_archives_personaCode_idx" ON "agent_daily_archives"("personaCode");
CREATE INDEX "agent_daily_archives_status_idx" ON "agent_daily_archives"("status");
