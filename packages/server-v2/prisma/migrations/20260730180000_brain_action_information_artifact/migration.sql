ALTER TABLE "brain_action_confirmation"
  ADD COLUMN "actionModalityPolicyFingerprint" TEXT,
  ADD COLUMN "informationArtifactProfileFingerprint" TEXT,
  ADD COLUMN "informationArtifactFingerprints" JSONB;

ALTER TABLE "brain_action_execution"
  ADD COLUMN "actionModalityPolicyFingerprint" TEXT,
  ADD COLUMN "informationArtifactProfileFingerprint" TEXT,
  ADD COLUMN "informationArtifactFingerprints" JSONB;
