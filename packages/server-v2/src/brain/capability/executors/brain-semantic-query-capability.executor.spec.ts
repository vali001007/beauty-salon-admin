import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import type { BrainCapabilityExecutionInput } from '../brain-capability-executor.registry.js';
import { BrainSemanticQueryCapabilityExecutor } from './brain-semantic-query-capability.executor.js';

describe('BrainSemanticQueryCapabilityExecutor', () => {
  it('returns a scalar project service count for a specific project sales question', async () => {
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, name: '肩颈舒压养护' },
          { id: 20, name: '背部净透护理' },
        ]),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }]),
      },
    };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      { loadActiveDefinitions: jest.fn() } as never,
      new BrainTimeRangeParserService(),
      prisma as never,
    );

    const result = await executor.execute(
      input('project_service_ranking', '背部净透护理2026年6月1日至30日卖了多少', 'scalar'),
    );

    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          itemType: 'project',
          itemId: 20,
          order: expect.objectContaining({
            storeId: 6,
            status: { in: ['completed', 'paid'] },
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'completed',
      grounding: 'metric_query',
      metadata: {
        capabilityKey: 'project_service_ranking',
        answerScope: 'project_service_count_scalar',
        projectId: 20,
      },
    });
    expect(result.answer).toContain('背部净透护理');
    expect(result.answer).toContain('卖了 3 单');
    expect(result.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'kpi',
          items: [expect.objectContaining({ label: '项目服务次数', value: '3 次' })],
        }),
      ]),
    );
  });
});

function input(capabilityKey: string, question: string, answerShape: BrainCapabilityExecutionInput['answerShape']) {
  return {
    card: {
      key: capabilityKey,
      version: 1,
      name: capabilityKey,
      description: capabilityKey,
      intents: ['query', 'ranking'],
      examples: [question],
      negativeExamples: [],
      synonyms: [],
      businessDefinitionKeys: ['metric.project_service_count', 'entity.project'],
      requiredPermissions: ['core:brain:use'],
      allowedRoles: [],
      riskLevel: 'low',
      storeScope: 'required',
      readOnly: true,
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      sourceFingerprint: 'test',
      sourceRefs: [],
      status: 'published',
      definitionRefs: [],
    },
    context: {
      userId: 9,
      storeId: 6,
      visibleStoreIds: [6],
      roles: ['store_manager'],
      permissions: ['*'],
      deniedPermissions: [],
      requestId: `semantic-query-${capabilityKey}`,
      timezone: 'Asia/Shanghai',
    },
    runId: 1,
    question,
    answerShape,
    args: {
      objective: question,
      entities: [],
      metrics: [],
      dimensions: [],
      filters: [],
      orderBy: [],
      time: {
        label: '2026年6月1日至30日',
        timezone: 'Asia/Shanghai',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      },
    },
  } as unknown as BrainCapabilityExecutionInput;
}
