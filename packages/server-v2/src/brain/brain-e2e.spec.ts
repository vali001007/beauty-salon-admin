import { BrainMemoryService } from './memory/brain-memory.service.js';
import { BRAIN_P0_EVAL_CASES } from './seed/brain-eval-mvp.seed.js';
import { BrainPermissionService } from './security/brain-permission.service.js';
import { BrainQueryCompilerService } from './semantic/brain-query-compiler.service.js';
import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';

describe('Brain E2E acceptance scenarios', () => {
  it('keeps exactly forty P0 eval cases across required scenario groups', () => {
    const scenarioCounts = BRAIN_P0_EVAL_CASES.reduce<Record<string, number>>((acc, item) => {
      acc[item.scenario] = (acc[item.scenario] ?? 0) + 1;
      return acc;
    }, {});

    expect(BRAIN_P0_EVAL_CASES).toHaveLength(40);
    expect(scenarioCounts).toMatchObject({
      metric_query: 12,
      clarification: 6,
      permission_denied: 6,
      diagnostic_suggestion: 6,
      action_preview: 6,
      prompt_injection: 4,
    });
  });

  it('answers metric query with citations and store scope', () => {
    const compiler = new BrainQueryCompilerService();
    const query = compiler.compile({
      metrics: ['appointment_count'],
      dimensions: ['date'],
      filters: [{ field: 'date', op: 'between', value: ['2026-07-01', '2026-07-10'] }],
      storeId: 1,
      permissions: ['core:store:reservations'],
    });

    expect(query.sql.toLowerCase()).toContain('select');
    expect(query.params).toContain(1);
    expect(query.citations[0]).toMatchObject({ sourceType: 'metric', sourceId: 'appointment_count' });
    expect(query.sql).not.toMatch(/\b0::(float|int|numeric)\b/i);
  });

  it('returns clarification instead of guessing ambiguous entity', () => {
    const memory = new BrainMemoryService({} as never);
    const clarification = memory.buildClarification([
      { slot: 'beautician', candidates: ['张丽（3号店）', '张敏（5号店）'] },
    ]);

    expect(clarification.question).toContain('张丽（3号店）');
    expect(clarification.question).toContain('张敏（5号店）');
  });

  it('blocks unauthorized finance query', () => {
    const permission = new BrainPermissionService();
    const result = permission.canUseSkill({
      userPermissions: ['core:customer:view'],
      userDeniedPermissions: [],
      requiredPermissions: ['core:finance:view'],
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('missing_permission:core:finance:view');
  });

  it('creates high-risk action preview before execution', () => {
    const confirmation = new BrainActionConfirmationService({} as never);
    expect(confirmation.requiresConfirmation('high')).toBe(true);
    expect(confirmation.requiresConfirmation('critical')).toBe(true);
  });
});
