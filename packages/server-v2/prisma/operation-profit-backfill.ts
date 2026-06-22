import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type BackfillArgs = {
  storeId?: number;
  from: Date;
  to: Date;
  apply: boolean;
  yes: boolean;
};

type BackfillCandidate = {
  order: any;
  item: any;
  beautician: any;
  type: 'product' | 'project';
  targetId?: number;
};

type PlannedCommission = {
  orderId: number;
  orderNo: string;
  storeId: number;
  itemId: number;
  itemType: 'product' | 'project';
  itemObjectId?: number | null;
  itemName: string;
  beauticianId: number;
  staffUserId: number;
  levelId?: number | null;
  ruleId: number;
  ruleName: string;
  sourceAmount: number;
  rate: number;
  amount: number;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });
const TARGET_TYPE_WEIGHT: Record<string, number> = { specific: 3, category: 2, all: 1 };

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

  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }

  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('--from/--to must be valid date strings like 2026-06-01');
  }
  return { storeId, from, to, apply: flags.has('--apply'), yes: flags.has('--yes') };
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function normalizedType(value: unknown) {
  const type = String(value ?? '').toLowerCase();
  if (['product', 'goods'].includes(type)) return 'product';
  if (['project', 'service', 'service_project'].includes(type)) return 'project';
  return undefined;
}

function getSettleMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function selectRule(rules: any[], candidate: BackfillCandidate) {
  const matched = rules.filter((rule) => {
    if (rule.targetType === 'all') return true;
    if (rule.targetType === 'category') return Boolean(candidate.targetId && toNumber(rule.targetId) === candidate.targetId);
    if (rule.targetType === 'specific') return Boolean(candidate.item.itemId && toNumber(rule.targetId) === toNumber(candidate.item.itemId));
    return false;
  });

  return matched.sort((a, b) => {
    const priorityDiff = toNumber(b.priority) - toNumber(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const userDiff = (b.userId ? 1 : 0) - (a.userId ? 1 : 0);
    if (userDiff !== 0) return userDiff;
    const levelDiff = (b.levelId ? 1 : 0) - (a.levelId ? 1 : 0);
    if (levelDiff !== 0) return levelDiff;
    return (TARGET_TYPE_WEIGHT[b.targetType] ?? 0) - (TARGET_TYPE_WEIGHT[a.targetType] ?? 0);
  })[0];
}

function calculatePlannedCommission(candidate: BackfillCandidate, rules: any[]): PlannedCommission | null {
  const staffUserId = toNumber(candidate.beautician.userId);
  if (!candidate.order.storeId || !staffUserId || toNumber(candidate.item.subtotal) <= 0) return null;
  const rule = selectRule(rules, candidate);
  if (!rule) return null;

  const sourceAmount = toNumber(candidate.item.subtotal);
  const base = rule.calcBase === 'service_fee' || rule.calcBase === 'profit' ? sourceAmount : sourceAmount;
  if (base <= 0) return null;

  const fixedAmount = rule.fixedAmount === null || rule.fixedAmount === undefined ? undefined : toNumber(rule.fixedAmount);
  const rate = toNumber(rule.rate);
  const amount = Math.round((fixedAmount ?? base * rate) * 100) / 100;
  const minThreshold = toNumber(rule.minThreshold);
  if (minThreshold > 0 && amount < minThreshold) return null;

  return {
    orderId: candidate.order.id,
    orderNo: candidate.order.orderNo,
    storeId: candidate.order.storeId,
    itemId: candidate.item.id,
    itemType: candidate.type,
    itemObjectId: candidate.item.itemId,
    itemName: candidate.item.name,
    beauticianId: candidate.beautician.id,
    staffUserId,
    levelId: candidate.beautician.levelId,
    ruleId: rule.id,
    ruleName: rule.name,
    sourceAmount: base,
    rate,
    amount,
  };
}

async function collectCandidates(args: BackfillArgs) {
  const orders = await prisma.productOrder.findMany({
    where: {
      ...(args.storeId ? { storeId: args.storeId } : {}),
      createdAt: { gte: args.from, lte: args.to },
      status: { in: ['paid', 'completed'] },
    },
    include: {
      orderItems: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const orderItemIds = orders.flatMap((order) => order.orderItems.map((item) => item.id));
  const existingRecords = orderItemIds.length
    ? await prisma.commissionRecord.findMany({
        where: { orderItemId: { in: orderItemIds }, status: { not: 'cancelled' } },
        select: { orderItemId: true },
      })
    : [];
  const orderItemIdsWithCommission = new Set(existingRecords.map((record) => record.orderItemId).filter(Boolean));
  const beauticianIds = [
    ...new Set(
      orders
        .flatMap((order) => order.orderItems.map((item) => item.beauticianId))
        .filter((id): id is number => Boolean(id)),
    ),
  ];
  const beauticians = beauticianIds.length
    ? await prisma.beautician.findMany({ where: { id: { in: beauticianIds } }, select: { id: true, levelId: true, userId: true } })
    : [];
  const beauticianById = new Map<number, (typeof beauticians)[number]>(beauticians.map((beautician): [number, (typeof beauticians)[number]] => [beautician.id, beautician]));
  const productIds = [
    ...new Set(
      orders
        .flatMap((order) => order.orderItems)
        .filter((item) => normalizedType(item.itemType) === 'product' && item.itemId)
        .map((item) => Number(item.itemId)),
    ),
  ];
  const projectIds = [
    ...new Set(
      orders
        .flatMap((order) => order.orderItems)
        .filter((item) => normalizedType(item.itemType) === 'project' && item.itemId)
        .map((item) => Number(item.itemId)),
    ),
  ];
  const [products, projects] = await Promise.all([
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } }) : [],
    projectIds.length ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, typeId: true } }) : [],
  ]);
  const productCategoryById = new Map<number, number | null>(products.map((product): [number, number | null] => [product.id, product.categoryId]));
  const projectTypeById = new Map<number, number | null>(projects.map((project): [number, number | null] => [project.id, project.typeId]));

  const candidates: BackfillCandidate[] = [];
  const skipped = {
    unsupportedItemType: [] as any[],
    existingCommission: [] as any[],
    missingBeautician: [] as any[],
    missingStaffUser: [] as any[],
    nonPositiveSubtotal: [] as any[],
  };

  for (const order of orders) {
    for (const item of order.orderItems) {
      const type = normalizedType(item.itemType);
      if (!type) {
        skipped.unsupportedItemType.push({ orderId: order.id, orderNo: order.orderNo, itemId: item.id, itemType: item.itemType });
        continue;
      }
      if (orderItemIdsWithCommission.has(item.id)) {
        skipped.existingCommission.push({ orderId: order.id, orderNo: order.orderNo, itemId: item.id, itemType: item.itemType });
        continue;
      }
      if (toNumber(item.subtotal) <= 0) {
        skipped.nonPositiveSubtotal.push({ orderId: order.id, orderNo: order.orderNo, itemId: item.id, itemType: item.itemType, subtotal: toNumber(item.subtotal) });
        continue;
      }
      const beauticianId = toNumber(item.beauticianId);
      const beautician = beauticianId > 0 ? beauticianById.get(beauticianId) : undefined;
      if (!beautician) {
        skipped.missingBeautician.push({ orderId: order.id, orderNo: order.orderNo, itemId: item.id, itemType: item.itemType, itemName: item.name });
        continue;
      }
      if (!toNumber(beautician.userId)) {
        skipped.missingStaffUser.push({
          orderId: order.id,
          orderNo: order.orderNo,
          itemId: item.id,
          itemType: item.itemType,
          itemName: item.name,
          beauticianId: beautician.id,
        });
        continue;
      }
      candidates.push({
        order,
        item,
        beautician,
        type,
        targetId: type === 'product' ? productCategoryById.get(toNumber(item.itemId)) ?? undefined : projectTypeById.get(toNumber(item.itemId)) ?? undefined,
      });
    }
  }

  return { candidates, skipped };
}

async function main() {
  const args = parseArgs();
  if (args.apply && !args.yes) {
    throw new Error('写入回填必须同时传入 --apply --yes；不传 --apply 时只 dry-run。');
  }
  if (args.apply && !args.storeId) {
    throw new Error('写入提成回填必须显式传入 --storeId，避免跨门店误写。');
  }

  const { candidates, skipped } = await collectCandidates(args);
  const ruleTypes = [...new Set(candidates.map((candidate) => candidate.type))];
  const rules = ruleTypes.length
    ? await prisma.commissionRule.findMany({
        where: {
          ...(args.storeId ? { storeId: args.storeId } : {}),
          type: { in: ruleTypes },
          status: 'active',
        },
      })
    : [];
  const rulesByScope = new Map<string, any[]>();
  for (const rule of rules) {
    const key = `${rule.storeId}:${rule.type}`;
    const list = rulesByScope.get(key) ?? [];
    list.push(rule);
    rulesByScope.set(key, list);
  }
  const planned = candidates
    .map((candidate) => {
      const scopedRules = (rulesByScope.get(`${candidate.order.storeId}:${candidate.type}`) ?? []).filter((rule) => {
        const staffUserId = toNumber(candidate.beautician.userId);
        const levelId = toNumber(candidate.beautician.levelId);
        const userMatched = !rule.userId || toNumber(rule.userId) === staffUserId;
        const levelMatched = !rule.levelId || toNumber(rule.levelId) === levelId;
        return userMatched && levelMatched;
      });
      return calculatePlannedCommission(candidate, scopedRules);
    })
    .filter((item): item is PlannedCommission => Boolean(item));

  const created: any[] = [];
  if (args.apply) {
    for (const item of planned) {
      const record = await prisma.commissionRecord.create({
        data: {
          storeId: item.storeId,
          staffUserId: item.staffUserId,
          beauticianId: item.beauticianId,
          orderId: item.orderId,
          orderItemId: item.itemId,
          ruleId: item.ruleId,
          type: item.itemType,
          sourceAmount: item.sourceAmount,
          rate: item.rate,
          amount: item.amount,
          status: 'pending',
          settleMonth: getSettleMonth(),
          remark: '经营利润历史订单提成回填',
        },
      });
      created.push(record);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        storeId: args.storeId ?? null,
        from: args.from.toISOString(),
        to: args.to.toISOString(),
        summary: {
          plannedCommissionBackfill: planned.length,
          createdCommissionRecords: created.length,
          skippedExistingCommission: skipped.existingCommission.length,
          skippedMissingBeautician: skipped.missingBeautician.length,
          skippedMissingStaffUser: skipped.missingStaffUser.length,
          skippedUnsupportedItemType: skipped.unsupportedItemType.length,
          skippedNonPositiveSubtotal: skipped.nonPositiveSubtotal.length,
        },
        planned: planned.slice(0, 50),
        created: created.slice(0, 50),
        skipped: {
          existingCommission: skipped.existingCommission.slice(0, 20),
          missingBeautician: skipped.missingBeautician.slice(0, 20),
          missingStaffUser: skipped.missingStaffUser.slice(0, 20),
          unsupportedItemType: skipped.unsupportedItemType.slice(0, 20),
          nonPositiveSubtotal: skipped.nonPositiveSubtotal.slice(0, 20),
        },
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
