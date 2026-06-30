import type {
  MemberCardAccount,
  MemberCardDeductPayload,
  MemberCardGiftPayload,
  MemberCardOpenPayload,
  MemberCardRechargePayload,
  MemberCardRefundPayload,
  MemberCardTransaction,
  ProductOrder,
  ProductOrderCreatePayload,
  ProductOrderRefundPayload,
  ProductOrderProfitDetail,
  ProjectOrderProfitDetail,
} from '@/types';
import {
  realCreateProductOrder,
  realCreateProjectOrder,
  realDeleteProductOrder,
  realGetProductOrderById,
  realGetProductOrderProfit,
  realGetProductOrders,
  realGetProjectOrderById,
  realGetProjectOrderProfit,
  realGetProjectOrders,
  realRefundProductOrder,
  realUpdateProductOrder,
} from './real/order';
import {
  realDeductMemberCard,
  realGetMemberCardDeductRecordsPaginated,
  realGetMemberCardsPaginated,
  realGetMemberCardTransactions,
  realGiftMemberCard,
  realOpenMemberCard,
  realRechargeMemberCard,
  realRefundMemberCard,
} from './real/memberCard';

export const getProductOrders: (params?: { status?: string; keyword?: string; storeId?: number }) => Promise<ProductOrder[]> =
  realGetProductOrders;

export const getProductOrderById: (id: number) => Promise<ProductOrder | undefined> =
  realGetProductOrderById;

export const getProductOrderProfit: (id: number) => Promise<ProductOrderProfitDetail> =
  realGetProductOrderProfit;

export const createProductOrder: (data: ProductOrderCreatePayload) => Promise<ProductOrder> =
  realCreateProductOrder;

export const updateProductOrder: (id: number, data: Partial<ProductOrder>) => Promise<ProductOrder> =
  realUpdateProductOrder;

export const deleteProductOrder: (id: number) => Promise<void> =
  realDeleteProductOrder;

export const refundProductOrder: (id: number, data?: ProductOrderRefundPayload) => Promise<ProductOrder> =
  realRefundProductOrder;

export const getProjectOrders: (params?: { status?: string; keyword?: string; storeId?: number }) => Promise<ProductOrder[]> =
  realGetProjectOrders;

export const getProjectOrderById: (id: number) => Promise<ProductOrder | undefined> =
  realGetProjectOrderById;

export const getProjectOrderProfit: (id: number) => Promise<ProjectOrderProfitDetail> =
  realGetProjectOrderProfit;

export const createProjectOrder: (data: ProductOrderCreatePayload) => Promise<ProductOrder> =
  realCreateProjectOrder;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetProductOrdersPaginated, realGetProjectOrdersPaginated } from './real/order';

export const getProductOrdersPaginated: (params: PaginationParams & { status?: string; keyword?: string; storeId?: number }) => Promise<PaginatedResponse<ProductOrder>> =
  realGetProductOrdersPaginated;

export const getProjectOrdersPaginated: (params: PaginationParams & { status?: string; keyword?: string; storeId?: number }) => Promise<PaginatedResponse<ProductOrder>> =
  realGetProjectOrdersPaginated;

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

export const refundMemberCard: (id: number, data: MemberCardRefundPayload) => Promise<MemberCardAccount> =
  realRefundMemberCard;

export const getMemberCardTransactions: (accountId: number) => Promise<MemberCardTransaction[]> =
  realGetMemberCardTransactions;

export const getMemberCardDeductRecordsPaginated: (
  params: PaginationParams & { keyword?: string; storeId?: number },
) => Promise<PaginatedResponse<MemberCardTransaction>> = realGetMemberCardDeductRecordsPaginated;
