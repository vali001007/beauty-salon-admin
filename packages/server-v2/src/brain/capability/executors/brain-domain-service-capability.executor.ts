import { Injectable, Optional } from '@nestjs/common';
import { BrainTimeRangeParserService, type BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { BrainCustomerFactResolverService } from '../../domain/brain-customer-fact-resolver.service.js';
import { extractCustomerPhoneTail, extractSpecificCustomerNameFromMention } from '../../domain/brain-customer-identity.js';
import { defaultBrainDateRange } from '../../domain/brain-domain-formatters.js';
import { MarketingService } from '../../../marketing/marketing.service.js';
import { CustomerLifecycleOntologyService } from '../../../marketing/customer-lifecycle-ontology.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CustomerFeedbackService } from '../../../customer-feedback/customer-feedback.service.js';
import { CustomerWaitingService } from '../../../reservations/customer-waiting.service.js';
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
  return extractSpecificCustomerNameFromMention(entity.mention) || extractCustomerPhoneTail(entity.mention)
    ? entity.mention
    : undefined;
}

const CAPABILITY_KEYS = [
  'store_operations_overview',
  'manager_staff_overview',
  'customer_feedback_overview',
  'customer_waiting_loss_overview',
  'front_desk_operations_overview',
  'beautician_service_overview',
  'beautician_material_preparation',
  'beautician_customer_card_progress',
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
    @Optional() private readonly customerFeedback?: CustomerFeedbackService,
    @Optional() private readonly customerWaiting?: CustomerWaitingService,
    @Optional() private readonly customerLifecycle?: CustomerLifecycleOntologyService,
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
      '今天有没有什么需要我特别注意的风险',
      '今天有没有需要我马上处理的紧急事项',
      '今天最大的一笔消费是多少',
      '这周有没有哪天特别差，为什么',
    ],
    negativeExamples: ['帮我直接修改本月经营目标', '查询其他门店的经营数据'],
    synonyms: ['经营概览', '经营总结', '店里情况', '门店经营诊断', '经营对比', '目标完成率', '客单价', '美容师忙闲', '新客老客到店', '今日风险', '紧急事项'],
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
    description: '按当前门店和时间范围分析美容师服务次数、独立客户数、客户复购率、业绩、提成、请假时长、排班忙闲和可用空档，支持按用户明确指定的员工指标排行、对比和工作饱和度诊断。试用期、转正待办和客户归属变更没有后台事实闭环时必须明确拒答，不得用通用员工排行替代。客户投诉与满意度由专用客户反馈能力处理。',
    intents: ['query', 'ranking', 'comparison', 'diagnosis'],
    examples: [
      '哪个美容师接的客人最多',
      '各美容师今天的排班情况，有没有空档',
      '帮我看一下各美容师的服务次数对比',
      '帮我看一下员工这周的工作饱和度',
      '谁的客户复购率最高',
      '这个月提成最高的是谁，大概多少',
      '本月员工总提成大概多少',
      '今天谁请假了，有没有影响接待',
      '有没有员工这周业绩明显下滑',
      '新员工试用期表现怎么样',
      '有没有员工到期转正需要我处理',
      '有没有员工的客户被别的美容师挖走的迹象',
    ],
    negativeExamples: ['查看其他门店员工数据', '直接修改员工排班或提成', '最近有没有客户投诉或者表达不满'],
    synonyms: ['员工运营分析', '美容师服务排行', '美容师接客排行', '员工服务次数对比', '员工客户复购率排行', '员工提成排行', '员工排班空档', '员工工作饱和度', '员工业绩下滑', '员工转正待办', '客户归属流转'],
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
    key: 'customer_feedback_overview',
    name: '客户投诉与满意度分析',
    description: '基于统一客户服务反馈事实，查询当前门店投诉、未解决投诉、满意度、评价采集覆盖率和美容师客诉排行。无反馈记录时必须同时披露采集覆盖率，不得把未采集解释为没有投诉。',
    intents: ['query', 'ranking', 'trend', 'diagnosis'],
    examples: [
      '最近有没有客户投诉或者表达不满',
      '帮我看一下客户满意度整体情况',
      '哪个美容师的客诉最多，最近有没有',
      '本月还有多少投诉没有解决',
    ],
    negativeExamples: ['查看其他门店的客户投诉', '直接删除客户投诉记录', '帮我评价新员工试用期表现'],
    synonyms: ['客户投诉', '客户不满', '负面反馈', '客户满意度', '客诉排行', '差评', '服务评价'],
    businessDefinitionKeys: [
      'metric.customer_complaint_count',
      'metric.customer_unresolved_complaint_count',
      'metric.customer_average_satisfaction_rating',
      'metric.customer_feedback_collection_coverage_rate',
      'metric.staff_customer_complaint_count',
      'entity.customer',
      'entity.beautician',
      'dimension.beauticianName',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:customer:view'],
    allowedRoles: ['store_manager', 'customer_service'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  customerFeedbackOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('customer_feedback_overview', args, input);
  }

  @BrainCapability({
    key: 'customer_waiting_loss_overview',
    name: '客户等待流失分析',
    description: '基于统一客户等待事实，查询当前门店等待中、已服务、离店、因等待过久离店和等待记录采集覆盖率。没有结构化离店原因或采集覆盖不足时必须披露缺口，不得用取消预约或爽约替代等待流失。',
    intents: ['query', 'diagnosis'],
    examples: ['最近有没有客户因为等待时间长而离开', '本月有多少客户等太久走了', '今天还有多少客户在等待'],
    negativeExamples: ['查询其他门店客户等待记录', '把取消预约都算成等待流失', '直接给等待客户发补偿'],
    synonyms: ['等待流失', '等太久离店', '等待过久离开', '排队离店', '客户等待情况'],
    businessDefinitionKeys: [
      'metric.customer_long_wait_departure_count',
      'metric.customer_waiting_collection_coverage_rate',
      'entity.customer',
      'entity.reservation',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations'],
    allowedRoles: ['store_manager', 'receptionist'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  customerWaitingLossOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('customer_waiting_loss_overview', args, input);
  }

  @BrainCapability({
    key: 'front_desk_operations_overview',
    name: '前台现场运营概览',
    description: '查询当前门店预约现场事实，支持待到店、已到店、待确认、指定客户、指定美容师、指定时点、首个/下一个/最后一个预约、项目分类、预约日期排行、员工忙闲、到店率、爽约率和服务超时。名单题必须返回客户、时间和项目，不用预约总数或通用概览替代。',
    intents: ['query', 'diagnosis'],
    examples: ['今天前台现场情况怎么样', '帮我搜一下今天预约了但还没来的客人', '今天下午还有几个预约没到', '有没有预约了但还没确认的客人', '下午3点那个预约是谁，有什么要注意的', '今天赵美容师的预约安排', '今天下午最后一个预约是几点，是谁', '今天有几个预约是做面部的，几个是身体的', '有没有预约超过两小时没有确认的', '这个月预约最多的是哪几天', '有哪些服务超时会影响后面的客户'],
    negativeExamples: ['直接替我修改客户预约', '查询其他门店的预约情况', '判断客户是否因为等待时间长而离开', '预测哪些客户一定会爽约', '确认预约通知是否已经送达'],
    synonyms: ['前台概览', '现场运营', '预约到店情况', '待到店客户', '已到店客户', '待确认预约', '下一个预约', '最后一个预约', '预约分类', '预约日期排行', '预约爽约率', '到店率', '员工忙闲', '服务超时', '接待能力'],
    businessDefinitionKeys: ['entity.reservation', 'entity.customer', 'dimension.customerName', 'dimension.projectName'],
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
    description: '仅基于当前登录账号绑定的美容师身份，查询个人预约客户、开始与结束时间、首个/下一个/最后一个预约、预约间空档、计划服务时长、取消记录、首次到店、提前到店、上次服务项目、客户注意事项、个人业绩、提成和项目排行。未绑定美容师档案时失败关闭，绝不退化为全店数据。',
    intents: ['query', 'diagnosis', 'recommendation'],
    examples: ['我今天有几个客人，分别几点', '下一个客人是谁，做什么项目', '我今天第一个客人几点来', '今天最后一个客人几点结束', '我今天有没有空档，几点到几点', '下一个客人上次做了什么，有没有什么特殊要求', '今天我总共要服务几个小时', '有没有客人取消了', '我今天的客人里有没有首次来的新客', '今天有没有客人提前到了在等我', '我这周的预约安排', '帮我看一下今天客人的上次服务记录', '今天有没有安排我去做培训或其他任务', '我今天的客人里有没有 VIP 需要特别对待', '下一个客人最近情绪状态怎么样，需要特别关心吗'],
    negativeExamples: ['查看其他美容师的客户过敏史', '直接替我修改客户护理记录', '查询培训或非预约任务安排', '推断客户情绪状态'],
    synonyms: ['我的服务安排', '美容师工作台', '我的预约客户', '我的空档', '我的取消预约', '我的业绩', '我的提成', '下一位客户', '最后一位客户', '服务注意事项', '个人项目排行'],
    businessDefinitionKeys: [
      'entity.reservation',
      'entity.customer',
      'entity.project',
      'entity.beautician',
      'dimension.customerName',
      'dimension.projectName',
      'metric.staff_service_count',
      'metric.staff_unique_customer_count',
      'metric.staff_commission_amount',
      'metric.staff_performance_score',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations', 'core:brain:beautician-view'],
    allowedRoles: ['beautician'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  beauticianServiceOverview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('beautician_service_overview', args, input);
  }

  @BrainCapability({
    key: 'beautician_material_preparation',
    name: '美容师预约标准用料准备',
    description: '仅基于当前登录美容师的有效预约和项目 BOM，汇总计划使用的产品、耗材、标准数量及对应项目。没有 BOM 时明确列出缺口，不用商品销量或库存排行替代。',
    intents: ['query'],
    examples: ['我今天要用到什么产品和耗材', '今天的预约需要准备哪些产品', '按我的预约汇总标准用料'],
    negativeExamples: ['哪些商品卖得最多', '查询商品销售排行', '直接扣减库存', '替我确认实际耗材用量'],
    synonyms: ['今日用料准备', '预约耗材清单', '项目标准用料', '护理产品准备'],
    businessDefinitionKeys: ['entity.product'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations', 'core:brain:beautician-view'],
    allowedRoles: ['beautician'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  beauticianMaterialPreparation(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('beautician_material_preparation', args, input);
  }

  @BrainCapability({
    key: 'beautician_customer_card_progress',
    name: '美容师预约客户卡项进度',
    description: '仅基于当前登录美容师的预约客户和有效 CustomerCard，查询卡项总次数、已用次数、剩余次数和到期日。没有统一续卡阈值或项目推荐规则时只展示事实，不自动判定必须续卡。',
    intents: ['query', 'recommendation'],
    examples: ['下一个客人的疗程做到哪一步了', '她的疗程做了几次了，还有几次', '今天有没有需要我帮客人续卡或者推荐项目的'],
    negativeExamples: ['直接替客户续卡', '修改卡项剩余次数', '查看非本人预约客户的卡项'],
    synonyms: ['客户疗程进度', '预约客户卡项余次', '下一个客户剩余次数', '卡项到期'],
    businessDefinitionKeys: ['entity.customer'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations', 'core:brain:beautician-view'],
    allowedRoles: ['beautician'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  beauticianCustomerCardProgress(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('beautician_customer_card_progress', args, input);
  }

  @BrainCapability({
    key: 'inventory_operations_overview',
    name: '库存采购运营概览',
    description: '组合库存金额、低库存、临期批次、库存消耗、采购建议、供应商和最近采购单，返回只读库存运营诊断。',
    intents: ['query', 'ranking', 'diagnosis', 'recommendation'],
    examples: ['本月库存有什么风险', '现在哪些产品库存不够了', '哪些产品该补货了', '临期和低库存商品怎么处理', '有没有快过期的产品，数量多少', '有什么产品积压太久了', '最近采购了什么，花了多少钱', '哪些耗材消耗速度最快', '有没有哪个项目因为缺耗材没法做', '这个月产品销售额是多少'],
    negativeExamples: ['直接创建采购单', '修改商品当前库存'],
    synonyms: ['库存概览', '库存风险', '采购建议', '低库存', '临期库存', '快过期产品', '库存积压', '产品积压', '慢周转库存'],
    businessDefinitionKeys: [
      'entity.product',
      'entity.project',
      'dimension.productId',
      'dimension.productName',
      'dimension.projectName',
      'metric.stock_risk_score',
      'metric.inventory_consumption_quantity',
      'metric.product_sales_amount',
    ],
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
      '这个月退货了多少，原因是什么',
      '有没有产品卖出去的价格低于成本的',
      '哪些产品毛利率最高',
      '今天折扣优惠送出去多少钱',
      '收入成本退款有哪些异常',
      '给我看支付方式和毛利情况',
      '有没有大额异常退款我不知道的',
      '最近毛利掉下来的主要原因是什么',
      '查一下毛利异常是折扣、成本还是项目结构造成的',
    ],
    negativeExamples: [
      '直接修改结算数据',
      '查看其他门店的财务数据',
      '有没有项目成本明显上涨影响毛利的',
    ],
    synonyms: ['财务概览', '财务风险', '收入成本分析', '退款优惠风险', '退款原因', '商品毛利排行', '低于成本销售', '大额异常退款', '会员卡负债', '毛利下降', '利润率变差', '盈利能力下降', '不赚钱', '毛利根因', '项目结构影响'],
    businessDefinitionKeys: [
      'metric.paid_amount',
      'metric.refund_amount',
      'metric.refund_count',
      'metric.discount_amount',
      'metric.operating_cost_amount',
      'metric.product_gross_margin_rate',
      'metric.product_below_cost_sale_count',
      'entity.product',
      'entity.payment_record',
      'entity.product_order',
      'entity.project',
      'dimension.projectName',
      'dimension.productId',
      'dimension.productName',
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
      'dimension.customerId',
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
    name: '门店预约清单',
    description: '按服务端解析的时间范围查询当前门店预约，支持指定客户、指定美容师、上午/下午、指定时点、待确认、首个/下一个/最后一个预约、项目分类和预约日期排行，返回客户、项目、美容师、状态、开始与结束时间，不执行创建、改期或取消。',
    intents: ['query'],
    examples: ['今天有哪些预约', '明天下午预约清单', '现在几点了，下一个预约是谁，什么时候', '张美丽的预约是几点，做什么项目', '帮我看一下今天赵美容师的预约安排', '有没有预约了但还没确认的客人', '有没有预约超过两小时没有确认的', '今天下午最后一个预约是几点，是谁', '今天有几个预约是做面部的，几个是身体的', '这个月预约最多的是哪几天'],
    negativeExamples: ['直接帮我改期', '取消这个预约', '查询其他门店预约', '确认通知是否送达', '预测客户一定会爽约'],
    synonyms: ['预约清单', '预约排期', '下一个预约', '第一个预约', '最后一个预约', '预约安排', '时段预约', '待确认预约', '预约分类', '预约日期排行'],
    businessDefinitionKeys: ['entity.reservation', 'entity.customer', 'entity.project', 'entity.beautician', 'dimension.customerName', 'dimension.projectName'],
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
    description: '查询当前门店的精确客户事实、VIP、新老客、周期新客转化、到店年龄画像、沉睡客户、沉睡客户触达后的预约/到店/消费唤醒迹象、生日关怀、重要客户到店、营销活动响应、办卡未预约、低余次卡、开卡未核销、高价值低活跃客户、客户复购率、平均回访间隔，以及消费频率或消费金额明显下降的客户名单。定性客群使用已治理默认口径执行并在答案中披露，不要求用户选择内部阈值。',
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
      '哪些沉睡客户最近有点被唤醒的迹象',
      '帮我找一下办了卡但还没预约的新客',
      '这个月新客主要来自什么渠道',
      '最近哪个时间段新客最多，从哪些渠道来',
      '最近新客转化效果好不好，问题出在哪',
      '上个月新来了多少新客，转化了多少',
      '有没有次卡即将过期但客户还有很多余量',
      '帮我看一下今天到店客人的画像，主要是什么年龄段',
      '帮我查一下张女士的客户资料',
    ],
    negativeExamples: ['查询其他门店的客户名单', '直接修改客户会员等级'],
    synonyms: ['客户事实', '客户名单', '沉睡客户', '沉睡客户唤醒迹象', '客户回流信号', '触达后预约客户', '触达后到店客户', '触达后消费客户', '未到店客户', '长期未消费客户', 'VIP 客户', '生日关怀客户', '重要到店客户', '活动响应客户', '办卡未预约客户', '低余次卡客户', '次卡临期高余量客户', '次卡低使用客户', '开卡未核销客户', '老客回头率', '平均回访间隔', '高价值低活跃客户', '消费频率下降客户', '消费金额下降客户', '新客来源渠道', '新客转化', '到店年龄画像'],
    businessDefinitionKeys: [
      'entity.customer',
      'entity.reservation',
      'entity.project',
      'entity.beautician',
      'dimension.customerId',
      'dimension.customerName',
      'dimension.customerSource',
      'dimension.customerAgeGroup',
      'dimension.projectName',
      'dimension.beauticianName',
      'metric.new_customer_count',
      'metric.new_customer_conversion_count',
      'metric.new_customer_conversion_rate',
      'metric.dormant_reactivation_customer_count',
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
    description: '基于当前门店客户、订单、项目类型、优惠和客户卡事实，返回营销分群摘要或消费分层、优惠敏感、基础项目未升单、疗程续购等具体客户名单。',
    intents: ['query', 'diagnosis'],
    examples: [
      '本月客户可以分成哪些营销人群',
      'VIP 和沉睡客户分别有多少人',
      '帮我把客户按消费金额分一下层',
      '有没有客户对优惠很敏感，老是等打折才来',
      '帮我找一下只做过基础项目没有升单的客户',
      '疗程快结束的客户有多少，适合推续购',
      '新客中哪些人最有潜力转成长期客户',
      '有没有客户对某个项目特别感兴趣但还没办卡',
    ],
    negativeExamples: ['直接给沉睡客户群发消息', '查看其他门店的客户分群', '查询未处理客户投诉', '判断会员权益使用后的满意度'],
    synonyms: ['客户分群', '营销客群', 'VIP客户分层', '沉睡客户分层', '消费金额分层', '优惠敏感客户', '基础项目未升单客户', '疗程续购客户', '新客长期潜力', '项目兴趣未办卡'],
    businessDefinitionKeys: ['entity.customer', 'entity.project', 'dimension.customerId', 'dimension.customerName'],
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
      '今天现金收了多少，微信支付宝各多少',
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
    examples: ['哪些商品需要补货，建议采购多少', '给我一份当前库存采购建议', '最近采购了什么，花了多少钱'],
    negativeExamples: ['直接创建并提交采购单', '修改商品安全库存'],
    synonyms: ['采购建议', '补货建议', '采购清单', '库存补货'],
    businessDefinitionKeys: ['entity.product', 'dimension.productId', 'dimension.productName', 'metric.stock_risk_score'],
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
        if (/(?:等待时间长|等待过久|久等).*(?:离开|走了|流失)|(?:离开|走了|流失).*(?:等待时间长|等待过久|久等)/.test(input.question)) {
          const limitation = '当前等待流失事实表尚未迁移并采集真实数据，无法判断客户是否因等待时间长而离开。Ami Brain 不会用预约取消、爽约、经营概览或普通备注替代离店原因。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'store_operations_overview',
              unsupportedReason: 'customer_waiting_departure_fact_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        if (/(?:特别注意).*(?:风险)|(?:马上处理|紧急事项)|(?:风险).*(?:马上处理|优先处理)/.test(input.question)) {
          const expiringBefore = new Date(range.endDate.getTime() + 30 * 86_400_000);
          const [reception, finance, inventory, overrun] = await Promise.all([
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
            this.skillRuntime.buildInventoryRiskSummary({ storeId: input.context.storeId, expiringBefore }),
            this.skillRuntime.buildReceptionServiceOverrunAnalysis({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
              timezone: input.context.timezone,
            }),
          ]);
          const availableStaffCount = reception.staff.filter((item) => item.available && !item.onTimeOff).length;
          const findings = [
            ...(overrun.impactedCount > 0 ? [{
              title: '服务超时影响后续预约',
              detail: `${range.label}有 ${overrun.overrunCount} 个服务超时，影响 ${overrun.impactedCount} 个后续预约。`,
              severity: 'critical' as const,
            }] : []),
            ...(reception.pendingArrival > 0 && availableStaffCount === 0 ? [{
              title: '接待能力不足',
              detail: `${range.label}有 ${reception.pendingArrival} 位客户待到店，当前没有可接待员工。`,
              severity: 'critical' as const,
            }] : []),
            ...(inventory.lowStockProducts.length > 0 ? [{
              title: '低库存待复核',
              detail: `${inventory.lowStockProducts.length} 个 SKU 低于安全库存：${inventory.lowStockProducts.slice(0, 3).map((item) => item.name).join('、')}。`,
              severity: 'warning' as const,
            }] : []),
            ...(inventory.expiringStockValue > 0 ? [{
              title: '临期库存待处理',
              detail: `未来 30 天临期库存估算金额 ${inventory.expiringStockValue.toFixed(2)} 元。`,
              severity: 'warning' as const,
            }] : []),
            ...(finance.grossMarginRate !== undefined && finance.grossMarginRate > 0 && finance.grossMarginRate < 0.4 ? [{
              title: '毛利率低于预警线',
              detail: `${range.label}毛利率 ${(finance.grossMarginRate * 100).toFixed(1)}%，低于 40% 预警线。`,
              severity: 'warning' as const,
            }] : []),
            ...(finance.refundAmount > 0 ? [{
              title: '退款待复核',
              detail: `${range.label}退款 ${finance.refundCount} 笔、合计 ${finance.refundAmount.toFixed(2)} 元。`,
              severity: 'warning' as const,
            }] : []),
            ...(reception.noShow >= 2 && reception.noShowRate >= 0.2 ? [{
              title: '爽约率偏高',
              detail: `${range.label}爽约 ${reception.noShow} 人，爽约率 ${(reception.noShowRate * 100).toFixed(1)}%。`,
              severity: 'warning' as const,
            }] : []),
          ];
          const limitation = '本摘要只覆盖当前已接入的预约接待、服务超时、财务退款/毛利和库存风险；设备、消防、客户反馈、服务事故等未落地事实不会被推断为无风险。';
          const answer = findings.length
            ? `${range.label}发现 ${findings.length} 项需要优先处理的已证实事项：${findings.map((item, index) => `${index + 1}. ${item.title}：${item.detail}`).join(' ')} ${limitation}`
            : `${range.label}在已接入事实范围内没有发现需要马上处理的事项。${limitation}`;
          return this.applyDataQualityGuard({
            status: 'completed',
            answer,
            citations: [
              { sourceType: 'db_skill', sourceId: 'reception_operations_snapshot', label: '预约到店与员工忙闲快照' },
              { sourceType: 'db_skill', sourceId: 'reception_service_overrun_analysis', label: '服务超时影响分析' },
              { sourceType: 'db_skill', sourceId: 'finance_risk_summary', label: '退款、优惠与毛利风险' },
              { sourceType: 'db_skill', sourceId: 'inventory_risk_summary', label: '低库存与临期批次风险' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '需优先处理', value: `${findings.length} 项` },
                  { label: '待到店', value: `${reception.pendingArrival} 人` },
                  { label: '可接待员工', value: `${availableStaffCount} 人` },
                  { label: '低库存', value: `${inventory.lowStockProducts.length} 个 SKU` },
                ],
                citationIds: ['reception_operations_snapshot', 'inventory_risk_summary'],
              },
              ...(findings.length ? [{ kind: 'diagnosis' as const, findings, citationIds: ['reception_operations_snapshot', 'reception_service_overrun_analysis', 'finance_risk_summary', 'inventory_risk_summary'] }] : []),
              { kind: 'limitations', items: [limitation] },
            ],
            metadata: {
              capabilityKey: 'store_operations_overview',
              answerScope: 'current_supported_urgent_risk_summary',
              rangeLabel: range.label,
              findingCount: findings.length,
              coverageDomains: ['reservation', 'service_overrun', 'finance', 'inventory'],
              completionCriteria: ['supported_risks_loaded', 'unsupported_domains_disclosed'],
            },
          }, dataQuality);
        }
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
        if (/(试用期|转正|新员工.*表现)/.test(input.question)) {
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
        if (/(?:客户.*(?:被|让).*(?:别的|其他).*(?:美容师|员工).*(?:挖走|转走)|挖走.*客户|客户归属.*(?:变更|流转))/.test(input.question)) {
          const limitation = '当前后台没有客户归属历史、归属变更事件或转移原因事实闭环，无法判断客户是否被其他美容师挖走。Ami Brain 不会用当前客户归属、员工业绩或接客排行反推历史流转。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'manager_staff_overview',
              unsupportedReason: 'customer_ownership_history_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        if (/(?:业绩|实收).*(?:明显)?(?:下滑|下降)|(?:下滑|下降).*(?:业绩|实收)/.test(input.question)) {
          const durationMs = Math.max(1, range.endDate.getTime() - range.startDate.getTime() + 1);
          const previousEndDate = new Date(range.startDate.getTime() - 1);
          const previousStartDate = new Date(previousEndDate.getTime() - durationMs + 1);
          const [current, previous] = await Promise.all([
            this.skillRuntime.buildManagerStaffAnalysis({ storeId: input.context.storeId, startDate: range.startDate, endDate: range.endDate }),
            this.skillRuntime.buildManagerStaffAnalysis({ storeId: input.context.storeId, startDate: previousStartDate, endDate: previousEndDate }),
          ]);
          const previousById = new Map(previous.staff.map((staff) => [staff.beauticianId, staff]));
          const rows = current.staff
            .map((staff) => {
              const previousStaff = previousById.get(staff.beauticianId);
              const previousRevenue = previousStaff?.revenueAmount ?? 0;
              const declineRate = previousRevenue > 0 ? (previousRevenue - staff.revenueAmount) / previousRevenue : 0;
              return {
                staff: staff.name,
                currentRevenue: staff.revenueAmount,
                previousRevenue,
                changeAmount: staff.revenueAmount - previousRevenue,
                declineRate,
              };
            })
            .filter((staff) => staff.previousRevenue > 0 && staff.currentRevenue < staff.previousRevenue && staff.declineRate >= 0.3)
            .sort((left, right) => right.declineRate - left.declineRate || right.previousRevenue - left.previousRevenue);
          const answer = rows.length
            ? `${range.label}发现 ${rows.length} 位员工业绩较上一同长度周期下降 30% 以上：${rows.map((staff) => `${staff.staff} 下降 ${(staff.declineRate * 100).toFixed(1)}%（${staff.previousRevenue.toFixed(2)} -> ${staff.currentRevenue.toFixed(2)} 元）`).join('；')}。`
            : `${range.label}未发现员工业绩较上一同长度周期下降 30% 以上。判断基于有效订单实收，并排除上一周期实收为 0 的员工。`;
          return {
            status: 'completed',
            answer,
            citations: [{ sourceType: 'db_skill', sourceId: 'manager_staff_revenue_comparison', label: '员工当前期与上一期业绩对比' }],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'text',
                text: answer,
                citationIds: ['manager_staff_revenue_comparison'],
              },
              {
                kind: 'comparison',
                items: rows.length
                  ? rows.map((staff) => ({
                      label: staff.staff,
                      current: `${staff.currentRevenue.toFixed(2)} 元`,
                      previous: `${staff.previousRevenue.toFixed(2)} 元`,
                      delta: `${(staff.declineRate * 100).toFixed(1)}%`,
                    }))
                  : [{ label: '明显下滑员工数', current: '0 人', previous: '判定阈值 30%', delta: '未发现' }],
                citationIds: ['manager_staff_revenue_comparison'],
              },
              {
                kind: 'table',
                rows: rows.map((staff) => ({ ...staff, declineRate: `${(staff.declineRate * 100).toFixed(1)}%` })),
                columns: ['staff', 'currentRevenue', 'previousRevenue', 'changeAmount', 'declineRate'],
                citationIds: ['manager_staff_revenue_comparison'],
              },
            ],
            metadata: {
              capabilityKey: 'manager_staff_overview',
              answerScope: 'staff_revenue_decline_comparison',
              rangeLabel: range.label,
              previousStartDate: previousStartDate.toISOString(),
              previousEndDate: previousEndDate.toISOString(),
              declineThreshold: 0.3,
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
        const commissionTotalQuestion = /(?:总提成|提成(?:合计|总共|一共)|提成.*(?:多少|金额))/.test(input.question) &&
          !/(?:最高|最低|谁|哪个|哪位|排行|排名|对比)/.test(input.question);
        if (focusMetric === 'metric.staff_commission_amount' && commissionTotalQuestion) {
          const totalCommission = rows.reduce((sum, item) => sum + item.commissionAmount, 0);
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: `${range.label}员工提成合计 ${totalCommission.toFixed(2)} 元，共覆盖 ${rows.length} 位美容师。`,
            citations,
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '员工提成合计', value: `${totalCommission.toFixed(2)} 元`, hint: `${rows.length} 位美容师` }],
                citationIds: citations.map((item) => item.sourceId),
              },
              {
                kind: 'table',
                rows: visibleRows.map((item) => ({ staff: item.staff, commissionAmount: item.commissionAmount })),
                columns: ['staff', 'commissionAmount'],
                citationIds: ['manager_staff_analysis'],
              },
            ],
            metadata: {
              capabilityKey: 'manager_staff_overview',
              answerScope: 'staff_commission_total',
              rangeLabel: range.label,
              staffCount: rows.length,
              totalCommission,
              focusMetric,
              completionCriteria: ['staff_commission_total_loaded'],
            },
          }, dataQuality);
        }
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
      case 'customer_feedback_overview': {
        if (!this.customerFeedback) {
          return {
            status: 'failed',
            answer: '客户反馈事实服务未接入，本次不推断投诉或满意度。',
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: ['客户反馈事实服务未接入'] }],
            metadata: {
              capabilityKey: 'customer_feedback_overview',
              failureCode: 'CUSTOMER_FEEDBACK_SERVICE_UNAVAILABLE',
            },
          };
        }
        const result = await this.customerFeedback.analytics(input.context.storeId, {
          startDate: range.startDate.toISOString(),
          endDate: range.endDate.toISOString(),
        });
        const summary = result.summary;
        const coverageText = `评价采集覆盖率 ${(summary.collectionCoverageRate * 100).toFixed(1)}%（${summary.linkedServiceTaskCount}/${summary.completedServiceTaskCount} 个已完成服务）`;
        const coverageLimitation = summary.completedServiceTaskCount > 0 && summary.collectionCoverageRate < 0.8
          ? `当前${coverageText}，未记录不代表客户没有不满。`
          : undefined;
        const citations = [
          { sourceType: 'db_skill', sourceId: 'customer_service_feedback_summary', label: '客户投诉与满意度统一事实' },
          { sourceType: 'db_skill', sourceId: 'customer_service_feedback_by_staff', label: '美容师客户反馈聚合' },
        ];
        const isStaffRanking = /(?:哪个|哪位|谁|美容师|员工).*(?:客诉|投诉|差评).*(?:最多|排行|排名)|(?:客诉|投诉|差评).*(?:最多|排行|排名).*(?:美容师|员工|谁)/.test(input.question);
        const isSatisfaction = /满意度|满意评价|评分|星级/.test(input.question);
        if (isStaffRanking) {
          const rows = result.staff.slice(0, this.resolveLimit(input.args.limit, 10));
          const leader = rows[0];
          const answer = leader && leader.complaintCount > 0
            ? `${range.label}${leader.beauticianName}的客诉最多，共 ${leader.complaintCount} 条，其中 ${leader.unresolvedComplaintCount} 条未解决。${coverageText}。`
            : `${range.label}已录入反馈中没有关联到美容师的投诉。${coverageText}。`;
          return {
            status: 'completed',
            answer: coverageLimitation ? `${answer}\n${coverageLimitation}` : answer,
            citations,
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'ranking',
                rows,
                columns: ['beauticianName', 'complaintCount', 'unresolvedComplaintCount', 'averageRating', 'ratedFeedbackCount'],
                citationIds: ['customer_service_feedback_by_staff'],
              },
              ...(coverageLimitation ? [{ kind: 'limitations' as const, items: [coverageLimitation] }] : []),
            ],
            metadata: {
              capabilityKey: 'customer_feedback_overview',
              answerScope: 'staff_complaint_ranking',
              rangeLabel: range.label,
              collectionCoverageRate: summary.collectionCoverageRate,
              completionCriteria: ['customer_feedback_loaded', 'staff_complaints_ranked', 'coverage_disclosed'],
            },
          };
        }
        if (isSatisfaction) {
          const satisfactionText = summary.ratedFeedbackCount > 0 && summary.averageRating !== null
            ? `${range.label}客户平均满意度为 ${summary.averageRating.toFixed(1)}/5，共采集 ${summary.ratedFeedbackCount} 条评分，其中 ${summary.lowRatingCount} 条为 1-2 星低分。`
            : `${range.label}尚未采集到可计算满意度的评分记录。`;
          return {
            status: 'completed',
            answer: `${satisfactionText}${coverageText}。${coverageLimitation ? `\n${coverageLimitation}` : ''}`,
            citations,
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '平均满意度', value: summary.averageRating === null ? '未采集' : `${summary.averageRating.toFixed(1)} / 5` },
                  { label: '有效评分', value: `${summary.ratedFeedbackCount} 条` },
                  { label: '低分评价', value: `${summary.lowRatingCount} 条` },
                  { label: '评价覆盖率', value: `${(summary.collectionCoverageRate * 100).toFixed(1)}%` },
                ],
                citationIds: ['customer_service_feedback_summary'],
              },
              ...(coverageLimitation ? [{ kind: 'limitations' as const, items: [coverageLimitation] }] : []),
            ],
            metadata: {
              capabilityKey: 'customer_feedback_overview',
              answerScope: 'satisfaction_summary',
              rangeLabel: range.label,
              collectionCoverageRate: summary.collectionCoverageRate,
              completionCriteria: ['satisfaction_loaded', 'coverage_disclosed'],
            },
          };
        }
        const complaintAnswer = summary.complaintCount > 0
          ? `${range.label}共录入 ${summary.complaintCount} 条客户投诉或不满，其中 ${summary.unresolvedComplaintCount} 条尚未解决。${coverageText}。`
          : `${range.label}已录入反馈中没有投诉记录。${coverageText}。`;
        return {
          status: 'completed',
          answer: coverageLimitation ? `${complaintAnswer}\n${coverageLimitation}` : complaintAnswer,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '投诉', value: `${summary.complaintCount} 条` },
                { label: '待解决投诉', value: `${summary.unresolvedComplaintCount} 条` },
                { label: '反馈总数', value: `${summary.feedbackCount} 条` },
                { label: '评价覆盖率', value: `${(summary.collectionCoverageRate * 100).toFixed(1)}%` },
              ],
              citationIds: ['customer_service_feedback_summary'],
            },
            ...(coverageLimitation ? [{ kind: 'limitations' as const, items: [coverageLimitation] }] : []),
          ],
          metadata: {
            capabilityKey: 'customer_feedback_overview',
            answerScope: 'complaint_summary',
            rangeLabel: range.label,
            collectionCoverageRate: summary.collectionCoverageRate,
            completionCriteria: ['complaints_loaded', 'unresolved_complaints_loaded', 'coverage_disclosed'],
          },
        };
      }
      case 'customer_waiting_loss_overview': {
        if (!this.customerWaiting) {
          return {
            status: 'failed',
            answer: '客户等待事实服务未接入，本次不推断等待流失。',
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: ['客户等待事实服务未接入'] }],
            metadata: { capabilityKey: 'customer_waiting_loss_overview', failureCode: 'CUSTOMER_WAITING_SERVICE_UNAVAILABLE' },
          };
        }
        const result = await this.customerWaiting.analytics(input.context.storeId, {
          startDate: range.startDate.toISOString(),
          endDate: range.endDate.toISOString(),
        });
        const summary = result.summary;
        const coverageText = `等待记录覆盖率 ${(summary.collectionCoverageRate * 100).toFixed(1)}%（${summary.linkedReservationCount}/${summary.checkedInReservationCount} 个到店预约）`;
        const coverageLimitation = summary.checkedInReservationCount > 0 && summary.collectionCoverageRate < 0.8
          ? `当前${coverageText}，未记录不代表客户没有等待或离店。`
          : undefined;
        const answer = summary.longWaitDepartureCount > 0
          ? `${range.label}有 ${summary.longWaitDepartureCount} 位客户明确记录为因等待过久离店；全部原因离店 ${summary.leftCount} 位。${coverageText}。`
          : `${range.label}已记录等待事实中没有“等待过久离店”。${coverageText}。`;
        const citations = [
          { sourceType: 'db_skill', sourceId: 'customer_waiting_summary', label: '客户等待与离店统一事实' },
          { sourceType: 'db_skill', sourceId: 'customer_long_wait_departures', label: '等待过久离店明细' },
        ];
        return {
          status: 'completed',
          answer: coverageLimitation ? `${answer}\n${coverageLimitation}` : answer,
          citations,
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '等待过久离店', value: `${summary.longWaitDepartureCount} 人` },
                { label: '全部原因离店', value: `${summary.leftCount} 人` },
                { label: '当前等待', value: `${summary.activeWaitingCount} 人` },
                { label: '平均等待', value: summary.averageWaitMinutes === null ? '暂无完整记录' : `${summary.averageWaitMinutes.toFixed(1)} 分钟` },
                { label: '记录覆盖率', value: `${(summary.collectionCoverageRate * 100).toFixed(1)}%` },
              ],
              citationIds: ['customer_waiting_summary'],
            },
            ...(result.longWaitDepartures.length
              ? [{
                  kind: 'table' as const,
                  rows: result.longWaitDepartures.slice(0, this.resolveLimit(input.args.limit, 20)),
                  columns: ['customerName', 'actualWaitMinutes', 'expectedWaitMinutes', 'startedAt', 'endedAt', 'reasonNote'],
                  citationIds: ['customer_long_wait_departures'],
                }]
              : []),
            ...(coverageLimitation ? [{ kind: 'limitations' as const, items: [coverageLimitation] }] : []),
          ],
          metadata: {
            capabilityKey: 'customer_waiting_loss_overview',
            answerScope: 'waiting_loss_summary',
            rangeLabel: range.label,
            collectionCoverageRate: summary.collectionCoverageRate,
            completionCriteria: ['waiting_facts_loaded', 'long_wait_departures_loaded', 'coverage_disclosed'],
          },
        };
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
        const focusedReservationAnswer = this.buildFocusedReservationAnswer(schedule, input, range, citations);
        if (focusedReservationAnswer) return this.applyDataQualityGuard(this.ensureAnswerTextBlock(focusedReservationAnswer), dataQuality);
        if (/(?:预约了|有预约|预约).*(?:还没来|未到店|待到店)|(?:还没来|未到店|待到店).*(?:客人|客户)/.test(input.question)) {
          const rows = snapshot.pendingCustomers.slice(0, this.resolveLimit(input.args.limit, 20));
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: rows.length
              ? `${range.label}有 ${snapshot.pendingArrival} 位已预约待到店客户：${rows.map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName}，${item.projectName}`).join('；')}。`
              : `${range.label}没有已预约待到店客户。`,
            citations,
            grounding: 'db_skill',
            blocks: [{ kind: 'table', rows, columns: ['startTime', 'customerName', 'projectName', 'status'], citationIds: ['reception_operations_snapshot'] }],
            metadata: {
              capabilityKey: 'front_desk_operations_overview',
              answerScope: 'pending_arrival_customer_list',
              rangeLabel: range.label,
              pendingArrival: snapshot.pendingArrival,
              completionCriteria: ['pending_arrival_customers_loaded'],
            },
          }, dataQuality);
        }
        if (/(?:所有|全部|今天).*(?:到店客人|到店客户).*(?:基本信息|名单|情况)|(?:到店客人|到店客户).*(?:基本信息|名单)/.test(input.question)) {
          const rows = snapshot.arrivedCustomers.slice(0, this.resolveLimit(input.args.limit, 20));
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: rows.length
              ? `${range.label}已到店 ${snapshot.checkedIn} 位客户：${rows.map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName}，${item.projectName}`).join('；')}。`
              : `${range.label}没有已记录到店客户。`,
            citations,
            grounding: 'db_skill',
            blocks: [{ kind: 'table', rows, columns: ['startTime', 'customerName', 'projectName', 'status'], citationIds: ['reception_operations_snapshot'] }],
            metadata: {
              capabilityKey: 'front_desk_operations_overview',
              answerScope: 'arrived_customer_list',
              rangeLabel: range.label,
              checkedIn: snapshot.checkedIn,
              completionCriteria: ['arrived_customers_loaded'],
            },
          }, dataQuality);
        }
        if (/(?:超过|超出|超负荷|超载).*(?:接待能力|接待承载)|(?:接待能力|接待承载).*(?:不足|不够|超过|超出)/.test(input.question)) {
          const availableStaffCount = snapshot.staff.filter((staff) => staff.available && !staff.onTimeOff).length;
          const overloaded = overrun.impactedCount > 0 || (snapshot.pendingArrival > 0 && availableStaffCount === 0);
          const answer = overloaded
            ? `${range.label}存在接待承载风险：服务超时 ${overrun.overrunCount} 个，受影响预约 ${overrun.impactedCount} 个，待到店 ${snapshot.pendingArrival} 人，当前可接待员工 ${availableStaffCount} 人。`
            : `${range.label}未发现超过当前接待能力的证据：有效预约 ${snapshot.total} 个，服务超时 ${overrun.overrunCount} 个，受影响预约 ${overrun.impactedCount} 个，待到店 ${snapshot.pendingArrival} 人，当前可接待员工 ${availableStaffCount} 人。`;
          return this.applyDataQualityGuard({
            status: 'completed',
            answer,
            citations,
            grounding: 'db_skill',
            blocks: [
              { kind: 'text', text: answer, citationIds: citations.map((citation) => citation.sourceId) },
              {
                kind: 'kpi',
                items: [
                  { label: '有效预约', value: `${snapshot.total} 个` },
                  { label: '待到店', value: `${snapshot.pendingArrival} 人` },
                  { label: '可接待员工', value: `${availableStaffCount} 人` },
                  { label: '受影响预约', value: `${overrun.impactedCount} 个` },
                ],
                citationIds: citations.map((citation) => citation.sourceId),
              },
            ],
            metadata: {
              capabilityKey: 'front_desk_operations_overview',
              answerScope: 'reception_capacity_diagnosis',
              rangeLabel: range.label,
              overloaded,
              availableStaffCount,
              overloadRule: 'impacted_reservation_or_pending_arrival_without_available_staff',
            },
          }, dataQuality);
        }
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
        const focusedServiceAnswer = this.buildFocusedBeauticianAnswer(services, input, range, citations);
        if (focusedServiceAnswer) return this.applyDataQualityGuard(this.ensureAnswerTextBlock(focusedServiceAnswer), dataQuality);
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
      case 'beautician_material_preparation': {
        const services = await this.skillRuntime.buildBeauticianServiceSummary({
          storeId: input.context.storeId,
          userId: input.context.userId,
          startDate: range.startDate,
          endDate: range.endDate,
          timezone: input.context.timezone,
          includeMaterialPlan: true,
        });
        const citation = { sourceType: 'db_skill', sourceId: 'beautician_project_bom_material_plan', label: '当前美容师预约项目与标准 BOM 用料' };
        const plan = services.materialPlan;
        const missingProjects = services.bomMissingProjects;
        const limitation = missingProjects.length
          ? `以下预约项目尚未配置项目 BOM：${missingProjects.join('、')}，其用料未计入。`
          : '数量是项目 BOM 的标准计划用量，实际操作用量仍需服务时确认。';
        const answer = plan.length
          ? `${range.label}按 ${services.bomCoveredReservationCount}/${services.serviceCount} 个有 BOM 的有效预约汇总，需要准备：${plan.map((item) => `${item.productName} ${item.requiredQty}${item.unit}`).join('；')}。${limitation}`
          : `${range.label}没有可汇总的项目 BOM 用料。${limitation}`;
        return this.applyDataQualityGuard({
          status: 'completed',
          answer,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            { kind: 'text', text: answer, citationIds: [citation.sourceId] },
            { kind: 'table', rows: plan.map((item) => ({ productName: item.productName, requiredQty: item.requiredQty, unit: item.unit, projectNames: item.projectNames.join('、') })), columns: ['productName', 'requiredQty', 'unit', 'projectNames'], citationIds: [citation.sourceId] },
            { kind: 'limitations', items: [limitation] },
          ],
          metadata: {
            capabilityKey: 'beautician_material_preparation',
            answerScope: 'beautician_material_preparation',
            rangeLabel: range.label,
            serviceCount: services.serviceCount,
            bomCoveredReservationCount: services.bomCoveredReservationCount,
            missingBomProjectCount: missingProjects.length,
            identitySource: 'server_context_user',
            completionCriteria: ['personal_reservations_loaded', 'project_bom_loaded', 'standard_materials_aggregated'],
          },
        }, dataQuality);
      }
      case 'beautician_customer_card_progress': {
        const services = await this.skillRuntime.buildBeauticianServiceSummary({
          storeId: input.context.storeId,
          userId: input.context.userId,
          startDate: range.startDate,
          endDate: range.endDate,
          timezone: input.context.timezone,
          includeCustomerCards: true,
        });
        const citation = { sourceType: 'db_skill', sourceId: 'beautician_reservation_customer_cards', label: '当前美容师预约客户有效卡项' };
        const nextOnly = /下一个|下一位|疗程做到|做了几次|还有几次/.test(input.question);
        const selected = nextOnly ? this.nextBeauticianItems(services.nextTasks, input.context.timezone).slice(0, 1) : services.nextTasks;
        const cardRows = selected.flatMap((item) => item.cards.map((card) => ({
          customerName: item.customerName,
          appointmentTime: item.appointmentTime,
          cardName: card.cardName,
          usedTimes: card.usedTimes,
          totalTimes: card.totalTimes,
          remainingTimes: card.remainingTimes,
          expiryDate: this.formatDateOnly(card.expiryDate, input.context.timezone),
        })));
        const recommendationRequested = /续卡|推荐项目/.test(input.question);
        const limitation = recommendationRequested
          ? '统一续卡阈值与项目推荐规则尚未发布，因此只展示卡项余次和到期日，不自动判定必须续卡或推荐具体项目。'
          : '卡项进度按 CustomerCard 总次数与剩余次数计算，不推断护理阶段名称。';
        const answer = selected.length === 0
          ? `${range.label}没有后续预约客户，无法查询卡项进度。`
          : cardRows.length
            ? `${selected.map((item) => item.customerName).join('、')}的有效卡项：${cardRows.map((card) => `${card.cardName}已用 ${card.usedTimes}/${card.totalTimes} 次，剩余 ${card.remainingTimes} 次，到期日 ${card.expiryDate}`).join('；')}。${limitation}`
            : `${selected.map((item) => item.customerName).join('、')}当前没有有效卡项记录。${limitation}`;
        return this.applyDataQualityGuard({
          status: 'completed',
          answer,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            { kind: 'text', text: answer, citationIds: [citation.sourceId] },
            { kind: 'table', rows: cardRows, columns: ['customerName', 'appointmentTime', 'cardName', 'usedTimes', 'totalTimes', 'remainingTimes', 'expiryDate'], citationIds: [citation.sourceId] },
            { kind: 'limitations', items: [limitation] },
          ],
          metadata: {
            capabilityKey: 'beautician_customer_card_progress',
            answerScope: nextOnly ? 'beautician_next_customer_card_progress' : 'beautician_customer_card_facts',
            rangeLabel: range.label,
            customerCount: selected.length,
            cardCount: cardRows.length,
            identitySource: 'server_context_user',
            completionCriteria: ['personal_reservations_loaded', 'active_customer_cards_loaded', 'card_progress_computed'],
          },
        }, dataQuality);
      }
      case 'inventory_operations_overview': {
        if (/(?:产品|商品|库存).*(?:积压太久|积压很久|积压|周转慢)|(?:积压太久|积压很久).*(?:产品|商品|库存)/.test(input.question)) {
          const aging = await this.skillRuntime.buildInventoryAgingAnalysis({
            storeId: input.context.storeId,
            asOf: range.endDate,
            observationDays: 90,
          });
          const rows = aging.products.slice(0, this.resolveLimit(input.args.limit, 10));
          const limitation = `仅评估有在库批次记录的 ${aging.batchCoveredProductCount}/${aging.totalProductCount} 个商品；候选需已记录在库至少 ${aging.minimumRecordedAgeDays} 天，并满足观察期无出库、预计库存覆盖至少 ${aging.minimumCoverageDays} 天，或长期低动销且库存明显高于安全库存。`;
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: rows.length
              ? `当前识别 ${aging.candidateCount} 个库存积压候选，展示前 ${rows.length} 个：${rows.map((row, index) => `${index + 1}. ${row.name}，当前库存 ${row.stock}，${row.reason}`).join('；')}。${limitation}`
              : `当前没有满足统一口径的库存积压候选。${limitation}`,
            citations: [{ sourceType: 'db_skill', sourceId: 'inventory_aging_analysis', label: '库存批次龄期与出库速度分析' }],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'ranking',
                rows: rows.map((row) => ({
                  productName: row.name,
                  currentStock: row.stock,
                  safetyStock: row.safetyStock,
                  stockValue: row.stockValue.toFixed(2),
                  oldestBatchAgeDays: row.oldestBatchAgeDays,
                  lastOutboundDays: row.lastOutboundDays ?? '',
                  outboundQuantity: row.outboundQuantity,
                  coverageDays: row.coverageDays ?? '',
                  reason: row.reason,
                })),
                columns: ['productName', 'currentStock', 'safetyStock', 'stockValue', 'oldestBatchAgeDays', 'lastOutboundDays', 'outboundQuantity', 'coverageDays', 'reason'],
                citationIds: ['inventory_aging_analysis'],
              },
              { kind: 'limitations', items: [limitation] },
            ],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              answerScope: 'inventory_aging_candidates',
              candidateCount: aging.candidateCount,
              observationDays: aging.observationDays,
              batchCoveredProductCount: aging.batchCoveredProductCount,
              totalProductCount: aging.totalProductCount,
              completionCriteria: ['batch_age_loaded', 'outbound_velocity_loaded', 'aging_candidates_ranked'],
            },
          }, dataQuality);
        }
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
        if (/(?:产品|商品).*(?:销售额|销售金额)|(?:销售额|销售金额).*(?:产品|商品)/.test(input.question)) {
          const totalAmount = await this.productSalesAmount(input.context.storeId, range.startDate, range.endDate);
          const metricRef = structuredDefinitionRef(input.args.metrics, 'metric.product_sales_amount');
          return {
            status: 'completed',
            answer: `${range.label}商品净销售额 ${totalAmount.toFixed(2)} 元。`,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: metricRef ? `${metricRef.definitionKey}@${metricRef.definitionVersion}` : 'metric.product_sales_amount',
                label: '业务定义：商品销售额',
              },
              { sourceType: 'db_skill', sourceId: 'product_order_item_sales_amount', label: '商品订单明细净销售额' },
            ],
            grounding: 'db_skill',
            blocks: [{
              kind: 'kpi',
              items: [{ label: '商品净销售额', value: `${totalAmount.toFixed(2)} 元` }],
              citationIds: [metricRef ? `${metricRef.definitionKey}@${metricRef.definitionVersion}` : 'metric.product_sales_amount', 'product_order_item_sales_amount'],
            }],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              answerScope: 'product_sales_amount',
              rangeLabel: range.label,
              totalAmount,
              completionCriteria: ['product_order_items_loaded', 'product_sales_amount_aggregated'],
            },
          };
        }
        if (/(?:项目|护理|服务).*(?:缺|不足|没有).*(?:耗材|物料)|(?:耗材|物料).*(?:缺|不足).*(?:项目|护理|服务)/.test(input.question)) {
          const availability = await this.projectMaterialAvailability(input.context.storeId);
          const rows = availability.blockedProjects.slice(0, this.resolveLimit(input.args.limit, 20));
          const limitation = availability.unconfiguredProjectCount > 0
            ? `${availability.unconfiguredProjectCount} 个在售项目没有配置 BOM，未纳入可执行性判断。`
            : undefined;
          return {
            status: 'completed',
            answer: rows.length
              ? `当前有 ${rows.length} 个项目因至少一项标准耗材库存不足，不能按现有 BOM 完整执行。${limitation ? ` ${limitation}` : ''}`
              : `已配置 BOM 的 ${availability.configuredProjectCount} 个项目中，没有发现因标准耗材库存不足而无法执行的项目。${limitation ? ` ${limitation}` : ''}`,
            citations: [{ sourceType: 'db_skill', sourceId: 'project_material_availability', label: '项目 BOM 与当前耗材库存核对' }],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'table',
                rows,
                columns: ['projectName', 'productName', 'requiredQty', 'currentStock', 'shortageQty', 'unit'],
                citationIds: ['project_material_availability'],
              },
              ...(limitation ? [{ kind: 'limitations' as const, items: [limitation] }] : []),
            ],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              answerScope: 'project_material_availability',
              configuredProjectCount: availability.configuredProjectCount,
              unconfiguredProjectCount: availability.unconfiguredProjectCount,
              blockedProjectCount: new Set(rows.map((item) => item.projectId)).size,
              completionCriteria: ['project_bom_loaded', 'current_material_stock_loaded'],
            },
          };
        }
        if (/(?:最近|本周|本月|近期)?.*采购了什么|采购.*(?:花了多少|金额|费用)|采购单.*(?:金额|明细)/.test(input.question)) {
          const rows = procurement.recentOrders.slice(0, this.resolveLimit(input.args.limit, 10));
          const totalAmount = rows.reduce((sum, item) => sum + item.amount, 0);
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: rows.length
              ? `最近 ${rows.length} 张采购单合计 ${totalAmount.toFixed(2)} 元。`
              : '当前门店没有采购订单记录。',
            citations: [{ sourceType: 'db_skill', sourceId: 'inventory_procurement_analysis', label: '采购单、供应商与采购金额' }],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '采购单金额合计', value: `${totalAmount.toFixed(2)} 元`, hint: `${rows.length} 张采购单` }],
                citationIds: ['inventory_procurement_analysis'],
              },
              {
                kind: 'table',
                rows,
                columns: ['createdAt', 'orderNo', 'supplierName', 'amount', 'status'],
                citationIds: ['inventory_procurement_analysis'],
              },
            ],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              answerScope: 'recent_procurement_orders',
              orderCount: rows.length,
              totalAmount,
              completionCriteria: ['recent_procurement_orders_loaded'],
            },
          }, dataQuality);
        }
        if (/(?:耗材|物料|产品|商品).*(?:消耗|用量|出库).*(?:最快|最多|排行|排名)|(?:消耗|用量|出库).*(?:最快|最多).*(?:耗材|物料|产品|商品)/.test(input.question)) {
          const rows = detail.products
            .filter((item) => item.outboundQty > 0)
            .slice(0, this.resolveLimit(input.args.limit, 20))
            .map((item) => ({
              productId: item.productId,
              productName: item.name,
              outboundQty: item.outboundQty,
              currentStock: item.stock,
              coverageDays: item.coverageDays ?? '',
            }));
          return this.applyDataQualityGuard({
            status: 'completed',
            answer: rows.length
              ? `${range.label}消耗量最高的是 ${rows[0]!.productName}，出库/消耗 ${rows[0]!.outboundQty}。`
              : `${range.label}没有可用于消耗排行的出库记录。`,
            citations: [{ sourceType: 'db_skill', sourceId: 'inventory_detail_analysis', label: '库存出库与消耗明细' }],
            grounding: 'db_skill',
            blocks: [{
              kind: 'ranking',
              rows,
              columns: ['productName', 'outboundQty', 'currentStock', 'coverageDays'],
              citationIds: ['inventory_detail_analysis'],
            }],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              answerScope: 'inventory_consumption_ranking',
              rangeLabel: range.label,
              completionCriteria: ['inventory_outbound_loaded', 'consumption_ranked'],
            },
          }, dataQuality);
        }
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
        if (/(?:项目).*(?:成本).*(?:上涨|上升).*(?:毛利|利润)|(?:项目).*(?:毛利|利润).*(?:成本).*(?:上涨|上升)/.test(input.question)) {
          const limitation = '当前结算数据没有项目级收入、优惠、成本快照及可比期间归因，无法判断哪个项目因成本上涨影响毛利。Ami Brain 不会用全店毛利率或商品成本替代项目级成本归因。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              unsupportedReason: 'project_cost_attribution_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        const diagnosisAnswer = input.answerShape === 'diagnosis';
        const diagnosisRange = diagnosisAnswer ? this.resolveFinanceDiagnosisRange(input, range) : range;
        if (/(?:退款|退货).*(?:原因|为什么)|(?:原因|为什么).*(?:退款|退货)/.test(input.question)) {
          const refundAnalysis = await this.skillRuntime.buildFinanceRefundReasonAnalysis({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          });
          const rows = refundAnalysis.records.slice(0, this.resolveLimit(input.args.limit, 20));
          const reasonText = refundAnalysis.reasons.length
            ? refundAnalysis.reasons.map((item) => `${item.reason} ${item.count} 笔/${item.amount.toFixed(2)} 元`).join('；')
            : '当前没有退款原因记录';
          return this.answer({
            answer: `${diagnosisRange.label}退款 ${refundAnalysis.refundCount} 笔、合计 ${refundAnalysis.refundAmount.toFixed(2)} 元。原因汇总：${reasonText}。`,
            citationId: 'finance_refund_reason_analysis',
            citationLabel: '退款记录、金额与原因',
            citations: [
              { sourceType: 'business_definition', sourceId: 'metric.refund_amount', label: '业务定义：退款金额' },
              { sourceType: 'business_definition', sourceId: 'metric.refund_count', label: '业务定义：退款笔数' },
            ],
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '退款金额', value: `${refundAnalysis.refundAmount.toFixed(2)} 元` },
                  { label: '退款笔数', value: `${refundAnalysis.refundCount} 笔` },
                ],
                citationIds: ['finance_refund_reason_analysis'],
              },
              {
                kind: 'table',
                rows: rows.map((item) => ({
                  refundNo: item.refundNo,
                  orderNo: item.orderNo,
                  customerName: item.customerName ?? '',
                  reason: item.reason,
                  amount: item.amount,
                  refundedAt: item.refundedAt.toISOString(),
                })),
                columns: ['refundNo', 'orderNo', 'customerName', 'reason', 'amount', 'refundedAt'],
                citationIds: ['finance_refund_reason_analysis'],
              },
              ...(refundAnalysis.reasons.some((item) => item.reason === '未填写原因')
                ? [{ kind: 'limitations' as const, items: ['部分退款记录没有填写原因，不能进一步归因。'] }]
                : []),
            ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'refund_reason_analysis',
              rangeLabel: diagnosisRange.label,
              refundCount: refundAnalysis.refundCount,
              reasonCount: refundAnalysis.reasons.length,
            },
          });
        }
        if (/(?:产品|商品|货品).*(?:低于成本|毛利率|毛利)|(?:低于成本|毛利率|毛利).*(?:产品|商品|货品)/.test(input.question)) {
          const margin = await this.skillRuntime.buildFinanceProductMarginAnalysis({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          });
          const belowCostRequested = /低于成本/.test(input.question);
          const selected = (belowCostRequested ? margin.rows.filter((row) => row.belowCostSaleCount > 0) : margin.rows)
            .slice(0, this.resolveLimit(input.args.limit, 20));
          const metricKey = belowCostRequested ? 'metric.product_below_cost_sale_count' : 'metric.product_gross_margin_rate';
          const metricRef = structuredDefinitionRef(input.args.metrics, metricKey);
          const limitations = [
            ...(margin.incompleteCostProductCount > 0
              ? [`${margin.incompleteCostProductCount} 个商品存在成本快照覆盖不足，未覆盖部分不参与低于成本判断。`]
              : []),
            ...(margin.rows.some((row) => row.costSources.includes('product_master_fallback'))
              ? ['部分历史订单缺少下单成本快照，使用商品主数据成本作为明确标注的回退值。']
              : []),
          ];
          return {
            status: 'completed',
            answer: belowCostRequested
              ? `${diagnosisRange.label}发现 ${margin.belowCostProductCount} 个商品存在至少一笔非赠品成交单价低于可用成本。${selected.length ? ` 其中首项为 ${selected[0]!.productName}。` : ''}${limitations.length ? ` ${limitations.join('')}` : ''}`
              : selected.length
                ? `${diagnosisRange.label}商品毛利率最高的是 ${selected[0]!.productName}，毛利率 ${((selected[0]!.grossMarginRate ?? 0) * 100).toFixed(1)}%。${limitations.length ? ` ${limitations.join('')}` : ''}`
                : `${diagnosisRange.label}没有可计算商品毛利率的有效销售与成本数据。`,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: metricRef ? `${metricRef.definitionKey}@${metricRef.definitionVersion}` : metricKey,
                label: belowCostRequested ? '业务定义：低于成本销售笔数' : '业务定义：商品毛利率',
              },
              { sourceType: 'db_skill', sourceId: 'finance_product_margin_analysis', label: '订单商品净额、退款冲减与成本快照分析' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'ranking',
                rows: selected.map((row) => ({
                  productName: row.productName,
                  quantity: row.quantity,
                  netRevenue: row.netRevenue,
                  costAmount: row.costAmount,
                  grossProfit: row.grossProfit,
                  grossMarginRate: row.grossMarginRate === undefined ? null : `${(row.grossMarginRate * 100).toFixed(1)}%`,
                  belowCostSaleCount: row.belowCostSaleCount,
                  costCoverageRate: `${(row.costCoverageRate * 100).toFixed(1)}%`,
                  costSources: row.costSources.join(','),
                })),
                columns: ['productName', 'quantity', 'netRevenue', 'costAmount', 'grossProfit', 'grossMarginRate', 'belowCostSaleCount', 'costCoverageRate', 'costSources'],
                citationIds: ['finance_product_margin_analysis'],
              },
              ...(limitations.length ? [{ kind: 'limitations' as const, items: limitations }] : []),
            ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: belowCostRequested ? 'product_below_cost_sales' : 'product_margin_ranking',
              rangeLabel: diagnosisRange.label,
              totalProductCount: margin.totalProductCount,
              belowCostProductCount: margin.belowCostProductCount,
              incompleteCostProductCount: margin.incompleteCostProductCount,
            },
          };
        }
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
        const citations = [{ sourceType: 'db_skill', sourceId: 'capability_reservation_list', label: '门店预约清单' }];
        const focusedReservationAnswer = this.buildFocusedReservationAnswer(schedule, input, range, citations);
        if (focusedReservationAnswer) return this.applyDataQualityGuard(this.ensureAnswerTextBlock(focusedReservationAnswer), dataQuality);
        const activeReservations = schedule.reservations.filter((item) => !this.isCancelledReservation(item.status));
        const rows = activeReservations
          .slice(0, this.resolveLimit(input.args.limit, 100))
          .map(
            (item, index) =>
              `${index + 1}. ${item.date} ${item.startTime}，${item.customerName}，${item.projectName}${
                item.beauticianName ? `，美容师 ${item.beauticianName}` : ''
              }`,
          )
          .join('\n');
        return this.applyDataQualityGuard({
          status: 'completed',
          answer: `${range.label}有效预约共 ${activeReservations.length} 个。${rows ? `\n${rows}` : ''}`,
          citations,
          grounding: 'db_skill',
          blocks: [{
            kind: 'table',
            rows: activeReservations.slice(0, this.resolveLimit(input.args.limit, 100)).map((item) => this.reservationRow(item)),
            columns: ['date', 'startTime', 'endTime', 'customerName', 'projectName', 'beauticianName', 'status'],
            citationIds: ['capability_reservation_list'],
          }],
          metadata: {
            capabilityKey: 'reservation_list',
            answerScope: 'reservation_schedule_list',
            rangeLabel: range.label,
            count: activeReservations.length,
            completionCriteria: ['reservation_schedule_loaded'],
          },
        }, dataQuality);
      }
      case 'customer_facts': {
        if (/(?:等待时间长|等待过久|久等).*(?:离开|走了|流失)|(?:离开|走了|流失).*(?:等待时间长|等待过久|久等)/.test(input.question)) {
          const limitation = '当前等待流失事实表尚未迁移并采集真实数据，无法判断客户是否因等待时间长而离开。Ami Brain 不会用客户档案、预约取消、爽约或普通备注替代离店原因。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'customer_facts',
              unsupportedReason: 'customer_waiting_departure_fact_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        if (/(?:投诉|客诉|满意度|不[^，。；]{0,6}满意|负面反馈)/.test(input.question)) {
          const limitation = '当前客户反馈事实表尚未迁移并采集真实投诉、满意度与处置状态，无法回答该问题。Ami Brain 不会用客户档案、会员权益、消费金额或营销响应替代投诉与满意度事实。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'customer_facts',
              unsupportedReason: 'customer_feedback_fact_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        if (/(?:沉睡客户.*(?:唤醒|回流).*(?:迹象|信号)|(?:唤醒|回流).*(?:迹象|信号).*沉睡客户)/.test(input.question)) {
          if (!this.customerLifecycle) throw new Error('customer_lifecycle_service_not_configured');
          const explicitTime = readCapabilityStructuredTime(input.args, input.context.timezone);
          const summary = await this.customerLifecycle.getDormantReactivationEvidence(input.context.storeId, {
            startDate: explicitTime ? range.startDate : undefined,
            endDate: explicitTime ? range.endDate : undefined,
            limit: this.resolveLimit(input.args.limit, 10),
          });
          const metricRef = structuredDefinitionRef(input.args.metrics, 'metric.dormant_reactivation_customer_count');
          const metricCitation = {
            sourceType: 'business_definition',
            sourceId: metricRef
              ? `${metricRef.definitionKey}@${metricRef.definitionVersion}`
              : 'metric.dormant_reactivation_customer_count',
            label: '业务定义：沉睡客户唤醒迹象人数',
          };
          const answer = summary.reactivatedCustomerCount
            ? `${summary.rangeLabel}发现 ${summary.reactivatedCustomerCount} 位沉睡客户在有效触达后出现唤醒迹象：强信号 ${summary.strongSignalCustomerCount} 位、中信号 ${summary.mediumSignalCustomerCount} 位、弱信号 ${summary.weakSignalCustomerCount} 位。`
            : `${summary.rangeLabel}分析了 ${summary.touchCountAnalyzed} 条有效触达，其中 ${summary.dormantCandidateCount} 位客户在触达前满足沉睡证据，但触达后没有发现预约、实际到店、有效消费、点击或回复信号。发送成功本身不算唤醒。`;
          const evidenceCitationId = 'dormant_customer_reactivation_evidence';
          return {
            status: 'completed',
            answer,
            citations: [
              metricCitation,
              {
                sourceType: 'db_skill',
                sourceId: evidenceCitationId,
                label: '营销触达、预约到店与有效消费关联证据',
              },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '出现唤醒迹象', value: `${summary.reactivatedCustomerCount} 人` },
                  { label: '强信号', value: `${summary.strongSignalCustomerCount} 人` },
                  { label: '中信号', value: `${summary.mediumSignalCustomerCount} 人` },
                  { label: '弱信号', value: `${summary.weakSignalCustomerCount} 人` },
                ],
                citationIds: [metricCitation.sourceId, evidenceCitationId],
              },
              {
                kind: 'table',
                rows: summary.rows.map((row) => ({
                  customerName: row.customerName,
                  memberLevel: row.memberLevel,
                  touchChannel: row.channel,
                  touchedAt: row.touchedAt.toISOString(),
                  dormantEvidence: row.dormantEvidence,
                  signalLevel: row.signalLevel,
                  signalSummary: row.signalSummary,
                  latestSignalAt: row.latestSignalAt.toISOString(),
                  attributionConfidence: row.attributionConfidence,
                  attributedRevenue: row.attributedRevenue.toFixed(2),
                })),
                columns: [
                  'customerName',
                  'memberLevel',
                  'touchChannel',
                  'dormantEvidence',
                  'signalLevel',
                  'signalSummary',
                  'latestSignalAt',
                  'attributionConfidence',
                  'attributedRevenue',
                ],
                citationIds: [evidenceCitationId],
              },
              {
                kind: 'limitations',
                items: [
                  `沉睡基线为触达前 ${summary.dormantThresholdDays} 天无实际到店或有效正金额消费，或触达时已有高流失预测/沉睡召回机会。`,
                  `触达后信号观察窗口最长 ${summary.attributionWindowDays} 天；时间先后只表示关联，只有显式营销归因记录才视为系统归因。`,
                  summary.explicitAttributionCustomerCount < summary.reactivatedCustomerCount
                    ? `${summary.reactivatedCustomerCount - summary.explicitAttributionCustomerCount} 位客户只有时间关联证据，不能宣称由本次触达直接造成。`
                    : '当前返回客户均存在显式营销归因记录。',
                  ...(summary.touchesTruncated
                    ? [`有效触达共 ${summary.touchCountTotal} 条，本次受控扫描 ${summary.touchCountAnalyzed} 条，结果为部分覆盖。`]
                    : []),
                ],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'dormant_reactivation_evidence',
              rangeLabel: summary.rangeLabel,
              dormantThresholdDays: summary.dormantThresholdDays,
              attributionWindowDays: summary.attributionWindowDays,
              touchCountAnalyzed: summary.touchCountAnalyzed,
              touchCountTotal: summary.touchCountTotal,
              touchesTruncated: summary.touchesTruncated,
              dormantCandidateCount: summary.dormantCandidateCount,
              reactivatedCustomerCount: summary.reactivatedCustomerCount,
              explicitAttributionCustomerCount: summary.explicitAttributionCustomerCount,
              causalClaim: 'not_inferred_from_temporal_evidence',
            },
          };
        }
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
          const diagnosisRequested = input.answerShape === 'diagnosis' || /(?:问题|原因).*(?:在哪|是什么)|为什么/.test(input.question);
          const diagnosisLimitation = '当前事实可确认新客 cohort、首笔有效订单转化和待转化人数，但尚未形成按未转化原因、顾问跟进过程和渠道质量拆解的归因事实，因此不能把低转化直接归因给某个渠道或员工。';
          return {
            status: 'completed',
            answer: `${range.label}新增客户 ${summary.newCustomerCount} 人，其中 ${summary.convertedCustomerCount} 人在同一周期内完成首笔有效正金额订单，转化率 ${(summary.conversionRate * 100).toFixed(1)}%，待转化 ${summary.unconvertedCustomerCount} 人。${diagnosisRequested ? ` ${diagnosisLimitation}` : ''}`,
            citations: [
              ...definitionCitations,
              { sourceType: 'db_skill', sourceId: 'customer_acquisition_conversion_summary', label: '客户建档与首笔有效订单转化事实' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
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
              },
              ...(diagnosisRequested ? [{
                kind: 'diagnosis' as const,
                findings: [{ title: '转化原因归因边界', detail: diagnosisLimitation, severity: 'info' as const }],
                citationIds: ['customer_acquisition_conversion_summary'],
              }] : []),
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: range.label,
              cohortDefinition: 'Customer.createdAt within requested period',
              conversionDefinition: 'first valid positive-net ProductOrder between customer creation and period end',
              diagnosisCoverage: diagnosisRequested ? 'conversion_result_only_without_cause_attribution' : 'not_requested',
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
        if (/(?:次卡|卡项).*(?:即将过期|快过期|临期).*(?:余量|剩余|次数)|(?:余量|剩余|次数).*(?:多|很多).*(?:次卡|卡项).*(?:过期|临期)/.test(input.question)) {
          const result = await this.customerFacts.getExpiringHighBalanceCards({
            storeId: input.context.storeId,
            asOf: new Date(),
            windowDays: 30,
            limit: this.resolveLimit(input.args.limit, 10),
          });
          return this.answer({
            answer: `未来 ${result.windowDays} 天内有 ${result.total} 张活跃次卡临期且余量较高。统一口径：剩余至少 3 次，或剩余比例不低于 30%。${result.rows.length ? `\n${result.rows.map((row, index) => `${index + 1}. ${row.customerName}：${row.cardName}，剩余 ${row.remainingTimes}/${row.totalTimes} 次（${(row.remainingRate * 100).toFixed(1)}%），${row.daysToExpiry} 天后到期，估算未履约 ${row.unfulfilledValue.toFixed(2)} 元`).join('\n')}` : ''}`,
            citationId: 'customer_card_expiry_balance_facts',
            citationLabel: '客户次卡有效期与剩余次数事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '临期高余量次卡', value: `${result.total} 张`, hint: `未来 ${result.windowDays} 天` }],
                citationIds: ['customer_card_expiry_balance_facts'],
              },
              {
                kind: 'table',
                rows: result.rows.map((row) => ({
                  ...row,
                  remainingRate: `${(row.remainingRate * 100).toFixed(1)}%`,
                  expiryDate: row.expiryDate.toISOString(),
                  unfulfilledValue: row.unfulfilledValue.toFixed(2),
                })),
                columns: ['customerName', 'cardName', 'remainingTimes', 'totalTimes', 'remainingRate', 'daysToExpiry', 'expiryDate', 'unfulfilledValue'],
                citationIds: ['customer_card_expiry_balance_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'expiring_high_balance_cards',
              windowDays: result.windowDays,
              definition: 'active card expiring within 30 days and remainingTimes >= 3 OR remainingTimes / totalTimes >= 0.3',
            },
          });
        }
        if (/消费了钱.*(?:很少用|少用).*次卡|次卡.*(?:很少用|使用少|不来用|一直不来)/.test(input.question)) {
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
        if (/(?:投诉|客诉|满意度|不[^，。；]{0,6}满意|负面反馈)/.test(input.question)) {
          const limitation = '当前客户反馈事实表尚未迁移并采集真实投诉、满意度与处置状态，无法回答该问题。Ami Brain 不会用客户分层、会员卡余额、消费金额或营销响应替代投诉与满意度事实。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'marketing_customer_segment',
              unsupportedReason: 'customer_feedback_fact_not_available',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        if (/(?:消费金额.*(?:分层|分一下层|分组)|优惠.*敏感|等打折|打折才来|基础项目.*(?:升单|升级)|疗程.*(?:快结束|临近结束|续购)|续购.*(?:疗程|次卡|客户)|新客.*潜力.*长期|项目.*感兴趣.*(?:还没办卡|未办卡|没有办卡))/.test(input.question)) {
          const answer = await this.customerFacts.answerCustomerFactQuestion({
            storeId: input.context.storeId,
            message: input.question,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          return this.answer({
            answer,
            citationId: 'capability_marketing_customer_segment',
            citationLabel: '营销客户分群事实',
            metadata: { rangeLabel: range.label, segmentDetail: true },
          });
        }
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

  private async projectMaterialAvailability(storeId: number) {
    if (!this.prisma) throw new Error('project_material_availability_prisma_unavailable');
    const projects = await this.prisma.project.findMany({
      where: { storeId, deletedAt: null, status: 'active' },
      select: {
        id: true,
        name: true,
        bomItems: {
          select: {
            standardQty: true,
            unit: true,
            product: {
              select: { id: true, name: true, currentStock: true, status: true, deletedAt: true },
            },
          },
        },
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const configuredProjects = projects.filter((project) => project.bomItems.length > 0);
    const blockedProjects = configuredProjects.flatMap((project) =>
      project.bomItems.flatMap((item) => {
        const requiredQty = Number(item.standardQty);
        const currentStock = Number(item.product.currentStock);
        const unavailable = item.product.deletedAt !== null || item.product.status !== 'active';
        if (!unavailable && currentStock >= requiredQty) return [];
        return [{
          projectId: project.id,
          projectName: project.name,
          productId: item.product.id,
          productName: item.product.name,
          requiredQty,
          currentStock,
          shortageQty: Math.max(0, requiredQty - currentStock),
          unit: item.unit,
          productStatus: unavailable ? 'unavailable' : 'active',
        }];
      }),
    ).sort((left, right) => right.shortageQty - left.shortageQty || left.projectName.localeCompare(right.projectName, 'zh-CN'));
    return {
      configuredProjectCount: configuredProjects.length,
      unconfiguredProjectCount: projects.length - configuredProjects.length,
      blockedProjects,
    };
  }

  private buildFocusedReservationAnswer(
    schedule: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>,
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
    citations: BrainDomainAnswer['citations'],
  ): BrainDomainAnswer | undefined {
    const question = input.question;
    const citationIds = citations.map((citation) => citation.sourceId);
    if (/(?:通知|提醒).*(?:到位|送达|成功|收到)|(?:到位|送达).*(?:通知|提醒)/.test(question)) {
      const limitation = '现有预约记录没有统一的通知发送与送达回执字段，无法确认预约是否已经通知到位。Ami Brain 不会用预约状态代替消息送达状态。';
      return this.unsupportedFocusedAnswer('reservation_notification_receipt_not_available', limitation);
    }
    if (/(?:可能|预测|风险).*(?:爽约|不来)|(?:爽约|不来).*(?:可能|预测|风险)/.test(question)) {
      const limitation = '现有预约记录只有已发生的预约状态，没有已治理的爽约预测结果，无法判断哪些客户可能爽约。Ami Brain 不会把待确认预约直接标记为爽约风险。';
      return this.unsupportedFocusedAnswer('reservation_no_show_prediction_not_available', limitation);
    }

    const active = schedule.reservations.filter((item) => !this.isCancelledReservation(item.status));
    const timeWindow = this.resolveQuestionTimeWindow(question);
    const customerName = this.resolveEntityName(input, 'customer');
    const beauticianName = this.resolveEntityName(input, 'beautician');
    const filterRows = <T extends (typeof schedule.reservations)[number]>(rows: T[]) => rows.filter((item) => {
      if (timeWindow && !this.timeInWindow(item.startTime, timeWindow)) return false;
      if (customerName && !item.customerName.includes(customerName)) return false;
      if (beauticianName && !String(item.beauticianName ?? '').includes(beauticianName)) return false;
      return true;
    });

    if (/(?:预约).*(?:还没确认|没有确认|没确认|未确认|待确认)|(?:还没确认|没有确认|没确认|未确认|待确认).*(?:预约|客人|客户)/.test(question)) {
      let rows = filterRows(schedule.reservations.filter((item) => this.isPendingConfirmation(item.status)));
      const olderThanTwoHours = /(?:超过|超出).*(?:两|2)\s*小时|(?:两|2)\s*小时.*(?:未确认|没确认)/.test(question);
      if (olderThanTwoHours) {
        const threshold = Date.now() - 2 * 60 * 60_000;
        rows = rows.filter((item) => item.createdAt.getTime() <= threshold);
      }
      const qualifier = olderThanTwoHours ? '超过两小时仍未确认' : '待确认';
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}有 ${rows.length} 个${qualifier}预约：${this.summarizeReservationRows(rows)}。`
          : `${range.label}没有${qualifier}预约。`,
        citations,
        grounding: 'db_skill',
        blocks: [this.reservationTableBlock(rows, citationIds)],
        metadata: { capabilityKey: input.card.key, answerScope: 'pending_confirmation_reservations', rangeLabel: range.label, count: rows.length, olderThanTwoHours },
      };
    }

    if (/(?:预约了|有预约|预约).*(?:还没来|没到|未到店|待到店)|(?:还没来|没到|未到店|待到店).*(?:客人|客户|预约)/.test(question)) {
      const rows = filterRows(active.filter((item) => this.isPendingArrival(item.status)));
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}有 ${rows.length} 位已预约待到店客户：${this.summarizeReservationRows(rows)}。`
          : `${range.label}没有已预约待到店客户。`,
        citations,
        grounding: 'db_skill',
        blocks: [this.reservationTableBlock(rows, citationIds)],
        metadata: { capabilityKey: input.card.key, answerScope: 'pending_arrival_customer_list', rangeLabel: range.label, count: rows.length, pendingArrival: rows.length },
      };
    }

    if (/(?:所有|全部|今天).*(?:到店客人|到店客户).*(?:基本信息|名单|情况)|(?:到店客人|到店客户).*(?:基本信息|名单)/.test(question)) {
      const rows = filterRows(active.filter((item) => this.isArrivedReservation(item.status)));
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}已记录到店 ${rows.length} 位客户：${this.summarizeReservationRows(rows)}。`
          : `${range.label}没有已记录到店客户。`,
        citations,
        grounding: 'db_skill',
        blocks: [this.reservationTableBlock(rows, citationIds)],
        metadata: { capabilityKey: input.card.key, answerScope: 'arrived_customer_list', rangeLabel: range.label, count: rows.length },
      };
    }

    if (/VIP|高等级会员/.test(question)) {
      const rows = filterRows(active);
      const limitation = '系统当前只有预约客户的原始会员等级，尚未发布统一的 VIP 等级映射规则，因此只展示会员等级，不自动把某个等级判定为 VIP。';
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}预约客户的会员等级如下，共 ${rows.length} 人。${limitation}`
          : `${range.label}没有预约客户。${limitation}`,
        citations,
        grounding: 'db_skill',
        blocks: [this.reservationTableBlock(rows, citationIds, ['date', 'startTime', 'customerName', 'memberLevel', 'projectName', 'beauticianName']), { kind: 'limitations', items: [limitation] }],
        metadata: { capabilityKey: input.card.key, answerScope: 'reservation_member_level_list', rangeLabel: range.label, count: rows.length, unsupportedReason: 'vip_level_mapping_not_published' },
      };
    }

    if (/(?:面部|身体).*(?:几个|多少|分类)|(?:几个|多少).*(?:面部|身体)/.test(question)) {
      const rows = filterRows(active);
      const grouped = new Map<string, number>();
      for (const item of rows) grouped.set(item.projectTypeName ?? '未分类', (grouped.get(item.projectTypeName ?? '未分类') ?? 0) + 1);
      const counts = [...grouped.entries()].sort((left, right) => right[1] - left[1]);
      const answer = counts.length ? counts.map(([name, count]) => `${name} ${count} 个`).join('，') : '没有有效预约';
      return {
        status: 'completed',
        answer: `${range.label}按项目分类统计：${answer}。`,
        citations,
        grounding: 'db_skill',
        blocks: [{ kind: 'table', rows: counts.map(([projectType, count]) => ({ projectType, count })), columns: ['projectType', 'count'], citationIds }],
        metadata: { capabilityKey: input.card.key, answerScope: 'reservation_project_type_breakdown', rangeLabel: range.label, count: rows.length },
      };
    }

    if (/(?:预约最多|最忙).*(?:哪几天|哪天)|(?:哪几天|哪天).*(?:预约最多|最忙)/.test(question)) {
      const grouped = new Map<string, number>();
      for (const item of active) grouped.set(item.date, (grouped.get(item.date) ?? 0) + 1);
      const rows = [...grouped.entries()].map(([date, count]) => ({ date, count })).sort((left, right) => right.count - left.count || left.date.localeCompare(right.date));
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}预约最多的是 ${rows[0]!.date}，共 ${rows[0]!.count} 个；前 ${Math.min(rows.length, 5)} 天为：${rows.slice(0, 5).map((item) => `${item.date} ${item.count} 个`).join('，')}。`
          : `${range.label}没有有效预约，无法形成日期排行。`,
        citations,
        grounding: 'db_skill',
        blocks: [{ kind: 'ranking', rows: rows.slice(0, this.resolveLimit(input.args.limit, 10)), columns: ['date', 'count'], citationIds }],
        metadata: { capabilityKey: input.card.key, answerScope: 'reservation_daily_ranking', rangeLabel: range.label, count: active.length },
      };
    }

    const filtered = filterRows(active);
    if (/(?:下一个|下一位|接下来).*(?:预约|客人|客户)|(?:预约|客人|客户).*(?:下一个|下一位)/.test(question)) {
      const now = new Date();
      const next = filtered.find((item) => this.reservationAt(item, input.context.timezone).getTime() >= now.getTime());
      return this.singleReservationAnswer(next, input, range, citations, 'next_reservation', next
        ? `下一个预约是 ${next.date} ${next.startTime} 的${next.customerName}，项目为${next.projectName}${next.beauticianName ? `，美容师 ${next.beauticianName}` : ''}`
        : `${range.label}没有后续有效预约`, { currentTime: this.formatClock(now, input.context.timezone) });
    }

    if (/(?:最后一个|最后一位).*(?:预约|客人|客户)|(?:预约|客人|客户).*(?:最后一个|最后一位)/.test(question)) {
      const last = filtered.at(-1);
      return this.singleReservationAnswer(last, input, range, citations, 'last_reservation', last
        ? `${range.label}最后一个预约是 ${last.date} ${last.startTime}${last.endTime ? `-${last.endTime}` : ''} 的${last.customerName}，项目为${last.projectName}`
        : `${range.label}没有有效预约`);
    }

    if (/(?:第一个|首个|最早).*(?:预约|客人|客户)|(?:预约|客人|客户).*(?:第一个|首个|最早)/.test(question)) {
      const first = filtered[0];
      return this.singleReservationAnswer(first, input, range, citations, 'first_reservation', first
        ? `${range.label}第一个预约是 ${first.date} ${first.startTime} 的${first.customerName}，项目为${first.projectName}`
        : `${range.label}没有有效预约`);
    }

    if (timeWindow?.exactTime || customerName || beauticianName) {
      return {
        status: 'completed',
        answer: filtered.length
          ? `${range.label}找到 ${filtered.length} 个匹配预约：${this.summarizeReservationRows(filtered)}。`
          : `${range.label}没有找到匹配的预约记录。`,
        citations,
        grounding: 'db_skill',
        blocks: [this.reservationTableBlock(filtered, citationIds)],
        metadata: { capabilityKey: input.card.key, answerScope: 'filtered_reservation_list', rangeLabel: range.label, count: filtered.length, customerName, beauticianName, exactTime: timeWindow?.exactTime },
      };
    }
    return undefined;
  }

  private buildFocusedBeauticianAnswer(
    services: Awaited<ReturnType<BrainSkillRuntimeService['buildBeauticianServiceSummary']>>,
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
    citations: BrainDomainAnswer['citations'],
  ): BrainDomainAnswer | undefined {
    const question = input.question;
    const citationIds = citations.map((citation) => citation.sourceId);
    const rows = services.nextTasks;
    const table = (items: typeof rows, columns = ['date', 'startTime', 'endTime', 'customerName', 'projectName', 'status', 'attentionItems']) => ({
      kind: 'table' as const,
      rows: items.map((item) => ({
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime ?? '',
        customerName: item.customerName,
        projectName: item.projectName,
        status: item.status,
        memberLevel: item.memberLevel,
        isFirstVisit: item.isFirstVisit ? '是' : '否',
        attentionItems: item.attentionItems.join('；'),
        previousService: item.previousService ? `${item.previousService.projectName}（${this.formatDateTime(item.previousService.appointmentTime, input.context.timezone)}）` : '',
      })),
      columns,
      citationIds,
    });
    const completed = (answer: string, answerScope: string, items: typeof rows = rows, blocks: BrainResponseBlock[] = [table(items)]): BrainDomainAnswer => ({
      status: 'completed', answer, citations, grounding: 'db_skill', blocks,
      metadata: { capabilityKey: input.card.key, answerScope, rangeLabel: range.label, count: items.length, identitySource: 'server_context_user' },
    });

    if (/培训|其他任务|非预约任务/.test(question)) {
      return this.unsupportedFocusedAnswer('beautician_non_reservation_task_fact_not_available', '当前美容师能力只接入个人预约与服务事实，没有统一的培训或其他任务排期数据，无法判断今天是否另有培训或非预约任务。');
    }
    if (/情绪状态|最近心情/.test(question)) {
      return this.unsupportedFocusedAnswer('customer_emotion_fact_not_available', '当前客户档案没有结构化、可审计的近期情绪状态，无法推断客户情绪。可以查看已有客户备注和明确注意事项，但不会据此给客户贴情绪标签。');
    }
    if (/取消/.test(question)) {
      const items = services.cancelledTasks;
      const limitation = '取消预约只说明预约状态，不能据此判断可以提前下班；培训、会议和其他非预约任务尚未接入。';
      return completed(items.length
        ? `${range.label}有 ${items.length} 个取消预约：${items.map((item) => `${item.startTime} ${item.customerName}，${item.projectName}`).join('；')}。${limitation}`
        : `${range.label}没有取消预约。${limitation}`, 'beautician_cancelled_reservations', items, [table(items), { kind: 'limitations', items: [limitation] }]);
    }

    if (/(?:总共|一共).*(?:几个小时|多久)|(?:服务).*(?:几个小时|总时长)/.test(question)) {
      return completed(`${range.label}有效预约 ${services.serviceCount} 个，按预约开始和结束时间合计计划服务 ${this.formatDuration(services.scheduledMinutes)}。`, 'beautician_scheduled_duration', rows, [
        { kind: 'kpi', items: [{ label: '有效预约', value: `${services.serviceCount} 个` }, { label: '计划服务时长', value: this.formatDuration(services.scheduledMinutes) }], citationIds },
        table(rows),
      ]);
    }

    if (/空档|空闲时间/.test(question)) {
      const limitation = '这里只计算已接入预约之间的空档，不包含营业前后时间，也不包含培训、会议和其他任务。';
      const gaps = services.gaps;
      return completed(gaps.length
        ? `${range.label}有 ${gaps.length} 段预约间空档：${gaps.map((gap) => `${gap.date} ${gap.startTime}-${gap.endTime}（${gap.minutes} 分钟）`).join('；')}。${limitation}`
        : `${range.label}没有检测到预约之间的空档。${limitation}`, 'beautician_reservation_gaps', rows, [
        { kind: 'table', rows: gaps, columns: ['date', 'startTime', 'endTime', 'minutes'], citationIds },
        { kind: 'limitations', items: [limitation] },
      ]);
    }

    if (/首次|新客/.test(question)) {
      const items = rows.filter((item) => item.isFirstVisit);
      return completed(items.length
        ? `${range.label}有 ${items.length} 位到店次数仍为 0 的首次到店候选：${items.map((item) => `${item.startTime} ${item.customerName}`).join('；')}。`
        : `${range.label}没有到店次数为 0 的首次到店候选。`, 'beautician_first_visit_customers', items, [table(items, ['date', 'startTime', 'customerName', 'projectName', 'isFirstVisit'])]);
    }

    if (/提前到|已经到|在等我/.test(question)) {
      const items = rows.filter((item) => item.arrivedEarly && this.isArrivedReservation(item.status));
      return completed(items.length
        ? `${range.label}有 ${items.length} 位客户已提前签到：${items.map((item) => `${item.startTime} ${item.customerName}`).join('；')}。`
        : `${range.label}没有记录到提前签到并等待的客户。`, 'beautician_early_arrivals', items);
    }

    if (/护理历史|上次做了什么|上次服务|之前做过/.test(question)) {
      const timeWindow = this.resolveQuestionTimeWindow(question);
      const candidates = timeWindow ? rows.filter((item) => this.timeInWindow(item.startTime, timeWindow)) : rows;
      const items = /下一个|下一位/.test(question) ? this.nextBeauticianItems(candidates, input.context.timezone).slice(0, 1) : candidates;
      const withHistory = items.filter((item) => item.previousService);
      return completed(withHistory.length
        ? `${range.label}查到 ${withHistory.length} 位预约客户的上次服务：${withHistory.map((item) => `${item.customerName}上次做${item.previousService!.projectName}（${this.formatDateTime(item.previousService!.appointmentTime, input.context.timezone)}）`).join('；')}。`
        : `${range.label}当前预约客户没有可用的已完成历史服务记录。`, 'beautician_customer_previous_service', items, [table(items, ['date', 'startTime', 'customerName', 'projectName', 'previousService', 'attentionItems'])]);
    }

    if (/VIP|高等级会员/.test(question)) {
      const limitation = '当前只展示客户原始会员等级，统一 VIP 等级映射规则尚未发布，不能自动判定哪些等级属于 VIP。';
      return completed(`${range.label}预约客户会员等级已列出。${limitation}`, 'beautician_customer_member_levels', rows, [table(rows, ['date', 'startTime', 'customerName', 'memberLevel', 'projectName']), { kind: 'limitations', items: [limitation] }]);
    }

    if (/比较难服务|需要注意什么/.test(question) && !/下一个|下一位|下午|点/.test(question)) {
      const items = rows.filter((item) => item.attentionItems.length > 0);
      const limitation = '系统不会给客户贴“难服务”标签，只列出档案中已有的过敏、肤质、皮肤状态和明确备注。';
      return completed(items.length
        ? `${range.label}有 ${items.length} 位客户存在明确注意事项。${limitation}`
        : `${range.label}没有记录到明确注意事项。${limitation}`, 'beautician_customer_attention_list', items, [table(items), { kind: 'limitations', items: [limitation] }]);
    }

    if (/(?:最后一个|最后一位).*(?:结束|客人|客户)|(?:最后一个|最后一位).*(?:之后|后面)/.test(question)) {
      const last = rows.at(-1);
      const limitation = '这里只能确认后续是否还有个人预约，培训、会议和其他任务尚未接入。';
      return completed(last
        ? `${range.label}最后一个预约是 ${last.startTime}${last.endTime ? `-${last.endTime}` : ''} 的${last.customerName}，项目为${last.projectName}。${limitation}`
        : `${range.label}没有有效预约。${limitation}`, 'beautician_last_reservation', last ? [last] : [], [table(last ? [last] : []), { kind: 'limitations', items: [limitation] }]);
    }

    const timeWindow = this.resolveQuestionTimeWindow(question);
    const timeFiltered = timeWindow ? rows.filter((item) => this.timeInWindow(item.startTime, timeWindow)) : rows;
    if (/(?:第一个|首个|最早).*(?:客人|客户|预约)/.test(question)) {
      const first = timeFiltered[0];
      return completed(first ? `${range.label}第一个预约是 ${first.startTime} 的${first.customerName}，项目为${first.projectName}。` : `${range.label}没有有效预约。`, 'beautician_first_reservation', first ? [first] : []);
    }
    if (/(?:下一个|下一位|接下来).*(?:客人|客户|预约)|(?:客人|客户).*(?:下一个|下一位)/.test(question)) {
      const next = this.nextBeauticianItems(timeFiltered, input.context.timezone)[0];
      if (!next) return completed(`${range.label}没有后续有效预约。`, 'beautician_next_reservation', []);
      const previous = next.previousService ? `；上次服务为${next.previousService.projectName}（${this.formatDateTime(next.previousService.appointmentTime, input.context.timezone)}）` : '';
      const attention = next.attentionItems.length ? `；注意事项：${next.attentionItems.join('；')}` : '；没有记录到明确注意事项';
      return completed(`下一位客户是 ${next.startTime} 的${next.customerName}，项目为${next.projectName}${previous}${attention}。`, 'beautician_next_reservation', [next]);
    }
    if (timeWindow?.exactTime || /下午那个客人|下午的客人/.test(question)) {
      return completed(timeFiltered.length
        ? `${range.label}找到 ${timeFiltered.length} 个匹配预约：${timeFiltered.map((item) => `${item.startTime} ${item.customerName}，${item.projectName}${item.attentionItems.length ? `，注意：${item.attentionItems.join('；')}` : ''}`).join('；')}。`
        : `${range.label}没有找到匹配预约。`, 'beautician_time_filtered_reservations', timeFiltered);
    }
    if (/这周.*(?:排班|安排)|本周.*(?:排班|安排)/.test(question)) {
      const limitation = '当前输出的是个人预约排期，不等同于考勤排班，也不包含培训和其他任务。';
      return completed(`${range.label}有 ${rows.length} 个有效预约。${limitation}`, 'beautician_weekly_reservations', rows, [table(rows), { kind: 'limitations', items: [limitation] }]);
    }
    if (/整体.*(?:服务流程|安排)|(?:几个客人|分别几点)|(?:今天|明天).*(?:预约安排|服务安排)/.test(question)) {
      return completed(rows.length
        ? `${range.label}有 ${rows.length} 个有效预约，计划服务 ${this.formatDuration(services.scheduledMinutes)}：${rows.map((item) => `${item.startTime}${item.endTime ? `-${item.endTime}` : ''} ${item.customerName}，${item.projectName}`).join('；')}。`
        : `${range.label}没有有效预约安排。`, 'beautician_service_timeline', rows, [
        { kind: 'kpi', items: [{ label: '有效预约', value: `${rows.length} 个` }, { label: '计划服务时长', value: this.formatDuration(services.scheduledMinutes) }], citationIds },
        table(rows),
      ]);
    }
    return undefined;
  }

  private unsupportedFocusedAnswer(reason: string, limitation: string): BrainDomainAnswer {
    return {
      status: 'completed',
      answer: limitation,
      citations: [],
      grounding: 'none',
      blocks: [{ kind: 'limitations', items: [limitation] }],
      metadata: { unsupportedReason: reason, completion: { status: 'complete', missingCriteria: [], recoverable: false } },
    };
  }

  private ensureAnswerTextBlock(answer: BrainDomainAnswer): BrainDomainAnswer {
    if (answer.blocks?.some((block) => block.kind === 'text')) return answer;
    return {
      ...answer,
      blocks: [
        { kind: 'text', text: answer.answer, citationIds: answer.citations.map((citation) => citation.sourceId) },
        ...(answer.blocks ?? []),
      ],
    };
  }

  private singleReservationAnswer(
    item: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'][number] | undefined,
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
    citations: BrainDomainAnswer['citations'],
    answerScope: string,
    answer: string,
    extraMetadata: Record<string, unknown> = {},
  ): BrainDomainAnswer {
    return {
      status: 'completed',
      answer: `${answer}。`,
      citations,
      grounding: 'db_skill',
      blocks: [this.reservationTableBlock(item ? [item] : [], citations.map((citation) => citation.sourceId))],
      metadata: { capabilityKey: input.card.key, answerScope, rangeLabel: range.label, count: item ? 1 : 0, ...extraMetadata },
    };
  }

  private reservationTableBlock(
    rows: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'],
    citationIds: string[],
    columns = ['date', 'startTime', 'endTime', 'customerName', 'projectName', 'beauticianName', 'status', 'attentionItems'],
  ): Extract<BrainResponseBlock, { kind: 'table' }> {
    return { kind: 'table', rows: rows.map((item) => this.reservationRow(item)), columns, citationIds };
  }

  private reservationRow(item: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'][number]) {
    const attentionItems = item.attentionItems ?? [];
    return {
      reservationId: item.reservationId,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime ?? '',
      customerName: item.customerName,
      memberLevel: item.memberLevel,
      projectName: item.projectName,
      projectTypeName: item.projectTypeName ?? '',
      beauticianName: item.beauticianName ?? '未分配',
      status: item.status,
      attentionItems: attentionItems.join('；'),
    };
  }

  private summarizeReservationRows(rows: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations']) {
    return rows.slice(0, 20).map((item, index) => {
      const attentionItems = item.attentionItems ?? [];
      return `${index + 1}. ${item.date} ${item.startTime}${item.endTime ? `-${item.endTime}` : ''} ${item.customerName}，${item.projectName}${item.beauticianName ? `，美容师 ${item.beauticianName}` : ''}${attentionItems.length ? `，注意：${attentionItems.join('；')}` : ''}`;
    }).join('；');
  }

  private resolveEntityName(input: BrainCapabilityExecutionInput, entityType: 'customer' | 'beautician') {
    const mention = structuredEntityMentions(input.args as BrainCapabilityToolArgs).find((entity) => entity.entityType === entityType && entity.source !== 'system')?.mention;
    const cleaned = String(mention ?? '').replace(/(?:美容师|老师|客户|顾客|女士|先生)$/g, '').trim();
    if (cleaned && !/^(这个|那个|某个|哪个|各个|每个|所有|全部|当前|下一个|下一位)$/.test(cleaned)) return cleaned;
    if (entityType === 'customer') {
      const matched = input.question.match(/([\u4e00-\u9fa5]{2,4})的预约/);
      const candidate = matched?.[1];
      if (candidate && !/^(这个|那个|客户|顾客|所有|全部|今天|明天|下午|上午)$/.test(candidate)) return candidate;
    } else {
      const matched = input.question.match(/([\u4e00-\u9fa5]{1,4})(?:美容师|老师)/);
      const candidate = matched?.[1];
      if (candidate && !/^(哪个|某个|这个|各个|每个|所有|全部)$/.test(candidate)) return candidate;
    }
    return undefined;
  }

  private resolveQuestionTimeWindow(question: string): { startTime: string; endTime: string; exactTime?: string } | undefined {
    const exact = question.match(/(上午|下午|晚上)?\s*([零一二两三四五六七八九十\d]{1,3})\s*点(?:([0-5]?\d)\s*分|半)?/);
    if (exact) {
      let hour = this.chineseHour(exact[2]!);
      if (Number.isFinite(hour)) {
        if ((exact[1] === '下午' || exact[1] === '晚上') && hour < 12) hour += 12;
        const minute = exact[3] ? Number(exact[3]) : question.includes('半') ? 30 : 0;
        const exactTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        return { startTime: exactTime, endTime: exactTime, exactTime };
      }
    }
    if (question.includes('上午')) return { startTime: '00:00', endTime: '11:59' };
    if (question.includes('下午')) return { startTime: '12:00', endTime: '23:59' };
    return undefined;
  }

  private chineseHour(value: string) {
    if (/^\d+$/.test(value)) return Number(value);
    const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (value === '十') return 10;
    if (value.startsWith('十')) return 10 + (digits[value[1]!] ?? 0);
    if (value.endsWith('十')) return (digits[value[0]!] ?? 0) * 10;
    if (value.includes('十')) return (digits[value[0]!] ?? 0) * 10 + (digits[value[2]!] ?? 0);
    return digits[value] ?? Number.NaN;
  }

  private timeInWindow(value: string, window: { startTime: string; endTime: string; exactTime?: string }) {
    return value >= window.startTime && value <= window.endTime;
  }

  private isCancelledReservation(status: string) {
    return ['cancelled', 'canceled', '已取消'].includes(status);
  }

  private isPendingConfirmation(status: string) {
    return ['pending', '待确认'].includes(status);
  }

  private isPendingArrival(status: string) {
    return ['pending', 'confirmed', 'scheduled', '待确认', '已确认'].includes(status);
  }

  private isArrivedReservation(status: string) {
    return ['checked_in', 'in_service', 'arrived', 'completed', 'served', '已到店', '服务中', '已完成'].includes(status);
  }

  private reservationAt(
    item: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'][number],
    timezone: string,
  ) {
    return new Date(`${item.date}T${item.startTime}:00${timezone === 'Asia/Shanghai' ? '+08:00' : 'Z'}`);
  }

  private nextBeauticianItems(
    rows: Awaited<ReturnType<BrainSkillRuntimeService['buildBeauticianServiceSummary']>>['nextTasks'],
    timezone: string,
  ) {
    const now = Date.now();
    const future = rows.filter((item) => new Date(`${item.date}T${item.startTime}:00${timezone === 'Asia/Shanghai' ? '+08:00' : 'Z'}`).getTime() >= now);
    return future.length ? future : rows;
  }

  private formatDuration(minutes: number) {
    if (!minutes) return '0 分钟';
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours ? `${hours} 小时` : ''}${remainder ? `${remainder} 分钟` : ''}`;
  }

  private formatClock(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
  }

  private formatDateTime(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
  }

  private formatDateOnly(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  }

  private async productSalesAmount(storeId: number, startDate: Date, endDate: Date) {
    if (!this.prisma) throw new Error('product_sales_amount_prisma_unavailable');
    const result = await this.prisma.orderItem.aggregate({
      where: {
        itemType: 'product',
        order: {
          storeId,
          status: { in: ['completed', 'paid'] },
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      _sum: { netAmount: true },
    });
    return Number(result._sum.netAmount ?? 0);
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
