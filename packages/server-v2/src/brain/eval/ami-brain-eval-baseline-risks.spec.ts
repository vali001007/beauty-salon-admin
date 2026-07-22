import {
  countCurrentTimeFallbackRisks,
  countDraftActionMetricMismatches,
} from './ami-brain-eval-baseline-risks.js';

describe('Ami Brain eval baseline risk counters', () => {
  const metricCitation = {
    sourceType: 'business_definition',
    sourceId: 'metric.staff_service_count@2',
  };

  it('does not treat staff comparison as an unsupported time comparison', () => {
    const parser = {
      parse: jest.fn().mockReturnValue({ mentionedTime: true, unsupportedExpressions: ['对比时间'] }),
    };

    expect(countCurrentTimeFallbackRisks([
      { question: '帮我看一下各美容师的服务次数对比', citations: [metricCitation] },
    ], parser)).toBe(0);
    expect(countCurrentTimeFallbackRisks([
      { question: '把本月实收跟另一个周期比较', citations: [metricCitation] },
    ], parser)).toBe(1);
  });

  it('uses the governed eval intent before a weak standalone classifier result', () => {
    const classifier = { classify: jest.fn().mockReturnValue({ intent: 'recommendation' }) };

    expect(countDraftActionMetricMismatches([
      {
        question: '最近三天营业额趋势怎么样',
        citations: [metricCitation],
        expected: { intent: 'trend' },
      },
    ], classifier)).toBe(0);
    expect(classifier.classify).not.toHaveBeenCalled();
  });
});
