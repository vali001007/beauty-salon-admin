import { BrainSkillRuntimeService } from './skills/brain-skill-runtime.service.js';

describe('BrainSkillRuntimeService', () => {
  it('returns conclusion-evidence-action-benefit-entry structure for analysis results', () => {
    const runtime = new BrainSkillRuntimeService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = runtime.composeSuggestion({
      conclusion: '本周 12 位次卡临期客户需要邀约',
      evidence: ['平均剩余 3 次', '到期前 14 天'],
      action: '创建跟进任务',
      benefit: '挽回储值消耗',
      entry: '/customer-marketing/workbench',
    });

    expect(Object.keys(result)).toEqual(['conclusion', 'evidence', 'action', 'benefit', 'entry']);
  });

  it('coalesces identical short-lived manager overview reads', async () => {
    const managerSkills = {
      buildDailyOverview: jest.fn().mockResolvedValue({ revenue: 100, appointmentCount: 2, activeCustomerCount: 1, grossMarginRate: 0.5, riskItems: [] }),
    };
    const runtime = new BrainSkillRuntimeService(
      {} as never,
      {} as never,
      managerSkills as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const input = { storeId: 6, startDate: new Date('2026-07-11T00:00:00.000Z'), endDate: new Date('2026-07-11T23:59:59.999Z') };

    const [first, second] = await Promise.all([
      runtime.buildManagerDailyOverview(input),
      runtime.buildManagerDailyOverview(input),
    ]);

    expect(first).toEqual(second);
    expect(managerSkills.buildDailyOverview).toHaveBeenCalledTimes(1);
  });
});
