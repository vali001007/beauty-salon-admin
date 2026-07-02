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

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function mdTable(headers: string[], rows: Array<Array<string | number>>) {
  if (!rows.length) return '暂无。';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function isQuoteAvailable(quote: any, now = new Date()) {
  const validFrom = quote.validFrom ? new Date(quote.validFrom) : null;
  const validTo = quote.validTo ? new Date(quote.validTo) : null;
  return (
    quote.status === 'active' &&
    quote.auditStatus === 'approved' &&
    !quote.deletedAt &&
    !['out_of_stock', 'unavailable'].includes(String(quote.stockStatus ?? '')) &&
    (!validFrom || validFrom <= now) &&
    (!validTo || validTo >= now)
  );
}

function availableQuotes(mapping: any) {
  return (mapping.supplySku?.quotes ?? []).filter((quote: any) => isQuoteAvailable(quote));
}

async function resolveStoreId(requestedStoreId?: string) {
  const parsed = Number(requestedStoreId ?? 0);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  const store = await prisma.store.findFirst({
    where: { deletedAt: null, status: { not: 'disabled' } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return store?.id;
}

async function main() {
  const storeId = await resolveStoreId(getArg('store-id'));
  const outMd = resolve(
    process.cwd(),
    getArg('out-md') ?? `../../docs/04-测试数据/industry-chain-operational-report-${today}.md`,
  );
  const outJson = resolve(
    process.cwd(),
    getArg('out-json') ?? `../../docs/04-测试数据/industry-chain-operational-report-${today}.json`,
  );

  const productWhere: any = { deletedAt: null, status: 'active' };
  if (storeId) productWhere.storeId = storeId;

  const [templates, adoptions, products, bomItems] = await Promise.all([
    prisma.industryProductTemplate.findMany({
      where: { deletedAt: null, status: 'published' },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, standardProductCode: true, name: true, category: true, productType: true },
    }),
    prisma.industryAdoptionRecord.findMany({
      where: {
        productTemplateId: { not: null },
        localProductId: { not: null },
        adoptionType: { in: ['product', 'product_mapping'] },
        ...(storeId ? { storeId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, storeId: true, productTemplateId: true, localProductId: true, adoptionType: true, createdAt: true },
    }),
    prisma.product.findMany({
      where: productWhere,
      include: {
        supplyMappings: {
          include: {
            industryProductTemplate: { select: { id: true, standardProductCode: true, name: true } },
            supplySku: {
              include: {
                supplier: { select: { id: true, name: true } },
                quotes: { orderBy: { updatedAt: 'desc' } },
              },
            },
          },
        },
      },
      orderBy: [{ currentStock: 'asc' }, { name: 'asc' }],
    }),
    prisma.projectBomItem.findMany({
      where: { project: storeId ? { storeId } : undefined },
      include: {
        project: { select: { id: true, name: true, storeId: true, status: true } },
        product: { select: { id: true, storeId: true, name: true, sku: true, currentStock: true, safetyStock: true, specUnit: true, packageUnit: true, deletedAt: true } },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const productById = new Map<number, any>(products.map((product: any) => [Number(product.id), product]));
  const validAdoptions = adoptions.filter((adoption: any) => {
    const product = productById.get(Number(adoption.localProductId));
    return product && !product.deletedAt && (!storeId || Number(product.storeId) === Number(storeId));
  });
  const adoptedTemplateIds = new Set(validAdoptions.map((adoption: any) => Number(adoption.productTemplateId)));
  const missingLocalSku = templates.filter((template: any) => !adoptedTemplateIds.has(Number(template.id)));

  const activeMappingsByProduct = new Map<number, any[]>();
  for (const product of products) {
    activeMappingsByProduct.set(
      Number(product.id),
      (product.supplyMappings ?? []).filter((mapping: any) => mapping.mappingStatus === 'active'),
    );
  }

  const productsMissingSupplyMapping = products.filter((product: any) => !(activeMappingsByProduct.get(Number(product.id)) ?? []).length);
  const bomProductsWithoutStock = bomItems
    .filter((item: any) => item.product && !item.product.deletedAt && numberValue(item.product.currentStock) <= 0)
    .map((item: any) => ({
      bomItemId: item.id,
      projectId: item.projectId,
      projectName: item.project?.name ?? '-',
      productId: item.productId,
      productName: item.product?.name ?? '-',
      sku: item.product?.sku ?? '-',
      currentStock: numberValue(item.product?.currentStock),
      standardQty: numberValue(item.standardQty),
      unit: item.unit ?? item.product?.specUnit ?? '-',
    }));

  const lowStockProducts = products.filter((product: any) => {
    const safetyStock = numberValue(product.safetyStock);
    return safetyStock > 0 && numberValue(product.currentStock) <= safetyStock;
  });
  const lowStockPlatformPurchasable = lowStockProducts
    .map((product: any) => {
      const mapping = (activeMappingsByProduct.get(Number(product.id)) ?? []).find((item) => availableQuotes(item).length);
      const quote = mapping ? availableQuotes(mapping)[0] : null;
      return { product, mapping, quote };
    })
    .filter((item) => item.mapping && item.quote);
  const lowStockManualOnly = lowStockProducts.filter((product: any) => {
    const mappings = activeMappingsByProduct.get(Number(product.id)) ?? [];
    return !mappings.some((mapping) => availableQuotes(mapping).length);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    storeId: storeId ?? null,
    summary: {
      publishedTemplates: templates.length,
      validAdoptions: validAdoptions.length,
      missingLocalSku: missingLocalSku.length,
      activeProducts: products.length,
      productsMissingSupplyMapping: productsMissingSupplyMapping.length,
      bomProductsWithoutStock: bomProductsWithoutStock.length,
      lowStockProducts: lowStockProducts.length,
      lowStockPlatformPurchasable: lowStockPlatformPurchasable.length,
      lowStockManualOnly: lowStockManualOnly.length,
    },
    missingLocalSku: missingLocalSku.map((item: any) => ({
      productTemplateId: item.id,
      standardProductCode: item.standardProductCode,
      name: item.name,
      category: item.category,
      nextAction: '在行业数据平台批量采用，或映射到已有本地产品。',
    })),
    productsMissingSupplyMapping: productsMissingSupplyMapping.map((product: any) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentStock: numberValue(product.currentStock),
      safetyStock: numberValue(product.safetyStock),
      nextAction: '在供应链映射页绑定已审核供应链 SKU 和有效报价。',
    })),
    bomProductsWithoutStock,
    lowStockPlatformPurchasable: lowStockPlatformPurchasable.map(({ product, mapping, quote }: any) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentStock: numberValue(product.currentStock),
      safetyStock: numberValue(product.safetyStock),
      mappingId: mapping.id,
      supplySkuId: mapping.supplySkuId,
      supplierName: mapping.supplySku?.supplier?.name ?? '-',
      quoteId: quote.id,
      price: numberValue(quote.price),
      moq: numberValue(quote.moq),
      leadDays: quote.leadDays ?? null,
      nextAction: '可从库存补货建议生成平台采购单。',
    })),
    lowStockManualOnly: lowStockManualOnly.map((product: any) => ({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentStock: numberValue(product.currentStock),
      safetyStock: numberValue(product.safetyStock),
      supplier: product.supplier ?? null,
      nextAction: (activeMappingsByProduct.get(Number(product.id)) ?? []).length
        ? '已有映射但缺可用报价，需补报价或改手工采购。'
        : '缺供应链映射，只能走手工采购或先申请映射。',
    })),
  };

  const markdown = [
    '# 行业标准品链路运营报表',
    '',
    `生成时间：${report.generatedAt}`,
    `门店范围：${storeId ?? '全部'}`,
    '',
    '## 1. 汇总',
    '',
    mdTable(
      ['问题', '数量', '产品/交付含义'],
      [
        ['已发布标准品', report.summary.publishedTemplates, '行业源头模板'],
        ['有效采用', report.summary.validAdoptions, '标准品已追溯到本地 SKU'],
        ['未生成本地 SKU 的标准品', report.summary.missingLocalSku, '还不能进入库存、BOM、采购、销售'],
        ['无供应链映射的本地产品', report.summary.productsMissingSupplyMapping, '低库存时无法直接平台采购'],
        ['BOM 耗材无库存', report.summary.bomProductsWithoutStock, '服务扣耗存在断货风险'],
        ['低库存产品', report.summary.lowStockProducts, '当前库存小于等于安全库存'],
        ['低库存且可平台采购', report.summary.lowStockPlatformPurchasable, '可从补货建议生成平台采购单'],
        ['低库存但只能手工采购', report.summary.lowStockManualOnly, '缺映射或缺可用报价'],
      ],
    ),
    '',
    '## 2. 哪些标准品还没有本地 SKU',
    '',
    mdTable(
      ['标准编码', '标准品', '分类', '建议动作'],
      report.missingLocalSku.slice(0, 30).map((item) => [item.standardProductCode, item.name, item.category, item.nextAction]),
    ),
    '',
    '## 3. 哪些本地产品没有供应链映射',
    '',
    mdTable(
      ['SKU', '产品', '当前库存', '安全库存', '建议动作'],
      report.productsMissingSupplyMapping.slice(0, 30).map((item) => [item.sku, item.name, item.currentStock, item.safetyStock, item.nextAction]),
    ),
    '',
    '## 4. 哪些 BOM 耗材没有库存',
    '',
    mdTable(
      ['项目', 'SKU', '耗材', '当前库存', '标准用量', '单位'],
      report.bomProductsWithoutStock.slice(0, 30).map((item) => [item.projectName, item.sku, item.productName, item.currentStock, item.standardQty, item.unit]),
    ),
    '',
    '## 5. 哪些低库存商品可以直接生成平台采购单',
    '',
    mdTable(
      ['SKU', '产品', '当前/安全', '供应商', '报价', 'MOQ', '交期', '建议动作'],
      report.lowStockPlatformPurchasable
        .slice(0, 30)
        .map((item) => [item.sku, item.name, `${item.currentStock}/${item.safetyStock}`, item.supplierName, item.price, item.moq, item.leadDays ?? '-', item.nextAction]),
    ),
    '',
    '## 6. 哪些采购建议只能手工采购',
    '',
    mdTable(
      ['SKU', '产品', '当前/安全', '供应商', '建议动作'],
      report.lowStockManualOnly
        .slice(0, 30)
        .map((item) => [item.sku, item.name, `${item.currentStock}/${item.safetyStock}`, item.supplier ?? '-', item.nextAction]),
    ),
    '',
    '说明：',
    '',
    '- 本报表只读，不修改标准品、本地产品、供应链映射、采购单或库存流水。',
    '- 报表口径对应阶段 7.3 的 Agent/报表问题，后续可直接作为 Agent 证据表输入。',
  ].join('\n');

  ensureDir(outMd);
  ensureDir(outJson);
  writeFileSync(outMd, markdown, 'utf8');
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`行业标准品链路运营报表生成完成：${outMd}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
