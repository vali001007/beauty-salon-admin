CREATE TABLE IF NOT EXISTS "SupplyLegacyMigrationMap" (
  "id" SERIAL NOT NULL,
  "legacyModel" TEXT NOT NULL,
  "legacyId" INTEGER NOT NULL,
  "targetModel" TEXT NOT NULL,
  "targetId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplyLegacyMigrationMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplyLegacyMigrationMap_legacyModel_legacyId_targetModel_key"
  ON "SupplyLegacyMigrationMap"("legacyModel", "legacyId", "targetModel");

CREATE INDEX IF NOT EXISTS "SupplyLegacyMigrationMap_targetModel_targetId_idx"
  ON "SupplyLegacyMigrationMap"("targetModel", "targetId");
