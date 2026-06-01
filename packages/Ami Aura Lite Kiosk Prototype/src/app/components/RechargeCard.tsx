import React, { useState, useRef, useEffect } from "react";
import { Plus, Minus, Check, Search, ChevronDown, Printer } from "lucide-react";
import { PaymentStep } from "./PaymentStep";

const CUSTOMERS = [
  { id: "c1", name: "阿明", no: "10007", balance: 160, giftBalance: 20 },
  { id: "c2", name: "张三", no: "10001", balance: 320, giftBalance: 50 },
  { id: "c3", name: "李四", no: "10002", balance: 80, giftBalance: 0 },
  { id: "c4", name: "王五", no: "10003", balance: 540, giftBalance: 100 },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export interface RechargeResult {
  customerName: string;
  amount: number;
  giftAmount: number;
  newBalance: number;
  payMethod: string;
}

function CustomerSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = CUSTOMERS.find((c) => c.id === value)!;
  const filtered = CUSTOMERS.filter(
    (c) =>
      c.name.includes(search) || c.no.includes(search)
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
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
        className="w-full px-3 py-2.5 border border-black/15 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#2D1B69] flex items-center justify-between gap-2 hover:border-[#2D1B69]/40 transition-colors"
      >
        <span>{selected.name} ({selected.no})</span>
        <ChevronDown className={`w-4 h-4 text-[#6F6678] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-black/15 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-black/10">
            <Search className="w-3.5 h-3.5 text-[#6F6678] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名或会员号"
              className="flex-1 text-sm text-[#1F1B2D] outline-none placeholder:text-[#B0A8BB] bg-transparent"
            />
          </div>
          <ul className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-[#B0A8BB] text-center">无匹配结果</li>
            ) : (
              filtered.map((c) => (
                <li
                  key={c.id}
                  onClick={() => handleSelect(c.id)}
                  className={`px-3 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                    c.id === value
                      ? "bg-[#2D1B69]/8 text-[#2D1B69] font-medium"
                      : "text-[#1F1B2D] hover:bg-black/5"
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-[#6F6678]">{c.no}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RechargeCard({ onComplete }: { onComplete: (result: RechargeResult) => void }) {
  const [customerId, setCustomerId] = useState(CUSTOMERS[0].id);
  const [amount, setAmount] = useState(0);
  const [giftAmount, setGiftAmount] = useState(0);
  const [note, setNote] = useState("");

  const customer = CUSTOMERS.find((c) => c.id === customerId)!;
  const isValid = amount > 0;

  const handleConfirm = (payMethodLabel: string) => {
    onComplete({
      customerName: customer.name,
      amount,
      giftAmount,
      newBalance: customer.balance + amount,
      payMethod: payMethodLabel,
    });
  };

  const labelCls = "text-sm text-[#6F6678] mb-1.5 block";
  const inputCls = "w-full px-3 py-2.5 border border-black/15 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#2D1B69] transition-colors placeholder:text-[#B0A8BB]";

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-[#1F1B2D]">会员充值</h3>

      <div className="grid grid-cols-3 gap-x-5 gap-y-4">
        {/* 行1：客户选择 + 余额信息 */}
        <div>
          <label className={labelCls}><span className="text-red-500">*</span> 客户</label>
          <CustomerSelect value={customerId} onChange={setCustomerId} />
        </div>
        <div className="col-span-2 flex items-end pb-0.5">
          <div className="flex items-center gap-4 px-4 py-2.5 bg-[#FFF3EE] border border-[#F5C4A8]/40 rounded-xl w-full h-[42px]">
            <span className="text-sm font-semibold text-[#1F1B2D] shrink-0">{customer.name} ({customer.no})</span>
            <span className="text-black/15 shrink-0">|</span>
            <span className="text-sm text-[#6F6678] shrink-0">
              余额：<span className="text-green-600 font-semibold">¥{customer.balance.toFixed(0)}</span>
            </span>
            <span className="text-black/15 shrink-0">|</span>
            <span className="text-sm text-[#6F6678] shrink-0">
              赠送：<span className="text-[#C9956C] font-semibold">¥{customer.giftBalance.toFixed(0)}</span>
            </span>
          </div>
        </div>

        {/* 行2：充值金额 + 赠送金额 + 支付方式 */}
        <div>
          <label className={labelCls}><span className="text-red-500">*</span> 充值金额</label>
          <div className="flex items-center border border-black/15 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setAmount((v) => Math.max(0, +(v - 100).toFixed(2)))}
              className="w-9 h-10 flex items-center justify-center text-[#6F6678] hover:bg-[#F7F5F2] transition-colors shrink-0 border-r border-black/10"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              value={amount === 0 ? "" : amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              placeholder="0.00"
              className="flex-1 text-center text-sm text-[#1F1B2D] outline-none border-none bg-transparent py-2"
              min={0}
              step={100}
            />
            <button
              onClick={() => setAmount((v) => +(v + 100).toFixed(2))}
              className="w-9 h-10 flex items-center justify-center text-[#6F6678] hover:bg-[#F7F5F2] transition-colors shrink-0 border-l border-black/10"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 赠送金额 */}
        <div>
          <label className={labelCls}>赠送金额</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6F6678]">¥</span>
            <input
              type="number"
              value={giftAmount === 0 ? "" : giftAmount}
              onChange={(e) => setGiftAmount(Math.max(0, Number(e.target.value)))}
              placeholder="0.00"
              className={`${inputCls} pl-7`}
              min={0}
            />
          </div>
        </div>

        {/* 备注 */}
        <div className="col-span-3">
          <label className={labelCls}>备注（选填）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="相关说明"
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>

      <PaymentStep
        amount={amount}
        disabled={!isValid}
        confirmLabel={`确认充值 ¥${amount > 0 ? amount.toFixed(2) : "0.00"}`}
        onConfirm={(_key, label) => handleConfirm(label)}
      />
    </div>
  );
}

export function RechargeSuccessCard({ result }: { result: RechargeResult }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <Check className="w-5 h-5 text-green-600" />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <p className="text-base font-semibold text-[#1F1B2D]">充值成功</p>
        <p className="text-sm text-[#6F6678]">
          {result.customerName} · {result.payMethod} · 充值
          <span className="text-[#2D1B69] font-medium"> ¥{result.amount.toFixed(2)}</span>
          {result.giftAmount > 0 && (
            <span className="text-[#C9956C]"> + 赠 ¥{result.giftAmount.toFixed(2)}</span>
          )}
          ，余额 <span className="text-green-600 font-medium">¥{result.newBalance.toFixed(2)}</span>
        </p>
      </div>
      <button className="flex items-center gap-1.5 px-4 py-2 border border-black/15 text-[#1F1B2D] rounded-lg text-sm font-medium hover:bg-black/5 transition-colors active:scale-95 shrink-0">
        <Printer className="w-3.5 h-3.5" />
        打印小票
      </button>
    </div>
  );
}
