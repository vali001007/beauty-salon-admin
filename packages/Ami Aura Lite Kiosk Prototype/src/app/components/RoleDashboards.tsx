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
import { createTerminalPrintJob } from "@/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
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

function buildReceiptContent(receipt: OperationReceiptData) {
  const lines = [
    receipt.storeName,
    "消费小票",
    "------------------------------",
    `单号: ${receipt.receiptNo}`,
    `时间: ${formatReceiptTime(receipt.createdAt)}`,
    `客户: ${receipt.customerName}`,
    receipt.customerPhone ? `电话: ${receipt.customerPhone}` : "",
    receipt.cashierName ? `收银员: ${receipt.cashierName}` : "",
    "------------------------------",
    ...receipt.items.map((item) => `${item.name} x${item.quantity} ${formatMoney(item.subtotal)}`),
    "------------------------------",
    `应收: ${formatMoney(receipt.subtotalAmount)}`,
    `优惠: ${formatMoney(receipt.discountAmount)}`,
    `实收: ${formatMoney(receipt.paidAmount)}`,
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

  const handlePrint = async () => {
    setPrintStatus("printing");
    setPrintMessage("");
    try {
      const job = await createTerminalPrintJob({
        sourceType: receipt.sourceType,
        sourceId: receipt.sourceId,
        title: `${receipt.storeName} 消费小票 ${receipt.receiptNo}`,
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
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>小票预览</DialogTitle>
          <DialogDescription>确认小票内容后，可发送到 Ami_Core 打印任务并调起本机打印。</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-black/10 bg-[#FAFAF8] p-5 font-mono text-sm text-[#1F1B2D]">
          <div className="text-center">
            <div className="text-base font-bold">{receipt.storeName}</div>
            <div className="mt-1 text-xs text-[#6F6678]">消费小票</div>
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
            <div className="grid grid-cols-[1fr_44px_80px] gap-2 text-xs text-[#6F6678]">
              <span>项目/商品</span>
              <span className="text-center">数量</span>
              <span className="text-right">金额</span>
            </div>
            {receipt.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_44px_80px] gap-2 text-xs">
                <span className="truncate">{item.name}</span>
                <span className="text-center">x{item.quantity}</span>
                <span className="text-right">{formatMoney(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="my-3 border-t border-dashed border-black/25" />
          <div className="grid gap-1 text-xs">
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
            {receipt.paymentMethod ? (
              <div className="flex justify-between text-[#6F6678]">
                <span>支付方式</span>
                <span>{receipt.paymentMethod}</span>
              </div>
            ) : null}
          </div>

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

  return (
    <CardShell title={data.title} subtitle={data.subtitle}>
      <div className="rounded-2xl bg-[#2D1B69] p-5 text-white">
        <div className="text-sm text-white/70">经营摘要</div>
        <p className="mt-2 text-base leading-relaxed">{data.summary}</p>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[900px] gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(kpis.length, 1)}, minmax(0, 1fr))` }}>
          {kpis.map((item, index) => (
            <KpiTile
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={index === 0 ? Users : index === 1 ? CalendarCheck : index === 2 ? CreditCard : index === 3 ? PackageCheck : TrendingUp}
              tone={index === 2 ? "green" : index === 3 ? "red" : index === 4 ? "gold" : "purple"}
            />
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {risks.map((risk) => (
          <div key={risk} className="rounded-2xl border border-black/5 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#1F1B2D]">
              <AlertTriangle className="h-4 w-4 text-[#C9956C]" />
              风险提示
            </div>
            <p className="mt-2 text-sm text-[#6F6678]">{risk}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {highlights.map((item) => (
          <div key={item} className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
            <div className="text-xs text-[#6F6678]">Ami 建议</div>
            <p className="mt-2 text-sm text-[#1F1B2D]">{item}</p>
          </div>
        ))}
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
  const todaySlots = safeArray(data.todaySlots);
  const specialties = safeArray(data.beautician.specialties);
  return (
    <CardShell title={data.title} subtitle={data.subtitle}>
      <div className="rounded-2xl border border-[#2D1B69]/10 bg-[#2D1B69]/6 p-4">
        <div className="text-base font-semibold text-[#1F1B2D]">{data.beautician.name}</div>
        <p className="mt-1 text-sm text-[#6F6678]">{data.summary}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="text-xs text-[#6F6678]">状态</div>
          <div className="mt-2 text-lg font-semibold text-[#1F1B2D]">{data.beautician.status}</div>
          <div className="mt-1 text-sm text-[#6F6678]">占用率 {data.utilization}</div>
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
      <div className="grid gap-2 md:grid-cols-4">
        {todaySlots.map((slot) => (
          <div
            key={`${data.beautician.id}-${slot.time}`}
            className={`rounded-xl border px-3 py-2 text-sm ${
              slot.available
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : "border-[#C9956C]/20 bg-[#C9956C]/10 text-[#A8764D]"
            }`}
          >
            <div className="font-semibold">{slot.time}</div>
            <div className="text-xs opacity-80">{slot.period}</div>
          </div>
        ))}
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
  return (
    <CardShell title="员工当天排班" subtitle="与 Ami_Core 排班模块一致">
      <div className="flex flex-col gap-3">
        {staffItems.map((item, index) => (
          <div key={item.beautician.id} className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2D1B69] text-sm font-semibold text-white">
                  {index + 1}
                </div>
                <div>
                  <div className="text-base font-semibold text-[#1F1B2D]">{item.beautician.name}</div>
                  <p className="text-xs text-[#6F6678]">{item.beautician.level} · {item.beautician.status}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-[#1F1B2D]">{item.utilization}</div>
                <div className="text-xs text-[#6F6678]">占用率</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-white p-3">
              <p className="text-sm text-[#6F6678]">{item.summary}</p>
            </div>
          </div>
        ))}
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
  const tone =
    data.status === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : data.status === "warning"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-rose-50 text-rose-600 border-rose-100";

  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
          {data.status === "success" ? <CheckCircle2 className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
        </div>
        <div>
          <div className="text-lg font-semibold text-[#1F1B2D]">{data.title}</div>
          <div className="text-sm text-[#6F6678]">{data.subtitle}</div>
        </div>
      </div>
      <p className="mt-4 text-sm text-[#1F1B2D]">{data.description}</p>
      <div className="mt-4 rounded-full bg-white/80 px-3 py-1 text-xs text-[#6F6678]">
        操作时间 {timestamp.toLocaleString("zh-CN", { hour12: false })}
      </div>
      {data.receipt ? (
        <>
          <button
            type="button"
            onClick={() => setReceiptOpen(true)}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            <Printer className="h-4 w-4" />
            打印小票
          </button>
          <ReceiptPreviewDialog receipt={data.receipt} open={receiptOpen} onOpenChange={setReceiptOpen} />
        </>
      ) : null}
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

