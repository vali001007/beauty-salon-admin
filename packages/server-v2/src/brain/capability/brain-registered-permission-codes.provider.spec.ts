import { loadRegisteredBrainPermissionCodes } from './brain-registered-permission-codes.provider.js';

describe('loadRegisteredBrainPermissionCodes', () => {
  it('combines active backend roles with the terminal permission catalog without treating wildcard as registration', async () => {
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

    expect(result.has('core:brain:use')).toBe(true);
    expect(result.has('core:store:reservations')).toBe(true);
    expect(result.has('aura:service-record:create')).toBe(true);
    expect(result.has('*')).toBe(false);
    expect(prisma.role.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { permissions: true },
    });
  });
});
