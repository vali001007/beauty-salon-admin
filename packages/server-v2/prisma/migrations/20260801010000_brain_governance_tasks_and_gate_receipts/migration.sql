CREATE TABLE "brain_governance_task" (
    "id" SERIAL NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceKey" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'unclassified',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "transitionLog" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdBy" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_governance_task_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brain_governance_task_idempotencyKey_key" ON "brain_governance_task"("idempotencyKey");
CREATE INDEX "brain_governance_task_status_availableAt_idx" ON "brain_governance_task"("status", "availableAt");
CREATE INDEX "brain_governance_task_resourceType_resourceKey_status_createdAt_idx" ON "brain_governance_task"("resourceType", "resourceKey", "status", "createdAt");
CREATE INDEX "brain_governance_task_stage_status_createdAt_idx" ON "brain_governance_task"("stage", "status", "createdAt");

CREATE TABLE "brain_gate_receipt" (
    "id" SERIAL NOT NULL,
    "receiptKey" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "changedFilesChecksum" VARCHAR(64) NOT NULL,
    "diffChecksum" VARCHAR(64) NOT NULL,
    "sourceFingerprint" VARCHAR(64) NOT NULL,
    "releaseFingerprint" TEXT,
    "suiteChecksum" VARCHAR(64) NOT NULL,
    "dataSnapshot" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "timeoutMs" INTEGER,
    "resultChecksum" VARCHAR(64) NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_gate_receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brain_gate_receipt_receiptKey_key" ON "brain_gate_receipt"("receiptKey");
CREATE INDEX "brain_gate_receipt_stage_sourceFingerprint_idx" ON "brain_gate_receipt"("stage", "sourceFingerprint");
CREATE INDEX "brain_gate_receipt_resultChecksum_idx" ON "brain_gate_receipt"("resultChecksum");
CREATE INDEX "brain_gate_receipt_expiresAt_status_idx" ON "brain_gate_receipt"("expiresAt", "status");
