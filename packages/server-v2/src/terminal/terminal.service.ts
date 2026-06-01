import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { DeviceLoginDto } from './dto/device-login.dto.js';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto.js';
import { QuickCreateCustomerDto } from './dto/quick-create-customer.dto.js';
import { CreateServiceTaskDto } from './dto/create-service-task.dto.js';
import { VerifyCardDto, ConsumeCardDto } from './dto/verify-card.dto.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { CreateSkinTestDto } from './dto/create-skin-test.dto.js';
import { CreateCardOrderDto } from './dto/card-order.dto.js';
import { CreateRechargeOrderDto } from './dto/recharge-order.dto.js';
import { UpdateTerminalCustomerHealthProfileDto } from './dto/customer-health-profile.dto.js';

@Injectable()
export class TerminalService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private toIso(value?: Date | string | null): string {
    if (!value) return '';
    return value instanceof Date ? value.toISOString() : String(value);
  }

  private toTerminalDeviceId(deviceId?: number | null): number | undefined {
    return deviceId && deviceId > 0 ? deviceId : undefined;
  }

  private isMissingOptionalTableError(error: unknown) {
    const candidate = error as {
      code?: string;
      meta?: {
        driverAdapterError?: {
          cause?: { kind?: string };
        };
      };
    };
    return candidate?.code === 'P2021' || candidate?.meta?.driverAdapterError?.cause?.kind === 'TableDoesNotExist';
  }

  private warnOptionalTableSkipped(tableName: string, error: unknown) {
    if (!this.isMissingOptionalTableError(error)) return false;
    console.warn(`Ami Core terminal optional table "${tableName}" is missing, skipped writing related detail.`);
    return true;
  }

  private getPaymentMethod(method?: string) {
    const map: Record<string, string> = {
      微信: 'wechat',
      支付宝: 'alipay',
      现金: 'cash',
      银行卡: 'card',
      次卡抵扣: 'customer_card',
      wechat: 'wechat',
      alipay: 'alipay',
      cash: 'cash',
      card: 'card',
      customer_card: 'customer_card',
    };
    return map[method || ''] || method || 'cash';
  }

  private createSequenceNo(prefix: string) {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private normalizeOrderItems(rawItems: any[] = []) {
    return rawItems.map((item) => {
      const quantity = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
      const unitPrice = this.toNumber(item.unitPrice ?? item.price ?? item.amount);
      const discount = this.toNumber(item.discount);
      const subtotal = this.toNumber(item.subtotal ?? quantity * unitPrice - discount);
      const itemType = String(item.itemType ?? item.type ?? 'product');
      const itemId = item.itemId ?? item.productId ?? item.projectId ?? item.cardId;
      return {
        itemType,
        itemId: itemId === undefined || itemId === null ? undefined : Number(itemId),
        name: String(item.name ?? item.productName ?? item.projectName ?? item.cardName ?? `${itemType}#${itemId ?? ''}`),
        quantity,
        unitPrice,
        subtotal,
        discount,
        payload: item,
      };
    });
  }

  private async createOrderItems(tx: any, orderId: number, rawItems: any[] = []) {
    const items = this.normalizeOrderItems(rawItems);
    if (!items.length) return items;

    try {
      await tx.orderItem.createMany({
        data: items.map((item) => ({
          orderId,
          itemType: item.itemType,
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          discount: item.discount,
          payload: item.payload,
        })),
      });
    } catch (error) {
      if (!this.warnOptionalTableSkipped('OrderItem', error)) throw error;
    }

    return items;
  }

  private async createPaymentRecord(
    tx: any,
    orderId: number,
    paymentMethod: string | undefined,
    amount: number,
    transactionNo?: string,
  ) {
    if (amount <= 0) return null;
    try {
      return await tx.paymentRecord.create({
        data: {
          orderId,
          paymentNo: this.createSequenceNo('PAY'),
          method: this.getPaymentMethod(paymentMethod),
          amount,
          status: 'success',
          transactionNo,
          paidAt: new Date(),
        },
      });
    } catch (error) {
      if (this.warnOptionalTableSkipped('PaymentRecord', error)) return null;
      throw error;
    }
  }

  private async applyMarketingAttribution(tx: any, order: { id: number; customerId?: number | null }, amount: number) {
    if (!order.customerId || amount <= 0) return;

    try {
      const existed = await tx.marketingAttribution.findFirst({
        where: { orderId: order.id },
        select: { id: true },
      });
      if (existed) return;

      const touches = await tx.marketingAutomationTouch.findMany({
        where: {
          customerId: order.customerId,
          touchedAt: { lte: new Date() },
          status: { in: ['reached', 'sent', 'delivered', 'clicked', 'opened', 'converted'] },
        },
        orderBy: { touchedAt: 'desc' },
        take: 10,
      });

      const now = new Date();
      const touch = touches.find((item: any) => {
        const windowDays = Number(item.attributionWindowDays ?? 30);
        return item.touchedAt.getTime() >= now.getTime() - windowDays * 86400000;
      });
      if (!touch) return;

      await tx.marketingAttribution.create({
        data: {
          touchId: touch.id,
          strategyId: touch.strategyId,
          executionId: touch.executionId,
          customerId: order.customerId,
          orderId: order.id,
          attributionType: 'last_touch',
          attributedRevenue: amount,
          attributionWindowDays: touch.attributionWindowDays ?? 30,
          occurredAt: now,
        },
      });

      await tx.marketingAutomationTouch.update({
        where: { id: touch.id },
        data: {
          status: 'converted',
          convertedAt: now,
          conversionType: 'order',
          actualRevenue: { increment: amount },
        },
      });
    } catch (error) {
      if (!this.warnOptionalTableSkipped('MarketingAttribution/MarketingAutomationTouch', error)) throw error;
    }
  }

  private async createStockMovementForItem(
    tx: any,
    storeId: number,
    item: any,
    movementType: string,
    source: { type: string; id?: number; no?: string; remark?: string },
  ) {
    const productId = Number(item.productId ?? item.itemId ?? item.id);
    const quantity = this.toNumber(item.quantity ?? item.qty ?? item.amount ?? item.standardQty);
    if (!productId || quantity <= 0) return;

    const product = await tx.product.findFirst({ where: { id: productId, storeId, deletedAt: null } });
    if (!product) return;

    const signedQuantity = movementType.endsWith('_out') || movementType.includes('consume') ? -quantity : quantity;
    const beforeStock = this.toNumber(product.currentStock);
    const afterStock = beforeStock + signedQuantity;

    await tx.product.update({
      where: { id: product.id },
      data: signedQuantity < 0 ? { currentStock: { decrement: Math.abs(signedQuantity) } } : { currentStock: { increment: signedQuantity } },
    });

    const batchId = item.batchId ? Number(item.batchId) : undefined;
    if (batchId) {
      await tx.stockBatch.updateMany({
        where: { id: batchId, productId: product.id },
        data: signedQuantity < 0 ? { stock: { decrement: Math.abs(signedQuantity) } } : { stock: { increment: signedQuantity } },
      });
    }

    await tx.stockMovement.create({
      data: {
        storeId,
        productId: product.id,
        batchId,
        movementNo: this.createSequenceNo('SM'),
        movementType,
        quantity: signedQuantity,
        beforeStock,
        afterStock,
        unit: product.unit,
        sourceType: source.type,
        sourceId: source.id,
        sourceNo: source.no,
        remark: source.remark,
      },
    });
  }

  private async getStore(storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('门店不存在');
    return store;
  }

  private async mapReservation(reservation: any) {
    const [store, customer, project, beautician] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: reservation.storeId } }),
      this.prisma.customer.findUnique({ where: { id: reservation.customerId } }),
      this.prisma.project.findUnique({ where: { id: reservation.projectId } }),
      reservation.beauticianId
        ? this.prisma.beautician.findUnique({ where: { id: reservation.beauticianId } })
        : Promise.resolve(null),
    ]);
    const dateText = this.toIso(reservation.date).slice(0, 10);
    const appointmentTime = `${dateText} ${reservation.startTime || '00:00'}:00`;

    return {
      id: reservation.id,
      reservationNo: `R${String(reservation.id).padStart(6, '0')}`,
      customerId: reservation.customerId,
      customerName: customer?.name ?? reservation.customerName ?? '客户',
      customerPhone: customer?.phone ?? reservation.customerPhone ?? '',
      projectId: reservation.projectId,
      projectName: project?.name ?? reservation.projectName ?? '预约项目',
      beauticianId: reservation.beauticianId,
      beauticianName: beautician?.name ?? reservation.beauticianName ?? '待分配',
      storeId: reservation.storeId,
      storeName: store?.name ?? '当前门店',
      appointmentTime,
      duration: project?.duration ?? reservation.duration ?? 60,
      status: reservation.status,
      remark: reservation.remark ?? undefined,
      createdAt: this.toIso(reservation.createdAt),
      checkedInAt: this.toIso(reservation.checkedInAt) || undefined,
    };
  }

  private async mapServiceTask(task: any) {
    const [store, customer, project, beautician] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: task.storeId } }),
      this.prisma.customer.findUnique({ where: { id: task.customerId } }),
      this.prisma.project.findUnique({ where: { id: task.projectId } }),
      task.beauticianId ? this.prisma.beautician.findUnique({ where: { id: task.beauticianId } }) : Promise.resolve(null),
    ]);
    return {
      id: task.id,
      taskNo: task.taskNo,
      customerId: task.customerId,
      customerName: customer?.name ?? '客户',
      customerPhone: customer?.phone ?? '',
      projectId: task.projectId,
      projectName: project?.name ?? task.project?.name ?? '服务项目',
      beauticianId: task.beauticianId ?? 0,
      beauticianName: beautician?.name ?? '待分配',
      storeId: task.storeId,
      storeName: store?.name ?? '当前门店',
      appointmentTime: this.toIso(task.appointmentTime),
      duration: task.duration,
      status: task.status,
      startedAt: this.toIso(task.startedAt) || undefined,
      completedAt: this.toIso(task.completedAt) || undefined,
      remark: task.remark ?? undefined,
      consumptionItems: (task.consumptionItems as any[]) ?? [],
      images: task.images ?? [],
    };
  }

  // ─── Device Management ──────────────────────────────────────────────────────

  async deviceLogin(dto: DeviceLoginDto) {
    const device = await this.prisma.terminalDevice.findUnique({
      where: { deviceCode: dto.deviceCode },
      include: { store: true },
    });

    if (!device) {
      throw new UnauthorizedException('设备编码不存在');
    }

    if (device.status === 'disabled') {
      throw new UnauthorizedException('设备已被禁用');
    }

    if (device.activationCode !== dto.activationCode) {
      throw new UnauthorizedException('激活码错误');
    }

    // 更新设备状态为在线
    await this.prisma.terminalDevice.update({
      where: { id: device.id },
      data: {
        status: 'online',
        lastOnlineAt: new Date(),
        boundAt: device.boundAt || new Date(),
      },
    });

    // 生成设备专用 token
    const token = this.jwtService.sign(
      { deviceId: device.id, storeId: device.storeId, type: 'device' },
      { expiresIn: '30d' },
    );

    return {
      token,
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        name: device.name,
        model: device.model,
        storeId: device.storeId,
        storeName: device.store.name,
      },
    };
  }

  async deviceHeartbeat(deviceId: number, dto: DeviceHeartbeatDto) {
    const updateData: any = {
      status: 'online',
      lastOnlineAt: new Date(),
    };

    if (dto.appVersion) updateData.appVersion = dto.appVersion;
    if (dto.firmwareVersion) updateData.firmwareVersion = dto.firmwareVersion;
    if (dto.batteryLevel !== undefined) updateData.batteryLevel = dto.batteryLevel;
    if (dto.networkStatus) updateData.networkStatus = dto.networkStatus;

    const result = await this.prisma.terminalDevice.updateMany({
      where: { id: deviceId },
      data: updateData,
    });

    if (result.count === 0) {
      return { success: false, code: 'DEVICE_NOT_FOUND', serverTime: new Date().toISOString() };
    }

    return { success: true, serverTime: new Date().toISOString() };
  }

  async unbindDevice(deviceId: number) {
    await this.prisma.terminalDevice.update({
      where: { id: deviceId },
      data: { status: 'offline', boundAt: null },
    });

    return { success: true };
  }

  async getDeviceInfo(deviceId: number) {
    const device = await this.prisma.terminalDevice.findUnique({
      where: { id: deviceId },
      include: { store: true },
    });

    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    return {
      id: device.id,
      deviceCode: device.deviceCode,
      name: device.name,
      model: device.model,
      status: device.status,
      storeId: device.storeId,
      storeName: device.store.name,
      appVersion: device.appVersion,
      firmwareVersion: device.firmwareVersion,
      batteryLevel: device.batteryLevel,
      networkStatus: device.networkStatus,
      lastOnlineAt: device.lastOnlineAt,
      boundAt: device.boundAt,
    };
  }

  async getConfig() {
    return {
      version: '1.0.0',
      featureFlags: {
        skinTest: true,
        cardVerification: true,
        serviceConsumption: true,
        recommendationFeedback: true,
      },
      uploadLimits: {
        maxImageCount: 6,
        maxImageSizeMb: 8,
      },
      skinMetricKeys: ['moisture', 'oil', 'elasticity', 'sensitivity'],
      displayCopy: {
        welcomeTitle: '欢迎使用 Ami Aura Lite',
        serviceCompleteTitle: '服务已完成',
      },
    };
  }

  private getAuraRoleConfig(user: any, requestedRole?: string) {
    const roleKeys = new Set((user?.roles ?? []).map((item: any) => item.role?.key).filter(Boolean));
    const availableRoles = roleKeys.has('super_admin') || roleKeys.has('store_manager')
      ? ['manager', 'reception', 'beautician']
      : roleKeys.has('beautician')
        ? ['beautician']
        : ['reception'];
    const currentRole = requestedRole && availableRoles.includes(requestedRole) ? requestedRole : availableRoles[0] ?? 'reception';
    const actionMap: Record<string, string[]> = {
      manager: ['manager.dashboard', 'manager.staff', 'manager.customers', 'manager.inventory', 'reception.appointments', 'operation.cashier'],
      reception: [
        'reception.appointments',
        'operation.verify',
        'operation.register',
        'operation.cashier',
        'operation.card',
        'operation.recharge',
        'operation.print',
      ],
      beautician: ['beautician.schedule', 'beautician.customer', 'beautician.record', 'beautician.advice', 'operation.service-complete'],
    };
    const labelMap: Record<string, string> = {
      manager: '店长',
      reception: '前台',
      beautician: '美容师',
      'manager.dashboard': '经营',
      'manager.staff': '员工',
      'manager.customers': '客户增长',
      'manager.inventory': '库存',
      'reception.appointments': '预约',
      'operation.verify': '核销',
      'operation.register': '登记',
      'operation.cashier': '收银',
      'operation.card': '办卡',
      'operation.recharge': '充值',
      'operation.print': '打印',
      'operation.service-complete': '完成服务',
      'beautician.schedule': '我的预约',
      'beautician.customer': '客户档案',
      'beautician.record': '服务记录',
      'beautician.advice': '护理建议',
    };
    const iconMap: Record<string, string> = {
      'manager.dashboard': 'BarChart3',
      'manager.staff': 'Users',
      'manager.customers': 'Sparkles',
      'manager.inventory': 'PackageCheck',
      'reception.appointments': 'CalendarCheck',
      'operation.verify': 'CheckSquare',
      'operation.register': 'UserPlus',
      'operation.cashier': 'CreditCard',
      'operation.card': 'Wallet',
      'operation.recharge': 'Wallet',
      'operation.print': 'Printer',
      'operation.service-complete': 'CheckSquare',
      'beautician.schedule': 'CalendarCheck',
      'beautician.customer': 'Users',
      'beautician.record': 'FileText',
      'beautician.advice': 'HeartPulse',
    };
    const subtitles: Record<string, string> = {
      manager: '先看经营、风险和员工，再处理门店协同',
      reception: '围绕接待、预约、核销和收银快速处理',
      beautician: '只看自己的排班、客户和服务动作',
    };
    const permissions: Record<string, string[]> = {
      manager: [
        'aura:manager:view',
        'aura:customer:read',
        'aura:appointment:read',
        'aura:appointment:write',
        'aura:card:consume',
        'aura:cashier:create',
        'aura:card-order:create',
        'aura:recharge:create',
        'aura:inventory:read',
        'aura:staff:read',
      ],
      reception: [
        'aura:reception:view',
        'aura:customer:read',
        'aura:appointment:read',
        'aura:appointment:write',
        'aura:card:consume',
        'aura:cashier:create',
        'aura:card-order:create',
        'aura:recharge:create',
      ],
      beautician: ['aura:beautician:view', 'aura:customer:read', 'aura:appointment:read', 'aura:service-record:create'],
    };
    const availableActions = actionMap[currentRole];
    const roleDefinition = {
      role: currentRole,
      title: labelMap[currentRole],
      subtitle: subtitles[currentRole],
      quickActions: availableActions.map((action) => ({
        action,
        label: labelMap[action],
        icon: iconMap[action],
      })),
      availableActions,
    };

    return {
      currentRole,
      availableRoles,
      availableActions,
      quickActions: roleDefinition.quickActions,
      roleDefinition,
      permissions: permissions[currentRole],
      dataScopes: {
        store: 'own_store',
        customer: currentRole === 'beautician' ? 'served_customers' : 'own_store',
        order: currentRole === 'beautician' ? 'served_customers' : 'own_store',
        booking: currentRole === 'beautician' ? 'self' : 'own_store',
        inventory: currentRole === 'beautician' ? 'none' : 'own_store',
        report: currentRole === 'manager' ? 'own_store' : 'self',
        device: currentRole === 'beautician' ? 'current_device' : 'own_store',
      },
    };
  }

  async getBootstrap(storeId: number, userId?: number, requestedRole?: string) {
    const [store, stores, user, beauticians, projects, cards, products, config] = await Promise.all([
      this.getStore(storeId),
      this.prisma.store.findMany({ where: { deletedAt: null, status: 'active' }, orderBy: { id: 'asc' } }),
      userId
        ? this.prisma.user.findUnique({
            where: { id: userId },
            include: { roles: { include: { role: true } }, stores: true },
          })
        : Promise.resolve(null),
      this.prisma.beautician.findMany({ where: { storeId, status: 'active' }, include: { level: true }, take: 50 }),
      this.prisma.project.findMany({ where: { storeId, deletedAt: null, status: 'active' }, include: { type: true }, take: 80 }),
      this.prisma.card.findMany({ where: { status: 'active' }, take: 80 }),
      this.prisma.product.findMany({ where: { storeId, deletedAt: null, status: 'active' }, include: { category: true }, take: 120 }),
      this.getConfig(),
    ]);
    const role = this.getAuraRoleConfig(user, requestedRole);
    const storeDtos = stores.map((item) => ({
      id: item.id,
      name: item.name,
      address: item.address ?? '',
      skuCount: 0,
      totalValue: 0,
      healthScore: 100,
      mode: '独立',
    }));
    const currentUser = user
      ? {
          id: user.id,
          username: user.username,
          name: user.name,
          phone: user.phone ?? '',
          email: user.email ?? undefined,
          roles: user.roles.map((item) => item.role.key),
          permissions: [...new Set(user.roles.flatMap((item) => item.role.permissions))],
          storeIds: user.stores.map((item) => item.storeId),
        }
      : null;

    return {
      currentUser,
      currentStore: storeDtos.find((item) => item.id === storeId) ?? null,
      availableStores: storeDtos,
      ...role,
      store: storeDtos.find((item) => item.id === storeId) ?? null,
      stores: storeDtos,
      beauticians: beauticians.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone ?? '',
        level: item.level?.name ?? '美容师',
        specialties: ['面部护理', '身体护理'],
        status: item.status === 'active' ? '在职' : item.status,
        storeName: store.name,
        joinDate: item.createdAt.toISOString().slice(0, 10),
        createdAt: item.createdAt.toISOString(),
      })),
      projects: projects.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type?.name ?? '基础护理',
        duration: item.duration,
        price: this.toNumber(item.price),
        storeName: store.name,
        recommend: true,
        online: true,
        home: false,
        status: item.status === 'active',
        sort: item.id,
      })),
      cards: cards.map((item) => ({
        id: item.id,
        name: item.name,
        type: '次卡',
        totalTimes: item.totalTimes,
        price: this.toNumber(item.price),
        validDays: 365,
        storeName: store.name,
        status: item.status === 'active' ? '上架' : '下架',
        createdAt: item.createdAt.toISOString(),
        projects: Array.isArray(item.projects)
          ? (item.projects as any[]).map((project) => ({
              projectName: project.projectName ?? project.name ?? '护理项目',
              timesPerCard: project.timesPerCard ?? 1,
            }))
          : [],
      })),
      products: products.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        brand: item.brand ?? '',
        spec: item.spec ?? '',
        unit: item.unit ?? '件',
        costPrice: this.toNumber(item.costPrice),
        retailPrice: this.toNumber(item.retailPrice),
        shelfLife: item.shelfLife ?? 0,
        categoryId: item.categoryId ?? 0,
        categoryName: item.category?.name ?? '默认分类',
        supplier: item.supplier ?? '',
        minPurchaseQty: item.minPurchaseQty,
        status: item.status === 'active' ? '在售' : '停售',
      })),
      config,
      catalogVersion: `catalog-${storeId}-${Date.now()}`,
    };
  }

  async getCatalogSync(storeId: number, since?: string) {
    const bootstrap = await this.getBootstrap(storeId);
    return {
      since,
      catalogVersion: bootstrap.catalogVersion,
      projects: bootstrap.projects,
      cards: bootstrap.cards,
      products: bootstrap.products,
      beauticians: bootstrap.beauticians,
      config: bootstrap.config,
    };
  }

  // ─── Customer Operations ────────────────────────────────────────────────────

  async searchCustomers(storeId: number, keyword: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId,
        deletedAt: null,
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gender: true,
        memberLevel: true,
        lastVisitDate: true,
        visitCount: true,
      },
      take: 20,
      orderBy: { lastVisitDate: 'desc' },
    });

    return customers;
  }

  async quickCreateCustomer(storeId: number, dto: QuickCreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        storeId,
        name: dto.name,
        phone: dto.phone,
        gender: dto.gender,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        memberLevel: dto.memberLevel,
        skinCondition: dto.skinCondition,
        tags: dto.tags ?? [],
        remark: dto.remark,
        source: dto.source ?? 'terminal',
      },
    });

    return customer;
  }

  async getCustomerSummary(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        healthProfile: true,
        customerCards: {
          where: { status: 'active' },
          include: { card: true },
        },
      },
    });

    if (!customer || customer.deletedAt) {
      throw new NotFoundException('客户不存在');
    }

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      gender: customer.gender,
      memberLevel: customer.memberLevel,
      totalSpent: customer.totalSpent,
      visitCount: customer.visitCount,
      lastVisitDate: customer.lastVisitDate,
      skinType: customer.healthProfile?.skinType || customer.skinType,
      skinStatus: customer.healthProfile?.skinStatus,
      activeCards: customer.customerCards.map((cc) => ({
        id: cc.id,
        cardName: cc.cardName,
        remainingTimes: cc.remainingTimes,
        totalTimes: cc.totalTimes,
        expiryDate: cc.expiryDate,
      })),
      tags: customer.tags,
    };
  }

  async getCustomerHealthProfile(customerId: number) {
    const profile = await this.prisma.customerHealthProfile.findUnique({
      where: { customerId },
      include: { customer: { select: { name: true } } },
    });

    if (!profile) return undefined;

    return {
      id: profile.id,
      customerId: profile.customerId,
      name: profile.customer?.name ?? '',
      skinType: profile.skinType,
      skinStatus: profile.skinStatus ?? '',
      mainProblems: profile.mainProblems ?? '',
      allergyHistory: profile.allergyHistory ?? undefined,
      goals: profile.goals ?? undefined,
      recommendedCare: profile.recommendedCare ?? undefined,
      instrument: profile.instrument ?? undefined,
      lastCheck: profile.lastCheck.toISOString().slice(0, 10),
    };
  }

  async updateCustomerHealthProfile(customerId: number, dto: UpdateTerminalCustomerHealthProfileDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.deletedAt) throw new NotFoundException('客户不存在');

    const profile = await this.prisma.customerHealthProfile.upsert({
      where: { customerId },
      update: {
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        allergyHistory: dto.allergyHistory,
        goals: dto.goals,
        recommendedCare: dto.recommendedCare,
        instrument: dto.instrument,
        lastCheck: new Date(),
      },
      create: {
        customerId,
        skinType: dto.skinType ?? customer.skinType ?? customer.skinCondition ?? '待检测',
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        allergyHistory: dto.allergyHistory,
        goals: dto.goals,
        recommendedCare: dto.recommendedCare,
        instrument: dto.instrument,
      },
      include: { customer: { select: { name: true } } },
    });

    return {
      id: profile.id,
      customerId: profile.customerId,
      name: profile.customer?.name ?? customer.name,
      skinType: profile.skinType,
      skinStatus: profile.skinStatus ?? '',
      mainProblems: profile.mainProblems ?? '',
      allergyHistory: profile.allergyHistory ?? undefined,
      goals: profile.goals ?? undefined,
      recommendedCare: profile.recommendedCare ?? undefined,
      instrument: profile.instrument ?? undefined,
      lastCheck: profile.lastCheck.toISOString().slice(0, 10),
    };
  }

  async getCustomerConsumptionRecords(customerId: number, query: any) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where = { customerId };
    const [items, total] = await Promise.all([
      this.prisma.consumptionRecord.findMany({
        where,
        orderBy: { consumeTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { name: true, store: { select: { name: true } } } } },
      }),
      this.prisma.consumptionRecord.count({ where }),
    ]);

    const data = items.map((item) => ({
      id: item.id,
      customerId: item.customerId,
      userName: item.customer?.name ?? '',
      storeName: item.customer?.store?.name ?? '',
      consumeType: item.consumeType,
      consumeContent: item.consumeContent,
      payMethod: item.payMethod,
      amount: `￥${this.toNumber(item.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      campaign: item.campaign ?? '',
      consumeTime: item.consumeTime.toISOString().replace('T', ' ').slice(0, 16),
    }));

    return { items: data, data, total, page, pageSize };
  }

  async getCustomerBehaviorProfile(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        productOrders: { orderBy: { createdAt: 'desc' }, take: 20 },
        cardUsageRecords: { orderBy: { verifiedAt: 'desc' }, take: 20 },
        reservations: { include: { project: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 10 },
        customerCards: { where: { status: 'active' }, take: 5 },
      },
    });
    if (!customer || customer.deletedAt) throw new NotFoundException('客户不存在');

    const orderTotal = customer.productOrders.reduce((total, order) => total + this.toNumber(order.totalAmount), 0);
    const avgSpend = customer.productOrders.length ? Math.round(orderTotal / customer.productOrders.length) : 0;
    const preferredService = customer.cardUsageRecords[0]?.projectName ?? customer.reservations[0]?.project?.name ?? '待识别';

    return {
      customerId,
      name: customer.name,
      segment: customer.totalSpent && this.toNumber(customer.totalSpent) >= 5000 ? '高价值客户' : customer.memberLevel,
      skinType: customer.skinType ?? customer.skinCondition ?? '待检测',
      visitFrequency: customer.visitCount > 0 ? `累计到店 ${customer.visitCount} 次` : '暂无到店记录',
      avgSpend: `￥${avgSpend.toLocaleString()}`,
      preferredService,
      promotionSensitivity: customer.productOrders.length >= 3 ? '中等' : '待观察',
      repurchaseRate: customer.customerCards?.length ? '较高' : '待培养',
      loyalty: customer.memberLevel ?? '普通客户',
      seasonalTrend: '需结合后续订单持续观察',
    };
  }

  async getCustomerCards(customerId: number) {
    const cards = await this.prisma.customerCard.findMany({
      where: { customerId, status: 'active' },
      include: { card: true },
      orderBy: { expiryDate: 'asc' },
    });

    return cards.map((item) => ({
      id: item.id,
      customerId: item.customerId,
      cardId: item.cardId,
      cardName: item.cardName,
      totalTimes: item.totalTimes,
      remainingTimes: item.remainingTimes,
      expiryDate: item.expiryDate.toISOString(),
      applicableProjects: Array.isArray(item.card.projects)
        ? (item.card.projects as any[]).map((project) => project.projectName ?? project.name ?? '护理项目')
        : [],
      status: item.remainingTimes <= 0 ? 'used_up' : item.expiryDate < new Date() ? 'expired' : 'active',
    }));
  }

  async getCustomerRecommendations(customerId: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const projects = await this.prisma.project.findMany({
      where: { storeId: customer.storeId, deletedAt: null, status: 'active' },
      take: 3,
      orderBy: { id: 'asc' },
    });
    return projects.map((project, index) => ({
      id: project.id,
      customerId,
      type: 'project',
      title: project.name,
      reason: index === 0 ? '结合客户最近到店和肤质信息，优先推荐该护理项目。' : '可作为后续复购或加项建议。',
      targetId: project.id,
      confidence: 0.82 - index * 0.08,
      payload: { price: this.toNumber(project.price), duration: project.duration },
    }));
  }

  // ─── Service Tasks ──────────────────────────────────────────────────────────

  async listTasks(storeId: number, deviceId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);

    const tasks = await this.prisma.serviceTask.findMany({
      where: {
        storeId,
        OR: [
          ...(terminalDeviceId ? [{ deviceId: terminalDeviceId }] : []),
          { status: { in: ['pending', 'in_progress'] } },
        ],
        appointmentTime: { gte: today, lt: tomorrow },
      },
      include: { project: true },
      orderBy: { appointmentTime: 'asc' },
    });

    return Promise.all(tasks.map((task) => this.mapServiceTask(task)));
  }

  async getTaskById(taskId: number) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task) throw new NotFoundException('任务不存在');
    return this.mapServiceTask(task);
  }

  async createTask(storeId: number, deviceId: number, dto: CreateServiceTaskDto) {
    // 生成任务编号
    const taskNo = `T${Date.now().toString(36).toUpperCase()}`;
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);

    const task = await this.prisma.serviceTask.create({
      data: {
        taskNo,
        storeId,
        deviceId: terminalDeviceId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        beauticianId: dto.beauticianId,
        appointmentTime: dto.appointmentTime
          ? new Date(dto.appointmentTime)
          : new Date(),
        duration: dto.duration || 60,
        remark: dto.remark,
        status: 'pending',
      },
      include: { project: true },
    });

    return this.mapServiceTask(task);
  }

  async startTask(taskId: number, deviceId: number) {
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'pending') {
      throw new BadRequestException('只有待处理的任务可以开始');
    }

    const updated = await this.prisma.serviceTask.update({
      where: { id: taskId },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
        deviceId: terminalDeviceId,
      },
      include: { project: true },
    });
    return this.mapServiceTask(updated);
  }

  async completeTask(taskId: number, dto?: any) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const task = await tx.serviceTask.findUnique({
        where: { id: taskId },
      });

      if (!task) throw new NotFoundException('任务不存在');
      if (task.status !== 'in_progress') {
        throw new BadRequestException('只有进行中的任务可以完成');
      }

      const consumptionItems = Array.isArray(dto?.consumptionItems) ? dto.consumptionItems : [];
      const completedTask = await tx.serviceTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          ...(dto?.beauticianId ? { beauticianId: dto.beauticianId } : {}),
          ...(dto?.remark ? { remark: dto.remark } : {}),
          ...(dto?.consumptionItems ? { consumptionItems: dto.consumptionItems } : {}),
          ...(dto?.images ? { images: dto.images } : {}),
        },
        include: { project: true },
      });

      for (const item of consumptionItems) {
        await this.createStockMovementForItem(tx, task.storeId, item, 'service_consume', {
          type: 'service_task',
          id: task.id,
          no: task.taskNo,
          remark: dto?.remark,
        });
      }

      return completedTask;
    });
    return this.mapServiceTask(updated);
  }

  async cancelTask(taskId: number, reason?: string) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('任务不存在');
    if (task.status === 'completed') {
      throw new BadRequestException('已完成的任务不能取消');
    }

    const updated = await this.prisma.serviceTask.update({
      where: { id: taskId },
      data: { status: 'cancelled', ...(reason ? { remark: reason } : {}) },
      include: { project: true },
    });
    return this.mapServiceTask(updated);
  }

  // ─── Card Verification ──────────────────────────────────────────────────────

  async verifyCard(dto: VerifyCardDto) {
    const customerCard = await this.prisma.customerCard.findUnique({
      where: { id: dto.customerCardId },
      include: { card: true },
    });

    if (!customerCard) {
      throw new NotFoundException('卡项不存在');
    }

    if (dto.customerId && customerCard.customerId !== dto.customerId) {
      throw new BadRequestException('卡项不属于该客户');
    }

    if (customerCard.status !== 'active') {
      return { valid: false, reason: '卡项已停用' };
    }

    if (customerCard.expiryDate < new Date()) {
      return { valid: false, reason: '卡项已过期' };
    }

    if (customerCard.remainingTimes <= 0) {
      return { valid: false, reason: '卡项次数已用完' };
    }

    // 如果指定了项目，检查卡项是否包含该项目
    if (dto.projectId && customerCard.card.projects) {
      const projects = customerCard.card.projects as any[];
      const projectIncluded = projects.some(
        (p: any) => p.projectId === dto.projectId || p.id === dto.projectId,
      );
      if (!projectIncluded) {
        return { valid: false, reason: '该卡项不包含此项目' };
      }
    }

    return {
      valid: true,
      cardName: customerCard.cardName,
      remainingTimes: customerCard.remainingTimes,
      totalTimes: customerCard.totalTimes,
      expiryDate: customerCard.expiryDate,
    };
  }

  async consumeCard(dto: ConsumeCardDto, deviceId: number) {
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const beauticianId = dto.beauticianId && dto.beauticianId > 0 ? dto.beauticianId : undefined;
    const customerCard = await this.prisma.customerCard.findUnique({
      where: { id: dto.customerCardId },
      include: { card: true, customer: true },
    });

    if (!customerCard) {
      throw new NotFoundException('卡项不存在');
    }

    const customerId = dto.customerId ?? customerCard.customerId;

    if (dto.customerId && customerCard.customerId !== dto.customerId) {
      throw new BadRequestException('卡项不属于该客户');
    }

    if (customerCard.status !== 'active' || customerCard.expiryDate < new Date()) {
      throw new BadRequestException('卡项不可用');
    }

    const times = dto.times || 1;
    if (customerCard.remainingTimes < times) {
      throw new BadRequestException('剩余次数不足');
    }

    // 获取项目名称
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });

    // 扣减次数
    const updatedCard = await this.prisma.customerCard.update({
      where: { id: dto.customerCardId },
      data: { remainingTimes: customerCard.remainingTimes - times },
    });

    // 记录核销
    const record = await this.prisma.cardUsageRecord.create({
      data: {
        customerId,
        customerName: customerCard.customer.name,
        cardName: customerCard.cardName,
        projectName: project?.name || '未知项目',
        times,
        remainingTimes: updatedCard.remainingTimes,
        beauticianId,
        deviceId: terminalDeviceId,
      },
    });

    return {
      id: record.id,
      customerId,
      customerName: customerCard.customer.name,
      cardName: customerCard.cardName,
      projectName: project?.name || '未知项目',
      times,
      remainingTimes: updatedCard.remainingTimes,
      beauticianId,
      deviceId: terminalDeviceId,
      verifiedAt: record.verifiedAt,
    };
  }

  // ─── Cashier ────────────────────────────────────────────────────────────────

  async checkout(storeId: number, dto: CheckoutDto) {
    const subtotalAmount = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = Math.min(subtotalAmount, Math.max(0, this.toNumber(dto.discountAmount)));
    const totalAmount = Math.max(0, subtotalAmount - discountAmount);
    const store = await this.getStore(storeId);
    const normalizedItems = this.normalizeOrderItems(dto.items as any[]);
    const result = await this.prisma.$transaction(async (tx) => {
      const orderNo = `PO${Date.now().toString(36).toUpperCase()}`;
      const customer = dto.customerId ? await tx.customer.findUnique({ where: { id: dto.customerId } }) : null;
      const order = await tx.productOrder.create({
        data: {
          orderNo,
          customerId: dto.customerId,
          customerName: customer?.name,
          storeId,
          totalAmount,
          payMethod: this.getPaymentMethod(dto.payMethod),
          status: 'completed',
          items: dto.items as any,
          remark: dto.remark,
        },
      });

      for (const item of dto.items as any[]) {
        if (item.itemType === 'product' || item.productId) {
          await this.createStockMovementForItem(tx, storeId, item, 'sale_out', {
            type: 'product_order',
            id: order.id,
            no: order.orderNo,
            remark: dto.remark,
          });
        }
      }

      if (customer) {
        await tx.customer.update({
          where: { id: dto.customerId! },
          data: {
            totalSpent: { increment: totalAmount },
            visitCount: { increment: 1 },
            lastVisitDate: new Date(),
          },
        });

        await tx.consumptionRecord.create({
          data: {
            customerId: dto.customerId!,
            consumeType: '消费',
            consumeContent: normalizedItems.map((i) => `${i.itemType}#${i.itemId ?? ''}x${i.quantity}`).join(', '),
            payMethod: this.getPaymentMethod(dto.payMethod),
            amount: totalAmount,
          },
        });
      }

      return { order, customer };
    });
    const orderItems = await this.createOrderItems(this.prisma, result.order.id, dto.items as any[]);
    await this.createPaymentRecord(this.prisma, result.order.id, dto.payMethod, totalAmount);
    await this.applyMarketingAttribution(this.prisma, result.order, totalAmount);
    const responseItems = orderItems.length ? orderItems : normalizedItems;

    return {
      id: result.order.id,
      orderNo: result.order.orderNo,
      customerId: dto.customerId,
      customerName: result.customer?.name ?? '',
      customerPhone: result.customer?.phone ?? '',
      storeId,
      storeName: store.name,
      items: responseItems.map((item) => ({
        itemType: item.itemType,
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      totalAmount,
      status: 'completed',
      paymentMethod: dto.payMethod,
      createdAt: result.order.createdAt.toISOString(),
      paidAt: result.order.createdAt.toISOString(),
      completedAt: result.order.updatedAt.toISOString(),
      remark: result.order.remark ?? undefined,
    };
  }

  async completePayment(orderId: number, dto: any) {
    const amount = this.toNumber(dto.paidAmount ?? dto.amount);
    const order = await this.prisma.productOrder.update({
      where: { id: orderId },
      data: {
        status: 'completed',
        payMethod: this.getPaymentMethod(dto.paymentMethod),
      },
    });
    const paidAmount = amount || this.toNumber(order.totalAmount);
    await this.createPaymentRecord(this.prisma, order.id, dto.paymentMethod ?? order.payMethod, paidAmount, dto.transactionNo);
    await this.applyMarketingAttribution(this.prisma, order, paidAmount);
    const store = order.storeId ? await this.getStore(order.storeId) : null;
    return {
      id: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId ?? undefined,
      customerName: order.customerName ?? '',
      customerPhone: '',
      storeId: order.storeId ?? 0,
      storeName: store?.name ?? '当前门店',
      items: (order.items as any[]) ?? [],
      totalAmount: this.toNumber(dto.paidAmount ?? order.totalAmount),
      status: 'completed',
      paymentMethod: order.payMethod ?? dto.paymentMethod,
      createdAt: order.createdAt.toISOString(),
      paidAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      remark: order.remark ?? undefined,
    };
  }

  async getPaymentMethods() {
    return [
      { key: 'wechat', name: '微信支付' },
      { key: 'alipay', name: '支付宝' },
      { key: 'cash', name: '现金' },
      { key: 'card', name: '银行卡' },
      { key: 'member_balance', name: '会员余额' },
      { key: 'customer_card', name: '次卡抵扣' },
    ];
  }

  async createCardOrder(storeId: number, dto: CreateCardOrderDto) {
    const [store, customer, card] = await Promise.all([
      this.getStore(storeId),
      dto.customerId ? this.prisma.customer.findUnique({ where: { id: dto.customerId } }) : Promise.resolve(null),
      this.prisma.card.findUnique({ where: { id: dto.cardId } }),
    ]);
    if (!card) throw new NotFoundException('卡项不存在');
    const expireTime = new Date();
    expireTime.setDate(expireTime.getDate() + 365);
    const originalAmount = this.toNumber(card.price);
    const discountAmount = Math.min(originalAmount, Math.max(0, this.toNumber(dto.discountAmount)));
    const amount = Math.max(0, this.toNumber(dto.amount ?? originalAmount - discountAmount));
    const totalTimes = dto.totalTimes ?? card.totalTimes;
    const giftProjects = Array.isArray(dto.giftProjects) ? dto.giftProjects : [];
    const result = await this.prisma.$transaction(async (tx) => {
      const customerCard = dto.customerId
        ? await tx.customerCard.create({
            data: {
              customerId: dto.customerId,
              cardId: card.id,
              cardName: dto.cardName ?? card.name,
              totalTimes,
              remainingTimes: totalTimes,
              expiryDate: expireTime,
              status: 'active',
            },
          })
        : null;

      const orderNo = `CO${Date.now().toString(36).toUpperCase()}`;
      const order = await tx.productOrder.create({
        data: {
          orderNo,
          customerId: dto.customerId,
          customerName: customer?.name ?? dto.customerName,
          storeId,
          totalAmount: amount,
          payMethod: this.getPaymentMethod(dto.paymentMethod),
          status: 'completed',
          items: [{ itemType: 'card', itemId: card.id, quantity: 1, unitPrice: amount, discountAmount, giftProjects }],
          remark: `办卡：${card.name}`,
        },
      });

      if (dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: {
            totalSpent: { increment: amount },
            visitCount: { increment: 1 },
            lastVisitDate: new Date(),
          },
        });
      }
      return { customerCard, order };
    });
    await this.createOrderItems(this.prisma, result.order.id, [
      {
        itemType: 'card',
        itemId: card.id,
        name: card.name,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount,
        discount: discountAmount,
        giftProjects,
      },
    ]);
    await this.createPaymentRecord(this.prisma, result.order.id, dto.paymentMethod, amount, dto.transactionNo);
    await this.applyMarketingAttribution(this.prisma, result.order, amount);

    return {
      id: result.customerCard?.id ?? result.order.id,
      orderNo: result.order.orderNo,
      customerId: dto.customerId,
      customerName: customer?.name ?? dto.customerName,
      customerPhone: customer?.phone ?? dto.customerPhone ?? '',
      cardId: card.id,
      cardName: card.name,
      storeId,
      storeName: store.name,
      amount,
      discountAmount,
      giftProjects,
      totalTimes,
      remainingTimes: totalTimes,
      status: 'active',
      purchaseTime: new Date().toISOString(),
      expireTime: expireTime.toISOString(),
      paymentMethod: dto.paymentMethod,
    };
  }

  async createRechargeOrder(storeId: number, dto: CreateRechargeOrderDto) {
    const [store, customer] = await Promise.all([
      this.getStore(storeId),
      dto.customerId ? this.prisma.customer.findUnique({ where: { id: dto.customerId } }) : Promise.resolve(null),
    ]);
    if (!dto.customerId || !customer) throw new BadRequestException('充值必须选择有效客户');

    const amount = this.toNumber(dto.amount);
    const giftAmount = this.toNumber(dto.giftAmount ?? dto.discountAmount);
    const giftProjects = Array.isArray(dto.giftProjects) ? dto.giftProjects : [];
    const result = await this.prisma.$transaction(async (tx) => {
      const orderNo = `RO${Date.now().toString(36).toUpperCase()}`;
      const created = await tx.productOrder.create({
        data: {
          orderNo,
          customerId: dto.customerId,
          customerName: customer?.name ?? dto.customerName,
          storeId,
          totalAmount: amount,
          payMethod: this.getPaymentMethod(dto.paymentMethod),
          status: 'completed',
          items: [{ itemType: 'recharge', quantity: 1, unitPrice: amount, giftAmount, giftProjects }],
          remark: dto.remark ?? '会员充值',
        },
      });

      await tx.customer.update({
        where: { id: dto.customerId },
        data: {
          totalSpent: { increment: amount },
          visitCount: { increment: 1 },
          lastVisitDate: new Date(),
        },
      });
      await tx.consumptionRecord.create({
        data: {
          customerId: dto.customerId!,
          consumeType: '充值',
          consumeContent: `充值 ${amount}，赠送 ${giftAmount}${giftProjects.length ? `，赠送项目：${giftProjects.join('、')}` : ''}`,
          payMethod: this.getPaymentMethod(dto.paymentMethod),
          amount,
          campaign: dto.remark,
        },
      });

      const account = await tx.customerBalanceAccount.upsert({
        where: { customerId_storeId: { customerId: dto.customerId!, storeId } },
        update: {},
        create: {
          customerId: dto.customerId!,
          storeId,
          cashBalance: 0,
          giftBalance: 0,
          status: 'active',
        },
      });
      const cashBalanceBefore = this.toNumber(account.cashBalance);
      const giftBalanceBefore = this.toNumber(account.giftBalance);
      const cashBalanceAfter = cashBalanceBefore + amount;
      const giftBalanceAfter = giftBalanceBefore + giftAmount;
      const updatedAccount = await tx.customerBalanceAccount.update({
        where: { id: account.id },
        data: {
          cashBalance: cashBalanceAfter,
          giftBalance: giftBalanceAfter,
          status: 'active',
        },
      });
      const balanceTransaction = await tx.customerBalanceTransaction.create({
        data: {
          accountId: account.id,
          customerId: dto.customerId!,
          storeId,
          orderId: created.id,
          transactionNo: this.createSequenceNo('BAL'),
          type: 'recharge',
          amount,
          giftAmount,
          cashBalanceBefore,
          cashBalanceAfter,
          giftBalanceBefore,
          giftBalanceAfter,
          paymentMethod: this.getPaymentMethod(dto.paymentMethod),
          remark: dto.remark,
        },
      });

      return { order: created, balanceAccount: updatedAccount, balanceTransaction };
    });
    await this.createOrderItems(this.prisma, result.order.id, [
      { itemType: 'recharge', name: '会员充值', quantity: 1, unitPrice: amount, giftAmount, giftProjects },
    ]);
    await this.createPaymentRecord(this.prisma, result.order.id, dto.paymentMethod, amount, dto.transactionNo);
    await this.applyMarketingAttribution(this.prisma, result.order, amount);
    return {
      id: result.order.id,
      orderNo: result.order.orderNo,
      customerId: dto.customerId,
      customerName: customer?.name ?? dto.customerName,
      customerPhone: customer?.phone ?? dto.customerPhone ?? '',
      storeId,
      storeName: store.name,
      amount,
      giftAmount,
      giftProjects,
      cashBalance: this.toNumber(result.balanceAccount.cashBalance),
      giftBalance: this.toNumber(result.balanceAccount.giftBalance),
      balanceTransactionId: result.balanceTransaction.id,
      status: 'paid',
      paymentMethod: dto.paymentMethod,
      createdAt: result.order.createdAt.toISOString(),
      remark: dto.remark,
    };
  }

  async createPrintJob(storeId: number, dto: any) {
    const store = await this.getStore(storeId);
    const job = await this.prisma.printJob.create({
      data: {
        storeId,
        jobNo: this.createSequenceNo('PJ'),
        sourceType: dto.sourceType ?? 'custom',
        sourceId: dto.sourceId ? Number(dto.sourceId) : undefined,
        title: dto.title ?? 'Ami Aura Lite 小票',
        content: dto.content ?? '',
        copies: Number(dto.copies ?? 1),
        status: dto.status ?? 'completed',
        completedAt: dto.status === 'pending' ? undefined : new Date(),
      },
    });
    return {
      id: job.id,
      jobNo: job.jobNo,
      sourceType: job.sourceType,
      sourceId: job.sourceId ?? undefined,
      title: job.title,
      content: job.content,
      copies: job.copies,
      storeId,
      storeName: store.name,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    };
  }

  async getPrintJob(storeId: number, id: number) {
    const store = await this.getStore(storeId);
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId } });
    if (!job) throw new NotFoundException('打印任务不存在');
    return {
      id: job.id,
      jobNo: job.jobNo,
      sourceType: job.sourceType,
      sourceId: job.sourceId ?? undefined,
      title: job.title,
      content: job.content,
      copies: job.copies,
      storeId,
      storeName: store.name,
      status: job.status,
      errorMessage: job.errorMessage ?? undefined,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    };
  }

  async getCardUsageRecords(query: any) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: any = {};
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.cardName) where.cardName = { contains: query.cardName, mode: 'insensitive' };
    if (query.projectName) where.projectName = { contains: query.projectName, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.cardUsageRecord.findMany({
        where,
        orderBy: { verifiedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.cardUsageRecord.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  // ─── Skin Test ──────────────────────────────────────────────────────────────

  async createSkinTest(deviceId: number, dto: CreateSkinTestDto) {
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const skinTest = await this.prisma.skinTest.create({
      data: {
        customerId: dto.customerId,
        taskId: dto.taskId,
        deviceId: terminalDeviceId,
        images: dto.images || [],
        metrics: dto.metrics as any,
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        recommendationText: dto.recommendationText,
      },
    });

    // 同步更新客户健康档案的肤质信息
    await this.prisma.customerHealthProfile.upsert({
      where: { customerId: dto.customerId },
      update: {
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        lastCheck: new Date(),
      },
      create: {
        customerId: dto.customerId,
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
      },
    });

    return skinTest;
  }

  async getSkinTestHistory(customerId: number) {
    const tests = await this.prisma.skinTest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return tests;
  }

  async getSkinTests(customerId?: number) {
    return this.prisma.skinTest.findMany({
      where: customerId ? { customerId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getSkinTestById(id: number) {
    const skinTest = await this.prisma.skinTest.findUnique({ where: { id } });
    if (!skinTest) throw new NotFoundException('皮肤检测记录不存在');
    return skinTest;
  }

  async bindSkinTestCustomer(id: number, customerId: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('客户不存在');
    return this.prisma.skinTest.update({ where: { id }, data: { customerId } });
  }

  async getSkinTestRecommendations(id: number) {
    const skinTest = await this.getSkinTestById(id);
    if (!skinTest.customerId) return [];
    return [
      {
        id,
        customerId: skinTest.customerId,
        type: 'script',
        title: '护理建议',
        reason: skinTest.recommendationText || `当前肤质：${skinTest.skinType}，建议结合检测结果安排护理。`,
        confidence: 0.86,
        payload: {
          skinType: skinTest.skinType,
          mainProblems: skinTest.mainProblems,
        },
      },
    ];
  }

  // ─── Reservations ───────────────────────────────────────────────────────────

  async getTodayReservations(storeId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId,
        date: { gte: today, lt: tomorrow },
        status: { not: 'cancelled' },
      },
      orderBy: { startTime: 'asc' },
    });

    return Promise.all(reservations.map((reservation) => this.mapReservation(reservation)));
  }

  async createReservation(storeId: number, dto: any) {
    const appointment = new Date(dto.appointmentTime);
    if (Number.isNaN(appointment.getTime())) {
      throw new BadRequestException('预约时间无效');
    }
    const customer = dto.customerId
      ? await this.prisma.customer.findUnique({ where: { id: dto.customerId } })
      : await this.prisma.customer.create({
          data: {
            storeId,
            name: dto.customerName,
            phone: dto.customerPhone,
            gender: '女',
            source: 'terminal',
          },
        });
    if (!customer) throw new NotFoundException('客户不存在');
    const project = dto.projectId
      ? await this.prisma.project.findUnique({ where: { id: dto.projectId } })
      : await this.prisma.project.findFirst({ where: { storeId, deletedAt: null, status: 'active' } });
    if (!project) throw new BadRequestException('当前门店没有可预约项目');
    const startTime = appointment.toTimeString().slice(0, 5);
    const end = new Date(appointment);
    end.setMinutes(end.getMinutes() + (dto.duration ?? project.duration ?? 60));
    const reservation = await this.prisma.reservation.create({
      data: {
        storeId,
        customerId: customer.id,
        projectId: project.id,
        beauticianId: dto.beauticianId,
        date: appointment,
        startTime,
        endTime: end.toTimeString().slice(0, 5),
        status: 'pending',
        remark: dto.remark,
      },
    });
    return this.mapReservation(reservation);
  }

  async updateReservation(reservationId: number, dto: any) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    const updateData: any = {};
    let selectedProject: { id: number; duration?: number | null } | null = null;
    if (dto.status) updateData.status = dto.status;
    if (dto.beauticianId !== undefined) updateData.beauticianId = dto.beauticianId;
    if (dto.remark !== undefined) updateData.remark = dto.remark;
    if (dto.projectId !== undefined) {
      updateData.projectId = Number(dto.projectId);
      selectedProject = await this.prisma.project.findFirst({
        where: { id: updateData.projectId, storeId: reservation.storeId, deletedAt: null },
        select: { id: true, duration: true },
      });
      if (!selectedProject) throw new BadRequestException('RESERVATION_PROJECT_NOT_FOUND');
    } else if (dto.projectName) {
      const project = await this.prisma.project.findFirst({
        where: { storeId: reservation.storeId, name: { contains: dto.projectName }, deletedAt: null },
        select: { id: true, duration: true },
      });
      if (project) {
        selectedProject = project;
        updateData.projectId = project.id;
      }
    }
    if (dto.beauticianName && dto.beauticianId === undefined) {
      const beautician = await this.prisma.beautician.findFirst({
        where: { storeId: reservation.storeId, name: { contains: dto.beauticianName } },
      });
      if (beautician) updateData.beauticianId = beautician.id;
    }
    if (dto.appointmentTime || dto.duration !== undefined || selectedProject) {
      const appointment = dto.appointmentTime
        ? new Date(dto.appointmentTime)
        : new Date(`${this.toIso(reservation.date).slice(0, 10)}T${reservation.startTime || '00:00'}:00`);
      if (Number.isNaN(appointment.getTime())) throw new BadRequestException('预约时间无效');
      const duration = Number(dto.duration || selectedProject?.duration || 60);
      updateData.date = appointment;
      updateData.startTime = appointment.toTimeString().slice(0, 5);
      const end = new Date(appointment);
      end.setMinutes(end.getMinutes() + duration);
      updateData.endTime = end.toTimeString().slice(0, 5);
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: updateData,
    });
    return this.mapReservation(updated);
  }

  async confirmReservation(reservationId: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(reservation.status)) {
      throw new BadRequestException('当前预约状态不能确认');
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'confirmed' },
    });
    return this.mapReservation(updated);
  }

  async checkInReservation(reservationId: number) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (!['pending', 'confirmed'].includes(reservation.status)) {
      throw new BadRequestException('Reservation status cannot be checked in');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'checked_in',
        checkedInAt: new Date(),
      },
    });
    return this.mapReservation(updated);
  }

  async cancelReservation(reservationId: number, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['completed', 'cancelled'].includes(reservation.status)) {
      throw new BadRequestException('当前预约状态不能取消');
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'cancelled', remark: reason || reservation.remark },
    });
    return this.mapReservation(updated);
  }

  // Dashboard ──────────────────────────────────────────────────────────────

  async getInventoryStock(storeId: number, query: any) {
    const productIds =
      typeof query.productIds === 'string'
        ? query.productIds
            .split(',')
            .map((id: string) => Number(id))
            .filter(Boolean)
        : undefined;
    const store = await this.getStore(storeId);
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        deletedAt: null,
        ...(productIds?.length ? { id: { in: productIds } } : {}),
      },
      orderBy: { currentStock: 'asc' },
      take: 100,
    });
    return products.map((item) => {
      const currentStock = this.toNumber(item.currentStock);
      const safetyStock = this.toNumber(item.safetyStock);
      return {
        id: item.id,
        productName: item.name,
        sku: item.sku,
        currentStock,
        reserved: 0,
        availableStock: currentStock,
        safetyStock,
        maxStock: Math.max(safetyStock * 3, currentStock),
        status: currentStock <= 0 ? '缺货' : currentStock < safetyStock ? '低库存' : '正常',
        lastInboundDate: item.updatedAt.toISOString(),
        storeName: store.name,
      };
    });
  }

  async getInventoryAlerts(storeId: number) {
    const store = await this.getStore(storeId);
    const now = new Date();
    const alertBefore = new Date(now);
    alertBefore.setDate(alertBefore.getDate() + 30);

    const [products, batches] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        orderBy: { currentStock: 'asc' },
        take: 200,
      }),
      this.prisma.stockBatch.findMany({
        where: {
          product: { storeId, deletedAt: null },
          stock: { gt: 0 },
          expiryDate: { not: null, lte: alertBefore },
        },
        include: { product: true },
        orderBy: { expiryDate: 'asc' },
        take: 50,
      }),
    ]);

    const lowStock = products
      .filter((item) => this.toNumber(item.currentStock) <= this.toNumber(item.safetyStock))
      .map((item) => ({
        id: item.id,
        productName: item.name,
        name: item.name,
        sku: item.sku,
        currentStock: this.toNumber(item.currentStock),
        reserved: 0,
        availableStock: this.toNumber(item.currentStock),
        safetyStock: this.toNumber(item.safetyStock),
        maxStock: Math.max(this.toNumber(item.safetyStock) * 3, this.toNumber(item.currentStock)),
        minStock: this.toNumber(item.safetyStock),
        status: this.toNumber(item.currentStock) <= 0 ? '缺货' : '低库存',
        lastInboundDate: item.updatedAt.toISOString(),
        storeName: store.name,
      }));

    const expiring = batches.map((batch) => ({
      id: batch.id,
      urgency: batch.expiryDate && batch.expiryDate < now ? '已过期' : '临期',
      productName: batch.product.name,
      sku: batch.product.sku,
      batchNo: batch.batchNo,
      remainingDays: batch.expiryDate ? Math.ceil((batch.expiryDate.getTime() - now.getTime()) / 86400000) : 0,
      stock: this.toNumber(batch.stock),
      costAmount: this.toNumber(batch.stock) * this.toNumber(batch.product.costPrice),
      storeName: store.name,
      suggestion: batch.expiryDate && batch.expiryDate < now ? '报废' : '促销',
    }));

    const replenishment = lowStock.map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      currentStock: item.currentStock,
      forecast7Days: Math.max(item.safetyStock, 1),
      safetyStock: item.safetyStock,
      inTransit: 0,
      suggestedQty: Math.max(item.safetyStock * 2 - item.currentStock, item.safetyStock || 1),
      supplier: '默认供应商',
      estimatedAmount: Math.max(item.safetyStock * 2 - item.currentStock, item.safetyStock || 1) * 20,
      checked: false,
    }));

    return {
      lowStock,
      expiring,
      replenishment,
      summary: `当前有 ${lowStock.length} 项低库存，${expiring.length} 批临期库存。`,
      generatedAt: new Date().toISOString(),
      storeName: store.name,
    };
  }

  async getProjectBom(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { bomItems: { include: { product: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return {
      projectId: project.id,
      projectName: project.name,
      items: project.bomItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        standardQty: this.toNumber(item.standardQty),
        unit: item.unit,
      })),
    };
  }

  async createConsumptionRecord(dto: any, storeId?: number) {
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.consumptionRecord.create({
        data: {
          customerId: dto.customerId,
          consumeType: '服务消耗',
          consumeContent: JSON.stringify(dto.items ?? []),
          payMethod: 'service',
          amount: 0,
          campaign: dto.remark,
        },
      });

      if (storeId && Array.isArray(dto.items)) {
        for (const item of dto.items) {
          await this.createStockMovementForItem(tx, storeId, item, 'service_consume', {
            type: 'consumption_record',
            id: created.id,
            remark: dto.remark,
          });
        }
      }

      return created;
    });
    return { ...dto, id: record.id, createdAt: record.consumeTime.toISOString() };
  }

  async recordRecommendationEvent(storeId: number, deviceId: number | undefined, dto: any) {
    if (!dto.customerId) throw new BadRequestException('customerId is required');
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const event = await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: Number(dto.customerId),
        deviceId: terminalDeviceId,
        recommendationId: dto.recommendationId ? Number(dto.recommendationId) : undefined,
        eventType: dto.eventType ?? dto.type ?? 'feedback',
        taskId: dto.taskId ? Number(dto.taskId) : undefined,
        orderId: dto.orderId ? Number(dto.orderId) : undefined,
        note: dto.note ?? dto.remark,
        payload: dto,
      },
    });
    return { ...event, createdAt: event.createdAt.toISOString() };
  }

  async getPromotions(storeId?: number, query: any = {}) {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        status: 'active',
        OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          query.projectId ? { applicableProjectIds: { has: Number(query.projectId) } } : {},
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (promotions.length) {
      return promotions.map((promotion) => ({
        id: promotion.id,
        name: promotion.name,
        description: promotion.description ?? '',
        discountText: promotion.discountText,
        validUntil: promotion.endAt?.toISOString(),
        applicableProjectIds: promotion.applicableProjectIds,
      }));
    }

    return [
      {
        id: 1,
        name: '会员护理权益',
        description: '适用于到店护理客户的会员专属权益。',
        discountText: '到店咨询',
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        applicableProjectIds: [],
      },
    ];
  }

  async getDashboardStats(storeId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      todayOrders,
      todayTasks,
      todayReservations,
      todayNewCustomers,
    ] = await Promise.all([
      // 今日营收
      this.prisma.productOrder.aggregate({
        where: {
          storeId,
          status: 'completed',
          createdAt: { gte: today, lt: tomorrow },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // 今日服务任务
      this.prisma.serviceTask.groupBy({
        by: ['status'],
        where: {
          storeId,
          appointmentTime: { gte: today, lt: tomorrow },
        },
        _count: true,
      }),
      // 今日预约
      this.prisma.reservation.count({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
        },
      }),
      // 今日新客
      this.prisma.customer.count({
        where: {
          storeId,
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
    ]);

    const taskStats = todayTasks.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        acc.total += item._count;
        return acc;
      },
      { total: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 } as Record<string, number>,
    );

    return {
      revenue: {
        total: todayOrders._sum.totalAmount || 0,
        orderCount: todayOrders._count,
      },
      tasks: taskStats,
      reservations: todayReservations,
      newCustomers: todayNewCustomers,
    };
  }

  async getRoleDashboard(storeId: number, _requestedRole?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [store, customerTotal, orderStats, reservationCount, reservations, stockProducts, cardTotal, beauticians, schedules] =
      await Promise.all([
        this.getStore(storeId),
        this.prisma.customer.count({ where: { storeId, deletedAt: null } }),
        this.prisma.productOrder.aggregate({
          where: { storeId, status: 'completed' },
          _sum: { totalAmount: true },
          _count: true,
        }),
        this.prisma.reservation.count({
          where: {
            storeId,
            date: { gte: today, lt: tomorrow },
            status: { not: 'cancelled' },
          },
        }),
        this.prisma.reservation.findMany({
          where: {
            storeId,
            date: { gte: today, lt: tomorrow },
            status: { not: 'cancelled' },
          },
          orderBy: { startTime: 'asc' },
          take: 12,
        }),
        this.prisma.product.findMany({
          where: { storeId, deletedAt: null },
          select: { currentStock: true, safetyStock: true },
          take: 200,
        }),
        this.prisma.card.count({ where: { status: 'active' } }),
        this.prisma.beautician.findMany({
          where: { storeId, status: 'active' },
          include: { level: true },
          orderBy: { id: 'asc' },
          take: 8,
        }),
        this.prisma.schedule.findMany({
          where: { storeId, date: { gte: today, lt: tomorrow } },
          orderBy: [{ beauticianId: 'asc' }, { startTime: 'asc' }],
          take: 80,
        }),
      ]);

    const mappedReservations = await Promise.all(reservations.map((reservation) => this.mapReservation(reservation)));
    const lowStockTotal = stockProducts.filter((item) => this.toNumber(item.currentStock) <= this.toNumber(item.safetyStock)).length;
    const scheduleByBeautician = new Map<number, typeof schedules>();
    schedules.forEach((slot) => {
      const list = scheduleByBeautician.get(slot.beauticianId) ?? [];
      list.push(slot);
      scheduleByBeautician.set(slot.beauticianId, list);
    });

    const staff = beauticians.map((item) => {
      const slots = scheduleByBeautician.get(item.id) ?? [];
      const fallbackSlots = slots.length
        ? slots
        : [
            { startTime: '10:00', status: 'available' },
            { startTime: '11:30', status: 'available' },
            { startTime: '14:00', status: 'available' },
            { startTime: '16:00', status: 'available' },
          ];
      const todaySlots = fallbackSlots.map((slot: any) => ({
        time: slot.startTime,
        period: slot.startTime < '12:00' ? '上午' : '下午',
        available: slot.status === 'available',
      }));
      const busyCount = todaySlots.filter((slot) => !slot.available).length;
      const utilization = todaySlots.length ? `${Math.round((busyCount / todaySlots.length) * 100)}%` : '0%';
      const beautician = {
        id: item.id,
        name: item.name,
        phone: item.phone ?? '',
        level: item.level?.name ?? '美容师',
        specialties: ['面部护理', '身体护理'],
        status: '在职',
        storeName: store.name,
        joinDate: item.createdAt.toISOString().slice(0, 10),
        createdAt: item.createdAt.toISOString(),
      };
      return {
        title: '员工当天排班',
        subtitle: store.name,
        beautician,
        todaySlots,
        utilization,
        summary: `${item.name} 今日共有 ${todaySlots.length} 个排班时段，占用率 ${utilization}。`,
      };
    });

    return {
      manager: {
        title: '店长经营驾驶舱',
        subtitle: store.name,
        summary: `${store.name} 已接入 Ami_Core 数据，优先关注经营、预约、库存和员工协同。`,
        kpis: [
          { label: '客户总数', value: String(customerTotal) },
          { label: '预约待处理', value: String(reservationCount) },
          { label: '门店订单', value: String(orderStats._count) },
          { label: '低库存', value: String(lowStockTotal) },
          { label: '上架卡项', value: String(cardTotal) },
          { label: '总营业额', value: `￥${this.toNumber(orderStats._sum.totalAmount).toLocaleString()}` },
        ],
        risks: [
          lowStockTotal > 0 ? `${lowStockTotal} 项库存需要优先检查` : '库存暂无明显低库存风险',
          reservationCount > 0 ? `${reservationCount} 个今日预约需要跟进` : '今日暂无待处理预约',
          staff.length > 0 ? `${staff.length} 位员工已有终端排班数据` : '当前门店暂无员工排班数据',
        ],
        highlights: [
          `当前门店客户总数 ${customerTotal}`,
          `订单合计 ${orderStats._count} 笔，金额约 ￥${this.toNumber(orderStats._sum.totalAmount).toLocaleString()}`,
          `今日预约 ${reservationCount} 条`,
        ],
      },
      staff,
      reception: {
        title: '今日接待工作台',
        subtitle: store.name,
        items: mappedReservations,
        summary: reservationCount > 0 ? `当前共有 ${reservationCount} 条今日预约待处理。` : '今日暂无预约，请按需新增预约或接待散客。',
      },
    };
  }
}
