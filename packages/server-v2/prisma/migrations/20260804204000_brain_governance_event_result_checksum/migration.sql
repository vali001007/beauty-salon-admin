ALTER TABLE "brain_governance_event"
ADD COLUMN "resultChecksum" VARCHAR(64);

ALTER TABLE "brain_governance_event"
ADD CONSTRAINT "brain_governance_event_resultChecksum_check"
CHECK (
  "resultChecksum" IS NULL
  OR "resultChecksum" ~ '^[0-9a-f]{64}$'
);
