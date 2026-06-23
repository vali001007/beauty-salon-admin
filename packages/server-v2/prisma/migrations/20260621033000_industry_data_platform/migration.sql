CREATE TABLE "IndustryDataSource" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "licenseType" TEXT,
  "confidenceLevel" TEXT NOT NULL DEFAULT 'medium',
  "applicableScope" TEXT,
  "ownerName" TEXT,
  "sourceUrl" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "lastVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IndustryDataSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryEvidence" (
  "id" SERIAL NOT NULL,
  "sourceId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL DEFAULT 'link',
  "url" TEXT,
  "filePath" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndustryEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryServiceTemplate" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "aliases" JSONB,
  "category" TEXT NOT NULL,
  "subCategory" TEXT,
  "targetStoreTypes" JSONB,
  "recommendedDurationMin" INTEGER,
  "recommendedDurationMax" INTEGER,
  "referencePriceMin" DECIMAL(65,30),
  "referencePriceMax" DECIMAL(65,30),
  "targetCustomers" JSONB,
  "contraindications" JSONB,
  "recommendedFrequency" TEXT,
  "sellingPoints" JSONB,
  "bomUnavailableReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "sourceId" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IndustryServiceTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryProductTemplate" (
  "id" SERIAL NOT NULL,
  "standardProductCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "aliases" JSONB,
  "category" TEXT NOT NULL,
  "subCategory" TEXT,
  "productType" TEXT NOT NULL,
  "recommendedSpec" TEXT,
  "unit" TEXT,
  "packageUnit" TEXT,
  "referenceCostMin" DECIMAL(65,30),
  "referenceCostMax" DECIMAL(65,30),
  "referenceRetailPriceMin" DECIMAL(65,30),
  "referenceRetailPriceMax" DECIMAL(65,30),
  "applicableServiceCategories" JSONB,
  "supplyCategoryCode" TEXT,
  "preferredSpecKey" TEXT,
  "externalMappingKey" TEXT,
  "futureSupplyMappingStatus" TEXT NOT NULL DEFAULT 'not_connected',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IndustryProductTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryProjectBomTemplate" (
  "id" SERIAL NOT NULL,
  "serviceTemplateId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "totalCostMin" DECIMAL(65,30),
  "totalCostMax" DECIMAL(65,30),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "sourceId" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IndustryProjectBomTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryProjectBomItemTemplate" (
  "id" SERIAL NOT NULL,
  "bomTemplateId" INTEGER NOT NULL,
  "productTemplateId" INTEGER NOT NULL,
  "itemRole" TEXT NOT NULL DEFAULT 'main_material',
  "standardQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "lossRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "costIncluded" BOOLEAN NOT NULL DEFAULT true,
  "serviceStep" TEXT,
  "allowSubstitute" BOOLEAN NOT NULL DEFAULT false,
  "substituteGroupCode" TEXT,
  "futureSupplyRequired" BOOLEAN NOT NULL DEFAULT false,
  "futureSupplyMappingKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustryProjectBomItemTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustrySalaryBenchmark" (
  "id" SERIAL NOT NULL,
  "jobRole" TEXT NOT NULL,
  "roleCategory" TEXT,
  "employeeLevel" TEXT,
  "targetStoreTypes" JSONB,
  "cityTier" TEXT,
  "baseSalaryMin" DECIMAL(65,30),
  "baseSalaryMax" DECIMAL(65,30),
  "commissionRateMin" DECIMAL(65,30),
  "commissionRateMax" DECIMAL(65,30),
  "serviceFeeMin" DECIMAL(65,30),
  "serviceFeeMax" DECIMAL(65,30),
  "performanceMetrics" JSONB,
  "responsibilities" JSONB,
  "capabilityRequirements" JSONB,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IndustrySalaryBenchmark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryKnowledgeItem" (
  "id" SERIAL NOT NULL,
  "domain" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "structuredPayload" JSONB,
  "tags" JSONB,
  "applicableServiceTemplateIds" JSONB,
  "applicableProductTemplateIds" JSONB,
  "applicableRoles" JSONB,
  "sourceId" INTEGER,
  "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "IndustryKnowledgeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustryAdoptionRecord" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER,
  "adoptedByUserId" INTEGER,
  "adoptionType" TEXT NOT NULL,
  "serviceTemplateId" INTEGER,
  "productTemplateId" INTEGER,
  "templateVersion" INTEGER,
  "localProjectId" INTEGER,
  "localProductId" INTEGER,
  "localBomItemIds" JSONB,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndustryAdoptionRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IndustrySupplyMappingRequest" (
  "id" SERIAL NOT NULL,
  "productTemplateId" INTEGER,
  "bomItemTemplateId" INTEGER,
  "requestType" TEXT NOT NULL DEFAULT 'mapping',
  "status" TEXT NOT NULL DEFAULT 'not_connected',
  "requestedByStoreId" INTEGER,
  "requestedByUserId" INTEGER,
  "note" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndustrySupplyMappingRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndustryServiceTemplate_code_key" ON "IndustryServiceTemplate"("code");
CREATE UNIQUE INDEX "IndustryProductTemplate_standardProductCode_key" ON "IndustryProductTemplate"("standardProductCode");
CREATE UNIQUE INDEX "IndustryProjectBomTemplate_serviceTemplateId_version_key" ON "IndustryProjectBomTemplate"("serviceTemplateId", "version");

CREATE INDEX "IndustryDataSource_sourceType_idx" ON "IndustryDataSource"("sourceType");
CREATE INDEX "IndustryDataSource_status_idx" ON "IndustryDataSource"("status");
CREATE INDEX "IndustryDataSource_confidenceLevel_idx" ON "IndustryDataSource"("confidenceLevel");
CREATE INDEX "IndustryEvidence_sourceId_idx" ON "IndustryEvidence"("sourceId");
CREATE INDEX "IndustryEvidence_evidenceType_idx" ON "IndustryEvidence"("evidenceType");
CREATE INDEX "IndustryServiceTemplate_category_idx" ON "IndustryServiceTemplate"("category");
CREATE INDEX "IndustryServiceTemplate_status_idx" ON "IndustryServiceTemplate"("status");
CREATE INDEX "IndustryServiceTemplate_sourceId_idx" ON "IndustryServiceTemplate"("sourceId");
CREATE INDEX "IndustryServiceTemplate_name_idx" ON "IndustryServiceTemplate"("name");
CREATE INDEX "IndustryProductTemplate_category_idx" ON "IndustryProductTemplate"("category");
CREATE INDEX "IndustryProductTemplate_productType_idx" ON "IndustryProductTemplate"("productType");
CREATE INDEX "IndustryProductTemplate_status_idx" ON "IndustryProductTemplate"("status");
CREATE INDEX "IndustryProductTemplate_futureSupplyMappingStatus_idx" ON "IndustryProductTemplate"("futureSupplyMappingStatus");
CREATE INDEX "IndustryProductTemplate_name_idx" ON "IndustryProductTemplate"("name");
CREATE INDEX "IndustryProjectBomTemplate_serviceTemplateId_idx" ON "IndustryProjectBomTemplate"("serviceTemplateId");
CREATE INDEX "IndustryProjectBomTemplate_status_idx" ON "IndustryProjectBomTemplate"("status");
CREATE INDEX "IndustryProjectBomItemTemplate_bomTemplateId_idx" ON "IndustryProjectBomItemTemplate"("bomTemplateId");
CREATE INDEX "IndustryProjectBomItemTemplate_productTemplateId_idx" ON "IndustryProjectBomItemTemplate"("productTemplateId");
CREATE INDEX "IndustryProjectBomItemTemplate_substituteGroupCode_idx" ON "IndustryProjectBomItemTemplate"("substituteGroupCode");
CREATE INDEX "IndustrySalaryBenchmark_jobRole_idx" ON "IndustrySalaryBenchmark"("jobRole");
CREATE INDEX "IndustrySalaryBenchmark_roleCategory_idx" ON "IndustrySalaryBenchmark"("roleCategory");
CREATE INDEX "IndustrySalaryBenchmark_status_idx" ON "IndustrySalaryBenchmark"("status");
CREATE INDEX "IndustryKnowledgeItem_domain_idx" ON "IndustryKnowledgeItem"("domain");
CREATE INDEX "IndustryKnowledgeItem_reviewStatus_idx" ON "IndustryKnowledgeItem"("reviewStatus");
CREATE INDEX "IndustryKnowledgeItem_sourceId_idx" ON "IndustryKnowledgeItem"("sourceId");
CREATE INDEX "IndustryAdoptionRecord_storeId_idx" ON "IndustryAdoptionRecord"("storeId");
CREATE INDEX "IndustryAdoptionRecord_adoptionType_idx" ON "IndustryAdoptionRecord"("adoptionType");
CREATE INDEX "IndustryAdoptionRecord_serviceTemplateId_idx" ON "IndustryAdoptionRecord"("serviceTemplateId");
CREATE INDEX "IndustryAdoptionRecord_productTemplateId_idx" ON "IndustryAdoptionRecord"("productTemplateId");
CREATE INDEX "IndustrySupplyMappingRequest_productTemplateId_idx" ON "IndustrySupplyMappingRequest"("productTemplateId");
CREATE INDEX "IndustrySupplyMappingRequest_bomItemTemplateId_idx" ON "IndustrySupplyMappingRequest"("bomItemTemplateId");
CREATE INDEX "IndustrySupplyMappingRequest_status_idx" ON "IndustrySupplyMappingRequest"("status");

ALTER TABLE "IndustryEvidence" ADD CONSTRAINT "IndustryEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IndustryDataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryServiceTemplate" ADD CONSTRAINT "IndustryServiceTemplate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IndustryDataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IndustryProjectBomTemplate" ADD CONSTRAINT "IndustryProjectBomTemplate_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "IndustryServiceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryProjectBomTemplate" ADD CONSTRAINT "IndustryProjectBomTemplate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IndustryDataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IndustryProjectBomItemTemplate" ADD CONSTRAINT "IndustryProjectBomItemTemplate_bomTemplateId_fkey" FOREIGN KEY ("bomTemplateId") REFERENCES "IndustryProjectBomTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustryProjectBomItemTemplate" ADD CONSTRAINT "IndustryProjectBomItemTemplate_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "IndustryProductTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndustryKnowledgeItem" ADD CONSTRAINT "IndustryKnowledgeItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IndustryDataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IndustryAdoptionRecord" ADD CONSTRAINT "IndustryAdoptionRecord_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "IndustryServiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
