CREATE TABLE IF NOT EXISTS "MarketingRuleTemplate" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "source" TEXT NOT NULL DEFAULT 'system',
  "category" TEXT NOT NULL,
  "categoryLabel" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'recommended',
  "version" TEXT NOT NULL DEFAULT '1.0.0',
  "baseTemplateId" INTEGER,
  "storeId" INTEGER,
  "triggerType" TEXT NOT NULL,
  "paramSchema" JSONB NOT NULL,
  "defaultParams" JSONB NOT NULL,
  "recommendedActions" JSONB NOT NULL,
  "scheduleDefault" JSONB NOT NULL,
  "frequencyCap" JSONB NOT NULL,
  "dataDependencies" JSONB NOT NULL,
  "recommendationReason" TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketingRuleTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketingAutomationStrategy"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "ruleTemplateId" INTEGER,
  ADD COLUMN IF NOT EXISTS "ruleTemplateVersion" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingRuleTemplate_code_key" ON "MarketingRuleTemplate"("code");
CREATE INDEX IF NOT EXISTS "MarketingRuleTemplate_source_idx" ON "MarketingRuleTemplate"("source");
CREATE INDEX IF NOT EXISTS "MarketingRuleTemplate_category_idx" ON "MarketingRuleTemplate"("category");
CREATE INDEX IF NOT EXISTS "MarketingRuleTemplate_scenario_idx" ON "MarketingRuleTemplate"("scenario");
CREATE INDEX IF NOT EXISTS "MarketingRuleTemplate_priority_idx" ON "MarketingRuleTemplate"("priority");
CREATE INDEX IF NOT EXISTS "MarketingRuleTemplate_status_idx" ON "MarketingRuleTemplate"("status");
CREATE INDEX IF NOT EXISTS "MarketingRuleTemplate_storeId_idx" ON "MarketingRuleTemplate"("storeId");
CREATE INDEX IF NOT EXISTS "MarketingRuleTemplate_triggerType_idx" ON "MarketingRuleTemplate"("triggerType");
CREATE INDEX IF NOT EXISTS "MarketingAutomationStrategy_source_idx" ON "MarketingAutomationStrategy"("source");
CREATE INDEX IF NOT EXISTS "MarketingAutomationStrategy_ruleTemplateId_idx" ON "MarketingAutomationStrategy"("ruleTemplateId");

ALTER TABLE "MarketingRuleTemplate"
  ADD CONSTRAINT "MarketingRuleTemplate_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingRuleTemplate"
  ADD CONSTRAINT "MarketingRuleTemplate_baseTemplateId_fkey"
  FOREIGN KEY ("baseTemplateId") REFERENCES "MarketingRuleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingAutomationStrategy"
  ADD CONSTRAINT "MarketingAutomationStrategy_ruleTemplateId_fkey"
  FOREIGN KEY ("ruleTemplateId") REFERENCES "MarketingRuleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
