import { BrainRiskSkillsService } from './skills/brain-risk-skills.service.js';

describe('BrainRiskSkillsService', () => {
  it('sorts risk items by severity and includes evidence and action', () => {
    const service = new BrainRiskSkillsService();
    const items = service.formatRisks([
      { title: '次卡临期未约', severity: 80, evidence: ['12 人到期前 14 天'], action: '创建邀约任务', entry: '/customer-marketing/workbench' },
      { title: '预约未确认', severity: 40, evidence: ['3 个预约未确认'], action: '提醒前台确认', entry: '/stores/reservations' },
    ]);

    expect(items[0].title).toBe('次卡临期未约');
    expect(items[0]).toHaveProperty('evidence');
    expect(items[0]).toHaveProperty('entry');
  });
});
