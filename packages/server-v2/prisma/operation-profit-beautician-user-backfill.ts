import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type BackfillArgs = {
  storeId?: number;
  file: string;
  apply: boolean;
  yes: boolean;
};

type BindingInput = {
  beauticianId?: number;
  userId: number;
  source?: string;
  reason?: string;
  confirmedBy?: string;
};

type PlannedBinding = {
  beauticianId: number;
  beauticianName: string;
  previousUserId?: number | null;
  userId: number;
  userName: string;
  username: string;
  storeId: number;
  source?: string;
  reason?: string;
  confirmedBy?: string;
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
    throw new Error('--file is required. Provide a confirmed JSON file of beauticianId and userId pairs.');
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
    throw new Error('写入美容师账号绑定不能使用 pending/draft 确认文件；请复制为正式确认 JSON 并完成业务确认后再 --apply --yes。');
  }
}

function loadBindings(file: string): BindingInput[] {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`Beautician user binding file not found: ${file}`);
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  const bindings = Array.isArray(parsed) ? parsed : parsed?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error('Binding file must be a JSON array or an object with bindings array.');
  }
  return bindings.map((item, index) => {
    const beauticianId = toNumber(item.beauticianId);
    const userId = toNumber(item.userId);
    if (!Number.isInteger(beauticianId) || beauticianId <= 0) {
      throw new Error(`bindings[${index}].beauticianId must be a positive integer`);
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error(`bindings[${index}].userId must be a positive integer`);
    }
    return {
      beauticianId,
      userId,
      source: item.source ? String(item.source) : undefined,
      reason: item.reason ? String(item.reason) : undefined,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
    };
  });
}

async function main() {
  const args = parseArgs();
  if (args.apply && !args.yes) {
    throw new Error('写入美容师账号绑定必须同时传入 --apply --yes；不传 --apply 时只 dry-run。');
  }
  if (args.apply && !args.storeId) {
    throw new Error('写入美容师账号绑定必须显式传入 --storeId，避免跨门店误写。');
  }
  if (args.apply) {
    assertNoPendingOrDraftApplyFile(args.file);
  }

  const bindings = loadBindings(args.file);
  const beauticianIds = [...new Set(bindings.map((item) => item.beauticianId!))];
  const userIds = [...new Set(bindings.map((item) => item.userId))];
  const [beauticians, users, userStores] = await Promise.all([
    prisma.beautician.findMany({
      where: { id: { in: beauticianIds } },
      select: { id: true, name: true, storeId: true, userId: true, status: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, name: true, status: true, deletedAt: true },
    }),
    prisma.userStore.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, storeId: true },
    }),
  ]);
  const beauticianById = new Map<number, (typeof beauticians)[number]>(beauticians.map((item): [number, (typeof beauticians)[number]] => [item.id, item]));
  const userById = new Map<number, (typeof users)[number]>(users.map((item): [number, (typeof users)[number]] => [item.id, item]));
  const userStoreKeys = new Set(userStores.map((item) => `${item.userId}:${item.storeId}`));

  const planned: PlannedBinding[] = [];
  const skipped = {
    duplicateInput: [] as any[],
    missingBeautician: [] as any[],
    beauticianStoreMismatch: [] as any[],
    beauticianInactive: [] as any[],
    alreadyBound: [] as any[],
    missingUser: [] as any[],
    userInactive: [] as any[],
    userStoreMismatch: [] as any[],
    userAlreadyBoundToBeautician: [] as any[],
    unconfirmedBusinessApproval: [] as any[],
  };
  const seenBeauticianIds = new Set<number>();

  for (const binding of bindings) {
    const beauticianId = binding.beauticianId!;
    if (seenBeauticianIds.has(beauticianId)) {
      skipped.duplicateInput.push({ beauticianId, userId: binding.userId });
      continue;
    }
    seenBeauticianIds.add(beauticianId);

    const beautician = beauticianById.get(beauticianId);
    if (!beautician) {
      skipped.missingBeautician.push({ beauticianId, userId: binding.userId });
      continue;
    }
    if (args.apply && !isBusinessConfirmed(binding.confirmedBy)) {
      skipped.unconfirmedBusinessApproval.push({ beauticianId, userId: binding.userId, confirmedBy: binding.confirmedBy ?? null });
      continue;
    }
    if (args.storeId && beautician.storeId !== args.storeId) {
      skipped.beauticianStoreMismatch.push({ beauticianId, beauticianStoreId: beautician.storeId, expectedStoreId: args.storeId });
      continue;
    }
    if (beautician.status !== 'active') {
      skipped.beauticianInactive.push({ beauticianId, status: beautician.status });
      continue;
    }
    if (toNumber(beautician.userId) > 0) {
      skipped.alreadyBound.push({ beauticianId, existingUserId: beautician.userId, userId: binding.userId });
      continue;
    }

    const user = userById.get(binding.userId);
    if (!user) {
      skipped.missingUser.push({ beauticianId, userId: binding.userId });
      continue;
    }
    if (user.deletedAt || user.status !== 'active') {
      skipped.userInactive.push({ beauticianId, userId: user.id, status: user.status, deletedAt: user.deletedAt });
      continue;
    }
    if (!userStoreKeys.has(`${user.id}:${beautician.storeId}`)) {
      skipped.userStoreMismatch.push({ beauticianId, userId: user.id, beauticianStoreId: beautician.storeId });
      continue;
    }
    const existingBeautician = beauticians.find((item) => item.id !== beautician.id && item.storeId === beautician.storeId && item.userId === user.id);
    if (existingBeautician) {
      skipped.userAlreadyBoundToBeautician.push({
        beauticianId,
        userId: user.id,
        existingBeauticianId: existingBeautician.id,
        existingBeauticianName: existingBeautician.name,
      });
      continue;
    }

    planned.push({
      beauticianId: beautician.id,
      beauticianName: beautician.name,
      previousUserId: beautician.userId,
      userId: user.id,
      userName: user.name,
      username: user.username,
      storeId: beautician.storeId,
      source: binding.source,
      reason: binding.reason,
      confirmedBy: binding.confirmedBy,
    });
  }

  const updated: any[] = [];
  if (args.apply) {
    for (const item of planned) {
      const result = await prisma.beautician.update({
        where: { id: item.beauticianId },
        data: { userId: item.userId },
        select: { id: true, name: true, userId: true, storeId: true },
      });
      updated.push(result);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        storeId: args.storeId ?? null,
        file: args.file,
        summary: {
          inputBindings: bindings.length,
          plannedBindings: planned.length,
          updatedBeauticians: updated.length,
          skippedDuplicateInput: skipped.duplicateInput.length,
          skippedMissingBeautician: skipped.missingBeautician.length,
          skippedBeauticianStoreMismatch: skipped.beauticianStoreMismatch.length,
          skippedBeauticianInactive: skipped.beauticianInactive.length,
          skippedAlreadyBound: skipped.alreadyBound.length,
          skippedMissingUser: skipped.missingUser.length,
          skippedUserInactive: skipped.userInactive.length,
          skippedUserStoreMismatch: skipped.userStoreMismatch.length,
          skippedUserAlreadyBoundToBeautician: skipped.userAlreadyBoundToBeautician.length,
          skippedUnconfirmedBusinessApproval: skipped.unconfirmedBusinessApproval.length,
        },
        planned: planned.slice(0, 50),
        updated: updated.slice(0, 50),
        skipped: Object.fromEntries(Object.entries(skipped).map(([key, value]) => [key, value.slice(0, 20)])),
        nextStep: args.apply
          ? 'Re-run operation-profit:assignee-backfill in dry-run mode; previously skippedMissingStaffUser items can now proceed after business confirms assignments.'
          : 'Review planned bindings. Re-run with --apply --yes only after business approval.',
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
