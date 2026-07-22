import { BrainEvalService } from './brain-eval.service.js';

describe('BrainEvalService listRuns', () => {
  it('serves the 650-question catalog with pagination, filters and immutable snapshot metadata', () => {
    const service = new BrainEvalService({} as never);

    const firstPage = service.listQuestionCatalog({ page: 1, pageSize: 50 });
    expect(firstPage.metadata).toMatchObject({ total: 650, releaseId: 362, passed: 360, failed: 283, unavailable: 7 });
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.total).toBe(650);
    expect(firstPage.items[0]).toEqual(expect.objectContaining({
      questionId: expect.stringMatching(/^qb-/),
      question: expect.any(String),
      questionType: expect.any(String),
      diagnosis: expect.any(String),
      improvementSuggestion: expect.any(String),
      averageLatencyMs: expect.any(Number),
    }));
    expect(firstPage.items[0]).not.toHaveProperty('semanticKeys');
    expect(firstPage.items[0]).not.toHaveProperty('dataTables');
    expect(firstPage.items[0]).not.toHaveProperty('testHistory');

    const detail = service.getQuestionCatalogDetail(firstPage.items[0]!.questionId);
    expect(detail).toEqual(expect.objectContaining({
      semanticKeys: expect.any(Array),
      dataTables: expect.any(Array),
      testHistory: expect.arrayContaining([
        expect.objectContaining({
          releaseId: 362,
          answer: expect.any(String),
          layers: expect.any(Array),
        }),
      ]),
    }));

    const failed = service.listQuestionCatalog({ status: 'failed', pageSize: 100 });
    expect(failed.total).toBe(283);
    expect(failed.items.every((item) => item.passed === false)).toBe(true);

    const searched = service.listQuestionCatalog({ search: '营业额', pageSize: 100 });
    expect(searched.total).toBeGreaterThan(0);
    expect(searched.items.every((item) => JSON.stringify(item).includes('营业额'))).toBe(true);
  });

  it('rejects an unknown catalog question detail request', () => {
    const service = new BrainEvalService({} as never);

    expect(() => service.getQuestionCatalogDetail('missing-question')).toThrow(
      'brain_eval_catalog_question_not_found',
    );
  });

  it('excludes the large per-case results payload from the governance list', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 9, status: 'completed', caseCount: 650, passedCount: 640, failedCount: 10 },
    ]);
    const service = new BrainEvalService({ brainEvalRun: { findMany } } as never);

    await expect(service.listRuns({ storeId: 6 })).resolves.toEqual([
      expect.objectContaining({ id: 9, caseCount: 650 }),
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 6 },
      take: 50,
      select: expect.objectContaining({
        id: true,
        createdAt: true,
      }),
    }));
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('summary');
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('results');
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('error');
  });
});
