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
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, Download, Copy, ExternalLink, QrCode, CheckCircle2 } from 'lucide-react';
import type { AuraResponseBlock, AuraBlockAction, MetricTone } from '@ami/agent-core';
import { groupBlocksForDisplay } from '@ami/agent-core';
import { KpiCard, KpiCardGroup } from './KpiCard';
import { FollowUpChips } from './FollowUpChips';

interface BlockRendererProps {
  blocks: AuraResponseBlock[];
  onCommand?: (command: string, source?: 'text') => void;
  onAction?: (actionId: string, label?: string) => void;
  // 流式输出是否结束，用于控制 follow_up_chips 出现时机
  streamComplete?: boolean;
}

const TABLE_COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  customerId: '客户ID',
  customerName: '客户',
  phone: '手机号',
  phoneMasked: '手机号',
  memberLevel: '会员等级',
  totalSpent: '累计消费',
  visitCount: '到店次数',
  lastVisitDate: '最近到店',
  lastOrderTimeText: '最近消费',
  paidAmount: '消费金额',
  paidAmountText: '消费金额',
  amount: '金额',
  totalAmount: '订单金额',
  revenue: '实收金额',
  refundAmount: '退款金额',
  netAmount: '净额',
  payMethod: '支付方式',
  paymentMethod: '支付方式',
  orderCount: '订单数',
  customerCount: '客户数',
  salesAmount: '销售额',
  salesAmountText: '销售额',
  averageOrderValue: '客单价',
  quantity: '数量',
  growthRate: '增长率',
  growthRateText: '增长',
  productName: '商品',
  projectName: '项目',
  cardName: '卡项',
  activityId: '活动ID',
  activityName: '活动名称',
  campaignId: '活动ID',
  campaignName: '活动名称',
  publishStatus: '发布状态',
  activityDateRange: '活动时间',
  targetCustomers: '目标客户',
  offer: '活动权益',
  participants: '参与人数',
  conversion: '转化率',
  pageCount: '推广页数',
  linkCount: '链接数',
  publishedAt: '发布时间',
  updatedAt: '更新时间',
  beauticianId: '员工ID',
  beauticianName: '员工姓名',
  levelName: '等级',
  status: '状态',
  performanceScore: '表现分',
  performanceLevel: '表现等级',
  serviceCount: '服务次数',
  completedTaskCount: '完成任务',
  cardUsageTimes: '核销次数',
  commissionAmount: '提成',
  completionRate: '完成率',
  completionRateText: '完成率',
  reservationCount: '预约数',
  completedReservationCount: '完成预约',
  utilizationRateText: '占用率',
  availableCount: '空闲时段',
  busyCount: '忙碌时段',
  leaveCount: '请假时段',
  reason: '原因',
  suggestion: '建议',
  severity: '风险等级',
  title: '标题',
  metricValue: '当前值',
  threshold: '阈值',
  groupName: '分群',
  segmentName: '分群',
  customerSegment: '客户分群',
  priority: '优先级',
  priorityLevel: '优先级',
  action: '动作',
  suggestedAction: '建议动作',
  recommendation: '建议',
  orderId: '订单ID',
  orderNo: '订单号',
  checkoutGroupNo: '收银组号',
  transactionType: '交易类型',
  itemSummary: '项目/商品',
  paymentCount: '支付记录',
  refundCount: '退款记录',
  createdAt: '创建时间',
  printable: '可打印',
  batchId: '批次ID',
  batchNo: '批次号',
  sku: 'SKU',
  stock: '批次数量',
  unit: '单位',
  productionDate: '生产日期',
  expiryDate: '有效期',
  daysToExpire: '剩余天数',
  currentStock: '当前库存',
  safetyStock: '安全库存',
};

const TABLE_CELL_VALUE_LABELS: Record<string, Record<string, string>> = {
  payMethod: {
    wechat: '微信',
    alipay: '支付宝',
    card: '会员卡余额',
    balance: '会员卡余额',
    cash: '现金',
    bank: '银行卡',
    bank_card: '银行卡',
    mixed: '组合支付',
  },
  paymentMethod: {
    wechat: '微信',
    alipay: '支付宝',
    card: '会员卡余额',
    balance: '会员卡余额',
    cash: '现金',
    bank: '银行卡',
    bank_card: '银行卡',
    mixed: '组合支付',
  },
  status: {
    active: '启用',
    inactive: '停用',
    enabled: '启用',
    disabled: '停用',
    pending: '待处理',
    completed: '已完成',
    cancelled: '已取消',
    refunded: '已退款',
  },
};

const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  ProductOrder: '订单',
  OrderItem: '订单明细',
  PaymentRecord: '收款记录',
  RefundRecord: '退款记录',
  Customer: '客户',
  CustomerCard: '会员卡',
  CardUsageRecord: '次卡核销',
  CustomerBalanceTransaction: '会员卡余额流水',
  CommissionRecord: '提成记录',
  StockMovement: '库存流水',
};

/**
 * 按 AuraResponseBlock.kind 分发渲染，AI 内容与 UI 解耦。
 * - summary_text → 核心结论摘要
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
  const groups = groupBlocksForDisplay(blocks);

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
  onAction?: (actionId: string, label?: string) => void;
  streamComplete?: boolean;
}) {
  switch (block.kind) {
    case 'summary_text':
      return <SummaryTextBlock title={block.title} content={block.content} />;
    case 'text':
      return <TextBlock content={block.content} />;
    case 'table':
      return <TableBlock columns={block.columns} rows={block.rows} caption={block.caption} />;
    case 'chart':
      return <ChartBlock chartType={block.chartType} title={block.title} data={block.data} xKey={block.xKey} yKeys={block.yKeys} />;
    case 'entity_resolution_badge':
      return <EntityResolutionBadge block={block} />;
    case 'capability_trace':
      return <CapabilityTraceBlock block={block} />;
    case 'link_card':
      return <LinkCardBlock block={block} onAction={onAction} />;
    case 'customer_card':
      return <CustomerCardBlock block={block} onAction={onAction} />;
    case 'opportunity_card':
      return <OpportunityCardBlock block={block} onAction={onAction} />;
    case 'copy_variants':
      return <CopyVariantsBlock block={block} onAction={onAction} />;
    case 'activity_draft_card':
      return <ActivityDraftCardBlock block={block} onAction={onAction} />;
    case 'inventory_item_card':
      return <InventoryItemCardBlock block={block} onAction={onAction} />;
    case 'supplier_purchase_card':
      return <SupplierPurchaseCardBlock block={block} onAction={onAction} />;
    case 'clarification_card':
      return <ClarificationCardBlock block={block} onCommand={onCommand} onAction={onAction} />;
    case 'confirm_action':
      return <ConfirmActionBlock block={block} onAction={onAction} />;
    case 'action_card':
      return <ActionCardBlock block={block} onAction={onAction} />;
    case 'alert':
      return <AlertBlock level={block.level} message={block.message} actionId={block.actionId} onAction={onAction} />;
    case 'data_gap':
      return <DataGapBlock block={block} />;
    case 'permission_notice':
      return <PermissionNoticeBlock block={block} onAction={onAction} />;
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

// ─── Marketing / Inventory Cards ─────────────────────────────────────────────

function EntityResolutionBadge({ block }: { block: Extract<AuraResponseBlock, { kind: 'entity_resolution_badge' }> }) {
  const confidence = typeof block.confidence === 'number' ? `${Math.round(block.confidence * 100)}%` : '';
  return (
    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs text-violet-800">
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>{block.label ?? '已识别业务对象'}</span>
      <span className="font-medium">{block.objectType} · {block.entityName}</span>
      {confidence ? <span className="text-violet-500">{confidence}</span> : null}
    </div>
  );
}

function CapabilityTraceBlock({ block }: { block: Extract<AuraResponseBlock, { kind: 'capability_trace' }> }) {
  const entityText = block.entity?.entityName
    ? `${block.entity.objectType ?? '实体'} · ${block.entity.entityName}`
    : '未绑定实体';
  const confidence = typeof block.confidence === 'number' ? `${Math.round(block.confidence * 100)}%` : '';
  return (
    <details className="rounded-lg border border-[#7B5CFF]/20 bg-[#7B5CFF]/5 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-[#4F39C8]">{block.title ?? '能力命中调试'}</summary>
      <div className="mt-2 grid gap-1.5 text-[#31295F]">
        {block.capabilityId ? <div>能力：{block.capabilityId}</div> : null}
        {block.queryTemplateId ? <div>模板：{block.queryTemplateId}</div> : null}
        {block.action ? <div>动作：{block.action}</div> : null}
        {block.executionPath ? <div>路径：{block.executionPath}</div> : null}
        {confidence ? <div>置信度：{confidence}</div> : null}
        <div>实体：{entityText}</div>
        {block.schemaPath?.length ? <div>Schema Path：{block.schemaPath.join(' → ')}</div> : null}
        {block.fallbackReason ? <div>Fallback：{block.fallbackReason}</div> : null}
      </div>
    </details>
  );
}

function LinkCardBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'link_card' }>;
  onAction?: (actionId: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const links = block.links?.length
    ? block.links
    : [
        block.primaryUrl ? { label: '活动链接', value: block.primaryUrl, type: 'url' as const } : null,
        block.miniappPath ? { label: '小程序路径', value: block.miniappPath, type: 'miniapp_path' as const } : null,
        block.qrCodeUrl ? { label: '二维码', value: block.qrCodeUrl, type: 'qr_code' as const } : null,
      ].filter(Boolean) as NonNullable<typeof block.links>;

  const copyValue = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopied(value);
    window.setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-violet-700">营销活动链接</div>
          <div className="mt-0.5 text-sm font-semibold text-foreground">{block.title}</div>
          {block.description ? <div className="mt-1 text-xs text-muted-foreground">{block.description}</div> : null}
        </div>
        {block.statusLabel ? <div className="rounded-full bg-white px-2 py-1 text-xs text-violet-700">{block.statusLabel}</div> : null}
      </div>
      <div className="mt-3 grid gap-2">
        {links.map((link) => (
          <div key={`${link.label}-${link.value}`} className="rounded-lg border border-violet-100 bg-white/80 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-violet-800">
              {link.type === 'qr_code' ? <QrCode className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
              {link.label}
            </div>
            <div className="break-all text-xs text-foreground">{link.value}</div>
            <button
              type="button"
              onClick={() => void copyValue(link.value)}
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-violet-100 px-2 py-1 text-xs text-violet-800 hover:bg-violet-100"
            >
              {copied === link.value ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied === link.value ? '已复制' : '复制'}
            </button>
          </div>
        ))}
      </div>
      {block.actions?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {block.actions.slice(0, 3).map((action) => (
            <ActionButton key={action.actionId} action={action} onAction={onAction} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DataGapBlock({ block }: { block: Extract<AuraResponseBlock, { kind: 'data_gap' }> }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
      <div className="text-sm font-semibold text-amber-900">{block.title}</div>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">{block.message}</p>
      {block.missingData.length ? (
        <div className="mt-2 text-xs text-amber-800">缺少数据：{block.missingData.join('、')}</div>
      ) : null}
      {block.nextSteps?.length ? (
        <div className="mt-2 grid gap-1">
          {block.nextSteps.slice(0, 3).map((step) => (
            <div key={step} className="rounded-lg bg-white/70 px-2 py-1 text-xs text-amber-900">{step}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PermissionNoticeBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'permission_notice' }>;
  onAction?: (actionId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
      <div className="text-sm font-semibold text-blue-950">{block.title}</div>
      <p className="mt-1 text-xs leading-relaxed text-blue-900">{block.message}</p>
      {block.allowedSummary ? <div className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-xs text-blue-900">{block.allowedSummary}</div> : null}
      {block.actions?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {block.actions.slice(0, 3).map((action) => (
            <ActionButton key={action.actionId} action={action} onAction={onAction} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: MetricTone }) {
  const toneClass: Record<MetricTone, string> = {
    default: 'bg-[#F7F5F2] text-[#1F1B2D]',
    warning: 'bg-amber-50 text-amber-800',
    critical: 'bg-rose-50 text-rose-700',
    success: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <div className={`rounded-lg px-2.5 py-2 ${toneClass[tone] ?? toneClass.default}`}>
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="mt-0.5 text-xs font-semibold">{value}</div>
    </div>
  );
}
function ActionRow({ actions, onAction }: { actions?: AuraBlockAction[]; onAction?: (actionId: string, label?: string) => void }) {
  if (!actions?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <ActionButton key={action.actionId} action={action} onAction={onAction} />
      ))}
    </div>
  );
}

function OpportunityCardBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'opportunity_card' }>;
  onAction?: (actionId: string) => void;
}) {
  const metrics = [
    block.fitScore ? { label: '匹配度', value: `${Math.round(block.fitScore * 100)}%`, tone: 'success' as MetricTone } : null,
    typeof block.currentStock === 'number' ? { label: '当前库存', value: String(block.currentStock) } : null,
    typeof block.salesAmount === 'number' ? { label: '销售额', value: `¥${block.salesAmount.toLocaleString()}` } : null,
    typeof block.customerCount === 'number' ? { label: '客户数', value: String(block.customerCount) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; tone?: MetricTone }>;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold text-foreground">{block.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{block.productName}{block.sku ? ` · ${block.sku}` : ''}</div>
      <p className="mt-2 text-xs leading-relaxed text-foreground">{block.summary || block.reason}</p>
      {metrics.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {metrics.map((metric) => <MetricPill key={metric.label} {...metric} />)}
        </div>
      ) : null}
      {block.suggestedCampaign ? <p className="mt-2 text-xs text-[#6F6678]">建议活动：{block.suggestedCampaign}</p> : null}
      {block.riskWarnings?.length ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-800">
          {block.riskWarnings.join('；')}
        </div>
      ) : null}
      <ActionRow actions={block.actions} onAction={onAction} />
    </div>
  );
}

function CopyVariantsBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'copy_variants' }>;
  onAction?: (actionId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold text-foreground">{block.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{block.target} · {block.offer}</div>
      <div className="mt-3 grid gap-2">
        {block.variants.slice(0, 3).map((variant) => (
          <div key={variant.label} className="rounded-lg bg-[#F7F5F2] px-3 py-2">
            <div className="text-xs font-medium text-[#6F6678]">{variant.label}{variant.tone ? ` · ${variant.tone}` : ''}</div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[#1F1B2D]">{variant.content}</p>
          </div>
        ))}
      </div>
      <ActionRow actions={block.actions} onAction={onAction} />
    </div>
  );
}

function ActivityDraftCardBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'activity_draft_card' }>;
  onAction?: (actionId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{block.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">目标客群：{block.targetAudience}</div>
        </div>
        {block.editable ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">可编辑</span> : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground">{block.offerSummary}</p>
      <div className="mt-2 rounded-lg bg-[#F7F5F2] px-3 py-2 text-xs leading-relaxed text-[#1F1B2D]">
        {block.copyPreview}
      </div>
      {block.offerCostEstimate?.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {block.offerCostEstimate.map((metric) => <MetricPill key={metric.label} {...metric} />)}
        </div>
      ) : null}
      {block.impactSummary ? <p className="mt-2 text-xs text-[#6F6678]">{block.impactSummary}</p> : null}
      <ActionRow actions={block.actions} onAction={onAction} />
    </div>
  );
}

function InventoryItemCardBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'inventory_item_card' }>;
  onAction?: (actionId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{block.itemName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{block.title}{block.subtitle ? ` · ${block.subtitle}` : ''}</div>
        </div>
        {block.statusLabel ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">{block.statusLabel}</span> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {block.metrics.map((metric) => <MetricPill key={metric.label} {...metric} />)}
      </div>
      {block.reason ? <p className="mt-2 text-xs leading-relaxed text-[#6F6678]">{block.reason}</p> : null}
      <ActionRow actions={block.actions} onAction={onAction} />
    </div>
  );
}

function SupplierPurchaseCardBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'supplier_purchase_card' }>;
  onAction?: (actionId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{block.productName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{block.title} · {block.supplierName}</div>
        </div>
        {block.statusLabel ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{block.statusLabel}</span> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {block.metrics.map((metric) => <MetricPill key={metric.label} {...metric} />)}
      </div>
      {block.reason ? <p className="mt-2 text-xs leading-relaxed text-[#6F6678]">{block.reason}</p> : null}
      <ActionRow actions={block.actions} onAction={onAction} />
    </div>
  );
}

// ─── Text ─────────────────────────────────────────────────────────────────────

function SummaryTextBlock({ title, content }: { title?: string; content: string }) {
  return (
    <div className="rounded-lg border border-[#2D1B69]/10 bg-[#F7F5F2] px-3 py-2.5">
      {title ? <div className="mb-1 text-xs font-semibold text-[#2D1B69]">{title}</div> : null}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1F1B2D]">{content}</p>
    </div>
  );
}

function TextBlock({ content }: { content: string }) {
  return (
    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{content}</p>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function TableBlock({ columns, rows, caption }: { columns: string[]; rows: string[][]; caption?: string }) {
  const visibleColumns = normalizeTableColumns(columns, rows);
  const sourceColumns = normalizeTableSourceColumns(columns, rows);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {visibleColumns.map((col, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
              {visibleColumns.map((_, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground">
                  {formatTableCellValue(sourceColumns[ci], row[ci])}
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

function normalizeTableSourceColumns(columns: string[], rows: string[][]) {
  const maxRowLength = Math.max(0, ...rows.map((row) => row.length));
  const source = columns.length ? columns : Array.from({ length: maxRowLength }, (_, index) => String(index));
  return source.map((column) => String(column ?? '').trim());
}

function normalizeTableColumns(columns: string[], rows: string[][]) {
  const maxRowLength = Math.max(0, ...rows.map((row) => row.length));
  const source = columns.length ? columns : Array.from({ length: maxRowLength }, (_, index) => String(index));
  return source.map((column, index) => {
    const label = String(column ?? '').trim();
    if (!label || /^\d+$/.test(label)) return inferTableColumnLabel(rows, index) ?? `业务字段 ${index + 1}`;
    return TABLE_COLUMN_LABELS[label] ?? label;
  });
}

function inferTableColumnLabel(rows: string[][], index: number) {
  const samples = rows
    .map((row) => String(row[index] ?? '').trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!samples.length) return null;
  if (samples.every((value) => /^(高|中|低|紧急|一般|低风险|中风险|高风险|紧急临期|临期关注|近期到期)$/.test(value))) return '优先级';
  if (samples.every((value) => /^-?[\d,.]+(\.\d+)?\s*(人|位|个|条|笔|次|盒|瓶|支)?$/.test(value))) return inferQuantityLabel(samples);
  if (samples.every((value) => /^[¥￥]\s?[\d,.]+/.test(value))) return '金额';
  if (samples.every((value) => /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(value))) return '日期';
  if (samples.some((value) => /客户|会员|顾客|沉睡|流失|复购|高价值|新客|老客/.test(value))) return '客户分群';
  if (samples.some((value) => /发|推|生成|安排|联系|回访|召回|跟进|补货|处理|打印/.test(value))) return '建议动作';
  if (index === 0) return '名称';
  if (index === rows[0]?.length - 1) return '建议动作';
  return null;
}

function inferQuantityLabel(samples: string[]) {
  if (samples.every((value) => /人|位/.test(value))) return '人数';
  if (samples.every((value) => /笔/.test(value))) return '笔数';
  if (samples.every((value) => /次/.test(value))) return '次数';
  return '数量';
}

function formatTableCellValue(column: string | undefined, value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const key = String(column ?? '').trim();
  const normalizedValue = text.toLowerCase();
  return TABLE_CELL_VALUE_LABELS[key]?.[normalizedValue] ?? text;
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

function ActionCardBlock({
  block,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'action_card' }>;
  onAction?: (actionId: string) => void;
}) {
  const riskClass = {
    low: 'border-blue-200 bg-blue-50/50',
    medium: 'border-amber-200 bg-amber-50/50',
    high: 'border-rose-200 bg-rose-50/50',
  }[block.riskLevel];

  return (
    <div className={`rounded-lg border p-3 ${riskClass}`}>
      <div className="text-sm font-medium text-foreground">{block.title}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{block.preview}</p>
      {block.impactSummary ? <p className="mt-2 text-xs text-foreground/70">{block.impactSummary}</p> : null}
      <button
        type="button"
        onClick={() => onAction?.(block.actionId)}
        className="mt-3 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:opacity-80"
      >
        查看/处理
      </button>
    </div>
  );
}

function ClarificationCardBlock({
  block,
  onCommand,
  onAction,
}: {
  block: Extract<AuraResponseBlock, { kind: 'clarification_card' }>;
  onCommand?: (command: string, source?: 'text') => void;
  onAction?: (actionId: string) => void;
}) {
  const handleSelect = (option: (typeof block.options)[number]) => {
    if (option.actionId) {
      onAction?.(option.actionId);
      return;
    }
    onCommand?.(option.value, 'text');
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <div className="text-xs font-medium text-violet-700">{block.title}</div>
      <p className="mt-1 text-sm font-medium text-foreground">{block.question}</p>
      <div className="mt-3 grid gap-2">
        {block.options.slice(0, 4).map((option) => (
          <button
            key={`${option.label}-${option.value}`}
            type="button"
            onClick={() => handleSelect(option)}
            className="rounded-lg border border-violet-100 bg-white/80 px-3 py-2 text-left text-xs transition-colors hover:bg-violet-100"
          >
            <span className="font-medium text-violet-900">{option.label}</span>
            {option.description ? <span className="mt-0.5 block text-muted-foreground">{option.description}</span> : null}
          </button>
        ))}
      </div>
      {block.allowFreeText ? <div className="mt-2 text-xs text-muted-foreground">也可以直接补充描述，我会继续识别。</div> : null}
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
        <span>数据来源 · {sources.map(formatEvidenceSource).join('、')}</span>
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

function formatEvidenceSource(source: string) {
  return EVIDENCE_SOURCE_LABELS[source] ?? source;
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({ action, onAction }: { action: AuraBlockAction; onAction?: (id: string, label?: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAction?.(action.actionId, action.label)}
      className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
    >
      {action.label}
    </button>
  );
}
