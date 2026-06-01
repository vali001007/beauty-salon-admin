import React, { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Search } from "lucide-react";
import type { CustomerSelectItem } from "../types";
import { cn } from "./ui/utils";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function CustomerSelectList({
  customers,
  selectedCustomerId,
  onSelect,
}: {
  customers: CustomerSelectItem[];
  selectedCustomerId?: number;
  onSelect: (customer: CustomerSelectItem) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const safeCustomers = useMemo(() => safeArray(customers), [customers]);
  const filtered = useMemo(() => {
    const keyword = searchQuery.trim();
    if (!keyword) {
      const appointedToday = safeCustomers.filter((customer) => customer.isAppointedToday);
      return (appointedToday.length ? appointedToday : safeCustomers).slice(0, 8);
    }
    return safeCustomers.filter((customer) => customer.name.includes(keyword) || customer.phone.includes(keyword)).slice(0, 12);
  }, [safeCustomers, searchQuery]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6F6678]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="输入客户姓名或手机号搜索"
          className="h-14 w-full rounded-2xl border border-black/10 bg-white pl-12 pr-4 text-base text-[#1F1B2D] outline-none transition focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
        />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {filtered.map((customer) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            className={cn(
              "flex items-center justify-between rounded-2xl border p-4 text-left transition",
              selectedCustomerId === customer.id
                ? "border-[#C9956C] bg-[#C9956C]/8"
                : "border-black/5 bg-[#F7F5F2] hover:border-[#C9956C]/50",
            )}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#1F1B2D]">{customer.name}</span>
                {customer.isAppointedToday ? (
                  <span className="rounded-full bg-[#2D1B69]/8 px-2 py-0.5 text-xs text-[#2D1B69]">预约 {customer.appointmentTime}</span>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-[#6F6678]">{customer.phone} · {customer.memberLevel}</div>
            </div>
            {selectedCustomerId === customer.id ? <CheckCircle2 className="h-5 w-5 text-[#C9956C]" /> : <ChevronRight className="h-5 w-5 text-[#9B92A3]" />}
          </button>
        ))}
      </div>
    </div>
  );
}
