import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Database, Loader2, MessageSquare, RefreshCcw, Send, Sparkles, Table2 } from 'lucide-react';
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
  if (status === 'unsupported' || status === 'error' || status === 'failed' || status === 'blocked')
    return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'feature_disabled') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function cellText(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return String(value);
}

export function AskDataWorkbench() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<AskDataHistoryItem[]>([]);
  const [result, setResult] = useState<AskDataQueryResponse | null>(null);
  const [catalog, setCatalog] = useState<AskDataCatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentStoreId === null) {
      setCatalog(null);
      return;
    }
    getAskDataCatalog()
      .then(setCatalog)
      .catch(() => {
        setCatalog({ tables: [], examples: fallbackExamples });
      });
  }, [currentStoreId]);

  const examples = useMemo(() => {
    const fromCatalog = catalog?.examples?.length ? catalog.examples : fallbackExamples;
    return fromCatalog.slice(0, 4);
  }, [catalog?.examples]);

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
      setHistory((prev) => [
        ...prev.slice(-8),
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

  const hasRows = Boolean(result?.rows?.length && result?.columns?.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            智能问数
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            受控自由查询：模型生成 SQL，经权限和只读安全校验后执行，再组织经营回答。
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusTone(result?.status)}`}
        >
          {statusLabel(result?.status)}
        </span>
      </div>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-foreground" htmlFor="ask-data-question">
            口语提问
          </label>
          <div className="flex flex-col gap-2 md:flex-row">
            <textarea
              id="ask-data-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  void submitQuestion();
                }
              }}
              className="min-h-24 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              placeholder="例如：上个月收入按项目看"
            />
            <div className="flex md:w-28 md:flex-col">
              <Button
                className="w-full gap-2"
                onClick={() => void submitQuestion()}
                disabled={loading || !question.trim()}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                查询
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {examples.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => setQuestion(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Database className="h-4 w-4" />
            覆盖目录 · {catalog?.totalCount ?? catalog?.tables?.length ?? 0} 项
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {catalog?.mode === 'execute'
              ? catalog.connectionMode === 'development_admin'
                ? '开发冒烟：管理员库只读事务'
                : '自由查询已就绪'
              : catalog?.mode === 'dry_run'
                ? '自由查询演练模式'
                : '当前使用固定模板'}
          </div>
          <div className="mt-2 max-h-52 space-y-1 overflow-auto text-xs text-muted-foreground">
            {catalogGroups.map((group) => (
              <details key={group.domain} className="rounded border border-border/70 bg-background px-2 py-1" open={catalogGroups.length <= 4}>
                <summary className="cursor-pointer font-medium text-foreground">
                  {group.label}（{group.tables.length}）
                </summary>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                  {group.tables.map((table) => (
                    <span key={table.viewName ?? table.model ?? table.label} title={table.dataPolicy ?? table.description}>
                      {table.label}
                    </span>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {result ? (
        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              {result.status === 'clarification' ? (
                <MessageSquare className="mt-0.5 h-5 w-5 text-amber-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 text-primary" />
              )}
              <div>
                <div className="text-sm font-medium text-foreground">查询摘要</div>
                <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>
                {result.keyFindings?.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {result.keyFindings.map((finding) => (
                      <li key={finding}>{finding}</li>
                    ))}
                  </ul>
                ) : null}
                {result.clarificationQuestion ? (
                  <p className="mt-2 text-sm font-medium text-amber-700">{result.clarificationQuestion}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>
                    方式：
                    {result.queryPlan?.planner === 'llm'
                      ? '自由 SQL'
                      : result.queryPlan?.planner === 'legacy'
                        ? '固定模板'
                        : (result.queryPlan?.planner ?? '-')}
                  </span>
                  {result.queryPlan?.dateRange?.label ? <span>时间：{result.queryPlan.dateRange.label}</span> : null}
                  {result.queryMeta?.timeRange ? <span>范围：{result.queryMeta.timeRange}</span> : null}
                  {result.queryMeta?.executionMs !== undefined ? (
                    <span>耗时：{result.queryMeta.executionMs}ms</span>
                  ) : null}
                  {result.queryMeta?.dataAsOf ? (
                    <span>数据截至：{new Date(result.queryMeta.dataAsOf).toLocaleString('zh-CN')}</span>
                  ) : null}
                </div>
                {result.queryMeta?.generatedSql && result.queryPlan?.semanticIntent ? (
                  <details className="mt-3 rounded border border-border bg-background p-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">管理员语义路由</summary>
                    <div className="mt-2 space-y-1">
                      <div>
                        识别：{result.queryPlan.semanticIntent.intent} / {result.queryPlan.semanticIntent.answerShape}
                      </div>
                      <div>指标：{result.queryPlan.semanticIntent.metricKeys.join('、') || '-'}</div>
                      <div>
                        路由：{result.queryPlan.semanticIntent.routeMode}，置信度：
                        {(result.queryPlan.semanticIntent.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </details>
                ) : null}
                {result.queryMeta?.generatedSql ? (
                  <details className="mt-3 rounded border border-border bg-background p-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">管理员调试 SQL</summary>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
                      {result.queryMeta.generatedSql}
                    </pre>
                  </details>
                ) : null}
              </div>
            </div>
          </div>

          {hasRows ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Table2 className="h-4 w-4" />
                查询结果
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {result.columns.map((column) => (
                      <TableHead key={column.key}>{column.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, index) => (
                    <TableRow key={index}>
                      {result.columns.map((column) => (
                        <TableCell key={column.key}>{cellText(row[column.key])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {result.limitations?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="font-medium">查询限制</div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {result.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">来源</div>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setResult(null)}>
                <RefreshCcw className="h-3.5 w-3.5" />
                清空
              </Button>
            </div>
            {result.sources.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {result.sources.map((source) => (
                  <div
                    key={`${source.model}-${source.reason}`}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <div className="text-sm font-semibold text-foreground">{source.model}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{source.reason}</div>
                    <div className="mt-2 text-xs text-muted-foreground">字段：{source.fields.join('、')}</div>
                    <div className="mt-1 text-xs text-muted-foreground">过滤：{source.filters.join('、')}</div>
                    {source.dataPolicy ? <div className="mt-1 text-xs text-amber-700">口径：{source.dataPolicy}</div> : null}
                    {source.dataAsOf ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        数据截至：{new Date(source.dataAsOf).toLocaleString('zh-CN')}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">当前没有可展示来源。</div>
            )}
          </div>
        </section>
      ) : (
        <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          输入经营问题后，这里会展示查询摘要、表格和来源。
        </div>
      )}
    </div>
  );
}
