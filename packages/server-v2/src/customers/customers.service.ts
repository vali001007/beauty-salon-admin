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
    return {
      ...customer,
      storeName: customer.store?.name ?? customer.storeName ?? '',
      birthday: this.formatDate(customer.birthday),
      lastVisitDate: this.formatDate(customer.lastVisitDate),
      createdAt: this.formatDate(customer.createdAt),
      totalSpent: Number(customer.totalSpent ?? 0),
      height: customer.height == null ? undefined : Number(customer.height),
      weight: customer.weight == null ? undefined : Number(customer.weight),
      store: undefined,
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
      include: { store: true },
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
        include: { store: true },
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

  async importCustomers(customers: CreateCustomerDto[]) {
    return this.prisma.customer.createMany({ data: customers, skipDuplicates: true });
  }
}
