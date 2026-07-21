import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Loader2, MessageSquarePlus, Send, UserRound } from 'lucide-react';
import type { BrainMessage, BrainRoleKey } from '@/types/brain';
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
  loadingMessages: boolean;
  sending: boolean;
  onCreateConversation: () => void;
  onSend: (message: string, roleHint?: BrainRoleKey) => Promise<void>;
  onSelectAssistant: (message: BrainMessage) => void;
  inspectionInbox?: ReactNode;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function BrainChatPanel({
  conversationId,
  messages,
  loadingMessages,
  sending,
  onCreateConversation,
  onSend,
  onSelectAssistant,
  inspectionInbox,
}: BrainChatPanelProps) {
  const [message, setMessage] = useState('');
  const [roleHint, setRoleHint] = useState<BrainRoleKey | ''>('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function submit() {
    const text = message.trim();
    if (!text || sending) return;
    await onSend(text, roleHint || undefined);
    setMessage('');
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{conversationId ? `会话 #${conversationId}` : '开始新的经营对话'}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">回答使用当前门店权限与真实业务数据</div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition hover:bg-muted xl:hidden"
          onClick={onCreateConversation}
        >
          <MessageSquarePlus className="h-4 w-4" />
          新会话
        </button>
      </header>

      {inspectionInbox}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8">
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
            {messages.map((item) => {
              const assistant = item.role === 'assistant';
              return (
                <div
                  key={item.id}
                  role={assistant ? 'button' : undefined}
                  tabIndex={assistant ? 0 : undefined}
                  className={`flex w-full items-start gap-3 text-left ${assistant ? 'cursor-pointer' : 'flex-row-reverse'}`}
                  onClick={() => assistant && onSelectAssistant(item)}
                  onKeyDown={(event) => {
                    if (assistant && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onSelectAssistant(item);
                    }
                  }}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      assistant ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {assistant ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  </span>
                  <span
                    className={`min-w-0 max-w-[85%] rounded-md border px-4 py-3 text-sm leading-6 ${
                      assistant
                        ? 'border-border bg-background text-foreground hover:border-primary/40'
                        : 'border-primary bg-primary text-primary-foreground'
                    }`}
                  >
                    {assistant ? (
                      <BrainResponseRenderer
                        blocks={item.metadata?.blocks}
                        fallback={item.content}
                        onClarificationSelect={(_value, label) => void onSend(label, roleHint || undefined)}
                      />
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{item.content}</span>
                    )}
                    <span className={`mt-2 block text-xs ${assistant ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                      {formatTime(item.createdAt)}
                      {assistant && item.metadata?.adapterKey ? ` · ${item.metadata.adapterKey}` : ''}
                    </span>
                  </span>
                </div>
              );
            })}
            {sending ? (
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="flex items-center gap-2 rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在读取数据并组织回答
                </div>
              </div>
            ) : null}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-background p-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <textarea
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none transition focus:border-primary"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="问经营数据、风险和下一步动作"
            disabled={sending}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              value={roleHint}
              onChange={(event) => setRoleHint(event.target.value as BrainRoleKey | '')}
              disabled={sending}
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
              disabled={sending || !message.trim()}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
