import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const activeUser = {
    id: 1,
    username: 'admin',
    name: '管理员',
    status: 'active',
    deletedAt: null,
    supplySupplierId: null,
    supplySupplier: null,
    roles: [{ role: { key: 'super_admin', permissions: ['*'] } }],
    stores: [{ storeId: 6 }],
  };

  function createStrategy(user: unknown, cacheTtlMs = 5_000) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        if (key === 'JWT_PRINCIPAL_CACHE_TTL_MS') return cacheTtlMs;
        return undefined;
      }),
    } as any;
    return { strategy: new JwtStrategy(config, prisma), prisma };
  }

  it('reuses a recently verified active user principal', async () => {
    const { strategy, prisma } = createStrategy(activeUser);

    const first = await strategy.validate({ sub: 1 });
    const second = await strategy.validate({ sub: 1 });

    expect(second).toEqual(first);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('does not cache a denied user', async () => {
    const { strategy, prisma } = createStrategy({ ...activeUser, status: 'disabled' });

    await expect(strategy.validate({ sub: 1 })).resolves.toBeNull();
    await expect(strategy.validate({ sub: 1 })).resolves.toBeNull();

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('can disable principal caching through configuration', async () => {
    const { strategy, prisma } = createStrategy(activeUser, 0);

    await strategy.validate({ sub: 1 });
    await strategy.validate({ sub: 1 });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});
