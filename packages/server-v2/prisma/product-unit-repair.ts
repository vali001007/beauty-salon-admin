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

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function unitEqual(left: unknown, right: unknown) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function ensureOutput(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  if (!rows.length) return '暂无。';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

function idSet(value?: string) {
  if (!value) return undefined;
  const ids = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
  return ids.length ? new Set(ids) : undefined;
}

function numberArg(name: string) {
  const value = Number(argValue(name) ?? 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function main() {
  const apply = hasFlag('apply');
  const yes = hasFlag('yes');
  if (apply && !yes) {
    throw new Error('真实写库需要同时传入 --apply --yes。默认 dry-run 只生成预览报告。');
  }

  const onlyBomItemIds = idSet(argValue('only-bom-item-ids'));
  const storeId = numberArg('store-id') ?? numberArg('storeId');
  const outMd = resolve(process.cwd(), argValue('out-md') ?? `../../docs/04-测试数据/product-unit-repair-preview-${today}.md`);
  const outJson = resolve(process.cwd(), argValue('out-json') ?? `../../docs/04-测试数据/product-unit-repair-preview-${today}.json`);

  const allBomItems = await prisma.projectBomItem.findMany({
    where: onlyBomItemIds ? { id: { in: [...onlyBomItemIds] } } : undefined,
    include: {
      project: { select: { id: true, name: true, storeId: true, deletedAt: true } },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          specUnit: true,
          packageUnit: true,
          currentStock: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  const bomItems = storeId ? allBomItems.filter((item: any) => item.project?.storeId === storeId) : allBomItems;

  const repairItems = bomItems
    .filter((item: any) => {
      if (!item.project || item.project.deletedAt) return false;
      if (!item.product || item.product.deletedAt) return false;
      if (!text(item.unit) || !text(item.product.specUnit)) return false;
      return !unitEqual(item.unit, item.product.specUnit);
    })
    .map((item: any) => ({
      bomItemId: item.id,
      projectId: item.project?.id ?? '',
      projectName: item.project?.name ?? '',
      productId: item.productId,
      productName: item.product?.name ?? '',
      sku: item.product?.sku ?? '',
      currentUnit: item.unit ?? '',
      targetUnit: item.product?.specUnit ?? '',
      packageUnit: item.product?.packageUnit ?? '',
      standardQty: numberValue(item.standardQty),
      currentStock: numberValue(item.product?.currentStock),
      action: 'update_bom_unit_to_spec_unit',
    }));

  let appliedCount = 0;
  if (apply) {
    for (const item of repairItems) {
      await prisma.projectBomItem.update({
        where: { id: item.bomItemId },
        data: { unit: item.targetUnit },
      });
      appliedCount += 1;
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    scope: {
      storeId,
      onlyBomItemIds: onlyBomItemIds ? [...onlyBomItemIds] : [],
      note: '仅修复服务 BOM 单位到产品规格单位，不修改历史库存流水、订单明细或库存主数量。',
    },
    totals: {
      checkedBomItems: bomItems.length,
      repairableBomItems: repairItems.length,
      appliedBomItems: appliedCount,
    },
    repairItems,
  };

  const md = `# 产品单位修复${apply ? '执行' : '预览'}报告

生成时间：${result.generatedAt}

模式：${result.mode}

## 1. 汇总

${table(
  ['检查项', '数量'],
  [
    ['检查 BOM 明细', result.totals.checkedBomItems],
    ['可修复 BOM 单位异常', result.totals.repairableBomItems],
    ['已执行修复', result.totals.appliedBomItems],
  ],
)}

## 2. 修复范围

- 只处理服务 BOM 明细单位与产品规格单位不一致的问题。
- 如传入 \`--store-id\`，只处理该门店项目下的 BOM 明细。
- 目标值取产品 \`specUnit\`，用于服务扣耗口径。
- 不修改历史库存流水、订单明细、库存主数量和包装字段。
- 如需真实写库，必须使用 \`--apply --yes\`。

## 3. BOM 单位修复明细

${table(
  ['BOM项ID', '项目', '产品', 'SKU', '当前单位', '目标单位', '包装', '标准用量', '当前库存', '动作'],
  repairItems.map((item) => [
    item.bomItemId,
    item.projectName,
    item.productName,
    item.sku,
    item.currentUnit,
    item.targetUnit,
    item.packageUnit,
    item.standardQty,
    item.currentStock,
    apply ? '已修复' : '待修复',
  ]),
)}
`;

  ensureOutput(outMd);
  ensureOutput(outJson);
  writeFileSync(outMd, md, 'utf8');
  writeFileSync(outJson, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
