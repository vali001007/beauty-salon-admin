import type {
  MemberCardAccount,
  MemberCardDeductPayload,
  MemberCardGiftPayload,
  MemberCardOpenPayload,
  MemberCardRechargePayload,
  MemberCardTransaction,
  ProductOrder,
  ProductOrderCreatePayload,
} from '@/types';
import { realGetProductOrders, realGetProductOrderById, realCreateProductOrder, realUpdateProductOrder, realDeleteProductOrder, realRefundProductOrder } from './real/order';
import {
  realDeductMemberCard,
  realGetMemberCardsPaginated,
  realGetMemberCardTransactions,
  realGiftMemberCard,
  realOpenMemberCard,
  realRechargeMemberCard,
} from './real/memberCard';

export const getProductOrders: (params?: { status?: string; keyword?: string; storeId?: number }) => Promise<ProductOrder[]> =
  realGetProductOrders;

export const getProductOrderById: (id: number) => Promise<ProductOrder | undefined> =
  realGetProductOrderById;

export const createProductOrder: (data: ProductOrderCreatePayload) => Promise<ProductOrder> =
  realCreateProductOrder;

export const updateProductOrder: (id: number, data: Partial<ProductOrder>) => Promise<ProductOrder> =
  realUpdateProductOrder;

export const deleteProductOrder: (id: number) => Promise<void> =
  realDeleteProductOrder;

export const refundProductOrder: (id: number) => Promise<ProductOrder> =
  realRefundProductOrder;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetProductOrdersPaginated } from './real/order';

export const getProductOrdersPaginated: (params: PaginationParams & { status?: string; keyword?: string; storeId?: number }) => Promise<PaginatedResponse<ProductOrder>> =
  realGetProductOrdersPaginated;

export const getMemberCardsPaginated: (
  params: PaginationParams & { keyword?: string; storeId?: number },
) => Promise<PaginatedResponse<MemberCardAccount>> = realGetMemberCardsPaginated;

export const openMemberCard: (data: MemberCardOpenPayload) => Promise<MemberCardAccount> =
  realOpenMemberCard;

export const rechargeMemberCard: (id: number, data: MemberCardRechargePayload) => Promise<MemberCardAccount> =
  realRechargeMemberCard;

export const giftMemberCard: (id: number, data: MemberCardGiftPayload) => Promise<MemberCardAccount> =
  realGiftMemberCard;

export const deductMemberCard: (id: number, data: MemberCardDeductPayload) => Promise<MemberCardAccount> =
  realDeductMemberCard;

export const getMemberCardTransactions: (accountId: number) => Promise<MemberCardTransaction[]> =
  realGetMemberCardTransactions;
