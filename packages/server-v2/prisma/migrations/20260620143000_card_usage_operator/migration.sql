ALTER TABLE "CardUsageRecord" ADD COLUMN "operatorId" INTEGER;

CREATE INDEX "CardUsageRecord_operatorId_idx" ON "CardUsageRecord"("operatorId");

ALTER TABLE "CardUsageRecord"
  ADD CONSTRAINT "CardUsageRecord_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
