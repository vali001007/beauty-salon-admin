import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  activateBrainGovernanceRolloutSequenceShadow,
  createBrainGovernanceRolloutSequence,
  isBrainGovernanceReadCancelled,
  listBrainGovernanceCandidates,
  listBrainGovernanceRolloutSequences,
  listBrainResourceVersions,
  pauseBrainGovernanceRolloutSequence,
  promoteBrainGovernanceRolloutSequence,
  rollbackBrainGovernanceRolloutSequence,
  resumeBrainGovernanceRolloutSequence,
  validateBrainGovernanceRolloutSequence,
} from '@/api/brain';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { usePermission } from '@/hooks/usePermission';
import type { BrainGovernanceCandidate, BrainGovernanceResourceVersion, BrainGovernanceRolloutSequence } from '@/types/brain';
import { BRAIN_GOVERNANCE_UI_MODE } from '../brainGovernanceNavigation';

const stages = [
  ['shadow', 'Shadow'],
  ['canary_5', '5%'],
  ['canary_20', '20%'],
  ['canary_50', '50%'],
  ['full', '100%'],
] as const;

interface ObservedHealth {
  status: 'ready' | 'blocked';
  sampleSize: number;
  minimumSampleSize: number;
  elapsedMinutes: number;
  observationMinutes: number;
  metrics: { errorRate: number | null; timeoutRate: number | null; permissionViolationCount: number; negativeFeedbackRate: number };
  blockers: string[];
}

export function BrainRolloutSequencePage() {
  const navigate = useNavigate();
  const canManage = usePermission('core:brain-governance:manage') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const canRelease = usePermission('core:brain-governance:release') && BRAIN_GOVERNANCE_UI_MODE === 'manage';
  const [sequences, setSequences] = useState<BrainGovernanceRolloutSequence[]>([]);
  const [candidates, setCandidates] = useState<BrainGovernanceCandidate[]>([]);
  const [versions, setVersions] = useState<BrainGovernanceResourceVersion[]>([]);
  const [candidateKey, setCandidateKey] = useState('');
  const [releaseKey, setReleaseKey] = useState('');
  const [selectedVersions, setSelectedVersions] = useState<number[]>([]);
  const [observedHealth, setObservedHealth] = useState<Record<number, ObservedHealth>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const [sequencePage, candidatePage, versionPage] = await Promise.all([
        listBrainGovernanceRolloutSequences({ page: 1, pageSize: 20 }),
        listBrainGovernanceCandidates({ page: 1, pageSize: 50 }),
        listBrainResourceVersions({ status: 'draft', includeSnapshot: false, take: 100 }),
      ]);
      if (sequence !== loadSequence.current) return;
      setSequences(sequencePage.items ?? []);
      setCandidates((candidatePage.items ?? []).filter((item) => item.status === 'ready'));
      setVersions((versionPage.items ?? []).filter((item) => item.resourceType !== 'capability_change_request' && item.resourceType !== 'capability_policy'));
    } catch (loadError) {
      if (sequence === loadSequence.current && !isBrainGovernanceReadCancelled(loadError)) setError(message(loadError));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!candidateKey || !releaseKey.trim() || !selectedVersions.length) {
      toast.error('请选择 Candidate、填写发布标识并选择运行资源版本');
      return;
    }
    await run('create', async () => {
      await createBrainGovernanceRolloutSequence({ candidateKey, releaseKey: releaseKey.trim(), resourceVersionIds: selectedVersions, governanceMode: 'shadow' });
      toast.success('已创建单一灰度序列，当前 Runtime 尚未改变');
      setReleaseKey('');
      setSelectedVersions([]);
    });
  }

  async function validate(sequence: BrainGovernanceRolloutSequence) {
    await run(`validate-${sequence.id}`, async () => {
      const result = await validateBrainGovernanceRolloutSequence(sequence.id) as { canActivate?: boolean; canPromote?: boolean; blockers?: string[]; observedHealth?: ObservedHealth | null };
      if (result.observedHealth) setObservedHealth((current) => ({ ...current, [sequence.id]: result.observedHealth! }));
      if (sequence.status === 'active') {
        result.canPromote ? toast.success('真实观察指标满足晋级条件') : toast.error(`当前不可晋级：${result.observedHealth?.blockers.join('、') || '观察证据不完整'}`);
      } else {
        result.canActivate ? toast.success('当前阶段校验通过') : toast.error(`当前不可激活：${result.blockers?.join('、') || '证据不完整'}`);
      }
    }, false);
  }

  async function activateShadow(sequence: BrainGovernanceRolloutSequence) {
    if (!window.confirm('校验并激活 Shadow？该操作不会直接切换 Enforced。')) return;
    await run(`activate-${sequence.id}`, async () => {
      await activateBrainGovernanceRolloutSequenceShadow(sequence.id);
      toast.success('Shadow 已激活，开始观察');
    });
  }

  async function promote(sequence: BrainGovernanceRolloutSequence) {
    await run(`promote-${sequence.id}`, async () => {
      await promoteBrainGovernanceRolloutSequence(sequence.id);
      toast.success('已晋级到下一灰度阶段');
    });
  }

  async function pause(sequence: BrainGovernanceRolloutSequence) {
    const reason = window.prompt('填写暂停原因');
    if (!reason?.trim()) return;
    await run(`pause-${sequence.id}`, async () => { await pauseBrainGovernanceRolloutSequence(sequence.id, reason); toast.success('灰度序列已暂停'); });
  }

  async function resume(sequence: BrainGovernanceRolloutSequence) {
    await run(`resume-${sequence.id}`, async () => { await resumeBrainGovernanceRolloutSequence(sequence.id); toast.success('灰度序列已恢复'); });
  }

  async function rollback(sequence: BrainGovernanceRolloutSequence) {
    const reason = window.prompt('填写回滚原因；将恢复该 Candidate 开始前记录的 Runtime Release');
    if (!reason?.trim()) return;
    await run(`rollback-${sequence.id}`, async () => { await rollbackBrainGovernanceRolloutSequence(sequence.id, reason); toast.success('已恢复 Candidate 开始前的 Runtime Release'); });
  }

  async function run(key: string, action: () => Promise<void>, reload = true) {
    setBusy(key);
    try { await action(); if (reload) await load(); } catch (actionError) { toast.error(message(actionError)); } finally { setBusy(null); }
  }

  const currentSequences = sequences.filter((sequence) => (
    ['draft', 'active', 'paused'].includes(sequence.status)
    && sequence.candidate?.status !== 'superseded'
  ));
  const historicalSequences = sequences.filter((sequence) => !currentSequences.includes(sequence));

  if (loading) return <div className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在加载灰度序列…</div>;
  if (error) return <div className="rounded-xl border border-destructive/30 p-5 text-destructive">{error}<Button className="ml-3" variant="outline" onClick={() => void load()}>重试</Button></div>;

  return <section className="space-y-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-xl font-semibold">运行发布</h2><p className="mt-1 text-sm text-muted-foreground">一个 Candidate 只展示一条 Shadow → 100% 灰度时间线，治理策略已发布不等于 Runtime 已生效。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/brain-governance/releases?tab=runtime&legacy=1')}>查看历史发布</Button><Button variant="outline" onClick={() => void load()}><RefreshCw />刷新</Button></div></div>
    {canManage ? <Card><CardHeader><CardTitle className="text-base">为 Candidate 准备灰度序列</CardTitle></CardHeader><CardContent className="grid gap-4 lg:grid-cols-3"><label className="text-sm"><span className="mb-1 block text-muted-foreground">Candidate</span><select className="h-10 w-full rounded-md border bg-background px-3" value={candidateKey} onChange={(event) => setCandidateKey(event.target.value)}><option value="">请选择</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.candidateKey}>{candidate.branch ?? candidate.candidateKey} · {candidate.headCommit.slice(0, 8)}</option>)}</select></label><label className="text-sm"><span className="mb-1 block text-muted-foreground">发布标识</span><Input value={releaseKey} onChange={(event) => setReleaseKey(event.target.value)} placeholder="brain-candidate-xxx" /></label><div className="lg:row-span-2"><span className="text-sm text-muted-foreground">运行资源版本</span><div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2">{versions.length ? versions.map((version) => <label key={version.id} className="flex gap-2 py-1 text-sm"><input type="checkbox" checked={selectedVersions.includes(version.id)} onChange={(event) => setSelectedVersions((current) => event.target.checked ? [...current, version.id] : current.filter((id) => id !== version.id))} />{version.resourceKey} v{version.version}</label>) : <p className="text-sm text-muted-foreground">暂无可发布草稿</p>}</div></div><div className="lg:col-span-2"><Button disabled={busy !== null} onClick={() => void create()}><ShieldCheck />创建序列（不激活）</Button></div></CardContent></Card> : null}
    {currentSequences.length ? <div className="space-y-4">{currentSequences.map((sequence) => <SequenceCard key={sequence.id} sequence={sequence} health={observedHealth[sequence.id]} busy={busy !== null} canRelease={canRelease} onValidate={validate} onActivateShadow={activateShadow} onPromote={promote} onPause={pause} onResume={resume} onRollback={rollback} />)}</div> : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">暂无待处理的新版 Rollout Sequence。当前 active Runtime 不会被本页自动修改。</div>}
    {historicalSequences.length ? <details className="rounded-xl border bg-card"><summary className="cursor-pointer px-5 py-4 text-sm font-medium">历史灰度序列（{historicalSequences.length}）</summary><div className="space-y-4 border-t p-4">{historicalSequences.map((sequence) => <SequenceCard key={sequence.id} sequence={sequence} health={observedHealth[sequence.id]} busy historical canRelease={false} onValidate={validate} onActivateShadow={activateShadow} onPromote={promote} onPause={pause} onResume={resume} onRollback={rollback} />)}</div></details> : null}
  </section>;
}

function SequenceCard({
  sequence,
  health,
  busy,
  canRelease,
  historical = false,
  onValidate,
  onActivateShadow,
  onPromote,
  onPause,
  onResume,
  onRollback,
}: {
  sequence: BrainGovernanceRolloutSequence;
  health?: ObservedHealth;
  busy: boolean;
  canRelease: boolean;
  historical?: boolean;
  onValidate: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onActivateShadow: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onPromote: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onPause: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onResume: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onRollback: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
}) {
  return <Card>
    <CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="break-all text-base">{sequence.sequenceKey}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{sequence.candidate?.candidateKey} · 策略 {sequence.policySnapshot?.releaseKey}</p></div><Badge variant={sequence.status === 'active' ? 'default' : 'outline'}>{sequence.status}</Badge></div></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-5 gap-1">{stages.map(([key, label]) => {
        const release = sequence.releases.find((item) => item.rolloutStage === key);
        const current = sequence.currentStage === key;
        return <div key={key} className={`rounded-md border-t-4 p-2 text-center ${current ? 'border-primary bg-primary/5' : 'border-border'}`}><div className="text-sm font-medium">{label}</div><div className="mt-1 text-xs text-muted-foreground">{release?.status ?? '未生成'}</div>{release?.releaseReadiness && <div className="mt-1 text-[11px]">{release.releaseReadiness.canRelease ? '证据就绪' : '已阻塞'}</div>}</div>;
      })}</div>
      <div className="rounded-lg bg-muted/50 p-3 text-sm"><strong>当前阶段：</strong>{stages.find(([key]) => key === sequence.currentStage)?.[1] ?? sequence.currentStage}{sequence.pauseReason ? ` · ${sequence.pauseReason}` : ''}</div>
      {health ? <HealthObservation health={health} /> : sequence.status === 'active' && sequence.currentStage !== 'full' ? <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">点击“校验当前阶段”从服务端 Run、Trace 和反馈计算真实观察指标；页面不再允许手工填写健康数据。</div> : null}
      {!historical ? <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void onValidate(sequence)}><ShieldCheck />校验当前阶段</Button>{canRelease && sequence.status === 'draft' && sequence.currentStage === 'shadow' ? <Button disabled={busy} onClick={() => void onActivateShadow(sequence)}><Play />校验并激活 Shadow</Button> : null}{canRelease && sequence.status === 'active' && sequence.currentStage !== 'full' ? <Button disabled={busy} onClick={() => void onPromote(sequence)}><Play />按真实观察晋级</Button> : null}{canRelease && ['draft', 'active'].includes(sequence.status) ? <Button variant="outline" disabled={busy} onClick={() => void onPause(sequence)}><Pause />暂停</Button> : null}{canRelease && sequence.status === 'paused' ? <Button variant="outline" disabled={busy} onClick={() => void onResume(sequence)}><Play />恢复</Button> : null}{canRelease && ['active', 'paused'].includes(sequence.status) && sequence.releases.some((item) => item.rolloutStage === sequence.currentStage && item.status === 'active') ? <Button variant="destructive" disabled={busy} onClick={() => void onRollback(sequence)}><RotateCcw />回滚</Button> : null}</div> : <p className="text-xs text-muted-foreground">历史序列仅供审计，不进入当前审批队列。</p>}
    </CardContent>
  </Card>;
}

function HealthObservation({ health }: { health: ObservedHealth }) {
  const percent = (value: number | null) => value === null ? '暂无数据' : `${(value * 100).toFixed(2)}%`;
  return <div className={`rounded-lg border p-3 text-sm ${health.status === 'ready' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
    <div className="font-medium">服务端真实观察：{health.status === 'ready' ? '满足晋级条件' : '暂不可晋级'}</div>
    <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5"><span>样本 {health.sampleSize}/{health.minimumSampleSize}</span><span>观察 {health.elapsedMinutes}/{health.observationMinutes} 分钟</span><span>错误率 {percent(health.metrics.errorRate)}</span><span>超时率 {percent(health.metrics.timeoutRate)}</span><span>权限异常 {health.metrics.permissionViolationCount}</span></div>
    {health.blockers.length ? <div className="mt-2 text-xs text-muted-foreground">阻断：{health.blockers.join('、')}</div> : null}
  </div>;
}

function message(error: unknown) { return error instanceof Error ? error.message : '请求失败，请稍后重试'; }
