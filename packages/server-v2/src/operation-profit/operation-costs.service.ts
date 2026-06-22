import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CopyOperationCostsDto,
  CreateOperationCostDto,
  OPERATION_COST_CATEGORIES,
  QueryOperationCostsDto,
  UpdateOperationCostDto,
} from './dto.js';

@Injectable()
export class OperationCostsService {
  constructor(private prisma: PrismaService) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private asStoreId(storeId?: number | string) {
    const normalized = Number(storeId);
    if (!Number.isFinite(normalized) || normalized <= 0) throw new BadRequestException('缺少门店 ID');
    return normalized;
  }

  private validatePeriodMonth(periodMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(periodMonth)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const month = Number(periodMonth.slice(5, 7));
    if (month < 1 || month > 12) throw new BadRequestException('月份格式应为 YYYY-MM');
  }

  private dateInPeriod(costDate: Date, periodMonth: string) {
    return `${costDate.getFullYear()}-${String(costDate.getMonth() + 1).padStart(2, '0')}` === periodMonth;
  }

  private normalizeCostDate(value: string, periodMonth: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('成本日期无效');
    if (!this.dateInPeriod(date, periodMonth)) throw new BadRequestException('成本日期必须落在所选月份内');
    return date;
  }

  private normalizeCategory(category: string) {
    if (!OPERATION_COST_CATEGORIES.includes(category as any)) throw new BadRequestException('成本分类无效');
    return category;
  }

  private serialize(cost: any) {
    if (!cost) return cost;
    return {
      ...cost,
      amount: this.toNumber(cost.amount),
      storeName: cost.store?.name,
      creatorName: cost.creator?.name,
    };
  }

  async findAll(query: QueryOperationCostsDto, headerStoreId?: string) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 50);
    const storeId = this.asStoreId(query.storeId ?? headerStoreId);
    const where: any = { storeId };
    if (query.periodMonth) {
      this.validatePeriodMonth(query.periodMonth);
      where.periodMonth = query.periodMonth;
    }
    if (query.category) where.category = this.normalizeCategory(query.category);

    const [items, total] = await Promise.all([
      this.prisma.operatingCost.findMany({
        where,
        include: {
          store: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true, username: true } },
        },
        orderBy: [{ costDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.operatingCost.count({ where }),
    ]);

    const mapped = items.map((item) => this.serialize(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async create(dto: CreateOperationCostDto, headerStoreId?: string, userId?: number) {
    const storeId = this.asStoreId(dto.storeId ?? headerStoreId);
    this.validatePeriodMonth(dto.periodMonth);
    const costDate = this.normalizeCostDate(dto.costDate, dto.periodMonth);
    const amount = this.toNumber(dto.amount);
    if (amount < 0) throw new BadRequestException('成本金额不能小于 0');

    const cost = await this.prisma.operatingCost.create({
      data: {
        storeId,
        periodMonth: dto.periodMonth,
        costDate,
        category: this.normalizeCategory(dto.category),
        amount,
        allocationType: dto.allocationType || 'store_month',
        relatedCampaignId: dto.relatedCampaignId,
        relatedEmployeeId: dto.relatedEmployeeId,
        remark: dto.remark,
        createdBy: userId,
      },
      include: {
        store: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true, username: true } },
      },
    });
    return this.serialize(cost);
  }

  async update(id: number, dto: UpdateOperationCostDto) {
    const current = await this.prisma.operatingCost.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('经营成本不存在');

    const periodMonth = dto.periodMonth ?? current.periodMonth;
    this.validatePeriodMonth(periodMonth);
    const costDate = dto.costDate ? this.normalizeCostDate(dto.costDate, periodMonth) : current.costDate;
    if (!this.dateInPeriod(costDate, periodMonth)) throw new BadRequestException('成本日期必须落在所选月份内');
    const amount = dto.amount === undefined ? undefined : this.toNumber(dto.amount);
    if (amount !== undefined && amount < 0) throw new BadRequestException('成本金额不能小于 0');

    const cost = await this.prisma.operatingCost.update({
      where: { id },
      data: {
        periodMonth,
        costDate,
        category: dto.category ? this.normalizeCategory(dto.category) : undefined,
        amount,
        allocationType: dto.allocationType,
        relatedCampaignId: dto.relatedCampaignId,
        relatedEmployeeId: dto.relatedEmployeeId,
        remark: dto.remark,
      },
      include: {
        store: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true, username: true } },
      },
    });
    return this.serialize(cost);
  }

  async remove(id: number) {
    const current = await this.prisma.operatingCost.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('经营成本不存在');
    await this.prisma.operatingCost.delete({ where: { id } });
    return { success: true };
  }

  async copyFromPreviousMonth(dto: CopyOperationCostsDto, headerStoreId?: string, userId?: number) {
    const storeId = this.asStoreId(dto.storeId ?? headerStoreId);
    this.validatePeriodMonth(dto.fromPeriodMonth);
    this.validatePeriodMonth(dto.toPeriodMonth);
    if (dto.fromPeriodMonth === dto.toPeriodMonth) throw new BadRequestException('来源月份和目标月份不能相同');

    const existed = await this.prisma.operatingCost.count({ where: { storeId, periodMonth: dto.toPeriodMonth } });
    if (existed > 0) throw new BadRequestException('目标月份已存在成本记录，请先清理或逐条编辑');

    const sourceItems = await this.prisma.operatingCost.findMany({
      where: { storeId, periodMonth: dto.fromPeriodMonth },
      orderBy: { id: 'asc' },
    });
    if (!sourceItems.length) return { items: [], data: [], total: 0, page: 1, pageSize: 100 };

    const targetDate = new Date(`${dto.toPeriodMonth}-01T00:00:00.000Z`);
    await this.prisma.operatingCost.createMany({
      data: sourceItems.map((item) => ({
        storeId,
        periodMonth: dto.toPeriodMonth,
        costDate: new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), Math.min(item.costDate.getUTCDate(), 28))),
        category: item.category,
        amount: item.amount,
        allocationType: item.allocationType,
        relatedCampaignId: item.relatedCampaignId,
        relatedEmployeeId: item.relatedEmployeeId,
        remark: item.remark ? `${item.remark}（复制自 ${dto.fromPeriodMonth}）` : `复制自 ${dto.fromPeriodMonth}`,
        createdBy: userId,
      })),
    });

    return this.findAll({ storeId, periodMonth: dto.toPeriodMonth, page: 1, pageSize: 100 }, undefined);
  }
}
