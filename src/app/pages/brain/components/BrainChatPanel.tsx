import { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Bot, Loader2, MessageSquarePlus, Send, UserRound } from 'lucide-react';
import type { BrainGuidanceSelection, BrainInspectionInboxResponse, BrainMessage, BrainRoleKey } from '@/types/brain';
import { BrainResponseRenderer } from './BrainResponseRenderer';

const roleOptions: Array<{ value: BrainRoleKey | ''; label: string }> = [
  { value: '', label: '自动识别角色' },
  { value: 'store_manager', label: '店长经营' },
  { value: 'receptionist', label: '前台接待' },
  { value: 'marketing', label: '营销增长' },
  { value: 'beautician', label: '美容师服务' },
  { value: 'inventory', label: '库存采购' },
  { value: 'finance', label: '财务风控' },
  { value: 'customer_service', label: '客户服务' },
];

interface BrainChatPanelProps {
  conversationId: number | null;
  messages: BrainMessage[];
  selectedRunId?: number;
  loadingMessages: boolean;
  sending: boolean;
  creatingConversation: boolean;
  prefillRequest?: { key: string; message: string };
  onCreateConversation: () => void;
  onSend: (message: string, roleHint?: BrainRoleKey, guidanceSelection?: BrainGuidanceSelection) => Promise<boolean>;
  onSelectAssistant: (message: BrainMessage) => void;
  riskSummary?: BrainInspectionInboxResponse['summary'];
  loadingRisks: boolean;
  riskLoadFailed?: boolean;
  onOpenRisks: (trigger: HTMLButtonElement) => void;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${hour}时${minute}分${second}秒`;
}

function formatQuestionDuration(messages: BrainMessage[], answerIndex: number) {
  const answer = messages[answerIndex];
  if (answer?.role !== 'assistant') return '';
  const answerAt = Date.parse(answer.createdAt);
  if (!Number.isFinite(answerAt)) return '';

  for (let index = answerIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role === 'assistant') break;
    if (candidate.role !== 'user') continue;
    const questionAt = Date.parse(candidate.createdAt);
    if (!Number.isFinite(questionAt) || answerAt < questionAt) return '';
    const elapsedMs = answerAt - questionAt;
    if (elapsedMs < 1000) return '<1秒';
    const totalSeconds = Math.round(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  }
  return '';
}

export function BrainChatPanel({
  conversationId,
  messages,
  selectedRunId,
  loadingMessages,
  sending,
  creatingConversation,
  prefillRequest,
  onCreateConversation,
  onSend,
  onSelectAssistant,
  riskSummary,
  loadingRisks,
  riskLoadFailed,
  onOpenRisks,
}: BrainChatPanelProps) {
  const [message, setMessage] = useState('');
  const [roleHint, setRoleHint] = useState<BrainRoleKey | ''>('');
  const [sendFailure, setSendFailure] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestMessage = messages[messages.length - 1];
  const interactiveAssistantId = latestMessage?.role === 'assistant' ? latestMessage.id : null;
  const busy = sending || creatingConversation;

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  useEffect(() => {
    if (!selectedRunId) return;
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-run-id="${selectedRunId}"]`);
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [messages, selectedRunId]);

  useEffect(() => {
    if (!prefillRequest?.message) return;
    setMessage(prefillRequest.message);
  }, [prefillRequest?.key, prefillRequest?.message]);

  async function submit() {
    const text = message.trim();
    if (!text || busy) return;
    setSendFailure(null);
    const succeeded = await onSend(text, roleHint || undefined);
    if (succeeded) setMessage('');
    else setSendFailure('发送失败，问题已为你保留，可以直接重试。');
  }

  return (
    <main
      data-testid="brain-chat-panel"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {conversationId ? `会话 #${conversationId}` : '开始新的经营对话'}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">回答使用当前门店权限与真实业务数据</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={`主动风险 ${riskSummary?.total ?? 0}`}
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition hover:bg-muted ${
              riskSummary?.critical
                ? 'border-red-200 bg-red-50 text-red-700'
                : riskLoadFailed
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-border text-foreground'
            }`}
            onClick={(event) => onOpenRisks(event.currentTarget)}
          >
            {loadingRisks ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="hidden sm:inline">主动风险</span>
            <span className="font-semibold">{riskSummary?.total ?? 0}</span>
            {riskSummary?.critical ? <span className="hidden text-xs lg:inline">紧急 {riskSummary.critical}</span> : null}
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground transition hover:bg-muted xl:hidden"
            onClick={onCreateConversation}
            disabled={busy}
          >
            {creatingConversation ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            <span className="hidden sm:inline">新会话</span>
          </button>
        </div>
      </header>

      <div ref={scrollRef} data-testid="brain-message-scroll" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8">
        {loadingMessages ? (
          <div className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载历史消息
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
            <Bot className="h-8 w-8 text-primary" />
            <div className="mt-3 text-base font-medium text-foreground">从一个真实经营问题开始</div>
            <div className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
              可询问预约、流水、客户、营销、库存和财务风险，也可生成动作预览与服务话术。
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {messages.map((item, index) => {
              const assistant = item.role === 'assistant';
              const interactive = assistant && item.id === interactiveAssistantId && item.id > 0 && !sending;
              const questionDuration = formatQuestionDuration(messages, index);
              return (
                <div
                  key={item.id}
                  data-run-id={assistant && item.metadata?.runId ? item.metadata.runId : undefined}
                  className={`flex w-full items-start gap-3 text-left ${assistant ? '' : 'flex-row-reverse'}`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      assistant ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {assistant ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <div
                    className={`min-w-0 max-w-[85%] rounded-md border px-4 py-3 text-sm leading-6 ${
                      assistant
                        ? `border-border bg-background text-foreground ${item.metadata?.runId === selectedRunId ? 'ring-2 ring-destructive/40' : ''}`
                        : 'border-primary bg-primary text-primary-foreground'
                    }`}
                  >
                    {assistant ? (
                      <BrainResponseRenderer
                        blocks={item.metadata?.blocks}
                        fallback={item.content}
                        status={item.metadata?.status}
                        interactive={interactive}
                        sending={sending}
                        sourceRunId={item.metadata?.runId}
                        onGuidanceSelect={({ value, kind, sourceRunId, optionId }) =>
                          void onSend(value, roleHint || undefined, { kind, sourceRunId, optionId })
                        }
                      />
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{item.content}</span>
                    )}
                    <div
                      className={`mt-2 flex items-center justify-between gap-3 text-xs ${assistant ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}
                    >
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span>消息时间 {formatTime(item.createdAt)}</span>
                        {questionDuration ? <span>问答耗时 {questionDuration}</span> : null}
                        {assistant && item.metadata?.adapterKey ? <span>{item.metadata.adapterKey}</span> : null}
                      </span>
                      {assistant && item.metadata?.runId ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          onClick={() => onSelectAssistant(item)}
                        >
                          <Activity className="h-3.5 w-3.5" />
                          查看运行轨迹
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div data-testid="brain-composer" className="shrink-0 border-t border-border bg-background p-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <textarea
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none transition focus:border-primary"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (sendFailure) setSendFailure(null);
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="问经营数据、风险和下一步动作"
            disabled={busy}
          />
          {sendFailure ? (
            <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span>{sendFailure}</span>
              <button type="button" className="font-medium underline underline-offset-2" onClick={() => void submit()}>
                重新发送
              </button>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              value={roleHint}
              onChange={(event) => setRoleHint(event.target.value as BrainRoleKey | '')}
              disabled={busy}
              aria-label="业务角色"
            >
              {roleOptions.map((option) => (
                <option key={option.value || 'auto'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void submit()}
              disabled={busy || !message.trim()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
