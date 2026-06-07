import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { readSeedPassword } from './seed-env.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

type RawCustomer = {
  id: number;
  name: string;
  storeName?: string;
  email?: string;
  phone?: string;
  landline?: string;
  wechat?: string;
  gender?: string;
  maritalStatus?: string;
  birthday?: string;
  age?: number;
  height?: number;
  weight?: number;
  occupation?: string;
  workplace?: string;
  address?: string;
  hasAllergy?: string;
  hasSurgery?: string;
  skinCondition?: string;
  totalSpent?: number;
  visitCount?: number;
  memberLevel?: string;
  source?: string;
  lastVisitDate?: string;
  tags?: string[];
  createdAt?: string;
  remark?: string;
};

type RawConsumptionRecord = {
  id: number;
  customerId: number;
  consumeType: string;
  consumeContent: string;
  payMethod?: string;
  amount?: string | number;
  campaign?: string;
  consumeTime?: string;
};

type RawHealthProfile = {
  id: number;
  customerId: number;
  skinType?: string;
  skinStatus?: string;
  mainProblems?: string;
  allergyHistory?: string;
  goals?: string;
  recommendedCare?: string;
  instrument?: string;
  lastCheck?: string;
};

function readMockJson<T>(relativePath: string): T {
  const filePath = resolve(import.meta.dirname, '..', '..', '..', relativePath);
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseAmount(value?: string | number): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const parsed = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function resetSequence(tableName: string) {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('"${tableName}"', 'id'),
      COALESCE((SELECT MAX(id) FROM "${tableName}"), 1),
      true
    )
  `);
}

async function seedCustomerDataFromMockFiles() {
  const customers = readMockJson<RawCustomer[]>('src/api/mock/data/customers.json');
  const consumptionRecords = readMockJson<RawConsumptionRecord[]>('src/api/mock/data/consumption-records.json');
  const healthProfiles = readMockJson<RawHealthProfile[]>('src/api/mock/data/health-profiles.json');

  console.log(`Importing customer mock data: ${customers.length} customers, ${consumptionRecords.length} records, ${healthProfiles.length} health profiles...`);

  const storeNames = Array.from(new Set(customers.map((customer) => customer.storeName).filter(Boolean))) as string[];
  const storeIdByName = new Map<string, number>();
  const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } });

  for (const name of storeNames) {
    const existing = await prisma.store.findFirst({ where: { name } });
    const store = existing ?? await prisma.store.create({ data: { name, status: 'active' } });
    storeIdByName.set(name, store.id);
    if (adminUser) {
      await prisma.userStore.upsert({
        where: { userId_storeId: { userId: adminUser.id, storeId: store.id } },
        update: {},
        create: { userId: adminUser.id, storeId: store.id },
      });
    }
  }

  const fallbackStoreId = storeIdByName.get(customers[0]?.storeName ?? '') ?? 1;

  for (const customer of customers) {
    const birthday = parseDate(customer.birthday);
    const lastVisitDate = parseDate(customer.lastVisitDate);
    const createdAt = parseDate(customer.createdAt);
    const data = {
      storeId: storeIdByName.get(customer.storeName ?? '') ?? fallbackStoreId,
      name: customer.name,
      phone: customer.phone || null,
      email: customer.email || null,
      wechat: customer.wechat || null,
      landline: customer.landline || null,
      gender: customer.gender || null,
      maritalStatus: customer.maritalStatus || null,
      birthday,
      age: customer.age ?? null,
      height: customer.height ?? null,
      weight: customer.weight ?? null,
      occupation: customer.occupation || null,
      workplace: customer.workplace || null,
      address: customer.address || null,
      hasAllergy: customer.hasAllergy || null,
      hasSurgery: customer.hasSurgery || null,
      skinCondition: customer.skinCondition || null,
      totalSpent: customer.totalSpent ?? 0,
      visitCount: customer.visitCount ?? 0,
      memberLevel: customer.memberLevel || '',
      source: customer.source || null,
      lastVisitDate,
      skinType: null,
      tags: customer.tags ?? [],
      remark: customer.remark || null,
      ...(createdAt ? { createdAt } : {}),
    };

    await prisma.customer.upsert({
      where: { id: customer.id },
      update: data,
      create: { id: customer.id, ...data },
    });
  }

  for (const records of chunk(consumptionRecords, 500)) {
    await prisma.consumptionRecord.createMany({
      data: records.map((record) => ({
        id: record.id,
        customerId: record.customerId,
        consumeType: record.consumeType,
        consumeContent: record.consumeContent,
        payMethod: record.payMethod || null,
        amount: parseAmount(record.amount),
        campaign: record.campaign || null,
        consumeTime: parseDate(record.consumeTime) ?? new Date(),
      })),
      skipDuplicates: true,
    });
  }

  for (const profile of healthProfiles) {
    const data = {
      skinType: profile.skinType || '-',
      skinStatus: profile.skinStatus || null,
      mainProblems: profile.mainProblems || null,
      allergyHistory: profile.allergyHistory || null,
      goals: profile.goals || null,
      recommendedCare: profile.recommendedCare || null,
      instrument: profile.instrument || null,
      lastCheck: parseDate(profile.lastCheck) ?? new Date(),
    };

    await prisma.customerHealthProfile.upsert({
      where: { customerId: profile.customerId },
      update: data,
      create: { id: profile.id, customerId: profile.customerId, ...data },
    });
  }

  await resetSequence('Customer');
  await resetSequence('ConsumptionRecord');
  await resetSequence('CustomerHealthProfile');

  console.log('Customer mock data import completed.');
}

async function main() {
  console.log('Seeding database...');

  // Create stores
  const store1 = await prisma.store.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Ami 上海静安店', city: '上海', address: '静安区南京西路1000号', phone: '021-62001234' },
  });

  const store2 = await prisma.store.upsert({
    where: { id: 2 },
    update: {},
    create: { name: 'Ami 上海徐汇店', city: '上海', address: '徐汇区衡山路500号', phone: '021-64001234' },
  });

  // Create roles
  const superAdminRole = await prisma.role.upsert({
    where: { key: 'super_admin' },
    update: {},
    create: {
      key: 'super_admin',
      name: '超级管理员',
      description: '拥有所有权限',
      isSystem: true,
      permissions: ['*'],
      platformScopes: { core: true, assist: true, terminal: true },
      dataScopes: { store: 'all', customer: 'all', order: 'all', booking: 'all', inventory: 'all', report: 'all', device: 'all' },
    },
  });

  const storeManagerRole = await prisma.role.upsert({
    where: { key: 'store_manager' },
    update: {},
    create: {
      key: 'store_manager',
      name: '店长',
      description: '门店管理权限',
      isSystem: true,
      permissions: [
        'core:dashboard:view', 'core:customer:view', 'core:customer:create', 'core:customer:update',
        'core:customer:delete', 'core:customer:export', 'core:customer:profile', 'core:customer:script',
        'core:marketing:view', 'core:marketing:create', 'core:marketing:update', 'core:marketing:delete',
        'core:marketing:recommend', 'core:marketing:template', 'core:marketing:analytics',
        'core:store:view', 'core:store:project-types', 'core:store:projects', 'core:store:beauticians',
        'core:store:beautician-levels', 'core:store:scheduling', 'core:store:reservations',
        'core:goods:types', 'core:goods:products', 'core:goods:cards',
        'core:order:products', 'core:order:projects', 'core:order:member-cards', 'core:order:card-orders', 'core:order:card-usage',
        'core:order:create', 'core:order:update', 'core:order:refund',
        'core:inventory:products', 'core:inventory:stock', 'core:inventory:purchase',
        'core:inventory:expiry', 'core:inventory:transfer', 'core:inventory:consumption',
        'core:system:users', 'core:system:roles', 'core:system:permissions', 'core:system:stores',
      ],
      platformScopes: { core: true, assist: true, terminal: true },
      dataScopes: { store: 'own_store', customer: 'own_store', order: 'own_store', booking: 'own_store', inventory: 'own_store', report: 'own_store', device: 'own_store' },
    },
  });

  const beauticianRole = await prisma.role.upsert({
    where: { key: 'beautician' },
    update: {},
    create: {
      key: 'beautician',
      name: '美容师',
      description: '美容师权限',
      isSystem: true,
      permissions: [
        'core:dashboard:view', 'core:store:scheduling', 'core:store:reservations',
        'terminal:service:view', 'terminal:service:start', 'terminal:service:complete', 'terminal:skin:record',
      ],
      platformScopes: { core: true, assist: true, terminal: true },
      dataScopes: { store: 'own_store', customer: 'served_customers', order: 'served_customers', booking: 'self', inventory: 'none', report: 'self', device: 'current_device' },
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { key: 'cashier' },
    update: {},
    create: {
      key: 'cashier',
      name: '收银员',
      description: '收银权限',
      isSystem: true,
      permissions: [
        'core:dashboard:view', 'core:order:products', 'core:order:projects', 'core:order:member-cards', 'core:order:card-orders', 'core:order:card-usage',
        'core:order:create', 'core:order:update', 'core:order:refund',
      ],
      platformScopes: { core: true, assist: false, terminal: false },
      dataScopes: { store: 'own_store', customer: 'own_store', order: 'own_store', booking: 'own_store', inventory: 'none', report: 'own_store', device: 'none' },
    },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash(readSeedPassword('ADMIN_DEFAULT_PASSWORD'), 12);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      name: '系统管理员',
      phone: '13800000000',
    },
  });

  // Assign super_admin role and all stores to admin
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: superAdminRole.id },
  });
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: adminUser.id, storeId: store1.id } },
    update: {},
    create: { userId: adminUser.id, storeId: store1.id },
  });
  await prisma.userStore.upsert({
    where: { userId_storeId: { userId: adminUser.id, storeId: store2.id } },
    update: {},
    create: { userId: adminUser.id, storeId: store2.id },
  });

  // Create sample categories
  const skincare = await prisma.category.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: '护肤品' },
  });
  await prisma.category.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: '面膜', parentId: skincare.id },
  });
  await prisma.category.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, name: '精华液', parentId: skincare.id },
  });
  await prisma.category.upsert({
    where: { id: 4 },
    update: {},
    create: { id: 4, name: '仪器耗材' },
  });

  // Create sample project types
  await prisma.projectType.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: '面部护理', description: '面部清洁、补水、抗衰等' },
  });
  await prisma.projectType.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: '身体护理', description: '身体按摩、排毒、塑形等' },
  });

  // Create beautician levels
  await prisma.beauticianLevel.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: '初级美容师', description: '入职 0-1 年', sortOrder: 1 },
  });
  await prisma.beauticianLevel.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: '中级美容师', description: '入职 1-3 年', sortOrder: 2 },
  });
  await prisma.beauticianLevel.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, name: '高级美容师', description: '入职 3 年以上', sortOrder: 3 },
  });

  await seedCustomerDataFromMockFiles();

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
