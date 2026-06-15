import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateSupplierDto,
  CreateSupplierOrderDto,
  GenerateSupplierSettlementDto,
  LinkProductSupplierDto,
  QuerySupplierOrdersDto,
  QuerySupplierSettlementsDto,
  QuerySuppliersDto,
  ReceiveSupplierOrderDto,
  UpdateSupplierDto,
  UpdateSupplierOrderStatusDto,
} from './dto/supply-chain.dto.js';

const DEFAULT_PLATFORM_FEE_RATE = 0.02;
const ORDER_STATUS = new Set(['draft', 'pending', 'approved', 'ordered', 'partial_received', 'received', 'cancelled', 'settled']);
const ACTIVE_ORDER_STATUSES = ['draft', 'pending', 'approved', 'ordered', 'partial_received', 'received'];

@Injectable()
export class SupplyChainService {
  constructor(private prisma: PrismaService) {}

  private toNumber(value: unknown, fallback = 0) {
    const num = Number(value ?? fallback);
    return Number.isFinite(num) ? num : fallback;
  }

  private toCsvValue(value: unknown) {
    if (value === null || value === undefined) return '';
    const text = value instanceof Date ? value.toISOString() : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  private buildCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; header: string }>) {
    const header = columns.map((column) => this.toCsvValue(column.header)).join(',');
    const body = rows.map((row) => columns.map((column) => this.toCsvValue(row[column.key])).join(','));
    return [header, ...body].join('\r\n');
  }

  private normalizeText(value: unknown) {
    const text = value === undefined || value === null ? '' : String(value).trim();
    return text || undefined;
  }

  private resolveStoreId(dtoStoreId?: number | string, headerStoreId?: number) {
    const dtoValue = Number(dtoStoreId ?? 0);
    if (Number.isFinite(dtoValue) && dtoValue > 0) return dtoValue;
    return headerStoreId && headerStoreId > 0 ? headerStoreId : undefined;
  }

  private createOrderNo() {
    return `SPO${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private createMovementNo(prefix = 'IN') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private createBatchNo(orderNo: string, productId: number) {
    return `${orderNo}-${productId}-${Date.now().toString(36).toUpperCase()}`;
  }

  private monthRange(settleMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(settleMonth)) {
      throw new BadRequestException('结算月份格式应为 YYYY-MM');
    }
    const [year, month] = settleMonth.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { start, end };
  }

  private calculateOrderAmounts(totalAmount: number, supplier: { rebateRate?: unknown }, dto: CreateSupplierOrderDto) {
    const platformFee =
      dto.platformFee === undefined || dto.platformFee === null
        ? totalAmount * DEFAULT_PLATFORM_FEE_RATE
        : this.toNumber(dto.platformFee);
    const rebateAmount =
      dto.rebateAmount === undefined || dto.rebateAmount === null
        ? totalAmount * this.toNumber(supplier.rebateRate)
        : this.toNumber(dto.rebateAmount);
    return {
      platformFee,
      rebateAmount,
      netAmount: Math.max(0, totalAmount - rebateAmount),
    };
  }

  private toSupplierView(item: any) {
    return {
      id: item.id,
      storeId: item.storeId ?? null,
      storeName: item.store?.name ?? (item.storeId ? `门店 ${item.storeId}` : '全部门店'),
      name: item.name,
      contactName: item.contactName ?? '',
      phone: item.phone ?? '',
      email: item.email ?? '',
      address: item.address ?? '',
      category: item.category ?? '',
      rebateRate: this.toNumber(item.rebateRate),
      paymentTerms: item.paymentTerms ?? '',
      status: item.status,
      productCount: item._count?.products ?? item.products?.length ?? 0,
      products: Array.isArray(item.products)
        ? item.products.map((relation: any) => ({
            id: relation.id,
            productId: relation.productId,
            productName: relation.product?.name ?? `产品 ${relation.productId}`,
            sku: relation.product?.sku ?? '',
            categoryName: relation.product?.category?.name ?? '',
            supplyPrice: this.toNumber(relation.supplyPrice),
            moq: relation.moq ?? null,
            leadDays: relation.leadDays ?? null,
            isPrimary: Boolean(relation.isPrimary),
          }))
        : undefined,
      createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
      updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
    };
  }

  private toSupplierOrderView(order: any) {
    const items = Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product?.name ?? `产品 ${item.productId}`,
          sku: item.product?.sku ?? '',
          unit: item.product?.unit ?? '',
          quantity: this.toNumber(item.quantity),
          unitPrice: this.toNumber(item.unitPrice),
          subtotal: this.toNumber(item.subtotal),
          receivedQty: item.receivedQty === null || item.receivedQty === undefined ? 0 : this.toNumber(item.receivedQty),
          moq: item.product?.suppliers?.[0]?.moq ?? null,
        }))
      : [];
    return {
      id: order.id,
      orderNo: order.orderNo,
      supplierId: order.supplierId,
      supplierName: order.supplier?.name ?? `供应商 ${order.supplierId}`,
      storeId: order.storeId,
      storeName: order.store?.name ?? `门店 ${order.storeId}`,
      totalAmount: this.toNumber(order.totalAmount),
      platformFee: this.toNumber(order.platformFee),
      rebateAmount: this.toNumber(order.rebateAmount),
      netAmount: this.toNumber(order.netAmount),
      platformRevenue: this.toNumber(order.platformFee) + this.toNumber(order.rebateAmount),
      status: order.status,
      orderedAt: order.orderedAt?.toISOString?.() ?? order.orderedAt,
      receivedAt: order.receivedAt?.toISOString?.() ?? order.receivedAt ?? null,
      settledAt: order.settledAt?.toISOString?.() ?? order.settledAt ?? null,
      createdAt: order.createdAt?.toISOString?.() ?? order.createdAt,
      updatedAt: order.updatedAt?.toISOString?.() ?? order.updatedAt,
      productCount: items.length,
      totalQuantity: items.reduce((sum: number, item: any) => sum + this.toNumber(item.quantity), 0),
      receivedQuantity: items.reduce((sum: number, item: any) => sum + this.toNumber(item.receivedQty), 0),
      items,
    };
  }

  private toSupplierSettlementView(item: any) {
    return {
      id: item.id,
      supplierId: item.supplierId,
      supplierName: item.supplier?.name ?? `供应商 ${item.supplierId}`,
      settleMonth: item.settleMonth,
      orderCount: item.orderCount,
      totalAmount: this.toNumber(item.totalAmount),
      rebateAmount: this.toNumber(item.rebateAmount),
      platformFee: this.toNumber(item.platformFee),
      platformRevenue: this.toNumber(item.platformFee) + this.toNumber(item.rebateAmount),
      netPayable: this.toNumber(item.netPayable),
      status: item.status,
      confirmedAt: item.confirmedAt?.toISOString?.() ?? item.confirmedAt ?? null,
      paidAt: item.paidAt?.toISOString?.() ?? item.paidAt ?? null,
      createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
      updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
    };
  }

  async findSuppliers(query: QuerySuppliersDto & { storeId?: number | string }) {
    const page = Math.max(1, this.toNumber(query.page, 1));
    const pageSize = Math.max(1, Math.min(200, this.toNumber(query.pageSize, 20)));
    const where: any = { deletedAt: null };
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.OR = [{ storeId }, { storeId: null }];
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    const keyword = this.normalizeText(query.keyword);
    if (keyword) {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { contactName: { contains: keyword, mode: 'insensitive' } },
            { phone: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: { store: { select: { id: true, name: true } }, _count: { select: { products: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.supplier.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.toSupplierView(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async findSupplier(id: number) {
    const item = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        store: { select: { id: true, name: true } },
        products: {
          include: {
            product: { include: { category: { select: { id: true, name: true } } } },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!item) throw new NotFoundException('供应商不存在');
    return this.toSupplierView(item);
  }

  private normalizeSupplierPayload(dto: CreateSupplierDto | UpdateSupplierDto, headerStoreId?: number, partial = false) {
    const payload: any = {};
    if (!partial || dto.storeId !== undefined || headerStoreId !== undefined) {
      payload.storeId = this.resolveStoreId(dto.storeId, headerStoreId) ?? null;
    }
    for (const key of ['name', 'contactName', 'phone', 'email', 'address', 'category', 'paymentTerms', 'status'] as const) {
      const value = (dto as any)[key];
      if (!partial || value !== undefined) {
        payload[key] = value === undefined || value === null ? (partial ? undefined : null) : String(value).trim();
      }
    }
    if (!partial || dto.rebateRate !== undefined) {
      payload.rebateRate = dto.rebateRate === undefined || dto.rebateRate === null ? null : Number(dto.rebateRate);
    }
    if (!payload.status && !partial) payload.status = 'active';
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  async createSupplier(dto: CreateSupplierDto, headerStoreId?: number) {
    const data = this.normalizeSupplierPayload(dto, headerStoreId);
    if (!data.name) throw new BadRequestException('供应商名称不能为空');
    const item = await this.prisma.supplier.create({
      data: { ...data, name: String(data.name) },
      include: { store: { select: { id: true, name: true } }, _count: { select: { products: true } } },
    });
    return this.toSupplierView(item);
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto, headerStoreId?: number) {
    await this.ensureSupplier(id);
    const data = this.normalizeSupplierPayload(dto, headerStoreId, true);
    if (data.name === '') throw new BadRequestException('供应商名称不能为空');
    const item = await this.prisma.supplier.update({
      where: { id },
      data,
      include: { store: { select: { id: true, name: true } }, _count: { select: { products: true } } },
    });
    return this.toSupplierView(item);
  }

  async deleteSupplier(id: number) {
    await this.ensureSupplier(id);
    const activeOrderCount = await this.prisma.supplierOrder.count({
      where: { supplierId: id, status: { in: ACTIVE_ORDER_STATUSES } },
    });
    if (activeOrderCount > 0) throw new BadRequestException('供应商已有未完结采购单，不能归档');
    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });
    return { id };
  }

  async linkProduct(supplierId: number, dto: LinkProductSupplierDto) {
    const supplier = await this.ensureSupplier(supplierId);
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null } });
    if (!product) throw new NotFoundException('产品不存在');
    if (supplier.storeId && product.storeId !== supplier.storeId) {
      throw new BadRequestException('门店供应商只能关联同门店产品');
    }

    const isPrimary = dto.isPrimary ?? false;
    const data = {
      supplyPrice: dto.supplyPrice === undefined ? product.costPrice : Number(dto.supplyPrice),
      moq: dto.moq ?? null,
      leadDays: dto.leadDays ?? null,
      isPrimary,
    };

    const relation = await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.productSupplier.updateMany({
          where: { productId: dto.productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.productSupplier.upsert({
        where: { productId_supplierId: { productId: dto.productId, supplierId } },
        update: data,
        create: { productId: dto.productId, supplierId, ...data },
        include: { product: { include: { category: { select: { id: true, name: true } } } } },
      });
    });

    return this.toSupplierView({ ...supplier, products: [relation] }).products?.[0];
  }

  async unlinkProduct(supplierId: number, productId: number) {
    await this.ensureSupplier(supplierId);
    const relation = await this.prisma.productSupplier.findUnique({
      where: { productId_supplierId: { productId, supplierId } },
    });
    if (!relation) throw new NotFoundException('供应商产品关联不存在');
    await this.prisma.productSupplier.delete({ where: { productId_supplierId: { productId, supplierId } } });
    return { supplierId, productId };
  }

  async findOrders(query: QuerySupplierOrdersDto & { storeId?: number | string }) {
    const page = Math.max(1, this.toNumber(query.page, 1));
    const pageSize = Math.max(1, Math.min(200, this.toNumber(query.pageSize, 20)));
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.status) where.status = query.status;
    const keyword = this.normalizeText(query.keyword);
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword, mode: 'insensitive' } },
        { supplier: { name: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.supplierOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  unit: true,
                  suppliers: { where: { isPrimary: true }, select: { moq: true, supplierId: true } },
                },
              },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { orderedAt: 'desc' },
      }),
      this.prisma.supplierOrder.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.toSupplierOrderView(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async findOrder(id: number) {
    const order = await this.prisma.supplierOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                suppliers: { where: { isPrimary: true }, select: { moq: true, supplierId: true } },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('采购单不存在');
    return this.toSupplierOrderView(order);
  }

  async createOrder(dto: CreateSupplierOrderDto, headerStoreId?: number) {
    const supplier = await this.ensureSupplier(dto.supplierId);
    const storeId = this.resolveStoreId(dto.storeId, headerStoreId) ?? supplier.storeId;
    if (!storeId) throw new BadRequestException('请先选择采购门店');
    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) throw new NotFoundException('门店不存在');
    if (supplier.storeId && supplier.storeId !== storeId) throw new BadRequestException('该供应商只能为所属门店创建采购单');

    const itemInputs = Array.isArray(dto.items) ? dto.items : [];
    if (itemInputs.length === 0) throw new BadRequestException('采购明细不能为空');
    const productIds = [...new Set(itemInputs.map((item) => Number(item.productId)).filter(Boolean))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      include: { suppliers: { where: { supplierId: supplier.id } } },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const orderItems = itemInputs.map((item) => {
      const productId = Number(item.productId);
      const product = productMap.get(productId);
      if (!product) throw new NotFoundException(`产品 ${productId} 不存在`);
      if (product.storeId !== storeId) throw new BadRequestException(`${product.name} 不属于当前采购门店`);
      const quantity = Math.max(1, Math.floor(this.toNumber(item.quantity, 1)));
      const relation = product.suppliers[0];
      const unitPrice = item.unitPrice === undefined || item.unitPrice === null ? this.toNumber(relation?.supplyPrice ?? product.costPrice) : this.toNumber(item.unitPrice);
      return { productId, quantity, unitPrice, subtotal: quantity * unitPrice };
    });

    const totalAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const amounts = this.calculateOrderAmounts(totalAmount, supplier, dto);
    const status = dto.status && ORDER_STATUS.has(dto.status) ? dto.status : 'draft';

    const order = await this.prisma.supplierOrder.create({
      data: {
        orderNo: this.createOrderNo(),
        supplierId: supplier.id,
        storeId,
        totalAmount,
        platformFee: amounts.platformFee,
        rebateAmount: amounts.rebateAmount,
        netAmount: amounts.netAmount,
        status,
        items: { create: orderItems },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      },
    });

    return this.toSupplierOrderView(order);
  }

  async updateOrderStatus(id: number, dto: UpdateSupplierOrderStatusDto) {
    if (!ORDER_STATUS.has(dto.status)) throw new BadRequestException('不支持的采购单状态');
    await this.findOrder(id);
    const data: any = { status: dto.status };
    if (dto.status === 'settled') data.settledAt = new Date();
    if (dto.status === 'ordered') data.orderedAt = new Date();
    const order = await this.prisma.supplierOrder.update({
      where: { id },
      data,
      include: {
        supplier: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } },
      },
    });
    return this.toSupplierOrderView(order);
  }

  confirmOrder(id: number) {
    return this.updateOrderStatus(id, { status: 'approved' });
  }

  settleOrder(id: number) {
    return this.updateOrderStatus(id, { status: 'settled' });
  }

  async receiveOrder(id: number, dto: ReceiveSupplierOrderDto) {
    const affectedStoreId = await this.prisma.$transaction(async (tx) => {
      const order = await tx.supplierOrder.findUnique({
        where: { id },
        include: { items: { include: { product: true } } },
      });
      if (!order) throw new NotFoundException('采购单不存在');
      if (['cancelled', 'settled'].includes(order.status)) throw new BadRequestException('已取消或已结算的采购单不能收货');

      const orderItemsById = new Map(order.items.map((item) => [item.id, item]));
      const orderItemsByProduct = new Map(order.items.map((item) => [item.productId, item]));
      for (const input of dto.items) {
        const orderItem = input.orderItemId
          ? orderItemsById.get(Number(input.orderItemId))
          : input.productId
            ? orderItemsByProduct.get(Number(input.productId))
            : undefined;
        if (!orderItem) throw new NotFoundException('采购明细不存在');

        const quantity = Math.max(1, Math.floor(this.toNumber(input.receivedQty, 1)));
        const alreadyReceived = this.toNumber(orderItem.receivedQty);
        const maxReceivable = this.toNumber(orderItem.quantity) - alreadyReceived;
        if (quantity > maxReceivable) throw new BadRequestException(`${orderItem.product.name} 本次收货数量超过未收数量`);

        await this.receiveOrderItemStock(tx, order, orderItem, {
          quantity,
          batchNo: this.normalizeText(input.batchNo) ?? this.createBatchNo(order.orderNo, orderItem.productId),
          productionDate: input.productionDate,
          expiryDate: input.expiryDate,
          remark: dto.remark,
        });
        await tx.supplierOrderItem.update({
          where: { id: orderItem.id },
          data: { receivedQty: alreadyReceived + quantity },
        });
      }

      const refreshedItems = await tx.supplierOrderItem.findMany({ where: { orderId: order.id } });
      const allReceived = refreshedItems.every((item) => this.toNumber(item.receivedQty) >= this.toNumber(item.quantity));
      const anyReceived = refreshedItems.some((item) => this.toNumber(item.receivedQty) > 0);
      await tx.supplierOrder.update({
        where: { id: order.id },
        data: {
          status: allReceived ? 'received' : anyReceived ? 'partial_received' : order.status,
          receivedAt: allReceived ? new Date() : order.receivedAt,
        },
      });
      return order.storeId;
    });

    return this.findOrder(id).then((order) => ({ ...order, affectedStoreId }));
  }

  async findSettlements(query: QuerySupplierSettlementsDto) {
    const page = Math.max(1, this.toNumber(query.page, 1));
    const pageSize = Math.max(1, Math.min(200, this.toNumber(query.pageSize, 20)));
    const where: any = {};
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.settleMonth) where.settleMonth = query.settleMonth;
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.supplierSettlement.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ settleMonth: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.supplierSettlement.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.toSupplierSettlementView(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async findSettlement(id: number) {
    const item = await this.prisma.supplierSettlement.findUnique({
      where: { id },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException('供应商结算单不存在');
    return this.toSupplierSettlementView(item);
  }

  async exportSettlements(query: QuerySupplierSettlementsDto) {
    const where: any = {};
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.settleMonth) where.settleMonth = query.settleMonth;
    if (query.status) where.status = query.status;

    const items = await this.prisma.supplierSettlement.findMany({
      where,
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: [{ settleMonth: 'desc' }, { supplierId: 'asc' }],
    });
    const rows = items.map((item) => this.toSupplierSettlementView(item));
    const content = this.buildCsv(rows, [
      { key: 'settleMonth', header: '月份' },
      { key: 'supplierName', header: '供应商' },
      { key: 'orderCount', header: '采购单数' },
      { key: 'totalAmount', header: '采购金额' },
      { key: 'rebateAmount', header: '返利' },
      { key: 'platformFee', header: '平台服务费' },
      { key: 'platformRevenue', header: '平台收入' },
      { key: 'netPayable', header: '应付供应商' },
      { key: 'status', header: '状态' },
      { key: 'confirmedAt', header: '确认时间' },
      { key: 'paidAt', header: '付款时间' },
    ]);
    const suffix = query.settleMonth || 'all';
    return {
      filename: `supplier-settlements-${suffix}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: `\ufeff${content}`,
      total: rows.length,
    };
  }

  async generateSettlement(dto: GenerateSupplierSettlementDto) {
    const { start, end } = this.monthRange(dto.settleMonth);
    const where: any = {
      status: { in: ['received', 'settled'] },
      receivedAt: { gte: start, lt: end },
    };
    if (dto.supplierId) where.supplierId = Number(dto.supplierId);

    const orders = await this.prisma.supplierOrder.findMany({
      where,
      include: { supplier: { select: { id: true, name: true } } },
    });
    const groups = new Map<number, typeof orders>();
    for (const order of orders) {
      groups.set(order.supplierId, [...(groups.get(order.supplierId) ?? []), order]);
    }

    const items = await this.prisma.$transaction(
      [...groups.entries()].map(([supplierId, supplierOrders]) => {
        const totalAmount = supplierOrders.reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0);
        const rebateAmount = supplierOrders.reduce((sum, order) => sum + this.toNumber(order.rebateAmount), 0);
        const platformFee = supplierOrders.reduce((sum, order) => sum + this.toNumber(order.platformFee), 0);
        return this.prisma.supplierSettlement.upsert({
          where: { supplierId_settleMonth: { supplierId, settleMonth: dto.settleMonth } },
          update: {
            orderCount: supplierOrders.length,
            totalAmount,
            rebateAmount,
            platformFee,
            netPayable: Math.max(0, totalAmount - rebateAmount - platformFee),
          },
          create: {
            supplierId,
            settleMonth: dto.settleMonth,
            orderCount: supplierOrders.length,
            totalAmount,
            rebateAmount,
            platformFee,
            netPayable: Math.max(0, totalAmount - rebateAmount - platformFee),
          },
          include: { supplier: { select: { id: true, name: true } } },
        });
      }),
    );

    return { items: items.map((item) => this.toSupplierSettlementView(item)), total: items.length };
  }

  async confirmSettlement(id: number) {
    await this.findSettlement(id);
    const item = await this.prisma.supplierSettlement.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date() },
      include: { supplier: { select: { id: true, name: true } } },
    });
    return this.toSupplierSettlementView(item);
  }

  async markSettlementPaid(id: number) {
    const current = await this.findSettlement(id);
    if (current.status === 'draft') throw new BadRequestException('请先确认结算单');
    const item = await this.prisma.supplierSettlement.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
      include: { supplier: { select: { id: true, name: true } } },
    });
    return this.toSupplierSettlementView(item);
  }

  private async receiveOrderItemStock(
    tx: any,
    order: { id: number; orderNo: string; storeId: number },
    orderItem: { productId: number; product: any },
    input: { quantity: number; batchNo: string; productionDate?: string; expiryDate?: string; remark?: string },
  ) {
    const product = orderItem.product;
    const beforeStock = this.toNumber(product.currentStock);
    const afterStock = beforeStock + input.quantity;
    const batch = await tx.stockBatch.create({
      data: {
        productId: orderItem.productId,
        batchNo: input.batchNo,
        stock: input.quantity,
        productionDate: input.productionDate ? new Date(input.productionDate) : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
      },
    });
    await tx.product.update({
      where: { id: orderItem.productId },
      data: { currentStock: { increment: input.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        storeId: order.storeId,
        productId: orderItem.productId,
        batchId: batch.id,
        movementNo: this.createMovementNo('SIN'),
        movementType: 'purchase_inbound',
        quantity: input.quantity,
        beforeStock,
        afterStock,
        unit: product.unit,
        sourceType: 'supplier_order',
        sourceId: order.id,
        sourceNo: order.orderNo,
        remark: input.remark,
      },
    });
  }

  private async ensureSupplier(id: number) {
    const item = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: { store: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException('供应商不存在');
    return item;
  }
}
