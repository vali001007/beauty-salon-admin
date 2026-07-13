ALTER TABLE "brain_conversation"
ADD COLUMN "contextSnapshot" JSONB,
ADD COLUMN "contextVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "brain_memory_revision" (
    "id" SERIAL NOT NULL,
    "memoryId" INTEGER NOT NULL,
    "previousMemoryId" INTEGER,
    "revisionType" TEXT NOT NULL,
    "previousContent" JSONB,
    "nextContent" JSONB,
    "changedByUserId" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brain_memory_revision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brain_memory_revision_memoryId_createdAt_idx"
ON "brain_memory_revision"("memoryId", "createdAt");

CREATE INDEX "brain_memory_revision_previousMemoryId_idx"
ON "brain_memory_revision"("previousMemoryId");

ALTER TABLE "brain_memory_revision"
ADD CONSTRAINT "brain_memory_revision_memoryId_fkey"
FOREIGN KEY ("memoryId") REFERENCES "brain_memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
