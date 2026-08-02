import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  createBrainInspectionRule,
  cancelBrainGovernanceReads,
  decideBrainInspectionRepair,
  getBrainInspectionFinding,
  getBrainInspectionRepairPreview,
  isBrainGovernanceReadCancelled,
  listBrainInspectionFindings,
  listBrainInspectionRules,
  runBrainInspection,
  updateBrainInspectionRule,
} from '@/api/brain';
import type { BrainInspectionFinding, BrainInspectionRepairDecision, BrainInspectionRepairPreview } from '@/types/brain';
import { BrainResourceGovernancePanel } from './BrainResourceGovernancePanel';
import { BrainInspectionRepairDialog } from './BrainInspectionRepairDialog';
import { usePermission } from '@/hooks/usePermission';
import { BRAIN_GOVERNANCE_UI_MODE } from '../brainGovernanceNavigation';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/app/components/ui/sheet';

export function BrainInspectionGovernance() {
  const [params, setParams] = useSearchParams();
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const canExecute = usePermission('core:brain:execute') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [view, setView] = useState<'findings' | 'rules'>('findings');
  const [findings, setFindings] = useState<BrainInspectionFinding[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedFinding, setSelectedFinding] = useState<BrainInspectionFinding | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<BrainInspectionRepairPreview | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<number | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);
  const page = Math.max(1, Number(params.get('inspectionPage') ?? 1));
  const pageSize = 20;
  const findingStatus = params.get('inspectionStatus') || 'open';
  const search = params.get('inspectionSearch') || '';
  const severity = params.get('inspectionRisk') || '';
  const owner = params.get('inspectionOwner') || '';
  const candidateKey = params.get('inspectionCandidate') || '';
  const createdFrom = params.get('inspectionCreatedFrom') || '';
  const createdTo = params.get('inspectionCreatedTo') || '';
  const selectedId = Number(params.get('inspectionFinding')) || null;
  const selectedSummary = findings.find((item) => item.id === selectedId) ?? null;
  const loadSequence = useRef(0);

  const loadFindings = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const response = await listBrainInspectionFindings({
        page,
        pageSize,
        status: findingStatus === 'all' ? undefined : findingStatus,
        search: search || undefined,
        severity: severity || undefined,
        owner: owner || undefined,
        candidateKey: candidateKey || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
      });
      if (sequence !== loadSequence.current) return;
      setFindings(response.items ?? []);
      setTotal(response.total ?? 0);
    } catch (error) {
      if (isBrainGovernanceReadCancelled(error)) return;
      toast.error(error instanceof Error ? error.message : '巡检发现加载失败');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [candidateKey, createdFrom, createdTo, findingStatus, owner, page, search, severity]);

  useEffect(() => { void loadFindings(); }, [loadFindings]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedFinding(null);
      setDetailError('');
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError('');
    void getBrainInspectionFinding(selectedId)
      .then((finding) => { if (active) setSelectedFinding(finding); })
      .catch((error) => {
        if (active && !isBrainGovernanceReadCancelled(error)) setDetailError(error instanceof Error ? error.message : '巡检详情加载失败');
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  function updateFindingQuery(key: string, value?: string) {
    cancelBrainGovernanceReads();
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'inspectionPage' && key !== 'inspectionFinding') next.delete('inspectionPage');
    setParams(next);
  }

  async function run() {
    if (!canManage) return;
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
    if (!canExecute) return;
    setLoadingPreviewId(id);
    try {
      setPreview(await getBrainInspectionRepairPreview(id));
    } catch (error) {
      if (isBrainGovernanceReadCancelled(error)) return;
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
    if (!canExecute || !preview) return;
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
          canManage={canManage}
        />
      ) : (
        <section>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div><h2 className="text-base font-semibold">主动巡检</h2><p className="mt-1 text-sm text-muted-foreground">同一风险持续更新，解除后自动关闭；处置结果进入真阳性统计。</p></div>
            <div className="flex gap-2">
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm" onClick={() => void loadFindings()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</button>
              {canManage ? <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60" onClick={() => void run()} disabled={running}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}立即巡检</button> : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="tablist" aria-label="巡检发现视图">
              {([['open', '待处理'], ['closed', '已解除'], ['all', '全部']] as const).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={findingStatus === key} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${findingStatus === key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => updateFindingQuery('inspectionStatus', key)}>{label}</button>
              ))}
            </div>
            <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={search} placeholder="搜索风险、规则或级别" onChange={(event) => updateFindingQuery('inspectionSearch', event.target.value)} />
            <select aria-label="巡检风险" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={severity} onChange={(event) => updateFindingQuery('inspectionRisk', event.target.value)}><option value="">全部风险</option><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option><option value="critical">极高风险</option></select>
            <input aria-label="巡检负责人" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={owner} placeholder="负责人" onChange={(event) => updateFindingQuery('inspectionOwner', event.target.value)} />
            <input aria-label="巡检 Candidate" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={candidateKey} placeholder="Candidate" onChange={(event) => updateFindingQuery('inspectionCandidate', event.target.value)} />
            <label className="text-xs text-muted-foreground">开始时间<input aria-label="巡检开始时间" type="date" className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={createdFrom} onChange={(event) => updateFindingQuery('inspectionCreatedFrom', event.target.value)} /></label>
            <label className="text-xs text-muted-foreground">结束时间<input aria-label="巡检结束时间" type="date" className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={createdTo} onChange={(event) => updateFindingQuery('inspectionCreatedTo', event.target.value)} /></label>
          </div>
          <div className="mt-4 overflow-x-auto border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">风险</th><th className="px-3 py-2">规则/级别</th><th className="px-3 py-2">证据摘要</th><th className="px-3 py-2">处置</th></tr></thead>
              <tbody>{findings.length ? findings.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-3"><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.status}</div></td>
                  <td className="px-3 py-3 text-xs">{item.ruleKey}<br />{item.severity}</td>
                  <td className="max-w-sm px-3 py-3 text-xs text-muted-foreground">已记录 {item.evidenceCount ?? 0} 项证据、{item.suggestionCount ?? 0} 项建议{item.owner ? <><br />负责人：{item.owner}</> : null}{item.candidateKey ? <><br />Candidate：{item.candidateKey}</> : null}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2"><button type="button" className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs" onClick={() => updateFindingQuery('inspectionFinding', String(item.id))}>查看详情</button>{canExecute ? <button
                      type="button"
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs disabled:opacity-60"
                      disabled={loadingPreviewId === item.id}
                      onClick={() => void openRepairPreview(item.id)}
                    >
                      {loadingPreviewId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      审查
                    </button> : <span className="self-center text-xs text-muted-foreground">只读</span>}</div>
                  </td>
                </tr>
              )) : <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">{loading ? '加载中' : '暂无巡检发现'}</td></tr>}</tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>第 {page}/{Math.max(1, Math.ceil(total / pageSize))} 页，共 {total} 项</span>
            <div className="flex gap-2"><button type="button" className="rounded-md border px-3 py-1.5 disabled:opacity-50" disabled={page <= 1} onClick={() => updateFindingQuery('inspectionPage', String(page - 1))}>上一页</button><button type="button" className="rounded-md border px-3 py-1.5 disabled:opacity-50" disabled={page * pageSize >= total} onClick={() => updateFindingQuery('inspectionPage', String(page + 1))}>下一页</button></div>
          </div>
        </section>
      )}
      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && updateFindingQuery('inspectionFinding')}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{selectedFinding?.title ?? selectedSummary?.title ?? '巡检详情'}</SheetTitle><SheetDescription>证据和建议仅在详情中按需加载，关闭后保留筛选与页码。</SheetDescription></SheetHeader>{detailLoading ? <div className="p-4 text-sm text-muted-foreground">正在加载巡检详情…</div> : detailError ? <div className="m-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{detailError}</div> : selectedFinding ? <div className="space-y-4 px-4 pb-6 text-sm"><div className="rounded-lg border p-3"><strong>{selectedFinding.ruleKey}</strong><p className="mt-1 text-muted-foreground">{selectedFinding.severity} · {selectedFinding.status}</p></div><section><h3 className="font-medium">证据</h3><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{JSON.stringify(selectedFinding.evidence, null, 2)}</pre></section><section><h3 className="font-medium">建议</h3><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{JSON.stringify(selectedFinding.suggestion, null, 2)}</pre></section></div> : <div className="p-4 text-sm text-muted-foreground">巡检详情不可用。</div>}</SheetContent>
      </Sheet>
      <BrainInspectionRepairDialog
        preview={canExecute ? preview : null}
        saving={savingDecision}
        onClose={() => setPreview(null)}
        onDecision={(decision, modifications, note) => void decideRepair(decision, modifications, note)}
      />
    </div>
  );
}
