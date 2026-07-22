import type { PrismaService } from '../../prisma/prisma.service.js';
import { TERMINAL_PERMISSION_CODES } from '../../terminal/terminal-role-permissions.js';

type RolePermissionReader = Pick<PrismaService, 'role'>;

export async function loadRegisteredBrainPermissionCodes(prisma: RolePermissionReader): Promise<ReadonlySet<string>> {
  const roles = await prisma.role.findMany({
    where: { status: 'active' },
    select: { permissions: true },
  });
  const permissions = new Set<string>(TERMINAL_PERMISSION_CODES);
  for (const role of roles) {
    if (!Array.isArray(role.permissions)) continue;
    for (const permission of role.permissions) {
      if (typeof permission === 'string' && permission.trim() && permission !== '*') {
        permissions.add(permission.trim());
      }
    }
  }
  return permissions;
}
