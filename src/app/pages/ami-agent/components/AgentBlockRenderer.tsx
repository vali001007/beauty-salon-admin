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
  Copy,
  RefreshCw,
  CheckCircle2,
  PackageCheck,
  Truck,
} from 'lucide-react';
import type { AgentPhaseOutput, AuraResponseBlock } from '@/types/agent';

type AgentActionPayload = {
  args?: Record<string, unknown>;
};

interface AgentBlockRendererProps {
  blocks: AuraResponseBlock[];
  onCommand?: (command: string) => void;
  onAction?: (actionId: string, payload?: AgentActionPayload) => void;
}

/**
 * 管理端 AuraResponseBlock 渲染器。
 * 与 Kiosk 的 BlockRenderer 逻辑相同，独立实现以避免跨包依赖。
 */
export function AgentBlockRenderer({ blocks, onCommand, onAction }: AgentBlockRendererProps) {
  const groups = groupKpiCards(orderBlocksForDisplay(blocks));
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
  onAction?: (id: string, payload?: AgentActionPayload) => void;
}) {
  switch (block.kind) {
    case 'text':
      return <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{block.content}</p>;
    case 'table':
      return <TableBlock columns={block.columns} rows={block.rows} sortable={block.sortable} caption={block.caption} />;
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
    case 'opportunity_card':
      return (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground">{block.title}</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">{block.productName}</div>
            </div>
            <div className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
              匹配分 {block.fitScore}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{block.opportunityType}</span>
            {block.sku && <span>SKU {block.sku}</span>}
            {block.marginRateText && <span>毛利 {block.marginRateText}</span>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-foreground">
            {block.currentStock !== undefined && <MetricChip label="当前库存" value={String(block.currentStock)} />}
            {block.salesQuantity !== undefined && <MetricChip label="近30天销量" value={String(block.salesQuantity)} />}
            {block.customerCount !== undefined && <MetricChip label="触达客户" value={String(block.customerCount)} />}
            {block.daysToExpiry !== undefined && block.daysToExpiry !== null && <MetricChip label="临期天数" value={String(block.daysToExpiry)} />}
          </div>
          <div className="mt-2 rounded bg-muted px-2 py-1.5 text-xs text-foreground">{block.reason}</div>
          {block.suggestedCampaign && (
            <div className="mt-2 text-xs text-muted-foreground">建议活动：{block.suggestedCampaign}</div>
          )}
          {block.riskWarnings && block.riskWarnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {block.riskWarnings.slice(0, 3).map((warning, index) => (
                <div key={index} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  {warning}
                </div>
              ))}
            </div>
          )}
          {block.actions && block.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {block.actions.slice(0, 3).map((action) => (
                <button
                  key={action.actionId}
                  type="button"
                  onClick={() => onAction?.(action.actionId)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    case 'activity_draft_card':
      return <ActivityDraftCard block={block} onAction={onAction} />;
    case 'copy_variants':
      return <CopyVariantsBlock block={block} onCommand={onCommand} />;
    case 'inventory_item_card':
      return <InventoryItemCard block={block} onAction={onAction} />;
    case 'supplier_purchase_card':
      return <SupplierPurchaseCard block={block} onAction={onAction} />;
    case 'confirm_action':
    case 'action_card':
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
      return <UnknownBlock block={block} />;
  }
}

// ─── Marketing Blocks ────────────────────────────────────────────────────────

type CopyVariantsBlockData = Extract<AuraResponseBlock, { kind: 'copy_variants' }>;
type ActivityDraftBlockData = Extract<AuraResponseBlock, { kind: 'activity_draft_card' }>;
type InventoryItemBlockData = Extract<AuraResponseBlock, { kind: 'inventory_item_card' }>;
type SupplierPurchaseBlockData = Extract<AuraResponseBlock, { kind: 'supplier_purchase_card' }>;

function CopyVariantsBlock({
  block,
  onCommand,
}: {
  block: CopyVariantsBlockData;
  onCommand?: (command: string) => void;
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (content: string, index: number) => {
    await navigator.clipboard?.writeText(content);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 1600);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{block.title}</div>
          <div className="mt-0.5 text-sm font-medium text-foreground">{block.target}</div>
        </div>
        <div className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{block.offer}</div>
      </div>
      <div className="mt-3 grid gap-2">
        {block.variants.slice(0, 3).map((variant, index) => (
          <div key={`${variant.label}-${index}`} className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-foreground">
                {variant.label}
                {variant.tone && <span className="ml-2 font-normal text-muted-foreground">{variant.tone}</span>}
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(variant.content, index)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
              >
                {copiedIndex === index ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copiedIndex === index ? '已复制' : '复制'}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">{variant.content}</p>
            <button
              type="button"
              onClick={() => onCommand?.(`基于这条话术继续优化：${variant.content}`)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              继续优化
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityDraftCard({
  block,
  onAction,
}: {
  block: ActivityDraftBlockData;
  onAction?: (actionId: string, payload?: AgentActionPayload) => void;
}) {
  const [draft, setDraft] = useState({
    title: block.title,
    targetAudience: block.targetAudience,
    offerSummary: block.offerSummary,
    scheduleHint: block.scheduleHint ?? '建议审批通过后先保存草稿，再由运营确认发送时间',
    copyPreview: block.copyPreview,
  });
  const editable = block.editable !== false;
  const [showAudienceDetails, setShowAudienceDetails] = useState(false);

  const updateDraft = (key: keyof typeof draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const approvePayload = {
    args: {
      title: draft.title,
      targetAudience: draft.targetAudience,
      offerSummary: draft.offerSummary,
      copyPreview: draft.copyPreview,
      scheduleHint: draft.scheduleHint,
    },
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <div className="text-xs text-violet-700">营销活动草稿</div>
      {editable ? (
        <div className="mt-2 grid gap-2">
          <DraftInput label="活动标题" value={draft.title} onChange={(value) => updateDraft('title', value)} />
          <DraftInput label="目标客群" value={draft.targetAudience} onChange={(value) => updateDraft('targetAudience', value)} />
          <DraftInput label="推荐权益" value={draft.offerSummary} onChange={(value) => updateDraft('offerSummary', value)} />
          <DraftInput label="发送时间" value={draft.scheduleHint} onChange={(value) => updateDraft('scheduleHint', value)} />
          <DraftTextArea label="触达话术" value={draft.copyPreview} onChange={(value) => updateDraft('copyPreview', value)} />
        </div>
      ) : (
        <>
          <div className="mt-0.5 text-sm font-medium text-foreground">{draft.title}</div>
          <div className="mt-2 grid gap-2 text-xs text-foreground">
            <MetricChip label="目标客群" value={draft.targetAudience} />
            <MetricChip label="推荐权益" value={draft.offerSummary} />
            {draft.scheduleHint && <MetricChip label="建议时间" value={draft.scheduleHint} />}
          </div>
          <div className="mt-2 rounded border border-violet-100 bg-white/70 px-2 py-1.5 text-xs text-foreground">
            {draft.copyPreview}
          </div>
        </>
      )}
      {block.recommendedItems && block.recommendedItems.length > 0 && (
        <div className="mt-2 space-y-1">
          {block.recommendedItems.slice(0, 3).map((item) => (
            <div key={item.name} className="rounded bg-white/70 px-2 py-1.5 text-xs text-foreground">
              <span className="font-medium">{item.name}</span>
              {item.fitScore !== undefined && <span className="ml-2 text-violet-700">匹配分 {item.fitScore}</span>}
              {item.reason && <div className="mt-0.5 text-muted-foreground">{item.reason}</div>}
            </div>
          ))}
        </div>
      )}
      {block.impactSummary && (
        <div className="mt-2 text-xs text-muted-foreground">{block.impactSummary}</div>
      )}
      {block.offerCostEstimate && block.offerCostEstimate.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {block.offerCostEstimate.slice(0, 3).map((item) => (
            <div key={`${item.label}-${item.value}`} className={`rounded border px-2 py-1.5 ${draftMetricClass(item.tone)}`}>
              <div className="text-[10px] opacity-75">{item.label}</div>
              <div className="mt-0.5 text-xs font-medium">{item.value}</div>
            </div>
          ))}
        </div>
      )}
      {block.audienceDetails && block.audienceDetails.length > 0 && (
        <div className="mt-2 rounded border border-violet-100 bg-white/70">
          <button
            type="button"
            onClick={() => setShowAudienceDetails((value) => !value)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-xs text-foreground hover:bg-violet-50/70"
          >
            <span>客群明细 · {block.audienceDetails.length} 项</span>
            {showAudienceDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showAudienceDetails && (
            <div className="border-t border-violet-100 px-2 py-1.5">
              {block.audienceDetails.slice(0, 5).map((item) => (
                <div key={`${item.label}-${item.value}`} className="py-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="text-violet-700">{item.value}</span>
                  </div>
                  {item.description && <div className="mt-0.5 text-muted-foreground">{item.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {block.actions && block.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {block.actions.map((action) => (
            <button
              key={action.actionId}
              type="button"
              onClick={() => onAction?.(action.actionId, action.actionId.startsWith('approve:') ? approvePayload : undefined)}
              className={
                action.riskLevel === 'medium'
                  ? 'rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-80'
                  : 'rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function draftMetricClass(tone?: 'default' | 'warning' | 'critical' | 'success') {
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (tone === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-violet-100 bg-white/70 text-foreground';
}

function DraftInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] text-violet-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded border border-violet-100 bg-white/80 px-2 text-xs text-foreground outline-none focus:border-violet-300"
      />
    </label>
  );
}

function DraftTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] text-violet-700">{label}</span>
      <textarea
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[76px] resize-y rounded border border-violet-100 bg-white/80 px-2 py-1.5 text-xs leading-relaxed text-foreground outline-none focus:border-violet-300"
      />
    </label>
  );
}

// ─── Inventory Blocks ────────────────────────────────────────────────────────

function InventoryItemCard({
  block,
  onAction,
}: {
  block: InventoryItemBlockData;
  onAction?: (id: string) => void;
}) {
  return (
    <div className={`rounded-lg border bg-card p-3 ${riskBorderClass(block.riskLevel)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <PackageCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{block.title}</div>
            <div className="mt-0.5 truncate text-sm font-medium text-foreground">{block.itemName}</div>
            {block.subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{block.subtitle}</div>}
          </div>
        </div>
        {block.statusLabel && (
          <span className={`flex-shrink-0 rounded-full px-2 py-1 text-xs font-medium ${riskPillClass(block.riskLevel)}`}>
            {block.statusLabel}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {block.metrics.slice(0, 4).map((metric) => (
          <MetricChip key={`${metric.label}-${metric.value}`} label={metric.label} value={metric.value} />
        ))}
      </div>
      {block.reason && <div className="mt-3 rounded bg-muted px-2 py-1.5 text-xs leading-relaxed text-foreground">{block.reason}</div>}
      {block.actions && block.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {block.actions.slice(0, 3).map((action) => (
            <button
              key={action.actionId}
              type="button"
              onClick={() => onAction?.(action.actionId)}
              className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierPurchaseCard({
  block,
  onAction,
}: {
  block: SupplierPurchaseBlockData;
  onAction?: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <Truck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{block.title}</div>
            <div className="mt-0.5 truncate text-sm font-medium text-foreground">{block.productName}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{block.supplierName}</div>
          </div>
        </div>
        {block.statusLabel && (
          <span className="flex-shrink-0 rounded-full bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
            {block.statusLabel}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {block.metrics.slice(0, 4).map((metric) => (
          <MetricChip key={`${metric.label}-${metric.value}`} label={metric.label} value={metric.value} />
        ))}
      </div>
      {block.reason && <div className="mt-3 rounded bg-muted px-2 py-1.5 text-xs leading-relaxed text-foreground">{block.reason}</div>}
      {block.actions && block.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {block.actions.slice(0, 3).map((action) => (
            <button
              key={action.actionId}
              type="button"
              onClick={() => onAction?.(action.actionId)}
              className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function riskBorderClass(level?: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'border-rose-200';
  if (level === 'medium') return 'border-amber-200';
  if (level === 'low') return 'border-emerald-200';
  return 'border-border';
}

function riskPillClass(level?: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'bg-rose-50 text-rose-700';
  if (level === 'medium') return 'bg-amber-50 text-amber-700';
  if (level === 'low') return 'bg-emerald-50 text-emerald-700';
  return 'bg-muted text-muted-foreground';
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
    <div className="rounded-xl border border-border bg-card px-4 py-3" title={hint}>
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

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium text-foreground">{value}</div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function TableBlock({
  columns,
  rows,
  sortable,
  caption,
}: {
  columns: string[];
  rows: string[][];
  sortable?: boolean;
  caption?: string;
}) {
  const [sortState, setSortState] = useState<{ index: number; direction: 'asc' | 'desc' } | null>(null);
  const visibleRows = sortState
    ? [...rows].sort((a, b) => compareTableCells(a[sortState.index], b[sortState.index], sortState.direction))
    : rows;
  const toggleSort = (index: number) => {
    if (!sortable) return;
    setSortState((current) => {
      if (!current || current.index !== index) return { index, direction: 'asc' };
      if (current.direction === 'asc') return { index, direction: 'desc' };
      return null;
    });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(i)}
                    className="inline-flex items-center gap-1 text-left font-medium hover:text-foreground"
                    aria-label={`按${col}排序`}
                  >
                    {col}
                    <span className="text-[10px] text-muted-foreground">
                      {sortState?.index === i ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                ) : (
                  col
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length ? (
            visibleRows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                {columns.map((_, ci) => (
                  <td key={ci} className="px-3 py-2 text-foreground">{row[ci] ?? ''}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-6 text-center text-muted-foreground" colSpan={Math.max(columns.length, 1)}>
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {caption && <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border/50">{caption}</div>}
    </div>
  );
}

export function AgentPhaseOutputRenderer({ phases }: { phases: AgentPhaseOutput[] }) {
  if (!phases.length) return null;
  return (
    <div className="rounded-lg border border-[#7B5CFF]/20 bg-[#7B5CFF]/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#5F46D6]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        分阶段分析
      </div>
      <div className="grid gap-2">
        {phases.slice(0, 4).map((phase, index) => (
          <div key={`${phase.phase}-${index}`} className="rounded-md bg-background/80 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-xs font-medium text-foreground">
                {index + 1}. {phase.title}
              </div>
              {phase.blockKinds && phase.blockKinds.length > 0 && (
                <div className="shrink-0 text-[11px] text-muted-foreground">
                  {phase.blockKinds.slice(0, 3).join(' / ')}
                </div>
              )}
            </div>
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {phase.summary}
            </p>
            {phase.actionLabels && phase.actionLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {phase.actionLabels.slice(0, 3).map((label) => (
                  <span key={label} className="rounded-full bg-[#7B5CFF]/10 px-2 py-0.5 text-[11px] text-[#5F46D6]">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function orderBlocksForDisplay(blocks: AuraResponseBlock[]) {
  return [...blocks].sort((a, b) => blockDisplayPriority(a.kind) - blockDisplayPriority(b.kind));
}

function blockDisplayPriority(kind: AuraResponseBlock['kind']) {
  if (kind === 'text') return 0;
  if (kind === 'alert') return 1;
  if (kind === 'kpi_card') return 2;
  if (kind === 'table' || kind === 'chart' || kind === 'customer_card' || kind === 'opportunity_card' || kind === 'activity_draft_card' || kind === 'copy_variants' || kind === 'inventory_item_card' || kind === 'supplier_purchase_card' || kind === 'document_preview') {
    return 3;
  }
  if (kind === 'evidence_panel') return 4;
  if (kind === 'confirm_action' || kind === 'action_card') return 5;
  if (kind === 'follow_up_chips') return 6;
  return 10;
}

function compareTableCells(a: string | undefined, b: string | undefined, direction: 'asc' | 'desc') {
  const left = String(a ?? '');
  const right = String(b ?? '');
  const leftNumber = parseDisplayNumber(left);
  const rightNumber = parseDisplayNumber(right);
  const result =
    Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber - rightNumber
      : left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function parseDisplayNumber(value: string) {
  const normalized = value.replace(/[¥,%\s,]/g, '');
  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
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
  if (chartType === 'funnel') {
    return <FunnelChartBlock title={title} data={dataArr} valueKey={yKeys[0] ?? 'value'} />;
  }
  if (!dataArr.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
        <div className="flex h-[180px] items-center justify-center rounded bg-muted/30 text-xs text-muted-foreground">暂无图表数据</div>
      </div>
    );
  }
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

function FunnelChartBlock({
  title,
  data,
  valueKey,
}: {
  title: string;
  data: unknown[];
  valueKey: string;
}) {
  const rows = data
    .map((item) => (typeof item === 'object' && item ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const max = Math.max(...rows.map((item) => Number(item[valueKey]) || 0), 1);
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
        <div className="flex h-24 items-center justify-center rounded bg-muted/30 text-xs text-muted-foreground">暂无图表数据</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-2">
        {rows.map((item, index) => {
          const value = Number(item[valueKey]) || 0;
          const width = Math.max(8, Math.round((value / max) * 100));
          const name = String(item.name ?? item.label ?? `阶段${index + 1}`);
          const valueText = String(item.valueText ?? value);
          const rateText = item.rateText ? String(item.rateText) : '';
          return (
            <div key={`${name}-${index}`} className="grid grid-cols-[72px_1fr_70px] items-center gap-2 text-xs">
              <div className="truncate text-muted-foreground">{name}</div>
              <div className="h-7 rounded bg-muted">
                <div
                  className="flex h-7 items-center rounded bg-[#7B5CFF] px-2 text-[11px] font-medium text-white transition-all"
                  style={{ width: `${width}%` }}
                >
                  {valueText}
                </div>
              </div>
              <div className="text-right text-muted-foreground">{rateText}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UnknownBlock({ block }: { block: unknown }) {
  const kind = typeof block === 'object' && block && 'kind' in block ? String((block as { kind?: unknown }).kind) : 'unknown';
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
      暂不支持的内容类型：{kind}
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
