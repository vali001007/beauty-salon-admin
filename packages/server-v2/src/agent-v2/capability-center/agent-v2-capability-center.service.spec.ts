import { AgentV2CapabilityCenterService } from './agent-v2-capability-center.service.js';

const makeDraft = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  capabilityId: 'order.product.records.list',
  status: 'approved',
  source: 'auto_scan_draft',
  displayName: '商品订单查询',
  displayNameZh: '商品订单查询',
  description: '查询商品订单记录。',
  domain: 'order',
  businessObject: 'ProductOrder',
  actionCodes: ['list', 'summary'],
  personaCodes: ['manager'],
  releaseStrategy: 'auto_publish',
  riskLevel: 'low',
  permissionSource: 'controller',
  permissionCodes: ['core:order:view'],
  sourceModels: ['ProductOrder'],
  sourceApis: ['GET /orders/products'],
  sourceDtos: [],
  sourceRoutes: ['/orders/products'],
  outputKinds: ['table', 'evidence_panel'],
  executorJson: {
    type: 'business_record_query',
    tool: 'business.record.query',
    queryKey: 'order.product.records',
  },
  storeScope: 'required',
  fieldPoliciesJson: [],
  triggerKeywords: ['商品订单'],
  examples: ['今天有哪些商品订单'],
  negativeExamples: [],
  boundaryNotes: [],
  governanceIssues: [],
  ...overrides,
});

const makeRegistry = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  queryKey: 'order.product.records',
  toolName: 'business.record.query',
  domain: 'order',
  businessObject: 'ProductOrder',
  status: 'draft',
  source: 'auto_scan',
  implementationRef: null,
  ...overrides,
});

describe('AgentV2CapabilityCenterService', () => {
  function createService(toolResult: Record<string, unknown>) {
    const prisma = {
      agentCapabilityDraft: {
        findUnique: jest.fn().mockResolvedValue(makeDraft()),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(makeDraft(data))),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      agentCapabilityReview: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      agentCapabilityPublishRun: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      agentCapabilityManifestVersion: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 1, version: 'cap-new-version' }),
      },
      agentCapabilityManifestItem: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      agentToolQueryKeyRegistry: {
        findUnique: jest.fn().mockResolvedValue(makeRegistry()),
        update: jest.fn().mockResolvedValue(makeRegistry()),
      },
    } as any;
    prisma.$transaction = jest.fn((task) => task(prisma));
    const toolRegistry = {
      get: jest.fn().mockReturnValue({ name: 'business.record.query' }),
      execute: jest.fn().mockResolvedValue(toolResult),
    };
    const manifestProvider = {
      refreshFromDatabase: jest.fn(),
      getActiveVersion: jest.fn().mockReturnValue('cap-test-version'),
      listManifests: jest.fn().mockReturnValue([]),
    };
    const runtime = {
      plan: jest.fn().mockReturnValue({
        decision: {
          selected: { capabilityId: 'order.product.records.list' },
          confidence: 0.91,
          reason: '命中商品订单示例问法。',
        },
        plan: {
          toolPlan: [
            {
              tool: 'business.record.query',
              args: {
                capabilityId: 'order.product.records.list',
                queryKey: 'order.product.records',
              },
            },
          ],
        },
      }),
      executeTool: jest.fn().mockResolvedValue(toolResult),
    };

    return {
      service: new AgentV2CapabilityCenterService(prisma as any, toolRegistry as any, manifestProvider as any, runtime as any),
      prisma,
      toolRegistry,
      manifestProvider,
      runtime,
    };
  }

  it('marks queryKey as implemented when dry-run reaches a supported tool branch', async () => {
    const { service, prisma, toolRegistry } = createService({
      status: 'success',
      title: '商品订单记录',
      summary: '已返回授权后的订单证据包。',
      evidence: { source: ['ProductOrder'], sampleSize: 1 },
      actions: [],
    });

    const result = await service.dryRunDraft('order.product.records.list', { storeId: 1, userId: 7 });

    expect(result.pass).toBe(true);
    expect(toolRegistry.execute).toHaveBeenCalledWith(
      'business.record.query',
      expect.objectContaining({
        capabilityId: 'order.product.records.list',
        queryKey: 'order.product.records',
        dryRun: true,
        limit: 1,
      }),
      expect.objectContaining({ storeId: 1, userId: 7, role: 'manager' }),
    );
    expect(prisma.agentToolQueryKeyRegistry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { queryKey: 'order.product.records' },
      data: expect.objectContaining({ status: 'implemented' }),
    }));
  });

  it('blocks publication when the registered tool does not support the capabilityId', async () => {
    const { service, prisma } = createService({
      status: 'unsupported',
      title: '暂不支持',
      summary: '工具尚未实现该能力分支。',
      evidence: { source: ['AgentV2ToolRegistry'], sampleSize: 0 },
      actions: [],
    });

    const result = await service.dryRunDraft('order.product.records.list', { storeId: 1 });

    expect(result.pass).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'tool_capability_unsupported', level: 'block' }),
    ]));
    expect(prisma.agentToolQueryKeyRegistry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { queryKey: 'order.product.records' },
      data: expect.objectContaining({ status: 'needs_development' }),
    }));
  });

  it('auto-governs low-risk read capabilities into approved when all gates pass', async () => {
    const { service, prisma } = createService({
      status: 'success',
      title: '商品订单记录',
      summary: '已返回授权后的订单证据包。',
      evidence: { source: ['ProductOrder'], sampleSize: 1 },
      actions: [],
    });
    prisma.agentCapabilityDraft.findMany.mockResolvedValueOnce([makeDraft({ status: 'draft' })]);
    jest.spyOn(service, 'runEvalGate').mockResolvedValueOnce({
      generatedAt: new Date(),
      pass: true,
      scope: 'selected',
      capabilityIds: ['order.product.records.list'],
      source: { evalDrafts: 'test', governance: 'test' },
      summary: {
        totalQuestions: 1,
        scopedQuestions: 1,
        p0Questions: 1,
        p0Unmapped: 0,
        p0PermissionNeedsReview: 0,
        p0ContractNotPass: 0,
        p0WrongRouteRisk: 0,
        highRiskAutoPublish: 0,
        inferredPermission: 0,
      },
      gates: [],
      samples: {},
    } as any);

    const result = await service.autoGovernance({ mode: 'open', requestedBy: 7, storeId: 1 });

    expect(result.summary.byStatus.approved).toBe(1);
    expect(prisma.agentCapabilityDraft.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { capabilityId: 'order.product.records.list' },
      data: expect.objectContaining({ status: 'approved', reviewedBy: 7 }),
    }));
    expect(prisma.agentCapabilityReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ decision: 'approve', reviewerId: 7 }),
    }));
  });

  it('auto-governs unsupported tool branches into needs_development', async () => {
    const { service, prisma } = createService({
      status: 'unsupported',
      title: '暂不支持',
      summary: '工具尚未实现该能力分支。',
      evidence: { source: ['AgentV2ToolRegistry'], sampleSize: 0 },
      actions: [],
    });
    prisma.agentCapabilityDraft.findMany.mockResolvedValueOnce([makeDraft({ status: 'draft' })]);

    const result = await service.autoGovernance({ mode: 'open', requestedBy: 7, storeId: 1 });

    expect(result.summary.byStatus.needs_development).toBe(1);
    expect(prisma.agentCapabilityDraft.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { capabilityId: 'order.product.records.list' },
      data: expect.objectContaining({ status: 'needs_development', reviewedBy: 7 }),
    }));
    expect(prisma.agentCapabilityReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ decision: 'needs_development' }),
    }));
  });

  it('auto-governs dynamic detail and page context drafts into approved when dry-run passes', async () => {
    const { service, prisma, toolRegistry } = createService({
      status: 'success',
      title: '客户详情',
      summary: '已返回详情证据包。',
      evidence: { source: ['Customer'], sampleSize: 1 },
      actions: [],
    });
    const detailDraft = makeDraft({
        id: 2,
        capabilityId: 'customer.customers.id.detail',
        status: 'draft',
        displayName: '客户详情',
        displayNameZh: '客户详情',
        domain: 'customer',
        businessObject: 'Customer',
        actionCodes: ['lookup'],
        permissionCodes: ['core:customer:view'],
        sourceModels: ['Customer'],
        sourceApis: ['GET /customers/:id'],
        outputKinds: ['detail', 'evidence_panel'],
        executorJson: {
          type: 'business_detail_query',
          tool: 'business.detail.query',
          queryKey: 'auto.detail',
        },
        fieldPoliciesJson: [{ field: 'name', label: '客户姓名', visibility: 'allow', reason: '详情展示字段' }],
        examples: ['查看客户 id 1 的详情'],
      });
    const pageContextDraft = makeDraft({
        id: 3,
        capabilityId: 'customer.customer.marketing.workbench.page.context',
        status: 'draft',
        displayName: '营销工作台页面语义',
        displayNameZh: '营销工作台页面语义',
        domain: 'customer',
        businessObject: 'Workbench',
        actionCodes: ['lookup'],
        permissionCodes: ['core:marketing:view'],
        sourceModels: ['Customer'],
        sourceApis: [],
        outputKinds: ['evidence_panel'],
        executorJson: {
          type: 'business_detail_query',
          tool: 'business.detail.query',
          queryKey: 'customer.customer.marketing.workbench.page.context',
        },
        fieldPoliciesJson: [],
        examples: ['营销工作台能做什么'],
      });
    prisma.agentCapabilityDraft.findMany.mockResolvedValueOnce([detailDraft, pageContextDraft]);
    prisma.agentCapabilityDraft.findUnique.mockImplementation(({ where }: any) => {
      if (where.capabilityId === 'customer.customers.id.detail') return Promise.resolve(detailDraft);
      if (where.capabilityId === 'customer.customer.marketing.workbench.page.context') return Promise.resolve(pageContextDraft);
      return Promise.resolve(makeDraft());
    });
    prisma.agentToolQueryKeyRegistry.findUnique.mockImplementation(({ where }: any) => Promise.resolve(makeRegistry({
      queryKey: where.queryKey,
      toolName: 'business.detail.query',
    })));
    toolRegistry.get.mockReturnValue({ name: 'business.detail.query' });
    jest.spyOn(service, 'runEvalGate').mockResolvedValue({
      generatedAt: new Date(),
      pass: true,
      scope: 'selected',
      capabilityIds: [],
      source: { evalDrafts: 'test', governance: 'test' },
      summary: {
        totalQuestions: 1,
        scopedQuestions: 1,
        p0Questions: 1,
        p0Unmapped: 0,
        p0PermissionNeedsReview: 0,
        p0ContractNotPass: 0,
        p0WrongRouteRisk: 0,
        highRiskAutoPublish: 0,
        inferredPermission: 0,
      },
      gates: [],
      samples: {},
    } as any);

    const result = await service.autoGovernance({ mode: 'open', requestedBy: 7, storeId: 1 });

    expect(result.summary.byStatus).toEqual({ approved: 2 });
    expect(prisma.agentCapabilityDraft.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { capabilityId: 'customer.customers.id.detail' },
      data: expect.objectContaining({ status: 'approved' }),
    }));
    expect(prisma.agentCapabilityDraft.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { capabilityId: 'customer.customer.marketing.workbench.page.context' },
      data: expect.objectContaining({ status: 'approved' }),
    }));
  });

  it('normalizes read-only permission overrides for scanned customer drafts', async () => {
    const { service, prisma } = createService({
      status: 'success',
      title: '客户事件',
      summary: '已返回客户事件。',
      evidence: { source: ['Customer'], sampleSize: 1 },
      actions: [],
    });
    prisma.agentCapabilityDraft.findUnique.mockResolvedValueOnce(makeDraft({ capabilityId: 'customer.customer.app.events.records.list' }));

    await service.updateDraft('customer.customer.app.events.records.list', {
      capabilityId: 'customer.customer.app.events.records.list',
      permissionCodes: ['core:marketing:update'],
      sourceApis: ['GET /customer-app/admin/events/paginated'],
      actions: ['list', 'summary'],
      outputKinds: ['table', 'evidence_panel'],
      executor: { type: 'business_record_query', tool: 'business.record.query', queryKey: 'auto.records' },
    });

    expect(prisma.agentCapabilityDraft.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        permissionCodes: ['core:marketing:view'],
      }),
    }));
  });

  it('moves approved drafts back to needs_development when publish dry-run fails', async () => {
    const { service, prisma } = createService({
      status: 'unsupported',
      title: '暂不支持',
      summary: '工具尚未实现该能力分支。',
      evidence: { source: ['AgentV2ToolRegistry'], sampleSize: 0 },
      actions: [],
    });
    prisma.agentCapabilityDraft.findMany.mockResolvedValueOnce([makeDraft({ status: 'approved' })]);

    await expect(service.publish({
      capabilityIds: ['order.product.records.list'],
      publishedBy: 7,
    })).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'queryKey dry-run 未通过，不能发布。' }),
    });

    expect(prisma.agentCapabilityDraft.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { capabilityId: 'order.product.records.list' },
      data: expect.objectContaining({ status: 'needs_development', reviewedBy: 7 }),
    }));
    expect(prisma.agentCapabilityReview.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        decision: 'needs_development',
        comment: '发布前 queryKey dry-run 未通过，已自动移出已审核池。',
      }),
    }));
  });

  it('publishes by merging current DB active manifests with selected drafts only', async () => {
    const { service, prisma, manifestProvider } = createService({
      status: 'success',
      title: '商品订单记录',
      summary: '已返回授权后的订单证据包。',
      evidence: { source: ['ProductOrder'], sampleSize: 1 },
      actions: [],
    });
    const activeDbManifest = {
      capabilityId: 'finance.daily-settlement.metric',
      version: 'cap-active',
      status: 'enabled',
      source: 'manual_builtin',
      displayName: '日结报表指标查询',
      description: '查询日结指标。',
      domain: 'finance',
      businessObject: 'DailySettlement',
      personaCodes: ['manager'],
      actions: ['summary'],
      sourceModels: ['DailySettlement'],
      sourceApis: ['GET /finance/daily-settlement'],
      outputKinds: ['kpi', 'evidence_panel'],
      executor: { type: 'business_metric_query', tool: 'business.metric.query', queryKey: 'finance.daily-settlement.metric' },
      storeScope: 'required',
      permissionCodes: ['core:finance:view'],
      fieldPolicies: [{ field: 'netAmount', label: '净收', visibility: 'allow', reason: '指标展示字段' }],
      riskLevel: 'low',
      releaseStrategy: 'auto_publish',
      examples: ['今天营业额'],
      negativeExamples: [],
      triggerKeywords: ['日结'],
      boundaryNotes: [],
    };
    manifestProvider.listManifests.mockReturnValue([activeDbManifest]);
    prisma.agentCapabilityDraft.findMany.mockResolvedValueOnce([makeDraft({ status: 'approved' })]);
    jest.spyOn(service, 'runEvalGate').mockResolvedValueOnce({
      generatedAt: new Date(),
      pass: true,
      scope: 'selected',
      capabilityIds: ['order.product.records.list'],
      source: { evalDrafts: 'test', governance: 'test' },
      summary: {
        totalQuestions: 1,
        scopedQuestions: 1,
        p0Questions: 1,
        p0Unmapped: 0,
        p0PermissionNeedsReview: 0,
        p0ContractNotPass: 0,
        p0WrongRouteRisk: 0,
        highRiskAutoPublish: 0,
        inferredPermission: 0,
      },
      gates: [],
      samples: {},
    } as any);

    const result = await service.publish({ capabilityIds: ['order.product.records.list'], publishedBy: 7 });

    expect(result.itemCount).toBe(2);
    expect(manifestProvider.refreshFromDatabase).toHaveBeenCalled();
    const createManyData = prisma.agentCapabilityManifestItem.createMany.mock.calls[0][0].data;
    expect(createManyData.map((item: any) => item.capabilityId).sort()).toEqual([
      'finance.daily-settlement.metric',
      'order.product.records.list',
    ]);
    expect(createManyData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: 'inventory.scrap.records.list' }),
    ]));
    expect(createManyData.find((item: any) => item.capabilityId === 'order.product.records.list').manifestJson.fieldPolicies).toEqual([]);
  });

  it('blocks publish when manifest fieldPolicies contain stringified objects', async () => {
    const { service, prisma } = createService({
      status: 'success',
      title: '商品订单记录',
      summary: '已返回授权后的订单证据包。',
      evidence: { source: ['ProductOrder'], sampleSize: 1 },
      actions: [],
    });
    prisma.agentCapabilityDraft.findMany.mockResolvedValueOnce([
      makeDraft({ status: 'approved', fieldPoliciesJson: ['[object Object]'] }),
    ]);
    jest.spyOn(service, 'runEvalGate').mockResolvedValueOnce({
      generatedAt: new Date(),
      pass: true,
      scope: 'selected',
      capabilityIds: ['order.product.records.list'],
      source: { evalDrafts: 'test', governance: 'test' },
      summary: {
        totalQuestions: 1,
        scopedQuestions: 1,
        p0Questions: 1,
        p0Unmapped: 0,
        p0PermissionNeedsReview: 0,
        p0ContractNotPass: 0,
        p0WrongRouteRisk: 0,
        highRiskAutoPublish: 0,
        inferredPermission: 0,
      },
      gates: [],
      samples: {},
    } as any);

    await expect(service.publish({ capabilityIds: ['order.product.records.list'], publishedBy: 7 })).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Manifest JSON 校验未通过，不能发布。' }),
    });
    expect(prisma.agentCapabilityManifestVersion.create).not.toHaveBeenCalled();
    expect(prisma.agentCapabilityPublishRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', errorMessage: 'Manifest JSON 校验未通过。' }),
    }));
  });

  it('passes post-publish smoke test when Agent V2 routes to the published capability and tool succeeds', async () => {
    const { service, prisma, manifestProvider, runtime } = createService({
      status: 'success',
      title: '商品订单记录',
      summary: '已返回授权后的订单证据包。',
      evidence: { source: ['ProductOrder'], sampleSize: 1 },
      actions: [],
    });
    prisma.agentCapabilityDraft.findUnique.mockResolvedValueOnce(makeDraft({ status: 'published' }));

    const result = await service.runPostPublishSmokeTest('order.product.records.list', { storeId: 1, userId: 7 });

    expect(result.pass).toBe(true);
    expect(manifestProvider.refreshFromDatabase).toHaveBeenCalled();
    expect(runtime.plan).toHaveBeenCalledWith(expect.objectContaining({
      message: '今天有哪些商品订单',
      actor: expect.objectContaining({ storeId: 1, userId: 7, role: 'manager' }),
    }));
    expect(runtime.executeTool).toHaveBeenCalledWith(
      'business.record.query',
      expect.objectContaining({
        capabilityId: 'order.product.records.list',
        queryKey: 'order.product.records',
        dryRun: true,
      }),
      expect.objectContaining({ storeId: 1, userId: 7, role: 'manager' }),
    );
    expect(result.activeManifestVersion).toBe('cap-test-version');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'post_publish_smoke_pass', level: 'pass' }),
    ]));
  });

  it('keeps auto publish scoped to auto_publish candidates even when capability IDs are provided', async () => {
    const { service, prisma } = createService({
      status: 'success',
      title: '商品订单记录',
      summary: '已返回授权后的订单证据包。',
      evidence: { source: ['ProductOrder'], sampleSize: 1 },
      actions: [],
    });

    await expect(service.publish({
      mode: 'auto',
      capabilityIds: ['marketing.coupon.issue.blocked'],
      publishedBy: 7,
    })).rejects.toThrow('没有可发布的候选能力');

    expect(prisma.agentCapabilityDraft.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        capabilityId: { in: ['marketing.coupon.issue.blocked'] },
        releaseStrategy: 'auto_publish',
        status: { in: ['draft', 'approved'] },
      }),
    }));
  });

  it('classifies scanner drafts into local release strategies before production hooks are configured', async () => {
    const { service, prisma } = createService({
      status: 'success',
      title: '商品订单记录',
      summary: '已返回授权后的订单证据包。',
      evidence: { source: ['ProductOrder'], sampleSize: 1 },
      actions: [],
    });

    await service.updateDraft('order.product.records.list', {
      sourceApis: ['GET /api/orders/products'],
      actions: ['list'],
      permissionCodes: [],
      outputKinds: ['table', 'evidence_panel'],
      executor: {
        type: 'business_record_query',
        tool: 'business.record.query',
        queryKey: 'order.product.records',
      },
    });
    expect(prisma.agentCapabilityDraft.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'needs_review',
        releaseStrategy: 'auto_publish',
        governanceIssues: expect.arrayContaining([
          expect.objectContaining({ code: 'missing_permission_needs_review' }),
        ]),
      }),
    }));

    await service.updateDraft('order.product.records.list', {
      sourceApis: ['POST /api/marketing/coupons/issue'],
      actions: ['confirm_action'],
      riskLevel: 'high',
      permissionCodes: ['core:marketing:manage'],
      outputKinds: ['action_card', 'evidence_panel'],
      executor: { type: 'workflow', tool: 'marketing.coupon.issue' },
    });
    expect(prisma.agentCapabilityDraft.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'draft',
        releaseStrategy: 'write_blocked',
        governanceIssues: expect.arrayContaining([
          expect.objectContaining({ code: 'write_operation_blocked' }),
        ]),
      }),
    }));

    await service.updateDraft('order.product.records.list', {
      sourceApis: ['POST /api/inventory/stock-operation-drafts'],
      actions: ['draft'],
      permissionCodes: ['core:inventory:adjustment'],
      outputKinds: ['action_card', 'evidence_panel'],
      executor: { type: 'business_action_draft', tool: 'business.action.draft', queryKey: 'inventory.stock-operation-draft' },
    });
    expect(prisma.agentCapabilityDraft.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'draft',
        releaseStrategy: 'approval_required',
      }),
    }));
  });
});
