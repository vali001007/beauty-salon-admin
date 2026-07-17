import { useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  createBrainInspectionRule,
  decideBrainInspectionRepair,
  getBrainInspectionRepairPreview,
  listBrainInspectionFindings,
  listBrainInspectionRules,
  runBrainInspection,
  updateBrainInspectionRule,
} from '@/api/brain';
import type { BrainInspectionRepairDecision, BrainInspectionRepairPreview } from '@/types/brain';
import { BrainResourceGovernancePanel } from './BrainResourceGovernancePanel';
import { BrainInspectionRepairDialog } from './BrainInspectionRepairDialog';

interface Finding {
  id: number;
  ruleKey: string;
  title: string;
  severity: string;
  status: string;
  evidence: Record<string, unknown>;
  suggestion: Record<string, unknown>;
}

function findingsFrom(response: unknown) {
  const items = response && typeof response === 'object' ? (response as { items?: unknown }).items : undefined;
  return Array.isArray(items) ? (items as Finding[]) : [];
}

export function BrainInspectionGovernance() {
  const [view, setView] = useState<'findings' | 'rules'>('findings');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<BrainInspectionRepairPreview | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);

  async function loadFindings() {
    setLoading(true);
    try {
      setFindings(findingsFrom(await listBrainInspectionFindings()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '巡检发现加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadFindings(); }, []);

  async function run() {
    setRunning(true);
    try {
      const result = await runBrainInspection() as { findingCount?: number };
      toast.success(`巡检完成，命中 ${result.findingCount ?? 0} 条`);
      await loadFindings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '巡检执行失败');
    } finally {
      setRunning(false);
    }
  }

  async function openRepairPreview(id: number) {
    setLoadingPreviewId(id);
    try {
      setPreview(await getBrainInspectionRepairPreview(id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '修复预览加载失败');
    } finally {
      setLoadingPreviewId(null);
    }
  }

  async function decideRepair(
    decision: BrainInspectionRepairDecision,
    modifications: Record<string, unknown>,
    note: string,
  ) {
    if (!preview) return;
    setSavingDecision(true);
    try {
      await decideBrainInspectionRepair(preview.findingId, { decision, modifications, note });
      toast.success(decision === 'reject' ? '已拒绝修复预览' : '审批已记录，业务数据尚未修改');
      setPreview(null);
      await loadFindings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '修复预览审批失败');
    } finally {
      setSavingDecision(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-1 border-b border-border">
        <button type="button" className={`px-3 py-2 text-sm ${view === 'findings' ? 'border-b-2 border-primary' : 'text-muted-foreground'}`} onClick={() => setView('findings')}>风险发现</button>
        <button type="button" className={`px-3 py-2 text-sm ${view === 'rules' ? 'border-b-2 border-primary' : 'text-muted-foreground'}`} onClick={() => setView('rules')}>规则版本</button>
      </div>
      {view === 'rules' ? (
        <BrainResourceGovernancePanel
          title="巡检规则"
          description="六域巡检规则包含事实来源、窗口、阈值、严重度、去重键和建议动作。"
          resourceType="inspection_rule"
          keyField="ruleKey"
          example={{ ruleKey: 'new_rule', name: '新巡检规则', domain: 'store', scheduleCron: '0 8 * * *', condition: {}, suggestionTpl: { action: '人工复核' }, riskLevel: 'medium' }}
          loadActive={listBrainInspectionRules}
          createResource={createBrainInspectionRule}
          updateResource={updateBrainInspectionRule}
        />
      ) : (
        <section>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div><h2 className="text-base font-semibold">主动巡检</h2><p className="mt-1 text-sm text-muted-foreground">同一风险持续更新，解除后自动关闭；处置结果进入真阳性统计。</p></div>
            <div className="flex gap-2">
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm" onClick={() => void loadFindings()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</button>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60" onClick={() => void run()} disabled={running}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}立即巡检</button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto border border-border">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">风险</th><th className="px-3 py-2">规则/级别</th><th className="px-3 py-2">证据</th><th className="px-3 py-2">建议</th><th className="px-3 py-2">处置</th></tr></thead>
              <tbody>{findings.length ? findings.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-3"><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.status}</div></td>
                  <td className="px-3 py-3 text-xs">{item.ruleKey}<br />{item.severity}</td>
                  <td className="max-w-sm px-3 py-3 text-xs text-muted-foreground"><pre className="whitespace-pre-wrap font-sans">{JSON.stringify(item.evidence, null, 2)}</pre></td>
                  <td className="max-w-xs px-3 py-3 text-xs text-muted-foreground"><pre className="whitespace-pre-wrap font-sans">{JSON.stringify(item.suggestion, null, 2)}</pre></td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs disabled:opacity-60"
                      disabled={loadingPreviewId === item.id}
                      onClick={() => void openRepairPreview(item.id)}
                    >
                      {loadingPreviewId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      审查
                    </button>
                  </td>
                </tr>
              )) : <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{loading ? '加载中' : '暂无巡检发现'}</td></tr>}</tbody>
            </table>
          </div>
        </section>
      )}
      <BrainInspectionRepairDialog
        preview={preview}
        saving={savingDecision}
        onClose={() => setPreview(null)}
        onDecision={(decision, modifications, note) => void decideRepair(decision, modifications, note)}
      />
    </div>
  );
}
