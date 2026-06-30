import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { ActionOntologyService } from './knowledge/action-ontology.service.js';
import { CapabilityCatalogService } from './knowledge/capability-catalog.service.js';
import { EntityResolverService } from './knowledge/entity-resolver.service.js';
import type { AgentPersonaCode, AgentRole } from './agent.types.js';
import type { BusinessActionIntent, BusinessObjectType, EntityResolutionCandidate } from './knowledge/knowledge.types.js';

export type KnowledgeMapEvalCase = {
  id: string;
  input: string;
  role: AgentRole;
  expectedPersonaCode: AgentPersonaCode;
  expectedAction: BusinessActionIntent;
  acceptableActions?: BusinessActionIntent[];
  expectedCapabilityId: string;
  expectedBusinessQueryCapabilityId?: string;
  expectedEntityTypes?: BusinessObjectType[];
  expectedEntityName?: string;
  requiredOutputKinds: string[];
};

export type KnowledgeMapEvalOptions = {
  persona?: AgentPersonaCode;
  capability?: string;
};

export type KnowledgeMapGateLevel = 'p0' | 'p1' | 'p2';

export type KnowledgeMapFailureReason =
  | 'entity_miss'
  | 'action_miss'
  | 'capability_miss'
  | 'route_error'
  | 'output_contract_miss';

export type KnowledgeMapEvalResult = {
  id: string;
  input: string;
  passed: boolean;
  failureReasons: KnowledgeMapFailureReason[];
  expected: {
    personaCode: AgentPersonaCode;
    action: BusinessActionIntent;
    acceptableActions: BusinessActionIntent[];
    capabilityId: string;
    businessQueryCapabilityId?: string;
    entityTypes: BusinessObjectType[];
    entityName?: string;
    outputKinds: string[];
  };
  actual: {
    action: BusinessActionIntent;
    capabilityId?: string;
    businessQueryCapabilityId?: string;
    personaCodes: AgentPersonaCode[];
    outputKinds: string[];
    entityStatus: string;
    entity?: Pick<EntityResolutionCandidate, 'objectType' | 'entityId' | 'displayName' | 'confidence' | 'sourceModel'>;
    candidates: Array<Pick<EntityResolutionCandidate, 'objectType' | 'displayName' | 'confidence' | 'sourceModel'>>;
  };
};

export type KnowledgeMapEvalReport = {
  generatedAt: string;
  filters: {
    persona: AgentPersonaCode | 'all';
    capability: string | 'all';
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    routingAccuracy: number;
    entityAccuracy: number;
    actionAccuracy: number;
    capabilityAccuracy: number;
    outputContractAccuracy: number;
    topFailureReasons: Array<{ reason: KnowledgeMapFailureReason; count: number }>;
  };
  results: KnowledgeMapEvalResult[];
  failures: KnowledgeMapEvalResult[];
  improvementBacklog: KnowledgeMapImprovementItem[];
  gate?: KnowledgeMapGateResult;
};

export type KnowledgeMapImprovementItem = {
  id: string;
  input: string;
  priority: 'P0' | 'P1' | 'P2';
  failureReasons: KnowledgeMapFailureReason[];
  expectedCapabilityId: string;
  actualCapabilityId?: string;
  expectedPersonaCode: AgentPersonaCode;
  actualPersonaCodes: AgentPersonaCode[];
  expectedOutputKinds: string[];
  actualOutputKinds: string[];
  missingOutputKinds: string[];
  recommendation: string;
};

export type KnowledgeMapGateOptions = {
  level: KnowledgeMapGateLevel;
  baselineReport?: KnowledgeMapEvalReport | null;
};

export type KnowledgeMapGateResult = {
  level: KnowledgeMapGateLevel;
  passed: boolean;
  evaluatedTotal: number;
  thresholds: Record<string, number>;
  actual: {
    passRate: number;
    failed: number;
    routingAccuracy: number;
    baselinePassRate?: number;
  };
  violations: string[];
  improvementBacklog: KnowledgeMapImprovementItem[];
};

export const KNOWLEDGE_MAP_EVAL_CASES: KnowledgeMapEvalCase[] = [
  {
    id: 'km-marketing-link-001',
    input: '老朋友回店护理礼活动链接发我',
    role: 'manager',
    expectedPersonaCode: 'marketing',
    expectedAction: 'get_link',
    expectedCapabilityId: 'marketing.activity.link.lookup',
    expectedBusinessQueryCapabilityId: 'marketing_activity_link_lookup',
    expectedEntityTypes: ['MarketingActivity'],
    expectedEntityName: '老朋友回店护理礼',
    requiredOutputKinds: ['link_card', 'evidence_panel'],
  },
  {
    id: 'km-marketing-link-002',
    input: '回店礼二维码在哪里',
    role: 'reception',
    expectedPersonaCode: 'marketing',
    expectedAction: 'get_link',
    expectedCapabilityId: 'marketing.activity.link.lookup',
    expectedBusinessQueryCapabilityId: 'marketing_activity_link_lookup',
    expectedEntityTypes: ['MarketingActivity'],
    expectedEntityName: '老朋友回店礼',
    requiredOutputKinds: ['link_card', 'evidence_panel'],
  },
  {
    id: 'km-marketing-list-001',
    input: '推荐近期营销活动',
    role: 'manager',
    expectedPersonaCode: 'marketing',
    expectedAction: 'recommend',
    expectedCapabilityId: 'marketing.activity.list',
    expectedBusinessQueryCapabilityId: 'marketing_activity_list',
    requiredOutputKinds: ['table', 'evidence_panel'],
  },
  {
    id: 'km-marketing-list-002',
    input: '近期有哪些营销活动',
    role: 'reception',
    expectedPersonaCode: 'marketing',
    expectedAction: 'list',
    expectedCapabilityId: 'marketing.activity.list',
    expectedBusinessQueryCapabilityId: 'marketing_activity_list',
    requiredOutputKinds: ['table', 'evidence_panel'],
  },
  {
    id: 'km-reception-reservation-001',
    input: '张雯今天有哪些预约',
    role: 'reception',
    expectedPersonaCode: 'reception',
    expectedAction: 'list',
    expectedCapabilityId: 'reception.customer.reservation_today',
    expectedBusinessQueryCapabilityId: 'customer_reservation_today',
    expectedEntityTypes: ['Customer'],
    expectedEntityName: '张雯',
    requiredOutputKinds: ['reservation_table', 'evidence_panel'],
  },
  {
    id: 'km-reception-card-001',
    input: '张雯还有什么卡和权益',
    role: 'reception',
    expectedPersonaCode: 'reception',
    expectedAction: 'summary',
    expectedCapabilityId: 'reception.customer.card_benefit.summary',
    expectedBusinessQueryCapabilityId: 'customer_card_benefit_summary',
    expectedEntityTypes: ['Customer'],
    expectedEntityName: '张雯',
    requiredOutputKinds: ['card_benefit_summary', 'evidence_panel'],
  },
  {
    id: 'km-customer-profile-001',
    input: '查一下刘思琪客户档案',
    role: 'manager',
    expectedPersonaCode: 'manager',
    expectedAction: 'lookup',
    expectedCapabilityId: 'customer.profile.lookup',
    expectedBusinessQueryCapabilityId: 'customer_profile_lookup',
    expectedEntityTypes: ['Customer'],
    expectedEntityName: '刘思琪',
    requiredOutputKinds: ['customer_card', 'evidence_panel'],
  },
  {
    id: 'km-inventory-stock-001',
    input: '一次性丁腈手套库存还够吗',
    role: 'manager',
    expectedPersonaCode: 'inventory',
    expectedAction: 'summary',
    expectedCapabilityId: 'inventory.product.stock.lookup',
    expectedBusinessQueryCapabilityId: 'inventory_alert',
    expectedEntityTypes: ['InventoryProduct'],
    expectedEntityName: '一次性丁腈手套',
    requiredOutputKinds: ['inventory_status_card', 'evidence_panel'],
  },
  {
    id: 'km-inventory-stock-002',
    input: '补水精华还有多少库存',
    role: 'reception',
    expectedPersonaCode: 'inventory',
    expectedAction: 'summary',
    expectedCapabilityId: 'inventory.product.stock.lookup',
    expectedBusinessQueryCapabilityId: 'inventory_alert',
    expectedEntityTypes: ['InventoryProduct'],
    expectedEntityName: '补水精华',
    requiredOutputKinds: ['inventory_status_card', 'evidence_panel'],
  },
  {
    id: 'km-staff-performance-001',
    input: '宋乔这个月业绩怎么样',
    role: 'manager',
    expectedPersonaCode: 'manager',
    expectedAction: 'lookup',
    expectedCapabilityId: 'manager.staff.performance.rank',
    expectedBusinessQueryCapabilityId: 'staff_performance',
    expectedEntityTypes: ['Beautician'],
    expectedEntityName: '宋乔',
    requiredOutputKinds: ['staff_performance_card', 'table', 'evidence_panel'],
  },
  {
    id: 'km-staff-performance-002',
    input: '本月员工表现排行',
    role: 'manager',
    expectedPersonaCode: 'manager',
    expectedAction: 'list',
    expectedCapabilityId: 'manager.staff.performance.rank',
    expectedBusinessQueryCapabilityId: 'staff_performance',
    requiredOutputKinds: ['staff_performance_card', 'table', 'evidence_panel'],
  },
  {
    id: 'km-finance-order-001',
    input: '查一下订单 PO202606300001',
    role: 'manager',
    expectedPersonaCode: 'finance',
    expectedAction: 'lookup',
    expectedCapabilityId: 'finance.order.lookup',
    expectedBusinessQueryCapabilityId: 'finance_order_lookup',
    expectedEntityTypes: ['Order'],
    expectedEntityName: 'PO202606300001',
    requiredOutputKinds: ['order_card', 'evidence_panel'],
  },
  {
    id: 'km-finance-order-002',
    input: '打印收银单 CG202606300001',
    role: 'reception',
    expectedPersonaCode: 'finance',
    expectedAction: 'print',
    expectedCapabilityId: 'finance.order.lookup',
    expectedBusinessQueryCapabilityId: 'finance_order_lookup',
    expectedEntityTypes: ['Order'],
    expectedEntityName: 'CG202606300001',
    requiredOutputKinds: ['order_card', 'evidence_panel'],
  },
  {
    id: 'km-member-card-001',
    input: '张雯的水光护理卡还剩几次',
    role: 'reception',
    expectedPersonaCode: 'reception',
    expectedAction: 'summary',
    expectedCapabilityId: 'reception.member_card.lookup',
    expectedBusinessQueryCapabilityId: 'member_card_lookup',
    expectedEntityTypes: ['MemberCard'],
    expectedEntityName: '水光护理卡',
    requiredOutputKinds: ['member_card_summary', 'evidence_panel'],
  },
  {
    id: 'km-project-trend-001',
    input: '肩颈舒压护理最近卖得好吗',
    role: 'manager',
    expectedPersonaCode: 'manager',
    expectedAction: 'list',
    expectedCapabilityId: 'project.service.trend',
    expectedBusinessQueryCapabilityId: 'project_service_trend',
    expectedEntityTypes: ['Project'],
    expectedEntityName: '肩颈舒压护理',
    requiredOutputKinds: ['table', 'evidence_panel'],
  },
  {
    id: 'km-project-trend-002',
    input: '最近做得好的护理项目',
    role: 'manager',
    expectedPersonaCode: 'manager',
    expectedAction: 'list',
    expectedCapabilityId: 'project.service.trend',
    expectedBusinessQueryCapabilityId: 'project_service_trend',
    requiredOutputKinds: ['table', 'evidence_panel'],
  },
  {
    id: 'km-finance-revenue-001',
    input: '这个月营业额',
    role: 'manager',
    expectedPersonaCode: 'finance',
    expectedAction: 'summary',
    expectedCapabilityId: 'finance.revenue.summary',
    expectedBusinessQueryCapabilityId: 'order_revenue_analysis',
    requiredOutputKinds: ['kpi', 'table', 'evidence_panel'],
  },
  {
    id: 'km-finance-revenue-002',
    input: '昨天流水',
    role: 'reception',
    expectedPersonaCode: 'finance',
    expectedAction: 'summary',
    expectedCapabilityId: 'finance.revenue.summary',
    expectedBusinessQueryCapabilityId: 'order_revenue_analysis',
    requiredOutputKinds: ['kpi', 'table', 'evidence_panel'],
  },
  {
    id: 'km-finance-profit-001',
    input: '本月利润为什么下降',
    role: 'manager',
    expectedPersonaCode: 'finance',
    expectedAction: 'diagnose',
    expectedCapabilityId: 'finance.profit.diagnosis',
    expectedBusinessQueryCapabilityId: 'finance_cashflow_summary',
    requiredOutputKinds: ['kpi', 'table', 'evidence_panel'],
  },
  ...buildHighFrequencyVariantCases(),
];

function buildHighFrequencyVariantCases(): KnowledgeMapEvalCase[] {
  const groups: Array<{
    idPrefix: string;
    base: Omit<KnowledgeMapEvalCase, 'id' | 'input'>;
    inputs: Array<string | { input: string; expectedAction?: BusinessActionIntent; expectedEntityName?: string }>;
  }> = [
    {
      idPrefix: 'km-var-marketing-link',
      base: {
        role: 'manager',
        expectedPersonaCode: 'marketing',
        expectedAction: 'get_link',
        expectedCapabilityId: 'marketing.activity.link.lookup',
        expectedBusinessQueryCapabilityId: 'marketing_activity_link_lookup',
        expectedEntityTypes: ['MarketingActivity'],
        expectedEntityName: '老朋友回店护理礼',
        requiredOutputKinds: ['link_card', 'evidence_panel'],
      },
      inputs: [
        '老朋友回店护理礼活动链接发我',
        '把老朋友回店护理礼的链接给我',
        '老朋友回店护理礼二维码在哪里',
        '老朋友回店护理礼小程序路径发我',
        '复制老朋友回店护理礼分享链接',
        '查看老朋友回店护理礼推广页地址',
        '老朋友回店护理礼活动页链接',
        '老朋友回店护理礼的H5链接在哪',
        '给我老朋友回店护理礼小程序码',
        '老朋友回店护理礼活动二维码',
        '发一下老朋友回店护理礼推广链接',
        '老朋友回店护理礼分享地址复制一下',
        '我要老朋友回店护理礼活动URL',
        '老朋友回店护理礼线上活动地址',
        '查老朋友回店护理礼活动链接',
        '老朋友回店护理礼营销页发我',
        '打开老朋友回店护理礼推广页链接',
        '老朋友回店护理礼客户分享链接',
        '老朋友回店护理礼活动小程序路径',
        '老朋友回店护理礼二维码链接',
      ],
    },
    {
      idPrefix: 'km-var-marketing-list',
      base: {
        role: 'manager',
        expectedPersonaCode: 'marketing',
        expectedAction: 'list',
        acceptableActions: ['list', 'lookup', 'recommend'],
        expectedCapabilityId: 'marketing.activity.list',
        expectedBusinessQueryCapabilityId: 'marketing_activity_list',
        requiredOutputKinds: ['table', 'evidence_panel'],
      },
      inputs: [
        { input: '推荐近期营销活动', expectedAction: 'recommend' },
        '近期有哪些营销活动',
        '列出正在进行的活动',
        '查一下最近营销活动',
        '本周有哪些推广活动',
        '最近发布了哪些活动',
        '活动清单给我看一下',
        '当前有效营销活动列表',
        '有哪些已发布活动',
        '门店近期活动列表',
        { input: '推荐几个可以继续推的活动', expectedAction: 'recommend' },
        '查看最近活动清单',
        '列一下可用营销活动',
        '现在有什么回店活动',
        '近期优惠活动有哪些',
      ],
    },
    {
      idPrefix: 'km-var-customer-recall',
      base: {
        role: 'manager',
        expectedPersonaCode: 'marketing',
        expectedAction: 'recommend',
        acceptableActions: ['list', 'recommend', 'diagnose'],
        expectedCapabilityId: 'marketing.customer.recall.list',
        expectedBusinessQueryCapabilityId: 'customer_growth_opportunity',
        requiredOutputKinds: ['table', 'evidence_panel', 'action_card'],
      },
      inputs: [
        { input: '请列出10个需要紧急召回的客户', expectedAction: 'list' },
        '哪些客户适合召回',
        '推荐今天优先回访的客户',
        { input: '列出高价值流失客户清单', expectedAction: 'list' },
        '需要复购承接的客户有哪些',
        '给我沉睡客户召回名单',
        '哪些客户今天最值得跟进',
        '推荐一批老客回店名单',
        { input: '列一下30天没来的高消费客户', expectedAction: 'list' },
        '找出需要顾问联系的客户',
        '优先召回哪些会员',
        '哪些客户有流失风险要回访',
        { input: '列出前20个复购机会客户', expectedAction: 'list' },
        '给我今天客户召回建议',
        '推荐适合发回店礼的客户',
        '哪些老客需要重新激活',
        { input: '客户跟进清单按优先级列出来', expectedAction: 'list' },
        '帮我找复购概率高的客户',
        '哪些客户适合做回店活动触达',
        '今天营销要先联系哪些客户',
      ],
    },
    {
      idPrefix: 'km-var-finance-revenue',
      base: {
        role: 'manager',
        expectedPersonaCode: 'finance',
        expectedAction: 'summary',
        expectedCapabilityId: 'finance.revenue.summary',
        expectedBusinessQueryCapabilityId: 'order_revenue_analysis',
        requiredOutputKinds: ['kpi', 'table', 'evidence_panel'],
      },
      inputs: [
        '这个月营业额',
        '本月营收',
        '今日收入',
        '昨天流水',
        '这个月客单价',
        '今天订单数多少',
        '本周现金收入',
        '上月营业收入是多少',
        '今天实收金额',
        '本月流水总额',
        '最近30天营业额',
        '昨天收入和订单数',
        '这个月收了多少钱',
        '今日客单价多少',
        '本月订单收入汇总',
      ],
    },
    {
      idPrefix: 'km-var-finance-transaction',
      base: {
        role: 'reception',
        expectedPersonaCode: 'finance',
        expectedAction: 'list',
        acceptableActions: ['list', 'print'],
        expectedCapabilityId: 'finance.today.transaction.list',
        expectedBusinessQueryCapabilityId: 'finance_today_transaction_list',
        requiredOutputKinds: ['table', 'action_card', 'evidence_panel'],
      },
      inputs: [
        '列出今天所有收银、核销、办卡订单列表，支持打印操作',
        '今天收银和核销订单清单',
        '今日办卡充值订单列表',
        '列一下今天所有交易订单',
        '今天有哪些收银流水',
        '今日核销明细列表',
        '今天办卡订单有哪些',
        '今日充值订单清单',
        '列出今天退款订单',
        { input: '打印今天收银核销办卡清单', expectedAction: 'print' },
        { input: '生成今日交易打印清单', expectedAction: 'print' },
        '今天所有已完成订单列表',
        '今日收银小票列表',
        '前台今天交易明细',
        { input: '把今天订单清单打印预览出来', expectedAction: 'print' },
      ],
    },
    {
      idPrefix: 'km-var-inventory-expiring',
      base: {
        role: 'manager',
        expectedPersonaCode: 'inventory',
        expectedAction: 'list',
        acceptableActions: ['list', 'diagnose', 'recommend', 'summary', 'lookup'],
        expectedCapabilityId: 'inventory.expiring.list',
        expectedBusinessQueryCapabilityId: 'inventory_alert',
        requiredOutputKinds: ['table', 'evidence_panel', 'action_card'],
      },
      inputs: [
        '近期有哪些临期库存产品',
        '列出临期库存清单',
        '哪些产品快过期了',
        { input: '库存临期预警', expectedAction: 'diagnose' },
        '最近30天到期的库存有哪些',
        '临期产品列表',
        '需要处理的临期库存',
        { input: '低库存和临期产品风险', expectedAction: 'diagnose' },
        '有哪些耗材快过期',
        '列一下即将过期商品',
        { input: '推荐优先处理的临期产品', expectedAction: 'recommend' },
        '库存预警产品有哪些',
        '缺货和临期库存清单',
        '门店临期库存情况',
        '哪些产品需要补货或临期处理',
      ],
    },
    {
      idPrefix: 'km-var-reservation-today',
      base: {
        role: 'reception',
        expectedPersonaCode: 'reception',
        expectedAction: 'list',
        acceptableActions: ['list', 'summary', 'diagnose'],
        expectedCapabilityId: 'reception.reservation.today.list',
        expectedBusinessQueryCapabilityId: 'reservation_today',
        requiredOutputKinds: ['reservation_table', 'evidence_panel'],
      },
      inputs: ['今天有哪些预约', '今日预约客户清单', '还有多少预约客户没到店'],
    },
    {
      idPrefix: 'km-var-schedule-availability',
      base: {
        role: 'reception',
        expectedPersonaCode: 'reception',
        expectedAction: 'analyze',
        acceptableActions: ['lookup', 'list', 'summary', 'analyze', 'diagnose'],
        expectedCapabilityId: 'reception.schedule.availability',
        expectedBusinessQueryCapabilityId: 'schedule_utilization',
        requiredOutputKinds: ['table', 'evidence_panel'],
      },
      inputs: ['今天排班空闲情况', '哪些美容师下午有空档', '今日排班利用率'],
    },
    {
      idPrefix: 'km-var-inventory-replenishment',
      base: {
        role: 'manager',
        expectedPersonaCode: 'inventory',
        expectedAction: 'recommend',
        acceptableActions: ['list', 'recommend', 'diagnose'],
        expectedCapabilityId: 'inventory.replenishment.recommend',
        expectedBusinessQueryCapabilityId: 'product_replenishment_opportunity',
        requiredOutputKinds: ['table', 'evidence_panel', 'action_card'],
      },
      inputs: ['哪些商品需要补货', '给我库存补货建议', '低库存产品优先补哪些'],
    },
    {
      idPrefix: 'km-var-marketing-effect',
      base: {
        role: 'manager',
        expectedPersonaCode: 'marketing',
        expectedAction: 'analyze',
        acceptableActions: ['analyze', 'diagnose', 'summary', 'compare'],
        expectedCapabilityId: 'marketing.effect.diagnose',
        expectedBusinessQueryCapabilityId: 'marketing_conversion',
        requiredOutputKinds: ['kpi', 'table', 'evidence_panel'],
      },
      inputs: ['近期营销转化怎么样', '活动效果复盘', '营销活动收入归因分析'],
    },
    {
      idPrefix: 'km-var-customer-churn',
      base: {
        role: 'manager',
        expectedPersonaCode: 'marketing',
        expectedAction: 'diagnose',
        acceptableActions: ['list', 'diagnose', 'recommend'],
        expectedCapabilityId: 'marketing.customer.churn.risk',
        expectedBusinessQueryCapabilityId: 'customer_churn_risk',
        requiredOutputKinds: ['table', 'evidence_panel', 'action_card'],
      },
      inputs: ['哪些客户有流失风险', '高价值客户沉默预警', '列出久未到店客户'],
    },
    {
      idPrefix: 'km-var-consumption-customer',
      base: {
        role: 'manager',
        expectedPersonaCode: 'finance',
        expectedAction: 'list',
        acceptableActions: ['list', 'summary'],
        expectedCapabilityId: 'order.customer.consumption.list',
        expectedBusinessQueryCapabilityId: 'order_customer_consumption_list',
        requiredOutputKinds: ['table', 'evidence_panel', 'action_card'],
      },
      inputs: ['昨天有哪些消费的客户，列出清单', '今日成交客户名单', '本周有流水的会员'],
    },
    {
      idPrefix: 'km-var-card-expiry',
      base: {
        role: 'reception',
        expectedPersonaCode: 'reception',
        expectedAction: 'summary',
        acceptableActions: ['list', 'diagnose', 'recommend', 'summary'],
        expectedCapabilityId: 'card.expiry.risk',
        expectedBusinessQueryCapabilityId: 'card_expiry_risk',
        requiredOutputKinds: ['table', 'evidence_panel', 'action_card'],
      },
      inputs: ['哪些卡快到期了', '列出即将到期次卡', '卡项到期风险客户'],
    },
    {
      idPrefix: 'km-var-card-usage',
      base: {
        role: 'manager',
        expectedPersonaCode: 'manager',
        expectedAction: 'analyze',
        acceptableActions: ['analyze', 'summary', 'list'],
        expectedCapabilityId: 'card.usage.analysis',
        expectedBusinessQueryCapabilityId: 'card_usage_analysis',
        requiredOutputKinds: ['kpi', 'table', 'evidence_panel'],
      },
      inputs: ['本月卡项核销情况', '次卡核销趋势', '哪些卡核销最多'],
    },
    {
      idPrefix: 'km-var-supplier-purchase',
      base: {
        role: 'manager',
        expectedPersonaCode: 'inventory',
        expectedAction: 'draft',
        acceptableActions: ['draft', 'recommend', 'list'],
        expectedCapabilityId: 'supplier.purchase.advice',
        expectedBusinessQueryCapabilityId: 'supplier_purchase_advice',
        requiredOutputKinds: ['supplier_purchase_card', 'table', 'evidence_panel'],
      },
      inputs: ['生成供应商采购建议', '哪些补货商品适合一起采购', '本周采购优先级'],
    },
    {
      idPrefix: 'km-var-terminal-health',
      base: {
        role: 'manager',
        expectedPersonaCode: 'manager',
        expectedAction: 'diagnose',
        acceptableActions: ['diagnose', 'summary', 'lookup'],
        expectedCapabilityId: 'terminal.health.diagnosis',
        expectedBusinessQueryCapabilityId: 'terminal_health_diagnosis',
        requiredOutputKinds: ['kpi', 'table', 'evidence_panel'],
      },
      inputs: ['终端运行是否正常', 'Ami Aura 最近有哪些失败问题', '打印机扫码器状态'],
    },
  ];

  return groups.flatMap((group) =>
    group.inputs.map((item, index) => {
      const value = typeof item === 'string' ? { input: item } : item;
      return {
        ...group.base,
        id: `${group.idPrefix}-${String(index + 1).padStart(3, '0')}`,
        input: value.input,
        expectedAction: value.expectedAction ?? group.base.expectedAction,
        expectedEntityName: value.expectedEntityName ?? group.base.expectedEntityName,
      };
    }),
  );
}

export async function runKnowledgeMapEval(options: KnowledgeMapEvalOptions = {}): Promise<KnowledgeMapEvalReport> {
  const actionOntology = new ActionOntologyService();
  const capabilityCatalog = new CapabilityCatalogService(actionOntology);
  const entityResolver = new EntityResolverService(createKnowledgeMapMockPrisma() as never);
  const cases = KNOWLEDGE_MAP_EVAL_CASES.filter((item) => {
    if (options.persona && item.expectedPersonaCode !== options.persona) return false;
    if (options.capability) {
      return item.expectedCapabilityId === options.capability || item.expectedBusinessQueryCapabilityId === options.capability;
    }
    return true;
  });

  const results: KnowledgeMapEvalResult[] = [];
  for (const testCase of cases) {
    const entityTypes = testCase.expectedEntityTypes ?? [];
    const entityResolution = entityTypes.length
      ? await entityResolver.resolve({
          text: testCase.input,
          storeId: 1,
          role: testCase.role,
          preferredObjectTypes: entityTypes,
          limit: 5,
        })
      : { status: 'not_required', candidates: [] as EntityResolutionCandidate[] };
    const resolvedEntity = 'entity' in entityResolution ? entityResolution.entity : undefined;
    const topCandidate = resolvedEntity ?? entityResolution.candidates[0];
    const action = actionOntology.detect(testCase.input);
    const capabilityDecision = capabilityCatalog.resolve({
      text: testCase.input,
      role: testCase.expectedPersonaCode,
      action,
      entities: topCandidate ? [topCandidate] : [],
    });
    const capability = capabilityDecision.capability;
    const actualPersonaCodes = capability?.personaCodes ?? [];
    const actualOutputKinds = capability?.outputKinds ?? [];
    const failureReasons: KnowledgeMapFailureReason[] = [];
    const entityPassed = entityTypes.length ? entityResolution.candidates.some((candidate) => isExpectedEntity(candidate, testCase)) : true;
    const acceptableActions = testCase.acceptableActions?.length ? testCase.acceptableActions : [testCase.expectedAction];
    const actionPassed = acceptableActions.includes(action);
    const capabilityPassed = capability?.capabilityId === testCase.expectedCapabilityId;
    const routePassed = actualPersonaCodes.includes(testCase.expectedPersonaCode);
    const outputPassed = testCase.requiredOutputKinds.every((kind) => actualOutputKinds.includes(kind));

    if (!entityPassed) failureReasons.push('entity_miss');
    if (!actionPassed) failureReasons.push('action_miss');
    if (!capabilityPassed) failureReasons.push('capability_miss');
    if (!routePassed) failureReasons.push('route_error');
    if (!outputPassed) failureReasons.push('output_contract_miss');

    results.push({
      id: testCase.id,
      input: testCase.input,
      passed: failureReasons.length === 0,
      failureReasons,
      expected: {
        personaCode: testCase.expectedPersonaCode,
        action: testCase.expectedAction,
        acceptableActions,
        capabilityId: testCase.expectedCapabilityId,
        businessQueryCapabilityId: testCase.expectedBusinessQueryCapabilityId,
        entityTypes,
        entityName: testCase.expectedEntityName,
        outputKinds: testCase.requiredOutputKinds,
      },
      actual: {
        action,
        capabilityId: capability?.capabilityId,
        businessQueryCapabilityId: capability?.businessQueryCapabilityId,
        personaCodes: actualPersonaCodes,
        outputKinds: actualOutputKinds,
        entityStatus: entityResolution.status,
        entity: topCandidate
          ? {
              objectType: topCandidate.objectType,
              entityId: topCandidate.entityId,
              displayName: topCandidate.displayName,
              confidence: topCandidate.confidence,
              sourceModel: topCandidate.sourceModel,
            }
          : undefined,
        candidates: entityResolution.candidates.map((candidate) => ({
          objectType: candidate.objectType,
          displayName: candidate.displayName,
          confidence: candidate.confidence,
          sourceModel: candidate.sourceModel,
        })),
      },
    });
  }

  return buildKnowledgeMapReport(results, options);
}

export function writeKnowledgeMapEvalReport(report: KnowledgeMapEvalReport, outputPath?: string) {
  const normalizedTarget = resolveKnowledgeMapEvalReportPath(outputPath);
  const dir = dirname(normalizedTarget);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(normalizedTarget, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return normalizedTarget;
}

export function resolveKnowledgeMapEvalReportPath(outputPath?: string) {
  const target = outputPath ?? resolve(process.cwd(), '../../docs/04-测试数据/agent-eval-knowledge-map-report.json');
  return resolve(process.cwd(), target);
}

export function readKnowledgeMapEvalReport(inputPath?: string): KnowledgeMapEvalReport | null {
  const target = resolveKnowledgeMapEvalReportPath(inputPath);
  if (!existsSync(target)) return null;
  return JSON.parse(readFileSync(target, 'utf8')) as KnowledgeMapEvalReport;
}

export function applyKnowledgeMapGate(
  report: KnowledgeMapEvalReport,
  options: KnowledgeMapGateOptions,
): KnowledgeMapEvalReport {
  return {
    ...report,
    gate: evaluateKnowledgeMapGate(report, options),
  };
}

export function evaluateKnowledgeMapGate(
  report: KnowledgeMapEvalReport,
  options: KnowledgeMapGateOptions,
): KnowledgeMapGateResult {
  const evaluatedResults = selectGateResults(report.results, options.level);
  const failed = evaluatedResults.filter((item) => !item.passed);
  const passRate = ratio(evaluatedResults, (item) => item.passed);
  const routingAccuracy = ratio(evaluatedResults, (item) => !item.failureReasons.includes('route_error'));
  const violations: string[] = [];
  const thresholds: Record<string, number> = {};
  const baselinePassRate = options.baselineReport?.summary.passRate;

  if (options.level === 'p0') {
    thresholds.passRate = 1;
    thresholds.failed = 0;
    if (passRate < 1 || failed.length > 0) {
      violations.push(`P0 核心 ${evaluatedResults.length} 条必须 100% 通过，当前通过率 ${(passRate * 100).toFixed(2)}%。`);
    }
  }

  if (options.level === 'p1') {
    thresholds.routingAccuracy = 0.95;
    if (routingAccuracy < thresholds.routingAccuracy) {
      violations.push(`P1 高频 ${evaluatedResults.length} 条路由准确率不得低于 95%，当前 ${(routingAccuracy * 100).toFixed(2)}%。`);
    }
  }

  if (options.level === 'p2') {
    thresholds.passRateNotBelowBaseline = baselinePassRate ?? passRate;
    if (typeof baselinePassRate === 'number' && passRate < baselinePassRate) {
      violations.push(
        `P2 整体通过率不得低于上一次基线 ${(baselinePassRate * 100).toFixed(2)}%，当前 ${(passRate * 100).toFixed(2)}%。`,
      );
    }
  }

  return {
    level: options.level,
    passed: violations.length === 0,
    evaluatedTotal: evaluatedResults.length,
    thresholds,
    actual: {
      passRate,
      failed: failed.length,
      routingAccuracy,
      baselinePassRate,
    },
    violations,
    improvementBacklog: buildImprovementBacklog(failed, options.level),
  };
}

function buildKnowledgeMapReport(results: KnowledgeMapEvalResult[], options: KnowledgeMapEvalOptions): KnowledgeMapEvalReport {
  const failures = results.filter((item) => !item.passed);
  const total = results.length;
  return {
    generatedAt: new Date().toISOString(),
    filters: {
      persona: options.persona ?? 'all',
      capability: options.capability ?? 'all',
    },
    summary: {
      total,
      passed: results.filter((item) => item.passed).length,
      failed: failures.length,
      passRate: ratio(results, (item) => item.passed),
      routingAccuracy: ratio(results, (item) => !item.failureReasons.includes('route_error')),
      entityAccuracy: ratio(results, (item) => !item.failureReasons.includes('entity_miss')),
      actionAccuracy: ratio(results, (item) => !item.failureReasons.includes('action_miss')),
      capabilityAccuracy: ratio(results, (item) => !item.failureReasons.includes('capability_miss')),
      outputContractAccuracy: ratio(results, (item) => !item.failureReasons.includes('output_contract_miss')),
      topFailureReasons: summarizeFailureReasons(failures),
    },
    results,
    failures,
    improvementBacklog: buildImprovementBacklog(failures, 'p2'),
  };
}

function selectGateResults(results: KnowledgeMapEvalResult[], level: KnowledgeMapGateLevel) {
  if (level === 'p0') return results.slice(0, 50);
  if (level === 'p1') return results.slice(0, 100);
  return results;
}

function buildImprovementBacklog(
  failures: KnowledgeMapEvalResult[],
  gateLevel: KnowledgeMapGateLevel,
): KnowledgeMapImprovementItem[] {
  const priority = gateLevel.toUpperCase() as 'P0' | 'P1' | 'P2';
  return failures.map((failure) => {
    const missingOutputKinds = failure.expected.outputKinds.filter((kind) => !failure.actual.outputKinds.includes(kind));
    return {
      id: failure.id,
      input: failure.input,
      priority,
      failureReasons: failure.failureReasons,
      expectedCapabilityId: failure.expected.capabilityId,
      actualCapabilityId: failure.actual.capabilityId,
      expectedPersonaCode: failure.expected.personaCode,
      actualPersonaCodes: failure.actual.personaCodes,
      expectedOutputKinds: failure.expected.outputKinds,
      actualOutputKinds: failure.actual.outputKinds,
      missingOutputKinds,
      recommendation: buildImprovementRecommendation(failure, missingOutputKinds),
    };
  });
}

function buildImprovementRecommendation(failure: KnowledgeMapEvalResult, missingOutputKinds: string[]) {
  const parts: string[] = [];
  if (failure.failureReasons.includes('entity_miss')) {
    parts.push(`补实体解析：期望识别 ${failure.expected.entityTypes.join('/')} ${failure.expected.entityName ?? ''}`.trim());
  }
  if (failure.failureReasons.includes('action_miss')) {
    parts.push(`补动作语义：期望 ${failure.expected.acceptableActions.join('/')}, 实际 ${failure.actual.action}`);
  }
  if (failure.failureReasons.includes('capability_miss')) {
    parts.push(`补能力映射：期望 ${failure.expected.capabilityId}, 实际 ${failure.actual.capabilityId ?? '未命中'}`);
  }
  if (failure.failureReasons.includes('route_error')) {
    parts.push(`补路由承接：期望 ${failure.expected.personaCode}, 实际 ${failure.actual.personaCodes.join('/') || '无 Persona'}`);
  }
  if (failure.failureReasons.includes('output_contract_miss')) {
    parts.push(`补输出契约：缺少 ${missingOutputKinds.join('/')}`);
  }
  return parts.join('；') || '补齐该问题的语义解析、能力映射和输出契约。';
}

function ratio<T>(items: T[], predicate: (item: T) => boolean) {
  if (!items.length) return 1;
  return Number((items.filter(predicate).length / items.length).toFixed(4));
}

function summarizeFailureReasons(failures: KnowledgeMapEvalResult[]) {
  const counter = new Map<KnowledgeMapFailureReason, number>();
  for (const failure of failures) {
    for (const reason of failure.failureReasons) {
      counter.set(reason, (counter.get(reason) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));
}

function isExpectedEntity(entity: EntityResolutionCandidate | undefined, testCase: KnowledgeMapEvalCase) {
  if (!entity) return false;
  if (!(testCase.expectedEntityTypes ?? []).includes(entity.objectType)) return false;
  if (!testCase.expectedEntityName) return true;
  const expected = normalizeEvalText(testCase.expectedEntityName);
  const displayName = normalizeEvalText(entity.displayName);
  return displayName.includes(expected) || expected.includes(displayName);
}

function normalizeEvalText(text: string) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function createKnowledgeMapMockPrisma() {
  const marketingPages = [
    {
      id: 11,
      activityId: 7,
      title: '老朋友回店护理礼',
      shareTitle: '老朋友回店护理礼',
      slug: 'old-friend-care-gift',
      shareUrl: 'https://ami.example.com/m/old-friend-care-gift',
      miniappPath: '/pages/marketing/old-friend-care-gift',
      qrCodeUrl: 'https://ami.example.com/qrcode/old-friend-care-gift.png',
      status: 'published',
      storeId: 1,
    },
    {
      id: 12,
      activityId: 8,
      title: '老朋友回店礼',
      shareTitle: '老朋友回店礼',
      slug: 'old-friend-return',
      shareUrl: 'https://ami.example.com/m/old-friend-return',
      miniappPath: '/pages/marketing/old-friend-return',
      qrCodeUrl: 'https://ami.example.com/qrcode/old-friend-return.png',
      status: 'published',
      storeId: 1,
    },
  ];
  const marketingActivities = [
    { id: 7, title: '老朋友回店护理礼', status: 'active', publishStatus: 'published' },
    { id: 8, title: '老朋友回店礼', status: 'active', publishStatus: 'published' },
  ];
  const customers = [
    { id: 21, name: '张雯', phone: '13800008888', memberLevel: '金卡', totalSpent: 12000, visitCount: 8 },
    { id: 22, name: '刘思琪', phone: '13800009999', memberLevel: '银卡', totalSpent: 193085, visitCount: 26 },
  ];
  const products = [
    { id: 301, name: '一次性丁腈手套', sku: 'GLOVE-NITRILE', brand: 'Ami', currentStock: 3, safetyStock: 20, status: 'active' },
    { id: 302, name: '补水精华', sku: 'SERUM-HYDRATE', brand: 'Ami', currentStock: 12, safetyStock: 8, status: 'active' },
  ];
  const projects = [
    { id: 77, name: '肩颈舒压护理', price: 298, duration: 60, status: 'active', online: true },
  ];
  const beauticians = [
    { id: 43, name: '宋乔', phone: '13900001111', levelId: 3, status: 'active' },
  ];
  const orders = [
    {
      id: 9001,
      orderNo: 'PO202606300001',
      checkoutGroupNo: 'CG202606300001',
      orderKind: 'product',
      customerName: '张雯',
      totalAmount: 880,
      netAmount: 780,
      status: 'completed',
      payMethod: 'cash',
      createdAt: new Date('2026-06-30T10:00:00.000Z'),
    },
  ];
  const customerCards = [
    {
      id: 501,
      cardName: '水光护理卡',
      remainingTimes: 3,
      expiryDate: new Date('2026-09-30T00:00:00.000Z'),
      status: 'active',
      customer: customers[0],
    },
  ];

  return {
    marketingPage: { findMany: async () => marketingPages },
    marketingActivity: { findMany: async () => marketingActivities },
    customer: { findMany: async () => customers },
    product: { findMany: async () => products },
    project: { findMany: async () => projects },
    beautician: { findMany: async () => beauticians },
    productOrder: { findMany: async () => orders },
    customerCard: { findMany: async () => customerCards },
  };
}
