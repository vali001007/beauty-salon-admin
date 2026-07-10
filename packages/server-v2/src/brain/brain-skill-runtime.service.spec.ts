import { BrainSkillRuntimeService } from './skills/brain-skill-runtime.service.js';

describe('BrainSkillRuntimeService', () => {
  it('returns conclusion-evidence-action-benefit-entry structure for analysis results', () => {
    const runtime = new BrainSkillRuntimeService({} as never, {} as never);
    const result = runtime.composeSuggestion({
      conclusion: '本周 12 位次卡临期客户需要邀约',
      evidence: ['平均剩余 3 次', '到期前 14 天'],
      action: '创建跟进任务',
      benefit: '挽回储值消耗',
      entry: '/customer-marketing/workbench',
    });

    expect(Object.keys(result)).toEqual(['conclusion', 'evidence', 'action', 'benefit', 'entry']);
  });
});
