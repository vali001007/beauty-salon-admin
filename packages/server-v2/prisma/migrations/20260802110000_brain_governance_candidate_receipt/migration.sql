CREATE TABLE "brain_governance_candidate" (
    "id" SERIAL NOT NULL,
    "candidateKey" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "branch" TEXT,
    "baseCommit" TEXT NOT NULL,
    "mergeBaseCommit" TEXT NOT NULL,
    "headCommit" TEXT NOT NULL,
    "changedFilesChecksum" VARCHAR(64) NOT NULL,
    "diffChecksum" VARCHAR(64) NOT NULL,
    "sourceFingerprint" VARCHAR(64) NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'unclassified',
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "policyDecision" TEXT,
    "policySnapshotId" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_governance_candidate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "brain_gate_receipt"
ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "candidateId" INTEGER,
ADD COLUMN "baseCommit" TEXT,
ADD COLUMN "headCommit" TEXT,
ADD COLUMN "mergeBaseCommit" TEXT,
ADD COLUMN "identityChecksum" VARCHAR(64),
ADD COLUMN "issuerType" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "issuer" TEXT,
ADD COLUMN "trustLevel" TEXT NOT NULL DEFAULT 'untrusted_dev',
ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'received',
ADD COLUMN "verificationError" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "evalRunId" INTEGER,
ADD COLUMN "evaluationReleaseId" INTEGER;

ALTER TABLE "brain_governance_task"
ADD COLUMN "candidateId" INTEGER,
ADD COLUMN "receiptId" INTEGER,
ADD COLUMN "blockerType" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "blockerCode" TEXT,
ADD COLUMN "resolutionType" TEXT,
ADD COLUMN "supersededByTaskId" INTEGER;

CREATE TABLE "brain_gate_receipt_gate" (
    "id" SERIAL NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "gateKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputChecksum" VARCHAR(64) NOT NULL,
    "resultChecksum" VARCHAR(64) NOT NULL,
    "commandChecksum" VARCHAR(64) NOT NULL,
    "durationMs" INTEGER,
    "modelInvocationCount" INTEGER NOT NULL DEFAULT 0,
    "artifactUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_gate_receipt_gate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brain_gate_receipt_capability" (
    "id" SERIAL NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "impactRuleId" TEXT,
    "changeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brain_gate_receipt_capability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brain_governance_candidate_candidateKey_key" ON "brain_governance_candidate"("candidateKey");
CREATE INDEX "brain_governance_candidate_status_updatedAt_idx" ON "brain_governance_candidate"("status", "updatedAt");
CREATE INDEX "brain_governance_candidate_repository_headCommit_idx" ON "brain_governance_candidate"("repository", "headCommit");
CREATE INDEX "brain_governance_candidate_policySnapshotId_idx" ON "brain_governance_candidate"("policySnapshotId");

CREATE INDEX "brain_gate_receipt_candidateId_status_createdAt_idx" ON "brain_gate_receipt"("candidateId", "status", "createdAt");
CREATE INDEX "brain_gate_receipt_trustLevel_verificationStatus_expiresAt_idx" ON "brain_gate_receipt"("trustLevel", "verificationStatus", "expiresAt");
CREATE INDEX "brain_gate_receipt_evalRunId_idx" ON "brain_gate_receipt"("evalRunId");
CREATE INDEX "brain_gate_receipt_evaluationReleaseId_idx" ON "brain_gate_receipt"("evaluationReleaseId");

CREATE INDEX "brain_governance_task_candidateId_status_createdAt_idx" ON "brain_governance_task"("candidateId", "status", "createdAt");
CREATE INDEX "brain_governance_task_receiptId_idx" ON "brain_governance_task"("receiptId");
CREATE INDEX "brain_governance_task_blockerType_status_createdAt_idx" ON "brain_governance_task"("blockerType", "status", "createdAt");

CREATE UNIQUE INDEX "brain_gate_receipt_gate_receiptId_gateKey_key" ON "brain_gate_receipt_gate"("receiptId", "gateKey");
CREATE INDEX "brain_gate_receipt_gate_gateKey_inputChecksum_status_expiresAt_idx" ON "brain_gate_receipt_gate"("gateKey", "inputChecksum", "status", "expiresAt");

CREATE UNIQUE INDEX "brain_gate_receipt_capability_receiptId_capabilityKey_key" ON "brain_gate_receipt_capability"("receiptId", "capabilityKey");
CREATE INDEX "brain_gate_receipt_capability_capabilityKey_createdAt_idx" ON "brain_gate_receipt_capability"("capabilityKey", "createdAt");

ALTER TABLE "brain_governance_candidate"
ADD CONSTRAINT "brain_governance_candidate_policySnapshotId_fkey"
FOREIGN KEY ("policySnapshotId") REFERENCES "brain_release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_gate_receipt"
ADD CONSTRAINT "brain_gate_receipt_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "brain_governance_candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_governance_task"
ADD CONSTRAINT "brain_governance_task_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "brain_governance_candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_governance_task"
ADD CONSTRAINT "brain_governance_task_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "brain_gate_receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_governance_task"
ADD CONSTRAINT "brain_governance_task_supersededByTaskId_fkey"
FOREIGN KEY ("supersededByTaskId") REFERENCES "brain_governance_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_gate_receipt_gate"
ADD CONSTRAINT "brain_gate_receipt_gate_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "brain_gate_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brain_gate_receipt_capability"
ADD CONSTRAINT "brain_gate_receipt_capability_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "brain_gate_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
