import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type CheckStatus = 'pass' | 'warn' | 'fail';

type CheckResult = {
  key: string;
  status: CheckStatus;
  message: string;
  evidence?: Record<string, unknown>;
  nextStep?: string;
};

type VerifyArgs = {
  storeId?: number;
  storeName?: string;
  from: Date;
  to: Date;
};

type SamplePlan = {
  candidates: Record<string, unknown>;
  actions: Array<{
    key: string;
    title: string;
    canRun: boolean;
    missing: string[];
    payload: Record<string, unknown>;
  }>;
};

const DEFAULT_STORE_NAME = 'Ami 全量演示门店';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function parseDate(value: string | undefined, fallback: Date, endOfDay = false) {
  if (!value) return fallback;
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const date = new Date(value.includes('T') ? value : `${value}${suffix}`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function parseArgs(): VerifyArgs {
  const now = new Date();
  const fromFallback = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const storeId = argValue('storeId') ? Number(argValue('storeId')) : undefined;
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }
  return {
    storeId,
    storeName: argValue('storeName') ?? DEFAULT_STORE_NAME,
    from: parseDate(argValue('from'), fromFallback),
    to: parseDate(argValue('to'), now, true),
  };
}

function money(value: unknown) {
  return Number(value ?? 0);
}

function pass(key: string, message: string, evidence?: Record<string, unknown>): CheckResult {
  return { key, status: 'pass', message, evidence };
}

function warn(key: string, message: string, evidence?: Record<string, unknown>, nextStep?: string): CheckResult {
  return { key, status: 'warn', message, evidence, nextStep };
}

function fail(key: string, message: string, evidence?: Record<string, unknown>, nextStep?: string): CheckResult {
  return { key, status: 'fail', message, evidence, nextStep };
}

async function findStore(args: VerifyArgs) {
  if (args.storeId) return prisma.store.findFirst({ where: { id: args.storeId, deletedAt: null } });
  return prisma.store.findFirst({ where: { name: args.storeName, deletedAt: null } });
}

async function countStockMovement(sourceType: string, sourceId: number, movementType?: string) {
  return prisma.stockMovement.count({
    where: {
      sourceType,
      sourceId,
      ...(movementType ? { movementType } : {}),
    },
  });
}

async function countCommissionByOrder(orderId: number) {
  return prisma.commissionRecord.count({ where: { orderId } });
}

async function verifyCardUsage(storeId: number, args: VerifyArgs, terminal: boolean): Promise<CheckResult> {
  const key = terminal ? 'terminal-card-usage' : 'admin-card-usage';
  const record = await prisma.cardUsageRecord.findFirst({
    where: {
      storeId,
      verifiedAt: { gte: args.from, lte: args.to },
      ...(terminal ? { deviceId: { not: null } } : { deviceId: null }),
    },
    orderBy: { verifiedAt: 'desc' },
  });
  if (!record) {
    return warn(
      key,
      terminal ? '未找到终端次卡核销真实样本' : '未找到管理端次卡核销真实样本',
      { storeId, from: args.from, to: args.to },
      terminal ? '通过终端核销一笔次卡后重跑' : '通过管理端核销一笔次卡后重跑',
    );
  }
  const movementCount = await countStockMovement('card_usage', record.id);
  const commissionCount = await prisma.commissionRecord.count({
    where: {
      OR: [{ cardUsageRecordId: record.id }, { sourceType: 'card_usage', sourceId: record.id }],
    },
  });
  const required = {
    hasCustomerCardId: Boolean(record.customerCardId),
    hasCardId: Boolean(record.cardId),
    hasProjectId: Boolean(record.projectId),
    hasProjectName: Boolean(record.projectName),
    hasRecognizedAmount: money(record.recognizedAmount) > 0,
    hasOperatorId: Boolean(record.operatorId),
    hasBeauticianId: Boolean(record.beauticianId),
    hasDeviceId: terminal ? Boolean(record.deviceId) : true,
    hasStockMovement: movementCount > 0,
    hasCommission: commissionCount > 0,
  };
  const ok = Object.values(required).every(Boolean);
  return ok
    ? pass(key, '次卡核销样本字段完整', { id: record.id, ...required, movementCount, commissionCount })
    : fail(key, '次卡核销样本存在字段或副作用缺口', { id: record.id, ...required, movementCount, commissionCount });
}

async function verifyCustomer(storeId: number, args: VerifyArgs, terminal: boolean): Promise<CheckResult> {
  const key = terminal ? 'terminal-customer-create' : 'admin-customer-create';
  const customer = await prisma.customer.findFirst({
    where: {
      storeId,
      createdAt: { gte: args.from, lte: args.to },
      deletedAt: null,
      ...(terminal ? { source: 'terminal' } : { source: { not: 'terminal' } }),
    },
    include: { healthProfile: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!customer) {
    return warn(
      key,
      terminal ? '未找到终端登记客户真实样本' : '未找到管理端新建客户真实样本',
      { storeId, from: args.from, to: args.to },
      terminal ? '通过终端登记一位客户后重跑' : '通过管理端新建一位客户后重跑',
    );
  }
  return customer.healthProfile
    ? pass(key, '客户创建样本已同步健康档案', { customerId: customer.id, source: customer.source, healthProfileId: customer.healthProfile.id })
    : fail(key, '客户创建样本缺少健康档案', { customerId: customer.id, source: customer.source });
}

async function verifyRecharge(storeId: number, args: VerifyArgs, terminal: boolean): Promise<CheckResult> {
  const key = terminal ? 'terminal-recharge' : 'admin-recharge';
  const order = await prisma.productOrder.findFirst({
    where: {
      storeId,
      orderKind: 'member_card_recharge',
      createdAt: { gte: args.from, lte: args.to },
      source: terminal ? 'terminal' : { not: 'terminal' },
    },
    include: { orderItems: true, paymentRecords: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) {
    return warn(
      key,
      terminal ? '未找到终端充值真实样本' : '未找到管理端充值真实样本',
      { storeId, from: args.from, to: args.to },
      terminal ? '通过终端充值一笔后重跑' : '通过管理端充值一笔后重跑',
    );
  }
  const balanceTransaction = await prisma.customerBalanceTransaction.findFirst({ where: { orderId: order.id, type: 'recharge' } });
  const commissionCount = await countCommissionByOrder(order.id);
  const required = {
    hasRechargeItem: order.orderItems.some((item: any) => item.itemType === 'recharge'),
    hasPayment: order.paymentRecords.length > 0,
    hasBalanceTransaction: Boolean(balanceTransaction),
    hasCommission: commissionCount > 0,
  };
  const ok = Object.values(required).every(Boolean);
  return ok
    ? pass(key, '充值样本字段完整', { orderId: order.id, orderNo: order.orderNo, ...required, commissionCount })
    : fail(key, '充值样本存在字段或副作用缺口', { orderId: order.id, orderNo: order.orderNo, ...required, commissionCount });
}

async function verifyCheckout(storeId: number, args: VerifyArgs, source: 'terminal' | 'admin', kind: 'product' | 'project'): Promise<CheckResult> {
  const key = `${source}-${kind}-checkout`;
  const itemTypes = kind === 'product' ? ['product', 'goods'] : ['project'];
  const order = await prisma.productOrder.findFirst({
    where: {
      storeId,
      source: source === 'terminal' ? 'terminal' : { not: 'terminal' },
      orderKind: kind,
      createdAt: { gte: args.from, lte: args.to },
      orderItems: { some: { itemType: { in: itemTypes } } },
    },
    include: { orderItems: true, paymentRecords: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!order) {
    return warn(
      key,
      `未找到${source === 'terminal' ? '终端' : '管理端'}${kind === 'product' ? '商品' : '项目'}收银真实样本`,
      { storeId, from: args.from, to: args.to },
      `创建一笔${source === 'terminal' ? '终端' : '管理端'}${kind === 'product' ? '商品' : '项目'}订单后重跑`,
    );
  }
  const movementType = kind === 'product' ? 'sale_out' : 'service_consume';
  const movementCount = await countStockMovement(`${kind}_order`, order.id, movementType);
  const commissionCount = await countCommissionByOrder(order.id);
  const required = {
    hasMatchingItem: order.orderItems.some((item: any) => itemTypes.includes(String(item.itemType))),
    hasPayment: order.paymentRecords.length > 0,
    hasStockMovement: movementCount > 0,
    hasCommission: commissionCount > 0,
    hasCheckoutGroupNo: source === 'terminal' ? Boolean(order.checkoutGroupNo) : true,
  };
  const ok = Object.values(required).every(Boolean);
  return ok
    ? pass(key, '收银样本字段完整', { orderId: order.id, orderNo: order.orderNo, ...required, movementCount, commissionCount })
    : fail(key, '收银样本存在字段或副作用缺口', { orderId: order.id, orderNo: order.orderNo, ...required, movementCount, commissionCount });
}

async function verifyTerminalMixedCheckout(storeId: number, args: VerifyArgs): Promise<CheckResult> {
  const orders = await prisma.productOrder.findMany({
    where: {
      storeId,
      source: 'terminal',
      checkoutGroupNo: { not: null },
      createdAt: { gte: args.from, lte: args.to },
      orderItems: { some: { itemType: { in: ['project', 'product', 'goods'] } } },
    },
    include: { orderItems: true, paymentRecords: true },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  const groups = new Map<string, typeof orders>();
  for (const order of orders) {
    if (!order.checkoutGroupNo) continue;
    groups.set(order.checkoutGroupNo, [...(groups.get(order.checkoutGroupNo) ?? []), order]);
  }
  const mixedGroup = Array.from(groups.entries()).find(([, groupOrders]) => {
    const kinds = new Set(groupOrders.flatMap((order: any) => order.orderItems.map((item: any) => String(item.itemType))));
    return groupOrders.length >= 2 && kinds.has('project') && (kinds.has('product') || kinds.has('goods'));
  });
  if (!mixedGroup) {
    return warn(
      'terminal-mixed-checkout',
      '未找到终端混合收银真实样本',
      { storeId, from: args.from, to: args.to },
      '通过终端创建一笔项目+商品混合收银后重跑',
    );
  }

  const [checkoutGroupNo, groupOrders] = mixedGroup;
  const details = await Promise.all(
    groupOrders.map(async (order: any) => {
      const hasProject = order.orderItems.some((item: any) => item.itemType === 'project');
      const hasProduct = order.orderItems.some((item: any) => ['product', 'goods'].includes(String(item.itemType)));
      const movementType = hasProject ? 'service_consume' : 'sale_out';
      const sourceType = hasProject ? 'project_order' : 'product_order';
      const movementCount = await countStockMovement(sourceType, order.id, movementType);
      const commissionCount = await countCommissionByOrder(order.id);
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        orderKind: order.orderKind,
        hasProject,
        hasProduct,
        hasPayment: order.paymentRecords.length > 0,
        hasStockMovement: movementCount > 0,
        movementCount,
        commissionCount,
      };
    }),
  );
  const required = {
    hasProjectOrder: details.some((item) => item.hasProject),
    hasProductOrder: details.some((item) => item.hasProduct),
    sameCheckoutGroupNo: groupOrders.every((order: any) => order.checkoutGroupNo === checkoutGroupNo),
    eachOrderHasPayment: details.every((item) => item.hasPayment),
    eachOrderHasStockMovement: details.every((item) => item.hasStockMovement),
    eachOrderHasCommission: details.every((item) => item.commissionCount > 0),
  };
  const ok = Object.values(required).every(Boolean);
  return ok
    ? pass('terminal-mixed-checkout', '终端混合收银样本字段完整', { checkoutGroupNo, ...required, orders: details })
    : fail('terminal-mixed-checkout', '终端混合收银样本存在字段或副作用缺口', { checkoutGroupNo, ...required, orders: details });
}

function firstCardProject(card: any) {
  const projects = Array.isArray(card?.card?.projects) ? card.card.projects : Array.isArray(card?.projects) ? card.projects : [];
  return projects.find((item: any) => item?.projectId || item?.id || item?.projectName || item?.name);
}

async function resolveCardProject(storeId: number, cardProject: any) {
  const directId = Number(cardProject?.projectId ?? cardProject?.id);
  if (directId > 0) return { ...cardProject, projectId: directId };
  const projectName = String(cardProject?.projectName ?? cardProject?.name ?? '').trim();
  if (!projectName) return cardProject;
  const project = await prisma.project.findFirst({
    where: { storeId, name: projectName, deletedAt: null },
    select: { id: true, name: true },
  });
  return project ? { ...cardProject, projectId: project.id, projectName: project.name } : cardProject;
}

async function findProjectWithBomStock(storeId: number) {
  const projects = await prisma.project.findMany({
    where: { storeId, status: 'active', deletedAt: null, bomItems: { some: {} } },
    select: {
      id: true,
      name: true,
      price: true,
      bomItems: {
        select: {
          productId: true,
          standardQty: true,
          product: { select: { id: true, name: true, currentStock: true, unit: true, deletedAt: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
    take: 50,
  });
  return (
    projects.find((project: any) =>
      project.bomItems.every((item: any) => money(item.product?.currentStock) >= Math.max(1, money(item.standardQty))),
    ) ?? projects[0] ?? null
  );
}

async function findProjectCommissionCandidate(storeId: number) {
  const assignments = await prisma.commissionRuleAssignment.findMany({
    where: {
      storeId,
      type: 'project',
      status: 'active',
      targetType: 'specific',
      targetId: { not: null },
      rule: { status: 'active' },
    },
    orderBy: { id: 'asc' },
    take: 200,
  });

  let fallback: { project: any; beautician: any } | null = null;
  for (const assignment of assignments) {
    const [project, beautician] = await Promise.all([
      prisma.project.findFirst({
        where: { id: Number(assignment.targetId), storeId, status: 'active', deletedAt: null, bomItems: { some: {} } },
        select: {
          id: true,
          name: true,
          price: true,
          bomItems: {
            select: {
              productId: true,
              standardQty: true,
              product: { select: { id: true, name: true, currentStock: true, unit: true, deletedAt: true } },
            },
          },
        },
      }),
      prisma.beautician.findFirst({
        where: { storeId, status: 'active', userId: Number(assignment.userId) },
        select: { id: true, name: true, userId: true, levelId: true },
      }),
    ]);
    if (!project || !beautician) continue;
    fallback ??= { project, beautician };
    const hasEnoughStock = project.bomItems.every((item: any) => money(item.product?.currentStock) >= Math.max(1, money(item.standardQty)));
    if (hasEnoughStock) return { project, beautician };
  }
  return fallback;
}

async function findCustomerCardWithProject(storeId: number) {
  const cards = await prisma.customerCard.findMany({
    where: {
      status: 'active',
      remainingTimes: { gt: 1 },
      expiryDate: { gt: new Date() },
      customer: { storeId, deletedAt: null },
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      card: { select: { id: true, name: true, projects: true } },
    },
    orderBy: [{ remainingTimes: 'desc' }, { id: 'asc' }],
    take: 50,
  });

  let fallback: { customerCard: any; cardProject: any } | null = null;
  for (const customerCard of cards) {
    const projects = Array.isArray(customerCard.card?.projects) ? customerCard.card.projects : [];
    for (const rawProject of projects) {
      const cardProject = await resolveCardProject(storeId, rawProject);
      const projectId = Number(cardProject?.projectId ?? cardProject?.id);
      if (!(projectId > 0)) continue;
      fallback ??= { customerCard, cardProject };
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          bomItems: {
            select: {
              standardQty: true,
              product: { select: { currentStock: true } },
            },
          },
        },
      });
      if (project?.bomItems?.length && project.bomItems.every((item: any) => money(item.product?.currentStock) >= Math.max(1, money(item.standardQty)))) {
        return { customerCard, cardProject };
      }
    }
  }
  return fallback;
}

async function buildSamplePlan(storeId: number): Promise<SamplePlan> {
  const [customer, fallbackBeautician, cardSelection, fallbackProject, projectCommissionCandidate, product, balanceAccount, terminalDevice] = await Promise.all([
    prisma.customer.findFirst({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true, phone: true, source: true },
      orderBy: { id: 'asc' },
    }),
    prisma.beautician.findFirst({
      where: { storeId, status: 'active' },
      select: { id: true, name: true, userId: true, levelId: true },
      orderBy: { id: 'asc' },
    }),
    findCustomerCardWithProject(storeId),
    findProjectWithBomStock(storeId),
    findProjectCommissionCandidate(storeId),
    prisma.product.findFirst({
      where: { storeId, status: 'active', deletedAt: null, currentStock: { gt: 0 } },
      select: { id: true, name: true, retailPrice: true, currentStock: true },
      orderBy: { id: 'asc' },
    }),
    prisma.customerBalanceAccount.findFirst({
      where: { storeId, status: 'active', customer: { deletedAt: null } },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { id: 'asc' },
    }),
    prisma.terminalDevice.findFirst({
      where: { storeId },
      select: { id: true, name: true, deviceCode: true, status: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  const beautician = projectCommissionCandidate?.beautician ?? fallbackBeautician;
  const project = projectCommissionCandidate?.project ?? fallbackProject;
  const customerCard = cardSelection?.customerCard ?? null;
  const cardProject = cardSelection?.cardProject ?? await resolveCardProject(storeId, firstCardProject(customerCard));
  const cardProjectId = Number(cardProject?.projectId ?? cardProject?.id);
  const sampleCustomer = balanceAccount?.customer ?? customer;
  const candidates = {
    customer,
    beautician,
    customerCard: customerCard
      ? {
          id: customerCard.id,
          customerId: customerCard.customerId,
          customerName: customerCard.customer?.name,
          cardId: customerCard.cardId,
          cardName: customerCard.cardName,
          remainingTimes: customerCard.remainingTimes,
          project: cardProject,
        }
      : null,
    project,
    product,
    balanceAccount: balanceAccount
      ? {
          id: balanceAccount.id,
          customerId: balanceAccount.customerId,
          customerName: balanceAccount.customer?.name,
          cashBalance: money(balanceAccount.cashBalance),
          giftBalance: money(balanceAccount.giftBalance),
        }
      : null,
    terminalDevice,
  };

  const actions = [
    {
      key: 'terminal-card-usage',
      title: '终端次卡核销样本',
      canRun: Boolean(customerCard && cardProjectId > 0 && beautician),
      missing: [
        !customerCard ? 'active customerCard with remainingTimes' : '',
        !(cardProjectId > 0) ? 'card projectId' : '',
        !beautician ? 'active beautician' : '',
      ].filter(Boolean),
      payload: {
        customerCardId: customerCard?.id,
        customerId: customerCard?.customerId,
        projectId: cardProjectId > 0 ? cardProjectId : undefined,
        projectName: cardProject?.projectName ?? cardProject?.name,
        times: 1,
        beauticianId: beautician?.id,
      },
    },
    {
      key: 'admin-card-usage',
      title: '管理端次卡核销样本',
      canRun: Boolean(customerCard && cardProjectId > 0 && beautician),
      missing: [
        !customerCard ? 'active customerCard with at least 2 remainingTimes' : '',
        !(cardProjectId > 0) ? 'card projectId' : '',
        !beautician ? 'active beautician' : '',
      ].filter(Boolean),
      payload: {
        customerCardId: customerCard?.id,
        customerId: customerCard?.customerId,
        projectId: cardProjectId > 0 ? cardProjectId : undefined,
        projectName: cardProject?.projectName ?? cardProject?.name,
        times: 1,
        beauticianId: beautician?.id,
      },
    },
    {
      key: 'terminal-customer-create',
      title: '终端客户登记样本',
      canRun: true,
      missing: [],
      payload: {
        name: `接口收敛终端样本${Date.now().toString(36).toUpperCase()}`,
        phone: `139${String(Date.now()).slice(-8)}`,
        gender: '女',
        source: 'terminal',
        skinCondition: '联调样本',
        tags: ['接口收敛验收'],
      },
    },
    {
      key: 'admin-customer-create',
      title: '管理端客户新建样本',
      canRun: true,
      missing: [],
      payload: {
        storeId,
        name: `接口收敛管理样本${Date.now().toString(36).toUpperCase()}`,
        phone: `137${String(Date.now()).slice(-8)}`,
        source: 'admin',
        skinType: '干性',
        skinCondition: '联调样本',
      },
    },
    {
      key: 'terminal-recharge',
      title: '终端充值样本',
      canRun: Boolean(sampleCustomer && beautician),
      missing: [!sampleCustomer ? 'customer' : '', !beautician ? 'active beautician' : ''].filter(Boolean),
      payload: {
        customerId: sampleCustomer?.id,
        customerName: sampleCustomer?.name,
        amount: 100,
        giftAmount: 10,
        paymentMethod: 'wechat',
        beauticianId: beautician?.id,
        remark: '接口收敛终端充值验收',
      },
    },
    {
      key: 'admin-recharge',
      title: '管理端充值样本',
      canRun: Boolean(balanceAccount && beautician),
      missing: [!balanceAccount ? 'customer balance account' : '', !beautician ? 'active beautician' : ''].filter(Boolean),
      payload: {
        accountId: balanceAccount?.id,
        rechargeAmount: 100,
        giftAmount: 10,
        paymentMethod: 'wechat',
        beauticianId: beautician?.id,
        remark: '接口收敛管理充值验收',
      },
    },
    {
      key: 'admin-project-checkout',
      title: '管理端项目订单样本',
      canRun: Boolean(sampleCustomer && project && beautician),
      missing: [!sampleCustomer ? 'customer' : '', !project ? 'project with BOM' : '', !beautician ? 'active beautician' : ''].filter(Boolean),
      payload: {
        customerId: sampleCustomer?.id,
        storeId,
        status: 'completed',
        paymentMethod: 'wechat',
        items: [{ projectId: project?.id, projectName: project?.name, quantity: 1, unitPrice: money(project?.price), beauticianId: beautician?.id }],
      },
    },
    {
      key: 'admin-product-checkout',
      title: '管理端商品订单样本',
      canRun: Boolean(sampleCustomer && product && beautician),
      missing: [!sampleCustomer ? 'customer' : '', !product ? 'active product with stock' : '', !beautician ? 'active beautician' : ''].filter(Boolean),
      payload: {
        customerId: sampleCustomer?.id,
        storeId,
        status: 'completed',
        paymentMethod: 'wechat',
        beauticianId: beautician?.id,
        items: [{ productId: product?.id, productName: product?.name, quantity: 1, unitPrice: money(product?.retailPrice) || 1, beauticianId: beautician?.id }],
      },
    },
    {
      key: 'terminal-mixed-checkout',
      title: '终端项目+商品混合收银样本',
      canRun: Boolean(sampleCustomer && project && product && beautician && terminalDevice),
      missing: [
        !sampleCustomer ? 'customer' : '',
        !project ? 'project with BOM' : '',
        !product ? 'active product with stock' : '',
        !beautician ? 'active beautician' : '',
        !terminalDevice ? 'terminal device' : '',
      ].filter(Boolean),
      payload: {
        storeId,
        deviceId: terminalDevice?.id,
        customerId: sampleCustomer?.id,
        customerName: sampleCustomer?.name,
        payMethod: 'wechat',
        beauticianId: beautician?.id,
        remark: '接口收敛终端混合收银验收',
        items: [
          { itemId: project?.id, itemType: 'project', name: project?.name, quantity: 1, unitPrice: money(project?.price), beauticianId: beautician?.id },
          { itemId: product?.id, itemType: 'product', name: product?.name, quantity: 1, unitPrice: money(product?.retailPrice) || 1 },
        ],
      },
    },
  ];

  return { candidates, actions };
}

async function main() {
  const args = parseArgs();
  const store = await findStore(args);
  if (!store) throw new Error(`Store not found: ${args.storeId ?? args.storeName}`);

  const checks = await Promise.all([
    verifyCardUsage(store.id, args, true),
    verifyCardUsage(store.id, args, false),
    verifyCustomer(store.id, args, true),
    verifyCustomer(store.id, args, false),
    verifyRecharge(store.id, args, true),
    verifyRecharge(store.id, args, false),
    verifyCheckout(store.id, args, 'terminal', 'project'),
    verifyCheckout(store.id, args, 'terminal', 'product'),
    verifyTerminalMixedCheckout(store.id, args),
    verifyCheckout(store.id, args, 'admin', 'project'),
    verifyCheckout(store.id, args, 'admin', 'product'),
  ]);

  const summary = {
    storeId: store.id,
    storeName: store.name,
    from: args.from.toISOString(),
    to: args.to.toISOString(),
    pass: checks.filter((item) => item.status === 'pass').length,
    warn: checks.filter((item) => item.status === 'warn').length,
    fail: checks.filter((item) => item.status === 'fail').length,
  };
  const samplePlan = await buildSamplePlan(store.id);

  console.log(JSON.stringify({ summary, checks, samplePlan }, null, 2));
  if (summary.fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
