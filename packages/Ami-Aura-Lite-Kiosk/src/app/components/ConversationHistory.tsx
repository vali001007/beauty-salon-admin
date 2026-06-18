import React, { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Loader2, MessageSquareText, X } from "lucide-react";
import { getTerminalConversationDetail, getTerminalConversationHistory } from "@/api";
import type { TerminalConversationRecord } from "@/types/terminal";
import type { Role } from "../types";

const ROLE_LABELS: Record<Role, string> = {
  manager: "店长",
  reception: "前台",
  beautician: "美容师",
};

function formatDateLabel(date: string) {
  return date || "未知日期";
}

function formatMessageTime(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function ConversationHistory({
  currentRole,
  operatorId,
  currentUserName,
  onClose,
}: {
  currentRole: Role;
  operatorId?: number | null;
  currentUserName?: string;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<TerminalConversationRecord[]>([]);
  const [selected, setSelected] = useState<TerminalConversationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getTerminalConversationHistory({
      days: 30,
      page: 1,
      pageSize: 30,
      ...(operatorId ? { operatorId } : {}),
    })
      .then((response) => {
        if (!mounted) return;
        setRecords(response.items);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "历史记录加载失败");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [operatorId]);

  const openRecord = async (record: TerminalConversationRecord) => {
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await getTerminalConversationDetail(record.id);
      setSelected(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "对话详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30">
      <div className="ml-auto flex h-full w-full max-w-[520px] flex-col bg-white text-[#1F1B2D] shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold">历史记录</div>
            <div className="text-xs text-[#6F6678]">
              近 30 天终端对话 · {currentUserName ?? "当前账号"} · {ROLE_LABELS[currentRole]}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#6F6678] hover:bg-black/5"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-black/5 px-5 py-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#6F6678] hover:bg-black/5"
                title="返回"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="text-sm font-semibold">{formatDateLabel(selected.date)}</div>
                <div className="text-xs text-[#6F6678]">{ROLE_LABELS[selected.role]} · {selected.messageCount} 条</div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-3">
                {selected.messages.map((message, index) => (
                  <div
                    key={`${message.timestamp}-${index}`}
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                      message.role === "user"
                        ? "ml-auto bg-[#C9956C] text-white"
                        : "mr-auto border border-black/5 bg-[#F7F5F2] text-[#1F1B2D]"
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                    <div className={`mt-2 text-[11px] ${message.role === "user" ? "text-white/70" : "text-[#6F6678]"}`}>
                      {formatMessageTime(message.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading || detailLoading ? (
              <div className="flex items-center gap-2 rounded-xl bg-[#F7F5F2] px-4 py-3 text-sm text-[#6F6678]">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载历史记录
              </div>
            ) : null}
            {error ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}
            {!loading && !records.length && !error ? (
              <div className="rounded-xl bg-[#F7F5F2] px-4 py-8 text-center text-sm text-[#6F6678]">暂无历史对话</div>
            ) : null}
            <div className="grid gap-3">
              {records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => openRecord(record)}
                  className="flex items-center justify-between gap-4 rounded-xl border border-black/5 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-[#F7F5F2]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2D1B69]/8 text-[#2D1B69]">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{formatDateLabel(record.date)}</span>
                      <span className="mt-0.5 block text-xs text-[#6F6678]">{ROLE_LABELS[record.role]} · {record.messageCount} 条</span>
                    </span>
                  </span>
                  <MessageSquareText className="h-5 w-5 shrink-0 text-[#6F6678]" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
