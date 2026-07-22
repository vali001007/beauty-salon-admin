import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, RefreshCcw, RotateCcw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  getCashierShiftHistory,
  getPaymentRecords,
  getRefundRecords,
  getReconciliationExceptions,
  type CashierShift,
  type PaymentRecord,
  type RefundRecord,
  type ReconciliationException,
} from '@/api/commission';
import { DailySettlement } from './DailySettlement';

type CashierTab = 'daily' | 'payments' | 'refunds' | 'exceptions' | 'shifts';

const methodLabels: Record<string, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  card: '银行卡',
  bank_card: '银行卡',
  member_balance: '会员卡划扣',
};

const sourceLabels: Record<string, string> = {
  terminal: '终端',
  admin: '管理端',
  miniapp: '小程序',
};

const orderKindLabels: Record<string, string> = {
  project: '项目',
  product: '商品',
  card: '开卡',
  recharge: '充值',
  member_card_recharge: '充值',
  mixed: '混合',
};

function todayText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysAgoText(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function money(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

function uniqueText(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item)))).join(' / ');
}

type PaymentGroup = {
  id: string;
  groupNo: string;
  paidAt?: string;
  customerName?: string;
  methods: string;
  sources: string;
  kinds: string;
  amount: number;
  status: string;
  paymentCount: number;
  orderCount: number;
  orderNos: string;
};

function buildPaymentGroups(items: PaymentRecord[]): PaymentGroup[] {
  const groups = new Map<string, PaymentRecord[]>();
  for (const item of items) {
    const key = item.checkoutGroupNo || item.orderNo || `ORDER-${item.orderId}` || `PAY-${item.id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.entries())
    .map(([groupNo, records]) => {
      const sorted = [...records].sort((a, b) => new Date(b.paidAt ?? b.createdAt ?? 0).getTime() - new Date(a.paidAt ?? a.createdAt ?? 0).getTime());
      const sources = uniqueText(sorted.map((item) => sourceLabels[item.source ?? ''] ?? item.source));
      const kinds = uniqueText(sorted.map((item) => orderKindLabels[item.orderKind ?? ''] ?? item.orderKind));
      const methods = uniqueText(sorted.map((item) => methodLabels[item.method] ?? item.method));
      const statuses = uniqueText(sorted.map((item) => item.status));
      const orderNos = uniqueText(sorted.map((item) => item.orderNo));
      const orderIds = new Set(sorted.map((item) => item.orderId).filter(Boolean));
      return {
        id: groupNo,
        groupNo,
        paidAt: sorted[0]?.paidAt ?? sorted[0]?.createdAt,
        customerName: sorted[0]?.customerName,
        methods,
        sources: sources || '-',
        kinds: kinds || '-',
        amount: sorted.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
        status: statuses || '-',
        paymentCount: sorted.length,
        orderCount: orderIds.size,
        orderNos,
      };
    })
    .sort((a, b) => new Date(b.paidAt ?? 0).getTime() - new Date(a.paidAt ?? 0).getTime());
}

function FlowFilters({ dateFrom, dateTo, onChange, onRefresh, loading }: { dateFrom: string; dateTo: string; onChange: (patch: Partial<{ dateFrom: string; dateTo: string }>) => void; onRefresh: () => void; loading: boolean }) {
  const applyPreset = (days: number) => {
    onChange({ dateFrom: daysAgoText(days - 1), dateTo: todayText() });
  };
  const isPresetActive = (days: number) => dateFrom === daysAgoText(days - 1) && dateTo === todayText();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" type="date" value={dateFrom} onChange={(event) => onChange({ dateFrom: event.target.value })} />
      <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" type="date" value={dateTo} onChange={(event) => onChange({ dateTo: event.target.value })} />
      <Button size="sm" variant={isPresetActive(7) ? 'default' : 'outline'} onClick={() => applyPreset(7)}>
        近 7 天
      </Button>
      <Button size="sm" variant={isPresetActive(30) ? 'default' : 'outline'} onClick={() => applyPreset(30)}>
        近 30 天
      </Button>
      <Button variant="outline" className="gap-2" onClick={onRefresh} disabled={loading}>
        <RefreshCcw className="h-4 w-4" /> 刷新
      </Button>
    </div>
  );
}

function PaymentRecordsPane() {
  const [filters, setFilters] = useState({ dateFrom: todayText(), dateTo: todayText() });
  const [items, setItems] = useState<PaymentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summaryAmount, setSummaryAmount] = useState(0);
  const [viewMode, setViewMode] = useState<'grouped' | 'detail'>('grouped');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getPaymentRecords({ page: 1, pageSize: 200, dateFrom: filters.dateFrom, dateTo: filters.dateTo });
      setItems(page.items);
      setTotal(page.total);
      setSummaryAmount(Number((page as any).summary?.paymentAmount ?? 0));
    } catch (error: any) {
      toast.error(error?.message || '加载支付流水失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const amount = summaryAmount;
  const paymentGroups = useMemo(() => buildPaymentGroups(items), [items]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        支付流水来自 `PaymentRecord`。默认按收银单聚合，终端混合收银会以 `checkoutGroupNo` 合并展示；切到订单明细可查看项目单、商品单等拆分流水。
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FlowFilters {...filters} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} onRefresh={loadData} loading={loading} />
        <div className="flex rounded-lg border border-border bg-muted/30 p-1">
          <Button variant={viewMode === 'grouped' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grouped')}>按收银单</Button>
          <Button variant={viewMode === 'detail' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('detail')}>订单明细</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">收银单数</div>
          <div className="mt-2 text-2xl font-semibold">{paymentGroups.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">按 checkoutGroupNo 聚合</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">支付明细数</div>
          <div className="mt-2 text-2xl font-semibold">{total}</div>
          <div className="mt-1 text-xs text-muted-foreground">原始 PaymentRecord</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">支付金额</div>
          <div className="mt-2 text-2xl font-semibold">{money(amount)}</div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>支付时间</TableHead>
            <TableHead>{viewMode === 'grouped' ? '收银单' : '订单'}</TableHead>
            <TableHead>客户</TableHead>
            <TableHead>来源/类型</TableHead>
            <TableHead>方式</TableHead>
            <TableHead>金额</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {viewMode === 'grouped'
            ? paymentGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>{dateTime(group.paidAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{group.groupNo}</div>
                    {group.orderCount > 1 ? <div className="mt-1 text-xs text-muted-foreground">{group.orderCount} 个拆分订单：{group.orderNos}</div> : null}
                    {group.paymentCount > 1 ? <div className="mt-1 text-xs text-muted-foreground">{group.paymentCount} 条支付明细</div> : null}
                  </TableCell>
                  <TableCell>{group.customerName ?? '-'}</TableCell>
                  <TableCell>{group.sources} / {group.kinds}</TableCell>
                  <TableCell>{group.methods}</TableCell>
                  <TableCell className="font-medium">{money(group.amount)}</TableCell>
                  <TableCell>{group.status}</TableCell>
                </TableRow>
              ))
            : items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{dateTime(item.paidAt ?? item.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.orderNo ?? `#${item.orderId}`}</div>
                    {item.checkoutGroupNo && item.checkoutGroupNo !== item.orderNo ? <div className="mt-1 text-xs text-muted-foreground">收银单 {item.checkoutGroupNo}</div> : null}
                  </TableCell>
                  <TableCell>{item.customerName ?? '-'}</TableCell>
                  <TableCell>{sourceLabels[item.source ?? ''] ?? item.source ?? '-'} / {orderKindLabels[item.orderKind ?? ''] ?? item.orderKind ?? '-'}</TableCell>
                  <TableCell>{methodLabels[item.method] ?? item.method}</TableCell>
                  <TableCell className="font-medium">{money(item.amount)}</TableCell>
                  <TableCell>{item.status}</TableCell>
                </TableRow>
              ))}
          {!items.length ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">暂无支付流水</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function RefundRecordsPane() {
  const [filters, setFilters] = useState({ dateFrom: todayText(), dateTo: todayText() });
  const [items, setItems] = useState<RefundRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [summaryAmount, setSummaryAmount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getRefundRecords({ page: 1, pageSize: 200, dateFrom: filters.dateFrom, dateTo: filters.dateTo });
      setItems(page.items);
      setTotal(page.total);
      setSummaryAmount(Number((page as any).summary?.refundAmount ?? 0));
    } catch (error: any) {
      toast.error(error?.message || '加载退款记录失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const amount = summaryAmount;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        退款记录来自 `RefundRecord`，日结退款金额按退款时间归属到对应营业日；退款后可回到日结总览刷新当天日结。
      </div>
      <FlowFilters {...filters} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} onRefresh={loadData} loading={loading} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">退款笔数</div>
          <div className="mt-2 text-2xl font-semibold">{total}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">退款金额</div>
          <div className="mt-2 text-2xl font-semibold">{money(amount)}</div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>退款时间</TableHead>
            <TableHead>订单</TableHead>
            <TableHead>客户</TableHead>
            <TableHead>原支付方式</TableHead>
            <TableHead>金额</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>原因</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{dateTime(item.refundedAt ?? item.createdAt)}</TableCell>
              <TableCell>{item.orderNo ?? `#${item.orderId}`}</TableCell>
              <TableCell>{item.customerName ?? '-'}</TableCell>
              <TableCell>{item.payMethod ? methodLabels[item.payMethod] ?? item.payMethod : '-'}</TableCell>
              <TableCell className="font-medium">{money(item.amount)}</TableCell>
              <TableCell>{item.status}</TableCell>
              <TableCell>{item.reason ?? '-'}</TableCell>
            </TableRow>
          ))}
          {!items.length ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">暂无退款记录</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function ReconciliationExceptionsPane() {
  const [filters, setFilters] = useState({ dateFrom: daysAgoText(6), dateTo: todayText() });
  const [items, setItems] = useState<ReconciliationException[]>([]);
  const [summary, setSummary] = useState({ high: 0, medium: 0, low: 0 });
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getReconciliationExceptions({ page: 1, pageSize: 200, ...filters });
      setItems(page.items);
      setSummary((page as any).summary ?? { high: 0, medium: 0, low: 0 });
    } catch (error: any) {
      toast.error(error?.message || '加载对账异常失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        自动核对支付现金流、营业收入、预收资金、退款明细和库存冲销，避免只看订单状态判断账务完成。
      </div>
      <FlowFilters {...filters} onChange={(patch) => setFilters((previous) => ({ ...previous, ...patch }))} onRefresh={loadData} loading={loading} />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">高风险</div><div className="mt-2 text-2xl font-semibold text-red-600">{summary.high}</div></div>
        <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">中风险</div><div className="mt-2 text-2xl font-semibold text-amber-600">{summary.medium}</div></div>
        <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">低风险</div><div className="mt-2 text-2xl font-semibold">{summary.low}</div></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>级别</TableHead><TableHead>异常</TableHead><TableHead>说明</TableHead><TableHead>差额</TableHead></TableRow></TableHeader>
        <TableBody>
          {items.map((item) => <TableRow key={item.id}>
            <TableCell>{item.date}</TableCell>
            <TableCell>{item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '低'}</TableCell>
            <TableCell className="font-medium">{item.title}</TableCell>
            <TableCell>{item.detail}</TableCell>
            <TableCell>{item.amountDiff === undefined ? '-' : money(item.amountDiff)}</TableCell>
          </TableRow>)}
          {!items.length ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">当前范围没有对账异常</TableCell></TableRow> : null}
        </TableBody>
      </Table>
    </div>
  );
}

function ShiftHistoryPane() {
  const [filters, setFilters] = useState({ dateFrom: todayText(), dateTo: todayText() });
  const [items, setItems] = useState<CashierShift[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getCashierShiftHistory({ page: 1, pageSize: 200, dateFrom: filters.dateFrom, dateTo: filters.dateTo });
      setItems(page.items);
    } catch (error: any) {
      toast.error(error?.message || '加载班次历史失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        班次/钱箱来自 `CashierShift`，只用于现金交接和运营追责；财务日结真相仍以支付流水、退款记录和订单状态为准。
      </div>
      <FlowFilters {...filters} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} onRefresh={loadData} loading={loading} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>开班时间</TableHead>
            <TableHead>关班时间</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>备用金</TableHead>
            <TableHead>系统现金</TableHead>
            <TableHead>实点现金</TableHead>
            <TableHead>差异</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{dateTime(item.startedAt)}</TableCell>
              <TableCell>{dateTime(item.endedAt)}</TableCell>
              <TableCell>{item.operatorName ?? item.deviceName ?? '-'}</TableCell>
              <TableCell>{item.status}</TableCell>
              <TableCell>{money(item.openingCash)}</TableCell>
              <TableCell>{item.systemCash === undefined ? '-' : money(item.systemCash)}</TableCell>
              <TableCell>{item.closingCash === undefined ? '-' : money(item.closingCash)}</TableCell>
              <TableCell className={Number(item.cashDiff ?? 0) ? 'font-medium text-amber-700' : undefined}>{item.cashDiff === undefined ? '-' : money(item.cashDiff)}</TableCell>
            </TableRow>
          ))}
          {!items.length ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">暂无班次记录</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

export function CashierReconciliation() {
  const [tab, setTab] = useState<CashierTab>('daily');

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-semibold text-foreground">收银对账</h1>
        <p className="mt-1 text-sm text-muted-foreground">把收款、退款、日结和班次交接放在同一个对账流程里处理。</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as CashierTab)} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="daily" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            日结总览
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <WalletCards className="h-4 w-4" />
            支付流水
          </TabsTrigger>
          <TabsTrigger value="refunds" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            退款记录
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            对账异常
          </TabsTrigger>
          <TabsTrigger value="shifts">班次/钱箱</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          {tab === 'daily' ? (
            <div className="flex flex-col gap-4">
              <DailySettlement />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="payments">
          {tab === 'payments' ? <PaymentRecordsPane /> : null}
        </TabsContent>
        <TabsContent value="refunds">
          {tab === 'refunds' ? <RefundRecordsPane /> : null}
        </TabsContent>
        <TabsContent value="exceptions">
          {tab === 'exceptions' ? <ReconciliationExceptionsPane /> : null}
        </TabsContent>
        <TabsContent value="shifts">
          {tab === 'shifts' ? <ShiftHistoryPane /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
