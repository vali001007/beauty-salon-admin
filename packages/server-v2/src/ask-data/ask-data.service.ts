import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ASK_DATA_CATALOG, SOURCE_PRESETS } from './ask-data.catalog.js';
import type {
  AskDataCatalogResponse,
  AskDataColumn,
  AskDataQueryPlan,
  AskDataQueryRequest,
  AskDataQueryResponse,
  AskDataRequestContext,
  AskDataSource,
  AskDataTemplateId,
} from './ask-data.types.js';

type DateRange = NonNullable<AskDataQueryPlan['dateRange']>;

const SUPPORTED_TEMPLATES = new Set<AskDataTemplateId>([
  'project_revenue_by_period',
  'low_stock_products',
  'customer_recent_consumption',
  'reservation_cancel_rate',
]);

const COMPLETED_ORDER_STATUSES = ['completed', 'paid', '已付款', '已完成'];
const CANCELLED_RESERVATION_STATUSES = new Set(['cancelled', 'canceled', '已取消', '取消']);

@Injectable()
export class AskDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  getCatalog(): AskDataCatalogResponse {
    return ASK_DATA_CATALOG;
  }

  async query(request: AskDataQueryRequest, context?: number | AskDataRequestContext): Promise<AskDataQueryResponse> {
    const storeId = typeof context === 'number' ? context : context?.storeId;
    const question = String(request.question ?? '').trim();
    if (!question) {
      return this.unsupportedResponse(question, '请输入想查询的经营问题。');
    }

    const plan = (await this.tryCreateAiPlan(question, request.history ?? [])) ?? this.createRulePlan(question, request.history ?? []);
    if (plan.intent === 'unsupported' || !plan.templateId) {
      return this.unsupportedResponse(question, '基础版暂未支持这个问题，请先尝试收入、库存、客户消费或预约取消率。');
    }

    if (!storeId || !Number.isFinite(storeId)) {
      return {
        status: 'clarification',
        summary: '请先选择门店后再查询经营数据。',
        clarificationQuestion: '请先在顶部选择具体门店，再发起智能问数。',
        columns: [],
        rows: [],
        sources: [],
        queryPlan: { ...plan, intent: 'clarification' },
      };
    }

    try {
      switch (plan.templateId) {
        case 'project_revenue_by_period':
          return await this.queryProjectRevenue(plan, storeId);
        case 'low_stock_products':
          return await this.queryLowStockProducts(plan, storeId);
        case 'customer_recent_consumption':
          return await this.queryCustomerRecentConsumption(plan, storeId);
        case 'reservation_cancel_rate':
          return await this.queryReservationCancelRate(plan, storeId);
        default:
          return this.unsupportedResponse(question, '基础版暂未支持这个问题。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询失败';
      return {
        status: 'error',
        summary: `智能问数查询失败：${message}`,
        columns: [],
        rows: [],
        sources: [],
        queryPlan: plan,
      };
    }
  }

  private async queryProjectRevenue(plan: AskDataQueryPlan, storeId: number): Promise<AskDataQueryResponse> {
    const range = plan.dateRange ?? this.defaultRecentRange();
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId,
        status: { in: COMPLETED_ORDER_STATUSES },
        createdAt: {
          gte: new Date(range.from),
          lt: new Date(range.to),
        },
      },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const byProject = new Map<string, { projectName: string; orderIds: Set<number>; quantity: number; revenue: number }>();
    for (const order of orders as any[]) {
      for (const item of order.orderItems ?? []) {
        if (String(item.itemType) !== 'project') continue;
        const key = `${item.itemId ?? item.name}`;
        const current = byProject.get(key) ?? { projectName: String(item.name ?? '未命名项目'), orderIds: new Set<number>(), quantity: 0, revenue: 0 };
        current.orderIds.add(Number(order.id));
        current.quantity += this.toNumber(item.quantity);
        current.revenue += this.toNumber(item.netAmount ?? item.subtotal);
        byProject.set(key, current);
      }
    }

    const rows = [...byProject.values()]
      .map((item) => ({
        projectName: item.projectName,
        orderCount: item.orderIds.size,
        quantity: this.round(item.quantity),
        revenue: this.round(item.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);

    if (!rows.length) {
      return this.noDataResponse(plan, SOURCE_PRESETS.projectRevenue, `${range.label}没有查到项目收入。`);
    }

    const total = rows.reduce((sum, row) => sum + Number(row.revenue), 0);
    return {
      status: 'success',
      summary: `${range.label}项目收入合计 ${this.formatMoney(total)}，共覆盖 ${rows.length} 个项目。`,
      columns: [
        { key: 'projectName', label: '项目', type: 'text' },
        { key: 'orderCount', label: '订单数', type: 'number' },
        { key: 'quantity', label: '数量', type: 'number' },
        { key: 'revenue', label: '收入', type: 'money' },
      ],
      rows,
      sources: this.withDateSourceFilters(SOURCE_PRESETS.projectRevenue, range),
      queryPlan: plan,
    };
  }

  private async queryLowStockProducts(plan: AskDataQueryPlan, storeId: number): Promise<AskDataQueryResponse> {
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        status: 'active',
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    const rows = (products as any[])
      .filter((product) => this.toNumber(product.currentStock) <= this.toNumber(product.safetyStock))
      .map((product) => {
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock: this.round(currentStock),
          safetyStock: this.round(safetyStock),
          gap: this.round(Math.max(safetyStock - currentStock, 0)),
          unit: product.unit ?? '',
        };
      })
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 50);

    if (!rows.length) {
      return this.noDataResponse(plan, SOURCE_PRESETS.lowStock, '没有查到低于安全库存的商品。');
    }

    return {
      status: 'success',
      summary: `当前有 ${rows.length} 个商品低于或等于安全库存，需要优先补货或复核库存。`,
      columns: [
        { key: 'productName', label: '商品', type: 'text' },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'currentStock', label: '当前库存', type: 'number' },
        { key: 'safetyStock', label: '安全库存', type: 'number' },
        { key: 'gap', label: '缺口', type: 'number' },
        { key: 'unit', label: '单位', type: 'text' },
      ],
      rows,
      sources: SOURCE_PRESETS.lowStock,
      queryPlan: plan,
    };
  }

  private async queryCustomerRecentConsumption(plan: AskDataQueryPlan, storeId: number): Promise<AskDataQueryResponse> {
    const customerName = plan.entity?.name?.trim();
    if (!customerName) {
      return {
        status: 'clarification',
        summary: '请补充要查询的客户姓名。',
        clarificationQuestion: '你想查询哪位客户的最近消费？',
        columns: [],
        rows: [],
        sources: SOURCE_PRESETS.customerRecentConsumption.slice(0, 1),
        queryPlan: { ...plan, intent: 'clarification' },
      };
    }

    const customers = await this.prisma.customer.findMany({
      where: {
        storeId,
        deletedAt: null,
        name: { contains: customerName, mode: 'insensitive' },
      },
      select: { id: true, name: true, phone: true },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    });

    if ((customers as any[]).length > 1) {
      return {
        status: 'clarification',
        summary: '找到多个客户，请补充要查询哪一位。',
        clarificationQuestion: `找到多个客户匹配“${customerName}”，请选择客户或补充手机号后四位。`,
        columns: [
          { key: 'customerId', label: '客户ID', type: 'number' },
          { key: 'customerName', label: '客户', type: 'text' },
          { key: 'phoneMasked', label: '手机号', type: 'text' },
        ],
        rows: (customers as any[]).map((customer) => ({
          customerId: customer.id,
          customerName: customer.name,
          phoneMasked: this.maskPhone(customer.phone),
        })),
        sources: SOURCE_PRESETS.customerRecentConsumption.slice(0, 1),
        queryPlan: { ...plan, intent: 'clarification' },
      };
    }

    const customer = (customers as any[])[0];
    if (!customer) {
      return this.noDataResponse(plan, SOURCE_PRESETS.customerRecentConsumption.slice(0, 1), `没有查到名为“${customerName}”的客户。`);
    }

    const orders = await this.prisma.productOrder.findMany({
      where: {
        customerId: customer.id,
        storeId,
        status: { in: COMPLETED_ORDER_STATUSES },
      },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const rows = (orders as any[]).map((order) => ({
      customerName: customer.name,
      orderNo: order.orderNo,
      date: this.formatDate(order.createdAt),
      itemNames: (order.orderItems ?? []).map((item: any) => item.name).filter(Boolean).join('、') || '-',
      amount: this.round(this.toNumber(order.netAmount ?? order.totalAmount)),
      payMethod: order.payMethod ?? '-',
      status: order.status,
    }));

    if (!rows.length) {
      return this.noDataResponse(plan, SOURCE_PRESETS.customerRecentConsumption, `没有查到“${customer.name}”的近期消费订单。`);
    }

    return {
      status: 'success',
      summary: `查到“${customer.name}”最近 ${rows.length} 笔消费，最近一笔为 ${rows[0].date}，金额 ${this.formatMoney(Number(rows[0].amount))}。`,
      columns: [
        { key: 'customerName', label: '客户', type: 'text' },
        { key: 'orderNo', label: '订单号', type: 'text' },
        { key: 'date', label: '日期', type: 'date' },
        { key: 'itemNames', label: '消费内容', type: 'text' },
        { key: 'amount', label: '金额', type: 'money' },
        { key: 'payMethod', label: '支付方式', type: 'text' },
      ],
      rows,
      sources: SOURCE_PRESETS.customerRecentConsumption,
      queryPlan: { ...plan, entity: { type: 'customer', id: customer.id, name: customer.name } },
    };
  }

  private async queryReservationCancelRate(plan: AskDataQueryPlan, storeId: number): Promise<AskDataQueryResponse> {
    const range = plan.dateRange ?? this.currentMonthRange();
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId,
        date: {
          gte: new Date(range.from),
          lt: new Date(range.to),
        },
      },
      select: { id: true, status: true, date: true },
      orderBy: { date: 'desc' },
      take: 1000,
    });

    const total = (reservations as any[]).length;
    const cancelled = (reservations as any[]).filter((row) => CANCELLED_RESERVATION_STATUSES.has(String(row.status))).length;
    if (!total) {
      return this.noDataResponse(plan, this.withDateSourceFilters(SOURCE_PRESETS.reservationCancelRate, range), `${range.label}没有查到预约记录。`);
    }

    const cancellationRate = this.round(cancelled / total, 4);
    return {
      status: 'success',
      summary: `${range.label}预约取消率为 ${(cancellationRate * 100).toFixed(1)}%，取消 ${cancelled} 个，共 ${total} 个预约。`,
      columns: [
        { key: 'period', label: '周期', type: 'text' },
        { key: 'totalReservations', label: '预约数', type: 'number' },
        { key: 'cancelledReservations', label: '取消数', type: 'number' },
        { key: 'cancellationRate', label: '取消率', type: 'percent' },
      ],
      rows: [{ period: range.label, totalReservations: total, cancelledReservations: cancelled, cancellationRate }],
      sources: this.withDateSourceFilters(SOURCE_PRESETS.reservationCancelRate, range),
      queryPlan: plan,
    };
  }

  private async tryCreateAiPlan(question: string, history: unknown[]): Promise<AskDataQueryPlan | null> {
    try {
      const result = await this.aiService.chat([
        {
          role: 'system',
          content:
            '你是智能问数意图解析器。只能输出 JSON，不要输出 SQL。templateId 只能是 project_revenue_by_period、low_stock_products、customer_recent_consumption、reservation_cancel_rate。无法匹配时输出 {"intent":"unsupported"}。',
        },
        {
          role: 'user',
          content: JSON.stringify({ question, history: history.slice(-5), today: this.formatDate(new Date()), catalog: ASK_DATA_CATALOG.examples }),
        },
      ]);
      const parsed = this.extractJsonObject(String((result as any)?.text ?? ''));
      const templateId = parsed.templateId as AskDataTemplateId | undefined;
      if (!templateId || !SUPPORTED_TEMPLATES.has(templateId)) return null;
      return {
        templateId,
        intent: 'query',
        question,
        dateRange: this.resolveDateRange(question),
        entity: templateId === 'customer_recent_consumption' ? { type: 'customer', name: this.extractCustomerName(question) } : undefined,
        assumptions: ['AI 只选择受控查询模板，不生成 SQL'],
        confidence: this.toNumber(parsed.confidence || 0.7),
        planner: 'ai',
      };
    } catch {
      return null;
    }
  }

  private createRulePlan(question: string, history: AskDataQueryRequest['history'] = []): AskDataQueryPlan {
    const normalized = question.toLowerCase();
    const dateRange = this.resolveDateRange(question);
    if (question.includes('库存') && (question.includes('安全库存') || question.includes('低于') || question.includes('不足') || question.includes('预警'))) {
      return this.plan('low_stock_products', question, undefined, ['库存问题使用 Product 单表验证。']);
    }
    if ((question.includes('收入') || question.includes('营收') || question.includes('销售额')) && question.includes('项目')) {
      return this.plan('project_revenue_by_period', question, dateRange, [dateRange ? `时间范围按“${dateRange.label}”解析。` : '未给时间时默认近 30 天。']);
    }
    if (question.includes('预约') && (question.includes('取消率') || question.includes('取消'))) {
      return this.plan('reservation_cancel_rate', question, dateRange ?? this.currentMonthRange(), [dateRange ? `时间范围按“${dateRange.label}”解析。` : '预约指标未给时间时默认本月。']);
    }
    if ((question.includes('消费') || question.includes('买了什么')) && (question.includes('最近') || question.includes('近期') || normalized.includes('last'))) {
      return {
        ...this.plan('customer_recent_consumption', question, undefined, ['客户消费问题先匹配 Customer，再查 ProductOrder 和 OrderItem。']),
        entity: { type: 'customer', name: this.extractCustomerName(question, history) },
      };
    }
    return {
      intent: 'unsupported',
      question,
      assumptions: [],
      confidence: 0,
      planner: 'rule',
    };
  }

  private plan(templateId: AskDataTemplateId, question: string, dateRange?: DateRange, assumptions: string[] = []): AskDataQueryPlan {
    return {
      templateId,
      intent: 'query',
      question,
      dateRange,
      assumptions,
      confidence: 0.82,
      planner: 'rule',
    };
  }

  private unsupportedResponse(question: string, summary: string): AskDataQueryResponse {
    return {
      status: 'unsupported',
      summary,
      columns: [],
      rows: [],
      sources: [],
      queryPlan: {
        intent: 'unsupported',
        question,
        assumptions: [],
        confidence: 0,
        planner: 'rule',
      },
    };
  }

  private noDataResponse(plan: AskDataQueryPlan, sources: AskDataSource[], summary: string): AskDataQueryResponse {
    return {
      status: 'no_data',
      summary,
      columns: [],
      rows: [],
      sources,
      queryPlan: plan,
    };
  }

  private resolveDateRange(question: string): DateRange | undefined {
    if (question.includes('上个月') || question.includes('上月')) return this.previousMonthRange();
    if (question.includes('本月') || question.includes('这个月')) return this.currentMonthRange();
    if (question.includes('最近') || question.includes('近30') || question.includes('近 30')) return this.defaultRecentRange();
    return undefined;
  }

  private previousMonthRange(): DateRange {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1);
    return { label: '上个月', from: from.toISOString(), to: to.toISOString() };
  }

  private currentMonthRange(): DateRange {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { label: '本月', from: from.toISOString(), to: to.toISOString() };
  }

  private defaultRecentRange(): DateRange {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 30);
    return { label: '近 30 天', from: from.toISOString(), to: now.toISOString() };
  }

  private extractCustomerName(question: string, history: AskDataQueryRequest['history'] = []): string | undefined {
    const direct = question.match(/(?:查一下|看下|帮我看下|帮我查下)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,12})\s*(?:最近|近期).*(?:消费|买了什么)/);
    const name = direct?.[1]?.replace(/^(客户|会员)/, '').trim();
    if (name && !['这个客户', '该客户', '刚才客户'].includes(name)) return name;

    const lastRows = [...history].reverse().find((item) => Array.isArray(item.rows))?.rows ?? [];
    const row = lastRows.find((item) => typeof item.customerName === 'string') as Record<string, unknown> | undefined;
    return typeof row?.customerName === 'string' ? row.customerName : undefined;
  }

  private withDateSourceFilters(sources: AskDataSource[], range: DateRange): AskDataSource[] {
    return sources.map((source) => ({
      ...source,
      filters: [...source.filters, `时间=${range.label}`],
    }));
  }

  private extractJsonObject(text: string): Record<string, unknown> {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private toNumber(value: unknown): number {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  }

  private round(value: number, digits = 2): number {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private formatMoney(value: number): string {
    return `¥${this.round(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatDate(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return '-';
    return date.toISOString().slice(0, 10);
  }

  private maskPhone(value?: string | null): string {
    if (!value) return '-';
    return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
  }
}
