import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import { BrainResultReferenceService, isBrainModelResultSet } from './brain-result-reference.service.js';

describe('BrainResultReferenceService', () => {
  const service = new BrainResultReferenceService();
  const scope = { conversationId: 12, userId: 9, storeId: 2 };

  it('builds auditable ranked staff references from governed mapping outputs', () => {
    const resultSets = service.buildResultSets({
      runId: 91,
      ...scope,
      capabilityKey: 'manager_staff_overview',
      capabilityVersion: 7,
      intent: intent('beautician'),
      adapterMetadata: {
        mappingOutputs: {
          staffRanking: [
            { entityType: 'beautician', entityKey: '12', mention: '宋乔' },
            { entityType: 'beautician', entityKey: '19', mention: '顾然' },
          ],
        },
      },
    });

    expect(resultSets).toHaveLength(1);
    expect(resultSets[0]).toMatchObject({
      setId: 'run:91:staffRanking',
      sourceRunId: 91,
      sourceCapabilityKey: 'manager_staff_overview',
      sourceCapabilityVersion: 7,
      entityType: 'beautician',
      status: 'data',
      count: 2,
      items: [
        expect.objectContaining({ refId: 'run:91:staffRanking:1', entityKey: '12', mention: '宋乔', rank: 1 }),
        expect.objectContaining({ refId: 'run:91:staffRanking:2', entityKey: '19', mention: '顾然', rank: 2 }),
      ],
    });
    expect(isBrainModelResultSet(resultSets[0])).toBe(true);
  });

  it('preserves an empty expiring product result set for deterministic follow-up decisions', () => {
    const [set] = service.buildResultSets({
      runId: 92,
      ...scope,
      capabilityKey: 'inventory_operations_overview',
      capabilityVersion: 3,
      intent: intent('product'),
      adapterMetadata: { mappingOutputs: { expiringBatches: [] } },
    });

    expect(set).toMatchObject({ entityType: 'product', status: 'empty', count: 0, items: [] });
    const resolved = service.resolveReference({
      question: '适合搭配什么活动消化掉？',
      resultSets: [set!],
      scope,
    });
    expect(resolved).toMatchObject({ set: { status: 'empty', entityType: 'product' } });
    expect(resolved?.reference).toBeUndefined();
  });

  it('binds the requested rank instead of trusting a user-supplied entity id', () => {
    const [set] = service.buildResultSets({
      runId: 93,
      ...scope,
      intent: intent('beautician'),
      adapterMetadata: {
        mappingOutputs: {
          staffRanking: [
            { entityType: 'beautician', entityKey: '12', mention: '宋乔' },
            { entityType: 'beautician', entityKey: '19', mention: '顾然' },
          ],
        },
      },
    });

    const resolved = service.resolveReference({ question: '给第二名发个鼓励通知', resultSets: [set!], scope });
    expect(resolved?.reference).toMatchObject({ entityKey: '19', mention: '顾然', rank: 2 });
    expect(service.toConversationEntity(resolved!.reference!)).toMatchObject({
      entityType: 'beautician',
      entityKey: '19',
      mention: '顾然',
      source: 'conversation',
      confidence: 1,
    });
  });

  it.each(['第一个怎么召回', '第二个客户有什么注意事项', '第 2 个怎么处理'])(
    'resolves ordinal object wording: %s',
    (question) => {
      const [set] = service.buildResultSets({
        runId: 96,
        ...scope,
        intent: intent('customer'),
        adapterMetadata: {
          mappingOutputs: {
            customerRanking: [
              { entityType: 'customer', entityKey: '1', mention: '刘婉清' },
              { entityType: 'customer', entityKey: '2', mention: '高美琳' },
            ],
          },
        },
      });

      const expectedRank = question.includes('二') || question.includes('2') ? 2 : 1;
      expect(service.resolveReference({ question, resultSets: [set!], scope })).toMatchObject({
        kind: 'resolved',
        reference: { rank: expectedRank },
      });
    },
  );

  it.each(['第一个怎么召回', '把第一位客户召回来', '给排名第一的写召回话术'])(
    'BQ1924 resolves the first governed customer reference: %s',
    (question) => {
      const [set] = service.buildResultSets({
        runId: 196,
        ...scope,
        adapterMetadata: {
          mappingOutputs: {
            resultRows: [
              { customerId: 101, customerName: '刘婉清' },
              { customerId: 102, customerName: '高美琳' },
            ],
          },
        },
      });

      expect(service.resolveReference({ question, resultSets: [set!], scope })).toMatchObject({
        kind: 'resolved',
        reference: { entityType: 'customer', entityKey: '101', rank: 1 },
      });
    },
  );

  it('BQ1924 accepts a fully named customer instead of forcing an ordinal clarification', () => {
    const [set] = service.buildResultSets({
      runId: 197,
      ...scope,
      adapterMetadata: {
        mappingOutputs: {
          resultRows: [
            { customerId: 101, customerName: '刘婉清' },
            { customerId: 102, customerName: '高美琳' },
          ],
        },
      },
    });

    expect(service.resolveReference({ question: '给高美琳写召回话术', resultSets: [set!], scope })).toMatchObject({
      kind: 'resolved',
      reference: { entityKey: '102', mention: '高美琳' },
    });
  });

  it('infers product references from generic semantic result rows', () => {
    const [set] = service.buildResultSets({
      runId: 97,
      ...scope,
      intent: intent('product'),
      adapterMetadata: {
        observations: [
          {
            capabilityKey: 'inventory_risk_ranking',
            capabilityVersion: 19,
            data: {
              metadata: {
                mappingOutputs: {
                  resultRows: [{ productId: 82, productName: '玻尿酸保湿精华', stock_risk_score: 13 }],
                },
              },
            },
          },
        ],
      },
    });

    expect(set).toMatchObject({
      outputKey: 'resultRows',
      entityType: 'product',
      items: [expect.objectContaining({ entityKey: '82', mention: '玻尿酸保湿精华' })],
    });
    expect(service.resolveReference({ question: '其中最急的先补多少', resultSets: [set!], scope })).toMatchObject({
      kind: 'resolved',
      reference: { entityKey: '82' },
    });
    const resolved = service.resolveReference({ question: '其中最急的先补多少', resultSets: [set!], scope });
    expect(service.toConversationEntity(resolved!.reference!)).toMatchObject({
      entityType: 'product',
      entityKey: '82',
      mention: '玻尿酸保湿精华',
      source: 'conversation',
    });
  });

  it.each(['其中最急的先补多少', '缺口最大的产品补多少', '优先级最高那个先采购多少'])(
    'BQ1927 resolves the highest-priority governed product reference: %s',
    (question) => {
      const [set] = service.buildResultSets({
        runId: 198,
        ...scope,
        adapterMetadata: {
          mappingOutputs: {
            resultRows: [
              { productId: 82, productName: '玻尿酸保湿精华' },
              { productId: 83, productName: '氨基酸洁面乳' },
            ],
          },
        },
      });

      expect(service.resolveReference({ question, resultSets: [set!], scope })).toMatchObject({
        kind: 'resolved',
        reference: { entityKey: '82', rank: 1 },
      });
    },
  );

  it.each(['金额最高那个补多少合适', '临期金额最大的要补多少', '其中价值最高的产品补多少'])(
    'BQ1930 keeps an empty governed product set terminal: %s',
    (question) => {
      const [set] = service.buildResultSets({
        runId: 199,
        ...scope,
        intent: intent('product'),
        adapterMetadata: { mappingOutputs: { expiringBatches: [] } },
      });

      expect(service.resolveReference({ question, resultSets: [set!], scope })).toMatchObject({
        kind: 'empty',
        set: { entityType: 'product', status: 'empty' },
      });
    },
  );

  it('BQ1930 resolves normally when the previous expiring set is not empty', () => {
    const [set] = service.buildResultSets({
      runId: 200,
      ...scope,
      adapterMetadata: {
        mappingOutputs: { expiringBatches: [{ productId: 90, productName: '修护面膜' }] },
      },
    });

    expect(service.resolveReference({ question: '金额最高那个补多少合适', resultSets: [set!], scope })).toMatchObject({
      kind: 'resolved',
      reference: { entityKey: '90' },
    });
  });

  it('returns a type mismatch instead of binding a customer request to a staff result', () => {
    const [set] = service.buildResultSets({
      runId: 98,
      ...scope,
      intent: intent('beautician'),
      adapterMetadata: {
        mappingOutputs: { staffRanking: [{ entityType: 'beautician', entityKey: '41', mention: '唐伊' }] },
      },
    });

    expect(service.resolveReference({ question: '第二个客户有什么注意事项', resultSets: [set!], scope })).toMatchObject(
      {
        kind: 'type_mismatch',
        requestedEntityType: 'customer',
        set: { entityType: 'beautician' },
      },
    );
  });

  it.each(['第二个客户有什么注意事项', '第 2 位客人有啥禁忌', '其中第二名客户要注意什么'])(
    'BQ1948 never retypes a staff result set as customers: %s',
    (question) => {
      const [set] = service.buildResultSets({
        runId: 201,
        ...scope,
        intent: intent('beautician'),
        adapterMetadata: {
          mappingOutputs: {
            staffRanking: [
              { entityType: 'beautician', entityKey: '41', mention: '唐伊' },
              { entityType: 'beautician', entityKey: '42', mention: '沈晴' },
            ],
          },
        },
      });

      expect(service.resolveReference({ question, resultSets: [set!], scope })).toMatchObject({
        kind: 'type_mismatch',
        requestedEntityType: 'customer',
        set: { entityType: 'beautician' },
      });
    },
  );

  it('projects only bounded result references into the model compiler context', () => {
    const [set] = service.buildResultSets({
      runId: 99,
      ...scope,
      intent: intent('customer'),
      adapterMetadata: {
        mappingOutputs: {
          customerRanking: Array.from({ length: 20 }, (_, index) => ({
            entityType: 'customer',
            entityKey: String(index + 1),
            mention: `客户${index + 1}`,
          })),
        },
      },
    });
    const projected = service.projectConversationSlotsForCompiler('第二个怎么召回', {
      modelContext: { objective: '召回客户', resultSets: [set] },
    });
    const modelContext = projected.modelContext as { resultSets: Array<{ items: unknown[]; scope?: unknown }> };

    expect(modelContext.resultSets[0]?.items).toHaveLength(8);
    expect(modelContext.resultSets[0]).not.toHaveProperty('scope');
  });

  it('does not silently bind a singular pronoun to the first item in a multi-result set', () => {
    const [set] = service.buildResultSets({
      runId: 94,
      ...scope,
      intent: intent('beautician'),
      adapterMetadata: {
        mappingOutputs: {
          staffRanking: [
            { entityType: 'beautician', entityKey: '12', mention: '宋乔' },
            { entityType: 'beautician', entityKey: '19', mention: '顾然' },
          ],
        },
      },
    });

    expect(service.resolveReference({ question: '给她发个鼓励通知', resultSets: [set!], scope })).toMatchObject({
      kind: 'ambiguous',
      set: { setId: 'run:94:staffRanking' },
    });
    expect(service.resolveReference({ question: '给宋乔发个鼓励通知', resultSets: [set!], scope })).toMatchObject({
      kind: 'resolved',
      reference: { entityKey: '12', mention: '宋乔' },
    });
  });

  it('rejects a structurally valid reference set from another store or a different persisted run output', () => {
    const [set] = service.buildResultSets({
      runId: 95,
      ...scope,
      intent: intent('product'),
      adapterMetadata: {
        mappingOutputs: {
          productRanking: [{ entityType: 'product', entityKey: '3', mention: '补水面膜' }],
        },
      },
    });

    expect(service.isScopedTo(set!, { ...scope, storeId: 6 })).toBe(false);
    expect(
      service.isPersistedInRunOutput(set!, {
        adapterMetadata: { resultSets: [set] },
      }),
    ).toBe(true);
    expect(
      service.isPersistedInRunOutput(set!, {
        adapterMetadata: {
          resultSets: [{ ...set, count: 2 }],
        },
      }),
    ).toBe(false);
  });

  it('rejects malformed persisted result references', () => {
    expect(
      isBrainModelResultSet({
        setId: 'forged',
        sourceRunId: 1,
        outputKey: 'staffRanking',
        entityType: 'beautician',
        status: 'data',
        count: 1,
        items: [{ refId: 'x', entityType: 'beautician', entityKey: '', mention: '宋乔', rank: 1 }],
        createdAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });
});

function intent(entityType: 'beautician' | 'product' | 'customer'): BrainSemanticIntent {
  return {
    schemaVersion: '1.0',
    objective: '测试结果引用',
    domains: [entityType],
    intent: 'ranking',
    entities: [
      {
        entityType,
        mention: entityType,
        source: 'system',
        confidence: 1,
        definitionRef: {
          definitionType: 'entity',
          definitionKey: `entity.${entityType}`,
          definitionVersion: 1,
          definitionFingerprint: 'a'.repeat(64),
          sourceFingerprint: 'b'.repeat(64),
        },
      },
    ],
    metrics: [],
    dimensions: [],
    filters: [],
    orderBy: [],
    answerShape: 'ranking',
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.95,
    decisionSummary: '测试',
    successCriteria: ['返回结果'],
  };
}
