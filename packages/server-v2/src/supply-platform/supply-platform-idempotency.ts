import { createHash } from 'node:crypto';

export function normalizeProcurementSource(value: unknown) {
  const source = String(value ?? '')
    .trim()
    .toLowerCase();
  return source || 'manual';
}

export function buildProcurementOrderIdempotencyKey(storeId: unknown, sourceType: unknown, value: unknown) {
  return scopedHash('procurement-order', [positiveId(storeId) ?? 0, normalizeProcurementSource(sourceType)], value);
}

export function buildProcurementBatchIdempotencyKey(storeId: unknown, value: unknown) {
  return scopedHash('procurement-order-batch', [positiveId(storeId) ?? 0, 'inventory_replenishment'], value);
}

export function buildProcurementReceiptIdempotencyKey(orderId: unknown, value: unknown) {
  return scopedHash('procurement-receipt', [positiveId(orderId) ?? 0], value);
}

export function buildProcurementOrderCreationFingerprint(input: Record<string, unknown>) {
  return fingerprint('procurement-order-create', {
    storeId: positiveId(input.storeId),
    supplierId: positiveId(input.supplierId),
    expectedArrivalDate: dateOnly(input.expectedArrivalDate),
    sourceType: normalizeProcurementSource(input.sourceType),
    sourceNo: text(input.sourceNo),
    items: sortedItems(input.items, (item) => ({
      productId: positiveId(item.productId),
      supplySkuId: positiveId(item.supplySkuId),
      quoteId: positiveId(item.quoteId),
      quantity: positiveNumber(item.quantity),
      unitPrice: optionalNumber(item.unitPrice),
    })),
  });
}

export function buildProcurementBatchCreationFingerprint(input: Record<string, unknown>) {
  return fingerprint('procurement-order-batch-create', {
    storeId: positiveId(input.storeId),
    expectedArrivalDate: dateOnly(input.expectedArrivalDate),
    sourceNo: text(input.sourceNo),
    items: sortedItems(input.items, (item) => ({
      productId: positiveId(item.productId),
      mappingId: positiveId(item.mappingId),
      supplySkuId: positiveId(item.supplySkuId),
      quoteId: positiveId(item.quoteId),
      quantity: positiveNumber(item.quantity),
    })),
  });
}

export function buildProcurementReceiptCreationFingerprint(orderId: unknown, input: Record<string, unknown>) {
  return fingerprint('procurement-receipt-create', {
    orderId: positiveId(orderId),
    remark: text(input.remark),
    items: sortedItems(input.items, (item) => ({
      shipmentItemId: positiveId(item.shipmentItemId),
      productId: positiveId(item.productId),
      receivedQty: positiveNumber(item.receivedQty),
    })),
  });
}

function scopedHash(prefix: string, scope: Array<string | number>, value: unknown) {
  const key = text(value);
  if (!key) return undefined;
  return createHash('sha256')
    .update(`${prefix}:${scope.join(':')}:${key}`)
    .digest('hex');
}

function fingerprint(prefix: string, payload: unknown) {
  return createHash('sha256')
    .update(`${prefix}:${JSON.stringify(stable(payload))}`)
    .digest('hex');
}

function sortedItems(value: unknown, map: (item: Record<string, unknown>) => Record<string, unknown>) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => map(item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
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

function positiveId(value: unknown) {
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : null;
}

function positiveNumber(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function dateOnly(value: unknown) {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}
