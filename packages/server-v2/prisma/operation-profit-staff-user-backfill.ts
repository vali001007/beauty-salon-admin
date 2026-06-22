import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type BackfillArgs = {
  storeId?: number;
  file: string;
  apply: boolean;
  yes: boolean;
};

type StaffUserInput = {
  action?: string;
  beauticianId: number;
  username: string;
  name: string;
  phone?: string | null;
  roleKey?: string;
  storeId: number;
  confirmedBy?: string;
  source?: string;
  reason?: string;
};

type PlannedStaffUser = {
  beauticianId: number;
  beauticianName: string;
  username: string;
  name: string;
  phone?: string | null;
  roleId: number;
  roleKey: string;
  storeId: number;
  confirmedBy?: string;
  source?: string;
  reason?: string;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): BackfillArgs {
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--') && !arg.includes('=')));
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : undefined;
  const file = args.get('file');
  if (!file) {
    throw new Error('--file is required. Provide a confirmed staff user JSON file.');
  }
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }
  return { storeId, file, apply: flags.has('--apply'), yes: flags.has('--yes') };
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function isBusinessConfirmed(value: unknown) {
  const confirmedBy = String(value ?? '').trim();
  const placeholders = new Set(['pending_business_confirmation', '业务确认人', '待确认', 'TODO', 'todo']);
  return Boolean(confirmedBy && !placeholders.has(confirmedBy) && !confirmedBy.toLowerCase().includes('todo'));
}

function assertNoPendingOrDraftApplyFile(file: string) {
  const normalizedFile = file.replace(/\\/g, '/').toLowerCase();
  if (normalizedFile.includes('.pending.') || normalizedFile.includes('.draft.') || normalizedFile.includes('/operation-profit-confirmation-drafts/')) {
    throw new Error('创建并绑定员工账号不能使用 pending/draft 确认文件；请复制为正式确认 JSON 并完成业务确认后再 --apply --yes。');
  }
}

function resolveExistingFile(file: string) {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`Staff user confirmation file not found: ${file}`);
  }
  return filePath;
}

function loadStaffUsers(file: string): StaffUserInput[] {
  const parsed = JSON.parse(readFileSync(resolveExistingFile(file), 'utf8'));
  const users = Array.isArray(parsed) ? parsed : parsed?.users;
  if (!Array.isArray(users)) {
    throw new Error('Staff user file must be a JSON array or an object with users array.');
  }
  return users.map((item, index) => {
    const beauticianId = toNumber(item.beauticianId);
    const storeId = toNumber(item.storeId);
    const username = String(item.username ?? '').trim();
    const name = String(item.name ?? '').trim();
    if (!Number.isInteger(beauticianId) || beauticianId <= 0) throw new Error(`users[${index}].beauticianId must be a positive integer`);
    if (!Number.isInteger(storeId) || storeId <= 0) throw new Error(`users[${index}].storeId must be a positive integer`);
    if (username.length < 3) throw new Error(`users[${index}].username must be at least 3 characters`);
    if (!name) throw new Error(`users[${index}].name is required`);
    return {
      action: item.action ? String(item.action) : undefined,
      beauticianId,
      username,
      name,
      phone: item.phone ? String(item.phone) : undefined,
      roleKey: item.roleKey ? String(item.roleKey) : 'beautician',
      storeId,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
      source: item.source ? String(item.source) : undefined,
      reason: item.reason ? String(item.reason) : undefined,
    };
  });
}

function readApplyPassword() {
  const password = process.env.OPERATION_PROFIT_NEW_STAFF_DEFAULT_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('创建员工账号前必须设置 OPERATION_PROFIT_NEW_STAFF_DEFAULT_PASSWORD，且长度至少 8 位。');
  }
  return password;
}

async function main() {
  const args = parseArgs();
  if (args.apply && !args.yes) {
    throw new Error('创建并绑定员工账号必须同时传入 --apply --yes；不传 --apply 时只 dry-run。');
  }
  if (args.apply && !args.storeId) {
    throw new Error('创建并绑定员工账号必须显式传入 --storeId，避免跨门店误写。');
  }
  if (args.apply) {
    assertNoPendingOrDraftApplyFile(args.file);
  }

  const inputs = loadStaffUsers(args.file);
  const beauticianIds = [...new Set(inputs.map((item) => item.beauticianId))];
  const usernames = [...new Set(inputs.map((item) => item.username))];
  const roleKeys = [...new Set(inputs.map((item) => item.roleKey ?? 'beautician'))];
  const storeIds = [...new Set(inputs.map((item) => item.storeId))];

  const [beauticians, existingUsers, roles, stores] = await Promise.all([
    prisma.beautician.findMany({
      where: { id: { in: beauticianIds } },
      select: { id: true, name: true, storeId: true, userId: true, status: true },
    }),
    prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true, username: true, name: true, status: true, deletedAt: true },
    }),
    prisma.role.findMany({
      where: { key: { in: roleKeys } },
      select: { id: true, key: true, status: true },
    }),
    prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, status: true },
    }),
  ]);

  const beauticianById = new Map<number, (typeof beauticians)[number]>(beauticians.map((item): [number, (typeof beauticians)[number]] => [item.id, item]));
  const existingUserByUsername = new Map(existingUsers.map((item): [string, (typeof existingUsers)[number]] => [item.username, item]));
  const roleByKey = new Map(roles.map((item): [string, (typeof roles)[number]] => [item.key, item]));
  const storeById = new Map(stores.map((item): [number, (typeof stores)[number]] => [item.id, item]));

  const planned: PlannedStaffUser[] = [];
  const skipped = {
    duplicateInput: [] as any[],
    unconfirmedBusinessApproval: [] as any[],
    missingBeautician: [] as any[],
    beauticianStoreMismatch: [] as any[],
    beauticianInactive: [] as any[],
    alreadyBound: [] as any[],
    usernameExists: [] as any[],
    missingRole: [] as any[],
    roleInactive: [] as any[],
    missingStore: [] as any[],
    storeInactive: [] as any[],
  };
  const seenBeauticianIds = new Set<number>();
  const seenUsernames = new Set<string>();

  for (const input of inputs) {
    if (seenBeauticianIds.has(input.beauticianId) || seenUsernames.has(input.username)) {
      skipped.duplicateInput.push({ beauticianId: input.beauticianId, username: input.username });
      continue;
    }
    seenBeauticianIds.add(input.beauticianId);
    seenUsernames.add(input.username);

    const beautician = beauticianById.get(input.beauticianId);
    const role = roleByKey.get(input.roleKey ?? 'beautician');
    const store = storeById.get(input.storeId);
    const existingUser = existingUserByUsername.get(input.username);

    if (args.apply && !isBusinessConfirmed(input.confirmedBy)) {
      skipped.unconfirmedBusinessApproval.push({ beauticianId: input.beauticianId, username: input.username, confirmedBy: input.confirmedBy ?? null });
      continue;
    }
    if (!beautician) {
      skipped.missingBeautician.push({ beauticianId: input.beauticianId, username: input.username });
      continue;
    }
    if (args.storeId && input.storeId !== args.storeId) {
      skipped.beauticianStoreMismatch.push({ beauticianId: beautician.id, inputStoreId: input.storeId, expectedStoreId: args.storeId });
      continue;
    }
    if (beautician.storeId !== input.storeId) {
      skipped.beauticianStoreMismatch.push({ beauticianId: beautician.id, beauticianStoreId: beautician.storeId, inputStoreId: input.storeId });
      continue;
    }
    if (beautician.status !== 'active') {
      skipped.beauticianInactive.push({ beauticianId: beautician.id, status: beautician.status });
      continue;
    }
    if (toNumber(beautician.userId) > 0) {
      skipped.alreadyBound.push({ beauticianId: beautician.id, existingUserId: beautician.userId });
      continue;
    }
    if (existingUser) {
      skipped.usernameExists.push({ beauticianId: beautician.id, username: existingUser.username, existingUserId: existingUser.id });
      continue;
    }
    if (!role) {
      skipped.missingRole.push({ beauticianId: beautician.id, roleKey: input.roleKey ?? 'beautician' });
      continue;
    }
    if (role.status !== 'active') {
      skipped.roleInactive.push({ beauticianId: beautician.id, roleKey: role.key, status: role.status });
      continue;
    }
    if (!store) {
      skipped.missingStore.push({ beauticianId: beautician.id, storeId: input.storeId });
      continue;
    }
    if (store.status !== 'active') {
      skipped.storeInactive.push({ beauticianId: beautician.id, storeId: store.id, status: store.status });
      continue;
    }

    planned.push({
      beauticianId: beautician.id,
      beauticianName: beautician.name,
      username: input.username,
      name: input.name,
      phone: input.phone,
      roleId: role.id,
      roleKey: role.key,
      storeId: input.storeId,
      confirmedBy: input.confirmedBy,
      source: input.source,
      reason: input.reason,
    });
  }

  const created: any[] = [];
  if (args.apply) {
    const passwordHash = await bcrypt.hash(readApplyPassword(), 12);
    for (const item of planned) {
      const user = await prisma.user.create({
        data: {
          username: item.username,
          passwordHash,
          name: item.name,
          phone: item.phone ?? undefined,
          roles: { create: [{ roleId: item.roleId }] },
          stores: { create: [{ storeId: item.storeId }] },
        },
        select: { id: true, username: true, name: true, status: true },
      });
      await prisma.beautician.update({
        where: { id: item.beauticianId },
        data: { userId: user.id },
      });
      created.push({ ...user, beauticianId: item.beauticianId, storeId: item.storeId });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        storeId: args.storeId ?? null,
        file: args.file,
        summary: {
          inputUsers: inputs.length,
          plannedUsers: planned.length,
          createdUsers: created.length,
          skippedDuplicateInput: skipped.duplicateInput.length,
          skippedUnconfirmedBusinessApproval: skipped.unconfirmedBusinessApproval.length,
          skippedMissingBeautician: skipped.missingBeautician.length,
          skippedBeauticianStoreMismatch: skipped.beauticianStoreMismatch.length,
          skippedBeauticianInactive: skipped.beauticianInactive.length,
          skippedAlreadyBound: skipped.alreadyBound.length,
          skippedUsernameExists: skipped.usernameExists.length,
          skippedMissingRole: skipped.missingRole.length,
          skippedRoleInactive: skipped.roleInactive.length,
          skippedMissingStore: skipped.missingStore.length,
          skippedStoreInactive: skipped.storeInactive.length,
        },
        planned: planned.slice(0, 50),
        created: created.slice(0, 50),
        skipped: Object.fromEntries(Object.entries(skipped).map(([key, value]) => [key, value.slice(0, 20)])),
        nextStep: args.apply
          ? 'Copy created user ids into the beautician user binding confirmation JSON or rerun confirmation-audit; then continue confirmed dry-run.'
          : 'Review planned users. Re-run with a formal confirmed JSON, --apply --yes, and OPERATION_PROFIT_NEW_STAFF_DEFAULT_PASSWORD only after business approval.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
