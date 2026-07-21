import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, X } from 'lucide-react';
import type { BrainInspectionRepairDecision, BrainInspectionRepairPreview } from '@/types/brain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

interface Props {
  preview: BrainInspectionRepairPreview | null;
  saving: boolean;
  onClose: () => void;
  onDecision: (decision: BrainInspectionRepairDecision, modifications: Record<string, unknown>, note: string) => void;
}

export function BrainInspectionRepairDialog({ preview, saving, onClose, onDecision }: Props) {
  const [mode, setMode] = useState<'review' | 'modify'>('review');
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    setMode('review');
    setValues({});
    setNote('');
  }, [preview?.findingId, preview?.previewFingerprint]);

  if (!preview) return null;

  const modifications = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value.trim() !== '')
      .map(([key, value]) => [key, normalizeValue(key, value)]),
  );
  const canSubmitModification = Object.keys(modifications).length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto" aria-describedby="inspection-repair-description">
        <DialogHeader>
          <DialogTitle>修复预览</DialogTitle>
          <DialogDescription id="inspection-repair-description">
            批准只记录治理决定，不会修改预约、服务、库存或采购数据。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <section className="border-b border-border pb-4">
            <div className="font-medium">{preview.title}</div>
            <div className="mt-1 text-muted-foreground">{preview.summary}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {preview.ruleKey} · {preview.target.objectType}:{preview.target.objectId}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium">拟核对字段</h3>
            <div className="divide-y divide-border border border-border">
              {preview.changes.map((change) => (
                <div key={change.inputKey} className="grid gap-2 px-3 py-3 sm:grid-cols-[140px_1fr]">
                  <div>
                    <div className="font-medium">{change.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">当前：{displayValue(change.currentValue)}</div>
                  </div>
                  <div>
                    {mode === 'modify' ? (
                      <input
                        value={values[change.inputKey] ?? ''}
                        onChange={(event) => setValues((current) => ({ ...current, [change.inputKey]: event.target.value }))}
                        placeholder="输入核对后的值"
                        className="h-9 w-full rounded-md border border-border bg-background px-3 outline-none focus:border-primary"
                      />
                    ) : null}
                    <div className={`${mode === 'modify' ? 'mt-2' : ''} text-xs text-muted-foreground`}>{change.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium">风险</h3>
            <div className="space-y-2">
              {preview.risks.map((risk) => (
                <div key={risk} className="flex gap-2 text-sm text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{risk}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <label htmlFor="inspection-repair-note" className="mb-2 block text-sm font-medium">审批备注</label>
            <textarea
              id="inspection-repair-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="可选：记录核对依据或交接说明"
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </section>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => onDecision('reject', {}, note)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 disabled:opacity-60"
            >
              <X className="h-4 w-4" />拒绝
            </button>
            {mode === 'review' ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setMode('modify')}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 disabled:opacity-60"
              >
                <Pencil className="h-4 w-4" />修改
              </button>
            ) : (
              <button
                type="button"
                disabled={saving || !canSubmitModification}
                onClick={() => onDecision('modify', modifications, note)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}修改后批准
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => onDecision('approve', {}, note)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}批准
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '未设置';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function normalizeValue(key: string, value: string): unknown {
  if (['safetyStock', 'currentStock', 'minPurchaseQty', 'unitPrice'].includes(key)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value.trim();
  }
  return value.trim();
}
