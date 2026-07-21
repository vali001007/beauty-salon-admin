import { createHash } from 'node:crypto';

export function normalizeFollowUpTaskSource(value: unknown) {
  const source = String(value ?? '').trim().toLowerCase();
  return source || 'recommendation';
}

export function buildFollowUpTaskIdempotencyKey(storeId: unknown, source: unknown, value: unknown) {
  const key = String(value ?? '').trim();
  if (!key) return undefined;
  const storeScope = positiveId(storeId) ?? 0;
  return createHash('sha256')
    .update(`follow-up-task:${storeScope}:${normalizeFollowUpTaskSource(source)}:${key}`)
    .digest('hex');
}

export function buildFollowUpTaskCreationFingerprint(input: Record<string, unknown>) {
  const payload = {
    storeId: positiveId(input.storeId) ?? 0,
    source: normalizeFollowUpTaskSource(input.source),
    customerId: positiveId(input.customerId),
    recommendationId: positiveId(input.recommendationId),
    recommendationInstanceId: text(input.recommendationInstanceId),
    adoptionId: positiveId(input.adoptionId),
    sourceRecommendationKey: text(input.sourceRecommendationKey),
    triggerType: text(input.triggerType),
    promotionId: positiveId(input.promotionId),
    promotionName: text(input.promotionName),
    title: text(input.title),
    priority: text(input.priority),
    assigneeRole: text(input.assigneeRole),
    assigneeUserId: positiveId(input.assigneeUserId),
    assigneeBeauticianId: positiveId(input.assigneeBeauticianId),
    taskId: positiveId(input.taskId),
    orderId: positiveId(input.orderId),
    reservationId: positiveId(input.reservationId),
    channel: text(input.channel) || 'phone',
    script: text(input.script),
    note: text(input.note ?? input.remark),
    dueAt: dateTime(input.dueAt),
    offerJson: stable(input.offerJson),
    attribution: stable(input.attribution),
  };
  return createHash('sha256').update(`follow-up-task-create:${JSON.stringify(payload)}`).digest('hex');
}

function positiveId(value: unknown) {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : null;
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function dateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]),
  );
}
