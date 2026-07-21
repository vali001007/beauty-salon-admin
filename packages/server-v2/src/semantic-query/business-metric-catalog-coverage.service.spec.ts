import { createInMemoryBusinessMetricCatalog } from '../semantic-data/business-metric-catalog.testing.js';
import { LEGACY_SEMANTIC_METRICS } from '../semantic-data/legacy-semantic-metric.fixture.js';
import { BusinessMetricCatalogCoverageService } from './business-metric-catalog-coverage.service.js';
import { QueryTemplateRegistryService } from './query-template-registry.service.js';

describe('BusinessMetricCatalogCoverageService', () => {
  it('accepts a catalog covering every template and planner default', () => {
    const service = new BusinessMetricCatalogCoverageService(
      createInMemoryBusinessMetricCatalog(LEGACY_SEMANTIC_METRICS),
      new QueryTemplateRegistryService(),
    );

    expect(() => service.onApplicationBootstrap()).not.toThrow();
  });

  it('records a coverage issue without blocking unrelated server modules', () => {
    const paidAmount = LEGACY_SEMANTIC_METRICS.filter((metric) => metric.key === 'paid_amount');
    const service = new BusinessMetricCatalogCoverageService(
      createInMemoryBusinessMetricCatalog(paidAmount),
      new QueryTemplateRegistryService(),
    );

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    expect(service.getStatus()).toMatchObject({
      ready: false,
      issue: expect.stringContaining('business_metric_catalog_coverage_missing:query_templates'),
    });
  });
});
