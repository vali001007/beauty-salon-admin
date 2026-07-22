CREATE TABLE "brain_action_execution" (
    "id" SERIAL NOT NULL,
    "confirmationId" INTEGER NOT NULL,
    "actionId" TEXT NOT NULL,
    "runId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "riskLevel" "BrainRiskLevel" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestPayload" JSONB NOT NULL,
    "previewPayload" JSONB,
    "receiptPayload" JSONB,
    "businessObjectType" TEXT,
    "businessObjectId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brain_action_execution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brain_action_execution_storeId_capabilityKey_idempotencyKey_key"
ON "brain_action_execution"("storeId", "capabilityKey", "idempotencyKey");

CREATE INDEX "brain_action_execution_confirmationId_idx"
ON "brain_action_execution"("confirmationId");

CREATE INDEX "brain_action_execution_actionId_idx"
ON "brain_action_execution"("actionId");

CREATE INDEX "brain_action_execution_status_createdAt_idx"
ON "brain_action_execution"("status", "createdAt");
