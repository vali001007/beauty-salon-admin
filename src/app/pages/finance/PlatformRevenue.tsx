import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { getPlatformRevenue, type PlatformRevenueSummary } from '@/api/commission';

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value?: number | null) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function periodValueType(period: string) {
  if (period === 'year') return 'number';
  return period === 'quarter' ? 'text' : 'month';
}

function defaultValueFor(period: string) {
  const date = new Date();
  if (period === 'year') return String(date.getFullYear());
  if (period === 'quarter') return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  return currentMonth();
}

export function PlatformRevenue() {
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [value, setValue] = useState(currentMonth());
  const [summary, setSummary] = useState<PlatformRevenueSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlatformRevenue({ period, value });
      setSummary(data);
    } catch (error: any) {
      toast.error(error?.message || '加载平台收入报表失败');
    } finally {
      setLoading(false);
    }
  }, [period, value]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const revenueParts = useMemo(
    () => [
      { label: '数字员工订阅', value: summary?.amiSubscription.total ?? 0 },
      { label: '数字员工提成', value: summary?.amiCommission.total ?? 0 },
      { label: '供应链返利', value: summary?.supplyChainRebate.total ?? 0 },
      { label: '供应链服务费', value: summary?.supplyChainFee.total ?? 0 },
    ],
    [summary],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">平台收入报表</h1>
          <p className="mt-1 text-sm text-muted-foreground">汇总数字员工订阅、绩效提成和供应链抽佣，支持按月、季度、年度查看。</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={period}
          onChange={(event) => {
            const next = event.target.value as 'month' | 'quarter' | 'year';
            setPeriod(next);
            setValue(defaultValueFor(next));
          }}
        >
          <option value="month">按月</option>
          <option value="quarter">按季度</option>
          <option value="year">按年度</option>
        </select>
        <input
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          type={periodValueType(period)}
          placeholder={period === 'quarter' ? 'YYYY-Q1' : undefined}
          min={period === 'year' ? 2020 : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">总收入</div>
          <div className="mt-2 text-2xl font-semibold">{money(summary?.totalRevenue)}</div>
          <div className="mt-1 text-xs text-emerald-700">仅已确认及后续状态</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-800">预计收入</div>
          <div className="mt-2 text-2xl font-semibold text-amber-900">{money(summary?.estimatedRevenue)}</div>
          <div className="mt-1 text-xs text-amber-700">草稿 Ami 账单，不计入总收入</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">环比</div>
          <div className="mt-2 text-2xl font-semibold">{Number(summary?.monthOverMonth ?? 0).toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">ARPU</div>
          <div className="mt-2 text-2xl font-semibold">{money(summary?.arpu)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">年化收入估算</div>
          <div className="mt-2 text-2xl font-semibold">{money(summary?.annualizedRevenueEstimate ?? summary?.ltvEstimate)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4" /> 收入构成
          </div>
          <div className="space-y-3">
            {revenueParts.map((part) => {
              const percent = summary?.totalRevenue ? Math.round((part.value / summary.totalRevenue) * 1000) / 10 : 0;
              return (
                <div key={part.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{part.label}</span>
                    <span>{money(part.value)} / {percent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 text-sm font-medium">可追溯记录</div>
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between rounded-md bg-muted/40 p-3">
              <span>Ami 账单</span>
              <span>{(summary?.amiSubscription.records?.length ?? 0)} 条</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/40 p-3">
              <span>供应商结算</span>
              <span>{(summary?.supplyChainRebate.records?.length ?? 0)} 条</span>
            </div>
            <div className="flex justify-between rounded-md bg-muted/40 p-3">
              <span>供应链采购单</span>
              <span>{summary?.supplyChainRebate.orderCount ?? 0} 单</span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">月度趋势</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月份</TableHead>
                <TableHead>订阅</TableHead>
                <TableHead>Ami 提成</TableHead>
                <TableHead>供应链</TableHead>
                <TableHead>合计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary?.monthTrend ?? []).map((item) => (
                <TableRow key={item.month}>
                  <TableCell className="font-medium">{item.month}</TableCell>
                  <TableCell>{money(item.amiSubscription)}</TableCell>
                  <TableCell>{money(item.amiCommission)}</TableCell>
                  <TableCell>{money(item.supplyChainRebate + item.supplyChainFee)}</TableCell>
                  <TableCell className="font-medium">{money(item.totalRevenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">门店贡献排行</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>门店</TableHead>
                <TableHead>订阅</TableHead>
                <TableHead>Ami 提成</TableHead>
                <TableHead>合计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary?.storeRanking ?? []).map((item) => (
                <TableRow key={item.storeId}>
                  <TableCell className="font-medium">{item.storeName}</TableCell>
                  <TableCell>{money(item.amiSubscription)}</TableCell>
                  <TableCell>{money(item.amiCommission)}</TableCell>
                  <TableCell className="font-medium">{money(item.totalRevenue)}</TableCell>
                </TableRow>
              ))}
              {!summary?.storeRanking?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    当前周期暂无门店收入数据。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
