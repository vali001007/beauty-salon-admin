import type { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2BusinessDetailQueryService } from './agent-v2-business-detail-query.service.js';

describe('AgentV2BusinessDetailQueryService', () => {
  it('looks up a single order detail with items, payments and refunds', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 11,
      orderNo: 'POMQPDGTF8',
      orderKind: 'product',
      customerName: '杨紫萱',
      storeId: 6,
      totalAmount: 628,
      netAmount: 590,
      totalDiscountAmount: 38,
      payMethod: 'wechat',
      status: 'completed',
      source: 'Ami Aura Lite',
      createdAt: new Date('2026-07-01T02:00:00.000Z'),
      remark: '',
      customer: { id: 1, name: '杨紫萱', phone: '13700000000' },
      store: { id: 6, name: 'Ami 全量演示门店' },
      orderItems: [
        {
          id: 101,
          itemType: 'product',
          name: '玻尿酸保湿精华',
          quantity: 1,
          unitPrice: 628,
          netAmount: 590,
          totalDiscountAmount: 38,
          beautician: { id: 9, name: '周宁', phone: '13900000000' },
        },
      ],
      paymentRecords: [
        { paymentNo: 'PAY-1', method: 'wechat', amount: 590, status: 'success', paidAt: new Date('2026-07-01T02:05:00.000Z') },
      ],
      refundRecords: [],
    });
    const service = new AgentV2BusinessDetailQueryService({
      productOrder: { findFirst },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'order.detail.lookup', question: '看一下订单 POMQPDGTF8' },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 6, orderNo: { contains: 'POMQPDGTF8' } },
      include: expect.objectContaining({
        orderItems: expect.any(Object),
        paymentRecords: expect.any(Object),
        refundRecords: expect.any(Object),
      }),
    }));
    expect(result.status).toBe('success');
    expect(result.evidence?.source).toEqual(expect.arrayContaining(['ProductOrder', 'OrderItem', 'PaymentRecord']));
    expect((result.data as any).detail).toMatchObject({
      orderNo: 'POMQPDGTF8',
      orderKindLabel: '商品订单',
      customerName: '杨紫萱',
      netAmountText: '¥590.00',
    });
    expect((result.data as any).items[0]).toMatchObject({
      itemName: '玻尿酸保湿精华',
      itemTypeLabel: '商品',
      staffName: '周宁',
    });
    expect((result.data as any).payments[0]).toMatchObject({
      methodLabel: '微信',
      amountText: '¥590.00',
    });
  });

  it('returns page context for customer marketing pages without database writes', async () => {
    const service = new AgentV2BusinessDetailQueryService({} as unknown as PrismaService);

    const result = await service.execute(
      {
        capabilityId: 'customer.customer.marketing.workbench.page.context',
        queryKey: 'customer.customer.marketing.workbench.page.context',
        dryRun: true,
      },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('营销工作台页面语义');
    expect((result.data as any).pageContext).toMatchObject({
      route: '/customer-marketing/workbench',
      dataSources: expect.arrayContaining(['Customer', 'ConsumptionRecord']),
    });
    expect(result.evidence?.filters).toEqual(expect.arrayContaining([
      'queryKey=customer.customer.marketing.workbench.page.context',
      'write=false',
    ]));
    expect(result.evidence?.limitations?.join(' ')).toContain('不访问写接口');
  });

  it('returns page context for the customer management page without database writes', async () => {
    const service = new AgentV2BusinessDetailQueryService({} as unknown as PrismaService);

    const result = await service.execute(
      {
        capabilityId: 'customer.customers.page.context',
        queryKey: 'customer.customers.page.context',
        dryRun: true,
      },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('客户管理页面语义');
    expect((result.data as any).pageContext).toMatchObject({
      route: '/customers',
      dataSources: expect.arrayContaining(['Customer', 'CustomerHealthProfile', 'ConsumptionRecord']),
    });
    expect(result.evidence?.filters).toEqual(expect.arrayContaining([
      'queryKey=customer.customers.page.context',
      'write=false',
    ]));
  });

  it('does not block publish dry-run for customer detail without an id', async () => {
    const service = new AgentV2BusinessDetailQueryService({} as unknown as PrismaService);

    const result = await service.execute(
      {
        capabilityId: 'customer.customers.id.detail',
        queryKey: 'customer.detail',
        dryRun: true,
      },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect((result.data as any).dataGap).toBe('missing_detail_id');
    expect((result.data as any).queryTrace).toMatchObject({
      engine: 'agent_v2_customer_readonly_adapter',
      queryKey: 'customer.detail',
    });
  });
});
