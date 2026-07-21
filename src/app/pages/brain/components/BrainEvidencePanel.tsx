import { CheckCircle2, Database, GitBranch, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import type {
  BrainActionPreview as BrainActionPreviewType,
  BrainActionDecisionResponse,
  BrainMessage,
  BrainRunEvent,
} from '@/types/brain';
import { BrainActionPreview } from './BrainActionPreview';

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
}

function eventLabel(event: BrainRunEvent) {
  return event.stepKey.replace(/^skill_/, '').replaceAll('_', ' ');
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
}: BrainEvidencePanelProps) {
  const metadata = message?.metadata;
  const runId = metadata?.runId;
  const citations = metadata?.citations ?? [];
  const actions = (metadata?.suggestedActions ?? []).filter(isConfirmableAction);

  return (
    <aside className="hidden w-80 min-w-80 flex-col border-l border-border bg-muted/10 xl:flex">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">依据与动作</h2>
        <p className="mt-1 text-xs text-muted-foreground">选择一条回答查看来源、运行轨迹和待确认动作。</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
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
                  events.map((event) => (
                    <div key={event.id} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="min-w-0">
                        <span className="block break-words font-medium text-foreground">{eventLabel(event)}</span>
                        <span className="text-muted-foreground">
                          {event.layer}
                          {event.latencyMs != null ? ` · ${event.latencyMs}ms` : ''}
                        </span>
                      </span>
                    </div>
                  ))
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
    </aside>
  );
}
