import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Minus, Plus, Printer, Search } from "lucide-react";
import { PaymentStep } from "./PaymentStep";

export interface RechargeCustomerOption {
  id: string;
  name: string;
  no: string;
  balance: number;
  giftBalance: number;
}

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export interface RechargeResult {
  customerName: string;
  amount: number;
  giftAmount: number;
  newBalance: number;
  payMethod: string;
}

export interface RechargeSubmitPayload {
  customerId: string;
  amount: number;
  giftAmount: number;
  note: string;
  payMethod: string;
}

function CustomerSelect({
  value,
  customers,
  onChange,
}: {
  value: string;
  customers: RechargeCustomerOption[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = customers.find((customer) => customer.id === value);
  const filtered = customers.filter((customer) => customer.name.includes(search) || customer.no.includes(search));

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (!customers.length) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        disabled={!customers.length}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-[#1F1B2D] outline-none transition-colors hover:border-[#2D1B69]/40 focus:border-[#2D1B69] disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-[#9B92A3]"
      >
        <span>{selected ? `${selected.name} (${selected.no})` : "暂无可选客户"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#6F6678] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-black/15 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#6F6678]" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索姓名或会员号"
              className="flex-1 bg-transparent text-sm text-[#1F1B2D] outline-none placeholder:text-[#B0A8BB]"
            />
          </div>
          <ul className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-center text-sm text-[#B0A8BB]">无匹配结果</li>
            ) : (
              filtered.map((customer) => (
                <li
                  key={customer.id}
                  onClick={() => handleSelect(customer.id)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                    customer.id === value ? "bg-[#2D1B69]/8 font-medium text-[#2D1B69]" : "text-[#1F1B2D] hover:bg-black/5"
                  }`}
                >
                  <span>{customer.name}</span>
                  <span className="text-xs text-[#6F6678]">{customer.no}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RechargeCard({
  customers = [],
  onComplete,
  onSubmit,
}: {
  customers?: RechargeCustomerOption[];
  onComplete: (result: RechargeResult) => void;
  onSubmit?: (payload: RechargeSubmitPayload) => void | Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [giftAmount, setGiftAmount] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const customer = customers.find((item) => item.id === customerId);
  const isValid = Boolean(customer && amount > 0 && onSubmit);

  useEffect(() => {
    if (!customers.some((item) => item.id === customerId)) {
      setCustomerId(customers[0]?.id ?? "");
    }
  }, [customerId, customers]);

  const handleConfirm = async (_key: string, payMethodLabel: string) => {
    if (!customer || !onSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        customerId: customer.id,
        amount,
        giftAmount,
        note,
        payMethod: payMethodLabel,
      });
      onComplete({
        customerName: customer.name,
        amount,
        giftAmount,
        newBalance: customer.balance + amount,
        payMethod: payMethodLabel,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const labelCls = "mb-1.5 block text-sm text-[#6F6678]";
  const inputCls =
    "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-[#1F1B2D] outline-none transition-colors placeholder:text-[#B0A8BB] focus:border-[#2D1B69]";

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-[#1F1B2D]">会员充值</h3>

      {!customers.length ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          暂无真实客户数据，请接入充值上下文后使用。
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-x-5 gap-y-4">
        <div>
          <label className={labelCls}>
            <span className="text-red-500">*</span> 客户
          </label>
          <CustomerSelect value={customerId} customers={customers} onChange={setCustomerId} />
        </div>
        <div className="col-span-2 flex items-end pb-0.5">
          <div className="flex h-[42px] w-full items-center gap-4 rounded-xl border border-[#F5C4A8]/40 bg-[#FFF3EE] px-4 py-2.5">
            {customer ? (
              <>
                <span className="shrink-0 text-sm font-semibold text-[#1F1B2D]">
                  {customer.name} ({customer.no})
                </span>
                <span className="shrink-0 text-black/15">|</span>
                <span className="shrink-0 text-sm text-[#6F6678]">
                  余额：<span className="font-semibold text-green-600">¥{customer.balance.toFixed(0)}</span>
                </span>
                <span className="shrink-0 text-black/15">|</span>
                <span className="shrink-0 text-sm text-[#6F6678]">
                  赠送：<span className="font-semibold text-[#C9956C]">¥{customer.giftBalance.toFixed(0)}</span>
                </span>
              </>
            ) : (
              <span className="text-sm text-[#9B92A3]">暂无客户余额信息</span>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>
            <span className="text-red-500">*</span> 充值金额
          </label>
          <div className="flex items-center overflow-hidden rounded-lg border border-black/15 bg-white">
            <button type="button" onClick={() => setAmount((value) => Math.max(0, +(value - 100).toFixed(2)))} className="flex h-10 w-9 shrink-0 items-center justify-center border-r border-black/10 text-[#6F6678] hover:bg-[#F7F5F2]">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              value={amount === 0 ? "" : amount}
              onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))}
              placeholder="0.00"
              className="flex-1 border-none bg-transparent py-2 text-center text-sm text-[#1F1B2D] outline-none"
              min={0}
              step={100}
            />
            <button type="button" onClick={() => setAmount((value) => +(value + 100).toFixed(2))} className="flex h-10 w-9 shrink-0 items-center justify-center border-l border-black/10 text-[#6F6678] hover:bg-[#F7F5F2]">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((quickAmount) => (
              <button key={quickAmount} type="button" onClick={() => setAmount(quickAmount)} className="rounded-lg border border-black/10 px-3 py-1 text-xs text-[#6F6678] hover:bg-black/5">
                ¥{quickAmount}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>赠送金额</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6F6678]">¥</span>
            <input
              type="number"
              value={giftAmount === 0 ? "" : giftAmount}
              onChange={(event) => setGiftAmount(Math.max(0, Number(event.target.value)))}
              placeholder="0.00"
              className={`${inputCls} pl-7`}
              min={0}
            />
          </div>
        </div>

        <div className="col-span-3">
          <label className={labelCls}>备注（选填）</label>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="相关说明" rows={2} className={`${inputCls} resize-none`} />
        </div>
      </div>

      <PaymentStep
        amount={amount}
        disabled={!isValid || submitting}
        confirmLabel={submitting ? "提交中" : `确认充值 ¥${amount > 0 ? amount.toFixed(2) : "0.00"}`}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

export function RechargeSuccessCard({ result }: { result: RechargeResult }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
        <Check className="h-5 w-5 text-green-600" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-base font-semibold text-[#1F1B2D]">充值成功</p>
        <p className="text-sm text-[#6F6678]">
          {result.customerName} · {result.payMethod} · 充值
          <span className="font-medium text-[#2D1B69]"> ¥{result.amount.toFixed(2)}</span>
          {result.giftAmount > 0 && <span className="text-[#C9956C]"> + 赠 ¥{result.giftAmount.toFixed(2)}</span>}，余额
          <span className="font-medium text-green-600">¥{result.newBalance.toFixed(2)}</span>
        </p>
      </div>
      <button type="button" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-[#1F1B2D] transition-colors hover:bg-black/5">
        <Printer className="h-3.5 w-3.5" />
        打印小票
      </button>
    </div>
  );
}
