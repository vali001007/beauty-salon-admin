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
});
