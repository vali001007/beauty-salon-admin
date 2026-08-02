CREATE TABLE "brain_rollout_sequence" (
    "id" SERIAL NOT NULL,
    "sequenceKey" TEXT NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentStage" TEXT NOT NULL DEFAULT 'shadow',
    "policySnapshotId" INTEGER NOT NULL,
    "governanceMode" TEXT NOT NULL DEFAULT 'shadow',
    "promotionPolicy" JSONB NOT NULL,
    "healthThresholds" JSONB NOT NULL,
    "pauseReason" TEXT,
    "previousRuntimeReleaseId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_rollout_sequence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "brain_release"
ADD COLUMN "rolloutSequenceId" INTEGER,
ADD COLUMN "rolloutStage" TEXT,
ADD COLUMN "supersededAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "brain_rollout_sequence_sequenceKey_key" ON "brain_rollout_sequence"("sequenceKey");
CREATE UNIQUE INDEX "brain_rollout_sequence_candidateId_key" ON "brain_rollout_sequence"("candidateId");
CREATE INDEX "brain_rollout_sequence_status_updatedAt_idx" ON "brain_rollout_sequence"("status", "updatedAt");
CREATE INDEX "brain_rollout_sequence_policySnapshotId_idx" ON "brain_rollout_sequence"("policySnapshotId");
CREATE INDEX "brain_rollout_sequence_previousRuntimeReleaseId_idx" ON "brain_rollout_sequence"("previousRuntimeReleaseId");
CREATE INDEX "brain_release_rolloutSequenceId_rolloutStage_idx" ON "brain_release"("rolloutSequenceId", "rolloutStage");

ALTER TABLE "brain_rollout_sequence"
ADD CONSTRAINT "brain_rollout_sequence_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "brain_governance_candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brain_rollout_sequence"
ADD CONSTRAINT "brain_rollout_sequence_policySnapshotId_fkey"
FOREIGN KEY ("policySnapshotId") REFERENCES "brain_release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brain_rollout_sequence"
ADD CONSTRAINT "brain_rollout_sequence_previousRuntimeReleaseId_fkey"
FOREIGN KEY ("previousRuntimeReleaseId") REFERENCES "brain_release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brain_release"
ADD CONSTRAINT "brain_release_rolloutSequenceId_fkey"
FOREIGN KEY ("rolloutSequenceId") REFERENCES "brain_rollout_sequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
