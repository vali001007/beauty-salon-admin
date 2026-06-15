import React, { useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Eye, Loader2, Search } from "lucide-react";
import { cn } from "./ui/utils";

export interface CustomerSelectOption {
  id: number;
  name: string;
  phone?: string;
  memberLevel?: string;
  tags?: string[];
  profileLabel?: string;
  isAppointedToday?: boolean;
  appointmentTime?: string;
  appointmentProjectName?: string;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function getCustomerMeta(customer: CustomerSelectOption) {
  return [customer.phone, customer.memberLevel].filter(Boolean).join(" · ");
}

function getCustomerTags(customer: CustomerSelectOption) {
  return [customer.profileLabel, ...safeArray(customer.tags)].filter(Boolean).slice(0, 4);
}

export function CustomerSelectList<T extends CustomerSelectOption>({
  customers,
  selectedCustomerId,
  onSelect,
  onViewDetails,
  loadingCustomerId,
  disabled,
  label = "客户",
  placeholder = "请选择客户",
  searchPlaceholder = "搜索姓名",
  emptyText = "未找到匹配客户，请检查姓名或手机号。",
}: {
  customers: T[];
  selectedCustomerId?: number;
  onSelect: (customer: T) => void;
  onViewDetails?: (customer: T) => void;
  loadingCustomerId?: number | null;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const safeCustomers = useMemo(() => safeArray(customers), [customers]);
  const selectedCustomer = safeCustomers.find((customer) => customer.id === selectedCustomerId);
  const filtered = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      const appointedToday = safeCustomers.filter((customer) => customer.isAppointedToday);
      return (appointedToday.length ? appointedToday : safeCustomers).slice(0, 12);
    }
    return safeCustomers
      .filter((customer) => {
        const haystack = [customer.name, customer.phone, customer.memberLevel, customer.appointmentProjectName, ...safeArray(customer.tags)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 20);
  }, [safeCustomers, searchQuery]);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((current) => {
      const next = !current;
      if (next) window.setTimeout(() => searchRef.current?.focus(), 0);
      return next;
    });
  };

  const handleSelect = (customer: T) => {
    onSelect(customer);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-base font-semibold text-[#4B4360]">{label}</div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          "flex h-14 w-full items-center justify-between rounded-2xl border bg-white px-4 text-left text-base transition",
          open ? "border-[#8F83B7] shadow-[0_0_0_2px_rgba(45,27,105,0.08)]" : "border-black/10",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-[#8F83B7]",
        )}
      >
        <span className={selectedCustomer ? "font-medium text-[#1F1B2D]" : "text-[#9B92A3]"}>
          {selectedCustomer ? `${selectedCustomer.name}${selectedCustomer.phone ? ` ${selectedCustomer.phone}` : ""}` : placeholder}
        </span>
        {open ? <ChevronUp className="h-5 w-5 text-[#6F6678]" /> : <ChevronDown className="h-5 w-5 text-[#6F6678]" />}
      </button>

      {open ? (
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg shadow-black/5">
          <div className="relative border-b border-black/8">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6F6678]" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
              disabled={disabled}
              className="h-14 w-full bg-white pl-12 pr-4 text-base text-[#1F1B2D] outline-none placeholder:text-[#9B92A3] disabled:opacity-60"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length ? (
              filtered.map((customer) => {
                const selected = selectedCustomerId === customer.id;
                const tags = getCustomerTags(customer);
                return (
                  <div
                    key={customer.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition hover:bg-[#F7F5F2]",
                      selected ? "bg-[#2D1B69]/6" : "bg-white",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(customer)}
                      disabled={disabled || loadingCustomerId === customer.id}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left disabled:cursor-wait disabled:opacity-70"
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-base font-medium text-[#1F1B2D]">{customer.name}</span>
                          <span className="text-base text-[#1F1B2D]">{customer.phone}</span>
                          {customer.isAppointedToday ? (
                            <span className="rounded-full bg-[#2D1B69]/8 px-2 py-0.5 text-xs text-[#2D1B69]">
                              预约 {customer.appointmentTime ?? "今日"}
                            </span>
                          ) : null}
                        </span>
                        {getCustomerMeta(customer) || customer.appointmentProjectName || tags.length ? (
                          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-[#6F6678]">
                            {getCustomerMeta(customer) ? <span>{getCustomerMeta(customer)}</span> : null}
                            {customer.appointmentProjectName ? <span>{customer.appointmentProjectName}</span> : null}
                            {tags.map((tag) => (
                              <span key={`${customer.id}-${tag}`} className="rounded-full bg-[#F7F5F2] px-2 py-0.5">
                                {tag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {loadingCustomerId === customer.id ? <Loader2 className="h-4 w-4 animate-spin text-[#C9956C]" /> : null}
                        {selected ? <CheckCircle2 className="h-5 w-5 text-[#C9956C]" /> : null}
                      </span>
                    </button>
                    {onViewDetails ? (
                      <button
                        type="button"
                        onClick={() => onViewDetails(customer)}
                        disabled={disabled}
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 text-xs font-medium text-[#1F1B2D] transition hover:border-[#C9956C]/60 hover:text-[#C9956C] disabled:opacity-60"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        查看
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[#6F6678]">{emptyText}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
