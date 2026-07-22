import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SemanticDataModule } from '../semantic-data/semantic-data.module.js';
import { QueryPlannerService } from './query-planner.service.js';
import { QuerySafetyGuardService } from './query-safety-guard.service.js';
import { QueryTemplateRegistryService } from './query-template-registry.service.js';
import { ResponseComposerService } from './response-composer.service.js';
import { SemanticQueryExecutorService } from './semantic-query-executor.service.js';
import { BusinessMetricCatalogCoverageService } from './business-metric-catalog-coverage.service.js';
import { BusinessDefinitionRuntimeQueryEngineService } from './business-definition-runtime-query-engine.service.js';

@Module({
  imports: [PrismaModule, SemanticDataModule],
  providers: [
    QueryPlannerService,
    QuerySafetyGuardService,
    QueryTemplateRegistryService,
    BusinessMetricCatalogCoverageService,
    BusinessDefinitionRuntimeQueryEngineService,
    SemanticQueryExecutorService,
    ResponseComposerService,
  ],
  exports: [
    QueryPlannerService,
    QuerySafetyGuardService,
    QueryTemplateRegistryService,
    BusinessDefinitionRuntimeQueryEngineService,
    SemanticQueryExecutorService,
    ResponseComposerService,
  ],
})
export class SemanticQueryModule {}
