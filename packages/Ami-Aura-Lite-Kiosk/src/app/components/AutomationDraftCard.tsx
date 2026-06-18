import React, { useState } from "react";
import {
  AlarmClock,
  CheckCircle2,
  ClipboardCheck,
  HelpCircle,
  Loader2,
  Pencil,
  Save,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { AutomationDraftData, AutomationPreviewData } from "../types";

function riskLabel(riskLevel: AutomationDraftData["riskLevel"]) {
  if (riskLevel === "high") return "高风险，需店长审批";
  if (riskLevel === "medium") return "中风险，启用前确认";
  return "低风险，可直接生成提醒";
}

export function AutomationDraftCard({
  data,
  onEnable,
  onSuggestion,
  onPreview,
  onDraftChange,
}: {
  data: AutomationDraftData;
  onEnable?: (data: AutomationDraftData) => Promise<AutomationDraftData | void>;
  onSuggestion?: (answer: string) => Promise<void> | void;
  onPreview?: (data: AutomationDraftData) => Promise<AutomationPreviewData>;
  onDraftChange?: (data: AutomationDraftData) => void;
}) {
  const [currentData, setCurrentData] = useState(data);
  const [editing, setEditing] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [editValues, setEditValues] = useState({
    trigger: data.trigger,
    audience: data.audience,
    action: data.action,
  });
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const [answeringSuggestion, setAnsweringSuggestion] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<AutomationPreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const enabled = Boolean(currentData.persistedStrategyId);
  const isReady = currentData.status === "draft_ready";

  const handleEnable = async () => {
    if (!onEnable || enabled || enabling || cancelled) return;
    setEnabling(true);
    setEnableError(null);
    try {
      const result = await onEnable(currentData);
      if (result) setCurrentData(result);
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : "启用失败，请稍后重试");
    } finally {
      setEnabling(false);
    }
  };

  const handleEditOpen = () => {
    setEditValues({
      trigger: currentData.trigger,
      audience: currentData.audience,
      action: currentData.action,
    });
    setEditing(true);
  };

  const handleEditSave = () => {
    const next = {
      ...currentData,
      trigger: editValues.trigger.trim(),
      audience: editValues.audience.trim(),
      action: editValues.action.trim(),
    };
    if (!next.trigger || !next.audience || !next.action) return;
    setCurrentData(next);
    onDraftChange?.(next);
    setPreview(null);
    setPreviewError(null);
    setEditing(false);
  };

  const handlePreview = async () => {
    if (!onPreview || previewing || cancelled) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      setPreview(await onPreview(currentData));
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "预览失败，请稍后重试");
    } finally {
      setPreviewing(false);
    }
  };

  const handleSuggestion = async (answer: string) => {
    if (!onSuggestion || answeringSuggestion) return;
    setAnsweringSuggestion(answer);
    try {
      await onSuggestion(answer);
    } finally {
      setAnsweringSuggestion(null);
    }
  };

  return (
    <div className="rounded-2xl border border-[#2D1B69]/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#2D1B69]">
            <AlarmClock className="h-4 w-4" />
            {isReady ? "自动化草稿" : "自动化追问"}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-[#1F1B2D]">{currentData.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#6F6678]">{currentData.summary}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#F7F5F2] px-3 py-1 text-xs font-medium text-[#6F6678]">
          {riskLabel(currentData.riskLevel)}
        </span>
      </div>

      {!isReady ? (
        <div className="mt-4 rounded-xl border border-[#C9956C]/20 bg-[#FFF8F1] p-4">
          <div className="flex items-start gap-3">
            <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C9956C]" />
            <div>
              <div className="text-sm font-semibold text-[#1F1B2D]">还需要补充一个信息</div>
              <div className="mt-1 text-sm leading-6 text-[#6F6678]">{currentData.question}</div>
              {currentData.suggestions.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentData.suggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleSuggestion(item)}
                      disabled={!onSuggestion || answeringSuggestion !== null}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#6F6678] shadow-sm transition-colors hover:bg-[#F7F5F2] disabled:cursor-wait disabled:opacity-70"
                    >
                      {answeringSuggestion === item ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#F7F5F2] p-3">
              <div className="text-xs font-medium text-[#6F6678]">什么时候触发</div>
              <div className="mt-1 text-sm font-semibold leading-5 text-[#1F1B2D]">{currentData.trigger}</div>
            </div>
            <div className="rounded-xl bg-[#F7F5F2] p-3">
              <div className="text-xs font-medium text-[#6F6678]">对谁/什么触发</div>
              <div className="mt-1 text-sm font-semibold leading-5 text-[#1F1B2D]">{currentData.audience}</div>
            </div>
            <div className="rounded-xl bg-[#F7F5F2] p-3">
              <div className="text-xs font-medium text-[#6F6678]">触发后做什么</div>
              <div className="mt-1 text-sm font-semibold leading-5 text-[#1F1B2D]">{currentData.action}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[#6F6678]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F7F5F2] px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              {currentData.frequencyCap}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F7F5F2] px-3 py-1">
              <ClipboardCheck className="h-3.5 w-3.5" />
              {currentData.requiresApproval ? "启用前需要确认" : "低风险自动提醒"}
            </span>
          </div>

          {editing ? (
            <div className="mt-4 rounded-xl border border-[#2D1B69]/10 bg-[#F7F5F2] p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-[#6F6678]">
                  触发时间
                  <input
                    value={editValues.trigger}
                    onChange={(event) => setEditValues((prev) => ({ ...prev, trigger: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold text-[#1F1B2D] outline-none focus:border-[#C9956C]"
                  />
                </label>
                <label className="text-xs font-medium text-[#6F6678]">
                  触发对象
                  <input
                    value={editValues.audience}
                    onChange={(event) => setEditValues((prev) => ({ ...prev, audience: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold text-[#1F1B2D] outline-none focus:border-[#C9956C]"
                  />
                </label>
                <label className="text-xs font-medium text-[#6F6678]">
                  执行动作
                  <input
                    value={editValues.action}
                    onChange={(event) => setEditValues((prev) => ({ ...prev, action: event.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold text-[#1F1B2D] outline-none focus:border-[#C9956C]"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={!editValues.trigger.trim() || !editValues.audience.trim() || !editValues.action.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2D1B69] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#241456] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  保存修改
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex h-9 items-center rounded-lg border border-black/10 bg-white px-3 text-xs font-medium text-[#1F1B2D] transition-colors hover:bg-white/70"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEnable}
              disabled={enabled || enabling || cancelled}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#241456] disabled:cursor-default disabled:bg-emerald-600"
            >
              {enabling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {cancelled ? "已取消" : enabled ? (currentData.persistedStatus === "draft" ? "已保存待确认" : "已启用") : "启用自动化"}
            </button>
            <button
              type="button"
              onClick={handleEditOpen}
              disabled={enabled || cancelled}
              className="inline-flex h-10 items-center rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D] transition-colors hover:bg-[#F7F5F2]"
            >
              <Pencil className="mr-2 h-4 w-4" />
              修改草稿
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={!onPreview || previewing}
              className="inline-flex h-10 items-center rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D] transition-colors hover:bg-[#F7F5F2]"
            >
              {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              预览命中对象
            </button>
            <button
              type="button"
              onClick={() => {
                setCancelled(true);
                setEditing(false);
                setPreview(null);
              }}
              disabled={enabled || cancelled}
              className="inline-flex h-10 items-center rounded-xl border border-black/10 bg-white px-4 text-sm font-medium text-[#1F1B2D] transition-colors hover:bg-[#F7F5F2] disabled:cursor-default disabled:opacity-50"
            >
              <XCircle className="mr-2 h-4 w-4" />
              取消草稿
            </button>
          </div>
          {preview ? (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4" />
                预计命中 {preview.targetCount} 个对象
              </div>
              <div className="mt-1 leading-6">{preview.message}</div>
              <div className="mt-2 text-xs leading-5 text-emerald-700">
                风险：{riskLabel(preview.riskLevel)} · 频控：{preview.frequencyCap}
              </div>
            </div>
          ) : null}
          {enabled ? (
            <div className="mt-3 text-xs text-emerald-700">
              已写入 Ami_Core 自动化策略 #{currentData.persistedStrategyId}
              {currentData.persistedStatus === "draft" ? "，需店长确认后正式启用。" : "，后续由自动化任务服务按规则执行。"}
            </div>
          ) : null}
          {enableError ? <div className="mt-3 text-xs text-rose-600">{enableError}</div> : null}
          {previewError ? <div className="mt-3 text-xs text-rose-600">{previewError}</div> : null}
        </>
      )}
    </div>
  );
}
