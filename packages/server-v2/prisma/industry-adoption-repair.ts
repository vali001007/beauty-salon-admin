import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 1),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const dryRun = !apply || !confirmed || process.argv.includes('--dry-run');

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseSpec(spec?: string | null, fallbackUnit?: string | null) {
  const raw = String(spec ?? '').trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([^\d\s/盒瓶支片包]+)?/u);
  return {
    specQuantity: match ? Number(match[1]) : 1,
    specUnit: match?.[2] || fallbackUnit || '件',
  };
}

async function loadBrokenAdoptions() {
  const requestedAdoptionId = Number(getArg('adoption-id') ?? 0);
  const requestedStoreId = Number(getArg('store-id') ?? 0);
  const where: any = {
    productTemplateId: { not: null },
    localProductId: { not: null },
  };
  if (Number.isInteger(requestedAdoptionId) && requestedAdoptionId > 0) where.id = requestedAdoptionId;
  if (Number.isInteger(requestedStoreId) && requestedStoreId > 0) where.storeId = requestedStoreId;

  const adoptions = await prisma.industryAdoptionRecord.findMany({
    where,
    orderBy: { id: 'asc' },
  });
  const productIds = [...new Set(adoptions.map((item: any) => item.localProductId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, storeId: true, sku: true, name: true, deletedAt: true },
  });
  const productById = new Map(products.map((product: any) => [product.id, product]));
  return adoptions.filter((adoption: any) => {
    const product = productById.get(adoption.localProductId);
    return !product || product.deletedAt || (adoption.storeId && product.storeId !== adoption.storeId);
  });
}

async function findRebindCandidate(adoption: any, template: any) {
  const storeId = adoption.storeId;
  if (!storeId || !template) return null;
  const skuCandidates = [
    `IND-${storeId}-${template.standardProductCode}`,
    String(template.standardProductCode ?? ''),
  ].filter(Boolean);

  return prisma.product.findFirst({
    where: {
      storeId,
      deletedAt: null,
      OR: [
        { sku: { in: skuCandidates } },
        { sku: { contains: String(template.standardProductCode ?? '') } },
        { name: template.name },
      ],
    },
    orderBy: { id: 'asc' },
  });
}

async function ensureCategoryId(tx: any, name: string) {
  const existing = await tx.category.findFirst({ where: { name } });
  if (existing) return existing.id;
  const category = await tx.category.create({ data: { name } });
  return category.id;
}

async function createProductFromTemplate(tx: any, adoption: any, template: any) {
  if (!adoption.storeId) throw new Error(`采用记录 ${adoption.id} 缺少 storeId，不能重新采用`);
  const { specQuantity, specUnit } = parseSpec(template.recommendedSpec, template.unit);
  const sku = `IND-${adoption.storeId}-${template.standardProductCode}`;
  return tx.product.create({
    data: {
      storeId: adoption.storeId,
      categoryId: await ensureCategoryId(tx, template.category),
      sku,
      name: template.name,
      brand: null,
      spec: template.recommendedSpec,
      unit: template.packageUnit || '件',
      specQuantity,
      specUnit,
      packageUnit: template.packageUnit || '件',
      costPrice: toNumber(template.referenceCostMax ?? template.referenceCostMin),
      retailPrice: toNumber(template.referenceRetailPriceMax ?? template.referenceRetailPriceMin),
      currentStock: 0,
      safetyStock: 0,
      supplier: null,
      minPurchaseQty: 0,
      status: 'active',
    },
  });
}

function mergePayload(payload: unknown, patch: Record<string, unknown>) {
  const base = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return {
    ...base,
    ...patch,
    repairedAt: new Date().toISOString(),
  };
}

async function main() {
  const strategy = getArg('strategy') ?? 'mark-invalid';
  if (!['auto-rebind', 're-adopt', 'mark-invalid'].includes(strategy)) {
    throw new Error('strategy 只支持 auto-rebind、re-adopt、mark-invalid');
  }
  if (!dryRun && strategy !== 'mark-invalid') {
    console.log('注意：当前将写入真实数据库。apply 模式已通过 --apply --yes 显式确认。');
  }

  const brokenAdoptions = await loadBrokenAdoptions();
  const templateIds = [...new Set(brokenAdoptions.map((item: any) => item.productTemplateId).filter(Boolean))];
  const templates = await prisma.industryProductTemplate.findMany({ where: { id: { in: templateIds } } });
  const templateById = new Map(templates.map((template: any) => [template.id, template]));

  const actions: any[] = [];

  for (const adoption of brokenAdoptions) {
    const template = templateById.get(adoption.productTemplateId);
    if (!template) {
      actions.push({ adoptionId: adoption.id, action: 'skip', reason: 'missing_template' });
      continue;
    }

    if (strategy === 'auto-rebind') {
      const candidate = await findRebindCandidate(adoption, template);
      if (!candidate) {
        actions.push({ adoptionId: adoption.id, action: 'skip', reason: 'no_rebind_candidate' });
        continue;
      }
      actions.push({
        adoptionId: adoption.id,
        action: 'rebind',
        fromProductId: adoption.localProductId,
        toProductId: candidate.id,
        productSku: candidate.sku,
      });
      if (!dryRun) {
        await prisma.industryAdoptionRecord.update({
          where: { id: adoption.id },
          data: {
            localProductId: candidate.id,
            payload: mergePayload(adoption.payload, {
              chainStatus: 'repaired',
              repairStrategy: strategy,
              oldLocalProductId: adoption.localProductId,
              newLocalProductId: candidate.id,
            }),
          },
        });
      }
      continue;
    }

    if (strategy === 're-adopt') {
      const plannedSku = `IND-${adoption.storeId}-${template.standardProductCode}`;
      actions.push({
        adoptionId: adoption.id,
        action: 'create_product_and_rebind',
        fromProductId: adoption.localProductId,
        plannedSku,
      });
      if (!dryRun) {
        await prisma.$transaction(async (tx: any) => {
          const product = await createProductFromTemplate(tx, adoption, template);
          await tx.industryAdoptionRecord.update({
            where: { id: adoption.id },
            data: {
              localProductId: product.id,
              payload: mergePayload(adoption.payload, {
                chainStatus: 'repaired',
                repairStrategy: strategy,
                oldLocalProductId: adoption.localProductId,
                newLocalProductId: product.id,
              }),
            },
          });
        });
      }
      continue;
    }

    actions.push({
      adoptionId: adoption.id,
      action: 'mark_invalid',
      localProductId: adoption.localProductId,
    });
    if (!dryRun) {
      await prisma.industryAdoptionRecord.update({
        where: { id: adoption.id },
        data: {
          localProductId: null,
          payload: mergePayload(adoption.payload, {
            chainStatus: 'invalid',
            invalidReason: 'local_product_missing_or_deleted_or_store_mismatch',
            repairStrategy: strategy,
            oldLocalProductId: adoption.localProductId,
          }),
        },
      });
    }
  }

  console.log(JSON.stringify(
    {
      mode: dryRun ? 'dry-run' : 'apply',
      strategy,
      brokenAdoptions: brokenAdoptions.length,
      actions,
    },
    null,
    2,
  ));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
