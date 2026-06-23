import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { QueryCustomersDto } from './dto/query-customers.dto.js';
import { formatBusinessDate, formatBusinessDateTime } from '../common/utils/business-time.js';

type ConsumptionNameMaps = {
  projects?: Map<number, string>;
  products?: Map<number, string>;
  cards?: Map<number, string>;
  fallbackByRecordId?: Map<number, string>;
};

type UnifiedConsumptionRow = {
  id: string | number;
  customerId: number;
  userName: string;
  storeName?: string;
  consumeType: string;
  consumeContent: string;
  payMethod?: string;
  amountValue: number;
  campaign?: string;
  consumeDate: Date;
  sourceType: string;
  sourceId: number;
  orderNo?: string;
};

type ConsumptionRecordView = {
  id: number;
  customerId: number;
  userName: string;
  storeName?: string;
  consumeType: string;
  consumeContent: string;
  payMethod?: string;
  amount: string;
  campaign?: string;
  consumeTime: string;
  rawConsumeTime?: Date | null;
};

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  private formatDate(value?: Date | null) {
    return formatBusinessDate(value);
  }

  private formatDateTime(value?: Date | null) {
    return formatBusinessDateTime(value);
  }

  private formatMoney(value: unknown) {
    const amount = Number(value ?? 0);
    return `￥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    const amount = typeof value === 'string' ? Number(value.replace(/[^\d.-]/g, '')) : Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }

  private toCustomerView(customer: any) {
    const balanceAccount = Array.isArray(customer.balanceAccounts) ? customer.balanceAccounts[0] : undefined;
    const cashBalance = Number(balanceAccount?.cashBalance ?? 0);
    const giftBalance = Number(balanceAccount?.giftBalance ?? 0);
    return {
      ...customer,
      storeName: customer.store?.name ?? customer.storeName ?? '',
      birthday: this.formatDate(customer.birthday),
      lastVisitDate: this.formatDate(customer.lastVisitDate),
      createdAt: this.formatDate(customer.createdAt),
      totalSpent: Number(customer.totalSpent ?? 0),
      cashBalance,
      giftBalance,
      totalBalance: cashBalance + giftBalance,
      activeCustomerCardsCount: Array.isArray(customer.customerCards) ? customer.customerCards.length : 0,
      height: customer.height == null ? undefined : Number(customer.height),
      weight: customer.weight == null ? undefined : Number(customer.weight),
      store: undefined,
      balanceAccounts: undefined,
      customerCards: undefined,
    };
  }

  private toConsumptionRecordView(
    record: any,
    names: ConsumptionNameMaps = {},
  ) {
    return {
      ...record,
      userName: record.customer?.name ?? record.userName ?? '',
      storeName: record.customer?.store?.name ?? '',
      consumeContent: names.fallbackByRecordId?.get(record.id) ?? this.formatConsumptionContent(record.consumeContent, names),
      amount: this.formatMoney(record.amount),
      consumeTime: this.formatDateTime(record.consumeTime),
      rawConsumeTime: record.consumeTime,
      customer: undefined,
    };
  }

  private tryParseJson(value: unknown) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private addNumberRef(target: Set<number>, value: unknown) {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) target.add(id);
  }

  private collectConsumptionRefs(records: any[]) {
    const refs = {
      projectIds: new Set<number>(),
      productIds: new Set<number>(),
      cardIds: new Set<number>(),
    };

    for (const record of records) {
      const content = String(record.consumeContent ?? '');
      for (const match of content.matchAll(/\b(project|product|card)#(\d+)x\d+/gi)) {
        const [, type, id] = match;
        if (type.toLowerCase() === 'project') this.addNumberRef(refs.projectIds, id);
        if (type.toLowerCase() === 'product') this.addNumberRef(refs.productIds, id);
        if (type.toLowerCase() === 'card') this.addNumberRef(refs.cardIds, id);
      }

      const parsed = this.tryParseJson(content);
      const payloads = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      for (const payload of payloads) {
        this.addNumberRef(refs.projectIds, payload?.projectId);
        this.addNumberRef(refs.productIds, payload?.productId);
        this.addNumberRef(refs.cardIds, payload?.cardId);
        const items = Array.isArray(payload?.consumptionItems) ? payload.consumptionItems : Array.isArray(payload?.items) ? payload.items : [];
        for (const item of items) {
          this.addNumberRef(refs.projectIds, item?.projectId ?? (item?.itemType === 'project' ? item?.itemId : undefined));
          this.addNumberRef(refs.productIds, item?.productId ?? (item?.itemType === 'product' ? item?.itemId : undefined));
          this.addNumberRef(refs.cardIds, item?.cardId ?? (item?.itemType === 'card' ? item?.itemId : undefined));
        }
      }
    }

    return refs;
  }

  private isQuestionPlaceholder(value: unknown) {
    const text = String(value ?? '').trim();
    return /^\?+(?:\s*x\s*\d+)?$/i.test(text);
  }

  private async resolveMalformedConsumptionNames(records: any[]) {
    const malformedRecords = records.filter((record) => this.isQuestionPlaceholder(record.consumeContent));
    if (!malformedRecords.length) return new Map<number, string>();

    const customerIds = [...new Set(malformedRecords.map((record) => Number(record.customerId)).filter(Boolean))];
    const times = malformedRecords
      .map((record) => (record.consumeTime ? new Date(record.consumeTime).getTime() : 0))
      .filter((time) => Number.isFinite(time) && time > 0);
    if (!customerIds.length || !times.length) return new Map<number, string>();

    const windowMs = 10 * 60 * 1000;
    const orders = await this.prisma.productOrder.findMany({
      where: {
        customerId: { in: customerIds },
        createdAt: {
          gte: new Date(Math.min(...times) - windowMs),
          lte: new Date(Math.max(...times) + windowMs),
        },
      },
      select: {
        id: true,
        customerId: true,
        totalAmount: true,
        createdAt: true,
        items: true,
        orderItems: { select: { itemType: true, itemId: true, name: true, quantity: true, unitPrice: true } },
      },
    });

    const projectIds = new Set<number>();
    const productIds = new Set<number>();
    const cardIds = new Set<number>();
    const orderItemsByOrderId = new Map<number, any[]>();

    for (const order of orders) {
      const orderItems: any[] = Array.isArray(order.orderItems) && order.orderItems.length
        ? (order.orderItems as any[])
        : Array.isArray(order.items)
          ? (order.items as any[])
          : [];
      orderItemsByOrderId.set(order.id, orderItems);
      for (const item of orderItems) {
        const type = String(item.itemType ?? item.type ?? '').toLowerCase();
        const id = Number(item.itemId ?? item.productId ?? item.projectId ?? item.cardId);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (type === 'project') projectIds.add(id);
        if (type === 'product') productIds.add(id);
        if (type === 'card') cardIds.add(id);
      }
    }

    const amountValues = [...new Set(malformedRecords.map((record) => Number(record.amount)).filter((amount) => amount > 0))];
    const [projectsById, productsById, cardsById, projectsByPrice] = await Promise.all([
      projectIds.size
        ? this.prisma.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, name: true } })
        : [],
      productIds.size
        ? this.prisma.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, name: true } })
        : [],
      cardIds.size ? this.prisma.card.findMany({ where: { id: { in: [...cardIds] } }, select: { id: true, name: true } }) : [],
      amountValues.length
        ? this.prisma.project.findMany({
            where: { deletedAt: null, status: 'active', price: { in: amountValues } },
            select: { id: true, name: true, price: true },
          })
        : [],
    ]);

    const projectNameById = new Map(projectsById.map((item) => [item.id, item.name]));
    const productNameById = new Map(productsById.map((item) => [item.id, item.name]));
    const cardNameById = new Map(cardsById.map((item) => [item.id, item.name]));
    const uniqueProjectNameByPrice = new Map<number, string>();
    for (const amount of amountValues) {
      const matches = (projectsByPrice as any[]).filter((project) => Number(project.price) === amount);
      if (matches.length === 1) uniqueProjectNameByPrice.set(amount, matches[0].name);
    }

    const fallbackByRecordId = new Map<number, string>();
    for (const record of malformedRecords) {
      const recordTime = record.consumeTime ? new Date(record.consumeTime).getTime() : 0;
      const amount = Number(record.amount);
      const order = orders
        .filter((item) => Number(item.customerId) === Number(record.customerId) && Number(item.totalAmount) === amount)
        .sort((a, b) => Math.abs(new Date(a.createdAt).getTime() - recordTime) - Math.abs(new Date(b.createdAt).getTime() - recordTime))[0];
      const items = order ? orderItemsByOrderId.get(order.id) ?? [] : [];
      const labels = items.map((item) => {
        const type = String(item.itemType ?? item.type ?? '').toLowerCase();
        const id = Number(item.itemId ?? item.productId ?? item.projectId ?? item.cardId);
        const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
        const rawName = item.name ?? item.productName ?? item.projectName ?? item.cardName;
        const resolvedName =
          (type === 'project' ? projectNameById.get(id) : undefined) ||
          (type === 'product' ? productNameById.get(id) : undefined) ||
          (type === 'card' ? cardNameById.get(id) : undefined) ||
          (!this.isQuestionPlaceholder(rawName) ? String(rawName ?? '').trim() : '') ||
          (type === 'project' ? uniqueProjectNameByPrice.get(amount) : undefined);
        return resolvedName ? `${resolvedName} x${quantity}` : '';
      }).filter(Boolean);

      if (labels.length) {
        fallbackByRecordId.set(record.id, labels.join('、'));
      } else {
        const fallback = uniqueProjectNameByPrice.get(amount);
        if (fallback) fallbackByRecordId.set(record.id, `${fallback} x1`);
      }
    }

    return fallbackByRecordId;
  }

  private async resolveConsumptionNames(records: any[]) {
    const refs = this.collectConsumptionRefs(records);
    const [projects, products, cards, fallbackByRecordId] = await Promise.all([
      refs.projectIds.size
        ? this.prisma.project.findMany({ where: { id: { in: [...refs.projectIds] } }, select: { id: true, name: true } })
        : [],
      refs.productIds.size
        ? this.prisma.product.findMany({ where: { id: { in: [...refs.productIds] } }, select: { id: true, name: true } })
        : [],
      refs.cardIds.size ? this.prisma.card.findMany({ where: { id: { in: [...refs.cardIds] } }, select: { id: true, name: true } }) : [],
      this.resolveMalformedConsumptionNames(records),
    ]);

    return {
      projects: new Map(projects.map((item) => [item.id, item.name])),
      products: new Map(products.map((item) => [item.id, item.name])),
      cards: new Map(cards.map((item) => [item.id, item.name])),
      fallbackByRecordId,
    };
  }

  private getNamedItem(
    type: string,
    id: unknown,
    quantity: unknown,
    names: {
      projects?: Map<number, string>;
      products?: Map<number, string>;
      cards?: Map<number, string>;
    },
    fallbackName?: string,
  ) {
    const itemId = Number(id);
    const qty = Number(quantity ?? 1) || 1;
    const normalizedType = String(type || '').toLowerCase();
    const name =
      fallbackName ||
      (normalizedType === 'project' ? names.projects?.get(itemId) : undefined) ||
      (normalizedType === 'product' ? names.products?.get(itemId) : undefined) ||
      (normalizedType === 'card' ? names.cards?.get(itemId) : undefined);
    const typeLabel =
      normalizedType === 'project' ? '项目' : normalizedType === 'product' ? '商品' : normalizedType === 'card' ? '卡项' : '消费项目';

    return `${name || typeLabel} x${qty}`;
  }

  private formatConsumptionItem(item: any, names: ConsumptionNameMaps) {
    const type = String(item?.itemType ?? item?.type ?? (item?.projectId ? 'project' : item?.productId ? 'product' : item?.cardId ? 'card' : ''));
    const id = item?.itemId ?? item?.projectId ?? item?.productId ?? item?.cardId;
    const fallbackName = item?.name ?? item?.projectName ?? item?.productName ?? item?.cardName;
    if (!type && fallbackName) return `${fallbackName}${item?.quantity ? ` x${item.quantity}` : ''}`;
    return this.getNamedItem(type, id, item?.quantity ?? item?.qty, names, fallbackName);
  }

  private formatConsumptionContent(
    value: unknown,
    names: ConsumptionNameMaps,
  ) {
    const content = String(value ?? '').trim();
    if (!content) return '-';

    const parsed = this.tryParseJson(content);
    if (parsed && !Array.isArray(parsed)) {
      const projectName = parsed.projectName ?? (parsed.projectId ? names.projects?.get(Number(parsed.projectId)) : undefined);
      const result = parsed.result ? String(parsed.result) : '服务记录';
      const parts = [projectName ? `${result}：${projectName}` : result];
      const items = Array.isArray(parsed.consumptionItems) ? parsed.consumptionItems : [];
      if (items.length) {
        parts.push(`消耗物料：${items.map((item: any) => this.formatConsumptionItem(item, names)).join('、')}`);
      }
      if (parsed.nextSuggestion) parts.push(`护理建议：${parsed.nextSuggestion}`);
      if (parsed.nextReservationSuggestion) parts.push(`下次预约建议：${parsed.nextReservationSuggestion}`);
      return parts.filter(Boolean).join('；');
    }

    if (Array.isArray(parsed)) {
      const formatted = parsed.map((item) => this.formatConsumptionItem(item, names)).filter(Boolean);
      return formatted.length ? formatted.join('、') : '-';
    }

    const formatted = [...content.matchAll(/\b(project|product|card|recharge)#(\d+)x(\d+)/gi)].map((match) => {
      const [, type, id, quantity] = match;
      if (type.toLowerCase() === 'recharge') return `会员充值 x${quantity || 1}`;
      return this.getNamedItem(type, id, quantity, names);
    });

    return formatted.length ? formatted.join('、') : content;
  }

  private async toConsumptionRecordViews(records: any[]) {
    const names = await this.resolveConsumptionNames(records);
    return records.map((record) => this.toConsumptionRecordView(record, names));
  }

  private normalizeConsumptionDate(value: unknown) {
    const date = value ? new Date(value as any) : new Date(0);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  private inferOrderConsumeType(order: any) {
    const items = this.getOrderItems(order);
    const types = new Set(items.map((item: any) => String(item.itemType ?? item.type ?? '').toLowerCase()));
    if (types.has('recharge')) return String(order.orderNo ?? '').startsWith('MO') ? '会员开卡' : '会员充值';
    if (types.has('card')) return '次卡开卡';
    if (types.has('project')) return '项目订单';
    if (types.has('product') || types.has('goods')) return '商品订单';
    return '订单消费';
  }

  private getOrderItems(order: any) {
    if (Array.isArray(order.orderItems) && order.orderItems.length) return order.orderItems;
    return Array.isArray(order.items) ? order.items : [];
  }

  private formatOrderItemLabel(item: any) {
    const name = String(item.name ?? item.productName ?? item.projectName ?? item.cardName ?? item.itemName ?? '').trim();
    const type = String(item.itemType ?? item.type ?? '').toLowerCase();
    const typeLabel =
      type === 'project'
        ? '项目'
        : type === 'product' || type === 'goods'
          ? '商品'
          : type === 'card'
            ? '次卡'
            : type === 'recharge'
              ? '会员充值'
              : '消费项目';
    const quantity = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
    return `${name || typeLabel} x${quantity}`;
  }

  private formatOrderContent(order: any) {
    const items = this.getOrderItems(order).map((item: any) => this.formatOrderItemLabel(item)).filter(Boolean);
    const prefix = order.orderNo ? `订单号 ${order.orderNo}` : '';
    const content = items.length ? items.join('、') : String(order.remark ?? '').trim();
    return [prefix, content].filter(Boolean).join('；') || '-';
  }

  private mapOrderToUnifiedConsumption(order: any): UnifiedConsumptionRow {
    const customerId = this.toNumber(order.customerId ?? order.customer?.id);
    return {
      id: `order-${order.id}`,
      customerId,
      userName: order.customer?.name ?? order.customerName ?? '',
      storeName: order.customer?.store?.name ?? order.store?.name ?? '',
      consumeType: this.inferOrderConsumeType(order),
      consumeContent: this.formatOrderContent(order),
      payMethod: order.payMethod ?? order.paymentRecords?.[0]?.method ?? '',
      amountValue: this.toNumber(order.totalAmount),
      campaign: order.source === 'terminal' ? '终端收银' : order.source === 'admin' ? '管理端订单' : order.source ?? '',
      consumeDate: this.normalizeConsumptionDate(order.paymentRecords?.[0]?.paidAt ?? order.updatedAt ?? order.createdAt),
      sourceType: 'order',
      sourceId: this.toNumber(order.id),
      orderNo: order.orderNo,
    };
  }

  private mapBalanceTransactionToUnifiedConsumption(transaction: any): UnifiedConsumptionRow {
    const type = String(transaction.type ?? '');
    const typeLabel =
      type === 'open'
        ? '会员开卡'
        : type === 'recharge'
          ? '会员充值'
          : type === 'deduct' || type === 'consume'
            ? '会员卡划扣'
            : type === 'gift'
              ? '会员赠送'
              : '会员卡流水';
    const amount = this.toNumber(transaction.amount);
    const giftAmount = this.toNumber(transaction.giftAmount);
    const contentParts = [
      transaction.order?.orderNo ? `订单号 ${transaction.order.orderNo}` : `流水号 ${transaction.transactionNo}`,
      typeLabel,
      giftAmount > 0 ? `赠送 ${this.formatMoney(giftAmount)}` : '',
      transaction.remark,
    ];
    return {
      id: `balance-${transaction.id}`,
      customerId: this.toNumber(transaction.customerId),
      userName: transaction.customer?.name ?? '',
      storeName: transaction.customer?.store?.name ?? transaction.store?.name ?? '',
      consumeType: typeLabel,
      consumeContent: contentParts.filter(Boolean).join('；'),
      payMethod: transaction.paymentMethod ?? '',
      amountValue: amount,
      campaign: transaction.operator?.name ? `办理人员：${transaction.operator.name}` : '',
      consumeDate: this.normalizeConsumptionDate(transaction.createdAt),
      sourceType: 'balance_transaction',
      sourceId: this.toNumber(transaction.id),
      orderNo: transaction.order?.orderNo,
    };
  }

  private mapCustomerCardToUnifiedConsumption(card: any): UnifiedConsumptionRow {
    const price = this.toNumber(card.card?.price);
    return {
      id: `customer-card-${card.id}`,
      customerId: this.toNumber(card.customerId),
      userName: card.customer?.name ?? '',
      storeName: card.customer?.store?.name ?? '',
      consumeType: '次卡开卡',
      consumeContent: `开卡：${card.cardName}；总次数 ${card.totalTimes} 次；到期 ${this.formatDate(card.expiryDate)}`,
      payMethod: '',
      amountValue: price,
      campaign: card.operator?.name ? `办理人员：${card.operator.name}` : '次卡开卡',
      consumeDate: this.normalizeConsumptionDate(card.createdAt),
      sourceType: 'customer_card',
      sourceId: this.toNumber(card.id),
    };
  }

  private mapCardUsageToUnifiedConsumption(record: any): UnifiedConsumptionRow {
    const matchedCard =
      record.customer?.customerCards?.find((card: any) => card.cardName === record.cardName) ??
      record.customer?.customerCards?.[0];
    const cardPrice = this.toNumber(matchedCard?.card?.price);
    const totalTimes = this.toNumber(matchedCard?.card?.totalTimes ?? matchedCard?.totalTimes);
    const unitValue = totalTimes > 0 ? cardPrice / totalTimes : 0;
    const times = this.toNumber(record.times) || 1;
    return {
      id: `card-usage-${record.id}`,
      customerId: this.toNumber(record.customerId),
      userName: record.customer?.name ?? record.customerName ?? '',
      storeName: record.customer?.store?.name ?? '',
      consumeType: '次卡核销',
      consumeContent: `核销：${record.cardName}；项目 ${record.projectName} x${times} 次；剩余 ${record.remainingTimes} 次`,
      payMethod: '次卡核销',
      amountValue: Math.round(unitValue * times * 100) / 100,
      campaign: record.beautician?.name ? `服务人员：${record.beautician.name}` : '',
      consumeDate: this.normalizeConsumptionDate(record.verifiedAt),
      sourceType: 'card_usage',
      sourceId: this.toNumber(record.id),
    };
  }

  private mapConsumptionRecordToUnifiedConsumption(record: ConsumptionRecordView): UnifiedConsumptionRow {
    return {
      id: `consumption-${record.id}`,
      customerId: this.toNumber(record.customerId),
      userName: record.userName ?? '',
      storeName: record.storeName ?? '',
      consumeType: record.consumeType,
      consumeContent: record.consumeContent,
      payMethod: record.payMethod,
      amountValue: this.toNumber(record.amount),
      campaign: record.campaign,
      consumeDate: this.normalizeConsumptionDate(record.rawConsumeTime ?? record.consumeTime),
      sourceType: 'consumption_record',
      sourceId: this.toNumber(record.id),
    };
  }

  private toUnifiedConsumptionView(row: UnifiedConsumptionRow) {
    return {
      id: row.id,
      customerId: row.customerId,
      userName: row.userName,
      storeName: row.storeName ?? '',
      consumeType: row.consumeType,
      consumeContent: row.consumeContent || '-',
      payMethod: row.payMethod || '-',
      amount: this.formatMoney(row.amountValue),
      campaign: row.campaign || '-',
      consumeTime: this.formatDateTime(row.consumeDate),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      orderNo: row.orderNo,
    };
  }

  private isNearDuplicateConsumption(row: UnifiedConsumptionRow, orders: UnifiedConsumptionRow[]) {
    if (row.sourceType !== 'consumption_record') return false;
    const time = row.consumeDate.getTime();
    return orders.some((order) => {
      if (order.customerId !== row.customerId) return false;
      if (Math.abs(order.amountValue - row.amountValue) > 0.01) return false;
      return Math.abs(order.consumeDate.getTime() - time) <= 10 * 60 * 1000;
    });
  }

  private filterUnifiedConsumptionRows(rows: UnifiedConsumptionRow[], keyword: string) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return rows;
    return rows.filter((row) =>
      [
        row.userName,
        row.storeName,
        row.consumeType,
        row.consumeContent,
        row.payMethod,
        row.campaign,
        row.orderNo,
        String(row.customerId),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword)),
    );
  }

  private async loadUnifiedConsumptionRows(params: { customerId?: number; keyword?: string; storeId?: number; take?: number } = {}) {
    const keyword = String(params.keyword ?? '').trim();
    const take = params.take ?? 3000;
    const customerWhere: any = {
      ...(params.customerId ? { id: params.customerId } : {}),
      ...(params.storeId ? { storeId: params.storeId } : {}),
      deletedAt: null,
    };
    const customerFilter = params.customerId || params.storeId ? { customer: customerWhere } : {};
    const orderWhere: any = {
      customerId: { not: null },
      status: { notIn: ['cancelled', 'canceled', 'refunded'] },
      ...(params.customerId ? { customerId: params.customerId } : {}),
    };
    if (params.storeId) {
      orderWhere.OR = [
        { storeId: params.storeId },
        { customer: { storeId: params.storeId, deletedAt: null } },
      ];
    }

    const [consumptionRecords, orders, balanceTransactions, customerCards, cardUsageRecords] = await Promise.all([
      this.prisma.consumptionRecord.findMany({
        where: this.getCustomerConsumptionWhere({
          ...(params.customerId ? { customerId: params.customerId } : {}),
          ...(params.customerId || params.storeId ? customerFilter : {}),
        }),
        select: {
          id: true,
          customerId: true,
          consumeType: true,
          consumeContent: true,
          payMethod: true,
          amount: true,
          campaign: true,
          consumeTime: true,
          customer: { select: { name: true, store: { select: { name: true } } } },
        },
        orderBy: { consumeTime: 'desc' },
        take,
      }),
      this.prisma.productOrder.findMany({
        where: orderWhere,
        include: {
          customer: { select: { id: true, name: true, phone: true, store: { select: { name: true } } } },
          store: { select: { id: true, name: true } },
          orderItems: true,
          paymentRecords: { orderBy: { paidAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.customerBalanceTransaction.findMany({
        where: {
          type: { in: ['open', 'recharge', 'deduct', 'consume'] },
          ...(params.customerId ? { customerId: params.customerId } : {}),
          ...(params.storeId ? { storeId: params.storeId } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, store: { select: { name: true } } } },
          store: { select: { id: true, name: true } },
          order: { select: { id: true, orderNo: true } },
          operator: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.customerCard.findMany({
        where: {
          ...(params.customerId ? { customerId: params.customerId } : {}),
          ...(params.storeId ? { customer: { ...customerWhere } } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true, store: { select: { name: true } } } },
          card: { select: { id: true, name: true, price: true, totalTimes: true } },
          operator: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.cardUsageRecord.findMany({
        where: {
          ...(params.customerId ? { customerId: params.customerId } : {}),
          ...(params.storeId ? { customer: customerWhere } : {}),
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              store: { select: { name: true } },
              customerCards: {
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  cardName: true,
                  totalTimes: true,
                  remainingTimes: true,
                  createdAt: true,
                  card: { select: { id: true, price: true, totalTimes: true } },
                },
              },
            },
          },
          beautician: { select: { id: true, name: true } },
        },
        orderBy: { verifiedAt: 'desc' },
        take,
      }),
    ]);

    const namedConsumptionRecords = await this.toConsumptionRecordViews(consumptionRecords);
    const orderRows = orders.map((order) => this.mapOrderToUnifiedConsumption(order)).filter((row) => row.customerId);
    const balanceOrderNos = new Set(orderRows.map((row) => row.orderNo).filter(Boolean));
    const balanceRows = balanceTransactions
      .map((transaction) => this.mapBalanceTransactionToUnifiedConsumption(transaction))
      .filter((row) => row.customerId && (!row.orderNo || !balanceOrderNos.has(row.orderNo)));
    const customerCardRows = customerCards
      .map((card) => this.mapCustomerCardToUnifiedConsumption(card))
      .filter((row) => {
        if (!row.customerId) return false;
        const dateKey = row.consumeDate.toISOString().slice(0, 10);
        return !orderRows.some(
          (order) =>
            order.consumeType === '次卡开卡' &&
            order.customerId === row.customerId &&
            order.consumeDate.toISOString().slice(0, 10) === dateKey &&
            order.consumeContent.includes(row.consumeContent.replace(/^开卡：/, '').split('；')[0] ?? ''),
        );
      });
    const cardUsageRows = cardUsageRecords.map((record) => this.mapCardUsageToUnifiedConsumption(record)).filter((row) => row.customerId);
    const consumptionRows = namedConsumptionRecords
      .map((record) => this.mapConsumptionRecordToUnifiedConsumption(record))
      .filter((row) => !this.isNearDuplicateConsumption(row, orderRows));
    const rows = [...orderRows, ...balanceRows, ...customerCardRows, ...cardUsageRows, ...consumptionRows]
      .sort((a, b) => b.consumeDate.getTime() - a.consumeDate.getTime() || String(b.id).localeCompare(String(a.id)));
    return this.filterUnifiedConsumptionRows(rows, keyword);
  }

  private getCustomerConsumptionWhere(extra: Record<string, any> = {}) {
    return {
      ...extra,
      NOT: [
        {
          consumeType: '服务记录',
          payMethod: 'service',
          amount: 0,
        },
      ],
    };
  }

  private toHealthProfileView(profile: any) {
    return {
      ...profile,
      name: profile.customer?.name ?? profile.name ?? '',
      lastCheck: this.formatDate(profile.lastCheck),
      customer: undefined,
    };
  }

  private normalizeCustomerPayload(dto: CreateCustomerDto | UpdateCustomerDto): Record<string, any> {
    const data: Record<string, any> = { ...dto };
    if (data.birthday) data.birthday = new Date(data.birthday);
    if (data.lastVisitDate) data.lastVisitDate = new Date(data.lastVisitDate);
    for (const key of ['age', 'height', 'weight']) {
      if (data[key] === '' || data[key] === null) {
        delete data[key];
      } else if (data[key] !== undefined) {
        data[key] = Number(data[key]);
      }
    }
    return data;
  }

  async findAll(storeId?: number) {
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        store: true,
        balanceAccounts: storeId ? { where: { storeId, status: 'active' }, take: 1 } : { where: { status: 'active' }, take: 1 },
        customerCards: { where: { status: 'active', remainingTimes: { gt: 0 } }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return customers.map((customer) => this.toCustomerView(customer));
  }

  async findPaginated(query: QueryCustomersDto, storeId?: number) {
    const { page = 1, pageSize = 20, keyword, name, phone, memberLevel, storeName } = query;
    const where: any = { deletedAt: null };

    if (storeId) where.storeId = storeId;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
      ];
    }
    if (name) where.name = { contains: name, mode: 'insensitive' };
    if (phone) where.phone = { contains: phone };
    if (memberLevel) where.memberLevel = memberLevel;
    if (storeName) where.store = { name: storeName };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: {
          store: true,
          balanceAccounts: storeId ? { where: { storeId, status: 'active' }, take: 1 } : { where: { status: 'active' }, take: 1 },
          customerCards: { where: { status: 'active', remainingTimes: { gt: 0 } }, select: { id: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const viewItems = items.map((customer) => this.toCustomerView(customer));
    return { items: viewItems, data: viewItems, total, page, pageSize };
  }

  async getCardPortraits(query: QueryCustomersDto, storeId?: number) {
    const page = Number(query.page ?? 1) || 1;
    const pageSize = Number(query.pageSize ?? 20) || 20;
    const { keyword, name, phone, memberLevel, storeName } = query;
    const where: any = { deletedAt: null };

    if (storeId) where.storeId = storeId;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
      ];
    }
    if (name) where.name = { contains: name, mode: 'insensitive' };
    if (phone) where.phone = { contains: phone };
    if (memberLevel) where.memberLevel = memberLevel;
    if (storeName) where.store = { name: storeName };

    const [customers, total, saleCards] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: { store: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
      this.prisma.card.findMany({
        where: {
          status: 'active',
          ...(storeId ? { OR: [{ storeId: null }, { storeId }] } : {}),
        },
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    const customerIds = customers.map((customer) => customer.id);
    const customerCards = customerIds.length
      ? await this.prisma.customerCard.findMany({
          where: { customerId: { in: customerIds } },
          include: {
            card: { select: { id: true, name: true, price: true, totalTimes: true, validDays: true, projects: true, status: true } },
            operator: { select: { id: true, name: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const customerCardsByCustomerId = new Map<number, any[]>();
    for (const card of customerCards) {
      const list = customerCardsByCustomerId.get(card.customerId) ?? [];
      list.push(card);
      customerCardsByCustomerId.set(card.customerId, list);
    }

    const toCardProjects = (value: unknown) => {
      const parsed = Array.isArray(value) ? value : this.tryParseJson(value);
      return (Array.isArray(parsed) ? parsed : [])
        .map((project: any) => ({
          projectName: String(project?.projectName ?? project?.name ?? project ?? '').trim(),
          timesPerCard: this.toNumber(project?.timesPerCard ?? project?.totalCount ?? project?.times ?? 0),
        }))
        .filter((project) => project.projectName);
    };

    const toAvailableCard = (card: any) => ({
      cardId: card.id,
      cardName: card.name,
      totalTimes: this.toNumber(card.totalTimes),
      price: this.toNumber(card.price),
      validDays: this.toNumber(card.validDays),
      storeId: card.storeId ?? null,
      storeName: card.store?.name ?? '全部门店',
      projects: toCardProjects(card.projects),
    });

    const availableCards = saleCards.map(toAvailableCard);
    const items = customers.map((customer) => {
      const purchasedCards = (customerCardsByCustomerId.get(customer.id) ?? []).map((card) => ({
        customerCardId: card.id,
        cardId: card.cardId,
        cardName: card.cardName ?? card.card?.name ?? '',
        totalTimes: this.toNumber(card.totalTimes),
        remainingTimes: this.toNumber(card.remainingTimes),
        usedTimes: Math.max(0, this.toNumber(card.totalTimes) - this.toNumber(card.remainingTimes)),
        paidAmount: this.toNumber(card.paidAmount),
        discountAmount: this.toNumber(card.discountAmount),
        giftTimes: this.toNumber(card.giftTimes),
        status: card.status,
        expireTime: this.formatDate(card.expiryDate),
        purchaseTime: this.formatDate(card.createdAt),
        operatorName: card.operator?.name ?? card.operator?.username ?? '',
        projects: toCardProjects(card.card?.projects),
      }));
      const purchasedActiveIds = new Set(
        purchasedCards
          .filter((card) => !['voided', 'cancelled'].includes(String(card.status)))
          .map((card) => card.cardId)
          .filter(Boolean),
      );
      const missingCards = availableCards.filter((card) => !purchasedActiveIds.has(card.cardId));

      return {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone ?? '',
        storeId: customer.storeId,
        storeName: customer.store?.name ?? '',
        memberLevel: customer.memberLevel,
        totalSpent: this.toNumber(customer.totalSpent),
        lastVisitDate: this.formatDate(customer.lastVisitDate),
        purchasedCards,
        missingCards,
        purchasedCount: purchasedCards.length,
        missingCount: missingCards.length,
      };
    });

    return { items, data: items, total, page, pageSize };
  }

  async findById(id: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { healthProfile: true, store: true },
    });
    if (!customer || customer.deletedAt) throw new NotFoundException('客户不存在');
    return this.toCustomerView(customer);
  }

  async create(dto: CreateCustomerDto) {
    const data = this.normalizeCustomerPayload(dto);
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: data as any });
      await tx.customerHealthProfile.create({
        data: {
          customerId: customer.id,
          skinType: data.skinType || data.skinCondition || '未记录',
          skinStatus: data.skinCondition,
          allergyHistory: data.hasAllergy,
        },
      });
      return customer;
    });
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.findById(id);
    const data = this.normalizeCustomerPayload(dto);
    const healthData: Record<string, unknown> = {};
    if (data.skinType !== undefined) healthData.skinType = data.skinType || '未记录';
    if (data.skinCondition !== undefined) healthData.skinStatus = data.skinCondition;
    if (data.hasAllergy !== undefined) healthData.allergyHistory = data.hasAllergy;

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({ where: { id }, data: data as any });
      if (Object.keys(healthData).length > 0) {
        await tx.customerHealthProfile.upsert({
          where: { customerId: id },
          update: healthData,
          create: {
            customerId: id,
            skinType: String(healthData.skinType ?? data.skinType ?? data.skinCondition ?? '未记录'),
            skinStatus: data.skinCondition,
            allergyHistory: data.hasAllergy,
          },
        });
      }
      return customer;
    });
  }

  async remove(ids: number[]) {
    return this.prisma.customer.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
  }

  async getConsumptionRecords(customerId: number, page = 1, pageSize = 20) {
    const rows = await this.loadUnifiedConsumptionRows({ customerId });
    const total = rows.length;
    const viewItems = rows.slice((page - 1) * pageSize, page * pageSize).map((row) => this.toUnifiedConsumptionView(row));
    return { items: viewItems, data: viewItems, total, page, pageSize };
  }

  async getAllConsumptionRecords(storeId?: number) {
    const rows = await this.loadUnifiedConsumptionRows({ storeId });
    return rows.map((row) => this.toUnifiedConsumptionView(row));
  }

  async getConsumptionRecordsPaginated(
    query: { page?: number | string; pageSize?: number | string; keyword?: string } = {},
    storeId?: number,
  ) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(50, Math.max(10, Number(query.pageSize || 10)));
    const keyword = String(query.keyword ?? '').trim();
    const rows = await this.loadUnifiedConsumptionRows({ keyword, storeId });
    const total = rows.length;
    const viewItems = rows.slice((page - 1) * pageSize, page * pageSize).map((row) => this.toUnifiedConsumptionView(row));
    return { items: viewItems, data: viewItems, total, page, pageSize };
  }

  async getHealthProfile(customerId: number) {
    const profile = await this.prisma.customerHealthProfile.findUnique({
      where: { customerId },
      include: { customer: true },
    });
    return profile ? this.toHealthProfileView(profile) : null;
  }

  async getAllHealthProfiles(storeId?: number) {
    const where: any = {};
    if (storeId) {
      where.customer = {
        storeId,
        deletedAt: null,
      };
    }

    return this.prisma.customerHealthProfile.findMany({
      where,
      select: {
        id: true,
        customerId: true,
        skinType: true,
        skinStatus: true,
        mainProblems: true,
        allergyHistory: true,
        goals: true,
        recommendedCare: true,
        instrument: true,
        lastCheck: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { lastCheck: 'desc' },
    }).then((profiles) => profiles.map((profile) => this.toHealthProfileView(profile)));
  }

  async upsertHealthProfile(customerId: number, data: any) {
    const { photo: _photo, name: _name, customerId: _customerId, id: _id, ...profileData } = data ?? {};
    if (profileData.lastCheck) {
      profileData.lastCheck = new Date(profileData.lastCheck);
    }
    return this.prisma.customerHealthProfile.upsert({
      where: { customerId },
      update: profileData,
      create: { customerId, ...profileData },
    });
  }

  async getMiniappBehaviorAnalysis(storeId?: number) {
    const now = new Date();
    const active7d = new Date(now.getTime() - 7 * 86400000);
    const active30d = new Date(now.getTime() - 30 * 86400000);
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;

    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        wechat: true,
        source: true,
        totalSpent: true,
        visitCount: true,
        lastVisitDate: true,
        memberLevel: true,
        createdAt: true,
        store: { select: { name: true } },
        reservations: {
          select: { id: true, status: true, createdAt: true, date: true, checkedInAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        productOrders: {
          select: { id: true, status: true, totalAmount: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        marketingTouches: {
          select: { id: true, status: true, channel: true, touchedAt: true, convertedAt: true, actualRevenue: true },
          orderBy: { touchedAt: 'desc' },
          take: 20,
        },
        recommendationEvents: {
          select: { id: true, eventType: true, createdAt: true, orderId: true, taskId: true },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        customerCards: {
          select: { id: true, status: true, remainingTimes: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const maxDate = (dates: Array<Date | null | undefined>) => {
      const timestamps = dates.filter(Boolean).map((date) => date!.getTime());
      return timestamps.length ? new Date(Math.max(...timestamps)) : undefined;
    };
    const isAfter = (date: Date | undefined, baseline: Date) => Boolean(date && date >= baseline);
    const percent = (count: number, total: number) => (total > 0 ? `${Math.round((count / total) * 100)}%` : '0%');
    const moneyNumber = (value: unknown) => Number(value ?? 0);

    const rows = customers.map((customer) => {
      const clickCount = customer.recommendationEvents.length + customer.marketingTouches.length + customer.customerCards.length;
      const reservationCount = customer.reservations.length;
      const orderCount = customer.productOrders.length;
      const marketingTouchCount = customer.marketingTouches.length;
      const conversionCount =
        customer.productOrders.filter((order) => ['completed', 'paid', '已完成', '已付款'].includes(order.status)).length +
        customer.marketingTouches.filter((touch) => touch.convertedAt || touch.status === 'converted').length;
      const lastActiveAt = maxDate([
        customer.lastVisitDate,
        ...customer.reservations.map((item) => item.createdAt),
        ...customer.productOrders.map((item) => item.createdAt),
        ...customer.marketingTouches.map((item) => item.touchedAt),
        ...customer.recommendationEvents.map((item) => item.createdAt),
        ...customer.customerCards.map((item) => item.createdAt),
      ]);
      const engagementScore = Math.min(
        100,
        Math.round(
          clickCount * 6 +
          reservationCount * 10 +
          orderCount * 12 +
          conversionCount * 16 +
          Math.min(20, moneyNumber(customer.totalSpent) / 2000) +
          (isAfter(lastActiveAt, active7d) ? 18 : isAfter(lastActiveAt, active30d) ? 10 : 0),
        ),
      );
      const miniappStatus =
        !customer.phone && !customer.wechat
          ? '待绑定'
          : engagementScore >= 70
            ? '高活跃'
            : reservationCount > 0 || marketingTouchCount > 0 || engagementScore >= 35
              ? '有意向'
              : '低活跃';
      const intentLevel = engagementScore >= 70 ? '高' : engagementScore >= 35 ? '中' : '低';
      const nextAction =
        intentLevel === '高'
          ? '推送小程序专属预约入口，并同步门店顾问跟进'
          : intentLevel === '中'
            ? '发送项目权益提醒，优先引导在线预约'
            : miniappStatus === '待绑定'
              ? '补充手机号或微信信息，完成小程序会员绑定'
              : '推送轻量内容触达，提升再次访问';
      const evidence = [
        `${clickCount} 次小程序/推荐触点`,
        `${reservationCount} 次预约相关行为`,
        `${orderCount} 笔订单记录`,
        `${marketingTouchCount} 次营销触达`,
      ];
      return {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone ?? undefined,
        storeName: customer.store?.name ?? '',
        lastActiveAt: lastActiveAt ? this.formatDateTime(lastActiveAt) : undefined,
        miniappStatus,
        visitCount: customer.visitCount,
        clickCount,
        reservationCount,
        orderCount,
        marketingTouchCount,
        conversionCount,
        engagementScore,
        intentLevel,
        nextAction,
        evidence,
        source: customer.source || '未知',
        active7d: isAfter(lastActiveAt, active7d),
        active30d: isAfter(lastActiveAt, active30d),
      };
    });

    const totalCustomers = customers.length;
    const boundCustomers = customers.filter((customer) => customer.phone || customer.wechat).length;
    const activeCustomers7d = rows.filter((row) => row.active7d).length;
    const activeCustomers30d = rows.filter((row) => row.active30d).length;
    const reservationIntentCount = rows.reduce((sum, row) => sum + row.reservationCount, 0);
    const marketingTouchCount = rows.reduce((sum, row) => sum + row.marketingTouchCount, 0);
    const conversionCount = rows.reduce((sum, row) => sum + row.conversionCount, 0);
    const avgEngagementScore = totalCustomers
      ? Math.round(rows.reduce((sum, row) => sum + row.engagementScore, 0) / totalCustomers)
      : 0;

    const segmentDefinitions = [
      { label: '高活跃客户', predicate: (row: any) => row.miniappStatus === '高活跃', suggestion: '适合推送高客单护理套餐、会员专属活动和在线预约入口。' },
      { label: '有预约意向客户', predicate: (row: any) => row.miniappStatus === '有意向', suggestion: '适合推送项目种草内容、限时权益和顾问跟进提醒。' },
      { label: '低活跃客户', predicate: (row: any) => row.miniappStatus === '低活跃', suggestion: '适合低频内容触达，先恢复浏览和互动，再引导预约。' },
      { label: '待绑定客户', predicate: (row: any) => row.miniappStatus === '待绑定', suggestion: '优先补齐联系方式，引导绑定小程序会员身份。' },
    ];

    const segments = segmentDefinitions.map((segment) => {
      const list = rows.filter(segment.predicate);
      const activeCount = list.filter((row) => row.active30d).length;
      const converted = list.filter((row) => row.conversionCount > 0).length;
      return {
        label: segment.label,
        customerCount: list.length,
        activeRate: percent(activeCount, list.length),
        avgScore: list.length ? Math.round(list.reduce((sum, row) => sum + row.engagementScore, 0) / list.length) : 0,
        conversionRate: percent(converted, list.length),
        suggestion: segment.suggestion,
      };
    });

    return {
      summary: {
        totalCustomers,
        boundCustomers,
        activeCustomers7d,
        activeCustomers30d,
        avgEngagementScore,
        reservationIntentCount,
        marketingTouchCount,
        conversionCount,
        generatedAt: this.formatDateTime(now),
        dataSource: 'derived_from_core_records',
      },
      funnel: [
        { stage: '可触达客户', count: boundCustomers, rate: percent(boundCustomers, totalCustomers) },
        { stage: '30天活跃', count: activeCustomers30d, rate: percent(activeCustomers30d, boundCustomers) },
        { stage: '预约意向', count: rows.filter((row) => row.reservationCount > 0).length, rate: percent(rows.filter((row) => row.reservationCount > 0).length, boundCustomers) },
        { stage: '完成转化', count: rows.filter((row) => row.conversionCount > 0).length, rate: percent(rows.filter((row) => row.conversionCount > 0).length, boundCustomers) },
      ],
      entryModules: [
        { name: '营销活动详情', eventCount: marketingTouchCount, customerCount: rows.filter((row) => row.marketingTouchCount > 0).length, conversionHint: '用于承接自动营销和活动发布后的客户点击/领取/转化。' },
        { name: '在线预约', eventCount: reservationIntentCount, customerCount: rows.filter((row) => row.reservationCount > 0).length, conversionHint: '用于观察项目浏览后预约提交、到店确认和爽约情况。' },
        { name: '智能推荐', eventCount: rows.reduce((sum, row) => sum + row.clickCount, 0), customerCount: rows.filter((row) => row.clickCount > 0).length, conversionHint: '用于追踪推荐卡片曝光、点击、加入方案和下单。' },
        { name: '会员权益', eventCount: customers.reduce((sum, customer) => sum + customer.customerCards.length, 0), customerCount: customers.filter((customer) => customer.customerCards.length > 0).length, conversionHint: '用于跟踪次卡/会员卡可用权益、核销提醒和续卡机会。' },
      ],
      segments,
      customers: rows
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .slice(0, 80)
        .map(({ active7d: _active7d, active30d: _active30d, source: _source, ...row }) => row),
      eventContract: [
        { field: 'customerId', label: '客户 ID，与 Core 客户表一致', required: true },
        { field: 'storeId', label: '门店 ID，用于门店数据隔离', required: true },
        { field: 'eventType', label: '事件类型，如 page_view、activity_click、reserve_submit、order_paid', required: true },
        { field: 'module', label: '小程序模块，如 activity、reservation、product、card、profile', required: true },
        { field: 'targetId', label: '被点击或转化的活动/项目/商品/权益 ID', required: false },
        { field: 'occurredAt', label: '客户端事件发生时间', required: true },
        { field: 'payload', label: '脱敏后的扩展字段，如停留时长、来源页面、活动版本', required: false },
      ],
    };
  }

  private buildProfileAnalyticsWhere(storeId?: number) {
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    return where;
  }

  private getProfileAnalyticsPage(query?: { page?: number | string; pageSize?: number | string }) {
    const page = Math.max(1, Number(query?.page || 1));
    const pageSize = Math.min(50, Math.max(10, Number(query?.pageSize || 10)));
    return { page, pageSize };
  }

  private getProfileCustomerSelect(includeHealthProfile = true) {
    return {
      id: true,
      storeId: true,
      name: true,
      phone: true,
      birthday: true,
      age: true,
      skinCondition: true,
      memberLevel: true,
      totalSpent: true,
      visitCount: true,
      lastVisitDate: true,
      skinType: true,
      tags: true,
      createdAt: true,
      store: { select: { id: true, name: true } },
      ...(includeHealthProfile
        ? {
          healthProfile: {
            select: {
              customerId: true,
              skinType: true,
              skinStatus: true,
              mainProblems: true,
              recommendedCare: true,
              lastCheck: true,
            },
          },
        }
        : {}),
    };
  }

  private buildProfileHealthProfiles(customers: any[]) {
    return customers
      .filter((customer) => customer.healthProfile)
      .map((customer) => ({
        ...customer.healthProfile,
        name: customer.name,
        lastCheck: this.formatDate(customer.healthProfile?.lastCheck),
      }));
  }

  private async loadProfileCustomers(storeId?: number, take = 500, includeHealthProfile = true) {
    const where = this.buildProfileAnalyticsWhere(storeId);
    const [totalCustomers, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        select: this.getProfileCustomerSelect(includeHealthProfile),
        orderBy: [{ totalSpent: 'desc' }, { id: 'asc' }],
        take,
      }),
    ]);
    const customerViews = customers.map((customer) => this.toCustomerView(customer));
    return {
      totalCustomers,
      customers,
      customerViews,
      healthProfiles: includeHealthProfile ? this.buildProfileHealthProfiles(customers) : [],
    };
  }

  private async loadProfileConsumptionViews(customerIds: number[], take = 2000) {
    if (customerIds.length === 0) return [];
    const consumptionRecords = await this.prisma.consumptionRecord.findMany({
      where: {
        customerId: { in: customerIds },
      },
      select: {
        id: true,
        customerId: true,
        consumeType: true,
        consumeContent: true,
        payMethod: true,
        amount: true,
        campaign: true,
        consumeTime: true,
      },
      orderBy: { consumeTime: 'desc' },
      take,
    });
    return consumptionRecords.map((record) => this.toConsumptionRecordView(record));
  }

  async getProfileAnalyticsOverview(storeId?: number) {
    const now = new Date();
    const totalCustomers = await this.prisma.customer.count({ where: this.buildProfileAnalyticsWhere(storeId) });
    return {
      generatedAt: this.formatDateTime(now),
      storeId,
      totalCustomers,
    };
  }

  async getProfileAnalyticsSegment(storeId?: number) {
    const now = new Date();
    const { totalCustomers, customerViews } = await this.loadProfileCustomers(storeId, 500, false);
    return {
      generatedAt: this.formatDateTime(now),
      storeId,
      totalCustomers,
      segmentStats: this.computeProfileSegmentStats(customerViews, now),
    };
  }

  async getProfileAnalyticsSkin(storeId?: number) {
    const now = new Date();
    const { totalCustomers, customerViews, healthProfiles } = await this.loadProfileCustomers(storeId, 500, true);
    return {
      generatedAt: this.formatDateTime(now),
      storeId,
      totalCustomers,
      skinStats: this.computeProfileSkinStats(customerViews, healthProfiles),
    };
  }

  async getProfileAnalyticsBehavior(
    query: { page?: number | string; pageSize?: number | string; segment?: string; skinType?: string } = {},
    storeId?: number,
  ) {
    const now = new Date();
    const { page, pageSize } = this.getProfileAnalyticsPage(query);
    const { totalCustomers, customerViews, healthProfiles } = await this.loadProfileCustomers(storeId, 300, true);
    const consumptionViews = await this.loadProfileConsumptionViews(customerViews.map((customer) => customer.id), 2000);
    let rows = this.computeProfileBehaviorProfiles(customerViews, consumptionViews, healthProfiles, now);
    if (query.segment) rows = rows.filter((row) => row.segment === String(query.segment));
    if (query.skinType) rows = rows.filter((row) => row.skinType === String(query.skinType));
    const total = rows.length;
    const items = rows.slice((page - 1) * pageSize, page * pageSize);

    return {
      generatedAt: this.formatDateTime(now),
      storeId,
      totalCustomers,
      items,
      data: items,
      total,
      page,
      pageSize,
    };
  }

  async getProfileAnalyticsPrediction(
    query: { page?: number | string; pageSize?: number | string } = {},
    storeId?: number,
  ) {
    const now = new Date();
    const { page, pageSize } = this.getProfileAnalyticsPage(query);
    const { totalCustomers, customerViews } = await this.loadProfileCustomers(storeId, 300, false);
    const consumptionViews = await this.loadProfileConsumptionViews(customerViews.map((customer) => customer.id), 2000);
    const rows = this.computeProfilePredictionRows(customerViews, consumptionViews, now);
    const total = rows.length;
    const items = rows.slice((page - 1) * pageSize, page * pageSize);

    return {
      generatedAt: this.formatDateTime(now),
      storeId,
      totalCustomers,
      items,
      data: items,
      total,
      page,
      pageSize,
    };
  }

  async getProfileAnalytics(storeId?: number) {
    const now = new Date();
    const { totalCustomers, customerViews, healthProfiles } = await this.loadProfileCustomers(storeId, 500, true);

    return {
      generatedAt: this.formatDateTime(now),
      storeId,
      totalCustomers,
      segmentStats: this.computeProfileSegmentStats(customerViews, now),
      skinStats: this.computeProfileSkinStats(customerViews, healthProfiles),
      behaviorProfiles: [],
      predictionRows: [],
    };
  }

  async getSegmentCount(query: {
    storeId?: number | string;
    segment?: string;
    skinType?: string;
    memberLevel?: string;
    daysSinceLastVisit?: number | string;
    specialTags?: string[] | string;
  }) {
    const storeId = Number(query.storeId || 0);
    const daysSinceLastVisit = Number(query.daysSinceLastVisit || 0);
    const specialTags = this.normalizeQueryStringArray(query.specialTags);
    const where: any = { deletedAt: null };
    if (storeId > 0) where.storeId = storeId;
    if (query.memberLevel) where.memberLevel = String(query.memberLevel);

    const customers = await this.prisma.customer.findMany({
      where,
      include: { healthProfile: true },
    });

    const now = new Date();
    const count = customers.filter((customer) => {
      if (query.segment && this.getCustomerSegment(customer, now) !== query.segment) return false;
      if (query.skinType && this.getCustomerSkinType(customer) !== query.skinType) return false;
      if (daysSinceLastVisit > 0) {
        if (!customer.lastVisitDate) return false;
        const gapDays = Math.floor((now.getTime() - customer.lastVisitDate.getTime()) / 86400000);
        if (gapDays < daysSinceLastVisit) return false;
      }
      return specialTags.every((tag) => this.matchesSpecialSegmentTag(customer, tag, now));
    }).length;

    return {
      count,
      filters: {
        storeId: storeId > 0 ? storeId : undefined,
        segment: query.segment,
        skinType: query.skinType,
        memberLevel: query.memberLevel,
        daysSinceLastVisit: daysSinceLastVisit > 0 ? daysSinceLastVisit : undefined,
        specialTags,
      },
    };
  }

  private normalizeQueryStringArray(value?: string[] | string) {
    if (!value) return [];
    const raw = Array.isArray(value) ? value : [value];
    return raw.flatMap((item) => String(item).split(',')).map((item) => item.trim()).filter(Boolean);
  }

  private formatPercent(count: number, total: number) {
    return total > 0 ? `${Math.round((count / total) * 100)}%` : '0%';
  }

  private formatCurrencyAmount(value: number) {
    return `¥${Math.round(value).toLocaleString('zh-CN')}`;
  }

  private formatLargeCurrency(value: number) {
    return value >= 10000 ? `¥${(value / 10000).toFixed(1)}万` : this.formatCurrencyAmount(value);
  }

  private parseFormattedAmount(value: unknown) {
    if (typeof value === 'number') return value;
    return Number(String(value ?? '0').replace(/[¥￥,]/g, '')) || 0;
  }

  private daysSinceDate(value: string | Date | null | undefined, now: Date) {
    if (!value) return 9999;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 9999;
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
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
    const freq = Number(visitCount ?? 0) / this.monthsSinceDate(createdAt, now);
    if (freq >= 4) return 5;
    if (freq >= 2) return 4;
    if (freq >= 1) return 3;
    if (freq >= 0.5) return 2;
    if (freq > 0) return 1;
    return 0;
  }

  private scoreProfileMonetary(totalSpent: number) {
    const amount = Number(totalSpent ?? 0);
    if (amount >= 50000) return 5;
    if (amount >= 20000) return 4;
    if (amount >= 8000) return 3;
    if (amount >= 3000) return 2;
    if (amount > 0) return 1;
    return 0;
  }

  private classifyProfileSegment(customer: any, now: Date) {
    const recency = this.scoreProfileRecency(customer.lastVisitDate, now);
    const frequency = this.scoreProfileFrequency(Number(customer.visitCount ?? 0), customer.createdAt, now);
    const monetary = this.scoreProfileMonetary(Number(customer.totalSpent ?? 0));
    const registeredDays = this.daysSinceDate(customer.createdAt, now);

    if (registeredDays <= 90 || Number(customer.visitCount ?? 0) <= 2) return '新客户';
    if (recency <= 1 || (recency <= 2 && frequency <= 1)) return '流失风险客户';
    if (recency >= 4 && frequency >= 3 && monetary >= 4) return '高价值客户';
    if (recency >= 3 && Number(customer.age ?? 30) < 35 && monetary <= 3) return '潜在价值客户';
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
    ]
      .filter(Boolean)
      .join(' ');

    if (!values) return '未分类';
    if ((values.includes('干') || values.includes('缺水') || values.includes('干纹')) && !values.includes('混')) return '干性肌肤';
    if ((values.includes('油') || values.includes('出油') || values.includes('痘')) && !values.includes('混')) return '油性肌肤';
    if (values.includes('敏感') || values.includes('泛红') || values.includes('过敏') || values.includes('红血丝')) return '敏感肌肤';
    if (values.includes('混合') || values.includes('混干') || values.includes('混油') || values.includes('T区')) return '混合肌肤';
    if (values.includes('中性') || values.includes('水油平衡') || values.includes('状态良好')) return '中性肌肤';
    return '未分类';
  }

  private computeProfileSegmentStats(customers: any[], now: Date) {
    const order = ['高价值客户', '潜在价值客户', '稳定客户', '流失风险客户', '新客户'];
    const groups = new Map<string, any[]>(order.map((segment) => [segment, []]));
    for (const customer of customers) {
      groups.get(this.classifyProfileSegment(customer, now))?.push(customer);
    }

    const totalSpentAll = customers.reduce((sum, customer) => sum + Number(customer.totalSpent ?? 0), 0);
    const charMap: Record<string, string[]> = {
      高价值客户: ['消费频次高', '客单价高', '忠诚度高'],
      潜在价值客户: ['年轻群体', '消费潜力大', '价格敏感'],
      稳定客户: ['定期消费', '服务满意', '推荐意愿强'],
      流失风险客户: ['消费下降', '到店频次低', '需要唤醒'],
      新客户: ['首次消费', '了解需求', '体验为主'],
    };

    return order.map((segment) => {
      const list = groups.get(segment) ?? [];
      const total = list.reduce((sum, customer) => sum + Number(customer.totalSpent ?? 0), 0);
      const avg = list.length ? Math.round(total / list.length) : 0;
      const avgAge = list.length ? Math.round(list.reduce((sum, customer) => sum + Number(customer.age ?? 30), 0) / list.length) : 0;
      return {
        segment,
        customerCount: list.length,
        percentage: this.formatPercent(list.length, customers.length),
        avgSpend: this.formatCurrencyAmount(avg),
        totalSpend: this.formatLargeCurrency(total),
        spendContribution: this.formatPercent(total, totalSpentAll),
        avgAge,
        characteristics: charMap[segment],
        customerIds: list.map((customer) => customer.id),
      };
    });
  }

  private computeProfileSkinStats(customers: any[], healthProfiles: any[]) {
    const order = ['干性肌肤', '油性肌肤', '敏感肌肤', '混合肌肤', '中性肌肤'];
    const groups = new Map<string, any[]>([...order, '未分类'].map((skinType) => [skinType, []]));
    const profileMap = new Map(healthProfiles.map((profile) => [profile.customerId, profile]));
    for (const customer of customers) {
      groups.get(this.classifyProfileSkin(customer, profileMap.get(customer.id)))?.push(customer);
    }

    const totalSpentAll = customers.reduce((sum, customer) => sum + Number(customer.totalSpent ?? 0), 0);
    const featuresMap: Record<string, string[]> = {
      干性肌肤: ['缺水紧绷', '细纹明显', '易敏感'],
      油性肌肤: ['出油旺盛', '毛孔粗大', '易生痘痘'],
      敏感肌肤: ['易泛红', '角质层薄', '不耐受'],
      混合肌肤: ['T区油腻', 'U区干燥', '需分区护理'],
      中性肌肤: ['水油平衡', '肤质健康', '状态稳定'],
    };

    return order.map((skinType) => {
      const list = groups.get(skinType) ?? [];
      const total = list.reduce((sum, customer) => sum + Number(customer.totalSpent ?? 0), 0);
      const avg = list.length ? Math.round(total / list.length) : 0;
      const avgAge = list.length ? Math.round(list.reduce((sum, customer) => sum + Number(customer.age ?? 30), 0) / list.length) : 0;
      const youngRatio = list.length ? list.filter((customer) => Number(customer.age ?? 30) < 30).length / list.length : 0;
      return {
        skinType,
        customerCount: list.length,
        percentage: this.formatPercent(list.length, customers.length),
        avgSpend: this.formatCurrencyAmount(avg),
        avgAge: `${avgAge}岁`,
        totalSpend: this.formatLargeCurrency(total),
        spendContribution: this.formatPercent(total, totalSpentAll),
        skinFeatures: featuresMap[skinType],
        customerIds: list.map((customer) => customer.id),
        trend: youngRatio > 0.4 ? `+${Math.round(youngRatio * 30)}%` : `+${Math.round(youngRatio * 15)}%`,
      };
    });
  }

  private computeProfileBehaviorProfiles(customers: any[], consumptionRecords: any[], healthProfiles: any[], now: Date) {
    const recordsByCustomer = new Map<number, any[]>();
    for (const record of consumptionRecords) {
      if (!recordsByCustomer.has(record.customerId)) recordsByCustomer.set(record.customerId, []);
      recordsByCustomer.get(record.customerId)!.push(record);
    }
    const profileMap = new Map(healthProfiles.map((profile) => [profile.customerId, profile]));

    return [...customers].sort((a, b) => Number(b.totalSpent ?? 0) - Number(a.totalSpent ?? 0)).map((customer) => {
      const records = recordsByCustomer.get(customer.id) ?? [];
      const freqPerMonth = Number(customer.visitCount ?? 0) / this.monthsSinceDate(customer.createdAt, now);
      const visitFrequency =
        freqPerMonth >= 8
          ? '每周2次'
          : freqPerMonth >= 4
            ? '每周1次'
            : freqPerMonth >= 2
              ? '每月2-3次'
              : freqPerMonth >= 1
                ? '每月1次'
                : Number(customer.visitCount ?? 0) <= 2
                  ? '首次消费'
                  : '偶尔到店';
      const avgSpend = Number(customer.visitCount ?? 0) > 0 ? Math.round(Number(customer.totalSpent ?? 0) / Number(customer.visitCount)) : 0;
      const typeCounts: Record<string, number> = {};
      for (const record of records) {
        const key = record.consumeType || '面部护理';
        typeCounts[key] = (typeCounts[key] ?? 0) + 1;
      }
      const preferredService = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '面部护理';
      const promoCount = records.filter((record) => record.campaign && record.campaign !== '无').length;
      const promoSensitivity = records.length ? Math.round((promoCount / records.length) * 100) : 50;
      const repurchase = Number(customer.visitCount ?? 0) > 1 ? Math.min(95, 50 + Number(customer.visitCount ?? 0)) : 0;
      const loyalty = Math.min(
        99,
        Math.round(
          ((this.scoreProfileRecency(customer.lastVisitDate, now) +
            this.scoreProfileFrequency(Number(customer.visitCount ?? 0), customer.createdAt, now)) /
            10) *
            100,
        ),
      );
      const monthCounts = [0, 0, 0, 0];
      for (const record of records) {
        const month = Number(String(record.consumeTime ?? '').slice(5, 7));
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
        skinType: this.classifyProfileSkin(customer, profileMap.get(customer.id)),
        visitFrequency,
        avgSpend: this.formatCurrencyAmount(avgSpend),
        preferredService,
        promotionSensitivity: `${promoSensitivity}%`,
        repurchaseRate: `${repurchase}%`,
        loyalty: `${loyalty}%`,
        seasonalTrend: records.length >= 3 ? seasons[maxQuarter] : '待观察',
      };
    });
  }

  private computeProfilePredictionRows(customers: any[], consumptionRecords: any[], now: Date) {
    const recordsByCustomer = new Map<number, any[]>();
    for (const record of consumptionRecords) {
      if (!recordsByCustomer.has(record.customerId)) recordsByCustomer.set(record.customerId, []);
      recordsByCustomer.get(record.customerId)!.push(record);
    }

    return customers.map((customer) => {
      const records = recordsByCustomer.get(customer.id) ?? [];
      const lastVisitDays = this.daysSinceDate(customer.lastVisitDate, now);
      const avgGap = records.length >= 2 ? Math.max(7, Math.round(lastVisitDays / Math.max(1, records.length))) : 30;
      let churnScore = 0;
      const reasons: string[] = [];
      if (lastVisitDays > 180) {
        churnScore += 35;
        reasons.push('超过6个月未到店');
      } else if (lastVisitDays > 90) {
        churnScore += 25;
        reasons.push('超过3个月未到店');
      } else if (lastVisitDays > 60) {
        churnScore += 15;
        reasons.push('超过2个月未到店');
      }
      if (lastVisitDays / Math.max(avgGap, 7) > 2) {
        churnScore += 25;
        reasons.push('到店间隔偏长');
      }
      if (Number(customer.visitCount ?? 0) <= 2) {
        churnScore += 12;
        reasons.push('到店次数较少');
      }
      if (Number(customer.totalSpent ?? 0) >= 20000) churnScore -= 8;
      churnScore = Math.max(0, Math.min(95, Math.round(churnScore)));
      const churnLevel = churnScore >= 70 ? '极高' : churnScore >= 45 ? '高' : churnScore >= 25 ? '中' : '低';
      const repurchase30dScore = Math.max(
        5,
        Math.min(95, Math.round(78 - churnScore + (Number(customer.visitCount ?? 0) > 8 ? 12 : 0))),
      );
      const marketingResponseScore = Math.max(
        5,
        Math.min(95, Math.round(repurchase30dScore * 0.65 + (Number(customer.totalSpent ?? 0) > 10000 ? 18 : 8))),
      );
      const monthlyAvg = this.monthsSinceDate(customer.createdAt, now) > 0
        ? Number(customer.totalSpent ?? 0) / this.monthsSinceDate(customer.createdAt, now)
        : 0;
      const ltv12m = Math.round(Number(customer.totalSpent ?? 0) + monthlyAvg * 12 * (repurchase30dScore / 80));
      const ltvTier = ltv12m >= 50000 ? '铂金' : ltv12m >= 25000 ? '黄金' : ltv12m >= 10000 ? '白银' : '青铜';

      return {
        customer,
        churnScore,
        churnLevel,
        repurchase30dScore,
        marketingResponseScore,
        ltvTier,
        ltv12m,
        reasons: [
          reasons[0] || '暂无明显流失风险',
          `30天复购概率 ${repurchase30dScore} 分`,
          `预计12个月价值 ¥${ltv12m.toLocaleString('zh-CN')}`,
        ],
      };
    }).sort((a, b) => b.churnScore - a.churnScore);
  }

  private getCustomerSegment(customer: any, now: Date) {
    const totalSpent = Number(customer.totalSpent ?? 0);
    const visitCount = Number(customer.visitCount ?? 0);
    const memberLevel = String(customer.memberLevel ?? '');
    const createdGapDays = Math.floor((now.getTime() - customer.createdAt.getTime()) / 86400000);
    const lastVisitGapDays = customer.lastVisitDate
      ? Math.floor((now.getTime() - customer.lastVisitDate.getTime()) / 86400000)
      : Number.POSITIVE_INFINITY;

    if (createdGapDays <= 30 || visitCount <= 1) return '新客户';
    if (memberLevel.includes('钻') || memberLevel.includes('铂') || memberLevel.toUpperCase().includes('VIP') || totalSpent >= 5000) {
      return '高价值客户';
    }
    if (lastVisitGapDays >= 60) return '流失风险客户';
    if (totalSpent >= 1000 || visitCount >= 3) return '稳定客户';
    return '潜在价值客户';
  }

  private getCustomerSkinType(customer: any) {
    return customer.healthProfile?.skinType || customer.skinType || customer.skinCondition || '';
  }

  private matchesSpecialSegmentTag(customer: any, tag: string, now: Date) {
    if (tag === '活跃会员') {
      if (!customer.lastVisitDate) return false;
      const gapDays = Math.floor((now.getTime() - customer.lastVisitDate.getTime()) / 86400000);
      return Number(customer.visitCount ?? 0) > 5 && gapDays <= 180;
    }
    if (tag === '本月生日') {
      return Boolean(customer.birthday && customer.birthday.getMonth() === now.getMonth());
    }
    if (tag === 'VIP客户') {
      const memberLevel = String(customer.memberLevel ?? '');
      return memberLevel.includes('金') || memberLevel.includes('钻') || memberLevel.includes('铂') || memberLevel.toUpperCase().includes('VIP');
    }
    return Array.isArray(customer.tags) && customer.tags.includes(tag);
  }

  async importCustomers(customers: CreateCustomerDto[]) {
    return this.prisma.customer.createMany({ data: customers, skipDuplicates: true });
  }
}
