import React from "react";
import { Calendar, Crown, Gift, Phone, User } from "lucide-react";

export interface CustomerResultCardData {
  name: string;
  level?: string;
  phone?: string;
  lastVisit?: string;
  availableItems?: number;
}

export function CustomerResultCard({
  customer,
  onCashier,
  onVerifyCard,
}: {
  customer?: CustomerResultCardData | null;
  onCashier?: () => void;
  onVerifyCard?: () => void;
}) {
  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center">
        <User className="h-8 w-8 text-[#9B92A3]" />
        <div>
          <h2 className="text-lg font-semibold text-[#1F1B2D]">暂无客户结果</h2>
          <p className="mt-1 text-sm text-[#6F6678]">请通过真实客户搜索选择客户后查看档案。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1F1B2D]">客户查询结果</h2>
        <div className="rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-medium text-green-600">
          已匹配
        </div>
      </div>

      <div className="flex items-center gap-6 rounded-2xl border border-black/5 bg-[#F7F5F2] p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#C9956C] to-[#2D1B69]">
          <span className="text-xl font-bold text-white">{customer.name[0] ?? "客"}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3">
            <span className="truncate text-2xl font-bold text-[#1F1B2D]">{customer.name}</span>
            {customer.level ? (
              <div className="flex items-center gap-1 rounded bg-[#2D1B69] px-2 py-0.5 text-xs font-medium text-white">
                <Crown className="h-3 w-3" />
                {customer.level}
              </div>
            ) : null}
          </div>
          {customer.phone ? (
            <div className="flex items-center gap-1 text-sm text-[#6F6678]">
              <Phone className="h-4 w-4" />
              {customer.phone}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-black/5 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5">
            <Calendar className="h-5 w-5 text-[#6F6678]" />
          </div>
          <div>
            <div className="mb-1 text-xs text-[#6F6678]">最近到店</div>
            <div className="text-sm font-medium text-[#1F1B2D]">{customer.lastVisit || "暂无记录"}</div>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-[#C9956C]/20 bg-[#C9956C]/5 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9956C]/20">
            <Gift className="h-5 w-5 text-[#C9956C]" />
          </div>
          <div>
            <div className="mb-1 text-xs text-[#C9956C]">可用卡项数量</div>
            <div className="text-lg font-bold text-[#C9956C]">{customer.availableItems ?? 0} 项</div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onCashier}
          disabled={!onCashier}
          className="flex-1 rounded-xl bg-[#1F1B2D] px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          开单收银
        </button>
        <button
          type="button"
          onClick={onVerifyCard}
          disabled={!onVerifyCard}
          className="flex-1 rounded-xl bg-[#C9956C] px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          次卡核销
        </button>
      </div>
    </div>
  );
}
