import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../client', () => ({
  default: apiClientMock,
}));

describe('terminal real API payload normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.post.mockResolvedValue({});
    apiClientMock.put.mockResolvedValue({});
    apiClientMock.patch.mockResolvedValue({});
  });

  it('strips display-only fields from service record consumption items', async () => {
    const { realCreateTerminalServiceRecord } = await import('./terminal');

    await realCreateTerminalServiceRecord({
      customerId: 1,
      projectId: 2,
      consumptionItems: [
        {
          productId: 3,
          productName: '精油',
          sku: 'EO-1',
          standardQty: 1,
          actualQty: 1,
          unit: '瓶',
          duration: 90,
          projectName: '全身精油 SPA',
        } as any,
      ],
    });

    expect(apiClientMock.post).toHaveBeenCalledWith('/terminal/service-records', {
      customerId: 1,
      projectId: 2,
      consumptionItems: [
        {
          productId: 3,
          productName: '精油',
          sku: 'EO-1',
          standardQty: 1,
          actualQty: 1,
          unit: '瓶',
        },
      ],
    });
  });

  it('normalizes complete-service payloads before submit', async () => {
    const { realCompleteTerminalServiceTask } = await import('./terminal');

    await realCompleteTerminalServiceTask(8, {
      beauticianId: 9,
      result: '服务已完成',
      consumptionItems: [
        {
          productName: '面膜',
          sku: 'MASK-1',
          standardQty: '2',
          actualQty: undefined,
          unit: '片',
          projectName: '深层补水护理',
        } as any,
      ],
    });

    expect(apiClientMock.patch).toHaveBeenCalledWith('/terminal/tasks/8/complete', {
      beauticianId: 9,
      result: '服务已完成',
      consumptionItems: [
        {
          productName: '面膜',
          sku: 'MASK-1',
          standardQty: 2,
          actualQty: 2,
          unit: '片',
        },
      ],
    });
  });

  it('routes terminal follow-up task queries and completion to task endpoints', async () => {
    const { realGetTerminalFollowUpTasks, realStartTerminalFollowUpTask, realCompleteTerminalFollowUpTask } = await import('./terminal');

    await realGetTerminalFollowUpTasks({ page: 1, pageSize: 10, status: 'pending', operatorId: 32 });
    await realStartTerminalFollowUpTask(12);
    await realCompleteTerminalFollowUpTask(12, { resultType: 'contacted', result: '已电话沟通' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/terminal/follow-up-tasks', {
      params: { page: 1, pageSize: 10, status: 'pending', operatorId: 32 },
    });
    expect(apiClientMock.patch).toHaveBeenCalledWith('/terminal/follow-up-tasks/12/start');
    expect(apiClientMock.patch).toHaveBeenCalledWith('/terminal/follow-up-tasks/12/complete', {
      resultType: 'contacted',
      result: '已电话沟通',
    });
  });

  it('keeps cashier item service staff fields when submitting checkout', async () => {
    const { realCreateTerminalCashierOrder } = await import('./terminal');

    await realCreateTerminalCashierOrder({
      customerId: 1,
      customerName: '徐欣怡',
      customerPhone: '18822013339',
      paymentMethod: 'wechat',
      items: [
        {
          itemType: 'project',
          itemId: 101,
          name: '深层补水护理',
          quantity: 1,
          unitPrice: 298,
          subtotal: 298,
          beauticianId: 2,
          beauticianName: '沈晴',
        },
      ],
    });

    expect(apiClientMock.post).toHaveBeenCalledWith('/terminal/cashier/checkout', {
      customerId: 1,
      customerName: '徐欣怡',
      customerPhone: '18822013339',
      payMethod: 'wechat',
      discountAmount: undefined,
      items: [
        {
          itemId: 101,
          itemType: 'project',
          name: '深层补水护理',
          quantity: 1,
          unitPrice: 298,
          subtotal: 298,
          beauticianId: 2,
          beauticianName: '沈晴',
        },
      ],
      remark: undefined,
    });
  });
});
