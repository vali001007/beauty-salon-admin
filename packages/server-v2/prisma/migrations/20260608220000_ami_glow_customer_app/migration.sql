-- Ami Glow customer miniapp identity, events, and display configuration.

CREATE TABLE IF NOT EXISTS "CustomerAppIdentity" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER,
  "openid" TEXT NOT NULL,
  "unionid" TEXT,
  "nickname" TEXT,
  "avatarUrl" TEXT,
  "phone" TEXT,
  "bindStatus" TEXT NOT NULL DEFAULT 'unbound',
  "source" TEXT NOT NULL DEFAULT 'ami_glow',
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAppIdentity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerAppIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAppIdentity_storeId_openid_key" ON "CustomerAppIdentity"("storeId", "openid");
CREATE INDEX IF NOT EXISTS "CustomerAppIdentity_customerId_idx" ON "CustomerAppIdentity"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerAppIdentity_phone_idx" ON "CustomerAppIdentity"("phone");
CREATE INDEX IF NOT EXISTS "CustomerAppIdentity_unionid_idx" ON "CustomerAppIdentity"("unionid");
CREATE INDEX IF NOT EXISTS "CustomerAppIdentity_bindStatus_idx" ON "CustomerAppIdentity"("bindStatus");

CREATE TABLE IF NOT EXISTS "CustomerAppEvent" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER,
  "identityId" INTEGER,
  "openid" TEXT,
  "sessionId" TEXT,
  "eventType" TEXT NOT NULL,
  "channel" TEXT,
  "targetType" TEXT,
  "targetId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'ami_glow',
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAppEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerAppEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CustomerAppEvent_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CustomerAppIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CustomerAppEvent_storeId_occurredAt_idx" ON "CustomerAppEvent"("storeId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CustomerAppEvent_customerId_occurredAt_idx" ON "CustomerAppEvent"("customerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CustomerAppEvent_identityId_idx" ON "CustomerAppEvent"("identityId");
CREATE INDEX IF NOT EXISTS "CustomerAppEvent_openid_idx" ON "CustomerAppEvent"("openid");
CREATE INDEX IF NOT EXISTS "CustomerAppEvent_eventType_idx" ON "CustomerAppEvent"("eventType");
CREATE INDEX IF NOT EXISTS "CustomerAppEvent_targetType_targetId_idx" ON "CustomerAppEvent"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "CustomerAppEvent_channel_occurredAt_idx" ON "CustomerAppEvent"("channel", "occurredAt");

CREATE TABLE IF NOT EXISTS "ami_glow_display_configs" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectId" INTEGER NOT NULL,
  "showInAmiGlow" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bannerImage" TEXT,
  "summary" TEXT,
  "ctaType" TEXT,
  "publishStatus" TEXT NOT NULL DEFAULT 'published',
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ami_glow_display_configs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ami_glow_display_configs_storeId_objectType_objectId_key" ON "ami_glow_display_configs"("storeId", "objectType", "objectId");
CREATE INDEX IF NOT EXISTS "ami_glow_display_configs_storeId_objectType_publishStatus_idx" ON "ami_glow_display_configs"("storeId", "objectType", "publishStatus");
CREATE INDEX IF NOT EXISTS "ami_glow_display_configs_showInAmiGlow_idx" ON "ami_glow_display_configs"("showInAmiGlow");
CREATE INDEX IF NOT EXISTS "ami_glow_display_configs_sortOrder_idx" ON "ami_glow_display_configs"("sortOrder");
