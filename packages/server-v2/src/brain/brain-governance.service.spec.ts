import { BrainEvalService } from './governance/brain-eval.service.js';

describe('BrainEvalService', () => {
  it('blocks release when deterministic regression fails', () => {
    const service = new BrainEvalService({} as never);
    const summary = service.summarizeResults([
      { caseKey: 'sem_001', passed: true },
      { caseKey: 'permission_001', passed: false },
    ]);

    expect(summary.canRelease).toBe(false);
    expect(summary.failed).toBe(1);
  });

  it('does not allow release when an eval run has no results', () => {
    const service = new BrainEvalService({} as never);
    expect(service.summarizeResults([]).canRelease).toBe(false);
  });

  it('persists per-case deterministic grades and a completed eval summary', async () => {
    const prisma = {
      brainEvalCase: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, caseKey: 'case_1', roleKey: 'finance', input: { message: '本月流水多少' }, expected: {}, assertionType: 'grader' },
        ]),
      },
      brainEvalRun: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, storeId: 6, status: 'queued' }),
        update: jest.fn().mockResolvedValue({ id: 5, status: 'completed' }),
      },
      brainEvalResult: { create: jest.fn().mockResolvedValue({ id: 9 }) },
    };
    const chat = {
      createConversation: jest.fn().mockResolvedValue({ id: 31 }),
      sendMessage: jest.fn().mockResolvedValue({
        status: 'completed',
        answer: '本月实收流水为 1000 元。',
        citations: [{ sourceType: 'metric', sourceId: 'paid_revenue' }],
      }),
    };
    const grader = { grade: jest.fn().mockReturnValue({ status: 'usable_exact', reason: 'matched' }) };
    const service = new BrainEvalService(prisma as never, chat as never, grader as never);

    const result = await service.runEvalNow({
      evalRunId: 5,
      storeId: 6,
      userId: 9,
      permissions: ['*'],
      caseKeys: ['case_1'],
    });

    expect(prisma.brainEvalResult.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      evalRunId: 5,
      caseKey: 'case_1',
      deterministicPassed: true,
      deterministicGrade: expect.objectContaining({ status: 'usable_exact' }),
    }) });
    expect(prisma.brainEvalRun.update).toHaveBeenLastCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({ status: 'completed', caseCount: 1, passedCount: 1, failedCount: 0 }),
    });
    expect(result).toMatchObject({ total: 1, passed: 1, failed: 0, canRelease: true });
  });
});
