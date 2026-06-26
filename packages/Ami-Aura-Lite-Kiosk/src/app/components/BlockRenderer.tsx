import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { AuraResponseBlock, AuraBlockAction } from '../types';
import { KpiCard, KpiCardGroup } from './KpiCard';
import { FollowUpChips } from './FollowUpChips';

interface BlockRendererProps {
  blocks: AuraResponseBlock[];
  onCommand?: (command: string, source?: 'text') => void;
  onAction?: (actionId: string) => void;
  // 流式输出是否结束，用于控制 follow_up_chips 出现时机
  streamComplete?: boolean;
}

/**
 * 按 AuraResponseBlock.kind 分发渲染，AI 内容与 UI 解耦。
 * - text → 纯文字段落
 * - kpi_card → KpiCard 指标卡
 * - table → 数据表格
 * - chart → Recharts 图表
 * - customer_card → 客户摘要卡
 * - confirm_action → 操作确认卡（草稿/审批）
 * - alert → 风险/告警横幅
 * - follow_up_chips → 关联问题推荐
 * - document_preview → 文档预览
 * - evidence_panel → 数据来源面板
 */
export function BlockRenderer({ blocks, onCommand, onAction, streamComplete = true }: BlockRendererProps) {
  // 将连续的 kpi_card 合并渲染为一组
  const groups = groupKpiCards(blocks);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, i) => {
        if (group.type === 'kpi_group') {
          return (
            <KpiCardGroup
              key={i}
              cards={group.items.map((b) => ({
                label: b.label,
                value: b.value,
                delta: b.delta,
                deltaType: b.deltaType,
                unit: b.unit,
                hint: b.hint,
              }))}
              cols={group.items.length >= 3 ? 3 : 2}
            />
          );
        }
        const block = group.block!;
        return <SingleBlock key={i} block={block} onCommand={onCommand} onAction={onAction} streamComplete={streamComplete} />;
      })}
    </div>
  );
}

function SingleBlock({
  block,
  onCommand,
  onAction,
  streamComplete,
}: {
  block: AuraResponseBlock;
  onCommand?: (command: string) => void;
  onAction?: (actionId: string) => void;
  streamComplete?: boolean;
}) {
  switch (block.kind) {
    case 'text':
      return <TextBlock content={block.content} />;
    case 'table':
      return <TableBlock columns={block.columns} rows={block.rows} caption={block.caption} />;
    case 'chart':
      return <ChartBlock chartType={block.chartType} title={block.title} data={block.data} xKey={block.xKey} yKeys={block.yKeys} />;
    case 'customer_card':
      return <CustomerCardBlock block={block} onAction={onAction} />;
    case 'confirm_action':
      return <ConfirmActionBlock block={block} onAction={onAction} />;
    case 'alert':
      return <AlertBlock level={block.level} message={block.message} actionId={block.actionId} onAction={onAction} />;
    case 'follow_up_chips':
      return (
        <FollowUpChips
          suggestions={block.suggestions}
          onSelect={(s) => onCommand?.(s)}
          visible={streamComplete}
        />
      );
    case 'document_preview':
      return <DocumentPreviewBlock title={block.title} content={block.content} downloadable={block.downloadable} />;
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

// ─── Text ─────────────────────────────────────────────────────────────────────

function TextBlock({ content }: { content: string }) {
  return (
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{content}</p>
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
              <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border/50">{caption}</div>
      )}
    </div>
  );
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#C9956C', '#2D1B69', '#10b981', '#f59e0b', '#6366f1'];

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
  const dataArray = Array.isArray(data) ? data : [];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <ResponsiveContainer width="100%" height={180}>
        {chartType === 'pie' ? (
          <PieChart>
            <Pie data={dataArray} dataKey={yKeys[0]} nameKey={xKey} cx="50%" cy="50%" outerRadius={70}>
              {dataArray.map((_: unknown, i: number) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : chartType === 'bar' ? (
          <BarChart data={dataArray} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        ) : (
          // line (default)
          <LineChart data={dataArray} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── CustomerCard ─────────────────────────────────────────────────────────────

function CustomerCardBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'customer_card' }>;
  onAction?: (actionId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{block.name}</span>
            {block.vipLevel && (
              <span className="rounded bg-[#C9956C]/10 px-1.5 py-0.5 text-xs text-[#C9956C]">{block.vipLevel}</span>
            )}
          </div>
          {block.lastVisit && (
            <div className="mt-0.5 text-xs text-muted-foreground">最近到店：{block.lastVisit}</div>
          )}
        </div>
      </div>
      {block.suggestion && (
        <div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-foreground">
          {block.suggestion}
        </div>
      )}
      {block.actions && block.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {block.actions.map((action) => (
            <ActionButton key={action.actionId} action={action} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ConfirmAction ────────────────────────────────────────────────────────────

function ConfirmActionBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'confirm_action' }>;
  onAction?: (actionId: string) => void;
}) {
  const riskColors = {
    low: 'border-blue-200 bg-blue-50/50',
    medium: 'border-amber-200 bg-amber-50/50',
    high: 'border-rose-200 bg-rose-50/50',
  };

  return (
    <div className={`rounded-lg border p-3 ${riskColors[block.riskLevel]}`}>
      <div className="mb-2 font-medium text-sm text-foreground">{block.title}</div>
      <div className="mb-2 text-xs text-muted-foreground leading-relaxed">{block.preview}</div>
      {block.impactSummary && (
        <div className="mb-2 text-xs text-foreground/70">{block.impactSummary}</div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAction?.(block.actionId)}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:opacity-80"
        >
          确认执行
        </button>
        <button
          type="button"
          onClick={() => onAction?.(`${block.actionId}:cancel`)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          取消
        </button>
      </div>
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
  onAction?: (actionId: string) => void;
}) {
  const styles = {
    warning: { bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-500', text: 'text-amber-900' },
    critical: { bg: 'bg-rose-50 border-rose-200', icon: AlertCircle, iconColor: 'text-rose-500', text: 'text-rose-900' },
    info: { bg: 'bg-blue-50 border-blue-200', icon: Info, iconColor: 'text-blue-500', text: 'text-blue-900' },
  }[level];

  const Icon = styles.icon;

  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 ${styles.bg}`}>
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${styles.iconColor}`} />
      <div className="flex-1">
        <p className={`text-xs leading-relaxed ${styles.text}`}>{message}</p>
        {actionId && (
          <button
            type="button"
            onClick={() => onAction?.(actionId)}
            className={`mt-1.5 text-xs font-medium underline ${styles.text} opacity-70 hover:opacity-100`}
          >
            处理
          </button>
        )}
      </div>
    </div>
  );
}

// ─── DocumentPreview ──────────────────────────────────────────────────────────

function DocumentPreviewBlock({
  title,
  content,
  downloadable,
}: {
  title: string;
  content: string;
  downloadable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.slice(0, 200);
  const isLong = content.length > 200;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <div className="flex items-center gap-2">
          {downloadable && (
            <button type="button" className="text-muted-foreground hover:text-foreground">
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="p-3">
        <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
          {expanded ? content : preview}
          {isLong && !expanded && '…'}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
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
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <span>数据来源 · {sources.join('、')}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1">
          {dateRange && (
            <div className="text-xs text-muted-foreground">统计区间：{dateRange}</div>
          )}
          <div className="text-xs text-muted-foreground">口径说明：{metricDefinition}</div>
          {limitations && limitations.length > 0 && (
            <div className="text-xs text-muted-foreground">
              注意：{limitations.join('；')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({ action, onAction }: { action: AuraBlockAction; onAction?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAction?.(action.actionId)}
      className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
    >
      {action.label}
    </button>
  );
}

// ─── kpi_card 连续分组工具 ────────────────────────────────────────────────────

type BlockGroup =
  | { type: 'kpi_group'; items: Array<Extract<AuraResponseBlock, { kind: 'kpi_card' }>> }
  | { type: 'single'; block: AuraResponseBlock };

function groupKpiCards(blocks: AuraResponseBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let kpiBuffer: Array<Extract<AuraResponseBlock, { kind: 'kpi_card' }>> = [];

  function flushKpi() {
    if (kpiBuffer.length > 0) {
      groups.push({ type: 'kpi_group', items: [...kpiBuffer] });
      kpiBuffer = [];
    }
  }

  for (const block of blocks) {
    if (block.kind === 'kpi_card') {
      kpiBuffer.push(block);
    } else {
      flushKpi();
      groups.push({ type: 'single', block });
    }
  }
  flushKpi();

  return groups;
}
