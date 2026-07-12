import React, { useMemo, useState } from "react";
import { ChevronDown, Search, RotateCcw } from "lucide-react";
import type { RefundConfirmInput, RefundFlowData, RefundOrderOption } from "../types";
import { cn } from "./ui/utils";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function money(value: number) {
  return `￥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateText(value?: string) {
  return value ? value.replace("T", " ").slice(0, 16) : "-";
}

function dateOnly(value?: string) {
  return value ? value.replace("T", " ").slice(0, 10) : "";
}

function getTodayKey(data: RefundFlowData) {
  return dateOnly(data.generatedAt) || new Date().toISOString().slice(0, 10);
}

export function RefundFlowCard({
  data,
  onConfirm,
}: {
  data: RefundFlowData;
  onConfirm: (input: RefundConfirmInput) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<RefundOrderOption | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("客户申请退款");
  const [refundMode, setRefundMode] = useState<'refund_only' | 'return_and_refund'>('refund_only');
  const [selectedItems, setSelectedItems] = useState<Record<number, boolean>>({});
  const [searchKeyword, setSearchKeyword] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orders = safeArray(data.orders);
  const todayKey = getTodayKey(data);
  const refundAmount = Math.max(0, Number(amount) || 0);
  const selectedRefundItems = useMemo(() => safeArray(selectedOrder?.items).filter((item) => selectedItems[item.orderItemId]).map((item) => ({
    orderItemId: item.orderItemId,
    quantity: item.remainingRefundableQuantity,
    refundAmount: item.remainingRefundableAmount,
  })), [selectedItems, selectedOrder]);
  const isCardOrder = String(selectedOrder?.orderKind) === 'card';
  const calculatedAmount = isCardOrder ? refundAmount : selectedRefundItems.reduce((sum, item) => sum + Number(item.refundAmount ?? 0), 0);
  const canSubmit = Boolean(selectedOrder && calculatedAmount > 0 && calculatedAmount <= (selectedOrder?.refundableAmount ?? 0) && (isCardOrder || selectedRefundItems.length));

  const todayOrders = useMemo(
    () => orders.filter((order) => dateOnly(order.createdAt) === todayKey),
    [orders, todayKey],
  );
  const filteredOrders = useMemo(
    () => {
      const keyword = searchKeyword.trim().toLowerCase();
      if (!keyword) return todayOrders;
      return orders.filter((order) =>
        [
          order.customerName,
          order.customerPhone,
          order.orderNo,
          order.kindLabel,
          order.itemSummary,
          order.paymentMethod,
          order.storeName,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword)),
      );
    },
    [orders, searchKeyword, todayOrders],
  );

  const chooseOrder = (order: RefundOrderOption) => {
    setSelectedOrder(order);
    setAmount(String(order.refundableAmount));
    setReason("客户申请退款");
    setRefundMode('refund_only');
    setSelectedItems({});
    setSearchKeyword(`${order.customerName || "散客"} · ${order.orderNo}`);
    setDropdownOpen(false);
    setStep(2);
    setError(null);
  };

  const submit = async () => {
    if (!selectedOrder) return;
    if (!canSubmit) {
      setError(`退款金额需大于 0，且不能超过 ${money(selectedOrder.refundableAmount)}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        orderId: selectedOrder.id,
        orderKind: selectedOrder.orderKind,
        amount: calculatedAmount,
        reason: reason.trim() || "客户申请退款",
        requestId: globalThis.crypto?.randomUUID?.() ?? `refund-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        refundMode,
        items: selectedRefundItems,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "退款提交失败");
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) return null;

  const renderOrderOption = (order: RefundOrderOption) => (
    <button
      key={order.id}
      type="button"
      onClick={() => chooseOrder(order)}
      className="grid w-full gap-2 border-b border-black/5 px-4 py-3 text-left transition last:border-b-0 hover:bg-[#F7F5F2]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#1F1B2D]">{order.customerName || "散客"}</div>
          <div className="mt-1 text-xs text-[#6F6678]">
            {order.kindLabel} · {order.orderNo} · {dateText(order.createdAt)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[#9B92A3]">可退</div>
          <div className="text-base font-semibold text-red-600">{money(order.refundableAmount)}</div>
        </div>
      </div>
      <div className="line-clamp-2 text-sm text-[#6F6678]">{order.itemSummary}</div>
      <div className="text-xs text-[#9B92A3]">{order.paymentMethod || "未记录支付方式"}</div>
    </button>
  );

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-2xl font-semibold text-[#1F1B2D]">
            <RotateCcw className="h-6 w-6 text-red-500" />
            {data.title}
          </div>
          <div className="mt-1 text-sm text-[#6F6678]">{data.subtitle} · {data.source}</div>
          <div className="mt-1 text-xs text-[#9B92A3]">生成时间 {data.generatedAt}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2].map((item) => (
            <span
              key={item}
              className={cn(
                "h-2 rounded-full transition-all",
                item === step ? "w-5 bg-[#C9956C]" : item < step ? "w-2 bg-[#C9956C]/50" : "w-2 bg-black/10",
              )}
            />
          ))}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      {step === 1 ? (
        <div className="grid gap-4">
          <div>
            <div className="text-sm font-medium text-[#6F6678]">第一步：选择今日收银订单</div>
            <div className="mt-1 text-xs text-[#9B92A3]">点击输入框查看今日收银列表；输入关键词后搜索全部收银记录。</div>
          </div>

          <div className="relative">
            <div
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl border bg-white px-4 shadow-sm transition",
                dropdownOpen ? "border-[#C9956C] ring-2 ring-[#C9956C]/15" : "border-black/10",
              )}
            >
              <Search className="h-4 w-4 shrink-0 text-[#9B92A3]" />
              <input
                value={searchKeyword}
                onFocus={() => setDropdownOpen(true)}
                onClick={() => setDropdownOpen(true)}
                onChange={(event) => {
                  setSearchKeyword(event.target.value);
                  setDropdownOpen(true);
                  setSelectedOrder(null);
                }}
                placeholder="搜索客户 / 手机号 / 收银号"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[#1F1B2D] outline-none placeholder:text-[#B7AFBE]"
              />
              <button
                type="button"
                onClick={() => setDropdownOpen((value) => !value)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F7F5F2] text-[#6F6678]"
              >
                <ChevronDown className={cn("h-4 w-4 transition", dropdownOpen ? "rotate-180" : "")} />
              </button>
            </div>
            {dropdownOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_18px_48px_rgba(31,27,45,0.16)]">
                <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 text-xs text-[#9B92A3]">
                  <span>{searchKeyword.trim() ? "全部收银记录搜索" : `今日收银列表 · ${todayKey}`}</span>
                  <span>{filteredOrders.length} / {searchKeyword.trim() ? orders.length : todayOrders.length} 单</span>
                </div>
                {filteredOrders.length ? (
                  <div className="max-h-[360px] overflow-y-auto">{filteredOrders.map(renderOrderOption)}</div>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-[#6F6678]">
                    {todayOrders.length ? "未找到匹配订单" : "今日暂无可退款收银订单"}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {selectedOrder ? (
            <div className="rounded-2xl border border-[#C9956C]/30 bg-[#FFF9F4] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#1F1B2D]">{selectedOrder.customerName || "散客"}</div>
                  <div className="mt-1 text-xs text-[#6F6678]">
                    {selectedOrder.kindLabel} · {selectedOrder.orderNo} · {dateText(selectedOrder.createdAt)}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm text-[#6F6678]">{selectedOrder.itemSummary}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#9B92A3]">可退</div>
                  <div className="text-base font-semibold text-red-600">{money(selectedOrder.refundableAmount)}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="rounded-2xl bg-[#2D1B69] p-5 text-white">
            <div className="text-sm text-white/70">{selectedOrder?.customerName} · {selectedOrder?.orderNo}</div>
            <div className="mt-4 text-3xl font-bold">{money(calculatedAmount)}</div>
            <div className="mt-2 text-sm text-white/60">可退金额 {money(selectedOrder?.refundableAmount ?? 0)}</div>
          </div>
          {!isCardOrder ? <div className="grid gap-3">
            <div className="text-sm font-medium text-[#6F6678]">退款方式</div>
            <label className="flex items-center gap-2 rounded-xl border border-black/10 p-3">
              <input aria-label="仅退款不退货" type="radio" checked={refundMode === 'refund_only'} onChange={() => setRefundMode('refund_only')} />
              <span>仅退款不退货</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-black/10 p-3">
              <input aria-label="退款退货" type="radio" checked={refundMode === 'return_and_refund'} disabled={!selectedOrder?.allowedModes?.includes('return_and_refund')} onChange={() => setRefundMode('return_and_refund')} />
              <span>退款退货（商品入库 / 项目耗材冲销）</span>
            </label>
            <div className="text-sm font-medium text-[#6F6678]">退款明细</div>
            {safeArray(selectedOrder?.items).map((item) => (
              <label key={item.orderItemId} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 p-3">
                <span className="flex items-center gap-2"><input aria-label={`选择${item.name}`} type="checkbox" checked={Boolean(selectedItems[item.orderItemId])} onChange={(event) => setSelectedItems((state) => ({ ...state, [item.orderItemId]: event.target.checked }))} />{item.name}</span>
                <span className="text-xs text-[#6F6678]">{item.remainingRefundableQuantity} · {money(item.remainingRefundableAmount)}</span>
              </label>
            ))}
          </div> : <label className="grid gap-2">
            <span className="text-sm font-medium text-[#6F6678]">退款金额</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              min={0}
              max={selectedOrder?.refundableAmount}
              step="0.01"
              className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]"
            />
          </label>}
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[#6F6678]">退款原因</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-24 rounded-xl border border-black/10 px-4 py-3 outline-none focus:border-[#C9956C]"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(1)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium">
              返回选订单
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading || !canSubmit}
              className="h-12 rounded-xl bg-[#1F1B2D] text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "正在退款..." : "确认退款"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
