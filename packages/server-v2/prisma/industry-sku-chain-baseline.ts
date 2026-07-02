import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 1),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

const today = new Date().toISOString().slice(0, 10);

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function ensureDir(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function mdTable(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

async function resolveStore(storeId: number) {
  if (!storeId) return null;
  const store = await prisma.store.findFirst({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) throw new Error(`未找到门店：${storeId}`);
  return store;
}

async function countValidAdoptions(storeId?: number) {
  const adoptions = await prisma.industryAdoptionRecord.findMany({
    where: {
      productTemplateId: { not: null },
      localProductId: { not: null },
      ...(storeId ? { storeId } : {}),
    },
    select: { id: true, localProductId: true },
  });
  const productIds = [...new Set(adoptions.map((item: any) => item.localProductId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, ...(storeId ? { storeId } : {}) },
    select: { id: true, deletedAt: true },
  });
  const activeProductIds = new Set(products.filter((product: any) => !product.deletedAt).map((product: any) => product.id));
  const validActive = adoptions.filter((adoption: any) => activeProductIds.has(adoption.localProductId)).length;
  return {
    total: adoptions.length,
    validActive,
    invalid: adoptions.length - validActive,
  };
}

async function main() {
  const storeId = Number(getArg('store-id') ?? getArg('storeId') ?? 0);
  const store = await resolveStore(storeId);
  const productWhere = { deletedAt: null, ...(store ? { storeId: store.id } : {}) };
  const projectWhere = store ? { storeId: store.id, deletedAt: null } : { deletedAt: null };
  const stockMovementWhere = store ? { storeId: store.id } : {};
  const supplyMappingWhere = store ? { storeId: store.id } : {};
  const procurementOrderWhere = store ? { storeId: store.id } : {};
  const productOrderWhere = store ? { storeId: store.id } : {};
  const outMd = resolve(
    process.cwd(),
    getArg('out-md') ?? `../../docs/04-测试数据/industry-sku-chain-baseline-${today}.md`,
  );
  const outJson = resolve(
    process.cwd(),
    getArg('out-json') ?? `../../docs/04-测试数据/industry-sku-chain-baseline-${today}.json`,
  );

  const [
    publishedTemplates,
    productTemplates,
    adoptionHealth,
    activeProducts,
    productsWithSpecFields,
    productsInBom,
    projectBomItems,
    stockBatches,
    stockMovements,
    manualPurchaseOrders,
    supplyMappings,
    supplyMappingsWithQuote,
    procurementOrders,
    procurementOrderItems,
    productOrders,
    productOrderItems,
  ] = await Promise.all([
    prisma.industryProductTemplate.count({ where: { status: 'published', deletedAt: null } }),
    prisma.industryProductTemplate.count({ where: { deletedAt: null } }),
    countValidAdoptions(store?.id),
    prisma.product.count({ where: productWhere }),
    prisma.product.count({
      where: {
        ...productWhere,
        specQuantity: { not: null },
        specUnit: { not: null },
        packageUnit: { not: null },
      },
    }),
    prisma.product.count({ where: { ...productWhere, bomItems: { some: { project: projectWhere } } } }),
    prisma.projectBomItem.count({ where: store ? { project: projectWhere } : {} }),
    prisma.stockBatch.count({ where: store ? { product: { storeId: store.id, deletedAt: null } } : {} }),
    prisma.stockMovement.count({ where: stockMovementWhere }),
    prisma.purchaseOrder.count(),
    prisma.supplyCatalogMapping.count({ where: supplyMappingWhere }),
    prisma.supplyCatalogMapping.count({
      where: {
        ...supplyMappingWhere,
        mappingStatus: 'active',
        supplySku: {
          quotes: {
            some: {
              status: 'active',
              auditStatus: 'approved',
              deletedAt: null,
            },
          },
        },
      },
    }),
    prisma.procurementOrder.count({ where: procurementOrderWhere }),
    prisma.procurementOrderItem.count({ where: store ? { order: procurementOrderWhere } : {} }),
    prisma.productOrder.count({ where: productOrderWhere }),
    prisma.orderItem.count({
      where: { itemType: { in: ['product', 'goods'] }, itemId: { not: null }, ...(store ? { order: productOrderWhere } : {}) },
    }),
  ]);

  const movementTypes = await prisma.stockMovement.groupBy({
    by: ['movementType'],
    where: stockMovementWhere,
    _count: { _all: true },
    orderBy: { movementType: 'asc' },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    scope: store ? { storeId: store.id, storeName: store.name } : { storeId: null, storeName: '全部门店' },
    summary: {
      productTemplates,
      publishedTemplates,
      adoptionTotal: adoptionHealth.total,
      adoptionValidActive: adoptionHealth.validActive,
      adoptionInvalid: adoptionHealth.invalid,
      activeProducts,
      productsWithSpecFields,
      productsInBom,
      projectBomItems,
      stockBatches,
      stockMovements,
      manualPurchaseOrders,
      manualPurchaseOrdersScope: 'legacy_global_table_without_store_id',
      supplyMappings,
      supplyMappingsWithQuote,
      procurementOrders,
      procurementOrderItems,
      productOrders,
      productOrderItems,
    },
    movementTypes: movementTypes.map((item: any) => ({
      movementType: item.movementType,
      count: item._count._all,
    })),
  };

  const markdown = [
    `# 行业标准品到库存采购 BOM 销售链路基线快照`,
    ``,
    `生成时间：${report.generatedAt}`,
    ``,
    `验收范围：${store ? `${store.name}（ID ${store.id}）` : '全部门店'}`,
    ``,
    `## 链路指标`,
    ``,
    mdTable(
      ['对象', '数量', '交付含义'],
      [
        ['行业标准商品/耗品模板', productTemplates, '标准品源头总量'],
        ['已发布标准品', publishedTemplates, '可被门店采用的模板'],
        ['标准品采用记录', adoptionHealth.total, '标准品到本地 SKU 的追溯记录'],
        ['有效采用记录', adoptionHealth.validActive, '能追溯到未删除本地商品'],
        ['异常采用记录', adoptionHealth.invalid, '会影响来源展示和批量映射'],
        ['门店本地产品', activeProducts, '库存、BOM、采购、销售真实对象'],
        ['规格字段完整产品', productsWithSpecFields, '已具备规格数量/规格单位/包装'],
        ['进入 BOM 的产品', productsInBom, '已参与服务扣耗'],
        ['BOM 明细', projectBomItems, '项目到耗材扣耗规则'],
        ['库存批次', stockBatches, '可入库和临期追踪'],
        ['库存流水', stockMovements, '入库/出库/扣耗真实流水'],
        ['手工采购单（旧表全局）', manualPurchaseOrders, '旧 PurchaseOrder 表无 storeId，仅作为历史总量参考'],
        ['供应链映射', supplyMappings, '本地 SKU 到平台供应 SKU 的映射'],
        ['有可用报价映射', supplyMappingsWithQuote, '可直接平台采购的候选'],
        ['平台采购单', procurementOrders, '供应链履约主单'],
        ['平台采购明细', procurementOrderItems, '供应链履约明细'],
        ['商品订单', productOrders, '销售侧主单'],
        ['商品订单明细', productOrderItems, '销售侧商品明细'],
      ],
    ),
    ``,
    `## 库存流水类型分布`,
    ``,
    movementTypes.length
      ? mdTable(
          ['流水类型', '数量'],
          movementTypes.map((item: any) => [item.movementType, item._count._all]),
        )
      : '暂无库存流水。',
    ``,
    `## 当前断点判断`,
    ``,
    `- 标准品到本地 SKU：${adoptionHealth.validActive > 0 ? '已有有效采用，但覆盖率仍需补齐。' : '未形成有效采用。'}`,
    `- 本地 SKU 到 BOM/库存：${projectBomItems > 0 && stockMovements > 0 ? '已有真实业务流水。' : '仍缺 BOM 或库存流水样本。'}`,
    `- 本地 SKU 到供应链映射：${supplyMappings > 0 ? '已有映射，需继续验报价和采购。' : '尚未打通，采购建议只能回退手工采购。'}`,
    `- 平台采购履约：${procurementOrders > 0 ? '已有平台采购单，需验收发货收货闭环。' : '尚未产生平台采购单。'}`,
  ].join('\n');

  ensureDir(outMd);
  ensureDir(outJson);
  writeFileSync(outMd, markdown, 'utf8');
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`行业 SKU 链路基线生成完成：${outMd}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
