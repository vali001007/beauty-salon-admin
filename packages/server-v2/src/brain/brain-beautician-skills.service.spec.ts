import { BrainBeauticianSkillsService } from './skills/brain-beautician-skills.service.js';

describe('BrainBeauticianSkillsService', () => {
  it('includes customer allergy and skin notes for next service attention checks', async () => {
    const prisma = {
      beautician: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            date: new Date('2026-07-11T00:00:00.000Z'),
            startTime: '10:00',
            customer: {
              name: '李女士',
              hasAllergy: '芦荟过敏',
              skinCondition: '敏感泛红',
              skinType: '敏感肌',
              remark: '最近压力大',
              healthProfile: {
                allergyHistory: '对酒精类产品敏感',
                skinStatus: '屏障偏弱',
                mainProblems: '泛红、干痒',
              },
            },
            project: { name: '舒缓修护' },
          },
        ]),
      },
    };
    const service = new BrainBeauticianSkillsService(prisma as never);

    const summary = await service.buildTodayServiceSummary({
      storeId: 2,
      userId: 9,
      startDate: new Date('2026-07-11T00:00:00.000Z'),
      endDate: new Date('2026-07-11T23:59:59.999Z'),
    });

    expect(summary.nextTasks[0]).toMatchObject({
      customerName: '李女士',
      projectName: '舒缓修护',
    });
    expect(summary.nextTasks[0].attentionItems).toEqual(
      expect.arrayContaining(['过敏史：芦荟过敏', '健康档案过敏史：对酒精类产品敏感', '情绪/备注：最近压力大']),
    );
  });

  it('includes project ranking in personal performance facts', async () => {
    const prisma = {
      beautician: { findFirst: jest.fn().mockResolvedValue({ id: 3, name: '王美容师' }) },
      serviceTask: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 1, duration: 60, status: 'completed', startedAt: null, completedAt: null, project: { name: '补水护理' } },
          { customerId: 2, duration: 60, status: 'completed', startedAt: null, completedAt: null, project: { name: '补水护理' } },
          { customerId: 1, duration: 90, status: 'completed', startedAt: null, completedAt: null, project: { name: '舒缓修护' } },
        ]),
      },
      commissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainBeauticianSkillsService(prisma as never);

    const summary = await service.buildPersonalPerformance({
      storeId: 2,
      userId: 9,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(summary.projectRanking).toEqual([
      { name: '补水护理', count: 2 },
      { name: '舒缓修护', count: 1 },
    ]);
  });
});
