import { MODULE_METADATA } from '@nestjs/common/constants';
import { BrainMetricCandidateGeneratorService } from './brain-metric-candidate-generator.service.js';
import { BrainMetricSourceAdapters } from './brain-metric-source-adapters.js';
import { BusinessMetricCatalogService } from './business-metric-catalog.service.js';
import { BUSINESS_METRIC_CATALOG } from './business-metric-catalog.types.js';
import { SemanticDataModule } from './semantic-data.module.js';

describe('SemanticDataModule metric candidate providers', () => {
  it('registers the read-only metric source adapter and candidate generator', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SemanticDataModule) ?? [];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SemanticDataModule) ?? [];

    expect(providers).toEqual(
      expect.arrayContaining([
        BrainMetricSourceAdapters,
        BrainMetricCandidateGeneratorService,
        BusinessMetricCatalogService,
        expect.objectContaining({ provide: BUSINESS_METRIC_CATALOG, useExisting: BusinessMetricCatalogService }),
      ]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([
        BrainMetricSourceAdapters,
        BrainMetricCandidateGeneratorService,
        BusinessMetricCatalogService,
        BUSINESS_METRIC_CATALOG,
      ]),
    );
  });
});
