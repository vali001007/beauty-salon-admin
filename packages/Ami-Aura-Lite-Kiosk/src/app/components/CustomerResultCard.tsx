import React from "react";
import { mockData } from "../types";
import { User, Phone, Crown, Calendar, Gift } from "lucide-react";

export function CustomerResultCard() {
  const { customer } = mockData;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-[#1F1B2D]">客户查询结果</h2>
        <div className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium border border-green-100">
          已匹配
        </div>
      </div>

      <div className="flex items-center gap-6 p-5 bg-[#F7F5F2] rounded-2xl border border-black/5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#C9956C] to-[#2D1B69] flex items-center justify-center shrink-0">
          <span className="text-white text-xl font-bold">
            {customer.name[0]}
          </span>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-[#1F1B2D]">{customer.name}</span>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-[#2D1B69] text-white rounded text-xs font-medium">
              <Crown className="w-3 h-3" />
              {customer.level}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-[#6F6678]">
            <div className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              {customer.phone}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-2">
        <div className="flex items-center gap-4 p-4 rounded-xl border border-black/5">
          <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-[#6F6678]" />
          </div>
          <div>
            <div className="text-xs text-[#6F6678] mb-1">最近到店</div>
            <div className="text-sm font-medium text-[#1F1B2D]">{customer.lastVisit}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 p-4 rounded-xl border border-[#C9956C]/20 bg-[#C9956C]/5">
          <div className="w-10 h-10 rounded-full bg-[#C9956C]/20 flex items-center justify-center">
            <Gift className="w-5 h-5 text-[#C9956C]" />
          </div>
          <div>
            <div className="text-xs text-[#C9956C] mb-1">可用卡项数量</div>
            <div className="text-lg font-bold text-[#C9956C]">{customer.availableItems} 项</div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3 mt-4">
        <button className="flex-1 py-3 px-4 bg-[#1F1B2D] text-white rounded-xl font-medium flex items-center justify-center gap-2">
          开单收银
        </button>
        <button className="flex-1 py-3 px-4 bg-[#C9956C] text-white rounded-xl font-medium flex items-center justify-center gap-2">
          次卡核销
        </button>
      </div>
    </div>
  );
}
