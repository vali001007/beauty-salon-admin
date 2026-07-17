import { BrainCapabilityGraderService } from './brain-capability-grader.service.js';
import { BrainCompletionGraderService } from './brain-completion-grader.service.js';
import { BrainIntentGraderService } from './brain-intent-grader.service.js';
import { BrainPlanGraderService } from './brain-plan-grader.service.js';

describe('Ami Brain model-driven deterministic graders', () => {
  const expected = {
    intent: 'ranking',
    domains: ['sales'],
    entities: ['product'],
    metrics: ['product_sales_quantity'],
    dimensions: ['product'],
    capabilityKeys: ['product_sales_ranking'],
    planShape: { minNodes: 1, requiredCapabilityKeys: ['product_sales_ranking'] },
    requiresGrounding: true,
    requiresComplete: true,
  };

  it('passes all deterministic layers for a matched ranking workflow', () => {
    expect(new BrainIntentGraderService().grade({ expected, actual: {
      intent: 'ranking',
      domains: ['sales'],
      entities: [{ entityType: 'product' }],
      metrics: [{ definitionKey: 'metric.product_sales_quantity' }],
      dimensions: [{ definitionKey: 'dimension.product' }],
    } }).passed).toBe(true);
    expect(new BrainCapabilityGraderService().grade({ expected, actualCapabilityKeys: ['product_sales_ranking'] }).passed).toBe(true);
    expect(new BrainPlanGraderService().grade({ expected, actualPlan: {
      nodes: [{ capabilityKey: 'product_sales_ranking', previewOnly: false }],
    } }).passed).toBe(true);
    expect(new BrainCompletionGraderService().grade({
      expected,
      brainStatus: 'completed',
      completion: { status: 'complete' },
      citations: [{ sourceType: 'business_definition' }],
    }).passed).toBe(true);
  });

  it('keeps deterministic intent and preview failures failed', () => {
    const intent = new BrainIntentGraderService().grade({ expected, actual: { intent: 'query', domains: ['sales'] } });
    const completion = new BrainCompletionGraderService().grade({
      expected: { ...expected, planShape: { minNodes: 1, requiresPreview: true } },
      brainStatus: 'completed',
      completion: { status: 'complete' },
      citations: [{}],
      suggestedActions: [],
      blocks: [],
    });
    expect(intent).toMatchObject({ passed: false, deterministicFailure: true });
    expect(completion).toMatchObject({ passed: false, deterministicFailure: true });
  });

  it('accepts any one governed alternative capability without requiring all alternatives', () => {
    const grader = new BrainCapabilityGraderService();
    expect(grader.grade({
      expected: { capabilityAnyOf: ['finance_payment_breakdown', 'finance_risk_overview'] },
      actualCapabilityKeys: ['finance_risk_overview'],
    })).toMatchObject({ passed: true });
    expect(grader.grade({
      expected: { capabilityAnyOf: ['finance_payment_breakdown', 'finance_risk_overview'] },
      actualCapabilityKeys: ['store_operations_overview'],
    })).toMatchObject({ passed: false });
  });

  it('accepts a grounded overview query when the model requests a diagnostic list shape', () => {
    expect(new BrainIntentGraderService().grade({
      expected: { intent: 'diagnosis' },
      actual: { intent: 'query', answerShape: 'list' },
    })).toMatchObject({ passed: true });
    expect(new BrainIntentGraderService().grade({
      expected: { intent: 'diagnosis' },
      actual: { intent: 'query', answerShape: 'scalar' },
    })).toMatchObject({ passed: false });
  });

  it('accepts a more specific read-only analytical intent for a legacy query expectation', () => {
    const grader = new BrainIntentGraderService();
    expect(grader.grade({
      expected: { intent: 'query' },
      actual: { intent: 'recommendation', answerShape: 'list' },
    })).toMatchObject({ passed: true });
    expect(grader.grade({
      expected: { intent: 'query' },
      actual: { intent: 'action', answerShape: 'action_preview' },
    })).toMatchObject({ passed: false });
  });

  it('accepts ranking as a grouped cross-entity comparison but not as a time comparison substitute', () => {
    const grader = new BrainIntentGraderService();
    expect(grader.grade({
      expected: { intent: 'comparison' },
      actual: {
        intent: 'ranking',
        answerShape: 'ranking',
        dimensions: [{ definitionKey: 'dimension.beauticianName' }],
      },
    })).toMatchObject({ passed: true });
    expect(grader.grade({
      expected: { intent: 'comparison' },
      actual: { intent: 'ranking', answerShape: 'ranking', dimensions: [] },
    })).toMatchObject({ passed: false });
  });

  it('treats clarification as an execution state while preserving the identified business intent', () => {
    const grader = new BrainIntentGraderService();
    expect(grader.grade({
      expected: { intent: 'clarify' },
      actual: {
        intent: 'diagnosis',
        answerShape: 'diagnosis',
        missingSlots: ['entity'],
        ambiguities: [{ slot: 'entity', reason: '缺少待检查的数据对象' }],
      },
    })).toMatchObject({ passed: true, failures: [] });
    expect(grader.grade({
      expected: { intent: 'clarify' },
      actual: { intent: 'diagnosis', answerShape: 'diagnosis', missingSlots: [], ambiguities: [] },
    })).toMatchObject({ passed: false, failures: ['intent_mismatch'] });
  });

  it('grades required and cleared clarification slots deterministically', () => {
    const grader = new BrainIntentGraderService();
    expect(grader.grade({
      expected: {
        intent: 'comparison',
        answerShape: 'clarification',
        missingSlots: ['comparisonTarget'],
      },
      actual: {
        intent: 'comparison',
        answerShape: 'comparison',
        missingSlots: ['comparisonTarget'],
      },
    })).toMatchObject({ passed: true, failures: [] });
    expect(grader.grade({
      expected: {
        intent: 'comparison',
        answerShape: 'comparison',
        forbiddenMissingSlots: ['comparisonTarget'],
      },
      actual: {
        intent: 'comparison',
        answerShape: 'comparison',
        missingSlots: ['comparisonTarget'],
      },
    })).toMatchObject({ passed: false, failures: ['missing_slot_not_cleared:comparisonTarget'] });
  });

  it('allows an expected clarification status without weakening normal completion checks', () => {
    const grader = new BrainCompletionGraderService();
    expect(grader.grade({
      expected: { brainStatuses: ['clarify'], requiresComplete: false, requiresGrounding: false },
      brainStatus: 'clarify',
      completion: { status: 'partial' },
    })).toMatchObject({ passed: true, failures: [] });
    expect(grader.grade({
      expected: { requiresComplete: false, requiresGrounding: false },
      brainStatus: 'clarify',
    })).toMatchObject({ passed: false, failures: ['brain_status:clarify'] });
  });

});

describe('BrainIntentGraderService implicit list dimensions', () => {
  it('accepts a customer-name dimension implied by a customer list intent', () => {
    const result = new BrainIntentGraderService().grade({
      expected: { intent: 'query', domains: ['customer'], dimensions: ['customerName'] },
      actual: {
        intent: 'query',
        domains: ['customer'],
        answerShape: 'list',
        entities: [{ entityType: 'customer', mention: '客户' }],
        dimensions: [],
      },
    });

    expect(result).toMatchObject({ passed: true, failures: [] });
  });

  it('does not invent a project dimension for a generic customer recommendation', () => {
    const result = new BrainIntentGraderService().grade({
      expected: { intent: 'query', domains: ['customer', 'project'], dimensions: ['customerName', 'projectName'] },
      actual: {
        intent: 'ranking',
        domains: ['customer'],
        answerShape: 'ranking',
        entities: [{ entityType: 'customer', mention: '客户' }],
        dimensions: [],
      },
    });

    expect(result.failures).toEqual(expect.arrayContaining(['domain_missing:project', 'dimension_missing:projectName']));
  });
});
