import { createHash } from 'node:crypto';

export function normalizePurchaseOrderSource(value: unknown) {
  const source = String(value ?? '').trim().toLowerCase();
  return source || 'manual';
}

export function buildPurchaseOrderIdempotencyKey(storeId: unknown, source: unknown, value: unknown) {
  const key = String(value ?? '').trim();
  if (!key) return undefined;
  const storeScope = positiveId(storeId) ?? 0;
  return createHash('sha256')
    .update(`purchase-order:${storeScope}:${normalizePurchaseOrderSource(source)}:${key}`)
    .digest('hex');
}

export function buildPurchaseOrderCreationFingerprint(input: Record<string, unknown>) {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems
    .map((raw) => {
      const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      return {
        productId: positiveId(item.productId),
        productName: text(item.productName),
        sku: text(item.sku),
        quantity: number(item.quantity),
        unitPrice: number(item.unitPrice),
      };
    })
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const payload = {
    storeId: positiveId(input.storeId) ?? 0,
    source: normalizePurchaseOrderSource(input.source),
    supplier: text(input.supplier),
    expectedDate: date(input.expectedDate),
    status: text(input.status) || '草稿',
    items,
  };
  return createHash('sha256').update(`purchase-order-create:${JSON.stringify(payload)}`).digest('hex');
}

function positiveId(value: unknown) {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : null;
}

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function date(value: unknown) {
  const textValue = text(value);
  if (!textValue) return '';
  const parsed = new Date(textValue);
  return Number.isNaN(parsed.getTime()) ? textValue : parsed.toISOString().slice(0, 10);
}
