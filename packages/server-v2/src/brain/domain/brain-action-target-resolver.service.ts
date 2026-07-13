import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export type BrainTargetResolution<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; message: string };

@Injectable()
export class BrainActionTargetResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCustomer(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; name: string; maskedPhone: string }>> {
    const name = this.extractCustomerName(input.message);
    const phoneTail = input.message.match(/(?:尾号|手机尾号)[^0-9]*(\d{4})/)?.[1];
    if (!name && !phoneTail) {
      return { ok: false, reason: 'missing_customer', message: '请提供客户姓名或手机号后四位后再生成动作预览。' };
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
      select: { id: true, name: true, phone: true },
      take: 3,
    });
    if (!customers.length) return { ok: false, reason: 'customer_not_found', message: '当前门店没有找到匹配客户，请核对姓名或手机号后四位。' };
    if (customers.length > 1) {
      return { ok: false, reason: 'ambiguous_customer', message: '当前门店找到多位匹配客户，请补充手机号后四位后再继续。' };
    }
    return {
      ok: true,
      value: { id: customers[0].id, name: customers[0].name, maskedPhone: this.maskPhone(customers[0].phone) },
    };
  }

  async resolveProject(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; name: string; duration: number }>> {
    const projects = await this.prisma.project.findMany({
      where: { storeId: input.storeId, deletedAt: null, status: 'active' },
      select: { id: true, name: true, duration: true },
      take: 200,
    });
    const matches = projects.filter((project) => input.message.includes(project.name));
    if (!matches.length) return { ok: false, reason: 'missing_project', message: '请提供当前门店的具体项目名称后再生成预约预览。' };
    if (matches.length > 1) return { ok: false, reason: 'ambiguous_project', message: '问题中命中多个项目，请明确本次预约项目。' };
    return { ok: true, value: { id: matches[0].id, name: matches[0].name, duration: Number(matches[0].duration || 60) } };
  }

  async resolveReservation(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; customerId: number; customerName: string; projectName: string; appointmentTime: string }>> {
    const customer = await this.resolveCustomer(input);
    if (!customer.ok) return customer;
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId: input.storeId,
        customerId: customer.value.id,
        status: { notIn: ['cancelled', 'canceled', 'completed', '已取消', '已完成'] },
      },
      select: { id: true, date: true, startTime: true, status: true, project: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 5,
    });
    if (!reservations.length) return { ok: false, reason: 'reservation_not_found', message: `${customer.value.name}在当前门店没有可操作的预约。` };
    if (reservations.length > 1 && !/(下一次|最近|即将|明天|今天|后天)/.test(input.message)) {
      return { ok: false, reason: 'ambiguous_reservation', message: `${customer.value.name}有多条可操作预约，请补充原预约日期或时间。` };
    }
    const reservation = reservations[0];
    return {
      ok: true,
      value: {
        id: reservation.id,
        customerId: customer.value.id,
        customerName: customer.value.name,
        projectName: reservation.project.name,
        appointmentTime: `${reservation.date.toISOString().slice(0, 10)}T${reservation.startTime}:00`,
      },
    };
  }

  async resolveServiceTask(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; customerName: string; projectName: string }>> {
    const explicitId = Number(input.message.match(/(?:任务|服务单)[#号\s]*(\d+)/)?.[1]);
    if (explicitId > 0) {
      const task = await this.prisma.serviceTask.findFirst({
        where: { id: explicitId, storeId: input.storeId },
        select: { id: true, customer: { select: { name: true } }, project: { select: { name: true } } },
      });
      return task
        ? { ok: true, value: { id: task.id, customerName: task.customer.name, projectName: task.project.name } }
        : { ok: false, reason: 'service_task_not_found', message: '当前门店没有找到该服务任务。' };
    }
    const customer = await this.resolveCustomer(input);
    if (!customer.ok) return customer;
    const tasks = await this.prisma.serviceTask.findMany({
      where: { storeId: input.storeId, customerId: customer.value.id, status: { in: ['pending', 'in_progress'] } },
      select: { id: true, customer: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { appointmentTime: 'desc' },
      take: 2,
    });
    if (!tasks.length) return { ok: false, reason: 'service_task_not_found', message: `${customer.value.name}没有待完成的服务任务。` };
    if (tasks.length > 1) return { ok: false, reason: 'ambiguous_service_task', message: `${customer.value.name}有多条待完成服务，请补充服务单号。` };
    return { ok: true, value: { id: tasks[0].id, customerName: tasks[0].customer.name, projectName: tasks[0].project.name } };
  }

  resolveAppointmentTime(message: string, now = new Date()) {
    const clock = this.extractClock(message);
    if (!clock) return undefined;
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    if (message.includes('后天')) date.setDate(date.getDate() + 2);
    else if (message.includes('明天')) date.setDate(date.getDate() + 1);
    else {
      const monthDay = message.match(/(\d{1,2})月(\d{1,2})日?/);
      const isoDate = message.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (isoDate) date.setFullYear(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
      else if (monthDay) date.setMonth(Number(monthDay[1]) - 1, Number(monthDay[2]));
      else if (!message.includes('今天')) return undefined;
    }
    date.setHours(clock.hour, clock.minute, 0, 0);
    return date;
  }

  private extractClock(message: string) {
    const colon = message.match(/(?:^|[^0-9])(\d{1,2})[:：](\d{2})(?:[^0-9]|$)/);
    if (colon) return this.validClock(Number(colon[1]), Number(colon[2]));
    const chinese = message.match(/(上午|早上|下午|晚上)?\s*(\d{1,2})点(?:(半)|(\d{1,2})分?)?/);
    if (!chinese) return undefined;
    let hour = Number(chinese[2]);
    if ((chinese[1] === '下午' || chinese[1] === '晚上') && hour < 12) hour += 12;
    const minute = chinese[3] ? 30 : Number(chinese[4] ?? 0);
    return this.validClock(hour, minute);
  }

  private validClock(hour: number, minute: number) {
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : undefined;
  }

  private extractCustomerName(message: string) {
    const patterns = [
      /(?:给|为|帮我给|帮我为|查一下|找一下|叫)([\u4e00-\u9fa5]{2,5})(?=安排|创建|建立|改约|改期|取消|发|做|预约|，|,|\s|$)/,
      /客户(?:是|叫)?([\u4e00-\u9fa5]{2,5})(?=，|,|\s|$|的)/,
      /^([\u4e00-\u9fa5]{2,5})(?=的预约|改约|改期|取消预约|做)/,
    ];
    for (const pattern of patterns) {
      const value = message.match(pattern)?.[1];
      if (value && !/(这个|那个|客户|客人|今天|明天|预约)/.test(value)) return value;
    }
    return undefined;
  }

  private maskPhone(phone?: string | null) {
    const value = String(phone ?? '').replace(/\s+/g, '');
    return value.length >= 4 ? `***${value.slice(-4)}` : '未记录';
  }
}
