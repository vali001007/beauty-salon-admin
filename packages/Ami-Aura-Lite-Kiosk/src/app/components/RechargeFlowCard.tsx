import React, { useState } from "react";
import type { CustomerSelectItem, RechargeConfirmInput, RechargeFlowData } from "../types";
import { cn } from "./ui/utils";
import { CustomerAsyncSelect } from "./CustomerAsyncSelect";
import { GiftProjectDetails } from "./GiftProjectDetails";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const PAYMENT_METHODS: RechargeConfirmInput["paymentMethod"][] = ["微信", "支付宝", "银行卡", "现金"];

export function RechargeFlowCard({
  data,
  onConfirm,
}: {
  data: RechargeFlowData;
  onConfirm: (input: RechargeConfirmInput) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSelectItem | null>(null);
  const [amount, setAmount] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftProjects, setGiftProjects] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<RechargeConfirmInput["paymentMethod"]>("微信");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customers = safeArray(data.customers);
  const availableGiftProjects = safeArray(data.giftProjects);

  const rechargeAmount = Math.max(0, Number(amount) || 0);
  const gift = Math.max(0, Number(giftAmount) || 0);

  const submit = async () => {
    if (!selectedCustomer || rechargeAmount <= 0) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        customerId: selectedCustomer.id,
        amount: rechargeAmount,
        giftAmount: gift,
        giftProjects,
        paymentMethod,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "充值提交失败");
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) return null;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div>
        <div className="text-2xl font-semibold text-[#1F1B2D]">{data.title}</div>
        <div className="mt-1 text-sm text-[#6F6678]">{data.subtitle} · {data.source}</div>
        <div className="mt-1 text-xs text-[#9B92A3]">生成时间 {data.generatedAt}</div>
      </div>
      {error ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      {step === 1 ? (
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-3 text-sm font-medium text-[#6F6678]">第一步：选择客户</div>
            <CustomerAsyncSelect
              scene="recharge"
              value={selectedCustomer?.id}
              onChange={(customer) => setSelectedCustomer(customer as CustomerSelectItem | null)}
              defaultItems={customers}
              placeholder="请选择充值客户"
              searchPlaceholder="输入姓名或手机号搜索客户"
            />
          </div>
          <button type="button" onClick={() => setStep(2)} disabled={!selectedCustomer} className="h-13 rounded-2xl bg-[#C9956C] text-base font-semibold text-white disabled:opacity-40">
            下一步：填写充值信息
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-[#2D1B69] p-5 text-white">
            <div className="text-sm text-white/70">{selectedCustomer?.name} · {selectedCustomer?.phone}</div>
            <div className="mt-5 text-4xl font-bold">￥{rechargeAmount.toLocaleString()}</div>
            <div className="mt-2 text-sm text-white/60">优惠/赠送金额 ￥{gift.toLocaleString()}</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">充值金额</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min={0} placeholder="输入充值金额" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">优惠金额</span>
              <input value={giftAmount} onChange={(event) => setGiftAmount(event.target.value)} type="number" min={0} placeholder="输入优惠/赠送金额" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
            </label>
          </div>
          <GiftProjectDetails
            projects={availableGiftProjects}
            selectedProjects={giftProjects}
            onChange={setGiftProjects}
          />
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={cn("h-12 rounded-xl border text-sm font-medium", paymentMethod === method ? "border-[#2D1B69] bg-[#2D1B69] text-white" : "border-black/10 bg-white")}>
                {method}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(1)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium">返回选客户</button>
            <button type="button" onClick={submit} disabled={loading || rechargeAmount <= 0} className="h-12 rounded-xl bg-[#1F1B2D] text-sm font-semibold text-white disabled:opacity-60">
              {loading ? "正在充值..." : "确认充值"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
