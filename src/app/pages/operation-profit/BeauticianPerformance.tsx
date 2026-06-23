import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { getBeauticianPerformance, type BeauticianPerformanceRow } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import {
  compactMoney,
  DateRangeFilters,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  missingReasonLabels,
  money,
  monthStartText,
  PageHeader,
  StatusBadge,
  todayText,
} from './utils';

function CompactMetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold leading-tight text-foreground">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function BeauticianPerformance() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [filters, setFilters] = useState({ from: monthStartText(), to: todayText() });
  const [rows, setRows] = useState<BeauticianPerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getBeauticianPerformance({ storeId: currentStoreId ?? undefined, from: filters.from, to: filters.to });
      setRows(page.items);
    } catch (error) {
      toast.error(errorMessage(error, '员工人效加载失败'));
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          serviceIncome: sum.serviceIncome + row.serviceIncome,
          serviceCount: sum.serviceCount + row.serviceCount,
          customerCount: sum.customerCount + row.customerCount,
          cardSalesAmount: sum.cardSalesAmount + row.cardSalesAmount,
          commissionCost: sum.commissionCost + row.commissionCost,
          contributionProfit: sum.contributionProfit + row.contributionProfit,
        }),
        { serviceIncome: 0, serviceCount: 0, customerCount: 0, cardSalesAmount: 0, commissionCost: 0, contributionProfit: 0 },
      ),
    [rows],
  );

  const chartRows = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.contributionProfit - a.contributionProfit)
        .slice(0, 8)
        .map((row) => ({
          name: row.beauticianName,
          serviceIncome: row.serviceIncome,
          contributionProfit: row.contributionProfit,
        })),
    [rows],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="员工人效"
        description="按美容师聚合服务收入、服务次数、客户数、办卡金额、提成成本和贡献毛利。"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <DateRangeFilters from={filters.from} to={filters.to} loading={loading} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} onRefresh={() => void loadData()} />

      <section className="grid grid-cols-6 gap-2">
        <CompactMetricCard label="员工" value={String(rows.length)} />
        <CompactMetricCard label="收入" value={compactMoney(summary.serviceIncome)} />
        <CompactMetricCard label="次数" value={String(summary.serviceCount)} />
        <CompactMetricCard label="客户" value={String(summary.customerCount)} />
        <CompactMetricCard label="办卡" value={compactMoney(summary.cardSalesAmount)} />
        <CompactMetricCard label="毛利" value={compactMoney(summary.contributionProfit)} hint={`提成 ${compactMoney(summary.commissionCost)}`} />
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <div className="text-sm font-medium">员工贡献对比</div>
          <div className="mt-1 text-sm text-muted-foreground">按贡献毛利排序展示前 8 位美容师。</div>
        </div>
        <div className="h-72">
          {chartRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={(value) => compactMoney(Number(value))} />
                <Tooltip
                  formatter={(value: number, name) => {
                    const labels: Record<string, string> = { serviceIncome: '服务收入', contributionProfit: '贡献毛利' };
                    return [money(Number(value)), labels[String(name)] ?? String(name)];
                  }}
                  contentStyle={{ borderRadius: 8, borderColor: 'hsl(var(--border))' }}
                />
                <Bar dataKey="serviceIncome" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="contributionProfit" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyBlock label="暂无员工贡献趋势" />
          )}
        </div>
      </section>

      {loading && !rows.length ? (
        <LoadingBlock />
      ) : rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>美容师</TableHead>
              <TableHead className="text-right">服务收入</TableHead>
              <TableHead className="text-right">服务次数</TableHead>
              <TableHead className="text-right">客户数</TableHead>
              <TableHead className="text-right">客单价</TableHead>
              <TableHead className="text-right">办卡金额</TableHead>
              <TableHead className="text-right">提成成本</TableHead>
              <TableHead className="text-right">贡献毛利</TableHead>
              <TableHead>缺口</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.beauticianId}>
                <TableCell>
                  <div className="font-medium">{row.beauticianName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.storeName || `门店 ${row.storeId}`}</div>
                </TableCell>
                <TableCell className="text-right">{money(row.serviceIncome)}</TableCell>
                <TableCell className="text-right">{row.serviceCount}</TableCell>
                <TableCell className="text-right">{row.customerCount}</TableCell>
                <TableCell className="text-right">{money(row.avgTicket)}</TableCell>
                <TableCell className="text-right">{money(row.cardSalesAmount)}</TableCell>
                <TableCell className="text-right">{money(row.commissionCost)}</TableCell>
                <TableCell className="text-right font-medium">{money(row.contributionProfit)}</TableCell>
                <TableCell>
                  {row.missingCostReasons.length ? (
                    <div className="flex flex-wrap gap-1">
                      {row.missingCostReasons.map((reason) => (
                        <StatusBadge key={reason} tone="border-amber-200 bg-amber-50 text-amber-700">
                          {missingReasonLabels[reason] ?? reason}
                        </StatusBadge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">完整</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyBlock label="当前日期范围暂无员工人效数据" />
      )}
    </div>
  );
}
