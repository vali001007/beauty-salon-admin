import { createHash } from 'node:crypto';

export function buildCardUsageIdempotencyKey(storeId: number, value: unknown) {
  const key = String(value ?? '').trim();
  if (!key) return undefined;
  return createHash('sha256').update(`card_usage:${storeId}:${key}`).digest('hex');
}
