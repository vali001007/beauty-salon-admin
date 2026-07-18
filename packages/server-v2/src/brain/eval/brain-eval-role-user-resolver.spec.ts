import { resolveBrainEvalRoleUsers } from './brain-eval-role-user-resolver.js';

describe('resolveBrainEvalRoleUsers', () => {
  it('uses a store-linked beautician profile for self-scoped evaluation questions', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, username: 'admin', roles: [{ role: { key: 'super_admin' } }], beauticianProfiles: [] },
          { id: 31, username: 'frontdesk', roles: [{ role: { key: 'ami_demo_full_cashier' } }], beauticianProfiles: [] },
          { id: 32, username: 'beautician', roles: [{ role: { key: 'beautician' } }], beauticianProfiles: [{ id: 40 }] },
        ]),
      },
    };

    await expect(resolveBrainEvalRoleUsers(prisma as never, 6, ['receptionist', 'beautician', 'inventory'])).resolves.toEqual({
      receptionist: 31,
      beautician: 32,
      inventory: 1,
    });
  });
});
