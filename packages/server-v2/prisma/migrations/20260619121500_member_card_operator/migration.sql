-- Add operator tracking for member-card balance transactions.
ALTER TABLE "CustomerBalanceTransaction" ADD COLUMN "operatorId" INTEGER;

ALTER TABLE "CustomerBalanceTransaction"
ADD CONSTRAINT "CustomerBalanceTransaction_operatorId_fkey"
FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CustomerBalanceTransaction_operatorId_idx" ON "CustomerBalanceTransaction"("operatorId");
