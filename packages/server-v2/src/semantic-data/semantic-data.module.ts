import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BUSINESS_DEFINITION_SNAPSHOT_PROVIDER } from '../brain/cognition/business-definition-snapshot.types.js';
import { PublishedBusinessDefinitionSnapshotProviderService } from '../brain/cognition/published-business-definition-snapshot-provider.service.js';
import { BrainMetricCandidateGeneratorService } from './brain-metric-candidate-generator.service.js';
import { BrainMetricSourceAdapters } from './brain-metric-source-adapters.js';
import { BusinessMetricCatalogService } from './business-metric-catalog.service.js';
import { BusinessMetricCurrentLineageSourceService } from './business-metric-current-lineage-source.service.js';
import {
  BUSINESS_METRIC_CATALOG,
  BUSINESS_METRIC_CATALOG_REFRESHER,
  BUSINESS_METRIC_CURRENT_LINEAGE_SOURCE,
} from './business-metric-catalog.types.js';
import { DimensionRegistryService } from './dimension-registry.service.js';

@Module({
  imports: [PrismaModule],
  providers: [
    PublishedBusinessDefinitionSnapshotProviderService,
    {
      provide: BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
      useExisting: PublishedBusinessDefinitionSnapshotProviderService,
    },
    BusinessMetricCatalogService,
    BusinessMetricCurrentLineageSourceService,
    { provide: BUSINESS_METRIC_CATALOG, useExisting: BusinessMetricCatalogService },
    { provide: BUSINESS_METRIC_CATALOG_REFRESHER, useExisting: BusinessMetricCatalogService },
    { provide: BUSINESS_METRIC_CURRENT_LINEAGE_SOURCE, useExisting: BusinessMetricCurrentLineageSourceService },
    DimensionRegistryService,
    BrainMetricSourceAdapters,
    BrainMetricCandidateGeneratorService,
  ],
  exports: [
    PublishedBusinessDefinitionSnapshotProviderService,
    BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
    BusinessMetricCatalogService,
    BUSINESS_METRIC_CATALOG,
    BUSINESS_METRIC_CATALOG_REFRESHER,
    BusinessMetricCurrentLineageSourceService,
    BUSINESS_METRIC_CURRENT_LINEAGE_SOURCE,
    DimensionRegistryService,
    BrainMetricSourceAdapters,
    BrainMetricCandidateGeneratorService,
  ],
})
export class SemanticDataModule {}
