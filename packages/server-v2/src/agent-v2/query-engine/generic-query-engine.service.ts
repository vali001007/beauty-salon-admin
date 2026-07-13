import { Injectable } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { formatBusinessDate, formatBusinessDateTime } from '../../common/utils/business-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AgentV2CapabilityManifest, AgentV2FieldPolicy, AgentV2QueryAggregation } from '../capability/agent-v2-capability.types.js';
import { AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT } from '../knowledge-graph/generated/knowledge-graph.generated.js';
import {
  resolveAgentV2QueryDateRange,
  startOfAgentV2Day,
} from '../utils/agent-v2-date-range.js';
import type { GenericQueryDateRange, GenericQueryExecutionKind, GenericQueryInput, GenericQueryTrace } from './generic-query-engine.types.js';

const DAY_MS = 86_400_000;
const SUPPORTED_QUERY_KEYS = new Set([
  'inventory.scrap.records',
  'inventory.expiring-risk',
  'order.product.records',
  'order.project.records',
  'order.member-card.records',
  'order.card-package.records',
  'card.usage.records',
  'card.package.inactive-customers.list',
  'customer.consumption.records',
  'finance.daily-settlement.metric',
  'finance.payment-method-breakdown.metric',
  'finance.refund.metric',
  'finance.revenue.trend',
  'order.detail.lookup',
]);

type GraphRelationStep = {
  field: string;
  fromModel: string;
  toModel: string;
  joinField?: string;
};

@Injectable()
export class GenericQueryEngineService {
  constructor(private readonly prisma: PrismaService) {}

  canExecute(manifest: AgentV2CapabilityManifest) {
    return Boolean(
      manifest.executor.queryKey &&
      (SUPPORTED_QUERY_KEYS.has(manifest.executor.queryKey) ||
        this.canExecuteDynamicRecordQuery(manifest) ||
        this.canExecuteDynamicDetailQuery(manifest)),
    );
  }

  async tryExecute(input: GenericQueryInput): Promise<AgentToolResult | null> {
    if (!this.canExecute(input.manifest)) return null;
    if (input.manifest.storeScope === 'required' && !input.context.storeId) {
      return this.failed(input.manifest, 'query_plan_failed', '当前能力要求门店上下文，但本次运行缺少 storeId。');
    }

    const queryKey = input.manifest.executor.queryKey;
    if (queryKey === 'inventory.scrap.records') return this.listInventoryScrapRecords(input);
    if (queryKey === 'inventory.expiring-risk') return this.listInventoryExpiringRisk(input);
    if (queryKey === 'order.product.records') {
      return this.listOrderRecords(input, {
        title: '商品订单记录',
        itemTypes: ['product', 'goods', 'sku'],
        orderKinds: ['product'],
        metricDefinition: '商品订单 = ProductOrder 中 orderKind=product 或 OrderItem.itemType 为商品/产品类的已落库订单。',
      });
    }
    if (queryKey === 'order.project.records') {
      return this.listOrderRecords(input, {
        title: '项目订单记录',
        itemTypes: ['project', 'service'],
        orderKinds: ['project'],
        metricDefinition: '项目订单 = ProductOrder 中 orderKind=project 或 OrderItem.itemType 为项目/服务类的已落库订单。',
      });
    }
    if (queryKey === 'order.member-card.records') {
      return this.listOrderRecords(input, {
        title: '会员卡开卡与充值记录',
        itemTypes: ['member_card', 'member-card', 'stored_value', 'recharge'],
        orderKinds: ['member_card_recharge', 'member_card_open', 'stored_value', 'recharge'],
        metricDefinition: '会员卡开卡与充值 = 储值类 ProductOrder/OrderItem 记录，回答余额充值和会员开卡，不等同于次卡。',
      });
    }
    if (queryKey === 'order.card-package.records') return this.listCardPackageRecords(input);
    if (queryKey === 'card.usage.records') return this.listCardUsageRecords(input);
    if (queryKey === 'card.package.inactive-customers.list') return this.listCardPackageInactiveCustomers(input);
    if (queryKey === 'customer.consumption.records') return this.listCustomerConsumptionRecords(input);
    if (queryKey === 'finance.daily-settlement.metric') return this.getDailySettlementMetric(input);
    if (queryKey === 'finance.payment-method-breakdown.metric') return this.getPaymentMethodBreakdownMetric(input);
    if (queryKey === 'finance.refund.metric') return this.getRefundMetric(input);
    if (queryKey === 'finance.revenue.trend') return this.getRevenueTrend(input);
    if (queryKey === 'order.detail.lookup') return this.lookupOrderDetail(input);
    if (this.canExecuteDynamicDetailQuery(input.manifest)) return this.executeDynamicDetailQuery(input);
    if (this.canExecuteDynamicRecordQuery(input.manifest)) return this.executeDynamicRecordQuery(input);
    return null;
  }

  private canExecuteDynamicRecordQuery(manifest: AgentV2CapabilityManifest) {
    return (
      manifest.executor.tool === 'business.record.query' &&
      manifest.executor.type === 'business_record_query' &&
      Boolean(manifest.executor.queryKey) &&
      Boolean(manifest.sourceModels[0]) &&
      manifest.fieldPolicies.some((policy) => policy.visibility !== 'deny' && /^[A-Za-z][A-Za-z0-9_]*$/.test(policy.field)) &&
      manifest.riskLevel === 'low' &&
      manifest.releaseStrategy === 'auto_publish'
    );
  }

  private canExecuteDynamicDetailQuery(manifest: AgentV2CapabilityManifest) {
    return (
      manifest.executor.tool === 'business.detail.query' &&
      manifest.executor.type === 'business_detail_query' &&
      Boolean(manifest.executor.queryKey) &&
      Boolean(manifest.sourceModels[0]) &&
      manifest.fieldPolicies.some((policy) => policy.visibility !== 'deny' && /^[A-Za-z][A-Za-z0-9_]*$/.test(policy.field)) &&
      manifest.riskLevel === 'low' &&
      manifest.releaseStrategy === 'auto_publish'
    );
  }

  private async executeDynamicRecordQuery(input: GenericQueryInput): Promise<AgentToolResult> {
    const sourceModel = input.manifest.sourceModels[0];
    const delegate = (this.prisma as any)[this.prismaDelegateName(sourceModel)];
    if (!delegate?.findMany) {
      return this.failed(
        input.manifest,
        'needs_development',
        `通用查询暂未找到 ${sourceModel} 对应的 Prisma delegate，需进入治理中心补充 queryKey 或专用 adapter。`,
      );
    }

    const limit = this.resolveDynamicLimit(input);
    const range = this.resolveQueryDateRange(input.args, 'last_30_days');
    const dateField = this.manifestDateField(input.manifest, sourceModel);
    const where = {
      ...this.dynamicStoreWhere(sourceModel, input.context.storeId),
      ...this.dateFieldWhere(dateField, range),
    };
    const selectFields = this.dynamicSelectFields(input.manifest);
    const select = Object.fromEntries(selectFields.map((field) => [field, true]));
    const orderBy = this.dynamicOrderBy(input.manifest, dateField);
    const rows = await delegate.findMany({ where, select, orderBy, take: limit });
    const rawItems = (Array.isArray(rows) ? rows : []).map((row) => this.mapDynamicRow(row));
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const aggregation = this.dynamicAggregations(input.manifest);
    const metrics = this.aggregateRows(rawItems, aggregation);
    const trace = this.trace(input, 'record.query', sourceModel, where, limit, undefined, orderBy, range);
    trace.select = selectFields;
    trace.aggregation = aggregation.length ? aggregation : undefined;
    trace.graphRelationPath = this.storeRelationPathLabels(sourceModel);
    trace.sqlSummary = this.sqlSummary(sourceModel, where, limit, undefined, selectFields, orderBy);
    const evidence = this.evidence(
      input.manifest,
      `${sourceModel} 通用只读查询 = GenericQueryEngine 根据 Manifest.sourceModels、fieldPolicies、storeScope 和安全默认时间范围动态构造 Prisma findMany。`,
      trace.filters,
      rawItems.length,
      range,
      ['动态查询只读取 Manifest 字段策略允许的字段；如需复杂 join、聚合或业务口径，需升级为专用 adapter。'],
    );

    return {
      status: items.length ? 'success' : 'no_data',
      title: input.manifest.displayName,
      summary: items.length
        ? `${range.label}查询到 ${items.length} 条${input.manifest.displayName}记录。`
        : `${range.label}没有查询到${input.manifest.displayName}记录。`,
      data: {
        items,
        metrics,
        requestedLimit: limit,
        sourceModel,
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: [],
    };
  }

  private async executeDynamicDetailQuery(input: GenericQueryInput): Promise<AgentToolResult> {
    const sourceModel = input.manifest.sourceModels[0];
    const delegate = (this.prisma as any)[this.prismaDelegateName(sourceModel)];
    const id = this.extractDetailId(input.args);
    const baseWhere = this.dynamicStoreWhere(sourceModel, input.context.storeId);
    const where = id ? { ...baseWhere, id } : baseWhere;
    const selectFields = this.dynamicSelectFields(input.manifest);
    const select = Object.fromEntries(selectFields.map((field) => [field, true]));
    const trace = this.trace(input, 'detail.query', sourceModel, where, 1, undefined, undefined, undefined, 'findFirst');
    trace.select = selectFields;
    trace.graphRelationPath = this.storeRelationPathLabels(sourceModel);
    trace.sqlSummary = this.sqlSummary(sourceModel, where, 1, undefined, selectFields, undefined, 'findFirst');

    if (!delegate?.findFirst) {
      return this.failed(
        input.manifest,
        'needs_development',
        `通用详情查询暂未找到 ${sourceModel} 对应的 Prisma delegate，需补 queryKey 或专用 detail adapter。`,
      );
    }

    const evidence = this.evidence(
      input.manifest,
      `${sourceModel} 通用详情查询 = GenericQueryEngine 根据 Manifest.sourceModels、fieldPolicies、storeScope 和 id 参数动态构造 Prisma findFirst。`,
      trace.filters,
      0,
      undefined,
      ['动态详情只读取 Manifest 字段策略允许的字段；如需跨表详情或复杂页面语义，需升级为专用 adapter。'],
    );

    if (!id) {
      return {
        status: 'no_data',
        title: input.manifest.displayName,
        summary: `${input.manifest.displayName} 需要提供 id 后才能定位单条详情；当前 dry-run 已验证详情查询入口可执行。`,
        data: {
          detail: null,
          items: [],
          sourceModel,
          requiredParameters: ['id'],
          queryTrace: trace,
        },
        evidence,
        actions: [],
      };
    }

    const row = await delegate.findFirst({ where, select });
    const rawDetail = row ? this.mapDynamicRow(row) : null;
    const detail = rawDetail ? this.applyFieldPolicies([rawDetail], input.manifest.fieldPolicies)[0] : null;
    const detailEvidence = this.evidence(
      input.manifest,
      `${sourceModel} 通用详情查询 = GenericQueryEngine 根据 Manifest.sourceModels、fieldPolicies、storeScope 和 id 参数动态构造 Prisma findFirst。`,
      trace.filters,
      detail ? 1 : 0,
      undefined,
      ['动态详情只读取 Manifest 字段策略允许的字段；如需跨表详情或复杂页面语义，需升级为专用 adapter。'],
    );

    return {
      status: detail ? 'success' : 'no_data',
      title: input.manifest.displayName,
      summary: detail
        ? `已查询到 ${input.manifest.displayName} 详情。`
        : `没有查询到 id=${String(id)} 对应的${input.manifest.displayName}详情。`,
      data: {
        detail,
        items: detail ? [detail] : [],
        sourceModel,
        id,
        queryTrace: trace,
      },
      evidence: detailEvidence,
      actions: [],
    };
  }

  private async listInventoryScrapRecords(input: GenericQueryInput): Promise<AgentToolResult> {
    const limit = this.resolveLimit(input.args.limit);
    const range = this.resolveQueryDateRange(input.args, 'this_week');
    const where = {
      storeId: input.context.storeId,
      movementType: 'scrap_out',
      occurredAt: { gte: range.start, lt: range.end },
    };
    const movements = await (this.prisma as any).stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true, costPrice: true, category: { select: { name: true } } } },
        store: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true, username: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    const rawItems = ((movements ?? []) as any[]).map((movement) => {
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
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const totalLossAmount = rawItems.reduce((sum, item) => sum + item.lossAmount, 0);
    const trace = this.trace(input, 'record.query', 'StockMovement', where, limit, ['product', 'store', 'operator', 'batch'], { occurredAt: 'desc' }, range);
    const evidence = this.evidence(input.manifest, 'StockMovement.movementType 为 scrap_out 的已发生库存流水；按发生时间和当前门店授权过滤。', trace.filters, rawItems.length, range);

    return {
      status: items.length ? 'success' : 'no_data',
      title: '已发生报废记录',
      summary: items.length
        ? `${range.label}共有 ${items.length} 条报废记录，预计损耗 ${this.formatMoney(totalLossAmount)}；最近一条是 ${String(items[0].productName ?? '-') }。`
        : `${range.label}没有已发生的报废库存流水。`,
      data: {
        items,
        requestedLimit: limit,
        totalLossAmount: Number(totalLossAmount.toFixed(2)),
        totalLossAmountText: this.formatMoney(totalLossAmount),
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: items.length ? [{ label: '查看库存流水', action: 'inventory:stock-movements', riskLevel: 'low' }] : [],
    };
  }

  private async listInventoryExpiringRisk(input: GenericQueryInput): Promise<AgentToolResult> {
    const limit = this.resolveLimit(input.args.limit);
    const riskWindowDays = this.resolveRiskWindowDays(input.args);
    const now = this.startOfDay(new Date());
    const where = {
      storeId: input.context.storeId,
      deletedAt: null,
    };
    const include = {
      category: { select: { name: true } },
      batches: {
        where: { stock: { gt: 0 } },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        take: 5,
      },
    };
    const orderBy = [{ currentStock: 'asc' }, { updatedAt: 'desc' }];
    const queryTake = Math.max(limit, 50);
    const products = await (this.prisma as any).product.findMany({
      where,
      include,
      orderBy,
      take: queryTake,
    });

    const rawItems = ((products ?? []) as any[])
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
          stockQty: currentStock,
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
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const trace = this.trace(input, 'record.query', 'Product', where, queryTake, ['category', 'batches'], orderBy);
    const evidence = this.evidence(
      input.manifest,
      '临期与缺货风险 = Product.currentStock / safetyStock + StockBatch.expiryDate；按当前门店过滤，只读识别风险，不直接生成促销、采购或报废动作。',
      [...trace.filters, `riskWindowDays=${riskWindowDays}`],
      rawItems.length,
      undefined,
      ['处理方案和促销建议需要人工确认；本能力只提供风险清单和建议入口，不自动发券、不自动下发活动。'],
    );

    return {
      status: items.length ? 'success' : 'no_data',
      title: '临期与报废风险清单',
      summary: items.length
        ? `发现 ${items.length} 个库存风险商品；最高风险是 ${String(rawItems[0].productName)}，${String(rawItems[0].riskReason)}`
        : `当前门店 ${riskWindowDays} 天内没有临期、缺货或低库存风险商品。`,
      data: {
        items,
        requestedLimit: limit,
        riskWindowDays,
        riskCount: items.length,
        queryTrace: trace,
      },
      evidence,
      actions: items.length
        ? [
            { label: '查看库存风险', action: 'inventory:risk-open', riskLevel: 'low' },
            { label: '生成处理建议草稿', action: 'inventory:risk-draft-recommendation', riskLevel: 'medium' },
          ]
        : [],
    };
  }

  private async listOrderRecords(
    input: GenericQueryInput,
    config: { title: string; itemTypes: string[]; orderKinds: string[]; metricDefinition: string },
  ): Promise<AgentToolResult> {
    const limit = this.resolveLimit(input.args.limit);
    const orderNo = this.extractOrderNo(input.args);
    const range = this.resolveQueryDateRange(input.args, orderNo ? 'all' : 'this_week');
    const where: Record<string, unknown> = {
      storeId: input.context.storeId,
      ...this.orderNoWhere(orderNo),
      ...this.createdAtWhere(range),
    };
    if (!orderNo) {
      where.OR = [
        { orderKind: { in: config.orderKinds } },
        { orderItems: { some: { itemType: { in: config.itemTypes } } } },
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

    const rawItems = ((orders ?? []) as any[]).map((order) => this.mapOrderRecord(order));
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const totalNetAmount = rawItems.reduce((sum, item) => sum + item.netAmount, 0);
    const trace = this.trace(input, 'record.query', 'ProductOrder', where, limit, ['customer', 'store', 'orderItems', 'paymentRecords', 'refundRecords'], { createdAt: 'desc' }, range);
    const evidence = this.evidence(input.manifest, config.metricDefinition, trace.filters, rawItems.length, range);

    return {
      status: items.length ? 'success' : 'no_data',
      title: config.title,
      summary: items.length
        ? `${orderNo ? `订单 ${orderNo}` : range.label}找到 ${items.length} 条${config.title}，合计实收 ${this.formatMoney(totalNetAmount)}。`
        : orderNo
          ? `没有找到订单 ${orderNo}。`
          : `${range.label}没有匹配的${config.title}。`,
      data: {
        items,
        requestedLimit: limit,
        totalNetAmount: Number(totalNetAmount.toFixed(2)),
        totalNetAmountText: this.formatMoney(totalNetAmount),
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: items.length ? [{ label: '查看订单管理', action: 'order:open-management', riskLevel: 'low' }] : [],
    };
  }

  private async listCardPackageRecords(input: GenericQueryInput): Promise<AgentToolResult> {
    const limit = this.resolveLimit(input.args.limit);
    const range = this.resolveQueryDateRange(input.args, 'this_week');
    const where = {
      customer: { storeId: input.context.storeId },
      ...this.createdAtWhere(range),
    };
    const include = {
      customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
      card: { select: { id: true, name: true, totalTimes: true } },
      operator: { select: { id: true, name: true, username: true } },
      sourceOrder: { select: { id: true, orderNo: true, payMethod: true, status: true, netAmount: true, totalAmount: true, createdAt: true } },
    };
    const orderBy = { createdAt: 'desc' };
    const cards = await (this.prisma as any).customerCard.findMany({
      where,
      include,
      orderBy,
      take: limit,
    });

    const rawItems = ((cards ?? []) as any[]).map((card) => ({
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
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const totalPaidAmount = rawItems.reduce((sum, item) => sum + item.paidAmount, 0);
    const trace = this.trace(input, 'record.query', 'CustomerCard', where, limit, ['customer', 'card', 'operator', 'sourceOrder'], orderBy, range);
    const evidence = this.evidence(
      input.manifest,
      '次卡开卡订单 = CustomerCard 来源开卡记录，关联 sourceOrder 可追溯原始收银订单。',
      trace.filters,
      rawItems.length,
      range,
      ['只回答次卡开卡/购买记录，不回答核销服务流水。'],
    );

    return {
      status: items.length ? 'success' : 'no_data',
      title: '次卡开卡订单',
      summary: items.length
        ? `${range.label}找到 ${items.length} 条次卡开卡订单，合计实付 ${this.formatMoney(totalPaidAmount)}。`
        : `${range.label}没有次卡开卡订单。`,
      data: {
        items,
        requestedLimit: limit,
        totalPaidAmount: Number(totalPaidAmount.toFixed(2)),
        totalPaidAmountText: this.formatMoney(totalPaidAmount),
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: items.length ? [{ label: '查看次卡开卡管理', action: 'card-package:open-orders', riskLevel: 'low' }] : [],
    };
  }

  private async listCardUsageRecords(input: GenericQueryInput): Promise<AgentToolResult> {
    const limit = this.resolveLimit(input.args.limit);
    const range = this.resolveQueryDateRange(input.args, 'this_week');
    const where = {
      storeId: input.context.storeId,
      verifiedAt: { gte: range.start, lt: range.end },
    };
    const include = {
      customer: { select: { id: true, name: true, phone: true } },
      store: { select: { id: true, name: true } },
      operator: { select: { id: true, name: true, username: true } },
      beautician: { select: { id: true, name: true, userId: true } },
      device: { select: { id: true, name: true, deviceCode: true } },
      sourceOrder: { select: { id: true, orderNo: true } },
    };
    const orderBy = { verifiedAt: 'desc' };
    const records = await (this.prisma as any).cardUsageRecord.findMany({
      where,
      include,
      orderBy,
      take: limit,
    });

    const rawItems = ((records ?? []) as any[]).map((record) => {
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
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const totalRecognizedAmount = rawItems.reduce((sum, item) => sum + item.recognizedAmount, 0);
    const trace = this.trace(
      input,
      'record.query',
      'CardUsageRecord',
      where,
      limit,
      ['customer', 'store', 'operator', 'beautician', 'device', 'sourceOrder'],
      orderBy,
      range,
    );
    const evidence = this.evidence(
      input.manifest,
      '次卡核销记录 = CardUsageRecord 已落库服务核销流水；管理端核销看 operator，智能终端核销看 device。',
      trace.filters,
      rawItems.length,
      range,
      ['核销入口不能只看终端设备；管理端核销也必须纳入统计。'],
    );

    return {
      status: items.length ? 'success' : 'no_data',
      title: '次卡核销记录',
      summary: items.length
        ? `${range.label}找到 ${items.length} 条次卡核销记录，识别收入 ${this.formatMoney(totalRecognizedAmount)}。`
        : `${range.label}没有次卡核销记录。`,
      data: {
        items,
        requestedLimit: limit,
        totalRecognizedAmount: Number(totalRecognizedAmount.toFixed(2)),
        totalRecognizedAmountText: this.formatMoney(totalRecognizedAmount),
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: items.length ? [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }] : [],
    };
  }

  private async listCardPackageInactiveCustomers(input: GenericQueryInput): Promise<AgentToolResult> {
    const limit = this.resolveLimit(input.args.limit);
    const range = this.resolveQueryDateRange(input.args, 'last_90_days');
    const inactiveThresholdDays = this.resolveInactiveThresholdDays(input.args);
    const where = {
      customer: { storeId: input.context.storeId },
      remainingTimes: { gt: 0 },
      status: { in: ['active', 'enabled', 'available'] },
      createdAt: { lt: new Date(Date.now() - inactiveThresholdDays * DAY_MS) },
    };
    const include = {
      customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
      card: { select: { id: true, name: true, totalTimes: true } },
      usageRecords: { orderBy: { verifiedAt: 'desc' }, take: 1, select: { verifiedAt: true, projectName: true } },
    };
    const orderBy = [{ createdAt: 'desc' }];
    const queryTake = Math.max(limit * 3, 50);
    const cards = await (this.prisma as any).customerCard.findMany({
      where,
      include,
      orderBy,
      take: queryTake,
    });

    const now = this.startOfDay(new Date());
    const rawItems = ((cards ?? []) as any[])
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
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const trace = this.trace(input, 'record.query', 'CustomerCard', where, queryTake, ['customer', 'card', 'usageRecords'], orderBy, range);
    const evidence = this.evidence(
      input.manifest,
      '次卡沉睡客户 = 仍有余次的 CustomerCard，结合最近 CardUsageRecord 判断超过阈值未使用。',
      [...trace.filters, `inactiveDays>=${inactiveThresholdDays}`],
      rawItems.length,
      range,
      ['名单只用于人工跟进参考，不自动下发触达、不执行核销扣次。'],
    );

    return {
      status: items.length ? 'success' : 'no_data',
      title: '次卡沉睡客户名单',
      summary: items.length
        ? `找到 ${items.length} 位买了次卡但超过 ${inactiveThresholdDays} 天未使用的客户，建议按未使用天数优先跟进。`
        : `没有找到超过 ${inactiveThresholdDays} 天未使用且仍有余次的次卡客户。`,
      data: {
        items,
        requestedLimit: limit,
        inactiveThresholdDays,
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: items.length ? [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }] : [],
    };
  }

  private async listCustomerConsumptionRecords(input: GenericQueryInput): Promise<AgentToolResult> {
    const limit = this.resolveLimit(input.args.limit);
    const range = this.resolveQueryDateRange(input.args, 'this_week');
    const where = {
      customer: { storeId: input.context.storeId },
      consumeTime: { gte: range.start, lt: range.end },
    };
    const include = {
      customer: { select: { id: true, name: true, phone: true, storeId: true, store: { select: { id: true, name: true } } } },
    };
    const orderBy = { consumeTime: 'desc' };
    const records = await (this.prisma as any).consumptionRecord.findMany({
      where,
      include,
      orderBy,
      take: limit,
    });

    const rawItems = ((records ?? []) as any[]).map((record) => ({
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
    const items = this.applyFieldPolicies(rawItems, input.manifest.fieldPolicies);
    const totalAmount = rawItems.reduce((sum, item) => sum + item.amount, 0);
    const trace = this.trace(input, 'record.query', 'ConsumptionRecord', where, limit, ['customer'], orderBy, range);
    const evidence = this.evidence(
      input.manifest,
      '客户消费记录 = ConsumptionRecord 客户视角消费流水；用于核对订单、收银、核销是否同步进客户画像。',
      trace.filters,
      rawItems.length,
      range,
      ['如果订单存在但 ConsumptionRecord 缺失，说明同步链路存在断点，不能把订单明细硬当成客户消费记录。'],
    );

    return {
      status: items.length ? 'success' : 'no_data',
      title: '客户消费记录',
      summary: items.length
        ? `${range.label}找到 ${items.length} 条客户消费记录，合计消费 ${this.formatMoney(totalAmount)}。`
        : `${range.label}没有客户消费记录。`,
      data: {
        items,
        requestedLimit: limit,
        totalAmount: Number(totalAmount.toFixed(2)),
        totalAmountText: this.formatMoney(totalAmount),
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: items.length ? [{ label: '查看客户消费记录', action: 'customer:consumption-records', riskLevel: 'low' }] : [],
    };
  }

  private async getDailySettlementMetric(input: GenericQueryInput): Promise<AgentToolResult> {
    const range = this.resolveQueryDateRange(input.args, 'today');
    const limit = 60;
    const where = {
      storeId: input.context.storeId,
      ...this.dateFieldWhere('settleDate', range),
    };
    const orderBy = { settleDate: 'desc' };
    const settlements = await (this.prisma as any).dailySettlement.findMany({
      where,
      orderBy,
      take: limit,
    });

    const rawRows = ((settlements ?? []) as any[]).map((settlement) => {
      const totalRevenue = this.toNumber(settlement.totalRevenue);
      const refundAmount = this.toNumber(settlement.refundAmount);
      const netRevenue = totalRevenue - refundAmount;
      return {
        settlementId: settlement.id,
        settleDate: this.formatDate(settlement.settleDate),
        totalRevenue,
        totalRevenueText: this.formatMoney(totalRevenue),
        refundAmount,
        refundAmountText: this.formatMoney(refundAmount),
        netRevenue,
        netRevenueText: this.formatMoney(netRevenue),
        orderCount: this.toNumber(settlement.orderCount),
        customerCount: this.toNumber(settlement.customerCount),
        avgTransactionText: this.formatMoney(this.toNumber(settlement.avgTransaction)),
        grossProfitText: this.formatMoney(this.toNumber(settlement.grossProfit)),
        grossMarginText: `${this.toNumber(settlement.grossMargin).toFixed(1)}%`,
        commissionTotalText: this.formatMoney(this.toNumber(settlement.commissionTotal)),
        statusLabel: this.dailySettlementStatusLabel(settlement.status),
      };
    });
    const rows = this.applyFieldPolicies(rawRows, input.manifest.fieldPolicies);
    const metrics = rawRows.reduce(
      (sum, row) => ({
        totalRevenue: sum.totalRevenue + row.totalRevenue,
        refundAmount: sum.refundAmount + row.refundAmount,
        netRevenue: sum.netRevenue + row.netRevenue,
        orderCount: sum.orderCount + row.orderCount,
        customerCount: sum.customerCount + row.customerCount,
      }),
      { totalRevenue: 0, refundAmount: 0, netRevenue: 0, orderCount: 0, customerCount: 0 },
    );
    const trace = this.trace(input, 'metric.query', 'DailySettlement', where, limit, undefined, orderBy, range);
    const evidence = this.evidence(
      input.manifest,
      '日结报表指标 = DailySettlement 已生成日结汇总；营收、退款、订单数、客数、毛利和提成来自财务日结口径。',
      trace.filters,
      rawRows.length,
      range,
      ['日结指标依赖日结生成任务；若订单或收银已存在但日结为空，需要先核对日结生成链路。'],
    );
    const data = {
      rows,
      items: rows,
      metrics: {
        ...metrics,
        totalRevenueText: this.formatMoney(metrics.totalRevenue),
        refundAmountText: this.formatMoney(metrics.refundAmount),
        netRevenueText: this.formatMoney(metrics.netRevenue),
      },
      timeRange: this.serializeRange(range),
      queryTrace: trace,
    };

    if (!rawRows.length) {
      return {
        status: 'no_data',
        title: '日结报表指标',
        summary: `${range.label}没有已生成的日结报表。`,
        data,
        evidence,
        actions: [{ label: '生成日结报表', action: 'finance:daily-settlement-generate', riskLevel: 'medium' }],
      };
    }

    return {
      status: 'success',
      title: '日结报表指标',
      summary: `${range.label}日结实收 ${this.formatMoney(metrics.totalRevenue)}，退款 ${this.formatMoney(metrics.refundAmount)}，净收 ${this.formatMoney(metrics.netRevenue)}，订单 ${metrics.orderCount} 单。`,
      data,
      evidence,
      actions: [{ label: '查看日结报表', action: 'finance:daily-settlement', riskLevel: 'low' }],
    };
  }

  private async getRevenueTrend(input: GenericQueryInput): Promise<AgentToolResult> {
    const range = this.resolveTrendRange(input.args);
    const limit = 5000;
    const where = {
      storeId: input.context.storeId,
      createdAt: { gte: range.start, lt: range.end },
      status: { notIn: ['cancelled', 'void', '作废', '已取消'] },
    };
    const orders = await (this.prisma as any).productOrder.findMany({
      where,
      select: { id: true, orderNo: true, createdAt: true, totalAmount: true, netAmount: true, status: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const grouped = new Map<string, { date: string; revenue: number; orderCount: number }>();
    for (const order of (orders ?? []) as any[]) {
      const date = this.formatDate(order.createdAt);
      const current = grouped.get(date) ?? { date, revenue: 0, orderCount: 0 };
      current.revenue += this.toNumber(order.netAmount ?? order.totalAmount);
      current.orderCount += 1;
      grouped.set(date, current);
    }
    const rawRows = Array.from(grouped.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        date: row.date,
        revenue: Number(row.revenue.toFixed(2)),
        revenueText: this.formatMoney(row.revenue),
        orderCount: row.orderCount,
        avgOrderValue: row.orderCount > 0 ? Number((row.revenue / row.orderCount).toFixed(2)) : 0,
        avgOrderValueText: this.formatMoney(row.orderCount > 0 ? row.revenue / row.orderCount : 0),
      }));
    const rows = this.applyFieldPolicies(rawRows, input.manifest.fieldPolicies);
    const totalRevenue = rawRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalOrderCount = rawRows.reduce((sum, row) => sum + row.orderCount, 0);
    const firstRevenue = rawRows[0]?.revenue ?? 0;
    const lastRevenue = rawRows[rawRows.length - 1]?.revenue ?? 0;
    const revenueChange = rawRows.length >= 2 ? lastRevenue - firstRevenue : 0;
    const revenueChangeRate = firstRevenue > 0 ? (revenueChange / firstRevenue) * 100 : 0;
    const trendDirection = revenueChange > 0 ? '上升' : revenueChange < 0 ? '下降' : '持平';
    const trace = this.trace(input, 'trend.query', 'ProductOrder', where, limit, undefined, { createdAt: 'asc' }, range);
    const evidence = this.evidence(input.manifest, '营业额趋势 = ProductOrder.netAmount 按业务日期聚合；排除已取消或作废订单。', trace.filters, (orders ?? []).length, range);

    return {
      status: rows.length ? 'success' : 'no_data',
      title: '营业额趋势',
      summary: rows.length
        ? `${range.label}营业额 ${this.formatMoney(totalRevenue)}，订单 ${totalOrderCount} 单，趋势${trendDirection}。`
        : `${range.label}没有可用于趋势统计的订单。`,
      data: {
        items: rows,
        rows,
        chart: { chartType: 'line', title: '营业额趋势', data: rows, xKey: 'date', yKeys: ['revenue'] },
        metrics: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalRevenueText: this.formatMoney(totalRevenue),
          orderCount: totalOrderCount,
          avgOrderValueText: this.formatMoney(totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0),
          revenueChange: Number(revenueChange.toFixed(2)),
          revenueChangeText: this.formatMoney(revenueChange),
          revenueChangeRate: Number(revenueChangeRate.toFixed(1)),
          revenueChangeRateText: `${Number(revenueChangeRate || 0).toFixed(1)}%`,
          trendDirection,
        },
        timeRange: this.serializeRange(range),
        queryTrace: trace,
      },
      evidence,
      actions: [{ label: '查看订单明细', action: 'order:open-management', riskLevel: 'low' }],
    };
  }

  private async getPaymentMethodBreakdownMetric(input: GenericQueryInput): Promise<AgentToolResult> {
    const range = this.resolveQueryDateRange(input.args, 'today');
    const limit = 2000;
    const where = {
      order: { storeId: input.context.storeId },
      ...this.paymentTimeWhere(range),
    };
    const orderBy = [{ paidAt: 'desc' }, { createdAt: 'desc' }];
    const payments = await (this.prisma as any).paymentRecord.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            orderKind: true,
            customerName: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy,
      take: limit,
    });

    const grouped = new Map<string, { method: string; methodLabel: string; revenue: number; paymentCount: number; orderIds: Set<number>; latestPaidAt: string }>();
    for (const payment of (payments ?? []) as any[]) {
      const method = String(payment.method ?? 'unknown').toLowerCase();
      const current =
        grouped.get(method) ??
        {
          method,
          methodLabel: this.payMethodLabel(method),
          revenue: 0,
          paymentCount: 0,
          orderIds: new Set<number>(),
          latestPaidAt: '',
        };
      current.revenue += this.toNumber(payment.amount);
      current.paymentCount += 1;
      if (payment.orderId) current.orderIds.add(Number(payment.orderId));
      if (!current.latestPaidAt) current.latestPaidAt = this.formatDateTime(payment.paidAt ?? payment.createdAt);
      grouped.set(method, current);
    }

    const rawRows = Array.from(grouped.values())
      .map((item) => ({
        method: item.method,
        methodLabel: item.methodLabel,
        revenue: Number(item.revenue.toFixed(2)),
        revenueText: this.formatMoney(item.revenue),
        paymentCount: item.paymentCount,
        orderCount: item.orderIds.size,
        latestPaidAt: item.latestPaidAt,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    const rows = this.applyFieldPolicies(rawRows, input.manifest.fieldPolicies);
    const totalRevenue = rawRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalPaymentCount = rawRows.reduce((sum, row) => sum + row.paymentCount, 0);
    const totalOrderCount = rawRows.reduce((sum, row) => sum + row.orderCount, 0);
    const trace = this.trace(input, 'metric.query', 'PaymentRecord', where, limit, ['order'], orderBy, range);
    const evidence = this.evidence(
      input.manifest,
      '支付方式收款拆分 = PaymentRecord 按 method 聚合金额和笔数，按订单所属门店授权过滤。退款需要查看 RefundRecord 指标。',
      [...trace.filters, 'groupBy=method'],
      (payments ?? []).length,
      range,
      ['当前只统计已落库支付流水；组合支付会按实际 PaymentRecord 拆分支付方式。'],
    );

    const metrics = {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalRevenueText: this.formatMoney(totalRevenue),
      totalPaymentCount,
      totalOrderCount,
      methodCount: rawRows.length,
    };
    if (!rawRows.length) {
      return {
        status: 'no_data',
        title: '支付方式收款拆分',
        summary: `${range.label}没有支付流水。`,
        data: { rows, items: rows, metrics, timeRange: this.serializeRange(range), queryTrace: trace },
        evidence,
        actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
      };
    }

    const topMethods = rawRows.slice(0, 3).map((row) => `${row.methodLabel} ${row.revenueText}`).join('，');
    return {
      status: 'success',
      title: '支付方式收款拆分',
      summary: `${range.label}收款 ${this.formatMoney(totalRevenue)}，共 ${totalPaymentCount} 笔支付；${topMethods}。`,
      data: { rows, items: rows, metrics, timeRange: this.serializeRange(range), queryTrace: trace },
      evidence,
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
    };
  }

  private async getRefundMetric(input: GenericQueryInput): Promise<AgentToolResult> {
    const range = this.resolveQueryDateRange(input.args, 'today');
    const limit = 500;
    const where = {
      order: { storeId: input.context.storeId },
      ...this.refundTimeWhere(range),
    };
    const orderBy = [{ refundedAt: 'desc' }, { createdAt: 'desc' }];
    const refunds = await (this.prisma as any).refundRecord.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            customerName: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy,
      take: limit,
    });
    const rawRows = ((refunds ?? []) as any[]).map((refund) => ({
      refundId: refund.id,
      refundNo: refund.refundNo,
      orderNo: refund.order?.orderNo ?? '',
      customerName: refund.order?.customer?.name ?? refund.order?.customerName ?? '',
      amount: this.toNumber(refund.amount),
      amountText: this.formatMoney(this.toNumber(refund.amount)),
      statusLabel: this.refundStatusLabel(refund.status),
      refundedAt: this.formatDateTime(refund.refundedAt ?? refund.createdAt),
      reason: refund.reason ?? '',
    }));
    const rows = this.applyFieldPolicies(rawRows, input.manifest.fieldPolicies);
    const refundAmount = rawRows.reduce((sum, row) => sum + row.amount, 0);
    const trace = this.trace(input, 'metric.query', 'RefundRecord', where, limit, ['order'], orderBy, range);
    const evidence = this.evidence(
      input.manifest,
      '退款指标 = RefundRecord 已发生退款流水，按订单所属门店授权过滤，聚合退款笔数和金额。不会执行退款操作。',
      trace.filters,
      rawRows.length,
      range,
      ['只读退款记录；发起或处理退款属于写操作，需要人工确认。'],
    );
    const data = {
      rows,
      items: rows,
      metrics: {
        refundCount: rawRows.length,
        refundAmount: Number(refundAmount.toFixed(2)),
        refundAmountText: this.formatMoney(refundAmount),
      },
      timeRange: this.serializeRange(range),
      queryTrace: trace,
    };

    if (!rawRows.length) {
      return {
        status: 'no_data',
        title: '退款笔数与金额',
        summary: `${range.label}没有退款记录。`,
        data,
        evidence,
        actions: [{ label: '查看退款记录', action: 'finance:refund-records', riskLevel: 'low' }],
      };
    }

    return {
      status: 'success',
      title: '退款笔数与金额',
      summary: `${range.label}退款 ${rawRows.length} 笔，金额 ${this.formatMoney(refundAmount)}。`,
      data,
      evidence,
      actions: [{ label: '查看退款记录', action: 'finance:refund-records', riskLevel: 'low' }],
    };
  }

  private async lookupOrderDetail(input: GenericQueryInput): Promise<AgentToolResult> {
    const orderNo = this.extractOrderNo(input.args);
    const baseWhere = { storeId: input.context.storeId };
    if (!orderNo) {
      const trace = this.trace(input, 'detail.query', 'ProductOrder', baseWhere, 1, ['orderItems', 'paymentRecords', 'refundRecords'], undefined, undefined, 'findFirst');
      return {
        status: 'no_data',
        title: '订单详情',
        summary: '没有识别到订单编号，请补充订单号后再查询。',
        data: { items: [], detail: null, queryTrace: trace },
        evidence: this.evidence(input.manifest, '订单详情 = 按 ProductOrder.orderNo 定位订单，并读取订单明细、支付和退款记录。', trace.filters, 0),
        actions: [],
      };
    }

    const where = { ...baseWhere, orderNo: { contains: orderNo } };
    const order = await (this.prisma as any).productOrder.findFirst({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: { include: { beautician: { select: { id: true, name: true, phone: true } } }, orderBy: { id: 'asc' } },
        paymentRecords: { orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] },
        refundRecords: { orderBy: [{ refundedAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    const trace = this.trace(input, 'detail.query', 'ProductOrder', where, 1, ['customer', 'store', 'orderItems', 'paymentRecords', 'refundRecords'], undefined, undefined, 'findFirst');
    const evidence = this.evidence(input.manifest, '订单详情 = ProductOrder 主表 + OrderItem 明细 + PaymentRecord 支付 + RefundRecord 退款；按当前门店授权过滤。', trace.filters, order ? 1 : 0);

    if (!order) {
      return {
        status: 'no_data',
        title: '订单详情',
        summary: `没有找到订单 ${orderNo}。`,
        data: { items: [], detail: null, orderNo, queryTrace: trace },
        evidence,
        actions: [{ label: '查看订单管理', action: 'order:open-management', riskLevel: 'low' }],
      };
    }

    const detail = this.applyFieldPolicies([this.mapOrderDetail(order)], input.manifest.fieldPolicies)[0];
    const items = this.applyFieldPolicies((Array.isArray(order.orderItems) ? order.orderItems : []).map((item: any) => this.mapOrderItem(item)), input.manifest.fieldPolicies);
    const payments = this.applyFieldPolicies((Array.isArray(order.paymentRecords) ? order.paymentRecords : []).map((payment: any) => this.mapPayment(payment)), input.manifest.fieldPolicies);
    const refunds = this.applyFieldPolicies((Array.isArray(order.refundRecords) ? order.refundRecords : []).map((refund: any) => this.mapRefund(refund)), input.manifest.fieldPolicies);

    return {
      status: 'success',
      title: '订单详情',
      summary: `订单 ${String(detail.orderNo ?? orderNo)} 为${String(detail.orderKindLabel ?? '订单')}，客户 ${String(detail.customerName ?? '未记录')}，实收 ${String(detail.netAmountText ?? '-')}，状态 ${String(detail.statusLabel ?? '未记录')}。`,
      data: { detail, items, payments, refunds, orderNo: detail.orderNo, queryTrace: trace },
      evidence,
      actions: [{ label: '查看订单管理', action: 'order:open-management', riskLevel: 'low' }],
    };
  }

  private trace(
    input: GenericQueryInput,
    kind: GenericQueryExecutionKind,
    sourceModel: string,
    where: Record<string, unknown>,
    take: number,
    include?: string[],
    orderBy?: unknown,
    range?: GenericQueryDateRange,
    operation: 'findMany' | 'findFirst' = 'findMany',
  ): GenericQueryTrace {
    const permissionCheck = this.permissionCheck(input);
    const filters = [...this.filterTexts(where, range), ...this.permissionFilters(permissionCheck)];
    return {
      engine: 'generic_query_engine',
      queryKey: input.manifest.executor.queryKey ?? input.manifest.capabilityId,
      kind,
      sourceModel,
      sourceModels: input.manifest.sourceModels,
      storeScope: input.manifest.storeScope,
      where,
      include,
      orderBy,
      take,
      filters,
      fieldPolicies: input.manifest.fieldPolicies.map(({ field, label, visibility }) => ({ field, label, visibility })),
      permissionCheck,
      sqlSummary: this.sqlSummary(sourceModel, where, take, include, undefined, orderBy, operation),
    };
  }

  private permissionCheck(input: GenericQueryInput): GenericQueryTrace['permissionCheck'] {
    const required = input.manifest.permissionCodes;
    const actorPermissions = input.context.permissions ?? [];
    const wildcard = actorPermissions.includes('*');
    const granted = wildcard ? required : required.filter((permission) => actorPermissions.includes(permission));
    const missing = wildcard ? [] : required.filter((permission) => !actorPermissions.includes(permission));
    return {
      required,
      granted,
      missing,
      wildcard,
      allowed: !required.length || wildcard || missing.length === 0,
    };
  }

  private permissionFilters(permissionCheck: GenericQueryTrace['permissionCheck']) {
    if (!permissionCheck.required.length) return ['permission=none_required'];
    if (permissionCheck.wildcard) return ['permission=*'];
    if (permissionCheck.missing.length) return [`permission_missing=${permissionCheck.missing.join('|')}`];
    return permissionCheck.granted.map((permission) => `permission=${permission}`);
  }

  private prismaDelegateName(sourceModel: string) {
    return sourceModel ? sourceModel.charAt(0).toLowerCase() + sourceModel.slice(1) : '';
  }

  private extractDetailId(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? (args.filters as Record<string, unknown>) : {};
    const candidates = [args.id, args.recordId, args.customerId, filters.id, filters.recordId, filters.customerId];
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    const question = String(args.question ?? '');
    const match = question.match(/(?:id|ID|#)\s*[:：#]?\s*(\d{1,10})/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private dynamicStoreWhere(sourceModel: string, storeId?: number) {
    if (!storeId) return {};
    const relationPath = this.findStoreRelationPath(sourceModel);
    if (!relationPath.length) return { storeId };
    return this.storeWhereFromRelationPath(relationPath, storeId);
  }

  private storeRelationPathLabels(sourceModel: string) {
    const relationPath = this.findStoreRelationPath(sourceModel);
    if (!relationPath.length) return undefined;
    return relationPath.map((step) => `${step.fromModel}.${step.field}->${step.toModel}`);
  }

  private findStoreRelationPath(sourceModel: string): GraphRelationStep[] {
    const sourceId = this.modelNodeId(sourceModel);
    const targetId = this.modelNodeId('Store');
    const queue: Array<{ modelId: string; path: GraphRelationStep[] }> = [{ modelId: sourceId, path: [] }];
    const visited = new Set<string>([sourceId]);
    const edges = this.graphRelationEdges();
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      if (current.path.length >= 3) continue;
      const nextEdges = edges
        .filter((edge) => edge.from === current.modelId)
        .sort((a, b) => this.relationPriority(a) - this.relationPriority(b));
      for (const edge of nextEdges) {
        const step = this.toGraphRelationStep(edge);
        if (!step) continue;
        const path = [...current.path, step];
        if (edge.to === targetId) return path;
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        queue.push({ modelId: edge.to, path });
      }
    }
    return [];
  }

  private graphRelationEdges() {
    return AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.edges.filter((edge) => {
      if (edge.type !== 'FK_RELATION') return false;
      const relationType = String((edge.properties as Record<string, unknown> | undefined)?.relationType ?? '');
      return relationType === 'many_to_one';
    });
  }

  private relationPriority(edge: { to: string; properties?: Record<string, unknown> }) {
    if (edge.to === this.modelNodeId('Store')) return 0;
    const field = String(edge.properties?.field ?? '');
    const priority = ['store', 'order', 'sourceOrder', 'customer', 'card', 'sourceOrderItem', 'operator'];
    const index = priority.indexOf(field);
    return index === -1 ? 50 : index + 1;
  }

  private toGraphRelationStep(edge: { from: string; to: string; properties?: Record<string, unknown> }): GraphRelationStep | null {
    const field = String(edge.properties?.field ?? '');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) return null;
    const joinFields = Array.isArray(edge.properties?.joinFields) ? edge.properties.joinFields as Array<Record<string, unknown>> : [];
    const joinField = joinFields[0]?.from ? String(joinFields[0].from) : undefined;
    return {
      field,
      fromModel: this.modelNameFromNodeId(edge.from),
      toModel: this.modelNameFromNodeId(edge.to),
      joinField,
    };
  }

  private storeWhereFromRelationPath(path: GraphRelationStep[], storeId: number): Record<string, unknown> {
    const last = path[path.length - 1];
    let where: Record<string, unknown> = this.storeTerminalWhere(last, storeId);
    for (let index = path.length - 2; index >= 0; index -= 1) {
      where = { [path[index].field]: where };
    }
    return where;
  }

  private storeTerminalWhere(step: GraphRelationStep, storeId: number): Record<string, unknown> {
    if (step.joinField && /^[A-Za-z][A-Za-z0-9_]*$/.test(step.joinField) && !step.joinField.endsWith('s')) {
      return { [step.joinField]: storeId };
    }
    return { [step.field]: { id: storeId } };
  }

  private modelNodeId(model: string) {
    return `data-model:${model.toLowerCase()}`;
  }

  private modelNameFromNodeId(id: string) {
    const raw = id.replace(/^data-model:/, '');
    const node = AGENT_V2_KNOWLEDGE_GRAPH_SNAPSHOT.nodes.find((item) => item.id === id);
    return node?.name ?? raw;
  }

  private dynamicDateField(sourceModel: string) {
    const dateFieldByModel: Record<string, string> = {
      StockMovement: 'occurredAt',
      PaymentRecord: 'paidAt',
      RefundRecord: 'refundedAt',
      CardUsageRecord: 'verifiedAt',
      ConsumptionRecord: 'consumeTime',
      DailySettlement: 'settleDate',
      ProductOrder: 'createdAt',
      CustomerCard: 'createdAt',
      Product: 'updatedAt',
      CommissionRecord: 'createdAt',
    };
    return dateFieldByModel[sourceModel] ?? 'createdAt';
  }

  private manifestDateField(manifest: AgentV2CapabilityManifest, sourceModel: string) {
    const field = String(manifest.queryPlan?.dateField ?? '').trim();
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) return field;
    return this.dynamicDateField(sourceModel);
  }

  private dynamicOrderBy(manifest: AgentV2CapabilityManifest, fallbackDateField: string) {
    const orderBy = manifest.queryPlan?.orderBy;
    if (!orderBy) return { [fallbackDateField]: 'desc' };
    const sanitize = (item: Record<string, 'asc' | 'desc'>) => Object.fromEntries(
      Object.entries(item).filter(([field, direction]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(field) && ['asc', 'desc'].includes(direction)),
    );
    if (Array.isArray(orderBy)) {
      const items = orderBy.map((item) => sanitize(item)).filter((item) => Object.keys(item).length);
      return items.length ? items : { [fallbackDateField]: 'desc' };
    }
    const sanitized = sanitize(orderBy);
    return Object.keys(sanitized).length ? sanitized : { [fallbackDateField]: 'desc' };
  }

  private dynamicAggregations(manifest: AgentV2CapabilityManifest): AgentV2QueryAggregation[] {
    return (manifest.queryPlan?.aggregation ?? []).filter((item) => {
      if (!['count', 'sum', 'avg', 'min', 'max'].includes(item.type)) return false;
      if (item.type === 'count') return true;
      return Boolean(item.field && /^[A-Za-z][A-Za-z0-9_]*$/.test(item.field));
    });
  }

  private aggregateRows(rows: Array<Record<string, unknown>>, aggregations: AgentV2QueryAggregation[]) {
    if (!aggregations.length) return {};
    return Object.fromEntries(aggregations.map((aggregation) => {
      const key = aggregation.as || [aggregation.type, aggregation.field].filter(Boolean).join('_');
      if (aggregation.type === 'count') return [key || 'count', rows.length];
      const values = rows.map((row) => this.toNumber(row[aggregation.field ?? ''])).filter((value) => Number.isFinite(value));
      if (aggregation.type === 'sum') return [key, values.reduce((sum, value) => sum + value, 0)];
      if (aggregation.type === 'avg') return [key, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0];
      if (aggregation.type === 'min') return [key, values.length ? Math.min(...values) : 0];
      return [key, values.length ? Math.max(...values) : 0];
    }));
  }

  private resolveDynamicLimit(input: GenericQueryInput) {
    const manifestLimit = this.normalizeManifestTake(input.manifest.queryPlan?.take);
    const requested = this.resolveLimit(input.args.limit ?? manifestLimit ?? undefined);
    return manifestLimit ? Math.min(requested, manifestLimit) : requested;
  }

  private normalizeManifestTake(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.min(Math.floor(parsed), 100);
  }

  private dynamicSelectFields(manifest: AgentV2CapabilityManifest) {
    const fields = manifest.fieldPolicies
      .filter((policy) => policy.visibility !== 'deny')
      .map((policy) => policy.field)
      .filter((field) => /^[A-Za-z][A-Za-z0-9_]*$/.test(field));
    return Array.from(new Set(['id', ...fields])).slice(0, 24);
  }

  private mapDynamicRow(row: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date ? this.formatDateTime(value) : value,
      ]),
    );
  }

  private sqlSummary(
    model: string,
    where: Record<string, unknown>,
    take: number,
    include?: string[],
    select?: string[],
    orderBy?: unknown,
    operation: 'findMany' | 'findFirst' = 'findMany',
  ): GenericQueryTrace['sqlSummary'] {
    const whereClauses = this.sqlWhereClauses(where);
    const orderByText = orderBy ? this.sqlOrderBy(orderBy) : undefined;
    const relationHint = include?.length ? ` /* include ${include.join(', ')} */` : '';
    const selectText = select?.length ? select.join(', ') : '*';
    const whereText = whereClauses.length ? whereClauses.join(' AND ') : 'TRUE';
    const orderText = orderByText ? ` ORDER BY ${orderByText}` : '';
    return {
      dialect: 'prisma_sql_summary',
      operation,
      model,
      statementPreview: `SELECT ${selectText} FROM "${model}" WHERE ${whereText}${orderText} LIMIT ${take};${relationHint}`,
      whereClauses,
      include,
      select,
      orderBy: orderByText,
      take,
      sensitiveValuesRedacted: true,
    };
  }

  private sqlWhereClauses(where: Record<string, unknown>) {
    return Object.entries(where).flatMap(([key, value]) => this.sqlClauseForEntry(key, value));
  }

  private sqlClauseForEntry(key: string, value: unknown): string[] {
    if (key === 'OR' && Array.isArray(value)) {
      return [`(${value.map((_, index) => `OR_BRANCH_${index + 1}`).join(' OR ')})`];
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const clauses: string[] = [];
      if ('gte' in record) clauses.push(`${key} >= :${key}Start`);
      if ('gt' in record) clauses.push(`${key} > :${key}Min`);
      if ('lte' in record) clauses.push(`${key} <= :${key}End`);
      if ('lt' in record) clauses.push(`${key} < :${key}End`);
      if ('contains' in record) clauses.push(`${key} ILIKE :${key}`);
      if ('in' in record) clauses.push(`${key} IN (:${key}List)`);
      if ('notIn' in record) clauses.push(`${key} NOT IN (:${key}List)`);
      if ('some' in record) clauses.push(`EXISTS(${key})`);
      if (clauses.length) return clauses;
      return [`${key} = :${key}`];
    }
    return [`${key} = :${key}`];
  }

  private sqlOrderBy(orderBy: unknown): string {
    if (!orderBy || typeof orderBy !== 'object') return String(orderBy ?? '');
    if (Array.isArray(orderBy)) {
      return orderBy.map((item) => this.sqlOrderBy(item)).filter(Boolean).join(', ');
    }
    return Object.entries(orderBy as Record<string, unknown>)
      .map(([field, direction]) => `${field} ${String(direction).toUpperCase()}`)
      .join(', ');
  }

  private evidence(
    manifest: AgentV2CapabilityManifest,
    metricDefinition: string,
    filters: string[],
    sampleSize: number,
    range?: GenericQueryDateRange,
    limitations: string[] = [],
  ): AgentEvidence {
    return {
      source: manifest.sourceModels,
      sourceTables: manifest.sourceModels,
      dateRange: range ? `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}` : undefined,
      metricDefinition,
      filters,
      sampleSize,
      limitations: [
        '由 GenericQueryEngine 根据 Manifest、sourceModels、storeScope 和 fieldPolicies 执行。',
        '默认只读取当前账号授权门店范围内的已落库业务数据，不执行写入、删除、发券或下发。',
        ...limitations,
      ],
    };
  }

  private filterTexts(where: Record<string, unknown>, range?: GenericQueryDateRange) {
    const filters: string[] = [];
    filters.push(...this.storeScopeFilterTexts(where));
    if ('movementType' in where) filters.push(`movementType=${String(where.movementType)}`);
    if ('orderNo' in where) filters.push(`orderNo~${String((where.orderNo as any)?.contains ?? '')}`);
    if ('deletedAt' in where) filters.push(`deletedAt=${where.deletedAt === null ? 'null' : String(where.deletedAt)}`);
    if ('remainingTimes' in where) filters.push('remainingTimes>0');
    if ('status' in where) {
      const status = where.status as any;
      if (status?.notIn) filters.push('status not in cancelled/void');
      else if (status?.in) filters.push(`status in ${status.in.join('/')}`);
      else filters.push(`status=${String(status)}`);
    }
    if (range) filters.push(`${range.preset}= ${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`);
    return filters;
  }

  private storeScopeFilterTexts(value: unknown, path = ''): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return [];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const currentPath = path ? `${path}.${key}` : key;
      if (key === 'storeId') return [`${currentPath}=${String(nested)}`];
      if (key === 'id' && path.endsWith('store')) return [`${currentPath}=${String(nested)}`];
      return this.storeScopeFilterTexts(nested, currentPath);
    });
  }

  private applyFieldPolicies<T extends Record<string, unknown>>(rows: T[], policies: AgentV2FieldPolicy[]): T[] {
    const policyByField = new Map(policies.map((policy) => [policy.field, policy]));
    return rows.map((row) => {
      const next: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(row)) {
        const policy = policyByField.get(field);
        if (policy?.visibility === 'deny') continue;
        next[field] = policy?.visibility === 'mask' && value ? '已脱敏' : value;
      }
      return next as T;
    });
  }

  private failed(manifest: AgentV2CapabilityManifest, reason: string, summary: string): AgentToolResult {
    return {
      status: 'failed',
      title: manifest.displayName,
      summary,
      data: { capabilityId: manifest.capabilityId, reason },
      evidence: {
        source: manifest.sourceModels,
        sourceTables: manifest.sourceModels,
        metricDefinition: '未执行数据查询。',
        filters: [
          `storeScope=${manifest.storeScope}`,
          'storeId=missing',
        ],
        sampleSize: 0,
        limitations: ['通用查询计划生成失败，需进入治理中心处理。'],
      },
      actions: [],
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

  private mapOrderDetail(order: any) {
    return {
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

  private resolveLimit(input: unknown) {
    return Math.min(Math.max(Number(input) || 20, 1), 100);
  }

  private resolveRiskWindowDays(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const raw = Number(filters.riskWindowDays ?? filters.expiringDays ?? args.riskWindowDays ?? args.expiringDays ?? 30);
    return Math.min(Math.max(Number.isFinite(raw) ? raw : 30, 1), 365);
  }

  private resolveInactiveThresholdDays(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const raw = Number(filters.inactiveDays ?? args.inactiveDays ?? 30);
    return Math.min(Math.max(Number.isFinite(raw) ? raw : 30, 1), 365);
  }

  private resolveQueryDateRange(args: Record<string, unknown>, fallbackPreset: string): GenericQueryDateRange {
    return resolveAgentV2QueryDateRange(args, fallbackPreset);
  }

  private resolveTrendRange(args: Record<string, unknown>): GenericQueryDateRange {
    return resolveAgentV2QueryDateRange(args, 'last_7_days');
  }

  private createdAtWhere(range: GenericQueryDateRange) {
    return this.dateFieldWhere('createdAt', range);
  }

  private dateFieldWhere(field: string, range: GenericQueryDateRange) {
    if (range.preset === 'all') return {};
    return { [field]: { gte: range.start, lt: range.end } };
  }

  private paymentTimeWhere(range: GenericQueryDateRange) {
    if (range.preset === 'all') return {};
    return { OR: [{ paidAt: { gte: range.start, lt: range.end } }, { createdAt: { gte: range.start, lt: range.end } }] };
  }

  private refundTimeWhere(range: GenericQueryDateRange) {
    if (range.preset === 'all') return {};
    return { OR: [{ refundedAt: { gte: range.start, lt: range.end } }, { createdAt: { gte: range.start, lt: range.end } }] };
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

  private serializeRange(range: GenericQueryDateRange) {
    return { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label, preset: range.preset };
  }

  private startOfDay(date: Date) {
    return startOfAgentV2Day(date);
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

  private dailySettlementStatusLabel(value: unknown) {
    const map: Record<string, string> = { draft: '待确认', generated: '已生成', confirmed: '已确认', closed: '已关闭' };
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

  private cardStatusLabel(value: unknown) {
    const map: Record<string, string> = { active: '可用', enabled: '可用', expired: '已过期', disabled: '停用', used_up: '已用完' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private consumeTypeLabel(value: unknown) {
    const map: Record<string, string> = { product_order: '商品订单', project_order: '项目订单', card_usage: '次卡核销', member_card: '会员卡', service: '服务记录' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '消费记录');
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
