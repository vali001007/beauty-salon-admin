import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginatedResponse } from '../common/dto/pagination.dto.js';
import {
  type CreateCustomerFeedbackDto,
  type CustomerFeedbackAnalyticsQueryDto,
  type QueryCustomerFeedbackDto,
  type UpdateCustomerFeedbackDto,
} from './dto/customer-feedback.dto.js';

const DEFAULT_ANALYTICS_DAYS = 30;
const OPEN_STATUSES = ['open', 'in_progress'];

@Injectable()
export class CustomerFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: number, query: QueryCustomerFeedbackDto) {
    this.assertStoreId(storeId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.CustomerServiceFeedbackWhereInput = {
      storeId,
      ...(query.feedbackType ? { feedbackType: query.feedbackType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.beauticianId ? { beauticianId: query.beauticianId } : {}),
      ...(query.ratingMax ? { rating: { lte: query.ratingMax } } : {}),
      ...this.rangeWhere(query),
      ...(query.keyword?.trim()
        ? {
            OR: [
              { content: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { category: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { resolutionNote: { contains: query.keyword.trim(), mode: 'insensitive' } },
              { customer: { name: { contains: query.keyword.trim(), mode: 'insensitive' } } },
              { customer: { phone: { contains: query.keyword.trim() } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customerServiceFeedback.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerServiceFeedback.count({ where }),
    ]);
    const names = await this.loadReferenceNames(storeId, items);
    return new PaginatedResponse(
      items.map((item) => this.toView(item, names)),
      total,
      page,
      pageSize,
    );
  }

  async analytics(storeId: number, query: CustomerFeedbackAnalyticsQueryDto = {}) {
    this.assertStoreId(storeId);
    const range = this.analyticsRange(query);
    const feedback = await this.prisma.customerServiceFeedback.findMany({
      where: { storeId, occurredAt: { gte: range.startDate, lte: range.endDate } },
      select: {
        id: true,
        feedbackType: true,
        rating: true,
        status: true,
        beauticianId: true,
        serviceTaskId: true,
      },
      take: 20_000,
    });
    const completedServiceTasks = await this.prisma.serviceTask.count({
      where: {
        storeId,
        status: 'completed',
        completedAt: { gte: range.startDate, lte: range.endDate },
      },
    });
    const rated = feedback.filter((item) => item.rating !== null);
    const ratingTotal = rated.reduce((sum, item) => sum + Number(item.rating), 0);
    const complaint = feedback.filter((item) => item.feedbackType === 'complaint');
    const linkedServiceTaskCount = new Set(
      feedback.map((item) => item.serviceTaskId).filter((value): value is number => Boolean(value)),
    ).size;
    const byStaff = new Map<number, {
      feedbackCount: number;
      complaintCount: number;
      unresolvedComplaintCount: number;
      lowRatingCount: number;
      ratingTotal: number;
      ratedFeedbackCount: number;
    }>();
    for (const item of feedback) {
      if (!item.beauticianId) continue;
      const row = byStaff.get(item.beauticianId) ?? {
        feedbackCount: 0,
        complaintCount: 0,
        unresolvedComplaintCount: 0,
        lowRatingCount: 0,
        ratingTotal: 0,
        ratedFeedbackCount: 0,
      };
      row.feedbackCount += 1;
      if (item.feedbackType === 'complaint') {
        row.complaintCount += 1;
        if (OPEN_STATUSES.includes(item.status)) row.unresolvedComplaintCount += 1;
      }
      if (item.rating !== null) {
        row.ratingTotal += item.rating;
        row.ratedFeedbackCount += 1;
        if (item.rating <= 2) row.lowRatingCount += 1;
      }
      byStaff.set(item.beauticianId, row);
    }
    const beauticians = byStaff.size
      ? await this.prisma.beautician.findMany({
          where: { storeId, id: { in: [...byStaff.keys()] } },
          select: { id: true, name: true },
        })
      : [];
    const beauticianNames = new Map(beauticians.map((item) => [item.id, item.name]));
    return {
      range: { startDate: range.startDate, endDate: range.endDate },
      summary: {
        feedbackCount: feedback.length,
        complaintCount: complaint.length,
        unresolvedComplaintCount: complaint.filter((item) => OPEN_STATUSES.includes(item.status)).length,
        ratedFeedbackCount: rated.length,
        ratingTotal,
        averageRating: rated.length
          ? ratingTotal / rated.length
          : null,
        lowRatingCount: rated.filter((item) => Number(item.rating) <= 2).length,
        completedServiceTaskCount: completedServiceTasks,
        linkedServiceTaskCount,
        collectionCoverageRate: completedServiceTasks > 0 ? linkedServiceTaskCount / completedServiceTasks : 0,
      },
      staff: [...byStaff.entries()]
        .map(([beauticianId, row]) => ({
          beauticianId,
          beauticianName: beauticianNames.get(beauticianId) ?? `员工#${beauticianId}`,
          feedbackCount: row.feedbackCount,
          complaintCount: row.complaintCount,
          unresolvedComplaintCount: row.unresolvedComplaintCount,
          lowRatingCount: row.lowRatingCount,
          ratedFeedbackCount: row.ratedFeedbackCount,
          averageRating: row.ratedFeedbackCount > 0 ? row.ratingTotal / row.ratedFeedbackCount : null,
        }))
        .sort((left, right) =>
          right.complaintCount - left.complaintCount ||
          right.unresolvedComplaintCount - left.unresolvedComplaintCount ||
          left.beauticianName.localeCompare(right.beauticianName, 'zh-Hans-CN'),
        ),
    };
  }

  async create(storeId: number, userId: number | undefined, dto: CreateCustomerFeedbackDto) {
    this.assertStoreId(storeId);
    await this.assertBusinessReferences(storeId, dto);
    const item = await this.prisma.customerServiceFeedback.create({
      data: {
        storeId,
        customerId: dto.customerId,
        serviceTaskId: dto.serviceTaskId,
        reservationId: dto.reservationId,
        orderId: dto.orderId,
        beauticianId: dto.beauticianId,
        projectId: dto.projectId,
        feedbackType: dto.feedbackType,
        rating: dto.rating,
        category: dto.category?.trim() || undefined,
        severity: dto.severity ?? 'normal',
        content: dto.content?.trim() || undefined,
        sourceChannel: dto.sourceChannel?.trim() || 'manual',
        assignedUserId: dto.assignedUserId,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        createdBy: userId,
      },
    });
    return this.findOne(storeId, item.id);
  }

  async update(storeId: number, id: number, userId: number | undefined, dto: UpdateCustomerFeedbackDto) {
    this.assertStoreId(storeId);
    const existing = await this.prisma.customerServiceFeedback.findFirst({ where: { id, storeId } });
    if (!existing) throw new NotFoundException('客户反馈不存在');
    const status = dto.status ?? existing.status;
    const now = new Date();
    await this.prisma.customerServiceFeedback.update({
      where: { id },
      data: {
        status,
        severity: dto.severity,
        assignedUserId: dto.assignedUserId,
        resolutionNote: dto.resolutionNote?.trim(),
        handledByUserId: userId,
        ...(status === 'in_progress' && !existing.handledAt ? { handledAt: now } : {}),
        ...(status === 'resolved' || status === 'closed' ? { resolvedAt: now, handledAt: existing.handledAt ?? now } : {}),
      },
    });
    return this.findOne(storeId, id);
  }

  async findOne(storeId: number, id: number) {
    this.assertStoreId(storeId);
    const item = await this.prisma.customerServiceFeedback.findFirst({
      where: { id, storeId },
      include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
    });
    if (!item) throw new NotFoundException('客户反馈不存在');
    return this.toView(item, await this.loadReferenceNames(storeId, [item]));
  }

  private async assertBusinessReferences(storeId: number, dto: CreateCustomerFeedbackDto) {
    const checks: Array<Promise<unknown>> = [];
    const labels: string[] = [];
    if (dto.customerId) {
      checks.push(this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId }, select: { id: true } }));
      labels.push('客户');
    }
    if (dto.serviceTaskId) {
      checks.push(this.prisma.serviceTask.findFirst({ where: { id: dto.serviceTaskId, storeId }, select: { id: true } }));
      labels.push('服务任务');
    }
    if (dto.reservationId) {
      checks.push(this.prisma.reservation.findFirst({ where: { id: dto.reservationId, storeId }, select: { id: true } }));
      labels.push('预约');
    }
    if (dto.orderId) {
      checks.push(this.prisma.productOrder.findFirst({ where: { id: dto.orderId, storeId }, select: { id: true } }));
      labels.push('订单');
    }
    if (dto.beauticianId) {
      checks.push(this.prisma.beautician.findFirst({ where: { id: dto.beauticianId, storeId }, select: { id: true } }));
      labels.push('美容师');
    }
    if (dto.projectId) {
      checks.push(this.prisma.project.findFirst({ where: { id: dto.projectId, storeId }, select: { id: true } }));
      labels.push('项目');
    }
    const results = await Promise.all(checks);
    const missingIndex = results.findIndex((item) => !item);
    if (missingIndex >= 0) throw new BadRequestException(`${labels[missingIndex]}不存在或不属于当前门店`);
  }

  private async loadReferenceNames(
    storeId: number,
    items: Array<{ beauticianId: number | null; projectId: number | null }>,
  ) {
    const beauticianIds = [...new Set(items.map((item) => item.beauticianId).filter((id): id is number => Boolean(id)))];
    const projectIds = [...new Set(items.map((item) => item.projectId).filter((id): id is number => Boolean(id)))];
    const [beauticians, projects] = await Promise.all([
      beauticianIds.length
        ? this.prisma.beautician.findMany({
            where: { storeId, id: { in: beauticianIds } },
            select: { id: true, name: true },
          })
        : [],
      projectIds.length
        ? this.prisma.project.findMany({
            where: { storeId, id: { in: projectIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    return {
      beauticians: new Map(beauticians.map((item) => [item.id, item.name])),
      projects: new Map(projects.map((item) => [item.id, item.name])),
    };
  }

  private toView(item: any, names: { beauticians: Map<number, string>; projects: Map<number, string> }) {
    return {
      ...item,
      beauticianName: item.beauticianId ? names.beauticians.get(item.beauticianId) ?? `员工#${item.beauticianId}` : null,
      projectName: item.projectId ? names.projects.get(item.projectId) ?? `项目#${item.projectId}` : null,
      customerName: item.customer?.name ?? null,
      customerPhone: item.customer?.phone ?? null,
      customerMemberLevel: item.customer?.memberLevel ?? null,
      customer: undefined,
    };
  }

  private rangeWhere(query: { startDate?: string; endDate?: string }): Prisma.CustomerServiceFeedbackWhereInput {
    if (!query.startDate && !query.endDate) return {};
    return {
      occurredAt: {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      },
    };
  }

  private analyticsRange(query: CustomerFeedbackAnalyticsQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate ? new Date(query.startDate) : new Date(endDate);
    if (!query.startDate) startDate.setDate(startDate.getDate() - DEFAULT_ANALYTICS_DAYS);
    if (startDate > endDate) throw new BadRequestException('开始时间不能晚于结束时间');
    return { startDate, endDate };
  }

  private assertStoreId(storeId: number) {
    if (!Number.isInteger(storeId) || storeId < 1) throw new BadRequestException('缺少有效门店上下文');
  }
}
