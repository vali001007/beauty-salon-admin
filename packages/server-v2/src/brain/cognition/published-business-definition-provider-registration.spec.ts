import { MODULE_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'node:fs';
import { SemanticDataModule } from '../../semantic-data/semantic-data.module.js';
import { BUSINESS_DEFINITION_SNAPSHOT_PROVIDER } from './business-definition-snapshot.types.js';
import { PublishedBusinessDefinitionSnapshotProviderService } from './published-business-definition-snapshot-provider.service.js';

describe('Brain published definition provider registration', () => {
  it('uses only the published Business Definition projection provider at runtime', () => {
    const semanticProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SemanticDataModule) ?? [];
    const brainModuleSource = readFileSync('src/brain/brain.module.ts', 'utf8');

    expect(brainModuleSource).not.toContain('PublishedBusinessDefinitionSnapshotProviderService');
    expect(brainModuleSource).not.toContain('PrismaBrainDefinitionSnapshotProviderService');
    expect(brainModuleSource).toContain('SemanticDataModule');
    expect(semanticProviders).toContain(PublishedBusinessDefinitionSnapshotProviderService);
    expect(semanticProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: BUSINESS_DEFINITION_SNAPSHOT_PROVIDER,
          useExisting: PublishedBusinessDefinitionSnapshotProviderService,
        }),
      ]),
    );
  });
});
