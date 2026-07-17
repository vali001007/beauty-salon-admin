import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('store manager supply permission migration', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'prisma/migrations/20260717130000_store_manager_supply_manage_permission/migration.sql',
    ),
    'utf8',
  );

  it('registers the governed purchase permission on the active store manager role', () => {
    expect(sql).toContain("'core:supply:manage'");
    expect(sql).toContain('WHERE "key" = \'store_manager\'');
    expect(sql).toContain('AND "status" = \'active\'');
  });

  it('is idempotent and does not introduce wildcard permissions', () => {
    expect(sql).toContain('SELECT DISTINCT permission');
    expect(sql).not.toContain("ARRAY['*']");
  });
});
