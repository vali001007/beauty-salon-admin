import React, { useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Gift, Loader2 } from "lucide-react";
import type {
  CardVerificationCardOption,
  CardVerificationConfirmInput,
  CardVerificationCustomer,
  CardVerificationFlowData,
} from "../types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { cn } from "./ui/utils";
import { CustomerSelectList } from "./CustomerSelectList";

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function getCustomerTags(customer: CardVerificationCustomer) {
  return [customer.profileLabel, ...safeArray(customer.tags)].filter(Boolean).slice(0, 6);
}

function CustomerAvatar({ customer, className }: { customer: CardVerificationCustomer; className?: string }) {
  const avatarUrl = customer.avatarUrl?.trim();

  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#2D1B69] to-[#C9956C] text-base font-semibold text-white shadow-sm",
        className,
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={`${customer.name}头像`} className="h-full w-full object-cover" />
      ) : (
        customer.name.trim().slice(0, 1) || "客"
      )}
    </div>
  );
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
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<CardVerificationCustomer | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCards = safeArray(selectedCustomer?.cards);

  const customers = useMemo(() => safeArray(data.customers), [data.customers]);

  const chooseCustomer = async (customer: CardVerificationCustomer) => {
    setLoading(true);
    setPendingCustomerId(customer.id);
    setDetailCustomer(null);
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
      setPendingCustomerId(null);
    }
  };

  const chooseDetailCustomer = () => {
    if (!detailCustomer) return;
    void chooseCustomer(detailCustomer);
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
          <CustomerSelectList
            customers={customers}
            selectedCustomerId={selectedCustomer?.id}
            onSelect={(customer) => void chooseCustomer(customer)}
            onViewDetails={setDetailCustomer}
            loadingCustomerId={pendingCustomerId}
            disabled={loading}
            emptyText="未找到有可用次卡的客户，请检查姓名或手机号。"
          />
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

      <Dialog open={Boolean(detailCustomer)} onOpenChange={(open) => !open && setDetailCustomer(null)}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>客户详情</DialogTitle>
            <DialogDescription>核销前快速查看客户基础信息、今日预约和画像标签。</DialogDescription>
          </DialogHeader>

          {detailCustomer ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 rounded-2xl bg-[#F7F5F2] p-4">
                <CustomerAvatar customer={detailCustomer} className="h-14 w-14 text-lg" />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-[#1F1B2D]">{detailCustomer.name}</div>
                  <div className="mt-1 text-sm text-[#6F6678]">
                    {detailCustomer.phone} · {detailCustomer.memberLevel}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["今日预约", detailCustomer.isAppointedToday ? `${detailCustomer.appointmentTime ?? "待定"} ${detailCustomer.appointmentProjectName ?? ""}`.trim() : "无今日预约"],
                  ["最近到店", detailCustomer.lastVisitDate || "暂无到店记录"],
                  ["会员等级", detailCustomer.memberLevel],
                  ["客户画像", detailCustomer.profileLabel || "待补充"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-black/5 bg-white p-3">
                    <div className="text-xs text-[#9B92A3]">{label}</div>
                    <div className="mt-1 text-sm font-medium text-[#1F1B2D]">{value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-2 text-xs text-[#9B92A3]">画像标签</div>
                <div className="flex flex-wrap gap-1.5">
                  {getCustomerTags(detailCustomer).length ? (
                    getCustomerTags(detailCustomer).map((tag) => (
                      <span key={`detail-${detailCustomer.id}-${tag}`} className="rounded-full bg-[#F7F5F2] px-2.5 py-1 text-xs text-[#6F6678]">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-[#F7F5F2] px-2.5 py-1 text-xs text-[#9B92A3]">暂无标签</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setDetailCustomer(null)}
              className="h-11 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D]"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={chooseDetailCustomer}
              disabled={loading || !detailCustomer}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1F1B2D] px-4 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              选择客户核销
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
