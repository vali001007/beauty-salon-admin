import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  BusinessMetricCurrentLineage,
  BusinessMetricCurrentLineageSource,
} from './business-metric-catalog.types.js';

@Injectable()
export class BusinessMetricCurrentLineageSourceService implements BusinessMetricCurrentLineageSource {
  constructor(private readonly prisma: PrismaService) {}

  async loadCurrent(keys: readonly string[]): Promise<ReadonlyMap<string, BusinessMetricCurrentLineage>> {
    const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))].sort();
    if (!uniqueKeys.length) return new Map();
    const definitionKeys = uniqueKeys.map((key) => `metric.${key}`);
    const rows = await this.prisma.businessDefinition.findMany({
      where: {
        kind: 'metric',
        status: 'active',
        definitionKey: { in: definitionKeys },
        currentPublishedVersionId: { not: null },
      },
      select: {
        definitionKey: true,
        kind: true,
        status: true,
        currentPublishedVersion: {
          select: {
            version: true,
            lifecycleStatus: true,
            fingerprint: true,
            sourceFingerprint: true,
          },
        },
      },
    });
    const result = new Map<string, BusinessMetricCurrentLineage>();
    for (const row of rows) {
      const key = row.definitionKey.startsWith('metric.') ? row.definitionKey.slice('metric.'.length) : '';
      const version = row.currentPublishedVersion;
      if (!key || row.kind !== 'metric' || row.status !== 'active' || version?.lifecycleStatus !== 'published') {
        throw new Error(`business_metric_current_lineage_invalid:${row.definitionKey}`);
      }
      if (result.has(key)) throw new Error(`business_metric_current_lineage_duplicate:${key}`);
      result.set(
        key,
        Object.freeze({
          definitionKey: row.definitionKey,
          version: version.version,
          definitionFingerprint: requiredString(version.fingerprint, `business_metric_current_fingerprint_missing:${key}`),
          sourceFingerprint: requiredString(version.sourceFingerprint, `business_metric_current_source_fingerprint_missing:${key}`),
        }),
      );
    }
    const missing = uniqueKeys.filter((key) => !result.has(key));
    if (missing.length) throw new Error(`business_metric_current_lineage_missing:${missing.join(',')}`);
    return result;
  }
}

function requiredString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}
