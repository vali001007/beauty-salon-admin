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

type ProjectMasterFixInput = {
  orderItemId?: number;
  itemId?: number;
  targetProjectId?: number;
  projectId?: number;
  targetProjectName?: string;
  resolution?: string;
  source?: string;
  reason?: string;
  confirmedBy?: string;
};

type PlannedProjectMasterFix = {
  orderId: number;
  orderNo: string;
  storeId?: number | null;
  orderCreatedAt: string;
  orderItemId: number;
  itemType: string;
  previousItemId?: number | null;
  previousName: string;
  targetProjectId: number;
  targetProjectName: string;
  targetProjectType?: string | null;
  targetProjectPrice: number;
  targetProjectBomCount: number;
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
    throw new Error('--file is required. Provide a confirmed JSON file of orderItemId and targetProjectId pairs.');
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

function isProjectItem(value: unknown) {
  return ['project', 'service', 'service_project'].includes(String(value ?? '').toLowerCase());
}

function isBusinessConfirmed(value: unknown) {
  const confirmedBy = String(value ?? '').trim();
  const placeholders = new Set(['pending_business_confirmation', '业务确认人', '待确认', 'TODO', 'todo']);
  return Boolean(confirmedBy && !placeholders.has(confirmedBy) && !confirmedBy.toLowerCase().includes('todo'));
}

function assertNoPendingOrDraftApplyFile(file: string) {
  const normalizedFile = file.replace(/\\/g, '/').toLowerCase();
  if (normalizedFile.includes('.pending.') || normalizedFile.includes('.draft.') || normalizedFile.includes('/operation-profit-confirmation-drafts/')) {
    throw new Error('写入项目档案修复不能使用 pending/draft 确认文件；请复制为正式确认 JSON 并完成业务确认后再 --apply --yes。');
  }
}

function loadFixes(file: string): ProjectMasterFixInput[] {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`Project master fix file not found: ${file}`);
  }
  const content = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(content);
  const sourceFixes = Array.isArray(parsed) ? parsed : parsed?.fixes;
  const fixes = sourceFixes?.filter((item: any) => {
    const resolution = item.resolution ? String(item.resolution) : undefined;
    return !resolution || resolution === 'repair_project';
  });
  if (!Array.isArray(fixes)) {
    throw new Error('Project master fix file must be a JSON array or an object with fixes array.');
  }
  return fixes.map((item, index) => {
    const orderItemId = toNumber(item.orderItemId ?? item.itemId);
    const targetProjectId = toNumber(item.targetProjectId ?? item.projectId);
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) {
      throw new Error(`fixes[${index}].orderItemId must be a positive integer`);
    }
    if (!Number.isInteger(targetProjectId) || targetProjectId <= 0) {
      throw new Error(`fixes[${index}].targetProjectId must be a positive integer`);
    }
    return {
      orderItemId,
      targetProjectId,
      targetProjectName: item.targetProjectName ? String(item.targetProjectName) : undefined,
      resolution: item.resolution ? String(item.resolution) : undefined,
      source: item.source ? String(item.source) : undefined,
      reason: item.reason ? String(item.reason) : undefined,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
    };
  });
}

async function main() {
  const args = parseArgs();
  if (args.apply && !args.yes) {
    throw new Error('写入项目档案修复必须同时传入 --apply --yes；不传 --apply 时只 dry-run。');
  }
  if (args.apply && !args.storeId) {
    throw new Error('写入项目档案修复必须显式传入 --storeId，避免跨门店误写。');
  }
  if (args.apply) {
    assertNoPendingOrDraftApplyFile(args.file);
  }

  const fixes = loadFixes(args.file);
  if (fixes.length === 0) {
    console.log(
      JSON.stringify(
        {
          mode: args.apply ? 'apply' : 'dry-run',
          storeId: args.storeId ?? null,
          from: args.from.toISOString(),
          to: args.to.toISOString(),
          file: args.file,
          summary: {
            inputFixes: 0,
            plannedFixes: 0,
            updatedOrderItems: 0,
            skippedDuplicateInput: 0,
            skippedMissingOrderItem: 0,
            skippedUnsupportedItemType: 0,
            skippedExistingProjectStillValid: 0,
            skippedMissingTargetProject: 0,
            skippedTargetProjectStoreMismatch: 0,
            skippedTargetProjectInactive: 0,
            skippedTargetNameMismatch: 0,
            skippedOrderStatus: 0,
            skippedStoreMismatch: 0,
            skippedDateOutOfRange: 0,
            skippedUnconfirmedBusinessApproval: 0,
          },
          planned: [],
          updated: [],
          skipped: {},
          nextStep: 'No repair_project fixes found. Historical exceptions are kept for confirmation audit and are not written back.',
        },
        null,
        2,
      ),
    );
    return;
  }
  const orderItemIds = fixes.map((item) => item.orderItemId!);
  const targetProjectIds = [...new Set(fixes.map((item) => item.targetProjectId!))];
  const [orderItems, targetProjects] = await Promise.all([
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
    prisma.project.findMany({
      where: { id: { in: targetProjectIds } },
      include: { type: true, bomItems: { select: { id: true } } },
    }),
  ]);

  const orderItemById = new Map<number, (typeof orderItems)[number]>(orderItems.map((item): [number, (typeof orderItems)[number]] => [item.id, item]));
  const targetProjectById = new Map<number, (typeof targetProjects)[number]>(
    targetProjects.map((project): [number, (typeof targetProjects)[number]] => [project.id, project]),
  );

  const planned: PlannedProjectMasterFix[] = [];
  const skipped = {
    duplicateInput: [] as any[],
    missingOrderItem: [] as any[],
    unsupportedItemType: [] as any[],
    existingProjectStillValid: [] as any[],
    missingTargetProject: [] as any[],
    targetProjectStoreMismatch: [] as any[],
    targetProjectInactive: [] as any[],
    targetNameMismatch: [] as any[],
    orderStatus: [] as any[],
    storeMismatch: [] as any[],
    dateOutOfRange: [] as any[],
    unconfirmedBusinessApproval: [] as any[],
  };
  const seenOrderItemIds = new Set<number>();

  for (const fix of fixes) {
    const orderItemId = fix.orderItemId!;
    const targetProjectId = fix.targetProjectId!;
    if (seenOrderItemIds.has(orderItemId)) {
      skipped.duplicateInput.push({ orderItemId, targetProjectId });
      continue;
    }
    seenOrderItemIds.add(orderItemId);

    const orderItem = orderItemById.get(orderItemId);
    if (!orderItem) {
      skipped.missingOrderItem.push({ orderItemId, targetProjectId });
      continue;
    }
    if (!isProjectItem(orderItem.itemType)) {
      skipped.unsupportedItemType.push({ orderItemId, itemType: orderItem.itemType, targetProjectId });
      continue;
    }
    if (args.apply && !isBusinessConfirmed(fix.confirmedBy)) {
      skipped.unconfirmedBusinessApproval.push({ orderItemId, targetProjectId, confirmedBy: fix.confirmedBy ?? null });
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

    if (orderItem.itemId === targetProjectId) {
      skipped.existingProjectStillValid.push({ orderItemId, itemId: orderItem.itemId, targetProjectId });
      continue;
    }

    const targetProject = targetProjectById.get(targetProjectId);
    if (!targetProject) {
      skipped.missingTargetProject.push({ orderItemId, targetProjectId });
      continue;
    }
    if (targetProject.deletedAt || targetProject.status !== 'active') {
      skipped.targetProjectInactive.push({ orderItemId, targetProjectId, status: targetProject.status, deletedAt: targetProject.deletedAt });
      continue;
    }
    if (orderItem.order.storeId && targetProject.storeId !== orderItem.order.storeId) {
      skipped.targetProjectStoreMismatch.push({
        orderItemId,
        orderStoreId: orderItem.order.storeId,
        targetProjectId,
        targetProjectStoreId: targetProject.storeId,
      });
      continue;
    }
    if (fix.targetProjectName && fix.targetProjectName !== targetProject.name) {
      skipped.targetNameMismatch.push({ orderItemId, targetProjectId, expectedName: fix.targetProjectName, actualName: targetProject.name });
      continue;
    }

    planned.push({
      orderId: orderItem.order.id,
      orderNo: orderItem.order.orderNo,
      storeId: orderItem.order.storeId,
      orderCreatedAt: orderItem.order.createdAt.toISOString(),
      orderItemId,
      itemType: orderItem.itemType,
      previousItemId: orderItem.itemId,
      previousName: orderItem.name,
      targetProjectId: targetProject.id,
      targetProjectName: targetProject.name,
      targetProjectType: targetProject.type?.name ?? null,
      targetProjectPrice: toNumber(targetProject.price),
      targetProjectBomCount: targetProject.bomItems.length,
      source: fix.source,
      reason: fix.reason,
      confirmedBy: fix.confirmedBy,
    });
  }

  const updated: any[] = [];
  if (args.apply) {
    for (const item of planned) {
      const result = await prisma.orderItem.update({
        where: { id: item.orderItemId },
        data: {
          itemId: item.targetProjectId,
          name: item.targetProjectName,
        },
        select: { id: true, orderId: true, itemId: true, name: true },
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
          inputFixes: fixes.length,
          plannedFixes: planned.length,
          updatedOrderItems: updated.length,
          skippedDuplicateInput: skipped.duplicateInput.length,
          skippedMissingOrderItem: skipped.missingOrderItem.length,
          skippedUnsupportedItemType: skipped.unsupportedItemType.length,
          skippedExistingProjectStillValid: skipped.existingProjectStillValid.length,
          skippedMissingTargetProject: skipped.missingTargetProject.length,
          skippedTargetProjectStoreMismatch: skipped.targetProjectStoreMismatch.length,
          skippedTargetProjectInactive: skipped.targetProjectInactive.length,
          skippedTargetNameMismatch: skipped.targetNameMismatch.length,
          skippedOrderStatus: skipped.orderStatus.length,
          skippedStoreMismatch: skipped.storeMismatch.length,
          skippedDateOutOfRange: skipped.dateOutOfRange.length,
          skippedUnconfirmedBusinessApproval: skipped.unconfirmedBusinessApproval.length,
        },
        planned: planned.slice(0, 50),
        updated: updated.slice(0, 50),
        skipped: Object.fromEntries(Object.entries(skipped).map(([key, value]) => [key, value.slice(0, 20)])),
        nextStep: args.apply
          ? 'Run operation-profit:readiness and operation-profit:bom-audit to verify project_master_data and project_bom_data.'
          : 'Review planned project fixes. Re-run with --apply --yes only after business approval.',
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
