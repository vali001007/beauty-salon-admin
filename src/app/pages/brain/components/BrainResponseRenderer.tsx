import { AlertTriangle, CheckCircle2, Database, HelpCircle, ListOrdered, Sparkles } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BrainGuidanceSelection, BrainResponseBlock, BrainRunStatus } from '@/types/brain';

interface BrainResponseRendererProps {
  blocks?: BrainResponseBlock[];
  fallback: string;
  status?: BrainRunStatus;
  interactive?: boolean;
  sending?: boolean;
  sourceRunId?: number;
  onGuidanceSelect?: (selection: BrainGuidanceSelection & { value: string }) => void;
  onClarificationSelect?: (value: unknown, label: string) => void;
}

export function BrainResponseRenderer({
  blocks = [],
  fallback,
  status,
  interactive = false,
  sending = false,
  sourceRunId,
  onGuidanceSelect,
  onClarificationSelect,
}: BrainResponseRendererProps) {
  const safeBlocks = safeResponseBlocks(blocks, status);
  const safeFallback =
    status === 'failed'
      ? '本次请求执行失败，未生成可信业务结论。'
      : status === 'cancelled'
        ? '本次请求已取消，未生成新的业务结论。'
        : fallback;
  if (!safeBlocks.length) {
    return (
      <div className="space-y-2">
        {status && status !== 'completed' ? <BrainRunStatusNotice status={status} /> : null}
        <span className="whitespace-pre-wrap break-words">{safeFallback}</span>
      </div>
    );
  }
  const hasEmptyRanking = safeBlocks.some((block) => block.kind === 'ranking' && block.rows.length === 0);
  const hasEmptyTable = safeBlocks.some((block) => block.kind === 'table' && block.rows.length === 0);

  return (
    <div className="space-y-3">
      {status && status !== 'completed' ? <BrainRunStatusNotice status={status} /> : null}
      {safeBlocks.map((block, index) => {
        if (block.kind === 'text')
          return (
            <p key={index} className="whitespace-pre-wrap break-words">
              {block.text}
            </p>
          );
        if (block.kind === 'kpi') {
          return (
            <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {block.items.map((item) => (
                <div key={`${item.label}:${item.value}`} className="border-l-2 border-primary/50 pl-3">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{item.value}</div>
                  {item.hint ? <div className="mt-0.5 text-xs text-muted-foreground">{item.hint}</div> : null}
                </div>
              ))}
            </div>
          );
        }
        if (block.kind === 'ranking' || block.kind === 'table') {
          return <DataTable key={index} block={block} ranking={block.kind === 'ranking'} />;
        }
        if (block.kind === 'comparison') {
          return (
            <div key={index} className="space-y-2">
              {block.items.map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 break-words font-medium">{item.label}</span>
                  <span>{item.current}</span>
                  <span className="text-muted-foreground">{item.delta ?? item.previous}</span>
                </div>
              ))}
            </div>
          );
        }
        if (block.kind === 'diagnosis') {
          return (
            <div key={index} className="space-y-2">
              {block.findings.map((finding) => (
                <div
                  key={`${finding.title}:${finding.detail}`}
                  className="flex gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${finding.severity === 'critical' ? 'text-destructive' : 'text-amber-600'}`}
                  />
                  <div>
                    <div className="font-medium">{finding.title}</div>
                    <div className="text-muted-foreground">{finding.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        if (block.kind === 'clarification') {
          return (
            <div key={index} className="flex gap-2 text-amber-800">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">需要明确的问题</div>
                <div className="mt-1">{block.question}</div>
                {block.options.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {block.options.map((option) => {
                      const value = guidanceOptionValue(option.value, option.label);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-left text-xs text-amber-900 transition hover:border-amber-500 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={sending || (!onClarificationSelect && (!interactive || !sourceRunId || !onGuidanceSelect))}
                          onClick={() => {
                            if (onClarificationSelect) {
                              onClarificationSelect(value, option.label);
                              return;
                            }
                            if (sourceRunId) {
                              onGuidanceSelect?.({
                                kind: 'clarification',
                                sourceRunId,
                                optionId: option.id,
                                value,
                              });
                            }
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        }
        if (block.kind === 'follow_up_questions') {
          return (
            <div key={index} className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Sparkles className="h-4 w-4" />
                你还可以继续问
              </div>
              <div className="mt-2 grid gap-2">
                {block.questions.map((question) => (
                  <button
                    key={question.id}
                    type="button"
                    className="rounded-md border border-border bg-background px-3 py-2 text-left text-xs leading-5 text-foreground transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!interactive || sending || !sourceRunId || !onGuidanceSelect}
                    onClick={() =>
                      sourceRunId &&
                      onGuidanceSelect?.({
                        kind: 'follow_up',
                        sourceRunId,
                        optionId: question.id,
                        value: question.value,
                      })
                    }
                  >
                    {question.label}
                    <span className="mt-0.5 block text-muted-foreground">{question.value}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (block.kind === 'action_preview') {
          return (
            <div key={index} className="flex gap-2 text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>已生成 {block.actions.length} 个待确认动作预览</span>
            </div>
          );
        }
        if (block.kind === 'limitations') {
          const items = block.items.filter(
            (item) =>
              !(item === 'no_data:ranking' && hasEmptyRanking) &&
              !(item === 'no_data:table' && hasEmptyTable),
          );
          if (!items.length) return null;
          return (
            <div key={index} className="flex gap-2 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {items.every((item) => item.startsWith('no_data:')) ? '说明' : '能力边界'}：
                {items.map(formatLimitation).join('；')}
              </span>
            </div>
          );
        }
        if (block.kind === 'evidence') {
          return (
            <div key={index} className="flex gap-2 text-xs text-muted-foreground">
              <Database className="h-4 w-4 shrink-0" />
              <span>{block.citations.length} 条可追溯证据</span>
            </div>
          );
        }
        if (block.kind === 'chart') {
          return <BrainChart key={index} block={block} />;
        }
        return (
          <span key={index} className="whitespace-pre-wrap break-words">
            {safeFallback}
          </span>
        );
      })}
    </div>
  );
}

function BrainRunStatusNotice({ status }: { status: BrainRunStatus }) {
  const presentation =
    status === 'failed'
      ? { label: '执行失败', className: 'border-destructive/30 bg-destructive/5 text-destructive' }
      : status === 'cancelled'
        ? { label: '已取消', className: 'border-border bg-muted/40 text-muted-foreground' }
        : status === 'needs_confirmation'
          ? { label: '待确认', className: 'border-amber-300 bg-amber-50 text-amber-800' }
          : { label: '处理中', className: 'border-blue-200 bg-blue-50 text-blue-700' };
  return (
    <div className={`rounded-md border px-3 py-2 text-xs font-medium ${presentation.className}`}>
      {presentation.label}
    </div>
  );
}

function safeResponseBlocks(blocks: BrainResponseBlock[], status?: BrainRunStatus): BrainResponseBlock[] {
  if (status === 'failed') {
    const evidence = blocks.filter((block) => block.kind === 'evidence');
    return [{ kind: 'limitations', items: ['capability_failed'] }, ...evidence];
  }
  if (status === 'cancelled') return [{ kind: 'limitations', items: ['request_cancelled'] }];
  if (status === 'queued' || status === 'running') return [];
  return blocks;
}

function BrainChart({ block }: { block: Extract<BrainResponseBlock, { kind: 'chart' }> }) {
  if (!block.rows.length || !block.yKeys.length) {
    return <div className="text-sm text-muted-foreground">暂无可绘制数据。</div>;
  }
  const Chart = block.chartType === 'line' ? LineChart : BarChart;
  return (
    <div className="h-56 w-full min-w-0" aria-label={block.chartType === 'line' ? '趋势图' : '柱状图'}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={block.rows} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={block.xKey} tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(value) => formatCell(value)} />
          {block.yKeys.map((key, seriesIndex) =>
            block.chartType === 'line' ? (
              <Line key={key} dataKey={key} type="monotone" stroke={chartColor(seriesIndex)} strokeWidth={2} dot={false} />
            ) : (
              <Bar key={key} dataKey={key} fill={chartColor(seriesIndex)} radius={[3, 3, 0, 0]} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

function chartColor(index: number) {
  return ['#25635b', '#c17b3f', '#4f6f9f', '#8a5a86'][index % 4];
}

function guidanceOptionValue(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = (value as Record<string, unknown>).candidate;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function DataTable({
  block,
  ranking,
}: {
  block: Extract<BrainResponseBlock, { kind: 'ranking' | 'table' }>;
  ranking: boolean;
}) {
  const columns = block.columns.length ? block.columns : Object.keys(block.rows[0] ?? {});
  if (!block.rows.length) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-5 text-center">
        <Database className="mx-auto h-5 w-5 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium text-foreground">暂无匹配数据</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {ranking ? '当前条件下没有可排行的业务记录。' : '当前条件下没有匹配的业务明细。'}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {ranking ? <ListOrdered className="h-4 w-4" /> : null}
        {ranking ? '排行结果' : '明细结果'}
      </div>
      <table className="min-w-full table-fixed text-xs">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th key={column} className="min-w-28 px-2 py-2 text-left font-medium text-muted-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/60 last:border-0">
              {columns.map((column) => (
                <td key={column} className="max-w-56 break-words px-2 py-2 align-top">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatLimitation(value: string) {
  if (value === 'no_data:ranking') return '当前条件下没有可排行的业务记录';
  if (value === 'no_data:table') return '当前条件下没有匹配的业务明细';
  if (value === 'capability_failed') return '相关能力执行失败，本次没有生成业务结论';
  if (value === 'request_processing') return '请求仍在处理中，当前内容不是最终业务结果';
  if (value === 'request_cancelled') return '请求已取消，本次没有生成新的业务结论';
  return value.replace(/[。；;]+$/u, '');
}
