ALTER TABLE "CommissionRecord" ADD COLUMN "staffUserId" INTEGER;
ALTER TABLE "CommissionSettlement" ADD COLUMN "staffUserId" INTEGER;

UPDATE "CommissionRecord" cr
SET "staffUserId" = b."userId"
FROM "Beautician" b
WHERE cr."beauticianId" = b."id"
  AND b."userId" IS NOT NULL;

UPDATE "CommissionSettlement" cs
SET "staffUserId" = b."userId"
FROM "Beautician" b
WHERE cs."beauticianId" = b."id"
  AND b."userId" IS NOT NULL;

ALTER TABLE "CommissionRecord" ALTER COLUMN "beauticianId" DROP NOT NULL;
ALTER TABLE "CommissionSettlement" ALTER COLUMN "beauticianId" DROP NOT NULL;

ALTER TABLE "CommissionSettlement" DROP CONSTRAINT IF EXISTS "CommissionSettlement_storeId_beauticianId_settleMonth_key";
DROP INDEX IF EXISTS "CommissionSettlement_storeId_beauticianId_settleMonth_key";

ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "CommissionRecord_beauticianId_fkey";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommissionSettlement" DROP CONSTRAINT IF EXISTS "CommissionSettlement_beauticianId_fkey";
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CommissionRecord_staffUserId_settleMonth_idx" ON "CommissionRecord"("staffUserId", "settleMonth");
CREATE INDEX "CommissionSettlement_staffUserId_idx" ON "CommissionSettlement"("staffUserId");
CREATE UNIQUE INDEX "CommissionSettlement_storeId_staffUserId_settleMonth_key" ON "CommissionSettlement"("storeId", "staffUserId", "settleMonth");
