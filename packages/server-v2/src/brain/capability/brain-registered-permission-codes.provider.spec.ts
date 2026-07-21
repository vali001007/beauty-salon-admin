import { loadRegisteredBrainPermissionCodes } from './brain-registered-permission-codes.provider.js';

describe('loadRegisteredBrainPermissionCodes', () => {
  it('builds the registry from active backend roles and does not treat super-admin wildcard as registration', async () => {
    const prisma = {
      role: {
        findMany: jest.fn().mockResolvedValue([
          { permissions: ['*'] },
          { permissions: ['core:brain:use', 'core:store:reservations'] },
          { permissions: ['core:brain:use', '', 7] },
        ]),
      },
    };

    const result = await loadRegisteredBrainPermissionCodes(prisma as never);

    expect([...result].sort()).toEqual(['core:brain:use', 'core:store:reservations']);
    expect(prisma.role.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { permissions: true },
    });
  });
});
