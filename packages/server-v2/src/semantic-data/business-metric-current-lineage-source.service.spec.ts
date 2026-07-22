import { BusinessMetricCurrentLineageSourceService } from './business-metric-current-lineage-source.service.js';

describe('BusinessMetricCurrentLineageSourceService', () => {
  it('loads only current published metric pointers for the requested keys', async () => {
    const prisma = {
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            definitionKey: 'metric.paid_amount',
            kind: 'metric',
            status: 'active',
            currentPublishedVersion: {
              version: 2,
              lifecycleStatus: 'published',
              fingerprint: 'c'.repeat(64),
              sourceFingerprint: 'd'.repeat(64),
            },
          },
        ]),
      },
    };
    const source = new BusinessMetricCurrentLineageSourceService(prisma as never);

    const lineage = await source.loadCurrent(['paid_amount']);

    expect(lineage.get('paid_amount')).toEqual({
      definitionKey: 'metric.paid_amount',
      version: 2,
      definitionFingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
    });
    expect(prisma.businessDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: 'metric',
          status: 'active',
          definitionKey: { in: ['metric.paid_amount'] },
        }),
      }),
    );
  });

  it('fails closed when a requested current pointer is missing', async () => {
    const source = new BusinessMetricCurrentLineageSourceService({
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    await expect(source.loadCurrent(['paid_amount'])).rejects.toThrow(
      'business_metric_current_lineage_missing:paid_amount',
    );
  });
});
