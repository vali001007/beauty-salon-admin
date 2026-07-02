export type MemberBalanceDeductCustomer = {
  cashBalance?: number;
  giftBalance?: number;
  totalBalance?: number;
  memberCardDeductEnabled?: boolean;
  memberCardDeductBalance?: number;
  memberCardDeductLabel?: string;
};

export function toPositiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

export function getMemberBalanceDeductBalance(customer?: MemberBalanceDeductCustomer | null) {
  if (!customer) return 0;
  return (
    toPositiveNumber(customer.memberCardDeductBalance) ||
    toPositiveNumber(customer.totalBalance) ||
    toPositiveNumber(customer.cashBalance) + toPositiveNumber(customer.giftBalance)
  );
}

export function canUseMemberBalanceDeduct(customer: MemberBalanceDeductCustomer | null | undefined, receivable: number) {
  if (!customer) return false;
  const balance = getMemberBalanceDeductBalance(customer);
  if (receivable <= 0) return Boolean(customer.memberCardDeductEnabled || balance > 0);
  return balance >= receivable;
}

export type MemberBalanceDeductStatus = 'full' | 'partial' | 'empty';

export function getMemberBalanceDeductStatus(customer: MemberBalanceDeductCustomer | null | undefined, receivable = 0): MemberBalanceDeductStatus {
  const balance = getMemberBalanceDeductBalance(customer);
  if (balance <= 0) return 'empty';
  if (receivable > 0 && balance < receivable) return 'partial';
  return 'full';
}

export function canSelectMemberBalanceDeduct(customer: MemberBalanceDeductCustomer | null | undefined) {
  return getMemberBalanceDeductBalance(customer) > 0;
}

export function getMemberBalanceDeductLabel(customer: MemberBalanceDeductCustomer | null | undefined, receivable = 0) {
  const balance = getMemberBalanceDeductBalance(customer);
  if (balance > 0 && balance < receivable) return `余额不足 ￥${balance.toLocaleString()}`;
  if (balance > 0) return `储值余额 ￥${balance.toLocaleString()}`;
  return customer?.memberCardDeductLabel ?? "无储值";
}
