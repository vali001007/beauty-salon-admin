import {
  applyKnowledgeMapGate,
  evaluateKnowledgeMapGate,
  KNOWLEDGE_MAP_EVAL_CASES,
  runKnowledgeMapEval,
  type KnowledgeMapEvalReport,
} from './agent-eval-knowledge-map.js';

describe('knowledge map agent eval', () => {
  it('keeps entity, action, capability and output contract aligned for curated cases', async () => {
    const report = await runKnowledgeMapEval();

    expect(report.summary.total).toBe(KNOWLEDGE_MAP_EVAL_CASES.length);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.routingAccuracy).toBe(1);
    expect(report.summary.entityAccuracy).toBe(1);
    expect(report.summary.actionAccuracy).toBe(1);
    expect(report.summary.capabilityAccuracy).toBe(1);
    expect(report.summary.outputContractAccuracy).toBe(1);
  });

  it('supports persona filter for marketing regression', async () => {
    const report = await runKnowledgeMapEval({ persona: 'marketing' });

    expect(report.filters.persona).toBe('marketing');
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.results.every((item) => item.expected.personaCode === 'marketing')).toBe(true);
    expect(report.summary.failed).toBe(0);
  });

  it('supports capability filter for activity link regression', async () => {
    const report = await runKnowledgeMapEval({ capability: 'marketing.activity.link.lookup' });

    expect(report.filters.capability).toBe('marketing.activity.link.lookup');
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.results.every((item) => item.expected.capabilityId === 'marketing.activity.link.lookup')).toBe(true);
    expect(report.summary.failed).toBe(0);
  });

  it('passes the P0 gate when the first 50 curated cases are all green', async () => {
    const report = applyKnowledgeMapGate(await runKnowledgeMapEval(), { level: 'p0' });

    expect(report.gate).toMatchObject({
      level: 'p0',
      passed: true,
      evaluatedTotal: 50,
      thresholds: { passRate: 1, failed: 0 },
      improvementBacklog: [],
    });
  });

  it('fails the P1 gate when high-frequency route accuracy drops below threshold', async () => {
    const report = await runKnowledgeMapEval();
    const brokenReport: KnowledgeMapEvalReport = {
      ...report,
      results: report.results.map((item, index) => index < 6 ? { ...item, passed: false, failureReasons: ['route_error'] } : item),
    };

    const gate = evaluateKnowledgeMapGate(brokenReport, { level: 'p1' });

    expect(gate.passed).toBe(false);
    expect(gate.evaluatedTotal).toBe(100);
    expect(gate.actual.routingAccuracy).toBeLessThan(0.95);
    expect(gate.violations[0]).toContain('路由准确率');
    expect(gate.improvementBacklog[0]).toMatchObject({
      priority: 'P1',
      failureReasons: ['route_error'],
    });
  });

  it('fails the P2 gate when current pass rate falls below the previous baseline', async () => {
    const report = await runKnowledgeMapEval();
    const brokenReport: KnowledgeMapEvalReport = {
      ...report,
      results: report.results.map((item, index) => index === 0 ? { ...item, passed: false, failureReasons: ['capability_miss'] } : item),
    };

    const gate = evaluateKnowledgeMapGate(brokenReport, { level: 'p2', baselineReport: report });

    expect(gate.passed).toBe(false);
    expect(gate.actual.baselinePassRate).toBe(1);
    expect(gate.violations[0]).toContain('不得低于上一次基线');
    expect(gate.improvementBacklog[0]).toMatchObject({
      priority: 'P2',
      failureReasons: ['capability_miss'],
      expectedCapabilityId: 'marketing.activity.link.lookup',
    });
  });
});
