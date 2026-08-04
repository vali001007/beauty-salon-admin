CREATE TABLE "brain_governance_event" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brain_governance_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brain_governance_event_candidateId_eventType_createdAt_idx"
ON "brain_governance_event"("candidateId", "eventType", "createdAt");

CREATE INDEX "brain_governance_event_entityType_entityId_createdAt_idx"
ON "brain_governance_event"("entityType", "entityId", "createdAt");

CREATE INDEX "brain_governance_event_eventType_createdAt_idx"
ON "brain_governance_event"("eventType", "createdAt");

ALTER TABLE "brain_governance_event"
ADD CONSTRAINT "brain_governance_event_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "brain_governance_candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
