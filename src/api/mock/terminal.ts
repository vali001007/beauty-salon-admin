import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';
import type {
  TerminalBehaviorProfile,
  TerminalBomResponse,
  TerminalBootstrap,
  TerminalCardUsagePreview,
  TerminalCardUsagePreviewRequest,
  TerminalCardUsageRecord,
  TerminalCardUsageVerifyRequest,
  TerminalCatalogSync,
  TerminalCompleteServiceTaskRequest,
  TerminalConfig,
  TerminalConsumptionRecord,
  TerminalConsumptionRecordCreateRequest,
  TerminalCustomerCard,
  TerminalCustomerSummary,
  TerminalDevice,
  TerminalDeviceHeartbeatRequest,
  TerminalDeviceLoginRequest,
  TerminalDeviceLoginResponse,
  TerminalHealthProfile,
  TerminalInventoryAlertsResponse,
  TerminalInventoryStockParams,
  TerminalInventoryStockResponse,
  TerminalCashierOrder,
  TerminalCashierOrderCreateRequest,
  TerminalCardOrder,
  TerminalCardOrderCreateRequest,
  TerminalPaymentCompleteRequest,
  TerminalPrintJob,
  TerminalPrintJobCreateRequest,
  TerminalPromotion,
  TerminalQuickCreateCustomerRequest,
  TerminalRechargeOrder,
  TerminalRechargeOrderCreateRequest,
  TerminalRecommendation,
  TerminalRecommendationEventRequest,
  TerminalReservation,
  TerminalReservationCreateRequest,
  TerminalReservationUpdateRequest,
  TerminalServiceTask,
  TerminalServiceTaskStatus,
  TerminalSkinTest,
  TerminalCreateSkinTestRequest,
} from '@/types/terminal';
import type { Customer } from '@/types/customer';
import type { Project } from '@/types/project';
import type { Store } from '@/types/store';
import type { BOMItem } from '@/types/bom';
import rawConsumptionRecords from './data/consumption-records.json';
import rawHealthProfiles from './data/health-profiles.json';
import { mockGetCustomers, mockCreateCustomer } from './customer';
import { mockGetStores } from './store';
import { mockGetProjects, mockGetReservationsPaginated } from './project';
import { mockGetCards } from './card';
import { mockGetProducts } from './product';
import { mockGetBeauticians } from './beautician';
import { mockGetStockItems } from './inventory';
import { mockGetUserInfo } from './auth';
import { buildAuraBootstrap } from '@/config/aura';
import { hasPermission } from '@/config/permissions';
import { computeBehaviorProfiles } from '@/utils/customerSegmentation';
import { generateRecommendations } from '@/utils/marketingRecommendation';

interface TerminalState {
  currentDeviceId: number;
  devices: TerminalDevice[];
  serviceTasks: TerminalServiceTask[];
  customerCards: TerminalCustomerCard[];
  cardUsageRecords: TerminalCardUsageRecord[];
  reservations: TerminalReservation[];
  cashierOrders: TerminalCashierOrder[];
  cardOrders: TerminalCardOrder[];
  rechargeOrders: TerminalRechargeOrder[];
  printJobs: TerminalPrintJob[];
  skinTests: TerminalSkinTest[];
  consumptionRecords: TerminalConsumptionRecord[];
  recommendationEvents: Array<TerminalRecommendationEventRequest & { id: number; createdAt: string }>;
}

const MOCK_CONFIG: TerminalConfig = {
  version: '2026.05.26',
  featureFlags: {
    skinTest: true,
    cardVerification: true,
    serviceConsumption: true,
    recommendationFeedback: true,
  },
  uploadLimits: {
    maxImageCount: 6,
    maxImageSizeMb: 10,
  },
  skinMetricKeys: ['moisture', 'oil', 'elasticity', 'pigmentation', 'sensitivity'],
  displayCopy: {
    welcomeTitle: '欢迎使用 Ami Aura Lite',
    serviceCompleteTitle: '服务已完成',
  },
};

const MOCK_PROMOTIONS: TerminalPromotion[] = [
  {
    id: 1,
    name: '换季焕肤礼遇',
    description: '适合敏感、干燥、暗沉肤质客户的季节活动',
    discountText: '套餐立减 200',
    validUntil: '2026-12-31',
    applicableProjectIds: [101, 102],
  },
  {
    id: 2,
    name: '次卡续购专享',
    description: '针对次卡剩余不足 3 次的客户推荐',
    discountText: '续卡 9 折',
    validUntil: '2026-11-30',
    applicableProjectIds: [103, 104],
  },
];

let state: TerminalState | null = null;
let bootPromise: Promise<TerminalState> | null = null;

function nowString() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function createBusinessNo(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function normalizeTerminalReservationStatus(status?: string): TerminalReservation['status'] {
  if (status === 'confirmed' || status?.includes('已确认')) return 'confirmed';
  if (status === 'checked_in' || status?.includes('到店')) return 'checked_in';
  if (status === 'completed' || status?.includes('完成')) return 'completed';
  if (status === 'cancelled' || status?.includes('取消')) return 'cancelled';
  if (status === 'no_show') return 'no_show';
  return 'pending';
}

function createDevice(store: Store, id: number): TerminalDevice {
  return {
    id,
    deviceCode: `AURA-${String(id).padStart(4, '0')}`,
    name: `Ami Aura Lite ${id}`,
    model: 'Ami Aura Lite',
    storeId: store.id,
    storeName: store.name,
    status: 'online',
    appVersion: '1.0.0',
    firmwareVersion: '1.0.0',
    batteryLevel: 86,
    networkStatus: 'online',
    lastOnlineAt: nowString(),
    boundAt: nowString(),
  };
}

function pickProjectBom(project: Project): BOMItem[] {
  if (project.bom?.length) return project.bom.map((item, index) => ({ id: index + 1, ...item }));
  const fallbackBom: BOMItem[] = [
    { id: 1, productName: '补水面膜', sku: 'SK-LO-000002', standardQty: 1, unit: '片' },
    { id: 2, productName: '精华液', sku: 'SK-LO-000001', standardQty: 1, unit: '瓶' },
  ];
  return fallbackBom;
}

function toHealthProfile(item: any): TerminalHealthProfile {
  return {
    id: item.id,
    customerId: item.customerId,
    photo: item.photo,
    name: item.name,
    skinType: item.skinType,
    skinStatus: item.skinStatus,
    mainProblems: item.mainProblems,
    allergyHistory: item.allergyHistory,
    goals: item.goals,
    recommendedCare: item.recommendedCare,
    instrument: item.instrument,
    lastCheck: item.lastCheck,
  };
}

function toConsumptionRecord(item: any): TerminalConsumptionRecord {
  return {
    id: item.id,
    customerId: item.customerId,
    userName: item.userName,
    consumeType: item.consumeType,
    consumeContent: item.consumeContent || item.consumeType,
    payMethod: item.payMethod || '微信支付',
    amount: item.amount,
    campaign: item.campaign || '常规消费',
    consumeTime: item.consumeTime,
  };
}

async function ensureState(): Promise<TerminalState> {
  if (state) return state;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const [customers, stores, projects, cards, beauticians] = await Promise.all([
      mockGetCustomers(),
      mockGetStores(),
      mockGetProjects(),
      mockGetCards(),
      mockGetBeauticians(),
    ]);

    const healthProfiles = (rawHealthProfiles as any[]).map(toHealthProfile);
    const consumptionRecords = (rawConsumptionRecords as any[]).map(toConsumptionRecord);
    const devices = stores.slice(0, 3).map((store, index) => createDevice(store, index + 1));
    const terminalCustomers = customers.slice(0, 30);
    const customerCards: TerminalCustomerCard[] = terminalCustomers.flatMap((customer, index) => {
      const card = cards[index % cards.length];
      const primary: TerminalCustomerCard = {
        id: index + 1,
        customerId: customer.id,
        cardId: card.id,
        cardName: card.name,
        totalTimes: card.totalTimes,
        remainingTimes: Math.max(0, card.totalTimes - (index % Math.max(card.totalTimes, 1))),
        expiryDate: '2028-12-31',
        applicableProjects: card.projects.map((project) => project.projectName),
        status: 'active',
      };
      if (index % 3 !== 0 || cards.length < 2) return [primary];
      const extraCard = cards[(index + 1) % cards.length];
      return [
        primary,
        {
          id: terminalCustomers.length + index + 1,
          customerId: customer.id,
          cardId: extraCard.id,
          cardName: extraCard.name,
          totalTimes: extraCard.totalTimes,
          remainingTimes: Math.max(1, extraCard.totalTimes - 2),
          expiryDate: '2028-12-31',
          applicableProjects: extraCard.projects.map((project) => project.projectName),
          status: 'active',
        },
      ];
    });

    const serviceTasks: TerminalServiceTask[] = customers.slice(0, 6).map((customer, index) => {
      const project = projects[index % projects.length];
      const beautician = beauticians[index % beauticians.length];
      const store = stores[index % stores.length];
      return {
        id: index + 1,
        taskNo: `TASK-${String(index + 1).padStart(4, '0')}`,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        projectId: project.id,
        projectName: project.name,
        beauticianId: beautician.id,
        beauticianName: beautician.name,
        storeId: store.id,
        storeName: store.name,
        appointmentTime: '2026-05-26 10:00:00',
        duration: project.duration || 60,
        status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'in_progress' : 'completed',
        startedAt: index % 3 !== 0 ? nowString() : undefined,
        completedAt: index % 3 === 2 ? nowString() : undefined,
        remark: 'Mock task',
        consumptionItems: pickProjectBom(project).map((item) => ({
          productId: undefined,
          productName: item.productName,
          sku: item.sku,
          standardQty: item.standardQty,
          actualQty: item.standardQty,
          unit: item.unit,
        })),
        images: [],
      };
    });

    const skinTests: TerminalSkinTest[] = healthProfiles.slice(0, 6).map((profile, index) => ({
      id: index + 1,
      customerId: profile.customerId,
      taskId: index + 1,
      deviceId: devices[index % devices.length].id,
      images: [],
      metrics: [
        { key: 'moisture', label: '水分', value: 65 + index, unit: '%', score: 80 - index },
        { key: 'oil', label: '油脂', value: 30 + index, unit: '%', score: 75 - index },
      ],
      skinType: profile.skinType,
      skinStatus: profile.skinStatus,
      mainProblems: profile.mainProblems,
      recommendationText: profile.recommendedCare || '建议进行基础护理',
      createdAt: nowString(),
    }));

    const cardUsageRecords: TerminalCardUsageRecord[] = customerCards.slice(0, 6).map((card, index) => ({
      id: index + 1,
      customerId: card.customerId,
      customerName: customers.find((customer) => customer.id === card.customerId)?.name || '未知客户',
      cardName: card.cardName,
      projectName: card.applicableProjects[0] || '基础护理',
      times: 1,
      remainingTimes: Math.max(0, card.remainingTimes - 1),
      beauticianId: beauticians[index % beauticians.length].id,
      deviceId: devices[index % devices.length].id,
      verifiedAt: nowString(),
    }));

    const coreReservations = await mockGetReservationsPaginated({ page: 1, pageSize: 80 });
    const storeCustomerCursor = new Map<number, number>();
    const coreReservationItems = Array.isArray(coreReservations.items) ? coreReservations.items : [];
    const reservations: TerminalReservation[] = coreReservationItems.map((item: any) => {
      const appointmentTime = item.appointmentTime ?? item.date ?? nowString();
      const customerName = item.customerName ?? item.userName ?? '到店客户';
      const beautician = beauticians.find((candidate) => candidate.name === item.beauticianName);
      const project = projects.find((candidate) => candidate.name === item.projectName);
      const store = stores.find((candidate) => candidate.name === item.storeName) ?? stores[0];
      const storeCustomers = customers.filter((candidate) => candidate.storeName === store.name);
      const cursor = storeCustomerCursor.get(store.id) ?? 0;
      const fallbackCustomer = storeCustomers[cursor % Math.max(storeCustomers.length, 1)];
      const customer =
        customers.find((candidate) => candidate.name === customerName || customerName.includes(candidate.name)) ??
        fallbackCustomer;
      storeCustomerCursor.set(store.id, cursor + 1);

      return {
        id: Number(item.id),
        reservationNo: String(item.id),
        customerId: customer?.id,
        customerName,
        customerPhone: customer?.phone ?? item.customerPhone ?? '',
        projectId: project?.id,
        projectName: item.projectName ?? '基础护理',
        beauticianId: beautician?.id,
        beauticianName: item.beauticianName ?? beautician?.name ?? '待分配',
        storeId: store.id,
        storeName: item.storeName ?? store.name,
        appointmentTime,
        duration: item.duration ?? project?.duration ?? 60,
        status: normalizeTerminalReservationStatus(item.status),
        createdAt: item.createTime ?? item.createdAt ?? nowString(),
      };
    });

    return {
      currentDeviceId: devices[0].id,
      devices,
      serviceTasks,
      customerCards,
      cardUsageRecords,
      reservations,
      cashierOrders: [],
      cardOrders: [],
      rechargeOrders: [],
      printJobs: [],
      skinTests,
      consumptionRecords,
      recommendationEvents: [],
    };
  })();

  state = await bootPromise;
  bootPromise = null;
  return state;
}

function getCurrentDevice(stateValue: TerminalState): TerminalDevice {
  return stateValue.devices.find((device) => device.id === stateValue.currentDeviceId) ?? stateValue.devices[0];
}

function paginate<T>(items: T[], params: PaginationParams): PaginatedResponse<T> {
  const total = items.length;
  const start = (params.page - 1) * params.pageSize;
  const data = items.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockLoginTerminalDevice(req: TerminalDeviceLoginRequest): Promise<TerminalDeviceLoginResponse> {
  const current = await ensureState();
  const device = current.devices.find((item) => item.deviceCode === req.deviceCode) ?? current.devices[0];
  device.status = 'online';
  device.lastOnlineAt = nowString();
  current.currentDeviceId = device.id;
  return {
    token: `terminal-token-${device.id}`,
    device,
    store: (await mockGetStores()).find((store) => store.id === device.storeId)!,
    permissions: ['terminal:device:login', 'terminal:service:view', 'terminal:service:start', 'terminal:service:complete', 'terminal:skin:record'],
  };
}

export async function mockGetTerminalDeviceMe(): Promise<TerminalDevice> {
  const current = await ensureState();
  return getCurrentDevice(current);
}

export async function mockHeartbeatTerminalDevice(req: TerminalDeviceHeartbeatRequest): Promise<TerminalDevice> {
  const current = await ensureState();
  const device = getCurrentDevice(current);
  device.batteryLevel = req.batteryLevel;
  device.appVersion = req.appVersion;
  device.firmwareVersion = req.firmwareVersion ?? device.firmwareVersion;
  device.networkStatus = req.networkStatus;
  device.lastOnlineAt = nowString();
  device.status = req.networkStatus === 'offline' ? 'offline' : 'online';
  return device;
}

export async function mockRequestTerminalDeviceUnbind(reason = '用户申请解绑'): Promise<TerminalDevice> {
  void reason;
  const current = await ensureState();
  const device = getCurrentDevice(current);
  device.status = 'pending_unbind';
  device.lastOnlineAt = nowString();
  return device;
}

export async function mockGetTerminalDevicesPaginated(
  params: PaginationParams & { keyword?: string; storeId?: number; status?: string },
): Promise<PaginatedResponse<TerminalDevice>> {
  const current = await ensureState();
  let items = [...current.devices];
  if (params.keyword) {
    const keyword = params.keyword.toLowerCase();
    items = items.filter((item) => item.name.toLowerCase().includes(keyword) || item.deviceCode.toLowerCase().includes(keyword));
  }
  if (params.storeId) {
    items = items.filter((item) => item.storeId === params.storeId);
  }
  if (params.status) {
    items = items.filter((item) => item.status === params.status);
  }
  return paginate(items, params);
}

export async function mockUpdateTerminalDevice(id: number, data: Partial<TerminalDevice>): Promise<TerminalDevice> {
  const current = await ensureState();
  const device = current.devices.find((item) => item.id === id);
  if (!device) throw new Error('Terminal device not found');
  Object.assign(device, data, { lastOnlineAt: nowString() });
  return device;
}

export async function mockDisableTerminalDevice(id: number): Promise<TerminalDevice> {
  return mockUpdateTerminalDevice(id, { status: 'disabled' });
}

export async function mockApproveTerminalDeviceUnbind(id: number, approved: boolean): Promise<TerminalDevice> {
  return mockUpdateTerminalDevice(id, { status: approved ? 'offline' : 'online' });
}

export async function mockGetTerminalConfig(): Promise<TerminalConfig> {
  return MOCK_CONFIG;
}

export async function mockGetTerminalBootstrap(): Promise<TerminalBootstrap> {
  const [stores, projects, cards, products, user] = await Promise.all([
    mockGetStores(),
    mockGetProjects(),
    mockGetCards(),
    mockGetProducts(),
    mockGetUserInfo(),
  ]);
  const current = await ensureState();
  const availableStores = hasPermission(user.permissions, '*')
    ? stores
    : stores.filter((store) => user.storeIds.includes(store.id));
  const currentStore = availableStores[0] ?? stores[0];
  const aura = buildAuraBootstrap({
    user,
    store: currentStore,
    stores: availableStores,
  });

  return {
    ...aura,
    store: currentStore,
    stores: availableStores,
    beauticians: await mockGetBeauticians({ storeName: currentStore.name }),
    projects,
    cards,
    products,
    config: MOCK_CONFIG,
    catalogVersion: `catalog-${current.devices.length}-${projects.length}-${cards.length}`,
  };
}

export async function mockGetTerminalCatalogSync(params?: { since?: string }): Promise<TerminalCatalogSync> {
  const bootstrap = await mockGetTerminalBootstrap();
  return {
    since: params?.since,
    catalogVersion: bootstrap.catalogVersion,
    projects: bootstrap.projects,
    cards: bootstrap.cards,
    products: bootstrap.products,
    beauticians: bootstrap.beauticians,
    config: bootstrap.config,
  };
}

export async function mockGetTerminalRoleDashboard() {
  const bootstrap = await mockGetTerminalBootstrap();
  const customers = await mockGetCustomers();
  const reservations = await mockGetTerminalReservations();
  const stock = await mockGetTerminalInventoryStock();
  const lowStockCount = stock.filter((item) => item.status === '低库存' || item.status === '缺货' || item.currentStock <= item.safetyStock).length;

  const staff = bootstrap.beauticians.slice(0, 6).map((beautician) => ({
    title: '员工当天排班',
    subtitle: beautician.storeName,
    beautician,
    todaySlots: [
      { time: '10:00', period: '上午' as const, available: false },
      { time: '11:30', period: '上午' as const, available: true },
      { time: '14:00', period: '下午' as const, available: false },
      { time: '16:00', period: '下午' as const, available: true },
    ],
    utilization: '50%',
    summary: `${beautician.name} 今日共有 4 个排班时段，占用率 50%。`,
  }));

  return {
    manager: {
      title: '店长经营驾驶舱',
      subtitle: bootstrap.currentStore?.name ?? '当前门店',
      summary: `当前门店 ${bootstrap.currentStore?.name ?? '未选择门店'} 已接入 Ami_Core 数据。`,
      kpis: [
        { label: '客户总数', value: String(customers.length) },
        { label: '预约待处理', value: String(reservations.length) },
        { label: '门店订单', value: '0' },
        { label: '低库存', value: String(lowStockCount) },
        { label: '上架卡项', value: String(bootstrap.cards.length) },
        { label: '总营业额', value: '￥0' },
      ],
      risks: ['优先处理今日预约、库存和员工负载。'],
      highlights: [`客户总数 ${customers.length}，数据来自 Ami_Core。`],
    },
    staff,
    reception: {
      title: '今日接待工作台',
      subtitle: bootstrap.currentStore?.name ?? '接待中心',
      items: reservations,
      summary: `当前共有 ${reservations.length} 条预约待处理。`,
    },
  };
}

export async function mockSearchTerminalCustomers(params: { keyword: string }): Promise<Customer[]> {
  const customers = await mockGetCustomers();
  const keyword = params.keyword.toLowerCase();
  return customers.filter((customer) => customer.name.toLowerCase().includes(keyword) || customer.phone.includes(keyword)).slice(0, 20);
}

export async function mockQuickCreateTerminalCustomer(data: TerminalQuickCreateCustomerRequest): Promise<Customer> {
  return mockCreateCustomer({
    name: data.name,
    phone: data.phone,
    gender: (data.gender as any) || '女',
    age: 30,
    memberLevel: data.memberLevel || '新客',
    totalSpent: 0,
    visitCount: 0,
    lastVisitDate: '',
    tags: data.tags?.length ? data.tags : ['Aura Lite'],
    source: data.source || 'Ami Aura Lite',
    storeName: data.storeName || (await mockGetStores())[0].name,
    createdAt: nowString(),
    email: '',
    landline: '',
    wechat: '',
    maritalStatus: '未知' as any,
    birthday: data.birthday || '',
    height: 0,
    weight: 0,
    occupation: '',
    workplace: '',
    address: '',
    hasAllergy: '无' as any,
    hasSurgery: '无' as any,
    skinCondition: data.skinCondition || '',
    remark: data.remark || '',
  } as any);
}

export async function mockCreateTerminalReservation(data: TerminalReservationCreateRequest): Promise<TerminalReservation> {
  const current = await ensureState();
  const device = getCurrentDevice(current);
  const reservation: TerminalReservation = {
    ...data,
    id: Date.now(),
    reservationNo: createBusinessNo('APT'),
    storeId: device.storeId,
    storeName: device.storeName,
    status: 'confirmed',
    createdAt: nowString(),
  };
  current.reservations.unshift(reservation);
  return reservation;
}

export async function mockGetTerminalReservations(params?: {
  date?: string;
  storeName?: string;
  status?: TerminalReservation['status'];
}): Promise<TerminalReservation[]> {
  const current = await ensureState();
  let items = [...current.reservations];
  if (params?.storeName) {
    items = items.filter((item) => item.storeName === params.storeName);
  }
  if (params?.date) {
    items = items.filter((item) => item.appointmentTime.startsWith(params.date!));
  }
  if (params?.status) {
    items = items.filter((item) => item.status === params.status);
  }
  return items;
}

export async function mockUpdateTerminalReservation(
  id: number,
  data: TerminalReservationUpdateRequest,
): Promise<TerminalReservation> {
  const current = await ensureState();
  const reservation = current.reservations.find((item) => item.id === id);
  if (!reservation) throw new Error('预约不存在');
  Object.assign(reservation, data);
  return reservation;
}

export async function mockConfirmTerminalReservation(id: number): Promise<TerminalReservation> {
  return mockUpdateTerminalReservation(id, { status: 'confirmed', remark: '终端确认预约' });
}

export async function mockCheckInTerminalReservation(id: number): Promise<TerminalReservation> {
  return mockUpdateTerminalReservation(id, { status: 'checked_in', remark: '客户已到店' }).then((reservation) => ({
    ...reservation,
    checkedInAt: nowString(),
  }));
}

export async function mockCancelTerminalReservation(id: number, reason?: string): Promise<TerminalReservation> {
  return mockUpdateTerminalReservation(id, { status: 'cancelled', remark: reason || '终端取消预约' });
}

export async function mockGetTerminalCustomerHealthProfile(customerId: number): Promise<TerminalHealthProfile | undefined> {
  const profile = (rawHealthProfiles as any[]).find((item) => item.customerId === customerId);
  return profile ? toHealthProfile(profile) : undefined;
}

export async function mockUpdateTerminalCustomerHealthProfile(
  customerId: number,
  data: Partial<TerminalHealthProfile>,
): Promise<TerminalHealthProfile> {
  const existing = (rawHealthProfiles as any[]).find((item) => item.customerId === customerId);
  if (!existing) {
    const created: TerminalHealthProfile = {
      id: Date.now(),
      customerId,
      name: data.name || '未知客户',
      skinType: data.skinType || '中性',
      skinStatus: data.skinStatus || '状态良好',
      mainProblems: data.mainProblems || '',
      allergyHistory: data.allergyHistory,
      goals: data.goals,
      recommendedCare: data.recommendedCare,
      instrument: data.instrument,
      lastCheck: data.lastCheck || nowString(),
      photo: data.photo,
    };
    (rawHealthProfiles as any[]).push(created);
    return created;
  }
  Object.assign(existing, data, { customerId });
  return toHealthProfile(existing);
}

export async function mockGetTerminalBehaviorProfile(customerId: number): Promise<TerminalBehaviorProfile | undefined> {
  const customers = await mockGetCustomers();
  const behaviors = computeBehaviorProfiles(customers, rawConsumptionRecords as any[], rawHealthProfiles as any[]);
  return behaviors.find((item) => item.customerId === customerId);
}

export async function mockGetTerminalCustomerSummary(customerId: number): Promise<TerminalCustomerSummary> {
  const [customers, customerCards, behaviorProfile, healthProfile] = await Promise.all([
    mockGetCustomers(),
    mockGetTerminalCustomerCards(customerId),
    mockGetTerminalBehaviorProfile(customerId),
    mockGetTerminalCustomerHealthProfile(customerId),
  ]);
  const customer = customers.find((item) => item.id === customerId) || customers[0];
  return {
    customer,
    availableCardCount: customerCards.filter((card) => card.status === 'active').length,
    lastVisitDate: customer.lastVisitDate,
    behaviorProfile,
    healthProfile,
  };
}

export async function mockGetTerminalCustomerConsumptionRecordsPaginated(
  customerId: number,
  params: PaginationParams,
): Promise<PaginatedResponse<TerminalConsumptionRecord>> {
  const records = (rawConsumptionRecords as any[])
    .filter((item) => item.customerId === customerId)
    .map(toConsumptionRecord);
  return paginate(records, params);
}

export async function mockGetTerminalServiceTasks(params?: {
  date?: string;
  status?: TerminalServiceTaskStatus;
}): Promise<TerminalServiceTask[]> {
  const current = await ensureState();
  let items = [...current.serviceTasks];
  if (params?.date) {
    items = items.filter((task) => task.appointmentTime.startsWith(params.date!));
  }
  if (params?.status) {
    items = items.filter((task) => task.status === params.status);
  }
  return items;
}

export async function mockGetTerminalServiceTaskById(id: number): Promise<TerminalServiceTask | undefined> {
  const current = await ensureState();
  return current.serviceTasks.find((task) => task.id === id);
}

export async function mockStartTerminalServiceTask(id: number): Promise<TerminalServiceTask> {
  const current = await ensureState();
  const task = current.serviceTasks.find((item) => item.id === id);
  if (!task) throw new Error('Service task not found');
  task.status = 'in_progress';
  task.startedAt = nowString();
  return task;
}

export async function mockCompleteTerminalServiceTask(
  id: number,
  data: TerminalCompleteServiceTaskRequest,
): Promise<TerminalServiceTask> {
  const current = await ensureState();
  const task = current.serviceTasks.find((item) => item.id === id);
  if (!task) throw new Error('Service task not found');
  task.status = 'completed';
  task.completedAt = nowString();
  task.beauticianId = data.beauticianId;
  task.remark = data.remark || data.result;
  task.images = data.images || task.images;
  if (data.consumptionItems?.length) {
    task.consumptionItems = data.consumptionItems;
  }
  return task;
}

export async function mockCancelTerminalServiceTask(id: number, reason = '客户取消'): Promise<TerminalServiceTask> {
  const current = await ensureState();
  const task = current.serviceTasks.find((item) => item.id === id);
  if (!task) throw new Error('Service task not found');
  task.status = 'cancelled';
  task.remark = reason;
  return task;
}

export async function mockGetTerminalCustomerCards(customerId: number): Promise<TerminalCustomerCard[]> {
  const current = await ensureState();
  return current.customerCards.filter((card) => card.customerId === customerId);
}

export async function mockPreviewTerminalCardUsage(
  data: TerminalCardUsagePreviewRequest,
): Promise<TerminalCardUsagePreview> {
  const current = await ensureState();
  const customerCard = current.customerCards.find((card) => card.id === data.customerCardId);
  const projects = await mockGetProjects();
  const project = projects.find((item) => item.id === data.projectId);
  if (!customerCard) {
    return { valid: false, message: '次卡不存在' };
  }
  if (!project) {
    return { valid: false, message: '项目不存在' };
  }
  if (customerCard.status !== 'active') {
    return { valid: false, message: '次卡不可用', customerCard, project };
  }
  if (customerCard.remainingTimes < data.times) {
    return { valid: false, message: '剩余次数不足', customerCard, project, remainingAfterUse: customerCard.remainingTimes - data.times };
  }
  return {
    valid: true,
    message: '可核销',
    customerCard,
    project,
    remainingAfterUse: customerCard.remainingTimes - data.times,
  };
}

export async function mockVerifyTerminalCardUsage(
  data: TerminalCardUsageVerifyRequest,
): Promise<TerminalCardUsageRecord> {
  const current = await ensureState();
  const preview = await mockPreviewTerminalCardUsage(data);
  if (!preview.valid || !preview.customerCard || !preview.project) {
    throw new Error(preview.message);
  }
  preview.customerCard.remainingTimes = preview.remainingAfterUse!;
  if (preview.customerCard.remainingTimes <= 0) {
    preview.customerCard.status = 'used_up';
  }
  const customer = (await mockGetCustomers()).find((item) => item.id === preview.customerCard!.customerId)!;
  const record: TerminalCardUsageRecord = {
    id: Date.now(),
    customerId: preview.customerCard.customerId,
    customerName: customer.name,
    cardName: preview.customerCard.cardName,
    projectName: preview.project.name,
    times: data.times,
    remainingTimes: preview.customerCard.remainingTimes,
    beauticianId: data.beauticianId,
    deviceId: data.deviceId || getCurrentDevice(current).id,
    verifiedAt: nowString(),
  };
  current.cardUsageRecords.unshift(record);
  return record;
}

export async function mockCreateTerminalCashierOrder(
  data: TerminalCashierOrderCreateRequest,
): Promise<TerminalCashierOrder> {
  const current = await ensureState();
  const device = getCurrentDevice(current);
  const order: TerminalCashierOrder = {
    ...data,
    id: Date.now(),
    orderNo: createBusinessNo('POS'),
    storeId: device.storeId,
    storeName: device.storeName,
    totalAmount: Math.max(0, data.items.reduce((total, item) => total + item.subtotal, 0) - (data.discountAmount ?? 0)),
    status: 'pending_payment',
    createdAt: nowString(),
  };
  current.cashierOrders.unshift(order);
  return order;
}

export async function mockCompleteTerminalPayment(
  orderId: number,
  data: TerminalPaymentCompleteRequest,
): Promise<TerminalCashierOrder> {
  const current = await ensureState();
  const order = current.cashierOrders.find((item) => item.id === orderId);
  if (!order) throw new Error('收银单不存在');
  order.status = 'completed';
  order.paymentMethod = data.paymentMethod;
  order.paidAt = nowString();
  order.completedAt = order.paidAt;
  return order;
}

export async function mockCreateTerminalCardOrder(
  data: TerminalCardOrderCreateRequest,
): Promise<TerminalCardOrder> {
  const current = await ensureState();
  const device = getCurrentDevice(current);
  const purchaseTime = nowString();
  const expireTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const order: TerminalCardOrder = {
    ...data,
    id: Date.now(),
    orderNo: createBusinessNo('CARD'),
    storeId: device.storeId,
    storeName: device.storeName,
    remainingTimes: data.totalTimes,
    status: 'active',
    purchaseTime,
    expireTime,
  };
  current.cardOrders.unshift(order);
  if (data.customerId) {
    current.customerCards.unshift({
      id: order.id,
      customerId: data.customerId,
      cardId: data.cardId,
      cardName: data.cardName,
      totalTimes: data.totalTimes,
      remainingTimes: data.totalTimes,
      expiryDate: expireTime.slice(0, 10),
      applicableProjects: [],
      status: 'active',
    });
  }
  return order;
}

export async function mockCreateTerminalRechargeOrder(
  data: TerminalRechargeOrderCreateRequest,
): Promise<TerminalRechargeOrder> {
  const current = await ensureState();
  const device = getCurrentDevice(current);
  const order: TerminalRechargeOrder = {
    ...data,
    id: Date.now(),
    orderNo: createBusinessNo('RCG'),
    storeId: device.storeId,
    storeName: device.storeName,
    giftAmount: data.giftAmount ?? 0,
    giftProjects: data.giftProjects ?? [],
    cashBalance: data.amount,
    giftBalance: data.giftAmount ?? 0,
    balanceTransactionId: Date.now() + 1,
    status: 'paid',
    createdAt: nowString(),
  };
  current.rechargeOrders.unshift(order);
  return order;
}

export async function mockCreateTerminalPrintJob(
  data: TerminalPrintJobCreateRequest,
): Promise<TerminalPrintJob> {
  const current = await ensureState();
  const device = getCurrentDevice(current);
  const job: TerminalPrintJob = {
    ...data,
    id: Date.now(),
    jobNo: createBusinessNo('PRINT'),
    copies: data.copies ?? 1,
    storeId: device.storeId,
    storeName: device.storeName,
    status: 'completed',
    createdAt: nowString(),
    completedAt: nowString(),
  };
  current.printJobs.unshift(job);
  return job;
}

export async function mockGetTerminalPrintJobStatus(id: number): Promise<TerminalPrintJob | undefined> {
  const current = await ensureState();
  return current.printJobs.find((item) => item.id === id);
}

export async function mockGetTerminalCardUsageRecordsPaginated(
  params: PaginationParams & { customerId?: number; cardName?: string; projectName?: string },
): Promise<PaginatedResponse<TerminalCardUsageRecord>> {
  const current = await ensureState();
  let items = [...current.cardUsageRecords];
  if (params.customerId) {
    items = items.filter((item) => item.customerId === params.customerId);
  }
  if (params.cardName) {
    items = items.filter((item) => item.cardName.includes(params.cardName!));
  }
  if (params.projectName) {
    items = items.filter((item) => item.projectName.includes(params.projectName!));
  }
  return paginate(items, params);
}

export async function mockGetTerminalBom(projectId: number): Promise<TerminalBomResponse> {
  const projects = await mockGetProjects();
  const project = projects.find((item) => item.id === projectId) || projects[0];
  return {
    projectId: project.id,
    projectName: project.name,
    items: pickProjectBom(project),
  };
}

export async function mockGetTerminalInventoryStock(
  params?: TerminalInventoryStockParams,
): Promise<TerminalInventoryStockResponse> {
  const items = await mockGetStockItems({ storeId: params?.storeId });
  if (!params?.productIds?.length) return items;
  const productIdSet = new Set(params.productIds);
  return items.filter((item) => productIdSet.has(item.id));
}

export async function mockGetTerminalInventoryAlerts(): Promise<TerminalInventoryAlertsResponse> {
  const stock = await mockGetTerminalInventoryStock();
  const lowStock = stock.filter(
    (item) => item.status === '低库存' || item.status === '缺货' || item.currentStock <= item.safetyStock,
  );
  const expiring = stock.slice(0, 4).map((item, index) => ({
    id: item.id,
    urgency: (index === 0 ? '紧急' : '临期') as '紧急' | '临期',
    productName: item.productName,
    sku: item.sku,
    batchNo: `BATCH-${item.id}`,
    remainingDays: 7 + index * 3,
    stock: item.currentStock,
    costAmount: item.currentStock * 20,
    storeName: item.storeName,
    suggestion: (index === 0 ? '促销' : '调拨') as '促销' | '调拨',
  }));
  const replenishment = lowStock.map((item) => ({
    id: item.id,
    productName: item.productName,
    sku: item.sku,
    currentStock: item.currentStock,
    forecast7Days: Math.max(1, item.safetyStock),
    safetyStock: item.safetyStock,
    inTransit: 0,
    suggestedQty: Math.max((item.safetyStock ?? 0) * 2 - (item.currentStock ?? 0), item.safetyStock ?? 1),
    supplier: '默认供应商',
    estimatedAmount: Math.max((item.safetyStock ?? 0) * 2 - (item.currentStock ?? 0), item.safetyStock ?? 1) * 20,
    checked: false,
  }));

  return {
    lowStock,
    expiring,
    replenishment,
    summary: `当前有 ${lowStock.length} 项低库存，${expiring.length} 项临期库存。`,
    generatedAt: nowString(),
    storeName: stock[0]?.storeName ?? '当前门店',
  };
}

export async function mockCreateTerminalConsumptionRecord(
  data: TerminalConsumptionRecordCreateRequest,
): Promise<TerminalConsumptionRecordCreateRequest & { id: number; createdAt: string }> {
  const record = { ...data, id: Date.now(), createdAt: nowString() };
  const current = await ensureState();
  current.consumptionRecords.unshift({
    id: record.id,
    customerId: data.customerId,
    userName: `客户${data.customerId}`,
    consumeType: '服务消耗',
    consumeContent: (Array.isArray(data.items) ? data.items : []).map((item) => item.productName).join('、'),
    payMethod: '系统生成',
    amount: '¥0.00',
    campaign: 'Ami Aura Lite',
    consumeTime: record.createdAt,
  });
  return record;
}

export async function mockCreateTerminalSkinTest(
  data: TerminalCreateSkinTestRequest,
): Promise<TerminalSkinTest> {
  const current = await ensureState();
  const skinTest: TerminalSkinTest = {
    id: Date.now(),
    customerId: data.customerId,
    taskId: data.taskId,
    deviceId: data.deviceId || getCurrentDevice(current).id,
    images: data.images || [],
    metrics: data.metrics,
    skinType: data.skinType,
    skinStatus: data.skinStatus,
    mainProblems: data.mainProblems,
    recommendationText: data.recommendationText || '建议结合肌肤检测结果进行精准护理',
    createdAt: nowString(),
  };
  current.skinTests.unshift(skinTest);
  return skinTest;
}

export async function mockGetTerminalSkinTests(params?: { customerId?: number }): Promise<TerminalSkinTest[]> {
  const current = await ensureState();
  let items = [...current.skinTests];
  if (params?.customerId) {
    items = items.filter((item) => item.customerId === params.customerId);
  }
  return items;
}

export async function mockGetTerminalSkinTestById(id: number): Promise<TerminalSkinTest | undefined> {
  const current = await ensureState();
  return current.skinTests.find((item) => item.id === id);
}

export async function mockBindTerminalSkinTestCustomer(id: number, customerId: number): Promise<TerminalSkinTest> {
  const current = await ensureState();
  const skinTest = current.skinTests.find((item) => item.id === id);
  if (!skinTest) throw new Error('Skin test not found');
  skinTest.customerId = customerId;
  return skinTest;
}

export async function mockGetTerminalSkinTestRecommendations(id: number): Promise<TerminalRecommendation[]> {
  const current = await ensureState();
  const skinTest = current.skinTests.find((item) => item.id === id);
  if (!skinTest) return [];
  const recommendations = await generateRecommendations(
    (await mockGetCustomers()) as any,
    (rawConsumptionRecords as any[]) as any,
    (rawHealthProfiles as any[]) as any,
  );
  return recommendations.slice(0, 5).map((item, index) => ({
    id: id * 100 + index,
    customerId: skinTest.customerId || 0,
    type: index === 0 ? 'project' : index === 1 ? 'card' : index === 2 ? 'product' : 'script',
    title: item.title,
    reason: item.reason,
    targetId: item.targetCustomerIds?.[0],
    confidence: item.matchScore,
    payload: item as unknown as Record<string, unknown>,
  }));
}

export async function mockGetTerminalCustomerRecommendations(customerId: number): Promise<TerminalRecommendation[]> {
  const recommendations = await generateRecommendations(
    (await mockGetCustomers()) as any,
    (rawConsumptionRecords as any[]) as any,
    (rawHealthProfiles as any[]) as any,
  );
  return recommendations
    .filter((item) => item.targetCustomerIds?.includes(customerId))
    .slice(0, 6)
    .map((item, index) => ({
      id: customerId * 100 + index,
      customerId,
      type: index === 0 ? 'project' : index === 1 ? 'card' : index === 2 ? 'product' : 'script',
      title: item.title,
      reason: item.reason,
      targetId: item.targetCustomerIds?.[0],
      confidence: item.matchScore,
      payload: item as unknown as Record<string, unknown>,
    }));
}

export async function mockRecordTerminalRecommendationEvent(
  data: TerminalRecommendationEventRequest,
): Promise<{ id: number; createdAt: string }> {
  const current = await ensureState();
  const record = { ...data, id: Date.now(), createdAt: nowString() };
  current.recommendationEvents.unshift(record);
  return { id: record.id, createdAt: record.createdAt };
}

export async function mockGetTerminalPromotions(params?: { customerId?: number; projectId?: number }): Promise<TerminalPromotion[]> {
  if (!params?.projectId) return MOCK_PROMOTIONS;
  return MOCK_PROMOTIONS.filter((promotion) => promotion.applicableProjectIds.includes(params.projectId!));
}
