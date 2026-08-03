CREATE UNIQUE INDEX "brain_governance_transition_candidate_open_key"
ON "brain_governance_transition" ("candidateId")
WHERE "status" IN ('draft', 'validated', 'approved', 'switching', 'observing', 'rolling_back');

ALTER TABLE "brain_governance_transition"
ADD CONSTRAINT "brain_governance_transition_status_check"
CHECK (
  "status" IN (
    'draft',
    'validated',
    'approved',
    'switching',
    'observing',
    'completed',
    'rolling_back',
    'rolled_back',
    'failed'
  )
),
ADD CONSTRAINT "brain_governance_transition_policy_identity_check"
CHECK ("oldPolicyReleaseId" <> "newPolicyReleaseId"),
ADD CONSTRAINT "brain_governance_transition_policy_approval_check"
CHECK (("policyApprovedBy" IS NULL) = ("policyApprovedAt" IS NULL)),
ADD CONSTRAINT "brain_governance_transition_runtime_approval_check"
CHECK (("runtimeApprovedBy" IS NULL) = ("runtimeApprovedAt" IS NULL));
