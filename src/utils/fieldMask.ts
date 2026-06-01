import type { FieldScopes, FieldScopeValue } from '@/types';

export function maskPhone(value?: string): string {
  if (!value) return '';
  return value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

export function maskWechat(value?: string): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

export function formatScopedValue(value: unknown, scope: FieldScopeValue, maskType: 'phone' | 'wechat' | 'text' = 'text'): string {
  if (scope === 'hidden') {
    return '-';
  }
  if (scope === 'visible') {
    return value === undefined || value === null || value === '' ? '-' : String(value);
  }
  if (maskType === 'phone') {
    return maskPhone(String(value ?? ''));
  }
  if (maskType === 'wechat') {
    return maskWechat(String(value ?? ''));
  }
  const text = String(value ?? '');
  return text ? '***' : '-';
}

export function maskCustomerFields<T extends Record<string, any>>(customer: T, fieldScopes?: Partial<FieldScopes>): T {
  if (!fieldScopes) {
    return customer;
  }

  return {
    ...customer,
    phone: formatScopedValue(customer.phone, fieldScopes.customerPhone ?? 'visible', 'phone'),
    wechat: formatScopedValue(customer.wechat, fieldScopes.customerWechat ?? 'visible', 'wechat'),
    totalSpent:
      fieldScopes.customerProfit === 'hidden' || fieldScopes.customerBalance === 'hidden'
        ? undefined
        : customer.totalSpent,
    remark:
      fieldScopes.customerRemark === 'hidden' || fieldScopes.customerPrivateNote === 'hidden'
        ? ''
        : customer.remark,
  };
}
