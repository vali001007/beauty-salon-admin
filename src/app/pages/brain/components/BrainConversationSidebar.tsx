import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, History, Loader2, MessageSquare, Plus, RefreshCw, Search, XCircle } from 'lucide-react';
import type { BrainConversation, BrainEvalCatalogItem, BrainFeedbackIssue } from '@/types/brain';

export type BrainSidebarTab = 'issues' | 'eval' | 'history';

interface BrainConversationSidebarProps {
  activeTab: BrainSidebarTab;
  conversations: BrainConversation[];
  issues: BrainFeedbackIssue[];
  evalQuestions: BrainEvalCatalogItem[];
  selectedId: number | null;
  selectedRunId?: number;
  selectedEvalQuestionId?: string;
  loading: boolean;
  creating: boolean;
  page: number;
  pageSize: number;
  total: number;
  issuePage: number;
  issuePageSize: number;
  issueTotal: number;
  evalPage: number;
  evalPageSize: number;
  evalTotal: number;
  evalCatalogTotal: number;
  evalSearch: string;
  onTabChange: (tab: BrainSidebarTab) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onIssuePageChange: (page: number) => void;
  onEvalPageChange: (page: number) => void;
  onEvalSearchChange: (value: string) => void;
  onSelect: (conversationId: number) => void;
  onSelectIssue: (issue: BrainFeedbackIssue) => void;
  onSelectEvalQuestion: (item: BrainEvalCatalogItem) => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function BrainConversationSidebar({
  activeTab,
  conversations,
  issues,
  evalQuestions,
  selectedId,
  selectedRunId,
  selectedEvalQuestionId,
  loading,
  creating,
  page,
  pageSize,
  total,
  issuePage,
  issuePageSize,
  issueTotal,
  evalPage,
  evalPageSize,
  evalTotal,
  evalCatalogTotal,
  evalSearch,
  onTabChange,
  onCreate,
  onRefresh,
  onPageChange,
  onIssuePageChange,
  onEvalPageChange,
  onEvalSearchChange,
  onSelect,
  onSelectIssue,
  onSelectEvalQuestion,
}: BrainConversationSidebarProps) {
  const historyPageCount = Math.max(1, Math.ceil(total / pageSize));
  const issuePageCount = Math.max(1, Math.ceil(issueTotal / issuePageSize));
  const evalPageCount = Math.max(1, Math.ceil(evalTotal / evalPageSize));
  const activePage = activeTab === 'issues' ? issuePage : activeTab === 'eval' ? evalPage : page;
  const activePageCount = activeTab === 'issues' ? issuePageCount : activeTab === 'eval' ? evalPageCount : historyPageCount;
  const activeTotal = activeTab === 'issues' ? issueTotal : activeTab === 'eval' ? evalTotal : total;
  const activeEmpty = activeTab === 'issues' ? issues.length === 0 : activeTab === 'eval' ? evalQuestions.length === 0 : conversations.length === 0;
  const refreshTitle = activeTab === 'issues' ? '刷新错题集' : activeTab === 'eval' ? '刷新测评集' : '刷新历史记录';
  const pageItemLabel = activeTab === 'issues' ? '错题' : activeTab === 'eval' ? '测评题' : '会话';

  return (
    <aside className="hidden h-full min-h-0 w-72 min-w-72 flex-col overflow-hidden border-r border-border bg-muted/10 xl:flex">
      <div className="shrink-0 border-b border-border p-4">
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
            title={refreshTitle}
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
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="会话侧栏">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'issues'}
            className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition ${
              activeTab === 'issues' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTabChange('issues')}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            错题集
            {issueTotal > 0 ? <span className="rounded-full bg-destructive/10 px-1.5 text-[10px] text-destructive">{issueTotal}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'eval'}
            className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition ${
              activeTab === 'eval' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTabChange('eval')}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            测评集
            {evalCatalogTotal > 0 ? <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{evalCatalogTotal}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition ${
              activeTab === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onTabChange('history')}
          >
            <History className="h-3.5 w-3.5" />
            历史记录
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {activeTab === 'eval' ? (
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={evalSearch}
              onChange={(event) => onEvalSearchChange(event.target.value)}
              placeholder="搜索题目或问题 ID"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
            />
          </label>
        ) : null}
        {loading && activeEmpty ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {activeTab === 'issues' ? '加载错题集' : activeTab === 'eval' ? '加载测评集' : '加载历史记录'}
          </div>
        ) : activeTab === 'issues' && issues.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm leading-6 text-muted-foreground">
            还没有标记为“需改进”的回答。
          </div>
        ) : activeTab === 'history' && conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">还没有会话，直接提问即可开始。</div>
        ) : activeTab === 'eval' && evalQuestions.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm leading-6 text-muted-foreground">
            没有符合当前搜索条件的测评题。
          </div>
        ) : activeTab === 'issues' ? (
          <div className="space-y-1">
            {issues.map((issue) => {
              const selected = issue.runId === selectedRunId;
              return (
                <button
                  key={issue.feedbackId}
                  type="button"
                  className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? 'bg-destructive/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  onClick={() => onSelectIssue(issue)}
                  disabled={issue.conversationId == null}
                  title={issue.conversationId == null ? '原会话不可用' : issue.answer}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium leading-5">{issue.question}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Run #{issue.runId} · {formatUpdatedAt(issue.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : activeTab === 'eval' ? (
          <div className="space-y-1">
            {evalQuestions.map((item) => {
              const selected = item.questionId === selectedEvalQuestionId;
              const ResultIcon = item.passed === true ? CheckCircle2 : item.passed === false ? XCircle : AlertCircle;
              return (
                <button
                  key={item.questionId}
                  type="button"
                  className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition ${
                    selected
                      ? 'bg-primary/10 text-foreground ring-1 ring-primary/30'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  onClick={() => onSelectEvalQuestion(item)}
                  title={item.diagnosis}
                >
                  <ResultIcon className={`mt-0.5 h-4 w-4 shrink-0 ${item.passed === true ? 'text-emerald-600' : item.passed === false ? 'text-destructive' : 'text-amber-600'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium leading-5">{item.question}</span>
                    <span className="mt-1 block break-all font-mono text-[10px] text-muted-foreground">{item.questionId}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{item.questionType} · {item.passed === true ? '通过' : item.passed === false ? '未通过' : '基础设施异常'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const selected = conversation.id === selectedId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition ${
                    selected
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  onClick={() => onSelect(conversation.id)}
                >
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{conversation.title || '新会话'}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatUpdatedAt(conversation.updatedAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span>
          共 {activeTotal} 条 · {activePage}/{activePageCount} 页
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`上一页${pageItemLabel}`}
            disabled={loading || activePage <= 1}
            onClick={() =>
              activeTab === 'issues'
                ? onIssuePageChange(issuePage - 1)
                : activeTab === 'eval'
                  ? onEvalPageChange(evalPage - 1)
                  : onPageChange(page - 1)
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`下一页${pageItemLabel}`}
            disabled={loading || activePage >= activePageCount}
            onClick={() =>
              activeTab === 'issues'
                ? onIssuePageChange(issuePage + 1)
                : activeTab === 'eval'
                  ? onEvalPageChange(evalPage + 1)
                  : onPageChange(page + 1)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
