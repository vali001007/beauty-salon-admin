ALTER TABLE "brain_eval_run"
ADD COLUMN "storeId" INTEGER,
ADD COLUMN "roleKey" TEXT,
ADD COLUMN "modelVersion" TEXT,
ADD COLUMN "caseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "error" JSONB,
ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "finishedAt" TIMESTAMP(3);

CREATE INDEX "brain_eval_run_storeId_status_createdAt_idx" ON "brain_eval_run"("storeId", "status", "createdAt");

CREATE TABLE "brain_eval_result" (
    "id" SERIAL NOT NULL,
    "evalRunId" INTEGER NOT NULL,
    "caseId" INTEGER,
    "caseKey" TEXT NOT NULL,
    "roleKey" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "deterministicGrade" JSONB NOT NULL,
    "deterministicPassed" BOOLEAN NOT NULL,
    "llmJudge" JSONB,
    "latencyMs" INTEGER,
    "failureCluster" TEXT,
    "error" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brain_eval_result_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brain_eval_result_evalRunId_caseKey_key" ON "brain_eval_result"("evalRunId", "caseKey");
CREATE INDEX "brain_eval_result_evalRunId_deterministicPassed_idx" ON "brain_eval_result"("evalRunId", "deterministicPassed");
CREATE INDEX "brain_eval_result_failureCluster_idx" ON "brain_eval_result"("failureCluster");
ALTER TABLE "brain_eval_result" ADD CONSTRAINT "brain_eval_result_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "brain_eval_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "brain_resource_version" (
    "id" SERIAL NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "snapshot" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "sourceResourceId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "brain_resource_version_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brain_resource_version_resourceType_resourceKey_version_key" ON "brain_resource_version"("resourceType", "resourceKey", "version");
CREATE INDEX "brain_resource_version_resourceType_status_idx" ON "brain_resource_version"("resourceType", "status");
CREATE INDEX "brain_resource_version_resourceKey_createdAt_idx" ON "brain_resource_version"("resourceKey", "createdAt");

ALTER TABLE "brain_release"
ADD COLUMN "previousReleaseId" INTEGER,
ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "rolledBackAt" TIMESTAMP(3),
ADD COLUMN "failureReason" TEXT;

CREATE TABLE "brain_release_item" (
    "id" SERIAL NOT NULL,
    "releaseId" INTEGER NOT NULL,
    "resourceVersionId" INTEGER NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brain_release_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brain_release_item_releaseId_resourceType_resourceKey_key" ON "brain_release_item"("releaseId", "resourceType", "resourceKey");
CREATE INDEX "brain_release_item_resourceVersionId_idx" ON "brain_release_item"("resourceVersionId");
ALTER TABLE "brain_release_item" ADD CONSTRAINT "brain_release_item_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "brain_release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brain_release_item" ADD CONSTRAINT "brain_release_item_resourceVersionId_fkey" FOREIGN KEY ("resourceVersionId") REFERENCES "brain_resource_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
