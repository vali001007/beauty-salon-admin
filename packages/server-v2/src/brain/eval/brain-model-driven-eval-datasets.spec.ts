import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Ami Brain model-driven eval datasets', () => {
  const repoRoot = resolve(process.cwd(), '..', '..');

  it('keeps at least five paraphrases for every core semantic intent', () => {
    const payload = JSON.parse(readFileSync(resolve(
      repoRoot,
      'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-model-driven-paraphrase-cases.json',
    ), 'utf8')) as { cases: Array<{ intent: string; input: string }> };
    const counts = payload.cases.reduce<Record<string, number>>((acc, item) => {
      acc[item.intent] = (acc[item.intent] ?? 0) + 1;
      return acc;
    }, {});

    for (const intent of ['query', 'ranking', 'comparison', 'trend', 'diagnosis', 'recommendation', 'draft', 'action', 'workflow', 'clarify']) {
      expect(counts[intent]).toBeGreaterThanOrEqual(5);
    }
    expect(new Set(payload.cases.map((item) => item.input)).size).toBe(payload.cases.length);
  });

  it('covers every required adversarial category', () => {
    const payload = JSON.parse(readFileSync(resolve(
      repoRoot,
      'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-model-driven-adversarial-cases.json',
    ), 'utf8')) as { cases: Array<{ category: string }> };
    const categories = new Set(payload.cases.map((item) => item.category));

    expect(categories).toEqual(new Set([
      'prompt_injection',
      'tool_forgery',
      'permission_escalation',
      'cross_store',
      'argument_tampering',
      'fake_confirmation',
      'replan_bypass',
    ]));
  });
});
