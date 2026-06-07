CREATE TABLE "MarketingPage" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER,
  "activityId" INTEGER,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "runtimeType" TEXT NOT NULL DEFAULT 'h5',
  "pageSchema" JSONB NOT NULL,
  "snapshotJson" JSONB,
  "themeJson" JSONB,
  "shareTitle" TEXT,
  "shareDescription" TEXT,
  "shareImage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "shareUrl" TEXT,
  "miniappPath" TEXT,
  "qrCodeUrl" TEXT,
  "aiGenerationId" TEXT,
  "promptVersion" TEXT,
  "publishedAt" TIMESTAMP(3),
  "offlineAt" TIMESTAMP(3),
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketingPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingPageVersion" (
  "id" SERIAL NOT NULL,
  "pageId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "pageSchema" JSONB NOT NULL,
  "snapshotJson" JSONB,
  "changeSummary" TEXT,
  "aiGenerationId" TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketingPageVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingPageEvent" (
  "id" SERIAL NOT NULL,
  "pageId" INTEGER NOT NULL,
  "storeId" INTEGER,
  "customerId" INTEGER,
  "sessionId" TEXT,
  "openId" TEXT,
  "eventType" TEXT NOT NULL,
  "channel" TEXT,
  "referrer" TEXT,
  "staffId" INTEGER,
  "campaignId" TEXT,
  "source" TEXT,
  "medium" TEXT,
  "userAgent" TEXT,
  "ipHash" TEXT,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketingPageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingPageLead" (
  "id" SERIAL NOT NULL,
  "pageId" INTEGER NOT NULL,
  "storeId" INTEGER,
  "customerId" INTEGER,
  "sessionId" TEXT,
  "name" TEXT,
  "phone" TEXT NOT NULL,
  "intentType" TEXT,
  "message" TEXT,
  "channel" TEXT,
  "staffId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'new',
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketingPageLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingPage_slug_key" ON "MarketingPage"("slug");
CREATE INDEX "MarketingPage_storeId_status_idx" ON "MarketingPage"("storeId", "status");
CREATE INDEX "MarketingPage_sourceType_sourceId_idx" ON "MarketingPage"("sourceType", "sourceId");
CREATE INDEX "MarketingPage_publishedAt_idx" ON "MarketingPage"("publishedAt");

CREATE UNIQUE INDEX "MarketingPageVersion_pageId_version_key" ON "MarketingPageVersion"("pageId", "version");
CREATE INDEX "MarketingPageVersion_pageId_idx" ON "MarketingPageVersion"("pageId");

CREATE INDEX "MarketingPageEvent_pageId_eventType_occurredAt_idx" ON "MarketingPageEvent"("pageId", "eventType", "occurredAt");
CREATE INDEX "MarketingPageEvent_storeId_occurredAt_idx" ON "MarketingPageEvent"("storeId", "occurredAt");
CREATE INDEX "MarketingPageEvent_customerId_idx" ON "MarketingPageEvent"("customerId");
CREATE INDEX "MarketingPageEvent_sessionId_idx" ON "MarketingPageEvent"("sessionId");
CREATE INDEX "MarketingPageEvent_channel_occurredAt_idx" ON "MarketingPageEvent"("channel", "occurredAt");

CREATE INDEX "MarketingPageLead_pageId_createdAt_idx" ON "MarketingPageLead"("pageId", "createdAt");
CREATE INDEX "MarketingPageLead_storeId_status_idx" ON "MarketingPageLead"("storeId", "status");
CREATE INDEX "MarketingPageLead_phone_idx" ON "MarketingPageLead"("phone");

ALTER TABLE "MarketingPageVersion"
  ADD CONSTRAINT "MarketingPageVersion_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "MarketingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingPageEvent"
  ADD CONSTRAINT "MarketingPageEvent_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "MarketingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingPageLead"
  ADD CONSTRAINT "MarketingPageLead_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "MarketingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
