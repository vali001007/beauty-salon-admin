ALTER TABLE "brain_skill_registry"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "domains" JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN "intents" JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN "allowedRoles" JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN "readOnly" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sideEffect" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "idempotency" TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "grounding" TEXT NOT NULL DEFAULT 'domain_service',
  ADD COLUMN "examples" JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN "successSchema" JSONB NOT NULL DEFAULT '{}'::JSONB;

UPDATE "brain_skill_registry"
SET
  "readOnly" = false,
  "sideEffect" = true,
  "requiresConfirmation" = true,
  "idempotency" = 'required',
  "riskLevel" = CASE WHEN "riskLevel" = 'low' THEN 'medium' ELSE "riskLevel" END
WHERE "type" = 'action';
