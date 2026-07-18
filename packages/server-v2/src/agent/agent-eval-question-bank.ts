import type { AgentRole } from './agent.types.js';
import type { AgentEvalCaseDefinition } from './agent-eval.cases.js';

export type AgentQuestionBankPersona =
  | 'manager'
  | 'marketing'
  | 'reception'
  | 'beautician'
  | 'inventory'
  | 'finance'
  | 'edge';

export type AgentQuestionPriority = 'P0' | 'P1' | 'P2';

export type AgentQuestionIntentType = 'query' | 'analysis_and_recommendation' | 'draft' | 'clarify';

export type AgentQuestionOutputKind = 'text' | 'kpi' | 'table' | 'chart' | 'action_card' | 'clarify' | 'evidence';

export type AgentQuestionSystemSupportStatus =
  | 'system_unsupported'
  | 'system_supported_agent_gap'
  | 'system_supported_testable';

export type AgentQuestionCoverageStage = 'p0_daily' | 'kiosk_e2e' | 'conversation' | 'remaining_batch' | 'not_run';

export type AgentEvalQuestionCase = {
  id: string;
  sourceCategory: string;
  sourceSection: string;
  sourceIndex: number;
  persona: AgentQuestionBankPersona;
  evalRole: AgentRole;
  input: string;
  priority: AgentQuestionPriority;
  expectedRoute?: AgentQuestionBankPersona;
  expectedSkill?: string;
  expectedTool?: string;
  expectedIntentType?: AgentQuestionIntentType;
  expectedOutputKinds?: AgentQuestionOutputKind[];
  expectedDataSources?: string[];
  expectedSemanticIntent?: string;
  expectedDomains?: string[];
  expectedEntities?: string[];
  expectedMetrics?: string[];
  expectedDimensions?: string[];
  expectedCapabilityKeys?: string[];
  expectedPlanShape?: {
    minNodes?: number;
    maxNodes?: number;
    requiresPreview?: boolean;
    requiredCapabilityKeys?: string[];
  };
  riskLevel?: 'low' | 'medium' | 'high';
  requiresApproval?: boolean;
  notes?: string;
  systemSupportStatus: AgentQuestionSystemSupportStatus;
  systemSupportReason: string;
  coverageStage: AgentQuestionCoverageStage;
};

export type AgentEvalQuestionBank = {
  title: string;
  version?: string;
  date?: string;
  description?: string;
  questions: AgentEvalQuestionCase[];
};

export const AGENT_EVAL_QUESTION_BANK_TOTAL = 650;
export const AGENT_EVAL_QUESTION_BANK_P0_TOTAL = 120;

export type AgentEvalConversationTurn = {
  id: string;
  input: string;
  role?: AgentRole;
  contextPatch?: Record<string, unknown>;
  expectedTool?: string;
  expectedIntentType?: AgentQuestionIntentType;
  expectedClarification?: boolean;
  expectedDomain?: string;
  expectedFilters?: Record<string, unknown>;
  expectedWarnings?: string[];
};

export type AgentEvalConversationCase = {
  id: string;
  scenario: string;
  role: AgentRole;
  initialContext?: Record<string, unknown>;
  turns: AgentEvalConversationTurn[];
};

const PERSONA_LABELS: Array<{ pattern: RegExp; persona: AgentQuestionBankPersona; evalRole: AgentRole }> = [
  { pattern: /店长经营/, persona: 'manager', evalRole: 'manager' },
  { pattern: /营销增长/, persona: 'marketing', evalRole: 'manager' },
  { pattern: /前台接待/, persona: 'reception', evalRole: 'reception' },
  { pattern: /美容师服务/, persona: 'beautician', evalRole: 'beautician' },
  { pattern: /库存采购/, persona: 'inventory', evalRole: 'manager' },
  { pattern: /财务风控/, persona: 'finance', evalRole: 'manager' },
  { pattern: /Edge Case|多轮对话/, persona: 'edge', evalRole: 'manager' },
];

const CATEGORY_SLUGS: Record<string, string> = {
  经营概览: 'business-overview',
  客户管理: 'customer-management',
  员工管理: 'staff-management',
  库存运营: 'inventory-ops',
  风险预警: 'risk-alert',
  客群识别与分析: 'audience-analysis',
  活动策划: 'campaign-planning',
  话术与内容生成: 'content-generation',
  权益与投入产出: 'benefit-roi',
  自动化与触达规则: 'automation-touch',
  客户查询: 'customer-lookup',
  预约管理: 'reservation-management',
  收银与核销: 'cashier-card-usage',
  现场协调: 'onsite-coordination',
  今日服务安排: 'service-schedule',
  客户护理建议: 'care-advice',
  服务记录与跟进: 'service-record-followup',
  个人业绩: 'personal-performance',
  库存查询与风险: 'inventory-query-risk',
  临期与损耗: 'expiry-loss',
  采购建议: 'purchase-suggestion',
  消耗分析: 'consumption-analysis',
  供应链协调: 'supply-coordination',
  收入与对账: 'income-reconcile',
  成本与毛利: 'cost-margin',
  退款与折扣: 'refund-discount',
  财务风险与合规: 'finance-risk-compliance',
  意图模糊测试: 'ambiguous-intent',
  代词和上下文继承测试: 'context-inherit',
  跨场景融合问题: 'cross-domain',
  否定与纠正测试: 'correction',
  极限与压力测试: 'stress',
};

const SKILL_BY_PERSONA: Record<Exclude<AgentQuestionBankPersona, 'edge'>, string> = {
  manager: 'store.operations.overview',
  marketing: 'marketing.growth.execution',
  reception: 'reception.service.workflow',
  beautician: 'service.quality.record',
  inventory: 'inventory.supply.risk',
  finance: 'finance.profit.risk',
};

const DATA_SOURCE_BY_PERSONA: Record<Exclude<AgentQuestionBankPersona, 'edge'>, string[]> = {
  manager: ['ProductOrder', 'Reservation', 'Customer', 'Beautician'],
  marketing: ['Customer', 'MarketingActivity', 'Promotion', 'TerminalFollowUpTask'],
  reception: ['Customer', 'Reservation', 'CustomerCard', 'ProductOrder'],
  beautician: ['ServiceTask', 'Reservation', 'Customer', 'ServiceRecord'],
  inventory: ['Product', 'StockMovement', 'ProjectBomItem', 'PurchaseOrder'],
  finance: ['ProductOrder', 'PaymentRecord', 'RefundRecord', 'DailySettlement'],
};

const DOMAIN_BY_PERSONA: Record<Exclude<AgentQuestionBankPersona, 'edge'>, string> = {
  manager: 'store_operation',
  marketing: 'marketing_growth',
  reception: 'front_desk',
  beautician: 'beautician_service',
  inventory: 'inventory_procurement',
  finance: 'finance_risk',
};

const SYSTEM_UNSUPPORTED_RULES: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /消防|安全检查|税务|发票|纳税|报税/,
    reason: '当前系统没有消防安全、税务、发票或纳税业务闭环。',
  },
  {
    pattern: /供应商.*(涨价|调价|通知)|涨价通知/,
    reason: '当前系统有采购与供应链数据，但没有供应商涨价通知业务对象。',
  },
  {
    pattern: /离职.*带走客户|带走客户|员工离职/,
    reason: '当前系统没有员工离职交接或客户流失归因到离职带走的业务闭环。',
  },
  {
    pattern: /投诉|客诉|差评|负面反馈|表达不满|满意度/,
    reason: '当前系统没有客户投诉、差评、满意度或评价反馈数据闭环。',
  },
  {
    pattern: /服务事故|皮肤过敏|过敏|事故/,
    reason: '当前系统没有服务事故、皮肤过敏或不良反应记录业务闭环。',
  },
  {
    pattern: /等待时间长|等太久|离开/,
    reason: '当前系统没有客户等待离店或现场排队流失记录业务闭环。',
  },
  {
    pattern: /店里设备|美容仪器|仪器.*故障|设备最近/,
    reason: '当前系统支持终端运行诊断，但没有美容设备维保或故障业务闭环。',
  },
];

const AGENT_GAP_RULES: RegExp[] = [
  /男性客户|短视频脚本|朋友圈|文案|私信|话术|好评|邀请话术|生日祝福/,
  /老带新|拼团|朋友圈|线上引流|三周年|国庆|母亲节|情人节|季节性/,
  /渠道|转介绍|免费体验|ROI|投入回报|核销周期|客户质量/,
  /采购链接|供应链.*协调|跨店|多店|小程序|终端设备|打印机|扫码器/,
];

const KIOSK_CORE_QUESTION_PATTERNS = [
  /这个月.*营业额|本月.*营收|本月.*营业额/,
  /昨天.*(消费|成交).*客户|昨日.*(消费|成交).*客户/,
  /产品.*(快过期|临期)|临期.*产品|哪些.*临期/,
  /这个月.*(谁|员工|美容师).*业绩.*(最好|最高)|本月.*表现.*好/,
  /(紧急|优先).*召回.*客户|需要.*召回.*客户/,
  /今天.*(所有)?预约.*列|今日.*预约.*清单/,
  /今天.*(收银|核销|办卡).*订单.*列表|今日.*订单.*列表/,
  /本月.*利润.*(下降|为什么)|这个月利润.*下降|这个月利润率下降/,
  /我今天.*几个客人|今天.*服务.*几个客人/,
  /设置.*客户.*\d+天.*(自动提醒|提醒)|客户.*自动提醒/,
];

function resolvePersona(section: string) {
  return PERSONA_LABELS.find((item) => item.pattern.test(section));
}

function normalizeTitle(line: string) {
  return line.replace(/^#+\s*/, '').replace(/（\d+条）/g, '').trim();
}

function slugCategory(category: string) {
  return CATEGORY_SLUGS[category] ?? category.toLowerCase().replace(/\s+/g, '-');
}

function isHighRiskInput(input: string) {
  return /自动(?:发|发送|触达|提醒|扣|核销|退款|收款)|群发|直接(?:退款|核销|收款|扣款|发送)|设置.*规则|执行退卡|发起退款|立即退款|执行扣款|发券|发放优惠券/.test(input);
}

function inferIntentType(input: string, category: string): AgentQuestionIntentType {
  if (/意图模糊/.test(category)) return 'clarify';
  if (/设置|生成.*报告|制定|策划|设计|写|话术|文案|脚本|流程|规则|方案/.test(input)) return 'draft';
  if (/为什么|原因|分析|怎么处理|怎么办|建议|是否合理|风险|异常|问题|总结|概览|情况怎么样|情况如何/.test(input)) return 'analysis_and_recommendation';
  return 'query';
}

function inferOutputKinds(input: string, intentType: AgentQuestionIntentType): AgentQuestionOutputKind[] {
  if (intentType === 'clarify') return ['clarify'];
  const kinds = new Set<AgentQuestionOutputKind>(['text', 'evidence']);
  const asksForCollection = /哪些|哪几个|谁|哪个|各(?:员工|美容师|客户|商品|项目)|排行|排名|名单|列出/.test(input);
  if (
    !asksForCollection &&
    /多少|几个|金额|营业额|收入|毛利|利润|客单价|完成率|(?:率|比例)(?:多少|多高|怎么样|如何|$)|总计/.test(input)
  ) {
    kinds.add('kpi');
  }
  if (/哪些|列|清单|明细|所有|排名|对比|列表|记录|客户|客人|员工|产品|预约|订单|次卡|卡项|权益/.test(input)) {
    kinds.add('table');
  }
  if (/趋势|近三|最近三|这周每天|最近三个月|季度|对比/.test(input)) kinds.add('chart');
  if (
    /设置|创建|新建|执行|提交|发起|自动(?:提醒|触达|发送)|群发|发券|改约|取消预约|打开收银|打开核销|生成.*(?:任务|预览|采购单)/.test(input)
  ) {
    kinds.add('action_card');
  }
  return [...kinds];
}

function inferPriority(input: string, persona: AgentQuestionBankPersona, category: string, indexInCategory: number): AgentQuestionPriority {
  if (persona === 'edge') {
    if (/意图模糊|代词和上下文/.test(category)) return 'P0';
    if (/否定与纠正|极限与压力/.test(category) && indexInCategory <= 5) return 'P0';
    return 'P1';
  }

  if (indexInCategory <= 3) return 'P0';
  if (/营业额|收入|预约|库存|临期|退款|毛利|利润|核销|收银|办卡|客户|业绩|提成/.test(input)) return 'P1';
  return 'P2';
}

function inferQuestion(input: string, persona: AgentQuestionBankPersona, category: string, indexInCategory: number) {
  const intentType = inferIntentType(input, category);
  const requiresApproval = isHighRiskInput(input);
  const businessPersona = persona === 'edge' ? undefined : persona;
  const systemSupport = classifySystemSupport(input, persona);
  const semanticIntent = inferSemanticIntent(input, intentType, requiresApproval);
  const expectedSkill = businessPersona ? SKILL_BY_PERSONA[businessPersona] : undefined;
  return {
    priority: inferPriority(input, persona, category, indexInCategory),
    expectedRoute: businessPersona,
    expectedSkill,
    expectedIntentType: intentType,
    expectedOutputKinds: inferOutputKinds(input, intentType),
    expectedDataSources: businessPersona ? DATA_SOURCE_BY_PERSONA[businessPersona] : undefined,
    expectedSemanticIntent: semanticIntent,
    expectedDomains: businessPersona ? [DOMAIN_BY_PERSONA[businessPersona]] : [],
    expectedEntities: inferExpectedEntities(input, category),
    expectedMetrics: inferExpectedMetrics(input),
    expectedDimensions: inferExpectedDimensions(input, semanticIntent),
    expectedCapabilityKeys: expectedSkill ? [expectedSkill] : [],
    expectedPlanShape: systemSupport.status === 'system_unsupported'
      ? undefined
      : {
          minNodes: /跨场景融合/.test(category) ? 2 : 1,
          maxNodes: 8,
          requiresPreview: requiresApproval,
          requiredCapabilityKeys: [],
        },
    riskLevel: requiresApproval ? ('high' as const) : ('low' as const),
    requiresApproval,
    systemSupportStatus: systemSupport.status,
    systemSupportReason: systemSupport.reason,
    coverageStage: 'not_run' as const,
  };
}

function inferSemanticIntent(
  input: string,
  intentType: AgentQuestionIntentType,
  requiresApproval: boolean,
) {
  if (intentType === 'clarify') return 'clarify';
  if (requiresApproval) return 'action';
  if (intentType === 'draft') return 'draft';
  if (intentType === 'analysis_and_recommendation') return /建议|怎么办|怎么处理|推荐/.test(input) ? 'recommendation' : 'diagnosis';
  if (/趋势|走势|每天|近三天|最近三天|最近三个月/.test(input)) return 'trend';
  if (/相比|对比|跟.*比|和.*比|比.*差|差多少/.test(input)) return 'comparison';
  if (/排行|排名|谁.*(?:最好|最高|最多|最少)|(?:最好|最高|最多|最少).*(?:谁|哪个)|哪个.*(?:最好|最高|最多|最少)|哪些.*(?:最高|最多|最快|最慢)/.test(input)) return 'ranking';
  return 'query';
}

function inferExpectedEntities(input: string, category: string) {
  const values = new Set<string>();
  if (/客户|客人|会员|新客|老客|VIP|沉睡|流失|复购/.test(input + category)) values.add('customer');
  if (/员工|美容师|排班|提成|人效|业绩/.test(input + category)) values.add('beautician');
  if (/产品|商品|耗材|库存|采购|供应商|SKU/.test(input + category)) values.add('product');
  if (/项目|护理|疗程/.test(input + category)) values.add('project');
  if (/预约|到店|爽约|空档/.test(input + category)) values.add('reservation');
  if (/订单|收银|消费|退款|支付/.test(input + category)) values.add('order');
  if (/次卡|储值卡|会员卡|充值|核销/.test(input + category)) values.add('customer_card');
  if (/活动|营销|渠道|触达|召回/.test(input + category)) values.add('marketing_activity');
  return [...values];
}

function inferExpectedMetrics(input: string) {
  const values = new Set<string>();
  if (/营业额|流水|实收|收入|营收/.test(input)) values.add('paid_revenue');
  if (/(?:产品|商品|货品).*(?:毛利率|利润率)|(?:毛利率|利润率).*(?:产品|商品|货品)/.test(input)) values.add('product_gross_margin_rate');
  else if (/毛利率|毛利/.test(input)) values.add('gross_margin_rate');
  if (/(?:产品|商品|货品).*(?:低于成本|亏本)|(?:低于成本|亏本).*(?:产品|商品|货品)/.test(input)) values.add('product_below_cost_sale_count');
  if (/预约.*(?:多少|几个|数量)|几个预约/.test(input)) values.add('appointment_count');
  if (/谁|员工|美容师/.test(input) && /客户复购率/.test(input)) values.add('staff_customer_repurchase_rate');
  else if (/复购率/.test(input)) values.add('repurchase_rate');
  if (/退款.*(?:金额|多少)/.test(input)) values.add('refund_amount');
  if (/退款有几笔|退款.*(?:笔数|几笔|次数)/.test(input)) values.add('refund_count');
  if (/(折扣|优惠|让利).*(?:多少钱|多少|金额|送出去)/.test(input)) values.add('discount_amount');
  if (/商品|产品/.test(input) && /销售额|销售金额/.test(input)) values.add('product_sales_amount');
  else if (/商品|产品/.test(input) && /销售|卖得|销量/.test(input)) values.add('product_sales_quantity');
  if (/(耗材|物料|产品|商品).*(消耗|用量|出库).*(最快|最多|排行|排名)/.test(input)) values.add('inventory_consumption_quantity');
  if (/员工|美容师|谁/.test(input) && /业绩|表现/.test(input) && !/(下滑|下降|环比|趋势|变化)/.test(input)) {
    values.add('staff_performance_score');
  }
  if (/员工|美容师|谁/.test(input) && /(?:接的客人|接待客户|接客|服务了几个客人|服务客户)/.test(input)) {
    values.add('staff_unique_customer_count');
  }
  if (/提成/.test(input)) values.add('staff_commission_amount');
  if (/负债|未消耗|剩余次数/.test(input)) values.add('card_liability');
  if (/新客/.test(input) && /新来|新增|来了多少|多少新客/.test(input)) values.add('new_customer_count');
  if (/新客/.test(input) && /转化|成交|首单/.test(input)) {
    values.add('new_customer_conversion_count');
    values.add('new_customer_conversion_rate');
  }
  if (/(投诉|客诉|差评|不满|负面反馈)/.test(input)) {
    if (/(员工|美容师|谁|哪个|哪位)/.test(input)) values.add('staff_customer_complaint_count');
    else values.add('customer_complaint_count');
    values.add('customer_feedback_collection_coverage_rate');
  }
  if (/(投诉|客诉|不满)/.test(input) && /(未解决|没解决|待处理|处理中|还有多少)/.test(input)) {
    values.add('customer_unresolved_complaint_count');
  }
  if (/(满意度|满意评价|服务评分|星级|评分)/.test(input)) {
    values.add('customer_average_satisfaction_rating');
    values.add('customer_feedback_collection_coverage_rate');
  }
  if (/(等待|排队).*(过久|太久|时间长).*(离开|离店|走了)|等太久.*(?:离开|离店|走了)/.test(input)) {
    values.add('customer_long_wait_departure_count');
    values.add('customer_waiting_collection_coverage_rate');
  }
  if (/沉睡客户/.test(input) && /(?:唤醒|回流).*(?:迹象|信号)|(?:迹象|信号).*(?:唤醒|回流)/.test(input)) {
    values.add('dormant_reactivation_customer_count');
  }
  return [...values];
}

function inferExpectedDimensions(input: string, semanticIntent: string) {
  const values = new Set<string>();
  const grouped = /谁|哪个|哪些|各|分别|排行|排名|对比|最多|最高|最低|最好/.test(input);
  const groupedByStaff = grouped && /员工|美容师|谁/.test(input);
  if (groupedByStaff) values.add('beautician');
  if (grouped && /商品|产品|耗材/.test(input)) values.add('product');
  if (grouped && /项目|护理/.test(input)) values.add('project');
  if (
    grouped &&
    !groupedByStaff &&
    /客户|客人|会员/.test(input) &&
    !/(?:新客.*老客|老客.*新客).*(?:各|分别)|(?:各|分别).*(?:新客.*老客|老客.*新客)/.test(input)
  ) values.add('customer');
  if (/现金(?!流)|微信|支付宝|支付方式/.test(input)) values.add('payment_method');
  if (/(年龄段|年龄画像|年龄分布)/.test(input)) values.add('customerAgeGroup');
  if (['trend', 'comparison'].includes(semanticIntent)) values.add('date');
  return [...values];
}

export function classifySystemSupport(input: string, persona: AgentQuestionBankPersona): {
  status: AgentQuestionSystemSupportStatus;
  reason: string;
} {
  const unsupported = SYSTEM_UNSUPPORTED_RULES.find((rule) => rule.pattern.test(input));
  if (unsupported) return { status: 'system_unsupported', reason: unsupported.reason };

  if (persona === 'edge') {
    return {
      status: 'system_supported_testable',
      reason: 'Edge Case 属于 Agent 对话能力测试，不依赖新增业务对象。',
    };
  }

  const likelyAgentGap = AGENT_GAP_RULES.some((pattern) => pattern.test(input));
  if (likelyAgentGap) {
    return {
      status: 'system_supported_agent_gap',
      reason: '系统存在相关业务对象或数据，但当前 Agent Skill/Tool 覆盖可能不足，纳入测试并作为能力缺口跟踪。',
    };
  }

  return {
    status: 'system_supported_testable',
    reason: '当前系统已有对应业务对象、页面/API 或真实数据 fixture，可纳入 Agent 评测。',
  };
}

export function parseAgentEvalQuestionMarkdown(markdown: string): AgentEvalQuestionBank {
  const lines = markdown.split(/\r?\n/);
  const title = normalizeTitle(lines.find((line) => line.startsWith('# ')) ?? 'Agent 评测问题库');
  const version = lines.find((line) => line.startsWith('版本：'))?.replace('版本：', '').trim();
  const date = lines.find((line) => line.startsWith('日期：'))?.replace('日期：', '').trim();
  const description = lines.find((line) => line.startsWith('说明：'))?.replace('说明：', '').trim();
  const questions: AgentEvalQuestionCase[] = [];

  let currentPersona: AgentQuestionBankPersona | null = null;
  let currentEvalRole: AgentRole = 'manager';
  let currentSection = '';
  let currentCategory = '';
  const categoryCounters = new Map<string, number>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('## ')) {
      currentSection = normalizeTitle(line);
      const resolved = resolvePersona(currentSection);
      if (resolved) {
        currentPersona = resolved.persona;
        currentEvalRole = resolved.evalRole;
      }
      continue;
    }

    if (line.startsWith('### ')) {
      currentCategory = normalizeTitle(line);
      categoryCounters.set(`${currentPersona}:${currentCategory}`, 0);
      continue;
    }

    const matched = line.match(/^(\d+)\.\s+(.+)$/);
    if (!matched || !currentPersona || !currentCategory) continue;

    const sourceIndex = Number(matched[1]);
    const input = matched[2].trim();
    const categoryKey = `${currentPersona}:${currentCategory}`;
    const indexInCategory = (categoryCounters.get(categoryKey) ?? 0) + 1;
    categoryCounters.set(categoryKey, indexInCategory);
    const inferred = inferQuestion(input, currentPersona, currentCategory, indexInCategory);
    questions.push({
      id: `qb-${currentPersona}-${slugCategory(currentCategory)}-${String(sourceIndex).padStart(3, '0')}`,
      sourceCategory: currentCategory,
      sourceSection: currentSection,
      sourceIndex,
      persona: currentPersona,
      evalRole: currentEvalRole,
      input,
      ...inferred,
    });
  }

  return { title, version, date, description, questions };
}

export function selectP0QuestionBankCases(questions: AgentEvalQuestionCase[]) {
  const result: AgentEvalQuestionCase[] = [];
  const businessPersonas: AgentQuestionBankPersona[] = ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance'];
  for (const persona of businessPersonas) {
    result.push(...takeRoundRobinByCategory(questions.filter((item) => item.persona === persona), 15));
  }

  const edgeQuestions = questions.filter((item) => item.persona === 'edge');
  result.push(
    ...edgeQuestions.filter((item) => item.sourceCategory === '意图模糊测试'),
    ...edgeQuestions.filter((item) => item.sourceCategory === '代词和上下文继承测试'),
    ...edgeQuestions.filter((item) => item.sourceCategory === '否定与纠正测试').slice(0, 5),
    ...edgeQuestions.filter((item) => item.sourceCategory === '极限与压力测试').slice(0, 5),
  );

  return result.map((item) => ({ ...item, priority: 'P0' as const, coverageStage: 'p0_daily' as const }));
}

export function annotateQuestionBankCoverage(questions: AgentEvalQuestionCase[]) {
  const p0Ids = new Set(selectP0QuestionBankCases(questions).map((item) => item.id));
  const conversationInputs = new Set(
    QUESTION_BANK_CONVERSATION_CASES.flatMap((testCase) => testCase.turns.map((turn) => turn.input)),
  );
  return questions.map((item) => {
    const coverageStage: AgentQuestionCoverageStage = p0Ids.has(item.id)
      ? 'p0_daily'
      : KIOSK_CORE_QUESTION_PATTERNS.some((pattern) => pattern.test(item.input))
        ? 'kiosk_e2e'
        : conversationInputs.has(item.input)
          ? 'conversation'
          : 'not_run';
    return { ...item, coverageStage };
  });
}

export function selectRemainingSupportedQuestionBankCases(questions: AgentEvalQuestionCase[], persona?: AgentQuestionBankPersona) {
  return annotateQuestionBankCoverage(questions).filter((item) => {
    if (persona && item.persona !== persona) return false;
    if (item.systemSupportStatus === 'system_unsupported') return false;
    return item.coverageStage === 'not_run';
  });
}

export function toAgentEvalCaseDefinition(testCase: AgentEvalQuestionCase): AgentEvalCaseDefinition {
  return {
    id: testCase.id,
    scenario: `问题库：${testCase.sourceSection} / ${testCase.sourceCategory}`,
    input: testCase.input,
    role: testCase.evalRole,
    expectedIntentType: testCase.expectedIntentType,
    expectedRiskLevel: testCase.riskLevel,
    expectedClarification: testCase.expectedIntentType === 'clarify',
  };
}

export function toAgentEvalCaseDefinitions(testCases: AgentEvalQuestionCase[]): AgentEvalCaseDefinition[] {
  return testCases.map(toAgentEvalCaseDefinition);
}

export const QUESTION_BANK_CONVERSATION_CASES: AgentEvalConversationCase[] = [
  {
    id: 'qb-conv-consumption-list-priority-followup',
    scenario: '多轮：消费客户清单后限定范围做优先跟进',
    role: 'manager',
    turns: [
      {
        id: 'turn-1',
        input: '昨天有哪些消费的客户，列出清单',
        expectedTool: 'business.query.ask',
        expectedIntentType: 'query',
        expectedClarification: false,
        expectedDomain: 'order',
        contextPatch: {
          conversationFocus: {
            sourceRunId: 156,
            timeRange: { preset: 'yesterday', label: '昨天' },
            currentItems: [
              {
                customerId: 501,
                customerName: '马美琳',
                paidAmount: 3600,
                paidAmountText: '¥3,600',
                memberLevel: '金卡',
                phoneMasked: '138****0001',
                itemsSummary: '水光护理',
                suggestion: '优先邀约复购水光护理。',
              },
              {
                customerId: 502,
                customerName: '林晓雯',
                paidAmount: 980,
                paidAmountText: '¥980',
                memberLevel: '银卡',
                phoneMasked: '139****0002',
                itemsSummary: '肩颈护理',
              },
            ],
          },
        },
      },
      {
        id: 'turn-2',
        input: '优先联系哪些客户？',
        expectedTool: 'customer.priority.rank',
        expectedIntentType: 'analysis_and_recommendation',
        expectedClarification: false,
        expectedDomain: 'customer',
        expectedFilters: {
          contextScope: 'previous_order_customer_consumption_list',
          customerIds: [501, 502],
        },
      },
    ],
  },
  {
    id: 'qb-conv-customer-pronoun-benefit',
    scenario: '多轮：客户代词追问卡项权益',
    role: 'reception',
    initialContext: {
      conversationFocus: {
        sourceRunId: 112,
        timeRange: { preset: 'today', label: '今天' },
        currentCustomer: {
          customerId: 501,
          customerName: '马美琳',
          phoneMasked: '138****1234',
        },
      },
    },
    turns: [
      {
        id: 'turn-1',
        input: '这个客户还有什么卡和权益？',
        expectedTool: 'reception.card.benefit.summary',
        expectedIntentType: 'query',
        expectedClarification: false,
        expectedDomain: 'card',
        expectedFilters: {
          customerId: 501,
          customerName: '马美琳',
          phoneMasked: '138****1234',
        },
      },
    ],
  },
  {
    id: 'qb-conv-marketing-activity-followup',
    scenario: '多轮：活动草稿后追问转化效果',
    role: 'manager',
    initialContext: {
      conversationFocus: {
        sourceRunId: 125,
        currentActivity: {
          activityId: 901,
          activityTitle: '编辑后的沉睡客户召回活动',
          status: 'draft',
        },
      },
    },
    turns: [
      {
        id: 'turn-1',
        input: '这个活动转化效果怎么样？',
        expectedTool: 'marketing.effect.diagnose',
        expectedIntentType: 'analysis_and_recommendation',
        expectedClarification: false,
        expectedDomain: 'marketing',
        expectedFilters: {
          activityId: 901,
          activityTitle: '编辑后的沉睡客户召回活动',
          activityStatus: 'draft',
        },
      },
    ],
  },
  {
    id: 'qb-conv-missing-context-pronoun-clarify',
    scenario: '多轮：无上下文代词必须追问',
    role: 'manager',
    turns: [
      {
        id: 'turn-1',
        input: '她呢？',
        expectedIntentType: 'clarify',
        expectedClarification: true,
        expectedDomain: 'unknown',
      },
    ],
  },
];

function takeRoundRobinByCategory(items: AgentEvalQuestionCase[], limit: number) {
  const categories = [...new Set(items.map((item) => item.sourceCategory))];
  const grouped = new Map(categories.map((category) => [category, items.filter((item) => item.sourceCategory === category)]));
  const selected: AgentEvalQuestionCase[] = [];
  let cursor = 0;
  while (selected.length < limit && categories.length) {
    const category = categories[cursor % categories.length];
    const bucket = grouped.get(category) ?? [];
    const next = bucket.shift();
    if (next) selected.push(next);
    if (!bucket.length) categories.splice(cursor % categories.length, 1);
    else cursor += 1;
  }
  return selected;
}
