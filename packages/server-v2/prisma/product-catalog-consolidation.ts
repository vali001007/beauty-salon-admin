import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type RefCounts = {
  bom: number;
  batch: number;
  movement: number;
  procurementItem: number;
  supplyMapping: number;
  total: number;
};

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = args.has('--yes');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

async function getRefCounts(productId: number): Promise<RefCounts> {
  const [bom, batch, movement, procurementItem, supplyMapping] = await Promise.all([
    prisma.projectBomItem.count({ where: { productId } }),
    prisma.stockBatch.count({ where: { productId } }),
    prisma.stockMovement.count({ where: { productId } }),
    prisma.procurementOrderItem.count({ where: { productId } }).catch(() => 0),
    prisma.supplyCatalogMapping.count({ where: { productId } }).catch(() => 0),
  ]);
  return {
    bom,
    batch,
    movement,
    procurementItem,
    supplyMapping,
    total: bom + batch + movement + procurementItem + supplyMapping,
  };
}

function archivalSku(sku: string, suffix: string, productId: number) {
  const base = sku || `PRODUCT-${productId}`;
  return `${base}-${suffix}-${productId}`.slice(0, 180);
}

async function mergeDuplicateProducts(groups: any[]) {
  const actions = [];
  for (const group of groups) {
    const products = await prisma.product.findMany({
      where: { id: { in: group.ids } },
      include: { category: true, store: true },
    });
    const rows = [];
    for (const product of products) {
      rows.push({ product, refs: await getRefCounts(product.id) });
    }
    rows.sort((a, b) => {
      if (b.refs.total !== a.refs.total) return b.refs.total - a.refs.total;
      const aDemo = String(a.product.sku).includes('AMI-DEMO-FULL') ? 1 : 0;
      const bDemo = String(b.product.sku).includes('AMI-DEMO-FULL') ? 1 : 0;
      if (bDemo !== aDemo) return bDemo - aDemo;
      return a.product.id - b.product.id;
    });
    const keeper = rows[0];
    const losers = rows.slice(1);
    for (const loser of losers) {
      actions.push({
        kind: 'merge_duplicate',
        key: group.key,
        storeId: group.storeId,
        keepProductId: keeper.product.id,
        keepSku: keeper.product.sku,
        removeProductId: loser.product.id,
        removeSku: loser.product.sku,
        removeStock: toNumber(loser.product.currentStock),
        refs: loser.refs,
      });
      if (!apply) continue;
      await prisma.$transaction(async (tx) => {
        await tx.projectBomItem.updateMany({ where: { productId: loser.product.id }, data: { productId: keeper.product.id } });
        await tx.stockBatch.updateMany({ where: { productId: loser.product.id }, data: { productId: keeper.product.id } });
        await tx.stockMovement.updateMany({ where: { productId: loser.product.id }, data: { productId: keeper.product.id } });
        await tx.procurementOrderItem.updateMany({ where: { productId: loser.product.id }, data: { productId: keeper.product.id } });
        await tx.supplyCatalogMapping.updateMany({ where: { productId: loser.product.id }, data: { productId: keeper.product.id } });
        const freshKeeper = await tx.product.findUnique({ where: { id: keeper.product.id } });
        await tx.product.update({
          where: { id: keeper.product.id },
          data: {
            currentStock: toNumber(freshKeeper?.currentStock) + toNumber(loser.product.currentStock),
            safetyStock: Math.max(toNumber(freshKeeper?.safetyStock), toNumber(loser.product.safetyStock)),
            minPurchaseQty: Math.max(toNumber(freshKeeper?.minPurchaseQty), toNumber(loser.product.minPurchaseQty)),
          },
        });
        await tx.product.update({
          where: { id: loser.product.id },
          data: {
            status: 'inactive',
            deletedAt: new Date(),
            sku: archivalSku(loser.product.sku, 'MERGED', loser.product.id),
            salesDescription: `已归并至商品 #${keeper.product.id}（${keeper.product.sku}）`,
          },
        });
      });
    }
  }
  return actions;
}

async function archiveUnpricedProducts() {
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: 'active',
      retailPrice: 0,
      OR: [{ salePrice: null }, { salePrice: 0 }],
    },
    include: { category: true, store: true },
    orderBy: [{ storeId: 'asc' }, { id: 'asc' }],
  });
  const actions = [];
  const retained = [];
  for (const product of products) {
    const refs = await getRefCounts(product.id);
    if (refs.total > 0) {
      retained.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category?.name,
        refs,
        reason: '已被 BOM/库存/供应链引用，保留为耗材档案；商品订单选择器已剔除无售价商品',
      });
      continue;
    }
    actions.push({
      kind: 'archive_unpriced',
      productId: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category?.name,
      refs,
    });
    if (!apply) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        status: 'inactive',
        deletedAt: new Date(),
        sku: archivalSku(product.sku, 'NO-PRICE', product.id),
        salesDescription: '无售价且无业务引用，已从商品目录归档',
      },
    });
  }
  return { actions, retained };
}

async function main() {
  if (apply && !confirmed) {
    throw new Error('真实写库需要同时传入 --apply --yes');
  }

  const duplicateGroups = await prisma.$queryRaw<Array<{ storeId: number; key: string; ids: number[] }>>`
    select "storeId", lower(trim(name)) as key, array_agg(id order by id) as ids
    from "Product"
    where "deletedAt" is null
      and status = 'active'
      and (coalesce("salePrice", "retailPrice") > 0)
    group by "storeId", lower(trim(name)), "retailPrice", coalesce("salePrice", -1)
    having count(*) > 1
    order by "storeId", key
  `;

  const duplicateActions = await mergeDuplicateProducts(duplicateGroups);
  const unpriced = await archiveUnpricedProducts();

  const result = {
    mode: apply ? 'apply' : 'dry-run',
    duplicateGroupCount: duplicateGroups.length,
    duplicateActions,
    archivedUnpricedCount: unpriced.actions.length,
    archivedUnpricedActions: unpriced.actions,
    retainedUnpricedCount: unpriced.retained.length,
    retainedUnpriced: unpriced.retained,
  };
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
