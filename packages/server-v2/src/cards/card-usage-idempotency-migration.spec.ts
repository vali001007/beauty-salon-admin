import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('card usage action idempotency migration', () => {
  it('keeps the Prisma model and migration contract aligned', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260718190000_card_usage_action_idempotency/migration.sql'),
      'utf8',
    );

    expect(schema).toMatch(/model CardUsageRecord \{[\s\S]*idempotencyKey\s+String\?\s+@unique/);
    expect(migration).toContain('ADD COLUMN "idempotencyKey" TEXT');
    expect(migration).toContain('CREATE UNIQUE INDEX "CardUsageRecord_idempotencyKey_key"');
  });
});
