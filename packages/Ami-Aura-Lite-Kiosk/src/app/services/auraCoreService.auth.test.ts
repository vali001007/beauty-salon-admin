import { beforeEach, describe, expect, it, vi } from "vitest";

let service: typeof import("./auraCoreService") | null = null;

async function getService() {
  service ??= await import("./auraCoreService");
  return service;
}

const mocks = vi.hoisted(() => {
  const user = {
    id: 1,
    username: "admin",
    name: "Admin",
    roles: ["super_admin"],
    permissions: ["*"],
    storeIds: [1],
  };
  const store = {
    id: 1,
    name: "Ami Test Store",
    city: "",
    address: "",
    phone: "",
    status: "active",
    shiftRequired: true,
  };
  const bootstrap = {
    currentUser: user,
    currentStore: store,
    availableStores: [store],
    terminalUsers: [
      {
        id: user.id,
        name: user.name,
        username: user.username,
        roles: user.roles,
        permissions: user.permissions,
        storeIds: user.storeIds,
      },
    ],
    currentRole: "manager",
    availableRoles: ["manager"],
    availableActions: [],
    quickActions: [],
    permissions: ["*"],
    dataScopes: {},
  };
  const authState = {
    token: null as string | null,
    user: null as typeof user | null,
    isAuthenticated: false,
    login: vi.fn(async () => {
      window.localStorage.setItem("token", "fresh-token");
      authState.token = "fresh-token";
      authState.user = user;
      authState.isAuthenticated = true;
    }),
    logout: vi.fn(() => {
      window.localStorage.removeItem("token");
      authState.token = null;
      authState.user = null;
      authState.isAuthenticated = false;
    }),
    loadUserInfo: vi.fn(async () => {
      authState.user = user;
    }),
    setAuth: vi.fn((token: string, nextUser: typeof user) => {
      window.localStorage.setItem("token", token);
      authState.token = token;
      authState.user = nextUser;
      authState.isAuthenticated = true;
    }),
  };
  const storeState = {
    currentStoreId: 1 as number | null,
    stores: [store],
    setCurrentStore: vi.fn((id: number | null) => {
      storeState.currentStoreId = id;
    }),
    loadStores: vi.fn(async () => {
      storeState.stores = [store];
    }),
  };
  const api = {
    getProjects: vi.fn(async (): Promise<any[]> => []),
    getTerminalCatalogSync: vi.fn(async (): Promise<any> => ({ projects: [] })),
    getTerminalBootstrap: vi.fn(async () => bootstrap),
    getTerminalCardVerificationContext: vi.fn(async (): Promise<any> => ({ customers: [], storeName: store.name, generatedAt: "2026-06-11T09:00:00.000Z" })),
    getTerminalCustomerCards: vi.fn(async (): Promise<any[]> => []),
    getTerminalCustomerSummary: vi.fn(async (): Promise<any> => null),
    getUserInfo: vi.fn(async () => user),
  };

  return { api, authState, bootstrap, store, storeState, user };
});

vi.mock("@/api", () => {
  const unusedApi = vi.fn();
  return {
    getBeauticians: unusedApi,
    getCards: unusedApi,
    getCustomers: unusedApi,
    getCustomersPaginated: unusedApi,
    getProjects: mocks.api.getProjects,
    getProducts: unusedApi,
    getProductOrders: unusedApi,
    getProductOrdersPaginated: unusedApi,
    getReservationsPaginated: unusedApi,
    getWeeklySchedules: unusedApi,
    getStockItemsPaginated: unusedApi,
    getTerminalBootstrap: mocks.api.getTerminalBootstrap,
    getTerminalBeauticianCommission: unusedApi,
    closeTerminalCashierShift: unusedApi,
    getTerminalCatalogSync: mocks.api.getTerminalCatalogSync,
    getTerminalCurrentCashierShift: unusedApi,
    getTerminalInventoryAlertsDashboard: unusedApi,
    getTerminalInventoryAlerts: unusedApi,
    getTerminalInventoryStock: unusedApi,
    getTerminalManagerDashboard: unusedApi,
    getTerminalCustomerGrowthDashboard: unusedApi,
    getTerminalCustomerGrowthCandidates: unusedApi,
    getTerminalCashierContext: unusedApi,
    getTerminalCardVerificationContext: mocks.api.getTerminalCardVerificationContext,
    getTerminalRoleDashboard: unusedApi,
    getTerminalStaffSchedulesDashboard: unusedApi,
    getTerminalTodayReservationsDashboard: unusedApi,
    getTerminalReservations: unusedApi,
    getUserInfo: mocks.api.getUserInfo,
    analyzeSkinPhoto: unusedApi,
    cancelTerminalReservation: unusedApi,
    confirmTerminalReservation: unusedApi,
    login: unusedApi,
    openTerminalCashierShift: unusedApi,
    checkInTerminalReservation: unusedApi,
    completeTerminalPayment: unusedApi,
    createTerminalCardOrder: unusedApi,
    createTerminalCashierOrder: unusedApi,
    createTerminalPrintJob: unusedApi,
    createTerminalRechargeOrder: unusedApi,
    createTerminalReservation: unusedApi,
    createTerminalServiceRecord: unusedApi,
    createTerminalSkinTest: unusedApi,
    createTerminalAutomationStrategy: unusedApi,
    enableTerminalAutomationStrategy: unusedApi,
    getTerminalAutomationExecutionDetail: unusedApi,
    getTerminalAutomationTemplates: unusedApi,
    getTerminalAutomationTodaySummary: unusedApi,
    previewTerminalAutomationStrategy: unusedApi,
    getTerminalCustomerCards: mocks.api.getTerminalCustomerCards,
    getTerminalCustomerSummary: mocks.api.getTerminalCustomerSummary,
    getTerminalServiceTasks: unusedApi,
    markTerminalAutomationTouchFollowedUp: unusedApi,
    pauseTerminalAutomationStrategy: unusedApi,
    quickCreateTerminalCustomer: unusedApi,
    generateTerminalServiceAdvice: unusedApi,
    recommendNextBestAction: unusedApi,
    rescheduleTerminalReservation: unusedApi,
    runDueTerminalAutomations: unusedApi,
    runTerminalAutomationOnce: unusedApi,
    sendAiChatMessage: unusedApi,
    streamAiChatMessage: unusedApi,
    updateTerminalReservation: unusedApi,
    verifyTerminalCardUsage: unusedApi,
  };
});

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => mocks.authState,
  },
}));

vi.mock("@/stores/storeStore", () => ({
  useStoreStore: {
    getState: () => mocks.storeState,
  },
}));

async function resetMockState() {
  window.localStorage.clear();
  mocks.authState.token = null;
  mocks.authState.user = null;
  mocks.authState.isAuthenticated = false;
  mocks.storeState.currentStoreId = 1;
  mocks.storeState.stores = [mocks.store];
  mocks.api.getProjects.mockResolvedValue([]);
  mocks.api.getTerminalCatalogSync.mockResolvedValue({ projects: [] });
  mocks.api.getTerminalBootstrap.mockResolvedValue(mocks.bootstrap);
  mocks.api.getTerminalCardVerificationContext.mockResolvedValue({ customers: [], storeName: mocks.store.name, generatedAt: "2026-06-11T09:00:00.000Z" });
  mocks.api.getTerminalCustomerCards.mockResolvedValue([]);
  mocks.api.getTerminalCustomerSummary.mockResolvedValue(null);
  mocks.api.getUserInfo.mockResolvedValue(mocks.user);
  const auraService = await getService();
  auraService.clearAuraStartupCache();
}

describe("auraCoreService auth repair", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetMockState();
  });

  it("logs in before bootstrap when the auth store token is stale but localStorage is empty", async () => {
    mocks.authState.token = "stale-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;
    window.localStorage.removeItem("token");
    mocks.api.getTerminalBootstrap.mockImplementation(async () => {
      expect(window.localStorage.getItem("token")).toBe("fresh-token");
      return mocks.bootstrap;
    });

    const auraService = await getService();
    await auraService.loadAuraBootstrap();

    expect(mocks.authState.logout).toHaveBeenCalledTimes(1);
    expect(mocks.authState.login).toHaveBeenCalledTimes(1);
    expect(mocks.api.getTerminalBootstrap).toHaveBeenCalledTimes(1);
  });

  it("repairs auth and retries bootstrap once after a terminal 401 clears the token", async () => {
    window.localStorage.setItem("token", "expired-token");
    mocks.authState.token = "expired-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;
    const authError = Object.assign(new Error("缺少设备认证令牌"), {
      payload: { status: 401, message: "缺少设备认证令牌" },
    });
    mocks.api.getTerminalBootstrap
      .mockImplementationOnce(async () => {
        window.localStorage.removeItem("token");
        throw authError;
      })
      .mockImplementationOnce(async () => {
        expect(window.localStorage.getItem("token")).toBe("fresh-token");
        return mocks.bootstrap;
      });

    const auraService = await getService();
    await auraService.loadAuraBootstrap();

    expect(mocks.authState.login).toHaveBeenCalledTimes(1);
    expect(mocks.api.getTerminalBootstrap).toHaveBeenCalledTimes(2);
  });

  it("loads card verification details from terminal customer APIs", async () => {
    mocks.api.getTerminalCardVerificationContext.mockResolvedValue({
      customers: [
        {
          id: 3794,
          name: "Li Wei",
          phone: "15895260608",
          memberLevel: "Silver",
          tags: ["VIP"],
          lastVisitDate: "2026-05-11T02:00:00.000Z",
          activeCustomerCardsCount: 1,
          isAppointedToday: true,
          appointmentTime: "2026-06-11 10:00:00",
          appointmentProjectName: "Hydration",
        },
      ],
      storeName: mocks.store.name,
      generatedAt: "2026-06-11T09:00:00.000Z",
    });
    mocks.api.getTerminalCustomerSummary.mockResolvedValue({
      customer: {
        id: 3794,
        name: "Li Wei",
        phone: "15895260608",
        gender: "女",
        memberLevel: "Silver",
        totalSpent: 7702,
        visitCount: 29,
        lastVisitDate: "2026-05-11T02:00:00.000Z",
        tags: ["VIP"],
        source: "demo",
        storeName: mocks.store.name,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      availableCardCount: 1,
      lastVisitDate: "2026-05-11T02:00:00.000Z",
    });
    mocks.api.getTerminalCustomerCards.mockResolvedValue([
      {
        id: 466,
        customerId: 3794,
        cardId: 12,
        cardName: "Hydration 10 Pack",
        totalTimes: 10,
        remainingTimes: 7,
        expiryDate: "2027-01-12T02:00:00.000Z",
        applicableProjects: ["Hydration"],
        status: "active",
      },
    ]);
    mocks.api.getTerminalCatalogSync.mockResolvedValue({ projects: [{ id: 101, name: "Hydration" }] });

    const auraService = await getService();
    const detail = await auraService.getCardVerificationCards(3794);

    expect(mocks.api.getTerminalCustomerSummary).toHaveBeenCalledWith(3794);
    expect(mocks.api.getTerminalCustomerCards).toHaveBeenCalledWith(3794);
    expect(detail).toMatchObject({
      id: 3794,
      name: "Li Wei",
      isAppointedToday: true,
      appointmentProjectName: "Hydration",
      cards: [
        {
          customerCardId: 466,
          cardName: "Hydration 10 Pack",
          remainingTimes: 7,
          projects: [{ id: 101, name: "Hydration", times: 1, remainingAfterUse: 6 }],
        },
      ],
    });
  });
});
