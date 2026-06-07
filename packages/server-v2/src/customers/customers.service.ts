import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { QueryCustomersDto } from './dto/query-customers.dto.js';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  private formatDate(value?: Date | null) {
    return value ? value.toISOString().slice(0, 10) : '';
  }

  private formatDateTime(value?: Date | null) {
    return value ? value.toISOString().replace('T', ' ').slice(0, 16) : '';
  }

  private formatMoney(value: unknown) {
    const amount = Number(value ?? 0);
    return `￥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  private toConsumptionRecordView(record: any) {
    return {
      ...record,
      userName: record.customer?.name ?? record.userName ?? '',
      storeName: record.customer?.store?.name ?? '',
      amount: this.formatMoney(record.amount),
      consumeTime: this.formatDateTime(record.consumeTime),
      customer: undefined,
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
    const { page = 1, pageSize = 20, keyword, memberLevel, storeName } = query;
    const where: any = { deletedAt: null };

    if (storeId) where.storeId = storeId;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
      ];
    }
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

  async findById(id: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { healthProfile: true, store: true },
    });
    if (!customer || customer.deletedAt) throw new NotFoundException('客户不存在');
    return this.toCustomerView(customer);
  }

  async create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.findById(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(ids: number[]) {
    return this.prisma.customer.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
  }

  async getConsumptionRecords(customerId: number, page = 1, pageSize = 20) {
    const where = { customerId };
    const [items, total] = await Promise.all([
      this.prisma.consumptionRecord.findMany({
        where,
        select: {
          id: true,
          customerId: true,
          consumeType: true,
          consumeContent: true,
          payMethod: true,
          amount: true,
          campaign: true,
          consumeTime: true,
          customer: {
            select: {
              name: true,
              store: { select: { name: true } },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { consumeTime: 'desc' },
      }),
      this.prisma.consumptionRecord.count({ where }),
    ]);
    const viewItems = items.map((record) => this.toConsumptionRecordView(record));
    return { items: viewItems, data: viewItems, total, page, pageSize };
  }

  async getAllConsumptionRecords(storeId?: number) {
    const where: any = {};
    if (storeId) {
      where.customer = {
        storeId,
        deletedAt: null,
      };
    }

    return this.prisma.consumptionRecord.findMany({
      where,
      select: {
        id: true,
        customerId: true,
        consumeType: true,
        consumeContent: true,
        payMethod: true,
        amount: true,
        campaign: true,
        consumeTime: true,
        customer: {
          select: {
            name: true,
            store: { select: { name: true } },
          },
        },
      },
      orderBy: { consumeTime: 'desc' },
    }).then((records) => records.map((record) => this.toConsumptionRecordView(record)));
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

  async importCustomers(customers: CreateCustomerDto[]) {
    return this.prisma.customer.createMany({ data: customers, skipDuplicates: true });
  }
}
