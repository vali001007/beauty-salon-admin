import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BusinessQueryService } from '../business-query/business-query.service.js';
import { IndustryService } from '../industry/industry.service.js';
import { MarketingService } from '../marketing/marketing.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { TerminalService } from '../terminal/terminal.service.js';
import { SmartSchedulingService } from '../scheduling/smart-scheduling.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import type {
  AgentEvidence,
  AgentRiskLevel,
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolResult,
} from './agent.types.js';

const DAY_MS = 86_400_000;
const PAID_ORDER_STATUSES = ['completed', 'paid', '已完成', '已付款'];

type AgentDateRange = {
  start: Date;
  end: Date;
  label: string;
  preset: string;
};

type PriorityCustomerSignal = {
  reservationCount: number;
  pendingFollowUpCount: number;
  urgentFollowUpCount: number;
  scoreBonus: number;
  reasons: string[];
};

type PriorityCustomerOptions = {
  range?: AgentDateRange;
  customerSegment?: string;
  customerIds?: number[];
  focusedCustomers?: FocusedPriorityCustomer[];
  contextScope?: string;
};

type FocusedPriorityCustomer = {
  customerId: number;
  customerName?: unknown;
  paidAmount?: unknown;
  paidAmountText?: unknown;
  memberLevel?: unknown;
  phoneMasked?: unknown;
  itemsSummary?: unknown;
  suggestion?: unknown;
};

@Injectable()
export class AgentToolRegistryService {
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessQueryService: BusinessQueryService,
    private readonly marketingService: MarketingService,
    private readonly inventoryService: InventoryService,
    private readonly terminalService: TerminalService,
    private readonly smartSchedulingService: SmartSchedulingService,
    private readonly industryService: IndustryService,
  ) {
    this.register({
      name: 'customer.priority.rank',
      description: '推荐今天优先跟进客户，返回带原因和下一步动作的客户 ranked list',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['terminal:customer:view'],
      requiresApproval: false,
      outputKinds: ['table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit', 'filters.customerSegment', 'filters.customerIds', 'filters.contextScope'],
      maxRows: 300,
      timeoutMs: 10_000,
      execute: (args, context) => this.rankCustomerPriority(args, context),
    });

    this.register({
      name: 'revenue.diagnose',
      description: '诊断收入变化，比较当前周期与上一周期的收入、订单数、客单价和品类贡献',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'chart', 'evidence_panel'],
      consumedSlots: ['timeRange'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseRevenue(args, context),
    });

    this.register({
      name: 'finance.revenue.summary',
      description: '汇总财务收入、实收、订单数、客单价和上一周期变化，面向店长经营看板问答',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'chart', 'evidence_panel'],
      consumedSlots: ['timeRange'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.summarizeFinanceRevenue(args, context),
    });

    this.register({
      name: 'product.sales.rank',
      description: '查询商品销量、销售额、订单数、客户数和环比增长排行',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:product:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.rankProductSales(args, context),
    });

    this.register({
      name: 'inventory.risk.rank',
      description: '查询库存不足、临期和补货优先级排行，仅生成建议不创建采购单',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'chart', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.rankInventoryRisk(args, context),
    });

    this.register({
      name: 'business.query.ask',
      description: '执行受控经营问数，返回数据卡片和证据包',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'chart', 'action_card', 'evidence_panel'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.executeBusinessQuery(args, context),
    });

    this.register({
      name: 'marketing.opportunity.discover',
      description: '发现适合做活动的商品机会，综合库存、销量、临期和毛利信号',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:recommend'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.discoverMarketingOpportunity(args, context),
    });

    this.register({
      name: 'marketing.activity.draft',
      description: '根据上一轮机会结果生成营销活动草稿，需人工确认',
      riskLevel: 'medium',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:create'],
      requiresApproval: true,
      maxRows: 100,
      timeoutMs: 10_000,
      execute: (args, context) => this.createMarketingActivityDraft(args, context),
    });

    this.register({
      name: 'customer.followup.task.draft',
      description: '根据客户流失、复购或营销响应信号生成客户跟进任务草稿，需人工确认',
      riskLevel: 'medium',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: ['terminal:customer:followup'],
      requiresApproval: true,
      outputKinds: ['table', 'action_card', 'evidence_panel'],
      maxRows: 50,
      timeoutMs: 10_000,
      execute: (args, context) => this.createCustomerFollowUpTaskDraft(args, context),
    });

    this.register({
      name: 'inventory.replenishment.draft',
      description: '根据低库存和安全库存生成补货采购草稿，需人工确认',
      riskLevel: 'medium',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: true,
      maxRows: 100,
      timeoutMs: 10_000,
      execute: (args, context) => this.createInventoryReplenishmentDraft(args, context),
    });

    this.register({
      name: 'inventory.purchase.intake.draft',
      description: '从 OCR、图片识别文本或手工粘贴采购单生成入库草稿，不直接入库',
      riskLevel: 'medium',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: true,
      maxRows: 100,
      timeoutMs: 10_000,
      execute: (args, context) => this.createPurchaseIntakeDraft(args, context),
    });

    this.register({
      name: 'inventory.stock.operation.draft',
      description: '从语音或自然语言生成出库、盘点、报废等库存操作草稿，不直接改库存',
      riskLevel: 'medium',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:adjustment'],
      requiresApproval: true,
      maxRows: 100,
      timeoutMs: 10_000,
      execute: (args, context) => this.createStockOperationDraft(args, context),
    });

    this.register({
      name: 'inventory.product.metadata.suggest',
      description: '根据商品名称、类别或行业模板给出品牌、规格、单位、保质期和安全库存建议，不直接写入商品资料',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      maxRows: 100,
      timeoutMs: 10_000,
      execute: (args, context) => this.suggestProductMetadata(args, context),
    });

    this.register({
      name: 'inventory.consumption.trend',
      description: '分析库存出库与服务耗材消耗趋势，识别高消耗品和异常消耗',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'chart', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseInventoryConsumptionTrend(args, context),
    });

    this.register({
      name: 'inventory.project.bom.risk',
      description: '结合项目 BOM、项目服务量和当前库存，诊断项目耗材保障风险',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseProjectBomInventoryRisk(args, context),
    });

    this.register({
      name: 'industry.chain.operational.report',
      description: '查询行业标准品到本地 SKU、供应链映射、BOM 库存和采购承接的链路断点清单',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:industry:view', 'core:inventory:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.getIndustryChainOperationalReport(args, context),
    });

    this.register({
      name: 'inventory.transfer.suggestion',
      description: '基于跨门店同 SKU 库存差异生成调拨建议，只读返回建议不创建调拨单',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      consumedSlots: ['limit', 'filters.targetStoreId'],
      maxRows: 1000,
      timeoutMs: 10_000,
      execute: (args, context) => this.suggestInventoryTransfers(args, context),
    });

    this.register({
      name: 'inventory.expiring.clearance.draft',
      description: '根据临期批次和当前库存生成临期处理草稿建议，不自动调价或触达',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['limit'],
      maxRows: 1000,
      timeoutMs: 10_000,
      execute: (args, context) => this.createExpiringInventoryClearanceDraft(args, context),
    });

    this.register({
      name: 'supplier.purchase.link',
      description: '查询库存商品的供应商采购链接、供货价、起订量和交期建议',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['limit'],
      maxRows: 1000,
      timeoutMs: 10_000,
      execute: (args, context) => this.linkSupplierPurchaseOptions(args, context),
    });

    this.register({
      name: 'service.record.draft',
      description: '根据待服务任务生成服务记录草稿建议，不自动提交正式服务记录',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
      outputKinds: ['table', 'action_card', 'evidence_panel'],
      maxRows: 20,
      timeoutMs: 10_000,
      execute: (args, context) => this.createServiceRecordDraft(args, context),
    });

    this.register({
      name: 'beautician.today.service.list',
      description: '查询美容师今日服务客户、预约时间、项目和服务准备提醒',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 100,
      timeoutMs: 8_000,
      execute: (args, context) => this.getBeauticianTodayServiceList(args, context),
    });

    this.register({
      name: 'beautician.customer.care.brief',
      description: '生成美容师下一个客户护理准备摘要，包含客户标签、卡项、历史护理和注意事项',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
      maxRows: 20,
      timeoutMs: 8_000,
      execute: (args, context) => this.getBeauticianCustomerCareBrief(args, context),
    });

    this.register({
      name: 'beautician.performance.progress',
      description: '查询美容师本月业绩、服务、提成和完成进度，仅展示本人或指定员工范围',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.getBeauticianPerformanceProgress(args, context),
    });

    this.register({
      name: 'beautician.repurchase.opportunity',
      description: '基于美容师近期服务客户、卡项剩余和到店周期，推荐复购、续卡或回访机会',
      riskLevel: 'low',
      allowedRoles: ['beautician', 'manager'],
      requiredPermissions: ['terminal:customer:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 500,
      timeoutMs: 10_000,
      execute: (args, context) => this.findBeauticianRepurchaseOpportunities(args, context),
    });

    this.register({
      name: 'scheduling.optimization.preview',
      description: '生成智能排班优化预览，不自动发布排班',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:store:scheduling'],
      requiresApproval: false,
      maxRows: 500,
      timeoutMs: 15_000,
      execute: (args, context) => this.previewSchedulingOptimization(args, context),
    });

    this.register({
      name: 'schedule.diagnose',
      description: '诊断预约排班忙闲、占用率、人手缺口和空闲美容师，不发布排班',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:store:scheduling'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseSchedule(args, context),
    });

    this.register({
      name: 'project.diagnose',
      description: '诊断项目服务趋势、项目收入、客户数和 BOM 耗材毛利风险',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:project:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'chart', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseProjects(args, context),
    });

    this.register({
      name: 'card.diagnose',
      description: '诊断次卡到期、卡项核销、会员卡余额和充值消费流水',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:card-usage'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseCards(args, context),
    });

    this.register({
      name: 'finance.margin.diagnose',
      description: '诊断净收入、耗材成本、提成成本、毛利和毛利率',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseFinanceMargin(args, context),
    });

    this.register({
      name: 'finance.profit.diagnose',
      description: '诊断利润、毛利、耗材成本、提成成本变化原因，输出经营动作建议',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseFinanceProfit(args, context),
    });

    this.register({
      name: 'finance.margin.risk.rank',
      description: '按项目/商品识别低毛利、亏损和成本占用风险排行，给出调价、停促或替换耗材建议',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.rankFinanceMarginRisk(args, context),
    });

    this.register({
      name: 'finance.refund.discount.audit',
      description: '审计退款、折扣、手工优惠和高退款率订单，输出财务风控清单',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      outputKinds: ['table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.auditFinanceRefundDiscount(args, context),
    });

    this.register({
      name: 'finance.beautician.performance.audit',
      description: '审计美容师销售、提成、服务记录完整率和预约完成率，识别人效与提成异常',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.auditFinanceBeauticianPerformance(args, context),
    });

    this.register({
      name: 'finance.report.draft',
      description: '生成日报、周报、月报财务报告草稿，汇总收入、利润、退款折扣和员工绩效风险',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange'],
      maxRows: 3000,
      timeoutMs: 10_000,
      execute: (args, context) => this.draftFinanceReport(args, context),
    });

    this.register({
      name: 'staff.performance.rank',
      description: '查询员工表现排行，覆盖服务、销售、提成、预约完成和服务质量信号',
      riskLevel: 'low',
      allowedRoles: ['manager', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'chart', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.rankStaffPerformance(args, context),
    });

    this.register({
      name: 'supply_chain.diagnose',
      description: '诊断供应链采购、供应商交付和结算风险',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:inventory:purchase'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseSupplyChain(args, context),
    });

    this.register({
      name: 'marketing.conversion.diagnose',
      description: '诊断营销活动触达、线索、转化和归因收入',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseMarketingConversion(args, context),
    });

    this.register({
      name: 'automation.execution.diagnose',
      description: '复盘营销自动化执行、触达、转化和归因收入',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseAutomationExecution(args, context),
    });

    this.register({
      name: 'store.comparison.diagnose',
      description: '按授权范围对比门店经营表现',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:store:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseStoreComparison(args, context),
    });

    this.register({
      name: 'promotion.effect.analyze',
      description: '分析权益、优惠券或促销活动的领取、使用和成本表现',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      maxRows: 1000,
      timeoutMs: 10_000,
      execute: (args, context) => this.analyzePromotionEffect(args, context),
    });

    this.register({
      name: 'customer_app.funnel.analyze',
      description: '分析客户小程序与渠道访问、绑定、线索、预约和成交漏斗',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:customer:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.analyzeCustomerAppFunnel(args, context),
    });

    this.register({
      name: 'terminal.health.diagnose',
      description: '诊断终端设备在线状态、外设状态、会话数量和高频失败问题',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['terminal:device:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseTerminalHealth(args, context),
    });

    this.register({
      name: 'order.refund.diagnose',
      description: '诊断退款金额、退款率、退款订单和异常售后风险',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseRefunds(args, context),
    });

    this.register({
      name: 'service.quality.diagnose',
      description: '诊断服务任务完成率、护理记录完整性和服务质量风险',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['terminal:service:view'],
      requiresApproval: false,
      consumedSlots: ['timeRange', 'limit'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.diagnoseServiceQuality(args, context),
    });

    // ─── 店长经营 Agent 专属工具 ─────────────────────────────────────────────

    this.register({
      name: 'manager.daily.briefing',
      description: '生成店长今日经营简报：今日预约数、收入进度、库存预警数、高价值客户到店、待确认预约',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:dashboard:view'],
      requiresApproval: false,
      maxRows: 100,
      timeoutMs: 12_000,
      execute: (args, context) => this.getManagerDailyBriefing(args, context),
    });

    // ─── 前台接待 Agent 专属工具 ─────────────────────────────────────────────

    this.register({
      name: 'reception.customer.lookup',
      description: '按姓名、手机号后四位或会员号查询客户基础信息和最近消费摘要，敏感字段自动脱敏',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['terminal:customer:view'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      maxRows: 10,
      timeoutMs: 8_000,
      execute: (args, context) => this.lookupCustomerForReception(args, context),
    });

    this.register({
      name: 'reception.reservation.today',
      description: '查询今日本店全部预约列表，含客户名、时间、项目、美容师和状态',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:store:reservations'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      maxRows: 100,
      timeoutMs: 8_000,
      execute: (args, context) => this.getTodayReservationsForReception(args, context),
    });

    this.register({
      name: 'reception.card.benefit.summary',
      description: '查询指定客户的次卡剩余次数、有效期、余额和可用权益，不执行核销',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception'],
      requiredPermissions: ['core:order:card-usage'],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'action_card', 'evidence_panel'],
      maxRows: 20,
      timeoutMs: 8_000,
      execute: (args, context) => this.getCustomerCardBenefitSummary(args, context),
    });

    // ─── 营销增长 Agent 专属工具 ─────────────────────────────────────────────

    this.register({
      name: 'marketing.customer.segment.discover',
      description: '发现可运营客群：沉睡客户、高价值未复购、新客未办卡、疗程快消耗完等，返回各群体人数和样例',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
      maxRows: 500,
      timeoutMs: 12_000,
      execute: (args, context) => this.discoverCustomerSegments(args, context),
    });

    this.register({
      name: 'promotion.offer.match',
      description: '根据目标客群和活动目的，从权益库匹配最低必要权益（优惠券/折扣/赠品），并给出毛利保护提示',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
      maxRows: 20,
      timeoutMs: 8_000,
      execute: (args, context) => this.matchPromotionOffer(args, context),
    });

    this.register({
      name: 'marketing.copy.generate',
      description: '基于目标客群、活动目的和权益，生成 2-3 条私域/短信/朋友圈触达话术变体',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:view'],
      requiresApproval: false,
      outputKinds: ['action_card', 'table', 'evidence_panel'],
      maxRows: 10,
      timeoutMs: 10_000,
      execute: (args, context) => this.generateMarketingCopy(args, context),
    });

    this.register({
      name: 'marketing.effect.diagnose',
      description: '查询指定活动的效果漏斗：触达→打开→领取→预约→核销→收入，支持与同类历史活动对比',
      riskLevel: 'low',
      allowedRoles: ['manager'],
      requiredPermissions: ['core:marketing:analytics'],
      requiresApproval: false,
      consumedSlots: ['timeRange'],
      maxRows: 1000,
      timeoutMs: 12_000,
      execute: (args, context) => this.diagnoseMarketingEffect(args, context),
    });
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      riskLevel: tool.riskLevel,
      allowedRoles: tool.allowedRoles,
      requiredPermissions: tool.requiredPermissions,
      requiresApproval: tool.requiresApproval,
      consumedSlots: tool.consumedSlots,
      maxRows: tool.maxRows,
      timeoutMs: tool.timeoutMs,
      outputKinds: tool.outputKinds,
    }));
  }

  get(name: string) {
    return this.tools.get(name);
  }

  register(tool: AgentToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, args: Record<string, unknown>, context: AgentToolExecutionContext) {
    const tool = this.get(name);
    if (!tool) throw new Error(`Agent tool ${name} is not registered`);
    if (!tool.allowedRoles.includes(context.role)) {
      return this.buildRoleDeniedResult(tool, context.role);
    }
    return tool.execute(args, context);
  }

  private buildRoleDeniedResult(tool: AgentToolDefinition, role: AgentToolExecutionContext['role']): AgentToolResult {
    return {
      status: 'unsupported',
      title: '权限不足',
      summary: `当前账号角色不能使用「${tool.description}」能力，请切换有权限账号或由店长处理。`,
      evidence: {
        source: [],
        metricDefinition: '未执行数据查询。',
        filters: [`当前角色：${this.roleLabel(role)}`],
        sampleSize: 0,
        limitations: ['角色权限不足，已阻止工具执行。'],
      },
      actions: [],
    };
  }

  private roleLabel(role: AgentToolExecutionContext['role']) {
    const labels: Record<AgentToolExecutionContext['role'], string> = {
      manager: '店长',
      reception: '前台',
      beautician: '美容师',
    };
    return labels[role] ?? role;
  }

  private async executeBusinessQuery(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const question = String(args.question || args.message || '').trim();
    if (!question) {
      return {
        status: 'unsupported',
        title: '经营问数',
        summary: '缺少要查询的问题。',
        evidence: {
          source: [],
          metricDefinition: '未执行数据查询。',
          filters: [],
          limitations: ['question 为空'],
        },
      };
    }
    const response = await this.businessQueryService.ask({
      question,
      role: context.role,
      storeId: context.storeId,
      operatorId: context.userId,
      context: args.context as any,
    });
    return {
      status: response.status === 'success' ? 'success' : response.status === 'no_data' ? 'no_data' : 'unsupported',
      title: response.card?.title ?? '经营问数',
      summary: response.answer,
      data: response,
      evidence: response.evidence,
      actions: response.actions,
    };
  }

  private async executeBusinessQueryTool(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
    fallbackTitle: string,
  ): Promise<AgentToolResult> {
    const question = String(args.question || args.message || fallbackTitle).trim();
    const response = await this.businessQueryService.ask({
      question,
      role: context.role,
      storeId: context.storeId,
      operatorId: context.userId,
      context: args.context as any,
    });
    return {
      status: response.status === 'success' ? 'success' : response.status === 'no_data' ? 'no_data' : 'unsupported',
      title: response.card?.title ?? fallbackTitle,
      summary: response.card?.summary ?? response.answer,
      data: {
        card: response.card,
        queryPlan: response.queryPlan,
        raw: response,
      },
      evidence: response.evidence,
      actions: response.actions,
    };
  }

  private async rankStaffPerformance(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const scopedBeauticianId =
      context.role === 'beautician'
        ? await this.resolveBeauticianId(context, args)
        : Number(args.beauticianId) > 0
          ? Number(args.beauticianId)
          : undefined;
    const beauticianFilter = scopedBeauticianId ? { id: scopedBeauticianId } : {};
    const dataScope = context.role === 'beautician' ? '本人' : scopedBeauticianId ? '指定员工' : '全店员工';

    if (context.role === 'beautician' && !scopedBeauticianId) {
      const evidence: AgentEvidence = {
        source: ['Beautician'],
        dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
        metricDefinition: '员工表现排行 = 服务、销售、提成、预约完成、服务记录完整性和客户复购贡献的综合评分。',
        filters: ['当前账号为美容师角色', '仅查询本人服务与提成数据', '未找到与当前账号绑定的美容师档案'],
        sampleSize: 0,
        limitations: ['美容师角色只能查询本人数据；当前账号未绑定美容师档案，因此不查询全店员工。'],
      };
      return {
        status: 'no_data',
        title: '我的表现',
        summary: '当前账号未绑定美容师档案，无法查询本人表现。',
        data: {
          items: [],
          requestedLimit: 1,
          scope: dataScope,
          consumedSlots: this.buildConsumedSlots(range, 1, { scope: dataScope }),
        },
        evidence,
        actions: [],
      };
    }

    const [beauticians, orderItems, commissionRecords, reservations, serviceTasks, cardUsageRecords] = await Promise.all([
      (this.prisma as any).beautician.findMany({
        where: { storeId: context.storeId, status: 'active', userId: { not: null }, ...beauticianFilter },
        select: { id: true, name: true, status: true, userId: true, level: { select: { name: true } } },
        take: scopedBeauticianId ? 1 : 500,
      }),
      (this.prisma as any).orderItem.findMany({
        where: {
          beauticianId: scopedBeauticianId ? scopedBeauticianId : { not: null },
          order: {
            storeId: context.storeId,
            status: { in: PAID_ORDER_STATUSES },
            createdAt: { gte: range.start, lt: range.end },
          },
        },
        include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      }),
      (this.prisma as any).commissionRecord.findMany({
        where: {
          storeId: context.storeId,
          ...(scopedBeauticianId ? { beauticianId: scopedBeauticianId } : {}),
          createdAt: { gte: range.start, lt: range.end },
          status: { notIn: ['cancelled', 'canceled', 'void', '已取消'] },
        },
        select: { id: true, beauticianId: true, amount: true, status: true, type: true, sourceAmount: true, createdAt: true },
        take: 3000,
      }),
      (this.prisma as any).reservation.findMany({
        where: {
          storeId: context.storeId,
          beauticianId: scopedBeauticianId ? scopedBeauticianId : { not: null },
          date: { gte: range.start, lt: range.end },
          status: { not: 'cancelled' },
        },
        select: { id: true, beauticianId: true, customerId: true, status: true, date: true },
        take: 3000,
      }),
      (this.prisma as any).serviceTask.findMany({
        where: {
          storeId: context.storeId,
          beauticianId: scopedBeauticianId ? scopedBeauticianId : { not: null },
          appointmentTime: { gte: range.start, lt: range.end },
        },
        select: { id: true, beauticianId: true, customerId: true, status: true, completedAt: true, remark: true, consumptionItems: true },
        take: 3000,
      }),
      (this.prisma as any).cardUsageRecord.findMany({
        where: {
          beauticianId: scopedBeauticianId ? scopedBeauticianId : { not: null },
          verifiedAt: { gte: range.start, lt: range.end },
          customer: { storeId: context.storeId, deletedAt: null },
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
        customerTouchCount: Map<number, number>;
        commissionAmount: number;
        reservationCount: number;
        completedReservationCount: number;
        serviceTaskCount: number;
        completedTaskCount: number;
        serviceRecordCompleteCount: number;
        cardUsageTimes: number;
      }
    >();

    const touchCustomer = (target: { customerIds: Set<number>; customerTouchCount: Map<number, number> }, customerId?: unknown) => {
      const id = Number(customerId);
      if (!id) return;
      target.customerIds.add(id);
      target.customerTouchCount.set(id, (target.customerTouchCount.get(id) ?? 0) + 1);
    };

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
        customerTouchCount: new Map<number, number>(),
        commissionAmount: 0,
        reservationCount: 0,
        completedReservationCount: 0,
        serviceTaskCount: 0,
        completedTaskCount: 0,
        serviceRecordCompleteCount: 0,
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
      touchCustomer(target, item.order?.customerId);
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
      touchCustomer(target, reservation.customerId);
      if (/completed|checked_in|arrived|done|已完成|已到店/.test(String(reservation.status || ''))) {
        target.completedReservationCount += 1;
      }
    }
    for (const task of serviceTasks as any[]) {
      const beauticianId = Number(task.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.serviceTaskCount += 1;
      touchCustomer(target, task.customerId);
      const completed = /completed|done|已完成/.test(String(task.status || '')) || Boolean(task.completedAt);
      if (completed) target.completedTaskCount += 1;
      const hasConsumptionItems = Array.isArray(task.consumptionItems) ? task.consumptionItems.length > 0 : Boolean(task.consumptionItems);
      if (completed && task.completedAt && (task.remark || hasConsumptionItems)) target.serviceRecordCompleteCount += 1;
    }
    for (const usage of cardUsageRecords as any[]) {
      const beauticianId = Number(usage.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.cardUsageTimes += this.toNumber(usage.times);
      touchCustomer(target, usage.customerId);
    }

    const items = Array.from(buckets.values())
      .map((item) => {
        const completionRate = item.reservationCount ? item.completedReservationCount / item.reservationCount : 0;
        const taskCompletionRate = item.serviceTaskCount ? item.completedTaskCount / item.serviceTaskCount : 0;
        const serviceRecordCompletionRate = item.serviceTaskCount ? item.serviceRecordCompleteCount / item.serviceTaskCount : 0;
        const repeatCustomerCount = Array.from(item.customerTouchCount.values()).filter((count) => count >= 2).length;
        const customerRepurchaseRate = item.customerIds.size ? repeatCustomerCount / item.customerIds.size : 0;
        const performanceScore =
          item.serviceCount * 8 +
          item.completedTaskCount * 6 +
          item.cardUsageTimes * 5 +
          item.orderIds.size * 4 +
          item.customerIds.size * 3 +
          item.salesAmount / 1000 +
          item.commissionAmount / 100 +
          completionRate * 18 +
          taskCompletionRate * 14 +
          serviceRecordCompletionRate * 12 +
          customerRepurchaseRate * 10;
        const performanceLevel = performanceScore >= 90 ? '表现突出' : performanceScore >= 50 ? '稳定发挥' : '需持续跟进';
        return {
          beauticianId: item.beauticianId,
          beauticianName: item.beauticianName,
          levelName: item.levelName || '未设置等级',
          status: item.status,
          performanceScore: Math.round(performanceScore),
          performanceLevel,
          serviceCount: item.serviceCount,
          serviceTaskCount: item.serviceTaskCount,
          completedTaskCount: item.completedTaskCount,
          taskCompletionRate,
          taskCompletionRateText: this.formatPercent(taskCompletionRate),
          serviceRecordCompleteCount: item.serviceRecordCompleteCount,
          serviceRecordCompletionRate,
          serviceRecordCompletionRateText: this.formatPercent(serviceRecordCompletionRate),
          cardUsageTimes: item.cardUsageTimes,
          salesAmount: item.salesAmount,
          salesAmountText: this.formatMoney(item.salesAmount),
          commissionAmount: item.commissionAmount,
          commissionAmountText: this.formatMoney(item.commissionAmount),
          orderCount: item.orderIds.size,
          customerCount: item.customerIds.size,
          repeatCustomerCount,
          customerRepurchaseRate,
          customerRepurchaseRateText: this.formatPercent(customerRepurchaseRate),
          reservationCount: item.reservationCount,
          completedReservationCount: item.completedReservationCount,
          completionRate,
          completionRateText: this.formatPercent(completionRate),
          reason: `服务 ${this.formatQuantity(item.serviceCount, '次')}，销售额 ${this.formatMoney(item.salesAmount)}，提成 ${this.formatMoney(item.commissionAmount)}，预约完成率 ${this.formatPercent(completionRate)}，服务记录完整率 ${this.formatPercent(serviceRecordCompletionRate)}。`,
        };
      })
      .filter((item) => item.performanceScore > 0)
      .sort((a, b) => b.performanceScore - a.performanceScore || b.salesAmount - a.salesAmount || b.serviceCount - a.serviceCount)
      .slice(0, context.role === 'beautician' ? 1 : limit);

    const evidence: AgentEvidence = {
      source: ['Beautician', 'OrderItem', 'CommissionRecord', 'Reservation', 'ServiceTask', 'CardUsageRecord'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        '员工表现分 = 服务次数、完成服务任务、次卡核销次数、订单数、服务客户数、销售额、提成、预约完成率、服务记录完整率和客户复购贡献的加权综合评分；只读查询，不调整提成。',
      filters: [
        '当前门店',
        dataScope === '本人' ? '仅查询当前美容师本人数据' : dataScope === '指定员工' ? '仅查询指定员工数据' : '全店员工',
        '订单状态 in completed/paid',
        '排除取消预约与已取消提成记录',
        context.role === 'beautician' ? '最多返回 1 条本人数据' : `最多返回 ${limit} 条`,
      ],
      sampleSize:
        (beauticians as any[]).length +
        (orderItems as any[]).length +
        (commissionRecords as any[]).length +
        (reservations as any[]).length +
        (serviceTasks as any[]).length +
        (cardUsageRecords as any[]).length,
      limitations: [
        context.role === 'beautician' ? '美容师角色仅返回本人数据，不返回全店排行。' : '店长角色返回全店员工排序。',
        '服务记录完整率基于完成时间、备注或耗材记录判断，不能替代客户满意度调查。',
      ],
    };

    if (!items.length) {
      return {
        status: 'no_data',
        title: context.role === 'beautician' ? '我的表现' : '员工表现排行',
        summary:
          context.role === 'beautician'
            ? `${range.label}没有找到本人可用于表现分析的订单、提成、预约、服务任务或次卡核销数据。`
            : `${range.label}没有可用于员工表现分析的订单、提成、预约、服务任务或次卡核销数据。`,
        data: {
          items: [],
          requestedLimit: context.role === 'beautician' ? 1 : limit,
          scope: dataScope,
          consumedSlots: this.buildConsumedSlots(range, context.role === 'beautician' ? 1 : limit, { scope: dataScope }),
        },
        evidence,
        actions: [],
      };
    }

    const totalSales = items.reduce((total, item) => total + item.salesAmount, 0);
    const totalCommission = items.reduce((total, item) => total + item.commissionAmount, 0);
    const totalService = items.reduce((total, item) => total + item.serviceCount + item.cardUsageTimes, 0);
    const top = items[0];
    return {
      status: 'success',
      title: context.role === 'beautician' ? '我的表现' : '员工表现排行',
      summary:
        context.role === 'beautician'
          ? `${range.label}你的表现分 ${top.performanceScore}，${top.performanceLevel}；销售额 ${top.salesAmountText}，服务 ${this.formatQuantity(top.serviceCount, '次')}，提成 ${top.commissionAmountText}。`
          : `${range.label}表现较好的是 ${top.beauticianName}，表现分 ${top.performanceScore}，销售额 ${top.salesAmountText}，服务 ${this.formatQuantity(top.serviceCount, '次')}。`,
      data: {
        kpis: {
          staffCount: items.length,
          serviceAndCardUsageTimes: totalService,
          salesAmount: totalSales,
          salesAmountText: this.formatMoney(totalSales),
          commissionAmount: totalCommission,
          commissionAmountText: this.formatMoney(totalCommission),
        },
        items,
        requestedLimit: context.role === 'beautician' ? 1 : limit,
        scope: dataScope,
        consumedSlots: this.buildConsumedSlots(range, context.role === 'beautician' ? 1 : limit, { scope: dataScope }),
      },
      evidence,
      actions:
        context.role === 'beautician'
          ? [
              { label: '查看我的提成', action: 'beautician.commission', riskLevel: 'low' },
              { label: '查看服务记录', action: 'beautician.record', riskLevel: 'low' },
            ]
          : [
              { label: '查看员工管理', action: 'beauticians:open', riskLevel: 'low' },
              { label: '查看排班表', action: 'scheduling:open', riskLevel: 'low' },
            ],
    };
  }

  private async diagnoseSupplyChain(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const [suppliers, orders, settlements] = await Promise.all([
      (this.prisma as any).supplySupplier.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, categories: true, status: true, paymentTerms: true, rebateRate: true },
        take: 1000,
      }),
      (this.prisma as any).procurementOrder.findMany({
        where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } },
        include: {
          supplier: { select: { id: true, name: true, categories: true, status: true } },
          items: { select: { quantity: true, receivedQty: true, subtotal: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      (this.prisma as any).supplySettlement.findMany({
        where: { createdAt: { gte: range.start, lt: range.end } },
        include: { supplier: { select: { id: true, name: true, categories: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ]);

    const supplierMap = new Map<
      number,
      {
        supplierId: number;
        supplierName: string;
        category?: string | null;
        status?: string | null;
        orderCount: number;
        pendingOrderCount: number;
        receivedOrderCount: number;
        overdueOrderCount: number;
        totalAmount: number;
        netAmount: number;
        totalQuantity: number;
        receivedQuantity: number;
        deliveryDaysTotal: number;
        deliveryDaysCount: number;
        settlementCount: number;
        settlementAmount: number;
        unpaidSettlementCount: number;
      }
    >();

    const ensureSupplier = (supplier: any, supplierId?: number) => {
      const id = Number(supplier?.id ?? supplierId);
      if (!id) return null;
      const target =
        supplierMap.get(id) ??
        {
          supplierId: id,
          supplierName: supplier?.name ?? `供应商 ${id}`,
          category: Array.isArray(supplier?.categories) ? supplier.categories.join('、') : null,
          status: supplier?.status,
          orderCount: 0,
          pendingOrderCount: 0,
          receivedOrderCount: 0,
          overdueOrderCount: 0,
          totalAmount: 0,
          netAmount: 0,
          totalQuantity: 0,
          receivedQuantity: 0,
          deliveryDaysTotal: 0,
          deliveryDaysCount: 0,
          settlementCount: 0,
          settlementAmount: 0,
          unpaidSettlementCount: 0,
        };
      supplierMap.set(id, target);
      return target;
    };

    for (const supplier of suppliers as any[]) ensureSupplier(supplier);
    const now = new Date();
    for (const order of orders as any[]) {
      const target = ensureSupplier(order.supplier, Number(order.supplierId));
      if (!target) continue;
      const status = String(order.status || '');
      const receivedAt = order.receivedAt ? new Date(order.receivedAt) : null;
      const orderedAt = order.acceptedAt ? new Date(order.acceptedAt) : order.createdAt ? new Date(order.createdAt) : null;
      const orderItems = Array.isArray(order.items) ? order.items : [];
      target.orderCount += 1;
      target.totalAmount += this.toNumber(order.totalAmount);
      target.netAmount += this.toNumber(order.netAmount || order.totalAmount);
      target.totalQuantity += orderItems.reduce((sum: number, item: any) => sum + this.toNumber(item.quantity), 0);
      target.receivedQuantity += orderItems.reduce((sum: number, item: any) => sum + this.toNumber(item.receivedQty), 0);
      if (/received|completed|settled|已到货|已完成|已结算/.test(status) || receivedAt) {
        target.receivedOrderCount += 1;
      } else {
        target.pendingOrderCount += 1;
      }
      if (orderedAt && receivedAt) {
        target.deliveryDaysTotal += Math.max(0, Math.ceil((receivedAt.getTime() - orderedAt.getTime()) / DAY_MS));
        target.deliveryDaysCount += 1;
      }
      if (!receivedAt && orderedAt && now.getTime() - orderedAt.getTime() > 7 * DAY_MS) {
        target.overdueOrderCount += 1;
      }
    }
    for (const settlement of settlements as any[]) {
      const target = ensureSupplier(settlement.supplier, Number(settlement.supplierId));
      if (!target) continue;
      target.settlementCount += 1;
      target.settlementAmount += this.toNumber(settlement.netPayable || settlement.totalAmount);
      if (!/paid|confirmed|已付款|已确认/.test(String(settlement.status || ''))) target.unpaidSettlementCount += 1;
    }

    const items = Array.from(supplierMap.values())
      .map((item) => {
        const averageDeliveryDays = item.deliveryDaysCount ? item.deliveryDaysTotal / item.deliveryDaysCount : 0;
        const receiveRate = item.totalQuantity ? item.receivedQuantity / item.totalQuantity : item.receivedOrderCount && item.orderCount ? item.receivedOrderCount / item.orderCount : 0;
        const riskScore =
          Math.min(35, item.overdueOrderCount * 18 + item.pendingOrderCount * 6) +
          Math.min(25, averageDeliveryDays * 3) +
          Math.min(20, item.unpaidSettlementCount * 8) +
          (receiveRate && receiveRate < 0.8 ? 15 : 0);
        const reasonParts = [
          item.orderCount ? `采购单 ${item.orderCount} 笔` : '当前周期无采购单',
          averageDeliveryDays ? `平均交付 ${Math.round(averageDeliveryDays * 10) / 10} 天` : '',
          item.overdueOrderCount ? `超 7 天未到货 ${item.overdueOrderCount} 笔` : '',
          item.unpaidSettlementCount ? `待处理结算 ${item.unpaidSettlementCount} 笔` : '',
          item.totalAmount ? `采购金额 ${this.formatMoney(item.totalAmount)}` : '',
        ].filter(Boolean);
        return {
          ...item,
          totalAmountText: this.formatMoney(item.totalAmount),
          netAmountText: this.formatMoney(item.netAmount),
          settlementAmountText: this.formatMoney(item.settlementAmount),
          averageDeliveryDays,
          averageDeliveryDaysText: averageDeliveryDays ? `${Math.round(averageDeliveryDays * 10) / 10} 天` : '-',
          receiveRate,
          receiveRateText: this.formatPercent(receiveRate),
          riskScore: Math.round(riskScore),
          riskLevel: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
          reason: reasonParts.join('；'),
        };
      })
      .filter((item) => item.orderCount > 0 || item.settlementCount > 0)
      .sort((a, b) => b.riskScore - a.riskScore || b.totalAmount - a.totalAmount)
      .slice(0, limit);

    const evidence: AgentEvidence = {
      source: ['SupplySupplier', 'ProcurementOrder', 'ProcurementOrderItem', 'SupplySettlement'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '供应链诊断 = 查询周期内供应商采购单、到货、交付周期、结算金额和超期未到货风险的只读聚合。',
      filters: ['ProcurementOrder.storeId=当前门店', 'SupplySupplier.deletedAt is null', 'ProcurementOrder.createdAt=查询周期', `limit=${limit}`],
      sampleSize: (suppliers as any[]).length + (orders as any[]).length + (settlements as any[]).length,
      limitations: ['本工具只做供应链履约和结算诊断，不自动创建采购单、不改库存、不发起付款。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '供应链采购诊断',
        summary: `${range.label}没有供应商采购、到货或结算数据。`,
        data: { items: [], requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '供应链采购诊断',
      summary: `${range.label}供应链风险最高的是 ${items[0].supplierName}，风险分 ${items[0].riskScore}；${items[0].reason}。`,
      data: { items, requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
      evidence,
      actions: [
        { label: '查看采购管理', action: 'inventory:purchase:open', riskLevel: 'low' },
        { label: '查看库存预警', action: 'agent:tool:inventory.risk.rank', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseMarketingConversion(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const [pages, events, leads, attributions] = await Promise.all([
      (this.prisma as any).marketingPage.findMany({
        where: { OR: [{ storeId: context.storeId }, { storeId: null }], createdAt: { lt: range.end } },
        select: { id: true, title: true, status: true, sourceType: true, sourceId: true, publishedAt: true },
        take: 1000,
      }),
      (this.prisma as any).marketingPageEvent.findMany({
        where: { storeId: context.storeId, occurredAt: { gte: range.start, lt: range.end } },
        select: { id: true, pageId: true, eventType: true, channel: true, customerId: true, sessionId: true, occurredAt: true },
        take: 5000,
      }),
      (this.prisma as any).marketingPageLead.findMany({
        where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } },
        select: { id: true, pageId: true, channel: true, status: true, convertedAt: true, createdAt: true },
        take: 3000,
      }),
      (this.prisma as any).marketingPageAttribution.findMany({
        where: { convertedAt: { gte: range.start, lt: range.end }, page: { storeId: context.storeId } },
        select: { id: true, pageId: true, customerId: true, orderId: true, attributedRevenue: true, convertedAt: true },
        take: 3000,
      }),
    ]);
    const pageMap = new Map<number, any>((pages as any[]).map((page) => [Number(page.id), page]));
    const bucket = new Map<
      number,
      {
        pageId: number;
        pageTitle: string;
        status?: string;
        sourceType?: string;
        viewCount: number;
        clickCount: number;
        shareCount: number;
        leadCount: number;
        leadConvertedCount: number;
        attributedOrderCount: number;
        attributedRevenue: number;
        channels: Set<string>;
      }
    >();
    const ensurePage = (pageId: number) => {
      const page = pageMap.get(pageId);
      const target =
        bucket.get(pageId) ??
        {
          pageId,
          pageTitle: page?.title ?? `推广页 ${pageId}`,
          status: page?.status,
          sourceType: page?.sourceType,
          viewCount: 0,
          clickCount: 0,
          shareCount: 0,
          leadCount: 0,
          leadConvertedCount: 0,
          attributedOrderCount: 0,
          attributedRevenue: 0,
          channels: new Set<string>(),
        };
      bucket.set(pageId, target);
      return target;
    };
    for (const page of pages as any[]) ensurePage(Number(page.id));
    for (const event of events as any[]) {
      const target = ensurePage(Number(event.pageId));
      const eventType = String(event.eventType || '').toLowerCase();
      if (/view|visit|open|pv|浏览|访问/.test(eventType)) target.viewCount += 1;
      else if (/share|分享/.test(eventType)) target.shareCount += 1;
      else target.clickCount += 1;
      if (event.channel) target.channels.add(String(event.channel));
    }
    for (const lead of leads as any[]) {
      const target = ensurePage(Number(lead.pageId));
      target.leadCount += 1;
      if (lead.convertedAt || /converted|won|成交|已转化/.test(String(lead.status || ''))) target.leadConvertedCount += 1;
      if (lead.channel) target.channels.add(String(lead.channel));
    }
    for (const attribution of attributions as any[]) {
      const target = ensurePage(Number(attribution.pageId));
      target.attributedOrderCount += 1;
      target.attributedRevenue += this.toNumber(attribution.attributedRevenue);
    }
    const items = Array.from(bucket.values())
      .map((item) => {
        const leadRate = item.viewCount ? item.leadCount / item.viewCount : item.leadCount > 0 ? 1 : 0;
        const conversionCount = Math.max(item.leadConvertedCount, item.attributedOrderCount);
        const conversionRate = item.leadCount ? conversionCount / item.leadCount : 0;
        return {
          pageId: item.pageId,
          pageTitle: item.pageTitle,
          status: item.status,
          sourceType: item.sourceType,
          viewCount: item.viewCount,
          clickCount: item.clickCount,
          shareCount: item.shareCount,
          leadCount: item.leadCount,
          leadConvertedCount: item.leadConvertedCount,
          attributedOrderCount: item.attributedOrderCount,
          conversionCount,
          attributedRevenue: item.attributedRevenue,
          attributedRevenueText: this.formatMoney(item.attributedRevenue),
          leadRate,
          leadRateText: this.formatPercent(leadRate),
          conversionRate,
          conversionRateText: this.formatPercent(conversionRate),
          channel: Array.from(item.channels).join('、') || '-',
          reason: `访问 ${item.viewCount} 次，线索 ${item.leadCount} 条，成交归因 ${conversionCount} 次，收入 ${this.formatMoney(item.attributedRevenue)}。`,
        };
      })
      .filter((item) => item.viewCount > 0 || item.leadCount > 0 || item.conversionCount > 0)
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue || b.conversionCount - a.conversionCount || b.leadCount - a.leadCount)
      .slice(0, limit);
    const totalRevenue = items.reduce((sum, item) => sum + item.attributedRevenue, 0);
    const totalConversions = items.reduce((sum, item) => sum + item.conversionCount, 0);
    const evidence: AgentEvidence = {
      source: ['MarketingPage', 'MarketingPageEvent', 'MarketingPageLead', 'MarketingPageAttribution'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '营销转化诊断 = 推广页访问/点击/分享、线索、成交归因和归因收入的只读漏斗聚合。',
      filters: ['storeId=当前门店', 'MarketingPageEvent/Lead/Attribution=查询周期', `limit=${limit}`],
      sampleSize: (pages as any[]).length + (events as any[]).length + (leads as any[]).length + (attributions as any[]).length,
      limitations: ['只统计已写入推广页事件、线索和归因的数据；未归因的线下成交不会计入营销收入。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '营销转化诊断',
        summary: `${range.label}没有推广页访问、线索或成交归因数据。`,
        data: { items: [], requestedLimit: limit },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '营销转化诊断',
      summary: `${range.label}可追溯营销成交 ${totalConversions} 次，归因收入 ${this.formatMoney(totalRevenue)}；表现最好的是 ${items[0].pageTitle}。`,
      data: {
        kpis: {
          pageCount: items.length,
          conversionCount: totalConversions,
          attributedRevenue: totalRevenue,
          attributedRevenueText: this.formatMoney(totalRevenue),
        },
        items,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [{ label: '查看推广页效果', action: 'marketing:pages:open', riskLevel: 'low' }],
    };
  }

  private async diagnoseAutomationExecution(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const executions = await (this.prisma as any).marketingAutomationExecution.findMany({
      where: { executedAt: { gte: range.start, lt: range.end } },
      include: {
        strategy: { select: { id: true, name: true, status: true, source: true } },
        touches: { select: { id: true, customerId: true, channel: true, status: true, convertedAt: true, actualRevenue: true } },
        attributions: { select: { id: true, customerId: true, orderId: true, attributedRevenue: true } },
      },
      orderBy: { executedAt: 'desc' },
      take: 1000,
    });
    const bucket = new Map<
      number,
      {
        strategyId: number;
        strategyName: string;
        status?: string;
        executionCount: number;
        failedExecutionCount: number;
        triggeredCount: number;
        reachedCount: number;
        convertedCount: number;
        attributedRevenue: number;
        customerIds: Set<number>;
        channels: Set<string>;
        lastExecutedAt?: Date;
      }
    >();
    for (const execution of executions as any[]) {
      const strategyId = Number(execution.strategyId);
      const target =
        bucket.get(strategyId) ??
        {
          strategyId,
          strategyName: execution.strategy?.name ?? execution.strategyName ?? `自动化策略 ${strategyId}`,
          status: execution.strategy?.status,
          executionCount: 0,
          failedExecutionCount: 0,
          triggeredCount: 0,
          reachedCount: 0,
          convertedCount: 0,
          attributedRevenue: 0,
          customerIds: new Set<number>(),
          channels: new Set<string>(),
          lastExecutedAt: execution.executedAt,
        };
      target.executionCount += 1;
      if (/failed|error|失败|异常/.test(String(execution.status || ''))) target.failedExecutionCount += 1;
      target.triggeredCount += this.toNumber(execution.triggeredCount);
      target.reachedCount += this.toNumber(execution.reachedCount);
      let touchActualRevenue = 0;
      let attributionRevenue = 0;
      for (const touch of execution.touches ?? []) {
        if (touch.customerId) target.customerIds.add(Number(touch.customerId));
        if (touch.channel) target.channels.add(String(touch.channel));
        if (touch.convertedAt || /converted|成交|转化/.test(String(touch.status || ''))) target.convertedCount += 1;
        touchActualRevenue += this.toNumber(touch.actualRevenue);
      }
      for (const attribution of execution.attributions ?? []) {
        if (attribution.customerId) target.customerIds.add(Number(attribution.customerId));
        attributionRevenue += this.toNumber(attribution.attributedRevenue);
      }
      target.attributedRevenue += attributionRevenue > 0 ? attributionRevenue : touchActualRevenue;
      if (!target.lastExecutedAt || new Date(execution.executedAt).getTime() > new Date(target.lastExecutedAt).getTime()) {
        target.lastExecutedAt = execution.executedAt;
      }
      bucket.set(strategyId, target);
    }
    const items = Array.from(bucket.values())
      .map((item) => {
        const reachRate = item.triggeredCount ? item.reachedCount / item.triggeredCount : 0;
        const conversionRate = item.reachedCount ? item.convertedCount / item.reachedCount : 0;
        return {
          strategyId: item.strategyId,
          strategyName: item.strategyName,
          status: item.status,
          executionCount: item.executionCount,
          failedExecutionCount: item.failedExecutionCount,
          triggeredCount: item.triggeredCount,
          reachedCount: item.reachedCount,
          convertedCount: item.convertedCount,
          customerCount: item.customerIds.size,
          channel: Array.from(item.channels).join('、') || '-',
          attributedRevenue: item.attributedRevenue,
          attributedRevenueText: this.formatMoney(item.attributedRevenue),
          reachRate,
          reachRateText: this.formatPercent(reachRate),
          conversionRate,
          conversionRateText: this.formatPercent(conversionRate),
          lastExecutedAt: item.lastExecutedAt,
          reason: `执行 ${item.executionCount} 次，触发 ${item.triggeredCount} 人，触达 ${item.reachedCount} 人，转化 ${item.convertedCount} 人。`,
        };
      })
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue || b.convertedCount - a.convertedCount || b.reachedCount - a.reachedCount)
      .slice(0, limit);
    const totalConversions = items.reduce((sum, item) => sum + item.convertedCount, 0);
    const totalRevenue = items.reduce((sum, item) => sum + item.attributedRevenue, 0);
    const evidence: AgentEvidence = {
      source: ['MarketingAutomationExecution', 'MarketingAutomationTouch', 'MarketingAttribution'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '自动化执行复盘 = 查询周期内自动化执行、触发人数、触达人数、转化人数和归因收入的只读聚合。',
      filters: ['executedAt=查询周期', `limit=${limit}`],
      sampleSize: (executions as any[]).length,
      limitations: ['自动化策略当前模型无直接 storeId 字段，本工具按执行记录周期聚合；后续需补策略门店归属以加强隔离。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '自动化执行复盘',
        summary: `${range.label}没有自动化执行记录。`,
        data: { items: [], requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '自动化执行复盘',
      summary: `${range.label}自动化转化 ${totalConversions} 次，归因收入 ${this.formatMoney(totalRevenue)}；表现最好的是 ${items[0].strategyName}。`,
      data: {
        kpis: {
          strategyCount: items.length,
          conversionCount: totalConversions,
          attributedRevenue: totalRevenue,
          attributedRevenueText: this.formatMoney(totalRevenue),
        },
        items,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [{ label: '查看自动化执行', action: 'automation:summary', riskLevel: 'low' }],
    };
  }

  private async diagnoseStoreComparison(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const userStores = context.userId
      ? await (this.prisma as any).userStore.findMany({
          where: { userId: context.userId },
          select: { storeId: true, store: { select: { id: true, name: true, city: true, status: true, deletedAt: true } } },
        })
      : [];
    const allowedStores = (userStores as any[])
      .map((item) => item.store)
      .filter((store) => store && !store.deletedAt && !/disabled|deleted|停用|删除/.test(String(store.status || '')));
    if (allowedStores.length <= 1) {
      const evidence: AgentEvidence = {
        source: ['UserStore', 'Store'],
        dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
        metricDefinition: '多门店对比必须基于当前用户授权门店集合执行，不能越权读取未授权门店。',
        filters: ['operatorId=当前用户', 'authorizedStoreCount>1'],
        sampleSize: allowedStores.length,
        limitations: ['当前账号未授权多个门店，因此不执行跨门店经营数据查询。'],
      };
      return {
        status: 'no_data',
        title: '多门店对比诊断',
        summary: '当前账号未授权多个门店，无法执行多门店对比。',
        data: {
          items: [],
          requestedLimit: limit,
          authorizedStoreCount: allowedStores.length,
          consumedSlots: this.buildConsumedSlots(range, limit, {}),
        },
        evidence,
        actions: [],
      };
    }
    const storeIds = allowedStores.map((store: any) => Number(store.id));
    const [orders, reservations, customers, products] = await Promise.all([
      (this.prisma as any).productOrder.findMany({
        where: { storeId: { in: storeIds }, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: range.start, lt: range.end } },
        select: { id: true, storeId: true, totalAmount: true, customerId: true },
        take: 5000,
      }),
      (this.prisma as any).reservation.findMany({
        where: { storeId: { in: storeIds }, date: { gte: range.start, lt: range.end }, status: { not: 'cancelled' } },
        select: { id: true, storeId: true, status: true },
        take: 5000,
      }),
      (this.prisma as any).customer.findMany({
        where: { storeId: { in: storeIds }, deletedAt: null },
        select: { id: true, storeId: true },
        take: 5000,
      }),
      (this.prisma as any).product.findMany({
        where: { storeId: { in: storeIds }, deletedAt: null },
        select: { id: true, storeId: true, currentStock: true, safetyStock: true },
        take: 5000,
      }),
    ]);
    const items = (allowedStores as any[])
      .map((store) => {
        const storeOrders = (orders as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const storeReservations = (reservations as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const storeCustomers = (customers as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const storeProducts = (products as any[]).filter((item) => Number(item.storeId) === Number(store.id));
        const salesAmount = storeOrders.reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0);
        const arrivedCount = storeReservations.filter((item) => /checked_in|completed|到店|完成/.test(String(item.status || ''))).length;
        const lowStockCount = storeProducts.filter((item) => this.toNumber(item.currentStock) <= this.toNumber(item.safetyStock)).length;
        const score = salesAmount / 100 + storeOrders.length * 8 + arrivedCount * 5 + storeCustomers.length - lowStockCount * 3;
        return {
          storeId: store.id,
          storeName: store.name,
          city: store.city,
          status: store.status,
          salesAmount,
          salesAmountText: this.formatMoney(salesAmount),
          orderCount: storeOrders.length,
          customerCount: storeCustomers.length,
          reservationCount: storeReservations.length,
          arrivedCount,
          arrivalRate: storeReservations.length ? arrivedCount / storeReservations.length : 0,
          arrivalRateText: this.formatPercent(storeReservations.length ? arrivedCount / storeReservations.length : 0),
          lowStockCount,
          averageOrderValue: storeOrders.length ? salesAmount / storeOrders.length : 0,
          averageOrderValueText: this.formatMoney(storeOrders.length ? salesAmount / storeOrders.length : 0),
          storeRankScore: Math.round(score),
          reason: `收入 ${this.formatMoney(salesAmount)}，订单 ${storeOrders.length} 笔，预约 ${storeReservations.length} 条，低库存 ${lowStockCount} 项。`,
        };
      })
      .sort((a, b) => b.storeRankScore - a.storeRankScore || b.salesAmount - a.salesAmount)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['UserStore', 'Store', 'ProductOrder', 'Reservation', 'Customer', 'Product'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '多门店对比 = 当前用户授权门店内收入、订单、客户、预约到店和低库存数量的只读聚合排行。',
      filters: ['storeId in 当前用户授权门店', '订单状态 in completed/paid', '预约排除 cancelled', `limit=${limit}`],
      sampleSize: (orders as any[]).length + (reservations as any[]).length + (customers as any[]).length + (products as any[]).length,
      limitations: ['只对比当前用户授权门店，不跨权限读取其他门店。'],
    };
    return {
      status: 'success',
      title: '多门店对比诊断',
      summary: `${range.label}已对比 ${items.length} 个授权门店，综合表现最高的是 ${items[0]?.storeName ?? '暂无门店'}。`,
      data: { items, requestedLimit: limit, authorizedStoreCount: allowedStores.length, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
      evidence,
      actions: [{ label: '查看门店经营', action: 'stores:performance:open', riskLevel: 'low' }],
    };
  }

  private async analyzePromotionEffect(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const promotions = await (this.prisma as any).promotion.findMany({
      where: {
        OR: [{ storeId: context.storeId }, { storeId: null }],
        status: { not: 'deleted' },
        createdAt: { lt: range.end },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 1000,
    });
    const items = (promotions as any[])
      .map((promotion) => {
        const issuedCount = this.toNumber(promotion.issuedCount);
        const usedCount = this.toNumber(promotion.usedCount);
        const maxIssueCount = this.toNumber(promotion.maxIssueCount);
        const estimatedCost = this.toNumber(promotion.estimatedCost);
        const claimRate = maxIssueCount > 0 ? issuedCount / maxIssueCount : issuedCount > 0 ? 1 : 0;
        const useRate = issuedCount > 0 ? usedCount / issuedCount : 0;
        return {
          promotionId: promotion.id,
          promotionName: promotion.name,
          type: promotion.type,
          status: promotion.status,
          discountText: promotion.discountText,
          scenario: promotion.scenario,
          issuedCount,
          usedCount,
          maxIssueCount,
          claimRate,
          claimRateText: this.formatPercent(claimRate),
          useRate,
          useRateText: this.formatPercent(useRate),
          estimatedCost,
          estimatedCostText: this.formatMoney(estimatedCost),
          startAt: promotion.startAt,
          endAt: promotion.endAt,
          reason: `已领取 ${issuedCount}，已使用 ${usedCount}，使用率 ${this.formatPercent(useRate)}。`,
        };
      })
      .sort((a, b) => b.usedCount - a.usedCount || b.issuedCount - a.issuedCount)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['Promotion'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '权益活动效果 = Promotion.issuedCount、usedCount、maxIssueCount 和 estimatedCost 的只读汇总；不自动发券或发布活动。',
      filters: ['storeId=当前门店或全局权益', 'Promotion.status != deleted', `limit=${limit}`],
      sampleSize: (promotions as any[]).length,
      limitations: ['若权益领取/核销未写回 Promotion 计数字段，则只能返回权益配置层面的效果概览。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '权益活动效果分析',
        summary: `${range.label}没有可分析的权益或促销活动数据。`,
        data: { items: [], requestedLimit: limit },
        evidence,
        actions: [],
      };
    }
    const top = items[0];
    return {
      status: 'success',
      title: '权益活动效果分析',
      summary: `${range.label}使用最多的权益是 ${top.promotionName}，已领取 ${top.issuedCount}，已使用 ${top.usedCount}，使用率 ${top.useRateText}。`,
      data: { items, requestedLimit: limit },
      evidence,
      actions: [{ label: '查看权益管理', action: 'promotions:open', riskLevel: 'low' }],
    };
  }

  private async analyzeCustomerAppFunnel(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const [identities, appEvents, leads, attributions] = await Promise.all([
      (this.prisma as any).customerAppIdentity.findMany({
        where: { storeId: context.storeId },
        select: { id: true, customerId: true, bindStatus: true, source: true, phone: true, lastLoginAt: true, createdAt: true },
        take: 2000,
      }),
      (this.prisma as any).customerAppEvent.findMany({
        where: { storeId: context.storeId, occurredAt: { gte: range.start, lt: range.end } },
        select: {
          id: true,
          customerId: true,
          identityId: true,
          openid: true,
          sessionId: true,
          eventType: true,
          channel: true,
          targetType: true,
          targetId: true,
          source: true,
          occurredAt: true,
        },
        take: 3000,
      }),
      (this.prisma as any).marketingPageLead.findMany({
        where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } },
        select: { id: true, customerId: true, channel: true, status: true, convertedAt: true, createdAt: true },
        take: 2000,
      }),
      (this.prisma as any).marketingPageAttribution.findMany({
        where: { convertedAt: { gte: range.start, lt: range.end }, page: { storeId: context.storeId } },
        select: {
          id: true,
          pageId: true,
          customerId: true,
          orderId: true,
          attributedRevenue: true,
          convertedAt: true,
          lead: { select: { id: true, channel: true, status: true } },
          page: { select: { id: true, title: true, sourceType: true } },
        },
        take: 2000,
      }),
    ]);

    const appCustomerIds = new Set<number>();
    for (const identity of identities as any[]) if (identity.customerId) appCustomerIds.add(Number(identity.customerId));
    for (const event of appEvents as any[]) if (event.customerId) appCustomerIds.add(Number(event.customerId));
    for (const lead of leads as any[]) if (lead.customerId) appCustomerIds.add(Number(lead.customerId));
    for (const attribution of attributions as any[]) if (attribution.customerId) appCustomerIds.add(Number(attribution.customerId));

    const customerIdList = Array.from(appCustomerIds).filter(Boolean);
    const [reservations, orders] = customerIdList.length
      ? await Promise.all([
          (this.prisma as any).reservation.findMany({
            where: {
              storeId: context.storeId,
              customerId: { in: customerIdList },
              createdAt: { gte: range.start, lt: range.end },
              status: { not: 'cancelled' },
            },
            select: { id: true, customerId: true, status: true, createdAt: true, checkedInAt: true },
            take: 2000,
          }),
          (this.prisma as any).productOrder.findMany({
            where: {
              storeId: context.storeId,
              customerId: { in: customerIdList },
              status: { in: PAID_ORDER_STATUSES },
              createdAt: { gte: range.start, lt: range.end },
            },
            select: { id: true, customerId: true, totalAmount: true, source: true, createdAt: true },
            take: 2000,
          }),
        ])
      : [[], []];

    type ChannelFunnel = {
      channel: string;
      eventCount: number;
      uniqueVisitorKeys: Set<string>;
      activeCustomerIds: Set<number>;
      boundCustomerIds: Set<number>;
      promotionClaimCount: number;
      promotionReservedCount: number;
      reservationEventCount: number;
      reservationCount: number;
      checkedInReservationCount: number;
      leadCount: number;
      leadConvertedCount: number;
      attributedOrderIds: Set<number>;
      attributedRevenue: number;
      appCustomerOrderIds: Set<number>;
      appCustomerRevenue: number;
    };
    const channelMap = new Map<string, ChannelFunnel>();
    const ensureChannel = (channelValue?: unknown) => {
      const channel = String(channelValue || '客户小程序');
      const existing = channelMap.get(channel);
      if (existing) return existing;
      const next: ChannelFunnel = {
        channel,
        eventCount: 0,
        uniqueVisitorKeys: new Set<string>(),
        activeCustomerIds: new Set<number>(),
        boundCustomerIds: new Set<number>(),
        promotionClaimCount: 0,
        promotionReservedCount: 0,
        reservationEventCount: 0,
        reservationCount: 0,
        checkedInReservationCount: 0,
        leadCount: 0,
        leadConvertedCount: 0,
        attributedOrderIds: new Set<number>(),
        attributedRevenue: 0,
        appCustomerOrderIds: new Set<number>(),
        appCustomerRevenue: 0,
      };
      channelMap.set(channel, next);
      return next;
    };

    for (const identity of identities as any[]) {
      const target = ensureChannel(identity.source || 'ami_glow');
      if (identity.customerId && (String(identity.bindStatus) === 'bound' || identity.customerId)) target.boundCustomerIds.add(Number(identity.customerId));
    }
    for (const event of appEvents as any[]) {
      const target = ensureChannel(event.channel || event.source || '客户小程序');
      target.eventCount += 1;
      const visitorKey = event.customerId
        ? `customer:${event.customerId}`
        : event.identityId
          ? `identity:${event.identityId}`
          : event.openid
            ? `openid:${event.openid}`
            : event.sessionId
              ? `session:${event.sessionId}`
              : `event:${event.id}`;
      target.uniqueVisitorKeys.add(visitorKey);
      if (event.customerId) target.activeCustomerIds.add(Number(event.customerId));
      if (event.eventType === 'promotion_claimed') target.promotionClaimCount += 1;
      if (event.eventType === 'promotion_reserved') target.promotionReservedCount += 1;
      if (event.eventType === 'miniapp_reservation_success') target.reservationEventCount += 1;
    }
    for (const lead of leads as any[]) {
      const target = ensureChannel(lead.channel || '推广页/未知渠道');
      target.leadCount += 1;
      if (lead.convertedAt || String(lead.status) === 'converted') target.leadConvertedCount += 1;
      if (lead.customerId) target.activeCustomerIds.add(Number(lead.customerId));
    }
    for (const attribution of attributions as any[]) {
      const target = ensureChannel(attribution.lead?.channel || attribution.page?.sourceType || '推广页归因');
      if (attribution.customerId) target.activeCustomerIds.add(Number(attribution.customerId));
      if (attribution.orderId) target.attributedOrderIds.add(Number(attribution.orderId));
      target.attributedRevenue += this.toNumber(attribution.attributedRevenue);
    }
    const channelByCustomer = new Map<number, string>();
    for (const event of appEvents as any[]) {
      if (event.customerId && !channelByCustomer.has(Number(event.customerId))) {
        channelByCustomer.set(Number(event.customerId), String(event.channel || event.source || '客户小程序'));
      }
    }
    for (const lead of leads as any[]) {
      if (lead.customerId && !channelByCustomer.has(Number(lead.customerId))) {
        channelByCustomer.set(Number(lead.customerId), String(lead.channel || '推广页/未知渠道'));
      }
    }
    for (const reservation of reservations as any[]) {
      const target = ensureChannel(channelByCustomer.get(Number(reservation.customerId)) || '客户小程序客户');
      target.reservationCount += 1;
      if (/completed|checked_in|arrived|done|已完成|已到店/.test(String(reservation.status || '')) || reservation.checkedInAt) {
        target.checkedInReservationCount += 1;
      }
    }
    for (const order of orders as any[]) {
      const target = ensureChannel(order.source || channelByCustomer.get(Number(order.customerId)) || '客户小程序客户');
      target.appCustomerOrderIds.add(Number(order.id));
      target.appCustomerRevenue += this.toNumber(order.totalAmount);
    }
    const attributionRevenue = (attributions as any[]).reduce((sum, item) => sum + this.toNumber(item.attributedRevenue), 0);
    const appCustomerRevenue = (orders as any[]).reduce((sum, item) => sum + this.toNumber(item.totalAmount), 0);
    const promotionClaimedCount = (appEvents as any[]).filter((item) => item.eventType === 'promotion_claimed').length;
    const promotionReservedCount = (appEvents as any[]).filter((item) => item.eventType === 'promotion_reserved').length;
    const reservationEventCount = (appEvents as any[]).filter((item) => item.eventType === 'miniapp_reservation_success').length;
    const uniqueVisitorCount = new Set(
      (appEvents as any[]).map((event) =>
        event.customerId ? `customer:${event.customerId}` : event.identityId ? `identity:${event.identityId}` : event.openid ? `openid:${event.openid}` : event.sessionId ? `session:${event.sessionId}` : `event:${event.id}`,
      ),
    ).size;
    const items = Array.from(channelMap.values())
      .map((item) => {
        const uniqueVisitorCount = item.uniqueVisitorKeys.size;
        const attributedOrderCount = item.attributedOrderIds.size;
        const appCustomerOrderCount = item.appCustomerOrderIds.size;
        const conversionCount = Math.max(attributedOrderCount, item.leadConvertedCount);
        const leadRate = uniqueVisitorCount ? item.leadCount / uniqueVisitorCount : 0;
        const reservationRate = uniqueVisitorCount ? Math.max(item.reservationEventCount, item.reservationCount) / uniqueVisitorCount : 0;
        const attributionConversionRate = item.leadCount ? attributedOrderCount / item.leadCount : 0;
        return {
          channel: item.channel,
          eventCount: item.eventCount,
          uniqueVisitorCount,
          activeCustomerCount: item.activeCustomerIds.size,
          boundCustomerCount: item.boundCustomerIds.size,
          promotionClaimCount: item.promotionClaimCount,
          promotionReservedCount: item.promotionReservedCount,
          reservationEventCount: item.reservationEventCount,
          reservationCount: item.reservationCount,
          checkedInReservationCount: item.checkedInReservationCount,
          leadCount: item.leadCount,
          leadConvertedCount: item.leadConvertedCount,
          attributedOrderCount,
          attributedRevenue: item.attributedRevenue,
          attributedRevenueText: this.formatMoney(item.attributedRevenue),
          appCustomerOrderCount,
          appCustomerRevenue: item.appCustomerRevenue,
          appCustomerRevenueText: this.formatMoney(item.appCustomerRevenue),
          conversionCount,
          leadRate,
          leadRateText: this.formatPercent(leadRate),
          reservationRate,
          reservationRateText: this.formatPercent(reservationRate),
          attributionConversionRate,
          attributionConversionRateText: this.formatPercent(attributionConversionRate),
          reason: `访问 ${item.eventCount} 次，留资 ${item.leadCount} 条，预约 ${Math.max(item.reservationEventCount, item.reservationCount)} 次，归因成交 ${attributedOrderCount} 笔，归因收入 ${this.formatMoney(item.attributedRevenue)}。`,
        };
      })
      .sort(
        (a, b) =>
          b.attributedRevenue - a.attributedRevenue ||
          b.attributedOrderCount - a.attributedOrderCount ||
          b.reservationEventCount + b.reservationCount - (a.reservationEventCount + a.reservationCount) ||
          b.leadCount - a.leadCount ||
          b.eventCount - a.eventCount,
      )
      .slice(0, limit);
    const boundCount = (identities as any[]).filter((item) => String(item.bindStatus) === 'bound' || item.customerId).length;
    const evidence: AgentEvidence = {
      source: ['CustomerAppIdentity', 'CustomerAppEvent', 'MarketingPageLead', 'MarketingPageAttribution', 'Reservation', 'ProductOrder'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        '客户小程序/渠道漏斗 = 小程序身份绑定 + CustomerAppEvent 访问/权益/预约事件 + MarketingPageLead 留资 + MarketingPageAttribution 归因成交 + 已识别小程序客户同期预约和订单承接。',
      filters: ['当前门店', `最多返回 ${limit} 条`],
      sampleSize:
        (identities as any[]).length +
        (appEvents as any[]).length +
        (leads as any[]).length +
        (attributions as any[]).length +
        (reservations as any[]).length +
        (orders as any[]).length,
      limitations: [
        '归因收入只统计 MarketingPageAttribution，未归因订单单独作为“小程序客户同期成交”展示，不直接计入归因收入。',
        '预约承接优先依据 CustomerAppEvent 预约成功事件，并用已识别客户的同期预约记录补充验证。',
      ],
    };
    if (!identities.length && !appEvents.length && !leads.length && !attributions.length && !reservations.length && !orders.length) {
      return {
        status: 'no_data',
        title: '客户小程序渠道漏斗',
        summary: `${range.label}没有客户小程序或渠道漏斗数据。`,
        data: { items: [], requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '客户小程序渠道漏斗',
      summary: `${range.label}小程序身份 ${identities.length} 个，已绑定 ${boundCount} 个；访问 ${uniqueVisitorCount} 人，留资 ${(leads as any[]).length} 条，预约事件 ${reservationEventCount} 次，归因成交 ${(attributions as any[]).length} 笔，归因收入 ${this.formatMoney(attributionRevenue)}；小程序客户同期成交 ${(orders as any[]).length} 笔，成交额 ${this.formatMoney(appCustomerRevenue)}。`,
      data: {
        kpis: {
          identityCount: (identities as any[]).length,
          boundCount,
          uniqueVisitorCount,
          activeCustomerCount: appCustomerIds.size,
          appEventCount: (appEvents as any[]).length,
          promotionClaimedCount,
          promotionReservedCount,
          reservationEventCount,
          reservationCount: (reservations as any[]).length,
          leadCount: (leads as any[]).length,
          leadConvertedCount: (leads as any[]).filter((item) => item.convertedAt || String(item.status) === 'converted').length,
          attributedOrderCount: (attributions as any[]).length,
          attributedRevenue: attributionRevenue,
          attributedRevenueText: this.formatMoney(attributionRevenue),
          appCustomerOrderCount: (orders as any[]).length,
          appCustomerRevenue,
          appCustomerRevenueText: this.formatMoney(appCustomerRevenue),
        },
        items,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [{ label: '查看营销推广页', action: 'marketing:pages:open', riskLevel: 'low' }],
    };
  }

  private async diagnoseTerminalHealth(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const [devices, conversations] = await Promise.all([
      (this.prisma as any).terminalDevice.findMany({
        where: { storeId: context.storeId },
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
        where: { storeId: context.storeId, date: { gte: range.start, lt: range.end } },
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
    const conversationByDevice = new Map<string, { conversationCount: number; messageCount: number }>();
    const devicesByKey = new Map<string, any>();
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
      const target = conversationByDevice.get(deviceId) ?? { conversationCount: 0, messageCount: 0 };
      target.conversationCount += 1;
      target.messageCount += this.toNumber(conversation.messageCount);
      conversationByDevice.set(deviceId, target);
      const device = devicesByKey.get(deviceId);
      for (const signal of this.classifyTerminalConversationFailure(conversation)) {
        addFailure(signal, device, conversation.updatedAt);
      }
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
        const abnormalSignals = deviceSignals.map((signal) => signal.failureCategoryLabel);
        return {
          deviceId: device.id,
          deviceCode: device.deviceCode,
          deviceName: device.name,
          status: device.status,
          networkStatus: device.networkStatus,
          printerStatus: device.printerStatus,
          scannerStatus: device.scannerStatus,
          cameraStatus: device.cameraStatus,
          batteryLevel: device.batteryLevel,
          lastOnlineAt: device.lastOnlineAt,
          conversationCount: stats.conversationCount,
          messageCount: stats.messageCount,
          abnormalSignalCount: abnormalSignals.length,
          abnormalSignals,
        };
      })
      .sort((a, b) => b.abnormalSignalCount - a.abnormalSignalCount || b.messageCount - a.messageCount)
      .slice(0, limit);
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
      .slice(0, limit);
    const capabilityCandidates = failureCategories.map((item) => ({
      candidateCapabilityName: item.candidateCapabilityName,
      domain: 'terminal',
      metric: 'terminal_failure_rate',
      reason: item.candidateReason,
      sourceFailureCategory: item.failureCategoryLabel,
      sampleMessage: item.sampleMessage,
    }));
    const abnormalCount = deviceItems.filter((item) => item.abnormalSignalCount > 0).length;
    const totalMessages = (conversations as any[]).reduce((sum, item) => sum + this.toNumber(item.messageCount), 0);
    const detailItems = failureCategories.length ? failureCategories : deviceItems;
    const evidence: AgentEvidence = {
      source: ['TerminalDevice', 'TerminalConversation'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '终端健康 = 设备在线、网络、打印机、扫码器、摄像头、电量状态，加上查询周期内终端会话消息中的失败信号分类。',
      filters: ['当前门店', '终端会话日期在查询周期内', `最多返回 ${limit} 条`],
      sampleSize: (devices as any[]).length + (conversations as any[]).length,
      limitations: ['失败分类基于设备状态和会话消息关键词，不能替代完整前端日志。', '该查询只读，不自动修改设备状态。'],
    };
    if (!devices.length && !conversations.length) {
      return {
        status: 'no_data',
        title: '终端设备与对话诊断',
        summary: `${range.label}没有终端设备或会话数据。`,
        data: { items: [], requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '终端设备与对话诊断',
      summary: failureCategories.length
        ? `${range.label}共有 ${(devices as any[]).length} 台终端，发现 ${abnormalCount} 台存在状态风险；识别 ${failureCategories.length} 类失败信号，最高频为 ${failureCategories[0].failureCategoryLabel}。`
        : `${range.label}共有 ${(devices as any[]).length} 台终端，发现 ${abnormalCount} 台存在状态风险；终端会话 ${(conversations as any[]).length} 个，消息数 ${totalMessages} 条。`,
      data: {
        kpis: {
          deviceCount: (devices as any[]).length,
          abnormalDeviceCount: abnormalCount,
          conversationCount: (conversations as any[]).length,
          messageCount: totalMessages,
          failureCategoryCount: failureCategories.length,
          topFailureCategory: failureCategories[0]?.failureCategoryLabel ?? '暂无明显失败分类',
        },
        items: detailItems,
        devices: deviceItems,
        failureCategories,
        capabilityCandidates,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [
        { label: '查看终端设备', action: 'terminal:devices:open', riskLevel: 'low' },
        { label: '查看终端会话记录', action: 'terminal:conversations:open', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseRefunds(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const [refunds, orders] = await Promise.all([
      (this.prisma as any).refundRecord.findMany({
        where: { refundedAt: { gte: range.start, lt: range.end }, order: { storeId: context.storeId } },
        include: { order: { select: { id: true, orderNo: true, customerName: true, totalAmount: true, status: true, createdAt: true } } },
        orderBy: { refundedAt: 'desc' },
        take: 2000,
      }),
      (this.prisma as any).productOrder.findMany({
        where: { storeId: context.storeId, status: { notIn: ['cancelled', 'canceled', '已取消'] }, createdAt: { gte: range.start, lt: range.end } },
        select: { id: true, totalAmount: true },
        take: 3000,
      }),
    ]);
    const orderAmount = (orders as any[]).reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0);
    const refundAmount = (refunds as any[]).reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
    const refundRate = orderAmount > 0 ? refundAmount / orderAmount : 0;
    const items = (refunds as any[])
      .map((refund) => ({
        refundId: refund.id,
        refundNo: refund.refundNo,
        orderId: refund.orderId,
        orderNo: refund.order?.orderNo,
        customerName: refund.order?.customerName,
        amount: this.toNumber(refund.amount),
        amountText: this.formatMoney(this.toNumber(refund.amount)),
        reason: refund.reason || '未填写原因',
        status: refund.status,
        refundedAt: refund.refundedAt,
        orderAmount: this.toNumber(refund.order?.totalAmount),
        orderAmountText: this.formatMoney(this.toNumber(refund.order?.totalAmount)),
        refundOrderRate: this.toNumber(refund.order?.totalAmount) > 0 ? this.toNumber(refund.amount) / this.toNumber(refund.order?.totalAmount) : 0,
        refundOrderRateText: this.formatPercent(this.toNumber(refund.order?.totalAmount) > 0 ? this.toNumber(refund.amount) / this.toNumber(refund.order?.totalAmount) : 0),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['RefundRecord', 'ProductOrder'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '退款诊断 = 查询周期内 RefundRecord.amount 汇总；退款率 = 退款金额 / 同期有效订单 totalAmount。',
      filters: ['storeId=当前门店', 'RefundRecord.refundedAt=查询周期', 'ProductOrder.status != cancelled', `limit=${limit}`],
      sampleSize: (refunds as any[]).length + (orders as any[]).length,
      limitations: ['本工具只读分析退款风险，不发起退款或修改订单。'],
    };
    if (!refunds.length) {
      return {
        status: 'no_data',
        title: '售后退款诊断',
        summary: `${range.label}没有退款记录。`,
        data: {
          items: [],
          requestedLimit: limit,
          refundAmount: 0,
          refundRate: 0,
          consumedSlots: this.buildConsumedSlots(range, limit, {}),
        },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '售后退款诊断',
      summary: `${range.label}退款 ${this.formatMoney(refundAmount)}，共 ${(refunds as any[]).length} 笔，退款率 ${this.formatPercent(refundRate)}；最大单笔退款为 ${items[0]?.customerName ?? items[0]?.orderNo ?? '未知订单'} ${items[0]?.amountText}。`,
      data: {
        kpis: {
          refundCount: (refunds as any[]).length,
          refundAmount,
          refundAmountText: this.formatMoney(refundAmount),
          orderAmount,
          orderAmountText: this.formatMoney(orderAmount),
          refundRate,
          refundRateText: this.formatPercent(refundRate),
        },
        items,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [{ label: '查看退款订单', action: 'orders:refunds:open', riskLevel: 'low' }],
    };
  }

  private async diagnoseServiceQuality(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const tasks = await (this.prisma as any).serviceTask.findMany({
      where: { storeId: context.storeId, appointmentTime: { gte: range.start, lt: range.end } },
      include: {
        customer: { select: { id: true, name: true, memberLevel: true } },
        project: { select: { id: true, name: true } },
        beautician: { select: { id: true, name: true } },
      },
      orderBy: { appointmentTime: 'desc' },
      take: 2000,
    });
    const completed = (tasks as any[]).filter((task) => ['completed', '已完成'].includes(String(task.status))).length;
    const inProgress = (tasks as any[]).filter((task) => ['in_progress', '进行中'].includes(String(task.status))).length;
    const pending = (tasks as any[]).filter((task) => ['pending', '待服务'].includes(String(task.status))).length;
    const completionRate = (tasks as any[]).length ? completed / (tasks as any[]).length : 0;
    const items = (tasks as any[])
      .map((task) => {
        const consumptionItems = Array.isArray(task.consumptionItems) ? task.consumptionItems : [];
        const hasConsumption = consumptionItems.length > 0 || Boolean(task.consumptionItems);
        const qualitySignals = [
          ['completed', '已完成'].includes(String(task.status)) ? '已完成' : '未完成',
          task.completedAt ? '有完成时间' : '缺完成时间',
          hasConsumption ? '有耗材记录' : '缺耗材记录',
          task.remark ? '有服务备注' : '缺服务备注',
        ];
        const riskScore =
          (['completed', '已完成'].includes(String(task.status)) ? 0 : 30) +
          (task.completedAt ? 0 : 20) +
          (hasConsumption ? 0 : 20) +
          (task.remark ? 0 : 10);
        return {
          taskId: task.id,
          taskNo: task.taskNo,
          customerName: task.customer?.name,
          memberLevel: task.customer?.memberLevel,
          projectName: task.project?.name,
          beauticianName: task.beautician?.name,
          status: task.status,
          appointmentTime: task.appointmentTime,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          qualitySignals,
          riskScore,
          riskLevel: riskScore >= 50 ? '高' : riskScore >= 25 ? '中' : '低',
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['ServiceTask', 'Customer', 'Project', 'Beautician'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '服务质量诊断 = 服务任务完成率 + 完成时间、耗材记录、服务备注等记录完整性信号。',
      filters: ['storeId=当前门店', 'ServiceTask.appointmentTime=查询周期', `limit=${limit}`],
      sampleSize: (tasks as any[]).length,
      limitations: ['服务质量评分仅基于系统记录完整性和任务状态，不能替代客户真实满意度调查。'],
    };
    if (!tasks.length) {
      return {
        status: 'no_data',
        title: '服务质量诊断',
        summary: `${range.label}没有服务任务数据。`,
        data: { items: [], requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '服务质量诊断',
      summary: `${range.label}服务任务 ${(tasks as any[]).length} 条，已完成 ${completed} 条，完成率 ${this.formatPercent(completionRate)}；待服务 ${pending} 条，进行中 ${inProgress} 条。`,
      data: {
        kpis: {
          taskCount: (tasks as any[]).length,
          completed,
          pending,
          inProgress,
          completionRate,
          completionRateText: this.formatPercent(completionRate),
        },
        items,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [{ label: '查看服务记录', action: 'terminal:service-records:open', riskLevel: 'low' }],
    };
  }

  private async rankCustomerPriority(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'today');
    const filters = this.asRecord(args.filters);
    const customerIds = this.toNumberList(filters.customerIds);
    const focusedCustomers = this.normalizeFocusedPriorityCustomers(filters.focusedCustomers);
    const contextScope = typeof filters.contextScope === 'string' ? filters.contextScope : undefined;
    const scopedToPreviousList = customerIds.length > 0 && contextScope === 'previous_order_customer_consumption_list';
    const candidates = await this.resolvePriorityCustomers(context.storeId, limit, {
      range,
      customerSegment: typeof filters.customerSegment === 'string' ? filters.customerSegment : undefined,
      customerIds,
      focusedCustomers,
      contextScope,
    });
    const titlePrefix = scopedToPreviousList ? '上一轮消费客户清单' : range.label;
    const evidence: AgentEvidence = {
      source: ['Customer', 'PredictionSnapshot', 'Reservation', 'FollowUpTask'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        'follow_up_priority_score = 流失风险、复购机会、营销响应、LTV、最近到店、未来预约和近期跟进状态的综合评分；只生成推荐，不自动触达客户。',
      filters: [
        'storeId=当前门店',
        'Customer.deletedAt is null',
        `timeRange=${range.label}`,
        filters.customerSegment ? `customerSegment=${filters.customerSegment}` : '',
        scopedToPreviousList ? 'scope=上一轮消费客户清单' : '',
        customerIds.length ? `customerIds=${customerIds.join(',')}` : '',
        `limit=${limit}`,
      ].filter(Boolean),
      sampleSize: candidates.totalAvailable,
      limitations: [
        scopedToPreviousList
          ? '本次追问限定在上一轮消费客户清单内排序，不扩展到全店客户池。'
          : 'P0 使用预测快照、指定周期预约和近期跟进任务评分；若缺少预测快照，会降级使用最近到店、消费额和到店次数评分。',
      ],
    };

    if (!candidates.items.length) {
      return {
        status: 'no_data',
        title: `${titlePrefix}优先跟进客户`,
        summary: `${titlePrefix}没有找到可用于优先跟进推荐的客户数据。`,
        data: {
          items: [],
          requestedLimit: limit,
          totalAvailable: candidates.totalAvailable,
          consumedSlots: this.buildConsumedSlots(range, limit, filters),
        },
        evidence,
        actions: [],
      };
    }

    const top = candidates.items[0];
    const shortage =
      candidates.items.length < limit
        ? `当前符合条件的客户只有 ${candidates.items.length} 位，少于你要求的 ${limit} 位；已按现有数据全部返回。`
        : `已按要求返回 ${limit} 位客户。`;

    return {
      status: 'success',
      title: `${titlePrefix}优先跟进客户`,
      summary: `${titlePrefix}${shortage} 优先建议跟进 ${top.customerName}，原因：${top.reason}`,
      data: {
        items: candidates.items,
        requestedLimit: limit,
        totalAvailable: candidates.totalAvailable,
        consumedSlots: this.buildConsumedSlots(range, limit, filters),
        scoring: {
          metric: 'follow_up_priority_score',
          maxScore: 100,
          factors: ['churnScore', 'repurchase30dScore', 'marketingResponseScore', 'ltv', 'lastVisitDays', 'futureReservationPenalty'],
        },
      },
      evidence,
      actions: [
        { label: '生成跟进任务草稿', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'medium' },
        { label: '查看客户列表', action: 'customers:data', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseRevenue(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const currentRange = this.resolveDateRange(args.timeRange);
    const previousRange = {
      start: new Date(currentRange.start.getTime() - (currentRange.end.getTime() - currentRange.start.getTime())),
      end: currentRange.start,
      label: `上一${currentRange.label}`,
    };
    const [currentOrders, previousOrders] = await Promise.all([
      this.loadRevenueOrders(context.storeId, currentRange.start, currentRange.end),
      this.loadRevenueOrders(context.storeId, previousRange.start, previousRange.end),
    ]);
    const current = this.summarizeRevenueOrders(currentOrders);
    const previous = this.summarizeRevenueOrders(previousOrders);
    const amountDelta = current.revenue - previous.revenue;
    const amountDeltaRate = previous.revenue > 0 ? amountDelta / previous.revenue : current.revenue > 0 ? 1 : 0;
    const orderDelta = current.orderCount - previous.orderCount;
    const averageOrderDelta = current.averageOrderValue - previous.averageOrderValue;
    const itemDrivers = this.buildRevenueDrivers(current.itemBreakdown, previous.itemBreakdown);
    const payMethodDrivers = this.buildRevenueDrivers(current.payMethodBreakdown, previous.payMethodBreakdown);
    const diagnosis = this.explainRevenueChange({ current, previous, amountDelta, amountDeltaRate, orderDelta, averageOrderDelta, itemDrivers });
    const evidence: AgentEvidence = {
      source: ['ProductOrder', 'OrderItem'],
      dateRange: `${this.formatDate(currentRange.start)} 至 ${this.formatDate(currentRange.end)}`,
      metricDefinition:
        '收入诊断 = 未取消/未退款订单 totalAmount 汇总；与上一等长周期比较收入、订单数、客单价，并按商品/项目/支付方式拆分贡献。',
      filters: ['storeId=当前门店', 'status not in cancelled/refunded', `timeRange=${currentRange.label}`],
      sampleSize: currentOrders.length + previousOrders.length,
      limitations: ['P0 使用规则归因，尚未叠加预约到店率、活动转化、退款原因和排班人效。'],
    };

    if (!currentOrders.length && !previousOrders.length) {
      return {
        status: 'no_data',
        title: '收入诊断',
        summary: `${currentRange.label}和上一周期均无有效订单，无法诊断收入变化。`,
        data: {
          current,
          previous,
          itemDrivers,
          payMethodDrivers,
          consumedSlots: this.buildConsumedSlots(currentRange, 0, {}),
        },
        evidence,
        actions: [],
      };
    }

    return {
      status: 'success',
      title: '收入诊断',
      summary: diagnosis.summary,
      data: {
        current,
        previous,
        delta: {
          revenue: amountDelta,
          revenueRate: amountDeltaRate,
          revenueText: this.formatMoney(amountDelta),
          revenueRateText: this.formatPercent(amountDeltaRate),
          orderCount: orderDelta,
          averageOrderValue: averageOrderDelta,
          averageOrderValueText: this.formatMoney(averageOrderDelta),
        },
        diagnosis,
        itemDrivers,
        payMethodDrivers,
        consumedSlots: this.buildConsumedSlots(currentRange, 0, {}),
      },
      evidence,
      actions: [
        { label: '查看订单明细', action: 'orders:open', riskLevel: 'low' },
        { label: '查看营销机会', action: 'agent:tool:marketing.opportunity.discover', riskLevel: 'low' },
      ],
    };
  }

  private async summarizeFinanceRevenue(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const result = await this.diagnoseRevenue(args, context);
    const data = typeof result.data === 'object' && result.data !== null ? (result.data as Record<string, any>) : {};
    const current = data.current ?? {};
    const delta = data.delta ?? {};
    return {
      ...result,
      title: '财务收入汇总',
      summary:
        result.status === 'no_data'
          ? result.summary
          : `收入汇总：${result.summary}`,
      data: {
        ...data,
        reportType: 'finance_revenue_summary',
        kpis: [
          { label: '收入', value: String(current.revenueText ?? '-') },
          { label: '订单数', value: String(current.orderCount ?? 0), delta: delta.orderCount !== undefined ? String(delta.orderCount) : undefined },
          { label: '客单价', value: String(current.averageOrderValueText ?? '-') },
          { label: '收入变化', value: String(delta.revenueText ?? '-'), delta: String(delta.revenueRateText ?? ''), deltaType: Number(delta.revenue) >= 0 ? 'up' : 'down' },
        ],
      },
      actions: [
        ...(result.actions ?? []),
        { label: '查看收银对账', action: 'finance:reconciliation:open', riskLevel: 'low' },
      ],
    };
  }

  private async rankProductSales(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const currentRange = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const previousRange = this.previousSameLengthRange(currentRange);
    const start = currentRange.start;
    const end = currentRange.end;
    const compareStart = previousRange.start;
    const compareEnd = previousRange.end;
    const orderItems = await (this.prisma as any).orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { not: null },
        order: {
          storeId: context.storeId,
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
    const productIds = [...new Set((orderItems as any[]).map((item) => Number(item.itemId)).filter(Boolean))];
    const products = productIds.length
      ? await (this.prisma as any).product.findMany({
          where: { id: { in: productIds }, storeId: context.storeId, deletedAt: null },
          select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true, unit: true, specUnit: true },
        })
      : [];
    const productById = new Map((products as any[]).map((item) => [Number(item.id), item]));
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
      const orderTime = new Date(item.order?.createdAt).getTime();
      const isCurrent = orderTime >= start.getTime() && orderTime < end.getTime();
      const isPrevious = orderTime >= compareStart.getTime() && orderTime < compareEnd.getTime();
      if (!isCurrent && !isPrevious) continue;
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
      if (isCurrent) {
        target.currentQuantity += quantity;
        target.currentSalesAmount += subtotal;
        target.orderIds.add(Number(item.orderId));
        if (item.order?.customerId) target.customerIds.add(Number(item.order.customerId));
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
          sku: product?.sku,
          quantity: item.currentQuantity,
          previousQuantity: item.previousQuantity,
          growthQuantity,
          growthRate,
          growthRateText: this.formatPercent(growthRate),
          salesAmount: item.currentSalesAmount,
          salesAmountText: this.formatMoney(item.currentSalesAmount),
          previousSalesAmount: item.previousSalesAmount,
          orderCount: item.orderIds.size,
          customerCount: item.customerIds.size,
          currentStock: this.toNumber(product?.currentStock),
          safetyStock: this.toNumber(product?.safetyStock),
          unit: product?.unit ?? '',
        };
      })
      .sort((a, b) => b.growthRate - a.growthRate || b.quantity - a.quantity)
      .slice(0, limit);

    const evidence: AgentEvidence = {
      source: ['ProductOrder', 'OrderItem', 'Product'],
      dateRange: `${this.formatDate(start)} 至 ${this.formatDate(end)}`,
      metricDefinition:
        'product_sales_growth = 当前周期已完成/已支付订单中 OrderItem.itemType=product 的 quantity 汇总，与上一等长周期商品销量对比；增长率 = 增长销量 / 上一周期销量。',
      filters: ['storeId=当前门店', '订单状态 in completed/paid', 'OrderItem.itemType=product', `limit=${limit}`],
      sampleSize: (orderItems as any[]).length,
      limitations: ['P0 仅按订单明细归因，未叠加退货原因、活动归因和毛利贡献。'],
    };

    if (!items.length) {
      return {
        status: 'no_data',
        title: '商品销量排行',
        summary: `${currentRange.label}没有足够商品订单明细，无法判断销量增长。`,
        data: {
          items: [],
          requestedLimit: limit,
          totalAvailable: 0,
          consumedSlots: this.buildConsumedSlots(currentRange, limit, {}),
        },
        evidence,
        actions: [],
      };
    }

    const top = items[0];
    return {
      status: 'success',
      title: '商品销量排行',
      summary: `${currentRange.label}销量增长最快的是 ${top.productName}，销量 ${this.formatQuantity(top.quantity, top.unit)}，较上一周期 ${top.growthRateText}，销售额 ${top.salesAmountText}。`,
      data: {
        items,
        requestedLimit: limit,
        totalAvailable: bucket.size,
        currentRange: { start: this.formatDate(start), end: this.formatDate(end), label: currentRange.label },
        previousRange: { start: this.formatDate(compareStart), end: this.formatDate(compareEnd), label: previousRange.label },
        consumedSlots: this.buildConsumedSlots(currentRange, limit, {}),
      },
      evidence,
      actions: [
        { label: '查看商品明细', action: `product:${top.productId}`, riskLevel: 'low' },
        { label: '发现营销机会', action: 'agent:tool:marketing.opportunity.discover', riskLevel: 'low' },
      ],
    };
  }

  private async rankInventoryRisk(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const question = String(args.question ?? '');
    const wantsExpiringInventory = /临期|近效期|效期|过期|快到期|到期|批次/.test(question);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const now = new Date();
    const products = await (this.prisma as any).product.findMany({
      where: { storeId: context.storeId, deletedAt: null },
      select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true, unit: true, specUnit: true, status: true },
      take: 1000,
    });
    const productIds = (products as any[]).map((product) => Number(product.id)).filter(Boolean);
    const [orderItems, batches] = await Promise.all([
      productIds.length
        ? (this.prisma as any).orderItem.findMany({
            where: {
              itemType: 'product',
              itemId: { in: productIds },
              order: { storeId: context.storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: range.start, lt: range.end } },
            },
            include: { order: { select: { id: true, createdAt: true, status: true } } },
            take: 2000,
          })
        : [],
      productIds.length
        ? (this.prisma as any).stockBatch.findMany({
            where: { productId: { in: productIds }, stock: { gt: 0 } },
            select: { productId: true, stock: true, expiryDate: true },
            take: 2000,
          })
        : [],
    ]);
    const salesByProduct = new Map<number, { quantity: number; amount: number; orderIds: Set<number> }>();
    for (const item of orderItems as any[]) {
      const productId = Number(item.itemId);
      if (!productId) continue;
      const target = salesByProduct.get(productId) ?? { quantity: 0, amount: 0, orderIds: new Set<number>() };
      target.quantity += this.toNumber(item.quantity);
      target.amount += this.toNumber(item.subtotal);
      target.orderIds.add(Number(item.orderId));
      salesByProduct.set(productId, target);
    }
    const expiryByProduct = new Map<number, { expiringStock: number; nearestExpiryDate?: Date | string; daysToExpiry: number }>();
    for (const batch of batches as any[]) {
      const productId = Number(batch.productId);
      const daysToExpiry = this.daysUntil(batch.expiryDate);
      if (daysToExpiry > 90) continue;
      const target = expiryByProduct.get(productId) ?? { expiringStock: 0, nearestExpiryDate: undefined, daysToExpiry: 999 };
      target.expiringStock += this.toNumber(batch.stock);
      if (daysToExpiry < target.daysToExpiry) {
        target.daysToExpiry = daysToExpiry;
        target.nearestExpiryDate = batch.expiryDate;
      }
      expiryByProduct.set(productId, target);
    }

    const items = (products as any[])
      .map((product) => {
        const productId = Number(product.id);
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const sales = salesByProduct.get(productId) ?? { quantity: 0, amount: 0, orderIds: new Set<number>() };
        const expiry = expiryByProduct.get(productId) ?? { expiringStock: 0, nearestExpiryDate: undefined, daysToExpiry: 999 };
        const stockGap = Math.max(0, safetyStock - currentStock);
        const dailySales = sales.quantity / Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS));
        const projectedDemand14d = Math.ceil(dailySales * 14);
        const projectedGap14d = Math.max(0, projectedDemand14d - currentStock);
        const expiryScore = expiry.daysToExpiry <= 30 ? 30 : expiry.daysToExpiry <= 60 ? 18 : expiry.daysToExpiry <= 90 ? 10 : 0;
        const lowStockScore = stockGap > 0 ? Math.min(40, stockGap * 8) : currentStock <= safetyStock ? 10 : 0;
        const demandScore = Math.min(25, projectedGap14d * 6 + sales.quantity);
        const statusScore = product.status && product.status !== 'active' ? 5 : 0;
        const riskScore = Math.min(100, Math.round(lowStockScore + demandScore + expiryScore + statusScore));
        const riskLevel = riskScore >= 65 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
        const suggestedReplenishment = Math.max(stockGap, projectedGap14d);
        const suggestedAction =
          expiry.expiringStock > 0
            ? expiry.daysToExpiry <= 14
              ? '临期窗口很短，优先顾问定向邀约消化，暂停大批量补货。'
              : expiry.daysToExpiry <= 30
                ? '临期商品建议安排顾问复购承接或到店搭赠，处理前确认剩余库存。'
                : '纳入临期关注清单，结合近 30 天销量评估是否做小范围促销。'
            : suggestedReplenishment > 0
              ? '生成补货采购草稿，确认在途库存和供应商交期后再执行。'
              : '保持常规巡检。';
        const reasonParts = [
          stockGap > 0 ? `低于安全库存 ${this.formatQuantity(stockGap, product.specUnit ?? product.unit)}` : '',
          projectedGap14d > 0 ? `按近 30 天销量预计 14 天缺口 ${this.formatQuantity(projectedGap14d, product.specUnit ?? product.unit)}` : '',
          expiry.expiringStock > 0 ? `90 天内临期 ${this.formatQuantity(expiry.expiringStock, product.specUnit ?? product.unit)}` : '',
          sales.quantity > 0 ? `近 30 天销量 ${this.formatQuantity(sales.quantity, product.specUnit ?? product.unit)}` : '',
        ].filter(Boolean);
        return {
          productId,
          productName: product.name,
          sku: product.sku,
          currentStock,
          safetyStock,
          unit: product.specUnit ?? product.unit,
          status: product.status,
          stockGap,
          dailySales: Number(dailySales.toFixed(2)),
          salesQuantity: sales.quantity,
          salesAmount: sales.amount,
          orderCount: sales.orderIds.size,
          projectedDemand14d,
          projectedGap14d,
          suggestedReplenishment,
          expiringStock: expiry.expiringStock,
          daysToExpiry: expiry.daysToExpiry === 999 ? null : expiry.daysToExpiry,
          nearestExpiryDate: expiry.nearestExpiryDate ? this.formatDate(new Date(expiry.nearestExpiryDate)) : null,
          riskScore,
          riskLevel,
          suggestedAction,
          reason: reasonParts.join('；') || '库存风险较低，保持常规巡检。',
        };
      })
      .filter((item) =>
        wantsExpiringInventory
          ? item.expiringStock > 0
          : item.riskScore > 0 || item.currentStock <= item.safetyStock,
      )
      .sort((a, b) =>
        wantsExpiringInventory
          ? (a.daysToExpiry ?? 999) - (b.daysToExpiry ?? 999) || b.expiringStock - a.expiringStock
          : b.riskScore - a.riskScore || b.stockGap - a.stockGap,
      )
      .slice(0, limit);

    const evidence: AgentEvidence = {
      source: ['Product', 'StockBatch', 'ProductOrder', 'OrderItem'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        wantsExpiringInventory
          ? '临期库存清单 = 90 天内仍有库存的临期批次按最近到期日和临期库存量排序；仅查询清单和建议，不自动调价、不发布活动。'
          : 'stock_risk_score = 低库存缺口、安全库存、近 30 天销量推算的 14 天需求缺口、90 天内临期批次和商品状态的规则评分；仅生成库存风险建议，不自动采购。',
      filters: [
        'storeId=当前门店',
        'Product.deletedAt is null',
        'OrderItem.itemType=product',
        '订单状态 in completed/paid',
        wantsExpiringInventory ? 'StockBatch.stock > 0 and expiryDate <= next_90_days' : '',
        `limit=${limit}`,
      ].filter(Boolean),
      sampleSize: (products as any[]).length + (orderItems as any[]).length + (batches as any[]).length,
      limitations: ['P0 未叠加在途库存、供应商交期、最小起订量和真实耗材消耗预测；采购仍需走草稿和审批。'],
    };

    if (!items.length) {
      return {
        status: 'no_data',
        title: wantsExpiringInventory ? '临期库存清单' : '库存风险排行',
        summary: wantsExpiringInventory ? '未来 90 天暂无仍有库存的临期批次。' : '当前没有低库存、临期或 14 天预测缺口明显的商品。',
        data: {
          items: [],
          requestedLimit: limit,
          totalAvailable: 0,
          consumedSlots: this.buildConsumedSlots(range, limit, {}),
        },
        evidence,
        actions: [],
      };
    }

    const top = items[0];
    return {
      status: 'success',
      title: wantsExpiringInventory ? '临期库存清单' : '库存风险排行',
      summary: wantsExpiringInventory
        ? `找到 ${items.length} 个临期库存商品，最近到期的是 ${top.productName}，${top.daysToExpiry} 天后到期，临期库存 ${this.formatQuantity(top.expiringStock, top.unit)}。`
        : `库存风险最高的是 ${top.productName}，风险分 ${top.riskScore}，${top.reason}。`,
      data: {
        items,
        requestedLimit: limit,
        totalAvailable: items.length,
        mode: wantsExpiringInventory ? 'expiring_inventory' : 'inventory_risk',
        timeRange: { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label },
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [
        { label: '生成补货采购草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' },
        { label: '查看库存预警', action: 'inventory:stock', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseInventoryConsumptionTrend(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const movements = await (this.prisma as any).stockMovement.findMany({
      where: {
        storeId: context.storeId,
        occurredAt: { gte: range.start, lt: range.end },
        quantity: { lt: 0 },
      },
      include: { product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true, currentStock: true, safetyStock: true, costPrice: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 3000,
    });
    const buckets = new Map<number, any>();
    for (const movement of movements as any[]) {
      const productId = Number(movement.productId);
      if (!productId) continue;
      const target =
        buckets.get(productId) ??
        {
          productId,
          productName: movement.product?.name ?? `商品${productId}`,
          sku: movement.product?.sku,
          unit: movement.product?.specUnit ?? movement.product?.unit,
          currentStock: this.toNumber(movement.product?.currentStock),
          safetyStock: this.toNumber(movement.product?.safetyStock),
          costPrice: this.toNumber(movement.product?.costPrice),
          consumeQty: 0,
          consumeCost: 0,
          movementCount: 0,
          serviceConsumeCount: 0,
          saleOutCount: 0,
          lastOccurredAt: movement.occurredAt,
        };
      const qty = Math.abs(this.toNumber(movement.quantity));
      target.consumeQty += qty;
      target.consumeCost += qty * target.costPrice;
      target.movementCount += 1;
      if (/service|consume|耗材/.test(String(movement.movementType || movement.sourceType || ''))) target.serviceConsumeCount += 1;
      if (/sale|order|销售/.test(String(movement.movementType || movement.sourceType || ''))) target.saleOutCount += 1;
      if (new Date(movement.occurredAt) > new Date(target.lastOccurredAt)) target.lastOccurredAt = movement.occurredAt;
      buckets.set(productId, target);
    }
    const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS));
    const items = Array.from(buckets.values())
      .map((item) => {
        const dailyConsumption = item.consumeQty / days;
        const availableStock = Math.max(0, item.currentStock);
        const projectedDaysLeft = dailyConsumption > 0 ? availableStock / dailyConsumption : null;
        const suggestedQty = Math.max(0, item.safetyStock - item.currentStock);
        const riskLevel =
          item.currentStock <= 0
            ? 'high'
            : projectedDaysLeft !== null && projectedDaysLeft <= 7
            ? 'high'
            : projectedDaysLeft !== null && projectedDaysLeft <= 14
              ? 'medium'
              : item.currentStock <= item.safetyStock
                ? 'medium'
                : 'low';
        return {
          ...item,
          consumeCostText: this.formatMoney(item.consumeCost),
          dailyConsumption: Number(dailyConsumption.toFixed(2)),
          projectedDaysLeft: projectedDaysLeft === null ? null : Number(projectedDaysLeft.toFixed(1)),
          suggestedQty,
          riskLevel,
          reason:
            item.currentStock < 0
              ? `当前库存已为负数，按${range.label}日均消耗 ${this.formatQuantity(dailyConsumption, item.unit)}，建议至少补足 ${this.formatQuantity(suggestedQty, item.unit)} 到安全库存。`
              : projectedDaysLeft !== null
              ? `按${range.label}日均消耗 ${this.formatQuantity(dailyConsumption, item.unit)}，当前库存预计可用 ${Number(projectedDaysLeft.toFixed(1))} 天。`
              : '当前周期有出库记录，但无法形成稳定日均预测。',
        };
      })
      .sort((a, b) => b.consumeQty - a.consumeQty || b.consumeCost - a.consumeCost)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['StockMovement', 'Product'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '库存消耗趋势 = 查询周期内负数库存流水，按商品聚合消耗数量、消耗成本、日均消耗和预计可用天数；只读分析，不改库存。',
      filters: ['storeId=当前门店', 'StockMovement.quantity < 0', `limit=${limit}`],
      sampleSize: (movements as any[]).length,
      limitations: ['当前为规则型趋势分析，未叠加未来预约、在途采购和供应商交期。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '库存消耗趋势',
        summary: `${range.label}没有库存出库或耗材消耗流水。`,
        data: { items: [], requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '库存消耗趋势',
      summary: `${range.label}消耗最高的是 ${items[0].productName}，累计消耗 ${this.formatQuantity(items[0].consumeQty, items[0].unit)}，预计可用 ${items[0].projectedDaysLeft ?? '-'} 天。`,
      data: { items, requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
      evidence,
      actions: [
        { label: '生成补货采购草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' },
        { label: '查看库存风险', action: 'agent:tool:inventory.risk.rank', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseProjectBomInventoryRisk(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const projects = await (this.prisma as any).project.findMany({
      where: { storeId: context.storeId, deletedAt: null, status: { not: 'deleted' } },
      include: {
        bomItems: { include: { product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true, currentStock: true, safetyStock: true, costPrice: true } } } },
      },
      take: 1000,
    });
    const projectIds = (projects as any[]).map((project) => Number(project.id)).filter(Boolean);
    const orderItems = projectIds.length
      ? await (this.prisma as any).orderItem.findMany({
          where: {
            itemType: 'project',
            itemId: { in: projectIds },
            order: { storeId: context.storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: range.start, lt: range.end } },
          },
          include: { order: { select: { id: true, createdAt: true, status: true } } },
          take: 3000,
        })
      : [];
    const serviceQtyByProject = new Map<number, number>();
    for (const item of orderItems as any[]) {
      const projectId = Number(item.itemId);
      serviceQtyByProject.set(projectId, (serviceQtyByProject.get(projectId) ?? 0) + this.toNumber(item.quantity));
    }
    const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS));
    const items = (projects as any[])
      .map((project) => {
        const serviceCount = serviceQtyByProject.get(Number(project.id)) ?? 0;
        const bomItems = Array.isArray(project.bomItems) ? project.bomItems : [];
        const bomRisks = bomItems.map((bom: any) => {
          const product = bom.product ?? {};
          const standardQty = this.toNumber(bom.standardQty);
          const currentStock = this.toNumber(product.currentStock);
          const safetyStock = this.toNumber(product.safetyStock);
          const periodNeed = serviceCount * standardQty;
          const projected14dNeed = Math.ceil((periodNeed / days) * 14);
          const shortage = Math.max(0, projected14dNeed - currentStock);
          const belowSafety = Math.max(0, safetyStock - currentStock);
          const riskScore = Math.min(100, shortage * 12 + belowSafety * 8 + (standardQty > 0 ? 5 : 15));
          return {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unit: bom.unit ?? product.specUnit ?? product.unit,
            standardQty,
            currentStock,
            safetyStock,
            periodNeed,
            projected14dNeed,
            shortage,
            riskScore,
            reason: shortage > 0 ? `按项目服务量预计 14 天缺口 ${this.formatQuantity(shortage, bom.unit ?? product.specUnit ?? product.unit)}` : belowSafety > 0 ? `低于安全库存 ${this.formatQuantity(belowSafety, bom.unit ?? product.specUnit ?? product.unit)}` : '耗材保障正常',
          };
        });
        const missingBom = bomItems.length === 0;
        const topRisk = bomRisks.sort((a: any, b: any) => b.riskScore - a.riskScore)[0];
        const riskScore = missingBom ? 70 : Math.max(0, topRisk?.riskScore ?? 0);
        return {
          projectId: project.id,
          projectName: project.name,
          serviceCount,
          bomItemCount: bomItems.length,
          missingBom,
          riskScore,
          riskLevel: riskScore >= 65 ? 'high' : riskScore >= 35 ? 'medium' : 'low',
          topRiskProductName: topRisk?.productName,
          bomRisks: bomRisks.slice(0, 5),
          reason: missingBom ? '项目未配置 BOM，无法预测耗材保障。' : topRisk?.reason ?? '项目耗材保障正常。',
        };
      })
      .filter((item) => item.riskScore > 0 || item.serviceCount > 0)
      .sort((a, b) => b.riskScore - a.riskScore || b.serviceCount - a.serviceCount)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['Project', 'ProjectBomItem', 'Product', 'ProductOrder', 'OrderItem'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '项目 BOM 风险 = 项目服务次数 * BOM 标准用量，结合商品当前库存和安全库存推算 14 天耗材保障缺口。',
      filters: ['storeId=当前门店', 'Project.deletedAt is null', 'OrderItem.itemType=project', `limit=${limit}`],
      sampleSize: (projects as any[]).length + (orderItems as any[]).length,
      limitations: ['当前按订单项目服务量估算，不含未来预约和手工调整耗材。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '项目耗材 BOM 风险',
        summary: `${range.label}没有项目服务或 BOM 风险证据。`,
        data: { items: [], requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '项目耗材 BOM 风险',
      summary: `项目耗材风险最高的是 ${items[0].projectName}：${items[0].reason}`,
      data: { items, requestedLimit: limit, consumedSlots: this.buildConsumedSlots(range, limit, {}) },
      evidence,
      actions: [
        { label: '生成补货采购草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' },
        { label: '查看项目 BOM', action: 'inventory:bom:open', riskLevel: 'low' },
      ],
    };
  }

  private async suggestInventoryTransfers(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const filters = args.filters && typeof args.filters === 'object' ? args.filters as Record<string, unknown> : {};
    const targetStoreId = Number(args.targetStoreId ?? filters.targetStoreId) || undefined;
    const suggestions = await this.inventoryService.getTransferSuggestions(targetStoreId);
    const items = (Array.isArray(suggestions) ? suggestions : [])
      .slice(0, limit)
      .map((item: any) => ({
        id: item.id,
        sku: item.sku,
        productName: item.productName,
        productId: item.productId,
        fromStoreId: item.fromStoreId,
        fromStoreName: item.fromStoreName,
        toStoreId: item.toStoreId,
        toStoreName: item.toStoreName,
        sourceStock: this.toNumber(item.sourceStock),
        targetStock: this.toNumber(item.targetStock),
        safetyStock: this.toNumber(item.safetyStock),
        suggestedQty: this.toNumber(item.suggestedQty),
        unit: item.unit,
        reason: item.reason,
        riskLevel: 'medium',
        suggestedAction: '生成调拨申请草稿前，先确认来源门店可用库存和目标门店近期预约消耗。',
      }));
    const evidence: AgentEvidence = {
      source: ['Product', 'Store'],
      metricDefinition: '门店调拨建议 = 同 SKU 目标门店低于安全库存、来源门店高于安全库存 4 倍时计算可调拨数量；只读建议，不创建调拨单。',
      filters: [
        targetStoreId ? `targetStoreId=${targetStoreId}` : 'targetStoreId=全部门店',
        `contextStoreId=${context.storeId}`,
        `limit=${limit}`,
      ],
      sampleSize: items.length,
      limitations: ['未自动创建调拨单；正式调拨仍需在门店调拨页确认批次、数量和审批。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '门店调拨建议',
        summary: '当前没有符合安全库存规则的跨门店调拨建议。',
        data: { items: [], requestedLimit: limit, targetStoreId: targetStoreId ?? null, consumedSlots: { limit, filters: { targetStoreId: targetStoreId ?? null } } },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '门店调拨建议',
      summary: `找到 ${items.length} 条调拨建议，优先从 ${items[0].fromStoreName} 调 ${items[0].suggestedQty}${items[0].unit ?? ''} ${items[0].productName} 到 ${items[0].toStoreName}。`,
      data: { items, requestedLimit: limit, targetStoreId: targetStoreId ?? null, consumedSlots: { limit, filters: { targetStoreId: targetStoreId ?? null } } },
      evidence,
      actions: [
        { label: '查看门店调拨', action: 'inventory:transfer:open', riskLevel: 'low' },
      ],
    };
  }

  private async getIndustryChainOperationalReport(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const report = await this.industryService.productTemplateChainOperationalReport(
      { page: 1, pageSize: Math.max(limit, 50), storeId: context.storeId } as any,
      context.storeId,
    );
    const summary = (report as any).summary ?? {};
    const missingLocalSku = ((report as any).missingLocalSku ?? []).slice(0, limit);
    const productsMissingSupplyMapping = ((report as any).productsMissingSupplyMapping ?? []).slice(0, limit);
    const bomProductsWithoutStock = ((report as any).bomProductsWithoutStock ?? []).slice(0, limit);
    const lowStockPlatformPurchasable = ((report as any).lowStockPlatformPurchasable ?? []).slice(0, limit);
    const lowStockManualOnly = ((report as any).lowStockManualOnly ?? []).slice(0, limit);
    const issueCount =
      this.toNumber(summary.missingLocalSku) +
      this.toNumber(summary.productsMissingSupplyMapping) +
      this.toNumber(summary.bomProductsWithoutStock) +
      this.toNumber(summary.lowStockPlatformPurchasable) +
      this.toNumber(summary.lowStockManualOnly);
    const topIssue =
      this.toNumber(summary.missingLocalSku) > 0
        ? `有 ${summary.missingLocalSku} 个标准品未生成有效本地 SKU`
        : this.toNumber(summary.productsMissingSupplyMapping) > 0
          ? `有 ${summary.productsMissingSupplyMapping} 个本地产品缺供应链映射`
          : this.toNumber(summary.bomProductsWithoutStock) > 0
            ? `有 ${summary.bomProductsWithoutStock} 个 BOM 耗材当前无库存`
            : this.toNumber(summary.lowStockManualOnly) > 0
              ? `有 ${summary.lowStockManualOnly} 个低库存商品只能手工采购`
              : this.toNumber(summary.lowStockPlatformPurchasable) > 0
                ? `有 ${summary.lowStockPlatformPurchasable} 个低库存商品可生成平台采购单`
                : '当前标准品到库存采购链路没有明显断点';
    const evidence: AgentEvidence = {
      source: ['IndustryService.productTemplateChainOperationalReport'],
      sourceTables: [
        'IndustryProductTemplate',
        'IndustryProductAdoption',
        'Product',
        'ProjectBomItem',
        'SupplyCatalogMapping',
        'SupplyQuote',
        'ProcurementOrder',
        'StockMovement',
      ],
      metricDefinition:
        '行业标准品链路运营报表 = 已发布标准品到本地 SKU、供应链映射/报价、BOM 库存、低库存采购承接的断点清单；只读查询，不创建采购单、不改库存。',
      filters: ['storeId=当前门店', 'IndustryProductTemplate.status=published', 'Product.deletedAt is null', `limit=${limit}`],
      sampleSize:
        missingLocalSku.length +
        productsMissingSupplyMapping.length +
        bomProductsWithoutStock.length +
        lowStockPlatformPurchasable.length +
        lowStockManualOnly.length,
      limitations: ['低库存判断沿用当前安全库存规则；供应链可采购需存在 active/approved 且有效期内报价。'],
    };

    return {
      status: issueCount > 0 ? 'success' : 'no_data',
      title: '标准品到库存采购链路运营报表',
      summary:
        issueCount > 0
          ? `${topIssue}；本地 SKU、供应链映射、BOM 库存和采购承接明细已输出证据表。`
          : topIssue,
      data: {
        summary,
        items: {
          missingLocalSku,
          productsMissingSupplyMapping,
          bomProductsWithoutStock,
          lowStockPlatformPurchasable,
          lowStockManualOnly,
        },
        requestedLimit: limit,
        totalIssueCount: issueCount,
        generatedAt: (report as any).generatedAt,
        consumedSlots: { limit },
      },
      evidence,
      actions: [
        { label: '查看链路总览', action: 'industry:product-template-chain:open', riskLevel: 'low' },
        { label: '处理供应链映射', action: 'industry:supply-mappings:open', riskLevel: 'low' },
        { label: '查看库存采购', action: 'inventory:purchase:open', riskLevel: 'low' },
      ],
    };
  }

  private async createExpiringInventoryClearanceDraft(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const now = this.startOfDay(new Date());
    const horizonDays = Math.min(Math.max(Number(args.horizonDays) || 90, 1), 180);
    const end = new Date(now.getTime() + horizonDays * DAY_MS);
    const batches = await (this.prisma as any).stockBatch.findMany({
      where: { stock: { gt: 0 }, expiryDate: { gte: now, lte: end }, product: { storeId: context.storeId, deletedAt: null } },
      include: { product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true, currentStock: true, safetyStock: true, retailPrice: true, costPrice: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 1000,
    });
    const items = (batches as any[])
      .map((batch) => {
        const product = batch.product ?? {};
        const daysToExpiry = this.daysUntil(batch.expiryDate);
        const stock = this.toNumber(batch.stock);
        const retailPrice = this.toNumber(product.retailPrice);
        const costPrice = this.toNumber(product.costPrice);
        const suggestedDiscountRate = daysToExpiry <= 15 ? 0.75 : daysToExpiry <= 30 ? 0.85 : 0.9;
        const suggestedPrice = retailPrice ? Math.round(retailPrice * suggestedDiscountRate * 100) / 100 : null;
        const marginAfterDiscount = suggestedPrice !== null ? suggestedPrice - costPrice : null;
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          batchId: batch.id,
          batchNo: batch.batchNo,
          stock,
          unit: product.specUnit ?? product.unit,
          expiryDate: this.formatDate(new Date(batch.expiryDate)),
          daysToExpiry,
          retailPrice,
          costPrice,
          suggestedDiscountRate,
          suggestedPrice,
          suggestedPriceText: suggestedPrice !== null ? this.formatMoney(suggestedPrice) : null,
          marginAfterDiscount,
          riskLevel: daysToExpiry <= 15 ? 'high' : daysToExpiry <= 30 ? 'medium' : 'low',
          suggestedAction: daysToExpiry <= 30 ? '顾问定向邀约或护理搭赠' : '加入低峰到店加项礼',
        };
      })
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry || b.stock - a.stock)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['StockBatch', 'Product'],
      dateRange: `${this.formatDate(now)} 至 ${this.formatDate(end)}`,
      metricDefinition: '临期处理草稿 = 未来窗口内仍有库存的临期批次 + 零售价/成本价，生成建议折扣和处理动作；不自动调价、不发布活动、不触达客户。',
      filters: ['storeId=当前门店', 'StockBatch.stock > 0', `expiryDate<=${this.formatDate(end)}`, `limit=${limit}`],
      sampleSize: (batches as any[]).length,
      limitations: ['折扣建议为规则草稿，正式促销需结合毛利、客户名单和审批确认。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '临期库存处理草稿',
        summary: `未来 ${horizonDays} 天没有需要处理的临期库存批次。`,
        data: { items: [], requestedLimit: limit, horizonDays, consumedSlots: { limit } },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '临期库存处理草稿',
      summary: `发现 ${items.length} 个临期处理建议，优先处理 ${items[0].productName}，${items[0].daysToExpiry} 天后到期。`,
      data: { items, requestedLimit: limit, horizonDays, consumedSlots: { limit } },
      evidence,
      actions: [
        { label: '生成营销活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' },
        { label: '查看库存批次', action: 'inventory:expiry:open', riskLevel: 'low' },
      ],
    };
  }

  private async createPurchaseIntakeDraft(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const text = String(args.ocrText ?? args.imageText ?? args.text ?? args.question ?? '').trim();
    const parsedItems = this.parseInventoryDraftItems(text);
    const productNames = parsedItems.map((item) => item.productName).filter(Boolean);
    const products = productNames.length
      ? await (this.prisma as any).product.findMany({
          where: { storeId: context.storeId, deletedAt: null, OR: productNames.map((name) => ({ name: { contains: name } })) },
          select: { id: true, name: true, sku: true, unit: true, specUnit: true, costPrice: true, shelfLife: true, safetyStock: true, brand: true, spec: true },
          take: 100,
        })
      : [];
    const items = parsedItems.map((item, index) => {
      const matchedProduct = (products as any[]).find((product) => {
        const productName = String(product.name ?? '');
        return item.productName && (productName.includes(item.productName) || item.productName.includes(productName));
      });
      const metadata = this.buildProductMetadataSuggestion(item.productName, matchedProduct);
      return {
        lineNo: index + 1,
        productId: matchedProduct?.id ?? null,
        productName: matchedProduct?.name ?? item.productName,
        sku: matchedProduct?.sku ?? metadata.sku,
        quantity: item.quantity,
        unit: item.unit ?? matchedProduct?.unit ?? metadata.unit,
        unitPrice: item.unitPrice ?? matchedProduct?.costPrice ?? null,
        amount: item.unitPrice ? Number((item.quantity * item.unitPrice).toFixed(2)) : null,
        matchStatus: matchedProduct ? 'matched_product' : 'new_product_candidate',
        metadataSuggestion: metadata,
      };
    });
    const evidence: AgentEvidence = {
      source: ['OCR文本/图片识别文本', 'Product'],
      metricDefinition: '采购入库草稿 = 从识别文本抽取商品、数量、单位和单价，并匹配本店商品资料；只生成待确认草稿，不创建入库批次、不增加库存。',
      filters: [`storeId=${context.storeId}`, `parsedLines=${parsedItems.length}`],
      sampleSize: items.length + (products as any[]).length,
      limitations: ['OCR 结果需人工复核；未确认前不会创建采购单、库存批次或库存流水。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '采购入库草稿',
        summary: '没有从输入内容中识别到有效采购商品行。',
        data: { items: [], draftType: 'purchase_intake', sourceText: text, requiresConfirmation: true },
        evidence,
        actions: [],
      };
    }
    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    return {
      status: 'success',
      title: '采购入库草稿',
      summary: `已生成 ${items.length} 条采购入库草稿，预计金额 ${this.formatMoney(totalAmount)}；确认前不会入库。`,
      data: {
        draftType: 'purchase_intake',
        sourceText: text,
        status: 'pending_confirmation',
        requiresConfirmation: true,
        items,
        totalAmount,
      },
      evidence,
      actions: [{ label: '打开采购入库草稿', action: 'inventory:purchase:intake-draft', riskLevel: 'medium' }],
    };
  }

  private async createStockOperationDraft(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const text = String(args.voiceText ?? args.text ?? args.question ?? '').trim();
    const operationType = /盘点|修正/.test(text)
      ? 'stocktake'
      : /报废|过期|损耗/.test(text)
        ? 'scrap_out'
        : /出库|领用|消耗/.test(text)
          ? 'manual_outbound'
          : 'manual_adjustment';
    const parsedItems = this.parseInventoryDraftItems(text);
    const items = parsedItems.map((item, index) => ({
      lineNo: index + 1,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      targetStock: operationType === 'stocktake' ? item.quantity : undefined,
      adjustmentType: operationType,
      reason: text,
    }));
    const evidence: AgentEvidence = {
      source: ['语音转写文本/自然语言输入'],
      metricDefinition: '库存操作草稿 = 从语音或文本抽取商品和数量，生成出库、盘点或报废待确认草稿；不调用库存调整接口。',
      filters: [`storeId=${context.storeId}`, `operationType=${operationType}`],
      sampleSize: items.length,
      limitations: ['高风险库存动作必须人工确认；草稿不会改变商品库存、批次库存或库存流水。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '库存操作草稿',
        summary: '没有从输入内容中识别到有效库存操作明细。',
        data: { items: [], draftType: 'stock_operation', operationType, sourceText: text, requiresConfirmation: true },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '库存操作草稿',
      summary: `已生成 ${items.length} 条${operationType === 'stocktake' ? '盘点' : operationType === 'scrap_out' ? '报废' : '出库'}草稿，确认前不会改库存。`,
      data: {
        draftType: 'stock_operation',
        operationType,
        sourceText: text,
        status: 'pending_confirmation',
        requiresConfirmation: true,
        items,
      },
      evidence,
      actions: [{ label: '打开库存操作草稿', action: 'inventory:adjustment:draft', riskLevel: 'medium' }],
    };
  }

  private async suggestProductMetadata(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const rawNames = Array.isArray(args.items)
      ? args.items.map((item: any) => String(item.name ?? item.productName ?? item).trim()).filter(Boolean)
      : [String(args.productName ?? args.name ?? args.question ?? '').replace(/补全|元数据|商品|资料|建议/g, '').trim()].filter(Boolean);
    const items = rawNames.slice(0, 20).map((name) => ({
      productName: name,
      ...this.buildProductMetadataSuggestion(name),
    }));
    const evidence: AgentEvidence = {
      source: ['输入商品名称', '行业默认规则'],
      metricDefinition: '商品元数据建议 = 根据商品名称关键词推断品牌、规格、单位、保质期和建议安全库存；仅返回建议，不写入商品资料。',
      filters: [`storeId=${context.storeId}`, `itemCount=${items.length}`],
      sampleSize: items.length,
      limitations: ['品牌和规格为规则建议，保存前需要人工确认实物包装、供应商和保质期。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '商品元数据建议',
        summary: '请提供需要补全的商品名称。',
        data: { items: [], draftType: 'product_metadata_suggestion' },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '商品元数据建议',
      summary: `已生成 ${items.length} 个商品元数据建议，保存前需人工确认。`,
      data: { items, draftType: 'product_metadata_suggestion', requiresConfirmation: true },
      evidence,
      actions: [{ label: '打开商品资料', action: 'inventory:product:open', riskLevel: 'low' }],
    };
  }

  private parseInventoryDraftItems(text: string) {
    return text
      .split(/[\n；;，,]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const quantityMatch = line.match(/(\d+(?:\.\d+)?)\s*(瓶|盒|支|个|套|片|包|件|ml|g|kg)?/i);
        const priceMatch = line.match(/(?:单价|价格|¥|￥)\s*(\d+(?:\.\d+)?)/);
        const quantity = quantityMatch ? Number(quantityMatch[1]) : 0;
        const unit = quantityMatch?.[2] ?? undefined;
        const productName = line
          .replace(/(?:OCR|图片|识别|采购单|入库单|语音|转写|帮我|记录|请|入库|采购|出库|盘点|报废|领用|消耗|单价|价格|¥|￥|\d+(?:\.\d+)?\s*(瓶|盒|支|个|套|片|包|件|ml|g|kg)?)/gi, '')
          .replace(/[：:、，,。.\-\s]+/g, '')
          .replace(/\s+/g, '')
          .trim();
        return {
          productName,
          quantity,
          unit,
          unitPrice: priceMatch ? Number(priceMatch[1]) : undefined,
        };
      })
      .filter((item) => item.productName && item.quantity > 0);
  }

  private buildProductMetadataSuggestion(productName: string, matchedProduct?: any) {
    const name = String(productName ?? '').trim();
    const isMask = /面膜|膜/.test(name);
    const isEssence = /精华|原液|安瓶/.test(name);
    const isCleanser = /洗面|洁面|清洁/.test(name);
    const unit = matchedProduct?.unit ?? (isMask ? '片' : isEssence ? '瓶' : isCleanser ? '支' : '件');
    const shelfLife = Number(matchedProduct?.shelfLife ?? (isMask ? 730 : isEssence ? 1095 : 730));
    const safetyStock = Number(matchedProduct?.safetyStock ?? (isMask ? 30 : isEssence ? 10 : 8));
    return {
      brand: matchedProduct?.brand ?? this.inferBrand(name),
      spec: matchedProduct?.spec ?? this.inferSpec(name),
      unit,
      shelfLife,
      safetyStock,
      sku: matchedProduct?.sku ?? this.slugSku(name),
      confidence: matchedProduct ? 'high' : 'medium',
      needsConfirmation: true,
    };
  }

  private inferBrand(name: string) {
    const match = name.match(/^([A-Za-z0-9\u4e00-\u9fa5]{2,8})(?:牌|品牌)?/);
    return match?.[1] ?? '待确认品牌';
  }

  private inferSpec(name: string) {
    const match = name.match(/(\d+(?:\.\d+)?\s*(?:ml|g|kg|片|支|瓶|盒|包|件))/i);
    return match?.[1] ?? '待确认规格';
  }

  private slugSku(name: string) {
    const compact = name.replace(/\s+/g, '').slice(0, 12).toUpperCase();
    return `DRAFT-${Buffer.from(compact).toString('hex').slice(0, 10).toUpperCase()}`;
  }

  private async linkSupplierPurchaseOptions(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const products = await (this.prisma as any).product.findMany({
      where: { storeId: context.storeId, deletedAt: null },
      select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true, supplier: true, minPurchaseQty: true, unit: true, specUnit: true },
      take: 1000,
    });
    const productIds = (products as any[]).map((product) => Number(product.id)).filter(Boolean);
    const links = productIds.length
      ? await (this.prisma as any).supplyCatalogMapping.findMany({
          where: {
            productId: { in: productIds },
            mappingStatus: 'active',
            OR: [{ storeId: context.storeId }, { storeId: null }],
            supplySku: { deletedAt: null, status: 'active', auditStatus: 'approved' },
          },
          include: {
            supplySku: {
              include: {
                supplier: { select: { id: true, name: true, status: true, paymentTerms: true, phone: true } },
                quotes: {
                  where: { deletedAt: null, status: 'active', auditStatus: 'approved', stockStatus: { notIn: ['out_of_stock', 'unavailable'] } },
                  orderBy: [{ price: 'asc' }],
                  take: 1,
                },
              },
            },
          },
          take: 2000,
        })
      : [];
    const linkByProduct = new Map<number, any[]>();
    for (const link of links as any[]) {
      const productId = Number(link.productId);
      const arr = linkByProduct.get(productId) ?? [];
      arr.push(link);
      linkByProduct.set(productId, arr);
    }
    const items = (products as any[])
      .map((product) => {
        const options = (linkByProduct.get(Number(product.id)) ?? []).sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred));
        const primary = options[0];
        const quote = primary?.supplySku?.quotes?.[0];
        const suggestedQty = Math.max(this.toNumber(product.minPurchaseQty), Math.max(0, this.toNumber(product.safetyStock) - this.toNumber(product.currentStock)));
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock: this.toNumber(product.currentStock),
          safetyStock: this.toNumber(product.safetyStock),
          unit: product.specUnit ?? product.unit,
          suggestedQty,
          supplierName: primary?.supplySku?.supplier?.name ?? product.supplier ?? '未绑定平台供应商',
          supplierId: primary?.supplySku?.supplierId ?? null,
          supplyPrice: quote ? this.toNumber(quote.price) : null,
          supplyPriceText: quote ? this.formatMoney(this.toNumber(quote.price)) : null,
          moq: quote?.moq ?? product.minPurchaseQty ?? null,
          leadDays: quote?.leadDays ?? null,
          paymentTerms: primary?.supplySku?.supplier?.paymentTerms ?? null,
          optionCount: options.length,
          status: primary && quote ? 'linked' : primary ? 'mapped_no_quote' : 'missing_supplier_link',
          reason: primary && quote ? `已绑定 ${options.length} 个平台供货映射，优先 ${primary.supplySku?.supplier?.name}。` : primary ? '已建立平台映射但暂无有效报价。' : '未绑定平台供货映射，需先维护商品映射。',
        };
      })
      .filter((item) => item.status === 'missing_supplier_link' || item.currentStock <= item.safetyStock || item.suggestedQty > 0)
      .sort((a, b) => Number(a.status === 'missing_supplier_link') - Number(b.status === 'missing_supplier_link') || b.suggestedQty - a.suggestedQty)
      .slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['Product', 'SupplyCatalogMapping', 'SupplySku', 'SupplyQuote', 'SupplySupplier'],
      metricDefinition: '供应商采购链接 = 商品库存 + 平台商品映射 + 有效报价/起订量/交期；只返回采购建议，不创建采购单。',
      filters: ['storeId=当前门店', 'Product.deletedAt is null', 'SupplyCatalogMapping.mappingStatus=active', 'SupplyQuote.status=active', `limit=${limit}`],
      sampleSize: (products as any[]).length + (links as any[]).length,
      limitations: ['未接入外部供应链实时价格和真实下单链接；正式采购仍需生成采购草稿并审批。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '供应商采购链接',
        summary: '当前没有低库存或缺少平台供货映射的商品。',
        data: { items: [], requestedLimit: limit, consumedSlots: { limit } },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '供应商采购链接',
      summary: `已整理 ${items.length} 个采购建议，优先处理 ${items[0].productName}：${items[0].reason}`,
      data: { items, requestedLimit: limit, consumedSlots: { limit } },
      evidence,
      actions: [
        { label: '生成补货采购草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' },
        { label: '维护供应链映射', action: 'supply-platform:mapping:open', riskLevel: 'low' },
      ],
    };
  }

  private async discoverMarketingOpportunity(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const storeId = context.storeId;
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const now = new Date();
    const start = new Date(now.getTime() - 30 * DAY_MS);
    const products = await (this.prisma as any).product.findMany({
      where: { storeId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        currentStock: true,
        safetyStock: true,
        retailPrice: true,
        costPrice: true,
        unit: true, specUnit: true,
        status: true,
      },
      take: 1000,
    });
    const productIds = (products as any[]).map((item) => Number(item.id)).filter(Boolean);
    const [orderItems, batches] = await Promise.all([
      productIds.length
        ? (this.prisma as any).orderItem.findMany({
            where: {
              itemType: 'product',
              itemId: { in: productIds },
              order: { storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: start, lt: now } },
            },
            include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
            take: 2000,
          })
        : [],
      productIds.length
        ? (this.prisma as any).stockBatch.findMany({
            where: { productId: { in: productIds }, stock: { gt: 0 } },
            select: { productId: true, stock: true, expiryDate: true },
            take: 2000,
          })
        : [],
    ]);

    const salesByProduct = new Map<number, { quantity: number; amount: number; orderIds: Set<number>; customerIds: Set<number> }>();
    for (const item of orderItems as any[]) {
      const productId = Number(item.itemId);
      const target = salesByProduct.get(productId) ?? {
        quantity: 0,
        amount: 0,
        orderIds: new Set<number>(),
        customerIds: new Set<number>(),
      };
      target.quantity += this.toNumber(item.quantity);
      target.amount += this.toNumber(item.subtotal);
      target.orderIds.add(Number(item.orderId));
      if (item.order?.customerId) target.customerIds.add(Number(item.order.customerId));
      salesByProduct.set(productId, target);
    }

    const expiryByProduct = new Map<number, { expiringStock: number; nearestExpiryDate?: Date; daysToExpiry: number }>();
    for (const batch of batches as any[]) {
      const productId = Number(batch.productId);
      const daysToExpiry = this.daysUntil(batch.expiryDate);
      if (daysToExpiry > 90) continue;
      const target = expiryByProduct.get(productId) ?? { expiringStock: 0, nearestExpiryDate: undefined, daysToExpiry: 999 };
      target.expiringStock += this.toNumber(batch.stock);
      if (daysToExpiry < target.daysToExpiry) {
        target.daysToExpiry = daysToExpiry;
        target.nearestExpiryDate = batch.expiryDate;
      }
      expiryByProduct.set(productId, target);
    }

    const items = (products as any[])
      .map((product) => {
        const sales = salesByProduct.get(Number(product.id)) ?? { quantity: 0, amount: 0, orderIds: new Set<number>(), customerIds: new Set<number>() };
        const expiry = expiryByProduct.get(Number(product.id)) ?? { expiringStock: 0, nearestExpiryDate: undefined, daysToExpiry: 999 };
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const retailPrice = this.toNumber(product.retailPrice);
        const costPrice = this.toNumber(product.costPrice);
        const stockPressureScore = Math.min(30, Math.max(0, currentStock - safetyStock) * 2);
        const salesScore = Math.min(20, sales.quantity * 2 + sales.customerIds.size);
        const expiryScore = expiry.daysToExpiry <= 30 ? 20 : expiry.daysToExpiry <= 60 ? 14 : expiry.daysToExpiry <= 90 ? 8 : 0;
        const marginRate = retailPrice > 0 ? (retailPrice - costPrice) / retailPrice : 0;
        const marginScore = Math.min(15, Math.max(0, Math.round(marginRate * 20)));
        const customerFitScore = Math.min(15, sales.customerIds.size * 3);
        const fitScore = Math.round(stockPressureScore + salesScore + expiryScore + marginScore + customerFitScore);
        const opportunityType =
          expiryScore >= 14
            ? '临期消化'
            : stockPressureScore >= 18
              ? '库存压力'
              : salesScore >= 12
                ? '增长搭售'
                : '会员权益';
        const reasonParts = [
          currentStock > safetyStock ? `库存高于安全库存 ${this.formatQuantity(currentStock - safetyStock, product.specUnit ?? product.unit)}` : '',
          sales.quantity > 0 ? `近 30 天销售 ${this.formatQuantity(sales.quantity, product.specUnit ?? product.unit)}` : '近 30 天销量较少',
          expiry.expiringStock > 0 ? `90 天内临期库存 ${this.formatQuantity(expiry.expiringStock, product.specUnit ?? product.unit)}` : '',
          retailPrice > costPrice ? `毛利率约 ${this.formatPercent(marginRate)}` : '',
        ].filter(Boolean);
        const riskWarnings = [
          expiry.daysToExpiry <= 14 ? '临期窗口过短，建议顾问定向邀约，不建议公开大促。' : '',
          retailPrice > 0 && marginRate < 0.25 ? '毛利空间偏低，优惠力度需严格控制。' : '',
          currentStock <= safetyStock ? '库存接近或低于安全库存，不适合大范围活动。' : '',
        ].filter(Boolean);
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          opportunityType,
          fitScore,
          currentStock,
          safetyStock,
          unit: product.specUnit ?? product.unit,
          salesQuantity: sales.quantity,
          salesAmount: sales.amount,
          orderCount: sales.orderIds.size,
          customerCount: sales.customerIds.size,
          expiringStock: expiry.expiringStock,
          daysToExpiry: expiry.daysToExpiry === 999 ? null : expiry.daysToExpiry,
          marginRate,
          marginRateText: retailPrice > 0 ? this.formatPercent(marginRate) : '-',
          suggestedCampaign: this.suggestCampaign(opportunityType),
          suggestedChannels: ['miniapp', 'wechat', 'store'],
          reason: reasonParts.join('；') || '当前商品有基础库存，可作为低风险活动候选。',
          riskWarnings,
        };
      })
      .filter((item) => item.fitScore > 0 && item.currentStock > 0)
      .sort((a, b) => b.fitScore - a.fitScore || b.salesQuantity - a.salesQuantity)
      .slice(0, limit);

    const evidence: AgentEvidence = {
      source: ['Product', 'StockBatch', 'ProductOrder', 'OrderItem'],
      dateRange: `${formatBusinessDate(start)} 至 ${formatBusinessDate(now)}`,
      metricDefinition:
        '商品活动机会 = 库存压力、近 30 天销量、90 天临期库存、毛利空间和购买客户数的规则评分；仅生成建议，不自动创建活动。',
      filters: ['storeId=当前门店', 'Product.deletedAt is null', 'OrderItem.itemType=product', '订单状态 in completed/paid'],
      sampleSize: products.length + orderItems.length + batches.length,
      limitations: ['P0 使用规则评分，后续可叠加客户画像和历史活动转化。'],
    };

    if (!items.length) {
      return {
        status: 'no_data',
        title: '商品活动机会',
        summary: '当前没有足够商品库存、销量或临期证据支撑活动推荐。',
        data: { items },
        evidence,
        actions: [],
      };
    }

    return {
      status: 'success',
      title: '商品活动机会',
      summary: `优先推荐 ${items[0].productName} 做${items[0].suggestedCampaign}，匹配分 ${items[0].fitScore}。`,
      data: { items },
      evidence,
      actions: [
        { label: '生成活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' },
        { label: '查看商品详情', action: `product:${items[0].productId}`, riskLevel: 'low' },
      ],
    };
  }

  private async createMarketingActivityDraft(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const opportunityItems = this.extractOpportunityItems(args).slice(0, 5);
    const primary = opportunityItems[0];
    const productName = String(primary?.productName ?? primary?.name ?? '推荐商品');
    const campaignName = String(args.offerSummary ?? args.offer ?? primary?.suggestedCampaign ?? '会员专属活动').trim() || '会员专属活动';
    const title = String(args.title ?? `${productName}${campaignName}`).trim() || `${productName}${campaignName}`;
    const targetAudience = String(args.targetAudience ?? '由 Ami 经营 Agent 推荐，需运营人员在发布前确认人群和权益。').trim() || '由 Ami 经营 Agent 推荐，需运营人员在发布前确认人群和权益。';
    const copyPreview = String(args.copyPreview ?? '').trim();
    const scheduleHint = String(args.scheduleHint ?? '').trim();
    const activity = await this.marketingService.createActivity({
      title,
      description: [
        this.buildMarketingDraftDescription(opportunityItems, args),
        copyPreview ? `\n触达话术：${copyPreview}` : '',
        scheduleHint ? `\n建议发送时间：${scheduleHint}` : '',
      ].filter(Boolean).join(''),
      status: 'draft',
      targetCustomers: targetAudience,
      discount: campaignName,
      sourceRecommendationId: `agent_run_${context.runId}`,
      sourceSignalsJson: {
        source: 'agent',
        runId: context.runId,
        storeId: context.storeId,
        approvedBy: context.userId ?? null,
        question: args.question,
        editedDraft: {
          title,
          targetAudience,
          offerSummary: campaignName,
          copyPreview,
          scheduleHint,
        },
      },
      recommendedItemsJson: opportunityItems,
      offerJson: {
        type: 'agent_suggested',
        label: campaignName,
        reason: '来自 Ami 经营 Agent 的商品活动机会推荐，审批通过后创建草稿。',
      },
    }, context.storeId);

    return {
      status: 'success',
      title: '营销活动草稿',
      summary: `已创建营销活动草稿「${activity.title}」，请在管理端确认人群、权益和投放渠道后发布。`,
      data: {
        activityId: activity.id,
        title: activity.title,
        status: activity.status,
        targetAudience,
        offerSummary: campaignName,
        copyPreview,
        scheduleHint,
        recommendedItems: opportunityItems,
      },
      evidence: {
        source: ['AgentApproval', 'MarketingActivity'],
        metricDefinition: '中风险写入工具必须先生成 AgentApproval，审批通过后仅创建 draft 状态营销活动，不自动发布或触达。',
        filters: [`runId=${context.runId}`, 'status=draft'],
        sampleSize: opportunityItems.length,
      },
      actions: [
        { label: '查看活动草稿', action: `marketing:activity:${activity.id}`, riskLevel: 'low' },
        { label: '继续完善活动', action: `marketing:activity:edit:${activity.id}`, riskLevel: 'medium' },
      ],
    };
  }

  private async createCustomerFollowUpTaskDraft(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
    const candidates = await this.resolveFollowUpCandidates(context.storeId, args, limit);
    const evidence: AgentEvidence = {
      source: ['Customer', 'CustomerPredictionSnapshot', 'TerminalFollowUpTask'],
      metricDefinition:
        '客户跟进任务草稿 = 优先选择高流失、高复购或高营销响应客户；审批通过后仅创建待处理跟进任务，不自动触达客户。',
      filters: ['storeId=当前门店', 'Customer.deletedAt is null', `limit=${limit}`],
      sampleSize: candidates.length,
      limitations: ['P0 使用预测快照和客户最近到店信号，后续可叠加小程序行为和活动领取状态。'],
    };

    if (!candidates.length) {
      return {
        status: 'no_data',
        title: '客户跟进任务草稿',
        summary: '当前没有找到适合创建跟进任务的客户。',
        data: { items: [] },
        evidence,
        actions: [],
      };
    }

    const taskTitle = String(args.title || 'Ami 经营 Agent 客户跟进');
    const script = this.buildFollowUpScript(candidates[0], args);
    const dueAt = new Date(Date.now() + 2 * DAY_MS).toISOString();
    const result = await this.terminalService.batchCreateFollowUpTasks(
      context.storeId,
      {
        customerId: Number(candidates[0].customerId),
        customerIds: candidates.map((item) => Number(item.customerId)),
        source: 'agent',
        triggerType: String(args.triggerType || 'agent_customer_followup'),
        sourceRecommendationKey: `agent_run_${context.runId}_customer_followup`,
        title: taskTitle,
        priority: candidates.some((item) => item.priority === 'urgent') ? 'urgent' : 'recommended',
        assigneeRole: 'consultant',
        channel: String(args.channel || 'phone'),
        script,
        note: this.buildFollowUpNote(candidates, args),
        dueAt,
      },
      context.userId,
    );

    return {
      status: 'success',
      title: '客户跟进任务草稿',
      summary: `已创建 ${result.createdCount} 条客户跟进任务，重复 ${result.duplicatedCount} 条，失败 ${result.failedCount} 条。`,
      data: {
        ...result,
        candidates,
      },
      evidence: {
        ...evidence,
        source: ['AgentApproval', 'Customer', 'CustomerPredictionSnapshot', 'TerminalFollowUpTask'],
        filters: [...evidence.filters, `runId=${context.runId}`, 'status=pending'],
      },
      actions: [
        { label: '查看跟进任务', action: 'terminal:followup-tasks', riskLevel: 'low' },
        { label: '查看客户列表', action: 'customers:data', riskLevel: 'low' },
      ],
    };
  }

  private async createInventoryReplenishmentDraft(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
    const suggestions = (await this.inventoryService.getReplenishment(context.storeId)).slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['Product', 'SupplyCatalogMapping', 'SupplyQuote', 'PurchaseOrder'],
      metricDefinition:
        '补货采购草稿 = currentStock <= safetyStock 的商品按安全库存缺口和最小采购量计算建议采购量；审批通过后仅创建草稿采购单。',
      filters: ['storeId=当前门店', 'Product.deletedAt is null', 'currentStock <= safetyStock', `limit=${limit}`],
      sampleSize: suggestions.length,
      limitations: ['P0 未扣减/增加库存，未自动下单；后续可叠加在途库存、供应商交期和销量预测。'],
    };

    if (!suggestions.length) {
      return {
        status: 'no_data',
        title: '补货采购草稿',
        summary: '当前没有低于安全库存的商品，不需要生成补货采购草稿。',
        data: { items: [] },
        evidence,
        actions: [],
      };
    }

    const items = suggestions.map((item: any) => ({
      productId: item.id,
      productName: item.productName,
      sku: item.sku,
      quantity: Number(item.suggestedQty ?? 0),
      unitPrice: Number(item.supplyPrice ?? 0),
      subtotal: Number(item.estimatedAmount ?? 0),
      currentStock: Number(item.currentStock ?? 0),
      safetyStock: Number(item.safetyStock ?? 0),
      supplier: item.supplier,
    }));
    const supplier = String(args.supplier || suggestions[0]?.supplier || '默认供应商');
    const order = await this.inventoryService.createPurchaseOrder({
      supplier,
      status: '草稿',
      source: 'agent',
      storeName: `门店 ${context.storeId}`,
      expectedDate: this.formatDate(new Date(Date.now() + 7 * DAY_MS)),
      items,
    });

    return {
      status: 'success',
      title: '补货采购草稿',
      summary: `已创建补货采购草稿「${order.orderNo}」，包含 ${items.length} 个低库存商品，预计金额 ¥${Number(order.totalAmount || 0).toLocaleString('zh-CN') }。`,
      data: {
        purchaseOrderId: order.id,
        orderNo: order.orderNo,
        status: order.status,
        totalAmount: order.totalAmount,
        items,
      },
      evidence: {
        ...evidence,
        source: ['AgentApproval', 'Product', 'SupplyCatalogMapping', 'SupplyQuote', 'PurchaseOrder'],
        filters: [...evidence.filters, `runId=${context.runId}`, 'status=草稿'],
      },
      actions: [
        { label: '查看采购草稿', action: `inventory:purchase-order:${order.id}`, riskLevel: 'low' },
        { label: '查看库存预警', action: 'inventory:stock', riskLevel: 'low' },
      ],
    };
  }

  private async createServiceRecordDraft(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
    const start = this.startOfDay(new Date());
    const end = new Date(start.getTime() + DAY_MS);
    const beauticianId = await this.resolveBeauticianId(context, args);
    const tasks = await (this.prisma as any).serviceTask.findMany({
      where: {
        storeId: context.storeId,
        status: { in: ['pending', 'in_progress'] },
        appointmentTime: { gte: start, lt: end },
        ...(beauticianId ? { beauticianId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, memberLevel: true, phone: true, tags: true } },
        project: {
          select: {
            id: true,
            name: true,
            duration: true,
            bomItems: { include: { product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true } } } },
          },
        },
        beautician: { select: { id: true, name: true } },
      },
      orderBy: [{ appointmentTime: 'asc' }],
      take: limit,
    });

    const evidence: AgentEvidence = {
      source: ['ServiceTask', 'Customer', 'Project', 'ProjectBomItem'],
      dateRange: this.formatDate(start),
      metricDefinition: '服务记录草稿 = 今日 pending/in_progress 服务任务 + 项目耗材 BOM + 客户标签生成填写建议；不会提交正式服务记录。',
      filters: [
        '当前门店',
        'ServiceTask.status in pending/in_progress',
        'appointmentTime=今日',
        beauticianId ? '仅查询当前美容师服务任务' : '查询全部美容师待服务任务',
        `最多返回 ${limit} 条`,
      ],
      sampleSize: tasks.length,
      limitations: ['草稿仅作为填写建议，正式服务记录仍需美容师确认提交。'],
    };

    const items = (tasks as any[]).map((task) => this.mapServiceRecordDraftItem(task));
    if (!items.length) {
      return {
        status: 'no_data',
        title: '服务记录草稿建议',
        summary: beauticianId ? '当前美容师今日没有待提交服务记录。' : '今日没有待提交服务记录。',
        data: { items: [] },
        evidence,
        actions: [{ label: '查看服务记录', action: 'beautician.record', riskLevel: 'low' }],
      };
    }

    return {
      status: 'success',
      title: '服务记录草稿建议',
      summary: `已生成 ${items.length} 条服务记录草稿建议，需美容师确认后再提交正式服务记录。`,
      data: { items },
      evidence,
      actions: [
        { label: '打开服务记录', action: 'beautician.record', riskLevel: 'low' },
        { label: '查看我的预约', action: 'beautician.schedule', riskLevel: 'low' },
      ],
    };
  }

  private async getBeauticianTodayServiceList(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const start = this.startOfDay(new Date());
    const end = new Date(start.getTime() + DAY_MS);
    const beauticianId = await this.resolveBeauticianId(context, args);
    const scopeLabel = context.role === 'beautician' ? '本人' : beauticianId ? '指定美容师' : '全店美容师';
    const range = { start, end, label: '今日', preset: 'today' };

    if (context.role === 'beautician' && !beauticianId) {
      return this.buildBeauticianUnboundResult('今日服务客户', start, ['ServiceTask', 'Reservation'], {
        range,
        limit,
        filters: { scope: '本人' },
      });
    }

    const [tasks, reservations] = await Promise.all([
      (this.prisma as any).serviceTask.findMany({
        where: {
          storeId: context.storeId,
          appointmentTime: { gte: start, lt: end },
          ...(beauticianId ? { beauticianId } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, memberLevel: true, tags: true, lastVisitDate: true } },
          project: { select: { id: true, name: true, duration: true } },
          beautician: { select: { id: true, name: true, status: true } },
        },
        orderBy: [{ appointmentTime: 'asc' }],
        take: 200,
      }),
      (this.prisma as any).reservation.findMany({
        where: {
          storeId: context.storeId,
          date: { gte: start, lt: end },
          status: { not: 'cancelled' },
          ...(beauticianId ? { beauticianId } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, memberLevel: true, tags: true, lastVisitDate: true } },
          project: { select: { id: true, name: true, duration: true } },
          beautician: { select: { id: true, name: true, status: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 200,
      }),
    ]);

    const items = [
      ...(tasks as any[]).map((task) => ({
        sourceType: 'service_task',
        taskId: task.id,
        reservationId: null,
        customerId: task.customerId,
        customerName: task.customer?.name ?? `客户${task.customerId}`,
        memberLevel: task.customer?.memberLevel ?? '',
        projectId: task.projectId,
        projectName: task.project?.name ?? `项目${task.projectId}`,
        beauticianId: task.beauticianId,
        beauticianName: task.beautician?.name,
        startTime: this.formatTime(new Date(task.appointmentTime)),
        endTime: this.formatTime(new Date(new Date(task.appointmentTime).getTime() + this.toNumber(task.duration || task.project?.duration || 60) * 60_000)),
        status: String(task.status || ''),
        tags: task.customer?.tags ?? [],
        lastVisitDays: this.daysSince(task.customer?.lastVisitDate),
        prepSuggestion: this.buildServicePrepSuggestion(task.project?.name, task.customer?.tags),
      })),
      ...(reservations as any[]).map((reservation) => ({
        sourceType: 'reservation',
        taskId: null,
        reservationId: reservation.id,
        customerId: reservation.customerId,
        customerName: reservation.customer?.name ?? `客户${reservation.customerId}`,
        memberLevel: reservation.customer?.memberLevel ?? '',
        projectId: reservation.projectId,
        projectName: reservation.project?.name ?? `项目${reservation.projectId}`,
        beauticianId: reservation.beauticianId,
        beauticianName: reservation.beautician?.name,
        startTime: reservation.startTime || this.formatTime(new Date(reservation.date)),
        endTime: reservation.endTime || this.addMinutes(reservation.startTime || this.formatTime(new Date(reservation.date)), this.toNumber(reservation.project?.duration) || 60),
        status: String(reservation.status || ''),
        tags: reservation.customer?.tags ?? [],
        lastVisitDays: this.daysSince(reservation.customer?.lastVisitDate),
        prepSuggestion: this.buildServicePrepSuggestion(reservation.project?.name, reservation.customer?.tags),
      })),
    ]
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
      .slice(0, limit);

    const evidence: AgentEvidence = {
      source: ['ServiceTask', 'Reservation', 'Customer', 'Project'],
      dateRange: this.formatDate(start),
      metricDefinition: '今日服务客户 = 今日服务任务 + 未取消预约，按预约/服务时间排序；只读查询，不变更预约或服务记录。',
      filters: ['当前门店', `scope=${scopeLabel}`, 'Reservation.status != cancelled', `limit=${limit}`],
      sampleSize: (tasks as any[]).length + (reservations as any[]).length,
      limitations: ['服务任务和预约可能存在同一客户同一项目重复展示，正式服务记录仍以服务任务为准。'],
    };

    if (!items.length) {
      return {
        status: 'no_data',
        title: context.role === 'beautician' ? '我今天的服务客户' : '今日美容师服务客户',
        summary: `${scopeLabel}今日暂无服务任务或预约。`,
        data: { items: [], scope: scopeLabel, consumedSlots: this.buildConsumedSlots(range, limit, { scope: scopeLabel }) },
        evidence,
        actions: [{ label: '查看我的预约', action: 'beautician.schedule', riskLevel: 'low' }],
      };
    }

    const first = items[0];
    return {
      status: 'success',
      title: context.role === 'beautician' ? '我今天的服务客户' : '今日美容师服务客户',
      summary: `${scopeLabel}今日共 ${items.length} 条服务/预约记录，下一位客户是 ${first.customerName}，${first.startTime} 做 ${first.projectName}。`,
      data: {
        items,
        kpis: {
          serviceOrReservationCount: items.length,
          taskCount: (tasks as any[]).length,
          reservationCount: (reservations as any[]).length,
        },
        scope: scopeLabel,
        consumedSlots: this.buildConsumedSlots(range, limit, { scope: scopeLabel }),
      },
      evidence,
      actions: [
        { label: '生成服务记录草稿', action: 'agent:tool:service.record.draft', riskLevel: 'low' },
        { label: '查看下一个客户护理摘要', action: 'agent:tool:beautician.customer.care.brief', riskLevel: 'low' },
      ],
    };
  }

  private async getBeauticianCustomerCareBrief(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const start = this.startOfDay(new Date());
    const end = new Date(start.getTime() + DAY_MS);
    const beauticianId = await this.resolveBeauticianId(context, args);
    if (context.role === 'beautician' && !beauticianId) {
      return this.buildBeauticianUnboundResult('客户护理摘要', start, ['Beautician']);
    }

    const explicitCustomerId = Number(args.customerId);
    const tasks = await (this.prisma as any).serviceTask.findMany({
      where: {
        storeId: context.storeId,
        appointmentTime: { gte: start, lt: end },
        status: { in: ['pending', 'in_progress'] },
        ...(beauticianId ? { beauticianId } : {}),
        ...(Number.isFinite(explicitCustomerId) && explicitCustomerId > 0 ? { customerId: explicitCustomerId } : {}),
      },
      include: {
        customer: { include: { healthProfile: true } },
        project: {
          select: {
            id: true,
            name: true,
            duration: true,
            bomItems: { include: { product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true } } } },
          },
        },
        beautician: { select: { id: true, name: true, status: true } },
      },
      orderBy: [{ appointmentTime: 'asc' }],
      take: 5,
    });
    const task = (tasks as any[])[0];
    const evidence: AgentEvidence = {
      source: ['ServiceTask', 'Customer', 'CustomerHealthProfile', 'CustomerCard', 'CardUsageRecord', 'ProjectBomItem'],
      dateRange: this.formatDate(start),
      metricDefinition: '客户护理摘要 = 下一条待服务任务 + 客户基础档案/肤况档案 + 活跃卡项 + 近90天核销记录 + 项目BOM注意事项；只做护理准备建议。',
      filters: ['当前门店', beauticianId ? '美容师本人或指定美容师' : '全店美容师', 'ServiceTask.status in pending/in_progress', 'appointmentTime=今日'],
      sampleSize: (tasks as any[]).length,
      limitations: ['护理建议不构成医疗诊断；涉及皮肤异常、过敏或不适时，应建议客户咨询专业医疗机构。'],
    };
    if (!task) {
      return {
        status: 'no_data',
        title: '客户护理摘要',
        summary: '今日没有找到待服务客户，暂无法生成护理准备摘要。',
        data: { items: [] },
        evidence,
        actions: [{ label: '查看今日服务', action: 'agent:tool:beautician.today.service.list', riskLevel: 'low' }],
      };
    }

    const [cards, usages] = await Promise.all([
      (this.prisma as any).customerCard.findMany({
        where: { customerId: task.customerId, status: 'active' },
        select: { id: true, cardName: true, totalTimes: true, remainingTimes: true, expiryDate: true, status: true },
        orderBy: { expiryDate: 'asc' },
        take: 10,
      }),
      (this.prisma as any).cardUsageRecord.findMany({
        where: { customerId: task.customerId, verifiedAt: { gte: new Date(start.getTime() - 90 * DAY_MS), lt: end } },
        select: { id: true, cardName: true, projectName: true, times: true, remainingTimes: true, verifiedAt: true },
        orderBy: { verifiedAt: 'desc' },
        take: 10,
      }),
    ]);

    const customer = task.customer ?? {};
    const health = customer.healthProfile ?? {};
    const activeCards = (cards as any[]).map((card) => ({
      cardId: card.id,
      cardName: card.cardName,
      remainingTimes: card.remainingTimes,
      expiryDate: this.formatDate(new Date(card.expiryDate)),
      daysToExpire: this.daysUntil(card.expiryDate),
      risk: this.daysUntil(card.expiryDate) <= 30 || this.toNumber(card.remainingTimes) <= 2 ? '需要提醒' : '正常',
    }));
    const recentUsages = (usages as any[]).map((usage) => ({
      usageId: usage.id,
      cardName: usage.cardName,
      projectName: usage.projectName,
      times: usage.times,
      remainingTimes: usage.remainingTimes,
      verifiedAt: this.formatDate(new Date(usage.verifiedAt)),
    }));
    const carePoints = [
      health.skinType ? `肤质：${health.skinType}` : '',
      health.mainProblems ? `主要关注：${health.mainProblems}` : '',
      customer.hasAllergy ? `过敏史：${customer.hasAllergy}` : '',
      customer.hasSurgery ? `术后/医美史：${customer.hasSurgery}` : '',
      Array.isArray(customer.tags) && customer.tags.length ? `标签：${customer.tags.join('、')}` : '',
      activeCards.some((card) => card.risk === '需要提醒') ? '有卡项临期或剩余次数较少，可在服务后做温和续卡提醒。' : '',
    ].filter(Boolean);
    const bomItems = Array.isArray(task.project?.bomItems) ? task.project.bomItems : [];
    return {
      status: 'success',
      title: '客户护理摘要',
      summary: `${task.customer?.name ?? '客户'} ${this.formatTime(new Date(task.appointmentTime))} 做 ${task.project?.name ?? '护理项目'}；重点关注 ${carePoints[0] ?? '到店状态和本次反馈'}。`,
      data: {
        customer: {
          customerId: task.customerId,
          customerName: customer.name,
          memberLevel: customer.memberLevel,
          visitCount: this.toNumber(customer.visitCount),
          lastVisitDate: customer.lastVisitDate ? this.formatDate(new Date(customer.lastVisitDate)) : null,
        },
        service: {
          taskId: task.id,
          taskNo: task.taskNo,
          projectId: task.projectId,
          projectName: task.project?.name,
          appointmentTime: task.appointmentTime,
          beauticianName: task.beautician?.name,
        },
        carePoints,
        activeCards,
        recentUsages,
        bomItems: bomItems.map((item: any) => ({
          productId: item.productId,
          productName: item.product?.name,
          standardQty: this.toNumber(item.standardQty),
          unit: item.unit ?? item.product?.specUnit ?? item.product?.unit,
        })),
        recommendedSteps: [
          '服务前确认客户今日肤感、作息、近期是否有过敏或不适。',
          '服务中按项目标准流程记录实际耗材，异常反馈写入服务记录。',
          '服务后根据卡项剩余和护理周期，给出下一次到店建议。',
        ],
      },
      evidence: { ...evidence, sampleSize: (tasks as any[]).length + (cards as any[]).length + (usages as any[]).length },
      actions: [
        { label: '生成服务记录草稿', action: 'agent:tool:service.record.draft', riskLevel: 'low' },
        { label: '查看复购机会', action: 'agent:tool:beautician.repurchase.opportunity', riskLevel: 'low' },
      ],
    };
  }

  private async getBeauticianPerformanceProgress(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const result = await this.rankStaffPerformance({ ...args, timeRange: args.timeRange ?? 'this_month', limit: 1 }, context);
    const targetAmount = Number(args.targetAmount);
    const item = Array.isArray((result.data as any)?.items) ? (result.data as any).items[0] : null;
    if (result.status !== 'success' || !item) {
      return { ...result, title: context.role === 'beautician' ? '我的业绩进度' : '美容师业绩进度' };
    }
    const gap = Number.isFinite(targetAmount) && targetAmount > 0 ? Math.max(0, targetAmount - this.toNumber(item.salesAmount)) : null;
    return {
      ...result,
      title: context.role === 'beautician' ? '我的业绩进度' : '美容师业绩进度',
      summary:
        gap !== null
          ? `${item.beauticianName ?? '当前美容师'}本月销售额 ${item.salesAmountText}，目标 ${this.formatMoney(targetAmount)}，还差 ${this.formatMoney(gap)}；服务 ${this.formatQuantity(item.serviceCount, '次')}，提成 ${item.commissionAmountText}。`
          : `${item.beauticianName ?? '当前美容师'}本月销售额 ${item.salesAmountText}，服务 ${this.formatQuantity(item.serviceCount, '次')}，提成 ${item.commissionAmountText}，表现分 ${item.performanceScore}。`,
      data: {
        ...(result.data as Record<string, unknown>),
        progress: {
          targetAmount: Number.isFinite(targetAmount) && targetAmount > 0 ? targetAmount : null,
          targetAmountText: Number.isFinite(targetAmount) && targetAmount > 0 ? this.formatMoney(targetAmount) : null,
          gapAmount: gap,
          gapAmountText: gap !== null ? this.formatMoney(gap) : null,
          completionRate: Number.isFinite(targetAmount) && targetAmount > 0 ? this.toNumber(item.salesAmount) / targetAmount : null,
          completionRateText: Number.isFinite(targetAmount) && targetAmount > 0 ? this.formatPercent(this.toNumber(item.salesAmount) / targetAmount) : null,
        },
      },
      actions: [
        { label: '查看服务记录', action: 'beautician.record', riskLevel: 'low' },
        { label: '查看复购机会', action: 'agent:tool:beautician.repurchase.opportunity', riskLevel: 'low' },
      ],
    };
  }

  private async findBeauticianRepurchaseOpportunities(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const lookbackStart = new Date(range.start.getTime() - 90 * DAY_MS);
    const beauticianId = await this.resolveBeauticianId(context, args);
    const scopeLabel = context.role === 'beautician' ? '本人服务客户' : beauticianId ? '指定美容师服务客户' : '全店服务客户';
    if (context.role === 'beautician' && !beauticianId) {
      return this.buildBeauticianUnboundResult('复购续卡机会', range.start, ['Beautician'], {
        range,
        limit,
        filters: { scope: '本人服务客户' },
      });
    }

    const [tasks, usages] = await Promise.all([
      (this.prisma as any).serviceTask.findMany({
        where: {
          storeId: context.storeId,
          appointmentTime: { gte: lookbackStart, lt: range.end },
          ...(beauticianId ? { beauticianId } : {}),
          status: { in: ['completed', 'done'] },
        },
        include: {
          customer: { select: { id: true, name: true, memberLevel: true, totalSpent: true, visitCount: true, lastVisitDate: true, tags: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { appointmentTime: 'desc' },
        take: 1000,
      }),
      (this.prisma as any).cardUsageRecord.findMany({
        where: {
          storeId: context.storeId,
          verifiedAt: { gte: lookbackStart, lt: range.end },
          ...(beauticianId ? { beauticianId } : {}),
        },
        select: { id: true, customerId: true, customerName: true, cardName: true, projectName: true, times: true, remainingTimes: true, verifiedAt: true },
        orderBy: { verifiedAt: 'desc' },
        take: 1000,
      }),
    ]);
    const customerIds = Array.from(
      new Set([
        ...(tasks as any[]).map((task) => Number(task.customerId)).filter(Boolean),
        ...(usages as any[]).map((usage) => Number(usage.customerId)).filter(Boolean),
      ]),
    );
    const cards = customerIds.length
      ? await (this.prisma as any).customerCard.findMany({
          where: { customerId: { in: customerIds }, status: 'active' },
          select: { id: true, customerId: true, cardName: true, totalTimes: true, remainingTimes: true, expiryDate: true, status: true },
          orderBy: { expiryDate: 'asc' },
          take: 2000,
        })
      : [];

    const bucket = new Map<number, any>();
    const ensure = (customerId: number, seed?: any) => {
      const existing = bucket.get(customerId);
      if (existing) return existing;
      const next = {
        customerId,
        customerName: seed?.customer?.name ?? seed?.customerName ?? `客户${customerId}`,
        memberLevel: seed?.customer?.memberLevel ?? '',
        totalSpent: this.toNumber(seed?.customer?.totalSpent),
        visitCount: this.toNumber(seed?.customer?.visitCount),
        lastVisitDate: seed?.customer?.lastVisitDate ?? null,
        tags: seed?.customer?.tags ?? [],
        lastServiceAt: null as Date | null,
        lastProjectName: '',
        serviceCount: 0,
        usageTimes: 0,
        cardNames: new Set<string>(),
        minRemainingTimes: 999,
        nearestExpiryDays: 999,
      };
      bucket.set(customerId, next);
      return next;
    };
    for (const task of tasks as any[]) {
      const target = ensure(Number(task.customerId), task);
      target.serviceCount += 1;
      target.lastProjectName = target.lastProjectName || task.project?.name || '';
      const time = task.completedAt ? new Date(task.completedAt) : new Date(task.appointmentTime);
      if (!target.lastServiceAt || time > target.lastServiceAt) target.lastServiceAt = time;
    }
    for (const usage of usages as any[]) {
      const target = ensure(Number(usage.customerId), usage);
      target.usageTimes += this.toNumber(usage.times);
      target.lastProjectName = target.lastProjectName || usage.projectName || '';
      if (usage.cardName) target.cardNames.add(String(usage.cardName));
      const time = new Date(usage.verifiedAt);
      if (!target.lastServiceAt || time > target.lastServiceAt) target.lastServiceAt = time;
      target.minRemainingTimes = Math.min(target.minRemainingTimes, this.toNumber(usage.remainingTimes));
    }
    for (const card of cards as any[]) {
      const target = ensure(Number(card.customerId), { customerName: `客户${card.customerId}` });
      target.cardNames.add(String(card.cardName || '卡项'));
      target.minRemainingTimes = Math.min(target.minRemainingTimes, this.toNumber(card.remainingTimes));
      target.nearestExpiryDays = Math.min(target.nearestExpiryDays, this.daysUntil(card.expiryDate));
    }

    const items = Array.from(bucket.values())
      .map((item) => {
        const lastServiceDays = this.daysSince(item.lastServiceAt);
        const lowTimes = item.minRemainingTimes <= 2;
        const expiring = item.nearestExpiryDays <= 30;
        const dueForCare = lastServiceDays !== null && lastServiceDays >= 21;
        const score =
          (lowTimes ? 35 : 0) +
          (expiring ? 30 : 0) +
          (dueForCare ? 25 : 0) +
          Math.min(20, item.serviceCount * 4) +
          Math.min(20, item.totalSpent / 1000);
        const reasonParts = [
          lowTimes ? `卡项剩余 ${item.minRemainingTimes} 次` : '',
          expiring ? `卡项 ${item.nearestExpiryDays} 天内到期` : '',
          dueForCare ? `距上次护理 ${lastServiceDays} 天` : '',
          item.lastProjectName ? `最近项目：${item.lastProjectName}` : '',
        ].filter(Boolean);
        return {
          customerId: item.customerId,
          customerName: item.customerName,
          memberLevel: item.memberLevel,
          totalSpent: item.totalSpent,
          totalSpentText: this.formatMoney(item.totalSpent),
          visitCount: item.visitCount,
          lastServiceDays,
          lastProjectName: item.lastProjectName,
          serviceCount: item.serviceCount,
          usageTimes: item.usageTimes,
          cardNames: Array.from(item.cardNames),
          minRemainingTimes: item.minRemainingTimes === 999 ? null : item.minRemainingTimes,
          nearestExpiryDays: item.nearestExpiryDays === 999 ? null : item.nearestExpiryDays,
          opportunityScore: Math.round(score),
          opportunityType: lowTimes || expiring ? '续卡/卡项提醒' : dueForCare ? '护理复购' : '关系维护',
          reason: reasonParts.join('；') || '近期有服务记录，可做轻量回访。',
          suggestedAction: lowTimes || expiring ? '服务后做卡项续费提醒' : '预约下一次护理周期',
        };
      })
      .filter((item) => item.opportunityScore > 0)
      .sort((a, b) => b.opportunityScore - a.opportunityScore || (b.totalSpent as number) - (a.totalSpent as number))
      .slice(0, limit);

    const evidence: AgentEvidence = {
      source: ['ServiceTask', 'CardUsageRecord', 'CustomerCard', 'Customer'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '复购续卡机会 = 美容师近期服务客户 + 次卡核销/剩余次数 + 卡项到期 + 护理周期，生成只读建议，不自动创建任务或触达客户。',
      filters: ['当前门店', `scope=${scopeLabel}`, `lookbackStart=${this.formatDate(lookbackStart)}`, `limit=${limit}`],
      sampleSize: (tasks as any[]).length + (usages as any[]).length + (cards as any[]).length,
      limitations: ['复购建议仅用于服务后沟通，不自动创建跟进任务、不发送营销消息。'],
    };
    if (!items.length) {
      return {
        status: 'no_data',
        title: '复购续卡机会',
        summary: `${scopeLabel}近期没有可识别的复购或续卡机会。`,
        data: { items: [], requestedLimit: limit, scope: scopeLabel },
        evidence,
        actions: [],
      };
    }
    return {
      status: 'success',
      title: '复购续卡机会',
      summary: `${scopeLabel}识别到 ${items.length} 个复购/续卡机会，优先跟进 ${items[0].customerName}：${items[0].reason}。`,
      data: { items, requestedLimit: limit, scope: scopeLabel },
      evidence,
      actions: [
        { label: '生成跟进任务草稿', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'medium' },
        { label: '查看今日服务', action: 'agent:tool:beautician.today.service.list', riskLevel: 'low' },
      ],
    };
  }

  private buildBeauticianUnboundResult(
    title: string,
    date: Date,
    source: string[],
    slotContext?: { range: AgentDateRange; limit: number; filters?: Record<string, unknown> },
  ): AgentToolResult {
    return {
      status: 'no_data',
      title,
      summary: '当前账号未绑定美容师档案，无法查询本人服务数据。',
      data: {
        items: [],
        scope: '本人',
        ...(slotContext
          ? { consumedSlots: this.buildConsumedSlots(slotContext.range, slotContext.limit, slotContext.filters ?? {}) }
          : {}),
      },
      evidence: {
        source,
        dateRange: this.formatDate(date),
        metricDefinition: `${title}仅允许美容师查看本人数据；账号未绑定美容师档案时不查询全店数据。`,
        filters: ['当前账号为美容师角色', '未找到与当前账号绑定的美容师档案'],
        sampleSize: 0,
        limitations: ['请先在员工档案中绑定当前登录账号，或由店长账号查询。'],
      },
      actions: [],
    };
  }

  private buildServicePrepSuggestion(projectName?: string, tags?: unknown) {
    const text = `${projectName ?? ''} ${Array.isArray(tags) ? tags.join(' ') : String(tags ?? '')}`;
    if (/敏感|修护|屏障/.test(text)) return '先确认近期泛红、刺痛和过敏情况，项目强度以舒缓修护为主。';
    if (/补水|保湿|水光/.test(text)) return '重点确认干燥、脱皮和居家补水情况，服务后提醒保湿与防晒。';
    if (/清洁|毛孔|小气泡/.test(text)) return '重点确认近期刷酸/清洁频次，避免同日叠加强刺激项目。';
    return '服务前确认今日肤感、睡眠和近期不适，服务后记录客户反馈与下次护理建议。';
  }

  private async previewSchedulingOptimization(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const weekStart = this.resolveWeekStart(args.weekStart);
    const mode = String(args.mode || 'copy_last_week_optimize') as any;
    const objective = String(args.objective || 'cover_reservations') as any;
    const preview = await this.smartSchedulingService.preview({
      storeId: context.storeId,
      weekStart,
      mode,
      objective,
      keepConfirmedReservations: true,
      allowOverrideBusy: false,
      allowOverrideLeave: false,
      createdById: context.userId,
    });
    const schedules = Array.isArray((preview as any).schedules) ? (preview as any).schedules : [];
    const conflicts = Array.isArray((preview as any).conflicts) ? (preview as any).conflicts : [];
    const warnings = Array.isArray((preview as any).warnings) ? (preview as any).warnings : [];
    const explanations = Array.isArray((preview as any).explanations) ? (preview as any).explanations : [];
    const evidence: AgentEvidence = {
      source: ['Reservation', 'Schedule', 'Beautician', 'BeauticianAvailability', 'BeauticianTimeOff', 'SmartSchedulingRun'],
      dateRange: `${weekStart} 起 7 天`,
      metricDefinition: '排班优化预览 = 复用智能排班 preview，覆盖预约、峰值、请假忙碌与技能匹配；不会发布排班。',
      filters: ['storeId=当前门店', `mode=${mode}`, `objective=${objective}`, 'status=preview'],
      sampleSize: schedules.length,
      limitations: ['预览会记录 SmartSchedulingRun，但不会调用 publish；正式发布仍需管理端确认。'],
    };

    return {
      status: 'success',
      title: '智能排班优化预览',
      summary: `已生成 ${weekStart} 周排班优化预览，评分 ${(preview as any).score ?? 0}，硬冲突 ${this.toNumber((preview as any).summary?.hardConflictCount)} 个，软提醒 ${warnings.length} 个。`,
      data: {
        runId: (preview as any).runId,
        weekStart: (preview as any).weekStart,
        score: (preview as any).score,
        summary: (preview as any).summary,
        schedules: schedules.slice(0, 20),
        warnings: warnings.slice(0, 10),
        conflicts: conflicts.slice(0, 10),
        explanations: explanations.slice(0, 10),
      },
      evidence,
      actions: [
        { label: '查看排班表', action: 'scheduling:open', riskLevel: 'low' },
        { label: '管理端确认发布', action: `scheduling:preview:${(preview as any).runId}`, riskLevel: 'medium' },
      ],
    };
  }

  private async diagnoseSchedule(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'today');
    const [schedules, reservations] = await Promise.all([
      (this.prisma as any).schedule.findMany({
        where: { storeId: context.storeId, date: { gte: range.start, lt: range.end } },
        include: { beautician: { select: { id: true, name: true, status: true } } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 2000,
      }),
      (this.prisma as any).reservation.findMany({
        where: { storeId: context.storeId, date: { gte: range.start, lt: range.end }, status: { not: 'cancelled' } },
        include: {
          beautician: { select: { id: true, name: true, status: true } },
          project: { select: { id: true, name: true, duration: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 2000,
      }),
    ]);
    const staffMap = new Map<
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
        reservationCount: number;
      }
    >();
    for (const schedule of schedules as any[]) {
      const beauticianId = Number(schedule.beauticianId);
      const target =
        staffMap.get(beauticianId) ??
        {
          beauticianId,
          beauticianName: schedule.beautician?.name ?? `美容师${beauticianId}`,
          status: schedule.beautician?.status ?? '',
          slotCount: 0,
          availableCount: 0,
          busyCount: 0,
          leaveCount: 0,
          occupiedSlotCount: 0,
          reservationCount: 0,
        };
      const status = String(schedule.status || '');
      target.slotCount += 1;
      if (/available|normal|正常|空闲/.test(status)) target.availableCount += 1;
      if (/busy|booked|忙|占用/.test(status)) target.busyCount += 1;
      if (/leave|off|请假|休/.test(status)) target.leaveCount += 1;
      if (!/available|normal|正常|空闲/.test(status)) target.occupiedSlotCount += 1;
      staffMap.set(beauticianId, target);
    }
    for (const reservation of reservations as any[]) {
      const beauticianId = Number(reservation.beauticianId);
      if (!beauticianId) continue;
      const target =
        staffMap.get(beauticianId) ??
        {
          beauticianId,
          beauticianName: reservation.beautician?.name ?? `美容师${beauticianId}`,
          status: reservation.beautician?.status ?? '',
          slotCount: 0,
          availableCount: 0,
          busyCount: 0,
          leaveCount: 0,
          occupiedSlotCount: 0,
          reservationCount: 0,
        };
      target.reservationCount += 1;
      staffMap.set(beauticianId, target);
    }
    const staffItems = Array.from(staffMap.values())
      .map((item) => ({
        ...item,
        utilizationRate: item.slotCount ? item.occupiedSlotCount / item.slotCount : 0,
        utilizationRateText: this.formatPercent(item.slotCount ? item.occupiedSlotCount / item.slotCount : 0),
      }))
      .sort((a, b) => b.utilizationRate - a.utilizationRate || b.reservationCount - a.reservationCount)
      .slice(0, limit);
    const idleStaff = staffItems
      .filter((item) => item.availableCount > 0 && item.busyCount === 0 && item.leaveCount === 0)
      .sort((a, b) => b.availableCount - a.availableCount);
    const peakSlots = this.buildSchedulePeakSlots(reservations as any[], schedules as any[]).slice(0, limit);
    const totalSlots = staffItems.reduce((sum, item) => sum + item.slotCount, 0);
    const occupiedSlots = staffItems.reduce((sum, item) => sum + item.occupiedSlotCount, 0);
    const arrivedCount = (reservations as any[]).filter((item) => ['checked_in', 'completed'].includes(String(item.status))).length;
    const pendingCount = (reservations as any[]).filter((item) => !['checked_in', 'completed'].includes(String(item.status))).length;
    const uncoveredReservations = (reservations as any[]).filter((reservation) => {
      if (!reservation.beauticianId) return true;
      const date = this.formatDate(new Date(reservation.date));
      const startTime = reservation.startTime || this.formatTime(new Date(reservation.date));
      const endTime = reservation.endTime || this.addMinutes(startTime, this.toNumber(reservation.project?.duration) || 60);
      return !(schedules as any[]).some(
        (schedule) =>
          Number(schedule.beauticianId) === Number(reservation.beauticianId) &&
          this.formatDate(new Date(schedule.date)) === date &&
          !/busy|leave|请假|忙碌|占用/.test(String(schedule.status || '')) &&
          this.timeCovers(schedule.startTime, schedule.endTime, startTime, endTime),
      );
    });
    const evidence: AgentEvidence = {
      source: ['Schedule', 'Reservation', 'Beautician'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        'schedule_utilization_rate = 非 available/normal/正常/空闲 排班时段数 / 总排班时段数；预约排班诊断同时统计预约数、已到店数、空闲美容师和未覆盖预约。',
      filters: ['storeId=当前门店', 'Reservation.status != cancelled', 'Schedule.date=查询周期', `limit=${limit}`],
      sampleSize: (schedules as any[]).length + (reservations as any[]).length,
      limitations: ['P0 不发布或改写排班；时段覆盖按排班 startTime/endTime 与预约 startTime/endTime 做规则判断。'],
    };

    if (!schedules.length && !reservations.length) {
      return {
        status: 'no_data',
        title: '预约排班诊断',
        summary: `${range.label}暂无预约和排班数据，无法诊断忙闲或人手缺口。`,
        data: {
          staffItems: [],
          peakSlots: [],
          idleStaff: [],
          uncoveredReservations: [],
          requestedLimit: limit,
          consumedSlots: this.buildConsumedSlots(range, limit, {}),
        },
        evidence,
        actions: [],
      };
    }

    const topStaff = staffItems[0];
    const summaryParts = [
      `${range.label}有效预约 ${(reservations as any[]).length} 条，已到店/完成 ${arrivedCount} 条`,
      totalSlots ? `整体排班占用率 ${this.formatPercent(occupiedSlots / totalSlots)}` : '',
      topStaff ? `${topStaff.beauticianName} 占用率最高，为 ${topStaff.utilizationRateText}` : '',
      uncoveredReservations.length ? `${uncoveredReservations.length} 条预约可能未被有效排班覆盖` : '',
      idleStaff.length ? `${idleStaff.length} 位美容师仍有空闲时段` : '',
    ].filter(Boolean);
    const uncoveredReservationItems = uncoveredReservations.slice(0, limit).map((item: any) => ({
      reservationId: item.id,
      customerName: item.customer?.name,
      projectName: item.project?.name,
      beauticianName: item.beautician?.name,
      startTime: item.startTime,
      endTime: item.endTime,
      status: item.status,
    }));
    return {
      status: 'success',
      title: '预约排班诊断',
      summary: `${summaryParts.join('；')}。`,
      data: {
        columns: ['beauticianName', 'utilizationRateText', 'reservationCount', 'availableCount', 'busyCount', 'leaveCount'],
        items: staffItems,
        kpis: {
          reservationCount: (reservations as any[]).length,
          arrivedCount,
          pendingCount,
          scheduleSlotCount: totalSlots,
          occupiedSlotCount: occupiedSlots,
          utilizationRate: totalSlots ? occupiedSlots / totalSlots : 0,
          utilizationRateText: totalSlots ? this.formatPercent(occupiedSlots / totalSlots) : '0%',
          uncoveredReservationCount: uncoveredReservations.length,
          idleStaffCount: idleStaff.length,
        },
        staffItems,
        peakSlots,
        idleStaff,
        uncoveredReservations: uncoveredReservationItems,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [
        { label: '查看排班表', action: 'scheduling:open', riskLevel: 'low' },
        { label: '生成排班优化预览', action: 'agent:tool:scheduling.optimization.preview', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseProjects(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const question = String(args.question || '');
    const taskMetrics = Array.isArray((args.businessTask as any)?.metrics) ? ((args.businessTask as any).metrics as string[]) : [];
    const wantsMargin = taskMetrics.includes('gross_margin') || /毛利|耗材|成本|利润/.test(question);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const previousRange = this.previousSameLengthRange(range);
    const orderItems = await (this.prisma as any).orderItem.findMany({
      where: {
        itemType: 'project',
        itemId: { not: null },
        order: {
          storeId: context.storeId,
          status: { in: PAID_ORDER_STATUSES },
          createdAt: { gte: previousRange.start, lt: range.end },
        },
      },
      include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const orderProjectIds = [...new Set((orderItems as any[]).map((item) => Number(item.itemId)).filter(Boolean))];
    const projects = await (this.prisma as any).project.findMany({
      where: { storeId: context.storeId, deletedAt: null, ...(orderProjectIds.length && !wantsMargin ? { id: { in: orderProjectIds } } : {}) },
      select: {
        id: true,
        name: true,
        price: true,
        duration: true,
        status: true,
        bomItems: { select: { standardQty: true, unit: true, product: { select: { id: true, name: true, costPrice: true, unit: true, specUnit: true } } } },
      },
      take: 1000,
    });
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
      const orderTime = new Date(item.order?.createdAt).getTime();
      const isCurrent = orderTime >= range.start.getTime() && orderTime < range.end.getTime();
      const isPrevious = orderTime >= previousRange.start.getTime() && orderTime < previousRange.end.getTime();
      if (!isCurrent && !isPrevious) continue;
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
      const subtotal = this.toNumber(item.subtotal);
      if (isCurrent) {
        target.currentCount += quantity;
        target.currentSalesAmount += subtotal;
        if (item.order?.customerId) target.customerIds.add(Number(item.order.customerId));
      } else {
        target.previousCount += quantity;
        target.previousSalesAmount += subtotal;
      }
      bucket.set(projectId, target);
    }
    const projectIdsForItems = new Set<number>(bucket.keys());
    if (wantsMargin) {
      for (const project of projects as any[]) {
        const projectId = Number(project.id);
        if (projectId) projectIdsForItems.add(projectId);
      }
    }
    const items = Array.from(projectIdsForItems.values())
      .map((projectId) => {
        const project = projectById.get(projectId);
        const item =
          bucket.get(projectId) ??
          ({
            projectId,
            projectName: project?.name ?? `项目 ${projectId}`,
            currentCount: 0,
            previousCount: 0,
            currentSalesAmount: 0,
            previousSalesAmount: 0,
            customerIds: new Set<number>(),
          } satisfies {
            projectId: number;
            projectName: string;
            currentCount: number;
            previousCount: number;
            currentSalesAmount: number;
            previousSalesAmount: number;
            customerIds: Set<number>;
          });
        const materialCost = this.calculateProjectMaterialCost(project);
        const projectPrice = this.toNumber(project?.price);
        const grossMargin = projectPrice - materialCost;
        const grossMarginRate = projectPrice ? grossMargin / projectPrice : 0;
        const growthCount = item.currentCount - item.previousCount;
        const growthRate =
          item.previousCount > 0
            ? growthCount / item.previousCount
            : item.currentCount > 0
              ? 1
              : 0;
        const marginRisk = grossMarginRate < 0.35 ? 'high' : grossMarginRate < 0.55 ? 'medium' : 'low';
        const reasonParts = [
          `近周期服务 ${this.formatQuantity(item.currentCount, '次')}`,
          `环比 ${this.formatPercent(growthRate)}`,
          `项目收入 ${this.formatMoney(item.currentSalesAmount)}`,
          project?.bomItems?.length ? `耗材毛利率 ${this.formatPercent(grossMarginRate)}` : '未配置 BOM 耗材',
        ];
        return {
          projectId: item.projectId,
          projectName: project?.name ?? item.projectName,
          status: project?.status,
          duration: project?.duration,
          projectPrice,
          serviceCount: item.currentCount,
          previousServiceCount: item.previousCount,
          growthCount,
          growthRate,
          growthRateText: this.formatPercent(growthRate),
          salesAmount: item.currentSalesAmount,
          salesAmountText: this.formatMoney(item.currentSalesAmount),
          previousSalesAmount: item.previousSalesAmount,
          customerCount: item.customerIds.size,
          materialCost,
          materialCostText: this.formatMoney(materialCost),
          grossMargin,
          grossMarginText: this.formatMoney(grossMargin),
          grossMarginRate,
          grossMarginRateText: this.formatPercent(grossMarginRate),
          bomItemCount: project?.bomItems?.length ?? 0,
          marginRisk,
          reason: reasonParts.join('；'),
        };
      })
      .filter((item) => (wantsMargin ? item.bomItemCount > 0 || item.serviceCount > 0 : item.serviceCount > 0))
      .sort((a, b) => {
        if (wantsMargin) {
          const aMissingBom = a.bomItemCount > 0 ? 0 : 1;
          const bMissingBom = b.bomItemCount > 0 ? 0 : 1;
          return aMissingBom - bMissingBom || a.grossMarginRate - b.grossMarginRate || b.serviceCount - a.serviceCount;
        }
        return b.growthRate - a.growthRate || b.serviceCount - a.serviceCount;
      })
      .slice(0, limit);
    const lowMarginItems = [...items]
      .filter((item) => item.bomItemCount > 0)
      .sort((a, b) => a.grossMarginRate - b.grossMarginRate)
      .slice(0, Math.min(limit, 5));
    const evidence: AgentEvidence = {
      source: ['ProductOrder', 'OrderItem', 'Project', 'ProjectBomItem', 'Product'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        '项目经营诊断 = 已完成/已支付订单中 OrderItem.itemType=project 的服务次数、项目收入和客户数，与上一等长周期对比；耗材毛利 = 项目价格 - BOM 标准用量 * 商品成本价。',
      filters: ['storeId=当前门店', '订单状态 in completed/paid', 'OrderItem.itemType=project', 'Project.deletedAt is null', `limit=${limit}`],
      sampleSize: (orderItems as any[]).length + (projects as any[]).length,
      limitations: ['P0 耗材毛利仅按标准 BOM 和商品成本估算，未计入人工、房租、设备折旧和实际异常消耗。'],
    };

    if (!items.length) {
      return {
        status: 'no_data',
        title: '项目经营诊断',
        summary: wantsMargin
          ? `${range.label}没有项目 BOM 成本配置或项目订单明细，无法诊断项目耗材毛利。`
          : `${range.label}没有足够项目订单明细，无法诊断项目服务趋势。`,
        data: {
          items: [],
          lowMarginItems: [],
          requestedLimit: limit,
          consumedSlots: this.buildConsumedSlots(range, limit, {}),
        },
        evidence,
        actions: [],
      };
    }

    const top = items[0];
    const lowestMargin = lowMarginItems[0];
    const marginText = lowestMargin
      ? `；耗材毛利率最低的是 ${lowestMargin.projectName}，毛利率 ${lowestMargin.grossMarginRateText}`
      : '';
    const summary = wantsMargin && lowestMargin
      ? `${range.label}耗材毛利率最低的是 ${lowestMargin.projectName}，毛利率 ${lowestMargin.grossMarginRateText}，标准耗材成本 ${lowestMargin.materialCostText}；同期服务 ${this.formatQuantity(lowestMargin.serviceCount, '次')}，收入 ${lowestMargin.salesAmountText}。`
      : `${range.label}服务增长最快的是 ${top.projectName}，服务 ${this.formatQuantity(top.serviceCount, '次')}，环比 ${top.growthRateText}，收入 ${top.salesAmountText}${marginText}。`;
    return {
      status: 'success',
      title: '项目经营诊断',
      summary,
      data: {
        items,
        lowMarginItems,
        requestedLimit: limit,
        currentRange: { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label },
        previousRange: { start: this.formatDate(previousRange.start), end: this.formatDate(previousRange.end), label: previousRange.label },
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [
        { label: '查看项目管理', action: 'projects:open', riskLevel: 'low' },
        { label: '发现项目活动机会', action: 'agent:tool:marketing.opportunity.discover', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseCards(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const question = String(args.question || '');
    const taskMetrics = Array.isArray((args.businessTask as any)?.metrics) ? ((args.businessTask as any).metrics as string[]) : [];
    const wantsUsage = taskMetrics.includes('card_usage_times') || /核销|消耗|使用|划扣/.test(question);
    const wantsBalance = taskMetrics.includes('member_balance') || /会员卡|储值|余额|充值/.test(question);
    const wantsExpiry = taskMetrics.includes('card_expiry_risk') || /次卡|卡项|疗程卡|到期|过期|剩余|余次|风险|预警/.test(question);
    const includeExpiry = wantsExpiry || (!wantsUsage && !wantsBalance);
    const includeUsage = wantsUsage || wantsExpiry || (!wantsBalance && !wantsExpiry);
    const includeBalance = wantsBalance;
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const expiryEnd = new Date(Date.now() + 30 * DAY_MS);

    const [customerCards, usageRecords, balanceAccounts, balanceTransactions] = await Promise.all([
      includeExpiry
        ? (this.prisma as any).customerCard.findMany({
            where: {
              status: 'active',
              remainingTimes: { gt: 0 },
              customer: { storeId: context.storeId, deletedAt: null },
            },
            include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
            orderBy: [{ expiryDate: 'asc' }, { remainingTimes: 'asc' }],
            take: 1000,
          })
        : Promise.resolve([]),
      includeUsage
        ? (this.prisma as any).cardUsageRecord.findMany({
            where: {
              verifiedAt: { gte: range.start, lt: range.end },
              customer: { storeId: context.storeId, deletedAt: null },
            },
            select: {
              id: true,
              customerId: true,
              cardName: true,
              projectName: true,
              times: true,
              remainingTimes: true,
              beauticianId: true,
              verifiedAt: true,
            },
            orderBy: { verifiedAt: 'desc' },
            take: 2000,
          })
        : Promise.resolve([]),
      includeBalance
        ? (this.prisma as any).customerBalanceAccount.findMany({
            where: { storeId: context.storeId, status: 'active' },
            include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
            orderBy: { updatedAt: 'desc' },
            take: 1000,
          })
        : Promise.resolve([]),
      includeBalance
        ? (this.prisma as any).customerBalanceTransaction.findMany({
            where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } },
            select: {
              id: true,
              customerId: true,
              type: true,
              amount: true,
              giftAmount: true,
              cashBalanceAfter: true,
              giftBalanceAfter: true,
              paymentMethod: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 2000,
          })
        : Promise.resolve([]),
    ]);

    const expiryItems = (customerCards as any[])
      .map((card) => {
        const daysToExpire = this.daysUntil(card.expiryDate);
        const usageRate = card.totalTimes ? (this.toNumber(card.totalTimes) - this.toNumber(card.remainingTimes)) / this.toNumber(card.totalTimes) : 0;
        const riskScore =
          (daysToExpire !== null && daysToExpire <= 7 ? 45 : daysToExpire !== null && daysToExpire <= 30 ? 25 : 5) +
          (this.toNumber(card.remainingTimes) <= 1 ? 30 : this.toNumber(card.remainingTimes) <= 3 ? 15 : 0) +
          Math.round(Math.max(0, 1 - usageRate) * 20);
        return {
          customerCardId: card.id,
          customerId: card.customerId,
          customerName: card.customer?.name,
          phone: this.maskPhone(card.customer?.phone),
          memberLevel: card.customer?.memberLevel,
          cardName: card.cardName,
          totalTimes: this.toNumber(card.totalTimes),
          remainingTimes: this.toNumber(card.remainingTimes),
          expiryDate: this.formatDate(new Date(card.expiryDate)),
          daysToExpire,
          usageRate,
          usageRateText: this.formatPercent(usageRate),
          riskScore,
          riskLevel: riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low',
          reason: `剩余 ${this.toNumber(card.remainingTimes)} 次，${daysToExpire ?? '-'} 天后到期，使用率 ${this.formatPercent(usageRate)}。`,
        };
      })
      .filter((item) => item.daysToExpire === null || item.daysToExpire <= 30 || item.remainingTimes <= 3)
      .sort((a, b) => b.riskScore - a.riskScore || (a.daysToExpire ?? 9999) - (b.daysToExpire ?? 9999))
      .slice(0, limit);

    const usageBucket = new Map<
      string,
      { cardName: string; projectName: string; usageTimes: number; recordCount: number; customerIds: Set<number>; beauticianIds: Set<number> }
    >();
    for (const record of usageRecords as any[]) {
      const key = `${record.cardName || '未知卡项'}__${record.projectName || '未知项目'}`;
      const target =
        usageBucket.get(key) ?? {
          cardName: record.cardName || '未知卡项',
          projectName: record.projectName || '未知项目',
          usageTimes: 0,
          recordCount: 0,
          customerIds: new Set<number>(),
          beauticianIds: new Set<number>(),
        };
      target.usageTimes += this.toNumber(record.times);
      target.recordCount += 1;
      if (record.customerId) target.customerIds.add(Number(record.customerId));
      if (record.beauticianId) target.beauticianIds.add(Number(record.beauticianId));
      usageBucket.set(key, target);
    }
    const usageItems = Array.from(usageBucket.values())
      .map((item) => ({
        cardName: item.cardName,
        projectName: item.projectName,
        usageTimes: item.usageTimes,
        recordCount: item.recordCount,
        customerCount: item.customerIds.size,
        beauticianCount: item.beauticianIds.size,
      }))
      .sort((a, b) => b.usageTimes - a.usageTimes || b.customerCount - a.customerCount)
      .slice(0, limit);

    const balanceItems = (balanceAccounts as any[])
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
          cashBalanceText: this.formatMoney(cashBalance),
          giftBalance,
          giftBalanceText: this.formatMoney(giftBalance),
          totalBalance: cashBalance + giftBalance,
          totalBalanceText: this.formatMoney(cashBalance + giftBalance),
          updatedAt: account.updatedAt,
        };
      })
      .filter((item) => item.totalBalance > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance)
      .slice(0, limit);

    const transactionSummary = (balanceTransactions as any[]).reduce(
      (summary, transaction) => {
        const amount = this.toNumber(transaction.amount);
        const giftAmount = this.toNumber(transaction.giftAmount);
        if (['recharge', 'open', 'gift'].includes(String(transaction.type))) {
          summary.rechargeAmount += amount;
          summary.rechargeGiftAmount += giftAmount;
          summary.rechargeCount += 1;
        } else if (['deduct', 'consume'].includes(String(transaction.type))) {
          summary.consumeAmount += amount;
          summary.consumeGiftAmount += giftAmount;
          summary.consumeCount += 1;
        } else if (String(transaction.type) === 'refund') {
          summary.refundAmount += amount;
          summary.refundGiftAmount += giftAmount;
          summary.refundCount += 1;
        } else if (String(transaction.type) === 'adjust') {
          summary.adjustAmount += amount;
          summary.adjustGiftAmount += giftAmount;
          summary.adjustCount += 1;
        }
        return summary;
      },
      {
        rechargeAmount: 0,
        rechargeGiftAmount: 0,
        rechargeCount: 0,
        consumeAmount: 0,
        consumeGiftAmount: 0,
        consumeCount: 0,
        refundAmount: 0,
        refundGiftAmount: 0,
        refundCount: 0,
        adjustAmount: 0,
        adjustGiftAmount: 0,
        adjustCount: 0,
      },
    );
    const totalBalance = balanceItems.reduce((total, item) => total + item.totalBalance, 0);
    const evidence: AgentEvidence = {
      source: ['CustomerCard', 'CardUsageRecord', 'CustomerBalanceAccount', 'CustomerBalanceTransaction', 'Customer'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        '卡项/会员卡经营诊断 = 次卡剩余次数和到期天数风险 + 查询周期内 CardUsageRecord 核销次数 + active 储值账户余额 + CustomerBalanceTransaction 充值/消费流水。',
      filters: [
        'storeId=当前门店',
        'Customer.deletedAt is null',
        'CustomerCard.status=active',
        'CustomerBalanceAccount.status=active',
        `usageRange=${this.formatDate(range.start)}~${this.formatDate(range.end)}`,
        `expiryWindow<=${this.formatDate(expiryEnd)}`,
        `limit=${limit}`,
      ],
      sampleSize:
        (customerCards as any[]).length +
        (usageRecords as any[]).length +
        (balanceAccounts as any[]).length +
        (balanceTransactions as any[]).length,
      limitations: ['P0 只做只读诊断，不自动核销、充值、退款或发送触达消息。', '次卡销售收入仍以订单收入诊断承接，本能力聚焦卡项资产和使用风险。'],
    };

    if (!expiryItems.length && !usageItems.length && !balanceItems.length && !(balanceTransactions as any[]).length) {
      return {
        status: 'no_data',
        title: '卡项/会员卡经营诊断',
        summary: '当前问题没有匹配到足够的卡项、核销或会员卡余额数据，无法生成诊断。',
        data: {
          expiryItems: [],
          usageItems: [],
          balanceItems: [],
          transactionSummary,
          requestedLimit: limit,
          consumedSlots: this.buildConsumedSlots(range, limit, {}),
        },
        evidence,
        actions: [],
      };
    }

    const summaryParts = [
      expiryItems[0] ? `最高到期风险为 ${expiryItems[0].customerName} 的 ${expiryItems[0].cardName}，${expiryItems[0].reason}` : '',
      usageItems[0] ? `${range.label}核销最多的是 ${usageItems[0].cardName} / ${usageItems[0].projectName}，共 ${usageItems[0].usageTimes} 次` : '',
      balanceItems[0] ? `余额最高的是 ${balanceItems[0].customerName}，余额 ${balanceItems[0].totalBalanceText}` : '',
      includeBalance
        ? `${range.label}充值 ${this.formatMoney(transactionSummary.rechargeAmount)}，余额消费 ${this.formatMoney(transactionSummary.consumeAmount)}`
        : '',
    ].filter(Boolean);

    return {
      status: 'success',
      title: '卡项/会员卡经营诊断',
      summary: summaryParts.join('；') + '。',
      data: {
        expiryItems,
        usageItems,
        balanceItems,
        transactionSummary: {
          ...transactionSummary,
          rechargeAmountText: this.formatMoney(transactionSummary.rechargeAmount),
          rechargeGiftAmountText: this.formatMoney(transactionSummary.rechargeGiftAmount),
          consumeAmountText: this.formatMoney(transactionSummary.consumeAmount),
          consumeGiftAmountText: this.formatMoney(transactionSummary.consumeGiftAmount),
          refundAmountText: this.formatMoney(transactionSummary.refundAmount),
          adjustAmountText: this.formatMoney(transactionSummary.adjustAmount),
          totalBalance,
          totalBalanceText: this.formatMoney(totalBalance),
        },
        requestedLimit: limit,
        currentRange: { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label },
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [
        { label: '查看次卡核销', action: 'orders:card-usage:open', riskLevel: 'low' },
        { label: '查看客户卡项', action: 'customers:cards:open', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseFinanceMargin(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const previousRange = this.previousSameLengthRange(range);
    const [orders, previousOrders, commissionRecords, dailySettlements] = await Promise.all([
      (this.prisma as any).productOrder.findMany({
        where: { storeId: context.storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: range.start, lt: range.end } },
        include: {
          orderItems: true,
          paymentRecords: { select: { amount: true, method: true, status: true, paidAt: true } },
          refundRecords: { select: { amount: true, status: true, refundedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      }),
      (this.prisma as any).productOrder.findMany({
        where: { storeId: context.storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: previousRange.start, lt: previousRange.end } },
        include: {
          orderItems: true,
          paymentRecords: { select: { amount: true, method: true, status: true, paidAt: true } },
          refundRecords: { select: { amount: true, status: true, refundedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      }),
      (this.prisma as any).commissionRecord.findMany({
        where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end }, status: { not: 'cancelled' } },
        select: { id: true, type: true, amount: true, sourceAmount: true, status: true, createdAt: true },
        take: 3000,
      }),
      (this.prisma as any).dailySettlement.findMany({
        where: { storeId: context.storeId, settleDate: { gte: range.start, lt: range.end } },
        select: {
          id: true,
          settleDate: true,
          totalRevenue: true,
          materialCost: true,
          grossProfit: true,
          grossMargin: true,
          commissionTotal: true,
          status: true,
        },
        orderBy: { settleDate: 'asc' },
        take: 370,
      }),
    ]);
    const allItems = (orders as any[]).flatMap((order) => order.orderItems ?? []);
    const previousItems = (previousOrders as any[]).flatMap((order) => order.orderItems ?? []);
    const [productCostMap, projectCostMap] = await Promise.all([
      this.resolveProductCostMap(allItems, previousItems),
      this.resolveProjectUnitCostMap(allItems, previousItems),
    ]);
    const current = this.calculateFinanceMarginSummary(orders as any[], productCostMap, projectCostMap, commissionRecords as any[]);
    const previous = this.calculateFinanceMarginSummary(previousOrders as any[], productCostMap, projectCostMap, []);
    const revenueDelta = current.netRevenue - previous.netRevenue;
    const revenueDeltaRate = previous.netRevenue > 0 ? revenueDelta / previous.netRevenue : current.netRevenue > 0 ? 1 : 0;
    const grossProfitDelta = current.grossProfit - previous.grossProfit;
    const grossProfitDeltaRate = previous.grossProfit > 0 ? grossProfitDelta / previous.grossProfit : current.grossProfit > 0 ? 1 : 0;
    const lowMarginItems = [...current.itemGroups]
      .filter((item) => item.revenue > 0 && item.marginRate < 0.45)
      .sort((a, b) => a.marginRate - b.marginRate || b.revenue - a.revenue)
      .slice(0, limit);
    const topCostItems = [...current.itemGroups].sort((a, b) => b.materialCost - a.materialCost).slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['ProductOrder', 'OrderItem', 'Product', 'ProjectBomItem', 'CommissionRecord', 'DailySettlement'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition:
        '财务毛利诊断 = 有效订单净收入 - 商品成本 - 项目 BOM 标准耗材成本 - 未取消提成；毛利率 = 毛利 / 净收入。DailySettlement 作为已生成日结佐证，不作为唯一来源。',
      filters: ['storeId=当前门店', '订单状态 in completed/paid', 'CommissionRecord.status != cancelled', `limit=${limit}`],
      sampleSize: (orders as any[]).length + allItems.length + (commissionRecords as any[]).length + (dailySettlements as any[]).length,
      limitations: ['P0 成本按商品成本价和项目 BOM 标准用量估算，未计入人工固定成本、房租、设备折旧和实际盘点差异。', '上一周期对比暂不扣除上一周期提成，仅用于趋势参考。'],
    };

    if (!current.orderCount && !current.netRevenue) {
      return {
        status: 'no_data',
        title: '财务毛利诊断',
        summary: `${range.label}没有有效订单，无法计算财务毛利。`,
        data: {
          current,
          previous,
          lowMarginItems: [],
          topCostItems: [],
          requestedLimit: limit,
          consumedSlots: this.buildConsumedSlots(range, limit, {}),
        },
        evidence,
        actions: [],
      };
    }

    const marginRisk = current.grossMarginRate < 0.35 ? 'high' : current.grossMarginRate < 0.55 ? 'medium' : 'low';
    const mainReason = lowMarginItems[0]
      ? `低毛利风险最高的是 ${lowMarginItems[0].itemName}，毛利率 ${lowMarginItems[0].marginRateText}`
      : topCostItems[0]
        ? `成本占用最高的是 ${topCostItems[0].itemName}，成本 ${topCostItems[0].materialCostText}`
        : '暂无明显单品/项目成本异常';
    return {
      status: 'success',
      title: '财务毛利诊断',
      summary: `${range.label}净收入 ${current.netRevenueText}，毛利 ${current.grossProfitText}，毛利率 ${current.grossMarginRateText}，较上一周期毛利${grossProfitDelta >= 0 ? '提升' : '下降'} ${this.formatMoney(Math.abs(grossProfitDelta))}（${this.formatPercent(grossProfitDeltaRate)}）。${mainReason}。`,
      data: {
        current: { ...current, marginRisk },
        previous,
        deltas: {
          revenueDelta,
          revenueDeltaText: this.formatMoney(revenueDelta),
          revenueDeltaRate,
          revenueDeltaRateText: this.formatPercent(revenueDeltaRate),
          grossProfitDelta,
          grossProfitDeltaText: this.formatMoney(grossProfitDelta),
          grossProfitDeltaRate,
          grossProfitDeltaRateText: this.formatPercent(grossProfitDeltaRate),
        },
        lowMarginItems,
        topCostItems,
        dailySettlementEvidence: (dailySettlements as any[]).map((item) => ({
          settlementId: item.id,
          settleDate: this.formatDate(new Date(item.settleDate)),
          totalRevenue: this.toNumber(item.totalRevenue),
          materialCost: this.toNumber(item.materialCost),
          commissionTotal: this.toNumber(item.commissionTotal),
          grossProfit: this.toNumber(item.grossProfit),
          grossMargin: this.toNumber(item.grossMargin),
          status: item.status,
        })),
        requestedLimit: limit,
        currentRange: { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label },
        previousRange: { start: this.formatDate(previousRange.start), end: this.formatDate(previousRange.end), label: previousRange.label },
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [
        { label: '查看订单明细', action: 'orders:open', riskLevel: 'low' },
        { label: '查看收银对账', action: 'finance:reconciliation:open', riskLevel: 'low' },
      ],
    };
  }

  private async diagnoseFinanceProfit(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const result = await this.diagnoseFinanceMargin(args, context);
    const data = typeof result.data === 'object' && result.data !== null ? (result.data as Record<string, any>) : {};
    const current = data.current ?? {};
    const previous = data.previous ?? {};
    const deltas = data.deltas ?? {};
    const question = String(args.question ?? '');
    const askedDecline = /下降|下滑|降低|变差|亏损|少了/.test(question);
    const grossProfitDelta = this.toNumber(deltas.grossProfitDelta);
    const revenueDelta = this.toNumber(deltas.revenueDelta);
    const materialCostDelta = this.toNumber(current.materialCost) - this.toNumber(previous.materialCost);
    const commissionDelta = this.toNumber(current.commissionTotal) - this.toNumber(previous.commissionTotal);
    const refundDelta = this.toNumber(current.refundAmount) - this.toNumber(previous.refundAmount);
    const lowMarginItems = Array.isArray(data.lowMarginItems) ? data.lowMarginItems as any[] : [];
    const topCostItems = Array.isArray(data.topCostItems) ? data.topCostItems as any[] : [];
    const trend =
      result.status === 'no_data'
        ? 'unknown'
        : grossProfitDelta < 0
          ? 'declined'
          : grossProfitDelta > 0
            ? 'increased'
            : 'flat';
    const trendSummary =
      trend === 'declined'
        ? `利润确有下降：毛利较上一周期减少 ${this.formatMoney(Math.abs(grossProfitDelta))}（${String(deltas.grossProfitDeltaRateText ?? '-') }）。`
        : trend === 'increased'
          ? `${askedDecline ? '当前数据不支持“利润下降”这个判断：' : ''}毛利较上一周期提升 ${this.formatMoney(Math.abs(grossProfitDelta))}（${String(deltas.grossProfitDeltaRateText ?? '-') }）。`
          : trend === 'flat'
            ? `${askedDecline ? '当前数据不支持“利润下降”这个判断：' : ''}毛利较上一周期基本持平。`
            : String(result.summary ?? '暂无利润诊断数据。');
    const drivers = [
      revenueDelta < 0
        ? {
            driver: '净收入减少',
            impact: `净收入较上一周期减少 ${this.formatMoney(Math.abs(revenueDelta))}`,
            evidence: `${String(current.netRevenueText ?? '-')} vs ${String(previous.netRevenueText ?? '-')}`,
            suggestedAction: '复盘订单数、客单价和高贡献项目变化，优先恢复成交来源。',
            riskLevel: 'high',
          }
        : null,
      materialCostDelta > 0
        ? {
            driver: '耗材/商品成本上升',
            impact: `成本较上一周期增加 ${this.formatMoney(materialCostDelta)}`,
            evidence: `${String(current.materialCostText ?? '-')} vs ${String(previous.materialCostText ?? '-')}`,
            suggestedAction: '检查高成本项目 BOM、商品成本价和异常消耗记录。',
            riskLevel: materialCostDelta > Math.max(1000, this.toNumber(current.netRevenue) * 0.05) ? 'high' : 'medium',
          }
        : null,
      commissionDelta > 0
        ? {
            driver: '提成成本上升',
            impact: `提成较上一周期增加 ${this.formatMoney(commissionDelta)}`,
            evidence: `${String(current.commissionTotalText ?? '-')} vs ${String(previous.commissionTotalText ?? '-')}`,
            suggestedAction: '复核提成规则、订单归属和高提成项目结构。',
            riskLevel: 'medium',
          }
        : null,
      refundDelta > 0
        ? {
            driver: '退款抵减增加',
            impact: `退款较上一周期增加 ${this.formatMoney(refundDelta)}`,
            evidence: `${String(current.refundAmountText ?? '-')} vs ${String(previous.refundAmountText ?? '-')}`,
            suggestedAction: '核对退款原因、服务投诉和活动承诺履约情况。',
            riskLevel: 'medium',
          }
        : null,
      lowMarginItems[0]
        ? {
            driver: '低毛利项目/商品拖累',
            impact: `${lowMarginItems[0].itemName} 毛利率 ${lowMarginItems[0].marginRateText}`,
            evidence: `收入 ${lowMarginItems[0].revenueText}，成本 ${lowMarginItems[0].materialCostText}`,
            suggestedAction: '控制折扣力度，复核定价、成本和耗材配置。',
            riskLevel: this.toNumber(lowMarginItems[0].marginRate) < 0.2 ? 'high' : 'medium',
          }
        : null,
      topCostItems[0] && !lowMarginItems[0]
        ? {
            driver: '成本占用集中',
            impact: `${topCostItems[0].itemName} 成本 ${topCostItems[0].materialCostText}`,
            evidence: `收入 ${topCostItems[0].revenueText}，毛利 ${topCostItems[0].grossProfitText}`,
            suggestedAction: '优先检查成本占用最高的项目/商品是否有异常消耗。',
            riskLevel: 'low',
          }
        : null,
    ].filter(Boolean);
    const diagnosisDrivers = drivers.length
      ? drivers
      : [
          {
            driver: trend === 'increased' ? '利润未下降' : '暂无明显异常驱动',
            impact: trendSummary,
            evidence: `净收入 ${String(current.netRevenueText ?? '-')}，毛利 ${String(current.grossProfitText ?? '-')}，毛利率 ${String(current.grossMarginRateText ?? '-')}`,
            suggestedAction: trend === 'increased' ? '继续关注低毛利项、退款折扣和提成成本，避免增长掩盖结构性风险。' : '继续跟踪收入、成本、退款和提成变化。',
            riskLevel: trend === 'increased' ? 'low' : 'medium',
          },
        ];
    const profitSummary =
      result.status === 'no_data'
        ? result.summary
        : `利润诊断：${trendSummary} 当前净收入 ${String(current.netRevenueText ?? '-')}，毛利 ${String(current.grossProfitText ?? '-')}，毛利率 ${String(current.grossMarginRateText ?? '-')}。主要线索：${diagnosisDrivers
            .slice(0, 3)
            .map((item: any) => `${item.driver}（${item.impact}）`)
            .join('；')}。`;
    return {
      ...result,
      title: result.status === 'no_data' ? '利润诊断' : '利润与毛利诊断',
      summary: profitSummary,
      data: {
        ...data,
        reportType: 'finance_profit_diagnosis',
        diagnosis: {
          trend,
          askedDecline,
          conclusion: trendSummary,
          drivers: diagnosisDrivers,
        },
        items: diagnosisDrivers,
        kpis: [
          { label: '净收入', value: String(current.netRevenueText ?? '-') },
          { label: '毛利', value: String(current.grossProfitText ?? '-') },
          { label: '毛利率', value: String(current.grossMarginRateText ?? '-') },
          { label: '提成成本', value: String(current.commissionTotalText ?? '-') },
          { label: '毛利变化', value: String(deltas.grossProfitDeltaText ?? '-'), delta: String(deltas.grossProfitDeltaRateText ?? '-'), deltaType: trend === 'declined' ? 'down' : trend === 'increased' ? 'up' : 'neutral' },
        ],
      },
      actions: [
        ...(result.actions ?? []),
        { label: '查看低毛利风险', action: 'agent:tool:finance.margin.risk.rank', riskLevel: 'low' },
      ],
    };
  }

  private async rankFinanceMarginRisk(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const result = await this.diagnoseFinanceMargin(args, context);
    const data = typeof result.data === 'object' && result.data !== null ? (result.data as Record<string, any>) : {};
    const lowMarginItems = Array.isArray(data.lowMarginItems) ? data.lowMarginItems : [];
    const topCostItems = Array.isArray(data.topCostItems) ? data.topCostItems : [];
    const limit = Math.min(Math.max(Number(args.limit) || Number(data.requestedLimit) || 10, 1), 50);
    const riskItems = lowMarginItems.slice(0, limit).map((item: any, index: number) => {
      const marginRate = Number(item.marginRate) || 0;
      const riskLevel: AgentRiskLevel = marginRate < 0.2 ? 'high' : marginRate < 0.35 ? 'medium' : 'low';
      const action =
        riskLevel === 'high'
          ? '暂停大额优惠，复核定价和耗材用量。'
          : '控制优惠力度，优先检查耗材成本或套餐分摊。';
      return {
        rank: index + 1,
        riskLevel,
        itemType: item.itemType,
        itemId: item.itemId,
        itemName: item.itemName,
        revenue: item.revenue,
        revenueText: item.revenueText,
        materialCost: item.materialCost,
        materialCostText: item.materialCostText,
        grossProfit: item.grossProfit,
        grossProfitText: item.grossProfitText,
        marginRate,
        marginRateText: item.marginRateText,
        orderCount: item.orderCount,
        recommendedAction: action,
      };
    });

    if (result.status === 'no_data') {
      return {
        ...result,
        title: '毛利风险排行',
        data: {
          ...data,
          reportType: 'finance_margin_risk_rank',
          items: [],
          riskItems: [],
          requestedLimit: limit,
        },
      };
    }

    const summary = riskItems.length
      ? `毛利风险排行：风险最高的是 ${riskItems[0].itemName}，毛利率 ${riskItems[0].marginRateText}。共发现 ${riskItems.length} 个低毛利项目/商品，建议先处理高风险项。`
      : `毛利风险排行：当前周期暂未发现毛利率低于 45% 的项目/商品。成本占用最高的是 ${topCostItems[0]?.itemName ?? '暂无明显项目'}。`;

    return {
      status: 'success',
      title: '毛利风险排行',
      summary,
      data: {
        ...data,
        reportType: 'finance_margin_risk_rank',
        items: riskItems,
        riskItems,
        requestedLimit: limit,
      },
      evidence: result.evidence,
      actions: [
        { label: '查看订单明细', action: 'orders:open', riskLevel: 'low' },
        { label: '查看收银对账', action: 'finance:reconciliation:open', riskLevel: 'low' },
      ],
    };
  }

  private async auditFinanceRefundDiscount(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const [refundResult, discountOrders] = await Promise.all([
      this.diagnoseRefunds({ ...args, timeRange: range.preset, limit }, context),
      (this.prisma as any).productOrder.findMany({
        where: {
          storeId: context.storeId,
          status: { notIn: ['cancelled', 'canceled', '已取消'] },
          createdAt: { gte: range.start, lt: range.end },
          OR: [
            { totalDiscountAmount: { gt: 0 } },
            { itemDiscountAmount: { gt: 0 } },
            { orderDiscountAmount: { gt: 0 } },
            { discountSource: { not: 'none' } },
          ],
        },
        select: {
          id: true,
          orderNo: true,
          customerName: true,
          totalAmount: true,
          listAmount: true,
          itemDiscountAmount: true,
          orderDiscountAmount: true,
          totalDiscountAmount: true,
          netAmount: true,
          discountSource: true,
          allocationMethod: true,
          promotionId: true,
          couponId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      }),
    ]);
    const refundData = typeof refundResult.data === 'object' && refundResult.data !== null ? (refundResult.data as Record<string, any>) : {};
    const refundItems = Array.isArray(refundData.items) ? refundData.items : [];
    const refundKpis = refundData.kpis ?? {};
    const discountItems = (discountOrders as any[])
      .map((order) => {
        const listAmount = this.toNumber(order.listAmount || order.netAmount || order.totalAmount);
        const netAmount = this.toNumber(order.netAmount || order.totalAmount);
        const explicitDiscount = this.toNumber(order.totalDiscountAmount || order.itemDiscountAmount || order.orderDiscountAmount);
        const inferredDiscount = Math.max(0, listAmount - netAmount);
        const discountAmount = explicitDiscount > 0 ? explicitDiscount : inferredDiscount;
        const discountRate = listAmount > 0 ? discountAmount / listAmount : 0;
        const source = String(order.discountSource || 'none');
        const riskLevel: AgentRiskLevel = discountRate >= 0.4 || /manual|custom|手工|manual_adjust/.test(source)
          ? 'high'
          : discountRate >= 0.25
            ? 'medium'
            : 'low';
        return {
          orderId: order.id,
          orderNo: order.orderNo,
          customerName: order.customerName,
          orderAmount: netAmount,
          orderAmountText: this.formatMoney(netAmount),
          listAmount,
          listAmountText: this.formatMoney(listAmount),
          discountAmount,
          discountAmountText: this.formatMoney(discountAmount),
          discountRate,
          discountRateText: this.formatPercent(discountRate),
          discountSource: source,
          allocationMethod: order.allocationMethod,
          promotionId: order.promotionId,
          couponId: order.couponId,
          riskLevel,
          reason: riskLevel === 'high' ? '折扣率较高或存在手工优惠，需要复核授权和毛利影响。' : '存在优惠折扣，建议核对活动来源和审批记录。',
        };
      })
      .filter((item) => item.discountAmount > 0 || item.discountSource !== 'none')
      .sort((a, b) => b.discountRate - a.discountRate || b.discountAmount - a.discountAmount)
      .slice(0, limit);
    const highRiskDiscountCount = discountItems.filter((item) => item.riskLevel === 'high').length;
    const highRefundItems = refundItems
      .filter((item: any) => Number(item.refundOrderRate) >= 0.3 || Number(item.amount) >= 1000)
      .slice(0, limit);
    const items = [
      ...discountItems.map((item) => ({ auditType: 'discount', ...item })),
      ...highRefundItems.map((item: any) => ({
        auditType: 'refund',
        riskLevel: Number(item.refundOrderRate) >= 0.5 || Number(item.amount) >= 2000 ? 'high' : 'medium',
        refundNo: item.refundNo,
        orderNo: item.orderNo,
        customerName: item.customerName,
        amount: item.amount,
        amountText: item.amountText,
        refundOrderRate: item.refundOrderRate,
        refundOrderRateText: item.refundOrderRateText,
        reason: item.reason || '退款比例偏高，建议复核退款原因和服务记录。',
      })),
    ].slice(0, limit);
    const evidence: AgentEvidence = {
      source: ['ProductOrder', 'RefundRecord'],
      dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      metricDefinition: '退款折扣审计 = 查询周期内订单折扣金额/折扣率、折扣来源、退款金额和退款占订单比例；只读识别风险，不发起退款、不调整订单。',
      filters: ['storeId=当前门店', 'ProductOrder.createdAt=查询周期', 'RefundRecord.refundedAt=查询周期', `limit=${limit}`],
      sampleSize: (discountOrders as any[]).length + refundItems.length,
      limitations: ['折扣授权链路按订单折扣来源推断，正式追责需结合收银日志、审批记录和门店制度。'],
    };
    const refundAmountText = String(refundKpis.refundAmountText ?? this.formatMoney(0));
    const discountAmount = discountItems.reduce((sum, item) => sum + item.discountAmount, 0);
    return {
      status: items.length ? 'success' : 'no_data',
      title: '退款折扣审计',
      summary: items.length
        ? `${range.label}发现 ${items.length} 条退款/折扣风控线索，折扣合计 ${this.formatMoney(discountAmount)}，退款 ${refundAmountText}；高风险折扣 ${highRiskDiscountCount} 条。`
        : `${range.label}暂未发现高折扣或高退款风险线索。`,
      data: {
        reportType: 'finance_refund_discount_audit',
        kpis: [
          { label: '风险线索', value: String(items.length) },
          { label: '折扣合计', value: this.formatMoney(discountAmount) },
          { label: '退款金额', value: refundAmountText },
          { label: '高风险折扣', value: String(highRiskDiscountCount) },
        ],
        items,
        discountItems,
        refundItems: highRefundItems,
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence,
      actions: [
        { label: '查看订单明细', action: 'orders:open', riskLevel: 'low' },
        { label: '查看退款订单', action: 'orders:refunds:open', riskLevel: 'low' },
      ],
    };
  }

  private async auditFinanceBeauticianPerformance(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const result = await this.rankStaffPerformance({ ...args, limit, timeRange: args.timeRange ?? 'last_30_days' }, context);
    const data = typeof result.data === 'object' && result.data !== null ? (result.data as Record<string, any>) : {};
    const staffItems = Array.isArray(data.items) ? data.items : [];
    const riskItems = staffItems
      .map((item: any) => {
        const salesAmount = Number(item.salesAmount) || 0;
        const commissionAmount = Number(item.commissionAmount) || 0;
        const commissionRate = salesAmount > 0 ? commissionAmount / salesAmount : 0;
        const serviceRecordCompletionRate = Number(item.serviceRecordCompletionRate) || 0;
        const completionRate = Number(item.completionRate) || 0;
        const reasons: string[] = [];
        if (commissionRate > 0.35) reasons.push(`提成占销售额 ${this.formatPercent(commissionRate)}，偏高`);
        if (serviceRecordCompletionRate < 0.7) reasons.push(`服务记录完整率 ${this.formatPercent(serviceRecordCompletionRate)}，偏低`);
        if (completionRate < 0.7 && Number(item.reservationCount) > 0) reasons.push(`预约完成率 ${this.formatPercent(completionRate)}，偏低`);
        if (Number(item.performanceScore) < 50 && commissionAmount > 0) reasons.push('表现分偏低但存在提成发放，需要复核规则适用');
        const riskLevel: AgentRiskLevel = commissionRate > 0.45 || serviceRecordCompletionRate < 0.5 ? 'high' : reasons.length ? 'medium' : 'low';
        return {
          ...item,
          commissionRate,
          commissionRateText: this.formatPercent(commissionRate),
          riskLevel,
          auditReasons: reasons,
          recommendedAction: reasons.length ? '复核提成规则、服务记录和预约完成记录，必要时调整下期绩效沟通。' : '暂无明显财务审计异常。',
        };
      })
      .filter((item: any) => item.riskLevel !== 'low')
      .slice(0, limit);
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    return {
      status: result.status === 'no_data' ? 'no_data' : 'success',
      title: '美容师绩效审计',
      summary: result.status === 'no_data'
        ? result.summary
        : riskItems.length
          ? `${range.label}发现 ${riskItems.length} 位美容师存在提成、服务记录或预约完成率审计风险，最高风险为 ${riskItems[0].beauticianName}。`
          : `${range.label}暂未发现明显美容师绩效财务审计风险。`,
      data: {
        ...data,
        reportType: 'finance_beautician_performance_audit',
        items: riskItems,
        riskItems,
        staffItems,
        kpis: [
          { label: '审计员工', value: String(staffItems.length) },
          { label: '风险员工', value: String(riskItems.length) },
          { label: '提成合计', value: String(data.kpis?.commissionAmountText ?? '-') },
          { label: '销售合计', value: String(data.kpis?.salesAmountText ?? '-') },
        ],
        requestedLimit: limit,
        consumedSlots: this.buildConsumedSlots(range, limit, {}),
      },
      evidence: result.evidence,
      actions: [
        { label: '查看员工管理', action: 'beauticians:open', riskLevel: 'low' },
        { label: '查看员工提成', action: 'finance:staff-commission:open', riskLevel: 'low' },
      ],
    };
  }

  private async draftFinanceReport(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const [revenue, profit, refundAudit, staffAudit] = await Promise.all([
      this.summarizeFinanceRevenue({ ...args, timeRange: range.preset }, context),
      this.diagnoseFinanceProfit({ ...args, timeRange: range.preset, limit: 5 }, context),
      this.auditFinanceRefundDiscount({ ...args, timeRange: range.preset, limit: 5 }, context),
      this.auditFinanceBeauticianPerformance({ ...args, timeRange: range.preset, limit: 5 }, context),
    ]);
    const reportTitle = `${range.label}财务经营报告草稿`;
    const riskCount = [
      ...(((refundAudit.data as any)?.items ?? []) as any[]),
      ...(((staffAudit.data as any)?.items ?? []) as any[]),
    ].filter((item: any) => item.riskLevel === 'high' || item.riskLevel === 'medium').length;
    const content = [
      `# ${reportTitle}`,
      '',
      `数据范围：${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
      '',
      '## 1. 收入概览',
      revenue.summary,
      '',
      '## 2. 利润与毛利',
      profit.summary,
      '',
      '## 3. 退款与折扣风险',
      refundAudit.summary,
      '',
      '## 4. 美容师绩效风险',
      staffAudit.summary,
      '',
      '## 5. 建议动作',
      riskCount > 0
        ? `优先复核 ${riskCount} 条中高风险线索，按订单折扣、退款原因、提成规则和服务记录完整性逐项确认。`
        : '当前未发现明显中高风险线索，建议继续关注收入趋势、毛利率和员工服务记录完整性。',
      '',
      '说明：本报告为 Agent 草稿，不自动生成正式财务报表，不替代财务复核和门店审批。',
    ].join('\n');
    const sources = Array.from(new Set([
      ...(revenue.evidence?.source ?? []),
      ...(profit.evidence?.source ?? []),
      ...(refundAudit.evidence?.source ?? []),
      ...(staffAudit.evidence?.source ?? []),
    ]));
    return {
      status: 'success',
      title: '财务报告草稿',
      summary: `${reportTitle}已生成，包含收入、利润毛利、退款折扣和美容师绩效风险四部分；发现 ${riskCount} 条需复核线索。`,
      data: {
        reportType: 'finance_report_draft',
        document: {
          title: reportTitle,
          content,
          downloadable: true,
        },
        sections: [
          { title: '收入概览', summary: revenue.summary },
          { title: '利润与毛利', summary: profit.summary },
          { title: '退款与折扣风险', summary: refundAudit.summary },
          { title: '美容师绩效风险', summary: staffAudit.summary },
        ],
        kpis: [
          { label: '报告章节', value: '4' },
          { label: '风险线索', value: String(riskCount) },
          { label: '报告状态', value: '草稿' },
        ],
        consumedSlots: this.buildConsumedSlots(range, 0, {}),
      },
      evidence: {
        source: sources,
        dateRange: `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`,
        metricDefinition: '财务报告草稿 = 收入汇总 + 利润毛利诊断 + 退款折扣审计 + 美容师绩效审计的只读汇总。',
        filters: ['storeId=当前门店', `timeRange=${range.label}`],
        limitations: ['报告为 Agent 草稿，不自动入账、不生成正式结算单、不替代人工财务复核。'],
      },
      actions: [
        { label: '查看收银对账', action: 'finance:reconciliation:open', riskLevel: 'low' },
        { label: '查看退款订单', action: 'orders:refunds:open', riskLevel: 'low' },
      ],
    };
  }

  private async resolveFollowUpCandidates(storeId: number, args: Record<string, unknown>, limit: number) {
    const latestRun = await (this.prisma as any).predictionRun
      .findFirst({
        where: { storeId, status: { in: ['completed', 'success', 'finished'] } },
        orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
      })
      .catch(() => null);
    const target = String(args.target || args.triggerType || '').toLowerCase();
    const whereByTarget =
      /复购|repurchase/.test(target)
        ? { repurchase30dScore: { gte: 60 }, churnScore: { lt: 75 } }
        : /响应|活动|营销|marketing/.test(target)
          ? { marketingResponseScore: { gte: 70 } }
          : { OR: [{ churnScore: { gte: 65 } }, { repurchase30dScore: { gte: 60 } }, { marketingResponseScore: { gte: 70 } }] };

    if (latestRun?.id) {
      const snapshots = await (this.prisma as any).customerPredictionSnapshot.findMany({
        where: {
          storeId,
          runId: latestRun.id,
          ...whereByTarget,
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              memberLevel: true,
              visitCount: true,
              totalSpent: true,
              lastVisitDate: true,
              tags: true,
            },
          },
        },
        orderBy: [{ churnScore: 'desc' }, { marketingResponseScore: 'desc' }, { repurchase30dScore: 'desc' }],
        take: limit,
      });
      const items = (snapshots as any[])
        .filter((snapshot) => snapshot.customer)
        .map((snapshot) => this.mapFollowUpCandidate(snapshot.customer, snapshot));
      if (items.length) return items;
    }

    const customers = await (this.prisma as any).customer.findMany({
      where: { storeId, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        memberLevel: true,
        visitCount: true,
        totalSpent: true,
        lastVisitDate: true,
        tags: true,
      },
      orderBy: [{ lastVisitDate: 'asc' }, { totalSpent: 'desc' }],
      take: limit,
    });
    return (customers as any[]).map((customer) => this.mapFollowUpCandidate(customer, null));
  }

  private async resolvePriorityCustomers(storeId: number, limit: number, options: PriorityCustomerOptions = {}) {
    const range = options.range ?? this.resolveDateRange('today');
    const customerSegment = options.customerSegment;
    const scopedCustomerIds = this.toNumberList(options.customerIds);
    const focusedByCustomerId = new Map(
      (options.focusedCustomers ?? []).map((item) => [item.customerId, item] as const),
    );
    const latestRun = await (this.prisma as any).predictionRun
      .findFirst({
        where: { storeId, status: { in: ['completed', 'success', 'finished'] } },
        orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
      })
      .catch(() => null);

    const take = Math.max(limit * 5, 100);
    if (scopedCustomerIds.length) {
      const [snapshots, customers] = await Promise.all([
        latestRun?.id
          ? (this.prisma as any).customerPredictionSnapshot.findMany({
              where: { storeId, runId: latestRun.id, customerId: { in: scopedCustomerIds } },
              orderBy: [{ churnScore: 'desc' }, { marketingResponseScore: 'desc' }, { repurchase30dScore: 'desc' }],
              take: Math.max(scopedCustomerIds.length, limit),
            })
          : Promise.resolve([]),
        (this.prisma as any).customer.findMany({
          where: { storeId, deletedAt: null, id: { in: scopedCustomerIds } },
          select: {
            id: true,
            name: true,
            phone: true,
            memberLevel: true,
            visitCount: true,
            totalSpent: true,
            lastVisitDate: true,
            createdAt: true,
            tags: true,
          },
          take: Math.max(scopedCustomerIds.length, limit),
        }),
      ]);
      const snapshotByCustomerId = new Map(
        (snapshots as any[]).map((snapshot) => [Number(snapshot.customerId), snapshot] as const),
      );
      const customerSignals = await this.loadPrioritySignals(storeId, scopedCustomerIds, range, Math.max(scopedCustomerIds.length, limit));
      const customerItems: any[] = (customers as any[])
        .map((customer) => {
          const customerId = Number(customer.id);
          const mapped = this.mapPriorityCustomer(
            customer,
            snapshotByCustomerId.get(customerId) ?? null,
            customerSignals.get(customerId),
            customerSegment,
          );
          return mapped ? this.enrichFocusedPriorityCustomer(mapped, focusedByCustomerId.get(customerId)) : null;
        })
        .filter(Boolean);
      const items = customerItems
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, limit);
      return { items, totalAvailable: customerItems.length };
    }

    const snapshots = latestRun?.id
      ? await (this.prisma as any).customerPredictionSnapshot.findMany({
          where: { storeId, runId: latestRun.id },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                memberLevel: true,
                visitCount: true,
                totalSpent: true,
                lastVisitDate: true,
                createdAt: true,
                tags: true,
              },
            },
          },
          orderBy: [{ churnScore: 'desc' }, { marketingResponseScore: 'desc' }, { repurchase30dScore: 'desc' }],
          take,
        })
      : [];

    const snapshotCustomerIds = (snapshots as any[]).map((snapshot) => Number(snapshot.customerId ?? snapshot.customer?.id)).filter(Boolean);
    const snapshotSignals = await this.loadPrioritySignals(storeId, snapshotCustomerIds, range, take);
    const snapshotItems: any[] = (snapshots as any[])
      .filter((snapshot) => snapshot.customer)
      .map((snapshot) =>
        this.mapPriorityCustomer(
          snapshot.customer,
          snapshot,
          snapshotSignals.get(Number(snapshot.customerId ?? snapshot.customer?.id)),
          customerSegment,
        ),
      )
      .filter(Boolean);

    if (snapshotItems.length) {
      const items = snapshotItems.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);
      return { items, totalAvailable: snapshotItems.length };
    }

    const customers = await (this.prisma as any).customer.findMany({
      where: { storeId, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        memberLevel: true,
        visitCount: true,
        totalSpent: true,
        lastVisitDate: true,
        createdAt: true,
        tags: true,
      },
      orderBy: [{ lastVisitDate: 'asc' }, { totalSpent: 'desc' }],
      take,
    });
    const customerIds = (customers as any[]).map((customer) => Number(customer.id)).filter(Boolean);
    const customerSignals = await this.loadPrioritySignals(storeId, customerIds, range, take);
    const customerItems: any[] = (customers as any[])
      .map((customer) => this.mapPriorityCustomer(customer, null, customerSignals.get(Number(customer.id)), customerSegment))
      .filter(Boolean);
    const items = customerItems
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit);
    return { items, totalAvailable: customerItems.length };
  }

  private async loadPrioritySignals(storeId: number, customerIds: number[], range: AgentDateRange, take: number) {
    const ids = Array.from(new Set(customerIds.map((id) => Number(id)).filter(Boolean)));
    if (!ids.length) return new Map<number, PriorityCustomerSignal>();
    const queryTake = Math.max(take, 500);
    const terminalFollowUpTask = (this.prisma as any).terminalFollowUpTask;
    const [reservations, followUpTasks] = await Promise.all([
      Promise.resolve(
        (this.prisma as any).reservation.findMany({
          where: {
            storeId,
            customerId: { in: ids },
            date: { gte: range.start, lt: range.end },
            status: { notIn: ['cancelled', 'canceled', '已取消'] },
          },
          select: { id: true, customerId: true, status: true, date: true },
          take: queryTake,
        }),
      )
        .then((value) => (Array.isArray(value) ? value : []))
        .catch(() => []),
      typeof terminalFollowUpTask?.findMany === 'function'
        ? Promise.resolve(
            terminalFollowUpTask.findMany({
              where: {
                storeId,
                customerId: { in: ids },
                deletedAt: null,
                status: { in: ['pending', 'in_progress', '待跟进', '跟进中'] },
                dueAt: { gte: range.start, lt: range.end },
              },
              select: { id: true, customerId: true, priority: true, status: true, dueAt: true },
              take: queryTake,
            }),
          )
            .then((value) => (Array.isArray(value) ? value : []))
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    return this.buildPrioritySignals(reservations as any[], followUpTasks as any[], range);
  }

  private buildPrioritySignals(reservations: any[], followUpTasks: any[], range: AgentDateRange) {
    const signals = new Map<number, PriorityCustomerSignal>();
    const ensure = (customerId: number) => {
      const current =
        signals.get(customerId) ??
        ({
          reservationCount: 0,
          pendingFollowUpCount: 0,
          urgentFollowUpCount: 0,
          scoreBonus: 0,
          reasons: [],
        } satisfies PriorityCustomerSignal);
      signals.set(customerId, current);
      return current;
    };

    for (const reservation of reservations ?? []) {
      const customerId = Number(reservation.customerId);
      if (!customerId) continue;
      const target = ensure(customerId);
      target.reservationCount += 1;
      target.scoreBonus += /confirmed|pending|待确认|已确认|booked/.test(String(reservation.status || '')) ? 10 : 6;
    }

    for (const task of followUpTasks ?? []) {
      const customerId = Number(task.customerId);
      if (!customerId) continue;
      const target = ensure(customerId);
      target.pendingFollowUpCount += 1;
      const urgent = /urgent|high|高|紧急|重点/.test(String(task.priority || ''));
      if (urgent) target.urgentFollowUpCount += 1;
      target.scoreBonus += urgent ? 18 : 12;
    }

    for (const target of signals.values()) {
      target.scoreBonus = Math.min(35, target.scoreBonus);
      if (target.reservationCount) target.reasons.push(`${range.label}有 ${target.reservationCount} 个预约`);
      if (target.pendingFollowUpCount) {
        target.reasons.push(
          target.urgentFollowUpCount
            ? `${range.label}有 ${target.pendingFollowUpCount} 个待跟进任务，其中 ${target.urgentFollowUpCount} 个高优先级`
            : `${range.label}有 ${target.pendingFollowUpCount} 个待跟进任务`,
        );
      }
    }

    return signals;
  }

  private async loadRevenueOrders(storeId: number, start: Date, end: Date) {
    return (this.prisma as any).productOrder.findMany({
      where: {
        storeId,
        status: { notIn: ['cancelled', 'refunded', '已取消', '已退款'] },
        createdAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        orderNo: true,
        totalAmount: true,
        payMethod: true,
        status: true,
        createdAt: true,
        orderItems: { select: { itemType: true, itemId: true, name: true, quantity: true, subtotal: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
  }

  private summarizeRevenueOrders(orders: any[]) {
    const revenue = orders.reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0);
    const itemBreakdown = new Map<string, { key: string; name: string; itemType: string; amount: number; quantity: number; orderCount: number }>();
    const payMethodBreakdown = new Map<string, { key: string; name: string; itemType: string; amount: number; quantity: number; orderCount: number }>();
    for (const order of orders) {
      const payMethod = String(order.payMethod || '未知');
      const payment = payMethodBreakdown.get(payMethod) ?? {
        key: payMethod,
        name: payMethod,
        itemType: 'payMethod',
        amount: 0,
        quantity: 0,
        orderCount: 0,
      };
      payment.amount += this.toNumber(order.totalAmount);
      payment.orderCount += 1;
      payMethodBreakdown.set(payMethod, payment);

      for (const item of order.orderItems ?? []) {
        const key = `${item.itemType}:${item.itemId ?? item.name}`;
        const target = itemBreakdown.get(key) ?? {
          key,
          name: item.name,
          itemType: item.itemType,
          amount: 0,
          quantity: 0,
          orderCount: 0,
        };
        target.amount += this.toNumber(item.subtotal);
        target.quantity += this.toNumber(item.quantity);
        target.orderCount += 1;
        itemBreakdown.set(key, target);
      }
    }
    return {
      revenue,
      revenueText: this.formatMoney(revenue),
      orderCount: orders.length,
      averageOrderValue: orders.length ? revenue / orders.length : 0,
      averageOrderValueText: this.formatMoney(orders.length ? revenue / orders.length : 0),
      itemBreakdown: Array.from(itemBreakdown.values()).sort((a, b) => b.amount - a.amount).slice(0, 10),
      payMethodBreakdown: Array.from(payMethodBreakdown.values()).sort((a, b) => b.amount - a.amount),
    };
  }

  private buildRevenueDrivers(
    currentItems: Array<{ key: string; name: string; itemType: string; amount: number; quantity: number; orderCount: number }>,
    previousItems: Array<{ key: string; name: string; itemType: string; amount: number; quantity: number; orderCount: number }>,
  ) {
    const currentMap = new Map(currentItems.map((item) => [item.key, item]));
    const previousMap = new Map(previousItems.map((item) => [item.key, item]));
    const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
    return Array.from(keys)
      .map((key) => {
        const item = currentMap.get(key);
        const previous = previousMap.get(key);
        const currentAmount = item?.amount ?? 0;
        const previousAmount = previous?.amount ?? 0;
        const delta = currentAmount - previousAmount;
        const deltaRate = previousAmount > 0 ? delta / previousAmount : currentAmount > 0 ? 1 : 0;
        return {
          key,
          name: item?.name ?? previous?.name ?? key,
          itemType: item?.itemType ?? previous?.itemType ?? 'unknown',
          amount: currentAmount,
          quantity: item?.quantity ?? 0,
          orderCount: item?.orderCount ?? 0,
          currentAmount,
          previousAmount,
          delta,
          deltaText: this.formatMoney(delta),
          deltaRate,
          deltaRateText: this.formatPercent(deltaRate),
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
  }

  private explainRevenueChange(input: {
    current: ReturnType<AgentToolRegistryService['summarizeRevenueOrders']>;
    previous: ReturnType<AgentToolRegistryService['summarizeRevenueOrders']>;
    amountDelta: number;
    amountDeltaRate: number;
    orderDelta: number;
    averageOrderDelta: number;
    itemDrivers: Array<{ name: string; itemType: string; delta: number; deltaText: string; currentAmount: number; previousAmount: number }>;
  }) {
    const trend = input.amountDelta < 0 ? '下降' : input.amountDelta > 0 ? '增长' : '持平';
    const mainDriver = input.itemDrivers[0];
    const reasons = [
      input.orderDelta < 0 ? `订单数减少 ${Math.abs(input.orderDelta)} 笔` : input.orderDelta > 0 ? `订单数增加 ${input.orderDelta} 笔` : '',
      input.averageOrderDelta < 0
        ? `客单价下降 ${this.formatMoney(Math.abs(input.averageOrderDelta))}`
        : input.averageOrderDelta > 0
          ? `客单价提升 ${this.formatMoney(input.averageOrderDelta)}`
          : '',
      mainDriver ? `${mainDriver.name} 贡献变化 ${mainDriver.deltaText}` : '',
    ].filter(Boolean);
    const suggestion =
      input.amountDelta < 0
        ? '建议优先检查预约到店、主力项目/商品成交和顾问跟进节奏，并针对下降项做补救活动。'
        : input.amountDelta > 0
          ? '建议复盘增长来源，将高贡献项目/商品沉淀为活动素材和顾问话术。'
          : '建议继续观察订单结构，重点关注高客单项目和复购客户。';
    return {
      trend,
      summary: `当前周期收入 ${input.current.revenueText}，较上一周期${trend} ${this.formatMoney(Math.abs(input.amountDelta))}（${this.formatPercent(input.amountDeltaRate)}）。主要因素：${reasons.join('；') || '暂无明显单项驱动'}。${suggestion}`,
      reasons,
      suggestion,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private toNumberList(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item) && item > 0),
      ),
    );
  }

  private normalizeFocusedPriorityCustomers(value: unknown): FocusedPriorityCustomer[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.asRecord(item))
      .map((item) => ({
        customerId: Number(item.customerId),
        customerName: item.customerName ?? item.name,
        paidAmount: item.paidAmount,
        paidAmountText: item.paidAmountText,
        memberLevel: item.memberLevel,
        phoneMasked: item.phoneMasked,
        itemsSummary: item.itemsSummary,
        suggestion: item.suggestion,
      }))
      .filter((item) => Number.isFinite(item.customerId) && item.customerId > 0);
  }

  private buildConsumedSlots(range: AgentDateRange, limit: number, filters: Record<string, unknown>) {
    return {
      timeRange: {
        preset: range.preset,
        label: range.label,
        start: this.formatDate(range.start),
        end: this.formatDate(range.end),
      },
      limit,
      filters: this.asRecord(filters),
    };
  }

  private resolveDateRange(value?: unknown): AgentDateRange {
    const preset = String(value || 'today');
    const now = new Date();
    const start = this.startOfDay(now);
    if (preset === 'yesterday') {
      const yesterday = new Date(start.getTime() - DAY_MS);
      return { start: yesterday, end: start, label: '昨天', preset };
    }
    if (preset === 'last_7_days') {
      return { start: new Date(start.getTime() - 6 * DAY_MS), end: new Date(start.getTime() + DAY_MS), label: '近7天', preset };
    }
    if (preset === 'last_30_days') {
      return { start: new Date(start.getTime() - 29 * DAY_MS), end: new Date(start.getTime() + DAY_MS), label: '近30天', preset };
    }
    if (preset === 'next_30_days') {
      return { start, end: new Date(start.getTime() + 30 * DAY_MS), label: '未来30天', preset };
    }
    if (preset === 'this_month') return { start: new Date(start.getFullYear(), start.getMonth(), 1), end: new Date(start.getTime() + DAY_MS), label: '本月', preset };
    if (preset === 'this_week') {
      const day = (start.getDay() + 6) % 7;
      return { start: new Date(start.getTime() - day * DAY_MS), end: new Date(start.getTime() + DAY_MS), label: '本周', preset };
    }
    if (preset === 'next_week') {
      const day = (start.getDay() + 6) % 7;
      const nextWeekStart = new Date(start.getTime() + (7 - day) * DAY_MS);
      return { start: nextWeekStart, end: new Date(nextWeekStart.getTime() + 7 * DAY_MS), label: '下周', preset };
    }
    return { start, end: new Date(start.getTime() + DAY_MS), label: '今日', preset: 'today' };
  }

  private previousSameLengthRange(range: { start: Date; end: Date; label: string }) {
    const duration = range.end.getTime() - range.start.getTime();
    return {
      start: new Date(range.start.getTime() - duration),
      end: range.start,
      label: `上一${range.label}`,
    };
  }

  private buildSchedulePeakSlots(reservations: any[], schedules: any[]) {
    const slots = new Map<
      string,
      { date: string; startTime: string; endTime: string; reservationCount: number; scheduledStaff: Set<number>; busyStaff: Set<number> }
    >();
    for (const reservation of reservations) {
      const date = this.formatDate(new Date(reservation.date));
      const startTime = reservation.startTime || this.formatTime(new Date(reservation.date));
      const endTime = reservation.endTime || this.addMinutes(startTime, this.toNumber(reservation.project?.duration) || 60);
      const key = `${date}_${startTime}_${endTime}`;
      const target = slots.get(key) ?? { date, startTime, endTime, reservationCount: 0, scheduledStaff: new Set<number>(), busyStaff: new Set<number>() };
      target.reservationCount += 1;
      slots.set(key, target);
    }
    for (const schedule of schedules) {
      const date = this.formatDate(new Date(schedule.date));
      for (const target of slots.values()) {
        if (target.date !== date) continue;
        if (!this.overlaps(schedule.startTime, schedule.endTime, target.startTime, target.endTime)) continue;
        const beauticianId = Number(schedule.beauticianId);
        if (!beauticianId) continue;
        target.scheduledStaff.add(beauticianId);
        if (/busy|leave|请假|忙碌|占用/.test(String(schedule.status || ''))) target.busyStaff.add(beauticianId);
      }
    }
    return Array.from(slots.values())
      .map((item) => ({
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        reservationCount: item.reservationCount,
        scheduledStaffCount: item.scheduledStaff.size,
        busyStaffCount: item.busyStaff.size,
        gap: Math.max(0, item.reservationCount - item.scheduledStaff.size),
      }))
      .sort((a, b) => b.gap - a.gap || b.reservationCount - a.reservationCount);
  }

  private timeCovers(slotStart: string, slotEnd: string, targetStart: string, targetEnd: string) {
    return this.timeToMinutes(slotStart) <= this.timeToMinutes(targetStart) && this.timeToMinutes(slotEnd) >= this.timeToMinutes(targetEnd);
  }

  private overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
    return this.timeToMinutes(leftStart) < this.timeToMinutes(rightEnd) && this.timeToMinutes(leftEnd) > this.timeToMinutes(rightStart);
  }

  private addMinutes(value: string, minutes: number) {
    const next = this.timeToMinutes(value) + minutes;
    const hours = Math.floor(next / 60)
      .toString()
      .padStart(2, '0');
    const mins = Math.round(next % 60)
      .toString()
      .padStart(2, '0');
    return `${hours}:${mins}`;
  }

  private timeToMinutes(value?: string | null) {
    const [hours, minutes] = String(value || '00:00')
      .split(':')
      .map((item) => Number(item) || 0);
    return hours * 60 + minutes;
  }

  private calculateProjectMaterialCost(project: any) {
    return (project?.bomItems ?? []).reduce((total: number, item: any) => {
      return total + this.toNumber(item.standardQty) * this.toNumber(item.product?.costPrice);
    }, 0);
  }

  private async resolveProductCostMap(...itemGroups: any[][]) {
    const productIds = [
      ...new Set(
        itemGroups
          .flat()
          .filter((item) => String(item.itemType) === 'product')
          .map((item) => Number(item.itemId))
          .filter(Boolean),
      ),
    ];
    if (!productIds.length) return new Map<number, { name?: string; unit?: string; costPrice: number }>();
    const products = await (this.prisma as any).product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, unit: true, specUnit: true, costPrice: true },
      take: 3000,
    });
    return new Map((products as any[]).map((product) => [Number(product.id), { name: product.name, unit: product.specUnit ?? product.unit, costPrice: this.toNumber(product.costPrice) }]));
  }

  private async resolveProjectUnitCostMap(...itemGroups: any[][]) {
    const projectIds = [
      ...new Set(
        itemGroups
          .flat()
          .filter((item) => String(item.itemType) === 'project')
          .map((item) => Number(item.itemId))
          .filter(Boolean),
      ),
    ];
    if (!projectIds.length) return new Map<number, { name?: string; unitCost: number }>();
    const projects = await (this.prisma as any).project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        name: true,
        bomItems: { select: { standardQty: true, product: { select: { costPrice: true } } } },
      },
      take: 3000,
    });
    return new Map(
      (projects as any[]).map((project) => [
        Number(project.id),
        { name: project.name, unitCost: this.calculateProjectMaterialCost(project) },
      ]),
    );
  }

  private calculateFinanceMarginSummary(
    orders: any[],
    productCostMap: Map<number, { name?: string; unit?: string; costPrice: number }>,
    projectCostMap: Map<number, { name?: string; unitCost: number }>,
    commissionRecords: any[],
  ) {
    const itemGroups = new Map<
      string,
      { itemType: string; itemId: number | null; itemName: string; quantity: number; revenue: number; materialCost: number; orderCount: number }
    >();
    let totalRevenue = 0;
    let refundAmount = 0;
    const customers = new Set<number>();
    for (const order of orders) {
      const paymentAmount = (order.paymentRecords ?? []).reduce((sum: number, payment: any) => sum + this.toNumber(payment.amount), 0);
      const orderRevenue = paymentAmount > 0 ? paymentAmount : this.toNumber(order.totalAmount);
      totalRevenue += orderRevenue;
      refundAmount += (order.refundRecords ?? []).reduce((sum: number, refund: any) => sum + this.toNumber(refund.amount), 0);
      if (order.customerId) customers.add(Number(order.customerId));
      for (const item of order.orderItems ?? []) {
        const itemType = String(item.itemType || 'other');
        const itemId = item.itemId === null || item.itemId === undefined ? null : Number(item.itemId);
        const quantity = this.toNumber(item.quantity) || 1;
        const revenue = this.toNumber(item.subtotal);
        const unitCost =
          itemType === 'product' && itemId
            ? productCostMap.get(itemId)?.costPrice ?? 0
            : itemType === 'project' && itemId
              ? projectCostMap.get(itemId)?.unitCost ?? 0
              : 0;
        const materialCost = unitCost * quantity;
        const key = `${itemType}_${itemId ?? item.name}`;
        const target =
          itemGroups.get(key) ??
          {
            itemType,
            itemId,
            itemName: item.name,
            quantity: 0,
            revenue: 0,
            materialCost: 0,
            orderCount: 0,
          };
        target.quantity += quantity;
        target.revenue += revenue;
        target.materialCost += materialCost;
        target.orderCount += 1;
        itemGroups.set(key, target);
      }
    }
    const netRevenue = Math.max(0, totalRevenue - refundAmount);
    const materialCost = Array.from(itemGroups.values()).reduce((sum, item) => sum + item.materialCost, 0);
    const commissionTotal = (commissionRecords ?? []).reduce((sum, record) => sum + this.toNumber(record.amount), 0);
    const grossProfit = Math.round((netRevenue - materialCost - commissionTotal) * 100) / 100;
    const grossMarginRate = netRevenue > 0 ? grossProfit / netRevenue : 0;
    const itemGroupItems = Array.from(itemGroups.values()).map((item) => {
      const grossProfit = item.revenue - item.materialCost;
      const marginRate = item.revenue > 0 ? grossProfit / item.revenue : 0;
      return {
        ...item,
        quantity: Math.round(item.quantity * 100) / 100,
        revenue: Math.round(item.revenue * 100) / 100,
        revenueText: this.formatMoney(item.revenue),
        materialCost: Math.round(item.materialCost * 100) / 100,
        materialCostText: this.formatMoney(item.materialCost),
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossProfitText: this.formatMoney(grossProfit),
        marginRate,
        marginRateText: this.formatPercent(marginRate),
      };
    });
    return {
      orderCount: orders.length,
      customerCount: customers.size,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalRevenueText: this.formatMoney(totalRevenue),
      refundAmount: Math.round(refundAmount * 100) / 100,
      refundAmountText: this.formatMoney(refundAmount),
      netRevenue: Math.round(netRevenue * 100) / 100,
      netRevenueText: this.formatMoney(netRevenue),
      materialCost: Math.round(materialCost * 100) / 100,
      materialCostText: this.formatMoney(materialCost),
      commissionTotal: Math.round(commissionTotal * 100) / 100,
      commissionTotalText: this.formatMoney(commissionTotal),
      grossProfit,
      grossProfitText: this.formatMoney(grossProfit),
      grossMarginRate,
      grossMarginRateText: this.formatPercent(grossMarginRate),
      averageOrderValue: orders.length ? Math.round((netRevenue / orders.length) * 100) / 100 : 0,
      averageOrderValueText: this.formatMoney(orders.length ? netRevenue / orders.length : 0),
      itemGroups: itemGroupItems,
    };
  }

  private mapPriorityCustomer(
    customer: any,
    snapshot: any | null,
    signal?: PriorityCustomerSignal,
    customerSegment?: string,
  ) {
    const churnScore = this.toNumber(snapshot?.churnScore);
    const repurchaseScore = this.toNumber(snapshot?.repurchase30dScore);
    const marketingResponseScore = this.toNumber(snapshot?.marketingResponseScore);
    const totalSpent = this.toNumber(customer.totalSpent);
    const visitCount = this.toNumber(customer.visitCount);
    const lastVisitDays = this.daysSince(customer.lastVisitDate);
    if (!this.matchesCustomerSegment({ customer, churnScore, lastVisitDays, totalSpent, visitCount }, customerSegment)) return null;

    const ltvScore = Math.min(20, Math.round(totalSpent / 1000) + Math.min(8, visitCount));
    const visitGapScore = lastVisitDays === null ? 8 : lastVisitDays >= 90 ? 18 : lastVisitDays >= 60 ? 14 : lastVisitDays >= 30 ? 8 : 2;
    const priorityScore = Math.min(
      100,
      Math.round(churnScore * 0.34 + repurchaseScore * 0.22 + marketingResponseScore * 0.18 + ltvScore + visitGapScore + (signal?.scoreBonus ?? 0)),
    );
    const reasons = [
      ...(signal?.reasons ?? []),
      churnScore >= 70 ? `流失风险 ${churnScore} 分` : '',
      repurchaseScore >= 60 ? `复购机会 ${repurchaseScore} 分` : '',
      marketingResponseScore >= 70 ? `营销响应 ${marketingResponseScore} 分` : '',
      lastVisitDays !== null && lastVisitDays >= 30 ? `${lastVisitDays} 天未到店` : '',
      totalSpent > 0 ? `累计消费 ¥${totalSpent.toLocaleString('zh-CN')}` : '',
    ].filter(Boolean);
    return {
      customerId: customer.id,
      customerName: customer.name,
      priority: priorityScore >= 75 ? 'urgent' : priorityScore >= 55 ? 'recommended' : 'opportunity',
      reason: reasons.join('；') || '客户具备基础跟进价值，建议维持服务节奏。',
      suggestedAction:
        signal?.urgentFollowUpCount
          ? '优先处理已到期高优先级跟进任务，联系客户确认到店或复购安排。'
          : signal?.reservationCount
            ? '结合预约时间提前确认到店，并准备个性化护理或复购建议。'
            : churnScore >= 70
          ? '顾问电话邀约肤况复测，搭配专属回店权益。'
          : repurchaseScore >= 60
            ? '按护理周期提醒到店，推荐上次相关项目。'
            : '发送轻量关怀并确认近期护理需求。',
      phone: this.maskPhone(customer.phone),
      memberLevel: customer.memberLevel,
      priorityScore,
      tags: customer.tags ?? [],
      visitCount,
      totalSpent,
      lastVisitDate: customer.lastVisitDate,
      lastVisitDays,
      churnScore,
      churnLevel: snapshot?.churnLevel,
      repurchase30dScore: repurchaseScore,
      marketingResponseScore,
      reservationCount: signal?.reservationCount ?? 0,
      pendingFollowUpCount: signal?.pendingFollowUpCount ?? 0,
      urgentFollowUpCount: signal?.urgentFollowUpCount ?? 0,
    };
  }

  private enrichFocusedPriorityCustomer(item: any, focused?: FocusedPriorityCustomer) {
    if (!focused) return item;
    const paidAmount = this.toNumber(focused.paidAmount);
    const paidAmountText =
      typeof focused.paidAmountText === 'string' && focused.paidAmountText.trim()
        ? focused.paidAmountText
        : paidAmount > 0
          ? this.formatMoney(paidAmount)
          : '';
    const itemsSummary =
      typeof focused.itemsSummary === 'string' && focused.itemsSummary.trim()
        ? focused.itemsSummary.trim()
        : '';
    const suggestion =
      typeof focused.suggestion === 'string' && focused.suggestion.trim()
        ? focused.suggestion.trim()
        : '';
    const consumptionBonus = paidAmount >= 3000 ? 12 : paidAmount >= 1500 ? 8 : paidAmount > 0 ? 4 : 0;
    const priorityScore = Math.min(100, this.toNumber(item.priorityScore) + consumptionBonus);
    const scopedReasons = [
      paidAmountText ? `上一轮消费 ${paidAmountText}` : '',
      itemsSummary ? `消费内容：${itemsSummary}` : '',
      item.reason,
    ].filter(Boolean);

    return {
      ...item,
      customerName: item.customerName ?? focused.customerName,
      phone: item.phone ?? focused.phoneMasked,
      memberLevel: item.memberLevel ?? focused.memberLevel,
      paidAmount,
      paidAmountText,
      itemsSummary,
      reason: scopedReasons.join('；'),
      suggestedAction: suggestion || item.suggestedAction,
      priorityScore,
      priority: priorityScore >= 75 ? 'urgent' : priorityScore >= 55 ? 'recommended' : 'opportunity',
      contextScope: 'previous_order_customer_consumption_list',
    };
  }

  private matchesCustomerSegment(
    input: { customer: any; churnScore: number; lastVisitDays: number | null; totalSpent: number; visitCount: number },
    customerSegment?: string,
  ) {
    if (!customerSegment) return true;
    const tags = Array.isArray(input.customer.tags) ? input.customer.tags.map((tag: unknown) => String(tag).toLowerCase()) : [];
    const createdDays = this.daysSince(input.customer.createdAt);
    if (customerSegment === 'existing') return input.visitCount > 0 || (createdDays !== null && createdDays > 30);
    if (customerSegment === 'new') return input.visitCount <= 1 || (createdDays !== null && createdDays <= 30);
    if (customerSegment === 'dormant') return input.lastVisitDays === null || input.lastVisitDays >= 60;
    if (customerSegment === 'churn_risk') return input.churnScore >= 70 || input.lastVisitDays === null || input.lastVisitDays >= 60;
    if (customerSegment === 'high_value') return input.totalSpent >= 10_000 || tags.some((tag: string) => /vip|高价值|钻石|金卡/.test(tag));
    return true;
  }

  private mapFollowUpCandidate(customer: any, snapshot: any | null) {
    const lastVisitDays = this.daysSince(customer.lastVisitDate);
    const churnScore = this.toNumber(snapshot?.churnScore);
    const repurchaseScore = this.toNumber(snapshot?.repurchase30dScore);
    const marketingResponseScore = this.toNumber(snapshot?.marketingResponseScore);
    const reason =
      churnScore >= 75
        ? `流失风险 ${snapshot?.churnLevel ?? '高'}，已 ${lastVisitDays ?? '-'} 天未到店`
        : repurchaseScore >= 60
          ? `复购分 ${repurchaseScore}，客户进入复购窗口`
          : marketingResponseScore >= 70
            ? `营销响应 ${marketingResponseScore} 分，适合轻量邀约`
            : lastVisitDays !== null && lastVisitDays >= 45
              ? `已 ${lastVisitDays} 天未到店，需要顾问关怀`
              : '客户具备基础跟进价值';
    return {
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      memberLevel: customer.memberLevel,
      visitCount: this.toNumber(customer.visitCount),
      totalSpent: this.toNumber(customer.totalSpent),
      tags: customer.tags ?? [],
      lastVisitDate: customer.lastVisitDate,
      lastVisitDays,
      churnScore,
      churnLevel: snapshot?.churnLevel,
      repurchase30dScore: repurchaseScore,
      marketingResponseScore,
      priority: churnScore >= 80 || marketingResponseScore >= 80 ? 'urgent' : 'recommended',
      reason,
    };
  }

  private async resolveBeauticianId(context: AgentToolExecutionContext, args: Record<string, unknown>) {
    const explicitId = Number(args.beauticianId);
    if (context.role !== 'beautician' && Number.isFinite(explicitId) && explicitId > 0) return explicitId;
    if (!context.userId) return undefined;
    const beautician = await (this.prisma as any).beautician.findFirst({
      where: { storeId: context.storeId, userId: context.userId },
      select: { id: true },
    });
    return beautician?.id ? Number(beautician.id) : undefined;
  }

  private mapServiceRecordDraftItem(task: any) {
    const bomItems = Array.isArray(task.project?.bomItems) ? task.project.bomItems : [];
    const consumptionItems = bomItems.map((item: any) => ({
      productId: item.productId,
      productName: item.product?.name ?? `耗材 ${item.productId}`,
      sku: item.product?.sku,
      standardQty: this.toNumber(item.standardQty),
      actualQty: this.toNumber(item.standardQty),
      unit: item.unit ?? item.product?.specUnit ?? item.product?.unit,
    }));
    const customerName = task.customer?.name ?? `客户${task.customerId}`;
    const projectName = task.project?.name ?? `项目${task.projectId}`;
    return {
      taskId: task.id,
      taskNo: task.taskNo,
      customerId: task.customerId,
      customerName,
      memberLevel: task.customer?.memberLevel,
      projectId: task.projectId,
      projectName,
      beauticianId: task.beauticianId,
      beauticianName: task.beautician?.name,
      appointmentTime: task.appointmentTime,
      status: task.status,
      suggestedResult: `${projectName}已完成，客户肤感稳定，服务过程无明显不适。`,
      suggestedCustomerFeedback: '服务后肤感舒适，建议持续观察 24 小时内泛红、干痒或刺痛情况。',
      suggestedNextSuggestion: this.buildNextCareSuggestion(projectName, task.customer?.tags),
      suggestedRemark: `由 Ami 经营 Agent 基于今日服务任务生成草稿，需美容师结合现场情况确认后提交。`,
      consumptionItems,
      riskWarnings: [
        '草稿不能替代美容师现场判断。',
        consumptionItems.length ? '耗材用量来自项目 BOM，提交前需确认实际用量。' : '当前项目未配置 BOM，需手工补充耗材。',
      ],
    };
  }

  private buildNextCareSuggestion(projectName: string, tags?: unknown) {
    const tagText = Array.isArray(tags) ? tags.join('、') : String(tags ?? '');
    if (/敏感|修护|屏障/.test(projectName + tagText)) {
      return '建议 7 天内避免刷酸和高温桑拿，14-21 天后根据屏障恢复情况安排舒缓修护。';
    }
    if (/补水|保湿/.test(projectName + tagText)) {
      return '建议 14-21 天后复查水油状态，可搭配补水护理或居家保湿提醒。';
    }
    if (/清洁|小气泡|毛孔/.test(projectName + tagText)) {
      return '建议 21-28 天后复查毛孔和出油情况，期间减少强清洁叠加。';
    }
    return '建议按 21-28 天护理周期邀约下次到店，并结合本次反馈调整项目强度。';
  }

  private buildFollowUpScript(candidate: Record<string, unknown>, args: Record<string, unknown>) {
    if (args.script) return String(args.script);
    const name = String(candidate.customerName ?? '客户');
    const reason = String(candidate.reason ?? '近期适合做护理跟进');
    return `您好${name}，我是 Ami 门店顾问。看到您近期护理节奏需要跟进：${reason}。这两天店里可以为您安排一次肤况复测和专属护理建议，您看哪天方便到店？`;
  }

  private buildFollowUpNote(candidates: Record<string, unknown>[], args: Record<string, unknown>) {
    const question = args.question ? `用户问题：${String(args.question)}\n` : '';
    const lines = candidates.slice(0, 8).map((item, index) => {
      return `${index + 1}. ${String(item.customerName ?? item.customerId)}：${String(item.reason ?? '待跟进')}`;
    });
    return `${question}由 Ami 经营 Agent 审批后创建，建议先由顾问人工确认需求，不自动发送触达消息。\n${lines.join('\n')}`;
  }

  private extractOpportunityItems(args: Record<string, unknown>) {
    const candidates = [
      args.items,
      (args.context as any)?.items,
      (args.context as any)?.previousRun?.toolResults?.[0]?.data?.items,
      (args.context as any)?.previousResult?.toolResults?.[0]?.data?.items,
      (args.context as any)?.previousBusinessQuery?.previousResponse?.card?.items,
    ];
    const items = candidates.find((value) => Array.isArray(value));
    return Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') as Record<string, unknown>[] : [];
  }

  private buildMarketingDraftDescription(opportunityItems: Record<string, unknown>[], args: Record<string, unknown>) {
    if (!opportunityItems.length) {
      return `由 Ami 经营 Agent 根据用户问题「${String(args.question ?? '生成活动草稿')}」创建的活动草稿。`;
    }
    const lines = opportunityItems.map((item, index) => {
      const name = String(item.productName ?? item.name ?? `推荐项${index + 1}`);
      const score = item.fitScore ? `，匹配分 ${item.fitScore}` : '';
      const reason = item.reason ? `，依据：${item.reason}` : '';
      return `${index + 1}. ${name}${score}${reason}`;
    });
    return `由 Ami 经营 Agent 审批后创建，推荐依据：\n${lines.join('\n')}`;
  }

  private suggestCampaign(opportunityType: string) {
    if (opportunityType === '临期消化') return '限时到店搭赠';
    if (opportunityType === '库存压力') return '会员专属满赠';
    if (opportunityType === '增长搭售') return '热销项目搭售';
    return '会员权益活动';
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
    const source = this.asTerminalMessageArray(value);
    return source
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
        const parsed = JSON.parse(value);
        return this.asTerminalMessageArray(parsed);
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

  private daysUntil(value?: Date | string | null) {
    if (!value) return 999;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) return 999;
    return Math.ceil((time - Date.now()) / DAY_MS);
  }

  private daysSince(value?: Date | string | null) {
    if (!value) return null;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) return null;
    return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
  }

  private startOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private resolveWeekStart(value?: unknown) {
    const explicit = String(value || '').trim().toLowerCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
    const date = this.startOfDay(new Date());
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    if (explicit === 'next_week') date.setDate(date.getDate() + 7);
    return this.formatDate(date);
  }

  private formatDate(value: Date) {
    return formatBusinessDate(value);
  }

  private formatTime(value: Date) {
    return value.toTimeString().slice(0, 5);
  }

  private formatQuantity(value: number, unit?: string) {
    return `${Number.isInteger(value) ? value : Number(value.toFixed(2))}${unit || ''}`;
  }

  private formatMoney(value: number) {
    const prefix = value < 0 ? '-' : '';
    return `${prefix}¥${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
  }

  private formatPercent(value: number) {
    return `${Math.round(value * 100)}%`;
  }

  // ─── 店长经营 Agent 工具实现方法 ──────────────────────────────────────────

  private async getManagerDailyBriefing(
    _args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + 86_400_000);

    const [resv, rev, lowStock] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { storeId: ctx.storeId, date: { gte: today, lt: tomorrow } },
        include: {
          customer: { select: { name: true, memberLevel: true } },
          project: { select: { name: true } },
        },
        orderBy: { startTime: 'asc' },
        take: 50,
      }),
      this.prisma.productOrder.aggregate({
        where: { storeId: ctx.storeId, status: { in: ['completed', 'paid'] }, createdAt: { gte: today, lt: tomorrow } },
        _sum: { netAmount: true },
        _count: { id: true },
      }),
      this.prisma.product.count({ where: { storeId: ctx.storeId, status: 'active', currentStock: { lte: 5 } } }),
    ]);

    const pending = resv.filter(r => r.status === 'pending');
    const revenue = this.toNumber(rev._sum.netAmount);
    const vip = resv.filter(r => r.customer && ['VIP', '钻石', '金卡'].some(l => (r.customer!.memberLevel ?? '').includes(l)));
    const risks: string[] = [];
    if (pending.length > 3) risks.push('待确认预约' + pending.length + '单');
    if (lowStock > 0) risks.push(lowStock + '种商品库存不足');

    const items = resv.slice(0, 15).map(r => [
      r.customer?.name ?? '-',
      r.startTime,
      r.project?.name ?? '-',
      r.status === 'pending' ? '待确认' : '进行中',
    ]);

    return {
      status: 'success',
      title: '今日经营简报',
      summary:
        '今日' + resv.length + '个预约，待确认' + pending.length + '单，高价值客户' + vip.length + '位；' +
        '今日收入' + this.formatMoney(revenue) +
        (risks.length ? '；注意：' + risks[0] : ''),
      data: {
        kpis: [
          { label: '今日预约', value: String(resv.length), unit: '单', hint: '待确认' + pending.length + '单' },
          { label: '今日收入', value: this.formatMoney(revenue) },
          { label: '库存预警', value: String(lowStock), unit: '品' },
          { label: '高价值到店', value: String(vip.length), unit: '位' },
        ],
        items,
        columns: ['客户', '时间', '项目', '状态'],
        pendingCount: pending.length,
        risks,
        consumedSlots: { timeRange: { preset: 'today', label: '今日' } },
      },
      evidence: {
        source: ['Reservation', 'ProductOrder', 'Product'],
        dateRange: '今日 ' + this.formatDate(today),
        metricDefinition: '今日预约数、实收收入、库存预警数',
        filters: ['门店:' + ctx.storeId],
        sampleSize: resv.length,
      },
      actions: [
        ...(pending.length > 0
          ? [{ label: '确认' + pending.length + '个待确认预约', action: 'reception.reservation.today', riskLevel: 'low' as const }]
          : []),
        { label: '查看客户跟进优先级', action: 'customer.priority.rank', riskLevel: 'low' as const },
      ],
    };
  }

  // ─── 前台接待 Agent 工具实现方法 ──────────────────────────────────────────

  private async lookupCustomerForReception(
    args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const q = String(args.query || args.name || args.phone || '').trim();
    if (!q) {
      return {
        status: 'unsupported',
        title: '客户查询',
        summary: '请提供客户姓名或手机号后四位进行查询。',
        evidence: { source: [], metricDefinition: '', filters: [] },
      };
    }
    const isPhone = /^d{4,11}$/.test(q);
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId: ctx.storeId,
        deletedAt: null,
        OR: isPhone ? [{ phone: { endsWith: q } }] : [{ name: { contains: q } }, { phone: { contains: q } }],
      },
      orderBy: { lastVisitDate: 'desc' },
      take: 5,
      include: { customerCards: { where: { status: 'active', remainingTimes: { gt: 0 } }, take: 3 } },
    });

    if (!customers.length) {
      return {
        status: 'no_data',
        title: '客户查询',
        summary: '未找到"' + q + '"的客户记录。',
        evidence: { source: ['Customer'], metricDefinition: '客户基本信息', filters: ['查询词:' + q], sampleSize: 0 },
        actions: [{ label: '新建客户档案', action: 'operation.register', riskLevel: 'low' as const }],
      };
    }

    const items = customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: ctx.role === 'manager' ? (c.phone ?? '-') : this.maskPhone(c.phone),
      memberLevel: c.memberLevel,
      lastVisitDate: c.lastVisitDate ? this.formatDate(c.lastVisitDate) : '未到店',
      daysSince: c.lastVisitDate ? this.daysSince(c.lastVisitDate) : null,
      cardSummary:
        c.customerCards.length > 0
          ? c.customerCards.map(k => k.cardName + '剩' + k.remainingTimes + '次').join('、')
          : '无有效次卡',
    }));

    const first = items[0]!;
    return {
      status: 'success',
      title: '客户查询：' + q,
      summary:
        customers.length === 1
          ? '找到客户 ' + first.name + '（' + first.memberLevel + '），上次到店 ' + first.lastVisitDate
          : '找到 ' + customers.length + ' 位客户，请确认是哪位。',
      data: { items, totalFound: customers.length },
      evidence: {
        source: ['Customer', 'CustomerCard'],
        metricDefinition: '客户基本信息、有效次卡',
        filters: ['查询词:' + q],
        sampleSize: customers.length,
        limitations: ctx.role !== 'manager' ? ['手机号已脱敏'] : undefined,
      },
      actions: [
        { label: '查看卡项权益', action: 'reception.card.benefit.summary', riskLevel: 'low' as const },
        { label: '创建跟进记录', action: 'customer.followup.task.draft', riskLevel: 'medium' as const },
      ],
    };
  }

  private async getTodayReservationsForReception(
    _args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const resv = await this.prisma.reservation.findMany({
      where: { storeId: ctx.storeId, date: { gte: today, lt: tomorrow } },
      include: {
        customer: { select: { name: true, memberLevel: true } },
        beautician: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { startTime: 'asc' },
      take: 100,
    });

    const sl = (s: string) =>
      ({ pending: '待确认', confirmed: '已确认', checked_in: '已到店', in_service: '服务中', completed: '已完成', cancelled: '已取消' }[s] ?? s);

    const pending = resv.filter(r => r.status === 'pending');
    const items = resv.map(r => [r.customer?.name ?? '-', r.startTime, r.project?.name ?? '-', r.beautician?.name ?? '-', sl(r.status)]);

    return {
      status: resv.length > 0 ? 'success' : 'no_data',
      title: '今日预约',
      summary: '今日' + resv.length + '个预约' + (pending.length > 0 ? '，待确认' + pending.length + '单' : ''),
      data: { items, columns: ['客户', '时间', '项目', '美容师', '状态'], pendingCount: pending.length, total: resv.length },
      evidence: {
        source: ['Reservation'],
        dateRange: '今日 ' + this.formatDate(today),
        metricDefinition: '今日预约列表',
        filters: ['门店:' + ctx.storeId],
        sampleSize: resv.length,
      },
      actions:
        pending.length > 0
          ? [{ label: '确认' + pending.length + '个待确认预约', action: 'operation.verify', riskLevel: 'low' as const }]
          : [],
    };
  }

  private async getCustomerCardBenefitSummary(
    args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const cid = args.customerId ? Number(args.customerId) : null;
    const cname = String(args.customerName || args.name || '').trim();

    let customer = null;
    if (cid) {
      customer = await this.prisma.customer.findFirst({ where: { id: cid, storeId: ctx.storeId, deletedAt: null } });
    } else if (cname) {
      customer = await this.prisma.customer.findFirst({ where: { name: { contains: cname }, storeId: ctx.storeId, deletedAt: null }, orderBy: { lastVisitDate: 'desc' } });
    }

    if (!customer) {
      return {
        status: 'no_data',
        title: '卡项权益查询',
        summary: '请先通过姓名找到具体客户。',
        evidence: { source: [], metricDefinition: '', filters: [] },
        actions: [{ label: '查找客户', action: 'reception.customer.lookup', riskLevel: 'low' as const }],
      };
    }

    const cards = await this.prisma.customerCard.findMany({
      where: { customerId: customer.id, status: 'active' },
      orderBy: { expiryDate: 'asc' },
      take: 20,
    });

    const soonExp = cards.filter(c => this.daysUntil(c.expiryDate) <= 30);
    const rows = cards.map(c => [
      c.cardName,
      c.remainingTimes + '次',
      this.formatDate(c.expiryDate) + (this.daysUntil(c.expiryDate) <= 30 ? '（' + this.daysUntil(c.expiryDate) + '天后到期）' : ''),
    ]);

    return {
      status: 'success',
      title: customer.name + '的卡项权益',
      summary:
        customer.name + '共' + cards.length + '张有效次卡' +
        (soonExp.length > 0 ? '，' + soonExp.length + '张即将到期' : ''),
      data: { customerId: customer.id, customerName: customer.name, memberLevel: customer.memberLevel, cards: rows, columns: ['卡项名称', '剩余次数', '有效期'], cardCount: cards.length, soonExpiringCount: soonExp.length },
      evidence: { source: ['CustomerCard'], metricDefinition: '次卡剩余次数、有效期', filters: ['客户:' + customer.name], sampleSize: cards.length },
      actions: [
        ...(soonExp.length > 0 ? [{ label: '发续卡提醒', action: 'customer.followup.task.draft', riskLevel: 'medium' as const }] : []),
        { label: '前往核销', action: 'operation.verify', riskLevel: 'low' as const },
      ],
    };
  }

  // ─── 营销增长 Agent 工具实现方法 ──────────────────────────────────────────

  private async discoverCustomerSegments(
    _args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const now = new Date();
    const d45 = new Date(now.getTime() - 45 * 86_400_000);
    const d90 = new Date(now.getTime() - 90 * 86_400_000);
    const d60 = new Date(now.getTime() - 60 * 86_400_000);

    const [dormant45, dormant90, highValue, newCustomer] = await Promise.all([
      this.prisma.customer.count({ where: { storeId: ctx.storeId, deletedAt: null, lastVisitDate: { lt: d45, gte: d90 } } }),
      this.prisma.customer.count({ where: { storeId: ctx.storeId, deletedAt: null, lastVisitDate: { lt: d90 } } }),
      this.prisma.customer.count({ where: { storeId: ctx.storeId, deletedAt: null, totalSpent: { gt: 3000 }, lastVisitDate: { gte: d45 } } }),
      this.prisma.customer.count({ where: { storeId: ctx.storeId, deletedAt: null, visitCount: { lte: 2 }, createdAt: { gte: d60 } } }),
    ]);

    const segments = [
      { name: '沉睡客户（45-90天未到店）', count: dormant45, priority: '高', action: '发召回优惠券' },
      { name: '深度沉睡（90天以上）', count: dormant90, priority: '中', action: '发专属回访话术' },
      { name: '高价值活跃客户', count: highValue, priority: '中', action: '推升单/疗程续购' },
      { name: '新客未深度转化', count: newCustomer, priority: '高', action: '推首次办卡优惠' },
    ].filter(s => s.count > 0);

    const total = segments.reduce((sum, s) => sum + s.count, 0);

    return {
      status: segments.length > 0 ? 'success' : 'no_data',
      title: '可运营客群发现',
      summary: '共发现' + total + '位可运营客户，分' + segments.length + '个客群',
      data: {
        segments,
        items: segments.map(s => [s.name, s.count + '人', s.priority, s.action]),
        columns: ['客群', '人数', '优先级', '建议动作'],
      },
      evidence: { source: ['Customer'], metricDefinition: '按到店间隔和消费金额分群', filters: ['门店:' + ctx.storeId], sampleSize: total },
      actions: [
        { label: '生成活动草稿', action: 'marketing.activity.draft', riskLevel: 'medium' as const },
        { label: '匹配权益', action: 'promotion.offer.match', riskLevel: 'low' as const },
      ],
    };
  }

  private async matchPromotionOffer(
    _args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const promotions = await this.prisma.promotion.findMany({
      where: { OR: [{ storeId: ctx.storeId }, { storeId: null }], status: 'active', approvalStatus: 'approved' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (!promotions.length) {
      return {
        status: 'no_data',
        title: '权益匹配',
        summary: '当前门店暂无可用权益，建议先创建促销活动。',
        evidence: { source: ['Promotion'], metricDefinition: '', filters: [] },
      };
    }

    const items = promotions.map(p => [
      p.name,
      p.discountText,
      p.type,
      p.estimatedCost ? this.formatMoney(this.toNumber(p.estimatedCost)) : '未设置',
    ]);

    return {
      status: 'success',
      title: '可用权益列表',
      summary: '共' + promotions.length + '个可用权益，建议优先选择高转化/低成本权益',
      data: { items, columns: ['权益名称', '优惠说明', '类型', '预估成本'], total: promotions.length },
      evidence: { source: ['Promotion'], metricDefinition: '门店可用权益', filters: ['门店:' + ctx.storeId], sampleSize: promotions.length },
      actions: [
        { label: '生成活动草稿', action: 'marketing.activity.draft', riskLevel: 'medium' as const },
        { label: '生成触达话术', action: 'marketing.copy.generate', riskLevel: 'low' as const },
      ],
    };
  }

  private async generateMarketingCopy(
    args: Record<string, unknown>,
    _ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const target = String(args.target || args.segment || '沉睡客户').trim();
    const offer = String(args.offer || args.promotion || '专属优惠').trim();

    const copies = [
      '【温馨提示】亲爱的，好久不见！特为您准备' + offer + '，期待您的到来～',
      '【专属回访】' + target + '专属：' + offer + '限时开放，名额有限，欢迎预约！',
      '亲，距您上次到店已有一段时间，我们为您特别保留了' + offer + '，期待您回来体验～',
    ];

    return {
      status: 'success',
      title: '营销话术生成',
      summary: '已生成3条针对' + target + '的触达话术',
      data: { copies, target, offer, items: copies.map((c, i) => ['变体' + (i + 1), c]) },
      evidence: { source: [], metricDefinition: '基于目标客群和权益生成', filters: ['目标客群:' + target, '权益:' + offer] },
      actions: [{ label: '生成活动草稿', action: 'marketing.activity.draft', riskLevel: 'medium' as const }],
    };
  }

  private async diagnoseMarketingEffect(
    args: Record<string, unknown>,
    ctx: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'last_30_days');
    const touches = await this.prisma.marketingAutomationTouch
      .findMany({
        where: { touchedAt: { gte: range.start, lte: range.end } },
        take: 500,
      })
      .catch(() => []);

    if (!touches.length) {
      return {
        status: 'no_data',
        title: '活动效果复盘',
        summary: range.label + '内未找到触达记录',
        evidence: { source: ['MarketingAutomationTouch'], metricDefinition: '', filters: [], dateRange: range.label },
      };
    }

    const total = touches.length;
    const responded = touches.filter((t: any) =>
      t.convertedAt || /opened|open|respond|reply|clicked|click|预约|到店|核销|converted|成交|转化/i.test(String(t.status || '')),
    ).length;
    const booked = touches.filter((t: any) =>
      /appointment|book|reserved|reservation|预约|到店/i.test(String(t.status || '')) ||
      /appointment|book|reserved|reservation|预约|到店/i.test(String(t.conversionType || '')),
    ).length;
    const converted = touches.filter((t: any) => t.convertedAt).length;
    const revenue = (touches as any[]).reduce((sum: number, t: any) => sum + this.toNumber(t.actualRevenue), 0 as number) as number;
    const rate = total > 0 ? converted / total : 0;
    const funnel = [
      { name: '触达', value: total, valueText: String(total) + '人', rateText: '100%' },
      { name: '响应', value: responded, valueText: String(responded) + '人', rateText: this.formatPercent(total > 0 ? responded / total : 0) },
      { name: '预约', value: booked, valueText: String(booked) + '人', rateText: this.formatPercent(total > 0 ? booked / total : 0) },
      { name: '核销/转化', value: converted, valueText: String(converted) + '人', rateText: this.formatPercent(rate) },
      { name: '收入贡献', value: converted, valueText: this.formatMoney(revenue), rateText: this.formatPercent(rate) },
    ];

    return {
      status: 'success',
      title: '活动效果复盘',
      summary: range.label + '触达' + total + '人，转化' + converted + '人（' + this.formatPercent(rate) + '），带来收入' + this.formatMoney(revenue),
      data: {
        items: [['触达人数', String(total)], ['转化人数', String(converted)], ['转化率', this.formatPercent(rate)], ['带来收入', this.formatMoney(revenue)]],
        columns: ['指标', '值'],
        total, responded, booked, converted, rate, revenue, funnel,
        consumedSlots: { timeRange: { preset: range.preset, label: range.label, start: this.formatDate(range.start), end: this.formatDate(range.end) } },
      },
      evidence: {
        source: ['MarketingAutomationTouch'],
        dateRange: range.label,
        metricDefinition: '触达→转化→收入漏斗',
        filters: ['门店:' + ctx.storeId],
        sampleSize: total,
        limitations: ['响应和预约阶段基于触达状态、转化类型和已转化记录推断；若渠道未回传打开/预约状态，该阶段会低估。'],
      },
      actions: [{ label: '生成话术优化', action: 'marketing.copy.generate', riskLevel: 'low' as const }],
    };
  }


  private maskPhone(value?: string | null) {
    const text = String(value || '');
    if (!/^1\d{10}$/.test(text)) return text;
    return `${text.slice(0, 3)}****${text.slice(7)}`;
  }
}
