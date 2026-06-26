-- Split commission rule algorithms from their applicable object/employee scope.
-- Existing CommissionRule rows are kept for historical traceability.

CREATE TABLE "CommissionRuleAssignment" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "ruleId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'all',
  "targetId" INTEGER,
  "userId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommissionRuleAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CommissionRecord" ADD COLUMN "assignmentId" INTEGER;

CREATE INDEX "CommissionRuleAssignment_storeId_type_status_idx" ON "CommissionRuleAssignment"("storeId", "type", "status");
CREATE INDEX "CommissionRuleAssignment_ruleId_idx" ON "CommissionRuleAssignment"("ruleId");
CREATE INDEX "CommissionRuleAssignment_userId_idx" ON "CommissionRuleAssignment"("userId");
CREATE INDEX "CommissionRuleAssignment_targetType_targetId_idx" ON "CommissionRuleAssignment"("targetType", "targetId");
CREATE INDEX "CommissionRecord_assignmentId_idx" ON "CommissionRecord"("assignmentId");

ALTER TABLE "CommissionRuleAssignment"
  ADD CONSTRAINT "CommissionRuleAssignment_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionRuleAssignment"
  ADD CONSTRAINT "CommissionRuleAssignment_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionRuleAssignment"
  ADD CONSTRAINT "CommissionRuleAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionRecord"
  ADD CONSTRAINT "CommissionRecord_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "CommissionRuleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "CommissionRuleAssignment" (
  "storeId",
  "ruleId",
  "type",
  "targetType",
  "targetId",
  "userId",
  "status",
  "remark",
  "createdAt",
  "updatedAt"
)
SELECT
  "storeId",
  "id",
  "type",
  CASE
    WHEN "type" IN ('project', 'product', 'card_sale') THEN 'specific'
    ELSE 'all'
  END,
  CASE
    WHEN "type" IN ('project', 'product', 'card_sale') THEN "targetId"
    ELSE NULL
  END,
  "userId",
  "status",
  '历史规则自动拆分为规则配置',
  "createdAt",
  "updatedAt"
FROM "CommissionRule"
WHERE "userId" IS NOT NULL
  AND (
    ("type" IN ('project', 'product', 'card_sale') AND "targetId" IS NOT NULL)
    OR "type" IN ('recharge', 'new_customer')
  );

UPDATE "CommissionRecord" cr
SET "assignmentId" = a."id"
FROM "CommissionRuleAssignment" a
WHERE cr."ruleId" = a."ruleId"
  AND cr."staffUserId" = a."userId";
