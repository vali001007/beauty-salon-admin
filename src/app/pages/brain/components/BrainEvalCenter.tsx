import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Play, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createBrainEvalRun, getBrainEvalRun, listBrainEvalRuns } from '@/api/brain';

interface EvalSummary {
  gateMode?: string;
  canRelease?: boolean;
  providerUnavailable?: number;
  sourceEvalRunId?: number;
  regression?: {
    selected?: number;
    resolved?: number;
    unresolved?: number;
    providerUnavailable?: number;
    passed?: boolean;
  };
}

interface EvalRun {
  id: number;
  releaseId?: number | null;
  roleKey?: string | null;
  status: string;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  summary?: EvalSummary;
  createdAt: string;
}

interface EvalResult {
  id: number;
  caseKey: string;
  question: string;
  answer: string;
  deterministicPassed: boolean;
  failureCluster?: string | null;
  latencyMs?: number | null;
}

interface EvalRunDetail extends EvalRun {
  evalResults?: EvalResult[];
}

function itemsFrom(response: unknown) {
  const items = response && typeof response === 'object' ? (response as { items?: unknown }).items : undefined;
  return Array.isArray(items) ? (items as EvalRun[]) : [];
}

function statusLabel(status: string) {
  return (
    ({ queued: '排队中', running: '运行中', completed: '已完成', failed: '运行失败' } as Record<string, string>)[
      status
    ] ?? status
  );
}

function gateLabel(summary?: EvalSummary) {
  if (summary?.gateMode === 'release_regression') return `失败题回归 #${summary.sourceEvalRunId ?? '-'}`;
  if (summary?.gateMode === 'release_gate') return '完整发布门禁';
  if (summary?.gateMode === 'development_sample') return '开发定向评测';
  return '通用评测';
}

export function BrainEvalCenter() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [rerunningId, setRerunningId] = useState<number | null>(null);
  const [releaseId, setReleaseId] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [detail, setDetail] = useState<EvalRunDetail | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      setRuns(itemsFrom(await listBrainEvalRuns()));
    } catch (error) {
      if (showLoading) toast.error(error instanceof Error ? error.message : '评测列表加载失败');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const hasActiveRun = runs.some((run) => run.status === 'queued' || run.status === 'running');
  useEffect(() => {
    if (!hasActiveRun) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveRun, load]);

  const latest = runs[0];
  const latestPassRate = latest?.caseCount ? Math.round((latest.passedCount / latest.caseCount) * 1000) / 10 : 0;
  const latestRegression = latest?.summary?.regression;
  const failedResults = useMemo(
    () => (detail?.evalResults ?? []).filter((item) => !item.deterministicPassed),
    [detail],
  );

  async function start() {
    setStarting(true);
    try {
      await createBrainEvalRun({
        releaseId: releaseId ? Number(releaseId) : undefined,
        roleKey: roleKey || undefined,
        modelVersion: 'ami-brain-governed',
      });
      toast.success('评测已进入异步队列');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '评测启动失败');
    } finally {
      setStarting(false);
    }
  }

  async function rerunFailures(run: EvalRun) {
    setRerunningId(run.id);
    try {
      await createBrainEvalRun({ sourceEvalRunId: run.id, modelVersion: 'ami-brain-governed' });
      toast.success(`已创建 #${run.id} 的失败题回归`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '失败题回归启动失败');
    } finally {
      setRerunningId(null);
    }
  }

  async function openDetail(id: number) {
    try {
      setDetail((await getBrainEvalRun(id)) as unknown as EvalRunDetail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '评测详情加载失败');
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold">评测中心</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            发布门禁与失败题回归分开运行；供应商失败不计为产品缺陷，但会阻断发布。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            发布 ID
            <input
              value={releaseId}
              onChange={(event) => setReleaseId(event.target.value)}
              className="mt-1 block h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            角色
            <input
              value={roleKey}
              onChange={(event) => setRoleKey(event.target.value)}
              placeholder="全部"
              className="mt-1 block h-9 w-36 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
            onClick={() => void start()}
            disabled={starting}
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}发起评测
          </button>
          <button
            type="button"
            title="刷新"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border"
            onClick={() => void load()}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
        <Metric
          label="最新运行"
          value={latest ? `#${latest.id}` : '-'}
          hint={latest ? gateLabel(latest.summary) : '暂无运行'}
        />
        <Metric
          label="通过率"
          value={latest ? `${latestPassRate}%` : '-'}
          hint={latest ? `${latest.passedCount}/${latest.caseCount}` : '暂无结果'}
        />
        <Metric label="失败题" value={latest ? String(latest.failedCount) : '-'} hint="可单独发起回归" />
        <Metric
          label="回归状态"
          value={latestRegression ? (latestRegression.passed ? '已通过' : '未通过') : '-'}
          hint={
            latestRegression
              ? `修复 ${latestRegression.resolved ?? 0}/${latestRegression.selected ?? 0}`
              : '尚未运行失败题回归'
          }
        />
      </div>

      <div className="mt-4 overflow-x-auto border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">运行</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">通过</th>
              <th className="px-3 py-2">失败</th>
              <th className="px-3 py-2">发布/角色</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {runs.length ? (
              runs.map((run) => (
                <tr key={run.id} className="border-t border-border">
                  <td className="px-3 py-3">
                    #{run.id}
                    <div className="text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">{gateLabel(run.summary)}</td>
                  <td className="px-3 py-3">{statusLabel(run.status)}</td>
                  <td className="px-3 py-3">
                    {run.passedCount}/{run.caseCount}
                  </td>
                  <td className="px-3 py-3">{run.failedCount}</td>
                  <td className="px-3 py-3 text-xs">
                    Release #{run.releaseId ?? '-'}
                    <br />
                    {run.roleKey ?? '全部角色'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="h-8 rounded-md border border-border px-3 text-xs"
                        onClick={() => void openDetail(run.id)}
                      >
                        逐题结果
                      </button>
                      {run.status === 'completed' && run.failedCount > 0 ? (
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs disabled:opacity-60"
                          disabled={rerunningId === run.id}
                          onClick={() => void rerunFailures(run)}
                        >
                          {rerunningId === run.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          复测失败
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {loading ? '加载中' : '暂无评测运行'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">运行 #{detail.id} 逐题结果</h3>
            <span className="text-xs text-muted-foreground">
              失败 {failedResults.length} / 共 {detail.evalResults?.length ?? 0}
            </span>
          </div>
          <div className="mt-3 max-h-[520px] overflow-auto border border-border">
            <table className="w-full min-w-[840px] text-left text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2">结果</th>
                  <th className="px-3 py-2">题目</th>
                  <th className="px-3 py-2">回答/失败原因</th>
                  <th className="px-3 py-2">耗时</th>
                </tr>
              </thead>
              <tbody>
                {detail.evalResults?.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-3 py-3">
                      {item.deterministicPassed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="通过" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" aria-label="失败" />
                      )}
                    </td>
                    <td className="max-w-[280px] px-3 py-3">
                      <div className="font-medium">{item.question}</div>
                      <div className="mt-1 text-muted-foreground">{item.caseKey}</div>
                    </td>
                    <td className="max-w-[460px] whitespace-pre-wrap px-3 py-3">
                      {item.answer || item.failureCluster || '无回答'}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{item.latencyMs ?? '-'} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-h-24 bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
