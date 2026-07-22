import { BrainTraceService } from './brain-trace.service.js';

describe('BrainTraceService', () => {
  it('lists lightweight run summaries and leaves full JSON for the detail endpoint', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 3, status: 'completed', input: { message: '今天营收怎么样' }, latencyMs: 230, createdAt: new Date() },
    ]);
    const count = jest.fn().mockResolvedValue(12);
    const service = new BrainTraceService({ brainRun: { findMany, count } } as never);

    await expect(service.listTraces({ storeId: 6 })).resolves.toMatchObject({ total: 12, items: [{ id: 3 }] });
    expect(findMany).toHaveBeenCalledWith({
      where: { storeId: 6 },
      orderBy: { id: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        input: true,
        latencyMs: true,
        createdAt: true,
      },
    });
    expect(count).toHaveBeenCalledWith({ where: { storeId: 6 } });
  });
});
