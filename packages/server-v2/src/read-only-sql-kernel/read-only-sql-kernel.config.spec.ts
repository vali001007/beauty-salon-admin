import { readOnlySqlKernelConfig } from './read-only-sql-kernel.config.js';

describe('readOnlySqlKernelConfig', () => {
  it('does not fall back to the business database by default', () => {
    const config = readOnlySqlKernelConfig({ DATABASE_URL: 'postgresql://admin:secret@example.invalid/db' });
    expect(config.readonlyDatabaseUrl).toBeUndefined();
    expect(config.connectionMode).toBe('unavailable');
  });

  it('allows an explicit development-only admin database smoke mode', () => {
    const config = readOnlySqlKernelConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://admin:secret@example.invalid/db',
      ASK_DATA_FREE_SQL_DEV_USE_ADMIN_DATABASE_URL: 'true',
    });
    expect(config.readonlyDatabaseUrl).toContain('admin:secret');
    expect(config.connectionMode).toBe('development_admin');
  });

  it('prefers a dedicated read-only URL even when the development flag is present', () => {
    const config = readOnlySqlKernelConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://admin:secret@example.invalid/db',
      ASK_DATA_FREE_SQL_READONLY_DATABASE_URL: 'postgresql://readonly:secret@example.invalid/db',
      ASK_DATA_FREE_SQL_DEV_USE_ADMIN_DATABASE_URL: 'true',
    });
    expect(config.readonlyDatabaseUrl).toContain('readonly:secret');
    expect(config.connectionMode).toBe('dedicated_readonly');
  });

  it('hard-fails when the development admin flag is enabled in production', () => {
    expect(() =>
      readOnlySqlKernelConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://admin:secret@example.invalid/db',
        ASK_DATA_FREE_SQL_DEV_USE_ADMIN_DATABASE_URL: 'true',
      }),
    ).toThrow('forbidden in production');
  });
});
