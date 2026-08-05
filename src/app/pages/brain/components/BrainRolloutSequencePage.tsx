import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  isBrainGovernanceReadCancelled,
  listBrainGovernanceRolloutSequences,
  pauseBrainGovernanceRolloutSequence,
  promoteBrainGovernanceRolloutSequence,
  rollbackBrainGovernanceRolloutSequence,
  resumeBrainGovernanceRolloutSequence,
  validateBrainGovernanceRolloutSequence,
} from '@/api/brain';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { usePermission } from '@/hooks/usePermission';
import type { BrainGovernanceRolloutSequence } from '@/types/brain';
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
      const sequencePage = await listBrainGovernanceRolloutSequences({ page: 1, pageSize: 20 });
      if (sequence !== loadSequence.current) return;
      setSequences(sequencePage.items ?? []);
    } catch (loadError) {
      if (sequence === loadSequence.current && !isBrainGovernanceReadCancelled(loadError)) setError(message(loadError));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
    const reason = window.prompt('填写回滚原因；将恢复该 Candidate 开始前记录的运行版本');
    if (!reason?.trim()) return;
    await run(`rollback-${sequence.id}`, async () => { await rollbackBrainGovernanceRolloutSequence(sequence.id, reason); toast.success('已恢复 Candidate 开始前的运行版本'); });
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-xl font-semibold">运行版本（RT）</h2><p className="mt-1 text-sm text-muted-foreground">一个 Candidate 只生成一个 RT 编号，并展示一条 Shadow → Full 灰度时间线；治理策略（GP）已启用，不代表运行版本（RT）已生效。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/brain-governance/releases?tab=runtime&legacy=1')}>查看历史运行版本</Button><Button variant="outline" onClick={() => void load()}><RefreshCw />刷新</Button></div></div>
    <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between"><p><strong>唯一入口：</strong>新 GP 与 RT 必须在治理总览由同一 transition 组合创建和首次切换；本页只负责已进入观察期 RT 的校验、晋级、暂停和组合回滚。</p><Button variant="outline" onClick={() => navigate('/brain-governance/workbench?tab=overview')}>前往组合切换</Button></div>
    {currentSequences.length ? <div className="space-y-4">{currentSequences.map((sequence) => <SequenceCard key={sequence.id} sequence={sequence} health={observedHealth[sequence.id]} busy={busy !== null} canManage={canManage} canRelease={canRelease} onOpenTransition={() => navigate('/brain-governance/workbench?tab=overview')} onValidate={validate} onPromote={promote} onPause={pause} onResume={resume} onRollback={rollback} />)}</div> : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">暂无待处理的新运行序列。请先从治理总览创建 GP/RT 组合。</div>}
    {historicalSequences.length ? <details className="rounded-xl border bg-card"><summary className="cursor-pointer px-5 py-4 text-sm font-medium">历史灰度序列（{historicalSequences.length}）</summary><div className="space-y-4 border-t p-4">{historicalSequences.map((sequence) => <SequenceCard key={sequence.id} sequence={sequence} health={observedHealth[sequence.id]} busy historical canManage={false} canRelease={false} onOpenTransition={() => navigate('/brain-governance/workbench?tab=overview')} onValidate={validate} onPromote={promote} onPause={pause} onResume={resume} onRollback={rollback} />)}</div></details> : null}
  </section>;
}

function SequenceCard({
  sequence,
  health,
  busy,
  canManage,
  canRelease,
  onOpenTransition,
  historical = false,
  onValidate,
  onPromote,
  onPause,
  onResume,
  onRollback,
}: {
  sequence: BrainGovernanceRolloutSequence;
  health?: ObservedHealth;
  busy: boolean;
  canManage: boolean;
  canRelease: boolean;
  onOpenTransition: () => void;
  historical?: boolean;
  onValidate: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onPromote: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onPause: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onResume: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
  onRollback: (sequence: BrainGovernanceRolloutSequence) => Promise<void>;
}) {
  return <Card>
    <CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="break-all text-base">{sequenceIdentityLabel(sequence)}</CardTitle><p className="mt-1 text-xs text-muted-foreground">治理策略：{identityLabel(sequence.policySnapshot?.productIdentity, sequence.policySnapshot?.displayCode ?? (sequence.policySnapshot?.id ? `LEGACY-GP-${sequence.policySnapshot.id}` : sequence.policySnapshot?.releaseKey ?? '历史治理策略'), sequence.policySnapshot?.displayName)}</p>{sequence.previousRuntimeRelease ? <p className="mt-1 text-xs text-muted-foreground">回滚备用：LEGACY-RT-{sequence.previousRuntimeRelease.id} · 不接收当前组合正常流量</p> : null}<details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">审计信息</summary><p className="mt-1 break-all">序列数据库记录 #{sequence.id} · {sequence.sequenceKey} · Candidate {sequence.candidate?.candidateKey}</p></details></div><Badge variant={sequence.status === 'active' ? 'default' : 'outline'}>{sequenceLifecycleLabel(sequence)}</Badge></div></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-5 gap-1">{stages.map(([key, label]) => {
        const release = sequence.releases.find((item) => item.rolloutStage === key);
        const current = sequence.currentStage === key;
        return <div key={key} className={`rounded-md border-t-4 p-2 text-center ${current ? 'border-primary bg-primary/5' : 'border-border'}`}><div className="text-sm font-medium">{release?.productIdentity?.stageCode ?? label}</div><div className="mt-1 text-xs text-muted-foreground">{release?.status ?? '未生成'}</div>{release?.releaseReadiness && <div className="mt-1 text-[11px]">{release.releaseReadiness.canRelease ? '证据就绪' : '已阻塞'}</div>}</div>;
      })}</div>
      <div className="rounded-lg bg-muted/50 p-3 text-sm"><strong>当前阶段：</strong>{stages.find(([key]) => key === sequence.currentStage)?.[1] ?? sequence.currentStage}{sequence.pauseReason ? ` · ${sequence.pauseReason}` : ''}</div>
      {health ? <HealthObservation health={health} /> : sequence.status === 'active' && sequence.currentStage !== 'full' ? <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">点击“校验当前阶段”从服务端 Run、Trace 和反馈计算真实观察指标；页面不再允许手工填写健康数据。</div> : null}
      {!historical ? <div className="flex flex-wrap gap-2">{canManage ? <Button variant="outline" disabled={busy} onClick={() => void onValidate(sequence)}><ShieldCheck />校验当前阶段</Button> : null}{sequence.status === 'draft' && sequence.currentStage === 'shadow' ? <Button variant="outline" onClick={onOpenTransition} disabled={busy}>返回组合切换激活 Shadow</Button> : null}{canRelease && sequence.status === 'active' && sequence.currentStage !== 'full' ? <Button disabled={busy} onClick={() => void onPromote(sequence)}><Play />按真实观察晋级</Button> : null}{canRelease && sequence.status === 'active' ? <Button variant="outline" disabled={busy} onClick={() => void onPause(sequence)}><Pause />暂停</Button> : null}{canRelease && sequence.status === 'paused' ? <Button variant="outline" disabled={busy} onClick={() => void onResume(sequence)}><Play />恢复</Button> : null}{canRelease && ['active', 'paused'].includes(sequence.status) && sequence.releases.some((item) => item.rolloutStage === sequence.currentStage && item.status === 'active') ? <Button variant="destructive" disabled={busy} onClick={() => void onRollback(sequence)}><RotateCcw />组合回滚</Button> : null}</div> : <p className="text-xs text-muted-foreground">历史序列仅供审计，不进入当前审批队列。</p>}
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
function identityLabel(identity: BrainGovernanceRolloutSequence['productIdentity'] | undefined | null, fallbackCode: string, fallbackName?: string | null) { const code = identity?.code ?? fallbackCode; const name = identity?.name ?? fallbackName; return name && name !== code ? `${code} · ${name}` : code; }
function sequenceIdentityLabel(sequence: BrainGovernanceRolloutSequence) {
  const release = sequence.releases.find((item) => item.rolloutStage === sequence.currentStage) ?? sequence.releases[0];
  const fallbackCode = sequence.runtimeVersionCode ?? (release ? `LEGACY-RT-${release.id}` : 'RT 编号待分配');
  return identityLabel(sequence.productIdentity, fallbackCode, sequence.displayName ?? (release ? null : '运行版本待分配'));
}

function sequenceLifecycleLabel(sequence: BrainGovernanceRolloutSequence) {
  if (sequence.candidate?.status === 'superseded') return '已被取代';
  return ({ draft: '待组合切换', active: '观察中', paused: '已暂停', completed: 'Full 已完成', rolled_back: '已组合回滚', failed: '切换失败' } as Record<string, string>)[sequence.status] ?? sequence.status;
}
