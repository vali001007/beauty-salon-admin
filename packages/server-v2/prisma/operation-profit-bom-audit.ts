import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type BomAuditArgs = {
  storeId?: number;
  from: Date;
  to: Date;
};

type MissingProjectEntry = {
  projectId: number | null;
  projectName: string;
  orderItemCount: number;
  totalServiceIncome: number;
  identity: ProjectIdentity;
  project?: {
    id: number;
    name: string;
    price: number;
    typeId: number | null;
    typeName: string | null;
    status: string;
  } | null;
  orderItems: Array<{
    orderId: number;
    orderNo: string;
    orderCreatedAt: Date;
    customerName: string | null;
    itemId: number;
    itemName: string;
    subtotal: number;
    quantity: number;
    beauticianId: number | null;
  }>;
  referenceTemplates: ReferenceTemplate[];
  relatedStockMovements: RelatedStockMovement[];
};

type ProjectIdentity = {
  status: 'current_store_project_without_bom' | 'project_in_other_store' | 'deleted_or_inactive_project' | 'project_not_found';
  reason: string;
  matchedProject: ProjectSnapshot | null;
  sameIdProduct: ProductSnapshot | null;
};

type ProjectSnapshot = {
  id: number;
  storeId: number;
  name: string;
  price: number;
  typeId: number | null;
  typeName: string | null;
  status: string;
  deletedAt: Date | null;
  bomCount: number;
  estimatedMaterialCost: number;
};

type ProductSnapshot = {
  id: number;
  storeId: number;
  name: string;
  sku: string;
  costPrice: number;
  retailPrice: number;
  status: string;
  deletedAt: Date | null;
};

type ReferenceTemplate = {
  projectId: number;
  projectName: string;
  typeId: number | null;
  typeName: string | null;
  price: number;
  bomCount: number;
  estimatedMaterialCost: number;
  score: number;
  reasons: string[];
  bom: Array<{
    productId: number;
    productName: string;
    sku: string;
    standardQty: number;
    unit: string;
    costPrice: number;
    estimatedCost: number;
  }>;
};

type RelatedStockMovement = {
  id: number;
  movementNo: string;
  movementType: string;
  productId: number;
  productName: string;
  quantity: number;
  sourceType: string | null;
  sourceId: number | null;
  sourceNo: string | null;
  remark: string | null;
  occurredAt: Date;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): BomAuditArgs {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }

  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : undefined;
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }

  const from = new Date(`${args.get('from') ?? defaultFrom}T00:00:00.000Z`);
  const to = new Date(`${args.get('to') ?? defaultTo}T23:59:59.999Z`);
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
  const type = String(value ?? '').toLowerCase();
  if (['project', 'service', 'service_project'].includes(type)) return 'project';
  return undefined;
}

function priceSimilarityScore(targetPrice: number, candidatePrice: number) {
  if (targetPrice <= 0 || candidatePrice <= 0) return { score: 0, reason: '价格缺失，不能按价格相似度判断' };
  const diffRate = Math.abs(targetPrice - candidatePrice) / targetPrice;
  if (diffRate <= 0.1) return { score: 30, reason: `价格差异 ${(diffRate * 100).toFixed(1)}%，高度接近` };
  if (diffRate <= 0.25) return { score: 20, reason: `价格差异 ${(diffRate * 100).toFixed(1)}%，可参考` };
  if (diffRate <= 0.4) return { score: 10, reason: `价格差异 ${(diffRate * 100).toFixed(1)}%，弱参考` };
  return { score: 0, reason: `价格差异 ${(diffRate * 100).toFixed(1)}%，不建议直接套用` };
}

function buildTemplate(project: any, target?: any): ReferenceTemplate {
  const reasons: string[] = [];
  let score = 0;
  if (target?.typeId && project.typeId === target.typeId) {
    score += 45;
    reasons.push('同项目分类');
  }
  const priceScore = priceSimilarityScore(toNumber(target?.price), toNumber(project.price));
  score += priceScore.score;
  reasons.push(priceScore.reason);
  if (project.status === 'active') {
    score += 10;
    reasons.push('项目启用中');
  }
  if ((project.bomItems?.length ?? 0) > 0) {
    score += 15;
    reasons.push('已有 BOM');
  }

  const bom = (project.bomItems ?? []).map((item: any) => {
    const standardQty = toNumber(item.standardQty);
    const costPrice = toNumber(item.product?.costPrice);
    return {
      productId: item.productId,
      productName: item.product?.name ?? '',
      sku: item.product?.sku ?? '',
      standardQty,
      unit: item.unit ?? item.product?.unit ?? '',
      costPrice,
      estimatedCost: standardQty * costPrice,
    };
  });

  return {
    projectId: project.id,
    projectName: project.name,
    typeId: project.typeId ?? null,
    typeName: project.type?.name ?? null,
    price: toNumber(project.price),
    bomCount: bom.length,
    estimatedMaterialCost: bom.reduce((sum: number, item: any) => sum + item.estimatedCost, 0),
    score,
    reasons,
    bom,
  };
}

function toProjectSnapshot(project: any): ProjectSnapshot {
  const bom = project.bomItems ?? [];
  return {
    id: project.id,
    storeId: project.storeId,
    name: project.name,
    price: toNumber(project.price),
    typeId: project.typeId ?? null,
    typeName: project.type?.name ?? null,
    status: project.status,
    deletedAt: project.deletedAt ?? null,
    bomCount: bom.length,
    estimatedMaterialCost: bom.reduce((sum: number, item: any) => sum + toNumber(item.standardQty) * toNumber(item.product?.costPrice), 0),
  };
}

function toProductSnapshot(product: any): ProductSnapshot {
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    sku: product.sku,
    costPrice: toNumber(product.costPrice),
    retailPrice: toNumber(product.retailPrice),
    status: product.status,
    deletedAt: product.deletedAt ?? null,
  };
}

function diagnoseProjectIdentity(params: {
  projectId: number | null;
  requestedStoreId?: number;
  currentStoreProject?: any | null;
  anyStoreProject?: any | null;
  sameIdProduct?: any | null;
}): ProjectIdentity {
  const { projectId, requestedStoreId, currentStoreProject, anyStoreProject, sameIdProduct } = params;
  const productSnapshot = sameIdProduct ? toProductSnapshot(sameIdProduct) : null;
  if (!projectId) {
    return {
      status: 'project_not_found',
      reason: '订单项目明细缺 itemId，无法定位项目档案',
      matchedProject: null,
      sameIdProduct: productSnapshot,
    };
  }
  if (currentStoreProject) {
    const snapshot = toProjectSnapshot(currentStoreProject);
    const inactive = currentStoreProject.deletedAt || currentStoreProject.status !== 'active';
    return {
      status: inactive ? 'deleted_or_inactive_project' : 'current_store_project_without_bom',
      reason: inactive ? '本店项目存在但已删除或停用，且没有可用 BOM' : '本店项目存在但没有 BOM',
      matchedProject: snapshot,
      sameIdProduct: productSnapshot,
    };
  }
  if (anyStoreProject) {
    return {
      status: 'project_in_other_store',
      reason: `项目 ID ${projectId} 存在，但不属于目标门店 ${requestedStoreId ?? '未指定'}`,
      matchedProject: toProjectSnapshot(anyStoreProject),
      sameIdProduct: productSnapshot,
    };
  }
  return {
    status: 'project_not_found',
    reason: productSnapshot
      ? `项目 ID ${projectId} 在项目表不存在，但商品表存在同 ID 商品：${productSnapshot.name}`
      : `项目 ID ${projectId} 在项目表不存在`,
    matchedProject: null,
    sameIdProduct: productSnapshot,
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
    orderBy: { createdAt: 'desc' },
  });

  const projectItems = orders.flatMap((order) =>
    order.orderItems
      .filter((item) => itemType(item.itemType) === 'project')
      .map((item) => ({ order, item })),
  );
  const projectIds = [...new Set(projectItems.map(({ item }) => item.itemId).filter((id): id is number => Boolean(id)))];

  const [projects, allProjects, productsWithSameIds, projectBomItems, templateProjects] = await Promise.all([
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds }, ...(args.storeId ? { storeId: args.storeId } : {}) },
          include: { type: true, bomItems: { include: { product: true } } },
        })
      : [],
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          include: { type: true, bomItems: { include: { product: true } } },
        })
      : [],
    projectIds.length
      ? prisma.product.findMany({
          where: { id: { in: projectIds }, ...(args.storeId ? { storeId: args.storeId } : {}) },
        })
      : [],
    projectIds.length ? prisma.projectBomItem.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true } }) : [],
    prisma.project.findMany({
      where: {
        ...(args.storeId ? { storeId: args.storeId } : {}),
        deletedAt: null,
        bomItems: { some: {} },
      },
      include: { type: true, bomItems: { include: { product: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    }),
  ]);

  const projectBomRows = projectBomItems as Array<{ projectId: number }>;
  const projectById = new Map<number, (typeof projects)[number]>(projects.map((project) => [project.id, project]));
  const allProjectById = new Map<number, (typeof allProjects)[number]>(allProjects.map((project) => [project.id, project]));
  const productById = new Map<number, (typeof productsWithSameIds)[number]>(productsWithSameIds.map((product) => [product.id, product]));
  const currentStoreProjectIds = new Set<number>(projects.map((project) => project.id));
  const projectIdsWithBom = new Set<number>(projectBomRows.filter((item) => currentStoreProjectIds.has(item.projectId)).map((item) => item.projectId));
  const missingProjectGroups = new Map<string, MissingProjectEntry>();

  for (const { order, item } of projectItems) {
    const projectId = item.itemId ?? null;
    const currentStoreProject = projectId ? projectById.get(projectId) : null;
    if (projectId && currentStoreProject && projectIdsWithBom.has(projectId)) continue;
    const key = projectId ? String(projectId) : `missing-project-id:${item.name}`;
    const existing = missingProjectGroups.get(key);
    const orderItem = {
      orderId: order.id,
      orderNo: order.orderNo,
      orderCreatedAt: order.createdAt,
      customerName: order.customerName ?? null,
      itemId: item.id,
      itemName: item.name,
      subtotal: toNumber(item.subtotal),
      quantity: toNumber(item.quantity),
      beauticianId: item.beauticianId ?? null,
    };
    const identity = diagnoseProjectIdentity({
      projectId,
      requestedStoreId: args.storeId,
      currentStoreProject,
      anyStoreProject: projectId ? allProjectById.get(projectId) : null,
      sameIdProduct: projectId ? productById.get(projectId) : null,
    });
    if (existing) {
      existing.orderItemCount += 1;
      existing.totalServiceIncome += orderItem.subtotal;
      existing.orderItems.push(orderItem);
      continue;
    }
    missingProjectGroups.set(key, {
      projectId,
      projectName: currentStoreProject?.name ?? item.name,
      orderItemCount: 1,
      totalServiceIncome: orderItem.subtotal,
      identity,
      project: currentStoreProject
        ? {
            id: currentStoreProject.id,
            name: currentStoreProject.name,
            price: toNumber(currentStoreProject.price),
            typeId: currentStoreProject.typeId ?? null,
            typeName: currentStoreProject.type?.name ?? null,
            status: currentStoreProject.status,
          }
        : null,
      orderItems: [orderItem],
      referenceTemplates: [],
      relatedStockMovements: [],
    });
  }

  const missingEntries = [...missingProjectGroups.values()];
  for (const entry of missingEntries) {
    const target = entry.project ?? { typeId: null, price: entry.totalServiceIncome / Math.max(entry.orderItemCount, 1) };
    entry.referenceTemplates = templateProjects
      .filter((project) => project.id !== entry.projectId)
      .map((project) => buildTemplate(project, target))
      .filter((template) => template.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  const missingOrderIds = [...new Set(missingEntries.flatMap((entry) => entry.orderItems.map((item) => item.orderId)))];
  const missingOrderNos = [...new Set(missingEntries.flatMap((entry) => entry.orderItems.map((item) => item.orderNo)))];
  const movements = missingOrderIds.length
    ? await prisma.stockMovement.findMany({
        where: {
          ...(args.storeId ? { storeId: args.storeId } : {}),
          quantity: { lt: 0 },
          OR: [
            { sourceType: { in: ['project_order', 'product_order'] }, sourceId: { in: missingOrderIds } },
            { sourceNo: { in: missingOrderNos } },
          ],
        },
        include: { product: true },
        orderBy: { occurredAt: 'desc' },
      })
    : [];

  for (const entry of missingEntries) {
    const orderIds = new Set(entry.orderItems.map((item) => item.orderId));
    const orderNos = new Set(entry.orderItems.map((item) => item.orderNo));
    entry.relatedStockMovements = movements
      .filter((movement) => (movement.sourceId ? orderIds.has(movement.sourceId) : false) || (movement.sourceNo ? orderNos.has(movement.sourceNo) : false))
      .map((movement) => ({
        id: movement.id,
        movementNo: movement.movementNo,
        movementType: movement.movementType,
        productId: movement.productId,
        productName: movement.product?.name ?? '',
        quantity: toNumber(movement.quantity),
        sourceType: movement.sourceType ?? null,
        sourceId: movement.sourceId ?? null,
        sourceNo: movement.sourceNo ?? null,
        remark: movement.remark ?? null,
        occurredAt: movement.occurredAt,
      }));
  }

  const candidateTemplateProjects = new Set(
    missingEntries.flatMap((entry) => entry.referenceTemplates.map((template) => template.projectId)),
  );

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        storeId: args.storeId ?? null,
        from: args.from.toISOString(),
        to: args.to.toISOString(),
        summary: {
          scannedOrders: orders.length,
          projectOrderItemCount: projectItems.length,
          missingBomItems: missingEntries.reduce((sum, entry) => sum + entry.orderItemCount, 0),
          missingProjectCount: missingEntries.length,
          missingProjectsWithTemplateCandidates: missingEntries.filter((entry) => entry.referenceTemplates.length > 0).length,
          candidateTemplateProjectCount: candidateTemplateProjects.size,
          relatedStockMovementCount: missingEntries.reduce((sum, entry) => sum + entry.relatedStockMovements.length, 0),
        },
        missingProjects: missingEntries,
        notes: [
          'This script is read-only and does not create ProjectBomItem rows.',
          'Reference templates are similarity clues only. Business must confirm the exact products and quantities before BOM write-back.',
          'If a historical project should not be repaired, mark it as a historical BOM gap and keep project margin flagged as missing_bom.',
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
