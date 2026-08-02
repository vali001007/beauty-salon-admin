import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Clock3, RefreshCw, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  approveBrainCapabilityPolicy,
  cancelBrainGovernanceReads,
  cancelBrainGovernanceTask,
  classifyBrainCapabilityPolicy,
  evaluateBrainCapabilityPolicy,
  evaluateBrainGovernanceCandidate,
  getBrainCapabilityPolicy,
  getBrainGovernanceCandidate,
  getBrainGovernanceProcessLatency,
  getBrainGovernanceTask,
  getBrainGovernanceOverview,
  isBrainGovernanceReadCancelled,
  listBrainCapabilityPolicies,
  listBrainGovernanceCandidates,
  listBrainGovernanceTasks,
  listBrainPolicySnapshots,
  publishBrainPolicySnapshot,
  previewBrainPolicySnapshot,
  prepareBrainGovernanceCandidatePolicy,
  retryBrainGovernanceTask,
  rollbackBrainPolicySnapshot,
  updateBrainCapabilityPolicyOwners,
} from '@/api/brain';
import type { ApiErrorPayload } from '@/api/client';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/app/components/ui/sheet';
import { Textarea } from '@/app/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';
import type {
  BrainCapabilityPolicyDetailResponse,
  BrainCapabilityPolicyVersion,
  BrainGovernanceMode,
  BrainGovernanceCandidate,
  BrainGovernanceCandidateDetail,
  BrainLatencyMetricSummary,
  BrainGovernanceOverview,
  BrainGovernanceProcessLatencyResponse,
  BrainGovernanceRelease,
  BrainGovernanceRiskLevel,
  BrainGovernanceTask,
  BrainPolicySnapshotPreview,
} from '@/types/brain';
import { BRAIN_GOVERNANCE_UI_MODE } from '../brainGovernanceNavigation';
import { BrainSkillRegistryPanel } from './BrainSkillGovernance';

const activeTaskStatuses = new Set(['pending', 'validating', 'classifying', 'evaluating']);
const terminalCandidateStatuses = new Set(['completed', 'superseded']);

export function BrainGovernanceOverviewPage() {
  const navigate = useNavigate();
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [data, setData] = useState<BrainGovernanceOverview | null>(null);
  const [processLatency, setProcessLatency] = useState<BrainGovernanceProcessLatencyResponse | null>(null);
  const [candidates, setCandidates] = useState<BrainGovernanceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<GovernanceErrorView | null>(null);
  const [saving, setSaving] = useState(false);
  const [candidateDetail, setCandidateDetail] = useState<BrainGovernanceCandidateDetail | null>(null);
  const [candidateDetailOpen, setCandidateDetailOpen] = useState(false);
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
  const [candidateDetailError, setCandidateDetailError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, candidatePage, latency] = await Promise.all([
        getBrainGovernanceOverview(),
        listBrainGovernanceCandidates({ page: 1, pageSize: 3 }),
        getBrainGovernanceProcessLatency({ days: 7 }).catch(() => null),
      ]);
      setData(overview);
      setCandidates(candidatePage.items ?? []);
      setProcessLatency(latency);
    } catch (loadError) {
      if (!isBrainGovernanceReadCancelled(loadError)) setError(governanceErrorView(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingPanel label="正在汇总治理状态…" />;
  if (error) return <ErrorPanel error={error} onRetry={load} />;
  if (!data) return <EmptyPanel label="暂无治理数据" />;

  const currentCandidate = candidates.find((item) => !['completed', 'superseded'].includes(item.status)) ?? candidates[0] ?? null;

  async function evaluateCurrentCandidate() {
    if (!currentCandidate) return;
    setSaving(true);
    try {
      const result = await evaluateBrainGovernanceCandidate(currentCandidate.candidateKey);
      toast.success(`已为 ${result.taskIds.length} 个受影响能力创建治理评估`);
      await load();
    } catch (evaluateError) {
      toast.error(errorMessage(evaluateError));
    } finally {
      setSaving(false);
    }
  }

  async function openCandidateDetail() {
    if (!currentCandidate) return;
    setCandidateDetailOpen(true);
    setCandidateDetailLoading(true);
    setCandidateDetailError('');
    try {
      setCandidateDetail(await getBrainGovernanceCandidate(currentCandidate.candidateKey));
    } catch (loadError) {
      if (!isBrainGovernanceReadCancelled(loadError)) setCandidateDetailError(errorMessage(loadError));
    } finally {
      setCandidateDetailLoading(false);
    }
  }

  const cards = [
    ['待分类', data.pending.unclassified, '/brain-governance/workbench?tab=capabilities&riskLevel=unclassified'],
    ['评估中', data.pending.evaluating, '/brain-governance/workbench?tab=tasks&status=evaluating'],
    ['待审批', data.pending.pendingApproval, '/brain-governance/workbench?tab=tasks&status=pending_approval'],
    ['需修订', data.pending.revisionRequired, '/brain-governance/workbench?tab=tasks&status=revision_required'],
  ] as const;

  return (
    <section className="space-y-5" aria-label="Brain 治理总览">
      <PageHeader title="治理总览" description="异常驱动的 Brain 治理工作台。策略发布与运行生效分别展示。" action={<Button variant="outline" onClick={load}><RefreshCw />刷新</Button>} />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-base">当前 Candidate</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">同一候选统一查看门禁、治理、策略和发布准备度。</p>
            </div>
            {currentCandidate && canManage ? <Button disabled={saving} onClick={() => void evaluateCurrentCandidate()}><ShieldCheck />评估受影响能力</Button> : null}
          </div>
        </CardHeader>
        <CardContent>
          {!currentCandidate ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">尚无可信 Candidate；CI Receipt 入库后会自动出现。</div> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <StatusRow label="分支" value={currentCandidate.branch ?? '未声明'} />
              <StatusRow label="Commit" value={shortCommit(currentCandidate.headCommit)} />
              <StatusRow label="风险" value={`${governanceLabel(currentCandidate.riskLevel)}风险`} />
              <StatusRow label="状态" value={governanceLabel(currentCandidate.status)} />
              <StatusRow label="证据 / 任务" value={`${currentCandidate._count?.receipts ?? 0} / ${currentCandidate._count?.tasks ?? 0}`} />
              <div className="md:col-span-2 xl:col-span-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate(`/brain-governance/workbench?tab=capabilities&candidateKey=${encodeURIComponent(currentCandidate.candidateKey)}&affectedOnly=true`)}>查看受影响能力</Button>
                <Button variant="outline" size="sm" onClick={() => navigate(`/brain-governance/workbench?tab=tasks&candidateKey=${encodeURIComponent(currentCandidate.candidateKey)}`)}>查看候选任务</Button>
                <Button variant="outline" size="sm" onClick={() => void openCandidateDetail()}>候选详情</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, path]) => (
          <button key={label} type="button" onClick={() => navigate(path)} className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-2 flex items-end justify-between"><span className="text-3xl font-semibold">{value}</span><ArrowRight className="size-4 text-muted-foreground" /></div>
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryCard title="风险分布" values={data.risk} />
        <SummaryCard title="准入状态" values={data.whitelist} />
        <Card>
          <CardHeader><CardTitle className="text-base">策略与运行</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusRow label="最新治理策略" value={data.latestPolicySnapshot?.releaseKey ?? '尚未发布'} />
            <StatusRow label="当前运行 Release" value={data.runtimeRelease?.releaseKey ?? '规则模式/无 Release'} />
            <StatusRow
              label="治理运行模式"
              value={data.runtimeGovernance ? (data.runtimeGovernance.mode === 'shadow' ? 'Shadow 观察' : 'Enforced 强制') : '尚未接入'}
            />
            <StatusRow label="运行待接入" value={`${data.runtimePending} 项`} />
            <ConsistencyBadge status={data.runtimeConsistency} />
            {data.runtimeConsistency !== 'aligned' && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">治理策略发布不会自动改变当前 Brain 运行状态。</p>}
            {data.runtimeConsistency === 'aligned' && data.runtimeGovernance?.mode === 'shadow' && <p className="rounded-lg bg-blue-50 p-3 text-blue-800">治理策略已接入 Shadow，仅记录差异，不会阻断现有能力。</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近 7 天端到端治理效率</CardTitle>
          <p className="text-sm text-muted-foreground">按同一 Candidate 的真实事件计算；不会把任务快速进入阻塞的耗时当成治理完成周期。</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="候选样本" value={processLatency ? String(processLatency.candidateCount) : '暂无数据'} />
          <Metric label="Candidate Gate P50" value={processMetric(processLatency?.metrics.candidateGate)} />
          <Metric label="Receipt 入库 P50" value={processMetric(processLatency?.metrics.receiptIngest)} />
          <Metric label="等待证据 P50" value={processMetric(processLatency?.metrics.waitingEvidence)} />
          <Metric label="等待审批 P50" value={processMetric(processLatency?.metrics.waitingApproval)} />
          <Metric label="Candidate → Shadow P50" value={processMetric(processLatency?.metrics.candidateToShadow)} />
          <Metric label="Shadow → Full P50" value={processMetric(processLatency?.metrics.shadowToFull)} />
          <Metric label="Gate 复用率" value={gateReuseValue(processLatency)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">最近 7 天自动化效果</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="终态治理任务" value={processLatency ? String(processLatency.taskOutcomes.terminal) : '暂无数据'} />
          <Metric label="首次通过 / 发生重试" value={taskOutcomeValue(processLatency)} />
          <Metric label="避免 / 实际模型调用" value={modelInvocationValue(processLatency)} />
          <Metric label="自动准入 / 人工改判" value={`${percentage(data.efficiency.autoAdmissionRate)} / ${percentage(data.efficiency.manualOverrideRate)}`} />
        </CardContent>
      </Card>
      <Sheet open={candidateDetailOpen} onOpenChange={setCandidateDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>当前 Candidate</SheetTitle>
            <SheetDescription>门禁、策略差异、受影响能力和运行发布准备度按同一候选身份展示。</SheetDescription>
          </SheetHeader>
          {candidateDetailLoading ? <LoadingPanel label="正在加载 Candidate…" /> : candidateDetailError ? (
            <div className="m-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{candidateDetailError}</div>
          ) : candidateDetail ? (
            <div className="space-y-4 px-4 pb-6 text-sm">
              <div className="rounded-lg border p-3">
                <div className="font-medium break-all">{candidateDetail.candidateKey}</div>
                <div className="mt-1 text-muted-foreground">{candidateDetail.branch ?? '未声明分支'} · {shortCommit(candidateDetail.headCommit)} · {governanceLabel(candidateDetail.status)}</div>
              </div>
              <section>
                <h3 className="font-medium">策略差异与发布准备度</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatusRow label="新增" value={String(candidateDetail.policyDiff?.added.length ?? 0)} />
                  <StatusRow label="变更" value={String(candidateDetail.policyDiff?.changed.length ?? 0)} />
                  <StatusRow label="移除" value={String(candidateDetail.policyDiff?.removed.length ?? 0)} />
                  <StatusRow label="当前阶段" value={candidateDetail.releaseReadiness.currentStage ? governanceLabel(candidateDetail.releaseReadiness.currentStage) : '未创建灰度序列'} />
                </div>
                <div className={`mt-2 rounded-lg p-3 ${candidateDetail.releaseReadiness.canRelease ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                  {candidateDetail.releaseReadiness.canRelease
                    ? `Release ${candidateDetail.releaseReadiness.releaseKey ?? ''} 已满足当前阶段门禁`
                    : `运行尚未就绪：${candidateDetail.releaseReadiness.blockers.join('、')}`}
                </div>
              </section>
              <section><h3 className="font-medium">受影响能力（{candidateDetail.affectedCapabilities.length}）</h3><div className="mt-2 flex flex-wrap gap-2">{candidateDetail.affectedCapabilities.map((key) => <Badge key={key} variant="outline">{key}</Badge>)}</div></section>
              <section><h3 className="font-medium">门禁 Receipt（{candidateDetail.receipts.length}）</h3><div className="mt-2 space-y-2">{candidateDetail.receipts.map((receipt) => <div key={receipt.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{receipt.receiptKey}</strong><Badge variant={receipt.verificationStatus === 'verified' ? 'default' : 'secondary'}>{receipt.verificationStatus}</Badge></div><p className="mt-1 text-muted-foreground">{receipt.stage} · {receipt.trustLevel} · {receipt.gates.length} 个 Gate</p></div>)}</div></section>
              <section><h3 className="font-medium">当前阻塞（{candidateDetail.blockers.length}）</h3>{candidateDetail.blockers.length ? <div className="mt-2 space-y-2">{candidateDetail.blockers.map((task) => <div key={task.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">#{task.id} · {task.resourceKey ?? '全局'} · {task.blockerCode ?? task.blockerType}</div>)}</div> : <p className="mt-2 text-muted-foreground">无当前阻塞</p>}</section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function BrainCapabilityGovernancePage() {
  const [params, setParams] = useSearchParams();
  const panel = params.get('panel') === 'skills' ? 'skills' : 'policies';
  const selectedKey = params.get('selectedId')?.trim() || null;
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const canApprove = usePermission('core:brain-governance:approve') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [items, setItems] = useState<BrainCapabilityPolicyVersion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<GovernanceErrorView | null>(null);
  const [selected, setSelected] = useState<BrainCapabilityPolicyDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [classifying, setClassifying] = useState<BrainCapabilityPolicyVersion | null>(null);
  const [assigningOwner, setAssigningOwner] = useState<BrainCapabilityPolicyVersion | null>(null);
  const [saving, setSaving] = useState(false);
  const explicitAllScope = params.get('scope') === 'all';
  const candidateScopeParams = params.toString();
  const [candidateScopeState, setCandidateScopeState] = useState<'resolving' | 'ready' | 'error'>(
    params.get('candidateKey') || explicitAllScope ? 'ready' : 'resolving',
  );
  const [candidateScopeError, setCandidateScopeError] = useState<GovernanceErrorView | null>(null);
  const [candidateScopeRetry, setCandidateScopeRetry] = useState(0);
  const loadSequence = useRef(0);

  const query = useMemo(() => ({
    page: Number(params.get('page') ?? 1),
    pageSize: 20,
    search: params.get('search') || undefined,
    riskLevel: params.get('riskLevel') || undefined,
    mode: params.get('mode') || undefined,
    whitelistStatus: params.get('whitelistStatus') || undefined,
    runtimeStatus: params.get('runtimeStatus') || undefined,
    status: params.get('status') || undefined,
    candidateKey: params.get('candidateKey') || undefined,
    affectedOnly: params.get('affectedOnly') === 'true',
    actionableOnly: params.get('actionableOnly') === 'true',
    owner: params.get('owner') || undefined,
    blockerType: params.get('blockerType') || undefined,
  }), [params]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const response = await listBrainCapabilityPolicies(query);
      if (sequence !== loadSequence.current) return;
      setItems(response.items ?? []);
      setTotal(response.total ?? 0);
    } catch (loadError) {
      if (sequence === loadSequence.current && !isBrainGovernanceReadCancelled(loadError)) setError(governanceErrorView(loadError));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (panel !== 'policies' || query.candidateKey || explicitAllScope) {
      setCandidateScopeState('ready');
      setCandidateScopeError(null);
      return;
    }
    let active = true;
    setCandidateScopeState('resolving');
    setCandidateScopeError(null);
    void listBrainGovernanceCandidates({ page: 1, pageSize: 20 })
      .then((response) => {
        if (!active) return;
        const currentCandidate = (response.items ?? []).find((candidate) => !terminalCandidateStatuses.has(candidate.status));
        if (!currentCandidate) {
          setCandidateScopeState('ready');
          return;
        }
        const next = new URLSearchParams(candidateScopeParams);
        next.set('candidateKey', currentCandidate.candidateKey);
        next.set('affectedOnly', 'true');
        next.delete('scope');
        next.delete('page');
        setParams(next, { replace: true });
      })
      .catch((scopeError) => {
        if (!active || isBrainGovernanceReadCancelled(scopeError)) return;
        setCandidateScopeError(governanceErrorView(scopeError));
        setCandidateScopeState('error');
      });
    return () => { active = false; };
  }, [candidateScopeParams, candidateScopeRetry, explicitAllScope, panel, query.candidateKey, setParams]);

  useEffect(() => {
    if (panel === 'policies' && candidateScopeState === 'ready') void load();
  }, [candidateScopeState, load, panel]);

  useEffect(() => {
    if (panel !== 'policies' || !selectedKey) {
      setSelected(null);
      setDetailLoading(false);
      setDetailError('');
      return;
    }
    let active = true;
    setSelected(null);
    setDetailLoading(true);
    setDetailError('');
    void getBrainCapabilityPolicy(selectedKey)
      .then((detail) => {
        if (active) setSelected(detail);
      })
      .catch((detailError) => {
        if (active && !isBrainGovernanceReadCancelled(detailError)) {
          const message = errorMessage(detailError);
          setDetailError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [panel, selectedKey]);

  function openDetail(key: string) {
    updateParam(params, setParams, 'selectedId', key, false);
  }

  function closeDetail() {
    updateParam(params, setParams, 'selectedId', '', false);
  }

  function showAllCapabilities() {
    cancelBrainGovernanceReads();
    const next = new URLSearchParams(params);
    next.delete('candidateKey');
    next.delete('affectedOnly');
    next.delete('selectedId');
    next.delete('page');
    next.set('scope', 'all');
    setParams(next);
  }

  async function evaluate(item: BrainCapabilityPolicyVersion) {
    setSaving(true);
    try {
      const task = await evaluateBrainCapabilityPolicy(item.resourceKey);
      toast.success(`已创建评估任务 #${task.taskId}`);
    } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setSaving(false); }
  }

  async function approve(item: BrainCapabilityPolicyVersion) {
    const reason = window.prompt('填写审批理由');
    if (!reason?.trim()) return;
    setSaving(true);
    try {
      await approveBrainCapabilityPolicy(item.resourceKey, { decision: 'approve', reason });
      toast.success('能力策略已审批');
      await load();
    } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setSaving(false); }
  }

  async function requestRevision(item: BrainCapabilityPolicyVersion) {
    const reason = window.prompt('填写退回修订理由');
    if (!reason?.trim()) return;
    setSaving(true);
    try {
      await approveBrainCapabilityPolicy(item.resourceKey, { decision: 'revision_required', reason });
      toast.success('已退回修订');
      await load();
    } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setSaving(false); }
  }

  async function evaluateCandidateCapabilities() {
    if (!query.candidateKey) return;
    setSaving(true);
    try {
      const result = await evaluateBrainGovernanceCandidate(query.candidateKey);
      toast.success(`已为当前 Candidate 创建 ${result.taskIds.length} 个评估任务`);
      await load();
    } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setSaving(false); }
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="能力治理"
        description={query.candidateKey ? `当前仅显示 Candidate ${query.candidateKey} 的受影响能力。` : '统一查看能力策略、Skill 注册、版本历史、证据和运行接入。'}
        action={panel === 'policies' ? <div className="flex flex-wrap gap-2">{query.candidateKey ? <Button variant="outline" onClick={showAllCapabilities}>查看全部能力</Button> : null}{canManage && query.candidateKey ? <Button disabled={saving} onClick={() => void evaluateCandidateCapabilities()}><ShieldCheck />批量评估当前 Candidate</Button> : null}<Button variant="outline" onClick={load}><RefreshCw />刷新</Button></div> : undefined}
      />
      <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="tablist" aria-label="能力治理视图">
        <button
          type="button"
          role="tab"
          aria-selected={panel === 'policies'}
          className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${panel === 'policies' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          onClick={() => updateParam(params, setParams, 'panel', '')}
        >
          治理准入
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panel === 'skills'}
          className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${panel === 'skills' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          onClick={() => updateParam(params, setParams, 'panel', 'skills')}
        >
          Skill 注册
        </button>
      </div>
      {panel === 'skills' ? <BrainSkillRegistryPanel embedded /> : candidateScopeState === 'resolving' ? <LoadingPanel label="正在定位当前 Candidate…" /> : candidateScopeState === 'error' && candidateScopeError ? <ErrorPanel error={candidateScopeError} onRetry={() => setCandidateScopeRetry((value) => value + 1)} /> : <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <FilterInput label="搜索能力" value={query.search ?? ''} onChange={(value) => updateParam(params, setParams, 'search', value)} />
        <FilterInput label="负责人" value={query.owner ?? ''} onChange={(value) => updateParam(params, setParams, 'owner', value)} />
        <FilterSelect label="风险" value={query.riskLevel ?? ''} options={['unclassified', 'low', 'medium', 'high', 'critical']} onChange={(value) => updateParam(params, setParams, 'riskLevel', value)} />
        <FilterSelect label="模式" value={query.mode ?? ''} options={['readonly', 'preview', 'advisory', 'alert']} onChange={(value) => updateParam(params, setParams, 'mode', value)} />
        <FilterSelect label="准入" value={query.whitelistStatus ?? ''} options={['not_allowed', 'pending', 'approved', 'suspended', 'expired']} onChange={(value) => updateParam(params, setParams, 'whitelistStatus', value)} />
        <FilterSelect label="运行接入" value={query.runtimeStatus ?? ''} options={['pending_runtime', 'shadow', 'enforced']} onChange={(value) => updateParam(params, setParams, 'runtimeStatus', value)} />
        <FilterSelect label="版本状态" value={query.status ?? ''} options={['draft', 'active', 'archived']} onChange={(value) => updateParam(params, setParams, 'status', value)} />
        <FilterSelect label="阻塞类型" value={query.blockerType ?? ''} options={['evidence', 'business', 'system', 'permission']} onChange={(value) => updateParam(params, setParams, 'blockerType', value)} />
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={query.actionableOnly} onChange={(event) => updateParam(params, setParams, 'actionableOnly', event.target.checked ? 'true' : '')} />仅显示待处理能力</label>
      {loading ? <LoadingPanel label="正在加载能力策略…" /> : error ? <ErrorPanel error={error} onRetry={load} /> : items.length === 0 ? <EmptyPanel label="暂无符合条件的能力策略" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-[1450px] w-full text-sm">
            <thead className="bg-muted/60 text-left"><tr>{['能力 / 业务名称', '变更原因', '风险', '治理模式', '准入', '证据', '运行接入', '权限', '负责人', '操作'].map((label) => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => openDetail(item.resourceKey)}>{item.resourceKey}</button><div className="text-xs text-muted-foreground">{capabilityBusinessName(item) !== item.resourceKey ? `${capabilityBusinessName(item)} · ` : ''}v{item.version}</div>{item.governance?.blockerTypes.length ? <div className="mt-1 text-xs text-amber-700">{item.governance.blockerTypes.map(governanceLabel).join('、')} · {item.governance.activeTaskCount} 个任务</div> : null}</td>
                  <td className="max-w-56 px-3 py-3 text-xs text-muted-foreground">{candidateChangeReason(item, Boolean(query.candidateKey))}</td>
                  <td className="px-3 py-3"><RiskBadge value={item.policy.riskLevel} /></td>
                  <td className="px-3 py-3"><Badge variant="outline">{modeLabel(item.policy.mode)}</Badge></td>
                  <td className="px-3 py-3"><Badge variant={item.policy.whitelistStatus === 'approved' ? 'default' : 'secondary'}>{whitelistLabel(item.policy.whitelistStatus)}</Badge></td>
                  <td className="px-3 py-3">{item.policy.evidence.length ? `${item.policy.evidence.length} 份` : <span className="text-amber-700">缺失</span>}</td>
                  <td className="px-3 py-3"><RuntimeBadge value={item.policy.runtimeEnforcementStatus} /></td>
                  <td className="max-w-48 px-3 py-3 text-xs text-muted-foreground">{item.policy.permissions.join('、') || '未登记'}</td>
                  <td className="max-w-40 px-3 py-3 text-xs text-muted-foreground">{capabilityOwners(item) || '未指定'}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openDetail(item.resourceKey)}>详情</Button>{canManage && (item.policy.riskLevel === 'unclassified' || item.governance?.blockerCodes.includes('risk_classification_required')) && <Button size="sm" variant="outline" disabled={saving} onClick={() => setClassifying(item)}>分类</Button>}{canManage && <Button size="sm" variant="outline" disabled={saving} onClick={() => setAssigningOwner(item)}>负责人</Button>}{canManage && <Button size="sm" variant="outline" disabled={saving} onClick={() => void evaluate(item)}>评估</Button>}{canApprove && item.policy.whitelistStatus === 'pending' && <><Button size="sm" disabled={saving} title={['high', 'critical'].includes(item.policy.riskLevel) ? '仅审批治理结论，不进入普通执行白名单' : undefined} onClick={() => void approve(item)}>{['high', 'critical'].includes(item.policy.riskLevel) ? '治理审批' : '审批准入'}</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => void requestRevision(item)}>退回修订</Button></>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-sm text-muted-foreground">共 {total} 项；筛选条件已写入 URL，可刷新或分享。</div>
      <PaginationControls page={query.page} pageSize={query.pageSize} total={total} onPageChange={(page) => updateParam(params, setParams, 'page', String(page), false)} />
      <CapabilityDetailSheet detail={selected} open={Boolean(selectedKey)} loading={detailLoading} error={detailError} onClose={closeDetail} />
      <ClassificationDialog item={classifying} saving={saving} onClose={() => setClassifying(null)} onSubmit={async (payload) => {
        if (!classifying) return;
        setSaving(true);
        try {
          const task = await classifyBrainCapabilityPolicy(classifying.resourceKey, payload);
          toast.success(`已创建分类任务 #${task.taskId}`);
          setClassifying(null);
        } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setSaving(false); }
      }} />
      <OwnerDialog item={assigningOwner} saving={saving} onClose={() => setAssigningOwner(null)} onSubmit={async (owner) => {
        if (!assigningOwner) return;
        setSaving(true);
        try {
          await updateBrainCapabilityPolicyOwners(assigningOwner.resourceKey, {
            owners: { ...assigningOwner.policy.owners, primary: owner },
            reason: `更新治理负责人：${owner}`,
          });
          toast.success('治理负责人已更新，原有风险、证据和准入结论保持不变');
          setAssigningOwner(null);
          await load();
        } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setSaving(false); }
      }} />
      </>}
    </section>
  );
}

export function BrainGovernanceTasksPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const canApprove = usePermission('core:brain-governance:approve') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [items, setItems] = useState<BrainGovernanceTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<GovernanceErrorView | null>(null);
  const [refreshError, setRefreshError] = useState<GovernanceErrorView | null>(null);
  const [selectedTask, setSelectedTask] = useState<BrainGovernanceTask | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const loadSequence = useRef(0);
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const pageSize = 20;
  const view = params.get('view') || 'actionable';
  const status = params.get('status') || undefined;
  const search = params.get('search') || undefined;
  const riskLevel = params.get('riskLevel') || undefined;
  const candidateKey = params.get('candidateKey') || undefined;
  const selectedTaskId = Number(params.get('selectedTask')) || null;
  const blockerType = params.get('blockerType')
    || (view === 'evidence' ? 'evidence' : view === 'system' ? 'system' : undefined);
  const viewStatus = view === 'system' ? 'failed' : view === 'completed' ? 'approved' : undefined;
  const hasActiveTasks = items.some((item) => activeTaskStatuses.has(item.status)
    || (item.status === 'revision_required' && (item.blockerType === 'evidence' || item.resolutionType === 'wait_ci')));

  const load = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    const sequence = ++loadSequence.current;
    if (!background) setLoading(true);
    try {
      const response = await listBrainGovernanceTasks({
        page,
        pageSize,
        status: status ?? viewStatus,
        search,
        riskLevel,
        candidateKey,
        blockerType,
        actionableOnly: view === 'actionable' && !status,
      });
      if (sequence !== loadSequence.current) return;
      setItems(response.items ?? []);
      setTotal(response.total ?? 0);
      setError(null);
      setRefreshError(null);
    } catch (loadError) {
      if (sequence === loadSequence.current && !isBrainGovernanceReadCancelled(loadError)) {
        const view = governanceErrorView(loadError);
        if (background) setRefreshError(view);
        else setError(view);
      }
    } finally { if (sequence === loadSequence.current && !background) setLoading(false); }
  }, [blockerType, candidateKey, page, riskLevel, search, status, view, viewStatus]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selectedTaskId) { setSelectedTask(null); setDetailError(''); return; }
    let active = true;
    setDetailLoading(true);
    setDetailError('');
    getBrainGovernanceTask(selectedTaskId)
      .then((task) => { if (active) setSelectedTask(task); })
      .catch((loadError) => { if (active && !isBrainGovernanceReadCancelled(loadError)) setDetailError(errorMessage(loadError)); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedTaskId]);
  useEffect(() => {
    if (!hasActiveTasks) return;
    let cancelled = false;
    let timer: number | undefined;
    let nextPollDelayMs = 5_000;
    const clear = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (delayMs = nextPollDelayMs, resetBackoffAfterPoll = false) => {
      clear();
      if (cancelled || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(async () => {
        timer = undefined;
        await load({ background: true });
        if (cancelled) return;
        if (resetBackoffAfterPoll) {
          nextPollDelayMs = 5_000;
        } else {
          nextPollDelayMs = Math.min(nextPollDelayMs * 2, 30_000);
        }
        schedule();
      }, delayMs);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        nextPollDelayMs = 5_000;
        schedule(1_000, true);
      } else {
        clear();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    schedule();
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [hasActiveTasks, load]);

  async function retry(item: BrainGovernanceTask) {
    try { await retryBrainGovernanceTask(item.id); toast.success(`任务 #${item.id} 已重试`); await load(); } catch (retryError) { toast.error(errorMessage(retryError)); }
  }

  async function cancel(item: BrainGovernanceTask) {
    if (!window.confirm(`确认取消治理任务 #${item.id}？历史任务和审计记录会保留。`)) return;
    try { await cancelBrainGovernanceTask(item.id); toast.success(`任务 #${item.id} 已取消`); await load(); } catch (cancelError) { toast.error(errorMessage(cancelError)); }
  }

  const taskViews = [
    ['actionable', '待我处理'],
    ['evidence', '等待证据'],
    ['system', '系统失败'],
    ['completed', '已完成'],
  ] as const;

  return (
    <section className="space-y-4">
      <PageHeader title="治理任务" description={candidateKey ? `当前 Candidate：${candidateKey}` : '分类、评估、审批和失败恢复使用同一套任务状态。'} action={<Button variant="outline" onClick={() => void load()}><RefreshCw />刷新</Button>} />
      {refreshError ? <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span>自动刷新失败，当前列表可能不是最新：{refreshError.message}</span><Button size="sm" variant="outline" onClick={() => void load()}>立即刷新</Button></div> : null}
      <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="tablist" aria-label="治理任务视图">
        {taskViews.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ${view === key ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => updateParam(params, setParams, 'view', key)}>{label}</button>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-3"><FilterInput label="搜索任务/能力" value={search ?? ''} onChange={(value) => updateParam(params, setParams, 'search', value)} /><FilterSelect label="风险" value={riskLevel ?? ''} options={['unclassified', 'low', 'medium', 'high', 'critical']} onChange={(value) => updateParam(params, setParams, 'riskLevel', value)} /><FilterSelect label="状态" value={status ?? ''} options={['pending', 'validating', 'classifying', 'evaluating', 'pending_approval', 'revision_required', 'approved', 'rejected', 'failed', 'cancelled']} onChange={(value) => updateParam(params, setParams, 'status', value)} /></div>
      {loading ? <LoadingPanel label="正在加载治理任务…" /> : error ? <ErrorPanel error={error} onRetry={load} /> : items.length === 0 ? <EmptyPanel label="暂无治理任务" /> : (
        <div className="space-y-3">
          {items.map((item) => {
            const systemError = item.status === 'failed' || item.blockerType === 'system';
            const businessBlock = item.status === 'revision_required';
            const waitingEvidence = item.blockerType === 'evidence' || item.resolutionType === 'wait_ci';
            const storeScopeRequired = item.blockerCode === 'store_scope_required' || item.resolutionType === 'select_store';
            const retryable = canManage && item.status === 'failed' && item.blockerType === 'system';
            const cancellable = canManage && activeTaskStatuses.has(item.status);
            return <Card key={item.id}><CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">#{item.id} · {item.taskType}</span><Badge variant={systemError ? 'destructive' : businessBlock ? 'secondary' : 'outline'}>{taskStatusLabel(item.status)}</Badge><RiskBadge value={item.riskLevel as BrainGovernanceRiskLevel} /></div><div className="mt-1 text-sm text-muted-foreground">{item.resourceKey ?? '全局任务'} · {item.stage} · 尝试 {item.attemptCount}/{item.maxAttempts}</div>{systemError && <p className="mt-2 text-sm text-destructive">系统错误：{item.errorMessage ?? item.errorCode ?? item.blockerCode ?? '未知错误'}</p>}{waitingEvidence && <div className="mt-2 rounded-lg bg-blue-50 p-2 text-sm text-blue-800"><p>等待 CI 可信证据；Receipt 入库后系统会自动重新评估，无需手工重试。</p>{item.candidate ? <p className="mt-1 break-all">Candidate：{item.candidate.branch ?? '未声明分支'} · {shortCommit(item.candidate.headCommit)} · {item.candidate.candidateKey}</p> : <p className="mt-1">Candidate 身份尚未关联，当前不能判断应接收哪一份证据。</p>}<p className="mt-1">所需 Gate：{item.requiredGates?.length ? item.requiredGates.join('、') : '尚未生成 Gate 清单'}</p></div>}{storeScopeRequired && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">需要指定门店范围。请在页面顶部的门店选择器中选择具体门店后再继续。</p>}{businessBlock && !waitingEvidence && !storeScopeRequired && <p className="mt-2 text-sm text-amber-700">业务阻塞：{item.blockerCode ?? String(item.result?.blockingReason ?? '治理条件不完整')}</p>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => updateParam(params, setParams, 'selectedTask', String(item.id), false)}>查看详情</Button>{item.status === 'pending_approval' && item.resourceKey ? <Button variant={canApprove ? 'default' : 'outline'} onClick={() => navigate(`/brain-governance/workbench?tab=capabilities&actionableOnly=true&selectedId=${encodeURIComponent(String(item.resourceKey))}`)}>{canApprove ? '查看并审批能力' : '查看能力'}</Button> : null}{retryable && <Button variant="outline" onClick={() => void retry(item)}><RotateCcw />重试系统任务</Button>}{cancellable && <Button variant="outline" onClick={() => void cancel(item)}>取消</Button>}</div></CardContent></Card>;
          })}
        </div>
      )}
      <PaginationControls page={page} pageSize={pageSize} total={total} onPageChange={(nextPage) => updateParam(params, setParams, 'page', String(nextPage), false)} />
      <Sheet open={Boolean(selectedTaskId)} onOpenChange={(open) => !open && updateParam(params, setParams, 'selectedTask', '', false)}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{selectedTask ? `任务 #${selectedTask.id}` : '任务详情'}</SheetTitle><SheetDescription>业务阻塞、系统错误和状态变化分开展示。</SheetDescription></SheetHeader>{detailLoading ? <LoadingPanel label="正在加载任务详情…" /> : detailError ? <div className="m-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{detailError}</div> : selectedTask ? <div className="space-y-4 px-4 pb-6 text-sm"><StatusRow label="能力" value={selectedTask.resourceKey ?? '全局任务'} /><StatusRow label="阻塞类型" value={governanceLabel(selectedTask.blockerType ?? 'none')} /><StatusRow label="解决方式" value={selectedTask.resolutionType ?? '无'} />{selectedTask.candidate ? <section className="rounded-lg border p-3"><h3 className="font-medium">Candidate 身份</h3><p className="mt-1 break-all text-muted-foreground">{selectedTask.candidate.branch ?? '未声明分支'} · {shortCommit(selectedTask.candidate.headCommit)} · {selectedTask.candidate.candidateKey}</p><p className="mt-2">所需 Gate：{selectedTask.requiredGates?.length ? selectedTask.requiredGates.join('、') : '尚未生成 Gate 清单'}</p></section> : null}{selectedTask.resolutionType === 'select_store' || selectedTask.blockerCode === 'store_scope_required' ? <p className="rounded-lg bg-amber-50 p-3 text-amber-800">请在页面顶部选择具体门店后再继续该任务。</p> : null}<section><h3 className="font-medium">状态时间线</h3><div className="mt-2 space-y-2">{(selectedTask.timeline ?? []).map((entry) => <div key={`${entry.index}-${entry.status}`} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><strong>{taskStatusLabel(entry.status)}</strong><span className="text-xs text-muted-foreground">{entry.at ? new Date(entry.at).toLocaleString() : '时间未记录'}</span></div>{entry.reason && <p className="mt-1 text-muted-foreground">{entry.reason}</p>}{entry.blockerCode && <p className="mt-1 text-amber-700">{entry.blockerCode}</p>}</div>)}</div></section><details><summary className="cursor-pointer font-medium">技术详情</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{JSON.stringify({ payload: selectedTask.payload, result: selectedTask.result }, null, 2)}</pre></details></div> : null}</SheetContent></Sheet>
    </section>
  );
}

export function BrainPolicySnapshotsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || undefined;
  const snapshotStatus = params.get('status') || undefined;
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const canPublish = usePermission('core:brain-governance:publish') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [items, setItems] = useState<BrainGovernanceRelease[]>([]);
  const [candidates, setCandidates] = useState<BrainGovernanceCandidate[]>([]);
  const [preview, setPreview] = useState<BrainPolicySnapshotPreview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<GovernanceErrorView | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try { const [response, candidatePage] = await Promise.all([listBrainPolicySnapshots({ pageSize: 50, search, status: snapshotStatus }), listBrainGovernanceCandidates({ page: 1, pageSize: 50 })]); if (sequence !== loadSequence.current) return; setItems(response.items ?? []); setCandidates((candidatePage.items ?? []).filter((item) => !['completed', 'superseded'].includes(item.status))); setError(null); } catch (loadError) { if (sequence === loadSequence.current && !isBrainGovernanceReadCancelled(loadError)) setError(governanceErrorView(loadError)); } finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [search, snapshotStatus]);
  useEffect(() => { void load(); }, [load]);

  const selectedCandidateKey = params.get('candidateKey') || '';

  async function previewCandidate() {
    if (!selectedCandidateKey) { toast.error('请先选择 Candidate'); return; }
    try { setPreview(await previewBrainPolicySnapshot(selectedCandidateKey)); } catch (saveError) { toast.error(errorMessage(saveError)); }
  }

  async function prepareCandidate() {
    if (!selectedCandidateKey) return;
    setPreparing(true);
    try {
      const result = await prepareBrainGovernanceCandidatePolicy(selectedCandidateKey, 'governance_ui_candidate_prepare');
      setPreview(result);
      if (result.decision === 'reuse_active') toast.success('策略无差异，已复用当前发布快照');
      else if (result.decision === 'created') toast.success('已为 Candidate 创建策略草稿，Runtime 尚未改变');
      else toast.error('候选策略仍有阻塞项');
      await load();
    } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setPreparing(false); }
  }
  async function publish(item: BrainGovernanceRelease) {
    if (!window.confirm(`将发布策略快照 ${item.releaseKey}，影响 ${item.items?.length ?? item.itemCount ?? 0} 项能力。\n\n发布治理策略不会自动改变当前 Brain 运行。`)) return;
    try { await publishBrainPolicySnapshot(item.id); toast.success('治理策略已发布；运行接入状态仍需单独确认'); await load(); } catch (saveError) { toast.error(errorMessage(saveError)); }
  }
  async function rollback(item: BrainGovernanceRelease) {
    const reason = window.prompt('填写策略回滚理由');
    if (!reason?.trim()) return;
    try { await rollbackBrainPolicySnapshot(item.id, reason); toast.success('治理策略已回滚，运行 Release 未改变'); await load(); } catch (saveError) { toast.error(errorMessage(saveError)); }
  }

  return (
    <section className="space-y-4">
      <PageHeader title="策略快照" description="先对 Candidate 生成差异；无 diff 时复用当前快照，不制造新审批。" />
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>生效边界：</strong>这里发布的是治理规则，不会自动激活 Skill、Semantic 或当前 Brain Runtime Release。</div>
      <Card><CardHeader><CardTitle className="text-base">Candidate 策略准备</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Candidate" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" value={selectedCandidateKey} onChange={(event) => { updateParam(params, setParams, 'candidateKey', event.target.value); setPreview(null); }}><option value="">请选择 Candidate</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.candidateKey}>{candidate.branch ?? candidate.candidateKey} · {shortCommit(candidate.headCommit)}</option>)}</select><Button variant="outline" disabled={!selectedCandidateKey} onClick={() => void previewCandidate()}>预览 diff</Button>{canManage && <Button disabled={!selectedCandidateKey || preparing} onClick={() => void prepareCandidate()}><ShieldCheck />{preparing ? '准备中…' : '准备策略'}</Button>}</div>{preview ? <div className={`rounded-lg border p-4 text-sm ${preview.decision === 'blocked' ? 'border-amber-300 bg-amber-50' : 'bg-muted/30'}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{preview.decision === 'reuse_active' ? '无策略差异，复用当前快照' : preview.decision === 'blocked' ? '暂不可准备策略' : '需创建新策略快照'}</strong><Badge variant="outline">{preview.affectedCapabilities.length} 个受影响能力</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><StatusRow label="新增" value={String(preview.diff.added.length)} /><StatusRow label="变更" value={String(preview.diff.changed.length)} /><StatusRow label="移除" value={String(preview.diff.removed.length)} /><StatusRow label="未变" value={String(preview.diff.unchanged.length)} /></div>{preview.blockers.length ? <div className="mt-3 space-y-1 text-amber-800">{preview.blockers.map((blocker) => <p key={`${blocker.code}-${blocker.capabilityKey ?? ''}`}>{blocker.capabilityKey ? `${blocker.capabilityKey}：` : ''}{blocker.code}</p>)}</div> : null}</div> : null}</CardContent></Card>
      <div className="grid gap-2 sm:max-w-2xl sm:grid-cols-2"><FilterInput label="搜索快照" value={search ?? ''} onChange={(value) => updateParam(params, setParams, 'search', value)} /><FilterSelect label="状态" value={snapshotStatus ?? ''} options={['draft', 'active', 'archived', 'rolled_back']} onChange={(value) => updateParam(params, setParams, 'status', value)} /></div>
      {loading ? <LoadingPanel label="正在加载策略快照…" /> : error ? <ErrorPanel error={error} onRetry={load} /> : items.length === 0 ? <EmptyPanel label="暂无策略快照" /> : (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((item) => <Card key={item.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{item.releaseKey}</CardTitle><div className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div></div><Badge variant={item.status === 'active' ? 'default' : 'outline'}>{releaseStatusLabel(item.status)}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><StatusRow label="能力策略数量" value={String(item.items?.length ?? item.itemCount ?? 0)} /><StatusRow label="快照范围" value="governance_policy" /><p className="text-muted-foreground">运行接入状态需在治理总览和运行发布页单独核对。</p><div className="flex gap-2">{canPublish && item.status === 'draft' && <Button size="sm" onClick={() => void publish(item)}><Send />发布策略</Button>}{canPublish && item.status === 'active' && item.previousReleaseId && <Button size="sm" variant="outline" onClick={() => void rollback(item)}><RotateCcw />回滚策略</Button>}</div></CardContent></Card>)}
        </div>
      )}
    </section>
  );
}

function ClassificationDialog({ item, saving, onClose, onSubmit }: { item: BrainCapabilityPolicyVersion | null; saving: boolean; onClose: () => void; onSubmit: (payload: { riskLevel: string; mode: string; reason: string; permissions: string[] }) => Promise<void> }) {
  const [riskLevel, setRiskLevel] = useState<BrainGovernanceRiskLevel>('unclassified');
  const [mode, setMode] = useState<BrainGovernanceMode>('alert');
  const [reason, setReason] = useState('');
  useEffect(() => { if (item) { setRiskLevel(item.policy.riskLevel); setMode(item.policy.mode); setReason(item.policy.reason); } }, [item]);
  return <Dialog open={Boolean(item)} onOpenChange={(open) => !open && !saving && onClose()}><DialogContent><DialogHeader><DialogTitle>能力风险分类</DialogTitle><DialogDescription>{item?.resourceKey}；降低风险等级需要审批权限和明确理由。</DialogDescription></DialogHeader><div className="space-y-3"><FilterSelect label="风险等级" value={riskLevel} options={['unclassified', 'low', 'medium', 'high', 'critical']} onChange={(value) => setRiskLevel(value as BrainGovernanceRiskLevel)} /><FilterSelect label="治理模式" value={mode} options={['readonly', 'preview', 'advisory', 'alert']} onChange={(value) => setMode(value as BrainGovernanceMode)} /><label className="block text-sm"><span className="mb-1 block text-muted-foreground">分类理由</span><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label></div><DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>取消</Button><Button disabled={saving || !reason.trim()} onClick={() => void onSubmit({ riskLevel, mode, reason, permissions: item?.policy.permissions ?? [] })}>提交分类</Button></DialogFooter></DialogContent></Dialog>;
}

function OwnerDialog({ item, saving, onClose, onSubmit }: { item: BrainCapabilityPolicyVersion | null; saving: boolean; onClose: () => void; onSubmit: (owner: string) => Promise<void> }) {
  const [owner, setOwner] = useState('');
  useEffect(() => { setOwner(String(item?.policy.owners.primary ?? '')); }, [item]);
  return <Dialog open={Boolean(item)} onOpenChange={(open) => !open && !saving && onClose()}><DialogContent><DialogHeader><DialogTitle>指定治理负责人</DialogTitle><DialogDescription>{item?.resourceKey}；负责人用于待办筛选、升级和审计。</DialogDescription></DialogHeader><label className="block text-sm"><span className="mb-1 block text-muted-foreground">负责人</span><Input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="用户、团队或角色标识" /></label><DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>取消</Button><Button disabled={saving || !owner.trim()} onClick={() => void onSubmit(owner.trim())}>保存负责人</Button></DialogFooter></DialogContent></Dialog>;
}

function CapabilityDetailSheet({ detail, open, loading, error, onClose }: { detail: BrainCapabilityPolicyDetailResponse | null; open: boolean; loading: boolean; error: string; onClose: () => void }) {
  const trustedEvidence = detail?.evidence.filter(isTrustedCurrentEvidence) ?? [];
  const historicalEvidence = detail?.evidence.filter((item) => !isTrustedCurrentEvidence(item)) ?? [];
  const candidateImpacts = detail?.candidateImpacts ?? [];
  const tasks = detail?.tasks ?? [];
  const auditEvents = detail?.auditEvents ?? [];
  return <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{detail?.current.resourceKey ?? '能力详情'}</SheetTitle><SheetDescription>当前治理策略、Candidate 影响、可信与历史证据、任务及审计；关闭后保留列表筛选与位置。</SheetDescription></SheetHeader>{loading ? <div className="flex min-h-48 items-center justify-center gap-2 px-4 text-sm text-muted-foreground"><Clock3 className="size-4 animate-pulse" />正在加载能力详情…</div> : error ? <div className="mx-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">能力详情加载失败：{error}</div> : detail ? <div className="space-y-4 px-4 pb-6 text-sm"><div className="flex flex-wrap gap-2"><RiskBadge value={detail.current.policy.riskLevel} /><Badge variant="outline">{modeLabel(detail.current.policy.mode)}</Badge><RuntimeBadge value={detail.current.policy.runtimeEnforcementStatus} /></div><StatusRow label="准入状态" value={['high', 'critical'].includes(detail.current.policy.riskLevel) ? '禁止普通执行白名单' : whitelistLabel(detail.current.policy.whitelistStatus)} /><StatusRow label="权限范围" value={detail.current.policy.permissions.join('、') || '未登记'} /><StatusRow label="负责人" value={Object.values(detail.current.policy.owners).filter(Boolean).map(String).join('、') || '未指定'} /><StatusRow label="治理理由" value={detail.current.policy.reason || '未填写'} /><CandidateImpactGroup items={candidateImpacts} /><EvidenceGroup title="可信证据" items={trustedEvidence} empty="暂无当前有效的可信证据" /><EvidenceGroup title="历史或失效证据" items={historicalEvidence} empty="暂无历史证据" /><TaskGroup items={tasks} /><details><summary className="cursor-pointer font-medium">策略内变更影响</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{JSON.stringify(detail.current.policy.impact, null, 2)}</pre></details><div><h3 className="font-medium">版本历史</h3><div className="mt-2 space-y-2">{detail.history.map((version) => <div key={version.id} className="rounded-lg border p-3">v{version.version} · {version.status} · 操作人 #{version.createdBy} · {new Date(version.createdAt).toLocaleString()}</div>)}</div></div><AuditEventGroup items={auditEvents} /></div> : null}</SheetContent></Sheet>;
}

function CandidateImpactGroup({ items }: { items: Array<Record<string, unknown>> }) {
  return <section><h3 className="font-medium">当前 Candidate 影响</h3>{items.length ? <div className="mt-2 space-y-2">{items.map((item, index) => { const receipt = objectRecord(item.receipt); const candidate = objectRecord(receipt.candidate); return <div key={String(item.id ?? index)} className="rounded-lg border p-3 text-xs"><div>{String(candidate.branch ?? candidate.candidateKey ?? '未知 Candidate')} · {String(item.changeType ?? 'changed')}</div><div className="mt-1 text-muted-foreground">规则：{String(item.impactRuleId ?? '未记录')} · commit {shortCommit(String(candidate.headCommit ?? ''))}</div></div>; })}</div> : <p className="mt-1 text-muted-foreground">当前没有 Candidate 影响记录</p>}</section>;
}

function TaskGroup({ items }: { items: BrainGovernanceTask[] }) {
  return <section><h3 className="font-medium">治理任务与待办</h3>{items.length ? <div className="mt-2 space-y-2">{items.slice(0, 20).map((item) => <div key={item.id} className="rounded-lg border p-3 text-xs"><div>#{item.id} · {item.taskType} · {taskStatusLabel(item.status)}</div><div className="mt-1 text-muted-foreground">{item.blockerCode ?? item.resolutionType ?? '无当前阻塞'} · {new Date(item.updatedAt).toLocaleString()}</div></div>)}</div> : <p className="mt-1 text-muted-foreground">暂无治理任务</p>}</section>;
}

function AuditEventGroup({ items }: { items: Array<Record<string, unknown>> }) {
  return <section><h3 className="font-medium">审计记录</h3>{items.length ? <div className="mt-2 space-y-2">{items.map((item, index) => <div key={String(item.id ?? index)} className="rounded-lg border p-3 text-xs"><div>{String(item.eventType ?? '治理事件')} · {String(item.actorType ?? 'system')} {item.actorId ? `#${String(item.actorId)}` : ''}</div><div className="mt-1 text-muted-foreground">{item.createdAt ? new Date(String(item.createdAt)).toLocaleString() : '时间未记录'}</div></div>)}</div> : <p className="mt-1 text-muted-foreground">暂无独立治理事件，版本历史仍保留。</p>}</section>;
}

function EvidenceGroup({ title, items, empty }: { title: string; items: Array<Record<string, unknown>>; empty: string }) {
  return <section><h3 className="font-medium">{title}</h3>{items.length ? <div className="mt-2 space-y-2">{items.map((item, index) => <div key={String(item.id ?? item.receiptKey ?? index)} className="rounded-lg border p-3 text-xs"><div>{String(item.receiptKey ?? `Receipt #${item.id ?? index + 1}`)} · {String(item.trustLevel ?? 'unknown')} · {String(item.status ?? 'unknown')}</div><div className="mt-1 text-muted-foreground">{evidenceReason(item)}</div></div>)}</div> : <p className="mt-1 text-muted-foreground">{empty}</p>}</section>;
}

function isTrustedCurrentEvidence(item: Record<string, unknown>) {
  const expiresAt = Date.parse(String(item.expiresAt ?? ''));
  return ['trusted_candidate', 'verified_release'].includes(String(item.trustLevel))
    && item.verificationStatus === 'verified'
    && item.status === 'passed'
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now();
}

function evidenceReason(item: Record<string, unknown>) {
  if (isTrustedCurrentEvidence(item)) return `有效至 ${new Date(String(item.expiresAt)).toLocaleString()}`;
  if (item.verificationError) return `验签失败：${String(item.verificationError)}`;
  const expiresAt = Date.parse(String(item.expiresAt ?? ''));
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return `已于 ${new Date(expiresAt).toLocaleString()} 过期`;
  if (item.status === 'stale') return '候选身份或能力证据已变化，当前不可复用';
  return '仅供历史审计，不参与当前自动准入';
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</header>; }
function SummaryCard({ title, values }: { title: string; values: Record<string, number> }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-2">{Object.entries(values).map(([key, value]) => <StatusRow key={key} label={governanceLabel(key)} value={String(value)} />)}</CardContent></Card>; }
function StatusRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="block text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><select className="h-9 w-full rounded-lg border bg-background px-3" value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部</option>{options.map((option) => <option key={option} value={option}>{governanceLabel(option)}</option>)}</select></label>; }
function PaginationControls({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) { const pageCount = Math.max(1, Math.ceil(total / pageSize)); if (total <= pageSize) return null; return <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">第 {page}/{pageCount} 页，共 {total} 项</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</Button></div></div>; }
function LoadingPanel({ label }: { label: string }) { return <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"><Clock3 className="size-4 animate-pulse" />{label}</div>; }
function EmptyPanel({ label }: { label: string }) { return <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed text-muted-foreground">{label}</div>; }
interface GovernanceErrorView {
  message: string;
  category: NonNullable<ApiErrorPayload['category']>;
  resolutionType?: string;
  retryable: boolean;
}

function ErrorPanel({ error, onRetry }: { error: GovernanceErrorView; onRetry: () => void | Promise<void> }) {
  const title = error.category === 'permission'
    ? '权限不足'
    : error.category === 'business_blocker'
      ? '当前条件未满足'
      : error.category === 'conflict'
        ? '状态已变化'
        : '治理服务请求失败';
  const resolution = ({
    wait_ci: '可信 Receipt 入库后系统会自动继续，无需手工重试。',
    select_store: '请选择具体门店后再继续。',
    request_approval: '请联系管理员或具备相应权限的审批人处理。',
    edit_policy: '请检查能力风险、治理模式和策略证据后再提交。',
    contact_owner: '请联系能力负责人查看阻断详情。',
    retry_system: '这是系统错误，可以安全重试。',
  } as Record<string, string>)[error.resolutionType ?? ''];
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 text-center text-destructive">
      <AlertTriangle />
      <strong>{title}</strong>
      <span>{error.message}</span>
      {resolution ? <span className="text-sm opacity-80">{resolution}</span> : null}
      {error.retryable ? <Button variant="outline" onClick={() => void onRetry()}>{error.category === 'conflict' ? '刷新状态' : '重试'}</Button> : null}
    </div>
  );
}
function RiskBadge({ value }: { value: BrainGovernanceRiskLevel }) { const variant = value === 'critical' || value === 'high' ? 'destructive' : value === 'unclassified' ? 'secondary' : 'outline'; return <Badge variant={variant}>{governanceLabel(value)}风险</Badge>; }
function RuntimeBadge({ value }: { value: string }) { return <Badge variant={value === 'enforced' ? 'default' : value === 'shadow' ? 'secondary' : 'outline'}>{governanceLabel(value)}</Badge>; }
function ConsistencyBadge({ status }: { status: BrainGovernanceOverview['runtimeConsistency'] }) { return <Badge variant={status === 'aligned' ? 'default' : 'secondary'}>{status === 'aligned' ? '策略与运行一致' : status === 'policy_published_runtime_pending' ? '策略已发布，运行待接入' : '策略与运行存在漂移'}</Badge>; }
function updateParam(current: URLSearchParams, setParams: ReturnType<typeof useSearchParams>[1], key: string, value: string, resetPage = true) { cancelBrainGovernanceReads(); const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (resetPage) next.delete('page'); setParams(next); }
function duration(value: number | null) {
  if (value === null) return '暂无数据';
  if (value === 0) return '0 秒';
  if (value > 0 && value < 1000) return '<1 秒';
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分`;
}
function percentage(value: number | null) { return value === null ? '暂无数据' : `${Math.round(value * 100)}%`; }
function processMetric(metric?: BrainLatencyMetricSummary) { return metric?.sampleSize ? `${duration(metric.p50Ms)}（${metric.sampleSize} 个样本）` : '暂无完整样本'; }
function gateReuseValue(data: BrainGovernanceProcessLatencyResponse | null) { return data?.gateReuse.rate === null || data?.gateReuse.rate === undefined ? '暂无完整样本' : `${percentage(data.gateReuse.rate)}（${data.gateReuse.reused}/${data.gateReuse.total}）`; }
function taskOutcomeValue(data: BrainGovernanceProcessLatencyResponse | null) { return !data?.taskOutcomes.terminal ? '暂无完整样本' : `${percentage(data.taskOutcomes.firstPassRate)} / ${percentage(data.taskOutcomes.retryRate)}`; }
function modelInvocationValue(data: BrainGovernanceProcessLatencyResponse | null) { return data ? `${data.gateReuse.avoidedModelInvocations} / ${data.gateReuse.executedModelInvocations}` : '暂无数据'; }
function shortCommit(value: string) { return value.length > 10 ? value.slice(0, 10) : value; }
function objectRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function capabilityBusinessName(item: BrainCapabilityPolicyVersion) { const impact = objectRecord(item.policy.impact); return String(impact.businessName ?? impact.name ?? impact.title ?? item.resourceKey); }
function capabilityOwners(item: BrainCapabilityPolicyVersion) { return Object.values(item.policy.owners).filter((value) => typeof value === 'string' && value.trim()).map(String).join('、'); }
function candidateChangeReason(item: BrainCapabilityPolicyVersion, candidateScoped: boolean) { const impact = item.governance?.candidateImpact; if (!candidateScoped) return item.policy.reason || '查看详情'; if (!impact) return '当前 Candidate 影响原因未记录'; return [impact.changeType ? governanceLabel(impact.changeType) : '能力受影响', impact.impactRuleId].filter(Boolean).join(' · '); }
function modeLabel(value: string) { return governanceLabel(value); }
function whitelistLabel(value: string) { return governanceLabel(value); }
function releaseStatusLabel(value: string) { return governanceLabel(value); }
function taskStatusLabel(value: string) { return governanceLabel(value); }
function governanceLabel(value: string) { return ({ low: '低', medium: '中', high: '高', critical: '极高', unclassified: '待分类', readonly: '只读', preview: '预览', advisory: '建议', alert: '告警', not_allowed: '未准入', pending: '待处理', approved: '已准入', suspended: '已暂停', expired: '已过期', pending_runtime: '运行待接入', shadow: 'Shadow', enforced: '已接入', validating: '校验中', classifying: '分类中', evaluating: '评估中', pending_approval: '待审批', revision_required: '需修订', rejected: '已拒绝', failed: '失败', cancelled: '已取消', draft: '草稿', active: '已发布', archived: '已归档', rolled_back: '已回滚', collecting: '收集中', checking: '门禁检查中', governing: '治理中', ready: '可发布', blocked: '已阻断', releasing: '发布中', observing: '观察中', completed: '已完成', superseded: '已被新候选替代', evidence: '等待证据', business: '业务阻塞', system: '系统失败', permission: '权限阻塞' } as Record<string, string>)[value] ?? value; }
function governanceErrorView(error: unknown): GovernanceErrorView {
  const payload = error && typeof error === 'object' && 'payload' in error
    ? (error as { payload?: ApiErrorPayload }).payload
    : undefined;
  const category = payload?.category && ['business_blocker', 'permission', 'system', 'conflict'].includes(payload.category)
    ? payload.category
    : 'system';
  return {
    message: payload?.message || (error instanceof Error ? error.message : '请求失败，请稍后重试'),
    category,
    resolutionType: payload?.resolutionType,
    retryable: payload?.retryable ?? (category === 'system' || category === 'conflict'),
  };
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '请求失败，请稍后重试'; }
