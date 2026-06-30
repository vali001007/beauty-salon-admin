import React from 'react';
import { CheckCircle2, Loader2, Search, X } from 'lucide-react';
import { getProductsPaginated } from '@/api/product';
import type { Product } from '@/types';
import { Input } from './UI';
import { cn } from './ui/utils';

type ProductCatalogPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (product: Product | null) => void;
  selectedProductId?: number | string;
  storeName?: string;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  pageSize?: number;
  className?: string;
};

function formatCurrency(value?: number | null) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getProductPrice(product: Product) {
  return Number(product.salePrice ?? product.retailPrice ?? 0);
}

function getProductMeta(product: Product) {
  return [product.sku, product.categoryName, product.storeName].filter(Boolean).join(' · ');
}

function shouldSearchProductKeyword(keyword: string) {
  const normalized = keyword.trim();
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return normalized.length >= 2;
  if (/[\u4e00-\u9fa5]/.test(normalized)) return normalized.length >= 1;
  return normalized.length >= 2;
}

export function ProductCatalogPicker({
  value,
  onValueChange,
  onSelect,
  selectedProductId,
  storeName,
  disabled,
  placeholder = '手工录入 / 选择商品',
  emptyText = '未找到有售价的商品，可继续手工录入临时商品。',
  pageSize = 30,
  className,
}: ProductCatalogPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const requestSeq = React.useRef(0);

  React.useEffect(() => {
    if (!open || disabled) return;
    const keyword = value.trim();
    if (!shouldSearchProductKeyword(keyword)) {
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
        getProductsPaginated({
          page: 1,
          pageSize,
          keyword: keyword || undefined,
          status: 'active',
          sellableOnly: true,
        })
          .then((response) => {
            if (requestSeq.current !== seq) return;
            const products = Array.isArray(response.items) ? response.items : [];
            setItems(storeName ? products.filter((product) => !product.storeName || product.storeName === storeName) : products);
          })
          .catch((err) => {
            if (requestSeq.current !== seq) return;
            setItems([]);
            setError(err instanceof Error ? err.message : '商品数据加载失败');
          })
          .finally(() => {
            if (requestSeq.current === seq) setLoading(false);
          });
      },
      keyword ? 220 : 0,
    );

    return () => window.clearTimeout(timer);
  }, [disabled, open, pageSize, storeName, value]);

  const handleSelect = (product: Product) => {
    onValueChange(product.name);
    onSelect(product);
    setOpen(false);
    setError('');
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-9"
        />
        {selectedProductId ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onValueChange('');
              onSelect(null);
              setOpen(true);
            }}
            aria-label="清除已选商品"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载商品...
            </div>
          ) : null}

          {!loading && error ? <div className="px-3 py-3 text-sm text-rose-600">{error}</div> : null}

          {!loading && !error && items.length > 0 ? (
            <div className="py-1">
              {items.map((product) => {
                const selected = String(selectedProductId ?? '') === String(product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50',
                      selected && 'bg-blue-50',
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(product)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-800">
                        {product.name} · {formatCurrency(getProductPrice(product))}
                      </span>
                      <span className="block truncate text-xs text-gray-500">{getProductMeta(product) || '商品档案'}</span>
                    </span>
                    {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500">{emptyText}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
