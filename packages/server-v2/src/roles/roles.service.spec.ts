import { RolesService } from './roles.service.js';

describe('RolesService machine-only permissions', () => {
  it('rejects assigning receipt-ingest to a human role', async () => {
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 7, permissions: [], _count: { users: 0 } }),
        update: jest.fn(),
      },
    };
    const service = new RolesService(prisma as never);

    await expect(service.updatePermissions(7, ['core:brain-governance:receipt-ingest']))
      .rejects.toMatchObject({ message: 'machine_only_permission_not_role_assignable:core:brain-governance:receipt-ingest' });
    expect(prisma.role.update).not.toHaveBeenCalled();
  });

  it('keeps wildcard and ordinary governance permissions assignable', async () => {
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 7, permissions: [], _count: { users: 0 } }),
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
    };
    const service = new RolesService(prisma as never);

    await expect(service.updatePermissions(7, ['*', 'core:brain-governance:manage']))
      .resolves.toEqual({ id: 7 });
  });
});
