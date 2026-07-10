import type { BrainActionPreview as BrainActionPreviewType } from '@/types/brain';

export function BrainActionPreview({ action }: { action: BrainActionPreviewType }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-sm font-medium">{action.summary}</div>
      <div className="mt-1 text-xs text-muted-foreground">{action.riskLevel}</div>
    </div>
  );
}
