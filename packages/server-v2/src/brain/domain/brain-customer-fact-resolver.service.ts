import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatBrainMoney, toBrainNumber } from './brain-domain-formatters.js';

@Injectable()
export class BrainCustomerFactResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async answerExactCustomerQuestion(input: { storeId: number; message: string; permissions: string[] }) {
    const name = this.extractCustomerName(input.message);
    const phoneTail = input.message.match(/(?:尾号|手机尾号)[^0-9]*(\d{4})/)?.[1];
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
      },
      take: 5,
    });

    if (!customers.length) return '当前门店没有找到匹配客户，请核对姓名或手机号后四位。';
    if (customers.length > 1) {
      return `找到 ${customers.length} 位同名或尾号匹配客户：\n${customers
        .map((customer, index) => `${index + 1}. ${customer.name}，手机 ${this.maskPhone(customer.phone)}，${customer.memberLevel}`)
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
              .map((reservation) => `${reservation.date.toISOString().slice(0, 10)} ${reservation.startTime} ${reservation.project.name}（${reservation.status}）`)
              .join('；')}。`
          : '当前没有查到预约记录。',
      );
    }
    if (/消费|上次|项目|美容师|备注|不满|兴趣/.test(input.message)) {
      const latestReservation = customer.reservations[0];
      lines.push(
        latestReservation
          ? `最近服务：${latestReservation.project.name}，美容师 ${latestReservation.beautician?.name ?? '未指定'}，备注 ${latestReservation.remark || '无'}。`
          : '当前没有查到最近服务记录。',
      );
      if (customer.consumptionRecords.length) {
        lines.push(
          `最近消费：${customer.consumptionRecords
            .map((record) => `${record.consumeTime.toISOString().slice(0, 10)} ${record.consumeContent} ${formatBrainMoney(toBrainNumber(record.amount))}`)
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
    if (/(新客.*渠道|渠道.*新客|新客最多|时间段.*新客)/.test(message)) {
      return this.newCustomerSourceTrend(input.storeId);
    }
    if (/卡里.*次数|次数快用完|卡.*快用完/.test(message)) {
      return this.lowRemainingCardCustomers(input.storeId);
    }
    if (/生日|关怀/.test(message)) {
      return this.upcomingBirthdayCustomers(input.storeId);
    }
    if (/vip|高等级|重要客户/.test(message)) {
      return this.vipCustomers(input.storeId);
    }
    if (/高价值|消费很多|消费金额|分层/.test(message)) {
      return this.highValueCustomers(input.storeId);
    }
    if (/只来一次|一次就再没回来|潜力转成长期/.test(message)) {
      return this.oneTimeCustomers(input.storeId);
    }
    if (/好久没来|不活跃|沉睡|流失|消费频率.*下降|续购|疗程快结束|\d+天没来|三个月没来/.test(message)) {
      const days = message.includes('三个月') ? 90 : Number(message.match(/(\d+)天没来/)?.[1] ?? 60);
      return this.inactiveCustomers(input.storeId, days);
    }
    return this.summarizeCustomerSegments(input);
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
          OR: [
            { memberLevel: { notIn: ['无', '普通', '普通会员', ''] } },
            { totalSpent: { gte: 5000 } },
          ],
        },
      },
      include: {
        customer: { select: { name: true, memberLevel: true, totalSpent: true, lastVisitDate: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ startTime: 'asc' }],
      take: 10,
    });

    return this.formatCustomerRows('今日需关注的重要到店客户', reservations, (reservation) =>
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
      const current =
        grouped.get(order.customerId) ??
        {
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
      .filter((customer) => customer.discountOrderCount >= 2 || customer.discountOrderRate >= 0.5)
      .sort((left, right) => right.discountOrderRate - left.discountOrderRate || right.discountAmount - left.discountAmount)
      .slice(0, 10);

    return this.formatCustomerRows('优惠敏感客户候选名单', rows, (customer) =>
      `${customer.name}：近 180 天 ${customer.orderCount} 单中 ${customer.discountOrderCount} 单使用优惠，优惠订单占比 ${Math.round(
        customer.discountOrderRate * 100,
      )}%，累计优惠 ${formatBrainMoney(customer.discountAmount)}，累计消费 ${formatBrainMoney(customer.totalSpent)}${this.lastVisitText(
        customer.lastVisitDate,
      )}`,
    );
  }

  private async newCustomerSourceTrend(storeId: number) {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null, createdAt: { gte: start } },
      select: { createdAt: true, source: true },
      take: 1000,
    });

    const byWeek = new Map<string, number>();
    const bySource = new Map<string, number>();
    for (const customer of customers) {
      const weekLabel = this.weekLabel(customer.createdAt);
      byWeek.set(weekLabel, (byWeek.get(weekLabel) ?? 0) + 1);
      const source = customer.source?.trim() || '未记录渠道';
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }

    const weekLines = this.topCountLines(byWeek, '当前没有命中近 90 天新客。');
    const sourceLines = this.topCountLines(bySource, '当前没有记录新客渠道。');
    return `近 90 天新客时间段与渠道：
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
    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null, memberLevel: { notIn: ['无', '普通', '普通会员', ''] } },
      orderBy: [{ totalSpent: 'desc' }],
      select: { name: true, memberLevel: true, totalSpent: true, lastVisitDate: true },
      take: 10,
    });
    return this.formatCustomerRows('VIP 客户名单', customers, (customer) =>
      `${customer.name}：${customer.memberLevel}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}${this.lastVisitText(customer.lastVisitDate)}`,
    );
  }

  private async inactiveCustomers(storeId: number, days = 60) {
    const inactiveBefore = new Date();
    inactiveBefore.setDate(inactiveBefore.getDate() - days);
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId,
        deletedAt: null,
        OR: [{ lastVisitDate: null }, { lastVisitDate: { lt: inactiveBefore } }],
      },
      orderBy: [{ totalSpent: 'desc' }],
      select: { name: true, totalSpent: true, visitCount: true, lastVisitDate: true },
      take: 10,
    });
    return this.formatCustomerRows(`${days} 天未到店客户名单`, customers, (customer) =>
      `${customer.name}：累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}，到店 ${customer.visitCount} 次${this.lastVisitText(customer.lastVisitDate)}`,
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
    return this.formatCustomerRows('营销活动响应客户', unique, (touch) =>
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
    return this.formatCustomerRows('有卡但暂无预约客户', customers, (customer) =>
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
    return this.formatCustomerRows('高价值客户分层', rows, (customer) =>
      `${customer.name}：${customer.memberLevel}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}，到店 ${customer.visitCount} 次${customer.inactive ? '，近 30 天未到店' : ''}`,
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
    return this.formatCustomerRows('卡次数快用完客户名单', cards, (card) =>
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
    return this.formatCustomerRows('一次到店客户名单', customers, (customer) =>
      `${customer.name}：来源 ${customer.source ?? '未记录'}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}${this.lastVisitText(customer.lastVisitDate)}`,
    );
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
    return this.formatCustomerRows('本月生日客户名单', rows, (customer) =>
      `${customer.name}：生日 ${customer.birthday?.toISOString().slice(5, 10)}，${customer.memberLevel}，累计消费 ${formatBrainMoney(toBrainNumber(customer.totalSpent))}`,
    );
  }

  private formatCustomerRows<T>(title: string, rows: T[], formatter: (row: T) => string) {
    const lines = rows.length > 0 ? rows.map((row, index) => `${index + 1}. ${formatter(row)}`).join('\n') : '1. 当前没有命中客户。';
    return `${title}：\n${lines}`;
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
    return rows.length ? rows.map(([label, count], index) => `${index + 1}. ${label}：${count} 人`).join('\n') : `1. ${emptyText}`;
  }

  private extractCustomerName(message: string) {
    const patterns = [
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
