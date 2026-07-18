import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('supply platform idempotency migration', () => {
  it('keeps procurement order and receipt contracts aligned', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260718234500_supply_platform_idempotency/migration.sql'),
      'utf8',
    );

    expect(schema).toMatch(/model ProcurementOrder \{[\s\S]*idempotencyKey\s+String\?\s+@unique/);
    expect(schema).toMatch(/model ProcurementOrder \{[\s\S]*batchIdempotencyKey\s+String\?/);
    expect(schema).toMatch(/model ProcurementReceipt \{[\s\S]*idempotencyKey\s+String\s+@unique/);
    expect(schema).toMatch(/model ProcurementReceipt \{[\s\S]*creationFingerprint\s+String\s+@db\.VarChar\(64\)/);
    expect(migration).toContain('CREATE UNIQUE INDEX "ProcurementOrder_idempotencyKey_key"');
    expect(migration).toContain('CREATE INDEX "ProcurementOrder_batchIdempotencyKey_idx"');
    expect(migration).toContain('CREATE TABLE "ProcurementReceipt"');
    expect(migration).toContain('CREATE UNIQUE INDEX "ProcurementReceipt_idempotencyKey_key"');
  });
});
