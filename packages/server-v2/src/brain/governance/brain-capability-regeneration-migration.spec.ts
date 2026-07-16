import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Brain capability regeneration migration contract', () => {
  it('requires a leased job to have an expiry after its lease start', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260714235000_ami_brain_capability_regeneration_jobs/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('"leaseExpiresAt" > "leasedAt"');
  });
});
