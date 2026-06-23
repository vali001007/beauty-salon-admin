import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type AuditArgs = {
  storeId?: number;
  from: Date;
  to: Date;
  windowDays: number;
  limit: number;
};

type CandidateSource = 'same_order_item' | 'service_task' | 'reservation' | 'card_usage' | 'follow_up_task';

type AssigneeCandidate = {
  source: CandidateSource;
  sourceId: number;
  sourceAt?: string | null;
  beauticianId: number;
  beauticianName?: string | null;
  staffUserId?: number | null;
  levelId?: number | null;
  matchedBy: string;
  distanceDays?: number | null;
  score: number;
};

type MissingAssigneeItem = {
  orderId: number;
  orderNo: string;
  storeId?: number | null;
  customerId?: number | null;
  customerName?: string | null;
  orderCreatedAt: Date;
  orderSource?: string | null;
  itemId: number;
  itemType: string;
  itemObjectId?: number | null;
  itemName: string;
  subtotal: number;
  quantity: number;
  candidates: AssigneeCandidate[];
};

type CandidateDraftAssignment = {
  orderItemId: number;
  beauticianId: number;
  source: string;
  confidence: string;
  score: number;
  reason: string;
  confirmedBy: 'pending_business_confirmation';
};

type CandidateDraft = {
  purpose: 'operation-profit-assignee-candidates-pending-business-confirmation';
  storeId: number | null;
  from: string;
  to: string;
  generatedBy: 'operation-profit:assignee-audit';
  warning: string;
  sourceSummary: {
    scannedOrders: number;
    missingAssigneeItems: number;
    itemTypeCounts: Record<string, number>;
    confidenceCounts: Record<string, number>;
    candidateSourceCounts: Record<string, number>;
    candidateDraftAssignments: number;
  };
  assignments: CandidateDraftAssignment[];
};

type ManualReviewItem = {
  orderItemId: number;
  orderId: number;
  orderNo: string;
  orderCreatedAt: string;
  orderSource?: string | null;
  storeId?: number | null;
  customerId?: number | null;
  customerName?: string | null;
  itemType: string;
  itemObjectId?: number | null;
  itemName: string;
  subtotal: number;
  quantity: number;
  reason: string;
  reviewStatus: 'pending_manual_review';
  confirmedBy: 'pending_business_confirmation';
};

type ManualReviewDraft = {
  purpose: 'operation-profit-assignee-manual-review-pending-business-confirmation';
  storeId: number | null;
  from: string;
  to: string;
  generatedBy: 'operation-profit:assignee-audit';
  warning: string;
  sourceSummary: {
    scannedOrders: number;
    missingAssigneeItems: number;
    manualReviewItems: number;
  };
  items: ManualReviewItem[];
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): AuditArgs {
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
  const windowDays = args.get('windowDays') ? Number(args.get('windowDays')) : 14;
  const limit = args.get('limit') ? Number(args.get('limit')) : 100;

  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 90) {
    throw new Error('--windowDays must be an integer between 0 and 90');
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
    throw new Error('--limit must be an integer between 1 and 500');
  }

  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('--from/--to must be valid date strings like 2026-06-01');
  }
  return { storeId, from, to, windowDays, limit };
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

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function distanceDays(left?: Date | string | null, right?: Date | string | null) {
  if (!left || !right) return null;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return null;
  return Math.round((Math.abs(leftTime - rightTime) / (24 * 60 * 60 * 1000)) * 100) / 100;
}

function sameText(left: unknown, right: unknown) {
  const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function confidence(score: number) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDistance(value?: number | null) {
  if (value === null || value === undefined) return '距离未知';
  return `距离 ${value} 天`;
}

function matchedByLabel(candidate: AssigneeCandidate) {
  const matchedBy = candidate.matchedBy;
  if (matchedBy.includes('same_order_other_item')) return '同订单其他明细已有服务人';
  if (matchedBy.includes('same_customer_project_name')) return '同客户同项目消课';
  if (matchedBy.includes('same_customer_project_completed')) return '同客户同项目已完成服务';
  if (matchedBy.includes('same_customer_project_pending')) return '同客户同项目待服务任务';
  if (matchedBy.includes('same_customer_project_confirmed')) return '同客户同项目预约确认';
  if (matchedBy.includes('same_customer_project')) return '同客户同项目记录';
  if (matchedBy.includes('same_customer_recent_service_completed')) return '同客户近期已完成服务';
  if (matchedBy.includes('same_customer_recent_service_pending')) return '同客户近期待服务任务';
  if (matchedBy.includes('same_customer_recent_service')) return '同客户近期服务任务';
  if (matchedBy.includes('same_customer_recent_reservation_confirmed')) return '同客户近期预约确认';
  if (matchedBy.includes('same_customer_recent_reservation_pending')) return '同客户近期预约待确认';
  if (matchedBy.includes('same_customer_recent_reservation')) return '同客户近期预约';
  if (matchedBy.includes('same_customer_recent_card_usage')) return '同客户近期消课记录';
  if (matchedBy.includes('same_order_follow_up')) return '同订单跟进任务';
  if (matchedBy.includes('same_customer_follow_up')) return '同客户跟进任务';
  return matchedBy;
}

function candidateReason(item: MissingAssigneeItem, candidate: AssigneeCandidate) {
  const base = `候选：${matchedByLabel(candidate)}，${formatDistance(candidate.distanceDays)}，score ${candidate.score}`;
  const cautions = [
    normalizedItemType(item.itemType) === 'product' ? '商品归属需人工确认' : undefined,
    candidate.staffUserId ? undefined : '需确认美容师账号绑定',
  ].filter((value): value is string => Boolean(value));
  return cautions.length ? `${base}；${cautions.join('；')}` : base;
}

function buildCandidateDraft(
  args: AuditArgs,
  scannedOrders: number,
  missingItems: MissingAssigneeItem[],
  itemTypeCounts: Record<string, number>,
  confidenceCounts: Record<string, number>,
  candidateSourceCounts: Record<string, number>,
): CandidateDraft {
  const candidateItems = missingItems
    .map((item) => ({ item, bestCandidate: item.candidates[0] }))
    .filter(
      (entry): entry is { item: MissingAssigneeItem; bestCandidate: AssigneeCandidate } =>
        Boolean(entry.bestCandidate && confidence(entry.bestCandidate.score) !== 'none'),
    );
  const assignments = candidateItems.map(({ item, bestCandidate }) => ({
    orderItemId: item.itemId,
    beauticianId: bestCandidate.beauticianId,
    source: `${bestCandidate.source}:${bestCandidate.sourceId}`,
    confidence: confidence(bestCandidate.score),
    score: bestCandidate.score,
    reason: candidateReason(item, bestCandidate),
    confirmedBy: 'pending_business_confirmation' as const,
  }));

  return {
    purpose: 'operation-profit-assignee-candidates-pending-business-confirmation',
    storeId: args.storeId ?? null,
    from: dateOnly(args.from),
    to: dateOnly(args.to),
    generatedBy: 'operation-profit:assignee-audit',
    warning: 'This file is a candidate draft only. Do not apply until business replaces confirmedBy and confirms every assignment.',
    sourceSummary: {
      scannedOrders,
      missingAssigneeItems: missingItems.length,
      itemTypeCounts,
      confidenceCounts,
      candidateSourceCounts,
      candidateDraftAssignments: assignments.length,
    },
    assignments,
  };
}

function manualReviewReason(item: MissingAssigneeItem) {
  const type = normalizedItemType(item.itemType);
  const base = '暂无可自动推荐服务人线索';
  if (type === 'product') return `${base}；商品销售归属需查订单备注、收银记录或门店交接记录`;
  if (item.itemName.includes('项目') || !item.itemObjectId) return `${base}；项目身份或项目档案可能异常，需先确认真实服务项目`;
  return `${base}；需查排班、预约、服务记录、纸质单或门店交接记录`;
}

function buildManualReviewDraft(args: AuditArgs, scannedOrders: number, missingItems: MissingAssigneeItem[]): ManualReviewDraft {
  const items = missingItems
    .filter((item) => confidence(item.candidates[0]?.score ?? 0) === 'none')
    .map((item) => ({
      orderItemId: item.itemId,
      orderId: item.orderId,
      orderNo: item.orderNo,
      orderCreatedAt: item.orderCreatedAt.toISOString(),
      orderSource: item.orderSource ?? null,
      storeId: item.storeId ?? null,
      customerId: item.customerId ?? null,
      customerName: item.customerName ?? null,
      itemType: normalizedItemType(item.itemType) ?? item.itemType,
      itemObjectId: item.itemObjectId ?? null,
      itemName: item.itemName,
      subtotal: item.subtotal,
      quantity: item.quantity,
      reason: manualReviewReason(item),
      reviewStatus: 'pending_manual_review' as const,
      confirmedBy: 'pending_business_confirmation' as const,
    }));

  return {
    purpose: 'operation-profit-assignee-manual-review-pending-business-confirmation',
    storeId: args.storeId ?? null,
    from: dateOnly(args.from),
    to: dateOnly(args.to),
    generatedBy: 'operation-profit:assignee-audit',
    warning:
      'This file lists missing assignee items without reliable candidates. Business must manually identify the assignee or mark the item as historical exception before write-back.',
    sourceSummary: {
      scannedOrders,
      missingAssigneeItems: missingItems.length,
      manualReviewItems: items.length,
    },
    items,
  };
}

function candidateKey(candidate: AssigneeCandidate) {
  return `${candidate.source}:${candidate.sourceId}:${candidate.beauticianId}`;
}

function beauticianLabel(beauticianById: Map<number, any>, beauticianId: number) {
  const beautician = beauticianById.get(beauticianId);
  return {
    beauticianName: beautician?.name ?? null,
    staffUserId: beautician?.userId ?? null,
    levelId: beautician?.levelId ?? null,
  };
}

async function main() {
  const args = parseArgs();
  const orders = await prisma.productOrder.findMany({
    where: {
      ...(args.storeId ? { storeId: args.storeId } : {}),
      createdAt: { gte: args.from, lte: args.to },
      status: { in: ['paid', 'completed'] },
    },
    include: { orderItems: true },
    orderBy: { createdAt: 'asc' },
  });

  const missingItems: MissingAssigneeItem[] = [];
  for (const order of orders) {
    for (const item of order.orderItems) {
      const type = normalizedItemType(item.itemType);
      if (!type || item.beauticianId || toNumber(item.subtotal) <= 0) continue;
      missingItems.push({
        orderId: order.id,
        orderNo: order.orderNo,
        storeId: order.storeId,
        customerId: order.customerId,
        customerName: order.customerName,
        orderCreatedAt: order.createdAt,
        orderSource: order.source,
        itemId: item.id,
        itemType: item.itemType,
        itemObjectId: item.itemId,
        itemName: item.name,
        subtotal: toNumber(item.subtotal),
        quantity: toNumber(item.quantity),
        candidates: [],
      });
    }
  }

  const customerIds = [...new Set(missingItems.map((item) => item.customerId).filter((id): id is number => Boolean(id)))];
  const orderIds = [...new Set(missingItems.map((item) => item.orderId))];
  const itemObjectIds = [...new Set(missingItems.map((item) => item.itemObjectId).filter((id): id is number => Boolean(id)))];
  const expandedFrom = addDays(args.from, -args.windowDays);
  const expandedTo = addDays(args.to, args.windowDays);

  const sameOrderCandidateIds = orders.flatMap((order) => order.orderItems.map((item) => item.beauticianId).filter(Boolean));
  const [serviceTasks, reservations, cardUsageRecords, followUpTasks, beauticians] = await Promise.all([
    customerIds.length
      ? prisma.serviceTask.findMany({
          where: {
            ...(args.storeId ? { storeId: args.storeId } : {}),
            customerId: { in: customerIds },
            appointmentTime: { gte: expandedFrom, lte: expandedTo },
            beauticianId: { not: null },
          },
          select: { id: true, customerId: true, projectId: true, beauticianId: true, appointmentTime: true, status: true },
        })
      : [],
    customerIds.length
      ? prisma.reservation.findMany({
          where: {
            ...(args.storeId ? { storeId: args.storeId } : {}),
            customerId: { in: customerIds },
            date: { gte: expandedFrom, lte: expandedTo },
            beauticianId: { not: null },
          },
          select: { id: true, customerId: true, projectId: true, beauticianId: true, date: true, status: true },
        })
      : [],
    customerIds.length
      ? prisma.cardUsageRecord.findMany({
          where: {
            customerId: { in: customerIds },
            verifiedAt: { gte: expandedFrom, lte: expandedTo },
            beauticianId: { not: null },
          },
          select: { id: true, customerId: true, projectName: true, beauticianId: true, verifiedAt: true },
        })
      : [],
    orderIds.length || customerIds.length
      ? prisma.terminalFollowUpTask.findMany({
          where: {
            ...(args.storeId ? { storeId: args.storeId } : {}),
            deletedAt: null,
            assigneeBeauticianId: { not: null },
            OR: [
              ...(orderIds.length ? [{ orderId: { in: orderIds } }] : []),
              ...(customerIds.length ? [{ customerId: { in: customerIds }, createdAt: { gte: expandedFrom, lte: expandedTo } }] : []),
            ],
          },
          select: {
            id: true,
            customerId: true,
            orderId: true,
            assigneeBeauticianId: true,
            assigneeUserId: true,
            reservationId: true,
            serviceTaskId: true,
            assignedAt: true,
            createdAt: true,
            status: true,
          },
        })
      : [],
    prisma.beautician.findMany({
      where: {
        ...(args.storeId ? { storeId: args.storeId } : {}),
        OR: [
          { id: { in: sameOrderCandidateIds.map(Number) } },
          { id: { in: [] } },
        ],
      },
      select: { id: true, name: true, userId: true, levelId: true, storeId: true, status: true },
    }),
  ]);

  const relatedBeauticianIds = [
    ...sameOrderCandidateIds.map(Number),
    ...serviceTasks.map((item) => toNumber(item.beauticianId)),
    ...reservations.map((item) => toNumber(item.beauticianId)),
    ...cardUsageRecords.map((item) => toNumber(item.beauticianId)),
    ...followUpTasks.map((item) => toNumber(item.assigneeBeauticianId)),
  ].filter((id) => id > 0);
  const missingBeauticianIds = relatedBeauticianIds.filter((id) => !beauticians.some((beautician) => beautician.id === id));
  if (missingBeauticianIds.length) {
    const extraBeauticians = await prisma.beautician.findMany({
      where: { id: { in: [...new Set(missingBeauticianIds)] } },
      select: { id: true, name: true, userId: true, levelId: true, storeId: true, status: true },
    });
    beauticians.push(...extraBeauticians);
  }
  const beauticianById = new Map<number, (typeof beauticians)[number]>(beauticians.map((beautician): [number, (typeof beauticians)[number]] => [beautician.id, beautician]));

  const ordersById = new Map<number, (typeof orders)[number]>(orders.map((order): [number, (typeof orders)[number]] => [order.id, order]));
  for (const item of missingItems) {
    const order = ordersById.get(item.orderId);
    const candidates: AssigneeCandidate[] = [];
    const pushCandidate = (candidate: AssigneeCandidate) => {
      if (!candidate.beauticianId) return;
      const duplicate = candidates.find((current) => candidateKey(current) === candidateKey(candidate));
      if (!duplicate) candidates.push(candidate);
    };

    for (const orderItem of order?.orderItems ?? []) {
      const beauticianId = toNumber(orderItem.beauticianId);
      if (!beauticianId) continue;
      pushCandidate({
        source: 'same_order_item',
        sourceId: orderItem.id,
        sourceAt: order?.createdAt?.toISOString() ?? null,
        beauticianId,
        ...beauticianLabel(beauticianById, beauticianId),
        matchedBy: 'same_order_other_item',
        distanceDays: 0,
        score: 90,
      });
    }

    for (const task of serviceTasks) {
      if (task.customerId !== item.customerId) continue;
      const isSameProject = Boolean(item.itemObjectId && task.projectId === item.itemObjectId);
      const gap = distanceDays(task.appointmentTime, item.orderCreatedAt);
      const score = isSameProject ? (gap !== null && gap <= 2 ? 88 : 78) : gap !== null && gap <= 3 ? 55 : 40;
      if (!isSameProject && normalizedItemType(item.itemType) === 'project') continue;
      const beauticianId = toNumber(task.beauticianId);
      pushCandidate({
        source: 'service_task',
        sourceId: task.id,
        sourceAt: task.appointmentTime.toISOString(),
        beauticianId,
        ...beauticianLabel(beauticianById, beauticianId),
        matchedBy: isSameProject ? `same_customer_project_${task.status}` : `same_customer_recent_service_${task.status}`,
        distanceDays: gap,
        score,
      });
    }

    for (const reservation of reservations) {
      if (reservation.customerId !== item.customerId) continue;
      const isSameProject = Boolean(item.itemObjectId && reservation.projectId === item.itemObjectId);
      const gap = distanceDays(reservation.date, item.orderCreatedAt);
      const score = isSameProject ? (gap !== null && gap <= 2 ? 80 : 70) : gap !== null && gap <= 3 ? 50 : 35;
      if (!isSameProject && normalizedItemType(item.itemType) === 'project') continue;
      const beauticianId = toNumber(reservation.beauticianId);
      pushCandidate({
        source: 'reservation',
        sourceId: reservation.id,
        sourceAt: reservation.date.toISOString(),
        beauticianId,
        ...beauticianLabel(beauticianById, beauticianId),
        matchedBy: isSameProject ? `same_customer_project_${reservation.status}` : `same_customer_recent_reservation_${reservation.status}`,
        distanceDays: gap,
        score,
      });
    }

    for (const usage of cardUsageRecords) {
      if (usage.customerId !== item.customerId) continue;
      const isSameProjectName = sameText(usage.projectName, item.itemName);
      const gap = distanceDays(usage.verifiedAt, item.orderCreatedAt);
      if (!isSameProjectName && normalizedItemType(item.itemType) === 'project') continue;
      const score = isSameProjectName ? (gap !== null && gap <= 2 ? 74 : 64) : gap !== null && gap <= 3 ? 45 : 30;
      const beauticianId = toNumber(usage.beauticianId);
      pushCandidate({
        source: 'card_usage',
        sourceId: usage.id,
        sourceAt: usage.verifiedAt.toISOString(),
        beauticianId,
        ...beauticianLabel(beauticianById, beauticianId),
        matchedBy: isSameProjectName ? 'same_customer_project_name' : 'same_customer_recent_card_usage',
        distanceDays: gap,
        score,
      });
    }

    for (const task of followUpTasks) {
      if (task.orderId !== item.orderId && task.customerId !== item.customerId) continue;
      const isSameOrder = task.orderId === item.orderId;
      const gap = distanceDays(task.assignedAt ?? task.createdAt, item.orderCreatedAt);
      const score = isSameOrder ? 68 : gap !== null && gap <= 3 ? 42 : 30;
      const beauticianId = toNumber(task.assigneeBeauticianId);
      pushCandidate({
        source: 'follow_up_task',
        sourceId: task.id,
        sourceAt: (task.assignedAt ?? task.createdAt)?.toISOString() ?? null,
        beauticianId,
        ...beauticianLabel(beauticianById, beauticianId),
        matchedBy: isSameOrder ? `same_order_follow_up_${task.status}` : `same_customer_follow_up_${task.status}`,
        distanceDays: gap,
        score,
      });
    }

    item.candidates = candidates.sort((a, b) => b.score - a.score || toNumber(a.distanceDays) - toNumber(b.distanceDays));
  }

  const candidateSourceCounts = missingItems.reduce<Record<string, number>>((acc, item) => {
    for (const candidate of item.candidates) acc[candidate.source] = (acc[candidate.source] ?? 0) + 1;
    return acc;
  }, {});
  const itemTypeCounts = missingItems.reduce<Record<string, number>>((acc, item) => {
    const type = normalizedItemType(item.itemType) ?? 'unsupported';
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  const confidenceCounts = missingItems.reduce<Record<string, number>>(
    (acc, item) => {
      const best = item.candidates[0];
      const level = confidence(best?.score ?? 0);
      acc[level] = (acc[level] ?? 0) + 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0, none: 0 },
  );
  const candidateDraft = buildCandidateDraft(args, orders.length, missingItems, itemTypeCounts, confidenceCounts, candidateSourceCounts);
  const manualReviewDraft = buildManualReviewDraft(args, orders.length, missingItems);

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        storeId: args.storeId ?? null,
        from: args.from.toISOString(),
        to: args.to.toISOString(),
        windowDays: args.windowDays,
        summary: {
          scannedOrders: orders.length,
          missingAssigneeItems: missingItems.length,
          itemTypeCounts,
          confidenceCounts,
          candidateSourceCounts,
          candidateDraftAssignments: candidateDraft.assignments.length,
        },
        candidateDraft,
        manualReviewDraft,
        items: missingItems.slice(0, args.limit).map((item) => ({
          ...item,
          bestCandidate: item.candidates[0] ?? null,
          confidence: confidence(item.candidates[0]?.score ?? 0),
          candidates: item.candidates.slice(0, 5),
        })),
        notes: [
          'This script is read-only and does not update OrderItem.beauticianId.',
          'High confidence candidates still require business confirmation before any write-back.',
          'Product item candidates from recent customer services are only clues, not automatic attribution.',
        ],
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
