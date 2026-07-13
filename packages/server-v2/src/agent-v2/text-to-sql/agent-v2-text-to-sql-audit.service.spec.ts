import { AgentV2TextToSqlAuditService } from './agent-v2-text-to-sql-audit.service.js';
import type { AgentV2TextToSqlResult } from './agent-v2-text-to-sql.types.js';

describe('AgentV2TextToSqlAuditService', () => {
  const prisma = {
    agentV2TextToSqlRun: {
      create: jest.fn().mockResolvedValue({ id: 7 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    agentV2TextToSqlFeedback: {
      create: jest.fn().mockResolvedValue({ id: 3 }),
    },
    $transaction: jest.fn((tasks: Array<Promise<unknown>>) => Promise.all(tasks)),
  } as any;
  const service = new AgentV2TextToSqlAuditService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records blocked runs with redacted sql and hashes', async () => {
    const result: AgentV2TextToSqlResult = {
      status: 'blocked',
      rows: [],
      evidence: {
        sourceViews: ['agent_v2_order_item_sales_view'],
        storeScope: '限定门店：1',
        fieldPolicies: [],
        limitations: ['只读'],
      },
      queryTrace: {
        executionMode: 'dry_run',
        rowCount: 0,
        planner: {
          status: 'planned',
          intent: { domain: 'product', type: 'ranking' },
          selectedViews: ['agent_v2_order_item_sales_view'],
          generatedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view;',
          parameters: {},
          explanation: 'test',
        },
        guard: {
          status: 'blocked',
          reasonCode: 'permission_denied',
          message: '缺少权限',
          redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view;',
          appliedPolicies: ['semantic_view_whitelist'],
        },
      },
      blockedReason: 'permission_denied',
    };

    await expect(service.record({ question: '本月销量最好的商品', result, userId: 1 })).resolves.toBe('7');
    expect(prisma.agentV2TextToSqlRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          question: '本月销量最好的商品',
          status: 'blocked',
          blockedReason: 'permission_denied',
          generatedSqlHash: expect.any(String),
          safeSqlHash: null,
          redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view;',
        }),
      }),
    );
  });

  it('writes feedback for a run', async () => {
    await service.createFeedback({
      runId: 7,
      userId: 1,
      rating: 1,
      feedbackText: '答案不对，疑似缺少退款过滤',
      isUseful: false,
      isWrongAnswer: true,
      isPermissionConcern: true,
    });

    expect(prisma.agentV2TextToSqlFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: 7,
        userId: 1,
        rating: 1,
        feedbackText: '答案不对，疑似缺少退款过滤',
        isUseful: false,
        isWrongAnswer: true,
        isPermissionConcern: true,
      }),
    });
  });
});
