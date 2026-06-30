import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildEntitySearchVariants, normalizeBusinessText, scoreBusinessNameMatch } from './business-semantic-lexicon.js';
import type { EntityResolveInput, EntityResolutionCandidate, EntityResolutionResult } from './knowledge.types.js';

@Injectable()
export class EntityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: EntityResolveInput): Promise<EntityResolutionResult> {
    const text = String(input.text || '').trim();
    if (!text) return { status: 'not_found', query: text, candidates: [], clarificationQuestion: '你想查询哪个业务对象？' };

    const candidates = [
      ...(await this.resolveMarketingActivities(input)),
      ...(await this.resolveCustomers(input)),
      ...(await this.resolveProducts(input)),
      ...(await this.resolveProjects(input)),
      ...(await this.resolveBeauticians(input)),
      ...(await this.resolveOrders(input)),
      ...(await this.resolveMemberCards(input)),
    ]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, input.limit ?? 5);

    if (!candidates.length) {
      return { status: 'not_found', query: text, candidates: [], clarificationQuestion: null };
    }

    const [top, second] = candidates;
    if (top.confidence >= 0.82 && (!second || top.confidence - second.confidence >= 0.08)) {
      return { status: 'resolved', query: text, entity: top, candidates };
    }

    return {
      status: 'ambiguous',
      query: text,
      candidates,
      clarificationQuestion: `我找到了多个可能对象，你是指「${candidates.map((item) => item.displayName).slice(0, 3).join('」还是「')}」？`,
    };
  }

  private async resolveMarketingActivities(input: EntityResolveInput): Promise<EntityResolutionCandidate[]> {
    if (input.preferredObjectTypes?.length && !input.preferredObjectTypes.some((item) => item === 'MarketingActivity' || item === 'MarketingPage')) {
      return [];
    }

    const text = String(input.text || '').trim();
    const normalizedText = this.normalize(text);
    const searchText = this.extractLikelyEntityName(text);
    const searchTerms = this.buildSearchTerms(searchText, 'MarketingActivity');
    const normalizedSearch = this.normalize(searchTerms[0] ?? searchText);
    const shouldSearchMarketing =
      /活动|营销|推广|优惠|礼|链接|二维码|小程序|召回|回店/.test(normalizedText) || input.preferredObjectTypes?.includes('MarketingActivity');
    if (!shouldSearchMarketing || !searchTerms.length) return [];

    const pages = await (this.prisma as any).marketingPage.findMany({
      where: {
        AND: [
          input.storeId ? { OR: [{ storeId: input.storeId }, { storeId: null }] } : {},
          {
            OR: searchTerms.flatMap((term) => [
              { title: { contains: term } },
              { shareTitle: { contains: term } },
              { slug: { contains: this.normalize(term) } },
            ]),
          },
        ],
      },
      select: {
        id: true,
        activityId: true,
        title: true,
        shareTitle: true,
        slug: true,
        shareUrl: true,
        miniappPath: true,
        qrCodeUrl: true,
        status: true,
        storeId: true,
      },
      take: 50,
      orderBy: [{ updatedAt: 'desc' }],
    });

    const pageActivityIds = (pages as any[])
      .map((page) => Number(page.activityId))
      .filter((id) => Number.isFinite(id));

    const activities = await (this.prisma as any).marketingActivity.findMany({
      where: {
        OR: [
          ...searchTerms.flatMap((term) => [
            { title: { contains: term } },
            { description: { contains: term } },
          ]),
          pageActivityIds.length ? { id: { in: pageActivityIds } } : { id: -1 },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        publishStatus: true,
        startDate: true,
        endDate: true,
        publishedAt: true,
        updatedAt: true,
      },
      take: 50,
      orderBy: [{ updatedAt: 'desc' }],
    });

    const pageByActivityId = new Map<number, any[]>();
    for (const page of pages as any[]) {
      const activityId = Number(page.activityId);
      if (!Number.isFinite(activityId)) continue;
      const list = pageByActivityId.get(activityId) ?? [];
      list.push(page);
      pageByActivityId.set(activityId, list);
    }

    const candidates = new Map<string, EntityResolutionCandidate>();
    for (const activity of activities as any[]) {
      const title = String(activity.title || '');
      const score = this.scoreNameMatch({ text: normalizedText, search: normalizedSearch, searchTerms, name: title });
      if (score < 0.45) continue;
      const pagesForActivity = pageByActivityId.get(Number(activity.id)) ?? [];
      candidates.set(`MarketingActivity:${activity.id}`, {
        objectType: 'MarketingActivity',
        entityId: String(activity.id),
        displayName: title,
        matchedText: this.bestMatchedText(searchTerms, title) || searchText,
        confidence: Math.min(0.99, score + (pagesForActivity.length ? 0.03 : 0)),
        matchStrategy: score >= 0.94 ? 'exact_title' : score >= 0.75 ? 'contains' : 'fuzzy',
        sourceModel: 'MarketingActivity',
        evidence: [
          `MarketingActivity.title=${title}`,
          pagesForActivity.length ? `关联推广页 ${pagesForActivity.length} 个` : '未找到关联推广页',
        ],
        metadata: {
          status: activity.status,
          publishStatus: activity.publishStatus,
          pageIds: pagesForActivity.map((page) => page.id),
        },
      });
    }

    for (const page of pages as any[]) {
      const title = String(page.title || page.shareTitle || '');
      const score = this.scoreNameMatch({ text: normalizedText, search: normalizedSearch, searchTerms, name: title });
      if (score < 0.5) continue;
      const key = page.activityId ? `MarketingActivity:${page.activityId}` : `MarketingPage:${page.id}`;
      const existing = candidates.get(key);
      if (existing && existing.confidence >= score) continue;
      candidates.set(key, {
        objectType: page.activityId ? 'MarketingActivity' : 'MarketingPage',
        entityId: String(page.activityId ?? page.id),
        displayName: title,
        matchedText: this.bestMatchedText(searchTerms, title) || searchText,
        confidence: Math.min(0.97, score),
        matchStrategy: score >= 0.94 ? 'exact_title' : 'contains',
        sourceModel: 'MarketingPage',
        evidence: [`MarketingPage.title=${title}`, page.shareUrl ? '存在分享链接' : '未配置分享链接'],
        metadata: {
          pageId: page.id,
          activityId: page.activityId,
          shareUrl: page.shareUrl,
          miniappPath: page.miniappPath,
          qrCodeUrl: page.qrCodeUrl,
          status: page.status,
        },
      });
    }

    return [...candidates.values()];
  }

  private async resolveCustomers(input: EntityResolveInput): Promise<EntityResolutionCandidate[]> {
    if (input.preferredObjectTypes?.length && !input.preferredObjectTypes.includes('Customer')) return [];
    const text = String(input.text || '').trim();
    const normalizedText = this.normalize(text);
    const searchText = this.extractGenericEntityName(text);
    if (!input.preferredObjectTypes?.includes('Customer') && !/客户|会员|顾客|预约|卡|权益|消费|到店|回访/.test(normalizedText)) return [];
    const searchTerms = this.buildSearchTerms(searchText, 'Customer');
    if (!searchTerms.length) return [];

    const customers = await (this.prisma as any).customer.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        OR: searchTerms.flatMap((term) => [
          { name: { contains: term } },
          { phone: { contains: term } },
          { remark: { contains: term } },
        ]),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        memberLevel: true,
        totalSpent: true,
        visitCount: true,
        lastVisitDate: true,
      },
      take: 20,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return (customers as any[])
      .map((customer) => {
        const name = String(customer.name || '');
        const score = Math.max(
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name }),
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: String(customer.phone || '') }),
        );
        if (score < 0.55) return null;
        return {
          objectType: 'Customer' as const,
          entityId: String(customer.id),
          displayName: name,
          matchedText: searchText,
          confidence: Math.min(0.98, score),
          matchStrategy: score >= 0.94 ? ('exact_name' as const) : ('contains' as const),
          sourceModel: 'Customer',
          evidence: [`Customer.name=${name}`, `memberLevel=${customer.memberLevel ?? '未设置'}`],
          metadata: {
            memberLevel: customer.memberLevel,
            phoneMasked: this.maskPhone(customer.phone),
            totalSpent: customer.totalSpent,
            visitCount: customer.visitCount,
            lastVisitDate: customer.lastVisitDate,
          },
        } satisfies EntityResolutionCandidate;
      })
      .filter(Boolean) as EntityResolutionCandidate[];
  }

  private async resolveProducts(input: EntityResolveInput): Promise<EntityResolutionCandidate[]> {
    if (input.preferredObjectTypes?.length && !input.preferredObjectTypes.includes('InventoryProduct')) return [];
    const text = String(input.text || '').trim();
    const normalizedText = this.normalize(text);
    const searchText = this.extractGenericEntityName(text);
    if (!input.preferredObjectTypes?.includes('InventoryProduct') && !/库存|商品|产品|sku|耗材|补货|临期|缺货|够不够|够吗/.test(normalizedText)) return [];
    const searchTerms = this.buildSearchTerms(searchText, 'InventoryProduct');
    if (!searchTerms.length) return [];

    const products = await (this.prisma as any).product.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        OR: searchTerms.flatMap((term) => [
          { name: { contains: term } },
          { sku: { contains: term } },
          { brand: { contains: term } },
        ]),
      },
      select: {
        id: true,
        name: true,
        sku: true,
        brand: true,
        currentStock: true,
        safetyStock: true,
        status: true,
      },
      take: 20,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return (products as any[])
      .map((product) => {
        const name = String(product.name || '');
        const score = Math.max(
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name }),
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: String(product.sku || '') }),
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: String(product.brand || '') }),
        );
        if (score < 0.55) return null;
        return {
          objectType: 'InventoryProduct' as const,
          entityId: String(product.id),
          displayName: name,
          matchedText: searchText,
          confidence: Math.min(0.98, score),
          matchStrategy: score >= 0.94 ? ('exact_name' as const) : ('contains' as const),
          sourceModel: 'Product',
          evidence: [`Product.name=${name}`, product.sku ? `sku=${product.sku}` : 'sku=未设置'],
          metadata: {
            sku: product.sku,
            brand: product.brand,
            currentStock: product.currentStock,
            safetyStock: product.safetyStock,
            status: product.status,
          },
        } satisfies EntityResolutionCandidate;
      })
      .filter(Boolean) as EntityResolutionCandidate[];
  }

  private async resolveProjects(input: EntityResolveInput): Promise<EntityResolutionCandidate[]> {
    if (input.preferredObjectTypes?.length && !input.preferredObjectTypes.includes('Project')) return [];
    const text = String(input.text || '').trim();
    const normalizedText = this.normalize(text);
    const searchText = this.extractGenericEntityName(text);
    if (!input.preferredObjectTypes?.includes('Project') && !/项目|护理|服务|疗程|加项/.test(normalizedText)) return [];
    if (/活动|链接|二维码|小程序/.test(normalizedText) && !input.preferredObjectTypes?.includes('Project')) return [];
    const searchTerms = this.buildSearchTerms(searchText, 'Project');
    if (!searchTerms.length) return [];

    const projects = await (this.prisma as any).project.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        OR: searchTerms.flatMap((term) => [
          { name: { contains: term } },
          { description: { contains: term } },
        ]),
      },
      select: {
        id: true,
        name: true,
        price: true,
        duration: true,
        status: true,
        online: true,
      },
      take: 20,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return (projects as any[])
      .map((project) => {
        const name = String(project.name || '');
        const score = this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name });
        if (score < 0.55) return null;
        return {
          objectType: 'Project' as const,
          entityId: String(project.id),
          displayName: name,
          matchedText: searchText,
          confidence: Math.min(0.98, score),
          matchStrategy: score >= 0.94 ? ('exact_name' as const) : ('contains' as const),
          sourceModel: 'Project',
          evidence: [`Project.name=${name}`, `status=${project.status ?? '未设置'}`],
          metadata: {
            price: project.price,
            duration: project.duration,
            status: project.status,
            online: project.online,
          },
        } satisfies EntityResolutionCandidate;
      })
      .filter(Boolean) as EntityResolutionCandidate[];
  }

  private async resolveBeauticians(input: EntityResolveInput): Promise<EntityResolutionCandidate[]> {
    if (input.preferredObjectTypes?.length && !input.preferredObjectTypes.includes('Beautician')) return [];
    const text = String(input.text || '').trim();
    const normalizedText = this.normalize(text);
    const searchText = this.extractGenericEntityName(text);
    if (!input.preferredObjectTypes?.includes('Beautician') && !/美容师|员工|店员|顾问|技师|业绩|绩效|排班|提成|服务/.test(normalizedText)) return [];
    const searchTerms = this.buildSearchTerms(searchText, 'Beautician');
    if (!searchTerms.length) return [];

    const beauticians = await (this.prisma as any).beautician.findMany({
      where: {
        storeId: input.storeId,
        OR: searchTerms.flatMap((term) => [
          { name: { contains: term } },
          { phone: { contains: term } },
        ]),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        levelId: true,
        status: true,
      },
      take: 20,
      orderBy: [{ updatedAt: 'desc' }],
    });

    return (beauticians as any[])
      .map((beautician) => {
        const name = String(beautician.name || '');
        const score = Math.max(
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name }),
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: String(beautician.phone || '') }),
        );
        if (score < 0.55) return null;
        return {
          objectType: 'Beautician' as const,
          entityId: String(beautician.id),
          displayName: name,
          matchedText: searchText,
          confidence: Math.min(0.98, score),
          matchStrategy: score >= 0.94 ? ('exact_name' as const) : ('contains' as const),
          sourceModel: 'Beautician',
          evidence: [`Beautician.name=${name}`, `status=${beautician.status ?? '未设置'}`],
          metadata: {
            levelId: beautician.levelId,
            phoneMasked: this.maskPhone(beautician.phone),
            status: beautician.status,
          },
        } satisfies EntityResolutionCandidate;
      })
      .filter(Boolean) as EntityResolutionCandidate[];
  }

  private async resolveOrders(input: EntityResolveInput): Promise<EntityResolutionCandidate[]> {
    if (input.preferredObjectTypes?.length && !input.preferredObjectTypes.includes('Order')) return [];
    const text = String(input.text || '').trim();
    const normalizedText = this.normalize(text);
    const orderNo = this.extractOrderNo(text);
    const shouldSearchOrder =
      input.preferredObjectTypes?.includes('Order') || /订单|单号|流水|收银|付款|支付|退款|退费|办卡|充值|核销/.test(normalizedText);
    if (!shouldSearchOrder) return [];
    const searchText = orderNo || this.extractOrderEntityName(text);
    const searchTerms = orderNo ? [orderNo] : this.buildSearchTerms(searchText, 'Order');
    if (!searchTerms.length) return [];

    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: input.storeId,
        OR: searchTerms.flatMap((term) => [
          { orderNo: { contains: term } },
          { checkoutGroupNo: { contains: term } },
          { customerName: { contains: term } },
          { remark: { contains: term } },
        ]),
      },
      select: {
        id: true,
        orderNo: true,
        checkoutGroupNo: true,
        orderKind: true,
        customerName: true,
        totalAmount: true,
        netAmount: true,
        status: true,
        payMethod: true,
        createdAt: true,
      },
      take: 20,
      orderBy: [{ createdAt: 'desc' }],
    });

    return (orders as any[])
      .map((order) => {
        const matchedIdentifier =
          searchTerms.find((term) => String(order.checkoutGroupNo || '').includes(term))
            ? String(order.checkoutGroupNo || '')
            : searchTerms.find((term) => String(order.orderNo || '').includes(term))
              ? String(order.orderNo || '')
              : '';
        const name = String(matchedIdentifier || order.orderNo || order.checkoutGroupNo || order.id);
        const score = Math.max(
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: String(order.orderNo || '') }),
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: String(order.checkoutGroupNo || '') }),
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: String(order.customerName || '') }),
        );
        if (score < 0.55) return null;
        return {
          objectType: 'Order' as const,
          entityId: String(order.id),
          displayName: name,
          matchedText: searchText,
          confidence: Math.min(0.99, orderNo && String(order.orderNo).includes(orderNo) ? 0.98 : score),
          matchStrategy: orderNo ? ('exact_name' as const) : ('contains' as const),
          sourceModel: 'ProductOrder',
          evidence: [`ProductOrder.orderNo=${order.orderNo}`, `status=${order.status ?? '未设置'}`],
          metadata: {
            orderNo: order.orderNo,
            checkoutGroupNo: order.checkoutGroupNo,
            orderKind: order.orderKind,
            customerName: order.customerName,
            totalAmount: order.totalAmount,
            netAmount: order.netAmount,
            payMethod: order.payMethod,
            createdAt: order.createdAt,
          },
        } satisfies EntityResolutionCandidate;
      })
      .filter(Boolean) as EntityResolutionCandidate[];
  }

  private async resolveMemberCards(input: EntityResolveInput): Promise<EntityResolutionCandidate[]> {
    if (input.preferredObjectTypes?.length && !input.preferredObjectTypes.includes('MemberCard')) return [];
    const text = String(input.text || '').trim();
    const normalizedText = this.normalize(text);
    if (!input.preferredObjectTypes?.includes('MemberCard') && !/卡|卡项|会员卡|次卡|疗程卡|权益|剩余次数|到期|核销|办卡/.test(normalizedText)) {
      return [];
    }
    const searchText = this.extractCardEntityName(text);
    const searchTerms = this.buildSearchTerms(searchText, 'MemberCard');
    if (!searchTerms.length) return [];

    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: input.storeId ? { storeId: input.storeId } : undefined,
        OR: searchTerms.flatMap((term) => [
          { cardName: { contains: term } },
          { customer: { name: { contains: term } } },
        ]),
      },
      select: {
        id: true,
        cardName: true,
        remainingTimes: true,
        totalTimes: true,
        expiryDate: true,
        status: true,
        customer: { select: { id: true, name: true, memberLevel: true } },
      },
      take: 20,
      orderBy: [{ createdAt: 'desc' }],
    });

    return (cards as any[])
      .map((card) => {
        const cardName = String(card.cardName || '');
        const customerName = String(card.customer?.name || '');
        const score = Math.max(
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: cardName }),
          this.scoreNameMatch({ text: normalizedText, search: this.normalize(searchTerms[0]), searchTerms, name: customerName }),
        );
        if (score < 0.55) return null;
        return {
          objectType: 'MemberCard' as const,
          entityId: String(card.id),
          displayName: `${customerName ? `${customerName} · ` : ''}${cardName}`,
          matchedText: searchText,
          confidence: Math.min(0.98, score),
          matchStrategy: score >= 0.94 ? ('exact_name' as const) : ('contains' as const),
          sourceModel: 'CustomerCard',
          evidence: [`CustomerCard.cardName=${cardName}`, customerName ? `Customer.name=${customerName}` : 'Customer.name=未关联'],
          metadata: {
            cardName,
            customerId: card.customer?.id,
            customerName,
            memberLevel: card.customer?.memberLevel,
            remainingTimes: card.remainingTimes,
            totalTimes: card.totalTimes,
            expiryDate: card.expiryDate,
            status: card.status,
          },
        } satisfies EntityResolutionCandidate;
      })
      .filter(Boolean) as EntityResolutionCandidate[];
  }

  private extractLikelyEntityName(text: string) {
    return String(text || '')
      .replace(/请|帮我|麻烦|一下|查一下|查询|查看|看看/g, '')
      .replace(/活动链接|链接|二维码|小程序路径|小程序码|发我|给我|在哪里|在哪|复制/g, '')
      .replace(/[，。！？!?、]/g, '')
      .trim();
  }

  private extractGenericEntityName(text: string) {
    return String(text || '')
      .replace(/请|帮我|麻烦|一下|查一下|查询|查看|看看|列出|列一下|有哪些|哪些|哪个|哪位|多少/g, '')
      .replace(/今天|今日|昨天|本月|这个月|上月|最近|近期|近30天|近一个月/g, '')
      .replace(/客户|会员|顾客|预约|卡|权益|消费|到店|回访/g, '')
      .replace(/库存|商品|产品|sku|耗材|补货|临期|缺货|还够吗|够吗|够不够/g, '')
      .replace(/项目|服务项目|护理项目|服务次数|卖得好吗|卖得好|销售|收入|趋势/g, '')
      .replace(/美容师|员工|店员|顾问|技师|业绩|绩效|排班|提成|表现/g, '')
      .replace(/[，。！？!?、]/g, '')
      .trim();
  }

  private maskPhone(phone?: string | null) {
    const value = String(phone || '');
    if (value.length < 7) return value ? '已记录' : '';
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }

  private extractOrderNo(text: string) {
    return String(text || '').match(/[A-Za-z]{1,6}\d{4,}|\d{8,}/)?.[0] ?? '';
  }

  private extractOrderEntityName(text: string) {
    return String(text || '')
      .replace(/请|帮我|麻烦|一下|查一下|查询|查看|看看|列出|列一下/g, '')
      .replace(/订单|单号|流水|收银|付款|支付|退款|退费|办卡|充值|核销|明细|详情|打印/g, '')
      .replace(/[，。！？!?、]/g, '')
      .trim();
  }

  private extractCardEntityName(text: string) {
    return String(text || '')
      .replace(/请|帮我|麻烦|一下|查一下|查询|查看|看看/g, '')
      .replace(/还有什么|有哪些|哪些|状态|权益|剩余次数|剩几次|还剩几次|还剩|几次|到期|核销|办卡|客户/g, '')
      .replace(/[，。！？!?、]/g, '')
      .trim();
  }

  private buildSearchTerms(text: string, objectType: Parameters<typeof buildEntitySearchVariants>[0]['objectType']) {
    return buildEntitySearchVariants({ text, objectType, minLength: 2, maxTerms: 8 });
  }

  private bestMatchedText(searchTerms: string[], name: string) {
    const normalizedName = this.normalize(name);
    return searchTerms
      .map((term) => ({ term, score: scoreBusinessNameMatch({ text: term, searchTerms: [term], name: normalizedName }) }))
      .sort((a, b) => b.score - a.score)[0]?.term;
  }

  private scoreNameMatch(params: { text: string; search: string; searchTerms?: string[]; name: string }) {
    const searchTerms = params.searchTerms?.length ? params.searchTerms : [params.search];
    return scoreBusinessNameMatch({ text: params.text, searchTerms, name: params.name });
  }

  private normalize(text: string) {
    return normalizeBusinessText(text);
  }
}
