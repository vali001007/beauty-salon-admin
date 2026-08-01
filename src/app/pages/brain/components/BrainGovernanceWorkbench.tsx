import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Clock3, RefreshCw, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  approveBrainCapabilityPolicy,
  classifyBrainCapabilityPolicy,
  createBrainPolicySnapshot,
  evaluateBrainCapabilityPolicy,
  getBrainCapabilityPolicy,
  getBrainGovernanceOverview,
  isBrainGovernanceReadCancelled,
  listBrainCapabilityPolicies,
  listBrainGovernanceTasks,
  listBrainPolicySnapshots,
  publishBrainPolicySnapshot,
  retryBrainGovernanceTask,
  rollbackBrainPolicySnapshot,
} from '@/api/brain';
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
  BrainGovernanceOverview,
  BrainGovernanceRelease,
  BrainGovernanceRiskLevel,
  BrainGovernanceTask,
} from '@/types/brain';
import { BRAIN_GOVERNANCE_UI_MODE } from '../brainGovernanceNavigation';

const activeTaskStatuses = new Set(['pending', 'validating', 'classifying', 'evaluating']);

export function BrainGovernanceOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<BrainGovernanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getBrainGovernanceOverview());
    } catch (loadError) {
      if (!isBrainGovernanceReadCancelled(loadError)) setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingPanel label="正在汇总治理状态…" />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;
  if (!data) return <EmptyPanel label="暂无治理数据" />;

  const cards = [
    ['待分类', data.pending.unclassified, '/brain-governance/capabilities?riskLevel=unclassified'],
    ['评估中', data.pending.evaluating, '/brain-governance/tasks?status=evaluating'],
    ['待审批', data.pending.pendingApproval, '/brain-governance/tasks?status=pending_approval'],
    ['需修订', data.pending.revisionRequired, '/brain-governance/tasks?status=revision_required'],
  ] as const;

  return (
    <section className="space-y-5" aria-label="Brain 治理总览">
      <PageHeader title="治理总览" description="异常驱动的 Brain 治理工作台。策略发布与运行生效分别展示。" action={<Button variant="outline" onClick={load}><RefreshCw />刷新</Button>} />
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
        <CardHeader><CardTitle className="text-base">最近 7 天治理效率</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="完成任务" value={String(data.efficiency.completed7d)} />
          <Metric label="P50 耗时" value={duration(data.efficiency.p50DurationMs)} />
          <Metric label="P95 耗时" value={duration(data.efficiency.p95DurationMs)} />
          <Metric label="自动准入率" value={percentage(data.efficiency.autoAdmissionRate)} />
          <Metric label="人工改判率" value={percentage(data.efficiency.manualOverrideRate)} />
        </CardContent>
      </Card>
    </section>
  );
}

export function BrainCapabilityGovernancePage() {
  const [params, setParams] = useSearchParams();
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const canApprove = usePermission('core:brain-governance:approve') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [items, setItems] = useState<BrainCapabilityPolicyVersion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<BrainCapabilityPolicyDetailResponse | null>(null);
  const [classifying, setClassifying] = useState<BrainCapabilityPolicyVersion | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useMemo(() => ({
    page: Number(params.get('page') ?? 1),
    pageSize: 20,
    search: params.get('search') || undefined,
    riskLevel: params.get('riskLevel') || undefined,
    mode: params.get('mode') || undefined,
    whitelistStatus: params.get('whitelistStatus') || undefined,
    runtimeStatus: params.get('runtimeStatus') || undefined,
    status: params.get('status') || undefined,
  }), [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listBrainCapabilityPolicies(query);
      setItems(response.items ?? []);
      setTotal(response.total ?? 0);
    } catch (loadError) {
      if (!isBrainGovernanceReadCancelled(loadError)) setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(key: string) {
    try { setSelected(await getBrainCapabilityPolicy(key)); } catch (detailError) { toast.error(errorMessage(detailError)); }
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

  return (
    <section className="space-y-4">
      <PageHeader title="能力治理" description="从启用/停用改为风险、准入、证据和运行接入的一体化视图。" action={<Button variant="outline" onClick={load}><RefreshCw />刷新</Button>} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <FilterInput label="搜索能力" value={query.search ?? ''} onChange={(value) => updateParam(params, setParams, 'search', value)} />
        <FilterSelect label="风险" value={query.riskLevel ?? ''} options={['unclassified', 'low', 'medium', 'high', 'critical']} onChange={(value) => updateParam(params, setParams, 'riskLevel', value)} />
        <FilterSelect label="模式" value={query.mode ?? ''} options={['readonly', 'preview', 'advisory', 'alert']} onChange={(value) => updateParam(params, setParams, 'mode', value)} />
        <FilterSelect label="准入" value={query.whitelistStatus ?? ''} options={['not_allowed', 'pending', 'approved', 'suspended', 'expired']} onChange={(value) => updateParam(params, setParams, 'whitelistStatus', value)} />
        <FilterSelect label="运行接入" value={query.runtimeStatus ?? ''} options={['pending_runtime', 'shadow', 'enforced']} onChange={(value) => updateParam(params, setParams, 'runtimeStatus', value)} />
        <FilterSelect label="版本状态" value={query.status ?? ''} options={['draft', 'active', 'archived']} onChange={(value) => updateParam(params, setParams, 'status', value)} />
      </div>
      {loading ? <LoadingPanel label="正在加载能力策略…" /> : error ? <ErrorPanel message={error} onRetry={load} /> : items.length === 0 ? <EmptyPanel label="暂无符合条件的能力策略" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-[1050px] w-full text-sm">
            <thead className="bg-muted/60 text-left"><tr>{['能力', '风险', '治理模式', '准入', '证据', '运行接入', '权限', '操作'].map((label) => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-3"><button className="font-medium text-primary hover:underline" onClick={() => void openDetail(item.resourceKey)}>{item.resourceKey}</button><div className="text-xs text-muted-foreground">v{item.version}</div></td>
                  <td className="px-3 py-3"><RiskBadge value={item.policy.riskLevel} /></td>
                  <td className="px-3 py-3"><Badge variant="outline">{modeLabel(item.policy.mode)}</Badge></td>
                  <td className="px-3 py-3"><Badge variant={item.policy.whitelistStatus === 'approved' ? 'default' : 'secondary'}>{whitelistLabel(item.policy.whitelistStatus)}</Badge></td>
                  <td className="px-3 py-3">{item.policy.evidence.length ? `${item.policy.evidence.length} 份` : <span className="text-amber-700">缺失</span>}</td>
                  <td className="px-3 py-3"><RuntimeBadge value={item.policy.runtimeEnforcementStatus} /></td>
                  <td className="max-w-48 px-3 py-3 text-xs text-muted-foreground">{item.policy.permissions.join('、') || '未登记'}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void openDetail(item.resourceKey)}>详情</Button>{canManage && <Button size="sm" variant="outline" disabled={saving} onClick={() => setClassifying(item)}>分类</Button>}{canManage && <Button size="sm" variant="outline" disabled={saving} onClick={() => void evaluate(item)}>评估</Button>}{canApprove && item.policy.whitelistStatus === 'pending' && <Button size="sm" disabled={saving} title={['high', 'critical'].includes(item.policy.riskLevel) ? '仅审批治理结论，不进入普通执行白名单' : undefined} onClick={() => void approve(item)}>{['high', 'critical'].includes(item.policy.riskLevel) ? '治理审批' : '审批准入'}</Button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-sm text-muted-foreground">共 {total} 项；筛选条件已写入 URL，可刷新或分享。</div>
      <CapabilityDetailSheet detail={selected} onClose={() => setSelected(null)} />
      <ClassificationDialog item={classifying} saving={saving} onClose={() => setClassifying(null)} onSubmit={async (payload) => {
        if (!classifying) return;
        setSaving(true);
        try {
          const task = await classifyBrainCapabilityPolicy(classifying.resourceKey, payload);
          toast.success(`已创建分类任务 #${task.taskId}`);
          setClassifying(null);
        } catch (saveError) { toast.error(errorMessage(saveError)); } finally { setSaving(false); }
      }} />
    </section>
  );
}

export function BrainGovernanceTasksPage() {
  const [params, setParams] = useSearchParams();
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [items, setItems] = useState<BrainGovernanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const status = params.get('status') || undefined;
  const search = params.get('search') || undefined;
  const riskLevel = params.get('riskLevel') || undefined;

  const load = useCallback(async () => {
    try {
      const response = await listBrainGovernanceTasks({ status, search, riskLevel, pageSize: 50 });
      setItems(response.items ?? []);
      setError('');
    } catch (loadError) {
      if (!isBrainGovernanceReadCancelled(loadError)) setError(errorMessage(loadError));
    } finally { setLoading(false); }
  }, [riskLevel, search, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!items.some((item) => activeTaskStatuses.has(item.status))) return;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [items, load]);

  async function retry(item: BrainGovernanceTask) {
    try { await retryBrainGovernanceTask(item.id); toast.success(`任务 #${item.id} 已重试`); await load(); } catch (retryError) { toast.error(errorMessage(retryError)); }
  }

  return (
    <section className="space-y-4">
      <PageHeader title="治理任务" description="分类、评估、审批和失败恢复使用同一套任务状态。" action={<Button variant="outline" onClick={load}><RefreshCw />刷新</Button>} />
      <div className="grid gap-2 sm:grid-cols-3"><FilterInput label="搜索任务/能力" value={search ?? ''} onChange={(value) => updateParam(params, setParams, 'search', value)} /><FilterSelect label="风险" value={riskLevel ?? ''} options={['unclassified', 'low', 'medium', 'high', 'critical']} onChange={(value) => updateParam(params, setParams, 'riskLevel', value)} /><FilterSelect label="状态" value={status ?? ''} options={['pending', 'validating', 'classifying', 'evaluating', 'pending_approval', 'revision_required', 'approved', 'rejected', 'failed', 'cancelled']} onChange={(value) => updateParam(params, setParams, 'status', value)} /></div>
      {loading ? <LoadingPanel label="正在加载治理任务…" /> : error ? <ErrorPanel message={error} onRetry={load} /> : items.length === 0 ? <EmptyPanel label="暂无治理任务" /> : (
        <div className="space-y-3">
          {items.map((item) => {
            const systemError = item.status === 'failed';
            const businessBlock = item.status === 'revision_required';
            return <Card key={item.id}><CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">#{item.id} · {item.taskType}</span><Badge variant={systemError ? 'destructive' : businessBlock ? 'secondary' : 'outline'}>{taskStatusLabel(item.status)}</Badge><RiskBadge value={item.riskLevel as BrainGovernanceRiskLevel} /></div><div className="mt-1 text-sm text-muted-foreground">{item.resourceKey ?? '全局任务'} · {item.stage} · 尝试 {item.attemptCount}/{item.maxAttempts}</div>{systemError && <p className="mt-2 text-sm text-destructive">系统错误：{item.errorMessage ?? item.errorCode ?? '未知错误'}</p>}{businessBlock && <p className="mt-2 text-sm text-amber-700">业务阻塞：{String(item.result?.blockingReason ?? '证据或治理条件不完整')}</p>}</div>{canManage && ['failed', 'revision_required'].includes(item.status) && <Button variant="outline" onClick={() => void retry(item)}><RotateCcw />重试</Button>}</CardContent></Card>;
          })}
        </div>
      )}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await listBrainPolicySnapshots({ pageSize: 50, search, status: snapshotStatus })).items ?? []); setError(''); } catch (loadError) { if (!isBrainGovernanceReadCancelled(loadError)) setError(errorMessage(loadError)); } finally { setLoading(false); }
  }, [search, snapshotStatus]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    const releaseKey = window.prompt('策略快照标识，例如 governance-20260801-v1');
    if (!releaseKey?.trim()) return;
    try { await createBrainPolicySnapshot({ releaseKey, note: 'governance_ui' }); toast.success('策略快照草稿已创建'); await load(); } catch (saveError) { toast.error(errorMessage(saveError)); }
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
      <PageHeader title="策略快照" description="管理风险、治理模式和白名单策略；与运行 Release 完全分离。" action={canManage ? <Button onClick={() => void create()}><ShieldCheck />创建快照</Button> : undefined} />
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>生效边界：</strong>这里发布的是治理规则，不会自动激活 Skill、Semantic 或当前 Brain Runtime Release。</div>
      <div className="grid gap-2 sm:max-w-2xl sm:grid-cols-2"><FilterInput label="搜索快照" value={search ?? ''} onChange={(value) => updateParam(params, setParams, 'search', value)} /><FilterSelect label="状态" value={snapshotStatus ?? ''} options={['draft', 'active', 'archived', 'rolled_back']} onChange={(value) => updateParam(params, setParams, 'status', value)} /></div>
      {loading ? <LoadingPanel label="正在加载策略快照…" /> : error ? <ErrorPanel message={error} onRetry={load} /> : items.length === 0 ? <EmptyPanel label="暂无策略快照" /> : (
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

function CapabilityDetailSheet({ detail, onClose }: { detail: BrainCapabilityPolicyDetailResponse | null; onClose: () => void }) {
  return <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && onClose()}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{detail?.current.resourceKey ?? '能力详情'}</SheetTitle><SheetDescription>当前治理策略、证据和历史版本。</SheetDescription></SheetHeader>{detail && <div className="space-y-4 px-4 pb-6 text-sm"><div className="flex flex-wrap gap-2"><RiskBadge value={detail.current.policy.riskLevel} /><Badge variant="outline">{modeLabel(detail.current.policy.mode)}</Badge><RuntimeBadge value={detail.current.policy.runtimeEnforcementStatus} /></div><StatusRow label="准入状态" value={['high', 'critical'].includes(detail.current.policy.riskLevel) ? '禁止普通执行白名单' : whitelistLabel(detail.current.policy.whitelistStatus)} /><StatusRow label="权限范围" value={detail.current.policy.permissions.join('、') || '未登记'} /><StatusRow label="治理理由" value={detail.current.policy.reason || '未填写'} /><div><h3 className="font-medium">证据</h3><p className="mt-1 text-muted-foreground">{detail.evidence.length ? `${detail.evidence.length} 份有效或历史证据` : '暂无证据'}</p></div><div><h3 className="font-medium">版本历史</h3><div className="mt-2 space-y-2">{detail.history.map((version) => <div key={version.id} className="rounded-lg border p-3">v{version.version} · {version.status} · {new Date(version.createdAt).toLocaleString()}</div>)}</div></div></div>}</SheetContent></Sheet>;
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p>{BRAIN_GOVERNANCE_UI_MODE === 'shadow' && <Badge className="mt-2" variant="secondary">只读 Shadow</Badge>}</div>{action}</header>; }
function SummaryCard({ title, values }: { title: string; values: Record<string, number> }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-2">{Object.entries(values).map(([key, value]) => <StatusRow key={key} label={governanceLabel(key)} value={String(value)} />)}</CardContent></Card>; }
function StatusRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
function FilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="block text-sm"><span className="mb-1 block text-muted-foreground">{label}</span><select className="h-9 w-full rounded-lg border bg-background px-3" value={value} onChange={(event) => onChange(event.target.value)}><option value="">全部</option>{options.map((option) => <option key={option} value={option}>{governanceLabel(option)}</option>)}</select></label>; }
function LoadingPanel({ label }: { label: string }) { return <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"><Clock3 className="size-4 animate-pulse" />{label}</div>; }
function EmptyPanel({ label }: { label: string }) { return <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed text-muted-foreground">{label}</div>; }
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void | Promise<void> }) { return <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive"><AlertTriangle /><span>{message}</span><Button variant="outline" onClick={() => void onRetry()}>重试</Button></div>; }
function RiskBadge({ value }: { value: BrainGovernanceRiskLevel }) { const variant = value === 'critical' || value === 'high' ? 'destructive' : value === 'unclassified' ? 'secondary' : 'outline'; return <Badge variant={variant}>{governanceLabel(value)}风险</Badge>; }
function RuntimeBadge({ value }: { value: string }) { return <Badge variant={value === 'enforced' ? 'default' : value === 'shadow' ? 'secondary' : 'outline'}>{governanceLabel(value)}</Badge>; }
function ConsistencyBadge({ status }: { status: BrainGovernanceOverview['runtimeConsistency'] }) { return <Badge variant={status === 'aligned' ? 'default' : 'secondary'}>{status === 'aligned' ? '策略与运行一致' : status === 'policy_published_runtime_pending' ? '策略已发布，运行待接入' : '策略与运行存在漂移'}</Badge>; }
function updateParam(current: URLSearchParams, setParams: ReturnType<typeof useSearchParams>[1], key: string, value: string) { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); next.delete('page'); setParams(next); }
function duration(value: number | null) { return value === null ? '暂无数据' : value < 60_000 ? `${Math.round(value / 1000)} 秒` : `${Math.round(value / 60_000)} 分钟`; }
function percentage(value: number | null) { return value === null ? '暂无数据' : `${Math.round(value * 100)}%`; }
function modeLabel(value: string) { return governanceLabel(value); }
function whitelistLabel(value: string) { return governanceLabel(value); }
function releaseStatusLabel(value: string) { return governanceLabel(value); }
function taskStatusLabel(value: string) { return governanceLabel(value); }
function governanceLabel(value: string) { return ({ low: '低', medium: '中', high: '高', critical: '极高', unclassified: '待分类', readonly: '只读', preview: '预览', advisory: '建议', alert: '告警', not_allowed: '未准入', pending: '待处理', approved: '已准入', suspended: '已暂停', expired: '已过期', pending_runtime: '运行待接入', shadow: 'Shadow', enforced: '已接入', validating: '校验中', classifying: '分类中', evaluating: '评估中', pending_approval: '待审批', revision_required: '需修订', rejected: '已拒绝', failed: '失败', cancelled: '已取消', draft: '草稿', active: '已发布', archived: '已归档', rolled_back: '已回滚' } as Record<string, string>)[value] ?? value; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '请求失败，请稍后重试'; }
