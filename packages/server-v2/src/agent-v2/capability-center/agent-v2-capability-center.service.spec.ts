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
      },
      agentToolQueryKeyRegistry: {
        findUnique: jest.fn().mockResolvedValue(makeRegistry()),
        update: jest.fn().mockResolvedValue(makeRegistry()),
      },
    };
    const toolRegistry = {
      get: jest.fn().mockReturnValue({ name: 'business.record.query' }),
      execute: jest.fn().mockResolvedValue(toolResult),
    };
    const manifestProvider = {
      refreshFromDatabase: jest.fn(),
      getActiveVersion: jest.fn().mockReturnValue('cap-test-version'),
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
});
