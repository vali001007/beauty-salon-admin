import { Loader2, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import type { BrainConversation } from '@/types/brain';

interface BrainConversationSidebarProps {
  conversations: BrainConversation[];
  selectedId: number | null;
  loading: boolean;
  creating: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onSelect: (conversationId: number) => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function BrainConversationSidebar({
  conversations,
  selectedId,
  loading,
  creating,
  onCreate,
  onRefresh,
  onSelect,
}: BrainConversationSidebarProps) {
  return (
    <aside className="hidden w-72 min-w-72 flex-col border-r border-border bg-muted/10 xl:flex">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Ami Brain</h1>
            <p className="mt-1 text-sm text-muted-foreground">门店经营智能体</p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={onRefresh}
            disabled={loading}
            title="刷新会话"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          type="button"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          onClick={onCreate}
          disabled={creating}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          新建会话
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载会话
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">还没有会话，直接提问即可开始。</div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const selected = conversation.id === selectedId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition ${
                    selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  onClick={() => onSelect(conversation.id)}
                >
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{conversation.title || '新会话'}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{formatUpdatedAt(conversation.updatedAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
