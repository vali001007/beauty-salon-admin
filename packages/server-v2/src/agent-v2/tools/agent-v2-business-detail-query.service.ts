import { Injectable, Optional } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { formatBusinessDateTime } from '../../common/utils/business-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import { AgentV2ManifestProviderService } from '../capability-center/agent-v2-manifest-provider.service.js';
import { GenericQueryEngineService } from '../query-engine/generic-query-engine.service.js';

type PageContextDefinition = {
  title: string;
  route: string;
  purpose: string;
  dataSources: string[];
  answerableQuestions: string[];
  limitations: string[];
};

type CustomerDetailAdapterKind =
  | 'customer'
  | 'customer_profile'
  | 'customer_health_profile'
  | 'customer_consumption_records'
  | 'customer_app_project'
  | 'customer_app_skin_test'
  | 'customer_app_skin_test_recommendations';

type CustomerDetailAdapterConfig = {
  capabilityId: string;
  title: string;
  queryKey: string;
  kind: CustomerDetailAdapterKind;
  sourceModels: string[];
  metricDefinition: string;
  idLabel: string;
};

const PAGE_CONTEXTS: Record<string, PageContextDefinition> = {
  'customer.customers.page.context': {
    title: '客户管理页面语义',
    route: '/customers',
    purpose: '用于查看客户列表、客户档案入口、客户画像和客户数据运营入口。',
    dataSources: ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord', 'CustomerCard'],
    answerableQuestions: ['客户列表在哪里看', '客户管理页能做什么', '客户画像和客户数据入口如何关联'],
    limitations: ['只解释客户管理页面语义，不创建、修改或删除客户资料。'],
  },
  'customer.customers.data.page.context': {
    title: '客户数据页面语义',
    route: '/customers/data',
    purpose: '用于查看客户基础资料、来源、标签、消费概览和客户列表，是客户运营和问数入口。',
    dataSources: ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord', 'CustomerCard'],
    answerableQuestions: ['客户列表在哪里看', '客户基础资料有哪些字段', '客户数据页能支持哪些运营分析'],
    limitations: ['只解释页面语义和可用数据源，不创建、修改或删除客户资料。'],
  },
  'customer.customer.marketing.page.context': {
    title: '客户营销总览页面语义',
    route: '/customer-marketing',
    purpose: '用于承载客户营销工作流入口，关联营销活动、推荐、页面、权益和效果分析。',
    dataSources: ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord', 'CustomerCard'],
    answerableQuestions: ['客户营销有哪些入口', '营销能力和客户数据如何关联', '哪些页面支持营销运营'],
    limitations: ['只说明营销页面能力边界，不自动发券、不自动触达客户。'],
  },
  'customer.customer.marketing.assets.page.context': {
    title: '营销资产页面语义',
    route: '/customer-marketing/assets',
    purpose: '用于管理和查看营销资产、权益素材和可复用触达资产。',
    dataSources: ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord', 'CustomerCard'],
    answerableQuestions: ['营销资产在哪里管理', '权益资产可以支撑哪些营销场景', '营销资产和客户画像如何关联'],
    limitations: ['只解释资产页用途，不创建、下发或核销权益。'],
  },
  'customer.customer.marketing.effect.analysis.page.context': {
    title: '营销效果分析页面语义',
    route: '/customer-marketing/effect-analysis',
    purpose: '用于查看营销活动效果、客户响应、转化和复购相关分析。',
    dataSources: ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord', 'CustomerCard'],
    answerableQuestions: ['营销效果在哪里看', '活动转化可以怎么分析', '客户响应和消费记录如何关联'],
    limitations: ['只说明效果分析页语义，不生成财务结论或修改活动状态。'],
  },
  'customer.customer.marketing.workbench.page.context': {
    title: '营销工作台页面语义',
    route: '/customer-marketing/workbench',
    purpose: '用于集中处理营销运营任务、客户跟进和推荐动作的工作台视图。',
    dataSources: ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord', 'CustomerCard'],
    answerableQuestions: ['营销工作台处理什么任务', '客户跟进入口在哪里', '推荐和触达任务如何进入工作台'],
    limitations: ['只解释工作台语义，不自动改派、取消或完成营销任务。'],
  },
};

const CUSTOMER_DETAIL_ADAPTERS: CustomerDetailAdapterConfig[] = [
  {
    capabilityId: 'customer.customers.id.detail',
    title: '客户详情',
    queryKey: 'customer.detail',
    kind: 'customer',
    sourceModels: ['Customer', 'CustomerHealthProfile', 'CustomerCard', 'ConsumptionRecord'],
    metricDefinition: '客户详情 = Customer 基础档案 + 健康档案 + 近期待卡/消费摘要；按当前门店过滤，只读返回。',
    idLabel: '客户 ID',
  },
  {
    capabilityId: 'customer.customers.id.profile.detail',
    title: '客户画像详情',
    queryKey: 'customer.profile.detail',
    kind: 'customer_profile',
    sourceModels: ['Customer', 'CustomerHealthProfile', 'CustomerCard', 'ConsumptionRecord', 'CustomerPredictionSnapshot'],
    metricDefinition: '客户画像详情 = 客户基础档案、肤质、标签、消费和权益摘要形成的画像详情。',
    idLabel: '客户 ID',
  },
  {
    capabilityId: 'customer.customers.id.health.profile.detail',
    title: '客户健康档案详情',
    queryKey: 'customer.health-profile.detail',
    kind: 'customer_health_profile',
    sourceModels: ['Customer', 'CustomerHealthProfile'],
    metricDefinition: '客户健康档案详情 = CustomerHealthProfile 中肤质、问题、过敏史、护理目标和最近检测信息。',
    idLabel: '客户 ID',
  },
  {
    capabilityId: 'customer.customers.id.consumption.records.detail',
    title: '客户消费记录详情',
    queryKey: 'customer.consumption-records.detail',
    kind: 'customer_consumption_records',
    sourceModels: ['Customer', 'ConsumptionRecord'],
    metricDefinition: '客户消费记录详情 = 指定客户的 ConsumptionRecord 近期消费流水和合计金额。',
    idLabel: '客户 ID',
  },
  {
    capabilityId: 'customer.customer.app.projects.id.detail',
    title: 'Ami Glow 项目详情',
    queryKey: 'customer.app.project.detail',
    kind: 'customer_app_project',
    sourceModels: ['Project', 'ProjectType', 'ProjectBomItem', 'Product', 'Store'],
    metricDefinition: 'Ami Glow 项目详情 = 当前门店可在线展示项目的基础信息、类型、门店和耗材摘要。',
    idLabel: '项目 ID',
  },
  {
    capabilityId: 'customer.customer.app.skin.tests.id.detail',
    title: 'Ami Glow 测肤报告详情',
    queryKey: 'customer.app.skin-test.detail',
    kind: 'customer_app_skin_test',
    sourceModels: ['SkinTest', 'Customer'],
    metricDefinition: 'Ami Glow 测肤报告详情 = SkinTest 中肤质、指标、主要问题、建议和关联客户。',
    idLabel: '测肤报告 ID',
  },
  {
    capabilityId: 'customer.customer.app.skin.tests.id.recommendations.detail',
    title: 'Ami Glow 测肤推荐详情',
    queryKey: 'customer.app.skin-test.recommendations.detail',
    kind: 'customer_app_skin_test_recommendations',
    sourceModels: ['SkinTest', 'Project', 'Customer'],
    metricDefinition: 'Ami Glow 测肤推荐详情 = 根据 SkinTest 肤质关键词匹配当前门店项目，返回只读推荐说明。',
    idLabel: '测肤报告 ID',
  },
];

const CUSTOMER_DETAIL_ADAPTER_BY_CAPABILITY_ID = new Map(
  CUSTOMER_DETAIL_ADAPTERS.map((config) => [config.capabilityId, config]),
);

const CUSTOMER_DETAIL_ADAPTER_BY_QUERY_KEY = new Map(
  CUSTOMER_DETAIL_ADAPTERS.map((config) => [config.queryKey, config]),
);

@Injectable()
export class AgentV2BusinessDetailQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly genericQueryEngine?: GenericQueryEngineService,
    @Optional() private readonly manifestProvider?: AgentV2ManifestProviderService,
  ) {}

  async execute(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    const genericResult = await this.tryGenericQuery(capabilityId, args, context);
    if (genericResult) return genericResult;
    const pageContextResult = this.tryPageContext(capabilityId, args);
    if (pageContextResult) return pageContextResult;
    const customerDetailAdapter = this.resolveCustomerDetailAdapter(capabilityId, String(args.queryKey ?? ''));
    if (customerDetailAdapter) return this.lookupCustomerReadOnlyDetail(customerDetailAdapter, args, context);
    if (capabilityId === 'order.detail.lookup') return this.lookupOrderDetail(args, context);
    return {
      status: 'unsupported',
      title: '暂不支持的详情查询',
      summary: `V2 详情查询暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId },
      evidence: this.evidence(['AgentV2CapabilityManifest'], '当前能力没有可执行详情查询器。', [], 0),
      actions: [],
    };
  }

  private async tryGenericQuery(capabilityId: string, args: Record<string, unknown>, context: AgentToolExecutionContext) {
    const manifest = this.activeManifests().find((item) => item.capabilityId === capabilityId);
    if (!manifest || !this.genericQueryEngine?.canExecute(manifest)) return null;
    return this.genericQueryEngine.tryExecute({ manifest, args, context });
  }

  private activeManifests() {
    return this.manifestProvider?.listManifests() ?? listAgentV2CapabilityManifests();
  }

  private resolveCustomerDetailAdapter(capabilityId: string, queryKey: string) {
    return CUSTOMER_DETAIL_ADAPTER_BY_CAPABILITY_ID.get(capabilityId) ?? CUSTOMER_DETAIL_ADAPTER_BY_QUERY_KEY.get(queryKey) ?? null;
  }

  private tryPageContext(capabilityId: string, args: Record<string, unknown>): AgentToolResult | null {
    const queryKey = String(args.queryKey ?? '');
    const key = [queryKey, capabilityId].find((candidate) => PAGE_CONTEXTS[candidate]);
    if (!key) return null;
    const definition = PAGE_CONTEXTS[key];
    const manifest = this.activeManifests().find((item) => item.capabilityId === capabilityId || item.executor.queryKey === key);
    const sourceModels = manifest?.sourceModels?.length ? manifest.sourceModels : definition.dataSources;
    const evidence = this.evidence(
      sourceModels,
      `${definition.title} = 页面上下文只读语义 adapter，根据 queryKey 返回页面用途、数据来源、可回答问题和边界说明。`,
      [`queryKey=${key}`, `route=${definition.route}`, 'write=false'],
      1,
      [
        '页面语义 adapter 不访问写接口，不触发发券、触达、编辑、发布或删除动作。',
        ...definition.limitations,
      ],
    );

    return {
      status: 'success',
      title: definition.title,
      summary: `${definition.title} 已接入 Agent V2 页面语义 adapter，可解释 ${definition.route} 的用途和只读数据边界。`,
      data: {
        capabilityId,
        queryKey: key,
        pageContext: {
          title: definition.title,
          route: definition.route,
          purpose: definition.purpose,
          dataSources: definition.dataSources,
          answerableQuestions: definition.answerableQuestions,
          limitations: definition.limitations,
        },
      },
      evidence,
      actions: [],
    };
  }

  private async lookupCustomerReadOnlyDetail(
    config: CustomerDetailAdapterConfig,
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const id = this.extractNumericId(args);
    const evidence = this.evidence(
      config.sourceModels,
      config.metricDefinition,
      [`storeId=${context.storeId}`, `queryKey=${config.queryKey}`, id ? `${config.idLabel}=${id}` : `${config.idLabel}=未提供`],
      id ? 1 : 0,
      ['只读取当前账号授权范围内的客户/小程序详情数据，不执行登录、绑定、预约、发券、触达或写入。'],
    );
    if (!id) {
      return {
        status: 'no_data',
        title: config.title,
        summary: `${config.title} 需要提供${config.idLabel}；当前 dry-run 未提供 ID，但工具分支已接入。`,
        data: {
          detail: null,
          items: [],
          dataGap: 'missing_detail_id',
          queryTrace: {
            engine: 'agent_v2_customer_readonly_adapter',
            queryKey: config.queryKey,
            capabilityId: config.capabilityId,
            sourceModels: config.sourceModels,
          },
        },
        evidence,
        actions: [],
      };
    }

    const detail = await this.loadCustomerReadOnlyDetail(config, id, context);
    if (!detail) {
      return {
        status: 'no_data',
        title: config.title,
        summary: `没有找到${config.idLabel}=${id} 对应的${config.title}。`,
        data: {
          detail: null,
          items: [],
          dataGap: 'not_found',
          queryTrace: {
            engine: 'agent_v2_customer_readonly_adapter',
            queryKey: config.queryKey,
            capabilityId: config.capabilityId,
            sourceModels: config.sourceModels,
          },
        },
        evidence,
        actions: [],
      };
    }

    return {
      status: 'success',
      title: config.title,
      summary: `${config.title} 已读取 ${config.idLabel}=${id} 的只读详情。`,
      data: {
        detail,
        items: Array.isArray((detail as any).items) ? (detail as any).items : [detail],
        queryTrace: {
          engine: 'agent_v2_customer_readonly_adapter',
          queryKey: config.queryKey,
          capabilityId: config.capabilityId,
          sourceModels: config.sourceModels,
        },
      },
      evidence: { ...evidence, sampleSize: 1 },
      actions: [{ label: '查看客户数据', action: 'customers:data', riskLevel: 'low' }],
    };
  }

  private async loadCustomerReadOnlyDetail(
    config: CustomerDetailAdapterConfig,
    id: number,
    context: AgentToolExecutionContext,
  ) {
    if (config.kind === 'customer' || config.kind === 'customer_profile') {
      const customer = await (this.prisma as any).customer.findFirst({
        where: { id, storeId: context.storeId, deletedAt: null },
        include: {
          store: { select: { id: true, name: true } },
          healthProfile: true,
          customerCards: { orderBy: { createdAt: 'desc' }, take: 5 },
          consumptionRecords: { orderBy: { consumeTime: 'desc' }, take: 10 },
          predictionSnapshots: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
      });
      if (!customer) return null;
      const totalConsumptionAmount = (customer.consumptionRecords ?? []).reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
      return {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        storeName: customer.store?.name,
        memberLevel: customer.memberLevel,
        totalSpent: this.toNumber(customer.totalSpent),
        totalSpentText: this.formatMoney(this.toNumber(customer.totalSpent)),
        visitCount: customer.visitCount,
        lastVisitDate: this.formatDateTime(customer.lastVisitDate),
        skinType: customer.healthProfile?.skinType ?? customer.skinType,
        skinStatus: customer.healthProfile?.skinStatus,
        mainProblems: customer.healthProfile?.mainProblems,
        recommendedCare: customer.healthProfile?.recommendedCare,
        activeCardCount: (customer.customerCards ?? []).filter((card: any) => card.status === 'active').length,
        recentConsumptionCount: customer.consumptionRecords?.length ?? 0,
        recentConsumptionAmount: totalConsumptionAmount,
        recentConsumptionAmountText: this.formatMoney(totalConsumptionAmount),
        predictionCount: customer.predictionSnapshots?.length ?? 0,
        items: customer.consumptionRecords ?? [],
      };
    }

    if (config.kind === 'customer_health_profile') {
      const profile = await (this.prisma as any).customerHealthProfile.findFirst({
        where: { customerId: id, customer: { storeId: context.storeId, deletedAt: null } },
        include: { customer: { select: { id: true, name: true, phone: true, storeId: true } } },
      });
      if (!profile) return null;
      return {
        profileId: profile.id,
        customerId: profile.customerId,
        customerName: profile.customer?.name,
        phone: profile.customer?.phone,
        skinType: profile.skinType,
        skinStatus: profile.skinStatus,
        mainProblems: profile.mainProblems,
        allergyHistory: profile.allergyHistory,
        goals: profile.goals,
        recommendedCare: profile.recommendedCare,
        instrument: profile.instrument,
        lastCheck: this.formatDateTime(profile.lastCheck),
      };
    }

    if (config.kind === 'customer_consumption_records') {
      const customer = await (this.prisma as any).customer.findFirst({
        where: { id, storeId: context.storeId, deletedAt: null },
        select: { id: true, name: true, phone: true },
      });
      if (!customer) return null;
      const records = await (this.prisma as any).consumptionRecord.findMany({
        where: { customerId: id },
        orderBy: { consumeTime: 'desc' },
        take: 20,
      });
      const totalAmount = (records ?? []).reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
      return {
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        total: records?.length ?? 0,
        totalAmount,
        totalAmountText: this.formatMoney(totalAmount),
        items: (records ?? []).map((record: any) => ({
          id: record.id,
          consumeType: record.consumeType,
          consumeContent: record.consumeContent,
          payMethod: record.payMethod,
          amount: this.toNumber(record.amount),
          amountText: this.formatMoney(this.toNumber(record.amount)),
          campaign: record.campaign,
          consumeTime: this.formatDateTime(record.consumeTime),
        })),
      };
    }

    if (config.kind === 'customer_app_project') {
      const project = await (this.prisma as any).project.findFirst({
        where: { id, storeId: context.storeId, deletedAt: null },
        include: { type: true, store: { select: { id: true, name: true } }, bomItems: { include: { product: true } } },
      });
      if (!project) return null;
      return {
        projectId: project.id,
        projectName: project.name,
        typeName: project.type?.name,
        storeName: project.store?.name,
        price: this.toNumber(project.price),
        priceText: this.formatMoney(this.toNumber(project.price)),
        duration: project.duration,
        status: project.status,
        online: project.online,
        description: project.description,
        items: (project.bomItems ?? []).map((item: any) => ({
          productId: item.productId,
          productName: item.product?.name,
          standardQty: this.toNumber(item.standardQty),
          unit: item.unit,
        })),
      };
    }

    if (config.kind === 'customer_app_skin_test' || config.kind === 'customer_app_skin_test_recommendations') {
      const skinTest = await (this.prisma as any).skinTest.findFirst({
        where: { id, customer: { storeId: context.storeId, deletedAt: null } },
        include: { customer: { select: { id: true, name: true, phone: true, storeId: true } } },
      });
      if (!skinTest) return null;
      if (config.kind === 'customer_app_skin_test') {
        return {
          skinTestId: skinTest.id,
          customerId: skinTest.customerId,
          customerName: skinTest.customer?.name,
          skinType: skinTest.skinType,
          skinStatus: skinTest.skinStatus,
          mainProblems: skinTest.mainProblems,
          metrics: skinTest.metrics,
          recommendationText: skinTest.recommendationText,
          createdAt: this.formatDateTime(skinTest.createdAt),
        };
      }
      const keywords = this.skinRecommendationKeywords(`${skinTest.skinType} ${skinTest.skinStatus ?? ''} ${skinTest.mainProblems ?? ''}`);
      const projects = await (this.prisma as any).project.findMany({
        where: {
          storeId: context.storeId,
          status: 'active',
          deletedAt: null,
          ...(keywords.length ? { OR: keywords.map((keyword) => ({ name: { contains: keyword, mode: 'insensitive' } })) } : {}),
        },
        include: { type: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });
      return {
        skinTestId: skinTest.id,
        skinType: skinTest.skinType,
        mainProblems: skinTest.mainProblems,
        keywords,
        items: (projects ?? []).map((project: any) => ({
          projectId: project.id,
          projectName: project.name,
          typeName: project.type?.name,
          price: this.toNumber(project.price),
          reason: `${skinTest.skinType}适合关注${keywords[0] || '护理'}类项目`,
        })),
      };
    }

    return null;
  }

  private async lookupOrderDetail(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const orderNo = this.extractOrderNo(args);
    const evidenceBase = ['ProductOrder', 'OrderItem', 'PaymentRecord', 'RefundRecord', 'Customer', 'Store'];
    if (!orderNo) {
      return {
        status: 'no_data',
        title: '订单详情',
        summary: '没有识别到订单编号，请补充订单号后再查询。',
        data: { items: [], detail: null },
        evidence: this.evidence(evidenceBase, '订单详情 = 按 ProductOrder.orderNo 定位订单，并读取订单明细、支付和退款记录。', [`storeId=${context.storeId}`], 0),
        actions: [],
      };
    }

    const order = await (this.prisma as any).productOrder.findFirst({
      where: {
        storeId: context.storeId,
        orderNo: { contains: orderNo },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: {
          include: {
            beautician: { select: { id: true, name: true, phone: true } },
          },
          orderBy: { id: 'asc' },
        },
        paymentRecords: { orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] },
        refundRecords: { orderBy: [{ refundedAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    const evidence = this.evidence(
      evidenceBase,
      '订单详情 = ProductOrder 主表 + OrderItem 明细 + PaymentRecord 支付 + RefundRecord 退款；按当前门店授权过滤。',
      [`storeId=${context.storeId}`, `orderNo~${orderNo}`],
      order ? 1 : 0,
      ['只读取已落库订单详情，不修改订单、支付、退款或客户消费记录。'],
    );

    if (!order) {
      return {
        status: 'no_data',
        title: '订单详情',
        summary: `没有找到订单 ${orderNo}。`,
        data: { items: [], detail: null, orderNo },
        evidence,
        actions: [{ label: '查看订单管理', action: 'order:open-management', riskLevel: 'low' }],
      };
    }

    const items = (Array.isArray(order.orderItems) ? order.orderItems : []).map((item: any) => this.mapOrderItem(item));
    const payments = (Array.isArray(order.paymentRecords) ? order.paymentRecords : []).map((payment: any) => this.mapPayment(payment));
    const refunds = (Array.isArray(order.refundRecords) ? order.refundRecords : []).map((refund: any) => this.mapRefund(refund));
    const detail = {
      orderId: order.id,
      orderNo: order.orderNo,
      orderKind: order.orderKind,
      orderKindLabel: this.orderKindLabel(order.orderKind),
      customerName: order.customer?.name ?? order.customerName ?? '未记录',
      customerPhone: order.customer?.phone ?? '',
      storeName: order.store?.name ?? `门店#${order.storeId}`,
      totalAmount: this.toNumber(order.totalAmount),
      totalAmountText: this.formatMoney(this.toNumber(order.totalAmount)),
      netAmount: this.toNumber(order.netAmount ?? order.totalAmount),
      netAmountText: this.formatMoney(this.toNumber(order.netAmount ?? order.totalAmount)),
      discountAmount: this.toNumber(order.totalDiscountAmount ?? order.orderDiscountAmount ?? order.itemDiscountAmount),
      discountAmountText: this.formatMoney(this.toNumber(order.totalDiscountAmount ?? order.orderDiscountAmount ?? order.itemDiscountAmount)),
      payMethodLabel: this.payMethodLabel(order.payMethod),
      statusLabel: this.orderStatusLabel(order.status),
      source: order.source ?? '',
      createdAt: this.formatDateTime(order.createdAt),
      remark: order.remark ?? '',
    };

    return {
      status: 'success',
      title: '订单详情',
      summary: `订单 ${detail.orderNo} 为${detail.orderKindLabel}，客户 ${detail.customerName}，实收 ${detail.netAmountText}，状态 ${detail.statusLabel}。`,
      data: {
        detail,
        items,
        payments,
        refunds,
        orderNo: detail.orderNo,
      },
      evidence,
      actions: [{ label: '查看订单管理', action: 'order:open-management', riskLevel: 'low' }],
    };
  }

  private mapOrderItem(item: any) {
    const quantity = this.toNumber(item.quantity) || 1;
    const netAmount = this.toNumber(item.netAmount || item.subtotal || item.listAmount || item.unitPrice);
    return {
      itemId: item.id,
      itemName: item.name ?? '订单明细',
      itemTypeLabel: this.itemTypeLabel(item.itemType),
      quantity,
      quantityText: `${quantity}`,
      unitPriceText: this.formatMoney(this.toNumber(item.unitPrice)),
      lineNetAmount: netAmount,
      lineNetAmountText: this.formatMoney(netAmount),
      discountAmountText: this.formatMoney(this.toNumber(item.totalDiscountAmount ?? item.discount)),
      staffName: item.beautician?.name ?? '未记录',
    };
  }

  private mapPayment(payment: any) {
    return {
      paymentNo: payment.paymentNo,
      methodLabel: this.payMethodLabel(payment.method),
      amountText: this.formatMoney(this.toNumber(payment.amount)),
      statusLabel: this.paymentStatusLabel(payment.status),
      paidAt: this.formatDateTime(payment.paidAt ?? payment.createdAt),
    };
  }

  private mapRefund(refund: any) {
    return {
      refundNo: refund.refundNo,
      amountText: this.formatMoney(this.toNumber(refund.amount)),
      statusLabel: this.refundStatusLabel(refund.status),
      refundedAt: this.formatDateTime(refund.refundedAt ?? refund.createdAt),
      reason: refund.reason ?? '',
    };
  }

  private extractOrderNo(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? (args.filters as Record<string, unknown>) : {};
    const fromFilter = String(filters.orderNo ?? '').trim();
    if (fromFilter) return fromFilter;
    const question = String(args.question ?? '').toUpperCase();
    return question.match(/[A-Z]{2,}[A-Z0-9]{5,}|PO\d{6,}/)?.[0] ?? null;
  }

  private extractNumericId(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? (args.filters as Record<string, unknown>) : {};
    const raw = filters.id ?? filters.customerId ?? filters.projectId ?? filters.skinTestId ?? args.id ?? args.customerId ?? args.projectId ?? args.skinTestId;
    const direct = Number(raw);
    if (Number.isInteger(direct) && direct > 0) return direct;
    const question = String(args.question ?? '');
    const matched = question.match(/(?:ID|id|编号|#)\s*[:：]?\s*(\d{1,10})/)?.[1] ?? question.match(/\b(\d{1,10})\b/)?.[1];
    const inferred = Number(matched);
    return Number.isInteger(inferred) && inferred > 0 ? inferred : 0;
  }

  private skinRecommendationKeywords(text: string) {
    const values = String(text ?? '');
    const keywords: string[] = [];
    if (values.includes('干') || values.includes('缺水')) keywords.push('补水', '保湿');
    if (values.includes('油') || values.includes('痘')) keywords.push('清洁', '控油');
    if (values.includes('敏感') || values.includes('泛红')) keywords.push('修护', '舒缓');
    if (values.includes('斑') || values.includes('暗沉')) keywords.push('美白', '焕肤');
    return keywords.length ? keywords : ['护理', '面部'];
  }

  private evidence(source: string[], metricDefinition: string, filters: string[], sampleSize: number, limitations?: string[]): AgentEvidence {
    return {
      source,
      sourceTables: source,
      metricDefinition,
      filters,
      sampleSize,
      limitations: limitations ?? ['只读取当前账号授权范围内的已落库业务数据，不执行写入。'],
    };
  }

  private formatDateTime(value: unknown) {
    if (!value) return '';
    return formatBusinessDateTime(value as Date, { seconds: true });
  }

  private formatDate(value: unknown) {
    if (!value) return '';
    return formatBusinessDateTime(value as Date).slice(0, 10);
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private formatMoney(value: number) {
    return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private payMethodLabel(value: unknown) {
    const map: Record<string, string> = {
      wechat: '微信',
      alipay: '支付宝',
      cash: '现金',
      card: '银行卡',
      balance: '会员卡余额',
      member_card: '会员卡划扣',
      mixed: '组合支付',
    };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private orderKindLabel(value: unknown) {
    const map: Record<string, string> = {
      product: '商品订单',
      project: '项目订单',
      member_card_recharge: '会员卡充值',
      member_card_open: '会员卡开卡',
      card_package: '次卡订单',
      card: '次卡订单',
    };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '订单');
  }

  private orderStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待处理', paid: '已支付', completed: '已完成', refunded: '已退款', cancelled: '已取消' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private itemTypeLabel(value: unknown) {
    const map: Record<string, string> = {
      product: '商品',
      goods: '商品',
      sku: '商品',
      project: '项目',
      service: '项目',
      member_card: '会员卡',
      card_package: '次卡',
    };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '明细');
  }

  private paymentStatusLabel(value: unknown) {
    const map: Record<string, string> = { paid: '已支付', success: '成功', pending: '待支付', refunded: '已退款', failed: '失败' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private refundStatusLabel(value: unknown) {
    const map: Record<string, string> = { success: '已退款', completed: '已退款', pending: '待处理', rejected: '已拒绝', failed: '失败' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }
}
