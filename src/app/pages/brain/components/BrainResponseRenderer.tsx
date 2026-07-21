import { AlertTriangle, CheckCircle2, Database, HelpCircle, ListOrdered } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BrainResponseBlock } from '@/types/brain';

interface BrainResponseRendererProps {
  blocks?: BrainResponseBlock[];
  fallback: string;
  onClarificationSelect?: (value: unknown, label: string) => void;
}

export function BrainResponseRenderer({ blocks = [], fallback, onClarificationSelect }: BrainResponseRendererProps) {
  if (!blocks.length) return <span className="whitespace-pre-wrap break-words">{fallback}</span>;

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.kind === 'text') return <p key={index} className="whitespace-pre-wrap break-words">{block.text}</p>;
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
                <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
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
                <div key={`${finding.title}:${finding.detail}`} className="flex gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${finding.severity === 'critical' ? 'text-destructive' : 'text-amber-600'}`} />
                  <div><div className="font-medium">{finding.title}</div><div className="text-muted-foreground">{finding.detail}</div></div>
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
                <div>{block.question}</div>
                {block.options.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {block.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          onClarificationSelect?.(option.value, option.label);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        }
        if (block.kind === 'action_preview') {
          return <div key={index} className="flex gap-2 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>已生成 {block.actions.length} 个待确认动作预览</span></div>;
        }
        if (block.kind === 'limitations') {
          return <div key={index} className="flex gap-2 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>未完成：{block.items.join('；')}</span></div>;
        }
        if (block.kind === 'evidence') {
          return <div key={index} className="flex gap-2 text-xs text-muted-foreground"><Database className="h-4 w-4 shrink-0" /><span>{block.citations.length} 条可追溯证据</span></div>;
        }
        if (block.kind === 'chart') {
          return <BrainChart key={index} block={block} />;
        }
        return <span key={index} className="whitespace-pre-wrap break-words">{fallback}</span>;
      })}
    </div>
  );
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

function DataTable({ block, ranking }: { block: Extract<BrainResponseBlock, { kind: 'ranking' | 'table' }>; ranking: boolean }) {
  const columns = block.columns.length ? block.columns : Object.keys(block.rows[0] ?? {});
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {ranking ? <ListOrdered className="h-4 w-4" /> : null}
        {ranking ? '排行结果' : '明细结果'}
      </div>
      <table className="min-w-full table-fixed text-xs">
        <thead><tr className="border-b border-border">{columns.map((column) => <th key={column} className="min-w-28 px-2 py-2 text-left font-medium text-muted-foreground">{column}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-border/60 last:border-0">{columns.map((column) => <td key={column} className="max-w-56 break-words px-2 py-2 align-top">{formatCell(row[column])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
