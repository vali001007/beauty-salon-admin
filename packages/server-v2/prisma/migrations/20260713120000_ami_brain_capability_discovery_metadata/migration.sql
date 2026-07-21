ALTER TABLE "brain_skill_registry"
  ADD COLUMN "sourceFingerprint" TEXT,
  ADD COLUMN "definitionRefs" JSONB,
  ADD COLUMN "synonyms" JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN "negativeExamples" JSONB NOT NULL DEFAULT '[]'::JSONB;
