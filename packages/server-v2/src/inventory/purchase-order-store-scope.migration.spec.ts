import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PurchaseOrder store scope migration', () => {
  it('backfills the legacy JSON store, fails closed, and adds the relational scope contract', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260730143000_purchase_order_store_scope/migration.sql'),
      'utf8',
    );

    expect(sql).toContain('ADD COLUMN "storeId" INTEGER');
    expect(sql).toContain('SET "storeId" = ("items" ->> \'storeId\')::INTEGER');
    expect(sql).toContain('purchase_order."items" -> \'items\'');
    expect(sql).toContain('HAVING COUNT(*) = 1');
    expect(sql).toContain('product."sku" = legacy_items.sku');
    expect(sql).toContain('store_record."createdAt" <= purchase_order."createdAt"');
    expect(sql).toContain('purchase_order_store_scope_backfill_incomplete');
    expect(sql).toContain('purchase_order_store_scope_store_missing');
    expect(sql).toContain('ALTER COLUMN "storeId" SET NOT NULL');
    expect(sql).toContain('CONSTRAINT "PurchaseOrder_storeId_fkey"');
    expect(sql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(sql).toContain('"PurchaseOrder_storeId_createdAt_idx"');
    expect(sql).toContain('"PurchaseOrder_storeId_status_idx"');
  });

  it('keeps the pending Action Ontology migration free of duplicate provenance columns', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260730120000_ami_brain_action_ontology_v1/migration.sql'),
      'utf8',
    );

    expect(sql.match(/ADD COLUMN IF NOT EXISTS "boundCapabilityKey"/g)).toHaveLength(1);
  });
});
