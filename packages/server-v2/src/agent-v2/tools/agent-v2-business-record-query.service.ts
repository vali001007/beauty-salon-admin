import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatBusinessDate, formatBusinessDateTime } from '../../common/utils/business-time.js';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import { AgentV2ManifestProviderService } from '../capability-center/agent-v2-manifest-provider.service.js';
import { GenericQueryEngineService } from '../query-engine/generic-query-engine.service.js';
import {
  resolveAgentV2QueryDateRange,
  startOfAgentV2Day,
  type AgentV2DateRange,
} from '../utils/agent-v2-date-range.js';

const DAY_MS = 86_400_000;

type OrderRecordConfig = {
  title: string;
  queryKey: string;
  itemTypes?: string[];
  orderKinds?: string[];
  metricDefinition: string;
};

type CustomerRecordAdapterKind =
  | 'customer_app_contact'
  | 'customer_app_display_configs'
  | 'customer_app_events'
  | 'customer_app_home'
  | 'customer_app_me'
  | 'customer_app_me_cards'
  | 'customer_app_me_consumption'
  | 'customer_app_me_member_card'
  | 'customer_app_me_reservations'
  | 'customer_app_projects'
  | 'customer_app_reservation_availability'
  | 'customer_card_portraits'
  | 'customer_consumption_records'
  | 'customer_health_profiles'
  | 'customer_miniapp_behavior';

type CustomerRecordAdapterConfig = {
  capabilityId: string;
  title: string;
  queryKey: string;
  kind: CustomerRecordAdapterKind;
  sourceModels: string[];
  metricDefinition: string;
};

const DEDICATED_RECORD_ADAPTER_CAPABILITY_IDS = new Set([
  'card.package.status.lookup',
  'customer.coupon.status.lookup',
  'finance.staff-commission.records.list',
]);

const CUSTOMER_RECORD_ADAPTERS: CustomerRecordAdapterConfig[] = [
  {
    capabilityId: 'customer.customer.app.contact.records.list',
    title: 'Ami Glow 联系方式',
    queryKey: 'customer.app.contact.records',
    kind: 'customer_app_contact',
    sourceModels: ['Store'],
    metricDefinition: 'Ami Glow 联系方式 = 当前门店 Store 的联系电话、地址和营业时间说明，只读返回。',
  },
  {
    capabilityId: 'customer.customer.app.display.configs.records.list',
    title: 'Ami Glow 展示配置',
    queryKey: 'customer.app.display-configs.records',
    kind: 'customer_app_display_configs',
    sourceModels: ['AmiGlowDisplayConfig', 'Store'],
    metricDefinition: 'Ami Glow 展示配置 = AmiGlowDisplayConfig 中配置给小程序/H5 的项目、商品、卡项、权益和页面展示记录。',
  },
  {
    capabilityId: 'customer.customer.app.events.records.list',
    title: 'Ami Glow 小程序事件',
    queryKey: 'customer.app.events.records',
    kind: 'customer_app_events',
    sourceModels: ['CustomerAppEvent', 'CustomerAppIdentity', 'Customer', 'Store'],
    metricDefinition: 'Ami Glow 小程序事件 = CustomerAppEvent 中已落库的浏览、点击、预约、领取等客户端事件。',
  },
  {
    capabilityId: 'customer.customer.app.home.records.list',
    title: 'Ami Glow 首页推荐数据',
    queryKey: 'customer.app.home.records',
    kind: 'customer_app_home',
    sourceModels: ['Store', 'Project', 'Promotion', 'Product', 'Card', 'MarketingPage', 'AmiGlowDisplayConfig'],
    metricDefinition: 'Ami Glow 首页推荐数据 = 当前门店可展示的项目、权益、商品、卡项和营销页面只读摘要。',
  },
  {
    capabilityId: 'customer.customer.app.me.records.list',
    title: 'Ami Glow 我的资料',
    queryKey: 'customer.app.me.records',
    kind: 'customer_app_me',
    sourceModels: ['Customer', 'CustomerHealthProfile', 'CustomerAppIdentity'],
    metricDefinition: 'Ami Glow 我的资料 = 绑定客户的基础档案、健康档案和小程序身份信息；无客户上下文时返回 no_data。',
  },
  {
    capabilityId: 'customer.customer.app.me.cards.records.list',
    title: 'Ami Glow 我的次卡',
    queryKey: 'customer.app.me.cards.records',
    kind: 'customer_app_me_cards',
    sourceModels: ['CustomerCard', 'Card', 'Customer'],
    metricDefinition: 'Ami Glow 我的次卡 = CustomerCard 中当前客户可查看的次卡权益记录；无客户上下文时返回 no_data。',
  },
  {
    capabilityId: 'customer.customer.app.me.consumption.records.records.list',
    title: 'Ami Glow 我的消费记录',
    queryKey: 'customer.app.me.consumption-records.records',
    kind: 'customer_app_me_consumption',
    sourceModels: ['ConsumptionRecord', 'Customer'],
    metricDefinition: 'Ami Glow 我的消费记录 = 当前客户 ConsumptionRecord 消费流水；无客户上下文时返回 no_data。',
  },
  {
    capabilityId: 'customer.customer.app.me.member.card.records.list',
    title: 'Ami Glow 我的会员卡',
    queryKey: 'customer.app.me.member-card.records',
    kind: 'customer_app_me_member_card',
    sourceModels: ['Customer', 'CustomerBalanceAccount'],
    metricDefinition: 'Ami Glow 我的会员卡 = CustomerBalanceAccount + Customer.memberLevel 的会员余额与权益摘要；无客户上下文时返回 no_data。',
  },
  {
    capabilityId: 'customer.customer.app.me.reservations.records.list',
    title: 'Ami Glow 我的预约',
    queryKey: 'customer.app.me.reservations.records',
    kind: 'customer_app_me_reservations',
    sourceModels: ['Reservation', 'Customer', 'Project', 'Beautician', 'Store'],
    metricDefinition: 'Ami Glow 我的预约 = 当前客户 Reservation 预约记录；无客户上下文时返回 no_data。',
  },
  {
    capabilityId: 'customer.customer.app.projects.records.list',
    title: 'Ami Glow 项目列表',
    queryKey: 'customer.app.projects.records',
    kind: 'customer_app_projects',
    sourceModels: ['Project', 'ProjectType', 'Store', 'AmiGlowDisplayConfig'],
    metricDefinition: 'Ami Glow 项目列表 = 当前门店可在线展示的 Project 记录。',
  },
  {
    capabilityId: 'customer.customer.app.reservations.availability.records.list',
    title: 'Ami Glow 预约可用时段',
    queryKey: 'customer.app.reservation-availability.records',
    kind: 'customer_app_reservation_availability',
    sourceModels: ['Project', 'Reservation', 'SchedulingRuleConfig', 'BeauticianTimeOff'],
    metricDefinition: 'Ami Glow 预约可用时段 = 项目时长、营业时间和已有预约综合形成的只读可约时段摘要。',
  },
  {
    capabilityId: 'customer.customers.card.portraits.records.list',
    title: '客户卡项画像',
    queryKey: 'customer.card-portraits.records',
    kind: 'customer_card_portraits',
    sourceModels: ['CustomerCard', 'Card', 'Customer'],
    metricDefinition: '客户卡项画像 = CustomerCard 次卡权益和客户基础档案形成的卡项偏好只读列表。',
  },
  {
    capabilityId: 'customer.customers.consumption.records.records.list',
    title: '客户消费记录',
    queryKey: 'customer.consumption.records',
    kind: 'customer_consumption_records',
    sourceModels: ['ConsumptionRecord', 'Customer'],
    metricDefinition: '客户消费记录 = ConsumptionRecord 中当前门店客户已落库消费流水。',
  },
  {
    capabilityId: 'customer.customers.health.profiles.records.list',
    title: '客户健康档案',
    queryKey: 'customer.health-profiles.records',
    kind: 'customer_health_profiles',
    sourceModels: ['CustomerHealthProfile', 'Customer'],
    metricDefinition: '客户健康档案 = CustomerHealthProfile 中肤质、问题、护理建议和最近检测时间。',
  },
  {
    capabilityId: 'customer.customers.miniapp.behavior.analysis.records.list',
    title: '客户小程序行为分析',
    queryKey: 'customer.miniapp-behavior-analysis.records',
    kind: 'customer_miniapp_behavior',
    sourceModels: ['Customer', 'CustomerAppEvent', 'CustomerAppIdentity', 'Reservation', 'ProductOrder', 'MarketingAutomationTouch'],
    metricDefinition: '客户小程序行为分析 = 客户档案、小程序事件、预约、订单和营销触达推导出的活跃度与意向分层。',
  },
];

const CUSTOMER_RECORD_ADAPTER_BY_CAPABILITY_ID = new Map(
  CUSTOMER_RECORD_ADAPTERS.map((config) => [config.capabilityId, config]),
);

const CUSTOMER_RECORD_ADAPTER_BY_QUERY_KEY = new Map(
  CUSTOMER_RECORD_ADAPTERS.map((config) => [config.queryKey, config]),
);

@Injectable()
export class AgentV2BusinessRecordQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly genericQueryEngine?: GenericQueryEngineService,
    @Optional() private readonly manifestProvider?: AgentV2ManifestProviderService,
  ) {}

  async execute(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    const queryKey = String(args.queryKey ?? '');
    const preferDedicatedAdapter = DEDICATED_RECORD_ADAPTER_CAPABILITY_IDS.has(capabilityId);
    if (!preferDedicatedAdapter) {
      const genericResult = await this.tryGenericQuery(capabilityId, args, context);
      if (genericResult) return genericResult;
    }

    if (
      capabilityId === 'customer.customers.profile.analytics.behavior.records.list' ||
      queryKey === 'customer.profile-analytics.behavior.records'
    ) return this.listCustomerProfileAnalyticsBehavior(args, context);
    const customerRecordAdapter = this.resolveCustomerRecordAdapter(capabilityId, queryKey);
    if (customerRecordAdapter) return this.listCustomerReadOnlyRecords(customerRecordAdapter, args, context);
    if (capabilityId === 'inventory.scrap.records.list') return this.listInventoryScrapRecords(args, context);
    if (capabilityId === 'inventory.expiring-risk.list') return this.listInventoryExpiringRisk(args, context);
    if (capabilityId === 'inventory.bom.consumption.records.records.list') return this.listInventoryStockHealth(args, context);
    if (capabilityId === 'order.product.records.list') {
      return this.listOrderRecords(args, context, {
        title: '商品订单记录',
        queryKey: 'order.product.records',
        itemTypes: ['product', 'goods', 'sku'],
        orderKinds: ['product'],
        metricDefinition: '商品订单 = ProductOrder 中 orderKind=product 或 OrderItem.itemType 为商品/产品类的已落库订单。',
      });
    }
    if (capabilityId === 'order.project.records.list') {
      return this.listOrderRecords(args, context, {
        title: '项目订单记录',
        queryKey: 'order.project.records',
        itemTypes: ['project', 'service'],
        orderKinds: ['project'],
        metricDefinition: '项目订单 = ProductOrder 中 orderKind=project 或 OrderItem.itemType 为项目/服务类的已落库订单。',
      });
    }
    if (capabilityId === 'order.member-card.records.list') {
      return this.listOrderRecords(args, context, {
        title: '会员卡开卡与充值记录',
        queryKey: 'order.member-card.records',
        itemTypes: ['member_card', 'member-card', 'stored_value', 'recharge'],
        orderKinds: ['member_card_recharge', 'member_card_open', 'stored_value', 'recharge'],
        metricDefinition: '会员卡开卡与充值 = 储值类 ProductOrder/OrderItem 记录，回答余额充值和会员开卡，不等同于次卡。',
      });
    }
    if (capabilityId === 'order.card-package.records.list') return this.listCardPackageRecords(args, context);
    if (capabilityId === 'cashier.payment.records.list') return this.listPaymentRecords(args, context);
    if (capabilityId === 'card.usage.records.list') return this.listCardUsageRecords(args, context);
    if (capabilityId === 'card.package.status.lookup') return this.lookupCardPackageStatus(args, context);
    if (capabilityId === 'card.package.inactive-customers.list') return this.listCardPackageInactiveCustomers(args, context);
    if (capabilityId === 'customer.coupon.status.lookup') return this.lookupCustomerCouponStatus(args, context);
    if (capabilityId === 'finance.staff-commission.records.list') return this.listCommissionRecords(args, context);
    if (capabilityId === 'customer.consumption.records.list') return this.listCustomerConsumptionRecords(args, context);

    if (preferDedicatedAdapter) {
      const genericResult = await this.tryGenericQuery(capabilityId, args, context);
      if (genericResult) return genericResult;
    }

    return {
      status: 'unsupported',
      title: '暂不支持的业务记录查询',
      summary: `V2 业务记录查询暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId },
      evidence: this.evidence(['AgentV2CapabilityManifest'], '当前能力没有可执行记录查询器。', [], 0),
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

  private resolveCustomerRecordAdapter(capabilityId: string, queryKey: string) {
    return CUSTOMER_RECORD_ADAPTER_BY_CAPABILITY_ID.get(capabilityId) ?? CUSTOMER_RECORD_ADAPTER_BY_QUERY_KEY.get(queryKey) ?? null;
  }

  private async listCustomerReadOnlyRecords(
    config: CustomerRecordAdapterConfig,
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const page = this.resolvePage(this.filterValue(args, 'page'));
    const pageSize = this.resolvePageSize(this.filterValue(args, 'pageSize') ?? args.limit);
    let payload: { items: any[]; total: number; metrics?: Record<string, unknown>; dataGap?: string };
    switch (config.kind) {
      case 'customer_app_contact':
        payload = await this.listCustomerAppContact(context);
        break;
      case 'customer_app_display_configs':
        payload = await this.listAmiGlowDisplayConfigs(context, page, pageSize);
        break;
      case 'customer_app_events':
        payload = await this.listCustomerAppEvents(context, page, pageSize);
        break;
      case 'customer_app_home':
        payload = await this.listCustomerAppHomeRecords(context);
        break;
      case 'customer_app_me':
        payload = await this.listCustomerAppMe(args, context);
        break;
      case 'customer_app_me_cards':
        payload = await this.listCustomerAppMeCards(args, context, page, pageSize);
        break;
      case 'customer_app_me_consumption':
        payload = await this.listCustomerAppMeConsumption(args, context, page, pageSize);
        break;
      case 'customer_app_me_member_card':
        payload = await this.listCustomerAppMeMemberCard(args, context);
        break;
      case 'customer_app_me_reservations':
        payload = await this.listCustomerAppMeReservations(args, context, page, pageSize);
        break;
      case 'customer_app_projects':
        payload = await this.listCustomerAppProjects(context, page, pageSize);
        break;
      case 'customer_app_reservation_availability':
        payload = await this.listCustomerAppReservationAvailability(args, context);
        break;
      case 'customer_card_portraits':
        payload = await this.listCustomerCardPortraits(context, page, pageSize);
        break;
      case 'customer_consumption_records':
        payload = await this.listCustomerConsumptionRecordRows(context, page, pageSize);
        break;
      case 'customer_health_profiles':
        payload = await this.listCustomerHealthProfiles(context, page, pageSize);
        break;
      case 'customer_miniapp_behavior':
        payload = await this.listCustomerMiniappBehaviorAnalysis(context, page, pageSize);
        break;
      default:
        payload = { items: [], total: 0 };
    }

    const evidence = this.evidence(
      config.sourceModels,
      config.metricDefinition,
      [`storeId=${context.storeId}`, `queryKey=${config.queryKey}`, `page=${page}`, `pageSize=${pageSize}`],
      payload.items.length,
      undefined,
      ['只读取当前账号授权范围内的小程序/客户相关数据，不执行登录、绑定、预约、发券、触达或写入。'],
    );
    const data = {
      items: payload.items,
      data: payload.items,
      total: payload.total,
      page,
      pageSize,
      metrics: payload.metrics,
      dataGap: payload.dataGap,
      queryTrace: {
        engine: 'agent_v2_customer_readonly_adapter',
        queryKey: config.queryKey,
        capabilityId: config.capabilityId,
        sourceModels: config.sourceModels,
      },
    };

    if (!payload.items.length) {
      return this.noData(
        config.title,
        payload.dataGap === 'missing_customer_context'
          ? `${config.title} 需要客户 ID、手机号或姓名；当前 dry-run 未提供客户上下文，但工具分支已接入。`
          : `${config.title} 当前没有匹配记录。`,
        data,
        evidence,
      );
    }

    return {
      status: 'success',
      title: config.title,
      summary: `${config.title} 返回 ${payload.items.length} 条只读记录，共 ${payload.total} 条。`,
      data,
      evidence,
      actions: [{ label: '查看客户数据', action: 'customers:data', riskLevel: 'low' }],
    };
  }

  private async listCustomerAppContact(context: AgentToolExecutionContext) {
    const store = await (this.prisma as any).store.findFirst({
      where: { id: context.storeId, deletedAt: null },
      select: { id: true, name: true, phone: true, address: true },
    });
    return {
      items: store ? [{ storeId: store.id, storeName: store.name, phone: store.phone, address: store.address, businessHours: '09:00-20:00' }] : [],
      total: store ? 1 : 0,
    };
  }

  private async listAmiGlowDisplayConfigs(context: AgentToolExecutionContext, page: number, pageSize: number) {
    const where = { storeId: context.storeId };
    const [items, total] = await Promise.all([
      (this.prisma as any).amiGlowDisplayConfig.findMany({
        where,
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).amiGlowDisplayConfig.count({ where }),
    ]);
    return {
      items: (items ?? []).map((item: any) => ({
        id: item.id,
        storeId: item.storeId,
        storeName: item.store?.name,
        objectType: item.objectType,
        objectId: item.objectId,
        showInAmiGlow: item.showInAmiGlow,
        publishStatus: item.publishStatus,
        sortOrder: item.sortOrder,
        tags: item.tags ?? [],
        summary: item.summary,
        updatedAt: this.formatDateTime(item.updatedAt),
      })),
      total,
    };
  }

  private async listCustomerAppEvents(context: AgentToolExecutionContext, page: number, pageSize: number) {
    const where = { storeId: context.storeId };
    const [items, total] = await Promise.all([
      (this.prisma as any).customerAppEvent.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          identity: { select: { id: true, nickname: true, bindStatus: true } },
          store: { select: { id: true, name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).customerAppEvent.count({ where }),
    ]);
    return {
      items: (items ?? []).map((item: any) => ({
        id: item.id,
        storeId: item.storeId,
        storeName: item.store?.name,
        customerId: item.customerId,
        customerName: item.customer?.name,
        identityId: item.identityId,
        nickname: item.identity?.nickname,
        bindStatus: item.identity?.bindStatus,
        eventType: item.eventType,
        channel: item.channel,
        source: item.source,
        targetType: item.targetType,
        targetId: item.targetId,
        occurredAt: this.formatDateTime(item.occurredAt),
      })),
      total,
    };
  }

  private async listCustomerAppHomeRecords(context: AgentToolExecutionContext) {
    const now = new Date();
    const [store, projects, promotions, products, cards, pages, configs] = await Promise.all([
      (this.prisma as any).store.findFirst({ where: { id: context.storeId, deletedAt: null }, select: { id: true, name: true } }),
      (this.prisma as any).project.findMany({ where: { storeId: context.storeId, status: 'active', deletedAt: null }, select: { id: true, name: true, price: true, duration: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }], take: 6 }),
      (this.prisma as any).promotion.findMany({
        where: {
          status: 'active',
          approvalStatus: 'approved',
          OR: [{ storeId: context.storeId }, { storeId: null }],
          AND: [
            { OR: [{ startAt: null }, { startAt: { lte: now } }] },
            { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          ],
        },
        select: { id: true, name: true, discountText: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      (this.prisma as any).product.findMany({ where: { storeId: context.storeId, status: 'active', deletedAt: null }, select: { id: true, name: true, salePrice: true, retailPrice: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }], take: 4 }),
      (this.prisma as any).card.findMany({ where: { status: 'active' }, select: { id: true, name: true, price: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 4 }),
      (this.prisma as any).marketingPage.findMany({ where: { OR: [{ storeId: context.storeId }, { storeId: null }], status: 'published' }, select: { id: true, title: true, status: true, publishedAt: true }, orderBy: { publishedAt: 'desc' }, take: 5 }),
      (this.prisma as any).amiGlowDisplayConfig.findMany({ where: { storeId: context.storeId, showInAmiGlow: true, publishStatus: 'published' }, select: { id: true, objectType: true, objectId: true, sortOrder: true }, orderBy: [{ sortOrder: 'asc' }], take: 20 }),
    ]);
    const rows = [
      ...(store ? [{ section: 'store', id: store.id, title: store.name }] : []),
      ...(projects ?? []).map((item: any) => ({ section: 'project', id: item.id, title: item.name, price: this.toNumber(item.price), duration: item.duration })),
      ...(promotions ?? []).map((item: any) => ({ section: 'promotion', id: item.id, title: item.name, discountText: item.discountText })),
      ...(products ?? []).map((item: any) => ({ section: 'product', id: item.id, title: item.name, price: this.toNumber(item.salePrice ?? item.retailPrice) })),
      ...(cards ?? []).map((item: any) => ({ section: 'card', id: item.id, title: item.name, price: this.toNumber(item.price) })),
      ...(pages ?? []).map((item: any) => ({ section: 'marketing_page', id: item.id, title: item.title, status: item.status })),
    ];
    return {
      items: rows,
      total: rows.length,
      metrics: {
        projectCount: projects?.length ?? 0,
        promotionCount: promotions?.length ?? 0,
        productCount: products?.length ?? 0,
        cardCount: cards?.length ?? 0,
        marketingPageCount: pages?.length ?? 0,
        displayConfigCount: configs?.length ?? 0,
      },
    };
  }

  private async listCustomerAppMe(args: Record<string, unknown>, context: AgentToolExecutionContext) {
    const customer = await this.findCustomerForCustomerApp(args, context);
    if (!customer) return { items: [], total: 0, dataGap: 'missing_customer_context' };
    return {
      items: [{
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        memberLevel: customer.memberLevel,
        totalSpent: this.toNumber(customer.totalSpent),
        visitCount: customer.visitCount,
        lastVisitDate: this.formatDate(customer.lastVisitDate),
        skinType: customer.healthProfile?.skinType ?? customer.skinType,
        bindStatus: customer.customerAppIdentities?.[0]?.bindStatus,
      }],
      total: 1,
    };
  }

  private async listCustomerAppMeCards(args: Record<string, unknown>, context: AgentToolExecutionContext, page: number, pageSize: number) {
    const customer = await this.findCustomerForCustomerApp(args, context);
    if (!customer) return { items: [], total: 0, dataGap: 'missing_customer_context' };
    const where = { customerId: customer.id };
    const [cards, total] = await Promise.all([
      (this.prisma as any).customerCard.findMany({ where, include: { card: true }, orderBy: { expiryDate: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      (this.prisma as any).customerCard.count({ where }),
    ]);
    return {
      items: (cards ?? []).map((card: any) => this.toCustomerCardRow(card)),
      total,
    };
  }

  private async listCustomerAppMeConsumption(args: Record<string, unknown>, context: AgentToolExecutionContext, page: number, pageSize: number) {
    const customer = await this.findCustomerForCustomerApp(args, context);
    if (!customer) return { items: [], total: 0, dataGap: 'missing_customer_context' };
    const where = { customerId: customer.id };
    const [records, total] = await Promise.all([
      (this.prisma as any).consumptionRecord.findMany({ where, orderBy: { consumeTime: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      (this.prisma as any).consumptionRecord.count({ where }),
    ]);
    return {
      items: (records ?? []).map((record: any) => this.toConsumptionRecordRow(record, customer)),
      total,
    };
  }

  private async listCustomerAppMeMemberCard(args: Record<string, unknown>, context: AgentToolExecutionContext) {
    const customer = await this.findCustomerForCustomerApp(args, context);
    if (!customer) return { items: [], total: 0, dataGap: 'missing_customer_context' };
    const account = await (this.prisma as any).customerBalanceAccount.findFirst({
      where: { customerId: customer.id, storeId: customer.storeId, status: 'active' },
    });
    return {
      items: [{
        customerId: customer.id,
        name: customer.name,
        memberLevel: customer.memberLevel || '普通会员',
        cashBalance: this.toNumber(account?.cashBalance),
        giftBalance: this.toNumber(account?.giftBalance),
        status: account?.status ?? 'inactive',
        benefits: ['会员专属护理建议', '项目预约提醒', '次卡余额查询'],
      }],
      total: 1,
    };
  }

  private async listCustomerAppMeReservations(args: Record<string, unknown>, context: AgentToolExecutionContext, page: number, pageSize: number) {
    const customer = await this.findCustomerForCustomerApp(args, context);
    if (!customer) return { items: [], total: 0, dataGap: 'missing_customer_context' };
    const where = { customerId: customer.id };
    const [reservations, total] = await Promise.all([
      (this.prisma as any).reservation.findMany({
        where,
        include: { store: true, project: true, beautician: true },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).reservation.count({ where }),
    ]);
    return {
      items: (reservations ?? []).map((reservation: any) => this.toReservationRow(reservation, customer)),
      total,
    };
  }

  private async listCustomerAppProjects(context: AgentToolExecutionContext, page: number, pageSize: number) {
    const where = { storeId: context.storeId, status: 'active', deletedAt: null };
    const [projects, total] = await Promise.all([
      (this.prisma as any).project.findMany({
        where,
        include: { type: true, store: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).project.count({ where }),
    ]);
    return {
      items: (projects ?? []).map((project: any) => ({
        projectId: project.id,
        projectName: project.name,
        typeName: project.type?.name,
        storeName: project.store?.name,
        price: this.toNumber(project.price),
        duration: project.duration,
        online: project.online,
        recommend: project.recommend,
      })),
      total,
    };
  }

  private async listCustomerAppReservationAvailability(args: Record<string, unknown>, context: AgentToolExecutionContext) {
    const projectId = this.toPositiveInt(this.filterValue(args, 'projectId') ?? args.projectId);
    const [rule, project] = await Promise.all([
      (this.prisma as any).schedulingRuleConfig.findFirst({ where: { storeId: context.storeId, status: 'active' }, orderBy: { updatedAt: 'desc' } }),
      projectId
        ? (this.prisma as any).project.findFirst({ where: { id: projectId, storeId: context.storeId, status: 'active', deletedAt: null } })
        : (this.prisma as any).project.findFirst({ where: { storeId: context.storeId, status: 'active', deletedAt: null }, orderBy: { updatedAt: 'desc' } }),
    ]);
    if (!project) return { items: [], total: 0 };
    const startTime = rule?.businessStartTime ?? '09:00';
    const endTime = rule?.businessEndTime ?? '20:00';
    const duration = this.toNumber(project.duration) || 60;
    return {
      items: [{
        storeId: context.storeId,
        projectId: project.id,
        projectName: project.name,
        businessStartTime: startTime,
        businessEndTime: endTime,
        duration,
        slotMinutes: rule?.slotMinutes ?? duration,
        note: '发布 dry-run 只验证预约可用时段查询分支；实际时段占用需带 date/beauticianId 后计算。',
      }],
      total: 1,
    };
  }

  private async listCustomerCardPortraits(context: AgentToolExecutionContext, page: number, pageSize: number) {
    const where = { customer: { storeId: context.storeId, deletedAt: null } };
    const [cards, total] = await Promise.all([
      (this.prisma as any).customerCard.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } }, card: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).customerCard.count({ where }),
    ]);
    return {
      items: (cards ?? []).map((card: any) => this.toCustomerCardRow(card)),
      total,
    };
  }

  private async listCustomerConsumptionRecordRows(context: AgentToolExecutionContext, page: number, pageSize: number) {
    const where = { customer: { storeId: context.storeId, deletedAt: null } };
    const [records, total] = await Promise.all([
      (this.prisma as any).consumptionRecord.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true, storeId: true } } },
        orderBy: { consumeTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).consumptionRecord.count({ where }),
    ]);
    return {
      items: (records ?? []).map((record: any) => this.toConsumptionRecordRow(record, record.customer)),
      total,
    };
  }

  private async listCustomerHealthProfiles(context: AgentToolExecutionContext, page: number, pageSize: number) {
    const where = { customer: { storeId: context.storeId, deletedAt: null } };
    const [profiles, total] = await Promise.all([
      (this.prisma as any).customerHealthProfile.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true, storeId: true } } },
        orderBy: { lastCheck: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).customerHealthProfile.count({ where }),
    ]);
    return {
      items: (profiles ?? []).map((profile: any) => ({
        profileId: profile.id,
        customerId: profile.customerId,
        customerName: profile.customer?.name,
        phone: profile.customer?.phone,
        skinType: profile.skinType,
        skinStatus: profile.skinStatus,
        mainProblems: profile.mainProblems,
        recommendedCare: profile.recommendedCare,
        lastCheck: this.formatDate(profile.lastCheck),
      })),
      total,
    };
  }

  private async listCustomerMiniappBehaviorAnalysis(context: AgentToolExecutionContext, page: number, pageSize: number) {
    const customers = await (this.prisma as any).customer.findMany({
      where: { storeId: context.storeId, deletedAt: null },
      include: {
        store: { select: { id: true, name: true } },
        customerAppIdentities: { select: { id: true, bindStatus: true, lastLoginAt: true }, orderBy: { lastLoginAt: 'desc' }, take: 3 },
        customerAppEvents: { select: { id: true, eventType: true, occurredAt: true }, orderBy: { occurredAt: 'desc' }, take: 20 },
        reservations: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        productOrders: { select: { id: true, status: true, totalAmount: true, netAmount: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        marketingTouches: { select: { id: true, status: true, touchedAt: true, convertedAt: true }, orderBy: { touchedAt: 'desc' }, take: 20 },
        recommendationEvents: { select: { id: true, eventType: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        customerCards: { select: { id: true, status: true, remainingTimes: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    const now = new Date();
    const active7d = new Date(now.getTime() - 7 * DAY_MS);
    const active30d = new Date(now.getTime() - 30 * DAY_MS);
    const rows = (customers ?? []).map((customer: any) => {
      const touchCount = (customer.customerAppEvents?.length ?? 0) + (customer.recommendationEvents?.length ?? 0) + (customer.marketingTouches?.length ?? 0);
      const reservationCount = customer.reservations?.length ?? 0;
      const orderCount = customer.productOrders?.length ?? 0;
      const cardCount = customer.customerCards?.length ?? 0;
      const conversionCount =
        (customer.productOrders ?? []).filter((order: any) => ['completed', 'paid', '已完成', '已付款'].includes(String(order.status))).length +
        (customer.marketingTouches ?? []).filter((touch: any) => touch.convertedAt || touch.status === 'converted').length;
      const lastActiveAt = this.maxDate([
        customer.lastVisitDate,
        ...(customer.customerAppEvents ?? []).map((item: any) => item.occurredAt),
        ...(customer.reservations ?? []).map((item: any) => item.createdAt),
        ...(customer.productOrders ?? []).map((item: any) => item.createdAt),
        ...(customer.marketingTouches ?? []).map((item: any) => item.touchedAt),
        ...(customer.recommendationEvents ?? []).map((item: any) => item.createdAt),
        ...(customer.customerCards ?? []).map((item: any) => item.createdAt),
      ]);
      const engagementScore = Math.min(
        100,
        Math.round(touchCount * 6 + reservationCount * 10 + orderCount * 12 + conversionCount * 16 + cardCount * 4 + Math.min(20, this.toNumber(customer.totalSpent) / 2000) + (lastActiveAt && lastActiveAt >= active7d ? 18 : lastActiveAt && lastActiveAt >= active30d ? 10 : 0)),
      );
      const miniappStatus =
        (customer.customerAppIdentities?.length ?? 0) === 0 && !customer.phone && !customer.wechat
          ? '待绑定'
          : engagementScore >= 70
            ? '高活跃'
            : reservationCount > 0 || touchCount > 0 || engagementScore >= 35
              ? '有意向'
              : '低活跃';
      return {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        storeName: customer.store?.name,
        miniappStatus,
        touchCount,
        reservationCount,
        orderCount,
        conversionCount,
        cardCount,
        engagementScore,
        intentLevel: engagementScore >= 70 ? '高' : engagementScore >= 35 ? '中' : '低',
        lastActiveAt: this.formatDateTime(lastActiveAt),
      };
    }).sort((a: any, b: any) => b.engagementScore - a.engagementScore);
    const items = rows.slice((page - 1) * pageSize, page * pageSize);
    return {
      items,
      total: rows.length,
      metrics: {
        totalCustomers: rows.length,
        highActiveCount: rows.filter((row: any) => row.miniappStatus === '高活跃').length,
        intentCount: rows.filter((row: any) => row.intentLevel !== '低').length,
        avgEngagementScore: rows.length ? Math.round(rows.reduce((sum: number, row: any) => sum + row.engagementScore, 0) / rows.length) : 0,
      },
    };
  }

  private async listCustomerProfileAnalyticsBehavior(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const page = this.resolvePage(filters.page ?? args.page);
    const pageSize = this.resolvePageSize(filters.pageSize ?? args.pageSize ?? args.limit);
    const segmentFilter = String(filters.segment ?? args.segment ?? '').trim();
    const skinTypeFilter = String(filters.skinType ?? args.skinType ?? '').trim();
    const now = new Date();

    const where: Record<string, unknown> = { deletedAt: null, storeId: context.storeId };
    const [totalCustomers, customers] = await Promise.all([
      (this.prisma as any).customer.count({ where }),
      (this.prisma as any).customer.findMany({
        where,
        select: {
          id: true,
          storeId: true,
          name: true,
          age: true,
          skinCondition: true,
          memberLevel: true,
          totalSpent: true,
          visitCount: true,
          lastVisitDate: true,
          skinType: true,
          tags: true,
          createdAt: true,
          healthProfile: {
            select: {
              customerId: true,
              skinType: true,
              skinStatus: true,
              mainProblems: true,
            },
          },
        },
        orderBy: [{ totalSpent: 'desc' }, { id: 'asc' }],
        take: 300,
      }),
    ]);

    const customerIds = ((customers ?? []) as any[]).map((customer) => customer.id);
    const consumptionRecords = customerIds.length
      ? await (this.prisma as any).consumptionRecord.findMany({
        where: { customerId: { in: customerIds } },
        select: {
          id: true,
          customerId: true,
          consumeType: true,
          consumeContent: true,
          amount: true,
          campaign: true,
          consumeTime: true,
        },
        orderBy: { consumeTime: 'desc' },
        take: 2000,
      })
      : [];

    let rows = this.buildCustomerProfileBehaviorRows(customers ?? [], consumptionRecords ?? [], now);
    if (segmentFilter) rows = rows.filter((row) => row.segment === segmentFilter);
    if (skinTypeFilter) rows = rows.filter((row) => row.skinType === skinTypeFilter);

    const total = rows.length;
    const items = rows.slice((page - 1) * pageSize, page * pageSize);
    const evidence = this.evidence(
      ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord'],
      '客户画像行为记录 = Customer 基础画像 + CustomerHealthProfile 肤质信息 + ConsumptionRecord 消费偏好；按当前门店过滤，只读计算行为画像。',
      [
        `storeId=${context.storeId}`,
        'deletedAt=null',
        `page=${page}`,
        `pageSize=${pageSize}`,
        ...(segmentFilter ? [`segment=${segmentFilter}`] : []),
        ...(skinTypeFilter ? [`skinType=${skinTypeFilter}`] : []),
      ],
      items.length,
      undefined,
      ['只读取客户画像与消费记录，不创建、修改或触达客户。'],
    );

    const data = {
      generatedAt: this.formatDateTime(now),
      storeId: context.storeId,
      totalCustomers,
      items,
      data: items,
      total,
      page,
      pageSize,
      queryTrace: {
        engine: 'agent_v2_dedicated_adapter',
        queryKey: 'customer.profile-analytics.behavior.records',
        sourceModels: ['Customer', 'CustomerHealthProfile', 'ConsumptionRecord'],
      },
    };

    if (!items.length) {
      return this.noData(
        '客户画像行为记录',
        segmentFilter || skinTypeFilter ? '当前筛选条件下没有客户画像行为记录。' : '当前门店没有可用于画像行为分析的客户记录。',
        data,
        evidence,
      );
    }

    return {
      status: 'success',
      title: '客户画像行为记录',
      summary: `当前门店生成 ${total} 条客户画像行为记录，本页返回 ${items.length} 条；首位客户 ${items[0].name}，分层为 ${items[0].segment}。`,
      data,
      evidence,
      actions: [{ label: '查看客户画像分析', action: 'customers:profile-analytics', riskLevel: 'low' }],
    };
  }

  private async listInventoryScrapRecords(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveQueryDateRange(args, 'this_week');
    const movements = await (this.prisma as any).stockMovement.findMany({
      where: {
        storeId: context.storeId,
        movementType: 'scrap_out',
        occurredAt: { gte: range.start, lt: range.end },
      },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true, costPrice: true, category: { select: { name: true } } } },
        store: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true, username: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    const items = (movements as any[]).map((movement) => {
      const quantity = Math.abs(this.toNumber(movement.quantity));
      const unit = movement.unit ?? movement.product?.specUnit ?? movement.product?.unit ?? '';
      const costPrice = this.toNumber(movement.product?.costPrice);
      const lossAmount = Number((quantity * costPrice).toFixed(2));
      return {
        movementId: movement.id,
        movementNo: movement.movementNo,
        productId: movement.productId,
        productName: movement.product?.name ?? `商品#${movement.productId}`,
        sku: movement.product?.sku ?? '',
        categoryName: movement.product?.category?.name ?? '未分类',
        scrapQuantity: quantity,
        unit,
        scrapQuantityText: `${quantity}${unit}`,
        lossAmount,
        lossAmountText: this.formatMoney(lossAmount),
        storeName: movement.store?.name ?? `门店#${movement.storeId}`,
        operatorName: movement.operator?.name ?? movement.operator?.username ?? '未记录',
        occurredAt: this.formatDateTime(movement.occurredAt),
        batchNo: movement.batch?.batchNo ?? '',
        expiryDate: this.formatDate(movement.batch?.expiryDate),
        sourceNo: movement.sourceNo ?? '',
        remark: movement.remark ?? '',
      };
    });

    const totalLossAmount = items.reduce((sum, item) => sum + item.lossAmount, 0);
    const evidence = this.evidence(
      ['StockMovement', 'Product', 'Store', 'User', 'StockBatch'],
      '已发生报废记录 = StockMovement.movementType 为 scrap_out 的库存流水；按发生时间过滤，按当前门店授权过滤。',
      [`storeId=${context.storeId}`, 'movementType=scrap_out', this.rangeFilterText('occurredAt', range), `limit=${limit}`],
      items.length,
      range,
      ['只读取当前已落库的库存报废流水，不推测临期风险，也不创建库存调整。'],
    );

    if (!items.length) {
      return this.noData('已发生报废记录', `${range.label}没有已发生的报废库存流水。`, { items, requestedLimit: limit, totalLossAmount: 0, timeRange: this.serializeRange(range) }, evidence);
    }

    return {
      status: 'success',
      title: '已发生报废记录',
      summary: `${range.label}共有 ${items.length} 条报废记录，预计损耗 ${this.formatMoney(totalLossAmount)}；最近一条是 ${items[0].productName}，数量 ${items[0].scrapQuantityText}。`,
      data: {
        items,
        requestedLimit: limit,
        totalLossAmount: Number(totalLossAmount.toFixed(2)),
        totalLossAmountText: this.formatMoney(totalLossAmount),
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看库存流水', action: 'inventory:stock-movements', riskLevel: 'low' }],
    };
  }

  private async listInventoryExpiringRisk(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const riskWindowDays = this.resolveRiskWindowDays(args);
    const now = this.startOfDay(new Date());
    const products = await (this.prisma as any).product.findMany({
      where: {
        storeId: context.storeId,
        deletedAt: null,
      },
      include: {
        category: { select: { name: true } },
        batches: {
          where: { stock: { gt: 0 } },
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
          take: 5,
        },
      },
      orderBy: [{ currentStock: 'asc' }, { updatedAt: 'desc' }],
      take: Math.max(limit, 50),
    });

    const items = ((products ?? []) as any[])
      .map((product) => {
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const costPrice = this.toNumber(product.costPrice);
        const nearestBatch = Array.isArray(product.batches) ? product.batches.find((batch: any) => batch.expiryDate) : null;
        const expiryDate = nearestBatch?.expiryDate ? new Date(nearestBatch.expiryDate) : null;
        const daysUntilExpiry = expiryDate ? Math.ceil((this.startOfDay(expiryDate).getTime() - now.getTime()) / DAY_MS) : null;
        const lowStock = safetyStock > 0 && currentStock < safetyStock;
        const outOfStock = currentStock <= 0;
        const expiring = daysUntilExpiry !== null && daysUntilExpiry <= riskWindowDays;
        const riskScore = (outOfStock ? 100 : 0) + (lowStock ? 70 : 0) + (expiring ? Math.max(10, riskWindowDays - Math.max(daysUntilExpiry ?? riskWindowDays, 0)) : 0);
        const unit = product.specUnit ?? product.unit ?? '';
        return {
          productId: product.id,
          productName: product.name ?? `商品#${product.id}`,
          sku: product.sku ?? '',
          categoryName: product.category?.name ?? '未分类',
          currentStock,
          currentStockText: `${currentStock}${unit}`,
          safetyStock,
          safetyStockText: `${safetyStock}${unit}`,
          stockValue: Number((currentStock * costPrice).toFixed(2)),
          stockValueText: this.formatMoney(currentStock * costPrice),
          expiryDate,
          expiryDateText: this.formatDate(expiryDate),
          daysUntilExpiry,
          statusLabel: outOfStock ? '缺货' : lowStock ? '低于安全库存' : expiring ? '临期风险' : '正常',
          riskReason: outOfStock
            ? '当前库存为 0 或更低。'
            : lowStock
              ? '当前库存低于安全库存线。'
              : expiring
                ? `最近批次 ${daysUntilExpiry} 天后到期。`
                : '暂无临期或缺货风险。',
          riskScore,
        };
      })
      .filter((item) => item.statusLabel !== '正常')
      .sort((a, b) => b.riskScore - a.riskScore || (a.daysUntilExpiry ?? 9999) - (b.daysUntilExpiry ?? 9999))
      .slice(0, limit);

    const evidence = this.evidence(
      ['Product', 'StockBatch', 'StockMovement'],
      '临期与缺货风险 = Product.currentStock / safetyStock + StockBatch.expiryDate；按当前门店过滤，只读识别风险，不直接生成促销、采购或报废动作。',
      [`storeId=${context.storeId}`, 'deletedAt=null', `riskWindowDays=${riskWindowDays}`, `limit=${limit}`],
      items.length,
      undefined,
      ['处理方案和促销建议需要人工确认；本能力只提供风险清单和建议入口，不自动发券、不自动下发活动。'],
    );

    if (!items.length) {
      return this.noData('临期与报废风险清单', `当前门店 ${riskWindowDays} 天内没有临期、缺货或低库存风险商品。`, { items, requestedLimit: limit, riskWindowDays }, evidence);
    }

    return {
      status: 'success',
      title: '临期与报废风险清单',
      summary: `发现 ${items.length} 个库存风险商品；最高风险是 ${items[0].productName}，${items[0].riskReason}`,
      data: {
        items,
        requestedLimit: limit,
        riskWindowDays,
        riskCount: items.length,
      },
      evidence,
      actions: [
        { label: '查看库存风险', action: 'inventory:risk-open', riskLevel: 'low' },
        { label: '生成处理建议草稿', action: 'inventory:risk-draft-recommendation', riskLevel: 'medium' },
      ],
    };
  }

  private async listInventoryStockHealth(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const now = this.startOfDay(new Date());
    const thirtyDaysAgo = new Date(now.getTime() - 29 * DAY_MS);
    const sevenDaysAgo = new Date(now.getTime() - 6 * DAY_MS);
    const sevenDaysLater = new Date(now.getTime() + 7 * DAY_MS);
    const products = await (this.prisma as any).product.findMany({
      where: {
        storeId: context.storeId,
        deletedAt: null,
      },
      include: {
        category: { select: { name: true } },
        batches: {
          where: { stock: { gt: 0 } },
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
          take: 3,
        },
      },
      orderBy: [{ currentStock: 'asc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    const productIds = ((products ?? []) as any[]).map((product) => Number(product.id)).filter(Boolean);
    const [consumptionMovements, reservations, serviceTasks] = productIds.length
      ? await Promise.all([
          (this.prisma as any).stockMovement?.findMany
            ? (this.prisma as any).stockMovement.findMany({
                where: {
                  storeId: context.storeId,
                  productId: { in: productIds },
                  movementType: { in: ['sale_out', 'service_consume', 'service_consumption'] },
                  quantity: { lt: 0 },
                  occurredAt: { gte: thirtyDaysAgo, lt: new Date(now.getTime() + DAY_MS) },
                },
                select: { productId: true, quantity: true, occurredAt: true, movementType: true },
                take: 5000,
              })
            : [],
          (this.prisma as any).reservation?.findMany
            ? (this.prisma as any).reservation.findMany({
                where: {
                  storeId: context.storeId,
                  date: { gte: now, lt: sevenDaysLater },
                  status: { notIn: ['cancelled', 'no_show', 'completed'] },
                },
                select: { projectId: true },
                take: 2000,
              })
            : [],
          (this.prisma as any).serviceTask?.findMany
            ? (this.prisma as any).serviceTask.findMany({
                where: {
                  storeId: context.storeId,
                  appointmentTime: { gte: now, lt: sevenDaysLater },
                  status: { notIn: ['cancelled', 'completed'] },
                },
                select: { projectId: true },
                take: 2000,
              })
            : [],
        ])
      : [[], [], []];

    const consumptionByProduct = new Map<number, { consumed7Days: number; consumed30Days: number }>();
    for (const movement of (consumptionMovements ?? []) as any[]) {
      const productId = Number(movement.productId);
      if (!productId) continue;
      const quantity = Math.abs(this.toNumber(movement.quantity));
      const current = consumptionByProduct.get(productId) ?? { consumed7Days: 0, consumed30Days: 0 };
      current.consumed30Days += quantity;
      if (movement.occurredAt && new Date(movement.occurredAt).getTime() >= sevenDaysAgo.getTime()) current.consumed7Days += quantity;
      consumptionByProduct.set(productId, current);
    }

    const projectDemand = new Map<number, number>();
    for (const item of ([...(reservations ?? []), ...(serviceTasks ?? [])] as any[])) {
      const projectId = Number(item.projectId);
      if (!projectId) continue;
      projectDemand.set(projectId, (projectDemand.get(projectId) ?? 0) + 1);
    }

    const scheduledBomByProduct = new Map<number, number>();
    if (projectDemand.size && productIds.length && (this.prisma as any).projectBomItem?.findMany) {
      const bomItems = await (this.prisma as any).projectBomItem.findMany({
        where: {
          projectId: { in: [...projectDemand.keys()] },
          productId: { in: productIds },
        },
        select: { projectId: true, productId: true, standardQty: true },
      });
      for (const bomItem of (bomItems ?? []) as any[]) {
        const productId = Number(bomItem.productId);
        const multiplier = projectDemand.get(Number(bomItem.projectId)) ?? 0;
        if (!productId || multiplier <= 0) continue;
        scheduledBomByProduct.set(productId, (scheduledBomByProduct.get(productId) ?? 0) + this.toNumber(bomItem.standardQty) * multiplier);
      }
    }

    const items = ((products ?? []) as any[]).map((product) => {
      const currentStock = this.toNumber(product.currentStock);
      const safetyStock = this.toNumber(product.safetyStock);
      const costPrice = this.toNumber(product.costPrice);
      const stockValue = Number((currentStock * costPrice).toFixed(2));
      const nearestBatch = Array.isArray(product.batches) ? product.batches.find((batch: any) => batch.expiryDate) : null;
      const expiryDate = nearestBatch?.expiryDate ? new Date(nearestBatch.expiryDate) : null;
      const daysUntilExpiry = expiryDate ? Math.ceil((this.startOfDay(expiryDate).getTime() - now.getTime()) / DAY_MS) : null;
      const lowStock = safetyStock > 0 && currentStock < safetyStock;
      const outOfStock = currentStock <= 0;
      const expiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30;
      const statusLabel = outOfStock ? '缺货' : lowStock ? '低于安全库存' : expiringSoon ? '临期关注' : '正常';
      const unit = product.specUnit ?? product.unit ?? '';
      const consumption = consumptionByProduct.get(Number(product.id)) ?? { consumed7Days: 0, consumed30Days: 0 };
      const scheduledBomConsumption7Days = scheduledBomByProduct.get(Number(product.id)) ?? 0;
      const dailyConsumption30Days = consumption.consumed30Days / 30;
      const trendForecast7Days = dailyConsumption30Days * 7;
      const forecast7DaysConsumption = trendForecast7Days + scheduledBomConsumption7Days;
      const forecast30DaysConsumption = dailyConsumption30Days * 30 + scheduledBomConsumption7Days;
      const projectedShortage7Days = Math.max(0, forecast7DaysConsumption - currentStock);
      const recommendedReplenishmentQty = Math.max(0, safetyStock + forecast7DaysConsumption - currentStock);
      const turnoverRate30Days = currentStock > 0 ? consumption.consumed30Days / currentStock : consumption.consumed30Days > 0 ? null : 0;
      const daysOfSupply = dailyConsumption30Days > 0 ? currentStock / dailyConsumption30Days : null;
      const consumptionStatusLabel = projectedShortage7Days > 0
        ? '7天预计缺口'
        : daysOfSupply !== null && daysOfSupply <= 7
          ? '7天内可能耗尽'
          : consumption.consumed30Days > 0
            ? '有消耗记录'
            : '暂无消耗记录';
      return {
        productId: product.id,
        productName: product.name ?? `商品#${product.id}`,
        sku: product.sku ?? '',
        categoryName: product.category?.name ?? '未分类',
        currentStock,
        currentStockText: `${currentStock}${unit}`,
        safetyStock,
        safetyStockText: `${safetyStock}${unit}`,
        costPrice,
        costPriceText: this.formatMoney(costPrice),
        stockValue,
        stockValueText: this.formatMoney(stockValue),
        statusLabel,
        nearestExpiryDate: this.formatDate(expiryDate),
        daysUntilExpiry,
        consumed7Days: this.round(consumption.consumed7Days, 2),
        consumed7DaysText: `${this.round(consumption.consumed7Days, 2)}${unit}`,
        consumed30Days: this.round(consumption.consumed30Days, 2),
        consumed30DaysText: `${this.round(consumption.consumed30Days, 2)}${unit}`,
        dailyConsumption30Days: this.round(dailyConsumption30Days, 2),
        dailyConsumption30DaysText: `${this.round(dailyConsumption30Days, 2)}${unit}/天`,
        scheduledBomConsumption7Days: this.round(scheduledBomConsumption7Days, 2),
        scheduledBomConsumption7DaysText: `${this.round(scheduledBomConsumption7Days, 2)}${unit}`,
        forecast7DaysConsumption: this.round(forecast7DaysConsumption, 2),
        forecast7DaysConsumptionText: `${this.round(forecast7DaysConsumption, 2)}${unit}`,
        forecast30DaysConsumption: this.round(forecast30DaysConsumption, 2),
        forecast30DaysConsumptionText: `${this.round(forecast30DaysConsumption, 2)}${unit}`,
        turnoverRate30Days: turnoverRate30Days === null ? null : this.round(turnoverRate30Days, 2),
        turnoverRate30DaysText: turnoverRate30Days === null ? '无当前库存基数' : `${this.round(turnoverRate30Days, 2)}次/30天`,
        daysOfSupply: daysOfSupply === null ? null : this.round(daysOfSupply, 1),
        daysOfSupplyText: daysOfSupply === null ? '暂无消耗基准' : `${this.round(daysOfSupply, 1)}天`,
        projectedShortage7Days: this.round(projectedShortage7Days, 2),
        projectedShortage7DaysText: `${this.round(projectedShortage7Days, 2)}${unit}`,
        recommendedReplenishmentQty: this.round(recommendedReplenishmentQty, 2),
        recommendedReplenishmentText: `${this.round(recommendedReplenishmentQty, 2)}${unit}`,
        consumptionStatusLabel,
        formula: {
          turnoverRate30Days: '近30天消耗量 / 当前库存',
          daysOfSupply: '当前库存 / (近30天消耗量 / 30)',
          forecast7DaysConsumption: '近30天日均消耗 * 7 + 未来7天预约/待服务项目BOM标准耗材',
          recommendedReplenishmentQty: 'max(0, 安全库存 + 7天预测消耗 - 当前库存)',
        },
        riskReason: outOfStock
          ? '当前库存为 0 或更低，需要优先补货或核对库存。'
          : lowStock
            ? '当前库存低于安全库存线。'
            : projectedShortage7Days > 0
              ? `按近30天消耗和未来7天项目BOM预计缺口 ${this.round(projectedShortage7Days, 2)}${unit}。`
            : expiringSoon
              ? `最近批次 ${daysUntilExpiry} 天后到期。`
              : '暂无明显库存风险。',
      };
    });
    const totalStockValue = items.reduce((sum, item) => sum + item.stockValue, 0);
    const lowStockCount = items.filter((item) => item.statusLabel === '缺货' || item.statusLabel === '低于安全库存').length;
    const expiringCount = items.filter((item) => item.statusLabel === '临期关注').length;
    const projectedShortageCount = items.filter((item) => item.projectedShortage7Days > 0).length;
    const totalForecast7DaysConsumption = items.reduce((sum, item) => sum + item.forecast7DaysConsumption, 0);
    const totalScheduledBomConsumption7Days = items.reduce((sum, item) => sum + item.scheduledBomConsumption7Days, 0);
    const totalRecommendedReplenishmentQty = items.reduce((sum, item) => sum + item.recommendedReplenishmentQty, 0);
    const evidence = this.evidence(
      ['Product', 'StockBatch', 'StockMovement', 'ProjectBomItem'],
      '库存状态与消耗健康 = Product.currentStock / safetyStock / costPrice + StockBatch 最近到期批次 + 近30天 StockMovement 消耗 + 未来7天 Reservation/ServiceTask 对应 ProjectBomItem 标准耗材；只读不生成补货单。',
      [
        `storeId=${context.storeId}`,
        'deletedAt=null',
        `productLimit=${limit}`,
        `consumptionWindow=${this.formatDate(thirtyDaysAgo)} 至 ${this.formatDate(new Date(now.getTime() + DAY_MS))}`,
        `futureBomWindow=${this.formatDate(now)} 至 ${this.formatDate(sevenDaysLater)}`,
      ],
      items.length,
      undefined,
      [
        '周转率以当前库存作为库存基数，适合小门店快速问数；如需财务级周转率，应补充期初/期末平均库存。',
        '未来消耗预测只纳入未来7天已预约或待服务项目的 BOM 标准耗材，不自动创建采购、调拨或报废单。',
      ],
    );

    if (!items.length) {
      return this.noData('库存状态与消耗健康', '当前门店没有可用于库存问数的商品记录。', { items, requestedLimit: limit, totalStockValue: 0 }, evidence);
    }

    return {
      status: 'success',
      title: '库存状态与消耗健康',
      summary: `当前纳入 ${items.length} 个商品，库存金额约 ${this.formatMoney(totalStockValue)}；低库存/缺货 ${lowStockCount} 个，临期关注 ${expiringCount} 个，7天预测有缺口 ${projectedShortageCount} 个。`,
      data: {
        items,
        requestedLimit: limit,
        totalStockValue: Number(totalStockValue.toFixed(2)),
        totalStockValueText: this.formatMoney(totalStockValue),
        lowStockCount,
        expiringCount,
        projectedShortageCount,
        totalForecast7DaysConsumption: this.round(totalForecast7DaysConsumption, 2),
        totalScheduledBomConsumption7Days: this.round(totalScheduledBomConsumption7Days, 2),
        totalRecommendedReplenishmentQty: this.round(totalRecommendedReplenishmentQty, 2),
        formulaSummary: {
          turnoverRate30Days: '近30天消耗量 / 当前库存',
          daysOfSupply: '当前库存 / 近30天日均消耗',
          forecast7DaysConsumption: '近30天日均消耗 * 7 + 未来7天预约/待服务项目BOM标准耗材',
        },
      },
      evidence,
      actions: [{ label: '查看库存管理', action: 'inventory:open-products', riskLevel: 'low' }],
    };
  }

  private async listOrderRecords(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
    config: OrderRecordConfig,
  ): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const orderNo = this.extractOrderNo(args);
    const range = this.resolveQueryDateRange(args, orderNo ? 'all' : 'this_week');
    const where: Record<string, unknown> = {
      storeId: context.storeId,
      ...this.orderNoWhere(orderNo),
      ...this.createdAtWhere(range),
    };
    if (!orderNo) {
      where.OR = [
        ...(config.orderKinds?.length ? [{ orderKind: { in: config.orderKinds } }] : []),
        ...(config.itemTypes?.length ? [{ orderItems: { some: { itemType: { in: config.itemTypes } } } }] : []),
      ];
    }

    const orders = await (this.prisma as any).productOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: { orderBy: { id: 'asc' } },
        paymentRecords: { orderBy: { createdAt: 'asc' } },
        refundRecords: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = (orders as any[]).map((order) => this.mapOrderRecord(order));
    const totalNetAmount = items.reduce((sum, item) => sum + item.netAmount, 0);
    const evidence = this.evidence(
      ['ProductOrder', 'OrderItem', 'PaymentRecord', 'RefundRecord', 'Customer', 'Store'],
      config.metricDefinition,
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), orderNo ? `orderNo~${orderNo}` : `queryKey=${config.queryKey}`, `limit=${limit}`],
      items.length,
      range,
      ['只读已落库订单；如客户消费记录未同步，需要继续核对 ConsumptionRecord 来源链路。'],
    );

    if (!items.length) {
      return this.noData(config.title, orderNo ? `没有找到订单 ${orderNo}。` : `${range.label}没有匹配的${config.title}。`, { items, requestedLimit: limit, totalNetAmount: 0, timeRange: this.serializeRange(range) }, evidence);
    }

    return {
      status: 'success',
      title: config.title,
      summary: `${orderNo ? `订单 ${orderNo}` : range.label}找到 ${items.length} 条${config.title}，合计实收 ${this.formatMoney(totalNetAmount)}。`,
      data: {
        items,
        requestedLimit: limit,
        totalNetAmount: Number(totalNetAmount.toFixed(2)),
        totalNetAmountText: this.formatMoney(totalNetAmount),
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看订单管理', action: 'order:open-management', riskLevel: 'low' }],
    };
  }

  private async listCardPackageRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveQueryDateRange(args, 'this_week');
    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: { storeId: context.storeId },
        ...this.createdAtWhere(range),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
        card: { select: { id: true, name: true, totalTimes: true } },
        operator: { select: { id: true, name: true, username: true } },
        sourceOrder: { select: { id: true, orderNo: true, payMethod: true, status: true, netAmount: true, totalAmount: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = (cards as any[]).map((card) => ({
      customerCardId: card.id,
      sourceOrderNo: card.sourceOrder?.orderNo ?? '',
      cardName: card.cardName ?? card.card?.name ?? `次卡#${card.cardId}`,
      customerName: card.customer?.name ?? card.customerName ?? `客户#${card.customerId}`,
      customerPhone: card.customer?.phone ?? '',
      storeName: card.customer?.store?.name ?? '',
      totalTimes: this.toNumber(card.totalTimes),
      remainingTimes: this.toNumber(card.remainingTimes),
      paidAmount: this.toNumber(card.paidAmount ?? card.sourceOrder?.netAmount ?? card.sourceOrder?.totalAmount),
      paidAmountText: this.formatMoney(this.toNumber(card.paidAmount ?? card.sourceOrder?.netAmount ?? card.sourceOrder?.totalAmount)),
      giftTimes: this.toNumber(card.giftTimes),
      operatorName: card.operator?.name ?? card.operator?.username ?? '未记录',
      statusLabel: this.cardStatusLabel(card.status),
      createdAt: this.formatDateTime(card.createdAt),
      expiryDate: this.formatDate(card.expiryDate),
    }));
    const totalPaidAmount = items.reduce((sum, item) => sum + item.paidAmount, 0);
    const evidence = this.evidence(
      ['CustomerCard', 'Card', 'ProductOrder', 'Customer', 'Store', 'User'],
      '次卡开卡订单 = CustomerCard 来源开卡记录，关联 sourceOrder 可追溯原始收银订单。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), `limit=${limit}`],
      items.length,
      range,
      ['只回答次卡开卡/购买记录，不回答核销服务流水。'],
    );
    if (!items.length) return this.noData('次卡开卡订单', `${range.label}没有次卡开卡订单。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '次卡开卡订单',
      summary: `${range.label}找到 ${items.length} 条次卡开卡订单，合计实付 ${this.formatMoney(totalPaidAmount)}。`,
      data: { items, requestedLimit: limit, totalPaidAmount, totalPaidAmountText: this.formatMoney(totalPaidAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡开卡管理', action: 'card-package:open-orders', riskLevel: 'low' }],
    };
  }

  private async lookupCardPackageStatus(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const keyword = this.extractCustomerKeyword(args);
    const evidence = this.evidence(
      ['CustomerCard', 'Card', 'Customer', 'CardUsageRecord'],
      '客户次卡状态 = CustomerCard 当前余次、总次数、有效期和状态；只读查询，不执行核销扣次。',
      [`storeId=${context.storeId}`, keyword ? `customer~${keyword}` : 'customer=missing', `limit=${limit}`],
      0,
      undefined,
      ['必须有客户名、手机号或客户 ID 才查询具体客户次卡，避免把全店客户卡片误暴露给当前问题。'],
    );
    if (!keyword) {
      return this.noData('客户次卡状态', '需要提供客户名、手机号或客户 ID，才能确认这位客人的次卡余量和有效期。', { items: [], requestedLimit: limit }, evidence);
    }

    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: {
          storeId: context.storeId,
          ...this.customerKeywordWhere(keyword),
        },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
        card: { select: { id: true, name: true, totalTimes: true } },
        operator: { select: { id: true, name: true, username: true } },
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const now = this.startOfDay(new Date());
    const items = ((cards ?? []) as any[]).map((card) => {
      const expiryDate = card.expiryDate ? new Date(card.expiryDate) : null;
      const daysUntilExpiry = expiryDate ? Math.ceil((this.startOfDay(expiryDate).getTime() - now.getTime()) / DAY_MS) : null;
      return {
        customerCardId: card.id,
        customerName: card.customer?.name ?? card.customerName ?? `客户#${card.customerId}`,
        customerPhone: card.customer?.phone ?? '',
        cardName: card.cardName ?? card.card?.name ?? `次卡#${card.cardId}`,
        totalTimes: this.toNumber(card.totalTimes ?? card.card?.totalTimes),
        remainingTimes: this.toNumber(card.remainingTimes),
        usedTimes: Math.max(0, this.toNumber(card.totalTimes ?? card.card?.totalTimes) - this.toNumber(card.remainingTimes)),
        expiryDate: this.formatDate(card.expiryDate),
        daysUntilExpiry,
        daysUntilExpiryText: daysUntilExpiry === null ? '未设置' : daysUntilExpiry >= 0 ? `剩余 ${daysUntilExpiry} 天` : `已过期 ${Math.abs(daysUntilExpiry)} 天`,
        statusLabel: this.cardStatusLabel(card.status),
        operatorName: card.operator?.name ?? card.operator?.username ?? '未记录',
        createdAt: this.formatDateTime(card.createdAt),
      };
    });
    const updatedEvidence = { ...evidence, sampleSize: items.length };
    if (!items.length) {
      return this.noData('客户次卡状态', `没有找到客户 ${keyword} 的次卡状态记录。`, { items, requestedLimit: limit }, updatedEvidence);
    }
    const activeCount = items.filter((item) => item.remainingTimes > 0 && item.statusLabel === '可用').length;
    return {
      status: 'success',
      title: '客户次卡状态',
      summary: `客户 ${items[0].customerName} 找到 ${items.length} 张次卡，其中 ${activeCount} 张仍可用；最近到期：${items[0].cardName}，${items[0].daysUntilExpiryText}。`,
      data: { items, requestedLimit: limit },
      evidence: updatedEvidence,
      actions: [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }],
    };
  }

  private async lookupCustomerCouponStatus(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const keyword = this.extractCustomerKeyword(args);
    const evidence = this.evidence(
      ['Customer', 'Promotion', 'ProductOrder'],
      '客户优惠券状态 = 结合客户订单中已使用权益和当前权益资产库存识别；当前没有独立 CustomerCoupon 领取流水时会明确说明数据缺口。',
      [`storeId=${context.storeId}`, keyword ? `customer~${keyword}` : 'customer=missing', `limit=${limit}`],
      0,
      undefined,
      ['没有客户条件时不返回全店客户券信息；若未接入客户券领取表，只能确认已使用权益和可发权益库存。'],
    );
    if (!keyword) {
      return this.noData('客户优惠券状态', '需要提供客户名、手机号或客户 ID，才能查询这位客人是否有未核销优惠券。', { items: [], requestedLimit: limit, dataGap: 'missing_customer_context' }, evidence);
    }

    const customers = await (this.prisma as any).customer.findMany({
      where: {
        storeId: context.storeId,
        ...this.customerKeywordWhere(keyword),
      },
      select: { id: true, name: true, phone: true },
      take: 5,
    });
    const customerIds = ((customers ?? []) as any[]).map((customer) => Number(customer.id));
    if (!customerIds.length) {
      return this.noData('客户优惠券状态', `没有找到客户 ${keyword}。`, { items: [], requestedLimit: limit }, evidence);
    }

    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: context.storeId,
        customerId: { in: customerIds },
        OR: [{ couponId: { not: null } }, { promotionId: { not: null } }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const promotions = await (this.prisma as any).promotion.findMany({
      where: {
        OR: [{ storeId: context.storeId }, { storeId: null }],
        status: { in: ['active', 'published', 'enabled'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const promotionMap = new Map(((promotions ?? []) as any[]).map((promotion) => [Number(promotion.id), promotion]));
    const usedItems = ((orders ?? []) as any[]).map((order) => {
      const promotion = promotionMap.get(Number(order.promotionId)) ?? null;
      return {
        customerName: (customers as any[]).find((customer) => Number(customer.id) === Number(order.customerId))?.name ?? order.customerName ?? `客户#${order.customerId}`,
        promotionName: promotion?.name ?? order.discountSource ?? `权益#${order.promotionId ?? order.couponId}`,
        statusLabel: '已使用',
        usedOrderNo: order.orderNo,
        usedAt: this.formatDateTime(order.createdAt),
        validUntil: '',
      };
    });
    const availableItems = ((promotions ?? []) as any[])
      .filter((promotion) => this.toNumber(promotion.issuedCount) > this.toNumber(promotion.usedCount))
      .slice(0, Math.max(0, limit - usedItems.length))
      .map((promotion) => ({
        customerName: (customers as any[])[0]?.name ?? keyword,
        promotionName: promotion.name,
        statusLabel: '可发放库存',
        usedOrderNo: '',
        usedAt: '',
        validUntil: promotion.endAt ? this.formatDate(promotion.endAt) : promotion.validDays ? `领取后 ${promotion.validDays} 天` : '未设置',
      }));
    const items = [...usedItems, ...availableItems].slice(0, limit);
    const updatedEvidence = { ...evidence, sampleSize: items.length };
    if (!items.length) {
      return this.noData('客户优惠券状态', `客户 ${keyword} 暂未找到已使用权益或可用权益库存；如已接入客户券领取表，需要补充 CustomerCoupon 数据源。`, { items, requestedLimit: limit, dataGap: 'missing_customer_coupon_source' }, updatedEvidence);
    }
    return {
      status: 'success',
      title: '客户优惠券状态',
      summary: `客户 ${items[0].customerName} 找到 ${usedItems.length} 条已使用权益记录，当前可参考 ${availableItems.length} 个可发权益库存；未接入客户券领取流水时不能断言“已领取未核销”。`,
      data: { items, requestedLimit: limit, dataGap: 'customer_coupon_ledger_not_detected' },
      evidence: updatedEvidence,
      actions: [{ label: '查看权益资产库', action: 'marketing:promotions', riskLevel: 'low' }],
    };
  }

  private async listPaymentRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const orderNo = this.extractOrderNo(args);
    const range = this.resolveQueryDateRange(args, orderNo ? 'all' : 'this_week');
    const payments = await (this.prisma as any).paymentRecord.findMany({
      where: {
        order: {
          storeId: context.storeId,
          ...this.orderNoWhere(orderNo),
        },
        ...this.paymentTimeWhere(range),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            orderKind: true,
            customerName: true,
            status: true,
            totalAmount: true,
            netAmount: true,
            customer: { select: { id: true, name: true, phone: true } },
            store: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const items = (payments as any[]).map((payment) => ({
      paymentId: payment.id,
      paymentNo: payment.paymentNo,
      orderNo: payment.order?.orderNo ?? '',
      orderKindLabel: this.orderKindLabel(payment.order?.orderKind),
      customerName: payment.order?.customer?.name ?? payment.order?.customerName ?? '',
      storeName: payment.order?.store?.name ?? '',
      method: payment.method,
      methodLabel: this.payMethodLabel(payment.method),
      amount: this.toNumber(payment.amount),
      amountText: this.formatMoney(this.toNumber(payment.amount)),
      statusLabel: this.paymentStatusLabel(payment.status),
      paidAt: this.formatDateTime(payment.paidAt ?? payment.createdAt),
      orderNetAmountText: this.formatMoney(this.toNumber(payment.order?.netAmount ?? payment.order?.totalAmount)),
      transactionNo: payment.transactionNo ?? '',
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const evidence = this.evidence(
      ['PaymentRecord', 'ProductOrder', 'Customer', 'Store'],
      '收银支付流水 = PaymentRecord 已落库支付记录，按订单门店授权过滤，可用于核对订单是否进入财务。',
      [`storeId=${context.storeId}`, this.rangeFilterText('paidAt/createdAt', range), orderNo ? `orderNo~${orderNo}` : 'paymentRecord', `limit=${limit}`],
      items.length,
      range,
      ['支付流水回答收银是否入账；订单项目/商品明细需查对应订单能力。'],
    );
    if (!items.length) return this.noData('收银支付流水', orderNo ? `没有找到订单 ${orderNo} 对应的支付流水。` : `${range.label}没有收银支付流水。`, { items, requestedLimit: limit, totalAmount: 0, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '收银支付流水',
      summary: `${orderNo ? `订单 ${orderNo}` : range.label}找到 ${items.length} 条支付流水，合计 ${this.formatMoney(totalAmount)}。`,
      data: { items, requestedLimit: limit, totalAmount, totalAmountText: this.formatMoney(totalAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
    };
  }

  private async listCardUsageRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveQueryDateRange(args, 'this_week');
    const records = await (this.prisma as any).cardUsageRecord.findMany({
      where: {
        storeId: context.storeId,
        verifiedAt: { gte: range.start, lt: range.end },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true, userId: true } },
        device: { select: { id: true, name: true, deviceCode: true } },
        sourceOrder: { select: { id: true, orderNo: true } },
      },
      orderBy: { verifiedAt: 'desc' },
      take: limit,
    });

    const items = (records as any[]).map((record) => {
      const operatorName = record.operator?.name ?? record.operator?.username ?? record.beautician?.name ?? '未记录';
      const entrySourceLabel = record.device ? '智能终端' : record.operator ? '管理端' : '未记录';
      return {
        usageId: record.id,
        sourceOrderNo: record.sourceOrder?.orderNo ?? '',
        cardName: record.cardName ?? `次卡#${record.cardId}`,
        customerName: record.customer?.name ?? record.customerName ?? `客户#${record.customerId}`,
        customerPhone: record.customer?.phone ?? '',
        projectName: record.projectName ?? `项目#${record.projectId}`,
        storeName: record.store?.name ?? `门店#${record.storeId}`,
        times: this.toNumber(record.times),
        timesText: `${this.toNumber(record.times)} 次`,
        remainingTimes: this.toNumber(record.remainingTimes),
        remainingTimesText: `${this.toNumber(record.remainingTimes)} 次`,
        recognizedAmount: this.toNumber(record.recognizedAmount),
        recognizedAmountText: this.formatMoney(this.toNumber(record.recognizedAmount)),
        operatorName,
        beauticianName: record.beautician?.name ?? '',
        entrySourceLabel,
        deviceName: record.device?.name ?? record.device?.deviceCode ?? '',
        verifiedAt: this.formatDateTime(record.verifiedAt),
      };
    });
    const totalRecognizedAmount = items.reduce((sum, item) => sum + item.recognizedAmount, 0);
    const evidence = this.evidence(
      ['CardUsageRecord', 'CustomerCard', 'Card', 'Project', 'Customer', 'User', 'Beautician', 'TerminalDevice'],
      '次卡核销记录 = CardUsageRecord 已落库服务核销流水；管理端核销看 operator，智能终端核销看 device。',
      [`storeId=${context.storeId}`, this.rangeFilterText('verifiedAt', range), `limit=${limit}`],
      items.length,
      range,
      ['核销入口不能只看终端设备；管理端核销也必须纳入统计。'],
    );
    if (!items.length) return this.noData('次卡核销记录', `${range.label}没有次卡核销记录。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '次卡核销记录',
      summary: `${range.label}找到 ${items.length} 条次卡核销记录，识别收入 ${this.formatMoney(totalRecognizedAmount)}。`,
      data: { items, requestedLimit: limit, totalRecognizedAmount, totalRecognizedAmountText: this.formatMoney(totalRecognizedAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }],
    };
  }

  private async listCardPackageInactiveCustomers(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveQueryDateRange(args, 'last_90_days');
    const inactiveThresholdDays = this.toNumber((args.filters as any)?.inactiveDays ?? 30) || 30;
    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: { storeId: context.storeId },
        remainingTimes: { gt: 0 },
        status: { in: ['active', 'enabled', 'available'] },
        createdAt: { lt: new Date(Date.now() - inactiveThresholdDays * DAY_MS) },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
        card: { select: { id: true, name: true, totalTimes: true } },
        usageRecords: { orderBy: { verifiedAt: 'desc' }, take: 1, select: { verifiedAt: true, projectName: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.max(limit * 3, 50),
    });

    const now = this.startOfDay(new Date());
    const items = ((cards ?? []) as any[])
      .map((card) => {
        const lastUsedAtDate = card.usageRecords?.[0]?.verifiedAt ? new Date(card.usageRecords[0].verifiedAt) : null;
        const baseDate = lastUsedAtDate ?? new Date(card.createdAt);
        const inactiveDays = Math.max(0, Math.floor((now.getTime() - this.startOfDay(baseDate).getTime()) / DAY_MS));
        return {
          customerCardId: card.id,
          customerName: card.customer?.name ?? `客户#${card.customerId}`,
          customerPhone: card.customer?.phone ?? '',
          cardName: card.cardName ?? card.card?.name ?? `次卡#${card.cardId}`,
          remainingTimes: this.toNumber(card.remainingTimes),
          totalTimes: this.toNumber(card.totalTimes ?? card.card?.totalTimes),
          lastUsedAt: lastUsedAtDate ? this.formatDate(lastUsedAtDate) : '未核销',
          lastProjectName: card.usageRecords?.[0]?.projectName ?? '',
          inactiveDays,
          createdAt: this.formatDate(card.createdAt),
          expiryDate: this.formatDate(card.expiryDate),
        };
      })
      .filter((item) => item.inactiveDays >= inactiveThresholdDays)
      .sort((a, b) => b.inactiveDays - a.inactiveDays)
      .slice(0, limit);
    const evidence = this.evidence(
      ['CustomerCard', 'CardUsageRecord', 'Customer', 'Card'],
      '次卡沉睡客户 = 仍有余次的 CustomerCard，结合最近 CardUsageRecord 判断超过阈值未使用。',
      [`storeId=${context.storeId}`, `inactiveDays>=${inactiveThresholdDays}`, `limit=${limit}`],
      items.length,
      range,
      ['名单只用于人工跟进参考，不自动下发触达、不执行核销扣次。'],
    );
    if (!items.length) {
      return this.noData('次卡沉睡客户名单', `没有找到超过 ${inactiveThresholdDays} 天未使用且仍有余次的次卡客户。`, { items, requestedLimit: limit, inactiveThresholdDays }, evidence);
    }
    return {
      status: 'success',
      title: '次卡沉睡客户名单',
      summary: `找到 ${items.length} 位买了次卡但超过 ${inactiveThresholdDays} 天未使用的客户，建议按未使用天数优先跟进。`,
      data: { items, requestedLimit: limit, inactiveThresholdDays, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }],
    };
  }

  private async listCommissionRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveQueryDateRange(args, 'this_week');
    const records = await (this.prisma as any).commissionRecord.findMany({
      where: {
        storeId: context.storeId,
        createdAt: { gte: range.start, lt: range.end },
      },
      include: {
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true, orderKind: true } },
        orderItem: { select: { id: true, name: true, itemType: true } },
        rule: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = (records as any[]).map((record) => ({
      commissionId: record.id,
      staffName: record.staffUser?.name ?? record.staffUser?.username ?? record.beautician?.name ?? '未绑定人员',
      staffUserId: record.staffUserId ?? '',
      beauticianName: record.beautician?.name ?? '',
      orderNo: record.order?.orderNo ?? '',
      orderKindLabel: this.orderKindLabel(record.order?.orderKind),
      sourceTypeLabel: this.sourceTypeLabel(record.sourceType),
      itemName: record.orderItem?.name ?? '',
      ruleName: record.rule?.name ?? '',
      sourceAmount: this.toNumber(record.sourceAmount),
      sourceAmountText: this.formatMoney(this.toNumber(record.sourceAmount)),
      rateText: `${Number(this.toNumber(record.rate) * 100).toFixed(2)}%`,
      amount: this.toNumber(record.amount),
      amountText: this.formatMoney(this.toNumber(record.amount)),
      statusLabel: this.commissionStatusLabel(record.status),
      settleMonth: record.settleMonth ?? '',
      createdAt: this.formatDateTime(record.createdAt),
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const evidence = this.evidence(
      ['CommissionRecord', 'User', 'Beautician', 'CommissionRule', 'ProductOrder', 'OrderItem', 'CardUsageRecord'],
      '员工提成流水 = CommissionRecord，主体字段 staffUserId；beauticianId 仅用于历史兼容或技师关联。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), `limit=${limit}`],
      items.length,
      range,
      ['员工人效和提成必须与系统用户统一，不能只按历史美容师表解释。'],
    );
    if (!items.length) return this.noData('员工提成流水', `${range.label}没有员工提成流水。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '员工提成流水',
      summary: `${range.label}找到 ${items.length} 条员工提成流水，合计提成 ${this.formatMoney(totalAmount)}。`,
      data: { items, requestedLimit: limit, totalAmount, totalAmountText: this.formatMoney(totalAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看提成明细', action: 'finance:commission-records', riskLevel: 'low' }],
    };
  }

  private async listCustomerConsumptionRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveQueryDateRange(args, 'this_week');
    const records = await (this.prisma as any).consumptionRecord.findMany({
      where: {
        customer: { storeId: context.storeId },
        consumeTime: { gte: range.start, lt: range.end },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, storeId: true, store: { select: { id: true, name: true } } } },
      },
      orderBy: { consumeTime: 'desc' },
      take: limit,
    });
    const items = (records as any[]).map((record) => ({
      consumptionId: record.id,
      customerName: record.customer?.name ?? `客户#${record.customerId}`,
      customerPhone: record.customer?.phone ?? '',
      storeName: record.customer?.store?.name ?? '',
      consumeType: record.consumeType,
      consumeTypeLabel: this.consumeTypeLabel(record.consumeType),
      consumeContentText: this.formatConsumeContent(record.consumeContent),
      payMethodLabel: this.payMethodLabel(record.payMethod),
      amount: this.toNumber(record.amount),
      amountText: this.formatMoney(this.toNumber(record.amount)),
      campaign: record.campaign ?? '',
      consumeTime: this.formatDateTime(record.consumeTime),
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const evidence = this.evidence(
      ['ConsumptionRecord', 'Customer', 'ProductOrder', 'CardUsageRecord', 'CustomerCard'],
      '客户消费记录 = ConsumptionRecord 客户视角消费流水；用于核对订单、收银、核销是否同步进客户画像。',
      [`storeId=${context.storeId}`, this.rangeFilterText('consumeTime', range), `limit=${limit}`],
      items.length,
      range,
      ['如果订单存在但 ConsumptionRecord 缺失，说明同步链路存在断点，不能把订单明细硬当成客户消费记录。'],
    );
    if (!items.length) return this.noData('客户消费记录', `${range.label}没有客户消费记录。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '客户消费记录',
      summary: `${range.label}找到 ${items.length} 条客户消费记录，合计消费 ${this.formatMoney(totalAmount)}。`,
      data: { items, requestedLimit: limit, totalAmount, totalAmountText: this.formatMoney(totalAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看客户消费记录', action: 'customer:consumption-records', riskLevel: 'low' }],
    };
  }

  private mapOrderRecord(order: any) {
    const totalDiscountAmount = this.toNumber(order.totalDiscountAmount ?? order.orderDiscountAmount ?? order.itemDiscountAmount);
    const netAmount = this.toNumber(order.netAmount ?? order.totalAmount);
    const refundAmount = (order.refundRecords ?? []).reduce((sum: number, refund: any) => sum + this.toNumber(refund.amount), 0);
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      orderKind: order.orderKind,
      orderKindLabel: this.orderKindLabel(order.orderKind),
      customerName: order.customer?.name ?? order.customerName ?? '',
      customerPhone: order.customer?.phone ?? '',
      storeName: order.store?.name ?? `门店#${order.storeId}`,
      itemSummary: this.describeOrderItems(order),
      itemCount: Array.isArray(order.orderItems) && order.orderItems.length ? order.orderItems.length : this.countItemsJson(order.items),
      totalAmount: this.toNumber(order.totalAmount),
      totalAmountText: this.formatMoney(this.toNumber(order.totalAmount)),
      netAmount,
      netAmountText: this.formatMoney(netAmount),
      discountAmount: totalDiscountAmount,
      discountAmountText: this.formatMoney(totalDiscountAmount),
      refundAmount,
      refundAmountText: this.formatMoney(refundAmount),
      payMethodLabel: this.payMethodLabel(order.payMethod),
      statusLabel: this.orderStatusLabel(order.status),
      source: order.source ?? '',
      createdAt: this.formatDateTime(order.createdAt),
      remark: order.remark ?? '',
    };
  }

  private describeOrderItems(order: any) {
    const orderItems = Array.isArray(order.orderItems) ? order.orderItems : [];
    if (orderItems.length) {
      return orderItems
        .slice(0, 4)
        .map((item: any) => `${item.name ?? item.itemName ?? '明细'} x${this.toNumber(item.quantity) || 1}`)
        .join('；');
    }
    const items = Array.isArray(order.items) ? order.items : [];
    return items
      .slice(0, 4)
      .map((item: any) => `${item.name ?? item.productName ?? item.projectName ?? '明细'} x${this.toNumber(item.quantity) || 1}`)
      .join('；') || '-';
  }

  private countItemsJson(items: unknown) {
    return Array.isArray(items) ? items.length : 0;
  }

  private formatConsumeContent(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
      try {
        return this.formatConsumeContent(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    if (Array.isArray(value)) {
      return value.map((item: unknown) => this.formatConsumeContent(item)).filter(Boolean).join('；') || '-';
    }
    if (typeof value === 'object') {
      const object = value as Record<string, any>;
      const names = [
        object.projectName,
        object.productName,
        object.cardName,
        object.serviceName,
        object.result,
        Array.isArray(object.consumptionItems)
          ? object.consumptionItems.map((item: any) => `${item.name ?? item.productName ?? item.projectName ?? '项目'} x${item.quantity ?? 1}`).join('；')
          : '',
      ].filter(Boolean);
      return names.join('；') || '-';
    }
    return String(value);
  }

  private filterValue(args: Record<string, unknown>, key: string) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    return filters[key] ?? args[key];
  }

  private async findCustomerForCustomerApp(args: Record<string, unknown>, context: AgentToolExecutionContext) {
    const keyword = this.extractCustomerKeyword(args);
    const id = this.toPositiveInt(this.filterValue(args, 'customerId') ?? args.customerId ?? args.id);
    const where: Record<string, unknown> = {
      storeId: context.storeId,
      deletedAt: null,
      ...(id ? { id } : keyword ? this.customerKeywordWhere(keyword) : {}),
    };
    if (!id && !keyword) return null;
    return (this.prisma as any).customer.findFirst({
      where,
      include: {
        store: { select: { id: true, name: true } },
        healthProfile: true,
        customerAppIdentities: { orderBy: { lastLoginAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private toCustomerCardRow(card: any) {
    return {
      id: card.id,
      customerId: card.customerId,
      customerName: card.customer?.name,
      phone: card.customer?.phone,
      memberLevel: card.customer?.memberLevel,
      cardId: card.cardId,
      cardName: card.cardName ?? card.card?.name,
      totalTimes: this.toNumber(card.totalTimes),
      remainingTimes: this.toNumber(card.remainingTimes),
      paidAmount: this.toNumber(card.paidAmount),
      paidAmountText: this.formatMoney(this.toNumber(card.paidAmount)),
      expiryDate: this.formatDate(card.expiryDate),
      status: card.remainingTimes <= 0 ? 'used_up' : card.expiryDate && card.expiryDate < new Date() ? 'expired' : card.status,
      createdAt: this.formatDateTime(card.createdAt),
    };
  }

  private toConsumptionRecordRow(record: any, customer?: any) {
    return {
      id: record.id,
      customerId: record.customerId,
      customerName: customer?.name ?? record.customer?.name,
      phone: customer?.phone ?? record.customer?.phone,
      consumeType: record.consumeType,
      consumeContent: this.formatConsumeContent(record.consumeContent),
      payMethod: record.payMethod,
      amount: this.toNumber(record.amount),
      amountText: this.formatMoney(this.toNumber(record.amount)),
      campaign: record.campaign,
      consumeTime: this.formatDateTime(record.consumeTime),
    };
  }

  private toReservationRow(reservation: any, customer?: any) {
    return {
      id: reservation.id,
      storeId: reservation.storeId,
      storeName: reservation.store?.name,
      customerId: reservation.customerId,
      customerName: customer?.name ?? reservation.customer?.name,
      projectId: reservation.projectId,
      projectName: reservation.project?.name,
      beauticianId: reservation.beauticianId,
      beauticianName: reservation.beautician?.name,
      date: this.formatDate(reservation.date),
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      status: reservation.status,
      createdAt: this.formatDateTime(reservation.createdAt),
    };
  }

  private toPositiveInt(input: unknown) {
    const value = Number(input);
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  private maxDate(values: unknown[]) {
    const timestamps = values
      .filter(Boolean)
      .map((value) => new Date(value as any).getTime())
      .filter((value) => Number.isFinite(value));
    return timestamps.length ? new Date(Math.max(...timestamps)) : undefined;
  }

  private buildCustomerProfileBehaviorRows(customers: any[], consumptionRecords: any[], now: Date) {
    const recordsByCustomer = new Map<number, any[]>();
    for (const record of consumptionRecords) {
      if (!recordsByCustomer.has(record.customerId)) recordsByCustomer.set(record.customerId, []);
      recordsByCustomer.get(record.customerId)!.push(record);
    }

    return [...customers]
      .sort((a, b) => this.toNumber(b.totalSpent) - this.toNumber(a.totalSpent) || this.toNumber(a.id) - this.toNumber(b.id))
      .map((customer) => {
        const records = recordsByCustomer.get(customer.id) ?? [];
        const freqPerMonth = this.toNumber(customer.visitCount) / this.monthsSinceDate(customer.createdAt, now);
        const visitFrequency =
          freqPerMonth >= 8
            ? '每周2次'
            : freqPerMonth >= 4
              ? '每周1次'
              : freqPerMonth >= 2
                ? '每月2-3次'
                : freqPerMonth >= 1
                  ? '每月1次'
                  : this.toNumber(customer.visitCount) <= 2
                    ? '首次消费'
                    : '偶尔到店';
        const avgSpend = this.toNumber(customer.visitCount) > 0
          ? Math.round(this.toNumber(customer.totalSpent) / this.toNumber(customer.visitCount))
          : 0;
        const typeCounts: Record<string, number> = {};
        for (const record of records) {
          const key = String(record.consumeType || '面部护理');
          typeCounts[key] = (typeCounts[key] ?? 0) + 1;
        }
        const preferredService = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '面部护理';
        const promoCount = records.filter((record) => record.campaign && record.campaign !== '无').length;
        const promoSensitivity = records.length ? Math.round((promoCount / records.length) * 100) : 50;
        const repurchase = this.toNumber(customer.visitCount) > 1 ? Math.min(95, 50 + this.toNumber(customer.visitCount)) : 0;
        const loyalty = Math.min(
          99,
          Math.round(
            ((this.scoreProfileRecency(customer.lastVisitDate, now) +
              this.scoreProfileFrequency(this.toNumber(customer.visitCount), customer.createdAt, now)) /
              10) *
              100,
          ),
        );
        const monthCounts = [0, 0, 0, 0];
        for (const record of records) {
          const date = record.consumeTime instanceof Date ? record.consumeTime : new Date(record.consumeTime);
          const month = Number.isNaN(date.getTime()) ? 0 : date.getMonth() + 1;
          if (!month) continue;
          if (month <= 3) monthCounts[0]++;
          else if (month <= 6) monthCounts[1]++;
          else if (month <= 9) monthCounts[2]++;
          else monthCounts[3]++;
        }
        const seasons = ['春季高峰', '夏季活跃', '秋季偏好', '冬季偏好'];
        const maxQuarter = monthCounts.indexOf(Math.max(...monthCounts));

        return {
          customerId: customer.id,
          name: customer.name,
          segment: this.classifyProfileSegment(customer, now),
          skinType: this.classifyProfileSkin(customer, customer.healthProfile),
          visitFrequency,
          avgSpend: this.formatPlainCurrency(avgSpend),
          preferredService,
          promotionSensitivity: `${promoSensitivity}%`,
          repurchaseRate: `${repurchase}%`,
          loyalty: `${loyalty}%`,
          seasonalTrend: records.length >= 3 ? seasons[maxQuarter] : '待观察',
        };
      });
  }

  private daysSinceDate(value: string | Date | null | undefined, now: Date) {
    if (!value) return 9999;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 9999;
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
  }

  private monthsSinceDate(value: string | Date | null | undefined, now: Date) {
    const days = this.daysSinceDate(value, now);
    if (days >= 9999) return 12;
    return Math.max(1, Math.floor(days / 30));
  }

  private scoreProfileRecency(lastVisitDate: string | Date | null | undefined, now: Date) {
    const days = this.daysSinceDate(lastVisitDate, now);
    if (days <= 14) return 5;
    if (days <= 30) return 4;
    if (days <= 60) return 3;
    if (days <= 120) return 2;
    if (days <= 365) return 1;
    return 0;
  }

  private scoreProfileFrequency(visitCount: number, createdAt: string | Date | null | undefined, now: Date) {
    const freq = this.toNumber(visitCount) / this.monthsSinceDate(createdAt, now);
    if (freq >= 4) return 5;
    if (freq >= 2) return 4;
    if (freq >= 1) return 3;
    if (freq >= 0.5) return 2;
    if (freq > 0) return 1;
    return 0;
  }

  private scoreProfileMonetary(totalSpent: number) {
    const amount = this.toNumber(totalSpent);
    if (amount >= 50000) return 5;
    if (amount >= 20000) return 4;
    if (amount >= 8000) return 3;
    if (amount >= 3000) return 2;
    if (amount > 0) return 1;
    return 0;
  }

  private classifyProfileSegment(customer: any, now: Date) {
    const recency = this.scoreProfileRecency(customer.lastVisitDate, now);
    const frequency = this.scoreProfileFrequency(this.toNumber(customer.visitCount), customer.createdAt, now);
    const monetary = this.scoreProfileMonetary(this.toNumber(customer.totalSpent));
    const registeredDays = this.daysSinceDate(customer.createdAt, now);

    if (registeredDays <= 90 || this.toNumber(customer.visitCount) <= 2) return '新客户';
    if (recency <= 1 || (recency <= 2 && frequency <= 1)) return '流失风险客户';
    if (recency >= 4 && frequency >= 3 && monetary >= 4) return '高价值客户';
    if (recency >= 3 && this.toNumber(customer.age ?? 30) < 35 && monetary <= 3) return '潜在价值客户';
    return '稳定客户';
  }

  private classifyProfileSkin(customer: any, healthProfile?: any) {
    const values = [
      healthProfile?.skinType,
      customer.skinType,
      customer.skinCondition,
      ...(Array.isArray(customer.tags) ? customer.tags : []),
      healthProfile?.skinStatus,
      healthProfile?.mainProblems,
    ].filter(Boolean).join(' ');

    if (!values) return '未分类';
    if ((values.includes('干') || values.includes('缺水') || values.includes('干纹')) && !values.includes('混')) return '干性肌肤';
    if ((values.includes('油') || values.includes('出油') || values.includes('痘')) && !values.includes('混')) return '油性肌肤';
    if (values.includes('敏感') || values.includes('泛红') || values.includes('过敏') || values.includes('红血丝')) return '敏感肌肤';
    if (values.includes('混合') || values.includes('混干') || values.includes('混油') || values.includes('T区')) return '混合肌肤';
    if (values.includes('中性') || values.includes('水油平衡') || values.includes('状态良好')) return '中性肌肤';
    return '未分类';
  }

  private noData(title: string, summary: string, data: unknown, evidence: AgentEvidence): AgentToolResult {
    return { status: 'no_data', title, summary, data, evidence, actions: [] };
  }

  private resolvePage(input: unknown) {
    return Math.max(Number(input) || 1, 1);
  }

  private resolvePageSize(input: unknown) {
    return Math.min(Math.max(Number(input) || 10, 10), 50);
  }

  private resolveLimit(input: unknown) {
    return Math.min(Math.max(Number(input) || 20, 1), 100);
  }

  private resolveRiskWindowDays(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const raw = Number(filters.riskWindowDays ?? filters.expiringDays ?? args.riskWindowDays ?? args.expiringDays ?? 30);
    return Math.min(Math.max(Number.isFinite(raw) ? raw : 30, 1), 365);
  }

  private resolveQueryDateRange(args: Record<string, unknown>, fallbackPreset: string): AgentV2DateRange {
    return resolveAgentV2QueryDateRange(args, fallbackPreset);
  }

  private createdAtWhere(range: AgentV2DateRange) {
    if (range.preset === 'all') return {};
    return { createdAt: { gte: range.start, lt: range.end } };
  }

  private paymentTimeWhere(range: AgentV2DateRange) {
    if (range.preset === 'all') return {};
    return { OR: [{ paidAt: { gte: range.start, lt: range.end } }, { createdAt: { gte: range.start, lt: range.end } }] };
  }

  private orderNoWhere(orderNo: string | null) {
    return orderNo ? { orderNo: { contains: orderNo } } : {};
  }

  private extractOrderNo(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const fromFilter = String(filters.orderNo ?? '').trim();
    if (fromFilter) return fromFilter;
    const question = String(args.question ?? '').toUpperCase();
    return question.match(/[A-Z]{2,}[A-Z0-9]{5,}|PO\d{6,}/)?.[0] ?? null;
  }

  private extractCustomerKeyword(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const fromFilter = String(filters.customerId ?? filters.customerName ?? filters.customerPhone ?? filters.keyword ?? '').trim();
    if (fromFilter) return fromFilter;
    const question = String(args.question ?? '').trim();
    const phone = question.match(/1[3-9]\d{9}/)?.[0];
    if (phone) return phone;
    const named =
      question.match(/(?:客户|客人|会员)(?:叫|是|名为|姓名为)([\u4e00-\u9fa5]{2,4})/)?.[1] ??
      question.match(/(?:客户|客人|会员)\s*([\u4e00-\u9fa5]{2,4})(?=的|\s|，|,|。|$)/)?.[1];
    if (named && !/^(的|有|没|要|说|想|需|可|还|未|已|这|那)/.test(named)) return named;
    return '';
  }

  private customerKeywordWhere(keyword: string) {
    const trimmed = String(keyword ?? '').trim();
    const numericId = Number(trimmed);
    const or: Array<Record<string, unknown>> = [
      { name: { contains: trimmed } },
      { phone: { contains: trimmed } },
    ];
    if (Number.isInteger(numericId) && numericId > 0 && trimmed.length <= 8) or.push({ id: numericId });
    return { OR: or };
  }

  private startOfDay(date: Date) {
    return startOfAgentV2Day(date);
  }

  private evidence(source: string[], metricDefinition: string, filters: string[], sampleSize: number, range?: AgentV2DateRange, limitations?: string[]): AgentEvidence {
    return {
      source,
      sourceTables: source,
      dateRange: range ? `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}` : undefined,
      metricDefinition,
      filters,
      sampleSize,
      limitations: limitations ?? ['只读取当前账号授权范围内的已落库业务数据，不执行写入、删除、发券或下发。'],
    };
  }

  private serializeRange(range: AgentV2DateRange) {
    return { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label, preset: range.preset };
  }

  private rangeFilterText(field: string, range: AgentV2DateRange) {
    if (range.preset === 'all') return `${field}=全部时间`;
    return `${field}=${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`;
  }

  private formatDate(value: unknown) {
    if (!value) return '';
    return formatBusinessDate(value as Date);
  }

  private formatDateTime(value: unknown) {
    if (!value) return '';
    return formatBusinessDateTime(value as Date, { seconds: true });
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private round(value: number, precision = 2) {
    const factor = 10 ** precision;
    return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
  }

  private formatMoney(value: number) {
    return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatPlainCurrency(value: number) {
    return `¥${Math.round(value || 0).toLocaleString('zh-CN')}`;
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

  private orderStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待处理', paid: '已支付', completed: '已完成', refunded: '已退款', cancelled: '已取消' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private paymentStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待支付', paid: '已支付', success: '成功', failed: '失败', refunded: '已退款' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private orderKindLabel(value: unknown) {
    const map: Record<string, string> = {
      product: '商品订单',
      project: '项目订单',
      member_card_recharge: '会员卡充值',
      member_card_open: '会员开卡',
      card_package: '次卡开卡',
      recharge: '充值',
    };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '订单');
  }

  private cardStatusLabel(value: unknown) {
    const map: Record<string, string> = { active: '可用', enabled: '可用', expired: '已过期', disabled: '停用', used_up: '已用完' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private commissionStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待确认', confirmed: '已确认', settled: '已结算', paid: '已发放' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private sourceTypeLabel(value: unknown) {
    const map: Record<string, string> = { product: '商品订单', project: '项目订单', card: '次卡/会员卡', card_usage: '次卡核销', recharge: '充值', manual: '手工调整' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '业务记录');
  }

  private consumeTypeLabel(value: unknown) {
    const map: Record<string, string> = { product_order: '商品订单', project_order: '项目订单', card_usage: '次卡核销', member_card: '会员卡', service: '服务记录' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '消费记录');
  }
}
