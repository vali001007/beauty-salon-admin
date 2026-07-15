import { BadRequestException } from '@nestjs/common';
import { MarketingPredictionRunService } from './marketing-prediction-run.service';

describe('MarketingPredictionRunService', () => {
  const prisma = {
    predictionRun: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customerPredictionSnapshot: { deleteMany: jest.fn() },
  } as any;
  const marketing = { populatePredictionRun: jest.fn() } as any;
  let service: MarketingPredictionRunService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketingPredictionRunService(prisma, marketing);
  });

  it('reuses the completed run for the same store business day', async () => {
    const run = {
      id: 55,
      storeId: 6,
      runKey: 'store:6:date:2026-07-13:model:rules-v2.1',
      status: 'completed',
      summaryJson: { customerCount: 1252 },
      finishedAt: new Date('2026-07-13T02:00:00.000Z'),
    };
    prisma.predictionRun.findUnique.mockResolvedValue(run);

    const result = await service.runForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(result).toEqual({ run, summary: run.summaryJson, reused: true });
    expect(prisma.predictionRun.create).not.toHaveBeenCalled();
    expect(marketing.populatePredictionRun).not.toHaveBeenCalled();
  });

  it('creates and populates one store-scoped run with a stable run key', async () => {
    prisma.predictionRun.findUnique.mockResolvedValue(null);
    prisma.predictionRun.create.mockResolvedValue({
      id: 56,
      storeId: 6,
      status: 'running',
      runKey: 'store:6:date:2026-07-13:model:rules-v2.1',
    });
    marketing.populatePredictionRun.mockResolvedValue({
      run: { id: 56, storeId: 6, status: 'completed' },
      summary: { customerCount: 1252 },
      lifecycle: { rebuilt: true },
    });

    const result = await service.runForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(prisma.predictionRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 6,
        businessDate: new Date('2026-07-13T00:00:00.000Z'),
        runKey: 'store:6:date:2026-07-13:model:rules-v2.1',
        scopeStatus: 'store_scoped',
        modelVersion: 'rules-v2.1',
        status: 'running',
      }),
    });
    expect(marketing.populatePredictionRun).toHaveBeenCalledWith(56, 6);
    expect(result.reused).toBe(false);
  });

  it('restarts a stale running record without creating a second run key', async () => {
    prisma.predictionRun.findUnique.mockResolvedValue({
      id: 57,
      storeId: 6,
      status: 'running',
      startedAt: new Date('2026-07-13T06:00:00.000Z'),
    });
    prisma.predictionRun.update.mockResolvedValue({ id: 57, storeId: 6, status: 'running' });
    marketing.populatePredictionRun.mockResolvedValue({
      run: { id: 57, storeId: 6, status: 'completed' },
      summary: {},
      lifecycle: { rebuilt: true },
    });

    await service.runForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(prisma.customerPredictionSnapshot.deleteMany).toHaveBeenCalledWith({ where: { runId: 57 } });
    expect(prisma.predictionRun.update).toHaveBeenCalledWith({
      where: { id: 57 },
      data: expect.objectContaining({ status: 'running', customerCount: 0, finishedAt: null }),
    });
    expect(prisma.predictionRun.create).not.toHaveBeenCalled();
    expect(marketing.populatePredictionRun).toHaveBeenCalledWith(57, 6);
  });

  it('rejects a missing or invalid store id', async () => {
    await expect(service.runForStore(0)).rejects.toBeInstanceOf(BadRequestException);
  });
});
