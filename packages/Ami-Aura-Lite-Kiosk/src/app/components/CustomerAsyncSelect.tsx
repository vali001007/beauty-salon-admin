import React from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, Search } from "lucide-react";
import type { TerminalCustomerSelectItem, TerminalCustomerSelectScene } from "@/types/terminal";
import { searchTerminalCustomers, toCustomerSelectItems } from "../services/customerSelectService";
import { cn } from "./ui/utils";

type CustomerAsyncSelectOption = Partial<TerminalCustomerSelectItem> &
  Pick<TerminalCustomerSelectItem, "id" | "name"> & {
    phone?: string;
    memberLevel?: string;
    tags?: string[];
    isAppointedToday?: boolean;
    appointmentTime?: string;
  };

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeCustomerOption(customer: CustomerAsyncSelectOption): TerminalCustomerSelectItem {
  return {
    ...customer,
    phone: customer.phone ?? "",
    gender: customer.gender ?? "女",
    memberLevel: customer.memberLevel ?? "普通客户",
    totalSpent: customer.totalSpent ?? 0,
    visitCount: customer.visitCount ?? 0,
    lastVisitDate: customer.lastVisitDate ?? "",
    tags: safeArray(customer.tags),
    source: customer.source ?? "terminal",
    storeName: customer.storeName ?? "",
    skinCondition: customer.skinCondition ?? "",
    cashBalance: customer.cashBalance ?? 0,
    giftBalance: customer.giftBalance ?? 0,
    totalBalance: customer.totalBalance ?? 0,
    activeCustomerCardsCount: customer.activeCustomerCardsCount ?? 0,
    isAppointedToday: customer.isAppointedToday ?? false,
    sceneBadges: safeArray(customer.sceneBadges),
  } as TerminalCustomerSelectItem;
}

function getCustomerMeta(customer: TerminalCustomerSelectItem) {
  return [customer.phone || customer.maskedPhone, customer.memberLevel].filter(Boolean).join(" · ");
}

function getCustomerBadges(customer: TerminalCustomerSelectItem) {
  return [...safeArray(customer.sceneBadges), ...safeArray(customer.tags)].filter(Boolean).slice(0, 5);
}

export function shouldSearchCustomerKeyword(keyword: string) {
  const normalized = keyword.trim();
  if (!normalized) return false;
  if (/^\d+$/.test(normalized)) return normalized.length >= 3;
  if (/[\u4e00-\u9fa5]/.test(normalized)) return normalized.length >= 1;
  return normalized.length >= 2;
}

export function CustomerAsyncSelect({
  scene,
  value,
  onChange,
  disabled,
  label = "客户",
  placeholder = "请选择客户",
  searchPlaceholder = "输入姓名或手机号搜索",
  defaultItems = [],
  onlyMyCustomers,
  emptyText = "未找到客户，请检查姓名或手机号。",
}: {
  scene: TerminalCustomerSelectScene;
  value?: number | string;
  onChange: (customer: TerminalCustomerSelectItem | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  defaultItems?: CustomerAsyncSelectOption[];
  onlyMyCustomers?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const normalizedDefaultItems = React.useMemo(
    () => safeArray(defaultItems).map(normalizeCustomerOption),
    [defaultItems],
  );
  const [items, setItems] = React.useState<TerminalCustomerSelectItem[]>(normalizedDefaultItems);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [selected, setSelected] = React.useState<TerminalCustomerSelectItem | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const requestSeq = React.useRef(0);
  const selectedId = value ? Number(value) : undefined;

  React.useEffect(() => {
    requestSeq.current += 1;
    setItems(normalizedDefaultItems);
    setHasLoaded(false);
    setError(null);
  }, [normalizedDefaultItems, onlyMyCustomers, scene]);

  React.useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    const matched = [...items, ...normalizedDefaultItems].find((item) => item.id === selectedId);
    if (matched) setSelected(matched);
  }, [items, normalizedDefaultItems, selectedId]);

  const loadCustomers = React.useCallback(
    async (nextKeyword: string) => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setLoading(true);
      setError(null);
      try {
        const response = await searchTerminalCustomers({
          scene,
          keyword: nextKeyword.trim(),
          limit: 50,
          onlyMyCustomers,
        });
        if (requestSeq.current !== seq) return;
        setItems(toCustomerSelectItems(response));
        setHasLoaded(true);
      } catch (err) {
        if (requestSeq.current !== seq) return;
        setItems([]);
        setHasLoaded(true);
        setError(err instanceof Error ? err.message : "客户查询失败");
      } finally {
        if (requestSeq.current === seq) setLoading(false);
      }
    },
    [onlyMyCustomers, scene],
  );

  React.useEffect(() => {
    if (!open) return;
    const normalizedKeyword = keyword.trim();
    const shouldSearch = shouldSearchCustomerKeyword(normalizedKeyword);
    const handle = window.setTimeout(() => {
      void loadCustomers(shouldSearch ? normalizedKeyword : "");
    }, shouldSearch ? 300 : 0);
    return () => window.clearTimeout(handle);
  }, [keyword, loadCustomers, open]);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((current) => {
      const next = !current;
      if (next) {
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      return next;
    });
  };

  const handleSelect = (customer: TerminalCustomerSelectItem) => {
    if (customer.disabled) return;
    setSelected(customer);
    onChange(customer);
    setOpen(false);
    setKeyword("");
  };

  const visibleItems = items.length ? items : !hasLoaded ? normalizedDefaultItems : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-[#1F1B2D]">{label}</div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 text-left text-sm transition",
          open ? "border-[#2D1B69] shadow-[0_0_0_2px_rgba(45,27,105,0.08)]" : "border-black/10",
          disabled ? "cursor-not-allowed bg-[#F7F5F2] opacity-70" : "hover:border-[#2D1B69]/60",
        )}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium text-[#1F1B2D]">
                {selected.name} {selected.phone || selected.maskedPhone}
              </span>
              <span className="truncate text-xs text-[#6F6678]">{[selected.memberLevel, selected.priorityLabel].filter(Boolean).join(" · ")}</span>
            </span>
          ) : (
            <span className="text-[#9B92A3]">{placeholder}</span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-[#6F6678]" /> : <ChevronDown className="h-4 w-4 text-[#6F6678]" />}
      </button>

      {open ? (
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg shadow-black/5">
          <div className="relative border-b border-black/8">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6F6678]" />
            <input
              ref={searchRef}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={searchPlaceholder}
              disabled={disabled}
              className="h-13 w-full bg-white pl-12 pr-12 text-sm text-[#1F1B2D] outline-none placeholder:text-[#9B92A3]"
            />
            {loading ? (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#C9956C]" />
            ) : null}
          </div>

          {error ? (
            <div className="flex items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              <span>{error}</span>
              <button type="button" onClick={() => loadCustomers(keyword)} className="inline-flex items-center gap-1 font-medium">
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </button>
            </div>
          ) : null}

          <div className="max-h-72 overflow-y-auto py-1">
            {visibleItems.length ? (
              visibleItems.map((customer) => {
                const badges = getCustomerBadges(customer);
                const isSelected = selectedId === customer.id;
                return (
                  <button
                    key={`${scene}-${customer.id}`}
                    type="button"
                    onClick={() => handleSelect(customer)}
                    disabled={disabled || customer.disabled}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition",
                      isSelected ? "bg-[#2D1B69]/6" : "bg-white hover:bg-[#F7F5F2]",
                      customer.disabled && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-base font-medium text-[#1F1B2D]">{customer.name}</span>
                        <span className="text-sm text-[#1F1B2D]">{customer.phone || customer.maskedPhone}</span>
                        {customer.priorityLabel ? (
                          <span className="rounded-full bg-[#2D1B69]/8 px-2 py-0.5 text-xs text-[#2D1B69]">
                            {customer.priorityLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-[#6F6678]">
                        {getCustomerMeta(customer) ? <span>{getCustomerMeta(customer)}</span> : null}
                        {badges.map((badge) => (
                          <span key={`${customer.id}-${badge}`} className="rounded-full bg-[#F7F5F2] px-2 py-0.5">
                            {badge}
                          </span>
                        ))}
                        {customer.disabledReason ? <span className="text-rose-500">{customer.disabledReason}</span> : null}
                      </span>
                    </span>
                    {isSelected ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#C9956C]" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[#6F6678]">
                {loading ? "正在查询客户..." : emptyText}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
