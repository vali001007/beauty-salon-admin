import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const verifyOnly = process.argv.includes('--verify-only') || process.argv.includes('--verify');
const dryRun = !verifyOnly && (!apply || !confirmed || process.argv.includes('--dry-run'));

const getArg = (name: string) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const requestedStoreId = Number(getArg('store-id') ?? 0);
const requestedStoreName = getArg('store-name') || 'Ami 全量演示门店';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

const serviceCodes = [
  'SVC-FACE-SERUM-INFUSION',
  'SVC-BODY-ESSENTIAL-OIL-SPA',
  'SVC-SCALP-SOOTHING-CARE',
  'SVC-HAND-SOFTENING-CARE',
  'SVC-FACE-HYDRATING-BASIC',
  'SVC-FACE-SENSITIVE-REPAIR',
  'SVC-BODY-SHOULDER-NECK',
  'SVC-EYE-FIRMING-CARE',
  'SVC-FACE-POSTSUN-SOOTHING',
  'SVC-FACE-COLLAGEN-LIFT',
  'SVC-FACE-SEASONAL-BARRIER',
  'SVC-FACE-BUBBLE-CLEAN',
  'SVC-FACE-FIRMING-ANTIAGING',
  'SVC-FACE-SPOT-BRIGHTENING',
  'SVC-FACE-OXYGEN-RENEW',
];

type SyncReportItem = {
  code: string;
  templateName: string;
  action: 'create_project' | 'update_project';
  projectId?: number;
  projectName: string;
  oldBomCount: number;
  newBomCount: number;
  createdProducts: number;
  reusedProducts: number;
  skipped?: string;
};

async function resolveStore() {
  const store = requestedStoreId > 0
    ? await prisma.store.findFirst({ where: { id: requestedStoreId, deletedAt: null } })
    : await prisma.store.findFirst({ where: { name: requestedStoreName, deletedAt: null } });
  if (!store) {
    throw new Error(`未找到目标门店：${requestedStoreId > 0 ? requestedStoreId : requestedStoreName}`);
  }
  return store;
}

async function findOrCreateProjectType(tx: any, name: string) {
  const existing = await tx.projectType.findFirst({ where: { name } });
  if (existing) return existing;
  return tx.projectType.create({ data: { name, status: 'active' } });
}

async function findOrCreateCategoryId(tx: any, name: string) {
  const existing = await tx.category.findFirst({ where: { name } });
  if (existing) return existing.id;
  const category = await tx.category.create({ data: { name } });
  return category.id;
}

async function resolveProduct(tx: any, storeId: number, template: any) {
  const sku = `IND-${storeId}-${template.standardProductCode}`;
  const existingBySku = await tx.product.findFirst({ where: { sku, storeId, deletedAt: null } });
  if (existingBySku) return { product: existingBySku, created: false };

  const existingByName = await tx.product.findFirst({
    where: {
      storeId,
      name: template.name,
      deletedAt: null,
    },
  });
  if (existingByName) return { product: existingByName, created: false };

  const product = await tx.product.create({
    data: {
      storeId,
      categoryId: await findOrCreateCategoryId(tx, template.category),
      sku,
      name: template.name,
      spec: template.recommendedSpec,
      unit: template.unit || '件',
      costPrice: Number(template.referenceCostMax ?? template.referenceCostMin ?? 0),
      retailPrice: Number(template.referenceRetailPriceMax ?? template.referenceRetailPriceMin ?? 0),
      currentStock: 0,
      safetyStock: 0,
      status: 'active',
    },
  });
  return { product, created: true };
}

function averagePrice(template: any) {
  const min = Number(template.referencePriceMin ?? 0);
  const max = Number(template.referencePriceMax ?? min);
  return Number(((min + max) / 2).toFixed(2));
}

async function loadTemplates() {
  return prisma.industryServiceTemplate.findMany({
    where: { code: { in: serviceCodes }, status: 'published', deletedAt: null },
    include: {
      bomTemplates: {
        where: { status: 'published', deletedAt: null },
        orderBy: { version: 'desc' },
        take: 1,
        include: {
          items: {
            include: { productTemplate: true },
            orderBy: { id: 'asc' },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  });
}

async function buildReport() {
  const store = await resolveStore();
  const templates = await loadTemplates();
  const projects = await prisma.project.findMany({
    where: { storeId: store.id, deletedAt: null },
    include: { bomItems: true },
  });
  const projectByName = new Map(projects.map((project: any) => [String(project.name), project]));

  const items: SyncReportItem[] = templates.map((template: any) => {
    const existingProject = projectByName.get(template.name);
    return {
      code: template.code,
      templateName: template.name,
      action: existingProject ? 'update_project' : 'create_project',
      projectId: existingProject?.id,
      projectName: template.name,
      oldBomCount: existingProject?.bomItems?.length ?? 0,
      newBomCount: template.bomTemplates?.[0]?.items?.length ?? 0,
      createdProducts: 0,
      reusedProducts: template.bomTemplates?.[0]?.items?.length ?? 0,
      skipped: template.bomTemplates?.[0]?.items?.length ? undefined : 'missing_published_bom',
    };
  });

  return {
    mode: dryRun ? 'dry-run' : verifyOnly ? 'verify-only' : 'apply',
    store: { id: store.id, name: store.name },
    templates: templates.length,
    projectsToCreate: items.filter((item) => item.action === 'create_project').length,
    projectsToUpdate: items.filter((item) => item.action === 'update_project').length,
    bomItemsToWrite: items.reduce((sum, item) => sum + item.newBomCount, 0),
    items,
  };
}

async function applySync() {
  const store = await resolveStore();
  const templates = await loadTemplates();
  const reports: SyncReportItem[] = [];

  for (const template of templates) {
    const bomTemplate = template.bomTemplates?.[0];
    if (!bomTemplate?.items?.length) {
      reports.push({
        code: template.code,
        templateName: template.name,
        action: 'update_project',
        projectName: template.name,
        oldBomCount: 0,
        newBomCount: 0,
        createdProducts: 0,
        reusedProducts: 0,
        skipped: 'missing_published_bom',
      });
      continue;
    }

    const report = await prisma.$transaction(async (tx: any) => {
      const existingProject = await tx.project.findFirst({
        where: { storeId: store.id, name: template.name, deletedAt: null },
        include: { bomItems: true },
      });
      const projectType = await findOrCreateProjectType(tx, template.category);
      const project = existingProject
        ? await tx.project.update({
            where: { id: existingProject.id },
            data: {
              typeId: projectType.id,
              price: averagePrice(template),
              duration: template.recommendedDurationMax ?? template.recommendedDurationMin ?? 60,
              status: 'active',
              online: true,
              description: [
                template.subCategory ? `细分类目：${template.subCategory}` : '',
                template.recommendedFrequency ? `建议频次：${template.recommendedFrequency}` : '',
              ].filter(Boolean).join('\n') || undefined,
            },
          })
        : await tx.project.create({
            data: {
              storeId: store.id,
              typeId: projectType.id,
              name: template.name,
              price: averagePrice(template),
              duration: template.recommendedDurationMax ?? template.recommendedDurationMin ?? 60,
              status: 'active',
              online: true,
              recommend: false,
              home: false,
              description: [
                template.subCategory ? `细分类目：${template.subCategory}` : '',
                template.recommendedFrequency ? `建议频次：${template.recommendedFrequency}` : '',
              ].filter(Boolean).join('\n') || undefined,
            },
          });

      await tx.projectBomItem.deleteMany({ where: { projectId: project.id } });
      let createdProducts = 0;
      let reusedProducts = 0;
      const bomItemIds: number[] = [];
      for (const item of bomTemplate.items) {
        const resolved = await resolveProduct(tx, store.id, item.productTemplate);
        if (resolved.created) createdProducts += 1;
        else reusedProducts += 1;
        const bomItem = await tx.projectBomItem.create({
          data: {
            projectId: project.id,
            productId: resolved.product.id,
            standardQty: Number(item.standardQty ?? 0),
            unit: item.unit || resolved.product.unit || '件',
          },
        });
        bomItemIds.push(bomItem.id);
      }

      await tx.industryAdoptionRecord.create({
        data: {
          storeId: store.id,
          adoptionType: 'industry_bom_sync',
          serviceTemplateId: template.id,
          templateVersion: template.version,
          localProjectId: project.id,
          localBomItemIds: bomItemIds,
          payload: {
            source: 'sync_industry_bom_to_core',
            serviceTemplateCode: template.code,
            bomTemplateId: bomTemplate.id,
            replacedOldBomCount: existingProject?.bomItems?.length ?? 0,
            writtenBomItemCount: bomItemIds.length,
          },
        },
      });

      return {
        code: template.code,
        templateName: template.name,
        action: existingProject ? 'update_project' : 'create_project',
        projectId: project.id,
        projectName: project.name,
        oldBomCount: existingProject?.bomItems?.length ?? 0,
        newBomCount: bomItemIds.length,
        createdProducts,
        reusedProducts,
      } as SyncReportItem;
    });

    reports.push(report);
  }

  return {
    mode: 'apply',
    store: { id: store.id, name: store.name },
    templates: templates.length,
    projectsCreated: reports.filter((item) => item.action === 'create_project').length,
    projectsUpdated: reports.filter((item) => item.action === 'update_project').length,
    bomItemsWritten: reports.reduce((sum, item) => sum + item.newBomCount, 0),
    productsCreated: reports.reduce((sum, item) => sum + item.createdProducts, 0),
    productsReused: reports.reduce((sum, item) => sum + item.reusedProducts, 0),
    items: reports,
  };
}

async function verifySync() {
  const store = await resolveStore();
  const templates = await loadTemplates();
  const projectNames = templates.map((template: any) => template.name);
  const projects = await prisma.project.findMany({
    where: { storeId: store.id, name: { in: projectNames }, deletedAt: null },
    include: { bomItems: { include: { product: true } } },
    orderBy: { name: 'asc' },
  });
  const projectByName = new Map(projects.map((project: any) => [project.name, project]));
  const items = templates.map((template: any) => {
    const expectedBomCount = template.bomTemplates?.[0]?.items?.length ?? 0;
    const project = projectByName.get(template.name);
    return {
      code: template.code,
      projectName: template.name,
      projectId: project?.id,
      expectedBomCount,
      actualBomCount: project?.bomItems?.length ?? 0,
      complete: Boolean(project && project.bomItems?.length === expectedBomCount),
    };
  });
  return {
    mode: 'verify-only',
    store: { id: store.id, name: store.name },
    templates: templates.length,
    complete: items.every((item) => item.complete),
    items,
  };
}

async function main() {
  if (verifyOnly) {
    console.log(JSON.stringify(await verifySync(), null, 2));
    return;
  }
  if (dryRun) {
    const report = await buildReport();
    console.log(JSON.stringify(report, null, 2));
    if (apply && !confirmed) console.log('写库需显式传入 --apply --yes。');
    return;
  }
  console.log(JSON.stringify(await applySync(), null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
