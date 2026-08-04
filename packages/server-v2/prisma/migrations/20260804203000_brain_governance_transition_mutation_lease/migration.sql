ALTER TABLE "brain_governance_transition"
ADD COLUMN "mutationLeaseToken" TEXT,
ADD COLUMN "mutationLeaseOperation" TEXT,
ADD COLUMN "mutationLeaseExpiresAt" TIMESTAMP(3);

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_mutation_lease_check"
CHECK (
  (
    "mutationLeaseToken" IS NULL
    AND "mutationLeaseOperation" IS NULL
    AND "mutationLeaseExpiresAt" IS NULL
  )
  OR (
    "mutationLeaseToken" IS NOT NULL
    AND "mutationLeaseOperation" IN ('switch', 'rollback', 'finalize')
    AND "mutationLeaseExpiresAt" IS NOT NULL
  )
);

CREATE INDEX "brain_governance_transition_mutationLeaseExpiresAt_idx"
ON "brain_governance_transition"("mutationLeaseExpiresAt");
