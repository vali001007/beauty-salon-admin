import React, { useMemo, useState } from "react";
import {
  AlarmClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { AutomationExecutionDetailData, AutomationExecutionSummaryData, AutomationTodaySummaryData } from "../types";

function statusText(status: string) {
  if (status === "enabled") return "已启用";
  if (status === "draft") return "待确认";
  if (status === "paused") return "已暂停";
  if (status === "success") return "成功";
  if (status === "failed") return "失败";
  return status;
}

export function AutomationTodayCard({
  data,
  onRefresh,
  onEnableStrategy,
  onPauseStrategy,
  onRunStrategyOnce,
  onCreateTemplate,
  onLoadExecutionDetail,
  onMarkTouchFollowedUp,
}: {
  data: AutomationTodaySummaryData;
  onRefresh?: () => void;
  onEnableStrategy?: (strategyId: number) => Promise<void>;
  onPauseStrategy?: (strategyId: number) => Promise<void>;
  onRunStrategyOnce?: (strategyId: number) => Promise<AutomationExecutionSummaryData>;
  onCreateTemplate?: (command: string) => Promise<void>;
  onLoadExecutionDetail?: (executionId: number) => Promise<AutomationExecutionDetailData>;
  onMarkTouchFollowedUp?: (touchId: number) => Promise<AutomationExecutionDetailData["touches"][number]>;
}) {
  const [enablingId, setEnablingId] = useState<number | null>(null);
  const [pausingId, setPausingId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [expandedExecutionId, setExpandedExecutionId] = useState<number | null>(null);
  const [loadingExecutionId, setLoadingExecutionId] = useState<number | null>(null);
  const [followingTouchId, setFollowingTouchId] = useState<number | null>(null);
  const [localExecutions, setLocalExecutions] = useState<AutomationExecutionSummaryData[]>([]);
  const [executionDetails, setExecutionDetails] = useState<Record<number, AutomationExecutionDetailData>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const latestExecutions = useMemo(() => {
    const dataExecutionIds = new Set(data.latestExecutions.map((item) => item.id));
    return [...localExecutions.filter((item) => !dataExecutionIds.has(item.id)), ...data.latestExecutions];
  }, [data.latestExecutions, localExecutions]);
  const kpis = [
    { label: "自动化策略", value: data.strategyCount },
    { label: "已启用", value: data.enabledCount },
    { label: "待确认", value: data.waitingApprovalCount },
    { label: "今日执行", value: data.executedCount + localExecutions.filter((item) => !data.latestExecutions.some((execution) => execution.id === item.id)).length },
  ];

  const handleEnableStrategy = async (strategyId: number) => {
    if (!onEnableStrategy || enablingId) return;
    setEnablingId(strategyId);
    setActionError(null);
    try {
      await onEnableStrategy(strategyId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "自动化启用失败，请稍后重试");
    } finally {
      setEnablingId(null);
    }
  };

  const handlePauseStrategy = async (strategyId: number) => {
    if (!onPauseStrategy || pausingId) return;
    setPausingId(strategyId);
    setActionError(null);
    try {
      await onPauseStrategy(strategyId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "自动化暂停失败，请稍后重试");
    } finally {
      setPausingId(null);
    }
  };

  const handleRunStrategyOnce = async (strategyId: number) => {
    if (!onRunStrategyOnce || runningId) return;
    setRunningId(strategyId);
    setActionError(null);
    try {
      const execution = await onRunStrategyOnce(strategyId);
      setLocalExecutions((prev) => [execution, ...prev.filter((item) => item.id !== execution.id)]);
      setExpandedExecutionId(execution.id);
      if (onLoadExecutionDetail) {
        try {
          setLoadingExecutionId(execution.id);
          const detail = await onLoadExecutionDetail(execution.id);
          setExecutionDetails((prev) => ({ ...prev, [execution.id]: detail }));
        } catch (err) {
          setActionError(err instanceof Error ? `已执行成功，但详情加载失败：${err.message}` : "已执行成功，但详情加载失败，请稍后刷新");
        } finally {
          setLoadingExecutionId(null);
        }
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "只有已启用的自动化才能立即执行");
    } finally {
      setRunningId(null);
    }
  };

  const handleCreateTemplate = async (templateId: string, command: string) => {
    if (!onCreateTemplate || creatingTemplateId) return;
    setCreatingTemplateId(templateId);
    setActionError(null);
    try {
      await onCreateTemplate(command);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "模板草稿生成失败，请稍后重试");
    } finally {
      setCreatingTemplateId(null);
    }
  };

  const handleLoadExecutionDetail = async (executionId: number) => {
    if (!onLoadExecutionDetail || loadingExecutionId) return;
    if (executionDetails[executionId]) {
      setExpandedExecutionId(executionId);
      return;
    }
    setLoadingExecutionId(executionId);
    setActionError(null);
    try {
      const detail = await onLoadExecutionDetail(executionId);
      setExecutionDetails((prev) => ({ ...prev, [executionId]: detail }));
      setExpandedExecutionId(executionId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "执行详情加载失败，请稍后重试");
    } finally {
      setLoadingExecutionId(null);
    }
  };

  const handleMarkTouchFollowedUp = async (executionId: number, touchId: number) => {
    if (!onMarkTouchFollowedUp || followingTouchId) return;
    setFollowingTouchId(touchId);
    setActionError(null);
    try {
      const updated = await onMarkTouchFollowedUp(touchId);
      setExecutionDetails((prev) => {
        const detail = prev[executionId];
        if (!detail) return prev;
        return {
          ...prev,
          [executionId]: {
            ...detail,
            touches: detail.touches.map((touch) => (touch.id === touchId ? updated : touch)),
          },
        };
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "标记跟进失败，请稍后重试");
    } finally {
      setFollowingTouchId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-[#2D1B69]/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#2D1B69]">
            <AlarmClock className="h-4 w-4" />
            自动管家
          </div>
          <h3 className="mt-2 text-lg font-semibold text-[#1F1B2D]">今天自动完成了什么</h3>
          <p className="mt-1 text-sm text-[#6F6678]">{data.date} · Ami_Core 自动化执行摘要</p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#1F1B2D] transition-colors hover:bg-[#F7F5F2]"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((item) => (
          <div key={item.label} className="rounded-xl bg-[#F7F5F2] p-3">
            <div className="text-xs text-[#6F6678]">{item.label}</div>
            <div className="mt-1 text-xl font-semibold text-[#1F1B2D]">{item.value}</div>
          </div>
        ))}
      </div>

      {data.templates?.length ? (
        <div className="mt-4 rounded-xl border border-[#2D1B69]/10 bg-[#F7F5F2] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1F1B2D]">
            <Sparkles className="h-4 w-4 text-[#C9956C]" />
            常用自动化模板
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.templates.map((template) => (
              <div key={template.id} className="rounded-lg bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[#1F1B2D]">{template.title}</div>
                    <div className="mt-1 text-xs leading-5 text-[#6F6678]">{template.description}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#F7F5F2] px-2 py-0.5 text-[11px] text-[#6F6678]">
                    {template.category}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-5 text-[#6F6678]">{template.defaultTrigger}</div>
                {onCreateTemplate ? (
                  <button
                    type="button"
                    onClick={() => handleCreateTemplate(template.id, template.command)}
                    disabled={creatingTemplateId !== null}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2D1B69] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#241456] disabled:cursor-wait disabled:opacity-70"
                  >
                    {creatingTemplateId === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    一键生成草稿
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-black/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1F1B2D]">
            <ClipboardList className="h-4 w-4 text-[#C9956C]" />
            最近策略
          </div>
          {data.latestStrategies.length ? (
            <div className="space-y-3">
              {data.latestStrategies.map((item) => (
                <div key={item.id} className="rounded-lg bg-[#F7F5F2] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-sm font-semibold text-[#1F1B2D]">{item.title}</div>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-[#6F6678]">{statusText(item.status)}</span>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#6F6678]">{item.trigger}</div>
                  <div className="mt-1 text-xs leading-5 text-[#6F6678]">{item.action}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(item.status === "draft" || item.status === "paused") && onEnableStrategy ? (
                      <button
                        type="button"
                        onClick={() => handleEnableStrategy(item.id)}
                        disabled={enablingId !== null}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2D1B69] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#241456] disabled:cursor-wait disabled:opacity-70"
                      >
                        {enablingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        确认启用
                      </button>
                    ) : null}
                    {item.status === "enabled" && onRunStrategyOnce ? (
                      <button
                        type="button"
                        onClick={() => handleRunStrategyOnce(item.id)}
                        disabled={runningId !== null}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-[#1F1B2D] transition-colors hover:bg-white/70 disabled:cursor-wait disabled:opacity-70"
                      >
                        {runningId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                        立即执行
                      </button>
                    ) : null}
                    {item.status === "enabled" && onPauseStrategy ? (
                      <button
                        type="button"
                        onClick={() => handlePauseStrategy(item.id)}
                        disabled={pausingId !== null}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-xs font-semibold text-[#1F1B2D] transition-colors hover:bg-white/70 disabled:cursor-wait disabled:opacity-70"
                      >
                        {pausingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                        暂停
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-[#F7F5F2] p-3 text-sm text-[#6F6678]">暂时还没有自动化策略。</div>
          )}
        </div>

        <div className="rounded-xl border border-black/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1F1B2D]">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            今日执行记录
          </div>
          {latestExecutions.length ? (
            <div className="space-y-3">
              {latestExecutions.slice(0, 5).map((item) => {
                const expanded = expandedExecutionId === item.id;
                const detail = executionDetails[item.id];
                return (
                  <div key={item.id} className="rounded-lg bg-[#F7F5F2] p-3">
                    <button
                      type="button"
                      onClick={() => setExpandedExecutionId(expanded ? null : item.id)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0 text-sm font-semibold text-[#1F1B2D]">{item.strategyName}</div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-[#6F6678]">
                        {statusText(item.status)}
                        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    <div className="mt-1 text-xs leading-5 text-[#6F6678]">
                      命中 {item.triggeredCount} 个对象 · 已生成 {item.reachedCount} 条提醒
                    </div>
                    {item.message ? <div className="mt-1 text-xs leading-5 text-[#6F6678]">{item.message}</div> : null}
                    {expanded ? (
                      <div className="mt-3 rounded-lg border border-black/5 bg-white p-3">
                        {item.reason ? <div className="text-xs leading-5 text-[#1F1B2D]">{item.reason}</div> : null}
                        {item.detailLines?.length ? (
                          <div className="mt-2 space-y-1">
                            {item.detailLines.map((line) => (
                              <div key={line} className="text-xs leading-5 text-[#6F6678]">
                                {line}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {item.nextActions?.length ? (
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-[#1F1B2D]">建议处理</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.nextActions.map((action) => (
                                <span key={action} className="rounded-full bg-[#F7F5F2] px-3 py-1 text-xs text-[#6F6678]">
                                  {action}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {item.primaryActionLabel ? (
                          <button
                            type="button"
                            onClick={() => handleLoadExecutionDetail(item.id)}
                            disabled={!onLoadExecutionDetail || loadingExecutionId !== null}
                            className="mt-3 inline-flex h-8 items-center rounded-lg bg-[#2D1B69] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#241456]"
                          >
                            {loadingExecutionId === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                            {item.primaryActionLabel}
                          </button>
                        ) : null}
                        {detail ? (
                          <div className="mt-3 rounded-lg bg-[#F7F5F2] p-3">
                            <div className="text-xs font-semibold text-[#1F1B2D]">命中顾客</div>
                            {detail.touches.length ? (
                              <div className="mt-2 space-y-2">
                                {detail.touches.slice(0, 6).map((touch) => (
                                  <div key={touch.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-xs font-semibold text-[#1F1B2D]">{touch.customerName || `顾客 #${touch.customerId}`}</div>
                                      <div className="mt-0.5 text-[11px] text-[#6F6678]">{touch.customerPhone || "未留手机号"}</div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className="rounded-full bg-[#F7F5F2] px-2 py-0.5 text-[11px] text-[#6F6678]">
                                        {touch.conversionType === "terminal_followed_up" ? "已跟进" : statusText(touch.status)}
                                      </span>
                                      {onMarkTouchFollowedUp && touch.conversionType !== "terminal_followed_up" ? (
                                        <button
                                          type="button"
                                          onClick={() => handleMarkTouchFollowedUp(item.id, touch.id)}
                                          disabled={followingTouchId !== null}
                                          className="inline-flex h-7 items-center rounded-md bg-[#2D1B69] px-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#241456] disabled:cursor-wait disabled:opacity-70"
                                        >
                                          {followingTouchId === touch.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                          标记已跟进
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-2 text-xs leading-5 text-[#6F6678]">本次执行没有可绑定顾客的触达记录。</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-[#F7F5F2] p-3 text-sm text-[#6F6678]">今天暂时没有自动执行记录。</div>
          )}
        </div>
      </div>

      {data.failedCount > 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
          <ShieldAlert className="h-4 w-4" />
          今天有 {data.failedCount} 条自动化执行失败，请店长稍后复核。
        </div>
      ) : null}
      {actionError ? <div className="mt-3 text-xs text-rose-600">{actionError}</div> : null}
    </div>
  );
}
