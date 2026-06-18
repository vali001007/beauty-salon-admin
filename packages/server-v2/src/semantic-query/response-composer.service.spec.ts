import type { SemanticQueryResult } from './query-plan.types.js';
import { ResponseComposerService } from './response-composer.service.js';

function result(overrides: Partial<SemanticQueryResult> = {}): SemanticQueryResult {
  return {
    status: 'success',
    queryId: 'sq_response',
    capabilityId: 'customer_follow_up',
    title: '客户跟进建议',
    summary: '建议优先跟进杨晓雯。',
    rows: [
      {
        customerId: 1,
        customerName: '杨晓雯',
        priority: 'recommended',
        level: 'high',
        phone: '188****3187',
      },
    ],
    actions: [{ label: '生成跟进任务草稿', action: 'follow-up:draft', riskLevel: 'low' }],
    userEvidence: { dataSummary: '基于 3 条业务记录统计' },
    auditEvidence: {
      source: ['CustomerPredictionSnapshot'],
      metricDefinition: '测试口径',
      filters: ['当前门店'],
    },
    ...overrides,
  };
}

describe('ResponseComposerService', () => {
  const composer = new ResponseComposerService();

  it('composes user-facing overview, details and next actions', () => {
    const composed = composer.compose(result());

    expect(composed.overview.conclusion).toContain('杨晓雯');
    expect(composed.overview.reason).toBe('基于 3 条业务记录统计');
    expect(composed.details[0].title).toBe('杨晓雯');
    expect(composed.nextActions[0]).toMatchObject({ label: '生成跟进任务草稿', action: 'follow-up:draft', riskLevel: '低' });
  });

  it('hides ids and converts internal enum values to Chinese labels', () => {
    const text = JSON.stringify(composer.compose(result()));

    expect(text).not.toContain('customerId');
    expect(text).not.toContain('recommended');
    expect(text).not.toContain('high');
    expect(text).toContain('建议优先跟进');
    expect(text).toContain('高');
  });
});
