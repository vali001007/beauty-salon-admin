import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { CardsService } from '../dist/cards/cards.service.js';
import { CommissionService } from '../dist/commission/commission.service.js';
import { CustomersService } from '../dist/customers/customers.service.js';
import { DiscountAllocationService } from '../dist/orders/discount-allocation.service.js';
import { OrdersService } from '../dist/orders/orders.service.js';
import { TerminalDashboardCacheService } from '../dist/terminal/terminal-dashboard-cache.service.js';
import { TerminalService } from '../dist/terminal/terminal.service.js';

type SampleAction = {
  key: string;
  title: string;
  canRun: boolean;
  missing: string[];
  payload: Record<string, unknown>;
  run: () => Promise<unknown>;
};

const DEFAULT_STORE_NAME = 'Ami 全量演示门店';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

const commissionService = new CommissionService(prisma);
const discountAllocationService = new DiscountAllocationService();
const customersService = new CustomersService(prisma);
const cardsService = new CardsService(prisma, commissionService);
const ordersService = new OrdersService(prisma, commissionService, discountAllocationService);
const terminalService = new TerminalService(
  prisma,
  {} as any,
  {} as any,
  commissionService,
  new TerminalDashboardCacheService(),
  undefined,
  discountAllocationService,
  cardsService,
  customersService,
  ordersService,
);

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function money(value: unknown) {
  return Number(value ?? 0);
}

function uniqueSuffix() {
  return Date.now().toString(36).toUpperCase();
}

function createStockMovementNo(prefix = 'SM') {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function findStore() {
  const storeId = argValue('storeId') ? Number(argValue('storeId')) : undefined;
  if (storeId) return prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
  const storeName = argValue('storeName') ?? DEFAULT_STORE_NAME;
  return prisma.store.findFirst({ where: { name: storeName, deletedAt: null } });
}

function firstCardProject(card: any) {
  const projects = Array.isArray(card?.card?.projects) ? card.card.projects : [];
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

async function ensureBomStockForProjectUses(storeId: number, projectUses: Map<number, number>) {
  const preparations: Array<Record<string, unknown>> = [];
  for (const [projectId, uses] of projectUses.entries()) {
    if (!(projectId > 0) || uses <= 0) continue;
    const project = await prisma.project.findFirst({
      where: { id: projectId, storeId, deletedAt: null },
      select: {
        id: true,
        name: true,
        bomItems: {
          select: {
            productId: true,
            standardQty: true,
            product: { select: { id: true, name: true, unit: true, currentStock: true, deletedAt: true } },
          },
        },
      },
    });
    if (!project?.bomItems?.length) continue;

    await prisma.$transaction(async (tx: any) => {
      for (const item of project.bomItems) {
        if (!item.product || item.product.deletedAt) continue;
        const requiredQty = Math.max(1, money(item.standardQty)) * uses;
        const beforeStock = money(item.product.currentStock);
        if (beforeStock >= requiredQty) continue;
        const topUpQty = requiredQty - beforeStock;
        await tx.stockMovement.create({
          data: {
            storeId,
            productId: item.product.id,
            movementNo: createStockMovementNo('SM'),
            movementType: 'stocktake_gain',
            quantity: topUpQty,
            beforeStock,
            afterStock: requiredQty,
            unit: item.product.unit,
            sourceType: 'business_interface_acceptance',
            sourceId: project.id,
            sourceNo: `BIC-${uniqueSuffix()}`,
            remark: `接口收敛验收样本补充BOM库存：${project.name}`,
          },
        });
        await tx.product.update({ where: { id: item.product.id }, data: { currentStock: requiredQty } });
        preparations.push({
          projectId: project.id,
          projectName: project.name,
          productId: item.product.id,
          productName: item.product.name,
          beforeStock,
          topUpQty,
          afterStock: requiredQty,
        });
      }
    });
  }
  return preparations;
}

async function buildActions(storeId: number): Promise<{ candidates: Record<string, unknown>; actions: SampleAction[]; prepareStock: (selectedKeys: Set<string>) => Promise<Array<Record<string, unknown>>> }> {
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
  const suffix = uniqueSuffix();
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

  const actions: SampleAction[] = [
    {
      key: 'terminal-card-usage',
      title: '终端次卡核销样本',
      canRun: Boolean(customerCard && cardProjectId > 0 && beautician && terminalDevice),
      missing: [
        !customerCard ? 'active customerCard with remainingTimes' : '',
        !(cardProjectId > 0) ? 'card projectId' : '',
        !beautician ? 'active beautician' : '',
        !terminalDevice ? 'terminal device' : '',
      ].filter(Boolean),
      payload: {
        customerCardId: customerCard?.id,
        customerId: customerCard?.customerId,
        projectId: cardProjectId > 0 ? cardProjectId : undefined,
        times: 1,
        beauticianId: beautician?.id,
        operatorId: beautician?.userId,
        deviceId: terminalDevice?.id,
      },
      run: () =>
        terminalService.consumeCard(
          {
            customerCardId: customerCard!.id,
            customerId: customerCard!.customerId,
            projectId: cardProjectId,
            times: 1,
            beauticianId: beautician!.id,
            operatorId: beautician?.userId ?? undefined,
          },
          terminalDevice!.id,
        ),
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
        operatorId: beautician?.userId,
      },
      run: () =>
        cardsService.verifyCardUsage({
          customerCardId: customerCard!.id,
          customerId: customerCard!.customerId,
          projectId: cardProjectId,
          projectName: cardProject?.projectName ?? cardProject?.name,
          times: 1,
          beauticianId: beautician!.id,
          operatorId: beautician?.userId ?? undefined,
        }),
    },
    {
      key: 'terminal-customer-create',
      title: '终端客户登记样本',
      canRun: true,
      missing: [],
      payload: {
        name: `接口收敛终端样本${suffix}`,
        phone: `139${String(Date.now()).slice(-8)}`,
        gender: '女',
        source: 'terminal',
        skinCondition: '联调样本',
        tags: ['接口收敛验收'],
      },
      run: () =>
        terminalService.quickCreateCustomer(storeId, {
          name: `接口收敛终端样本${suffix}`,
          phone: `139${String(Date.now()).slice(-8)}`,
          gender: '女',
          source: 'terminal',
          skinCondition: '联调样本',
          tags: ['接口收敛验收'],
        }),
    },
    {
      key: 'admin-customer-create',
      title: '管理端客户新建样本',
      canRun: true,
      missing: [],
      payload: {
        storeId,
        name: `接口收敛管理样本${suffix}`,
        phone: `137${String(Date.now()).slice(-8)}`,
        source: 'admin',
        skinType: '干性',
        skinCondition: '联调样本',
      },
      run: () =>
        customersService.create({
          storeId,
          name: `接口收敛管理样本${suffix}`,
          phone: `137${String(Date.now()).slice(-8)}`,
          source: 'admin',
          skinType: '干性',
          skinCondition: '联调样本',
        }),
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
      run: () =>
        terminalService.createRechargeOrder(storeId, {
          customerId: sampleCustomer!.id,
          customerName: sampleCustomer!.name,
          customerPhone: sampleCustomer!.phone,
          amount: 100,
          giftAmount: 10,
          paymentMethod: 'wechat',
          beauticianId: beautician!.id,
          remark: '接口收敛终端充值验收',
        }),
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
      run: () =>
        ordersService.rechargeMemberCard(
          balanceAccount!.id,
          {
            rechargeAmount: 100,
            giftAmount: 10,
            paymentMethod: 'wechat',
            beauticianId: beautician!.id,
            remark: '接口收敛管理充值验收',
          },
          beautician?.userId ?? undefined,
        ),
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
      run: () =>
        ordersService.createProjectOrder({
          customerId: sampleCustomer!.id,
          storeId,
          status: 'completed',
          paymentMethod: 'wechat',
          items: [{ projectId: project!.id, projectName: project!.name, quantity: 1, unitPrice: money(project!.price), beauticianId: beautician!.id }],
          remark: '接口收敛管理项目订单验收',
        }),
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
      run: () =>
        ordersService.createProductOrder({
          customerId: sampleCustomer!.id,
          storeId,
          status: 'completed',
          paymentMethod: 'wechat',
          beauticianId: beautician!.id,
          items: [{ productId: product!.id, productName: product!.name, quantity: 1, unitPrice: money(product!.retailPrice) || 1, beauticianId: beautician!.id }],
          remark: '接口收敛管理商品订单验收',
        }),
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
      run: async () => {
        await commissionService.openCashierShift({
          storeId,
          deviceId: terminalDevice!.id,
          operatorType: 'device',
          openingCash: 0,
        });
        return terminalService.checkout(
          storeId,
          {
            customerId: sampleCustomer!.id,
            customerName: sampleCustomer!.name,
            customerPhone: sampleCustomer!.phone,
            payMethod: 'wechat',
            beauticianId: beautician!.id,
            remark: '接口收敛终端混合收银验收',
            items: [
              { itemId: project!.id, itemType: 'project', name: project!.name, quantity: 1, unitPrice: money(project!.price), beauticianId: beautician!.id },
              { itemId: product!.id, itemType: 'product', name: product!.name, quantity: 1, unitPrice: money(product!.retailPrice) || 1 },
            ],
          },
          terminalDevice!.id,
        );
      },
    },
  ];

  const prepareStock = (selectedKeys: Set<string>) => {
    const projectUses = new Map<number, number>();
    const addProjectUse = (projectId: number, uses = 1) => {
      if (!(projectId > 0)) return;
      projectUses.set(projectId, (projectUses.get(projectId) ?? 0) + uses);
    };
    if (selectedKeys.has('terminal-card-usage')) addProjectUse(cardProjectId, 1);
    if (selectedKeys.has('admin-card-usage')) addProjectUse(cardProjectId, 1);
    if (selectedKeys.has('admin-project-checkout')) addProjectUse(Number(project?.id), 1);
    if (selectedKeys.has('terminal-mixed-checkout')) addProjectUse(Number(project?.id), 1);
    return ensureBomStockForProjectUses(storeId, projectUses);
  };

  return { candidates, actions, prepareStock };
}

function serializeAction(action: SampleAction) {
  return {
    key: action.key,
    title: action.title,
    canRun: action.canRun,
    missing: action.missing,
    payload: action.payload,
  };
}

async function main() {
  const execute = hasFlag('execute');
  const confirmed = hasFlag('confirm-write-samples');
  const only = new Set(
    (argValue('only') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const store = await findStore();
  if (!store) throw new Error(`Store not found: ${argValue('storeId') ?? argValue('storeName') ?? DEFAULT_STORE_NAME}`);

  const { candidates, actions, prepareStock } = await buildActions(store.id);
  const selected = actions.filter((action) => !only.size || only.has(action.key));
  const plan = {
    mode: execute ? 'execute' : 'dry-run',
    store: { id: store.id, name: store.name },
    candidates,
    actions: selected.map(serializeAction),
    writeGuard: 'Pass --execute --confirm-write-samples to create real business samples.',
  };

  if (!execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (!confirmed) throw new Error('Writing real samples requires --confirm-write-samples');

  const results: Array<Record<string, unknown>> = [];
  const stockPreparation = await prepareStock(new Set(selected.map((action) => action.key)));
  if (stockPreparation.length > 0) {
    results.push({ key: 'acceptance-stock-preparation', status: 'created', movements: stockPreparation });
  }
  for (const action of selected) {
    if (!action.canRun) {
      results.push({ key: action.key, status: 'skipped', missing: action.missing });
      continue;
    }
    const result = await action.run();
    results.push({ key: action.key, status: 'created', result });
  }

  console.log(JSON.stringify({ ...plan, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
