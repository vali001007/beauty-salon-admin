import {
  buildLegacyActivityInstanceInput,
  buildLegacyActivityAdoptionInput,
  buildLegacyTerminalInstanceInput,
  parseBackfillMode,
  validateLegacyPredictionScope,
} from '../../../prisma/marketing-recommendation-v2-backfill';

describe('marketing recommendation v2 legacy backfill', () => {
  it('requires an explicit environment gate before apply mode', () => {
    expect(() => parseBackfillMode(['node', 'script', '--apply', '--yes'], {})).toThrow(
      'ALLOW_MARKETING_DATA_WRITE=true',
    );
    expect(parseBackfillMode(['node', 'script', '--apply', '--yes'], { ALLOW_MARKETING_DATA_WRITE: 'true' })).toEqual({
      apply: true,
    });
    expect(parseBackfillMode(['node', 'script'], {})).toEqual({ apply: false });
  });

  it('builds a deterministic legacy recommendation instance from a scoped activity', () => {
    const input = buildLegacyActivityInstanceInput({
      id: 20,
      storeId: 6,
      title: '沉睡客户召回',
      description: '召回 30 天未到店客户',
      status: 'active',
      sourceRecommendationId: '1',
      predictionRunId: '43',
      participants: 80,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T02:00:00.000Z'),
    });

    expect(input).toEqual(
      expect.objectContaining({
        storeId: 6,
        recommendationKey: 'legacy:recommendation:1:activity:20',
        sourceType: 'legacy',
        sourceVersion: 'legacy-activity-v1',
        predictionRunId: 43,
        businessDate: new Date('2026-07-01T00:00:00.000Z'),
        targetCount: 80,
        preferredMode: 'activity',
        executionModes: ['activity'],
      }),
    );
    expect(input.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects an activity without a reliable store or recommendation source', () => {
    expect(() =>
      buildLegacyActivityInstanceInput({
        id: 21,
        storeId: 0,
        title: '无归属活动',
        sourceRecommendationId: null,
        participants: 0,
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
      }),
    ).toThrow('legacy_activity_scope_unreliable');
  });

  it('builds a deterministic legacy activity adoption and preserves non-numeric source ids in the snapshot', () => {
    const adoption = buildLegacyActivityAdoptionInput(
      {
        id: 25,
        storeId: 6,
        title: 'Agent 推荐活动',
        status: 'active',
        sourceRecommendationId: 'agent_run_127',
        predictionRunId: '43',
        participants: 12,
        publishStatus: 'published',
        publishedAt: new Date('2026-07-06T04:00:00.000Z'),
        createdAt: new Date('2026-07-06T03:00:00.000Z'),
      },
      'instance-25',
    );

    expect(adoption).toEqual({
      storeId: 6,
      recommendationId: null,
      recommendationInstanceId: 'instance-25',
      adoptionKey: 'legacy-backfill:activity:6:25',
      mode: 'activity',
      status: 'published',
      activityId: 25,
      predictionRunId: 43,
      snapshotJson: {
        source: 'legacy_activity_backfill',
        activityId: 25,
        sourceRecommendationId: 'agent_run_127',
      },
    });
  });

  it('builds one deterministic terminal recommendation instance for a scoped legacy task batch', () => {
    const input = buildLegacyTerminalInstanceInput([
      {
        id: 31,
        storeId: 6,
        customerId: 101,
        recommendationId: 2302,
        title: '高流失风险客户回访',
        priority: 'urgent',
        status: 'pending',
        dueAt: new Date('2026-07-10T10:00:00.000Z'),
        createdAt: new Date('2026-07-08T01:00:00.000Z'),
      },
      {
        id: 32,
        storeId: 6,
        customerId: 102,
        recommendationId: 2302,
        title: '高流失风险客户回访',
        priority: 'urgent',
        status: 'completed',
        dueAt: new Date('2026-07-11T10:00:00.000Z'),
        createdAt: new Date('2026-07-08T01:01:00.000Z'),
      },
    ]);

    expect(input).toEqual(
      expect.objectContaining({
        storeId: 6,
        recommendationId: 2302,
        recommendationKey: 'legacy:recommendation:2302:terminal_follow_up',
        sourceType: 'legacy',
        sourceVersion: 'legacy-terminal-v1',
        preferredMode: 'terminal_follow_up',
        executionModes: ['terminal_follow_up'],
        targetCount: 2,
        taskIds: [31, 32],
        customerIds: [101, 102],
        adoptionKey: 'legacy-backfill:terminal:6:2302',
      }),
    );
    expect(input.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a terminal task batch that crosses stores or recommendation ids', () => {
    expect(() =>
      buildLegacyTerminalInstanceInput([
        {
          id: 31,
          storeId: 6,
          customerId: 101,
          recommendationId: 1,
          title: '回访',
          priority: 'recommended',
          status: 'pending',
          createdAt: new Date('2026-07-08T01:00:00.000Z'),
        },
        {
          id: 32,
          storeId: 8,
          customerId: 102,
          recommendationId: 1,
          title: '回访',
          priority: 'recommended',
          status: 'pending',
          createdAt: new Date('2026-07-08T01:01:00.000Z'),
        },
      ]),
    ).toThrow('legacy_terminal_scope_unreliable');
  });

  it('rejects a prediction run from another store unless it is explicitly legacy global', () => {
    expect(validateLegacyPredictionScope(6, 43, { id: 43, storeId: 8, scopeStatus: 'store_scoped' })).toBe(
      'prediction_run_store_mismatch',
    );
    expect(validateLegacyPredictionScope(6, 43, { id: 43, storeId: null, scopeStatus: 'legacy_global' })).toBeNull();
  });
});
