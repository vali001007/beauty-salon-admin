ALTER TABLE "MarketingActivity" ADD COLUMN "pageSchema" JSONB;
ALTER TABLE "MarketingActivity" ADD COLUMN "sourceRecommendationId" TEXT;
ALTER TABLE "MarketingActivity" ADD COLUMN "aiGenerationId" TEXT;
ALTER TABLE "MarketingActivity" ADD COLUMN "publishStatus" TEXT;
ALTER TABLE "MarketingActivity" ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "MarketingActivity_publishStatus_idx" ON "MarketingActivity"("publishStatus");
