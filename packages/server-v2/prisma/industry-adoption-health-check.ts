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

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function toIso(value?: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
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

type AdoptionIssue = {
  adoptionId: number;
  storeId: number | null;
  adoptionType: string;
  productTemplateId: number | null;
  standardProductCode: string | null;
  templateName: string | null;
  localProductId: number | null;
  productName: string | null;
  productSku: string | null;
  issueCodes: string[];
  issueLabels: string[];
  createdAt: string | null;
};

async function main() {
  const requestedStoreId = Number(getArg('store-id') ?? 0);
  const outJson = resolve(
    process.cwd(),
    getArg('out-json') ?? `../../docs/04-测试数据/industry-adoption-health-${today}.json`,
  );
  const outMd = resolve(
    process.cwd(),
    getArg('out-md') ?? `../../docs/04-测试数据/industry-adoption-health-${today}.md`,
  );

  const adoptionWhere: any = {
    productTemplateId: { not: null },
    localProductId: { not: null },
  };
  if (Number.isInteger(requestedStoreId) && requestedStoreId > 0) {
    adoptionWhere.storeId = requestedStoreId;
  }

  const adoptions = await prisma.industryAdoptionRecord.findMany({
    where: adoptionWhere,
    orderBy: { id: 'asc' },
  });
  const productIds = [...new Set(adoptions.map((item: any) => item.localProductId).filter(Boolean))];
  const templateIds = [...new Set(adoptions.map((item: any) => item.productTemplateId).filter(Boolean))];

  const [products, templates] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        storeId: true,
        sku: true,
        name: true,
        specQuantity: true,
        specUnit: true,
        packageUnit: true,
        deletedAt: true,
      },
    }),
    prisma.industryProductTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        standardProductCode: true,
        name: true,
        status: true,
        deletedAt: true,
      },
    }),
  ]);

  const productById = new Map(products.map((product: any) => [product.id, product]));
  const templateById = new Map(templates.map((template: any) => [template.id, template]));

  const issues: AdoptionIssue[] = [];
  let validActive = 0;
  let missingProduct = 0;
  let deletedProduct = 0;
  let missingSpecFields = 0;
  let storeMismatch = 0;
  let missingTemplate = 0;
  let deletedTemplate = 0;

  for (const adoption of adoptions) {
    const product = productById.get(adoption.localProductId);
    const template = templateById.get(adoption.productTemplateId);
    const issueCodes: string[] = [];
    const issueLabels: string[] = [];

    if (!template) {
      missingTemplate += 1;
      issueCodes.push('missing_template');
      issueLabels.push('标准品模板不存在');
    } else if (template.deletedAt) {
      deletedTemplate += 1;
      issueCodes.push('deleted_template');
      issueLabels.push('标准品模板已删除');
    }

    if (!product) {
      missingProduct += 1;
      issueCodes.push('missing_product');
      issueLabels.push('本地商品不存在');
    } else {
      if (product.deletedAt) {
        deletedProduct += 1;
        issueCodes.push('deleted_product');
        issueLabels.push('本地商品已软删除');
      }
      if (
        product.specQuantity === null ||
        product.specQuantity === undefined ||
        !product.specUnit ||
        !product.packageUnit
      ) {
        missingSpecFields += 1;
        issueCodes.push('missing_spec_fields');
        issueLabels.push('规格数量/规格单位/包装缺失');
      }
      if (adoption.storeId && product.storeId !== adoption.storeId) {
        storeMismatch += 1;
        issueCodes.push('store_mismatch');
        issueLabels.push('采用记录门店与商品门店不一致');
      }
    }

    if (issueCodes.length === 0) {
      validActive += 1;
      continue;
    }

    issues.push({
      adoptionId: adoption.id,
      storeId: adoption.storeId ?? null,
      adoptionType: adoption.adoptionType,
      productTemplateId: adoption.productTemplateId ?? null,
      standardProductCode: template?.standardProductCode ?? null,
      templateName: template?.name ?? null,
      localProductId: adoption.localProductId ?? null,
      productName: product?.name ?? null,
      productSku: product?.sku ?? null,
      issueCodes,
      issueLabels,
      createdAt: toIso(adoption.createdAt),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      storeId: Number.isInteger(requestedStoreId) && requestedStoreId > 0 ? requestedStoreId : null,
      adoptionWhere,
    },
    summary: {
      totalAdoptions: adoptions.length,
      validActive,
      invalid: issues.length,
      missingProduct,
      deletedProduct,
      missingSpecFields,
      storeMismatch,
      missingTemplate,
      deletedTemplate,
    },
    issues,
  };

  const markdown = [
    `# 行业标准品采用记录健康巡检`,
    ``,
    `生成时间：${report.generatedAt}`,
    ``,
    `## 摘要`,
    ``,
    mdTable(
      ['指标', '数量'],
      [
        ['采用记录总数', report.summary.totalAdoptions],
        ['有效采用记录', report.summary.validActive],
        ['异常采用记录', report.summary.invalid],
        ['本地商品不存在', report.summary.missingProduct],
        ['本地商品已软删除', report.summary.deletedProduct],
        ['规格字段缺失', report.summary.missingSpecFields],
        ['门店不一致', report.summary.storeMismatch],
        ['标准模板不存在', report.summary.missingTemplate],
        ['标准模板已删除', report.summary.deletedTemplate],
      ],
    ),
    ``,
    `## 异常明细`,
    ``,
    issues.length
      ? mdTable(
          ['采用ID', '门店ID', '标准品', '本地商品ID', '本地商品', 'SKU', '问题'],
          issues.map((issue) => [
            issue.adoptionId,
            issue.storeId ?? '-',
            issue.templateName ?? issue.standardProductCode ?? '-',
            issue.localProductId ?? '-',
            issue.productName ?? '-',
            issue.productSku ?? '-',
            issue.issueLabels.join('；'),
          ]),
        )
      : '未发现异常采用记录。',
    ``,
    `## 交付影响`,
    ``,
    issues.length
      ? `仍有 ${issues.length} 条采用记录会影响产品来源追溯、批量映射和采购建议判断。建议先运行修复工具 dry-run，确认策略后再 apply。`
      : `采用记录与本地商品关系健康，可以进入产品详情来源与供应链映射状态开发。`,
  ].join('\n');

  ensureDir(outJson);
  ensureDir(outMd);
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, markdown, 'utf8');

  console.log(`行业标准品采用记录健康巡检完成：${report.summary.validActive}/${report.summary.totalAdoptions} 有效`);
  console.log(`JSON: ${outJson}`);
  console.log(`Markdown: ${outMd}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
