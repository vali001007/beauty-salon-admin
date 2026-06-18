import React, { useState } from "react";

export interface PaymentMethod {
  key: string;
  label: string;
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { key: "wechat", label: "微信支付" },
  { key: "alipay", label: "支付宝支付" },
  { key: "cash", label: "现金支付" },
  { key: "card", label: "银行卡" },
];

interface PaymentStepProps {
  amount: number;
  methods?: PaymentMethod[];
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: (key: string, label: string) => void;
  onCancel?: () => void;
}

export function PaymentStep({
  amount,
  methods = DEFAULT_PAYMENT_METHODS,
  confirmLabel,
  disabled = false,
  onConfirm,
  onCancel,
}: PaymentStepProps) {
  const [payMethod, setPayMethod] = useState(methods[0]?.key ?? "");
  const [cashReceived, setCashReceived] = useState("");

  const isCash = payMethod === "cash";
  const change = Math.max(0, Number(cashReceived) - amount);
  const canConfirm = !disabled && (!isCash || Number(cashReceived) >= amount);

  const handleConfirm = () => {
    if (!canConfirm) return;
    const method = methods.find((m) => m.key === payMethod) ?? methods[0];
    onConfirm(method.key, method.label);
  };

  return (
    <div className="flex flex-col gap-4 pt-4 border-t border-black/8">
      <div className="grid grid-cols-2 gap-x-5">
        <div>
          <label className="text-sm text-[#6F6678] mb-1.5 block">支付方式</label>
          <div className="relative">
            <select
              value={payMethod}
              onChange={(e) => { setPayMethod(e.target.value); setCashReceived(""); }}
              className="w-full px-3 py-2.5 border border-black/15 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#2D1B69] appearance-none pr-8"
            >
              {methods.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6F6678] text-xs">∨</span>
          </div>
        </div>
        {isCash && (
          <div>
            <label className="text-sm text-[#6F6678] mb-1.5 block">收款金额</label>
            <input
              type="number"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              placeholder={`≥ ${amount.toFixed(2)}`}
              className="w-full px-3 py-2.5 border border-[#C9956C]/30 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#C9956C] placeholder:text-[#B0A8BB]"
              autoFocus
            />
          </div>
        )}
      </div>

      {isCash && Number(cashReceived) > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-[#FFF8F4] border border-[#C9956C]/20 rounded-xl">
          <span className="text-sm text-[#6F6678]">找零</span>
          <span className="text-xl font-bold text-[#C9956C]">¥{change.toFixed(2)}</span>
        </div>
      )}

      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-8 py-2.5 border border-black/15 text-[#1F1B2D] rounded-lg text-sm font-medium hover:bg-black/5 transition-colors active:scale-95"
          >
            取 消
          </button>
        )}
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`px-8 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-95 text-white ${
            canConfirm ? "bg-[#2D1B69] hover:bg-[#3d2a8a]" : "bg-[#2D1B69]/40 cursor-not-allowed"
          }`}
        >
          {confirmLabel ?? `确认收款 ¥${amount.toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}
