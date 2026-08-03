CREATE TABLE "brain_version_counter" (
    "family" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_version_counter_pkey" PRIMARY KEY ("family")
);

ALTER TABLE "brain_release"
ADD COLUMN "releaseFamily" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "displayCode" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "retiredAt" TIMESTAMP(3),
ADD COLUMN "retirementReason" TEXT,
ADD COLUMN "supersededByReleaseId" INTEGER;

ALTER TABLE "brain_rollout_sequence"
ADD COLUMN "runtimeVersionNumber" INTEGER,
ADD COLUMN "runtimeVersionCode" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "productProfile" TEXT;

CREATE TABLE "brain_governance_transition" (
    "id" SERIAL NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "candidateId" INTEGER NOT NULL,
    "oldPolicyReleaseId" INTEGER NOT NULL,
    "newPolicyReleaseId" INTEGER NOT NULL,
    "oldRuntimeReleaseId" INTEGER NOT NULL,
    "runtimeSequenceId" INTEGER NOT NULL,
    "policyApprovedBy" INTEGER,
    "policyApprovedAt" TIMESTAMP(3),
    "runtimeApprovedBy" INTEGER,
    "runtimeApprovedAt" TIMESTAMP(3),
    "currentStep" TEXT NOT NULL DEFAULT 'prepared',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_governance_transition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brain_release_displayCode_key" ON "brain_release"("displayCode");
CREATE INDEX "brain_release_releaseFamily_status_idx" ON "brain_release"("releaseFamily", "status");
CREATE INDEX "brain_release_supersededByReleaseId_idx" ON "brain_release"("supersededByReleaseId");
CREATE UNIQUE INDEX "brain_rollout_sequence_runtimeVersionCode_key" ON "brain_rollout_sequence"("runtimeVersionCode");
CREATE UNIQUE INDEX "brain_governance_transition_transitionKey_key" ON "brain_governance_transition"("transitionKey");
CREATE INDEX "brain_governance_transition_status_updatedAt_idx" ON "brain_governance_transition"("status", "updatedAt");
CREATE INDEX "brain_governance_transition_candidateId_status_idx" ON "brain_governance_transition"("candidateId", "status");
CREATE INDEX "brain_governance_transition_newPolicyReleaseId_idx" ON "brain_governance_transition"("newPolicyReleaseId");
CREATE INDEX "brain_governance_transition_runtimeSequenceId_idx" ON "brain_governance_transition"("runtimeSequenceId");

ALTER TABLE "brain_release"
ADD CONSTRAINT "brain_release_supersededByReleaseId_fkey"
FOREIGN KEY ("supersededByReleaseId") REFERENCES "brain_release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "brain_governance_candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_oldPolicyReleaseId_fkey"
FOREIGN KEY ("oldPolicyReleaseId") REFERENCES "brain_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_newPolicyReleaseId_fkey"
FOREIGN KEY ("newPolicyReleaseId") REFERENCES "brain_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_oldRuntimeReleaseId_fkey"
FOREIGN KEY ("oldRuntimeReleaseId") REFERENCES "brain_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_runtimeSequenceId_fkey"
FOREIGN KEY ("runtimeSequenceId") REFERENCES "brain_rollout_sequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "brain_version_counter" ("family", "lastNumber", "updatedAt")
VALUES
    ('policy', 2, CURRENT_TIMESTAMP),
    ('runtime', 0, CURRENT_TIMESTAMP),
    ('evaluation', 0, CURRENT_TIMESTAMP)
ON CONFLICT ("family") DO NOTHING;

UPDATE "brain_release"
SET
    "releaseFamily" = 'policy',
    "displayCode" = 'GP-001',
    "displayName" = 'Baseline Policy',
    "retiredAt" = COALESCE("supersededAt", "updatedAt"),
    "retirementReason" = 'legacy_policy_superseded'
WHERE "id" = 428 AND "scope" = 'governance_policy' AND "displayCode" IS NULL;

UPDATE "brain_release"
SET
    "releaseFamily" = 'policy',
    "displayCode" = 'GP-002',
    "displayName" = 'Legacy Shadow Policy'
WHERE "id" = 436 AND "scope" = 'governance_policy' AND "displayCode" IS NULL;

ALTER TABLE "brain_version_counter"
ADD CONSTRAINT "brain_version_counter_family_check"
CHECK ("family" IN ('policy', 'runtime', 'evaluation')),
ADD CONSTRAINT "brain_version_counter_lastNumber_check"
CHECK ("lastNumber" >= 0);

ALTER TABLE "brain_release"
ADD CONSTRAINT "brain_release_product_identity_check"
CHECK (
    ("releaseFamily" = 'legacy' AND "displayCode" IS NULL)
    OR ("releaseFamily" = 'policy' AND "displayCode" ~ '^GP-[0-9]{3,}$')
    OR ("releaseFamily" = 'evaluation' AND "displayCode" ~ '^EV-[0-9]{3,}$')
),
ADD CONSTRAINT "brain_release_display_name_check"
CHECK ("displayCode" IS NULL OR LENGTH(BTRIM(COALESCE("displayName", ''))) > 0);

ALTER TABLE "brain_rollout_sequence"
ADD CONSTRAINT "brain_rollout_sequence_runtime_identity_check"
CHECK (
    ("runtimeVersionNumber" IS NULL AND "runtimeVersionCode" IS NULL)
    OR (
        "runtimeVersionNumber" > 0
        AND "runtimeVersionCode" = 'RT-' || LPAD("runtimeVersionNumber"::TEXT, 3, '0')
        AND LENGTH(BTRIM(COALESCE("displayName", ''))) > 0
    )
);
