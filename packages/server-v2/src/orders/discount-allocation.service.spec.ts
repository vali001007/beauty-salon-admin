import { BadRequestException } from '@nestjs/common';
import { DiscountAllocationService } from './discount-allocation.service';

describe('DiscountAllocationService', () => {
  let service: DiscountAllocationService;

  beforeEach(() => {
    service = new DiscountAllocationService();
  });

  it('allocates package price discount by item price ratio', () => {
    const result = service.allocate({
      discountMode: 'package_price',
      packagePrice: 680,
      items: [
        { itemType: 'project', itemId: 101, name: '补水项目', quantity: 1, unitPrice: 500 },
        { itemType: 'product', itemId: 201, name: '面膜商品', quantity: 1, unitPrice: 300 },
      ],
    });

    expect(result.order).toMatchObject({ listAmount: 800, orderDiscountAmount: 120, netAmount: 680 });
    expect(result.items).toEqual([
      expect.objectContaining({ name: '补水项目', listAmount: 500, orderAllocatedDiscountAmount: 75, netAmount: 425 }),
      expect.objectContaining({ name: '面膜商品', listAmount: 300, orderAllocatedDiscountAmount: 45, netAmount: 255 }),
    ]);
  });

  it('keeps gift item revenue at zero and excludes it from order discount allocation', () => {
    const result = service.allocate({
      discountMode: 'amount',
      discountAmount: 50,
      items: [
        { itemType: 'project', itemId: 101, name: '补水项目', quantity: 1, unitPrice: 500 },
        { itemType: 'product', itemId: 203, name: '赠送面膜', quantity: 1, unitPrice: 100, isGift: true },
      ],
    });

    expect(result.order).toMatchObject({ listAmount: 600, orderDiscountAmount: 50, totalDiscountAmount: 150, netAmount: 450 });
    expect(result.items[0]).toEqual(expect.objectContaining({ orderAllocatedDiscountAmount: 50, netAmount: 450 }));
    expect(result.items[1]).toEqual(expect.objectContaining({ isGift: true, itemDiscountAmount: 100, orderAllocatedDiscountAmount: 0, netAmount: 0 }));
  });

  it('handles item discount plus order discount', () => {
    const result = service.allocate({
      discountMode: 'amount',
      discountAmount: 30,
      items: [{ itemType: 'product', itemId: 202, name: '修护精华', quantity: 2, unitPrice: 200, itemDiscountAmount: 100 }],
    });

    expect(result.order).toMatchObject({ listAmount: 400, itemDiscountAmount: 100, orderDiscountAmount: 30, totalDiscountAmount: 130, netAmount: 270 });
    expect(result.items[0]).toEqual(expect.objectContaining({ itemDiscountAmount: 100, orderAllocatedDiscountAmount: 30, netAmount: 270 }));
  });

  it('puts rounding difference on the highest list amount item', () => {
    const result = service.allocate({
      discountMode: 'amount',
      discountAmount: 1,
      items: [
        { itemType: 'project', itemId: 1, name: '项目A', quantity: 1, unitPrice: 100 },
        { itemType: 'product', itemId: 2, name: '商品B', quantity: 1, unitPrice: 100 },
        { itemType: 'product', itemId: 3, name: '商品C', quantity: 1, unitPrice: 101 },
      ],
    });

    expect(result.items.reduce((sum, item) => sum + item.orderAllocatedDiscountAmount, 0)).toBe(1);
    expect(result.items[2].orderAllocatedDiscountAmount).toBe(0.34);
  });

  it('rejects discount greater than discountable amount', () => {
    expect(() =>
      service.allocate({
        discountMode: 'amount',
        discountAmount: 101,
        items: [{ itemType: 'product', itemId: 1, name: '商品', quantity: 1, unitPrice: 100 }],
      }),
    ).toThrow(BadRequestException);
  });
});
