import { publishedSnapshotFixture } from './brain-generated-capability.test-fixtures.js';
import { resolveCanonicalCapabilityProjection } from './brain-canonical-capability-projection.js';
import { BusinessDefinitionProjectionCompilerService } from '../../semantic-data/business-definition-projection-compiler.service.js';

describe('resolveCanonicalCapabilityProjection', () => {
  it('resolves canonical semantics and grounding from one published projection implementation', () => {
    const snapshot = publishedSnapshotFixture();

    expect(
      resolveCanonicalCapabilityProjection({
        capabilityKey: 'product_sales_ranking',
        definitions: snapshot.definitions,
      }),
    ).toEqual({
      semantics: expect.objectContaining({
        key: 'product_sales_ranking',
        name: '商品销售排行',
        requiredPermissions: ['core:metric:view'],
      }),
      grounding: 'semantic_query',
    });
  });

  it('resolves V2 capability semantics and semantic-query grounding without falling back to domain service', () => {
    const payload = publishedSnapshotFixture().definitions[0]!.payload as Record<string, unknown>;
    const version = {
      id: 31,
      definitionId: 11,
      version: 4,
      schemaVersion: '1.0',
      payload,
      lifecycleStatus: 'published',
      fingerprint: 'd'.repeat(64),
      sourceFingerprint: 'e'.repeat(64),
      validationStatus: 'passed',
      validationReport: null,
      canonicalQueryRef: 'semantic_query.product_sales_quantity',
      fixtureSetKey: 'fixture.product_sales',
      timezone: 'Asia/Shanghai',
      storeScope: { mode: 'current_store' },
      definition: {
        id: 11,
        definitionKey: 'metric.product_sales_quantity',
        kind: 'metric',
        domain: 'sales',
        name: '商品销售数量',
        ownerType: 'system',
        ownerId: null,
      },
      evidence: [],
      projections: [],
    };
    const projections = [...new BusinessDefinitionProjectionCompilerService().compilePublishedVersion(version)];
    const definitions = [
      {
        definitionId: 11,
        versionId: 31,
        definitionKey: version.definition.definitionKey,
        kind: version.definition.kind,
        domain: version.definition.domain,
        name: version.definition.name,
        ownerType: version.definition.ownerType,
        ownerId: null,
        version: version.version,
        schemaVersion: version.schemaVersion,
        fingerprint: version.fingerprint,
        sourceFingerprint: version.sourceFingerprint,
        validationStatus: version.validationStatus,
        validationReport: version.validationReport,
        payload,
        canonicalQueryRef: version.canonicalQueryRef,
        fixtureSetKey: version.fixtureSetKey,
        timezone: version.timezone,
        storeScope: version.storeScope,
        evidence: [],
        projections,
      },
    ];

    expect(resolveCanonicalCapabilityProjection({ capabilityKey: 'product_sales_ranking', definitions })).toEqual({
      semantics: expect.objectContaining({ key: 'product_sales_ranking', name: '商品销售排行' }),
      grounding: 'semantic_query',
    });
  });
});
