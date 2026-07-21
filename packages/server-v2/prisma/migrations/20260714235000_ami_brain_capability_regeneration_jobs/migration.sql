CREATE TABLE "brain_capability_regeneration_job" (
  "id" SERIAL NOT NULL,
  "releaseId" INTEGER NOT NULL,
  "requestVersionId" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "releaseFingerprint" TEXT NOT NULL,
  "requirement" TEXT NOT NULL,
  "inferredChanges" JSONB NOT NULL,
  "affectedCapabilities" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leasedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "leaseOwner" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "report" JSONB,
  "generatedResourceVersionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "completedAt" TIMESTAMP(3),
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "brain_capability_regeneration_job_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brain_capability_regeneration_job_status_check" CHECK (
    "status" IN ('queued', 'leased', 'retry_scheduled', 'completed', 'blocked', 'dead_letter')
  ),
  CONSTRAINT "brain_capability_regeneration_job_attempt_check" CHECK (
    "attemptCount" >= 0 AND "attemptCount" <= "maxAttempts" AND "maxAttempts" BETWEEN 1 AND 10
  ),
  CONSTRAINT "brain_capability_regeneration_job_lease_check" CHECK (
    (
      "status" = 'leased'
      AND "leaseOwner" IS NOT NULL
      AND "leasedAt" IS NOT NULL
      AND "leaseExpiresAt" IS NOT NULL
      AND "leaseExpiresAt" > "leasedAt"
    ) OR (
      "status" <> 'leased'
      AND "leaseOwner" IS NULL
      AND "leasedAt" IS NULL
      AND "leaseExpiresAt" IS NULL
    )
  )
);

ALTER TABLE "brain_resource_version"
  ADD COLUMN "generatedByRegenerationJobId" INTEGER;

CREATE UNIQUE INDEX "brain_capability_regeneration_job_requestVersionId_key"
  ON "brain_capability_regeneration_job"("requestVersionId");
CREATE UNIQUE INDEX "brain_capability_regeneration_job_idempotencyKey_key"
  ON "brain_capability_regeneration_job"("idempotencyKey");
CREATE INDEX "brain_capability_regeneration_job_releaseId_status_createdAt_idx"
  ON "brain_capability_regeneration_job"("releaseId", "status", "createdAt");
CREATE INDEX "brain_capability_regeneration_job_releaseFingerprint_status_idx"
  ON "brain_capability_regeneration_job"("releaseFingerprint", "status");
CREATE INDEX "brain_capability_regeneration_job_status_availableAt_idx"
  ON "brain_capability_regeneration_job"("status", "availableAt");
CREATE INDEX "brain_capability_regeneration_job_status_leaseExpiresAt_idx"
  ON "brain_capability_regeneration_job"("status", "leaseExpiresAt");
CREATE UNIQUE INDEX "brain_resource_version_regeneration_resource_key"
  ON "brain_resource_version"("generatedByRegenerationJobId", "resourceType", "resourceKey");
CREATE INDEX "brain_resource_version_generatedByRegenerationJobId_idx"
  ON "brain_resource_version"("generatedByRegenerationJobId");

ALTER TABLE "brain_capability_regeneration_job"
  ADD CONSTRAINT "brain_capability_regeneration_job_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "brain_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brain_capability_regeneration_job"
  ADD CONSTRAINT "brain_capability_regeneration_job_requestVersionId_fkey"
  FOREIGN KEY ("requestVersionId") REFERENCES "brain_resource_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brain_resource_version"
  ADD CONSTRAINT "brain_resource_version_generatedByRegenerationJobId_fkey"
  FOREIGN KEY ("generatedByRegenerationJobId") REFERENCES "brain_capability_regeneration_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
