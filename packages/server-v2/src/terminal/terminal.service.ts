import {
  Injectable,
  Optional,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma, ServiceTaskStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { DiscountAllocationService } from '../orders/discount-allocation.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { CustomerProfileService } from '../customers/customer-profile.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { TerminalDashboardCacheService } from './terminal-dashboard-cache.service.js';
import { CardsService } from '../cards/cards.service.js';
import { collectAuraUserFieldScopes, resolveAuraAvailableRolesForUser } from './terminal-role-access.js';
import { formatBusinessDate, formatBusinessDateTime, toBusinessDateOnly } from '../common/utils/business-time.js';
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
import {
  CreateReservationDto,
  ReservationAvailabilityQueryDto,
  RescheduleReservationDto,
  UpdateReservationDto,
} from './dto/reservation.dto.js';
import { AdjustBalanceDto, ConsumeBalanceDto, RefundBalanceDto } from './dto/balance.dto.js';
import { CreateTerminalServiceRecordDto } from './dto/service-record.dto.js';
import { CreateTerminalAutomationDto, UpdateTerminalAutomationDto } from './dto/automation.dto.js';
import { QueryTerminalConversationsDto, SaveTerminalConversationDto } from './dto/conversation.dto.js';
import {
  ProvisionTerminalDeviceDto,
  QueryTerminalDevicesDto,
  UpdateTerminalDeviceDto,
} from './dto/terminal-device-admin.dto.js';
import {
  AssignTerminalFollowUpTaskDto,
  CompleteTerminalFollowUpTaskDto,
  CreateTerminalFollowUpTaskDto,
  QueryTerminalFollowUpTasksDto,
} from './dto/follow-up-task.dto.js';
import type {
  TerminalCustomerSelectQueryDto,
  TerminalCustomerSelectScene,
} from './dto/customer-select.dto.js';

type TerminalDashboardInsight = {
  title: string;
  severity: 'high' | 'medium' | 'low' | string;
  reason: string;
  action: string;
  relatedType?: string;
  relatedId?: number | string;
};

type TerminalDashboardInsights = {
  risks: TerminalDashboardInsight[];
  suggestions: TerminalDashboardInsight[];
};

type TerminalContextCustomerOptions = {
  keyword?: string;
  onlyWithActiveCards?: boolean;
  customerIds?: number[];
  limit?: number;
};

type TerminalCustomerSelectOptions = TerminalContextCustomerOptions & {
  scene?: TerminalCustomerSelectScene;
  onlyMyCustomers?: boolean;
  includeInactive?: boolean;
};

type TerminalCustomerSelectScope = {
  customerIds: number[];
  forcedEmpty?: boolean;
};

type TerminalCheckoutOrderKind = 'product' | 'project';

@Injectable()
export class TerminalService implements OnModuleInit, OnModuleDestroy {
  private automationScheduler?: NodeJS.Timeout;
  private automationScanRunning = false;
  private managerInsightCache = new Map<string, { expiresAt: number; value: TerminalDashboardInsights }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private aiService: AiService,
    private commissionService: CommissionService,
    private terminalDashboardCache: TerminalDashboardCacheService = new TerminalDashboardCacheService(),
    @Optional() private customerProfileService?: CustomerProfileService,
    @Optional() private discountAllocationService: DiscountAllocationService = new DiscountAllocationService(),
    @Optional() private cardsService?: CardsService,
    @Optional() private customersService?: CustomersService,
    @Optional() private ordersService?: OrdersService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.TERMINAL_AUTOMATION_SCHEDULER === 'disabled') return;
    this.automationScheduler = setInterval(() => {
      void this.runDueTerminalAutomations().catch((error) => {
        console.warn('Ami Core terminal automation due scan failed', error);
      });
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.automationScheduler) clearInterval(this.automationScheduler);
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private toNonNegativeStock(value: unknown): number {
    const stock = this.toNumber(value);
    return Number.isFinite(stock) ? Math.max(0, stock) : 0;
  }

  private buildInventoryShortageRemark(baseRemark: string | undefined, requestedQty: number, appliedQty: number) {
    if (appliedQty >= requestedQty) return baseRemark;
    const shortageRemark = `库存不足：本次申请 ${requestedQty}，实际扣减 ${appliedQty}，不足 ${requestedQty - appliedQty}`;
    return [baseRemark, shortageRemark].filter(Boolean).join('；');
  }

  private roundCurrency(value: number) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private buildCardPricingSnapshot(params: {
    card: any;
    paidAmount: number;
    totalTimes: number;
    giftTimes?: number;
    discountAmount?: number;
  }) {
    const totalTimes = Math.max(0, this.toNumber(params.totalTimes));
    const paidAmount = Math.max(0, this.toNumber(params.paidAmount));
    return {
      cardId: params.card?.id,
      cardName: params.card?.name,
      cardPrice: this.toNumber(params.card?.price),
      paidAmount,
      discountAmount: Math.max(0, this.toNumber(params.discountAmount)),
      totalTimes,
      giftTimes: Math.max(0, this.toNumber(params.giftTimes)),
      recognizedUnitValue: totalTimes > 0 ? this.roundCurrency(paidAmount / totalTimes) : 0,
      projects: Array.isArray(params.card?.projects) ? params.card.projects : [],
    };
  }

  private resolveCardRecognizedUnitValue(customerCard: any) {
    const unitValue = this.toNumber(customerCard?.recognizedUnitValue);
    if (unitValue > 0) return unitValue;
    const paidAmount = this.toNumber(customerCard?.paidAmount);
    const totalTimes = this.toNumber(customerCard?.totalTimes);
    if (paidAmount > 0 && totalTimes > 0) return this.roundCurrency(paidAmount / totalTimes);
    const cardPrice = this.toNumber(customerCard?.card?.price);
    const cardTimes = this.toNumber(customerCard?.card?.totalTimes ?? totalTimes);
    return cardPrice > 0 && cardTimes > 0 ? this.roundCurrency(cardPrice / cardTimes) : 0;
  }

  private toIso(value?: Date | string | null): string {
    if (!value) return '';
    return value instanceof Date ? value.toISOString() : String(value);
  }

  private toLocalDateText(value?: Date | string | null): string {
    return formatBusinessDate(value);
  }

  private resolveCardValidDays(card: any) {
    const validDays = this.toNumber(card?.validDays);
    return Number.isFinite(validDays) && validDays > 0 ? validDays : 365;
  }

  private serializeTerminalSaleCard(card: any) {
    const totalTimes = this.toNumber(card.totalTimes);
    return {
      id: card.id,
      name: card.name,
      type: card.type ?? '次卡',
      totalTimes,
      price: this.toNumber(card.price),
      validDays: this.resolveCardValidDays(card),
      storeId: card.storeId ?? card.store?.id ?? null,
      storeName: card.storeName ?? card.store?.name ?? (card.storeId ? '' : '全部门店'),
      status: card.status === '上架' || card.status === 'active' ? '上架' : '下架',
      createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
      projects: Array.isArray(card.projects)
        ? card.projects
            .map((project: any) =>
              typeof project === 'string'
                ? { projectName: project, timesPerCard: totalTimes || 1 }
                : {
                    projectName: project.projectName ?? project.name ?? '',
                    timesPerCard: this.toNumber(project.timesPerCard ?? project.totalCount ?? (totalTimes || 1)),
                  },
            )
            .filter((project: any) => project.projectName)
        : [],
    };
  }

  private async getTerminalSaleCards(storeId: number) {
    if (this.cardsService) {
      return this.cardsService.findSaleOptions({ storeId, limit: 80 });
    }
    const cards = await this.prisma.card.findMany({
      where: { status: 'active', OR: [{ storeId: null }, { storeId }] },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    });
    return cards.map((card) => this.serializeTerminalSaleCard(card));
  }

  private getTerminalConversationModel() {
    return (this.prisma as any).terminalConversation;
  }

  private getDateOnly(value?: string | Date | null) {
    if (!value) return toBusinessDateOnly();
    if (value instanceof Date) return toBusinessDateOnly(value);
    const raw = String(value).trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw.slice(0, 10);
    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid conversation date');
    return date;
  }

  private mapTerminalConversation(record: any) {
    return {
      id: record.id,
      deviceId: record.deviceId,
      storeId: record.storeId,
      role: record.role,
      operatorId: record.operatorId ?? null,
      date: this.toLocalDateText(record.date),
      messages: Array.isArray(record.messages) ? record.messages : [],
      messageCount: record.messageCount ?? 0,
      createdAt: this.toIso(record.createdAt),
      updatedAt: this.toIso(record.updatedAt),
      archivedAt: this.toIso(record.archivedAt) || null,
    };
  }

  private getUserRoleKeys(user: any): Set<string> {
    const roles = (user?.roles ?? [])
      .map((item: any) => item.role?.key)
      .filter((key: unknown): key is string => typeof key === 'string' && key.length > 0);
    return new Set<string>(roles);
  }

  private getUserPermissionList(user: any): string[] {
    const permissions = (user?.roles ?? [])
      .flatMap((item: any) => (Array.isArray(item.role?.permissions) ? item.role.permissions : []))
      .filter((permission: unknown): permission is string => typeof permission === 'string');
    return [...new Set<string>(permissions)];
  }

  private getAuraAvailableRolesForUser(user: any): string[] {
    if (!user) return ['reception'];
    return resolveAuraAvailableRolesForUser(user);
  }

  private hasTerminalRoleSignal(user: any) {
    return this.getAuraAvailableRolesForUser(user).length > 0;
  }

  private mapTerminalAuthUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      phone: user.phone ?? '',
      email: user.email ?? undefined,
      roles: [...this.getUserRoleKeys(user)],
      permissions: this.getUserPermissionList(user),
      fieldScopes: collectAuraUserFieldScopes(user),
      storeIds: (user.stores ?? []).map((item: any) => item.storeId),
      status: user.status,
    };
  }

  private mapTerminalBeautician(beautician: any, storeName?: string) {
    if (!beautician) return null;
    return {
      id: beautician.id,
      userId: beautician.userId ?? undefined,
      name: beautician.name,
      phone: beautician.phone ?? '',
      level: beautician.level?.name ?? '美容师',
      specialties: ['面部护理', '身体护理'],
      status: beautician.status === 'active' ? '在职' : beautician.status,
      storeId: beautician.storeId,
      storeName: storeName ?? beautician.store?.name ?? '当前门店',
      joinDate: formatBusinessDate(beautician.createdAt),
      createdAt: beautician.createdAt.toISOString(),
    };
  }

  private buildTerminalVisibleBeauticianWhere(
    storeId: number,
    extra: Prisma.BeauticianWhereInput = {},
  ): Prisma.BeauticianWhereInput {
    return {
      storeId,
      status: 'active',
      user: {
        is: {
          deletedAt: null,
          status: 'active',
          roles: { some: { role: { key: 'beautician' } } },
          stores: { some: { storeId } },
        },
      },
      ...extra,
    };
  }

  private mapTerminalUserOption(user: any, beauticianByUserId?: Map<number, any>, storeName?: string) {
    const labels: Record<string, string> = {
      manager: '店长',
      reception: '前台',
      beautician: '美容师',
    };
    const availableRoles = this.getAuraAvailableRolesForUser(user);
    const terminalAccess = availableRoles.length > 0;
    const defaultRole = availableRoles[0] ?? 'reception';
    const boundBeautician = beauticianByUserId?.get(user.id);
    return {
      ...this.mapTerminalAuthUser(user),
      availableRoles,
      defaultRole,
      roleLabel: terminalAccess ? availableRoles.map((role) => labels[role] ?? role).join(' / ') : '未配置终端权限',
      terminalAccess,
      disabled: !terminalAccess,
      disabledReason: terminalAccess ? undefined : '未配置智能终端权限',
      boundBeauticianId: boundBeautician?.id,
      boundBeauticianName: boundBeautician?.name,
      currentBeautician: boundBeautician ? this.mapTerminalBeautician(boundBeautician, storeName) : undefined,
    };
  }

  private async assertTerminalOperatorAllowed(storeId: number, operatorId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: operatorId,
        deletedAt: null,
        status: 'active',
        OR: [
          { stores: { some: { storeId } } },
          { roles: { some: { role: { key: { in: ['super_admin', 'store_manager'] } } } } },
        ],
      },
      include: { roles: { include: { role: true } }, stores: true },
    });
    if (!user) {
      throw new BadRequestException('当前账号无权使用此门店终端');
    }
    if (!this.hasTerminalRoleSignal(user)) {
      throw new BadRequestException('当前账号未配置智能终端权限');
    }
    return user;
  }

  private async assertStoreUserAllowed(storeId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        status: 'active',
        OR: [
          { stores: { some: { storeId } } },
          { roles: { some: { role: { key: { in: ['super_admin', 'store_manager'] } } } } },
        ],
      },
      include: { roles: { include: { role: true } }, stores: true },
    });
    if (!user) {
      throw new BadRequestException('销售人员不属于当前门店或已停用');
    }
    return user;
  }

  private async resolveConversationOperatorId(
    storeId: number,
    userId: number | undefined,
    requestedOperatorId?: number,
  ) {
    const operatorId = Number.isFinite(requestedOperatorId) ? requestedOperatorId : userId;
    if (!operatorId) return null;
    if (requestedOperatorId && requestedOperatorId !== userId) {
      await this.assertTerminalOperatorAllowed(storeId, operatorId);
    }
    return operatorId;
  }

  private async resolveTerminalBeautician(storeId: number, userId: number | undefined, requestedOperatorId?: number) {
    const operatorId = await this.resolveConversationOperatorId(storeId, userId, requestedOperatorId);
    if (!operatorId) {
      throw new BadRequestException('当前设备未绑定操作账号，无法识别美容师');
    }
    const beautician = await this.prisma.beautician.findFirst({
      where: {
        storeId,
        userId: operatorId,
        status: 'active',
      },
      include: { level: true, store: true, user: true },
    });
    if (!beautician) {
      throw new BadRequestException('当前账号未绑定美容师档案，请在管理端美容师管理中绑定账号');
    }
    return {
      operatorId,
      beautician,
      profile: {
        ...this.mapTerminalBeautician(beautician, beautician.store?.name),
        beauticianId: beautician.id,
        roleMode: requestedOperatorId && requestedOperatorId !== userId ? 'manager_delegate' : 'self',
      },
    };
  }

  private toTerminalDeviceId(deviceId?: number | null): number | undefined {
    return deviceId && deviceId > 0 ? deviceId : undefined;
  }

  private getDashboardCacheKey(parts: Array<string | number | undefined | null>) {
    return this.terminalDashboardCache.getKey(parts);
  }

  private async withTerminalDashboardCache<T>(
    keyParts: Array<string | number | undefined | null>,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    const key = this.getDashboardCacheKey(keyParts);
    const cached = this.terminalDashboardCache.get<T>(key);
    const endpoint = String(keyParts[0] ?? 'unknown');
    const storeId = keyParts[1];
    if (cached && cached.expiresAt > Date.now()) {
      this.logTerminalDashboardMetric(endpoint, storeId, Date.now() - startedAt, cached.value, true, 0);
      return cached.value;
    }
    try {
      const { value, queryCount } =
        typeof this.prisma.runWithQueryCounter === 'function'
          ? await this.prisma.runWithQueryCounter(loader)
          : { value: await loader(), queryCount: undefined };
      this.terminalDashboardCache.set(key, value, ttlMs);
      this.logTerminalDashboardMetric(endpoint, storeId, Date.now() - startedAt, value, false, queryCount);
      return value;
    } catch (error) {
      this.logTerminalDashboardMetric(endpoint, storeId, Date.now() - startedAt, undefined, false, undefined, error);
      throw error;
    }
  }

  private logTerminalDashboardMetric(
    endpoint: string,
    storeId: string | number | undefined | null,
    durationMs: number,
    value: unknown,
    cacheHit: boolean,
    dbQueryCount?: number,
    error?: unknown,
  ) {
    const responseSize = value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value), 'utf8');
    const candidate = error as { code?: unknown; status?: unknown; name?: unknown };
    const metric = {
      endpoint,
      storeId,
      durationMs,
      dbQueryCount,
      responseSize,
      cacheHit,
      errorCode: error ? String(candidate?.code ?? candidate?.status ?? candidate?.name ?? 'UNKNOWN') : undefined,
    };
    if (durationMs >= 1200 || error) {
      console.warn('Ami Core terminal dashboard metric', metric);
      return;
    }
    console.info('Ami Core terminal dashboard metric', metric);
  }

  private invalidateTerminalDashboardCache(storeId: number | undefined | null, prefixes: string[]) {
    this.terminalDashboardCache.invalidate(storeId, prefixes);
  }

  private invalidateReservationDashboardCache(storeId?: number | null, includeStaff = false) {
    this.invalidateTerminalDashboardCache(storeId, [
      'role',
      'manager',
      'today-reservations',
      ...(includeStaff ? ['staff-schedules'] : []),
    ]);
  }

  private invalidateCashierDashboardCache(storeId?: number | null) {
    this.invalidateTerminalDashboardCache(storeId, ['role', 'manager', 'customer-growth', 'cashier-context']);
  }

  private invalidateCardDashboardCache(storeId?: number | null) {
    this.invalidateTerminalDashboardCache(storeId, ['role', 'manager', 'customer-growth', 'card-verification-context']);
  }

  private invalidateCustomerDashboardCache(storeId?: number | null) {
    this.invalidateTerminalDashboardCache(storeId, [
      'role',
      'manager',
      'customer-growth',
      'cashier-context',
      'card-verification-context',
    ]);
  }

  private invalidateAutomationDashboardCache(storeId?: number | null) {
    this.invalidateTerminalDashboardCache(storeId, ['role', 'manager', 'customer-growth']);
  }

  private invalidateInventoryDashboardCache(storeId?: number | null) {
    this.invalidateTerminalDashboardCache(storeId, ['role', 'manager', 'inventory-alerts']);
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
      会员余额: 'member_balance',
      wechat: 'wechat',
      alipay: 'alipay',
      cash: 'cash',
      card: 'card',
      customer_card: 'customer_card',
      member_balance: 'member_balance',
    };
    return map[method || ''] || method || 'cash';
  }

  private createSequenceNo(prefix: string) {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private getTerminalAutomationMarker(storeId: number) {
    return `[terminal:${storeId}]`;
  }

  private getTerminalAutomationDraftMarker(draftId: string) {
    return `[draft:${draftId}]`;
  }

  private resolveTerminalAutomationRisk(dto: CreateTerminalAutomationDto) {
    const text = `${dto.title} ${dto.summary} ${dto.sourceText} ${dto.trigger} ${dto.audience} ${dto.action}`;
    const approvalPattern =
      /自动(?:发送|取消|扣次|核销|收款|创建收款|发放|下发)|扣次|核销|收款|取消预约|优惠|折扣|短信|微信|企微|小程序|支付|退款|储值|充值/;
    const highRiskPattern = /扣次|核销|收款|取消预约|退款|储值|充值|支付/;
    const requiresApproval = dto.riskLevel === 'high' || dto.requiresApproval || approvalPattern.test(text);
    const riskLevel =
      dto.riskLevel === 'high' || highRiskPattern.test(text) ? 'high' : requiresApproval ? 'medium' : dto.riskLevel;

    return { riskLevel, requiresApproval };
  }

  getTerminalAutomationTemplates() {
    return [
      {
        id: 'reservation_before_reminder',
        category: '预约',
        title: '预约前提醒',
        description: '预约开始前提醒顾客，并同步给前台查看。',
        command: '顾客预约前 2 小时生成提醒，前台可查看',
        defaultTrigger: '预约开始前 2 小时',
        defaultAudience: '今日及未来有预约的顾客',
        defaultAction: '生成顾客提醒草稿，并同步给前台查看',
        riskLevel: 'medium',
      },
      {
        id: 'reservation_late_reminder',
        category: '预约',
        title: '迟到提醒',
        description: '顾客超过预约时间仍未到店时，提醒前台电话确认。',
        command: '顾客超过预约时间 10 分钟未到店，提醒前台电话确认',
        defaultTrigger: '超过预约时间 10 分钟未到店',
        defaultAudience: '今日有预约且未到店顾客',
        defaultAction: '提醒前台电话确认，并标记需跟进',
        riskLevel: 'low',
      },
      {
        id: 'care_cycle_followup',
        category: '护理',
        title: '护理周期回访',
        description: '顾客做完护理后，到周期时提醒美容师回访。',
        command: '顾客做完补水类项目 25 天后，提醒美容师回访并预约下次护理',
        defaultTrigger: '服务完成后第 25 天上午 10:00',
        defaultAudience: '补水类项目顾客',
        defaultAction: '给负责美容师生成回访任务',
        riskLevel: 'low',
      },
      {
        id: 'card_remaining_expiry',
        category: '卡项',
        title: '次卡剩余/到期提醒',
        description: '次卡剩余次数少或即将到期时，生成前台跟进任务。',
        command: '次卡剩 1 次或 30 天内到期时，生成前台跟进任务',
        defaultTrigger: '次卡剩余 1 次，或 30 天内到期',
        defaultAudience: '持有有效次卡的顾客',
        defaultAction: '生成前台跟进任务，并推荐续卡/使用提醒话术',
        riskLevel: 'medium',
      },
      {
        id: 'low_stock_reminder',
        category: '库存',
        title: '低库存提醒',
        description: '商品低于安全库存时提醒店长补货。',
        command: '库存低于安全库存时提醒店长补货',
        defaultTrigger: '库存低于系统安全库存',
        defaultAudience: '门店库存商品',
        defaultAction: '给店长生成补货提醒，并展示当前库存和建议补货量',
        riskLevel: 'low',
      },
      {
        id: 'daily_closing_report',
        category: '经营',
        title: '每日收工报告',
        description: '每天闭店前汇总未收款、未完成服务和库存风险。',
        command: '每天 21:30 提醒我看未收款订单、未完成服务和库存风险',
        defaultTrigger: '每天 21:30',
        defaultAudience: '当前门店今日经营数据',
        defaultAction: '生成店长提醒卡片，汇总未支付订单、未完成服务任务和低库存商品',
        riskLevel: 'low',
      },
    ];
  }

  private parseTerminalAutomationSchedule(trigger: string) {
    const dailyTime = trigger.match(/每天\s*(\d{2}:\d{2})/);
    if (dailyTime) {
      return { type: 'daily', time: dailyTime[1], label: trigger };
    }
    const spokenTime = this.parseTerminalAutomationSpokenTime(trigger);
    if (spokenTime) {
      return { type: 'daily', time: spokenTime, label: trigger };
    }
    if (/闭店前|下班前|收工前/.test(trigger)) {
      return { type: 'daily', time: '21:30', label: trigger };
    }
    if (/预约/.test(trigger)) {
      return { type: 'event', event: 'reservation', offset: trigger, label: trigger };
    }
    if (/服务完成|护理|次卡|库存/.test(trigger)) {
      return { type: 'daily', time: '10:00', label: trigger };
    }
    return { type: 'manual', label: trigger };
  }

  private parseTerminalAutomationChineseHour(text: string) {
    const normalized = text.replace(/两/g, '二');
    const map: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };
    if (/^\d+$/.test(normalized)) return Number(normalized);
    if (normalized === '十') return 10;
    if (normalized.startsWith('十')) return 10 + (map[normalized.slice(1)] ?? 0);
    if (normalized.endsWith('十')) return (map[normalized.slice(0, 1)] ?? 0) * 10;
    if (normalized.includes('十')) {
      const [tens, ones] = normalized.split('十');
      return (map[tens] ?? 1) * 10 + (map[ones] ?? 0);
    }
    return map[normalized] ?? null;
  }

  private parseTerminalAutomationSpokenTime(trigger: string) {
    const matched = trigger.match(
      /(?:每天|每日)?\s*(上午|下午|晚上|晚间|早上|中午)?\s*([0-9一二三四五六七八九十两]{1,3})[:：点](半|\d{0,2})/,
    );
    if (!matched) return null;
    const [, period, hourText, minuteText] = matched;
    let hour = this.parseTerminalAutomationChineseHour(hourText) ?? Number(hourText);
    if (!Number.isFinite(hour)) return null;
    if ((period === '下午' || period === '晚上' || period === '晚间') && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    const minute = minuteText === '半' ? 30 : minuteText ? Number(minuteText) : 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private buildTerminalAutomationPayload(
    storeId: number,
    userId: number | undefined,
    dto: CreateTerminalAutomationDto,
  ) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const draftMarker = this.getTerminalAutomationDraftMarker(dto.draftId);
    const risk = this.resolveTerminalAutomationRisk(dto);
    const terminalMeta = {
      source: 'aura_lite_terminal',
      storeId,
      draftId: dto.draftId,
      sourceText: dto.sourceText,
      trigger: dto.trigger,
      audience: dto.audience,
      frequencyCap: dto.frequencyCap,
      riskLevel: risk.riskLevel,
      requiresApproval: risk.requiresApproval,
      createdByUserId: userId,
    };

    return {
      name: dto.title,
      description: `${dto.summary}\n\n${marker} ${draftMarker} [source:aura-lite]`,
      status: risk.requiresApproval ? 'draft' : 'enabled',
      executionType: 'auto',
      schedule: this.parseTerminalAutomationSchedule(dto.trigger),
      triggerRules: [
        {
          type: 'terminal_automation',
          params: terminalMeta,
        },
      ],
      ruleRelation: 'AND',
      actions: [
        {
          type: risk.requiresApproval ? 'approval' : 'staff_task',
          value: dto.action,
          channel: 'terminal',
          contentTemplate: dto.action,
          meta: terminalMeta,
        },
      ],
      targetCount: 0,
    };
  }

  private mapTerminalAutomationStrategy(strategy: any) {
    const triggerRule = Array.isArray(strategy.triggerRules) ? strategy.triggerRules[0] : undefined;
    const action = Array.isArray(strategy.actions) ? strategy.actions[0] : undefined;
    const meta = action?.meta ?? triggerRule?.params ?? {};
    return {
      id: strategy.id,
      name: strategy.name,
      title: strategy.name,
      summary: String(strategy.description ?? '').split('\n\n')[0],
      status: strategy.status,
      executionType: strategy.executionType,
      schedule: strategy.schedule,
      trigger: meta.trigger ?? strategy.schedule?.label ?? '',
      audience: meta.audience ?? '',
      action: action?.value ?? action?.contentTemplate ?? '',
      frequencyCap: meta.frequencyCap ?? '',
      riskLevel: meta.riskLevel ?? 'low',
      requiresApproval: Boolean(meta.requiresApproval),
      sourceText: meta.sourceText ?? '',
      createdAt: strategy.createdAt,
      updatedAt: strategy.updatedAt,
      lastExecutedAt: strategy.lastExecutedAt,
    };
  }

  private getTerminalAutomationMeta(strategy: any) {
    const triggerRule = Array.isArray(strategy.triggerRules) ? strategy.triggerRules[0] : undefined;
    const action = Array.isArray(strategy.actions) ? strategy.actions[0] : undefined;
    return action?.meta ?? triggerRule?.params ?? {};
  }

  private getStoreIdFromTerminalAutomation(strategy: any): number | null {
    const metaStoreId = Number(this.getTerminalAutomationMeta(strategy)?.storeId);
    if (Number.isFinite(metaStoreId) && metaStoreId > 0) return metaStoreId;
    const matched = String(strategy.description ?? '').match(/\[terminal:(\d+)\]/);
    return matched ? Number(matched[1]) : null;
  }

  private getStartOfLocalDay(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private parseClockMinutes(time?: string) {
    const matched = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!matched) return null;
    const hour = Number(matched[1]);
    const minute = Number(matched[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  private parseReservationReminderOffsetMinutes(text: string) {
    const hourMatch = text.match(/预约(?:开始)?前\s*(\d+)\s*小时/);
    if (hourMatch) return Number(hourMatch[1]) * 60;
    const minuteMatch = text.match(/预约(?:开始)?前\s*(\d+)\s*分钟/);
    if (minuteMatch) return Number(minuteMatch[1]);
    return 120;
  }

  private getReservationAppointmentDate(reservation: { date: Date | string; startTime?: string | null }) {
    const dateText = this.toLocalDateText(reservation.date);
    return new Date(`${dateText}T${reservation.startTime || '00:00'}:00`);
  }

  private isReservationReminderDue(
    reservation: { date: Date | string; startTime?: string | null },
    offsetMinutes: number,
    now = new Date(),
  ) {
    const appointmentAt = this.getReservationAppointmentDate(reservation);
    const remindAt = new Date(appointmentAt.getTime() - offsetMinutes * 60000);
    const windowEnd = new Date(remindAt.getTime() + 10 * 60000);
    return now >= remindAt && now < windowEnd;
  }

  private shouldRunTerminalAutomation(strategy: any, now = new Date()) {
    const schedule = strategy.schedule && typeof strategy.schedule === 'object' ? strategy.schedule : {};
    if (schedule.type === 'manual') return false;
    if (
      schedule.type !== 'event' &&
      strategy.lastExecutedAt &&
      new Date(strategy.lastExecutedAt).getTime() >= this.getStartOfLocalDay(now).getTime()
    ) {
      return false;
    }

    const dueMinutes =
      schedule.type === 'daily'
        ? this.parseClockMinutes(schedule.time)
        : schedule.type === 'event'
          ? this.parseClockMinutes(schedule.time ?? '00:00')
          : null;
    if (dueMinutes === null) return false;

    return now.getHours() * 60 + now.getMinutes() >= dueMinutes;
  }

  private async countTerminalAutomationTargets(storeId: number, strategy: any) {
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const text = `${mapped.title} ${mapped.summary} ${mapped.trigger} ${mapped.audience} ${mapped.action}`;
    const today = this.getStartOfLocalDay();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (/库存|补货|低库存/.test(text)) {
      const products = await this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { currentStock: true, safetyStock: true },
        take: 500,
      });
      return products.filter((item) => this.toNumber(item.currentStock) <= this.toNumber(item.safetyStock)).length;
    }

    if (/未收款|未付款|未支付|收款/.test(text)) {
      return this.prisma.productOrder.count({
        where: {
          storeId,
          status: { in: ['pending', 'pending_payment', 'unpaid'] },
        },
      });
    }

    if (/未完成服务|服务任务|护理回访|护理周期|服务完成/.test(text)) {
      return this.prisma.serviceTask.count({
        where: {
          storeId,
          status: { in: ['pending', 'in_progress'] },
        },
      });
    }

    if (/次卡|卡项|到期|续卡/.test(text)) {
      const inThirtyDays = new Date(today);
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);
      return this.prisma.customerCard.count({
        where: {
          status: 'active',
          customer: { storeId },
          OR: [{ remainingTimes: { lte: 1 } }, { expiryDate: { lte: inThirtyDays } }],
        },
      });
    }

    if (/迟到|预约|到店/.test(text)) {
      const reservations = await this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
          status: { in: ['pending', 'confirmed'] },
        },
        select: { date: true, startTime: true },
        take: 500,
      });
      if (/预约前|来店前|到店前/.test(text)) {
        const offsetMinutes = this.parseReservationReminderOffsetMinutes(text);
        return reservations.filter((item) => this.isReservationReminderDue(item, offsetMinutes)).length;
      }
      return reservations.length;
    }

    if (/生日/.test(text)) {
      const customers = await this.prisma.customer.findMany({
        where: { storeId, deletedAt: null, birthday: { not: null } },
        select: { birthday: true },
        take: 1000,
      });
      const target = new Date(today);
      target.setDate(target.getDate() + 7);
      const targetMonth = target.getMonth();
      const targetDate = target.getDate();
      return customers.filter(
        (item) => item.birthday?.getMonth() === targetMonth && item.birthday?.getDate() === targetDate,
      ).length;
    }

    return 1;
  }

  private async resolveTerminalAutomationTouchCustomers(storeId: number, strategy: any) {
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const text = `${mapped.title} ${mapped.summary} ${mapped.trigger} ${mapped.audience} ${mapped.action}`;
    const today = this.getStartOfLocalDay();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (/次卡|卡项|到期|续卡/.test(text)) {
      const inThirtyDays = new Date(today);
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);
      const cards = await this.prisma.customerCard.findMany({
        where: {
          status: 'active',
          customer: { storeId },
          OR: [{ remainingTimes: { lte: 1 } }, { expiryDate: { lte: inThirtyDays } }],
        },
        select: { customerId: true },
        take: 200,
      });
      return Array.from(new Set(cards.map((item) => item.customerId).filter(Boolean)));
    }

    if (/迟到|预约|到店/.test(text)) {
      const reservations = await this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
          status: { in: ['pending', 'confirmed'] },
        },
        select: { customerId: true, date: true, startTime: true },
        take: 200,
      });
      const targetReservations = /预约前|来店前|到店前/.test(text)
        ? reservations.filter((item) =>
            this.isReservationReminderDue(item, this.parseReservationReminderOffsetMinutes(text)),
          )
        : reservations;
      return Array.from(new Set(targetReservations.map((item) => item.customerId).filter(Boolean)));
    }

    if (/生日/.test(text)) {
      const customers = await this.prisma.customer.findMany({
        where: { storeId, deletedAt: null, birthday: { not: null } },
        select: { id: true, birthday: true },
        take: 1000,
      });
      const target = new Date(today);
      target.setDate(target.getDate() + 7);
      const targetMonth = target.getMonth();
      const targetDate = target.getDate();
      return customers
        .filter((item) => item.birthday?.getMonth() === targetMonth && item.birthday?.getDate() === targetDate)
        .map((item) => item.id);
    }

    if (/未完成服务|服务任务|护理回访|护理周期|服务完成/.test(text)) {
      const tasks = await this.prisma.serviceTask.findMany({
        where: {
          storeId,
          status: { in: ['pending', 'in_progress'] },
        },
        select: { customerId: true },
        take: 200,
      });
      return Array.from(new Set(tasks.map((item) => item.customerId).filter(Boolean)));
    }

    return [];
  }

  private parseTerminalAutomationFrequencyDays(frequencyCap?: string) {
    const matched = String(frequencyCap ?? '').match(/(\d+)\s*天/);
    const days = matched ? Number(matched[1]) : 7;
    return Number.isFinite(days) && days > 0 ? days : 7;
  }

  private async filterTerminalAutomationTouchFatigue(strategy: any, customerIds: number[]) {
    const delegate = (this.prisma as any).marketingAutomationTouch;
    if (!delegate?.findMany || !customerIds.length) return customerIds;
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const windowDays = this.parseTerminalAutomationFrequencyDays(mapped.frequencyCap);
    const since = new Date();
    since.setDate(since.getDate() - windowDays);
    const touches = await delegate.findMany({
      where: {
        strategyId: strategy.id,
        customerId: { in: customerIds },
        touchedAt: { gte: since },
      },
      select: { customerId: true },
      take: 1000,
    });
    const fatiguedCustomerIds = new Set(touches.map((touch: any) => touch.customerId));
    return customerIds.filter((customerId) => !fatiguedCustomerIds.has(customerId));
  }

  private async createTerminalAutomationTouches(execution: any, strategy: any, storeId: number) {
    const delegate = (this.prisma as any).marketingAutomationTouch;
    if (!delegate?.createMany) return 0;
    const customerIds = await this.resolveTerminalAutomationTouchCustomers(storeId, strategy);
    if (!customerIds.length) return 0;
    const eligibleCustomerIds = await this.filterTerminalAutomationTouchFatigue(strategy, customerIds);
    if (!eligibleCustomerIds.length) return 0;
    await delegate.createMany({
      data: eligibleCustomerIds.map((customerId) => ({
        executionId: execution.id,
        strategyId: strategy.id,
        customerId,
        channel: 'terminal',
        status: 'reached',
        touchedAt: new Date(),
        attributionWindowDays: 30,
      })),
      skipDuplicates: true,
    });
    return eligibleCustomerIds.length;
  }

  private buildTerminalAutomationExecutionInsight(
    strategy: any,
    execution: { triggeredCount: number; reachedCount: number },
  ) {
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const text = `${mapped.title} ${mapped.summary} ${mapped.trigger} ${mapped.audience} ${mapped.action}`;
    const hasTargets = execution.triggeredCount > 0;
    const targetText = hasTargets ? `本次命中 ${execution.triggeredCount} 个对象` : '本次暂无命中对象';
    const baseLines = [`触发规则：${mapped.trigger}`, `对象范围：${mapped.audience}`, `执行动作：${mapped.action}`];

    if (/库存|补货|低库存/.test(text)) {
      return {
        reason: `${targetText}，系统按当前库存和安全库存阈值完成扫描。`,
        nextActions: hasTargets
          ? ['查看低库存商品清单', '确认补货数量', '安排采购或调拨']
          : ['保持当前安全库存设置', '明天继续自动扫描'],
        primaryActionLabel: hasTargets ? '处理补货待办' : '查看库存规则',
        detailLines: baseLines,
      };
    }

    if (/未收款|未付款|未支付|收款/.test(text)) {
      return {
        reason: `${targetText}，系统已筛出仍处于待支付状态的订单。`,
        nextActions: hasTargets
          ? ['核对订单金额', '提醒前台跟进收款', '必要时联系顾客确认支付方式']
          : ['无需处理未收款', '闭店前继续自动复核'],
        primaryActionLabel: hasTargets ? '处理收款提醒' : '查看收款规则',
        detailLines: baseLines,
      };
    }

    if (/未完成服务|服务任务|护理回访|护理周期|服务完成/.test(text)) {
      return {
        reason: `${targetText}，系统按服务任务状态和护理周期完成筛选。`,
        nextActions: hasTargets
          ? ['查看待回访顾客', '分配美容师跟进', '记录回访结果或预约意向']
          : ['无需新增回访', '继续按护理周期自动扫描'],
        primaryActionLabel: hasTargets ? '处理回访待办' : '查看回访规则',
        detailLines: baseLines,
      };
    }

    if (/次卡|卡项|到期|续卡/.test(text)) {
      return {
        reason: `${targetText}，系统按剩余次数和到期时间完成筛选。`,
        nextActions: hasTargets
          ? ['查看即将到期卡项', '生成续卡/使用提醒话术', '安排前台跟进']
          : ['无需处理卡项风险', '继续按频控自动扫描'],
        primaryActionLabel: hasTargets ? '处理卡项待办' : '查看卡项规则',
        detailLines: baseLines,
      };
    }

    if (/迟到|预约|到店/.test(text)) {
      return {
        reason: `${targetText}，系统按今日预约状态完成检查。`,
        nextActions: hasTargets
          ? ['查看预约名单', '提醒前台电话确认', '必要时标记迟到/未到店']
          : ['当前预约无需处理', '下一轮继续按预约时间扫描'],
        primaryActionLabel: hasTargets ? '处理预约提醒' : '查看预约规则',
        detailLines: baseLines,
      };
    }

    if (/生日/.test(text)) {
      return {
        reason: `${targetText}，系统按生日提前提醒规则完成筛选。`,
        nextActions: hasTargets
          ? ['预览生日关怀话术', '确认优惠或祝福内容', '安排员工触达顾客']
          : ['暂无生日关怀对象', '保持生日信息完整'],
        primaryActionLabel: hasTargets ? '处理关怀待办' : '查看生日规则',
        detailLines: baseLines,
      };
    }

    return {
      reason: `${targetText}，系统已按当前自动化规则完成扫描。`,
      nextActions: hasTargets
        ? ['查看命中对象', '确认提醒内容', '安排员工跟进']
        : ['暂无待处理事项', '继续按规则自动扫描'],
      primaryActionLabel: hasTargets ? '处理自动化待办' : '查看自动化规则',
      detailLines: baseLines,
    };
  }

  private async executeTerminalAutomationStrategy(strategy: any, storeId: number): Promise<any>;
  private async executeTerminalAutomationStrategy(
    strategy: any,
    storeId: number,
    options: { skipWhenNoTargets: true },
  ): Promise<any | null>;
  private async executeTerminalAutomationStrategy(
    strategy: any,
    storeId: number,
    options?: { skipWhenNoTargets?: boolean },
  ) {
    const targetCount = await this.countTerminalAutomationTargets(storeId, strategy);
    if (targetCount === 0 && options?.skipWhenNoTargets) return null;

    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const message =
      targetCount > 0
        ? `${mapped.title} 已到达触发时间，命中 ${targetCount} 个对象。动作：${mapped.action}`
        : `${mapped.title} 已到达触发时间，本次暂无命中对象。`;

    const execution = await this.prisma.marketingAutomationExecution.create({
      data: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        status: 'success',
        triggeredCount: targetCount,
        reachedCount: 0,
        channel: 'terminal',
        message,
      },
    });

    const reachedCount = await this.createTerminalAutomationTouches(execution, strategy, storeId);
    const finalExecution =
      reachedCount === execution.reachedCount
        ? execution
        : await this.prisma.marketingAutomationExecution.update({
            where: { id: execution.id },
            data: { reachedCount },
          });

    await this.prisma.marketingAutomationStrategy.update({
      where: { id: strategy.id },
      data: {
        lastExecutedAt: new Date(),
        targetCount,
      },
    });

    return finalExecution;
  }

  private async createFailedTerminalAutomationExecution(strategy: any, error: unknown) {
    const message = error instanceof Error ? error.message : '自动化执行失败，请稍后复核';
    return this.prisma.marketingAutomationExecution.create({
      data: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        status: 'failed',
        triggeredCount: 0,
        reachedCount: 0,
        channel: 'terminal',
        message: `自动化执行失败：${message}`,
      },
    });
  }

  private normalizeOrderItems(rawItems: any[] = []) {
    return rawItems.map((item) => {
      const quantity = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
      const unitPrice = this.toNumber(item.unitPrice ?? item.price ?? item.amount);
      const discount = this.toNumber(item.totalDiscountAmount ?? item.discount);
      const subtotal = this.toNumber(item.subtotal ?? quantity * unitPrice - discount);
      const itemType = String(item.itemType ?? item.type ?? 'product');
      const itemId = item.itemId ?? item.productId ?? item.projectId ?? item.cardId;
      return {
        itemType,
        itemId: itemId === undefined || itemId === null ? undefined : Number(itemId),
        name: String(
          item.name ?? item.productName ?? item.projectName ?? item.cardName ?? `${itemType}#${itemId ?? ''}`,
        ),
        quantity,
        unitPrice,
        listAmount: this.toNumber(item.listAmount) || quantity * unitPrice,
        subtotal,
        discount,
        itemDiscountAmount: this.toNumber(item.itemDiscountAmount),
        orderAllocatedDiscountAmount: this.toNumber(item.orderAllocatedDiscountAmount),
        totalDiscountAmount: this.toNumber(item.totalDiscountAmount ?? discount),
        netAmount: this.toNumber(item.netAmount ?? subtotal),
        discountSource: item.discountSource,
        allocationMethod: item.allocationMethod,
        discountPayload: item.discountPayload,
        isGift: Boolean(item.isGift),
        eligibleForOrderDiscount: item.eligibleForOrderDiscount,
        beauticianId: this.toNumber(item.beauticianId) || undefined,
        beauticianName: item.beauticianName ? String(item.beauticianName).trim() : undefined,
        payload: item,
      };
    });
  }

  private async resolveOrderItemBeauticianIds(storeId: number, rawItems: any[] = [], tx: any = this.prisma) {
    const names = [
      ...new Set(
        rawItems
          .filter((item) => !this.toNumber(item?.beauticianId) && item?.beauticianName)
          .map((item) => String(item.beauticianName).trim())
          .filter(Boolean),
      ),
    ];
    if (!names.length) return rawItems;

    const beauticians = await tx.beautician.findMany({
      where: {
        storeId,
        status: 'active',
        OR: names.map((name) => ({ name: { contains: name } })),
      },
      select: { id: true, name: true },
    });
    const beauticianByName = new Map<string, number>();
    for (const name of names) {
      const matched = beauticians.find((beautician: any) => beautician.name === name) ?? beauticians.find((beautician: any) => beautician.name?.includes(name));
      if (matched?.id) beauticianByName.set(name, matched.id);
    }

    return rawItems.map((item) => {
      const beauticianId = this.toNumber(item?.beauticianId);
      const beauticianName = item?.beauticianName ? String(item.beauticianName).trim() : '';
      if (beauticianId || !beauticianName) return item;
      const matchedId = beauticianByName.get(beauticianName);
      return matchedId ? { ...item, beauticianId: matchedId } : item;
    });
  }

  private isProductOrderItemType(itemType?: string) {
    return ['product', 'goods'].includes(String(itemType ?? '').toLowerCase());
  }

  private getCheckoutItemKind(itemType?: string): TerminalCheckoutOrderKind {
    return String(itemType ?? '').toLowerCase() === 'project' ? 'project' : 'product';
  }

  private getCheckoutOrderKindSuffix(kind: TerminalCheckoutOrderKind) {
    return kind === 'project' ? 'S' : 'G';
  }

  private summarizeCheckoutItems(items: any[]) {
    const round = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const listAmount = round(items.reduce((sum, item) => sum + this.toNumber(item.listAmount), 0));
    const itemDiscountAmount = round(items.reduce((sum, item) => sum + this.toNumber(item.itemDiscountAmount), 0));
    const orderDiscountAmount = round(items.reduce((sum, item) => sum + this.toNumber(item.orderAllocatedDiscountAmount), 0));
    const totalDiscountAmount = round(items.reduce((sum, item) => sum + this.toNumber(item.totalDiscountAmount ?? item.discount), 0));
    const netAmount = round(items.reduce((sum, item) => sum + this.toNumber(item.netAmount ?? item.subtotal), 0));
    return {
      listAmount,
      itemDiscountAmount,
      orderDiscountAmount,
      totalDiscountAmount,
      netAmount,
      totalAmount: netAmount,
    };
  }

  private groupCheckoutItemsByKind(items: any[]) {
    const grouped = new Map<TerminalCheckoutOrderKind, any[]>();
    for (const item of items) {
      const kind = this.getCheckoutItemKind(item.itemType);
      const list = grouped.get(kind) ?? [];
      list.push(item);
      grouped.set(kind, list);
    }
    return Array.from(grouped.entries()).map(([kind, orderItems]) => ({ kind, items: orderItems }));
  }

  private async attachProductCostSnapshots(
    tx: any,
    storeId: number | undefined,
    items: any[],
  ) {
    const productIds = [
      ...new Set(
        items
          .filter((item) => this.isProductOrderItemType(item.itemType) && item.itemId)
          .map((item) => Number(item.itemId))
          .filter(Boolean),
      ),
    ];
    if (!productIds.length) return items;

    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        ...(storeId ? { storeId } : {}),
        deletedAt: null,
      },
      select: { id: true, costPrice: true },
    });
    const costByProductId = new Map(products.map((product: any) => [product.id, this.toNumber(product.costPrice)]));
    const capturedAt = new Date().toISOString();

    return items.map((item) => {
      if (!this.isProductOrderItemType(item.itemType) || !item.itemId) return item;
      const costPrice = this.toNumber(costByProductId.get(Number(item.itemId)));
      const quantity = this.toNumber(item.quantity ?? 1) || 1;
      return {
        ...item,
        payload: {
          ...(item.payload && typeof item.payload === 'object' ? item.payload : {}),
          costPrice,
          productCostPrice: costPrice,
          costAmount: costPrice * quantity,
          productCostAmount: costPrice * quantity,
          costSource: 'product_master',
          costCapturedAt: capturedAt,
        },
      };
    });
  }

  private isQuestionPlaceholder(value: unknown) {
    const text = String(value ?? '').trim();
    return /^\?+(?:\s*x\s*\d+)?$/i.test(text);
  }

  private async resolveOrderItemNames(rawItems: any[] = [], tx: any = this.prisma) {
    const items = this.normalizeOrderItems(rawItems);
    if (!items.length) return items;

    const projectIds = new Set<number>();
    const productIds = new Set<number>();
    const cardIds = new Set<number>();
    for (const item of items) {
      if (!item.itemId) continue;
      const type = String(item.itemType ?? '').toLowerCase();
      if (type === 'project') projectIds.add(item.itemId);
      if (type === 'product') productIds.add(item.itemId);
      if (type === 'card') cardIds.add(item.itemId);
    }

    const [projects, products, cards] = await Promise.all([
      projectIds.size
        ? tx.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, name: true } })
        : [],
      productIds.size
        ? tx.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, name: true } })
        : [],
      cardIds.size ? tx.card.findMany({ where: { id: { in: [...cardIds] } }, select: { id: true, name: true } }) : [],
    ]);

    const projectNameById = new Map<number, string>(projects.map((item: any) => [Number(item.id), String(item.name ?? '')]));
    const productNameById = new Map<number, string>(products.map((item: any) => [Number(item.id), String(item.name ?? '')]));
    const cardNameById = new Map<number, string>(cards.map((item: any) => [Number(item.id), String(item.name ?? '')]));

    return items.map((item) => {
      const type = String(item.itemType ?? '').toLowerCase();
      const resolvedName =
        (type === 'project' && item.itemId ? projectNameById.get(item.itemId) : undefined) ||
        (type === 'product' && item.itemId ? productNameById.get(item.itemId) : undefined) ||
        (type === 'card' && item.itemId ? cardNameById.get(item.itemId) : undefined);
      if (resolvedName) return { ...item, name: resolvedName };
      if (this.isQuestionPlaceholder(item.name)) return { ...item, name: `${item.itemType}#${item.itemId ?? ''}` };
      return item;
    });
  }

  private async createOrderItems(tx: any, orderId: number, rawItems: any[] = []) {
    const order = await tx.productOrder?.findUnique?.({ where: { id: orderId }, select: { storeId: true } });
    const resolvedRawItems = order?.storeId ? await this.resolveOrderItemBeauticianIds(Number(order.storeId), rawItems, tx) : rawItems;
    const normalized = await this.resolveOrderItemNames(resolvedRawItems, tx);
    const items = await this.attachProductCostSnapshots(tx, this.toNumber(order?.storeId) || undefined, normalized);
    if (!items.length) return items;

    try {
      await tx.orderItem.createMany({
        data: items.map((item, index) => ({
          orderId,
          itemType: item.itemType,
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          listAmount: item.listAmount,
          subtotal: item.subtotal,
          discount: item.discount,
          itemDiscountAmount: item.itemDiscountAmount,
          orderAllocatedDiscountAmount: item.orderAllocatedDiscountAmount,
          totalDiscountAmount: item.totalDiscountAmount,
          netAmount: item.netAmount,
          discountSource: item.discountSource,
          allocationMethod: item.allocationMethod,
          discountPayload: item.discountPayload,
          isGift: item.isGift,
          eligibleForOrderDiscount: item.eligibleForOrderDiscount,
          beauticianId: this.toNumber(resolvedRawItems[index]?.beauticianId) || undefined,
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

  private async calculateTerminalCommissions(input: {
    storeId: number;
    orderId: number;
    salesUserId?: number;
    beauticianId?: number;
    isDesignated?: boolean;
    items: Array<{ itemType: string; itemId?: number; beauticianId?: number | null; subtotal: number; orderItemId?: number }>;
  }) {
    try {
      const records: any[] = [];
      const salesUserId = this.toNumber(input.salesUserId) || undefined;
      const cardSaleItems = salesUserId ? input.items.filter((item) => item.itemType === 'card') : [];
      if (salesUserId && cardSaleItems.length) {
        const itemRecords = await this.commissionService.calculateOrderCommissions({
          storeId: input.storeId,
          orderId: input.orderId,
          staffUserId: salesUserId,
          items: cardSaleItems,
        });
        records.push(...itemRecords);
      }

      const beauticianCommissionItems = input.items.filter((item) => !(salesUserId && item.itemType === 'card'));
      const fallbackBeauticianId = this.toNumber(input.beauticianId) || undefined;
      const beauticianIds = [
        ...new Set(
          beauticianCommissionItems
            .map((item) => this.toNumber(item.beauticianId) || fallbackBeauticianId)
            .filter((item: number | undefined): item is number => Boolean(item)),
        ),
      ];
      if (!beauticianIds.length) return records;

      const select = { id: true, levelId: true, userId: true };
      const beauticians =
        typeof this.prisma.beautician?.findMany === 'function'
          ? await this.prisma.beautician.findMany({
              where: { id: { in: beauticianIds }, storeId: input.storeId },
              select,
            })
          : typeof this.prisma.beautician?.findFirst === 'function'
            ? (
                await Promise.all(
                  beauticianIds.map((id) =>
                    this.prisma.beautician.findFirst({ where: { id, storeId: input.storeId }, select }),
                  ),
                )
              ).filter(Boolean)
            : [];
      const beauticianById = new Map<number, { id: number; levelId?: number | null; userId?: number | null }>(
        beauticians.map((beautician: any) => [beautician.id, beautician]),
      );

      for (const item of beauticianCommissionItems) {
        const itemBeauticianId = this.toNumber(item.beauticianId) || fallbackBeauticianId;
        if (!itemBeauticianId) continue;
        const beautician = beauticianById.get(itemBeauticianId);
        if (!beautician?.userId) continue;
        const itemRecords = await this.commissionService.calculateOrderCommissions({
          storeId: input.storeId,
          orderId: input.orderId,
          staffUserId: beautician.userId ?? undefined,
          beauticianId: itemBeauticianId,
          levelId: beautician.levelId ?? undefined,
          isDesignated: input.isDesignated,
          items: [item],
        });
        records.push(...itemRecords);
      }

      return records;
    } catch (error) {
      console.warn('终端提成流水生成失败', error);
      return [];
    }
  }

  private mapBalanceAccount(account: any, customer?: any, transaction?: any) {
    return {
      customerId: account.customerId,
      customerName: customer?.name ?? '',
      customerPhone: customer?.phone ?? '',
      storeId: account.storeId,
      cashBalance: this.toNumber(account.cashBalance),
      giftBalance: this.toNumber(account.giftBalance),
      totalBalance: this.toNumber(account.cashBalance) + this.toNumber(account.giftBalance),
      status: account.status,
      updatedAt: this.toIso(account.updatedAt),
      lastTransaction: transaction
        ? {
            id: transaction.id,
            transactionNo: transaction.transactionNo,
            type: transaction.type,
            amount: this.toNumber(transaction.amount),
            giftAmount: this.toNumber(transaction.giftAmount),
            cashBalanceAfter: this.toNumber(transaction.cashBalanceAfter),
            giftBalanceAfter: this.toNumber(transaction.giftBalanceAfter),
            createdAt: this.toIso(transaction.createdAt),
          }
        : undefined,
    };
  }

  private async getOrCreateBalanceAccount(tx: any, storeId: number, customerId: number) {
    return tx.customerBalanceAccount.upsert({
      where: { customerId_storeId: { customerId, storeId } },
      update: {},
      create: {
        customerId,
        storeId,
        cashBalance: 0,
        giftBalance: 0,
        status: 'active',
      },
    });
  }

  private async writeBalanceTransaction(
    tx: any,
    storeId: number,
    input: {
      customerId: number;
      type: 'consume' | 'refund' | 'adjust';
      amount?: number;
      giftAmount?: number;
      orderId?: number;
      paymentMethod?: string;
      remark?: string;
    },
  ) {
    const account = await this.getOrCreateBalanceAccount(tx, storeId, input.customerId);
    if (account.status !== 'active') throw new BadRequestException('会员储值账户不可用');

    const cashBalanceBefore = this.toNumber(account.cashBalance);
    const giftBalanceBefore = this.toNumber(account.giftBalance);
    const amount = this.toNumber(input.amount);
    const giftAmount = this.toNumber(input.giftAmount);
    const sign = input.type === 'consume' ? -1 : 1;
    const cashBalanceAfter = cashBalanceBefore + sign * amount;
    const giftBalanceAfter = giftBalanceBefore + sign * giftAmount;

    if (cashBalanceAfter < 0 || giftBalanceAfter < 0) {
      throw new BadRequestException('会员余额不足');
    }

    const updatedAccount = await tx.customerBalanceAccount.update({
      where: { id: account.id },
      data: {
        cashBalance: cashBalanceAfter,
        giftBalance: giftBalanceAfter,
      },
    });
    const transaction = await tx.customerBalanceTransaction.create({
      data: {
        accountId: account.id,
        customerId: input.customerId,
        storeId,
        orderId: input.orderId,
        transactionNo: this.createSequenceNo('BAL'),
        type: input.type,
        amount,
        giftAmount,
        cashBalanceBefore,
        cashBalanceAfter,
        giftBalanceBefore,
        giftBalanceAfter,
        paymentMethod: this.getPaymentMethod(input.paymentMethod ?? 'member_balance'),
        remark: input.remark,
      },
    });

    return { account: updatedAccount, transaction };
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
      const category = String(touch.conversionType ?? touch.metadata?.category ?? touch.metadata?.strategyType ?? '')
        .toLowerCase()
        .includes('churn')
        ? 'churn_recovery'
        : 'marketing_conversion';
      await this.commissionService.recordAmiContribution(
        {
          storeId: this.toNumber((order as any).storeId),
          category,
          triggerType: 'automation',
          triggerId: touch.id,
          customerId: order.customerId,
          orderId: order.id,
          revenueAmount: amount,
          metadata: {
            strategyId: touch.strategyId,
            executionId: touch.executionId,
            attributionWindowDays: touch.attributionWindowDays ?? 30,
          },
        },
        tx,
      );
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

    const isOutbound = movementType.endsWith('_out') || movementType.includes('consume');
    const beforeStock = this.toNonNegativeStock(product.currentStock);
    const appliedQty = isOutbound ? Math.min(beforeStock, quantity) : quantity;
    const signedQuantity = isOutbound ? -appliedQty : appliedQty;
    const afterStock = isOutbound ? beforeStock - appliedQty : beforeStock + appliedQty;
    if (isOutbound && appliedQty <= 0) {
      if (this.toNumber(product.currentStock) < 0) {
        await tx.product.update({
          where: { id: product.id },
          data: { currentStock: 0 },
        });
      }
      return;
    }

    await tx.product.update({
      where: { id: product.id },
      data: { currentStock: afterStock },
    });

    const batchId = item.batchId ? Number(item.batchId) : undefined;
    if (batchId) {
      const batch = await tx.stockBatch.findFirst({
        where: { id: batchId, productId: product.id },
        select: { stock: true },
      });
      const beforeBatchStock = this.toNonNegativeStock(batch?.stock);
      const afterBatchStock = isOutbound ? Math.max(0, beforeBatchStock - appliedQty) : beforeBatchStock + appliedQty;
      await tx.stockBatch.updateMany({
        where: { id: batchId, productId: product.id },
        data: { stock: afterBatchStock },
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
        remark: this.buildInventoryShortageRemark(source.remark, quantity, appliedQty),
      },
    });
  }

  private async consumeProjectBomForCheckout(
    tx: any,
    storeId: number,
    order: { id: number; orderNo?: string | null },
    items: any[],
    remark?: string,
  ) {
    const projectItems = items.filter(
      (item) => String(item.itemType ?? item.type).toLowerCase() === 'project' && (item.itemId ?? item.projectId),
    );
    if (!projectItems.length) return false;

    const existed = await tx.stockMovement.findFirst({
      where: { sourceType: 'project_order', sourceId: order.id, movementType: 'service_consume' },
      select: { id: true },
    });
    if (existed) return false;

    const projectIds = [...new Set(projectItems.map((item) => Number(item.itemId ?? item.projectId)).filter(Boolean))];
    const bomItems = await tx.projectBomItem.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, productId: true, standardQty: true, unit: true },
    });
    if (!bomItems.length) return false;

    const bomByProject = new Map<number, typeof bomItems>();
    for (const bomItem of bomItems) {
      const list = bomByProject.get(bomItem.projectId) ?? [];
      list.push(bomItem);
      bomByProject.set(bomItem.projectId, list);
    }

    let consumed = false;
    for (const item of projectItems) {
      const projectId = Number(item.itemId ?? item.projectId);
      const multiplier = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
      for (const bomItem of bomByProject.get(projectId) ?? []) {
        await this.createStockMovementForItem(
          tx,
          storeId,
          { productId: bomItem.productId, quantity: this.toNumber(bomItem.standardQty) * multiplier },
          'service_consume',
          {
            type: 'project_order',
            id: order.id,
            no: order.orderNo ?? undefined,
            remark: remark ?? `项目收银自动扣耗材：${item.name ?? item.projectName ?? `项目#${projectId}`}`,
          },
        );
        consumed = true;
      }
    }
    return consumed;
  }

  private async consumeProjectBomForCardUsage(
    tx: any,
    storeId: number,
    projectId: number,
    times: number,
    record: { id: number; cardName?: string | null; projectName?: string | null },
  ) {
    if (!storeId || !projectId || times <= 0) return false;

    const existed = await tx.stockMovement.findFirst({
      where: { sourceType: 'card_usage', sourceId: record.id, movementType: 'service_consume' },
      select: { id: true },
    });
    if (existed) return false;

    const bomItems = await tx.projectBomItem.findMany({
      where: { projectId },
      select: { productId: true, standardQty: true },
    });
    if (!bomItems.length) return false;

    let consumed = false;
    for (const bomItem of bomItems) {
      await this.createStockMovementForItem(
        tx,
        storeId,
        { productId: bomItem.productId, quantity: this.toNumber(bomItem.standardQty) * times },
        'service_consume',
        {
          type: 'card_usage',
          id: record.id,
          no: record.cardName ?? undefined,
          remark: `次卡核销自动扣耗材：${record.projectName ?? `项目#${projectId}`}`,
        },
      );
      consumed = true;
    }
    return consumed;
  }

  private async getStore(storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('门店不存在');
    return store;
  }

  private mapStoreConfig(store: any) {
    return {
      id: store.id,
      name: store.name,
      address: store.address ?? '',
      skuCount: Number(store.skuCount ?? 0),
      totalValue: Number(store.totalValue ?? 0),
      healthScore: Number(store.healthScore ?? 100),
      mode: store.mode ?? '独立',
      shiftRequired: store.shiftRequired !== false,
    };
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
    const dateText = this.toLocalDateText(reservation.date);
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
      task.beauticianId
        ? this.prisma.beautician.findUnique({ where: { id: task.beauticianId } })
        : Promise.resolve(null),
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

  private async mapPrintJob(storeId: number, job: any, storeName?: string) {
    const store = storeName ? null : await this.getStore(storeId);
    return {
      id: job.id,
      jobNo: job.jobNo,
      sourceType: job.sourceType,
      sourceId: job.sourceId ?? undefined,
      title: job.title,
      content: job.content,
      copies: job.copies,
      storeId,
      storeName: storeName ?? store?.name ?? '当前门店',
      status: job.status,
      errorMessage: job.errorMessage ?? undefined,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    };
  }

  // ─── Device Management ──────────────────────────────────────────────────────

  private mapTerminalDevice(device: any, options: { includeActivationCode?: boolean } = {}) {
    const viewStatus = device.status === 'offline' && !device.boundAt ? 'unactivated' : device.status;
    const mapped: any = {
      id: device.id,
      deviceCode: device.deviceCode,
      name: device.name,
      model: device.model,
      storeId: device.storeId,
      storeName: device.store?.name ?? '',
      status: viewStatus,
      appVersion: device.appVersion ?? '',
      firmwareVersion: device.firmwareVersion ?? '',
      batteryLevel: device.batteryLevel ?? 0,
      networkStatus: device.networkStatus ?? 'offline',
      printerStatus: device.printerStatus ?? 'unknown',
      scannerStatus: device.scannerStatus ?? 'unknown',
      cameraStatus: device.cameraStatus ?? 'unknown',
      lastOnlineAt: this.toIso(device.lastOnlineAt),
      boundAt: this.toIso(device.boundAt),
    };
    if (options.includeActivationCode) {
      mapped.activationCode = device.activationCode;
    }
    return mapped;
  }

  private generateActivationCode() {
    return `AURA-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private async generateDeviceCode(storeId: number) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = randomBytes(2).toString('hex').toUpperCase();
      const candidate = `AURA-${String(storeId).padStart(4, '0')}-${suffix}`;
      const existing = await this.prisma.terminalDevice.findUnique({ where: { deviceCode: candidate } });
      if (!existing) return candidate;
    }
    throw new ConflictException('Unable to generate a unique device code');
  }

  private resolveTerminalDeviceStoreId(dtoStoreId?: number, headerStoreId?: number) {
    const storeId = dtoStoreId ?? headerStoreId;
    if (!storeId || !Number.isFinite(storeId)) {
      throw new BadRequestException('storeId is required');
    }
    return storeId;
  }

  async findTerminalDevicesPaginated(query: QueryTerminalDevicesDto, headerStoreId?: number) {
    const { page = 1, pageSize = 20, keyword, status } = query;
    const where: any = {};
    const storeId = query.storeId ?? headerStoreId;
    const normalizedKeyword = keyword?.trim();

    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (normalizedKeyword) {
      where.OR = [
        { deviceCode: { contains: normalizedKeyword, mode: 'insensitive' } },
        { name: { contains: normalizedKeyword, mode: 'insensitive' } },
        { model: { contains: normalizedKeyword, mode: 'insensitive' } },
        { store: { name: { contains: normalizedKeyword, mode: 'insensitive' } } },
      ];
    }

    const [devices, total] = await Promise.all([
      this.prisma.terminalDevice.findMany({
        where,
        include: { store: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.terminalDevice.count({ where }),
    ]);
    const items = devices.map((device) => this.mapTerminalDevice(device));
    return { items, data: items, total, page, pageSize };
  }

  async provisionTerminalDevice(dto: ProvisionTerminalDeviceDto, headerStoreId?: number) {
    const storeId = this.resolveTerminalDeviceStoreId(dto.storeId, headerStoreId);
    const store = await this.getStore(storeId);
    const deviceCode = dto.deviceCode?.trim() || (await this.generateDeviceCode(storeId));
    const activationCode = dto.activationCode?.trim() || this.generateActivationCode();

    const existing = await this.prisma.terminalDevice.findUnique({ where: { deviceCode } });
    if (existing) throw new ConflictException('Device code already exists');

    const device = await this.prisma.terminalDevice.create({
      data: {
        storeId,
        deviceCode,
        activationCode,
        name: dto.name?.trim() || `${store.name} Ami Aura Lite`,
        model: dto.model?.trim() || 'Ami Aura Lite',
        status: 'offline',
        appVersion: dto.appVersion?.trim() || '1.0.0',
        firmwareVersion: dto.firmwareVersion?.trim() || '1.0.0',
        batteryLevel: 100,
        networkStatus: 'offline',
        printerStatus: 'unknown',
        scannerStatus: 'unknown',
        cameraStatus: 'unknown',
      },
      include: { store: true },
    });

    return this.mapTerminalDevice(device, { includeActivationCode: true });
  }

  async updateTerminalDevice(id: number, dto: UpdateTerminalDeviceDto) {
    const current = await this.prisma.terminalDevice.findUnique({
      where: { id },
      include: { store: true },
    });
    if (!current) throw new NotFoundException('Device not found');

    const data: any = {};
    const stringFields: Array<keyof UpdateTerminalDeviceDto> = [
      'deviceCode',
      'activationCode',
      'name',
      'model',
      'appVersion',
      'firmwareVersion',
      'networkStatus',
      'printerStatus',
      'scannerStatus',
      'cameraStatus',
    ];
    for (const field of stringFields) {
      const value = dto[field];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed && ['deviceCode', 'activationCode', 'name', 'model'].includes(field)) {
          throw new BadRequestException(`${field} cannot be empty`);
        }
        data[field] = trimmed;
      }
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.batteryLevel !== undefined) data.batteryLevel = dto.batteryLevel;

    if (data.deviceCode && data.deviceCode !== current.deviceCode) {
      const existing = await this.prisma.terminalDevice.findUnique({ where: { deviceCode: data.deviceCode } });
      if (existing) throw new ConflictException('Device code already exists');
    }

    if (!Object.keys(data).length) return this.mapTerminalDevice(current);

    const updated = await this.prisma.terminalDevice.update({
      where: { id },
      data,
      include: { store: true },
    });
    return this.mapTerminalDevice(updated);
  }

  async disableTerminalDevice(id: number) {
    await this.ensureTerminalDevice(id);
    const updated = await this.prisma.terminalDevice.update({
      where: { id },
      data: { status: 'disabled' },
      include: { store: true },
    });
    return this.mapTerminalDevice(updated);
  }

  async approveTerminalDeviceUnbind(id: number, approved: boolean) {
    await this.ensureTerminalDevice(id);
    const updated = await this.prisma.terminalDevice.update({
      where: { id },
      data: approved ? { status: 'offline', boundAt: null } : { status: 'online' },
      include: { store: true },
    });
    return this.mapTerminalDevice(updated);
  }

  async deleteTerminalDevice(id: number) {
    await this.ensureTerminalDevice(id);
    await this.prisma.$transaction([
      this.prisma.serviceTask.updateMany({ where: { deviceId: id }, data: { deviceId: null } }),
      this.prisma.skinTest.updateMany({ where: { deviceId: id }, data: { deviceId: null } }),
      this.prisma.cardUsageRecord.updateMany({ where: { deviceId: id }, data: { deviceId: null } }),
      this.prisma.recommendationEvent.updateMany({ where: { deviceId: id }, data: { deviceId: null } }),
      this.prisma.aiAuditLog.updateMany({ where: { deviceId: id }, data: { deviceId: null } }),
      this.prisma.terminalDevice.delete({ where: { id } }),
    ]);
    return { success: true, id };
  }

  private async ensureTerminalDevice(id: number) {
    const device = await this.prisma.terminalDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

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
      store: this.mapStoreConfig(device.store),
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
    if (dto.printerStatus) updateData.printerStatus = dto.printerStatus;
    if (dto.scannerStatus) updateData.scannerStatus = dto.scannerStatus;
    if (dto.cameraStatus) updateData.cameraStatus = dto.cameraStatus;

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
      printerStatus: device.printerStatus ?? 'unknown',
      scannerStatus: device.scannerStatus ?? 'unknown',
      cameraStatus: device.cameraStatus ?? 'unknown',
      lastOnlineAt: device.lastOnlineAt,
      boundAt: device.boundAt,
      shiftRequired: device.store.shiftRequired !== false,
      store: this.mapStoreConfig(device.store),
    };
  }

  async getDeviceStatus(storeId: number, deviceId: number) {
    const device = await this.prisma.terminalDevice.findFirst({
      where: { id: deviceId, storeId },
      include: { store: true },
    });
    if (!device) throw new NotFoundException('设备不存在');

    const [pendingPrintCount, failedPrintCount, latestPrintJob] = await Promise.all([
      this.prisma.printJob.count({ where: { storeId, status: { in: ['queued', 'pending', 'printing'] } } }),
      this.prisma.printJob.count({ where: { storeId, status: 'failed' } }),
      this.prisma.printJob.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const networkStatus = device.networkStatus || 'unknown';
    const reportedPrinterStatus = device.printerStatus || 'unknown';
    const printerStatus = failedPrintCount > 0 ? 'warning' : pendingPrintCount > 0 ? 'printing' : reportedPrinterStatus;
    const scannerStatus = device.scannerStatus || 'unknown';
    const cameraStatus = device.cameraStatus || 'unknown';

    return {
      device: {
        id: device.id,
        name: device.name,
        model: device.model,
        storeId: device.storeId,
        storeName: device.store.name,
        status: device.status,
        appVersion: device.appVersion,
        firmwareVersion: device.firmwareVersion,
        batteryLevel: device.batteryLevel ?? 100,
        networkStatus,
        printerStatus,
        scannerStatus,
        cameraStatus,
        lastOnlineAt: this.toIso(device.lastOnlineAt),
      },
      peripherals: {
        network: {
          status: networkStatus,
          label: networkStatus === 'online' ? '网络正常' : networkStatus === 'unstable' ? '网络不稳定' : '网络离线',
          checkedAt: new Date().toISOString(),
        },
        printer: {
          status: printerStatus,
          label: failedPrintCount > 0 ? '有失败打印任务' : pendingPrintCount > 0 ? '打印队列处理中' : '打印机正常',
          pendingCount: pendingPrintCount,
          failedCount: failedPrintCount,
          latestJobId: latestPrintJob?.id,
        },
        scanner: {
          status: scannerStatus,
          label:
            scannerStatus === 'online' ? '扫码器正常' : scannerStatus === 'offline' ? '扫码器离线' : '扫码器状态未知',
        },
        camera: {
          status: cameraStatus,
          label:
            cameraStatus === 'online' ? '摄像头正常' : cameraStatus === 'offline' ? '摄像头离线' : '摄像头状态未知',
        },
      },
      serverTime: new Date().toISOString(),
    };
  }

  async saveConversation(
    storeId: number,
    deviceKey: string,
    userId: number | undefined,
    dto: SaveTerminalConversationDto,
  ) {
    const model = this.getTerminalConversationModel();
    if (!model)
      throw new BadRequestException(
        'TerminalConversation model is not available. Please run Prisma migration and generate.',
      );

    const date = this.getDateOnly(dto.date);
    const operatorId = await this.resolveConversationOperatorId(storeId, userId, dto.operatorId);
    const messages = (dto.messages ?? [])
      .filter((item) => item?.content?.trim())
      .slice(-300)
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, 4000),
        timestamp: Number.isFinite(item.timestamp) ? item.timestamp : Date.now(),
        type: item.type,
        title: item.title,
      }));
    const messageCount = Math.max(0, dto.messageCount ?? messages.length);

    const where = {
      deviceId: deviceKey,
      role: dto.role,
      date,
      operatorId,
    };
    const existing = await model.findFirst({ where });
    const data = {
      storeId,
      operatorId,
      messages,
      messageCount,
      archivedAt: new Date(),
    };
    const record = existing
      ? await model.update({
          where: { id: existing.id },
          data,
        })
      : await model.create({
          data: {
            ...data,
            deviceId: deviceKey,
            role: dto.role,
            date,
          },
        });

    return this.mapTerminalConversation(record);
  }

  async getConversationHistory(storeId: number, deviceKey: string, query: QueryTerminalConversationsDto) {
    const model = this.getTerminalConversationModel();
    if (!model) return { items: [], data: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };

    const page = Number(query.page ?? 1);
    const pageSize = Math.min(100, Number(query.pageSize ?? 20));
    const endDate = this.getDateOnly(query.endDate);
    const startDate = query.startDate
      ? this.getDateOnly(query.startDate)
      : new Date(endDate.getTime() - Math.max(1, query.days ?? 30) * 86_400_000);
    const where = {
      storeId,
      deviceId: deviceKey,
      ...(query.role ? { role: query.role } : {}),
      ...(query.operatorId ? { operatorId: query.operatorId } : {}),
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [items, total] = await Promise.all([
      model.findMany({
        where,
        orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      model.count({ where }),
    ]);
    const mapped = items.map((item: any) => this.mapTerminalConversation(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async getConversationDetail(storeId: number, deviceKey: string, id: number) {
    const model = this.getTerminalConversationModel();
    if (!model) throw new NotFoundException('Conversation not found');
    const record = await model.findFirst({ where: { id, storeId, deviceId: deviceKey } });
    if (!record) throw new NotFoundException('Conversation not found');
    return this.mapTerminalConversation(record);
  }

  async deleteConversation(storeId: number, deviceKey: string, id: number) {
    const model = this.getTerminalConversationModel();
    if (!model) throw new NotFoundException('Conversation not found');
    const record = await model.findFirst({ where: { id, storeId, deviceId: deviceKey } });
    if (!record) throw new NotFoundException('Conversation not found');
    await model.delete({ where: { id } });
    return { success: true, id };
  }

  async deleteConversationAsAdmin(id: number, storeId?: number) {
    const model = this.getTerminalConversationModel();
    if (!model) throw new NotFoundException('Conversation not found');
    const record = await model.findFirst({ where: { id, ...(storeId ? { storeId } : {}) } });
    if (!record) throw new NotFoundException('Conversation not found');
    await model.delete({ where: { id } });
    return { success: true, id };
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
    const availableRoles = this.getAuraAvailableRolesForUser(user);
    const currentRole =
      requestedRole && availableRoles.includes(requestedRole) ? requestedRole : (availableRoles[0] ?? 'reception');
    const actionMap: Record<string, string[]> = {
      manager: [
        'manager.dashboard',
        'manager.staff',
        'manager.customers',
        'manager.inventory',
        'reception.appointments',
        'operation.cashier',
      ],
      reception: [
        'reception.appointments',
        'operation.verify',
        'operation.register',
        'operation.cashier',
        'operation.card',
        'operation.recharge',
        'operation.print',
      ],
      beautician: [
        'beautician.schedule',
        'beautician.commission',
        'beautician.customer',
        'beautician.record',
        'beautician.advice',
      ],
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
      'operation.service-complete': '服务记录',
      'beautician.schedule': '我的预约',
      'beautician.commission': '我的提成',
      'beautician.customer': '我的客户',
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
      'operation.service-complete': 'FileText',
      'beautician.schedule': 'CalendarCheck',
      'beautician.commission': 'Wallet',
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

  async getBootstrap(storeId: number, userId?: number, requestedRole?: string, requestedOperatorId?: number) {
    const [store, stores, authUser, terminalUserCandidates, beauticians, projects, cards, products, config] =
      await Promise.all([
        this.getStore(storeId),
        this.prisma.store.findMany({ where: { deletedAt: null, status: 'active' }, orderBy: { id: 'asc' } }),
        userId
          ? this.prisma.user.findUnique({
              where: { id: userId },
              include: { roles: { include: { role: true } }, stores: true },
            })
          : Promise.resolve(null),
        this.prisma.user.findMany({
          where: {
            deletedAt: null,
            status: 'active',
            OR: [
              { stores: { some: { storeId } } },
              { roles: { some: { role: { key: { in: ['super_admin', 'store_manager'] } } } } },
            ],
          },
          include: { roles: { include: { role: true } }, stores: true },
          orderBy: [{ id: 'asc' }],
        }),
        this.prisma.beautician.findMany({
          where: this.buildTerminalVisibleBeauticianWhere(storeId),
          include: { level: true, user: true, store: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.project.findMany({
          where: { storeId, deletedAt: null, status: 'active' },
          include: { type: true },
          take: 80,
        }),
        this.getTerminalSaleCards(storeId),
        this.prisma.product.findMany({
          where: { storeId, deletedAt: null, status: 'active' },
          include: { category: true },
          take: 120,
        }),
        this.getConfig(),
      ]);
    const terminalUsersRaw = terminalUserCandidates;
    const selectableTerminalUsers = terminalUsersRaw.filter((user) => this.hasTerminalRoleSignal(user));
    const requestedId = Number.isFinite(requestedOperatorId) ? requestedOperatorId : undefined;
    let selectedUser = requestedId ? terminalUsersRaw.find((item) => item.id === requestedId) : undefined;
    if (requestedId) {
      if (!selectedUser) {
        throw new BadRequestException('当前账号无权使用此门店终端');
      }
      if (!this.hasTerminalRoleSignal(selectedUser)) {
        throw new BadRequestException('当前账号未配置智能终端权限');
      }
    }
    if (!selectedUser && authUser && this.hasTerminalRoleSignal(authUser)) {
      selectedUser = selectableTerminalUsers.find((item) => item.id === authUser.id) ?? authUser;
    }
    selectedUser = selectedUser ?? selectableTerminalUsers[0] ?? null;
    if (!selectedUser) {
      throw new BadRequestException('当前门店没有可用的智能终端账号，请在管理端用户管理中配置终端权限');
    }

    const role = this.getAuraRoleConfig(selectedUser, requestedRole);
    const storeDtos = stores.map((item) => this.mapStoreConfig(item));
    const currentUser = selectedUser ? this.mapTerminalAuthUser(selectedUser) : null;
    const beauticianByUserId = new Map(
      beauticians.filter((item) => item.userId).map((item) => [item.userId as number, item]),
    );
    const currentBeautician = selectedUser ? beauticianByUserId.get(selectedUser.id) : undefined;
    const terminalUsers = terminalUsersRaw.map((item) =>
      this.mapTerminalUserOption(item, beauticianByUserId, store.name),
    );

    return {
      currentUser,
      currentBeautician: currentBeautician ? this.mapTerminalBeautician(currentBeautician, store.name) : null,
      currentStore: storeDtos.find((item) => item.id === storeId) ?? null,
      availableStores: storeDtos,
      terminalUsers,
      ...role,
      store: storeDtos.find((item) => item.id === storeId) ?? null,
      stores: storeDtos,
      beauticians: beauticians.map((item) => this.mapTerminalBeautician(item, store.name)),
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
      cards,
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
        OR: [{ name: { contains: keyword, mode: 'insensitive' } }, { phone: { contains: keyword } }],
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

  private parseTerminalCustomerIds(value?: string | number[]) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map(Number).filter((item) => Number.isInteger(item) && item > 0)));
    }
    if (!value) return [];
    return Array.from(
      new Set(
        String(value)
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isInteger(item) && item > 0),
      ),
    ).slice(0, 100);
  }

  private async getTerminalCustomerSelectScopeIds(
    storeId: number,
    userId: number | undefined,
    scene: TerminalCustomerSelectScene,
    operatorId?: number,
    onlyMyCustomers?: boolean,
  ): Promise<TerminalCustomerSelectScope> {
    const customerIds = new Set<number>();
    const effectiveUserId = operatorId ?? userId;
    const operatorUser = effectiveUserId
      ? await this.prisma.user.findFirst({
          where: { id: effectiveUserId, deletedAt: null, status: 'active' },
          include: { roles: { include: { role: true } }, stores: true },
        })
      : null;
    const availableRoles = this.getAuraAvailableRolesForUser(operatorUser);
    const hasStoreScope = availableRoles.includes('manager') || availableRoles.includes('reception');
    const shouldHonorOnlyMyCustomers = Boolean(onlyMyCustomers && !hasStoreScope);
    const shouldScopeToCurrentStaff = Boolean(
      effectiveUserId && (shouldHonorOnlyMyCustomers || (!hasStoreScope && (scene === 'follow_up' || scene === 'service_record'))),
    );
    const beautician = effectiveUserId
      ? await this.prisma.beautician.findFirst({ where: { storeId, userId: effectiveUserId }, select: { id: true } })
      : null;

    if (scene === 'follow_up') {
      const tasks = await this.prisma.terminalFollowUpTask.findMany({
        where: {
          storeId,
          deletedAt: null,
          status: { in: ['pending', 'in_progress', 'expired'] },
          ...(shouldScopeToCurrentStaff
            ? {
                OR: [
                  ...(effectiveUserId ? [{ assigneeUserId: effectiveUserId }] : []),
                  ...(beautician?.id ? [{ assigneeBeauticianId: beautician.id }] : []),
                ],
              }
            : {}),
        },
        select: { customerId: true },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      });
      tasks.forEach((task) => customerIds.add(task.customerId));
    }

    if (scene === 'service_record' || shouldHonorOnlyMyCustomers) {
      if (shouldScopeToCurrentStaff && !beautician?.id) {
        return { customerIds: [], forcedEmpty: true };
      }
      const [tasks, reservations] = await Promise.all([
        this.prisma.serviceTask.findMany({
          where: {
            storeId,
            ...(beautician?.id ? { beauticianId: beautician.id } : {}),
            status: { in: ['pending', 'in_progress', 'completed'] },
          },
          select: { customerId: true },
          orderBy: { appointmentTime: 'desc' },
          take: 200,
        }),
        this.prisma.reservation.findMany({
          where: {
            storeId,
            ...(beautician?.id ? { beauticianId: beautician.id } : {}),
            status: { not: 'cancelled' },
          },
          select: { customerId: true },
          orderBy: { date: 'desc' },
          take: 200,
        }),
      ]);
      [...tasks, ...reservations].forEach((item) => customerIds.add(item.customerId));
    }

    return { customerIds: Array.from(customerIds) };
  }

  private toTerminalCustomerSceneBadges(customer: any, scene: TerminalCustomerSelectScene) {
    const badges: string[] = [];
    if (customer.isAppointedToday) badges.push('今日预约');
    if (customer.activeCustomerCardsCount > 0) badges.push(`${customer.activeCustomerCardsCount} 张可用次卡`);
    if (customer.totalBalance > 0) badges.push('有储值余额');
    if (scene === 'follow_up') badges.push('待跟进');
    if (scene === 'service_record') badges.push('服务客户');
    return badges.slice(0, 4);
  }

  private toTerminalCustomerSelectItem(customer: any, scene: TerminalCustomerSelectScene) {
    const sceneBadges = this.toTerminalCustomerSceneBadges(customer, scene);
    return {
      ...customer,
      maskedPhone: customer.phone ? customer.phone.replace(/^(\d{3})\d{4}(\d+)/, '$1****$2') : '',
      priorityLabel:
        scene === 'verification' && customer.activeCustomerCardsCount > 0
          ? '可核销'
          : customer.isAppointedToday
            ? '今日预约'
            : sceneBadges[0],
      sceneBadges,
      disabled: scene === 'verification' && customer.activeCustomerCardsCount <= 0,
      disabledReason:
        scene === 'verification' && customer.activeCustomerCardsCount <= 0 ? '该客户暂无可核销次卡' : undefined,
      metadata: {
        appointmentTime: customer.appointmentTime,
        activeCardCount: customer.activeCustomerCardsCount,
      },
    };
  }

  private async getTerminalContextCustomers(
    storeId: number,
    keywordOrOptions: string | TerminalCustomerSelectOptions = '',
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const options = typeof keywordOrOptions === 'string' ? { keyword: keywordOrOptions } : (keywordOrOptions ?? {});
    const normalizedKeyword = options.keyword?.trim() ?? '';
    const limit = Math.min(Math.max(Number(options.limit ?? (normalizedKeyword ? 50 : 200)) || 200, 1), 500);
    const activeCardWhere = { status: 'active', remainingTimes: { gt: 0 } } as const;
    const onlyWithActiveCards = Boolean(options.onlyWithActiveCards);
    const scopedCustomerIds = Array.isArray(options.customerIds)
      ? Array.from(new Set(options.customerIds.map(Number).filter(Number.isFinite)))
      : [];
    const customerKeywordWhere = normalizedKeyword
      ? {
          OR: [
            { name: { contains: normalizedKeyword, mode: 'insensitive' as const } },
            { phone: { contains: normalizedKeyword } },
          ],
        }
      : {};
    const contextCustomerWhere = {
      ...(scopedCustomerIds.length ? { id: { in: scopedCustomerIds } } : {}),
      ...(onlyWithActiveCards ? { customerCards: { some: activeCardWhere } } : {}),
      ...customerKeywordWhere,
    };
    const customerSelect = {
      id: true,
      name: true,
      phone: true,
      gender: true,
      memberLevel: true,
      source: true,
      totalSpent: true,
      visitCount: true,
      lastVisitDate: true,
      skinCondition: true,
      tags: true,
      balanceAccounts: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { cashBalance: true, giftBalance: true },
      },
      customerCards: {
        where: activeCardWhere,
        select: { id: true },
        take: 20,
      },
    } as const;

    const [store, reservations, customers] = await Promise.all([
      this.getStore(storeId),
      this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
          status: { not: 'cancelled' },
          ...(Object.keys(contextCustomerWhere).length ? { customer: contextCustomerWhere } : {}),
        },
        include: { customer: { select: customerSelect }, project: { select: { name: true } } },
        orderBy: { startTime: 'asc' },
        take: 20,
      }),
      this.prisma.customer.findMany({
        where: {
          storeId,
          ...(options.includeInactive ? {} : { deletedAt: null }),
          ...contextCustomerWhere,
        },
        select: customerSelect,
        orderBy: normalizedKeyword ? { lastVisitDate: 'desc' } : { totalSpent: 'desc' },
        take: normalizedKeyword ? Math.min(limit, 50) : limit,
      }),
    ]);

    const byCustomerId = new Map<number, (typeof reservations)[number]>();
    reservations.forEach((reservation) => {
      if (!byCustomerId.has(reservation.customerId)) {
        byCustomerId.set(reservation.customerId, reservation);
      }
    });

    const customerMap = new Map<number, (typeof customers)[number]>();
    reservations.forEach((reservation) => {
      if (reservation.customer) {
        customerMap.set(reservation.customer.id, reservation.customer as (typeof customers)[number]);
      }
    });
    customers.forEach((customer) => customerMap.set(customer.id, customer));
    const normalizedKeywordLower = normalizedKeyword.toLowerCase();

    return Array.from(customerMap.values())
      .filter((customer) => !onlyWithActiveCards || (customer.customerCards?.length ?? 0) > 0)
      .filter(
        (customer) =>
          !normalizedKeywordLower ||
          customer.name.toLowerCase().includes(normalizedKeywordLower) ||
          (customer.phone ?? '').includes(normalizedKeyword),
      )
      .slice(0, limit)
      .map((customer) => {
        const reservation = byCustomerId.get(customer.id);
        const account = Array.isArray(customer.balanceAccounts) ? customer.balanceAccounts[0] : undefined;
        const cashBalance = this.toNumber(account?.cashBalance);
        const giftBalance = this.toNumber(account?.giftBalance);
        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone ?? '',
          gender: customer.gender ?? '女',
          memberLevel: customer.memberLevel ?? '普通客户',
          totalSpent: this.toNumber(customer.totalSpent),
          visitCount: customer.visitCount ?? 0,
          lastVisitDate: this.toIso(customer.lastVisitDate) || '',
          tags: customer.tags ?? [],
          source: customer.source ?? 'terminal',
          storeName: store.name,
          skinCondition: customer.skinCondition ?? '',
          cashBalance,
          giftBalance,
          totalBalance: cashBalance + giftBalance,
          activeCustomerCardsCount: customer.customerCards?.length ?? 0,
          isAppointedToday: Boolean(reservation),
          appointmentTime: reservation
            ? `${this.toLocalDateText(reservation.date)} ${reservation.startTime || '00:00'}:00`
            : undefined,
          appointmentProjectName: reservation?.project?.name,
        };
      });
  }

  async quickCreateCustomer(storeId: number, dto: QuickCreateCustomerDto) {
    const customersService = this.customersService ?? new CustomersService(this.prisma);
    const customer = await customersService.create({
      storeId,
      name: dto.name,
      phone: dto.phone,
      gender: dto.gender,
      birthday: dto.birthday,
      memberLevel: dto.memberLevel,
      skinCondition: dto.skinCondition,
      tags: dto.tags ?? [],
      remark: dto.remark,
      source: dto.source ?? 'terminal',
    });

    this.invalidateCustomerDashboardCache(storeId);
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
      lastCheck: formatBusinessDate(profile.lastCheck),
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
    this.invalidateCustomerDashboardCache(customer.storeId);

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
      lastCheck: formatBusinessDate(profile.lastCheck),
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
      consumeTime: formatBusinessDateTime(item.consumeTime),
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
    const preferredService =
      customer.cardUsageRecords[0]?.projectName ?? customer.reservations[0]?.project?.name ?? '待识别';

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
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        healthProfile: true,
        customerCards: { where: { status: 'active' }, include: { card: true } },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const [prediction, recentConsumptions, projects] = await Promise.all([
      this.prisma.customerPredictionSnapshot.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.consumptionRecord.findMany({
        where: { customerId },
        orderBy: { consumeTime: 'desc' },
        take: 10,
      }),
      this.prisma.project.findMany({
        where: { storeId: customer.storeId, deletedAt: null, status: 'active' },
        include: { type: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    return this.scoreProjectsForCustomer(projects, customer, prediction, recentConsumptions)
      .slice(0, 5)
      .map((item) => ({
        id: item.project.id,
        customerId,
        type: 'project',
        title: item.project.name,
        reason: item.reason,
        matchFactors: item.factors,
        targetId: item.project.id,
        confidence: Math.round((item.score / 100) * 100) / 100,
        payload: { price: this.toNumber(item.project.price), duration: item.project.duration },
      }));
  }

  async getCustomerNextBestActions(storeId: number, customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId, deletedAt: null },
      include: {
        healthProfile: true,
        reservations: { include: { project: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 3 },
        productOrders: { orderBy: { createdAt: 'desc' }, take: 3 },
        cardUsageRecords: { orderBy: { verifiedAt: 'desc' }, take: 3 },
        customerCards: { where: { status: 'active' }, include: { card: true } },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const [prediction, recommendations] = await Promise.all([
      this.prisma.customerPredictionSnapshot.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.getCustomerRecommendations(customerId),
    ]);
    const actions = this.buildActionsFromPrediction(customer, prediction, recommendations);

    return {
      customerId,
      customerName: customer.name,
      generatedAt: new Date().toISOString(),
      actions,
      prediction: prediction
        ? {
            churnScore: prediction.churnScore,
            churnLevel: prediction.churnLevel,
            repurchase30dScore: prediction.repurchase30dScore,
            marketingResponseScore: prediction.marketingResponseScore,
            ltvTier: prediction.ltvTier,
          }
        : null,
    };
  }

  async getTerminalCustomerProfile(storeId: number, customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    if (!this.customerProfileService) throw new BadRequestException('客户画像服务未启用');
    return this.customerProfileService.getCustomerProfile(customerId);
  }

  async getGrowthCandidates(storeId: number, limit = 10) {
    const latestRun = await this.prisma.predictionRun.findFirst({
      where: { storeId, status: 'completed' },
      orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
    });
    if (!latestRun) return [];

    const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
      where: {
        runId: latestRun.id,
        storeId,
        OR: [{ churnLevel: { in: ['高', '极高', 'high', 'critical'] } }, { repurchase30dScore: { gte: 60 } }],
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            lastVisitDate: true,
            totalSpent: true,
            memberLevel: true,
            visitCount: true,
            tags: true,
            source: true,
          },
        },
      },
      orderBy: [{ churnScore: 'desc' }, { repurchase30dScore: 'desc' }],
      take: Math.min(Math.max(Number(limit) || 10, 1), 50),
    });

    return snapshots.map((snapshot: any) => ({
      customerId: snapshot.customer.id,
      name: snapshot.customer.name,
      phone: snapshot.customer.phone,
      lastVisitDate: snapshot.customer.lastVisitDate?.toISOString?.() ?? null,
      totalSpent: this.toNumber(snapshot.customer.totalSpent),
      memberLevel: snapshot.customer.memberLevel,
      visitCount: snapshot.customer.visitCount,
      tags: snapshot.customer.tags ?? [],
      source: snapshot.customer.source,
      churnScore: snapshot.churnScore,
      churnLevel: snapshot.churnLevel,
      repurchase30dScore: snapshot.repurchase30dScore,
      marketingResponseScore: snapshot.marketingResponseScore,
      ltvTier: snapshot.ltvTier,
      reason: this.getGrowthCandidateReason(snapshot),
      recommendedActions: snapshot.recommendedActionsJson,
      featureJson: snapshot.featureJson,
    }));
  }

  private scoreProjectsForCustomer(projects: any[], customer: any, prediction: any | null, recentConsumptions: any[]) {
    const recentText = recentConsumptions
      .map((record) => `${record.consumeContent ?? ''} ${record.consumeType ?? ''}`)
      .join(' ');
    const healthText = [
      customer.healthProfile?.skinType,
      customer.healthProfile?.skinStatus,
      customer.healthProfile?.mainProblems,
      customer.healthProfile?.goals,
      customer.skinType,
      customer.skinCondition,
    ]
      .filter(Boolean)
      .join(' ');
    const highChurn = this.isHighChurn(prediction?.churnLevel);
    const highLtv = this.isHighLtv(prediction?.ltvTier);

    return projects
      .map((project) => {
        const factors: string[] = [];
        let score = 45;
        const projectText = `${project.name ?? ''} ${project.description ?? ''} ${project.type?.name ?? ''}`;

        if (recentText && this.containsRelatedKeyword(recentText, projectText)) {
          score += 14;
          factors.push('近期消费偏好匹配');
        }

        if (healthText && this.containsRelatedKeyword(healthText, projectText)) {
          score += 16;
          factors.push('健康档案/肤质诉求匹配');
        }

        if ((customer.customerCards ?? []).some((card: any) => this.cardMatchesProject(card, project))) {
          score += 14;
          factors.push('客户持有可关联次卡');
        }

        if (highChurn) {
          const price = this.toNumber(project.price);
          score += price <= 500 ? 12 : 4;
          factors.push('高流失风险，优先低门槛回店项目');
        } else if (Number(prediction?.repurchase30dScore ?? 0) >= 60) {
          score += 10;
          factors.push('处于复购窗口');
        }

        if (highLtv) {
          const price = this.toNumber(project.price);
          score += price >= 600 ? 10 : 5;
          factors.push('高 LTV 客户，适合升级护理');
        }

        if (!factors.length) factors.push('门店活跃项目，适合作为兜底推荐');
        return {
          project,
          score: Math.min(96, Math.max(55, score)),
          factors,
          reason: this.buildProjectRecommendationReason(factors, prediction),
        };
      })
      .sort((a, b) => b.score - a.score || this.toNumber(b.project.price) - this.toNumber(a.project.price));
  }

  private buildActionsFromPrediction(customer: any, prediction: any | null, recommendations: any[]) {
    const actions: any[] = [];
    const topRecommendation = recommendations[0];

    if (this.isHighChurn(prediction?.churnLevel)) {
      const lastVisitDays =
        (prediction?.featureJson as any)?.lastVisitDays ?? this.daysBetween(customer.lastVisitDate, new Date());
      actions.push({
        id: 'prediction-care-reminder',
        type: 'send_care_reminder',
        title: '流失风险唤醒',
        reason: `流失分 ${prediction?.churnScore ?? '-'}，已 ${lastVisitDays} 天未到店，建议先做顾问关怀。`,
        priority: 'high',
        urgency: 'high',
        actionLabel: '发起关怀触达',
        payload: { customerId: customer.id, predictionId: prediction?.id },
      });
    }

    if (Number(prediction?.repurchase30dScore ?? 0) >= 60 && topRecommendation) {
      actions.push({
        id: `recommendation-${topRecommendation.id}`,
        type: 'recommend_project',
        title: topRecommendation.title,
        reason: `复购分 ${prediction?.repurchase30dScore}，${topRecommendation.reason}`,
        priority: 'high',
        actionLabel: '推荐给客户',
        payload: topRecommendation,
      });
    } else {
      actions.push(
        ...recommendations.slice(0, 2).map((item, index) => ({
          id: `recommendation-${item.id}`,
          type: 'recommend_project',
          title: item.title,
          reason: item.reason,
          priority: index === 0 ? 'medium' : 'low',
          actionLabel: '推荐给客户',
          payload: item,
        })),
      );
    }

    const expiringCards = (customer.customerCards ?? []).filter(
      (card: any) => card.remainingTimes > 0 && this.daysUntil(card.expiryDate) <= 30,
    );
    if (expiringCards.length) {
      actions.push({
        id: `card-expiry-${expiringCards[0].id}`,
        type: 'card_expiry_reminder',
        title: `${expiringCards[0].cardName} 即将到期`,
        reason: `剩余 ${expiringCards[0].remainingTimes} 次，${this.daysUntil(expiringCards[0].expiryDate)} 天后到期。`,
        priority: 'high',
        actionLabel: '提醒核销/预约',
        payload: { cardId: expiringCards[0].id, customerId: customer.id },
      });
    }

    if (this.isHighLtv(prediction?.ltvTier)) {
      actions.push({
        id: 'ltv-card-offer',
        type: 'offer_card',
        title: '升单办卡建议',
        reason: `客户 LTV 层级 ${prediction?.ltvTier}，适合提供会员权益或护理套餐。`,
        priority: 'medium',
        actionLabel: '推荐卡项/套餐',
        payload: { customerId: customer.id, ltvTier: prediction?.ltvTier },
      });
    }

    if (!actions.length) {
      actions.push({
        id: 'light-follow-up',
        type: 'create_follow_up',
        title: '轻量回访',
        reason: '当前预测信号不足，建议先记录客户偏好并做一次轻量回访。',
        priority: 'low',
        actionLabel: '创建跟进',
        payload: { customerId: customer.id },
      });
    }

    return actions.slice(0, 5);
  }

  private buildProjectRecommendationReason(factors: string[], prediction: any | null) {
    const prefix = factors.slice(0, 3).join('、');
    if (this.isHighChurn(prediction?.churnLevel)) return `${prefix}；客户流失风险较高，建议用低压力体验恢复到店关系。`;
    if (Number(prediction?.repurchase30dScore ?? 0) >= 60) return `${prefix}；客户处于复购窗口，可作为本次重点推荐。`;
    return `${prefix}；可作为本次护理或后续加项建议。`;
  }

  private getGrowthCandidateReason(snapshot: any) {
    if (this.isHighChurn(snapshot.churnLevel)) {
      const churnScore = this.toNumber(snapshot.churnScore);
      const isCritical = String(snapshot.churnLevel ?? '').includes('极高') || churnScore >= 75;
      const contactWindow = isCritical ? '24 小时内' : '48 小时内';
      const activity = isCritical ? '老客回归护理礼' : '回店关怀护理券';
      return `流失风险 ${snapshot.churnLevel}（${snapshot.churnScore} 分）：建议 ${contactWindow}由专属顾问电话/企微邀约回店，推送「${activity}」（补水修护体验或专属券包，7 天内预约有效）；到店后复测肤况并锁定下一次护理。`;
    }
    if (Number(snapshot.repurchase30dScore ?? 0) >= 60) {
      return `复购分 ${snapshot.repurchase30dScore}：客户进入 30 天复购窗口，建议 3 天内发送同系列护理邀约，搭配次卡/套餐权益或加项礼，引导预约下一次护理。`;
    }
    return `营销响应 ${snapshot.marketingResponseScore} 分：建议纳入轻量触达池，发送小程序券包或季节护理活动，48 小时后由前台跟进有浏览/领取动作的客户。`;
  }

  private cardMatchesProject(card: any, project: any) {
    const cardProjects = Array.isArray(card.card?.projects) ? card.card.projects : [];
    const projectName = String(project.name ?? '').toLowerCase();
    return cardProjects.some((item: any) => {
      const itemName = String(item.projectName ?? item.name ?? item.title ?? '').toLowerCase();
      const itemId = Number(item.projectId ?? item.id ?? 0);
      return itemId === project.id || (itemName && (itemName.includes(projectName) || projectName.includes(itemName)));
    });
  }

  private containsRelatedKeyword(source: string, target: string) {
    const normalizedSource = source.toLowerCase();
    const normalizedTarget = target.toLowerCase();
    const keywords = [
      '补水',
      '保湿',
      '修护',
      '敏感',
      '清洁',
      '祛痘',
      '抗衰',
      '美白',
      '舒缓',
      '护理',
      '面部',
      '身体',
      '肩颈',
      '体验',
    ];
    return keywords.some((keyword) => normalizedSource.includes(keyword) && normalizedTarget.includes(keyword));
  }

  private isHighChurn(level?: string | null) {
    return ['高', '极高', 'high', 'critical'].includes(String(level ?? '').toLowerCase());
  }

  private isHighLtv(level?: string | null) {
    return ['铂金', '黄金', 'premium', 'high'].includes(String(level ?? '').toLowerCase());
  }

  private daysUntil(date?: Date | null) {
    if (!date) return 9999;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  }

  private daysBetween(from?: Date | string | null, to = new Date()) {
    if (!from) return 9999;
    return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86400000));
  }

  // Service Tasks
  async listTasks(
    storeId: number,
    deviceId: number,
    query?: { date?: string; status?: string; beauticianId?: number },
  ) {
    const day = query?.date ? new Date(query.date) : new Date();
    if (Number.isNaN(day.getTime())) {
      throw new BadRequestException('date 参数格式不正确');
    }
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const status = Object.values(ServiceTaskStatus).includes(query?.status as ServiceTaskStatus)
      ? (query?.status as ServiceTaskStatus)
      : undefined;
    const beauticianId = Number.isFinite(Number(query?.beauticianId)) ? Number(query?.beauticianId) : undefined;

    const tasks = await this.prisma.serviceTask.findMany({
      where: {
        storeId,
        ...(beauticianId ? { beauticianId } : {}),
        ...(status
          ? { status }
          : {
              OR: [
                ...(terminalDeviceId ? [{ deviceId: terminalDeviceId }] : []),
                { status: { in: ['pending', 'in_progress'] } },
              ],
            }),
        appointmentTime: { gte: day, lt: nextDay },
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
        appointmentTime: dto.appointmentTime ? new Date(dto.appointmentTime) : new Date(),
        duration: dto.duration || 60,
        remark: dto.remark,
        status: 'pending',
      },
      include: { project: true },
    });
    this.invalidateReservationDashboardCache(storeId, true);

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
    this.invalidateReservationDashboardCache(task.storeId);
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
    this.invalidateReservationDashboardCache(updated.storeId);
    if (Array.isArray(dto?.consumptionItems) && dto.consumptionItems.length) {
      this.invalidateInventoryDashboardCache(updated.storeId);
    }
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
    this.invalidateReservationDashboardCache(task.storeId);
    return this.mapServiceTask(updated);
  }

  async getServiceRecord(taskId: number) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task) throw new NotFoundException('服务任务不存在');
    const customer = await this.prisma.customer.findUnique({ where: { id: task.customerId } });
    const mappedTask = await this.mapServiceTask(task);
    const record = await this.prisma.consumptionRecord.findFirst({
      where: {
        customerId: task.customerId,
        consumeType: '服务记录',
        consumeTime: {
          gte: task.startedAt ?? task.appointmentTime,
        },
      },
      orderBy: { consumeTime: 'desc' },
    });
    return {
      task: mappedTask,
      customerName: customer?.name ?? mappedTask.customerName,
      result: task.remark ?? record?.campaign ?? '',
      images: task.images ?? [],
      consumptionItems: (task.consumptionItems as any[]) ?? [],
      record: record
        ? {
            id: record.id,
            consumeContent: record.consumeContent,
            note: record.campaign,
            createdAt: record.consumeTime.toISOString(),
          }
        : undefined,
    };
  }

  async createServiceRecord(storeId: number, dto: CreateTerminalServiceRecordDto) {
    const consumptionItems = Array.isArray(dto.consumptionItems) ? dto.consumptionItems : [];
    const note = [dto.result, dto.customerFeedback, dto.nextSuggestion, dto.remark].filter(Boolean).join('\n');
    const result = await this.prisma.$transaction(async (tx) => {
      const existingTask = dto.taskId ? await tx.serviceTask.findFirst({ where: { id: dto.taskId, storeId } }) : null;
      const customerId = existingTask?.customerId ?? dto.customerId;
      const projectId = existingTask?.projectId ?? dto.projectId;
      if (!customerId) throw new BadRequestException('服务记录必须选择客户');
      if (!projectId) throw new BadRequestException('服务记录必须选择项目');

      const task = existingTask
        ? await tx.serviceTask.update({
            where: { id: existingTask.id },
            data: {
              status: 'completed',
              startedAt: existingTask.startedAt ?? new Date(),
              completedAt: new Date(),
              beauticianId: dto.beauticianId ?? existingTask.beauticianId,
              remark: note || existingTask.remark,
              consumptionItems: consumptionItems as any,
              images: dto.images ?? existingTask.images,
            },
            include: { project: true },
          })
        : await tx.serviceTask.create({
            data: {
              taskNo: this.createSequenceNo('T'),
              storeId,
              customerId,
              projectId,
              beauticianId: dto.beauticianId,
              appointmentTime: new Date(),
              duration: 60,
              status: 'completed',
              startedAt: new Date(),
              completedAt: new Date(),
              remark: note,
              consumptionItems: consumptionItems as any,
              images: dto.images ?? [],
            },
            include: { project: true },
          });

      for (const item of consumptionItems) {
        await this.createStockMovementForItem(tx, storeId, item, 'service_consume', {
          type: 'service_record',
          id: task.id,
          no: task.taskNo,
          remark: note,
        });
      }

      const consumptionRecord = await tx.consumptionRecord.create({
        data: {
          customerId,
          consumeType: '服务记录',
          consumeContent: JSON.stringify({
            taskId: task.id,
            projectId,
            result: dto.result,
            customerFeedback: dto.customerFeedback,
            nextSuggestion: dto.nextSuggestion,
            nextReservationSuggestion: dto.nextReservationSuggestion,
            consumptionItems,
          }),
          payMethod: 'service',
          amount: 0,
          campaign: note || dto.nextReservationSuggestion,
        },
      });

      return { task, consumptionRecord };
    });
    this.invalidateReservationDashboardCache(storeId, true);
    this.invalidateCustomerDashboardCache(storeId);
    if (consumptionItems.length) {
      this.invalidateInventoryDashboardCache(storeId);
    }

    return {
      task: await this.mapServiceTask(result.task),
      serviceRecord: {
        id: result.consumptionRecord.id,
        customerId: result.consumptionRecord.customerId,
        consumeContent: result.consumptionRecord.consumeContent,
        note: result.consumptionRecord.campaign,
        createdAt: result.consumptionRecord.consumeTime.toISOString(),
      },
      nextActions: [
        ...(dto.transferToCashier ? ['transfer_cashier'] : []),
        ...(dto.nextReservationSuggestion ? ['create_next_reservation'] : []),
      ],
    };
  }

  async updateServiceRecord(storeId: number, taskId: number, dto: CreateTerminalServiceRecordDto) {
    const task = await this.prisma.serviceTask.findFirst({ where: { id: taskId, storeId } });
    if (!task) throw new NotFoundException('服务任务不存在');
    return this.createServiceRecord(storeId, {
      ...dto,
      taskId,
      customerId: dto.customerId ?? task.customerId,
      projectId: dto.projectId ?? task.projectId,
      beauticianId: dto.beauticianId ?? task.beauticianId ?? undefined,
    });
  }

  async transferTaskToCashier(taskId: number, remark?: string) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
      include: { project: true, customer: true, store: true },
    });
    if (!task) throw new NotFoundException('服务任务不存在');
    return {
      taskId: task.id,
      customerId: task.customerId,
      customerName: task.customer.name,
      customerPhone: task.customer.phone,
      storeId: task.storeId,
      storeName: task.store.name,
      items: [
        {
          itemType: 'project',
          itemId: task.projectId,
          name: task.project.name,
          quantity: 1,
          unitPrice: this.toNumber(task.project.price),
          subtotal: this.toNumber(task.project.price),
        },
      ],
      remark: remark ?? `服务任务 ${task.taskNo} 转前台收银`,
    };
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
      const projectIncluded = projects.some((p: any) => p.projectId === dto.projectId || p.id === dto.projectId);
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
    const cardsService = this.cardsService ?? new CardsService(this.prisma, this.commissionService);
    const record = await cardsService.verifyCardUsage({
      customerCardId: dto.customerCardId,
      customerId: dto.customerId,
      projectId: dto.projectId,
      times: dto.times,
      operatorId: dto.operatorId,
      beauticianId: dto.beauticianId && dto.beauticianId > 0 ? dto.beauticianId : undefined,
      deviceId: terminalDeviceId,
    });

    this.invalidateCardDashboardCache(record.storeId);
    this.invalidateInventoryDashboardCache(record.storeId);
    return {
      id: record.id,
      customerId: record.customerId,
      customerName: record.customerName,
      cardName: record.cardName,
      projectName: record.projectName,
      times: record.times,
      remainingTimes: record.remainingTimes,
      beauticianId: record.beauticianId,
      deviceId: terminalDeviceId,
      verifiedAt: record.verifiedAt,
      recognizedAmount: this.toNumber(record.recognizedAmount),
    };
  }

  // ─── Cashier ────────────────────────────────────────────────────────────────

  private async ensureOpenCashierShift(storeId: number, deviceId?: number) {
    if (!deviceId) return;
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { shiftRequired: true },
    });
    if (store?.shiftRequired === false) return;
    const shift = await this.prisma.cashierShift.findFirst({
      where: { storeId, deviceId, status: 'open' },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });
    if (!shift) throw new BadRequestException('当前终端未开班，请先开班后再收银');
  }

  private scheduleCheckoutPostCommitTasks(input: {
    storeId: number;
    dto: CheckoutDto;
    order: { id: number; customerId?: number | null };
    totalAmount: number;
    paymentMethod: string;
    itemCount: number;
    deviceId?: number;
  }) {
    setTimeout(() => {
      void this.runCheckoutPostCommitTasks(input).catch((error) => {
        console.warn('Terminal checkout post-commit tasks failed', error);
      });
    }, 0);
  }

  private async runCheckoutPostCommitTasks(input: {
    storeId: number;
    dto: CheckoutDto;
    order: { id: number; customerId?: number | null };
    totalAmount: number;
    paymentMethod: string;
    itemCount: number;
    deviceId?: number;
  }) {
    await Promise.allSettled([
      this.recordCheckoutRecommendationConversion(
        input.storeId,
        input.dto,
        input.order.id,
        input.totalAmount,
        input.deviceId,
      ),
      this.commissionService.recordAmiContribution({
        storeId: input.storeId,
        category: 'cashier_assist',
        triggerType: 'terminal_checkout',
        triggerId: input.order.id,
        customerId: input.dto.customerId,
        orderId: input.order.id,
        workMinutes: 2,
        metadata: { paymentMethod: input.paymentMethod, itemCount: input.itemCount },
      }),
      this.refreshDailySettlementForOrder(input.storeId, input.order.id, 'terminal_checkout'),
    ]);
  }

  private async refreshDailySettlementForOrder(storeId: number, orderId: number, source: string) {
    try {
      const order = await this.prisma.productOrder.findUnique({
        where: { id: orderId },
        select: { createdAt: true, status: true },
      });
      if (!order || !['completed', 'paid'].includes(order.status)) return;
      await this.commissionService.generateDailySettlement(storeId, order.createdAt);
    } catch (error) {
      console.warn(`Daily settlement refresh failed after ${source}`, error);
    }
  }

  async checkout(storeId: number, dto: CheckoutDto, deviceId?: number) {
    await this.ensureOpenCashierShift(storeId, deviceId);
    const paymentMethod = this.getPaymentMethod(dto.payMethod);
    const store = await this.getStore(storeId);
    const resolvedDtoItems = await this.resolveOrderItemBeauticianIds(storeId, dto.items as any[]);
    const normalizedItems = await this.resolveOrderItemNames(resolvedDtoItems);
    const allocation = this.discountAllocationService.allocate({
      items: normalizedItems,
      discountMode: dto.discountMode,
      discountAmount: dto.discountAmount,
      discountRate: dto.discountRate,
      packagePrice: dto.packagePrice,
      allocationMethod: dto.allocationMethod,
      discountSource: dto.discountSource,
      promotionId: dto.promotionId,
      couponId: dto.couponId,
      reason: dto.remark,
    });
    const totalAmount = allocation.order.netAmount;
    const allocatedItems = allocation.items.map((item, index) => ({
      ...item,
      beauticianId: item.beauticianId ?? (this.toNumber(resolvedDtoItems[index]?.beauticianId ?? dto.beauticianId) || undefined),
    }));
    const itemGroups = this.groupCheckoutItemsByKind(allocatedItems);
    const checkoutGroupNo = `PO${Date.now().toString(36).toUpperCase()}`;
    const shouldLoadCustomer = paymentMethod === 'member_balance' || !dto.customerName;
    const customer =
      dto.customerId && shouldLoadCustomer ? await this.prisma.customer.findUnique({ where: { id: dto.customerId } }) : null;
    const customerName = customer?.name ?? dto.customerName;
    const customerPhone = customer?.phone ?? dto.customerPhone;
    if (paymentMethod === 'member_balance' && !customer) {
      throw new BadRequestException('会员余额支付必须选择客户');
    }

    const ordersService = this.ordersService ?? new OrdersService(this.prisma, this.commissionService, this.discountAllocationService);
    const createdOrders: any[] = [];
    for (const group of itemGroups) {
      const summary = this.summarizeCheckoutItems(group.items);
      const orderNo =
        itemGroups.length > 1
          ? `${checkoutGroupNo}-${this.getCheckoutOrderKindSuffix(group.kind)}`
          : checkoutGroupNo;
      const groupOrder = await ordersService.createProductOrder({
        orderNo,
        checkoutGroupNo,
        orderKind: group.kind,
        customerId: dto.customerId,
        customerName,
        customerPhone,
        storeId,
        status: 'completed',
        payMethod: paymentMethod,
        paymentMethod,
        paidAmount: summary.netAmount,
        source: 'terminal',
        preAllocatedDiscount: true,
        items: group.items.map((item) => ({
          ...item,
          beauticianId: this.toNumber(item.beauticianId ?? dto.beauticianId) || undefined,
        })),
        discountMode: summary.orderDiscountAmount > 0 ? 'manual' : 'none',
        discountAmount: summary.orderDiscountAmount,
        allocationMethod: summary.orderDiscountAmount > 0 ? 'manual' : 'none',
        discountSource: allocation.order.discountSource,
        promotionId: allocation.order.promotionId,
        couponId: allocation.order.couponId,
        packageId: allocation.order.packageId,
        discountReason: dto.remark,
        beauticianId: dto.beauticianId,
        isDesignated: dto.isDesignated,
        remark: dto.remark,
        skipDailySettlementRefresh: true,
        dailySettlementSource: 'terminal_checkout',
      });
      createdOrders.push(groupOrder);
    }
    const result = { order: createdOrders[0], orders: createdOrders, customer, customerName, customerPhone, checkoutGroupNo };
    for (const order of result.orders) {
      this.scheduleCheckoutPostCommitTasks({
        storeId,
        dto,
        order,
        totalAmount: this.toNumber(order.netAmount ?? order.totalAmount),
        paymentMethod,
        itemCount: normalizedItems.length,
        deviceId,
      });
    }
    const responseItems = allocatedItems;
    this.invalidateCashierDashboardCache(storeId);
    if (
      resolvedDtoItems.some((item) => item.itemType === 'project' || item.projectId || item.itemType === 'product' || item.productId)
    ) {
      this.invalidateInventoryDashboardCache(storeId);
    }

    return {
      id: result.order.id,
      orderNo: result.order.orderNo,
      checkoutGroupNo: result.checkoutGroupNo,
      orderKind: itemGroups.length > 1 ? 'mixed' : result.order.orderKind,
      splitOrderIds: result.orders.map((order: any) => order.id),
      splitOrderNos: result.orders.map((order: any) => order.orderNo),
      customerId: dto.customerId,
      customerName: result.order.customerName ?? result.customerName ?? result.customer?.name ?? '',
      customerPhone: result.customerPhone ?? result.customer?.phone ?? '',
      storeId,
      storeName: store.name,
      items: responseItems.map((item) => ({
        itemType: item.itemType,
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        listAmount: item.listAmount,
        subtotal: item.subtotal,
        discount: item.discount,
        itemDiscountAmount: item.itemDiscountAmount,
        orderAllocatedDiscountAmount: item.orderAllocatedDiscountAmount,
        totalDiscountAmount: item.totalDiscountAmount,
        netAmount: item.netAmount,
        discountSource: item.discountSource,
        allocationMethod: item.allocationMethod,
        isGift: item.isGift,
        eligibleForOrderDiscount: item.eligibleForOrderDiscount,
      })),
      totalAmount,
      listAmount: allocation.order.listAmount,
      itemDiscountAmount: allocation.order.itemDiscountAmount,
      orderDiscountAmount: allocation.order.orderDiscountAmount,
      totalDiscountAmount: allocation.order.totalDiscountAmount,
      netAmount: allocation.order.netAmount,
      discountSource: allocation.order.discountSource,
      allocationMethod: allocation.order.allocationMethod,
      promotionId: allocation.order.promotionId,
      couponId: allocation.order.couponId,
      packageId: allocation.order.packageId,
      discountPayload: allocation.order.discountPayload,
      status: 'completed',
      paymentMethod,
      createdAt: this.toIso(result.order.createdAt) || new Date().toISOString(),
      paidAt: this.toIso(result.order.createdAt) || new Date().toISOString(),
      completedAt: this.toIso(result.order.updatedAt ?? result.order.createdAt) || new Date().toISOString(),
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
    await this.createPaymentRecord(
      this.prisma,
      order.id,
      dto.paymentMethod ?? order.payMethod,
      paidAmount,
      dto.transactionNo,
    );
    await this.applyMarketingAttribution(this.prisma, order, paidAmount);
    await this.refreshDailySettlementForOrder(order.storeId ?? 0, order.id, 'terminal_payment');
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

  async createCardOrder(storeId: number, dto: CreateCardOrderDto, currentUserId?: number) {
    const ordersService = this.ordersService ?? new OrdersService(this.prisma, this.commissionService, this.discountAllocationService);
    const result = await ordersService.createCardOrder(
      storeId,
      {
        ...dto,
        operatorId: this.toNumber(dto.operatorId) || this.toNumber(currentUserId) || undefined,
        paymentMethod: dto.paymentMethod,
        source: 'terminal',
      },
      currentUserId,
    );
    this.invalidateCardDashboardCache(storeId);
    this.invalidateCashierDashboardCache(storeId);
    return result;
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
    const ordersService = this.ordersService ?? new OrdersService(this.prisma, this.commissionService, this.discountAllocationService);
    const result = await ordersService.createRechargeOrder({
      storeId,
      customerId: dto.customerId,
      customerName: customer?.name ?? dto.customerName,
      amount,
      giftAmount,
      giftProjects,
      paymentMethod: dto.paymentMethod,
      transactionNo: dto.transactionNo,
      remark: dto.remark,
      beauticianId: dto.beauticianId,
      source: 'terminal',
    });

    this.invalidateCashierDashboardCache(storeId);
    return {
      id: result.orderId,
      orderNo: result.orderNo,
      customerId: dto.customerId,
      customerName: customer?.name ?? dto.customerName,
      customerPhone: customer?.phone ?? dto.customerPhone ?? '',
      storeId,
      storeName: store.name,
      amount,
      giftAmount,
      giftProjects,
      cashBalance: this.toNumber(result.cashBalance ?? result.availableBalance),
      giftBalance: this.toNumber(result.giftBalance),
      balanceTransactionId: result.balanceTransactionId,
      status: 'paid',
      paymentMethod: dto.paymentMethod,
      createdAt: this.toIso(result.orderCreatedAt ?? result.lastTransactionAt) || new Date().toISOString(),
      remark: dto.remark,
    };
  }

  async getCustomerBalance(storeId: number, customerId: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const account = await this.getOrCreateBalanceAccount(this.prisma, storeId, customerId);
    const lastTransaction = await this.prisma.customerBalanceTransaction.findFirst({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
    });
    return this.mapBalanceAccount(account, customer, lastTransaction);
  }

  async consumeBalance(storeId: number, dto: ConsumeBalanceDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const result = await this.prisma.$transaction((tx) =>
      this.writeBalanceTransaction(tx, storeId, {
        customerId: dto.customerId,
        type: 'consume',
        amount: this.toNumber(dto.amount),
        giftAmount: this.toNumber(dto.giftAmount),
        orderId: dto.orderId,
        paymentMethod: dto.paymentMethod ?? 'member_balance',
        remark: dto.remark,
      }),
    );
    return this.mapBalanceAccount(result.account, customer, result.transaction);
  }

  async refundBalance(storeId: number, dto: RefundBalanceDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const result = await this.prisma.$transaction((tx) =>
      this.writeBalanceTransaction(tx, storeId, {
        customerId: dto.customerId,
        type: 'refund',
        amount: this.toNumber(dto.amount),
        giftAmount: this.toNumber(dto.giftAmount),
        orderId: dto.orderId,
        paymentMethod: 'member_balance',
        remark: dto.remark,
      }),
    );
    return this.mapBalanceAccount(result.account, customer, result.transaction);
  }

  async adjustBalance(storeId: number, dto: AdjustBalanceDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const cashDelta = this.toNumber(dto.cashDelta);
    const giftDelta = this.toNumber(dto.giftDelta);
    if (cashDelta === 0 && giftDelta === 0) throw new BadRequestException('调整金额不能为 0');
    const result = await this.prisma.$transaction((tx) =>
      this.writeBalanceTransaction(tx, storeId, {
        customerId: dto.customerId,
        type: 'adjust',
        amount: cashDelta,
        giftAmount: giftDelta,
        paymentMethod: 'adjust',
        remark: dto.remark,
      }),
    );
    return this.mapBalanceAccount(result.account, customer, result.transaction);
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
        status: dto.status ?? 'queued',
        completedAt: ['completed'].includes(dto.status) ? new Date() : undefined,
      },
    });
    return this.mapPrintJob(storeId, job, store.name);
  }

  async listPrintJobs(storeId: number, query: any = {}) {
    const page = Number(query.page ?? 1);
    const pageSize = Math.min(Number(query.pageSize ?? 20), 100);
    const where: any = { storeId };
    if (query.sourceType) where.sourceType = String(query.sourceType);
    if (query.sourceId) where.sourceId = Number(query.sourceId);
    if (query.status) where.status = String(query.status);
    const [store, items, total] = await Promise.all([
      this.getStore(storeId),
      this.prisma.printJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.printJob.count({ where }),
    ]);
    return {
      items: await Promise.all(items.map((job) => this.mapPrintJob(storeId, job, store.name))),
      total,
      page,
      pageSize,
    };
  }

  async getPrintJob(storeId: number, id: number) {
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId } });
    if (!job) throw new NotFoundException('打印任务不存在');
    return this.mapPrintJob(storeId, job);
  }

  async retryPrintJob(storeId: number, id: number) {
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId } });
    if (!job) throw new NotFoundException('打印任务不存在');
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: {
        status: 'queued',
        errorMessage: null,
        completedAt: null,
      },
    });
    return this.mapPrintJob(storeId, updated);
  }

  async updatePrintJobStatus(storeId: number, id: number, dto: any) {
    const nextStatus = String(dto.status ?? '');
    if (!['queued', 'pending', 'printing', 'completed', 'failed'].includes(nextStatus)) {
      throw new BadRequestException('打印状态无效');
    }
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId } });
    if (!job) throw new NotFoundException('打印任务不存在');
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: {
        status: nextStatus,
        errorMessage: dto.errorMessage ?? null,
        completedAt: nextStatus === 'completed' ? new Date() : nextStatus === 'failed' ? null : job.completedAt,
      },
    });
    return this.mapPrintJob(storeId, updated);
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
        include: {
          operator: { select: { id: true, name: true, username: true } },
          beautician: { select: { id: true, name: true } },
          device: { select: { id: true, name: true, deviceCode: true } },
        },
        orderBy: { verifiedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.cardUsageRecord.count({ where }),
    ]);
    const mapped = items.map((item: any) => ({
      ...item,
      operatorName: item.operator?.name ?? item.operator?.username ?? '',
      beauticianName: item.beautician?.name ?? '',
      deviceName: item.device?.name ?? '',
      deviceCode: item.device?.deviceCode ?? '',
      operator: undefined,
      beautician: undefined,
      device: undefined,
    }));
    return { items: mapped, data: mapped, total, page, pageSize };
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
    const customer = dto.customerId
      ? await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { storeId: true } })
      : null;
    this.invalidateCustomerDashboardCache(customer?.storeId);

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
    const updated = await this.prisma.skinTest.update({ where: { id }, data: { customerId } });
    this.invalidateCustomerDashboardCache(customer.storeId);
    return updated;
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

  async getReservationAvailability(storeId: number, query: ReservationAvailabilityQueryDto) {
    const baseDate = query.date ? new Date(query.date) : new Date();
    if (Number.isNaN(baseDate.getTime())) throw new BadRequestException('查询日期无效');
    baseDate.setHours(0, 0, 0, 0);
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const project = query.projectId
      ? await this.prisma.project.findFirst({ where: { id: query.projectId, storeId, deletedAt: null } })
      : null;
    const duration = Number(query.duration || project?.duration || 60);
    const [beauticians, reservations, schedules] = await Promise.all([
      this.prisma.beautician.findMany({
        where: this.buildTerminalVisibleBeauticianWhere(
          storeId,
          query.beauticianId ? { id: query.beauticianId } : {},
        ),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: baseDate, lt: tomorrow },
          status: { notIn: ['cancelled', 'no_show'] },
          ...(query.beauticianId ? { beauticianId: query.beauticianId } : {}),
        },
      }),
      this.prisma.schedule.findMany({
        where: {
          storeId,
          date: { gte: baseDate, lt: tomorrow },
          status: 'available',
          ...(query.beauticianId ? { beauticianId: query.beauticianId } : {}),
        },
      }),
    ]);
    const toMinutes = (time?: string | null) => {
      const [hour, minute] = String(time || '00:00')
        .split(':')
        .map((item) => Number(item));
      return hour * 60 + (minute || 0);
    };
    const toTime = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const byBeautician = beauticians.map((beautician) => {
      const beauticianSchedules = schedules.filter((item) => item.beauticianId === beautician.id);
      const windows = beauticianSchedules.length
        ? beauticianSchedules.map((item) => ({ start: toMinutes(item.startTime), end: toMinutes(item.endTime) }))
        : [{ start: 10 * 60, end: 20 * 60 }];
      const occupied = reservations
        .filter((item) => item.beauticianId === beautician.id)
        .map((item) => ({
          start: toMinutes(item.startTime),
          end: toMinutes(item.endTime) || toMinutes(item.startTime) + duration,
        }));
      const slots = windows.flatMap((window) => {
        const result: Array<{ time: string; available: boolean; reason?: string }> = [];
        for (let cursor = window.start; cursor + duration <= window.end; cursor += 30) {
          const conflict = occupied.some((item) => cursor < item.end && cursor + duration > item.start);
          result.push({ time: toTime(cursor), available: !conflict, reason: conflict ? '该时段已有预约' : undefined });
        }
        return result;
      });
      return {
        beauticianId: beautician.id,
        beauticianName: beautician.name,
        slots,
      };
    });

    return {
      storeId,
      date: formatBusinessDate(baseDate),
      projectId: project?.id ?? query.projectId,
      projectName: project?.name,
      duration,
      items: byBeautician,
    };
  }

  async createReservation(storeId: number, dto: CreateReservationDto) {
    const appointment = new Date(dto.appointmentTime);
    if (Number.isNaN(appointment.getTime())) {
      throw new BadRequestException('预约时间无效');
    }
    const customer = dto.customerId
      ? await this.prisma.customer.findUnique({ where: { id: dto.customerId } })
      : await this.prisma.customer.create({
          data: {
            storeId,
            name: dto.customerName || '新客户',
            phone: dto.customerPhone || '',
            gender: '女',
            source: 'terminal',
          },
        });
    if (!customer) throw new NotFoundException('客户不存在');
    const project = dto.projectId
      ? await this.prisma.project.findUnique({ where: { id: dto.projectId } })
      : dto.projectName
        ? await this.prisma.project.findFirst({
            where: { storeId, name: { contains: dto.projectName }, deletedAt: null },
          })
        : await this.prisma.project.findFirst({ where: { storeId, deletedAt: null, status: 'active' } });
    if (!project) throw new BadRequestException('当前门店没有可预约项目');
    const beautician = dto.beauticianId
      ? await this.prisma.beautician.findFirst({ where: { id: dto.beauticianId, storeId } })
      : dto.beauticianName
        ? await this.prisma.beautician.findFirst({
            where: { storeId, name: { contains: dto.beauticianName }, status: 'active' },
          })
        : null;
    const startTime = appointment.toTimeString().slice(0, 5);
    const end = new Date(appointment);
    end.setMinutes(end.getMinutes() + (dto.duration ?? project.duration ?? 60));
    const reservation = await this.prisma.reservation.create({
      data: {
        storeId,
        customerId: customer.id,
        projectId: project.id,
        beauticianId: beautician?.id ?? dto.beauticianId,
        date: appointment,
        startTime,
        endTime: end.toTimeString().slice(0, 5),
        status: 'pending',
        remark: dto.remark,
      },
    });
    this.invalidateReservationDashboardCache(storeId, true);
    return this.mapReservation(reservation);
  }

  async updateReservation(reservationId: number, dto: UpdateReservationDto) {
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
        : new Date(`${this.toLocalDateText(reservation.date)}T${reservation.startTime || '00:00'}:00`);
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
    this.invalidateReservationDashboardCache(reservation.storeId, true);
    return this.mapReservation(updated);
  }

  async rescheduleReservation(reservationId: number, dto: RescheduleReservationDto) {
    const updated = await this.updateReservation(reservationId, {
      appointmentTime: dto.appointmentTime,
      duration: dto.duration,
      beauticianId: dto.beauticianId,
      remark: dto.reason ? `改期原因：${dto.reason}` : undefined,
    });
    return { ...updated, rescheduleReason: dto.reason };
  }

  async markReservationNoShow(reservationId: number, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['completed', 'cancelled'].includes(reservation.status)) {
      throw new BadRequestException('当前预约状态不能标记爽约');
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'no_show', remark: reason || reservation.remark },
    });
    this.invalidateReservationDashboardCache(reservation.storeId);
    return this.mapReservation(updated);
  }

  async createTaskFromReservation(reservationId: number, deviceId?: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['cancelled', 'no_show'].includes(reservation.status)) {
      throw new BadRequestException('已取消或爽约的预约不能创建服务任务');
    }
    const appointmentTime = new Date(
      `${this.toLocalDateText(reservation.date)}T${reservation.startTime || '00:00'}:00`,
    );
    const existing = await this.prisma.serviceTask.findFirst({
      where: {
        storeId: reservation.storeId,
        customerId: reservation.customerId,
        projectId: reservation.projectId,
        beauticianId: reservation.beauticianId,
        appointmentTime,
        status: { not: 'cancelled' },
      },
      include: { project: true },
    });
    if (existing) return this.mapServiceTask(existing);

    const project = await this.prisma.project.findUnique({ where: { id: reservation.projectId } });
    const task = await this.prisma.serviceTask.create({
      data: {
        taskNo: this.createSequenceNo('T'),
        storeId: reservation.storeId,
        deviceId: this.toTerminalDeviceId(deviceId),
        customerId: reservation.customerId,
        projectId: reservation.projectId,
        beauticianId: reservation.beauticianId,
        appointmentTime,
        duration: project?.duration ?? 60,
        status: 'pending',
        remark: `由预约 R${String(reservation.id).padStart(6, '0')} 到店创建`,
      },
      include: { project: true },
    });
    return this.mapServiceTask(task);
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
    this.invalidateReservationDashboardCache(reservation.storeId);
    return this.mapReservation(updated);
  }

  async checkInReservation(reservationId: number, deviceId?: number) {
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
    const [mapped, serviceTask] = await Promise.all([
      this.mapReservation(updated),
      this.createTaskFromReservation(reservationId, deviceId).catch(() => null),
    ]);
    this.invalidateReservationDashboardCache(reservation.storeId);
    return { ...mapped, serviceTask: serviceTask ?? undefined };
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
    this.invalidateReservationDashboardCache(reservation.storeId, true);
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
      const currentStock = this.toNonNegativeStock(item.currentStock);
      const safetyStock = this.toNonNegativeStock(item.safetyStock);
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
        currentStock: this.toNonNegativeStock(item.currentStock),
        reserved: 0,
        availableStock: this.toNonNegativeStock(item.currentStock),
        safetyStock: this.toNonNegativeStock(item.safetyStock),
        maxStock: Math.max(this.toNonNegativeStock(item.safetyStock) * 3, this.toNonNegativeStock(item.currentStock)),
        minStock: this.toNonNegativeStock(item.safetyStock),
        status: this.toNonNegativeStock(item.currentStock) <= 0 ? '缺货' : '低库存',
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
    if (storeId) {
      this.invalidateInventoryDashboardCache(storeId);
      this.invalidateCustomerDashboardCache(storeId);
    }
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

  private async recordCheckoutRecommendationConversion(
    storeId: number,
    dto: CheckoutDto,
    orderId: number,
    totalAmount: number,
    deviceId?: number,
  ) {
    const recommendationId = dto.matchedRecommendationId ?? dto.recommendationId;
    if (!dto.customerId || !recommendationId) return;
    await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: Number(dto.customerId),
        deviceId: this.toTerminalDeviceId(deviceId),
        recommendationId: Number(recommendationId),
        eventType: 'converted',
        orderId,
        payload: {
          amount: totalAmount,
          payMethod: dto.payMethod,
          itemCount: dto.items.length,
          items: dto.items.map((item) => ({ ...item })),
          source: 'terminal_checkout',
        } as any,
      },
    });
  }

  async createFollowUpTask(
    storeId: number,
    deviceId: number | undefined,
    dto: CreateTerminalFollowUpTaskDto,
    assignedByUserId?: number,
  ) {
    if (!dto.customerId) throw new BadRequestException('customerId is required');
    const customer = await this.prisma.customer.findFirst({
      where: { id: Number(dto.customerId), storeId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const taskDelegate = this.getFollowUpTaskDelegate();
    const assignment = await this.inferFollowUpAssignment(storeId, customer.id, dto);
    const explicitAssigneeUserId = dto.assigneeUserId ? Number(dto.assigneeUserId) : undefined;
    if (explicitAssigneeUserId) await this.assertFollowUpAssigneeUser(storeId, explicitAssigneeUserId);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : this.inferFollowUpDueAt(dto);
    const title = dto.title ?? this.buildFollowUpTaskTitle(dto);
    const priority = this.normalizeFollowUpPriority(dto.priority, dto);
    const note = dto.note ?? dto.remark ?? undefined;

    if (taskDelegate?.findFirst && taskDelegate?.create) {
      try {
        const dedupeOr = [
          ...(dto.recommendationId ? [{ recommendationId: Number(dto.recommendationId) }] : []),
          ...(dto.sourceRecommendationKey ? [{ sourceRecommendationKey: dto.sourceRecommendationKey }] : []),
        ];
        const existing = dedupeOr.length
          ? await taskDelegate.findFirst({
              where: {
                storeId,
                customerId: customer.id,
                deletedAt: null,
                status: { in: ['pending', 'in_progress', 'expired'] },
                OR: dedupeOr,
              },
              include: this.followUpTaskInclude(),
            })
          : null;
        if (existing) {
          return this.mapFollowUpTask(existing, { duplicated: true });
        }

        const task = await taskDelegate.create({
          data: {
            storeId,
            customerId: customer.id,
            recommendationId: dto.recommendationId ? Number(dto.recommendationId) : null,
            sourceRecommendationKey: dto.sourceRecommendationKey ?? null,
            source: dto.source ?? 'recommendation',
            triggerType: dto.triggerType ?? null,
            title,
            script: dto.script ?? note ?? null,
            note: note ?? null,
            priority,
            assigneeRole: dto.assigneeRole ?? assignment.assigneeRole,
            assigneeUserId: explicitAssigneeUserId ?? assignment.assigneeUserId ?? null,
            assigneeBeauticianId: dto.assigneeBeauticianId
              ? Number(dto.assigneeBeauticianId)
              : assignment.assigneeBeauticianId ?? null,
            assignedByUserId: assignedByUserId ?? null,
            assignedAt: new Date(),
            dueAt,
            status: 'pending',
            orderId: dto.orderId ? Number(dto.orderId) : null,
            serviceTaskId: dto.taskId ? Number(dto.taskId) : null,
            reservationId: dto.reservationId ? Number(dto.reservationId) : null,
            deviceId: terminalDeviceId ?? null,
            payload: {
              channel: dto.channel ?? 'phone',
              assignmentReason: assignment.reason,
              sourcePayload: dto,
            },
          },
          include: this.followUpTaskInclude(),
        });
        await this.recordFollowUpTaskEvent(storeId, customer.id, terminalDeviceId, 'follow_up_created', task, {
          ...dto,
          status: 'pending',
          assignmentReason: assignment.reason,
        });
        return this.mapFollowUpTask(task);
      } catch (error) {
        if (!this.isMissingFollowUpTaskTableError(error)) throw error;
      }
    }

    const event = await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: customer.id,
        deviceId: terminalDeviceId,
        recommendationId: dto.recommendationId ? Number(dto.recommendationId) : undefined,
        eventType: 'follow_up_created',
        taskId: dto.taskId ? Number(dto.taskId) : undefined,
        orderId: dto.orderId ? Number(dto.orderId) : undefined,
        note: dto.script ?? dto.note ?? dto.remark ?? '终端创建客户邀约跟进',
        payload: this.toJsonPayload({
          ...dto,
          status: 'pending',
          source: 'aura_lite_terminal',
          dueAt: dto.dueAt,
          channel: dto.channel ?? 'phone',
          assigneeRole: dto.assigneeRole ?? assignment.assigneeRole,
          assigneeUserId: explicitAssigneeUserId ?? assignment.assigneeUserId,
          assigneeBeauticianId: dto.assigneeBeauticianId ?? assignment.assigneeBeauticianId,
          assignmentReason: assignment.reason,
        }),
      },
    });
    return {
      id: event.id,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      status: 'pending',
      channel: dto.channel ?? 'phone',
      script: dto.script ?? dto.note ?? '',
      dueAt: dto.dueAt,
      title,
      priority,
      assigneeRole: dto.assigneeRole ?? assignment.assigneeRole,
      assigneeUserId: explicitAssigneeUserId ?? assignment.assigneeUserId,
      assigneeBeauticianId: dto.assigneeBeauticianId ?? assignment.assigneeBeauticianId,
      assignmentReason: assignment.reason,
      createdAt: event.createdAt.toISOString(),
    };
  }

  async batchCreateFollowUpTasks(
    storeId: number,
    dto: CreateTerminalFollowUpTaskDto & {
      customerIds?: number[];
      assignments?: Array<{
        customerId: number;
        assigneeRole?: CreateTerminalFollowUpTaskDto['assigneeRole'];
        assigneeUserId: number;
        assigneeBeauticianId?: number;
      }>;
    },
    assignedByUserId?: number,
  ) {
    const customerIds = Array.from(new Set((dto.customerIds ?? [dto.customerId]).map((id) => Number(id)).filter(Boolean)));
    if (!customerIds.length) throw new BadRequestException('customerIds is required');
    const assignmentByCustomerId = new Map(
      (dto.assignments ?? [])
        .filter((assignment) => Number(assignment.customerId) > 0 && Number(assignment.assigneeUserId) > 0)
        .map((assignment) => [Number(assignment.customerId), assignment]),
    );
    const requiresSystemUserAssignment = Boolean(dto.recommendationId || dto.source === 'recommendation');
    const results = await Promise.allSettled(
      customerIds.map((customerId) => {
        const assignment = assignmentByCustomerId.get(customerId);
        if (requiresSystemUserAssignment && !assignment) {
          return Promise.reject(new BadRequestException('该客户未匹配系统用户，不能下发终端跟进'));
        }
        return this.createFollowUpTask(
          storeId,
          undefined,
          {
            ...dto,
            customerId,
            ...(assignment
              ? {
                  assigneeRole: assignment.assigneeRole ?? dto.assigneeRole,
                  assigneeUserId: assignment.assigneeUserId,
                  assigneeBeauticianId: assignment.assigneeBeauticianId,
                }
              : {}),
          },
          assignedByUserId,
        );
      }),
    );
    const items = results
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failures = results
      .map((result, index) => ({ result, customerId: customerIds[index] }))
      .filter((item): item is { result: PromiseRejectedResult; customerId: number } => item.result.status === 'rejected')
      .map((item) => ({
        customerId: item.customerId,
        message: item.result.reason instanceof Error ? item.result.reason.message : '创建失败',
      }));
    return {
      items,
      total: customerIds.length,
      createdCount: items.filter((item) => !item.duplicated).length,
      duplicatedCount: items.filter((item) => item.duplicated).length,
      failedCount: failures.length,
      failures,
    };
  }

  async getFollowUpTasks(storeId: number, query: QueryTerminalFollowUpTasksDto = {}) {
    const taskDelegate = this.getFollowUpTaskDelegate();
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 10)));
    if (!taskDelegate?.findMany || !taskDelegate?.count) {
      return this.getLegacyFollowUpTasks(storeId, page, pageSize);
    }
    try {
      await this.expireOverdueFollowUpTasks(storeId);

      const where: any = {
        storeId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.assigneeRole ? { assigneeRole: query.assigneeRole } : {}),
        ...(query.assigneeUserId ? { assigneeUserId: Number(query.assigneeUserId) } : {}),
        ...(query.customerId ? { customerId: Number(query.customerId) } : {}),
        ...(query.recommendationId ? { recommendationId: Number(query.recommendationId) } : {}),
      };
      if (query.keyword) {
        const keyword = String(query.keyword).trim();
        where.OR = [
          { title: { contains: keyword, mode: 'insensitive' } },
          { note: { contains: keyword, mode: 'insensitive' } },
          { customer: { name: { contains: keyword, mode: 'insensitive' } } },
          { customer: { phone: { contains: keyword, mode: 'insensitive' } } },
        ];
      }
      const summaryScopeWhere = { ...where };
      delete summaryScopeWhere.status;
      const [items, total, grouped, booked, converted, convertedTasks, assigneeTasks] = await Promise.all([
        taskDelegate.findMany({
          where,
          include: this.followUpTaskInclude(),
          orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        taskDelegate.count({ where }),
        taskDelegate.groupBy({
          by: ['status'],
          where: summaryScopeWhere,
          _count: { _all: true },
        }),
        taskDelegate.count({
          where: {
            ...summaryScopeWhere,
            status: 'completed',
            OR: [{ resultType: 'booked' }, { reservationId: { not: null } }],
          },
        }),
        taskDelegate.count({
          where: {
            ...summaryScopeWhere,
            status: 'completed',
            OR: [{ resultType: 'converted' }, { orderId: { not: null } }],
          },
        }),
        taskDelegate.findMany({
          where: {
            ...summaryScopeWhere,
            status: 'completed',
            orderId: { not: null },
          },
          select: { order: { select: { totalAmount: true } } },
          take: 1000,
        }),
        taskDelegate.findMany({
          where: summaryScopeWhere,
          include: {
            assigneeUser: { select: { id: true, name: true, username: true } },
            assigneeBeautician: { select: { id: true, name: true } },
            order: { select: { totalAmount: true } },
          },
          take: 5000,
        }),
      ]);
      const now = new Date();
      const overdue = await taskDelegate.count({
        where: {
          ...summaryScopeWhere,
          status: { in: ['pending', 'in_progress'] },
          dueAt: { lt: now },
        },
      });
      const summary = grouped.reduce(
        (acc: Record<string, number>, item: any) => {
          acc[item.status] = item._count?._all ?? 0;
          return acc;
        },
        {
          pending: 0,
          in_progress: 0,
          completed: 0,
          cancelled: 0,
          expired: 0,
          overdue,
          booked,
          converted,
          revenue: convertedTasks.reduce((sum: number, task: any) => sum + Number(task.order?.totalAmount ?? 0), 0),
        },
      );
      const assigneeStats = this.buildFollowUpAssigneeStats(assigneeTasks);
      return {
        items: items.map((item: any) => this.mapFollowUpTask(item)),
        total,
        page,
        pageSize,
        summary: { ...summary, assigneeStats },
      };
    } catch (error) {
      if (this.isMissingFollowUpTaskTableError(error)) {
        return this.getLegacyFollowUpTasks(storeId, page, pageSize);
      }
      throw error;
    }
  }

  async startFollowUpTask(storeId: number, id: number, userId?: number) {
    const taskDelegate = this.getFollowUpTaskDelegate();
    if (taskDelegate?.findFirst && taskDelegate?.update) {
      try {
        const existing = await taskDelegate.findFirst({ where: { id, storeId, deletedAt: null } });
        if (!existing) throw new NotFoundException('跟进任务不存在');
        const task = await taskDelegate.update({
          where: { id },
          data: {
            status: existing.status === 'pending' || existing.status === 'expired' ? 'in_progress' : existing.status,
            assigneeUserId: existing.assigneeUserId ?? userId ?? null,
          },
          include: this.followUpTaskInclude(),
        });
        await this.recordFollowUpTaskEvent(storeId, task.customerId, task.deviceId, 'follow_up_started', task, {
          userId,
          previousStatus: existing.status,
        });
        return this.mapFollowUpTask(task);
      } catch (error) {
        if (!this.isMissingFollowUpTaskTableError(error)) throw error;
      }
    }
    const existing = await this.prisma.recommendationEvent.findFirst({
      where: { id, storeId, eventType: 'follow_up_created' },
      include: { customer: true },
    });
    if (!existing) throw new NotFoundException('跟进任务不存在');
    await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: existing.customerId,
        deviceId: existing.deviceId,
        recommendationId: existing.recommendationId,
        eventType: 'follow_up_started',
        taskId: existing.taskId,
        orderId: existing.orderId,
        note: '终端开始处理客户邀约跟进',
        payload: { sourceFollowUpTaskId: existing.id, status: 'in_progress', userId },
      },
    });
    return { ...this.mapLegacyFollowUpEvent(existing), status: 'in_progress' };
  }

  async assignFollowUpTask(storeId: number, id: number, dto: AssignTerminalFollowUpTaskDto) {
    const taskDelegate = this.getFollowUpTaskDelegate();
    if (taskDelegate?.findFirst && taskDelegate?.update) {
      try {
        const existing = await taskDelegate.findFirst({ where: { id, storeId, deletedAt: null } });
        if (!existing) throw new NotFoundException('跟进任务不存在');
        const task = await taskDelegate.update({
          where: { id },
          data: {
            assigneeRole: dto.assigneeRole,
            assigneeUserId: dto.assigneeUserId ? Number(dto.assigneeUserId) : null,
            assigneeBeauticianId: dto.assigneeBeauticianId ? Number(dto.assigneeBeauticianId) : null,
            status: existing.status === 'completed' || existing.status === 'cancelled' ? existing.status : 'pending',
            note: dto.note ?? existing.note,
          },
          include: this.followUpTaskInclude(),
        });
        await this.recordFollowUpTaskEvent(storeId, task.customerId, task.deviceId, 'follow_up_assigned', task, dto);
        return this.mapFollowUpTask(task);
      } catch (error) {
        if (!this.isMissingFollowUpTaskTableError(error)) throw error;
      }
    }
    const existing = await this.prisma.recommendationEvent.findFirst({
      where: { id, storeId, eventType: 'follow_up_created' },
      include: { customer: true },
    });
    if (!existing) throw new NotFoundException('跟进任务不存在');
    await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: existing.customerId,
        deviceId: existing.deviceId,
        recommendationId: existing.recommendationId,
        eventType: 'follow_up_assigned',
        taskId: existing.taskId,
        orderId: existing.orderId,
        note: dto.note ?? '终端跟进任务改派',
        payload: { ...dto, sourceFollowUpTaskId: existing.id, status: 'pending' },
      },
    });
    return { ...this.mapLegacyFollowUpEvent(existing), ...dto, status: 'pending' };
  }

  async completeFollowUpTask(
    storeId: number,
    id: number,
    dto: CompleteTerminalFollowUpTaskDto,
    completedByUserId?: number,
  ) {
    const taskDelegate = this.getFollowUpTaskDelegate();
    if (taskDelegate?.findFirst && taskDelegate?.update) {
      try {
        const existing = await taskDelegate.findFirst({ where: { id, storeId, deletedAt: null } });
        if (!existing) throw new NotFoundException('跟进任务不存在');
        const task = await taskDelegate.update({
          where: { id },
          data: {
            status: 'completed',
            resultType: dto.resultType ?? (dto.orderId ? 'converted' : dto.reservationId ? 'booked' : 'contacted'),
            resultNote: dto.result ?? dto.note ?? null,
            orderId: dto.orderId ? Number(dto.orderId) : existing.orderId,
            reservationId: dto.reservationId ? Number(dto.reservationId) : existing.reservationId,
            completedByUserId: completedByUserId ?? null,
            completedAt: new Date(),
          },
          include: this.followUpTaskInclude(),
        });
        const completionEvent = await this.recordFollowUpTaskEvent(storeId, task.customerId, task.deviceId, 'follow_up_completed', task, dto);
        return { ...this.mapFollowUpTask(task), completionEventId: completionEvent?.id };
      } catch (error) {
        if (!this.isMissingFollowUpTaskTableError(error)) throw error;
      }
    }

    const existing = await this.prisma.recommendationEvent.findFirst({
      where: { id, storeId, eventType: 'follow_up_created' },
    });
    if (!existing) throw new NotFoundException('跟进任务不存在');
    const event = await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: existing.customerId,
        deviceId: existing.deviceId,
        recommendationId: existing.recommendationId,
        eventType: 'follow_up_completed',
        taskId: existing.taskId,
        orderId: dto.orderId ? Number(dto.orderId) : existing.orderId,
        note: dto.result ?? dto.note ?? '终端完成客户邀约跟进',
        payload: {
          ...dto,
          sourceFollowUpTaskId: existing.id,
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
      },
    });
    return {
      id: existing.id,
      completionEventId: event.id,
      customerId: existing.customerId,
      status: 'completed',
      result: dto.result ?? dto.note ?? '',
      resultType: dto.resultType ?? (dto.orderId ? 'converted' : 'contacted'),
      completedAt: event.createdAt.toISOString(),
    };
  }

  async cancelFollowUpTask(storeId: number, id: number, note?: string) {
    const taskDelegate = this.getFollowUpTaskDelegate();
    if (taskDelegate?.findFirst && taskDelegate?.update) {
      try {
        const existing = await taskDelegate.findFirst({ where: { id, storeId, deletedAt: null } });
        if (!existing) throw new NotFoundException('跟进任务不存在');
        const task = await taskDelegate.update({
          where: { id },
          data: { status: 'cancelled', resultNote: note ?? null },
          include: this.followUpTaskInclude(),
        });
        await this.recordFollowUpTaskEvent(storeId, task.customerId, task.deviceId, 'follow_up_cancelled', task, { note });
        return this.mapFollowUpTask(task);
      } catch (error) {
        if (!this.isMissingFollowUpTaskTableError(error)) throw error;
      }
    }
    const existing = await this.prisma.recommendationEvent.findFirst({
      where: { id, storeId, eventType: 'follow_up_created' },
      include: { customer: true },
    });
    if (!existing) throw new NotFoundException('跟进任务不存在');
    await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: existing.customerId,
        deviceId: existing.deviceId,
        recommendationId: existing.recommendationId,
        eventType: 'follow_up_cancelled',
        taskId: existing.taskId,
        orderId: existing.orderId,
        note: note ?? '终端跟进任务取消',
        payload: { sourceFollowUpTaskId: existing.id, status: 'cancelled', note },
      },
    });
    return { ...this.mapLegacyFollowUpEvent(existing), status: 'cancelled', resultNote: note };
  }

  private getFollowUpTaskDelegate() {
    return (this.prisma as any).terminalFollowUpTask;
  }

  private toJsonPayload(value: Record<string, any>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async getLegacyFollowUpTasks(storeId: number, page: number, pageSize: number) {
    const events = await this.prisma.recommendationEvent.findMany({
      where: { storeId, eventType: 'follow_up_created' },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await this.prisma.recommendationEvent.count({ where: { storeId, eventType: 'follow_up_created' } });
    return {
      items: events.map((event) => this.mapLegacyFollowUpEvent(event)),
      total,
      page,
      pageSize,
      summary: {
        pending: total,
        inProgress: 0,
        completed: 0,
        expired: 0,
        overdue: 0,
        booked: 0,
        converted: 0,
        revenue: 0,
        assigneeStats: [],
      },
    };
  }

  private isMissingFollowUpTaskTableError(error: unknown) {
    const candidate = error as { code?: string; meta?: { modelName?: string; driverAdapterError?: { cause?: { kind?: string } } } };
    return (
      candidate?.code === 'P2021' &&
      candidate.meta?.modelName === 'TerminalFollowUpTask' &&
      candidate.meta?.driverAdapterError?.cause?.kind === 'TableDoesNotExist'
    );
  }

  private async expireOverdueFollowUpTasks(storeId: number) {
    const taskDelegate = this.getFollowUpTaskDelegate();
    if (!taskDelegate?.findMany || !taskDelegate?.update) return;
    const overdueTasks = await taskDelegate.findMany({
      where: {
        storeId,
        deletedAt: null,
        status: { in: ['pending', 'in_progress'] },
        dueAt: { lt: new Date() },
      },
      select: {
        id: true,
        priority: true,
        assigneeRole: true,
        resultNote: true,
      },
      take: 200,
    });
    await Promise.all(
      overdueTasks.map((task: any) =>
        taskDelegate.update({
          where: { id: task.id },
          data: {
            status: 'expired',
            assigneeRole: task.priority === 'urgent' ? 'manager' : task.assigneeRole,
            resultNote: task.resultNote ?? (task.priority === 'urgent' ? '任务已逾期，升级至店长队列' : '任务已逾期'),
          },
        }),
      ),
    );
  }

  private followUpTaskInclude() {
    return {
      customer: { select: { id: true, name: true, phone: true, memberLevel: true, totalSpent: true, visitCount: true } },
      assigneeUser: { select: { id: true, name: true, username: true, phone: true } },
      assigneeBeautician: { select: { id: true, name: true, phone: true, userId: true } },
      assignedByUser: { select: { id: true, name: true, username: true } },
      completedByUser: { select: { id: true, name: true, username: true } },
    };
  }

  private async inferFollowUpAssignment(storeId: number, customerId: number, dto: Partial<CreateTerminalFollowUpTaskDto>) {
    const text = [dto.triggerType, dto.source, dto.title, dto.note, dto.remark, dto.script].filter(Boolean).join(' ').toLowerCase();
    const explicitRole = dto.assigneeRole;
    const role =
      explicitRole ??
      (/(booking|appointment|reservation|预约|到店|未接通|浏览|放弃)/i.test(text)
        ? 'reception'
        : /(inventory|expiry|stock|capacity|临期|库存|低峰|排期|产能|补货)/i.test(text)
          ? 'manager'
          : 'consultant');

    if (role === 'consultant') {
      const recentTask = await this.prisma.serviceTask.findFirst({
        where: { storeId, customerId, beauticianId: { not: null } },
        include: { beautician: true },
        orderBy: [{ completedAt: 'desc' }, { appointmentTime: 'desc' }],
      });
      if (recentTask?.beautician) {
        return {
          assigneeRole: 'consultant',
          assigneeUserId: recentTask.beautician.userId ?? undefined,
          assigneeBeauticianId: recentTask.beautician.id,
          reason: `优先分派给最近服务美容师 ${recentTask.beautician.name}`,
        };
      }
      const recentReservation = await this.prisma.reservation.findFirst({
        where: { storeId, customerId, beauticianId: { not: null } },
        include: { beautician: true },
        orderBy: { date: 'desc' },
      });
      if (recentReservation?.beautician) {
        return {
          assigneeRole: 'consultant',
          assigneeUserId: recentReservation.beautician.userId ?? undefined,
          assigneeBeauticianId: recentReservation.beautician.id,
          reason: `优先分派给最近预约美容师 ${recentReservation.beautician.name}`,
        };
      }
      const fallbackBeautician = await this.findFallbackBeautician(storeId);
      if (fallbackBeautician) {
        return {
          assigneeRole: 'consultant',
          assigneeUserId: fallbackBeautician.userId ?? undefined,
          assigneeBeauticianId: fallbackBeautician.id,
          reason: `无历史服务人，默认分派给门店美容师 ${fallbackBeautician.name}`,
        };
      }
      const consultant = await this.findUserByRoleSignal(storeId, ['consultant', 'advisor', 'beautician', '顾问', '美容师']);
      if (consultant) {
        return {
          assigneeRole: 'consultant',
          assigneeUserId: consultant.id,
          assigneeBeauticianId: undefined,
          reason: `无历史服务人，默认分派给顾问 ${consultant.name}`,
        };
      }
    }

    if (role === 'manager') {
      const manager = await this.findUserByRoleSignal(storeId, ['store_manager', 'manager', '店长']) ?? await this.findFallbackStoreUser(storeId);
      return {
        assigneeRole: 'manager',
        assigneeUserId: manager?.id,
        assigneeBeauticianId: undefined,
        reason: manager ? `涉及经营协调，默认分派给 ${manager.name}` : '涉及经营协调，暂无可分派员工',
      };
    }

    if (role === 'reception') {
      const reception = await this.findUserByRoleSignal(storeId, ['reception', 'frontdesk', 'cashier', '前台']) ?? await this.findFallbackStoreUser(storeId);
      return {
        assigneeRole: 'reception',
        assigneeUserId: reception?.id,
        assigneeBeauticianId: undefined,
        reason: reception ? `预约/邀约确认类任务，默认分派给 ${reception.name}` : '预约/邀约确认类任务，暂无可分派员工',
      };
    }

    const fallbackBeautician = await this.findFallbackBeautician(storeId);
    if (fallbackBeautician) {
      return {
        assigneeRole: 'consultant',
        assigneeUserId: fallbackBeautician.userId ?? undefined,
        assigneeBeauticianId: fallbackBeautician.id,
        reason: `客户关系维护类任务，默认分派给门店美容师 ${fallbackBeautician.name}`,
      };
    }
    const fallbackUser = await this.findFallbackStoreUser(storeId);
    return {
      assigneeRole: 'consultant',
      assigneeUserId: fallbackUser?.id,
      assigneeBeauticianId: undefined,
      reason: fallbackUser ? `客户关系维护类任务，默认分派给 ${fallbackUser.name}` : '客户关系维护类任务，暂无可分派员工',
    };
  }

  private async findFallbackBeautician(storeId: number) {
    return this.prisma.beautician.findFirst({
      where: this.buildTerminalVisibleBeauticianWhere(storeId),
      orderBy: [{ userId: 'desc' }, { id: 'asc' }],
    });
  }

  private async findFallbackStoreUser(storeId: number) {
    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        status: 'active',
        stores: { some: { storeId } },
      },
      orderBy: { id: 'asc' },
    });
  }

  private async assertFollowUpAssigneeUser(storeId: number, assigneeUserId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: assigneeUserId,
        deletedAt: null,
        status: 'active',
        stores: { some: { storeId } },
      },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('跟进人必须来自系统管理-用户管理，且已启用并绑定当前门店');
  }

  private async findUserByRoleSignal(storeId: number, signals: string[]) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'active',
        stores: { some: { storeId } },
      },
      include: { roles: { include: { role: true } } },
      take: 50,
    });
    return (users ?? []).find((user) =>
      user.roles?.some(({ role }) => {
        const text = `${role.key} ${role.name}`.toLowerCase();
        return signals.some((signal) => text.includes(signal.toLowerCase()));
      }),
    );
  }

  private normalizeFollowUpPriority(priority: string | undefined, dto: Partial<CreateTerminalFollowUpTaskDto>) {
    if (priority) return priority === 'P0' ? 'urgent' : priority === 'P1' ? 'recommended' : priority;
    const text = [dto.triggerType, dto.source, dto.title, dto.note].filter(Boolean).join(' ').toLowerCase();
    if (/(urgent|expiry|临期|流失|逾期|低峰|排期|库存)/i.test(text)) return 'urgent';
    return 'recommended';
  }

  private inferFollowUpDueAt(dto: Partial<CreateTerminalFollowUpTaskDto>) {
    const text = [dto.triggerType, dto.source, dto.title, dto.note].filter(Boolean).join(' ').toLowerCase();
    const now = new Date();
    const due = new Date(now);
    if (/(appointment|booking|预约|浏览|放弃)/i.test(text)) {
      due.setHours(now.getHours() + 2);
      return due;
    }
    if (/(expiry|临期|库存|低峰|排期|capacity)/i.test(text)) {
      due.setHours(20, 0, 0, 0);
      if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
      return due;
    }
    due.setDate(due.getDate() + 2);
    return due;
  }

  private buildFollowUpTaskTitle(dto: Partial<CreateTerminalFollowUpTaskDto>) {
    if (dto.triggerType?.includes('expiry')) return '临期权益客户跟进';
    if (dto.triggerType?.includes('capacity')) return '低峰预约邀约跟进';
    if (dto.triggerType?.includes('churn')) return '流失风险客户唤醒';
    return '客户增长跟进';
  }

  private async recordFollowUpTaskEvent(
    storeId: number,
    customerId: number,
    deviceId: number | undefined,
    eventType: string,
    task: any,
    payload: Record<string, any>,
  ) {
    try {
      return await this.prisma.recommendationEvent.create({
        data: {
          storeId,
          customerId,
          deviceId: this.toTerminalDeviceId(deviceId),
          recommendationId: task.recommendationId ?? undefined,
          eventType,
          taskId: task.serviceTaskId ?? undefined,
          orderId: task.orderId ?? undefined,
          note: payload.note ?? payload.result ?? task.note ?? task.title,
          payload: {
            ...payload,
            terminalFollowUpTaskId: task.id,
            status: task.status,
            assigneeRole: task.assigneeRole,
            assigneeUserId: task.assigneeUserId,
            assigneeBeauticianId: task.assigneeBeauticianId,
            dueAt: task.dueAt,
          },
        },
      });
    } catch (error) {
      console.warn('record terminal follow-up recommendation event failed', error);
      return null;
    }
  }

  private mapFollowUpTask(task: any, extra: Record<string, any> = {}) {
    const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
    return {
      id: task.id,
      customerId: task.customerId,
      customerName: task.customer?.name,
      customerPhone: task.customer?.phone,
      customerMemberLevel: task.customer?.memberLevel,
      recommendationId: task.recommendationId,
      sourceRecommendationKey: task.sourceRecommendationKey,
      source: task.source,
      triggerType: task.triggerType,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeRole: task.assigneeRole,
      assigneeUserId: task.assigneeUserId,
      assigneeUserName: task.assigneeUser?.name ?? task.assigneeUser?.username,
      assigneeBeauticianId: task.assigneeBeauticianId,
      assigneeBeauticianName: task.assigneeBeautician?.name,
      assignmentReason: payload.assignmentReason,
      channel: payload.channel ?? 'phone',
      script: task.script,
      note: task.note,
      dueAt: task.dueAt?.toISOString?.() ?? task.dueAt,
      resultType: task.resultType,
      result: task.resultNote,
      resultNote: task.resultNote,
      reservationId: task.reservationId,
      orderId: task.orderId,
      serviceTaskId: task.serviceTaskId,
      completionEventId: extra.completionEventId,
      createdAt: task.createdAt?.toISOString?.() ?? task.createdAt,
      updatedAt: task.updatedAt?.toISOString?.() ?? task.updatedAt,
      completedAt: task.completedAt?.toISOString?.() ?? task.completedAt,
      ...extra,
    };
  }

  private buildFollowUpAssigneeStats(tasks: any[]) {
    const roleLabels: Record<string, string> = {
      manager: '店长',
      consultant: '顾问/美容师',
      reception: '前台',
    };
    const stats = new Map<
      string,
      {
        assigneeKey: string;
        assigneeRole: string;
        assigneeRoleLabel: string;
        assigneeUserId?: number;
        assigneeBeauticianId?: number;
        assigneeName: string;
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
        overdue: number;
        booked: number;
        converted: number;
        revenue: number;
      }
    >();
    const now = new Date();
    for (const task of tasks) {
      const role = task.assigneeRole || 'manager';
      const assigneeName =
        task.assigneeBeautician?.name ||
        task.assigneeUser?.name ||
        task.assigneeUser?.username ||
        (role === 'manager' ? '店长待分派' : role === 'reception' ? '前台队列' : '顾问/美容师队列');
      const assigneeKey = `${role}:${task.assigneeUserId ?? ''}:${task.assigneeBeauticianId ?? ''}:${assigneeName}`;
      const current =
        stats.get(assigneeKey) ??
        {
          assigneeKey,
          assigneeRole: role,
          assigneeRoleLabel: roleLabels[role] ?? '门店人员',
          assigneeUserId: task.assigneeUserId ?? undefined,
          assigneeBeauticianId: task.assigneeBeauticianId ?? undefined,
          assigneeName,
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          overdue: 0,
          booked: 0,
          converted: 0,
          revenue: 0,
        };
      current.total += 1;
      if (task.status === 'pending') current.pending += 1;
      if (task.status === 'in_progress') current.inProgress += 1;
      if (task.status === 'completed') current.completed += 1;
      if (
        (task.status === 'pending' || task.status === 'in_progress') &&
        task.dueAt &&
        new Date(task.dueAt).getTime() < now.getTime()
      ) {
        current.overdue += 1;
      }
      if (task.status === 'completed' && (task.resultType === 'booked' || task.reservationId)) current.booked += 1;
      if (task.status === 'completed' && (task.resultType === 'converted' || task.orderId)) current.converted += 1;
      current.revenue += Number(task.order?.totalAmount ?? 0);
      stats.set(assigneeKey, current);
    }
    return Array.from(stats.values())
      .map((item) => ({
        ...item,
        completionRate: item.total ? Math.round((item.completed / item.total) * 1000) / 10 : 0,
        conversionRate: item.completed ? Math.round((item.converted / item.completed) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.converted - a.converted || b.completed - a.completed || b.total - a.total)
      .slice(0, 10);
  }

  private mapLegacyFollowUpEvent(event: any) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    return {
      id: event.id,
      customerId: event.customerId,
      customerName: event.customer?.name,
      customerPhone: event.customer?.phone,
      recommendationId: event.recommendationId,
      title: payload.title ?? '客户增长跟进',
      status: payload.status ?? 'pending',
      priority: payload.priority ?? 'recommended',
      assigneeRole: payload.assigneeRole ?? 'manager',
      assigneeUserId: payload.assigneeUserId,
      assigneeBeauticianId: payload.assigneeBeauticianId,
      assignmentReason: payload.assignmentReason ?? '历史事件任务',
      channel: payload.channel ?? 'phone',
      script: payload.script ?? event.note,
      note: event.note,
      dueAt: payload.dueAt,
      createdAt: event.createdAt?.toISOString?.() ?? event.createdAt,
    };
  }

  async getPromotions(storeId?: number, query: any = {}) {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          query.projectId ? { applicableProjectIds: { has: Number(query.projectId) } } : {},
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const usablePromotions = promotions.filter((promotion) => this.isPromotionIssueAvailable(promotion));
    if (usablePromotions.length) {
      return usablePromotions.map((promotion) => ({
        id: promotion.id,
        name: promotion.name,
        description: promotion.description ?? '',
        discountText: promotion.discountText,
        type: promotion.type,
        source: promotion.source,
        scenario: promotion.scenario,
        approvalStatus: promotion.approvalStatus,
        validDays: promotion.validDays,
        maxIssueCount: promotion.maxIssueCount,
        issuedCount: promotion.issuedCount,
        usedCount: promotion.usedCount,
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

  async usePromotion(storeId: number, deviceId: number | undefined, dto: any = {}) {
    const promotionId = Number(dto.promotionId);
    if (!promotionId) throw new BadRequestException('promotionId is required');
    const now = new Date();
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        id: promotionId,
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId: null }, { storeId }],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
    });
    if (!promotion) throw new NotFoundException('权益不存在、未发布或已过期');

    const updated = await this.prisma.promotion.update({
      where: { id: promotion.id },
      data: { usedCount: { increment: 1 } },
    });
    await this.prisma.customerAppEvent.create({
      data: {
        storeId,
        customerId: dto.customerId ? Number(dto.customerId) : null,
        sessionId: dto.sessionId ?? null,
        eventType: 'promotion_used',
        channel: dto.channel ?? 'terminal',
        targetType: 'promotion',
        targetId: String(promotion.id),
        source: 'ami_aura_lite',
        metadataJson: {
          deviceId,
          orderId: dto.orderId,
          reservationId: dto.reservationId,
          projectId: dto.projectId,
          revenueAmount: dto.revenueAmount ?? dto.orderAmount ?? dto.amount,
          note: dto.note,
          promotionName: promotion.name,
          discountText: promotion.discountText,
        },
      },
    });

    return {
      success: true,
      promotionId: promotion.id,
      name: promotion.name,
      discountText: promotion.discountText,
      usedCount: updated.usedCount,
      usedAt: new Date().toISOString(),
    };
  }

  private isPromotionIssueAvailable(promotion: any) {
    return promotion.maxIssueCount == null || Number(promotion.issuedCount ?? 0) < Number(promotion.maxIssueCount);
  }

  async getDashboardStats(storeId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayOrders, todayTasks, todayReservations, todayNewCustomers] = await Promise.all([
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

  private getDaysSince(value?: Date | string | null) {
    if (!value) return 999;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) return 999;
    return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  }

  private normalizeTerminalDashboardInsights(
    value: unknown,
    fallback: TerminalDashboardInsights,
  ): TerminalDashboardInsights {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const normalizeItems = (items: unknown, fallbackItems: TerminalDashboardInsight[]) => {
      const source = Array.isArray(items) ? items : fallbackItems;
      return source
        .map((item) => {
          const current = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const title = String(current.title ?? '').trim();
          const reason = String(current.reason ?? '').trim();
          const action = String(current.action ?? '').trim();
          if (!title || !reason || !action) return null;
          return {
            title,
            severity: String(current.severity ?? 'medium'),
            reason,
            action,
            relatedType: typeof current.relatedType === 'string' ? current.relatedType : undefined,
            relatedId:
              typeof current.relatedId === 'number' || typeof current.relatedId === 'string'
                ? current.relatedId
                : undefined,
          };
        })
        .filter(Boolean)
        .slice(0, 3) as TerminalDashboardInsight[];
    };
    return {
      risks: normalizeItems(record.risks, fallback.risks),
      suggestions: normalizeItems(record.suggestions, fallback.suggestions),
    };
  }

  private buildManagerInsightFallback(context: any): TerminalDashboardInsights {
    const dormantCustomer = context.customersAtRisk?.[0];
    const unarrivedCount = Math.max(
      0,
      Number(context.metrics?.reservationCount ?? 0) - Number(context.metrics?.arrivedReservationCount ?? 0),
    );
    const lowStock = context.lowStock?.[0];
    const staffLoad = context.staffLoad?.[0];
    const risks: TerminalDashboardInsight[] = [];
    const suggestions: TerminalDashboardInsight[] = [];

    if (dormantCustomer) {
      risks.push({
        title: '高价值客户沉默',
        severity: dormantCustomer.daysSinceVisit >= 90 ? 'high' : 'medium',
        reason: `${dormantCustomer.name} 累计消费 ￥${Number(dormantCustomer.totalSpent).toLocaleString()}，已 ${dormantCustomer.daysSinceVisit} 天未到店，今日无预约。`,
        action: `安排顾问今天优先联系 ${dormantCustomer.name}，用最近护理记录邀约复购或预约。`,
        relatedType: 'customer',
        relatedId: dormantCustomer.id,
      });
      suggestions.push({
        title: '生成沉默客户邀约',
        severity: 'high',
        reason: `门店存在 ${context.customersAtRisk?.length ?? 0} 位高消费久未到店客户，优先处理比泛触达更有效。`,
        action: `先给 ${dormantCustomer.name} 生成一条微信/电话邀约话术，并分配前台跟进。`,
        relatedType: 'customer',
        relatedId: dormantCustomer.id,
      });
    }

    if (unarrivedCount > 0) {
      risks.push({
        title: '预约客户未到店',
        severity: unarrivedCount >= 3 ? 'high' : 'medium',
        reason: `今日预约 ${context.metrics.reservationCount} 位，已到店 ${context.metrics.arrivedReservationCount} 位，仍有 ${unarrivedCount} 位未到店。`,
        action: '前台按预约时间排序电话确认，迟到客户标记状态，避免美容师空等。',
        relatedType: 'reservation',
      });
      suggestions.push({
        title: '优先处理未到店预约',
        severity: 'medium',
        reason: '未到店预约会直接影响员工时段利用率和今日收银转化。',
        action: '将未到店名单按预约时间推给前台，先联系最近 30 分钟内的预约客户。',
        relatedType: 'reservation',
      });
    }

    if (lowStock) {
      risks.push({
        title: '项目耗材库存不足',
        severity: 'medium',
        reason: `${lowStock.name} 当前库存 ${lowStock.currentStock}，安全库存 ${lowStock.safetyStock}。`,
        action: `确认 ${lowStock.name} 是否影响今日项目交付，必要时暂停对应加项或安排补货。`,
        relatedType: 'inventory',
        relatedId: lowStock.id,
      });
    } else if (staffLoad) {
      risks.push({
        title: '员工排班需要关注',
        severity: 'low',
        reason: `${staffLoad.name} 今日有 ${staffLoad.slotCount} 个排班时段，忙碌时段 ${staffLoad.busyCount} 个。`,
        action: `检查 ${staffLoad.name} 的预约分配，避免高峰期接待压力集中。`,
        relatedType: 'staff',
        relatedId: staffLoad.id,
      });
    }

    suggestions.push({
      title: '盯紧到店转化',
      severity: 'medium',
      reason: `今日已到店 ${context.metrics.arrivedReservationCount} 位，营业额约 ￥${Number(context.metrics.revenue).toLocaleString()}。`,
      action: '店长检查已到店客户是否已完成核销/收银，避免服务完成但未开单。',
      relatedType: 'cashier',
    });

    return {
      risks: risks.slice(0, 3),
      suggestions: suggestions.slice(0, 3),
    };
  }

  private async getManagerDashboardInsights(storeId: number, context: any) {
    const cacheKey = `${storeId}:${context.metrics.customerTotal}:${context.metrics.reservationCount}:${context.metrics.arrivedReservationCount}:${context.metrics.revenue}`;
    const cached = this.managerInsightCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const fallback = this.buildManagerInsightFallback(context);
    const result = await this.aiService.generateTerminalDashboardInsights(
      { storeName: context.storeName, context, fallback },
      undefined,
      storeId,
    );
    const value = this.normalizeTerminalDashboardInsights(result.structured, fallback);
    this.managerInsightCache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60_000 });
    return value;
  }

  private async buildRoleDashboard(storeId: number, _requestedRole?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      store,
      customerTotal,
      activeCustomerTotal,
      orderStats,
      reservationCount,
      reservations,
      arrivedReservationCount,
      customersForInsights,
      stockProducts,
      recentOrders,
      beauticians,
      schedules,
      amiDashboard,
    ] = await Promise.all([
      this.getStore(storeId),
      this.prisma.customer.count({ where: { storeId, deletedAt: null } }),
      this.prisma.customer.count({ where: { storeId, deletedAt: null, visitCount: { gt: 0 } } }),
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
      this.prisma.reservation.count({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
          status: { in: ['checked_in', 'completed'] },
        },
      }),
      this.prisma.customer.findMany({
        where: { storeId, deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          memberLevel: true,
          totalSpent: true,
          visitCount: true,
          lastVisitDate: true,
          tags: true,
        },
        orderBy: { totalSpent: 'desc' },
        take: 40,
      }),
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { id: true, name: true, currentStock: true, safetyStock: true, status: true },
        orderBy: { currentStock: 'asc' },
        take: 30,
      }),
      this.prisma.productOrder.findMany({
        where: { storeId, status: 'completed' },
        select: { id: true, orderNo: true, customerName: true, totalAmount: true, createdAt: true, payMethod: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      this.prisma.beautician.findMany({
        where: this.buildTerminalVisibleBeauticianWhere(storeId),
        include: { level: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.schedule.findMany({
        where: { storeId, date: { gte: today, lt: tomorrow } },
        orderBy: [{ beauticianId: 'asc' }, { startTime: 'asc' }],
        take: 80,
      }),
      this.commissionService.getAmiDashboard({ storeId }).catch((error) => {
        if (!this.warnOptionalTableSkipped('AmiPerformanceRecord/AmiMonthlyBill', error)) {
          console.warn('Ami Core manager dashboard Ami contribution skipped', error);
        }
        return { revenueGenerated: 0, totalFee: 0, roi: 0, recordCount: 0 };
      }),
    ]);

    const mappedReservations = await Promise.all(reservations.map((reservation) => this.mapReservation(reservation)));
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
        joinDate: formatBusinessDate(item.createdAt),
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
    const revenue = this.toNumber(orderStats._sum.totalAmount);
    const reservationCustomerIds = new Set(reservations.map((reservation) => reservation.customerId));
    const customersAtRisk = customersForInsights
      .map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone ?? '',
        memberLevel: customer.memberLevel,
        totalSpent: this.toNumber(customer.totalSpent),
        visitCount: customer.visitCount,
        lastVisitDate: this.toIso(customer.lastVisitDate),
        daysSinceVisit: this.getDaysSince(customer.lastVisitDate),
        tags: customer.tags,
        hasTodayReservation: reservationCustomerIds.has(customer.id),
      }))
      .filter(
        (customer) => !customer.hasTodayReservation && customer.totalSpent >= 1000 && customer.daysSinceVisit >= 45,
      )
      .sort((a, b) => b.totalSpent - a.totalSpent || b.daysSinceVisit - a.daysSinceVisit)
      .slice(0, 8);
    const lowStock = stockProducts
      .map((item) => ({
        id: item.id,
        name: item.name,
        currentStock: this.toNonNegativeStock(item.currentStock),
        safetyStock: this.toNonNegativeStock(item.safetyStock),
        status: item.status,
      }))
      .filter((item) => item.currentStock <= item.safetyStock)
      .slice(0, 8);
    const staffLoad = staff
      .map((item) => ({
        id: item.beautician.id,
        name: item.beautician.name,
        slotCount: item.todaySlots.length,
        busyCount: item.todaySlots.filter((slot) => !slot.available).length,
        utilization: item.utilization,
      }))
      .sort((a, b) => b.busyCount - a.busyCount)
      .slice(0, 8);
    const insightContext = {
      storeName: store.name,
      metrics: {
        customerTotal,
        activeCustomerTotal,
        revenue,
        orderCount: orderStats._count,
        reservationCount,
        arrivedReservationCount,
      },
      customersAtRisk,
      todayReservations: mappedReservations.map((reservation) => ({
        id: reservation.id,
        customerName: reservation.customerName,
        projectName: reservation.projectName,
        appointmentTime: reservation.appointmentTime,
        status: reservation.status,
        checkedInAt: reservation.checkedInAt,
      })),
      lowStock,
      staffLoad,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        totalAmount: this.toNumber(order.totalAmount),
        payMethod: order.payMethod,
        createdAt: this.toIso(order.createdAt),
      })),
    };
    const insights = await this.getManagerDashboardInsights(storeId, insightContext);
    const amiRevenue = this.toNumber((amiDashboard as any)?.revenueGenerated);
    const amiFee = this.toNumber((amiDashboard as any)?.totalFee);
    const amiRecordCount = this.toNumber((amiDashboard as any)?.recordCount);

    return {
      manager: {
        title: '店长经营驾驶舱',
        subtitle: store.name,
        summary: `${store.name} 已接入 Ami_Core 数据，优先关注经营、预约、库存和员工协同。`,
        kpis: [
          { label: '客户总数', value: String(customerTotal) },
          { label: '营业额', value: `￥${revenue.toLocaleString()}` },
          { label: '预约客户', value: String(reservationCount) },
          { label: '到店客户', value: String(arrivedReservationCount) },
          { label: '活跃客户', value: String(activeCustomerTotal) },
          {
            label: 'Ami关联收入 / 费用',
            value: `￥${amiRevenue.toLocaleString()}`,
            hint: `费用 ￥${amiFee.toLocaleString()} · ${amiRecordCount} 条贡献记录`,
          },
        ],
        risks: insights.risks,
        highlights: insights.suggestions,
      },
      staff,
      reception: {
        title: '今日接待工作台',
        subtitle: store.name,
        items: mappedReservations,
        summary:
          reservationCount > 0
            ? `当前共有 ${reservationCount} 条今日预约待处理。`
            : '今日暂无预约，请按需新增预约或接待散客。',
      },
    };
  }

  async getRoleDashboard(storeId: number, requestedRole?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.withTerminalDashboardCache(
      ['role', storeId, this.toLocalDateText(today), requestedRole ?? 'all'],
      30_000,
      () => this.buildRoleDashboard(storeId, requestedRole),
    );
  }

  async getManagerDashboard(storeId: number) {
    return this.withTerminalDashboardCache(
      ['manager', storeId, this.toLocalDateText(new Date())],
      30_000,
      async () => (await this.getRoleDashboard(storeId)).manager,
    );
  }

  async getStaffSchedulesDashboard(storeId: number) {
    return this.withTerminalDashboardCache(
      ['staff-schedules', storeId, this.toLocalDateText(new Date())],
      5 * 60_000,
      async () => (await this.getRoleDashboard(storeId)).staff,
    );
  }

  async getTerminalBeauticianMe(storeId: number, userId?: number, operatorId?: number) {
    const { profile } = await this.resolveTerminalBeautician(storeId, userId, operatorId);
    return profile;
  }

  async getTerminalBeauticianTasks(
    storeId: number,
    deviceId: number,
    userId: number | undefined,
    query?: { date?: string; status?: string; operatorId?: number },
  ) {
    const { beautician } = await this.resolveTerminalBeautician(storeId, userId, query?.operatorId);
    return this.listTasks(storeId, deviceId, {
      date: query?.date,
      status: query?.status,
      beauticianId: beautician.id,
    });
  }

  async getTerminalBeauticianCommission(
    storeId: number,
    userId: number | undefined,
    query?: { period?: string; detailLimit?: number | string; operatorId?: number },
  ) {
    const { beautician } = await this.resolveTerminalBeautician(storeId, userId, query?.operatorId);
    return this.commissionService.getBeauticianSummary({
      storeId,
      beauticianId: beautician.id,
      period: query?.period,
      detailLimit: query?.detailLimit,
    });
  }

  async getTerminalBeauticianCustomers(
    storeId: number,
    userId: number | undefined,
    query?: { keyword?: string; operatorId?: number },
  ) {
    const { beautician } = await this.resolveTerminalBeautician(storeId, userId, query?.operatorId);
    const [reservations, tasks] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          storeId,
          beauticianId: beautician.id,
          status: { not: 'cancelled' },
        },
        select: { customerId: true },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      this.prisma.serviceTask.findMany({
        where: {
          storeId,
          beauticianId: beautician.id,
        },
        select: { customerId: true },
        orderBy: { appointmentTime: 'desc' },
        take: 100,
      }),
    ]);
    const customerIds = Array.from(new Set([...reservations, ...tasks].map((item) => item.customerId).filter(Boolean)));
    if (!customerIds.length) return [];
    return this.getTerminalContextCustomers(storeId, {
      keyword: query?.keyword ?? '',
      customerIds,
    });
  }

  async getTerminalBeauticianDashboard(
    storeId: number,
    deviceId: number,
    userId: number | undefined,
    query?: { date?: string; operatorId?: number },
  ) {
    const { beautician, profile } = await this.resolveTerminalBeautician(storeId, userId, query?.operatorId);
    const dateText =
      query?.date && !Number.isNaN(new Date(query.date).getTime())
        ? this.toLocalDateText(new Date(query.date))
        : this.toLocalDateText(new Date());
    const monthStart = new Date(`${dateText}T00:00:00`);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [staffSchedules, tasks, commission, monthlyTasks] = await Promise.all([
      this.getStaffSchedulesDashboard(storeId),
      this.listTasks(storeId, deviceId, { date: dateText, beauticianId: beautician.id }),
      this.commissionService.getBeauticianSummary({
        storeId,
        beauticianId: beautician.id,
        period: 'month',
        detailLimit: 20,
      }),
      this.prisma.serviceTask.findMany({
        where: {
          storeId,
          beauticianId: beautician.id,
          appointmentTime: { gte: monthStart },
          status: { not: 'cancelled' },
        },
        select: {
          customerId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          remark: true,
          images: true,
        },
        orderBy: { appointmentTime: 'desc' },
        take: 300,
      }),
    ]);
    const schedule = staffSchedules.find((item: any) => item?.beautician?.id === beautician.id);
    const pending = tasks.filter((item: any) => item.status === 'pending');
    const inProgress = tasks.filter((item: any) => item.status === 'in_progress');
    const completedToday = tasks.filter((item: any) => item.status === 'completed');
    const needRecord = tasks.filter((item: any) => ['pending', 'in_progress'].includes(item.status));
    const monthlyActiveTasks = monthlyTasks.filter((item) => item.status !== 'no_show');
    const monthlyCompletedTasks = monthlyTasks.filter((item) => item.status === 'completed');
    const monthlyRecordedTasks = monthlyCompletedTasks.filter(
      (item) => Boolean(item.remark?.trim()) || (item.images?.length ?? 0) > 0,
    );
    const completedDurations = monthlyCompletedTasks
      .map((item) =>
        item.startedAt && item.completedAt
          ? Math.max(0, Math.round((item.completedAt.getTime() - item.startedAt.getTime()) / 60000))
          : 0,
      )
      .filter((value) => value > 0);
    const completedByCustomer = new Map<number, number>();
    monthlyCompletedTasks.forEach((item) => {
      completedByCustomer.set(item.customerId, (completedByCustomer.get(item.customerId) ?? 0) + 1);
    });
    const repeatCustomerCount = Array.from(completedByCustomer.values()).filter((count) => count >= 2).length;
    const revenueContributionAmount = Array.isArray((commission as any).breakdown)
      ? (commission as any).breakdown.reduce((sum: number, item: any) => sum + this.toNumber(item?.sourceAmount), 0)
      : this.toNumber((commission as any).monthAmount);
    const quality = {
      completedCount: monthlyCompletedTasks.length,
      activeTaskCount: monthlyActiveTasks.length,
      recordedCount: monthlyRecordedTasks.length,
      completionRate: monthlyActiveTasks.length
        ? Math.round((monthlyCompletedTasks.length / monthlyActiveTasks.length) * 100)
        : 0,
      recordRate: monthlyCompletedTasks.length
        ? Math.round((monthlyRecordedTasks.length / monthlyCompletedTasks.length) * 100)
        : 0,
      averageServiceDurationMinutes: completedDurations.length
        ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length)
        : 0,
      repeatCustomerCount,
      repurchaseOpportunityCount: repeatCustomerCount,
      revenueContributionAmount,
      highlights: [
        `本月已完成 ${monthlyCompletedTasks.length} 次服务，服务记录完整率 ${monthlyCompletedTasks.length ? Math.round((monthlyRecordedTasks.length / monthlyCompletedTasks.length) * 100) : 0}%`,
        `重复服务客户 ${repeatCustomerCount} 位，关联收入约 ￥${Math.round(revenueContributionAmount).toLocaleString()}`,
      ],
      suggestions: [
        monthlyCompletedTasks.length && monthlyRecordedTasks.length < monthlyCompletedTasks.length
          ? '优先补齐缺失服务记录，确保客户档案、耗材和后续护理建议可追溯。'
          : '保持每次服务后补全客户反馈和下次护理建议。',
        repeatCustomerCount
          ? '对重复到店客户推荐同系列护理周期或次卡权益，承接复购机会。'
          : '本月重复服务客户偏少，可从服务后回访和下次预约提醒提升复购承接。',
      ],
    };
    const alerts = [
      ...(inProgress.length
        ? [
            {
              type: 'record_missing',
              title: '服务记录待提交',
              description: `${inProgress.length} 个服务记录待提交，提交后系统会自动完成服务任务。`,
              relatedId: inProgress[0]?.id,
            },
          ]
        : []),
      ...(pending.length
        ? [
            {
              type: 'next_task',
              title: '待记录服务',
              description: `${pending.length} 个预约客户待记录服务，优先补充最近到店客户的服务结果。`,
              relatedId: pending[0]?.id,
            },
          ]
        : []),
      ...((commission as any).monthPendingAmount > 0
        ? [
            {
              type: 'commission_pending',
              title: '提成待确认',
              description: `本月待确认提成 ￥${this.toNumber((commission as any).monthPendingAmount).toLocaleString()}。`,
            },
          ]
        : []),
    ];

    return {
      beautician: profile,
      date: dateText,
      schedule: {
        todaySlots: (schedule as any)?.todaySlots ?? [],
        weekSlots: (schedule as any)?.weekSlots ?? [],
        weekStart: (schedule as any)?.weekStart ?? dateText,
        utilization: (schedule as any)?.utilization ?? '0%',
      },
      tasks: {
        pending,
        inProgress,
        needRecord,
        completedToday,
        nextTask: inProgress[0] ?? pending[0],
      },
      commission,
      quality,
      alerts,
      summary: `${beautician.name} 今日 ${pending.length + inProgress.length} 个待提交记录、${completedToday.length} 个已记录服务。`,
    };
  }

  async getTodayReservationsDashboard(storeId: number) {
    return this.withTerminalDashboardCache(
      ['today-reservations', storeId, this.toLocalDateText(new Date())],
      30_000,
      async () => (await this.getRoleDashboard(storeId)).reception,
    );
  }

  async getCustomerGrowthDashboard(storeId: number) {
    return this.withTerminalDashboardCache(['customer-growth', storeId], 3 * 60_000, async () => {
      const dashboard = await this.getRoleDashboard(storeId);
      const risks = dashboard.manager.risks.filter((item: any) => item?.relatedType === 'customer');
      const highlights = dashboard.manager.highlights.filter((item: any) => item?.relatedType === 'customer');
      return {
        title: '客户增长与流失候选',
        subtitle: dashboard.manager.subtitle,
        items: [...risks, ...highlights].slice(0, 10),
        summary:
          risks.length || highlights.length ? '已筛选需要优先跟进的客户机会。' : '当前暂无高优先级客户流失或增长提醒。',
      };
    });
  }

  async getInventoryAlertsDashboard(storeId: number) {
    return this.withTerminalDashboardCache(['inventory-alerts', storeId], 2 * 60_000, () =>
      this.getInventoryAlerts(storeId),
    );
  }

  async getCustomerSelectContext(
    storeId: number,
    userId: number | undefined,
    query: TerminalCustomerSelectQueryDto,
  ) {
    const scene = query.scene ?? 'appointment';
    const keyword = query.keyword?.trim() ?? '';
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
    const operatorId = Number.isFinite(Number(query.operatorId)) ? Number(query.operatorId) : undefined;
    if (operatorId && operatorId !== userId) {
      await this.assertTerminalOperatorAllowed(storeId, operatorId);
    }
    const requestedCustomerIds = this.parseTerminalCustomerIds(query.customerIds);
    const scope = await this.getTerminalCustomerSelectScopeIds(
      storeId,
      userId,
      scene,
      operatorId,
      query.onlyMyCustomers,
    );
    if (scope.forcedEmpty && !requestedCustomerIds.length) {
      return {
        scene,
        keyword,
        generatedAt: new Date().toISOString(),
        fromCache: false,
        items: [],
        hasMore: false,
      };
    }
    const scopedScenes = new Set<TerminalCustomerSelectScene>(['follow_up', 'service_record']);
    const mergedCustomerIds =
      scope.customerIds.length || requestedCustomerIds.length
        ? Array.from(new Set([...requestedCustomerIds, ...scope.customerIds]))
        : [];

    if (scopedScenes.has(scene) && !mergedCustomerIds.length) {
      return {
        scene,
        keyword,
        generatedAt: new Date().toISOString(),
        fromCache: false,
        items: [],
        hasMore: false,
      };
    }

    const cacheKey = [
      'customer-select',
      storeId,
      userId ?? 0,
      operatorId ?? 0,
      scene,
      keyword,
      limit,
      query.onlyMyCustomers ? 'mine' : 'all',
      query.includeInactive ? 'inactive' : 'active',
      mergedCustomerIds.slice(0, 50).join(','),
    ];
    const ttlMs = keyword ? 60_000 : 2 * 60_000;

    return this.withTerminalDashboardCache(cacheKey, ttlMs, async () => {
      const customers = await this.getTerminalContextCustomers(storeId, {
        keyword,
        scene,
        limit,
        customerIds: mergedCustomerIds,
        onlyWithActiveCards: scene === 'verification',
        includeInactive: query.includeInactive,
      });
      const items = customers.map((customer) => this.toTerminalCustomerSelectItem(customer, scene));
      return {
        scene,
        keyword,
        generatedAt: new Date().toISOString(),
        fromCache: false,
        items,
        total: undefined,
        hasMore: items.length >= limit,
      };
    });
  }

  async getCashierContext(storeId: number) {
    return this.withTerminalDashboardCache(
      ['cashier-context', storeId, this.toLocalDateText(new Date())],
      10 * 60_000,
      async () => {
        const [catalog, customers, store] = await Promise.all([
          this.getCatalogSync(storeId),
          this.getTerminalContextCustomers(storeId, { scene: 'cashier', limit: 50 }),
          this.getStore(storeId),
        ]);
        return {
          ...catalog,
          customers,
          storeName: store.name,
          shiftRequired: store.shiftRequired !== false,
          generatedAt: new Date().toISOString(),
        };
      },
    );
  }

  async getCardVerificationContext(storeId: number, keyword?: string) {
    return this.withTerminalDashboardCache(
      ['card-verification-context', storeId, this.toLocalDateText(new Date()), keyword ?? ''],
      3 * 60_000,
      async () => {
        const [customers, store] = await Promise.all([
          this.getTerminalContextCustomers(storeId, {
            keyword: keyword ?? '',
            scene: 'verification',
            onlyWithActiveCards: true,
            limit: keyword ? 50 : 50,
          }),
          this.getStore(storeId),
        ]);
        const beauticians =
          typeof (this.prisma.beautician as any).findMany === 'function'
            ? await this.prisma.beautician.findMany({
                where: { storeId, status: 'active' },
                orderBy: { id: 'asc' },
              })
            : [];
        return {
          customers,
          beauticians: beauticians.map((item) => this.mapTerminalBeautician(item, store.name)),
          storeName: store.name,
          generatedAt: new Date().toISOString(),
        };
      },
    );
  }

  async createTerminalAutomationStrategy(
    storeId: number,
    userId: number | undefined,
    dto: CreateTerminalAutomationDto,
  ) {
    if (dto.missingFields?.length) {
      throw new BadRequestException('自动化草稿仍有缺失信息，请先补齐后再启用');
    }

    const payload = this.buildTerminalAutomationPayload(storeId, userId, dto);
    const existing = await this.prisma.marketingAutomationStrategy.findFirst({
      where: {
        description: {
          contains: `${this.getTerminalAutomationMarker(storeId)} ${this.getTerminalAutomationDraftMarker(dto.draftId)}`,
        },
      },
    });

    const strategy = existing
      ? await this.prisma.marketingAutomationStrategy.update({ where: { id: existing.id }, data: payload as any })
      : await this.prisma.marketingAutomationStrategy.create({ data: payload as any });

    this.invalidateAutomationDashboardCache(storeId);
    return this.mapTerminalAutomationStrategy(strategy);
  }

  async previewTerminalAutomationStrategy(storeId: number, dto: CreateTerminalAutomationDto) {
    if (dto.missingFields?.length) {
      throw new BadRequestException('自动化草稿仍有缺失信息，请先补齐后再预览');
    }

    const payload = this.buildTerminalAutomationPayload(storeId, undefined, dto);
    const previewStrategy = {
      id: 0,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastExecutedAt: null,
    };
    const mapped = this.mapTerminalAutomationStrategy(previewStrategy);
    const targetCount = await this.countTerminalAutomationTargets(storeId, previewStrategy);

    return {
      targetCount,
      riskLevel: mapped.riskLevel,
      requiresApproval: mapped.requiresApproval,
      trigger: mapped.trigger,
      audience: mapped.audience,
      action: mapped.action,
      frequencyCap: mapped.frequencyCap,
      message:
        targetCount > 0
          ? `预计命中 ${targetCount} 个对象，启用后会按规则生成：${mapped.action}`
          : `当前暂无命中对象，启用后仍会按“${mapped.trigger}”持续扫描。`,
    };
  }

  async runDueTerminalAutomations(storeId?: number) {
    if (this.automationScanRunning) {
      return { scannedCount: 0, executedCount: 0, skipped: true, reason: 'scan_running' };
    }

    this.automationScanRunning = true;
    try {
      const markerWhere = storeId
        ? { description: { contains: this.getTerminalAutomationMarker(storeId) } }
        : { description: { contains: '[source:aura-lite]' } };
      const strategies = await this.prisma.marketingAutomationStrategy.findMany({
        where: {
          status: 'enabled',
          ...markerWhere,
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });

      const now = new Date();
      const dueStrategies = strategies.filter((strategy) => this.shouldRunTerminalAutomation(strategy, now));
      const executions = [];
      for (const strategy of dueStrategies) {
        const resolvedStoreId = this.getStoreIdFromTerminalAutomation(strategy);
        if (!resolvedStoreId) continue;
        try {
          const execution = await this.executeTerminalAutomationStrategy(strategy, resolvedStoreId, {
            skipWhenNoTargets: true,
          });
          if (execution) executions.push(execution);
        } catch (error) {
          executions.push(await this.createFailedTerminalAutomationExecution(strategy, error));
        }
      }

      return {
        scannedCount: strategies.length,
        dueCount: dueStrategies.length,
        executedCount: executions.length,
        executions,
        scannedAt: new Date().toISOString(),
      };
    } finally {
      this.automationScanRunning = false;
    }
  }

  async listTerminalAutomationStrategies(storeId: number) {
    const items = await this.prisma.marketingAutomationStrategy.findMany({
      where: {
        description: {
          contains: this.getTerminalAutomationMarker(storeId),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return items.map((item) => this.mapTerminalAutomationStrategy(item));
  }

  async updateTerminalAutomationStrategy(storeId: number, id: number, dto: UpdateTerminalAutomationDto) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');

    const current = this.mapTerminalAutomationStrategy(strategy);
    const nextDraft: CreateTerminalAutomationDto = {
      draftId: `strategy-${id}`,
      title: dto.title ?? current.title,
      summary: current.summary,
      sourceText: current.sourceText,
      trigger: dto.trigger ?? current.trigger,
      audience: dto.audience ?? current.audience,
      action: dto.action ?? current.action,
      frequencyCap: current.frequencyCap,
      riskLevel: current.riskLevel,
      requiresApproval: current.requiresApproval,
      missingFields: [],
    };
    const payload = this.buildTerminalAutomationPayload(storeId, undefined, nextDraft);
    const updated = await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: {
        name: payload.name,
        schedule: payload.schedule,
        triggerRules: payload.triggerRules,
        actions: payload.actions,
      } as any,
    });
    this.invalidateAutomationDashboardCache(storeId);
    return this.mapTerminalAutomationStrategy(updated);
  }

  async enableTerminalAutomationStrategy(storeId: number, id: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');
    const updated = await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: { status: 'enabled' },
    });
    this.invalidateAutomationDashboardCache(storeId);
    return this.mapTerminalAutomationStrategy(updated);
  }

  async pauseTerminalAutomationStrategy(storeId: number, id: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');
    const updated = await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: { status: 'paused' },
    });
    this.invalidateAutomationDashboardCache(storeId);
    return this.mapTerminalAutomationStrategy(updated);
  }

  async runTerminalAutomationOnce(storeId: number, id: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');
    if (strategy.status !== 'enabled') {
      throw new BadRequestException('自动化策略尚未启用，不能手动执行');
    }
    const execution = await this.executeTerminalAutomationStrategy(strategy, storeId);
    this.invalidateAutomationDashboardCache(storeId);
    return execution;
  }

  async getTerminalAutomationExecutionDetail(storeId: number, id: number) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const execution = await this.prisma.marketingAutomationExecution.findFirst({
      where: {
        id,
        strategy: { description: { contains: marker } },
      },
      include: {
        strategy: true,
        touches: {
          include: { customer: true, predictionSnapshot: true },
          orderBy: { touchedAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!execution) throw new NotFoundException('Terminal automation execution not found');
    const insight = this.buildTerminalAutomationExecutionInsight(execution.strategy, execution);

    return {
      id: execution.id,
      strategyId: execution.strategyId,
      strategyName: execution.strategyName,
      status: execution.status,
      triggeredCount: execution.triggeredCount,
      reachedCount: execution.reachedCount,
      channel: execution.channel,
      executedAt: execution.executedAt,
      message: execution.message,
      ...insight,
      touches: execution.touches.map((touch: any) => ({
        id: touch.id,
        customerId: touch.customerId,
        customerName: touch.customer?.name ?? '',
        customerPhone: touch.customer?.phone ?? '',
        status: touch.status,
        channel: touch.channel,
        touchedAt: touch.touchedAt,
        predictedConversionScore: touch.predictedConversionScore,
        predictedRevenue: Number(touch.predictedRevenue ?? 0),
        attributionWindowDays: touch.attributionWindowDays,
      })),
    };
  }

  async markTerminalAutomationTouchFollowedUp(storeId: number, touchId: number) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const touch = await this.prisma.marketingAutomationTouch.findFirst({
      where: {
        id: touchId,
        execution: {
          strategy: { description: { contains: marker } },
        },
      },
      include: { customer: true },
    });
    if (!touch) throw new NotFoundException('Terminal automation touch not found');

    const updated = await this.prisma.marketingAutomationTouch.update({
      where: { id: touchId },
      data: {
        conversionType: 'terminal_followed_up',
        convertedAt: new Date(),
      },
      include: { customer: true },
    });
    this.invalidateAutomationDashboardCache(storeId);

    return {
      id: updated.id,
      customerId: updated.customerId,
      customerName: updated.customer?.name ?? '',
      customerPhone: updated.customer?.phone ?? '',
      status: updated.status,
      channel: updated.channel,
      touchedAt: updated.touchedAt,
      convertedAt: updated.convertedAt,
      conversionType: updated.conversionType,
      predictedConversionScore: updated.predictedConversionScore,
      predictedRevenue: Number(updated.predictedRevenue ?? 0),
      attributionWindowDays: updated.attributionWindowDays,
    };
  }

  async getTerminalAutomationTodaySummary(storeId: number) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [strategies, executions] = await Promise.all([
      this.prisma.marketingAutomationStrategy.findMany({
        where: { description: { contains: marker } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.marketingAutomationExecution.findMany({
        where: {
          executedAt: { gte: today },
          strategy: { description: { contains: marker } },
        },
        include: { strategy: true },
        orderBy: { executedAt: 'desc' },
        take: 50,
      }),
    ]);

    const enabledCount = strategies.filter((item) => item.status === 'enabled').length;
    const waitingApprovalCount = strategies.filter((item) => {
      const mapped = this.mapTerminalAutomationStrategy(item);
      return mapped.requiresApproval && item.status === 'draft';
    }).length;

    return {
      date: formatBusinessDate(today),
      strategyCount: strategies.length,
      enabledCount,
      waitingApprovalCount,
      executedCount: executions.length,
      successCount: executions.filter((item) => item.status === 'success').length,
      failedCount: executions.filter((item) => item.status === 'failed').length,
      latestStrategies: strategies.slice(0, 5).map((item) => this.mapTerminalAutomationStrategy(item)),
      latestExecutions: executions.map((item) => ({
        id: item.id,
        strategyId: item.strategyId,
        strategyName: item.strategyName,
        status: item.status,
        triggeredCount: item.triggeredCount,
        reachedCount: item.reachedCount,
        channel: item.channel,
        executedAt: item.executedAt,
        message: item.message,
        ...this.buildTerminalAutomationExecutionInsight(item.strategy, item),
      })),
    };
  }
}
