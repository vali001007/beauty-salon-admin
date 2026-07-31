import { useEffect } from 'react';
import { CheckCircle2, ChevronDown, Database, GitBranch, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type {
  BrainActionPreview as BrainActionPreviewType,
  BrainActionDecisionResponse,
  BrainInspectionInboxResponse,
  BrainMessage,
  BrainRunEvent,
} from '@/types/brain';
import { BrainActionPreview } from './BrainActionPreview';
import { BrainInspectionInbox } from './BrainInspectionInbox';

export type BrainContextPanelTab = 'evidence' | 'risks';

interface BrainEvidencePanelProps {
  message: BrainMessage | null;
  events: BrainRunEvent[];
  loadingEvents: boolean;
  actionResults: Record<string, BrainActionDecisionResponse>;
  pendingActionId: string | null;
  feedbackRating?: string;
  feedbackLoading: boolean;
  onConfirmAction: (actionId: string, runId: number) => void;
  onRejectAction: (actionId: string, runId: number) => void;
  onRetryAction: (actionId: string, runId: number) => void;
  onFeedback: (runId: number, rating: string) => void;
  activeTab?: BrainContextPanelTab;
  onTabChange?: (tab: BrainContextPanelTab) => void;
  inspectionInbox?: BrainInspectionInboxResponse | null;
  loadingInspectionInbox?: boolean;
  inspectionError?: string | null;
  reviewingFindingId?: number | null;
  onInspectionRefresh?: () => void;
  onInspectionReview?: (findingId: number) => void;
  onInspectionPageChange?: (page: number) => void;
  mobileRiskOpen?: boolean;
  onCloseMobileRisk?: () => void;
}

const EVENT_LABELS: Record<string, string> = {
  cognition_rules: '规则认知',
  role_intent_route: '角色与意图路由',
  cognition_model: '模型认知',
  cognition_diff: '认知差异',
  memory_recall: '记忆召回',
  semantic_query: '语义查询',
};

interface TraceTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provider?: string;
  model?: string;
}

function eventLabel(event: BrainRunEvent) {
  return EVENT_LABELS[event.stepKey] ?? event.stepKey.replace(/^skill_/, '').replaceAll('_', ' ');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function numericValue(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function findTokenUsage(value: unknown): TraceTokenUsage | null {
  const queue: unknown[] = [value];
  const visited = new Set<object>();

  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== 'object') continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);

    if (Array.isArray(candidate)) {
      queue.push(...candidate);
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const inputTokens = numericValue(record, ['inputTokens', 'promptTokens', 'input_tokens', 'prompt_tokens']);
    const outputTokens = numericValue(record, ['outputTokens', 'completionTokens', 'output_tokens', 'completion_tokens']);
    const totalTokens = numericValue(record, ['totalTokens', 'total_tokens']);
    if (inputTokens !== undefined || outputTokens !== undefined || totalTokens !== undefined) {
      const normalizedInput = inputTokens ?? 0;
      const normalizedOutput = outputTokens ?? 0;
      return {
        inputTokens: normalizedInput,
        outputTokens: normalizedOutput,
        totalTokens: totalTokens ?? normalizedInput + normalizedOutput,
        ...(typeof record.provider === 'string' ? { provider: record.provider } : {}),
        ...(typeof record.model === 'string' ? { model: record.model } : {}),
      };
    }
    queue.push(...Object.values(record));
  }

  return null;
}

function isModelEvent(event: BrainRunEvent) {
  if (event.stepKey.includes('model') || event.layer.includes('model')) return true;
  const output = asRecord(event.output);
  return Boolean(output && (typeof output.provider === 'string' || typeof output.model === 'string'));
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 2 : 1)} s`;
}

function eventDuration(event: BrainRunEvent, index: number, events: BrainRunEvent[]) {
  if (event.durationMs != null && Number.isFinite(event.durationMs)) {
    return {
      text: formatDuration(event.durationMs),
      estimated: event.durationSource === 'timeline_estimate',
    };
  }
  if (event.latencyMs != null && Number.isFinite(event.latencyMs)) {
    return { text: formatDuration(event.latencyMs), estimated: false };
  }
  if (index > 0) {
    const previousTimestamp = Date.parse(events[index - 1].createdAt);
    const currentTimestamp = Date.parse(event.createdAt);
    if (Number.isFinite(previousTimestamp) && Number.isFinite(currentTimestamp) && currentTimestamp >= previousTimestamp) {
      return { text: formatDuration(currentTimestamp - previousTimestamp), estimated: true };
    }
  }
  return { text: '未记录', estimated: false };
}

function jsonSnapshot(value: unknown) {
  if (value == null) return '未记录';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function TraceSnapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-foreground">{label}</div>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-2 text-[11px] leading-4 text-muted-foreground">
        {jsonSnapshot(value)}
      </pre>
    </div>
  );
}

function isConfirmableAction(value: unknown): value is BrainActionPreviewType {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  return (
    typeof action.actionId === 'string' &&
    action.actionId.trim().length > 0 &&
    typeof action.summary === 'string' &&
    action.summary.trim().length > 0 &&
    ['low', 'medium', 'high', 'critical'].includes(String(action.riskLevel)) &&
    action.requiresConfirmation === true
  );
}

export function BrainEvidencePanel({
  message,
  events,
  loadingEvents,
  actionResults,
  pendingActionId,
  feedbackRating,
  feedbackLoading,
  onConfirmAction,
  onRejectAction,
  onRetryAction,
  onFeedback,
  activeTab = 'evidence',
  onTabChange = () => undefined,
  inspectionInbox = null,
  loadingInspectionInbox = false,
  inspectionError = null,
  reviewingFindingId = null,
  onInspectionRefresh = () => undefined,
  onInspectionReview = () => undefined,
  onInspectionPageChange = () => undefined,
  mobileRiskOpen = false,
  onCloseMobileRisk = () => undefined,
}: BrainEvidencePanelProps) {
  useEffect(() => {
    if (!mobileRiskOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobileRisk();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileRiskOpen, onCloseMobileRisk]);

  const sharedProps: ContextPanelProps = {
    message,
    events,
    loadingEvents,
    actionResults,
    pendingActionId,
    feedbackRating,
    feedbackLoading,
    onConfirmAction,
    onRejectAction,
    onRetryAction,
    onFeedback,
    activeTab,
    onTabChange,
    inspectionInbox,
    loadingInspectionInbox,
    inspectionError,
    reviewingFindingId,
    onInspectionRefresh,
    onInspectionReview,
    onInspectionPageChange,
  };

  return (
    <>
      <aside className="hidden w-80 min-w-80 flex-col border-l border-border bg-muted/10 xl:flex">
        <ContextPanel {...sharedProps} />
      </aside>
      {mobileRiskOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="关闭主动风险面板"
            className="absolute inset-0 bg-black/30"
            onClick={onCloseMobileRisk}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="主动风险"
            className="absolute inset-y-0 right-0 flex w-[min(92vw,420px)] flex-col border-l border-border bg-background shadow-xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <h2 className="text-sm font-semibold text-foreground">Ami Brain 上下文</h2>
              <button
                type="button"
                aria-label="关闭主动风险"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                onClick={onCloseMobileRisk}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ContextPanel {...sharedProps} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

interface ContextPanelProps extends Omit<BrainEvidencePanelProps, 'mobileRiskOpen' | 'onCloseMobileRisk'> {
  activeTab: BrainContextPanelTab;
  onTabChange: (tab: BrainContextPanelTab) => void;
  inspectionInbox: BrainInspectionInboxResponse | null;
  loadingInspectionInbox: boolean;
  inspectionError: string | null;
  reviewingFindingId: number | null;
  onInspectionRefresh: () => void;
  onInspectionReview: (findingId: number) => void;
  onInspectionPageChange: (page: number) => void;
}

function ContextPanel(props: ContextPanelProps) {
  const riskTotal = props.inspectionInbox?.summary.total ?? 0;
  const critical = props.inspectionInbox?.summary.critical ?? 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border p-3">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="Ami Brain 上下文面板">
          <button
            type="button"
            role="tab"
            aria-selected={props.activeTab === 'evidence'}
            className={`rounded px-2 py-2 text-xs font-medium ${props.activeTab === 'evidence' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => props.onTabChange('evidence')}
          >
            依据与动作
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.activeTab === 'risks'}
            className={`rounded px-2 py-2 text-xs font-medium ${props.activeTab === 'risks' ? 'bg-background text-foreground shadow-sm' : critical ? 'text-red-700' : 'text-muted-foreground'}`}
            onClick={() => props.onTabChange('risks')}
          >
            主动风险 {riskTotal}
          </button>
        </div>
      </div>
      {props.activeTab === 'risks' ? (
        <BrainInspectionInbox
          inbox={props.inspectionInbox}
          loading={props.loadingInspectionInbox}
          error={props.inspectionError}
          reviewingId={props.reviewingFindingId}
          onRefresh={props.onInspectionRefresh}
          onReview={props.onInspectionReview}
          onPageChange={props.onInspectionPageChange}
        />
      ) : (
        <EvidenceContent {...props} />
      )}
    </div>
  );
}

function EvidenceContent({
  message,
  events,
  loadingEvents,
  actionResults,
  pendingActionId,
  feedbackRating,
  feedbackLoading,
  onConfirmAction,
  onRejectAction,
  onRetryAction,
  onFeedback,
}: ContextPanelProps) {
  const metadata = message?.metadata;
  const runId = metadata?.runId;
  const citations = metadata?.citations ?? [];
  const actions = (metadata?.suggestedActions ?? []).filter(isConfirmableAction);

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4" role="tabpanel" aria-label="依据与动作">
        {!message ? (
          <div className="py-8 text-center text-sm leading-6 text-muted-foreground">回答生成后，这里会展示可核验依据。</div>
        ) : (
          <>
            <section>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Database className="h-4 w-4" />
                数据与口径
              </div>
              <div className="mt-3 space-y-2">
                {citations.length ? (
                  citations.map((citation, index) => (
                    <div key={`${citation.sourceType}-${citation.sourceId}-${index}`} className="rounded-md border border-border bg-background p-3">
                      <div className="text-sm font-medium text-foreground">{citation.label || citation.sourceId}</div>
                      <div className="mt-1 break-all text-xs text-muted-foreground">
                        {citation.sourceType} · {citation.sourceId}
                      </div>
                      {citation.definition ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{citation.definition}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="text-xs leading-5 text-muted-foreground">这条回答没有返回数据引用，按能力边界或技能输出处理。</div>
                )}
              </div>
            </section>

            {actions.length && runId ? (
              <section>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  动作预览
                </div>
                <div className="mt-3 space-y-2">
                  {actions.map((action) => (
                    <BrainActionPreview
                      key={action.actionId}
                      action={action}
                      result={actionResults[action.actionId]}
                      loading={pendingActionId === action.actionId}
                      onConfirm={() => onConfirmAction(action.actionId, runId)}
                      onReject={() => onRejectAction(action.actionId, runId)}
                      onRetry={() => onRetryAction(action.actionId, runId)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <GitBranch className="h-4 w-4" />
                运行轨迹
              </div>
              <div className="mt-3 space-y-2">
                {loadingEvents ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    加载 Trace
                  </div>
                ) : events.length ? (
                  events.map((event, index) => {
                    const usage = findTokenUsage(event.output) ?? findTokenUsage(event.input);
                    const duration = eventDuration(event, index, events);
                    return (
                      <details key={event.id} className="group rounded-md border border-border bg-background text-xs">
                        <summary className="flex cursor-pointer list-none items-start gap-2 p-2.5 marker:hidden">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              event.status === 'completed' ? 'bg-emerald-500' : event.status === 'failed' ? 'bg-destructive' : 'bg-amber-500'
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-medium text-foreground">{eventLabel(event)}</span>
                            <span className="mt-0.5 block text-muted-foreground">{event.layer}</span>
                            <span className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                              <span title={usage ? `输入 ${usage.inputTokens} / 输出 ${usage.outputTokens}` : undefined}>
                                Token {usage ? usage.totalTokens.toLocaleString('zh-CN') : isModelEvent(event) ? '未记录' : '0（非模型）'}
                              </span>
                              <span title={duration.estimated ? '由运行开始时间与相邻步骤时间估算，不等同于精确执行耗时' : undefined}>
                                {duration.estimated ? '阶段间隔' : '耗时'} {duration.text}
                              </span>
                            </span>
                          </span>
                          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="space-y-3 border-t border-border px-2.5 py-3">
                          {usage ? (
                            <div className="rounded-md bg-muted/40 p-2 text-[11px] leading-5 text-muted-foreground">
                              <div>
                                Token：输入 {usage.inputTokens.toLocaleString('zh-CN')} · 输出 {usage.outputTokens.toLocaleString('zh-CN')} · 总计{' '}
                                {usage.totalTokens.toLocaleString('zh-CN')}
                              </div>
                              {usage.provider || usage.model ? (
                                <div>
                                  模型：{[usage.provider, usage.model].filter(Boolean).join(' / ')}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <TraceSnapshot label="输入" value={event.input} />
                          <TraceSnapshot label="输出" value={event.output} />
                          {event.error ? <TraceSnapshot label="错误" value={event.error} /> : null}
                        </div>
                      </details>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground">当前运行没有可展示步骤。</div>
                )}
              </div>
            </section>

            {runId ? (
              <section className="border-t border-border pt-4">
                <div className="text-sm font-medium text-foreground">这条回答是否有帮助？</div>
                {feedbackRating ? (
                  <div className="mt-2 text-xs text-muted-foreground">已提交反馈：{feedbackRating === 'helpful' ? '有帮助' : '需改进'}</div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-border text-xs text-foreground disabled:opacity-60"
                      onClick={() => onFeedback(runId, 'helpful')}
                      disabled={feedbackLoading}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      有帮助
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-border text-xs text-foreground disabled:opacity-60"
                      onClick={() => onFeedback(runId, 'needs_improvement')}
                      disabled={feedbackLoading}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      需改进
                    </button>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
    </div>
  );
}
