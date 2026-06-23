import React, { useEffect, useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import type { CardOpeningConfirmInput, CardOpeningFlowData, CardOpenOption, CustomerSelectItem } from "../types";
import { cn } from "./ui/utils";
import { CustomerAsyncSelect } from "./CustomerAsyncSelect";
import { GiftProjectDetails } from "./GiftProjectDetails";

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
  const [discountAmount, setDiscountAmount] = useState("");
  const [giftProjects, setGiftProjects] = useState<string[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CardOpeningConfirmInput["paymentMethod"]>("微信");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customers = safeArray(data.customers);
  const cards = safeArray(data.cards);
  const availableGiftProjects = safeArray(data.giftProjects);
  const salesUsers = safeArray(data.salesUsers);
  const cardsByType = useMemo(() => {
    const groups = new Map<string, CardOpenOption[]>();
    cards.forEach((card) => {
      const type = card.type || "其他";
      groups.set(type, [...(groups.get(type) ?? []), card]);
    });
    return Array.from(groups.entries());
  }, [cards]);

  const discount = Math.min(selectedCard?.price ?? 0, Math.max(0, Number(discountAmount) || 0));
  const receivable = Math.max(0, (selectedCard?.price ?? 0) - discount);
  const includedProjects = safeArray(selectedCard?.projects);

  useEffect(() => {
    if (selectedCard && !cards.some((card) => card.id === selectedCard.id)) {
      setSelectedCard(null);
      setGiftProjects([]);
    }
  }, [cards, selectedCard]);

  useEffect(() => {
    setGiftProjects((prev) => {
      const next = prev.filter((project) => availableGiftProjects.includes(project));
      return next.length === prev.length ? prev : next;
    });
  }, [availableGiftProjects]);

  useEffect(() => {
    if (selectedOperatorId && !salesUsers.some((user) => String(user.id) === selectedOperatorId)) {
      setSelectedOperatorId("");
    }
  }, [salesUsers, selectedOperatorId]);

  const selectCard = (cardId: string) => {
    const nextCard = cards.find((card) => String(card.id) === cardId) ?? null;
    setSelectedCard(nextCard);
    if (nextCard?.id !== selectedCard?.id) {
      setGiftProjects([]);
    }
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
        operatorId: selectedOperatorId ? Number(selectedOperatorId) : undefined,
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
            <CustomerAsyncSelect
              scene="card_opening"
              value={selectedCustomer?.id}
              onChange={(customer) => setSelectedCustomer(customer as CustomerSelectItem | null)}
              defaultItems={customers}
              placeholder="请选择办卡客户"
              searchPlaceholder="输入姓名或手机号搜索客户"
            />
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-[#6F6678]">第二步：选择次卡</div>
              <div className="text-xs text-[#9B92A3]">共 {cards.length} 张，选中后继续</div>
            </div>
            <div className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
              <select
                value={selectedCard ? String(selectedCard.id) : ""}
                onChange={(event) => selectCard(event.target.value)}
                disabled={!cards.length}
                className="h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1F1B2D] outline-none focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-[#9B92A3]"
              >
                <option value="">{cards.length ? "请选择次卡" : "暂无可售次卡"}</option>
                {cardsByType.map(([type, items]) => (
                  <optgroup key={type} label={type}>
                    {items.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name} · {card.totalTimes} 次 · ￥{card.price.toLocaleString()}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedCard ? (
                <div className="mt-3 grid gap-2 rounded-xl bg-white px-4 py-3 text-sm sm:grid-cols-4">
                  <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
                    <CreditCard className="h-4 w-4 shrink-0 text-[#2D1B69]" />
                    <span className="truncate font-semibold text-[#1F1B2D]">{selectedCard.name}</span>
                  </div>
                  <div className="text-[#6F6678]">
                    {selectedCard.type} · {selectedCard.totalTimes} 次
                  </div>
                  <div className="font-semibold text-[#1F1B2D] sm:text-right">￥{selectedCard.price.toLocaleString()}</div>
                  {includedProjects.length ? (
                    <div className="text-xs text-[#9B92A3] sm:col-span-4">
                      包含项目：{includedProjects.slice(0, 3).join("、")}
                      {includedProjects.length > 3 ? ` 等 ${includedProjects.length} 项` : ""}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-white px-4 py-5 text-center text-sm text-[#6F6678]">
                  选择次卡后将显示价格、次数和包含项目。
                </div>
              )}
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
          <GiftProjectDetails
            projects={availableGiftProjects}
            selectedProjects={giftProjects}
            onChange={setGiftProjects}
          />
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[#6F6678]">销售人员</span>
            <select
              value={selectedOperatorId}
              onChange={(event) => setSelectedOperatorId(event.target.value)}
              className="h-12 rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1F1B2D] outline-none focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
            >
              <option value="">不指定销售人员</option>
              {salesUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.username || `员工 ${user.id}`}{user.roleLabel ? ` · ${user.roleLabel}` : ""}
                </option>
              ))}
            </select>
          </label>
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
