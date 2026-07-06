import { AgentV2GovernanceService } from './agent-v2-governance.service.js';
import { AGENT_V2_CAPABILITY_MANIFESTS } from '../capability/agent-v2-capability-manifest.js';

describe('AgentV2GovernanceService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLegacyRetirementConfirmed = process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalLegacyRetirementConfirmed === undefined) {
      delete process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;
    } else {
      process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED = originalLegacyRetirementConfirmed;
    }
  });

  function createService() {
    const now = new Date('2026-07-05T10:00:00.000Z');
    const prisma = {
      agentRun: {
        findMany: jest.fn().mockImplementation((args?: any) => {
          if (args?.select?.startedAt) {
            return Promise.resolve([
              {
                id: 1,
                status: 'completed',
                startedAt: new Date(now.getTime() - 1500),
                completedAt: now,
                planJson: {
                  businessTask: {
                    agentV2GrayStrategy: {
                      mode: 'kg_llm_preferred',
                      finalEngine: 'kg_llm',
                    },
                  },
                },
                contextJson: { intent: { cacheHit: true } },
                evidenceJson: {},
                resultJson: {},
                createdAt: now,
              },
              {
                id: 2,
                status: 'failed',
                startedAt: new Date(now.getTime() - 500),
                completedAt: now,
                planJson: {
                  businessTask: {
                    agentV2GrayStrategy: {
                      mode: 'kg_llm_preferred',
                      finalEngine: 'legacy_regex',
                    },
                  },
                },
                contextJson: { intent: { cacheHit: false } },
                evidenceJson: {},
                resultJson: {},
                errorMessage: 'failed',
                createdAt: now,
              },
            ]);
          }
          return Promise.resolve([{ id: 1, runNo: 'ar_1', status: 'failed', userInput: '未知问题', createdAt: now }]);
        }),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([{ status: 'failed', _count: { _all: 1 } }]),
        findFirst: jest.fn().mockResolvedValue({ id: 1, runNo: 'ar_1', agentCode: 'agent_v2' }),
      },
      agentMessage: { findMany: jest.fn().mockResolvedValue([]) },
      agentStep: { findMany: jest.fn().mockResolvedValue([]) },
      agentToolCall: {
        findMany: jest.fn().mockResolvedValue([
          {
            toolName: 'business.record.query',
            status: 'success',
            riskLevel: 'low',
            latencyMs: 120,
            approvalId: null,
            createdAt: now,
            completedAt: now,
            resultJson: {
              data: {
                queryTrace: {
                  engine: 'generic_query_engine',
                  sqlSummary: {
                    dialect: 'prisma_sql_summary',
                    model: 'ProductOrder',
                    statementPreview: 'SELECT * FROM "ProductOrder" WHERE storeId = :storeId LIMIT 10;',
                  },
                },
              },
            },
          },
          { toolName: 'business.action.draft', status: 'success', riskLevel: 'high', latencyMs: 300, approvalId: null, createdAt: now, completedAt: now },
        ]),
      },
      agentApproval: { findMany: jest.fn().mockResolvedValue([{ status: 'pending' }]) },
      agentRunAuditDetail: {
        findMany: jest.fn().mockResolvedValue([
          {
            runId: 1,
            costJson: {
              promptTokens: 1200,
              completionTokens: 300,
              totalTokens: 1500,
              estimatedUsd: 0.0123,
            },
            latencyBreakdownJson: { totalChars: 4200 },
            createdAt: now,
          },
        ]),
      },
      agentEvalRun: {
        findMany: jest.fn().mockResolvedValue([{ id: 9, status: 'pass', score: 1, createdAt: now }]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 10, status: args.data.status, score: args.data.score, createdAt: now, resultJson: args.data.resultJson })),
        findFirst: jest.fn().mockResolvedValue({
          id: 12,
          caseId: null,
          runId: null,
          status: 'failed',
          score: 0.8,
          errorMessage: 'P0 gate failed',
          createdAt: now,
          resultJson: {
            source: 'agent-v2-eval-gate-report.json',
            importedAt: '2026-07-05T10:00:00.000Z',
            summary: { totalQuestions: 650, p0Questions: 103, pass: false },
            metrics: { p0Accuracy: 0.97 },
            gates: [
              { gate: 'P0 正确率', expected: '>= 98%', actual: '97.0%', pass: false },
              { gate: '高风险自动发布', expected: '0 个', actual: '0 个', pass: true },
            ],
            samples: {
              p0Unmapped: [{ id: 'q001', question: '这个月人效怎么样', expectedCapabilityId: 'finance.staff-efficiency.metric', reason: 'missing capability' }],
              p0WrongRouteRisk: [{ id: 'q002', question: '今天核销记录', expectedCapabilityId: 'card.usage.records.list', actualCapabilityId: 'order.card-package.records.list' }],
              kgLegacyDiffs: [{ id: 'q003', question: '差异样例' }],
            },
          },
        }),
      },
      agentEvalCase: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            scenario: 'manual',
            input: '这个月人效怎么样',
            role: 'manager',
            expectedTool: 'finance.staff-efficiency.metric',
            expectedOutcome: {
              priority: 'P1',
              expectedOutputKinds: ['kpi', 'evidence_panel'],
              failureCategory: '能力缺失',
            },
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        ]),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 102, ...args.data, createdAt: now, updatedAt: now })),
        findFirst: jest.fn().mockResolvedValue({
          id: 101,
          scenario: 'manual',
          input: '这个月人效怎么样',
          role: 'manager',
          expectedTool: 'finance.staff-efficiency.metric',
          expectedOutcome: { priority: 'P1' },
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({
          id: args.where.id,
          scenario: args.data.scenario ?? 'manual',
          input: args.data.input ?? '这个月人效怎么样',
          role: args.data.role ?? 'manager',
          expectedTool: args.data.expectedTool ?? 'finance.staff-efficiency.metric',
          expectedOutcome: args.data.expectedOutcome,
          status: args.data.status ?? 'active',
          createdAt: now,
          updatedAt: now,
        })),
      },
      agentKnowledgeGraphOverride: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 11,
            overrideType: 'synonym',
            relationType: 'SYNONYM_OF',
            targetNodeId: 'data-model:productorder',
            value: '商品单',
            label: '商品单 -> ProductOrder',
            status: 'active',
            source: 'manual_override',
            confidence: 1,
            payloadJson: { nextGraphMerge: 'kg:generate' },
            createdBy: 7,
            createdAt: now,
            updatedAt: now,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 12, ...args.data, createdAt: now, updatedAt: now })),
        findFirst: jest.fn().mockResolvedValue({ id: 11, overrideType: 'synonym', payloadJson: { nextGraphMerge: 'kg:generate' } }),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, overrideType: 'synonym', relationType: 'SYNONYM_OF', status: args.data.status, payloadJson: args.data.payloadJson, createdAt: now, updatedAt: now })),
      },
      agentV2GrayRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 21,
            name: '门店 1 shadow',
            mode: 'shadow',
            status: 'active',
            priority: 10,
            storeIds: [1],
            personaCodes: ['manager'],
            roles: [],
            entrypoints: ['kiosk'],
            capabilityIds: ['card.package.inactive-customers.list'],
            reason: '7 天 shadow 观察',
            source: 'governance_config',
            payloadJson: { source: 'agent_governance' },
            createdBy: 7,
            createdAt: now,
            updatedAt: now,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 22, status: 'active', source: 'governance_config', createdAt: now, updatedAt: now, ...args.data })),
        findFirst: jest.fn().mockResolvedValue({ id: 21, payloadJson: { source: 'agent_governance' } }),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, name: '门店 1 shadow', mode: 'shadow', priority: 10, status: args.data.status, storeIds: [1], personaCodes: [], roles: [], entrypoints: [], capabilityIds: [], payloadJson: args.data.payloadJson, createdAt: now, updatedAt: now })),
      },
    };
    const manifestProvider = {
      getActiveVersion: jest.fn().mockReturnValue('cap-test'),
      listManifests: jest.fn().mockReturnValue([
        { capabilityId: 'a', status: 'enabled', domain: 'order', releaseStrategy: 'auto_publish', riskLevel: 'low' },
        { capabilityId: 'b', status: 'enabled', domain: 'finance', releaseStrategy: 'approval_required', riskLevel: 'medium' },
      ]),
      listManifestsForVersion: jest.fn(),
    };
    const autoPublish = {
      listRuns: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getRun: jest.fn().mockResolvedValue(null),
    };
    const runtimePlanResult = {
      decision: {
        selected: {
          capabilityId: 'order.product.records.list',
          displayName: '商品订单记录',
          status: 'enabled',
          releaseStrategy: 'auto_publish',
          riskLevel: 'low',
          storeScope: 'required',
          personaCodes: ['manager', 'reception'],
          permissionCodes: ['order:product:view'],
          actions: ['list'],
          eventTypes: [],
          executor: {
            type: 'business_record_query',
            tool: 'business.record.query',
            queryKey: 'order.product.records.list',
          },
          fieldPolicies: [
            { field: 'orderNo', label: '订单编号', visibility: 'allow', reason: '业务排障必要字段' },
            { field: 'customerPhone', label: '手机号', visibility: 'deny', reason: '调试页面不得展示客户手机号' },
            { field: 'remark', label: '备注', visibility: 'mask', reason: '备注可能包含敏感信息' },
          ],
        },
        confidence: 0.9,
        reason: '命中商品订单。',
        intent: {
          objects: ['ProductOrder'],
          domain: 'order',
          action: 'list',
          timeIntent: 'current',
          keywords: ['商品订单'],
          candidateCapabilities: ['order.product.records.list'],
          confidence: 0.9,
          needsClarification: false,
          unsupportedReason: null,
          trace: {
            source: 'llm',
            cacheHit: false,
            llmPrompt: {
              system: '你是美容门店经营系统的 Agent V2 意图抽取器。',
              userPayloadPreview: '{"question":"今天有哪些商品订单"}',
              graphContextCounts: { objectHints: 1, domainHints: 1, capabilityHints: 1, exclusions: 0, fieldHints: 1 },
              activeManifestCount: 34,
              outputSchemaKeys: ['objects', 'domain', 'candidateCapabilities'],
            },
            llmResponse: {
              rawTextPreview: '{"candidateCapabilities":["order.product.records.list"]}',
              parsed: true,
              parsedKeys: ['candidateCapabilities'],
            },
            normalizedQuestion: '今天有哪些商品订单',
            objectHints: [
              {
                objectId: 'data-model:productorder',
                objectType: 'ProductOrder',
                displayName: '商品订单',
                matchedTerms: ['商品订单'],
                sourceModels: ['ProductOrder'],
                score: 0.92,
              },
            ],
            domainHints: [
              {
                domain: 'order',
                displayName: '订单',
                reasons: ['商品订单'],
                score: 0.9,
              },
            ],
            capabilityHints: [
              {
                capabilityId: 'order.product.records.list',
                displayName: '商品订单记录',
                domain: 'order',
                outputKinds: ['table', 'evidence_panel'],
                triggerTerms: ['商品订单'],
                score: 0.94,
              },
            ],
            exclusions: [],
          },
        },
      },
      plan: {
        toolPlan: [{ tool: 'business.record.query', args: { capabilityId: 'order.product.records.list' } }],
        outputContract: {
          requiredKinds: ['table', 'evidence_panel'],
          preferredKinds: ['table', 'evidence_panel'],
          evidenceRequired: true,
        },
      },
    };
    const runtime = {
      plan: jest.fn().mockReturnValue(runtimePlanResult),
      planAsync: jest.fn().mockResolvedValue(runtimePlanResult),
      getTool: jest.fn().mockImplementation((name: string) => {
        if (name === 'business.record.query') return { name, riskLevel: 'low', requiresApproval: false };
        if (name === 'business.action.draft') return { name, riskLevel: 'medium', requiresApproval: true };
        return null;
      }),
      executeTool: jest.fn().mockResolvedValue({
        status: 'success',
        title: '商品订单记录',
        summary: '返回 1 条商品订单记录，联系电话 13812345678。',
        data: {
          items: [{ id: 1, orderNo: 'PO-001', customerName: '张敏', customerPhone: '13812345678' }],
          accessToken: 'raw-token-should-not-render',
          queryTrace: {
            engine: 'generic_query_engine',
            queryKey: 'order.product.records.list',
            kind: 'record.query',
            sourceModel: 'ProductOrder',
            filters: ['storeId = 2'],
            sqlSummary: {
              dialect: 'prisma_sql_summary',
              model: 'ProductOrder',
              statementPreview: 'SELECT * FROM "ProductOrder" WHERE storeId = :storeId LIMIT 50;',
              sensitiveValuesRedacted: true,
            },
          },
        },
        evidence: {
          source: ['ProductOrder'],
          metricDefinition: '商品订单记录查询',
          filters: ['storeId = 2'],
          sampleSize: 1,
        },
        actions: [],
      }),
      validateAnswer: jest.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
    };
    manifestProvider.listManifestsForVersion.mockResolvedValue({
      requestedVersion: 'cap-prev',
      version: 'cap-prev',
      status: 'archived',
      source: 'database',
      found: true,
      itemCount: 34,
      manifests: [
        {
          ...runtimePlanResult.decision.selected,
          version: 'cap-prev',
          source: 'manual_builtin',
          domain: 'order',
          businessObject: 'ProductOrder',
          sourceModels: ['ProductOrder'],
          outputKinds: ['chart', 'evidence_panel'],
          examples: ['今天有哪些商品订单'],
          negativeExamples: [],
          triggerKeywords: ['商品订单'],
          boundaryNotes: [],
        },
      ],
    });
    const grayStrategy = {
      refreshDbRules: jest.fn().mockResolvedValue([]),
    };
    return {
      service: new AgentV2GovernanceService(prisma as any, manifestProvider as any, autoPublish as any, runtime as any, grayStrategy as any),
      prisma,
      manifestProvider,
      runtime,
      grayStrategy,
    };
  }

  it('returns knowledge graph summary from generated snapshot', () => {
    const { service } = createService();

    const summary = service.knowledgeGraphSummary();

    expect(summary.nodeCount).toBeGreaterThan(0);
    expect(summary.edgeCount).toBeGreaterThan(0);
    expect(summary.blockerCount).toBe(0);
  });

  it('lists graph nodes with keyword filtering', () => {
    const { service } = createService();

    const result = service.listKnowledgeGraphNodes({ keyword: 'ProductOrder', pageSize: 5 });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(5);
  });

  it('returns focused graph visualization and related node details', () => {
    const { service } = createService();
    const focusId = service.listKnowledgeGraphNodes({ keyword: 'ProductOrder', pageSize: 1 }).items[0].id;

    const visual = service.visualizeKnowledgeGraph({ focusId, depth: 1, limit: 40 }) as any;
    const detail = service.getKnowledgeGraphNode(focusId);

    expect(visual.focusId).toBe(focusId);
    expect(visual.nodes.map((node: { id: string }) => node.id)).toContain(focusId);
    expect(visual.edges.length).toBeGreaterThan(0);
    expect(detail.relatedNodes.length).toBeGreaterThan(0);
  });

  it('lists manual graph synonym overrides from governance table', async () => {
    const { service, prisma } = createService();

    const result = await service.listKnowledgeGraphSynonyms({ page: 1, pageSize: 5 });

    expect(prisma.agentKnowledgeGraphOverride.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { overrideType: 'synonym', status: { not: 'deleted' } },
      take: 5,
    }));
    expect(result.items[0]).toMatchObject({
      overrideType: 'synonym',
      relationType: 'SYNONYM_OF',
      value: '商品单',
      nextGraphMerge: 'kg:generate',
    });
  });

  it('creates and soft deletes graph synonym overrides without mutating generated graph', async () => {
    const { service, prisma } = createService();
    const targetNodeId = service.listKnowledgeGraphNodes({ keyword: 'ProductOrder', pageSize: 1 }).items[0].id;

    const created = await service.createKnowledgeGraphSynonym({ targetNodeId, synonym: '商品单', createdBy: 7 });
    const deleted = await service.deleteKnowledgeGraphOverride(11, 'synonym', 7);

    expect(prisma.agentKnowledgeGraphOverride.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        overrideType: 'synonym',
        relationType: 'SYNONYM_OF',
        targetNodeId,
        value: '商品单',
        createdBy: 7,
      }),
    }));
    expect(created).toMatchObject({ overrideType: 'synonym', nextGraphMerge: 'kg:generate' });
    expect(deleted).toMatchObject({ status: 'deleted' });
  });

  it('returns capability health from active manifests', () => {
    const { service } = createService();

    const health = service.capabilitiesHealth();

    expect(health).toMatchObject({
      activeManifestVersion: 'cap-test',
      total: 2,
      enabled: 2,
    });
    expect(health.byReleaseStrategy).toMatchObject({ auto_publish: 1, approval_required: 1 });
  });

  it('lists Agent V2 gray rules from governance config table', async () => {
    const { service, prisma } = createService();

    const result = await service.listGrayRules({ page: 1, pageSize: 10, status: 'active' });

    expect(prisma.agentV2GrayRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'active' },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      take: 10,
    }));
    expect(result.items[0]).toMatchObject({
      name: '门店 1 shadow',
      mode: 'shadow',
      scopeSummary: expect.stringContaining('门店 1'),
      nextRuntimeRefresh: 'agent_v2_gray_strategy_cache',
    });
  });

  it('creates and soft deletes Agent V2 gray rules while refreshing runtime cache', async () => {
    const { service, prisma, grayStrategy } = createService();

    const created = await service.createGrayRule({
      name: '次卡沉睡客户新链路优先',
      mode: 'kg_llm_preferred',
      priority: 5,
      capabilityIds: ['card.package.inactive-customers.list'],
      entrypoints: ['kiosk'],
      reason: '单能力灰度',
      createdBy: 7,
    });
    const deleted = await service.deleteGrayRule(21, 7);

    expect(prisma.agentV2GrayRule.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: '次卡沉睡客户新链路优先',
        mode: 'kg_llm_preferred',
        priority: 5,
        capabilityIds: ['card.package.inactive-customers.list'],
        entrypoints: ['kiosk'],
        createdBy: 7,
      }),
    }));
    expect(grayStrategy.refreshDbRules).toHaveBeenCalledTimes(2);
    expect(created).toMatchObject({
      mode: 'kg_llm_preferred',
      scopeSummary: expect.stringContaining('能力 card.package.inactive-customers.list'),
    });
    expect(deleted).toMatchObject({ status: 'deleted' });
  });

  it('blocks production legacy_retired gray rule creation before retirement confirmation', async () => {
    const { service, prisma, grayStrategy } = createService();
    process.env.NODE_ENV = 'production';
    delete process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;

    await expect(service.createGrayRule({
      name: '旧正则退役',
      mode: 'legacy_retired',
      reason: '最终退役',
      createdBy: 7,
    })).rejects.toThrow('AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true');

    expect(prisma.agentV2GrayRule.create).not.toHaveBeenCalled();
    expect(grayStrategy.refreshDbRules).not.toHaveBeenCalled();
  });

  it('allows production legacy_retired gray rule creation after retirement confirmation', async () => {
    const { service, prisma, grayStrategy } = createService();
    process.env.NODE_ENV = 'production';
    process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED = 'true';

    const created = await service.createGrayRule({
      name: '旧正则退役',
      mode: 'legacy_retired',
      reason: '最终退役',
      createdBy: 7,
    });

    expect(prisma.agentV2GrayRule.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: '旧正则退役',
        mode: 'legacy_retired',
        createdBy: 7,
      }),
    }));
    expect(grayStrategy.refreshDbRules).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ mode: 'legacy_retired' });
  });

  it('debug execute returns a dry-run plan without tool execution', () => {
    const { service, runtime } = createService();

    const result = service.debugExecute({ question: '今天有哪些商品订单', storeId: 1 });

    expect(runtime.plan).toHaveBeenCalled();
    expect(result).toMatchObject({
      dryRun: true,
      debugContext: expect.objectContaining({
        question: '今天有哪些商品订单',
        storeId: 1,
        role: 'manager',
        entrypoint: 'agent_governance_debug',
        grayMode: 'kg_llm_preferred',
        manifestVersion: 'cap-test',
        manifestVersionSource: 'active_manifest',
      }),
      selectedCapabilityId: 'order.product.records.list',
      confidence: 0.9,
      graphTrace: expect.objectContaining({
        available: true,
        source: 'llm',
        normalizedQuestion: '今天有哪些商品订单',
        graphContextCounts: expect.objectContaining({
          objectHints: 1,
          capabilityHints: 1,
          fieldHints: 1,
        }),
        selectedIntent: expect.objectContaining({
          objects: ['ProductOrder'],
          domain: 'order',
          candidateCapabilities: ['order.product.records.list'],
        }),
        objectHints: expect.arrayContaining([
          expect.objectContaining({ objectType: 'ProductOrder', matchedTerms: ['商品订单'] }),
        ]),
        capabilityHints: expect.arrayContaining([
          expect.objectContaining({ capabilityId: 'order.product.records.list' }),
        ]),
      }),
      llmTrace: expect.objectContaining({
        available: true,
        source: 'llm',
        prompt: expect.objectContaining({ activeManifestCount: 34 }),
        response: expect.objectContaining({ parsed: true }),
      }),
      policyTrace: expect.objectContaining({
        available: true,
        overallStatus: 'pass',
        allowed: true,
        requiresApproval: false,
        capability: expect.objectContaining({
          capabilityId: 'order.product.records.list',
          releaseStrategy: 'auto_publish',
          riskLevel: 'low',
        }),
        fieldPolicySummary: expect.objectContaining({
          mask: ['remark'],
          deny: ['customerPhone'],
        }),
        checks: expect.arrayContaining([
          expect.objectContaining({ name: 'status', status: 'pass' }),
          expect.objectContaining({ name: 'store_scope', status: 'pass' }),
          expect.objectContaining({ name: 'permission', status: 'pass' }),
          expect.objectContaining({ name: 'tool_approval', status: 'pass' }),
          expect.objectContaining({ name: 'field_policy', status: 'pass' }),
        ]),
      }),
    });
    expect(result.replay?.phases.map((phase: any) => phase.key)).toEqual([
      'debug_input',
      'kg_preprocessing',
      'llm_prompt_response',
      'intent_extraction',
      'manifest_mapping',
      'policy_boundary',
      'tool_plan',
      'output_contract',
      'runtime_execution',
    ]);
  });

  it('debug execute exposes write-blocked coupon issue reasons', () => {
    const { service, runtime } = createService();
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'marketing.coupon.issue.blocked');
    expect(capability).toBeTruthy();
    const toolPlan = [{
      tool: 'business.action.draft',
      args: {
        question: '帮我给所有沉睡客户发券',
        capabilityId: 'marketing.coupon.issue.blocked',
        queryKey: 'marketing.coupon-issue-blocked',
        filters: {},
      },
    }];
    runtime.plan.mockReturnValueOnce({
      decision: {
        selected: capability,
        confidence: 0.92,
        reason: '命中发券高风险动作阻断能力。',
        candidates: [{ capabilityId: 'marketing.coupon.issue.blocked', score: 0.92, reason: 'boundary:coupon_issue_action' }],
        excluded: [],
        outputIntent: 'confirm_action',
        toolPlan,
        boundaryWarnings: [],
        intent: {
          objects: ['Customer', 'Promotion'],
          domain: 'marketing',
          action: 'draft',
          timeIntent: 'current',
          keywords: ['发券', '沉睡客户'],
          candidateCapabilities: ['marketing.coupon.issue.blocked'],
          confidence: 0.92,
          needsClarification: false,
          unsupportedReason: null,
          trace: {
            source: 'kg_fallback',
            cacheHit: false,
            normalizedQuestion: '帮我给所有沉睡客户发券',
            objectHints: [],
            domainHints: [],
            capabilityHints: [],
            exclusions: [],
          },
        },
      },
      plan: {
        intentType: 'draft',
        goal: '客户发券动作阻断',
        toolPlan,
        confidence: 0.92,
        clarificationNeeded: false,
        executionPath: 'fast',
        businessTask: {
          architecture: 'agent_v2_kg_llm',
          question: '帮我给所有沉睡客户发券',
          domain: 'marketing',
          businessObject: 'CouponIssueDraft',
          eventTypes: ['coupon_issue'],
          sourceModels: ['Customer', 'Promotion'],
          releaseStrategy: 'write_blocked',
          boundaryWarnings: [],
          agentV2GrayStrategy: {
            mode: 'kg_llm_only',
            engine: 'kg_llm',
            source: 'context',
            finalEngine: 'kg_llm',
          },
          engineVersion: 'kg_llm_only',
        },
        capabilityPlan: {
          capabilityId: 'marketing.coupon.issue.blocked',
          reason: '命中发券高风险动作阻断能力。',
        },
        outputContract: {
          requiredKinds: ['action_card', 'evidence_panel'],
          preferredKinds: ['action_card', 'evidence_panel'],
          evidenceRequired: true,
          maxFollowUps: 2,
        },
      },
      strategy: {
        mode: 'kg_llm_only',
        engine: 'kg_llm',
        source: 'context',
        reason: 'test',
        allowLegacyFallback: false,
        recordShadow: false,
        legacyRetired: false,
        finalEngine: 'kg_llm',
        kgSelectedCapabilityId: 'marketing.coupon.issue.blocked',
      },
    });

    const result = service.debugExecute({ question: '帮我给所有沉睡客户发券', storeId: 1, grayMode: 'kg_llm_only' });

    expect(result.selectedCapabilityId).toBe('marketing.coupon.issue.blocked');
    expect(result.policyTrace).toMatchObject({
      available: true,
      overallStatus: 'deny',
      allowed: false,
      capability: expect.objectContaining({
        capabilityId: 'marketing.coupon.issue.blocked',
        releaseStrategy: 'write_blocked',
        riskLevel: 'high',
      }),
    });
    expect(result.policyTrace.checks).toContainEqual(expect.objectContaining({
      name: 'release_strategy',
      status: 'deny',
      reason: expect.stringContaining('当前不允许自动执行'),
    }));
    expect(result.policyTrace).toMatchObject({
      fieldPolicySummary: {
        deny: expect.arrayContaining(['customerIds', 'customerPhone']),
      },
    });
    expect(result.replay?.phases.find((phase: any) => phase.key === 'policy_boundary')).toMatchObject({
      status: 'deny',
      data: expect.objectContaining({
        allowed: false,
      }),
    });
    expect(result.replay?.phases.find((phase: any) => phase.key === 'runtime_execution')).toMatchObject({
      status: 'dry_run_not_executed',
    });
  });

  it('debug execute async returns LLM prompt and response trace', async () => {
    const { service, runtime } = createService();

    const result = await service.debugExecuteAsync({ question: '今天有哪些商品订单', storeId: 1 });

    expect(runtime.planAsync).toHaveBeenCalled();
    expect(result.llmTrace).toMatchObject({
      available: true,
      source: 'llm',
      prompt: expect.objectContaining({
        userPayloadPreview: expect.stringContaining('今天有哪些商品订单'),
      }),
      response: expect.objectContaining({
        rawTextPreview: expect.stringContaining('order.product.records.list'),
        parsed: true,
      }),
    });
    expect(result.replay?.phases.find((phase: any) => phase.key === 'llm_prompt_response')).toMatchObject({
      key: 'llm_prompt_response',
      status: 'available',
    });
  });

  it('debug compare returns mode, manifest version differences and five-run consistency', async () => {
    const { service, runtime, manifestProvider } = createService();

    const result = await service.debugCompare({ question: '今天有哪些商品订单', storeId: 1, compareManifestVersion: 'cap-prev' }) as any;

    expect(runtime.plan).toHaveBeenCalledTimes(9);
    expect(manifestProvider.listManifestsForVersion).toHaveBeenCalledWith('cap-prev');
    expect(Object.keys(result.modes)).toEqual(['legacy_regex', 'shadow', 'kg_llm_preferred', 'kg_llm_only', 'manifest_version_target']);
    expect(result.comparison.manifestVersions).toMatchObject({
      active: 'cap-test',
      target: 'cap-prev',
      targetAvailable: true,
      changedAcrossModes: true,
      selectedByVersion: {
        active: 'cap-test',
        target: 'cap-prev',
      },
    });
    expect(result.comparison.manifestVersionComparison).toMatchObject({
      requestedVersion: 'cap-prev',
      activeVersion: 'cap-test',
      targetVersion: 'cap-prev',
      targetAvailable: true,
      changedManifestVersion: true,
      changedCapability: false,
      changedOutputShape: true,
      target: expect.objectContaining({
        selectedManifestVersion: 'cap-prev',
        outputShape: expect.objectContaining({
          requiredKinds: ['chart', 'evidence_panel'],
        }),
      }),
    });
    expect(result.comparison.graphContext).toMatchObject({
      withGraphMode: 'kg_llm_only',
      withoutGraphMode: 'legacy_regex',
    });
    expect(result.comparison.legacyVsKgLlm).toMatchObject({
      changedCapability: false,
      changedOutputShape: false,
      changedEvidence: false,
    });
    expect(result.comparison.consistency).toMatchObject({
      mode: 'kg_llm_preferred',
      iterations: 5,
      stable: true,
      capabilityCounts: { 'order.product.records.list': 5 },
    });
    expect(result.comparison.differences).toMatchObject({
      selectedCapabilityIds: expect.objectContaining({
        legacy_regex: 'order.product.records.list',
        kg_llm_only: 'order.product.records.list',
      }),
      outputShapes: expect.objectContaining({
        legacy_regex: 'evidence_panel|table',
      }),
      evidenceProfiles: expect.objectContaining({
        kg_llm_preferred: expect.stringContaining('business.record.query'),
      }),
      latencyMs: expect.objectContaining({
        byMode: expect.objectContaining({ kg_llm_only: expect.any(Number) }),
      }),
      costEstimate: expect.objectContaining({
        unit: 'local_debug_char_estimate',
      }),
    });
    expect(result.comparison.verdict).toMatchObject({
      canJudgeNewArchitectureMoreStable: true,
      productionEvidenceRequired: expect.stringContaining('7 天 shadow'),
    });
  });

  it('simulates manifest changes in the debug session without publishing', () => {
    const { service } = createService();

    const selected = service.simulateManifest({
      question: '今天有哪些商品订单',
      storeId: 1,
      capabilityId: 'order.product.records.list',
      enabled: true,
      triggerKeywords: ['商品订单'],
      outputKinds: ['chart', 'evidence_panel'],
    }) as any;
    const excluded = service.simulateManifest({
      question: '今天有哪些商品订单',
      storeId: 1,
      capabilityId: 'order.product.records.list',
      enabled: false,
      negativeExamples: ['今天有哪些商品订单'],
    }) as any;

    expect(selected.simulation).toMatchObject({
      temporaryOnly: true,
      applied: true,
      capabilityId: 'order.product.records.list',
      effect: 'selected_by_temporary_manifest',
      triggerMatched: true,
      changedFields: expect.arrayContaining(['status', 'triggerKeywords', 'outputKinds']),
      formalEditUrl: expect.stringContaining('/system/agent-capabilities'),
    });
    expect(selected.plan.outputContract.requiredKinds).toEqual(['chart', 'evidence_panel']);
    expect(selected.decision.selected.outputKinds).toEqual(['chart', 'evidence_panel']);
    expect(excluded.simulation).toMatchObject({
      temporaryOnly: true,
      applied: true,
      capabilityId: 'order.product.records.list',
      effect: 'excluded_by_temporary_manifest',
      negativeMatched: true,
      changedFields: expect.arrayContaining(['status', 'negativeExamples']),
    });
    expect(excluded.selectedCapabilityId).not.toBe('order.product.records.list');
  });

  it('debug execute async can replay read-only tools and contract without writes', async () => {
    const { service, runtime } = createService();

    const result = await service.debugExecuteAsync({
      question: '今天有哪些商品订单',
      storeId: 2,
      toolReplay: true,
    }) as any;

    expect(runtime.planAsync).toHaveBeenCalled();
    expect(runtime.getTool).toHaveBeenCalledWith('business.record.query');
    expect(runtime.executeTool).toHaveBeenCalledWith(
      'business.record.query',
      { capabilityId: 'order.product.records.list' },
      expect.objectContaining({
        runId: 0,
        storeId: 2,
        role: 'manager',
      }),
    );
    expect(runtime.validateAnswer).toHaveBeenCalledWith(expect.objectContaining({
      question: '今天有哪些商品订单',
      answer: '返回 1 条商品订单记录，联系电话 138****5678。',
      toolResults: [
        expect.objectContaining({
          status: 'success',
          summary: '返回 1 条商品订单记录，联系电话 138****5678。',
          data: expect.objectContaining({
            accessToken: '已脱敏',
            items: [
              expect.objectContaining({
                customerPhone: '138****5678',
              }),
            ],
          }),
        }),
      ],
      renderedBlocks: expect.arrayContaining([
        expect.objectContaining({ kind: 'summary_text' }),
        expect.objectContaining({ kind: 'table' }),
        expect.objectContaining({ kind: 'evidence_panel' }),
      ]),
    }));
    expect(result.safety).toMatchObject({
      dryRun: true,
      toolExecution: true,
      readOnlyToolReplay: true,
      writeExecution: false,
    });
    expect(result.policyTrace).toMatchObject({
      overallStatus: 'pass',
      allowed: true,
      requiresApproval: false,
      checks: expect.arrayContaining([
        expect.objectContaining({ name: 'release_strategy', status: 'pass' }),
        expect.objectContaining({ name: 'tool_role', status: 'pass' }),
      ]),
    });
    expect(result.toolReplay).toMatchObject({
      requested: true,
      executed: true,
      mode: 'read_only_whitelist',
      results: [
        expect.objectContaining({
          summary: '返回 1 条商品订单记录，联系电话 138****5678。',
          data: expect.objectContaining({
            accessToken: '已脱敏',
            items: [
              expect.objectContaining({
                customerPhone: '138****5678',
              }),
            ],
          }),
        }),
      ],
    });
    expect(result.queryReplay).toMatchObject({
      requested: true,
      available: true,
      source: 'read_only_tool_replay',
      queryTraces: [
        expect.objectContaining({
          queryKey: 'order.product.records.list',
          sourceModel: 'ProductOrder',
        }),
      ],
      sqlSummaries: [
        expect.objectContaining({
          model: 'ProductOrder',
          sensitiveValuesRedacted: true,
        }),
      ],
    });
    expect(result.contractReplay).toMatchObject({
      requested: true,
      executed: true,
      answer: '返回 1 条商品订单记录，联系电话 138****5678。',
      answerContract: { valid: true, errors: [], warnings: [] },
    });
    expect(JSON.stringify(result)).not.toContain('13812345678');
    expect(JSON.stringify(result)).not.toContain('raw-token-should-not-render');
  });

  it('returns replay data in run detail', async () => {
    const { service, prisma } = createService();
    const plannerOutput = {
      plan: {
        capabilityPlan: { capabilityId: 'order.product.records.list', outputKinds: ['table', 'evidence_panel'] },
        toolPlan: [{ tool: 'business.record.query', args: { capabilityId: 'order.product.records.list' } }],
        outputContract: { requiredKinds: ['table', 'evidence_panel'] },
      },
      decision: {
        selected: {
          capabilityId: 'order.product.records.list',
          displayName: '商品订单记录查询',
          status: 'enabled',
          releaseStrategy: 'auto_publish',
          riskLevel: 'low',
          sourceModels: ['ProductOrder'],
          permissionCodes: ['core:order:view'],
          outputKinds: ['table', 'evidence_panel'],
          executor: { tool: 'business.record.query', queryKey: 'order.product.records' },
        },
        reason: '命中 V2 能力目录：商品订单记录查询。',
        candidates: [{ capabilityId: 'order.product.records.list', score: 0.91 }],
        excluded: [],
        boundaryWarnings: [],
        intent: {
          objects: ['Order'],
          domain: 'order',
          action: 'list',
          timeIntent: 'current',
          candidateCapabilities: ['order.product.records.list'],
          confidence: 0.91,
          trace: {
            source: 'kg_fallback',
            cacheHit: false,
            normalizedQuestion: '今天有哪些商品订单',
            objectHints: [{ objectId: 'business-object:order', objectType: 'Order', displayName: '订单', matchedTerms: ['订单'], sourceModels: ['ProductOrder'], score: 0.4 }],
            domainHints: [{ domain: 'order', displayName: '订单收银', reasons: ['object:订单'], score: 0.28 }],
            capabilityHints: [{ capabilityId: 'order.product.records.list', displayName: '商品订单记录查询', domain: 'order', outputKinds: ['table'], triggerTerms: ['商品订单'], score: 0.91 }],
            exclusions: [],
            llmPrompt: { graphContextCounts: { objectHints: 1, domainHints: 1, capabilityHints: 1, exclusions: 0, fieldHints: 3 } },
            llmResponse: { parsed: true, parsedKeys: ['candidateCapabilities'] },
          },
        },
      },
      architecture: 'agent_v2',
    };
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 1,
      runNo: 'ar_1',
      agentCode: 'agent_v2',
      status: 'completed',
      resultJson: {
        answer: '返回 1 条商品订单记录。',
        toolResults: [
          {
            data: {
              queryTrace: { engine: 'generic_query_engine', queryKey: 'order.product.records.list', sourceModel: 'ProductOrder' },
            },
          },
        ],
        renderedBlocks: [{ kind: 'table', title: '商品订单记录' }],
        answerContract: { valid: true, errors: [], warnings: [] },
      },
      evidenceJson: {
        source: ['ProductOrder'],
        sourceTables: ['ProductOrder'],
        filters: ['storeId=1'],
        fieldPolicy: { allowedFields: ['orderNo'], maskedFields: [], deniedFields: [], droppedFields: ['internalId'] },
        queryTraces: [{ engine: 'generic_query_engine', queryKey: 'order.product.records.list', sourceModel: 'ProductOrder' }],
      },
    });
    prisma.agentStep.findMany.mockResolvedValue([
      {
        stepType: 'planner',
        name: 'agent.v2.planner',
        status: 'success',
        outputJson: plannerOutput,
        startedAt: new Date('2026-07-05T10:00:00.000Z'),
        endedAt: new Date('2026-07-05T10:00:00.010Z'),
      },
      {
        stepType: 'tool',
        name: 'business.record.query',
        status: 'success',
        inputJson: { capabilityId: 'order.product.records.list' },
        outputJson: {
          evidence: { source: ['ProductOrder'], filters: ['storeId=1'] },
          policyChecks: [
            { name: 'status', status: 'pass', reason: '能力已启用。' },
            { name: 'permission', status: 'pass', reason: '权限码满足能力要求。' },
            { name: 'release_strategy', status: 'pass', reason: '发布策略允许当前只读能力自动返回。' },
          ],
          queryTrace: { engine: 'generic_query_engine', queryKey: 'order.product.records.list', sourceModel: 'ProductOrder' },
          sqlSummary: { dialect: 'prisma_sql_summary', model: 'ProductOrder', sensitiveValuesRedacted: true },
        },
        startedAt: new Date('2026-07-05T10:00:00.020Z'),
        endedAt: new Date('2026-07-05T10:00:00.080Z'),
      },
      {
        stepType: 'rendering',
        name: 'agent.v2.response.render',
        status: 'success',
        outputJson: { answerContract: { valid: true, errors: [], warnings: [] } },
        startedAt: new Date('2026-07-05T10:00:00.090Z'),
        endedAt: new Date('2026-07-05T10:00:00.100Z'),
      },
    ]);

    const detail = await service.getRunDetail(1);

    expect(detail.replay).toMatchObject({
      dryRun: false,
      runId: 1,
    });
    expect(detail.replay.phases.map((phase: any) => phase.key)).toEqual([
      'planner',
      'kg_preprocessing',
      'llm_prompt_response',
      'manifest_mapping',
      'policy_boundary',
      'tool_execution',
      'contract_and_rendering',
      'evidence_trace',
      'final_answer',
    ]);
    expect(detail.replay.phases.find((phase: any) => phase.key === 'kg_preprocessing')!.data).toMatchObject({
      available: true,
      source: 'kg_fallback',
      selectedIntent: { candidateCapabilities: ['order.product.records.list'] },
    });
    expect(detail.replay.phases.find((phase: any) => phase.key === 'llm_prompt_response')!.data).toMatchObject({
      available: true,
      response: { parsed: true },
    });
    expect(detail.replay.phases.find((phase: any) => phase.key === 'manifest_mapping')!.data).toMatchObject({
      selectedCapabilityId: 'order.product.records.list',
      releaseStrategy: 'auto_publish',
      requiredKinds: ['table', 'evidence_panel'],
    });
    expect(detail.replay.phases.find((phase: any) => phase.key === 'policy_boundary')!.data).toMatchObject({
      available: true,
      overallStatus: 'pass',
      checks: expect.arrayContaining([expect.objectContaining({ name: 'permission', status: 'pass' })]),
    });
    const toolPhase = detail.replay.phases.find((phase: any) => phase.key === 'tool_execution');
    expect(toolPhase).toBeDefined();
    expect(toolPhase!.data.sqlSummaries[0]).toMatchObject({
      dialect: 'prisma_sql_summary',
      model: 'ProductOrder',
    });
    expect(detail.replay.phases.find((phase: any) => phase.key === 'evidence_trace')!.data).toMatchObject({
      available: true,
      sourceModels: ['ProductOrder'],
      fieldPolicy: { droppedFields: ['internalId'] },
      queryTraces: expect.arrayContaining([expect.objectContaining({ queryKey: 'order.product.records.list' })]),
    });
  });

  it('calculates runtime health metrics from audit tables', async () => {
    const { service } = createService();

    const health = await service.healthMetrics({ days: 7, storeId: 1 });

    expect(health.runs).toMatchObject({
      total: 2,
      completed: 1,
      failed: 1,
      successRate: 0.5,
      runLatencyP99Ms: 1500,
    });
    expect(health.tools).toMatchObject({
      total: 2,
      highRiskAutoExecutionCount: 1,
      toolLatencyP99Ms: 300,
    });
    expect(health.strategy).toMatchObject({
      legacyFallbackCount: 1,
      sampleCount: 2,
    });
    expect(health.cache).toMatchObject({
      status: 'measured',
      hitRate: 0.5,
      sampleCount: 2,
    });
    expect(health.cost).toMatchObject({
      status: 'measured',
      sampleCount: 2,
      promptTokens: 1200,
      completionTokens: 300,
      totalTokens: 1500,
      totalChars: 4200,
      estimatedUsd: 0.0123,
    });
  });

  it('lists persisted eval runs from AgentEvalRun table', async () => {
    const { service, prisma } = createService();

    const result = await service.listPersistedEvalRuns({ page: 1, pageSize: 10, status: 'pass' });

    expect(prisma.agentEvalRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'pass' },
      take: 10,
    }));
    expect(result).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    });
  });

  it('merges persisted eval cases into eval case list', async () => {
    const { service, prisma } = createService();

    const result = await service.evalCases({ page: 1, pageSize: 5, priority: 'P1' });

    expect(prisma.agentEvalCase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { not: 'deleted' } },
      take: 500,
    }));
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '101',
        source: 'agent_eval_cases',
        question: '这个月人效怎么样',
        expectedCapabilityId: 'finance.staff-efficiency.metric',
        expectedObjects: expect.arrayContaining(['Finance', 'Staff']),
        evidenceRequired: true,
        permissionProfile: 'permission_needs_review',
        unsupportedAllowed: true,
        priority: 'P1',
      }),
    ]));
  });

  it('creates and updates persisted eval cases', async () => {
    const { service, prisma } = createService();

    const created = await service.createEvalCase({
      question: '帮我看一下员工人效',
      role: 'manager',
      priority: 'P1',
      expectedCapabilityId: 'finance.staff-efficiency.metric',
      expectedObjects: ['Finance', 'Staff'],
      expectedOutputKinds: ['kpi', 'evidence_panel'],
      evidenceRequired: true,
      permissionProfile: 'authorized_manager',
      unsupportedAllowed: false,
    });
    const updated = await service.updateEvalCase(101, {
      question: '这个月员工人效怎么样',
      expectedCapabilityId: 'finance.staff-efficiency.metric',
      priority: 'P0',
      evidenceRequired: ['runtime_evidence', 'field_policy'],
    });

    expect(prisma.agentEvalCase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        input: '帮我看一下员工人效',
        role: 'manager',
        expectedTool: 'finance.staff-efficiency.metric',
        expectedOutcome: expect.objectContaining({
          priority: 'P1',
          expectedObjects: ['Finance', 'Staff'],
          expectedOutputKinds: ['kpi', 'evidence_panel'],
          evidenceRequired: true,
          permissionProfile: 'authorized_manager',
          unsupportedAllowed: false,
        }),
      }),
    }));
    expect(prisma.agentEvalCase.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 101 },
      data: expect.objectContaining({
        input: '这个月员工人效怎么样',
        expectedTool: 'finance.staff-efficiency.metric',
        expectedOutcome: expect.objectContaining({
          priority: 'P0',
          evidenceRequired: ['runtime_evidence', 'field_policy'],
        }),
      }),
    }));
    expect(created).toMatchObject({ id: '102', question: '帮我看一下员工人效', priority: 'P1' });
    expect(updated).toMatchObject({ id: '101', question: '这个月员工人效怎么样', priority: 'P0' });
  });

  it('returns persisted eval run detail with failed gates and samples', async () => {
    const { service, prisma } = createService();

    const result = await service.getPersistedEvalRunDetail(12);

    expect(prisma.agentEvalRun.findFirst).toHaveBeenCalledWith({ where: { id: 12 } });
    expect(result).toMatchObject({
      id: 12,
      status: 'failed',
      summary: { totalQuestions: 650, p0Questions: 103, pass: false },
      failureCount: 3,
    });
    expect(result.failedGates).toHaveLength(1);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'gate_failed', category: 'gate_failed', title: 'P0 正确率' }),
      expect.objectContaining({ type: 'sample_failed', category: 'p0Unmapped', question: '这个月人效怎么样' }),
      expect.objectContaining({ type: 'sample_failed', category: 'p0WrongRouteRisk', actualCapabilityId: 'order.card-package.records.list' }),
    ]));
  });

  it('returns persisted eval run failures filtered by category', async () => {
    const { service } = createService();

    const result = await service.listPersistedEvalRunFailures(12, { category: 'p0WrongRouteRisk', page: 1, pageSize: 5 });

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 5,
      categories: {
        gate_failed: 1,
        p0Unmapped: 1,
      p0WrongRouteRisk: 1,
      },
      summary: '本次评测有 1 条失败或阻断样例。',
    });
    expect(result.items[0]).toMatchObject({
      category: 'p0WrongRouteRisk',
      expectedCapabilityId: 'card.usage.records.list',
      actualCapabilityId: 'order.card-package.records.list',
    });
  });

  it('replays a persisted eval run failure through dry-run debug planning', async () => {
    const { service, runtime } = createService();

    const result = await service.replayEvalRunFailure(12, { category: 'p0WrongRouteRisk', index: 0, storeId: 2 });

    expect(runtime.plan).toHaveBeenCalledWith(expect.objectContaining({
      message: '今天核销记录',
      actor: expect.objectContaining({
        storeId: 2,
        role: 'manager',
        entrypoint: 'agent_governance_eval_replay',
      }),
      context: expect.objectContaining({
        debug: true,
        dryRun: true,
        agentV2GrayMode: 'kg_llm_preferred',
      }),
    }));
    expect(result.comparison).toMatchObject({
      expectedCapabilityId: 'card.usage.records.list',
      previousActualCapabilityId: 'order.card-package.records.list',
      replayCapabilityId: 'order.product.records.list',
      previousMatchedExpected: false,
      replayMatchedExpected: false,
      changedFromPrevious: true,
    });
    expect(result.diagnosis).toMatchObject({
      category: 'p0WrongRouteRisk',
      status: 'route_changed_but_not_expected',
    });
    expect(result.safety).toMatchObject({
      dryRun: true,
      toolExecution: false,
      writeExecution: false,
    });
    expect(result.toolReplay).toMatchObject({
      requested: false,
      executed: false,
      mode: 'planning_only',
    });
    expect(result.contractReplay).toMatchObject({
      requested: false,
      executed: false,
      reason: 'tool_replay_not_requested',
    });
    expect(runtime.executeTool).not.toHaveBeenCalled();
    expect(runtime.validateAnswer).not.toHaveBeenCalled();
  });

  it('replays a persisted eval run failure with read-only tool execution when requested', async () => {
    const { service, runtime } = createService();

    const result = await service.replayEvalRunFailure(12, {
      category: 'p0WrongRouteRisk',
      index: 0,
      storeId: 2,
      toolReplay: true,
    });

    expect(runtime.getTool).toHaveBeenCalledWith('business.record.query');
    expect(runtime.executeTool).toHaveBeenCalledWith(
      'business.record.query',
      { capabilityId: 'order.product.records.list' },
      expect.objectContaining({
        runId: 0,
        storeId: 2,
        role: 'manager',
      }),
    );
    expect(result.toolReplay).toMatchObject({
      requested: true,
      executed: true,
      mode: 'read_only_whitelist',
      results: [
        expect.objectContaining({
          tool: 'business.record.query',
          status: 'success',
          summary: '返回 1 条商品订单记录，联系电话 138****5678。',
          data: expect.objectContaining({
            accessToken: '已脱敏',
            items: [
              expect.objectContaining({
                customerPhone: '138****5678',
              }),
            ],
          }),
        }),
      ],
    });
    expect(result.queryReplay).toMatchObject({
      requested: true,
      available: true,
      queryTraces: [
        expect.objectContaining({
          queryKey: 'order.product.records.list',
          sourceModel: 'ProductOrder',
        }),
      ],
      sqlSummaries: [
        expect.objectContaining({
          statementPreview: expect.stringContaining('ProductOrder'),
          sensitiveValuesRedacted: true,
        }),
      ],
    });
    expect(runtime.validateAnswer).toHaveBeenCalledWith(expect.objectContaining({
      question: '今天核销记录',
      answer: '返回 1 条商品订单记录，联系电话 138****5678。',
      toolResults: [
        expect.objectContaining({
          status: 'success',
          summary: '返回 1 条商品订单记录，联系电话 138****5678。',
        }),
      ],
      renderedBlocks: expect.arrayContaining([
        expect.objectContaining({ kind: 'summary_text' }),
        expect.objectContaining({ kind: 'table' }),
        expect.objectContaining({ kind: 'evidence_panel' }),
      ]),
    }));
    expect(result.contractReplay).toMatchObject({
      requested: true,
      executed: true,
      answer: '返回 1 条商品订单记录，联系电话 138****5678。',
      answerContract: { valid: true },
      renderedBlocks: expect.arrayContaining([
        expect.objectContaining({ kind: 'table' }),
        expect.objectContaining({ kind: 'evidence_panel' }),
      ]),
    });
    expect(result.safety).toMatchObject({
      dryRun: true,
      toolExecution: true,
      readOnlyToolReplay: true,
      writeExecution: false,
    });
    expect(JSON.stringify(result)).not.toContain('13812345678');
    expect(JSON.stringify(result)).not.toContain('raw-token-should-not-render');
  });

  it('skips non-whitelisted tools during eval failure tool replay', async () => {
    const { service, runtime } = createService();
    runtime.plan.mockReturnValueOnce({
      decision: {
        selected: { capabilityId: 'card.package.followup.draft' },
        confidence: 0.88,
        reason: '命中跟进草稿。',
      },
      plan: { toolPlan: [{ tool: 'business.action.draft', args: { capabilityId: 'card.package.followup.draft' } }] },
    });

    const result = await service.replayEvalRunFailure(12, {
      category: 'p0WrongRouteRisk',
      index: 0,
      storeId: 2,
      toolReplay: true,
    });

    expect(runtime.executeTool).not.toHaveBeenCalled();
    expect(result.toolReplay).toMatchObject({
      requested: true,
      executed: false,
      mode: 'read_only_whitelist',
      skipped: [
        {
          tool: 'business.action.draft',
          reason: 'not_in_read_only_replay_whitelist',
        },
      ],
    });
    expect(result.contractReplay).toMatchObject({
      requested: true,
      executed: false,
      reason: 'no_tool_results',
    });
    expect(result.safety).toMatchObject({
      toolExecution: false,
      readOnlyToolReplay: false,
      writeExecution: false,
    });
  });

  it('creates a manual persisted eval run from latest gate report', async () => {
    const { service, prisma } = createService();

    const result = await service.createEvalRun({ requestedBy: 8, note: 'manual smoke' });

    expect(prisma.agentEvalRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'pass',
        score: 1,
        resultJson: expect.objectContaining({
          trigger: 'manual_governance_api',
          requestedBy: 8,
          note: 'manual smoke',
          summary: expect.objectContaining({ pass: true }),
        }),
      }),
    }));
    expect(result).toMatchObject({
      id: 10,
      status: 'pass',
      totalQuestions: 650,
      p0Questions: 103,
      trigger: 'manual_governance_api',
    });
  });

  it('creates a dry-run batch eval run from persisted cases', async () => {
    const { service, prisma, runtime } = createService();

    const result = await service.runEvalDryRunBatch({ priority: 'P1', limit: 1, requestedBy: 8, note: 'batch smoke' });

    expect(runtime.plan).toHaveBeenCalledWith(expect.objectContaining({
      message: '这个月人效怎么样',
      actor: expect.objectContaining({
        role: 'manager',
        entrypoint: 'agent_governance_eval_batch',
      }),
      context: expect.objectContaining({
        debug: true,
        dryRun: true,
        agentV2GrayMode: 'kg_llm_preferred',
      }),
    }));
    expect(prisma.agentEvalRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'failed',
        score: 0,
        resultJson: expect.objectContaining({
          trigger: 'manual_governance_eval_batch',
          requestedBy: 8,
          note: 'batch smoke',
          summary: expect.objectContaining({
            totalQuestions: 1,
            wrongRoute: 1,
          }),
          samples: expect.objectContaining({
            p0WrongRouteRisk: [
              expect.objectContaining({
                question: '这个月人效怎么样',
                expectedCapabilityId: 'finance.staff-efficiency.metric',
                actualCapabilityId: 'order.product.records.list',
                outcome: 'wrong_route',
              }),
            ],
          }),
          safety: expect.objectContaining({
            dryRun: true,
            toolExecution: false,
            writeExecution: false,
          }),
        }),
      }),
    }));
    expect(result).toMatchObject({
      id: 10,
      status: 'failed',
      totalQuestions: 1,
      source: 'agent_governance_dry_run_batch',
      trigger: 'manual_governance_eval_batch',
    });
  });

  it('imports the latest eval gate report into AgentEvalRun table', async () => {
    const { service, prisma } = createService();

    const result = await service.importLatestEvalGateReport({ requestedBy: 7 });

    expect(prisma.agentEvalRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'pass',
        score: 1,
        resultJson: expect.objectContaining({
          source: 'agent-v2-eval-gate-report.json',
          importedBy: 7,
          summary: expect.objectContaining({ pass: true }),
        }),
      }),
    }));
    expect(result).toMatchObject({
      id: 10,
      status: 'pass',
      totalQuestions: 650,
      p0Questions: 103,
    });
  });
});
