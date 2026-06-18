ALTER TABLE "MarketingActivity" ADD COLUMN "primaryPromotionId" INTEGER;
ALTER TABLE "MarketingActivity" ADD COLUMN "promotionIdsJson" JSONB;

CREATE INDEX "MarketingActivity_primaryPromotionId_idx" ON "MarketingActivity"("primaryPromotionId");

ALTER TABLE "MarketingActivity"
  ADD CONSTRAINT "MarketingActivity_primaryPromotionId_fkey"
  FOREIGN KEY ("primaryPromotionId")
  REFERENCES "Promotion"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
