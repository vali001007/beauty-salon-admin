import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BusinessDefinitionProjectionCompilerService,
  BUSINESS_DEFINITION_PROJECTION_TYPES,
  createBusinessDefinitionProjectionFingerprint,
} from './business-definition-projection-compiler.service.js';

describe('BusinessDefinitionProjectionCompilerService', () => {
  const compiler = new BusinessDefinitionProjectionCompilerService();
  const version = {
    id: 21,
    definitionId: 10,
    version: 3,
    schemaVersion: '1.0',
    payload: {
      name: '商品销量',
      aliases: ['商品销售量', '卖了多少件'],
      aggregation: 'sum',
      queryDefinitionKey: 'query.product_sales_quantity',
    },
    lifecycleStatus: 'published',
    fingerprint: 'definition-fingerprint-v3',
    sourceFingerprint: 'source-fingerprint-v3',
    validationStatus: 'passed',
    validationReport: { passed: true },
    canonicalQueryRef: 'semantic.product_sales_quantity',
    fixtureSetKey: 'product-sales-v3',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
    definition: {
      id: 10,
      definitionKey: 'metric.product_sales_quantity',
      kind: 'metric',
      domain: 'product',
      name: '商品销量',
      ownerType: 'system',
      ownerId: 'semantic-data',
    },
    evidence: [],
    projections: [],
  };

  it('compiles all governed read-only projection types with definition provenance', () => {
    const projections = compiler.compilePublishedVersion(version);

    expect(projections.map((item) => item.targetType)).toEqual(BUSINESS_DEFINITION_PROJECTION_TYPES);
    expect(projections).toHaveLength(5);
    for (const projection of projections) {
      expect(projection).toEqual(
        expect.objectContaining({
          definitionVersionId: 21,
          definitionKey: 'metric.product_sales_quantity',
          definitionVersion: 3,
          definitionFingerprint: 'definition-fingerprint-v3',
          sourceFingerprint: 'source-fingerprint-v3',
          projectionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          readOnly: true,
        }),
      );
      expect((projection.payload as any).definitionRef).toEqual({
        definitionKey: 'metric.product_sales_quantity',
        definitionVersion: 3,
        definitionFingerprint: 'definition-fingerprint-v3',
        sourceFingerprint: 'source-fingerprint-v3',
      });
      expect((projection.payload as any).projectionSchemaVersion).toBe('2.0');
      expect((projection.payload as any).data).toEqual(expect.any(Object));
      expect((projection.payload as any).definition).toBeUndefined();
    }
  });

  it('compiles target-specific V2 data instead of copying one definition five times', () => {
    const projections = compiler.compilePublishedVersion(version);
    const byType = Object.fromEntries(projections.map((projection) => [projection.targetType, projection.payload]));

    expect((byType.intent_semantic_index as any).data).toEqual(
      expect.objectContaining({
        definitionKind: 'metric',
        domain: 'product',
        name: '商品销量',
        aliases: ['商品销售量', '卖了多少件'],
        searchableTerms: ['商品销量', '商品销售量', '卖了多少件'],
      }),
    );
    expect((byType.intent_semantic_index as any).data.runtimeDefinition).toBeUndefined();

    expect((byType.capability_semantic_view as any).data).toEqual(
      expect.objectContaining({
        definitionKind: 'metric',
        domain: 'product',
        capabilityBindings: [],
      }),
    );
    expect((byType.capability_semantic_view as any).data.runtimeDefinition).toBeUndefined();

    expect((byType.metric_query_view as any).data).toEqual(
      expect.objectContaining({
        applicable: true,
        definitionKind: 'metric',
        canonicalQueryRef: 'semantic.product_sales_quantity',
        fixtureSetKey: 'product-sales-v3',
        runtimeDefinition: version.payload,
      }),
    );

    expect((byType.ui_definition_view as any).data).toEqual(
      expect.objectContaining({
        definitionKind: 'metric',
        domain: 'product',
        name: '商品销量',
        summary: expect.any(String),
      }),
    );
    expect((byType.ui_definition_view as any).data.runtimeDefinition).toBeUndefined();

    expect((byType.eval_case_projection as any).data).toEqual(
      expect.objectContaining({
        definitionKind: 'metric',
        cases: expect.arrayContaining([
          expect.objectContaining({ input: '商品销量', expectedDefinitionKey: 'metric.product_sales_quantity' }),
        ]),
      }),
    );
    expect(new Set(projections.map((projection) => JSON.stringify((projection.payload as any).data))).size).toBe(5);
  });

  it('keeps canonical capability declarations in the V2 capability view', () => {
    const capabilities = [
      {
        key: 'product_sales_ranking',
        name: '商品销售排行',
        description: '按已发布商品销量口径排序。',
        domains: ['sales'],
        intents: ['ranking'],
        riskLevel: 'low',
        requiredPermissions: ['core:order:products'],
        storeScope: 'required',
        examples: ['本月商品销售排行'],
        negativeExamples: ['员工表现排行'],
        synonyms: ['商品销量榜'],
        successSchema: { type: 'object' },
      },
    ];
    const projection = compiler
      .compilePublishedVersion({
        ...version,
        payload: {
          ...version.payload,
          capabilities,
          runtimeQuery: { capabilityKeys: ['product_sales_ranking'] },
        },
      })
      .find((item) => item.targetType === 'capability_semantic_view')!;

    expect((projection.payload as any).data.capabilities).toEqual(capabilities);
  });

  it('produces stable projection fingerprints independent of object key order', () => {
    const first = compiler.compilePublishedVersion(version);
    const second = compiler.compilePublishedVersion({
      ...version,
      payload: {
        queryDefinitionKey: 'query.product_sales_quantity',
        aggregation: 'sum',
        aliases: ['商品销售量', '卖了多少件'],
        name: '商品销量',
      },
      storeScope: { mode: 'current_store' },
    });

    expect(second.map((item) => item.projectionFingerprint)).toEqual(first.map((item) => item.projectionFingerprint));
  });

  it('deeply freezes projection payloads so downstream runtimes cannot redefine semantics', () => {
    const [projection] = compiler.compilePublishedVersion(version);

    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.payload)).toBe(true);
    expect(Object.isFrozen((projection.payload as any).data)).toBe(true);
    expect(() => ((projection.payload as any).data.name = '伪造口径')).toThrow();
  });

  it('refuses to compile a non-published version into a runtime snapshot', () => {
    expect(() => compiler.compilePublishedVersion({ ...version, lifecycleStatus: 'validated' })).toThrow(
      BadRequestException,
    );
  });

  it('allows a preview for a draft without marking it as a published runtime artifact', () => {
    const projections = compiler.previewVersion({ ...version, lifecycleStatus: 'draft' });

    expect(projections).toHaveLength(5);
    expect(projections.every((item) => item.readOnly)).toBe(true);
    expect(projections.every((item) => (item.payload as any).preview === true)).toBe(true);
  });

  it('matches the database canonical JSON sha256 fixed vector', () => {
    const fingerprint = createBusinessDefinitionProjectionFingerprint({
      targetType: 'metric_query_view',
      targetKey: 'metric.product_sales_quantity@3',
      definitionVersionId: 21,
      definitionRef: {
        definitionKey: 'metric.product_sales_quantity',
        definitionVersion: 3,
        definitionFingerprint: 'a'.repeat(64),
        sourceFingerprint: 'b'.repeat(64),
      },
      payload: { a: 1, nested: { x: 'y' } },
      readOnly: true,
    });

    expect(fingerprint).toBe('40463f5eb396409acd68dfffa61c6665e65d7bebafa2fa1a0e91245a96dfc463');
  });

  it('keeps SQL V2 projection generation and V1 backfill aligned with TypeScript projection types', () => {
    const v2Migration = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260713120000_ami_core_business_definition_projection_v2/migration.sql'),
      'utf8',
    );
    const backfillMigration = readFileSync(
      join(process.cwd(), 'prisma/migrations/20260713130000_ami_core_business_definition_projection_v2_backfill/migration.sql'),
      'utf8',
    );

    for (const targetType of BUSINESS_DEFINITION_PROJECTION_TYPES) {
      expect(v2Migration).toContain(`WHEN '${targetType}'`);
      expect(backfillMigration).toContain(`WHEN '${targetType}'`);
    }
    expect(v2Migration).toContain("'capabilities', CASE");
    expect(backfillMigration).toContain('UPDATE "business_definition_projection"');
    expect(backfillMigration).toContain("COALESCE(\"payload\"->>'projectionSchemaVersion', '') <> '2.0'");
    expect(backfillMigration).toContain('business definition projection V1 backfill is incomplete');
  });
});
