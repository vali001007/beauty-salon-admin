import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  History,
  Loader2,
  MessageSquare,
  Play,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAskDataCatalog, queryAskData } from '@/api/askData';
import { useStoreStore } from '@/stores/storeStore';
import type { AskDataCatalogResponse, AskDataHistoryItem, AskDataQueryResponse } from '@/types/askData';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';

const fallbackExamples = [
  '上个月收入按项目看',
  '库存低于安全库存的商品有哪些',
  '张三最近消费了什么',
  '本月预约取消率是多少',
];

type AskSidebarTab = 'tests' | 'issues' | 'history';

type AskSessionRun = {
  id: string;
  question: string;
  response: AskDataQueryResponse;
  createdAt: string;
};

const cellValueLabels: Record<string, Record<string, string>> = {
  slow_moving_status: {
    no_outbound_90d: '90 天无出库',
    low_turnover: '低周转',
    moving: '正常动销',
  },
  replenishment_fact_status: {
    below_safety_no_open_procurement: '低于安全库存且无在途采购',
    below_safety_with_open_procurement: '低于安全库存且有在途采购',
    covered: '库存覆盖正常',
  },
  turnover_policy: {
    operational_event_weighted_not_financial_turnover: '库存事件加权运营口径（非财务会计周转率）',
  },
  cost_policy: {
    catalog_cost_estimated_not_batch_actual: '商品档案成本估算（非批次实际成本）',
  },
};

function statusLabel(status?: string) {
  if (status === 'success') return '已查询';
  if (status === 'clarification') return '需要追问';
  if (status === 'no_data') return '暂无数据';
  if (status === 'blocked') return '已阻断';
  if (status === 'feature_disabled') return '固定模板';
  if (status === 'unsupported') return '暂未支持';
  if (status === 'error' || status === 'failed') return '查询失败';
  return '等待提问';
}

function statusTone(status?: string) {
  if (status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'clarification') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'unsupported' || status === 'error' || status === 'failed' || status === 'blocked') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  if (status === 'feature_disabled') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function cellText(columnKey: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return cellValueLabels[columnKey]?.[String(value)] ?? String(value);
}

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isIssueStatus(status: AskDataQueryResponse['status']) {
  return ['clarification', 'unsupported', 'error', 'blocked', 'failed'].includes(status);
}

export function AskDataWorkbench() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<AskDataHistoryItem[]>([]);
  const [sessionRuns, setSessionRuns] = useState<AskSessionRun[]>([]);
  const [result, setResult] = useState<AskDataQueryResponse | null>(null);
  const [catalog, setCatalog] = useState<AskDataCatalogResponse | null>(null);
  const [sidebarTab, setSidebarTab] = useState<AskSidebarTab>('tests');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentStoreId === null) {
      setCatalog(null);
      return;
    }
    getAskDataCatalog()
      .then(setCatalog)
      .catch(() => setCatalog({ tables: [], examples: fallbackExamples }));
  }, [currentStoreId]);

  const testQuestions = useMemo(
    () => (catalog?.examples?.length ? catalog.examples : fallbackExamples),
    [catalog?.examples],
  );
  const examples = useMemo(() => testQuestions.slice(0, 4), [testQuestions]);
  const issueRuns = useMemo(() => sessionRuns.filter((item) => isIssueStatus(item.response.status)), [sessionRuns]);

  const catalogGroups = useMemo(() => {
    const labels = new Map((catalog?.groups ?? []).map((group) => [group.domain, group.label]));
    const groups = new Map<string, AskDataCatalogResponse['tables']>();
    for (const table of catalog?.tables ?? []) {
      const domain = table.domain ?? 'other';
      groups.set(domain, [...(groups.get(domain) ?? []), table]);
    }
    return [...groups.entries()]
      .map(([domain, tables]) => ({ domain, label: labels.get(domain) ?? domain, tables }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'));
  }, [catalog?.groups, catalog?.tables]);

  const submitQuestion = useCallback(async () => {
    const text = question.trim();
    if (!text || loading) return;
    setLoading(true);
    try {
      const response = await queryAskData({ question: text, history: history.slice(-5) });
      setResult(response);
      setSessionRuns((current) => [
        { id: `${Date.now()}-${current.length}`, question: text, response, createdAt: new Date().toISOString() },
        ...current,
      ].slice(0, 20));
      setHistory((current) => [
        ...current.slice(-8),
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: response.summary,
          queryPlan: response.queryPlan,
          rows: response.rows,
          queryMeta: response.queryMeta,
        },
      ]);
      setQuestion('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '智能问数查询失败');
    } finally {
      setLoading(false);
    }
  }, [history, loading, question]);

  return (
    <div className="grid h-[calc(100vh-7.5rem)] min-h-[620px] overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_340px]">
      <AskSidebar
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        testQuestions={testQuestions}
        issueRuns={issueRuns}
        historyRuns={sessionRuns}
        onSelectQuestion={setQuestion}
        onNewConversation={() => {
          setHistory([]);
          setResult(null);
          setQuestion('');
        }}
      />

      <main className="flex min-h-0 min-w-0 flex-col bg-background">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              智能问数
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Ask 独立语义路由 · 受控自由 SQL · 当前门店只读查询</p>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusTone(result?.status)}`}>
            {loading ? '查询中' : statusLabel(result?.status)}
          </span>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-label="智能问数对话">
          {!history.length ? (
            <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">用经营语言直接提问</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                系统只会在当前账号已授权的 Ask 视图中生成 SQL，并经过门店范围、敏感字段和只读安全校验。
              </p>
              <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                {examples.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    onClick={() => setQuestion(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            history.map((item, index) => {
              const isLatestAssistant = item.role === 'assistant' && index === history.length - 1 && result;
              if (isLatestAssistant) return <AskResultMessage key={`${item.role}-${index}`} result={result} onClear={() => setResult(null)} />;
              return (
                <div key={`${item.role}-${index}`} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    item.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card text-foreground'
                  }`}>
                    {item.content}
                  </div>
                </div>
              );
            })
          )}
          {loading ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在理解问题、生成并校验查询…
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-card/80 p-4 backdrop-blur">
          <div className="rounded-xl border border-border bg-background p-2 shadow-sm focus-within:border-primary/50">
            <textarea
              id="ask-data-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submitQuestion();
              }}
              className="min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none"
              placeholder="例如：上个月收入按项目看"
            />
            <div className="flex items-center justify-between gap-3 px-1 pt-1">
              <span className="text-[11px] text-muted-foreground">⌘ / Ctrl + Enter 发送 · 仅查询当前门店</span>
              <Button className="gap-2" onClick={() => void submitQuestion()} disabled={loading || !question.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                查询
              </Button>
            </div>
          </div>
        </div>
      </main>

      <AskRunPanel result={result} loading={loading} catalog={catalog} catalogGroups={catalogGroups} />
    </div>
  );
}

function AskSidebar({
  activeTab,
  onTabChange,
  testQuestions,
  issueRuns,
  historyRuns,
  onSelectQuestion,
  onNewConversation,
}: {
  activeTab: AskSidebarTab;
  onTabChange: (tab: AskSidebarTab) => void;
  testQuestions: string[];
  issueRuns: AskSessionRun[];
  historyRuns: AskSessionRun[];
  onSelectQuestion: (question: string) => void;
  onNewConversation: () => void;
}) {
  const runs = activeTab === 'issues' ? issueRuns : historyRuns;
  return (
    <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-border bg-muted/10 lg:flex">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Database className="h-4 w-4 text-primary" />
          Ami Ask 工作区
        </div>
        <Button variant="outline" className="mt-4 w-full gap-2" onClick={onNewConversation}>
          <MessageSquare className="h-4 w-4" />
          新建对话
        </Button>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="Ask 资料侧栏">
          {([
            ['tests', '测试集', ClipboardCheck],
            ['issues', '错题集', AlertCircle],
            ['history', '历史记录', History],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`inline-flex min-w-0 flex-col items-center gap-1 rounded px-1 py-2 text-[11px] font-medium transition ${
                activeTab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onTabChange(key)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {activeTab === 'tests' ? (
          <div className="space-y-1">
            {testQuestions.map((item, index) => (
              <button
                key={item}
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => onSelectQuestion(item)}
              >
                <span className="mr-2 font-mono text-[10px] text-primary">Q{String(index + 1).padStart(2, '0')}</span>
                <span className="leading-5">{item}</span>
              </button>
            ))}
          </div>
        ) : !runs.length ? (
          <div className="px-3 py-8 text-center text-sm leading-6 text-muted-foreground">
            {activeTab === 'issues' ? '本次会话还没有需要复核的问题。' : '本次会话还没有查询记录。'}
          </div>
        ) : (
          <div className="space-y-1">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => onSelectQuestion(run.question)}
              >
                {activeTab === 'issues' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium leading-5">{run.question}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{statusLabel(run.response.status)} · {shortTime(run.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border px-4 py-3 text-[11px] leading-5 text-muted-foreground">
        测试集来自 Ask Catalog；错题与历史记录仅保留在本次页面会话，不写入 Brain。
      </div>
    </aside>
  );
}

function AskResultMessage({ result, onClear }: { result: AskDataQueryResponse; onClear: () => void }) {
  const hasRows = Boolean(result.rows?.length && result.columns?.length);
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[96%] rounded-2xl rounded-bl-md border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          {result.status === 'clarification' ? <MessageSquare className="mt-0.5 h-5 w-5 text-amber-600" /> : <Sparkles className="mt-0.5 h-5 w-5 text-primary" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">经营回答</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{result.summary}</p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 gap-1" onClick={onClear}>
                <RefreshCcw className="h-3.5 w-3.5" />清空
              </Button>
            </div>
            {result.keyFindings?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                {result.keyFindings.map((finding) => <li key={finding}>{finding}</li>)}
              </ul>
            ) : null}
            {result.clarificationQuestion ? <p className="mt-2 text-sm font-medium text-amber-700">{result.clarificationQuestion}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>方式：{result.queryPlan?.planner === 'llm' ? '自由 SQL' : result.queryPlan?.planner === 'legacy' ? '固定模板' : (result.queryPlan?.planner ?? '-')}</span>
              {result.queryPlan?.dateRange?.label ? <span>时间：{result.queryPlan.dateRange.label}</span> : null}
              {result.queryMeta?.timeRange ? <span>范围：{result.queryMeta.timeRange}</span> : null}
              {result.queryMeta?.executionMs !== undefined ? <span>耗时：{result.queryMeta.executionMs}ms</span> : null}
              {result.queryMeta?.dataAsOf ? <span>数据截至：{new Date(result.queryMeta.dataAsOf).toLocaleString('zh-CN')}</span> : null}
            </div>
          </div>
        </div>

        {hasRows ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-sm font-medium text-foreground">
              <Table2 className="h-4 w-4" />查询结果
            </div>
            <Table>
              <TableHeader><TableRow>{result.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {result.rows.map((row, index) => (
                  <TableRow key={index}>{result.columns.map((column) => <TableCell key={column.key}>{cellText(column.key, row[column.key])}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {result.limitations?.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="font-medium">查询限制</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-4">
          <div className="text-sm font-medium text-foreground">来源</div>
          {result.sources.length ? (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {result.sources.map((source) => (
                <div key={`${source.model}-${source.reason}`} className="rounded-md border border-border bg-background p-3">
                  <div className="text-sm font-semibold text-foreground">{source.model}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{source.reason}</div>
                  <div className="mt-2 text-xs text-muted-foreground">字段：{source.fields.join('、')}</div>
                  <div className="mt-1 text-xs text-muted-foreground">过滤：{source.filters.join('、')}</div>
                  {source.dataPolicy ? <div className="mt-1 text-xs text-amber-700">口径：{source.dataPolicy}</div> : null}
                  {source.dataAsOf ? <div className="mt-1 text-xs text-muted-foreground">数据截至：{new Date(source.dataAsOf).toLocaleString('zh-CN')}</div> : null}
                </div>
              ))}
            </div>
          ) : <div className="mt-2 text-sm text-muted-foreground">当前没有可展示来源。</div>}
        </div>

        {result.queryMeta?.generatedSql && result.queryPlan?.semanticIntent ? (
          <details className="mt-4 rounded border border-border bg-background p-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">管理员语义路由</summary>
            <div className="mt-2 space-y-1">
              <div>识别：{result.queryPlan.semanticIntent.intent} / {result.queryPlan.semanticIntent.answerShape}</div>
              <div>指标：{result.queryPlan.semanticIntent.metricKeys.join('、') || '-'}</div>
              <div>路由：{result.queryPlan.semanticIntent.routeMode}，置信度：{(result.queryPlan.semanticIntent.confidence * 100).toFixed(0)}%</div>
            </div>
          </details>
        ) : null}
        {result.queryMeta?.generatedSql ? (
          <details className="mt-2 rounded border border-border bg-background p-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">管理员调试 SQL</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">{result.queryMeta.generatedSql}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function AskRunPanel({
  result,
  loading,
  catalog,
  catalogGroups,
}: {
  result: AskDataQueryResponse | null;
  loading: boolean;
  catalog: AskDataCatalogResponse | null;
  catalogGroups: Array<{ domain: string; label: string; tables: AskDataCatalogResponse['tables'] }>;
}) {
  const semantic = result?.queryPlan?.semanticIntent;
  const stages = [
    { label: '意图理解', detail: semantic ? `${semantic.intent} · ${semantic.answerShape}` : '等待问题', ready: Boolean(result), running: loading },
    { label: '语义路由', detail: semantic ? `${semantic.metricKeys.join('、') || '通用指标'} · ${Math.round(semantic.confidence * 100)}%` : '尚未路由', ready: Boolean(result && semantic), running: false },
    { label: '权限与 SQL 安全', detail: result ? `${result.queryMeta?.connectionMode === 'development_admin' ? '开发管理员只读事务' : '只读连接'} · ${result.queryPlan?.planner ?? '-'}` : '等待生成', ready: Boolean(result), running: false },
    { label: '数据查询', detail: result ? `${result.rows.length} 行 · ${result.queryMeta?.executionMs ?? '-'}ms` : '等待执行', ready: Boolean(result && ['success', 'no_data', 'feature_disabled'].includes(result.status)), running: false },
    { label: '回答组织', detail: result ? statusLabel(result.status) : '等待结果', ready: Boolean(result), running: false },
  ];
  return (
    <aside className="hidden min-h-0 flex-col overflow-hidden border-l border-border bg-muted/10 xl:flex">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Play className="h-4 w-4 text-primary" />运行可视化</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">只展示 Ami Ask 当前响应中可核验的运行信息。</p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-1">
          {stages.map((stage, index) => {
            const failed = Boolean(result && index >= 2 && ['blocked', 'failed', 'error', 'unsupported'].includes(result.status));
            const Icon = failed ? XCircle : stage.ready ? CheckCircle2 : stage.running ? Loader2 : ShieldCheck;
            return (
              <div key={stage.label} className="relative flex gap-3 pb-4 last:pb-0">
                {index < stages.length - 1 ? <span className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-border" /> : null}
                <Icon className={`relative z-10 mt-0.5 h-5 w-5 shrink-0 bg-muted/10 ${failed ? 'text-destructive' : stage.ready ? 'text-emerald-600' : stage.running ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                <div className="min-w-0"><div className="text-sm font-medium text-foreground">{stage.label}</div><div className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{stage.detail}</div></div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="视图" value={String(result?.queryMeta?.viewNames?.length ?? 0)} />
          <Metric label="结果行" value={String(result?.rows?.length ?? 0)} />
          <Metric label="SQL 耗时" value={result?.queryMeta?.executionMs !== undefined ? `${result.queryMeta.executionMs}ms` : '-'} />
          <Metric label="路由置信度" value={semantic ? `${Math.round(semantic.confidence * 100)}%` : '-'} />
        </div>

        <section className="border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Database className="h-4 w-4" />覆盖目录 · {catalog?.totalCount ?? catalog?.tables?.length ?? 0} 项</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {catalog?.mode === 'execute'
              ? catalog.connectionMode === 'development_admin' ? '开发冒烟：管理员库只读事务' : '自由查询已就绪'
              : catalog?.mode === 'dry_run' ? '自由查询演练模式' : '当前使用固定模板'}
          </div>
          <div className="mt-3 space-y-2">
            {catalogGroups.map((group) => (
              <details key={group.domain} className="rounded-md border border-border bg-background px-2.5 py-2" open={catalogGroups.length <= 4}>
                <summary className="cursor-pointer text-xs font-medium text-foreground">{group.label}（{group.tables.length}）</summary>
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {group.tables.map((table) => <span key={table.viewName ?? table.model ?? table.label} title={table.dataPolicy ?? table.description}>{table.label}</span>)}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-background p-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-1 text-sm font-semibold text-foreground">{value}</div></div>;
}
