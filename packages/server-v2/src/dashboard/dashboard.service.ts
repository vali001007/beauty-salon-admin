import { ForbiddenException, Injectable } from '@nestjs/common';
import { ServiceTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AdminWorkbenchRole,
  DashboardWorkbenchContext,
  WorkbenchInsight,
  WorkbenchJwtUser,
  WorkbenchMetric,
  WorkbenchMetricTone,
  WorkbenchOverview,
  WorkbenchQuickAction,
  WorkbenchScope,
  WorkbenchSeverity,
  WorkbenchTodo,
} from './dashboard-workbench.types.js';

type StoreIdScope = {
  storeId?: number | { in: number[] };
};

type DateRanges = {
  now: Date;
  todayStart: Date;
  tomorrowStart: Date;
  yesterdayStart: Date;
  monthStart: Date;
  expiringBefore: Date;
};

type CommonStats = {
  totalCustomers: number;
  monthNewCustomers: number;
  todayIncome: number;
  yesterdayIncome: number;
  incomeHint: string;
  lowStockCount: number;
  expiringBatchCount: number;
  inventoryWarningCount: number;
  activeActivities: number;
  todayReservations: number;
  pendingReservations: number;
  pendingCheckIn: number;
  pendingTasks: number;
  inProgressTasks: number;
  todayCardUsage: number;
  todayNewCustomers: number;
  pendingPurchaseOrders: number;
  pendingTransferOrders: number;
  activeStores: number;
  totalTerminals: number;
  onlineTerminals: number;
  offlineTerminals: number;
};

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview(storeId?: number) {
    const scopedStore = storeId
      ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
      : null;
    const scopeName = scopedStore?.name ?? (storeId ? `门店 ${storeId}` : '全部门店');
    const context = this.buildSystemContext({
      scope: {
        storeId: storeId ?? null,
        storeName: scopeName,
        mode: storeId ? 'store' : 'all',
      },
    });
    const ranges = this.getDateRanges();
    const stats = await this.collectCommonStats(context, ranges);

    return {
      scope: {
        storeId: storeId ?? null,
        storeName: scopeName,
        mode: storeId ? 'store' : 'all',
      },
      metrics: [
        this.overviewMetric(
          'customers',
          '总客户数',
          this.formatNumber(stats.totalCustomers),
          `本月新增 ${stats.monthNewCustomers} 人`,
          'primary',
          '/customers/data',
        ),
        this.overviewMetric('income', '今日收入', this.formatMoney(stats.todayIncome), stats.incomeHint, 'rose', '/orders/products'),
        this.overviewMetric(
          'inventory',
          '库存预警',
          String(stats.inventoryWarningCount),
          `低库存 ${stats.lowStockCount} / 临期 ${stats.expiringBatchCount}`,
          'amber',
          '/inventory/stock',
        ),
        this.overviewMetric(
          'campaigns',
          '进行中活动',
          String(stats.activeActivities),
          storeId ? '当前门店活动' : '全部门店活动',
          'slate',
          '/customer-marketing/activity-management',
        ),
      ],
      priorities: [
        {
          key: 'inventory',
          title: stats.inventoryWarningCount > 0 ? `${stats.inventoryWarningCount} 个库存项需要处理` : '库存状态正常',
          detail:
            stats.inventoryWarningCount > 0
              ? `${stats.lowStockCount} 个商品低于安全库存，${stats.expiringBatchCount} 个批次 30 天内临期。`
              : '当前门店商品库存均高于安全库存线。',
          tag: '库存',
          path: '/inventory/stock',
        },
        {
          key: 'reservation',
          title: stats.todayReservations > 0 ? `今日 ${stats.todayReservations} 个预约待跟进` : '今日暂无待跟进预约',
          detail:
            stats.pendingTasks > 0
              ? `还有 ${stats.pendingTasks} 个服务任务处于待服务或进行中。`
              : '预约和服务任务暂无积压。',
          tag: '服务',
          path: '/stores/reservations',
        },
        {
          key: 'terminal',
          title: stats.onlineTerminals > 0 ? `${stats.onlineTerminals} 台 Ami Aura Lite 在线` : 'Ami Aura Lite 暂无在线设备',
          detail: storeId
            ? `${scopeName} 的终端、预约、核销和收银数据按门店同步。`
            : '当前为全部门店汇总口径，切换门店可查看单店数据。',
          tag: '终端',
          path: '/stores/reservations',
        },
      ],
      ai: {
        conclusion:
          stats.inventoryWarningCount > 0 ? '优先处理库存预警和今日服务任务。' : '当前经营状态平稳，可重点推进客户复购和活动转化。',
        basis: `当前口径：${scopeName}；已综合客户、开卡/收银、库存、预约、服务任务和终端状态。`,
        action: stats.inventoryWarningCount > 0 ? '查看库存预警' : '查看智能建议',
        path: stats.inventoryWarningCount > 0 ? '/inventory/stock' : '/customer-marketing/intelligent-recommendation',
      },
      terminalStatus: {
        totalDevices: stats.totalTerminals,
        onlineDevices: stats.onlineTerminals,
      },
      generatedAt: ranges.now.toISOString(),
    };
  }

  async getWorkbench(params: {
    user: WorkbenchJwtUser;
    storeId?: number;
    role?: string;
  }): Promise<WorkbenchOverview> {
    const context = await this.resolveWorkbenchContext(params.user, params.storeId, params.role);
    switch (context.actor.currentRole) {
      case 'super_admin':
        return this.buildSuperAdminWorkbench(context);
      case 'store_manager':
        return this.buildStoreManagerWorkbench(context);
      case 'cashier':
        return this.buildCashierWorkbench(context);
      case 'beautician':
        return this.buildBeauticianWorkbench(context);
      case 'inventory_manager':
        return this.buildInventoryWorkbench(context);
      default:
        return this.buildDefaultWorkbench(context);
    }
  }

  private async buildStoreManagerWorkbench(context: DashboardWorkbenchContext): Promise<WorkbenchOverview> {
    const ranges = this.getDateRanges();
    const stats = await this.collectCommonStats(context, ranges);
    return this.finalizeWorkbench(
      context,
      [
        this.metric('incomeToday', '今日收入', this.formatMoney(stats.todayIncome), stats.incomeHint, 'rose', '/orders/products', 'core:order:products'),
        this.metric(
          'todayReservations',
          '今日预约',
          String(stats.todayReservations),
          `待确认 ${stats.pendingReservations} / 待到店 ${stats.pendingCheckIn}`,
          'primary',
          '/stores/reservations',
          'core:store:reservations',
          stats.pendingReservations > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'pendingServices',
          '待服务任务',
          String(stats.pendingTasks),
          `进行中 ${stats.inProgressTasks}`,
          'slate',
          '/orders/card-usage',
          'core:order:card-usage',
          stats.pendingTasks > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'inventoryAlerts',
          '库存预警',
          String(stats.inventoryWarningCount),
          `低库存 ${stats.lowStockCount} / 临期 ${stats.expiringBatchCount}`,
          'amber',
          '/inventory/stock',
          'core:inventory:stock',
          stats.inventoryWarningCount >= 5 ? 'critical' : stats.inventoryWarningCount > 0 ? 'warning' : 'normal',
        ),
      ],
      [
        this.todo(
          'manager-inventory',
          'inventory',
          stats.inventoryWarningCount > 0 ? `${stats.inventoryWarningCount} 个库存项需要处理` : '库存状态正常',
          stats.inventoryWarningCount > 0
            ? `${stats.lowStockCount} 个商品低于安全库存，${stats.expiringBatchCount} 个批次 30 天内临期。`
            : '当前门店商品库存均高于安全库存线。',
          '库存',
          stats.inventoryWarningCount >= 5 ? 'critical' : stats.inventoryWarningCount > 0 ? 'warning' : 'normal',
          stats.inventoryWarningCount > 0 ? 95 : 20,
          '/inventory/stock',
          'core:inventory:stock',
          '查看库存预警',
          stats.inventoryWarningCount,
        ),
        this.todo(
          'manager-reservation',
          'reservation',
          stats.pendingReservations > 0 ? `${stats.pendingReservations} 个预约待确认` : '今日预约确认正常',
          `今日共 ${stats.todayReservations} 个预约，待到店 ${stats.pendingCheckIn} 个。`,
          '预约',
          stats.pendingReservations > 0 ? 'warning' : 'normal',
          stats.pendingReservations > 0 ? 85 : 15,
          '/stores/reservations',
          'core:store:reservations',
          '处理预约',
          stats.pendingReservations,
        ),
        this.todo(
          'manager-service',
          'service',
          stats.pendingTasks > 0 ? `${stats.pendingTasks} 个服务任务待推进` : '服务任务暂无积压',
          `进行中服务 ${stats.inProgressTasks} 个，请关注服务完成和记录补充。`,
          '服务',
          stats.pendingTasks > 0 ? 'warning' : 'normal',
          stats.pendingTasks > 0 ? 80 : 10,
          '/orders/card-usage',
          'core:order:card-usage',
          '查看服务任务',
          stats.pendingTasks,
        ),
        this.todo(
          'manager-marketing',
          'marketing',
          stats.activeActivities > 0 ? `${stats.activeActivities} 个营销活动进行中` : '暂无进行中营销活动',
          '可进入营销工作台查看增长机会和自动触达建议。',
          '营销',
          'normal',
          stats.activeActivities > 0 ? 50 : 8,
          '/customer-marketing/workbench',
          'core:marketing:view',
          '查看营销工作台',
          stats.activeActivities,
        ),
      ],
      this.storeManagerActions(),
      {
        conclusion:
          stats.inventoryWarningCount > 0 || stats.pendingReservations > 0
            ? '优先处理库存预警和待确认预约。'
            : '当前门店经营状态平稳，可推进客户复购和活动转化。',
        basis: `今日收入 ${this.formatMoney(stats.todayIncome)}，预约 ${stats.todayReservations} 个，库存预警 ${stats.inventoryWarningCount} 个。`,
        action: stats.inventoryWarningCount > 0 ? '查看库存预警' : '查看项目预约',
        path: stats.inventoryWarningCount > 0 ? '/inventory/stock' : '/stores/reservations',
        permission: stats.inventoryWarningCount > 0 ? 'core:inventory:stock' : 'core:store:reservations',
      },
      stats,
      ranges.now,
    );
  }

  private async buildCashierWorkbench(context: DashboardWorkbenchContext): Promise<WorkbenchOverview> {
    const ranges = this.getDateRanges();
    const stats = await this.collectCommonStats(context, ranges);
    return this.finalizeWorkbench(
      context,
      [
        this.metric(
          'todayReservations',
          '今日预约',
          String(stats.todayReservations),
          `待确认 ${stats.pendingReservations}`,
          'primary',
          '/stores/reservations',
          'core:store:reservations',
        ),
        this.metric(
          'pendingCheckIn',
          '待到店',
          String(stats.pendingCheckIn),
          '今日未到店预约',
          'amber',
          '/stores/reservations',
          'core:store:reservations',
          stats.pendingCheckIn > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'pendingCardUsage',
          '待核销',
          String(stats.pendingTasks),
          `今日已核销 ${stats.todayCardUsage} 次`,
          'slate',
          '/orders/card-usage',
          'core:order:card-usage',
          stats.pendingTasks > 0 ? 'warning' : 'normal',
        ),
        this.metric('cashierToday', '今日收银', this.formatMoney(stats.todayIncome), stats.incomeHint, 'rose', '/orders/products', 'core:order:products'),
      ],
      [
        this.todo(
          'cashier-checkin',
          'reservation',
          stats.pendingCheckIn > 0 ? `${stats.pendingCheckIn} 个预约待到店` : '今日预约到店节奏正常',
          `今日共 ${stats.todayReservations} 个预约，优先处理即将到店和已到店顾客。`,
          '到店',
          stats.pendingCheckIn > 0 ? 'warning' : 'normal',
          stats.pendingCheckIn > 0 ? 95 : 20,
          '/stores/reservations',
          'core:store:reservations',
          '处理到店预约',
          stats.pendingCheckIn,
        ),
        this.todo(
          'cashier-card-usage',
          'order',
          stats.pendingTasks > 0 ? `${stats.pendingTasks} 个服务/核销任务待处理` : '暂无待核销积压',
          `今日已完成核销 ${stats.todayCardUsage} 次。`,
          '核销',
          stats.pendingTasks > 0 ? 'warning' : 'normal',
          stats.pendingTasks > 0 ? 85 : 15,
          '/orders/card-usage',
          'core:order:card-usage',
          '进入次卡核销',
          stats.pendingTasks,
        ),
        this.todo(
          'cashier-customer',
          'customer',
          stats.todayNewCustomers > 0 ? `今日新增 ${stats.todayNewCustomers} 个客户` : '今日暂无新客登记',
          '如有新客到店，先补齐基础资料再开单或预约。',
          '客户',
          'normal',
          stats.todayNewCustomers > 0 ? 45 : 8,
          '/customers/data',
          'core:customer:view',
          '查看客户数据',
          stats.todayNewCustomers,
        ),
      ],
      this.cashierActions(),
      {
        conclusion: stats.pendingCheckIn > 0 ? '优先处理待到店和待核销事项。' : '前台今日节奏正常，可继续处理登记和收银。',
        basis: `今日预约 ${stats.todayReservations} 个，待到店 ${stats.pendingCheckIn} 个，待服务/核销 ${stats.pendingTasks} 个。`,
        action: '进入项目预约',
        path: '/stores/reservations',
        permission: 'core:store:reservations',
      },
      stats,
      ranges.now,
    );
  }

  private async buildBeauticianWorkbench(context: DashboardWorkbenchContext): Promise<WorkbenchOverview> {
    const ranges = this.getDateRanges();
    const stats = await this.collectCommonStats(context, ranges);
    const beautician = await this.resolveBeauticianForUser(context);
    const scopedStore = this.storeScope(context);
    const beauticianWhere = beautician ? { beauticianId: beautician.id } : { beauticianId: -1 };
    const [myReservations, pendingServices, inProgressServices, commission] = await Promise.all([
      this.prisma.reservation.count({
        where: {
          ...scopedStore,
          ...beauticianWhere,
          date: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
          status: { in: this.activeReservationStatuses() },
        },
      }),
      this.prisma.serviceTask.count({
        where: {
          ...scopedStore,
          ...beauticianWhere,
          status: { in: this.pendingServiceTaskStatuses() },
        },
      }),
      this.prisma.serviceTask.count({
        where: {
          ...scopedStore,
          ...beauticianWhere,
          status: ServiceTaskStatus.in_progress,
        },
      }),
      beautician
        ? this.prisma.commissionRecord.aggregate({
            where: {
              ...scopedStore,
              beauticianId: beautician.id,
              createdAt: { gte: ranges.monthStart },
            },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: 0 } }),
    ]);
    const commissionAmount = this.toNumber(commission._sum.amount);

    return this.finalizeWorkbench(
      context,
      [
        this.metric('myReservations', '我的预约', String(myReservations), beautician ? '今日本人预约' : '未绑定美容师档案', 'primary', '/stores/scheduling', 'core:store:scheduling'),
        this.metric(
          'pendingServices',
          '待完成服务',
          String(pendingServices),
          `进行中 ${inProgressServices}`,
          'rose',
          '/orders/card-usage',
          'terminal:service:view',
          pendingServices > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'serviceRecordsTodo',
          '待补记录',
          String(inProgressServices),
          '完成服务后及时补充记录',
          'amber',
          '/orders/card-usage',
          'terminal:service:view',
          inProgressServices > 0 ? 'warning' : 'normal',
        ),
        this.metric('myCommission', '我的提成', this.formatMoney(commissionAmount), '本月累计', 'slate', '/finance/commission-records', 'core:finance:view'),
      ],
      [
        this.todo(
          'beautician-binding',
          'system',
          beautician ? '美容师档案已匹配' : '当前账号未匹配美容师档案',
          beautician ? '工作台已按本人预约和服务任务聚合。' : '请联系管理员在美容师管理中绑定同名或同手机号档案。',
          '档案',
          beautician ? 'normal' : 'warning',
          beautician ? 5 : 95,
          '/stores/beauticians',
          'core:store:beauticians',
          '查看美容师管理',
        ),
        this.todo(
          'beautician-service',
          'service',
          pendingServices > 0 ? `${pendingServices} 个服务待完成` : '暂无待完成服务',
          `进行中服务 ${inProgressServices} 个，完成后记得补服务记录。`,
          '服务',
          pendingServices > 0 ? 'warning' : 'normal',
          pendingServices > 0 ? 85 : 15,
          '/orders/card-usage',
          'terminal:service:view',
          '查看服务记录',
          pendingServices,
        ),
        this.todo(
          'beautician-schedule',
          'reservation',
          myReservations > 0 ? `今日 ${myReservations} 个本人预约` : '今日暂无本人预约',
          '请关注预约时间，提前准备项目和客户护理建议。',
          '预约',
          myReservations > 0 ? 'normal' : 'normal',
          myReservations > 0 ? 65 : 10,
          '/stores/scheduling',
          'core:store:scheduling',
          '查看我的排班',
          myReservations,
        ),
      ],
      this.beauticianActions(),
      {
        conclusion: beautician ? '优先完成当前服务并补充服务记录。' : '需要先绑定美容师档案，才能精准展示本人工作台。',
        basis: beautician
          ? `今日本人预约 ${myReservations} 个，待完成服务 ${pendingServices} 个。`
          : '当前用户无法通过姓名或手机号匹配到美容师档案。',
        action: beautician ? '查看我的排班' : '查看美容师管理',
        path: beautician ? '/stores/scheduling' : '/stores/beauticians',
        permission: beautician ? 'core:store:scheduling' : 'core:store:beauticians',
      },
      stats,
      ranges.now,
    );
  }

  private async buildInventoryWorkbench(context: DashboardWorkbenchContext): Promise<WorkbenchOverview> {
    const ranges = this.getDateRanges();
    const stats = await this.collectCommonStats(context, ranges);
    return this.finalizeWorkbench(
      context,
      [
        this.metric(
          'lowStock',
          '低库存',
          String(stats.lowStockCount),
          '低于安全库存',
          'amber',
          '/inventory/stock',
          'core:inventory:stock',
          stats.lowStockCount > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'expiringBatches',
          '临期批次',
          String(stats.expiringBatchCount),
          '30 天内到期',
          'rose',
          '/inventory/expiry',
          'core:inventory:expiry',
          stats.expiringBatchCount > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'purchasePending',
          '采购待处理',
          String(stats.pendingPurchaseOrders),
          '待下单 / 待入库',
          'primary',
          '/inventory/purchase',
          'core:inventory:purchase',
          stats.pendingPurchaseOrders > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'transferPending',
          '调拨待确认',
          String(stats.pendingTransferOrders),
          '跨店调拨处理中',
          'slate',
          '/inventory/transfer',
          'core:inventory:transfer',
          stats.pendingTransferOrders > 0 ? 'warning' : 'normal',
        ),
      ],
      [
        this.todo(
          'inventory-low-stock',
          'inventory',
          stats.lowStockCount > 0 ? `${stats.lowStockCount} 个商品低于安全库存` : '低库存状态正常',
          '优先补齐影响服务消耗和高频销售的商品。',
          '低库存',
          stats.lowStockCount >= 5 ? 'critical' : stats.lowStockCount > 0 ? 'warning' : 'normal',
          stats.lowStockCount > 0 ? 95 : 20,
          '/inventory/stock',
          'core:inventory:stock',
          '查看库存管理',
          stats.lowStockCount,
        ),
        this.todo(
          'inventory-expiry',
          'inventory',
          stats.expiringBatchCount > 0 ? `${stats.expiringBatchCount} 个批次 30 天内临期` : '暂无临期批次',
          '临期商品建议尽快调拨、促销或下架处理。',
          '临期',
          stats.expiringBatchCount > 0 ? 'warning' : 'normal',
          stats.expiringBatchCount > 0 ? 85 : 15,
          '/inventory/expiry',
          'core:inventory:expiry',
          '查看过期管理',
          stats.expiringBatchCount,
        ),
        this.todo(
          'inventory-transfer',
          'inventory',
          stats.pendingTransferOrders > 0 ? `${stats.pendingTransferOrders} 个调拨单待确认` : '暂无待确认调拨',
          '跨店调拨需要及时确认，避免库存口径失真。',
          '调拨',
          stats.pendingTransferOrders > 0 ? 'warning' : 'normal',
          stats.pendingTransferOrders > 0 ? 75 : 10,
          '/inventory/transfer',
          'core:inventory:transfer',
          '查看门店调拨',
          stats.pendingTransferOrders,
        ),
      ],
      this.inventoryActions(),
      {
        conclusion:
          stats.inventoryWarningCount > 0 ? '优先处理低库存和临期批次。' : '库存风险暂时可控，可继续关注采购和调拨进度。',
        basis: `低库存 ${stats.lowStockCount} 个，临期批次 ${stats.expiringBatchCount} 个，调拨待确认 ${stats.pendingTransferOrders} 个。`,
        action: stats.lowStockCount > 0 ? '查看库存管理' : '查看采购管理',
        path: stats.lowStockCount > 0 ? '/inventory/stock' : '/inventory/purchase',
        permission: stats.lowStockCount > 0 ? 'core:inventory:stock' : 'core:inventory:purchase',
      },
      stats,
      ranges.now,
    );
  }

  private async buildSuperAdminWorkbench(context: DashboardWorkbenchContext): Promise<WorkbenchOverview> {
    const ranges = this.getDateRanges();
    const stats = await this.collectCommonStats(context, ranges);
    const storeAlerts = stats.inventoryWarningCount + stats.offlineTerminals;
    return this.finalizeWorkbench(
      context,
      [
        this.metric(
          'totalIncomeToday',
          '今日总营收',
          this.formatMoney(stats.todayIncome),
          stats.incomeHint,
          'rose',
          '/finance/platform-revenue',
          'core:finance:view',
        ),
        this.metric(
          'activeStores',
          '活跃门店',
          String(stats.activeStores),
          context.scope.storeId ? '当前门店口径' : '全部活跃门店',
          'primary',
          '/system/stores',
          'core:system:stores',
        ),
        this.metric(
          'storeAlerts',
          '异常事项',
          String(storeAlerts),
          `库存 ${stats.inventoryWarningCount} / 离线终端 ${stats.offlineTerminals}`,
          'amber',
          '/system/stores',
          'core:system:stores',
          storeAlerts > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'onlineDevices',
          '在线终端',
          String(stats.onlineTerminals),
          `终端总数 ${stats.totalTerminals}`,
          'slate',
          '/system/devices',
          'core:system:stores',
        ),
      ],
      [
        this.todo(
          'super-device',
          'device',
          stats.offlineTerminals > 0 ? `${stats.offlineTerminals} 台终端离线` : '终端在线状态正常',
          `当前口径终端总数 ${stats.totalTerminals} 台，在线 ${stats.onlineTerminals} 台。`,
          '终端',
          stats.offlineTerminals > 0 ? 'warning' : 'normal',
          stats.offlineTerminals > 0 ? 90 : 15,
          '/system/devices',
          'core:system:stores',
          '查看终端设备',
          stats.offlineTerminals,
        ),
        this.todo(
          'super-inventory',
          'inventory',
          stats.inventoryWarningCount > 0 ? `${stats.inventoryWarningCount} 个库存风险项` : '库存风险正常',
          `低库存 ${stats.lowStockCount} 个，临期 ${stats.expiringBatchCount} 个。`,
          '库存',
          stats.inventoryWarningCount > 0 ? 'warning' : 'normal',
          stats.inventoryWarningCount > 0 ? 80 : 10,
          '/inventory/stock',
          'core:inventory:stock',
          '查看库存风险',
          stats.inventoryWarningCount,
        ),
        this.todo(
          'super-finance',
          'finance',
          '查看今日平台收入',
          `今日总营收 ${this.formatMoney(stats.todayIncome)}。`,
          '财务',
          'normal',
          45,
          '/finance/platform-revenue',
          'core:finance:view',
          '查看平台收入',
        ),
      ],
      this.superAdminActions(),
      {
        conclusion: storeAlerts > 0 ? '优先处理跨门店异常事项。' : '当前全局运行状态平稳，可查看平台收入和门店表现。',
        basis: `异常事项 ${storeAlerts} 个，在线终端 ${stats.onlineTerminals}/${stats.totalTerminals} 台。`,
        action: storeAlerts > 0 ? '查看门店管理' : '查看平台收入',
        path: storeAlerts > 0 ? '/system/stores' : '/finance/platform-revenue',
        permission: storeAlerts > 0 ? 'core:system:stores' : 'core:finance:view',
      },
      stats,
      ranges.now,
    );
  }

  private async buildDefaultWorkbench(context: DashboardWorkbenchContext): Promise<WorkbenchOverview> {
    const ranges = this.getDateRanges();
    const stats = await this.collectCommonStats(context, ranges);
    return this.finalizeWorkbench(
      context,
      [
        this.metric(
          'customers',
          '客户数据',
          this.formatNumber(stats.totalCustomers),
          `本月新增 ${stats.monthNewCustomers} 人`,
          'primary',
          '/customers/data',
          'core:customer:view',
        ),
        this.metric('income', '今日收入', this.formatMoney(stats.todayIncome), stats.incomeHint, 'rose', '/orders/products', 'core:order:products'),
        this.metric(
          'inventory',
          '库存预警',
          String(stats.inventoryWarningCount),
          `低库存 ${stats.lowStockCount} / 临期 ${stats.expiringBatchCount}`,
          'amber',
          '/inventory/stock',
          'core:inventory:stock',
          stats.inventoryWarningCount > 0 ? 'warning' : 'normal',
        ),
        this.metric(
          'campaigns',
          '进行中活动',
          String(stats.activeActivities),
          '当前可访问营销活动',
          'slate',
          '/customer-marketing/workbench',
          'core:marketing:view',
        ),
      ],
      [
        this.todo(
          'default-start',
          'system',
          '从可用入口开始处理',
          '当前账号使用自定义角色，工作台已按权限过滤指标、待办和快捷入口。',
          '权限',
          'normal',
          40,
          '/dashboard',
          'core:dashboard:view',
          '留在工作台',
        ),
      ],
      this.defaultActions(),
      {
        conclusion: '当前工作台已按账号权限展示可用入口。',
        basis: '自定义角色使用权限推断，避免展示无权访问的模块。',
        action: '查看可用入口',
        path: '/dashboard',
        permission: 'core:dashboard:view',
      },
      stats,
      ranges.now,
    );
  }

  private async resolveWorkbenchContext(
    user: WorkbenchJwtUser,
    requestedStoreId?: number,
    requestedRole?: string,
  ): Promise<DashboardWorkbenchContext> {
    const roles = user.roles ?? [];
    const permissions = user.permissions ?? [];
    const deniedPermissions = user.deniedPermissions ?? [];
    const accessibleStoreIds = user.storeIds ?? user.stores ?? [];
    const isSuperAdmin = this.hasPermission(permissions, '*') || roles.includes('super_admin') || roles.includes('admin');
    const availableRoles = this.resolveAvailableRoles(roles, permissions, isSuperAdmin);
    const currentRole = this.resolveCurrentRole(availableRoles, requestedRole);
    const scope = await this.resolveWorkbenchScope({
      requestedStoreId,
      accessibleStoreIds,
      isSuperAdmin,
      currentRole,
    });

    return {
      user,
      actor: {
        userId: user.id,
        name: user.name ?? user.username ?? '用户',
        roles,
        currentRole,
        availableRoles,
      },
      scope,
      permissions,
      deniedPermissions,
      accessibleStoreIds,
      isSuperAdmin,
    };
  }

  private async resolveWorkbenchScope(params: {
    requestedStoreId?: number;
    accessibleStoreIds: number[];
    isSuperAdmin: boolean;
    currentRole: AdminWorkbenchRole;
  }): Promise<WorkbenchScope> {
    let storeId = params.requestedStoreId;
    if (storeId && !params.isSuperAdmin && !params.accessibleStoreIds.includes(storeId)) {
      throw new ForbiddenException('无权查看该门店工作台');
    }
    if (!storeId && !params.isSuperAdmin) {
      storeId = params.accessibleStoreIds[0];
    }
    if (!storeId) {
      return {
        storeId: null,
        storeName: params.isSuperAdmin ? '全部门店' : '未分配门店',
        mode: params.isSuperAdmin ? 'all' : 'self',
      };
    }
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
    return {
      storeId,
      storeName: store?.name ?? `门店 ${storeId}`,
      mode: params.currentRole === 'beautician' ? 'self' : 'store',
    };
  }

  private resolveAvailableRoles(
    roles: string[],
    permissions: string[],
    isSuperAdmin: boolean,
  ): AdminWorkbenchRole[] {
    if (isSuperAdmin) {
      return ['super_admin', 'store_manager', 'inventory_manager', 'cashier', 'beautician'];
    }
    const resolved = new Set<AdminWorkbenchRole>();
    const hasStoreManagerRole = roles.some((role) =>
      role === 'store_manager' || role.includes('full_manager') || (role.includes('manager') && !role.includes('inventory')),
    );
    if (
      hasStoreManagerRole ||
      (this.hasPermission(permissions, 'core:store:reservations') &&
        this.hasPermission(permissions, 'core:inventory:stock') &&
        this.hasPermission(permissions, 'core:marketing:view'))
    ) {
      resolved.add('store_manager');
      resolved.add('cashier');
      resolved.add('beautician');
    }
    if (roles.includes('inventory_manager') || this.hasPermission(permissions, 'core:inventory:stock')) {
      resolved.add('inventory_manager');
    }
    if (roles.some((role) => role === 'cashier' || role.includes('cashier')) || this.hasPermission(permissions, 'core:order:card-usage')) {
      resolved.add('cashier');
    }
    if (roles.some((role) => role === 'beautician' || role.includes('beautician')) || this.hasPermission(permissions, 'terminal:service:view')) {
      resolved.add('beautician');
    }
    if (resolved.size === 0) {
      resolved.add('default');
    }
    const order: AdminWorkbenchRole[] = ['super_admin', 'store_manager', 'inventory_manager', 'cashier', 'beautician', 'default'];
    return order.filter((role) => resolved.has(role));
  }

  private resolveCurrentRole(availableRoles: AdminWorkbenchRole[], requestedRole?: string): AdminWorkbenchRole {
    if (requestedRole && availableRoles.includes(requestedRole as AdminWorkbenchRole)) {
      return requestedRole as AdminWorkbenchRole;
    }
    return availableRoles[0] ?? 'default';
  }

  private async collectCommonStats(context: DashboardWorkbenchContext, ranges: DateRanges): Promise<CommonStats> {
    const storeScope = this.storeScope(context);
    const customerWhere = { deletedAt: null, ...storeScope };
    const productWhere = { deletedAt: null, ...storeScope };
    const activeOrderStatuses = this.activeOrderStatuses();
    const activeReservationStatuses = this.activeReservationStatuses();
    const pendingReservationStatuses = ['pending', '待确认'];
    const pendingServiceTaskStatuses = this.pendingServiceTaskStatuses();
    const transferStoreWhere = this.transferStoreScope(context);

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
      pendingReservations,
      pendingCheckIn,
      pendingTasks,
      inProgressTasks,
      todayCardUsage,
      todayNewCustomers,
      pendingPurchaseOrders,
      pendingTransferOrders,
      activeStores,
      totalTerminals,
      onlineTerminals,
    ] = await Promise.all([
      this.prisma.customer.count({ where: customerWhere }),
      this.prisma.customer.count({ where: { ...customerWhere, createdAt: { gte: ranges.monthStart } } }),
      this.prisma.productOrder.aggregate({
        where: {
          ...storeScope,
          status: { in: activeOrderStatuses },
          createdAt: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.productOrder.aggregate({
        where: {
          ...storeScope,
          status: { in: activeOrderStatuses },
          createdAt: { gte: ranges.yesterdayStart, lt: ranges.todayStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.customerCard.findMany({
        where: {
          createdAt: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
          ...(storeScope.storeId ? { customer: { storeId: storeScope.storeId } } : {}),
        },
        include: { card: { select: { price: true } } },
      }),
      this.prisma.customerCard.findMany({
        where: {
          createdAt: { gte: ranges.yesterdayStart, lt: ranges.todayStart },
          ...(storeScope.storeId ? { customer: { storeId: storeScope.storeId } } : {}),
        },
        include: { card: { select: { price: true } } },
      }),
      this.prisma.product.findMany({
        where: productWhere,
        select: { currentStock: true, safetyStock: true },
      }),
      this.prisma.stockBatch.count({
        where: {
          expiryDate: { gte: ranges.todayStart, lte: ranges.expiringBefore },
          product: productWhere,
        },
      }),
      this.prisma.marketingActivity.count({
        where: {
          status: { in: ['active', 'enabled', 'running', 'published', '进行中'] },
        },
      }),
      this.prisma.reservation.count({
        where: {
          ...storeScope,
          date: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
          status: { in: activeReservationStatuses },
        },
      }),
      this.prisma.reservation.count({
        where: {
          ...storeScope,
          date: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
          status: { in: pendingReservationStatuses },
        },
      }),
      this.prisma.reservation.count({
        where: {
          ...storeScope,
          date: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
          checkedInAt: null,
          status: { in: activeReservationStatuses },
        },
      }),
      this.prisma.serviceTask.count({
        where: {
          ...storeScope,
          status: { in: pendingServiceTaskStatuses },
        },
      }),
      this.prisma.serviceTask.count({
        where: {
          ...storeScope,
          status: ServiceTaskStatus.in_progress,
        },
      }),
      this.prisma.cardUsageRecord.count({
        where: {
          verifiedAt: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
          ...(storeScope.storeId ? { customer: { storeId: storeScope.storeId } } : {}),
        },
      }),
      this.prisma.customer.count({
        where: {
          ...customerWhere,
          createdAt: { gte: ranges.todayStart, lt: ranges.tomorrowStart },
        },
      }),
      this.prisma.purchaseOrder.count({
        where: { status: { in: ['pending', 'ordered', 'draft', '待处理', '待入库'] } },
      }),
      this.prisma.transferOrder.count({
        where: {
          status: { in: ['pending', 'in_transit', 'draft', '待确认', '调拨中'] },
          ...transferStoreWhere,
        },
      }),
      context.scope.storeId
        ? Promise.resolve(1)
        : this.prisma.store.count({ where: { status: 'active', deletedAt: null } }),
      this.prisma.terminalDevice.count({ where: storeScope }),
      this.prisma.terminalDevice.count({ where: { ...storeScope, status: 'online' } }),
    ]);

    const lowStockCount = products.filter((product) => this.toNumber(product.currentStock) < this.toNumber(product.safetyStock)).length;
    const todayIncome = this.toNumber(todayProductIncome._sum.totalAmount) + this.sumCardOrders(todayCardOrders);
    const yesterdayIncome = this.toNumber(yesterdayProductIncome._sum.totalAmount) + this.sumCardOrders(yesterdayCardOrders);
    const incomeHint =
      yesterdayIncome > 0 ? `较昨日 ${this.formatPercent((todayIncome - yesterdayIncome) / yesterdayIncome)}` : '今日开卡/收银汇总';

    return {
      totalCustomers,
      monthNewCustomers,
      todayIncome,
      yesterdayIncome,
      incomeHint,
      lowStockCount,
      expiringBatchCount,
      inventoryWarningCount: lowStockCount + expiringBatchCount,
      activeActivities,
      todayReservations,
      pendingReservations,
      pendingCheckIn,
      pendingTasks,
      inProgressTasks,
      todayCardUsage,
      todayNewCustomers,
      pendingPurchaseOrders,
      pendingTransferOrders,
      activeStores,
      totalTerminals,
      onlineTerminals,
      offlineTerminals: Math.max(totalTerminals - onlineTerminals, 0),
    };
  }

  private async resolveBeauticianForUser(context: DashboardWorkbenchContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: context.user.id },
      select: { name: true, phone: true },
    });
    const matchers: Array<{ phone?: string; name?: string }> = [];
    if (user?.phone) matchers.push({ phone: user.phone });
    if (user?.name) matchers.push({ name: user.name });
    if (context.user.name && context.user.name !== user?.name) matchers.push({ name: context.user.name });

    if (matchers.length === 0) return null;

    return this.prisma.beautician.findFirst({
      where: {
        ...(context.scope.storeId ? { storeId: context.scope.storeId } : {}),
        status: 'active',
        OR: matchers,
      },
      select: { id: true, name: true },
    });
  }

  private finalizeWorkbench(
    context: DashboardWorkbenchContext,
    metrics: WorkbenchMetric[],
    todos: WorkbenchTodo[],
    quickActions: WorkbenchQuickAction[],
    insight: WorkbenchInsight,
    stats: CommonStats,
    now: Date,
  ): WorkbenchOverview {
    const filteredQuickActions = this.filterByPermission(quickActions, context.permissions, context.deniedPermissions);
    const filteredInsight = this.ensureInsightAllowed(insight, filteredQuickActions, context.permissions, context.deniedPermissions);
    return {
      actor: context.actor,
      scope: context.scope,
      metrics: this.filterByPermission(metrics, context.permissions, context.deniedPermissions),
      todos: this.filterByPermission(todos, context.permissions, context.deniedPermissions).sort((a, b) => b.priority - a.priority),
      quickActions: filteredQuickActions,
      insight: filteredInsight,
      terminalStatus: {
        totalDevices: stats.totalTerminals,
        onlineDevices: stats.onlineTerminals,
      },
      generatedAt: now.toISOString(),
    };
  }

  private ensureInsightAllowed(
    insight: WorkbenchInsight,
    quickActions: WorkbenchQuickAction[],
    permissions: string[],
    deniedPermissions: string[],
  ): WorkbenchInsight {
    if (this.hasPermission(permissions, insight.permission) && !this.hasPermission(deniedPermissions, insight.permission)) {
      return insight;
    }
    const fallback = quickActions[0];
    if (!fallback) {
      return {
        conclusion: '当前账号暂无可执行建议。',
        basis: '工作台已按权限隐藏不可访问动作，请联系管理员开通对应权限。',
        action: '留在工作台',
        path: '/dashboard',
        permission: 'core:dashboard:view',
      };
    }
    return {
      conclusion: '建议先处理当前可用的高频事项。',
      basis: '该入口来自当前账号可访问的工作台快捷操作。',
      action: fallback.label,
      path: fallback.path,
      permission: fallback.permission,
    };
  }

  private filterByPermission<T extends { permission?: string }>(
    items: T[],
    permissions: string[],
    deniedPermissions: string[] = [],
  ): T[] {
    return items.filter((item) => {
      if (!item.permission) return true;
      if (this.hasPermission(deniedPermissions, '*') || this.hasPermission(deniedPermissions, item.permission)) return false;
      return this.hasPermission(permissions, item.permission);
    });
  }

  private storeScope(context: DashboardWorkbenchContext): StoreIdScope {
    if (context.scope.storeId) return { storeId: context.scope.storeId };
    if (context.isSuperAdmin) return {};
    if (context.accessibleStoreIds.length > 0) return { storeId: { in: context.accessibleStoreIds } };
    return { storeId: -1 };
  }

  private transferStoreScope(context: DashboardWorkbenchContext) {
    if (context.scope.storeId) {
      return { OR: [{ fromStoreId: context.scope.storeId }, { toStoreId: context.scope.storeId }] };
    }
    if (context.isSuperAdmin) return {};
    if (context.accessibleStoreIds.length > 0) {
      return {
        OR: [
          { fromStoreId: { in: context.accessibleStoreIds } },
          { toStoreId: { in: context.accessibleStoreIds } },
        ],
      };
    }
    return { OR: [{ fromStoreId: -1 }, { toStoreId: -1 }] };
  }

  private buildSystemContext(params: { scope: WorkbenchScope }): DashboardWorkbenchContext {
    return {
      user: { id: 0, name: '系统', roles: ['super_admin'], permissions: ['*'], stores: [] },
      actor: {
        userId: 0,
        name: '系统',
        roles: ['super_admin'],
        currentRole: 'super_admin',
        availableRoles: ['super_admin'],
      },
      scope: params.scope,
      permissions: ['*'],
      deniedPermissions: [],
      accessibleStoreIds: [],
      isSuperAdmin: true,
    };
  }

  private getDateRanges(now = new Date()): DateRanges {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const expiringBefore = new Date(todayStart);
    expiringBefore.setDate(expiringBefore.getDate() + 30);
    return { now, todayStart, tomorrowStart, yesterdayStart, monthStart, expiringBefore };
  }

  private activeOrderStatuses() {
    return ['completed', 'paid', '已完成', '已付款'];
  }

  private activeReservationStatuses() {
    return ['pending', 'confirmed', '进行中', '待确认', '已确认'];
  }

  private pendingServiceTaskStatuses() {
    return [ServiceTaskStatus.pending, ServiceTaskStatus.in_progress];
  }

  private overviewMetric(key: string, label: string, value: string, hint: string, tone: WorkbenchMetricTone, path: string) {
    return { key, label, value, hint, tone, path };
  }

  private metric(
    key: string,
    label: string,
    value: string,
    hint: string,
    tone: WorkbenchMetricTone,
    path: string,
    permission: string,
    severity: WorkbenchSeverity = 'normal',
  ): WorkbenchMetric {
    return { key, label, value, hint, tone, severity, path, permission };
  }

  private todo(
    id: string,
    type: WorkbenchTodo['type'],
    title: string,
    detail: string,
    tag: string,
    severity: WorkbenchSeverity,
    priority: number,
    path: string,
    permission: string,
    primaryAction: string,
    count?: number,
  ): WorkbenchTodo {
    return { id, type, title, detail, tag, severity, priority, path, permission, primaryAction, count };
  }

  private action(
    key: string,
    label: string,
    path: string,
    icon: string,
    permission: string,
    group: WorkbenchQuickAction['group'] = 'operation',
  ): WorkbenchQuickAction {
    return { key, label, path, icon, permission, group };
  }

  private superAdminActions(): WorkbenchQuickAction[] {
    return [
      this.action('stores', '门店管理', '/system/stores', 'Building2', 'core:system:stores', 'system'),
      this.action('roles', '角色权限', '/system/roles', 'Shield', 'core:system:roles', 'system'),
      this.action('platformRevenue', '平台收入', '/finance/platform-revenue', 'BarChart3', 'core:finance:view', 'system'),
      this.action('devices', '终端设备', '/system/devices', 'Monitor', 'core:system:stores', 'system'),
    ];
  }

  private storeManagerActions(): WorkbenchQuickAction[] {
    return [
      this.action('reservations', '项目预约', '/stores/reservations', 'CalendarCheck', 'core:store:reservations'),
      this.action('scheduling', '排班管理', '/stores/scheduling', 'Calendar', 'core:store:scheduling', 'management'),
      this.action('inventory', '库存管理', '/inventory/stock', 'PackageCheck', 'core:inventory:stock', 'management'),
      this.action('marketing', '营销工作台', '/customer-marketing/workbench', 'Sparkles', 'core:marketing:view'),
      this.action('dailySettlement', '日结报表', '/finance/daily-settlement', 'ClipboardList', 'core:finance:view', 'analytics'),
    ];
  }

  private cashierActions(): WorkbenchQuickAction[] {
    return [
      this.action('reservations', '项目预约', '/stores/reservations', 'CalendarCheck', 'core:store:reservations'),
      this.action('customerRegister', '客户登记', '/customers/data', 'UserPlus', 'core:customer:create'),
      this.action('cardUsage', '次卡核销', '/orders/card-usage', 'BadgeCheck', 'core:order:card-usage'),
      this.action('cashierOrder', '商品订单', '/orders/products', 'CreditCard', 'core:order:products'),
      this.action('cardOrders', '次卡开卡', '/orders/card-orders', 'WalletCards', 'core:order:card-orders'),
    ];
  }

  private beauticianActions(): WorkbenchQuickAction[] {
    return [
      this.action('mySchedule', '我的排班', '/stores/scheduling', 'CalendarCheck', 'core:store:scheduling'),
      this.action('customerProfile', '客户画像', '/customers/profile', 'Users', 'core:customer:profile'),
      this.action('serviceRecord', '服务记录', '/orders/card-usage', 'FileText', 'terminal:service:view'),
      this.action('careAdvice', '护理建议', '/customers/script', 'HeartPulse', 'core:customer:script'),
      this.action('commission', '提成明细', '/finance/commission-records', 'WalletCards', 'core:finance:view', 'analytics'),
    ];
  }

  private inventoryActions(): WorkbenchQuickAction[] {
    return [
      this.action('stock', '库存管理', '/inventory/stock', 'PackageCheck', 'core:inventory:stock', 'management'),
      this.action('purchase', '采购管理', '/inventory/purchase', 'ShoppingCart', 'core:inventory:purchase', 'management'),
      this.action('expiry', '过期管理', '/inventory/expiry', 'AlertTriangle', 'core:inventory:expiry', 'management'),
      this.action('transfer', '门店调拨', '/inventory/transfer', 'PackagePlus', 'core:inventory:transfer', 'management'),
      this.action('consumption', '服务消耗', '/inventory/consumption', 'ClipboardList', 'core:inventory:consumption', 'analytics'),
    ];
  }

  private defaultActions(): WorkbenchQuickAction[] {
    return [
      this.action('customers', '客户数据', '/customers/data', 'Users', 'core:customer:view'),
      this.action('reservations', '项目预约', '/stores/reservations', 'CalendarCheck', 'core:store:reservations'),
      this.action('orders', '订单管理', '/orders/products', 'CreditCard', 'core:order:products'),
      this.action('inventory', '库存管理', '/inventory/stock', 'PackageCheck', 'core:inventory:stock', 'management'),
      this.action('marketing', '营销工作台', '/customer-marketing/workbench', 'Sparkles', 'core:marketing:view'),
    ];
  }

  private hasPermission(permissions: string[] = [], permissionCode: string): boolean {
    return permissions.includes('*') || permissions.includes(permissionCode);
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
