import type {
  MemberCardAccount,
  MemberCardDeductPayload,
  MemberCardGiftPayload,
  MemberCardOpenPayload,
  MemberCardRechargePayload,
  MemberCardRefundPayload,
  MemberCardTransaction,
} from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiMemberCardAccount = Partial<MemberCardAccount> & {
  customer?: { id?: number; name?: string; phone?: string };
  store?: { id?: number; name?: string };
};

type ApiMemberCardTransaction = Partial<MemberCardTransaction>;

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value);
}

function normalizeDate(value?: string): string {
  return value ? value.replace('T', ' ').slice(0, 10) : '';
}

function normalizeDateTime(value?: string): string {
  return value ? value.replace('T', ' ').slice(0, 19) : '';
}

function normalizeMemberCardAccount(item: ApiMemberCardAccount): MemberCardAccount {
  const id = Number(item.id ?? 0);
  return {
    id,
    accountNo: item.accountNo ?? String(id),
    customerId: Number(item.customerId ?? item.customer?.id ?? 0),
    userName: item.userName ?? item.customer?.name ?? '',
    customerPhone: item.customerPhone ?? item.customer?.phone,
    storeId: Number(item.storeId ?? item.store?.id ?? 0),
    storeName: item.storeName ?? item.store?.name ?? '',
    totalRecharge: toNumber(item.totalRecharge),
    totalConsumed: toNumber(item.totalConsumed),
    availableBalance: toNumber(item.availableBalance),
    giftBalance: toNumber(item.giftBalance),
    handlerId: item.handlerId === undefined ? undefined : Number(item.handlerId),
    handlerName: item.handlerName,
    remark: item.remark,
    lastTransactionNo: item.lastTransactionNo,
    lastOrderNo: item.lastOrderNo,
    lastTransactionType: item.lastTransactionType,
    lastTransactionAmount:
      item.lastTransactionAmount === undefined ? undefined : toNumber(item.lastTransactionAmount),
    lastTransactionAt: normalizeDateTime(item.lastTransactionAt),
    createdAt: normalizeDate(item.createdAt),
    updatedAt: normalizeDateTime(item.updatedAt),
  };
}

function normalizeMemberCardTransaction(item: ApiMemberCardTransaction): MemberCardTransaction {
  const type = (item.type ?? 'recharge') as MemberCardTransaction['type'];
  const labels: Record<MemberCardTransaction['type'], string> = {
    open: '开卡',
    recharge: '充值',
    gift: '赠送',
    deduct: '划扣',
    refund: '退款',
  };
  return {
    id: Number(item.id ?? 0),
    accountId: Number(item.accountId ?? 0),
    accountNo: item.accountNo,
    customerId: item.customerId === undefined ? undefined : Number(item.customerId),
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    storeId: item.storeId === undefined ? undefined : Number(item.storeId),
    storeName: item.storeName,
    orderId: item.orderId === undefined ? undefined : Number(item.orderId),
    orderNo: item.orderNo,
    transactionNo: item.transactionNo ?? '',
    type,
    typeLabel: item.typeLabel ?? labels[type] ?? '流水',
    amount: toNumber(item.amount),
    giftAmount: toNumber(item.giftAmount),
    cashBalanceBefore: toNumber(item.cashBalanceBefore),
    cashBalanceAfter: toNumber(item.cashBalanceAfter),
    giftBalanceBefore: toNumber(item.giftBalanceBefore),
    giftBalanceAfter: toNumber(item.giftBalanceAfter),
    paymentMethod: item.paymentMethod,
    operatorId: item.operatorId === undefined ? undefined : Number(item.operatorId),
    operatorName: item.operatorName,
    remark: item.remark,
    createdAt: normalizeDateTime(item.createdAt),
  };
}

export async function realGetMemberCardsPaginated(
  params: PaginationParams & { keyword?: string; storeId?: number },
): Promise<PaginatedResponse<MemberCardAccount>> {
  const response = await apiClient.get<unknown, unknown>('/orders/member-cards/paginated', { params });
  return normalizePaginatedResponse<ApiMemberCardAccount, MemberCardAccount>(response, normalizeMemberCardAccount);
}

export async function realOpenMemberCard(data: MemberCardOpenPayload): Promise<MemberCardAccount> {
  const item = await apiClient.post<unknown, ApiMemberCardAccount>('/orders/member-cards/open', data);
  return normalizeMemberCardAccount(item);
}

export async function realRechargeMemberCard(id: number, data: MemberCardRechargePayload): Promise<MemberCardAccount> {
  const item = await apiClient.post<unknown, ApiMemberCardAccount>(`/orders/member-cards/${id}/recharge`, data);
  return normalizeMemberCardAccount(item);
}

export async function realGiftMemberCard(id: number, data: MemberCardGiftPayload): Promise<MemberCardAccount> {
  const item = await apiClient.post<unknown, ApiMemberCardAccount>(`/orders/member-cards/${id}/gift`, data);
  return normalizeMemberCardAccount(item);
}

export async function realDeductMemberCard(id: number, data: MemberCardDeductPayload): Promise<MemberCardAccount> {
  const item = await apiClient.post<unknown, ApiMemberCardAccount>(`/orders/member-cards/${id}/deduct`, data);
  return normalizeMemberCardAccount(item);
}

export async function realRefundMemberCard(id: number, data: MemberCardRefundPayload): Promise<MemberCardAccount> {
  const item = await apiClient.post<unknown, ApiMemberCardAccount>(`/orders/member-cards/${id}/refund`, data);
  return normalizeMemberCardAccount(item);
}

export async function realGetMemberCardTransactions(accountId: number): Promise<MemberCardTransaction[]> {
  const response = await apiClient.get<unknown, unknown>(`/orders/member-cards/${accountId}/transactions`);
  return extractArray<ApiMemberCardTransaction>(response).map(normalizeMemberCardTransaction);
}

export async function realGetMemberCardDeductRecordsPaginated(
  params: PaginationParams & { keyword?: string; storeId?: number },
): Promise<PaginatedResponse<MemberCardTransaction>> {
  const response = await apiClient.get<unknown, unknown>('/orders/member-cards/deduct-records/paginated', { params });
  return normalizePaginatedResponse<ApiMemberCardTransaction, MemberCardTransaction>(
    response,
    normalizeMemberCardTransaction,
  );
}
