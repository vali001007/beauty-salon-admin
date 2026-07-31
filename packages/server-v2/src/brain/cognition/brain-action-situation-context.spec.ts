import {
  createBrainActionSituationContext,
  brainActionSituationContextIssue,
} from './brain-action-situation-context.js';

const context = {
  userId: 9,
  storeId: 6,
  visibleStoreIds: [6],
  roles: ['store_manager'],
  permissions: ['core:store:reservations'],
  deniedPermissions: [],
  requestId: 'request-situation',
  timezone: 'Asia/Shanghai',
  requestChannel: 'admin_web',
  deviceIdHash: 'd'.repeat(64),
};

describe('Brain action situation context', () => {
  it('freezes the governed action situation and accepts the same execution situation', () => {
    const situation = createBrainActionSituationContext({
      profileFingerprint: 'a'.repeat(64),
      runId: 7,
      conversationId: 12,
      context,
      qualifiedRole: 'store_manager',
      now: new Date('2026-07-30T08:00:00.000Z'),
    });

    expect(situation).toMatchObject({
      runId: 7,
      conversationId: 12,
      storeId: 6,
      actorUserId: 9,
      businessDate: '2026-07-30',
      timezone: 'Asia/Shanghai',
      qualifiedRole: 'store_manager',
      requestChannel: 'admin_web',
      deviceIdHash: 'd'.repeat(64),
    });
    expect(
      brainActionSituationContextIssue(situation, {
        profileFingerprint: 'a'.repeat(64),
        runId: 7,
        conversationId: 12,
        context,
        qualifiedRole: 'store_manager',
        now: new Date('2026-07-30T09:00:00.000Z'),
      }),
    ).toBeUndefined();
  });

  it.each([
    ['action_situation_store_mismatch', { context: { ...context, storeId: 7 } }],
    ['action_situation_actor_mismatch', { context: { ...context, userId: 10 } }],
    ['action_situation_conversation_mismatch', { conversationId: 13 }],
    ['action_situation_role_mismatch', { qualifiedRole: 'finance' as const }],
    ['action_situation_request_channel_mismatch', { context: { ...context, requestChannel: 'terminal' } }],
    ['action_situation_device_mismatch', { context: { ...context, deviceIdHash: 'e'.repeat(64) } }],
    ['action_situation_business_date_expired', { now: new Date('2026-07-31T00:00:00.000Z') }],
  ])('fails closed on %s', (expected, override) => {
    const typedOverride = override as {
      context?: typeof context;
      conversationId?: number;
      qualifiedRole?: 'finance';
      now?: Date;
    };
    const situation = createBrainActionSituationContext({
      profileFingerprint: 'a'.repeat(64),
      runId: 7,
      conversationId: 12,
      context,
      qualifiedRole: 'store_manager',
      now: new Date('2026-07-30T08:00:00.000Z'),
    });
    expect(
      brainActionSituationContextIssue(situation, {
        profileFingerprint: 'a'.repeat(64),
        runId: 7,
        conversationId: typedOverride.conversationId ?? 12,
        context: typedOverride.context ?? context,
        qualifiedRole: typedOverride.qualifiedRole ?? 'store_manager',
        now: typedOverride.now ?? new Date('2026-07-30T09:00:00.000Z'),
      }),
    ).toBe(expected);
  });
});
