import React from 'react';
import { CheckCircle2, Loader2, Search, X } from 'lucide-react';
import { getCustomersPaginated } from '@/api/customer';
import type { Customer } from '@/types';
import { Input } from './UI';
import { cn } from './ui/utils';

type CustomerPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (customer: Customer | null) => void;
  selectedCustomerId?: number | string;
  storeName?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  placeholder?: string;
  emptyText?: string;
  loadingText?: string;
  allowManualInput?: boolean;
  pageSize?: number;
  className?: string;
};

function getCustomerMeta(customer: Customer) {
  return [customer.phone || '未留手机号', customer.memberLevel, customer.storeName].filter(Boolean).join(' · ');
}

function shouldSearchCustomerKeyword(keyword: string) {
  const normalized = keyword.trim();
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return normalized.length >= 3;
  if (/[\u4e00-\u9fa5]/.test(normalized)) return normalized.length >= 1;
  return normalized.length >= 2;
}

export function CustomerPicker({
  value,
  onValueChange,
  onSelect,
  selectedCustomerId,
  storeName,
  disabled,
  label = '客户',
  required,
  placeholder = '输入客户姓名或手机号搜索',
  emptyText,
  loadingText = '正在加载客户...',
  allowManualInput = false,
  pageSize = 20,
  className,
}: CustomerPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const requestSeq = React.useRef(0);

  React.useEffect(() => {
    if (!open || disabled) return;
    const keyword = value.trim();
    if (!shouldSearchCustomerKeyword(keyword)) {
      setItems([]);
      setError('');
      setLoading(false);
      return;
    }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError('');
        getCustomersPaginated({
          page: 1,
          pageSize,
          keyword: keyword || undefined,
          storeName,
        })
          .then((response) => {
            if (requestSeq.current !== seq) return;
            setItems(Array.isArray(response.items) ? response.items : []);
          })
          .catch((err) => {
            if (requestSeq.current !== seq) return;
            setItems([]);
            setError(err instanceof Error ? err.message : '客户数据加载失败');
          })
          .finally(() => {
            if (requestSeq.current === seq) setLoading(false);
          });
      },
      keyword ? 220 : 0,
    );

    return () => window.clearTimeout(timer);
  }, [disabled, open, pageSize, storeName, value]);

  const handleInputChange = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(true);
  };

  const handleSelect = (customer: Customer) => {
    onValueChange(customer.name);
    onSelect(customer);
    setOpen(false);
    setError('');
  };

  const manualEmptyText = allowManualInput ? '未找到客户，可继续手工录入客户姓名。' : '未找到匹配客户。';
  const showList = open && !disabled;

  return (
    <label className={cn('relative block space-y-1.5', className)}>
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={value}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-9"
        />
        {selectedCustomerId ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelect(null);
              onValueChange('');
              setOpen(true);
            }}
            aria-label="清除已选客户"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {showList ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {loadingText}
            </div>
          ) : null}

          {!loading && error ? <div className="px-3 py-3 text-sm text-rose-600">{error}</div> : null}

          {!loading && !error && items.length > 0 ? (
            <div className="py-1">
              {items.map((customer) => {
                const selected = String(selectedCustomerId ?? '') === String(customer.id);
                return (
                  <button
                    key={customer.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50',
                      selected && 'bg-blue-50',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(customer)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-800">{customer.name}</span>
                      <span className="block truncate text-xs text-gray-500">{getCustomerMeta(customer)}</span>
                    </span>
                    {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500">{emptyText ?? manualEmptyText}</div>
          ) : null}
        </div>
      ) : null}
    </label>
  );
}
