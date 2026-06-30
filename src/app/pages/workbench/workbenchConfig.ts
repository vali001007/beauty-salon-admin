import type {
  AdminWorkbenchRole,
  WorkbenchMetric,
  WorkbenchQuickAction,
  WorkbenchSeverity,
} from '@/types/dashboard';

export const ADMIN_WORKBENCH_ROLE_PRIORITY: AdminWorkbenchRole[] = [
  'super_admin',
  'store_manager',
  'inventory_manager',
  'cashier',
  'beautician',
  'default',
];

export const workbenchRoleLabels: Record<AdminWorkbenchRole, string> = {
  super_admin: '总部工作台',
  store_manager: '店长工作台',
  cashier: '前台工作台',
  beautician: '美容师工作台',
  inventory_manager: '库存工作台',
  default: '我的工作台',
};

export const workbenchRoleBadges: Record<AdminWorkbenchRole, string> = {
  super_admin: '总部 / 超级管理员',
  store_manager: '店长',
  cashier: '前台 / 收银',
  beautician: '美容师',
  inventory_manager: '库存管理员',
  default: '当前用户',
};

type WorkbenchMetricConfig = Omit<WorkbenchMetric, 'value' | 'hint' | 'severity'> & {
  icon: string;
  fallbackKeys?: string[];
  fallbackValue?: string;
  fallbackHint?: string;
  fallbackSeverity?: WorkbenchSeverity;
};

export interface WorkbenchRoleConfig {
  title: string;
  subtitle: string;
  metrics: WorkbenchMetricConfig[];
  quickActions: WorkbenchQuickAction[];
  insight: {
    conclusion: string;
    basis: string;
    action: string;
    path: string;
    permission: string;
  };
}

export const workbenchConfig: Record<AdminWorkbenchRole, WorkbenchRoleConfig> = {
  super_admin: {
    title: '总部工作台',
    subtitle: '先看跨门店异常、系统风险和经营总览，再进入具体门店处理。',
    metrics: [
      {
        key: 'totalIncomeToday',
        label: '今日总营收',
        icon: 'TrendingUp',
        tone: 'rose',
        path: '/finance/platform-revenue',
        permission: 'core:platform-revenue:view',
        fallbackKeys: ['income'],
        fallbackValue: '-',
        fallbackHint: '等待总部口径数据',
      },
      {
        key: 'activeStores',
        label: '活跃门店',
        icon: 'Building2',
        tone: 'primary',
        path: '/system/stores',
        permission: 'core:system:stores',
        fallbackValue: '-',
        fallbackHint: '按订单、预约和终端活跃判断',
      },
      {
        key: 'storeAlerts',
        label: '异常门店',
        icon: 'AlertTriangle',
        tone: 'amber',
        path: '/system/stores',
        permission: 'core:system:stores',
        fallbackKeys: ['inventory'],
        fallbackValue: '-',
        fallbackHint: '库存、设备、经营异常汇总',
      },
      {
        key: 'onlineDevices',
        label: '在线终端',
        icon: 'Monitor',
        tone: 'slate',
        path: '/system/devices',
        permission: 'core:system:stores',
        fallbackValue: '-',
        fallbackHint: 'Ami Aura Lite 在线设备',
      },
    ],
    quickActions: [
      { key: 'stores', label: '门店管理', path: '/system/stores', icon: 'Building2', permission: 'core:system:stores', group: 'system' },
      { key: 'roles', label: '角色权限', path: '/system/roles', icon: 'Shield', permission: 'core:system:roles', group: 'system' },
      { key: 'platformRevenue', label: '平台收入', path: '/finance/platform-revenue', icon: 'BarChart3', permission: 'core:platform-revenue:view', group: 'system' },
      { key: 'devices', label: '终端设备', path: '/system/devices', icon: 'Monitor', permission: 'core:system:stores', group: 'system' },
    ],
    insight: {
      conclusion: '优先查看跨门店异常和设备在线状态。',
      basis: '总部视角需要先排除影响多门店运营的问题，再看单店经营。',
      action: '查看门店管理',
      path: '/system/stores',
      permission: 'core:system:stores',
    },
  },
  store_manager: {
    title: '店长工作台',
    subtitle: '先看经营、预约、服务和库存，再推进营销增长。',
    metrics: [
      {
        key: 'incomeToday',
        label: '今日收入',
        icon: 'TrendingUp',
        tone: 'rose',
        path: '/orders/products',
        permission: 'core:order:products',
        fallbackKeys: ['income'],
      },
      {
        key: 'todayReservations',
        label: '今日预约',
        icon: 'CalendarCheck',
        tone: 'primary',
        path: '/stores/reservations',
        permission: 'core:store:reservations',
        fallbackKeys: ['reservations'],
        fallbackValue: '-',
        fallbackHint: '今日预约待接入',
      },
      {
        key: 'pendingServices',
        label: '待服务任务',
        icon: 'HeartPulse',
        tone: 'slate',
        path: '/orders/card-usage',
        permission: 'core:order:card-usage',
        fallbackKeys: ['service'],
        fallbackValue: '-',
        fallbackHint: '服务任务待接入',
      },
      {
        key: 'inventoryAlerts',
        label: '库存预警',
        icon: 'PackageCheck',
        tone: 'amber',
        path: '/inventory/stock',
        permission: 'core:inventory:stock',
        fallbackKeys: ['inventory'],
      },
    ],
    quickActions: [
      { key: 'reservations', label: '项目预约', path: '/stores/reservations', icon: 'CalendarCheck', permission: 'core:store:reservations', group: 'operation' },
      { key: 'scheduling', label: '排班管理', path: '/stores/scheduling', icon: 'Calendar', permission: 'core:store:scheduling', group: 'management' },
      { key: 'inventory', label: '库存管理', path: '/inventory/stock', icon: 'PackageCheck', permission: 'core:inventory:stock', group: 'management' },
      { key: 'marketing', label: '营销工作台', path: '/customer-marketing/workbench', icon: 'Sparkles', permission: 'core:marketing:view', group: 'operation' },
      { key: 'dailySettlement', label: '收银对账', path: '/finance/reconciliation', icon: 'ClipboardList', permission: 'core:finance:view', group: 'analytics' },
    ],
    insight: {
      conclusion: '优先处理今日预约、服务积压和库存风险。',
      basis: '店长工作台聚焦本店经营结果和影响交付的风险项。',
      action: '查看项目预约',
      path: '/stores/reservations',
      permission: 'core:store:reservations',
    },
  },
  cashier: {
    title: '前台工作台',
    subtitle: '围绕预约到店、客户登记、核销和收银快速处理。',
    metrics: [
      {
        key: 'todayReservations',
        label: '今日预约',
        icon: 'CalendarCheck',
        tone: 'primary',
        path: '/stores/reservations',
        permission: 'core:store:reservations',
        fallbackKeys: ['reservations'],
        fallbackValue: '-',
        fallbackHint: '今日预约待接入',
      },
      {
        key: 'pendingCheckIn',
        label: '待到店',
        icon: 'CheckCircle2',
        tone: 'amber',
        path: '/stores/reservations',
        permission: 'core:store:reservations',
        fallbackValue: '-',
        fallbackHint: '待到店待接入',
      },
      {
        key: 'pendingCardUsage',
        label: '待核销',
        icon: 'BadgeCheck',
        tone: 'slate',
        path: '/orders/card-usage',
        permission: 'core:order:card-usage',
        fallbackKeys: ['cardUsage'],
        fallbackValue: '-',
        fallbackHint: '次卡 / 服务核销',
      },
      {
        key: 'cashierToday',
        label: '今日收银',
        icon: 'CreditCard',
        tone: 'rose',
        path: '/orders/products',
        permission: 'core:order:products',
        fallbackKeys: ['income', 'cashier'],
      },
    ],
    quickActions: [
      { key: 'reservations', label: '项目预约', path: '/stores/reservations', icon: 'CalendarCheck', permission: 'core:store:reservations', group: 'operation' },
      { key: 'customerRegister', label: '客户登记', path: '/customers/data', icon: 'UserPlus', permission: 'core:customer:create', group: 'operation' },
      { key: 'cardUsage', label: '次卡核销', path: '/orders/card-usage', icon: 'BadgeCheck', permission: 'core:order:card-usage', group: 'operation' },
      { key: 'cashierOrder', label: '商品订单', path: '/orders/products', icon: 'CreditCard', permission: 'core:order:products', group: 'operation' },
      { key: 'cardOrders', label: '次卡开卡', path: '/orders/card-orders', icon: 'WalletCards', permission: 'core:order:card-orders', group: 'operation' },
    ],
    insight: {
      conclusion: '优先处理即将到店、待核销和未完成收银。',
      basis: '前台工作台聚焦会影响顾客等待和交易完成的事项。',
      action: '进入项目预约',
      path: '/stores/reservations',
      permission: 'core:store:reservations',
    },
  },
  beautician: {
    title: '美容师工作台',
    subtitle: '只看自己的排班、服务任务、客户档案和护理建议。',
    metrics: [
      {
        key: 'myReservations',
        label: '我的预约',
        icon: 'CalendarCheck',
        tone: 'primary',
        path: '/stores/scheduling',
        permission: 'core:store:scheduling',
        fallbackValue: '-',
        fallbackHint: '本人预约待接入',
      },
      {
        key: 'pendingServices',
        label: '待完成服务',
        icon: 'HeartPulse',
        tone: 'rose',
        path: '/orders/card-usage',
        permission: 'terminal:service:view',
        fallbackKeys: ['service'],
        fallbackValue: '-',
        fallbackHint: '待完成服务待接入',
      },
      {
        key: 'serviceRecordsTodo',
        label: '待补记录',
        icon: 'FileText',
        tone: 'amber',
        path: '/orders/card-usage',
        permission: 'terminal:service:view',
        fallbackValue: '-',
        fallbackHint: '服务记录待接入',
      },
      {
        key: 'myCommission',
        label: '我的提成',
        icon: 'WalletCards',
        tone: 'slate',
        path: '/finance/staff-commission',
        permission: 'core:finance:view',
        fallbackValue: '-',
        fallbackHint: '提成数据待接入',
      },
    ],
    quickActions: [
      { key: 'mySchedule', label: '我的排班', path: '/stores/scheduling', icon: 'CalendarCheck', permission: 'core:store:scheduling', group: 'operation' },
      { key: 'customerProfile', label: '客户画像', path: '/customers/profile', icon: 'Users', permission: 'core:customer:profile', group: 'operation' },
      { key: 'serviceRecord', label: '服务记录', path: '/orders/card-usage', icon: 'FileText', permission: 'terminal:service:view', group: 'operation' },
      { key: 'careAdvice', label: '护理建议', path: '/customers/script', icon: 'HeartPulse', permission: 'core:customer:script', group: 'operation' },
      { key: 'commission', label: '员工提成', path: '/finance/staff-commission', icon: 'WalletCards', permission: 'core:finance:view', group: 'analytics' },
    ],
    insight: {
      conclusion: '优先完成当前服务和服务记录补充。',
      basis: '美容师工作台只展示本人服务相关事项，减少无关经营信息干扰。',
      action: '查看我的排班',
      path: '/stores/scheduling',
      permission: 'core:store:scheduling',
    },
  },
  inventory_manager: {
    title: '库存工作台',
    subtitle: '集中处理低库存、临期、采购、调拨和服务消耗异常。',
    metrics: [
      {
        key: 'lowStock',
        label: '低库存',
        icon: 'PackageCheck',
        tone: 'amber',
        path: '/inventory/stock',
        permission: 'core:inventory:stock',
        fallbackKeys: ['inventory'],
      },
      {
        key: 'expiringBatches',
        label: '临期批次',
        icon: 'AlertTriangle',
        tone: 'rose',
        path: '/inventory/expiry',
        permission: 'core:inventory:expiry',
        fallbackValue: '-',
        fallbackHint: '30 天内到期',
      },
      {
        key: 'purchasePending',
        label: '采购待处理',
        icon: 'ShoppingCart',
        tone: 'primary',
        path: '/inventory/purchase',
        permission: 'core:inventory:purchase',
        fallbackValue: '-',
        fallbackHint: '待下单 / 待入库',
      },
      {
        key: 'transferPending',
        label: '调拨待确认',
        icon: 'PackagePlus',
        tone: 'slate',
        path: '/inventory/transfer',
        permission: 'core:inventory:transfer',
        fallbackValue: '-',
        fallbackHint: '跨店调拨处理中',
      },
    ],
    quickActions: [
      { key: 'stock', label: '库存管理', path: '/inventory/stock', icon: 'PackageCheck', permission: 'core:inventory:stock', group: 'management' },
      { key: 'purchase', label: '采购管理', path: '/inventory/purchase', icon: 'ShoppingCart', permission: 'core:inventory:purchase', group: 'management' },
      { key: 'expiry', label: '过期管理', path: '/inventory/expiry', icon: 'AlertTriangle', permission: 'core:inventory:expiry', group: 'management' },
      { key: 'transfer', label: '门店调拨', path: '/inventory/transfer', icon: 'PackagePlus', permission: 'core:inventory:transfer', group: 'management' },
      { key: 'consumption', label: '服务消耗', path: '/inventory/consumption', icon: 'ClipboardList', permission: 'core:inventory:consumption', group: 'analytics' },
    ],
    insight: {
      conclusion: '优先处理低库存和临期批次。',
      basis: '库存风险会直接影响门店服务交付和产品销售。',
      action: '查看库存管理',
      path: '/inventory/stock',
      permission: 'core:inventory:stock',
    },
  },
  default: {
    title: '我的工作台',
    subtitle: '根据当前账号权限展示可处理的数据和入口。',
    metrics: [
      {
        key: 'customers',
        label: '客户数据',
        icon: 'Users',
        tone: 'primary',
        path: '/customers/data',
        permission: 'core:customer:view',
        fallbackKeys: ['customers'],
      },
      {
        key: 'income',
        label: '今日收入',
        icon: 'TrendingUp',
        tone: 'rose',
        path: '/orders/products',
        permission: 'core:order:products',
        fallbackKeys: ['income'],
      },
      {
        key: 'inventory',
        label: '库存预警',
        icon: 'PackageCheck',
        tone: 'amber',
        path: '/inventory/stock',
        permission: 'core:inventory:stock',
        fallbackKeys: ['inventory'],
      },
      {
        key: 'campaigns',
        label: '进行中活动',
        icon: 'Megaphone',
        tone: 'slate',
        path: '/customer-marketing/workbench',
        permission: 'core:marketing:view',
        fallbackKeys: ['campaigns'],
      },
    ],
    quickActions: [
      { key: 'customers', label: '客户数据', path: '/customers/data', icon: 'Users', permission: 'core:customer:view', group: 'operation' },
      { key: 'reservations', label: '项目预约', path: '/stores/reservations', icon: 'CalendarCheck', permission: 'core:store:reservations', group: 'operation' },
      { key: 'orders', label: '订单管理', path: '/orders/products', icon: 'CreditCard', permission: 'core:order:products', group: 'operation' },
      { key: 'inventory', label: '库存管理', path: '/inventory/stock', icon: 'PackageCheck', permission: 'core:inventory:stock', group: 'management' },
      { key: 'marketing', label: '营销工作台', path: '/customer-marketing/workbench', icon: 'Sparkles', permission: 'core:marketing:view', group: 'operation' },
    ],
    insight: {
      conclusion: '当前工作台已按账号权限展示可用入口。',
      basis: '自定义角色使用权限推断，避免展示无权访问的模块。',
      action: '查看客户数据',
      path: '/customers/data',
      permission: 'core:customer:view',
    },
  },
};

export function getWorkbenchConfig(role: AdminWorkbenchRole): WorkbenchRoleConfig {
  return workbenchConfig[role] ?? workbenchConfig.default;
}
