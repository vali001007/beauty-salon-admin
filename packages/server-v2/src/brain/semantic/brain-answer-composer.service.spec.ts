import { BrainAnswerComposerService } from './brain-answer-composer.service.js';

describe('BrainAnswerComposerService', () => {
  const composer = new BrainAnswerComposerService();

  it('composes scalar metric answers', () => {
    const answer = composer.compose({
      shape: 'scalar',
      label: '预约数',
      metric: 'appointment_count',
      valueField: 'appointment_count',
      rows: [{ appointment_count: 3 }],
    });

    expect(answer).toBe('预约数为 3。');
  });

  it('composes comparison answer with current, previous, delta and rate', () => {
    const answer = composer.compose({
      shape: 'comparison',
      label: '实收流水',
      metric: 'paid_revenue',
      rows: [{ current_value: 19907.1, previous_value: 12000, delta_value: 7907.1, delta_rate: 0.658925 }],
    });

    expect(answer).toBe('实收流水本期为 19907.10 元，上期为 12000.00 元，差值为 7907.10 元，变化率为 65.9%。');
  });

  it('composes ranking answers from grouped rows', () => {
    const answer = composer.compose({
      shape: 'ranking',
      label: '员工业绩排行',
      metric: 'paid_revenue',
      valueField: 'paid_revenue',
      rows: [
        { dimension_label: '小美', paid_revenue: 9000 },
        { dimension_label: '小丽', paid_revenue: 7000 },
      ],
    });

    expect(answer).toBe('1. 小美：9000.00 元\n2. 小丽：7000.00 元');
  });

  it('refuses ranking questions when only scalar row is available', () => {
    const answer = composer.compose({
      shape: 'ranking',
      label: '实收流水',
      metric: 'paid_revenue',
      rows: [{ paid_revenue: 19907.1 }],
    });

    expect(answer).toBe('当前查询需要排名结果，但 Ami Brain 只拿到了单值指标，系统已停止返回不匹配答案。');
  });
});
