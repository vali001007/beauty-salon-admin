import { BadRequestException } from '@nestjs/common';
import { MarketingController } from './marketing.controller';

describe('MarketingController store scope', () => {
  const marketing = {
    findActivities: jest.fn(), createActivity: jest.fn(), findStrategies: jest.fn(), executeStrategy: jest.fn(), adoptRecommendation: jest.fn(),
  } as any;
  const terminal = {} as any;
  const controller = new MarketingController(marketing, terminal);

  beforeEach(() => jest.clearAllMocks());

  it('passes X-Store-Id to activity queries', async () => {
    marketing.findActivities.mockResolvedValue({ items: [] });

    await controller.findActivities(1, 20, undefined, '6');

    expect(marketing.findActivities).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: undefined, storeId: 6 });
  });

  it('rejects activity creation when X-Store-Id is missing', () => {
    expect(() => controller.createActivity({ title: '召回活动' }, undefined)).toThrow(BadRequestException);
  });

  it('executes a strategy inside the current store', async () => {
    marketing.executeStrategy.mockResolvedValue({ id: 1 });

    await controller.executeStrategy(7, '6');

    expect(marketing.executeStrategy).toHaveBeenCalledWith(7, 6);
  });

  it('adopts a recommendation inside the current store', async () => {
    marketing.adoptRecommendation.mockResolvedValue({ adoptionId: 1 });

    await controller.adoptRecommendationTransaction(22, { mode: 'activity', activity: { publishPage: true } }, '6');

    expect(marketing.adoptRecommendation).toHaveBeenCalledWith(22, 6, { mode: 'activity', activity: { publishPage: true } });
  });
});
