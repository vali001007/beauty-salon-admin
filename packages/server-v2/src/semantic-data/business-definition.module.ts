import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SemanticQueryModule } from '../semantic-query/semantic-query.module.js';
import {
  BUSINESS_DEFINITION_FIXTURE_SOURCE,
  BUSINESS_DEFINITION_QUERY_ADAPTERS,
  BusinessDefinitionCanonicalVerificationPort,
  BusinessDefinitionCanonicalVerifierService,
} from './business-definition-canonical-verifier.service.js';
import { BusinessDefinitionController } from './business-definition.controller.js';
import { BusinessDefinitionFixtureArtifactSourceService } from './business-definition-fixture-source.service.js';
import { BusinessDefinitionProjectionCompilerService } from './business-definition-projection-compiler.service.js';
import { BusinessDefinitionRegistryService } from './business-definition-registry.service.js';
import { BusinessDefinitionSemanticQueryAdapter } from './business-definition-semantic-query.adapter.js';
import { BusinessDefinitionCandidateRuntimeQueryAdapter } from './business-definition-candidate-runtime-query.adapter.js';
import {
  BusinessSemanticAliasEvaluationPort,
  BusinessSemanticAliasEvaluationService,
} from './business-semantic-alias-evaluation.service.js';
import { BusinessSemanticEvidenceService } from './business-semantic-evidence.service.js';
import { BusinessSemanticEvidenceWorkerService } from './business-semantic-evidence-worker.service.js';
import { BrainMetricPublishedDefinitionSourceService } from './brain-metric-source-adapters.js';
import { BrainSemanticCandidateSyncService } from './brain-semantic-candidate-sync.service.js';
import { SemanticDataModule } from './semantic-data.module.js';

@Module({
  imports: [PrismaModule, SemanticDataModule, SemanticQueryModule],
  controllers: [BusinessDefinitionController],
  providers: [
    BusinessDefinitionRegistryService,
    BusinessDefinitionProjectionCompilerService,
    BusinessDefinitionCanonicalVerifierService,
    BusinessDefinitionFixtureArtifactSourceService,
    BusinessDefinitionSemanticQueryAdapter,
    BusinessDefinitionCandidateRuntimeQueryAdapter,
    BrainMetricPublishedDefinitionSourceService,
    BrainSemanticCandidateSyncService,
    BusinessSemanticEvidenceService,
    BusinessSemanticAliasEvaluationService,
    BusinessSemanticEvidenceWorkerService,
    {
      provide: BUSINESS_DEFINITION_FIXTURE_SOURCE,
      useExisting: BusinessDefinitionFixtureArtifactSourceService,
    },
    {
      provide: BUSINESS_DEFINITION_QUERY_ADAPTERS,
      useFactory: (
        candidateAdapter: BusinessDefinitionCandidateRuntimeQueryAdapter,
        legacyAdapter: BusinessDefinitionSemanticQueryAdapter,
      ) => [candidateAdapter, legacyAdapter],
      inject: [BusinessDefinitionCandidateRuntimeQueryAdapter, BusinessDefinitionSemanticQueryAdapter],
    },
    {
      provide: BusinessDefinitionCanonicalVerificationPort,
      useExisting: BusinessDefinitionCanonicalVerifierService,
    },
    {
      provide: BusinessSemanticAliasEvaluationPort,
      useExisting: BusinessSemanticAliasEvaluationService,
    },
  ],
  exports: [
    BusinessDefinitionRegistryService,
    BusinessDefinitionProjectionCompilerService,
    BusinessDefinitionCanonicalVerificationPort,
    BrainMetricPublishedDefinitionSourceService,
    BrainSemanticCandidateSyncService,
    BusinessSemanticEvidenceService,
    BusinessSemanticAliasEvaluationPort,
    BusinessSemanticEvidenceWorkerService,
  ],
})
export class BusinessDefinitionModule {}
