import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Gift, Loader2, Search } from "lucide-react";
import type {
  CardVerificationCardOption,
  CardVerificationConfirmInput,
  CardVerificationCustomer,
  CardVerificationFlowData,
} from "../types";
import { cn } from "./ui/utils";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

type SelectedCustomer = CardVerificationCustomer & { cards?: CardVerificationCardOption[] };
type SelectedProject = CardVerificationCardOption["projects"][number] & {
  customerCardId: number;
  cardName: string;
  remainingTimes: number;
  expiryDate: string;
};

export function CardVerificationFlowCard({
  data,
  onLoadCustomerCards,
  onConfirm,
}: {
  data: CardVerificationFlowData;
  onLoadCustomerCards: (customerId: number) => Promise<SelectedCustomer & { cards: CardVerificationCardOption[] }>;
  onConfirm: (input: CardVerificationConfirmInput) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCards = safeArray(selectedCustomer?.cards);

  const customers = useMemo(() => {
    const keyword = searchQuery.trim();
    const sourceCustomers = safeArray(data.customers);
    if (!keyword) {
      const appointedToday = sourceCustomers.filter((customer) => customer.isAppointedToday);
      return (appointedToday.length ? appointedToday : sourceCustomers).slice(0, 8);
    }
    return sourceCustomers
      .filter((customer) => customer.name.includes(keyword) || customer.phone.includes(keyword))
      .slice(0, 12);
  }, [data.customers, searchQuery]);

  const chooseCustomer = async (customer: CardVerificationCustomer) => {
    setLoading(true);
    setError(null);
    try {
      const detail = await onLoadCustomerCards(customer.id);
      setSelectedCustomer(detail);
      setSelectedProject(null);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "客户卡项加载失败");
    } finally {
      setLoading(false);
    }
  };

  const chooseProject = (card: CardVerificationCardOption, project: CardVerificationCardOption["projects"][number]) => {
    setSelectedProject({
      ...project,
      customerCardId: card.customerCardId,
      cardName: card.cardName,
      remainingTimes: card.remainingTimes,
      expiryDate: card.expiryDate,
    });
    setStep(3);
  };

  const confirm = async () => {
    if (!selectedCustomer || !selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        customerId: selectedCustomer.id,
        customerCardId: selectedProject.customerCardId,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        times: selectedProject.times,
      });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "核销提交失败");
    } finally {
      setLoading(false);
    }
  };

  if (step === 4) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold text-[#1F1B2D]">{data.title}</div>
          <div className="mt-1 text-sm text-[#6F6678]">{data.subtitle} · {data.source}</div>
          <div className="mt-1 text-xs text-[#9B92A3]">生成时间 {data.generatedAt}</div>
        </div>
        {step < 4 ? (
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((item) => (
              <span
                key={item}
                className={cn(
                  "h-2 rounded-full transition-all",
                  item === step ? "w-5 bg-[#C9956C]" : item < step ? "w-2 bg-[#C9956C]/50" : "w-2 bg-black/10",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium text-[#6F6678]">第一步：选择客户，默认优先显示当天预约客户</div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6F6678]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="输入客户姓名或手机号搜索"
              className="h-14 w-full rounded-2xl border border-black/10 bg-white pl-12 pr-4 text-base text-[#1F1B2D] outline-none transition focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
            />
          </div>
          <div className="flex flex-col gap-3">
            {customers.length ? (
              customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => chooseCustomer(customer)}
                  disabled={loading}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-black/5 bg-[#F7F5F2] p-4 text-left transition hover:border-[#C9956C]/60 hover:bg-[#C9956C]/5 disabled:cursor-wait disabled:opacity-60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2D1B69] to-[#C9956C] text-base font-semibold text-white">
                      {customer.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold text-[#1F1B2D]">{customer.name}</span>
                        {customer.isAppointedToday ? (
                          <span className="rounded-full bg-[#2D1B69]/8 px-2.5 py-1 text-xs font-medium text-[#2D1B69]">
                            预约 {customer.appointmentTime}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-[#6F6678]">{customer.phone} · {customer.memberLevel}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[customer.profileLabel, ...safeArray(customer.tags)].filter(Boolean).slice(0, 4).map((tag) => (
                          <span key={`${customer.id}-${tag}`} className="rounded-full bg-white px-2.5 py-1 text-xs text-[#6F6678]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {loading && selectedCustomer?.id === customer.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-5 w-5 text-[#9B92A3]" />}
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-black/10 bg-[#F7F5F2] p-8 text-center text-sm text-[#6F6678]">
                未找到匹配客户，请检查姓名或手机号。
              </div>
            )}
          </div>
        </div>
      ) : null}

      {step === 2 && selectedCustomer ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[#6F6678]">第二步：选择次卡核销内容</div>
              <div className="mt-1 text-base font-semibold text-[#1F1B2D]">{selectedCustomer.name} · {selectedCustomer.memberLevel}</div>
            </div>
            <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-black/10 px-3 py-2 text-xs text-[#6F6678]">
              重新选择
            </button>
          </div>
          {selectedCards.length ? (
            <div className="flex flex-col gap-3">
              {selectedCards.map((card) => (
                <div key={card.customerCardId} className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2D1B69]/8">
                        <Gift className="h-5 w-5 text-[#2D1B69]" />
                      </div>
                      <div>
                        <div className="font-semibold text-[#1F1B2D]">{card.cardName}</div>
                        <div className="mt-1 text-xs text-[#6F6678]">剩余 {card.remainingTimes}/{card.totalTimes} 次 · 有效期至 {card.expiryDate}</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {safeArray(card.projects).map((project) => (
                      <button
                        key={`${card.customerCardId}-${project.id}-${project.name}`}
                        type="button"
                        onClick={() => chooseProject(card, project)}
                        className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-4 py-3 text-left transition hover:border-[#C9956C]/60 hover:bg-[#C9956C]/5"
                      >
                        <div>
                          <div className="text-sm font-semibold text-[#1F1B2D]">{project.name}</div>
                          <div className="mt-1 text-xs text-[#6F6678]">本次扣 {project.times} 次，核销后剩余 {project.remainingAfterUse} 次</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#9B92A3]" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-700">
              {selectedCustomer.name} 当前没有可核销的有效次卡，可引导前台办卡或改为收银。
            </div>
          )}
        </div>
      ) : null}

      {step === 3 && selectedCustomer && selectedProject ? (
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium text-[#6F6678]">第三步：确认核销</div>
          <div className="rounded-2xl border border-black/5 bg-[#F7F5F2] p-5">
            {[
              ["客户", `${selectedCustomer.name}（${selectedCustomer.phone}）`],
              ["会员", selectedCustomer.memberLevel],
              ["次卡", selectedProject.cardName],
              ["核销项目", `${selectedProject.name} x ${selectedProject.times}`],
              ["核销后剩余", `${selectedProject.remainingAfterUse} 次`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-black/5 py-3 last:border-b-0">
                <span className="text-sm text-[#6F6678]">{label}</span>
                <span className="text-right text-sm font-semibold text-[#1F1B2D]">{value}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(2)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium text-[#1F1B2D]">
              返回修改
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={loading}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1F1B2D] text-sm font-medium text-white transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认核销
            </button>
          </div>
        </div>
      ) : null}

    </div>
  );
}
