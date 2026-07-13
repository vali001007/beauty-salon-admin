import { buildAgentV2KnowledgeGraph } from './knowledge-graph-builder.js';

describe('buildAgentV2KnowledgeGraph manual overrides', () => {
  it('merges manual synonyms and exclude edges into the generated graph', () => {
    const snapshot = buildAgentV2KnowledgeGraph({
      generatedAt: '2026-07-05 20:40:00 Asia/Shanghai',
      schema: [
        'model InventoryProduct {',
        '  id Int @id @default(autoincrement())',
        '  name String',
        '}',
      ].join('\n'),
      schemaPath: 'packages/server-v2/prisma/schema.prisma',
      businessObjectCatalogPath: 'packages/server-v2/src/agent/knowledge/business-object.catalog.ts',
      semanticLexiconPath: 'packages/server-v2/src/agent/knowledge/business-semantic-lexicon.ts',
      manifests: [],
      controllerEndpoints: [],
      frontendRoutes: [],
      semanticTerms: [],
      manualOverrides: [
        {
          id: 1,
          overrideType: 'synonym',
          relationType: 'SYNONYM_OF',
          targetNodeId: 'business-object:inventoryproduct',
          value: '库存耗材',
          reason: '门店常用叫法',
          confidence: 0.99,
        },
        {
          id: 2,
          overrideType: 'exclude',
          relationType: 'EXCLUDES',
          sourceNodeId: 'business-object:inventoryproduct',
          targetNodeId: 'business-object:project',
          label: '不是服务项目',
          confidence: 0.95,
        },
      ],
    });

    expect(snapshot.report.manualOverrides).toMatchObject({ total: 2, synonyms: 1, excludes: 1, adopted: 2, skipped: 0, conflicts: 0 });
    expect(snapshot.report.manualOverrides.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, status: 'adopted', nodeId: 'word:库存耗材' }),
      expect.objectContaining({ id: 2, status: 'adopted', edgeId: 'EXCLUDES:business-object:inventoryproduct->business-object:project:不是服务项目' }),
    ]));
    expect(snapshot.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'word:库存耗材',
        source: 'manual_override',
        properties: expect.objectContaining({ overrideId: 1 }),
      }),
    ]));
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'SYNONYM_OF',
        from: 'word:库存耗材',
        to: 'business-object:inventoryproduct',
        source: 'manual_override',
      }),
      expect.objectContaining({
        type: 'EXCLUDES',
        from: 'business-object:inventoryproduct',
        to: 'business-object:project',
        label: '不是服务项目',
        source: 'manual_override',
      }),
    ]));
    expect(snapshot.report.blockers).toEqual([]);
  });

  it('reports invalid manual overrides without polluting the generated graph', () => {
    const snapshot = buildAgentV2KnowledgeGraph({
      generatedAt: '2026-07-05 20:40:00 Asia/Shanghai',
      schema: [
        'model InventoryProduct {',
        '  id Int @id @default(autoincrement())',
        '  name String',
        '}',
      ].join('\n'),
      schemaPath: 'packages/server-v2/prisma/schema.prisma',
      businessObjectCatalogPath: 'packages/server-v2/src/agent/knowledge/business-object.catalog.ts',
      semanticLexiconPath: 'packages/server-v2/src/agent/knowledge/business-semantic-lexicon.ts',
      manifests: [],
      controllerEndpoints: [],
      frontendRoutes: [],
      semanticTerms: [],
      manualOverrides: [
        {
          id: 3,
          overrideType: 'synonym',
          relationType: 'SYNONYM_OF',
          targetNodeId: 'business-object:not-exists',
          value: '不存在节点',
          confidence: 0.98,
        },
        {
          id: 4,
          overrideType: 'exclude',
          relationType: 'EXCLUDES',
          sourceNodeId: 'business-object:inventoryproduct',
          confidence: 0.95,
        },
        {
          id: 5,
          overrideType: 'unknown',
          relationType: 'SYNONYM_OF',
          targetNodeId: 'business-object:inventoryproduct',
          value: '未知覆盖',
          confidence: 0.95,
        },
      ],
    });

    expect(snapshot.report.manualOverrides).toMatchObject({ total: 3, adopted: 0, skipped: 2, conflicts: 1 });
    expect(snapshot.report.manualOverrides.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 3, status: 'conflict', issue: 'targetNodeId not found: business-object:not-exists' }),
      expect.objectContaining({ id: 4, status: 'skipped', issue: 'exclude override requires sourceNodeId and targetNodeId' }),
      expect.objectContaining({ id: 5, status: 'skipped', issue: 'unknown override does not support SYNONYM_OF' }),
    ]));
    expect(snapshot.edges).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'word:不存在节点', to: 'business-object:not-exists' }),
    ]));
    expect(snapshot.report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'manual_override_conflict' }),
      expect.objectContaining({ code: 'manual_override_skipped' }),
    ]));
    expect(snapshot.report.blockers).toEqual([]);
  });
});
