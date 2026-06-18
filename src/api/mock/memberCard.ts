import type {
  MemberCardAccount,
  MemberCardDeductPayload,
  MemberCardGiftPayload,
  MemberCardOpenPayload,
  MemberCardRechargePayload,
  MemberCardTransaction,
} from '@/types';
import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';

const MOCK_MEMBER_CARDS: MemberCardAccount[] = [
  {
    id: 10007,
    accountNo: '10007',
    customerId: 1007,
    userName: '阿明',
    customerPhone: '13800001007',
    storeId: 1,
    storeName: 'Ami 总店',
    totalRecharge: 180,
    totalConsumed: 0,
    availableBalance: 160,
    giftBalance: 20,
    createdAt: '2026-05-19',
  },
  {
    id: 10006,
    accountNo: '10006',
    customerId: 1006,
    userName: '李四',
    customerPhone: '13800001006',
    storeId: 1,
    storeName: 'Ami 总店',
    totalRecharge: 10000,
    totalConsumed: 5000,
    availableBalance: 6000,
    giftBalance: 0,
    remark: '李四充值10000，赠送权益已确认',
    createdAt: '2026-03-30',
  },
  {
    id: 10005,
    accountNo: '10005',
    customerId: 1005,
    userName: '李鹏祖',
    customerPhone: '13800001005',
    storeId: 2,
    storeName: 'Ami 东区店',
    totalRecharge: 1000,
    totalConsumed: 0,
    availableBalance: 1000,
    giftBalance: 200,
    createdAt: '2026-03-26',
  },
  {
    id: 10004,
    accountNo: '10004',
    customerId: 1004,
    userName: '范蓉蓉',
    customerPhone: '13800001004',
    storeId: 2,
    storeName: 'Ami 东区店',
    totalRecharge: 450,
    totalConsumed: 0,
    availableBalance: 450,
    giftBalance: 0,
    remark: '美甲美睫',
    createdAt: '2026-03-26',
  },
  {
    id: 10003,
    accountNo: '10003',
    customerId: 1003,
    userName: '洪琦',
    customerPhone: '13800001003',
    storeId: 1,
    storeName: 'Ami 总店',
    totalRecharge: 575,
    totalConsumed: 0,
    availableBalance: 575,
    giftBalance: 0,
    remark: '指甲充值',
    createdAt: '2026-03-26',
  },
  {
    id: 10002,
    accountNo: '10002',
    customerId: 1002,
    userName: '沈燕',
    customerPhone: '13800001002',
    storeId: 3,
    storeName: 'Ami 西区店',
    totalRecharge: 10000,
    totalConsumed: 0,
    availableBalance: 10000,
    giftBalance: 0,
    createdAt: '2026-03-25',
  },
  {
    id: 10001,
    accountNo: '10001',
    customerId: 1001,
    userName: '张三',
    customerPhone: '13800001001',
    storeId: 1,
    storeName: 'Ami 总店',
    totalRecharge: 1200,
    totalConsumed: 200,
    availableBalance: 1000,
    giftBalance: 0,
    createdAt: '2026-03-25',
  },
];

const MOCK_MEMBER_CARD_TRANSACTIONS: MemberCardTransaction[] = MOCK_MEMBER_CARDS.flatMap((account) => [
  {
    id: account.id * 10 + 1,
    accountId: account.id,
    transactionNo: `MC${account.accountNo}01`,
    type: 'open',
    typeLabel: '开卡',
    amount: Math.max(0, account.totalRecharge - account.giftBalance),
    giftAmount: account.giftBalance,
    cashBalanceBefore: 0,
    cashBalanceAfter: account.availableBalance + account.totalConsumed,
    giftBalanceBefore: 0,
    giftBalanceAfter: account.giftBalance,
    paymentMethod: 'cash',
    remark: account.remark,
    createdAt: account.createdAt,
  },
  ...(account.totalConsumed > 0
    ? [
        {
          id: account.id * 10 + 2,
          accountId: account.id,
          transactionNo: `MC${account.accountNo}02`,
          type: 'deduct' as const,
          typeLabel: '划扣',
          amount: account.totalConsumed,
          giftAmount: 0,
          cashBalanceBefore: account.availableBalance + account.totalConsumed,
          cashBalanceAfter: account.availableBalance,
          giftBalanceBefore: account.giftBalance,
          giftBalanceAfter: account.giftBalance,
          paymentMethod: 'member_balance',
          remark: '服务消费划扣',
          createdAt: account.createdAt,
        },
      ]
    : []),
]);

function matchMemberCard(account: MemberCardAccount, params: { keyword?: string; storeId?: number }) {
  const keyword = params.keyword?.trim();
  if (params.storeId && account.storeId !== params.storeId) return false;
  if (!keyword) return true;
  return (
    account.accountNo.includes(keyword) ||
    account.userName.includes(keyword) ||
    (account.customerPhone ?? '').includes(keyword) ||
    (account.remark ?? '').includes(keyword)
  );
}

function sortMemberCards(accounts: MemberCardAccount[]) {
  return [...accounts].sort((a, b) => Number(b.accountNo) - Number(a.accountNo));
}

function nextMemberCardId() {
  return Math.max(...MOCK_MEMBER_CARDS.map((account) => account.id), 10000) + 1;
}

function getMemberCardOrThrow(id: number) {
  const account = MOCK_MEMBER_CARDS.find((item) => item.id === id);
  if (!account) throw new Error('会员卡不存在');
  return account;
}

function createMemberCardTransaction(
  account: MemberCardAccount,
  type: MemberCardTransaction['type'],
  amount: number,
  giftAmount: number,
  paymentMethod: string | undefined,
  remark: string | undefined,
  beforeCash: number,
  beforeGift: number,
): MemberCardTransaction {
  const labels: Record<MemberCardTransaction['type'], string> = {
    open: '开卡',
    recharge: '充值',
    gift: '赠送',
    deduct: '划扣',
  };
  const transaction: MemberCardTransaction = {
    id: Date.now(),
    accountId: account.id,
    transactionNo: `MC${Date.now().toString(36).toUpperCase()}`,
    type,
    typeLabel: labels[type],
    amount,
    giftAmount,
    cashBalanceBefore: beforeCash,
    cashBalanceAfter: account.availableBalance,
    giftBalanceBefore: beforeGift,
    giftBalanceAfter: account.giftBalance,
    paymentMethod,
    remark,
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
  MOCK_MEMBER_CARD_TRANSACTIONS.unshift(transaction);
  return transaction;
}

export async function mockGetMemberCardsPaginated(
  params: PaginationParams & { keyword?: string; storeId?: number },
): Promise<PaginatedResponse<MemberCardAccount>> {
  const result = sortMemberCards(MOCK_MEMBER_CARDS.filter((account) => matchMemberCard(account, params)));
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockOpenMemberCard(data: MemberCardOpenPayload): Promise<MemberCardAccount> {
  const rechargeAmount = Math.max(0, Number(data.rechargeAmount || 0));
  const giftAmount = Math.max(0, Number(data.giftAmount || 0));
  if (rechargeAmount <= 0) throw new Error('充值金额必须大于 0');

  let account = MOCK_MEMBER_CARDS.find(
    (item) => item.customerId === data.customerId && item.storeId === data.storeId,
  );

  if (!account) {
    const id = nextMemberCardId();
    account = {
      id,
      accountNo: String(id),
      customerId: data.customerId,
      userName: data.customerName || `客户${data.customerId}`,
      customerPhone: data.customerPhone,
      storeId: data.storeId,
      storeName: data.storeName || `门店${data.storeId}`,
      totalRecharge: 0,
      totalConsumed: 0,
      availableBalance: 0,
      giftBalance: 0,
      remark: data.remark,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    MOCK_MEMBER_CARDS.unshift(account);
  }

  const beforeCash = account.availableBalance;
  const beforeGift = account.giftBalance;
  account.totalRecharge += rechargeAmount + giftAmount;
  account.availableBalance += rechargeAmount;
  account.giftBalance += giftAmount;
  account.remark = data.remark || account.remark;
  account.updatedAt = new Date().toISOString();
  createMemberCardTransaction(account, 'open', rechargeAmount, giftAmount, data.paymentMethod, data.remark, beforeCash, beforeGift);
  return account;
}

export async function mockRechargeMemberCard(id: number, data: MemberCardRechargePayload): Promise<MemberCardAccount> {
  const account = getMemberCardOrThrow(id);
  const rechargeAmount = Math.max(0, Number(data.rechargeAmount || 0));
  const giftAmount = Math.max(0, Number(data.giftAmount || 0));
  if (rechargeAmount <= 0) throw new Error('充值金额必须大于 0');

  const beforeCash = account.availableBalance;
  const beforeGift = account.giftBalance;
  account.totalRecharge += rechargeAmount + giftAmount;
  account.availableBalance += rechargeAmount;
  account.giftBalance += giftAmount;
  account.remark = data.remark || account.remark;
  account.updatedAt = new Date().toISOString();
  createMemberCardTransaction(account, 'recharge', rechargeAmount, giftAmount, data.paymentMethod, data.remark, beforeCash, beforeGift);
  return account;
}

export async function mockGiftMemberCard(id: number, data: MemberCardGiftPayload): Promise<MemberCardAccount> {
  const account = getMemberCardOrThrow(id);
  const giftAmount = Math.max(0, Number(data.giftAmount || 0));
  if (giftAmount <= 0) throw new Error('赠送金额必须大于 0');

  const beforeCash = account.availableBalance;
  const beforeGift = account.giftBalance;
  account.totalRecharge += giftAmount;
  account.giftBalance += giftAmount;
  account.remark = data.remark || account.remark;
  account.updatedAt = new Date().toISOString();
  createMemberCardTransaction(account, 'gift', 0, giftAmount, undefined, data.remark, beforeCash, beforeGift);
  return account;
}

export async function mockDeductMemberCard(id: number, data: MemberCardDeductPayload): Promise<MemberCardAccount> {
  const account = getMemberCardOrThrow(id);
  const deductAmount = Math.max(0, Number(data.amount || 0));
  if (deductAmount <= 0) throw new Error('划扣金额必须大于 0');
  if (deductAmount > account.availableBalance + account.giftBalance) throw new Error('会员卡余额不足');

  const beforeCash = account.availableBalance;
  const beforeGift = account.giftBalance;
  const giftDeduct = Math.min(account.giftBalance, deductAmount);
  const cashDeduct = deductAmount - giftDeduct;
  account.giftBalance -= giftDeduct;
  account.availableBalance -= cashDeduct;
  account.totalConsumed += deductAmount;
  account.remark = data.remark || account.remark;
  account.updatedAt = new Date().toISOString();
  createMemberCardTransaction(account, 'deduct', cashDeduct, giftDeduct, 'member_balance', data.remark, beforeCash, beforeGift);
  return account;
}

export async function mockGetMemberCardTransactions(accountId: number): Promise<MemberCardTransaction[]> {
  return MOCK_MEMBER_CARD_TRANSACTIONS.filter((transaction) => transaction.accountId === accountId);
}
