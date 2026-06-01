import React from "react";
import { mockData } from "../types";
import {
  TrendingUp,
  CalendarCheck,
  Clock,
  UserCheck,
  AlertCircle,
} from "lucide-react";

export function TodayOverviewCard({
  onQuickAction,
}: {
  onQuickAction: (action: string) => void;
}) {
  const { overview } = mockData;

  const stats = [
    {
      label: "今日营业额",
      value: `¥${overview.todayRevenue.toLocaleString()}`,
      icon: TrendingUp,
      color: "bg-[#C9956C]/10 text-[#C9956C]",
      action: "cashier_placeholder",
    },
    {
      label: "今日预约",
      value: overview.appointments,
      icon: CalendarCheck,
      color: "bg-[#2D1B69]/5 text-[#2D1B69]",
      action: "appointment_list",
    },
    {
      label: "待到店",
      value: overview.pendingArrivals,
      icon: Clock,
      color: "bg-amber-50 text-amber-600",
      action: "appointment_list",
    },
    {
      label: "已到店",
      value: overview.arrivals,
      icon: UserCheck,
      color: "bg-green-50 text-green-600",
      action: "appointment_list",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1F1B2D]">Ami</h2>
        <span className="text-sm text-[#6F6678]">
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            onClick={() => onQuickAction(stat.action)}
            className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#F7F5F2] cursor-pointer hover:bg-black/5 transition-colors"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div className="text-3xl font-bold text-[#1F1B2D] mb-1">{stat.value}</div>
            <div className="text-sm text-[#6F6678] font-medium">{stat.label}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
