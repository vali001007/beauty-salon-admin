ALTER TABLE "MarketingPageLead"
  ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE TABLE "MarketingPageAttribution" (
  "id" SERIAL NOT NULL,
  "leadId" INTEGER NOT NULL,
  "pageId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "orderId" INTEGER NOT NULL,
  "attributionType" TEXT NOT NULL DEFAULT 'last_touch',
  "attributedRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
  "touchedAt" TIMESTAMP(3) NOT NULL,
  "convertedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketingPageAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingPageAttribution_leadId_orderId_key"
  ON "MarketingPageAttribution"("leadId", "orderId");

CREATE INDEX "MarketingPageAttribution_pageId_convertedAt_idx"
  ON "MarketingPageAttribution"("pageId", "convertedAt");

CREATE INDEX "MarketingPageAttribution_customerId_idx"
  ON "MarketingPageAttribution"("customerId");

CREATE INDEX "MarketingPageAttribution_orderId_idx"
  ON "MarketingPageAttribution"("orderId");

ALTER TABLE "MarketingPageAttribution"
  ADD CONSTRAINT "MarketingPageAttribution_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "MarketingPageLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingPageAttribution"
  ADD CONSTRAINT "MarketingPageAttribution_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "MarketingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingPageAttribution"
  ADD CONSTRAINT "MarketingPageAttribution_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingPageAttribution"
  ADD CONSTRAINT "MarketingPageAttribution_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
