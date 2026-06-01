import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type BomItemInput = {
  productId?: number;
  productName?: string;
  sku?: string;
  standardQty?: number | string;
  unit?: string;
};

@Injectable()
export class BomService {
  constructor(private prisma: PrismaService) {}

  async listServices() {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null },
      include: { bomItems: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return projects.map((project) => this.toService(project));
  }

  async getServiceConsumption(projectId: number) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.deletedAt) {
      throw new NotFoundException('服务项目不存在');
    }
    const records = await this.getConsumptionRecords();
    return records.filter((record) => record.serviceName === project.name || record.consumeContent?.includes(project.name));
  }

  async getConsumptionRecords() {
    const records = await this.prisma.consumptionRecord.findMany({
      include: { customer: { include: { store: true } } },
      orderBy: { consumeTime: 'desc' },
      take: 200,
    });

    return records.map((record) => {
      const content = record.consumeContent || record.consumeType;
      const amount = Number(record.amount ?? 0);
      return {
        id: record.id,
        date: record.consumeTime.toISOString().slice(0, 10),
        serviceName: content,
        customerName: record.customer?.name ?? '散客',
        beautician: '未记录',
        storeName: record.customer?.store?.name ?? '默认门店',
        productName: content,
        standardQty: 1,
        actualQty: amount > 0 ? 1 : 0,
        deviation: 0,
        isAbnormal: false,
        consumeContent: content,
      };
    });
  }

  async getForecast() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { currentStock: 'asc' },
      take: 100,
    });

    return products.map((product) => {
      const currentStock = Number(product.currentStock ?? 0);
      const safetyStock = Number(product.safetyStock ?? 0);
      const forecastConsumption = Math.max(safetyStock, Math.ceil(currentStock * 0.2));
      return {
        productName: product.name,
        sku: product.sku,
        forecastConsumption,
        currentStock,
        shortage: Math.max(0, forecastConsumption - currentStock),
      };
    });
  }

  async createService(data: any) {
    const project = await this.prisma.project.create({
      data: {
        storeId: Number(data.storeId ?? 1),
        name: data.name,
        duration: Number(data.duration ?? 60),
        price: Number(data.price ?? 0),
        status: data.status ?? 'active',
      },
    });
    await this.replaceBomItems(project.id, data.bom ?? []);
    return this.getService(project.id);
  }

  async updateService(id: number, data: any) {
    await this.ensureProject(id);
    await this.prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.duration !== undefined ? { duration: Number(data.duration) } : {}),
        ...(data.price !== undefined ? { price: Number(data.price) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
    if (Array.isArray(data.bom)) {
      await this.replaceBomItems(id, data.bom);
    }
    return this.getService(id);
  }

  async deleteService(id: number) {
    await this.ensureProject(id);
    await this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  private async getService(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { bomItems: { include: { product: true } } },
    });
    if (!project || project.deletedAt) {
      throw new NotFoundException('服务项目不存在');
    }
    return this.toService(project);
  }

  private async ensureProject(id: number) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) {
      throw new NotFoundException('服务项目不存在');
    }
    return project;
  }

  private async replaceBomItems(projectId: number, items: BomItemInput[]) {
    await this.prisma.projectBomItem.deleteMany({ where: { projectId } });
    for (const item of items) {
      const product = item.productId
        ? await this.prisma.product.findUnique({ where: { id: item.productId } })
        : item.sku
          ? await this.prisma.product.findUnique({ where: { sku: item.sku } })
          : null;
      if (!product) continue;
      await this.prisma.projectBomItem.create({
        data: {
          projectId,
          productId: product.id,
          standardQty: Number(item.standardQty ?? 1),
          unit: item.unit ?? product.unit ?? '件',
        },
      });
    }
  }

  private toService(project: any) {
    const bom = (project.bomItems ?? []).map((item: any) => ({
      id: item.id,
      productName: item.product?.name ?? item.productName ?? '',
      sku: item.product?.sku ?? item.sku ?? '',
      standardQty: Number(item.standardQty ?? 0),
      unit: item.unit ?? item.product?.unit ?? '',
    }));
    return {
      id: project.id,
      name: project.name,
      duration: project.duration,
      price: Number(project.price ?? 0),
      bomCount: bom.length,
      bom,
    };
  }
}
