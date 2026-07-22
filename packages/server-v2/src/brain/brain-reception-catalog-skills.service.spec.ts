import { BrainReceptionSkillsService } from './skills/brain-reception-skills.service.js';

describe('BrainReceptionSkillsService catalog snapshot', () => {
  it('returns store-scoped active cards and promotions', async () => {
    const prisma = {
      card: {
        findMany: jest.fn().mockResolvedValue([{ name: '补水护理 10 次卡', totalTimes: 10, price: 3000, validDays: 365 }]),
      },
      promotion: {
        findMany: jest.fn().mockResolvedValue([{ name: '新客体验礼', discountText: '首单减 100', endAt: new Date('2026-07-31') }]),
      },
    };
    const service = new BrainReceptionSkillsService(prisma as never);

    const result = await service.buildCatalogSnapshot({ storeId: 6, now: new Date('2026-07-11T00:00:00.000Z') });

    expect(result.cards[0]).toMatchObject({ name: '补水护理 10 次卡', price: 3000 });
    expect(result.promotions[0]).toMatchObject({ name: '新客体验礼', discountText: '首单减 100', endAt: '2026-07-31' });
  });
});
