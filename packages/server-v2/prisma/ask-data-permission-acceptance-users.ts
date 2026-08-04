import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { readSeedPassword } from './seed-env.ts';
import {
  ASK_DATA_PERMISSION_ACCEPTANCE_PASSWORD_ENV,
  ASK_DATA_PERMISSION_ACCEPTANCE_ROLES,
  ASK_DATA_PERMISSION_ACCEPTANCE_STORE_NAME,
  sameStringSet,
} from '../scripts/ask-data-permission-acceptance-contract.mjs';

type Mode = 'plan' | 'apply' | 'verify';

const args = new Set(process.argv.slice(2));
const mode: Mode = args.has('--verify') ? 'verify' : args.has('--apply') ? 'apply' : 'plan';
if (mode === 'apply' && !args.has('--yes')) {
  throw new Error('真实写入必须显式传入 --apply --yes');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('开发验收账号脚本拒绝在 production 环境运行。');
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL 未配置。');
const parsedDatabaseUrl = new URL(databaseUrl);
if (!parsedDatabaseUrl.hostname.endsWith('.supabase.com') && !parsedDatabaseUrl.hostname.endsWith('.supabase.co')) {
  throw new Error('仅允许对已批准的 Supabase 共享开发库运行。');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const stores = await prisma.store.findMany({
    where: { name: ASK_DATA_PERMISSION_ACCEPTANCE_STORE_NAME, status: 'active', deletedAt: null },
    select: { id: true, name: true },
  });
  if (stores.length !== 1) {
    throw new Error(`验收门店必须唯一，当前匹配数=${stores.length}`);
  }
  const store = stores[0];
  const password = readSeedPassword(ASK_DATA_PERMISSION_ACCEPTANCE_PASSWORD_ENV);

  if (mode === 'apply') {
    const passwordHash = await bcrypt.hash(password, 12);
    // Supabase Session Pooler + PrismaPg does not reliably expose earlier
    // inserts to later statements inside an interactive transaction. Each
    // operation below is an idempotent upsert, so an interrupted run can be
    // safely repeated without deleting or duplicating acceptance data.
    for (const actor of ASK_DATA_PERMISSION_ACCEPTANCE_ROLES) {
      const role = await prisma.role.upsert({
        where: { key: actor.roleKey },
        update: {
          name: actor.name,
          description: `Ami Ask 开发权限验收角色（${actor.key}）`,
          permissions: actor.permissions,
          status: 'active',
        },
        create: {
          key: actor.roleKey,
          name: actor.name,
          description: `Ami Ask 开发权限验收角色（${actor.key}）`,
          permissions: actor.permissions,
          isSystem: false,
          status: 'active',
        },
      });
      const user = await prisma.user.upsert({
        where: { username: actor.username },
        update: {
          name: actor.name,
          passwordHash,
          status: 'active',
          deletedAt: null,
        },
        create: {
          username: actor.username,
          name: actor.name,
          passwordHash,
          status: 'active',
        },
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
    }
  }

  const evidence = [];
  let valid = true;
  for (const actor of ASK_DATA_PERMISSION_ACCEPTANCE_ROLES) {
    const role = await prisma.role.findUnique({ where: { key: actor.roleKey } });
    const user = await prisma.user.findUnique({
      where: { username: actor.username },
      include: { roles: { include: { role: true } }, stores: true },
    });
    const rolePermissionsValid = Boolean(role && role.status === 'active' && sameStringSet(role.permissions, actor.permissions));
    const expectedRoleOnly = Boolean(
      user && user.roles.length === 1 && user.roles[0]?.role.key === actor.roleKey,
    );
    const expectedStoreOnly = Boolean(
      user && user.stores.length === 1 && user.stores[0]?.storeId === store.id,
    );
    const passwordValid = Boolean(user && (await bcrypt.compare(password, user.passwordHash)));
    const userValid = Boolean(user && user.status === 'active' && !user.deletedAt);
    const actorValid = rolePermissionsValid && expectedRoleOnly && expectedStoreOnly && passwordValid && userValid;
    valid &&= actorValid;
    evidence.push({
      key: actor.key,
      roleKey: actor.roleKey,
      username: actor.username,
      roleExists: Boolean(role),
      userExists: Boolean(user),
      rolePermissionsValid,
      expectedRoleOnly,
      expectedStoreOnly,
      passwordValid,
      userValid,
      valid: actorValid,
    });
  }

  const result = {
    status: valid ? 'pass' : mode === 'plan' ? 'planned' : 'fail',
    mode,
    databaseHost: parsedDatabaseUrl.hostname,
    connectionBoundary: 'shared_development_database',
    store: { id: store.id, name: store.name },
    actorCount: ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.length,
    destructiveOperations: 0,
    credentialsPrinted: false,
    actors: evidence,
  };
  console.log(JSON.stringify(result, null, 2));
  if (mode !== 'plan' && !valid) process.exitCode = 1;
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'fail', mode, reason: message.slice(0, 500) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
