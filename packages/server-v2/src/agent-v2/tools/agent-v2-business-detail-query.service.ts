import { Injectable, Optional } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { formatBusinessDateTime } from '../../common/utils/business-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import { AgentV2ManifestProviderService } from '../capability-center/agent-v2-manifest-provider.service.js';
import { GenericQueryEngineService } from '../query-engine/generic-query-engine.service.js';

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
