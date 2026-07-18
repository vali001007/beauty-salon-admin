import { Check, Loader2, RotateCcw, ShieldAlert, X } from 'lucide-react';
import type { BrainActionDecisionResponse, BrainActionPreview as BrainActionPreviewType } from '@/types/brain';

interface BrainActionPreviewProps {
  action: BrainActionPreviewType;
  result?: BrainActionDecisionResponse;
  loading?: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onRetry: () => void;
}

const riskLabels: Record<BrainActionPreviewType['riskLevel'], string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '关键风险',
};

const statusLabels: Record<BrainActionDecisionResponse['status'], string> = {
  pending: '等待确认',
  queued: '动作已排队',
  executing: '正在执行',
  succeeded: '执行成功',
  partially_succeeded: '部分执行成功',
  failed: '执行失败',
  expired: '确认已过期',
  rejected: '已拒绝该动作',
};

export function BrainActionPreview({ action, result, loading, onConfirm, onReject, onRetry }: BrainActionPreviewProps) {
  const receipt = result?.receipt;
  const awaitingDecision = !result || result.status === 'pending';
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{action.summary}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {riskLabels[action.riskLevel]} · 确认后将执行真实业务写入并生成回执
          </div>
        </div>
      </div>

      {!awaitingDecision && result ? (
        <div className="mt-3 space-y-1 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <div>{statusLabels[result.status]}</div>
          {receipt?.message ? <div className="text-foreground">{receipt.message}</div> : null}
          {receipt?.businessObjectType && receipt.businessObjectId != null ? (
            <div>业务单据：{receipt.businessObjectType} #{String(receipt.businessObjectId)}</div>
          ) : null}
          {result.error?.message ? <div className="text-destructive">{result.error.message}</div> : null}
          {result.status === 'failed' && result.retryable ? (
            <button
              type="button"
              className="mt-2 inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground disabled:opacity-60"
              onClick={onRetry}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              重试执行
            </button>
          ) : null}
          {result.status === 'failed' && result.recovery === 'manual_reconcile' ? (
            <div className="text-amber-700">请先核对后台业务单据，确认未写入后再重新生成动作预览。</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            确认执行
          </button>
          <button
            type="button"
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground disabled:opacity-60"
            onClick={onReject}
            disabled={loading}
          >
            <X className="h-3.5 w-3.5" />
            拒绝
          </button>
        </div>
      )}
    </div>
  );
}
