import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';

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
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        movementType: 'service_consume',
        quantity: { lt: 0 },
      },
      include: {
        product: true,
        store: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });

    const sourceIdsByType = movements.reduce((acc: Record<string, number[]>, movement: any) => {
      if (!movement.sourceType || !movement.sourceId) return acc;
      acc[movement.sourceType] = acc[movement.sourceType] ?? [];
      acc[movement.sourceType].push(Number(movement.sourceId));
      return acc;
    }, {});
    const orderSourceIds = [...new Set([...(sourceIdsByType.project_order ?? []), ...(sourceIdsByType.product_order ?? [])])];
    const orderSourceNos = [
      ...new Set(
        movements
          .filter((movement: any) => ['project_order', 'product_order'].includes(String(movement.sourceType ?? '')) && movement.sourceNo)
          .map((movement: any) => String(movement.sourceNo)),
      ),
    ];

    const [cardUsageRecords, productOrders, serviceTasks, consumptionRecords] = await Promise.all([
      sourceIdsByType.card_usage?.length
        ? this.prisma.cardUsageRecord.findMany({
            where: { id: { in: [...new Set(sourceIdsByType.card_usage)] } },
            include: { beautician: true },
          })
        : [],
      orderSourceIds.length || orderSourceNos.length
        ? this.prisma.productOrder.findMany({
            where: {
              OR: [
                ...(orderSourceIds.length ? [{ id: { in: orderSourceIds } }] : []),
                ...(orderSourceNos.length ? [{ orderNo: { in: orderSourceNos } }] : []),
              ],
            },
            select: {
              id: true,
              orderNo: true,
              customerName: true,
              customer: { select: { name: true } },
              orderItems: {
                select: {
                  id: true,
                  itemType: true,
                  itemId: true,
                  name: true,
                  quantity: true,
                  beauticianId: true,
                  payload: true,
                  beautician: { select: { name: true } },
                },
              },
            },
          })
        : [],
      sourceIdsByType.service_record?.length || sourceIdsByType.service_task?.length
        ? this.prisma.serviceTask.findMany({
            where: { id: { in: [...new Set([...(sourceIdsByType.service_record ?? []), ...(sourceIdsByType.service_task ?? [])])] } },
            include: { customer: true, project: true, beautician: true },
          })
        : [],
      sourceIdsByType.consumption_record?.length
        ? this.prisma.consumptionRecord.findMany({
            where: { id: { in: [...new Set(sourceIdsByType.consumption_record)] } },
            include: { customer: { include: { store: true } } },
          })
        : [],
    ]);

    const cardUsageById = new Map(cardUsageRecords.map((record: any) => [record.id, record]));
    const orderById = new Map(productOrders.map((order: any) => [order.id, order]));
    const orderByNo = new Map(productOrders.map((order: any) => [order.orderNo, order]));
    const taskById = new Map(serviceTasks.map((task: any) => [task.id, task]));
    const consumptionById = new Map(consumptionRecords.map((record: any) => [record.id, record]));

    const movementRows = movements.map((movement: any) => {
      const sourceType = String(movement.sourceType ?? '');
      const sourceId = Number(movement.sourceId ?? 0);
      const sourceNo = movement.sourceNo ? String(movement.sourceNo) : '';
      const cardUsage = sourceType === 'card_usage' ? cardUsageById.get(sourceId) : null;
      const order = ['project_order', 'product_order'].includes(sourceType)
        ? orderById.get(sourceId) ?? (sourceNo ? orderByNo.get(sourceNo) : null)
        : null;
      const task = ['service_record', 'service_task'].includes(sourceType) ? taskById.get(sourceId) : null;
      const consumption = sourceType === 'consumption_record' ? consumptionById.get(sourceId) : null;
      const orderProjectItem = this.resolveOrderProjectItem(order, movement);
      const serviceEmployee =
        cardUsage?.beautician?.name ??
        task?.beautician?.name ??
        this.resolveOrderServiceEmployee(order, orderProjectItem) ??
        '未记录';
      const actualQty = Math.abs(Number(movement.quantity ?? 0));
      const projectId =
        cardUsage?.projectId ??
        task?.projectId ??
        orderProjectItem?.itemId ??
        undefined;
      const serviceTimes =
        this.toNumber(cardUsage?.times) ||
        this.toNumber(orderProjectItem?.quantity) ||
        1;

      return {
        id: movement.id,
        date: formatBusinessDate(movement.occurredAt),
        orderNo: order?.orderNo ?? (['project_order', 'product_order'].includes(sourceType) ? movement.sourceNo ?? undefined : undefined),
        serviceName:
          cardUsage?.projectName ??
          task?.project?.name ??
          orderProjectItem?.name ??
          consumption?.consumeType ??
          movement.remark ??
          '库存消耗',
        customerName:
          cardUsage?.customerName ??
          task?.customer?.name ??
          order?.customerName ??
          order?.customer?.name ??
          consumption?.customer?.name ??
          '散客',
        serviceEmployee,
        beautician: serviceEmployee,
        storeName: movement.store?.name ?? consumption?.customer?.store?.name ?? '默认门店',
        productName: movement.product?.name ?? '未知商品',
        productId: movement.productId ?? movement.product?.id,
        projectId,
        serviceTimes,
        standardQty: actualQty,
        actualQty,
        deviation: 0,
        isAbnormal: false,
        consumeContent: movement.remark ?? '',
        sourceType,
        sourceId,
        sourceNo: movement.sourceNo ?? undefined,
      };
    });

    if (movementRows.length) return this.enrichConsumptionRowsWithBomStandard(movementRows);

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
        date: formatBusinessDate(record.consumeTime),
        orderNo: undefined,
        serviceName: content,
        customerName: record.customer?.name ?? '散客',
        serviceEmployee: '未记录',
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

  private resolveOrderProjectItem(order: any, movement: any) {
    const projectItems = (order?.orderItems ?? []).filter((item: any) => String(item?.itemType ?? '').toLowerCase() === 'project');
    if (!projectItems.length) return null;
    const remark = String(movement?.remark ?? '');
    if (remark) {
      const matched = projectItems.find((item: any) => item?.name && remark.includes(String(item.name)));
      if (matched) return matched;
    }
    return projectItems[0] ?? null;
  }

  private resolveOrderServiceEmployee(order: any, preferredItem?: any) {
    const preferredName = this.getOrderItemServiceEmployee(preferredItem);
    if (preferredName) return preferredName;

    const names = new Set<string>();
    for (const item of order?.orderItems ?? []) {
      if (String(item?.itemType ?? '').toLowerCase() !== 'project') continue;
      const name = this.getOrderItemServiceEmployee(item);
      if (name) names.add(name);
    }
    return names.size ? Array.from(names).join('、') : undefined;
  }

  private getOrderItemServiceEmployee(item: any) {
    const payload = item?.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
      ? item.payload as Record<string, unknown>
      : {};
    const payloadName = payload.beauticianName ? String(payload.beauticianName).trim() : '';
    const relationName = item?.beautician?.name ? String(item.beautician.name).trim() : '';
    return relationName || payloadName || undefined;
  }

  async getForecast() {
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { currentStock: 'asc' },
      take: 100,
    });

    const [reservations, serviceTasks, recentMovements] = await Promise.all([
      this.prisma.reservation?.findMany
        ? this.prisma.reservation.findMany({
            where: {
              date: { gte: now, lte: sevenDaysLater },
              status: { notIn: ['cancelled', 'no_show', 'completed'] },
            },
            select: { projectId: true },
          })
        : [],
      this.prisma.serviceTask?.findMany
        ? this.prisma.serviceTask.findMany({
            where: {
              appointmentTime: { gte: now, lte: sevenDaysLater },
              status: { notIn: ['cancelled', 'completed'] },
            },
            select: { projectId: true },
          })
        : [],
      this.prisma.stockMovement?.findMany
        ? this.prisma.stockMovement.findMany({
            where: {
              movementType: { in: ['service_consume', 'service_consumption'] },
              quantity: { lt: 0 },
              occurredAt: { gte: thirtyDaysAgo },
            },
            select: { productId: true, quantity: true },
          })
        : [],
    ]);

    const projectDemand = new Map<number, number>();
    for (const item of [...reservations, ...serviceTasks] as any[]) {
      const projectId = Number(item.projectId);
      if (!projectId) continue;
      projectDemand.set(projectId, (projectDemand.get(projectId) ?? 0) + 1);
    }

    const scheduledByProduct = new Map<number, number>();
    if (projectDemand.size && this.prisma.projectBomItem?.findMany) {
      const bomItems = await this.prisma.projectBomItem.findMany({
        where: { projectId: { in: [...projectDemand.keys()] } },
        select: { projectId: true, productId: true, standardQty: true },
      });
      for (const bomItem of bomItems as any[]) {
        const multiplier = projectDemand.get(Number(bomItem.projectId)) ?? 0;
        const productId = Number(bomItem.productId);
        if (!productId || multiplier <= 0) continue;
        scheduledByProduct.set(
          productId,
          (scheduledByProduct.get(productId) ?? 0) + this.toNumber(bomItem.standardQty) * multiplier,
        );
      }
    }

    const recentByProduct = new Map<number, number>();
    for (const movement of recentMovements as any[]) {
      const productId = Number(movement.productId);
      if (!productId) continue;
      recentByProduct.set(productId, (recentByProduct.get(productId) ?? 0) + Math.abs(this.toNumber(movement.quantity)));
    }

    return products.map((product) => {
      const currentStock = Number(product.currentStock ?? 0);
      const scheduledConsumption = scheduledByProduct.get(product.id) ?? 0;
      const recentDailyConsumption = (recentByProduct.get(product.id) ?? 0) / 30;
      const trendConsumption = recentDailyConsumption * 7;
      const forecastConsumption = Math.ceil(scheduledConsumption + trendConsumption);
      return {
        productName: product.name,
        sku: product.sku,
        forecastConsumption,
        scheduledConsumption: this.round(scheduledConsumption, 2),
        recentDailyConsumption: this.round(recentDailyConsumption, 2),
        currentStock,
        shortage: Math.max(0, forecastConsumption - currentStock),
      };
    });
  }

  private async enrichConsumptionRowsWithBomStandard(rows: any[]) {
    const projectIds = [...new Set(rows.map((row) => Number(row.projectId)).filter(Boolean))];
    const productIds = [...new Set(rows.map((row) => Number(row.productId)).filter(Boolean))];
    if (!projectIds.length || !productIds.length || !this.prisma.projectBomItem?.findMany) return rows;

    const bomItems = await this.prisma.projectBomItem.findMany({
      where: {
        projectId: { in: projectIds },
        productId: { in: productIds },
      },
      select: { projectId: true, productId: true, standardQty: true },
    });
    const standardByKey = new Map<string, number>();
    for (const item of bomItems as any[]) {
      standardByKey.set(`${item.projectId}:${item.productId}`, this.toNumber(item.standardQty));
    }

    return rows.map((row) => {
      const perServiceStandardQty = standardByKey.get(`${row.projectId}:${row.productId}`) ?? 0;
      const standardQty = perServiceStandardQty > 0
        ? perServiceStandardQty * Math.max(1, this.toNumber(row.serviceTimes) || 1)
        : row.standardQty;
      const actualQty = this.toNumber(row.actualQty);
      const deviation = standardQty > 0 ? ((actualQty - standardQty) / standardQty) * 100 : 0;
      return {
        ...row,
        standardQty: this.round(standardQty, 4),
        actualQty: this.round(actualQty, 4),
        deviation: this.round(deviation, 1),
        isAbnormal: Math.abs(deviation) > 20,
      };
    });
  }

  private round(value: number, precision = 2) {
    const factor = 10 ** precision;
    return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return 0;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : 0;
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
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { storeId: true } });
    await this.prisma.projectBomItem.deleteMany({ where: { projectId } });
    for (const item of items) {
      const product = item.productId
        ? await this.prisma.product.findUnique({ where: { id: item.productId } })
        : item.sku
          ? await this.prisma.product.findFirst({ where: { sku: item.sku, storeId: project?.storeId, deletedAt: null } })
          : null;
      if (!product) continue;
      await this.prisma.projectBomItem.create({
        data: {
          projectId,
          productId: product.id,
          standardQty: Number(item.standardQty ?? 1),
          unit: item.unit ?? product.specUnit ?? product.unit ?? '件',
        },
      });
    }
  }

  private toService(project: any) {
    const bom = (project.bomItems ?? []).map((item: any) => ({
      id: item.id,
      productId: item.productId ?? item.product?.id,
      productName: item.product?.name ?? item.productName ?? '',
      sku: item.product?.sku ?? item.sku ?? '',
      standardQty: Number(item.standardQty ?? 0),
      unit: item.unit ?? item.product?.specUnit ?? item.product?.unit ?? '',
      costPrice: Number(item.product?.costPrice ?? 0),
      productStatus: item.product?.status,
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
