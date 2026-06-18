import React from "react";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  HeartPulse,
  Loader2,
  PackageCheck,
  Plus,
  Printer,
  Scissors,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type {
  AppointmentCardData,
  BeauticianCustomerListData,
  CoreDataStatus,
  CustomerCardData,
  DashboardCardData,
  FollowUpTasksCardData,
  InventoryAlertCardData,
  OperationResultData,
  OperationReceiptData,
  StaffScheduleCardData,
} from "../types";
import type { BusinessQueryResponse } from "@/types/businessQuery";
import type { AgentEvidence, AgentRunResult, AgentToolResult } from "@/types/agent";
import {
  cancelAppointmentFromTerminal,
  checkInAppointmentFromTerminal,
  confirmAppointmentFromTerminal,
  closeCashierShift,
  createAppointmentFromTerminal,
  getAppointmentCreateOptions,
  getAppointmentEditOptions,
  getAppointments,
  getCashierShiftStatus,
  isShiftRequired,
  invalidateTerminalScheduleCaches,
  openCashierShift,
  refreshShiftRequired,
  updateAppointmentFromTerminal,
  type AppointmentCreateOptions,
  type AppointmentEditOptions,
} from "../services/auraCoreService";
import {
  completeTerminalFollowUpTask,
  createTerminalPrintJob,
  getTerminalBeauticianCommission,
  getTerminalReservationAvailability,
  saveSchedule,
  startTerminalFollowUpTask,
} from "@/api";
import type { ScheduleSlot } from "@/types";
import type { TerminalCashierShift, TerminalFollowUpTask, TerminalReservationAvailability } from "@/types/terminal";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

type TerminalScheduleStatus = "normal" | "booked" | "expired" | "leave" | "busy";
type TerminalEditableScheduleStatus = Extract<TerminalScheduleStatus, "normal" | "busy" | "leave">;

type TerminalDisplaySlot = {
  label: string;
  end: string;
  sourceTimes: string[];
};

type ReservationSlotOption = {
  value: string;
  label: string;
  available: boolean;
  reason?: string;
};

const TERMINAL_DISPLAY_SLOTS: TerminalDisplaySlot[] = [
  { label: "09:00-10:00", end: "10:00", sourceTimes: ["09:00", "09:30"] },
  { label: "10:00-11:00", end: "11:00", sourceTimes: ["10:00", "10:30"] },
  { label: "11:00-12:00", end: "12:00", sourceTimes: ["11:00", "11:30"] },
  { label: "14:00-15:00", end: "15:00", sourceTimes: ["14:00", "14:30"] },
  { label: "15:00-16:00", end: "16:00", sourceTimes: ["15:00", "15:30"] },
  { label: "16:00-17:00", end: "17:00", sourceTimes: ["16:00", "16:30"] },
  { label: "17:00-18:00", end: "18:00", sourceTimes: ["17:00", "17:30"] },
  { label: "18:00-19:00", end: "19:00", sourceTimes: ["18:00", "18:30"] },
  { label: "19:00-20:00", end: "20:00", sourceTimes: ["19:00", "19:30"] },
];

function addDays(dateText: string, days: number) {
  const date = new Date(dateText);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getTerminalCurrentWeekStart() {
  const date = new Date();
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getTerminalWeekDays(weekStart?: string) {
  const start = weekStart || getTerminalCurrentWeekStart();
  const names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return names.map((name, index) => {
    const fullDate = addDays(start, index);
    return { name, date: fullDate.slice(5), fullDate };
  });
}

function getTerminalDayOptions(weekStart?: string) {
  const weekDays = getTerminalWeekDays(weekStart);
  const today = new Date().toISOString().slice(0, 10);
  return ["今日", "明日", "后日"].map((label, offset) => {
    const fullDate = addDays(today, offset);
    const weekDay = weekDays.find((day) => day.fullDate === fullDate);
    return {
      label,
      fullDate,
      name: weekDay?.name ?? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(fullDate).getDay()],
      date: fullDate.slice(5),
      dayIndex: weekDay ? weekDays.indexOf(weekDay) : -1,
    };
  });
}

function isTerminalPastSlot(day: { fullDate: string }, slot: TerminalDisplaySlot) {
  return new Date(`${day.fullDate}T${slot.end}:00`).getTime() < Date.now();
}

function getTerminalDisplaySlotStatus(
  daySlots: StaffScheduleCardData["todaySlots"],
  day: { fullDate: string },
  slot: TerminalDisplaySlot,
): TerminalScheduleStatus {
  if (isTerminalPastSlot(day, slot)) return "expired";
  const sourceSlots = slot.sourceTimes.map((time) => daySlots.find((item) => item.time === time));
  if (sourceSlots.some((item) => item?.status === "booked")) return "booked";
  if (sourceSlots.some((item) => item?.status === "leave")) return "leave";
  if (sourceSlots.some((item) => item?.status === "busy")) return "busy";
  return sourceSlots.every((item) => item?.available) ? "normal" : "busy";
}

function getTerminalStatusClass(status: TerminalScheduleStatus) {
  const styles: Record<TerminalScheduleStatus, string> = {
    normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
    booked: "border-blue-200 bg-blue-50 text-blue-700",
    expired: "border-gray-200 bg-gray-50 text-gray-400",
    leave: "border-rose-200 bg-rose-50 text-rose-600",
    busy: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return styles[status];
}

function getTerminalStatusLabel(status: TerminalScheduleStatus) {
  const labels: Record<TerminalScheduleStatus, string> = {
    normal: "正常",
    booked: "已预约",
    expired: "已过时",
    leave: "请假",
    busy: "忙碌",
  };
  return labels[status];
}

function getTerminalDaySlots(item: StaffScheduleCardData, dayIndex: number) {
  return dayIndex >= 0 ? (item.weekSlots?.[dayIndex] ?? []) : [];
}

function cloneTerminalWeekSlots(weekSlots: StaffScheduleCardData["weekSlots"]) {
  return safeArray(weekSlots).map((day) => safeArray(day).map((slot) => ({ ...slot })));
}

function normalizeTerminalWeekSlots(weekSlots: StaffScheduleCardData["weekSlots"]) {
  const cloned = cloneTerminalWeekSlots(weekSlots);
  return Array.from({ length: 7 }, (_, index) => cloned[index] ?? []);
}

function buildTerminalScheduleMap(items: StaffScheduleCardData[]) {
  return Object.fromEntries(
    safeArray(items).map((item) => [item.beautician.id, normalizeTerminalWeekSlots(item.weekSlots)]),
  ) as Record<number, ScheduleSlot[][]>;
}

function setTerminalDisplaySlotStatus(
  daySlots: StaffScheduleCardData["todaySlots"],
  slot: TerminalDisplaySlot,
  status: TerminalEditableScheduleStatus,
) {
  const sourceTimes = new Set(slot.sourceTimes);
  const period = Number(slot.sourceTimes[0]?.slice(0, 2) ?? 0) < 12 ? "上午" : "下午";
  const nextSlots = safeArray(daySlots).map((item) =>
    sourceTimes.has(item.time) ? { ...item, available: status === "normal", status } : item,
  );

  slot.sourceTimes.forEach((time) => {
    if (nextSlots.some((item) => item.time === time)) return;
    nextSlots.push({
      time,
      period,
      available: status === "normal",
      status,
    });
  });

  return nextSlots.sort((a, b) => a.time.localeCompare(b.time));
}

function getTerminalEditOptions() {
  return [
    ["normal", "正常"],
    ["busy", "忙碌"],
    ["leave", "请假"],
  ] as const;
}

function getTerminalDayUtilization(daySlots: StaffScheduleCardData["todaySlots"]) {
  const scopedSlots = safeArray(daySlots);
  const busyCount = scopedSlots.filter((slot) => !slot.available || ["booked", "busy", "leave"].includes(String(slot.status))).length;
  return scopedSlots.length ? `${Math.round((busyCount / scopedSlots.length) * 100)}%` : "0%";
}

function formatTerminalMoney(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTerminalSlotKey(beauticianId: number, dayIndex: number, slot: TerminalDisplaySlot) {
  return `${beauticianId}:${dayIndex}:${slot.label}`;
}

function TerminalScheduleSlotButton({
  slot,
  status,
  saving,
  onSelect,
}: {
  slot: TerminalDisplaySlot;
  status: TerminalScheduleStatus;
  saving: boolean;
  onSelect: (status: TerminalEditableScheduleStatus) => void;
}) {
  const locked = status === "booked" || status === "expired";
  const editableStatus: TerminalEditableScheduleStatus = status === "busy" || status === "leave" ? status : "normal";

  if (locked) {
    return (
      <button
        type="button"
        disabled
        className={`flex min-h-9 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center text-xs font-medium opacity-80 transition ${getTerminalStatusClass(status)}`}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {getTerminalStatusLabel(status)}
      </button>
    );
  }

  return (
    <label className="relative block">
      <select
        aria-label={`${slot.label} 排班状态`}
        value={editableStatus}
        disabled={saving}
        onChange={(event) => onSelect(event.target.value as TerminalEditableScheduleStatus)}
        className={`h-9 w-full appearance-none rounded-lg border px-3 pr-8 text-center text-xs font-medium outline-none transition hover:shadow-sm focus:ring-2 focus:ring-[#2D1B69]/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80 ${getTerminalStatusClass(status)}`}
      >
        {getTerminalEditOptions().map(([nextStatus, label]) => (
          <option key={nextStatus} value={nextStatus}>
            {label}
          </option>
        ))}
      </select>
      {saving ? (
        <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin opacity-70" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-70" />
      )}
    </label>
  );
}

function TerminalScheduleDayTabs({
  options,
  activeIndex,
  onChange,
}: {
  options: ReturnType<typeof getTerminalDayOptions>;
  activeIndex: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((day, index) => (
        <button
          key={day.fullDate}
          type="button"
          onClick={() => onChange(index)}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            activeIndex === index
              ? "border-[#2D1B69] bg-[#2D1B69] text-white"
              : "border-black/10 bg-white text-[#6F6678] hover:border-[#2D1B69]/30"
          }`}
        >
          {day.label} <span className={activeIndex === index ? "text-white/80" : "text-[#9B92A3]"}>{day.name} {day.date}</span>
        </button>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  desc,
}: {
  title: string;
  desc?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[#1F1B2D]">{title}</h2>
        {desc ? <p className="mt-1 text-sm text-[#6F6678]">{desc}</p> : null}
      </div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#2D1B69]">
        <Sparkles className="h-3.5 w-3.5" />
        Ami 参考
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "purple",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "purple" | "gold" | "green" | "red";
}) {
  const toneMap = {
    purple: "bg-[#2D1B69]/6 text-[#2D1B69] border-[#2D1B69]/10",
    gold: "bg-[#C9956C]/10 text-[#A8764D] border-[#C9956C]/20",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-rose-50 text-rose-600 border-rose-100",
  } as const;

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/70">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-[#1F1B2D]">{value}</div>
      <div className="mt-1 text-xs font-medium">{label}</div>
      {hint ? <div className="mt-1 text-[11px] text-[#6F6678]">{hint}</div> : null}
    </div>
  );
}

function getManagerKpiIcon(label: string) {
  if (label.includes("Ami")) return Sparkles;
  if (label.includes("营业额")) return TrendingUp;
  if (label.includes("预约")) return CalendarCheck;
  if (label.includes("到店")) return CheckCircle2;
  if (label.includes("活跃")) return CreditCard;
  return Users;
}

function getManagerKpiTone(label: string, value?: string): "purple" | "gold" | "green" | "red" {
  if (label.includes("Ami")) return "green";
  if (label.includes("营业额")) return "gold";
  if (label.includes("预约")) return "green";
  if (label.includes("到店")) return "purple";
  if (label.includes("活跃")) return "green";
  return "purple";
}

function isDashboardInsight(value: DashboardCardData["risks"][number]): value is Exclude<DashboardCardData["risks"][number], string> {
  return Boolean(value && typeof value === "object" && "title" in value && "reason" in value && "action" in value);
}

function getInsightSeverityLabel(severity?: string) {
  if (severity === "high") return "高";
  if (severity === "low") return "低";
  return "中";
}

function getInsightSeverityClass(severity?: string) {
  if (severity === "high") return "border-rose-100 bg-rose-50 text-rose-600";
  if (severity === "low") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  return "border-amber-100 bg-amber-50 text-amber-700";
}

function getDashboardInsightContent(value: DashboardCardData["risks"][number] | undefined, fallbackTitle: string) {
  if (!value) return null;
  if (isDashboardInsight(value)) {
    return {
      title: value.title,
      severity: value.severity,
      reason: value.reason,
      action: value.action,
    };
  }

  return {
    title: fallbackTitle,
    severity: undefined,
    reason: String(value),
    action: "",
  };
}

function getFallbackRiskAction(reason: string, highlightAction?: string) {
  if (reason.includes("库存") || reason.includes("补货")) {
    return "打开库存预警，优先处理影响今日项目交付的耗材，并为低于安全库存的商品创建补货单。";
  }
  if (reason.includes("预约")) {
    return "进入预约工作台，按预约时间确认到店；临近或超时未到店客户由前台先电话提醒。";
  }
  if (reason.includes("排班") || reason.includes("负载") || reason.includes("员工")) {
    return "打开员工排班，检查忙碌时段和预约分配，必要时把新增预约分流给空闲美容师。";
  }
  return highlightAction || "进入对应工作台查看明细，并分配负责人跟进。";
}

function AppointmentStatusBadge({ status, text }: { status: string; text: string }) {
  const styles =
    status === "confirmed"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : status === "checked_in"
        ? "bg-[#2D1B69]/6 text-[#2D1B69] border-[#2D1B69]/10"
        : status === "cancelled"
          ? "bg-rose-50 text-rose-600 border-rose-100"
          : "bg-amber-50 text-amber-700 border-amber-100";

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>{text}</span>;
}

function AppointmentActionButton({
  label,
  onClick,
  icon: Icon,
  variant = "soft",
  disabled = false,
  loading = false,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "soft" | "gold" | "dark" | "danger";
  disabled?: boolean;
  loading?: boolean;
}) {
  const styles =
    variant === "dark"
      ? "bg-[#1F1B2D] text-white"
      : variant === "gold"
        ? "bg-[#C9956C] text-white"
        : variant === "danger"
          ? "bg-rose-50 text-rose-600 border border-rose-100"
          : "bg-white text-[#1F1B2D] border border-black/10";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${styles}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

function getAppointmentClock(item: AppointmentCardData["items"][number]) {
  const source = item.displayTime || item.appointmentTime;
  const matches = source.match(/\b\d{1,2}:\d{2}\b/g);
  return matches?.[matches.length - 1] ?? source;
}

function toDateTimeLocalValue(value?: string) {
  if (!value) return "";
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toAppointmentDateValue(value?: string) {
  const localValue = toDateTimeLocalValue(value);
  return localValue ? localValue.slice(0, 10) : getDefaultAppointmentDate();
}

function toAppointmentSlotValue(value?: string) {
  const localValue = toDateTimeLocalValue(value);
  return localValue ? localValue.slice(11, 16) : "";
}

function getDefaultAppointmentDate() {
  return getDefaultAppointmentLocalTime().slice(0, 10);
}

function toApiDateTime(value: string) {
  return value.includes("T") ? `${value}:00` : value;
}

function toApiDateTimeFromSlot(date: string, slotStart: string) {
  if (!date || !slotStart) return "";
  return `${date}T${slotStart}:00`;
}

function getDefaultAppointmentLocalTime() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toTimeRangeLabel(startTime: string, duration: number) {
  const [hour, minute] = startTime.split(":").map((item) => Number(item));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return startTime;
  const start = hour * 60 + minute;
  const end = start + Math.max(1, duration || 60);
  const endHour = Math.floor(end / 60);
  const endMinute = end % 60;
  return `${startTime}-${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
}

function getSlotOptionsFromAvailability(
  availability: TerminalReservationAvailability | null,
  beauticianId: string,
  duration: string,
): ReservationSlotOption[] {
  if (!availability) return [];
  const durationMinutes = Number(duration) || availability.duration || 60;
  const groups = beauticianId
    ? availability.items.filter((item) => String(item.beauticianId) === beauticianId)
    : availability.items;
  const seen = new Set<string>();
  return groups.flatMap((group) =>
    group.slots.flatMap((slot) => {
      const key = `${slot.time}:${group.beauticianId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          value: slot.time,
          label: `${toTimeRangeLabel(slot.time, durationMinutes)} · ${group.beauticianName}`,
          available: slot.available,
          reason: slot.reason,
        },
      ];
    }),
  );
}

function canEditAppointment(status: string) {
  return !["completed", "cancelled", "no_show"].includes(status);
}

function canConfirmAppointment(status: string) {
  return status === "pending";
}

function canCancelAppointment(status: string) {
  return ["pending", "confirmed", "checked_in"].includes(status);
}

function canCheckInAppointment(status: string) {
  return ["pending", "confirmed"].includes(status);
}

function formatMoney(value: number) {
  return `￥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatReceiptTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString("zh-CN", { hour12: false });
  return date.toLocaleString("zh-CN", { hour12: false });
}

function getReceiptTitle(receipt: OperationReceiptData) {
  if (receipt.businessTitle) return receipt.businessTitle;
  return receipt.sourceType === "card_usage" ? "核销凭证" : "消费小票";
}

function getReceiptDetailLabel(receipt: OperationReceiptData) {
  if (receipt.detailLabel) return receipt.detailLabel;
  return receipt.sourceType === "card_usage" ? "核销明细" : "收费明细";
}

function isMonetaryReceipt(receipt: OperationReceiptData) {
  return receipt.sourceType !== "card_usage";
}

function getReceiptSequenceLabel(receipt: OperationReceiptData) {
  if (receipt.sourceType === "card_usage") return "核销流水号";
  if (receipt.sourceType === "card_order") return "开卡流水号";
  if (receipt.sourceType === "recharge_order") return "充值流水号";
  return "收银流水号";
}

function getReceiptMethodLabel(receipt: OperationReceiptData) {
  return receipt.sourceType === "card_usage" ? "核销方式" : "支付方式";
}

function buildReceiptContent(receipt: OperationReceiptData) {
  const receiptTitle = getReceiptTitle(receipt);
  const monetary = isMonetaryReceipt(receipt);
  const lines = [
    receipt.storeName,
    receiptTitle,
    "------------------------------",
    `单号: ${receipt.receiptNo}`,
    `时间: ${formatReceiptTime(receipt.createdAt)}`,
    `客户: ${receipt.customerName}`,
    receipt.customerPhone ? `电话: ${receipt.customerPhone}` : "",
    receipt.cashierName ? `收银员: ${receipt.cashierName}` : "",
    "------------------------------",
    ...receipt.items.map((item) =>
      monetary ? `${item.name} x${item.quantity} ${formatMoney(item.subtotal)}` : `${item.name} x${item.quantity}`,
    ),
    "------------------------------",
    monetary ? `应收: ${formatMoney(receipt.subtotalAmount)}` : "",
    monetary ? `优惠: ${formatMoney(receipt.discountAmount)}` : "",
    monetary ? `实收: ${formatMoney(receipt.paidAmount)}` : "",
    receipt.paymentMethod ? `支付: ${receipt.paymentMethod}` : "",
    "------------------------------",
    "感谢惠顾，欢迎下次光临",
  ];
  return lines.filter(Boolean).join("\n");
}

function ReceiptPreviewDialog({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: OperationReceiptData | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [printStatus, setPrintStatus] = React.useState<"preview" | "printing" | "success" | "error">("preview");
  const [printMessage, setPrintMessage] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setPrintStatus("preview");
      setPrintMessage("");
    }
  }, [open]);

  if (!receipt) return null;
  const receiptTitle = getReceiptTitle(receipt);
  const monetary = isMonetaryReceipt(receipt);

  const handlePrint = async () => {
    setPrintStatus("printing");
    setPrintMessage("");
    try {
      const job = await createTerminalPrintJob({
        sourceType: receipt.sourceType,
        sourceId: receipt.sourceId,
        title: `${receipt.storeName} ${receiptTitle} ${receipt.receiptNo}`,
        content: buildReceiptContent(receipt),
        copies: 1,
      });
      if (typeof window !== "undefined") {
        window.print();
      }
      setPrintStatus("success");
      setPrintMessage(`打印任务 ${job.jobNo} 已创建`);
    } catch (err) {
      setPrintStatus("error");
      setPrintMessage(err instanceof Error ? err.message : "打印任务创建失败，请检查打印机连接");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border border-black/10 bg-white text-[#1F1B2D] shadow-2xl shadow-black/25">
        <DialogHeader>
          <DialogTitle>{receiptTitle}预览</DialogTitle>
          <DialogDescription>确认内容后，可发送到 Ami_Core 打印任务并调起本机打印。</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-black/10 bg-[#FAFAF8] p-5 font-mono text-sm text-[#1F1B2D] shadow-inner">
          <div className="text-center">
            <div className="text-base font-bold">{receipt.storeName}</div>
            <div className="mt-1 text-xs text-[#6F6678]">{receiptTitle}</div>
          </div>
          <div className="my-3 border-t border-dashed border-black/25" />

          <div className="grid gap-1 text-xs text-[#6F6678]">
            <div className="flex justify-between gap-3">
              <span>单号</span>
              <span className="text-right text-[#1F1B2D]">{receipt.receiptNo}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>时间</span>
              <span className="text-right text-[#1F1B2D]">{formatReceiptTime(receipt.createdAt)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>客户</span>
              <span className="text-right text-[#1F1B2D]">{receipt.customerName}</span>
            </div>
            {receipt.cashierName ? (
              <div className="flex justify-between gap-3">
                <span>收银员</span>
                <span className="text-right text-[#1F1B2D]">{receipt.cashierName}</span>
              </div>
            ) : null}
          </div>

          <div className="my-3 border-t border-dashed border-black/25" />
          <div className="grid gap-2">
            <div className={`grid ${monetary ? "grid-cols-[1fr_44px_80px]" : "grid-cols-[1fr_44px]"} gap-2 text-xs text-[#6F6678]`}>
              <span>{monetary ? "项目/商品" : "项目/卡项"}</span>
              <span className="text-center">数量</span>
              {monetary ? <span className="text-right">金额</span> : null}
            </div>
            {receipt.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className={`grid ${monetary ? "grid-cols-[1fr_44px_80px]" : "grid-cols-[1fr_44px]"} gap-2 text-xs`}>
                <span className="truncate">{item.name}</span>
                <span className="text-center">x{item.quantity}</span>
                {monetary ? <span className="text-right">{formatMoney(item.subtotal)}</span> : null}
              </div>
            ))}
          </div>

          {monetary || receipt.paymentMethod ? (
            <>
              <div className="my-3 border-t border-dashed border-black/25" />
              <div className="grid gap-1 text-xs">
                {monetary ? (
                  <>
                    <div className="flex justify-between text-[#6F6678]">
                      <span>应收</span>
                      <span>{formatMoney(receipt.subtotalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-[#6F6678]">
                      <span>优惠</span>
                      <span>-{formatMoney(receipt.discountAmount)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-[#1F1B2D]">
                      <span>实收</span>
                      <span>{formatMoney(receipt.paidAmount)}</span>
                    </div>
                  </>
                ) : null}
                {receipt.paymentMethod ? (
                  <div className="flex justify-between text-[#6F6678]">
                    <span>{receipt.sourceType === "card_usage" ? "核销方式" : "支付方式"}</span>
                    <span>{receipt.paymentMethod}</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="my-3 border-t border-dashed border-black/25" />
          <div className="text-center text-xs leading-5 text-[#9B92A3]">
            <div>感谢惠顾</div>
            <div>欢迎下次光临</div>
          </div>
        </div>

        {printMessage ? (
          <div
            className={`rounded-xl px-3 py-2 text-sm ${
              printStatus === "error" ? "border border-rose-100 bg-rose-50 text-rose-600" : "border border-emerald-100 bg-emerald-50 text-emerald-700"
            }`}
          >
            {printMessage}
          </div>
        ) : null}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D]"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={printStatus === "printing"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {printStatus === "printing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {printStatus === "printing" ? "正在打印" : "打印"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptInlineDetails({ receipt }: { receipt: OperationReceiptData }) {
  const monetary = isMonetaryReceipt(receipt);
  const detailLabel = getReceiptDetailLabel(receipt);
  const sequenceLabel = getReceiptSequenceLabel(receipt);
  const methodLabel = getReceiptMethodLabel(receipt);
  const detailText = receipt.items.map((item) => `${item.name} x${item.quantity}`).join("、");
  const paidLabel =
    receipt.sourceType === "card_usage"
      ? "扣减"
      : receipt.sourceType === "card_order"
        ? "实收"
        : receipt.sourceType === "recharge_order"
          ? "到账"
          : "实收";

  return (
    <div className="mt-3 rounded-xl border border-emerald-100 bg-white/80 px-3 py-2 text-[#1F1B2D]">
      <div className="grid gap-2 text-sm md:grid-cols-[130px_100px_100px_minmax(0,1fr)_84px]">
        <div className="min-w-0">
          <div className="text-xs text-[#6F6678]">{sequenceLabel}</div>
          <div className="mt-0.5 truncate font-semibold">{receipt.receiptNo}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-[#6F6678]">客户</div>
          <div className="mt-0.5 truncate font-semibold">{receipt.customerName}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-[#6F6678]">{methodLabel}</div>
          <div className="mt-0.5 truncate font-semibold">{receipt.paymentMethod || "未记录"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-[#6F6678]">{detailLabel}</div>
          <div className="mt-0.5 truncate font-medium">{detailText}</div>
        </div>
        <div className="min-w-0 md:text-right">
          <div className="text-xs text-[#6F6678]">{paidLabel}</div>
          <div className="mt-0.5 truncate font-semibold">
            {monetary ? formatMoney(receipt.paidAmount) : `${receipt.items.reduce((total, item) => total + item.quantity, 0)} 次`}
          </div>
        </div>
      </div>
    </div>
  );
}

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader title={title} desc={subtitle} />
      {children}
    </div>
  );
}

function DataUnavailableNotice({ status }: { status?: CoreDataStatus }) {
  if (status?.source !== "fallback") return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">数据暂不可用</div>
          <div className="mt-0.5 text-xs leading-5 text-amber-700">
            {status.label ? `${status.label} 已降级显示` : "Ami_Core 接口暂时不可达，当前为降级空态。"}
            {status.error ? `：${status.error}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatShiftTime(value?: string) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CashierShiftPanel({
  shift,
  openingCash,
  closingCash,
  loading,
  error,
  onOpeningCashChange,
  onClosingCashChange,
  onOpen,
  onClose,
}: {
  shift: TerminalCashierShift | null;
  openingCash: string;
  closingCash: string;
  loading: boolean;
  error?: string | null;
  onOpeningCashChange: (value: string) => void;
  onClosingCashChange: (value: string) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const isOpen = shift?.status === "open";
  const diff = shift?.cashDiff ?? 0;
  return (
    <div className="mt-4 rounded-2xl border border-[#2D1B69]/10 bg-[#FAF9F7] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#1F1B2D]">收银班次</div>
          <div className="mt-1 text-xs text-[#6F6678]">
            {isOpen ? `当前班次 ${formatShiftTime(shift?.startedAt)} 起` : shift?.endedAt ? `上次关班 ${formatShiftTime(shift.endedAt)}` : "当前未开班"}
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${isOpen ? "bg-emerald-50 text-emerald-700" : "bg-[#ECE7DF] text-[#6F6678]"}`}>
          {isOpen ? "开班中" : "未开班"}
        </span>
      </div>
      {error ? <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white p-3">
          <div className="text-xs text-[#6F6678]">备用金</div>
          <div className="mt-1 text-lg font-semibold text-[#1F1B2D]">{formatTerminalMoney(shift?.openingCash)}</div>
        </div>
        <div className="rounded-xl bg-white p-3">
          <div className="text-xs text-[#6F6678]">系统应收现金</div>
          <div className="mt-1 text-lg font-semibold text-[#1F1B2D]">{formatTerminalMoney(shift?.systemCash)}</div>
        </div>
        <div className="rounded-xl bg-white p-3">
          <div className="text-xs text-[#6F6678]">现金差异</div>
          <div className={`mt-1 text-lg font-semibold ${Math.abs(diff) > 50 ? "text-rose-600" : "text-[#1F1B2D]"}`}>
            {formatTerminalMoney(shift?.cashDiff)}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isOpen ? (
          <>
            <input
              type="number"
              min={0}
              value={closingCash}
              onChange={(event) => onClosingCashChange(event.target.value)}
              placeholder="实收现金"
              className="h-10 w-36 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
            />
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              关班
            </button>
          </>
        ) : (
          <>
            <input
              type="number"
              min={0}
              value={openingCash}
              onChange={(event) => onOpeningCashChange(event.target.value)}
              placeholder="备用金"
              className="h-10 w-36 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
            />
            <button
              type="button"
              onClick={onOpen}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              开班
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ManagerDashboardCard({
  data,
}: {
  data: DashboardCardData;
}) {
  const kpis = safeArray(data.kpis);
  const risks = safeArray(data.risks);
  const highlights = safeArray(data.highlights);
  const riskItems = risks.map((riskItem, index) => {
    const risk = getDashboardInsightContent(riskItem, "风险提示");
    const highlight = getDashboardInsightContent(highlights[index], "Ami 建议");
    const riskReason = risk?.reason ?? "";
    const riskAction = risk?.action || getFallbackRiskAction(riskReason, highlight?.action);

    return {
      title: risk?.title ?? "经营关注事项",
      severity: risk?.severity,
      reason: riskReason,
      action: riskAction,
    };
  });
  const fallbackHighlightItems = riskItems.length
    ? []
    : highlights.map((highlightItem) => {
        const highlight = getDashboardInsightContent(highlightItem, "Ami 建议");

        return {
          title: highlight?.title ?? "经营机会",
          severity: undefined,
          reason: highlight?.reason ?? "",
          action: highlight?.action ?? "",
        };
      });
  const attentionItems = [...riskItems, ...fallbackHighlightItems].filter((item) => item.reason || item.action);

  return (
    <CardShell title={data.title} subtitle={data.subtitle}>
      <DataUnavailableNotice status={data.apiStatus} />
      <div className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[900px] gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(kpis.length, 1)}, minmax(0, 1fr))` }}>
            {kpis.map((item) => (
              <KpiTile
                key={item.label}
                label={item.label}
                value={item.value}
                hint={item.hint}
                icon={getManagerKpiIcon(item.label)}
                tone={getManagerKpiTone(item.label, item.value)}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {attentionItems.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-2xl border border-black/5 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#1F1B2D]">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#C9956C]" />
                    <span className="truncate">{item.title}</span>
                  </div>
                  {item.severity ? (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getInsightSeverityClass(item.severity)}`}>
                      {getInsightSeverityLabel(item.severity)}
                    </span>
                  ) : null}
                </div>
                {item.reason ? <p className="mt-2 text-sm leading-5 text-[#6F6678]">{item.reason}</p> : null}
                {item.action ? (
                  <div className="mt-3 rounded-xl bg-[#F7F5F2] px-3 py-2 text-sm leading-5 text-[#1F1B2D]">
                    <div className="mb-1 text-xs text-[#6F6678]">建议动作</div>
                    {item.action}
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      </div>
    </CardShell>
  );
}

export function ReceptionDashboardCard({
  data,
  onQuickAction,
  onOperationResult,
}: {
  data: AppointmentCardData;
  onQuickAction: (action: string) => void;
  onOperationResult?: (data: OperationResultData) => void;
}) {
  type AppointmentItem = AppointmentCardData["items"][number];

  const [currentData, setCurrentData] = React.useState(data);
  const [creatingAppointment, setCreatingAppointment] = React.useState(false);
  const [editingAppointment, setEditingAppointment] = React.useState<AppointmentItem | null>(null);
  const [cancelingAppointment, setCancelingAppointment] = React.useState<AppointmentItem | null>(null);
  const [appointmentOptions, setAppointmentOptions] = React.useState<AppointmentEditOptions>({
    projects: [],
    beauticians: [],
  });
  const [createOptions, setCreateOptions] = React.useState<AppointmentCreateOptions>({
    customers: [],
    projects: [],
    beauticians: [],
  });
  const [createForm, setCreateForm] = React.useState({
    customerId: "",
    appointmentDate: getDefaultAppointmentDate(),
    appointmentSlot: "",
    projectId: "",
    beauticianId: "",
    duration: "60",
    remark: "",
  });
  const [editForm, setEditForm] = React.useState({
    appointmentDate: "",
    appointmentSlot: "",
    projectId: "",
    beauticianId: "",
    duration: "60",
    remark: "",
  });
  const [createAvailability, setCreateAvailability] = React.useState<TerminalReservationAvailability | null>(null);
  const [editAvailability, setEditAvailability] = React.useState<TerminalReservationAvailability | null>(null);
  const [createSlotsLoading, setCreateSlotsLoading] = React.useState(false);
  const [editSlotsLoading, setEditSlotsLoading] = React.useState(false);
  const [slotError, setSlotError] = React.useState<string | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [cashierShift, setCashierShift] = React.useState<TerminalCashierShift | null>(null);
  const [shiftLoading, setShiftLoading] = React.useState(false);
  const [shiftError, setShiftError] = React.useState<string | null>(null);
  const [openingCash, setOpeningCash] = React.useState("0");
  const [closingCash, setClosingCash] = React.useState("");
  const items = safeArray<AppointmentItem>(currentData.items);
  const [shiftRequired, setShiftRequired] = React.useState(() => isShiftRequired());
  const createSlotOptions = React.useMemo(
    () => getSlotOptionsFromAvailability(createAvailability, createForm.beauticianId, createForm.duration),
    [createAvailability, createForm.beauticianId, createForm.duration],
  );
  const editSlotOptions = React.useMemo(
    () => getSlotOptionsFromAvailability(editAvailability, editForm.beauticianId, editForm.duration),
    [editAvailability, editForm.beauticianId, editForm.duration],
  );

  React.useEffect(() => {
    setCurrentData(data);
  }, [data]);

  React.useEffect(() => {
    let mounted = true;
    refreshShiftRequired().then((required) => {
      if (mounted) setShiftRequired(required);
    });
    return () => {
      mounted = false;
    };
  }, [data.subtitle]);

  React.useEffect(() => {
    if (!shiftRequired) {
      setCashierShift(null);
      setShiftError(null);
      return;
    }
    let mounted = true;
    getCashierShiftStatus()
      .then((shift) => {
        if (mounted) setCashierShift(shift);
      })
      .catch((err) => {
        if (mounted) setShiftError(err instanceof Error ? err.message : "班次状态加载失败");
      });
    return () => {
      mounted = false;
    };
  }, [shiftRequired]);

  React.useEffect(() => {
    if (!creatingAppointment || !createForm.appointmentDate || !createForm.beauticianId) {
      setCreateAvailability(null);
      return;
    }

    let mounted = true;
    setCreateSlotsLoading(true);
    setSlotError(null);
    getTerminalReservationAvailability({
      date: createForm.appointmentDate,
      projectId: createForm.projectId ? Number(createForm.projectId) : undefined,
      beauticianId: Number(createForm.beauticianId),
      duration: Number(createForm.duration) || undefined,
    })
      .then((availability) => {
        if (!mounted) return;
        setCreateAvailability(availability);
        const slots = getSlotOptionsFromAvailability(availability, createForm.beauticianId, createForm.duration);
        setCreateForm((prev) => {
          const hasCurrent = slots.some((slot) => slot.available && slot.value === prev.appointmentSlot);
          return hasCurrent ? prev : { ...prev, appointmentSlot: slots.find((slot) => slot.available)?.value ?? "" };
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setCreateAvailability(null);
        setCreateForm((prev) => ({ ...prev, appointmentSlot: "" }));
        setSlotError(err instanceof Error ? err.message : "可预约时段加载失败");
      })
      .finally(() => {
        if (mounted) setCreateSlotsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [
    creatingAppointment,
    createForm.appointmentDate,
    createForm.beauticianId,
    createForm.projectId,
    createForm.duration,
  ]);

  React.useEffect(() => {
    if (!editingAppointment || !editForm.appointmentDate || !editForm.beauticianId) {
      setEditAvailability(null);
      return;
    }

    let mounted = true;
    setEditSlotsLoading(true);
    setSlotError(null);
    getTerminalReservationAvailability({
      date: editForm.appointmentDate,
      projectId: editForm.projectId ? Number(editForm.projectId) : undefined,
      beauticianId: Number(editForm.beauticianId),
      duration: Number(editForm.duration) || undefined,
    })
      .then((availability) => {
        if (!mounted) return;
        setEditAvailability(availability);
        const slots = getSlotOptionsFromAvailability(availability, editForm.beauticianId, editForm.duration);
        setEditForm((prev) => {
          const hasCurrent = slots.some((slot) => slot.value === prev.appointmentSlot);
          return hasCurrent ? prev : { ...prev, appointmentSlot: slots.find((slot) => slot.available)?.value ?? "" };
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setEditAvailability(null);
        setSlotError(err instanceof Error ? err.message : "可预约时段加载失败");
      })
      .finally(() => {
        if (mounted) setEditSlotsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [
    editingAppointment,
    editForm.appointmentDate,
    editForm.beauticianId,
    editForm.projectId,
    editForm.duration,
  ]);

  const refreshAppointments = async () => {
    try {
      setCurrentData(await getAppointments());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "预约数据刷新失败，请稍后重试");
    }
  };

  const appendResultAndRefresh = async (result: OperationResultData) => {
    onOperationResult?.(result);
    await refreshAppointments();
  };

  const handleOpenShift = async () => {
    setShiftLoading(true);
    setShiftError(null);
    try {
      const shift = await openCashierShift(Number(openingCash) || 0);
      setCashierShift(shift);
      setClosingCash("");
    } catch (err) {
      setShiftError(err instanceof Error ? err.message : "开班失败，请稍后重试");
    } finally {
      setShiftLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!cashierShift?.id) return;
    setShiftLoading(true);
    setShiftError(null);
    try {
      const shift = await closeCashierShift(cashierShift.id, Number(closingCash) || 0);
      setCashierShift(shift);
      setClosingCash("");
    } catch (err) {
      setShiftError(err instanceof Error ? err.message : "关班失败，请稍后重试");
    } finally {
      setShiftLoading(false);
    }
  };

  const openCreateDialog = async () => {
    setLocalError(null);
    setCreatingAppointment(true);
    setCreateForm({
      customerId: "",
      appointmentDate: getDefaultAppointmentDate(),
      appointmentSlot: "",
      projectId: "",
      beauticianId: "",
      duration: "60",
      remark: "",
    });
    setCreateAvailability(null);
    setSlotError(null);
    setOptionsLoading(true);
    try {
      const options = await getAppointmentCreateOptions();
      setCreateOptions(options);
    } catch (err) {
      setCreateOptions({ customers: [], projects: [], beauticians: [] });
      setLocalError(err instanceof Error ? err.message : "新增预约可选数据加载失败");
    } finally {
      setOptionsLoading(false);
    }
  };

  const handleCreateAppointment = async () => {
    if (!createForm.customerId || !createForm.appointmentDate || !createForm.appointmentSlot || !createForm.projectId || !createForm.beauticianId) {
      setLocalError("请完善客户、预约日期、预约时间段、项目和美容师");
      return;
    }
    const selectedSlot = createSlotOptions.find((slot) => slot.value === createForm.appointmentSlot);
    if (selectedSlot && !selectedSlot.available) {
      setLocalError(selectedSlot.reason || "请选择可预约时间段");
      return;
    }
    setActionLoading("create");
    setLocalError(null);
    try {
      const result = await createAppointmentFromTerminal({
        customerId: Number(createForm.customerId),
        appointmentTime: toApiDateTimeFromSlot(createForm.appointmentDate, createForm.appointmentSlot),
        projectId: Number(createForm.projectId),
        beauticianId: Number(createForm.beauticianId),
        duration: Number(createForm.duration) || 60,
        remark: createForm.remark.trim() || undefined,
      });
      setCreatingAppointment(false);
      await appendResultAndRefresh(result);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "新增预约失败，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const openEditDialog = async (item: AppointmentItem) => {
    setLocalError(null);
    setEditingAppointment(item);
    setEditAvailability(null);
    setSlotError(null);
    setEditForm({
      appointmentDate: toAppointmentDateValue(item.appointmentTime),
      appointmentSlot: toAppointmentSlotValue(item.appointmentTime),
      projectId: item.projectId ? String(item.projectId) : "",
      beauticianId: item.beauticianId ? String(item.beauticianId) : "",
      duration: String(item.duration || 60),
      remark: item.remark ?? "",
    });
    setOptionsLoading(true);
    try {
      const options = await getAppointmentEditOptions();
      const matchedProject = options.projects.find((project) => project.id === item.projectId || project.name === item.projectName);
      const matchedBeautician = options.beauticians.find(
        (beautician) => beautician.id === item.beauticianId || beautician.name === item.beauticianName,
      );
      setAppointmentOptions(options);
      setEditForm((prev) => ({
        ...prev,
        projectId: matchedProject ? String(matchedProject.id) : prev.projectId,
        beauticianId: matchedBeautician ? String(matchedBeautician.id) : prev.beauticianId,
        duration: String(matchedProject?.duration ?? item.duration ?? 60),
      }));
    } catch (err) {
      setAppointmentOptions({ projects: [], beauticians: [] });
      setLocalError(err instanceof Error ? err.message : "预约可选项目加载失败");
    } finally {
      setOptionsLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingAppointment) return;
    if (!editForm.appointmentDate || !editForm.appointmentSlot) {
      setLocalError("请选择预约日期和时间段");
      return;
    }
    const selectedSlot = editSlotOptions.find((slot) => slot.value === editForm.appointmentSlot);
    const originalSlot = toAppointmentSlotValue(editingAppointment.appointmentTime);
    if (selectedSlot && !selectedSlot.available && selectedSlot.value !== originalSlot) {
      setLocalError(selectedSlot.reason || "请选择可预约时间段");
      return;
    }
    const project = appointmentOptions.projects.find((item) => String(item.id) === editForm.projectId);
    const beautician = appointmentOptions.beauticians.find((item) => String(item.id) === editForm.beauticianId);
    setActionLoading(`edit:${editingAppointment.id}`);
    setLocalError(null);
    try {
      const result = await updateAppointmentFromTerminal(editingAppointment.id, {
        appointmentTime: toApiDateTimeFromSlot(editForm.appointmentDate, editForm.appointmentSlot),
        projectId: project?.id ?? editingAppointment.projectId,
        projectName: project?.name ?? editingAppointment.projectName,
        beauticianId: beautician?.id ?? editingAppointment.beauticianId,
        beauticianName: beautician?.name ?? editingAppointment.beauticianName,
        duration: Number(editForm.duration) || editingAppointment.duration || 60,
        remark: editForm.remark.trim() || undefined,
      });
      setEditingAppointment(null);
      await appendResultAndRefresh(result);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "预约修改失败，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirm = async (item: AppointmentItem) => {
    setActionLoading(`confirm:${item.id}`);
    setLocalError(null);
    try {
      await appendResultAndRefresh(await confirmAppointmentFromTerminal(item.id));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "预约确认失败，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckIn = async (item: AppointmentItem) => {
    setActionLoading(`checkin:${item.id}`);
    setLocalError(null);
    try {
      await appendResultAndRefresh(await checkInAppointmentFromTerminal(item.id));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "到店确认失败，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelingAppointment) return;
    setActionLoading(`cancel:${cancelingAppointment.id}`);
    setLocalError(null);
    try {
      const result = await cancelAppointmentFromTerminal(cancelingAppointment.id, cancelReason.trim() || undefined);
      setCancelingAppointment(null);
      setCancelReason("");
      await appendResultAndRefresh(result);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "预约取消失败，请稍后重试");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <DataUnavailableNotice status={data.apiStatus} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#1F1B2D]">今日预约</h2>
          <p className="mt-1 text-sm text-[#6F6678]">{data.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm font-medium text-[#6F6678]">共 {items.length} 条记录</span>
          <button
            type="button"
            onClick={() => void openCreateDialog()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            添加预约
          </button>
        </div>
      </div>

      {shiftRequired ? (
        <CashierShiftPanel
          shift={cashierShift}
          openingCash={openingCash}
          closingCash={closingCash}
          loading={shiftLoading}
          error={shiftError}
          onOpeningCashChange={setOpeningCash}
          onClosingCashChange={setClosingCash}
          onOpen={() => void handleOpenShift()}
          onClose={() => void handleCloseShift()}
        />
      ) : null}

      {localError ? (
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {localError}
        </div>
      ) : null}

      {items.length ? (
        <div className="mt-5 flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white shadow-sm">
                    <span className="text-xl font-bold text-[#2D1B69]">{getAppointmentClock(item)}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold leading-tight text-[#1F1B2D]">{item.customerName}</div>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#2D1B69]">
                        {item.memberLevel}
                      </span>
                      <AppointmentStatusBadge status={item.status} text={item.statusText} />
                    </div>

                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#6F6678]">
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-0.5">
                        <Scissors className="h-3.5 w-3.5" />
                        {item.beauticianName}
                      </span>
                      <span className="shrink-0">{item.customerPhone}</span>
                      <span className="shrink-0">{item.duration} 分钟</span>
                      <span className="min-w-[120px] flex-1 truncate font-medium text-[#6F6678]">{item.projectName}</span>
                    </div>

                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 lg:w-[220px] lg:shrink-0">
                  <AppointmentActionButton
                    label="修改"
                    icon={Clock3}
                    disabled={!canEditAppointment(item.status)}
                    loading={actionLoading === `edit:${item.id}`}
                    onClick={() => void openEditDialog(item)}
                  />
                  <AppointmentActionButton
                    label="确认"
                    icon={CalendarCheck}
                    disabled={!canConfirmAppointment(item.status)}
                    loading={actionLoading === `confirm:${item.id}`}
                    onClick={() => void handleConfirm(item)}
                  />
                  <AppointmentActionButton
                    label="取消"
                    icon={X}
                    variant="danger"
                    disabled={!canCancelAppointment(item.status)}
                    loading={actionLoading === `cancel:${item.id}`}
                    onClick={() => {
                      setLocalError(null);
                      setCancelingAppointment(item);
                    }}
                  />
                  <AppointmentActionButton
                    label="到店"
                    icon={CheckCircle2}
                    variant="gold"
                    disabled={!canCheckInAppointment(item.status)}
                    loading={actionLoading === `checkin:${item.id}`}
                    onClick={() => void handleCheckIn(item)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-black/10 bg-[#F7F5F2] p-6 text-center text-sm text-[#6F6678]">
          暂无今日预约，可通过“添加预约”创建新的到店安排。
        </div>
      )}

      <Dialog
        open={creatingAppointment}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setCreatingAppointment(false);
        }}
      >
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>添加预约</DialogTitle>
            <DialogDescription>选择客户、预约时间、项目和美容师，提交后写回 Ami_Core 预约模块。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              客户
              <select
                value={createForm.customerId}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, customerId: event.target.value }))}
                disabled={optionsLoading || !createOptions.customers.length}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69] disabled:bg-[#F7F5F2]"
              >
                <option value="">{optionsLoading ? "正在加载客户" : "请选择客户"}</option>
                {createOptions.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · {customer.phone || "未留手机号"} · {customer.memberLevel}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                预约日期
                <input
                  type="date"
                  value={createForm.appointmentDate}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, appointmentDate: event.target.value, appointmentSlot: "" }))}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                预约时间段
                <select
                  value={createForm.appointmentSlot}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, appointmentSlot: event.target.value }))}
                  disabled={!createForm.beauticianId || createSlotsLoading || !createSlotOptions.length}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69] disabled:bg-[#F7F5F2]"
                >
                  <option value="">
                    {!createForm.beauticianId
                      ? "请先选择美容师"
                      : createSlotsLoading
                        ? "正在加载排班时段"
                        : createSlotOptions.length
                          ? "请选择时间段"
                          : "当前无可用时段"}
                  </option>
                  {createSlotOptions.map((slot) => (
                    <option key={slot.value} value={slot.value} disabled={!slot.available}>
                      {slot.label}
                      {!slot.available && slot.reason ? ` · ${slot.reason}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                项目
                <select
                  value={createForm.projectId}
                  onChange={(event) => {
                    const nextProject = createOptions.projects.find((project) => String(project.id) === event.target.value);
                    setCreateForm((prev) => ({
                      ...prev,
                      projectId: event.target.value,
                      duration: String(nextProject?.duration ?? prev.duration),
                    }));
                  }}
                  disabled={optionsLoading || !createOptions.projects.length}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69] disabled:bg-[#F7F5F2]"
                >
                  <option value="">{optionsLoading ? "正在加载项目" : "请选择项目"}</option>
                  {createOptions.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} · {project.duration} 分钟
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                美容师
                <select
                  value={createForm.beauticianId}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, beauticianId: event.target.value }))}
                  disabled={optionsLoading || !createOptions.beauticians.length}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69] disabled:bg-[#F7F5F2]"
                >
                  <option value="">{optionsLoading ? "正在加载美容师" : "请选择美容师"}</option>
                  {createOptions.beauticians.map((beautician) => (
                    <option key={beautician.id} value={beautician.id}>
                      {beautician.name} · {beautician.level}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              服务时长（分钟）
              <input
                type="number"
                min={15}
                step={5}
                value={createForm.duration}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, duration: event.target.value }))}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              备注
              <textarea
                value={createForm.remark}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, remark: event.target.value }))}
                rows={3}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#2D1B69]"
                placeholder="可填写客户需求、来源、到店提醒或服务注意事项"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreatingAppointment(false)}
              disabled={Boolean(actionLoading)}
              className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D] disabled:opacity-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => void handleCreateAppointment()}
              disabled={Boolean(actionLoading) || optionsLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {actionLoading === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认添加
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingAppointment)}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setEditingAppointment(null);
        }}
      >
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>修改预约</DialogTitle>
            <DialogDescription>调整预约时间、项目、美容师、服务时长和备注。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-xl bg-[#F7F5F2] p-3 text-sm text-[#6F6678]">
              {editingAppointment?.customerName} · {editingAppointment?.customerPhone} · {editingAppointment?.projectName}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                预约日期
                <input
                  type="date"
                  value={editForm.appointmentDate}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, appointmentDate: event.target.value, appointmentSlot: "" }))}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                预约时间段
                <select
                  value={editForm.appointmentSlot}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, appointmentSlot: event.target.value }))}
                  disabled={!editForm.beauticianId || editSlotsLoading || !editSlotOptions.length}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69] disabled:bg-[#F7F5F2]"
                >
                  <option value="">
                    {!editForm.beauticianId
                      ? "请先选择美容师"
                      : editSlotsLoading
                        ? "正在加载排班时段"
                        : editSlotOptions.length
                          ? "请选择时间段"
                          : "当前无可用时段"}
                  </option>
                  {editSlotOptions.map((slot) => {
                    const originalSlot = editingAppointment ? toAppointmentSlotValue(editingAppointment.appointmentTime) : "";
                    return (
                      <option key={slot.value} value={slot.value} disabled={!slot.available && slot.value !== originalSlot}>
                        {slot.label}
                        {!slot.available && slot.reason ? ` · ${slot.reason}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                项目
                <select
                  value={editForm.projectId}
                  onChange={(event) => {
                    const nextProject = appointmentOptions.projects.find((project) => String(project.id) === event.target.value);
                    setEditForm((prev) => ({
                      ...prev,
                      projectId: event.target.value,
                      duration: String(nextProject?.duration ?? prev.duration),
                    }));
                  }}
                  disabled={optionsLoading || !appointmentOptions.projects.length}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69] disabled:bg-[#F7F5F2]"
                >
                  <option value="">{optionsLoading ? "正在加载项目" : "保留当前项目"}</option>
                  {appointmentOptions.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
                美容师
                <select
                  value={editForm.beauticianId}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, beauticianId: event.target.value }))}
                  disabled={optionsLoading || !appointmentOptions.beauticians.length}
                  className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69] disabled:bg-[#F7F5F2]"
                >
                  <option value="">{optionsLoading ? "正在加载美容师" : "保留当前美容师"}</option>
                  {appointmentOptions.beauticians.map((beautician) => (
                    <option key={beautician.id} value={beautician.id}>
                      {beautician.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              服务时长（分钟）
              <input
                type="number"
                min={15}
                step={5}
                value={editForm.duration}
                onChange={(event) => setEditForm((prev) => ({ ...prev, duration: event.target.value }))}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              备注
              <textarea
                value={editForm.remark}
                onChange={(event) => setEditForm((prev) => ({ ...prev, remark: event.target.value }))}
                rows={3}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#2D1B69]"
                placeholder="可填写客户需求、改期原因或服务注意事项"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditingAppointment(null)}
              disabled={Boolean(actionLoading)}
              className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D] disabled:opacity-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => void handleSaveEdit()}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {actionLoading?.startsWith("edit:") ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存修改
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelingAppointment)}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setCancelingAppointment(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>取消预约</DialogTitle>
            <DialogDescription>填写取消原因后，预约状态会同步写回 Ami_Core。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="rounded-xl bg-[#F7F5F2] p-3 text-sm text-[#6F6678]">
              {cancelingAppointment?.customerName} · {cancelingAppointment?.projectName} · {cancelingAppointment?.displayTime}
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              取消原因
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                rows={3}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#2D1B69]"
                placeholder="例如：客户临时有事、改约其他时间"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCancelingAppointment(null)}
              disabled={Boolean(actionLoading)}
              className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D] disabled:opacity-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {actionLoading?.startsWith("cancel:") ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认取消
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BeauticianDashboardCard({
  data,
  focus,
}: {
  data: StaffScheduleCardData;
  focus?: "schedule" | "commission";
}) {
  const resolvedWeekStart = data.weekStart ?? getTerminalCurrentWeekStart();
  const dayOptions = getTerminalDayOptions(resolvedWeekStart);
  const [activeDayIndex, setActiveDayIndex] = React.useState(0);
  const [weekSlots, setWeekSlots] = React.useState<ScheduleSlot[][]>(() => normalizeTerminalWeekSlots(data.weekSlots));
  const [savingSlot, setSavingSlot] = React.useState<string | null>(null);
  const [scheduleError, setScheduleError] = React.useState<string | null>(null);
  const [commissionExpanded, setCommissionExpanded] = React.useState(focus === "commission");
  const [commissionLoading, setCommissionLoading] = React.useState(false);
  const [commissionError, setCommissionError] = React.useState<string | null>(null);
  const [commissionDetail, setCommissionDetail] = React.useState(data.commission);
  const activeDay = dayOptions[activeDayIndex] ?? dayOptions[0];
  const activeSlots = activeDay.dayIndex >= 0 ? (weekSlots[activeDay.dayIndex] ?? []) : [];
  const commission = commissionDetail ?? data.commission;
  const quality = data.quality;
  const displayedCommissionRecords = commissionExpanded ? safeArray(commission?.monthRecords ?? commission?.recentRecords) : safeArray(commission?.recentRecords);
  const showSchedule = focus !== "commission";
  const showCommission = focus !== "schedule";
  const showQuality = !focus && Boolean(quality);
  const dashboardTitle = focus === "commission" ? "我的提成" : focus === "schedule" ? "我的预约" : data.title;

  React.useEffect(() => {
    setWeekSlots(normalizeTerminalWeekSlots(data.weekSlots));
    setScheduleError(null);
  }, [data.beautician.id, data.weekSlots]);

  React.useEffect(() => {
    setCommissionDetail(data.commission);
    setCommissionError(null);
  }, [data.beautician.id, data.commission]);

  React.useEffect(() => {
    if (focus === "commission") setCommissionExpanded(true);
  }, [focus]);

  React.useEffect(() => {
    if (!commissionExpanded || !data.beautician.id) return;
    if (safeArray(commissionDetail?.monthRecords).length > safeArray(data.commission?.recentRecords).length) return;
    let mounted = true;
    setCommissionLoading(true);
    setCommissionError(null);
    getTerminalBeauticianCommission(data.beautician.id, "month", 50)
      .then((next) => {
        if (mounted) setCommissionDetail(next);
      })
      .catch((error) => {
        if (mounted) setCommissionError(error instanceof Error ? error.message : "提成明细加载失败");
      })
      .finally(() => {
        if (mounted) setCommissionLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [commissionExpanded, commissionDetail?.monthRecords, data.beautician.id, data.commission?.recentRecords]);

  const handleDayChange = (index: number) => {
    setActiveDayIndex(index);
  };

  const handleSlotStatusChange = async (
    dayIndex: number,
    slot: TerminalDisplaySlot,
    status: TerminalEditableScheduleStatus,
  ) => {
    if (dayIndex < 0) {
      setScheduleError("当前日期不在本周排班范围内，暂时无法保存。");
      return;
    }
    const key = getTerminalSlotKey(data.beautician.id, dayIndex, slot);
    const previousSlots = normalizeTerminalWeekSlots(weekSlots);
    const nextSlots = normalizeTerminalWeekSlots(weekSlots);
    nextSlots[dayIndex] = setTerminalDisplaySlotStatus(nextSlots[dayIndex] ?? [], slot, status);

    setSavingSlot(key);
    setScheduleError(null);
    setWeekSlots(nextSlots);

    try {
      await saveSchedule({ beauticianId: data.beautician.id, weekStart: resolvedWeekStart, slots: nextSlots });
      invalidateTerminalScheduleCaches();
    } catch (error) {
      console.warn("保存终端排班失败", error);
      setWeekSlots(previousSlots);
      setScheduleError("排班保存失败，已恢复为保存前状态。");
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <CardShell title={dashboardTitle} subtitle={data.subtitle}>
      <DataUnavailableNotice status={data.apiStatus} />
      {showQuality && quality ? (
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#1F1B2D]">服务质量与复购贡献</div>
              <div className="mt-1 text-xs text-[#6F6678]">按本人本月服务任务、服务记录和提成来源汇总</div>
            </div>
            <div className="rounded-full bg-[#F7F5F2] px-3 py-1 text-xs font-medium text-[#6F6678]">
              完成 {quality.completedCount}/{quality.activeTaskCount}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-[#F7F5F2] p-3">
              <div className="text-xs text-[#6F6678]">完成率</div>
              <div className="mt-1 text-lg font-bold text-[#1F1B2D]">{quality.completionRate}%</div>
            </div>
            <div className="rounded-xl bg-[#F7F5F2] p-3">
              <div className="text-xs text-[#6F6678]">记录完整率</div>
              <div className="mt-1 text-lg font-bold text-[#1F1B2D]">{quality.recordRate}%</div>
            </div>
            <div className="rounded-xl bg-[#F7F5F2] p-3">
              <div className="text-xs text-[#6F6678]">复购客户</div>
              <div className="mt-1 text-lg font-bold text-[#1F1B2D]">{quality.repurchaseOpportunityCount} 位</div>
            </div>
            <div className="rounded-xl bg-[#F7F5F2] p-3">
              <div className="text-xs text-[#6F6678]">关联收入</div>
              <div className="mt-1 text-lg font-bold text-[#1F1B2D]">{formatTerminalMoney(quality.revenueContributionAmount)}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-black/5 bg-[#FAF9F7] p-3">
              <div className="mb-2 text-xs font-medium text-[#6F6678]">分析结论</div>
              <ul className="space-y-1 text-sm leading-6 text-[#1F1B2D]">
                {safeArray(quality.highlights).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[#C9956C]/20 bg-[#C9956C]/10 p-3">
              <div className="mb-2 text-xs font-medium text-[#A8764D]">下步建议</div>
              <ul className="space-y-1 text-sm leading-6 text-[#1F1B2D]">
                {safeArray(quality.suggestions).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {showCommission ? (
      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[#1F1B2D]">我的提成</div>
            <div className="mt-1 text-xs text-[#6F6678]">包含待确认与已确认流水</div>
          </div>
          <button
            type="button"
            onClick={() => setCommissionExpanded((current) => !current)}
            className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            {commissionExpanded ? "收起月度明细" : `展开本月 ${commission?.monthCount ?? 0} 笔`}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="text-xs text-emerald-700">今日提成</div>
            <div className="mt-2 text-xl font-bold text-[#1F1B2D]">{formatTerminalMoney(commission?.todayAmount)}</div>
            <div className="mt-1 text-xs text-[#6F6678]">{commission?.todayCount ?? 0} 笔</div>
          </div>
          <div className="rounded-2xl border border-[#2D1B69]/10 bg-[#2D1B69]/6 p-4">
            <div className="text-xs text-[#2D1B69]">本月累计</div>
            <div className="mt-2 text-xl font-bold text-[#1F1B2D]">{formatTerminalMoney(commission?.monthAmount)}</div>
            <div className="mt-1 text-xs text-[#6F6678]">待确认 {formatTerminalMoney(commission?.monthPendingAmount)}</div>
          </div>
          <div className="rounded-2xl border border-[#C9956C]/20 bg-[#C9956C]/10 p-4">
            <div className="text-xs text-[#A8764D]">已确认/结算</div>
            <div className="mt-2 text-xl font-bold text-[#1F1B2D]">{formatTerminalMoney(commission?.monthConfirmedAmount)}</div>
            <div className="mt-1 text-xs text-[#6F6678]">实时随订单更新</div>
          </div>
        </div>
        {safeArray(commission?.breakdown).length ? (
          <div className="mt-4 rounded-2xl border border-black/5 bg-[#FAF9F7] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[#1F1B2D]">本月构成</div>
              <div className="text-xs text-[#6F6678]">按项目、商品、开卡、充值拆分</div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {safeArray(commission?.breakdown).map((item) => (
                <div key={item.type} className="rounded-xl border border-black/5 bg-white px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-[#1F1B2D]">{item.label || item.type}</div>
                    <div className="text-sm font-semibold text-[#1F1B2D]">{formatTerminalMoney(item.amount)}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6F6678]">
                    <span>{item.count} 笔</span>
                    <span>来源 {formatTerminalMoney(item.sourceAmount)}</span>
                    <span>待确认 {formatTerminalMoney(item.pendingAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {commissionLoading ? (
          <div className="mt-4 rounded-2xl border border-black/5 bg-[#FAF9F7] px-4 py-3 text-sm text-[#6F6678]">
            正在加载完整月度提成明细...
          </div>
        ) : null}
        {commissionError ? (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {commissionError}
          </div>
        ) : null}
        {displayedCommissionRecords.length ? (
          <div className="mt-4 divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5">
            {displayedCommissionRecords.map((record) => (
              <div key={record.id} className="flex items-center justify-between gap-3 bg-[#FAF9F7] px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-[#1F1B2D]">{record.orderItem?.name ?? record.ruleName ?? record.type}</div>
                  <div className="text-xs text-[#6F6678]">
                    {record.orderNo ?? "未关联订单"} · {formatBusinessQueryValue("status", record.status)}
                  </div>
                </div>
                <div className="font-semibold text-[#1F1B2D]">{formatTerminalMoney(record.amount)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}

      {showSchedule ? (
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-[#F7F5F2] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[#1F1B2D]">{activeDay.label}排班</div>
            <div className="text-xs text-[#6F6678]">{activeDay.name} {activeDay.date}</div>
          </div>
          <TerminalScheduleDayTabs options={dayOptions} activeIndex={activeDayIndex} onChange={handleDayChange} />
        </div>
        {scheduleError ? <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-600">{scheduleError}</div> : null}
        {activeSlots.length ? (
          <div className="grid gap-2 p-4 md:grid-cols-3">
            {TERMINAL_DISPLAY_SLOTS.map((slot) => {
              const status = getTerminalDisplaySlotStatus(activeSlots, activeDay, slot);
              const key = getTerminalSlotKey(data.beautician.id, activeDay.dayIndex, slot);

              return (
                <div key={`${data.beautician.id}-${activeDay.fullDate}-${slot.label}`} className="bg-[#FAF9F7] p-1">
                  <TerminalScheduleSlotButton
                    slot={slot}
                    status={status}
                    saving={savingSlot === key}
                    onSelect={(nextStatus) => void handleSlotStatusChange(activeDay.dayIndex, slot, nextStatus)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4">
            <div className="rounded-2xl border border-dashed border-black/10 bg-[#F7F5F2] px-4 py-6 text-center text-sm text-[#6F6678]">
              暂无排班数据
            </div>
          </div>
        )}
      </div>
      ) : null}
    </CardShell>
  );
}

export function StaffPerformanceCard({
  items,
}: {
  items: StaffScheduleCardData[];
}) {
  const staffItems = safeArray(items);
  const resolvedWeekStart = staffItems.find((item) => item.weekStart)?.weekStart ?? getTerminalCurrentWeekStart();
  const dayOptions = getTerminalDayOptions(resolvedWeekStart);
  const [activeDayIndex, setActiveDayIndex] = React.useState(0);
  const [scheduleByBeautician, setScheduleByBeautician] = React.useState<Record<number, ScheduleSlot[][]>>(() =>
    buildTerminalScheduleMap(staffItems),
  );
  const [savingSlot, setSavingSlot] = React.useState<string | null>(null);
  const [scheduleError, setScheduleError] = React.useState<string | null>(null);
  const activeDay = dayOptions[activeDayIndex] ?? dayOptions[0];

  React.useEffect(() => {
    setScheduleByBeautician(buildTerminalScheduleMap(staffItems));
    setScheduleError(null);
  }, [items]);

  const handleDayChange = (index: number) => {
    setActiveDayIndex(index);
  };

  const handleSlotStatusChange = async (
    item: StaffScheduleCardData,
    dayIndex: number,
    slot: TerminalDisplaySlot,
    status: TerminalEditableScheduleStatus,
  ) => {
    const targetWeekStart = item.weekStart ?? resolvedWeekStart;
    if (dayIndex < 0) {
      setScheduleError("当前日期不在本周排班范围内，暂时无法保存。");
      return;
    }

    const beauticianId = item.beautician.id;
    const key = getTerminalSlotKey(beauticianId, dayIndex, slot);
    const previousSlots = normalizeTerminalWeekSlots(scheduleByBeautician[beauticianId] ?? item.weekSlots);
    const nextSlots = normalizeTerminalWeekSlots(scheduleByBeautician[beauticianId] ?? item.weekSlots);
    nextSlots[dayIndex] = setTerminalDisplaySlotStatus(nextSlots[dayIndex] ?? [], slot, status);

    setSavingSlot(key);
    setScheduleError(null);
    setScheduleByBeautician((current) => ({ ...current, [beauticianId]: nextSlots }));

    try {
      await saveSchedule({ beauticianId, weekStart: targetWeekStart, slots: nextSlots });
      invalidateTerminalScheduleCaches();
    } catch (error) {
      console.warn("保存终端排班失败", error);
      setScheduleByBeautician((current) => ({ ...current, [beauticianId]: previousSlots }));
      setScheduleError("排班保存失败，已恢复为保存前状态。");
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <CardShell title="员工排班" subtitle="直接读取管理端门店排班模块">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
        <div>
          <div className="text-sm font-semibold text-[#1F1B2D]">{activeDay.label}排班</div>
          <div className="mt-1 text-xs text-[#6F6678]">{activeDay.name} {activeDay.date} · 仅展示选中日期</div>
        </div>
        <TerminalScheduleDayTabs options={dayOptions} activeIndex={activeDayIndex} onChange={handleDayChange} />
      </div>

      {scheduleError ? <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{scheduleError}</div> : null}

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 text-xs text-[#6F6678]">
        <span className="font-medium text-[#1F1B2D]">状态说明</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-50" />正常</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-blue-200 bg-blue-50" />已预约</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" />忙碌</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-rose-200 bg-rose-50" />请假</span>
      </div>

      <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-black/5 bg-white">
        <div className="max-w-full overflow-x-auto pb-2">
          <div
            className="grid"
            style={{
              minWidth: `${Math.max(680, 112 + staffItems.length * 124)}px`,
              gridTemplateColumns: `112px repeat(${Math.max(staffItems.length, 1)}, minmax(124px, 1fr))`,
            }}
          >
            <div className="border-b border-r border-black/5 bg-[#F7F5F2] px-2 py-3 text-center text-xs font-medium text-[#6F6678]">
              时段
            </div>
            {staffItems.map((item) => {
              const daySlots = scheduleByBeautician[item.beautician.id]?.[activeDay.dayIndex] ?? [];
              return (
                <div key={item.beautician.id} className="min-w-0 border-b border-r border-black/5 bg-[#F7F5F2] px-2 py-3 text-center">
                  <div className="truncate text-sm font-semibold text-[#1F1B2D]">{item.beautician.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-[#6F6678]">{item.beautician.level}</div>
                  <div className="mt-0.5 text-[11px] text-[#9B92A3]">占用 {getTerminalDayUtilization(daySlots)}</div>
                </div>
              );
            })}

            {TERMINAL_DISPLAY_SLOTS.map((slot) => (
              <React.Fragment key={`${activeDay.fullDate}-${slot.label}`}>
                <div className="border-b border-r border-black/5 bg-[#FAF9F7] px-2 py-3 text-center text-xs font-medium text-[#6F6678]">
                  {slot.label}
                </div>
                {staffItems.map((item) => {
                  const daySlots = scheduleByBeautician[item.beautician.id]?.[activeDay.dayIndex] ?? [];
                  const status = getTerminalDisplaySlotStatus(daySlots, activeDay, slot);
                  const key = getTerminalSlotKey(item.beautician.id, activeDay.dayIndex, slot);
                  return (
                    <div key={`${item.beautician.id}-${activeDay.fullDate}-${slot.label}`} className="min-w-0 border-b border-r border-black/5 bg-[#FAF9F7] p-1.5">
                      <TerminalScheduleSlotButton
                        slot={slot}
                        status={status}
                        saving={savingSlot === key}
                        onSelect={(nextStatus) => void handleSlotStatusChange(item, activeDay.dayIndex, slot, nextStatus)}
                      />
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </CardShell>
  );
}

const followUpStatusLabels: Record<string, string> = {
  pending: "待处理",
  in_progress: "跟进中",
  completed: "已完成",
  cancelled: "已取消",
  expired: "已逾期",
};

const followUpPriorityLabels: Record<string, string> = {
  urgent: "高优先级",
  recommended: "建议跟进",
  opportunity: "机会客户",
};

const followUpResultOptions = [
  { value: "contacted", label: "已联系" },
  { value: "booked", label: "已预约" },
  { value: "not_reached", label: "未接通" },
  { value: "refused", label: "客户拒绝" },
  { value: "converted", label: "已成交" },
];

function formatFollowUpDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getFollowUpStatusLabel(status?: string) {
  return followUpStatusLabels[status ?? ""] ?? status ?? "待处理";
}

function getFollowUpPriorityLabel(priority?: string) {
  return followUpPriorityLabels[priority ?? ""] ?? priority ?? "普通";
}

function getFollowUpStatusClass(status?: string) {
  if (status === "expired") return "bg-rose-50 text-rose-600";
  if (status === "in_progress") return "bg-amber-50 text-amber-700";
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  return "bg-[#2D1B69]/6 text-[#2D1B69]";
}

export function FollowUpTasksCard({ data }: { data: FollowUpTasksCardData }) {
  const [items, setItems] = React.useState<TerminalFollowUpTask[]>(() => safeArray(data.items));
  const [updatingTaskIds, setUpdatingTaskIds] = React.useState<Set<number>>(new Set());
  const [completionTask, setCompletionTask] = React.useState<TerminalFollowUpTask | null>(null);
  const [completionResultType, setCompletionResultType] = React.useState("contacted");
  const [completionNote, setCompletionNote] = React.useState("");

  React.useEffect(() => {
    setItems(safeArray(data.items));
  }, [data.items]);

  const patchTask = (updated: TerminalFollowUpTask) => {
    setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
  };

  const updateTask = async (task: TerminalFollowUpTask, action: "start" | "complete") => {
    setUpdatingTaskIds((current) => new Set(current).add(task.id));
    try {
      if (action === "start") {
        const updated = await startTerminalFollowUpTask(task.id);
        patchTask(updated);
        return;
      }

      const updated = await completeTerminalFollowUpTask(task.id, {
        resultType: completionResultType,
        result: completionNote || "已完成客户跟进",
        note: completionNote || "已完成客户跟进",
      });
      patchTask(updated);
      setCompletionTask(null);
      setCompletionResultType("contacted");
      setCompletionNote("");
    } finally {
      setUpdatingTaskIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  const activeCount = items.filter((item) => item.status !== "completed" && item.status !== "cancelled").length;

  return (
    <CardShell title={data.title} subtitle={data.subtitle}>
      <div className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
        <div className="text-sm font-medium text-[#1F1B2D]">{data.summary}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#6F6678]">
          <span>待处理 {data.stats?.pending ?? 0}</span>
          <span>跟进中 {data.stats?.inProgress ?? data.stats?.in_progress ?? 0}</span>
          <span>逾期 {data.stats?.expired ?? 0}</span>
          <span>已完成 {data.stats?.completed ?? 0}</span>
        </div>
      </div>

      {items.length ? (
        <div className="grid gap-3">
          {items.map((task) => (
            <div key={task.id} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-[#1F1B2D]">{task.customerName || `客户 #${task.customerId}`}</div>
                    {task.customerMemberLevel ? (
                      <span className="rounded-full bg-[#F7F5F2] px-2 py-0.5 text-[11px] text-[#6F6678]">{task.customerMemberLevel}</span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${getFollowUpStatusClass(task.status)}`}>
                      {getFollowUpStatusLabel(task.status)}
                    </span>
                    <span className="rounded-full bg-[#FFF7EA] px-2 py-0.5 text-[11px] text-[#B7791F]">
                      {getFollowUpPriorityLabel(task.priority)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-[#6F6678]">
                    {[task.customerPhone, task.assigneeUserName || task.assigneeBeauticianName, task.dueAt ? `截止 ${formatFollowUpDate(task.dueAt)}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <p className="mt-3 text-sm font-medium text-[#1F1B2D]">{task.title || "管理端下发的客户跟进任务"}</p>
                  {task.script ? <p className="mt-2 rounded-xl bg-[#F7F5F2] p-3 text-sm text-[#4B4360]">话术：{task.script}</p> : null}
                  {task.note ? <p className="mt-2 text-sm text-[#6F6678]">备注：{task.note}</p> : null}
                  {task.resultNote || task.result ? (
                    <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                      跟进情况：{task.resultNote || task.result}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updatingTaskIds.has(task.id) || task.status === "in_progress" || task.status === "completed"}
                    onClick={() => void updateTask(task, "start")}
                    className="rounded-full border border-[#2D1B69]/20 px-3 py-1.5 text-xs font-medium text-[#2D1B69] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingTaskIds.has(task.id) ? "处理中" : "开始处理"}
                  </button>
                  <button
                    type="button"
                    disabled={updatingTaskIds.has(task.id) || task.status === "completed" || task.status === "cancelled"}
                    onClick={() => {
                      setCompletionTask(task);
                      setCompletionResultType("contacted");
                      setCompletionNote("");
                    }}
                    className="rounded-full bg-[#2D1B69] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    填写跟进情况
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white p-6 text-center text-sm text-[#6F6678]">
          暂无管理端下发给当前账号的客户跟进任务。
        </div>
      )}

      {items.length && activeCount === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
          当前列表内的跟进任务均已完成。
        </div>
      ) : null}

      <Dialog open={Boolean(completionTask)} onOpenChange={(open) => !open && setCompletionTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>填写跟进情况</DialogTitle>
            <DialogDescription>
              {completionTask?.customerName || "客户"} 的跟进结果会回写管理端，用于任务闭环和营销复盘。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm text-[#6F6678]">
              跟进结果
              <select
                value={completionResultType}
                onChange={(event) => setCompletionResultType(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1F1B2D]"
              >
                {followUpResultOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-[#6F6678]">
              跟进情况
              <textarea
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                className="mt-2 min-h-24 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-[#1F1B2D]"
                placeholder="记录客户反馈、预约意向、拒绝原因或下次跟进时间"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCompletionTask(null)}
              className="rounded-full border border-black/10 px-4 py-2 text-sm text-[#6F6678]"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!completionTask || updatingTaskIds.has(completionTask.id)}
              onClick={() => completionTask && void updateTask(completionTask, "complete")}
              className="rounded-full bg-[#2D1B69] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              保存跟进情况
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardShell>
  );
}

export function CustomerGrowthCard({
  customers,
}: {
  customers: CustomerCardData[];
}) {
  const customerItems = safeArray(customers);
  const [updatingTaskIds, setUpdatingTaskIds] = React.useState<Set<number>>(new Set());
  const [completionTask, setCompletionTask] = React.useState<CustomerCardData | null>(null);
  const [completionResultType, setCompletionResultType] = React.useState("contacted");
  const [completionNote, setCompletionNote] = React.useState("");
  const updateFollowUpTask = async (taskId: number, action: "start" | "complete") => {
    setUpdatingTaskIds((current) => new Set(current).add(taskId));
    try {
      if (action === "start") {
        await startTerminalFollowUpTask(taskId);
      } else {
        await completeTerminalFollowUpTask(taskId, {
          resultType: completionResultType,
          result: completionNote || "终端已完成客户跟进",
        });
        setCompletionTask(null);
        setCompletionNote("");
        setCompletionResultType("contacted");
      }
    } finally {
      setUpdatingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };
  return (
    <CardShell title="客户增长与流失风险" subtitle="优先展示管理端下发任务，无任务时展示系统建议">
      <div className="flex flex-col gap-3">
        {customerItems.map((item) => (
          <div key={item.followUpTask ? `task-${item.followUpTask.id}` : `customer-${item.customer.id}`} className="rounded-2xl border border-black/5 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-[#1F1B2D]">{item.customer.name}</div>
                  <span className="rounded-full bg-[#2D1B69]/6 px-2 py-0.5 text-[11px] text-[#2D1B69]">{item.customer.memberLevel}</span>
                  {item.followUpTask && (
                    <span className="rounded-full bg-[#E8F6EF] px-2 py-0.5 text-[11px] text-[#157A4A]">
                      管理端下发
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[#6F6678]">{item.summary}</p>
              </div>
              {item.followUpTask && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={updatingTaskIds.has(item.followUpTask.id) || item.followUpTask.status === "in_progress"}
                    onClick={() => void updateFollowUpTask(item.followUpTask!.id, "start")}
                    className="rounded-full border border-[#2D1B69]/20 px-3 py-1 text-xs text-[#2D1B69] disabled:opacity-50"
                  >
                    开始处理
                  </button>
                  <button
                    type="button"
                    disabled={updatingTaskIds.has(item.followUpTask.id)}
                    onClick={() => {
                      setCompletionTask(item);
                      setCompletionResultType("contacted");
                      setCompletionNote("");
                    }}
                    className="rounded-full bg-[#2D1B69] px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    标记完成
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {safeArray(item.reasons).map((reason) => (
                <span key={reason} className="rounded-full bg-[#F7F5F2] px-3 py-1 text-xs text-[#6F6678]">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={Boolean(completionTask)} onOpenChange={(open) => !open && setCompletionTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>完成跟进</DialogTitle>
            <DialogDescription>
              {completionTask?.customer.name || '客户'} 的终端跟进结果会回写管理端，用于营销闭环复盘。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm text-[#6F6678]">
              跟进结果
              <select
                value={completionResultType}
                onChange={(event) => setCompletionResultType(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1F1B2D]"
              >
                <option value="contacted">已联系</option>
                <option value="booked">已预约</option>
                <option value="not_reached">未接通</option>
                <option value="refused">客户拒绝</option>
                <option value="converted">已成交</option>
              </select>
            </label>
            <label className="block text-sm text-[#6F6678]">
              跟进备注
              <textarea
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                className="mt-2 min-h-24 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-[#1F1B2D]"
                placeholder="记录客户反馈、预约意向或下次跟进时间"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCompletionTask(null)}
              className="rounded-full border border-black/10 px-4 py-2 text-sm text-[#6F6678]"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!completionTask?.followUpTask || updatingTaskIds.has(completionTask.followUpTask.id)}
              onClick={() => completionTask?.followUpTask && void updateFollowUpTask(completionTask.followUpTask.id, "complete")}
              className="rounded-full bg-[#2D1B69] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              确认完成
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardShell>
  );
}

export function InventoryAlertsCard({
  data,
}: {
  data: InventoryAlertCardData;
}) {
  const lowStock = safeArray(data.lowStock);
  const expiring = safeArray(data.expiring);
  return (
    <CardShell title={data.title} subtitle={data.subtitle}>
      <DataUnavailableNotice status={data.apiStatus} />
      <div className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-4 text-sm text-[#6F6678]">{data.summary}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1F1B2D]">
            <PackageCheck className="h-4 w-4 text-[#C9956C]" />
            低库存
          </div>
          <div className="flex flex-col gap-2">
            {lowStock.map((item) => (
              <div key={item.id} className="rounded-xl bg-[#F7F5F2] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-[#1F1B2D]">{item.productName}</div>
                  <div className="text-xs text-[#A8764D]">{formatBusinessQueryValue("status", item.status)}</div>
                </div>
                <div className="mt-1 text-xs text-[#6F6678]">当前 {item.currentStock} / 安全 {item.safetyStock}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1F1B2D]">
            <Clock3 className="h-4 w-4 text-[#2D1B69]" />
            临期与补货
          </div>
          <div className="flex flex-col gap-2">
            {expiring.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-xl bg-[#F7F5F2] p-3">
                <div className="text-sm font-medium text-[#1F1B2D]">{item.productName}</div>
                <div className="mt-1 text-xs text-[#6F6678]">{item.urgency} · {item.remainingDays} 天 · 建议 {item.suggestion}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CardShell>
  );
}

export function CustomerProfileCard({
  data,
}: {
  data: CustomerCardData;
}) {
  const customer = data.customer;
  const reasons = safeArray(data.reasons);
  const recentVisits = safeArray(data.recentVisits);
  return (
    <CardShell title="客户档案" subtitle="服务相关信息只保留必要内容">
      <div className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold text-[#1F1B2D]">{customer.name}</div>
            <p className="mt-1 text-sm text-[#6F6678]">
              {customer.phone} · {customer.memberLevel} · 最近到店 {formatBusinessQueryValue("lastVisitDate", customer.lastVisitDate)}
            </p>
          </div>
          <span className="rounded-full bg-[#2D1B69] px-3 py-1 text-xs text-white">{customer.source}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {reasons.map((reason) => (
            <div key={reason} className="rounded-2xl bg-white p-4">
              <div className="text-xs text-[#6F6678]">关键字段</div>
              <div className="mt-2 text-sm text-[#1F1B2D]">{reason}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-[#1F1B2D]">最近记录</div>
        <div className="flex flex-col gap-2">
          {recentVisits.map((item) => (
            <div key={item} className="rounded-xl bg-[#F7F5F2] px-3 py-2 text-sm text-[#6F6678]">
              {item}
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

export function BeauticianCustomerListCard({
  data,
  onViewDetail,
}: {
  data: BeauticianCustomerListData;
  onViewDetail: (action: string) => void;
}) {
  const groups = safeArray(data.groups);
  const items = safeArray(data.items);
  return (
    <CardShell title={data.title} subtitle={data.subtitle}>
      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[#1F1B2D]">客户标签统计</div>
            <div className="mt-1 text-xs text-[#6F6678]">{data.summary}</div>
          </div>
          <div className="rounded-full bg-[#2D1B69]/6 px-3 py-1 text-xs font-medium text-[#2D1B69]">
            共 {data.total} 位
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {groups.map((group) => (
            <div key={group.key} className="rounded-xl bg-[#F7F5F2] px-3 py-3">
              <div className="text-sm font-semibold text-[#1F1B2D]">{group.title}</div>
              <div className="mt-1 text-xl font-bold text-[#2D1B69]">{safeArray(group.items).length}</div>
              <div className="mt-1 text-xs leading-5 text-[#6F6678]">{group.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[#1F1B2D]">客户列表</div>
            <div className="mt-1 text-xs text-[#6F6678]">同一客户仅展示一次，通过标签标识稳定客户或最近到店周期。</div>
          </div>
          <span className="rounded-full bg-[#F7F5F2] px-3 py-1 text-xs text-[#6F6678]">{items.length} 位</span>
        </div>
        {items.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <div key={item.customer.id} className="rounded-2xl border border-black/5 bg-[#FAF9F7] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-[#1F1B2D]">{item.customer.name}</div>
                      <span className="rounded-full bg-[#2D1B69]/6 px-2 py-0.5 text-[11px] text-[#2D1B69]">
                        {item.groupLabel}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#6F6678]">
                        {item.customer.memberLevel}
                      </span>
                      {item.daysSinceVisit !== undefined ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                          {item.daysSinceVisit} 天未到店
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-[#6F6678]">{item.basicInfo}</div>
                    <div className="mt-1 text-xs leading-5 text-[#6F6678]">{item.memberSummary}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewDetail(item.detailAction)}
                    className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#2D1B69] shadow-sm transition hover:bg-[#2D1B69]/6"
                  >
                    查看详情
                  </button>
                </div>
                {safeArray(item.tags).length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {safeArray(item.tags).map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-2 py-1 text-[11px] text-[#6F6678]">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 rounded-xl border border-[#C9956C]/20 bg-[#C9956C]/10 px-3 py-2 text-xs leading-5 text-[#1F1B2D]">
                  <span className="font-medium text-[#A8764D]">服务建议：</span>
                  {item.serviceAdvice}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 bg-[#F7F5F2] px-4 py-6 text-center text-sm text-[#6F6678]">
            暂无当前美容师服务客户
          </div>
        )}
      </div>
    </CardShell>
  );
}

const BUSINESS_QUERY_FIELD_LABELS: Record<string, string> = {
  productName: "商品",
  sku: "SKU",
  opportunityType: "机会类型",
  fitScore: "匹配分",
  quantity: "销量",
  previousQuantity: "上期销量",
  growthRate: "增长率",
  growthRateText: "增长率",
  salesAmount: "销售额",
  salesAmountText: "销售额",
  currentStock: "当前库存",
  safetyStock: "安全库存",
  unit: "单位",
  salesQuantity: "近30天销量",
  expiringStock: "临期库存",
  daysToExpiry: "距到期天数",
  marginRate: "毛利率",
  marginRateText: "毛利率",
  grossMarginRate: "毛利率",
  grossMarginRateText: "毛利率",
  suggestedCampaign: "建议活动",
  customerId: "客户编号",
  customerName: "客户",
  customerPhone: "手机号",
  phone: "手机号",
  memberLevel: "会员",
  tags: "标签",
  priority: "跟进优先级",
  priorityScore: "优先评分",
  channel: "渠道",
  title: "标题",
  daysSinceVisit: "未到店天数",
  lastVisitDays: "未到店天数",
  lastVisitDate: "最近到店",
  churnScore: "流失分",
  churnLevel: "流失等级",
  repurchase30dScore: "复购分",
  marketingResponseScore: "营销响应分",
  ltvTier: "客户价值层级",
  totalSpent: "累计消费",
  visitCount: "到店次数",
  productId: "商品编号",
  purchaseOrderId: "采购单编号",
  orderNo: "单号",
  supplierId: "供应商编号",
  supplier: "供应商",
  supplierName: "供应商",
  category: "分类",
  pendingOrderCount: "待到货采购单",
  receivedOrderCount: "已到货采购单",
  overdueOrderCount: "超期未到货",
  totalAmountText: "采购金额",
  netAmountText: "净采购额",
  settlementCount: "结算单数",
  settlementAmountText: "结算金额",
  unpaidSettlementCount: "待处理结算",
  averageDeliveryDays: "平均交付天数",
  averageDeliveryDaysText: "平均交付天数",
  receiveRate: "到货率",
  receiveRateText: "到货率",
  suggestedQty: "建议补货",
  suggestedReplenishment: "建议补货",
  estimatedAmount: "预计金额",
  unitPrice: "单价",
  subtotal: "小计",
  totalAmount: "总金额",
  orderCount: "订单数",
  customerCount: "客户数",
  payMethod: "支付方式",
  projectName: "项目",
  beauticianName: "美容师",
  levelName: "等级",
  performanceScore: "表现分",
  performanceLevel: "表现等级",
  serviceCount: "服务次数",
  serviceTaskCount: "服务任务",
  completedTaskCount: "完成服务",
  taskCompletionRate: "服务完成率",
  taskCompletionRateText: "服务完成率",
  serviceRecordCompleteCount: "完整服务记录",
  serviceRecordCompletionRate: "服务记录完整率",
  serviceRecordCompletionRateText: "服务记录完整率",
  cardUsageTimes: "核销次数",
  commissionAmount: "提成",
  commissionAmountText: "提成",
  repeatCustomerCount: "复购客户",
  customerRepurchaseRate: "客户复购率",
  customerRepurchaseRateText: "客户复购率",
  reservationCount: "预约数",
  completedReservationCount: "完成预约",
  completionRate: "预约完成率",
  completionRateText: "预约完成率",
  status: "状态",
  startTime: "时间",
  endTime: "结束时间",
  reason: "依据",
  suggestedAction: "建议动作",
  riskLevel: "风险等级",
  severity: "严重程度",
  strategyName: "策略",
  executionCount: "执行次数",
  triggeredCount: "触发人数",
  reachedCount: "触达人数",
  convertedCount: "转化人数",
  failedExecutionCount: "失败执行",
  reachRate: "触达率",
  reachRateText: "触达率",
  lastExecutedAt: "最近执行",
  attributedRevenue: "归因收入",
  materialCost: "耗材成本",
  grossMargin: "毛利",
  totalRevenue: "收入",
  totalRevenueText: "收入",
  refundAmount: "退款金额",
  refundAmountText: "退款金额",
  netRevenue: "净收入",
  netRevenueText: "净收入",
  commissionTotal: "提成合计",
  commissionTotalText: "提成合计",
  averageOrderValue: "客单价",
  averageOrderValueText: "客单价",
  promotionId: "权益编号",
  promotionName: "权益",
  discountText: "优惠内容",
  issuedCount: "领取数",
  usedCount: "使用数",
  maxIssueCount: "可发放数",
  claimRate: "领取率",
  claimRateText: "领取率",
  useRate: "使用率",
  useRateText: "使用率",
  estimatedCost: "预计成本",
  estimatedCostText: "预计成本",
  identityCount: "小程序身份",
  boundCount: "已绑定客户",
  appEventCount: "访问事件",
  uniqueVisitorCount: "访问人数",
  activeCustomerCount: "活跃客户",
  promotionClaimedCount: "权益领取",
  promotionClaimCount: "权益领取",
  promotionReservedCount: "权益预约",
  reservationEventCount: "小程序预约",
  checkedInReservationCount: "已到店预约",
  pageId: "推广页编号",
  pageTitle: "推广页",
  sourceType: "来源类型",
  viewCount: "访问数",
  clickCount: "点击数",
  shareCount: "分享数",
  leadCount: "线索数",
  leadConvertedCount: "已转化线索",
  conversionCount: "转化数",
  conversionRate: "转化率",
  conversionRateText: "转化率",
  attributedOrderCount: "归因订单",
  attributedRevenueText: "归因收入",
  appCustomerOrderCount: "小程序客户成交",
  appCustomerRevenue: "小程序客户成交额",
  appCustomerRevenueText: "小程序客户成交额",
  leadRate: "线索率",
  leadRateText: "线索率",
  reservationRate: "预约率",
  reservationRateText: "预约率",
  attributionConversionRate: "归因转化率",
  attributionConversionRateText: "归因转化率",
  storeId: "门店编号",
  storeName: "门店",
  city: "城市",
  arrivedCount: "到店数",
  arrivalRate: "到店率",
  arrivalRateText: "到店率",
  lowStockCount: "低库存项",
  storeRankScore: "门店评分",
  deviceId: "设备编号",
  deviceCode: "设备码",
  deviceName: "设备",
  networkStatus: "网络",
  printerStatus: "打印机",
  scannerStatus: "扫码器",
  cameraStatus: "摄像头",
  batteryLevel: "电量",
  lastOnlineAt: "最近在线",
  conversationCount: "会话数",
  messageCount: "消息数",
  abnormalSignalCount: "异常项",
  abnormalSignals: "异常信号",
  failureCategoryLabel: "失败分类",
  failureCount: "出现次数",
  affectedDeviceCount: "影响设备",
  affectedDevices: "影响设备",
  topDeviceName: "主要设备",
  sampleMessage: "样例消息",
  candidateCapabilityName: "候选能力",
  candidateReason: "候选原因",
  recommendation: "处理建议",
  refundId: "退款编号",
  refundNo: "退款单号",
  orderId: "订单编号",
  amount: "金额",
  amountText: "金额",
  orderAmount: "订单金额",
  orderAmountText: "订单金额",
  refundRate: "退款率",
  refundRateText: "退款率",
  refundOrderRate: "单笔退款占比",
  refundOrderRateText: "单笔退款占比",
  refundedAt: "退款时间",
  taskId: "服务任务编号",
  taskNo: "服务单号",
  appointmentTime: "预约时间",
  startedAt: "开始时间",
  completedAt: "完成时间",
  qualitySignals: "质量信号",
  riskScore: "风险分",
};

const BUSINESS_QUERY_TOKEN_LABELS: Record<string, string> = {
  id: "编号",
  product: "商品",
  project: "项目",
  customer: "客户",
  member: "会员",
  card: "卡",
  order: "订单",
  purchase: "采购",
  supplier: "供应商",
  inventory: "库存",
  stock: "库存",
  sales: "销售",
  revenue: "收入",
  amount: "金额",
  price: "价格",
  cost: "成本",
  margin: "毛利",
  profit: "利润",
  quantity: "数量",
  qty: "数量",
  count: "数量",
  rate: "率",
  score: "评分",
  level: "等级",
  tier: "层级",
  ltv: "长期价值",
  status: "状态",
  type: "类型",
  name: "名称",
  phone: "手机号",
  channel: "渠道",
  reason: "原因",
  suggestion: "建议",
  suggested: "建议",
  action: "动作",
  current: "当前",
  previous: "上期",
  last: "最近",
  visit: "到店",
  days: "天数",
  date: "日期",
  time: "时间",
  start: "开始",
  end: "结束",
  risk: "风险",
  priority: "优先级",
  response: "响应",
  marketing: "营销",
  repurchase: "复购",
  churn: "流失",
  beautician: "美容师",
  service: "服务",
  task: "任务",
  promotion: "权益",
  claim: "领取",
  use: "使用",
  issued: "已发放",
  bound: "绑定",
  app: "小程序",
  event: "事件",
  lead: "线索",
  conversion: "转化",
  attributed: "归因",
  device: "设备",
  terminal: "终端",
  network: "网络",
  printer: "打印机",
  scanner: "扫码器",
  camera: "摄像头",
  battery: "电量",
  conversation: "会话",
  message: "消息",
  abnormal: "异常",
  signal: "信号",
  refund: "退款",
  refunded: "已退款",
  quality: "质量",
};

const BUSINESS_QUERY_VALUE_LABELS: Record<string, string> = {
  urgent: "需立即跟进",
  recommended: "建议优先跟进",
  opportunity: "可培育机会",
  high: "高",
  medium: "中",
  low: "低",
  extreme: "极高",
  success: "已完成",
  no_data: "暂无数据",
  unsupported: "暂不支持",
  failed: "失败",
  pending: "待处理",
  confirmed: "已确认",
  checked_in: "已到店",
  cancelled: "已取消",
  no_show: "未到店",
  completed: "已完成",
  paid: "已支付",
  refunded: "已退款",
  draft: "草稿",
  active: "启用",
  inactive: "停用",
  deleted: "已删除",
  available: "可预约",
  busy: "忙碌",
  leave: "请假",
  normal: "正常",
  online: "在线",
  offline: "离线",
  error: "异常",
  ok: "正常",
  bound: "已绑定",
  unbound: "未绑定",
  money_off: "满减",
  discount: "折扣",
  gift: "赠品",
  activity: "活动",
  page: "推广页",
  h5: "H5 页面",
  miniapp: "小程序",
  ami_glow: "Ami Glow 小程序",
  customer_app: "客户小程序",
  page_view: "页面访问",
  project_view: "项目浏览",
  cta_click: "点击咨询",
  promotion_claimed: "权益领取",
  promotion_reserved: "权益预约",
  miniapp_reservation_success: "小程序预约成功",
  expired: "已过期",
  in_progress: "进行中",
  open: "已开班",
  closed: "已交班",
  cash: "现金",
  wechat: "微信",
  alipay: "支付宝",
  card: "会员卡",
  product: "商品",
  project: "项目",
  customer: "客户",
  schedule: "排班",
  reservation: "预约",
  order: "订单",
  memberCard: "会员卡",
  finance: "财务",
  inventory: "库存",
  marketing: "营销",
  staff: "员工",
  store: "门店",
  supplyChain: "供应链",
  automation: "自动化",
  promotion: "权益活动",
  serviceQuality: "服务质量",
  customerApp: "客户小程序",
  channel: "渠道",
  terminal: "终端",
  afterSales: "售后退款",
  business: "经营",
  unknown: "未识别",
};

const BUSINESS_QUERY_CAPABILITY_LABELS: Record<string, string> = {
  business_overview: "经营概览",
  product_sales_trend: "商品销量趋势",
  product_customer_distribution: "商品购买客户分布",
  product_replenishment_opportunity: "商品补货机会",
  project_service_trend: "项目服务趋势",
  project_material_margin: "项目耗材毛利",
  customer_churn_risk: "客户流失风险",
  customer_growth_opportunity: "客户增长机会",
  inventory_alert: "库存预警",
  reservation_today: "今日预约",
  schedule_utilization: "排班利用率",
  order_revenue_analysis: "订单收入分析",
  card_expiry_risk: "卡项到期风险",
  card_usage_analysis: "卡项核销分析",
  member_balance_analysis: "会员卡余额分析",
  finance_cashflow_summary: "财务现金流摘要",
  marketing_conversion: "营销转化分析",
  automation_execution_summary: "自动化执行复盘",
  supplier_purchase_advice: "供应链采购建议",
  business_anomaly_alert: "经营异常提醒",
  multi_store_comparison: "多门店对比",
  staff_performance: "员工表现",
  terminal_health_diagnosis: "终端设备与对话诊断",
  unsupported: "暂不支持",
};

const AGENT_TOOL_LABELS: Record<string, string> = {
  "business.query.ask": "经营问数",
  "customer.priority.rank": "客户优先跟进排序",
  "marketing.opportunity.discover": "营销机会发现",
  "marketing.activity.draft": "生成活动草稿",
  "inventory.risk.rank": "库存风险排序",
  "inventory.replenishment.draft": "生成补货草稿",
  "revenue.diagnose": "收入诊断",
  "finance.margin.diagnose": "毛利诊断",
  "card.member.diagnose": "卡项与会员卡诊断",
  "reservation.schedule.diagnose": "预约与排班诊断",
  "scheduling.optimization.preview": "排班优化预览",
  "project.business.diagnose": "项目经营诊断",
  "product.sales.rank": "商品销售排行",
  "service.record.draft": "服务记录草稿",
  "staff.performance.rank": "员工表现排行",
  "supply_chain.diagnose": "供应链采购诊断",
  "marketing.conversion.diagnose": "营销转化诊断",
  "automation.execution.diagnose": "自动化执行复盘",
  "store.comparison.diagnose": "门店对比诊断",
  "promotion.effect.analyze": "权益活动效果分析",
  "customer_app.funnel.analyze": "客户小程序渠道漏斗",
  "terminal.health.diagnose": "终端设备与对话诊断",
  "order.refund.diagnose": "售后退款诊断",
  "service.quality.diagnose": "服务质量诊断",
};

const BUSINESS_EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  Product: "商品",
  ProductOrder: "订单",
  Project: "项目",
  Customer: "客户",
  Order: "订单",
  OrderItem: "订单明细",
  Reservation: "预约",
  Schedule: "排班",
  StaffSchedule: "员工排班",
  Beautician: "美容师",
  ServiceTask: "服务任务",
  Card: "次卡",
  CardOrder: "开卡订单",
  CardUsage: "次卡核销",
  CardUsageRecord: "次卡核销记录",
  MemberCard: "会员卡",
  PaymentRecord: "收款记录",
  RefundRecord: "退款记录",
  CommissionRecord: "提成记录",
  Inventory: "库存",
  StockMovement: "库存流水",
  Supplier: "供应商",
  SupplierOrder: "供应商订单",
  SupplierOrderItem: "供应商订单明细",
  SupplierSettlement: "供应商结算",
  MarketingActivity: "营销活动",
  MarketingPage: "推广页",
  MarketingPageEvent: "推广页事件",
  MarketingPageLead: "推广页线索",
  MarketingPageAttribution: "推广页归因",
  MarketingAutomation: "营销自动化",
  MarketingAutomationStrategy: "自动化策略",
  MarketingAutomationExecution: "自动化执行",
  MarketingAutomationTouch: "自动化触达",
  MarketingAttribution: "营销归因",
  Promotion: "权益活动",
  CustomerAppIdentity: "客户小程序身份",
  CustomerAppEvent: "客户小程序事件",
  TerminalDevice: "终端设备",
  TerminalConversation: "终端会话",
  PredictionSnapshot: "AI 预测快照",
  CustomerPredictionSnapshot: "客户预测快照",
  FollowUpTask: "跟进任务",
  TerminalFollowUpTask: "终端跟进任务",
};

function normalizeBusinessKey(key: string) {
  return key.replace(/[\s_-]+/g, "").toLowerCase();
}

function toBusinessNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function formatBusinessNumber(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("zh-CN")
    : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatBusinessMoney(value: number) {
  return `￥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatBusinessDate(value: unknown, includeTime: boolean) {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  if (!includeTime) return `${yyyy}-${mm}-${dd}`;
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function getBusinessQueryFieldLabel(key: string) {
  if (BUSINESS_QUERY_FIELD_LABELS[key]) return BUSINESS_QUERY_FIELD_LABELS[key];
  const tokens = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const translated = tokens.map((token) => BUSINESS_QUERY_TOKEN_LABELS[token.toLowerCase()] ?? token);
  return translated.join("");
}

function getBusinessQueryDomainLabel(domain: string) {
  return BUSINESS_QUERY_VALUE_LABELS[domain] ?? getBusinessQueryFieldLabel(domain);
}

function getBusinessQueryCapabilityLabel(capability: string) {
  return BUSINESS_QUERY_CAPABILITY_LABELS[capability] ?? getBusinessQueryFieldLabel(capability);
}

function getAgentToolLabel(toolName: string) {
  return AGENT_TOOL_LABELS[toolName] ?? getBusinessQueryFieldLabel(toolName);
}

function formatBusinessQueryValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    const text = value.map((item) => formatBusinessQueryValue(key, item)).filter((item) => item !== "-");
    return text.length ? text.join("、") : "-";
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (isRecord(value)) return "已记录明细";

  const normalizedKey = normalizeBusinessKey(key);
  const rawText = String(value).trim();
  const isMoneyKey =
    normalizedKey.includes("amount") ||
    normalizedKey.includes("revenue") ||
    normalizedKey.includes("spent") ||
    normalizedKey.includes("price") ||
    normalizedKey.includes("cost") ||
    normalizedKey.includes("profit") ||
    normalizedKey.includes("subtotal") ||
    normalizedKey.includes("balance") ||
    (normalizedKey.includes("margin") && !normalizedKey.includes("rate"));
  if (isMoneyKey && /^[￥¥]/.test(rawText)) return rawText.replace(/^¥/, "￥");
  const enumLabel = BUSINESS_QUERY_VALUE_LABELS[rawText] ?? BUSINESS_QUERY_VALUE_LABELS[rawText.toLowerCase()];
  if (enumLabel && normalizedKey.includes("risk") && ["low", "medium", "high"].includes(rawText.toLowerCase())) {
    return `${enumLabel}风险`;
  }
  if (
    enumLabel &&
    (normalizedKey.includes("priority") ||
      normalizedKey.includes("status") ||
      normalizedKey.includes("risk") ||
      normalizedKey.includes("level") ||
      normalizedKey.includes("type") ||
      normalizedKey.includes("domain") ||
      normalizedKey.includes("channel") ||
      normalizedKey.includes("source") ||
      normalizedKey.includes("method") ||
      ["urgent", "recommended", "opportunity"].includes(rawText.toLowerCase()))
  ) {
    return enumLabel;
  }

  const dateLike =
    value instanceof Date ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|\s)?/.test(value) && !normalizedKey.includes("days"));
  if (dateLike || (normalizedKey.includes("date") && !normalizedKey.includes("daterange"))) {
    const formatted = formatBusinessDate(value, normalizedKey.includes("time") || normalizedKey.endsWith("at"));
    if (formatted) return formatted;
  }

  const numericValue = toBusinessNumber(value);
  if (numericValue !== null) {
    if (normalizedKey.includes("rate") || normalizedKey.includes("ratio") || normalizedKey.includes("percent")) {
      const percent = Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue;
      return `${formatBusinessNumber(percent)}%`;
    }
    if (normalizedKey.includes("score")) return `${formatBusinessNumber(numericValue)} 分`;
    if (normalizedKey.includes("days") && !normalizedKey.includes("date")) return `${formatBusinessNumber(numericValue)} 天`;
    if (normalizedKey.includes("visitcount")) return `${formatBusinessNumber(numericValue)} 次`;
    if (normalizedKey.includes("ordercount")) return `${formatBusinessNumber(numericValue)} 笔`;
    if (normalizedKey.includes("customercount")) return `${formatBusinessNumber(numericValue)} 位`;
    if (isMoneyKey) {
      return formatBusinessMoney(numericValue);
    }
    return formatBusinessNumber(numericValue);
  }

  return rawText || "-";
}

function formatBusinessEvidenceSource(source: string) {
  return BUSINESS_EVIDENCE_SOURCE_LABELS[source] ?? getAgentToolLabel(source);
}

function formatBusinessEvidenceText(text: string) {
  return text
    .replace(/CustomerPredictionSnapshot/g, "客户预测快照")
    .replace(/TerminalFollowUpTask/g, "终端跟进任务")
    .replace(/FollowUpTask/g, "跟进任务")
    .replace(/PredictionSnapshot/g, "AI 预测快照")
    .replace(/\bproduct_sales_amount\b/g, "商品销售额")
    .replace(/\bproduct_sales_growth\b/g, "商品销量增长")
    .replace(/\bfollow_up_priority_score\b/g, "客户跟进优先评分")
    .replace(/\bstaff_performance_score\b/g, "员工表现评分")
    .replace(/\bsupplier_delivery_cycle\b/g, "供应商交付周期")
    .replace(/\bsupplier_settlement_amount\b/g, "供应商结算金额")
    .replace(/\bsupplier_purchase_score\b/g, "供应链采购优先级")
    .replace(/\bcampaign_conversion_rate\b/g, "活动转化率")
    .replace(/\bcampaign_revenue\b/g, "活动成交收入")
    .replace(/\bpromotion_claim_rate\b/g, "权益领取率")
    .replace(/\bautomation_touch_success_rate\b/g, "自动化触达成功率")
    .replace(/\bcustomer_app_active_count\b/g, "客户小程序活跃数")
    .replace(/\bcustomer_app_bind_rate\b/g, "客户小程序绑定率")
    .replace(/\bchannel_conversion_rate\b/g, "渠道转化率")
    .replace(/\bterminal_failure_rate\b/g, "终端失败率")
    .replace(/\bterminal_conversation_count\b/g, "终端会话数")
    .replace(/\brefund_amount\b/g, "退款金额")
    .replace(/\brefund_rate\b/g, "退款率")
    .replace(/\bservice_completion_rate\b/g, "服务完成率")
    .replace(/storeId=当前门店/g, "当前门店")
    .replace(/TerminalConversation\.date=查询周期/g, "终端会话日期在查询周期内")
    .replace(/limit=(\d+)/g, "最多返回 $1 条")
    .replace(/timeRange=([^；,，\s]+)/gi, "统计周期为 $1")
    .replace(/scope=全店员工/g, "全店员工")
    .replace(/scope=本人/g, "本人")
    .replace(/scope=指定员工/g, "指定员工")
    .replace(/订单状态 in completed\/paid/g, "订单状态为已完成或已支付")
    .replace(/status in completed,\s*paid/g, "订单状态为已完成或已支付")
    .replace(/status not in cancelled\/refunded/g, "排除已取消和已退款订单")
    .replace(/ProductOrder\.status != cancelled/g, "排除已取消订单")
    .replace(/Reservation\.status != cancelled/g, "排除已取消预约")
    .replace(/预约排除 cancelled/g, "排除已取消预约")
    .replace(/Product\.deletedAt is null/g, "商品未删除")
    .replace(/Project\.deletedAt is null/g, "项目未删除")
    .replace(/Customer\.deletedAt is null/g, "客户未删除")
    .replace(/Supplier\.deletedAt is null/g, "供应商未删除")
    .replace(/Promotion\.status != deleted/g, "权益未删除")
    .replace(/CommissionRecord\.status != cancelled/g, "排除已取消提成记录")
    .replace(/OrderItem\.itemType=product/g, "订单明细为商品")
    .replace(/OrderItem\.itemType=project/g, "订单明细为项目")
    .replace(/itemType=product/g, "明细类型为商品")
    .replace(/itemType=project/g, "明细类型为项目")
    .replace(/status=active/g, "状态为启用")
    .replace(/currentStock <= safetyStock/g, "当前库存不高于安全库存")
    .replace(/device token/gi, "设备认证令牌")
    .replace(/\bdomain\b/gi, "业务领域")
    .replace(/\bmetric\b/gi, "指标")
    .replace(/\bcapability\b/gi, "查询能力")
    .replace(/\bProduct\b/g, "商品")
    .replace(/\bOrderItem\b/g, "订单明细")
    .replace(/\bCustomer\b/g, "客户")
    .replace(/\bReservation\b/g, "预约")
    .replace(/\bSchedule\b/g, "排班")
    .replace(/\bServiceTask\b/g, "服务任务")
    .replace(/\bTerminalDevice\b/g, "终端设备")
    .replace(/\bTerminalConversation\b/g, "终端会话")
    .replace(/\bCustomerAppIdentity\b/g, "客户小程序身份")
    .replace(/\bCustomerAppEvent\b/g, "客户小程序事件")
    .replace(/\bMarketingPageLead\b/g, "推广页线索")
    .replace(/\bMarketingPageAttribution\b/g, "推广页归因")
    .replace(/\bPromotion\b/g, "权益活动")
    .replace(/\bCardUsageRecord\b/g, "次卡核销记录")
    .replace(/\bStockMovement\b/g, "库存流水");
}

function pickBusinessQueryFields(item: Record<string, unknown>) {
  const preferred = [
    "productName",
    "quantity",
    "growthRateText",
    "salesAmount",
    "currentStock",
    "safetyStock",
    "suggestedReplenishment",
    "suggestedQty",
    "estimatedAmount",
    "supplierName",
    "pendingOrderCount",
    "overdueOrderCount",
    "averageDeliveryDaysText",
    "receiveRateText",
    "settlementAmountText",
    "unpaidSettlementCount",
    "grossMarginRateText",
    "materialCost",
    "grossMargin",
    "severity",
    "title",
    "salesQuantity",
    "strategyName",
    "executionCount",
    "triggeredCount",
    "reachedCount",
    "convertedCount",
    "failedExecutionCount",
    "reachRateText",
    "attributedRevenue",
    "beauticianName",
    "performanceScore",
    "performanceLevel",
    "serviceCount",
    "salesAmount",
    "salesAmountText",
    "commissionAmountText",
    "serviceRecordCompletionRateText",
    "repeatCustomerCount",
    "customerRepurchaseRateText",
    "completionRateText",
    "serviceTaskCount",
    "completedTaskCount",
    "cardUsageTimes",
    "commissionAmount",
    "serviceRecordCompleteCount",
    "promotionName",
    "issuedCount",
    "usedCount",
    "useRateText",
    "claimRateText",
    "channel",
    "pageTitle",
    "viewCount",
    "clickCount",
    "shareCount",
    "eventCount",
    "uniqueVisitorCount",
    "activeCustomerCount",
    "promotionClaimCount",
    "promotionReservedCount",
    "reservationEventCount",
    "reservationCount",
    "checkedInReservationCount",
    "leadCount",
    "leadConvertedCount",
    "attributedOrderCount",
    "leadRateText",
    "reservationRateText",
    "conversionCount",
    "conversionRateText",
    "attributionConversionRateText",
    "attributedRevenue",
    "attributedRevenueText",
    "appCustomerOrderCount",
    "appCustomerRevenueText",
    "storeName",
    "salesAmountText",
    "arrivalRateText",
    "lowStockCount",
    "storeRankScore",
    "deviceName",
    "deviceCode",
    "failureCategoryLabel",
    "failureCount",
    "affectedDeviceCount",
    "topDeviceName",
    "sampleMessage",
    "candidateCapabilityName",
    "recommendation",
    "status",
    "abnormalSignalCount",
    "conversationCount",
    "messageCount",
    "refundNo",
    "amountText",
    "refundOrderRateText",
    "refundedAt",
    "taskNo",
    "riskScore",
    "riskLevel",
    "customerName",
    "phone",
    "memberLevel",
    "priority",
    "priorityScore",
    "daysSinceVisit",
    "lastVisitDays",
    "lastVisitDate",
    "totalSpent",
    "visitCount",
    "productId",
    "payMethod",
    "orderCount",
    "projectName",
    "status",
  ];
  const keys = preferred.filter((key) => key in item);
  const displayLimit =
    "beauticianName" in item && "performanceScore" in item
      ? 10
      : "channel" in item && "attributedOrderCount" in item
        ? 18
        : 6;
  return normalizeBusinessDetailFields(keys.length ? keys : Object.keys(item), item).slice(0, displayLimit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getAgentStatusLabel(status: AgentRunResult["status"]) {
  const labels: Record<AgentRunResult["status"], string> = {
    created: "已创建",
    planning: "规划中",
    validating: "校验中",
    running_tool: "查询中",
    waiting_approval: "待确认",
    composing: "生成中",
    completed: "已完成",
    failed: "执行失败",
    cancelled: "已取消",
  };
  return labels[status] ?? status;
}

function getAgentStatusClass(status: AgentRunResult["status"]) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "waiting_approval") return "bg-amber-50 text-amber-700";
  if (status === "failed" || status === "cancelled") return "bg-rose-50 text-rose-600";
  return "bg-[#F7F5F2] text-[#6F6678]";
}

function getAgentToolItems(result: AgentToolResult) {
  const data = isRecord(result.data) ? result.data : undefined;
  const candidates = data?.candidates;
  if (Array.isArray(candidates)) return candidates.filter(isRecord);
  const items = data?.items;
  if (Array.isArray(items)) return items.filter(isRecord);
  const card = isRecord(data?.card) ? data.card : undefined;
  const cardItems = card?.items;
  return Array.isArray(cardItems) ? cardItems.filter(isRecord) : [];
}

function getAgentToolResultLabel(status: AgentToolResult["status"]) {
  const labels: Record<AgentToolResult["status"], string> = {
    success: "已完成",
    no_data: "暂无数据",
    unsupported: "需补充",
    failed: "失败",
  };
  return labels[status] ?? status;
}

function pickAgentResultFields(item: Record<string, unknown>) {
  const preferred = [
    "productName",
    "beauticianName",
    "performanceScore",
    "performanceLevel",
    "serviceCount",
    "salesAmount",
    "salesAmountText",
    "commissionAmountText",
    "serviceRecordCompletionRateText",
    "repeatCustomerCount",
    "customerRepurchaseRateText",
    "completionRateText",
    "serviceTaskCount",
    "completedTaskCount",
    "taskCompletionRateText",
    "serviceRecordCompleteCount",
    "cardUsageTimes",
    "commissionAmount",
    "customerName",
    "customerPhone",
    "phone",
    "memberLevel",
    "priority",
    "lastVisitDays",
    "lastVisitDate",
    "totalSpent",
    "churnScore",
    "churnLevel",
    "repurchase30dScore",
    "marketingResponseScore",
    "opportunityType",
    "fitScore",
    "currentStock",
    "safetyStock",
    "suggestedQty",
    "suggestedReplenishment",
    "unitPrice",
    "subtotal",
    "estimatedAmount",
    "supplier",
    "supplierName",
    "pendingOrderCount",
    "overdueOrderCount",
    "averageDeliveryDaysText",
    "receiveRateText",
    "settlementAmountText",
    "unpaidSettlementCount",
    "salesQuantity",
    "salesAmount",
    "orderCount",
    "customerCount",
    "expiringStock",
    "daysToExpiry",
    "marginRateText",
    "suggestedCampaign",
    "promotionName",
    "issuedCount",
    "usedCount",
    "useRateText",
    "claimRateText",
    "channel",
    "pageTitle",
    "viewCount",
    "clickCount",
    "shareCount",
    "eventCount",
    "uniqueVisitorCount",
    "activeCustomerCount",
    "promotionClaimCount",
    "promotionReservedCount",
    "reservationEventCount",
    "reservationCount",
    "checkedInReservationCount",
    "leadCount",
    "leadConvertedCount",
    "attributedOrderCount",
    "leadRateText",
    "reservationRateText",
    "conversionCount",
    "conversionRateText",
    "attributionConversionRateText",
    "attributedRevenue",
    "attributedRevenueText",
    "appCustomerOrderCount",
    "appCustomerRevenueText",
    "triggeredCount",
    "reachedCount",
    "reachRateText",
    "failedExecutionCount",
    "storeName",
    "salesAmountText",
    "arrivalRateText",
    "lowStockCount",
    "storeRankScore",
    "deviceName",
    "deviceCode",
    "failureCategoryLabel",
    "failureCount",
    "affectedDeviceCount",
    "topDeviceName",
    "sampleMessage",
    "candidateCapabilityName",
    "recommendation",
    "status",
    "abnormalSignalCount",
    "conversationCount",
    "messageCount",
    "refundNo",
    "amountText",
    "refundOrderRateText",
    "refundedAt",
    "taskNo",
    "riskScore",
    "riskLevel",
  ];
  const keys = preferred.filter((key) => key in item);
  const displayLimit =
    "beauticianName" in item && "performanceScore" in item
      ? 12
      : "channel" in item && "attributedOrderCount" in item
        ? 18
        : 8;
  return normalizeBusinessDetailFields(keys.length ? keys : Object.keys(item), item).slice(0, displayLimit);
}

const BUSINESS_QUERY_TEXT_FIELD_PAIRS: Array<[rawField: string, textField: string]> = [
  ["salesAmount", "salesAmountText"],
  ["commissionAmount", "commissionAmountText"],
  ["attributedRevenue", "attributedRevenueText"],
  ["appCustomerRevenue", "appCustomerRevenueText"],
  ["totalRevenue", "totalRevenueText"],
  ["refundAmount", "refundAmountText"],
  ["netRevenue", "netRevenueText"],
  ["commissionTotal", "commissionTotalText"],
  ["averageOrderValue", "averageOrderValueText"],
  ["grossMarginRate", "grossMarginRateText"],
  ["marginRate", "marginRateText"],
  ["taskCompletionRate", "taskCompletionRateText"],
  ["serviceRecordCompletionRate", "serviceRecordCompletionRateText"],
  ["customerRepurchaseRate", "customerRepurchaseRateText"],
  ["completionRate", "completionRateText"],
  ["reachRate", "reachRateText"],
  ["claimRate", "claimRateText"],
  ["useRate", "useRateText"],
  ["conversionRate", "conversionRateText"],
  ["leadRate", "leadRateText"],
  ["reservationRate", "reservationRateText"],
  ["attributionConversionRate", "attributionConversionRateText"],
  ["arrivalRate", "arrivalRateText"],
  ["averageDeliveryDays", "averageDeliveryDaysText"],
  ["receiveRate", "receiveRateText"],
  ["settlementAmount", "settlementAmountText"],
  ["estimatedCost", "estimatedCostText"],
  ["amount", "amountText"],
  ["orderAmount", "orderAmountText"],
  ["refundRate", "refundRateText"],
  ["refundOrderRate", "refundOrderRateText"],
];

const BUSINESS_QUERY_TEXT_FIELD_BY_RAW = new Map(BUSINESS_QUERY_TEXT_FIELD_PAIRS);

function hasBusinessDisplayValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function normalizeBusinessDetailFields(fields: string[], item: Record<string, unknown>) {
  const seenFields = new Set<string>();
  const seenDisplayValues = new Set<string>();
  return fields.filter((field) => {
    if (seenFields.has(field)) return false;
    const textField = BUSINESS_QUERY_TEXT_FIELD_BY_RAW.get(field);
    if (textField && hasBusinessDisplayValue(item[textField])) return false;

    const label = getBusinessQueryFieldLabel(field);
    const value = formatBusinessQueryValue(field, item[field]);
    const displaySignature = `${label}:${value}`;
    if (seenDisplayValues.has(displaySignature)) return false;

    seenFields.add(field);
    seenDisplayValues.add(displaySignature);
    return true;
  });
}

type BusinessAnswerAction = { label: string; action: string; riskLevel: "low" | "medium" | "high" };

function dedupeBusinessActions(actions: BusinessAnswerAction[]) {
  const seen = new Set<string>();
  return actions.filter((item) => {
    const key = `${item.action}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getBusinessAnswerTitle(item: Record<string, unknown>, fallback: string) {
  return String(
    item.productName ??
      item.customerName ??
      item.projectName ??
      item.beauticianName ??
      item.supplierName ??
      item.promotionName ??
      item.pageTitle ??
      item.strategyName ??
      item.storeName ??
      item.deviceName ??
      item.failureCategoryLabel ??
      item.refundNo ??
      item.taskNo ??
      (item.channel ? formatBusinessQueryValue("channel", item.channel) : undefined) ??
      item.payMethod ??
      item.title ??
      fallback,
  );
}

function BusinessDetailList({
  items,
  pickFields,
}: {
  items: Record<string, unknown>[];
  pickFields: (item: Record<string, unknown>) => string[];
}) {
  if (!items.length) return null;
  return (
    <div className="mt-5 border-t border-black/5 pt-4">
      <div className="text-sm font-semibold text-[#1F1B2D]">明细</div>
      <ol className="mt-3 divide-y divide-black/5 rounded-xl border border-black/5 bg-[#FAF9F7]">
        {items.map((item, index) => {
          const fields = normalizeBusinessDetailFields(pickFields(item), item);
          const title = getBusinessAnswerTitle(item, `结果 ${index + 1}`);
          return (
            <li key={`${title}-${index}`} className="px-3 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2D1B69] text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[#1F1B2D]">{title}</div>
                  {typeof item.reason === "string" ? (
                    <div className="mt-1 text-xs leading-5 text-[#6F6678]">{item.reason}</div>
                  ) : null}
                  <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {fields.map((field) => (
                      <div key={field} className="flex items-center justify-between gap-3 text-xs">
                        <span className="shrink-0 text-[#6F6678]">{getBusinessQueryFieldLabel(field)}</span>
                        <span className="min-w-0 truncate text-right font-medium text-[#1F1B2D]">
                          {formatBusinessQueryValue(field, item[field])}
                        </span>
                      </div>
                    ))}
                  </div>
                  {Array.isArray(item.riskWarnings) && item.riskWarnings.length ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      {item.riskWarnings.map(String).join("；")}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BusinessNextActions({
  actions,
  onAction,
  approval,
  onApprove,
  onReject,
}: {
  actions: BusinessAnswerAction[];
  onAction?: (action: string) => void;
  approval?: AgentRunResult["approval"];
  onApprove?: (approvalId: number) => void;
  onReject?: (approvalId: number) => void;
}) {
  return (
    <div className="mt-5 border-t border-black/5 pt-4">
      <div className="text-sm font-semibold text-[#1F1B2D]">下一步动作</div>
      {approval ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-700">
          <div className="font-semibold text-amber-800">
            待确认：{getAgentToolLabel(approval.toolName)} · {formatBusinessQueryValue("riskLevel", approval.riskLevel)}
          </div>
          {approval.status === "pending" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onApprove?.(approval.id)}
                disabled={!onApprove}
                className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                确认执行
              </button>
              <button
                type="button"
                onClick={() => onReject?.(approval.id)}
                disabled={!onReject}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                拒绝
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((item) => (
            <button
              key={`${item.action}-${item.label}`}
              type="button"
              onClick={() => onAction?.(item.action)}
              disabled={!onAction}
              className="rounded-xl border border-[#2D1B69]/15 bg-[#2D1B69] px-3 py-2 text-xs font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : approval ? null : (
        <div className="mt-3 rounded-xl bg-[#F7F5F2] px-3 py-2 text-xs text-[#6F6678]">暂无待执行动作</div>
      )}
    </div>
  );
}

export function AgentRunResultCard({
  data,
  onAction,
  onApprove,
  onReject,
}: {
  data: AgentRunResult;
  onAction?: (action: string) => void;
  onApprove?: (approvalId: number) => void;
  onReject?: (approvalId: number) => void;
}) {
  const plan = data.plan;
  const toolResults = safeArray(data.toolResults);
  const actions = dedupeBusinessActions([
    ...safeArray(data.actions),
    ...toolResults.flatMap((result) => safeArray(result.actions)),
  ] as BusinessAnswerAction[]);
  const detailItems = toolResults.flatMap((result) => getAgentToolItems(result));
  const supportingSummaries = toolResults
    .map((result) => result.summary)
    .filter((summary) => summary && summary !== data.answer)
    .slice(0, 2);
  const suggestedActionText = actions.length ? actions.map((item) => item.label).slice(0, 3).join("、") : "";

  return (
    <CardShell title="Ami 智能问答" subtitle={plan?.goal ?? "基于 Ami_Core 经营数据"}>
      <div className="rounded-2xl border border-black/5 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#2D1B69]">概述</div>
            <div className="mt-2 text-base font-semibold leading-7 text-[#1F1B2D]">{data.answer}</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${getAgentStatusClass(data.status)}`}>
            {getAgentStatusLabel(data.status)}
          </span>
        </div>

        {supportingSummaries.length ? (
          <div className="mt-3 text-sm leading-6 text-[#6F6678]">原因：{supportingSummaries.join("；")}</div>
        ) : null}

        {suggestedActionText ? <div className="mt-2 text-sm leading-6 text-[#6F6678]">建议：{suggestedActionText}</div> : null}

        <BusinessDetailList items={detailItems} pickFields={pickAgentResultFields} />
        <BusinessNextActions actions={actions} onAction={onAction} approval={data.approval} onApprove={onApprove} onReject={onReject} />
      </div>
    </CardShell>
  );
}

export function BusinessQueryResultCard({
  data,
  onAction,
}: {
  data: BusinessQueryResponse;
  onAction?: (action: string) => void;
}) {
  const card = data.card;
  const items = safeArray(card?.items);
  const kpis = safeArray(card?.kpis);
  const actions = dedupeBusinessActions(safeArray(data.actions) as BusinessAnswerAction[]);
  const summaryText = card?.summary && card.summary !== data.answer ? card.summary : "";
  const suggestedActionText = actions.length ? actions.map((item) => item.label).slice(0, 3).join("、") : "";

  return (
    <CardShell title="Ami 智能问答" subtitle={card?.title ?? "基于 Ami_Core 经营数据"}>
      <div className="rounded-2xl border border-black/5 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#2D1B69]">概述</div>
            <div className="mt-2 text-base font-semibold leading-7 text-[#1F1B2D]">{data.answer}</div>
            <div className="mt-1 text-xs leading-5 text-[#6F6678]">
              能力：{getBusinessQueryCapabilityLabel(data.capability)} · 领域：{getBusinessQueryDomainLabel(data.domain)}
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              data.status === "success"
                ? "bg-emerald-50 text-emerald-700"
                : data.status === "no_data"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-[#F7F5F2] text-[#6F6678]"
            }`}
          >
            {data.status === "success" ? "已查到数据" : data.status === "no_data" ? "暂无数据" : "需确认"}
          </span>
        </div>

        {summaryText ? <div className="mt-3 text-sm leading-6 text-[#6F6678]">原因：{summaryText}</div> : null}
        {suggestedActionText ? <div className="mt-2 text-sm leading-6 text-[#6F6678]">建议：{suggestedActionText}</div> : null}

        {kpis.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {kpis.map((item) => (
              <div key={item.label} className="rounded-xl bg-[#F7F5F2] px-3 py-3">
                <div className="text-xs text-[#6F6678]">{item.label}</div>
                <div className="mt-1 text-lg font-semibold text-[#1F1B2D]">{item.value}</div>
                {item.hint ? <div className="mt-1 text-xs text-[#9B92A3]">{item.hint}</div> : null}
              </div>
            ))}
          </div>
        ) : null}

        <BusinessDetailList items={items} pickFields={pickBusinessQueryFields} />
        <BusinessNextActions actions={actions} onAction={onAction} />
      </div>
    </CardShell>
  );
}

export function OperationResultCard({
  data,
  timestamp,
}: {
  data: OperationResultData;
  timestamp: Date;
}) {
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const isCompactReceipt = Boolean(data.receipt);
  const tone =
    data.status === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : data.status === "warning"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-rose-50 text-rose-600 border-rose-100";

  return (
    <div className={`rounded-2xl border ${isCompactReceipt ? "p-4" : "p-5"} ${tone}`}>
      <div className="flex items-center gap-3">
        <div className={`flex ${isCompactReceipt ? "h-10 w-10" : "h-12 w-12"} items-center justify-center rounded-full bg-white`}>
          {data.status === "success" ? <CheckCircle2 className={isCompactReceipt ? "h-5 w-5" : "h-6 w-6"} /> : <FileText className={isCompactReceipt ? "h-5 w-5" : "h-6 w-6"} />}
        </div>
        <div>
          <div className={`${isCompactReceipt ? "text-base" : "text-lg"} font-semibold text-[#1F1B2D]`}>{data.title}</div>
          <div className="text-sm text-[#6F6678]">{data.subtitle}</div>
        </div>
      </div>
      {!isCompactReceipt && data.description ? (
        <p className="mt-4 text-sm text-[#1F1B2D]">{data.description}</p>
      ) : null}
      {data.receipt ? <ReceiptInlineDetails receipt={data.receipt} /> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full bg-white/80 px-3 py-1 text-xs text-[#6F6678]">
          操作时间 {timestamp.toLocaleString("zh-CN", { hour12: false })}
        </div>
        {data.receipt ? (
          <button
            type="button"
            onClick={() => setReceiptOpen(true)}
            className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            <Printer className="h-4 w-4" />
            打印小票
          </button>
        ) : null}
      </div>
      {data.receipt ? <ReceiptPreviewDialog receipt={data.receipt} open={receiptOpen} onOpenChange={setReceiptOpen} /> : null}
    </div>
  );
}

export function SummaryBadge({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[#2D1B69]/6 px-3 py-1 text-xs text-[#2D1B69]">
      <Sparkles className="h-3.5 w-3.5" />
      {text}
    </div>
  );
}

