import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { getFinanceDailyMetrics, type FinanceDailyMetric } from '@/api/financeMetrics';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';

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
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactMoney(value?: number) {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 10000) return `¥${(amount / 10000).toFixed(1)}万`;
  return `¥${Math.round(amount).toLocaleString('zh-CN')}`;
}

function PaymentMethodBreakdown({ cash, wechat, alipay, card, className = 'text-sm' }: { cash?: number; wechat?: number; alipay?: number; card?: number; className?: string }) {
  const items = [
    { label: '现金', value: cash },
    { label: '微信', value: wechat },
    { label: '支付宝', value: alipay },
    { label: '银行卡', value: card },
  ];
  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-1 ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-medium text-foreground">{money(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function dateText(value?: string) {
  return value ? String(value).slice(0, 10) : '-';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const costReasonLabels: Record<string, string> = {
  missing_actual_consumption: '实际耗材流水缺失',
  missing_bom: '项目 BOM 缺失',
  missing_batch_cost: '商品批次成本缺失',
  product_master_estimate: '商品主档估算',
  legacy_missing_snapshot: '旧流水缺少成本快照',
  missing_commission: '提成记录缺失',
};

const costQualityLabels: Record<string, string> = {
  complete: '成本完整',
  mixed: '含估算',
  estimated: '估算成本',
  missing: '成本缺失',
};

export function DailySettlement() {
  const [items, setItems] = useState<FinanceDailyMetric[]>([]);
  const [detailItem, setDetailItem] = useState<FinanceDailyMetric | null>(null);
  const [loading, setLoading] = useState(false);
  const [rangePreset, setRangePreset] = useState<'7' | '30' | 'custom'>('7');
  const [filters, setFilters] = useState({ dateFrom: daysAgoText(6), dateTo: todayText() });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getFinanceDailyMetrics({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
      setItems(page.items);
    } catch (error) {
      toast.error(errorMessage(error, '日结报表加载失败'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totals = useMemo(
    () =>
      items.reduce(
        (sum, item) => ({
          totalRevenue: sum.totalRevenue + item.operatingRevenue,
          cashRevenue: sum.cashRevenue + item.paymentBreakdown.cash,
          wechatRevenue: sum.wechatRevenue + item.paymentBreakdown.wechat,
          alipayRevenue: sum.alipayRevenue + item.paymentBreakdown.alipay,
          cardRevenue: sum.cardRevenue + item.paymentBreakdown.card,
          balanceRevenue: sum.balanceRevenue + item.memberBalanceDeductTotal,
          memberBalanceCashDeduct: sum.memberBalanceCashDeduct + item.memberBalanceDeductCash,
          memberBalanceGiftDeduct: sum.memberBalanceGiftDeduct + item.memberBalanceDeductGift,
          prepaidIncome: sum.prepaidIncome + item.prepaidAmount,
          cardUsageRevenue: sum.cardUsageRevenue + item.cardUsageRecognized,
          refundAmount: sum.refundAmount + item.refundAmount,
          grossProfit: sum.grossProfit + item.grossProfit,
          commissionTotal: sum.commissionTotal + item.commissionCost,
          orderCount: sum.orderCount + item.orderCount,
          customerCount: sum.customerCount + item.customerCount,
        }),
        {
          totalRevenue: 0,
          cashRevenue: 0,
          wechatRevenue: 0,
          alipayRevenue: 0,
          cardRevenue: 0,
          balanceRevenue: 0,
          memberBalanceCashDeduct: 0,
          memberBalanceGiftDeduct: 0,
          prepaidIncome: 0,
          cardUsageRevenue: 0,
          refundAmount: 0,
          grossProfit: 0,
          commissionTotal: 0,
          orderCount: 0,
          customerCount: 0,
        },
      ),
    [items],
  );
  const cashflowReceived = totals.cashRevenue + totals.wechatRevenue + totals.alipayRevenue + totals.cardRevenue;

  const summaryCards = [
    {
      label: '营业收入',
      value: money(totals.totalRevenue),
      hint: `${totals.orderCount} 单 / ${totals.customerCount} 位顾客`,
    },
    {
      label: '现金收入',
      value: money(cashflowReceived),
      hint: <PaymentMethodBreakdown cash={totals.cashRevenue} wechat={totals.wechatRevenue} alipay={totals.alipayRevenue} card={totals.cardRevenue} className="text-xs" />,
    },
    { label: '预收金额', value: money(totals.prepaidIncome), hint: '当期充值和办次卡等未履约预收' },
    {
      label: '会员余额划扣',
      value: money(totals.balanceRevenue),
      hint: `本金 ${money(totals.memberBalanceCashDeduct)} / 赠送 ${money(totals.memberBalanceGiftDeduct)}`,
    },
    { label: '次卡核销确认', value: money(totals.cardUsageRevenue), hint: '权益核销后的履约确认收入' },
    { label: '退款金额', value: money(totals.refundAmount), hint: `提成合计 ${money(totals.commissionTotal)}` },
  ];
  const detailRows = useMemo(() => {
    if (!detailItem) return [];
    return [
      { name: '营业收入', value: money(detailItem.operatingRevenue), detail: '项目/商品已履约净收入 + 次卡核销确认' },
      { name: '现金收入', value: money(detailItem.cashIncome), detail: <PaymentMethodBreakdown cash={detailItem.paymentBreakdown.cash} wechat={detailItem.paymentBreakdown.wechat} alipay={detailItem.paymentBreakdown.alipay} card={detailItem.paymentBreakdown.card} /> },
      { name: '预收金额', value: money(detailItem.prepaidAmount), detail: '当期充值、办次卡等未履约预收金额' },
      { name: '会员划扣', value: money(detailItem.memberBalanceDeductTotal), detail: '会员余额消费，确认订单结清但不产生新的现金入账' },
      {
        name: '本金划扣',
        value: money(detailItem.memberBalanceDeductCash),
        detail: '会员卡划扣中消耗的现金本金部分',
      },
      {
        name: '赠送划扣',
        value: money(detailItem.memberBalanceDeductGift),
        detail: '会员卡划扣中消耗的赠送余额部分',
      },
      { name: '次卡核销', value: money(detailItem.cardUsageRecognized), detail: '次卡核销后的履约确认收入，已并入营业收入' },
      { name: '退款金额', value: money(detailItem.refundAmount), detail: '成功退款金额，按退款时间归属营业日' },
      { name: '订单/顾客', value: `${detailItem.orderCount} / ${detailItem.customerCount}`, detail: `客单价 ${money(detailItem.avgTicket)}` },
      { name: '实际耗材', value: money(detailItem.materialCostActual), detail: '已落实际耗材出库流水且带成本快照' },
      { name: 'BOM 估算', value: money(detailItem.materialCostEstimated), detail: '没有实际耗材流水时按项目 BOM 估算' },
      { name: '商品批次成本', value: money(detailItem.productCostActual), detail: '商品销售出库按批次成本快照计入' },
      { name: '商品主档估算', value: money(detailItem.productCostEstimated), detail: '缺少批次成本时按商品主档成本估算' },
      { name: '提成成本', value: money(detailItem.commissionCost), detail: '来自提成流水' },
      {
        name: '缺成本原因',
        value: costQualityLabels[detailItem.costQuality?.status ?? 'complete'] ?? '-',
        detail:
          detailItem.costQuality?.reasons?.length
            ? detailItem.costQuality.reasons.map((reason) => costReasonLabels[reason] ?? reason).join(' / ')
            : '暂无成本缺口',
      },
      { name: '毛利', value: money(detailItem.grossProfit), detail: `毛利率 ${(Number(detailItem.grossMargin ?? 0) * 100).toFixed(2)}%` },
    ];
  }, [detailItem]);

  const trendRows = useMemo(
    () =>
      [...items]
        .sort((a, b) => dateText(a.date).localeCompare(dateText(b.date)))
        .map((item) => ({
          date: dateText(item.date).slice(5),
          fullDate: dateText(item.date),
          totalRevenue: Number(item.operatingRevenue ?? 0),
          cashflowReceived: Number(item.cashIncome ?? 0),
          grossProfit: Number(item.grossProfit ?? 0),
          refundAmount: Number(item.refundAmount ?? 0),
          cardUsageRevenue: Number(item.cardUsageRecognized ?? 0),
          orderCount: Number(item.orderCount ?? 0),
          grossMargin: Number(item.grossMargin ?? 0),
        })),
    [items],
  );

  const applyPreset = (days: 7 | 30) => {
    setRangePreset(String(days) as '7' | '30');
    setFilters({ dateFrom: daysAgoText(days - 1), dateTo: todayText() });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">日期范围</span>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => {
              setRangePreset('custom');
              setFilters((prev) => ({ ...prev, dateFrom: event.target.value }));
            }}
          />
          <span className="text-sm text-muted-foreground">至</span>
          <input
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            type="date"
            value={filters.dateTo}
            onChange={(event) => {
              setRangePreset('custom');
              setFilters((prev) => ({ ...prev, dateTo: event.target.value }));
            }}
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={rangePreset === '7' ? 'default' : 'outline'} onClick={() => applyPreset(7)}>
            近 7 日
          </Button>
          <Button size="sm" variant={rangePreset === '30' ? 'default' : 'outline'} onClick={() => applyPreset(30)}>
            近 30 日
          </Button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">{card.label}</div>
            <div className="mt-2 text-xl font-semibold">{card.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{card.hint}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">日结趋势</div>
            <p className="mt-1 text-sm text-muted-foreground">
              跟踪营业收入、毛利与退款波动。
            </p>
          </div>
        </div>
        <div className="mt-4 h-72">
          {trendRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="dailyRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="dailyProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => compactMoney(Number(value))}
                />
                <Tooltip
                  formatter={(value: number, name) => {
                    const labels: Record<string, string> = {
                      totalRevenue: '营业收入',
                      grossProfit: '毛利',
                      refundAmount: '退款',
                    };
                    return [money(Number(value)), labels[String(name)] ?? String(name)];
                  }}
                  labelFormatter={(_label, payload) => `日期：${payload?.[0]?.payload?.fullDate ?? '-'}`}
                  contentStyle={{ borderRadius: 8, borderColor: 'hsl(var(--border))' }}
                />
                <Area
                  type="monotone"
                  dataKey="totalRevenue"
                  name="totalRevenue"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#dailyRevenue)"
                />
                <Area
                  type="monotone"
                  dataKey="grossProfit"
                  name="grossProfit"
                  stroke="#16a34a"
                  strokeWidth={2}
                  fill="url(#dailyProfit)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无趋势数据</div>
          )}
        </div>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead>营业收入</TableHead>
            <TableHead>现金收入</TableHead>
            <TableHead>预收金额</TableHead>
            <TableHead>会员余额划扣</TableHead>
            <TableHead>次卡核销确认</TableHead>
            <TableHead>退款</TableHead>
            <TableHead>订单/顾客</TableHead>
            <TableHead>客单价</TableHead>
            <TableHead>毛利率</TableHead>
            <TableHead className="w-24 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                加载中
              </TableCell>
            </TableRow>
          ) : items.length ? (
            items.map((item) => (
              <TableRow key={`${item.storeId ?? 'all'}-${item.date}`}>
                <TableCell className="font-medium">{dateText(item.date)}</TableCell>
                <TableCell>{money(item.operatingRevenue)}</TableCell>
                <TableCell>{money(item.cashIncome)}</TableCell>
                <TableCell>{money(item.prepaidAmount)}</TableCell>
                <TableCell>{money(item.memberBalanceDeductTotal)}</TableCell>
                <TableCell>{money(item.cardUsageRecognized)}</TableCell>
                <TableCell>{money(item.refundAmount)}</TableCell>
                <TableCell>
                  {item.orderCount} / {item.customerCount}
                </TableCell>
                <TableCell>{money(item.avgTicket)}</TableCell>
                <TableCell>{(Number(item.grossMargin ?? 0) * 100).toFixed(2)}%</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setDetailItem(item)}>
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      明细
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                暂无日结数据，可先选择日期重新计算。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={Boolean(detailItem)} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-4xl" aria-describedby="daily-settlement-detail-desc">
          <DialogHeader>
            <DialogTitle>日结明细 - {dateText(detailItem?.date)}</DialogTitle>
            <DialogDescription id="daily-settlement-detail-desc">
              系统已按订单、支付、退款、耗材和提成流水汇总，默认采纳当前数据，无需人工确认审核。
            </DialogDescription>
          </DialogHeader>

          {detailItem ? (
            <div className="space-y-4">
              <section className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">营业收入</div>
                  <div className="mt-1 text-lg font-semibold">{money(detailItem.operatingRevenue)}</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">订单/顾客</div>
                  <div className="mt-1 text-lg font-semibold">
                    {detailItem.orderCount} / {detailItem.customerCount}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">毛利</div>
                  <div className="mt-1 text-lg font-semibold">{money(detailItem.grossProfit)}</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">毛利率</div>
                  <div className="mt-1 text-lg font-semibold">{(Number(detailItem.grossMargin ?? 0) * 100).toFixed(2)}%</div>
                </div>
              </section>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">项目</TableHead>
                    <TableHead className="w-44">金额</TableHead>
                    <TableHead>明细</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.value}</TableCell>
                      <TableCell className="text-muted-foreground">{row.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
