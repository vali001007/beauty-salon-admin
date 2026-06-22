import { BadRequestException, Injectable } from '@nestjs/common';

export type DiscountMode = 'none' | 'amount' | 'rate' | 'package_price' | 'manual';
export type AllocationMethod = 'none' | 'direct' | 'price_ratio' | 'manual';
export type DiscountSource = 'none' | 'item' | 'order' | 'package' | 'promotion' | 'coupon' | 'manual' | 'gift';

export type DiscountInputItem = {
  itemType?: string;
  type?: string;
  itemId?: number | string | null;
  productId?: number | string | null;
  projectId?: number | string | null;
  cardId?: number | string | null;
  name?: string;
  productName?: string;
  projectName?: string;
  cardName?: string;
  quantity?: unknown;
  qty?: unknown;
  unitPrice?: unknown;
  price?: unknown;
  amount?: unknown;
  subtotal?: unknown;
  discount?: unknown;
  listAmount?: unknown;
  itemDiscountAmount?: unknown;
  orderAllocatedDiscountAmount?: unknown;
  netAmount?: unknown;
  eligibleForOrderDiscount?: boolean;
  isGift?: boolean;
  discountSource?: string;
  allocationMethod?: string;
  discountPayload?: Record<string, unknown>;
  payload?: unknown;
  beauticianId?: number | string | null;
  beauticianName?: string;
  [key: string]: unknown;
};

export type DiscountAllocationInput = {
  items: DiscountInputItem[];
  discountMode?: DiscountMode;
  discountAmount?: unknown;
  discountRate?: unknown;
  packagePrice?: unknown;
  allocationMethod?: AllocationMethod;
  discountSource?: DiscountSource;
  promotionId?: number;
  couponId?: number;
  packageId?: number;
  authorizedBy?: number;
  reason?: string;
};

export type AllocatedOrderItem = {
  itemType: string;
  itemId?: number;
  name: string;
  quantity: number;
  unitPrice: number;
  listAmount: number;
  itemDiscountAmount: number;
  orderAllocatedDiscountAmount: number;
  totalDiscountAmount: number;
  netAmount: number;
  subtotal: number;
  discount: number;
  discountSource: string;
  allocationMethod: string;
  discountPayload?: Record<string, unknown>;
  isGift: boolean;
  eligibleForOrderDiscount: boolean;
  beauticianId?: number;
  beauticianName?: string;
  payload: unknown;
};

export type DiscountAllocationResult = {
  order: {
    listAmount: number;
    itemDiscountAmount: number;
    orderDiscountAmount: number;
    totalDiscountAmount: number;
    netAmount: number;
    discountSource: string;
    allocationMethod: string;
    promotionId?: number;
    couponId?: number;
    packageId?: number;
    discountPayload: Record<string, unknown>;
  };
  items: AllocatedOrderItem[];
};

@Injectable()
export class DiscountAllocationService {
  private toNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : 0;
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  allocate(input: DiscountAllocationInput): DiscountAllocationResult {
    const items = this.normalizeItems(input.items);
    if (!items.length) {
      return {
        order: {
          listAmount: 0,
          itemDiscountAmount: 0,
          orderDiscountAmount: 0,
          totalDiscountAmount: 0,
          netAmount: 0,
          discountSource: 'none',
          allocationMethod: 'none',
          discountPayload: { discountMode: input.discountMode ?? 'none' },
        },
        items: [],
      };
    }

    const listAmount = this.round(items.reduce((sum, item) => sum + item.listAmount, 0));
    const itemDiscountAmount = this.round(items.reduce((sum, item) => sum + item.itemDiscountAmount, 0));
    const orderDiscountAmount = this.resolveOrderDiscount(input, listAmount, itemDiscountAmount);
    const allocationMethod = orderDiscountAmount > 0 ? input.allocationMethod ?? 'price_ratio' : 'none';
    const discountSource = this.resolveOrderDiscountSource(input, orderDiscountAmount);
    const allocatedItems = this.allocateOrderDiscount(items, orderDiscountAmount, allocationMethod, discountSource);
    const totalDiscountAmount = this.round(allocatedItems.reduce((sum, item) => sum + item.totalDiscountAmount, 0));
    const netAmount = this.round(allocatedItems.reduce((sum, item) => sum + item.netAmount, 0));

    return {
      order: {
        listAmount,
        itemDiscountAmount,
        orderDiscountAmount,
        totalDiscountAmount,
        netAmount,
        discountSource,
        allocationMethod,
        promotionId: input.promotionId,
        couponId: input.couponId,
        packageId: input.packageId,
        discountPayload: {
          discountMode: input.discountMode ?? 'none',
          discountAmount: this.toNumber(input.discountAmount),
          discountRate: this.toNumber(input.discountRate),
          packagePrice: this.toNumber(input.packagePrice),
          authorizedBy: input.authorizedBy,
          reason: input.reason,
        },
      },
      items: allocatedItems,
    };
  }

  private normalizeItems(rawItems: DiscountInputItem[]): AllocatedOrderItem[] {
    return rawItems.map((item) => {
      const quantity = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
      const unitPrice = this.toNumber(item.unitPrice ?? item.price ?? item.amount);
      const calculatedListAmount = this.round(quantity * unitPrice);
      const explicitListAmount = this.toNumber(item.listAmount);
      const legacyDiscount = Math.max(0, this.toNumber(item.discount));
      const isGift = Boolean(item.isGift);
      const listAmount = this.round(explicitListAmount > 0 ? explicitListAmount : calculatedListAmount);
      const itemDiscountAmount = isGift ? listAmount : Math.max(0, this.toNumber(item.itemDiscountAmount ?? legacyDiscount));
      if (itemDiscountAmount > listAmount) throw new BadRequestException('明细优惠不能大于明细原价');

      const itemType = String(item.itemType ?? item.type ?? 'product');
      const itemId = item.itemId ?? item.productId ?? item.projectId ?? item.cardId;
      const name = String(item.name ?? item.productName ?? item.projectName ?? item.cardName ?? `${itemType}#${itemId ?? ''}`);
      const netAmount = this.round(Math.max(0, listAmount - itemDiscountAmount));
      const source = isGift ? 'gift' : item.discountSource ?? (itemDiscountAmount > 0 ? 'item' : 'none');
      const allocationMethod = item.allocationMethod ?? (itemDiscountAmount > 0 ? 'direct' : 'none');

      return {
        itemType,
        itemId: itemId === undefined || itemId === null ? undefined : Number(itemId),
        name,
        quantity,
        unitPrice,
        listAmount,
        itemDiscountAmount,
        orderAllocatedDiscountAmount: 0,
        totalDiscountAmount: itemDiscountAmount,
        netAmount,
        subtotal: netAmount,
        discount: itemDiscountAmount,
        discountSource: source,
        allocationMethod,
        discountPayload: item.discountPayload,
        isGift,
        eligibleForOrderDiscount: item.eligibleForOrderDiscount ?? !isGift,
        beauticianId: this.toNumber(item.beauticianId) || undefined,
        beauticianName: item.beauticianName,
        payload: item.payload ?? item,
      };
    });
  }

  private resolveOrderDiscount(input: DiscountAllocationInput, listAmount: number, itemDiscountAmount: number) {
    const mode = input.discountMode ?? (this.toNumber(input.discountAmount) > 0 ? 'amount' : 'none');
    const discountableAmount = Math.max(0, listAmount - itemDiscountAmount);
    let discount = 0;
    if (mode === 'amount' || mode === 'manual') discount = this.toNumber(input.discountAmount);
    if (mode === 'rate') {
      const rate = this.toNumber(input.discountRate);
      discount = discountableAmount * (rate > 1 ? Math.max(0, 100 - rate) / 100 : Math.max(0, 1 - rate));
    }
    if (mode === 'package_price') {
      const packagePrice = this.toNumber(input.packagePrice);
      discount = Math.max(0, discountableAmount - packagePrice);
    }
    discount = this.round(Math.max(0, discount));
    if (discount > discountableAmount) throw new BadRequestException('订单优惠不能大于可优惠金额');
    return discount;
  }

  private resolveOrderDiscountSource(input: DiscountAllocationInput, orderDiscountAmount: number) {
    if (orderDiscountAmount <= 0) return 'none';
    if (input.discountSource) return input.discountSource;
    if (input.discountMode === 'package_price') return 'package';
    return 'order';
  }

  private allocateOrderDiscount(
    items: AllocatedOrderItem[],
    orderDiscountAmount: number,
    allocationMethod: AllocationMethod,
    discountSource: string,
  ) {
    if (orderDiscountAmount <= 0) return items;
    if (allocationMethod === 'manual') return this.applyManualAllocation(items, orderDiscountAmount, discountSource);
    return this.applyPriceRatioAllocation(items, orderDiscountAmount, discountSource);
  }

  private applyManualAllocation(items: AllocatedOrderItem[], orderDiscountAmount: number, discountSource: string) {
    const allocated = items.map((item) => {
      const manualAmount = this.round(Math.max(0, this.toNumber((item.payload as any)?.orderAllocatedDiscountAmount)));
      return this.withOrderDiscount(item, manualAmount, 'manual', discountSource);
    });
    const total = this.round(allocated.reduce((sum, item) => sum + item.orderAllocatedDiscountAmount, 0));
    if (total !== this.round(orderDiscountAmount)) throw new BadRequestException('手工分摊金额必须等于订单优惠金额');
    return allocated;
  }

  private applyPriceRatioAllocation(items: AllocatedOrderItem[], orderDiscountAmount: number, discountSource: string) {
    const eligibleItems = items.filter((item) => item.eligibleForOrderDiscount && item.netAmount > 0);
    const baseAmount = this.round(eligibleItems.reduce((sum, item) => sum + item.netAmount, 0));
    if (baseAmount <= 0) {
      if (orderDiscountAmount > 0) throw new BadRequestException('没有可参与订单优惠分摊的明细');
      return items;
    }

    let allocatedTotal = 0;
    const allocated = items.map((item) => {
      if (!eligibleItems.includes(item)) return item;
      const amount = this.round((orderDiscountAmount * item.netAmount) / baseAmount);
      allocatedTotal = this.round(allocatedTotal + amount);
      return this.withOrderDiscount(item, amount, 'price_ratio', discountSource);
    });

    const diff = this.round(orderDiscountAmount - allocatedTotal);
    if (diff !== 0) {
      const target = allocated
        .filter((item) => item.eligibleForOrderDiscount && item.netAmount > 0)
        .sort((a, b) => b.listAmount - a.listAmount)[0];
      if (target) {
        target.orderAllocatedDiscountAmount = this.round(target.orderAllocatedDiscountAmount + diff);
        target.totalDiscountAmount = this.round(target.itemDiscountAmount + target.orderAllocatedDiscountAmount);
        target.netAmount = this.round(Math.max(0, target.listAmount - target.totalDiscountAmount));
        target.subtotal = target.netAmount;
        target.discount = target.totalDiscountAmount;
      }
    }

    return allocated;
  }

  private withOrderDiscount(item: AllocatedOrderItem, amount: number, allocationMethod: AllocationMethod, discountSource: string) {
    if (amount > item.netAmount) throw new BadRequestException('明细分摊优惠不能大于明细实收');
    const totalDiscountAmount = this.round(item.itemDiscountAmount + amount);
    const netAmount = this.round(Math.max(0, item.listAmount - totalDiscountAmount));
    return {
      ...item,
      orderAllocatedDiscountAmount: amount,
      totalDiscountAmount,
      netAmount,
      subtotal: netAmount,
      discount: totalDiscountAmount,
      discountSource: item.discountSource === 'none' ? discountSource : item.discountSource,
      allocationMethod,
      discountPayload: {
        ...(item.discountPayload ?? {}),
        orderDiscountSource: discountSource,
      },
    };
  }
}
