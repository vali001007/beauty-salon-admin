// @vitest-environment jsdom
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
    askBusinessQuery: vi.fn(async (): Promise<any> => ({ status: "success", title: "Ami 问数", summary: "ok" })),
    approveAgentApproval: vi.fn(async (): Promise<any> => ({ id: 1, status: "approved" })),
    appendAgentMessage: vi.fn(async (): Promise<any> => ({ runId: 1, status: "success" })),
    appendAgentV4Message: vi.fn(async (): Promise<any> => ({ runId: 4, status: "success" })),
    appendAgentV5Message: vi.fn(async (): Promise<any> => ({ runId: 5, status: "success" })),
    createAgentRun: vi.fn(async (): Promise<any> => ({ runId: 1, status: "success" })),
    createAgentV4Run: vi.fn(async (): Promise<any> => ({ runId: 4, status: "success" })),
    createAgentV5Run: vi.fn(async (): Promise<any> => ({ runId: 5, status: "success" })),
    createBrainConversation: vi.fn(async (): Promise<any> => ({ id: 16 })),
    sendBrainMessage: vi.fn(async (): Promise<any> => ({
      conversationId: 16,
      runId: 1,
      status: "completed",
      answer: "今日经营正常",
      citations: [],
      suggestedActions: [],
    })),
    rejectAgentApproval: vi.fn(async (): Promise<any> => ({ id: 1, status: "rejected" })),
    submitAgentFeedback: vi.fn(async (): Promise<any> => undefined),
    getProjects: vi.fn(async (): Promise<any[]> => []),
    getTerminalCatalogSync: vi.fn(async (): Promise<any> => ({ projects: [] })),
    getTerminalBootstrap: vi.fn(async () => bootstrap),
    getTerminalCardVerificationContext: vi.fn(async (): Promise<any> => ({ customers: [], storeName: store.name, generatedAt: "2026-06-11T09:00:00.000Z" })),
    getTerminalCustomerCards: vi.fn(async (): Promise<any[]> => []),
    getTerminalCustomerSummary: vi.fn(async (): Promise<any> => null),
    createTerminalCashierOrder: vi.fn(async (): Promise<any> => ({
      id: 1,
      orderNo: "POAUTH001",
      checkoutGroupNo: "POAUTH001",
      status: "completed",
      storeName: store.name,
      items: [{ name: "小气泡清洁护理", quantity: 1, unitPrice: 398, subtotal: 398, netAmount: 398 }],
      totalAmount: 398,
      netAmount: 398,
      listAmount: 398,
      totalDiscountAmount: 0,
      createdAt: "2026-06-26T10:00:00.000Z",
    })),
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
    askBusinessQuery: mocks.api.askBusinessQuery,
    approveAgentApproval: mocks.api.approveAgentApproval,
    appendAgentMessage: mocks.api.appendAgentMessage,
    appendAgentV2Message: unusedApi,
    appendAgentV3Message: unusedApi,
    appendAgentV4Message: mocks.api.appendAgentV4Message,
    appendAgentV5Message: mocks.api.appendAgentV5Message,
    createAgentRun: mocks.api.createAgentRun,
    createAgentV2Run: unusedApi,
    createAgentV3Run: unusedApi,
    createAgentV4Run: mocks.api.createAgentV4Run,
    createAgentV5Run: mocks.api.createAgentV5Run,
    createBrainConversation: mocks.api.createBrainConversation,
    sendBrainMessage: mocks.api.sendBrainMessage,
    getBrainRunContext: unusedApi,
    createBrainFeedback: unusedApi,
    confirmBrainAction: unusedApi,
    rejectBrainAction: unusedApi,
    rejectAgentApproval: mocks.api.rejectAgentApproval,
    submitAgentFeedback: mocks.api.submitAgentFeedback,
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
    createTerminalCashierOrder: mocks.api.createTerminalCashierOrder,
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
  mocks.api.askBusinessQuery.mockResolvedValue({ status: "success", title: "Ami 问数", summary: "ok" });
  mocks.api.approveAgentApproval.mockResolvedValue({ id: 1, status: "approved" });
  mocks.api.appendAgentMessage.mockResolvedValue({ runId: 1, status: "success" });
  mocks.api.createAgentRun.mockResolvedValue({ runId: 1, status: "success" });
  mocks.api.createBrainConversation.mockResolvedValue({ id: 16 });
  mocks.api.sendBrainMessage.mockResolvedValue({
    conversationId: 16,
    runId: 1,
    status: "completed",
    answer: "今日经营正常",
    citations: [],
    suggestedActions: [],
  });
  mocks.api.rejectAgentApproval.mockResolvedValue({ id: 1, status: "rejected" });
  mocks.api.submitAgentFeedback.mockResolvedValue(undefined);
  mocks.api.getTerminalCardVerificationContext.mockResolvedValue({ customers: [], storeName: mocks.store.name, generatedAt: "2026-06-11T09:00:00.000Z" });
  mocks.api.getTerminalCustomerCards.mockResolvedValue([]);
  mocks.api.getTerminalCustomerSummary.mockResolvedValue(null);
  mocks.api.createTerminalCashierOrder.mockResolvedValue({
    id: 1,
    orderNo: "POAUTH001",
    checkoutGroupNo: "POAUTH001",
    status: "completed",
    storeName: mocks.store.name,
    items: [{ name: "小气泡清洁护理", quantity: 1, unitPrice: 398, subtotal: 398, netAmount: 398 }],
    totalAmount: 398,
    netAmount: 398,
    listAmount: 398,
    totalDiscountAmount: 0,
    createdAt: "2026-06-26T10:00:00.000Z",
  });
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

  it("keeps admin-synced terminal users disabled when they have no terminal permission", async () => {
    mocks.api.getTerminalBootstrap.mockResolvedValue({
      ...mocks.bootstrap,
      terminalUsers: [
        ...mocks.bootstrap.terminalUsers,
        {
          id: 99,
          username: "report_viewer",
          name: "报表账号",
          roles: ["report_viewer"],
          permissions: ["core:dashboard:view"],
          storeIds: [1],
          availableRoles: [],
          defaultRole: "reception",
          roleLabel: "未配置终端权限",
          terminalAccess: false,
          disabled: true,
          disabledReason: "未配置智能终端权限",
        },
      ] as any,
    });

    const auraService = await getService();
    const result = await auraService.loadAuraBootstrap();

    expect(result.terminalUsers.find((user) => user.id === 99)).toEqual(
      expect.objectContaining({
        availableRoles: [],
        roleLabel: "未配置终端权限",
        terminalAccess: false,
        disabled: true,
        disabledReason: "未配置智能终端权限",
      }),
    );
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

  it("repairs auth and retries agent runs once when runtime device token expires", async () => {
    window.localStorage.setItem("token", "expired-token");
    mocks.authState.token = "expired-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;
    const authError = Object.assign(new Error("设备令牌无效或已过期"), {
      payload: { status: 401, message: "设备令牌无效或已过期" },
    });
    mocks.api.createAgentRun
      .mockImplementationOnce(async () => {
        window.localStorage.removeItem("token");
        throw authError;
      })
      .mockResolvedValueOnce({ runId: 2, status: "success" });

    const auraService = await getService();
    const result = await auraService.runBusinessAgent("近期表现较好的员工", "manager");

    expect(result).toMatchObject({ runId: 2, status: "success" });
    expect(mocks.authState.login).toHaveBeenCalledTimes(1);
    expect(mocks.api.createAgentRun).toHaveBeenCalledTimes(2);
    expect(mocks.api.createAgentRun).toHaveBeenNthCalledWith(1, expect.objectContaining({ operatorId: null }));
    expect(mocks.api.createAgentRun).toHaveBeenNthCalledWith(2, expect.objectContaining({ operatorId: null }));
    expect(window.localStorage.getItem("token")).toBe("fresh-token");
  });

  it("logs in before terminal runtime agent runs when the token is missing", async () => {
    window.localStorage.removeItem("token");
    mocks.authState.token = null;
    mocks.authState.user = null;
    mocks.authState.isAuthenticated = false;

    const runtimeService = await import("./agentRuntimeService");
    const result = await runtimeService.createTerminalAgentRun({
      command: "今天经营有什么风险",
      role: "manager",
      sourceAction: "business.query",
      source: "text",
    });

    expect(result).toMatchObject({ runId: 1, status: "completed" });
    expect(mocks.authState.login).toHaveBeenCalledTimes(1);
    expect(mocks.api.createBrainConversation).toHaveBeenCalledTimes(1);
    expect(mocks.api.sendBrainMessage).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("token")).toBe("fresh-token");
  });

  it("routes terminal runtime agent_v4 runs to Agent V4 API with lifecycle context", async () => {
    window.localStorage.setItem("token", "fresh-token");
    mocks.authState.token = "fresh-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;

    const runtimeService = await import("./agentRuntimeService");
    const result = await runtimeService.createTerminalAgentRun({
      command: "生成本周经营计划",
      role: "manager",
      agentEngine: "agent_v4",
      sourceAction: "business.query",
      source: "text",
    });

    expect(result).toMatchObject({ runId: 4, status: "success" });
    expect(mocks.api.createAgentV4Run).toHaveBeenCalledWith(expect.objectContaining({
      message: "生成本周经营计划",
      context: expect.objectContaining({
        agentEngine: "agent_v4",
        architecture: "agent_v4_lifecycle_business_agent",
        agentV4Mode: "execute",
        boundary: "drafts_and_approval_only",
      }),
    }));
    expect(mocks.api.createAgentRun).not.toHaveBeenCalled();
  });

  it("routes terminal runtime agent_v5 runs to Agent V5 API with full-business ontology context", async () => {
    window.localStorage.setItem("token", "fresh-token");
    mocks.authState.token = "fresh-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;

    const runtimeService = await import("./agentRuntimeService");
    const result = await runtimeService.createTerminalAgentRun({
      command: "今天店里情况怎么样",
      role: "manager",
      agentEngine: "agent_v5",
      sourceAction: "business.query",
      source: "text",
    });

    expect(result).toMatchObject({ runId: 5, status: "success" });
    expect(mocks.api.createAgentV5Run).toHaveBeenCalledWith(expect.objectContaining({
      message: "今天店里情况怎么样",
      context: expect.objectContaining({
        agentEngine: "agent_v5",
        architecture: "agent_v5_business_ontology_agent",
        agentV5Mode: "execute",
        boundary: "drafts_followups_and_approval_only",
      }),
    }));
    expect(mocks.api.createAgentV4Run).not.toHaveBeenCalled();
    expect(mocks.api.createAgentRun).not.toHaveBeenCalled();
  });

  it("repairs auth and retries business query once when runtime device token expires", async () => {
    window.localStorage.setItem("token", "expired-token");
    mocks.authState.token = "expired-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;
    const authError = Object.assign(new Error("缺少设备认证令牌"), {
      payload: { status: 401, message: "缺少设备认证令牌" },
    });
    mocks.api.askBusinessQuery
      .mockImplementationOnce(async () => {
        window.localStorage.removeItem("token");
        throw authError;
      })
      .mockResolvedValueOnce({ status: "success", title: "Ami 问数", summary: "已恢复" });

    const auraService = await getService();
    const result = await auraService.getBusinessQueryAnswer("最近销量好的商品有哪些", "manager");

    expect(result).toMatchObject({ status: "success", summary: "已恢复" });
    expect(mocks.authState.login).toHaveBeenCalledTimes(1);
    expect(mocks.api.askBusinessQuery).toHaveBeenCalledTimes(2);
    expect(mocks.api.askBusinessQuery).toHaveBeenNthCalledWith(1, expect.objectContaining({ operatorId: null }));
    expect(mocks.api.askBusinessQuery).toHaveBeenNthCalledWith(2, expect.objectContaining({ operatorId: null }));
    expect(window.localStorage.getItem("token")).toBe("fresh-token");
  });

  it("repairs auth and retries cashier payment once when the terminal token is missing", async () => {
    window.localStorage.removeItem("token");
    mocks.authState.token = null;
    mocks.authState.user = null;
    mocks.authState.isAuthenticated = false;
    const authError = Object.assign(new Error("缺少设备认证令牌"), {
      payload: { status: 401, message: "缺少设备认证令牌" },
    });
    mocks.api.createTerminalCashierOrder
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce({
        id: 2,
        orderNo: "POAUTH002",
        checkoutGroupNo: "POAUTH002",
        status: "completed",
        storeName: mocks.store.name,
        items: [{ name: "小气泡清洁护理", quantity: 1, unitPrice: 398, subtotal: 398, netAmount: 398 }],
        totalAmount: 398,
        netAmount: 398,
        listAmount: 398,
        totalDiscountAmount: 0,
        createdAt: "2026-06-26T10:00:00.000Z",
      });

    const auraService = await getService();
    const result = await auraService.confirmCashierPayment({
      customerId: 1,
      customerName: "林晓曼",
      customerPhone: "13766425293",
      items: [{ itemType: "project", itemId: 1, name: "小气泡清洁护理", quantity: 1, unitPrice: 398 }],
      discountAmount: 0,
      paymentMethod: "微信",
    });

    expect(result).toMatchObject({ title: "收银完成", status: "success" });
    expect(mocks.authState.login).toHaveBeenCalledTimes(2);
    expect(mocks.api.createTerminalCashierOrder).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem("token")).toBe("fresh-token");
  });

  it("isolates runtime conversation context by operator and role", async () => {
    const auraService = await getService();
    const managerScope = auraService.getConversationScopeForOperator(1, "manager");
    const beauticianScope = auraService.getConversationScopeForOperator(1, "beautician");
    const otherOperatorScope = auraService.getConversationScopeForOperator(2, "manager");

    expect(managerScope).not.toBe(beauticianScope);
    expect(managerScope).not.toBe(otherOperatorScope);

    auraService.setConversationScope(managerScope);
    auraService.clearConversation();
    auraService.appendToConversation("user", "店长看今天经营");
    auraService.appendToConversation("assistant", "店长经营数据");

    auraService.setConversationScope(beauticianScope);
    auraService.clearConversation();
    auraService.appendToConversation("user", "美容师看我的预约");

    auraService.setConversationScope(otherOperatorScope);
    auraService.clearConversation();
    auraService.appendToConversation("user", "另一个店长的问题");

    auraService.setConversationScope(managerScope);
    expect(auraService.getConversationMessages().map((message) => message.content)).toEqual([
      "店长看今天经营",
      "店长经营数据",
    ]);

    auraService.setConversationScope(beauticianScope);
    expect(auraService.getConversationMessages().map((message) => message.content)).toEqual(["美容师看我的预约"]);

    auraService.setConversationScope(otherOperatorScope);
    expect(auraService.getConversationMessages().map((message) => message.content)).toEqual(["另一个店长的问题"]);
  });

  it("sends the current role when deciding Agent approvals", async () => {
    window.localStorage.setItem("token", "valid-token");
    mocks.authState.token = "valid-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;

    const auraService = await getService();
    await auraService.approveBusinessAgentAction(301, "beautician", "本人确认");
    await auraService.rejectBusinessAgentAction(302, "reception", "前台拒绝");

    expect(mocks.api.approveAgentApproval).toHaveBeenCalledWith(301, {
      role: "beautician",
      operatorId: null,
      comment: "本人确认",
    });
    expect(mocks.api.rejectAgentApproval).toHaveBeenCalledWith(302, {
      role: "reception",
      operatorId: null,
      comment: "前台拒绝",
    });
  });

  it("sends the selected terminal operator to Agent and business query requests", async () => {
    window.localStorage.setItem("token", "valid-token");
    mocks.authState.token = "valid-token";
    mocks.authState.user = mocks.user;
    mocks.authState.isAuthenticated = true;

    const auraService = await getService();
    auraService.setActiveTerminalOperator(31, "beautician");

    await auraService.runBusinessAgent("我的表现怎么样", "beautician");
    await auraService.getBusinessQueryAnswer("我的表现怎么样", "beautician");
    await auraService.approveBusinessAgentAction(301, "beautician", "本人确认");
    await auraService.rejectBusinessAgentAction(302, "beautician", "本人拒绝");

    expect(mocks.api.createAgentRun).toHaveBeenCalledWith(expect.objectContaining({ role: "beautician", operatorId: 31 }));
    expect(mocks.api.askBusinessQuery).toHaveBeenCalledWith(expect.objectContaining({ role: "beautician", operatorId: 31 }));
    expect(mocks.api.approveAgentApproval).toHaveBeenCalledWith(301, expect.objectContaining({ role: "beautician", operatorId: 31 }));
    expect(mocks.api.rejectAgentApproval).toHaveBeenCalledWith(302, expect.objectContaining({ role: "beautician", operatorId: 31 }));
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
