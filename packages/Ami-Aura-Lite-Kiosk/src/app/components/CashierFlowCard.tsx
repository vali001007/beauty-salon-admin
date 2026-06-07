import React, { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import type { CashierConfirmInput, CashierCustomer, CashierFlowData, CashierOrderItemInput } from "../types";
import { cn } from "./ui/utils";
import { CustomerSelectList } from "./CustomerSelectList";

type CartItem = CashierOrderItemInput & { id: string; category: string };

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const MEMBER_CARD_PAYMENT_METHOD = "会员余额";

const PAYMENT_METHODS: Array<{
  value: CashierConfirmInput["paymentMethod"];
  label: string;
  requiresMemberCard?: boolean;
}> = [
  { value: "微信", label: "微信" },
  { value: "支付宝", label: "支付宝" },
  { value: "银行卡", label: "银行卡" },
  { value: "现金", label: "现金" },
  { value: MEMBER_CARD_PAYMENT_METHOD, label: "会员卡划扣", requiresMemberCard: true },
];

export function CashierFlowCard({
  data,
  onConfirm,
}: {
  data: CashierFlowData;
  onConfirm: (input: CashierConfirmInput) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CashierCustomer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CashierConfirmInput["paymentMethod"]>("微信");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customers = safeArray(data.customers);
  const catalog = safeArray(data.catalog);

  const subtotal = cart.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  const discount = Math.min(subtotal, Math.max(0, Number(discountAmount) || 0));
  const receivable = Math.max(0, subtotal - discount);
  const canUseMemberCardDeduct = Boolean(selectedCustomer?.memberCardDeductEnabled);
  const memberCardDeductLabel = selectedCustomer?.memberCardDeductLabel ?? "该客户暂无可划扣会员卡";

  useEffect(() => {
    if (paymentMethod === MEMBER_CARD_PAYMENT_METHOD && !canUseMemberCardDeduct) {
      setPaymentMethod("微信");
    }
  }, [canUseMemberCardDeduct, paymentMethod]);

  const addItem = (item: CashierFlowData["catalog"][number]) => {
    setCart((prev) => {
      const existing = prev.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        return prev.map((cartItem) => cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem);
      }
      return [
        ...prev,
        {
          id: item.id,
          itemType: item.itemType,
          itemId: item.itemId,
          name: item.name,
          category: item.category,
          quantity: 1,
          unitPrice: item.price,
        },
      ];
    });
  };

  const changeQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((item) => {
        if (item.id !== id) return [item];
        const quantity = item.quantity + delta;
        return quantity <= 0 ? [] : [{ ...item, quantity }];
      }),
    );
  };

  const submit = async () => {
    if (!selectedCustomer || cart.length === 0) return;
    if (paymentMethod === MEMBER_CARD_PAYMENT_METHOD && !canUseMemberCardDeduct) {
      setError("该客户暂无可划扣会员卡，请更换支付方式");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        customerId: selectedCustomer.id,
        items: cart,
        discountAmount: discount,
        paymentMethod,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "收银提交失败");
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold text-[#1F1B2D]">{step === 1 ? data.title : "确认收款"}</div>
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
        <div className="flex flex-col gap-5">
          <div>
            <CustomerSelectList
              customers={customers}
              selectedCustomerId={selectedCustomer?.id}
              onSelect={setSelectedCustomer}
            />
          </div>

          <div>
            <div className="mb-3 text-sm font-medium text-[#6F6678]">第二步：选择项目/商品，支持多选</div>
            <div className="flex flex-wrap gap-2">
              {catalog.map((item) => {
                const inCart = cart.find((cartItem) => cartItem.id === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition active:scale-[0.98]",
                      inCart ? "border-[#2D1B69] bg-[#2D1B69] text-white" : "border-black/10 bg-white text-[#1F1B2D] hover:border-[#C9956C]/60",
                    )}
                  >
                    {inCart ? <span className="rounded bg-white/20 px-1.5 text-xs">{inCart.quantity}</span> : <ShoppingBag className="h-4 w-4" />}
                    <span>{item.name}</span>
                    <span className="opacity-70">￥{item.price}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {cart.length ? (
            <div className="rounded-2xl border border-black/5 bg-[#F7F5F2]">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 last:border-b-0">
                  <div>
                    <div className="text-sm font-semibold text-[#1F1B2D]">{item.name}</div>
                    <div className="mt-0.5 text-xs text-[#6F6678]">{item.category} · ￥{item.unitPrice}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => changeQuantity(item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                    <button type="button" onClick={() => changeQuantity(item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setCart((prev) => prev.filter((cartItem) => cartItem.id !== item.id))} className="ml-1 text-rose-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-[#6F6678]">小计</span>
                <span className="text-lg font-semibold text-[#1F1B2D]">￥{subtotal.toLocaleString()}</span>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!selectedCustomer || cart.length === 0}
            className="h-13 rounded-2xl bg-[#C9956C] text-base font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            去收款 {subtotal > 0 ? `￥${subtotal.toLocaleString()}` : ""}
          </button>
        </div>
      ) : null}

      {step === 2 && selectedCustomer ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-[#2D1B69] p-5 text-white">
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>{selectedCustomer.name} · {selectedCustomer.phone}</span>
              <span>{cart.length} 个项目/商品</span>
            </div>
            <div className="mt-5 flex items-end gap-2">
              <span className="pb-2 text-sm text-white/70">应收</span>
              <span className="text-4xl font-bold">￥{receivable.toLocaleString()}</span>
            </div>
            {discount > 0 ? <div className="mt-2 text-sm text-white/60">已优惠 ￥{discount.toLocaleString()}</div> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">优惠金额（选填）</span>
              <input
                type="number"
                min={0}
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                placeholder="输入优惠金额"
                className="h-12 rounded-xl border border-black/10 bg-white px-4 text-sm text-[#1F1B2D] outline-none focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">支付方式</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {PAYMENT_METHODS.map((method) => {
                  const disabled = method.requiresMemberCard && !canUseMemberCardDeduct;
                  return (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => {
                        if (!disabled) setPaymentMethod(method.value);
                      }}
                      disabled={disabled}
                      title={method.requiresMemberCard ? memberCardDeductLabel : method.label}
                      className={cn(
                        "min-h-12 rounded-xl border px-2 py-2 text-sm font-medium leading-tight transition",
                        paymentMethod === method.value ? "border-[#2D1B69] bg-[#2D1B69] text-white" : "border-black/10 bg-white text-[#1F1B2D]",
                        disabled && "cursor-not-allowed border-black/5 bg-black/[0.03] text-[#9B92A3]",
                      )}
                    >
                      <span>{method.label}</span>
                      {method.requiresMemberCard ? (
                        <span className="mt-0.5 block text-[10px] font-normal opacity-70">{canUseMemberCardDeduct ? memberCardDeductLabel : "无卡置灰"}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(1)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium text-[#1F1B2D]">
              返回开单
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="h-12 rounded-xl bg-[#1F1B2D] text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? "正在收款..." : `确认收款 ￥${receivable.toLocaleString()}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
