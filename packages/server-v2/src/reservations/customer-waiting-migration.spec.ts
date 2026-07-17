import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('customer waiting episode migration', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260717233000_customer_waiting_episode_core/migration.sql'),
    'utf8',
  );

  it('creates a store-scoped waiting fact with structured outcomes and reasons', () => {
    expect(sql).toContain('CREATE TABLE "customer_waiting_episode"');
    expect(sql).toContain("'wait_too_long'");
    expect(sql).toContain('customer_waiting_episode_end_check');
    expect(sql).toContain('customer_waiting_episode_storeId_fkey');
    expect(sql).toContain('customer_waiting_episode_reservationId_fkey');
  });

  it('prevents duplicate active waiting episodes for the same reservation', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "customer_waiting_episode_active_reservation_key"');
    expect(sql).toContain('WHERE "status" = \'waiting\' AND "reservationId" IS NOT NULL');
  });
});
