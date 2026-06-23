import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type AuditArgs = {
  storeId?: number;
  from: Date;
  to: Date;
  assigneeFile: string;
  assigneeManualReviewFile: string;
  beauticianUserFile: string;
  staffUserFile?: string;
  projectMasterFile: string;
  requireReady: boolean;
  summaryOnly: boolean;
};

type AssignmentInput = {
  orderItemId: number;
  beauticianId: number;
  confirmedBy?: string;
};

type ManualReviewInput = {
  orderItemId: number;
  reviewStatus?: string;
  resolution?: string;
  beauticianId?: number;
  confirmedBy?: string;
};

type BeauticianUserBindingInput = {
  beauticianId: number;
  userId: number;
  confirmedBy?: string;
};

type StaffUserCreateInput = {
  beauticianId: number;
  username: string;
  name: string;
  phone?: string | null;
  roleKey: string;
  storeId: number;
  confirmedBy?: string;
};

type ProjectMasterFixInput = {
  orderItemId: number;
  targetProjectId?: number;
  targetProjectName?: string;
  resolution?: string;
  confirmedBy?: string;
};

type ConfirmationIssue = {
  type: string;
  [key: string]: unknown;
};

type ConfirmedStaffUserPlan = {
  beauticianId: number;
  userId?: number;
  username?: string;
  source: 'existing_binding' | 'staff_user_create';
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): AuditArgs {
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
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('--from/--to must be valid date strings like 2026-06-01');
  }

  const missingRequiredFiles = ['assigneeFile', 'assigneeManualReviewFile', 'beauticianUserFile', 'projectMasterFile'].filter((key) => !args.has(key));
  if (flags.has('--requireReady') && missingRequiredFiles.length) {
    throw new Error(
      `--requireReady requires explicit confirmation JSON files: ${missingRequiredFiles
        .map((key) => `--${key}=<confirmed-json>`)
        .join(', ')}. Do not rely on pending default files before dry-run/apply.`,
    );
  }

  return {
    storeId,
    from,
    to,
    assigneeFile: args.get('assigneeFile') ?? 'docs/04-测试数据/operation-profit-assignee-candidates.pending.json',
    assigneeManualReviewFile: args.get('assigneeManualReviewFile') ?? 'docs/04-测试数据/operation-profit-assignee-manual-review.pending.json',
    beauticianUserFile: args.get('beauticianUserFile') ?? 'docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json',
    staffUserFile: args.get('staffUserFile'),
    projectMasterFile: args.get('projectMasterFile') ?? 'docs/04-测试数据/operation-profit-project-master-candidates.pending.json',
    requireReady: flags.has('--requireReady'),
    summaryOnly: flags.has('--summaryOnly'),
  };
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

function normalizedItemType(value: unknown) {
  const type = String(value ?? '').toLowerCase();
  if (['product', 'goods'].includes(type)) return 'product';
  if (['project', 'service', 'service_project'].includes(type)) return 'project';
  return undefined;
}

function resolveFile(file: string) {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`File not found: ${file}`);
  }
  return filePath;
}

function readJson(file: string) {
  return JSON.parse(readFileSync(resolveFile(file), 'utf8'));
}

function loadAssigneeAssignments(file: string): AssignmentInput[] {
  const parsed = readJson(file);
  const assignments = Array.isArray(parsed) ? parsed : parsed?.assignments;
  if (!Array.isArray(assignments)) throw new Error('Assignee file must be a JSON array or an object with assignments array.');
  return assignments.map((item, index) => {
    const orderItemId = toNumber(item.orderItemId ?? item.itemId);
    const beauticianId = toNumber(item.beauticianId);
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) throw new Error(`assignments[${index}].orderItemId must be a positive integer`);
    if (!Number.isInteger(beauticianId) || beauticianId <= 0) throw new Error(`assignments[${index}].beauticianId must be a positive integer`);
    return { orderItemId, beauticianId, confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined };
  });
}

function loadAssigneeManualReviewItems(file: string): ManualReviewInput[] {
  const parsed = readJson(file);
  const items = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(items)) throw new Error('Assignee manual review file must be a JSON array or an object with items array.');
  return items.map((item, index) => {
    const orderItemId = toNumber(item.orderItemId ?? item.itemId);
    const beauticianId = item.beauticianId === undefined || item.beauticianId === null ? undefined : toNumber(item.beauticianId);
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) throw new Error(`manualReviewItems[${index}].orderItemId must be a positive integer`);
    if (beauticianId !== undefined && (!Number.isInteger(beauticianId) || beauticianId <= 0)) {
      throw new Error(`manualReviewItems[${index}].beauticianId must be a positive integer when provided`);
    }
    return {
      orderItemId,
      beauticianId,
      reviewStatus: item.reviewStatus ? String(item.reviewStatus) : undefined,
      resolution: item.resolution ? String(item.resolution) : undefined,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
    };
  });
}

function loadBeauticianUserBindings(file: string): BeauticianUserBindingInput[] {
  const parsed = readJson(file);
  const bindings = Array.isArray(parsed) ? parsed : parsed?.bindings;
  if (!Array.isArray(bindings)) throw new Error('Beautician user file must be a JSON array or an object with bindings array.');
  return bindings.map((item, index) => {
    const beauticianId = toNumber(item.beauticianId);
    const userId = toNumber(item.userId);
    if (!Number.isInteger(beauticianId) || beauticianId <= 0) throw new Error(`bindings[${index}].beauticianId must be a positive integer`);
    if (!Number.isInteger(userId) || userId <= 0) throw new Error(`bindings[${index}].userId must be a positive integer`);
    return { beauticianId, userId, confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined };
  });
}

function loadStaffUserCreates(file?: string): StaffUserCreateInput[] {
  if (!file) return [];
  const parsed = readJson(file);
  const users = Array.isArray(parsed) ? parsed : parsed?.users;
  if (!Array.isArray(users)) throw new Error('Staff user file must be a JSON array or an object with users array.');
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
      beauticianId,
      username,
      name,
      phone: item.phone ? String(item.phone) : undefined,
      roleKey: item.roleKey ? String(item.roleKey) : 'beautician',
      storeId,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
    };
  });
}

function loadProjectMasterFixes(file: string): ProjectMasterFixInput[] {
  const parsed = readJson(file);
  const fixes = Array.isArray(parsed) ? parsed : parsed?.fixes;
  if (!Array.isArray(fixes)) throw new Error('Project master file must be a JSON array or an object with fixes array.');
  return fixes.map((item, index) => {
    const orderItemId = toNumber(item.orderItemId ?? item.itemId);
    const targetProjectId = item.targetProjectId === undefined && item.projectId === undefined ? undefined : toNumber(item.targetProjectId ?? item.projectId);
    const resolution = item.resolution ? String(item.resolution) : undefined;
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) throw new Error(`fixes[${index}].orderItemId must be a positive integer`);
    if (targetProjectId !== undefined && (!Number.isInteger(targetProjectId) || targetProjectId <= 0)) {
      throw new Error(`fixes[${index}].targetProjectId must be a positive integer when provided`);
    }
    return {
      orderItemId,
      targetProjectId,
      targetProjectName: item.targetProjectName ? String(item.targetProjectName) : undefined,
      resolution,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
    };
  });
}

function countConfirmed<T extends { confirmedBy?: string }>(items: T[]) {
  return items.filter((item) => isBusinessConfirmed(item.confirmedBy)).length;
}

function countIssuesByType(issueGroups: Record<string, ConfirmationIssue[]>) {
  const counts: Record<string, number> = {};
  for (const issues of Object.values(issueGroups)) {
    for (const issue of issues) {
      counts[issue.type] = (counts[issue.type] ?? 0) + 1;
    }
  }
  return counts;
}

function hasConfirmedStaffUserPlan(beautician: { id: number; userId?: number | null }, confirmedStaffUserPlansByBeauticianId: Map<number, ConfirmedStaffUserPlan>) {
  return toNumber(beautician.userId) > 0 || confirmedStaffUserPlansByBeauticianId.has(beautician.id);
}

function addDuplicateInputIssues<T>(
  issues: ConfirmationIssue[],
  items: T[],
  keyName: string,
  getKey: (item: T) => number | undefined,
  duplicateType: string,
  conflictType: string,
  getSignature: (item: T) => string,
  toEntry: (item: T, index: number) => Record<string, unknown>,
) {
  const groups = new Map<number, { item: T; index: number }[]>();
  for (const [index, item] of items.entries()) {
    const key = getKey(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push({ item, index });
    groups.set(key, group);
  }

  for (const [key, group] of groups.entries()) {
    if (group.length <= 1) continue;
    const entries = group.map(({ item, index }) => toEntry(item, index));
    issues.push({ type: duplicateType, [keyName]: key, count: group.length, entries });
    if (new Set(group.map(({ item }) => getSignature(item))).size > 1) {
      issues.push({ type: conflictType, [keyName]: key, count: group.length, entries });
    }
  }
}

function buildInputIntegrityIssues(
  assignments: AssignmentInput[],
  manualReviewItems: ManualReviewInput[],
  bindings: BeauticianUserBindingInput[],
  fixes: ProjectMasterFixInput[],
) {
  const issues: ConfirmationIssue[] = [];

  addDuplicateInputIssues(
    issues,
    assignments,
    'orderItemId',
    (item) => item.orderItemId,
    'duplicate_assignee_assignment_input',
    'conflicting_assignee_assignment_input',
    (item) => String(item.beauticianId),
    (item, index) => ({ index, orderItemId: item.orderItemId, beauticianId: item.beauticianId, confirmedBy: item.confirmedBy ?? null }),
  );

  addDuplicateInputIssues(
    issues,
    manualReviewItems,
    'orderItemId',
    (item) => item.orderItemId,
    'duplicate_manual_review_input',
    'conflicting_manual_review_input',
    (item) => `${item.resolution ?? ''}:${item.beauticianId ?? ''}`,
    (item, index) => ({
      index,
      orderItemId: item.orderItemId,
      resolution: item.resolution ?? null,
      beauticianId: item.beauticianId ?? null,
      confirmedBy: item.confirmedBy ?? null,
    }),
  );

  const assignmentIds = new Set(assignments.map((item) => item.orderItemId));
  const manualReviewIds = new Set(manualReviewItems.map((item) => item.orderItemId));
  for (const orderItemId of assignmentIds) {
    if (!manualReviewIds.has(orderItemId)) continue;
    issues.push({
      type: 'conflicting_assignee_confirmation_sources',
      orderItemId,
      sources: ['assigneeFile', 'assigneeManualReviewFile'],
      assignmentIndexes: assignments.map((item, index) => (item.orderItemId === orderItemId ? index : -1)).filter((index) => index >= 0),
      manualReviewIndexes: manualReviewItems.map((item, index) => (item.orderItemId === orderItemId ? index : -1)).filter((index) => index >= 0),
    });
  }

  addDuplicateInputIssues(
    issues,
    bindings,
    'beauticianId',
    (item) => item.beauticianId,
    'duplicate_beautician_user_binding_input',
    'conflicting_beautician_user_binding_input',
    (item) => String(item.userId),
    (item, index) => ({ index, beauticianId: item.beauticianId, userId: item.userId, confirmedBy: item.confirmedBy ?? null }),
  );

  addDuplicateInputIssues(
    issues,
    bindings,
    'userId',
    (item) => item.userId,
    'duplicate_staff_user_binding_input',
    'conflicting_staff_user_binding_input',
    (item) => String(item.beauticianId),
    (item, index) => ({ index, beauticianId: item.beauticianId, userId: item.userId, confirmedBy: item.confirmedBy ?? null }),
  );

  addDuplicateInputIssues(
    issues,
    fixes,
    'orderItemId',
    (item) => item.orderItemId,
    'duplicate_project_master_fix_input',
    'conflicting_project_master_fix_input',
    (item) => `${item.resolution ?? 'repair_project'}:${item.targetProjectId ?? ''}:${item.targetProjectName ?? ''}`,
    (item, index) => ({
      index,
      orderItemId: item.orderItemId,
      resolution: item.resolution ?? 'repair_project',
      targetProjectId: item.targetProjectId ?? null,
      targetProjectName: item.targetProjectName ?? null,
      confirmedBy: item.confirmedBy ?? null,
    }),
  );

  return issues;
}

function buildWriteGate(confirmationReady: boolean, issueGroups: Record<string, ConfirmationIssue[]>) {
  const issueCountsByType = countIssuesByType(issueGroups);
  const unconfirmedItems = issueCountsByType.unconfirmed ?? 0;
  const missingResolutionItems = issueCountsByType.missing_or_invalid_resolution ?? 0;
  const missingStaffUserItems = issueCountsByType.missing_staff_user ?? 0;
  const missingCoverageItems =
    (issueCountsByType.missing_assignee_confirmation_input ?? 0) + (issueCountsByType.missing_project_master_confirmation_input ?? 0);
  const inputIntegrityItems = Object.entries(issueCountsByType)
    .filter(([type]) => type.startsWith('duplicate_') || type.startsWith('conflicting_'))
    .reduce((sum, [, count]) => sum + count, 0);
  const nextActions: string[] = [];

  if (unconfirmedItems > 0) {
    nextActions.push('Replace pending_business_confirmation with a real business confirmer before any apply command.');
  }
  if (missingResolutionItems > 0) {
    nextActions.push('Set resolution for every manual review or project master item.');
  }
  if (missingStaffUserItems > 0) {
    nextActions.push('Bind confirmed beauticians to active staff users, or pass a confirmed staff user create JSON before commission backfill.');
  }
  if (
    (issueCountsByType.username_exists ?? 0) +
      (issueCountsByType.missing_role ?? 0) +
      (issueCountsByType.role_inactive ?? 0) +
      (issueCountsByType.missing_store ?? 0) +
      (issueCountsByType.store_inactive ?? 0) >
    0
  ) {
    nextActions.push('Fix invalid staff user create plans before dry-run/apply.');
  }
  if (missingCoverageItems > 0) {
    nextActions.push('Regenerate confirmation workbook/audit candidates because confirmed files do not cover current source gaps.');
  }
  if (inputIntegrityItems > 0) {
    nextActions.push('Remove duplicate or conflicting confirmation records before any apply command.');
  }
  if (!nextActions.length && !confirmationReady) {
    nextActions.push('Resolve remaining data issues listed in issues before dry-run backfill.');
  }
  if (confirmationReady) {
    nextActions.push('Run dry-run backfill commands first; apply still requires explicit --apply --yes --storeId.');
  }

  return {
    applyAllowed: confirmationReady,
    status: confirmationReady ? 'ready_for_dry_run' : 'blocked_by_business_confirmation',
    authorizationNote:
      'Write authorization is necessary but not sufficient; confirmedBy, resolution, store/date scope, staff user binding, and project identity must all pass.',
    requireReadyExit: confirmationReady ? 0 : 2,
    blockers: {
      unconfirmedItems,
      missingResolutionItems,
      missingStaffUserItems,
      missingCoverageItems,
      inputIntegrityItems,
    },
    issueCountsByType,
    nextActions,
  };
}

function buildStaffUserBlockers(issueGroups: Pick<Record<string, ConfirmationIssue[]>, 'assignee' | 'assigneeManualReview'>) {
  const byBeautician = new Map<
    number,
    {
      beauticianId: number;
      beauticianName: string;
      orderItemIds: Set<number>;
    }
  >();

  for (const issue of [...issueGroups.assignee, ...issueGroups.assigneeManualReview]) {
    if (issue.type !== 'missing_staff_user') continue;
    const beauticianId = toNumber(issue.beauticianId);
    const orderItemId = toNumber(issue.orderItemId);
    if (!beauticianId || !orderItemId) continue;
    const current = byBeautician.get(beauticianId) ?? {
      beauticianId,
      beauticianName: String(issue.beauticianName ?? ''),
      orderItemIds: new Set<number>(),
    };
    current.orderItemIds.add(orderItemId);
    byBeautician.set(beauticianId, current);
  }

  const beauticians = [...byBeautician.values()]
    .map((item) => ({
      beauticianId: item.beauticianId,
      beauticianName: item.beauticianName,
      impactedOrderItemIds: [...item.orderItemIds].sort((a, b) => a - b),
      impactedOrderItems: item.orderItemIds.size,
    }))
    .sort((a, b) => b.impactedOrderItems - a.impactedOrderItems || a.beauticianId - b.beauticianId);

  return {
    beauticianCount: beauticians.length,
    impactedOrderItems: beauticians.reduce((sum, item) => sum + item.impactedOrderItems, 0),
    beauticians,
  };
}

async function main() {
  const args = parseArgs();
  const [assignments, manualReviewItems, bindings, staffUsers, fixes] = [
    loadAssigneeAssignments(args.assigneeFile),
    loadAssigneeManualReviewItems(args.assigneeManualReviewFile),
    loadBeauticianUserBindings(args.beauticianUserFile),
    loadStaffUserCreates(args.staffUserFile),
    loadProjectMasterFixes(args.projectMasterFile),
  ];

  const assignmentOrderItemIds = assignments.map((item) => item.orderItemId);
  const manualReviewOrderItemIds = manualReviewItems.map((item) => item.orderItemId);
  const fixOrderItemIds = fixes.map((item) => item.orderItemId);
  const staffUsernames = [...new Set(staffUsers.map((item) => item.username))];
  const staffUserRoleKeys = [...new Set(staffUsers.map((item) => item.roleKey))];
  const staffUserStoreIds = [...new Set(staffUsers.map((item) => item.storeId))];
  const beauticianIds = [
    ...new Set([
      ...assignments.map((item) => item.beauticianId),
      ...manualReviewItems.map((item) => item.beauticianId).filter((id): id is number => Boolean(id)),
      ...bindings.map((item) => item.beauticianId),
      ...staffUsers.map((item) => item.beauticianId),
    ]),
  ];
  const userIds = [...new Set(bindings.map((item) => item.userId))];
  const projectIds = [...new Set(fixes.map((item) => item.targetProjectId).filter((id): id is number => Boolean(id)))];

  const currentOrders = await prisma.productOrder.findMany({
    where: {
      ...(args.storeId ? { storeId: args.storeId } : {}),
      createdAt: { gte: args.from, lte: args.to },
      status: { in: ['paid', 'completed'] },
    },
    include: { orderItems: true },
  });
  const currentMarginItems = currentOrders.flatMap((order) =>
    order.orderItems
      .filter((item) => normalizedItemType(item.itemType))
      .map((item) => ({ order, item, type: normalizedItemType(item.itemType)! })),
  );
  const currentProjectIds = [
    ...new Set(
      currentMarginItems
        .filter(({ type }) => type === 'project')
        .map(({ item }) => item.itemId)
        .filter((id): id is number => Boolean(id)),
    ),
  ];

  const [orderItems, beauticians, users, userStores, projects, existingStaffUsers, staffUserRoles, staffUserStores] = await Promise.all([
    prisma.orderItem.findMany({
      where: { id: { in: [...new Set([...assignmentOrderItemIds, ...manualReviewOrderItemIds, ...fixOrderItemIds])] } },
      include: { order: { select: { id: true, orderNo: true, storeId: true, status: true, createdAt: true } } },
    }),
    prisma.beautician.findMany({
      where: { id: { in: beauticianIds } },
      select: { id: true, name: true, storeId: true, userId: true, status: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, name: true, status: true, deletedAt: true },
    }),
    prisma.userStore.findMany({ where: { userId: { in: userIds } }, select: { userId: true, storeId: true } }),
    prisma.project.findMany({
      where: { id: { in: [...new Set([...projectIds, ...currentProjectIds])] }, ...(args.storeId ? { storeId: args.storeId } : {}) },
      include: { bomItems: { select: { id: true } } },
    }),
    prisma.user.findMany({
      where: { username: { in: staffUsernames } },
      select: { id: true, username: true, name: true, status: true, deletedAt: true },
    }),
    prisma.role.findMany({
      where: { key: { in: staffUserRoleKeys } },
      select: { id: true, key: true, status: true },
    }),
    prisma.store.findMany({
      where: { id: { in: staffUserStoreIds } },
      select: { id: true, name: true, status: true },
    }),
  ]);

  const orderItemById = new Map<number, (typeof orderItems)[number]>(orderItems.map((item): [number, (typeof orderItems)[number]] => [item.id, item]));
  const beauticianById = new Map<number, (typeof beauticians)[number]>(beauticians.map((item): [number, (typeof beauticians)[number]] => [item.id, item]));
  const userById = new Map<number, (typeof users)[number]>(users.map((item): [number, (typeof users)[number]] => [item.id, item]));
  const userStoreKeys = new Set(userStores.map((item) => `${item.userId}:${item.storeId}`));
  const projectById = new Map<number, (typeof projects)[number]>(projects.map((item): [number, (typeof projects)[number]] => [item.id, item]));
  const existingStaffUserByUsername = new Map(existingStaffUsers.map((item): [string, (typeof existingStaffUsers)[number]] => [item.username, item]));
  const staffUserRoleByKey = new Map(staffUserRoles.map((item): [string, (typeof staffUserRoles)[number]] => [item.key, item]));
  const staffUserStoreById = new Map(staffUserStores.map((item): [number, (typeof staffUserStores)[number]] => [item.id, item]));
  const confirmedStaffUserPlansByBeauticianId = new Map<number, ConfirmedStaffUserPlan>();
  for (const binding of bindings) {
    const beautician = beauticianById.get(binding.beauticianId);
    const user = userById.get(binding.userId);
    if (!beautician || !user || !isBusinessConfirmed(binding.confirmedBy)) continue;
    if (args.storeId && beautician.storeId !== args.storeId) continue;
    if (beautician.status !== 'active') continue;
    if (toNumber(beautician.userId) > 0) continue;
    if (user.deletedAt || user.status !== 'active') continue;
    if (!userStoreKeys.has(`${user.id}:${beautician.storeId}`)) continue;
    confirmedStaffUserPlansByBeauticianId.set(beautician.id, { beauticianId: beautician.id, userId: user.id, source: 'existing_binding' });
  }

  const staffUserIssues: ConfirmationIssue[] = [];
  const seenStaffUserBeauticianIds = new Set<number>();
  const seenStaffUsernames = new Set<string>();
  for (const staffUser of staffUsers) {
    let canUsePlan = true;
    const addIssue = (issue: ConfirmationIssue) => {
      staffUserIssues.push(issue);
      canUsePlan = false;
    };
    const beautician = beauticianById.get(staffUser.beauticianId);
    const existingStaffUser = existingStaffUserByUsername.get(staffUser.username);
    const role = staffUserRoleByKey.get(staffUser.roleKey);
    const store = staffUserStoreById.get(staffUser.storeId);

    if (seenStaffUserBeauticianIds.has(staffUser.beauticianId)) {
      addIssue({ type: 'duplicate_staff_user_create_input', beauticianId: staffUser.beauticianId, username: staffUser.username });
    }
    seenStaffUserBeauticianIds.add(staffUser.beauticianId);
    if (seenStaffUsernames.has(staffUser.username)) {
      addIssue({ type: 'duplicate_staff_username_create_input', beauticianId: staffUser.beauticianId, username: staffUser.username });
    }
    seenStaffUsernames.add(staffUser.username);
    if (!isBusinessConfirmed(staffUser.confirmedBy)) {
      addIssue({ type: 'unconfirmed', beauticianId: staffUser.beauticianId, username: staffUser.username });
    }
    if (!beautician) {
      addIssue({ type: 'missing_beautician', beauticianId: staffUser.beauticianId, username: staffUser.username });
    } else {
      if (args.storeId && staffUser.storeId !== args.storeId) {
        addIssue({ type: 'staff_user_store_mismatch', beauticianId: beautician.id, inputStoreId: staffUser.storeId, expectedStoreId: args.storeId });
      }
      if (beautician.storeId !== staffUser.storeId) {
        addIssue({ type: 'beautician_store_mismatch', beauticianId: beautician.id, beauticianStoreId: beautician.storeId, inputStoreId: staffUser.storeId });
      }
      if (beautician.status !== 'active') {
        addIssue({ type: 'beautician_inactive', beauticianId: beautician.id, status: beautician.status });
      }
      if (toNumber(beautician.userId) > 0) {
        addIssue({ type: 'already_bound', beauticianId: beautician.id, existingUserId: beautician.userId });
      }
    }
    if (existingStaffUser) {
      addIssue({
        type: 'username_exists',
        beauticianId: staffUser.beauticianId,
        username: staffUser.username,
        existingUserId: existingStaffUser.id,
        status: existingStaffUser.status,
        deletedAt: existingStaffUser.deletedAt,
      });
    }
    if (!role) {
      addIssue({ type: 'missing_role', beauticianId: staffUser.beauticianId, roleKey: staffUser.roleKey });
    } else if (role.status !== 'active') {
      addIssue({ type: 'role_inactive', beauticianId: staffUser.beauticianId, roleKey: role.key, status: role.status });
    }
    if (!store) {
      addIssue({ type: 'missing_store', beauticianId: staffUser.beauticianId, storeId: staffUser.storeId });
    } else if (store.status !== 'active') {
      addIssue({ type: 'store_inactive', beauticianId: staffUser.beauticianId, storeId: store.id, status: store.status });
    }
    if (confirmedStaffUserPlansByBeauticianId.has(staffUser.beauticianId)) {
      addIssue({ type: 'conflicting_staff_user_plan', beauticianId: staffUser.beauticianId, username: staffUser.username });
    }
    if (canUsePlan && beautician && role && store && !existingStaffUser) {
      confirmedStaffUserPlansByBeauticianId.set(staffUser.beauticianId, {
        beauticianId: staffUser.beauticianId,
        username: staffUser.username,
        source: 'staff_user_create',
      });
    }
  }

  const assigneeIssues: ConfirmationIssue[] = [];
  for (const assignment of assignments) {
    const orderItem = orderItemById.get(assignment.orderItemId);
    const beautician = beauticianById.get(assignment.beauticianId);
    if (!isBusinessConfirmed(assignment.confirmedBy)) assigneeIssues.push({ type: 'unconfirmed', orderItemId: assignment.orderItemId, beauticianId: assignment.beauticianId });
    if (!orderItem) {
      assigneeIssues.push({ type: 'missing_order_item', orderItemId: assignment.orderItemId });
      continue;
    }
    if (!normalizedItemType(orderItem.itemType)) assigneeIssues.push({ type: 'unsupported_item_type', orderItemId: orderItem.id, itemType: orderItem.itemType });
    if (orderItem.beauticianId) assigneeIssues.push({ type: 'already_assigned', orderItemId: orderItem.id, existingBeauticianId: orderItem.beauticianId });
    if (!['paid', 'completed'].includes(String(orderItem.order.status))) assigneeIssues.push({ type: 'invalid_order_status', orderItemId: orderItem.id, status: orderItem.order.status });
    if (args.storeId && orderItem.order.storeId !== args.storeId) assigneeIssues.push({ type: 'store_mismatch', orderItemId: orderItem.id, storeId: orderItem.order.storeId });
    if (orderItem.order.createdAt < args.from || orderItem.order.createdAt > args.to) assigneeIssues.push({ type: 'date_out_of_range', orderItemId: orderItem.id, orderCreatedAt: orderItem.order.createdAt });
    if (!beautician) {
      assigneeIssues.push({ type: 'missing_beautician', orderItemId: orderItem.id, beauticianId: assignment.beauticianId });
      continue;
    }
    if (orderItem.order.storeId && beautician.storeId !== orderItem.order.storeId) {
      assigneeIssues.push({ type: 'beautician_store_mismatch', orderItemId: orderItem.id, beauticianId: beautician.id, beauticianStoreId: beautician.storeId });
    }
    if (!hasConfirmedStaffUserPlan(beautician, confirmedStaffUserPlansByBeauticianId)) {
      assigneeIssues.push({ type: 'missing_staff_user', orderItemId: orderItem.id, beauticianId: beautician.id, beauticianName: beautician.name });
    }
  }

  const manualReviewIssues: ConfirmationIssue[] = [];
  const allowedManualResolutions = new Set(['assign', 'historical_exception', 'ignore_non_margin']);
  for (const reviewItem of manualReviewItems) {
    const orderItem = orderItemById.get(reviewItem.orderItemId);
    const beautician = reviewItem.beauticianId ? beauticianById.get(reviewItem.beauticianId) : null;
    const isConfirmed = isBusinessConfirmed(reviewItem.confirmedBy);
    const resolution = String(reviewItem.resolution ?? '').trim();
    if (!isConfirmed) manualReviewIssues.push({ type: 'unconfirmed', orderItemId: reviewItem.orderItemId });
    if (!resolution || !allowedManualResolutions.has(resolution)) {
      manualReviewIssues.push({ type: 'missing_or_invalid_resolution', orderItemId: reviewItem.orderItemId, resolution: reviewItem.resolution ?? null });
    }
    if (!orderItem) {
      manualReviewIssues.push({ type: 'missing_order_item', orderItemId: reviewItem.orderItemId });
      continue;
    }
    if (!normalizedItemType(orderItem.itemType)) manualReviewIssues.push({ type: 'unsupported_item_type', orderItemId: orderItem.id, itemType: orderItem.itemType });
    if (!['paid', 'completed'].includes(String(orderItem.order.status))) manualReviewIssues.push({ type: 'invalid_order_status', orderItemId: orderItem.id, status: orderItem.order.status });
    if (args.storeId && orderItem.order.storeId !== args.storeId) manualReviewIssues.push({ type: 'store_mismatch', orderItemId: orderItem.id, storeId: orderItem.order.storeId });
    if (orderItem.order.createdAt < args.from || orderItem.order.createdAt > args.to) manualReviewIssues.push({ type: 'date_out_of_range', orderItemId: orderItem.id, orderCreatedAt: orderItem.order.createdAt });
    if (resolution === 'assign') {
      if (!reviewItem.beauticianId) {
        manualReviewIssues.push({ type: 'missing_manual_assignee', orderItemId: orderItem.id });
      } else if (!beautician) {
        manualReviewIssues.push({ type: 'missing_beautician', orderItemId: orderItem.id, beauticianId: reviewItem.beauticianId });
      } else {
        if (orderItem.order.storeId && beautician.storeId !== orderItem.order.storeId) {
          manualReviewIssues.push({ type: 'beautician_store_mismatch', orderItemId: orderItem.id, beauticianId: beautician.id, beauticianStoreId: beautician.storeId });
        }
        if (!hasConfirmedStaffUserPlan(beautician, confirmedStaffUserPlansByBeauticianId)) {
          manualReviewIssues.push({ type: 'missing_staff_user', orderItemId: orderItem.id, beauticianId: beautician.id, beauticianName: beautician.name });
        }
      }
    }
  }

  const bindingIssues: ConfirmationIssue[] = [];
  for (const binding of bindings) {
    const beautician = beauticianById.get(binding.beauticianId);
    const user = userById.get(binding.userId);
    if (!isBusinessConfirmed(binding.confirmedBy)) bindingIssues.push({ type: 'unconfirmed', beauticianId: binding.beauticianId, userId: binding.userId });
    if (!beautician) {
      bindingIssues.push({ type: 'missing_beautician', beauticianId: binding.beauticianId });
      continue;
    }
    if (args.storeId && beautician.storeId !== args.storeId) bindingIssues.push({ type: 'beautician_store_mismatch', beauticianId: beautician.id, storeId: beautician.storeId });
    if (beautician.status !== 'active') bindingIssues.push({ type: 'beautician_inactive', beauticianId: beautician.id, status: beautician.status });
    if (toNumber(beautician.userId) > 0) bindingIssues.push({ type: 'already_bound', beauticianId: beautician.id, existingUserId: beautician.userId });
    if (!user) {
      bindingIssues.push({ type: 'missing_user', userId: binding.userId, beauticianId: beautician.id });
      continue;
    }
    if (user.deletedAt || user.status !== 'active') bindingIssues.push({ type: 'user_inactive', userId: user.id, status: user.status, deletedAt: user.deletedAt });
    if (!userStoreKeys.has(`${user.id}:${beautician.storeId}`)) bindingIssues.push({ type: 'user_store_mismatch', userId: user.id, beauticianId: beautician.id });
  }

  const projectIssues: ConfirmationIssue[] = [];
  const allowedProjectResolutions = new Set(['repair_project', 'historical_exception']);
  for (const fix of fixes) {
    const orderItem = orderItemById.get(fix.orderItemId);
    const resolution = fix.resolution ?? 'repair_project';
    const project = fix.targetProjectId ? projectById.get(fix.targetProjectId) : null;
    if (!isBusinessConfirmed(fix.confirmedBy)) projectIssues.push({ type: 'unconfirmed', orderItemId: fix.orderItemId, targetProjectId: fix.targetProjectId });
    if (!allowedProjectResolutions.has(resolution)) {
      projectIssues.push({ type: 'missing_or_invalid_resolution', orderItemId: fix.orderItemId, resolution: fix.resolution ?? null });
    }
    if (!orderItem) {
      projectIssues.push({ type: 'missing_order_item', orderItemId: fix.orderItemId });
      continue;
    }
    if (normalizedItemType(orderItem.itemType) !== 'project') projectIssues.push({ type: 'unsupported_item_type', orderItemId: orderItem.id, itemType: orderItem.itemType });
    if (!['paid', 'completed'].includes(String(orderItem.order.status))) projectIssues.push({ type: 'invalid_order_status', orderItemId: orderItem.id, status: orderItem.order.status });
    if (args.storeId && orderItem.order.storeId !== args.storeId) projectIssues.push({ type: 'store_mismatch', orderItemId: orderItem.id, storeId: orderItem.order.storeId });
    if (orderItem.order.createdAt < args.from || orderItem.order.createdAt > args.to) projectIssues.push({ type: 'date_out_of_range', orderItemId: orderItem.id, orderCreatedAt: orderItem.order.createdAt });
    if (resolution === 'historical_exception') continue;
    if (!fix.targetProjectId) {
      projectIssues.push({ type: 'missing_target_project_id', orderItemId: orderItem.id });
      continue;
    }
    if (!project) {
      projectIssues.push({ type: 'missing_target_project', orderItemId: orderItem.id, targetProjectId: fix.targetProjectId });
      continue;
    }
    if (project.deletedAt || project.status !== 'active') projectIssues.push({ type: 'target_project_inactive', targetProjectId: project.id, status: project.status });
    if (orderItem.order.storeId && project.storeId !== orderItem.order.storeId) projectIssues.push({ type: 'target_project_store_mismatch', orderItemId: orderItem.id, targetProjectId: project.id });
    if (fix.targetProjectName && fix.targetProjectName !== project.name) projectIssues.push({ type: 'target_name_mismatch', orderItemId: orderItem.id, expectedName: fix.targetProjectName, actualName: project.name });
    if (!project.bomItems.length) projectIssues.push({ type: 'target_project_missing_bom', targetProjectId: project.id, projectName: project.name });
  }

  const coverageIssues: ConfirmationIssue[] = [];
  const assigneeConfirmationIds = new Set([...assignmentOrderItemIds, ...manualReviewOrderItemIds]);
  const projectMasterConfirmationIds = new Set(fixOrderItemIds);
  const currentMissingAssigneeItems = currentMarginItems.filter(({ item }) => !item.beauticianId);
  const currentMissingProjectMasterItems = currentMarginItems.filter(
    ({ item, type }) => type === 'project' && item.itemId && !projectById.has(item.itemId),
  );
  for (const { order, item, type } of currentMissingAssigneeItems) {
    if (assigneeConfirmationIds.has(item.id)) continue;
    coverageIssues.push({
      type: 'missing_assignee_confirmation_input',
      orderItemId: item.id,
      orderNo: order.orderNo,
      itemType: type,
      itemName: item.name,
    });
  }
  for (const { order, item } of currentMissingProjectMasterItems) {
    if (projectMasterConfirmationIds.has(item.id)) continue;
    coverageIssues.push({
      type: 'missing_project_master_confirmation_input',
      orderItemId: item.id,
      orderNo: order.orderNo,
      itemId: item.itemId,
      itemName: item.name,
    });
  }

  const inputIntegrityIssues = buildInputIntegrityIssues(assignments, manualReviewItems, bindings, fixes);
  const issueCounts = {
    assignee: assigneeIssues.length,
    assigneeManualReview: manualReviewIssues.length,
    beauticianUser: bindingIssues.length,
    staffUser: staffUserIssues.length,
    projectMaster: projectIssues.length,
    coverage: coverageIssues.length,
    inputIntegrity: inputIntegrityIssues.length,
  };
  const confirmedCounts = {
    assignee: countConfirmed(assignments),
    assigneeManualReview: countConfirmed(manualReviewItems),
    beauticianUser: countConfirmed(bindings),
    staffUser: countConfirmed(staffUsers),
    projectMaster: countConfirmed(fixes),
  };
  const confirmationReady =
    issueCounts.assignee === 0 &&
    issueCounts.assigneeManualReview === 0 &&
    issueCounts.beauticianUser === 0 &&
    issueCounts.staffUser === 0 &&
    issueCounts.projectMaster === 0 &&
    issueCounts.coverage === 0 &&
    issueCounts.inputIntegrity === 0;
  const issueGroups = {
    assignee: assigneeIssues,
    assigneeManualReview: manualReviewIssues,
    beauticianUser: bindingIssues,
    staffUser: staffUserIssues,
    projectMaster: projectIssues,
    coverage: coverageIssues,
    inputIntegrity: inputIntegrityIssues,
  };
  const writeGate = buildWriteGate(confirmationReady, issueGroups);
  const staffUserBlockers = buildStaffUserBlockers({
    assignee: assigneeIssues,
    assigneeManualReview: manualReviewIssues,
  });

  const payload = {
    mode: args.requireReady ? 'read-only-require-ready' : 'read-only',
    summaryOnly: args.summaryOnly,
    storeId: args.storeId ?? null,
    from: args.from.toISOString(),
    to: args.to.toISOString(),
    files: {
      assigneeFile: args.assigneeFile,
      assigneeManualReviewFile: args.assigneeManualReviewFile,
      beauticianUserFile: args.beauticianUserFile,
      staffUserFile: args.staffUserFile ?? null,
      projectMasterFile: args.projectMasterFile,
    },
    summary: {
      confirmationReady,
      assignee: {
        inputAssignments: assignments.length,
        confirmedAssignments: confirmedCounts.assignee,
        issueCount: issueCounts.assignee,
      },
      assigneeManualReview: {
        inputItems: manualReviewItems.length,
        confirmedItems: confirmedCounts.assigneeManualReview,
        issueCount: issueCounts.assigneeManualReview,
      },
      beauticianUser: {
        inputBindings: bindings.length,
        confirmedBindings: confirmedCounts.beauticianUser,
        issueCount: issueCounts.beauticianUser,
      },
      staffUser: {
        inputUsers: staffUsers.length,
        confirmedUsers: confirmedCounts.staffUser,
        issueCount: issueCounts.staffUser,
      },
      projectMaster: {
        inputFixes: fixes.length,
        confirmedFixes: confirmedCounts.projectMaster,
        issueCount: issueCounts.projectMaster,
      },
      coverage: {
        currentMissingAssigneeItems: currentMissingAssigneeItems.length,
        coveredMissingAssigneeItems: currentMissingAssigneeItems.filter(({ item }) => assigneeConfirmationIds.has(item.id)).length,
        currentMissingProjectMasterItems: currentMissingProjectMasterItems.length,
        coveredMissingProjectMasterItems: currentMissingProjectMasterItems.filter(({ item }) => projectMasterConfirmationIds.has(item.id)).length,
        issueCount: issueCounts.coverage,
      },
      inputIntegrity: {
        issueCount: issueCounts.inputIntegrity,
      },
      staffUserBlockers,
    },
    writeGate,
    ...(args.summaryOnly ? {} : { issues: issueGroups }),
    nextStep: confirmationReady ? 'Confirmed files are ready for dry-run backfill commands.' : 'Resolve unconfirmed items and data issues before any apply command.',
  };

  console.log(JSON.stringify(payload, null, 2));

  if (args.requireReady && !confirmationReady) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
