import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCcw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { getBeauticianPerformance, type BeauticianPerformanceRow } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  compactMoney,
  DateRangeFilters,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  money,
  monthStartText,
  PageHeader,
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
  const [detailRow, setDetailRow] = useState<BeauticianPerformanceRow | null>(null);
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
          name: row.staffName || row.beauticianName || '未命名员工',
          serviceIncome: row.serviceIncome,
          contributionProfit: row.contributionProfit,
        })),
    [rows],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="员工人效"
        description="按系统员工聚合服务收入、服务次数、客户数、办卡金额、提成成本和贡献毛利；人员来源与系统管理-用户管理一致。"
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
          <div className="mt-1 text-sm text-muted-foreground">按贡献毛利排序展示前 8 位员工。</div>
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
              <TableHead>员工</TableHead>
              <TableHead className="text-right">服务收入</TableHead>
              <TableHead className="text-right">服务次数</TableHead>
              <TableHead className="text-right">客户数</TableHead>
              <TableHead className="text-right">客单价</TableHead>
              <TableHead className="text-right">办卡金额</TableHead>
              <TableHead className="text-right">提成成本</TableHead>
              <TableHead className="text-right">贡献毛利</TableHead>
              <TableHead className="w-24 text-right">明细</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.staffUserId ?? row.beauticianId}>
                <TableCell>
                  <div className="font-medium">{row.staffName || row.beauticianName || '未命名员工'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.storeName || (row.storeId ? `门店 ${row.storeId}` : '未绑定门店')}</div>
                </TableCell>
                <TableCell className="text-right">{money(row.serviceIncome)}</TableCell>
                <TableCell className="text-right">{row.serviceCount}</TableCell>
                <TableCell className="text-right">{row.customerCount}</TableCell>
                <TableCell className="text-right">{money(row.avgTicket)}</TableCell>
                <TableCell className="text-right">{money(row.cardSalesAmount)}</TableCell>
                <TableCell className="text-right">{money(row.commissionCost)}</TableCell>
                <TableCell className="text-right font-medium">{money(row.contributionProfit)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setDetailRow(row)}>
                    <FileText className="h-3.5 w-3.5" />
                    查看
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyBlock label="当前日期范围暂无员工人效数据" />
      )}

      <Dialog open={Boolean(detailRow)} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-w-3xl" aria-describedby="beautician-performance-detail-desc">
          <DialogHeader>
            <DialogTitle>员工人效明细</DialogTitle>
            <DialogDescription id="beautician-performance-detail-desc">
              查看当前筛选周期内该员工的项目订单和次卡核销服务明细。
            </DialogDescription>
          </DialogHeader>

          {detailRow ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="text-base font-medium text-foreground">{detailRow.staffName || detailRow.beauticianName || '未命名员工'}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {detailRow.storeName || (detailRow.storeId ? `门店 ${detailRow.storeId}` : '未绑定门店')} · {filters.from} 至 {filters.to}
                </div>
              </div>

              <div className="max-h-[56vh] overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 font-medium text-muted-foreground">日期</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">来源</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">客户</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">服务项目</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">次数</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">收入</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">提成</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">毛利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailRow.serviceDetails ?? []).map((detail) => (
                      <tr key={detail.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">{detail.occurredAt ? String(detail.occurredAt).slice(0, 10) : '-'}</td>
                        <td className="px-3 py-2">
                          <div>{detail.sourceLabel}</div>
                          <div className="text-xs text-muted-foreground">{detail.sourceNo || '-'}</div>
                        </td>
                        <td className="px-3 py-2">{detail.customerName || '-'}</td>
                        <td className="px-3 py-2 font-medium">{detail.serviceName}</td>
                        <td className="px-3 py-2 text-right">{detail.quantity}</td>
                        <td className="px-3 py-2 text-right">{money(detail.income)}</td>
                        <td className="px-3 py-2 text-right">{money(detail.commissionCost)}</td>
                        <td className="px-3 py-2 text-right font-medium">{money(detail.contributionProfit)}</td>
                      </tr>
                    ))}
                    {!(detailRow.serviceDetails ?? []).length ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">暂无服务明细</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
