import React from "react";
import {
  AlertTriangle,
  CalendarCheck,
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
  CustomerCardData,
  DashboardCardData,
  InventoryAlertCardData,
  OperationResultData,
  OperationReceiptData,
  StaffScheduleCardData,
} from "../types";
import {
  cancelAppointmentFromTerminal,
  checkInAppointmentFromTerminal,
  confirmAppointmentFromTerminal,
  createAppointmentFromTerminal,
  getAppointmentCreateOptions,
  getAppointmentEditOptions,
  getAppointments,
  updateAppointmentFromTerminal,
  type AppointmentCreateOptions,
  type AppointmentEditOptions,
} from "../services/auraCoreService";
import { createTerminalPrintJob, saveSchedule } from "@/api";
import type { ScheduleSlot } from "@/types";
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

type TerminalEditingSlot = {
  beauticianId: number;
  dayIndex: number;
  slotLabel: string;
} | null;

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

function getTerminalWeekDays(weekStart?: string) {
  const start = weekStart || new Date().toISOString().slice(0, 10);
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

function getTerminalStatusLabel(status: TerminalScheduleStatus, slot: TerminalDisplaySlot) {
  const labels: Record<TerminalScheduleStatus, string> = {
    normal: slot.label,
    booked: "已预约",
    expired: slot.label,
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

function buildTerminalScheduleMap(items: StaffScheduleCardData[]) {
  return Object.fromEntries(
    safeArray(items).map((item) => [item.beautician.id, cloneTerminalWeekSlots(item.weekSlots)]),
  ) as Record<number, ScheduleSlot[][]>;
}

function setTerminalDisplaySlotStatus(
  daySlots: StaffScheduleCardData["todaySlots"],
  slot: TerminalDisplaySlot,
  status: TerminalEditableScheduleStatus,
) {
  return safeArray(daySlots).map((item) =>
    slot.sourceTimes.includes(item.time) ? { ...item, available: status === "normal", status } : item,
  );
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

function getTerminalSlotKey(beauticianId: number, dayIndex: number, slot: TerminalDisplaySlot) {
  return `${beauticianId}:${dayIndex}:${slot.label}`;
}

function TerminalScheduleSlotButton({
  slot,
  status,
  menuOpen,
  saving,
  onOpen,
  onSelect,
}: {
  slot: TerminalDisplaySlot;
  status: TerminalScheduleStatus;
  menuOpen: boolean;
  saving: boolean;
  onOpen: () => void;
  onSelect: (status: TerminalEditableScheduleStatus) => void;
}) {
  const disabled = status === "booked" || status === "expired" || saving;
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className={`flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center text-xs font-medium transition ${getTerminalStatusClass(status)} ${
          disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:shadow-sm active:scale-[0.98]"
        }`}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {getTerminalStatusLabel(status, slot)}
      </button>
      {menuOpen ? (
        <div className="absolute left-1/2 top-full z-30 mt-1 w-28 -translate-x-1/2 rounded-xl border border-black/10 bg-white p-1 shadow-xl shadow-black/10">
          {getTerminalEditOptions().map(([nextStatus, label]) => (
            <button
              key={nextStatus}
              type="button"
              onClick={() => (nextStatus === status ? onOpen() : onSelect(nextStatus))}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-[#F7F5F2] ${
                nextStatus === status ? "bg-[#2D1B69]/6 text-[#2D1B69]" : "text-[#1F1B2D]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
  if (label.includes("营业额")) return TrendingUp;
  if (label.includes("预约")) return CalendarCheck;
  if (label.includes("到店")) return CheckCircle2;
  if (label.includes("活跃")) return CreditCard;
  return Users;
}

function getManagerKpiTone(label: string): "purple" | "gold" | "green" | "red" {
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

function toApiDateTime(value: string) {
  return value.includes("T") ? `${value}:00` : value;
}

function getDefaultAppointmentLocalTime() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
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
    <div className="flex flex-col gap-4">
      <SectionHeader title={title} desc={subtitle} />
      {children}
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

    return {
      title: risk?.title ?? "经营关注事项",
      severity: risk?.severity,
      reason: risk?.reason ?? "",
      action: risk?.action || highlight?.action || highlight?.reason || "",
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
                tone={getManagerKpiTone(item.label)}
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
    appointmentTime: getDefaultAppointmentLocalTime(),
    projectId: "",
    beauticianId: "",
    duration: "60",
    remark: "",
  });
  const [editForm, setEditForm] = React.useState({
    appointmentTime: "",
    projectId: "",
    beauticianId: "",
    duration: "60",
    remark: "",
  });
  const [cancelReason, setCancelReason] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const items = safeArray<AppointmentItem>(currentData.items);

  React.useEffect(() => {
    setCurrentData(data);
  }, [data]);

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

  const openCreateDialog = async () => {
    setLocalError(null);
    setCreatingAppointment(true);
    setCreateForm({
      customerId: "",
      appointmentTime: getDefaultAppointmentLocalTime(),
      projectId: "",
      beauticianId: "",
      duration: "60",
      remark: "",
    });
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
    if (!createForm.customerId || !createForm.appointmentTime || !createForm.projectId || !createForm.beauticianId) {
      setLocalError("请完善客户、预约时间、项目和美容师");
      return;
    }
    setActionLoading("create");
    setLocalError(null);
    try {
      const result = await createAppointmentFromTerminal({
        customerId: Number(createForm.customerId),
        appointmentTime: toApiDateTime(createForm.appointmentTime),
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
    setEditForm({
      appointmentTime: toDateTimeLocalValue(item.appointmentTime),
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
    if (!editForm.appointmentTime) {
      setLocalError("请选择预约时间");
      return;
    }
    const project = appointmentOptions.projects.find((item) => String(item.id) === editForm.projectId);
    const beautician = appointmentOptions.beauticians.find((item) => String(item.id) === editForm.beauticianId);
    setActionLoading(`edit:${editingAppointment.id}`);
    setLocalError(null);
    try {
      const result = await updateAppointmentFromTerminal(editingAppointment.id, {
        appointmentTime: toApiDateTime(editForm.appointmentTime),
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
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              预约时间
              <input
                type="datetime-local"
                value={createForm.appointmentTime}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, appointmentTime: event.target.value }))}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
              />
            </label>
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
            <label className="grid gap-1.5 text-sm font-medium text-[#1F1B2D]">
              预约时间
              <input
                type="datetime-local"
                value={editForm.appointmentTime}
                onChange={(event) => setEditForm((prev) => ({ ...prev, appointmentTime: event.target.value }))}
                className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#2D1B69]"
              />
            </label>
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
}: {
  data: StaffScheduleCardData;
}) {
  const specialties = safeArray(data.beautician.specialties);
  const dayOptions = getTerminalDayOptions(data.weekStart);
  const [activeDayIndex, setActiveDayIndex] = React.useState(0);
  const [weekSlots, setWeekSlots] = React.useState<ScheduleSlot[][]>(() => cloneTerminalWeekSlots(data.weekSlots));
  const [editingSlot, setEditingSlot] = React.useState<TerminalEditingSlot>(null);
  const [savingSlot, setSavingSlot] = React.useState<string | null>(null);
  const [scheduleError, setScheduleError] = React.useState<string | null>(null);
  const activeDay = dayOptions[activeDayIndex] ?? dayOptions[0];
  const activeSlots = activeDay.dayIndex >= 0 ? (weekSlots[activeDay.dayIndex] ?? []) : [];
  const activeUtilization = getTerminalDayUtilization(activeSlots);

  React.useEffect(() => {
    setWeekSlots(cloneTerminalWeekSlots(data.weekSlots));
    setEditingSlot(null);
    setScheduleError(null);
  }, [data.beautician.id, data.weekSlots]);

  const handleDayChange = (index: number) => {
    setActiveDayIndex(index);
    setEditingSlot(null);
  };

  const openSlotMenu = (dayIndex: number, slot: TerminalDisplaySlot) => {
    if (!data.weekStart || dayIndex < 0) return;
    const currentSlots = weekSlots[dayIndex] ?? [];
    const currentStatus = getTerminalDisplaySlotStatus(currentSlots, activeDay, slot);
    if (currentStatus === "expired" || currentStatus === "booked") return;
    setEditingSlot((current) =>
      current?.beauticianId === data.beautician.id && current.dayIndex === dayIndex && current.slotLabel === slot.label
        ? null
        : { beauticianId: data.beautician.id, dayIndex, slotLabel: slot.label },
    );
  };

  const handleSlotStatusChange = async (
    dayIndex: number,
    slot: TerminalDisplaySlot,
    status: TerminalEditableScheduleStatus,
  ) => {
    if (!data.weekStart || dayIndex < 0) {
      setScheduleError("当前排班缺少周起始日期，暂时无法保存。");
      return;
    }
    const key = getTerminalSlotKey(data.beautician.id, dayIndex, slot);
    const previousSlots = cloneTerminalWeekSlots(weekSlots);
    const nextSlots = cloneTerminalWeekSlots(weekSlots);
    nextSlots[dayIndex] = setTerminalDisplaySlotStatus(nextSlots[dayIndex] ?? [], slot, status);

    setSavingSlot(key);
    setEditingSlot(null);
    setScheduleError(null);
    setWeekSlots(nextSlots);

    try {
      await saveSchedule({ beauticianId: data.beautician.id, weekStart: data.weekStart, slots: nextSlots });
    } catch (error) {
      console.warn("保存终端排班失败", error);
      setWeekSlots(previousSlots);
      setScheduleError("排班保存失败，已恢复为保存前状态。");
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <CardShell title={data.title} subtitle={data.subtitle}>
      <div className="rounded-2xl border border-[#2D1B69]/10 bg-[#2D1B69]/6 p-4">
        <div className="text-base font-semibold text-[#1F1B2D]">{data.beautician.name}</div>
        <p className="mt-1 text-sm text-[#6F6678]">
          {activeDay.label}共有 {activeSlots.length} 个排班时段，占用率 {activeUtilization}。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="text-xs text-[#6F6678]">状态</div>
          <div className="mt-2 text-lg font-semibold text-[#1F1B2D]">{data.beautician.status}</div>
          <div className="mt-1 text-sm text-[#6F6678]">{activeDay.label}占用率 {activeUtilization}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="text-xs text-[#6F6678]">专长</div>
          <div className="mt-2 text-sm text-[#1F1B2D]">{specialties.join("、") || "暂无专长信息"}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="text-xs text-[#6F6678]">门店</div>
          <div className="mt-2 text-sm text-[#1F1B2D]">{data.beautician.storeName}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-[#F7F5F2] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[#1F1B2D]">{activeDay.label}排班</div>
            <div className="text-xs text-[#6F6678]">{activeDay.name} {activeDay.date}</div>
          </div>
          <TerminalScheduleDayTabs options={dayOptions} activeIndex={activeDayIndex} onChange={handleDayChange} />
        </div>
        {scheduleError ? <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-600">{scheduleError}</div> : null}
        <div className="grid gap-2 p-4 md:grid-cols-3">
          {TERMINAL_DISPLAY_SLOTS.map((slot) => {
            const status = getTerminalDisplaySlotStatus(activeSlots, activeDay, slot);
            const key = getTerminalSlotKey(data.beautician.id, activeDay.dayIndex, slot);
            const menuOpen =
              editingSlot?.beauticianId === data.beautician.id &&
              editingSlot.dayIndex === activeDay.dayIndex &&
              editingSlot.slotLabel === slot.label;

            return (
              <div key={`${data.beautician.id}-${activeDay.fullDate}-${slot.label}`} className="bg-[#FAF9F7] p-1">
                <TerminalScheduleSlotButton
                  slot={slot}
                  status={status}
                  menuOpen={menuOpen}
                  saving={savingSlot === key}
                  onOpen={() => openSlotMenu(activeDay.dayIndex, slot)}
                  onSelect={(nextStatus) => void handleSlotStatusChange(activeDay.dayIndex, slot, nextStatus)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </CardShell>
  );
}

export function StaffPerformanceCard({
  items,
}: {
  items: StaffScheduleCardData[];
}) {
  const staffItems = safeArray(items);
  const weekStart = staffItems.find((item) => item.weekStart)?.weekStart;
  const dayOptions = getTerminalDayOptions(weekStart);
  const [activeDayIndex, setActiveDayIndex] = React.useState(0);
  const [scheduleByBeautician, setScheduleByBeautician] = React.useState<Record<number, ScheduleSlot[][]>>(() =>
    buildTerminalScheduleMap(staffItems),
  );
  const [editingSlot, setEditingSlot] = React.useState<TerminalEditingSlot>(null);
  const [savingSlot, setSavingSlot] = React.useState<string | null>(null);
  const [scheduleError, setScheduleError] = React.useState<string | null>(null);
  const activeDay = dayOptions[activeDayIndex] ?? dayOptions[0];

  React.useEffect(() => {
    setScheduleByBeautician(buildTerminalScheduleMap(staffItems));
    setEditingSlot(null);
    setScheduleError(null);
  }, [items]);

  const handleDayChange = (index: number) => {
    setActiveDayIndex(index);
    setEditingSlot(null);
  };

  const openSlotMenu = (item: StaffScheduleCardData, dayIndex: number, slot: TerminalDisplaySlot) => {
    const targetWeekStart = item.weekStart ?? weekStart;
    if (!targetWeekStart || dayIndex < 0) return;
    const currentSlots = scheduleByBeautician[item.beautician.id]?.[dayIndex] ?? [];
    const currentStatus = getTerminalDisplaySlotStatus(currentSlots, activeDay, slot);
    if (currentStatus === "expired" || currentStatus === "booked") return;
    setEditingSlot((current) =>
      current?.beauticianId === item.beautician.id && current.dayIndex === dayIndex && current.slotLabel === slot.label
        ? null
        : { beauticianId: item.beautician.id, dayIndex, slotLabel: slot.label },
    );
  };

  const handleSlotStatusChange = async (
    item: StaffScheduleCardData,
    dayIndex: number,
    slot: TerminalDisplaySlot,
    status: TerminalEditableScheduleStatus,
  ) => {
    const targetWeekStart = item.weekStart ?? weekStart;
    if (!targetWeekStart || dayIndex < 0) {
      setScheduleError("当前排班缺少周起始日期，暂时无法保存。");
      return;
    }

    const beauticianId = item.beautician.id;
    const key = getTerminalSlotKey(beauticianId, dayIndex, slot);
    const previousSlots = cloneTerminalWeekSlots(scheduleByBeautician[beauticianId] ?? item.weekSlots);
    const nextSlots = cloneTerminalWeekSlots(scheduleByBeautician[beauticianId] ?? item.weekSlots);
    nextSlots[dayIndex] = setTerminalDisplaySlotStatus(nextSlots[dayIndex] ?? [], slot, status);

    setSavingSlot(key);
    setEditingSlot(null);
    setScheduleError(null);
    setScheduleByBeautician((current) => ({ ...current, [beauticianId]: nextSlots }));

    try {
      await saveSchedule({ beauticianId, weekStart: targetWeekStart, slots: nextSlots });
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

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
        <div className="overflow-x-auto">
          <div
            className="grid"
            style={{
              minWidth: `${Math.max(760, 128 + staffItems.length * 150)}px`,
              gridTemplateColumns: `128px repeat(${Math.max(staffItems.length, 1)}, minmax(150px, 1fr))`,
            }}
          >
            <div className="border-b border-r border-black/5 bg-[#F7F5F2] px-3 py-3 text-center text-xs font-medium text-[#6F6678]">
              时段
            </div>
            {staffItems.map((item) => {
              const daySlots = scheduleByBeautician[item.beautician.id]?.[activeDay.dayIndex] ?? [];
              return (
                <div key={item.beautician.id} className="border-b border-r border-black/5 bg-[#F7F5F2] px-3 py-3 text-center">
                  <div className="text-sm font-semibold text-[#1F1B2D]">{item.beautician.name}</div>
                  <div className="mt-0.5 text-[11px] text-[#6F6678]">
                    {item.beautician.level} · 占用率 {getTerminalDayUtilization(daySlots)}
                  </div>
                </div>
              );
            })}

            {TERMINAL_DISPLAY_SLOTS.map((slot) => (
              <React.Fragment key={`${activeDay.fullDate}-${slot.label}`}>
                <div className="border-b border-r border-black/5 bg-[#FAF9F7] px-3 py-3 text-center text-xs font-medium text-[#6F6678]">
                  {slot.label}
                </div>
                {staffItems.map((item) => {
                  const daySlots = scheduleByBeautician[item.beautician.id]?.[activeDay.dayIndex] ?? [];
                  const status = getTerminalDisplaySlotStatus(daySlots, activeDay, slot);
                  const key = getTerminalSlotKey(item.beautician.id, activeDay.dayIndex, slot);
                  const menuOpen =
                    editingSlot?.beauticianId === item.beautician.id &&
                    editingSlot.dayIndex === activeDay.dayIndex &&
                    editingSlot.slotLabel === slot.label;
                  return (
                    <div key={`${item.beautician.id}-${activeDay.fullDate}-${slot.label}`} className="border-b border-r border-black/5 bg-[#FAF9F7] p-2">
                      <TerminalScheduleSlotButton
                        slot={slot}
                        status={status}
                        menuOpen={menuOpen}
                        saving={savingSlot === key}
                        onOpen={() => openSlotMenu(item, activeDay.dayIndex, slot)}
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

export function CustomerGrowthCard({
  customers,
}: {
  customers: CustomerCardData[];
}) {
  const customerItems = safeArray(customers);
  return (
    <CardShell title="客户增长与流失风险" subtitle="直接使用 Ami_Core 客户数据">
      <div className="flex flex-col gap-3">
        {customerItems.map((item) => (
          <div key={item.customer.id} className="rounded-2xl border border-black/5 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-[#1F1B2D]">{item.customer.name}</div>
                  <span className="rounded-full bg-[#2D1B69]/6 px-2 py-0.5 text-[11px] text-[#2D1B69]">{item.customer.memberLevel}</span>
                </div>
                <p className="mt-1 text-sm text-[#6F6678]">{item.summary}</p>
              </div>
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
                  <div className="text-xs text-[#A8764D]">{item.status}</div>
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
              {customer.phone} · {customer.memberLevel} · 最近到店 {customer.lastVisitDate}
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

