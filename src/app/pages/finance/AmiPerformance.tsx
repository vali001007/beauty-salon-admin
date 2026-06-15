import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import {
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
import { toast } from 'sonner';
import {
  getAmiDashboard,
  getAmiMonthlyBills,
  getAmiPerformanceRecords,
  type AmiDashboardSummary,
  type AmiMonthlyBill,
  type AmiPerformanceRecord,
} from '@/api/commission';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function categoryLabel(value?: string) {
  const map: Record<string, string> = {
    marketing_conversion: '营销转化',
    churn_recovery: '流失挽回',
    card_renewal: '次卡续费',
    cashier_assist: '收银辅助',
    inventory_alert: '库存预警',
    scheduling: '智能排班',
  };
  return map[value ?? ''] ?? value ?? '-';
}

function dateText(value?: string) {
  return value ? String(value).slice(0, 16).replace('T', ' ') : '-';
}

function roiTone(roi?: number) {
  const value = Number(roi ?? 0);
  if (value >= 5) return 'text-emerald-600';
  if (value >= 3) return 'text-amber-600';
  return 'text-red-600';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const categoryColors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#6b7280'];

export function AmiPerformance() {
  const [settleMonth, setSettleMonth] = useState(currentMonth());
  const [category, setCategory] = useState('');
  const [records, setRecords] = useState<AmiPerformanceRecord[]>([]);
  const [dashboard, setDashboard] = useState<AmiDashboardSummary | null>(null);
  const [trendBills, setTrendBills] = useState<AmiMonthlyBill[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [page, summary, billPage] = await Promise.all([
        getAmiPerformanceRecords({ page: 1, pageSize: 100, settleMonth, category: category || undefined }),
        getAmiDashboard({ settleMonth }),
        getAmiMonthlyBills({ page: 1, pageSize: 500 }),
      ]);
      setRecords(page.items);
      setDashboard(summary);
      setTrendBills(billPage.items);
    } catch (error) {
      toast.error(errorMessage(error, 'Ami 绩效加载失败'));
    } finally {
      setLoading(false);
    }
  }, [category, settleMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const categoryRows = useMemo(
    () =>
      (dashboard?.categories ?? [])
        .map((item, index) => ({
          ...item,
          name: categoryLabel(item.category),
          value: Number(item.revenueAmount || item.workMinutes || item.count || 0),
          color: categoryColors[index % categoryColors.length],
        }))
        .filter((item) => item.count > 0 || item.value > 0),
    [dashboard],
  );
  const categoryTotal = categoryRows.reduce((sum, item) => sum + item.value, 0);
  const trendRows = useMemo(() => {
    const monthMap = new Map<
      string,
      { month: string; revenueGenerated: number; totalFee: number; billCount: number }
    >();
    for (const bill of trendBills) {
      const item = monthMap.get(bill.settleMonth) ?? {
        month: bill.settleMonth,
        revenueGenerated: 0,
        totalFee: 0,
        billCount: 0,
      };
      item.revenueGenerated += Number(bill.revenueGenerated ?? 0);
      item.totalFee += Number(bill.totalFee ?? 0);
      item.billCount += 1;
      monthMap.set(bill.settleMonth, item);
    }
    return Array.from(monthMap.values())
      .map((item) => ({
        ...item,
        roi: item.totalFee > 0 ? Math.round((item.revenueGenerated / item.totalFee) * 100) / 100 : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [trendBills]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">数字员工绩效</h1>
          <p className="mt-1 text-sm text-muted-foreground">追踪 Ami 带来的转化收入、节省工时和可计费贡献。</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">关联收入</div>
          <div className="mt-2 text-2xl font-semibold">{money(dashboard?.revenueGenerated)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Ami 费用</div>
          <div className="mt-2 text-2xl font-semibold">{money(dashboard?.totalFee)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">ROI</div>
          <div className={`mt-2 text-2xl font-semibold ${roiTone(dashboard?.roi)}`}>
            {Number(dashboard?.roi ?? 0).toFixed(2)}x
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">节省工时</div>
          <div className="mt-2 text-2xl font-semibold">{Number(dashboard?.workMinutes ?? 0)} 分钟</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">贡献分类占比</div>
          <div className="h-64">
            {categoryRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryRows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {categoryRows.map((item) => (
                      <Cell key={item.category} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, _name, payload) => {
                      const item = payload?.payload as (typeof categoryRows)[number] | undefined;
                      const percent = categoryTotal ? ((Number(value) / categoryTotal) * 100).toFixed(1) : '0.0';
                      return [
                        `${percent}% / ${money(item?.revenueAmount)} / ${item?.workMinutes ?? 0} 分钟`,
                        item?.name ?? '贡献',
                      ];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无分类数据</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">分类明细</div>
          <div className="grid gap-3 md:grid-cols-2">
            {categoryRows.map((item) => {
              const percent = categoryTotal ? Math.round((item.value / categoryTotal) * 1000) / 10 : 0;
              return (
                <div key={item.category} className="rounded-md bg-muted/35 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">{percent}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(100, percent)}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <span>{item.count} 条</span>
                    <span>{money(item.revenueAmount)}</span>
                    <span>{item.workMinutes} 分钟</span>
                  </div>
                </div>
              );
            })}
            {!categoryRows.length ? <div className="text-sm text-muted-foreground">当前月份暂无贡献记录。</div> : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">近 6 个月 ROI 趋势</div>
            <p className="mt-1 text-sm text-muted-foreground">按已生成的 Ami 月度账单汇总收入和费用后计算。</p>
          </div>
          <div className="text-xs text-muted-foreground">{trendRows.length} 个月账单样本</div>
        </div>
        <div className="mt-4 h-64">
          {trendRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  width={48}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}x`}
                />
                <Tooltip
                  formatter={(value: number, name) => {
                    if (name === 'ROI') return [`${Number(value).toFixed(2)}x`, 'ROI'];
                    return [value, name];
                  }}
                  labelFormatter={(label) => `账单月份：${label}`}
                  contentStyle={{ borderRadius: 8, borderColor: 'hsl(var(--border))' }}
                />
                <Line
                  type="monotone"
                  dataKey="roi"
                  name="ROI"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              暂无可用于趋势分析的账单数据
            </div>
          )}
        </div>
        {trendRows.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {trendRows.slice(-3).map((item) => (
              <div key={item.month} className="rounded-md bg-muted/35 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.month}</span>
                  <span className={roiTone(item.roi)}>{Number(item.roi).toFixed(2)}x</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>{money(item.revenueGenerated)}</span>
                  <span>{money(item.totalFee)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          type="month"
          value={settleMonth}
          onChange={(event) => setSettleMonth(event.target.value)}
        />
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">全部贡献类型</option>
          <option value="marketing_conversion">营销转化</option>
          <option value="churn_recovery">流失挽回</option>
          <option value="card_renewal">次卡续费</option>
          <option value="cashier_assist">收银辅助</option>
          <option value="inventory_alert">库存预警</option>
          <option value="scheduling">智能排班</option>
        </select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>客户/订单</TableHead>
            <TableHead>关联收入</TableHead>
            <TableHead>抽成比例</TableHead>
            <TableHead>Ami 提成</TableHead>
            <TableHead>工时</TableHead>
            <TableHead>触发源</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.length ? (
            records.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{dateText(item.occurredAt)}</TableCell>
                <TableCell>{categoryLabel(item.category)}</TableCell>
                <TableCell>
                  {item.customerName ?? '-'} / {item.orderNo ?? '-'}
                </TableCell>
                <TableCell>{money(item.revenueAmount)}</TableCell>
                <TableCell>{item.commissionRate ? `${(item.commissionRate * 100).toFixed(1)}%` : '-'}</TableCell>
                <TableCell>{money(item.commissionAmount)}</TableCell>
                <TableCell>{item.workMinutes ? `${item.workMinutes} 分钟` : '-'}</TableCell>
                <TableCell>{item.triggerType}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                暂无 Ami 绩效记录。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
