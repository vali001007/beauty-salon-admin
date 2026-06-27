import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BusinessTaskPreParserService } from '../agent/business-task/business-task-preparser.service.js';
import type { BusinessTask } from '../agent/business-task/business-task.types.js';
import { QueryPlannerService } from '../semantic-query/query-planner.service.js';
import { SemanticQueryExecutorService } from '../semantic-query/semantic-query-executor.service.js';
import type { SemanticQueryResult } from '../semantic-query/query-plan.types.js';
import { formatBusinessDate, formatBusinessDateTime } from '../common/utils/business-time.js';
import { BUSINESS_QUERY_CAPABILITIES, getBusinessQueryCapability } from './business-query.capabilities.js';
import type {
  BusinessQueryCapabilityId,
  BusinessQueryContext,
  BusinessQueryDomain,
  BusinessQueryEvidence,
  BusinessQueryPlan,
  BusinessQueryResponse,
  BusinessQueryRole,
} from './business-query.types.js';

const DAY_MS = 86_400_000;
const PAID_ORDER_STATUSES = ['completed', 'paid', '已完成', '已付款'];
const CANCELLED_ORDER_STATUSES = ['cancelled', 'canceled', 'refunded', '已取消', '已退款'];

@Injectable()
export class BusinessQueryService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly queryPlanner?: QueryPlannerService,
    @Optional() private readonly semanticQueryExecutor?: SemanticQueryExecutorService,
    @Optional() private readonly preParser?: BusinessTaskPreParserService,
  ) {}

  capabilities(role?: BusinessQueryRole) {
    return BUSINESS_QUERY_CAPABILITIES.filter((item) => !role || item.allowedRoles.includes(role));
  }

  async ask(params: { question: string; storeId: number; role?: BusinessQueryRole; operatorId?: number; context?: BusinessQueryContext }) {
    const startedAt = Date.now();
    const role = params.role ?? 'manager';
    const unifiedQueryResponse = await this.tryUnifiedSemanticQueryFirst(params, role);
    if (unifiedQueryResponse) {
      await this.logAudit({
        queryPlan: unifiedQueryResponse.queryPlan,
        response: unifiedQueryResponse,
        operatorId: params.operatorId,
        storeId: params.storeId,
        latencyMs: Date.now() - startedAt,
      });
      return unifiedQueryResponse;
    }

    const queryPlan = this.resolve({
      question: params.question,
      storeId: params.storeId,
      role,
      operatorId: params.operatorId,
      context: params.context,
    });

    let response: BusinessQueryResponse;
    try {
      if (queryPlan.needClarification) {
        response = this.buildClarifyResponse(queryPlan);
      } else {
        const capability = getBusinessQueryCapability(queryPlan.capability);
        if (!capability?.implemented) {
          response = this.buildUnsupportedResponse(queryPlan);
        } else if (!capability.allowedRoles.includes(role)) {
          response = {
            requestId: queryPlan.requestId,
            status: 'unsupported',
            domain: queryPlan.domain,
            capability: queryPlan.capability,
            queryPlan,
            answer: `当前角色暂不能查询「${capability.name}」。`,
            evidence: this.emptyEvidence('权限校验未通过'),
            actions: [],
          } satisfies BusinessQueryResponse;
        } else {
          const semanticQueryResponse = await this.trySemanticQueryAdapter(params, queryPlan, role);
          if (semanticQueryResponse) {
            response = semanticQueryResponse;
          } else switch (queryPlan.capability) {
            case 'business_overview':
              response = await this.queryBusinessOverview(queryPlan);
              break;
            case 'product_sales_trend':
              response = await this.queryProductSalesTrend(queryPlan);
              break;
            case 'product_customer_distribution':
              response = await this.queryProductCustomerDistribution(queryPlan);
              break;
            case 'product_replenishment_opportunity':
              response = await this.queryProductReplenishmentOpportunity(queryPlan);
              break;
            case 'project_service_trend':
              response = await this.queryProjectServiceTrend(queryPlan);
              break;
            case 'project_material_margin':
              response = await this.queryProjectMaterialMargin(queryPlan);
              break;
            case 'customer_churn_risk':
              response = await this.queryCustomerChurnRisk(queryPlan);
              break;
            case 'customer_growth_opportunity':
              response = await this.queryCustomerGrowthOpportunity(queryPlan);
              break;
            case 'inventory_alert':
              response = await this.queryInventoryAlerts(queryPlan);
              break;
            case 'reservation_today':
              response = await this.queryTodayReservations(queryPlan);
              break;
            case 'schedule_utilization':
              response = await this.queryScheduleUtilization(queryPlan);
              break;
            case 'order_customer_consumption_list':
              response = await this.queryOrderCustomerConsumptionList(queryPlan);
              break;
            case 'order_revenue_analysis':
              response = await this.queryOrderRevenue(queryPlan);
              break;
            case 'card_expiry_risk':
              response = await this.queryCardExpiryRisk(queryPlan);
              break;
            case 'card_usage_analysis':
              response = await this.queryCardUsageAnalysis(queryPlan);
              break;
            case 'member_balance_analysis':
              response = await this.queryMemberBalanceAnalysis(queryPlan);
              break;
            case 'finance_cashflow_summary':
              response = await this.queryFinanceCashflowSummary(queryPlan);
              break;
            case 'marketing_conversion':
              response = await this.queryMarketingConversion(queryPlan);
              break;
            case 'automation_execution_summary':
              response = await this.queryAutomationExecutionSummary(queryPlan);
              break;
            case 'supplier_purchase_advice':
              response = await this.querySupplierPurchaseAdvice(queryPlan);
              break;
            case 'business_anomaly_alert':
              response = await this.queryBusinessAnomalyAlert(queryPlan);
              break;
            case 'multi_store_comparison':
              response = await this.queryMultiStoreComparison(queryPlan);
              break;
            case 'staff_performance':
              response = await this.queryStaffPerformance(queryPlan);
              break;
            case 'terminal_health_diagnosis':
              response = await this.queryTerminalHealthDiagnosis(queryPlan);
              break;
            default:
              response = this.buildUnsupportedResponse(queryPlan);
          }
        }
      }
      await this.logAudit({ queryPlan, response, operatorId: params.operatorId, storeId: params.storeId, latencyMs: Date.now() - startedAt });
      return response;
    } catch (error) {
      await this.logAudit({
        queryPlan,
        response: undefined,
        operatorId: params.operatorId,
        storeId: params.storeId,
        latencyMs: Date.now() - startedAt,
        status: 'failed',
        error,
      });
      throw error;
    }
  }

  private async tryUnifiedSemanticQueryFirst(
    params: { question: string; storeId: number; role?: BusinessQueryRole; operatorId?: number; context?: BusinessQueryContext },
    role: BusinessQueryRole,
  ): Promise<BusinessQueryResponse | null> {
    if (!this.queryPlanner || !this.semanticQueryExecutor || !this.preParser) return null;
    const preParsed = this.preParser.parse({ message: params.question, role, context: params.context as Record<string, unknown> | undefined });
    const task = preParsed.task;
    if (task.domain === 'unknown' || task.taskType === 'clarify' || !task.metrics.length) return null;
    if (task.requiresApproval || task.riskLevel !== 'low') return null;

    const queryPlan = this.businessQueryPlanFromBusinessTask(task, params, role);
    const capability = getBusinessQueryCapability(queryPlan.capability);
    if (!capability?.implemented || !capability.allowedRoles.includes(role)) {
      return null;
    }
    const planned = this.queryPlanner.plan({
      task: {
        ...task,
        filters: { ...task.filters, storeId: params.storeId, operatorId: params.operatorId },
        actorRole: role,
      },
      role,
      storeId: params.storeId,
      operatorId: params.operatorId,
      capabilityId: this.mapBusinessQueryCapabilityToUnifiedCapability(queryPlan.capability),
    });
    if (!planned.plan) {
      return {
        requestId: queryPlan.requestId,
        status: 'unsupported',
        domain: queryPlan.domain,
        capability: queryPlan.capability,
        queryPlan,
        answer: planned.rejectedReason ?? '该查询暂不支持。',
        evidence: this.emptyEvidence(planned.rejectedReason ?? '查询计划未通过安全校验'),
        actions: [],
      };
    }

    const result = await this.semanticQueryExecutor.execute(planned.plan);
    return this.fromSemanticQueryResult(queryPlan, result);
  }

  private businessQueryPlanFromBusinessTask(
    task: BusinessTask,
    params: { question: string; storeId: number; role?: BusinessQueryRole; operatorId?: number; context?: BusinessQueryContext },
    role: BusinessQueryRole,
  ): BusinessQueryPlan {
    const capability = this.capabilityFromBusinessTask(task);
    const domain = capability === 'order_customer_consumption_list' ? 'order' : this.businessQueryDomainFromTaskDomain(task.domain);
    const dateRange =
      task.timeRange?.preset === 'custom' && task.timeRange.startDate && task.timeRange.endDate
        ? {
            type: 'custom',
            start: task.timeRange.startDate,
            end: task.timeRange.endDate,
          }
        : this.resolveDateRange(this.normalize(params.question), capability);
    return {
      requestId: `bq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      originalQuestion: params.question,
      domain,
      capability,
      intent: 'query',
      metrics: task.metrics,
      dimensions: task.entities.map((entity) => entity.type).filter((item) => item !== 'metric'),
      filters: {
        ...task.filters,
        storeId: params.storeId,
        operatorId: params.operatorId,
        dateRange,
      },
      sort: task.sort?.[0],
      limit: task.limit ?? this.getDefaultLimit(capability),
      needClarification: false,
      clarificationQuestion: null,
    };
  }

  private capabilityFromBusinessTask(task: BusinessTask): BusinessQueryCapabilityId {
    const text = this.normalize(task.objective);
    if (this.isOrderCustomerConsumptionListRequest(text)) return 'order_customer_consumption_list';
    const metrics = new Set(task.metrics);
    if (metrics.has('follow_up_priority_score') || metrics.has('churn_risk_score') || metrics.has('repurchase_opportunity_score')) return 'customer_growth_opportunity';
    if (metrics.has('product_sales_quantity') || metrics.has('product_sales_amount') || metrics.has('product_sales_growth')) return 'product_sales_trend';
    if (metrics.has('project_service_count') || metrics.has('project_service_growth')) return 'project_service_trend';
    if (metrics.has('stock_risk_score')) return 'inventory_alert';
    if (metrics.has('reservation_count') || metrics.has('arrival_rate') || metrics.has('reservation_arrival_rate')) return 'reservation_today';
    if (metrics.has('staff_performance_score')) return 'staff_performance';
    if (metrics.has('card_expiry_risk')) return 'card_expiry_risk';
    if (metrics.has('card_usage_times')) return 'card_usage_analysis';
    if (metrics.has('member_balance')) return 'member_balance_analysis';
    if (metrics.has('campaign_conversion_rate')) return 'marketing_conversion';
    if (metrics.has('paid_amount') || metrics.has('revenue') || metrics.has('net_revenue') || metrics.has('order_count') || metrics.has('average_order_value')) return 'order_revenue_analysis';
    return this.legacyDetectCapability(text, this.businessQueryDomainFromTaskDomain(task.domain));
  }

  private businessQueryDomainFromTaskDomain(domain: BusinessTask['domain']): BusinessQueryDomain {
    const allowed: BusinessQueryDomain[] = [
      'business',
      'product',
      'project',
      'customer',
      'inventory',
      'reservation',
      'schedule',
      'order',
      'card',
      'memberCard',
      'finance',
      'marketing',
      'store',
      'supplyChain',
      'staff',
      'automation',
      'terminal',
      'unknown',
    ];
    return allowed.includes(domain as BusinessQueryDomain) ? (domain as BusinessQueryDomain) : 'unknown';
  }

  resolve(params: { question: string; storeId: number; role: BusinessQueryRole; operatorId?: number; context?: BusinessQueryContext }): BusinessQueryPlan {
    const parsed = this.preParser?.parse({
      message: params.question,
      role: params.role,
      context: params.context as Record<string, unknown> | undefined,
    });
    if (parsed && parsed.task.domain !== 'unknown' && parsed.task.taskType !== 'clarify' && parsed.task.metrics.length) {
      return this.businessQueryPlanFromBusinessTask(parsed.task, params, params.role);
    }
    return this.legacyResolve(params);
  }

  private legacyResolve(params: { question: string; storeId: number; role: BusinessQueryRole; operatorId?: number; context?: BusinessQueryContext }): BusinessQueryPlan {
    const text = this.normalize(params.question);
    const domain = this.legacyDetectDomain(text);
    const contextualCapability = this.detectContextualCapability(text, params.context);
    const capability = contextualCapability ?? this.legacyDetectCapability(text, domain);
    const limit = this.getDefaultLimit(capability);
    const requestId = `bq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const dateRange = this.resolveDateRange(text, capability);
    const contextProductIds = this.extractContextProductIds(params.context);
    const resolvedDomain = contextualCapability === 'product_customer_distribution' ? 'product' : contextualCapability === 'inventory_alert' ? 'inventory' : domain;

    if (capability === 'unsupported' || resolvedDomain === 'unknown') {
      return {
        requestId,
        originalQuestion: params.question,
        domain: resolvedDomain,
        capability: 'unsupported',
        intent: 'clarify',
        metrics: [],
        dimensions: [],
        filters: { storeId: params.storeId, role: params.role },
        limit,
        needClarification: true,
        clarificationQuestion: this.getClarificationQuestion(text),
      };
    }

    return {
      requestId,
      originalQuestion: params.question,
      domain: resolvedDomain,
      capability,
      intent: 'query',
      metrics: this.metricsForCapability(capability),
      dimensions: this.dimensionsForCapability(capability),
      filters: {
        storeId: params.storeId,
        role: params.role,
        operatorId: params.operatorId,
        contextProductIds,
        contextCapability: params.context?.previousResponse?.capability,
        dateRange,
        status: PAID_ORDER_STATUSES,
      },
      sort: this.sortForCapability(capability),
      limit,
      needClarification: false,
      clarificationQuestion: null,
    };
  }

  private normalize(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private isOrderCustomerConsumptionListRequest(text: string) {
    if (/小程序|ami glow|客户端|会员端|渠道|来源|投放|引流|退款|退费|售后|门店|多店|分店/.test(text)) return false;
    const hasConsumptionSignal = /消费|成交|订单|流水|付款|支付|购买|买过|买单|收银/.test(text);
    const hasListSignal = /名单|清单|明细|列出|列一下|有哪些|哪些|哪几位|哪几个|谁/.test(text);
    const hasCustomerObject = /客户|会员|顾客/.test(text);
    const hasCompoundObject = /消费客户|成交会员|成交客户|流水客户|消费会员|购买客户|购买会员/.test(text);
    return hasConsumptionSignal && (hasCompoundObject || (hasCustomerObject && hasListSignal));
  }

  private legacyDetectDomain(text: string): BusinessQueryDomain {
    if (this.isOrderCustomerConsumptionListRequest(text)) return 'order';
    const hasProduct = /商品|产品|sku|零售品|销量|销售量|热销|卖得好|卖的好/.test(text);
    const hasInventory = /库存|低库存|缺货|补货|临期|过期|批次|周转/.test(text);
    if (hasInventory) return 'inventory';
    if (hasProduct) return 'product';
    if (/项目|护理|服务次数|疗程|加项/.test(text)) return 'project';
    if (/次卡|卡项|疗程卡|核销|剩余次数|到期/.test(text)) return 'card';
    if (/会员卡|储值|余额|充值|沉淀资金/.test(text)) return 'memberCard';
    if (/客户|会员|顾客|流失|沉睡|复购|回访|高价值|老客|新客/.test(text)) return 'customer';
    if (/排班|班次|谁有空|忙闲|请假|美容师忙/.test(text)) return 'schedule';
    if (/预约|到店|未到店|爽约|空位/.test(text)) return 'reservation';
    if (/门店|多店|多门店|排名|区域/.test(text)) return 'store';
    if (/订单|收入|营收|营业额|流水|客单价|支付方式|退款|未收款/.test(text)) return 'order';
    if (/财务|实收|结算|费用|利润|roi|对账/.test(text)) return 'finance';
    if (/营销|活动|优惠券|触达|转化|归因/.test(text)) return 'marketing';
    if (/员工|店员|顾问|美容师|人员/.test(text) && /表现|业绩|绩效|提成|服务质量|优秀|较好|成交|销售|贡献|排行|排名/.test(text)) return 'staff';
    if (/员工|提成|绩效|服务质量/.test(text)) return 'staff';
    if (/终端|设备|平板|打印机|扫码器|摄像头|会话|对话|设备认证|认证令牌|重复刷新|接口失败|网络异常/.test(text)) return 'terminal';
    if (/供应商|采购|入库|调拨|供应链/.test(text)) return 'supplyChain';
    if (/经营|概览|今天怎么样|情况|异常|风险|预警/.test(text)) return 'business';
    if (/自动化|提醒|执行|任务/.test(text)) return 'automation';
    return 'unknown';
  }

  private legacyDetectCapability(text: string, domain: BusinessQueryDomain): BusinessQueryCapabilityId {
    if (this.isOrderCustomerConsumptionListRequest(text)) return 'order_customer_consumption_list';
    if (domain === 'automation') return 'automation_execution_summary';
    if (domain === 'inventory' && /补货|采购|够不够|够吗|机会|建议/.test(text)) return 'product_replenishment_opportunity';
    if (domain === 'inventory') return 'inventory_alert';
    if (domain === 'product' && /销量|销售量|销售额|增长|热销|排行|卖得好|卖的好/.test(text)) return 'product_sales_trend';
    if (domain === 'customer' && /流失|沉睡|很久|没来|未到店|唤醒/.test(text)) return 'customer_churn_risk';
    if (domain === 'customer') return 'customer_growth_opportunity';
    if (domain === 'reservation') return 'reservation_today';
    if (domain === 'order' || (domain === 'business' && /收入|营收|营业额|订单|流水/.test(text))) {
      return 'order_revenue_analysis';
    }
    if (domain === 'business' && /异常|提醒|风险|预警/.test(text)) return 'business_anomaly_alert';
    if (domain === 'business') return 'business_overview';
    if (domain === 'project' && /耗材|成本|毛利|利润/.test(text)) return 'project_material_margin';
    if (domain === 'project') return 'project_service_trend';
    if (domain === 'card') return /核销/.test(text) ? 'card_usage_analysis' : 'card_expiry_risk';
    if (domain === 'memberCard') return 'member_balance_analysis';
    if (domain === 'finance') return 'finance_cashflow_summary';
    if (domain === 'marketing') return 'marketing_conversion';
    if (domain === 'schedule') return 'schedule_utilization';
    if (domain === 'staff') return 'staff_performance';
    if (domain === 'terminal') return 'terminal_health_diagnosis';
    if (domain === 'supplyChain') return 'supplier_purchase_advice';
    if (domain === 'store') return 'multi_store_comparison';
    return 'unsupported';
  }

  private detectContextualCapability(text: string, context?: BusinessQueryContext): BusinessQueryCapabilityId | null {
    const productIds = this.extractContextProductIds(context);
    if (!productIds.length) return null;
    const previousCapability = String(context?.previousResponse?.capability || '');
    if (previousCapability !== 'product_sales_trend') return null;
    const hasReference = /这些|上述|上面|它们|他们|该批|这批/.test(text);
    if (/库存|够不够|够吗|缺货|补货/.test(text)) return 'inventory_alert';
    if (/客户|顾客|会员|谁买|哪些人买|买的/.test(text)) return 'product_customer_distribution';
    if (!hasReference) return null;
    return null;
  }

  private extractContextProductIds(context?: BusinessQueryContext) {
    const items = context?.previousResponse?.card?.items;
    if (!Array.isArray(items)) return [];
    return [
      ...new Set(
        items
          .map((item) => Number((item as Record<string, unknown>).productId))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ].slice(0, 20);
  }

  private getDefaultLimit(capability: BusinessQueryCapabilityId) {
    return getBusinessQueryCapability(capability)?.resultLimit ?? 10;
  }

  private resolveDateRange(text: string, capability: BusinessQueryCapabilityId) {
    const now = new Date();
    const today = this.startOfDay(now);
    if (capability === 'card_expiry_risk') {
      const end = new Date(today.getTime() + 30 * DAY_MS);
      return { type: 'next_30_days', start: today.toISOString(), end: end.toISOString() };
    }
    if (/本月/.test(text)) return { type: 'month_to_date', start: this.startOfMonth(now).toISOString(), end: now.toISOString() };
    if (/上周|上星期/.test(text)) {
      const thisWeekStart = this.startOfWeek(now);
      const start = new Date(thisWeekStart.getTime() - 7 * DAY_MS);
      return { type: 'last_week', start: start.toISOString(), end: thisWeekStart.toISOString() };
    }
    if (/昨天/.test(text)) {
      const start = new Date(today.getTime() - DAY_MS);
      return { type: 'yesterday', start: start.toISOString(), end: today.toISOString() };
    }
    if (/今天|今日/.test(text) || capability === 'reservation_today' || capability === 'order_revenue_analysis') {
      return { type: 'today', start: today.toISOString(), end: now.toISOString() };
    }
    const currentStart = new Date(now.getTime() - 30 * DAY_MS);
    const compareStart = new Date(currentStart.getTime() - 30 * DAY_MS);
    return {
      type: 'last_30_days',
      start: currentStart.toISOString(),
      end: now.toISOString(),
      compareStart: compareStart.toISOString(),
      compareEnd: currentStart.toISOString(),
    };
  }

  private metricsForCapability(capability: BusinessQueryCapabilityId) {
    const map: Partial<Record<BusinessQueryCapabilityId, string[]>> = {
      business_overview: ['salesAmount', 'orderCount', 'reservationCount', 'lowStockCount', 'churnRiskCount'],
      product_sales_trend: ['quantity', 'salesAmount', 'growthRate', 'orderCount', 'customerCount'],
      product_replenishment_opportunity: ['currentStock', 'safetyStock', 'salesQuantity', 'suggestedReplenishment'],
      product_customer_distribution: ['quantity', 'salesAmount', 'orderCount', 'customerCount'],
      project_service_trend: ['serviceCount', 'salesAmount', 'growthRate', 'customerCount'],
      project_material_margin: ['projectPrice', 'materialCost', 'grossMargin', 'grossMarginRate'],
      customer_churn_risk: ['daysSinceVisit', 'totalSpent', 'visitCount'],
      customer_growth_opportunity: ['totalSpent', 'visitCount', 'lastVisitDate'],
      inventory_alert: ['currentStock', 'safetyStock'],
      reservation_today: ['reservationCount', 'arrivedCount', 'pendingCount'],
      schedule_utilization: ['slotCount', 'occupiedSlotCount', 'utilizationRate'],
      order_customer_consumption_list: ['paidAmount', 'orderCount', 'customerCount'],
      order_revenue_analysis: ['salesAmount', 'orderCount', 'averageOrderValue'],
      card_expiry_risk: ['remainingTimes', 'daysToExpire'],
      card_usage_analysis: ['usageTimes', 'customerCount', 'beauticianCount'],
      member_balance_analysis: ['cashBalance', 'giftBalance', 'totalBalance'],
      finance_cashflow_summary: ['incomeAmount', 'refundAmount', 'netAmount'],
      marketing_conversion: ['attributedRevenue', 'conversionCount', 'touchCount'],
      automation_execution_summary: ['executionCount', 'reachedCount', 'conversionCount', 'attributedRevenue'],
      supplier_purchase_advice: ['suggestedQty', 'estimatedAmount', 'leadDays', 'moq'],
      business_anomaly_alert: ['severity', 'metricValue', 'threshold'],
      multi_store_comparison: ['salesAmount', 'orderCount', 'customerCount', 'reservationCount'],
      staff_performance: ['performanceScore', 'serviceCount', 'salesAmount', 'commissionAmount', 'completionRate'],
      terminal_health_diagnosis: ['deviceCount', 'abnormalDeviceCount', 'conversationCount', 'messageCount', 'failureCount'],
    };
    return map[capability] ?? [];
  }

  private dimensionsForCapability(capability: BusinessQueryCapabilityId) {
    const map: Partial<Record<BusinessQueryCapabilityId, string[]>> = {
      business_overview: ['storeId'],
      product_sales_trend: ['productId', 'productName'],
      product_replenishment_opportunity: ['productId', 'productName'],
      product_customer_distribution: ['productId', 'productName', 'customerId', 'customerName'],
      project_service_trend: ['projectId', 'projectName'],
      project_material_margin: ['projectId', 'projectName'],
      customer_churn_risk: ['customerId', 'customerName'],
      customer_growth_opportunity: ['customerId', 'customerName'],
      inventory_alert: ['productId', 'productName'],
      reservation_today: ['reservationId', 'customerName', 'projectName'],
      schedule_utilization: ['beauticianId', 'beauticianName'],
      order_customer_consumption_list: ['customerId', 'customerName'],
      order_revenue_analysis: ['payMethod'],
      card_expiry_risk: ['customerCardId', 'customerName', 'cardName'],
      card_usage_analysis: ['cardName', 'projectName'],
      member_balance_analysis: ['customerId', 'customerName'],
      finance_cashflow_summary: ['payMethod'],
      marketing_conversion: ['sourceType', 'campaignName'],
      automation_execution_summary: ['strategyId', 'strategyName'],
      supplier_purchase_advice: ['productId', 'productName', 'supplierName'],
      business_anomaly_alert: ['domain', 'severity'],
      multi_store_comparison: ['storeId', 'storeName'],
      staff_performance: ['beauticianId', 'beauticianName'],
      terminal_health_diagnosis: ['deviceId', 'deviceName', 'failureCategory'],
    };
    return map[capability] ?? [];
  }

  private sortForCapability(capability: BusinessQueryCapabilityId) {
    if (capability === 'product_sales_trend') return { field: 'growthRate', direction: 'desc' as const };
    if (capability === 'project_service_trend') return { field: 'growthRate', direction: 'desc' as const };
    if (capability === 'project_material_margin') return { field: 'grossMarginRate', direction: 'asc' as const };
    if (capability === 'customer_churn_risk') return { field: 'daysSinceVisit', direction: 'desc' as const };
    if (capability === 'inventory_alert') return { field: 'stockGap', direction: 'desc' as const };
    if (capability === 'product_replenishment_opportunity') return { field: 'priorityScore', direction: 'desc' as const };
    if (capability === 'supplier_purchase_advice') return { field: 'priorityScore', direction: 'desc' as const };
    if (capability === 'schedule_utilization') return { field: 'utilizationRate', direction: 'desc' as const };
    if (capability === 'staff_performance') return { field: 'performanceScore', direction: 'desc' as const };
    if (capability === 'terminal_health_diagnosis') return { field: 'failureCount', direction: 'desc' as const };
    if (capability === 'card_expiry_risk') return { field: 'daysToExpire', direction: 'asc' as const };
    if (capability === 'member_balance_analysis') return { field: 'totalBalance', direction: 'desc' as const };
    return undefined;
  }

  private getClarificationQuestion(text: string) {
    if (/增长/.test(text)) return '您想看客户增长、商品销量增长，还是收入增长？';
    return '请说明想查询的业务领域，例如商品、项目、客户、排班、订单、卡项、财务、库存或营销。';
  }

  private async queryProductSalesTrend(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const compareStart = new Date(range.compareStart);
    const compareEnd = new Date(range.compareEnd);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { not: null },
        order: {
          storeId,
          status: { in: PAID_ORDER_STATUSES },
          createdAt: { gte: compareStart, lt: end },
        },
      },
      include: {
        order: { select: { id: true, customerId: true, createdAt: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const productIds = [...new Set(orderItems.map((item: any) => Number(item.itemId)).filter(Boolean))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds }, storeId, deletedAt: null },
          select: { id: true, name: true, currentStock: true, safetyStock: true, unit: true },
        })
      : [];
    const productById = new Map(products.map((item: any) => [Number(item.id), item]));

    const bucket = new Map<
      number,
      {
        productId: number;
        productName: string;
        currentQuantity: number;
        previousQuantity: number;
        currentSalesAmount: number;
        previousSalesAmount: number;
        orderIds: Set<number>;
        customerIds: Set<number>;
      }
    >();

    for (const item of orderItems as any[]) {
      const productId = Number(item.itemId);
      if (!productId) continue;
      const orderTime = new Date(item.order.createdAt).getTime();
      const current = orderTime >= start.getTime() && orderTime < end.getTime();
      const previous = orderTime >= compareStart.getTime() && orderTime < compareEnd.getTime();
      if (!current && !previous) continue;
      const target =
        bucket.get(productId) ??
        {
          productId,
          productName: item.name,
          currentQuantity: 0,
          previousQuantity: 0,
          currentSalesAmount: 0,
          previousSalesAmount: 0,
          orderIds: new Set<number>(),
          customerIds: new Set<number>(),
        };
      const quantity = this.toNumber(item.quantity);
      const subtotal = this.toNumber(item.subtotal);
      if (current) {
        target.currentQuantity += quantity;
        target.currentSalesAmount += subtotal;
        target.orderIds.add(Number(item.orderId));
        if (item.order.customerId) target.customerIds.add(Number(item.order.customerId));
      } else {
        target.previousQuantity += quantity;
        target.previousSalesAmount += subtotal;
      }
      bucket.set(productId, target);
    }

    const items = Array.from(bucket.values())
      .filter((item) => item.currentQuantity > 0)
      .map((item) => {
        const product = productById.get(item.productId);
        const growthQuantity = item.currentQuantity - item.previousQuantity;
        const growthRate =
          item.previousQuantity > 0
            ? growthQuantity / item.previousQuantity
            : item.currentQuantity > 0
              ? 1
              : 0;
        return {
          productId: item.productId,
          productName: product?.name ?? item.productName,
          quantity: item.currentQuantity,
          previousQuantity: item.previousQuantity,
          growthQuantity,
          growthRate,
          growthRateText: this.formatPercent(growthRate),
          salesAmount: item.currentSalesAmount,
          previousSalesAmount: item.previousSalesAmount,
          orderCount: item.orderIds.size,
          customerCount: item.customerIds.size,
          currentStock: this.toNumber(product?.currentStock),
          safetyStock: this.toNumber(product?.safetyStock),
          unit: product?.unit ?? '',
        };
      })
      .sort((a, b) => b.growthRate - a.growthRate || b.quantity - a.quantity)
      .slice(0, queryPlan.limit);

    const evidence = this.buildEvidence({
      source: ['ProductOrder', 'OrderItem', 'Product'],
      metricDefinition: '商品销量 = 已完成/已支付订单中 OrderItem.itemType=product 的 quantity 汇总；增长率 = 当前周期销量较上一等长周期变化。',
      dateRange: this.formatRange(start, end),
      compareRange: this.formatRange(compareStart, compareEnd),
      filters: ['storeId=当前门店', 'status in completed, paid', 'itemType=product'],
      sampleSize: orderItems.length,
    });

    if (!items.length) {
      return this.noData(queryPlan, evidence, '当前周期没有足够商品订单明细，无法判断销量增长。可以扩大到近 90 天或先查看商品销售排行。');
    }

    const top = items[0];
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'productSalesTrend',
        title: '近期销量增长的商品',
        summary: `近 30 天销量增长最快的是 ${top.productName}，销量 ${top.quantity}，较前 30 天 ${top.growthRateText}。`,
        items,
      },
      answer: `近 30 天销量增长最快的是 ${top.productName}，销量 ${top.quantity}，较前 30 天 ${top.growthRateText}，销售额 ${this.formatMoney(top.salesAmount)}。`,
      evidence,
      actions: [
        { label: '查看商品明细', action: `product:${top.productId}`, riskLevel: 'low' },
        { label: '生成营销活动草稿', action: `marketing:draft:product:${top.productId}`, riskLevel: 'medium' },
      ],
    };
  }

  private async queryBusinessOverview(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);

    const [orders, reservations, lowStockProducts, churnRiskCustomers] = await Promise.all([
      this.prisma.productOrder.findMany({
        where: { storeId, status: { notIn: CANCELLED_ORDER_STATUSES }, createdAt: { gte: start, lt: end } },
        select: { id: true, totalAmount: true, status: true },
        take: 500,
      }),
      this.prisma.reservation.findMany({
        where: { storeId, date: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { id: true, status: true },
        take: 500,
      }),
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, currentStock: true, safetyStock: true },
        take: 500,
      }),
      this.prisma.customer.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, totalSpent: true, lastVisitDate: true },
        take: 500,
      }),
    ]);

    const salesAmount = (orders as any[]).reduce((total, order) => total + this.toNumber(order.totalAmount), 0);
    const lowStockCount = (lowStockProducts as any[]).filter(
      (product) => this.toNumber(product.currentStock) <= this.toNumber(product.safetyStock),
    ).length;
    const churnRiskCount = (churnRiskCustomers as any[]).filter(
      (customer) => this.daysSince(customer.lastVisitDate) >= 45 || this.toNumber(customer.totalSpent) >= 5000,
    ).length;
    const arrivedCount = (reservations as any[]).filter((item) => ['checked_in', 'completed'].includes(String(item.status))).length;
    const items = [
      { metric: '收入', value: salesAmount, displayValue: this.formatMoney(salesAmount) },
      { metric: '订单数', value: orders.length },
      { metric: '预约数', value: reservations.length },
      { metric: '已到店/完成预约', value: arrivedCount },
      { metric: '低库存商品', value: lowStockCount },
      { metric: '流失风险客户', value: churnRiskCount },
    ];
    const evidence = this.buildEvidence({
      source: ['ProductOrder', 'Reservation', 'Product', 'Customer'],
      metricDefinition: '经营概览 = 当前门店指定时间范围内订单收入、预约、低库存商品和客户风险规则摘要。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', '订单排除取消/退款', '预约排除取消'],
      sampleSize: orders.length + reservations.length + lowStockProducts.length + churnRiskCustomers.length,
    });

    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'businessOverview',
        title: '经营概览',
        summary: `当前时间范围收入 ${this.formatMoney(salesAmount)}，订单 ${orders.length} 笔，预约 ${reservations.length} 条。`,
        items,
        kpis: [
          { label: '收入', value: this.formatMoney(salesAmount) },
          { label: '订单数', value: `${orders.length}` },
          { label: '预约数', value: `${reservations.length}` },
          { label: '低库存', value: `${lowStockCount}` },
        ],
      },
      answer: `当前时间范围收入 ${this.formatMoney(salesAmount)}，订单 ${orders.length} 笔，预约 ${reservations.length} 条，低库存商品 ${lowStockCount} 个，流失风险客户 ${churnRiskCount} 位。`,
      evidence,
      actions: [
        { label: '查看订单收入', action: 'business-query:order_revenue_analysis', riskLevel: 'low' },
        { label: '查看库存预警', action: 'business-query:inventory_alert', riskLevel: 'low' },
      ],
    };
  }

  private async queryProjectServiceTrend(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const compareStart = new Date(range.compareStart);
    const compareEnd = new Date(range.compareEnd);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'project',
        itemId: { not: null },
        order: {
          storeId,
          status: { in: PAID_ORDER_STATUSES },
          createdAt: { gte: compareStart, lt: end },
        },
      },
      include: {
        order: { select: { id: true, customerId: true, createdAt: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const projectIds = [...new Set((orderItems as any[]).map((item) => Number(item.itemId)).filter(Boolean))];
    const projects = projectIds.length
      ? await this.prisma.project.findMany({
          where: { id: { in: projectIds }, storeId, deletedAt: null },
          select: { id: true, name: true, duration: true, price: true, status: true },
        })
      : [];
    const projectById = new Map((projects as any[]).map((item) => [Number(item.id), item]));
    const bucket = new Map<
      number,
      {
        projectId: number;
        projectName: string;
        currentCount: number;
        previousCount: number;
        currentSalesAmount: number;
        previousSalesAmount: number;
        customerIds: Set<number>;
      }
    >();

    for (const item of orderItems as any[]) {
      const projectId = Number(item.itemId);
      if (!projectId) continue;
      const orderTime = new Date(item.order.createdAt).getTime();
      const current = orderTime >= start.getTime() && orderTime < end.getTime();
      const previous = orderTime >= compareStart.getTime() && orderTime < compareEnd.getTime();
      if (!current && !previous) continue;
      const target =
        bucket.get(projectId) ??
        {
          projectId,
          projectName: item.name,
          currentCount: 0,
          previousCount: 0,
          currentSalesAmount: 0,
          previousSalesAmount: 0,
          customerIds: new Set<number>(),
        };
      const quantity = this.toNumber(item.quantity);
      if (current) {
        target.currentCount += quantity;
        target.currentSalesAmount += this.toNumber(item.subtotal);
        if (item.order.customerId) target.customerIds.add(Number(item.order.customerId));
      } else {
        target.previousCount += quantity;
        target.previousSalesAmount += this.toNumber(item.subtotal);
      }
      bucket.set(projectId, target);
    }

    const items = Array.from(bucket.values())
      .filter((item) => item.currentCount > 0)
      .map((item) => {
        const project = projectById.get(item.projectId);
        const growthCount = item.currentCount - item.previousCount;
        const growthRate =
          item.previousCount > 0
            ? growthCount / item.previousCount
            : item.currentCount > 0
              ? 1
              : 0;
        return {
          projectId: item.projectId,
          projectName: project?.name ?? item.projectName,
          serviceCount: item.currentCount,
          previousServiceCount: item.previousCount,
          growthCount,
          growthRate,
          growthRateText: this.formatPercent(growthRate),
          salesAmount: item.currentSalesAmount,
          previousSalesAmount: item.previousSalesAmount,
          customerCount: item.customerIds.size,
          duration: project?.duration,
          price: this.toNumber(project?.price),
        };
      })
      .sort((a, b) => b.growthRate - a.growthRate || b.serviceCount - a.serviceCount)
      .slice(0, queryPlan.limit);

    const evidence = this.buildEvidence({
      source: ['ProductOrder', 'OrderItem', 'Project'],
      metricDefinition: '项目服务趋势 = 已完成/已支付订单中 OrderItem.itemType=project 的 quantity 汇总，并与上一等长周期对比。',
      dateRange: this.formatRange(start, end),
      compareRange: this.formatRange(compareStart, compareEnd),
      filters: ['storeId=当前门店', 'status in completed, paid', 'itemType=project'],
      sampleSize: orderItems.length,
    });

    if (!items.length) return this.noData(queryPlan, evidence, '当前周期没有足够项目订单明细，无法判断项目服务趋势。');
    return this.basicSuccess(queryPlan, 'projectServiceTrend', '项目服务趋势', items, evidence, `近 30 天服务增长最快的是 ${items[0].projectName}，服务 ${items[0].serviceCount} 次，环比 ${items[0].growthRateText}。`);
  }

  private async queryProjectMaterialMargin(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const projects = await this.prisma.project.findMany({
      where: { storeId, deletedAt: null, status: 'active' },
      select: {
        id: true,
        name: true,
        price: true,
        duration: true,
        bomItems: { select: { standardQty: true, unit: true, product: { select: { id: true, name: true, costPrice: true, unit: true } } } },
      },
      take: 500,
    });

    const items = (projects as any[])
      .map((project) => {
        const materialCost = (project.bomItems ?? []).reduce(
          (total: number, item: any) => total + this.toNumber(item.standardQty) * this.toNumber(item.product?.costPrice),
          0,
        );
        const projectPrice = this.toNumber(project.price);
        const grossMargin = projectPrice - materialCost;
        const grossMarginRate = projectPrice ? grossMargin / projectPrice : 0;
        return {
          projectId: project.id,
          projectName: project.name,
          projectPrice,
          materialCost,
          grossMargin,
          grossMarginRate,
          grossMarginRateText: this.formatPercent(grossMarginRate),
          bomItemCount: project.bomItems?.length ?? 0,
          duration: project.duration,
        };
      })
      .filter((item) => item.bomItemCount > 0)
      .sort((a, b) => a.grossMarginRate - b.grossMarginRate)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['Project', 'ProjectBomItem', 'Product'],
      metricDefinition: '项目耗材毛利 = 项目价格 - BOM 标准用量 * 商品成本价；毛利率 = 耗材毛利 / 项目价格。',
      filters: ['storeId=当前门店', 'Project.status=active', 'Project.deletedAt is null', 'bomItemCount>0'],
      sampleSize: projects.length,
      limitations: ['仅计算标准耗材成本，暂不包含人工、房租、设备折旧和实际异常消耗。'],
    });
    if (!items.length) return this.noData(queryPlan, evidence, '当前没有配置 BOM 耗材的项目，无法估算项目耗材毛利。');
    return this.basicSuccess(
      queryPlan,
      'projectMaterialMargin',
      '项目耗材毛利',
      items,
      evidence,
      `耗材毛利率最低的是 ${items[0].projectName}，毛利率 ${items[0].grossMarginRateText}，建议检查定价或耗材配置。`,
    );
  }

  private async queryProductCustomerDistribution(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const contextProductIds = Array.isArray(queryPlan.filters.contextProductIds)
      ? (queryPlan.filters.contextProductIds as unknown[]).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
      : [];

    if (!contextProductIds.length) {
      return this.buildClarifyResponse({
        ...queryPlan,
        needClarification: true,
        clarificationQuestion: '请先查询商品列表，或明确要看哪个商品的购买客户。',
      });
    }

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { in: contextProductIds },
        order: {
          storeId,
          status: { in: PAID_ORDER_STATUSES },
          createdAt: { gte: start, lt: end },
        },
      },
      include: {
        order: { select: { id: true, customerId: true, customerName: true, createdAt: true, totalAmount: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const customerIds = [...new Set((orderItems as any[]).map((item) => Number(item.order?.customerId)).filter(Boolean))];
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: customerIds }, storeId, deletedAt: null },
          select: { id: true, name: true, phone: true, memberLevel: true, tags: true },
        })
      : [];
    const customerById = new Map((customers as any[]).map((item) => [Number(item.id), item]));
    const bucket = new Map<
      string,
      {
        productId: number;
        productName: string;
        customerId: number;
        customerName: string;
        quantity: number;
        salesAmount: number;
        orderIds: Set<number>;
      }
    >();

    for (const item of orderItems as any[]) {
      const productId = Number(item.itemId);
      const customerId = Number(item.order?.customerId);
      if (!productId || !customerId) continue;
      const customer = customerById.get(customerId);
      const key = `${productId}:${customerId}`;
      const target =
        bucket.get(key) ??
        {
          productId,
          productName: item.name,
          customerId,
          customerName: customer?.name ?? item.order?.customerName ?? `客户${customerId}`,
          quantity: 0,
          salesAmount: 0,
          orderIds: new Set<number>(),
        };
      target.quantity += this.toNumber(item.quantity);
      target.salesAmount += this.toNumber(item.subtotal);
      target.orderIds.add(Number(item.orderId));
      bucket.set(key, target);
    }

    const items = Array.from(bucket.values())
      .map((item) => {
        const customer = customerById.get(item.customerId);
        return {
          productId: item.productId,
          productName: item.productName,
          customerId: item.customerId,
          customerName: item.customerName,
          phone: this.maskPhone(customer?.phone),
          memberLevel: customer?.memberLevel,
          tags: customer?.tags ?? [],
          quantity: item.quantity,
          salesAmount: item.salesAmount,
          orderCount: item.orderIds.size,
        };
      })
      .sort((a, b) => b.salesAmount - a.salesAmount || b.quantity - a.quantity)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['ProductOrder', 'OrderItem', 'Customer'],
      metricDefinition: '商品购买客户分布 = 上一轮商品列表中的 productId，在当前周期已支付/已完成订单中按客户聚合购买数量和金额。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', `productId in context(${contextProductIds.length})`, 'status in completed, paid'],
      sampleSize: orderItems.length,
    });

    if (!items.length) return this.noData(queryPlan, evidence, '上一轮商品在当前周期内没有可追溯的购买客户记录。');
    return this.basicSuccess(
      queryPlan,
      'productCustomerDistribution',
      '商品购买客户分布',
      items,
      evidence,
      `已找到 ${items.length} 条商品-客户购买记录，购买金额最高的是 ${items[0].customerName} / ${items[0].productName}。`,
    );
  }

  private async queryCustomerChurnRisk(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true, phone: true, memberLevel: true, totalSpent: true, visitCount: true, lastVisitDate: true, tags: true },
      orderBy: [{ totalSpent: 'desc' }, { lastVisitDate: 'asc' }],
      take: 80,
    });
    const items = customers
      .map((customer: any) => ({
        customerId: customer.id,
        customerName: customer.name,
        phone: this.maskPhone(customer.phone),
        memberLevel: customer.memberLevel,
        totalSpent: this.toNumber(customer.totalSpent),
        visitCount: this.toNumber(customer.visitCount),
        lastVisitDate: customer.lastVisitDate,
        daysSinceVisit: this.daysSince(customer.lastVisitDate),
        tags: customer.tags ?? [],
      }))
      .filter((item) => item.daysSinceVisit >= 45 || item.totalSpent >= 5000)
      .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit || b.totalSpent - a.totalSpent)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['Customer'],
      metricDefinition: '客户流失风险 = 久未到店天数、历史消费和到店次数综合排序；P0 先使用规则口径。',
      filters: ['storeId=当前门店', 'deletedAt is null', 'daysSinceVisit>=45 或 totalSpent>=5000'],
      sampleSize: customers.length,
    });
    if (!items.length) return this.noData(queryPlan, evidence, '当前没有明显久未到店或高价值流失风险客户。');
    return this.basicSuccess(queryPlan, 'customerChurnRisk', '客户流失风险', items, evidence, `${items.length} 位客户需要优先关注，首位为 ${items[0].customerName}，已 ${items[0].daysSinceVisit} 天未到店。`);
  }

  private async queryCustomerGrowthOpportunity(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null },
      select: { id: true, name: true, phone: true, memberLevel: true, totalSpent: true, visitCount: true, lastVisitDate: true, tags: true },
      orderBy: [{ totalSpent: 'desc' }, { visitCount: 'desc' }],
      take: queryPlan.limit,
    });
    const items = customers.map((customer: any) => ({
      customerId: customer.id,
      customerName: customer.name,
      phone: this.maskPhone(customer.phone),
      memberLevel: customer.memberLevel,
      totalSpent: this.toNumber(customer.totalSpent),
      visitCount: this.toNumber(customer.visitCount),
      lastVisitDate: customer.lastVisitDate,
      tags: customer.tags ?? [],
    }));
    const evidence = this.buildEvidence({
      source: ['Customer'],
      metricDefinition: '客户增长机会 = 按历史消费和到店次数排序，P0 用于识别优先经营对象。',
      filters: ['storeId=当前门店', 'deletedAt is null'],
      sampleSize: items.length,
    });
    if (!items.length) return this.noData(queryPlan, evidence, '当前没有可用于客户增长分析的客户数据。');
    return this.basicSuccess(queryPlan, 'customerGrowthOpportunity', '客户增长机会', items, evidence, `优先关注 ${items[0].customerName} 等高价值客户，结合最近服务记录做复购承接。`);
  }

  private async queryInventoryAlerts(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const contextProductIds = Array.isArray(queryPlan.filters.contextProductIds)
      ? (queryPlan.filters.contextProductIds as unknown[]).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
      : [];
    const products = await this.prisma.product.findMany({
      where: { storeId, deletedAt: null, ...(contextProductIds.length ? { id: { in: contextProductIds } } : {}) },
      select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true, unit: true, status: true },
      orderBy: { currentStock: 'asc' },
      take: 120,
    });
    const items = products
      .map((product: any) => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentStock: this.toNumber(product.currentStock),
        safetyStock: this.toNumber(product.safetyStock),
        unit: product.unit,
        status: product.status,
        stockGap: this.toNumber(product.safetyStock) - this.toNumber(product.currentStock),
        stockEnough: this.toNumber(product.currentStock) > this.toNumber(product.safetyStock),
      }))
      .filter((item) => contextProductIds.length || item.currentStock <= item.safetyStock)
      .sort((a, b) => b.stockGap - a.stockGap)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['Product'],
      metricDefinition: contextProductIds.length ? '上下文商品库存 = 上一轮商品结果中的 productId 对应 Product.currentStock 与 safetyStock 对比。' : '低库存 = 当前库存 <= 安全库存。',
      filters: ['storeId=当前门店', 'deletedAt is null', contextProductIds.length ? `productId in context(${contextProductIds.length})` : 'currentStock<=safetyStock'],
      sampleSize: products.length,
    });
    if (!items.length) return this.noData(queryPlan, evidence, contextProductIds.length ? '上一轮商品结果没有匹配到库存数据。' : '当前门店商品库存均高于安全库存线。');
    if (contextProductIds.length) {
      const insufficient = items.filter((item) => item.currentStock <= item.safetyStock);
      return this.basicSuccess(
        queryPlan,
        'inventoryAlert',
        '上下文商品库存',
        items,
        evidence,
        insufficient.length ? `${insufficient.length} 个上下文商品库存不足，优先处理 ${insufficient[0].productName}。` : '上一轮商品当前库存均高于安全库存线。',
      );
    }
    return this.basicSuccess(queryPlan, 'inventoryAlert', '库存预警', items, evidence, `${items.length} 个商品低于或等于安全库存，优先处理 ${items[0].productName}。`);
  }

  private async queryProductReplenishmentOpportunity(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const [products, orderItems] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true, unit: true, status: true },
        take: 1000,
      }),
      this.prisma.orderItem.findMany({
        where: {
          itemType: 'product',
          itemId: { not: null },
          order: { storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: start, lt: end } },
        },
        include: { order: { select: { id: true, createdAt: true, status: true } } },
        take: 2000,
      }),
    ]);

    const salesByProduct = new Map<number, { salesQuantity: number; salesAmount: number; orderIds: Set<number> }>();
    for (const item of orderItems as any[]) {
      const productId = Number(item.itemId);
      if (!productId) continue;
      const target = salesByProduct.get(productId) ?? { salesQuantity: 0, salesAmount: 0, orderIds: new Set<number>() };
      target.salesQuantity += this.toNumber(item.quantity);
      target.salesAmount += this.toNumber(item.subtotal);
      target.orderIds.add(Number(item.orderId));
      salesByProduct.set(productId, target);
    }

    const items = (products as any[])
      .map((product) => {
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const sales = salesByProduct.get(Number(product.id)) ?? { salesQuantity: 0, salesAmount: 0, orderIds: new Set<number>() };
        const dailySales = sales.salesQuantity / 30;
        const stockGap = Math.max(0, safetyStock - currentStock);
        const projectedDemand = Math.ceil(dailySales * 14);
        const suggestedReplenishment = Math.max(stockGap, projectedDemand - currentStock);
        const priorityScore = stockGap * 10 + sales.salesQuantity * 2 + suggestedReplenishment;
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock,
          safetyStock,
          unit: product.unit,
          salesQuantity: sales.salesQuantity,
          salesAmount: sales.salesAmount,
          orderCount: sales.orderIds.size,
          stockGap,
          dailySales: Number(dailySales.toFixed(2)),
          suggestedReplenishment,
          priorityScore,
        };
      })
      .filter((item) => item.suggestedReplenishment > 0 || item.currentStock <= item.safetyStock)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['Product', 'ProductOrder', 'OrderItem'],
      metricDefinition: '补货机会 = 安全库存缺口、近 30 天销量和 14 天预测需求综合排序；建议补货量取安全库存缺口与预测需求缺口的较大值。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'Product.deletedAt is null', 'OrderItem.itemType=product', 'status in completed, paid'],
      sampleSize: products.length + orderItems.length,
      limitations: ['P2 当前使用规则预测，不替代采购审批。'],
    });

    if (!items.length) return this.noData(queryPlan, evidence, '当前没有明显补货机会，商品库存与近 30 天销量暂未触发补货建议。');
    return {
      ...this.basicSuccess(
        queryPlan,
        'productReplenishmentOpportunity',
        '商品补货机会',
        items,
        evidence,
        `优先补货 ${items[0].productName}，建议补 ${items[0].suggestedReplenishment}${items[0].unit || ''}。`,
      ),
      actions: [{ label: '生成补货单草稿', action: 'purchase:draft:context', riskLevel: 'medium' }],
    };
  }

  private async queryTodayReservations(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const reservations = await this.prisma.reservation.findMany({
      where: { storeId, date: { gte: new Date(range.start), lt: new Date(range.end) }, status: { not: 'cancelled' } },
      orderBy: { startTime: 'asc' },
      take: queryPlan.limit,
    });
    const items = reservations.map((item: any) => ({
      reservationId: item.id,
      customerName: item.customerName,
      customerPhone: this.maskPhone(item.customerPhone),
      projectName: item.projectName,
      beauticianName: item.beauticianName,
      startTime: item.startTime,
      status: item.status,
    }));
    const arrivedCount = items.filter((item) => ['checked_in', 'completed'].includes(String(item.status))).length;
    const evidence = this.buildEvidence({
      source: ['Reservation'],
      metricDefinition: '今日预约 = 当前门店当日未取消预约。',
      dateRange: this.formatRange(new Date(range.start), new Date(range.end)),
      filters: ['storeId=当前门店', 'status != cancelled'],
      sampleSize: items.length,
    });
    if (!items.length) return this.noData(queryPlan, evidence, '今日暂无有效预约。');
    return {
      ...this.basicSuccess(queryPlan, 'reservationToday', '今日预约', items, evidence, `今日有效预约 ${items.length} 条，已到店/完成 ${arrivedCount} 条。`),
      card: {
        type: 'reservationToday',
        title: '今日预约',
        summary: `今日有效预约 ${items.length} 条，已到店/完成 ${arrivedCount} 条。`,
        items,
        kpis: [
          { label: '有效预约', value: `${items.length}` },
          { label: '已到店/完成', value: `${arrivedCount}` },
          { label: '待跟进', value: `${Math.max(0, items.length - arrivedCount)}` },
        ],
      },
    };
  }

  private async queryScheduleUtilization(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const schedules = await this.prisma.schedule.findMany({
      where: { storeId, date: { gte: start, lt: end } },
      include: { beautician: { select: { id: true, name: true, status: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 2000,
    });

    const bucket = new Map<
      number,
      {
        beauticianId: number;
        beauticianName: string;
        status: string;
        slotCount: number;
        availableCount: number;
        busyCount: number;
        leaveCount: number;
        occupiedSlotCount: number;
      }
    >();
    for (const schedule of schedules as any[]) {
      const beauticianId = Number(schedule.beauticianId);
      const target =
        bucket.get(beauticianId) ??
        {
          beauticianId,
          beauticianName: schedule.beautician?.name ?? `美容师${beauticianId}`,
          status: schedule.beautician?.status ?? '',
          slotCount: 0,
          availableCount: 0,
          busyCount: 0,
          leaveCount: 0,
          occupiedSlotCount: 0,
        };
      const status = String(schedule.status || '');
      target.slotCount += 1;
      if (/available|normal|正常|空闲/.test(status)) target.availableCount += 1;
      if (/busy|booked|忙|占用/.test(status)) target.busyCount += 1;
      if (/leave|off|请假|休/.test(status)) target.leaveCount += 1;
      if (!/available|normal|正常|空闲/.test(status)) target.occupiedSlotCount += 1;
      bucket.set(beauticianId, target);
    }

    const items = Array.from(bucket.values())
      .map((item) => ({
        ...item,
        utilizationRate: item.slotCount ? item.occupiedSlotCount / item.slotCount : 0,
        utilizationRateText: this.formatPercent(item.slotCount ? item.occupiedSlotCount / item.slotCount : 0),
      }))
      .sort((a, b) => b.utilizationRate - a.utilizationRate || b.slotCount - a.slotCount)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['Schedule', 'Beautician'],
      metricDefinition: '排班利用率 = 非 available/normal/正常/空闲 时段数 / 总排班时段数；请假和忙碌均视为占用。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'date=查询周期'],
      sampleSize: schedules.length,
    });

    if (!items.length) return this.noData(queryPlan, evidence, '当前时间范围内暂无排班数据，无法计算占用率。');
    return {
      ...this.basicSuccess(queryPlan, 'scheduleUtilization', '排班利用率', items, evidence, `${items[0].beauticianName} 占用率最高，为 ${items[0].utilizationRateText}。`),
      actions: [{ label: '查看排班表', action: 'scheduling:open', riskLevel: 'low' }],
    };
  }

  private async queryStaffPerformance(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const [beauticians, orderItems, commissionRecords, reservations, serviceTasks, cardUsageRecords] = await Promise.all([
      this.prisma.beautician.findMany({
        where: { storeId },
        select: { id: true, name: true, status: true, level: { select: { name: true } } },
        take: 300,
      }),
      this.prisma.orderItem.findMany({
        where: {
          beauticianId: { not: null },
          order: {
            storeId,
            status: { in: PAID_ORDER_STATUSES },
            createdAt: { gte: start, lt: end },
          },
        },
        include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      }),
      this.prisma.commissionRecord.findMany({
        where: {
          storeId,
          createdAt: { gte: start, lt: end },
          status: { notIn: ['cancelled', 'canceled', 'void', '已取消'] },
        },
        select: { id: true, beauticianId: true, amount: true, status: true, type: true, createdAt: true },
        take: 3000,
      }),
      this.prisma.reservation.findMany({
        where: { storeId, beauticianId: { not: null }, date: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { id: true, beauticianId: true, customerId: true, status: true, date: true },
        take: 3000,
      }),
      this.prisma.serviceTask.findMany({
        where: { storeId, beauticianId: { not: null }, appointmentTime: { gte: start, lt: end } },
        select: { id: true, beauticianId: true, status: true, completedAt: true },
        take: 3000,
      }),
      this.prisma.cardUsageRecord.findMany({
        where: {
          beauticianId: { not: null },
          verifiedAt: { gte: start, lt: end },
          customer: { storeId, deletedAt: null },
        },
        select: { id: true, beauticianId: true, customerId: true, times: true, verifiedAt: true },
        take: 3000,
      }),
    ]);

    const buckets = new Map<
      number,
      {
        beauticianId: number;
        beauticianName: string;
        levelName: string;
        status: string;
        salesAmount: number;
        serviceCount: number;
        orderIds: Set<number>;
        customerIds: Set<number>;
        commissionAmount: number;
        reservationCount: number;
        completedReservationCount: number;
        completedTaskCount: number;
        cardUsageTimes: number;
      }
    >();

    const ensureBucket = (beauticianId: number) => {
      const existing = buckets.get(beauticianId);
      if (existing) return existing;
      const beautician = (beauticians as any[]).find((item) => Number(item.id) === beauticianId);
      const next = {
        beauticianId,
        beauticianName: beautician?.name ?? `员工${beauticianId}`,
        levelName: beautician?.level?.name ?? '',
        status: beautician?.status ?? '',
        salesAmount: 0,
        serviceCount: 0,
        orderIds: new Set<number>(),
        customerIds: new Set<number>(),
        commissionAmount: 0,
        reservationCount: 0,
        completedReservationCount: 0,
        completedTaskCount: 0,
        cardUsageTimes: 0,
      };
      buckets.set(beauticianId, next);
      return next;
    };

    for (const beautician of beauticians as any[]) ensureBucket(Number(beautician.id));

    for (const item of orderItems as any[]) {
      const beauticianId = Number(item.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.salesAmount += this.toNumber(item.subtotal);
      if (String(item.itemType || '') === 'project') target.serviceCount += this.toNumber(item.quantity);
      if (item.orderId) target.orderIds.add(Number(item.orderId));
      if (item.order?.customerId) target.customerIds.add(Number(item.order.customerId));
    }

    for (const record of commissionRecords as any[]) {
      const beauticianId = Number(record.beauticianId);
      if (!beauticianId) continue;
      ensureBucket(beauticianId).commissionAmount += this.toNumber(record.amount);
    }

    for (const reservation of reservations as any[]) {
      const beauticianId = Number(reservation.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.reservationCount += 1;
      if (reservation.customerId) target.customerIds.add(Number(reservation.customerId));
      if (/completed|checked_in|arrived|done|已完成|已到店/.test(String(reservation.status || ''))) {
        target.completedReservationCount += 1;
      }
    }

    for (const task of serviceTasks as any[]) {
      const beauticianId = Number(task.beauticianId);
      if (!beauticianId) continue;
      if (/completed|done|已完成/.test(String(task.status || '')) || task.completedAt) {
        ensureBucket(beauticianId).completedTaskCount += 1;
      }
    }

    for (const usage of cardUsageRecords as any[]) {
      const beauticianId = Number(usage.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.cardUsageTimes += this.toNumber(usage.times);
      if (usage.customerId) target.customerIds.add(Number(usage.customerId));
    }

    const items = Array.from(buckets.values())
      .map((item) => {
        const completionRate = item.reservationCount ? item.completedReservationCount / item.reservationCount : 0;
        const performanceScore =
          item.serviceCount * 8 +
          item.completedTaskCount * 6 +
          item.cardUsageTimes * 5 +
          item.orderIds.size * 4 +
          item.customerIds.size * 3 +
          item.salesAmount / 1000 +
          item.commissionAmount / 100 +
          completionRate * 20;
        const performanceLevel = performanceScore >= 80 ? '表现突出' : performanceScore >= 40 ? '稳定发挥' : '需持续跟进';
        return {
          beauticianId: item.beauticianId,
          beauticianName: item.beauticianName,
          levelName: item.levelName || '未设置等级',
          status: item.status,
          performanceScore: Math.round(performanceScore),
          performanceLevel,
          serviceCount: item.serviceCount,
          completedTaskCount: item.completedTaskCount,
          cardUsageTimes: item.cardUsageTimes,
          salesAmount: item.salesAmount,
          commissionAmount: item.commissionAmount,
          orderCount: item.orderIds.size,
          customerCount: item.customerIds.size,
          reservationCount: item.reservationCount,
          completedReservationCount: item.completedReservationCount,
          completionRate,
          completionRateText: `${Math.round(completionRate * 100)}%`,
          reason: `服务 ${item.serviceCount} 次，销售额 ${this.formatMoney(item.salesAmount)}，提成 ${this.formatMoney(item.commissionAmount)}，预约完成率 ${Math.round(completionRate * 100)}%。`,
        };
      })
      .filter((item) => item.performanceScore > 0)
      .sort((a, b) => b.performanceScore - a.performanceScore || b.salesAmount - a.salesAmount || b.serviceCount - a.serviceCount)
      .slice(0, queryPlan.limit);

    const evidence = this.buildEvidence({
      source: ['Beautician', 'OrderItem', 'CommissionRecord', 'Reservation', 'ServiceTask', 'CardUsageRecord'],
      metricDefinition:
        '员工表现分 = 服务次数、完成服务任务、次卡核销次数、订单数、服务客户数、销售额、提成和预约完成率的加权综合评分；仅用于门店内部经营排序。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', '订单状态 in completed/paid', '排除取消预约与已取消提成记录'],
      sampleSize:
        (beauticians as any[]).length +
        (orderItems as any[]).length +
        (commissionRecords as any[]).length +
        (reservations as any[]).length +
        (serviceTasks as any[]).length +
        (cardUsageRecords as any[]).length,
    });

    if (!items.length) {
      return this.noData(queryPlan, evidence, '当前周期没有可用于员工表现分析的订单、提成、预约、服务任务或次卡核销数据。');
    }

    const totalSales = items.reduce((total, item) => total + item.salesAmount, 0);
    const totalCommission = items.reduce((total, item) => total + item.commissionAmount, 0);
    const totalService = items.reduce((total, item) => total + item.serviceCount + item.cardUsageTimes, 0);
    const top = items[0];
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'staffPerformance',
        title: '员工表现排行',
        summary: `当前周期表现较好的是 ${top.beauticianName}，表现分 ${top.performanceScore}，销售额 ${this.formatMoney(top.salesAmount)}，服务 ${top.serviceCount} 次。`,
        items,
        kpis: [
          { label: '上榜员工', value: `${items.length}` },
          { label: '服务与核销', value: `${totalService} 次` },
          { label: '销售额', value: this.formatMoney(totalSales) },
          { label: '提成', value: this.formatMoney(totalCommission) },
        ],
      },
      answer: `当前周期表现较好的是 ${top.beauticianName}，表现分 ${top.performanceScore}，销售额 ${this.formatMoney(top.salesAmount)}，服务 ${top.serviceCount} 次，提成 ${this.formatMoney(top.commissionAmount)}。`,
      evidence,
      actions: [{ label: '查看员工排班', action: 'scheduling:open', riskLevel: 'low' }],
    };
  }

  private async queryTerminalHealthDiagnosis(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const [devices, conversations] = await Promise.all([
      (this.prisma as any).terminalDevice.findMany({
        where: { storeId },
        select: {
          id: true,
          deviceCode: true,
          name: true,
          status: true,
          networkStatus: true,
          printerStatus: true,
          scannerStatus: true,
          cameraStatus: true,
          batteryLevel: true,
          lastOnlineAt: true,
        },
        take: 1000,
      }),
      (this.prisma as any).terminalConversation.findMany({
        where: { storeId, date: { gte: start, lt: end } },
        select: { id: true, deviceId: true, role: true, messages: true, messageCount: true, updatedAt: true },
        take: 2000,
      }),
    ]);

    type TerminalFailureBucket = {
      failureCategory: string;
      failureCategoryLabel: string;
      failureCount: number;
      affectedDeviceIds: Set<string>;
      affectedDevices: Set<string>;
      sampleMessages: string[];
      latestAt?: Date;
      candidateCapabilityName: string;
      candidateReason: string;
      recommendation: string;
    };

    const devicesByKey = new Map<string, any>();
    const conversationByDevice = new Map<string, { conversationCount: number; messageCount: number }>();
    const failureBuckets = new Map<string, TerminalFailureBucket>();
    for (const device of devices as any[]) {
      if (device.deviceCode) devicesByKey.set(String(device.deviceCode), device);
      if (device.id) devicesByKey.set(String(device.id), device);
    }

    const addFailure = (
      signal: {
        failureCategory: string;
        failureCategoryLabel: string;
        candidateCapabilityName: string;
        candidateReason: string;
        recommendation: string;
        sampleMessage?: string;
      },
      device?: any,
      latestAt?: Date | string | null,
    ) => {
      const bucket =
        failureBuckets.get(signal.failureCategory) ??
        ({
          failureCategory: signal.failureCategory,
          failureCategoryLabel: signal.failureCategoryLabel,
          failureCount: 0,
          affectedDeviceIds: new Set<string>(),
          affectedDevices: new Set<string>(),
          sampleMessages: [],
          candidateCapabilityName: signal.candidateCapabilityName,
          candidateReason: signal.candidateReason,
          recommendation: signal.recommendation,
        } satisfies TerminalFailureBucket);
      bucket.failureCount += 1;
      if (device?.deviceCode || device?.id) bucket.affectedDeviceIds.add(String(device.deviceCode ?? device.id));
      if (device?.name) bucket.affectedDevices.add(String(device.name));
      if (signal.sampleMessage && bucket.sampleMessages.length < 3) bucket.sampleMessages.push(signal.sampleMessage);
      const latest = latestAt ? new Date(latestAt) : undefined;
      if (latest && !Number.isNaN(latest.getTime()) && (!bucket.latestAt || latest > bucket.latestAt)) bucket.latestAt = latest;
      failureBuckets.set(signal.failureCategory, bucket);
    };

    for (const conversation of conversations as any[]) {
      const deviceId = String(conversation.deviceId || '');
      const current = conversationByDevice.get(deviceId) ?? { conversationCount: 0, messageCount: 0 };
      current.conversationCount += 1;
      current.messageCount += this.toNumber(conversation.messageCount);
      conversationByDevice.set(deviceId, current);
      const device = devicesByKey.get(deviceId);
      for (const signal of this.classifyTerminalConversationFailure(conversation)) addFailure(signal, device, conversation.updatedAt);
    }

    const deviceItems = (devices as any[])
      .map((device) => {
        const stats = conversationByDevice.get(String(device.deviceCode)) ?? conversationByDevice.get(String(device.id)) ?? { conversationCount: 0, messageCount: 0 };
        const deviceSignals = [
          !/online|正常|ok/i.test(String(device.status || '')) ? this.getTerminalFailureSignal('device_offline') : undefined,
          /error|异常|offline|离线/i.test(String(device.networkStatus || '')) ? this.getTerminalFailureSignal('network_unstable') : undefined,
          /error|异常|offline|离线/i.test(String(device.printerStatus || '')) ? this.getTerminalFailureSignal('printer_unavailable') : undefined,
          /error|异常|offline|离线/i.test(String(device.scannerStatus || '')) ? this.getTerminalFailureSignal('scanner_unavailable') : undefined,
          /error|异常|offline|离线/i.test(String(device.cameraStatus || '')) ? this.getTerminalFailureSignal('camera_unavailable') : undefined,
          this.toNumber(device.batteryLevel) > 0 && this.toNumber(device.batteryLevel) < 20 ? this.getTerminalFailureSignal('low_battery') : undefined,
        ].filter((item): item is ReturnType<typeof this.getTerminalFailureSignal> => Boolean(item));
        for (const signal of deviceSignals) addFailure(signal, device, device.lastOnlineAt);
        return {
          deviceId: device.id,
          deviceName: device.name,
          deviceCode: device.deviceCode,
          status: device.status,
          networkStatus: device.networkStatus,
          printerStatus: device.printerStatus,
          scannerStatus: device.scannerStatus,
          cameraStatus: device.cameraStatus,
          batteryLevel: device.batteryLevel,
          lastOnlineAt: device.lastOnlineAt,
          conversationCount: stats.conversationCount,
          messageCount: stats.messageCount,
          abnormalSignalCount: deviceSignals.length,
          abnormalSignals: deviceSignals.map((signal) => signal.failureCategoryLabel),
        };
      })
      .sort((a, b) => b.abnormalSignalCount - a.abnormalSignalCount || b.messageCount - a.messageCount)
      .slice(0, queryPlan.limit);

    const failureCategories = Array.from(failureBuckets.values())
      .map((item) => ({
        failureCategory: item.failureCategory,
        failureCategoryLabel: item.failureCategoryLabel,
        failureCount: item.failureCount,
        affectedDeviceCount: item.affectedDeviceIds.size,
        affectedDevices: Array.from(item.affectedDevices),
        topDeviceName: Array.from(item.affectedDevices)[0] ?? '未关联设备',
        sampleMessage: item.sampleMessages[0] ?? '',
        sampleMessages: item.sampleMessages,
        latestAt: item.latestAt,
        candidateCapabilityName: item.candidateCapabilityName,
        candidateReason: item.candidateReason,
        recommendation: item.recommendation,
      }))
      .sort((a, b) => b.failureCount - a.failureCount || b.affectedDeviceCount - a.affectedDeviceCount)
      .slice(0, queryPlan.limit);

    const evidence = this.buildEvidence({
      source: ['TerminalDevice', 'TerminalConversation'],
      metricDefinition: '终端诊断 = 设备在线/网络/打印机/扫码器/摄像头/电量状态 + 查询周期内终端会话消息中的失败信号分类。',
      dateRange: this.formatRange(start, end),
      filters: ['当前门店', '终端会话日期在查询周期内', `最多返回 ${queryPlan.limit} 条`],
      sampleSize: (devices as any[]).length + (conversations as any[]).length,
      limitations: ['失败分类基于设备状态和会话消息关键词，不能替代完整前端日志。', '该查询只读，不自动修改设备状态或创建能力。'],
    });

    if (!(devices as any[]).length && !(conversations as any[]).length) {
      return this.noData(queryPlan, evidence, '当前周期没有终端设备或终端会话数据，无法判断高频失败问题。');
    }

    const abnormalDeviceCount = deviceItems.filter((item) => item.abnormalSignalCount > 0).length;
    const totalMessages = (conversations as any[]).reduce((sum, item) => sum + this.toNumber(item.messageCount), 0);
    const detailItems = failureCategories.length ? failureCategories : deviceItems;
    const topFailure = failureCategories[0];
    const summary = topFailure
      ? `当前周期识别 ${failureCategories.length} 类终端失败信号，最高频是 ${topFailure.failureCategoryLabel}，出现 ${topFailure.failureCount} 次。`
      : `当前周期共有 ${(devices as any[]).length} 台终端，异常设备 ${abnormalDeviceCount} 台，终端会话 ${(conversations as any[]).length} 个，消息 ${totalMessages} 条。`;

    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'terminalHealthDiagnosis',
        title: '终端设备与对话诊断',
        summary,
        items: detailItems,
        kpis: [
          { label: '终端设备', value: `${(devices as any[]).length}` },
          { label: '异常设备', value: `${abnormalDeviceCount}` },
          { label: '终端会话', value: `${(conversations as any[]).length}` },
          { label: '失败分类', value: `${failureCategories.length}` },
        ],
      },
      answer: summary,
      evidence,
      actions: [
        { label: '查看终端设备', action: 'terminal:devices:open', riskLevel: 'low' },
        { label: '查看会话记录', action: 'terminal:conversations:open', riskLevel: 'low' },
      ],
    };
  }

  private async queryOrderRevenue(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId,
        status: { notIn: CANCELLED_ORDER_STATUSES },
        createdAt: { gte: new Date(range.start), lt: new Date(range.end) },
      },
      select: { id: true, orderNo: true, customerName: true, totalAmount: true, payMethod: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const totalAmount = orders.reduce((total: number, order: any) => total + this.toNumber(order.totalAmount), 0);
    const payMethodMap = new Map<string, { payMethod: string; orderCount: number; salesAmount: number }>();
    for (const order of orders as any[]) {
      const key = String(order.payMethod || '未知');
      const item = payMethodMap.get(key) ?? { payMethod: key, orderCount: 0, salesAmount: 0 };
      item.orderCount += 1;
      item.salesAmount += this.toNumber(order.totalAmount);
      payMethodMap.set(key, item);
    }
    const items = Array.from(payMethodMap.values()).sort((a, b) => b.salesAmount - a.salesAmount);
    const evidence = this.buildEvidence({
      source: ['ProductOrder', 'PaymentRecord'],
      metricDefinition: '收入 = 未取消/未退款订单 totalAmount 汇总；客单价 = 收入 / 订单数。',
      dateRange: this.formatRange(new Date(range.start), new Date(range.end)),
      filters: ['storeId=当前门店', 'status not in cancelled/refunded'],
      sampleSize: orders.length,
    });
    if (!orders.length) return this.noData(queryPlan, evidence, '当前时间范围内暂无有效订单收入。');
    const averageOrderValue = orders.length ? totalAmount / orders.length : 0;
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'orderRevenueAnalysis',
        title: '订单收入分析',
        summary: `当前时间范围内收入 ${this.formatMoney(totalAmount)}，订单 ${orders.length} 笔，客单价 ${this.formatMoney(averageOrderValue)}。`,
        items,
        kpis: [
          { label: '收入', value: this.formatMoney(totalAmount) },
          { label: '订单数', value: `${orders.length}` },
          { label: '客单价', value: this.formatMoney(averageOrderValue) },
        ],
      },
      answer: `当前时间范围内收入 ${this.formatMoney(totalAmount)}，订单 ${orders.length} 笔，客单价 ${this.formatMoney(averageOrderValue)}。`,
      evidence,
      actions: [{ label: '查看订单明细', action: 'orders:open', riskLevel: 'low' }],
    };
  }

  private async queryOrderCustomerConsumptionList(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId,
        status: { notIn: CANCELLED_ORDER_STATUSES },
        createdAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        orderNo: true,
        customerId: true,
        customerName: true,
        totalAmount: true,
        netAmount: true,
        payMethod: true,
        status: true,
        createdAt: true,
        customer: { select: { id: true, name: true, phone: true, memberLevel: true } },
        orderItems: { select: { name: true, itemType: true, quantity: true, subtotal: true } },
        paymentRecords: { select: { amount: true, status: true, method: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const customers = new Map<
      string,
      {
        customerId: number | null;
        customerName: string;
        phoneMasked: string;
        memberLevel: string;
        paidAmount: number;
        paidAmountText: string;
        orderCount: number;
        lastOrderTime: Date;
        lastOrderTimeText: string;
        orderNos: string[];
        payMethods: Set<string>;
        itemNames: Map<string, number>;
      }
    >();

    for (const order of orders as any[]) {
      const paidAmount = this.getOrderPaidAmount(order);
      if (paidAmount <= 0) continue;
      const customerId = Number(order.customerId) || null;
      const customerName = String(order.customer?.name || order.customerName || (customerId ? `客户${customerId}` : '散客'));
      const key = customerId ? `customer:${customerId}` : `guest:${customerName}`;
      const existing = customers.get(key);
      const lastOrderTime = new Date(order.createdAt);
      const target =
        existing ??
        {
          customerId,
          customerName,
          phoneMasked: this.maskPhone(order.customer?.phone),
          memberLevel: order.customer?.memberLevel ?? '',
          paidAmount: 0,
          paidAmountText: '',
          orderCount: 0,
          lastOrderTime,
          lastOrderTimeText: '',
          orderNos: [] as string[],
          payMethods: new Set<string>(),
          itemNames: new Map<string, number>(),
        };
      target.paidAmount += paidAmount;
      target.orderCount += 1;
      if (lastOrderTime.getTime() > target.lastOrderTime.getTime()) target.lastOrderTime = lastOrderTime;
      if (order.orderNo) target.orderNos.push(String(order.orderNo));
      if (order.payMethod) target.payMethods.add(String(order.payMethod));
      for (const payment of order.paymentRecords ?? []) {
        if (payment.method) target.payMethods.add(String(payment.method));
      }
      for (const item of order.orderItems ?? []) {
        const name = String(item.name || '').trim();
        if (!name) continue;
        target.itemNames.set(name, (target.itemNames.get(name) ?? 0) + this.toNumber(item.quantity || 1));
      }
      customers.set(key, target);
    }

    const items = Array.from(customers.values())
      .map((item) => {
        const itemSummary = Array.from(item.itemNames.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, quantity]) => `${name}${quantity > 1 ? ` x${quantity}` : ''}`)
          .join('、');
        return {
          customerName: item.customerName,
          phoneMasked: item.phoneMasked,
          memberLevel: item.memberLevel || '未标注',
          paidAmountText: this.formatMoney(item.paidAmount),
          orderCount: item.orderCount,
          lastOrderTimeText: formatBusinessDateTime(item.lastOrderTime),
          itemsSummary: itemSummary || '未记录明细',
          payMethods: Array.from(item.payMethods).join('、') || '未知',
          customerId: item.customerId,
          paidAmount: Math.round(item.paidAmount * 100) / 100,
          lastOrderTime: item.lastOrderTime.toISOString(),
          orderNos: item.orderNos.slice(0, 5),
          suggestion: item.paidAmount >= 1000 ? '高消费客户，建议结合服务记录做复购承接。' : '建议完成消费后回访与满意度确认。',
        };
      })
      .sort((a, b) => b.paidAmount - a.paidAmount || b.orderCount - a.orderCount)
      .slice(0, queryPlan.limit);

    const totalAmount = items.reduce((total, item) => total + Number(item.paidAmount), 0);
    const totalOrders = items.reduce((total, item) => total + Number(item.orderCount), 0);
    const evidence = this.buildEvidence({
      source: ['ProductOrder', 'PaymentRecord', 'OrderItem', 'Customer'],
      metricDefinition: '消费客户清单 = 查询周期内未取消/未退款订单，按客户聚合有效支付金额；金额优先取支付记录合计，其次取订单 netAmount，再次取 totalAmount。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'status not in cancelled/refunded', 'createdAt=查询周期', `limit=${queryPlan.limit}`],
      sampleSize: orders.length,
      limitations: ['散客或缺失 customerId 的订单按客户姓名聚合；退款中的部分退款订单暂按订单当前有效金额展示。'],
    });

    if (!items.length) {
      return this.noData(queryPlan, evidence, `${range.type === 'yesterday' ? '昨天' : '当前时间范围'}暂无有效消费客户。`);
    }

    const answer = `${this.formatRange(start, end)}共有 ${items.length} 位消费客户，${totalOrders} 笔有效订单，消费合计 ${this.formatMoney(totalAmount)}。`;
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'orderCustomerConsumptionList',
        title: '消费客户清单',
        summary: answer,
        items,
        kpis: [
          { label: '消费客户', value: `${items.length}` },
          { label: '有效订单', value: `${totalOrders}` },
          { label: '消费合计', value: this.formatMoney(totalAmount) },
        ],
      },
      answer,
      evidence,
      actions: [
        { label: '查看订单明细', action: 'orders:open', riskLevel: 'low' },
        { label: '生成复购跟进草稿', action: 'customer.followup.task.draft', riskLevel: 'medium' },
      ],
    };
  }

  private async queryCardExpiryRisk(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const cards = await this.prisma.customerCard.findMany({
      where: { status: 'active', expiryDate: { gte: start, lt: end }, remainingTimes: { gt: 0 }, customer: { storeId: Number(queryPlan.filters.storeId), deletedAt: null } },
      include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
      orderBy: { expiryDate: 'asc' },
      take: queryPlan.limit,
    });
    const items = (cards as any[]).map((card) => ({
      customerCardId: card.id,
      customerId: card.customerId,
      customerName: card.customer?.name,
      phone: this.maskPhone(card.customer?.phone),
      memberLevel: card.customer?.memberLevel,
      cardName: card.cardName,
      remainingTimes: card.remainingTimes,
      totalTimes: card.totalTimes,
      expiryDate: card.expiryDate,
      daysToExpire: this.daysUntil(card.expiryDate),
    }));
    const evidence = this.buildEvidence({
      source: ['CustomerCard', 'Customer'],
      metricDefinition: '卡项到期风险 = active 且 30 天内到期、剩余次数大于 0 的客户次卡。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'status=active', 'remainingTimes>0', 'expiryDate in next_30_days'],
      sampleSize: cards.length,
    });
    if (!items.length) return this.noData(queryPlan, evidence, '未来 30 天暂无有剩余次数且即将到期的次卡。');
    return this.basicSuccess(queryPlan, 'cardExpiryRisk', '卡项到期风险', items, evidence, `${items.length} 张次卡未来 30 天内到期，最近一张为 ${items[0].customerName} 的 ${items[0].cardName}。`);
  }

  private async queryCardUsageAnalysis(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const records = await this.prisma.cardUsageRecord.findMany({
      where: { verifiedAt: { gte: start, lt: end }, customer: { storeId: Number(queryPlan.filters.storeId), deletedAt: null } },
      select: { id: true, customerId: true, cardName: true, projectName: true, times: true, remainingTimes: true, beauticianId: true, verifiedAt: true },
      orderBy: { verifiedAt: 'desc' },
      take: 2000,
    });
    const bucket = new Map<string, { cardName: string; projectName: string; usageTimes: number; recordCount: number; customerIds: Set<number>; beauticianIds: Set<number> }>();
    for (const record of records as any[]) {
      const key = `${record.cardName}__${record.projectName}`;
      const target =
        bucket.get(key) ??
        { cardName: record.cardName, projectName: record.projectName, usageTimes: 0, recordCount: 0, customerIds: new Set<number>(), beauticianIds: new Set<number>() };
      target.usageTimes += this.toNumber(record.times);
      target.recordCount += 1;
      target.customerIds.add(Number(record.customerId));
      if (record.beauticianId) target.beauticianIds.add(Number(record.beauticianId));
      bucket.set(key, target);
    }
    const items = Array.from(bucket.values())
      .map((item) => ({
        cardName: item.cardName,
        projectName: item.projectName,
        usageTimes: item.usageTimes,
        recordCount: item.recordCount,
        customerCount: item.customerIds.size,
        beauticianCount: item.beauticianIds.size,
      }))
      .sort((a, b) => b.usageTimes - a.usageTimes)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['CardUsageRecord', 'Customer'],
      metricDefinition: '卡项核销 = 指定周期内 CardUsageRecord.times 汇总，按卡项和项目聚合。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'verifiedAt=查询周期'],
      sampleSize: records.length,
    });
    if (!items.length) return this.noData(queryPlan, evidence, '当前时间范围内暂无次卡核销记录。');
    return this.basicSuccess(queryPlan, 'cardUsageAnalysis', '卡项核销分析', items, evidence, `核销最多的是 ${items[0].cardName} / ${items[0].projectName}，共 ${items[0].usageTimes} 次。`);
  }

  private async queryMemberBalanceAnalysis(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const accounts = await this.prisma.customerBalanceAccount.findMany({
      where: { storeId: Number(queryPlan.filters.storeId), status: 'active' },
      include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    const items = (accounts as any[])
      .map((account) => {
        const cashBalance = this.toNumber(account.cashBalance);
        const giftBalance = this.toNumber(account.giftBalance);
        return {
          accountId: account.id,
          customerId: account.customerId,
          customerName: account.customer?.name,
          phone: this.maskPhone(account.customer?.phone),
          memberLevel: account.customer?.memberLevel,
          cashBalance,
          giftBalance,
          totalBalance: cashBalance + giftBalance,
          updatedAt: account.updatedAt,
        };
      })
      .filter((item) => item.totalBalance > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance)
      .slice(0, queryPlan.limit);
    const totalBalance = items.reduce((total, item) => total + item.totalBalance, 0);
    const evidence = this.buildEvidence({
      source: ['CustomerBalanceAccount', 'Customer'],
      metricDefinition: '会员卡余额 = active 余额账户 cashBalance + giftBalance，按客户排序展示 Top-K。',
      filters: ['storeId=当前门店', 'status=active', 'totalBalance>0'],
      sampleSize: accounts.length,
    });
    if (!items.length) return this.noData(queryPlan, evidence, '当前门店暂无有效会员卡余额数据。');
    return {
      ...this.basicSuccess(queryPlan, 'memberBalanceAnalysis', '会员卡余额分析', items, evidence, `余额最高的是 ${items[0].customerName}，账户余额 ${this.formatMoney(items[0].totalBalance)}。`),
      card: {
        type: 'memberBalanceAnalysis',
        title: '会员卡余额分析',
        summary: `Top ${items.length} 客户余额合计 ${this.formatMoney(totalBalance)}，余额最高的是 ${items[0].customerName}。`,
        items,
        kpis: [
          { label: 'Top余额合计', value: this.formatMoney(totalBalance) },
          { label: '客户数', value: `${items.length}` },
        ],
      },
    };
  }

  private async queryFinanceCashflowSummary(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const [payments, refunds] = await Promise.all([
      this.prisma.paymentRecord.findMany({
        where: { status: { in: ['paid', 'completed', 'success', '已支付', '已完成'] }, paidAt: { gte: start, lt: end }, order: { storeId } },
        select: { id: true, method: true, amount: true, status: true, paidAt: true },
        take: 1000,
      }),
      this.prisma.refundRecord.findMany({
        where: { status: { in: ['refunded', 'success', 'completed', '已退款', '已完成'] }, refundedAt: { gte: start, lt: end }, order: { storeId } },
        select: { id: true, amount: true, status: true, refundedAt: true },
        take: 1000,
      }),
    ]);
    const incomeAmount = (payments as any[]).reduce((total, item) => total + this.toNumber(item.amount), 0);
    const refundAmount = (refunds as any[]).reduce((total, item) => total + this.toNumber(item.amount), 0);
    const payMethodMap = new Map<string, { payMethod: string; incomeAmount: number; paymentCount: number }>();
    for (const payment of payments as any[]) {
      const key = String(payment.method || '未知');
      const target = payMethodMap.get(key) ?? { payMethod: key, incomeAmount: 0, paymentCount: 0 };
      target.incomeAmount += this.toNumber(payment.amount);
      target.paymentCount += 1;
      payMethodMap.set(key, target);
    }
    const items = Array.from(payMethodMap.values()).sort((a, b) => b.incomeAmount - a.incomeAmount);
    const evidence = this.buildEvidence({
      source: ['PaymentRecord', 'RefundRecord', 'ProductOrder'],
      metricDefinition: '财务现金流 = 已支付收款金额 - 已完成退款金额；按支付记录 paidAt 和退款 refundedAt 统计。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'payment.status in paid/completed/success', 'refund.status in refunded/success/completed'],
      sampleSize: payments.length + refunds.length,
    });
    if (!payments.length && !refunds.length) return this.noData(queryPlan, evidence, '当前时间范围内暂无收款或退款流水。');
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'financeCashflowSummary',
        title: '财务现金流摘要',
        summary: `当前时间范围实收 ${this.formatMoney(incomeAmount)}，退款 ${this.formatMoney(refundAmount)}，净额 ${this.formatMoney(incomeAmount - refundAmount)}。`,
        items,
        kpis: [
          { label: '实收', value: this.formatMoney(incomeAmount) },
          { label: '退款', value: this.formatMoney(refundAmount) },
          { label: '净额', value: this.formatMoney(incomeAmount - refundAmount) },
        ],
      },
      answer: `当前时间范围实收 ${this.formatMoney(incomeAmount)}，退款 ${this.formatMoney(refundAmount)}，净额 ${this.formatMoney(incomeAmount - refundAmount)}。`,
      evidence,
      actions: [{ label: '查看财务明细', action: 'finance:open', riskLevel: 'medium' }],
    };
  }

  private async queryMarketingConversion(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const [automationAttributions, pageAttributions, recommendationEvents] = await Promise.all([
      this.prisma.marketingAttribution.findMany({
        where: { occurredAt: { gte: start, lt: end }, order: { storeId } },
        include: {
          strategy: { select: { id: true, name: true, status: true } },
          order: { select: { id: true, totalAmount: true, status: true } },
        },
        take: 1000,
      }),
      this.prisma.marketingPageAttribution.findMany({
        where: { convertedAt: { gte: start, lt: end }, order: { storeId } },
        include: {
          page: { select: { id: true, title: true, sourceType: true, status: true } },
          order: { select: { id: true, totalAmount: true, status: true } },
        },
        take: 1000,
      }),
      this.prisma.recommendationEvent.findMany({
        where: { storeId, createdAt: { gte: start, lt: end } },
        select: { id: true, eventType: true, orderId: true, customerId: true, createdAt: true },
        take: 2000,
      }),
    ]);

    const bucket = new Map<
      string,
      {
        sourceType: string;
        campaignId: string | number;
        campaignName: string;
        conversionCount: number;
        attributedRevenue: number;
        orderIds: Set<number>;
        customerIds: Set<number>;
      }
    >();

    for (const item of automationAttributions as any[]) {
      const key = `automation:${item.strategyId}`;
      const target =
        bucket.get(key) ??
        {
          sourceType: '自动化',
          campaignId: item.strategyId,
          campaignName: item.strategy?.name ?? `自动化策略 ${item.strategyId}`,
          conversionCount: 0,
          attributedRevenue: 0,
          orderIds: new Set<number>(),
          customerIds: new Set<number>(),
        };
      target.conversionCount += 1;
      target.attributedRevenue += this.toNumber(item.attributedRevenue || item.order?.totalAmount);
      target.orderIds.add(Number(item.orderId));
      target.customerIds.add(Number(item.customerId));
      bucket.set(key, target);
    }

    for (const item of pageAttributions as any[]) {
      const key = `page:${item.pageId}`;
      const target =
        bucket.get(key) ??
        {
          sourceType: '活动页',
          campaignId: item.pageId,
          campaignName: item.page?.title ?? `活动页 ${item.pageId}`,
          conversionCount: 0,
          attributedRevenue: 0,
          orderIds: new Set<number>(),
          customerIds: new Set<number>(),
        };
      target.conversionCount += 1;
      target.attributedRevenue += this.toNumber(item.attributedRevenue || item.order?.totalAmount);
      target.orderIds.add(Number(item.orderId));
      target.customerIds.add(Number(item.customerId));
      bucket.set(key, target);
    }

    const recommendationConversions = (recommendationEvents as any[]).filter((item) => item.orderId);
    if (recommendationConversions.length) {
      const key = 'recommendation:order';
      const target =
        bucket.get(key) ??
        {
          sourceType: '推荐',
          campaignId: 'recommendation',
          campaignName: 'Ami 推荐转化',
          conversionCount: 0,
          attributedRevenue: 0,
          orderIds: new Set<number>(),
          customerIds: new Set<number>(),
        };
      for (const event of recommendationConversions) {
        target.conversionCount += 1;
        target.orderIds.add(Number(event.orderId));
        target.customerIds.add(Number(event.customerId));
      }
      bucket.set(key, target);
    }

    const items = Array.from(bucket.values())
      .map((item) => ({
        sourceType: item.sourceType,
        campaignId: item.campaignId,
        campaignName: item.campaignName,
        conversionCount: item.conversionCount,
        attributedRevenue: item.attributedRevenue,
        orderCount: item.orderIds.size,
        customerCount: item.customerIds.size,
      }))
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue || b.conversionCount - a.conversionCount)
      .slice(0, queryPlan.limit);
    const totalRevenue = items.reduce((total, item) => total + item.attributedRevenue, 0);
    const totalConversions = items.reduce((total, item) => total + item.conversionCount, 0);
    const evidence = this.buildEvidence({
      source: ['MarketingAttribution', 'MarketingPageAttribution', 'RecommendationEvent', 'ProductOrder'],
      metricDefinition: '营销转化 = 查询周期内自动化归因、活动页归因和推荐事件带订单记录的转化摘要；无归因记录时不推断效果。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'attribution/order linked to current store', 'occurredAt/convertedAt/createdAt=查询周期'],
      sampleSize: automationAttributions.length + pageAttributions.length + recommendationEvents.length,
      limitations: ['推荐事件若缺少订单金额，仅统计转化次数，不估算收入。'],
    });

    if (!items.length) return this.noData(queryPlan, evidence, '当前周期没有可追溯的营销归因或推荐转化记录，不能判断活动效果。');
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'marketingConversion',
        title: '营销转化分析',
        summary: `当前周期可追溯营销转化 ${totalConversions} 次，归因收入 ${this.formatMoney(totalRevenue)}。`,
        items,
        kpis: [
          { label: '转化次数', value: `${totalConversions}` },
          { label: '归因收入', value: this.formatMoney(totalRevenue) },
          { label: '来源数', value: `${items.length}` },
        ],
      },
      answer: `当前周期可追溯营销转化 ${totalConversions} 次，归因收入 ${this.formatMoney(totalRevenue)}。表现最明显的是 ${items[0].campaignName}。`,
      evidence,
      actions: [{ label: '查看营销效果', action: 'marketing:effects', riskLevel: 'low' }],
    };
  }

  private async queryAutomationExecutionSummary(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const executions = await this.prisma.marketingAutomationExecution.findMany({
      where: { executedAt: { gte: start, lt: end } },
      include: {
        strategy: { select: { id: true, name: true, status: true, source: true } },
        touches: { select: { id: true, status: true, actualRevenue: true, convertedAt: true, customerId: true } },
        attributions: { select: { id: true, attributedRevenue: true, customerId: true, orderId: true } },
      },
      orderBy: { executedAt: 'desc' },
      take: 500,
    });

    const bucket = new Map<
      number,
      {
        strategyId: number;
        strategyName: string;
        status: string;
        executionCount: number;
        triggeredCount: number;
        reachedCount: number;
        convertedCount: number;
        attributedRevenue: number;
        customerIds: Set<number>;
        lastExecutedAt?: Date;
      }
    >();

    for (const execution of executions as any[]) {
      const strategyId = Number(execution.strategyId);
      const target =
        bucket.get(strategyId) ??
        {
          strategyId,
          strategyName: execution.strategy?.name ?? execution.strategyName,
          status: execution.strategy?.status ?? '',
          executionCount: 0,
          triggeredCount: 0,
          reachedCount: 0,
          convertedCount: 0,
          attributedRevenue: 0,
          customerIds: new Set<number>(),
          lastExecutedAt: execution.executedAt,
        };
      target.executionCount += 1;
      target.triggeredCount += this.toNumber(execution.triggeredCount);
      target.reachedCount += this.toNumber(execution.reachedCount);
      for (const touch of execution.touches ?? []) {
        if (touch.customerId) target.customerIds.add(Number(touch.customerId));
        if (touch.convertedAt || touch.status === 'converted') target.convertedCount += 1;
        target.attributedRevenue += this.toNumber(touch.actualRevenue);
      }
      for (const attribution of execution.attributions ?? []) {
        if (attribution.customerId) target.customerIds.add(Number(attribution.customerId));
        target.attributedRevenue += this.toNumber(attribution.attributedRevenue);
      }
      if (!target.lastExecutedAt || new Date(execution.executedAt).getTime() > new Date(target.lastExecutedAt).getTime()) {
        target.lastExecutedAt = execution.executedAt;
      }
      bucket.set(strategyId, target);
    }

    const items = Array.from(bucket.values())
      .map((item) => ({
        strategyId: item.strategyId,
        strategyName: item.strategyName,
        status: item.status,
        executionCount: item.executionCount,
        triggeredCount: item.triggeredCount,
        reachedCount: item.reachedCount,
        convertedCount: item.convertedCount,
        attributedRevenue: item.attributedRevenue,
        customerCount: item.customerIds.size,
        reachRateText: this.formatPercent(item.triggeredCount ? item.reachedCount / item.triggeredCount : 0),
        conversionRateText: this.formatPercent(item.reachedCount ? item.convertedCount / item.reachedCount : 0),
        lastExecutedAt: item.lastExecutedAt,
      }))
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue || b.convertedCount - a.convertedCount)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['MarketingAutomationExecution', 'MarketingAutomationTouch', 'MarketingAttribution'],
      metricDefinition: '自动化执行复盘 = 查询周期内自动化执行次数、触达人数、转化次数和归因收入汇总。',
      dateRange: this.formatRange(start, end),
      filters: ['executedAt=查询周期'],
      sampleSize: executions.length,
    });

    if (!items.length) return this.noData(queryPlan, evidence, '当前周期没有自动化执行记录。');
    const totalRevenue = items.reduce((total, item) => total + item.attributedRevenue, 0);
    const totalConversions = items.reduce((total, item) => total + item.convertedCount, 0);
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'automationExecutionSummary',
        title: '自动化执行复盘',
        summary: `当前周期自动化转化 ${totalConversions} 次，归因收入 ${this.formatMoney(totalRevenue)}。`,
        items,
        kpis: [
          { label: '策略数', value: `${items.length}` },
          { label: '转化次数', value: `${totalConversions}` },
          { label: '归因收入', value: this.formatMoney(totalRevenue) },
        ],
      },
      answer: `当前周期自动化转化 ${totalConversions} 次，归因收入 ${this.formatMoney(totalRevenue)}。表现最好的是 ${items[0].strategyName}。`,
      evidence,
      actions: [{ label: '查看自动化详情', action: 'automation:summary', riskLevel: 'low' }],
    };
  }

  private async querySupplierPurchaseAdvice(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const [products, orderItems] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          safetyStock: true,
          unit: true,
          costPrice: true,
          supplier: true,
          minPurchaseQty: true,
          suppliers: {
            where: { supplier: { status: 'active', deletedAt: null } },
            select: {
              supplyPrice: true,
              moq: true,
              leadDays: true,
              isPrimary: true,
              supplier: { select: { id: true, name: true, paymentTerms: true } },
            },
          },
        },
        take: 1000,
      }),
      this.prisma.orderItem.findMany({
        where: { itemType: 'product', itemId: { not: null }, order: { storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: start, lt: end } } },
        include: { order: { select: { id: true, createdAt: true } } },
        take: 2000,
      }),
    ]);

    const salesByProduct = new Map<number, number>();
    for (const item of orderItems as any[]) {
      const productId = Number(item.itemId);
      if (!productId) continue;
      salesByProduct.set(productId, (salesByProduct.get(productId) ?? 0) + this.toNumber(item.quantity));
    }
    const items = (products as any[])
      .map((product) => {
        const supplier = [...(product.suppliers ?? [])].sort((a: any, b: any) => Number(b.isPrimary) - Number(a.isPrimary))[0];
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const salesQuantity = salesByProduct.get(Number(product.id)) ?? 0;
        const suggestedBase = Math.max(0, safetyStock - currentStock, Math.ceil((salesQuantity / 30) * 14) - currentStock);
        const moq = Number(supplier?.moq ?? product.minPurchaseQty ?? 0);
        const suggestedQty = moq > 0 ? Math.max(suggestedBase, moq) : suggestedBase;
        const supplyPrice = this.toNumber(supplier?.supplyPrice ?? product.costPrice);
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          supplierId: supplier?.supplier?.id,
          supplierName: supplier?.supplier?.name ?? product.supplier ?? '未配置供应商',
          currentStock,
          safetyStock,
          salesQuantity,
          unit: product.unit,
          suggestedQty,
          moq,
          leadDays: supplier?.leadDays ?? null,
          supplyPrice,
          estimatedAmount: suggestedQty * supplyPrice,
          priorityScore: suggestedBase * 10 + salesQuantity + (supplier?.isPrimary ? 5 : 0),
        };
      })
      .filter((item) => item.suggestedQty > 0)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['Product', 'ProductSupplier', 'Supplier', 'OrderItem'],
      metricDefinition: '供应链采购建议 = 补货需求结合主供应商、供货价、起订量和交期生成采购优先级。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', 'Supplier.status=active', 'OrderItem.itemType=product'],
      sampleSize: products.length + orderItems.length,
      limitations: ['仅生成采购建议，不自动创建采购单；未配置供应商的商品会标记为未配置供应商。'],
    });
    if (!items.length) return this.noData(queryPlan, evidence, '当前没有触发采购建议的商品。');
    return {
      ...this.basicSuccess(
        queryPlan,
        'supplierPurchaseAdvice',
        '供应链采购建议',
        items,
        evidence,
        `优先采购 ${items[0].productName}，建议数量 ${items[0].suggestedQty}${items[0].unit || ''}，供应商 ${items[0].supplierName}。`,
      ),
      actions: [{ label: '生成采购建议草稿', action: 'purchase:draft:context', riskLevel: 'medium' }],
    };
  }

  private async queryBusinessAnomalyAlert(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const storeId = Number(queryPlan.filters.storeId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    const [orders, reservations, products, customers, failedExecutions] = await Promise.all([
      this.prisma.productOrder.findMany({
        where: { storeId, status: { notIn: CANCELLED_ORDER_STATUSES }, createdAt: { gte: start, lt: end } },
        select: { id: true, totalAmount: true },
        take: 500,
      }),
      this.prisma.reservation.findMany({
        where: { storeId, date: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { id: true, status: true },
        take: 500,
      }),
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, currentStock: true, safetyStock: true },
        take: 500,
      }),
      this.prisma.customer.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, totalSpent: true, lastVisitDate: true },
        take: 500,
      }),
      this.prisma.marketingAutomationExecution.findMany({
        where: { executedAt: { gte: start, lt: end }, status: { in: ['failed', 'error', '失败'] } },
        select: { id: true, strategyName: true, status: true, message: true, executedAt: true },
        take: 100,
      }),
    ]);
    const revenue = (orders as any[]).reduce((total, order) => total + this.toNumber(order.totalAmount), 0);
    const arrivedCount = (reservations as any[]).filter((item) => ['checked_in', 'completed'].includes(String(item.status))).length;
    const noShowCount = (reservations as any[]).filter((item) => /no_show|爽约|未到店/.test(String(item.status))).length;
    const lowStock = (products as any[])
      .filter((product) => this.toNumber(product.currentStock) <= this.toNumber(product.safetyStock))
      .slice(0, 3);
    const churnRisk = (customers as any[])
      .filter((customer) => this.daysSince(customer.lastVisitDate) >= 60 || this.toNumber(customer.totalSpent) >= 8000)
      .slice(0, 3);
    const items: Array<Record<string, unknown>> = [];
    if (!orders.length) {
      items.push({ domain: '订单', severity: 'high', title: '当前周期暂无有效收入', metricValue: revenue, threshold: '订单数 > 0', suggestion: '检查预约到店、收银和活动引流是否异常。' });
    }
    if (reservations.length && arrivedCount / reservations.length < 0.5) {
      items.push({ domain: '预约', severity: 'medium', title: '预约到店率偏低', metricValue: this.formatPercent(arrivedCount / reservations.length), threshold: '到店率 >= 50%', suggestion: '前台优先确认未到店预约，必要时改期或标记爽约。' });
    }
    if (noShowCount > 0) {
      items.push({ domain: '预约', severity: 'medium', title: '存在未到店/爽约预约', metricValue: noShowCount, threshold: '爽约数 = 0', suggestion: '按预约时间回访并更新客户标签。' });
    }
    for (const product of lowStock) {
      items.push({ domain: '库存', severity: 'medium', title: `${product.name} 库存不足`, metricValue: this.toNumber(product.currentStock), threshold: this.toNumber(product.safetyStock), suggestion: '生成补货建议或调整项目耗材安排。' });
    }
    for (const customer of churnRisk) {
      items.push({ domain: '客户', severity: 'medium', title: `${customer.name} 存在流失风险`, metricValue: `${this.daysSince(customer.lastVisitDate)} 天未到店`, threshold: '60 天', suggestion: '安排顾问邀约或专属活动唤醒。' });
    }
    for (const execution of failedExecutions as any[]) {
      items.push({ domain: '自动化', severity: 'high', title: `${execution.strategyName} 执行失败`, metricValue: execution.status, threshold: '执行成功', suggestion: execution.message || '查看自动化执行详情并重试。' });
    }
    const evidence = this.buildEvidence({
      source: ['ProductOrder', 'Reservation', 'Product', 'Customer', 'MarketingAutomationExecution'],
      metricDefinition: '经营异常主动提醒 = 当前周期内收入、到店、库存、客户流失和自动化失败的规则化扫描。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId=当前门店', '订单排除取消/退款', '预约排除取消', '商品/客户未删除'],
      sampleSize: orders.length + reservations.length + products.length + customers.length + failedExecutions.length,
      limitations: ['P2 当前为规则扫描，暂未做同比/环比异常检测。'],
    });
    if (!items.length) return this.noData(queryPlan, evidence, '当前周期未发现明显经营异常。');
    return {
      ...this.basicSuccess(queryPlan, 'businessAnomalyAlert', '经营异常主动提醒', items.slice(0, queryPlan.limit), evidence, `发现 ${items.length} 条经营异常，优先处理 ${String(items[0].title)}。`),
      actions: [{ label: '查看经营概览', action: 'business-query:business_overview', riskLevel: 'low' }],
    };
  }

  private async queryMultiStoreComparison(queryPlan: BusinessQueryPlan): Promise<BusinessQueryResponse> {
    const operatorId = Number(queryPlan.filters.operatorId);
    const range = queryPlan.filters.dateRange as Record<string, string>;
    const start = new Date(range.start);
    const end = new Date(range.end);
    if (!operatorId) {
      return this.buildUnsupportedResponse({
        ...queryPlan,
        capability: 'multi_store_comparison',
        clarificationQuestion: '多门店对比需要登录用户身份和门店授权范围。',
      });
    }
    const userStores = await this.prisma.userStore.findMany({
      where: { userId: operatorId },
      select: { storeId: true, store: { select: { id: true, name: true, city: true, status: true, deletedAt: true } } },
    });
    const allowedStores = (userStores as any[])
      .filter((item) => item.store && !item.store.deletedAt && item.store.status !== 'disabled')
      .map((item) => item.store);
    if (allowedStores.length <= 1) {
      return this.noData(
        queryPlan,
        this.buildEvidence({
          source: ['UserStore', 'Store'],
          metricDefinition: '多门店对比必须基于当前用户授权门店集合执行。',
          filters: ['operatorId=当前用户', 'authorizedStoreCount>1'],
          sampleSize: allowedStores.length,
          limitations: ['当前用户未授权多个门店，因此不会查询其他门店。'],
        }),
        '当前账号未授权多个门店，无法执行多门店对比。',
      );
    }
    const storeIds = allowedStores.map((store: any) => Number(store.id));
    const [orders, reservations, customers, products] = await Promise.all([
      this.prisma.productOrder.findMany({
        where: { storeId: { in: storeIds }, status: { notIn: CANCELLED_ORDER_STATUSES }, createdAt: { gte: start, lt: end } },
        select: { id: true, storeId: true, totalAmount: true },
        take: 5000,
      }),
      this.prisma.reservation.findMany({
        where: { storeId: { in: storeIds }, date: { gte: start, lt: end }, status: { not: 'cancelled' } },
        select: { id: true, storeId: true },
        take: 5000,
      }),
      this.prisma.customer.findMany({
        where: { storeId: { in: storeIds }, deletedAt: null },
        select: { id: true, storeId: true },
        take: 5000,
      }),
      this.prisma.product.findMany({
        where: { storeId: { in: storeIds }, deletedAt: null },
        select: { id: true, storeId: true, currentStock: true, safetyStock: true },
        take: 5000,
      }),
    ]);
    const items = allowedStores
      .map((store: any) => {
        const storeOrders = (orders as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const storeReservations = (reservations as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const storeCustomers = (customers as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const storeProducts = (products as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const salesAmount = storeOrders.reduce((total, order) => total + this.toNumber(order.totalAmount), 0);
        const lowStockCount = storeProducts.filter((product) => this.toNumber(product.currentStock) <= this.toNumber(product.safetyStock)).length;
        return {
          storeId: store.id,
          storeName: store.name,
          city: store.city,
          salesAmount,
          orderCount: storeOrders.length,
          reservationCount: storeReservations.length,
          customerCount: storeCustomers.length,
          lowStockCount,
          averageOrderValue: storeOrders.length ? salesAmount / storeOrders.length : 0,
        };
      })
      .sort((a, b) => b.salesAmount - a.salesAmount)
      .slice(0, queryPlan.limit);
    const evidence = this.buildEvidence({
      source: ['UserStore', 'Store', 'ProductOrder', 'Reservation', 'Customer', 'Product'],
      metricDefinition: '多门店对比 = 当前用户授权门店范围内收入、订单、预约、客户和低库存汇总。',
      dateRange: this.formatRange(start, end),
      filters: ['storeId in 当前用户授权门店', '订单排除取消/退款', '预约排除取消'],
      sampleSize: orders.length + reservations.length + customers.length + products.length,
    });
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: {
        type: 'multiStoreComparison',
        title: '多门店对比',
        summary: `已对比 ${items.length} 个授权门店，收入最高为 ${items[0].storeName}。`,
        items,
        kpis: [
          { label: '授权门店', value: `${items.length}` },
          { label: '最高收入门店', value: `${items[0].storeName}` },
          { label: '总收入', value: this.formatMoney(items.reduce((total, item) => total + item.salesAmount, 0)) },
        ],
      },
      answer: `已对比 ${items.length} 个授权门店，收入最高为 ${items[0].storeName}，收入 ${this.formatMoney(items[0].salesAmount)}。`,
      evidence,
      actions: [],
    };
  }

  private basicSuccess(
    queryPlan: BusinessQueryPlan,
    type: string,
    title: string,
    items: Array<Record<string, unknown>>,
    evidence: BusinessQueryEvidence,
    answer: string,
  ): BusinessQueryResponse {
    return {
      requestId: queryPlan.requestId,
      status: 'success',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card: { type, title, summary: answer, items },
      answer,
      evidence,
      actions: [],
    };
  }

  private buildClarifyResponse(queryPlan: BusinessQueryPlan): BusinessQueryResponse {
    return {
      requestId: queryPlan.requestId,
      status: 'clarify',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      answer: queryPlan.clarificationQuestion ?? '请补充要查询的业务领域。',
      evidence: this.emptyEvidence('尚未执行数据查询'),
      actions: [],
    };
  }

  private buildUnsupportedResponse(queryPlan: BusinessQueryPlan): BusinessQueryResponse {
    const capability = getBusinessQueryCapability(queryPlan.capability);
    return {
      requestId: queryPlan.requestId,
      status: 'unsupported',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      answer: capability
        ? `已识别为「${capability.name}」，该问数能力尚未接入受控查询。当前不会让 AI 猜测结果。`
        : queryPlan.clarificationQuestion || '该问题暂未匹配到可执行的数据查询能力。',
      evidence: this.emptyEvidence('能力尚未实现'),
      actions: [],
    };
  }

  private noData(queryPlan: BusinessQueryPlan, evidence: BusinessQueryEvidence, answer: string): BusinessQueryResponse {
    return {
      requestId: queryPlan.requestId,
      status: 'no_data',
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      answer,
      evidence,
      actions: [],
    };
  }

  private async trySemanticQueryAdapter(
    params: { question: string; storeId: number; role?: BusinessQueryRole; operatorId?: number; context?: BusinessQueryContext },
    queryPlan: BusinessQueryPlan,
    role: BusinessQueryRole,
  ): Promise<BusinessQueryResponse | null> {
    if (!this.queryPlanner || !this.semanticQueryExecutor) return null;
    if (!this.isSemanticQueryMigratedCapability(queryPlan.capability)) return null;

    const task = this.buildSemanticBusinessTask(params.question, queryPlan, role);
    const planned = this.queryPlanner.plan({
      task,
      role,
      storeId: params.storeId,
      operatorId: params.operatorId,
      capabilityId: this.mapBusinessQueryCapabilityToUnifiedCapability(queryPlan.capability),
    });
    if (!planned.plan) {
      return {
        requestId: queryPlan.requestId,
        status: 'unsupported',
        domain: queryPlan.domain,
        capability: queryPlan.capability,
        queryPlan,
        answer: planned.rejectedReason ?? '该查询暂不支持。',
        evidence: this.emptyEvidence(planned.rejectedReason ?? '查询计划未通过安全校验'),
        actions: [],
      };
    }

    const result = await this.semanticQueryExecutor.execute(planned.plan);
    return this.fromSemanticQueryResult(queryPlan, result);
  }

  private isSemanticQueryMigratedCapability(capability: BusinessQueryCapabilityId) {
    return new Set<BusinessQueryCapabilityId>([
      'order_revenue_analysis',
      'product_sales_trend',
      'inventory_alert',
      'member_balance_analysis',
      'card_usage_analysis',
    ]).has(capability);
  }

  private buildSemanticBusinessTask(question: string, queryPlan: BusinessQueryPlan, role: BusinessQueryRole): BusinessTask {
    const preParsed = this.preParser?.parse({ message: question, role })?.task;
    const mappedMetrics = this.mapCapabilityToSemanticMetrics(queryPlan.capability);
    const mappedDomain = this.mapCapabilityToBusinessTaskDomain(queryPlan.capability, queryPlan.domain);
    return {
      taskType: preParsed?.taskType && preParsed.taskType !== 'clarify' ? preParsed.taskType : queryPlan.sort ? 'ranking' : 'query',
      domain: mappedDomain,
      objective: question,
      entities: preParsed?.entities ?? [],
      metrics: mappedMetrics.length ? mappedMetrics : preParsed?.metrics ?? [],
      filters: { ...(preParsed?.filters ?? {}), ...queryPlan.filters },
      timeRange: preParsed?.timeRange ?? this.businessTimeRangeFromQueryPlan(queryPlan),
      sort: preParsed?.sort ?? (queryPlan.sort ? [{ field: this.mapSortField(queryPlan.sort.field), direction: queryPlan.sort.direction }] : undefined),
      limit: queryPlan.limit,
      outputMode: preParsed?.outputMode ?? (queryPlan.sort ? 'ranked_list' : 'card'),
      riskLevel: 'low',
      requiresApproval: false,
      missingSlots: [],
      confidence: Math.max(preParsed?.confidence ?? 0, 0.82),
      actorRole: role,
    };
  }

  private mapCapabilityToSemanticMetrics(capability: BusinessQueryCapabilityId) {
    const map: Partial<Record<BusinessQueryCapabilityId, string[]>> = {
      order_revenue_analysis: ['paid_amount', 'order_count', 'average_order_value'],
      product_sales_trend: ['product_sales_quantity', 'product_sales_amount', 'product_sales_growth'],
      inventory_alert: ['stock_risk_score'],
      member_balance_analysis: ['member_balance'],
      card_usage_analysis: ['card_usage_times'],
    };
    return map[capability] ?? [];
  }

  private mapCapabilityToBusinessTaskDomain(capability: BusinessQueryCapabilityId, fallback: BusinessQueryDomain): BusinessTask['domain'] {
    if (capability === 'order_revenue_analysis') return 'order';
    if (capability === 'product_sales_trend') return 'product';
    if (capability === 'inventory_alert') return 'inventory';
    if (capability === 'member_balance_analysis') return 'memberCard';
    if (capability === 'card_usage_analysis') return 'card';
    return fallback === 'unknown' ? 'business' : fallback;
  }

  private mapBusinessQueryCapabilityToUnifiedCapability(capability: BusinessQueryCapabilityId) {
    const map: Partial<Record<BusinessQueryCapabilityId, string>> = {
      order_customer_consumption_list: 'order_customer_consumption_list',
      order_revenue_analysis: 'order_revenue_analysis',
      product_sales_trend: 'product_sales_ranking',
      inventory_alert: 'inventory_risk_ranking',
      member_balance_analysis: 'card_member_business_diagnosis',
      card_usage_analysis: 'card_member_business_diagnosis',
    };
    return map[capability] ?? 'business_query';
  }

  private businessTimeRangeFromQueryPlan(queryPlan: BusinessQueryPlan): BusinessTask['timeRange'] {
    const range = queryPlan.filters.dateRange as Record<string, string> | undefined;
    const type = String(range?.type ?? '');
    if (type === 'today') return { preset: 'today', label: '今天' };
    if (type === 'yesterday') return { preset: 'yesterday', label: '昨天' };
    if (type === 'month_to_date') return { preset: 'this_month', label: '本月' };
    if (type === 'next_30_days') return { preset: 'next_30_days', label: '未来30天' };
    return { preset: 'last_30_days', label: '近30天' };
  }

  private mapSortField(field: string) {
    const map: Record<string, string> = {
      growthRate: 'product_sales_growth',
      salesAmount: 'product_sales_amount',
      quantity: 'product_sales_quantity',
      totalBalance: 'member_balance',
      usageTimes: 'card_usage_times',
      stockGap: 'stock_risk_score',
    };
    return map[field] ?? field;
  }

  private fromSemanticQueryResult(queryPlan: BusinessQueryPlan, result: SemanticQueryResult): BusinessQueryResponse {
    const status: BusinessQueryResponse['status'] =
      result.status === 'success' ? 'success' : result.status === 'no_data' ? 'no_data' : result.status === 'rejected' ? 'unsupported' : 'unsupported';
    const cardType = this.cardTypeForCapability(queryPlan.capability);
    return {
      requestId: queryPlan.requestId,
      status,
      domain: queryPlan.domain,
      capability: queryPlan.capability,
      queryPlan,
      card:
        result.status === 'success'
          ? {
              type: cardType,
              title: result.title,
              summary: result.summary,
              items: result.rows,
              kpis: result.kpis,
            }
          : undefined,
      answer: result.summary,
      evidence: {
        dateRange: result.userEvidence?.dateRange,
        source: result.auditEvidence.source,
        sourceTables: result.auditEvidence.sourceTables ?? result.auditEvidence.source,
        filters: result.auditEvidence.filters,
        metricDefinition: result.auditEvidence.metricDefinition,
        sampleSize: result.auditEvidence.sampleSize,
        limitations: result.auditEvidence.limitations,
      },
      actions: result.actions,
    };
  }

  private cardTypeForCapability(capability: BusinessQueryCapabilityId) {
    return getBusinessQueryCapability(capability)?.cardType ?? capability;
  }

  private async logAudit(params: {
    queryPlan: BusinessQueryPlan;
    response?: BusinessQueryResponse;
    operatorId?: number;
    storeId: number;
    latencyMs: number;
    status?: string;
    error?: unknown;
  }) {
    try {
      await this.prisma.aiAuditLog.create({
        data: {
          userId: params.operatorId,
          storeId: params.storeId,
          scenario: 'business_query',
          provider: 'ami_core',
          model: 'business-query-router',
          inputTokens: 0,
          outputTokens: 0,
          inputSummary: JSON.stringify({
            question: params.queryPlan.originalQuestion,
            domain: params.queryPlan.domain,
            capability: params.queryPlan.capability,
            filters: params.queryPlan.filters,
          }).slice(0, 200),
          outputSummary: JSON.stringify({
            status: params.response?.status ?? 'failed',
            capability: params.response?.capability ?? params.queryPlan.capability,
            answer: params.response?.answer ?? this.getErrorMessage(params.error),
            sampleSize: params.response?.evidence.sampleSize,
          }).slice(0, 200),
          safetyBlocked: params.response?.status === 'unsupported',
          latencyMs: params.latencyMs,
          status: params.status ?? params.response?.status ?? 'success',
        },
      });
    } catch (error) {
      console.warn('Business query audit log write failed', error);
    }
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error || '');
  }

  private buildEvidence(input: BusinessQueryEvidence): BusinessQueryEvidence {
    return {
      ...input,
      sourceTables: input.sourceTables?.length ? input.sourceTables : input.source,
    };
  }

  private emptyEvidence(reason: string): BusinessQueryEvidence {
    return {
      source: [],
      sourceTables: [],
      filters: [],
      metricDefinition: reason,
      limitations: [reason],
    };
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private startOfWeek(date: Date) {
    const next = this.startOfDay(date);
    const day = next.getDay() || 7;
    next.setDate(next.getDate() - day + 1);
    return next;
  }

  private getOrderPaidAmount(order: Record<string, unknown>) {
    const paymentRecords = Array.isArray(order.paymentRecords) ? order.paymentRecords as Array<Record<string, unknown>> : [];
    const paidByRecords = paymentRecords
      .filter((payment) => !/cancel|failed|void|取消|失败/.test(String(payment.status || '').toLowerCase()))
      .reduce((total, payment) => total + this.toNumber(payment.amount), 0);
    if (paidByRecords > 0) return paidByRecords;
    const netAmount = this.toNumber(order.netAmount);
    if (netAmount > 0) return netAmount;
    return this.toNumber(order.totalAmount);
  }

  private classifyTerminalConversationFailure(conversation: Record<string, unknown>) {
    const texts = this.extractTerminalMessageTexts(conversation.messages);
    const signals: Array<ReturnType<typeof this.getTerminalFailureSignal>> = [];
    const seen = new Set<string>();
    const add = (category: string, text?: string) => {
      if (seen.has(category)) return;
      seen.add(category);
      signals.push(this.getTerminalFailureSignal(category, text ? this.truncateText(text, 120) : undefined));
    };

    if (!texts.length && this.toNumber(conversation.messageCount) === 0) add('empty_conversation');

    for (const text of texts) {
      if (/缺少设备认证令牌|设备认证令牌|设备认证|认证失败|会话初始化失败|登录态|token/i.test(text)) add('device_auth_missing', text);
      if (/暂时无法回复|无法回复|无法处理|暂不支持|unsupported|与本门店业务无关|需要补充条件/i.test(text)) {
        add('unsupported_business_question', text);
      }
      if (/重复刷新|一直刷新|循环刷新|反复刷新|不稳定/i.test(text)) add('repeated_refresh', text);
      if (/timeout|超时|接口失败|请求失败|网络异常|Failed to fetch|NetworkError|500|502|503|报错/i.test(text)) {
        add('api_or_network_error', text);
      }
      if (/排班|预约|忙碌|请假|正常|切换状态/.test(text) && /失败|无法|不能|不生效|报错|卡住/.test(text)) {
        add('schedule_interaction_failure', text);
      }
      if (/收银|收款|支付|核销|次卡|订单/.test(text) && /失败|无法|不能|很长|卡住|报错|超时/.test(text)) {
        add('cashier_card_flow_failure', text);
      }
    }

    return signals;
  }

  private extractTerminalMessageTexts(value: unknown): string[] {
    return this.asTerminalMessageArray(value)
      .map((item) => {
        if (typeof item === 'string') return item;
        if (!item || typeof item !== 'object') return '';
        const record = item as Record<string, unknown>;
        const text = record.content ?? record.text ?? record.message ?? record.error ?? record.errorMessage ?? record.title;
        return typeof text === 'string' ? text : '';
      })
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  private asTerminalMessageArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.messages)) return record.messages;
      if (Array.isArray(record.items)) return record.items;
    }
    if (typeof value === 'string') {
      try {
        return this.asTerminalMessageArray(JSON.parse(value));
      } catch {
        return [value];
      }
    }
    return [];
  }

  private getTerminalFailureSignal(category: string, sampleMessage?: string) {
    const configs: Record<
      string,
      {
        failureCategoryLabel: string;
        candidateCapabilityName: string;
        candidateReason: string;
        recommendation: string;
      }
    > = {
      device_offline: {
        failureCategoryLabel: '设备离线或状态异常',
        candidateCapabilityName: '终端设备在线诊断与修复',
        candidateReason: '终端设备状态不是在线或正常，影响前台连续使用。',
        recommendation: '检查设备网络、登录状态和终端服务进程，必要时重新绑定设备。',
      },
      network_unstable: {
        failureCategoryLabel: '网络异常',
        candidateCapabilityName: '终端网络异常定位',
        candidateReason: '终端网络状态异常，可能导致问答、收银、核销接口失败。',
        recommendation: '检查门店网络、代理和 API 连通性，保留失败时间点用于排查。',
      },
      printer_unavailable: {
        failureCategoryLabel: '打印机异常',
        candidateCapabilityName: '打印机连接修复',
        candidateReason: '打印机状态异常，影响收银小票和服务单打印。',
        recommendation: '检查打印机连接、驱动和默认打印机配置。',
      },
      scanner_unavailable: {
        failureCategoryLabel: '扫码器异常',
        candidateCapabilityName: '扫码器连接修复',
        candidateReason: '扫码器状态异常，影响支付、核销和会员识别。',
        recommendation: '检查扫码器连接、浏览器权限和扫码输入焦点。',
      },
      camera_unavailable: {
        failureCategoryLabel: '摄像头异常',
        candidateCapabilityName: '摄像头连接修复',
        candidateReason: '摄像头状态异常，影响皮肤检测或拍照留档。',
        recommendation: '检查摄像头连接、浏览器权限和系统占用状态。',
      },
      low_battery: {
        failureCategoryLabel: '电量低',
        candidateCapabilityName: '终端电量维护提醒',
        candidateReason: '终端电量过低，可能导致中途断开或数据未保存。',
        recommendation: '提醒门店及时充电或接入固定电源。',
      },
      device_auth_missing: {
        failureCategoryLabel: '设备认证或会话初始化异常',
        candidateCapabilityName: '设备认证令牌修复',
        candidateReason: '会话文本出现设备认证令牌或初始化失败信号。',
        recommendation: '检查设备登录、设备认证令牌保存和后端设备认证配置。',
      },
      unsupported_business_question: {
        failureCategoryLabel: '智能问答未命中经营能力',
        candidateCapabilityName: '智能问答能力候选',
        candidateReason: '会话文本出现暂不支持、无法回复或需补充条件，说明该问法需要进入问答能力评审。',
        recommendation: '将样例问题沉淀为经营问答样例，评估是否新增业务领域、指标或查询能力。',
      },
      repeated_refresh: {
        failureCategoryLabel: '页面重复刷新或不稳定',
        candidateCapabilityName: '终端重复刷新排查',
        candidateReason: '会话文本出现重复刷新或不稳定信号。',
        recommendation: '检查端侧状态初始化、接口重试、useEffect 依赖和登录态刷新逻辑。',
      },
      api_or_network_error: {
        failureCategoryLabel: '接口或网络失败',
        candidateCapabilityName: '接口与网络失败排查',
        candidateReason: '会话文本出现超时、接口失败、网络错误或 5xx 信号。',
        recommendation: '对照失败时间查询 API 日志、浏览器网络请求和 AgentRun 错误。',
      },
      schedule_interaction_failure: {
        failureCategoryLabel: '排班或预约交互失败',
        candidateCapabilityName: '排班交互失败排查',
        candidateReason: '会话文本出现排班、预约状态切换失败信号。',
        recommendation: '检查排班状态接口、权限和终端状态同步。',
      },
      cashier_card_flow_failure: {
        failureCategoryLabel: '收银或核销流程失败',
        candidateCapabilityName: '收银核销流程失败排查',
        candidateReason: '会话文本出现收银、支付、核销或订单处理失败信号。',
        recommendation: '检查收银订单、卡项核销、支付回写和库存联动日志。',
      },
      empty_conversation: {
        failureCategoryLabel: '空会话或消息记录异常',
        candidateCapabilityName: '终端会话记录修复',
        candidateReason: '终端会话没有消息内容，可能存在保存失败或会话初始化异常。',
        recommendation: '检查终端会话保存接口、消息计数和本地缓存写入。',
      },
    };
    const config = configs[category] ?? configs.api_or_network_error;
    return { failureCategory: category, ...config, sampleMessage };
  }

  private truncateText(value: string, maxLength: number) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    return Number(value) || 0;
  }

  private daysSince(value?: Date | string | null) {
    if (!value) return 999;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) return 999;
    return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
  }

  private daysUntil(value?: Date | string | null) {
    if (!value) return 999;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) return 999;
    return Math.max(0, Math.ceil((time - Date.now()) / DAY_MS));
  }

  private formatPercent(value: number) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${Math.round(value * 100)}%`;
  }

  private formatMoney(value: number) {
    return `¥${Math.round(value).toLocaleString()}`;
  }

  private formatRange(start?: Date, end?: Date) {
    if (!start || !end) return undefined;
    return `${formatBusinessDate(start)} 至 ${formatBusinessDate(end)}`;
  }

  private maskPhone(value?: string | null) {
    const text = String(value || '');
    if (!/^\d{11}$/.test(text)) return text;
    return `${text.slice(0, 3)}****${text.slice(7)}`;
  }
}
