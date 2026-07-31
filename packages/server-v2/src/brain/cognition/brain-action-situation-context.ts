import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { BUSINESS_TIME_ZONE, formatBusinessDate } from '../../common/utils/business-time.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type {
  BrainActionQualifiedRole,
  BrainActionSituationContext,
} from './brain-action-execution-provenance.types.js';

export function createBrainActionSituationContext(input: {
  profileFingerprint: string;
  runId: number;
  conversationId: number;
  context: BrainRequestContext;
  qualifiedRole: BrainActionQualifiedRole;
  now?: Date;
}): BrainActionSituationContext {
  const value = {
    schemaVersion: '1.0' as const,
    profileFingerprint: input.profileFingerprint,
    runId: input.runId,
    conversationId: input.conversationId,
    storeId: input.context.storeId,
    businessDate: formatBusinessDate(input.now ?? new Date()),
    timezone: 'Asia/Shanghai' as const,
    actorUserId: input.context.userId,
    qualifiedRole: input.qualifiedRole,
    ...(input.context.requestChannel ? { requestChannel: input.context.requestChannel } : {}),
    ...(input.context.deviceIdHash ? { deviceIdHash: input.context.deviceIdHash } : {}),
  };
  return { ...value, fingerprint: createBusinessDefinitionProjectionFingerprint(value) };
}

export function brainActionSituationContextIssue(
  value: BrainActionSituationContext,
  input: {
    profileFingerprint: string;
    runId: number;
    conversationId: number;
    context: Pick<BrainRequestContext, 'storeId' | 'userId' | 'requestChannel' | 'deviceIdHash'>;
    qualifiedRole: BrainActionQualifiedRole;
    now?: Date;
  },
): string | undefined {
  const { fingerprint, ...fingerprintInput } = value;
  if (
    value.schemaVersion !== '1.0' ||
    !/^[a-f0-9]{64}$/u.test(fingerprint) ||
    fingerprint !== createBusinessDefinitionProjectionFingerprint(fingerprintInput)
  ) {
    return 'action_situation_context_fingerprint_invalid';
  }
  if (value.profileFingerprint !== input.profileFingerprint) return 'action_situation_profile_mismatch';
  if (value.runId !== input.runId) return 'action_situation_run_mismatch';
  if (value.conversationId !== input.conversationId) return 'action_situation_conversation_mismatch';
  if (value.storeId !== input.context.storeId) return 'action_situation_store_mismatch';
  if (value.actorUserId !== input.context.userId) return 'action_situation_actor_mismatch';
  if (value.qualifiedRole !== input.qualifiedRole) return 'action_situation_role_mismatch';
  if (value.timezone !== BUSINESS_TIME_ZONE) return 'action_situation_timezone_mismatch';
  if (value.businessDate !== formatBusinessDate(input.now ?? new Date())) {
    return 'action_situation_business_date_expired';
  }
  if (value.requestChannel && value.requestChannel !== input.context.requestChannel) {
    return 'action_situation_request_channel_mismatch';
  }
  if (value.deviceIdHash && value.deviceIdHash !== input.context.deviceIdHash) {
    return 'action_situation_device_mismatch';
  }
  return undefined;
}
