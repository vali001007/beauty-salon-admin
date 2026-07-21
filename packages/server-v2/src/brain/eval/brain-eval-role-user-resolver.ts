import type { PrismaService } from '../../prisma/prisma.service.js';

export type BrainEvalRoleUserMap = Record<string, number>;

const ROLE_ALIASES: Record<string, string[]> = {
  store_manager: ['store_manager', 'manager', 'ami_demo_full_manager'],
  receptionist: ['receptionist', 'front_desk', 'cashier', 'ami_demo_full_cashier'],
  marketing: ['marketing'],
  beautician: ['beautician', 'ami_demo_full_beautician'],
  inventory: ['inventory'],
  finance: ['finance', 'cashier', 'ami_demo_full_cashier'],
  customer_service: ['customer_service'],
};

export async function resolveBrainEvalRoleUsers(
  prisma: Pick<PrismaService, 'user'>,
  storeId: number,
  roleKeys: readonly string[],
): Promise<BrainEvalRoleUserMap> {
  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      deletedAt: null,
      stores: { some: { storeId } },
    },
    select: {
      id: true,
      username: true,
      roles: { select: { role: { select: { key: true } } } },
      beauticianProfiles: {
        where: { storeId, status: 'active' },
        select: { id: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  const fallbackUserId = users[0]?.id ?? 1;
  const result: BrainEvalRoleUserMap = {};
  for (const roleKey of roleKeys) {
    const aliases = new Set(ROLE_ALIASES[roleKey] ?? [roleKey]);
    const candidates = users.filter((user) => user.roles.some((item) => aliases.has(item.role.key)));
    const selected = roleKey === 'beautician'
      ? candidates.find((user) => user.beauticianProfiles.length > 0) ?? users.find((user) => user.beauticianProfiles.length > 0)
      : candidates[0];
    result[roleKey] = selected?.id ?? fallbackUserId;
  }
  return result;
}
