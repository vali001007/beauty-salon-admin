import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { inspectDatabaseTarget } from '../src/prisma/database-target-guard.js';
import { buildBrainMvpSeedPlan } from '../src/brain/seed/brain-mvp-seed-plan.js';

const target = inspectDatabaseTarget(process.env.DATABASE_URL, process.env);
if (target.mode !== 'local') throw new Error('local_slot_fixture:local_database_mode_required');

const slot = process.env.AMI_DEV_SLOT?.trim().toLowerCase();
const username = process.env.AMI_LOCAL_FIXTURE_USERNAME?.trim();
const password = process.env.AMI_LOCAL_FIXTURE_PASSWORD;
if (!slot || !username || !password) throw new Error('local_slot_fixture:runtime_identity_incomplete');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  }),
}) as any;

const FIXTURE_VERSION = 'local-slot-v1';
const storeName = `Ami 本地合成门店 ${slot}`;
const customerPhone = `138${String(Number(slot.slice(1))).padStart(2, '0')}000001`;
const beauticianPhone = `139${String(Number(slot.slice(1))).padStart(2, '0')}000001`;

async function findOrCreate(delegate: any, where: any, create: any, update: any = create) {
  const existing = await delegate.findFirst({ where });
  if (existing) return delegate.update({ where: { id: existing.id }, data: update });
  return delegate.create({ data: create });
}

async function seedBrain() {
  const plan = buildBrainMvpSeedPlan();
  for (const item of plan.ontologyEntities) {
    await prisma.brainOntologyEntity.upsert({
      where: { entityKey_version: { entityKey: item.entityKey, version: item.version } },
      update: item,
      create: item,
    });
  }
  for (const item of plan.ontologyRelations) {
    await prisma.brainOntologyRelation.upsert({
      where: { relationKey_version: { relationKey: item.relationKey, version: item.version } },
      update: item,
      create: item,
    });
  }
  for (const item of plan.metrics) {
    await prisma.brainMetric.upsert({
      where: { metricKey_version: { metricKey: item.metricKey, version: item.version } },
      update: item,
      create: item,
    });
  }
  for (const item of plan.dimensions) {
    await prisma.brainDimension.upsert({
      where: { dimensionKey_version: { dimensionKey: item.dimensionKey, version: item.version } },
      update: item,
      create: item,
    });
  }
  for (const item of plan.skills) {
    await prisma.brainSkillRegistry.upsert({
      where: { skillKey_version: { skillKey: item.skillKey, version: item.version } },
      update: item,
      create: item,
    });
  }
  for (const item of plan.agentProfiles) {
    await prisma.brainAgentProfile.upsert({
      where: { roleKey_version: { roleKey: item.roleKey, version: item.version } },
      update: item,
      create: item,
    });
  }
  for (const item of plan.inspectionRules) {
    await prisma.brainInspectionRule.upsert({
      where: { ruleKey_version: { ruleKey: item.ruleKey, version: item.version } },
      update: item,
      create: item,
    });
  }
  for (const item of plan.evalCases) {
    await prisma.brainEvalCase.upsert({ where: { caseKey: item.caseKey }, update: item, create: item });
  }
  return {
    ontologyEntities: plan.ontologyEntities.length,
    ontologyRelations: plan.ontologyRelations.length,
    metrics: plan.metrics.length,
    dimensions: plan.dimensions.length,
    skills: plan.skills.length,
    agentProfiles: plan.agentProfiles.length,
    inspectionRules: plan.inspectionRules.length,
    evalCases: plan.evalCases.length,
  };
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  const role = await prisma.role.upsert({
    where: { key: 'super_admin' },
    update: { name: '本地超级管理员', permissions: ['*'], status: 'active' },
    create: {
      key: 'super_admin',
      name: '本地超级管理员',
      description: `${FIXTURE_VERSION} synthetic fixture`,
      isSystem: true,
      permissions: ['*'],
      status: 'active',
    },
  });
  const store = await findOrCreate(
    prisma.store,
    { name: storeName, deletedAt: null },
    { name: storeName, city: '本地', address: `${FIXTURE_VERSION} / ${slot}`, phone: '000-0000', status: 'active' },
    { city: '本地', address: `${FIXTURE_VERSION} / ${slot}`, phone: '000-0000', status: 'active', deletedAt: null },
  );
  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, name: `本地管理员 ${slot}`, status: 'active', deletedAt: null },
    create: { username, passwordHash, name: `本地管理员 ${slot}`, status: 'active' },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: user.id, storeId: store.id } },
    update: {},
    create: { userId: user.id, storeId: store.id },
  });

  const level = await findOrCreate(
    prisma.beauticianLevel,
    { name: `${FIXTURE_VERSION}-顾问` },
    { name: `${FIXTURE_VERSION}-顾问`, description: '本地合成美容师等级', sortOrder: 1 },
  );
  const beautician = await findOrCreate(
    prisma.beautician,
    { storeId: store.id, phone: beauticianPhone },
    { storeId: store.id, userId: user.id, name: `本地美容师 ${slot}`, phone: beauticianPhone, levelId: level.id, status: 'active' },
    { userId: user.id, name: `本地美容师 ${slot}`, levelId: level.id, status: 'active' },
  );
  const customer = await findOrCreate(
    prisma.customer,
    { storeId: store.id, phone: customerPhone, deletedAt: null },
    {
      storeId: store.id,
      name: `本地顾客 ${slot}`,
      phone: customerPhone,
      gender: '女',
      memberLevel: '金卡会员',
      source: FIXTURE_VERSION,
      totalSpent: 1688,
      visitCount: 6,
      lastVisitDate: new Date('2026-08-03T02:00:00.000Z'),
      skinType: '混合偏干',
      tags: ['本地合成数据', slot],
      remark: `${FIXTURE_VERSION}，可重建且不含 Supabase 真实客户数据。`,
    },
    {
      name: `本地顾客 ${slot}`,
      memberLevel: '金卡会员',
      source: FIXTURE_VERSION,
      totalSpent: 1688,
      visitCount: 6,
      lastVisitDate: new Date('2026-08-03T02:00:00.000Z'),
      skinType: '混合偏干',
      tags: ['本地合成数据', slot],
      remark: `${FIXTURE_VERSION}，可重建且不含 Supabase 真实客户数据。`,
      deletedAt: null,
    },
  );

  const category = await findOrCreate(prisma.category, { name: `${FIXTURE_VERSION}-护理耗材` }, { name: `${FIXTURE_VERSION}-护理耗材` });
  const product = await prisma.product.upsert({
    where: { storeId_sku: { storeId: store.id, sku: `LOCAL-${slot}-MASK` } },
    update: { name: '本地舒缓面膜', currentStock: 50, safetyStock: 10, status: 'active', deletedAt: null },
    create: {
      storeId: store.id,
      categoryId: category.id,
      sku: `LOCAL-${slot}-MASK`,
      name: '本地舒缓面膜',
      brand: 'Ami Local',
      spec: '6片/盒',
      unit: '盒',
      costPrice: 60,
      retailPrice: 128,
      currentStock: 50,
      safetyStock: 10,
      status: 'active',
    },
  });
  await findOrCreate(
    prisma.stockBatch,
    { productId: product.id, batchNo: `${FIXTURE_VERSION}-${slot}` },
    {
      productId: product.id,
      batchNo: `${FIXTURE_VERSION}-${slot}`,
      stock: 50,
      unitCost: 60,
      productionDate: new Date('2026-07-01T00:00:00.000Z'),
      expiryDate: new Date('2027-07-01T00:00:00.000Z'),
    },
    { stock: 50, unitCost: 60, expiryDate: new Date('2027-07-01T00:00:00.000Z') },
  );
  const projectType = await findOrCreate(
    prisma.projectType,
    { name: `${FIXTURE_VERSION}-面部护理` },
    { name: `${FIXTURE_VERSION}-面部护理`, description: '本地合成项目分类', status: 'active' },
  );
  const project = await findOrCreate(
    prisma.project,
    { storeId: store.id, name: '本地深层补水护理', deletedAt: null },
    {
      storeId: store.id,
      typeId: projectType.id,
      name: '本地深层补水护理',
      description: `${FIXTURE_VERSION} synthetic project`,
      price: 298,
      duration: 60,
      status: 'active',
    },
    { typeId: projectType.id, price: 298, duration: 60, status: 'active', deletedAt: null },
  );
  const bom = await prisma.projectBomItem.findFirst({ where: { projectId: project.id, productId: product.id } });
  if (bom) await prisma.projectBomItem.update({ where: { id: bom.id }, data: { standardQty: 1, unit: '盒' } });
  else await prisma.projectBomItem.create({ data: { projectId: project.id, productId: product.id, standardQty: 1, unit: '盒' } });

  const card = await findOrCreate(
    prisma.card,
    { storeId: store.id, name: '本地补水护理 10 次卡' },
    {
      storeId: store.id,
      name: '本地补水护理 10 次卡',
      description: `${FIXTURE_VERSION} synthetic card`,
      totalTimes: 10,
      price: 2680,
      projects: [{ projectId: project.id, projectName: project.name, timesPerCard: 10 }],
      status: 'active',
    },
    { projects: [{ projectId: project.id, projectName: project.name, timesPerCard: 10 }], status: 'active' },
  );
  const customerCard = await prisma.customerCard.findFirst({ where: { customerId: customer.id, cardId: card.id } });
  if (customerCard) {
    await prisma.customerCard.update({
      where: { id: customerCard.id },
      data: { cardName: card.name, totalTimes: 10, remainingTimes: 8, expiryDate: new Date('2027-08-04T00:00:00.000Z'), status: 'active' },
    });
  } else {
    await prisma.customerCard.create({
      data: {
        customerId: customer.id,
        cardId: card.id,
        operatorId: user.id,
        cardName: card.name,
        totalTimes: 10,
        remainingTimes: 8,
        paidAmount: 2680,
        recognizedUnitValue: 268,
        expiryDate: new Date('2027-08-04T00:00:00.000Z'),
        status: 'active',
        activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });
  }

  await prisma.reservation.upsert({
    where: { idempotencyKey: `${FIXTURE_VERSION}:${slot}:reservation` },
    update: { storeId: store.id, customerId: customer.id, projectId: project.id, beauticianId: beautician.id, status: 'confirmed' },
    create: {
      idempotencyKey: `${FIXTURE_VERSION}:${slot}:reservation`,
      creationFingerprint: 'a'.repeat(64),
      storeId: store.id,
      customerId: customer.id,
      projectId: project.id,
      beauticianId: beautician.id,
      createdById: user.id,
      date: new Date('2026-08-05T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:00',
      status: 'confirmed',
      bookingSource: FIXTURE_VERSION,
      remark: '本地合成预约',
    },
  });
  await prisma.productOrder.upsert({
    where: { orderNo: `LOCAL-${slot}-ORDER-001` },
    update: { customerId: customer.id, customerName: customer.name, storeId: store.id, totalAmount: 128, netAmount: 128, status: 'completed' },
    create: {
      orderNo: `LOCAL-${slot}-ORDER-001`,
      orderKind: 'product',
      customerId: customer.id,
      customerName: customer.name,
      storeId: store.id,
      totalAmount: 128,
      listAmount: 128,
      netAmount: 128,
      status: 'completed',
      payMethod: 'local-fixture',
      source: FIXTURE_VERSION,
      items: [{ productId: product.id, name: product.name, quantity: 1, unitPrice: 128 }],
      remark: '本地合成订单',
    },
  });

  const brain = await seedBrain();
  const counts = {
    stores: await prisma.store.count({ where: { name: storeName, deletedAt: null } }),
    users: await prisma.user.count({ where: { username, deletedAt: null } }),
    customers: await prisma.customer.count({ where: { storeId: store.id, source: FIXTURE_VERSION, deletedAt: null } }),
    projects: await prisma.project.count({ where: { storeId: store.id, description: { contains: FIXTURE_VERSION }, deletedAt: null } }),
    cards: await prisma.card.count({ where: { storeId: store.id, description: { contains: FIXTURE_VERSION } } }),
    products: await prisma.product.count({ where: { storeId: store.id, sku: { startsWith: `LOCAL-${slot}-` }, deletedAt: null } }),
    reservations: await prisma.reservation.count({ where: { idempotencyKey: `${FIXTURE_VERSION}:${slot}:reservation` } }),
    orders: await prisma.productOrder.count({ where: { orderNo: `LOCAL-${slot}-ORDER-001` } }),
  };
  console.log(JSON.stringify({ status: 'seeded', fixture: FIXTURE_VERSION, slot, database: target.database, login: { username }, counts, brain }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ status: 'failed', message: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
