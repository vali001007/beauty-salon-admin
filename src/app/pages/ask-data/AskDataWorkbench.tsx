import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Database, Loader2, MessageSquare, RefreshCcw, Send, Sparkles, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAskDataCatalog, queryAskData } from '@/api/askData';
import type { AskDataCatalogResponse, AskDataHistoryItem, AskDataQueryResponse } from '@/types/askData';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';

const fallbackExamples = ['上个月收入按项目看', '库存低于安全库存的商品有哪些', '张三最近消费了什么', '本月预约取消率是多少'];

function statusLabel(status?: string) {
  if (status === 'success') return '已查询';
  if (status === 'clarification') return '需要追问';
  if (status === 'no_data') return '暂无数据';
  if (status === 'unsupported') return '暂未支持';
  if (status === 'error') return '查询失败';
  return '等待提问';
}

function statusTone(status?: string) {
  if (status === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'clarification') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'unsupported' || status === 'error') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function cellText(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return String(value);
}

export function AskDataWorkbench() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<AskDataHistoryItem[]>([]);
  const [result, setResult] = useState<AskDataQueryResponse | null>(null);
  const [catalog, setCatalog] = useState<AskDataCatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAskDataCatalog()
      .then(setCatalog)
      .catch(() => {
        setCatalog({ tables: [], examples: fallbackExamples });
      });
  }, []);

  const examples = useMemo(() => {
    const fromCatalog = catalog?.examples?.length ? catalog.examples : fallbackExamples;
    return fromCatalog.slice(0, 4);
  }, [catalog?.examples]);

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
        { role: 'assistant', content: response.summary, queryPlan: response.queryPlan, rows: response.rows },
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
          <p className="mt-1 text-sm text-muted-foreground">基础版只读验证：先覆盖客户、订单、预约、库存、财务和人效相关经营问数。</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusTone(result?.status)}`}>
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
              <Button className="w-full gap-2" onClick={() => void submitQuestion()} disabled={loading || !question.trim()}>
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
            覆盖目录
          </div>
          <div className="mt-2 max-h-32 overflow-auto text-xs leading-6 text-muted-foreground">
            {(catalog?.tables ?? []).slice(0, 14).map((table) => (
              <span key={table.model} className="mr-2 inline-block">
                {table.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {result ? (
        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              {result.status === 'clarification' ? <MessageSquare className="mt-0.5 h-5 w-5 text-amber-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-primary" />}
              <div>
                <div className="text-sm font-medium text-foreground">查询摘要</div>
                <p className="mt-1 text-sm text-muted-foreground">{result.summary}</p>
                {result.clarificationQuestion ? (
                  <p className="mt-2 text-sm font-medium text-amber-700">{result.clarificationQuestion}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>模板：{result.queryPlan?.templateId ?? '-'}</span>
                  <span>规划：{result.queryPlan?.planner ?? '-'}</span>
                  {result.queryPlan?.dateRange?.label ? <span>时间：{result.queryPlan.dateRange.label}</span> : null}
                </div>
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
                  <div key={`${source.model}-${source.reason}`} className="rounded-md border border-border bg-background p-3">
                    <div className="text-sm font-semibold text-foreground">{source.model}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{source.reason}</div>
                    <div className="mt-2 text-xs text-muted-foreground">字段：{source.fields.join('、')}</div>
                    <div className="mt-1 text-xs text-muted-foreground">过滤：{source.filters.join('、')}</div>
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
