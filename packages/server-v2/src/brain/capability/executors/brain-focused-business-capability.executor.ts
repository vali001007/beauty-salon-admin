import { Injectable } from '@nestjs/common';
import { OperationProfitService } from '../../../operation-profit/operation-profit.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { BrainTimeRangeParserService, type BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { defaultBrainDateRange } from '../../domain/brain-domain-formatters.js';
import type { BrainDomainAnswer } from '../../domain/brain-domain-adapter.types.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type {
  BrainCapabilityExecutionInput,
  BrainCapabilityExecutor,
  BrainCapabilityToolArgs,
} from '../brain-capability-executor.registry.js';
import { BrainCapability } from '../brain-capability.decorator.js';
import { readCapabilityStructuredTime, structuredTimeUtcRange } from '../brain-capability-structured-args.js';

const CAPABILITY_KEYS = [
  'beautician_personal_performance',
  'project_margin_analysis',
  'project_material_consumption_analysis',
  'finance_material_cost_summary',
  'finance_staff_refund_rate_boundary',
  'finance_transaction_anomaly_review',
  'inventory_receipt_discrepancy_guidance',
  'marketing_campaign_cost_attribution_review',
] as const;

@Injectable()
export class BrainFocusedBusinessCapabilityExecutor implements BrainCapabilityExecutor {
  readonly kind = 'domain' as const;
  readonly capabilityKeys = CAPABILITY_KEYS;

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly operationProfit: OperationProfitService,
    private readonly prisma: PrismaService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
  ) {}

  @BrainCapability({
    key: 'beautician_personal_performance',
    name: '美容师个人业绩摘要',
    description:
      '仅基于当前登录美容师身份，返回指定时间范围内的服务客户数、完成服务数、关联业绩和个人提成。回答直接问数，不展开预约明细、客户隐私或全店员工排行。',
    intents: ['query'],
    examples: [
      '我这个月业绩是多少',
      '我今天已经做了几个客人，收入多少',
      '我本月提成和业绩分别多少',
      '我的提成这个月大概是多少',
    ],
    negativeExamples: ['查看其他美容师的业绩', '给员工业绩排行', '修改个人业绩或提成'],
    synonyms: ['我的业绩', '个人服务收入', '个人提成', '我做了几个客人'],
    businessDefinitionKeys: ['entity.beautician'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations', 'core:brain:beautician-view'],
    allowedRoles: ['beautician'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  beauticianPersonalPerformance(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('beautician_personal_performance', input);
  }

  @BrainCapability({
    key: 'project_margin_analysis',
    mappingOutputs: ['projectRanking'],
    name: '项目毛利与成本排行',
    description:
      '复用管理端项目毛利分析服务，按当前门店和时间范围返回项目服务收入及占比、实际或标准耗材成本、提成成本、贡献毛利、毛利率和成本缺口。支持项目收入占比、项目毛利情况、项目成本最高和项目毛利排行。',
    intents: ['query', 'ranking', 'diagnosis'],
    examples: [
      '帮我看一下各项目的毛利情况',
      '哪个项目的成本最高',
      '哪些项目毛利率最低',
      '有没有哪个项目的毛利异常低',
      '帮我统计一下这个月每个项目的收入占比',
    ],
    negativeExamples: ['查询商品毛利率', '修改项目价格', '自动下架低毛利项目'],
    synonyms: ['项目毛利', '项目成本排行', '服务项目利润', '项目贡献毛利'],
    businessDefinitionKeys: ['entity.project', 'dimension.projectName'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    allowedRoles: ['finance', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  projectMarginAnalysis(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('project_margin_analysis', input);
  }

  @BrainCapability({
    key: 'project_material_consumption_analysis',
    name: '项目实际耗材消耗覆盖分析',
    description:
      '读取当前门店项目 BOM 明细、标准 BOM 成本和已完成服务任务的 consumptionItems。指定项目“用到哪些耗材”或“BOM成本”直接查询 ProjectBomItem；实际消耗排行才核对服务任务 consumptionItems。缺少 actualQty 时明确返回数据质量缺口，不用商品出库排行冒充项目实际消耗。',
    intents: ['query', 'ranking'],
    examples: [
      '这个月哪个项目消耗耗材最多',
      '各项目实际用了多少耗材',
      '按项目看实际物料消耗',
      '这个月各项目的耗材成本各是多少',
      '帮我分析一下哪个项目的耗材成本最高',
      '胶原焕活提拉用到哪些耗材',
      '全身精油 SPA的BOM成本是多少',
    ],
    negativeExamples: ['查询商品出库排行', '直接扣减库存', '耗材成本占服务收入的比例', '全店耗材成本率是多少'],
    synonyms: ['项目耗材消耗', '项目实际用料', '服务耗材排行', '项目BOM', '项目耗材清单', '标准BOM成本'],
    businessDefinitionKeys: ['entity.project', 'entity.product'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations', 'core:inventory:stock'],
    allowedRoles: ['inventory', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  projectMaterialConsumptionAnalysis(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('project_material_consumption_analysis', input);
  }

  @BrainCapability({
    key: 'finance_material_cost_summary',
    name: '耗材成本问数摘要',
    description:
      '复用财务成本分析服务，返回当前门店指定时间范围的耗材成本金额及其占已接入收入的比例。不会把经营费用、采购金额或库存货值替代为耗材成本。',
    intents: ['query'],
    examples: ['这个月耗材成本占了多少', '本月物料成本是多少钱', '耗材成本占收入比例多少'],
    negativeExamples: ['经营费用是多少', '库存货值是多少', '创建采购单', '成本占收入的比例', '成本收入比'],
    synonyms: ['耗材成本', '物料成本', '材料成本占比', '耗材成本率'],
    businessDefinitionKeys: ['entity.product', 'metric.material_cost_rate'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    allowedRoles: ['finance', 'inventory', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  financeMaterialCostSummary(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('finance_material_cost_summary', input);
  }

  @BrainCapability({
    key: 'finance_staff_refund_rate_boundary',
    name: '美容师退款率归因边界',
    description:
      '核对指定时间范围内当前门店的有效退款记录数量，并检查是否存在稳定的退款到美容师归因口径。当前退款记录无法可靠归因到美容师时返回明确数据缺口，不用员工表现分、业绩或全店退款率替代。',
    intents: ['ranking', 'query'],
    examples: ['哪个美容师的退款率最高', '按美容师看退款率排行'],
    negativeExamples: ['哪个美容师业绩最好', '全店退款金额是多少', '自动处罚退款率高的员工'],
    synonyms: ['美容师退款率', '员工退款排行', '退款按员工归因'],
    businessDefinitionKeys: ['entity.beautician'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    allowedRoles: ['finance', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  financeStaffRefundRateBoundary(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('finance_staff_refund_rate_boundary', input);
  }

  @BrainCapability({
    key: 'finance_transaction_anomaly_review',
    name: '财务流水异常风险复核',
    description:
      '聚焦当前门店指定时间范围的退款、优惠和毛利风险信号，回答是否存在需要复核的财务异常。现有后台未发布逐笔异常流水判定规则时，必须明确只给聚合风险，不把普通流水标记为异常。',
    intents: ['diagnosis', 'query'],
    examples: ['这个月有没有不正常的流水', '本月财务流水有哪些异常风险', '有没有需要复核的退款和优惠风险'],
    negativeExamples: ['自动冻结异常订单', '认定某个员工舞弊', '修改支付流水'],
    synonyms: ['异常流水', '财务异常', '流水风险复核'],
    businessDefinitionKeys: ['entity.payment_record'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:finance:view'],
    allowedRoles: ['finance', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  financeTransactionAnomalyReview(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('finance_transaction_anomaly_review', input);
  }

  @BrainCapability({
    key: 'inventory_receipt_discrepancy_guidance',
    name: '采购到货差异处理建议',
    description:
      '针对到货商品、数量或明细与采购单不一致的情况，给出基于现有采购收货能力的风险处理建议。明确支持逐行部分收货，但当前后台没有独立差异索赔、退货或异常闭环时必须披露缺口；不自动入库。',
    intents: ['recommendation'],
    examples: ['有货品到了但和采购单不符，怎么处理', '到货数量和采购单对不上应该怎么办'],
    negativeExamples: ['直接确认全部入库', '查询低库存商品', '生成采购建议清单'],
    synonyms: ['采购到货差异', '收货不一致处理', '到货数量不符'],
    businessDefinitionKeys: ['entity.product'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:inventory:purchase'],
    allowedRoles: ['inventory', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  inventoryReceiptDiscrepancyGuidance(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('inventory_receipt_discrepancy_guidance', input);
  }

  @BrainCapability({
    key: 'marketing_campaign_cost_attribution_review',
    name: '营销活动成本与归因收入复核',
    description:
      '返回指定时间范围内已接入的营销触达、转化和归因收入，并明确核对营销活动成本事实是否存在。缺少活动成本时不计算花费或 ROI，也不返回客户优先级等无关明细。',
    intents: ['diagnosis', 'query'],
    examples: ['这个月活动花了多少钱，带来了多少收入', '本月营销活动成本和归因收入分别多少'],
    negativeExamples: ['生成营销活动方案', '筛选需要召回的客户', '立即发布活动'],
    synonyms: ['活动花费与收入', '营销成本归因复核', '活动投入产出数据'],
    businessDefinitionKeys: ['entity.customer'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:view'],
    allowedRoles: ['marketing', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  marketingCampaignCostAttributionReview(_args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('marketing_campaign_cost_attribution_review', input);
  }

  execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    if (!this.capabilityKeys.includes(input.card.key as (typeof CAPABILITY_KEYS)[number])) {
      throw new Error(`unsupported_focused_business_capability:${input.card.key}`);
    }
    return this.executeDeclared(input.card.key as (typeof CAPABILITY_KEYS)[number], input);
  }

  private async executeDeclared(
    capabilityKey: (typeof CAPABILITY_KEYS)[number],
    input: BrainCapabilityExecutionInput,
  ): Promise<BrainDomainAnswer> {
    const range = this.resolveRange(input);
    switch (capabilityKey) {
      case 'beautician_personal_performance': {
        const performance = await this.skillRuntime.buildBeauticianPersonalPerformance({
          storeId: input.context.storeId,
          userId: input.context.userId,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        const asksCustomerCount = /(?:几个|多少).*(?:客人|客户)|(?:客人|客户).*(?:几个|多少)/.test(input.question);
        const asksCommission = /提成/.test(input.question);
        const items = [
          ...(asksCustomerCount ? [{ label: '服务客户', value: `${performance.uniqueCustomerCount} 人` }] : []),
          { label: '个人服务业绩', value: `${performance.revenueAmount.toFixed(2)} 元` },
          ...(asksCommission ? [{ label: '个人提成', value: `${performance.commissionAmount.toFixed(2)} 元` }] : []),
        ];
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'beautician_personal_performance',
          label: '当前登录美容师个人服务与业绩',
        };
        return {
          status: 'completed',
          answer: `${range.label}${items.map((item) => `${item.label} ${item.value}`).join('，')}。`,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [{ kind: 'kpi', items, citationIds: [citation.sourceId] }],
          metadata: {
            capabilityKey,
            answerScope: 'beautician_personal_performance_scalar',
            identitySource: 'server_context_user',
            completionCriteria: ['personal_identity_bound', 'personal_performance_loaded'],
          },
        };
      }
      case 'project_margin_analysis': {
        const projectRange = this.resolveProjectOperatingRange(input, range);
        const result = await this.operationProfit.getProjectMargins({
          storeId: input.context.storeId,
          from: this.formatDate(projectRange.startDate, input.context.timezone),
          to: this.formatDate(projectRange.endDate, input.context.timezone),
          page: 1,
          pageSize: 100,
        });
        const asksHighestCost = /成本.*最高|最高.*成本/.test(input.question);
        const asksLowestMargin =
          /毛利(?:率)?.*(?:最低|最少|异常低|偏低|过低)|(?:最低|最少|异常低|偏低|过低).*(?:毛利|利润)/.test(
            input.question,
          );
        const asksLowMarginList = /(?:哪些|有哪些|列出).*(?:毛利|利润).*(?:低|过低)|(?:低毛利|毛利过低).*(?:项目)/.test(
          input.question,
        );
        const asksIncomeShare =
          /(?:各|每个).*(?:项目).*(?:收入|营收).*(?:占比|比例)|(?:项目).*(?:收入|营收).*(?:占比|比例)/.test(
            input.question,
          );
        const asksPopularButLowSales = /叫好不叫座/.test(input.question);
        const asksProjectRepurchase = /(?:项目|护理|SPA|spa).*(?:复购)|(?:复购).*(?:项目|护理|SPA|spa)/u.test(
          input.question,
        );
        const asksAverageOrderValueRecommendation =
          /(?:提升|提高).*(?:客单价).*(?:主推|推荐)|(?:主推|推荐).*(?:客单价)/.test(input.question);
        const asksSellThroughRisk = /卖不动|销量(?:太)?低|销售(?:太)?少/.test(input.question);
        const asksPriceAdvice = /(?:该不该|是否|要不要).*(?:调价)|(?:调价).*(?:建议|该不该|是否|要不要)/.test(
          input.question,
        );
        const asksZeroSales = /(?:长期)?零销量|(?:长期)?零销售|没有销量/.test(input.question);
        const completeResult =
          Number(result.total ?? result.items.length) > result.items.length
            ? await this.operationProfit.getProjectMargins({
                storeId: input.context.storeId,
                from: this.formatDate(projectRange.startDate, input.context.timezone),
                to: this.formatDate(projectRange.endDate, input.context.timezone),
                page: 1,
                pageSize: Number(result.total),
              })
            : result;
        const allRows = [...completeResult.items];
        const operatingRiskQuestion = asksLowMarginList || asksZeroSales;
        const activeProjectIds = operatingRiskQuestion
          ? new Set(
              (
                await this.prisma.project.findMany({
                  where: {
                    storeId: input.context.storeId,
                    deletedAt: null,
                    status: 'active',
                  },
                  select: { id: true },
                })
              ).map((project) => project.id),
            )
          : undefined;
        const operatingRows = activeProjectIds
          ? allRows.filter((item) => activeProjectIds.has(item.projectId))
          : allRows;
        const sourceRows = operatingRows.filter((item) => item.serviceCount > 0 || item.serviceIncome > 0);
        const specificProject = operatingRows
          .filter((item) => item.projectName && input.question.includes(item.projectName))
          .sort(
            (left, right) =>
              right.projectName.length - left.projectName.length ||
              left.projectName.localeCompare(right.projectName, 'zh-CN'),
          )[0];
        const totalServiceIncome = sourceRows.reduce((sum, item) => sum + item.serviceIncome, 0);
        const rowSource = asksZeroSales
          ? operatingRows.filter((item) => item.serviceCount <= 0 && item.serviceIncome <= 0)
          : asksLowMarginList
            ? sourceRows.filter((item) => item.marginRate < 0.3 && !item.missingCostReasons.length)
            : asksSellThroughRisk && specificProject
              ? [specificProject]
              : asksPriceAdvice && specificProject
                ? [specificProject]
                : sourceRows;
        const rows = rowSource
          .sort((left, right) => {
            if (asksHighestCost) {
              const leftCost = left.actualMaterialCost || left.standardMaterialCost;
              const rightCost = right.actualMaterialCost || right.standardMaterialCost;
              return rightCost - leftCost || right.serviceIncome - left.serviceIncome;
            }
            if (asksLowestMargin) return left.marginRate - right.marginRate || right.serviceIncome - left.serviceIncome;
            if (asksIncomeShare) return right.serviceIncome - left.serviceIncome;
            if (asksAverageOrderValueRecommendation) {
              const leftEligible = Number(left.contributionProfit > 0 && !left.missingCostReasons.length);
              const rightEligible = Number(right.contributionProfit > 0 && !right.missingCostReasons.length);
              return (
                rightEligible - leftEligible ||
                right.standardPrice - left.standardPrice ||
                right.contributionProfit - left.contributionProfit
              );
            }
            if (asksPopularButLowSales || asksSellThroughRisk) {
              return left.serviceCount - right.serviceCount || left.serviceIncome - right.serviceIncome;
            }
            return right.contributionProfit - left.contributionProfit || right.serviceIncome - left.serviceIncome;
          })
          .slice(0, this.resolveLimit(input.args.limit, 20))
          .map((item) => ({
            projectId: item.projectId,
            projectName: item.projectName,
            standardPrice: item.standardPrice,
            avgDealPrice: item.avgDealPrice,
            serviceCount: item.serviceCount,
            serviceIncome: item.serviceIncome,
            incomeShare:
              totalServiceIncome > 0 ? `${((item.serviceIncome / totalServiceIncome) * 100).toFixed(1)}%` : '0.0%',
            materialCost: item.actualMaterialCost || item.standardMaterialCost,
            commissionCost: item.commissionCost,
            contributionProfit: item.contributionProfit,
            marginRate: `${(item.marginRate * 100).toFixed(1)}%`,
            status: item.status,
            missingCostReasons: item.missingCostReasons.join(','),
          }));
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'operation_profit_project_margins',
          label: '管理端项目收入、耗材、提成与贡献毛利分析',
        };
        const first = rows[0];
        const preservesOperatingNarrative =
          asksProjectRepurchase ||
          asksPopularButLowSales ||
          asksAverageOrderValueRecommendation ||
          asksSellThroughRisk ||
          asksPriceAdvice ||
          asksZeroSales ||
          asksLowMarginList;
        const answer = asksProjectRepurchase
          ? specificProject
            ? `${projectRange.label}${specificProject.projectName}共有 ${specificProject.serviceCount} 次服务、项目收入 ${specificProject.serviceIncome.toFixed(2)} 元；但当前没有已发布的客户级重复购买分母与复购客户数，无法计算该项目复购率。Ami Brain 不会用服务次数或收入替代复购。`
            : `${projectRange.label}当前没有匹配到该护理项目的项目档案，也没有已发布的客户级项目复购口径，无法计算项目复购率。Ami Brain 不会用全店复购率或服务次数替代。`
          : asksPopularButLowSales
            ? first
              ? `${projectRange.label}当前没有已接入的项目评价、满意度或口碑数据，无法判断哪些项目“叫好”；仅按真实服务次数列出低销量项目供人工对照，其中销量最低的是 ${first.projectName}，共 ${first.serviceCount} 次。Ami Brain 不会把低销量直接说成叫好不叫座。`
              : `${projectRange.label}当前没有项目销量数据，也没有已接入的项目评价、满意度或口碑数据，无法判断“叫好不叫座”。`
            : asksAverageOrderValueRecommendation
              ? first
                ? `${projectRange.label}若目标是人工提升客单价，可优先评估 ${first.projectName}：标准价 ${first.standardPrice.toFixed(2)} 元、成交均价 ${first.avgDealPrice.toFixed(2)} 元、贡献毛利 ${first.contributionProfit.toFixed(2)} 元。建议先核对客户适配、成本缺口和档期；本次只提供经营候选，不执行推荐、调价或上架。`
                : `${projectRange.label}当前没有同时具备真实销量和可计算项目毛利的数据，无法形成可靠的客单价主推候选。`
              : asksSellThroughRisk
                ? first
                  ? `${projectRange.label}${first.projectName}服务 ${first.serviceCount} 次、收入 ${first.serviceIncome.toFixed(2)} 元、成交均价 ${first.avgDealPrice.toFixed(2)} 元、贡献毛利 ${first.contributionProfit.toFixed(2)} 元。是否“卖不动”仍应与同店其他项目和上一周期人工复核；本次不自动调价或下架。`
                  : `${projectRange.label}当前没有匹配到该项目的真实经营数据，无法判断是否卖不动。`
                : asksPriceAdvice
                  ? first
                    ? `${projectRange.label}${first.projectName}标准价 ${first.standardPrice.toFixed(2)} 元、成交均价 ${first.avgDealPrice.toFixed(2)} 元、服务 ${first.serviceCount} 次、毛利率 ${first.marginRate}。是否调价需结合成本完整性、客户反馈和竞品信息人工决策；本次不执行调价。`
                    : `${projectRange.label}当前没有匹配到该项目的价格、销量和毛利数据，无法形成调价建议；本次不会执行调价。`
                  : asksZeroSales
                    ? first
                      ? `${projectRange.label}发现 ${rows.length} 个零销量项目，包含 ${rows
                          .slice(0, 3)
                          .map((row) => row.projectName)
                          .join(
                            '、',
                          )}。这里的“零销量”仅指当前查询周期服务次数和收入均为 0，不自动推断为长期停销，也不执行下架。`
                      : `${projectRange.label}未发现服务次数和项目收入同时为 0 的项目。`
                    : asksLowMarginList
                      ? first
                        ? `${projectRange.label}发现 ${rows.length} 个毛利率低于 30% 且成本数据完整的项目，最低的是 ${first.projectName}，毛利率 ${first.marginRate}。成本缺失项目未被冒充为低毛利项目。`
                        : `${projectRange.label}未发现毛利率低于 30% 且成本数据完整的项目；成本缺失项目不纳入低毛利结论。`
                      : !first
                        ? `${projectRange.label}当前没有可计算的项目毛利数据。`
                        : asksHighestCost
                          ? `${projectRange.label}项目耗材成本最高的是 ${first.projectName}，成本 ${Number(first.materialCost).toFixed(2)} 元。`
                          : asksLowestMargin
                            ? `${projectRange.label}项目毛利率最低的是 ${first.projectName}，毛利率 ${first.marginRate}。`
                            : asksIncomeShare
                              ? `${projectRange.label}项目服务收入合计 ${totalServiceIncome.toFixed(2)} 元，占比最高的是 ${first.projectName}，占 ${first.incomeShare}。`
                              : `${projectRange.label}已返回 ${rows.length} 个项目的收入、耗材成本、提成成本和贡献毛利。`;
        return {
          status: 'completed',
          answer,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            ...(preservesOperatingNarrative ? [{ kind: 'text' as const, text: answer }] : []),
            {
              kind: 'ranking' as const,
              rows,
              columns: [
                'projectName',
                'standardPrice',
                'avgDealPrice',
                'serviceCount',
                'serviceIncome',
                'incomeShare',
                'materialCost',
                'commissionCost',
                'contributionProfit',
                'marginRate',
                'status',
              ],
              citationIds: [citation.sourceId],
            },
            ...(asksProjectRepurchase
              ? [
                  {
                    kind: 'limitations' as const,
                    items: ['当前没有已发布的客户级项目复购口径，不能用服务次数或全店复购率替代。'],
                  },
                ]
              : []),
            ...(asksPopularButLowSales
              ? [
                  {
                    kind: 'limitations' as const,
                    items: ['当前没有已接入的项目评价、满意度或口碑数据，只能展示销量供人工对照。'],
                  },
                ]
              : []),
          ],
          metadata: {
            capabilityKey,
            answerScope: asksProjectRepurchase
              ? 'project_repurchase_boundary'
              : asksPopularButLowSales
                ? 'project_reputation_sales_boundary'
                : asksAverageOrderValueRecommendation
                  ? 'project_average_order_value_candidates'
                  : asksSellThroughRisk
                    ? 'project_sell_through_review'
                    : asksPriceAdvice
                      ? 'project_price_review'
                      : asksZeroSales
                        ? 'project_zero_sales_review'
                        : asksLowMarginList
                          ? 'project_low_margin_review'
                          : asksIncomeShare
                            ? 'project_income_share_ranking'
                            : 'project_margin_ranking',
            actionWriteCount: 0,
            mappingOutputs: { projectRanking: rows },
            completionCriteria: asksIncomeShare
              ? ['project_income_loaded', 'project_income_share_calculated', 'project_income_ranked']
              : ['project_income_loaded', 'project_cost_loaded', 'project_margin_ranked'],
          },
        };
      }
      case 'project_material_consumption_analysis': {
        const projectBomAnswer = this.isSpecificProjectBomQuestion(input.question)
          ? await this.executeProjectBomQuestion(input)
          : undefined;
        if (projectBomAnswer) return projectBomAnswer;

        if (/(?:耗材|物料|材料)成本/.test(input.question)) {
          const result = await this.operationProfit.getProjectMargins({
            storeId: input.context.storeId,
            from: this.formatDate(range.startDate, input.context.timezone),
            to: this.formatDate(range.endDate, input.context.timezone),
            page: 1,
            pageSize: 100,
          });
          const rows = result.items
            .filter((item) => item.serviceCount > 0 || item.serviceIncome > 0)
            .map((item) => ({
              projectId: item.projectId,
              projectName: item.projectName,
              serviceCount: item.serviceCount,
              materialCost: item.actualMaterialCost || item.standardMaterialCost,
              costSource: item.actualMaterialCost > 0 ? 'actual' : 'standard_bom',
              status: item.status,
              missingCostReasons: item.missingCostReasons.join(','),
            }))
            .sort((left, right) => right.materialCost - left.materialCost)
            .slice(0, this.resolveLimit(input.args.limit, 20));
          const citation = {
            sourceType: 'db_skill',
            sourceId: 'operation_profit_project_material_costs',
            label: '管理端项目实际或标准耗材成本分析',
          };
          const standardFallbackCount = rows.filter((row) => row.costSource === 'standard_bom').length;
          const limitation = standardFallbackCount
            ? `${standardFallbackCount} 个项目没有可用的实际耗材成本，明确回退为标准 BOM 成本。`
            : undefined;
          return {
            status: 'completed',
            answer: rows.length
              ? `${range.label}已返回 ${rows.length} 个项目的耗材成本，最高的是 ${rows[0]!.projectName}，耗材成本 ${rows[0]!.materialCost.toFixed(2)} 元。${limitation ?? ''}`
              : `${range.label}没有可计算的项目耗材成本记录。`,
            citations: [citation],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'ranking',
                rows,
                columns: ['projectName', 'serviceCount', 'materialCost', 'costSource', 'status'],
                citationIds: [citation.sourceId],
              },
              ...(limitation ? [{ kind: 'limitations' as const, items: [limitation] }] : []),
            ],
            metadata: {
              capabilityKey,
              answerScope: 'project_material_cost_ranking',
              standardFallbackCount,
              completionCriteria: ['project_material_cost_loaded', 'cost_source_disclosed'],
            },
          };
        }
        const tasks = await this.prisma.serviceTask.findMany({
          where: {
            storeId: input.context.storeId,
            status: 'completed',
            completedAt: { gte: range.startDate, lte: range.endDate },
          },
          select: { id: true, projectId: true, consumptionItems: true, project: { select: { name: true } } },
        });
        const recordedItems = tasks.flatMap((task) =>
          this.actualConsumptionItems(task.consumptionItems).map((item) => ({
            ...item,
            projectId: task.projectId,
            projectName: task.project.name,
          })),
        );
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'service_task_actual_consumption_items',
          label: '已完成服务任务实际耗材记录',
        };
        if (!recordedItems.length) {
          const answer = `${range.label}完成服务 ${tasks.length} 单，但实际耗材数量采集覆盖为 0，无法判断哪个项目实际消耗耗材最多。Ami Brain 不会用标准 BOM 或商品出库排行替代实际消耗。`;
          return {
            status: 'completed',
            answer,
            citations: [citation],
            grounding: 'db_skill',
            blocks: [
              {
                kind: 'ranking',
                rows: [],
                columns: ['projectName', 'quantity', 'unit'],
                citationIds: [citation.sourceId],
              },
              { kind: 'limitations', items: ['no_data: project_actual_material_quantity_not_recorded', answer] },
            ],
            metadata: {
              capabilityKey,
              unsupportedReason: 'project_actual_material_quantity_not_recorded',
              completedTaskCount: tasks.length,
              recordedTaskCount: 0,
              completion: { status: 'complete', missingCriteria: [], recoverable: false },
            },
          };
        }
        const units = new Set(recordedItems.map((item) => item.unit));
        const aggregate = new Map<string, { projectId: number; projectName: string; quantity: number; unit: string }>();
        for (const item of recordedItems) {
          const key = `${item.projectId}:${item.unit}`;
          const current = aggregate.get(key) ?? {
            projectId: item.projectId,
            projectName: item.projectName,
            quantity: 0,
            unit: item.unit,
          };
          current.quantity += item.actualQty;
          aggregate.set(key, current);
        }
        const rows = [...aggregate.values()].sort((left, right) => right.quantity - left.quantity);
        const comparable = units.size === 1;
        const answer = comparable
          ? `${range.label}实际耗材数量最多的是 ${rows[0]!.projectName}，合计 ${rows[0]!.quantity.toFixed(2)} ${rows[0]!.unit}。`
          : `${range.label}已读取实际耗材记录，但包含 ${units.size} 种不可直接相加的单位，不能生成跨单位“消耗最多”排行。`;
        return {
          status: 'completed',
          answer,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            { kind: 'ranking', rows, columns: ['projectName', 'quantity', 'unit'], citationIds: [citation.sourceId] },
            ...(!comparable ? [{ kind: 'limitations' as const, items: [answer] }] : []),
          ],
          metadata: {
            capabilityKey,
            answerScope: 'project_actual_material_consumption',
            completedTaskCount: tasks.length,
            recordedItemCount: recordedItems.length,
            ...(comparable ? {} : { unsupportedReason: 'project_material_units_not_comparable' }),
            completionCriteria: ['completed_service_tasks_loaded', 'actual_consumption_coverage_disclosed'],
          },
        };
      }
      case 'finance_material_cost_summary': {
        const cost = await this.skillRuntime.buildFinanceCostAnalysis({
          storeId: input.context.storeId,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        const rate = cost.revenue > 0 ? cost.materialCost / cost.revenue : undefined;
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'finance_cost_analysis',
          label: '财务收入与耗材成本分析',
        };
        return {
          status: 'completed',
          answer: `${range.label}耗材成本 ${cost.materialCost.toFixed(2)} 元${rate === undefined ? '，当前缺少可计算占比的收入' : `，占已接入收入 ${(rate * 100).toFixed(1)}%`}。`,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '耗材成本', value: `${cost.materialCost.toFixed(2)} 元` },
                { label: '耗材成本占收入', value: rate === undefined ? '暂无' : `${(rate * 100).toFixed(1)}%` },
              ],
              citationIds: [citation.sourceId],
            },
          ],
          metadata: {
            capabilityKey,
            answerScope: 'material_cost_scalar',
            completionCriteria: ['material_cost_loaded', 'revenue_denominator_disclosed'],
          },
        };
      }
      case 'finance_staff_refund_rate_boundary': {
        const refundCount = await this.prisma.refundRecord.count({
          where: {
            refundedAt: { gte: range.startDate, lte: range.endDate },
            status: { notIn: ['cancelled', 'rejected'] },
            order: { storeId: input.context.storeId },
          },
        });
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'finance_staff_refund_attribution_gap',
          label: '退款记录与美容师归因能力检查',
        };
        const answer = `${range.label}当前门店有 ${refundCount} 笔有效退款记录，但退款记录没有稳定关联到责任美容师的统一业务口径，无法计算“美容师退款率排行”。Ami Brain 不会用员工表现分、业绩或全店退款率替代。`;
        return {
          status: 'completed',
          answer,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            { kind: 'ranking', rows: [], columns: ['beauticianName', 'refundRate'], citationIds: [citation.sourceId] },
            { kind: 'limitations', items: ['no_data: staff_refund_attribution_not_available', answer] },
          ],
          metadata: {
            capabilityKey,
            answerScope: 'staff_refund_rate_boundary',
            refundCount,
            unsupportedReason: 'staff_refund_attribution_not_available',
            completionCriteria: ['refund_records_counted', 'staff_attribution_gap_disclosed'],
          },
        };
      }
      case 'finance_transaction_anomaly_review': {
        const risk = await this.skillRuntime.buildFinanceRiskSummary({
          storeId: input.context.storeId,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'finance_risk_summary',
          label: '退款、优惠和毛利风险汇总',
        };
        const findings = risk.riskItems.map((item) => ({
          title: '聚合财务风险',
          detail: item,
          severity: 'warning' as const,
        }));
        const displayedFindings = findings.length
          ? findings
          : [
              {
                title: '当前未命中聚合风险',
                detail: `${range.label}未发现已接入规则命中的聚合财务风险。`,
                severity: 'info' as const,
              },
            ];
        const limitation =
          '当前后台未发布逐笔异常流水判定规则，本结果只能提示聚合风险，不能把某一笔普通流水直接标记为异常。';
        return {
          status: 'completed',
          answer: findings.length
            ? `${range.label}发现 ${findings.length} 项需要复核的聚合财务风险。${limitation}`
            : `${range.label}未发现已接入规则命中的聚合财务风险。${limitation}`,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            { kind: 'diagnosis' as const, findings: displayedFindings, citationIds: [citation.sourceId] },
            { kind: 'limitations', items: [limitation] },
          ],
          metadata: {
            capabilityKey,
            answerScope: 'finance_aggregate_anomaly_review',
            transactionLevelRuleAvailable: false,
            completionCriteria: ['aggregate_finance_risks_loaded', 'transaction_level_boundary_disclosed'],
          },
        };
      }
      case 'inventory_receipt_discrepancy_guidance': {
        const citation = {
          sourceType: 'template_skill',
          sourceId: 'inventory_receipt_discrepancy_advice',
          label: '采购逐行收货与入库约束',
        };
        const answer =
          '先不要确认整单收货。现有后台支持按采购发货明细逐行填写实际收货数量，可只接收一致部分，并保留未收数量；商品或数量不一致的明细需要人工复核采购单和供应商。当前后台没有独立的到货差异索赔、退货和责任闭环，本轮不会生成虚假的异常处理单，也不会自动入库。';
        return {
          status: 'completed',
          answer,
          citations: [citation],
          grounding: 'template_skill',
          blocks: [
            { kind: 'text', text: answer, citationIds: [citation.sourceId] },
            {
              kind: 'limitations',
              items: ['当前后台缺少到货差异索赔、退货和责任闭环；任何实际收货仍需用户核对并确认。'],
            },
          ],
          metadata: {
            capabilityKey,
            answerScope: 'inventory_receipt_discrepancy_guidance',
            deliveryStatus: 'guidance_only',
            completionCriteria: ['partial_receipt_boundary_disclosed', 'no_inventory_write'],
          },
        };
      }
      case 'marketing_campaign_cost_attribution_review': {
        const analytics = await this.skillRuntime.buildMarketingAnalytics({
          storeId: input.context.storeId,
          startDate: range.startDate,
          endDate: range.endDate,
        });
        const citation = {
          sourceType: 'db_skill',
          sourceId: 'marketing_campaign_cost_attribution_review',
          label: '营销触达、转化与归因收入',
        };
        const limitation = '当前后台没有统一的营销活动成本事实，因此无法回答活动花费或计算 ROI。';
        return {
          status: 'completed',
          answer: `${range.label}已归因收入 ${analytics.attributedRevenue.toFixed(2)} 元，触达 ${analytics.reachedCount} 人，转化 ${analytics.convertedCount} 人。${limitation}`,
          citations: [citation],
          grounding: 'db_skill',
          blocks: [
            {
              kind: 'kpi',
              items: [
                { label: '归因收入', value: `${analytics.attributedRevenue.toFixed(2)} 元` },
                { label: '营销活动成本', value: '未接入' },
              ],
              citationIds: [citation.sourceId],
            },
            {
              kind: 'diagnosis',
              findings: [{ title: '活动成本事实缺口', detail: limitation, severity: 'info' }],
              citationIds: [citation.sourceId],
            },
            { kind: 'limitations', items: [limitation] },
          ],
          metadata: {
            capabilityKey,
            answerScope: 'marketing_cost_attribution_review',
            campaignCostAvailable: false,
            completionCriteria: ['attributed_revenue_loaded', 'campaign_cost_gap_disclosed'],
          },
        };
      }
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
    return (
      this.timeRangeParser.parse(structuredTime?.label ?? structuredTime?.preset ?? input.question).range ??
      defaultBrainDateRange()
    );
  }

  private resolveProjectOperatingRange(input: BrainCapabilityExecutionInput, fallback: BrainDateRange): BrainDateRange {
    const parsed = this.timeRangeParser.parse(input.question);
    if (
      parsed.mentionedTime ||
      !/(?:叫好不叫座|复购|客单价|主推|卖不动|销量|调价|毛利过低|低毛利)/.test(input.question)
    ) {
      return fallback;
    }
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 89 * 86_400_000);
    return {
      label: '最近90天（治理默认）',
      startDate,
      endDate,
      granularity: 'day',
    };
  }

  private formatDate(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  private actualConsumptionItems(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      const actualQty = Number(row.actualQty);
      const unit = typeof row.unit === 'string' ? row.unit.trim() : '';
      const productName = typeof row.productName === 'string' ? row.productName.trim() : '';
      if (!Number.isFinite(actualQty) || actualQty <= 0 || !unit || !productName) return [];
      return [{ actualQty, unit, productName }];
    });
  }

  private resolveLimit(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.floor(parsed)) : fallback;
  }

  private isSpecificProjectBomQuestion(question: string) {
    const normalized = question.replace(/\s+/gu, '');
    const asksBomList =
      /(?:用到|需要|包含|配置|配了|有哪些).*(?:耗材|物料|材料|产品|商品)|(?:耗材|物料|材料|产品|商品).*(?:清单|有哪些|用到|需要)/u.test(
        normalized,
      );
    const asksBomCost =
      /(?:BOM|bom).*(?:成本|多少钱|金额|是多少)|(?:耗材|物料|材料).*(?:成本|多少钱|金额|是多少)/iu.test(normalized);
    const aggregateQuestion =
      /(?:各项目|每个项目|所有项目|全店|哪个项目|哪些项目|排行|排名|最高|最多|最低|实际消耗|消耗最多|消耗排行)/u.test(
        normalized,
      );
    return (asksBomList || asksBomCost) && !aggregateQuestion;
  }

  private async executeProjectBomQuestion(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    const projects = await this.prisma.project.findMany({
      where: { storeId: input.context.storeId, deletedAt: null },
      include: {
        bomItems: {
          where: { product: { storeId: input.context.storeId } },
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true, costPrice: true },
            },
          },
        },
      },
    });
    const project = this.findMentionedProject(input.question, projects);
    const citation = {
      sourceType: 'db',
      sourceId: 'project_bom_items',
      label: '管理端项目 BOM 明细',
    };
    if (!project) {
      return {
        status: 'completed',
        answer: '没有匹配到当前门店已维护的项目 BOM；Ami Brain 不会用实际耗材消耗或商品出库记录替代项目 BOM。',
        citations: [citation],
        grounding: 'db_skill',
        blocks: [
          {
            kind: 'table',
            rows: [],
            columns: ['productId', 'productName', 'standardQty', 'unit', 'unitCost', 'itemCost'],
            citationIds: [citation.sourceId],
          },
          {
            kind: 'limitations',
            items: ['no_data: project_bom_project_not_matched'],
          },
        ],
        metadata: {
          capabilityKey: 'project_material_consumption_analysis',
          answerScope: 'project_bom_items',
          unsupportedReason: 'project_bom_project_not_matched',
          completionCriteria: ['project_scope_checked', 'project_bom_not_substituted'],
        },
      };
    }
    const rows = [...(project.bomItems ?? [])]
      .map((item) => {
        const standardQty = this.toNumber(item.standardQty);
        const unitCost = this.toNumber(item.product?.costPrice);
        return {
          projectId: project.id,
          projectName: project.name,
          bomItemId: item.id,
          productId: item.productId,
          productName: item.product?.name ?? `商品#${item.productId}`,
          sku: item.product?.sku ?? '',
          standardQty,
          unit: item.unit || item.product?.unit || '',
          unitCost,
          itemCost: standardQty * unitCost,
        };
      })
      .sort((left, right) => left.productId - right.productId);
    const totalCost = rows.reduce((sum, item) => sum + item.itemCost, 0);
    const asksCost = /(?:BOM|bom|耗材|物料|材料).*(?:成本|多少钱|金额|是多少)/iu.test(
      input.question.replace(/\s+/gu, ''),
    );
    return {
      status: 'completed',
      answer: asksCost
        ? `${project.name} 的标准 BOM 成本是 ${totalCost.toFixed(2)} 元，基于 ${rows.length} 条 ProjectBomItem 汇总。`
        : `${project.name} 已维护 ${rows.length} 个 BOM 耗材：${rows.map((item) => item.productName).join('、') || '暂无'}。`,
      citations: [citation],
      grounding: 'db_skill',
      blocks: [
        ...(asksCost
          ? [
              {
                kind: 'kpi' as const,
                items: [
                  { label: 'BOM成本', value: `${totalCost.toFixed(2)} 元` },
                  { label: 'BOM耗材数', value: `${rows.length} 个` },
                ],
                citationIds: [citation.sourceId],
              },
            ]
          : []),
        {
          kind: 'table',
          rows,
          columns: ['productId', 'productName', 'standardQty', 'unit', 'unitCost', 'itemCost'],
          citationIds: [citation.sourceId],
        },
      ],
      metadata: {
        capabilityKey: 'project_material_consumption_analysis',
        answerScope: asksCost ? 'project_bom_cost_scalar' : 'project_bom_items',
        projectId: project.id,
        projectName: project.name,
        bomItemCount: rows.length,
        completionCriteria: ['project_bom_loaded', 'project_bom_cost_calculated'],
      },
    };
  }

  private findMentionedProject<T extends { name: string }>(question: string, projects: T[]): T | undefined {
    const normalizedQuestion = normalizeBusinessName(question);
    const matches = projects
      .map((project) => ({ project, normalizedName: normalizeBusinessName(project.name) }))
      .filter((item) => item.normalizedName.length >= 2 && normalizedQuestion.includes(item.normalizedName))
      .sort((left, right) => right.normalizedName.length - left.normalizedName.length);
    return matches[0]?.project;
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value) || 0;
    if (value && typeof value === 'object' && 'toString' in value) {
      const parsed = Number(value.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }
}

function normalizeBusinessName(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}
