CREATE TABLE "MarketingRecommendationSnapshot" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER,
  "scope" TEXT NOT NULL DEFAULT 'customer',
  "type" TEXT,
  "predictionRunId" INTEGER,
  "cacheKey" TEXT NOT NULL,
  "cardsJson" JSONB NOT NULL,
  "cardCount" INTEGER NOT NULL DEFAULT 0,
  "sourceVersion" TEXT NOT NULL DEFAULT 'rules-v2',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "MarketingRecommendationSnapshot_cacheKey_key" ON "MarketingRecommendationSnapshot"("cacheKey");
CREATE INDEX "MarketingRecommendationSnapshot_storeId_scope_type_idx" ON "MarketingRecommendationSnapshot"("storeId", "scope", "type");
CREATE INDEX "MarketingRecommendationSnapshot_predictionRunId_idx" ON "MarketingRecommendationSnapshot"("predictionRunId");
CREATE INDEX "MarketingRecommendationSnapshot_generatedAt_idx" ON "MarketingRecommendationSnapshot"("generatedAt");
CREATE INDEX "MarketingRecommendationSnapshot_expiresAt_idx" ON "MarketingRecommendationSnapshot"("expiresAt");
