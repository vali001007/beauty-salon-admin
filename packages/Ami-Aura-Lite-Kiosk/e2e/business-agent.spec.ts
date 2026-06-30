import { expect, test, type Page, type Route } from '@playwright/test';

type KioskRole = 'manager' | 'reception' | 'beautician';
type KioskApiMockOptions = {
  multiAccount?: boolean;
  personas?: any[] | (() => any[]);
  debugPersona?: boolean;
};
type KioskAgentRequest = {
  message: string;
  role?: string;
  context?: unknown;
  entrypoint?: string;
  personaCode?: string | null;
  operatorId?: number | null;
  activeRunId?: number | null;
  method: 'create' | 'append';
};

const store = {
  id: 1,
  name: 'Ami 全量演示门店',
  city: '上海',
  address: '上海市测试路 1 号',
  phone: '021-00000000',
  status: 'active',
  shiftRequired: false,
  skuCount: 12,
  totalValue: 38000,
  healthScore: 96,
  mode: '独立',
};

const users: Record<KioskRole, any> = {
  manager: {
    id: 101,
    username: 'manager_e2e',
    name: '林店长',
    phone: '13800000001',
    email: 'manager@example.com',
    roles: ['store_manager'],
    permissions: [
      'aura:manager:view',
      'aura:staff:read',
      'aura:customer:read',
      'aura:appointment:read',
      'aura:appointment:write',
      'aura:card:consume',
      'aura:cashier:create',
      'aura:card-order:create',
      'aura:recharge:create',
      'aura:inventory:read',
    ],
    storeIds: [1],
  },
  reception: {
    id: 102,
    username: 'reception_e2e',
    name: '周前台',
    phone: '13800000002',
    email: 'reception@example.com',
    roles: ['cashier'],
    permissions: ['aura:reception:view', 'aura:customer:read', 'aura:appointment:read', 'aura:cashier:create'],
    storeIds: [1],
  },
  beautician: {
    id: 103,
    username: 'beautician_e2e',
    name: '沈晴',
    phone: '13800000003',
    email: 'beautician@example.com',
    roles: ['beautician'],
    permissions: ['aura:beautician:view', 'aura:customer:read', 'aura:appointment:read'],
    storeIds: [1],
  },
};

const roleByUserId = new Map<number, KioskRole>(
  Object.entries(users).map(([role, user]) => [user.id, role as KioskRole]),
);

const roleDefinitions: Record<KioskRole, any> = {
  manager: {
    role: 'manager',
    title: '店长',
    subtitle: '先看经营、风险和员工，再处理门店协同',
    quickActions: [
      { label: '经营', action: 'manager.dashboard', icon: 'BarChart3' },
      { label: '排班', action: 'manager.staff', icon: 'Users' },
      { label: '客户增长', action: 'manager.customers', icon: 'Sparkles' },
      { label: '客户跟进', action: 'customer.followup', icon: 'UserPlus' },
      { label: '库存', action: 'manager.inventory', icon: 'PackageCheck' },
      { label: '预约', action: 'reception.appointments', icon: 'CalendarCheck' },
      { label: '核销', action: 'operation.verify', icon: 'CheckSquare' },
      { label: '收银', action: 'operation.cashier', icon: 'CreditCard' },
      { label: '办卡', action: 'operation.card', icon: 'Wallet' },
      { label: '充值', action: 'operation.recharge', icon: 'Wallet' },
      { label: '打印', action: 'operation.print', icon: 'Printer' },
    ],
    availableActions: [
      'manager.dashboard',
      'manager.staff',
      'manager.customers',
      'customer.followup',
      'manager.inventory',
      'business.query',
      'reception.appointments',
      'operation.verify',
      'operation.cashier',
      'operation.card',
      'operation.recharge',
      'operation.print',
    ],
  },
  reception: {
    role: 'reception',
    title: '前台',
    subtitle: '围绕接待、预约、核销和收银快速处理',
    quickActions: [
      { label: '预约', action: 'reception.appointments', icon: 'CalendarCheck' },
      { label: '客户跟进', action: 'customer.followup', icon: 'UserPlus' },
      { label: '客户增长', action: 'manager.customers', icon: 'Sparkles' },
      { label: '核销', action: 'operation.verify', icon: 'CheckSquare' },
      { label: '登记', action: 'operation.register', icon: 'UserPlus' },
      { label: '收银', action: 'operation.cashier', icon: 'CreditCard' },
    ],
    availableActions: [
      'reception.appointments',
      'customer.followup',
      'manager.customers',
      'operation.verify',
      'operation.register',
      'operation.cashier',
      'operation.card',
      'operation.recharge',
      'operation.print',
      'business.query',
    ],
  },
  beautician: {
    role: 'beautician',
    title: '美容师',
    subtitle: '只看自己的排班、客户和服务动作',
    quickActions: [
      { label: '我的预约', action: 'beautician.schedule', icon: 'CalendarCheck' },
      { label: '客户跟进', action: 'customer.followup', icon: 'UserPlus' },
      { label: '我的提成', action: 'beautician.commission', icon: 'Wallet' },
      { label: '我的客户', action: 'beautician.customer', icon: 'Users' },
      { label: '服务记录', action: 'beautician.record', icon: 'FileText' },
      { label: '护理建议', action: 'beautician.advice', icon: 'HeartPulse' },
    ],
    availableActions: [
      'beautician.schedule',
      'customer.followup',
      'beautician.commission',
      'beautician.customer',
      'beautician.record',
      'beautician.advice',
      'business.query',
    ],
  },
};

function managerPersonaWithQuestions(suggestedQuestions: string[]) {
  return {
    code: 'manager',
    name: '店长经营 Agent',
    role: 'manager',
    description: '门店每日经营总入口',
    toolGroups: ['business.query'],
    suggestedQuestions,
    enabled: true,
    version: 1,
  };
}

function defaultPersonaConfigWithoutSuggestions() {
  return [
    managerPersonaWithQuestions([]),
    {
      code: 'marketing_growth',
      name: '营销增长 Agent',
      role: 'manager',
      description: '客户增长与营销活动助手',
      toolGroups: ['marketing'],
      suggestedQuestions: [],
      enabled: true,
      version: 1,
    },
    {
      code: 'reception',
      name: '前台接待 Agent',
      role: 'reception',
      description: '预约、核销、接待助手',
      toolGroups: ['reception'],
      suggestedQuestions: [],
      enabled: true,
      version: 1,
    },
    {
      code: 'beautician',
      name: '美容师服务 Agent',
      role: 'beautician',
      description: '美容师服务助手',
      toolGroups: ['beautician'],
      suggestedQuestions: [],
      enabled: true,
      version: 1,
    },
    {
      code: 'inventory',
      name: '库存采购 Agent',
      role: 'manager',
      description: '库存和采购助手',
      toolGroups: ['inventory'],
      suggestedQuestions: [],
      enabled: true,
      version: 1,
    },
    {
      code: 'finance',
      name: '财务风控 Agent',
      role: 'manager',
      description: '财务与风控助手',
      toolGroups: ['finance'],
      suggestedQuestions: [],
      enabled: true,
      version: 1,
    },
  ];
}

const unsafeVisibleTerms = [
  'recommended',
  'opportunity',
  'urgent',
  'follow_up_priority_score',
  'staff_performance_score',
  'timeRange=',
  'limit=',
  'scope=',
  'storeId=',
  'agent:tool',
  'CustomerPredictionSnapshot',
  'TerminalFollowUpTask',
  'ProductOrder',
];

function bootstrapFor(role: KioskRole) {
  return buildBootstrap(role, { multiAccount: false });
}

function buildTerminalUser(role: KioskRole) {
  const user = users[role];
  return {
    ...user,
    availableRoles: [role],
    defaultRole: role,
    roleLabel: roleDefinitions[role].title,
    status: 'active',
    ...(role === 'beautician'
      ? {
          boundBeauticianId: 201,
          boundBeauticianName: '沈晴',
          currentBeautician: {
            id: 201,
            name: '沈晴',
            phone: '13800000003',
            level: '高级美容师',
            specialties: ['面部护理'],
            status: '在职',
            storeName: store.name,
            joinDate: '2024-01-01',
          },
        }
      : {}),
  };
}

function buildBootstrap(role: KioskRole, options: KioskApiMockOptions = {}) {
  const currentUser = users[role];
  return {
    currentUser,
    user: currentUser,
    currentStore: store,
    store,
    availableStores: [store],
    stores: [store],
    terminalUsers: options.multiAccount
      ? (Object.keys(users) as KioskRole[]).map((item) => buildTerminalUser(item))
      : [buildTerminalUser(role)],
    currentRole: role,
    availableRoles: [role],
    availableActions: roleDefinitions[role].availableActions,
    quickActions: roleDefinitions[role].quickActions,
    roleDefinition: roleDefinitions[role],
    permissions: currentUser.permissions,
    dataScopes:
      role === 'beautician'
        ? { customer: 'served_customers', order: 'served_customers', booking: 'self', report: 'self' }
        : { customer: 'own_store', order: 'own_store', booking: 'own_store', report: role === 'reception' ? 'self' : 'own_store' },
    currentBeautician:
      role === 'beautician'
        ? {
            id: 201,
            name: '沈晴',
            phone: '13800000003',
            level: '高级美容师',
            specialties: ['面部护理'],
            status: '在职',
            storeName: store.name,
            joinDate: '2024-01-01',
          }
        : null,
  };
}

function managerDashboard() {
  return {
    title: '店长经营驾驶舱',
    subtitle: store.name,
    summary: '当前门店已接入 Ami_Core 数据，优先关注经营、风险和员工协同。',
    kpis: [
      { label: '客户总数', value: '128' },
      { label: '营业额', value: '￥28,600' },
      { label: '预约客户', value: '6' },
    ],
    risks: [
      {
        title: '高价值客户沉默',
        severity: 'medium',
        reason: '马语嫣 59 天未到店。',
        action: '安排顾问今天优先联系。',
      },
    ],
    highlights: ['今日预约客户 6 位，到店 3 位'],
  };
}

function staffSchedules() {
  return [
    {
      title: '员工本周排班',
      subtitle: store.name,
      beautician: {
        id: 201,
        name: '沈晴',
        phone: '13800000003',
        level: '高级美容师',
        specialties: ['面部护理'],
        status: '在职',
        storeName: store.name,
        joinDate: '2024-01-01',
      },
      todaySlots: [
        { time: '10:00-11:00', period: '上午', available: false, status: 'busy' },
        { time: '11:00-12:00', period: '上午', available: true, status: 'normal' },
      ],
      weekSlots: [],
      utilization: '50%',
      summary: '沈晴 今日共有 2 个排班时段，占用率 50%。',
    },
  ];
}

function receptionDashboard() {
  return {
    title: '今日接待工作台',
    subtitle: store.name,
    summary: '当前共有 1 条预约待处理。',
    items: [
      {
        id: 301,
        customerId: 401,
        customerName: '李伟明',
        customerPhone: '15895260608',
        memberLevel: '银卡会员',
        tags: ['预约'],
        profileLabel: '补水护理',
        lastVisitDate: '2026-06-10',
        projectId: 501,
        projectName: '深层补水护理',
        beauticianId: 201,
        beauticianName: '沈晴',
        appointmentTime: '2026-06-18 10:30:00',
        duration: 60,
        status: 'confirmed',
        remark: '准时到店',
      },
    ],
  };
}

function beauticianDashboard() {
  return {
    beautician: {
      id: 201,
      name: '沈晴',
      phone: '13800000003',
      level: '高级美容师',
      specialties: ['面部护理'],
      status: '在职',
      storeName: store.name,
      joinDate: '2024-01-01',
    },
    date: '2026-06-18',
    schedule: {
      todaySlots: [
        { time: '10:00-11:00', period: '上午', available: false, status: 'busy' },
        { time: '11:00-12:00', period: '上午', available: true, status: 'normal' },
      ],
      weekSlots: [],
      utilization: '50%',
    },
    tasks: {
      pending: [],
      inProgress: [],
      needRecord: [],
      completedToday: [],
    },
    commission: {
      todayAmount: 120,
      monthAmount: 2860,
      monthPendingAmount: 300,
      monthConfirmedAmount: 2560,
      todayCount: 1,
      monthCount: 18,
      recentRecords: [],
      breakdown: [],
    },
    quality: {
      completedCount: 3,
      activeTaskCount: 0,
      recordedCount: 3,
      completionRate: 1,
      recordRate: 1,
      averageServiceDurationMinutes: 60,
      repeatCustomerCount: 2,
      repurchaseOpportunityCount: 1,
      revenueContributionAmount: 1200,
      highlights: ['服务记录完整'],
      suggestions: ['保持服务后回访'],
    },
    alerts: [],
    summary: '沈晴 今日暂无待提交服务记录。',
  };
}

function commissionSummary() {
  return {
    todayAmount: 120,
    monthAmount: 2860,
    monthPendingAmount: 300,
    monthConfirmedAmount: 2560,
    todayCount: 1,
    monthCount: 18,
    recentRecords: [],
    breakdown: [],
  };
}

function cashierContext() {
  return {
    title: '收银',
    subtitle: store.name,
    source: 'Ami_Core',
    generatedAt: new Date().toISOString(),
    shiftRequired: false,
    customers: [
      {
        id: 401,
        name: '李伟明',
        phone: '15895260608',
        memberLevel: '银卡会员',
        tags: ['预约'],
        isAppointedToday: true,
        appointmentTime: '10:30',
        memberCardDeductEnabled: true,
        memberCardDeductBalance: 680,
        memberCardDeductLabel: '会员余额 ¥680',
      },
    ],
    catalog: [
      {
        id: 'project-501',
        itemType: 'project',
        itemId: 501,
        name: '深层补水护理',
        category: '项目',
        price: 398,
      },
      {
        id: 'product-601',
        itemType: 'product',
        itemId: 601,
        name: '氨基酸洁面乳',
        category: '商品',
        price: 128,
      },
    ],
  };
}

function cardVerificationContext() {
  return {
    title: '次卡核销',
    subtitle: store.name,
    source: 'Ami_Core',
    generatedAt: new Date().toISOString(),
    customers: [
      {
        id: 401,
        name: '李伟明',
        phone: '15895260608',
        memberLevel: '银卡会员',
        tags: ['预约', '有次卡'],
        profileLabel: '补水护理',
        lastVisitDate: '2026-06-10',
        isAppointedToday: true,
        appointmentTime: '10:30',
        appointmentProjectName: '深层补水护理',
      },
    ],
  };
}

function customerCards() {
  return {
    id: 401,
    name: '李伟明',
    phone: '15895260608',
    memberLevel: '银卡会员',
    tags: ['预约', '有次卡'],
    profileLabel: '补水护理',
    lastVisitDate: '2026-06-10',
    isAppointedToday: true,
    appointmentTime: '10:30',
    appointmentProjectName: '深层补水护理',
    cards: [
      {
        customerCardId: 701,
        cardName: '补水护理 10 次卡',
        totalTimes: 10,
        remainingTimes: 6,
        expiryDate: '2026-12-31',
        status: 'active',
        projects: [
          {
            id: 501,
            name: '深层补水护理',
            times: 1,
            remainingAfterUse: 5,
          },
        ],
      },
    ],
  };
}

function cardOpeningContext() {
  return {
    title: '办卡开单',
    subtitle: store.name,
    source: 'Ami_Core',
    generatedAt: new Date().toISOString(),
    customers: [
      {
        id: 401,
        name: '李伟明',
        phone: '15895260608',
        memberLevel: '银卡会员',
        tags: ['预约'],
        isAppointedToday: true,
        appointmentTime: '10:30',
      },
    ],
    cards: [
      {
        id: 801,
        name: '补水护理 10 次卡',
        type: '护理次卡',
        totalTimes: 10,
        price: 2680,
        validDays: 365,
        projects: ['深层补水护理'],
      },
    ],
    giftProjects: ['深层补水护理'],
  };
}

function rechargeContext() {
  return {
    title: '会员充值',
    subtitle: store.name,
    source: 'Ami_Core',
    generatedAt: new Date().toISOString(),
    customers: [
      {
        id: 401,
        name: '李伟明',
        phone: '15895260608',
        memberLevel: '银卡会员',
        tags: ['预约'],
        isAppointedToday: true,
        appointmentTime: '10:30',
      },
    ],
    giftProjects: ['深层补水护理'],
  };
}

function coreNaturalLanguageResult(role: KioskRole, message: string) {
  const coreCases: Array<{
    match: RegExp;
    runId: number;
    answer: string;
    title: string;
    columns: string[];
    rows: string[][];
    source: string[];
  }> = [
    {
      match: /这个月.*营业额|本月.*营收|本月.*营业额/,
      runId: 9101,
      answer: '本月营业额为 ￥263,794.10，现金收入 ￥221,580.00，订单 84 笔。',
      title: '本月经营收入',
      columns: ['指标', '数值', '口径'],
      rows: [
        ['营业收入', '￥263,794.10', '本月已完成订单'],
        ['现金收入', '￥221,580.00', '现金/微信/支付宝实收'],
        ['订单', '84 笔', '收银、核销、办卡订单合计'],
      ],
      source: ['订单', '支付记录'],
    },
    {
      match: /昨天.*(消费|成交).*客户|昨日.*成交.*客户/,
      runId: 9102,
      answer: '昨天共有 3 位消费客户，优先关注马美琳和刘思琪的复购承接。',
      title: '昨日消费客户清单',
      columns: ['客户', '消费金额', '最近服务', '建议动作'],
      rows: [
        ['马美琳', '￥1,680', '水光护理', '安排 7 天复购回访'],
        ['刘思琪', '￥980', '肩颈护理', '推荐疗程续购'],
        ['陈悠然', '￥398', '深层清洁', '发送护理注意事项'],
      ],
      source: ['订单', '客户', '服务记录'],
    },
    {
      match: /产品.*(快过期|临期)|临期.*产品|哪些.*临期/,
      runId: 9103,
      answer: '当前有 2 个临期库存批次，建议先做项目消耗或促销组合。',
      title: '临期库存产品',
      columns: ['产品', '批次', '剩余数量', '到期日'],
      rows: [
        ['舒缓修护精华', 'B202606', '6', '2026-07-15'],
        ['水光补水面膜', 'B202607', '18', '2026-07-30'],
      ],
      source: ['库存批次', '产品'],
    },
    {
      match: /这个月.*(谁|员工|美容师).*业绩.*(最好|最高)|本月.*表现.*好/,
      runId: 9104,
      answer: '本月业绩最好的是宋乔，销售额 ￥12,112.54，服务 18 次。',
      title: '本月员工业绩排行',
      columns: ['员工', '等级', '销售额', '服务次数'],
      rows: [
        ['宋乔', '明星顾问', '￥12,112.54', '18 次'],
        ['沈晴', '初级美容师', '￥8,920.00', '14 次'],
        ['顾然', '高级美容师', '￥7,680.00', '11 次'],
      ],
      source: ['员工', '订单明细', '服务任务'],
    },
    {
      match: /(紧急|优先).*召回.*客户|需要.*召回.*客户/,
      runId: 9105,
      answer: '已列出 10 位需要紧急召回的客户，优先从高价值沉默客户开始。',
      title: '紧急召回客户 Top10',
      columns: ['客户', '会员等级', '未到店天数', '召回建议'],
      rows: [
        ['马美琳', '金卡会员', '76 天', '电话邀约复购护理'],
        ['刘思琪', '银卡会员', '63 天', '发送专属回访券'],
        ['胡静怡', '金卡会员', '58 天', '安排顾问跟进'],
      ],
      source: ['客户', '订单', '服务记录'],
    },
    {
      match: /今天.*(所有)?预约.*列|今日.*预约.*清单/,
      runId: 9106,
      answer: '今天共有 4 条预约，其中 2 条已到店，2 条待确认。',
      title: '今日预约清单',
      columns: ['时间', '客户', '项目', '状态'],
      rows: [
        ['10:30', '李伟明', '深层补水护理', '已到店'],
        ['14:00', '马美琳', '肩颈护理', '待确认'],
        ['16:00', '陈悠然', '皮肤管理', '待确认'],
      ],
      source: ['预约', '排班'],
    },
    {
      match: /今天.*(收银|核销|办卡).*订单.*列表|今日.*订单.*列表/,
      runId: 9107,
      answer: '今天共有 5 笔业务订单：收银 2 笔、核销 2 笔、办卡 1 笔，可继续打印明细。',
      title: '今日业务订单列表',
      columns: ['类型', '客户', '金额/次数', '操作'],
      rows: [
        ['收银', '李伟明', '￥398', '可打印'],
        ['核销', '陈悠然', '1 次', '可打印'],
        ['办卡', '马美琳', '￥2,680', '可打印'],
      ],
      source: ['订单', '核销记录', '卡项订单'],
    },
    {
      match: /本月.*利润.*(下降|为什么)|毛利.*下降/,
      runId: 9108,
      answer: '本月利润率下降主要来自耗材成本上升和折扣增加，建议先复核高折扣订单。',
      title: '利润下降原因',
      columns: ['原因', '影响', '建议'],
      rows: [
        ['耗材成本上升', '毛利率下降 4.2%', '复核高消耗项目'],
        ['折扣增加', '收入减少 ￥6,800', '收紧折扣审批'],
      ],
      source: ['订单', '成本', '折扣记录'],
    },
    {
      match: /我今天.*几个客人|今天.*服务.*几个客人/,
      runId: 9109,
      answer:
        role === 'beautician'
          ? '你今天有 3 位预约客户，1 位已到店，2 位待服务。'
          : '当前问题更适合美容师视角查看；店长可查看全店预约和员工排班。',
      title: '我的今日客户',
      columns: ['时间', '客户', '项目', '状态'],
      rows: [
        ['10:30', '李伟明', '深层补水护理', '已到店'],
        ['14:00', '马美琳', '肩颈护理', '待服务'],
        ['16:00', '陈悠然', '皮肤管理', '待服务'],
      ],
      source: ['预约', '美容师排班'],
    },
    {
      match: /设置.*客户.*\d+天.*(自动提醒|提醒)|客户.*自动提醒/,
      runId: 9110,
      answer: '可以创建“45 天未到店自动提醒”草稿，发送前需要店长确认。',
      title: '自动提醒规则草稿',
      columns: ['规则', '触发条件', '执行方式'],
      rows: [['45 天未到店提醒', '客户 45 天未到店', '生成待确认回访任务']],
      source: ['客户', '自动化规则'],
    },
  ];

  const matched = coreCases.find((item) => item.match.test(message));
  if (!matched) return null;

  return {
    runId: matched.runId,
    runNo: `E2E-CORE-${matched.runId}`,
    status: 'completed',
    plan: {
      intentType: 'query',
      goal: message,
      toolPlan: [{ tool: 'business.query.ask', args: { question: message } }],
      confidence: 0.9,
      clarificationNeeded: false,
    },
    answer: matched.answer,
    followUpSuggestions: ['查看明细', '生成跟进动作', '导出结果'],
    renderedBlocks: [
      {
        kind: 'summary_text',
        content: matched.answer,
      },
      {
        kind: 'table',
        title: matched.title,
        columns: matched.columns,
        rows: matched.rows,
      },
    ],
    toolResults: [
      {
        status: 'success',
        title: matched.title,
        summary: matched.answer,
        data: { items: matched.rows },
        evidence: {
          source: matched.source,
          dateRange: 'E2E 固定样本',
          metricDefinition: matched.title,
          filters: ['当前门店'],
          sampleSize: matched.rows.length,
        },
        actions: [{ label: '查看明细', action: 'agent:tool:detail', riskLevel: 'low' }],
      },
    ],
    actions: [],
    evidence: {
      source: matched.source,
      dateRange: 'E2E 固定样本',
      metricDefinition: matched.title,
      filters: ['当前门店'],
      sampleSize: matched.rows.length,
    },
  };
}

function agentRunFor(role: KioskRole, message: string) {
  if (message.includes('中风险草稿审批')) {
    return {
      runId: 9020,
      runNo: 'E2E-APPROVAL-PENDING',
      status: 'waiting_approval',
      plan: {
        intentType: 'action_execution',
        goal: message,
        toolPlan: [{ tool: 'marketing.activity.draft', args: { segment: '高价值客户' } }],
        confidence: 0.89,
        clarificationNeeded: false,
      },
      answer: '该动作会创建营销活动草稿，需要店长确认后执行。',
      approval: {
        id: 701,
        toolName: 'marketing.activity.draft',
        riskLevel: 'medium',
        status: 'pending',
        reason: '创建营销活动草稿会写入业务数据，需要人工确认。',
      },
      renderedBlocks: [
        {
          kind: 'confirm_action',
          title: '创建营销活动草稿',
          preview: '目标客群：高价值客户；活动类型：复购承接。',
          actionId: 'approve:701',
          riskLevel: 'medium',
          impactSummary: '确认后才会写入营销活动草稿。',
        },
      ],
      toolResults: [],
      actions: [],
      evidence: {
        source: ['AgentPolicy', 'AgentApproval'],
        dateRange: '当前会话',
        metricDefinition: '中风险动作审批',
        filters: ['requiresApproval=true'],
        sampleSize: 1,
      },
    };
  }

  if (message.includes('没有数据') || message.includes('无数据')) {
    return {
      runId: 9010,
      runNo: 'E2E-NO-DATA',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: message,
        toolPlan: [{ tool: 'customer.priority.rank', args: { limit: 10 } }],
        confidence: 0.82,
        clarificationNeeded: false,
      },
      answer: '当前筛选条件下暂无符合条件的客户，已说明统计范围和缺失原因，没有生成假名单。',
      toolResults: [
        {
          status: 'no_data',
          title: '客户优先跟进',
          summary: '当前门店在所选周期内没有符合条件的高优先级客户。',
          data: { items: [] },
          evidence: {
            source: ['Customer', 'Reservation'],
            dateRange: '近 30 天',
            metricDefinition: '客户跟进优先评分',
            filters: ['当前门店', '最多返回 10 条'],
            sampleSize: 0,
            limitations: ['样本量为 0，不能生成客户名单。'],
          },
          actions: [],
        },
      ],
      actions: [],
      evidence: {
        source: ['Customer'],
        dateRange: '近 30 天',
        metricDefinition: '客户跟进优先评分',
        filters: ['当前门店'],
        sampleSize: 0,
      },
    };
  }

  if (message.includes('暂不支持')) {
    return {
      runId: 9014,
      runNo: 'E2E-UNSUPPORTED',
      status: 'completed',
      plan: {
        intentType: 'query',
        goal: message,
        toolPlan: [{ tool: 'unsupported.metric.query', args: { question: message } }],
        confidence: 0.74,
        clarificationNeeded: false,
      },
      answer: '当前暂不支持查询这个指标。',
      toolResults: [
        {
          status: 'unsupported',
          title: '暂不支持',
          summary: '当前暂不支持查询这个指标。',
          actions: [],
        },
      ],
      actions: [],
      evidence: {
        source: ['CapabilityRegistry'],
        dateRange: '当前能力集',
        metricDefinition: '能力边界',
        filters: ['当前角色'],
        sampleSize: 0,
      },
    };
  }

  if (message.includes('模拟失败')) {
    return {
      runId: 9015,
      runNo: 'E2E-FAILED',
      status: 'failed',
      plan: {
        intentType: 'query',
        goal: message,
        toolPlan: [{ tool: 'inventory.risk.rank', args: { question: message } }],
        confidence: 0.74,
        clarificationNeeded: false,
      },
      answer: '库存数据加载失败。',
      toolResults: [
        {
          status: 'failed',
          title: '库存工具失败',
          summary: '库存数据加载失败。',
          actions: [],
        },
      ],
      actions: [],
      evidence: {
        source: ['Inventory'],
        dateRange: '当前门店',
        metricDefinition: '库存风险查询',
        filters: ['当前门店'],
        sampleSize: 0,
      },
    };
  }

  if (/老朋友回店护理礼.*(活动)?链接.*发我|回店护理礼.*链接/.test(message)) {
    return {
      runId: 9111,
      runNo: 'E2E-LINK-CARD-9111',
      status: 'completed',
      plan: {
        intentType: 'query',
        goal: message,
        toolPlan: [{ tool: 'business.query.ask', args: { question: message } }],
        confidence: 0.92,
        clarificationNeeded: false,
      },
      answer: '已找到“老朋友回店护理礼”的活动链接，可直接复制发送给客户。',
      followUpSuggestions: ['查看活动数据', '复制小程序路径', '生成回访话术'],
      renderedBlocks: [
        {
          kind: 'summary_text',
          content: '已找到“老朋友回店护理礼”的活动链接，可直接复制发送给客户。',
        },
        {
          kind: 'link_card',
          title: '老朋友回店护理礼',
          description: '活动已发布，链接来自 MarketingPage 真实推广页。',
          primaryUrl: 'https://m.ami.example.com/m/old-friend-care',
          miniappPath: '/pages/marketing/old-friend-care',
          statusLabel: '已发布',
          links: [
            { label: '活动链接', value: 'https://m.ami.example.com/m/old-friend-care', type: 'url' },
            { label: '小程序路径', value: '/pages/marketing/old-friend-care', type: 'miniapp_path' },
          ],
          actions: [{ label: '查看活动列表', actionId: 'marketing:activities:open', riskLevel: 'low' }],
        },
      ],
      toolResults: [
        {
          status: 'success',
          title: '营销活动链接',
          summary: '已找到“老朋友回店护理礼”的活动链接。',
          data: {
            items: [
              {
                活动名称: '老朋友回店护理礼',
                活动链接: 'https://m.ami.example.com/m/old-friend-care',
                小程序路径: '/pages/marketing/old-friend-care',
              },
            ],
          },
          evidence: {
            source: ['MarketingActivity', 'MarketingPage'],
            dateRange: '当前门店',
            metricDefinition: '营销活动链接查询',
            filters: ['当前门店', '活动已发布'],
            sampleSize: 1,
          },
          actions: [{ label: '查看活动列表', action: 'marketing:activities:open', riskLevel: 'low' }],
        },
      ],
      actions: [],
      evidence: {
        source: ['MarketingActivity', 'MarketingPage'],
        dateRange: '当前门店',
        metricDefinition: '营销活动链接查询',
        filters: ['当前门店', '活动已发布'],
        sampleSize: 1,
      },
    };
  }

  const coreResult = coreNaturalLanguageResult(role, message);
  if (coreResult) return coreResult;

  if (message.includes('财务毛利') && role !== 'manager') {
    return {
      runId: 9011,
      runNo: 'E2E-PERMISSION',
      status: 'completed',
      plan: {
        intentType: 'clarify',
        goal: message,
        toolPlan: [],
        confidence: 0.9,
        clarificationNeeded: true,
      },
      answer: '当前账号无权查看财务毛利数据。可查看本人或接待范围内的数据，财务分析需由店长账号查看。',
      toolResults: [],
      actions: [],
      evidence: {
        source: ['RolePermission'],
        dateRange: '当前登录态',
        metricDefinition: '账号权限校验',
        filters: ['当前角色权限'],
        sampleSize: 0,
      },
    };
  }

  if (message.includes('员工表现') && message.includes('隐私字段')) {
    return {
      runId: 9012,
      runNo: 'E2E-FIELD-SCOPE',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: message,
        toolPlan: [{ tool: 'card.diagnose', args: { limit: 10 } }],
        confidence: 0.88,
        clarificationNeeded: false,
      },
      answer: '已按当前账号字段权限返回客户卡项摘要，手机号已脱敏，余额仅显示可查看口径。',
      renderedBlocks: [
        {
          kind: 'summary_text',
          content: '已按当前账号字段权限返回客户卡项摘要，手机号已脱敏，余额仅显示可查看口径。',
        },
        {
          kind: 'table',
          title: '客户卡项摘要',
          columns: ['客户', '手机号', '建议'],
          rows: [['周梦瑶', '138****5058', '建议优先跟进']],
        },
      ],
      toolResults: [
        {
          status: 'success',
          title: '卡项与会员卡诊断',
          summary: '客户可继续回访，隐私字段已按权限处理。',
          data: {
            items: [
              {
                customerName: '周梦瑶',
                customerPhone: '138****5058',
                memberLevel: '银卡会员',
                balanceText: '￥680',
                priority: 'recommended',
              },
            ],
          },
          evidence: {
            source: ['Customer', 'CustomerCard'],
            dateRange: '近 30 天',
            metricDefinition: '会员卡余额分析',
            filters: ['当前门店', '最多返回 10 条'],
            sampleSize: 1,
          },
          actions: [],
        },
      ],
      actions: [],
      evidence: {
        source: ['Customer', 'CustomerCard'],
        dateRange: '近 30 天',
        metricDefinition: '会员卡余额分析',
        filters: ['当前门店'],
        sampleSize: 1,
      },
    };
  }

  if (message.includes('这些客户')) {
    return {
      runId: 9013,
      runNo: 'E2E-FOLLOW-UP',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: message,
        toolPlan: [{ tool: 'customer.followup.task.draft', args: { usePreviousRun: true } }],
        confidence: 0.87,
        clarificationNeeded: false,
      },
      answer: '已基于上一轮客户名单生成跟进建议，未重新解释为新的客户检索问题。',
      followUpSuggestions: ['查看客户明细', '生成跟进任务草稿', '看看最近服务记录'],
      renderedBlocks: [
        {
          kind: 'summary_text',
          content: '已基于上一轮客户名单生成跟进建议，未重新解释为新的客户检索问题。',
        },
        {
          kind: 'table',
          title: '跟进建议',
          columns: ['客户', '建议'],
          rows: [['沈晴', '安排顾问今天完成电话回访。']],
        },
      ],
      toolResults: [
        {
          status: 'success',
          title: '连续追问跟进建议',
          summary: '已沿用上一轮 Agent 结果中的客户名单。',
          data: {
            items: [
              {
                customerName: '沈晴',
                suggestion: '安排顾问今天完成电话回访。',
                priority: 'recommended',
              },
            ],
          },
          evidence: {
            source: ['AgentRun', 'Customer'],
            dateRange: '上一轮上下文',
            metricDefinition: '连续追问上下文',
            filters: ['沿用上一轮结果'],
            sampleSize: 1,
          },
          actions: [{ label: '生成跟进任务草稿', action: '生成跟进任务草稿', riskLevel: 'medium' }],
        },
      ],
      actions: [],
      evidence: {
        source: ['AgentRun'],
        dateRange: '上一轮上下文',
        metricDefinition: '连续追问上下文',
        filters: ['沿用上一轮结果'],
        sampleSize: 1,
      },
    };
  }

  const answer =
    role === 'manager'
      ? '已按要求返回近期表现较好的员工。优先建议关注沈晴，原因是服务完成率、客户复购和销售贡献综合靠前。'
      : role === 'reception'
        ? '已按前台权限返回可执行的经营建议。前台可查看接待相关线索，涉及活动配置需交由店长确认。'
        : '已按美容师权限返回本人可查看建议。美容师仅查看本人服务、客户和护理建议，全店员工排行需由店长查看。';

  return {
    runId: role === 'manager' ? 9001 : role === 'reception' ? 9002 : 9003,
    runNo: `E2E-${role}`,
    status: 'completed',
    plan: {
      intentType: 'analysis_and_recommendation',
      goal: message,
      toolPlan: [{ tool: role === 'manager' ? 'staff.performance.rank' : 'business.query.ask', args: { limit: 10 } }],
      confidence: 0.86,
      clarificationNeeded: false,
    },
    answer,
    followUpSuggestions: ['查看员工明细', '对比上月变化', '生成跟进建议'],
    renderedBlocks: [
      {
        kind: 'summary_text',
        content: answer,
      },
      {
        kind: 'table',
        title: role === 'manager' ? '员工表现排行' : '角色权限内经营回复',
        columns:
          role === 'manager'
            ? ['员工', '评分', '销售额']
            : ['客户', '等级', '优先级'],
        rows:
          role === 'manager'
            ? [['沈晴', '86', '12800']]
            : [[role === 'reception' ? '李伟明' : '陈诗涵', '银卡会员', 'opportunity']],
      },
    ],
    toolResults: [
      {
        status: 'success',
        title: role === 'manager' ? '员工表现排行' : '角色权限内经营回复',
        summary:
          role === 'manager'
            ? '已返回 1 位表现较好的员工，依据服务完成、客户复购和销售贡献综合判断。'
            : '已按当前账号角色过滤可查看范围。',
        data: {
          items:
            role === 'manager'
              ? [
                  {
                    beauticianName: '沈晴',
                    performanceScore: 86,
                    performanceLevel: 'recommended',
                    serviceCount: 8,
                    salesAmount: 12800,
                    commissionAmountText: '￥980',
                    priority: 'recommended',
                  },
                ]
              : [
                  {
                    customerName: role === 'reception' ? '李伟明' : '陈诗涵',
                    memberLevel: '银卡会员',
                    priority: 'opportunity',
                    lastVisitDays: 36,
                  },
                ],
        },
        evidence: {
          source: ['员工', '客户'],
          dateRange: '近 30 天',
          metricDefinition:
            role === 'manager'
              ? 'staff_performance_score 综合评分'
              : 'follow_up_priority_score 综合评分',
          filters: ['storeId=当前门店', 'timeRange=近30天', 'limit=10', role === 'manager' ? 'scope=全店员工' : 'scope=本人'],
          sampleSize: 1,
        },
        actions: [{ label: role === 'manager' ? '查看员工明细' : '查看详情', action: 'agent:tool:detail', riskLevel: 'low' }],
      },
    ],
    actions: [],
    evidence: {
      source: ['客户'],
      dateRange: '近 30 天',
      metricDefinition: 'follow_up_priority_score 综合评分',
      filters: ['storeId=当前门店', 'limit=10'],
    },
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installApiMocks(
  page: Page,
  role: KioskRole,
  agentRequests: KioskAgentRequest[],
  options: KioskApiMockOptions & {
    bootstrapRequests?: Array<{ operatorId: number | null; role: KioskRole }>;
    approvalRequests?: Array<{ id: number; method: string; body: unknown }>;
  } = {},
) {
  const user = users[role];
  const followUpTasks: any[] = [
    {
      id: 12,
      customerId: 21,
      customerName: '马语嫣',
      customerPhone: '13873801982',
      customerMemberLevel: '钻石会员',
      status: 'pending',
      priority: 'recommended',
      assigneeRole: role === 'beautician' ? 'consultant' : role,
      assigneeUserId: user.id,
      assigneeUserName: user.name,
      title: '邀约复购护理',
      script: '提醒客户本周可预约复购护理，并说明会员专属活动。',
      note: '管理端下发的高价值客户跟进任务',
      dueAt: '2026-06-18T18:00:00.000Z',
      createdAt: '2026-06-17T10:00:00.000Z',
    },
  ];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '') || '/';

    if (!url.pathname.startsWith('/api')) {
      await route.fallback();
      return;
    }

    if (path === '/auth/csrf-token') return fulfillJson(route, { token: 'csrf-e2e' });
    if (path === '/auth/login') return fulfillJson(route, { token: `token-${role}`, user });
    if (path === '/auth/user-info') return fulfillJson(route, user);
    if (path === '/agent/personas') {
      const configuredPersonas = typeof options.personas === 'function' ? options.personas() : options.personas;
      return fulfillJson(route, configuredPersonas ?? defaultPersonaConfigWithoutSuggestions());
    }
    if (path === '/ai/terminal/resolve-intent') {
      return fulfillJson(route, {
        action: 'business.query',
        confidence: 0.92,
        slots: {},
        missingSlots: [],
        reason: 'e2e routes text and voice business questions through Agent Runtime',
      });
    }
    if (path === '/stores/accessible' || path === '/stores') return fulfillJson(route, [store]);
    if (path === '/terminal/bootstrap') {
      const operatorIdParam = url.searchParams.get('operatorId');
      const operatorId = operatorIdParam ? Number(operatorIdParam) : null;
      const requestedRole = operatorId && roleByUserId.has(operatorId) ? roleByUserId.get(operatorId)! : role;
      options.bootstrapRequests?.push({ operatorId, role: requestedRole });
      return fulfillJson(route, buildBootstrap(requestedRole, options));
    }
    if (path === '/terminal/dashboard/manager') return fulfillJson(route, managerDashboard());
    if (path === '/terminal/dashboard/staff-schedules') return fulfillJson(route, staffSchedules());
    if (path === '/terminal/dashboard/today-reservations') return fulfillJson(route, receptionDashboard());
    if (path === '/terminal/dashboard/customer-growth') return fulfillJson(route, { title: '客户增长', subtitle: store.name, summary: '暂无新增风险', items: [] });
    if (path === '/terminal/dashboard/inventory-alerts') {
      return fulfillJson(route, { lowStock: [], expiring: [], replenishment: [], summary: '库存暂无明显风险', generatedAt: new Date().toISOString(), storeName: store.name });
    }
    if (path === '/terminal/follow-up-tasks') {
      const status = url.searchParams.get('status');
      const items = status ? followUpTasks.filter((task) => task.status === status) : followUpTasks;
      return fulfillJson(route, {
        items,
        total: items.length,
        page: 1,
        pageSize: 20,
        summary: {
          pending: followUpTasks.filter((task) => task.status === 'pending').length,
          inProgress: followUpTasks.filter((task) => task.status === 'in_progress').length,
          completed: followUpTasks.filter((task) => task.status === 'completed').length,
          expired: followUpTasks.filter((task) => task.status === 'expired').length,
          overdue: 0,
        },
      });
    }
    const startFollowUpMatch = path.match(/^\/terminal\/follow-up-tasks\/(\d+)\/start$/);
    if (startFollowUpMatch) {
      const task = followUpTasks.find((item) => item.id === Number(startFollowUpMatch[1]));
      if (task) task.status = 'in_progress';
      return fulfillJson(route, task ?? { message: 'not found' }, task ? 200 : 404);
    }
    const completeFollowUpMatch = path.match(/^\/terminal\/follow-up-tasks\/(\d+)\/complete$/);
    if (completeFollowUpMatch) {
      const payload = request.postDataJSON() as { resultType?: string; result?: string; note?: string };
      const task = followUpTasks.find((item) => item.id === Number(completeFollowUpMatch[1]));
      if (task) {
        task.status = 'completed';
        Object.assign(task, {
          resultType: payload.resultType ?? 'contacted',
          resultNote: payload.result ?? payload.note ?? '已完成客户跟进',
          completedAt: '2026-06-18T10:30:00.000Z',
        });
      }
      return fulfillJson(route, task ?? { message: 'not found' }, task ? 200 : 404);
    }
    if (path === '/terminal/beautician/dashboard') return fulfillJson(route, beauticianDashboard());
    if (path === '/terminal/commission/records/beautician-summary') return fulfillJson(route, commissionSummary());
    if (path === '/terminal/context/cashier') return fulfillJson(route, cashierContext());
    if (path === '/terminal/context/card-verification') {
      return fulfillJson(route, cardVerificationContext());
    }
    if (path === '/terminal/context/card-verification/customer-cards') return fulfillJson(route, customerCards());
    if (path === '/terminal/context/card-opening') return fulfillJson(route, cardOpeningContext());
    if (path === '/terminal/context/recharge') return fulfillJson(route, rechargeContext());
    if (path === '/terminal/sync/catalog') return fulfillJson(route, { customers: [], projects: [], beauticians: [], cards: [], products: [] });
    if (path === '/terminal/conversations/save') return fulfillJson(route, { id: 1, role, messages: [] });
    const approvalDecisionMatch = path.match(/^\/agent\/approvals\/(\d+)\/(approve|reject)$/);
    if (approvalDecisionMatch) {
      const approvalId = Number(approvalDecisionMatch[1]);
      const decision = approvalDecisionMatch[2];
      options.approvalRequests?.push({
        id: approvalId,
        method: decision,
        body: request.postDataJSON(),
      });
      return fulfillJson(route, {
        runId: 9020,
        runNo: `E2E-APPROVAL-${decision.toUpperCase()}`,
        status: decision === 'approve' ? 'completed' : 'cancelled',
        plan: {
          intentType: 'action_execution',
          goal: '中风险草稿审批',
          toolPlan: [{ tool: 'marketing.activity.draft', args: { segment: '高价值客户' } }],
          confidence: 0.89,
          clarificationNeeded: false,
        },
        answer:
          decision === 'approve'
            ? '已在审批通过后创建营销活动草稿。'
            : '已拒绝执行该 Agent 动作，未写入任何业务数据。',
        approval: {
          id: approvalId,
          toolName: 'marketing.activity.draft',
          riskLevel: 'medium',
          status: decision === 'approve' ? 'approved' : 'rejected',
          reason: '创建营销活动草稿会写入业务数据，需要人工确认。',
        },
        renderedBlocks: [
          {
            kind: 'summary_text',
            content:
              decision === 'approve'
                ? '已在审批通过后创建营销活动草稿。'
                : '已拒绝执行该 Agent 动作，未写入任何业务数据。',
          },
        ],
        toolResults: [
          {
            status: decision === 'approve' ? 'success' : 'cancelled',
            title: '营销活动草稿',
            summary:
              decision === 'approve'
                ? '审批后创建草稿成功。'
                : '审批拒绝，未执行工具。',
            data: {},
            actions: [],
          },
        ],
        actions: [],
        evidence: {
          source: ['AgentApproval'],
          dateRange: '当前会话',
          metricDefinition: '审批后执行',
          filters: [`approvalId=${approvalId}`],
          sampleSize: 1,
        },
      });
    }
    const appendAgentMessageMatch = path.match(/^\/agent\/runs\/(\d+)\/messages$/);
    if (appendAgentMessageMatch) {
      const payload = request.postDataJSON() as { message?: string; role?: string; context?: unknown; entrypoint?: string; personaCode?: string | null; operatorId?: number | null };
      agentRequests.push({
        message: payload.message ?? '',
        role: payload.role,
        context: payload.context,
        entrypoint: payload.entrypoint,
        personaCode: payload.personaCode,
        operatorId: payload.operatorId,
        activeRunId: Number(appendAgentMessageMatch[1]),
        method: 'append',
      });
      const requestRole = payload.role === 'manager' || payload.role === 'reception' || payload.role === 'beautician' ? payload.role : role;
      return fulfillJson(route, {
        ...agentRunWithRoute(requestRole, payload.message ?? ''),
        runId: Number(appendAgentMessageMatch[1]),
      });
    }
    if (path === '/agent/runs') {
      const payload = request.postDataJSON() as { message?: string; role?: string; context?: unknown; entrypoint?: string; personaCode?: string | null; operatorId?: number | null };
      agentRequests.push({
        message: payload.message ?? '',
        role: payload.role,
        context: payload.context,
        entrypoint: payload.entrypoint,
        personaCode: payload.personaCode,
        operatorId: payload.operatorId,
        activeRunId: null,
        method: 'create',
      });
      const requestRole = payload.role === 'manager' || payload.role === 'reception' || payload.role === 'beautician' ? payload.role : role;
      return fulfillJson(route, agentRunWithRoute(requestRole, payload.message ?? ''));
    }

    return fulfillJson(route, {});
  });
}

async function openKiosk(
  page: Page,
  role: KioskRole,
  agentRequests: KioskAgentRequest[],
  options?: KioskApiMockOptions & {
    bootstrapRequests?: Array<{ operatorId: number | null; role: KioskRole }>;
    approvalRequests?: Array<{ id: number; method: string; body: unknown }>;
  },
) {
  await installApiMocks(page, role, agentRequests, options);
  await page.goto(options?.debugPersona ? '/login?debugPersona=1' : '/login');
  const loginButton = page.getByRole('button', { name: '登录终端' });
  if (await loginButton.isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: '账号' }).fill('admin');
    await page.getByRole('textbox', { name: '密码' }).fill('11111111');
    await loginButton.click();
  }
  await expect(page.locator('input[placeholder*="例如"]').first()).toBeVisible();
}

function routeDecisionFor(role: KioskRole, message: string) {
  const text = message.toLowerCase();
  const personaCode =
    role === 'beautician'
      ? 'beautician'
      : /库存|临期|快过期|过期|补货|采购/.test(text)
        ? 'inventory'
        : /利润|财务|毛利|退款|折扣/.test(text)
          ? role === 'manager'
            ? 'finance'
            : 'reception'
          : /营业额|营收|收入|流水|经营/.test(text)
            ? 'manager'
          : /营销|活动|召回|复购|自动提醒|自动化/.test(text)
            ? role === 'reception'
              ? 'marketing'
              : 'marketing'
            : /预约|客户|卡项|权益|收银|核销|办卡|充值/.test(text)
              ? 'reception'
              : role === 'manager'
                ? 'manager'
                : role;
  return {
    personaCode,
    confidence: 0.88,
    reason: `E2E 自动分诊到 ${personaCode} Agent`,
    candidates: [{ personaCode, score: 0.88, matchedCapabilities: [message] }],
    clarificationNeeded: false,
    clarificationQuestion: null,
    deniedReason: null,
    mode: 'auto',
  };
}

function agentRunWithRoute(role: KioskRole, message: string) {
  const result = agentRunFor(role, message);
  const routeDecision = routeDecisionFor(role, message);
  return {
    ...result,
    personaCode: routeDecision.personaCode,
    routeDecision,
  };
}

async function submitQuestion(page: Page, question: string) {
  const input = page.locator('input[placeholder*="例如"]').first();
  await input.fill(question);
  await input.press('Enter');
}

async function visiblePageText(page: Page) {
  return page.locator('body').innerText();
}

test.describe('Ami Aura Lite 经营 Agent Browser Eval', () => {
  test('默认隐藏角色 Agent 切换，普通提问由后端自动分诊', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'manager', agentRequests);

    await expect(page.getByRole('button', { name: /店长经营/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /库存采购/ })).toHaveCount(0);

    await submitQuestion(page, '近期有哪些临期库存产品');

    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({
      message: '近期有哪些临期库存产品',
      role: 'manager',
      personaCode: undefined,
      method: 'create',
    });
    await expect(page.getByText('由 库存采购 Agent 处理').last()).toBeVisible();
  });

  test('debugPersona 模式显示角色 Agent 切换并允许强制指定 Persona', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'manager', agentRequests, { debugPersona: true });

    await expect(page.getByRole('button', { name: /店长经营/ })).toBeVisible();
    await page.getByRole('button', { name: /库存采购/ }).click();
    await submitQuestion(page, '近期有哪些临期库存产品');

    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({
      message: '近期有哪些临期库存产品',
      role: 'manager',
      personaCode: 'inventory',
      method: 'create',
    });
  });

  test('店长自然语言问员工表现时保留用户输入，并用单一卡片展示概述、明细和下一步动作', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'manager', agentRequests);

    await submitQuestion(page, '近期表现较好的员工');

    await expect(page.locator('.rounded-tr-md', { hasText: '近期表现较好的员工' })).toBeVisible();
    await expect(page.getByText('Ami 智能问答').last()).toBeVisible();
    await expect(page.getByText('已按要求返回近期表现较好的员工').last()).toBeVisible();
    await expect(page.getByText('沈晴').last()).toBeVisible();
    await expect(page.getByRole('button', { name: '查看员工明细' }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: '生成跟进建议' }).last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({
      message: '近期表现较好的员工',
      role: 'manager',
      entrypoint: 'terminal:kiosk',
      personaCode: undefined,
      operatorId: 101,
      method: 'create',
    });
    await expect(page.getByText('由 店长经营 Agent 处理').last()).toBeVisible();

    const text = await visiblePageText(page);
    for (const term of unsafeVisibleTerms) {
      expect(text).not.toContain(term);
    }
    for (const term of ['统计周期：', '数据来源：', '统计口径：', '过滤：', '样本量：', '限制：', '员工表现评分', '最多返回 10 条']) {
      expect(text).not.toContain(term);
    }
  });

  test('快捷按钮不纳入 AI 识别，不产生用户输入泡泡，也不调用 Agent', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'manager', agentRequests);

    await page.getByRole('button', { name: '排班' }).click();

    await expect(page.getByRole('heading', { name: '员工排班' }).last()).toBeVisible();
    await expect(page.locator('.rounded-tr-md', { hasText: /^排班$/ })).toHaveCount(0);
    expect(agentRequests).toHaveLength(0);
  });

  test('10 条核心自然语言问题均进入 Agent 并展示自动分诊后的业务回答', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'manager', agentRequests);

    const coreCases = [
      {
        question: '老朋友回店护理礼活动链接发我',
        answer: '已找到“老朋友回店护理礼”的活动链接',
        badge: '由 营销增长 Agent 处理',
        visibleTerm: 'https://m.ami.example.com/m/old-friend-care',
      },
      { question: '这个月营业额是多少', answer: '本月营业额为 ￥263,794.10', badge: '由 店长经营 Agent 处理', visibleTerm: '营业收入' },
      { question: '昨天有哪些消费的客户，列出清单', answer: '昨天共有 3 位消费客户', badge: '由 前台接待 Agent 处理', visibleTerm: '马美琳' },
      { question: '哪些产品快过期了', answer: '当前有 2 个临期库存批次', badge: '由 库存采购 Agent 处理', visibleTerm: '舒缓修护精华' },
      { question: '这个月谁的业绩最好', answer: '本月业绩最好的是宋乔', badge: '由 店长经营 Agent 处理', visibleTerm: '宋乔' },
      { question: '请列出10个需要紧急召回的客户', answer: '已列出 10 位需要紧急召回的客户', badge: '由 营销增长 Agent 处理', visibleTerm: '未到店天数' },
      { question: '今天所有的预约给我列一下', answer: '今天共有 4 条预约', badge: '由 前台接待 Agent 处理', visibleTerm: '深层补水护理' },
      { question: '今天所有收银、核销、办卡订单列表', answer: '今天共有 5 笔业务订单', badge: '由 前台接待 Agent 处理', visibleTerm: '可打印' },
      { question: '本月利润为什么下降', answer: '本月利润率下降主要来自耗材成本上升', badge: '由 财务风控 Agent 处理', visibleTerm: '折扣增加' },
      { question: '帮我设置客户45天没来自动提醒', answer: '可以创建“45 天未到店自动提醒”草稿', badge: '由 营销增长 Agent 处理', visibleTerm: '生成待确认回访任务' },
    ];

    for (const item of coreCases) {
      await test.step(item.question, async () => {
        await submitQuestion(page, item.question);
        await expect(page.locator('.rounded-tr-md', { hasText: item.question })).toBeVisible();
        await expect(page.getByText(item.answer).last()).toBeVisible();
        await expect(page.getByText(item.visibleTerm).last()).toBeVisible();
        await expect(page.getByText(item.badge).last()).toBeVisible();
      });
    }

    await expect.poll(() => agentRequests.length).toBe(coreCases.length);
    for (const [index, item] of coreCases.entries()) {
      expect(agentRequests[index]).toMatchObject({
        message: item.question,
        role: 'manager',
        entrypoint: 'terminal:kiosk',
        personaCode: undefined,
        operatorId: 101,
      });
    }
  });

  test('美容师核心自然语言问题按本人视角进入 Agent', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'beautician', agentRequests);

    await submitQuestion(page, '我今天有几个客人');

    await expect(page.locator('.rounded-tr-md', { hasText: '我今天有几个客人' })).toBeVisible();
    await expect(page.getByText('你今天有 3 位预约客户').last()).toBeVisible();
    await expect(page.getByText('李伟明').last()).toBeVisible();
    await expect(page.getByText('由 美容师服务 Agent 处理').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({
      message: '我今天有几个客人',
      role: 'beautician',
      entrypoint: 'terminal:kiosk',
      personaCode: undefined,
      operatorId: 103,
      method: 'create',
    });
  });

  test('所有角色可通过客户跟进快捷入口查看并填写管理端下发任务', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'reception', agentRequests);

    await page.getByRole('button', { name: '客户跟进' }).click();

    await expect(page.getByText('马语嫣').last()).toBeVisible();
    await expect(page.getByText('管理端下发的高价值客户跟进任务').last()).toBeVisible();
    await expect(page.getByText('填写跟进情况').last()).toBeVisible();
    expect(agentRequests).toHaveLength(0);

    await page.getByRole('button', { name: '填写跟进情况' }).last().click();
    await page.locator('select').last().selectOption('booked');
    await page.locator('textarea').last().fill('已电话沟通，客户确认周五到店护理。');
    await page.getByRole('button', { name: '保存跟进情况' }).click();

    await expect(page.getByText('跟进情况：已电话沟通，客户确认周五到店护理。').last()).toBeVisible();
    await expect(page.getByText('已完成').last()).toBeVisible();
    expect(agentRequests).toHaveLength(0);
  });

  test('输入框里的收银、核销、预约文本进入 Agent，不再误触快捷功能', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'reception', agentRequests);

    await submitQuestion(page, '帮我收银');
    await expect(page.locator('.rounded-tr-md', { hasText: '帮我收银' })).toBeVisible();
    await expect(page.getByText('Ami 智能问答').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({ message: '帮我收银', role: 'reception' });

    await submitQuestion(page, '核销小气泡 10 次卡');
    await expect(page.locator('.rounded-tr-md', { hasText: '核销小气泡 10 次卡' })).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(2);
    expect(agentRequests[1]).toMatchObject({ message: '核销小气泡 10 次卡', role: 'reception' });

    await submitQuestion(page, '看看今天预约');
    await expect(page.locator('.rounded-tr-md', { hasText: '看看今天预约' })).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(3);
    expect(agentRequests[2]).toMatchObject({ message: '看看今天预约', role: 'reception' });
  });

  test('输入框里的办卡、充值、打印文本进入 Agent，不再误触快捷功能', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'reception', agentRequests);

    await submitQuestion(page, '办张补水护理卡');
    await expect(page.locator('.rounded-tr-md', { hasText: '办张补水护理卡' })).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({ message: '办张补水护理卡', role: 'reception' });

    await submitQuestion(page, '帮我充值');
    await expect(page.locator('.rounded-tr-md', { hasText: '帮我充值' })).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(2);
    expect(agentRequests[1]).toMatchObject({ message: '帮我充值', role: 'reception' });

    await submitQuestion(page, '打印小票');
    await expect(page.locator('.rounded-tr-md', { hasText: '打印小票' })).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(3);
    expect(agentRequests[2]).toMatchObject({ message: '打印小票', role: 'reception' });
  });

  test('前台自然语言问经营问题时进入 Agent，并携带前台角色边界', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'reception', agentRequests);

    await submitQuestion(page, '有哪些商品适合做活动');

    await expect(page.locator('.rounded-tr-md', { hasText: '有哪些商品适合做活动' })).toBeVisible();
    await expect(page.getByText('已按前台权限返回可执行的经营建议').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({ message: '有哪些商品适合做活动', role: 'reception' });
  });

  test('美容师自然语言问跨角色问题时仍进入 Agent 权限治理，不退回排班或无法回复', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'beautician', agentRequests);

    await submitQuestion(page, '近期表现较好的员工');

    await expect(page.locator('.rounded-tr-md', { hasText: '近期表现较好的员工' })).toBeVisible();
    await expect(page.getByText('已按美容师权限返回本人可查看建议').last()).toBeVisible();
    await expect(page.getByText('全店员工排行需由店长查看').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({ message: '近期表现较好的员工', role: 'beautician' });

    const text = await visiblePageText(page);
    expect(text).not.toContain('暂时无法回复');
  });

  test('同一终端切换账号时清空当前聊天框，并按新账号隔离自然语言会话', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    const bootstrapRequests: Array<{ operatorId: number | null; role: KioskRole }> = [];
    await openKiosk(page, 'manager', agentRequests, { multiAccount: true, bootstrapRequests });

    await submitQuestion(page, '近期表现较好的员工');
    await expect(page.locator('.rounded-tr-md', { hasText: '近期表现较好的员工' })).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(agentRequests[0]).toMatchObject({ message: '近期表现较好的员工', role: 'manager' });

    await page.getByRole('button', { name: '林店长 店长' }).click();
    const beauticianOption = page.getByRole('menuitem').filter({ hasText: 'beautician_e2e' });
    await expect(beauticianOption).toHaveCount(1);
    await beauticianOption.click();

    await expect(page.locator('header')).toContainText('沈晴');
    await expect(page.locator('header')).toContainText('美容师');
    await expect(page.locator('.rounded-tr-md', { hasText: '近期表现较好的员工' })).toHaveCount(0);
    await expect(page.getByText('已按要求返回近期表现较好的员工')).toHaveCount(0);
    await expect.poll(() => bootstrapRequests.some((item) => item.operatorId === users.beautician.id && item.role === 'beautician')).toBe(
      true,
    );

    await submitQuestion(page, '我的表现怎么样');

    await expect(page.locator('.rounded-tr-md', { hasText: '我的表现怎么样' })).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(2);
    expect(agentRequests[1]).toMatchObject({ message: '我的表现怎么样', role: 'beautician' });

    const text = await visiblePageText(page);
    expect(text).not.toContain('近期表现较好的员工');
    expect(text).not.toContain('暂时无法回复');
  });

  test('无数据、不足权限、字段脱敏和连续追问都有 Browser Eval 门禁', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'manager', agentRequests, { multiAccount: true });

    await submitQuestion(page, '无数据客户跟进名单');
    await expect(page.locator('.rounded-tr-md', { hasText: '无数据客户跟进名单' })).toBeVisible();
    await expect(page.getByText('暂无符合条件的客户').last()).toBeVisible();
    await expect(page.getByText('没有生成假名单').last()).toBeVisible();
    const noDataText = await visiblePageText(page);
    for (const term of ['统计周期：', '数据来源：', '统计口径：', '过滤：', '样本量：', '限制：', '样本量为 0']) {
      expect(noDataText).not.toContain(term);
    }

    await submitQuestion(page, '近期员工表现隐私字段怎么展示');
    await expect(page.getByText('手机号已脱敏').last()).toBeVisible();
    await expect(page.getByText('138****5058').last()).toBeVisible();
    await expect(page.getByText('13812345058')).toHaveCount(0);
    await expect(page.getByText('建议优先跟进').last()).toBeVisible();

    await submitQuestion(page, '这些客户生成跟进建议');
    await expect(page.getByText('已基于上一轮客户名单生成跟进建议').last()).toBeVisible();
    await expect(page.getByText('跟进建议').last()).toBeVisible();
    await expect(page.getByText('安排顾问今天完成电话回访。').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(3);
    expect(agentRequests[2].message).toBe('这些客户生成跟进建议');
    expect(agentRequests[2].context).toMatchObject({
      previousRun: expect.objectContaining({
        status: 'completed',
      }),
    });

    const managerText = await visiblePageText(page);
    for (const term of unsafeVisibleTerms) {
      expect(managerText).not.toContain(term);
    }

    await page.getByRole('button', { name: '林店长 店长' }).click();
    const receptionOption = page.getByRole('menuitem').filter({ hasText: 'reception_e2e' });
    await expect(receptionOption).toHaveCount(1);
    await receptionOption.click();

    await expect(page.locator('header')).toContainText('周前台');
    await submitQuestion(page, '财务毛利怎么看');
    await expect(page.locator('.rounded-tr-md', { hasText: '财务毛利怎么看' })).toBeVisible();
    await expect(page.getByText('当前账号无权查看财务毛利数据').last()).toBeVisible();
    await expect(page.getByText('财务分析需由店长账号查看').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(4);
    expect(agentRequests[3]).toMatchObject({ message: '财务毛利怎么看', role: 'reception' });
  });

  test('Kiosk 浏览器运行态区分 no_data、unsupported 和 failed 状态提示', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'manager', agentRequests);

    await submitQuestion(page, '无数据客户跟进名单');
    await expect(page.getByText('暂无数据').last()).toBeVisible();
    await expect(page.getByText('当前门店在所选周期内没有符合条件的高优先级客户。').last()).toBeVisible();
    await expect(page.getByText('执行失败')).toHaveCount(0);

    await submitQuestion(page, '暂不支持查询门店星座偏好');
    await expect(page.getByText('暂不支持').last()).toBeVisible();
    await expect(page.getByText('当前暂不支持查询这个指标。').last()).toBeVisible();
    await expect(page.getByText('执行失败')).toHaveCount(0);

    await submitQuestion(page, '模拟失败库存风险');
    await expect(page.getByText('执行失败').last()).toBeVisible();
    await expect(page.getByText('库存数据加载失败。').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(3);
  });

  test('Kiosk 触发中风险动作先进入待审批，确认后只走审批 API 执行', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    const approvalRequests: Array<{ id: number; method: string; body: any }> = [];
    await openKiosk(page, 'manager', agentRequests, { approvalRequests });

    await submitQuestion(page, '中风险草稿审批：帮我生成高价值客户复购营销活动草稿');

    await expect(page.locator('.rounded-tr-md', { hasText: '中风险草稿审批' })).toBeVisible();
    await expect(page.getByText('待确认动作 · medium').last()).toBeVisible();
    await expect(page.getByText('创建营销活动草稿').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    await expect.poll(() => approvalRequests.length).toBe(0);

    const approveResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/agent/approvals/701/approve') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '确认执行' }).first().click();
    await approveResponse;

    await expect(page.getByText('已在审批通过后创建营销活动草稿。').last()).toBeVisible();
    await expect.poll(() => approvalRequests.length).toBe(1);
    expect(approvalRequests[0]).toMatchObject({
      id: 701,
      method: 'approve',
      body: {
        role: 'manager',
        operatorId: 101,
        comment: '终端人工确认执行',
      },
    });
    expect(agentRequests).toHaveLength(1);
  });

  test('Kiosk 刷新后同步后端 Persona 推荐问题到输入框提示，快捷入口仍保留终端功能', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    let managerQuestions = ['旧版经营关注点？', '旧版客户风险？', '旧版库存预警？'];
    await openKiosk(page, 'manager', agentRequests, {
      personas: () => [managerPersonaWithQuestions(managerQuestions)],
    });

    await expect(page.locator('input[placeholder*="旧版经营关注点"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '旧版经营关注点' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '预约' })).toBeVisible();
    await expect(page.getByRole('button', { name: '核销' })).toBeVisible();
    await expect(page.getByRole('button', { name: '收银' })).toBeVisible();
    await expect(page.getByRole('button', { name: '办卡' })).toBeVisible();

    managerQuestions = ['新版高价值客户复购？', '新版临期库存处理？', '新版今日经营风险？'];
    await page.reload();
    await expect(page.locator('input[placeholder*="新版高价值客户复购"]').first()).toBeVisible();

    await expect(page.getByRole('button', { name: '新版高价值客户复购' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '新版临期库存处理' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '旧版经营关注点' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '预约' })).toBeVisible();
    await expect(page.getByRole('button', { name: '核销' })).toBeVisible();
    await expect(page.getByRole('button', { name: '收银' })).toBeVisible();
    await expect(page.getByRole('button', { name: '办卡' })).toBeVisible();
  });

  test('小屏下 Agent follow-up 不遮挡输入框，点击后继续进入同一对话上下文', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await page.setViewportSize({ width: 390, height: 780 });
    await openKiosk(page, 'manager', agentRequests);

    const createRunResponse = page.waitForResponse((response) => response.url().includes('/api/agent/runs') && response.request().method() === 'POST');
    await submitQuestion(page, '本月员工业绩排行');
    const createRunBody = await (await createRunResponse).json();

    await expect(page.locator('.rounded-tr-md', { hasText: '本月员工业绩排行' })).toBeVisible();
    expect(createRunBody.followUpSuggestions).toEqual(['查看员工明细', '对比上月变化', '生成跟进建议']);
    await expect.poll(() => agentRequests.length).toBe(1);
    await expect(page.getByRole('button', { name: '查看员工明细' }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: '对比上月变化' }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: '生成跟进建议' }).last()).toBeVisible();
    await expect(page.locator('input[placeholder*="例如"]').first()).toBeVisible();

    const inputBox = await page.locator('input[placeholder*="例如"]').first().boundingBox();
    const followUpBox = await page.getByRole('button', { name: '生成跟进建议' }).last().boundingBox();
    expect(inputBox).not.toBeNull();
    expect(followUpBox).not.toBeNull();
    expect((followUpBox?.y ?? 0) + (followUpBox?.height ?? 0)).toBeLessThanOrEqual(inputBox?.y ?? 0);

    await page.getByRole('button', { name: '对比上月变化' }).last().click();

    await expect.poll(() => agentRequests.length).toBe(2);
    expect(agentRequests[1]).toMatchObject({
      message: '对比上月变化',
      role: 'manager',
      entrypoint: 'terminal:kiosk',
      personaCode: undefined,
      operatorId: 101,
      activeRunId: 9001,
      method: 'append',
    });
    expect(agentRequests[1].context).toMatchObject({
      previousRun: expect.objectContaining({
        status: 'completed',
      }),
    });
    await expect(page.locator('input[placeholder*="例如"]').first()).toBeVisible();
  });

  test('经营问答后插入收银和核销 FlowCard，再点追问仍 append 当前 AgentRun', async ({ page }) => {
    const agentRequests: KioskAgentRequest[] = [];
    await openKiosk(page, 'reception', agentRequests);

    const createRunResponse = page.waitForResponse((response) => response.url().includes('/api/agent/runs') && response.request().method() === 'POST');
    await submitQuestion(page, '今天经营有什么风险');
    const createRunBody = await (await createRunResponse).json();

    await expect(page.locator('.rounded-tr-md', { hasText: '今天经营有什么风险' })).toBeVisible();
    await expect(page.getByText('Ami 智能问答').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);
    expect(createRunBody.runId).toBe(9002);

    await page.getByRole('button', { name: '收银' }).click();
    await expect(page.getByText('收银开单').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);

    await page.getByRole('button', { name: '核销' }).click();
    await expect(page.getByText('次卡核销').last()).toBeVisible();
    await expect.poll(() => agentRequests.length).toBe(1);

    await page.getByRole('button', { name: '对比上月变化' }).last().click();

    await expect.poll(() => agentRequests.length).toBe(2);
    expect(agentRequests[1]).toMatchObject({
      message: '对比上月变化',
      role: 'reception',
      entrypoint: 'terminal:kiosk',
      personaCode: undefined,
      operatorId: 102,
      activeRunId: 9002,
      method: 'append',
    });
    expect(agentRequests[1].context).toMatchObject({
      previousRun: expect.objectContaining({
        runId: 9002,
        status: 'completed',
      }),
    });
    await expect(page.getByText('已按前台权限返回可执行的经营建议').last()).toBeVisible();
  });
});
