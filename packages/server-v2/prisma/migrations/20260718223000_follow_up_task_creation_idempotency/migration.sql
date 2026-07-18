ALTER TABLE "TerminalFollowUpTask"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "creationFingerprint" VARCHAR(64);

CREATE UNIQUE INDEX "TerminalFollowUpTask_idempotencyKey_key" ON "TerminalFollowUpTask"("idempotencyKey");
