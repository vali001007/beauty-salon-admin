ALTER TABLE "brain_warmup_artifact"
ADD COLUMN "payloadCompressed" BYTEA,
ADD COLUMN "compression" TEXT,
ADD COLUMN "payloadBytes" INTEGER;
