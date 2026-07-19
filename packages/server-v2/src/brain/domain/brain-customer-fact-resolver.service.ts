import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CustomerLifecycleOntologyService } from '../../marketing/customer-lifecycle-ontology.service.js';
import { formatBrainMoney, toBrainNumber } from './brain-domain-formatters.js';
import { extractCustomerPhoneTail, extractSpecificCustomerNameFromMention } from './brain-customer-identity.js';
import { CUSTOMER_MONETARY_TIERS, customerMonetaryTier } from '../../customers/customer-value-segmentation.js';

export interface BrainNewCustomerSourceDistribution {
  total: number;
  missingSourceCount: number;
  sourceRanking: Array<{ source: string; count: number; share: number }>;
  weeklyRanking: Array<{ week: string; count: number }>;
}

export interface BrainCustomerRetentionSummary {
  rangeLabel: string;
  activeCustomerCount: number;
  repeatCustomerCount: number;
  repurchaseRate: number;
  repeatIntervalCount: number;
  averageReturnIntervalDays: number | null;
}

export interface BrainNewCustomerConversionSummary {
  newCustomerCount: number;
  convertedCustomerCount: number;
  unconvertedCustomerCount: number;
  conversionRate: number;
}

export interface BrainArrivedCustomerAgeDistribution {
  arrivedCustomerCount: number;
  knownAgeCount: number;
  unknownAgeCount: number;
  rows: Array<{ ageGroup: string; count: number; share: number }>;
}

export interface BrainCustomerCardUsageRow {
  [key: string]: unknown;
  customerName: string;
  cardName: string;
  totalTimes: number;
  remainingTimes: number;
  usedTimes: number;
  usageRate: number;
  totalSpent: number;
  lastVisitDate: Date | null;
}

export interface BrainExpiringCardBalanceRow {
  [key: string]: unknown;
  customerName: string;
  cardName: string;
  totalTimes: number;
  remainingTimes: number;
  remainingRate: number;
  expiryDate: Date;
  daysToExpiry: number;
  unfulfilledValue: number;
}

export interface BrainVipCustomerSummary {
  total: number;
  rows: Array<{
    customerId: number;
    customerName: string;
    memberLevel: string;
    totalSpent: number;
    lastVisitDate: string | null;
  }>;
}

export interface BrainInactiveCustomerSummary {
  total: number;
  thresholdDays: number;
  rows: Array<{
    customerId: number;
    customerName: string;
    totalSpent: number;
    visitCount: number;
    lastVisitDate: string | null;
  }>;
}

export interface BrainExactCustomerBasicSummary {
  status: 'found' | 'ambiguous' | 'not_found' | 'missing_identity';
  rows: Array<{
    customerName: string;
    maskedPhone: string;
    memberLevel: string;
    totalSpent: number;
    visitCount: number;
    lastVisitDate: string | null;
    lastProjectName: string | null;
    lastBeauticianName: string | null;
    lastServiceDate: string | null;
  }>;
}

@Injectable()
export class BrainCustomerFactResolverService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly customerLifecycle?: CustomerLifecycleOntologyService,
  ) {}

  async answerCustomerQuestion(input: {
    storeId: number;
    message: string;
    specificCustomerMention?: string;
    permissions: string[];
    startDate?: Date;
    endDate?: Date;
  }) {
    const hasExactLookup = Boolean(input.specificCustomerMention?.trim() || extractCustomerPhoneTail(input.message));
    if (hasExactLookup) {
      return this.answerExactCustomerQuestion({
        storeId: input.storeId,
        message: input.message,
        customerName: input.specificCustomerMention?.trim(),
        permissions: input.permissions,
      });
    }
    return this.answerCustomerFactQuestion({
      storeId: input.storeId,
      message: input.message,
      startDate: input.startDate,
      endDate: input.endDate,
    });
  }

  async getVipCustomerSummary(storeId: number, limit = 10): Promise<BrainVipCustomerSummary> {
    const where = { storeId, deletedAt: null, memberLevel: { notIn: ['无', '普通', '普通会员', ''] } };
    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: [{ totalSpent: 'desc' }],
        select: { id: true, name: true, memberLevel: true, totalSpent: true, lastVisitDate: true },
        take: limit,
      }),
    ]);
    return {
      total,
      rows: customers.map((customer) => ({
        customerId: customer.id,
        customerName: customer.name,
        memberLevel: customer.memberLevel,
        totalSpent: toBrainNumber(customer.totalSpent),
        lastVisitDate: customer.lastVisitDate?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  async getInactiveCustomerSummary(
    storeId: number,
    thresholdDays = 60,
    limit = 10,
  ): Promise<BrainInactiveCustomerSummary> {
    const inactiveBefore = new Date();
    inactiveBefore.setDate(inactiveBefore.getDate() - thresholdDays);
    const where = {
      storeId,
      deletedAt: null,
      OR: [{ lastVisitDate: null }, { lastVisitDate: { lt: inactiveBefore } }],
    };
    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: [{ totalSpent: 'desc' }],
        select: { id: true, name: true, totalSpent: true, visitCount: true, lastVisitDate: true },
        take: limit,
      }),
    ]);
    return {
      total,
      thresholdDays,
      rows: customers.map((customer) => ({
        customerId: customer.id,
        customerName: customer.name,
        totalSpent: toBrainNumber(customer.totalSpent),
        visitCount: customer.visitCount,
        lastVisitDate: customer.lastVisitDate?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  async getExactCustomerBasicSummary(input: {
    storeId: number;
    message: string;
    customerName?: string;
  }): Promise<BrainExactCustomerBasicSummary> {
    const customerMention = input.customerName?.trim();
    const name =
      (customerMention ? extractSpecificCustomerNameFromMention(customerMention) : undefined) ||
      this.extractCustomerName(input.message);
    const phoneTail = extractCustomerPhoneTail(`${customerMention ?? ''} ${input.message}`);
    if (!name && !phoneTail) return { status: 'missing_identity', rows: [] };

    const customers = await this.prisma.customer.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        ...(name && phoneTail
          ? { AND: [{ name: { contains: name } }, { phone: { endsWith: phoneTail } }] }
          : name
            ? { name: { contains: name } }
            : { phone: { endsWith: phoneTail! } }),
      },
      select: {
        name: true,
        phone: true,
        memberLevel: true,
        totalSpent: true,
        visitCount: true,
        lastVisitDate: true,
        serviceTasks: {
          where: { storeId: input.storeId, status: 'completed' },
          orderBy: [{ completedAt: 'desc' }, { appointmentTime: 'desc' }],
          take: 1,
          select: {
            completedAt: true,
            appointmentTime: true,
            project: { select: { name: true } },
            beautician: { select: { name: true } },
          },
        },
      },
      orderBy: [{ totalSpent: 'desc' }],
      take: 5,
    });
    const rows = customers.map((customer) => {
      const latestService = customer.serviceTasks[0];
      return {
        customerName: customer.name,
        maskedPhone: this.maskPhone(customer.phone),
        memberLevel: customer.memberLevel,
        totalSpent: toBrainNumber(customer.totalSpent),
        visitCount: customer.visitCount,
        lastVisitDate: customer.lastVisitDate?.toISOString().slice(0, 10) ?? null,
        lastProjectName: latestService?.project.name ?? null,
        lastBeauticianName: latestService?.beautician?.name ?? null,
        lastServiceDate:
          (latestService?.completedAt ?? latestService?.appointmentTime)?.toISOString().slice(0, 10) ?? null,
      };
    });
    return {
      status: rows.length === 0 ? 'not_found' : rows.length === 1 ? 'found' : 'ambiguous',
      rows,
    };
  }

  async answerExactCustomerQuestion(input: {
    storeId: number;
    message: string;
    customerName?: string;
    permissions: string[];
  }) {
    const customerMention = input.customerName?.trim();
    const name =
      (customerMention ? extractSpecificCustomerNameFromMention(customerMention) : undefined) ||
      this.extractCustomerName(input.message);
    const phoneTail = extractCustomerPhoneTail(`${customerMention ?? ''} ${input.message}`);
    if (!name && !phoneTail) {
      return '请提供客户姓名或手机号后四位，我才能在当前门店范围内精确查询；不会根据“这个客人”猜测身份。';
    }

    const customers = await this.prisma.customer.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        ...(name && phoneTail
          ? { AND: [{ name: { contains: name } }, { phone: { endsWith: phoneTail } }] }
          : name
            ? { name: { contains: name } }
            : { phone: { endsWith: phoneTail! } }),
      },
      include: {
        healthProfile: true,
        customerCards: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 5 },
        balanceAccounts: { where: { storeId: input.storeId, status: 'active' }, take: 1 },
        consumptionRecords: { orderBy: { consumeTime: 'desc' }, take: 5 },
        reservations: {
          orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
          take: 5,
          include: { project: { select: { name: true } }, beautician: { select: { name: true } } },
        },
        serviceTasks: {
          where: { storeId: input.storeId, status: 'completed' },
          orderBy: [{ completedAt: 'desc' }, { appointmentTime: 'desc' }],
          take: 5,
          include: { project: { select: { name: true } }, beautician: { select: { name: true } } },
        },
      },
      take: 5,
    });

    if (!customers.length) return '当前门店没有找到匹配客户，请核对姓名或手机号后四位。';
    if (customers.length > 1) {
      return `找到 ${customers.length} 位同名或尾号匹配客户：\n${customers
        .map(
          (customer, index) =>
            `${index + 1}. ${customer.name}，手机 ${this.maskPhone(customer.phone)}，${customer.memberLevel}`,
        )
        .join('\n')}\n请补充完整姓名或手机号后四位后继续。`;
    }

    const customer = customers[0];
    const lines = [
      `客户：${customer.name}，手机 ${this.maskPhone(customer.phone)}，会员等级 ${customer.memberLevel}。`,
      `累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}，到店 ${customer.visitCount} 次，最近到店 ${customer.lastVisitDate?.toISOString().slice(0, 10) ?? '未记录'}。`,
    ];
    if (/预约|改期|还没来/.test(input.message)) {
      lines.push(
        customer.reservations.length
          ? `最近预约：${customer.reservations
              .map(
                (reservation) =>
                  `${reservation.date.toISOString().slice(0, 10)} ${reservation.startTime} ${reservation.project.name}（${reservation.status}）`,
              )
              .join('；')}。`
          : '当前没有查到预约记录。',
      );
    }
    if (/消费|上次|项目|美容师|备注|不满|兴趣/.test(input.message)) {
      const latestServiceTask = customer.serviceTasks?.[0];
      lines.push(
        latestServiceTask
          ? `最近完成服务：${latestServiceTask.project.name}，美容师 ${latestServiceTask.beautician?.name ?? '未指定'}，完成时间 ${latestServiceTask.completedAt?.toISOString().slice(0, 10) ?? latestServiceTask.appointmentTime.toISOString().slice(0, 10)}，服务备注 ${latestServiceTask.remark || '无'}。`
          : '当前没有查到已完成服务任务。',
      );
      if (customer.consumptionRecords.length) {
        lines.push(
          `最近消费：${customer.consumptionRecords
            .map(
              (record) =>
                `${record.consumeTime.toISOString().slice(0, 10)} ${record.consumeContent} ${formatBrainMoney(toBrainNumber(record.amount))}`,
            )
            .join('；')}。`,
        );
      }
    }
    if (/卡|次数|余额|储值/.test(input.message)) {
      lines.push(
        customer.customerCards.length
          ? `卡项：${customer.customerCards.map((card) => `${card.cardName} 剩余 ${card.remainingTimes} 次，有效期至 ${card.expiryDate.toISOString().slice(0, 10)}`).join('；')}。`
          : '当前没有活跃次卡。',
      );
      const balance = customer.balanceAccounts[0];
      lines.push(
        balance
          ? `储值余额：现金 ${formatBrainMoney(toBrainNumber(balance.cashBalance))}，赠送 ${formatBrainMoney(toBrainNumber(balance.giftBalance))}。`
          : '当前没有储值账户。',
      );
    }
    if (/过敏|皮肤|健康|注意事项/.test(input.message)) {
      if (!input.permissions.includes('*') && !input.permissions.includes('core:customer:profile')) {
        lines.push('健康与过敏信息需要 core:customer:profile 权限，当前不展示。');
      } else {
        lines.push(
          `健康注意：过敏 ${customer.healthProfile?.allergyHistory || customer.hasAllergy || '未记录'}；肤质 ${customer.healthProfile?.skinType || customer.skinType || '未记录'}；主要问题 ${customer.healthProfile?.mainProblems || customer.skinCondition || '未记录'}。`,
        );
      }
    }
    if (/标签|备注|习惯|喜欢.*时间/.test(input.message)) {
      lines.push(`标签：${customer.tags.length ? customer.tags.join('、') : '无'}；备注：${customer.remark || '无'}。`);
    }
    if (/渠道|来源/.test(input.message)) {
      lines.push(`客户来源：${customer.source || '未记录'}。`);
    }
    return lines.join('\n');
  }

  async answerCustomerFactQuestion(input: { storeId: number; message: string; startDate?: Date; endDate?: Date }) {
    const message = input.message;
    if (/(活动).*(响应|点击|触达|转化).*客户|上次活动.*客户/.test(message)) {
      return this.marketingResponsiveCustomers(input.storeId);
    }
    if (/(办了卡|有卡).*(还没预约|没有预约)/.test(message)) {
      return this.cardWithoutReservationCustomers(input.storeId);
    }
    if (/(重要客户.*来店|来店.*重要客户|特别关注)/.test(message)) {
      return this.todayImportantVisitors(input.storeId);
    }
    if (/(优惠.*敏感|等打折|打折才来)/.test(message)) {
      return this.discountSensitiveCustomers(input.storeId);
    }
    if (/(?:按|根据)?消费金额.*(?:分层|分一下层|分组)|客户.*消费金额.*层/.test(message)) {
      return this.customerSpendingTiers(input.storeId);
    }
    if (
      /(?:只做过|做过).*(?:基础项目|基础护理).*(?:没有|没).*(?:升单|升级)|基础项目.*(?:未升单|没升单)/.test(message)
    ) {
      return this.basicProjectWithoutUpgradeCustomers(input.storeId);
    }
    if (/(?:疗程|次卡).*(?:快结束|临近结束|续购)|(?:续购).*(?:疗程|次卡|客户)/.test(message)) {
      return this.treatmentRenewalCustomers(input.storeId);
    }
    if (/(新客.*(?:渠道|来源)|(?:渠道|来源).*新客|新客最多|时间段.*新客)/.test(message)) {
      return this.newCustomerSourceTrend({
        storeId: input.storeId,
        startDate: input.startDate,
        endDate: input.endDate,
      });
    }
    if (/卡里.*次数|次数快用完|卡.*快用完/.test(message)) {
      return this.lowRemainingCardCustomers(input.storeId);
    }
    if (/生日|关怀/.test(message)) {
      return this.upcomingBirthdayCustomers(input.storeId);
    }
    if (/vip|高等级|重要客户/i.test(message)) {
      return this.vipCustomers(input.storeId);
    }
    if (/(高价值.*(?:不(?:太)?活跃|好久没来|沉睡)|(?:不(?:太)?活跃|好久没来|沉睡).*高价值)/.test(message)) {
      return this.highValueInactiveCustomers(input.storeId);
    }
    if (/消费频率.*(?:下降|减少|降低)/.test(message)) {
      return this.decliningCustomerConsumption(input.storeId, 'frequency');
    }
    if (/消费.*(?:明显减少|明显下降|下降很多|减少很多)/.test(message)) {
      return this.decliningCustomerConsumption(input.storeId, 'amount');
    }
    if (/(?:新客).*(?:潜力).*(?:长期客户|长期)|(?:潜力转成长期).*(?:新客|客户)/.test(message)) {
      return this.newCustomerLongTermPotential(input.storeId);
    }
    if (
      /(?:客户).*(?:项目).*(?:特别感兴趣|感兴趣).*(?:还没办卡|未办卡|没有办卡)|(?:项目).*(?:特别感兴趣|感兴趣).*(?:还没办卡|未办卡|没有办卡)/.test(
        message,
      )
    ) {
      return this.projectInterestWithoutActiveCard(input.storeId);
    }
    if (/高价值|消费很多|消费金额|分层/.test(message)) {
      return this.highValueCustomers(input.storeId);
    }
    if (/只来一次|一次就再没回来/.test(message)) {
      return this.oneTimeCustomers(input.storeId);
    }
    if (/(?:沉睡客户.*唤醒.*迹象|唤醒.*迹象.*沉睡客户)/.test(message)) {
      if (!this.customerLifecycle) {
        return '客户生命周期事实服务未就绪，暂时无法核对沉睡客户的触达后预约、到店和消费证据；Ami Brain 不会用沉睡客户名单代替回答。';
      }
      const summary = await this.customerLifecycle.getDormantReactivationEvidence(input.storeId, {
        startDate: input.startDate,
        endDate: input.endDate,
        limit: 10,
      });
      if (!summary.reactivatedCustomerCount) {
        return `${summary.rangeLabel}分析了 ${summary.touchCountAnalyzed}/${summary.touchCountTotal} 条有效触达，其中 ${summary.dormantCandidateCount} 位客户在触达前满足沉睡证据，但触达后没有发现预约、实际到店、有效消费、点击或回复信号。发送成功本身不算唤醒。${summary.touchesTruncated ? '当前结果为受控部分扫描，不代表全量没有信号。' : ''}`;
      }
      return `${summary.rangeLabel}发现 ${summary.reactivatedCustomerCount} 位沉睡客户出现唤醒迹象，其中强信号 ${summary.strongSignalCustomerCount} 位、中信号 ${summary.mediumSignalCustomerCount} 位、弱信号 ${summary.weakSignalCustomerCount} 位。\n${summary.rows
        .map(
          (row, index) => `${index + 1}. ${row.customerName}：${row.signalSummary}；沉睡证据：${row.dormantEvidence}`,
        )
        .join(
          '\n',
        )}\n说明：预约、到店或消费发生在触达后窗口内属于时间关联证据；只有显式营销归因记录才视为系统归因，不直接宣称因果。${summary.touchesTruncated ? `本次扫描 ${summary.touchCountAnalyzed}/${summary.touchCountTotal} 条有效触达，结果为部分覆盖。` : ''}`;
    }
    if (/好久没来|不活跃|沉睡|流失|消费频率.*下降|续购|疗程快结束|\d+天没来|三个月没来/.test(message)) {
      const days = message.includes('三个月') ? 90 : Number(message.match(/(\d+)天没来/)?.[1] ?? 60);
      return this.inactiveCustomers(input.storeId, days);
    }
    return '当前客户事实能力尚未注册该业务口径，不会编造回答。已接入精确客户、VIP、高价值、沉睡、生日、低余次卡、重要到店和营销响应客户查询。';
  }

  async getCustomerRetentionSummary(input: {
    storeId: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<BrainCustomerRetentionSummary> {
    const endDate = input.endDate ? new Date(input.endDate) : new Date();
    const startDate = input.startDate ? new Date(input.startDate) : new Date(endDate);
    if (!input.startDate) startDate.setDate(startDate.getDate() - 180);
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId: input.storeId,
        customerId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
        netAmount: { gt: 0 },
      },
      select: { customerId: true, createdAt: true },
      orderBy: [{ customerId: 'asc' }, { createdAt: 'asc' }],
      take: 20_000,
    });
    const byCustomer = new Map<number, Date[]>();
    for (const order of orders) {
      if (!order.customerId) continue;
      const values = byCustomer.get(order.customerId) ?? [];
      values.push(order.createdAt);
      byCustomer.set(order.customerId, values);
    }
    const intervals: number[] = [];
    let repeatCustomerCount = 0;
    for (const dates of byCustomer.values()) {
      if (dates.length < 2) continue;
      repeatCustomerCount += 1;
      for (let index = 1; index < dates.length; index += 1) {
        intervals.push((dates[index]!.getTime() - dates[index - 1]!.getTime()) / 86_400_000);
      }
    }
    const activeCustomerCount = byCustomer.size;
    return {
      rangeLabel: input.startDate
        ? `${startDate.toISOString().slice(0, 10)} 至 ${endDate.toISOString().slice(0, 10)}`
        : '最近 180 天',
      activeCustomerCount,
      repeatCustomerCount,
      repurchaseRate: activeCustomerCount > 0 ? repeatCustomerCount / activeCustomerCount : 0,
      repeatIntervalCount: intervals.length,
      averageReturnIntervalDays: intervals.length
        ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        : null,
    };
  }

  async getNewCustomerConversionSummary(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<BrainNewCustomerConversionSummary> {
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        createdAt: { gte: input.startDate, lte: input.endDate },
      },
      select: { id: true, createdAt: true },
      take: 20_000,
    });
    if (!customers.length) {
      return {
        newCustomerCount: 0,
        convertedCustomerCount: 0,
        unconvertedCustomerCount: 0,
        conversionRate: 0,
      };
    }
    const createdAtByCustomer = new Map(customers.map((customer) => [customer.id, customer.createdAt]));
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId: input.storeId,
        customerId: { in: customers.map((customer) => customer.id) },
        createdAt: { gte: input.startDate, lte: input.endDate },
        status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
        netAmount: { gt: 0 },
      },
      select: { customerId: true, createdAt: true },
      take: 20_000,
    });
    const convertedCustomerIds = new Set(
      orders.flatMap((order) => {
        const customerCreatedAt = order.customerId ? createdAtByCustomer.get(order.customerId) : undefined;
        return order.customerId && customerCreatedAt && order.createdAt >= customerCreatedAt ? [order.customerId] : [];
      }),
    );
    const newCustomerCount = customers.length;
    const convertedCustomerCount = convertedCustomerIds.size;
    return {
      newCustomerCount,
      convertedCustomerCount,
      unconvertedCustomerCount: newCustomerCount - convertedCustomerCount,
      conversionRate: newCustomerCount > 0 ? convertedCustomerCount / newCustomerCount : 0,
    };
  }

  async getArrivedCustomerAgeDistribution(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<BrainArrivedCustomerAgeDistribution> {
    const arrivedStatuses = [
      'checked_in',
      'in_service',
      'arrived',
      'completed',
      'served',
      '已到店',
      '服务中',
      '已完成',
    ];
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId: input.storeId,
        OR: [
          { checkedInAt: { gte: input.startDate, lte: input.endDate } },
          {
            checkedInAt: null,
            date: { gte: input.startDate, lte: input.endDate },
            status: { in: arrivedStatuses },
          },
        ],
      },
      select: {
        customerId: true,
        customer: { select: { age: true, birthday: true } },
      },
      take: 20_000,
    });
    const ageByCustomer = new Map<number, number | null>();
    for (const reservation of reservations) {
      if (ageByCustomer.has(reservation.customerId)) continue;
      ageByCustomer.set(
        reservation.customerId,
        this.resolveCustomerAge(reservation.customer.age, reservation.customer.birthday, input.endDate),
      );
    }
    const counts = new Map<string, number>();
    let unknownAgeCount = 0;
    for (const age of ageByCustomer.values()) {
      if (age === null) {
        unknownAgeCount += 1;
        continue;
      }
      const ageGroup = this.customerAgeGroup(age);
      counts.set(ageGroup, (counts.get(ageGroup) ?? 0) + 1);
    }
    const arrivedCustomerCount = ageByCustomer.size;
    const knownAgeCount = arrivedCustomerCount - unknownAgeCount;
    const order = ['24岁及以下', '25-34岁', '35-44岁', '45-54岁', '55岁及以上'];
    return {
      arrivedCustomerCount,
      knownAgeCount,
      unknownAgeCount,
      rows: order.flatMap((ageGroup) => {
        const count = counts.get(ageGroup) ?? 0;
        return count > 0
          ? [{ ageGroup, count, share: arrivedCustomerCount > 0 ? count / arrivedCustomerCount : 0 }]
          : [];
      }),
    };
  }

  async getLowCardUsageCustomers(
    storeId: number,
    limit = 10,
  ): Promise<{ total: number; rows: BrainCustomerCardUsageRow[] }> {
    const cards = await this.prisma.customerCard.findMany({
      where: {
        status: 'active',
        totalTimes: { gt: 0 },
        remainingTimes: { gt: 0 },
        customer: { storeId, deletedAt: null, totalSpent: { gt: 0 } },
      },
      select: {
        cardName: true,
        totalTimes: true,
        remainingTimes: true,
        customer: { select: { name: true, totalSpent: true, lastVisitDate: true } },
        usageRecords: { select: { times: true } },
      },
      take: 5_000,
    });
    const matches = cards
      .map((card) => {
        const usedTimes = card.usageRecords.reduce((sum, record) => sum + record.times, 0);
        return {
          customerName: card.customer.name,
          cardName: card.cardName,
          totalTimes: card.totalTimes,
          remainingTimes: card.remainingTimes,
          usedTimes,
          usageRate: card.totalTimes > 0 ? usedTimes / card.totalTimes : 0,
          totalSpent: toBrainNumber(card.customer.totalSpent),
          lastVisitDate: card.customer.lastVisitDate,
        };
      })
      .filter((row) => row.usedTimes <= 1 || row.usageRate <= 0.2)
      .sort((left, right) => left.usageRate - right.usageRate || right.totalSpent - left.totalSpent);
    return { total: matches.length, rows: matches.slice(0, limit) };
  }

  async getNeverUsedCardCustomers(
    storeId: number,
    limit = 10,
  ): Promise<{ total: number; rows: BrainCustomerCardUsageRow[] }> {
    const cards = await this.prisma.customerCard.findMany({
      where: {
        status: 'active',
        totalTimes: { gt: 0 },
        remainingTimes: { gt: 0 },
        usageRecords: { none: {} },
        customer: { storeId, deletedAt: null },
      },
      select: {
        cardName: true,
        totalTimes: true,
        remainingTimes: true,
        customer: { select: { name: true, totalSpent: true, lastVisitDate: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 5_000,
    });
    const rows = cards.map((card) => ({
      customerName: card.customer.name,
      cardName: card.cardName,
      totalTimes: card.totalTimes,
      remainingTimes: card.remainingTimes,
      usedTimes: 0,
      usageRate: 0,
      totalSpent: toBrainNumber(card.customer.totalSpent),
      lastVisitDate: card.customer.lastVisitDate,
    }));
    return { total: rows.length, rows: rows.slice(0, limit) };
  }

  async getExpiringHighBalanceCards(input: {
    storeId: number;
    asOf: Date;
    windowDays?: number;
    limit?: number;
  }): Promise<{ total: number; windowDays: number; rows: BrainExpiringCardBalanceRow[] }> {
    const windowDays = Math.max(1, Math.min(180, input.windowDays ?? 30));
    const end = new Date(input.asOf.getTime() + windowDays * 86_400_000);
    const cards = await this.prisma.customerCard.findMany({
      where: {
        status: 'active',
        totalTimes: { gt: 0 },
        remainingTimes: { gt: 0 },
        expiryDate: { gte: input.asOf, lte: end },
        customer: { storeId: input.storeId, deletedAt: null },
      },
      select: {
        cardName: true,
        totalTimes: true,
        remainingTimes: true,
        recognizedUnitValue: true,
        expiryDate: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ expiryDate: 'asc' }, { remainingTimes: 'desc' }],
      take: 5000,
    });
    const rows = cards
      .map((card) => {
        const remainingRate = card.totalTimes > 0 ? card.remainingTimes / card.totalTimes : 0;
        return {
          customerName: card.customer.name,
          cardName: card.cardName,
          totalTimes: card.totalTimes,
          remainingTimes: card.remainingTimes,
          remainingRate,
          expiryDate: card.expiryDate,
          daysToExpiry: Math.max(0, Math.ceil((card.expiryDate.getTime() - input.asOf.getTime()) / 86_400_000)),
          unfulfilledValue: toBrainNumber(card.remainingTimes) * toBrainNumber(card.recognizedUnitValue),
        };
      })
      .filter((row) => row.remainingTimes >= 3 || row.remainingRate >= 0.3)
      .sort((left, right) => left.daysToExpiry - right.daysToExpiry || right.remainingTimes - left.remainingTimes);
    return { total: rows.length, windowDays, rows: rows.slice(0, input.limit ?? 10) };
  }

  private async todayImportantVisitors(storeId: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId,
        date: { gte: start, lt: end },
        status: { notIn: ['cancelled', 'canceled', '已取消'] },
        customer: {
          deletedAt: null,
          OR: [{ memberLevel: { notIn: ['无', '普通', '普通会员', ''] } }, { totalSpent: { gte: 5000 } }],
        },
      },
      include: {
        customer: { select: { name: true, memberLevel: true, totalSpent: true, lastVisitDate: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ startTime: 'asc' }],
      take: 10,
    });

    return this.formatCustomerRows(
      '今日需关注的重要到店客户',
      reservations,
      (reservation) =>
        `${reservation.startTime} ${reservation.customer.name}：${reservation.customer.memberLevel}，累计消费 ${formatBrainMoney(
          toBrainNumber(reservation.customer.totalSpent),
        )}，预约项目 ${reservation.project.name}${this.lastVisitText(reservation.customer.lastVisitDate)}`,
    );
  }

  private async discountSensitiveCustomers(storeId: number) {
    const start = new Date();
    start.setDate(start.getDate() - 180);
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId,
        customerId: { not: null },
        status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
        createdAt: { gte: start },
        totalAmount: { gt: 0 },
      },
      select: {
        customerId: true,
        totalAmount: true,
        totalDiscountAmount: true,
        createdAt: true,
        customer: { select: { name: true, totalSpent: true, visitCount: true, lastVisitDate: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 1000,
    });

    const grouped = new Map<
      number,
      {
        name: string;
        orderCount: number;
        discountOrderCount: number;
        totalAmount: number;
        discountAmount: number;
        totalSpent: number;
        visitCount: number;
        lastVisitDate?: Date | null;
      }
    >();
    for (const order of orders) {
      if (!order.customerId || !order.customer) continue;
      const current = grouped.get(order.customerId) ?? {
        name: order.customer.name,
        orderCount: 0,
        discountOrderCount: 0,
        totalAmount: 0,
        discountAmount: 0,
        totalSpent: toBrainNumber(order.customer.totalSpent),
        visitCount: order.customer.visitCount,
        lastVisitDate: order.customer.lastVisitDate,
      };
      const discountAmount = toBrainNumber(order.totalDiscountAmount);
      current.orderCount += 1;
      current.discountOrderCount += discountAmount > 0 ? 1 : 0;
      current.totalAmount += toBrainNumber(order.totalAmount);
      current.discountAmount += discountAmount;
      grouped.set(order.customerId, current);
    }

    const rows = Array.from(grouped.values())
      .map((customer) => ({
        ...customer,
        discountOrderRate: customer.orderCount > 0 ? customer.discountOrderCount / customer.orderCount : 0,
      }))
      .filter(
        (customer) => customer.orderCount >= 2 && customer.discountOrderCount >= 2 && customer.discountOrderRate >= 0.5,
      )
      .sort(
        (left, right) => right.discountOrderRate - left.discountOrderRate || right.discountAmount - left.discountAmount,
      )
      .slice(0, 10);

    return this.formatCustomerRows(
      '优惠敏感客户候选名单（近 180 天至少 2 单、至少 2 笔优惠单且优惠订单占比不低于 50%）',
      rows,
      (customer) =>
        `${customer.name}：近 180 天 ${customer.orderCount} 单中 ${customer.discountOrderCount} 单使用优惠，优惠订单占比 ${Math.round(
          customer.discountOrderRate * 100,
        )}%，累计优惠 ${formatBrainMoney(customer.discountAmount)}，累计消费 ${formatBrainMoney(customer.totalSpent)}${this.lastVisitText(
          customer.lastVisitDate,
        )}`,
    );
  }

  private async customerSpendingTiers(storeId: number) {
    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where: { storeId, deletedAt: null } }),
      this.prisma.customer.findMany({
        where: { storeId, deletedAt: null },
        select: { name: true, totalSpent: true, visitCount: true, lastVisitDate: true },
        orderBy: [{ totalSpent: 'desc' }],
        take: 20_000,
      }),
    ]);
    const grouped = new Map<number, typeof customers>();
    for (const customer of customers) {
      const tier = customerMonetaryTier(toBrainNumber(customer.totalSpent));
      const rows = grouped.get(tier.score) ?? [];
      rows.push(customer);
      grouped.set(tier.score, rows);
    }
    const lines = CUSTOMER_MONETARY_TIERS.map((tier, index) => {
      const rows = grouped.get(tier.score) ?? [];
      const range =
        tier.max === null
          ? `${formatBrainMoney(tier.min)} 以上`
          : tier.score === 0
            ? '累计消费为 0'
            : `${formatBrainMoney(tier.min)} 至 ${formatBrainMoney(tier.max)} 以下`;
      const examples = rows
        .slice(0, 3)
        .map((customer) => `${customer.name} ${formatBrainMoney(toBrainNumber(customer.totalSpent))}`)
        .join('、');
      return `${index + 1}. ${tier.label}（${range}）：${rows.length} 人${examples ? `；示例 ${examples}` : ''}`;
    });
    const coverage =
      total > customers.length
        ? `本次分析前 ${customers.length}/${total} 位客户，结果为受控样本`
        : `覆盖当前门店 ${total} 位客户`;
    return `客户累计消费金额分层（复用管理端客户画像 M 值阈值，${coverage}）：\n${lines.join('\n')}`;
  }

  private async basicProjectWithoutUpgradeCustomers(storeId: number) {
    const projects = await this.prisma.project.findMany({
      where: { storeId, deletedAt: null, status: 'active' },
      select: { id: true, name: true, type: { select: { name: true } } },
    });
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const basicProjectIds = new Set(
      projects.filter((project) => /基础/.test(project.type?.name ?? '')).map((project) => project.id),
    );
    if (!basicProjectIds.size) {
      return '当前门店项目类型没有标记“基础”的项目，无法识别基础项目未升单客户；Ami Brain 不会按价格猜测项目层级。';
    }
    const items = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'project',
        itemId: { not: null },
        order: {
          storeId,
          customerId: { not: null },
          status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
          netAmount: { gt: 0 },
        },
      },
      select: {
        itemId: true,
        name: true,
        createdAt: true,
        order: {
          select: { customerId: true, customer: { select: { name: true, totalSpent: true, lastVisitDate: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 20_000,
    });
    const grouped = new Map<
      number,
      { name: string; totalSpent: number; lastVisitDate: Date | null; basicProjects: Set<string>; hasNonBasic: boolean }
    >();
    for (const item of items) {
      const customerId = item.order.customerId;
      const customer = item.order.customer;
      if (!customerId || !customer || !item.itemId || !projectById.has(item.itemId)) continue;
      const current = grouped.get(customerId) ?? {
        name: customer.name,
        totalSpent: toBrainNumber(customer.totalSpent),
        lastVisitDate: customer.lastVisitDate,
        basicProjects: new Set<string>(),
        hasNonBasic: false,
      };
      if (basicProjectIds.has(item.itemId)) current.basicProjects.add(item.name);
      else current.hasNonBasic = true;
      grouped.set(customerId, current);
    }
    const rows = Array.from(grouped.values())
      .filter((customer) => customer.basicProjects.size > 0 && !customer.hasNonBasic)
      .sort((left, right) => right.totalSpent - left.totalSpent);
    return this.formatCustomerRows(
      '只购买过基础项目、尚无非基础项目消费的客户（基础项目按管理端 ProjectType 名称含“基础”识别）',
      rows.slice(0, 10),
      (customer) =>
        `${customer.name}：基础项目 ${Array.from(customer.basicProjects).join('、')}，累计消费 ${formatBrainMoney(customer.totalSpent)}${this.lastVisitText(customer.lastVisitDate)}`,
      rows.length,
    );
  }

  private async treatmentRenewalCustomers(storeId: number) {
    const now = new Date();
    const expiryCutoff = new Date(now);
    expiryCutoff.setDate(expiryCutoff.getDate() + 30);
    const cards = await this.prisma.customerCard.findMany({
      where: {
        status: 'active',
        remainingTimes: { gt: 0 },
        customer: { storeId, deletedAt: null },
        OR: [{ remainingTimes: { lte: 2 } }, { expiryDate: { gte: now, lte: expiryCutoff } }],
      },
      select: {
        customerId: true,
        cardName: true,
        totalTimes: true,
        remainingTimes: true,
        expiryDate: true,
        customer: { select: { name: true, totalSpent: true, lastVisitDate: true } },
      },
      orderBy: [{ remainingTimes: 'asc' }, { expiryDate: 'asc' }],
      take: 20_000,
    });
    const unique = [...new Map(cards.map((card) => [card.customerId, card])).values()];
    return this.formatCustomerRows(
      '疗程续购候选客户（活跃卡剩余 1-2 次，或 30 天内到期；仅生成候选，不自动触达）',
      unique.slice(0, 10),
      (card) =>
        `${card.customer.name}：${card.cardName} 剩余 ${card.remainingTimes}/${card.totalTimes} 次，有效期至 ${card.expiryDate.toISOString().slice(0, 10)}，累计消费 ${formatBrainMoney(toBrainNumber(card.customer.totalSpent))}${this.lastVisitText(card.customer.lastVisitDate)}`,
      unique.length,
    );
  }

  async getNewCustomerSourceDistribution(input: {
    storeId: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<BrainNewCustomerSourceDistribution> {
    const endDate = input.endDate ? new Date(input.endDate) : new Date();
    const startDate = input.startDate ? new Date(input.startDate) : new Date(endDate);
    if (!input.startDate) startDate.setDate(startDate.getDate() - 90);
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, source: true },
    });

    const byWeek = new Map<string, number>();
    const bySource = new Map<string, number>();
    for (const customer of customers) {
      const weekLabel = this.weekLabel(customer.createdAt);
      byWeek.set(weekLabel, (byWeek.get(weekLabel) ?? 0) + 1);
      const source = this.customerSourceLabel(customer.source);
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }

    const sourceRanking = Array.from(bySource.entries())
      .map(([source, count]) => ({
        source,
        count,
        share: customers.length > 0 ? count / customers.length : 0,
      }))
      .sort((left, right) => {
        const countDiff = right.count - left.count;
        if (countDiff !== 0) return countDiff;
        if (left.source === '未记录渠道' && right.source !== '未记录渠道') return 1;
        if (right.source === '未记录渠道' && left.source !== '未记录渠道') return -1;
        return left.source.localeCompare(right.source, 'zh-CN');
      });
    const weeklyRanking = Array.from(byWeek.entries())
      .map(([week, count]) => ({ week, count }))
      .sort((left, right) => right.count - left.count || left.week.localeCompare(right.week, 'zh-CN'));

    return {
      total: customers.length,
      missingSourceCount: bySource.get('未记录渠道') ?? 0,
      sourceRanking,
      weeklyRanking,
    };
  }

  private async newCustomerSourceTrend(input: { storeId: number; startDate?: Date; endDate?: Date }) {
    const distribution = await this.getNewCustomerSourceDistribution(input);
    const byWeek = new Map(distribution.weeklyRanking.map((item) => [item.week, item.count]));
    const bySource = new Map(distribution.sourceRanking.map((item) => [item.source, item.count]));

    const weekLines = this.topCountLines(byWeek, '当前时间范围没有新客。');
    const sourceLines = this.topCountLines(bySource, '当前没有记录新客渠道。');
    return `当前时间范围新客共 ${distribution.total} 人，时间段与渠道分布：
时间段分布：
${weekLines}
渠道分布：
${sourceLines}`;
  }

  async summarizeCustomerSegments(input: { storeId: number; startDate?: Date; endDate?: Date }) {
    const sleepingBefore = new Date();
    sleepingBefore.setDate(sleepingBefore.getDate() - 60);
    const [total, vip, sleeping, newCustomers, highBalanceCards] = await Promise.all([
      this.prisma.customer.count({ where: { storeId: input.storeId, deletedAt: null } }),
      this.prisma.customer.count({
        where: {
          storeId: input.storeId,
          deletedAt: null,
          memberLevel: { notIn: ['无', '普通', '普通会员', ''] },
        },
      }),
      this.prisma.customer.count({
        where: {
          storeId: input.storeId,
          deletedAt: null,
          OR: [{ lastVisitDate: null }, { lastVisitDate: { lt: sleepingBefore } }],
        },
      }),
      this.prisma.customer.count({
        where: {
          storeId: input.storeId,
          deletedAt: null,
          ...(input.startDate && input.endDate ? { createdAt: { gte: input.startDate, lte: input.endDate } } : {}),
        },
      }),
      this.prisma.customerCard.findMany({
        where: {
          status: 'active',
          remainingTimes: { gt: 0 },
          customer: { storeId: input.storeId, deletedAt: null },
        },
        include: { customer: { select: { name: true } } },
        orderBy: [{ remainingTimes: 'desc' }],
        take: 5,
      }),
    ]);

    const cardLines = highBalanceCards.length
      ? highBalanceCards
          .map((card, index) => {
            const liability = toBrainNumber(card.remainingTimes) * toBrainNumber(card.recognizedUnitValue);
            return `${index + 1}. ${card.customer?.name ?? '客户'}：${card.cardName} 剩余 ${card.remainingTimes} 次，估算未履约 ${formatBrainMoney(liability)}。`;
          })
          .join('\n')
      : '1. 当前没有命中仍有剩余次数的活跃卡项。';

    return `客户分层摘要：
1. 客户总数 ${total} 人，VIP/高等级客户 ${vip} 人。
2. 近 60 天未到店或无到店记录客户 ${sleeping} 人。
3. 当前时间范围新增客户 ${newCustomers} 人。
4. 卡项余额关注名单：
${cardLines}`;
  }

  private async vipCustomers(storeId: number) {
    const { total, rows } = await this.getVipCustomerSummary(storeId);
    return this.formatCustomerRows(
      'VIP 客户名单',
      rows,
      (customer) =>
        `${customer.customerName}：${customer.memberLevel}，累计消费 ${formatBrainMoney(customer.totalSpent)}${this.lastVisitText(customer.lastVisitDate ? new Date(customer.lastVisitDate) : null)}`,
      total,
    );
  }

  private async inactiveCustomers(storeId: number, days = 60) {
    const { total, rows } = await this.getInactiveCustomerSummary(storeId, days);
    return this.formatCustomerRows(
      `${days} 天未到店客户名单`,
      rows,
      (customer) =>
        `${customer.customerName}：累计消费 ${formatBrainMoney(customer.totalSpent)}，到店 ${customer.visitCount} 次${this.lastVisitText(customer.lastVisitDate ? new Date(customer.lastVisitDate) : null)}`,
      total,
    );
  }

  private async marketingResponsiveCustomers(storeId: number) {
    const touches = await this.prisma.marketingAutomationTouch.findMany({
      where: {
        customer: { storeId, deletedAt: null },
        status: { in: ['clicked', 'converted', 'replied', 'reached'] },
      },
      include: { customer: { select: { name: true, memberLevel: true, totalSpent: true, lastVisitDate: true } } },
      orderBy: { touchedAt: 'desc' },
      take: 50,
    });
    const unique = [...new Map(touches.map((touch) => [touch.customerId, touch])).values()].slice(0, 10);
    return this.formatCustomerRows(
      '营销活动响应客户',
      unique,
      (touch) =>
        `${touch.customer.name}：触达状态 ${touch.status}，渠道 ${touch.channel ?? '未记录'}，累计消费 ${formatBrainMoney(toBrainNumber(touch.customer.totalSpent))}${this.lastVisitText(touch.customer.lastVisitDate)}`,
    );
  }

  private async cardWithoutReservationCustomers(storeId: number) {
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId,
        deletedAt: null,
        customerCards: { some: { status: 'active', remainingTimes: { gt: 0 } } },
        reservations: { none: { status: { in: ['pending', 'confirmed', 'scheduled', '待确认', '已确认'] } } },
      },
      include: { customerCards: { where: { status: 'active', remainingTimes: { gt: 0 } }, take: 3 } },
      orderBy: { totalSpent: 'desc' },
      take: 10,
    });
    return this.formatCustomerRows(
      '有卡但暂无预约客户',
      customers,
      (customer) =>
        `${customer.name}：${customer.customerCards.map((card) => `${card.cardName} 剩余 ${card.remainingTimes} 次`).join('；')}${this.lastVisitText(customer.lastVisitDate)}`,
    );
  }

  private async highValueCustomers(storeId: number) {
    const inactiveBefore = new Date();
    inactiveBefore.setDate(inactiveBefore.getDate() - 30);
    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null, totalSpent: { gt: 0 } },
      orderBy: [{ totalSpent: 'desc' }],
      select: { name: true, memberLevel: true, totalSpent: true, visitCount: true, lastVisitDate: true },
      take: 10,
    });
    const rows = customers.map((customer) => ({
      ...customer,
      inactive: !customer.lastVisitDate || customer.lastVisitDate < inactiveBefore,
    }));
    return this.formatCustomerRows(
      '高价值客户分层',
      rows,
      (customer) =>
        `${customer.name}：${customer.memberLevel}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}，到店 ${customer.visitCount} 次${customer.inactive ? '，近 30 天未到店' : ''}`,
    );
  }

  private async highValueInactiveCustomers(storeId: number) {
    const inactiveBefore = new Date();
    inactiveBefore.setHours(0, 0, 0, 0);
    inactiveBefore.setDate(inactiveBefore.getDate() - 30);
    const where = {
      storeId,
      deletedAt: null,
      totalSpent: { gte: 5000 },
      OR: [{ lastVisitDate: null }, { lastVisitDate: { lt: inactiveBefore } }],
    };
    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: [{ totalSpent: 'desc' }],
        select: { name: true, memberLevel: true, totalSpent: true, visitCount: true, lastVisitDate: true },
        take: 10,
      }),
    ]);
    return this.formatCustomerRows(
      '高价值低活跃客户（统一口径：累计消费不少于 5000 元，且近 30 天未到店）',
      customers,
      (customer) =>
        `${customer.name}：${customer.memberLevel}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}，到店 ${customer.visitCount} 次${this.lastVisitText(customer.lastVisitDate)}`,
      total,
    );
  }

  private async decliningCustomerConsumption(storeId: number, mode: 'frequency' | 'amount') {
    const currentEnd = new Date();
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() - 30);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 30);
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId,
        customerId: { not: null },
        createdAt: { gte: previousStart, lt: currentEnd },
        status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
      },
      select: {
        customerId: true,
        createdAt: true,
        netAmount: true,
        customer: { select: { name: true, memberLevel: true, totalSpent: true, lastVisitDate: true } },
      },
      take: 5000,
    });
    const grouped = new Map<
      number,
      {
        name: string;
        memberLevel: string;
        totalSpent: number;
        lastVisitDate: Date | null;
        currentCount: number;
        previousCount: number;
        currentAmount: number;
        previousAmount: number;
      }
    >();
    for (const order of orders) {
      if (!order.customerId || !order.customer) continue;
      const row = grouped.get(order.customerId) ?? {
        name: order.customer.name,
        memberLevel: order.customer.memberLevel,
        totalSpent: toBrainNumber(order.customer.totalSpent),
        lastVisitDate: order.customer.lastVisitDate,
        currentCount: 0,
        previousCount: 0,
        currentAmount: 0,
        previousAmount: 0,
      };
      const amount = toBrainNumber(order.netAmount);
      if (order.createdAt >= currentStart) {
        row.currentCount += 1;
        row.currentAmount += amount;
      } else {
        row.previousCount += 1;
        row.previousAmount += amount;
      }
      grouped.set(order.customerId, row);
    }
    const rows = [...grouped.values()]
      .map((row) => {
        const previous = mode === 'frequency' ? row.previousCount : row.previousAmount;
        const current = mode === 'frequency' ? row.currentCount : row.currentAmount;
        return { ...row, declineRate: previous > 0 ? (previous - current) / previous : 0 };
      })
      .filter((row) =>
        mode === 'frequency'
          ? row.previousCount >= 2 && row.currentCount < row.previousCount && row.declineRate >= 0.3
          : row.previousAmount > 0 && row.currentAmount < row.previousAmount && row.declineRate >= 0.3,
      )
      .sort((left, right) => right.declineRate - left.declineRate || right.previousAmount - left.previousAmount);
    const visible = rows.slice(0, 10);
    const title =
      mode === 'frequency'
        ? '消费频率下降客户（统一口径：近 30 天对比前 30 天，订单次数下降 30% 以上，且前期至少 2 单）'
        : '消费金额下降客户（统一口径：近 30 天对比前 30 天，实付金额下降 30% 以上）';
    return this.formatCustomerRows(
      title,
      visible,
      (customer) =>
        mode === 'frequency'
          ? `${customer.name}：前期 ${customer.previousCount} 单，近期 ${customer.currentCount} 单，下降 ${(customer.declineRate * 100).toFixed(1)}%${this.lastVisitText(customer.lastVisitDate)}`
          : `${customer.name}：前期 ${formatBrainMoney(customer.previousAmount)}，近期 ${formatBrainMoney(customer.currentAmount)}，下降 ${(customer.declineRate * 100).toFixed(1)}%${this.lastVisitText(customer.lastVisitDate)}`,
      rows.length,
    );
  }

  private async lowRemainingCardCustomers(storeId: number) {
    const cards = await this.prisma.customerCard.findMany({
      where: {
        status: 'active',
        remainingTimes: { gt: 0, lte: 2 },
        customer: { storeId, deletedAt: null },
      },
      include: { customer: { select: { name: true } } },
      orderBy: [{ remainingTimes: 'asc' }],
      take: 10,
    });
    return this.formatCustomerRows(
      '卡次数快用完客户名单',
      cards,
      (card) =>
        `${card.customer?.name ?? '客户'}：${card.cardName} 剩余 ${card.remainingTimes} 次，估算未履约 ${formatBrainMoney(toBrainNumber(card.remainingTimes) * toBrainNumber(card.recognizedUnitValue))}`,
    );
  }

  private async oneTimeCustomers(storeId: number) {
    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null, visitCount: { lte: 1 } },
      orderBy: [{ totalSpent: 'desc' }],
      select: { name: true, source: true, totalSpent: true, lastVisitDate: true },
      take: 10,
    });
    return this.formatCustomerRows(
      '一次到店客户名单',
      customers,
      (customer) =>
        `${customer.name}：来源 ${customer.source ?? '未记录'}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}${this.lastVisitText(customer.lastVisitDate)}`,
    );
  }

  private async newCustomerLongTermPotential(storeId: number) {
    const run = await this.prisma.predictionRun.findFirst({
      where: { storeId, status: 'completed' },
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, modelVersion: true, businessDate: true, finishedAt: true },
    });
    if (!run) {
      return '当前门店没有已完成的客户预测批次，无法识别新客长期转化潜力。Ami Brain 不会用一次到店名单或累计消费替代预测结果。';
    }
    const asOf = run.businessDate ?? run.finishedAt ?? new Date();
    const newCustomerStart = new Date(asOf.getTime() - 90 * 86_400_000);
    const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
      where: {
        storeId,
        runId: run.id,
        repurchase30dScore: { gte: 70 },
        customer: {
          deletedAt: null,
          createdAt: { gte: newCustomerStart, lte: asOf },
          visitCount: { lte: 2 },
        },
      },
      select: {
        repurchase30dScore: true,
        marketingResponseScore: true,
        ltv6m: true,
        ltvTier: true,
        customer: {
          select: {
            name: true,
            createdAt: true,
            visitCount: true,
            totalSpent: true,
            lastVisitDate: true,
          },
        },
      },
      orderBy: [{ repurchase30dScore: 'desc' }, { ltv6m: 'desc' }],
      take: 100,
    });
    const visible = snapshots.slice(0, 10);
    const lines = visible.length
      ? visible
          .map(
            (snapshot, index) =>
              `${index + 1}. ${snapshot.customer.name}：近 90 天建档、到店 ${snapshot.customer.visitCount} 次，30 天复购评分 ${snapshot.repurchase30dScore}，6 个月预期价值 ${formatBrainMoney(toBrainNumber(snapshot.ltv6m))}（${snapshot.ltvTier}），营销响应评分 ${snapshot.marketingResponseScore}${this.lastVisitText(snapshot.customer.lastVisitDate)}`,
          )
          .join('\n')
      : '1. 当前没有命中新客潜力候选。';
    return `新客长期转化潜力候选：共 ${snapshots.length} 人，展示前 ${visible.length} 人。口径为最新预测批次中近 90 天建档、当前到店不超过 2 次且 30 天复购评分不低于 70 分。\n${lines}\n说明：这是 ${run.modelVersion} 在 ${asOf.toISOString().slice(0, 10)} 生成的预测候选，不是客户一定会转为长期客户；需要结合实时沟通结果复核。`;
  }

  private async projectInterestWithoutActiveCard(storeId: number) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 90 * 86_400_000);
    const events = await this.prisma.customerAppEvent.findMany({
      where: {
        storeId,
        customerId: { not: null },
        targetType: 'project',
        targetId: { not: null },
        eventType: { in: ['h5_view_project', 'h5_click_book', 'miniapp_reservation_success', 'promotion_reserved'] },
        occurredAt: { gte: startDate, lte: endDate },
      },
      select: {
        customerId: true,
        eventType: true,
        targetId: true,
        occurredAt: true,
        customer: {
          select: {
            name: true,
            totalSpent: true,
            customerCards: {
              where: { status: 'active' },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 10_000,
    });
    const scoreByEvent: Record<string, number> = {
      h5_view_project: 1,
      h5_click_book: 3,
      miniapp_reservation_success: 4,
      promotion_reserved: 3,
    };
    const signalByEvent: Record<string, string> = {
      h5_view_project: '浏览项目',
      h5_click_book: '点击预约',
      miniapp_reservation_success: '预约成功',
      promotion_reserved: '活动预约',
    };
    const grouped = new Map<
      string,
      {
        customerName: string;
        customerId: number;
        projectId: number;
        score: number;
        latestAt: Date;
        signals: Set<string>;
        totalSpent: number;
      }
    >();
    for (const event of events) {
      if (!event.customerId || !event.customer || event.customer.customerCards.length > 0) continue;
      const projectId = Number(event.targetId);
      if (!Number.isInteger(projectId) || projectId <= 0) continue;
      const key = `${event.customerId}:${projectId}`;
      const current = grouped.get(key) ?? {
        customerName: event.customer.name,
        customerId: event.customerId,
        projectId,
        score: 0,
        latestAt: event.occurredAt,
        signals: new Set<string>(),
        totalSpent: toBrainNumber(event.customer.totalSpent),
      };
      current.score += scoreByEvent[event.eventType] ?? 0;
      current.signals.add(signalByEvent[event.eventType] ?? event.eventType);
      if (event.occurredAt > current.latestAt) current.latestAt = event.occurredAt;
      grouped.set(key, current);
    }
    const candidates = [...grouped.values()].filter((item) => item.score >= 3);
    const projectIds = [...new Set(candidates.map((item) => item.projectId))];
    const projects = projectIds.length
      ? await this.prisma.project.findMany({
          where: { storeId, id: { in: projectIds }, deletedAt: null },
          select: { id: true, name: true },
        })
      : [];
    const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
    const rows = candidates
      .filter((item) => projectNameById.has(item.projectId))
      .sort((left, right) => right.score - left.score || right.latestAt.getTime() - left.latestAt.getTime())
      .slice(0, 10);
    const lines = rows.length
      ? rows
          .map(
            (row, index) =>
              `${index + 1}. ${row.customerName}：${projectNameById.get(row.projectId)}，信号 ${[...row.signals].join('、')}，兴趣分 ${row.score}，最近信号 ${row.latestAt.toISOString().slice(0, 10)}，当前无活跃卡`,
          )
          .join('\n')
      : '1. 当前没有命中客户。';
    return `项目兴趣但未办卡候选：共 ${candidates.filter((item) => projectNameById.has(item.projectId)).length} 人次，展示前 ${rows.length} 人次。\n${lines}\n说明：只使用最近 90 天已绑定客户的 Ami Glow 项目浏览、点击预约、预约成功和活动预约行为；严格排除已有任何活跃卡的客户。行为信号表示运营候选，不等同于客户已明确承诺购买。`;
  }

  private async upcomingBirthdayCustomers(storeId: number) {
    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null, birthday: { not: null } },
      select: { name: true, birthday: true, memberLevel: true, totalSpent: true },
      take: 500,
    });
    const now = new Date();
    const currentMonth = now.getMonth();
    const rows = customers
      .filter((customer) => customer.birthday && customer.birthday.getMonth() === currentMonth)
      .sort((left, right) => (left.birthday?.getDate() ?? 0) - (right.birthday?.getDate() ?? 0))
      .slice(0, 10);
    return this.formatCustomerRows(
      '本月生日客户名单',
      rows,
      (customer) =>
        `${customer.name}：生日 ${customer.birthday?.toISOString().slice(5, 10)}，${customer.memberLevel}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}`,
    );
  }

  private formatCustomerRows<T>(title: string, rows: T[], formatter: (row: T) => string, total = rows.length) {
    const lines =
      rows.length > 0
        ? rows.map((row, index) => `${index + 1}. ${formatter(row)}`).join('\n')
        : '1. 当前没有命中客户。';
    const coverage = total > rows.length ? `共 ${total} 人，展示前 ${rows.length} 人` : `共 ${total} 人`;
    return `${title}：${coverage}。\n${lines}`;
  }

  private lastVisitText(value?: Date | null) {
    return value ? `，最近到店 ${value.toISOString().slice(0, 10)}` : '，最近到店未记录';
  }

  private weekLabel(value: Date) {
    const start = new Date(value);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    return `${start.toISOString().slice(0, 10)} 周`;
  }

  private topCountLines(counts: Map<string, number>, emptyText: string) {
    const rows = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
      .slice(0, 5);
    return rows.length
      ? rows.map(([label, count], index) => `${index + 1}. ${label}：${count} 人`).join('\n')
      : `1. ${emptyText}`;
  }

  private customerSourceLabel(value?: string | null) {
    const source = value?.trim();
    if (!source) return '未记录渠道';
    const labels: Record<string, string> = {
      ami_glow: 'Ami Glow',
      ami_glow_h5: 'Ami Glow H5',
      ami_aura_lite: 'Ami Aura Lite',
      codex_acceptance: '验收测试',
      manual: '门店手工建档',
      referral: '客户推荐',
      recommendation: '客户推荐',
    };
    return labels[source.toLowerCase()] ?? source;
  }

  private resolveCustomerAge(age: number | null | undefined, birthday: Date | null | undefined, asOf: Date) {
    if (Number.isInteger(age) && age! > 0 && age! < 120) return age!;
    if (!birthday) return null;
    let calculated = asOf.getFullYear() - birthday.getFullYear();
    const month = asOf.getMonth() - birthday.getMonth();
    if (month < 0 || (month === 0 && asOf.getDate() < birthday.getDate())) calculated -= 1;
    return calculated > 0 && calculated < 120 ? calculated : null;
  }

  private customerAgeGroup(age: number) {
    if (age <= 24) return '24岁及以下';
    if (age <= 34) return '25-34岁';
    if (age <= 44) return '35-44岁';
    if (age <= 54) return '45-54岁';
    return '55岁及以上';
  }

  private extractCustomerName(message: string) {
    const patterns = [
      /(?:查一下|看一下|找一下|搜一下)(?:客户|顾客|客人|会员)?([\u4e00-\u9fa5·]{2,4})(?=的|，|,|。|$)/u,
      /(?:查一下|看一下|找一下|搜一下|叫)([\u4e00-\u9fa5]{2,4})/,
      /^([\u4e00-\u9fa5]{2,4})(?:上次|有没有|之前|的)/,
    ];
    for (const pattern of patterns) {
      const value = message.match(pattern)?.[1];
      if (value && !/(这个|那个|客人|客户|今天|预约)/.test(value)) return value;
    }
    return undefined;
  }

  private maskPhone(phone?: string | null) {
    const value = String(phone ?? '').replace(/\s+/g, '');
    if (value.length < 4) return '未记录';
    return `***${value.slice(-4)}`;
  }
}
