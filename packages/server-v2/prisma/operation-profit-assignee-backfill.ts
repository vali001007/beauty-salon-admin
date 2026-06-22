import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type BackfillArgs = {
  storeId?: number;
  from: Date;
  to: Date;
  file: string;
  apply: boolean;
  yes: boolean;
};

type AssignmentInput = {
  orderItemId?: number;
  itemId?: number;
  beauticianId: number;
  reason?: string;
  source?: string;
  confirmedBy?: string;
  resolution?: string;
};

type PlannedAssignment = {
  orderId: number;
  orderNo: string;
  orderItemId: number;
  orderItemType: string;
  orderItemName: string;
  storeId?: number | null;
  orderCreatedAt: string;
  previousBeauticianId?: number | null;
  beauticianId: number;
  beauticianName: string;
  staffUserId: number;
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

  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const fromText = args.get('from') ?? defaultFrom;
  const toText = args.get('to') ?? defaultTo;
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : undefined;
  const file = args.get('file');

  if (!file) {
    throw new Error('--file is required. Provide a confirmed JSON file of orderItemId and beauticianId pairs.');
  }
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }

  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('--from/--to must be valid date strings like 2026-06-01');
  }
  return { storeId, from, to, file, apply: flags.has('--apply'), yes: flags.has('--yes') };
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function normalizedItemType(value: unknown) {
  const type = String(value ?? '').toLowerCase();
  if (['product', 'goods'].includes(type)) return 'product';
  if (['project', 'service', 'service_project'].includes(type)) return 'project';
  return undefined;
}

function isBusinessConfirmed(value: unknown) {
  const confirmedBy = String(value ?? '').trim();
  const placeholders = new Set(['pending_business_confirmation', '业务确认人', '待确认', 'TODO', 'todo']);
  return Boolean(confirmedBy && !placeholders.has(confirmedBy) && !confirmedBy.toLowerCase().includes('todo'));
}

function assertNoPendingOrDraftApplyFile(file: string) {
  const normalizedFile = file.replace(/\\/g, '/').toLowerCase();
  if (normalizedFile.includes('.pending.') || normalizedFile.includes('.draft.') || normalizedFile.includes('/operation-profit-confirmation-drafts/')) {
    throw new Error('写入服务人归属不能使用 pending/draft 确认文件；请复制为正式确认 JSON 并完成业务确认后再 --apply --yes。');
  }
}

function loadAssignments(file: string): AssignmentInput[] {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`Assignment file not found: ${file}`);
  }
  const content = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(content);
  const isManualReviewFile = Array.isArray(parsed?.items) && !Array.isArray(parsed?.assignments);
  const sourceItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.assignments)
      ? parsed.assignments
      : Array.isArray(parsed?.items)
        ? parsed.items
        : undefined;
  const sourceLabel = isManualReviewFile ? 'manualReviewItems' : 'assignments';
  const assignments = sourceItems?.filter((item: any) => {
    const resolution = item.resolution ? String(item.resolution) : undefined;
    return !isManualReviewFile || resolution === 'assign';
  });
  if (!Array.isArray(assignments)) {
    throw new Error('Assignment file must be a JSON array, an object with assignments array, or an object with manual review items array.');
  }
  return assignments.map((item, index) => {
    const orderItemId = toNumber(item.orderItemId ?? item.itemId);
    const beauticianId = toNumber(item.beauticianId);
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) {
      throw new Error(`${sourceLabel}[${index}].orderItemId must be a positive integer`);
    }
    if (!Number.isInteger(beauticianId) || beauticianId <= 0) {
      throw new Error(`${sourceLabel}[${index}].beauticianId must be a positive integer when resolution is assign`);
    }
    return {
      orderItemId,
      beauticianId,
      reason: item.reason ? String(item.reason) : undefined,
      source: item.source ? String(item.source) : undefined,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
      resolution: item.resolution ? String(item.resolution) : undefined,
    };
  });
}

async function main() {
  const args = parseArgs();
  if (args.apply && !args.yes) {
    throw new Error('写入服务人归属必须同时传入 --apply --yes；不传 --apply 时只 dry-run。');
  }
  if (args.apply && !args.storeId) {
    throw new Error('写入服务人归属必须显式传入 --storeId，避免跨门店误写。');
  }
  if (args.apply) {
    assertNoPendingOrDraftApplyFile(args.file);
  }

  const assignments = loadAssignments(args.file);
  const orderItemIds = assignments.map((item) => item.orderItemId!);
  const beauticianIds = [...new Set(assignments.map((item) => item.beauticianId))];
  const [orderItems, beauticians] = await Promise.all([
    prisma.orderItem.findMany({
      where: { id: { in: orderItemIds } },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            storeId: true,
            status: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.beautician.findMany({
      where: { id: { in: beauticianIds } },
      select: { id: true, storeId: true, name: true, userId: true, status: true },
    }),
  ]);
  const orderItemById = new Map<number, (typeof orderItems)[number]>(orderItems.map((item): [number, (typeof orderItems)[number]] => [item.id, item]));
  const beauticianById = new Map<number, (typeof beauticians)[number]>(beauticians.map((beautician): [number, (typeof beauticians)[number]] => [beautician.id, beautician]));

  const planned: PlannedAssignment[] = [];
  const skipped = {
    duplicateInput: [] as any[],
    missingOrderItem: [] as any[],
    unsupportedItemType: [] as any[],
    alreadyAssigned: [] as any[],
    orderStatus: [] as any[],
    storeMismatch: [] as any[],
    dateOutOfRange: [] as any[],
    missingBeautician: [] as any[],
    beauticianStoreMismatch: [] as any[],
    missingStaffUser: [] as any[],
    unconfirmedBusinessApproval: [] as any[],
  };
  const seenOrderItemIds = new Set<number>();

  for (const assignment of assignments) {
    const orderItemId = assignment.orderItemId!;
    if (seenOrderItemIds.has(orderItemId)) {
      skipped.duplicateInput.push({ orderItemId, beauticianId: assignment.beauticianId });
      continue;
    }
    seenOrderItemIds.add(orderItemId);

    const orderItem = orderItemById.get(orderItemId);
    if (!orderItem) {
      skipped.missingOrderItem.push({ orderItemId, beauticianId: assignment.beauticianId });
      continue;
    }
    if (!normalizedItemType(orderItem.itemType)) {
      skipped.unsupportedItemType.push({ orderItemId, itemType: orderItem.itemType, beauticianId: assignment.beauticianId });
      continue;
    }
    if (args.apply && !isBusinessConfirmed(assignment.confirmedBy)) {
      skipped.unconfirmedBusinessApproval.push({ orderItemId, beauticianId: assignment.beauticianId, confirmedBy: assignment.confirmedBy ?? null });
      continue;
    }
    if (orderItem.beauticianId) {
      skipped.alreadyAssigned.push({ orderItemId, existingBeauticianId: orderItem.beauticianId, beauticianId: assignment.beauticianId });
      continue;
    }
    if (!['paid', 'completed'].includes(String(orderItem.order.status))) {
      skipped.orderStatus.push({ orderItemId, orderId: orderItem.order.id, status: orderItem.order.status });
      continue;
    }
    if (args.storeId && orderItem.order.storeId !== args.storeId) {
      skipped.storeMismatch.push({ orderItemId, orderId: orderItem.order.id, storeId: orderItem.order.storeId, expectedStoreId: args.storeId });
      continue;
    }
    if (orderItem.order.createdAt < args.from || orderItem.order.createdAt > args.to) {
      skipped.dateOutOfRange.push({ orderItemId, orderId: orderItem.order.id, orderCreatedAt: orderItem.order.createdAt });
      continue;
    }

    const beautician = beauticianById.get(assignment.beauticianId);
    if (!beautician) {
      skipped.missingBeautician.push({ orderItemId, beauticianId: assignment.beauticianId });
      continue;
    }
    if (orderItem.order.storeId && beautician.storeId !== orderItem.order.storeId) {
      skipped.beauticianStoreMismatch.push({
        orderItemId,
        orderStoreId: orderItem.order.storeId,
        beauticianId: beautician.id,
        beauticianStoreId: beautician.storeId,
      });
      continue;
    }
    if (!toNumber(beautician.userId)) {
      skipped.missingStaffUser.push({ orderItemId, beauticianId: beautician.id, beauticianName: beautician.name });
      continue;
    }

    planned.push({
      orderId: orderItem.order.id,
      orderNo: orderItem.order.orderNo,
      orderItemId,
      orderItemType: orderItem.itemType,
      orderItemName: orderItem.name,
      storeId: orderItem.order.storeId,
      orderCreatedAt: orderItem.order.createdAt.toISOString(),
      previousBeauticianId: orderItem.beauticianId,
      beauticianId: beautician.id,
      beauticianName: beautician.name,
      staffUserId: toNumber(beautician.userId),
      source: assignment.source,
      reason: assignment.reason,
      confirmedBy: assignment.confirmedBy,
    });
  }

  const updated: any[] = [];
  if (args.apply) {
    for (const item of planned) {
      const result = await prisma.orderItem.update({
        where: { id: item.orderItemId },
        data: { beauticianId: item.beauticianId },
        select: { id: true, orderId: true, beauticianId: true },
      });
      updated.push(result);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        storeId: args.storeId ?? null,
        from: args.from.toISOString(),
        to: args.to.toISOString(),
        file: args.file,
        summary: {
          inputAssignments: assignments.length,
          plannedAssignments: planned.length,
          updatedOrderItems: updated.length,
          skippedDuplicateInput: skipped.duplicateInput.length,
          skippedMissingOrderItem: skipped.missingOrderItem.length,
          skippedUnsupportedItemType: skipped.unsupportedItemType.length,
          skippedAlreadyAssigned: skipped.alreadyAssigned.length,
          skippedOrderStatus: skipped.orderStatus.length,
          skippedStoreMismatch: skipped.storeMismatch.length,
          skippedDateOutOfRange: skipped.dateOutOfRange.length,
          skippedMissingBeautician: skipped.missingBeautician.length,
          skippedBeauticianStoreMismatch: skipped.beauticianStoreMismatch.length,
          skippedMissingStaffUser: skipped.missingStaffUser.length,
          skippedUnconfirmedBusinessApproval: skipped.unconfirmedBusinessApproval.length,
        },
        planned: planned.slice(0, 50),
        updated: updated.slice(0, 50),
        skipped: Object.fromEntries(Object.entries(skipped).map(([key, value]) => [key, value.slice(0, 20)])),
        nextStep: args.apply
          ? 'Run operation-profit:backfill in dry-run mode to calculate commission records for the newly assigned order items.'
          : 'Review planned assignments. Re-run with --apply --yes only after business approval.',
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
