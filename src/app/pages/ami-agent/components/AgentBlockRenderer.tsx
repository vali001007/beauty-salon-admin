import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import type { AuraResponseBlock } from '@/types/agent';

interface AgentBlockRendererProps {
  blocks: AuraResponseBlock[];
  onCommand?: (command: string) => void;
  onAction?: (actionId: string) => void;
}

/**
 * 管理端 AuraResponseBlock 渲染器。
 * 与 Kiosk 的 BlockRenderer 逻辑相同，独立实现以避免跨包依赖。
 */
export function AgentBlockRenderer({ blocks, onCommand, onAction }: AgentBlockRendererProps) {
  const groups = groupKpiCards(blocks);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, i) => {
        if (group.type === 'kpi_group') {
          const cols = group.items.length >= 3 ? 3 : 2;
          const gridClass = cols === 3 ? 'grid-cols-3' : 'grid-cols-2';
          return (
            <div key={i} className={`grid gap-2 ${gridClass}`}>
              {group.items.map((b, j) => (
                <KpiCard key={j} {...b} />
              ))}
            </div>
          );
        }
        return (
          <SingleBlock key={i} block={group.block!} onCommand={onCommand} onAction={onAction} />
        );
      })}
    </div>
  );
}

function SingleBlock({
  block,
  onCommand,
  onAction,
}: {
  block: AuraResponseBlock;
  onCommand?: (s: string) => void;
  onAction?: (id: string) => void;
}) {
  switch (block.kind) {
    case 'text':
      return <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{block.content}</p>;
    case 'table':
      return <TableBlock columns={block.columns} rows={block.rows} caption={block.caption} />;
    case 'chart':
      return <ChartBlock chartType={block.chartType} title={block.title} data={block.data} xKey={block.xKey} yKeys={block.yKeys} />;
    case 'customer_card':
      return (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{block.name}</span>
            {block.vipLevel && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{block.vipLevel}</span>
            )}
          </div>
          {block.lastVisit && <div className="mt-0.5 text-xs text-muted-foreground">最近到店：{block.lastVisit}</div>}
          {block.suggestion && (
            <div className="mt-2 rounded bg-muted px-2 py-1.5 text-xs text-foreground">{block.suggestion}</div>
          )}
        </div>
      );
    case 'confirm_action':
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="mb-1 font-medium text-sm text-foreground">{block.title}</div>
          <div className="mb-2 text-xs text-muted-foreground">{block.preview}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAction?.(block.actionId)}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-80"
            >
              确认执行
            </button>
            <button
              type="button"
              onClick={() => onAction?.(`${block.actionId}:cancel`)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              取消
            </button>
          </div>
        </div>
      );
    case 'alert':
      return <AlertBlock level={block.level} message={block.message} onAction={onAction} actionId={block.actionId} />;
    case 'follow_up_chips':
      return (
        <div className="flex flex-wrap gap-2">
          {block.suggestions.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onCommand?.(s)}
              className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      );
    case 'document_preview':
      return <DocumentBlock title={block.title} content={block.content} />;
    case 'evidence_panel':
      return (
        <EvidencePanel
          sources={block.sources}
          dateRange={block.dateRange}
          metricDefinition={block.metricDefinition}
          limitations={block.limitations}
        />
      );
    default:
      return null;
  }
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  delta,
  deltaType,
  unit,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaType?: 'up' | 'down' | 'neutral';
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-end gap-1">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        {unit && <span className="mb-0.5 text-xs text-muted-foreground">{unit}</span>}
      </div>
      {delta && (
        <div className="mt-1 flex items-center gap-0.5">
          {deltaType === 'up' && <TrendingUp className="h-3 w-3 text-emerald-600" />}
          {deltaType === 'down' && <TrendingDown className="h-3 w-3 text-rose-500" />}
          {(!deltaType || deltaType === 'neutral') && <Minus className="h-3 w-3 text-muted-foreground" />}
          <span className={`text-xs font-medium ${deltaType === 'up' ? 'text-emerald-600' : deltaType === 'down' ? 'text-rose-500' : 'text-muted-foreground'}`}>
            {delta}
          </span>
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function TableBlock({ columns, rows, caption }: { columns: string[]; rows: string[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border/50">{caption}</div>}
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const COLORS = ['#7B5CFF', '#C9956C', '#10b981', '#f59e0b', '#6366f1'];

function ChartBlock({
  chartType,
  title,
  data,
  xKey = 'name',
  yKeys = ['value'],
}: {
  chartType: 'line' | 'bar' | 'pie' | 'funnel';
  title: string;
  data: unknown;
  xKey?: string;
  yKeys?: string[];
}) {
  const dataArr = Array.isArray(data) ? data : [];
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <ResponsiveContainer width="100%" height={180}>
        {chartType === 'pie' ? (
          <PieChart>
            <Pie data={dataArr} dataKey={yKeys[0]} nameKey={xKey} cx="50%" cy="50%" outerRadius={70}>
              {dataArr.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : chartType === 'bar' ? (
          <BarChart data={dataArr} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            {yKeys.map((k, i) => <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} />)}
          </BarChart>
        ) : (
          <LineChart data={dataArr} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            {yKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────

function AlertBlock({
  level,
  message,
  actionId,
  onAction,
}: {
  level: 'warning' | 'critical' | 'info';
  message: string;
  actionId?: string;
  onAction?: (id: string) => void;
}) {
  const s = {
    warning: { bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, ic: 'text-amber-500', tx: 'text-amber-900' },
    critical: { bg: 'bg-rose-50 border-rose-200', icon: AlertCircle, ic: 'text-rose-500', tx: 'text-rose-900' },
    info: { bg: 'bg-blue-50 border-blue-200', icon: Info, ic: 'text-blue-500', tx: 'text-blue-900' },
  }[level];
  const Icon = s.icon;
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 ${s.bg}`}>
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${s.ic}`} />
      <p className={`text-xs leading-relaxed ${s.tx}`}>{message}</p>
      {actionId && (
        <button type="button" onClick={() => onAction?.(actionId)} className={`text-xs underline ${s.tx} opacity-70 hover:opacity-100 ml-auto`}>
          处理
        </button>
      )}
    </div>
  );
}

// ─── DocumentBlock ────────────────────────────────────────────────────────────

function DocumentBlock({ title, content }: { title: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 200);
  const isLong = content.length > 200;
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border/50 text-xs font-medium text-foreground">{title}</div>
      <div className="p-3">
        <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
          {expanded ? content : preview}{isLong && !expanded ? '…' : ''}
        </p>
        {isLong && (
          <button type="button" onClick={() => setExpanded(!expanded)} className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? '收起' : '展开全文'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── EvidencePanel ────────────────────────────────────────────────────────────

function EvidencePanel({
  sources,
  dateRange,
  metricDefinition,
  limitations,
}: {
  sources: string[];
  dateRange?: string;
  metricDefinition: string;
  limitations?: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        <span>数据来源 · {sources.join('、')}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1">
          {dateRange && <div className="text-xs text-muted-foreground">统计区间：{dateRange}</div>}
          <div className="text-xs text-muted-foreground">口径：{metricDefinition}</div>
          {limitations?.length && <div className="text-xs text-muted-foreground">注意：{limitations.join('；')}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Grouping util ────────────────────────────────────────────────────────────

type BlockGroup =
  | { type: 'kpi_group'; items: Array<Extract<AuraResponseBlock, { kind: 'kpi_card' }>> }
  | { type: 'single'; block: AuraResponseBlock };

function groupKpiCards(blocks: AuraResponseBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let buf: Array<Extract<AuraResponseBlock, { kind: 'kpi_card' }>> = [];
  const flush = () => {
    if (buf.length > 0) { groups.push({ type: 'kpi_group', items: [...buf] }); buf = []; }
  };
  for (const block of blocks) {
    if (block.kind === 'kpi_card') { buf.push(block); }
    else { flush(); groups.push({ type: 'single', block }); }
  }
  flush();
  return groups;
}
