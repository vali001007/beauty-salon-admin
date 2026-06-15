import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCcw, RotateCcw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import {
  confirmDailySettlement,
  generateDailySettlement,
  getDailySettlements,
  type DailySettlement as DailySettlementItem,
} from '@/api/commission';
import { usePermission } from '@/hooks/usePermission';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';

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

function dateText(value?: string) {
  return value ? String(value).slice(0, 10) : '-';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const statusLabels: Record<string, string> = {
  draft: '待确认',
  confirmed: '已确认',
};

export function DailySettlement() {
  const canManageFinance = usePermission('core:finance:manage');
  const [items, setItems] = useState<DailySettlementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rangePreset, setRangePreset] = useState<'7' | '30' | 'custom'>('7');
  const [filters, setFilters] = useState({ dateFrom: daysAgoText(6), dateTo: todayText() });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getDailySettlements({
        page: 1,
        pageSize: 60,
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
          totalRevenue: sum.totalRevenue + item.totalRevenue,
          cashRevenue: sum.cashRevenue + item.cashRevenue,
          wechatRevenue: sum.wechatRevenue + item.wechatRevenue,
          alipayRevenue: sum.alipayRevenue + item.alipayRevenue,
          balanceRevenue: sum.balanceRevenue + item.balanceRevenue,
          refundAmount: sum.refundAmount + item.refundAmount,
          grossProfit: sum.grossProfit + item.grossProfit,
          commissionTotal: sum.commissionTotal + item.commissionTotal,
          orderCount: sum.orderCount + item.orderCount,
          customerCount: sum.customerCount + item.customerCount,
        }),
        {
          totalRevenue: 0,
          cashRevenue: 0,
          wechatRevenue: 0,
          alipayRevenue: 0,
          balanceRevenue: 0,
          refundAmount: 0,
          grossProfit: 0,
          commissionTotal: 0,
          orderCount: 0,
          customerCount: 0,
        },
      ),
    [items],
  );

  const handleGenerate = async () => {
    if (!canManageFinance) {
      toast.error('当前账号没有生成日结的权限');
      return;
    }
    try {
      await generateDailySettlement(filters.dateTo || todayText());
      toast.success('日结已重新计算');
      void loadData();
    } catch (error) {
      toast.error(errorMessage(error, '生成日结失败'));
    }
  };

  const handleConfirm = async (id: number) => {
    if (!canManageFinance) {
      toast.error('当前账号没有确认日结的权限');
      return;
    }
    try {
      await confirmDailySettlement(id);
      toast.success('日结已确认');
      void loadData();
    } catch (error) {
      toast.error(errorMessage(error, '确认日结失败'));
    }
  };

  const summaryCards = [
    {
      label: '净收入',
      value: money(totals.totalRevenue),
      hint: `${totals.orderCount} 单 / ${totals.customerCount} 位顾客`,
    },
    { label: '现金收入', value: money(totals.cashRevenue), hint: '关班现金核对依据' },
    { label: '微信收入', value: money(totals.wechatRevenue), hint: '线上支付拆分' },
    { label: '支付宝收入', value: money(totals.alipayRevenue), hint: '线上支付拆分' },
    { label: '储值消耗', value: money(totals.balanceRevenue), hint: '会员余额核销' },
    { label: '退款金额', value: money(totals.refundAmount), hint: `提成合计 ${money(totals.commissionTotal)}` },
  ];
  const trendRows = useMemo(
    () =>
      [...items]
        .sort((a, b) => dateText(a.settleDate).localeCompare(dateText(b.settleDate)))
        .map((item) => ({
          date: dateText(item.settleDate).slice(5),
          fullDate: dateText(item.settleDate),
          totalRevenue: Number(item.totalRevenue ?? 0),
          grossProfit: Number(item.grossProfit ?? 0),
          refundAmount: Number(item.refundAmount ?? 0),
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">日结报表</h1>
          <p className="mt-1 text-sm text-muted-foreground">按门店每日汇总收银、退款、毛利和提成，用于关账确认。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
          {canManageFinance ? (
            <Button className="gap-2" onClick={() => void handleGenerate()}>
              <RotateCcw className="h-4 w-4" />
              重新计算选中日期
            </Button>
          ) : null}
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
              跟踪净收入、毛利与退款波动，支持近 7 日 / 30 日快速切换。
            </p>
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
                      totalRevenue: '净收入',
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
        {trendRows.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {trendRows.slice(-4).map((item) => (
              <div key={item.fullDate} className="rounded-md bg-muted/35 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.fullDate}</span>
                  <span className="text-muted-foreground">{item.orderCount} 单</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>净收 {money(item.totalRevenue)}</span>
                  <span>毛利率 {item.grossMargin.toFixed(2)}%</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead>净收入</TableHead>
            <TableHead>现金</TableHead>
            <TableHead>微信</TableHead>
            <TableHead>支付宝</TableHead>
            <TableHead>储值消耗</TableHead>
            <TableHead>退款</TableHead>
            <TableHead>订单/顾客</TableHead>
            <TableHead>客单价</TableHead>
            <TableHead>毛利率</TableHead>
            <TableHead>状态</TableHead>
            {canManageFinance ? <TableHead className="w-24 text-right">操作</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={canManageFinance ? 12 : 11} className="py-10 text-center text-muted-foreground">
                加载中
              </TableCell>
            </TableRow>
          ) : items.length ? (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{dateText(item.settleDate)}</TableCell>
                <TableCell>{money(item.totalRevenue)}</TableCell>
                <TableCell>{money(item.cashRevenue)}</TableCell>
                <TableCell>{money(item.wechatRevenue)}</TableCell>
                <TableCell>{money(item.alipayRevenue)}</TableCell>
                <TableCell>{money(item.balanceRevenue)}</TableCell>
                <TableCell>{money(item.refundAmount)}</TableCell>
                <TableCell>
                  {item.orderCount} / {item.customerCount}
                </TableCell>
                <TableCell>{money(item.avgTransaction)}</TableCell>
                <TableCell>{Number(item.grossMargin ?? 0).toFixed(2)}%</TableCell>
                <TableCell>{statusLabels[item.status] ?? item.status}</TableCell>
                {canManageFinance ? (
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={item.status !== 'draft'}
                        onClick={() => void handleConfirm(item.id)}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        确认
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={canManageFinance ? 12 : 11} className="py-10 text-center text-muted-foreground">
                暂无日结数据，可先选择日期重新计算。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
