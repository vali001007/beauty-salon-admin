import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type MetricTone = 'primary' | 'rose' | 'amber' | 'slate';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview(storeId?: number) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const expiringBefore = new Date(todayStart);
    expiringBefore.setDate(expiringBefore.getDate() + 30);

    const scopedStore = storeId
      ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
      : null;
    const customerWhere = { deletedAt: null, ...(storeId ? { storeId } : {}) };
    const productWhere = { deletedAt: null, ...(storeId ? { storeId } : {}) };
    const orderStoreWhere = storeId ? { storeId } : {};
    const activeOrderStatuses = ['completed', 'paid', '已完成', '已付款'];

    const [
      totalCustomers,
      monthNewCustomers,
      todayProductIncome,
      yesterdayProductIncome,
      todayCardOrders,
      yesterdayCardOrders,
      products,
      expiringBatchCount,
      activeActivities,
      todayReservations,
      pendingTasks,
      onlineTerminals,
    ] = await Promise.all([
      this.prisma.customer.count({ where: customerWhere }),
      this.prisma.customer.count({ where: { ...customerWhere, createdAt: { gte: monthStart } } }),
      this.prisma.productOrder.aggregate({
        where: {
          ...orderStoreWhere,
          status: { in: activeOrderStatuses },
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.productOrder.aggregate({
        where: {
          ...orderStoreWhere,
          status: { in: activeOrderStatuses },
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.customerCard.findMany({
        where: {
          createdAt: { gte: todayStart, lt: tomorrowStart },
          ...(storeId ? { customer: { storeId } } : {}),
        },
        include: { card: { select: { price: true } } },
      }),
      this.prisma.customerCard.findMany({
        where: {
          createdAt: { gte: yesterdayStart, lt: todayStart },
          ...(storeId ? { customer: { storeId } } : {}),
        },
        include: { card: { select: { price: true } } },
      }),
      this.prisma.product.findMany({
        where: productWhere,
        select: { currentStock: true, safetyStock: true },
      }),
      this.prisma.stockBatch.count({
        where: {
          expiryDate: { gte: todayStart, lte: expiringBefore },
          product: productWhere,
        },
      }),
      this.prisma.marketingActivity.count({
        where: { status: { in: ['active', 'enabled', 'running', 'published', '进行中'] } },
      }),
      this.prisma.reservation.count({
        where: {
          ...(storeId ? { storeId } : {}),
          date: { gte: todayStart, lt: tomorrowStart },
          status: { in: ['pending', 'confirmed', '进行中', '待确认', '已确认'] },
        },
      }),
      this.prisma.serviceTask.count({
        where: {
          ...(storeId ? { storeId } : {}),
          status: { in: ['pending', 'in_progress'] },
        },
      }),
      this.prisma.terminalDevice.count({
        where: { ...(storeId ? { storeId } : {}), status: 'online' },
      }),
    ]);

    const lowStockCount = products.filter((product) => this.toNumber(product.currentStock) < this.toNumber(product.safetyStock)).length;
    const todayIncome = this.toNumber(todayProductIncome._sum.totalAmount) + this.sumCardOrders(todayCardOrders);
    const yesterdayIncome = this.toNumber(yesterdayProductIncome._sum.totalAmount) + this.sumCardOrders(yesterdayCardOrders);
    const incomeHint = yesterdayIncome > 0
      ? `较昨日 ${this.formatPercent((todayIncome - yesterdayIncome) / yesterdayIncome)}`
      : '今日开卡/收银汇总';

    const inventoryWarningCount = lowStockCount + expiringBatchCount;
    const scopeName = scopedStore?.name ?? (storeId ? `门店 ${storeId}` : '全部门店');

    return {
      scope: {
        storeId: storeId ?? null,
        storeName: scopeName,
        mode: storeId ? 'store' : 'all',
      },
      metrics: [
        this.metric('customers', '总客户数', this.formatNumber(totalCustomers), `本月新增 ${monthNewCustomers} 人`, 'primary', '/customers/data'),
        this.metric('income', '今日收入', this.formatMoney(todayIncome), incomeHint, 'rose', '/orders/products'),
        this.metric('inventory', '库存预警', String(inventoryWarningCount), `低库存 ${lowStockCount} / 临期 ${expiringBatchCount}`, 'amber', '/inventory/stock'),
        this.metric('campaigns', '进行中活动', String(activeActivities), storeId ? '全局活动，暂未绑定门店' : '全部门店活动', 'slate', '/customer-marketing/activity-management'),
      ],
      priorities: [
        {
          key: 'inventory',
          title: inventoryWarningCount > 0 ? `${inventoryWarningCount} 个库存项需要处理` : '库存状态正常',
          detail: lowStockCount > 0
            ? `${lowStockCount} 个商品低于安全库存，${expiringBatchCount} 个批次 30 天内临期。`
            : '当前门店商品库存均高于安全库存线。',
          tag: '库存',
          path: '/inventory/stock',
        },
        {
          key: 'reservation',
          title: todayReservations > 0 ? `今日 ${todayReservations} 个预约待跟进` : '今日暂无待跟进预约',
          detail: pendingTasks > 0 ? `还有 ${pendingTasks} 个服务任务处于待服务或进行中。` : '预约和服务任务暂无积压。',
          tag: '服务',
          path: '/stores/reservations',
        },
        {
          key: 'terminal',
          title: onlineTerminals > 0 ? `${onlineTerminals} 台 Ami Aura Lite 在线` : 'Ami Aura Lite 暂无在线设备',
          detail: storeId ? `${scopeName} 的终端、预约、核销和收银数据按门店同步。` : '当前为全部门店汇总口径，切换门店可查看单店数据。',
          tag: '终端',
          path: '/stores/reservations',
        },
      ],
      ai: {
        conclusion: inventoryWarningCount > 0 ? '优先处理库存预警和今日服务任务。' : '当前经营状态平稳，可重点推进客户复购和活动转化。',
        basis: `当前口径：${scopeName}；已综合客户、开卡/收银、库存、预约、服务任务和终端状态。`,
        action: inventoryWarningCount > 0 ? '查看库存预警' : '查看智能建议',
        path: inventoryWarningCount > 0 ? '/inventory/stock' : '/customer-marketing/intelligent-recommendation',
      },
      generatedAt: now.toISOString(),
    };
  }

  private metric(key: string, label: string, value: string, hint: string, tone: MetricTone, path: string) {
    return { key, label, value, hint, tone, path };
  }

  private sumCardOrders(items: Array<{ card?: { price: unknown } }>) {
    return items.reduce((sum, item) => sum + this.toNumber(item.card?.price), 0);
  }

  private toNumber(value: unknown) {
    return Number(value ?? 0);
  }

  private formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
  }

  private formatMoney(value: number) {
    return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  }

  private formatPercent(value: number) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(1)}%`;
  }
}
