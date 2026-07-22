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

function intent(entityType: 'beautician' | 'product'): BrainSemanticIntent {
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
