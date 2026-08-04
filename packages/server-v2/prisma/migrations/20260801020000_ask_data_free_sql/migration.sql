CREATE TABLE "ask_data_free_sql_runs" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "userId" INTEGER,
    "storeId" INTEGER NOT NULL,
    "storeScopeJson" JSONB NOT NULL,
    "selectedViewsJson" JSONB NOT NULL,
    "generatedSqlHash" TEXT,
    "redactedSql" TEXT,
    "safeSqlHash" TEXT,
    "status" TEXT NOT NULL,
    "blockedReason" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "executionMs" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "answerJson" JSONB,
    "queryMetaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ask_data_free_sql_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ask_data_free_sql_runs_status_idx" ON "ask_data_free_sql_runs"("status");
CREATE INDEX "ask_data_free_sql_runs_userId_idx" ON "ask_data_free_sql_runs"("userId");
CREATE INDEX "ask_data_free_sql_runs_storeId_createdAt_idx" ON "ask_data_free_sql_runs"("storeId", "createdAt");
CREATE INDEX "ask_data_free_sql_runs_blockedReason_idx" ON "ask_data_free_sql_runs"("blockedReason");
CREATE INDEX "ask_data_free_sql_runs_createdAt_idx" ON "ask_data_free_sql_runs"("createdAt");
