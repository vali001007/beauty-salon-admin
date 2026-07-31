ALTER TABLE "brain_action_confirmation"
ADD COLUMN "sideEffectInvariantProfileFingerprint" TEXT;

ALTER TABLE "brain_action_execution"
ADD COLUMN "sideEffectInvariantProfileFingerprint" TEXT;
