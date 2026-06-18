import { Module } from '@nestjs/common';
import { DimensionRegistryService } from './dimension-registry.service.js';
import { SemanticMetricRegistryService } from './semantic-metric-registry.service.js';

@Module({
  providers: [SemanticMetricRegistryService, DimensionRegistryService],
  exports: [SemanticMetricRegistryService, DimensionRegistryService],
})
export class SemanticDataModule {}
