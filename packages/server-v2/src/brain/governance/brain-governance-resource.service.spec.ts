import { BrainGovernanceResourceService } from './brain-governance-resource.service.js';

describe('BrainGovernanceResourceService', () => {
  it('builds a semantic graph from published definitions and clearly labelled local action candidates', async () => {
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            definitionKey: 'entity.customer',
            kind: 'entity',
            name: 'Customer',
            status: 'active',
            currentPublishedVersion: { version: 1, payload: { model: 'Customer', aliases: ['客户'] } },
          },
          {
            definitionKey: 'entity.product_order',
            kind: 'entity',
            name: 'ProductOrder',
            status: 'active',
            currentPublishedVersion: { version: 1, payload: { model: 'ProductOrder', aliases: ['订单'] } },
          },
          {
            definitionKey: 'relation.product_order.customer',
            kind: 'relation',
            name: '订单客户',
            status: 'active',
            currentPublishedVersion: { version: 1, payload: { fromModel: 'ProductOrder', toModel: 'Customer' } },
          },
          {
            definitionKey: 'metric.paid_amount',
            kind: 'metric',
            name: '实收金额',
            status: 'active',
            currentPublishedVersion: { version: 2, payload: { sourceTables: ['ProductOrder'], aliases: ['实收'] } },
          },
        ]),
      },
    } as never);

    const graph = await service.getSemanticGraph();

    expect(graph.summary).toMatchObject({ entities: 2, relations: 1, metrics: 1, tables: 2 });
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'entity.customer', label: '客户', kind: 'entity' }),
        expect.objectContaining({ id: 'metric.paid_amount', kind: 'metric', version: 2 }),
        expect.objectContaining({ id: 'table:ProductOrder', kind: 'table' }),
        expect.objectContaining({ id: 'action.create_customer', kind: 'action', status: 'local_candidate' }),
        expect.objectContaining({ id: 'predicate:customer_name_present', kind: 'predicate' }),
        expect.objectContaining({ id: 'effect:customer_created_in_context_store', kind: 'effect' }),
        expect.objectContaining({ id: 'role:object', kind: 'role' }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'entity.product_order',
          target: 'relation.product_order.customer',
          kind: 'relation_from',
        }),
        expect.objectContaining({
          source: 'relation.product_order.customer',
          target: 'entity.customer',
          kind: 'relation_to',
        }),
        expect.objectContaining({
          source: 'metric.paid_amount',
          target: 'entity.product_order',
          kind: 'metric_entity',
        }),
        expect.objectContaining({ source: 'action.create_customer', target: 'entity.customer', kind: 'acts_on' }),
        expect.objectContaining({
          source: 'action.create_customer',
          target: 'predicate:customer_name_present',
          kind: 'requires_predicate',
        }),
        expect.objectContaining({
          source: 'action.create_customer',
          target: 'effect:customer_created_in_context_store',
          kind: 'asserts_effect',
        }),
      ]),
    );
  });

  it('keeps canonical event definition keys when actions reference events', async () => {
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            definitionKey: 'action.test_event_link',
            kind: 'action',
            domain: 'test',
            name: '测试事件动作',
            status: 'active',
            currentPublishedVersionId: 501,
            currentPublishedVersion: null,
            versions: [
              {
                id: 501,
                version: 1,
                lifecycleStatus: 'published',
                payload: {
                  actionKey: 'action.test_event_link',
                  triggeredByEventRefs: ['event.purchase_order_submitted'],
                  emitsEventRefs: ['event:purchase_order_created'],
                },
              },
            ],
          },
        ]),
      },
    } as never);

    const graph = await service.getSemanticGraph();

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'event.purchase_order_submitted', kind: 'event' }),
        expect.objectContaining({ id: 'event.purchase_order_created', kind: 'event' }),
      ]),
    );
    expect(graph.nodes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'event:event.purchase_order_submitted' })]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'event.purchase_order_submitted',
          target: 'action.test_event_link',
          kind: 'triggered_by',
        }),
        expect.objectContaining({
          source: 'action.test_event_link',
          target: 'event.purchase_order_created',
          kind: 'emits',
        }),
      ]),
    );
  });

  it('lists six curated local actions without pretending they are registered or released', async () => {
    const service = new BrainGovernanceResourceService({
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      brainRun: { count: jest.fn().mockResolvedValue(12) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as never);

    const result = await service.listSemanticGovernanceSummaries({
      resourceType: 'action',
      storeId: 6,
      take: 20,
    });

    expect(result).toHaveLength(6);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceKey: 'action.create_purchase_order',
          resourceType: 'action',
          status: 'local_candidate',
          managed: false,
          enabled: false,
          definitionVersionId: null,
          fingerprint: null,
          hitRate: null,
          actionDetails: expect.objectContaining({
            origin: 'local_candidate',
            actionClass: 'create',
            targetEntityRefs: ['entity.product', 'entity.purchase_order'],
            profileGaps: [],
            capabilityBindings: [expect.objectContaining({ capabilityKey: 'purchase_order_draft' })],
            contrasts: expect.arrayContaining([
              expect.objectContaining({ conceptKey: 'action.receive_purchase_order' }),
            ]),
          }),
        }),
      ]),
    );
    expect(result.find((item) => item.resourceKey === 'action.cancel_reservation')?.actionDetails?.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'institutional_effect', label: '制度性效力', status: 'available' }),
      ]),
    );
    expect(
      result.find((item) => item.resourceKey === 'action.create_purchase_order')?.actionDetails?.profiles,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: 'institutional_effect' })]));
  });

  it('shows a missing institutional-effect Profile only for actions where it is required', async () => {
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 93,
            definitionKey: 'action.cancel_reservation',
            domain: 'reservation',
            name: '取消预约',
            status: 'active',
            currentPublishedVersionId: null,
            updatedAt: new Date('2026-07-30T00:00:00.000Z'),
            versions: [
              {
                id: 103,
                version: 1,
                payload: {
                  actionKey: 'action.cancel_reservation',
                  actionClass: 'transition',
                  targetEntityRefs: ['entity.reservation'],
                  inputSlots: [],
                  preconditions: [],
                  effects: [],
                  capabilityBindings: [],
                },
                lifecycleStatus: 'draft',
                fingerprint: 'a'.repeat(64),
                sourceFingerprint: 'b'.repeat(64),
                publishedAt: null,
                createdAt: new Date('2026-07-30T00:00:00.000Z'),
              },
            ],
            _count: { versions: 1 },
          },
        ]),
      },
      brainRun: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as never);

    const result = await service.listSemanticGovernanceSummaries({ resourceType: 'action', storeId: 6, take: 20 });
    const cancelled = result.find((item) => item.resourceKey === 'action.cancel_reservation');

    expect(cancelled?.actionDetails?.profiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'institutional_effect', status: 'missing' })]),
    );
    expect(cancelled?.actionDetails?.profileGaps).toContain('institutional_effect');
  });

  it('shows the latest Registry action version and structural Profile gaps without borrowing the local candidate', async () => {
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 91,
            definitionKey: 'action.create_customer',
            domain: 'customer',
            name: '创建客户档案',
            status: 'active',
            currentPublishedVersionId: null,
            updatedAt: new Date('2026-07-30T00:00:00.000Z'),
            versions: [
              {
                id: 101,
                version: 2,
                payload: {
                  description: 'Registry 中的未完整动作版本',
                  actionClass: 'create',
                  targetEntityRefs: ['entity.customer'],
                  inputSlots: [{ slotKey: 'name', label: '客户姓名', semanticRole: 'object', requiredAt: ['preview'] }],
                  preconditions: ['customer_name_present'],
                  preconditionPredicateRefs: [],
                  effects: ['customer_created_in_context_store'],
                  effectAssertionRefs: [],
                  capabilityBindings: [],
                },
                lifecycleStatus: 'draft',
                fingerprint: 'a'.repeat(64),
                sourceFingerprint: 'b'.repeat(64),
                publishedAt: null,
                createdAt: new Date('2026-07-30T00:00:00.000Z'),
              },
            ],
            _count: { versions: 2 },
          },
        ]),
      },
      brainRun: { count: jest.fn().mockResolvedValue(4) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as never);

    const result = await service.listSemanticGovernanceSummaries({
      resourceType: 'action',
      storeId: 6,
      take: 20,
    });
    const customer = result.find((item) => item.resourceKey === 'action.create_customer');

    expect(result).toHaveLength(6);
    expect(customer).toMatchObject({
      id: 101,
      version: 2,
      status: 'draft',
      managed: true,
      fingerprint: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
      historyCount: 2,
      actionDetails: {
        origin: 'registry',
        profileGaps: expect.arrayContaining([
          'lexical_frame',
          'situation_context',
          'predicate_contracts',
          'effect_contracts',
          'capability_binding',
        ]),
      },
    });
  });

  it('marks malformed action Profiles and mismatched semantic contract refs as invalid instead of available', async () => {
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 92,
            definitionKey: 'action.invalid_contract',
            domain: 'test',
            name: '错误动作合同',
            status: 'active',
            currentPublishedVersionId: null,
            updatedAt: new Date('2026-07-30T00:00:00.000Z'),
            versions: [
              {
                id: 102,
                version: 1,
                payload: {
                  actionKey: 'action.invalid_contract',
                  actionClass: 'create',
                  targetEntityRefs: ['entity.customer'],
                  inputSlots: [],
                  preconditions: ['context_store_resolved'],
                  preconditionPredicateRefs: [{ key: 'different_predicate', version: 1, fingerprint: 'a'.repeat(64) }],
                  effects: ['customer_created_in_context_store'],
                  effectAssertionRefs: [
                    { key: 'customer_created_in_context_store', version: 0, fingerprint: 'not-a-fingerprint' },
                  ],
                  lexicalFrame: {
                    schemaVersion: '1.0',
                    frameKey: 'action.other.lexical_frame',
                    fingerprint: 'b'.repeat(64),
                  },
                  situationContext: {
                    schemaVersion: '1.0',
                    profileKey: 'action.invalid_contract.situation_context',
                    fingerprint: 'short',
                  },
                  modalityPolicy: {
                    schemaVersion: '0.9',
                    policyKey: 'action.invalid_contract.speech_act_modality',
                    fingerprint: 'c'.repeat(64),
                  },
                  informationArtifact: {
                    schemaVersion: '1.0',
                    profileKey: 'action.invalid_contract.information_artifact',
                    fingerprint: 'd'.repeat(64),
                  },
                  sideEffectInvariant: {
                    schemaVersion: '1.2',
                    profileKey: 'action.invalid_contract.side_effect_invariant',
                    fingerprint: 'e'.repeat(64),
                  },
                  capabilityBindings: [
                    { capabilityKey: 'customer_create_preview', gatewayActionKey: 'create_customer', enabled: true },
                  ],
                },
                lifecycleStatus: 'draft',
                fingerprint: 'f'.repeat(64),
                sourceFingerprint: '0'.repeat(64),
                publishedAt: null,
                createdAt: new Date('2026-07-30T00:00:00.000Z'),
              },
            ],
            _count: { versions: 1 },
          },
        ]),
      },
      brainRun: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as never);

    const result = await service.listSemanticGovernanceSummaries({ resourceType: 'action', storeId: 6, take: 20 });
    const invalidAction = result.find((item) => item.resourceKey === 'action.invalid_contract');

    expect(invalidAction?.actionDetails?.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'lexical_frame', status: 'invalid' }),
        expect.objectContaining({ key: 'situation_context', status: 'invalid' }),
        expect.objectContaining({ key: 'modality_policy', status: 'invalid' }),
        expect.objectContaining({ key: 'information_artifact', status: 'available' }),
        expect.objectContaining({ key: 'side_effect_invariant', status: 'available' }),
        expect.objectContaining({ key: 'predicate_contracts', status: 'invalid' }),
        expect.objectContaining({ key: 'effect_contracts', status: 'invalid' }),
      ]),
    );
    expect(invalidAction?.actionDetails?.profileGaps).toEqual(
      expect.arrayContaining([
        'lexical_frame',
        'situation_context',
        'modality_policy',
        'predicate_contracts',
        'effect_contracts',
      ]),
    );
  });

  it('builds a lightweight semantic summary with governed metadata and real 30-day hit rate', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 14,
          resourceKey: 'card',
          name: '会员卡',
          version: 2,
          sourceStatus: 'active',
          sourceDescription: null,
          sourceMetadata: { table: 'MemberCard' },
          sourceFuzzyTerms: ['卡项', '储值卡'],
          sourceDomain: 'customer',
          definitionId: 81,
          definitionKey: 'card',
          definitionDomain: 'customer',
          definitionStatus: 'active',
          currentPublishedVersionId: 91,
          definitionVersionId: 91,
          definitionLifecycleStatus: 'published',
          definitionPayload: { description: '会员持有的储值与次卡账户', aliases: ['会员卡', '卡账户'] },
          updatedAt: new Date('2026-07-21T10:00:00.000Z'),
          historyCount: 2,
        },
      ])
      .mockResolvedValueOnce([{ definitionKey: 'card', hitCount: 3 }]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      brainRun: { count: jest.fn().mockResolvedValue(12) },
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    await expect(
      service.listSemanticGovernanceSummaries({ resourceType: 'ontology_entity', storeId: 2 }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 14,
        resourceKey: 'card',
        domain: 'customer',
        semanticDescription: '会员持有的储值与次卡账户',
        dataTables: ['MemberCard'],
        fuzzyTerms: ['卡项', '储值卡', '会员卡', '卡账户'],
        hitCount: 3,
        sampleCount: 12,
        hitRate: 0.25,
        enabled: true,
        managed: true,
        historyCount: 2,
      }),
    ]);

    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('shows no semantic hit rate when the store has no completed run sample', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 15,
          resourceKey: 'bom',
          name: 'BOM',
          version: 1,
          sourceStatus: 'active',
          sourceDescription: null,
          sourceMetadata: { strategy: 'semantic_layer_mapping_required' },
          sourceFuzzyTerms: [],
          definitionId: null,
          definitionKey: null,
          definitionStatus: null,
          currentPublishedVersionId: null,
          definitionVersionId: null,
          definitionLifecycleStatus: null,
          definitionPayload: null,
          updatedAt: new Date('2026-07-21T10:00:00.000Z'),
          historyCount: 1,
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      brainRun: { count: jest.fn().mockResolvedValue(0) },
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    const result = await service.listSemanticGovernanceSummaries({
      resourceType: 'ontology_entity',
      storeId: 2,
    });

    expect(result[0]).toMatchObject({ hitRate: null, hitCount: 0, sampleCount: 0, managed: false });
  });

  it('uses published business definitions as the governed semantic source and hides duplicate legacy rows', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 14,
          resourceKey: 'customer',
          name: '客户旧投影',
          version: 1,
          sourceStatus: 'active',
          sourceDescription: null,
          sourceMetadata: {},
          sourceFuzzyTerms: ['客户'],
          definitionId: null,
          definitionKey: null,
          definitionStatus: null,
          currentPublishedVersionId: null,
          definitionVersionId: null,
          definitionLifecycleStatus: null,
          definitionPayload: null,
          updatedAt: new Date('2026-07-20T10:00:00.000Z'),
          historyCount: 1,
        },
      ])
      .mockResolvedValueOnce([{ definitionKey: 'entity.customer', hitCount: 4 }]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      brainRun: { count: jest.fn().mockResolvedValue(10) },
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 43,
            definitionKey: 'entity.customer',
            name: 'Customer',
            status: 'active',
            currentPublishedVersionId: 43,
            updatedAt: new Date('2026-07-21T10:00:00.000Z'),
            currentPublishedVersion: {
              id: 43,
              version: 1,
              payload: { model: 'Customer', aliases: ['客户'] },
              lifecycleStatus: 'published',
              publishedAt: new Date('2026-07-21T10:00:00.000Z'),
              createdAt: new Date('2026-07-21T09:00:00.000Z'),
            },
            _count: { versions: 1 },
          },
        ]),
      },
    } as never);

    const result = await service.listSemanticGovernanceSummaries({
      resourceType: 'ontology_entity',
      storeId: 2,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 43,
      resourceKey: 'entity.customer',
      dataTables: ['Customer'],
      fuzzyTerms: ['客户'],
      hitCount: 4,
      hitRate: 0.4,
      managed: true,
      enabled: true,
    });
  });

  it('loads semantic history without calculating run statistics', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: 33,
        resourceKey: 'paid_amount',
        name: '实收金额',
        version: 3,
        sourceStatus: 'active',
        sourceDescription: '支付成功后的实收金额',
        sourceMetadata: ['Order'],
        sourceFuzzyTerms: [],
        definitionId: 41,
        definitionKey: 'paid_amount',
        definitionStatus: 'active',
        currentPublishedVersionId: 51,
        definitionVersionId: 51,
        definitionLifecycleStatus: 'published',
        definitionPayload: { aliases: ['实收'] },
        updatedAt: new Date('2026-07-21T10:00:00.000Z'),
        historyCount: 3,
      },
    ]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(
      service.listSemanticGovernanceHistory({
        resourceType: 'metric',
        resourceKey: 'paid_amount',
      }),
    ).resolves.toEqual([expect.objectContaining({ id: 33, version: 3, dataTables: ['Order'], fuzzyTerms: ['实收'] })]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('toggles the current published business definition instead of mutating a legacy projection', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 41,
      definitionKey: 'paid_amount',
      kind: 'metric',
      name: '实收金额',
      status: 'archived',
      currentPublishedVersionId: 51,
      updatedAt: new Date('2026-07-21T10:00:00.000Z'),
    });
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: 41, currentPublishedVersionId: 51 }),
        update,
      },
      businessDefinitionVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 51,
          definitionId: 41,
          lifecycleStatus: 'published',
          definition: { currentPublishedVersionId: 51 },
        }),
      },
    } as never);

    await expect(
      service.setPublishedSemanticEnabled({
        resourceType: 'metric',
        resourceKey: 'paid_amount',
        enabled: false,
      }),
    ).resolves.toMatchObject({ status: 'archived', enabled: false });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 41 },
        data: { status: 'archived' },
      }),
    );
  });

  it('rejects semantic toggles for ungoverned legacy projections', async () => {
    const update = jest.fn();
    const service = new BrainGovernanceResourceService({
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(null), update },
    } as never);

    await expect(
      service.setPublishedSemanticEnabled({
        resourceType: 'ontology_entity',
        resourceKey: 'card',
        enabled: false,
      }),
    ).rejects.toThrow('semantic_enable_requires_governed_published_version');
    expect(update).not.toHaveBeenCalled();
  });

  it('loads one lightweight latest row per skill for the governance table', async () => {
    const rows = [
      {
        versionId: 1053,
        skillId: 1053,
        skillKey: 'appointment_gap_list',
        name: '预约空档查询',
        description: '查询指定日期的预约空档',
        domains: ['reservation', 'staff'],
        definitionRefs: [
          { definitionKey: 'entity.reservation' },
          { definitionKey: 'entity.beautician' },
          { definitionKey: 'metric.appointment_count' },
          { definitionKey: 'dimension.beauticianName' },
        ],
        version: 17,
        status: 'draft',
        activeVersionId: 986,
        activeVersion: 15,
        enabled: true,
        historyCount: 17,
        updatedAt: new Date('2026-07-21T05:33:51.889Z'),
      },
    ];
    const queryRaw = jest.fn().mockResolvedValue(rows);
    const service = new BrainGovernanceResourceService({ $queryRaw: queryRaw } as never);

    await expect(service.listSkillGovernanceSummaries({ take: 100 })).resolves.toEqual([
      {
        versionId: 1053,
        skillId: 1053,
        skillKey: 'appointment_gap_list',
        name: '预约空档查询',
        description: '查询指定日期的预约空档',
        version: 17,
        status: 'draft',
        activeVersionId: 986,
        activeVersion: 15,
        enabled: true,
        historyCount: 17,
        updatedAt: new Date('2026-07-21T05:33:51.889Z'),
        domains: ['reservation', 'staff'],
        entities: ['reservation', 'beautician'],
        metrics: ['appointment_count'],
      },
    ]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('loads bounded version history for one skill key', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ versionId: 1053, version: 17 }]);
    const service = new BrainGovernanceResourceService({ $queryRaw: queryRaw } as never);

    await expect(service.listSkillGovernanceHistory({ skillKey: 'appointment_gap_list', take: 500 })).resolves.toEqual([
      { versionId: 1053, version: 17 },
    ]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('toggles only the already published skill source row', async () => {
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 986, version: 15, sourceResourceId: 986 }),
      },
      brainSkillRegistry: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          id: 986,
          skillKey: 'appointment_gap_list',
          name: '预约空档查询',
          version: 15,
          enabled: true,
          updatedAt: new Date('2026-07-21T05:33:51.889Z'),
        }),
      },
    };
    const service = new BrainGovernanceResourceService({
      $transaction: jest.fn((operation) => operation(tx)),
    } as never);

    await expect(
      service.setPublishedSkillEnabled({ skillKey: 'appointment_gap_list', enabled: true }),
    ).resolves.toMatchObject({ enabled: true, activeVersionId: 986, activeVersion: 15 });

    expect(tx.brainResourceVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', resourceKey: 'appointment_gap_list' }),
      }),
    );
    expect(tx.brainSkillRegistry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 986 },
        data: { enabled: true },
      }),
    );
  });

  it('supports lightweight version lists without loading JSON snapshots', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainGovernanceResourceService({
      brainResourceVersion: { findMany },
    } as never);

    await service.listVersions({ includeSnapshot: false, take: 100 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        select: {
          id: true,
          resourceType: true,
          resourceKey: true,
          version: true,
          status: true,
          createdAt: true,
        },
      }),
    );
  });

  it.each([
    [
      'metric',
      'new_customer_count',
      {
        name: '新客数',
        domain: 'customer',
        formula: { operation: 'count' },
        sourceTables: ['Customer'],
        permissions: ['core:customer:view'],
        description: '统计周期内新建客户数',
      },
    ],
    [
      'ontology_entity',
      'customer',
      {
        name: '客户',
        domain: 'customer',
        synonyms: [],
        attributes: {},
        tableMap: { table: 'Customer' },
      },
    ],
    [
      'ontology_relation',
      'customer_has_order',
      {
        name: '客户拥有订单',
        fromEntityKey: 'customer',
        toEntityKey: 'order',
        joinPath: { from: 'Customer.id', to: 'Order.customerId' },
      },
    ],
  ] as const)(
    'rejects legacy semantic resource %s before opening a transaction',
    async (resourceType, resourceKey, payload) => {
      const tx = {
        brainResourceVersion: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        brainMetric: { create: jest.fn().mockResolvedValue({ id: 17 }) },
        brainOntologyEntity: { create: jest.fn().mockResolvedValue({ id: 18 }) },
        brainOntologyRelation: { create: jest.fn().mockResolvedValue({ id: 19 }) },
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
      const service = new BrainGovernanceResourceService(prisma as never);

      await expect(
        service.createDraft({
          resourceType,
          resourceKey,
          payload,
          createdBy: 9,
        }),
      ).rejects.toThrow(`business_definition_registry_required:${resourceType}`);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.brainMetric.create).not.toHaveBeenCalled();
      expect(tx.brainOntologyEntity.create).not.toHaveBeenCalled();
      expect(tx.brainOntologyRelation.create).not.toHaveBeenCalled();
      expect(tx.brainResourceVersion.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'agent_profile',
      'store_manager',
      {
        name: '店长',
        systemPrompt: '负责门店经营分析',
        allowedSkills: [],
        dataScopeRules: {},
      },
      'brainAgentProfile',
    ],
    [
      'skill',
      'customer_query',
      {
        name: '客户查询',
        type: 'query',
        inputSchema: {},
        outputSchema: {},
        permissions: [],
        riskLevel: 'low',
      },
      'brainSkillRegistry',
    ],
    [
      'inspection_rule',
      'inactive_customer',
      {
        name: '沉睡客户检查',
        domain: 'customer',
        condition: {},
        suggestionTpl: {},
        riskLevel: 'medium',
      },
      'brainInspectionRule',
    ],
  ] as const)('keeps existing create behavior for %s', async (resourceType, resourceKey, payload, sourceModel) => {
    const sourceCreate = jest.fn().mockResolvedValue({ id: 17 });
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 41, ...data })),
      },
      [sourceModel]: { create: sourceCreate },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    const result = await service.createDraft({
      resourceType,
      resourceKey,
      payload,
      createdBy: 9,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(sourceCreate).toHaveBeenCalledTimes(1);
    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resourceType, resourceKey, version: 1, status: 'draft', sourceResourceId: 17 }),
    });
    expect(result).toMatchObject({ id: 41, version: 1, status: 'draft' });
  });

  it.each([
    'sourceFingerprint',
    'definitionRefs',
    'synonyms',
    'negativeExamples',
    'examples',
    'domains',
    'intents',
    'description',
    'successSchema',
  ])('rejects caller-controlled generated skill field %s before opening a transaction', async (field) => {
    const sourceCreate = jest.fn().mockResolvedValue({ id: 17 });
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 41, ...data })),
      },
      brainSkillRegistry: { create: sourceCreate },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);
    await expect(
      service.createDraft({
        resourceType: 'skill',
        resourceKey: 'customer_facts',
        payload: {
          name: '客户事实',
          type: 'query',
          inputSchema: {},
          outputSchema: {},
          permissions: ['core:customer:view'],
          riskLevel: 'low',
          [field]: field.includes('Fingerprint') ? 'a'.repeat(64) : [],
        },
        createdBy: 9,
      }),
    ).rejects.toThrow(`generated_capability_field_forbidden:${field}`);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sourceCreate).not.toHaveBeenCalled();
  });

  it('rejects legacy governance updates for an existing generated capability key inside the transaction', async () => {
    const sourceCreate = jest.fn().mockResolvedValue({ id: 18 });
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue({
          version: 3,
          snapshot: { generatedCapability: true, key: 'customer_facts', version: 3 },
        }),
        create: jest.fn(),
      },
      brainSkillRegistry: { create: sourceCreate },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(
      service.createDraft({
        resourceType: 'skill',
        resourceKey: 'customer_facts',
        payload: { allowedRoles: ['finance'], riskLevel: 'medium' },
        createdBy: 9,
      }),
    ).rejects.toThrow('generated_capability_governance_pipeline_required');

    expect(tx.brainResourceVersion.findFirst).toHaveBeenCalledTimes(1);
    expect(sourceCreate).not.toHaveBeenCalled();
    expect(tx.brainResourceVersion.create).not.toHaveBeenCalled();
  });

  it('updates an agent profile by creating version 2 and does not mutate version 1', async () => {
    const previous = {
      id: 41,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      version: 1,
      snapshot: {
        name: '店长',
        systemPrompt: '旧提示词',
        allowedSkills: [],
        dataScopeRules: {},
      },
    };
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(previous),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })),
      },
      brainAgentProfile: { create: jest.fn().mockResolvedValue({ id: 18 }), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    const result = await service.createDraft({
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      payload: { systemPrompt: '新提示词' },
      createdBy: 9,
    });

    expect(tx.brainAgentProfile.update).not.toHaveBeenCalled();
    expect(tx.brainAgentProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roleKey: 'store_manager', version: 2, systemPrompt: '新提示词' }),
    });
    expect(result).toMatchObject({ version: 2 });
  });

  it('retries serializable P2034 and P2002 draft version races and succeeds on the third attempt', async () => {
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })),
      },
      brainAgentProfile: { create: jest.fn().mockResolvedValue({ id: 18 }) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockImplementationOnce((callback) => callback(tx)),
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(
      service.createDraft({
        resourceType: 'agent_profile',
        resourceKey: 'store_manager',
        payload: { name: '店长', systemPrompt: '负责门店经营', allowedSkills: [], dataScopeRules: {} },
        createdBy: 9,
      }),
    ).resolves.toMatchObject({ version: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it.each(['P2034', 'P2002'])('maps exhausted %s draft version races to ConflictException', async (code) => {
    const prisma = { $transaction: jest.fn().mockRejectedValue({ code }) };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(
      service.createDraft({
        resourceType: 'agent_profile',
        resourceKey: 'store_manager',
        payload: { name: '店长', systemPrompt: '负责门店经营', allowedSkills: [], dataScopeRules: {} },
        createdBy: 9,
      }),
    ).rejects.toMatchObject({ name: 'ConflictException', message: 'brain_resource_version_conflict' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each(
    (['metric', 'ontology_entity', 'ontology_relation'] as const).flatMap((resourceType) =>
      (['draft', 'active', 'disabled', 'archived'] as const).map((status) => [resourceType, status] as const),
    ),
  )('rejects %s status change to %s before any write', async (resourceType, status) => {
    const prisma = {
      brainResourceVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 41, resourceType, status: 'draft' }),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(service.changeStatus({ id: 41, status })).rejects.toMatchObject({
      message: `business_definition_registry_required:${resourceType}`,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.brainResourceVersion.update).not.toHaveBeenCalled();
  });

  it('does not allow a non-semantic draft to bypass the release gate and become active directly', async () => {
    const prisma = {
      brainResourceVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 41, resourceType: 'agent_profile', status: 'draft' }),
        update: jest.fn(),
      },
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(service.changeStatus({ id: 41, status: 'active' })).rejects.toMatchObject({
      message: 'brain_resource_activation_requires_release',
    });
    expect(prisma.brainResourceVersion.update).not.toHaveBeenCalled();
  });

  it('keeps existing status update behavior for non-semantic resources', async () => {
    const current = {
      id: 41,
      resourceType: 'skill',
      status: 'draft',
      activatedAt: null,
      archivedAt: null,
    };
    const prisma = {
      brainResourceVersion: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({ ...current, status: 'disabled' }),
      },
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(service.changeStatus({ id: 41, status: 'disabled' })).resolves.toMatchObject({ status: 'disabled' });
    expect(prisma.brainResourceVersion.update).toHaveBeenCalledTimes(1);
  });
});
