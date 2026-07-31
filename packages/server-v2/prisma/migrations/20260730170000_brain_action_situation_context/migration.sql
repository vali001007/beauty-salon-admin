ALTER TABLE "brain_action_confirmation"
ADD COLUMN "situationContextProfileFingerprint" TEXT,
ADD COLUMN "situationContextFingerprint" TEXT;

ALTER TABLE "brain_action_execution"
ADD COLUMN "situationContextProfileFingerprint" TEXT,
ADD COLUMN "situationContextFingerprint" TEXT;
