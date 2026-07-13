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
  ID: 'ID',
  customerId: '客户ID',
  customer_id: '客户ID',
  customerName: '客户',
  customer_name: '客户',
  customer_name_masked: '客户',
  phone: '手机号',
  phoneMasked: '手机号',
  phone_last4: '手机号后四位',
  memberLevel: '会员等级',
  member_level: '会员等级',
  totalSpent: '累计消费',
  total_spent: '累计消费',
  total_paid_amount: '累计实收',
  visitCount: '到店次数',
  visit_count: '到店次数',
  lastVisitDate: '最近到店',
  last_visit_at: '最近到店',
  lastOrderTimeText: '最近消费',
  last_order_at: '最近消费',
  paidAmount: '消费金额',
  paidAmountText: '消费金额',
  paid_amount: '消费金额',
  amount: '金额',
  totalAmount: '订单金额',
  total_amount: '订单金额',
  revenue: '实收金额',
  refundAmount: '退款金额',
  refund_amount: '退款金额',
  netAmount: '净额',
  net_amount: '净额',
  payMethod: '支付方式',
  pay_method: '支付方式',
  paymentMethod: '支付方式',
  payment_method: '支付方式',
  orderCount: '订单数',
  order_count: '订单数',
  customerCount: '客户数',
  customer_count: '客户数',
  salesAmount: '销售额',
  salesAmountText: '销售额',
  sales_amount: '销售额',
  net_sales_amount: '净销售额',
  averageOrderValue: '客单价',
  average_order_amount: '客单价',
  quantity: '数量',
  quantity_sold: '销量',
  service_quantity: '服务次数',
  growthRate: '增长率',
  growthRateText: '增长',
  growth_rate: '增长率',
  productName: '商品',
  product_id: '商品ID',
  product_name: '商品',
  projectName: '项目',
  project_id: '项目ID',
  project_name: '项目',
  project_type: '项目分类',
  cardName: '卡项',
  card_name: '卡项',
  activityId: '活动ID',
  activity_id: '活动ID',
  activityName: '活动名称',
  activity_title: '活动名称',
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
  updated_at: '更新时间',
  beauticianId: '员工ID',
  beauticianName: '员工姓名',
  staff_id: '员工ID',
  staff_name: '员工姓名',
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
  order_id: '订单ID',
  orderNo: '订单号',
  order_no: '订单号',
  order_status: '订单状态',
  checkoutGroupNo: '收银组号',
  checkout_group_no: '收银组号',
  transactionType: '交易类型',
  itemSummary: '项目/商品',
  paymentCount: '支付记录',
  refundCount: '退款记录',
  createdAt: '创建时间',
  created_at: '创建时间',
  printable: '可打印',
  batchId: '批次ID',
  batchNo: '批次号',
  sku: 'SKU',
  SKU: 'SKU',
  stock: '批次数量',
  unit: '单位',
  productionDate: '生产日期',
  expiryDate: '有效期',
  daysToExpire: '剩余天数',
  currentStock: '当前库存',
  current_stock: '当前库存',
  safetyStock: '安全库存',
  safety_stock: '安全库存',
  stock_value: '库存金额',
  scrap_quantity: '报废数量',
  estimated_material_cost: '预估耗材成本',
  estimated_margin: '预估毛利',
};

const V3_SQL_COLUMN_LABELS: Record<string, string> = {
  activity_id: '活动ID',
  activity_title: '活动名称',
  after_stock: '变动后库存',
  allocation_type: '分摊类型',
  amount: '金额',
  app_version: '应用版本',
  appointment_time: '预约时间',
  attributed_revenue: '归因收入',
  audit_id: '审计ID',
  automation_source: '自动化来源',
  available_capacity: '可用容量',
  average_order_amount: '客单价',
  avg_delivery_days: '平均交付天数',
  beautician_id: '美容师ID',
  beautician_name: '美容师姓名',
  before_stock: '变动前库存',
  booking_count: '预约占用次数',
  candidate_count: '候选客户数',
  card_count: '卡片数',
  card_name: '卡项',
  care_cycle_weeks: '护理周期周数',
  cash_balance: '现金余额',
  cash_diff: '现金差异',
  cashier_name: '收银员',
  category: '分类',
  category_name: '分类',
  channel: '渠道',
  checked_at: '检查时间',
  city: '城市',
  closed_at: '交班时间',
  commission_amount: '提成金额',
  completed_at: '完成时间',
  completed_count: '完成数',
  conversion_count: '转化数',
  copies: '份数',
  cost_date: '成本日期',
  cost_id: '成本ID',
  created_at: '创建时间',
  current_stock: '当前库存',
  customer_card_id: '客户卡ID',
  customer_count: '客户数',
  customer_id: '客户ID',
  customer_name_masked: '客户',
  date: '日期',
  device_code: '设备编码',
  device_id: '设备ID',
  device_name: '设备名称',
  discount_amount: '优惠金额',
  discount_text: '优惠说明',
  duration: '服务时长',
  end_at: '结束时间',
  end_time: '结束时间',
  error_message: '错误摘要',
  estimated_margin: '预估毛利',
  estimated_material_cost: '预估耗材成本',
  estimated_revenue: '预估收入',
  event_at: '行为时间',
  event_count: '事件数',
  event_source: '行为来源',
  event_type: '行为类型',
  expected_arrival_date: '预计到货日期',
  expires_at: '过期时间',
  expiry_date: '到期日期',
  generated_at: '生成时间',
  gift_balance: '赠送余额',
  gross_amount: '销售原额',
  issued_count: '发放数',
  job_no: '任务编号',
  last_online_at: '最近在线时间',
  last_order_at: '最近消费时间',
  last_procurement_at: '最近采购时间',
  last_visit_at: '最近到店时间',
  latest_booking_date: '最近预约日期',
  latest_event_at: '最近事件时间',
  latest_task_at: '最近任务时间',
  lead_count: '线索数',
  level_name: '员工等级',
  loss_amount: '报废损耗金额',
  member_level: '会员等级',
  missing_phone_customer_count: '缺手机号客户数',
  model: '设备型号',
  model_name: '模型名称',
  movement_id: '流水ID',
  movement_type: '流水类型',
  nearest_expiry_date: '最近效期',
  net_amount: '净额',
  occurred_at: '发生时间',
  opened_at: '开班时间',
  operator_name: '操作人',
  opportunity_id: '机会ID',
  order_count: '订单数',
  order_created_at: '订单时间',
  order_id: '订单ID',
  order_status: '订单状态',
  paid_amount: '实收金额',
  paid_at: '支付时间',
  participants: '参与人数',
  pay_method: '支付方式',
  payment_amount: '支付金额',
  payment_method: '支付方式',
  payment_status: '支付状态',
  period_month: '所属月份',
  permissions: '权限摘要',
  phone_last4: '手机号后四位',
  price: '项目价格',
  price_range: '参考价格区间',
  print_job_id: '打印任务ID',
  printer_status: '打印机状态',
  procurement_amount: '采购金额',
  procurement_count: '采购次数',
  procurement_id: '采购单ID',
  procurement_no: '采购单号',
  product_count: '商品数',
  product_id: '商品ID',
  product_name: '商品',
  project_id: '项目ID',
  project_name: '项目',
  project_type: '项目分类',
  promotion_id: '促销ID',
  promotion_name: '促销名称',
  publish_status: '发布状态',
  quantity: '数量',
  received_at: '到货时间',
  recognized_amount: '确认收入金额',
  recommendation_summary: '建议摘要',
  refund_amount: '退款金额',
  refund_reason_category: '退款原因分类',
  refund_status: '退款状态',
  refunded_at: '退款时间',
  remaining_times: '剩余次数',
  remark_summary: '报废备注摘要',
  reservation_id: '预约ID',
  resource_id: '资源ID',
  resource_name: '资源名称',
  resource_type: '资源类型',
  revenue_amount: '营收金额',
  role_key: '角色编码',
  role_name: '角色名称',
  run_id: '运行ID',
  run_no: '运行编号',
  safety_stock: '安全库存',
  scenario: '场景',
  scope: '推荐范围',
  scrap_quantity: '报废数量',
  service_count: '服务次数',
  service_quantity: '服务次数',
  service_task_id: '服务任务ID',
  settle_month: '结算月份',
  settlement_date: '日结日期',
  shift_id: '班次ID',
  shift_status: '班次状态',
  skin_condition_summary: '肤况摘要',
  skin_type: '肤质',
  sku: 'SKU',
  source_type: '来源类型',
  source_version: '来源版本',
  source_version_id: '来源版本',
  staff_id: '员工ID',
  staff_name: '员工姓名',
  start_at: '开始时间',
  start_time: '开始时间',
  started_at: '开始时间',
  status: '状态',
  stock_value: '库存金额',
  store_id: '门店ID',
  store_name: '门店',
  supplier_id: '供应商ID',
  supplier_name: '供应商名称',
  system_cash: '系统现金',
  tags_summary: '标签摘要',
  target_version_id: '目标版本',
  task_count: '任务数',
  template_id: '模板ID',
  template_name: '模板名称',
  test_at: '测试时间',
  times: '核销次数',
  title: '标题',
  total_amount: '订单总额',
  total_paid_amount: '累计实收金额',
  total_times: '总次数',
  treatment_course_times: '疗程次数',
  trigger_type: '触发类型',
  type: '类型',
  unit: '单位',
  updated_at: '更新时间',
  used_count: '使用数',
  user_id: '用户ID',
  user_name: '用户姓名',
  user_status: '用户状态',
  verified_at: '核销时间',
};

const TABLE_COLUMN_TOKEN_LABELS: Record<string, string> = {
  activity: '活动',
  after: '后',
  amount: '金额',
  appointment: '预约',
  at: '时间',
  audit: '审计',
  average: '平均',
  avg: '平均',
  balance: '余额',
  before: '前',
  booking: '预约',
  card: '卡',
  category: '分类',
  channel: '渠道',
  count: '数',
  created: '创建',
  customer: '客户',
  date: '日期',
  delivery: '交付',
  device: '设备',
  discount: '优惠',
  end: '结束',
  event: '事件',
  expiry: '效期',
  gross: '原额',
  id: 'ID',
  item: '明细',
  latest: '最近',
  level: '等级',
  margin: '毛利',
  material: '耗材',
  method: '方式',
  name: '名称',
  net: '净额',
  no: '编号',
  order: '订单',
  paid: '实收',
  pay: '支付',
  payment: '支付',
  phone: '手机号',
  price: '价格',
  product: '商品',
  project: '项目',
  quantity: '数量',
  refund: '退款',
  refunded: '退款',
  reservation: '预约',
  revenue: '收入',
  service: '服务',
  sku: 'SKU',
  staff: '员工',
  status: '状态',
  stock: '库存',
  store: '门店',
  supplier: '供应商',
  time: '时间',
  total: '总',
  type: '类型',
  updated: '更新',
  user: '用户',
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
  pay_method: {
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
  payment_method: {
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
  order_status: {
    paid: '已付款',
    completed: '已完成',
    pending: '待付款',
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
    return tableColumnLabel(label);
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
  const normalizedKey = normalizeColumnKey(key);
  const normalizedValue = text.toLowerCase();
  const mappedValue = TABLE_CELL_VALUE_LABELS[key]?.[normalizedValue] ?? TABLE_CELL_VALUE_LABELS[normalizedKey]?.[normalizedValue];
  if (mappedValue) return mappedValue;
  const formattedDate = formatTableDateValue(normalizedKey, text);
  if (formattedDate) return formattedDate;
  const numeric = parseNumericText(text);
  if (!numeric) return text;
  if (isIdColumn(normalizedKey) || isIntegerColumn(normalizedKey)) return formatInteger(numeric.value);
  if (isPercentColumn(normalizedKey)) return `${formatDecimal(numeric.value * (Math.abs(numeric.value) <= 1 ? 100 : 1))}%`;
  if (isTwoDecimalColumn(normalizedKey) || numeric.hasDecimal) return formatDecimal(numeric.value);
  return text;
}

function tableColumnLabel(label: string) {
  const normalized = normalizeColumnKey(label);
  return TABLE_COLUMN_LABELS[label] ?? TABLE_COLUMN_LABELS[normalized] ?? V3_SQL_COLUMN_LABELS[label] ?? V3_SQL_COLUMN_LABELS[normalized] ?? humanizeTableColumnLabel(normalized, label);
}

function normalizeColumnKey(column: string) {
  const trimmed = column.trim();
  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s.-]+/g, '_')
    .toLowerCase();
}

function humanizeTableColumnLabel(normalized: string, original: string) {
  if (!normalized || !/[a-z]/i.test(normalized)) return original;
  const parts = normalized.split('_').filter(Boolean);
  if (!parts.length) return original;

  if (parts.at(-1) === 'id') {
    const entity = parts.slice(0, -1).map(tableColumnTokenLabel).join('');
    return entity ? `${entity}ID` : 'ID';
  }

  if (parts.at(-1) === 'at') {
    const entity = parts.slice(0, -1).map(tableColumnTokenLabel).join('');
    return entity ? `${entity}时间` : '时间';
  }

  if (parts.at(-1) === 'date') {
    const entity = parts.slice(0, -1).map(tableColumnTokenLabel).join('');
    return entity ? `${entity}日期` : '日期';
  }

  const translated = parts.map(tableColumnTokenLabel).join('');
  return translated || original;
}

function tableColumnTokenLabel(token: string) {
  return TABLE_COLUMN_TOKEN_LABELS[token] ?? token;
}

function parseNumericText(text: string) {
  const cleaned = text.replace(/[¥￥,\s]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return { value, hasDecimal: cleaned.includes('.') };
}

function formatTableDateValue(column: string, text: string) {
  if (!isDateColumn(column) && !isDateLikeText(text)) return null;
  const date = parseTableDate(text);
  if (!date) return null;
  return hasDateTimeSignal(column, text) ? formatChineseDateTime(date) : formatChineseDate(date);
}

function isDateColumn(column: string) {
  return /(^date$|_date$|_at$|_time$|month$|period_month$|settle_month$)/.test(column);
}

function isDateLikeText(text: string) {
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text) || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/i.test(text);
}

function hasDateTimeSignal(column: string, text: string) {
  return /(_at$|_time$|created_at$|updated_at$|started_at$|completed_at$|paid_at$|refunded_at$|verified_at$|appointment_time$)/.test(column) || /\d{1,2}:\d{2}/.test(text);
}

function parseTableDate(text: string) {
  const trimmed = text.trim();
  if (!isDateLikeText(trimmed)) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatChineseDate(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year') ?? ''}年${byType.get('month') ?? ''}月${byType.get('day') ?? ''}日`;
}

function formatChineseDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year') ?? ''}年${byType.get('month') ?? ''}月${byType.get('day') ?? ''}日 ${byType.get('hour') ?? ''}:${byType.get('minute') ?? ''}`;
}

function isIdColumn(column: string) {
  return column === 'id' || column.endsWith('_id') || column.endsWith('id');
}

function isIntegerColumn(column: string) {
  return /(count|times|days|visit|order_count|customer_count|reservation_count|service_count|completed_task_count|available_count|busy_count|leave_count)$/.test(column);
}

function isPercentColumn(column: string) {
  return /(rate|ratio|percent|conversion|completion_rate|growth_rate)$/.test(column);
}

function isTwoDecimalColumn(column: string) {
  return /(amount|revenue|sales|price|cost|margin|balance|stock_value|quantity|score|value|commission|refund|paid|net|total|average)/.test(column);
}

function formatDecimal(value: number) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatInteger(value: number) {
  return Math.trunc(value).toLocaleString('zh-CN');
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
