import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type AuditArgs = {
  storeId?: number;
  from: Date;
  to: Date;
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
  return { storeId, from, to };
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function itemType(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function hasPositivePayloadCost(payload: unknown) {
  if (!payload || typeof payload !== 'object') return false;
  const source = payload as Record<string, unknown>;
  return ['costPrice', 'productCostPrice', 'costAmount', 'productCostAmount'].some((key) => toNumber(source[key]) > 0);
}

async function main() {
  const args = parseArgs();
  const where = {
    ...(args.storeId ? { storeId: args.storeId } : {}),
    createdAt: { gte: args.from, lte: args.to },
    status: { in: ['paid', 'completed'] },
  };

  const orders = await prisma.productOrder.findMany({
    where,
    include: { orderItems: true },
    orderBy: { createdAt: 'desc' },
  });
  const productItems = orders.flatMap((order) =>
    order.orderItems
      .filter((item) => ['product', 'goods'].includes(itemType(item.itemType)))
      .map((item) => ({ order, item })),
  );
  const projectItems = orders.flatMap((order) =>
    order.orderItems
      .filter((item) => ['project', 'service', 'service_project'].includes(itemType(item.itemType)))
      .map((item) => ({ order, item })),
  );

  const productIds = [...new Set(productItems.map(({ item }) => item.itemId).filter((id): id is number => Boolean(id)))];
  const projectIds = [...new Set(projectItems.map(({ item }) => item.itemId).filter((id): id is number => Boolean(id)))];
  const orderItemIds = [...new Set([...productItems, ...projectItems].map(({ item }) => item.id))];

  const [products, projects, projectBomItems, commissionRecords] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({ where: { id: { in: productIds }, ...(args.storeId ? { storeId: args.storeId } : {}) }, select: { id: true, costPrice: true } })
      : [],
    projectIds.length
      ? prisma.project.findMany({ where: { id: { in: projectIds }, ...(args.storeId ? { storeId: args.storeId } : {}) }, select: { id: true } })
      : [],
    projectIds.length ? prisma.projectBomItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true } }) : [],
    orderItemIds.length
      ? prisma.commissionRecord.findMany({
          where: { orderItemId: { in: orderItemIds }, status: { not: 'cancelled' } },
          select: { orderItemId: true, type: true },
        })
      : [],
  ]);

  const productCostById = new Map<number, number>(products.map((product): [number, number] => [product.id, toNumber(product.costPrice)]));
  const projectMasterIds = new Set(projects.map((project) => project.id));
  const projectIdsWithBom = new Set(projectBomItems.map((item) => item.projectId));
  const orderItemIdsWithCommission = new Set(commissionRecords.map((record) => record.orderItemId).filter(Boolean));

  const productItemsMissingProductId = productItems.filter(({ item }) => !item.itemId);
  const productItemsMissingCost = productItems.filter(({ item }) => {
    if (hasPositivePayloadCost(item.payload)) return false;
    if (!item.itemId) return true;
    return toNumber(productCostById.get(item.itemId)) <= 0;
  });
  const productItemsMissingCommission = productItems.filter(({ item }) => !orderItemIdsWithCommission.has(item.id));
  const productItemsMissingBeautician = productItems.filter(({ item }) => !item.beauticianId);
  const projectItemsMissingProjectId = projectItems.filter(({ item }) => !item.itemId);
  const projectItemsMissingProjectMaster = projectItems.filter(({ item }) => item.itemId && !projectMasterIds.has(item.itemId));
  const projectItemsMissingBom = projectItems.filter(({ item }) => item.itemId && projectMasterIds.has(item.itemId) && !projectIdsWithBom.has(item.itemId));
  const projectItemsMissingCommission = projectItems.filter(({ item }) => !orderItemIdsWithCommission.has(item.id));
  const projectItemsMissingBeautician = projectItems.filter(({ item }) => !item.beauticianId);

  const sample = (rows: typeof productItems) =>
    rows.slice(0, 10).map(({ order, item }) => ({
      orderId: order.id,
      orderNo: order.orderNo,
      orderCreatedAt: order.createdAt,
      orderSource: order.source,
      itemId: item.id,
      itemType: item.itemType,
      itemObjectId: item.itemId,
      itemName: item.name,
      subtotal: toNumber(item.subtotal),
      beauticianId: item.beauticianId,
    }));

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        storeId: args.storeId ?? null,
        from: args.from.toISOString(),
        to: args.to.toISOString(),
        summary: {
          orderCount: orders.length,
          productOrderItemCount: productItems.length,
          projectOrderItemCount: projectItems.length,
          productItemsMissingProductId: productItemsMissingProductId.length,
          productItemsMissingCost: productItemsMissingCost.length,
          productItemsMissingBeautician: productItemsMissingBeautician.length,
          productItemsMissingCommission: productItemsMissingCommission.length,
          projectItemsMissingProjectId: projectItemsMissingProjectId.length,
          projectItemsMissingProjectMaster: projectItemsMissingProjectMaster.length,
          projectItemsMissingBom: projectItemsMissingBom.length,
          projectItemsMissingBeautician: projectItemsMissingBeautician.length,
          projectItemsMissingCommission: projectItemsMissingCommission.length,
        },
        samples: {
          productItemsMissingProductId: sample(productItemsMissingProductId),
          productItemsMissingCost: sample(productItemsMissingCost),
          productItemsMissingBeautician: sample(productItemsMissingBeautician),
          productItemsMissingCommission: sample(productItemsMissingCommission),
          projectItemsMissingProjectId: sample(projectItemsMissingProjectId),
          projectItemsMissingProjectMaster: sample(projectItemsMissingProjectMaster),
          projectItemsMissingBom: sample(projectItemsMissingBom),
          projectItemsMissingBeautician: sample(projectItemsMissingBeautician),
          projectItemsMissingCommission: sample(projectItemsMissingCommission),
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
