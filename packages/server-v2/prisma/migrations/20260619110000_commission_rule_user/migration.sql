ALTER TABLE "CommissionRule" ADD COLUMN "userId" INTEGER;

CREATE INDEX "CommissionRule_userId_idx" ON "CommissionRule"("userId");

ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
