import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('reservation creation idempotency migration', () => {
  it('keeps the Prisma model and migration contract aligned', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260718203000_reservation_creation_idempotency/migration.sql'),
      'utf8',
    );

    expect(schema).toMatch(/model Reservation \{[\s\S]*idempotencyKey\s+String\?\s+@unique/);
    expect(schema).toMatch(/model Reservation \{[\s\S]*creationFingerprint\s+String\?\s+@db\.VarChar\(64\)/);
    expect(migration).toContain('ADD COLUMN "idempotencyKey" TEXT');
    expect(migration).toContain('ADD COLUMN "creationFingerprint" VARCHAR(64)');
    expect(migration).toContain('CREATE UNIQUE INDEX "Reservation_idempotencyKey_key"');
  });
});
