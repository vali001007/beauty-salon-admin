CREATE UNIQUE INDEX "business_definition_version_id_definitionId_key"
  ON "business_definition_version"("id", "definitionId");

CREATE TABLE "business_semantic_evidence" (
  "id" SERIAL NOT NULL,
  "sourceType" VARCHAR(40) NOT NULL,
  "evidenceKind" VARCHAR(40) NOT NULL,
  "runId" INTEGER,
  "storeId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "definitionId" INTEGER NOT NULL,
  "definitionVersionId" INTEGER NOT NULL,
  "definitionType" VARCHAR(40) NOT NULL,
  "definitionKey" VARCHAR(160) NOT NULL,
  "definitionVersion" INTEGER NOT NULL,
  "definitionFingerprint" VARCHAR(64) NOT NULL,
  "definitionSourceFingerprint" VARCHAR(64) NOT NULL,
  "redactedText" VARCHAR(1000) NOT NULL,
  "normalizedValue" VARCHAR(256) NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pooled',
  "idempotencyFingerprint" VARCHAR(64) NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "business_semantic_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_semantic_evidence_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "business_semantic_evidence_definition_version_check" CHECK ("definitionVersion" > 0),
  CONSTRAINT "business_semantic_evidence_definition_fingerprint_check" CHECK ("definitionFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_semantic_evidence_definition_source_fingerprint_check" CHECK ("definitionSourceFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_semantic_evidence_idempotency_fingerprint_check" CHECK ("idempotencyFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "business_semantic_evidence_text_check" CHECK (length("redactedText") > 0 AND length("normalizedValue") > 0)
);

CREATE UNIQUE INDEX "business_semantic_evidence_idempotencyFingerprint_key"
  ON "business_semantic_evidence"("idempotencyFingerprint");
CREATE INDEX "business_semantic_evidence_definitionType_definitionKey_normalizedValue_status_idx"
  ON "business_semantic_evidence"("definitionType", "definitionKey", "normalizedValue", "status");
CREATE INDEX "business_semantic_evidence_definitionVersionId_idx"
  ON "business_semantic_evidence"("definitionVersionId");
CREATE INDEX "business_semantic_evidence_runId_idx"
  ON "business_semantic_evidence"("runId");
CREATE INDEX "business_semantic_evidence_storeId_userId_firstSeenAt_idx"
  ON "business_semantic_evidence"("storeId", "userId", "firstSeenAt");

ALTER TABLE "business_semantic_evidence"
  ADD CONSTRAINT "business_semantic_evidence_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "brain_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_semantic_evidence"
  ADD CONSTRAINT "business_semantic_evidence_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "business_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_semantic_evidence"
  ADD CONSTRAINT "business_semantic_evidence_definitionVersionId_definitionId_fkey"
  FOREIGN KEY ("definitionVersionId", "definitionId") REFERENCES "business_definition_version"("id", "definitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "business_definition_alias_candidate" (
  "id" SERIAL NOT NULL,
  "definitionId" INTEGER NOT NULL,
  "versionId" INTEGER NOT NULL,
  "definitionType" VARCHAR(40) NOT NULL,
  "definitionKey" VARCHAR(160) NOT NULL,
  "alias" VARCHAR(256) NOT NULL,
  "normalizedAlias" VARCHAR(256) NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
  "distinctUserCount" INTEGER NOT NULL DEFAULT 0,
  "averageConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "explicitCorrectionCount" INTEGER NOT NULL DEFAULT 0,
  "maxExplicitConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "conflictDefinitions" JSONB NOT NULL DEFAULT '[]',
  "regressionCaseIds" JSONB NOT NULL DEFAULT '[]',
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "blockReason" VARCHAR(1000),
  "evalReport" JSONB,
  "draftVersionId" INTEGER,
  "publishedVersionId" INTEGER,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" VARCHAR(160),
  "leaseExpiresAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_definition_alias_candidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_definition_alias_candidate_occurrenceCount_check" CHECK ("occurrenceCount" >= 0),
  CONSTRAINT "business_definition_alias_candidate_distinctUserCount_check" CHECK ("distinctUserCount" >= 0),
  CONSTRAINT "business_definition_alias_candidate_averageConfidence_check" CHECK ("averageConfidence" >= 0 AND "averageConfidence" <= 1),
  CONSTRAINT "business_definition_alias_candidate_explicitCorrectionCount_check" CHECK ("explicitCorrectionCount" >= 0),
  CONSTRAINT "business_definition_alias_candidate_maxExplicitConfidence_check" CHECK ("maxExplicitConfidence" >= 0 AND "maxExplicitConfidence" <= 1),
  CONSTRAINT "business_definition_alias_candidate_attemptCount_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "business_definition_alias_candidate_alias_check" CHECK (length("alias") > 0 AND length("normalizedAlias") > 0)
);

CREATE UNIQUE INDEX "business_definition_alias_candidate_definitionId_normalizedAlias_key"
  ON "business_definition_alias_candidate"("definitionId", "normalizedAlias");
CREATE UNIQUE INDEX "business_definition_alias_candidate_id_definitionId_key"
  ON "business_definition_alias_candidate"("id", "definitionId");
CREATE INDEX "business_definition_alias_candidate_definitionId_versionId_idx"
  ON "business_definition_alias_candidate"("definitionId", "versionId");
CREATE INDEX "business_definition_alias_candidate_status_leaseExpiresAt_idx"
  ON "business_definition_alias_candidate"("status", "leaseExpiresAt");
CREATE INDEX "business_definition_alias_candidate_draftVersionId_idx"
  ON "business_definition_alias_candidate"("draftVersionId");
CREATE INDEX "business_definition_alias_candidate_publishedVersionId_idx"
  ON "business_definition_alias_candidate"("publishedVersionId");

ALTER TABLE "business_definition_alias_candidate"
  ADD CONSTRAINT "business_definition_alias_candidate_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "business_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_definition_alias_candidate"
  ADD CONSTRAINT "business_definition_alias_candidate_versionId_definitionId_fkey"
  FOREIGN KEY ("versionId", "definitionId") REFERENCES "business_definition_version"("id", "definitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_definition_alias_candidate"
  ADD CONSTRAINT "business_definition_alias_candidate_draftVersionId_definitionId_fkey"
  FOREIGN KEY ("draftVersionId", "definitionId") REFERENCES "business_definition_version"("id", "definitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_definition_alias_candidate"
  ADD CONSTRAINT "business_definition_alias_candidate_publishedVersionId_definitionId_fkey"
  FOREIGN KEY ("publishedVersionId", "definitionId") REFERENCES "business_definition_version"("id", "definitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "business_semantic_evidence" ADD COLUMN "aliasCandidateId" INTEGER;
CREATE INDEX "business_semantic_evidence_aliasCandidateId_idx"
  ON "business_semantic_evidence"("aliasCandidateId");
ALTER TABLE "business_semantic_evidence"
  ADD CONSTRAINT "business_semantic_evidence_aliasCandidateId_fkey"
  FOREIGN KEY ("aliasCandidateId", "definitionId") REFERENCES "business_definition_alias_candidate"("id", "definitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
