import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  BUSINESS_METRIC_CATALOG,
  type BusinessMetricCatalogReader,
} from '../semantic-data/business-metric-catalog.types.js';
import {
  QUERY_PLANNER_DEFAULT_METRIC_KEYS,
} from './query-planner.service.js';
import { QueryTemplateRegistryService } from './query-template-registry.service.js';

@Injectable()
export class BusinessMetricCatalogCoverageService implements OnApplicationBootstrap {
  private issue?: string;
  constructor(
    @Inject(BUSINESS_METRIC_CATALOG)
    private readonly catalog: BusinessMetricCatalogReader,
    private readonly templates: QueryTemplateRegistryService,
  ) {}

  onApplicationBootstrap() {
    try {
      const templateKeys = this.templates.list().flatMap((template) => template.metricKeys);
      this.catalog.assertContains(templateKeys, 'query_templates');
      this.catalog.assertContains(QUERY_PLANNER_DEFAULT_METRIC_KEYS, 'query_planner_defaults');
      this.issue = undefined;
    } catch (error) {
      this.issue = error instanceof Error ? error.message : 'business_metric_catalog_coverage_unknown';
    }
  }

  getStatus() {
    return Object.freeze({ ready: !this.issue, issue: this.issue });
  }
}
