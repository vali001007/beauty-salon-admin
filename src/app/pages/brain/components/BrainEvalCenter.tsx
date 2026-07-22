import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { Bug, ChevronLeft, ChevronRight, Database, FileText, History, Loader2, Play, RefreshCw, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  createBrainEvalRun,
  getBrainEvalQuestionCatalogDetail,
  getBrainFullDomainEvalCatalogDetail,
  getBrainEvalRun,
  isBrainGovernanceReadCancelled,
  listBrainEvalSuites,
  listBrainFullDomainEvalCatalog,
  listBrainEvalQuestionCatalog,
  listBrainEvalRuns,
} from '@/api/brain';
import type { BrainEvalCatalogDetail, BrainEvalCatalogItem, BrainEvalCatalogResponse, BrainEvalSuite, BrainFullDomainEvalCatalogResponse } from '@/types/brain';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';

interface EvalRun {
  id: number;
  releaseId?: number | null;
  roleKey?: string | null;
  status: string;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  createdAt: string;
}

type CatalogDetailMode = 'semantic' | 'result';

const EMPTY_CATALOG: BrainEvalCatalogResponse = {
  metadata: null,
  types: [],
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
};

export function BrainEvalCenter() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<BrainEvalCatalogResponse>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [questionType, setQuestionType] = useState('');
  const [status, setStatus] = useState<'passed' | 'failed' | 'unavailable' | ''>('');
  const [suites, setSuites] = useState<BrainEvalSuite[]>([]);
  const [selectedSuiteRunId, setSelectedSuiteRunId] = useState('baseline');
  const [fullCatalog, setFullCatalog] = useState<BrainFullDomainEvalCatalogResponse | null>(null);
  const [domain, setDomain] = useState('');
  const [role, setRole] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [judge, setJudge] = useState<'pass' | 'fail' | 'insufficient_evidence' | ''>('');
  const [showRuns, setShowRuns] = useState(false);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [releaseId, setReleaseId] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [runDetail, setRunDetail] = useState<Record<string, unknown> | null>(null);
  const [catalogDetailRequest, setCatalogDetailRequest] = useState<{ mode: CatalogDetailMode; item: BrainEvalCatalogItem } | null>(null);
  const [catalogDetail, setCatalogDetail] = useState<BrainEvalCatalogDetail | null>(null);
  const [catalogDetailLoading, setCatalogDetailLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedSuiteRunId === 'baseline') {
        const response = await listBrainEvalQuestionCatalog({ page, pageSize: 50, search: deferredSearch.trim() || undefined, questionType: questionType || undefined, status: status || undefined });
        setCatalog(response); setFullCatalog(null);
      } else {
        const response = await listBrainFullDomainEvalCatalog(Number(selectedSuiteRunId), {
          page, pageSize: 50, search: deferredSearch.trim() || undefined, type: questionType || undefined, domain: domain || undefined, role: role || undefined, difficulty: difficulty || undefined,
          deterministic: status === 'passed' || status === 'failed' ? status : undefined, judge: judge || undefined,
        });
        setFullCatalog(response);
        setCatalog({ metadata: { generatedAt: String(response.run.finishedAt ?? response.run.createdAt ?? ''), sourceGeneratedAt: null, releaseId: null, storeId: null, total: response.total, passed: Number(response.run.passed ?? 0), failed: Number(response.run.failed ?? 0), unavailable: Number(response.run.providerUnavailable ?? 0), passRate: typeof response.run.deterministicPassRate === 'number' ? response.run.deterministicPassRate : null, averageHitRate: null, sourceQuestionFile: 'Ami-Brain-全领域实测问题集-2000.csv', sourceResultFile: `BrainEvalRun#${selectedSuiteRunId}` }, types: response.filters.types.map((value) => ({ value, count: 0 })), items: response.items.map((item) => ({ questionId: item.questionId, question: item.question, questionType: item.questionType, intentType: item.domain, persona: item.role, passed: item.deterministicPassed, status: item.deterministicPassed ? 'passed' : 'failed', hitRate: null, runId: Number(selectedSuiteRunId), failureReason: item.failureCluster, diagnosis: item.diagnosis, improvementSuggestion: `${item.improvementSuggestion}${item.judgeReason ? ` Judge：${item.judgeReason}` : ''}`, averageLatencyMs: item.latencyMs })), total: response.total, page: response.page, pageSize: response.pageSize });
      }
    } catch (error) {
      if (!isBrainGovernanceReadCancelled(error)) {
        toast.error(error instanceof Error ? error.message : '650 题评测目录加载失败');
      }
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, page, questionType, status, selectedSuiteRunId, domain, role, difficulty, judge]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => { void listBrainEvalSuites().then((response) => setSuites(response.items)).catch(() => undefined); }, []);

  async function loadRuns() {
    setRunsLoading(true);
    try {
      const response = await listBrainEvalRuns() as { items?: EvalRun[] };
      setRuns(Array.isArray(response.items) ? response.items : []);
    } catch (error) {
      if (!isBrainGovernanceReadCancelled(error)) {
        toast.error(error instanceof Error ? error.message : '评测运行记录加载失败');
      }
    } finally {
      setRunsLoading(false);
    }
  }

  async function openRuns() {
    setShowRuns(true);
    setRunDetail(null);
    await loadRuns();
  }

  async function startRun() {
    setStarting(true);
    try {
      await createBrainEvalRun({
        releaseId: releaseId ? Number(releaseId) : undefined,
        roleKey: roleKey || undefined,
        modelVersion: 'ami-brain-governed',
      });
      toast.success('当前治理用例评测已进入异步队列');
      await loadRuns();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '评测启动失败');
    } finally {
      setStarting(false);
    }
  }

  async function openRunDetail(id: number) {
    try {
      setRunDetail(await getBrainEvalRun(id) as unknown as Record<string, unknown>);
    } catch (error) {
      if (!isBrainGovernanceReadCancelled(error)) {
        toast.error(error instanceof Error ? error.message : '评测详情加载失败');
      }
    }
  }

  function debugQuestion(item: BrainEvalCatalogItem) {
    navigate(
      `/brain?question=${encodeURIComponent(item.question)}&debugEvalCase=${encodeURIComponent(item.questionId)}`,
    );
  }

  async function openCatalogDetail(item: BrainEvalCatalogItem, mode: CatalogDetailMode) {
    setCatalogDetailRequest({ item, mode });
    setCatalogDetail(null);
    setCatalogDetailLoading(true);
    try {
      if (selectedSuiteRunId === 'baseline') {
        setCatalogDetail(await getBrainEvalQuestionCatalogDetail(item.questionId));
      } else {
        const detail = await getBrainFullDomainEvalCatalogDetail(Number(selectedSuiteRunId), item.questionId);
        setCatalogDetail({ questionId: detail.questionId, question: detail.question, questionType: detail.questionType, intentType: detail.domain, persona: detail.role, passed: detail.deterministicPassed, status: detail.deterministicPassed ? 'passed' : 'failed', hitRate: null, runId: Number(selectedSuiteRunId), failureReason: detail.failureCluster, diagnosis: detail.diagnosis, improvementSuggestion: detail.improvementSuggestion, semanticKeys: [detail.expectedTarget], dataTables: [], testHistory: [{ releaseId: null, generatedAt: null, runId: Number(selectedSuiteRunId), status: detail.judgeVerdict, brainStatus: null, passed: detail.deterministicPassed, latencyMs: detail.latencyMs, answer: detail.answer ?? '', graderReason: detail.judgeReason, expectedIntent: detail.domain, actualIntent: null, expectedShape: detail.questionType, actualShape: null, capabilityKeys: [], citations: [], layers: [] }] });
      }
    } catch (error) {
      if (!isBrainGovernanceReadCancelled(error)) {
        toast.error(error instanceof Error ? error.message : '评测问题详情加载失败');
      }
    } finally {
      setCatalogDetailLoading(false);
    }
  }

  const metadata = catalog.metadata;
  const pageCount = Math.max(1, Math.ceil(catalog.total / catalog.pageSize));

  return (
    <section className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold">{selectedSuiteRunId === 'baseline' ? '650 题 Release #362 基线' : '全领域实测 2000'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            基线与全领域扩展套件分开保存；确定性门禁失败不能被 Judge 覆盖。
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted" onClick={() => void openRuns()}>
            <History className="h-4 w-4" />运行记录
          </button>
          <button type="button" title="刷新" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm disabled:opacity-60" onClick={() => void loadCatalog()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </button>
        </div>
      </header>

      <div className="grid gap-3 py-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="问题总数" value={metadata ? String(metadata.total) : '-'} hint="固定题库" />
        <SummaryCard label="通过" value={metadata ? String(metadata.passed) : '-'} hint={formatPercent(metadata?.passRate)} tone="success" />
        <SummaryCard label="失败" value={metadata ? String(metadata.failed) : '-'} hint="确定性门禁未通过" tone="danger" />
        <SummaryCard label="基础设施异常" value={metadata ? String(metadata.unavailable) : '-'} hint="不进入通过率分母" tone="warning" />
        <SummaryCard label="平均命中率" value={formatPercent(metadata?.averageHitRate)} hint="意图 + 能力" />
      </div>

      <div className="flex flex-wrap gap-3 border-y border-border py-3">
        <select value={selectedSuiteRunId} onChange={(event) => { setPage(1); setSelectedSuiteRunId(event.target.value); setDomain(''); setRole(''); setDifficulty(''); setJudge(''); }} className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm">
          <option value="baseline">650 题 Release #362 基线</option>
          {suites.filter((suite) => suite.id != null).map((suite) => <option key={suite.id} value={String(suite.id)}>{suite.suiteLabel} · {suite.stage} · #{suite.id}</option>)}
        </select>
        <label className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => { setPage(1); setSearch(event.target.value); }}
            placeholder="搜索问题 ID、内容、诊断、语义或库表"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <select value={questionType} onChange={(event) => { setPage(1); setQuestionType(event.target.value); }} className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">全部问题类型</option>
          {catalog.types.map((item) => <option key={item.value} value={item.value}>{item.value}（{item.count}）</option>)}
        </select>
        <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as typeof status); }} className="h-9 min-w-36 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">全部结果</option>
          <option value="passed">通过</option>
          <option value="failed">失败</option>
          <option value="unavailable">基础设施异常</option>
        </select>
        {selectedSuiteRunId !== 'baseline' && <>
          <select value={domain} onChange={(event) => { setPage(1); setDomain(event.target.value); }} className="h-9 min-w-32 rounded-md border border-input bg-background px-3 text-sm"><option value="">全部领域</option>{fullCatalog?.filters.domains.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select value={role} onChange={(event) => { setPage(1); setRole(event.target.value); }} className="h-9 min-w-28 rounded-md border border-input bg-background px-3 text-sm"><option value="">全部角色</option>{fullCatalog?.filters.roles.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select value={difficulty} onChange={(event) => { setPage(1); setDifficulty(event.target.value); }} className="h-9 min-w-28 rounded-md border border-input bg-background px-3 text-sm"><option value="">全部难度</option>{fullCatalog?.filters.difficulties.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select value={judge} onChange={(event) => { setPage(1); setJudge(event.target.value as typeof judge); }} className="h-9 min-w-36 rounded-md border border-input bg-background px-3 text-sm"><option value="">全部 Judge</option><option value="pass">Judge 通过</option><option value="fail">Judge 失败</option><option value="insufficient_evidence">需人工复核</option></select>
        </>}
      </div>

      <div className="mt-4 min-w-0 overflow-x-auto border border-border">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">问题 ID</th>
              <th className="px-3 py-2">问题内容</th>
              <th className="px-3 py-2">问题类型</th>
              <th className="px-3 py-2">问题诊断及改进建议</th>
              <th className="px-3 py-2">平均耗时</th>
              <th className="px-3 py-2">是否通过</th>
              <th className="px-3 py-2">命中率</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {catalog.items.length ? catalog.items.map((item) => (
              <tr key={item.questionId} className="border-t border-border align-top">
                <td className="max-w-56 break-all px-3 py-3 font-mono text-xs">{item.questionId}</td>
                <td className="max-w-md px-3 py-3 font-medium leading-6">{item.question}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  <div>{item.questionType}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{intentLabel(item.intentType)} · {personaLabel(item.persona)}</div>
                </td>
                <td className="max-w-md px-3 py-3">
                  <div className={item.passed === false ? 'text-destructive' : 'text-foreground'}>{item.diagnosis}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">建议：{item.improvementSuggestion}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-3" title={item.averageLatencyMs == null ? undefined : `${item.averageLatencyMs} ms`}>
                  {formatLatency(item.averageLatencyMs)}
                </td>
                <td className="whitespace-nowrap px-3 py-3"><ResultBadge item={item} /></td>
                <td className="whitespace-nowrap px-3 py-3">
                  {item.hitRate == null ? <span className="text-muted-foreground">不可评估</span> : (
                    <div className="w-28">
                      <div className="flex justify-between text-xs"><span>{formatPercent(item.hitRate)}</span><span className="text-muted-foreground">语义命中</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, item.hitRate * 100))}%` }} /></div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted" onClick={() => void openCatalogDetail(item, 'semantic')}>
                      <Database className="h-3.5 w-3.5" />语义查询
                    </button>
                    <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted" onClick={() => void openCatalogDetail(item, 'result')}>
                      <FileText className="h-3.5 w-3.5" />查看测试结果
                    </button>
                    <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted" onClick={() => debugQuestion(item)}>
                      <Bug className="h-3.5 w-3.5" />调试
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">{loading ? '加载 650 题目录' : '没有符合筛选条件的问题'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4 text-sm text-muted-foreground">
        <span>共 {catalog.total} 条，当前第 {catalog.page}/{pageCount} 页</span>
        <div className="flex gap-2">
          <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" />上一页</button>
          <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 disabled:opacity-40" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页<ChevronRight className="h-4 w-4" /></button>
        </div>
      </footer>

      <Dialog
        open={Boolean(catalogDetailRequest)}
        onOpenChange={(open) => {
          if (!open && !catalogDetailLoading) {
            setCatalogDetailRequest(null);
            setCatalogDetail(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {catalogDetailRequest?.mode === 'semantic' ? '关联语义与库表' : '历史测试回复结果'}
            </DialogTitle>
            <DialogDescription>
              {catalogDetailRequest?.item.questionId} · {catalogDetailRequest?.item.question}
            </DialogDescription>
          </DialogHeader>
          {catalogDetailLoading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载详情</div>
          ) : catalogDetailRequest?.mode === 'semantic' ? (
            <SemanticDetail detail={catalogDetail} />
          ) : (
            <TestHistoryDetail detail={catalogDetail} />
          )}
        </DialogContent>
      </Dialog>

      {showRuns ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="eval-runs-title" className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div><h3 id="eval-runs-title" className="font-semibold">治理评测运行记录</h3><p className="mt-1 text-xs text-muted-foreground">运行记录来自数据库治理用例；650 题目录来自 Release 362 最终快照，两者不混算。</p></div>
              <button type="button" aria-label="关闭运行记录" className="rounded-md p-2 hover:bg-muted" onClick={() => setShowRuns(false)}><X className="h-4 w-4" /></button>
            </header>
            <div className="max-h-[72vh] overflow-auto p-5">
              <div className="mb-4 flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">发布 ID<input value={releaseId} onChange={(event) => setReleaseId(event.target.value)} className="mt-1 block h-9 w-28 rounded-md border border-input bg-background px-2 text-sm" /></label>
                <label className="text-xs text-muted-foreground">角色<input value={roleKey} onChange={(event) => setRoleKey(event.target.value)} placeholder="全部" className="mt-1 block h-9 w-36 rounded-md border border-input bg-background px-2 text-sm" /></label>
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60" onClick={() => void startRun()} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}发起当前治理评测</button>
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm" onClick={() => void loadRuns()}><RefreshCw className={`h-4 w-4 ${runsLoading ? 'animate-spin' : ''}`} />刷新</button>
              </div>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">运行</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">通过</th><th className="px-3 py-2">失败</th><th className="px-3 py-2">发布/角色</th><th className="px-3 py-2">操作</th></tr></thead>
                <tbody>{runs.length ? runs.map((run) => <tr key={run.id} className="border-t border-border"><td className="px-3 py-3">#{run.id}<div className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString('zh-CN')}</div></td><td className="px-3 py-3">{run.status}</td><td className="px-3 py-3">{run.passedCount}/{run.caseCount}</td><td className="px-3 py-3">{run.failedCount}</td><td className="px-3 py-3 text-xs">Release #{run.releaseId ?? '-'}<br />{run.roleKey ?? '全部角色'}</td><td className="px-3 py-3"><button type="button" className="h-8 rounded-md border border-border px-3 text-xs" onClick={() => void openRunDetail(run.id)}>逐题结果</button></td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{runsLoading ? '加载运行记录' : '暂无评测运行'}</td></tr>}</tbody>
              </table>
              {runDetail ? <div className="mt-5 border-t border-border pt-4"><h4 className="text-sm font-medium">运行逐题结果</h4><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">{JSON.stringify(runDetail, null, 2)}</pre></div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard(props: { label: string; value: string; hint: string; tone?: 'success' | 'danger' | 'warning' }) {
  const tone = props.tone === 'success' ? 'text-emerald-700' : props.tone === 'danger' ? 'text-destructive' : props.tone === 'warning' ? 'text-amber-700' : 'text-foreground';
  return <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{props.label}</div><div className={`mt-1 text-2xl font-semibold ${tone}`}>{props.value}</div><div className="mt-1 text-xs text-muted-foreground">{props.hint}</div></div>;
}

function ResultBadge({ item }: { item: BrainEvalCatalogItem }) {
  if (item.passed === null) return <span className="rounded-full border border-amber-300 px-2 py-0.5 text-xs text-amber-700">基础设施异常</span>;
  if (item.passed) return <span className="rounded-full border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700">通过</span>;
  return <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-xs text-destructive" title={item.failureReason ?? item.status}>未通过</span>;
}

function renderTags(values: string[], emptyText: string) {
  if (!values.length) return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  return <div className="flex flex-wrap gap-1">{values.map((value) => <span key={value} className="rounded bg-muted px-1.5 py-0.5 text-xs">{value}</span>)}</div>;
}

function SemanticDetail({ detail }: { detail: BrainEvalCatalogDetail | null }) {
  if (!detail) return <div className="py-8 text-center text-sm text-muted-foreground">详情暂不可用，请关闭后重试。</div>;
  const groups = [
    ['业务领域', detail.semanticKeys.filter((value) => value.startsWith('domain.'))],
    ['实体', detail.semanticKeys.filter((value) => value.startsWith('entity.'))],
    ['指标', detail.semanticKeys.filter((value) => value.startsWith('metric.'))],
    ['维度', detail.semanticKeys.filter((value) => value.startsWith('dimension.'))],
    ['关联能力', detail.semanticKeys.filter((value) => value.startsWith('capability.'))],
  ] as const;
  return (
    <div className="max-h-[65vh] space-y-5 overflow-auto pr-1">
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map(([label, values]) => (
          <section key={label} className="rounded-md border border-border p-3">
            <h4 className="text-sm font-medium">{label}</h4>
            <div className="mt-2">{renderTags(values, `暂无${label}`)}</div>
          </section>
        ))}
      </div>
      <section className="rounded-md border border-border p-3">
        <h4 className="text-sm font-medium">关联库表</h4>
        <div className="mt-2">{renderTags(detail.dataTables, '暂无关联库表')}</div>
      </section>
    </div>
  );
}

function TestHistoryDetail({ detail }: { detail: BrainEvalCatalogDetail | null }) {
  if (!detail) return <div className="py-8 text-center text-sm text-muted-foreground">详情暂不可用，请关闭后重试。</div>;
  if (!detail.testHistory.length) return <div className="py-8 text-center text-sm text-muted-foreground">暂无保存的历史测试回复。</div>;
  return (
    <div className="max-h-[65vh] space-y-4 overflow-auto pr-1">
      {detail.testHistory.map((result, index) => (
        <article key={`${result.releaseId ?? 'release'}:${result.runId ?? index}`} className="rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">Release #{result.releaseId ?? '-'} · Run #{result.runId ?? '-'}</div>
            <div className="text-xs text-muted-foreground">{result.generatedAt ? new Date(result.generatedAt).toLocaleString('zh-CN') : '-'} · {result.latencyMs == null ? '耗时未记录' : `${result.latencyMs} ms`}</div>
          </div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <ResultFact label="结果" value={result.passed === null ? '基础设施异常' : result.passed ? '通过' : '未通过'} />
            <ResultFact label="运行状态" value={`${result.status}${result.brainStatus ? ` / ${result.brainStatus}` : ''}`} />
            <ResultFact label="意图" value={`${result.expectedIntent ?? '-'} → ${result.actualIntent ?? '-'}`} />
            <ResultFact label="回答形态" value={`${result.expectedShape ?? '-'} → ${result.actualShape ?? '-'}`} />
          </div>
          <section className="mt-4">
            <h4 className="text-sm font-medium">测试回复</h4>
            <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm leading-6">{result.answer || '本次测试未保存回答文本。'}</div>
          </section>
          {result.graderReason ? <p className="mt-3 text-sm"><span className="font-medium">评测结论：</span>{result.graderReason}</p> : null}
          <section className="mt-4">
            <h4 className="text-sm font-medium">分层结果</h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {result.layers.map((layer) => (
                <div key={layer.layer} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex justify-between gap-2"><span className="font-medium">{layer.layer}</span><span>{layer.score == null ? '-' : formatPercent(layer.score)}</span></div>
                  <div className="mt-1 text-muted-foreground">{layer.failures.length ? layer.failures.join('、') : '通过'}</div>
                </div>
              ))}
            </div>
          </section>
          {result.capabilityKeys.length ? <div className="mt-4"><h4 className="text-sm font-medium">命中能力</h4><div className="mt-2">{renderTags(result.capabilityKeys, '未命中能力')}</div></div> : null}
        </article>
      ))}
    </div>
  );
}

function ResultFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/60 p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words">{value}</div></div>;
}

function formatPercent(value?: number | null) {
  if (value == null) return '-';
  return new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function formatLatency(value?: number | null) {
  if (value == null) return '未记录';
  if (value < 1000) return `${value} ms`;
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value / 1000)} 秒`;
}

function personaLabel(value: string) {
  return ({ manager: '店长', marketing: '营销', reception: '前台', beautician: '美容师', inventory: '库存', finance: '财务', edge: '边界' } as Record<string, string>)[value] ?? value;
}

function intentLabel(value: string) {
  return ({ query: '查询', diagnosis: '诊断', action: '动作', recommendation: '建议', draft: '草稿', clarify: '追问', analysis_and_recommendation: '分析建议' } as Record<string, string>)[value] ?? value;
}
