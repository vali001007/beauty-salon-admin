import React from 'react';

export type PaymentMethodOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  requiresMemberBalance?: boolean;
};

export type MemberBalancePaymentCustomer = {
  cashBalance?: number;
  giftBalance?: number;
  totalBalance?: number;
  memberCardDeductEnabled?: boolean;
  memberCardDeductBalance?: number;
  memberCardDeductLabel?: string;
};

export const CASH_PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { value: '微信', label: '微信' },
  { value: '支付宝', label: '支付宝' },
  { value: '银行卡', label: '银行卡' },
  { value: '现金', label: '现金' },
];

export const PRODUCT_ORDER_PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  ...CASH_PAYMENT_METHOD_OPTIONS,
  { value: '会员卡划扣', label: '会员余额划扣', requiresMemberBalance: true },
];

export const CARD_ORDER_PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  ...CASH_PAYMENT_METHOD_OPTIONS,
  { value: '会员余额', label: '会员余额划扣', requiresMemberBalance: true },
];

function toPositiveNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

export function getMemberBalancePaymentAmount(customer?: MemberBalancePaymentCustomer | null) {
  if (!customer) return 0;
  return (
    toPositiveNumber(customer.memberCardDeductBalance) ||
    toPositiveNumber(customer.totalBalance) ||
    toPositiveNumber(customer.cashBalance) + toPositiveNumber(customer.giftBalance)
  );
}

export function canUseMemberBalancePayment(customer: MemberBalancePaymentCustomer | null | undefined, amount: number) {
  if (!customer) return false;
  const balance = getMemberBalancePaymentAmount(customer);
  if (amount <= 0) return Boolean(customer.memberCardDeductEnabled || balance > 0);
  return balance >= amount;
}

export function getMemberBalancePaymentHint(customer: MemberBalancePaymentCustomer | null | undefined, amount = 0) {
  const balance = getMemberBalancePaymentAmount(customer);
  if (balance > 0 && balance < amount) return `余额不足 ¥${balance.toLocaleString('zh-CN')}`;
  if (balance > 0) return `储值余额 ¥${balance.toLocaleString('zh-CN')}`;
  return customer?.memberCardDeductLabel ?? '需选择有余额的会员';
}

export function PaymentMethodSelector<TValue extends string>({
  value,
  onChange,
  methods,
  customer,
  amount = 0,
  columnsClassName = 'grid-cols-2 sm:grid-cols-4',
  buttonClassName = 'min-h-10 rounded-lg',
  activeClassName = 'border-blue-500 bg-blue-50 text-blue-600',
  inactiveClassName = 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  disabledClassName = 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400',
}: {
  value: TValue;
  onChange: (value: TValue) => void;
  methods: PaymentMethodOption<TValue>[];
  customer?: MemberBalancePaymentCustomer | null;
  amount?: number;
  columnsClassName?: string;
  buttonClassName?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  disabledClassName?: string;
}) {
  return (
    <div className={`grid gap-2 ${columnsClassName}`}>
      {methods.map((method) => {
        const disabled = Boolean(method.requiresMemberBalance && !canUseMemberBalancePayment(customer, amount));
        const hint = method.requiresMemberBalance ? getMemberBalancePaymentHint(customer, amount) : method.label;
        return (
          <button
            key={method.value}
            type="button"
            title={hint}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(method.value);
            }}
            className={`border px-3 py-2 text-sm font-medium transition ${buttonClassName} ${
              disabled ? disabledClassName : value === method.value ? activeClassName : inactiveClassName
            }`}
          >
            <span>{method.label}</span>
            {method.requiresMemberBalance ? (
              <span className="mt-0.5 block text-[11px] font-normal leading-tight opacity-75">{hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
