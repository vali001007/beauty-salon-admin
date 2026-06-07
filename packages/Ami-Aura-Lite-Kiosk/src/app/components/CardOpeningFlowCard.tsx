import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard } from "lucide-react";
import type { CardOpeningConfirmInput, CardOpeningFlowData, CardOpenOption, CustomerSelectItem } from "../types";
import { cn } from "./ui/utils";
import { CustomerSelectList } from "./CustomerSelectList";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const PAYMENT_METHODS: CardOpeningConfirmInput["paymentMethod"][] = ["微信", "支付宝", "银行卡", "现金"];

export function CardOpeningFlowCard({
  data,
  onConfirm,
}: {
  data: CardOpeningFlowData;
  onConfirm: (input: CardOpeningConfirmInput) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSelectItem | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardOpenOption | null>(null);
  const [selectedCardType, setSelectedCardType] = useState("全部");
  const [discountAmount, setDiscountAmount] = useState("");
  const [giftProjects, setGiftProjects] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<CardOpeningConfirmInput["paymentMethod"]>("微信");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customers = safeArray(data.customers);
  const cards = safeArray(data.cards);
  const cardTypeOptions = useMemo(() => ["全部", ...Array.from(new Set(cards.map((card) => card.type).filter(Boolean)))], [cards]);
  const visibleCards = useMemo(
    () => selectedCardType === "全部" ? cards : cards.filter((card) => card.type === selectedCardType),
    [cards, selectedCardType],
  );

  const discount = Math.min(selectedCard?.price ?? 0, Math.max(0, Number(discountAmount) || 0));
  const receivable = Math.max(0, (selectedCard?.price ?? 0) - discount);

  useEffect(() => {
    if (selectedCard && selectedCardType !== "全部" && selectedCard.type !== selectedCardType) {
      setSelectedCard(null);
    }
  }, [selectedCard, selectedCardType]);

  const toggleGiftProject = (project: string) => {
    setGiftProjects((prev) => prev.includes(project) ? prev.filter((item) => item !== project) : [...prev, project]);
  };

  const submit = async () => {
    if (!selectedCustomer || !selectedCard) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        customerId: selectedCustomer.id,
        cardId: selectedCard.id,
        discountAmount: discount,
        giftProjects,
        paymentMethod,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "开卡提交失败");
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) return null;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div>
        <div className="text-2xl font-semibold text-[#1F1B2D]">{step === 1 ? data.title : "确认开卡"}</div>
        <div className="mt-1 text-sm text-[#6F6678]">{data.subtitle} · {data.source}</div>
        <div className="mt-1 text-xs text-[#9B92A3]">生成时间 {data.generatedAt}</div>
      </div>
      {error ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      {step === 1 ? (
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-3 text-sm font-medium text-[#6F6678]">第一步：选择客户</div>
            <CustomerSelectList customers={customers} selectedCustomerId={selectedCustomer?.id} onSelect={setSelectedCustomer} />
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-[#6F6678]">第二步：选择次卡</div>
              <div className="text-xs text-[#9B92A3]">共 {visibleCards.length} 张，选中后继续</div>
            </div>
            {cardTypeOptions.length > 2 ? (
              <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-[#F7F5F2] p-1">
                {cardTypeOptions.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedCardType(type)}
                    className={cn(
                      "h-8 shrink-0 rounded-lg px-3 text-xs font-medium transition",
                      selectedCardType === type ? "bg-white text-[#1F1B2D] shadow-sm" : "text-[#6F6678] hover:bg-white/70",
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="max-h-[236px] overflow-y-auto pr-1">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedCard(card)}
                    className={cn(
                      "min-h-[76px] rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99]",
                      selectedCard?.id === card.id
                        ? "border-[#2D1B69] bg-[#2D1B69]/6 shadow-[0_0_0_1px_rgba(45,27,105,0.08)]"
                        : "border-black/5 bg-[#F7F5F2] hover:border-[#C9956C]/50 hover:bg-white",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <CreditCard className="h-4 w-4 shrink-0 text-[#2D1B69]" />
                          <span className="truncate text-sm font-semibold text-[#1F1B2D]">{card.name}</span>
                        </div>
                        <div className="mt-1 text-xs text-[#6F6678]">{card.type} · {card.totalTimes} 次</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-base font-bold text-[#1F1B2D]">￥{card.price.toLocaleString()}</div>
                        {selectedCard?.id === card.id ? <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-[#C9956C]" /> : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!selectedCustomer || !selectedCard}
            className="h-13 rounded-2xl bg-[#C9956C] text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一步：优惠与赠送
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-[#2D1B69] p-5 text-white">
            <div className="text-sm text-white/70">{selectedCustomer?.name} · {selectedCard?.name}</div>
            <div className="mt-5 text-4xl font-bold">￥{receivable.toLocaleString()}</div>
            <div className="mt-2 text-sm text-white/60">原价 ￥{selectedCard?.price.toLocaleString()} · 优惠 ￥{discount.toLocaleString()}</div>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[#6F6678]">优惠金额</span>
            <input value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} type="number" min={0} placeholder="输入优惠金额" className="h-12 rounded-xl border border-black/10 px-4 outline-none focus:border-[#C9956C]" />
          </label>
          <div>
            <div className="mb-2 text-sm font-medium text-[#6F6678]">赠送项目</div>
            <div className="flex flex-wrap gap-2">
              {safeArray(selectedCard?.projects).map((project) => (
                <button key={project} type="button" onClick={() => toggleGiftProject(project)} className={cn("rounded-xl border px-3 py-2 text-sm", giftProjects.includes(project) ? "border-[#2D1B69] bg-[#2D1B69] text-white" : "border-black/10 bg-white text-[#1F1B2D]")}>
                  {project}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map((method) => (
              <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={cn("h-12 rounded-xl border text-sm font-medium", paymentMethod === method ? "border-[#2D1B69] bg-[#2D1B69] text-white" : "border-black/10 bg-white")}>
                {method}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(1)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium">返回修改</button>
            <button type="button" disabled={loading} onClick={submit} className="h-12 rounded-xl bg-[#1F1B2D] text-sm font-semibold text-white disabled:opacity-60">
              {loading ? "正在开卡..." : "确认开卡"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
