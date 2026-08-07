import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import { createTestBusinessActionInformationArtifactProfile } from '../cognition/business-action-information-artifact.testing.js';
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
    expect(resultSets[0]?.items[0]?.contentFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('builds and revalidates an information artifact from the exact persisted result item', () => {
    const mappingOutputs = {
      productRanking: [{ productId: 82, productName: '玻尿酸保湿精华', suggestedQuantity: 12 }],
    };
    const [set] = service.buildResultSets({
      runId: 191,
      ...scope,
      capabilityKey: 'inventory_risk_ranking',
      capabilityVersion: 19,
      intent: intent('product'),
      adapterMetadata: { mappingOutputs },
    });
    const artifact = service.createInformationArtifact({
      refId: 'run:191:productRanking:1',
      resultSets: [set!],
      scope,
      profileFingerprint:
        createTestBusinessActionInformationArtifactProfile('action.create_purchase_order').fingerprint,
    });

    expect(artifact).toMatchObject({
      artifactKey: 'run:191:productRanking:1',
      sourceRunId: 191,
      sourceCapabilityKey: 'inventory_risk_ranking',
      sourceCapabilityVersion: 19,
      referencedEntityType: 'product',
      referencedEntityKey: '82',
    });
    expect(
      service.verifyInformationArtifact({
        artifact: artifact!,
        scope,
        output: { adapterMetadata: { mappingOutputs, resultSets: [set] } },
      }),
    ).toBe(true);
    expect(
      service.verifyInformationArtifact({
        artifact: artifact!,
        scope,
        output: {
          adapterMetadata: {
            mappingOutputs: {
              productRanking: [{ productId: 82, productName: '玻尿酸保湿精华', suggestedQuantity: 99 }],
            },
            resultSets: [set],
          },
        },
      }),
    ).toBe(false);
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

  it('does not mistake a time-period comparison for an empty result-set reference', () => {
    const [set] = service.buildResultSets({
      runId: 1921,
      ...scope,
      capabilityKey: 'order_revenue_analysis',
      capabilityVersion: 8,
      intent: intent('product'),
      adapterMetadata: { mappingOutputs: { resultRows: [] } },
    });

    expect(service.isFollowUpReferenceQuestion('跟双十一期间比呢', [set!])).toBe(false);
  });

  it('still recognizes a comparison that names an entity from the governed result set', () => {
    const [set] = service.buildResultSets({
      runId: 1922,
      ...scope,
      intent: intent('beautician'),
      adapterMetadata: {
        mappingOutputs: { staffRanking: [{ entityType: 'beautician', entityKey: '12', mention: '宋乔' }] },
      },
    });

    expect(service.isFollowUpReferenceQuestion('跟宋乔比呢', [set!])).toBe(true);
  });

  it.each(['哪些商品卖得最好', '哪个美容师退款率最高', '哪些产品库存风险最大', '员工里谁的业绩最多'])(
    'does not require a prior result set for an independent ranking question: %s',
    (question) => {
      expect(service.requiresPriorResultSelection(question)).toBe(false);
    },
  );

  it.each(['其中最高那个怎么处理', '上轮第二个客户怎么召回', '刚才这些商品里最急的是哪个'])(
    'still requires a prior result set for an explicit continuation: %s',
    (question) => {
      expect(service.requiresPriorResultSelection(question)).toBe(true);
    },
  );

  it('does not mistake an exact-time reservation question for a prior-result selection', () => {
    expect(service.requiresPriorResultSelection('下午3点那个预约是谁，有什么要注意的')).toBe(false);
    expect(service.requiresPriorResultSelection('15:30那场预约是谁')).toBe(false);
    expect(service.requiresPriorResultSelection('上轮那个预约有什么要注意的')).toBe(true);
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

  it('binds card follow-up wording to the previous customer result set', () => {
    const [set] = service.buildResultSets({
      runId: 198,
      ...scope,
      adapterMetadata: {
        mappingOutputs: {
          customerRows: [{ customerId: 101, customerName: '刘婉清' }],
        },
      },
    });

    expect(service.resolveReference({ question: '她的次卡还剩几次', resultSets: [set!], scope })).toMatchObject({ // ami-brain-unit-only
      kind: 'resolved',
      reference: { entityType: 'customer', entityKey: '101', mention: '刘婉清' },
    });
  });

  it('binds project and best-converting strategy follow-up wording to typed result sets', () => {
    const [projectSet] = service.buildResultSets({
      runId: 199,
      ...scope,
      adapterMetadata: {
        mappingOutputs: {
          projectRows: [{ projectId: 31, projectName: '亮肤淡斑管理' }],
        },
      },
    });
    const [strategySet] = service.buildResultSets({
      runId: 200,
      ...scope,
      adapterMetadata: {
        mappingOutputs: {
          strategyRows: [{ strategyId: 7, strategyName: '高价值客户召回' }],
        },
      },
    });

    expect(service.resolveReference({ question: '那个项目还有多少耗材', resultSets: [projectSet!], scope })).toMatchObject({ // ami-brain-unit-only
      kind: 'resolved',
      reference: { entityType: 'project', entityKey: '31' },
    });
    expect(service.resolveReference({ question: '转化最好那个策略再跑一次', resultSets: [strategySet!], scope })).toMatchObject({ // ami-brain-unit-only
      kind: 'resolved',
      reference: { entityType: 'marketing_strategy', entityKey: '7' },
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

  it('does not interpret a second purchase as selecting the second prior result', () => {
    const service = new BrainResultReferenceService();
    const question = '统计近期新客户完成第二次消费的人数'; // ami-brain-unit-only

    expect(service.isFollowUpReferenceQuestion(question)).toBe(false);
    expect(service.requiresPriorResultSelection(question)).toBe(false);
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
