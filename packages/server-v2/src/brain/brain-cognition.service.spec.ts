import { BrainCognitionService } from './cognition/brain-cognition.service.js';
import { EntityLinkerService } from './cognition/entity-linker.service.js';
import { IntentClassifierService } from './cognition/intent-classifier.service.js';
import { TermNormalizerService } from './cognition/term-normalizer.service.js';

describe('BrainCognitionService', () => {
  const cognition = new BrainCognitionService(
    new TermNormalizerService(),
    new EntityLinkerService(),
    new IntentClassifierService(),
  );

  it('normalizes beauty business wording into semantic metrics', () => {
    const result = cognition.understand({ message: '这周预约和流水怎么样？' });

    expect(result.metrics).toEqual(['appointment_count', 'paid_revenue']);
    expect(result.intent.key).toBe('metric_query');
    expect(result.needsClarification).toBe(false);
  });

  it('classifies profit decline questions as diagnosis tasks', () => {
    const result = cognition.understand({ message: '这周业绩为什么比上周差？' });

    expect(result.intent.key).toBe('diagnose_profit_drop');
    expect(result.metrics).toContain('paid_revenue');
    expect(result.dimensions).toContain('date');
  });

  it('asks for clarification when one spoken alias matches multiple entities', () => {
    const result = cognition.understand({
      message: '张姐这个月业绩怎么样？',
      entityCandidates: [
        { slot: 'beautician', entityKey: 'staff:3', label: '张丽（3号店）', aliases: ['张姐', '张丽'] },
        { slot: 'beautician', entityKey: 'staff:5', label: '张敏（5号店）', aliases: ['张姐', '张敏'] },
      ],
    });

    expect(result.needsClarification).toBe(true);
    expect(result.clarification?.question).toContain('张丽（3号店）');
    expect(result.clarification?.question).toContain('张敏（5号店）');
  });

  it('does not invent unsupported metrics', () => {
    const result = cognition.understand({ message: '老板开心指数本月怎么样？' });

    expect(result.metrics).toEqual([]);
    expect(result.unsupportedTerms).toContain('老板开心指数');
  });
});
