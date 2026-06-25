import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';
import type { AgentPersonaSummary, AgentRunResultV2, AuraResponseBlock } from '@/types/agent';
import {
  createAgentRun,
  appendAgentMessage,
  getAgentPersonas,
  submitAgentFeedback,
} from '@/api/real/agent';
import { useStoreStore } from '@/stores/storeStore';
import { useAuthStore } from '@/stores/authStore';
import { AgentBlockRenderer } from './components/AgentBlockRenderer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  blocks?: AuraResponseBlock[];
  followUpSuggestions?: string[];
  loading?: boolean;
  error?: string;
  runId?: number;
}

// ─── Main Workspace ───────────────────────────────────────────────────────────

export function AmiAgentWorkspace() {
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const user = useAuthStore((s) => s.user);

  const [personas, setPersonas] = useState<AgentPersonaSummary[]>([]);
  const [activePersona, setActivePersona] = useState<AgentPersonaSummary | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 加载 Persona 列表
  useEffect(() => {
    getAgentPersonas()
      .then((list) => {
        setPersonas(list);
        if (list.length > 0) setActivePersona(list[0]);
      })
      .catch(console.warn);
  }, []);

  // 自动滚动到最新消息
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const appendMessage = useCallback((msg: ConversationMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAgentMessage = useCallback((patch: Partial<ConversationMessage>) => {
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === 'agent');
      if (idx < 0) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.map((m, i) => (i === realIdx ? { ...m, ...patch } : m));
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;
      const userMsg: ConversationMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text: text.trim(),
      };
      const agentMsg: ConversationMessage = {
        id: `a_${Date.now()}`,
        role: 'agent',
        loading: true,
      };
      appendMessage(userMsg);
      appendMessage(agentMsg);
      setInput('');
      setSending(true);

      try {
        let result: AgentRunResultV2;
        if (activeRunId) {
          result = await appendAgentMessage(activeRunId, {
            message: text.trim(),
            role: (user?.role ?? 'manager') as 'manager' | 'reception' | 'beautician',
          });
        } else {
          result = await createAgentRun({
            message: text.trim(),
            role: (user?.role ?? 'manager') as 'manager' | 'reception' | 'beautician',
            entrypoint: `ami-agent:${activePersona?.code ?? 'manager'}`,
          });
          setActiveRunId(result.runId);
        }

        updateLastAgentMessage({
          loading: false,
          text: result.answer,
          blocks: result.renderedBlocks,
          followUpSuggestions: result.followUpSuggestions,
          runId: result.runId,
        });
      } catch (err) {
        updateLastAgentMessage({
          loading: false,
          error: err instanceof Error ? err.message : '请求失败，请稍后重试',
        });
      } finally {
        setSending(false);
      }
    },
    [sending, activeRunId, activePersona, user, appendMessage, updateLastAgentMessage],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handlePersonaChange = (persona: AgentPersonaSummary) => {
    setActivePersona(persona);
    setActiveRunId(null);
    setMessages([]);
  };

  const handleFollowUp = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const handleFeedback = async (runId: number, adopted: boolean) => {
    try {
      await submitAgentFeedback(runId, { adopted });
    } catch {
      // 静默失败，反馈不影响主流程
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* 左侧：Persona 列表 */}
      <PersonaSidebar
        personas={personas}
        activePersona={activePersona}
        onSelect={handlePersonaChange}
      />

      {/* 中间：对话区域 */}
      <div className="flex flex-1 flex-col overflow-hidden border-x border-border">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Sparkles className="h-5 w-5 text-[#7B5CFF]" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {activePersona?.name ?? '洞悉美业·运营智能体'}
            </h1>
            {activePersona && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                {activePersona.description}
              </p>
            )}
          </div>
        </div>

        {/* 消息流 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && activePersona && (
            <EmptyState persona={activePersona} onSelect={handleFollowUp} />
          )}
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              msg={msg}
              onFollowUp={handleFollowUp}
              onFeedback={handleFeedback}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-[#7B5CFF]/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activePersona ? `问 ${activePersona.name}...` : '输入你的问题...'}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground min-h-[36px] max-h-[120px]"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
              }}
            />
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || sending}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7B5CFF] text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 px-1 text-xs text-muted-foreground">
            Enter 发送 · Shift+Enter 换行
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── PersonaSidebar ───────────────────────────────────────────────────────────

function PersonaSidebar({
  personas,
  activePersona,
  onSelect,
}: {
  personas: AgentPersonaSummary[];
  activePersona: AgentPersonaSummary | null;
  onSelect: (p: AgentPersonaSummary) => void;
}) {
  const personaIcons: Record<string, string> = {
    manager: '📊',
    marketing: '📣',
    reception: '🎪',
    beautician: '✨',
    inventory: '📦',
    finance: '💰',
  };

  return (
    <div className="w-56 flex-shrink-0 border-r border-border overflow-y-auto py-4">
      <div className="px-4 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        角色 Agent
      </div>
      <div className="space-y-0.5 px-2">
        {personas.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => onSelect(p)}
            className={[
              'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
              activePersona?.code === p.code
                ? 'bg-[#7B5CFF]/10 text-[#7B5CFF] font-medium'
                : 'text-foreground hover:bg-muted',
            ].join(' ')}
          >
            <span className="text-base leading-none">{personaIcons[p.code] ?? '🤖'}</span>
            <span className="truncate">{p.name.replace(' Agent', '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  persona,
  onSelect,
}: {
  persona: AgentPersonaSummary;
  onSelect: (q: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7B5CFF]/10 text-3xl mb-4">
        🤖
      </div>
      <h2 className="text-base font-semibold text-foreground">{persona.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground text-center max-w-xs">
        {persona.description}
      </p>
      <div className="mt-6 grid gap-2 w-full max-w-sm">
        {persona.suggestedQuestions.slice(0, 4).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-left text-foreground hover:bg-muted hover:border-foreground/20 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MessageItem ──────────────────────────────────────────────────────────────

function MessageItem({
  msg,
  onFollowUp,
  onFeedback,
}: {
  msg: ConversationMessage;
  onFollowUp: (s: string) => void;
  onFeedback: (runId: number, adopted: boolean) => void;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-[#7B5CFF] px-4 py-3 text-sm text-white">
          {msg.text}
        </div>
      </div>
    );
  }

  // Agent 消息
  if (msg.loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-[#7B5CFF]/40 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">洞悉美业正在分析...</span>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {msg.error}
      </div>
    );
  }

  const hasBlocks = msg.blocks && msg.blocks.length > 0;
  // 过滤掉 follow_up_chips 从 blocks 中（单独渲染）
  const contentBlocks = msg.blocks?.filter((b) => b.kind !== 'follow_up_chips') ?? [];
  const followUps = msg.followUpSuggestions ?? [];

  return (
    <div className="space-y-2">
      <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3">
        {hasBlocks ? (
          <AgentBlockRenderer
            blocks={contentBlocks}
            onCommand={onFollowUp}
          />
        ) : (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{msg.text}</p>
        )}
      </div>

      {/* 关联问题推荐 */}
      {followUps.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {followUps.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onFollowUp(s)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted hover:border-foreground/20 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 反馈按钮 */}
      {msg.runId && (
        <div className="flex gap-2 px-1">
          <button
            type="button"
            onClick={() => onFeedback(msg.runId!, true)}
            className="text-xs text-muted-foreground hover:text-emerald-600 transition-colors"
          >
            👍 有用
          </button>
          <button
            type="button"
            onClick={() => onFeedback(msg.runId!, false)}
            className="text-xs text-muted-foreground hover:text-rose-500 transition-colors"
          >
            👎 无用
          </button>
        </div>
      )}
    </div>
  );
}

