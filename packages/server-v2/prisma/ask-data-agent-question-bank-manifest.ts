import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AskDataIntentParser } from '../src/ask-data-free-sql/ask-data-intent-parser.js';

type SupportClass =
  | 'ask_query_supported'
  | 'ask_query_low_confidence'
  | 'clarification_required'
  | 'multi_turn_context_required'
  | 'ask_readonly_boundary'
  | 'ask_sensitive_boundary'
  | 'ask_scope_limit'
  | 'admin_supported_ask_not_open'
  | 'brain_content_or_advice'
  | 'admin_backend_unsupported';

type SupportLevel = 'supported' | 'partial' | 'unsupported' | 'unknown';

type QuestionItem = {
  id: string;
  sourceRole: string;
  section: string;
  number: number;
  question: string;
  supportClass: SupportClass;
  managementSupport: SupportLevel;
  backendSupport: SupportLevel;
  reason: string;
  expectedView: string;
  expectedViewLabel: string;
  semanticMetricKeys: string[];
  semanticCandidateViews: string[];
};

const sourcePath = resolve(
  process.cwd(),
  argumentValue('--source=') ??
    '../../docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ??
    '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/agent-question-bank-manifest.json',
);
const parser = new AskDataIntentParser();
const source = readFileSync(sourcePath, 'utf8');
const parsedQuestions = parseQuestions(source);
const questions = parsedQuestions.map(classifyQuestion);
const selectedQuestions = questions
  .filter(
    (item) =>
      Boolean(item.expectedView) &&
      (item.supportClass === 'ask_query_supported' || item.supportClass === 'ask_query_low_confidence'),
  )
  .map((item) => ({
    id: item.id,
    domain: item.sourceRole,
    role: item.sourceRole,
    type: item.supportClass,
    difficulty: item.supportClass === 'ask_query_low_confidence' ? 'hard' : 'medium',
    question: item.question,
    expected_target: item.expectedViewLabel || 'Ami Ask governed query',
    notes: item.reason,
    expectedView: item.expectedView,
    expectedViewLabel: item.expectedViewLabel,
  }));

const report = {
  generatedAt: new Date().toISOString(),
  sourcePath,
  sourceQuestionCount: questions.length,
  targetPerView: 0,
  viewCount: 34,
  coveredViews: new Set(selectedQuestions.map((item) => item.expectedView).filter(Boolean)).size,
  insufficientViews: [],
  selectedCaseCount: selectedQuestions.length,
  summary: {
    bySupportClass: countBy(questions, (item) => item.supportClass),
    managementUnsupported: questions.filter((item) => item.managementSupport === 'unsupported').length,
    backendUnsupported: questions.filter((item) => item.backendSupport === 'unsupported').length,
  },
  questions,
  selectedQuestions,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      sourceQuestionCount: report.sourceQuestionCount,
      selectedCaseCount: report.selectedCaseCount,
      coveredViews: report.coveredViews,
      ...report.summary,
    },
    null,
    2,
  ),
);

function parseQuestions(markdown: string) {
  const roleSlugs = ['manager', 'marketing', 'frontdesk', 'beautician', 'inventory', 'finance', 'edge'];
  const result: Array<Omit<QuestionItem, 'supportClass' | 'managementSupport' | 'backendSupport' | 'reason' | 'expectedView' | 'expectedViewLabel' | 'semanticMetricKeys' | 'semanticCandidateViews'>> = [];
  let sourceRole = '';
  let roleSlug = '';
  let section = '';
  let roleIndex = -1;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const roleMatch = line.match(/^##\s+(.+?)(?:（\d+条）)?$/);
    if (roleMatch) {
      sourceRole = roleMatch[1].trim();
      roleIndex += 1;
      roleSlug = roleSlugs[roleIndex] ?? `role-${roleIndex + 1}`;
      section = '';
      continue;
    }
    const sectionMatch = line.match(/^###\s+(.+?)(?:（\d+条）)?$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const questionMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (!questionMatch || !sourceRole) continue;
    const number = Number(questionMatch[1]);
    result.push({
      id: `${roleSlug}-${String(number).padStart(3, '0')}`,
      sourceRole,
      section,
      number,
      question: questionMatch[2].trim(),
    });
  }
  return result;
}

function classifyQuestion(
  item: Omit<QuestionItem, 'supportClass' | 'managementSupport' | 'backendSupport' | 'reason' | 'expectedView' | 'expectedViewLabel' | 'semanticMetricKeys' | 'semanticCandidateViews'>,
): QuestionItem {
  const question = item.question;
  const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
  const primary = parsed.matchedContracts[0]?.contract;
  const inferredView = inferExpectedView(question);
  const inferredContract = parsed.matchedContracts.find((match) => match.contract.preferredView === inferredView)?.contract;
  const effectiveContract = inferredContract ?? (inferredView ? undefined : primary);
  const semanticCandidateViews = [...new Set(parsed.matchedContracts.map((match) => match.contract.preferredView))];
  const semantic = {
    expectedView: inferredView ?? effectiveContract?.preferredView ?? '',
    expectedViewLabel: inferredView ? viewLabel(inferredView) : effectiveContract?.label ?? '',
    semanticMetricKeys: parsed.semanticIntent.metricKeys,
    semanticCandidateViews,
  };

  if (item.sourceRole.startsWith('附：Edge Case')) {
    if (item.section.includes('意图模糊')) {
      return decision(item, semantic, 'clarification_required', 'partial', 'partial', '问题缺少指标、对象或时间，需要针对性澄清。');
    }
    if (item.section.includes('代词和上下文') || item.section.includes('否定与纠正')) {
      return decision(item, semantic, 'multi_turn_context_required', 'supported', 'supported', '依赖上一轮对话状态，不能作为独立单轮 SQL 问题验收。');
    }
    if (item.section.includes('极限与压力') && /所有|全部|完整|六件事|年度|过去一年|预测|估值/.test(question)) {
      return decision(item, semantic, 'ask_scope_limit', 'partial', 'partial', '超出单门店、最多两个视图、730 天和 100 行的受控查询边界。');
    }
    return decision(item, semantic, 'brain_content_or_advice', 'partial', 'partial', '属于跨场景分析、方案或经营建议，更适合 Ami Brain，不是单次事实查询。');
  }

  if (item.sourceRole.includes('美容师') && /^(?:我|帮我看一下我)|我的|我今天|我这周|我这个月|我昨天|我上个月/.test(question)) {
    return decision(item, semantic, 'clarification_required', 'supported', 'supported', '当前 Ask 查询上下文未携带登录账号对应的员工 ID，需要先明确美容师姓名。');
  }

  if (/(手机号|手机尾号|联系电话|联系方式|皮肤|过敏|仪器参数|特别备注|标签和备注|家庭住址|情绪状态)/.test(question)) {
    return decision(item, semantic, 'ask_sensitive_boundary', 'partial', 'supported', '涉及 Ask 不开放的个人敏感、健康或内部备注字段。');
  }

  if (/(消防|洗手间|停车|营业时间|税务|发票|开具.*收据|估值|员工报销|应收账款|挂账|分期付款|现金流|工资|迟到|早退|转正|试用期|离职|培训记录|床位|质检|供应商联系方式|供应商.*资质|供应商.*退换货|供应商.*优惠活动|物流很慢|涨价通知|新的更好的供应商|国内供应商|供应商.*纠纷|供应商.*新品|仪器.*问题|员工.*抢客|员工.*挖走|员工.*带走客户|私自收款|未授权.*优惠|超权限.*折扣)/.test(question)) {
    return decision(item, semantic, 'admin_backend_unsupported', 'unsupported', 'unsupported', '当前管理端和后台没有形成可供 Ami Ask 查询的结构化事实闭环。');
  }

  if (/(这个客人|这位客人|她\b|她的|某个客人|某笔|这笔|某个日期|某个美容师|某个供应商|某个项目|这个项目|这次护理|一个疗程|这张采购单|这批|上次那个|下午那个|那个预约|这个产品)/.test(question) && !/[“"'][^”"']+[”"']|叫[\u4e00-\u9fa5]{2,4}|张雯|张文|李梅|王芳|张美丽|赵美容师/.test(question)) {
    return decision(item, semantic, 'clarification_required', 'supported', 'supported', '缺少可唯一定位的客户、项目、商品、预约或交易对象。');
  }

  if (/(?:大额|正常范围|规定范围|高价值)(?!客户)|安全库存线.*不合理/.test(question)) {
    return decision(item, semantic, 'clarification_required', 'supported', 'supported', '问题使用了未治理的金额、折扣或判断阈值，需要先确认具体口径。');
  }

  if (/(帮我设置|帮我记录|帮我打开|帮我提醒|帮我建|帮我创建|自动发|自动送|自动给|自动推荐|自动收集|自动触发|发给|推送|帮我核销|客人要核销|充值|客人要结账|申请退款|要退款|退卡|改期|调整排班|记录入库|开具|打开收银|打开核销|临时加项目|改变服务内容|自动提醒.*规则|自动.*流程)/.test(question)) {
    return decision(item, semantic, 'ask_readonly_boundary', 'supported', 'supported', '管理端或后台可能支持该业务操作，但 Ami Ask 第一阶段严格只读，不执行写操作。');
  }

  if (/(策划|想个|做什么活动|有什么活动|帮我做一个.*活动|活动主题|文案|话术|脚本|欢迎词|邀请|祝福|写一条|写个|写一段|写一份|消息模板|怎么处理|怎么回应|怎么操作|如何|应该|适合推|适合搭配|推荐什么|给多少.*(?:合理|合适)|折扣力度|怎么设计|制定.*方案|生成.*计划|生成.*清单|补货建议|采购建议|护理建议|跟进消息|分析一下为什么|分析.*原因|问题出在哪|原因是什么|原因主要|为什么|有没有办法|怎么平衡|怎么提升|怎么安排|是否划算|划算吗|更划算|合适吗|要不要|该不该|能不能完成|应该联系|需要注意什么风险|紧急事项|情况.*总结|完整.*报告|健康检查|财务漏洞|风险点|目标完成|还差多远|目标是多少|正常吗|下次采购要买什么|储值赠送方案|还能安排吗|撑住吗)/.test(question)) {
    return decision(item, semantic, 'brain_content_or_advice', 'partial', 'partial', '问题要求方案、内容生成、因果诊断或建议，不是只读 SQL 能独立证明的事实。');
  }

  if (/(升级会员|会员折扣|折扣权限|审批流程|通知到位|需要特别准备|在店|正在忙|现在在忙|大概还要多久|下一个预约是谁|今天第一个|今天最后一个|等待时间|空余.*床|产品表示感兴趣|推荐过新客户|生日|来源渠道|固定习惯|护理历史|操作步骤|疗程做到哪一步|技术培训|请假了几次|优惠券.*未核销|充值套餐|新客老客|复购率|回头率|升单|渠道质量|手续费|预算|目标|授权|实时.*状态|设备.*问题|耗材还够用多久|供应商.*报价|最低采购量|账期|产品.*毛利率|产品销售.*毛利|活动.*持续复购|会员体系|优惠.*滥用|折扣.*减少.*收入|免单|赠送.*金额|退款审批|退款申请.*处理时间|财务简报|压力有多大|优惠券平均核销周期|预约超过两小时没有确认|超时服务影响|(?:员工|美容师).*耗材使用效率|产品.*消耗.*没有采购|库存损耗率|退款.*储值余额|退款影响.*提成|开了次卡.*从来不来消费|会员权益.*满意|沉睡客户.*唤醒.*迹象|消费频率.*下降|新客.*转化了多少|自动化规则.*效果|已经过期.*还在用|积压.*产品|员工.*这周业绩)/.test(question)) {
    return decision(item, semantic, 'admin_supported_ask_not_open', 'supported', 'supported', '管理端或后台已有相关业务入口，但当前 34 个 Ask 视图未开放该字段或实时状态。');
  }

  if (/(今年所有数据|所有客户的消费明细|所有员工过去一年|完整的年度|同时做六件事|店里所有的问题)/.test(question)) {
    return decision(item, semantic, 'ask_scope_limit', 'partial', 'partial', '请求范围超过 Ask 的时间、行数或最多两个视图限制。');
  }

  if (semantic.expectedView && parsed.semanticIntent.confidence >= 0.75) {
    return decision(item, semantic, 'ask_query_supported', 'supported', 'supported', '命中已治理指标和 34 视图，可进入真实 SQL 链路评测。');
  }

  if (semantic.expectedView) {
    return decision(item, semantic, 'ask_query_low_confidence', 'partial', 'supported', '属于经营数据查询，但需要低置信度语义模型选择候选或补足指标。');
  }

  if (isGeneralDataQuestion(question)) {
    return decision(item, semantic, 'admin_supported_ask_not_open', 'supported', 'supported', '管理端或后台有相关业务数据，但当前 34 个 Ask 视图缺少可直接回答该问题的治理字段或组合口径。');
  }

  return decision(item, semantic, 'admin_supported_ask_not_open', 'partial', 'unknown', '当前问题未命中 Ask 指标合同，需由具体业务模块或 Ami Brain 承接。');
}

function isGeneralDataQuestion(question: string) {
  return /(多少|几个|哪些|有没有|情况|趋势|对比|最高|最低|最忙|空档|汇总|记录|明细|比例|占比|金额|收入|成本|利润|库存|预约|客户|员工|活动|供应商)/.test(question);
}

function inferExpectedView(question: string) {
  const rules: Array<[RegExp, string]> = [
    [/(?:储值卡|次卡|会员).*(?:负债|履约负债|合同负债|赠送义务|未消耗余额.*负债)/, 'ask_data_member_liability_view'],
    [/(?:对账|对不上|不一致|收款和系统记录|漏收|多收|财务异常|异常流水|重复收费|双计费)/, 'ask_data_reconciliation_issue_view'],
    [/(?:排班|产能|工时|工作饱和度|接待能力|超排|各美容师.*空档)/, 'ask_data_staff_capacity_view'],
    [/(?:各美容师.*服务次数|美容师.*服务了几个客人)/, 'ask_data_staff_performance_view'],
    [/(?:营业额|订单收入|订单金额|客单价|最大的一笔消费|收入趋势|收入差多少)/, 'agent_v3_order_summary_view'],
    [/(?:产品|商品).*(?:销量|销售额|卖得最好|订单)/, 'agent_v3_order_item_sales_view'],
    [/(?:项目).*(?:销量|销售额|收入|做得最多|最受欢迎|服务次数)/, 'agent_v3_project_service_sales_view'],
    [/(?:支付方式|现金.*微信|微信.*支付宝|刷卡消费|收款明细|实收流水|退款.*(?:几笔|金额|记录)|大额.*退款)/, 'agent_v3_payment_refund_view'],
    [/(?:日结|每日收入|日收入汇总|收款和系统记录|漏收|多收)/, 'agent_v3_daily_settlement_view'],
    [/(?:库存|仓库|缺货|安全库存|快没|剩最后|效期|快过期|已经过期|积压).*(?:多少|情况|产品|货|金额|紧急|哪些|最贵|补水|防晒)|现在哪些东西快没了/, 'agent_v3_product_inventory_view'],
    [/(?:库存|耗材|产品).*(?:消耗|进出库|出入库|流水|用了多少)|今天进出库/, 'agent_v3_stock_movement_view'],
    [/(?:报废|报损|损耗).*(?:产品|数量|金额|货值|率)|因为过期而损耗/, 'agent_v3_inventory_scrap_view'],
    [/(?:会员等级|VIP 客户|客户档案|最近到店|累计消费)/i, 'ask_data_customer_profile_summary_view'],
    [/(?:员工|美容师).*(?:人数|在职|档案|级别)/, 'agent_v3_staff_profile_view'],
    [/(?:员工业绩|员工绩效|业绩排行|员工提成|我的提成|本月员工总提成|工作饱和度|我的业绩|服务了多少客人)/, 'ask_data_staff_performance_view'],
    [/(?:预约).*(?:多少|几个|列表|情况|安排|趋势|取消|爽约|密度|最忙|确认|还没来|没到|几点)|今天.*客人.*分别几点/, 'agent_v3_reservation_view'],
    [/(?:活动|新客|线索).*(?:转化率|转化了多少|带来多少收入)/, 'agent_v3_marketing_conversion_view'],
    [/(?:次卡|卡项).*(?:剩余|余量|到期|过期|资产|从来不来|还有很多)/, 'agent_v3_card_asset_view'],
    [/(?:次卡|卡项).*(?:核销|使用|消耗)|核销.*次卡/, 'agent_v3_card_usage_view'],
    [/(?:客户|会员|储值卡).*(?:余额|储值余额|未消耗余额)|储值余额/, 'agent_v3_customer_balance_view'],
    [/(?:服务质量|服务完成|未完成服务|超时服务|服务状态)/, 'agent_v3_service_quality_view'],
    [/(?:空档|空闲时段|可用容量|哪里有空位|哪天还有空)/, 'agent_v3_appointment_gap_view'],
    [/(?:项目).*(?:价格|时长|类型|目录|疗程|护理周期)|最新的护理项目/, 'agent_v3_project_catalog_view'],
    [/(?:营销活动|活动).*(?:参与人数|发布状态|活动状态|列表)/, 'agent_v3_marketing_activity_view'],
    [/(?:自动化规则|营销自动化|自动触达|触达任务).*(?:运行|效果|状态|完成|执行)/, 'agent_v3_marketing_automation_view'],
    [/(?:优惠活动|优惠券|折扣幅度|折扣活动).*(?:核销|范围|规定|最近|多少|平均)/, 'agent_v3_promotion_offer_view'],
    [/(?:经营成本|运营成本|房租水电|固定成本|变动成本|成本结构|各项成本|成本增长)/, 'ask_data_operating_cost_view'],
    [/(?:采购了什么|采购记录|采购单|采购金额|采购了多少钱|历史采购|采购总额|供应商.*交易记录)/, 'agent_v3_purchase_procurement_view'],
    [/(?:供应商).*(?:采购金额|交易记录|交货.*稳定|交付|合作最多|表现)/, 'agent_v3_supplier_performance_view'],
    [/(?:毛利率|经营利润|净利润|实际利润|月结利润)/, 'ask_data_confirmed_profit_view'],
    [/(?:调拨|调入|调出)/, 'ask_data_transfer_status_view'],
    [/(?:耗材|BOM|理论耗材|标准耗材).*(?:偏差|标准|异常|用料|效率)/i, 'ask_data_bom_consumption_variance_view'],
    [/(?:投诉|满意度|差评|负面反馈|客户反馈|不满意)/, 'ask_data_customer_feedback_view'],
    [/(?:流失风险|高价值.*不活跃|生命周期|沉睡客户|很久没来|消费频率.*下降|客户分层)/, 'ask_data_customer_lifecycle_view'],
    [/(?:营销投入回报|营销 ROI|投入产出|渠道.*ROI|营销成本.*收入|营销投产)/i, 'ask_data_marketing_roi_view'],
  ];
  return rules.find(([pattern]) => pattern.test(question))?.[1];
}

function viewLabel(viewName: string) {
  const labels: Record<string, string> = {
    agent_v3_order_summary_view: '订单摘要', agent_v3_order_item_sales_view: '商品销售', agent_v3_project_service_sales_view: '项目服务销售',
    agent_v3_payment_refund_view: '支付与退款', agent_v3_daily_settlement_view: '日结', agent_v3_product_inventory_view: '商品库存',
    agent_v3_stock_movement_view: '库存流水', agent_v3_inventory_scrap_view: '库存报废', ask_data_customer_profile_summary_view: '客户档案摘要',
    agent_v3_staff_profile_view: '员工档案', ask_data_staff_performance_view: '员工绩效', agent_v3_reservation_view: '预约',
    agent_v3_marketing_conversion_view: '营销转化', agent_v3_card_asset_view: '次卡资产', agent_v3_card_usage_view: '次卡核销',
    agent_v3_customer_balance_view: '客户余额', agent_v3_service_quality_view: '服务质量', agent_v3_appointment_gap_view: '预约空档',
    agent_v3_project_catalog_view: '项目目录', agent_v3_marketing_activity_view: '营销活动', agent_v3_marketing_automation_view: '自动触达',
    agent_v3_promotion_offer_view: '优惠活动', ask_data_operating_cost_view: '经营成本', agent_v3_purchase_procurement_view: '采购',
    agent_v3_supplier_performance_view: '供应商表现', ask_data_confirmed_profit_view: '已确认实际利润', ask_data_reconciliation_issue_view: '财务对账异常',
    ask_data_member_liability_view: '会员履约负债', ask_data_staff_capacity_view: '排班与员工产能', ask_data_transfer_status_view: '库存调拨',
    ask_data_bom_consumption_variance_view: 'BOM 实际消耗偏差', ask_data_customer_feedback_view: '客户反馈',
    ask_data_customer_lifecycle_view: '客户生命周期', ask_data_marketing_roi_view: '营销 ROI',
  };
  return labels[viewName] ?? viewName;
}

function decision(
  item: Omit<QuestionItem, 'supportClass' | 'managementSupport' | 'backendSupport' | 'reason' | 'expectedView' | 'expectedViewLabel' | 'semanticMetricKeys' | 'semanticCandidateViews'>,
  semantic: Pick<QuestionItem, 'expectedView' | 'expectedViewLabel' | 'semanticMetricKeys' | 'semanticCandidateViews'>,
  supportClass: SupportClass,
  managementSupport: SupportLevel,
  backendSupport: SupportLevel,
  reason: string,
): QuestionItem {
  return { ...item, ...semantic, supportClass, managementSupport, backendSupport, reason };
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return Object.fromEntries(
    [...items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map<string, number>())].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    ),
  );
}

function argumentValue(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
