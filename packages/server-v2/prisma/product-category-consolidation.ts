import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = args.has('--yes');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

type StandardChild = {
  name: string;
  aliases: RegExp[];
};

type StandardRoot = {
  name: string;
  children: StandardChild[];
};

const standardTree: StandardRoot[] = [
  {
    name: '护肤产品',
    children: [
      { name: '清洁卸妆', aliases: [/洁面|卸妆|清洁|洗面|洁肤/] },
      { name: '水乳喷雾', aliases: [/爽肤|化妆水|柔肤水|喷雾|水乳|乳液/] },
      { name: '精华安瓶', aliases: [/精华|安瓶|原液|玻尿酸|烟酰胺|亮肤|淡斑|修护液/] },
      { name: '面膜软膜', aliases: [/面膜|软膜|膜粉|贴膜/] },
      { name: '眼部护理', aliases: [/眼霜|眼部|眼膜|眼周/] },
      { name: '面霜乳霜', aliases: [/面霜|乳霜|修护乳|霜|膏/] },
      { name: '防晒隔离', aliases: [/防晒|隔离/] },
    ],
  },
  {
    name: '服务耗材',
    children: [
      { name: '一次性耗材', aliases: [/一次性|护理巾|棉片|纱布|手套|口罩|床单|毛巾|日用消耗品/] },
      { name: '仪器耗材', aliases: [/仪器耗材|水氧|小气泡|导入|探头|胶头|仪器/] },
      { name: '护理耗材包', aliases: [/耗材|院装|调膜|刷|碗|护理包/] },
    ],
  },
  {
    name: '身体头皮护理',
    children: [
      { name: '身体护理', aliases: [/身体|精油|肩颈|背部|身体乳|按摩油/] },
      { name: '手部护理', aliases: [/手部|手膜|护手|手霜/] },
      { name: '头皮洗护', aliases: [/头皮|洗发|护发|发膜|养发/] },
    ],
  },
  {
    name: '美容工具与设备',
    children: [
      { name: '美容工具', aliases: [/工具|刮痧|量杯|刷子|美容工具/] },
      { name: '仪器配件', aliases: [/设备|配件|仪器配件/] },
    ],
  },
  {
    name: '其他',
    children: [{ name: '未归类', aliases: [] }],
  },
];

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function categoryKey(parentName: string, childName: string) {
  return `${parentName} / ${childName}`;
}

function standardKeys() {
  const keys = new Set<string>();
  for (const root of standardTree) {
    keys.add(root.name);
    for (const child of root.children) keys.add(categoryKey(root.name, child.name));
  }
  return keys;
}

function classifyProduct(product: any, currentCategoryName?: string) {
  const productText = [
    product.name,
    product.sku,
    product.brand,
    product.spec,
    product.unit,
  ]
    .map(normalizeText)
    .join(' ');
  const fallbackText = normalizeText(currentCategoryName);

  const findRoute = (text: string) => {
    if (!text) return null;

    // More specific rules must run before generic skincare words.
    const forcedRoutes: Array<{ parent: string; child: string; aliases: RegExp[] }> = [
      { parent: '服务耗材', child: '一次性耗材', aliases: standardTree[1].children[0].aliases },
      { parent: '服务耗材', child: '仪器耗材', aliases: standardTree[1].children[1].aliases },
      { parent: '服务耗材', child: '护理耗材包', aliases: standardTree[1].children[2].aliases },
      { parent: '身体头皮护理', child: '身体护理', aliases: standardTree[2].children[0].aliases },
      { parent: '身体头皮护理', child: '手部护理', aliases: standardTree[2].children[1].aliases },
      { parent: '身体头皮护理', child: '头皮洗护', aliases: standardTree[2].children[2].aliases },
      { parent: '护肤产品', child: '眼部护理', aliases: standardTree[0].children[4].aliases },
    ];
    for (const route of forcedRoutes) {
      if (route.aliases.some((alias) => alias.test(text))) return route;
    }

    for (const root of standardTree) {
      for (const child of root.children) {
        if (child.aliases.some((alias) => alias.test(text))) {
          return { parent: root.name, child: child.name };
        }
      }
    }

    return null;
  };

  const route = findRoute(productText) ?? findRoute(fallbackText);
  if (route) return route;

  return { parent: '其他', child: '未归类' };
}

async function getCategorySnapshot() {
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: {
          products: true,
          children: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    products: category._count.products,
    children: category._count.children,
  }));
}

async function ensureCategory(tx: any, name: string, parentId: number | null) {
  const existing = await tx.category.findFirst({
    where: { name, parentId },
    orderBy: { id: 'asc' },
  });
  if (existing) return { category: existing, created: false };

  const category = await tx.category.create({
    data: { name, parentId },
  });
  return { category, created: true };
}

async function ensureStandardTree(tx: any) {
  const created: Array<{ id: number; name: string; parentId: number | null }> = [];
  const byPath = new Map<string, number>();

  for (const root of standardTree) {
    const rootResult = await ensureCategory(tx, root.name, null);
    if (rootResult.created) {
      created.push({ id: rootResult.category.id, name: root.name, parentId: null });
    }
    byPath.set(root.name, rootResult.category.id);

    for (const child of root.children) {
      const childResult = await ensureCategory(tx, child.name, rootResult.category.id);
      if (childResult.created) {
        created.push({ id: childResult.category.id, name: child.name, parentId: rootResult.category.id });
      }
      byPath.set(categoryKey(root.name, child.name), childResult.category.id);
    }
  }

  return { created, byPath };
}

async function mergeDuplicateStandardCategories(tx: any, byPath: Map<string, number>) {
  const merged: Array<{ fromId: number; toId: number; name: string; parentId: number | null }> = [];

  for (const root of standardTree) {
    const rootId = byPath.get(root.name);
    if (!rootId) continue;
    const duplicateRoots = await tx.category.findMany({
      where: { name: root.name, parentId: null, id: { not: rootId } },
      orderBy: { id: 'asc' },
    });
    for (const duplicate of duplicateRoots) {
      await tx.product.updateMany({ where: { categoryId: duplicate.id }, data: { categoryId: rootId } });
      await tx.category.updateMany({ where: { parentId: duplicate.id }, data: { parentId: rootId } });
      await tx.category.delete({ where: { id: duplicate.id } });
      merged.push({ fromId: duplicate.id, toId: rootId, name: root.name, parentId: null });
    }

    for (const child of root.children) {
      const childId = byPath.get(categoryKey(root.name, child.name));
      if (!childId) continue;
      const duplicates = await tx.category.findMany({
        where: { name: child.name, parentId: rootId, id: { not: childId } },
        orderBy: { id: 'asc' },
      });
      for (const duplicate of duplicates) {
        await tx.product.updateMany({ where: { categoryId: duplicate.id }, data: { categoryId: childId } });
        await tx.category.updateMany({ where: { parentId: duplicate.id }, data: { parentId: childId } });
        await tx.category.delete({ where: { id: duplicate.id } });
        merged.push({ fromId: duplicate.id, toId: childId, name: child.name, parentId: rootId });
      }
    }
  }

  return merged;
}

async function deleteEmptyLegacyCategories(tx: any, keepIds: Set<number>) {
  const deleted: Array<{ id: number; name: string; parentId: number | null }> = [];
  let changed = true;

  while (changed) {
    changed = false;
    const categories = await tx.category.findMany({
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    for (const category of categories) {
      if (keepIds.has(category.id)) continue;
      if (category._count.products > 0 || category._count.children > 0) continue;
      await tx.category.delete({ where: { id: category.id } });
      deleted.push({ id: category.id, name: category.name, parentId: category.parentId });
      changed = true;
    }
  }

  return deleted;
}

async function dryRun() {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      include: { parent: true },
      orderBy: { id: 'asc' },
    }),
    prisma.product.findMany({ include: { category: true }, orderBy: { id: 'asc' } }),
  ]);
  const expectedCategoryCount = standardTree.reduce((sum, root) => sum + 1 + root.children.length, 0);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryPathById = new Map<number, string>();
  for (const category of categories) {
    const parent = category.parentId ? categoryById.get(category.parentId) : null;
    categoryPathById.set(category.id, parent ? categoryKey(parent.name, category.name) : category.name);
  }
  const plannedMoves = products.flatMap((product) => {
    const target = classifyProduct(product, product.category?.name);
    const to = categoryKey(target.parent, target.child);
    const from = product.categoryId ? (categoryPathById.get(product.categoryId) ?? product.category?.name ?? '未归类') : '未归类';
    if (from === to) return [];
    return {
      id: product.id,
      name: product.name,
      from,
      to,
    };
  });

  const currentCategoryNames = categories.map((category) => categoryPathById.get(category.id) ?? category.name);
  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        currentCategoryCount: categories.length,
        expectedCategoryCount,
        currentCategoryNames,
        plannedProductMoveCount: plannedMoves.length,
        plannedProductMoveSamples: plannedMoves.slice(0, 20),
        standardTree: standardTree.map((root) => ({
          name: root.name,
          children: root.children.map((child) => child.name),
        })),
        nextStep: 'Run with --apply --yes to consolidate categories and relink products.',
      },
      null,
      2,
    ),
  );
}

async function applyRun() {
  if (!confirmed) {
    throw new Error('Refusing to write without --yes. Use --apply --yes after reviewing dry-run output.');
  }

  const before = await getCategorySnapshot();
  const result = await prisma.$transaction(
    async (tx) => {
      const { created, byPath } = await ensureStandardTree(tx);
      const merged = await mergeDuplicateStandardCategories(tx, byPath);
      const keepIds = new Set([...byPath.values()]);

      const products = await tx.product.findMany({
        include: { category: true },
        orderBy: { id: 'asc' },
      });

      const moves: Array<{ id: number; name: string; from: string; to: string }> = [];
      for (const product of products) {
        const target = classifyProduct(product, product.category?.name);
        const targetId = byPath.get(categoryKey(target.parent, target.child));
        if (!targetId) throw new Error(`Missing standard category ${target.parent} / ${target.child}`);
        if (product.categoryId !== targetId) {
          await tx.product.update({ where: { id: product.id }, data: { categoryId: targetId } });
          moves.push({
            id: product.id,
            name: product.name,
            from: product.category?.name ?? '未归类',
            to: categoryKey(target.parent, target.child),
          });
        }
      }

      const deletedLegacyCategories = await deleteEmptyLegacyCategories(tx, keepIds);
      return { created, merged, moves, deletedLegacyCategories };
    },
    { timeout: 30_000 },
  );
  const after = await getCategorySnapshot();

  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        beforeCategoryCount: before.length,
        afterCategoryCount: after.length,
        createdCategoryCount: result.created.length,
        mergedDuplicateCount: result.merged.length,
        movedProductCount: result.moves.length,
        deletedLegacyCategoryCount: result.deletedLegacyCategories.length,
        createdCategories: result.created,
        deletedLegacyCategories: result.deletedLegacyCategories,
        movedProductSamples: result.moves.slice(0, 20),
        finalCategories: after,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (apply) await applyRun();
  else await dryRun();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
