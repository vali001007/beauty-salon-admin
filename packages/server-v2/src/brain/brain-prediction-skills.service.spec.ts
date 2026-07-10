import { BrainPredictionSkillsService } from './skills/brain-prediction-skills.service.js';

describe('BrainPredictionSkillsService', () => {
  it('labels prediction confidence and does not present prediction as fact', () => {
    const service = new BrainPredictionSkillsService({} as never);
    const result = service.composeChurnInsight({ customerName: '王女士', churnScore: 0.82, churnLevel: 'high' });

    expect(result.conclusion).toContain('预测');
    expect(result.confidence).toBe(0.82);
    expect(result.action).toContain('挽回');
  });
});
