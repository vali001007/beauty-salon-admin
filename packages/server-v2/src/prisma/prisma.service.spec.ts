import { resolveDatabasePoolConfig } from './prisma.service.js';

describe('resolveDatabasePoolConfig', () => {
  it('keeps two reusable connections outside production', () => {
    expect(resolveDatabasePoolConfig({ NODE_ENV: 'development' })).toEqual({
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  });

  it('keeps the production default pool size', () => {
    expect(resolveDatabasePoolConfig({ NODE_ENV: 'production' }).max).toBe(5);
  });

  it('accepts explicit positive integer overrides', () => {
    expect(
      resolveDatabasePoolConfig({
        NODE_ENV: 'development',
        DATABASE_POOL_MAX: '2',
        DATABASE_IDLE_TIMEOUT_MS: '20000',
        DATABASE_CONNECTION_TIMEOUT_MS: '30000',
      }),
    ).toEqual({
      max: 2,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 30000,
    });
  });

  it('falls back safely for invalid pool values', () => {
    expect(
      resolveDatabasePoolConfig({
        NODE_ENV: 'development',
        DATABASE_POOL_MAX: '0',
        DATABASE_IDLE_TIMEOUT_MS: 'not-a-number',
        DATABASE_CONNECTION_TIMEOUT_MS: '-1',
      }),
    ).toEqual({
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  });
});
