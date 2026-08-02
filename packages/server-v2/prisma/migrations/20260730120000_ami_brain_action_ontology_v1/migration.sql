ALTER TYPE "BusinessDefinitionKind" ADD VALUE IF NOT EXISTS 'action';

ALTER TABLE "brain_action_confirmation"
  ADD COLUMN IF NOT EXISTS "actionDefinitionKey" TEXT,
  ADD COLUMN IF NOT EXISTS "actionDefinitionVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "actionDefinitionFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "actionSourceFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "actionBindingFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "boundCapabilityKey" TEXT,
  ADD COLUMN IF NOT EXISTS "capabilityVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "capabilitySourceFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "ontologySnapshotFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "releaseId" INTEGER,
  ADD COLUMN IF NOT EXISTS "releaseFingerprint" TEXT;

CREATE INDEX IF NOT EXISTS "brain_action_confirmation_actionDefinitionKey_actionDefinitionVersion_idx"
  ON "brain_action_confirmation"("actionDefinitionKey", "actionDefinitionVersion");
CREATE INDEX IF NOT EXISTS "brain_action_confirmation_releaseId_releaseFingerprint_idx"
  ON "brain_action_confirmation"("releaseId", "releaseFingerprint");

ALTER TABLE "brain_action_execution"
  ADD COLUMN IF NOT EXISTS "capabilityVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "capabilitySourceFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "actionDefinitionKey" TEXT,
  ADD COLUMN IF NOT EXISTS "actionDefinitionVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "actionDefinitionFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "actionSourceFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "actionBindingFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "ontologySnapshotFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "releaseId" INTEGER,
  ADD COLUMN IF NOT EXISTS "releaseFingerprint" TEXT;

CREATE INDEX IF NOT EXISTS "brain_action_execution_actionDefinitionKey_actionDefinitionVersion_idx"
  ON "brain_action_execution"("actionDefinitionKey", "actionDefinitionVersion");
CREATE INDEX IF NOT EXISTS "brain_action_execution_releaseId_releaseFingerprint_idx"
  ON "brain_action_execution"("releaseId", "releaseFingerprint");
