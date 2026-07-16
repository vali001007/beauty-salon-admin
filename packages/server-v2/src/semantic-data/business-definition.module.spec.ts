import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SemanticQueryExecutorService } from '../semantic-query/semantic-query-executor.service.js';
import {
  BUSINESS_DEFINITION_FIXTURE_SOURCE,
  BUSINESS_DEFINITION_QUERY_ADAPTERS,
  BusinessDefinitionCanonicalVerificationPort,
} from './business-definition-canonical-verifier.service.js';
import { BusinessDefinitionFixtureArtifactSourceService } from './business-definition-fixture-source.service.js';
import { BusinessDefinitionCandidateRuntimeQueryAdapter } from './business-definition-candidate-runtime-query.adapter.js';
import { BusinessDefinitionSemanticQueryAdapter } from './business-definition-semantic-query.adapter.js';
import { BusinessDefinitionModule } from './business-definition.module.js';
import { BrainMetricPublishedDefinitionSourceService } from './brain-metric-source-adapters.js';
import { SemanticDataModule } from './semantic-data.module.js';

describe('BusinessDefinitionModule production providers', () => {
  it('registers real fixture and semantic query providers without a SemanticData cycle', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [BusinessDefinitionModule] })
      .overrideProvider(PrismaService)
      .useValue({ businessDefinitionFixtureArtifact: { findFirst: jest.fn().mockResolvedValue(null) } })
      .overrideProvider(SemanticQueryExecutorService)
      .useValue({ execute: jest.fn() })
      .compile();

    expect(moduleRef.get(BUSINESS_DEFINITION_FIXTURE_SOURCE)).toBeInstanceOf(
      BusinessDefinitionFixtureArtifactSourceService,
    );
    expect(moduleRef.get(BUSINESS_DEFINITION_QUERY_ADAPTERS)).toEqual([
      expect.any(BusinessDefinitionCandidateRuntimeQueryAdapter),
      expect.any(BusinessDefinitionSemanticQueryAdapter),
    ]);
    expect(moduleRef.get(BusinessDefinitionCanonicalVerificationPort)).toBeDefined();
    expect(moduleRef.get(BrainMetricPublishedDefinitionSourceService)).toBeInstanceOf(
      BrainMetricPublishedDefinitionSourceService,
    );

    const semanticProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SemanticDataModule) ?? [];
    expect(semanticProviders).not.toContain(BusinessDefinitionCanonicalVerificationPort);
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];
    expect(appImports).toContain(BusinessDefinitionModule);
  });
});
