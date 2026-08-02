ALTER TABLE "brain_action_confirmation"
ADD COLUMN "institutionalEffectProfileFingerprint" TEXT;

ALTER TABLE "brain_action_execution"
ADD COLUMN "institutionalEffectProfileFingerprint" TEXT;
