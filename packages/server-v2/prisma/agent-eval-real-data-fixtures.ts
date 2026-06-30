import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type FixtureStatus = 'pass' | 'warn' | 'fail';

type FixtureCheck = {
  key: string;
  name: string;
  status: FixtureStatus;
  count: number;
  min: number;
  questions: string[];
  evidence?: unknown;
};

type Args = {
  planOnly: boolean;
  storeId?: number;
  storeName: string;
};

const args = parseArgs();

const plannedChecks = [
  'store',
  'today_orders',
  'yesterday_orders',
  'month_revenue',
  'today_reservations',
  'today_arrivals',
  'customers',
  'customer_cards',
  'card_usage_today',
  'refunds_this_month',
  'low_stock_products',
  'expiring_stock_batches',
  'beauticians',
  'service_tasks_today',
  'marketing_activities',
  'automation_templates',
];

if (args.planOnly) {
  console.log(
    JSON.stringify(
      {
        ready: true,
        mode: 'plan-only',
        writeSafety: 'read_only_no_database_write',
        storeName: args.storeName,
        plannedChecks,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Use --plan-only to inspect the read-only fixture checklist without connecting.');
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
    planOnly: flags.has('plan-only'),
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

function startOfLocalMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function check(input: Omit<FixtureCheck, 'status'>): FixtureCheck {
  return {
    ...input,
    status: input.count >= input.min ? 'pass' : input.count > 0 ? 'warn' : 'fail',
  };
}

function isLowStock(product: { currentStock: unknown; safetyStock: unknown }) {
  return Number(product.currentStock ?? 0) <= Number(product.safetyStock ?? 0);
}

async function main() {
  const todayStart = startOfLocalDay();
  const tomorrowStart = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);
  const monthStart = startOfLocalMonth();
  const next30Days = addDays(todayStart, 30);

  const store = await prisma.store.findFirst({
    where: args.storeId ? { id: args.storeId } : { name: args.storeName },
    select: { id: true, name: true, status: true },
  });

  if (!store) {
    const result = {
      ready: false,
      writeSafety: 'read_only_no_database_write',
      store: null,
      checks: [
        check({
          key: 'store',
          name: '演示门店存在',
          count: 0,
          min: 1,
          questions: ['所有真实数据 Agent Eval 样本'],
          evidence: { requestedStoreId: args.storeId, requestedStoreName: args.storeName },
        }),
      ],
    };
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }

  const orderWhere = { storeId: store.id, status: { notIn: ['cancelled', 'refunded_cancelled'] } };
  const [
    todayOrders,
    yesterdayOrders,
    monthRevenue,
    todayReservations,
    todayArrivals,
    customers,
    customerCards,
    cardUsageToday,
    refundsThisMonth,
    products,
    expiringStockBatches,
    beauticians,
    serviceTasksToday,
    marketingActivities,
    automationTemplates,
  ] = await Promise.all([
    prisma.productOrder.count({ where: { ...orderWhere, createdAt: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.productOrder.count({ where: { ...orderWhere, createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.productOrder.aggregate({
      where: { ...orderWhere, createdAt: { gte: monthStart, lt: tomorrowStart } },
      _count: { _all: true },
      _sum: { totalAmount: true, netAmount: true },
    }),
    prisma.reservation.count({ where: { storeId: store.id, date: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.reservation.count({ where: { storeId: store.id, checkedInAt: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.customer.count({ where: { storeId: store.id, deletedAt: null } }),
    prisma.customerCard.count({ where: { customer: { storeId: store.id }, status: 'active' } }),
    prisma.cardUsageRecord.count({ where: { storeId: store.id, verifiedAt: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.refundRecord.count({
      where: {
        OR: [{ refundedAt: { gte: monthStart, lt: tomorrowStart } }, { createdAt: { gte: monthStart, lt: tomorrowStart } }],
        order: { storeId: store.id },
      },
    }),
    prisma.product.findMany({
      where: { storeId: store.id, status: 'active', deletedAt: null },
      select: { id: true, name: true, currentStock: true, safetyStock: true },
    }),
    prisma.stockBatch.count({
      where: {
        stock: { gt: 0 },
        expiryDate: { gte: todayStart, lte: next30Days },
        product: { storeId: store.id, status: 'active', deletedAt: null },
      },
    }),
    prisma.beautician.count({ where: { storeId: store.id, status: 'active' } }),
    prisma.serviceTask.count({ where: { storeId: store.id, appointmentTime: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.marketingActivity.count(),
    prisma.marketingRuleTemplate.count({ where: { OR: [{ storeId: store.id }, { storeId: null }], status: { not: 'disabled' } } }),
  ]);

  const lowStockProducts = products.filter(isLowStock);
  const checks: FixtureCheck[] = [
    check({
      key: 'store',
      name: '演示门店存在',
      count: 1,
      min: 1,
      questions: ['所有真实数据 Agent Eval 样本'],
      evidence: store,
    }),
    check({
      key: 'today_orders',
      name: '今日订单/收银数据',
      count: todayOrders,
      min: 1,
      questions: ['今天营业额到多少了', '今日收入', '今天所有收银、核销、办卡订单列表'],
    }),
    check({
      key: 'yesterday_orders',
      name: '昨日消费客户清单数据',
      count: yesterdayOrders,
      min: 1,
      questions: ['昨天有哪些消费的客户，列出清单', '昨日成交客户明细'],
    }),
    check({
      key: 'month_revenue',
      name: '本月营收问数数据',
      count: monthRevenue._count._all,
      min: 1,
      questions: ['这个月营业额是多少', '本月利润为什么下降'],
      evidence: {
        orderCount: monthRevenue._count._all,
        totalAmount: String(monthRevenue._sum.totalAmount ?? 0),
        netAmount: String(monthRevenue._sum.netAmount ?? 0),
      },
    }),
    check({
      key: 'today_reservations',
      name: '今日预约数据',
      count: todayReservations,
      min: 1,
      questions: ['今天有哪些预约', '今天所有的预约给我列一下'],
    }),
    check({
      key: 'today_arrivals',
      name: '今日到店数据',
      count: todayArrivals,
      min: 1,
      questions: ['今天来了几个客人，现在还有几个在店', '预约客户未到店'],
    }),
    check({
      key: 'customers',
      name: '客户基础数据',
      count: customers,
      min: 10,
      questions: ['请列出10个需要紧急召回的客户', '哪些客户适合回访做复购承接'],
    }),
    check({
      key: 'customer_cards',
      name: '客户卡项权益数据',
      count: customerCards,
      min: 1,
      questions: ['这个客户还有什么卡和权益？', '这个客人用次卡核销，帮我看一下她的次卡情况'],
    }),
    check({
      key: 'card_usage_today',
      name: '今日核销数据',
      count: cardUsageToday,
      min: 1,
      questions: ['今天所有核销订单列表', '这个客人用次卡核销'],
    }),
    check({
      key: 'refunds_this_month',
      name: '本月退款数据',
      count: refundsThisMonth,
      min: 1,
      questions: ['本月退款和手工优惠有没有财务审计风险', '哪些退款异常'],
    }),
    check({
      key: 'low_stock_products',
      name: '低库存商品数据',
      count: lowStockProducts.length,
      min: 1,
      questions: ['哪些商品库存不足', '哪些商品需要补货'],
      evidence: lowStockProducts.slice(0, 5).map((item) => ({
        id: item.id,
        name: item.name,
        currentStock: String(item.currentStock),
        safetyStock: String(item.safetyStock),
      })),
    }),
    check({
      key: 'expiring_stock_batches',
      name: '临期库存批次数据',
      count: expiringStockBatches,
      min: 1,
      questions: ['哪些产品快过期了，还有多少', '近期有哪些临期库存产品'],
    }),
    check({
      key: 'beauticians',
      name: '美容师/员工数据',
      count: beauticians,
      min: 1,
      questions: ['这个月谁的业绩最好', '本月员工业绩排行'],
    }),
    check({
      key: 'service_tasks_today',
      name: '今日服务任务数据',
      count: serviceTasksToday,
      min: 1,
      questions: ['我今天有几个客人', '我今天有哪些客户'],
    }),
    check({
      key: 'marketing_activities',
      name: '营销活动数据',
      count: marketingActivities,
      min: 1,
      questions: ['上次营销活动转化效果怎么样', '这个活动转化效果怎么样'],
    }),
    check({
      key: 'automation_templates',
      name: '自动化规则模板数据',
      count: automationTemplates,
      min: 1,
      questions: ['帮我设置客户45天没来自动提醒', '自动化触达效果怎么样'],
    }),
  ];

  const failed = checks.filter((item) => item.status === 'fail');
  const warnings = checks.filter((item) => item.status === 'warn');
  const result = {
    ready: failed.length === 0,
    writeSafety: 'read_only_no_database_write',
    store,
    dateRanges: {
      today: { gte: todayStart.toISOString(), lt: tomorrowStart.toISOString() },
      yesterday: { gte: yesterdayStart.toISOString(), lt: todayStart.toISOString() },
      thisMonth: { gte: monthStart.toISOString(), lt: tomorrowStart.toISOString() },
      next30Days: { gte: todayStart.toISOString(), lte: next30Days.toISOString() },
    },
    summary: {
      total: checks.length,
      pass: checks.filter((item) => item.status === 'pass').length,
      warn: warnings.length,
      fail: failed.length,
    },
    checks,
  };

  console.log(JSON.stringify(result, null, 2));
  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
