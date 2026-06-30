import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type Args = {
  apply: boolean;
  yes: boolean;
  storeId?: number;
  storeName: string;
};

const args = parseArgs();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): Args {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    if (raw.includes('=')) {
      const [key, ...rest] = raw.replace(/^--/, '').split('=');
      values.set(key, rest.join('='));
    } else {
      flags.add(raw.replace(/^--/, ''));
    }
  }
  const storeIdRaw = values.get('store-id') ?? process.env.AGENT_EVAL_STORE_ID;
  const storeId = storeIdRaw ? Number(storeIdRaw) : undefined;
  if (storeIdRaw && (!Number.isFinite(storeId) || Number(storeId) <= 0)) {
    throw new Error('--store-id must be a positive number.');
  }
  return {
    apply: flags.has('apply'),
    yes: flags.has('yes'),
    storeId,
    storeName: values.get('store-name') ?? process.env.AGENT_EVAL_STORE_NAME ?? 'Ami 全量演示门店',
  };
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function main() {
  const todayStart = startOfLocalDay();
  const yesterdayStart = addDays(todayStart, -1);
  const tomorrowStart = addDays(todayStart, 1);
  const fixtureCreatedAt = new Date(yesterdayStart);
  fixtureCreatedAt.setHours(11, 20, 0, 0);

  const store = await prisma.store.findFirst({
    where: args.storeId ? { id: args.storeId } : { name: args.storeName },
    select: { id: true, name: true, status: true },
  });

  if (!store) {
    throw new Error(`Store not found: ${args.storeId ?? args.storeName}`);
  }

  const orderWhere = { storeId: store.id, status: { notIn: ['cancelled', 'refunded_cancelled'] } };
  const existingYesterdayOrders = await prisma.productOrder.count({
    where: { ...orderWhere, createdAt: { gte: yesterdayStart, lt: todayStart } },
  });

  const orderNo = `AGENT-EVAL-YDAY-${store.id}-${formatDateId(yesterdayStart)}`;
  const paymentNo = `AGENT-EVAL-PAY-${store.id}-${formatDateId(yesterdayStart)}`;
  const existingFixture = await prisma.productOrder.findUnique({ where: { orderNo } });

  const [customer, product] = await Promise.all([
    prisma.customer.findFirst({
      where: { storeId: store.id, deletedAt: null },
      orderBy: [{ totalSpent: 'desc' }, { id: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.product.findFirst({
      where: { storeId: store.id, status: 'active', deletedAt: null },
      orderBy: [{ retailPrice: 'desc' }, { id: 'asc' }],
      select: { id: true, name: true, retailPrice: true },
    }),
  ]);

  const amount = Number(product?.retailPrice ?? 398);
  const preview = {
    writeSafety: args.apply ? 'apply_requires_yes' : 'dry_run_no_database_write',
    store,
    currentState: {
      yesterdayOrders: existingYesterdayOrders,
      fixtureOrderExists: Boolean(existingFixture),
    },
    plannedOrder:
      existingYesterdayOrders >= 1 || existingFixture
        ? null
        : {
            orderNo,
            paymentNo,
            customer,
            product,
            amount,
            createdAt: fixtureCreatedAt.toISOString(),
            affectedQuestion: '昨天有哪些消费的客户，列出清单',
          },
  };

  if (existingYesterdayOrders >= 1) {
    console.log(JSON.stringify({ ...preview, status: 'skip', reason: 'yesterday_orders_already_satisfied' }, null, 2));
    return;
  }

  if (existingFixture) {
    console.log(JSON.stringify({ ...preview, status: 'skip', reason: 'fixture_order_already_exists' }, null, 2));
    return;
  }

  if (!customer || !product) {
    throw new Error('Cannot create Agent Eval fixture: demo store needs at least one customer and one active product.');
  }

  if (!args.apply) {
    console.log(JSON.stringify({ ...preview, status: 'dry_run' }, null, 2));
    return;
  }

  if (!args.yes) {
    throw new Error('Refusing to write fixture data without --yes.');
  }

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.productOrder.create({
      data: {
        orderNo,
        orderKind: 'product',
        customerId: customer.id,
        customerName: customer.name,
        storeId: store.id,
        totalAmount: amount,
        listAmount: amount,
        netAmount: amount,
        status: 'completed',
        payMethod: 'wechat',
        source: 'agent_eval_fixture',
        items: [{ itemType: 'product', itemId: product.id, name: product.name, quantity: 1, unitPrice: amount }],
        remark: 'Agent Eval 昨日消费客户清单固定样本',
        createdAt: fixtureCreatedAt,
        updatedAt: fixtureCreatedAt,
      },
    });

    const item = await tx.orderItem.create({
      data: {
        orderId: order.id,
        itemType: 'product',
        itemId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: amount,
        listAmount: amount,
        subtotal: amount,
        netAmount: amount,
        payload: { source: 'agent_eval_fixture' },
        createdAt: fixtureCreatedAt,
      },
    });

    const payment = await tx.paymentRecord.create({
      data: {
        orderId: order.id,
        paymentNo,
        method: 'wechat',
        amount,
        status: 'success',
        transactionNo: `AGENT-EVAL-TXN-${store.id}-${formatDateId(yesterdayStart)}`,
        paidAt: fixtureCreatedAt,
        createdAt: fixtureCreatedAt,
      },
    });

    return { order, item, payment };
  });

  const finalYesterdayOrders = await prisma.productOrder.count({
    where: { ...orderWhere, createdAt: { gte: yesterdayStart, lt: todayStart } },
  });

  console.log(
    JSON.stringify(
      {
        ...preview,
        status: 'created',
        created: {
          orderId: created.order.id,
          orderNo: created.order.orderNo,
          orderItemId: created.item.id,
          paymentRecordId: created.payment.id,
        },
        finalState: { yesterdayOrders: finalYesterdayOrders },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
