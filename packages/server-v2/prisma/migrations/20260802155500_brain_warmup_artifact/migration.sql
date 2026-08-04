CREATE TABLE "brain_warmup_artifact" (
    "id" SERIAL NOT NULL,
    "releaseId" INTEGER NOT NULL,
    "releaseFingerprint" VARCHAR(64) NOT NULL,
    "versionMapChecksum" VARCHAR(64) NOT NULL,
    "definitionSetFingerprint" VARCHAR(64) NOT NULL,
    "builderVersion" VARCHAR(64) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "definitionVersionIds" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "ontologyPayload" JSONB NOT NULL,
    "catalogPayload" JSONB NOT NULL,
    "ontologyFingerprint" VARCHAR(64) NOT NULL,
    "capabilityCount" INTEGER NOT NULL,
    "resultChecksum" VARCHAR(64) NOT NULL,
    "metrics" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_warmup_artifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brain_warmup_artifact_releaseId_builderVersion_releaseFingerprint_versionMapChecksum_key"
ON "brain_warmup_artifact"("releaseId", "builderVersion", "releaseFingerprint", "versionMapChecksum");

CREATE INDEX "brain_warmup_artifact_status_builtAt_idx"
ON "brain_warmup_artifact"("status", "builtAt");

CREATE INDEX "brain_warmup_artifact_releaseFingerprint_idx"
ON "brain_warmup_artifact"("releaseFingerprint");

CREATE INDEX "brain_warmup_artifact_definitionSetFingerprint_idx"
ON "brain_warmup_artifact"("definitionSetFingerprint");

ALTER TABLE "brain_warmup_artifact"
ADD CONSTRAINT "brain_warmup_artifact_releaseId_fkey"
FOREIGN KEY ("releaseId") REFERENCES "brain_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
