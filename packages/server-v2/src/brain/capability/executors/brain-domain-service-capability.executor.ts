import { Injectable, Optional } from '@nestjs/common';
import { BrainTimeRangeParserService, type BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { BrainCustomerFactResolverService } from '../../domain/brain-customer-fact-resolver.service.js';
import { extractSpecificCustomerNameFromMention } from '../../domain/brain-customer-identity.js';
import { defaultBrainDateRange } from '../../domain/brain-domain-formatters.js';
import { MarketingService } from '../../../marketing/marketing.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { BrainDomainAnswer } from '../../domain/brain-domain-adapter.types.js';
import { BrainDataQualityGuardService, type BrainDataQualityAssessment } from '../../inspection/brain-data-quality-guard.service.js';
import type { BrainResponseBlock } from '../../response/brain-response.types.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type {
  BrainCapabilityExecutionInput,
  BrainCapabilityExecutor,
  BrainCapabilityToolArgs,
} from '../brain-capability-executor.registry.js';
import { BrainCapability } from '../brain-capability.decorator.js';
import {
  readCapabilityStructuredComparisonTarget,
  readCapabilityStructuredTime,
  structuredEntityMentions,
  structuredTimeUtcRange,
} from '../brain-capability-structured-args.js';

function specificCustomerMention(
  entity: ReturnType<typeof structuredEntityMentions>[number] | undefined,
): string | undefined {
  if (!entity || entity.source === 'system') return undefined;
  return extractSpecificCustomerNameFromMention(entity.mention);
}

const CAPABILITY_KEYS = [
  'store_operations_overview',
  'manager_staff_overview',
  'front_desk_operations_overview',
  'beautician_service_overview',
  'inventory_operations_overview',
  'finance_risk_overview',
  'marketing_growth_overview',
  'reservation_list',
  'customer_facts',
  'marketing_customer_segment',
  'marketing_message_draft',
  'finance_payment_breakdown',
  'inventory_procurement_advice',
] as const;

interface MarketingPackageRecommendation {
  id: number | string;
  category?: string;
  triggerType?: string;
  reason?: string;
  recommendedItems?: Array<{ type?: string; name?: string }>;
}

interface MarketingPackageAudienceProfile {
  name?: string;
  segment?: string;
  memberLevel?: string;
  totalSpent?: number | string;
  matchReason?: string;
}

interface MarketingPackageAudienceRow {
  [key: string]: unknown;
  customerName: string;
  memberLevel: string;
  totalSpent: number;
  matchReason: string;
}

@Injectable()
export class BrainDomainServiceCapabilityExecutor implements BrainCapabilityExecutor {
  readonly kind = 'domain' as const;
  readonly capabilityKeys = CAPABILITY_KEYS;

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly customerFacts: BrainCustomerFactResolverService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
    @Optional() private readonly dataQuality?: BrainDataQualityGuardService,
    @Optional() private readonly marketing?: MarketingService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  @BrainCapability({
    key: 'store_operations_overview',
    name: '店长经营概览',
    description: '组合实收、订单、客户、客单价、经营目标、预约到店、当前在店、支付拆分、项目与美容师排行、员工忙闲、趋势和周期对比，返回可追溯的门店经营概览。跨周期逐日差距问题未指定指标时，按已发布实收指标 metric.paid_amount 比较并披露口径。退款和优惠的精确问数由财务经营风险能力处理。',
    intents: ['query', 'ranking', 'comparison', 'trend', 'diagnosis'],
    examples: [
      '今天店里情况怎么样，给我来个总结',
      '今天来了几个客人，现在还有几个在店',
      '今天新客老客各来了几个',
      '本月经营情况有哪些风险需要马上处理',
      '今天和昨天比营业额差多少',
      '本周跟上周比，哪天差距最大',
      '这个月目标完成率多少了，还差多远',
      '今天客单价多少，跟平时比怎么样',
      '现在店里哪些美容师在忙，哪些空着',
      '今天有没有什么异常情况我需要知道',
      '今天最大的一笔消费是多少',
      '这周有没有哪天特别差，为什么',
    ],
    negativeExamples: ['帮我直接修改本月经营目标', '查询其他门店的经营数据'],
    synonyms: ['经营概览', '经营总结', '店里情况', '门店经营诊断', '经营对比', '目标完成率', '客单价', '美容师忙闲', '新客老客到店'],
    businessDefinitionKeys: [
      'metric.paid_amount',
      'metric.project_service_count',
      'metric.staff_performance_score',
      'entity.beautician',
      'entity.customer',
      'entity.reservation',
      'dimension.paymentMethod',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:dashboard:view', 'core:store:reservations', 'core:finance:view'],
    allowedRoles: ['store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  storeOperationsOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('store_operations_overview', args, input);
  }

  @BrainCapability({
    key: 'manager_staff_overview',
    name: '店长员工运营分析',
    description: '按当前门店和时间范围分析美容师服务次数、独立客户数、客户复购率、业绩、提成、请假时长、排班忙闲和可用空档，支持按用户明确指定的员工指标排行、对比和工作饱和度诊断。客户投诉、差评、满意度和试用期评估没有后台事实闭环时必须明确拒答，不得用通用员工排行替代。',
    intents: ['query', 'ranking', 'comparison', 'diagnosis'],
    examples: [
      '哪个美容师接的客人最多',
      '各美容师今天的排班情况，有没有空档',
      '帮我看一下各美容师的服务次数对比',
      '帮我看一下员工这周的工作饱和度',
      '谁的客户复购率最高',
      '这个月提成最高的是谁，大概多少',
      '今天谁请假了，有没有影响接待',
      '最近有没有客户投诉或者表达不满',
      '帮我看一下客户满意度整体情况',
      '新员工试用期表现怎么样',
    ],
    negativeExamples: ['查看其他门店员工数据', '直接修改员工排班或提成', '哪个美容师的客诉最多'],
    synonyms: ['员工运营分析', '美容师服务排行', '美容师接客排行', '员工服务次数对比', '员工客户复购率排行', '员工提成排行', '员工排班空档', '员工工作饱和度'],
    businessDefinitionKeys: [
      'metric.staff_service_count',
      'metric.staff_unique_customer_count',
      'metric.staff_customer_repurchase_rate',
      'metric.staff_commission_amount',
      'metric.staff_performance_score',
      'entity.beautician',
      'entity.customer',
      'entity.reservation',
      'dimension.beauticianName',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:beautician-performance:view', 'core:store:reservations'],
    allowedRoles: ['store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  managerStaffOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('manager_staff_overview', args, input);
  }

  @BrainCapability({
    key: 'front_desk_operations_overview',
    name: '前台现场运营概览',
    description: '组合预约到店、待到店客户、到店率、爽约率、员工忙闲、服务超时和受影响预约，返回前台可执行的现场运营概览。',
    intents: ['query', 'diagnosis'],
    examples: ['今天前台现场情况怎么样', '明天下午有哪些预约，员工忙不忙', '有哪些服务超时会影响后面的客户', '这周预约爽约率高不高'],
    negativeExamples: ['直接替我修改客户预约', '查询其他门店的预约情况'],
    synonyms: ['前台概览', '现场运营', '预约到店情况', '预约爽约率', '到店率', '员工忙闲', '服务超时'],
    businessDefinitionKeys: ['entity.reservation'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations'],
    allowedRoles: ['receptionist', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  frontDeskOperationsOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('front_desk_operations_overview', args, input);
  }

  @BrainCapability({
    key: 'beautician_service_overview',
    name: '美容师个人服务概览',
    description: '基于当前登录美容师身份，组合服务安排、客户注意事项、个人服务完成情况、业绩、提成和项目排行。',
    intents: ['query', 'diagnosis', 'recommendation'],
    examples: ['我今天有哪些客户要服务', '本月我的服务和业绩怎么样', '下一位客户有哪些注意事项'],
    negativeExamples: ['查看其他美容师的客户过敏史', '直接替我修改客户护理记录'],
    synonyms: ['我的服务安排', '美容师工作台', '我的业绩', '下一位客户', '服务注意事项'],
    businessDefinitionKeys: ['entity.reservation', 'metric.staff_performance_score'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations', 'core:beautician-performance:view'],
    allowedRoles: ['beautician'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  beauticianServiceOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('beautician_service_overview', args, input);
  }

  @BrainCapability({
    key: 'inventory_operations_overview',
    name: '库存采购运营概览',
    description: '组合库存金额、低库存、临期批次、库存消耗、采购建议、供应商和最近采购单，返回只读库存运营诊断。',
    intents: ['query', 'ranking', 'diagnosis', 'recommendation'],
    examples: ['本月库存有什么风险', '现在哪些产品库存不够了', '哪些产品该补货了', '临期和低库存商品怎么处理', '有没有快过期的产品，数量多少'],
    negativeExamples: ['直接创建采购单', '修改商品当前库存'],
    synonyms: ['库存概览', '库存风险', '采购建议', '低库存', '临期库存', '快过期产品'],
    businessDefinitionKeys: ['entity.product', 'metric.stock_risk_score'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:inventory:stock'],
    allowedRoles: ['inventory', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  inventoryOperationsOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('inventory_operations_overview', args, input);
  }

  @BrainCapability({
    key: 'finance_risk_overview',
    name: '财务经营风险概览',
    description: '组合实收、支付方式、收入趋势、退款、优惠、成本、毛利和会员卡负债，返回可追溯的财务经营风险概览。',
    intents: ['query', 'diagnosis'],
    examples: [
      '本月财务情况和风险怎么样',
      '今天退款有几笔，金额多少',
      '今天折扣优惠送出去多少钱',
      '收入成本退款有哪些异常',
      '给我看支付方式和毛利情况',
      '有没有大额异常退款我不知道的',
      '最近毛利掉下来的主要原因是什么',
      '查一下毛利异常是折扣、成本还是项目结构造成的',
    ],
    negativeExamples: ['直接修改结算数据', '查看其他门店的财务数据'],
    synonyms: ['财务概览', '财务风险', '收入成本分析', '退款优惠风险', '大额异常退款', '会员卡负债', '毛利下降', '利润率变差', '盈利能力下降', '不赚钱', '毛利根因', '项目结构影响'],
    businessDefinitionKeys: [
      'metric.paid_amount',
      'metric.refund_amount',
      'metric.refund_count',
      'metric.discount_amount',
      'metric.operating_cost_amount',
      'dimension.paymentMethod',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    allowedRoles: ['finance', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  financeRiskOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('finance_risk_overview', args, input);
  }

  @BrainCapability({
    key: 'marketing_growth_overview',
    name: '营销增长运营概览',
    description: '组合客户分层、跟进优先级、渠道触达、转化、归因收入和自动化策略；对高端护理、套餐或项目推广问题，复用营销推荐事实与门店真实项目生成客户适配名单。',
    intents: ['query', 'ranking', 'diagnosis', 'recommendation'],
    examples: ['本月营销增长情况怎么样', '哪些客户最值得优先跟进，渠道转化如何', '活动触达和归因收入有哪些问题', '我想做个高端护理套餐推广，找哪些客户合适'],
    negativeExamples: ['直接给所有客户群发消息', '直接发布营销自动化规则'],
    synonyms: ['营销增长概览', '客户跟进优先级', '渠道转化', '活动归因', '营销复盘', '套餐推广客群', '项目适配客户'],
    businessDefinitionKeys: [
      'entity.customer',
      'entity.project',
      'metric.follow_up_priority_score',
      'dimension.customerName',
      'dimension.projectName',
      'dimension.marketingChannel',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:analytics', 'core:customer:view'],
    allowedRoles: ['marketing', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  marketingGrowthOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('marketing_growth_overview', args, input);
  }

  @BrainCapability({
    key: 'reservation_list',
    businessDefinitionKeys: ['entity.reservation'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations'],
    allowedRoles: ['receptionist', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  reservationList(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('reservation_list', args, input);
  }

  @BrainCapability({
    key: 'customer_facts',
    name: '客户事实与客群查询',
    description: '查询当前门店的精确客户事实、VIP、新老客、周期新客转化、到店年龄画像、沉睡客户、生日关怀、重要客户到店、营销活动响应、办卡未预约、低余次卡、开卡未核销、高价值低活跃客户、客户复购率、平均回访间隔，以及消费频率或消费金额明显下降的客户名单。定性客群使用已治理默认口径执行并在答案中披露，不要求用户选择内部阈值。',
    intents: ['query', 'ranking', 'diagnosis'],
    examples: [
      '最近哪些老客好久没来了，帮我列一下',
      '帮我找一下45天没来的客户，大概有多少人',
      '帮我找一下三个月没来消费的客户',
      '我们店里的 VIP 客户有多少个',
      '哪些客户卡里的次数快用完了还没约',
      '哪些客户是高价值但最近不太活跃的',
      '哪些客户最近消费频率明显下降',
      '哪些客户最近消费明显减少',
      '哪些客户消费了钱但很少用次卡',
      '我们有多少客户开了次卡但从来不来消费',
      '我们的老客回头率大概是多少',
      '老客户平均多久回来一次',
      '有没有哪些客户快到生日了可以做关怀',
      '今天有没有重要客户来店，需要特别关注的',
      '帮我找一下对我们上次活动有响应的客户',
      '帮我找一下办了卡但还没预约的新客',
      '这个月新客主要来自什么渠道',
      '上个月新来了多少新客，转化了多少',
      '帮我看一下今天到店客人的画像，主要是什么年龄段',
      '帮我查一下张女士的客户资料',
    ],
    negativeExamples: ['查询其他门店的客户名单', '直接修改客户会员等级'],
    synonyms: ['客户事实', '客户名单', '沉睡客户', '未到店客户', '长期未消费客户', 'VIP 客户', '生日关怀客户', '重要到店客户', '活动响应客户', '办卡未预约客户', '低余次卡客户', '次卡低使用客户', '开卡未核销客户', '老客回头率', '平均回访间隔', '高价值低活跃客户', '消费频率下降客户', '消费金额下降客户', '新客来源渠道', '新客转化', '到店年龄画像'],
    businessDefinitionKeys: [
      'entity.customer',
      'dimension.customerName',
      'dimension.customerSource',
      'dimension.customerAgeGroup',
      'metric.new_customer_count',
      'metric.new_customer_conversion_count',
      'metric.new_customer_conversion_rate',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:customer:view'],
    allowedRoles: ['store_manager', 'receptionist', 'marketing', 'beautician', 'finance', 'customer_service'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  customerFactsLookup(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('customer_facts', args, input);
  }

  @BrainCapability({
    key: 'marketing_customer_segment',
    name: '营销客户分群摘要',
    description: '基于当前门店客户事实，汇总 VIP、新客、老客和沉睡客户等营销分群，只返回客群规模与数据边界。',
    intents: ['query', 'diagnosis'],
    examples: ['本月客户可以分成哪些营销人群', 'VIP 和沉睡客户分别有多少人'],
    negativeExamples: ['直接给沉睡客户群发消息', '查看其他门店的客户分群'],
    synonyms: ['客户分群', '营销客群', 'VIP客户分层', '沉睡客户分层'],
    businessDefinitionKeys: ['entity.customer'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:analytics'],
    allowedRoles: ['marketing', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  marketingCustomerSegment(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('marketing_customer_segment', args, input);
  }

  @BrainCapability({
    key: 'marketing_message_draft',
    name: '营销邀约与召回文案草稿',
    description: '根据用户明确表达的预约提醒、空档邀约、老客召回或到店邀请目标生成可编辑文案草稿。该能力不查询客户名单、不自动发送，也不要求用户先指定具体收件人。',
    intents: ['draft'],
    examples: ['生成一条温和的预约提醒', '拟一段老客召回话术', '写一条空档邀约短信', '准备一段不过度推销的到店邀请'],
    negativeExamples: ['直接给全部客户群发消息', '替我创建并执行营销触达任务', '查询沉睡客户名单'],
    synonyms: ['预约提醒文案', '空档邀约话术', '老客召回文案', '到店邀请短信', '营销消息草稿'],
    businessDefinitionKeys: ['entity.customer', 'entity.reservation'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:create'],
    allowedRoles: ['marketing', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  marketingMessageDraft(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('marketing_message_draft', args, input);
  }

  @BrainCapability({
    key: 'finance_payment_breakdown',
    name: '实收与储值流水拆分',
    description: '按当前门店和时间范围汇总实收金额并按支付方式拆分；对明确的储值卡问题，分别统计储值充值和储值消耗流水，不用支付方式或会员卡负债代替。',
    intents: ['query', 'ranking', 'comparison', 'trend'],
    examples: [
      '本月实收按支付方式怎么分',
      '今天实收按支付方式怎么分',
      '最近三十天每天收入走势',
      '这个月比上个月少收了多少',
      '收入环比是涨了还是跌了，差额多少',
      '今天储值卡消耗了多少，新充值了多少',
    ],
    negativeExamples: ['直接修改支付记录', '查询其他门店的支付明细'],
    synonyms: ['支付方式拆分', '收款渠道', '实收构成', '收入趋势', '实收走势', '收入环比', '实收对比', '收款增减', '微信现金占比', '储值卡充值', '储值卡消耗', '储值流水'],
    businessDefinitionKeys: ['metric.paid_amount', 'dimension.paymentMethod'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    allowedRoles: ['finance', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  financePaymentBreakdown(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('finance_payment_breakdown', args, input);
  }

  @BrainCapability({
    key: 'inventory_procurement_advice',
    name: '库存采购建议',
    description: '基于当前库存、安全库存、最小采购量、供应映射和有效报价生成只读采购建议；数据质量不足时返回限制，不创建采购单。',
    intents: ['query', 'recommendation'],
    examples: ['哪些商品需要补货，建议采购多少', '给我一份当前库存采购建议'],
    negativeExamples: ['直接创建并提交采购单', '修改商品安全库存'],
    synonyms: ['采购建议', '补货建议', '采购清单', '库存补货'],
    businessDefinitionKeys: ['entity.product', 'metric.stock_risk_score'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:inventory:stock'],
    allowedRoles: ['inventory', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  inventoryProcurementAdvice(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('inventory_procurement_advice', args, input);
  }

  async execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    this.assertStructuredArgsSupported(input);
    const range = this.resolveRange(input);
    const dataQuality = await this.dataQuality?.assess({
      storeId: input.context.storeId,
      capabilityKey: input.card.key,
    });

    switch (input.card.key) {
      case 'store_operations_overview': {
        const comparisonRange = this.resolveComparisonRange(input, range);
        const [operations, reception, finance, comparisonOperations, comparisonReception, comparisonFinance] = await Promise.all([
          this.skillRuntime.buildManagerOperationsAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          this.skillRuntime.buildReceptionOperationsSnapshot({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          this.skillRuntime.buildFinanceRiskSummary({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          comparisonRange
            ? this.skillRuntime.buildManagerOperationsAnalysis({
                storeId: input.context.storeId,
                startDate: comparisonRange.previous.startDate,
                endDate: comparisonRange.previous.endDate,
              })
            : Promise.resolve(undefined),
          comparisonRange
            ? this.skillRuntime.buildReceptionOperationsSnapshot({
                storeId: input.context.storeId,
                startDate: comparisonRange.previous.startDate,
                endDate: comparisonRange.previous.endDate,
              })
            : Promise.resolve(undefined),
          comparisonRange
            ? this.skillRuntime.buildFinanceRiskSummary({
                storeId: input.context.storeId,
                startDate: comparisonRange.previous.startDate,
                endDate: comparisonRange.previous.endDate,
              })
            : Promise.resolve(undefined),
        ]);
        const risks = [
          ...finance.riskItems.map((detail) => ({ title: '财务风险', detail, severity: 'warning' as const })),
          ...(reception.noShow > 0
            ? [{
                title: '预约爽约',
                detail: `${range.label}有 ${reception.noShow} 个爽约，爽约率 ${(reception.noShowRate * 100).toFixed(1)}%。`,
                severity: 'warning' as const,
              }]
            : []),
        ];
        const citations = [
          { sourceType: 'db_skill', sourceId: 'store_manager_operations_analysis', label: '经营收入、客户、项目与员工分析' },
          { sourceType: 'db_skill', sourceId: 'reception_operations_snapshot', label: '预约到店与员工忙闲快照' },
          { sourceType: 'db_skill', sourceId: 'finance_risk_summary', label: '退款、优惠与毛利风险' },
        ];
        const citationIds = citations.map((item) => item.sourceId);
        if (/(?:最大|最高).*(?:一笔|单笔).*(?:消费|订单)|(?:消费|订单).*(?:最大|最高).*(?:一笔|单笔)/.test(input.question)) {
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: operations.largestOrder
              ? `${range.label}最大一笔消费为 ${operations.largestOrder.amount.toFixed(2)} 元，订单号 ${operations.largestOrder.orderNo}${operations.largestOrder.customerName ? `，客户 ${operations.largestOrder.customerName}` : ''}。`
              : `${range.label}没有已完成消费记录，无法形成最大单笔消费。`,
            citations: [citations[0]!],
            grounding: 'db_skill',
            blocks: operations.largestOrder
              ? [{
                  kind: 'kpi',
                  items: [{
                    label: '最大单笔消费',
                    value: `${operations.largestOrder.amount.toFixed(2)} 元`,
                    hint: operations.largestOrder.orderNo,
                  }],
                  citationIds: [citations[0]!.sourceId],
                }]
              : [{ kind: 'limitations', items: [`${range.label}没有已完成消费记录`] }],
            metadata: {
              capabilityKey: 'store_operations_overview',
              rangeLabel: range.label,
              answerScope: 'largest_completed_order',
            },
          }, dataQuality);
        }
        const targetItems = this.buildTargetKpis(operations, reception.total);
        const comparisonItems = comparisonRange && comparisonOperations && comparisonReception && comparisonFinance
          ? this.buildOperationsComparisonItems({
              operations,
              reception,
              finance,
              previousOperations: comparisonOperations,
              previousReception: comparisonReception,
              previousFinance: comparisonFinance,
            })
          : [];
        const dailyComparisonRows = comparisonRange && comparisonOperations
          ? this.buildDailyComparisonRows(
              operations.dailyTrend,
              comparisonOperations.dailyTrend,
              comparisonRange.current,
              comparisonRange.previous,
            )
          : [];
        if (comparisonRange && /哪天.*差距最大|差距最大.*哪天/.test(input.question)) {
          const largestGap = dailyComparisonRows[0];
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: largestGap
              ? `${comparisonRange.label}，按实收金额比较，差距最大的是${largestGap.day}：${largestGap.currentDate || comparisonRange.current.label}实收 ${largestGap.currentRevenue.toFixed(2)} 元，${largestGap.previousDate || comparisonRange.previous.label}实收 ${largestGap.previousRevenue.toFixed(2)} 元，差额 ${largestGap.delta}。`
              : `${comparisonRange.label}缺少逐日实收数据，无法判断哪天差距最大。`,
            citations: [citations[0]!],
            grounding: 'db_skill',
            blocks: dailyComparisonRows.length
              ? [{
                  kind: 'ranking',
                  rows: dailyComparisonRows,
                  columns: ['day', 'currentDate', 'currentRevenue', 'previousDate', 'previousRevenue', 'delta'],
                  citationIds: [citations[0]!.sourceId],
                }, {
                  kind: 'limitations',
                  items: ['问题未指定比较指标，本次按统一已发布实收指标 metric.paid_amount 进行逐日比较。'],
                }]
              : [{ kind: 'limitations', items: [`${comparisonRange.label}缺少逐日实收数据`] }],
            metadata: {
              capabilityKey: 'store_operations_overview',
              answerScope: 'largest_daily_paid_amount_gap',
              metricDefinitionKey: 'metric.paid_amount',
              comparisonRange: {
                current: comparisonRange.current.label,
                previous: comparisonRange.previous.label,
              },
              completionCriteria: ['comparison_loaded', 'daily_paid_amount_gap_ranked'],
            },
          }, dataQuality);
        }
        if (/(?:哪天.*(?:特别差|最差)|(?:特别差|最差).*哪天)/.test(input.question)) {
          const dailyTrend = operations.dailyTrend
            .filter((item) => Number.isFinite(item.revenue))
            .sort((left, right) => left.revenue - right.revenue || left.date.localeCompare(right.date));
          const averageRevenue = dailyTrend.length
            ? dailyTrend.reduce((sum, item) => sum + item.revenue, 0) / dailyTrend.length
            : 0;
          const lowest = dailyTrend[0];
          const lowestRows = lowest
            ? dailyTrend.filter((item) => item.revenue === lowest.revenue)
            : [];
          const dayLabel = lowestRows.map((item) => item.date).join('、');
          const reasonLimitation = '当前经营事实只能定位逐日实收结果，缺少逐日订单取消、客户流失、排班缺口和营销触达的统一归因数据，不能直接断言原因。';
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: lowest
              ? `${range.label}按实收最低判断，表现最差的是 ${dayLabel}，实收 ${lowest.revenue.toFixed(2)} 元；期间日均实收 ${averageRevenue.toFixed(2)} 元。${reasonLimitation}`
              : `${range.label}缺少逐日实收数据，无法定位表现最差的日期。${reasonLimitation}`,
            citations: [citations[0]!],
            grounding: 'db_skill',
            blocks: [
              ...(lowest
                ? [{
                    kind: 'ranking' as const,
                    rows: dailyTrend.map((item) => ({ date: item.date, revenue: item.revenue })),
                    columns: ['date', 'revenue'],
                    citationIds: [citations[0]!.sourceId],
                  }]
                : []),
              { kind: 'limitations' as const, items: [reasonLimitation] },
            ],
            metadata: {
              capabilityKey: 'store_operations_overview',
              answerScope: 'lowest_daily_paid_amount_with_reason_gap',
              metricDefinitionKey: 'metric.paid_amount',
              rangeLabel: range.label,
              completionCriteria: ['daily_paid_amount_loaded', 'lowest_day_identified', 'attribution_gap_disclosed'],
            },
          }, dataQuality);
        }
        return this.applyDataQualityGuard({
          status: 'completed',
          answer: `${range.label}经营概览已完成，包含实收、订单、预约到店、在店、退款、项目排行、员工状态和风险。`,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '实收', value: `${operations.revenue.toFixed(2)} 元` },
                { label: '订单', value: `${operations.orderCount} 单` },
                { label: '客户', value: `${operations.customerCount} 人` },
                { label: '客单价', value: `${operations.avgTransaction.toFixed(2)} 元` },
                { label: '预约', value: `${reception.total} 个` },
                { label: '已到店', value: `${reception.checkedIn} 人` },
                { label: '当前在店', value: `${operations.inStoreCount} 人` },
                { label: '新客', value: `${operations.newCustomerCount} 人`, hint: `老客 ${operations.returningCustomerCount} 人` },
                { label: '退款', value: `${finance.refundAmount.toFixed(2)} 元`, hint: `${finance.refundCount} 笔` },
                ...(operations.largestOrder
                  ? [{ label: '最大订单', value: `${operations.largestOrder.amount.toFixed(2)} 元`, hint: operations.largestOrder.orderNo }]
                  : []),
              ],
              citationIds,
            },
            ...(targetItems.length
              ? [{ kind: 'kpi' as const, items: targetItems, citationIds: ['store_manager_operations_analysis'] }]
              : [{ kind: 'limitations' as const, items: ['当前时间范围未配置经营目标，无法计算目标完成率和剩余差额'] }]),
            ...(comparisonItems.length
              ? [{ kind: 'comparison' as const, items: comparisonItems, citationIds }]
              : []),
            ...(dailyComparisonRows.length
              ? [{
                  kind: 'ranking' as const,
                  rows: dailyComparisonRows,
                  columns: ['day', 'currentDate', 'currentRevenue', 'previousDate', 'previousRevenue', 'delta'],
                  citationIds: ['store_manager_operations_analysis'],
                }]
              : []),
            ...(operations.paymentBreakdown.length
              ? [{
                  kind: 'ranking' as const,
                  rows: operations.paymentBreakdown.map((item) => ({ paymentMethod: item.method, amount: item.amount })),
                  columns: ['paymentMethod', 'amount'],
                  citationIds: ['store_manager_operations_analysis'],
                }]
              : []),
            ...(operations.projectRanking.length
              ? [{
                  kind: 'ranking' as const,
                  rows: operations.projectRanking.map((item) => ({ project: item.name, serviceCount: item.count })),
                  columns: ['project', 'serviceCount'],
                  citationIds: ['store_manager_operations_analysis'],
                }]
              : []),
            ...(operations.beauticianRanking.length
              ? [{
                  kind: 'ranking' as const,
                  rows: operations.beauticianRanking.map((item) => ({ beautician: item.name, serviceCount: item.count })),
                  columns: ['beautician', 'serviceCount'],
                  citationIds: ['store_manager_operations_analysis'],
                }]
              : []),
            ...(operations.dailyTrend.length
              ? [{
                  kind: 'chart' as const,
                  chartType: 'line' as const,
                  rows: operations.dailyTrend,
                  xKey: 'date',
                  yKeys: ['revenue'],
                  citationIds: ['store_manager_operations_analysis'],
                }]
              : []),
            {
              kind: 'table',
              rows: reception.staff.map((item) => ({
                staff: item.name,
                appointmentCount: item.appointmentCount,
                status: item.onTimeOff ? '请假' : item.inService ? '服务中' : item.available ? '可接待' : '暂不可用',
                nextAvailableAt: item.nextAvailableAt ?? '',
              })),
              columns: ['staff', 'appointmentCount', 'status', 'nextAvailableAt'],
              citationIds: ['reception_operations_snapshot'],
            },
            ...(risks.length
              ? [{ kind: 'diagnosis' as const, findings: risks, citationIds: ['finance_risk_summary', 'reception_operations_snapshot'] }]
              : []),
          ],
          metadata: {
            capabilityKey: 'store_operations_overview',
            rangeLabel: range.label,
            ...(comparisonRange
              ? {
                  comparisonRange: {
                    current: comparisonRange.current.label,
                    previous: comparisonRange.previous.label,
                  },
                }
              : {}),
            componentCapabilities: [
              'store_manager_operations_analysis',
              'reception_operations_snapshot',
              'finance_risk_summary',
            ],
            completionCriteria: [
              'revenue_loaded',
              'reservation_arrival_loaded',
              'staff_state_loaded',
              'refund_risk_loaded',
              ...(comparisonRange ? ['comparison_loaded'] : []),
            ],
          },
        }, dataQuality);
      }
      case 'manager_staff_overview': {
        if (/(投诉|客诉|差评|满意度|负面反馈)/.test(input.question)) {
          const limitation = '当前后台没有客户投诉、差评或满意度事实闭环，无法按美容师统计或排行。Ami Brain 不会用服务量、业绩或综合表现分替代客诉指标。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'manager_staff_overview',
              unsupportedReason: 'staff_complaint_fact_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        if (/(试用期|转正评估|新员工.*表现)/.test(input.question)) {
          const limitation = '当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环，无法评价新员工试用期表现。Ami Brain 不会用服务量、接客数或通用业绩分替代试用期评估。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'manager_staff_overview',
              unsupportedReason: 'staff_probation_fact_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        const [staffAnalysis, reception] = await Promise.all([
          this.skillRuntime.buildManagerStaffAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          this.skillRuntime.buildReceptionOperationsSnapshot({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
        ]);
        const requestedMetricKeys = structuredDefinitionKeys(input.args.metrics);
        const focusMetric = this.resolveManagerStaffFocusMetric(requestedMetricKeys, input.question);
        const focusMetricRef = focusMetric ? structuredDefinitionRef(input.args.metrics, focusMetric) : undefined;
        const citations = [
          ...(focusMetric
            ? [{
                sourceType: 'business_definition',
                sourceId: focusMetricRef ? `${focusMetricRef.definitionKey}@${focusMetricRef.definitionVersion}` : focusMetric,
                label: `业务定义：${this.managerStaffMetricLabel(focusMetric)}`,
              }]
            : []),
          { sourceType: 'db_skill', sourceId: 'manager_staff_analysis', label: '员工服务、客户、业绩与提成分析' },
          { sourceType: 'db_skill', sourceId: 'reception_operations_snapshot', label: '员工排班忙闲与可用空档' },
        ];
        const staffState = new Map(reception.staff.map((item) => [item.name, item]));
        const rows = this.orderManagerStaffRows(staffAnalysis.staff.map((item) => {
          const state = staffState.get(item.name);
          const performanceScore = 100 * (
            Math.min(Math.max(item.serviceCount / 10, 0), 1) * 0.5 +
            Math.min(Math.max(item.revenueAmount / 5000, 0), 1) * 0.3 +
            Math.min(Math.max(item.repeatCustomerCount / 5, 0), 1) * 0.2
          );
          return {
            staff: item.name,
            performanceScore,
            serviceCount: item.serviceCount,
            completedCount: item.completedCount,
            uniqueCustomerCount: item.uniqueCustomerCount,
            repeatCustomerCount: item.repeatCustomerCount,
            customerRepurchaseRate: item.uniqueCustomerCount > 0 ? item.repeatCustomerCount / item.uniqueCustomerCount : 0,
            revenueAmount: item.revenueAmount,
            commissionAmount: item.commissionAmount,
            timeOffHours: item.timeOffHours,
            status: state?.onTimeOff ? '请假' : state?.inService ? '服务中' : state?.available ? '可接待' : '暂不可用',
            nextAvailableAt: state?.nextAvailableAt ?? '',
          };
        }), input.args.orderBy, input.question);
        const visibleRows = rows.slice(0, this.resolveLimit(input.args.limit, 15));
        if (/(?:谁|哪些人)?.*请假.*影响接待|影响接待.*请假/.test(input.question)) {
          const leaveRows = rows.filter((item) => item.status === '请假' || item.timeOffHours > 0);
          const availableRows = rows.filter((item) => item.status === '可接待');
          const leaveLabel = leaveRows.length ? leaveRows.map((item) => item.staff).join('、') : '无人';
          const impact = leaveRows.length === 0
            ? '当前没有请假记录，从排班快照看未发现请假造成的接待影响。'
            : availableRows.length > 0
              ? `当前仍有 ${availableRows.length} 位美容师可接待，未发现接待能力完全中断。`
              : '当前没有美容师处于可接待状态，需要前台复核预约分配和等待风险。';
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: `${range.label}请假人员：${leaveLabel}。${impact}`,
            citations,
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'table',
                rows: rows.map((item) => ({
                  staff: item.staff,
                  status: item.status,
                  timeOffHours: item.timeOffHours,
                  appointmentCount: staffState.get(item.staff)?.appointmentCount ?? 0,
                  nextAvailableAt: item.nextAvailableAt,
                })),
                columns: ['staff', 'status', 'timeOffHours', 'appointmentCount', 'nextAvailableAt'],
                citationIds: ['manager_staff_analysis', 'reception_operations_snapshot'],
              },
              {
                kind: 'diagnosis',
                findings: [{
                  title: '请假对接待的当前影响',
                  detail: impact,
                  severity: leaveRows.length > 0 && availableRows.length === 0 ? 'warning' : 'info',
                }],
                citationIds: ['reception_operations_snapshot'],
              },
            ],
            metadata: {
              capabilityKey: 'manager_staff_overview',
              answerScope: 'staff_leave_reception_impact',
              rangeLabel: range.label,
              leaveStaffCount: leaveRows.length,
              availableStaffCount: availableRows.length,
              completionCriteria: ['staff_leave_loaded', 'current_reception_capacity_loaded'],
            },
          }, dataQuality);
        }
        const focusedColumns = focusMetric === 'metric.staff_customer_repurchase_rate'
          ? ['staff', 'customerRepurchaseRate', 'repeatCustomerCount', 'uniqueCustomerCount']
          : focusMetric === 'metric.staff_commission_amount'
            ? ['staff', 'commissionAmount']
            : focusMetric === 'metric.staff_unique_customer_count'
              ? ['staff', 'uniqueCustomerCount']
              : focusMetric === 'metric.staff_service_count'
                ? ['staff', 'serviceCount']
                : [
                    'staff',
                    'performanceScore',
                    'serviceCount',
                    'uniqueCustomerCount',
                    'repeatCustomerCount',
                    'revenueAmount',
                    'commissionAmount',
                    'timeOffHours',
                  ];
        const focusedAnswer = this.managerStaffFocusedAnswer(range.label, visibleRows, focusMetric);
        return this.applyDataQualityGuard({
          status: 'completed',
          answer: focusedAnswer ?? `${range.label}员工运营分析已完成，共 ${rows.length} 位美容师，包含服务次数、独立客户、客户复购率、业绩、提成、请假时长和当前空档。`,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'ranking',
              rows: visibleRows,
              columns: focusedColumns,
              citationIds: ['manager_staff_analysis'],
            },
            ...(!focusMetric ? [{
              kind: 'table' as const,
              rows: visibleRows.map((item) => ({
                staff: item.staff,
                status: item.status,
                nextAvailableAt: item.nextAvailableAt,
                appointmentCount: staffState.get(item.staff)?.appointmentCount ?? 0,
              })),
              columns: ['staff', 'status', 'nextAvailableAt', 'appointmentCount'],
              citationIds: ['reception_operations_snapshot'],
            }] : []),
          ],
          metadata: {
            capabilityKey: 'manager_staff_overview',
            rangeLabel: range.label,
            staffCount: rows.length,
            focusMetric: focusMetric ?? null,
            componentCapabilities: ['manager_staff_analysis', 'reception_operations_snapshot'],
            completionCriteria: ['staff_performance_loaded', 'staff_schedule_loaded'],
          },
        }, dataQuality);
      }
      case 'front_desk_operations_overview': {
        const [snapshot, overrun, schedule] = await Promise.all([
          this.skillRuntime.buildReceptionOperationsSnapshot({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          this.skillRuntime.buildReceptionServiceOverrunAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
            timezone: input.context.timezone,
          }),
          this.skillRuntime.listReceptionReservations({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
            timezone: input.context.timezone,
          }),
        ]);
        const citations = [
          { sourceType: 'db_skill', sourceId: 'reception_operations_snapshot', label: '预约到店与员工忙闲快照' },
          { sourceType: 'db_skill', sourceId: 'reception_service_overrun_analysis', label: '服务超时影响分析' },
          { sourceType: 'db_skill', sourceId: 'reception_reservation_schedule', label: '门店预约排期' },
        ];
        return this.applyDataQualityGuard({
          status: 'completed',
          answer: `${range.label}前台现场概览已完成，包含预约到店、待到店客户、员工忙闲和服务超时影响。`,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '有效预约', value: `${snapshot.total} 个` },
                { label: '已到店', value: `${snapshot.checkedIn} 人`, hint: `到店率 ${(snapshot.arrivalRate * 100).toFixed(1)}%` },
                { label: '待到店', value: `${snapshot.pendingArrival} 人` },
                { label: '爽约', value: `${snapshot.noShow} 人`, hint: `爽约率 ${(snapshot.noShowRate * 100).toFixed(1)}%` },
                { label: '服务超时', value: `${overrun.overrunCount} 个` },
                { label: '受影响预约', value: `${overrun.impactedCount} 个` },
              ],
              citationIds: citations.map((item) => item.sourceId),
            },
            {
              kind: 'table',
              rows: schedule.reservations.slice(0, this.resolveLimit(input.args.limit, 20)).map((item) => ({
                date: item.date,
                startTime: item.startTime,
                customer: item.customerName,
                project: item.projectName,
                staff: item.beauticianName ?? '未分配',
              })),
              columns: ['date', 'startTime', 'customer', 'project', 'staff'],
              citationIds: ['reception_reservation_schedule'],
            },
            {
              kind: 'table',
              rows: snapshot.staff.map((item) => ({
                staff: item.name,
                appointmentCount: item.appointmentCount,
                status: item.onTimeOff ? '请假' : item.inService ? '服务中' : item.available ? '可接待' : '暂不可用',
                nextAvailableAt: item.nextAvailableAt ?? '',
              })),
              columns: ['staff', 'appointmentCount', 'status', 'nextAvailableAt'],
              citationIds: ['reception_operations_snapshot'],
            },
            ...(overrun.items.length || snapshot.noShow > 0
              ? [{
                  kind: 'diagnosis' as const,
                  findings: [
                    ...(snapshot.noShow > 0
                      ? [{ title: '预约爽约', detail: `${range.label}有 ${snapshot.noShow} 人爽约，需要安排前台回访。`, severity: 'warning' as const }]
                      : []),
                    ...overrun.items.slice(0, 10).map((item) => ({
                      title: `${item.beauticianName}服务超时`,
                      detail: `${item.customerName}的${item.projectName}超时 ${item.overrunMinutes} 分钟${item.impactedReservation ? `，影响 ${item.impactedReservation.startTime} 的${item.impactedReservation.customerName}` : ''}。`,
                      severity: item.impactedReservation ? 'critical' as const : 'warning' as const,
                    })),
                  ],
                  citationIds: ['reception_operations_snapshot', 'reception_service_overrun_analysis'],
                }]
              : []),
          ],
          metadata: {
            capabilityKey: 'front_desk_operations_overview',
            rangeLabel: range.label,
            componentCapabilities: [
              'reception_operations_snapshot',
              'reception_service_overrun_analysis',
              'reception_reservation_schedule',
            ],
            completionCriteria: ['arrival_loaded', 'staff_state_loaded', 'schedule_loaded', 'overrun_loaded'],
          },
        }, dataQuality);
      }
      case 'beautician_service_overview': {
        const [services, performance] = await Promise.all([
          this.skillRuntime.buildBeauticianServiceSummary({
            storeId: input.context.storeId,
            userId: input.context.userId,
            startDate: range.startDate,
            endDate: range.endDate,
            timezone: input.context.timezone,
          }),
          this.skillRuntime.buildBeauticianPersonalPerformance({
            storeId: input.context.storeId,
            userId: input.context.userId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
        ]);
        const citations = [
          { sourceType: 'db_skill', sourceId: 'beautician_service_summary', label: '当前美容师服务安排与客户注意事项' },
          { sourceType: 'db_skill', sourceId: 'beautician_personal_performance', label: '当前美容师个人服务与业绩' },
        ];
        return this.applyDataQualityGuard({
          status: 'completed',
          answer: `${range.label}${performance.beauticianName ? `${performance.beauticianName}的` : ''}个人服务概览已完成，包含服务安排、客户注意事项、完成情况、业绩和项目排行。`,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '服务安排', value: `${services.serviceCount} 个` },
                { label: '服务任务', value: `${performance.serviceCount} 个` },
                { label: '已完成', value: `${performance.completedCount} 个` },
                { label: '服务业绩', value: `${performance.revenueAmount.toFixed(2)} 元` },
                { label: '个人提成', value: `${performance.commissionAmount.toFixed(2)} 元` },
                { label: '复访客户', value: `${performance.repeatCustomerCount} 人`, hint: `服务客户 ${performance.uniqueCustomerCount} 人` },
              ],
              citationIds: citations.map((item) => item.sourceId),
            },
            {
              kind: 'table',
              rows: services.nextTasks.map((item) => ({
                appointmentTime: item.appointmentTime,
                customer: item.customerName,
                project: item.projectName,
                attentionItems: item.attentionItems.join('；'),
              })),
              columns: ['appointmentTime', 'customer', 'project', 'attentionItems'],
              citationIds: ['beautician_service_summary'],
            },
            ...(performance.projectRanking.length
              ? [{
                  kind: 'ranking' as const,
                  rows: performance.projectRanking.map((item) => ({ project: item.name, serviceCount: item.count })),
                  columns: ['project', 'serviceCount'],
                  citationIds: ['beautician_personal_performance'],
                }]
              : []),
            ...(services.nextTasks.some((item) => item.attentionItems.length)
              ? [{
                  kind: 'diagnosis' as const,
                  findings: services.nextTasks
                    .filter((item) => item.attentionItems.length)
                    .map((item) => ({
                      title: `${item.customerName}服务前注意`,
                      detail: item.attentionItems.join('；'),
                      severity: item.attentionItems.some((attention) => attention.includes('过敏')) ? 'warning' as const : 'info' as const,
                    })),
                  citationIds: ['beautician_service_summary'],
                }]
              : []),
          ],
          metadata: {
            capabilityKey: 'beautician_service_overview',
            rangeLabel: range.label,
            identitySource: 'server_context_user',
            componentCapabilities: ['beautician_service_summary', 'beautician_personal_performance'],
            completionCriteria: ['service_schedule_loaded', 'customer_attention_loaded', 'personal_performance_loaded'],
          },
        }, dataQuality);
      }
      case 'inventory_operations_overview': {
        const expiringBefore = new Date(range.endDate.getTime() + 30 * 86_400_000);
        const requestedMetricKeys = structuredDefinitionKeys(input.args.metrics);
        const stockRiskRanking = requestedMetricKeys.has('metric.stock_risk_score');
        const [risk, detail, procurement] = await Promise.all([
          this.skillRuntime.buildInventoryRiskSummary({ storeId: input.context.storeId, expiringBefore }),
          this.skillRuntime.buildInventoryDetailAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          this.skillRuntime.buildInventoryProcurementAnalysis({ storeId: input.context.storeId }),
        ]);
        const citations = [
          { sourceType: 'db_skill', sourceId: 'inventory_risk_summary', label: '低库存与临期批次风险' },
          { sourceType: 'db_skill', sourceId: 'inventory_detail_analysis', label: '库存金额与消耗明细' },
          { sourceType: 'db_skill', sourceId: 'inventory_procurement_analysis', label: '采购建议、供应商和采购单' },
        ];
        return this.applyDataQualityGuard({
          status: 'completed',
          answer: `${range.label}库存采购概览已完成，包含库存金额、低库存、临期、消耗和采购建议；不会直接创建采购单。`,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '在库 SKU', value: `${detail.totalSku} 个` },
                { label: '库存金额', value: `${detail.totalStockValue.toFixed(2)} 元` },
                { label: '低库存 SKU', value: `${risk.stockoutSkuCount} 个` },
                { label: '临期库存金额', value: `${risk.expiringStockValue.toFixed(2)} 元`, hint: `截止 ${expiringBefore.toISOString().slice(0, 10)}` },
                { label: '采购建议', value: `${procurement.suggestions.length} 项` },
                { label: '候选供应商', value: `${procurement.suppliers.length} 家` },
              ],
              citationIds: citations.map((item) => item.sourceId),
            },
            {
              kind: 'ranking',
              rows: stockRiskRanking
                ? risk.lowStockProducts.slice(0, this.resolveLimit(input.args.limit, 20)).map((item) => ({
                    product: item.name,
                    currentStock: item.currentStock,
                    safetyStock: item.safetyStock,
                    shortage: Math.max(0, item.safetyStock - item.currentStock),
                  }))
                : detail.products.slice(0, this.resolveLimit(input.args.limit, 20)).map((item) => ({
                    product: item.name,
                    stock: item.stock,
                    outboundQty: item.outboundQty,
                    coverageDays: item.coverageDays ?? '',
                  })),
              columns: stockRiskRanking
                ? ['product', 'currentStock', 'safetyStock', 'shortage']
                : ['product', 'stock', 'outboundQty', 'coverageDays'],
              citationIds: [stockRiskRanking ? 'inventory_risk_summary' : 'inventory_detail_analysis'],
            },
            {
              kind: 'table',
              rows: procurement.suggestions.slice(0, this.resolveLimit(input.args.limit, 20)).map((item) => ({
                product: item.productName,
                currentStock: item.currentStock,
                safetyStock: item.safetyStock,
                suggestedQty: item.suggestedQty,
                supplier: item.supplierName ?? '待询价',
                estimatedCost: item.estimatedCost ?? '',
              })),
              columns: ['product', 'currentStock', 'safetyStock', 'suggestedQty', 'supplier', 'estimatedCost'],
              citationIds: ['inventory_procurement_analysis'],
            },
            ...(risk.lowStockProducts.length || risk.expiringProducts.length
              ? [{
                  kind: 'diagnosis' as const,
                  findings: [
                    ...risk.lowStockProducts.slice(0, 10).map((item) => ({
                      title: `${item.name}低于安全库存`,
                      detail: `当前 ${item.currentStock}，安全库存 ${item.safetyStock}，需要复核补货建议。`,
                      severity: 'warning' as const,
                    })),
                    ...risk.expiringProducts.slice(0, 10).map((item) => ({
                      title: `${item.name}临期风险`,
                      detail: `库存 ${item.stock}，预计金额 ${item.estimatedValue.toFixed(2)} 元${item.expiryDate ? `，有效期至 ${item.expiryDate}` : ''}。`,
                      severity: 'warning' as const,
                    })),
                  ],
                  citationIds: ['inventory_risk_summary'],
                }]
              : []),
            { kind: 'limitations', items: ['本能力只生成采购建议和风险清单，不会创建或提交真实采购单'] },
          ],
          metadata: {
            capabilityKey: 'inventory_operations_overview',
            rangeLabel: range.label,
            expiringBefore: expiringBefore.toISOString(),
            componentCapabilities: ['inventory_risk_summary', 'inventory_detail_analysis', 'inventory_procurement_analysis'],
            completionCriteria: ['inventory_value_loaded', 'risk_loaded', 'consumption_loaded', 'procurement_preview_loaded'],
          },
        }, dataQuality);
      }
      case 'finance_risk_overview': {
        const diagnosisAnswer = input.answerShape === 'diagnosis';
        const diagnosisRange = diagnosisAnswer ? this.resolveFinanceDiagnosisRange(input, range) : range;
        const comparisonRange = diagnosisAnswer ? this.previousComparableRange(diagnosisRange) : undefined;
        const [risk, income, cost, previousRisk, previousIncome, previousCost] = await Promise.all([
          this.skillRuntime.buildFinanceRiskSummary({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          }),
          this.skillRuntime.buildFinanceIncomeAnalysis({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          }),
          this.skillRuntime.buildFinanceCostAnalysis({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          }),
          comparisonRange
            ? this.skillRuntime.buildFinanceRiskSummary({
                storeId: input.context.storeId,
                startDate: comparisonRange.startDate,
                endDate: comparisonRange.endDate,
              })
            : Promise.resolve(undefined),
          comparisonRange
            ? this.skillRuntime.buildFinanceIncomeAnalysis({
                storeId: input.context.storeId,
                startDate: comparisonRange.startDate,
                endDate: comparisonRange.endDate,
              })
            : Promise.resolve(undefined),
          comparisonRange
            ? this.skillRuntime.buildFinanceCostAnalysis({
                storeId: input.context.storeId,
                startDate: comparisonRange.startDate,
                endDate: comparisonRange.endDate,
              })
            : Promise.resolve(undefined),
        ]);
        const citations = [
          { sourceType: 'db_skill', sourceId: 'finance_risk_summary', label: '退款、优惠与毛利风险' },
          { sourceType: 'db_skill', sourceId: 'finance_income_analysis', label: '实收、支付方式与收入趋势' },
          { sourceType: 'db_skill', sourceId: 'finance_cost_analysis', label: '成本、毛利与会员卡负债' },
        ];
        if (input.answerShape === 'scalar') {
          const requestedMetricKeys = structuredDefinitionKeys(input.args.metrics);
          if (/退款/.test(input.question) && /几笔|笔数|次数/.test(input.question)) {
            requestedMetricKeys.add('metric.refund_count');
          }
          if (/折扣|优惠|让利/.test(input.question) && /多少|金额|送出去/.test(input.question)) {
            requestedMetricKeys.add('metric.discount_amount');
          }
          const scalarItems: Array<{ label: string; value: string; definitionKey: string; citationId: string }> = [];
          if (requestedMetricKeys.has('metric.paid_amount')) {
            scalarItems.push({
              label: '实收金额',
              value: `${income.totalCollected.toFixed(2)} 元`,
              definitionKey: 'metric.paid_amount',
              citationId: 'finance_income_analysis',
            });
          }
          if (requestedMetricKeys.has('metric.refund_amount')) {
            scalarItems.push({
              label: '退款金额',
              value: `${risk.refundAmount.toFixed(2)} 元`,
              definitionKey: 'metric.refund_amount',
              citationId: 'finance_risk_summary',
            });
          }
          if (requestedMetricKeys.has('metric.refund_count')) {
            scalarItems.push({
              label: '退款笔数',
              value: `${risk.refundCount} 笔`,
              definitionKey: 'metric.refund_count',
              citationId: 'finance_risk_summary',
            });
          }
          if (requestedMetricKeys.has('metric.discount_amount')) {
            scalarItems.push({
              label: '优惠金额',
              value: `${risk.discountAmount.toFixed(2)} 元`,
              definitionKey: 'metric.discount_amount',
              citationId: 'finance_risk_summary',
            });
          }
          if (requestedMetricKeys.has('metric.operating_cost_amount')) {
            scalarItems.push({
              label: '经营费用',
              value: `${cost.operatingCost.toFixed(2)} 元`,
              definitionKey: 'metric.operating_cost_amount',
              citationId: 'finance_cost_analysis',
            });
          }
          if (scalarItems.length > 0) {
            const definitionCitations = scalarItems.map((item) => {
              const ref = structuredDefinitionRef(input.args.metrics, item.definitionKey);
              return {
                sourceType: 'business_definition',
                sourceId: ref ? `${ref.definitionKey}@${ref.definitionVersion}` : item.definitionKey,
                label: `业务定义：${item.label}`,
              };
            });
            const dataCitations = [...new Set(scalarItems.map((item) => item.citationId))]
              .map((sourceId) => citations.find((citation) => citation.sourceId === sourceId)!)
              .filter(Boolean);
            const multipleMetrics = scalarItems.length > 1;
            const limitation = '当前请求包含多个独立已发布指标，本次分别展示，不将其自动合成未发布的派生指标。';
            return {
              status: 'completed',
              answer: `${diagnosisRange.label}${scalarItems.map((item) => `${item.label} ${item.value}`).join('，')}。${multipleMetrics ? limitation : ''}`,
              citations: [...definitionCitations, ...dataCitations],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: scalarItems.map((item) => ({ label: item.label, value: item.value })),
                  citationIds: [
                    ...definitionCitations.map((citation) => citation.sourceId),
                    ...dataCitations.map((citation) => citation.sourceId),
                  ],
                },
                ...(multipleMetrics ? [{ kind: 'limitations' as const, items: [limitation] }] : []),
              ],
              metadata: {
                capabilityKey: 'finance_risk_overview',
                rangeLabel: diagnosisRange.label,
                answerShape: input.answerShape,
                answerScope: 'requested_scalar_metrics',
                requestedMetricKeys: [...requestedMetricKeys],
                completionCriteria: scalarItems.map((item) => `${item.definitionKey}_loaded`),
              },
            };
          }
        }
        const diagnosis =
          diagnosisAnswer && previousRisk && previousIncome && previousCost
            ? this.buildFinanceDiagnosis({
                risk,
                income,
                cost,
                previousRisk,
                previousIncome,
                previousCost,
                currentLabel: diagnosisRange.label,
                previousLabel: comparisonRange!.label,
              })
            : undefined;
        const requestedDiagnosisDimensions = structuredDefinitionKeys(input.args.dimensions);
        const projectStructureGap = diagnosisAnswer && (
          /(?:项目|品项|商品|产品|结构)/.test(input.question) ||
          ['dimension.projectName', 'dimension.productName'].some((key) => requestedDiagnosisDimensions.has(key))
        )
          ? ['现有结算未关联商品/项目级收入、折扣和成本，无法量化商品或项目结构对毛利变化的贡献；本次仅诊断已接入的收入、退款、折扣、物料、提成和经营费用。']
          : [];
        return {
          status: 'completed',
          answer: diagnosis
            ? `${diagnosisRange.label}财务诊断已完成。${diagnosis.summary}`
            : `${diagnosisRange.label}财务经营风险概览已完成，包含实收、支付方式、收入趋势、退款、优惠、成本、毛利和会员卡负债。`,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '实收', value: `${income.totalCollected.toFixed(2)} 元` },
                { label: '退款', value: `${risk.refundAmount.toFixed(2)} 元`, hint: `${risk.refundCount} 笔` },
                { label: '优惠', value: `${risk.discountAmount.toFixed(2)} 元` },
                { label: '毛利', value: `${cost.grossProfit.toFixed(2)} 元` },
                { label: '毛利率', value: cost.grossMarginRate === undefined ? '暂无结算口径' : `${(cost.grossMarginRate * 100).toFixed(1)}%` },
                { label: '会员卡负债', value: `${cost.cardLiability.toFixed(2)} 元` },
              ],
              citationIds: citations.map((item) => item.sourceId),
            },
            {
              kind: 'ranking',
              rows: income.paymentBreakdown.map((item) => ({ paymentMethod: item.method, amount: item.amount, count: item.count })),
              columns: ['paymentMethod', 'amount', 'count'],
              citationIds: ['finance_income_analysis'],
            },
            ...(income.dailyTrend.length
              ? [{
                  kind: 'chart' as const,
                  chartType: 'line' as const,
                  rows: income.dailyTrend,
                  xKey: 'date',
                  yKeys: ['revenue'],
                  citationIds: ['finance_income_analysis'],
                }]
              : []),
            {
              kind: 'table',
              rows: [
                { costCategory: '物料成本', amount: cost.materialCost },
                { costCategory: '提成成本', amount: cost.commissionCost },
                { costCategory: '经营费用', amount: cost.operatingCost },
                ...cost.costCategories.map((item) => ({ costCategory: item.category, amount: item.amount })),
              ],
              columns: ['costCategory', 'amount'],
              citationIds: ['finance_cost_analysis'],
            },
            {
              kind: 'diagnosis',
              findings: diagnosis?.findings.length
                ? diagnosis.findings
                : risk.riskItems.length
                  ? risk.riskItems.map((detail) => ({ title: '财务风险', detail, severity: 'warning' as const }))
                : [{ title: '未触发财务预警', detail: `${diagnosisRange.label}退款、优惠和毛利未触发当前预警规则。`, severity: 'info' as const }],
              citationIds: diagnosis ? citations.map((item) => item.sourceId) : ['finance_risk_summary'],
            },
            ...(diagnosis?.comparisonItems.length
              ? [{ kind: 'comparison' as const, items: diagnosis.comparisonItems, citationIds: citations.map((item) => item.sourceId) }]
              : []),
            ...(projectStructureGap.length ? [{ kind: 'limitations' as const, items: projectStructureGap }] : []),
          ],
          metadata: {
            capabilityKey: 'finance_risk_overview',
            rangeLabel: diagnosisRange.label,
            diagnosisBaselineLabel: comparisonRange?.label ?? null,
            answerShape: input.answerShape ?? null,
            componentCapabilities: ['finance_risk_summary', 'finance_income_analysis', 'finance_cost_analysis'],
            completionCriteria: ['income_loaded', 'payment_breakdown_loaded', 'cost_loaded', 'risk_loaded', 'liability_loaded'],
            diagnosisDrivers: diagnosis?.drivers ?? [],
            projectStructureGap: projectStructureGap.length > 0,
          },
        };
      }
      case 'marketing_growth_overview': {
        if (this.isPackageAudienceQuestion(input.question, input.args.objective)) {
          return this.buildMarketingPackageAudience(input);
        }
        const [analytics, prioritySnapshot, segmentSummary] = await Promise.all([
          this.skillRuntime.buildMarketingAnalytics({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          this.skillRuntime.buildMarketingFollowUpPrioritySnapshot({
            storeId: input.context.storeId,
            asOf: range.endDate,
          }),
          this.customerFacts.summarizeCustomerSegments({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
        ]);
        const priorityRows = prioritySnapshot.rows;
        const activeStrategyCount = analytics.strategies.filter((item) => item.status === 'enabled').length;
        const touchCoverageHint = analytics.dataCoverage.touchesTruncated
          ? `前 ${analytics.dataCoverage.touchSampleSize} 条样本`
          : undefined;
        const citations = [
          { sourceType: 'db_skill', sourceId: 'marketing_attribution_analytics', label: '营销触达、转化与归因分析' },
          { sourceType: 'business_definition', sourceId: 'metric.follow_up_priority_score', label: '客户跟进优先级评分' },
          { sourceType: 'db_skill', sourceId: 'marketing_customer_segment_summary', label: '客户分层与卡项关注摘要' },
        ];
        const findings = [
          ...(analytics.reachedCount > 0 && analytics.conversionRate < 0.1
            ? [{
                title: '渠道整体转化偏低',
                detail: `${range.label}${analytics.dataCoverage.touchesTruncated ? `前 ${analytics.dataCoverage.touchSampleSize} 条` : ''}触达记录转化率 ${(analytics.conversionRate * 100).toFixed(1)}%，建议先复核客群和渠道再扩大触达。`,
                severity: 'warning' as const,
              }]
            : []),
          ...(analytics.reachedCount === 0
            ? [{ title: '缺少营销触达数据', detail: `${range.label}没有营销触达记录，无法评价渠道转化。`, severity: 'info' as const }]
            : []),
          {
            title: 'ROI 口径未开放',
            detail: '当前统一业务定义没有营销活动成本事实，本能力只展示归因收入，不计算虚假 ROI。',
            severity: 'info' as const,
          },
          ...(analytics.dataCoverage.touchesTruncated || analytics.dataCoverage.attributionsTruncated || prioritySnapshot.truncated
            ? [{
                title: '营销明细达到读取上限',
                detail: '当前结果是受控样本，不把读取上限冒充完整业务总量；需要聚合查询或分页任务后才能给出精确全量统计。',
                severity: 'warning' as const,
              }]
            : []),
        ];
        return {
          status: 'completed',
          answer: `${range.label}营销增长概览已完成，包含客户分层、跟进优先级、渠道触达、转化、归因收入和自动化策略；不会直接群发或发布规则。`,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '优先跟进客户', value: `${prioritySnapshot.truncated ? '至少 ' : ''}${priorityRows.length} 人`, hint: prioritySnapshot.truncated ? `前 ${prioritySnapshot.scannedOpportunityCount} 条机会记录` : undefined },
                { label: '触达', value: `${analytics.dataCoverage.touchesTruncated ? '至少 ' : ''}${analytics.reachedCount} 人`, hint: touchCoverageHint },
                { label: '转化', value: `${analytics.convertedCount} 人`, hint: touchCoverageHint },
                { label: '转化率', value: `${(analytics.conversionRate * 100).toFixed(1)}%`, hint: touchCoverageHint },
                { label: '归因收入', value: `${analytics.attributedRevenue.toFixed(2)} 元`, hint: analytics.dataCoverage.attributionsTruncated ? `前 ${analytics.dataCoverage.attributionSampleSize} 条归因样本` : undefined },
                { label: '运行中策略', value: `${activeStrategyCount} 个`, hint: `策略总数 ${analytics.strategies.length}` },
              ],
              citationIds: citations.map((item) => item.sourceId),
            },
            {
              kind: 'table',
              rows: priorityRows.slice(0, this.resolveLimit(input.args.limit, 20)).map((item) => ({
                customer: item.customerName,
                priority: item.priority,
                opportunityType: item.opportunityType,
                score: item.score,
              })),
              columns: ['customer', 'priority', 'opportunityType', 'score'],
              citationIds: ['metric.follow_up_priority_score'],
            },
            ...(analytics.channels.length
              ? [{
                  kind: 'ranking' as const,
                  rows: analytics.channels.map((item) => ({
                    channel: item.channel,
                    reached: item.reached,
                    converted: item.converted,
                    conversionRate: `${(item.conversionRate * 100).toFixed(1)}%`,
                    revenue: item.revenue,
                  })),
                  columns: ['channel', 'reached', 'converted', 'conversionRate', 'revenue'],
                  citationIds: ['marketing_attribution_analytics'],
                }]
              : []),
            ...(analytics.attributionByStrategy.length
              ? [{
                  kind: 'ranking' as const,
                  rows: analytics.attributionByStrategy.map((item) => ({ strategy: item.name, attributedRevenue: item.revenue })),
                  columns: ['strategy', 'attributedRevenue'],
                  citationIds: ['marketing_attribution_analytics'],
                }]
              : []),
            {
              kind: 'table',
              rows: analytics.strategies.map((item) => ({
                strategy: item.name,
                status: item.status,
                executionType: item.executionType,
                lastExecutedAt: item.lastExecutedAt?.toISOString() ?? '',
              })),
              columns: ['strategy', 'status', 'executionType', 'lastExecutedAt'],
              citationIds: ['marketing_attribution_analytics'],
            },
            { kind: 'text', text: segmentSummary, citationIds: ['marketing_customer_segment_summary'] },
            { kind: 'diagnosis', findings, citationIds: ['marketing_attribution_analytics'] },
            { kind: 'limitations', items: ['本能力不会直接发送营销消息，也不会发布自动化规则或计算缺少成本事实的 ROI'] },
          ],
          metadata: {
            capabilityKey: 'marketing_growth_overview',
            rangeLabel: range.label,
            componentCapabilities: [
              'marketing_attribution_analytics',
              'marketing_follow_up_opportunities',
              'marketing_customer_segment_summary',
            ],
            dataCoverage: { ...analytics.dataCoverage, priorityTruncated: prioritySnapshot.truncated },
            completionCriteria: ['segments_loaded', 'priority_loaded', 'channel_conversion_loaded', 'attribution_loaded', 'strategy_loaded'],
          },
        };
      }
      case 'marketing_message_draft': {
        const recall = /召回|沉默|沉睡|没来|流失/.test(input.question);
        const timeWindow = this.resolveDraftTimeWindow(input.question, range.label);
        const answer = recall
          ? this.skillRuntime.draftCustomerRecall({})
          : this.skillRuntime.draftAppointmentReminder({ timeWindow });
        const sourceId = recall ? 'marketing_draft_customer_recall' : 'marketing_draft_appointment_reminder';
        return {
          status: 'completed',
          answer,
          citations: [{ sourceType: 'skill', sourceId, label: recall ? '老客召回文案模板' : '预约邀约文案模板' }],
          grounding: 'template_skill',
          blocks: [{
            kind: 'limitations',
            items: ['这是可编辑文案草稿，未查询或选择具体客户，也不会自动发送。'],
          }],
          metadata: {
            capabilityKey: 'marketing_message_draft',
            mode: recall ? 'customer_recall' : 'appointment_invitation',
            rangeLabel: range.label,
            timeWindow: timeWindow ?? null,
            deliveryStatus: 'draft_only',
            completionCriteria: ['draft_generated', 'no_message_sent', 'limitations_disclosed'],
          },
        };
      }
      case 'reservation_list': {
        const schedule = await this.skillRuntime.listReceptionReservations({
          storeId: input.context.storeId,
          startDate: range.startDate,
          endDate: range.endDate,
          timezone: input.context.timezone,
        });
        const rows = schedule.reservations
          .slice(0, this.resolveLimit(input.args.limit, 100))
          .map(
            (item, index) =>
              `${index + 1}. ${item.date} ${item.startTime}，${item.customerName}，${item.projectName}${
                item.beauticianName ? `，美容师 ${item.beauticianName}` : ''
              }`,
          )
          .join('\n');
        return this.answer({
          answer: `预约清单：共 ${schedule.count} 个。${rows ? `\n${rows}` : ''}`,
          citationId: 'capability_reservation_list',
          citationLabel: '门店预约清单',
          metadata: { rangeLabel: range.label, count: schedule.count },
        });
      }
      case 'customer_facts': {
        if (/(?:新客.*(?:转化|成交|首单)|(?:转化|成交|首单).*新客)/.test(input.question)) {
          const summary = await this.customerFacts.getNewCustomerConversionSummary({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const metricKeys = [
            ['metric.new_customer_count', '新客数'],
            ['metric.new_customer_conversion_count', '新客转化数'],
            ['metric.new_customer_conversion_rate', '新客转化率'],
          ] as const;
          const definitionCitations = metricKeys.map(([definitionKey, label]) => {
            const ref = structuredDefinitionRef(input.args.metrics, definitionKey);
            return {
              sourceType: 'business_definition',
              sourceId: ref ? `${ref.definitionKey}@${ref.definitionVersion}` : definitionKey,
              label: `业务定义：${label}`,
            };
          });
          return {
            status: 'completed',
            answer: `${range.label}新增客户 ${summary.newCustomerCount} 人，其中 ${summary.convertedCustomerCount} 人在同一周期内完成首笔有效正金额订单，转化率 ${(summary.conversionRate * 100).toFixed(1)}%，待转化 ${summary.unconvertedCustomerCount} 人。`,
            citations: [
              ...definitionCitations,
              { sourceType: 'db_skill', sourceId: 'customer_acquisition_conversion_summary', label: '客户建档与首笔有效订单转化事实' },
            ],
            grounding: 'db_skill',
            blocks: [{
              kind: 'kpi',
              items: [
                { label: '新增客户', value: `${summary.newCustomerCount} 人` },
                { label: '已转化', value: `${summary.convertedCustomerCount} 人` },
                { label: '转化率', value: `${(summary.conversionRate * 100).toFixed(1)}%` },
                { label: '待转化', value: `${summary.unconvertedCustomerCount} 人` },
              ],
              citationIds: [
                ...definitionCitations.map((citation) => citation.sourceId),
                'customer_acquisition_conversion_summary',
              ],
            }],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: range.label,
              cohortDefinition: 'Customer.createdAt within requested period',
              conversionDefinition: 'first valid positive-net ProductOrder between customer creation and period end',
              completionCriteria: ['new_customer_count_loaded', 'new_customer_conversion_count_loaded'],
            },
          };
        }
        if (/(?:到店|来店).*(?:年龄|年龄段)|(?:年龄|年龄段).*(?:到店|来店)/.test(input.question)) {
          const distribution = await this.customerFacts.getArrivedCustomerAgeDistribution({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const dimensionRef = structuredDefinitionRef(input.args.dimensions, 'dimension.customerAgeGroup');
          const definitionCitation = {
            sourceType: 'business_definition',
            sourceId: dimensionRef
              ? `${dimensionRef.definitionKey}@${dimensionRef.definitionVersion}`
              : 'dimension.customerAgeGroup',
            label: '业务定义：到店客户年龄段',
          };
          const leading = distribution.rows[0];
          return {
            status: 'completed',
            answer: distribution.arrivedCustomerCount === 0
              ? `${range.label}没有实际到店客户，无法形成年龄段画像。`
              : `${range.label}实际到店客户 ${distribution.arrivedCustomerCount} 人，已知年龄 ${distribution.knownAgeCount} 人、未知 ${distribution.unknownAgeCount} 人。${leading ? `人数最多的是 ${leading.ageGroup}，${leading.count} 人（${(leading.share * 100).toFixed(1)}%）。` : '当前没有可分组的已知年龄。'}`,
            citations: [
              definitionCitation,
              { sourceType: 'db_skill', sourceId: 'arrived_customer_age_distribution', label: '预约到店与客户年龄聚合事实' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '实际到店客户', value: `${distribution.arrivedCustomerCount} 人` },
                  { label: '年龄已知', value: `${distribution.knownAgeCount} 人` },
                  { label: '年龄未知', value: `${distribution.unknownAgeCount} 人` },
                ],
                citationIds: [definitionCitation.sourceId, 'arrived_customer_age_distribution'],
              },
              {
                kind: 'table',
                rows: distribution.rows.map((item) => ({
                  ageGroup: item.ageGroup,
                  customerCount: item.count,
                  share: `${(item.share * 100).toFixed(1)}%`,
                })),
                columns: ['ageGroup', 'customerCount', 'share'],
                citationIds: [definitionCitation.sourceId, 'arrived_customer_age_distribution'],
              },
              ...(distribution.arrivedCustomerCount === 0
                ? [{ kind: 'limitations' as const, items: [`${range.label}没有实际到店客户`] }]
                : distribution.unknownAgeCount > 0
                  ? [{ kind: 'limitations' as const, items: [`${distribution.unknownAgeCount} 位到店客户缺少有效年龄或生日，未分配到年龄段`] }]
                  : []),
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: range.label,
              dimensionKey: 'customerAgeGroup',
              arrivalDefinition: 'Reservation.checkedInAt in range, or arrived status on reservation date when checkedInAt is missing',
              ageDefinition: 'valid Customer.age, otherwise derive from Customer.birthday as of range end',
              privacy: 'aggregate_only',
            },
          };
        }
        if (/(老客|客户).*(回头率|复购率)|(?:回头率|复购率).*(老客|客户)/.test(input.question)) {
          const explicitTime = readCapabilityStructuredTime(input.args, input.context.timezone);
          const summary = await this.customerFacts.getCustomerRetentionSummary({
            storeId: input.context.storeId,
            startDate: explicitTime ? range.startDate : undefined,
            endDate: explicitTime ? range.endDate : undefined,
          });
          const metricRef = structuredDefinitionRef(input.args.metrics, 'metric.repurchase_rate');
          return {
            status: 'completed',
            answer: `${summary.rangeLabel}客户复购率 ${(summary.repurchaseRate * 100).toFixed(1)}%：有有效消费的 ${summary.activeCustomerCount} 位客户中，${summary.repeatCustomerCount} 位至少消费 2 次。`,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: metricRef ? `${metricRef.definitionKey}@${metricRef.definitionVersion}` : 'metric.repurchase_rate',
                label: '业务定义：客户复购率',
              },
              { sourceType: 'db_skill', sourceId: 'customer_retention_summary', label: '客户有效消费与复购统计' },
            ],
            grounding: 'db_skill',
            blocks: [{
              kind: 'kpi',
              items: [
                { label: '客户复购率', value: `${(summary.repurchaseRate * 100).toFixed(1)}%` },
                { label: '有效消费客户', value: `${summary.activeCustomerCount} 人` },
                { label: '复购客户', value: `${summary.repeatCustomerCount} 人` },
              ],
              citationIds: ['customer_retention_summary'],
            }],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: summary.rangeLabel,
              metricKey: 'repurchase_rate',
              definition: 'customers_with_at_least_2_valid_orders / customers_with_at_least_1_valid_order',
            },
          };
        }
        if (/(老客|客户).*(平均多久|多久回来|回访间隔|回店间隔)|平均多久回来一次/.test(input.question)) {
          const explicitTime = readCapabilityStructuredTime(input.args, input.context.timezone);
          const summary = await this.customerFacts.getCustomerRetentionSummary({
            storeId: input.context.storeId,
            startDate: explicitTime ? range.startDate : undefined,
            endDate: explicitTime ? range.endDate : undefined,
          });
          const metricRef = structuredDefinitionRef(input.args.metrics, 'metric.average_return_interval_days');
          const value = summary.averageReturnIntervalDays;
          const answer = value === null
            ? `${summary.rangeLabel}没有足够的重复消费样本，无法计算客户平均回访间隔。`
            : `${summary.rangeLabel}老客户相邻两次有效消费的平均间隔为 ${value.toFixed(1)} 天，样本为 ${summary.repeatIntervalCount} 个相邻消费间隔。`;
          return {
            status: 'completed',
            answer,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: metricRef ? `${metricRef.definitionKey}@${metricRef.definitionVersion}` : 'metric.average_return_interval_days',
                label: '业务定义：客户平均回访间隔',
              },
              { sourceType: 'db_skill', sourceId: 'customer_retention_summary', label: '客户有效消费间隔统计' },
            ],
            grounding: 'db_skill',
            blocks: value === null
              ? [{ kind: 'limitations', items: ['当前时间范围没有至少两次有效消费的客户样本。'] }]
              : [{
                  kind: 'kpi',
                  items: [{ label: '平均回访间隔', value: `${value.toFixed(1)} 天`, hint: `${summary.repeatIntervalCount} 个相邻消费间隔` }],
                  citationIds: ['customer_retention_summary'],
                }],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: summary.rangeLabel,
              metricKey: 'average_return_interval_days',
              sampleCount: summary.repeatIntervalCount,
            },
          };
        }
        if (/消费了钱.*(?:很少用|少用).*次卡|次卡.*(?:很少用|使用少)/.test(input.question)) {
          const result = await this.customerFacts.getLowCardUsageCustomers(
            input.context.storeId,
            this.resolveLimit(input.args.limit, 10),
          );
          return this.answer({
            answer: `次卡低使用客户共 ${result.total} 人次卡。统一口径：客户累计消费大于 0，活跃次卡已核销不超过 1 次或使用率不超过 20%。${result.rows.length ? `\n${result.rows.map((row, index) => `${index + 1}. ${row.customerName}：${row.cardName}，已用 ${row.usedTimes}/${row.totalTimes} 次（${(row.usageRate * 100).toFixed(1)}%），累计消费 ${row.totalSpent.toFixed(2)} 元`).join('\n')}` : ''}`,
            citationId: 'customer_card_usage_facts',
            citationLabel: '客户次卡开卡与核销事实',
            blocks: [{
              kind: 'table',
              rows: result.rows,
              columns: ['customerName', 'cardName', 'usedTimes', 'totalTimes', 'remainingTimes', 'usageRate', 'totalSpent'],
              citationIds: ['customer_card_usage_facts'],
            }],
            metadata: { capabilityKey: 'customer_facts', total: result.total, definition: 'usedTimes <= 1 OR usedTimes / totalTimes <= 0.2' },
          });
        }
        if (/开了次卡.*(?:从来不来消费|从未消费|没来消费|从来没用)|次卡.*(?:从未核销|一次没用)/.test(input.question)) {
          const result = await this.customerFacts.getNeverUsedCardCustomers(
            input.context.storeId,
            this.resolveLimit(input.args.limit, 10),
          );
          return this.answer({
            answer: `当前有 ${result.total} 人次卡开卡后从未发生次卡核销。这里严格回答“次卡未使用”，不把它扩大解释为客户从未发生任何消费。${result.rows.length ? `\n${result.rows.map((row, index) => `${index + 1}. ${row.customerName}：${row.cardName}，剩余 ${row.remainingTimes}/${row.totalTimes} 次`).join('\n')}` : ''}`,
            citationId: 'customer_card_usage_facts',
            citationLabel: '客户次卡开卡与核销事实',
            blocks: [
              { kind: 'kpi', items: [{ label: '开卡未核销', value: `${result.total} 人次卡` }], citationIds: ['customer_card_usage_facts'] },
              {
                kind: 'table',
                rows: result.rows,
                columns: ['customerName', 'cardName', 'remainingTimes', 'totalTimes', 'totalSpent'],
                citationIds: ['customer_card_usage_facts'],
              },
            ],
            metadata: { capabilityKey: 'customer_facts', total: result.total, definition: 'active CustomerCard with zero CardUsageRecord' },
          });
        }
        if (/(?:新客.*(?:渠道|来源)|(?:渠道|来源).*新客)/.test(input.question)) {
          const distribution = await this.customerFacts.getNewCustomerSourceDistribution({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const rows = distribution.sourceRanking.slice(0, this.resolveLimit(input.args.limit, 10));
          const summary = rows.length
            ? rows.map((item) => `${item.source} ${item.count} 人（${(item.share * 100).toFixed(1)}%）`).join('、')
            : '暂无新客来源数据';
          return this.answer({
            answer: `${range.label}新客共 ${distribution.total} 人。渠道分布：${summary}。${distribution.missingSourceCount > 0 ? `其中 ${distribution.missingSourceCount} 人未记录渠道。` : ''}`,
            citationId: 'capability_customer_source_distribution',
            citationLabel: '客户档案新客来源分布',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '新客总数', value: `${distribution.total} 人` },
                  { label: '未记录渠道', value: `${distribution.missingSourceCount} 人` },
                ],
                citationIds: ['capability_customer_source_distribution'],
              },
              {
                kind: 'ranking',
                rows: rows.map((item) => ({
                  customerSource: item.source,
                  newCustomerCount: item.count,
                  share: `${(item.share * 100).toFixed(1)}%`,
                })),
                columns: ['customerSource', 'newCustomerCount', 'share'],
                citationIds: ['capability_customer_source_distribution'],
              },
            ],
            metadata: {
              rangeLabel: range.label,
              totalNewCustomers: distribution.total,
              missingSourceCount: distribution.missingSourceCount,
              newCustomerDefinition: 'Customer.createdAt within requested time range',
              sourceField: 'Customer.source',
            },
          });
        }
        const customerMention = structuredEntityMentions(input.args as BrainCapabilityToolArgs)
          .filter((entity) => entity.entityType === 'customer')
          .map((entity) => specificCustomerMention(entity))
          .find((mention): mention is string => Boolean(mention));
        const answer = await this.customerFacts.answerCustomerQuestion({
          storeId: input.context.storeId,
          message: input.question,
          specificCustomerMention: customerMention,
          permissions: input.context.permissions,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        if (isCustomerIdentityClarification(answer)) {
          const question = '找到多位匹配客户，请补充手机号后四位后继续。';
          return {
            status: 'completed',
            answer,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'clarification', question, options: [] }],
            metadata: {
              rangeLabel: range.label,
              unsupportedReason: 'customer_identity_requires_clarification',
              clarification: { questions: [question], missingSlots: ['entity'], ambiguities: [] },
              completion: { status: 'partial', missingCriteria: ['entity'], recoverable: true },
            },
          };
        }
        return this.answer({
          answer,
          citationId: 'capability_customer_facts',
          citationLabel: '客户精确事实查询',
          metadata: { rangeLabel: range.label },
        });
      }
      case 'marketing_customer_segment': {
        const summary = await this.customerFacts.summarizeCustomerSegments({
          storeId: input.context.storeId,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        return this.answer({
          answer: `营销客户分群摘要：\n${summary}`,
          citationId: 'capability_marketing_customer_segment',
          citationLabel: '营销客户分群摘要',
          metadata: { rangeLabel: range.label },
        });
      }
      case 'finance_payment_breakdown': {
        if (/(?:储值卡|储值|会员余额).*(?:消耗|扣减|充值|新充值)/.test(input.question)) {
          const flow = await this.skillRuntime.buildFinanceMemberBalanceFlowSummary({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const consumedTotal = flow.consumedAmount + flow.consumedGiftAmount;
          const rechargeTotal = flow.rechargeAmount + flow.rechargeGiftAmount;
          return this.answer({
            answer: `${range.label}储值消耗 ${consumedTotal.toFixed(2)} 元（本金 ${flow.consumedAmount.toFixed(2)} 元、赠送 ${flow.consumedGiftAmount.toFixed(2)} 元，${flow.consumedCount} 笔）；新充值入账 ${rechargeTotal.toFixed(2)} 元（实充 ${flow.rechargeAmount.toFixed(2)} 元、赠送 ${flow.rechargeGiftAmount.toFixed(2)} 元，${flow.rechargeCount} 笔）。`,
            citationId: 'capability_member_balance_flow_summary',
            citationLabel: '会员储值充值与消耗流水',
            blocks: [{
              kind: 'kpi',
              items: [
                { label: '储值消耗', value: `${consumedTotal.toFixed(2)} 元`, hint: `本金 ${flow.consumedAmount.toFixed(2)} + 赠送 ${flow.consumedGiftAmount.toFixed(2)}，${flow.consumedCount} 笔` },
                { label: '新充值入账', value: `${rechargeTotal.toFixed(2)} 元`, hint: `实充 ${flow.rechargeAmount.toFixed(2)} + 赠送 ${flow.rechargeGiftAmount.toFixed(2)}，${flow.rechargeCount} 笔` },
              ],
              citationIds: ['capability_member_balance_flow_summary'],
            }],
            metadata: {
              rangeLabel: range.label,
              balanceFlowDefinition: {
                rechargeTypes: ['recharge', 'open'],
                consumeTypes: ['deduct', 'consume'],
                totalIncludesGiftAmount: true,
              },
            },
          });
        }
        const requestedMethods = this.requestedPaymentMethods(input.question);
        const requestedDimensions = structuredDefinitionKeys(input.args.dimensions);
        const comparisonRequested = input.answerShape === 'comparison';
        const comparisonRange = comparisonRequested ? this.resolveComparisonRange(input, range) : undefined;
        const groupedPaymentBreakdown = comparisonRequested && !comparisonRange && (
          requestedMethods.length > 1 || requestedDimensions.has('dimension.paymentMethod')
        );
        if (comparisonRequested && !comparisonRange && !groupedPaymentBreakdown) {
          throw new Error('capability_comparison_time_unresolved');
        }
        const comparisonAnswer = comparisonRequested && Boolean(comparisonRange);
        const [analysis, previousAnalysis] = await Promise.all([
          this.skillRuntime.buildFinanceIncomeAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          }),
          comparisonRange
            ? this.skillRuntime.buildFinanceIncomeAnalysis({
                storeId: input.context.storeId,
                startDate: comparisonRange.previous.startDate,
                endDate: comparisonRange.previous.endDate,
              })
            : Promise.resolve(undefined),
        ]);
        const rowsByMethod = new Map(
          analysis.paymentBreakdown.map((item) => [item.method, { ...item }]),
        );
        for (const method of requestedMethods) {
          if (!rowsByMethod.has(method)) rowsByMethod.set(method, { method, amount: 0, count: 0 });
        }
        const paymentRows = [
          ...requestedMethods.flatMap((method) => rowsByMethod.has(method) ? [rowsByMethod.get(method)!] : []),
          ...[...rowsByMethod.values()].filter((item) => !requestedMethods.includes(item.method)),
        ];
        const breakdown = paymentRows
          .map((item) => `${this.paymentMethodLabel(item.method)}：${item.amount.toFixed(2)} 元，共 ${item.count} 笔`)
          .join('；');
        const scalarAnswer = input.answerShape === 'scalar';
        const trendAnswer = input.answerShape === 'trend';
        const paidMetric = structuredDefinitionRef(input.args.metrics, 'metric.paid_amount');
        const comparisonDelta = previousAnalysis ? analysis.totalCollected - previousAnalysis.totalCollected : 0;
        const comparisonRate = previousAnalysis && previousAnalysis.totalCollected !== 0
          ? comparisonDelta / previousAnalysis.totalCollected
          : undefined;
        const comparisonDirection = comparisonDelta > 0 ? '增加' : comparisonDelta < 0 ? '减少' : '持平';
        const comparisonDeltaText = `${this.signed(comparisonDelta, 2)} 元${
          comparisonRate === undefined ? '（上期为 0，无法计算增减比例）' : `（${this.signed(comparisonRate * 100, 1)}%）`
        }`;
        return this.answer({
          answer: comparisonAnswer && comparisonRange && previousAnalysis
            ? `${comparisonRange.current.label}实收 ${analysis.totalCollected.toFixed(2)} 元，${comparisonRange.previous.label}实收 ${previousAnalysis.totalCollected.toFixed(2)} 元，${comparisonDirection} ${Math.abs(comparisonDelta).toFixed(2)} 元${comparisonRate === undefined ? '；上期为 0，无法计算增减比例。' : `，增减幅度 ${this.signed(comparisonRate * 100, 1)}%。`}`
            : trendAnswer
            ? `${range.label}实收趋势已生成，共 ${analysis.dailyTrend.length} 个按日数据点。`
            : scalarAnswer
              ? `${range.label}实收合计 ${analysis.totalCollected.toFixed(2)} 元。`
              : `实收合计 ${analysis.totalCollected.toFixed(2)} 元。${breakdown ? `支付方式拆分：${breakdown}。` : '当前没有支付方式明细。'}`,
          citationId: 'capability_finance_payment_breakdown',
          citationLabel: '财务支付方式拆分',
          citations: [{
            sourceType: 'business_definition',
            sourceId: paidMetric ? `${paidMetric.definitionKey}@${paidMetric.definitionVersion}` : 'metric.paid_amount',
            label: '业务定义：实收金额',
          }],
          blocks: comparisonAnswer && comparisonRange && previousAnalysis
            ? [{
                kind: 'comparison',
                items: [{
                  label: '实收金额',
                  current: `${comparisonRange.current.label} ${analysis.totalCollected.toFixed(2)} 元`,
                  previous: `${comparisonRange.previous.label} ${previousAnalysis.totalCollected.toFixed(2)} 元`,
                  delta: comparisonDeltaText,
                }],
                citationIds: ['capability_finance_payment_breakdown'],
              }]
            : trendAnswer
            ? analysis.dailyTrend.length
              ? [{
                  kind: 'chart',
                  chartType: 'line',
                  rows: analysis.dailyTrend,
                  xKey: 'date',
                  yKeys: ['revenue'],
                  citationIds: ['capability_finance_payment_breakdown'],
                }]
              : []
            : scalarAnswer
              ? [{
                  kind: 'kpi',
                  items: [{ label: `${range.label}实收合计`, value: `${analysis.totalCollected.toFixed(2)} 元` }],
                  citationIds: ['capability_finance_payment_breakdown'],
                }]
              : [{
                  kind: 'ranking',
                  rows: paymentRows.map((item) => ({
                    paymentMethod: this.paymentMethodLabel(item.method),
                    amount: item.amount,
                    count: item.count,
                  })),
                  columns: ['paymentMethod', 'amount', 'count'],
                  citationIds: ['capability_finance_payment_breakdown'],
                }],
          metadata: {
            rangeLabel: range.label,
            comparisonRangeLabel: comparisonRange?.label ?? null,
            answerShape: input.answerShape ?? null,
            totalCollected: analysis.totalCollected,
            previousTotalCollected: previousAnalysis?.totalCollected ?? null,
            comparisonDelta: previousAnalysis ? comparisonDelta : null,
            comparisonRate: comparisonRate ?? null,
            paymentMethodCount: paymentRows.length,
            requestedPaymentMethods: requestedMethods,
          },
        });
      }
      case 'inventory_procurement_advice': {
        const analysis = await this.skillRuntime.buildInventoryProcurementAnalysis({
          storeId: input.context.storeId,
        });
        const suggestions = analysis.suggestions
          .slice(0, this.resolveLimit(input.args.limit, 12))
          .map(
            (item, index) =>
              `${index + 1}. ${item.productName}：当前库存 ${item.currentStock}，安全库存 ${item.safetyStock}，建议采购 ${item.suggestedQty}${
                item.supplierName ? `，候选供应商 ${item.supplierName}` : ''
              }`,
          )
          .join('\n');
        return this.applyDataQualityGuard(this.answer({
          answer: `库存采购建议：共 ${analysis.suggestions.length} 项。${suggestions ? `\n${suggestions}` : '\n当前没有需要采购的商品。'}`,
          citationId: 'capability_inventory_procurement_advice',
          citationLabel: '库存采购建议分析',
          metadata: {
            capabilityKey: 'inventory_procurement_advice',
            rangeLabel: range.label,
            suggestionCount: analysis.suggestions.length,
            recentOrderCount: analysis.recentOrders.length,
            supplierCount: analysis.suppliers.length,
          },
        }), dataQuality);
      }
      default:
        throw new Error(`unsupported_domain_capability:${input.card.key}`);
    }
  }

  private resolveRange(input: BrainCapabilityExecutionInput) {
    const structuredTime = readCapabilityStructuredTime(input.args, input.context.timezone);
    const structuredRange = structuredTime ? structuredTimeUtcRange(structuredTime) : undefined;
    if (structuredRange) {
      return {
        label: structuredRange.label,
        startDate: structuredRange.startDate,
        endDate: new Date(structuredRange.endExclusive.getTime() - 1),
        granularity: 'day' as const,
      };
    }
    const parsedTime = this.timeRangeParser.parse(structuredTime?.label ?? structuredTime?.preset ?? input.question);
    return parsedTime.range ?? defaultBrainDateRange();
  }

  private resolveComparisonRange(input: BrainCapabilityExecutionInput, current: BrainDateRange) {
    const structuredTarget = readCapabilityStructuredComparisonTarget(input.args, input.context.timezone);
    if (structuredTarget) {
      const previous = this.resolveStructuredTimeRange(structuredTarget.timeRange);
      if (!previous) throw new Error('capability_comparison_time_unresolved');
      return {
        label: `${current.label}对比${previous.label}`,
        current,
        previous,
      };
    }
    return this.timeRangeParser.parse(input.question).comparison;
  }

  private previousComparableRange(current: BrainDateRange): BrainDateRange {
    if (current.granularity === 'month') {
      const startDate = new Date(current.startDate.getFullYear(), current.startDate.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastDay = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
      const endDay = Math.min(current.endDate.getDate(), lastDay);
      return {
        label: `${startDate.getMonth() + 1}月同期`,
        startDate,
        endDate: new Date(startDate.getFullYear(), startDate.getMonth(), endDay, 23, 59, 59, 999),
        granularity: 'month',
      };
    }
    const offsets: Partial<Record<BrainDateRange['granularity'], number>> = {
      week: 7,
      quarter: 91,
      year: 365,
    };
    const fixedOffsetDays = offsets[current.granularity];
    if (fixedOffsetDays) {
      const startDate = new Date(current.startDate);
      const endDate = new Date(current.endDate);
      startDate.setDate(startDate.getDate() - fixedOffsetDays);
      endDate.setDate(endDate.getDate() - fixedOffsetDays);
      return { label: '上一可比期', startDate, endDate, granularity: current.granularity };
    }
    const durationMs = Math.max(1, current.endDate.getTime() - current.startDate.getTime() + 1);
    return {
      label: '上一可比期',
      startDate: new Date(current.startDate.getTime() - durationMs),
      endDate: new Date(current.startDate.getTime() - 1),
      granularity: current.granularity,
    };
  }

  private resolveFinanceDiagnosisRange(input: BrainCapabilityExecutionInput, fallback: BrainDateRange): BrainDateRange {
    const structuredTime = readCapabilityStructuredTime(input.args, input.context.timezone);
    const parsedTime = this.timeRangeParser.parse(input.question);
    if (structuredTime || parsedTime.range || parsedTime.comparison) return fallback;
    return this.timeRangeParser.parse('本月').range ?? fallback;
  }

  private buildFinanceDiagnosis(input: {
    risk: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceRiskSummary']>>;
    income: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceIncomeAnalysis']>>;
    cost: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceCostAnalysis']>>;
    previousRisk: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceRiskSummary']>>;
    previousIncome: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceIncomeAnalysis']>>;
    previousCost: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceCostAnalysis']>>;
    currentLabel: string;
    previousLabel: string;
  }) {
    const currentRates = {
      refund: this.rate(input.risk.refundAmount, input.income.totalCollected),
      discount: this.rate(input.risk.discountAmount, input.income.totalCollected),
      material: this.rate(input.cost.materialCost, input.cost.revenue),
      commission: this.rate(input.cost.commissionCost, input.cost.revenue),
      operating: this.rate(input.cost.operatingCost, input.cost.revenue),
    };
    const previousRates = {
      refund: this.rate(input.previousRisk.refundAmount, input.previousIncome.totalCollected),
      discount: this.rate(input.previousRisk.discountAmount, input.previousIncome.totalCollected),
      material: this.rate(input.previousCost.materialCost, input.previousCost.revenue),
      commission: this.rate(input.previousCost.commissionCost, input.previousCost.revenue),
      operating: this.rate(input.previousCost.operatingCost, input.previousCost.revenue),
    };
    const driverDefinitions = [
      { key: 'discount_rate', title: '折扣率上升', current: currentRates.discount, previous: previousRates.discount, detail: '优惠金额占实收比例上升，会直接压缩收入质量。' },
      { key: 'refund_rate', title: '退款率上升', current: currentRates.refund, previous: previousRates.refund, detail: '退款金额占实收比例上升，需要复核退款原因和授权。' },
      { key: 'material_cost_rate', title: '物料成本率上升', current: currentRates.material, previous: previousRates.material, detail: '物料成本占收入比例上升，是毛利承压因素。' },
      { key: 'commission_cost_rate', title: '提成成本率上升', current: currentRates.commission, previous: previousRates.commission, detail: '提成成本占收入比例上升，需要核对项目和员工提成结构。' },
      { key: 'operating_cost_rate', title: '经营费用率上升', current: currentRates.operating, previous: previousRates.operating, detail: '经营费用占收入比例上升，会削弱最终盈利能力。' },
    ];
    const drivers = driverDefinitions
      .flatMap((item) => item.current === undefined || item.previous === undefined
        ? []
        : [{ ...item, delta: item.current - item.previous }])
      .filter((item) => item.delta > 0.005)
      .sort((left, right) => right.delta - left.delta);
    const rawMarginDelta = input.cost.grossMarginRate !== undefined && input.previousCost.grossMarginRate !== undefined
      ? input.cost.grossMarginRate - input.previousCost.grossMarginRate
      : undefined;
    const suspiciousRates = [
      input.cost.grossMarginRate,
      input.previousCost.grossMarginRate,
      ...Object.values(currentRates),
      ...Object.values(previousRates),
    ].filter((value): value is number => value !== undefined && (!Number.isFinite(value) || value < -1 || value > 3));
    const diagnosisReliable = suspiciousRates.length === 0;
    const marginDelta = diagnosisReliable ? rawMarginDelta : undefined;
    const findings: Array<{ title: string; detail: string; severity: 'info' | 'warning' | 'critical' }> = [];
    if (!diagnosisReliable) {
      findings.push({
        title: '基准期财务比例异常',
        detail: '当前期或上一可比期出现超出可信范围的毛利/成本比例，需先复核结算收入、成本归属期和重复记录；本次不据此判定毛利涨跌或根因。',
        severity: 'critical',
      });
    } else if (marginDelta === undefined) {
      findings.push({
        title: '毛利变化无法确认',
        detail: `${input.currentLabel}或${input.previousLabel}缺少有效结算收入与毛利，不能把“毛利下降”判定为事实。`,
        severity: 'critical',
      });
    } else {
      findings.push({
        title: marginDelta < 0 ? '毛利率下降' : marginDelta > 0 ? '毛利率上升' : '毛利率持平',
        detail: `${input.currentLabel}毛利率 ${this.percentage(input.cost.grossMarginRate)}，${input.previousLabel} ${this.percentage(input.previousCost.grossMarginRate)}，变化 ${this.signed(marginDelta * 100, 1)} 个百分点。`,
        severity: marginDelta < 0 ? 'warning' : 'info',
      });
    }
    findings.push(...(diagnosisReliable ? drivers : []).slice(0, 3).map((driver) => ({
      title: driver.title,
      detail: `${driver.detail} 当前 ${this.percentage(driver.current)}，上期 ${this.percentage(driver.previous)}，增加 ${Math.abs(driver.delta * 100).toFixed(1)} 个百分点。`,
      severity: 'warning' as const,
    })));
    if (diagnosisReliable && !drivers.length) {
      findings.push({
        title: '已接入成本项未发现明显恶化',
        detail: '折扣率、退款率、物料成本率、提成成本率和经营费用率均未比上一可比期上升超过 0.5 个百分点。',
        severity: 'info',
      });
    }
    const revenueDelta = input.income.totalCollected - input.previousIncome.totalCollected;
    if (revenueDelta < 0) {
      findings.push({
        title: '实收规模下降',
        detail: `${input.currentLabel}实收较${input.previousLabel}减少 ${Math.abs(revenueDelta).toFixed(2)} 元，固定费用被更少收入分摊时会放大费用率。`,
        severity: 'warning',
      });
    }
    const comparisonItems = [
      this.moneyComparisonItem('实收金额', input.income.totalCollected, input.previousIncome.totalCollected),
      this.rateComparisonItem('毛利率', input.cost.grossMarginRate, input.previousCost.grossMarginRate),
      this.rateComparisonItem('折扣率', currentRates.discount, previousRates.discount),
      this.rateComparisonItem('退款率', currentRates.refund, previousRates.refund),
      this.rateComparisonItem('物料成本率', currentRates.material, previousRates.material),
      this.rateComparisonItem('提成成本率', currentRates.commission, previousRates.commission),
      this.rateComparisonItem('经营费用率', currentRates.operating, previousRates.operating),
    ].flatMap((item) => item ? [item] : []);
    const summary = !diagnosisReliable
      ? '基准期存在异常毛利/成本比例，必须先复核结算与成本归属；本次不输出伪根因。'
      : marginDelta === undefined
        ? '当前或基准期缺少有效毛利结算，本次只展示可验证的成本与风险变化，不输出伪根因。'
      : `毛利率较${input.previousLabel}${marginDelta < 0 ? '下降' : marginDelta > 0 ? '上升' : '持平'} ${Math.abs(marginDelta * 100).toFixed(1)} 个百分点${drivers.length ? `；优先复核${drivers.slice(0, 3).map((item) => item.title.replace('上升', '')).join('、')}。` : '；已接入成本项未发现明显恶化。'}`;
    return {
      summary,
      findings,
      comparisonItems,
      reliable: diagnosisReliable,
      drivers: drivers.map((item) => ({ key: item.key, deltaPercentagePoints: Number((item.delta * 100).toFixed(2)) })),
    };
  }

  private rate(numerator: number, denominator: number) {
    return denominator > 0 ? numerator / denominator : undefined;
  }

  private percentage(value: number | undefined) {
    return value === undefined ? '暂无有效口径' : `${(value * 100).toFixed(1)}%`;
  }

  private moneyComparisonItem(label: string, current: number, previous: number) {
    return {
      label,
      current: `${current.toFixed(2)} 元`,
      previous: `${previous.toFixed(2)} 元`,
      delta: `${this.signed(current - previous, 2)} 元`,
    };
  }

  private rateComparisonItem(label: string, current: number | undefined, previous: number | undefined) {
    if (current === undefined || previous === undefined) return undefined;
    return {
      label,
      current: this.percentage(current),
      previous: this.percentage(previous),
      delta: `${this.signed((current - previous) * 100, 1)} 个百分点`,
    };
  }

  private resolveStructuredTimeRange(time: ReturnType<typeof readCapabilityStructuredTime>): BrainDateRange | undefined {
    if (!time) return undefined;
    const explicitRange = structuredTimeUtcRange(time);
    if (explicitRange) {
      return {
        label: explicitRange.label,
        startDate: explicitRange.startDate,
        endDate: new Date(explicitRange.endExclusive.getTime() - 1),
        granularity: 'day',
      };
    }
    return this.timeRangeParser.parse(time.label || time.preset || '').range;
  }

  private buildTargetKpis(
    operations: Awaited<ReturnType<BrainSkillRuntimeService['buildManagerOperationsAnalysis']>>,
    appointmentCount: number,
  ): Array<{ label: string; value: string; hint?: string }> {
    if (!operations.target) return [];
    return [
      this.targetKpi('营收目标完成率', operations.revenue, operations.target.revenueTarget, '元'),
      this.targetKpi('预约目标完成率', appointmentCount, operations.target.appointmentTarget, '个'),
      this.targetKpi('新客目标完成率', operations.newCustomerCount, operations.target.newCustomerTarget, '人'),
    ];
  }

  private targetKpi(label: string, actual: number, target: number, unit: string) {
    if (target <= 0) return { label, value: '未设置', hint: `当前 ${actual.toFixed(2)} ${unit}` };
    const rate = actual / target;
    const remaining = Math.max(target - actual, 0);
    return {
      label,
      value: `${(rate * 100).toFixed(1)}%`,
      hint: remaining > 0 ? `还差 ${remaining.toFixed(2)} ${unit}` : `已超目标 ${Math.max(actual - target, 0).toFixed(2)} ${unit}`,
    };
  }

  private buildOperationsComparisonItems(input: {
    operations: Awaited<ReturnType<BrainSkillRuntimeService['buildManagerOperationsAnalysis']>>;
    reception: Awaited<ReturnType<BrainSkillRuntimeService['buildReceptionOperationsSnapshot']>>;
    finance: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceRiskSummary']>>;
    previousOperations: Awaited<ReturnType<BrainSkillRuntimeService['buildManagerOperationsAnalysis']>>;
    previousReception: Awaited<ReturnType<BrainSkillRuntimeService['buildReceptionOperationsSnapshot']>>;
    previousFinance: Awaited<ReturnType<BrainSkillRuntimeService['buildFinanceRiskSummary']>>;
  }): Array<{ label: string; current: string; previous: string; delta: string }> {
    return [
      this.moneyComparison('实收', input.operations.revenue, input.previousOperations.revenue),
      this.countComparison('订单', input.operations.orderCount, input.previousOperations.orderCount, '单'),
      this.countComparison('客户', input.operations.customerCount, input.previousOperations.customerCount, '人'),
      this.moneyComparison('客单价', input.operations.avgTransaction, input.previousOperations.avgTransaction),
      this.countComparison('预约', input.reception.total, input.previousReception.total, '个'),
      this.countComparison('新客', input.operations.newCustomerCount, input.previousOperations.newCustomerCount, '人'),
      this.moneyComparison('退款', input.finance.refundAmount, input.previousFinance.refundAmount),
      this.countComparison('退款笔数', input.finance.refundCount, input.previousFinance.refundCount, '笔'),
    ];
  }

  private moneyComparison(label: string, current: number, previous: number) {
    return {
      label,
      current: `${current.toFixed(2)} 元`,
      previous: `${previous.toFixed(2)} 元`,
      delta: `${this.signed(current - previous, 2)} 元`,
    };
  }

  private countComparison(label: string, current: number, previous: number, unit: string) {
    return {
      label,
      current: `${current} ${unit}`,
      previous: `${previous} ${unit}`,
      delta: `${this.signed(current - previous, 0)} ${unit}`,
    };
  }

  private buildDailyComparisonRows(
    current: Array<{ date: string; revenue: number }>,
    previous: Array<{ date: string; revenue: number }>,
    currentRange?: BrainDateRange,
    previousRange?: BrainDateRange,
  ) {
    const currentByDate = new Map(current.map((item) => [item.date, item.revenue]));
    const previousByDate = new Map(previous.map((item) => [item.date, item.revenue]));
    const alignedDates = currentRange && previousRange
      ? this.alignedComparisonDates(currentRange, previousRange)
      : Array.from({ length: Math.max(current.length, previous.length) }, (_, index) => ({
          currentDate: current[index]?.date ?? '',
          previousDate: previous[index]?.date ?? '',
        }));
    return alignedDates.map(({ currentDate, previousDate }) => {
      const currentRevenue = currentByDate.get(currentDate) ?? 0;
      const previousRevenue = previousByDate.get(previousDate) ?? 0;
      const delta = currentRevenue - previousRevenue;
      return {
        day: this.weekdayLabel(currentDate || previousDate),
        currentDate,
        currentRevenue,
        previousDate,
        previousRevenue,
        delta: `${this.signed(delta, 2)} 元`,
        absoluteDelta: Math.abs(delta),
      };
    })
      .sort((left, right) => right.absoluteDelta - left.absoluteDelta)
      .map(({ absoluteDelta: _absoluteDelta, ...row }) => row);
  }

  private alignedComparisonDates(current: BrainDateRange, previous: BrainDateRange) {
    const currentStart = this.shanghaiDateKey(current.startDate);
    const currentEnd = this.shanghaiDateKey(current.endDate);
    const previousStart = this.shanghaiDateKey(previous.startDate);
    const dayCount = Math.max(1, this.dateKeyDifference(currentStart, currentEnd) + 1);
    return Array.from({ length: dayCount }, (_, index) => ({
      currentDate: this.addDateKeyDays(currentStart, index),
      previousDate: this.addDateKeyDays(previousStart, index),
    }));
  }

  private shanghaiDateKey(value: Date) {
    return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  private dateKeyDifference(start: string, end: string) {
    return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
  }

  private addDateKeyDays(value: string, days: number) {
    return new Date(Date.parse(`${value}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
  }

  private weekdayLabel(value?: string) {
    if (!value) return '无日期';
    const day = new Date(`${value}T12:00:00.000Z`).getUTCDay();
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day] ?? value;
  }

  private signed(value: number, digits: number) {
    const normalized = Math.abs(value) < 10 ** -digits / 2 ? 0 : value;
    return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`;
  }

  private assertStructuredArgsSupported(input: BrainCapabilityExecutionInput) {
    if (Array.isArray(input.args.filters) && input.args.filters.length) {
      throw new Error(`domain_filter_args_unsupported:${input.card.key}`);
    }
    if (Array.isArray(input.args.orderBy) && input.args.orderBy.length) this.assertOrderArgsSupported(input);
    if (
      input.args.comparisonTarget !== undefined &&
      !['store_operations_overview', 'finance_payment_breakdown'].includes(input.card.key)
    ) {
      throw new Error(`domain_comparison_args_unsupported:${input.card.key}`);
    }
    if (
      input.card.key !== 'customer_facts' &&
      structuredEntityMentions(input.args as BrainCapabilityToolArgs).some(
        (entity) => entity.entityKey && entity.entityKey !== entity.entityType,
      )
    ) {
      throw new Error(`domain_entity_filter_args_unsupported:${input.card.key}`);
    }
  }

  private assertOrderArgsSupported(input: BrainCapabilityExecutionInput) {
    const definitionKeys = new Set(input.card.definitionRefs.map((ref) => ref.definitionKey));
    const valid = (input.args.orderBy as unknown[]).every((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const order = value as Record<string, unknown>;
      if (
        order.direction !== 'desc' &&
        !(input.card.key === 'manager_staff_overview' && order.direction === 'asc')
      ) return false;
      const definitionRef = order.definitionRef;
      if (!definitionRef || typeof definitionRef !== 'object' || Array.isArray(definitionRef)) return false;
      const definitionKey = (definitionRef as Record<string, unknown>).definitionKey;
      return typeof definitionKey === 'string' && definitionKeys.has(definitionKey);
    });
    if (!valid) throw new Error(`domain_order_args_unsupported:${input.card.key}`);
  }

  private orderManagerStaffRows<T extends {
    staff: string;
    performanceScore: number;
    serviceCount: number;
    uniqueCustomerCount: number;
    customerRepurchaseRate: number;
    commissionAmount: number;
  }>(
    rows: T[],
    orderBy: unknown,
    question: string,
  ): T[] {
    const order = Array.isArray(orderBy) && orderBy[0] && typeof orderBy[0] === 'object'
      ? orderBy[0] as Record<string, unknown>
      : undefined;
    const definitionRef = order?.definitionRef && typeof order.definitionRef === 'object' && !Array.isArray(order.definitionRef)
      ? order.definitionRef as Record<string, unknown>
      : undefined;
    const definitionKey = String(
      definitionRef?.definitionKey ?? this.resolveManagerStaffFocusMetric(new Set<string>(), question) ?? '',
    );
    const direction = order?.direction === 'asc' ? 1 : -1;
    return [...rows].sort((left, right) => {
      if (definitionKey === 'dimension.beauticianName') {
        return direction * left.staff.localeCompare(right.staff, 'zh-CN');
      }
      if (definitionKey === 'metric.staff_performance_score') {
        return direction * (left.performanceScore - right.performanceScore) || left.staff.localeCompare(right.staff, 'zh-CN');
      }
      if (definitionKey === 'metric.staff_service_count') {
        return direction * (left.serviceCount - right.serviceCount) || left.staff.localeCompare(right.staff, 'zh-CN');
      }
      if (definitionKey === 'metric.staff_unique_customer_count') {
        return direction * (left.uniqueCustomerCount - right.uniqueCustomerCount) || left.staff.localeCompare(right.staff, 'zh-CN');
      }
      if (definitionKey === 'metric.staff_customer_repurchase_rate') {
        return direction * (left.customerRepurchaseRate - right.customerRepurchaseRate) || left.staff.localeCompare(right.staff, 'zh-CN');
      }
      if (definitionKey === 'metric.staff_commission_amount') {
        return direction * (left.commissionAmount - right.commissionAmount) || left.staff.localeCompare(right.staff, 'zh-CN');
      }
      return right.serviceCount - left.serviceCount || right.performanceScore - left.performanceScore || left.staff.localeCompare(right.staff, 'zh-CN');
    });
  }

  private resolveManagerStaffFocusMetric(metricKeys: Set<string>, question: string): string | undefined {
    for (const key of [
      'metric.staff_customer_repurchase_rate',
      'metric.staff_commission_amount',
      'metric.staff_unique_customer_count',
      'metric.staff_service_count',
      'metric.staff_performance_score',
    ]) {
      if (metricKeys.has(key)) return key;
    }
    if (/复购率/.test(question)) return 'metric.staff_customer_repurchase_rate';
    if (/提成/.test(question)) return 'metric.staff_commission_amount';
    if (/(接的客人|接客人数|服务客户)/.test(question)) return 'metric.staff_unique_customer_count';
    if (/服务次数|服务量/.test(question)) return 'metric.staff_service_count';
    if (/业绩|表现/.test(question)) return 'metric.staff_performance_score';
    return undefined;
  }

  private managerStaffMetricLabel(metricKey: string) {
    const labels: Record<string, string> = {
      'metric.staff_customer_repurchase_rate': '员工客户复购率',
      'metric.staff_commission_amount': '员工提成金额',
      'metric.staff_unique_customer_count': '员工服务客户数',
      'metric.staff_service_count': '员工服务次数',
      'metric.staff_performance_score': '员工表现评分',
    };
    return labels[metricKey] ?? metricKey;
  }

  private managerStaffFocusedAnswer(
    rangeLabel: string,
    rows: Array<{
      staff: string;
      customerRepurchaseRate: number;
      repeatCustomerCount: number;
      uniqueCustomerCount: number;
      commissionAmount: number;
      serviceCount: number;
      performanceScore: number;
    }>,
    metricKey: string | undefined,
  ) {
    const top = rows[0];
    if (!top || !metricKey) return undefined;
    if (metricKey === 'metric.staff_customer_repurchase_rate') {
      return `${rangeLabel}客户复购率最高的是 ${top.staff}，复购率 ${(top.customerRepurchaseRate * 100).toFixed(1)}%（重复服务客户 ${top.repeatCustomerCount} 人 / 独立服务客户 ${top.uniqueCustomerCount} 人）。`;
    }
    if (metricKey === 'metric.staff_commission_amount') {
      return `${rangeLabel}提成最高的是 ${top.staff}，提成 ${top.commissionAmount.toFixed(2)} 元。`;
    }
    if (metricKey === 'metric.staff_unique_customer_count') {
      return `${rangeLabel}服务客户数最多的是 ${top.staff}，共 ${top.uniqueCustomerCount} 位独立客户。`;
    }
    if (metricKey === 'metric.staff_service_count') {
      return `${rangeLabel}服务次数最多的是 ${top.staff}，共 ${top.serviceCount} 次。`;
    }
    if (metricKey === 'metric.staff_performance_score') {
      return `${rangeLabel}综合表现分最高的是 ${top.staff}，表现分 ${top.performanceScore.toFixed(1)}。`;
    }
    return undefined;
  }

  private requestedPaymentMethods(question: string): string[] {
    const methods: string[] = [];
    const add = (method: string) => {
      if (!methods.includes(method)) methods.push(method);
    };
    if (/现金(?!流)/.test(question)) add('cash');
    if (/微信/.test(question)) add('wechat');
    if (/支付宝/.test(question)) add('alipay');
    if (/银行卡|刷卡/.test(question)) add('card');
    if (/储值|余额/.test(question)) add('member_balance');
    return methods;
  }

  private paymentMethodLabel(method: string): string {
    return ({
      cash: '现金',
      wechat: '微信',
      alipay: '支付宝',
      card: '银行卡',
      member_balance: '储值余额',
    } as Record<string, string>)[method] ?? method;
  }

  private resolveLimit(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, 100) : fallback;
  }

  private resolveDraftTimeWindow(question: string, rangeLabel: string) {
    const explicit = question.match(/(?:今天|明天|后天|本周|下周|周[一二三四五六日天])?(?:上午|下午|晚上|晚间|空档)/)?.[0]?.trim();
    if (explicit) return explicit;
    return rangeLabel && !/全部|默认/.test(rangeLabel) ? rangeLabel : undefined;
  }

  private applyDataQualityGuard(answer: BrainDomainAnswer, assessment?: BrainDataQualityAssessment): BrainDomainAnswer {
    if (!assessment || assessment.status === 'trusted') return answer;
    const blocked = new Set(assessment.blockedFacts);
    const existingLimitations: string[] = [];
    const blocks = (answer.blocks ?? []).flatMap<BrainResponseBlock>((block) => {
      if (block.kind === 'limitations') {
        existingLimitations.push(...block.items);
        return [];
      }
      if (block.kind === 'kpi') {
        const hiddenLabels = new Set<string>();
        if (blocked.has('current_in_store')) hiddenLabels.add('当前在店');
        if (blocked.has('service_overrun')) {
          hiddenLabels.add('服务超时');
          hiddenLabels.add('受影响预约');
        }
        if (blocked.has('service_task_status')) {
          hiddenLabels.add('服务任务');
          hiddenLabels.add('已完成');
        }
        if (blocked.has('stock_risk')) hiddenLabels.add('低库存 SKU');
        if (blocked.has('procurement_advice')) {
          hiddenLabels.add('采购建议');
          hiddenLabels.add('候选供应商');
        }
        const items = block.items.filter((item) => !hiddenLabels.has(item.label));
        return items.length ? [{ ...block, items }] : [];
      }
      if (
        block.kind === 'table' &&
        ((blocked.has('staff_live_state') && block.columns.includes('status') && block.columns.includes('staff')) ||
          (blocked.has('procurement_advice') && block.columns.includes('suggestedQty')))
      ) {
        return [];
      }
      if (block.kind === 'diagnosis') {
        const findings = block.findings.filter((finding) => {
          if (blocked.has('service_overrun') && finding.title.includes('服务超时')) return false;
          if (blocked.has('stock_risk') && finding.title.includes('低于安全库存')) return false;
          return true;
        });
        return findings.length ? [{ ...block, findings }] : [];
      }
      return [block];
    });
    const limitations = [...new Set([...existingLimitations, ...assessment.limitations])];
    blocks.push({ kind: 'limitations', items: limitations });
    const procurementBlocked = blocked.has('procurement_advice') && answer.metadata?.capabilityKey === 'inventory_procurement_advice';
    return {
      ...answer,
      answer: procurementBlocked
        ? `当前不能生成完整库存采购建议。数据质量限制：${assessment.limitations.join('；')}`
        : `${answer.answer}\n数据质量限制：${assessment.limitations.join('；')}`,
      blocks,
      citations: [
        ...answer.citations,
        ...Object.entries(assessment.ruleCounts).map(([ruleKey, count]) => ({
          sourceType: 'inspection_finding',
          sourceId: ruleKey,
          label: `${count} 条开放数据质量问题`,
        })),
      ],
      metadata: { ...answer.metadata, dataQuality: assessment },
    };
  }

  private executeDeclared(
    key: (typeof CAPABILITY_KEYS)[number],
    args: BrainCapabilityToolArgs,
    input: BrainCapabilityExecutionInput,
  ) {
    if (input.card.key !== key) throw new Error(`capability_contract_key_mismatch:${key}:${input.card.key}`);
    return this.execute({ ...input, args });
  }

  private isPackageAudienceQuestion(question: string, objective: unknown) {
    const text = `${question} ${typeof objective === 'string' ? objective : ''}`;
    return /(?:高端|护理|套餐|项目).*(?:推广|推荐|适合|匹配).*(?:客户|客群)|(?:客户|客群).*(?:适合|匹配).*(?:高端|护理|套餐|项目)/.test(text);
  }

  private async buildMarketingPackageAudience(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    if (!this.marketing || !this.prisma) {
      return {
        status: 'failed',
        answer: '当前营销推荐事实服务未接入，本次不生成泛化客户名单。',
        citations: [],
        grounding: 'none',
        metadata: { capabilityKey: 'marketing_growth_overview', failureCode: 'MARKETING_RECOMMENDATION_UNAVAILABLE' },
      };
    }
    const limit = this.resolveLimit(input.args.limit, 10);
    const recommendations = await this.marketing.getRecommendations(input.context.storeId, { limit: 20 }) as unknown as MarketingPackageRecommendation[];
    const recommendation = recommendations.find((item) =>
      item?.triggerType === 'vip_privilege_care' ||
      item?.category === 'ltv-nurture' ||
      (Array.isArray(item?.recommendedItems) && item.recommendedItems.some((candidate) =>
        candidate?.type === 'package' || /高端|护理|套餐/.test(String(candidate?.name ?? '')),
      )),
    );
    let audience: MarketingPackageAudienceProfile[] = [];
    let recommendationAudienceFallback = false;
    if (recommendation) {
      try {
        audience = await this.marketing.getRecommendationAudience(
          Number(recommendation.id),
          input.context.storeId,
        ) as unknown as MarketingPackageAudienceProfile[];
      } catch {
        // Dynamic recommendation cards can outlive the legacy fixed-ID audience lookup.
        recommendationAudienceFallback = true;
      }
    }
    const projects = await this.prisma.project.findMany({
      where: { storeId: input.context.storeId, deletedAt: null, status: 'active', online: true },
      select: { id: true, name: true, price: true, recommend: true, type: { select: { name: true } } },
      orderBy: [{ recommend: 'desc' }, { price: 'desc' }, { sort: 'asc' }],
      take: 3,
    });
    const fallbackCustomers = audience.length
      ? []
      : await this.prisma.customer.findMany({
          where: { storeId: input.context.storeId, deletedAt: null, totalSpent: { gt: 0 } },
          select: { id: true, name: true, memberLevel: true, totalSpent: true, visitCount: true, lastVisitDate: true },
          orderBy: [{ totalSpent: 'desc' }, { visitCount: 'desc' }],
          take: limit,
        });
    const customers: MarketingPackageAudienceRow[] = audience.length
      ? audience.slice(0, limit).map((item) => ({
          customerName: String(item.name ?? '未命名客户'),
          memberLevel: String(item.segment ?? item.memberLevel ?? '普通会员'),
          totalSpent: Number(item.totalSpent ?? 0),
          matchReason: String(item.matchReason ?? recommendation?.reason ?? '高价值客户经营推广初筛'),
        }))
      : fallbackCustomers.map((item) => ({
          customerName: item.name,
          memberLevel: item.memberLevel,
          totalSpent: Number(item.totalSpent),
          matchReason: '按当前门店累计消费与到店次数排序，作为高端护理推广初筛名单。',
        }));
    const packageNames = [
      ...(Array.isArray(recommendation?.recommendedItems)
        ? recommendation.recommendedItems.map((item) => String(item?.name ?? '')).filter(Boolean)
        : []),
      ...projects.map((project) => project.name),
    ].filter((name, index, values) => values.indexOf(name) === index).slice(0, 3);
    const customerCitation = audience.length
      ? { sourceType: 'db_skill', sourceId: `marketing_recommendation:${recommendation?.id}`, label: '营销高价值客户推荐受众' }
      : { sourceType: 'db_skill', sourceId: 'customer_value_fallback', label: '客户累计消费与到店次数初筛' };
    const citations = [
      customerCitation,
      ...(recommendation
        ? [{ sourceType: 'db_skill', sourceId: `marketing_recommendation_card:${recommendation.id}`, label: '营销推荐卡与套餐建议' }]
        : []),
      { sourceType: 'db_skill', sourceId: 'active_high_value_projects', label: '当前门店在售护理项目' },
    ];
    const customerLines = customers.length
      ? customers.map((item, index) => `${index + 1}. ${item.customerName}（${item.memberLevel}，累计消费 ${item.totalSpent.toFixed(2)} 元）：${item.matchReason}`).join('\n')
      : '当前没有符合已治理高价值客群规则的客户。';
    return {
      status: 'completed',
      answer: `适合优先评估的客户：\n${customerLines}\n可结合的高端护理/套餐：${packageNames.join('、') || '当前门店未配置可用高端护理项目'}。\n${recommendationAudienceFallback ? '数据说明：当前推荐卡受众映射不可用，客户名单已降级为按累计消费与到店次数初筛。\n' : ''}说明：这是基于高 LTV、会员等级、消费与营销响应的经营推广匹配，不是肤质或医疗适应症结论；发送前仍需顾问复核客户禁忌和具体项目适配。`,
      citations,
      grounding: 'db_skill',
      blocks: [
        {
          kind: 'table',
          rows: customers,
          columns: ['customerName', 'memberLevel', 'totalSpent', 'matchReason'],
          citationIds: [customerCitation.sourceId],
        },
        {
          kind: 'ranking',
          rows: projects.map((project) => ({
            projectName: project.name,
            projectType: project.type?.name ?? '',
            price: Number(project.price),
            recommended: project.recommend,
          })),
          columns: ['projectName', 'projectType', 'price', 'recommended'],
          citationIds: ['active_high_value_projects'],
        },
        {
          kind: 'limitations',
          items: [
            '名单仅用于经营推广初筛；不得替代健康禁忌、肤质评估和顾问确认，也不会自动发送营销消息。',
            ...(recommendationAudienceFallback ? ['推荐卡受众映射不可用，本次客户名单采用累计消费与到店次数降级口径。'] : []),
          ],
        },
      ],
      metadata: {
        capabilityKey: 'marketing_growth_overview',
        mode: 'package_audience',
        recommendationId: recommendation?.id ?? null,
        recommendationAudienceFallback,
        customerCount: customers.length,
        projectIds: projects.map((project) => project.id),
        completionCriteria: ['customer_audience_loaded', 'active_projects_loaded', 'limitations_disclosed'],
      },
    };
  }

  private answer(input: {
    answer: string;
    citationId: string;
    citationLabel: string;
    citations?: BrainDomainAnswer['citations'];
    metadata: Record<string, unknown>;
    blocks?: BrainDomainAnswer['blocks'];
  }): BrainDomainAnswer {
    return {
      status: 'completed',
      answer: input.answer,
      citations: [
        { sourceType: 'db_skill', sourceId: input.citationId, label: input.citationLabel },
        ...(input.citations ?? []),
      ],
      grounding: 'db_skill',
      ...(input.blocks ? { blocks: input.blocks } : {}),
      metadata: input.metadata,
    };
  }
}

function structuredDefinitionKeys(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const definitionKey = (item as Record<string, unknown>).definitionKey;
    return typeof definitionKey === 'string' ? [definitionKey] : [];
  }));
}

function isCustomerIdentityClarification(answer: string) {
  return (
    answer.includes('请提供客户姓名或手机号后四位') ||
    (answer.includes('找到 ') && answer.includes('请补充完整姓名或手机号后四位后继续'))
  );
}

function structuredDefinitionRef(value: unknown, definitionKey: string) {
  if (!Array.isArray(value)) return undefined;
  return value.find((item): item is { definitionKey: string; definitionVersion: number } => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return record.definitionKey === definitionKey && Number.isInteger(record.definitionVersion);
  });
}
