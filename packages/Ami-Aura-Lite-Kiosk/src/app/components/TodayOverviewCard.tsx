import React from "react";
import { AlertCircle, CalendarCheck, Clock, TrendingUp, UserCheck } from "lucide-react";
import { formatBusinessDate } from "../utils/businessTime";

export interface TodayOverviewStats {
  todayRevenue: number;
  appointments: number;
  pendingArrivals: number;
  arrivals: number;
}

const EMPTY_OVERVIEW: TodayOverviewStats = {
  todayRevenue: 0,
  appointments: 0,
  pendingArrivals: 0,
  arrivals: 0,
};

export function TodayOverviewCard({
  overview = EMPTY_OVERVIEW,
  loading = false,
  error,
  onQuickAction,
}: {
  overview?: TodayOverviewStats;
  loading?: boolean;
  error?: string;
  onQuickAction: (action: string) => void;
}) {
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
          {formatBusinessDate(new Date())}
        </span>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => onQuickAction(stat.action)}
            disabled={loading}
            className="flex flex-col items-center justify-center rounded-2xl bg-[#F7F5F2] p-5 text-center transition-colors hover:bg-black/5 disabled:cursor-wait disabled:opacity-70"
          >
            <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${stat.color}`}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div className="mb-1 text-3xl font-bold text-[#1F1B2D]">{loading ? "..." : stat.value}</div>
            <div className="text-sm font-medium text-[#6F6678]">{stat.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
