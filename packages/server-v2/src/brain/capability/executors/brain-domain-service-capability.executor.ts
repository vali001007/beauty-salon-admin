import { Injectable, Optional } from '@nestjs/common';
import { BrainTimeRangeParserService, type BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import {
  BrainCustomerFactResolverService,
  type BrainCustomerIdentityClarification,
} from '../../domain/brain-customer-fact-resolver.service.js';
import {
  extractCustomerPhoneTail,
  extractSpecificCustomerNameFromMention,
  extractSpecificCustomerNameFromQuestion,
  isSpecificCustomerProjectRecommendationQuestion,
} from '../../domain/brain-customer-identity.js';
import { defaultBrainDateRange } from '../../domain/brain-domain-formatters.js';
import { MarketingService } from '../../../marketing/marketing.service.js';
import { CustomerLifecycleOntologyService } from '../../../marketing/customer-lifecycle-ontology.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CustomerFeedbackService } from '../../../customer-feedback/customer-feedback.service.js';
import { CustomerWaitingService } from '../../../reservations/customer-waiting.service.js';
import { GapOpportunityService } from '../../../scheduling/gap-opportunity.service.js';
import { AgentV2BusinessMetricQueryService } from '../../../agent-v2/tools/agent-v2-business-metric-query.service.js';
import { OperationProfitService } from '../../../operation-profit/operation-profit.service.js';
import type { BrainDomainAnswer } from '../../domain/brain-domain-adapter.types.js';
import {
  BrainDataQualityGuardService,
  type BrainDataQualityAssessment,
} from '../../inspection/brain-data-quality-guard.service.js';
import type { BrainResponseBlock } from '../../response/brain-response.types.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import { BrainPredictionSkillsService } from '../../skills/brain-prediction-skills.service.js';
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
  question?: string,
): string | undefined {
  if (!entity || (entity.source === 'system' && !question?.includes(entity.mention))) return undefined;
  return extractSpecificCustomerNameFromMention(entity.mention) || extractCustomerPhoneTail(entity.mention)
    ? entity.mention
    : undefined;
}

const CAPABILITY_KEYS = [
  'store_operations_overview',
  'manager_staff_overview',
  'customer_feedback_overview',
  'customer_waiting_loss_overview',
  'appointment_gap_list',
  'front_desk_operations_overview',
  'beautician_service_overview',
  'beautician_material_preparation',
  'beautician_customer_card_progress',
  'inventory_operations_overview',
  'finance_risk_overview',
  'marketing_growth_overview',
  'marketing_automation_rule_preview',
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
    @Optional() private readonly gapOpportunities?: GapOpportunityService,
    @Optional() private readonly sharedBusinessMetrics?: AgentV2BusinessMetricQueryService,
    @Optional() private readonly operationProfit?: OperationProfitService,
    @Optional() private readonly predictionSkills?: BrainPredictionSkillsService,
  ) {}

  @BrainCapability({
    key: 'store_operations_overview',
    name: '店长经营概览',
    description:
      '组合实收、订单、客户、客单价、经营目标、预约到店、当前在店、支付拆分、项目与美容师排行、员工忙闲、趋势和周期对比，返回可追溯的门店经营概览。支持下季度营业额透明基线预测，必须披露 90 天数据覆盖、对账通过率、历史滚动回测误差、置信区间和限制；可信证据不足时停止输出预测金额。跨周期逐日差距问题未指定指标时，按已发布实收指标 metric.paid_amount 比较并披露口径。退款和优惠的精确问数由财务经营风险能力处理。',
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
      '帮我预测下个季度的营业额',
    ],
    negativeExamples: ['帮我直接修改本月经营目标', '查询其他门店的经营数据'],
    synonyms: [
      '经营概览',
      '经营总结',
      '店里情况',
      '门店经营诊断',
      '经营对比',
      '目标完成率',
      '客单价',
      '美容师忙闲',
      '新客老客到店',
      '今日风险',
      '紧急事项',
      '营业额预测',
      '营收预测',
      '预测可信度',
      '历史回测',
    ],
    businessDefinitionKeys: [
      'metric.paid_amount',
      'metric.average_order_value',
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
    mappingOutputs: ['staffRanking'],
    name: '店长员工运营分析',
    description:
      '按当前门店和时间范围查询在职美容师、职级、项目技能、严格排班、请假、在岗状态，并分析服务次数、独立客户数、客户复购率、业绩、提成、排班忙闲和可用空档。支持按用户明确指定的员工指标排行、对比和工作饱和度诊断。试用期、转正待办和客户归属变更没有后台事实闭环时必须明确拒答，不得用通用员工排行替代。客户投诉与满意度由专用客户反馈能力处理。',
    intents: ['query', 'ranking', 'comparison', 'diagnosis'],
    examples: [
      '这个月谁的业绩最好',
      '哪个美容师接的客人最多',
      '各美容师今天的排班情况，有没有空档',
      '帮我看一下各美容师的服务次数对比',
      '帮我看一下员工这周的工作饱和度',
      '谁的客户复购率最高',
      '这个月提成最高的是谁，大概多少',
      '本月员工总提成大概多少',
      '今天谁请假了，有没有影响接待',
      '店里现在有多少个在职美容师',
      '唐伊是什么职级',
      '唐伊会做哪些项目',
      '唐伊上个月的排班是怎样的',
      '能做肩颈舒压养护的美容师昨天有谁在岗',
      '有没有员工这周业绩明显下滑',
      '顾然的业绩趋势怎么样',
      '去年同期美容师的连带销售能力对比',
      '去年同期哪个职级产出最高',
      '有没有主力美容师本周业绩下滑',
      '技能覆盖有短板吗，某些项目缺人做',
      '唐伊业绩下滑，建议怎么帮她',
      '昨天排班怎么优化能提升产能',
      '给宋乔制定成长建议',
      '技能缺口怎么补，要不要培训',
      '新员工试用期表现怎么样',
      '有没有员工到期转正需要我处理',
      '有没有员工的客户被别的美容师挖走的迹象',
    ],
    negativeExamples: ['查看其他门店员工数据', '直接修改员工排班或提成', '最近有没有客户投诉或者表达不满'],
    synonyms: [
      '员工运营分析',
      '美容师服务排行',
      '美容师接客排行',
      '员工服务次数对比',
      '员工客户复购率排行',
      '员工提成排行',
      '员工排班空档',
      '员工职级',
      '美容师项目技能',
      '美容师严格排班',
      '美容师在岗名单',
      '员工工作饱和度',
      '员工业绩下滑',
      '员工业绩趋势',
      '美容师连带销售',
      '员工职级产出',
      '主力美容师下滑',
      '项目技能覆盖短板',
      '员工业绩下滑建议',
      '排班产能优化',
      '员工成长建议',
      '技能培训建议',
      '员工转正待办',
      '客户归属流转',
    ],
    businessDefinitionKeys: [
      'metric.staff_service_count',
      'metric.staff_unique_customer_count',
      'metric.staff_customer_repurchase_rate',
      'metric.staff_commission_amount',
      'metric.staff_service_revenue',
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
    description:
      '基于统一客户服务反馈事实，查询当前门店投诉、未解决投诉、满意度、评价采集覆盖率和美容师客诉排行。无反馈记录时必须同时披露采集覆盖率，不得把未采集解释为没有投诉。',
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
    description:
      '基于统一客户等待事实，查询当前门店等待中、已服务、离店、因等待过久离店和等待记录采集覆盖率。没有结构化离店原因或采集覆盖不足时必须披露缺口，不得用取消预约或爽约替代等待流失。',
    intents: ['query', 'ranking', 'trend', 'diagnosis', 'recommendation'],
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
    key: 'appointment_gap_list',
    mappingOutputs: ['appointmentGaps'],
    name: '门店可预约空档清单',
    description:
      '基于当前门店排班、预约占用和可用容量，计算指定日期范围内可预约的具体空档时段。只返回日期、开始时间、结束时间、可用容量和预计收入，不自动匹配客户、不创建触达任务、不修改预约。',
    intents: ['query', 'diagnosis'],
    examples: [
      '今天哪个时间段还有空档',
      '明天下午有哪些可预约时段',
      '列出今天还能加客的空档',
      '今年空档太多建议怎么填',
    ],
    negativeExamples: ['直接把客户加进空档', '给最合适的客户发送邀约', '修改美容师排班'],
    synonyms: ['预约空档时段', '可加客时间段', '可预约时段', '空档清单'],
    businessDefinitionKeys: ['entity.reservation'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations'],
    allowedRoles: ['store_manager', 'receptionist'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  appointmentGapList(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('appointment_gap_list', args, input);
  }

  @BrainCapability({
    key: 'front_desk_operations_overview',
    name: '前台现场运营概览',
    description:
      '查询当前门店前台现场的预约到店、员工忙闲、到店率、爽约率和服务超时等汇总与异常事实。指定钟点、指定客户、指定美容师、预约项目分类、首个/下一个/最后一个预约以及预约名单明细由门店预约清单能力负责，避免两个能力同时声明同一问题。',
    intents: ['query', 'diagnosis'],
    examples: [
      '今天前台现场情况怎么样',
      '前台现场的预约到店和员工忙闲概览',
      '前台现场有哪些服务超时和接待风险',
      '今年的预约到店转化率是多少',
      '今年哪些时段的预约最满',
      '今年预约转化率趋势',
      '今年爽约集中在哪些客户或时段',
      '怎么降低今年的爽约率',
      '今年高峰人手不够怎么调度',
    ],
    negativeExamples: [
      '今天有几个预约是做面部的，几个是身体的',
      '今天下午还有几个预约没到',
      '帮我搜一下今天预约了但还没来的客人',
      '下午3点那个预约是谁，有什么要注意的',
      '今天赵美容师的预约安排',
      '今天下午最后一个预约是几点，是谁',
      '有没有预约了但还没确认的客人',
      '有没有预约超过两小时没有确认的',
      '这个月预约最多的是哪几天',
      '直接替我修改客户预约',
      '查询其他门店的预约情况',
      '判断客户是否因为等待时间长而离开',
      '预测哪些客户一定会爽约',
      '确认预约通知是否已经送达',
    ],
    synonyms: [
      '前台概览',
      '现场运营',
      '预约到店情况',
      '待到店客户',
      '已到店客户',
      '预约爽约率',
      '到店率',
      '员工忙闲',
      '服务超时',
      '接待能力',
    ],
    businessDefinitionKeys: [
      'entity.reservation',
      'entity.customer',
      'entity.beautician',
      'dimension.customerName',
      'dimension.projectName',
    ],
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
    description:
      '仅基于当前登录账号绑定的美容师身份，查询个人预约客户、开始与结束时间、首个/下一个/最后一个预约、预约间空档、计划服务时长、取消记录、首次到店、提前到店、上次服务项目、客户注意事项、个人业绩、提成和项目排行。未绑定美容师档案时失败关闭，绝不退化为全店数据。',
    intents: ['query', 'diagnosis', 'recommendation'],
    examples: [
      '我今天有几个客人，分别几点',
      '下一个客人是谁，做什么项目',
      '我今天第一个客人几点来',
      '今天最后一个客人几点结束',
      '我今天有没有空档，几点到几点',
      '下一个客人上次做了什么，有没有什么特殊要求',
      '今天我总共要服务几个小时',
      '有没有客人取消了',
      '我今天的客人里有没有首次来的新客',
      '今天有没有客人提前到了在等我',
      '我这周的预约安排',
      '帮我看一下今天客人的上次服务记录',
      '今天有没有安排我去做培训或其他任务',
      '我今天的客人里有没有 VIP 需要特别对待',
      '下一个客人有哪些已记录的注意事项',
      '这个客人皮肤比较敏感，用什么护理方案最安全',
      '有没有哪个客户最近好久没来了，我应该联系一下',
    ],
    negativeExamples: [
      '查看其他美容师的客户过敏史',
      '直接替我修改客户护理记录',
      '查询培训或非预约任务安排',
      '推断客户情绪状态',
    ],
    synonyms: [
      '我的服务安排',
      '美容师工作台',
      '我的预约客户',
      '我的空档',
      '我的取消预约',
      '我的业绩',
      '我的提成',
      '下一位客户',
      '最后一位客户',
      '服务注意事项',
      '个人项目排行',
      '我服务过的沉睡客户',
      '我的久未到店客户',
    ],
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
    description:
      '仅基于当前登录美容师的有效预约和项目 BOM，汇总计划使用的产品、耗材、标准数量及对应项目。没有 BOM 时明确列出缺口，不用商品销量或库存排行替代。',
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
    description:
      '仅基于当前登录美容师的预约客户和有效 CustomerCard，查询卡项总次数、已用次数、剩余次数和到期日。没有统一续卡阈值或项目推荐规则时只展示事实，不自动判定必须续卡。',
    intents: ['query', 'recommendation'],
    examples: [
      '下一个客人的疗程做到哪一步了',
      '她的疗程做了几次了，还有几次',
      '今天有没有需要我帮客人续卡或者推荐项目的',
    ],
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
    mappingOutputs: ['expiringBatches'],
    name: '库存采购运营概览',
    description: '组合库存金额、低库存、临期批次、库存消耗、采购建议、供应商和最近采购单，返回只读库存运营诊断。',
    intents: ['query', 'ranking', 'diagnosis', 'recommendation'],
    examples: [
      '本月库存有什么风险',
      '现在哪些产品库存不够了',
      '哪些产品该补货了',
      '本月库存采购总体情况怎么样',
      '我们一般临期产品是怎么处理的',
      '有没有快过期的产品，数量多少',
      '有什么产品积压太久了',
      '进货太多导致积压的产品有哪些',
      '过期的护肤品怎么处理，有没有规定',
      '给我一份库存金额、低库存、临期和采购建议总览',
      '哪些耗材消耗速度最快',
      '有没有哪个项目因为缺耗材没法做',
      '紧致抗衰护理的库存耗材跟得上销量吗',
      '这个月产品销售额是多少',
      '最近30天库存周转率如何',
      '最近30天耗占比的趋势',
    ],
    negativeExamples: ['直接创建采购单', '修改商品当前库存'],
    synonyms: [
      '库存概览',
      '库存风险',
      '采购建议',
      '低库存',
      '临期库存',
      '快过期产品',
      '库存积压',
      '产品积压',
      '慢周转库存',
    ],
    businessDefinitionKeys: [
      'entity.product',
      'entity.project',
      'dimension.productId',
      'dimension.productName',
      'dimension.projectName',
      'metric.stock_risk_score',
      'metric.inventory_consumption_quantity',
      'metric.inventory_operational_turnover_ratio',
      'metric.inventory_consumption_occupancy_ratio',
      'metric.product_sales_amount',
      'metric.project_service_count',
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
    description:
      '组合实收、支付方式、收入趋势、退款、优惠、成本、毛利和会员卡负债；同时承接指定卡项的核销确认收入，以及指定项目下订单粒度的收入、成本和利润查询。项目汇总毛利和订单粒度利润是不同交付合同。',
    intents: ['query', 'comparison', 'diagnosis'],
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
      '房租水电这个月花了多少',
      '这个月打折优惠减少了多少收入',
      '这个月因为退款损失了多少收入',
      '查一下毛利异常是折扣、成本还是项目结构造成的',
      '储值卡余额总计多少，如果客户都来消费我们能撑住吗',
      '这个月次卡销售了多少金额',
      '本月毛利、经营利润和成本收入比分别多少',
      '截至现在储值负债和次卡未履约负债各有多少',
      '哪些订单毛利为负，每张订单毛利分别多少',
      '商品订单的成本和毛利是多少',
      '某位美容师本周的提成构成',
      '查某张次卡截至指定时点的核销确认收入',
      '查某个项目的订单在指定期间的利润情况',
      '帮我统计一下本月折扣总金额和折扣率',
      '本月退款和上月比增加了多少',
      '本月卖得最好的次卡是哪个',
      '最近三个月有订单支付和金额对不上吗',
    ],
    negativeExamples: ['直接修改结算数据', '查看其他门店的财务数据', '有没有项目成本明显上涨影响毛利的'],
    synonyms: [
      '财务概览',
      '财务风险',
      '收入成本分析',
      '退款优惠风险',
      '退款原因',
      '商品毛利排行',
      '低于成本销售',
      '大额异常退款',
      '会员卡负债',
      '毛利下降',
      '利润率变差',
      '盈利能力下降',
      '不赚钱',
      '毛利根因',
      '项目结构影响',
      '次卡销售排行',
      '最畅销次卡',
    ],
    businessDefinitionKeys: [
      'metric.paid_amount',
      'metric.refund_amount',
      'metric.refund_count',
      'metric.discount_amount',
      'metric.operating_cost_amount',
      'metric.gross_profit_amount',
      'metric.gross_margin_rate',
      'metric.operating_profit_amount',
      'metric.cost_income_ratio',
      'metric.cash_shift_reconciliation_rate',
      'metric.stored_value_liability',
      'metric.unfulfilled_card_liability',
      'metric.card_recognized_revenue_amount',
      'metric.order_gross_profit_amount',
      'metric.order_total_cost_amount',
      'metric.negative_margin_order_count',
      'metric.prepaid_order_gross_profit_amount',
      'metric.product_order_total_cost_amount',
      'metric.product_order_gross_profit_amount',
      'metric.staff_commission_component_amount',
      'metric.product_gross_margin_rate',
      'metric.product_below_cost_sale_count',
      'entity.product',
      'entity.payment_record',
      'entity.product_order',
      'entity.project',
      'dimension.projectName',
      'dimension.orderId',
      'dimension.orderNo',
      'dimension.orderKind',
      'dimension.orderBusinessType',
      'dimension.cardName',
      'dimension.commissionType',
      'dimension.beauticianId',
      'dimension.beauticianName',
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
    mappingOutputs: ['priorityCustomers'],
    name: '营销增长运营概览',
    description:
      '组合客户分层、跟进优先级、渠道触达、转化、归因收入和自动化策略；对高端护理、套餐或项目推广问题，复用营销推荐事实与门店真实项目生成客户适配名单。',
    intents: ['query', 'ranking', 'diagnosis', 'recommendation'],
    examples: [
      '本月营销增长情况怎么样',
      '哪些客户最值得优先跟进，渠道转化如何',
      '活动触达和归因收入有哪些问题',
      '我想做个高端护理套餐推广，找哪些客户合适',
    ],
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
    key: 'marketing_automation_rule_preview',
    name: '营销自动化规则预览',
    description:
      '根据客户生命周期、消费完成、卡项临期、新客到店、生日或疗程进度等受治理触发条件，生成可审阅的自动化规则预览。只说明触发条件、推荐动作和保护条件，不发布规则、不发送消息、不修改客户权益。',
    intents: ['workflow', 'recommendation', 'draft', 'action'],
    examples: [
      '能不能在客户消费后自动给她推荐下一个适合的项目',
      '设计一个客户45天没来时自动提醒的规则',
      '做一个次卡快过期时自动提醒续购的流程',
      '新客到店三天后自动创建跟进任务怎么设置',
    ],
    negativeExamples: [
      '查看自动化规则实际转化效果',
      '立即发布规则并发送消息',
      '查询其他门店的自动化策略',
      '帮我做一个针对 VIP 客户的专属活动',
      '给即将到期的次卡客户写一条温馨提醒',
      '给首次办卡的客户写一条欢迎词',
    ],
    synonyms: ['自动推荐规则', '自动跟进规则预览', '客户生命周期自动化', '消费后项目推荐', '规则草稿'],
    businessDefinitionKeys: ['entity.customer', 'entity.project'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:view', 'core:customer:view'],
    allowedRoles: ['marketing', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  marketingAutomationRulePreview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('marketing_automation_rule_preview', args, input);
  }

  @BrainCapability({
    key: 'reservation_list',
    mappingOutputs: ['customerIds'],
    name: '门店预约清单',
    description:
      '按服务端解析的时间范围查询当前门店预约，支持指定客户、指定美容师、上午/下午、指定时点、待确认、首个/下一个/最后一个预约、项目分类、预约日期排行，以及预约客户原始会员等级和特别接待准备查询；问题已给出明确钟点时，“那个预约”按当前钟点查询，不依赖上轮列表；未发布统一 VIP 等级映射时只展示原始会员等级并披露口径缺口，不执行创建、改期或取消。',
    intents: ['query'],
    examples: [
      '今天有哪些预约',
      '明天下午预约清单',
      '现在几点了，下一个预约是谁，什么时候',
      '张美丽的预约是几点，做什么项目',
      '下午3点那个预约是谁，有什么要注意的',
      '帮我看一下今天赵美容师的预约安排',
      '有没有预约了但还没确认的客人',
      '有没有预约超过两小时没有确认的',
      '列出今天所有有效预约清单',
      '查询明天预约名单和项目明细',
      '这个月预约最多的是哪几天',
      '今天有预约的客人里有没有 VIP 需要特别准备',
      '明天预约客户的会员等级分别是什么',
      '把今天预约客人的会员等级列出来',
    ],
    negativeExamples: ['直接帮我改期', '取消这个预约', '查询其他门店预约', '确认通知是否送达', '预测客户一定会爽约'],
    synonyms: [
      '预约清单',
      '预约排期',
      '下一个预约',
      '第一个预约',
      '最后一个预约',
      '预约安排',
      '时段预约',
      '待确认预约',
      '预约分类',
      '预约日期排行',
      '预约客户会员等级',
      '预约 VIP 接待准备',
      '高等级会员预约',
    ],
    businessDefinitionKeys: [
      'entity.reservation',
      'entity.customer',
      'entity.project',
      'entity.beautician',
      'dimension.customerName',
      'dimension.projectName',
      'dimension.customerLevel',
    ],
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
    mappingOutputs: ['inactiveCustomers', 'vipCustomers'],
    name: '客户事实与客群查询',
    description:
      '查询当前门店的精确客户事实、VIP、新老客、周期新客转化、到店年龄画像、沉睡客户、沉睡客户触达后的预约/到店/消费唤醒迹象、生日关怀、重要客户到店、营销活动响应、办卡未预约、低余次卡、开卡未核销、高价值低活跃客户、客户复购率、平均回访间隔，以及消费频率或消费金额明显下降的客户名单。定性客群使用已治理默认口径执行并在答案中披露，不要求用户选择内部阈值。',
    intents: ['query', 'ranking', 'comparison', 'diagnosis'],
    examples: [
      '最近哪些老客好久没来了，帮我列一下',
      '帮我找一下45天没来的客户，大概有多少人',
      '帮我找一下三个月没来消费的客户',
      '我们店里的 VIP 客户有多少个',
      '哪些客户卡里的次数快用完了还没约',
      '哪些客户是高价值但最近不太活跃的',
      '哪些客户最近消费频率明显下降',
      '哪些客户最近消费明显减少',
      '最近一季新客户中完成复购的人数是多少',
      '做过指定护理项目的客户平均消费是多少',
      '有健康档案并记录过敏史的客户名单',
      '上周新老客户的消费金额对比',
      '上周客户到店频次分布',
      '按获客渠道比较客户转化和消费质量',
      '储值余额偏高的客户风险名单',
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
    synonyms: [
      '客户事实',
      '客户名单',
      '沉睡客户',
      '沉睡客户唤醒迹象',
      '客户回流信号',
      '触达后预约客户',
      '触达后到店客户',
      '触达后消费客户',
      '未到店客户',
      '长期未消费客户',
      'VIP 客户',
      '生日关怀客户',
      '重要到店客户',
      '活动响应客户',
      '办卡未预约客户',
      '低余次卡客户',
      '次卡临期高余量客户',
      '次卡低使用客户',
      '开卡未核销客户',
      '老客回头率',
      '平均回访间隔',
      '高价值低活跃客户',
      '消费频率下降客户',
      '消费金额下降客户',
      '新客二次消费',
      '项目客户平均消费',
      '过敏健康档案客户',
      '会员等级占比',
      '新老客消费对比',
      '客户到店频次分布',
      '渠道客户质量',
      '储值余额异常客户',
      '新客来源渠道',
      '新客转化',
      '到店年龄画像',
    ],
    businessDefinitionKeys: [
      'entity.customer',
      'entity.reservation',
      'entity.project',
      'entity.beautician',
      'dimension.customerId',
      'dimension.customerName',
      'dimension.customerLevel',
      'dimension.customerSource',
      'dimension.customerAgeGroup',
      'dimension.projectName',
      'dimension.beauticianName',
      'metric.new_customer_count',
      'metric.new_customer_conversion_count',
      'metric.new_customer_conversion_rate',
      'metric.dormant_reactivation_customer_count',
      'metric.average_order_value',
      'metric.paid_amount',
    ],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:customer:view'],
    allowedRoles: ['store_manager', 'receptionist', 'marketing', 'finance', 'customer_service'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  customerFactsLookup(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('customer_facts', args, input);
  }

  @BrainCapability({
    key: 'marketing_customer_segment',
    name: '营销客户分群摘要',
    description:
      '基于当前门店客户、订单、项目类型、优惠和客户卡事实，返回营销分群摘要或消费分层、优惠敏感、基础项目未升单、疗程续购等具体客户名单；指定客户的流失风险只能读取最新完成模型批次中的 CustomerPredictionSnapshot。',
    intents: ['query', 'ranking', 'diagnosis'],
    examples: [
      '本月客户可以分成哪些营销人群',
      'VIP 和沉睡客户分别有多少人',
      '帮我把客户按消费金额分一下层',
      '有没有客户对优惠很敏感，老是等打折才来',
      '帮我找一下只做过基础项目没有升单的客户',
      '疗程快结束的客户有多少，适合推续购',
      '新客中哪些人最有潜力转成长期客户',
      '有没有客户对某个项目特别感兴趣但还没办卡',
      '未来30天哪些客户复购评分最高',
      '哪些客户的营销响应评分最高',
      '预测某位客户的12个月生命周期价值',
      '预测马欣怡的流失风险有多高',
    ],
    negativeExamples: [
      '直接给沉睡客户群发消息',
      '查看其他门店的客户分群',
      '查询未处理客户投诉',
      '判断会员权益使用后的满意度',
    ],
    synonyms: [
      '客户分群',
      '营销客群',
      'VIP客户分层',
      '沉睡客户分层',
      '消费金额分层',
      '优惠敏感客户',
      '基础项目未升单客户',
      '疗程续购客户',
      '新客长期潜力',
      '项目兴趣未办卡',
      '客户复购预测排行',
      '营销响应预测排行',
      '客户12个月生命周期价值',
      '客户流失风险预测',
    ],
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
    description:
      '根据用户明确表达的预约提醒、空档邀约、老客召回或到店邀请目标生成可编辑文案草稿。该能力不查询客户名单、不自动发送，也不要求用户先指定具体收件人。',
    intents: ['draft'],
    examples: [
      '生成一条温和的预约提醒',
      '拟一段老客召回话术',
      '写一条空档邀约短信',
      '准备一段不过度推销的到店邀请',
      '给即将到期的次卡客户写一条温馨提醒',
      '给首次办卡的客户写一条欢迎词',
    ],
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
    description:
      '按当前门店和时间范围汇总实收金额并按支付方式拆分；对明确的储值卡问题，分别统计储值充值和储值消耗流水，不用支付方式或会员卡负债代替。',
    intents: ['query', 'ranking', 'comparison', 'trend'],
    examples: [
      '本月实收多少',
      '其中哪种支付方式最多',
      '本月实收按支付方式怎么分',
      '今天实收按支付方式怎么分',
      '今天现金收了多少，微信支付宝各多少',
      '帮我查一下今天收了多少现金',
      '今天有几笔是用储值卡消费的',
      '今天刷卡消费有几笔，金额多少',
      '最近三十天每天收入走势',
      '这个月比上个月少收了多少',
      '收入环比是涨了还是跌了，差额多少',
      '今天储值卡消耗了多少，新充值了多少',
      '最近三个月各支付方式的金额分别多少',
      '最近三个月营业额和最近7天比怎么样',
      '最近三个月订单量的趋势',
    ],
    negativeExamples: ['直接修改支付记录', '查询其他门店的支付明细'],
    synonyms: [
      '支付方式拆分',
      '收款渠道',
      '实收构成',
      '收入趋势',
      '实收走势',
      '收入环比',
      '实收对比',
      '收款增减',
      '微信现金占比',
      '储值卡充值',
      '储值卡消耗',
      '储值流水',
    ],
    businessDefinitionKeys: ['metric.paid_amount', 'dimension.paymentMethod'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    allowedRoles: ['finance', 'store_manager', 'receptionist'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  financePaymentBreakdown(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('finance_payment_breakdown', args, input);
  }

  @BrainCapability({
    key: 'inventory_procurement_advice',
    name: '库存采购建议',
    description:
      '基于当前库存、安全库存、最小采购量、供应映射和有效报价生成只读采购建议；数据质量不足时返回限制，不创建采购单。',
    intents: ['query', 'recommendation'],
    examples: ['哪些商品需要补货，建议采购多少', '给我一份当前库存采购建议', '最近采购了什么，花了多少钱'],
    negativeExamples: ['直接创建并提交采购单', '修改商品安全库存'],
    synonyms: ['采购建议', '补货建议', '采购清单', '库存补货'],
    businessDefinitionKeys: [
      'entity.product',
      'dimension.productId',
      'dimension.productName',
      'metric.stock_risk_score',
    ],
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
        if (
          /(?:预测|预估|预计).*(?:下个季度|下季度|未来季度).*(?:营业额|营收|收入)|(?:下个季度|下季度|未来季度).*(?:营业额|营收|收入).*(?:预测|预估|预计)/.test(
            input.question,
          )
        ) {
          const forecast = await this.skillRuntime.buildManagerRevenueForecastBaseline({
            storeId: input.context.storeId,
            asOf: new Date(),
          });
          const qualitySummary = `90 天窗口有 ${forecast.sampleDays} 个营业日样本，覆盖率 ${(forecast.dataCoverageRate * 100).toFixed(1)}%，已确认且对账通过 ${(forecast.reconciliationRate * 100).toFixed(1)}%。`;
          const backtestSummary =
            forecast.backtest.weightedAbsolutePercentageError === null
              ? '历史样本不足，尚不能形成有效回测。'
              : `滚动回测 ${forecast.backtest.evaluationDays} 天，误差 ${(forecast.backtest.weightedAbsolutePercentageError * 100).toFixed(1)}%，回测准确度 ${((forecast.backtest.accuracyRate ?? 0) * 100).toFixed(1)}%。`;
          if (
            forecast.status === 'insufficient' ||
            forecast.estimatedRevenue === null ||
            forecast.lowerBound === null ||
            forecast.upperBound === null ||
            forecast.averageDailyRevenue === null
          ) {
            const limitations = forecast.limitations.length > 0 ? forecast.limitations : ['当前日结样本不足。'];
            return {
              status: 'completed',
              answer: `当前无法形成下季度营业额预测：${qualitySummary}${backtestSummary}${limitations.join('；')} Ami Brain 不会在样本不足时输出伪精确金额。`,
              citations: [
                {
                  sourceType: 'db_skill',
                  sourceId: 'store_manager_revenue_forecast_baseline',
                  label: '下季度营业额透明基线预测',
                },
              ],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'diagnosis',
                  findings: [
                    { title: '预测证据不足', detail: `${qualitySummary}${backtestSummary}`, severity: 'warning' },
                  ],
                  citationIds: ['store_manager_revenue_forecast_baseline'],
                },
                { kind: 'limitations', items: [qualitySummary, backtestSummary, ...limitations] },
              ],
              metadata: {
                capabilityKey: 'store_operations_overview',
                answerScope: 'manager_revenue_forecast_insufficient',
                modelVersion: forecast.modelVersion,
                generatedAt: forecast.generatedAt,
                sampleDays: forecast.sampleDays,
                dataCoverageRate: forecast.dataCoverageRate,
                reconciliationRate: forecast.reconciliationRate,
                confidence: forecast.confidence,
                confidenceLabel: forecast.confidenceLabel,
                backtest: forecast.backtest,
                completionCriteria: ['daily_settlement_history_loaded', 'forecast_withheld_for_insufficient_evidence'],
              },
            };
          }
          const limitations = [...forecast.limitations, '预测未包含节假日、活动预算和人员变化，不是经营承诺值。'];
          return {
            status: 'completed',
            answer: `下季度营业额基线预测 ${forecast.estimatedRevenue.toFixed(2)} 元，区间 ${forecast.lowerBound.toFixed(2)} 至 ${forecast.upperBound.toFixed(2)} 元，置信度 ${(forecast.confidence * 100).toFixed(1)}%（${forecast.confidenceLabel}）。${qualitySummary}${backtestSummary}最近 28 个可用营业日日均 ${forecast.averageDailyRevenue.toFixed(2)} 元，预测周期 ${forecast.forecastDays} 天；模型版本 ${forecast.modelVersion}。${limitations.join('；')}`,
            citations: [
              {
                sourceType: 'db_skill',
                sourceId: 'store_manager_revenue_forecast_baseline',
                label: '下季度营业额透明基线预测',
              },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '下季度基线预测', value: `${forecast.estimatedRevenue.toFixed(2)} 元` },
                  {
                    label: '预测区间',
                    value: `${forecast.lowerBound.toFixed(2)} - ${forecast.upperBound.toFixed(2)} 元`,
                  },
                  {
                    label: '置信度',
                    value: `${(forecast.confidence * 100).toFixed(1)}%（${forecast.confidenceLabel}）`,
                  },
                  {
                    label: '回测准确度',
                    value:
                      forecast.backtest.accuracyRate === null
                        ? '样本不足'
                        : `${(forecast.backtest.accuracyRate * 100).toFixed(1)}%`,
                  },
                ],
                citationIds: ['store_manager_revenue_forecast_baseline'],
              },
              {
                kind: 'diagnosis',
                findings: [
                  {
                    title: '数据覆盖',
                    detail: qualitySummary,
                    severity: forecast.dataCoverageRate >= 0.8 ? 'info' : 'warning',
                  },
                  {
                    title: '历史回测',
                    detail: backtestSummary,
                    severity: (forecast.backtest.accuracyRate ?? 0) >= 0.65 ? 'info' : 'warning',
                  },
                ],
                citationIds: ['store_manager_revenue_forecast_baseline'],
              },
              { kind: 'limitations', items: limitations },
            ],
            metadata: {
              capabilityKey: 'store_operations_overview',
              answerScope: 'manager_revenue_forecast_backtested',
              modelVersion: forecast.modelVersion,
              generatedAt: forecast.generatedAt,
              forecastStart: forecast.forecastStart,
              forecastEnd: forecast.forecastEnd,
              sampleDays: forecast.sampleDays,
              dataCoverageRate: forecast.dataCoverageRate,
              reconciliationRate: forecast.reconciliationRate,
              duplicateBusinessDateCount: forecast.duplicateBusinessDateCount,
              confidence: forecast.confidence,
              confidenceLabel: forecast.confidenceLabel,
              backtest: forecast.backtest,
              completionCriteria: [
                'daily_settlement_history_loaded',
                'historical_backtest_completed',
                'transparent_forecast_baseline_computed',
              ],
            },
          };
        }
        if (
          /(?:等待时间长|等待过久|久等).*(?:离开|走了|流失)|(?:离开|走了|流失).*(?:等待时间长|等待过久|久等)/.test(
            input.question,
          )
        ) {
          const limitation =
            '客户等待事实表和预约接待入口已上线，但当前门店尚未采集可证明等待过久离店的记录。Ami Brain 不会用预约取消、爽约、经营概览或普通备注替代离店原因。';
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
            ...(overrun.impactedCount > 0
              ? [
                  {
                    title: '服务超时影响后续预约',
                    detail: `${range.label}有 ${overrun.overrunCount} 个服务超时，影响 ${overrun.impactedCount} 个后续预约。`,
                    severity: 'critical' as const,
                  },
                ]
              : []),
            ...(reception.pendingArrival > 0 && availableStaffCount === 0
              ? [
                  {
                    title: '接待能力不足',
                    detail: `${range.label}有 ${reception.pendingArrival} 位客户待到店，当前没有可接待员工。`,
                    severity: 'critical' as const,
                  },
                ]
              : []),
            ...(inventory.lowStockProducts.length > 0
              ? [
                  {
                    title: '低库存待复核',
                    detail: `${inventory.lowStockProducts.length} 个 SKU 低于安全库存：${inventory.lowStockProducts
                      .slice(0, 3)
                      .map((item) => item.name)
                      .join('、')}。`,
                    severity: 'warning' as const,
                  },
                ]
              : []),
            ...(inventory.expiringStockValue > 0
              ? [
                  {
                    title: '临期库存待处理',
                    detail: `未来 30 天临期库存估算金额 ${inventory.expiringStockValue.toFixed(2)} 元。`,
                    severity: 'warning' as const,
                  },
                ]
              : []),
            ...(finance.grossMarginRate !== undefined && finance.grossMarginRate > 0 && finance.grossMarginRate < 0.4
              ? [
                  {
                    title: '毛利率低于预警线',
                    detail: `${range.label}毛利率 ${(finance.grossMarginRate * 100).toFixed(1)}%，低于 40% 预警线。`,
                    severity: 'warning' as const,
                  },
                ]
              : []),
            ...(finance.refundAmount > 0
              ? [
                  {
                    title: '退款待复核',
                    detail: `${range.label}退款 ${finance.refundCount} 笔、合计 ${finance.refundAmount.toFixed(2)} 元。`,
                    severity: 'warning' as const,
                  },
                ]
              : []),
            ...(reception.noShow >= 2 && reception.noShowRate >= 0.2
              ? [
                  {
                    title: '爽约率偏高',
                    detail: `${range.label}爽约 ${reception.noShow} 人，爽约率 ${(reception.noShowRate * 100).toFixed(1)}%。`,
                    severity: 'warning' as const,
                  },
                ]
              : []),
          ];
          const limitation =
            '本摘要只覆盖当前已接入的预约接待、服务超时、财务退款/毛利和库存风险；设备、消防、客户反馈、服务事故等未落地事实不会被推断为无风险。';
          const answer = findings.length
            ? `${range.label}发现 ${findings.length} 项需要优先处理的已证实事项：${findings.map((item, index) => `${index + 1}. ${item.title}：${item.detail}`).join(' ')} ${limitation}`
            : `${range.label}在已接入事实范围内没有发现需要马上处理的事项。${limitation}`;
          return this.applyDataQualityGuard(
            {
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
                ...(findings.length
                  ? [
                      {
                        kind: 'diagnosis' as const,
                        findings,
                        citationIds: [
                          'reception_operations_snapshot',
                          'reception_service_overrun_analysis',
                          'finance_risk_summary',
                          'inventory_risk_summary',
                        ],
                      },
                    ]
                  : []),
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
            },
            dataQuality,
          );
        }
        const comparisonRange = this.resolveComparisonRange(input, range);
        const [operations, reception, finance, comparisonOperations, comparisonReception, comparisonFinance] =
          await Promise.all([
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
            ? [
                {
                  title: '预约爽约',
                  detail: `${range.label}有 ${reception.noShow} 个爽约，爽约率 ${(reception.noShowRate * 100).toFixed(1)}%。`,
                  severity: 'warning' as const,
                },
              ]
            : []),
        ];
        const requestedMetricKeys = structuredDefinitionKeys(input.args.metrics);
        const averageOrderValueRequested =
          requestedMetricKeys.has('metric.average_order_value') || /客单价|平均每(?:笔|单)/.test(input.question);
        const averageOrderValueRef = averageOrderValueRequested
          ? structuredDefinitionRef(input.args.metrics, 'metric.average_order_value')
          : undefined;
        const citations = [
          ...(averageOrderValueRequested
            ? [
                {
                  sourceType: 'business_definition',
                  sourceId: averageOrderValueRef
                    ? `${averageOrderValueRef.definitionKey}@${averageOrderValueRef.definitionVersion}`
                    : 'metric.average_order_value',
                  label: '业务定义：平均客单价',
                },
              ]
            : []),
          {
            sourceType: 'db_skill',
            sourceId: 'store_manager_operations_analysis',
            label: '经营收入、客户、项目与员工分析',
          },
          { sourceType: 'db_skill', sourceId: 'reception_operations_snapshot', label: '预约到店与员工忙闲快照' },
          { sourceType: 'db_skill', sourceId: 'finance_risk_summary', label: '退款、优惠与毛利风险' },
        ];
        const citationIds = citations.map((item) => item.sourceId);
        if (
          /(?:最大|最高).*(?:一笔|单笔).*(?:消费|订单)|(?:消费|订单).*(?:最大|最高).*(?:一笔|单笔)/.test(input.question)
        ) {
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: operations.largestOrder
                ? `${range.label}最大一笔消费为 ${operations.largestOrder.amount.toFixed(2)} 元，订单号 ${operations.largestOrder.orderNo}${operations.largestOrder.customerName ? `，客户 ${operations.largestOrder.customerName}` : ''}。`
                : `${range.label}没有已完成消费记录，无法形成最大单笔消费。`,
              citations: [citations[0]!],
              grounding: 'db_skill',
              blocks: operations.largestOrder
                ? [
                    {
                      kind: 'kpi',
                      items: [
                        {
                          label: '最大单笔消费',
                          value: `${operations.largestOrder.amount.toFixed(2)} 元`,
                          hint: operations.largestOrder.orderNo,
                        },
                      ],
                      citationIds: [citations[0]!.sourceId],
                    },
                  ]
                : [{ kind: 'limitations', items: ['no_data:largest_completed_order_not_found'] }],
              metadata: {
                capabilityKey: 'store_operations_overview',
                rangeLabel: range.label,
                answerScope: 'largest_completed_order',
              },
            },
            dataQuality,
          );
        }
        const targetItems = this.buildTargetKpis(operations, reception.total);
        const comparisonItems =
          comparisonRange && comparisonOperations && comparisonReception && comparisonFinance
            ? this.buildOperationsComparisonItems({
                operations,
                reception,
                finance,
                previousOperations: comparisonOperations,
                previousReception: comparisonReception,
                previousFinance: comparisonFinance,
              })
            : [];
        const dailyComparisonRows =
          comparisonRange && comparisonOperations
            ? this.buildDailyComparisonRows(
                operations.dailyTrend,
                comparisonOperations.dailyTrend,
                comparisonRange.current,
                comparisonRange.previous,
              )
            : [];
        if (averageOrderValueRequested) {
          const previousAverage = comparisonOperations?.avgTransaction;
          const delta = previousAverage === undefined ? undefined : operations.avgTransaction - previousAverage;
          const answer =
            comparisonRange && previousAverage !== undefined
              ? `${comparisonRange.label}，${comparisonRange.current.label}客单价 ${operations.avgTransaction.toFixed(2)} 元，${comparisonRange.previous.label}客单价 ${previousAverage.toFixed(2)} 元，差额 ${delta! >= 0 ? '+' : ''}${delta!.toFixed(2)} 元。`
              : `${range.label}客单价 ${operations.avgTransaction.toFixed(2)} 元。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations: [
                citations[0]!,
                citations.find((item) => item.sourceId === 'store_manager_operations_analysis')!,
              ],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [{ label: `${range.label}客单价`, value: `${operations.avgTransaction.toFixed(2)} 元` }],
                  citationIds: citations.map((item) => item.sourceId),
                },
                ...(comparisonRange && previousAverage !== undefined
                  ? [
                      {
                        kind: 'comparison' as const,
                        items: [
                          {
                            label: '客单价',
                            current: `${operations.avgTransaction.toFixed(2)} 元`,
                            previous: `${previousAverage.toFixed(2)} 元`,
                            delta: `${delta! >= 0 ? '+' : ''}${delta!.toFixed(2)} 元`,
                          },
                        ],
                        citationIds: citations.map((item) => item.sourceId),
                      },
                    ]
                  : []),
              ],
              metadata: {
                capabilityKey: 'store_operations_overview',
                answerScope: 'average_order_value',
                metricDefinitionKey: 'metric.average_order_value',
                rangeLabel: range.label,
                comparisonRange: comparisonRange
                  ? { current: comparisonRange.current.label, previous: comparisonRange.previous.label }
                  : undefined,
                completionCriteria: ['average_order_value_loaded', ...(comparisonRange ? ['comparison_loaded'] : [])],
              },
            },
            dataQuality,
          );
        }
        if (comparisonRange && /哪天.*差距最大|差距最大.*哪天/.test(input.question)) {
          const largestGap = dailyComparisonRows[0];
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: largestGap
                ? `${comparisonRange.label}，按实收金额比较，差距最大的是${largestGap.day}：${largestGap.currentDate || comparisonRange.current.label}实收 ${largestGap.currentRevenue.toFixed(2)} 元，${largestGap.previousDate || comparisonRange.previous.label}实收 ${largestGap.previousRevenue.toFixed(2)} 元，差额 ${largestGap.delta}。`
                : `${comparisonRange.label}缺少逐日实收数据，无法判断哪天差距最大。`,
              citations: [citations[0]!],
              grounding: 'db_skill',
              blocks: dailyComparisonRows.length
                ? [
                    {
                      kind: 'ranking',
                      rows: dailyComparisonRows,
                      columns: ['day', 'currentDate', 'currentRevenue', 'previousDate', 'previousRevenue', 'delta'],
                      citationIds: [citations[0]!.sourceId],
                    },
                    {
                      kind: 'limitations',
                      items: ['问题未指定比较指标，本次按统一已发布实收指标 metric.paid_amount 进行逐日比较。'],
                    },
                  ]
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
            },
            dataQuality,
          );
        }
        if (/(?:哪天.*(?:特别差|最差)|(?:特别差|最差).*哪天)/.test(input.question)) {
          const dailyTrend = operations.dailyTrend
            .filter((item) => Number.isFinite(item.revenue))
            .sort((left, right) => left.revenue - right.revenue || left.date.localeCompare(right.date));
          const averageRevenue = dailyTrend.length
            ? dailyTrend.reduce((sum, item) => sum + item.revenue, 0) / dailyTrend.length
            : 0;
          const lowest = dailyTrend[0];
          const lowestRows = lowest ? dailyTrend.filter((item) => item.revenue === lowest.revenue) : [];
          const dayLabel = lowestRows.map((item) => item.date).join('、');
          const reasonLimitation =
            '当前经营事实只能定位逐日实收结果，缺少逐日订单取消、客户流失、排班缺口和营销触达的统一归因数据，不能直接断言原因。';
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: lowest
                ? `${range.label}按实收最低判断，表现最差的是 ${dayLabel}，实收 ${lowest.revenue.toFixed(2)} 元；期间日均实收 ${averageRevenue.toFixed(2)} 元。${reasonLimitation}`
                : `${range.label}缺少逐日实收数据，无法定位表现最差的日期。${reasonLimitation}`,
              citations: [citations[0]!],
              grounding: 'db_skill',
              blocks: [
                ...(lowest
                  ? [
                      {
                        kind: 'ranking' as const,
                        rows: dailyTrend.map((item) => ({ date: item.date, revenue: item.revenue })),
                        columns: ['date', 'revenue'],
                        citationIds: [citations[0]!.sourceId],
                      },
                    ]
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
            },
            dataQuality,
          );
        }
        return this.applyDataQualityGuard(
          {
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
                  {
                    label: '新客',
                    value: `${operations.newCustomerCount} 人`,
                    hint: `老客 ${operations.returningCustomerCount} 人`,
                  },
                  { label: '退款', value: `${finance.refundAmount.toFixed(2)} 元`, hint: `${finance.refundCount} 笔` },
                  ...(operations.largestOrder
                    ? [
                        {
                          label: '最大订单',
                          value: `${operations.largestOrder.amount.toFixed(2)} 元`,
                          hint: operations.largestOrder.orderNo,
                        },
                      ]
                    : []),
                ],
                citationIds,
              },
              ...(targetItems.length
                ? [{ kind: 'kpi' as const, items: targetItems, citationIds: ['store_manager_operations_analysis'] }]
                : [
                    {
                      kind: 'limitations' as const,
                      items: ['当前时间范围未配置经营目标，无法计算目标完成率和剩余差额'],
                    },
                  ]),
              ...(comparisonItems.length ? [{ kind: 'comparison' as const, items: comparisonItems, citationIds }] : []),
              ...(dailyComparisonRows.length
                ? [
                    {
                      kind: 'ranking' as const,
                      rows: dailyComparisonRows,
                      columns: ['day', 'currentDate', 'currentRevenue', 'previousDate', 'previousRevenue', 'delta'],
                      citationIds: ['store_manager_operations_analysis'],
                    },
                  ]
                : []),
              ...(operations.paymentBreakdown.length
                ? [
                    {
                      kind: 'ranking' as const,
                      rows: operations.paymentBreakdown.map((item) => ({
                        paymentMethod: item.method,
                        amount: item.amount,
                      })),
                      columns: ['paymentMethod', 'amount'],
                      citationIds: ['store_manager_operations_analysis'],
                    },
                  ]
                : []),
              ...(operations.projectRanking.length
                ? [
                    {
                      kind: 'ranking' as const,
                      rows: operations.projectRanking.map((item) => ({ project: item.name, serviceCount: item.count })),
                      columns: ['project', 'serviceCount'],
                      citationIds: ['store_manager_operations_analysis'],
                    },
                  ]
                : []),
              ...(operations.beauticianRanking.length
                ? [
                    {
                      kind: 'ranking' as const,
                      rows: operations.beauticianRanking.map((item) => ({
                        beautician: item.name,
                        serviceCount: item.count,
                      })),
                      columns: ['beautician', 'serviceCount'],
                      citationIds: ['store_manager_operations_analysis'],
                    },
                  ]
                : []),
              ...(operations.dailyTrend.length
                ? [
                    {
                      kind: 'chart' as const,
                      chartType: 'line' as const,
                      rows: operations.dailyTrend,
                      xKey: 'date',
                      yKeys: ['revenue'],
                      citationIds: ['store_manager_operations_analysis'],
                    },
                  ]
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
                ? [
                    {
                      kind: 'diagnosis' as const,
                      findings: risks,
                      citationIds: ['finance_risk_summary', 'reception_operations_snapshot'],
                    },
                  ]
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
          },
          dataQuality,
        );
      }
      case 'manager_staff_overview': {
        if (/(投诉|客诉|差评|满意度|负面反馈)/.test(input.question)) {
          const limitation =
            '当前后台没有客户投诉、差评或满意度事实闭环，无法按美容师统计或排行。Ami Brain 不会用服务量、业绩或综合表现分替代客诉指标。';
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
          const limitation =
            '当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环，无法评价新员工试用期表现。Ami Brain 不会用服务量、接客数或通用业绩分替代试用期评估。';
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
        if (
          /(?:客户.*(?:被|让).*(?:别的|其他).*(?:美容师|员工).*(?:挖走|转走)|挖走.*客户|客户归属.*(?:变更|流转))/.test(
            input.question,
          )
        ) {
          const limitation =
            '当前后台没有客户归属历史、归属变更事件或转移原因事实闭环，无法判断客户是否被其他美容师挖走。Ami Brain 不会用当前客户归属、员工业绩或接客排行反推历史流转。';
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
        const strictDirectoryQuestion =
          /在职美容师|是什么职级|会做哪些项目|排班是怎样|有哪些美容师请假|谁在上班|谁在岗/.test(input.question) &&
          !/请假.*影响接待|影响接待.*请假/.test(input.question);
        if (strictDirectoryQuestion) {
          const directory = await this.skillRuntime.buildManagerStaffDirectoryFacts({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'manager_staff_directory_facts',
            label: '员工目录、职级、项目技能、排班与请假事实',
          };
          if (/在职美容师/.test(input.question)) {
            return this.applyDataQualityGuard(
              {
                status: 'completed',
                answer: `当前门店共有 ${directory.staff.length} 位在职美容师。`,
                citations: [citation],
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'kpi',
                    items: [{ label: '在职美容师', value: `${directory.staff.length} 人` }],
                    citationIds: [citation.sourceId],
                  },
                  {
                    kind: 'table',
                    rows: directory.staff.map((staff) => ({
                      beauticianId: staff.beauticianId,
                      staff: staff.name,
                      level: staff.level?.name ?? '未配置',
                    })),
                    columns: ['beauticianId', 'staff', 'level'],
                    citationIds: [citation.sourceId],
                  },
                ],
                metadata: {
                  capabilityKey: 'manager_staff_overview',
                  answerScope: 'active_beautician_count',
                  activeBeauticianCount: directory.staff.length,
                  completionCriteria: ['active_staff_directory_loaded'],
                },
              },
              dataQuality,
            );
          }

          const mentionedStaff = this.resolveMentionedManagerStaff(directory.staff, input.question);
          if (/是什么职级|会做哪些项目|排班是怎样/.test(input.question)) {
            if (mentionedStaff.length !== 1) {
              const question = mentionedStaff.length
                ? `当前门店有 ${mentionedStaff.length} 位同名美容师，请补充员工编号后继续。`
                : '没有在当前门店的在职美容师中识别到姓名，请补充完整姓名后继续。';
              return {
                status: 'completed',
                answer: question,
                citations: [citation],
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'clarification',
                    question,
                    options: mentionedStaff.map((staff) => ({
                      id: String(staff.beauticianId),
                      label: `${staff.name}（员工编号 ${staff.beauticianId}）`,
                      value: { beauticianId: staff.beauticianId },
                    })),
                  },
                ],
                metadata: {
                  capabilityKey: 'manager_staff_overview',
                  answerScope: 'staff_identity_clarification',
                  completion: { status: 'partial', missingCriteria: ['unique_staff_identity'], recoverable: true },
                },
              };
            }
            const staff = mentionedStaff[0]!;
            if (/是什么职级/.test(input.question)) {
              const levelName = staff.level?.name ?? '未配置职级';
              return this.applyDataQualityGuard(
                {
                  status: 'completed',
                  answer: `${staff.name}当前职级为：${levelName}。`,
                  citations: [citation],
                  grounding: 'db_skill',
                  blocks: [
                    {
                      kind: 'table',
                      rows: [
                        {
                          beauticianId: staff.beauticianId,
                          staff: staff.name,
                          levelId: staff.level?.levelId ?? null,
                          level: levelName,
                        },
                      ],
                      columns: ['beauticianId', 'staff', 'levelId', 'level'],
                      citationIds: [citation.sourceId],
                    },
                  ],
                  metadata: {
                    capabilityKey: 'manager_staff_overview',
                    answerScope: 'staff_level',
                    beauticianId: staff.beauticianId,
                    levelId: staff.level?.levelId ?? null,
                    completionCriteria: ['staff_level_loaded'],
                  },
                },
                dataQuality,
              );
            }
            if (/会做哪些项目/.test(input.question)) {
              const names = staff.projectSkills.map((skill) => skill.projectName);
              return this.applyDataQualityGuard(
                {
                  status: 'completed',
                  answer: names.length
                    ? `${staff.name}当前配置可做项目：${names.join('、')}。`
                    : `${staff.name}当前没有配置可做项目。`,
                  citations: [citation],
                  grounding: 'db_skill',
                  blocks: [
                    {
                      kind: 'table',
                      rows: staff.projectSkills.map((skill) => ({
                        beauticianId: staff.beauticianId,
                        staff: staff.name,
                        projectId: skill.projectId,
                        projectName: skill.projectName,
                        skillLevel: skill.skillLevel,
                        certified: skill.certified,
                      })),
                      columns: ['beauticianId', 'staff', 'projectId', 'projectName', 'skillLevel', 'certified'],
                      citationIds: [citation.sourceId],
                    },
                  ],
                  metadata: {
                    capabilityKey: 'manager_staff_overview',
                    answerScope: 'staff_project_skills',
                    beauticianId: staff.beauticianId,
                    projectIds: staff.projectSkills.map((skill) => skill.projectId),
                    completionCriteria: ['staff_project_skills_loaded'],
                  },
                },
                dataQuality,
              );
            }
            const scheduleRows = staff.schedules.map((schedule) => ({ staff: staff.name, ...schedule }));
            const timeOffRows = staff.timeOffs.map((timeOff) => ({ staff: staff.name, ...timeOff }));
            return this.applyDataQualityGuard(
              {
                status: 'completed',
                answer: scheduleRows.length
                  ? `${range.label}${staff.name}共有 ${scheduleRows.length} 条有效排班记录${timeOffRows.length ? `，另有 ${timeOffRows.length} 条已批准请假记录` : ''}。`
                  : `${range.label}${staff.name}没有有效排班记录${timeOffRows.length ? `，但有 ${timeOffRows.length} 条已批准请假记录` : ''}。`,
                citations: [citation],
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'table',
                    rows: scheduleRows,
                    columns: ['staff', 'date', 'startTime', 'endTime', 'status', 'source', 'scheduleId'],
                    citationIds: [citation.sourceId],
                  },
                  ...(timeOffRows.length
                    ? [
                        {
                          kind: 'table' as const,
                          rows: timeOffRows,
                          columns: ['staff', 'date', 'startTime', 'endTime', 'reason', 'timeOffId'],
                          citationIds: [citation.sourceId],
                        },
                      ]
                    : []),
                ],
                metadata: {
                  capabilityKey: 'manager_staff_overview',
                  answerScope: 'staff_schedule_detail',
                  beauticianId: staff.beauticianId,
                  rangeLabel: range.label,
                  scheduleCount: scheduleRows.length,
                  timeOffCount: timeOffRows.length,
                  completionCriteria: ['staff_schedule_rows_loaded', 'staff_time_off_rows_loaded'],
                },
              },
              dataQuality,
            );
          }

          if (/有哪些美容师请假/.test(input.question)) {
            const rows = directory.staff.flatMap((staff) =>
              staff.timeOffs.map((timeOff) => ({ beauticianId: staff.beauticianId, staff: staff.name, ...timeOff })),
            );
            const names = [...new Set(rows.map((row) => row.staff))];
            return this.applyDataQualityGuard(
              {
                status: 'completed',
                answer: names.length
                  ? `${range.label}请假的美容师有：${names.join('、')}。`
                  : `${range.label}没有已批准的美容师请假记录。`,
                citations: [citation],
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'table',
                    rows,
                    columns: ['beauticianId', 'staff', 'date', 'startTime', 'endTime', 'reason', 'timeOffId'],
                    citationIds: [citation.sourceId],
                  },
                ],
                metadata: {
                  capabilityKey: 'manager_staff_overview',
                  answerScope: 'staff_time_off_list',
                  rangeLabel: range.label,
                  beauticianIds: [...new Set(rows.map((row) => row.beauticianId))],
                  completionCriteria: ['approved_staff_time_off_loaded'],
                },
              },
              dataQuality,
            );
          }

          const projectName = this.resolveMentionedStaffProject(directory.staff, input.question);
          const rows = directory.staff
            .filter((staff) => !projectName || staff.projectSkills.some((skill) => skill.projectName === projectName))
            .filter((staff) => this.hasEffectiveStaffSchedule(staff))
            .map((staff) => ({
              beauticianId: staff.beauticianId,
              staff: staff.name,
              projectName: projectName ?? '',
              scheduleCount: staff.schedules.filter((schedule) =>
                ['available', 'working', 'published'].includes(schedule.status),
              ).length,
            }));
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: rows.length
                ? `${range.label}${projectName ? `能做${projectName}且` : ''}有有效在岗排班的美容师有：${rows.map((row) => row.staff).join('、')}。`
                : `${range.label}没有找到${projectName ? `能做${projectName}且` : ''}有有效在岗排班的美容师。`,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'table',
                  rows,
                  columns: ['beauticianId', 'staff', 'projectName', 'scheduleCount'],
                  citationIds: [citation.sourceId],
                },
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: 'staff_on_duty_list',
                rangeLabel: range.label,
                projectName: projectName ?? null,
                beauticianIds: rows.map((row) => row.beauticianId),
                completionCriteria: ['staff_schedule_rows_loaded', 'approved_staff_time_off_loaded'],
              },
            },
            dataQuality,
          );
        }
        if (
          /(?:排班).*(?:怎么|如何|怎样)?.*(?:优化|调整).*(?:产能|人效)|(?:提升|提高).*(?:产能|人效).*(?:排班)/.test(
            input.question,
          )
        ) {
          const [directory, analysis] = await Promise.all([
            this.skillRuntime.buildManagerStaffDirectoryFacts({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
            }),
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
            }),
          ]);
          const analysisById = new Map(analysis.staff.map((staff) => [staff.beauticianId, staff]));
          const rows = directory.staff
            .map((staff) => {
              const facts = analysisById.get(staff.beauticianId);
              const scheduledMinutes = staff.schedules.reduce((sum, schedule) => {
                const start = this.staffClockMinutes(schedule.startTime);
                let end = this.staffClockMinutes(schedule.endTime);
                if (end <= start) end += 24 * 60;
                return sum + Math.max(0, end - start);
              }, 0);
              const timeOffMinutes = Math.round((facts?.timeOffHours ?? 0) * 60);
              const netScheduledMinutes = Math.max(0, scheduledMinutes - timeOffMinutes);
              const serviceCount = facts?.serviceCount ?? 0;
              return {
                beauticianId: staff.beauticianId,
                staff: staff.name,
                scheduledHours: Number((scheduledMinutes / 60).toFixed(2)),
                timeOffHours: Number((timeOffMinutes / 60).toFixed(2)),
                netScheduledHours: Number((netScheduledMinutes / 60).toFixed(2)),
                serviceCount,
                uniqueCustomerCount: facts?.uniqueCustomerCount ?? 0,
                revenueAmount: facts?.revenueAmount ?? 0,
                servicesPerScheduledHour:
                  netScheduledMinutes > 0 ? Number((serviceCount / (netScheduledMinutes / 60)).toFixed(2)) : null,
              };
            })
            .sort(
              (left, right) =>
                (left.servicesPerScheduledHour ?? -1) - (right.servicesPerScheduledHour ?? -1) ||
                right.netScheduledHours - left.netScheduledHours ||
                left.staff.localeCompare(right.staff, 'zh-CN'),
            );
          const scheduledRows = rows.filter((row) => row.netScheduledHours > 0);
          const unusedRows = scheduledRows.filter((row) => row.serviceCount === 0);
          const lowYieldRows = scheduledRows.filter(
            (row) => row.serviceCount > 0 && (row.servicesPerScheduledHour ?? 0) < 0.25,
          );
          const suggestions = [
            ...(unusedRows.length
              ? [
                  `下一相似营业日优先复核 ${unusedRows.map((row) => row.staff).join('、')} 的整段空排班，并结合预约量缩短或错峰安排`,
                ]
              : []),
            ...(lowYieldRows.length
              ? [
                  `复核 ${lowYieldRows.map((row) => row.staff).join('、')} 的预约分配、可做项目覆盖和空档来源，避免只延长工时不增加服务机会`,
                ]
              : []),
            ...(rows.some((row) => row.timeOffHours > 0)
              ? ['请假时段应从可用工时中扣除，再安排具备对应项目技能的替补人员']
              : []),
          ];
          if (!suggestions.length) {
            suggestions.push(
              '当前排班与服务事实未显示明显空排，建议保持总工时并在下一相似营业日前按预约项目和员工技能做小时级复核',
            );
          }
          const citationIds = ['manager_staff_directory_facts', 'manager_staff_analysis'];
          const totalNetHours = scheduledRows.reduce((sum, row) => sum + row.netScheduledHours, 0);
          const totalServices = rows.reduce((sum, row) => sum + row.serviceCount, 0);
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: `${range.label}净排班 ${totalNetHours.toFixed(1)} 小时、完成服务 ${totalServices} 次。${suggestions.join('；')}。以上只生成排班优化建议，不修改或发布排班。`,
              citations: [
                {
                  sourceType: 'db_skill',
                  sourceId: 'manager_staff_directory_facts',
                  label: '员工排班、请假与项目技能事实',
                },
                {
                  sourceType: 'db_skill',
                  sourceId: 'manager_staff_analysis',
                  label: '员工服务、客户与业绩事实',
                },
              ],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '净排班工时', value: `${totalNetHours.toFixed(1)} 小时` },
                    { label: '完成服务', value: `${totalServices} 次` },
                    { label: '整段空排员工', value: `${unusedRows.length} 人` },
                  ],
                  citationIds,
                },
                {
                  kind: 'table',
                  rows,
                  columns: [
                    'staff',
                    'scheduledHours',
                    'timeOffHours',
                    'netScheduledHours',
                    'serviceCount',
                    'uniqueCustomerCount',
                    'revenueAmount',
                    'servicesPerScheduledHour',
                  ],
                  citationIds,
                },
                {
                  kind: 'diagnosis',
                  findings: suggestions.map((suggestion) => ({
                    title: '只读排班优化建议',
                    detail: suggestion,
                    severity: 'info' as const,
                  })),
                  citationIds,
                },
                {
                  kind: 'limitations',
                  items: [
                    '服务次数/净排班小时仅用于发现排班复核优先级，不等同于标准服务时长口径下的精确产能利用率。',
                    '只读建议：未修改、发布或预览任何排班动作。',
                  ],
                },
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: 'staff_schedule_capacity_optimization_advice',
                rangeLabel: range.label,
                totalNetScheduledHours: totalNetHours,
                totalServiceCount: totalServices,
                unusedScheduledStaffCount: unusedRows.length,
                lowYieldStaffCount: lowYieldRows.length,
                productivityProxy: 'completed_service_count_per_net_scheduled_hour',
                actionWriteCount: 0,
                completionCriteria: ['staff_schedule_loaded', 'staff_time_off_loaded', 'staff_service_facts_loaded'],
              },
            },
            dataQuality,
          );
        }
        if (
          /(?:技能覆盖|技能配置).*(?:短板|不足|缺口)|(?:技能).*(?:缺口|短板|不足)|(?:项目).*(?:缺人做|没人做|只有一人做)/.test(
            input.question,
          )
        ) {
          const coverage = await this.skillRuntime.buildManagerStaffSkillCoverage({
            storeId: input.context.storeId,
          });
          const trainingAdviceRequested = /(?:怎么补|如何补|培训|训练|提升)/.test(input.question);
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'manager_staff_skill_coverage',
            label: '在职美容师项目技能覆盖事实',
          };
          const rows = coverage.projects
            .filter((project) => project.staffCount <= 1)
            .map((project) => ({
              projectId: project.projectId,
              projectName: project.projectName,
              staffCount: project.staffCount,
              certifiedStaffCount: project.certifiedStaffCount,
              staffNames: project.staffNames.join('、'),
              coverageStatus: project.staffCount === 0 ? '无人覆盖' : '单人覆盖',
            }))
            .sort(
              (left, right) =>
                left.staffCount - right.staffCount ||
                left.certifiedStaffCount - right.certifiedStaffCount ||
                left.projectName.localeCompare(right.projectName, 'zh-CN'),
            );
          const uncoveredCount = rows.filter((row) => row.staffCount === 0).length;
          const singleCoveredCount = rows.filter((row) => row.staffCount === 1).length;
          const trainingSuggestions = rows.map((row) =>
            row.staffCount === 0
              ? `${row.projectName}：优先选择至少 2 位在职美容师完成基础训练，其中至少 1 位完成认证后再作为稳定可售能力`
              : `${row.projectName}：在现有 ${row.staffNames || '单人'} 覆盖之外补训第 2 位人员，并复核认证状态`,
          );
          const answer = rows.length
            ? `当前 ${coverage.projects.length} 个在售项目中有 ${rows.length} 个技能覆盖短板：${uncoveredCount} 个无人覆盖、${singleCoveredCount} 个仅 1 人覆盖。${trainingAdviceRequested ? `建议优先培训 ${rows.length} 个短板项目，顺序为无人覆盖、单人覆盖、认证不足。` : ''}短板口径为在职美容师技能配置人数不超过 1 人，认证人数单独披露。`
            : `当前 ${coverage.projects.length} 个在售项目均至少有 2 位在职美容师配置技能，按当前口径未发现技能覆盖短板。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '项目总数', value: `${coverage.projects.length} 个` },
                    { label: '覆盖短板', value: `${rows.length} 个` },
                    { label: '无人覆盖', value: `${uncoveredCount} 个` },
                    { label: '单人覆盖', value: `${singleCoveredCount} 个` },
                  ],
                  citationIds: [citation.sourceId],
                },
                {
                  kind: 'table',
                  rows,
                  columns: [
                    'projectId',
                    'projectName',
                    'coverageStatus',
                    'staffCount',
                    'certifiedStaffCount',
                    'staffNames',
                  ],
                  citationIds: [citation.sourceId],
                },
                ...(trainingAdviceRequested && trainingSuggestions.length
                  ? [
                      {
                        kind: 'diagnosis' as const,
                        findings: trainingSuggestions.map((suggestion) => ({
                          title: '培训优先级建议',
                          detail: suggestion,
                          severity: 'info' as const,
                        })),
                        citationIds: [citation.sourceId],
                      },
                      {
                        kind: 'limitations' as const,
                        items: ['只读建议：未创建培训任务、未修改员工技能或认证状态。'],
                      },
                    ]
                  : []),
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: 'staff_project_skill_coverage_gap',
                projectCount: coverage.projects.length,
                coverageGapCount: rows.length,
                coverageThreshold: 1,
                trainingAdviceRequested,
                actionWriteCount: 0,
                completionCriteria: ['active_projects_loaded', 'active_staff_skill_assignments_loaded'],
              },
            },
            dataQuality,
          );
        }
        if (/(?:连带销售|连带率|搭售能力|交叉销售)/.test(input.question)) {
          const analysis = await this.skillRuntime.buildManagerStaffCrossSellAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'manager_staff_cross_sell_analysis',
            label: '员工归属订单非赠品品类连带销售事实',
          };
          const rows = analysis.staff
            .filter((staff) => staff.attributedOrderCount > 0)
            .map((staff) => ({
              beauticianId: staff.beauticianId,
              staff: staff.name,
              attributedOrderCount: staff.attributedOrderCount,
              multiItemOrderCount: staff.multiItemOrderCount,
              crossSellRate: staff.crossSellRate,
              crossSellRateLabel: `${(staff.crossSellRate * 100).toFixed(1)}%`,
              averageItemKindCount: Number(staff.averageItemKindCount.toFixed(2)),
            }));
          const answer = rows.length
            ? `${range.label}美容师连带销售能力最高的是 ${rows[0]!.staff}，连带率 ${(rows[0]!.crossSellRate * 100).toFixed(1)}%。口径为该员工归属订单中，包含至少 2 种不同非赠品项目或商品的订单占比。`
            : `${range.label}当前没有连带率排行数据；该周期没有可归属到美容师的有效非赠品订单，暂时无法形成连带销售对比。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'ranking',
                  rows,
                  columns: [
                    'staff',
                    'crossSellRateLabel',
                    'multiItemOrderCount',
                    'attributedOrderCount',
                    'averageItemKindCount',
                  ],
                  citationIds: [citation.sourceId],
                },
                ...(!rows.length
                  ? [
                      {
                        kind: 'limitations' as const,
                        items: ['no_data: 当前没有连带率排行数据；该周期没有可归属到美容师的有效非赠品订单。'],
                      },
                    ]
                  : []),
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: 'staff_cross_sell_comparison',
                rangeLabel: range.label,
                staffCount: rows.length,
                crossSellDefinition: 'attributed_orders_with_at_least_two_distinct_non_gift_item_kinds_ratio',
                mappingOutputs: {
                  staffRanking: rows.map((item) => ({
                    entityType: 'beautician',
                    entityKey: String(item.beauticianId),
                    mention: item.staff,
                    source: 'system',
                    confidence: 1,
                  })),
                },
                completionCriteria: ['staff_attributed_order_items_loaded'],
              },
            },
            dataQuality,
          );
        }
        if (/(?:职级).*(?:产出|业绩|实收)|(?:产出|业绩|实收).*(?:职级)/.test(input.question)) {
          const [staffAnalysis, directory] = await Promise.all([
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
            }),
            this.skillRuntime.buildManagerStaffDirectoryFacts({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
            }),
          ]);
          const levelByStaff = new Map(
            directory.staff.map((staff) => [staff.beauticianId, staff.level?.name ?? '未配置职级']),
          );
          const aggregate = new Map<string, { staffCount: number; revenueAmount: number }>();
          for (const staff of staffAnalysis.staff) {
            const level = levelByStaff.get(staff.beauticianId) ?? '未配置职级';
            const current = aggregate.get(level) ?? { staffCount: 0, revenueAmount: 0 };
            current.staffCount += 1;
            current.revenueAmount += staff.revenueAmount;
            aggregate.set(level, current);
          }
          const rows = [...aggregate.entries()]
            .map(([level, facts]) => ({ level, ...facts }))
            .sort(
              (left, right) =>
                right.revenueAmount - left.revenueAmount ||
                right.staffCount - left.staffCount ||
                left.level.localeCompare(right.level, 'zh-CN'),
            );
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'manager_staff_level_revenue_analysis',
            label: '员工职级与提成来源业绩实收聚合事实',
          };
          const answer = rows.length
            ? `${range.label}产出最高的职级是 ${rows[0]!.level}，关联业绩实收 ${rows[0]!.revenueAmount.toFixed(2)} 元，覆盖 ${rows[0]!.staffCount} 位在职美容师。`
            : `${range.label}没有可用于职级产出分析的在职美容师记录。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'ranking',
                  rows,
                  columns: ['level', 'revenueAmount', 'staffCount'],
                  citationIds: [citation.sourceId],
                },
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: 'staff_level_revenue_ranking',
                rangeLabel: range.label,
                levelCount: rows.length,
                revenueDefinition: 'CommissionRecord.sourceAmount grouped by current BeauticianLevel',
                completionCriteria: ['staff_revenue_loaded', 'current_staff_level_loaded'],
              },
            },
            dataQuality,
          );
        }
        const staffTrendQuestion = /(?:业绩|实收).*(?:趋势|走势)|(?:趋势|走势).*(?:业绩|实收)/.test(input.question);
        const staffDeclineAdviceQuestion =
          /(?:业绩|实收).*(?:下滑|下降).*(?:建议|怎么帮|怎么办|如何帮)|(?:建议|怎么帮|怎么办|如何帮).*(?:业绩|实收).*(?:下滑|下降)/.test(
            input.question,
          );
        const namedStaffGrowthAdviceQuestion =
          /(?:给|帮).{0,8}(?:美容师|员工|技师)?.{0,6}(?:制定|做|给出).{0,4}(?:成长|提升|发展)(?:建议|方案)/.test(
            input.question,
          );
        if (staffTrendQuestion || staffDeclineAdviceQuestion || namedStaffGrowthAdviceQuestion) {
          const effectiveRange = this.resolveStaffPerformanceRange(input, range);
          const previousRange = this.previousComparableRange(effectiveRange);
          const [current, previous, directory] = await Promise.all([
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: effectiveRange.startDate,
              endDate: effectiveRange.endDate,
            }),
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: previousRange.startDate,
              endDate: previousRange.endDate,
            }),
            namedStaffGrowthAdviceQuestion
              ? this.skillRuntime.buildManagerStaffDirectoryFacts({
                  storeId: input.context.storeId,
                  startDate: effectiveRange.startDate,
                  endDate: effectiveRange.endDate,
                })
              : Promise.resolve(undefined),
          ]);
          const matches = this.resolveMentionedManagerStaff(current.staff, input.question);
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'manager_staff_performance_period_comparison',
            label: '指定员工当前期与上一等长周期服务、客户和业绩事实',
          };
          const directoryCitation = {
            sourceType: 'db_skill',
            sourceId: 'manager_staff_directory_facts',
            label: '指定员工当前职级、项目技能和认证事实',
          };
          if (matches.length !== 1) {
            const question = matches.length
              ? `当前门店识别到 ${matches.length} 位同名美容师，请补充员工编号后继续。`
              : '没有在当前门店的在职美容师中识别到姓名，请补充完整姓名后继续。';
            return {
              status: 'completed',
              answer: question,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'clarification',
                  question,
                  options: matches.map((staff) => ({
                    id: String(staff.beauticianId),
                    label: `${staff.name}（员工编号 ${staff.beauticianId}）`,
                    value: { beauticianId: staff.beauticianId },
                  })),
                },
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: 'staff_performance_identity_clarification',
                completion: { status: 'partial', missingCriteria: ['unique_staff_identity'], recoverable: true },
              },
            };
          }
          const staff = matches[0]!;
          const previousStaff = previous.staff.find((item) => item.beauticianId === staff.beauticianId);
          const previousRevenue = previousStaff?.revenueAmount ?? 0;
          const revenueChange = staff.revenueAmount - previousRevenue;
          const revenueChangeRate = previousRevenue > 0 ? revenueChange / previousRevenue : null;
          const comparisonRows = [
            {
              metric: '业绩实收',
              current: staff.revenueAmount,
              previous: previousRevenue,
              change: revenueChange,
              changeRate: revenueChangeRate,
            },
            {
              metric: '服务次数',
              current: staff.serviceCount,
              previous: previousStaff?.serviceCount ?? 0,
              change: staff.serviceCount - (previousStaff?.serviceCount ?? 0),
              changeRate: null,
            },
            {
              metric: '独立客户',
              current: staff.uniqueCustomerCount,
              previous: previousStaff?.uniqueCustomerCount ?? 0,
              change: staff.uniqueCustomerCount - (previousStaff?.uniqueCustomerCount ?? 0),
              changeRate: null,
            },
            {
              metric: '复购客户',
              current: staff.repeatCustomerCount,
              previous: previousStaff?.repeatCustomerCount ?? 0,
              change: staff.repeatCustomerCount - (previousStaff?.repeatCustomerCount ?? 0),
              changeRate: null,
            },
          ];
          if (!staffDeclineAdviceQuestion && !namedStaffGrowthAdviceQuestion) {
            const trend = revenueChange > 0 ? '上升' : revenueChange < 0 ? '下降' : '持平';
            const rateText =
              revenueChangeRate === null
                ? '上一周期为 0，无法计算比例'
                : `${Math.abs(revenueChangeRate * 100).toFixed(1)}%`;
            const answer = `${effectiveRange.label}${staff.name}业绩实收 ${staff.revenueAmount.toFixed(2)} 元，上一等长周期 ${previousRevenue.toFixed(2)} 元，${trend} ${Math.abs(revenueChange).toFixed(2)} 元（${rateText}）。`;
            return this.applyDataQualityGuard(
              {
                status: 'completed',
                answer,
                citations: [citation],
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'comparison',
                    items: [
                      {
                        label: staff.name,
                        current: `${staff.revenueAmount.toFixed(2)} 元`,
                        previous: `${previousRevenue.toFixed(2)} 元`,
                        delta:
                          revenueChangeRate === null
                            ? `${revenueChange.toFixed(2)} 元`
                            : `${(revenueChangeRate * 100).toFixed(1)}%`,
                      },
                    ],
                    citationIds: [citation.sourceId],
                  },
                  {
                    kind: 'table',
                    rows: comparisonRows,
                    columns: ['metric', 'current', 'previous', 'change', 'changeRate'],
                    citationIds: [citation.sourceId],
                  },
                ],
                metadata: {
                  capabilityKey: 'manager_staff_overview',
                  answerScope: 'named_staff_performance_trend',
                  beauticianId: staff.beauticianId,
                  rangeLabel: effectiveRange.label,
                  previousRangeLabel: previousRange.label,
                  defaultRangeApplied: effectiveRange.label === '最近30天',
                  completionCriteria: ['staff_current_period_loaded', 'staff_previous_equal_period_loaded'],
                },
              },
              dataQuality,
            );
          }
          const suggestions: string[] = [];
          if (staff.serviceCount < (previousStaff?.serviceCount ?? 0))
            suggestions.push('复核排班、预约分配和空档，确认服务机会是否减少');
          if (staff.uniqueCustomerCount < (previousStaff?.uniqueCustomerCount ?? 0))
            suggestions.push('查看新客及老客分配变化，优先补足可服务客户来源');
          if (staff.repeatCustomerCount < (previousStaff?.repeatCustomerCount ?? 0))
            suggestions.push('优先人工复盘上一周期服务客户的复购与回访情况');
          if (
            revenueChange < 0 &&
            staff.serviceCount >= (previousStaff?.serviceCount ?? 0) &&
            staff.uniqueCustomerCount >= (previousStaff?.uniqueCustomerCount ?? 0)
          ) {
            suggestions.push('服务量未同步下降，建议核对项目结构、客单和连带销售变化');
          }
          const directoryStaff = directory?.staff.find((item) => item.beauticianId === staff.beauticianId);
          if (namedStaffGrowthAdviceQuestion) {
            if (!directoryStaff?.projectSkills.length)
              suggestions.push('先补齐可做项目和技能等级配置，再制定可量化成长目标');
            else if (directoryStaff.projectSkills.filter((skill) => skill.certified).length < 2)
              suggestions.push('优先选择当前技能中未认证或门店覆盖薄弱的项目完成训练与认证');
            if (!suggestions.length) suggestions.push('保持当前优势，并选择一个门店覆盖薄弱项目作为下一阶段训练目标');
          } else if (revenueChange >= 0) {
            suggestions.push('当前数据不支持“业绩下滑”前提，暂不建议按下滑问题干预');
          }
          const answer = namedStaffGrowthAdviceQuestion
            ? `${effectiveRange.label}${staff.name}成长基线：业绩实收 ${previousRevenue.toFixed(2)} -> ${staff.revenueAmount.toFixed(2)} 元，服务 ${previousStaff?.serviceCount ?? 0} -> ${staff.serviceCount} 次，当前职级 ${directoryStaff?.level?.name ?? '未配置'}，已配置 ${directoryStaff?.projectSkills.length ?? 0} 项技能。建议：${suggestions.join('；')}。以上为只读成长建议，不创建培训、跟进、排班或营销动作。`
            : `${effectiveRange.label}${staff.name}业绩实收 ${revenueChange < 0 ? '下降' : revenueChange > 0 ? '上升' : '持平'}：${previousRevenue.toFixed(2)} -> ${staff.revenueAmount.toFixed(2)} 元。${suggestions.join('；')}。以上为只读诊断建议，不创建跟进、排班或营销动作。`;
          const adviceCitationIds = namedStaffGrowthAdviceQuestion
            ? [citation.sourceId, directoryCitation.sourceId]
            : [citation.sourceId];
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations: namedStaffGrowthAdviceQuestion ? [citation, directoryCitation] : [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'diagnosis',
                  findings: [
                    {
                      title: `${staff.name}业绩变化`,
                      detail: `${previousRevenue.toFixed(2)} -> ${staff.revenueAmount.toFixed(2)} 元`,
                      severity: revenueChange < 0 ? 'warning' : 'info',
                    },
                    ...suggestions.map((suggestion) => ({
                      title: '只读建议',
                      detail: suggestion,
                      severity: 'info' as const,
                    })),
                  ],
                  citationIds: adviceCitationIds,
                },
                {
                  kind: 'table',
                  rows: comparisonRows,
                  columns: ['metric', 'current', 'previous', 'change', 'changeRate'],
                  citationIds: [citation.sourceId],
                },
                ...(namedStaffGrowthAdviceQuestion
                  ? [
                      {
                        kind: 'table' as const,
                        rows: [
                          {
                            beauticianId: staff.beauticianId,
                            staff: staff.name,
                            level: directoryStaff?.level?.name ?? '未配置',
                            projectSkillCount: directoryStaff?.projectSkills.length ?? 0,
                            certifiedSkillCount:
                              directoryStaff?.projectSkills.filter((skill) => skill.certified).length ?? 0,
                            projectSkills:
                              directoryStaff?.projectSkills.map((skill) => skill.projectName).join('、') ?? '',
                          },
                        ],
                        columns: ['staff', 'level', 'projectSkillCount', 'certifiedSkillCount', 'projectSkills'],
                        citationIds: [directoryCitation.sourceId],
                      },
                    ]
                  : []),
                { kind: 'limitations', items: ['只读建议：未创建跟进任务、排班调整、营销触达或其他业务写入。'] },
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: namedStaffGrowthAdviceQuestion
                  ? 'named_staff_growth_diagnosis_advice'
                  : 'named_staff_decline_diagnosis_advice',
                beauticianId: staff.beauticianId,
                rangeLabel: effectiveRange.label,
                previousRangeLabel: previousRange.label,
                actionWriteCount: 0,
                completionCriteria: [
                  'staff_current_period_loaded',
                  'staff_previous_equal_period_loaded',
                  'read_only_suggestions_generated',
                  ...(namedStaffGrowthAdviceQuestion ? ['staff_level_and_skill_profile_loaded'] : []),
                ],
              },
            },
            dataQuality,
          );
        }
        if (
          /(?:主力).*(?:美容师|员工|技师)?.*(?:业绩|实收)?.*(?:下滑|下降)|(?:业绩|实收).*(?:主力).*(?:下滑|下降)/.test(
            input.question,
          )
        ) {
          const previousRange = this.previousComparableRange(range);
          const [current, previous] = await Promise.all([
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
            }),
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: previousRange.startDate,
              endDate: previousRange.endDate,
            }),
          ]);
          const previousRanked = previous.staff
            .filter((staff) => staff.revenueAmount > 0)
            .sort(
              (left, right) => right.revenueAmount - left.revenueAmount || left.name.localeCompare(right.name, 'zh-CN'),
            );
          const primaryCount = previousRanked.length ? Math.max(1, Math.ceil(previousRanked.length * 0.25)) : 0;
          const primaryStaff = previousRanked.slice(0, primaryCount);
          const currentById = new Map(current.staff.map((staff) => [staff.beauticianId, staff]));
          const rows = primaryStaff
            .map((previousStaff) => {
              const currentStaff = currentById.get(previousStaff.beauticianId);
              const currentRevenue = currentStaff?.revenueAmount ?? 0;
              return {
                beauticianId: previousStaff.beauticianId,
                staff: previousStaff.name,
                previousRankRevenue: previousStaff.revenueAmount,
                currentRevenue,
                changeAmount: currentRevenue - previousStaff.revenueAmount,
                declineRate: (previousStaff.revenueAmount - currentRevenue) / previousStaff.revenueAmount,
              };
            })
            .filter((staff) => staff.currentRevenue < staff.previousRankRevenue)
            .sort((left, right) => right.declineRate - left.declineRate);
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'manager_primary_staff_revenue_decline',
            label: '上一周期高位员工与当前期业绩对比事实',
          };
          const answer = !primaryStaff.length
            ? `${previousRange.label}没有业绩实收大于 0 的美容师，无法定义主力员工。`
            : rows.length
              ? `${range.label}发现 ${rows.length} 位主力美容师业绩下滑：${rows.map((staff) => `${staff.staff} 下降 ${(staff.declineRate * 100).toFixed(1)}%`).join('、')}。主力口径为上一等长周期业绩实收排名前 25%（至少 1 人）。`
              : `${range.label}未发现主力美容师业绩下滑。主力口径为上一等长周期业绩实收排名前 25%（至少 1 人）。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'comparison',
                  items: rows.map((staff) => ({
                    label: staff.staff,
                    current: `${staff.currentRevenue.toFixed(2)} 元`,
                    previous: `${staff.previousRankRevenue.toFixed(2)} 元`,
                    delta: `${(staff.declineRate * 100).toFixed(1)}%`,
                  })),
                  citationIds: [citation.sourceId],
                },
                {
                  kind: 'table',
                  rows: rows.map((staff) => ({
                    ...staff,
                    declineRateLabel: `${(staff.declineRate * 100).toFixed(1)}%`,
                  })),
                  columns: ['staff', 'currentRevenue', 'previousRankRevenue', 'changeAmount', 'declineRateLabel'],
                  citationIds: [citation.sourceId],
                },
              ],
              metadata: {
                capabilityKey: 'manager_staff_overview',
                answerScope: 'primary_staff_revenue_decline',
                rangeLabel: range.label,
                previousRangeLabel: previousRange.label,
                primaryStaffDefinition: 'previous_equal_period_revenue_top_25_percent_minimum_one',
                primaryStaffCount: primaryStaff.length,
                decliningPrimaryStaffCount: rows.length,
                completionCriteria: ['previous_period_primary_staff_ranked', 'current_period_revenue_compared'],
              },
            },
            dataQuality,
          );
        }
        if (/(?:服务了多少个客户|服务了多少客户|服务客户(?:数)?(?:有)?多少)/.test(input.question)) {
          const staffAnalysis = await this.skillRuntime.buildManagerStaffAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const matches = this.resolveMentionedManagerStaff(staffAnalysis.staff, input.question);
          if (matches.length === 1) {
            const staff = matches[0]!;
            return this.applyDataQualityGuard(
              {
                status: 'completed',
                answer: `${range.label}${staff.name}服务了 ${staff.uniqueCustomerCount} 位独立客户。`,
                citations: [{ sourceType: 'db_skill', sourceId: 'manager_staff_analysis', label: '员工服务客户事实' }],
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'kpi',
                    items: [{ label: `${staff.name}服务客户数`, value: `${staff.uniqueCustomerCount} 人` }],
                    citationIds: ['manager_staff_analysis'],
                  },
                ],
                metadata: {
                  capabilityKey: 'manager_staff_overview',
                  answerScope: 'staff_unique_customer_count_point_lookup',
                  beauticianId: staff.beauticianId,
                  uniqueCustomerCount: staff.uniqueCustomerCount,
                  rangeLabel: range.label,
                  completionCriteria: ['staff_service_customers_loaded'],
                },
              },
              dataQuality,
            );
          }
        }
        if (/(?:业绩|实收).*(?:明显)?(?:下滑|下降)|(?:下滑|下降).*(?:业绩|实收)/.test(input.question)) {
          const durationMs = Math.max(1, range.endDate.getTime() - range.startDate.getTime() + 1);
          const previousEndDate = new Date(range.startDate.getTime() - 1);
          const previousStartDate = new Date(previousEndDate.getTime() - durationMs + 1);
          const [current, previous] = await Promise.all([
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
            }),
            this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: previousStartDate,
              endDate: previousEndDate,
            }),
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
            .filter(
              (staff) =>
                staff.previousRevenue > 0 && staff.currentRevenue < staff.previousRevenue && staff.declineRate >= 0.3,
            )
            .sort(
              (left, right) => right.declineRate - left.declineRate || right.previousRevenue - left.previousRevenue,
            );
          const answer = rows.length
            ? `${range.label}发现 ${rows.length} 位员工业绩较上一同长度周期下降 30% 以上：${rows.map((staff) => `${staff.staff} 下降 ${(staff.declineRate * 100).toFixed(1)}%（${staff.previousRevenue.toFixed(2)} -> ${staff.currentRevenue.toFixed(2)} 元）`).join('；')}。`
            : `${range.label}未发现员工业绩较上一同长度周期下降 30% 以上。判断基于有效订单实收，并排除上一周期实收为 0 的员工。`;
          return {
            status: 'completed',
            answer,
            citations: [
              {
                sourceType: 'db_skill',
                sourceId: 'manager_staff_revenue_comparison',
                label: '员工当前期与上一期业绩对比',
              },
            ],
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
            ? [
                {
                  sourceType: 'business_definition',
                  sourceId: focusMetricRef
                    ? `${focusMetricRef.definitionKey}@${focusMetricRef.definitionVersion}`
                    : focusMetric,
                  label: `业务定义：${this.managerStaffMetricLabel(focusMetric)}`,
                },
              ]
            : []),
          { sourceType: 'db_skill', sourceId: 'manager_staff_analysis', label: '员工服务、客户、业绩与提成分析' },
          { sourceType: 'db_skill', sourceId: 'reception_operations_snapshot', label: '员工排班忙闲与可用空档' },
        ];
        const staffState = new Map(reception.staff.map((item) => [item.name, item]));
        const rows = this.orderManagerStaffRows(
          staffAnalysis.staff.map((item) => {
            const state = staffState.get(item.name);
            const performanceScore =
              100 *
              (Math.min(Math.max(item.serviceCount / 10, 0), 1) * 0.5 +
                Math.min(Math.max(item.revenueAmount / 5000, 0), 1) * 0.3 +
                Math.min(Math.max(item.repeatCustomerCount / 5, 0), 1) * 0.2);
            return {
              beauticianId: item.beauticianId,
              staff: item.name,
              performanceScore,
              serviceCount: item.serviceCount,
              completedCount: item.completedCount,
              uniqueCustomerCount: item.uniqueCustomerCount,
              repeatCustomerCount: item.repeatCustomerCount,
              customerRepurchaseRate:
                item.uniqueCustomerCount > 0 ? item.repeatCustomerCount / item.uniqueCustomerCount : 0,
              revenueAmount: item.revenueAmount,
              commissionAmount: item.commissionAmount,
              timeOffHours: item.timeOffHours,
              status: state?.onTimeOff
                ? '请假'
                : state?.inService
                  ? '服务中'
                  : state?.available
                    ? '可接待'
                    : '暂不可用',
              nextAvailableAt: state?.nextAvailableAt ?? '',
            };
          }),
          input.args.orderBy,
          input.question,
        );
        const visibleRows = rows.slice(0, this.resolveLimit(input.args.limit, 15));
        const commissionTotalQuestion =
          /(?:总提成|提成(?:合计|总共|一共)|提成.*(?:多少|金额))/.test(input.question) &&
          !/(?:最高|最低|谁|哪个|哪位|排行|排名|对比)/.test(input.question);
        if (focusMetric === 'metric.staff_commission_amount' && commissionTotalQuestion) {
          const totalCommission = rows.reduce((sum, item) => sum + item.commissionAmount, 0);
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: `${range.label}员工提成合计 ${totalCommission.toFixed(2)} 元，共覆盖 ${rows.length} 位美容师。`,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    {
                      label: '员工提成合计',
                      value: `${totalCommission.toFixed(2)} 元`,
                      hint: `${rows.length} 位美容师`,
                    },
                  ],
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
            },
            dataQuality,
          );
        }
        if (/(?:谁|哪些人)?.*请假.*影响接待|影响接待.*请假/.test(input.question)) {
          const leaveRows = rows.filter((item) => item.status === '请假' || item.timeOffHours > 0);
          const availableRows = rows.filter((item) => item.status === '可接待');
          const leaveLabel = leaveRows.length ? leaveRows.map((item) => item.staff).join('、') : '无人';
          const impact =
            leaveRows.length === 0
              ? '当前没有请假记录，从排班快照看未发现请假造成的接待影响。'
              : availableRows.length > 0
                ? `当前仍有 ${availableRows.length} 位美容师可接待，未发现接待能力完全中断。`
                : '当前没有美容师处于可接待状态，需要前台复核预约分配和等待风险。';
          return this.applyDataQualityGuard(
            {
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
                  findings: [
                    {
                      title: '请假对接待的当前影响',
                      detail: impact,
                      severity: leaveRows.length > 0 && availableRows.length === 0 ? 'warning' : 'info',
                    },
                  ],
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
            },
            dataQuality,
          );
        }
        const focusedColumns =
          focusMetric === 'metric.staff_customer_repurchase_rate'
            ? ['staff', 'customerRepurchaseRate', 'repeatCustomerCount', 'uniqueCustomerCount']
            : focusMetric === 'metric.staff_service_revenue'
              ? ['staff', 'revenueAmount']
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
        return this.applyDataQualityGuard(
          {
            status: 'completed',
            answer:
              focusedAnswer ??
              `${range.label}员工运营分析已完成，共 ${rows.length} 位美容师，包含服务次数、独立客户、客户复购率、业绩、提成、请假时长和当前空档。`,
            citations,
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'ranking',
                rows: visibleRows,
                columns: focusedColumns,
                citationIds: ['manager_staff_analysis'],
              },
              ...(!focusMetric
                ? [
                    {
                      kind: 'table' as const,
                      rows: visibleRows.map((item) => ({
                        staff: item.staff,
                        status: item.status,
                        nextAvailableAt: item.nextAvailableAt,
                        appointmentCount: staffState.get(item.staff)?.appointmentCount ?? 0,
                      })),
                      columns: ['staff', 'status', 'nextAvailableAt', 'appointmentCount'],
                      citationIds: ['reception_operations_snapshot'],
                    },
                  ]
                : []),
            ],
            metadata: {
              capabilityKey: 'manager_staff_overview',
              rangeLabel: range.label,
              staffCount: rows.length,
              focusMetric: focusMetric ?? null,
              mappingOutputs: {
                staffRanking: visibleRows.map((item) => ({
                  entityType: 'beautician',
                  entityKey: String(item.beauticianId),
                  mention: item.staff,
                  source: 'system',
                  confidence: 1,
                })),
              },
              componentCapabilities: ['manager_staff_analysis', 'reception_operations_snapshot'],
              completionCriteria: ['staff_performance_loaded', 'staff_schedule_loaded'],
            },
          },
          dataQuality,
        );
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
        const coverageLimitation =
          summary.completedServiceTaskCount > 0 && summary.collectionCoverageRate < 0.8
            ? `当前${coverageText}，未记录不代表客户没有不满。`
            : undefined;
        const citations = [
          { sourceType: 'db_skill', sourceId: 'customer_service_feedback_summary', label: '客户投诉与满意度统一事实' },
          { sourceType: 'db_skill', sourceId: 'customer_service_feedback_by_staff', label: '美容师客户反馈聚合' },
        ];
        const isStaffRanking =
          /(?:哪个|哪位|谁|美容师|员工).*(?:客诉|投诉|差评).*(?:最多|排行|排名)|(?:客诉|投诉|差评).*(?:最多|排行|排名).*(?:美容师|员工|谁)/.test(
            input.question,
          );
        const isSatisfaction = /满意度|满意评价|评分|星级/.test(input.question);
        if (isStaffRanking) {
          const rows = result.staff.slice(0, this.resolveLimit(input.args.limit, 10));
          const leader = rows[0];
          const answer =
            leader && leader.complaintCount > 0
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
                columns: [
                  'beauticianName',
                  'complaintCount',
                  'unresolvedComplaintCount',
                  'averageRating',
                  'ratedFeedbackCount',
                ],
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
          const satisfactionText =
            summary.ratedFeedbackCount > 0 && summary.averageRating !== null
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
                  {
                    label: '平均满意度',
                    value: summary.averageRating === null ? '未采集' : `${summary.averageRating.toFixed(1)} / 5`,
                  },
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
        const complaintAnswer =
          summary.complaintCount > 0
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
            metadata: {
              capabilityKey: 'customer_waiting_loss_overview',
              failureCode: 'CUSTOMER_WAITING_SERVICE_UNAVAILABLE',
            },
          };
        }
        const result = await this.customerWaiting.analytics(input.context.storeId, {
          startDate: range.startDate.toISOString(),
          endDate: range.endDate.toISOString(),
        });
        const summary = result.summary;
        const coverageText = `等待记录覆盖率 ${(summary.collectionCoverageRate * 100).toFixed(1)}%（${summary.linkedReservationCount}/${summary.checkedInReservationCount} 个到店预约）`;
        const coverageLimitation =
          summary.checkedInReservationCount > 0 && summary.collectionCoverageRate < 0.8
            ? `当前${coverageText}，未记录不代表客户没有等待或离店。`
            : undefined;
        const asksActiveWaiting =
          /(?:还有多少|哪些|谁|名单|明细).*(?:等待|等候)|(?:等待|等候).*(?:还有多少|哪些|谁|名单|明细)/.test(
            input.question,
          );
        const answer =
          summary.longWaitDepartureCount > 0
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
                {
                  label: '平均等待',
                  value:
                    summary.averageWaitMinutes === null
                      ? '暂无完整记录'
                      : `${summary.averageWaitMinutes.toFixed(1)} 分钟`,
                },
                { label: '记录覆盖率', value: `${(summary.collectionCoverageRate * 100).toFixed(1)}%` },
              ],
              citationIds: ['customer_waiting_summary'],
            },
            ...(/(?:离开|走了|流失|等太久|等待过久)/.test(input.question)
              ? [
                  {
                    kind: 'table' as const,
                    rows: result.longWaitDepartures.slice(0, this.resolveLimit(input.args.limit, 20)),
                    columns: [
                      'customerName',
                      'actualWaitMinutes',
                      'expectedWaitMinutes',
                      'startedAt',
                      'endedAt',
                      'reasonNote',
                    ],
                    citationIds: ['customer_long_wait_departures'],
                  },
                ]
              : []),
            ...(asksActiveWaiting
              ? [
                  {
                    kind: 'table' as const,
                    rows: result.activeWaiting.slice(0, this.resolveLimit(input.args.limit, 20)),
                    columns: ['customerName', 'actualWaitMinutes', 'expectedWaitMinutes', 'startedAt'],
                    citationIds: ['customer_waiting_summary'],
                  },
                ]
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
      case 'appointment_gap_list': {
        if (!this.gapOpportunities) throw new Error('appointment_gap_preview_service_unavailable');
        const preview = await this.gapOpportunities.preview({
          storeId: input.context.storeId,
          startDate: range.startDate,
          endDate: range.endDate,
          opportunityLimit: this.resolveLimit(input.args.limit, 5),
          candidateLimit: 1,
        });
        const rows = preview.opportunities.map((item) => ({
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
          availableCapacity: item.availableCapacity,
          estimatedRevenue: item.estimatedRevenue,
        }));
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'appointment_gap_readonly_preview',
          label: '排班、预约占用与可用容量计算',
        };
        const adviceRequested = /(?:空档|空闲).*(?:建议|怎么填|如何填|怎么补|如何补)/.test(input.question);
        const gapSummary = rows.length
          ? `${range.label}共有 ${rows.length} 个可预约空档：${rows
              .map(
                (item, index) =>
                  `${index + 1}. ${item.date} ${item.startTime}-${item.endTime}，可加 ${item.availableCapacity} 人`,
              )
              .join('；')}。`
          : `${range.label}没有计算出可预约空档。`;
        const answer = adviceRequested
          ? `${gapSummary}\n建议按以下顺序人工补位：1. 先处理可用容量最高且预计收入较高的空档；2. 复核候选客户近期到店、项目适配和触达冷却期；3. 先生成可编辑邀约草稿，小范围确认后再发送；4. 每日复盘填充率和实际到店率。当前仅生成只读建议，不自动选客、不发送消息、不修改预约。`
          : gapSummary;
        return this.applyDataQualityGuard(
          {
            status: 'completed',
            answer,
            citations: [citation],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'table',
                rows,
                columns: ['date', 'startTime', 'endTime', 'availableCapacity', 'estimatedRevenue'],
                citationIds: [citation.sourceId],
              },
              {
                kind: 'limitations',
                items: ['本能力只计算空档，不匹配客户、不创建触达任务、不修改预约。'],
              },
              ...(adviceRequested
                ? [
                    {
                      kind: 'diagnosis' as const,
                      findings: [
                        {
                          title: '空档补位优先级',
                          detail: rows.length
                            ? `先处理 ${rows[0]!.date} ${rows[0]!.startTime}-${rows[0]!.endTime}，该时段可加 ${rows[0]!.availableCapacity} 人。`
                            : '当前没有可执行空档，先复核排班和预约占用是否完整。',
                          severity: rows.length ? ('info' as const) : ('warning' as const),
                        },
                      ],
                      citationIds: [citation.sourceId],
                    },
                  ]
                : []),
            ],
            metadata: {
              capabilityKey: 'appointment_gap_list',
              answerScope: 'appointment_gap_time_list',
              rangeLabel: range.label,
              persisted: preview.persisted,
              adviceRequested,
              mappingOutputs: { appointmentGaps: rows },
              completionCriteria: ['appointment_gaps_computed', 'readonly_boundary_disclosed'],
            },
          },
          dataQuality,
        );
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
        if (focusedReservationAnswer)
          return this.applyDataQualityGuard(this.ensureAnswerTextBlock(focusedReservationAnswer), dataQuality);
        const activeReservations = schedule.reservations.filter((item) => !this.isCancelledReservation(item.status));
        const noShowReservations = activeReservations.filter((item) => this.isNoShowReservation(item.status));
        const groupByHour = (rows: typeof activeReservations) => {
          const grouped = new Map<string, number>();
          for (const item of rows) {
            const hour = `${item.startTime.slice(0, 2)}:00-${item.startTime.slice(0, 2)}:59`;
            grouped.set(hour, (grouped.get(hour) ?? 0) + 1);
          }
          return [...grouped.entries()]
            .map(([timeSlot, count]) => ({ timeSlot, count }))
            .sort((left, right) => right.count - left.count || left.timeSlot.localeCompare(right.timeSlot));
        };
        const noShowAdvice = /(?:怎么|如何).*(?:降低|减少).*(?:爽约率|爽约)|(?:降低|减少).*(?:爽约率|爽约).*(?:怎么|如何)/.test(
          input.question,
        );
        if (noShowAdvice) {
          const highRiskSlots = groupByHour(noShowReservations).slice(0, 3);
          const answer = `${range.label}有效预约 ${snapshot.total} 个，已到店 ${snapshot.checkedIn} 人，到店率 ${(snapshot.arrivalRate * 100).toFixed(1)}%；爽约 ${snapshot.noShow} 人，爽约率 ${(snapshot.noShowRate * 100).toFixed(1)}%。建议：1. 对待确认和待到店预约分层提醒，优先处理临近到店仍未确认的客户；2. 在${highRiskSlots.length ? highRiskSlots.map((item) => item.timeSlot).join('、') : '历史爽约样本积累后的高风险时段'}增加二次确认；3. 记录未到原因并区分取消、改期和真实爽约；4. 每周复盘提醒触达率、确认率和到店率。当前只生成建议，不自动发送消息、不修改预约。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '有效预约', value: `${snapshot.total} 个` },
                    { label: '到店率', value: `${(snapshot.arrivalRate * 100).toFixed(1)}%` },
                    { label: '爽约率', value: `${(snapshot.noShowRate * 100).toFixed(1)}%` },
                  ],
                  citationIds: ['reception_operations_snapshot'],
                },
                {
                  kind: 'diagnosis',
                  findings: [
                    {
                      title: '爽约治理建议',
                      detail: '分层提醒、临近到店二次确认、结构化记录未到原因，并按周复盘确认率与到店率。',
                      severity: snapshot.noShowRate >= 0.1 ? 'warning' : 'info',
                    },
                  ],
                  citationIds: ['reception_operations_snapshot', 'reception_reservation_schedule'],
                },
                { kind: 'limitations', items: ['建议为只读运营方案，未发送提醒、未修改预约。'] },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'reservation_no_show_reduction_advice',
                rangeLabel: range.label,
                noShowRate: snapshot.noShowRate,
                actionWriteCount: 0,
                completionCriteria: ['reservation_arrival_loaded', 'no_show_loaded', 'readonly_advice_generated'],
              },
            },
            dataQuality,
          );
        }
        const peakStaffingAdvice = /(?:高峰|高峰时段).*(?:人手不够|缺人).*(?:调度|怎么安排|如何安排)|(?:人手不够|缺人).*(?:怎么调度|如何调度)/.test(
          input.question,
        );
        if (peakStaffingAdvice) {
          const peakSlots = groupByHour(activeReservations).slice(0, 3);
          const staffRows = [...snapshot.staff]
            .sort((left, right) => right.appointmentCount - left.appointmentCount || left.name.localeCompare(right.name, 'zh-CN'))
            .map((item) => ({
              staff: item.name,
              appointmentCount: item.appointmentCount,
              status: item.onTimeOff ? '请假' : item.inService ? '服务中' : item.available ? '可接待' : '暂不可用',
              nextAvailableAt: item.nextAvailableAt ?? '',
            }));
          const answer = `${range.label}预约高峰集中在${peakSlots.length ? peakSlots.map((item) => `${item.timeSlot}（${item.count} 个）`).join('、') : '当前无有效预约时段'}。建议：1. 将休息、培训和非紧急后台工作移出高峰；2. 高峰前确认可接待员工和项目技能，优先把可替代项目分配给空闲员工；3. 对超出接待能力的加客设置人工审批；4. 高峰结束后复盘服务超时和受影响预约。当前不会自动修改排班。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'ranking',
                  rows: peakSlots,
                  columns: ['timeSlot', 'count'],
                  citationIds: ['reception_reservation_schedule'],
                },
                {
                  kind: 'table',
                  rows: staffRows,
                  columns: ['staff', 'appointmentCount', 'status', 'nextAvailableAt'],
                  citationIds: ['reception_operations_snapshot'],
                },
                { kind: 'limitations', items: ['当前只提供人工调度建议，不发布或修改排班。'] },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'peak_staffing_advice',
                rangeLabel: range.label,
                peakSlots,
                actionWriteCount: 0,
                completionCriteria: ['reservation_peak_loaded', 'staff_state_loaded', 'readonly_advice_generated'],
              },
            },
            dataQuality,
          );
        }
        if (/(?:预约)?到店转化率|预约转化率/.test(input.question)) {
          const trendRequested = /趋势|走势/.test(input.question);
          if (trendRequested) {
            const grouped = new Map<string, { total: number; arrived: number }>();
            for (const item of activeReservations) {
              const period = item.date.slice(0, 7);
              const current = grouped.get(period) ?? { total: 0, arrived: 0 };
              current.total += 1;
              if (Boolean(item.checkedInAt) || this.isArrivedReservation(item.status)) current.arrived += 1;
              grouped.set(period, current);
            }
            const rows = [...grouped.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([period, value]) => ({
                period,
                reservationCount: value.total,
                arrivedCount: value.arrived,
                arrivalConversionRate: value.total > 0 ? value.arrived / value.total : 0,
              }));
            const first = rows[0];
            const last = rows.at(-1);
            const delta = first && last ? last.arrivalConversionRate - first.arrivalConversionRate : 0;
            return this.applyDataQualityGuard(
              {
                status: 'completed',
                answer: rows.length
                  ? `${range.label}预约到店转化率趋势共 ${rows.length} 个按月数据点；最新 ${last!.period} 为 ${(last!.arrivalConversionRate * 100).toFixed(1)}%，较首期${delta > 0 ? '提升' : delta < 0 ? '下降' : '持平'} ${Math.abs(delta * 100).toFixed(1)} 个百分点。`
                  : `${range.label}没有有效预约，无法形成到店转化率趋势。`,
                citations,
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'chart',
                    chartType: 'line',
                    rows,
                    xKey: 'period',
                    yKeys: ['arrivalConversionRate'],
                    citationIds: ['reception_reservation_schedule'],
                  },
                  {
                    kind: 'table',
                    rows,
                    columns: ['period', 'reservationCount', 'arrivedCount', 'arrivalConversionRate'],
                    citationIds: ['reception_reservation_schedule'],
                  },
                ],
                metadata: {
                  capabilityKey: 'front_desk_operations_overview',
                  answerScope: 'reservation_arrival_conversion_trend',
                  rangeLabel: range.label,
                  pointCount: rows.length,
                  completionCriteria: ['reservation_schedule_loaded', 'arrival_conversion_grouped'],
                },
              },
              dataQuality,
            );
          }
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: `${range.label}有效预约 ${snapshot.total} 个，已到店 ${snapshot.checkedIn} 人，预约到店转化率 ${(snapshot.arrivalRate * 100).toFixed(1)}%。`,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '有效预约', value: `${snapshot.total} 个` },
                    { label: '已到店', value: `${snapshot.checkedIn} 人` },
                    { label: '预约到店转化率', value: `${(snapshot.arrivalRate * 100).toFixed(1)}%` },
                  ],
                  citationIds: ['reception_operations_snapshot'],
                },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'reservation_arrival_conversion_rate',
                rangeLabel: range.label,
                arrivalRate: snapshot.arrivalRate,
                completionCriteria: ['reservation_arrival_loaded', 'arrival_rate_calculated'],
              },
            },
            dataQuality,
          );
        }
        if (/(?:预约|到店).*(?:高峰时段|哪些时段.*最满|时段.*最满)/.test(input.question)) {
          const rows = groupByHour(activeReservations).slice(0, this.resolveLimit(input.args.limit, 10));
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: rows.length
                ? `${range.label}预约最满的时段是 ${rows[0]!.timeSlot}，共 ${rows[0]!.count} 个预约；前 ${Math.min(rows.length, 5)} 个高峰时段为 ${rows
                    .slice(0, 5)
                    .map((item) => `${item.timeSlot} ${item.count} 个`)
                    .join('，')}。`
                : `${range.label}没有有效预约，无法形成时段排行。`,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'ranking',
                  rows,
                  columns: ['timeSlot', 'count'],
                  citationIds: ['reception_reservation_schedule'],
                },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'reservation_peak_time_ranking',
                rangeLabel: range.label,
                completionCriteria: ['reservation_schedule_loaded', 'reservation_hours_ranked'],
              },
            },
            dataQuality,
          );
        }
        if (/爽约.*(?:集中|哪些客户|哪些时段)/.test(input.question)) {
          const customerCounts = new Map<string, number>();
          for (const item of noShowReservations)
            customerCounts.set(item.customerName, (customerCounts.get(item.customerName) ?? 0) + 1);
          const customers = [...customerCounts.entries()]
            .map(([customerName, count]) => ({ customerName, count }))
            .sort((left, right) => right.count - left.count || left.customerName.localeCompare(right.customerName, 'zh-CN'))
            .slice(0, 10);
          const slots = groupByHour(noShowReservations).slice(0, 10);
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: noShowReservations.length
                ? `${range.label}共 ${noShowReservations.length} 个爽约记录；客户集中度最高的是 ${customers[0]?.customerName ?? '无'}（${customers[0]?.count ?? 0} 次），时段集中度最高的是 ${slots[0]?.timeSlot ?? '无'}（${slots[0]?.count ?? 0} 次）。`
                : `${range.label}没有已记录爽约，无法形成客户或时段集中度排行。`,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'ranking',
                  rows: customers,
                  columns: ['customerName', 'count'],
                  citationIds: ['reception_reservation_schedule'],
                },
                {
                  kind: 'ranking',
                  rows: slots,
                  columns: ['timeSlot', 'count'],
                  citationIds: ['reception_reservation_schedule'],
                },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'reservation_no_show_concentration',
                rangeLabel: range.label,
                noShowCount: noShowReservations.length,
                completionCriteria: ['no_show_reservations_loaded', 'customer_and_time_concentration_ranked'],
              },
            },
            dataQuality,
          );
        }
        if (/[\p{Script=Han}]{2,4}.*(?:排太满|排得太满|预约太满|超负荷)/u.test(input.question)) {
          const staffName = [...new Set(activeReservations.map((item) => item.beauticianName).filter(Boolean))]
            .sort((left, right) => right!.length - left!.length)
            .find((name) => input.question.includes(name!));
          const rows = staffName ? activeReservations.filter((item) => item.beauticianName === staffName) : [];
          const byDate = new Map<string, number>();
          for (const item of rows) byDate.set(item.date, (byDate.get(item.date) ?? 0) + 1);
          const daily = [...byDate.entries()]
            .map(([date, count]) => ({ date, count }))
            .sort((left, right) => right.count - left.count || left.date.localeCompare(right.date));
          const averagePerBookedDay = daily.length ? rows.length / daily.length : 0;
          const limitation = '当前没有已发布的单人每日最大接待阈值，因此只能披露预约密度和峰值，不能武断判定超负荷。';
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: staffName
                ? `${range.label}${staffName}共有 ${rows.length} 个有效预约，覆盖 ${daily.length} 个有预约日期，日均 ${averagePerBookedDay.toFixed(1)} 个，单日峰值 ${daily[0]?.count ?? 0} 个。${limitation}`
                : `${range.label}没有识别到问题中的美容师，无法做个人预约密度诊断。${limitation}`,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'ranking',
                  rows: daily.slice(0, 10),
                  columns: ['date', 'count'],
                  citationIds: ['reception_reservation_schedule'],
                },
                { kind: 'limitations', items: [limitation] },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'beautician_reservation_capacity_diagnosis',
                rangeLabel: range.label,
                staffName: staffName ?? null,
                reservationCount: rows.length,
                peakDailyCount: daily[0]?.count ?? 0,
                completionCriteria: ['staff_reservations_loaded', 'daily_density_calculated', 'capacity_limit_disclosed'],
              },
            },
            dataQuality,
          );
        }
        if (
          /(?:预约了|有预约|预约).*(?:还没来|未到店|待到店)|(?:还没来|未到店|待到店).*(?:客人|客户)/.test(
            input.question,
          )
        ) {
          const rows = snapshot.pendingCustomers.slice(0, this.resolveLimit(input.args.limit, 20));
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: rows.length
                ? `${range.label}有 ${snapshot.pendingArrival} 位已预约待到店客户：${rows.map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName}，${item.projectName}`).join('；')}。`
                : `${range.label}没有已预约待到店客户。`,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'table',
                  rows,
                  columns: ['startTime', 'customerName', 'projectName', 'status'],
                  citationIds: ['reception_operations_snapshot'],
                },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'pending_arrival_customer_list',
                rangeLabel: range.label,
                pendingArrival: snapshot.pendingArrival,
                completionCriteria: ['pending_arrival_customers_loaded'],
              },
            },
            dataQuality,
          );
        }
        if (
          /(?:所有|全部|今天).*(?:到店客人|到店客户).*(?:基本信息|名单|情况)|(?:到店客人|到店客户).*(?:基本信息|名单)/.test(
            input.question,
          )
        ) {
          const rows = snapshot.arrivedCustomers.slice(0, this.resolveLimit(input.args.limit, 20));
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: rows.length
                ? `${range.label}已到店 ${snapshot.checkedIn} 位客户：${rows.map((item, index) => `${index + 1}. ${item.startTime} ${item.customerName}，${item.projectName}`).join('；')}。`
                : `${range.label}没有已记录到店客户。`,
              citations,
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'table',
                  rows,
                  columns: ['startTime', 'customerName', 'projectName', 'status'],
                  citationIds: ['reception_operations_snapshot'],
                },
              ],
              metadata: {
                capabilityKey: 'front_desk_operations_overview',
                answerScope: 'arrived_customer_list',
                rangeLabel: range.label,
                checkedIn: snapshot.checkedIn,
                completionCriteria: ['arrived_customers_loaded'],
              },
            },
            dataQuality,
          );
        }
        if (
          /(?:超过|超出|超负荷|超载).*(?:接待能力|接待承载)|(?:接待能力|接待承载).*(?:不足|不够|超过|超出)/.test(
            input.question,
          )
        ) {
          const availableStaffCount = snapshot.staff.filter((staff) => staff.available && !staff.onTimeOff).length;
          const overloaded = overrun.impactedCount > 0 || (snapshot.pendingArrival > 0 && availableStaffCount === 0);
          const answer = overloaded
            ? `${range.label}存在接待承载风险：服务超时 ${overrun.overrunCount} 个，受影响预约 ${overrun.impactedCount} 个，待到店 ${snapshot.pendingArrival} 人，当前可接待员工 ${availableStaffCount} 人。`
            : `${range.label}未发现超过当前接待能力的证据：有效预约 ${snapshot.total} 个，服务超时 ${overrun.overrunCount} 个，受影响预约 ${overrun.impactedCount} 个，待到店 ${snapshot.pendingArrival} 人，当前可接待员工 ${availableStaffCount} 人。`;
          return this.applyDataQualityGuard(
            {
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
            },
            dataQuality,
          );
        }
        return this.applyDataQualityGuard(
          {
            status: 'completed',
            answer: `${range.label}前台现场概览已完成，包含预约到店、待到店客户、员工忙闲和服务超时影响。`,
            citations,
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '有效预约', value: `${snapshot.total} 个` },
                  {
                    label: '已到店',
                    value: `${snapshot.checkedIn} 人`,
                    hint: `到店率 ${(snapshot.arrivalRate * 100).toFixed(1)}%`,
                  },
                  { label: '待到店', value: `${snapshot.pendingArrival} 人` },
                  {
                    label: '爽约',
                    value: `${snapshot.noShow} 人`,
                    hint: `爽约率 ${(snapshot.noShowRate * 100).toFixed(1)}%`,
                  },
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
                ? [
                    {
                      kind: 'diagnosis' as const,
                      findings: [
                        ...(snapshot.noShow > 0
                          ? [
                              {
                                title: '预约爽约',
                                detail: `${range.label}有 ${snapshot.noShow} 人爽约，需要安排前台回访。`,
                                severity: 'warning' as const,
                              },
                            ]
                          : []),
                        ...overrun.items.slice(0, 10).map((item) => ({
                          title: `${item.beauticianName}服务超时`,
                          detail: `${item.customerName}的${item.projectName}超时 ${item.overrunMinutes} 分钟${item.impactedReservation ? `，影响 ${item.impactedReservation.startTime} 的${item.impactedReservation.customerName}` : ''}。`,
                          severity: item.impactedReservation ? ('critical' as const) : ('warning' as const),
                        })),
                      ],
                      citationIds: ['reception_operations_snapshot', 'reception_service_overrun_analysis'],
                    },
                  ]
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
          },
          dataQuality,
        );
      }
      case 'beautician_service_overview': {
        if (
          /(?:客户|客人).*(?:好久|很久|长期|多天).*(?:没来|未到店)|(?:沉睡|久未到店).*(?:客户|客人)/.test(
            input.question,
          )
        ) {
          const explicitDays = Number(input.question.match(/(\d{2,3})\s*天/)?.[1] ?? 60);
          const summary = await this.skillRuntime.buildBeauticianPersonalInactiveCustomers({
            storeId: input.context.storeId,
            userId: input.context.userId,
            asOf: new Date(),
            thresholdDays: explicitDays,
            limit: this.resolveLimit(input.args.limit, 10),
          });
          const scope = `仅覆盖 ${summary.beauticianName} 本人曾完成服务、且全店最近 ${summary.thresholdDays} 天未到店的客户`;
          const answer = summary.total
            ? `${scope}，共 ${summary.truncated ? '至少 ' : ''}${summary.total} 人。优先联系：${summary.rows
                .map((item) => `${item.customerName}（${item.inactiveDays} 天未到店）`)
                .join('、')}。`
            : `${scope}，当前没有符合条件的客户。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer,
              citations: [
                {
                  sourceType: 'db_skill',
                  sourceId: 'beautician_personal_inactive_customers',
                  label: '当前登录美容师历史服务与客户最近到店事实',
                },
              ],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    {
                      label: '本人可联系的久未到店客户',
                      value: `${summary.truncated ? '至少 ' : ''}${summary.total} 人`,
                      hint: `${summary.thresholdDays} 天阈值`,
                    },
                  ],
                  citationIds: ['beautician_personal_inactive_customers'],
                },
                {
                  kind: 'table',
                  rows: summary.rows.map((item) => ({
                    customer: item.customerName,
                    memberLevel: item.memberLevel,
                    inactiveDays: item.inactiveDays,
                    lastStoreVisitAt: item.lastStoreVisitAt.toISOString(),
                    totalSpent: item.totalSpent,
                  })),
                  columns: ['customer', 'memberLevel', 'inactiveDays', 'lastStoreVisitAt', 'totalSpent'],
                  citationIds: ['beautician_personal_inactive_customers'],
                },
                { kind: 'limitations', items: ['不会返回其他美容师独占或本人从未服务过的全店客户名单。'] },
              ],
              metadata: {
                capabilityKey: 'beautician_service_overview',
                answerScope: 'beautician_personal_inactive_customers',
                identitySource: 'server_context_user',
                thresholdDays: summary.thresholdDays,
                truncated: summary.truncated,
                completionCriteria: ['beautician_identity_bound', 'personal_customer_scope_applied'],
              },
            },
            dataQuality,
          );
        }
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
        if (focusedServiceAnswer)
          return this.applyDataQualityGuard(this.ensureAnswerTextBlock(focusedServiceAnswer), dataQuality);
        return this.applyDataQualityGuard(
          {
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
                  {
                    label: '复访客户',
                    value: `${performance.repeatCustomerCount} 人`,
                    hint: `服务客户 ${performance.uniqueCustomerCount} 人`,
                  },
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
                ? [
                    {
                      kind: 'ranking' as const,
                      rows: performance.projectRanking.map((item) => ({
                        project: item.name,
                        serviceCount: item.count,
                      })),
                      columns: ['project', 'serviceCount'],
                      citationIds: ['beautician_personal_performance'],
                    },
                  ]
                : []),
              ...(services.nextTasks.some((item) => item.attentionItems.length)
                ? [
                    {
                      kind: 'diagnosis' as const,
                      findings: services.nextTasks
                        .filter((item) => item.attentionItems.length)
                        .map((item) => ({
                          title: `${item.customerName}服务前注意`,
                          detail: item.attentionItems.join('；'),
                          severity: item.attentionItems.some((attention) => attention.includes('过敏'))
                            ? ('warning' as const)
                            : ('info' as const),
                        })),
                      citationIds: ['beautician_service_summary'],
                    },
                  ]
                : []),
            ],
            metadata: {
              capabilityKey: 'beautician_service_overview',
              rangeLabel: range.label,
              identitySource: 'server_context_user',
              componentCapabilities: ['beautician_service_summary', 'beautician_personal_performance'],
              completionCriteria: [
                'service_schedule_loaded',
                'customer_attention_loaded',
                'personal_performance_loaded',
              ],
            },
          },
          dataQuality,
        );
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
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'beautician_project_bom_material_plan',
          label: '当前美容师预约项目与标准 BOM 用料',
        };
        const plan = services.materialPlan;
        const missingProjects = services.bomMissingProjects;
        const limitation = missingProjects.length
          ? `以下预约项目尚未配置项目 BOM：${missingProjects.join('、')}，其用料未计入。`
          : '数量是项目 BOM 的标准计划用量，实际操作用量仍需服务时确认。';
        const answer = plan.length
          ? `${range.label}按 ${services.bomCoveredReservationCount}/${services.serviceCount} 个有 BOM 的有效预约汇总，需要准备：${plan.map((item) => `${item.productName} ${item.requiredQty}${item.unit}`).join('；')}。${limitation}`
          : `${range.label}没有可汇总的项目 BOM 用料。${limitation}`;
        return this.applyDataQualityGuard(
          {
            status: 'completed',
            answer,
            citations: [citation],
            grounding: 'db_skill',
            blocks: [
              { kind: 'text', text: answer, citationIds: [citation.sourceId] },
              {
                kind: 'table',
                rows: plan.map((item) => ({
                  productName: item.productName,
                  requiredQty: item.requiredQty,
                  unit: item.unit,
                  projectNames: item.projectNames.join('、'),
                })),
                columns: ['productName', 'requiredQty', 'unit', 'projectNames'],
                citationIds: [citation.sourceId],
              },
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
              completionCriteria: [
                'personal_reservations_loaded',
                'project_bom_loaded',
                'standard_materials_aggregated',
              ],
            },
          },
          dataQuality,
        );
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
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'beautician_reservation_customer_cards',
          label: '当前美容师预约客户有效卡项',
        };
        const nextOnly = /下一个|下一位|疗程做到|做了几次|还有几次/.test(input.question);
        const selected = nextOnly
          ? this.nextBeauticianItems(services.nextTasks, input.context.timezone).slice(0, 1)
          : services.nextTasks;
        const cardRows = selected.flatMap((item) =>
          item.cards.map((card) => ({
            customerName: item.customerName,
            appointmentTime: item.appointmentTime,
            cardName: card.cardName,
            usedTimes: card.usedTimes,
            totalTimes: card.totalTimes,
            remainingTimes: card.remainingTimes,
            expiryDate: this.formatDateOnly(card.expiryDate, input.context.timezone),
          })),
        );
        const recommendationRequested = /续卡|推荐项目/.test(input.question);
        const limitation = recommendationRequested
          ? '统一续卡阈值与项目推荐规则尚未发布，因此只展示卡项余次和到期日，不自动判定必须续卡或推荐具体项目。'
          : '卡项进度按 CustomerCard 总次数与剩余次数计算，不推断护理阶段名称。';
        const answer =
          selected.length === 0
            ? `${range.label}没有后续预约客户，无法查询卡项进度。`
            : cardRows.length
              ? `${selected.map((item) => item.customerName).join('、')}的有效卡项：${cardRows.map((card) => `${card.cardName}已用 ${card.usedTimes}/${card.totalTimes} 次，剩余 ${card.remainingTimes} 次，到期日 ${card.expiryDate}`).join('；')}。${limitation}`
              : `${selected.map((item) => item.customerName).join('、')}当前没有有效卡项记录。${limitation}`;
        return this.applyDataQualityGuard(
          {
            status: 'completed',
            answer,
            citations: [citation],
            grounding: 'db_skill',
            blocks: [
              { kind: 'text', text: answer, citationIds: [citation.sourceId] },
              {
                kind: 'table',
                rows: cardRows,
                columns: [
                  'customerName',
                  'appointmentTime',
                  'cardName',
                  'usedTimes',
                  'totalTimes',
                  'remainingTimes',
                  'expiryDate',
                ],
                citationIds: [citation.sourceId],
              },
              { kind: 'limitations', items: [limitation] },
            ],
            metadata: {
              capabilityKey: 'beautician_customer_card_progress',
              answerScope: nextOnly ? 'beautician_next_customer_card_progress' : 'beautician_customer_card_facts',
              rangeLabel: range.label,
              customerCount: selected.length,
              cardCount: cardRows.length,
              identitySource: 'server_context_user',
              completionCriteria: [
                'personal_reservations_loaded',
                'active_customer_cards_loaded',
                'card_progress_computed',
              ],
            },
          },
          dataQuality,
        );
      }
      case 'inventory_operations_overview': {
        if (
          /(?:产品|商品|库存).*(?:积压太久|积压很久|积压|周转慢)|(?:积压太久|积压很久|积压).*(?:产品|商品|库存)/.test(
            input.question,
          )
        ) {
          const aging = await this.skillRuntime.buildInventoryAgingAnalysis({
            storeId: input.context.storeId,
            asOf: range.endDate,
            observationDays: 90,
          });
          const rows = aging.products.slice(0, this.resolveLimit(input.args.limit, 10));
          const limitation = `仅评估有在库批次记录的 ${aging.batchCoveredProductCount}/${aging.totalProductCount} 个商品；候选需已记录在库至少 ${aging.minimumRecordedAgeDays} 天，并满足观察期无出库、预计库存覆盖至少 ${aging.minimumCoverageDays} 天，或长期低动销且库存明显高于安全库存。`;
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: rows.length
                ? `当前识别 ${aging.candidateCount} 个库存积压候选，展示前 ${rows.length} 个：${rows.map((row, index) => `${index + 1}. ${row.name}，当前库存 ${row.stock}，${row.reason}`).join('；')}。${limitation}`
                : `当前没有满足统一口径的库存积压候选。${limitation}`,
              citations: [
                { sourceType: 'db_skill', sourceId: 'inventory_aging_analysis', label: '库存批次龄期与出库速度分析' },
              ],
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
                  columns: [
                    'productName',
                    'currentStock',
                    'safetyStock',
                    'stockValue',
                    'oldestBatchAgeDays',
                    'lastOutboundDays',
                    'outboundQuantity',
                    'coverageDays',
                    'reason',
                  ],
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
            },
            dataQuality,
          );
        }
        if (/库存周转率|耗占比/.test(input.question)) {
          const turnover = await this.skillRuntime.buildInventoryTurnoverAnalysis({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'inventory_operational_turnover_analysis',
            label: '库存出库量、事件加权平均库存与成本估算',
          } as const;
          const asksConsumptionOccupancy = /耗占比/.test(input.question);
          if (asksConsumptionOccupancy) {
            const current = turnover.current.consumptionOccupancyRatio;
            const previous = turnover.previous.consumptionOccupancyRatio;
            const delta = current !== undefined && previous !== undefined ? current - previous : undefined;
            const direction = delta === undefined ? '无法比较' : delta > 0 ? '上升' : delta < 0 ? '下降' : '持平';
            const rows = turnover.rows
              .filter((row) => row.consumptionOccupancyRatio !== undefined)
              .sort(
                (left, right) =>
                  (right.consumptionOccupancyRatio ?? -1) - (left.consumptionOccupancyRatio ?? -1) ||
                  left.productName.localeCompare(right.productName, 'zh-CN'),
              )
              .slice(0, this.resolveLimit(input.args.limit, 10));
            const trendRows = [
              ...(previous === undefined
                ? []
                : [{ period: '上一等长周期', consumptionOccupancyRatio: previous }]),
              ...(current === undefined ? [] : [{ period: range.label, consumptionOccupancyRatio: current }]),
            ];
            const limitation =
              '耗占比采用“观察期估算出库成本 ÷ 库存事件加权平均库存金额”的运营口径，不是财务会计成本率；缺少库存事件时不补造比例。';
            return this.applyDataQualityGuard(
              {
                status: 'completed',
                answer:
                  current === undefined
                    ? `${range.label}缺少可计算耗占比的库存前后量事件。${limitation}`
                    : `${range.label}耗占比 ${(current * 100).toFixed(1)}%；前一等长周期${previous === undefined ? '缺少可比数据' : `为 ${(previous * 100).toFixed(1)}%`}，${direction}${delta === undefined ? '' : ` ${Math.abs(delta * 100).toFixed(1)} 个百分点`}。${limitation}`,
                citations: [citation],
                grounding: 'db_skill',
                blocks: [
                  {
                    kind: 'comparison',
                    items: [
                      {
                        label: '耗占比',
                        current: current === undefined ? '不可计算' : `${(current * 100).toFixed(1)}%`,
                        previous: previous === undefined ? '不可计算' : `${(previous * 100).toFixed(1)}%`,
                        ...(delta === undefined ? {} : { delta: `${this.signed(delta * 100, 1)} 个百分点` }),
                      },
                    ],
                    citationIds: [citation.sourceId],
                  },
                  {
                    kind: 'chart',
                    chartType: 'line',
                    rows: trendRows,
                    xKey: 'period',
                    yKeys: ['consumptionOccupancyRatio'],
                    citationIds: [citation.sourceId],
                  },
                  {
                    kind: 'table',
                    rows,
                    columns: [
                      'productName',
                      'outboundQuantity',
                      'eventWeightedAverageStock',
                      'consumptionOccupancyRatio',
                      'previousConsumptionOccupancyRatio',
                      'consumptionOccupancyDelta',
                    ],
                    citationIds: [citation.sourceId],
                  },
                  { kind: 'limitations', items: [limitation] },
                ],
                metadata: {
                  capabilityKey: 'inventory_operations_overview',
                  answerScope: 'inventory_consumption_occupancy_trend',
                  rangeLabel: range.label,
                  currentRatio: current ?? null,
                  previousRatio: previous ?? null,
                  policy: turnover.policy,
                  completionCriteria: ['stock_movements_loaded', 'event_weighted_stock_calculated', 'ratio_compared'],
                },
              },
              dataQuality,
            );
          }
          const ratio = turnover.current.operationalTurnoverRatio;
          const previousRatio = turnover.previous.operationalTurnoverRatio;
          const ratioDelta = ratio !== undefined && previousRatio !== undefined ? ratio - previousRatio : undefined;
          const rows = turnover.rows
            .filter((row) => row.operationalTurnoverRatio !== undefined)
            .sort(
              (left, right) =>
                (left.operationalTurnoverRatio ?? Number.MAX_SAFE_INTEGER) -
                  (right.operationalTurnoverRatio ?? Number.MAX_SAFE_INTEGER) ||
                left.productName.localeCompare(right.productName, 'zh-CN'),
            )
            .slice(0, this.resolveLimit(input.args.limit, 10));
          const limitation =
            '库存周转率采用“观察期出库数量 ÷ 库存事件加权平均库存”的运营口径，不是财务存货周转率；缺少库存前后量事件的商品不进入比率分母。';
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer:
                ratio === undefined
                  ? `${range.label}缺少可计算运营库存周转率的库存前后量事件。${limitation}`
                  : `${range.label}整体运营库存周转率 ${ratio.toFixed(2)}，出库量 ${turnover.current.outboundQuantity.toFixed(2)}，库存事件加权平均库存 ${turnover.current.eventWeightedAverageStock.toFixed(2)}。${limitation}`,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '运营库存周转率', value: ratio === undefined ? '不可计算' : ratio.toFixed(2) },
                    { label: '观察期出库量', value: turnover.current.outboundQuantity.toFixed(2) },
                    {
                      label: '事件加权平均库存',
                      value: turnover.current.eventWeightedAverageStock.toFixed(2),
                    },
                  ],
                  citationIds: [citation.sourceId],
                },
                {
                  kind: 'comparison',
                  items: [
                    {
                      label: '运营库存周转率',
                      current: ratio === undefined ? '不可计算' : ratio.toFixed(2),
                      previous: previousRatio === undefined ? '不可计算' : previousRatio.toFixed(2),
                      ...(ratioDelta === undefined ? {} : { delta: this.signed(ratioDelta, 2) }),
                    },
                  ],
                  citationIds: [citation.sourceId],
                },
                {
                  kind: 'ranking',
                  rows,
                  columns: [
                    'productName',
                    'operationalTurnoverRatio',
                    'outboundQuantity',
                    'eventWeightedAverageStock',
                    'currentStock',
                  ],
                  citationIds: [citation.sourceId],
                },
                { kind: 'limitations', items: [limitation] },
              ],
              metadata: {
                capabilityKey: 'inventory_operations_overview',
                answerScope: 'inventory_operational_turnover',
                rangeLabel: range.label,
                turnoverRatio: ratio ?? null,
                previousTurnoverRatio: previousRatio ?? null,
                policy: turnover.policy,
                completionCriteria: ['stock_movements_loaded', 'event_weighted_stock_calculated', 'turnover_calculated'],
              },
            },
            dataQuality,
          );
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
        if (
          /(?:一般|通常|平时).*(?:临期|快过期|过期).*(?:怎么|如何|处理)|(?:临期|快过期|过期).*(?:(?:一般|通常).*)?(?:怎么|如何|处理|规定|办法)/.test(
            input.question,
          )
        ) {
          const advice = this.skillRuntime.composeInventoryDisposalAdvice();
          const expiringRows = risk.expiringProducts.slice(0, this.resolveLimit(input.args.limit, 20));
          const currentFact = expiringRows.length
            ? `当前识别 ${expiringRows.length} 个临期批次候选，需逐批复核有效期和可售状态。`
            : '当前 30 天窗口没有识别到临期批次候选。';
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: `${advice}\n\n${currentFact}`,
              citations: [
                {
                  sourceType: 'governed_policy',
                  sourceId: 'inventory_disposal_advice',
                  label: '临期与过期库存处理规则',
                },
                { sourceType: 'db_skill', sourceId: 'inventory_risk_summary', label: '当前门店临期批次风险' },
              ],
              grounding: 'db_skill',
              blocks: [
                { kind: 'text', text: advice, citationIds: ['inventory_disposal_advice'] },
                {
                  kind: 'table',
                  rows: expiringRows,
                  columns: ['name', 'stock', 'expiryDate', 'estimatedValue'],
                  citationIds: ['inventory_risk_summary'],
                },
              ],
              metadata: {
                capabilityKey: 'inventory_operations_overview',
                answerScope: 'inventory_expiry_disposal_guidance',
                expiringCandidateCount: expiringRows.length,
                completionCriteria: ['governed_disposal_policy_loaded', 'current_expiring_batches_checked'],
              },
            },
            dataQuality,
          );
        }
        if (/(?:产品|商品).*(?:销售额|销售金额)|(?:销售额|销售金额).*(?:产品|商品)/.test(input.question)) {
          const totalAmount = await this.productSalesAmount(input.context.storeId, range.startDate, range.endDate);
          const metricRef = structuredDefinitionRef(input.args.metrics, 'metric.product_sales_amount');
          return {
            status: 'completed',
            answer: `${range.label}商品净销售额 ${totalAmount.toFixed(2)} 元。`,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: metricRef
                  ? `${metricRef.definitionKey}@${metricRef.definitionVersion}`
                  : 'metric.product_sales_amount',
                label: '业务定义：商品销售额',
              },
              { sourceType: 'db_skill', sourceId: 'product_order_item_sales_amount', label: '商品订单明细净销售额' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '商品净销售额', value: `${totalAmount.toFixed(2)} 元` }],
                citationIds: [
                  metricRef
                    ? `${metricRef.definitionKey}@${metricRef.definitionVersion}`
                    : 'metric.product_sales_amount',
                  'product_order_item_sales_amount',
                ],
              },
            ],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              answerScope: 'product_sales_amount',
              rangeLabel: range.label,
              totalAmount,
              completionCriteria: ['product_order_items_loaded', 'product_sales_amount_aggregated'],
            },
          };
        }
        if (isProjectMaterialCoverageQuestion(input.question)) {
          const demandRange = this.resolveProjectMaterialDemandRange(input, range);
          const coverage = await this.projectMaterialDemandCoverage(
            input.context.storeId,
            input.question,
            demandRange.startDate,
            demandRange.endDate,
          );
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'project_material_sales_coverage',
            label: '项目服务销量、标准 BOM 与当前耗材库存核对',
          } as const;
          if (!coverage.project) {
            return {
              status: 'completed',
              answer: '没有匹配到当前门店项目，无法核对该项目的销量需求、BOM 和当前耗材库存。',
              citations: [citation],
              grounding: 'db_skill',
              blocks: [{ kind: 'limitations', items: ['no_data: project_not_matched'] }],
              metadata: {
                capabilityKey: 'inventory_operations_overview',
                answerScope: 'project_material_sales_coverage',
                unsupportedReason: 'project_not_matched',
                actionWriteCount: 0,
              },
            };
          }
          if (coverage.rows.length === 0) {
            return {
              status: 'completed',
              answer: `${coverage.project.name} 当前没有配置标准 BOM，无法判断库存耗材是否跟得上销量。`,
              citations: [citation],
              grounding: 'db_skill',
              blocks: [{ kind: 'limitations', items: ['no_data: project_bom_not_configured'] }],
              metadata: {
                capabilityKey: 'inventory_operations_overview',
                answerScope: 'project_material_sales_coverage',
                projectId: coverage.project.id,
                projectName: coverage.project.name,
                serviceCount: coverage.serviceCount,
                unsupportedReason: 'project_bom_not_configured',
                actionWriteCount: 0,
              },
            };
          }
          const shortageRows = coverage.rows.filter((row) => row.shortageQty > 0 || row.productStatus !== 'active');
          const answer =
            coverage.serviceCount <= 0
              ? `${demandRange.label}${coverage.project.name}没有已完成或已支付的项目订单，暂时无法用真实销量形成耗材需求基线；已返回当前 BOM 与库存供人工核对。`
              : shortageRows.length
                ? `${demandRange.label}${coverage.project.name}服务销量 ${coverage.serviceCount} 次，按标准 BOM 估算有 ${shortageRows.length} 项耗材库存不足，当前库存跟不上该观察期销量需求。仅返回只读缺口，不创建采购单、不补货。`
                : `${demandRange.label}${coverage.project.name}服务销量 ${coverage.serviceCount} 次，按标准 BOM 核对，当前耗材库存可覆盖该观察期的同等销量需求。该结论是历史需求基线，不是未来销量预测；本次不创建采购单、不补货。`;
          return {
            status: 'completed',
            answer,
            citations: [citation],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'table',
                rows: coverage.rows,
                columns: [
                  'projectName',
                  'productName',
                  'serviceCount',
                  'standardQty',
                  'demandQty',
                  'currentStock',
                  'coverageServiceCount',
                  'shortageQty',
                  'unit',
                ],
                citationIds: [citation.sourceId],
              },
            ],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              answerScope: 'project_material_sales_coverage',
              projectId: coverage.project.id,
              projectName: coverage.project.name,
              serviceCount: coverage.serviceCount,
              shortageItemCount: shortageRows.length,
              rangeLabel: demandRange.label,
              actionWriteCount: 0,
              completionCriteria: ['project_sales_loaded', 'project_bom_loaded', 'current_material_stock_loaded'],
            },
          };
        }
        if (
          /(?:项目|护理|服务).*(?:缺|不足|没有).*(?:耗材|物料)|(?:耗材|物料).*(?:缺|不足).*(?:项目|护理|服务)/.test(
            input.question,
          )
        ) {
          const availability = await this.projectMaterialAvailability(input.context.storeId);
          const rows = availability.blockedProjects.slice(0, this.resolveLimit(input.args.limit, 20));
          const limitation =
            availability.unconfiguredProjectCount > 0
              ? `${availability.unconfiguredProjectCount} 个在售项目没有配置 BOM，未纳入可执行性判断。`
              : undefined;
          return {
            status: 'completed',
            answer: rows.length
              ? `当前有 ${rows.length} 个项目因至少一项标准耗材库存不足，不能按现有 BOM 完整执行。${limitation ? ` ${limitation}` : ''}`
              : `已配置 BOM 的 ${availability.configuredProjectCount} 个项目中，没有发现因标准耗材库存不足而无法执行的项目。${limitation ? ` ${limitation}` : ''}`,
            citations: [
              {
                sourceType: 'db_skill',
                sourceId: 'project_material_availability',
                label: '项目 BOM 与当前耗材库存核对',
              },
            ],
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
        if (
          /(?:最近|本周|本月|近期)?.*采购了什么|采购.*(?:花了多少|金额|费用)|采购单.*(?:金额|明细)/.test(input.question)
        ) {
          const rows = procurement.recentOrders.slice(0, this.resolveLimit(input.args.limit, 10));
          const totalAmount = rows.reduce((sum, item) => sum + item.amount, 0);
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: rows.length
                ? `最近 ${rows.length} 张采购单合计 ${totalAmount.toFixed(2)} 元。`
                : '当前门店没有采购订单记录。',
              citations: [
                {
                  sourceType: 'db_skill',
                  sourceId: 'inventory_procurement_analysis',
                  label: '采购单、供应商与采购金额',
                },
              ],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '采购单金额合计', value: `${totalAmount.toFixed(2)} 元`, hint: `${rows.length} 张采购单` },
                  ],
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
            },
            dataQuality,
          );
        }
        if (
          /(?:耗材|物料|产品|商品).*(?:消耗|用量|出库).*(?:最快|最多|排行|排名)|(?:消耗|用量|出库).*(?:最快|最多).*(?:耗材|物料|产品|商品)/.test(
            input.question,
          )
        ) {
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
          return this.applyDataQualityGuard(
            {
              status: 'completed',
              answer: rows.length
                ? `${range.label}消耗量最高的是 ${rows[0]!.productName}，出库/消耗 ${rows[0]!.outboundQty}。`
                : `${range.label}没有可用于消耗排行的出库记录。`,
              citations: [
                { sourceType: 'db_skill', sourceId: 'inventory_detail_analysis', label: '库存出库与消耗明细' },
              ],
              grounding: 'db_skill',
              blocks: [
                {
                  kind: 'ranking',
                  rows,
                  columns: ['productName', 'outboundQty', 'currentStock', 'coverageDays'],
                  citationIds: ['inventory_detail_analysis'],
                },
              ],
              metadata: {
                capabilityKey: 'inventory_operations_overview',
                answerScope: 'inventory_consumption_ranking',
                rangeLabel: range.label,
                completionCriteria: ['inventory_outbound_loaded', 'consumption_ranked'],
              },
            },
            dataQuality,
          );
        }
        return this.applyDataQualityGuard(
          {
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
                  {
                    label: '临期库存金额',
                    value: `${risk.expiringStockValue.toFixed(2)} 元`,
                    hint: `截止 ${expiringBefore.toISOString().slice(0, 10)}`,
                  },
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
                ? [
                    {
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
                    },
                  ]
                : []),
              { kind: 'limitations', items: ['本能力只生成采购建议和风险清单，不会创建或提交真实采购单'] },
            ],
            metadata: {
              capabilityKey: 'inventory_operations_overview',
              rangeLabel: range.label,
              expiringBefore: expiringBefore.toISOString(),
              mappingOutputs: {
                expiringBatches: risk.expiringProducts.map((item) => ({
                  entityType: 'product',
                  entityKey: String(item.productId),
                  mention: item.name,
                  source: 'system',
                  confidence: 1,
                })),
              },
              componentCapabilities: [
                'inventory_risk_summary',
                'inventory_detail_analysis',
                'inventory_procurement_analysis',
              ],
              completionCriteria: [
                'inventory_value_loaded',
                'risk_loaded',
                'consumption_loaded',
                'procurement_preview_loaded',
              ],
            },
          },
          dataQuality,
        );
      }
      case 'finance_risk_overview': {
        if (/净利润/.test(input.question)) {
          const limitation =
            '当前 Ami Brain 没有已发布的净利润统一口径，无法用毛利、实收或风险概览替代净利润。请先在管理端发布包含收入、退款、优惠、耗材、人工和经营费用的净利润定义。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              unsupportedReason: 'net_profit_definition_not_published',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        if (
          /(?:项目).*(?:成本).*(?:上涨|上升).*(?:毛利|利润)|(?:项目).*(?:毛利|利润).*(?:成本).*(?:上涨|上升)/.test(
            input.question,
          )
        ) {
          const limitation =
            '当前结算数据没有项目级收入、优惠、成本快照及可比期间归因，无法判断哪个项目因成本上涨影响毛利。Ami Brain 不会用全店毛利率或商品成本替代项目级成本归因。';
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
        if (isActiveCardCatalogQuestion(input.question)) {
          if (!this.prisma) throw new Error('active_card_catalog_prisma_unavailable');
          const normalizedQuestion = normalizeCardCatalogText(input.question);
          const requestedTimes = Number(input.question.match(/(\d+)\s*次卡/u)?.[1] ?? 0) || undefined;
          const keyword = normalizedQuestion.replace(
            /(?:有哪些|哪些|有没有|在售|可售|正在销售|\d+次卡|套餐卡|次卡)/gu,
            '',
          );
          const catalogCards = await this.prisma.card.findMany({
            where: {
              status: 'active',
              OR: [{ storeId: input.context.storeId }, { storeId: null }],
              ...(requestedTimes ? { totalTimes: requestedTimes } : {}),
            },
            select: {
              id: true,
              name: true,
              description: true,
              totalTimes: true,
              price: true,
              projects: true,
              status: true,
              storeId: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            take: 200,
          });
          const rows = catalogCards
            .map((card) => {
              const projects = Array.isArray(card.projects)
                ? card.projects.flatMap((item) => {
                    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
                    const value = item as Record<string, unknown>;
                    const projectName = String(value.projectName ?? value.name ?? '').trim();
                    return projectName ? [projectName] : [];
                  })
                : [];
              return {
                cardId: card.id,
                cardName: card.name,
                totalTimes: card.totalTimes,
                price: Number(card.price),
                projects,
                description: card.description ?? '',
                scope: card.storeId === null ? 'shared' : 'store',
              };
            })
            .filter((card) => {
              if (!keyword) return true;
              const haystacks = [card.cardName, ...card.projects].map(normalizeCardCatalogText);
              return haystacks.some((value) => value.includes(keyword) || keyword.includes(value));
            })
            .slice(0, this.resolveLimit(input.args.limit, 20));
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'active_card_catalog',
            label: '当前门店在售次卡目录',
          } as const;
          return {
            status: 'completed',
            answer: rows.length
              ? `当前有 ${rows.length} 张匹配的在售次卡：${rows.map((row) => `${row.cardName}（${row.totalTimes} 次，${row.price.toFixed(2)} 元，适用项目：${row.projects.join('、') || '未配置'}）`).join('；')}。`
              : '当前门店没有匹配该名称、项目或次数条件的在售次卡。',
            citations: [citation],
            grounding: 'db_skill',
            blocks: rows.length
              ? [
                  {
                    kind: 'table',
                    rows,
                    columns: ['cardName', 'totalTimes', 'price', 'projects', 'description', 'scope'],
                    citationIds: ['active_card_catalog'],
                  },
                ]
              : [{ kind: 'limitations', items: ['no_data: active_card_catalog_not_matched'] }],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'active_card_catalog',
              requestedTimes: requestedTimes ?? null,
              keyword: keyword || null,
              matchedCardCount: rows.length,
              actionWriteCount: 0,
            },
          };
        }
        const diagnosisAnswer = input.answerShape === 'diagnosis';
        const diagnosisRange = diagnosisAnswer ? this.resolveFinanceDiagnosisRange(input, range) : range;
        if (
          /(?:实收口径.*(?:确认口径|确认收入).*(?:差|对比|比较)|(?:确认口径|确认收入).*实收口径.*(?:差|对比|比较))/.test(
            input.question,
          )
        ) {
          if (!this.prisma) throw new Error('prisma_service_unavailable');
          const [income, usageRows] = await Promise.all([
            this.skillRuntime.buildFinanceIncomeAnalysis({
              storeId: input.context.storeId,
              startDate: diagnosisRange.startDate,
              endDate: diagnosisRange.endDate,
            }),
            this.prisma.cardUsageRecord.findMany({
              where: {
                storeId: input.context.storeId,
                verifiedAt: { gte: diagnosisRange.startDate, lte: diagnosisRange.endDate },
              },
              select: { recognizedAmount: true, recognizedUnitValue: true, times: true },
            }),
          ]);
          const recognizedRevenue = usageRows.reduce((sum, row) => {
            const recognizedAmount = Number(row.recognizedAmount ?? 0);
            const fallbackAmount = Number(row.recognizedUnitValue ?? 0) * Number(row.times ?? 0);
            return sum + (recognizedAmount > 0 ? recognizedAmount : fallbackAmount);
          }, 0);
          const paidAmount = income.totalCollected;
          const delta = paidAmount - recognizedRevenue;
          const direction = delta > 0 ? '高于' : delta < 0 ? '低于' : '等于';
          return {
            status: 'completed',
            answer: `${diagnosisRange.label}实收口径 ${paidAmount.toFixed(2)} 元，次卡核销确认收入 ${recognizedRevenue.toFixed(2)} 元；实收${direction}确认收入 ${Math.abs(delta).toFixed(2)} 元。两者不是同一会计口径：实收反映支付成功流水，确认收入仅反映已核销次卡的履约确认金额。`,
            citations: [
              { sourceType: 'business_definition', sourceId: 'metric.paid_amount', label: '业务定义：实收金额' },
              {
                sourceType: 'business_definition',
                sourceId: 'metric.card_recognized_revenue_amount',
                label: '业务定义：次卡核销确认收入',
              },
              { sourceType: 'db_skill', sourceId: 'finance_income_analysis', label: '当前门店成功支付流水' },
              { sourceType: 'db_skill', sourceId: 'card_usage_recognized_revenue', label: '次卡核销确认收入' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'comparison',
                items: [
                  {
                    label: '实收与确认收入',
                    current: `实收 ${paidAmount.toFixed(2)} 元`,
                    previous: `确认收入 ${recognizedRevenue.toFixed(2)} 元`,
                    delta: `${this.signed(delta, 2)} 元`,
                  },
                ],
                citationIds: ['finance_income_analysis', 'card_usage_recognized_revenue'],
              },
              {
                kind: 'limitations',
                items: ['实收与次卡核销确认收入属于不同业务口径，差额不是利润，也不能直接解释为收入异常。'],
              },
            ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'paid_vs_card_recognized_revenue',
              rangeLabel: diagnosisRange.label,
              paidAmount,
              recognizedRevenue,
              delta,
              sourceRowCount: usageRows.length,
              completionCriteria: ['paid_amount_loaded', 'recognized_revenue_loaded', 'scope_difference_disclosed'],
            },
          };
        }
        const cardRecognizedRevenue = await this.buildCardRecognizedRevenueAnswer(input, diagnosisRange);
        if (cardRecognizedRevenue) return cardRecognizedRevenue;
        const structuredFinanceAnswer = await this.buildStructuredFinanceMetricAnswer(input, diagnosisRange);
        if (structuredFinanceAnswer) return structuredFinanceAnswer;
        const projectOrderProfit = await this.buildProjectOrderProfitAnswer(input, diagnosisRange);
        if (projectOrderProfit) return projectOrderProfit;
        const orderPaymentMismatch = await this.buildOrderPaymentMismatchAnswer(input, diagnosisRange);
        if (orderPaymentMismatch) return orderPaymentMismatch;
        if (
          /(?:次卡|套餐卡).*(?:卖得最好|卖得最多|销量最高|销售排行|销售排名|哪个卖得好)|(?:卖得最好|卖得最多|销量最高|销售排行|销售排名).*(?:次卡|套餐卡)/.test(
            input.question,
          )
        ) {
          if (!this.prisma) throw new Error('card_package_sales_ranking_prisma_unavailable');
          const normalizedQuestion = input.question.replace(/\s+/gu, '');
          const catalogCards = await this.prisma.card.findMany({
            where: { storeId: input.context.storeId, status: 'active' },
            select: { id: true, name: true },
          });
          const mentionedCardIds = catalogCards
            .filter((card) => normalizedQuestion.includes(card.name.replace(/\s+/gu, '')))
            .map((card) => card.id);
          const sales = await this.prisma.customerCard.findMany({
            where: {
              customer: { storeId: input.context.storeId },
              createdAt: { gte: diagnosisRange.startDate, lte: diagnosisRange.endDate },
              ...(mentionedCardIds.length ? { cardId: { in: mentionedCardIds } } : {}),
            },
            select: {
              id: true,
              cardId: true,
              cardName: true,
              paidAmount: true,
              giftTimes: true,
              saleType: true,
            },
          });
          const aggregate = new Map<
            string,
            {
              cardId: number;
              cardName: string;
              soldCount: number;
              paidAmount: number;
              giftTimes: number;
              newSaleCount: number;
              renewalCount: number;
            }
          >();
          for (const sale of sales) {
            const key = `${sale.cardId}:${sale.cardName}`;
            const row = aggregate.get(key) ?? {
              cardId: sale.cardId,
              cardName: sale.cardName,
              soldCount: 0,
              paidAmount: 0,
              giftTimes: 0,
              newSaleCount: 0,
              renewalCount: 0,
            };
            row.soldCount += 1;
            row.paidAmount += Number(sale.paidAmount);
            row.giftTimes += sale.giftTimes;
            if (sale.saleType === 'renewal') row.renewalCount += 1;
            else row.newSaleCount += 1;
            aggregate.set(key, row);
          }
          const rows = [...aggregate.values()]
            .sort(
              (left, right) =>
                right.soldCount - left.soldCount ||
                right.paidAmount - left.paidAmount ||
                left.cardName.localeCompare(right.cardName, 'zh-CN'),
            )
            .slice(0, this.resolveLimit(input.args.limit, 20));
          const leader = rows[0];
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'finance_card_package_sales_ranking',
            label: '当前门店次卡开卡张数与实收排行',
          };
          return {
            status: 'completed',
            answer: leader
              ? `${diagnosisRange.label}按开卡张数统计，卖得最好的是 ${leader.cardName}：${leader.soldCount} 张，实收 ${leader.paidAmount.toFixed(2)} 元。张数相同时按实收金额排序。`
              : `${diagnosisRange.label}当前没有匹配的${mentionedCardIds.length ? '指定次卡' : '门店次卡'}开卡销售数据。`,
            citations: [citation],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'ranking',
                rows,
                columns: ['cardName', 'soldCount', 'paidAmount', 'newSaleCount', 'renewalCount', 'giftTimes'],
                citationIds: [citation.sourceId],
              },
              ...(!rows.length
                ? [{ kind: 'limitations' as const, items: ['no_data: 当前没有匹配的次卡开卡销售数据。'] }]
                : []),
            ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'card_package_sales_ranking',
              rangeLabel: diagnosisRange.label,
              matchedCatalogCardIds: mentionedCardIds,
              rankingDefinition: 'customer_card_count_desc_then_paid_amount_desc',
              actionWriteCount: 0,
              mappingOutputs: { cardRanking: rows },
              completionCriteria: ['customer_card_sales_loaded', 'card_sales_ranked'],
            },
          };
        }
        if (/(?:次卡|套餐卡).*(?:销售|开卡).*(?:金额|多少)|(?:次卡|套餐卡).*(?:卖了多少)/.test(input.question)) {
          if (!this.sharedBusinessMetrics) throw new Error('shared_business_metric_service_unavailable');
          const result = await this.sharedBusinessMetrics.execute(
            {
              capabilityId: 'finance.card-package-sales.metric',
              question: input.question,
              timeRange: {
                startDate: diagnosisRange.startDate.toISOString(),
                endDate: diagnosisRange.endDate.toISOString(),
                label: diagnosisRange.label,
              },
            },
            {
              runId: input.runId,
              storeId: input.context.storeId,
              userId: input.context.userId,
              role: 'manager',
              permissions: input.context.permissions,
            },
          );
          const data =
            result.data && typeof result.data === 'object' && !Array.isArray(result.data)
              ? (result.data as Record<string, unknown>)
              : {};
          const metrics =
            data.metrics && typeof data.metrics === 'object' && !Array.isArray(data.metrics)
              ? (data.metrics as Record<string, unknown>)
              : {};
          const totalPaidAmount = Number(metrics.totalPaidAmount ?? 0);
          const cardCount = Number(metrics.cardCount ?? 0);
          const totalGiftTimes = Number(metrics.totalGiftTimes ?? 0);
          return {
            status: 'completed',
            answer: result.summary,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: 'metric.card_package_sales_amount',
                label: '共享后台业务定义：次卡销售金额',
              },
              {
                sourceType: 'db_skill',
                sourceId: 'finance.card-package-sales.metric',
                label: '后台次卡销售指标服务',
              },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '次卡销售金额', value: `${totalPaidAmount.toFixed(2)} 元` },
                  { label: '开卡张数', value: `${cardCount} 张`, hint: `赠送 ${totalGiftTimes} 次` },
                ],
                citationIds: ['metric.card_package_sales_amount', 'finance.card-package-sales.metric'],
              },
            ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'shared_card_package_sales_metric',
              sharedCapabilityId: 'finance.card-package-sales.metric',
              rangeLabel: diagnosisRange.label,
              completionCriteria: ['shared_business_metric_executed', 'card_package_sales_amount_loaded'],
            },
          };
        }
        if (
          /(?:退款|退货).*(?:上月|上个月|上一月).*(?:增加|减少|差多少|相比|对比)|(?:本月|这个月).*(?:退款|退货).*(?:上月|上个月).*(?:增加|减少|差多少|相比|对比)/.test(
            input.question,
          )
        ) {
          const comparison = this.resolveComparisonRange(input, range) ?? {
            label: `${range.label}对比上月同期`,
            current: range,
            previous: this.previousComparableRange(range),
          };
          const [currentRisk, previousRisk] = await Promise.all([
            this.skillRuntime.buildFinanceRiskSummary({
              storeId: input.context.storeId,
              startDate: comparison.current.startDate,
              endDate: comparison.current.endDate,
            }),
            this.skillRuntime.buildFinanceRiskSummary({
              storeId: input.context.storeId,
              startDate: comparison.previous.startDate,
              endDate: comparison.previous.endDate,
            }),
          ]);
          const delta = currentRisk.refundAmount - previousRisk.refundAmount;
          const direction = delta > 0 ? '增加' : delta < 0 ? '减少' : '持平';
          return {
            status: 'completed',
            answer: `${comparison.current.label}退款 ${currentRisk.refundAmount.toFixed(2)} 元，${comparison.previous.label}退款 ${previousRisk.refundAmount.toFixed(2)} 元，${direction} ${Math.abs(delta).toFixed(2)} 元。`,
            citations: [
              { sourceType: 'business_definition', sourceId: 'metric.refund_amount', label: '业务定义：退款金额' },
              { sourceType: 'db_skill', sourceId: 'finance_risk_summary', label: '退款金额汇总' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'comparison',
                items: [
                  {
                    label: '退款金额',
                    current: `${comparison.current.label} ${currentRisk.refundAmount.toFixed(2)} 元`,
                    previous: `${comparison.previous.label} ${previousRisk.refundAmount.toFixed(2)} 元`,
                    delta: `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} 元`,
                  },
                ],
                citationIds: ['metric.refund_amount', 'finance_risk_summary'],
              },
            ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'refund_amount_comparison',
              comparisonRangeLabel: comparison.label,
              completionCriteria: ['current_refund_amount_loaded', 'previous_refund_amount_loaded'],
            },
          };
        }
        if (
          /毛利率/.test(input.question) &&
          !/(?:产品|商品|货品|项目)/.test(input.question) &&
          input.answerShape === 'scalar'
        ) {
          const summary = await this.skillRuntime.buildFinanceRiskSummary({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          });
          const grossMarginRate = summary.grossMarginRate;
          return this.answer({
            answer:
              grossMarginRate === undefined
                ? `${diagnosisRange.label}缺少可计算毛利率的完整收入和成本口径。`
                : `${diagnosisRange.label}毛利率为 ${(grossMarginRate * 100).toFixed(1)}%。`,
            citationId: 'finance_risk_summary',
            citationLabel: '收入、成本与毛利汇总',
            citations: [
              { sourceType: 'business_definition', sourceId: 'metric.gross_margin_rate', label: '业务定义：毛利率' },
            ],
            blocks:
              grossMarginRate === undefined
                ? [{ kind: 'limitations', items: [`${diagnosisRange.label}缺少可计算毛利率的完整收入和成本口径`] }]
                : [
                    {
                      kind: 'kpi',
                      items: [{ label: '毛利率', value: `${(grossMarginRate * 100).toFixed(1)}%` }],
                      citationIds: ['finance_risk_summary'],
                    },
                  ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'gross_margin_rate_scalar',
              rangeLabel: diagnosisRange.label,
              metricDefinitionKey: 'metric.gross_margin_rate',
            },
          });
        }
        if (/(?:退款|退货).*(?:原因|为什么)|(?:原因|为什么).*(?:退款|退货)/.test(input.question)) {
          const refundAnalysis = await this.skillRuntime.buildFinanceRefundReasonAnalysis({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          });
          const rows = refundAnalysis.records.slice(0, this.resolveLimit(input.args.limit, 20));
          const reasonText = refundAnalysis.reasons.length
            ? refundAnalysis.reasons
                .map((item) => `${item.reason} ${item.count} 笔/${item.amount.toFixed(2)} 元`)
                .join('；')
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
        if (
          /(?:产品|商品|货品).*(?:低于成本|毛利率|毛利)|(?:低于成本|毛利率|毛利).*(?:产品|商品|货品)/.test(
            input.question,
          )
        ) {
          const margin = await this.skillRuntime.buildFinanceProductMarginAnalysis({
            storeId: input.context.storeId,
            startDate: diagnosisRange.startDate,
            endDate: diagnosisRange.endDate,
          });
          const belowCostRequested = /低于成本/.test(input.question);
          const selected = (
            belowCostRequested ? margin.rows.filter((row) => row.belowCostSaleCount > 0) : margin.rows
          ).slice(0, this.resolveLimit(input.args.limit, 20));
          const metricKey = belowCostRequested
            ? 'metric.product_below_cost_sale_count'
            : 'metric.product_gross_margin_rate';
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
              {
                sourceType: 'db_skill',
                sourceId: 'finance_product_margin_analysis',
                label: '订单商品净额、退款冲减与成本快照分析',
              },
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
                  grossMarginRate:
                    row.grossMarginRate === undefined ? null : `${(row.grossMarginRate * 100).toFixed(1)}%`,
                  belowCostSaleCount: row.belowCostSaleCount,
                  costCoverageRate: `${(row.costCoverageRate * 100).toFixed(1)}%`,
                  costSources: row.costSources.join(','),
                })),
                columns: [
                  'productName',
                  'quantity',
                  'netRevenue',
                  'costAmount',
                  'grossProfit',
                  'grossMarginRate',
                  'belowCostSaleCount',
                  'costCoverageRate',
                  'costSources',
                ],
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
        if (
          /(?:储值卡|会员余额|储值余额).*(?:余额总计|总余额|合计多少|总计多少).*(?:撑住|都来消费|集中消费)|(?:客户都来消费).*(?:撑住|储值)/.test(
            input.question,
          )
        ) {
          const balance = await this.prisma!.customerBalanceAccount.aggregate({
            where: { storeId: input.context.storeId, status: 'active' },
            _sum: { cashBalance: true, giftBalance: true },
          });
          const cashBalance = Number(balance._sum.cashBalance ?? 0);
          const giftBalance = Number(balance._sum.giftBalance ?? 0);
          const totalBalance = cashBalance + giftBalance;
          const limitation =
            '是否能承接集中消费不能只看储值余额；当前后台没有统一接入可用现金储备、未来核销节奏和服务产能的偿付压力模型，因此不能给出“能撑住”或“撑不住”的确定结论。';
          return {
            status: 'completed',
            answer: `当前有效储值账户余额合计 ${totalBalance.toFixed(2)} 元，其中现金余额 ${cashBalance.toFixed(2)} 元、赠送余额 ${giftBalance.toFixed(2)} 元。${limitation}`,
            citations: [
              { sourceType: 'db_skill', sourceId: 'customer_balance_accounts', label: '当前门店有效储值账户余额' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '储值余额合计', value: `${totalBalance.toFixed(2)} 元` },
                  { label: '现金余额', value: `${cashBalance.toFixed(2)} 元` },
                  { label: '赠送余额', value: `${giftBalance.toFixed(2)} 元` },
                ],
                citationIds: ['customer_balance_accounts'],
              },
              { kind: 'limitations', items: [limitation] },
            ],
            metadata: {
              capabilityKey: 'finance_risk_overview',
              answerScope: 'stored_balance_liquidity_boundary',
              totalBalance,
              cashBalance,
              giftBalance,
              unsupportedReason: 'liquidity_stress_model_not_available',
              completionCriteria: ['stored_balance_loaded', 'liquidity_assessment_boundary_disclosed'],
            },
          };
        }
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
            const asksDiscountRate = /折扣率/.test(input.question);
            const limitation = asksDiscountRate
              ? '当前后台已发布折扣金额，但没有统一发布折扣率的分母口径；本次只返回折扣金额，不用实收或原价临时拼出折扣率。'
              : '当前请求包含多个独立已发布指标，本次分别展示，不将其自动合成未发布的派生指标。';
            return {
              status: 'completed',
              answer: `${diagnosisRange.label}${scalarItems.map((item) => `${item.label} ${item.value}`).join('，')}。${multipleMetrics || asksDiscountRate ? limitation : ''}`,
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
                ...(multipleMetrics || asksDiscountRate ? [{ kind: 'limitations' as const, items: [limitation] }] : []),
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
        const projectStructureGap =
          diagnosisAnswer &&
          (/(?:项目|品项|商品|产品|结构)/.test(input.question) ||
            ['dimension.projectName', 'dimension.productName'].some((key) => requestedDiagnosisDimensions.has(key)))
            ? [
                '现有结算未关联商品/项目级收入、折扣和成本，无法量化商品或项目结构对毛利变化的贡献；本次仅诊断已接入的收入、退款、折扣、物料、提成和经营费用。',
              ]
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
                {
                  label: '毛利率',
                  value:
                    cost.grossMarginRate === undefined ? '暂无结算口径' : `${(cost.grossMarginRate * 100).toFixed(1)}%`,
                },
                { label: '会员卡负债', value: `${cost.cardLiability.toFixed(2)} 元` },
              ],
              citationIds: citations.map((item) => item.sourceId),
            },
            {
              kind: 'ranking',
              rows: income.paymentBreakdown.map((item) => ({
                paymentMethod: item.method,
                amount: item.amount,
                count: item.count,
              })),
              columns: ['paymentMethod', 'amount', 'count'],
              citationIds: ['finance_income_analysis'],
            },
            ...(income.dailyTrend.length
              ? [
                  {
                    kind: 'chart' as const,
                    chartType: 'line' as const,
                    rows: income.dailyTrend,
                    xKey: 'date',
                    yKeys: ['revenue'],
                    citationIds: ['finance_income_analysis'],
                  },
                ]
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
                  : [
                      {
                        title: '未触发财务预警',
                        detail: `${diagnosisRange.label}退款、优惠和毛利未触发当前预警规则。`,
                        severity: 'info' as const,
                      },
                    ],
              citationIds: diagnosis ? citations.map((item) => item.sourceId) : ['finance_risk_summary'],
            },
            ...(diagnosis?.comparisonItems.length
              ? [
                  {
                    kind: 'comparison' as const,
                    items: diagnosis.comparisonItems,
                    citationIds: citations.map((item) => item.sourceId),
                  },
                ]
              : []),
            ...(projectStructureGap.length ? [{ kind: 'limitations' as const, items: projectStructureGap }] : []),
          ],
          metadata: {
            capabilityKey: 'finance_risk_overview',
            rangeLabel: diagnosisRange.label,
            diagnosisBaselineLabel: comparisonRange?.label ?? null,
            answerShape: input.answerShape ?? null,
            componentCapabilities: ['finance_risk_summary', 'finance_income_analysis', 'finance_cost_analysis'],
            completionCriteria: [
              'income_loaded',
              'payment_breakdown_loaded',
              'cost_loaded',
              'risk_loaded',
              'liability_loaded',
            ],
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
          {
            sourceType: 'business_definition',
            sourceId: 'metric.follow_up_priority_score',
            label: '客户跟进优先级评分',
          },
          { sourceType: 'db_skill', sourceId: 'marketing_customer_segment_summary', label: '客户分层与卡项关注摘要' },
        ];
        const findings = [
          ...(analytics.reachedCount > 0 && analytics.conversionRate < 0.1
            ? [
                {
                  title: '渠道整体转化偏低',
                  detail: `${range.label}${analytics.dataCoverage.touchesTruncated ? `前 ${analytics.dataCoverage.touchSampleSize} 条` : ''}触达记录转化率 ${(analytics.conversionRate * 100).toFixed(1)}%，建议先复核客群和渠道再扩大触达。`,
                  severity: 'warning' as const,
                },
              ]
            : []),
          ...(analytics.reachedCount === 0
            ? [
                {
                  title: '缺少营销触达数据',
                  detail: `${range.label}没有营销触达记录，无法评价渠道转化。`,
                  severity: 'info' as const,
                },
              ]
            : []),
          {
            title: 'ROI 口径未开放',
            detail: '当前统一业务定义没有营销活动成本事实，本能力只展示归因收入，不计算虚假 ROI。',
            severity: 'info' as const,
          },
          ...(analytics.dataCoverage.touchesTruncated ||
          analytics.dataCoverage.attributionsTruncated ||
          prioritySnapshot.truncated
            ? [
                {
                  title: '营销明细达到读取上限',
                  detail:
                    '当前结果是受控样本，不把读取上限冒充完整业务总量；需要聚合查询或分页任务后才能给出精确全量统计。',
                  severity: 'warning' as const,
                },
              ]
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
                {
                  label: '优先跟进客户',
                  value: `${prioritySnapshot.truncated ? '至少 ' : ''}${priorityRows.length} 人`,
                  hint: prioritySnapshot.truncated
                    ? `前 ${prioritySnapshot.scannedOpportunityCount} 条机会记录`
                    : undefined,
                },
                {
                  label: '触达',
                  value: `${analytics.dataCoverage.touchesTruncated ? '至少 ' : ''}${analytics.reachedCount} 人`,
                  hint: touchCoverageHint,
                },
                { label: '转化', value: `${analytics.convertedCount} 人`, hint: touchCoverageHint },
                { label: '转化率', value: `${(analytics.conversionRate * 100).toFixed(1)}%`, hint: touchCoverageHint },
                {
                  label: '归因收入',
                  value: `${analytics.attributedRevenue.toFixed(2)} 元`,
                  hint: analytics.dataCoverage.attributionsTruncated
                    ? `前 ${analytics.dataCoverage.attributionSampleSize} 条归因样本`
                    : undefined,
                },
                {
                  label: '运行中策略',
                  value: `${activeStrategyCount} 个`,
                  hint: `策略总数 ${analytics.strategies.length}`,
                },
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
              ? [
                  {
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
                  },
                ]
              : []),
            ...(analytics.attributionByStrategy.length
              ? [
                  {
                    kind: 'ranking' as const,
                    rows: analytics.attributionByStrategy.map((item) => ({
                      strategy: item.name,
                      attributedRevenue: item.revenue,
                    })),
                    columns: ['strategy', 'attributedRevenue'],
                    citationIds: ['marketing_attribution_analytics'],
                  },
                ]
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
            {
              kind: 'limitations',
              items: ['本能力不会直接发送营销消息，也不会发布自动化规则或计算缺少成本事实的 ROI'],
            },
          ],
          metadata: {
            capabilityKey: 'marketing_growth_overview',
            mappingOutputs: {
              priorityCustomers: priorityRows.slice(0, this.resolveLimit(input.args.limit, 20)).map((item) => ({
                entityType: 'customer',
                entityKey: String(item.customerId),
                mention: item.customerName,
                source: 'system',
                confidence: 1,
              })),
            },
            rangeLabel: range.label,
            componentCapabilities: [
              'marketing_attribution_analytics',
              'marketing_follow_up_opportunities',
              'marketing_customer_segment_summary',
            ],
            dataCoverage: { ...analytics.dataCoverage, priorityTruncated: prioritySnapshot.truncated },
            completionCriteria: [
              'segments_loaded',
              'priority_loaded',
              'channel_conversion_loaded',
              'attribution_loaded',
              'strategy_loaded',
            ],
          },
        };
      }
      case 'marketing_automation_rule_preview': {
        if (/(?:满意度|服务评价).*(?:自动|收集|采集)|(?:自动|收集|采集).*(?:满意度|服务评价)/.test(input.question)) {
          const limitation =
            '当前管理端和后端没有客户满意度采集、问卷发送和回执事实闭环，无法生成可执行的满意度自动采集规则。';
          return {
            status: 'completed',
            answer: limitation,
            citations: [],
            grounding: 'none',
            blocks: [{ kind: 'limitations', items: [limitation] }],
            metadata: {
              capabilityKey: 'marketing_automation_rule_preview',
              unsupportedReason: 'customer_satisfaction_collection_capability_not_open',
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        const rule = this.buildMarketingAutomationRulePreview(input.question);
        const limitation = '当前只生成可审阅规则预览，不发布自动化规则、不发送消息、不修改会员等级或客户权益。';
        const answer = `营销自动化规则预览：${rule.name}。触发条件：${rule.trigger}；建议动作：${rule.action}；保护条件：${rule.guardrails}。${limitation}`;
        return {
          status: 'completed',
          answer,
          citations: [
            {
              sourceType: 'template_skill',
              sourceId: 'marketing_automation_rule_preview',
              label: '营销自动化规则预览',
            },
          ],
          grounding: 'preview_action',
          blocks: [
            { kind: 'text', text: answer, citationIds: ['marketing_automation_rule_preview'] },
            { kind: 'limitations', items: [limitation] },
          ],
          metadata: {
            capabilityKey: 'marketing_automation_rule_preview',
            ruleType: rule.type,
            deliveryStatus: 'preview_only',
            businessDataPersisted: false,
            completionCriteria: ['trigger_defined', 'recommended_action_defined', 'guardrails_disclosed'],
          },
        };
      }
      case 'marketing_message_draft': {
        const customerReference = structuredEntityMentions(input.args as BrainCapabilityToolArgs).find(
          (entity) => entity.entityType === 'customer' && entity.source === 'conversation',
        );
        const recall = /召回|沉默|沉睡|没来|流失/.test(input.question);
        const timeWindow = this.resolveDraftTimeWindow(input.question, range.label);
        const draft = recall
          ? this.skillRuntime.draftCustomerRecall({})
          : this.skillRuntime.draftAppointmentReminder({ timeWindow });
        const answer = customerReference ? `针对上轮选中的客户 ${customerReference.mention}：\n${draft}` : draft;
        const sourceId = recall ? 'marketing_draft_customer_recall' : 'marketing_draft_appointment_reminder';
        return {
          status: 'completed',
          answer,
          citations: [{ sourceType: 'skill', sourceId, label: recall ? '老客召回文案模板' : '预约邀约文案模板' }],
          grounding: 'template_skill',
          blocks: [
            {
              kind: 'limitations',
              items: [
                customerReference
                  ? '这是基于上轮受控客户引用生成的可编辑草稿，未重新查询客户敏感资料，也不会自动发送。'
                  : '这是可编辑文案草稿，未查询或选择具体客户，也不会自动发送。',
              ],
            },
          ],
          metadata: {
            capabilityKey: 'marketing_message_draft',
            mode: recall ? 'customer_recall' : 'appointment_invitation',
            rangeLabel: range.label,
            timeWindow: timeWindow ?? null,
            deliveryStatus: 'draft_only',
            ...(customerReference
              ? {
                  resolvedResultRef: {
                    entityType: customerReference.entityType,
                    entityKey: customerReference.entityKey,
                    mention: customerReference.mention,
                  },
                }
              : {}),
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
        if (focusedReservationAnswer) {
          return this.applyDataQualityGuard(
            this.ensureAnswerTextBlock({
              ...focusedReservationAnswer,
              metadata: {
                ...focusedReservationAnswer.metadata,
                mappingOutputs: {
                  customerIds: [...new Set(schedule.reservations.map((item) => item.customerId))],
                },
              },
            }),
            dataQuality,
          );
        }
        const activeReservations = schedule.reservations.filter((item) => !this.isCancelledReservation(item.status));
        const beauticianName = this.resolveEntityName(input, 'beautician');
        const scopedReservations = beauticianName
          ? activeReservations.filter((item) => item.beauticianName === beauticianName)
          : activeReservations;
        const rows = scopedReservations
          .slice(0, this.resolveLimit(input.args.limit, 100))
          .map(
            (item, index) =>
              `${index + 1}. ${item.date} ${item.startTime}，${item.customerName}，${item.projectName}${
                item.beauticianName ? `，美容师 ${item.beauticianName}` : ''
              }`,
          )
          .join('\n');
        return this.applyDataQualityGuard(
          {
            status: 'completed',
            answer: `${range.label}${beauticianName ? `${beauticianName}的` : ''}有效预约共 ${scopedReservations.length} 个。${rows ? `\n${rows}` : ''}`,
            citations,
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  {
                    label: `${range.label}有效预约`,
                    value: `${scopedReservations.length} 个`,
                  },
                ],
                citationIds: ['capability_reservation_list'],
              },
              {
                kind: 'table',
                rows: scopedReservations
                  .slice(0, this.resolveLimit(input.args.limit, 100))
                  .map((item) => this.reservationRow(item)),
                columns: [
                  'customerId',
                  'reservationId',
                  'date',
                  'startTime',
                  'endTime',
                  'customerName',
                  'projectName',
                  'beauticianName',
                  'status',
                ],
                citationIds: ['capability_reservation_list'],
              },
            ],
            metadata: {
              capabilityKey: 'reservation_list',
              answerScope: 'reservation_schedule_list',
              rangeLabel: range.label,
              count: scopedReservations.length,
              beauticianName: beauticianName ?? null,
              mappingOutputs: {
                customerIds: [...new Set(scopedReservations.map((item) => item.customerId))],
              },
              completionCriteria: ['reservation_schedule_loaded'],
            },
          },
          dataQuality,
        );
      }
      case 'customer_facts': {
        if (
          /(?:等待时间长|等待过久|久等).*(?:离开|走了|流失)|(?:离开|走了|流失).*(?:等待时间长|等待过久|久等)/.test(
            input.question,
          )
        ) {
          const limitation =
            '客户等待事实表和预约接待入口已上线，但当前门店尚未采集可证明等待过久离店的记录。Ami Brain 不会用客户档案、预约取消、爽约或普通备注替代离店原因。';
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
          const limitation =
            '客户反馈管理端、后端和事实表已上线，但当前门店尚未采集可回答该问题的投诉、满意度与处置记录。Ami Brain 不会用客户档案、会员权益、消费金额或营销响应替代投诉与满意度事实。';
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
        const customerAnalyticsAnswer = await this.buildCustomerAnalyticsAnswer(input, range);
        if (customerAnalyticsAnswer) return customerAnalyticsAnswer;
        const memberLevelFilter = this.readCustomerMemberLevelFilter(input);
        if (memberLevelFilter) {
          const result = await this.customerFacts.getCustomerMemberLevelSummary(
            input.context.storeId,
            memberLevelFilter.values,
            this.resolveLimit(input.args.limit, 10),
          );
          const memberLevelLabel = result.memberLevels.join('、');
          const definitionCitationId = `${memberLevelFilter.definitionKey}@${memberLevelFilter.definitionVersion}`;
          const factCitationId = 'customer_member_level_summary';
          const answer = `当前门店共有 ${result.total} 位${memberLevelLabel}会员。`;
          return this.answer({
            answer,
            citationId: factCitationId,
            citationLabel: '当前门店客户会员等级事实',
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: definitionCitationId,
                label: '业务定义：客户会员等级',
              },
            ],
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: `${memberLevelLabel}会员`, value: `${result.total} 人` }],
                citationIds: [definitionCitationId, factCitationId],
              },
              ...(input.answerShape === 'scalar'
                ? []
                : [
                    {
                      kind: 'table' as const,
                      rows: result.rows,
                      columns: ['customerName', 'memberLevel', 'totalSpent', 'lastVisitDate'],
                      citationIds: [definitionCitationId, factCitationId],
                    },
                  ]),
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'customer_member_level_summary',
              total: result.total,
              memberLevels: result.memberLevels,
              filter: {
                definitionKey: memberLevelFilter.definitionKey,
                operator: memberLevelFilter.operator,
                values: result.memberLevels,
              },
            },
          });
        }
        if (
          /钻石会员/.test(input.question) &&
          /(?:多少|几个|一共|共有|总数)/.test(input.question) &&
          !/(?:有哪些|名单|列出|明细|分别)/.test(input.question)
        ) {
          const result = await this.customerFacts.getCustomerMemberLevelSummary(
            input.context.storeId,
            ['钻石会员'],
            500,
          );
          return this.answer({
            answer: `当前门店共有 ${result.total} 位钻石会员。`,
            citationId: 'customer_member_level_summary',
            citationLabel: '当前门店客户会员等级事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '钻石会员人数', value: `${result.total} 人` }],
                citationIds: ['customer_member_level_summary'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'customer_member_level_count',
              memberLevel: '钻石会员',
              total: result.total,
            },
          });
        }
        if (
          /(?:到店|来店).*?(?:客户|客人).*?(?:有多少|多少个|一共|共有|总数)|(?:有多少|多少个|一共|共有|总数).*?(?:到店|来店).*?(?:客户|客人)|到店的客户有多少|来店的客户有多少/.test(
            input.question,
          )
        ) {
          const result = await this.customerFacts.getVisitedCustomerSummary({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
            limit: 500,
          });
          return this.answer({
            answer: `${range.label}实际到店客户 ${result.total} 人。`,
            citationId: 'customer_visited_count_facts',
            citationLabel: '客户到店事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '实际到店客户', value: `${result.total} 人` }],
                citationIds: ['customer_visited_count_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'visited_customer_count',
              rangeLabel: range.label,
              total: result.total,
            },
          });
        }
        if (
          /(?:到店|来店).*(?:金卡以上|金卡及以上|金卡及其以上)|(?:金卡以上|金卡及以上|金卡及其以上).*(?:到店|来店)/.test(
            input.question,
          ) ||
          /开业至今.*(?:金卡以上|金卡及以上|金卡及其以上)/.test(input.question)
        ) {
          const useStoreOpeningStart = /开业至今/.test(input.question);
          const result = await this.customerFacts.getVisitedMemberTierCustomers({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
            minimumMemberLevel: '金卡',
            useStoreOpeningStart,
            limit: 500,
          });
          const answer = result.rows.length
            ? `${useStoreOpeningStart ? '开业至今' : range.label}到店客户中，金卡以上有 ${result.total} 人。`
            : `${useStoreOpeningStart ? '开业至今' : range.label}到店客户中没有金卡以上客户。`;
          return this.answer({
            answer,
            citationId: 'customer_visited_member_tier_facts',
            citationLabel: '到店金卡以上客户事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '金卡以上到店客户', value: `${result.total} 人` }],
                citationIds: ['customer_visited_member_tier_facts'],
              },
              {
                kind: 'table',
                rows: result.rows.map((row) => ({
                  ...row,
                  lastVisitDate: row.lastVisitDate ?? null,
                  latestArrivalDate: row.latestArrivalDate ?? null,
                })),
                columns: [
                  'customerId',
                  'customerName',
                  'memberLevel',
                  'lastVisitDate',
                  'latestArrivalDate',
                  'arrivalCount',
                ],
                citationIds: ['customer_visited_member_tier_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'visited_member_tier_set',
              minimumMemberLevel: '金卡',
              rangeLabel: useStoreOpeningStart ? '开业至今' : range.label,
              total: result.total,
            },
          });
        }
        if (
          /(?:办了|持有|有|开了).*(?:综合养护 20 次卡).*?(?:没来|没来的客户名单|没有来|未到店)/.test(input.question) ||
          /综合养护 20 次卡.*(?:没来|没来的客户名单|没有来|未到店)/.test(input.question)
        ) {
          const result = await this.customerFacts.getCardHoldersWithoutVisit({
            storeId: input.context.storeId,
            message: input.question,
            startDate: range.startDate,
            endDate: range.endDate,
            limit: 500,
          });
          return this.answer({
            answer:
              result.rows.length === 0
                ? `办了 ${result.cardNameQuery ?? '指定'} 的客户在 ${range.label} 没有到店记录。`
                : `办了 ${result.cardNameQuery ?? '指定'} 的客户在 ${range.label} 没来的人共 ${result.total} 人。`,
            citationId: 'customer_card_holders_without_visit_facts',
            citationLabel: '客户卡项与到店事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '未到店客户', value: `${result.total} 人` }],
                citationIds: ['customer_card_holders_without_visit_facts'],
              },
              {
                kind: 'table',
                rows: result.rows,
                columns: ['customerId', 'customerName', 'memberLevel', 'cardName', 'lastVisitDate'],
                citationIds: ['customer_card_holders_without_visit_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'card_holders_without_visit',
              cardNameQuery: result.cardNameQuery,
              total: result.total,
              rangeLabel: range.label,
            },
          });
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
                    ? [
                        `有效触达共 ${summary.touchCountTotal} 条，本次受控扫描 ${summary.touchCountAnalyzed} 条，结果为部分覆盖。`,
                      ]
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
          const diagnosisRequested =
            input.answerShape === 'diagnosis' || /(?:问题|原因).*(?:在哪|是什么)|为什么/.test(input.question);
          const diagnosisLimitation =
            '当前事实可确认新客 cohort、首笔有效订单转化和待转化人数，但尚未形成按未转化原因、顾问跟进过程和渠道质量拆解的归因事实，因此不能把低转化直接归因给某个渠道或员工。';
          return {
            status: 'completed',
            answer: `${range.label}新增客户 ${summary.newCustomerCount} 人，其中 ${summary.convertedCustomerCount} 人在同一周期内完成首笔有效正金额订单，转化率 ${(summary.conversionRate * 100).toFixed(1)}%，待转化 ${summary.unconvertedCustomerCount} 人。${diagnosisRequested ? ` ${diagnosisLimitation}` : ''}`,
            citations: [
              ...definitionCitations,
              {
                sourceType: 'db_skill',
                sourceId: 'customer_acquisition_conversion_summary',
                label: '客户建档与首笔有效订单转化事实',
              },
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
              ...(diagnosisRequested
                ? [
                    {
                      kind: 'diagnosis' as const,
                      findings: [{ title: '转化原因归因边界', detail: diagnosisLimitation, severity: 'info' as const }],
                      citationIds: ['customer_acquisition_conversion_summary'],
                    },
                  ]
                : []),
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: range.label,
              cohortDefinition: 'Customer.createdAt within requested period',
              conversionDefinition: 'first valid positive-net ProductOrder between customer creation and period end',
              diagnosisCoverage: diagnosisRequested
                ? 'conversion_result_only_without_cause_attribution'
                : 'not_requested',
              completionCriteria: ['new_customer_count_loaded', 'new_customer_conversion_count_loaded'],
            },
          };
        }
        if (
          input.answerShape === 'scalar' &&
          Boolean(structuredDefinitionRef(input.args.metrics, 'metric.new_customer_count'))
        ) {
          const summary = await this.customerFacts.getNewCustomerConversionSummary({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const metricRef = structuredDefinitionRef(input.args.metrics, 'metric.new_customer_count');
          const metricCitationId = metricRef
            ? `${metricRef.definitionKey}@${metricRef.definitionVersion}`
            : 'metric.new_customer_count';
          const factCitationId = 'customer_acquisition_conversion_summary';
          return {
            status: 'completed',
            answer: `${range.label}新增客户 ${summary.newCustomerCount} 人。`,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: metricCitationId,
                label: '业务定义：周期新增客户数',
              },
              {
                sourceType: 'db_skill',
                sourceId: factCitationId,
                label: '当前门店客户建档事实',
              },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '新增客户', value: `${summary.newCustomerCount} 人` }],
                citationIds: [metricCitationId, factCitationId],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: range.label,
              metricKey: 'new_customer_count',
              cohortDefinition: 'Customer.createdAt within requested period',
              completionCriteria: ['new_customer_count_loaded'],
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
            answer:
              distribution.arrivedCustomerCount === 0
                ? `${range.label}没有实际到店客户，无法形成年龄段画像。`
                : `${range.label}实际到店客户 ${distribution.arrivedCustomerCount} 人，已知年龄 ${distribution.knownAgeCount} 人、未知 ${distribution.unknownAgeCount} 人。${leading ? `人数最多的是 ${leading.ageGroup}，${leading.count} 人（${(leading.share * 100).toFixed(1)}%）。` : '当前没有可分组的已知年龄。'}`,
            citations: [
              definitionCitation,
              {
                sourceType: 'db_skill',
                sourceId: 'arrived_customer_age_distribution',
                label: '预约到店与客户年龄聚合事实',
              },
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
                  ? [
                      {
                        kind: 'limitations' as const,
                        items: [`${distribution.unknownAgeCount} 位到店客户缺少有效年龄或生日，未分配到年龄段`],
                      },
                    ]
                  : []),
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: range.label,
              dimensionKey: 'customerAgeGroup',
              arrivalDefinition:
                'Reservation.checkedInAt in range, or arrived status on reservation date when checkedInAt is missing',
              ageDefinition: 'valid Customer.age, otherwise derive from Customer.birthday as of range end',
              privacy: 'aggregate_only',
            },
          };
        }
        if (/vip|高等级|重要客户/i.test(input.question)) {
          const result = await this.customerFacts.getVipCustomerSummary(
            input.context.storeId,
            this.resolveLimit(input.args.limit, 10),
          );
          return this.answer({
            answer: `当前门店共有 ${result.total} 位 VIP/高等级客户，展示累计消费最高的前 ${result.rows.length} 位。`,
            citationId: 'customer_vip_facts',
            citationLabel: '客户会员等级与累计消费事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: 'VIP/高等级客户', value: `${result.total} 人` }],
                citationIds: ['customer_vip_facts'],
              },
              {
                kind: 'table',
                rows: result.rows,
                columns: ['customerName', 'memberLevel', 'totalSpent', 'lastVisitDate'],
                citationIds: ['customer_vip_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'vip_customer_summary',
              total: result.total,
              definition: 'memberLevel not in 无/普通/普通会员/empty',
              mappingOutputs: {
                vipCustomers: result.rows.map((item) => ({
                  entityType: 'customer',
                  entityKey: String(item.customerId),
                  mention: item.customerName,
                  source: 'system',
                  confidence: 1,
                })),
              },
            },
          });
        }
        if (/好久没来|不活跃|沉睡|流失|消费频率.*下降|续购|疗程快结束|\d+天没来|三个月没来/.test(input.question)) {
          const thresholdDays = input.question.includes('三个月')
            ? 90
            : Number(input.question.match(/(\d+)天没来/)?.[1] ?? 60);
          const result = await this.customerFacts.getInactiveCustomerSummary(
            input.context.storeId,
            thresholdDays,
            this.resolveLimit(input.args.limit, 10),
          );
          return this.answer({
            answer: `${result.thresholdDays} 天未到店客户共 ${result.total} 人，展示累计消费最高的前 ${result.rows.length} 位。`,
            citationId: 'customer_inactive_facts',
            citationLabel: '客户最近到店与累计消费事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: `${result.thresholdDays} 天未到店客户`, value: `${result.total} 人` }],
                citationIds: ['customer_inactive_facts'],
              },
              {
                kind: 'table',
                rows: result.rows,
                columns: ['customerName', 'totalSpent', 'visitCount', 'lastVisitDate'],
                citationIds: ['customer_inactive_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'inactive_customer_summary',
              total: result.total,
              thresholdDays: result.thresholdDays,
              definition: 'lastVisitDate is null or earlier than threshold date',
              mappingOutputs: {
                inactiveCustomers: result.rows.map((item) => ({
                  entityType: 'customer',
                  entityKey: String(item.customerId),
                  mention: item.customerName,
                  source: 'system',
                  confidence: 1,
                })),
              },
            },
          });
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
                sourceId: metricRef
                  ? `${metricRef.definitionKey}@${metricRef.definitionVersion}`
                  : 'metric.repurchase_rate',
                label: '业务定义：客户复购率',
              },
              { sourceType: 'db_skill', sourceId: 'customer_retention_summary', label: '客户有效消费与复购统计' },
            ],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '客户复购率', value: `${(summary.repurchaseRate * 100).toFixed(1)}%` },
                  { label: '有效消费客户', value: `${summary.activeCustomerCount} 人` },
                  { label: '复购客户', value: `${summary.repeatCustomerCount} 人` },
                ],
                citationIds: ['customer_retention_summary'],
              },
            ],
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
          const answer =
            value === null
              ? `${summary.rangeLabel}没有足够的重复消费样本，无法计算客户平均回访间隔。`
              : `${summary.rangeLabel}老客户相邻两次有效消费的平均间隔为 ${value.toFixed(1)} 天，样本为 ${summary.repeatIntervalCount} 个相邻消费间隔。`;
          return {
            status: 'completed',
            answer,
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: metricRef
                  ? `${metricRef.definitionKey}@${metricRef.definitionVersion}`
                  : 'metric.average_return_interval_days',
                label: '业务定义：客户平均回访间隔',
              },
              { sourceType: 'db_skill', sourceId: 'customer_retention_summary', label: '客户有效消费间隔统计' },
            ],
            grounding: 'db_skill',
            blocks:
              value === null
                ? [{ kind: 'limitations', items: ['当前时间范围没有至少两次有效消费的客户样本。'] }]
                : [
                    {
                      kind: 'kpi',
                      items: [
                        {
                          label: '平均回访间隔',
                          value: `${value.toFixed(1)} 天`,
                          hint: `${summary.repeatIntervalCount} 个相邻消费间隔`,
                        },
                      ],
                      citationIds: ['customer_retention_summary'],
                    },
                  ],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: summary.rangeLabel,
              metricKey: 'average_return_interval_days',
              sampleCount: summary.repeatIntervalCount,
            },
          };
        }
        if (this.isExpiringCardNoReservationQuestion(input.question)) {
          const result = await this.customerFacts.getExpiringCardCustomersWithoutUpcomingReservation({
            storeId: input.context.storeId,
            message: input.question,
            asOf: new Date(),
            windowDays: 30,
            limit: this.resolveLimit(input.args.limit, 10),
          });
          const factCitationId = 'customer_card_expiry_no_upcoming_reservation_facts';
          const cardScope = result.cardNameQuery ? `${result.cardNameQuery} ` : '';
          const noData = result.rows.length === 0;
          return this.answer({
            answer: noData
              ? `未来 ${result.windowDays} 天内没有符合“${cardScope}活跃次卡临期且无未来预约”的客户。`
              : `未来 ${result.windowDays} 天内有 ${result.total} 位客户符合“${cardScope}活跃次卡临期且无未来预约”：${result.rows
                  .map(
                    (row, index) =>
                      `${index + 1}. ${row.customerName}：${row.cardName}，剩余 ${row.remainingTimes}/${row.totalTimes} 次，${row.daysToExpiry} 天后到期`,
                  )
                  .join('；')}。`,
            citationId: factCitationId,
            citationLabel: '客户次卡有效期与未来预约事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '临期未预约客户', value: `${result.total} 人`, hint: `未来 ${result.windowDays} 天` }],
                citationIds: [factCitationId],
              },
              {
                kind: 'table' as const,
                rows: result.rows.map((row) => ({
                  ...row,
                  expiryDate: row.expiryDate.toISOString(),
                })),
                columns: [
                  'customerId',
                  'customerName',
                  'cardName',
                  'remainingTimes',
                  'totalTimes',
                  'daysToExpiry',
                  'expiryDate',
                  'lastVisitDate',
                ],
                citationIds: [factCitationId],
              },
              ...(noData
                ? [
                    {
                      kind: 'limitations' as const,
                      items: [`no_data:未来 ${result.windowDays} 天内没有符合条件的临期未预约次卡客户。`],
                    },
                  ]
                : []),
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'expiring_card_without_upcoming_reservation',
              windowDays: result.windowDays,
              cardNameQuery: result.cardNameQuery,
              definition:
                'active CustomerCard expiring within 30 days, remainingTimes > 0, and no non-cancelled future Reservation for the same customer in current store',
            },
          });
        }
        if (
          /(?:次卡|卡项).*(?:即将过期|快过期|临期).*(?:余量|剩余|次数)|(?:余量|剩余|次数).*(?:多|很多).*(?:次卡|卡项).*(?:过期|临期)/.test(
            input.question,
          )
        ) {
          const result = await this.customerFacts.getExpiringHighBalanceCards({
            storeId: input.context.storeId,
            asOf: new Date(),
            windowDays: 30,
            limit: this.resolveLimit(input.args.limit, 10),
          });
          const noData = result.rows.length === 0;
          return this.answer({
            answer: noData
              ? `未来 ${result.windowDays} 天内没有符合“临期且余量较高”的次卡。统一口径：剩余至少 3 次，或剩余比例不低于 30%。`
              : `未来 ${result.windowDays} 天内有 ${result.total} 张活跃次卡临期且余量较高。统一口径：剩余至少 3 次，或剩余比例不低于 30%。${result.rows.length ? `\n${result.rows.map((row, index) => `${index + 1}. ${row.customerName}：${row.cardName}，剩余 ${row.remainingTimes}/${row.totalTimes} 次（${(row.remainingRate * 100).toFixed(1)}%），${row.daysToExpiry} 天后到期，估算未履约 ${row.unfulfilledValue.toFixed(2)} 元`).join('\n')}` : ''}`,
            citationId: 'customer_card_expiry_balance_facts',
            citationLabel: '客户次卡有效期与剩余次数事实',
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: '临期高余量次卡', value: `${result.total} 张`, hint: `未来 ${result.windowDays} 天` }],
                citationIds: ['customer_card_expiry_balance_facts'],
              },
              ...(noData
                ? [
                    {
                      kind: 'limitations' as const,
                      items: ['no_data:未来 30 天内没有符合“临期且余量较高”的次卡。'],
                    },
                  ]
                : [
                    {
                      kind: 'table' as const,
                      rows: result.rows.map((row) => ({
                        ...row,
                        remainingRate: `${(row.remainingRate * 100).toFixed(1)}%`,
                        expiryDate: row.expiryDate.toISOString(),
                        unfulfilledValue: row.unfulfilledValue.toFixed(2),
                      })),
                      columns: [
                        'customerName',
                        'cardName',
                        'remainingTimes',
                        'totalTimes',
                        'remainingRate',
                        'daysToExpiry',
                        'expiryDate',
                        'unfulfilledValue',
                      ],
                      citationIds: ['customer_card_expiry_balance_facts'],
                    },
                  ]),
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'expiring_high_balance_cards',
              windowDays: result.windowDays,
              definition:
                'active card expiring within 30 days and remainingTimes >= 3 OR remainingTimes / totalTimes >= 0.3',
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
            blocks: [
              {
                kind: 'table',
                rows: result.rows,
                columns: [
                  'customerName',
                  'cardName',
                  'usedTimes',
                  'totalTimes',
                  'remainingTimes',
                  'usageRate',
                  'totalSpent',
                ],
                citationIds: ['customer_card_usage_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              total: result.total,
              definition: 'usedTimes <= 1 OR usedTimes / totalTimes <= 0.2',
            },
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
              {
                kind: 'kpi',
                items: [{ label: '开卡未核销', value: `${result.total} 人次卡` }],
                citationIds: ['customer_card_usage_facts'],
              },
              {
                kind: 'table',
                rows: result.rows,
                columns: ['customerName', 'cardName', 'remainingTimes', 'totalTimes', 'totalSpent'],
                citationIds: ['customer_card_usage_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              total: result.total,
              definition: 'active CustomerCard with zero CardUsageRecord',
            },
          });
        }
        if (/(?:新客.*(?:渠道|来源)|(?:渠道|来源).*新客)/.test(input.question)) {
          const distribution = await this.customerFacts.getNewCustomerSourceDistribution({
            storeId: input.context.storeId,
            startDate: range.startDate,
            endDate: range.endDate,
          });
          const limit = this.resolveLimit(input.args.limit, 10);
          const rows = distribution.sourceRanking.slice(0, limit);
          const weeklyRows = distribution.weeklyRanking.slice(0, limit);
          const includeTimeRanking = /(?:时间段|哪(?:一)?周|哪个星期|哪周|周.*新客|新客.*周)/.test(input.question);
          const sourceSummary = rows.length
            ? rows.map((item) => `${item.source} ${item.count} 人（${(item.share * 100).toFixed(1)}%）`).join('、')
            : '暂无新客来源数据';
          const timeSummary = weeklyRows.length
            ? weeklyRows.map((item) => `${item.week} ${item.count} 人`).join('、')
            : '暂无新客时间段数据';
          return this.answer({
            answer: `${range.label}新客共 ${distribution.total} 人。${includeTimeRanking ? `时间段排行：${timeSummary}。` : ''}渠道分布：${sourceSummary}。${distribution.missingSourceCount > 0 ? `其中 ${distribution.missingSourceCount} 人未记录渠道。` : ''}`,
            citationId: 'capability_customer_source_distribution',
            citationLabel: '客户档案新客时间与来源分布',
            blocks: [
              {
                kind: 'kpi',
                items: [
                  { label: '新客总数', value: `${distribution.total} 人` },
                  { label: '未记录渠道', value: `${distribution.missingSourceCount} 人` },
                ],
                citationIds: ['capability_customer_source_distribution'],
              },
              ...(includeTimeRanking
                ? [
                    {
                      kind: 'ranking' as const,
                      rows: weeklyRows.map((item) => ({
                        timePeriod: item.week,
                        newCustomerCount: item.count,
                      })),
                      columns: ['timePeriod', 'newCustomerCount'],
                      citationIds: ['capability_customer_source_distribution'],
                    },
                  ]
                : []),
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
              ...(includeTimeRanking
                ? {
                    timeBucket: 'calendar_week',
                    topTimePeriod: weeklyRows[0]?.week ?? null,
                  }
                : {}),
            },
          });
        }
        const customerMention = structuredEntityMentions(input.args as BrainCapabilityToolArgs)
          .filter((entity) => entity.entityType === 'customer')
          .map((entity) => specificCustomerMention(entity, input.question))
          .find((mention): mention is string => Boolean(mention));
        if (/(?:上次|最近).*(?:来|到店)|(?:客户)?.{0,10}(?:资料|信息|基本信息)|多久没来/.test(input.question)) {
          const result = await this.customerFacts.getExactCustomerBasicSummary({
            storeId: input.context.storeId,
            message: input.question,
            customerName: customerMention,
          });
          if (result.status === 'missing_identity') {
            const question = '请提供客户姓名或手机号后四位后继续。';
            return {
              status: 'completed',
              answer: question,
              citations: [],
              grounding: 'none',
              blocks: [{ kind: 'clarification', question, options: [] }],
              metadata: {
                capabilityKey: 'customer_facts',
                unsupportedReason: 'customer_identity_requires_clarification',
                clarification: { questions: [question], missingSlots: ['entity'], ambiguities: [] },
                completion: { status: 'partial', missingCriteria: ['entity'], recoverable: true },
              },
            };
          }
          if (result.status === 'ambiguous') {
            const question = '找到多位匹配客户，请补充手机号后四位后继续。';
            return this.answer({
              answer: `${question}\n${result.rows
                .map(
                  (customer, index) =>
                    `${index + 1}. ${customer.customerName}，手机 ${customer.maskedPhone}，${customer.memberLevel}`,
                )
                .join('\n')}`,
              citationId: 'customer_identity_candidates',
              citationLabel: '客户身份匹配事实',
              blocks: [
                {
                  kind: 'clarification',
                  question,
                  options: customerIdentityClarificationOptions(result.rows),
                },
                {
                  kind: 'table',
                  rows: result.rows,
                  columns: ['customerName', 'maskedPhone', 'memberLevel'],
                  citationIds: ['customer_identity_candidates'],
                },
              ],
              metadata: {
                capabilityKey: 'customer_facts',
                matchStatus: 'ambiguous',
                unsupportedReason: 'customer_identity_requires_clarification',
                clarification: {
                  questions: [question],
                  missingSlots: ['entity'],
                  ambiguities: result.rows.map((customer) => ({
                    customerName: customer.customerName,
                    maskedPhone: customer.maskedPhone,
                    memberLevel: customer.memberLevel,
                  })),
                },
                completion: { status: 'partial', missingCriteria: ['entity'], recoverable: true },
              },
            });
          }
          const customer = result.rows[0];
          const asksLastProject =
            /(?:上次|最近).*(?:项目|做了什么|做的什么)|(?:项目|做了什么|做的什么).*(?:上次|最近)/.test(input.question);
          return this.answer({
            answer: customer
              ? asksLastProject
                ? `${customer.customerName}最近一次完成服务项目为 ${customer.lastProjectName ?? '未记录'}，美容师 ${customer.lastBeauticianName ?? '未记录'}，服务日期 ${customer.lastServiceDate ?? customer.lastVisitDate ?? '未记录'}。`
                : `${customer.customerName}最近到店日期为 ${customer.lastVisitDate ?? '未记录'}，累计到店 ${customer.visitCount} 次。`
              : '当前门店没有找到匹配客户，请核对姓名或手机号后四位。',
            citationId: 'customer_exact_basic_facts',
            citationLabel: '客户档案与最近到店事实',
            blocks: [
              {
                kind: 'table',
                rows: result.rows,
                columns: [
                  'customerName',
                  'maskedPhone',
                  'memberLevel',
                  'totalSpent',
                  'visitCount',
                  'lastVisitDate',
                  'lastProjectName',
                  'lastBeauticianName',
                  'lastServiceDate',
                ],
                citationIds: ['customer_exact_basic_facts'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              answerScope: 'exact_customer_basic_summary',
              matchStatus: result.status,
            },
          });
        }
        const answer = await this.customerFacts.answerCustomerQuestion({
          storeId: input.context.storeId,
          message: input.question,
          specificCustomerMention: customerMention,
          permissions: input.context.permissions,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        if (isCustomerIdentityMatchClarification(answer)) {
          const question = '找到多位匹配客户，请补充手机号后四位后继续。';
          return this.answer({
            answer: answer.answer,
            citationId: 'customer_identity_candidates',
            citationLabel: '客户身份匹配事实',
            blocks: [
              {
                kind: 'clarification',
                question,
                options: customerIdentityClarificationOptions(answer.candidates),
              },
              {
                kind: 'table',
                rows: answer.candidates,
                columns: ['customerName', 'maskedPhone', 'memberLevel'],
                citationIds: ['customer_identity_candidates'],
              },
            ],
            metadata: {
              capabilityKey: 'customer_facts',
              rangeLabel: range.label,
              matchStatus: 'ambiguous',
              unsupportedReason: 'customer_identity_requires_clarification',
              clarification: {
                questions: [question],
                missingSlots: ['entity'],
                ambiguities: answer.candidates,
              },
              completion: { status: 'partial', missingCriteria: ['entity'], recoverable: true },
            },
          });
        }
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
          citationId: isSpecificCustomerProjectRecommendationQuestion(input.question)
            ? 'customer_exact_project_recommendation_facts'
            : 'capability_customer_facts',
          citationLabel: isSpecificCustomerProjectRecommendationQuestion(input.question)
            ? '客户历史服务与消费事实'
            : '客户精确事实查询',
          metadata: {
            rangeLabel: range.label,
            answerScope: isSpecificCustomerProjectRecommendationQuestion(input.question)
              ? 'exact_customer_project_recommendation'
              : 'exact_customer_facts',
          },
        });
      }
      case 'marketing_customer_segment': {
        if (/(?:投诉|客诉|满意度|不[^，。；]{0,6}满意|负面反馈)/.test(input.question)) {
          const limitation =
            '客户反馈管理端、后端和事实表已上线，但当前门店尚未采集可回答该问题的投诉、满意度与处置记录。Ami Brain 不会用客户分层、会员卡余额、消费金额或营销响应替代投诉与满意度事实。';
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
        if (this.isCustomerPredictionQuestion(input.question)) {
          return this.buildCustomerPredictionAnswer(input);
        }
        const structuredSegment =
          typeof this.customerFacts.getStructuredMarketingSegment === 'function'
            ? await this.customerFacts.getStructuredMarketingSegment({
                storeId: input.context.storeId,
                message: input.question,
              })
            : undefined;
        if (structuredSegment) {
          return this.answer({
            answer: structuredSegment.answer,
            citationId: 'capability_marketing_customer_segment',
            citationLabel: '营销客户分群事实',
            blocks: [
              {
                kind: 'table',
                rows: structuredSegment.rows,
                columns: structuredSegment.columns,
                citationIds: ['capability_marketing_customer_segment'],
              },
              ...(structuredSegment.limitation
                ? [{ kind: 'limitations' as const, items: [structuredSegment.limitation] }]
                : []),
            ],
            metadata: { rangeLabel: range.label, segmentDetail: true, structuredResult: true },
          });
        }
        if (
          /(?:消费金额.*(?:分层|分一下层|分组)|优惠.*敏感|等打折|打折才来|基础项目.*(?:升单|升级)|疗程.*(?:快结束|临近结束|续购)|续购.*(?:疗程|次卡|客户)|新客.*潜力.*长期|项目.*感兴趣.*(?:还没办卡|未办卡|没有办卡))/.test(
            input.question,
          )
        ) {
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
            blocks: [
              {
                kind: 'kpi',
                items: [
                  {
                    label: '储值消耗',
                    value: `${consumedTotal.toFixed(2)} 元`,
                    hint: `本金 ${flow.consumedAmount.toFixed(2)} + 赠送 ${flow.consumedGiftAmount.toFixed(2)}，${flow.consumedCount} 笔`,
                  },
                  {
                    label: '新充值入账',
                    value: `${rechargeTotal.toFixed(2)} 元`,
                    hint: `实充 ${flow.rechargeAmount.toFixed(2)} + 赠送 ${flow.rechargeGiftAmount.toFixed(2)}，${flow.rechargeCount} 笔`,
                  },
                ],
                citationIds: ['capability_member_balance_flow_summary'],
              },
            ],
            metadata: {
              rangeLabel: range.label,
              ...this.executionTimeRange(range, input.context.timezone),
              balanceFlowDefinition: {
                rechargeTypes: ['recharge', 'open'],
                consumeTypes: ['deduct', 'consume'],
                totalIncludesGiftAmount: true,
              },
            },
          });
        }
        if (isScalarOrderCountQuestion(input.question)) {
          if (!this.prisma) throw new Error('order_count_query_prisma_unavailable');
          const orderCount = await this.prisma.productOrder.count({
            where: {
              storeId: input.context.storeId,
              createdAt: { gte: range.startDate, lte: range.endDate },
              status: { in: ['completed', 'paid'] },
            },
          });
          return this.answer({
            answer: `${range.label}有效订单共 ${orderCount} 笔（按订单创建时间计数，仅统计已完成或已支付订单）。`,
            citationId: 'product_order_count',
            citationLabel: '当前门店有效订单计数',
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: 'metric.order_count',
                label: '业务定义：有效订单数',
              },
            ],
            blocks: [
              {
                kind: 'kpi',
                items: [{ label: `${range.label}有效订单`, value: `${orderCount} 笔` }],
                citationIds: ['product_order_count', 'metric.order_count'],
              },
            ],
            metadata: {
              rangeLabel: range.label,
              ...this.executionTimeRange(range, input.context.timezone),
              answerScope: 'valid_product_order_count',
              orderCount,
              includedStatuses: ['completed', 'paid'],
              actionWriteCount: 0,
            },
          });
        }
        const orderCountTrend =
          input.answerShape === 'trend' &&
          /(?:订单量|订单数|订单数量).*(?:趋势|走势)|(?:趋势|走势).*(?:订单量|订单数|订单数量)/.test(
            input.question,
          );
        if (orderCountTrend) {
          if (!this.prisma) throw new Error('order_count_trend_query_prisma_unavailable');
          const orders = await this.prisma.productOrder.findMany({
            where: {
              storeId: input.context.storeId,
              createdAt: { gte: range.startDate, lte: range.endDate },
              status: { in: ['completed', 'paid'] },
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
          });
          const countByDate = new Map<string, number>();
          for (const order of orders) {
            const date = this.formatDateOnly(order.createdAt, input.context.timezone);
            countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
          }
          const startDateKey = this.formatDateOnly(range.startDate, input.context.timezone);
          const endDateKey = this.formatDateOnly(range.endDate, input.context.timezone);
          const rows = Array.from(
            { length: Math.max(1, this.dateKeyDifference(startDateKey, endDateKey) + 1) },
            (_, index) => {
              const date = this.addDateKeyDays(startDateKey, index);
              return { date, orderCount: countByDate.get(date) ?? 0 };
            },
          );
          return this.answer({
            answer: `${range.label}订单量趋势已生成，共 ${rows.length} 个按日有效订单数据点（仅统计已完成或已支付订单）。`,
            citationId: 'product_order_daily_count',
            citationLabel: '当前门店有效订单按日计数',
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: 'metric.order_count',
                label: '业务定义：有效订单数',
              },
            ],
            blocks: [
              {
                kind: 'chart',
                chartType: 'line',
                rows,
                xKey: 'date',
                yKeys: ['orderCount'],
                citationIds: ['product_order_daily_count', 'metric.order_count'],
              },
            ],
            metadata: {
              rangeLabel: range.label,
              ...this.executionTimeRange(range, input.context.timezone),
              trendMetric: 'order_count',
              trendDataSource: 'ProductOrder',
              includedStatuses: ['completed', 'paid'],
              actionWriteCount: 0,
            },
          });
        }
        const requestedMethods = this.requestedPaymentMethods(input.question);
        const requestedDimensions = structuredDefinitionKeys(input.args.dimensions);
        const comparisonRequested = input.answerShape === 'comparison';
        const comparisonRange = comparisonRequested ? this.resolveComparisonRange(input, range) : undefined;
        const groupedPaymentBreakdown =
          comparisonRequested &&
          !comparisonRange &&
          (requestedMethods.length > 1 || requestedDimensions.has('dimension.paymentMethod'));
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
        const rowsByMethod = new Map<string, { method: string; amount: number; count: number }>();
        for (const item of analysis.paymentBreakdown) {
          const method = this.normalizePaymentMethodKey(item.method);
          const current = rowsByMethod.get(method) ?? { method, amount: 0, count: 0 };
          current.amount = this.roundMoney(current.amount + item.amount);
          current.count += item.count;
          rowsByMethod.set(method, current);
        }
        for (const method of requestedMethods) {
          if (!rowsByMethod.has(method)) rowsByMethod.set(method, { method, amount: 0, count: 0 });
        }
        const normalizedPaymentRows = [...rowsByMethod.values()].sort(
          (left, right) =>
            right.amount - left.amount || right.count - left.count || left.method.localeCompare(right.method),
        );
        const paymentRows = [
          ...requestedMethods.flatMap((method) => (rowsByMethod.has(method) ? [rowsByMethod.get(method)!] : [])),
          ...normalizedPaymentRows.filter((item) => !requestedMethods.includes(item.method)),
        ];
        const breakdown = paymentRows
          .map((item) => `${this.paymentMethodLabel(item.method)}：${item.amount.toFixed(2)} 元，共 ${item.count} 笔`)
          .join('；');
        const requestedOnly = requestedMethods.flatMap((method) =>
          rowsByMethod.has(method) ? [rowsByMethod.get(method)!] : [],
        );
        const asksCount = /几笔|笔数|多少笔/.test(input.question);
        if (requestedOnly.length > 0 && (input.answerShape === 'scalar' || asksCount)) {
          const answer = requestedOnly
            .map((item) =>
              asksCount && !/(金额|多少元|收了多少|消费多少)/.test(input.question)
                ? `${this.paymentMethodLabel(item.method)} ${item.count} 笔`
                : `${this.paymentMethodLabel(item.method)} ${item.amount.toFixed(2)} 元，共 ${item.count} 笔`,
            )
            .join('；');
          return this.answer({
            answer: `${range.label}${answer}。`,
            citationId: 'capability_finance_payment_breakdown',
            citationLabel: '财务支付方式拆分',
            citations: [
              {
                sourceType: 'business_definition',
                sourceId: 'metric.paid_amount',
                label: '业务定义：实收金额',
              },
            ],
            blocks: [
              {
                kind: 'kpi',
                items: requestedOnly.map((item) => ({
                  label: this.paymentMethodLabel(item.method),
                  value: `${item.amount.toFixed(2)} 元`,
                  hint: `${item.count} 笔`,
                })),
                citationIds: ['capability_finance_payment_breakdown', 'metric.paid_amount'],
              },
            ],
            metadata: {
              rangeLabel: range.label,
              ...this.executionTimeRange(range, input.context.timezone),
              requestedPaymentMethods: requestedMethods,
            },
          });
        }
        const scalarAnswer = input.answerShape === 'scalar';
        const trendAnswer = input.answerShape === 'trend';
        const paidMetric = structuredDefinitionRef(input.args.metrics, 'metric.paid_amount');
        const comparisonDelta = previousAnalysis ? analysis.totalCollected - previousAnalysis.totalCollected : 0;
        const comparisonRate =
          previousAnalysis && previousAnalysis.totalCollected !== 0
            ? comparisonDelta / previousAnalysis.totalCollected
            : undefined;
        const comparisonDirection = comparisonDelta > 0 ? '增加' : comparisonDelta < 0 ? '减少' : '持平';
        const comparisonDeltaText = `${this.signed(comparisonDelta, 2)} 元${
          comparisonRate === undefined
            ? '（上期为 0，无法计算增减比例）'
            : `（${this.signed(comparisonRate * 100, 1)}%）`
        }`;
        const currentPeriodDays = comparisonRange
          ? Math.max(
              1,
              Math.floor(
                (comparisonRange.current.endDate.getTime() - comparisonRange.current.startDate.getTime()) / 86_400_000,
              ) + 1,
            )
          : 0;
        const previousPeriodDays = comparisonRange
          ? Math.max(
              1,
              Math.floor(
                (comparisonRange.previous.endDate.getTime() - comparisonRange.previous.startDate.getTime()) /
                  86_400_000,
              ) + 1,
            )
          : 0;
        const unequalComparisonPeriods = Boolean(
          comparisonAnswer &&
          comparisonRange &&
          currentPeriodDays !== previousPeriodDays &&
          [...input.question.matchAll(/(?:最近|过去|近)\s*[一二三四五六七八九十\d]{1,3}\s*(?:个月|天|年)/gu)].length >=
            2,
        );
        const currentDailyAverage = currentPeriodDays ? analysis.totalCollected / currentPeriodDays : 0;
        const previousDailyAverage =
          previousAnalysis && previousPeriodDays ? previousAnalysis.totalCollected / previousPeriodDays : 0;
        const dailyAverageDelta = currentDailyAverage - previousDailyAverage;
        const dailyAverageRate = previousDailyAverage !== 0 ? dailyAverageDelta / previousDailyAverage : undefined;
        const dailyAverageDirection = dailyAverageDelta > 0 ? '高' : dailyAverageDelta < 0 ? '低' : '持平';
        return this.answer({
          answer:
            comparisonAnswer && comparisonRange && previousAnalysis
              ? unequalComparisonPeriods
                ? `${comparisonRange.current.label}实收 ${analysis.totalCollected.toFixed(2)} 元（${currentPeriodDays} 天，日均 ${currentDailyAverage.toFixed(2)} 元）；${comparisonRange.previous.label}实收 ${previousAnalysis.totalCollected.toFixed(2)} 元（${previousPeriodDays} 天，日均 ${previousDailyAverage.toFixed(2)} 元）。按可比的日均口径，${comparisonRange.current.label}比${comparisonRange.previous.label}${dailyAverageDirection} ${Math.abs(dailyAverageDelta).toFixed(2)} 元${dailyAverageRate === undefined ? '；对比期日均为 0，无法计算比例。' : `，变化 ${this.signed(dailyAverageRate * 100, 1)}%。`}两个周期天数不同，实收总额只展示，不直接用于判断经营强弱。`
                : `${comparisonRange.current.label}实收 ${analysis.totalCollected.toFixed(2)} 元，${comparisonRange.previous.label}实收 ${previousAnalysis.totalCollected.toFixed(2)} 元，${comparisonDirection} ${Math.abs(comparisonDelta).toFixed(2)} 元${comparisonRate === undefined ? '；上期为 0，无法计算增减比例。' : `，增减幅度 ${this.signed(comparisonRate * 100, 1)}%。`}`
              : trendAnswer
                ? `${range.label}实收趋势已生成，共 ${analysis.dailyTrend.length} 个按日数据点。`
                : scalarAnswer
                  ? `${range.label}实收合计 ${analysis.totalCollected.toFixed(2)} 元。`
                  : `${range.label}实收合计 ${analysis.totalCollected.toFixed(2)} 元。${breakdown ? `各支付方式金额：${breakdown}。` : '当前没有支付方式明细。'}`,
          citationId: 'capability_finance_payment_breakdown',
          citationLabel: '财务支付方式拆分',
          citations: [
            {
              sourceType: 'business_definition',
              sourceId: paidMetric ? `${paidMetric.definitionKey}@${paidMetric.definitionVersion}` : 'metric.paid_amount',
              label: '业务定义：实收金额',
            },
          ],
          blocks:
            comparisonAnswer && comparisonRange && previousAnalysis
              ? [
                  {
                    kind: 'comparison',
                    items: [
                      {
                        label: unequalComparisonPeriods ? '实收总额' : '实收金额',
                        current: `${comparisonRange.current.label} ${analysis.totalCollected.toFixed(2)} 元`,
                        previous: `${comparisonRange.previous.label} ${previousAnalysis.totalCollected.toFixed(2)} 元`,
                        delta: comparisonDeltaText,
                      },
                      ...(unequalComparisonPeriods
                        ? [
                            {
                              label: '日均实收',
                              current: `${comparisonRange.current.label} ${currentDailyAverage.toFixed(2)} 元/天`,
                              previous: `${comparisonRange.previous.label} ${previousDailyAverage.toFixed(2)} 元/天`,
                              delta: `${this.signed(dailyAverageDelta, 2)} 元/天${
                                dailyAverageRate === undefined
                                  ? '（对比期为 0，无法计算比例）'
                                  : `（${this.signed(dailyAverageRate * 100, 1)}%）`
                              }`,
                            },
                          ]
                        : []),
                    ],
                    citationIds: ['capability_finance_payment_breakdown'],
                  },
                ]
              : trendAnswer
                ? [
                    {
                      kind: 'chart',
                      chartType: 'line',
                      rows: analysis.dailyTrend,
                      xKey: 'date',
                      yKeys: ['revenue'],
                      citationIds: ['capability_finance_payment_breakdown'],
                    },
                    ...(!analysis.dailyTrend.length
                      ? [
                          {
                            kind: 'limitations' as const,
                            items: [`no_data: ${range.label}没有按日实收数据`],
                          },
                        ]
                      : []),
                  ]
                : scalarAnswer
                  ? [
                      {
                        kind: 'kpi',
                        items: [{ label: `${range.label}实收合计`, value: `${analysis.totalCollected.toFixed(2)} 元` }],
                        citationIds: ['capability_finance_payment_breakdown'],
                      },
                    ]
                  : [
                      {
                        kind: 'text',
                        text: analysis.paymentBreakdown.length
                          ? `${range.label}按统一实收金额口径汇总，实收合计 ${analysis.totalCollected.toFixed(2)} 元；同义支付方式已合并为 ${normalizedPaymentRows.length} 类。`
                          : `${range.label}按统一实收金额口径汇总，当前没有实际支付流水。`,
                        citationIds: ['capability_finance_payment_breakdown', 'metric.paid_amount'],
                      },
                      {
                        kind: 'table',
                        rows: paymentRows.map((item) => ({
                          paymentMethod: this.paymentMethodLabel(item.method),
                          amount: item.amount,
                          count: item.count,
                        })),
                        columns: ['paymentMethod', 'amount', 'count'],
                        citationIds: ['capability_finance_payment_breakdown'],
                      },
                    ],
          metadata: {
            rangeLabel: range.label,
            ...this.executionTimeRange(range, input.context.timezone),
            comparisonRangeLabel: comparisonRange?.label ?? null,
            answerShape: input.answerShape ?? null,
            totalCollected: analysis.totalCollected,
            previousTotalCollected: previousAnalysis?.totalCollected ?? null,
            comparisonDelta: previousAnalysis ? comparisonDelta : null,
            comparisonRate: comparisonRate ?? null,
            comparisonPeriodDays: comparisonRange ? { current: currentPeriodDays, previous: previousPeriodDays } : null,
            comparisonDailyAverage: previousAnalysis
              ? { current: currentDailyAverage, previous: previousDailyAverage, delta: dailyAverageDelta }
              : null,
            paymentMethodCount: paymentRows.length,
            rawPaymentMethodCount: analysis.paymentBreakdown.length,
            normalizedPaymentMethodCount: normalizedPaymentRows.length,
            mergedPaymentMethodAliasCount: Math.max(0, analysis.paymentBreakdown.length - normalizedPaymentRows.length),
            requestedPaymentMethods: requestedMethods,
            trendMetric: trendAnswer ? 'paid_amount' : null,
          },
        });
      }
      case 'inventory_procurement_advice': {
        const productReference = structuredEntityMentions(input.args as BrainCapabilityToolArgs).find(
          (entity) => entity.entityType === 'product' && entity.source === 'conversation',
        );
        const analysis = await this.skillRuntime.buildInventoryProcurementAnalysis({
          storeId: input.context.storeId,
          ...(productReference ? { keyword: productReference.mention } : {}),
        });
        const scopedSuggestions = productReference
          ? analysis.suggestions.filter(
              (item) =>
                String(item.productId) === productReference.entityKey || item.productName === productReference.mention,
            )
          : analysis.suggestions;
        const procurementCitationId = 'capability_inventory_procurement_advice';
        const procurementStatusLabel = (status: string) =>
          (
            ({
              pending_supplier_confirm: '待供应商确认',
              accepted: '供应商已确认',
              shipped: '已发货待收货',
              partial_received: '部分收货',
              received: '已收货',
              settled: '已结算',
            }) as Record<string, string>
          )[status] ?? status;
        const orderRows = analysis.recentOrders.map((order) => ({
          createdAt: order.createdAt,
          orderNo: order.orderNo,
          supplierName: order.supplierName,
          amount: Number(order.amount.toFixed(2)),
          netAmount: Number(order.netAmount.toFixed(2)),
          status: procurementStatusLabel(order.status),
          expectedArrivalDate: order.expectedArrivalDate ?? null,
          receivedAt: order.receivedAt ?? null,
          settledAt: order.settledAt ?? null,
        }));
        const procurementOrderInRange = (
          order: { createdAt: string; receivedAt?: string | null },
          dateKey: 'createdAt' | 'receivedAt' = 'createdAt',
        ) => {
          const dateValue = order[dateKey] || order.createdAt;
          const occurredAt = new Date(`${dateValue}T00:00:00.000+08:00`).getTime();
          return occurredAt >= range.startDate.getTime() && occurredAt <= range.endDate.getTime();
        };
        if (/(?:供应商).*(?:多少|几个|数量)|(?:多少|几个|几家).*(?:供应商)/.test(input.question)) {
          const rows = analysis.suppliers.map((supplier) => ({
            supplierId: supplier.supplierId ?? null,
            supplierName: supplier.supplierName,
            status: supplier.status ?? '未记录',
            qualificationStatus: supplier.qualificationStatus,
            quoteCount: supplier.quoteCount,
            leadDays: supplier.leadDays ?? null,
          }));
          return this.applyDataQualityGuard(
            this.answer({
              answer: rows.length
                ? `当前供应商主档共 ${rows.length} 家，其中可用于采购分析的报价供应商 ${rows.filter((row) => row.quoteCount > 0).length} 家。`
                : '当前没有供应商主档记录。',
              citationId: procurementCitationId,
              citationLabel: '供应商主档、报价与采购分析',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '供应商主档', value: `${rows.length} 家` },
                    { label: '有报价供应商', value: `${rows.filter((row) => row.quoteCount > 0).length} 家` },
                  ],
                  citationIds: [procurementCitationId],
                },
                {
                  kind: 'table',
                  rows,
                  columns: ['supplierId', 'supplierName', 'status', 'qualificationStatus', 'quoteCount', 'leadDays'],
                  citationIds: [procurementCitationId],
                },
                ...(rows.length ? [] : [{ kind: 'limitations' as const, items: ['no_data:supplier_master_empty'] }]),
              ],
              metadata: {
                capabilityKey: 'inventory_procurement_advice',
                rangeLabel: range.label,
                answerScope: 'supplier_count',
                supplierCount: rows.length,
                quotedSupplierCount: rows.filter((row) => row.quoteCount > 0).length,
                completionCriteria: ['supplier_master_loaded', 'supplier_quote_mapping_loaded'],
              },
            }),
            dataQuality,
          );
        }
        if (/待收货|未收货|待到货/.test(input.question)) {
          const receivableRows = orderRows.filter((order) =>
            ['已发货待收货', '部分收货', '供应商已确认'].includes(String(order.status)),
          );
          const pendingConfirmationCount = orderRows.filter((order) => order.status === '待供应商确认').length;
          return this.applyDataQualityGuard(
            this.answer({
              answer: receivableRows.length
                ? `当前有 ${receivableRows.length} 张待收货采购单。`
                : `当前没有待收货采购单${pendingConfirmationCount ? `；另有 ${pendingConfirmationCount} 张待供应商确认，尚未进入待收货` : ''}。`,
              citationId: procurementCitationId,
              citationLabel: '采购单状态与收货进度',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '待收货采购单', value: `${receivableRows.length} 张` },
                    ...(pendingConfirmationCount
                      ? [{ label: '待供应商确认', value: `${pendingConfirmationCount} 张` }]
                      : []),
                  ],
                  citationIds: [procurementCitationId],
                },
                {
                  kind: 'table',
                  rows: receivableRows,
                  columns: ['createdAt', 'orderNo', 'supplierName', 'amount', 'status', 'expectedArrivalDate'],
                  citationIds: [procurementCitationId],
                },
                ...(receivableRows.length
                  ? []
                  : [{ kind: 'limitations' as const, items: ['no_data:procurement_receiving_orders_empty'] }]),
              ],
              metadata: {
                capabilityKey: 'inventory_procurement_advice',
                rangeLabel: range.label,
                answerScope: 'pending_receipt_procurement_orders',
                orderCount: receivableRows.length,
                pendingSupplierConfirmationCount: pendingConfirmationCount,
                completionCriteria: ['procurement_order_status_loaded'],
              },
            }),
            dataQuality,
          );
        }
        if (/待付款|待结算|结算待付款/.test(input.question)) {
          const timeScoped =
            /今天|昨日|昨天|本周|这周|上周|本月|这个月|上月|最近\d+天|最近[一二三四五六七八九十]+天|截至|\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(
              input.question,
            );
          const unpaidRows = orderRows.filter(
            (order) =>
              ['已收货', '部分收货'].includes(String(order.status)) &&
              !order.settledAt &&
              (!timeScoped || procurementOrderInRange(order, 'receivedAt')),
          );
          const totalAmount = unpaidRows.reduce((sum, order) => sum + Number(order.netAmount || order.amount || 0), 0);
          return this.applyDataQualityGuard(
            this.answer({
              answer: unpaidRows.length
                ? `${timeScoped ? range.label : '当前'}采购结算待付款 ${totalAmount.toFixed(2)} 元，涉及 ${unpaidRows.length} 张采购单。`
                : `${timeScoped ? range.label : '当前'}没有采购结算待付款采购单。`,
              citationId: procurementCitationId,
              citationLabel: '采购单收货与结算状态',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    { label: '采购待付款', value: `${totalAmount.toFixed(2)} 元`, hint: `${unpaidRows.length} 张` },
                  ],
                  citationIds: [procurementCitationId],
                },
                {
                  kind: 'table',
                  rows: unpaidRows,
                  columns: ['createdAt', 'orderNo', 'supplierName', 'netAmount', 'status', 'receivedAt'],
                  citationIds: [procurementCitationId],
                },
                ...(unpaidRows.length
                  ? []
                  : [{ kind: 'limitations' as const, items: ['no_data:procurement_unpaid_orders_empty'] }]),
              ],
              metadata: {
                capabilityKey: 'inventory_procurement_advice',
                rangeLabel: range.label,
                answerScope: 'unpaid_procurement_orders',
                orderCount: unpaidRows.length,
                totalAmount,
                completionCriteria: ['procurement_order_settlement_status_loaded'],
              },
            }),
            dataQuality,
          );
        }
        if (
          /(?:采购成本|采购金额|采购额).*(?:品类|类别|分类)|(?:品类|类别|分类).*(?:采购成本|采购金额|采购额|最高)/.test(
            input.question,
          )
        ) {
          const categoryRows = [
            ...(analysis.orderItems ?? [])
              .filter((item) => procurementOrderInRange(item))
              .reduce((map, item) => {
                const current = map.get(item.categoryName) ?? {
                  categoryName: item.categoryName,
                  amount: 0,
                  quantity: 0,
                  itemCount: 0,
                  orderNos: new Set<string>(),
                };
                current.amount += Number(item.amount || 0);
                current.quantity += Number(item.quantity || 0);
                current.itemCount += 1;
                current.orderNos.add(item.orderNo);
                map.set(item.categoryName, current);
                return map;
              }, new Map<string, { categoryName: string; amount: number; quantity: number; itemCount: number; orderNos: Set<string> }>())
              .values(),
          ]
            .map((row) => ({
              categoryName: row.categoryName,
              amount: Number(row.amount.toFixed(2)),
              quantity: row.quantity,
              itemCount: row.itemCount,
              orderCount: row.orderNos.size,
            }))
            .sort((left, right) => right.amount - left.amount || left.categoryName.localeCompare(right.categoryName));
          const top = categoryRows[0];
          return this.applyDataQualityGuard(
            this.answer({
              answer: top
                ? `${range.label}采购成本最高的品类是 ${top.categoryName}，金额 ${top.amount.toFixed(2)} 元。`
                : `${range.label}没有采购品类成本记录。`,
              citationId: procurementCitationId,
              citationLabel: '采购明细、商品品类与采购成本',
              blocks: [
                {
                  kind: 'ranking',
                  rows: categoryRows,
                  columns: ['categoryName', 'amount', 'quantity', 'itemCount', 'orderCount'],
                  citationIds: [procurementCitationId],
                },
                ...(categoryRows.length
                  ? []
                  : [{ kind: 'limitations' as const, items: ['no_data:procurement_category_cost_empty'] }]),
              ],
              metadata: {
                capabilityKey: 'inventory_procurement_advice',
                rangeLabel: range.label,
                answerScope: 'procurement_category_cost_ranking',
                categoryCount: categoryRows.length,
                topCategoryName: top?.categoryName ?? null,
                topCategoryAmount: top?.amount ?? 0,
                completionCriteria: ['procurement_order_items_loaded', 'product_category_loaded'],
              },
            }),
            dataQuality,
          );
        }
        if (
          /采购(?:总额|金额|成本)|采购.*(?:多少钱|多少金额|花了多少)|各供应商.*采购金额|采购金额.*供应商/.test(
            input.question,
          )
        ) {
          const inRangeRows = orderRows.filter((order) => procurementOrderInRange(order));
          const grouped = [
            ...inRangeRows
              .reduce((map, order) => {
                const current = map.get(order.supplierName) ?? {
                  supplierName: order.supplierName,
                  amount: 0,
                  netAmount: 0,
                  orderCount: 0,
                };
                current.amount += Number(order.amount || 0);
                current.netAmount += Number(order.netAmount || 0);
                current.orderCount += 1;
                map.set(order.supplierName, current);
                return map;
              }, new Map<string, { supplierName: string; amount: number; netAmount: number; orderCount: number }>())
              .values(),
          ].map((row) => ({
            supplierName: row.supplierName,
            amount: Number(row.amount.toFixed(2)),
            netAmount: Number(row.netAmount.toFixed(2)),
            orderCount: row.orderCount,
          }));
          const totalAmount = inRangeRows.reduce((sum, order) => sum + Number(order.amount || 0), 0);
          const supplierBreakdown = /供应商/.test(input.question);
          return this.applyDataQualityGuard(
            this.answer({
              answer: inRangeRows.length
                ? supplierBreakdown
                  ? `${range.label}各供应商采购金额合计 ${totalAmount.toFixed(2)} 元，涉及 ${grouped.length} 家供应商。`
                  : `${range.label}采购总额 ${totalAmount.toFixed(2)} 元，涉及 ${inRangeRows.length} 张采购单。`
                : `${range.label}没有采购单金额记录。`,
              citationId: procurementCitationId,
              citationLabel: '采购单、供应商与采购金额',
              blocks: [
                {
                  kind: 'kpi',
                  items: [
                    {
                      label: `${range.label}采购总额`,
                      value: `${totalAmount.toFixed(2)} 元`,
                      hint: `${inRangeRows.length} 张`,
                    },
                  ],
                  citationIds: [procurementCitationId],
                },
                {
                  kind: 'table',
                  rows: supplierBreakdown ? grouped : inRangeRows,
                  columns: supplierBreakdown
                    ? ['supplierName', 'amount', 'netAmount', 'orderCount']
                    : ['createdAt', 'orderNo', 'supplierName', 'amount', 'netAmount', 'status'],
                  citationIds: [procurementCitationId],
                },
                ...(inRangeRows.length
                  ? []
                  : [{ kind: 'limitations' as const, items: ['no_data:procurement_orders_in_range_empty'] }]),
              ],
              metadata: {
                capabilityKey: 'inventory_procurement_advice',
                rangeLabel: range.label,
                answerScope: supplierBreakdown ? 'procurement_amount_by_supplier' : 'procurement_amount',
                orderCount: inRangeRows.length,
                supplierCount: grouped.length,
                totalAmount,
                completionCriteria: ['procurement_orders_loaded', 'procurement_amount_summarized'],
              },
            }),
            dataQuality,
          );
        }
        const suggestions = scopedSuggestions
          .slice(0, this.resolveLimit(input.args.limit, 12))
          .map(
            (item, index) =>
              `${index + 1}. ${item.productName}：当前库存 ${item.currentStock}，安全库存 ${item.safetyStock}，建议采购 ${item.suggestedQty}${
                item.supplierName ? `，候选供应商 ${item.supplierName}` : ''
              }`,
          )
          .join('\n');
        return this.applyDataQualityGuard(
          this.answer({
            answer: `库存采购建议：共 ${scopedSuggestions.length} 项。${suggestions ? `\n${suggestions}` : '\n当前没有需要采购的商品。'}`,
            citationId: 'capability_inventory_procurement_advice',
            citationLabel: '库存采购建议分析',
            metadata: {
              capabilityKey: 'inventory_procurement_advice',
              rangeLabel: range.label,
              suggestionCount: scopedSuggestions.length,
              ...(productReference
                ? {
                    resolvedResultRef: {
                      entityType: productReference.entityType,
                      entityKey: productReference.entityKey,
                      mention: productReference.mention,
                    },
                  }
                : {}),
              recentOrderCount: analysis.recentOrders.length,
              supplierCount: analysis.suppliers.length,
            },
          }),
          dataQuality,
        );
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
          where: { product: { storeId } },
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
    const blockedProjects = configuredProjects
      .flatMap((project) =>
        project.bomItems.flatMap((item) => {
          const requiredQty = Number(item.standardQty);
          const currentStock = Number(item.product.currentStock);
          const unavailable = item.product.deletedAt !== null || item.product.status !== 'active';
          if (!unavailable && currentStock >= requiredQty) return [];
          return [
            {
              projectId: project.id,
              projectName: project.name,
              productId: item.product.id,
              productName: item.product.name,
              requiredQty,
              currentStock,
              shortageQty: Math.max(0, requiredQty - currentStock),
              unit: item.unit,
              productStatus: unavailable ? 'unavailable' : 'active',
            },
          ];
        }),
      )
      .sort(
        (left, right) =>
          right.shortageQty - left.shortageQty || left.projectName.localeCompare(right.projectName, 'zh-CN'),
      );
    return {
      configuredProjectCount: configuredProjects.length,
      unconfiguredProjectCount: projects.length - configuredProjects.length,
      blockedProjects,
    };
  }

  private resolveProjectMaterialDemandRange(input: BrainCapabilityExecutionInput, fallback: BrainDateRange) {
    const parsed = this.timeRangeParser.parse(input.question);
    if (readCapabilityStructuredTime(input.args, input.context.timezone) || parsed.range) return fallback;
    const today = defaultBrainDateRange();
    return {
      label: '最近30天',
      startDate: new Date(today.startDate.getTime() - 29 * 86_400_000),
      endDate: today.endDate,
      granularity: 'day' as const,
    };
  }

  private async projectMaterialDemandCoverage(storeId: number, question: string, startDate: Date, endDate: Date) {
    if (!this.prisma) throw new Error('project_material_sales_coverage_prisma_unavailable');
    const projects = await this.prisma.project.findMany({
      where: { storeId, deletedAt: null, status: 'active' },
      select: {
        id: true,
        name: true,
        bomItems: {
          where: { product: { storeId } },
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
    const normalizedQuestion = normalizeProjectMaterialCoverageText(question);
    const project = projects
      .map((candidate) => ({ candidate, name: normalizeProjectMaterialCoverageText(candidate.name) }))
      .filter((candidate) => candidate.name.length >= 2 && normalizedQuestion.includes(candidate.name))
      .sort((left, right) => right.name.length - left.name.length)[0]?.candidate;
    if (!project) return { project: undefined, serviceCount: 0, rows: [] };
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'project',
        itemId: project.id,
        order: {
          storeId,
          status: { in: ['completed', 'paid'] },
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      select: { quantity: true },
    });
    const serviceCount = orderItems.reduce((sum, item) => sum + Number(item.quantity), 0);
    const rows = project.bomItems.map((item) => {
      const standardQty = Number(item.standardQty);
      const currentStock = Number(item.product.currentStock);
      const demandQty = standardQty * serviceCount;
      const unavailable = item.product.deletedAt !== null || item.product.status !== 'active';
      return {
        projectName: project.name,
        productName: item.product.name,
        serviceCount,
        standardQty,
        demandQty,
        currentStock,
        coverageServiceCount: standardQty > 0 ? Math.floor(currentStock / standardQty) : null,
        shortageQty: unavailable ? demandQty : Math.max(0, demandQty - currentStock),
        unit: item.unit,
        productStatus: unavailable ? 'unavailable' : 'active',
      };
    });
    return { project: { id: project.id, name: project.name }, serviceCount, rows };
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
      const limitation =
        '现有预约记录没有统一的通知发送与送达回执字段，无法确认预约是否已经通知到位。Ami Brain 不会用预约状态代替消息送达状态。';
      return this.unsupportedFocusedAnswer('reservation_notification_receipt_not_available', limitation);
    }
    if (/(?:可能|预测|风险).*(?:爽约|不来)|(?:爽约|不来).*(?:可能|预测|风险)/.test(question)) {
      const limitation =
        '现有预约记录只有已发生的预约状态，没有已治理的爽约预测结果，无法判断哪些客户可能爽约。Ami Brain 不会把待确认预约直接标记为爽约风险。';
      return this.unsupportedFocusedAnswer('reservation_no_show_prediction_not_available', limitation);
    }

    const active = schedule.reservations.filter((item) => !this.isCancelledReservation(item.status));
    const timeWindow = this.resolveQuestionTimeWindow(question);
    const customerName = this.resolveEntityName(input, 'customer');
    const beauticianName = this.resolveEntityName(input, 'beautician');
    const filterRows = <T extends (typeof schedule.reservations)[number]>(rows: T[]) =>
      rows.filter((item) => {
        if (timeWindow && !this.timeInWindow(item.startTime, timeWindow)) return false;
        if (customerName && !item.customerName.includes(customerName)) return false;
        if (beauticianName && !String(item.beauticianName ?? '').includes(beauticianName)) return false;
        return true;
      });

    if (
      /(?:预约).*(?:还没确认|没有确认|没确认|未确认|待确认)|(?:还没确认|没有确认|没确认|未确认|待确认).*(?:预约|客人|客户)/.test(
        question,
      )
    ) {
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
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'pending_confirmation_reservations',
          rangeLabel: range.label,
          count: rows.length,
          olderThanTwoHours,
        },
      };
    }

    if (
      /(?:预约了|有预约|预约).*(?:还没来|没到|未到店|待到店)|(?:还没来|没到|未到店|待到店).*(?:客人|客户|预约)/.test(
        question,
      )
    ) {
      const rows = filterRows(active.filter((item) => this.isPendingArrival(item.status)));
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}有 ${rows.length} 位已预约待到店客户：${this.summarizeReservationRows(rows)}。`
          : `${range.label}没有已预约待到店客户。`,
        citations,
        grounding: 'db_skill',
        blocks: [this.reservationTableBlock(rows, citationIds)],
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'pending_arrival_customer_list',
          rangeLabel: range.label,
          count: rows.length,
          pendingArrival: rows.length,
        },
      };
    }

    if (
      /(?:所有|全部|今天).*(?:到店客人|到店客户).*(?:基本信息|名单|情况)|(?:到店客人|到店客户).*(?:基本信息|名单)/.test(
        question,
      )
    ) {
      const rows = filterRows(active.filter((item) => this.isArrivedReservation(item.status)));
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}已记录到店 ${rows.length} 位客户：${this.summarizeReservationRows(rows)}。`
          : `${range.label}没有已记录到店客户。`,
        citations,
        grounding: 'db_skill',
        blocks: [this.reservationTableBlock(rows, citationIds)],
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'arrived_customer_list',
          rangeLabel: range.label,
          count: rows.length,
        },
      };
    }

    if (/VIP|高等级会员|会员等级/.test(question)) {
      const rows = filterRows(active);
      const limitation =
        '系统当前只有预约客户的原始会员等级，尚未发布统一的 VIP 等级映射规则，因此只展示会员等级，不自动把某个等级判定为 VIP。';
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}预约客户的会员等级如下，共 ${rows.length} 人。${limitation}`
          : `${range.label}没有预约客户。${limitation}`,
        citations,
        grounding: 'db_skill',
        blocks: [
          this.reservationTableBlock(rows, citationIds, [
            'date',
            'startTime',
            'customerName',
            'memberLevel',
            'projectName',
            'beauticianName',
          ]),
          { kind: 'limitations', items: [limitation] },
        ],
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'reservation_member_level_list',
          rangeLabel: range.label,
          count: rows.length,
          unsupportedReason: 'vip_level_mapping_not_published',
        },
      };
    }

    if (/(?:面部|身体).*(?:几个|多少|分类)|(?:几个|多少).*(?:面部|身体)/.test(question)) {
      const rows = filterRows(active);
      const grouped = new Map<string, number>();
      for (const item of rows)
        grouped.set(item.projectTypeName ?? '未分类', (grouped.get(item.projectTypeName ?? '未分类') ?? 0) + 1);
      const counts = [...grouped.entries()].sort((left, right) => right[1] - left[1]);
      const answer = counts.length ? counts.map(([name, count]) => `${name} ${count} 个`).join('，') : '没有有效预约';
      return {
        status: 'completed',
        answer: `${range.label}按项目分类统计：${answer}。`,
        citations,
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'table',
            rows: counts.map(([projectType, count]) => ({ projectType, count })),
            columns: ['projectType', 'count'],
            citationIds,
          },
        ],
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'reservation_project_type_breakdown',
          rangeLabel: range.label,
          count: rows.length,
        },
      };
    }

    if (/(?:预约最多|最忙).*(?:哪几天|哪天)|(?:哪几天|哪天).*(?:预约最多|最忙)/.test(question)) {
      const grouped = new Map<string, number>();
      for (const item of active) grouped.set(item.date, (grouped.get(item.date) ?? 0) + 1);
      const rows = [...grouped.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((left, right) => right.count - left.count || left.date.localeCompare(right.date));
      return {
        status: 'completed',
        answer: rows.length
          ? `${range.label}预约最多的是 ${rows[0]!.date}，共 ${rows[0]!.count} 个；前 ${Math.min(rows.length, 5)} 天为：${rows
              .slice(0, 5)
              .map((item) => `${item.date} ${item.count} 个`)
              .join('，')}。`
          : `${range.label}没有有效预约，无法形成日期排行。`,
        citations,
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'ranking',
            rows: rows.slice(0, this.resolveLimit(input.args.limit, 10)),
            columns: ['date', 'count'],
            citationIds,
          },
        ],
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'reservation_daily_ranking',
          rangeLabel: range.label,
          count: active.length,
        },
      };
    }

    if (
      /(?:哪个|哪些|什么).*(?:项目).*(?:预约最多|最忙|最多预约)|(?:预约最多|最忙|最多预约).*(?:项目)/.test(question)
    ) {
      const grouped = new Map<string, { projectId?: number; projectName: string; count: number }>();
      for (const item of active) {
        const key = item.projectId != null ? `projectId:${item.projectId}` : `projectName:${item.projectName}`;
        const current = grouped.get(key);
        if (current) {
          current.count += 1;
        } else {
          grouped.set(key, {
            ...(item.projectId != null ? { projectId: item.projectId } : {}),
            projectName: item.projectName,
            count: 1,
          });
        }
      }
      const rows = [...grouped.values()].sort((left, right) => {
        const projectIdComparison = (left.projectId ?? 0) - (right.projectId ?? 0);
        return (
          right.count - left.count || projectIdComparison || left.projectName.localeCompare(right.projectName, 'zh-CN')
        );
      });
      const topRows = rows.slice(0, 1);
      return {
        status: 'completed',
        answer: topRows.length
          ? `${range.label}预约最多的项目是 ${topRows[0]!.projectName}，共 ${topRows[0]!.count} 个预约。`
          : `${range.label}没有有效预约，无法形成项目排行。`,
        citations,
        grounding: 'db_skill',
        blocks: [
          topRows.length
            ? {
                kind: 'ranking' as const,
                rows: topRows,
                columns: ['projectId', 'projectName', 'count'],
                citationIds,
              }
            : {
                kind: 'limitations' as const,
                items: ['no_data:当前时间范围没有有效预约，无法形成项目排行。'],
              },
        ],
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'reservation_project_ranking',
          rangeLabel: range.label,
          count: active.length,
        },
      };
    }

    const filtered = filterRows(active);
    if (/(?:下一个|下一位|接下来).*(?:预约|客人|客户)|(?:预约|客人|客户).*(?:下一个|下一位)/.test(question)) {
      const now = new Date();
      const next = filtered.find((item) => this.reservationAt(item, input.context.timezone).getTime() >= now.getTime());
      return this.singleReservationAnswer(
        next,
        input,
        range,
        citations,
        'next_reservation',
        next
          ? `下一个预约是 ${next.date} ${next.startTime} 的${next.customerName}，项目为${next.projectName}${next.beauticianName ? `，美容师 ${next.beauticianName}` : ''}`
          : `${range.label}没有后续有效预约`,
        { currentTime: this.formatClock(now, input.context.timezone) },
      );
    }

    if (/(?:最后一个|最后一位).*(?:预约|客人|客户)|(?:预约|客人|客户).*(?:最后一个|最后一位)/.test(question)) {
      const last = filtered.at(-1);
      return this.singleReservationAnswer(
        last,
        input,
        range,
        citations,
        'last_reservation',
        last
          ? `${range.label}最后一个预约是 ${last.date} ${last.startTime}${last.endTime ? `-${last.endTime}` : ''} 的${last.customerName}，项目为${last.projectName}`
          : `${range.label}没有有效预约`,
      );
    }

    if (/(?:第一个|首个|最早).*(?:预约|客人|客户)|(?:预约|客人|客户).*(?:第一个|首个|最早)/.test(question)) {
      const first = filtered[0];
      return this.singleReservationAnswer(
        first,
        input,
        range,
        citations,
        'first_reservation',
        first
          ? `${range.label}第一个预约是 ${first.date} ${first.startTime} 的${first.customerName}，项目为${first.projectName}`
          : `${range.label}没有有效预约`,
      );
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
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'filtered_reservation_list',
          rangeLabel: range.label,
          count: filtered.length,
          customerName,
          beauticianName,
          exactTime: timeWindow?.exactTime,
        },
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
    const table = (
      items: typeof rows,
      columns = ['date', 'startTime', 'endTime', 'customerName', 'projectName', 'status', 'attentionItems'],
    ) => ({
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
        previousService: item.previousService
          ? `${item.previousService.projectName}（${this.formatDateTime(item.previousService.appointmentTime, input.context.timezone)}）`
          : '',
      })),
      columns,
      citationIds,
    });
    const completed = (
      answer: string,
      answerScope: string,
      items: typeof rows = rows,
      blocks: BrainResponseBlock[] = [table(items)],
    ): BrainDomainAnswer => ({
      status: 'completed',
      answer,
      citations,
      grounding: 'db_skill',
      blocks,
      metadata: {
        capabilityKey: input.card.key,
        answerScope,
        rangeLabel: range.label,
        count: items.length,
        identitySource: 'server_context_user',
      },
    });

    if (/培训|其他任务|非预约任务/.test(question)) {
      return this.unsupportedFocusedAnswer(
        'beautician_non_reservation_task_fact_not_available',
        '当前美容师能力只接入个人预约与服务事实，没有统一的培训或其他任务排期数据，无法判断今天是否另有培训或非预约任务。',
      );
    }
    if (/情绪状态|最近心情/.test(question)) {
      return this.unsupportedFocusedAnswer(
        'customer_emotion_fact_not_available',
        '当前客户档案没有结构化、可审计的近期情绪状态，无法推断客户情绪。可以查看已有客户备注和明确注意事项，但不会据此给客户贴情绪标签。',
      );
    }
    if (/(?:皮肤|肤质).*(?:敏感|易敏)|(?:敏感|易敏).*(?:护理方案|项目|护理).*(?:安全|合适)/.test(question)) {
      const attentionRows = rows.filter((item) =>
        item.attentionItems.some((attention) => /过敏|敏感|红肿|屏障|不耐受/.test(attention)),
      );
      const guidance =
        '敏感肤质应先复核过敏史、近期红肿和屏障状态，避开强酸、强刺激及未经确认的高能量项目；先做局部耐受测试，服务中持续观察。出现持续红肿、疼痛或呼吸不适时立即停止服务并建议就医，Ami Brain 不做医疗诊断。';
      const limitation = attentionRows.length
        ? `当前个人预约中有 ${attentionRows.length} 位客户记录了敏感或过敏相关注意事项，具体方案仍需结合本人档案和现场面诊确认。`
        : '当前问题没有提供可唯一定位的客户，且个人预约中未找到明确的敏感或过敏注意事项；本次只给出通用安全边界，不替代客户档案和现场面诊。';
      return {
        status: 'completed',
        answer: `${guidance}${limitation}`,
        citations: [
          {
            sourceType: 'governed_policy',
            sourceId: 'beautician_sensitive_care_safety',
            label: '敏感肤质服务安全边界',
          },
          ...(attentionRows.length
            ? [{ sourceType: 'db_skill', sourceId: 'beautician_service_summary', label: '当前美容师客户注意事项' }]
            : []),
        ],
        grounding: attentionRows.length ? 'db_skill' : 'template_skill',
        blocks: [
          { kind: 'text', text: guidance, citationIds: ['beautician_sensitive_care_safety'] },
          ...(attentionRows.length
            ? [table(attentionRows, ['date', 'startTime', 'customerName', 'projectName', 'attentionItems'])]
            : []),
          { kind: 'limitations', items: [limitation] },
        ],
        metadata: {
          capabilityKey: input.card.key,
          answerScope: 'beautician_sensitive_care_guidance',
          matchedAttentionCount: attentionRows.length,
          completionCriteria: ['sensitive_care_safety_loaded', 'customer_attention_checked'],
        },
      };
    }
    if (/取消/.test(question)) {
      const items = services.cancelledTasks;
      const limitation = '取消预约只说明预约状态，不能据此判断可以提前下班；培训、会议和其他非预约任务尚未接入。';
      return completed(
        items.length
          ? `${range.label}有 ${items.length} 个取消预约：${items.map((item) => `${item.startTime} ${item.customerName}，${item.projectName}`).join('；')}。${limitation}`
          : `${range.label}没有取消预约。${limitation}`,
        'beautician_cancelled_reservations',
        items,
        [table(items), { kind: 'limitations', items: [limitation] }],
      );
    }

    if (/(?:总共|一共).*(?:几个小时|多久)|(?:服务).*(?:几个小时|总时长)/.test(question)) {
      return completed(
        `${range.label}有效预约 ${services.serviceCount} 个，按预约开始和结束时间合计计划服务 ${this.formatDuration(services.scheduledMinutes)}。`,
        'beautician_scheduled_duration',
        rows,
        [
          {
            kind: 'kpi',
            items: [
              { label: '有效预约', value: `${services.serviceCount} 个` },
              { label: '计划服务时长', value: this.formatDuration(services.scheduledMinutes) },
            ],
            citationIds,
          },
          table(rows),
        ],
      );
    }

    if (/空档|空闲时间/.test(question)) {
      const limitation = '这里只计算已接入预约之间的空档，不包含营业前后时间，也不包含培训、会议和其他任务。';
      const gaps = services.gaps;
      return completed(
        gaps.length
          ? `${range.label}有 ${gaps.length} 段预约间空档：${gaps.map((gap) => `${gap.date} ${gap.startTime}-${gap.endTime}（${gap.minutes} 分钟）`).join('；')}。${limitation}`
          : `${range.label}没有检测到预约之间的空档。${limitation}`,
        'beautician_reservation_gaps',
        rows,
        [
          { kind: 'table', rows: gaps, columns: ['date', 'startTime', 'endTime', 'minutes'], citationIds },
          { kind: 'limitations', items: [limitation] },
        ],
      );
    }

    if (/首次|新客/.test(question)) {
      const items = rows.filter((item) => item.isFirstVisit);
      return completed(
        items.length
          ? `${range.label}有 ${items.length} 位到店次数仍为 0 的首次到店候选：${items.map((item) => `${item.startTime} ${item.customerName}`).join('；')}。`
          : `${range.label}没有到店次数为 0 的首次到店候选。`,
        'beautician_first_visit_customers',
        items,
        [table(items, ['date', 'startTime', 'customerName', 'projectName', 'isFirstVisit'])],
      );
    }

    if (/提前到|已经到|在等我/.test(question)) {
      const items = rows.filter((item) => item.arrivedEarly && this.isArrivedReservation(item.status));
      return completed(
        items.length
          ? `${range.label}有 ${items.length} 位客户已提前签到：${items.map((item) => `${item.startTime} ${item.customerName}`).join('；')}。`
          : `${range.label}没有记录到提前签到并等待的客户。`,
        'beautician_early_arrivals',
        items,
      );
    }

    if (/护理历史|上次做了什么|上次服务|之前做过/.test(question)) {
      const timeWindow = this.resolveQuestionTimeWindow(question);
      const candidates = timeWindow ? rows.filter((item) => this.timeInWindow(item.startTime, timeWindow)) : rows;
      const items = /下一个|下一位/.test(question)
        ? this.nextBeauticianItems(candidates, input.context.timezone).slice(0, 1)
        : candidates;
      const withHistory = items.filter((item) => item.previousService);
      return completed(
        withHistory.length
          ? `${range.label}查到 ${withHistory.length} 位预约客户的上次服务：${withHistory.map((item) => `${item.customerName}上次做${item.previousService!.projectName}（${this.formatDateTime(item.previousService!.appointmentTime, input.context.timezone)}）`).join('；')}。`
          : `${range.label}当前预约客户没有可用的已完成历史服务记录。`,
        'beautician_customer_previous_service',
        items,
        [table(items, ['date', 'startTime', 'customerName', 'projectName', 'previousService', 'attentionItems'])],
      );
    }

    if (/VIP|高等级会员/.test(question)) {
      const limitation = '当前只展示客户原始会员等级，统一 VIP 等级映射规则尚未发布，不能自动判定哪些等级属于 VIP。';
      return completed(
        `${range.label}预约客户会员等级已列出。${limitation}`,
        'beautician_customer_member_levels',
        rows,
        [
          table(rows, ['date', 'startTime', 'customerName', 'memberLevel', 'projectName']),
          { kind: 'limitations', items: [limitation] },
        ],
      );
    }

    if (/比较难服务|需要注意什么/.test(question) && !/下一个|下一位|下午|点/.test(question)) {
      const items = rows.filter((item) => item.attentionItems.length > 0);
      const limitation = '系统不会给客户贴“难服务”标签，只列出档案中已有的过敏、肤质、皮肤状态和明确备注。';
      return completed(
        items.length
          ? `${range.label}有 ${items.length} 位客户存在明确注意事项。${limitation}`
          : `${range.label}没有记录到明确注意事项。${limitation}`,
        'beautician_customer_attention_list',
        items,
        [table(items), { kind: 'limitations', items: [limitation] }],
      );
    }

    if (/(?:最后一个|最后一位).*(?:结束|客人|客户)|(?:最后一个|最后一位).*(?:之后|后面)/.test(question)) {
      const last = rows.at(-1);
      const limitation = '这里只能确认后续是否还有个人预约，培训、会议和其他任务尚未接入。';
      return completed(
        last
          ? `${range.label}最后一个预约是 ${last.startTime}${last.endTime ? `-${last.endTime}` : ''} 的${last.customerName}，项目为${last.projectName}。${limitation}`
          : `${range.label}没有有效预约。${limitation}`,
        'beautician_last_reservation',
        last ? [last] : [],
        [table(last ? [last] : []), { kind: 'limitations', items: [limitation] }],
      );
    }

    const timeWindow = this.resolveQuestionTimeWindow(question);
    const timeFiltered = timeWindow ? rows.filter((item) => this.timeInWindow(item.startTime, timeWindow)) : rows;
    if (/(?:第一个|首个|最早).*(?:客人|客户|预约)/.test(question)) {
      const first = timeFiltered[0];
      return completed(
        first
          ? `${range.label}第一个预约是 ${first.startTime} 的${first.customerName}，项目为${first.projectName}。`
          : `${range.label}没有有效预约。`,
        'beautician_first_reservation',
        first ? [first] : [],
      );
    }
    if (/(?:下一个|下一位|接下来).*(?:客人|客户|预约)|(?:客人|客户).*(?:下一个|下一位)/.test(question)) {
      const next = this.nextBeauticianItems(timeFiltered, input.context.timezone)[0];
      if (!next) return completed(`${range.label}没有后续有效预约。`, 'beautician_next_reservation', []);
      const previous = next.previousService
        ? `；上次服务为${next.previousService.projectName}（${this.formatDateTime(next.previousService.appointmentTime, input.context.timezone)}）`
        : '';
      const attention = next.attentionItems.length
        ? `；注意事项：${next.attentionItems.join('；')}`
        : '；没有记录到明确注意事项';
      return completed(
        `下一位客户是 ${next.startTime} 的${next.customerName}，项目为${next.projectName}${previous}${attention}。`,
        'beautician_next_reservation',
        [next],
      );
    }
    if (timeWindow?.exactTime || /下午那个客人|下午的客人/.test(question)) {
      return completed(
        timeFiltered.length
          ? `${range.label}找到 ${timeFiltered.length} 个匹配预约：${timeFiltered.map((item) => `${item.startTime} ${item.customerName}，${item.projectName}${item.attentionItems.length ? `，注意：${item.attentionItems.join('；')}` : ''}`).join('；')}。`
          : `${range.label}没有找到匹配预约。`,
        'beautician_time_filtered_reservations',
        timeFiltered,
      );
    }
    if (/这周.*(?:排班|安排)|本周.*(?:排班|安排)/.test(question)) {
      const limitation = '当前输出的是个人预约排期，不等同于考勤排班，也不包含培训和其他任务。';
      return completed(
        `${range.label}有 ${rows.length} 个有效预约。${limitation}`,
        'beautician_weekly_reservations',
        rows,
        [table(rows), { kind: 'limitations', items: [limitation] }],
      );
    }
    if (/整体.*(?:服务流程|安排)|(?:几个客人|分别几点)|(?:今天|明天).*(?:预约安排|服务安排)/.test(question)) {
      return completed(
        rows.length
          ? `${range.label}有 ${rows.length} 个有效预约，计划服务 ${this.formatDuration(services.scheduledMinutes)}：${rows.map((item) => `${item.startTime}${item.endTime ? `-${item.endTime}` : ''} ${item.customerName}，${item.projectName}`).join('；')}。`
          : `${range.label}没有有效预约安排。`,
        'beautician_service_timeline',
        rows,
        [
          {
            kind: 'kpi',
            items: [
              { label: '有效预约', value: `${rows.length} 个` },
              { label: '计划服务时长', value: this.formatDuration(services.scheduledMinutes) },
            ],
            citationIds,
          },
          table(rows),
        ],
      );
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
      metadata: {
        unsupportedReason: reason,
        completion: { status: 'complete', missingCriteria: [], recoverable: false },
      },
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
    item:
      Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'][number] | undefined,
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
      blocks: [
        this.reservationTableBlock(
          item ? [item] : [],
          citations.map((citation) => citation.sourceId),
        ),
      ],
      metadata: {
        capabilityKey: input.card.key,
        answerScope,
        rangeLabel: range.label,
        count: item ? 1 : 0,
        ...extraMetadata,
      },
    };
  }

  private reservationTableBlock(
    rows: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'],
    citationIds: string[],
    columns = [
      'customerId',
      'reservationId',
      'date',
      'startTime',
      'endTime',
      'customerName',
      'projectName',
      'beauticianName',
      'status',
      'attentionItems',
    ],
  ): Extract<BrainResponseBlock, { kind: 'table' }> {
    return { kind: 'table', rows: rows.map((item) => this.reservationRow(item)), columns, citationIds };
  }

  private reservationRow(
    item: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'][number],
  ) {
    const attentionItems = item.attentionItems ?? [];
    return {
      customerId: item.customerId,
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

  private summarizeReservationRows(
    rows: Awaited<ReturnType<BrainSkillRuntimeService['listReceptionReservations']>>['reservations'],
  ) {
    return rows
      .slice(0, 20)
      .map((item, index) => {
        const attentionItems = item.attentionItems ?? [];
        return `${index + 1}. ${item.date} ${item.startTime}${item.endTime ? `-${item.endTime}` : ''} ${item.customerName}，${item.projectName}${item.beauticianName ? `，美容师 ${item.beauticianName}` : ''}${attentionItems.length ? `，注意：${attentionItems.join('；')}` : ''}`;
      })
      .join('；');
  }

  private resolveEntityName(input: BrainCapabilityExecutionInput, entityType: 'customer' | 'beautician') {
    const mention = structuredEntityMentions(input.args as BrainCapabilityToolArgs).find(
      (entity) => entity.entityType === entityType && entity.source !== 'system',
    )?.mention;
    const cleaned = String(mention ?? '')
      .replace(/(?:美容师|老师|客户|顾客|女士|先生)$/g, '')
      .trim();
    if (cleaned && !this.isGenericEntityMention(cleaned)) return cleaned;
    if (entityType === 'customer') {
      const matched = input.question.match(/([\u4e00-\u9fa5]{2,4})的预约/);
      const candidate = matched?.[1];
      if (candidate && !this.isGenericEntityMention(candidate)) return candidate;
    } else {
      const matched = input.question.match(/([\u4e00-\u9fa5]{1,4})(?:美容师|老师)/);
      const candidate = matched?.[1];
      if (candidate && !this.isGenericEntityMention(candidate)) return candidate;
    }
    return undefined;
  }

  private isGenericEntityMention(value: string) {
    return /^(这个|那个|某个|哪个|哪些|哪位|哪几位|各个|每个|所有|全部|当前|下一个|下一位|谁|有谁|都有谁|顾客|客户|客人|美容师|员工|技师|今天|明天|下午|上午)$/.test(
      value,
    );
  }

  private resolveQuestionTimeWindow(
    question: string,
  ): { startTime: string; endTime: string; exactTime?: string } | undefined {
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
    const digits: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };
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

  private isNoShowReservation(status: string) {
    return ['no_show', 'noshow', 'missed', '爽约', '未到店'].includes(status.trim().toLowerCase());
  }

  private isPendingConfirmation(status: string) {
    return ['pending', '待确认'].includes(status);
  }

  private isPendingArrival(status: string) {
    return ['pending', 'confirmed', 'scheduled', '待确认', '已确认'].includes(status);
  }

  private isArrivedReservation(status: string) {
    return ['checked_in', 'in_service', 'arrived', 'completed', 'served', '已到店', '服务中', '已完成'].includes(
      status,
    );
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
    const future = rows.filter(
      (item) =>
        new Date(`${item.date}T${item.startTime}:00${timezone === 'Asia/Shanghai' ? '+08:00' : 'Z'}`).getTime() >= now,
    );
    return future.length ? future : rows;
  }

  private formatDuration(minutes: number) {
    if (!minutes) return '0 分钟';
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours ? `${hours} 小时` : ''}${remainder ? `${remainder} 分钟` : ''}`;
  }

  private formatClock(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(value);
  }

  private formatDateTime(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(value);
  }

  private formatDateOnly(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
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

  private resolveStaffPerformanceRange(input: BrainCapabilityExecutionInput, fallback: BrainDateRange): BrainDateRange {
    const structuredTime = readCapabilityStructuredTime(input.args, input.context.timezone);
    const parsedTime = this.timeRangeParser.parse(input.question);
    if (structuredTime || parsedTime.range) return fallback;
    const today = defaultBrainDateRange();
    return {
      label: '最近30天',
      startDate: new Date(today.startDate.getTime() - 29 * 24 * 60 * 60 * 1000),
      endDate: today.endDate,
      granularity: 'day',
    };
  }

  private executionTimeRange(range: BrainDateRange, timezone: string) {
    return {
      timeRange: {
        startDate: range.startDate.toISOString(),
        endExclusive: new Date(range.endDate.getTime() + 1).toISOString(),
        boundary: '[start,end)',
        timezone,
      },
    };
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

  private async buildOrderPaymentMismatchAnswer(
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
  ): Promise<BrainDomainAnswer | undefined> {
    if (!/(?:订单).*(?:支付|收款).*(?:金额).*(?:对不上|不一致|不相等)/.test(input.question)) {
      return undefined;
    }
    if (!this.prisma) throw new Error('order_payment_reconciliation_prisma_unavailable');
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId: input.context.storeId,
        status: { in: ['completed', 'paid'] },
        createdAt: { gte: range.startDate, lte: range.endDate },
      },
      select: {
        id: true,
        orderNo: true,
        netAmount: true,
        totalAmount: true,
        paymentRecords: {
          where: { status: { in: ['success', 'paid', 'completed'] } },
          select: { id: true, amount: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const mismatches: Array<{
      orderId: number;
      orderNo: string;
      orderAmount: number;
      successfulPaymentAmount: number;
      difference: number;
      paymentRecordCount: number;
    }> = [];
    const unverifiable: Array<{ orderId: number; orderNo: string; orderAmount: number }> = [];
    let auditableOrderCount = 0;
    for (const order of orders) {
      const netAmount = Number(order.netAmount ?? 0);
      const totalAmount = Number(order.totalAmount ?? 0);
      const orderAmount = this.roundMoney(netAmount > 0 ? netAmount : totalAmount);
      if (!order.paymentRecords.length && orderAmount > 0.01) {
        unverifiable.push({ orderId: order.id, orderNo: order.orderNo, orderAmount });
        continue;
      }
      auditableOrderCount += 1;
      const successfulPaymentAmount = this.roundMoney(
        order.paymentRecords.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
      );
      const difference = this.roundMoney(successfulPaymentAmount - orderAmount);
      if (Math.abs(difference) <= 0.01) continue;
      mismatches.push({
        orderId: order.id,
        orderNo: order.orderNo,
        orderAmount,
        successfulPaymentAmount,
        difference,
        paymentRecordCount: order.paymentRecords.length,
      });
    }
    const limitation = unverifiable.length
      ? `${unverifiable.length} 张有效订单缺少成功支付明细，本次只标记为“无法核对”，不将它们判定为金额不一致。`
      : undefined;
    const answer = mismatches.length
      ? `${range.label}核对 ${auditableOrderCount} 张有成功支付流水的有效订单，发现 ${mismatches.length} 张订单的订单净额与成功支付合计不一致。${limitation ?? ''}`
      : `${range.label}核对 ${auditableOrderCount} 张有成功支付流水的有效订单，未发现订单净额与成功支付合计不一致。${limitation ?? ''}`;
    const citationId = 'order_payment_amount_reconciliation';
    return {
      status: 'completed',
      answer,
      citations: [
        {
          sourceType: 'db_skill',
          sourceId: citationId,
          label: '当前门店订单净额与成功支付流水勾稽',
          definition:
            '仅核对已完成或已支付订单；订单金额取 netAmount（历史数据缺失时取 totalAmount），支付金额取 success/paid/completed PaymentRecord 合计，容差 0.01 元。',
        },
      ],
      grounding: 'db_skill',
      blocks: [
        {
          kind: 'kpi',
          items: [
            { label: '可核对订单', value: `${auditableOrderCount} 张` },
            { label: '金额不一致订单', value: `${mismatches.length} 张` },
            { label: '缺支付明细待核对', value: `${unverifiable.length} 张` },
          ],
          citationIds: [citationId],
        },
        {
          kind: 'table',
          rows: mismatches,
          columns: ['orderId', 'orderNo', 'orderAmount', 'successfulPaymentAmount', 'difference', 'paymentRecordCount'],
          citationIds: [citationId],
        },
        {
          kind: 'diagnosis',
          findings: [
            {
              title: mismatches.length ? '发现订单支付金额差异' : '未发现可核对订单金额差异',
              detail: mismatches.length
                ? `${mismatches.length} 张订单超过 0.01 元容差，应按订单号复核支付流水。`
                : '所有可核对订单均在 0.01 元容差内一致。',
              severity: mismatches.length ? ('critical' as const) : ('info' as const),
            },
          ],
          citationIds: [citationId],
        },
        ...(limitation ? [{ kind: 'limitations' as const, items: [limitation] }] : []),
      ],
      metadata: {
        capabilityKey: 'finance_risk_overview',
        answerScope: 'order_payment_amount_reconciliation',
        rangeLabel: range.label,
        sourceOrderCount: orders.length,
        auditableOrderCount,
        mismatchOrderCount: mismatches.length,
        unverifiableOrderCount: unverifiable.length,
        toleranceAmount: 0.01,
        actionWriteCount: 0,
        ...this.executionTimeRange(range, input.context.timezone),
        completionCriteria: [
          'valid_orders_loaded',
          'successful_payment_records_loaded',
          'order_amounts_reconciled',
          'unverifiable_orders_disclosed',
        ],
      },
    };
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
      {
        key: 'discount_rate',
        title: '折扣率上升',
        current: currentRates.discount,
        previous: previousRates.discount,
        detail: '优惠金额占实收比例上升，会直接压缩收入质量。',
      },
      {
        key: 'refund_rate',
        title: '退款率上升',
        current: currentRates.refund,
        previous: previousRates.refund,
        detail: '退款金额占实收比例上升，需要复核退款原因和授权。',
      },
      {
        key: 'material_cost_rate',
        title: '物料成本率上升',
        current: currentRates.material,
        previous: previousRates.material,
        detail: '物料成本占收入比例上升，是毛利承压因素。',
      },
      {
        key: 'commission_cost_rate',
        title: '提成成本率上升',
        current: currentRates.commission,
        previous: previousRates.commission,
        detail: '提成成本占收入比例上升，需要核对项目和员工提成结构。',
      },
      {
        key: 'operating_cost_rate',
        title: '经营费用率上升',
        current: currentRates.operating,
        previous: previousRates.operating,
        detail: '经营费用占收入比例上升，会削弱最终盈利能力。',
      },
    ];
    const drivers = driverDefinitions
      .flatMap((item) =>
        item.current === undefined || item.previous === undefined
          ? []
          : [{ ...item, delta: item.current - item.previous }],
      )
      .filter((item) => item.delta > 0.005)
      .sort((left, right) => right.delta - left.delta);
    const rawMarginDelta =
      input.cost.grossMarginRate !== undefined && input.previousCost.grossMarginRate !== undefined
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
        detail:
          '当前期或上一可比期出现超出可信范围的毛利/成本比例，需先复核结算收入、成本归属期和重复记录；本次不据此判定毛利涨跌或根因。',
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
    findings.push(
      ...(diagnosisReliable ? drivers : []).slice(0, 3).map((driver) => ({
        title: driver.title,
        detail: `${driver.detail} 当前 ${this.percentage(driver.current)}，上期 ${this.percentage(driver.previous)}，增加 ${Math.abs(driver.delta * 100).toFixed(1)} 个百分点。`,
        severity: 'warning' as const,
      })),
    );
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
    ].flatMap((item) => (item ? [item] : []));
    const summary = !diagnosisReliable
      ? '基准期存在异常毛利/成本比例，必须先复核结算与成本归属；本次不输出伪根因。'
      : marginDelta === undefined
        ? '当前或基准期缺少有效毛利结算，本次只展示可验证的成本与风险变化，不输出伪根因。'
        : `毛利率较${input.previousLabel}${marginDelta < 0 ? '下降' : marginDelta > 0 ? '上升' : '持平'} ${Math.abs(marginDelta * 100).toFixed(1)} 个百分点${
            drivers.length
              ? `；优先复核${drivers
                  .slice(0, 3)
                  .map((item) => item.title.replace('上升', ''))
                  .join('、')}。`
              : '；已接入成本项未发现明显恶化。'
          }`;
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

  private resolveStructuredTimeRange(
    time: ReturnType<typeof readCapabilityStructuredTime>,
  ): BrainDateRange | undefined {
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
      hint:
        remaining > 0
          ? `还差 ${remaining.toFixed(2)} ${unit}`
          : `已超目标 ${Math.max(actual - target, 0).toFixed(2)} ${unit}`,
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
    const alignedDates =
      currentRange && previousRange
        ? this.alignedComparisonDates(currentRange, previousRange)
        : Array.from({ length: Math.max(current.length, previous.length) }, (_, index) => ({
            currentDate: current[index]?.date ?? '',
            previousDate: previous[index]?.date ?? '',
          }));
    return alignedDates
      .map(({ currentDate, previousDate }) => {
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

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async buildStructuredFinanceMetricAnswer(
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
  ): Promise<BrainDomainAnswer | undefined> {
    const metricKeys = new Set([
      ...structuredDefinitionKeys(input.args.metrics),
      ...this.inferFinanceRiskScalarMetricKeys(input.question),
    ]);
    const supported = new Set([
      'metric.gross_profit_amount',
      'metric.gross_margin_rate',
      'metric.operating_profit_amount',
      'metric.cost_income_ratio',
      'metric.cash_shift_reconciliation_rate',
      'metric.stored_value_liability',
      'metric.unfulfilled_card_liability',
      'metric.card_recognized_revenue_amount',
      'metric.order_gross_profit_amount',
      'metric.order_total_cost_amount',
      'metric.negative_margin_order_count',
      'metric.prepaid_order_gross_profit_amount',
      'metric.product_order_total_cost_amount',
      'metric.product_order_gross_profit_amount',
      'metric.staff_commission_component_amount',
    ]);
    if (![...metricKeys].some((key) => supported.has(key))) return undefined;
    const definitionCitations = [...metricKeys]
      .filter((key) => supported.has(key))
      .map((key) => {
        const ref = structuredDefinitionRef(input.args.metrics, key);
        return {
          sourceType: 'business_definition',
          sourceId: ref ? `${ref.definitionKey}@${ref.definitionVersion}` : key,
          label: `业务定义：${key}`,
        };
      });
    const citationIds = definitionCitations.map((citation) => citation.sourceId);

    if (metricKeys.has('metric.staff_commission_component_amount')) {
      const beauticians = structuredEntityMentions(input.args as BrainCapabilityToolArgs).filter(
        (entity) => entity.entityType === 'beautician' && /^\d+$/u.test(String(entity.entityKey ?? '')),
      );
      if (beauticians.length !== 1) {
        const limitation =
          beauticians.length > 1
            ? '一次只能查询一位美容师的提成构成，请明确选择其中一位。'
            : '提成构成必须绑定当前门店受控的美容师实体，请先选择具体美容师。';
        return {
          status: 'completed',
          answer: limitation,
          citations: definitionCitations,
          grounding: 'none',
          blocks: [{ kind: 'limitations', items: [limitation] }],
          metadata: {
            capabilityKey: 'finance_risk_overview',
            answerScope: 'staff_commission_composition',
            unsupportedReason:
              beauticians.length > 1 ? 'beautician_entity_reference_ambiguous' : 'beautician_entity_reference_required',
          },
        };
      }
      const beautician = beauticians[0]!;
      const rows = await this.skillRuntime.buildFinanceStaffCommissionRows({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
        beauticianId: Number(beautician.entityKey),
      });
      const displayRows = rows.map((row) => ({ type: row.commissionType, amount: row.amount }));
      const total = rows.reduce((sum, row) => sum + row.amount, 0);
      const name = rows[0]?.beauticianName ?? beautician.mention;
      return {
        status: 'completed',
        answer: `${range.label}${name}提成共 ${total.toFixed(2)} 元，按提成类型列示如下。`,
        citations: [
          ...definitionCitations,
          { sourceType: 'db_skill', sourceId: 'finance_staff_commission_rows', label: '员工有效提成构成' },
        ],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'table',
            rows: displayRows,
            columns: ['type', 'amount'],
            citationIds: ['finance_staff_commission_rows'],
          },
        ],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'staff_commission_composition',
          beauticianId: Number(beautician.entityKey),
          sourceRowCount: rows.length,
          ...this.executionTimeRange(range, input.context.timezone),
        },
      };
    }

    if (metricKeys.has('metric.card_recognized_revenue_amount')) {
      const rows = await this.skillRuntime.buildFinanceCardRecognitionRows({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const total = rows.reduce((sum, row) => sum + row.recognizedAmount, 0);
      return {
        status: 'completed',
        answer: `${range.label}次卡核销确认收入 ${total.toFixed(2)} 元。`,
        citations: [
          ...definitionCitations,
          { sourceType: 'db_skill', sourceId: 'finance_card_recognition_rows', label: '次卡核销确认收入明细' },
        ],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '确认收入', value: `${total.toFixed(2)} 元` }],
            citationIds: [...citationIds, 'finance_card_recognition_rows'],
          },
        ],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'card_recognized_revenue',
          sourceRowCount: rows.length,
          recognizedRevenue: total,
          ...this.executionTimeRange(range, input.context.timezone),
        },
      };
    }

    const requestsGenericOrders = [
      'metric.order_gross_profit_amount',
      'metric.order_total_cost_amount',
      'metric.negative_margin_order_count',
    ].some((key) => metricKeys.has(key));
    if (requestsGenericOrders) {
      const rows = await this.skillRuntime.buildFinanceOrderProfitRows({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
        scope: 'all',
      });
      if (metricKeys.has('metric.negative_margin_order_count')) {
        const negativeRows = rows.filter((row) => row.grossProfit < 0);
        return {
          status: 'completed',
          answer: negativeRows.length
            ? `${range.label}共有 ${negativeRows.length} 张负毛利订单。`
            : `${range.label}没有负毛利订单。`,
          citations: [
            ...definitionCitations,
            { sourceType: 'db_skill', sourceId: 'finance_order_profit_rows', label: '订单毛利明细' },
          ],
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'table',
              rows: negativeRows.map((row) => ({ orderId: row.orderId, grossProfit: row.grossProfit })),
              columns: ['orderId', 'grossProfit'],
              citationIds: ['finance_order_profit_rows'],
            },
          ],
          metadata: {
            capabilityKey: 'finance_risk_overview',
            answerScope: 'negative_margin_orders',
            sourceRowCount: rows.length,
            negativeOrderCount: negativeRows.length,
            ...this.executionTimeRange(range, input.context.timezone),
          },
        };
      }
      const includeCost = metricKeys.has('metric.order_total_cost_amount');
      const displayRows = rows.map((row) => ({
        orderId: row.orderId,
        ...(includeCost ? { totalCost: row.totalCost } : {}),
        grossProfit: row.grossProfit,
      }));
      return {
        status: 'completed',
        answer: `${range.label}已按订单 ID 列出 ${rows.length} 张订单的${includeCost ? '成本和' : ''}毛利。`,
        citations: [
          ...definitionCitations,
          { sourceType: 'db_skill', sourceId: 'finance_order_profit_rows', label: '订单成本与毛利明细' },
        ],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'table',
            rows: displayRows,
            columns: includeCost ? ['orderId', 'totalCost', 'grossProfit'] : ['orderId', 'grossProfit'],
            citationIds: ['finance_order_profit_rows'],
          },
        ],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'order_profit_rows',
          sourceRowCount: rows.length,
          ...this.executionTimeRange(range, input.context.timezone),
        },
      };
    }

    if (metricKeys.has('metric.prepaid_order_gross_profit_amount')) {
      const rows = await this.skillRuntime.buildFinanceOrderProfitRows({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
        scope: 'prepaid',
      });
      const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
      return {
        status: 'completed',
        answer: `${range.label}开卡和卡销售订单在收款时不确认经营收入，经营毛利为 ${grossProfit.toFixed(2)} 元。`,
        citations: [
          ...definitionCitations,
          { sourceType: 'db_skill', sourceId: 'finance_prepaid_order_profit_rows', label: '预收订单经营毛利' },
        ],
        grounding: 'db_skill',
        blocks: [{ kind: 'kpi', items: [{ label: '经营毛利', value: `${grossProfit.toFixed(2)} 元` }] }],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'prepaid_order_gross_profit',
          sourceRowCount: rows.length,
          ...this.executionTimeRange(range, input.context.timezone),
        },
      };
    }

    if (
      metricKeys.has('metric.product_order_total_cost_amount') ||
      metricKeys.has('metric.product_order_gross_profit_amount')
    ) {
      const rows = await this.skillRuntime.buildFinanceOrderProfitRows({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
        scope: 'product',
      });
      const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
      const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
      return {
        status: 'completed',
        answer: `${range.label}商品订单总成本 ${totalCost.toFixed(2)} 元，毛利 ${grossProfit.toFixed(2)} 元。`,
        citations: [
          ...definitionCitations,
          { sourceType: 'db_skill', sourceId: 'finance_product_order_profit_rows', label: '商品订单成本与毛利' },
        ],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'table',
            rows: [{ totalCost, grossProfit }],
            columns: ['totalCost', 'grossProfit'],
            citationIds: ['finance_product_order_profit_rows'],
          },
        ],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'product_order_cost_and_gross_profit',
          sourceRowCount: rows.length,
          ...this.executionTimeRange(range, input.context.timezone),
        },
      };
    }

    const costMetricKeys = [
      'metric.gross_profit_amount',
      'metric.gross_margin_rate',
      'metric.operating_profit_amount',
      'metric.cost_income_ratio',
      'metric.cash_shift_reconciliation_rate',
      'metric.stored_value_liability',
      'metric.unfulfilled_card_liability',
    ].filter((key) => metricKeys.has(key));
    if (!costMetricKeys.length) return undefined;
    const cost = await this.skillRuntime.buildFinanceCostAnalysis({
      storeId: input.context.storeId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
    if (metricKeys.has('metric.cash_shift_reconciliation_rate')) {
      const reconciled = cost.settlementCount > 0 && cost.reconciledSettlementCount === cost.settlementCount;
      return {
        status: 'completed',
        answer: `${range.label}收银班次${reconciled ? '已对平' : '未对平'}，权威日结 ${cost.reconciledSettlementCount}/${cost.settlementCount} 个营业日通过。`,
        citations: [
          ...definitionCitations,
          { sourceType: 'db_skill', sourceId: 'finance_cost_analysis', label: '权威日结对平状态' },
        ],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '收银对平状态', value: reconciled ? '已对平' : '未对平' }],
            citationIds: ['finance_cost_analysis'],
          },
        ],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'cash_shift_reconciliation',
          settlementCount: cost.settlementCount,
          reconciledSettlementCount: cost.reconciledSettlementCount,
          ...this.executionTimeRange(range, input.context.timezone),
        },
      };
    }
    const scalarMap: Record<string, { label: string; value: number; formatted: string }> = {
      'metric.gross_profit_amount': {
        label: '毛利',
        value: cost.grossProfit,
        formatted: `${cost.grossProfit.toFixed(2)} 元`,
      },
      'metric.gross_margin_rate': {
        label: '毛利率',
        value: cost.grossMarginRate ?? 0,
        formatted: `${((cost.grossMarginRate ?? 0) * 100).toFixed(2)}%`,
      },
      'metric.operating_profit_amount': {
        label: '经营利润',
        value: cost.operatingProfit,
        formatted: `${cost.operatingProfit.toFixed(2)} 元`,
      },
      'metric.cost_income_ratio': {
        label: '成本收入比',
        value: cost.costIncomeRatio,
        formatted: `${(cost.costIncomeRatio * 100).toFixed(2)}%`,
      },
      'metric.stored_value_liability': {
        label: '储值负债',
        value: cost.storedValueLiability,
        formatted: `${cost.storedValueLiability.toFixed(2)} 元`,
      },
      'metric.unfulfilled_card_liability': {
        label: '次卡未履约负债',
        value: cost.unfulfilledCardLiability,
        formatted: `${cost.unfulfilledCardLiability.toFixed(2)} 元`,
      },
    };
    const items = costMetricKeys.flatMap((key) => (scalarMap[key] ? [scalarMap[key]] : []));
    return {
      status: 'completed',
      answer: `${range.label}${items.map((item) => `${item.label} ${item.formatted}`).join('，')}。`,
      citations: [
        ...definitionCitations,
        { sourceType: 'db_skill', sourceId: 'finance_cost_analysis', label: '权威日结、成本、提成与负债分析' },
      ],
      grounding: 'db_skill',
      blocks: [
        {
          kind: 'kpi',
          items: items.map((item) => ({ label: item.label, value: item.formatted })),
          citationIds: ['finance_cost_analysis'],
        },
      ],
      metadata: {
        capabilityKey: 'finance_risk_overview',
        answerScope: 'structured_finance_metrics',
        requestedMetricKeys: costMetricKeys,
        ...this.executionTimeRange(range, input.context.timezone),
      },
    };
  }

  private inferFinanceRiskScalarMetricKeys(question: string): string[] {
    const normalized = question.replace(/\s+/gu, '');
    const inferred = new Set<string>();
    if (/收银(?:班次)?(?:对平|对账)|(?:对平|对账)了?吗/u.test(normalized)) {
      inferred.add('metric.cash_shift_reconciliation_rate');
    }
    if (
      /(?:储值|会员卡|会员余额|储值余额).*(?:负债|未履约|余额|总额|总计|合计)/u.test(normalized) &&
      !/(?:撑住|集中消费|都来消费|偿付压力)/u.test(normalized)
    ) {
      inferred.add('metric.stored_value_liability');
    }
    if (/(?:次卡|套餐卡|卡项).*(?:未履约|未核销|负债)/u.test(normalized)) {
      inferred.add('metric.unfulfilled_card_liability');
    }
    if (/哪些订单毛利为负|毛利为负|负毛利/u.test(normalized)) {
      inferred.add('metric.negative_margin_order_count');
    }
    if (/每张订单|分别多少/u.test(normalized) && /毛利/u.test(normalized)) {
      inferred.add('metric.order_gross_profit_amount');
    }
    if (/(?:产品|商品)订单.*(?:成本和毛利|毛利和成本)/u.test(normalized)) {
      inferred.add('metric.product_order_total_cost_amount');
      inferred.add('metric.product_order_gross_profit_amount');
    }
    if (/开卡订单|次卡订单|套餐卡订单/u.test(normalized)) {
      inferred.add('metric.prepaid_order_gross_profit_amount');
    }
    if (/经营利润/u.test(normalized)) {
      inferred.add('metric.operating_profit_amount');
    }
    if (/成本(?:占|\/|比).*收入|收入.*成本(?:占|\/|比)|成本收入比/u.test(normalized)) {
      inferred.add('metric.cost_income_ratio');
    }
    if (/毛利(?!率)/u.test(normalized) && !/(?:订单|项目|产品|商品|货品|开卡|卡销售)/u.test(normalized)) {
      inferred.add('metric.gross_profit_amount');
    }
    if (/毛利率/u.test(normalized) && !/(?:订单|项目|产品|商品|货品)/u.test(normalized)) {
      inferred.add('metric.gross_margin_rate');
    }
    return [...inferred];
  }

  private async buildCardRecognizedRevenueAnswer(
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
  ): Promise<BrainDomainAnswer | undefined> {
    const semanticText = `${input.question} ${String(input.args.objective ?? '')}`;
    if (!/(?:确认(?:的)?收入|收入确认)/.test(semanticText) || !/(?:次卡|套餐卡|卡项)/.test(semanticText)) {
      return undefined;
    }
    if (!this.prisma) throw new Error('prisma_service_unavailable');

    const cardNames = await this.prisma.cardUsageRecord.findMany({
      where: {
        storeId: input.context.storeId,
        verifiedAt: { gte: range.startDate, lte: range.endDate },
      },
      select: { cardName: true },
      distinct: ['cardName'],
    });
    const matchedCardName = cardNames
      .map((item) => String(item.cardName ?? '').trim())
      .filter((name) => name && input.question.includes(name))
      .sort((left, right) => right.length - left.length || left.localeCompare(right, 'zh-CN'))[0];
    if (!matchedCardName) {
      const hasCardRevenueCue = /(?:次卡|套餐卡|卡项).*(?:核销|确认收入|收入确认|确认的收入|确认收入进度)/.test(
        semanticText,
      );
      const hasSpecificCardLabelCue = /\d+\s*次卡/.test(semanticText);
      if (!hasCardRevenueCue) return undefined;
      if (hasSpecificCardLabelCue) {
        const limitation = '当前问题没有唯一匹配到本门店已有核销记录中的卡项名称，请补充完整卡名后再查询确认收入。';
        return {
          status: 'completed',
          answer: limitation,
          citations: [],
          grounding: 'none',
          blocks: [{ kind: 'limitations', items: [limitation] }],
          metadata: {
            capabilityKey: 'finance_risk_overview',
            answerScope: 'card_recognized_revenue',
            unsupportedReason: 'card_name_unresolved',
            rangeLabel: range.label,
          },
        };
      }
      const rows = await this.prisma.cardUsageRecord.findMany({
        where: {
          storeId: input.context.storeId,
          verifiedAt: { gte: range.startDate, lte: range.endDate },
        },
        select: {
          id: true,
          customerId: true,
          customerCardId: true,
          projectId: true,
          cardName: true,
          times: true,
          recognizedUnitValue: true,
          recognizedAmount: true,
          verifiedAt: true,
        },
        orderBy: { id: 'asc' },
      });
      const recognizedRevenue = rows.reduce((sum, row) => {
        const recognizedAmount = Number(row.recognizedAmount ?? 0);
        const fallbackAmount = Number(row.recognizedUnitValue ?? 0) * Number(row.times ?? 0);
        return sum + (recognizedAmount > 0 ? recognizedAmount : fallbackAmount);
      }, 0);
      const value = Math.round((recognizedRevenue + Number.EPSILON) * 100) / 100;
      const citationId = 'card_usage_recognized_revenue';
      return {
        status: 'completed',
        answer: `${range.label}次卡核销确认收入 ${value.toFixed(2)} 元，共 ${rows.length} 条核销记录。`,
        citations: [
          {
            sourceType: 'db_skill',
            sourceId: citationId,
            label: '当前门店次卡核销确认收入',
          },
        ],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '确认收入', value: `${value.toFixed(2)} 元` }],
            citationIds: [citationId],
          },
          {
            kind: 'table',
            rows: rows.map((row) => ({
              usageRecordId: row.id,
              customerId: row.customerId,
              customerCardId: row.customerCardId,
              projectId: row.projectId,
              cardName: row.cardName,
              times: row.times,
              recognizedAmount:
                Number(row.recognizedAmount ?? 0) > 0
                  ? Number(row.recognizedAmount)
                  : Number(row.recognizedUnitValue ?? 0) * Number(row.times ?? 0),
              verifiedAt: row.verifiedAt,
            })),
            columns: [
              'usageRecordId',
              'customerId',
              'customerCardId',
              'projectId',
              'cardName',
              'times',
              'recognizedAmount',
              'verifiedAt',
            ],
            citationIds: [citationId],
          },
        ],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'card_recognized_revenue',
          rangeLabel: range.label,
          sourceRowCount: rows.length,
          recognizedRevenue: value,
          ...this.executionTimeRange(range, input.context.timezone),
          completionCriteria: ['card_usage_records_loaded', 'recognized_revenue_calculated'],
        },
      };
    }

    const rows = await this.prisma.cardUsageRecord.findMany({
      where: {
        storeId: input.context.storeId,
        cardName: matchedCardName,
        verifiedAt: { gte: range.startDate, lte: range.endDate },
      },
      select: {
        id: true,
        customerId: true,
        customerCardId: true,
        projectId: true,
        cardName: true,
        times: true,
        recognizedUnitValue: true,
        recognizedAmount: true,
        verifiedAt: true,
      },
      orderBy: { id: 'asc' },
    });
    const recognizedRevenue = rows.reduce((sum, row) => {
      const recognizedAmount = Number(row.recognizedAmount ?? 0);
      const fallbackAmount = Number(row.recognizedUnitValue ?? 0) * Number(row.times ?? 0);
      return sum + (recognizedAmount > 0 ? recognizedAmount : fallbackAmount);
    }, 0);
    const value = Math.round((recognizedRevenue + Number.EPSILON) * 100) / 100;
    const citationId = 'card_usage_recognized_revenue';
    return {
      status: 'completed',
      answer: `${range.label}${matchedCardName}确认收入 ${value.toFixed(2)} 元，共 ${rows.length} 条核销记录。`,
      citations: [
        {
          sourceType: 'db_skill',
          sourceId: citationId,
          label: '当前门店卡项核销确认收入',
        },
      ],
      grounding: 'db_skill',
      blocks: [
        {
          kind: 'kpi',
          items: [{ label: '确认收入', value: `${value.toFixed(2)} 元` }],
          citationIds: [citationId],
        },
        {
          kind: 'table',
          rows: rows.map((row) => ({
            usageRecordId: row.id,
            customerId: row.customerId,
            customerCardId: row.customerCardId,
            projectId: row.projectId,
            cardName: row.cardName,
            times: row.times,
            recognizedAmount:
              Number(row.recognizedAmount ?? 0) > 0
                ? Number(row.recognizedAmount)
                : Number(row.recognizedUnitValue ?? 0) * Number(row.times ?? 0),
            verifiedAt: row.verifiedAt,
          })),
          columns: [
            'usageRecordId',
            'customerId',
            'customerCardId',
            'projectId',
            'cardName',
            'times',
            'recognizedAmount',
            'verifiedAt',
          ],
          citationIds: [citationId],
        },
      ],
      metadata: {
        capabilityKey: 'finance_risk_overview',
        answerScope: 'card_recognized_revenue',
        rangeLabel: range.label,
        cardName: matchedCardName,
        sourceRowCount: rows.length,
        recognizedRevenue: value,
        ...this.executionTimeRange(range, input.context.timezone),
        completionCriteria: ['card_name_resolved', 'card_usage_records_loaded', 'recognized_revenue_calculated'],
      },
    };
  }

  private async buildProjectOrderProfitAnswer(
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
  ): Promise<BrainDomainAnswer | undefined> {
    const semanticText = `${input.question} ${String(input.args.objective ?? '')}`;
    if (!/(?:订单).*(?:利润|毛利)|(?:利润|毛利).*(?:订单)/.test(semanticText)) return undefined;
    if (!this.operationProfit) throw new Error('operation_profit_service_unavailable');

    const result = await this.operationProfit.getProjectMargins({
      storeId: input.context.storeId,
      from: this.shanghaiDateKey(range.startDate),
      to: this.shanghaiDateKey(range.endDate),
      page: 1,
      pageSize: 10_000,
    });
    const projects = result.items as Array<{
      projectId: number;
      projectName: string;
      sourceOrders?: Array<{
        orderId?: number;
        orderNo?: string;
        orderedAt?: string;
        customerName?: string;
        quantity?: number;
        amount?: number;
        materialCost?: number;
        commissionCost?: number;
        totalCost?: number;
        grossProfit?: number;
      }>;
    }>;
    const project = projects
      .filter((item) => item.projectName && input.question.includes(item.projectName))
      .sort(
        (left, right) =>
          right.projectName.length - left.projectName.length ||
          left.projectName.localeCompare(right.projectName, 'zh-CN'),
      )[0];
    if (!project) {
      const limitation = '当前问题没有唯一匹配到本门店项目档案中的项目名称，请补充完整项目名后再查询订单利润。';
      return {
        status: 'completed',
        answer: limitation,
        citations: [],
        grounding: 'none',
        blocks: [{ kind: 'limitations', items: [limitation] }],
        metadata: {
          capabilityKey: 'finance_risk_overview',
          answerScope: 'project_order_profit',
          unsupportedReason: 'project_name_unresolved',
          rangeLabel: range.label,
        },
      };
    }

    const sourceOrders = project.sourceOrders ?? [];
    const totalProfit = sourceOrders.reduce((sum, row) => sum + Number(row.grossProfit ?? 0), 0);
    const value = Math.round((totalProfit + Number.EPSILON) * 100) / 100;
    const citationId = 'operation_profit_project_margins';
    return {
      status: 'completed',
      answer: `${range.label}${project.projectName}订单利润 ${value.toFixed(2)} 元，共 ${sourceOrders.length} 条订单明细。`,
      citations: [
        {
          sourceType: 'db_skill',
          sourceId: citationId,
          label: '经营利润项目毛利正式接口',
        },
      ],
      grounding: 'db_skill',
      blocks: [
        {
          kind: 'kpi',
          items: [{ label: '利润', value: `${value.toFixed(2)} 元` }],
          citationIds: [citationId],
        },
        {
          kind: 'table',
          rows: sourceOrders,
          columns: [
            'orderId',
            'orderNo',
            'orderedAt',
            'customerName',
            'quantity',
            'amount',
            'materialCost',
            'commissionCost',
            'totalCost',
            'grossProfit',
          ],
          citationIds: [citationId],
        },
      ],
      metadata: {
        capabilityKey: 'finance_risk_overview',
        answerScope: 'project_order_profit',
        rangeLabel: range.label,
        projectId: project.projectId,
        projectName: project.projectName,
        sourceRowCount: sourceOrders.length,
        orderProfit: value,
        ...this.executionTimeRange(range, input.context.timezone),
        completionCriteria: ['project_name_resolved', 'project_margin_rows_loaded', 'order_profit_calculated'],
      },
    };
  }

  private resolveMentionedManagerStaff<T extends { name: string }>(staff: T[], question: string): T[] {
    const matches = staff.filter((item) => item.name && question.includes(item.name));
    if (!matches.length) return [];
    const longestName = Math.max(...matches.map((item) => item.name.length));
    return matches
      .filter((item) => item.name.length === longestName)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  private resolveMentionedStaffProject(
    staff: Awaited<ReturnType<BrainSkillRuntimeService['buildManagerStaffDirectoryFacts']>>['staff'],
    question: string,
  ) {
    const names = [
      ...new Set(staff.flatMap((item) => item.projectSkills.map((skill) => skill.projectName)).filter(Boolean)),
    ].filter((name) => question.includes(name));
    return names.sort((left, right) => right.length - left.length || left.localeCompare(right, 'zh-CN'))[0];
  }

  private hasEffectiveStaffSchedule(
    staff: Awaited<ReturnType<BrainSkillRuntimeService['buildManagerStaffDirectoryFacts']>>['staff'][number],
  ) {
    return staff.schedules.some((schedule) => {
      if (!['available', 'working', 'published'].includes(schedule.status)) return false;
      const scheduleStart = this.staffClockMinutes(schedule.startTime);
      let scheduleEnd = this.staffClockMinutes(schedule.endTime);
      if (scheduleEnd <= scheduleStart) scheduleEnd += 24 * 60;
      const coveredIntervals = staff.timeOffs
        .filter((timeOff) => timeOff.date === schedule.date)
        .map((timeOff) => {
          const start = Math.max(scheduleStart, this.staffClockMinutes(timeOff.startTime));
          let end = this.staffClockMinutes(timeOff.endTime);
          if (end <= this.staffClockMinutes(timeOff.startTime)) end += 24 * 60;
          return [start, Math.min(scheduleEnd, end)] as const;
        })
        .filter(([start, end]) => end > start)
        .sort((left, right) => left[0] - right[0]);
      let coveredMinutes = 0;
      let cursorStart = -1;
      let cursorEnd = -1;
      for (const [start, end] of coveredIntervals) {
        if (cursorStart < 0) {
          cursorStart = start;
          cursorEnd = end;
          continue;
        }
        if (start <= cursorEnd) {
          cursorEnd = Math.max(cursorEnd, end);
          continue;
        }
        coveredMinutes += cursorEnd - cursorStart;
        cursorStart = start;
        cursorEnd = end;
      }
      if (cursorStart >= 0) coveredMinutes += cursorEnd - cursorStart;
      return coveredMinutes < scheduleEnd - scheduleStart;
    });
  }

  private staffClockMinutes(value: string) {
    const [hours = 0, minutes = 0] = value.split(':').map((item) => Number(item));
    return hours * 60 + minutes;
  }

  private assertStructuredArgsSupported(input: BrainCapabilityExecutionInput) {
    if (input.args.filters !== undefined && !Array.isArray(input.args.filters)) {
      throw new Error(`domain_filter_args_unsupported:${input.card.key}`);
    }
    const acceptsQuestionScopedCustomerCardFilters =
      input.card.key === 'customer_facts' && this.isExpiringCardNoReservationQuestion(input.question);
    if (
      Array.isArray(input.args.filters) &&
      input.args.filters.length &&
      !this.readCustomerMemberLevelFilter(input) &&
      !acceptsQuestionScopedCustomerCardFilters
    ) {
      throw new Error(`domain_filter_args_unsupported:${input.card.key}`);
    }
    if (Array.isArray(input.args.orderBy) && input.args.orderBy.length) this.assertOrderArgsSupported(input);
    if (
      input.args.comparisonTarget !== undefined &&
      !['store_operations_overview', 'finance_payment_breakdown', 'finance_risk_overview'].includes(input.card.key)
    ) {
      throw new Error(`domain_comparison_args_unsupported:${input.card.key}`);
    }
    const allEntities = structuredEntityMentions(input.args as BrainCapabilityToolArgs);
    const specificEntities = allEntities.filter(
      (entity) => entity.entityKey && entity.entityKey !== entity.entityType,
    );
    const supportsConversationReference =
      specificEntities.length > 0 &&
      specificEntities.every((entity) => entity.source === 'conversation') &&
      ((input.card.key === 'inventory_procurement_advice' &&
        specificEntities.every((entity) => entity.entityType === 'product')) ||
        (input.card.key === 'marketing_message_draft' &&
          specificEntities.every((entity) => entity.entityType === 'customer')));
    const supportsStaffReference =
      specificEntities.length > 0 &&
      input.card.key === 'manager_staff_overview' &&
      specificEntities.every((entity) => entity.entityType === 'beautician' && input.question.includes(entity.mention));
    const supportsReservationStaffReference =
      specificEntities.length === 1 &&
      allEntities.length === 1 &&
      input.card.key === 'reservation_list' &&
      specificEntities.every(
        (entity) =>
          entity.entityType === 'beautician' &&
          entity.definitionKey === 'entity.beautician' &&
          entity.source === 'user' &&
          /^\d+$/u.test(String(entity.entityKey ?? '')) &&
          Number(entity.entityKey) > 0 &&
          input.question.includes(entity.mention),
      );
    const supportsFinanceReference =
      specificEntities.length > 0 &&
      input.card.key === 'finance_risk_overview' &&
      specificEntities.every(
        (entity) =>
          ['beautician', 'project'].includes(entity.entityType) && /^\d+$/u.test(String(entity.entityKey ?? '')),
      );
    const supportsVerifiedReference =
      supportsConversationReference || supportsStaffReference || supportsReservationStaffReference || supportsFinanceReference;
    const requiresVerifiedReservationStaffReference =
      input.card.key === 'reservation_list' && allEntities.some((entity) => entity.entityType === 'beautician');
    if (requiresVerifiedReservationStaffReference && !supportsReservationStaffReference) {
      throw new Error(`domain_entity_filter_args_unsupported:${input.card.key}`);
    }
    if (input.card.key !== 'customer_facts' && specificEntities.length > 0 && !supportsVerifiedReference) {
      throw new Error(`domain_entity_filter_args_unsupported:${input.card.key}`);
    }
  }

  private isExpiringCardNoReservationQuestion(question: string) {
    return /(?:次卡|卡项).*(?:快到期|快过期|即将过期|临期).*(?:还没预约|没有预约|未预约|没预约)|(?:还没预约|没有预约|未预约|没预约).*(?:次卡|卡项).*(?:快到期|快过期|即将过期|临期)/.test(
      question,
    );
  }

  private readCustomerMemberLevelFilter(
    input: BrainCapabilityExecutionInput,
  ):
    | { definitionKey: 'dimension.customerLevel'; definitionVersion: number; operator: 'eq' | 'in'; values: string[] }
    | undefined {
    if (!Array.isArray(input.args.filters) || input.args.filters.length === 0) return undefined;
    if (input.card.key !== 'customer_facts' || input.args.filters.length !== 1) return undefined;
    const [rawFilter] = input.args.filters;
    if (!rawFilter || typeof rawFilter !== 'object' || Array.isArray(rawFilter)) return undefined;
    const filter = rawFilter as Record<string, unknown>;
    if (
      Reflect.ownKeys(filter).some((key) => typeof key !== 'string' || !['fieldRef', 'operator', 'value'].includes(key))
    ) {
      return undefined;
    }
    if (filter.operator !== 'eq' && filter.operator !== 'in') return undefined;
    const rawRef = filter.fieldRef;
    if (!rawRef || typeof rawRef !== 'object' || Array.isArray(rawRef)) return undefined;
    const ref = rawRef as Record<string, unknown>;
    const requiredRefKeys = new Set([
      'definitionId',
      'definitionType',
      'definitionKey',
      'definitionVersion',
      'version',
      'versionId',
      'definitionFingerprint',
      'sourceFingerprint',
    ]);
    if (Reflect.ownKeys(ref).some((key) => typeof key !== 'string' || !requiredRefKeys.has(key))) return undefined;
    if (
      ref.definitionType !== 'dimension' ||
      ref.definitionKey !== 'dimension.customerLevel' ||
      (!Number.isInteger(ref.definitionVersion) && !Number.isInteger(ref.version)) ||
      typeof ref.definitionFingerprint !== 'string' ||
      typeof ref.sourceFingerprint !== 'string'
    ) {
      return undefined;
    }
    const definitionVersion = (Number.isInteger(ref.definitionVersion) ? ref.definitionVersion : ref.version) as number;
    const cardDefinition = input.card.definitionRefs.find(
      (candidate) =>
        candidate.definitionKey === ref.definitionKey &&
        candidate.version === definitionVersion &&
        candidate.definitionFingerprint === ref.definitionFingerprint &&
        candidate.sourceFingerprint === ref.sourceFingerprint,
    );
    if (!cardDefinition) return undefined;
    const rawValues = filter.operator === 'eq' ? [filter.value] : Array.isArray(filter.value) ? filter.value : [];
    const values = [
      ...new Set(rawValues.flatMap((value) => (typeof value === 'string' ? [value.trim()] : [])).filter(Boolean)),
    ];
    if (!values.length || values.length > 20 || values.some((value) => value.length > 100)) return undefined;
    return {
      definitionKey: 'dimension.customerLevel',
      definitionVersion,
      operator: filter.operator,
      values,
    };
  }

  private assertOrderArgsSupported(input: BrainCapabilityExecutionInput) {
    const definitionKeys = new Set(input.card.definitionRefs.map((ref) => ref.definitionKey));
    const valid = (input.args.orderBy as unknown[]).every((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const order = value as Record<string, unknown>;
      if (order.direction !== 'desc' && !(input.card.key === 'manager_staff_overview' && order.direction === 'asc'))
        return false;
      const definitionRef = order.definitionRef;
      if (!definitionRef || typeof definitionRef !== 'object' || Array.isArray(definitionRef)) return false;
      const definitionKey = (definitionRef as Record<string, unknown>).definitionKey;
      return typeof definitionKey === 'string' && definitionKeys.has(definitionKey);
    });
    if (!valid) throw new Error(`domain_order_args_unsupported:${input.card.key}`);
  }

  private orderManagerStaffRows<
    T extends {
      staff: string;
      performanceScore: number;
      serviceCount: number;
      uniqueCustomerCount: number;
      customerRepurchaseRate: number;
      revenueAmount: number;
      commissionAmount: number;
    },
  >(rows: T[], orderBy: unknown, question: string): T[] {
    const order =
      Array.isArray(orderBy) && orderBy[0] && typeof orderBy[0] === 'object'
        ? (orderBy[0] as Record<string, unknown>)
        : undefined;
    const definitionRef =
      order?.definitionRef && typeof order.definitionRef === 'object' && !Array.isArray(order.definitionRef)
        ? (order.definitionRef as Record<string, unknown>)
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
        return (
          direction * (left.performanceScore - right.performanceScore) || left.staff.localeCompare(right.staff, 'zh-CN')
        );
      }
      if (definitionKey === 'metric.staff_service_count') {
        return direction * (left.serviceCount - right.serviceCount) || left.staff.localeCompare(right.staff, 'zh-CN');
      }
      if (definitionKey === 'metric.staff_unique_customer_count') {
        return (
          direction * (left.uniqueCustomerCount - right.uniqueCustomerCount) ||
          left.staff.localeCompare(right.staff, 'zh-CN')
        );
      }
      if (definitionKey === 'metric.staff_customer_repurchase_rate') {
        return (
          direction * (left.customerRepurchaseRate - right.customerRepurchaseRate) ||
          left.staff.localeCompare(right.staff, 'zh-CN')
        );
      }
      if (definitionKey === 'metric.staff_service_revenue') {
        return direction * (left.revenueAmount - right.revenueAmount) || left.staff.localeCompare(right.staff, 'zh-CN');
      }
      if (definitionKey === 'metric.staff_commission_amount') {
        return (
          direction * (left.commissionAmount - right.commissionAmount) || left.staff.localeCompare(right.staff, 'zh-CN')
        );
      }
      return (
        right.serviceCount - left.serviceCount ||
        right.performanceScore - left.performanceScore ||
        left.staff.localeCompare(right.staff, 'zh-CN')
      );
    });
  }

  private resolveManagerStaffFocusMetric(metricKeys: Set<string>, question: string): string | undefined {
    for (const key of [
      'metric.staff_customer_repurchase_rate',
      'metric.staff_service_revenue',
      'metric.staff_commission_amount',
      'metric.staff_unique_customer_count',
      'metric.staff_service_count',
      'metric.staff_performance_score',
    ]) {
      if (metricKeys.has(key)) return key;
    }
    if (/复购率/.test(question)) return 'metric.staff_customer_repurchase_rate';
    if (
      /(?:员工|美容师|技师|谁|哪位).*(?:业绩|服务收入|关联实收)|(?:业绩|服务收入|关联实收).*(?:员工|美容师|技师|谁|哪位)/.test(
        question,
      )
    ) {
      return 'metric.staff_service_revenue';
    }
    if (/提成/.test(question)) return 'metric.staff_commission_amount';
    if (/(接的客人|接客人数|服务客户)/.test(question)) return 'metric.staff_unique_customer_count';
    if (/服务次数|服务量/.test(question)) return 'metric.staff_service_count';
    if (/表现|综合评分|表现评分/.test(question)) return 'metric.staff_performance_score';
    return undefined;
  }

  private managerStaffMetricLabel(metricKey: string) {
    const labels: Record<string, string> = {
      'metric.staff_customer_repurchase_rate': '员工客户复购率',
      'metric.staff_service_revenue': '员工关联业绩实收',
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
      revenueAmount: number;
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
    if (metricKey === 'metric.staff_service_revenue') {
      return `${rangeLabel}关联业绩实收最高的是 ${top.staff}，实收 ${top.revenueAmount.toFixed(2)} 元。`;
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

  private normalizePaymentMethodKey(method: string): string {
    const normalized = String(method ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/gu, '');
    if (/^(?:cash|现金|现金支付|现付)$/u.test(normalized)) return 'cash';
    if (/^(?:wechat|weixin|wx|微信|微信支付|微信付款|微信收款)$/u.test(normalized)) return 'wechat';
    if (/^(?:alipay|支付宝|支付宝支付|支付宝付款|支付宝收款)$/u.test(normalized)) return 'alipay';
    if (/^(?:card|bankcard|pos|银行卡|银行卡支付|刷卡|银联|银联支付)$/u.test(normalized)) return 'card';
    if (/^(?:memberbalance|balance|storedvalue|储值|储值余额|会员余额|余额|余额支付)$/u.test(normalized)) {
      return 'member_balance';
    }
    return normalized || 'unknown';
  }

  private paymentMethodLabel(method: string): string {
    return (
      (
        {
          cash: '现金',
          wechat: '微信',
          alipay: '支付宝',
          card: '银行卡',
          member_balance: '储值余额',
        } as Record<string, string>
      )[method] ?? method
    );
  }

  private resolveLimit(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, 100) : fallback;
  }

  private resolveDraftTimeWindow(question: string, rangeLabel: string) {
    const explicit = question
      .match(/(?:今天|明天|后天|本周|下周|周[一二三四五六日天])?(?:上午|下午|晚上|晚间|空档)/)?.[0]
      ?.trim();
    if (explicit) return explicit;
    return rangeLabel && !/全部|默认/.test(rangeLabel) ? rangeLabel : undefined;
  }

  private buildMarketingAutomationRulePreview(question: string) {
    if (
      /(?:消费|服务|护理).*(?:完成|结束|后).*(?:推荐).*(?:下一个|下一次|适合).*(?:项目|护理)|(?:推荐).*(?:下一个|下一次).*(?:项目|护理)/.test(
        question,
      )
    ) {
      return {
        type: 'post_service_next_project_recommendation',
        name: '消费完成后下一项目推荐',
        trigger: '客户完成有效服务或消费结算后',
        action: '结合已购项目、服务记录和当前可售项目创建下一项目推荐任务及可编辑话术草稿',
        guardrails: '先校验客户身份、过敏与禁忌、当前护理方案、项目状态和触达冷却；不自动发送、不自动下单',
      };
    }
    if (/45天.*没来|没来.*45天/.test(question)) {
      return {
        type: 'dormant_customer_follow_up',
        name: '客户 45 天未到店提醒',
        trigger: '客户连续 45 天没有完成到店或消费',
        action: '创建召回提醒任务和可编辑话术草稿',
        guardrails: '同一客户 30 天内最多触发 1 次，遵守退订和触达冷却，不自动发送',
      };
    }
    if (/(?:快过期|即将过期).*(?:次卡|卡项)|(?:次卡|卡项).*(?:快过期|即将过期)/.test(question)) {
      return {
        type: 'card_expiry',
        name: '卡项临期客户提醒',
        trigger: '有效卡项进入 30 天到期窗口且仍有剩余次数',
        action: '创建到期提醒任务和可编辑消息草稿',
        guardrails: '先校验卡状态、余次、客户授权和触达冷却，不自动发送或修改卡项',
      };
    }
    if (/新客.*(?:三天|3天)|(?:三天|3天)后.*跟进/.test(question)) {
      return {
        type: 'new_customer_follow_up',
        name: '新客到店 3 天后跟进',
        trigger: '客户首次到店完成后第 3 天',
        action: '创建前台或客服跟进任务草稿',
        guardrails: '同一客户 30 天内最多触发 1 次，不直接发送消息',
      };
    }
    return {
      type: 'customer_lifecycle',
      name: '客户生命周期自动跟进',
      trigger: '满足已配置且可审计的客户行为条件',
      action: '创建跟进或推荐任务草稿',
      guardrails: '不自动群发、不自动改权益、不跨门店触达',
    };
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
    const procurementBlocked =
      blocked.has('procurement_advice') && answer.metadata?.capabilityKey === 'inventory_procurement_advice';
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
    return /(?:高端|护理|套餐|项目).*(?:推广|推荐|适合|匹配).*(?:客户|客群)|(?:客户|客群).*(?:适合|匹配).*(?:高端|护理|套餐|项目)/.test(
      text,
    );
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
    const recommendations = (await this.marketing.getRecommendations(input.context.storeId, {
      limit: 20,
    })) as unknown as MarketingPackageRecommendation[];
    const recommendation = recommendations.find(
      (item) =>
        item?.triggerType === 'vip_privilege_care' ||
        item?.category === 'ltv-nurture' ||
        (Array.isArray(item?.recommendedItems) &&
          item.recommendedItems.some(
            (candidate) => candidate?.type === 'package' || /高端|护理|套餐/.test(String(candidate?.name ?? '')),
          )),
    );
    let audience: MarketingPackageAudienceProfile[] = [];
    let recommendationAudienceFallback = false;
    if (recommendation) {
      try {
        audience = (await this.marketing.getRecommendationAudience(
          Number(recommendation.id),
          input.context.storeId,
        )) as unknown as MarketingPackageAudienceProfile[];
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
    ]
      .filter((name, index, values) => values.indexOf(name) === index)
      .slice(0, 3);
    const customerCitation = audience.length
      ? {
          sourceType: 'db_skill',
          sourceId: `marketing_recommendation:${recommendation?.id}`,
          label: '营销高价值客户推荐受众',
        }
      : { sourceType: 'db_skill', sourceId: 'customer_value_fallback', label: '客户累计消费与到店次数初筛' };
    const citations = [
      customerCitation,
      ...(recommendation
        ? [
            {
              sourceType: 'db_skill',
              sourceId: `marketing_recommendation_card:${recommendation.id}`,
              label: '营销推荐卡与套餐建议',
            },
          ]
        : []),
      { sourceType: 'db_skill', sourceId: 'active_high_value_projects', label: '当前门店在售护理项目' },
    ];
    const customerLines = customers.length
      ? customers
          .map(
            (item, index) =>
              `${index + 1}. ${item.customerName}（${item.memberLevel}，累计消费 ${item.totalSpent.toFixed(2)} 元）：${item.matchReason}`,
          )
          .join('\n')
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
            ...(recommendationAudienceFallback
              ? ['推荐卡受众映射不可用，本次客户名单采用累计消费与到店次数降级口径。']
              : []),
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

  private async buildCustomerAnalyticsAnswer(
    input: BrainCapabilityExecutionInput,
    range: BrainDateRange,
  ): Promise<BrainDomainAnswer | undefined> {
    const question = input.question;
    const limit = this.resolveLimit(input.args.limit, 10);
    const timeMetadata = this.executionTimeRange(range, input.context.timezone);

    if (/(?:新客|新客户).*(?:第二次|二次).*(?:消费|复购)/.test(question)) {
      const result = await this.customerFacts.getRecentNewCustomerSecondPurchaseSummary({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
        limit,
      });
      const citationId = 'customer_new_cohort_second_purchase_facts';
      return this.answer({
        answer: `${range.label}新增客户 ${result.newCustomerCount} 人，其中 ${result.total} 人在该周期内完成了第二笔有效正金额订单。`,
        citationId,
        citationLabel: '新客建档与有效订单复购事实',
        blocks: [
          {
            kind: 'kpi',
            items: [
              { label: '新增客户', value: `${result.newCustomerCount} 人` },
              { label: '完成第二次消费', value: `${result.total} 人` },
            ],
            citationIds: [citationId],
          },
          {
            kind: 'table',
            rows: result.rows,
            columns: [
              'customerId',
              'customerName',
              'memberLevel',
              'createdAt',
              'secondPurchaseDate',
              'validOrderCount',
            ],
            citationIds: [citationId],
          },
          ...(result.rows.length
            ? []
            : [{ kind: 'limitations' as const, items: [`no_data:${range.label}没有新客完成第二笔有效正金额订单。`] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'new_customer_second_purchase',
          rangeLabel: range.label,
          definition: 'Customer.createdAt in range and at least two valid positive-net ProductOrder records in range',
          mappingOutputs: { customerIds: result.rows.map((row) => row.customerId) },
          ...timeMetadata,
        },
      });
    }

    if (
      /(?:买过|购买过|做过|体验过).*(?:客户).*(?:平均消费|客单价)|(?:项目|护理|疗程).*(?:客户).*(?:平均消费|客单价)/.test(
        question,
      )
    ) {
      const result = await this.customerFacts.getProjectBuyerAverageSpend({
        storeId: input.context.storeId,
        message: question,
        limit,
      });
      const citationId = 'customer_project_buyer_spend_facts';
      const projectLabel = result.projectName ?? '指定项目';
      const unresolved = !result.projectName;
      return this.answer({
        answer: unresolved
          ? '当前问题没有唯一匹配到本门店项目档案中的项目名称，请补充完整项目名后重试。'
          : `买过${projectLabel}的客户共 ${result.total} 人，这些客户的有效订单累计消费 ${result.totalSpend.toFixed(2)} 元，平均每位客户消费 ${result.averageSpendPerCustomer.toFixed(2)} 元。`,
        citationId,
        citationLabel: '项目购买客户与有效订单消费事实',
        blocks: [
          {
            kind: 'kpi',
            items: [
              { label: '项目客户数', value: `${result.total} 人` },
              { label: '客户平均消费', value: `${result.averageSpendPerCustomer.toFixed(2)} 元` },
              { label: '平均订单金额', value: `${result.averageOrderValue.toFixed(2)} 元` },
            ],
            citationIds: [citationId],
          },
          {
            kind: 'table',
            rows: result.rows,
            columns: ['customerId', 'customerName', 'memberLevel', 'validOrderCount', 'totalSpend'],
            citationIds: [citationId],
          },
          ...(result.rows.length
            ? []
            : [
                {
                  kind: 'limitations' as const,
                  items: [
                    unresolved
                      ? 'project_name_unresolved:没有从当前门店项目档案中解析到唯一项目名称。'
                      : `no_data:当前没有找到购买过${projectLabel}且存在有效正金额订单的客户。`,
                  ],
                },
              ]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'project_buyer_average_spend',
          projectName: result.projectName,
          customerCount: result.total,
          validOrderCount: result.validOrderCount,
          definition:
            'project buyer cohort from OrderItem.name; spend from all valid positive-net orders in current store',
          mappingOutputs: { customerIds: result.rows.map((row) => row.customerId) },
        },
      });
    }

    if (/(?:健康档案.*过敏|过敏.*健康档案)/.test(question)) {
      const result = await this.customerFacts.getCustomersWithAllergyHealthProfile(input.context.storeId, limit);
      const citationId = 'customer_health_profile_allergy_facts';
      return this.answer({
        answer: result.total
          ? `当前门店有 ${result.total} 位客户同时存在健康档案和明确过敏记录。`
          : '当前门店没有找到同时存在健康档案和明确过敏记录的客户。',
        citationId,
        citationLabel: '客户健康档案与过敏记录事实',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '有档案且标注过敏', value: `${result.total} 人` }],
            citationIds: [citationId],
          },
          {
            kind: 'table',
            rows: result.rows,
            columns: ['customerId', 'customerName', 'memberLevel', 'allergyRecord', 'skinType', 'lastCheck'],
            citationIds: [citationId],
          },
          ...(result.rows.length
            ? []
            : [{ kind: 'limitations' as const, items: ['no_data:没有命中同时具备健康档案和肯定性过敏记录的客户。'] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'health_profile_allergy_customers',
          definition:
            'CustomerHealthProfile exists and allergyHistory or Customer.hasAllergy contains a positive record',
          mappingOutputs: { customerIds: result.rows.map((row) => row.customerId) },
        },
      });
    }

    const memberLevels = this.customerMemberLevelsFromQuestion(question);
    if (memberLevels.length && /(?:没来|未到店|没到店|沉睡|不活跃|好久没来)/.test(question)) {
      const thresholdDays = this.customerInactivityThresholdDays(question, range, /沉睡/.test(question) ? 60 : 30);
      const result = await this.customerFacts.getInactiveMemberTierCustomers({
        storeId: input.context.storeId,
        memberLevels,
        thresholdDays,
        asOf: range.endDate,
        limit,
      });
      const citationId = 'customer_member_tier_inactivity_facts';
      const memberLabel = this.customerMemberLevelLabel(question, memberLevels);
      return this.answer({
        answer: `${memberLabel}中有 ${result.total} 位客户截至${range.endDate.toISOString().slice(0, 10)}已至少 ${thresholdDays} 天没有到店。`,
        citationId,
        citationLabel: '会员等级客户最近到店事实',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: `${memberLabel}未到店`, value: `${result.total} 人`, hint: `至少 ${thresholdDays} 天` }],
            citationIds: [citationId],
          },
          {
            kind: 'ranking',
            rows: result.rows,
            columns: ['customerId', 'customerName', 'memberLevel', 'totalSpent', 'lastVisitDate', 'inactiveDays'],
            citationIds: [citationId],
          },
          {
            kind: 'text',
            text: `统一口径：会员等级为${memberLevels.join('、')}，最后到店早于 ${thresholdDays} 天前或从未记录到店。`,
            citationIds: [citationId],
          },
          ...(result.rows.length
            ? []
            : [{ kind: 'limitations' as const, items: ['no_data:没有命中符合该会员等级和未到店阈值的客户。'] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'member_tier_inactive_customers',
          memberLevels,
          thresholdDays,
          mappingOutputs: { customerIds: result.rows.map((row) => row.customerId) },
          ...timeMetadata,
        },
      });
    }

    if (/(?:客户结构|会员等级|各等级).*(?:占比|比例|分布)/.test(question)) {
      const result = await this.customerFacts.getCustomerMemberLevelDistribution({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const citationId = 'customer_member_level_distribution_facts';
      const rows = result.rows.map((row) => ({
        memberLevel: row.memberLevel,
        customerCount: row.customerCount,
        share: `${(row.share * 100).toFixed(1)}%`,
      }));
      return this.answer({
        answer: `${range.label}有有效消费或实际到店的客户共 ${result.activeCustomerCount} 人，会员等级占比已按人数统计。`,
        citationId,
        citationLabel: '期间活跃客户会员等级分布事实',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '期间活跃客户', value: `${result.activeCustomerCount} 人` }],
            citationIds: [citationId],
          },
          {
            kind: 'ranking',
            rows,
            columns: ['memberLevel', 'customerCount', 'share'],
            citationIds: [citationId],
          },
          ...(rows.length
            ? []
            : [{ kind: 'limitations' as const, items: [`no_data:${range.label}没有有效消费或实际到店客户。`] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'customer_member_level_distribution',
          rangeLabel: range.label,
          definition: 'unique customers with positive valid order or governed arrived reservation in requested period',
          ...timeMetadata,
        },
      });
    }

    if (
      /(?:新客|新客户).*(?:老客|老客户).*(?:消费|实收|金额).*(?:对比|比较)|(?:对比|比较).*(?:新客|新客户).*(?:老客|老客户).*(?:消费|实收|金额)/.test(
        question,
      )
    ) {
      const result = await this.customerFacts.getNewReturningCustomerSpendComparison({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const newCustomers = result.rows.find((row) => row.customerType === '新客')!;
      const returningCustomers = result.rows.find((row) => row.customerType === '老客')!;
      const citationId = 'customer_new_returning_spend_comparison_facts';
      return this.answer({
        answer: `${range.label}新客消费 ${newCustomers.paidAmount.toFixed(2)} 元，老客消费 ${returningCustomers.paidAmount.toFixed(2)} 元，相差 ${(newCustomers.paidAmount - returningCustomers.paidAmount).toFixed(2)} 元。`,
        citationId,
        citationLabel: '新老客户有效订单消费事实',
        blocks: [
          {
            kind: 'comparison',
            items: [
              {
                label: '消费金额',
                current: `新客 ${newCustomers.paidAmount.toFixed(2)} 元`,
                previous: `老客 ${returningCustomers.paidAmount.toFixed(2)} 元`,
                delta: `${(newCustomers.paidAmount - returningCustomers.paidAmount).toFixed(2)} 元`,
              },
              {
                label: '消费客户数',
                current: `新客 ${newCustomers.customerCount} 人`,
                previous: `老客 ${returningCustomers.customerCount} 人`,
                delta: `${newCustomers.customerCount - returningCustomers.customerCount} 人`,
              },
            ],
            citationIds: [citationId],
          },
          {
            kind: 'table',
            rows: result.rows,
            columns: ['customerType', 'customerCount', 'validOrderCount', 'paidAmount', 'averageSpendPerCustomer'],
            citationIds: [citationId],
          },
          ...(result.rows.every((row) => row.validOrderCount === 0)
            ? [
                {
                  kind: 'limitations' as const,
                  items: [`no_data:${range.label}没有可用于新老客消费对比的有效正金额订单。`],
                },
              ]
            : []),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'new_returning_customer_spend_comparison',
          rangeLabel: range.label,
          newCustomerDefinition: 'Customer.createdAt within requested period',
          ...timeMetadata,
        },
      });
    }

    if (/(?:到店|来店).*(?:频次|次数).*(?:分布|结构)/.test(question)) {
      const result = await this.customerFacts.getCustomerVisitFrequencyDistribution({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const citationId = 'customer_visit_frequency_distribution_facts';
      const rows = result.rows.map((row) => ({
        visitFrequency: row.visitFrequency,
        customerCount: row.customerCount,
        share: `${(row.share * 100).toFixed(1)}%`,
      }));
      return this.answer({
        answer: `${range.label}实际到店客户 ${result.arrivedCustomerCount} 人，到店频次分布已按客户去重统计。`,
        citationId,
        citationLabel: '客户实际到店频次事实',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '实际到店客户', value: `${result.arrivedCustomerCount} 人` }],
            citationIds: [citationId],
          },
          {
            kind: 'table',
            rows,
            columns: ['visitFrequency', 'customerCount', 'share'],
            citationIds: [citationId],
          },
          ...(rows.length
            ? []
            : [{ kind: 'limitations' as const, items: [`no_data:${range.label}没有实际到店记录。`] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'customer_visit_frequency_distribution',
          rangeLabel: range.label,
          ...timeMetadata,
        },
      });
    }

    if (
      /(?:来源|渠道).*(?:客户质量|转化|消费).*(?:对比|比较)|(?:客户质量).*(?:来源|渠道)|(?:对比|比较).*(?:来源|渠道).*(?:客户质量|转化|消费)/.test(
        question,
      )
    ) {
      const result = await this.customerFacts.getCustomerSourceQualityComparison({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const citationId = 'customer_source_quality_comparison_facts';
      const rows = result.rows.map((row) => ({
        ...row,
        repeatCustomerShare: `${(row.repeatCustomerShare * 100).toFixed(1)}%`,
        paidAmount: row.paidAmount.toFixed(2),
        averageSpendPerCustomer: row.averageSpendPerCustomer.toFixed(2),
      }));
      return this.answer({
        answer: rows.length
          ? `${range.label}按客户来源比较有效消费质量，客均消费最高的是 ${rows[0]!.source}（${rows[0]!.averageSpendPerCustomer} 元）。`
          : `${range.label}没有可用于来源渠道质量比较的有效订单。`,
        citationId,
        citationLabel: '客户来源与有效订单消费质量事实',
        blocks: [
          {
            kind: 'ranking',
            rows,
            columns: [
              'source',
              'activeCustomerCount',
              'validOrderCount',
              'repeatCustomerCount',
              'repeatCustomerShare',
              'paidAmount',
              'averageSpendPerCustomer',
            ],
            citationIds: [citationId],
          },
          {
            kind: 'text',
            text: '统一口径：渠道质量按期间有效正金额订单的活跃客户数、复购客户占比、消费金额和客均消费比较，不推断渠道因果。',
            citationIds: [citationId],
          },
          ...(rows.length
            ? []
            : [{ kind: 'limitations' as const, items: [`no_data:${range.label}没有可比较的渠道消费事实。`] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'customer_source_quality_comparison',
          rangeLabel: range.label,
          ...timeMetadata,
        },
      });
    }

    if (/(?:高价值|高净值).*(?:没来|未到店|没到店|沉睡|不活跃|好久没来)/.test(question)) {
      const thresholdDays = this.customerInactivityThresholdDays(question, range, 30);
      const result = await this.customerFacts.getHighValueInactiveCustomers({
        storeId: input.context.storeId,
        thresholdDays,
        asOf: range.endDate,
        minimumTotalSpent: 5_000,
        limit,
      });
      const citationId = 'customer_high_value_inactivity_facts';
      return this.answer({
        answer: `按统一口径“累计消费不少于 ${result.minimumTotalSpent.toFixed(0)} 元”，有 ${result.total} 位高价值客户截至${range.endDate.toISOString().slice(0, 10)}已至少 ${thresholdDays} 天没有到店。`,
        citationId,
        citationLabel: '高价值客户消费与最近到店事实',
        blocks: [
          {
            kind: 'kpi',
            items: [{ label: '高价值未到店客户', value: `${result.total} 人`, hint: `至少 ${thresholdDays} 天` }],
            citationIds: [citationId],
          },
          {
            kind: 'ranking',
            rows: result.rows,
            columns: ['customerId', 'customerName', 'memberLevel', 'totalSpent', 'lastVisitDate', 'inactiveDays'],
            citationIds: [citationId],
          },
          {
            kind: 'text',
            text: `治理默认口径：累计消费不少于 ${result.minimumTotalSpent.toFixed(0)} 元，且至少 ${thresholdDays} 天未到店或无到店记录。`,
            citationIds: [citationId],
          },
          ...(result.rows.length
            ? []
            : [{ kind: 'limitations' as const, items: ['no_data:没有命中该高价值和未到店阈值的客户。'] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'high_value_inactive_customers',
          thresholdDays,
          minimumTotalSpent: result.minimumTotalSpent,
          mappingOutputs: { customerIds: result.rows.map((row) => row.customerId) },
          ...timeMetadata,
        },
      });
    }

    if (/(?:储值|会员).{0,4}余额.*(?:异常|偏高|过高|风险)|(?:异常|偏高|过高).*(?:储值|会员).{0,4}余额/.test(question)) {
      const result = await this.customerFacts.getHighStoredBalanceRiskCustomers({
        storeId: input.context.storeId,
        minimumBalance: 1_000,
        limit,
      });
      const citationId = 'customer_stored_balance_risk_facts';
      return this.answer({
        answer: `按治理默认阈值“活跃储值账户现金余额加赠送余额不少于 ${result.minimumBalance.toFixed(0)} 元”，当前有 ${result.total} 位客户余额偏高。`,
        citationId,
        citationLabel: '客户储值账户余额事实',
        blocks: [
          {
            kind: 'kpi',
            items: [
              { label: '余额偏高客户', value: `${result.total} 人` },
              { label: '治理默认阈值', value: `${result.minimumBalance.toFixed(0)} 元` },
            ],
            citationIds: [citationId],
          },
          {
            kind: 'ranking',
            rows: result.rows,
            columns: [
              'customerId',
              'customerName',
              'memberLevel',
              'cashBalance',
              'giftBalance',
              'totalBalance',
              'updatedAt',
            ],
            citationIds: [citationId],
          },
          {
            kind: 'text',
            text: `治理默认阈值：活跃储值账户的现金余额与赠送余额合计不低于 ${result.minimumBalance.toFixed(0)} 元；这是余额关注名单，不等同于长期未消耗风险。`,
            citationIds: [citationId],
          },
          ...(result.rows.length
            ? []
            : [{ kind: 'limitations' as const, items: ['no_data:当前没有储值余额达到治理默认阈值的客户。'] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'high_stored_balance_risk_customers',
          minimumBalance: result.minimumBalance,
          mappingOutputs: { customerIds: result.rows.map((row) => row.customerId) },
        },
      });
    }

    if (/消费.*(?:骤降|大幅下降|明显下降|下降很多|减少很多)|(?:骤降|大幅下降).*(?:消费)/.test(question)) {
      const result = await this.customerFacts.getCustomerConsumptionDeclineRanking({
        storeId: input.context.storeId,
        asOf: range.endDate,
        mode: /频率|频次|次数/.test(question) ? 'frequency' : 'amount',
        declineThreshold: 0.3,
        periodDays: 30,
        limit,
      });
      const citationId = 'customer_consumption_decline_facts';
      const rows = result.rows.map((row) => ({ ...row, declineRate: `${(row.declineRate * 100).toFixed(1)}%` }));
      return this.answer({
        answer: `按近 ${result.periodDays} 天对比前 ${result.periodDays} 天、下降至少 ${(result.declineThreshold * 100).toFixed(0)}% 的统一口径，发现 ${result.total} 位客户消费${result.mode === 'frequency' ? '频次' : '金额'}明显下降。`,
        citationId,
        citationLabel: '客户相邻周期有效订单消费事实',
        blocks: [
          {
            kind: 'kpi',
            items: [
              {
                label: `消费${result.mode === 'frequency' ? '频次' : '金额'}下降客户`,
                value: `${result.total} 人`,
                hint: `下降至少 ${(result.declineThreshold * 100).toFixed(0)}%`,
              },
            ],
            citationIds: [citationId],
          },
          {
            kind: 'ranking',
            rows,
            columns: [
              'customerId',
              'customerName',
              'memberLevel',
              'previousOrderCount',
              'currentOrderCount',
              'previousAmount',
              'currentAmount',
              'declineRate',
              'lastVisitDate',
            ],
            citationIds: [citationId],
          },
          {
            kind: 'text',
            text: `治理默认口径：近 ${result.periodDays} 天与前 ${result.periodDays} 天比较，下降比例至少 ${(result.declineThreshold * 100).toFixed(0)}%；频次模式要求前期至少 2 笔有效订单。`,
            citationIds: [citationId],
          },
          ...(rows.length ? [] : [{ kind: 'limitations' as const, items: ['no_data:没有客户达到消费下降关注阈值。'] }]),
        ],
        metadata: {
          capabilityKey: 'customer_facts',
          answerScope: 'customer_consumption_decline_ranking',
          mode: result.mode,
          declineThreshold: result.declineThreshold,
          periodDays: result.periodDays,
          mappingOutputs: { customerIds: result.rows.map((row) => row.customerId) },
          ...timeMetadata,
        },
      });
    }

    return undefined;
  }

  private customerMemberLevelsFromQuestion(question: string): string[] {
    if (/钻石会员|钻石卡/.test(question)) return ['钻石', '钻石会员'];
    if (/金卡会员|金卡/.test(question)) return ['金卡', '金卡会员'];
    if (/银卡会员|银卡/.test(question)) return ['银卡', '银卡会员'];
    if (/VIP会员|VIP/i.test(question)) return ['VIP', 'VIP会员'];
    if (/普通会员/.test(question)) return ['普通', '普通会员'];
    return [];
  }

  private customerMemberLevelLabel(question: string, levels: string[]): string {
    return question.match(/钻石会员|金卡会员|银卡会员|VIP会员|VIP|普通会员|钻石|金卡|银卡/i)?.[0] ?? levels.join('、');
  }

  private customerInactivityThresholdDays(question: string, range: BrainDateRange, fallback: number): number {
    const explicitDays = Number(question.match(/(?:最近|近)?\s*(\d+)\s*天/)?.[1]);
    if (Number.isFinite(explicitDays) && explicitDays > 0) return Math.min(3_650, Math.floor(explicitDays));
    if (/(?:最近|近)?三个月|一个季度|本季度|这个季度/.test(question)) return 90;
    if (/半年/.test(question)) return 180;
    if (/一年|今年/.test(question)) return 365;
    if (/上周|最近一周|近一周/.test(question)) return 7;
    const rangeDays = Math.ceil((range.endDate.getTime() - range.startDate.getTime()) / 86_400_000);
    return rangeDays > 1 && rangeDays <= 3_650 ? rangeDays : fallback;
  }

  private isCustomerPredictionQuestion(question: string) {
    return (
      isCustomerChurnPredictionQuestion(question) ||
      /(?:最可能复购|复购(?:概率|评分|可能性).*(?:最高|排行)|(?:最高|排行).*(?:复购概率|复购评分|复购可能性))/.test(
        question,
      ) ||
      /(?:营销触达|营销).*(?:响应度|响应评分).*(?:最高|排行)|(?:响应度|响应评分).*(?:最高|排行)/.test(question) ||
      /(?:预测|预估).*(?:12个月|十二个月).*(?:生命周期价值|LTV)|(?:12个月|十二个月).*(?:生命周期价值|LTV).*(?:预测|预估)/i.test(
        question,
      )
    );
  }

  private async buildCustomerPredictionAnswer(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    if (!this.predictionSkills) {
      const limitation = '客户预测读取服务未就绪，当前不能返回复购、营销响应或生命周期价值预测。';
      return {
        status: 'completed',
        answer: limitation,
        citations: [],
        grounding: 'none',
        blocks: [{ kind: 'limitations', items: [limitation] }],
        metadata: {
          capabilityKey: 'marketing_customer_segment',
          unsupportedReason: 'customer_prediction_service_unavailable',
        },
      };
    }
    const citationId = 'customer_prediction_snapshot_latest_completed';
    if (isCustomerChurnPredictionQuestion(input.question)) {
      const customerName =
        extractSpecificCustomerNameFromQuestion(input.question) ?? extractCustomerChurnPredictionName(input.question);
      const phoneTail = extractCustomerPhoneTail(input.question);
      const result = await this.predictionSkills.getLatestCustomerChurnPrediction({
        storeId: input.context.storeId,
        customerName,
        phoneTail,
      });
      if (result.status === 'ambiguous') {
        const question = `找到 ${result.candidates.length} 位匹配客户，请选择客户或补充手机号后四位后继续。`;
        return this.answer({
          answer: `${question}\n${result.candidates
            .map(
              (candidate, index) =>
                `${index + 1}. ${candidate.customerName}，手机 ${candidate.maskedPhone}，${candidate.memberLevel}`,
            )
            .join('\n')}\n${result.boundary}`,
          citationId: 'customer_churn_prediction_identity_candidates',
          citationLabel: `CustomerPredictionSnapshot 客户身份候选（PredictionRun #${result.predictionRun.id}，${result.predictionRun.modelVersion}）`,
          blocks: [
            {
              kind: 'text',
              text: `最新完成 CustomerPredictionSnapshot 预测批次 #${result.predictionRun.id} 中找到 ${result.candidates.length} 位“${customerName ?? '匹配客户'}”。身份未唯一确认前，本次不返回任何一位客户的 churnScore 或 churnLevel。`,
              citationIds: ['customer_churn_prediction_identity_candidates'],
            },
            {
              kind: 'table',
              rows: result.candidates,
              columns: ['customerName', 'maskedPhone', 'memberLevel'],
              citationIds: ['customer_churn_prediction_identity_candidates'],
            },
            {
              kind: 'clarification',
              question,
              options: customerIdentityClarificationOptions(result.candidates),
            },
            { kind: 'limitations', items: [result.boundary] },
          ],
          metadata: {
            capabilityKey: 'marketing_customer_segment',
            answerScope: 'customer_churn_prediction_identity_clarification',
            predictionRun: result.predictionRun,
            clarification: {
              questions: [question],
              missingSlots: ['entity'],
              ambiguities: result.candidates,
            },
            completion: { status: 'partial', missingCriteria: ['entity'], recoverable: true },
          },
        });
      }
      if (result.status === 'available') {
        const churnScore = predictionScorePercent(result.churnScore);
        const churnLevel = churnLevelLabel(result.churnLevel);
        return this.answer({
          answer: `${result.customerName}（手机 ${result.maskedPhone}）的流失风险评分为 ${churnScore}，风险等级为${churnLevel}。结果来自模型 ${result.modelVersion} 的最新完成预测批次 #${result.predictionRun.id}。${result.boundary}`,
          citationId,
          citationLabel: `CustomerPredictionSnapshot.churnScore/churnLevel（PredictionRun #${result.predictionRun.id}，${result.predictionRun.modelVersion}）`,
          blocks: [
            {
              kind: 'text',
              text: `预测来源：CustomerPredictionSnapshot #${result.snapshotId}；模型 ${result.modelVersion}；最新完成 PredictionRun #${result.predictionRun.id}；业务日期 ${result.predictionRun.businessDate ?? '未记录'}；快照生成时间 ${result.generatedAt}。`,
              citationIds: [citationId],
            },
            {
              kind: 'kpi',
              items: [
                {
                  label: `${result.customerName} 流失风险评分`,
                  value: churnScore,
                  hint: `风险等级：${churnLevel}`,
                },
              ],
              citationIds: [citationId],
            },
            { kind: 'limitations', items: [result.boundary] },
          ],
          metadata: {
            capabilityKey: 'marketing_customer_segment',
            answerScope: 'customer_churn_prediction',
            predictionMetric: 'churn',
            predictionRun: result.predictionRun,
            predictionSnapshotId: result.snapshotId,
            customerId: result.customerId,
            modelVersion: result.modelVersion,
            completionCriteria: [
              'latest_completed_prediction_run_loaded',
              'customer_identity_uniquely_matched',
              'churn_prediction_snapshot_loaded',
            ],
          },
        });
      }
      return this.answer({
        answer: result.boundary,
        citationId,
        citationLabel: '最新完成客户流失预测批次查询',
        blocks: [{ kind: 'limitations', items: [result.boundary] }],
        metadata: {
          capabilityKey: 'marketing_customer_segment',
          answerScope: 'customer_churn_prediction_unavailable',
          predictionRun: 'predictionRun' in result ? result.predictionRun : null,
          unsupportedReason: result.status,
        },
      });
    }
    if (/(?:12个月|十二个月).*(?:生命周期价值|LTV)|(?:生命周期价值|LTV).*(?:12个月|十二个月)/i.test(input.question)) {
      const customerName = extractSpecificCustomerNameFromQuestion(input.question);
      const phoneTail = extractCustomerPhoneTail(input.question);
      const result = await this.predictionSkills.getLatestCustomerLtv12m({
        storeId: input.context.storeId,
        customerName,
        phoneTail,
      });
      if (result.status === 'ambiguous') {
        const question = `找到 ${result.candidates.length} 位同名客户，请选择客户或补充手机号后四位后继续。`;
        return this.answer({
          answer: `${question}\n${result.candidates
            .map(
              (candidate, index) =>
                `${index + 1}. ${candidate.customerName}，手机 ${candidate.maskedPhone}，${candidate.memberLevel}`,
            )
            .join('\n')}\n${result.boundary}`,
          citationId: 'customer_prediction_identity_candidates',
          citationLabel: `CustomerPredictionSnapshot 客户身份候选（PredictionRun #${result.predictionRun.id}，${result.predictionRun.modelVersion}）`,
          blocks: [
            {
              kind: 'text',
              text: `最新完成 CustomerPredictionSnapshot 预测批次 #${result.predictionRun.id} 中找到 ${result.candidates.length} 位“${customerName ?? '同名客户'}”。由于身份尚未唯一确认，本次不返回任何一位客户的12个月生命周期价值预测值。`,
              citationIds: ['customer_prediction_identity_candidates'],
            },
            {
              kind: 'table',
              rows: result.candidates,
              columns: ['customerName', 'maskedPhone', 'memberLevel'],
              citationIds: ['customer_prediction_identity_candidates'],
            },
            {
              kind: 'clarification',
              question,
              options: customerIdentityClarificationOptions(result.candidates),
            },
            { kind: 'limitations', items: [result.boundary] },
          ],
          metadata: {
            capabilityKey: 'marketing_customer_segment',
            answerScope: 'customer_ltv12m_identity_clarification',
            predictionRun: result.predictionRun,
            clarification: {
              questions: [question],
              missingSlots: ['entity'],
              ambiguities: result.candidates,
            },
            completion: { status: 'partial', missingCriteria: ['entity'], recoverable: true },
          },
        });
      }
      if (result.status === 'available') {
        return this.answer({
          answer: `${result.customerName}（手机 ${result.maskedPhone}）的12个月生命周期价值预测为 ${result.ltv12m.toFixed(2)} 元，价值分层 ${result.ltvTier}。模型 ${result.predictionRun.modelVersion}，预测批次 #${result.predictionRun.id}。${result.boundary}`,
          citationId,
          citationLabel: `CustomerPredictionSnapshot.ltv12m（PredictionRun #${result.predictionRun.id}，${result.predictionRun.modelVersion}）`,
          blocks: [
            {
              kind: 'kpi',
              items: [
                {
                  label: `${result.customerName} 12个月生命周期价值预测`,
                  value: `${result.ltv12m.toFixed(2)} 元`,
                  hint: `价值分层 ${result.ltvTier}`,
                },
              ],
              citationIds: [citationId],
            },
            { kind: 'limitations', items: [result.boundary] },
          ],
          metadata: {
            capabilityKey: 'marketing_customer_segment',
            answerScope: 'customer_ltv12m_prediction',
            predictionRun: result.predictionRun,
            predictionSnapshotId: result.snapshotId,
            customerId: result.customerId,
          },
        });
      }
      return this.answer({
        answer: result.boundary,
        citationId,
        citationLabel: '最新完成客户预测批次查询',
        blocks: [{ kind: 'limitations', items: [result.boundary] }],
        metadata: {
          capabilityKey: 'marketing_customer_segment',
          answerScope: 'customer_ltv12m_prediction_unavailable',
          predictionRun: 'predictionRun' in result ? result.predictionRun : null,
          unsupportedReason: result.status,
        },
      });
    }

    const metric = /(?:营销触达|营销).*(?:响应度|响应评分)|(?:响应度|响应评分).*(?:营销触达|营销|客户)/.test(
      input.question,
    )
      ? ('marketingResponse' as const)
      : ('repurchase30d' as const);
    const result = await this.predictionSkills.rankLatestCustomerPredictions({
      storeId: input.context.storeId,
      metric,
      limit: this.resolveLimit(input.args.limit, 10),
    });
    if (result.status === 'missing') {
      return this.answer({
        answer: result.boundary,
        citationId,
        citationLabel: '当前门店已完成客户预测批次查询',
        blocks: [{ kind: 'limitations', items: [result.boundary] }],
        metadata: {
          capabilityKey: 'marketing_customer_segment',
          answerScope: 'customer_prediction_ranking_unavailable',
          unsupportedReason: 'completed_prediction_run_missing',
        },
      });
    }
    const scoreKey = metric === 'repurchase30d' ? 'repurchase30dScore' : 'marketingResponseScore';
    const scoreLabel = metric === 'repurchase30d' ? '30天复购评分' : '营销响应评分';
    const rows = result.rows.map((row) => ({
      rank: row.rank,
      customerName: row.customerName,
      maskedPhone: row.maskedPhone,
      [scoreKey]: row[scoreKey],
      ltv12m: row.ltv12m,
      ltvTier: row.ltvTier,
    }));
    const top = result.rows[0];
    const answer = top
      ? `${scoreLabel}最高的是 ${top.customerName}（手机 ${top.maskedPhone}），评分 ${top[scoreKey]}；共返回前 ${rows.length} 位客户。模型 ${result.predictionRun.modelVersion}，预测批次 #${result.predictionRun.id}。${result.boundary}`
      : `最新完成预测批次没有可展示的客户排行。${result.boundary}`;
    return this.answer({
      answer,
      citationId,
      citationLabel: `CustomerPredictionSnapshot.${scoreKey}（PredictionRun #${result.predictionRun.id}，${result.predictionRun.modelVersion}）`,
      blocks: [
        {
          kind: 'text',
          text:
            metric === 'repurchase30d'
              ? `预测口径：按最新完成 CustomerPredictionSnapshot 批次 #${result.predictionRun.id} 的 repurchase30dScore（未来30天复购评分）降序排列；它不是周末专属概率，本榜单仅作为本周末人工跟进参考。`
              : `预测口径：按最新完成 CustomerPredictionSnapshot 批次 #${result.predictionRun.id} 的 marketingResponseScore（营销触达响应评分）降序排列。`,
          citationIds: [citationId],
        },
        {
          kind: 'ranking',
          rows,
          columns: ['rank', 'customerName', 'maskedPhone', scoreKey, 'ltv12m', 'ltvTier'],
          citationIds: [citationId],
        },
        { kind: 'limitations', items: [result.boundary] },
      ],
      metadata: {
        capabilityKey: 'marketing_customer_segment',
        answerScope:
          metric === 'repurchase30d'
            ? 'customer_repurchase30d_prediction_ranking'
            : 'customer_marketing_response_prediction_ranking',
        predictionMetric: metric,
        predictionRun: result.predictionRun,
        completionCriteria: ['latest_completed_prediction_run_loaded', 'prediction_ranking_loaded'],
      },
    });
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
  return new Set(
    value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const definitionKey = (item as Record<string, unknown>).definitionKey;
      return typeof definitionKey === 'string' ? [definitionKey] : [];
    }),
  );
}

function isProjectMaterialCoverageQuestion(question: string): boolean {
  const normalized = question.replace(/\s+/gu, '');
  return (
    /(?:项目|护理|SPA|spa|管理|养护|修护|提拉|焕肤|清洁|舒缓|净透|淡斑)/u.test(normalized) &&
    /(?:库存|耗材|物料|材料|BOM|bom)/iu.test(normalized) &&
    /(?:销量|销售|服务量|服务次数|需求)/u.test(normalized) &&
    /(?:跟得上|跟不上|够不够|是否足够|够用|支撑|满足)/u.test(normalized)
  );
}

function isScalarOrderCountQuestion(question: string): boolean {
  const normalized = question.replace(/\s+/gu, '');
  if (/(?:趋势|走势|按日|每天|分布|对比|相比)/u.test(normalized)) return false;
  return /(?:(?:一共|总共|合计|共有|有)?多少笔订单|订单(?:一共|总共|合计|共有)?(?:有)?多少笔|订单数(?:量)?(?:一共|总共|合计|是|有)?多少)/u.test(
    normalized,
  );
}

function isActiveCardCatalogQuestion(question: string): boolean {
  const normalized = question.replace(/\s+/gu, '');
  return /(?:有哪些|哪些|有没有).*(?:\d+次卡|次卡|套餐卡).*(?:在售|可售|正在销售)|(?:在售|可售|正在销售).*(?:次卡|套餐卡)/u.test(
    normalized,
  );
}

function normalizeCardCatalogText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function normalizeProjectMaterialCoverageText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function isCustomerIdentityMatchClarification(answer: unknown): answer is BrainCustomerIdentityClarification {
  return (
    Boolean(answer) &&
    typeof answer === 'object' &&
    (answer as BrainCustomerIdentityClarification).kind === 'customer_identity_clarification' &&
    typeof (answer as BrainCustomerIdentityClarification).answer === 'string' &&
    Array.isArray((answer as BrainCustomerIdentityClarification).candidates)
  );
}

function isCustomerIdentityClarification(answer: unknown): answer is string {
  return (
    typeof answer === 'string' &&
    (answer.includes('请提供客户姓名或手机号后四位') ||
      (answer.includes('找到 ') && answer.includes('请补充完整姓名或手机号后四位后继续')))
  );
}

function customerIdentityClarificationOptions(
  candidates: Array<{ customerName: string; maskedPhone: string; memberLevel: string }>,
) {
  return candidates.map((candidate, index) => ({
    id: `customer-candidate-${index + 1}`,
    label: `${candidate.customerName}（${candidate.maskedPhone}，${candidate.memberLevel}）`,
    value: {
      slot: 'entity',
      candidate: `${candidate.customerName} 手机号后四位 ${candidate.maskedPhone.slice(-4)}`,
    },
  }));
}

function isCustomerChurnPredictionQuestion(question: string): boolean {
  return (
    /(?:预测|预估).*(?:流失风险|流失评分)/u.test(question) ||
    /(?:流失风险|流失评分).*(?:预测|预估|多高|多少)/u.test(question)
  );
}

function extractCustomerChurnPredictionName(question: string): string | undefined {
  const candidate = question
    .match(/(?:预测|预估)(?:一下|下)?(?:客户|顾客)?([\u3400-\u9fff·]{2,5}?)(?:的)?(?=流失(?:风险|评分))/u)?.[1]
    ?.trim();
  return candidate ? extractSpecificCustomerNameFromMention(candidate) : undefined;
}

function predictionScorePercent(score: number): string {
  const percentage = Math.max(0, Math.min(100, score > 1 ? score : score * 100));
  return `${Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1)}%`;
}

function churnLevelLabel(level: string): string {
  const normalized = level.trim().toLowerCase();
  if (normalized === 'high') return '高风险';
  if (normalized === 'medium' || normalized === 'moderate') return '中风险';
  if (normalized === 'low') return '低风险';
  return level.endsWith('风险') ? level : `${level}风险`;
}

function structuredDefinitionRef(value: unknown, definitionKey: string) {
  if (!Array.isArray(value)) return undefined;
  return value.find((item): item is { definitionKey: string; definitionVersion: number } => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return record.definitionKey === definitionKey && Number.isInteger(record.definitionVersion);
  });
}
