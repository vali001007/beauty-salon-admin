import { BrainTaskExecutorService } from './orchestrator/brain-task-executor.service.js';
import type { BrainTaskPlan } from './orchestrator/brain-task.types.js';

describe('BrainTaskExecutorService', () => {
  const context = {
    userId: 9,
    storeId: 2,
    visibleStoreIds: [2],
    permissions: ['*'],
    deniedPermissions: [],
    requestId: 'req',
    timezone: 'Asia/Shanghai',
  };
  const cognition = {
    normalizedText: '',
    terms: [],
    metrics: [],
    dimensions: [],
    entities: [],
    unsupportedTerms: [],
    intent: { key: 'general_assistant', confidence: 0.5, reason: 'test' },
    needsClarification: false,
  };
  const runtimeIntent = { intent: 'diagnosis', expectedShape: 'non_metric', allowsScalarMetric: false, reason: 'test' };

  function plan(timeoutMs = 1000): BrainTaskPlan {
    return {
      planKey: 'test_parallel',
      objective: '并行测试',
      reason: 'test',
      isComposite: true,
      nodes: [
        {
          id: 'finance',
          role: 'finance',
          kind: 'adapter',
          adapterKey: 'finance_risk',
          intent: 'diagnosis',
          answerShape: 'non_metric',
          prompt: '财务分析',
          dependencies: [],
          requiredPermissions: [],
          timeoutMs,
          maxRetries: 0,
        },
        {
          id: 'inventory',
          role: 'inventory',
          kind: 'adapter',
          adapterKey: 'inventory_procurement',
          intent: 'diagnosis',
          answerShape: 'non_metric',
          prompt: '库存分析',
          dependencies: [],
          requiredPermissions: [],
          timeoutMs,
          maxRetries: 0,
        },
        {
          id: 'supervisor_summary',
          role: 'supervisor',
          kind: 'summary',
          intent: 'diagnosis',
          answerShape: 'non_metric',
          prompt: '汇总',
          dependencies: [
            { nodeId: 'finance', required: false },
            { nodeId: 'inventory', required: false },
          ],
          requiredPermissions: [],
          timeoutMs: 100,
          maxRetries: 0,
        },
      ],
    };
  }

  it('executes independent adapter nodes concurrently and records every node', async () => {
    let active = 0;
    let maxActive = 0;
    const adapter = {
      canHandle: jest.fn(() => true),
      execute: jest.fn(async (input) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return {
          status: 'completed',
          answer: `${input.plan.adapterKey} 完成`,
          citations: [{ sourceType: 'skill', sourceId: String(input.plan.adapterKey) }],
          grounding: 'db_skill',
        };
      }),
    };
    const registry = { resolve: jest.fn(() => adapter) };
    const trace = { recordStep: jest.fn().mockResolvedValue(undefined) };
    const executor = new BrainTaskExecutorService(registry as never, trace as never);

    const result = await executor.execute({
      plan: plan(),
      context,
      dto: { message: '综合分析', timezone: 'Asia/Shanghai' },
      runId: 1,
      cognition,
      runtimeIntent,
    } as never);

    expect(maxActive).toBe(2);
    expect(result.status).toBe('completed');
    expect(result.answer).toContain('结论');
    expect(result.answer).toContain('归因');
    expect(trace.recordStep).toHaveBeenCalledTimes(3);
  });

  it('keeps successful facts when one node times out', async () => {
    const registry = {
      resolve: jest.fn((routePlan) => ({
        execute: () =>
          routePlan.adapterKey === 'finance_risk'
            ? Promise.resolve({ status: 'completed', answer: '财务事实', citations: [], grounding: 'db_skill' })
            : new Promise(() => undefined),
      })),
    };
    const trace = { recordStep: jest.fn().mockResolvedValue(undefined) };
    const executor = new BrainTaskExecutorService(registry as never, trace as never);
    const result = await executor.execute({
      plan: plan(10),
      context,
      dto: { message: '综合分析', timezone: 'Asia/Shanghai' },
      runId: 1,
      cognition,
      runtimeIntent,
    } as never);

    expect(result.status).toBe('completed');
    expect(result.answer).toContain('财务事实');
    expect(result.answer).toContain('缺失部分');
    expect(result.results.find((item) => item.nodeId === 'inventory')).toMatchObject({ status: 'failed' });
  });
});
