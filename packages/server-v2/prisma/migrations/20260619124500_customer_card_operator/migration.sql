-- Track the staff user who opened a customer card.
ALTER TABLE "CustomerCard" ADD COLUMN "operatorId" INTEGER;

ALTER TABLE "CustomerCard"
ADD CONSTRAINT "CustomerCard_operatorId_fkey"
FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CustomerCard_operatorId_idx" ON "CustomerCard"("operatorId");
