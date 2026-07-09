import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getProductMargins, type ProductCostSource, type ProductMarginRow } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  DateRangeFilters,
  EmptyBlock,
  compactMoney,
  errorMessage,
  LoadingBlock,
  missingReasonLabels,
  money,
  monthStartText,
  PageHeader,
  percent,
  statusTone,
  StatusBadge,
  todayText,
} from './utils';

const statusLabels: Record<string, string> = {
  high_profit: '高毛利',
  normal: '正常',
  low_margin: '低毛利',
  loss: '亏损',
  cost_missing: '成本缺口',
};

const costSourceLabels: Record<ProductCostSource, string> = {
  batch_snapshot: '批次成本',
  order_snapshot: '订单快照',
  product_master_estimate: '商品主档估算',
  legacy_missing_snapshot: '旧流水估算',
  missing: '缺成本',
  mixed: '多来源',
};

const sortLabels: Record<string, string> = {
  grossProfit: '按毛利额',
  salesAmount: '按销售额',
  marginRate: '按毛利率',
  quantity: '按销量',
};

const PAGE_SIZE = 100;

function CompactMetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold leading-tight text-foreground">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function ProductMarginAnalysis() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [filters, setFilters] = useState({
    from: monthStartText(),
    to: todayText(),
    status: '',
    keyword: '',
    sortBy: 'grossProfit' as 'salesAmount' | 'grossProfit' | 'marginRate' | 'quantity',
  });
  const [rows, setRows] = useState<ProductMarginRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<ProductMarginRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getProductMargins({
        page,
        pageSize: PAGE_SIZE,
        storeId: currentStoreId ?? undefined,
        from: filters.from,
        to: filters.to,
        status: filters.status || undefined,
        keyword: filters.keyword.trim() || undefined,
        sortBy: filters.sortBy,
      });
      setRows(response.items);
      setTotal(response.total);
    } catch (error) {
      toast.error(errorMessage(error, '商品毛利加载失败'));
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, filters, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          quantitySold: sum.quantitySold + row.quantitySold,
          netSalesAmount: sum.netSalesAmount + row.netSalesAmount,
          productCost: sum.productCost + row.productCost,
          commissionCost: sum.commissionCost + row.commissionCost,
          grossProfit: sum.grossProfit + row.grossProfit,
          missingCount: sum.missingCount + (row.missingCostReasons.length ? 1 : 0),
          lossCount: sum.lossCount + (row.status === 'loss' ? 1 : 0),
        }),
        { quantitySold: 0, netSalesAmount: 0, productCost: 0, commissionCost: 0, grossProfit: 0, missingCount: 0, lossCount: 0 },
      ),
    [rows],
  );
  const marginRate = summary.netSalesAmount > 0 ? summary.grossProfit / summary.netSalesAmount : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const updateFilters = (patch: Partial<typeof filters>) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="商品毛利"
        description="按商品拆解销售收入、商品成本、提成成本和毛利率，识别高利润主推品、低毛利商品和成本缺口。"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilters from={filters.from} to={filters.to} loading={loading} onChange={updateFilters} onRefresh={() => void loadData()} />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 w-64 pl-9"
            placeholder="搜索商品名、SKU、品牌"
            value={filters.keyword}
            onChange={(event) => updateFilters({ keyword: event.target.value })}
          />
        </div>
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.status}
          onChange={(event) => updateFilters({ status: event.target.value })}
        >
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.sortBy}
          onChange={(event) => updateFilters({ sortBy: event.target.value as typeof filters.sortBy })}
        >
          {Object.entries(sortLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <section className="grid grid-cols-6 gap-2">
        <CompactMetricCard label="商品" value={String(total)} hint={`${rows.length} 个`} />
        <CompactMetricCard label="销量" value={String(summary.quantitySold)} />
        <CompactMetricCard label="当前页商品毛利" value={compactMoney(summary.netSalesAmount)} />
        <CompactMetricCard label="成本" value={compactMoney(summary.productCost)} />
        <CompactMetricCard label="提成" value={compactMoney(summary.commissionCost)} />
        <CompactMetricCard label="毛利" value={compactMoney(summary.grossProfit)} hint={`${percent(marginRate)} / 缺口 ${summary.missingCount}`} />
      </section>

      {summary.lossCount > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          当前筛选范围有 {summary.lossCount} 个商品为亏损状态，建议优先检查折扣、商品成本和提成规则。
        </div>
      ) : null}

      {loading && !rows.length ? (
        <LoadingBlock />
      ) : rows.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">销量</TableHead>
                <TableHead className="text-right">净收入</TableHead>
                <TableHead className="text-right">成交均价</TableHead>
                <TableHead className="text-right">单位成本</TableHead>
                <TableHead className="text-right">商品成本</TableHead>
                <TableHead className="text-right">提成</TableHead>
                <TableHead className="text-right">毛利</TableHead>
                <TableHead className="text-right">毛利率</TableHead>
                <TableHead>成本来源/缺口</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell>
                    <div className="font-medium">{row.productName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.sku || '无 SKU'} / {row.categoryName || '未分类'}{row.brand ? ` / ${row.brand}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>{statusLabels[row.status] ?? row.status}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">{row.quantitySold}</TableCell>
                  <TableCell className="text-right">
                    <div>{money(row.netSalesAmount)}</div>
                    {row.refundAmount > 0 ? <div className="mt-1 text-xs text-muted-foreground">退款 {money(row.refundAmount)}</div> : null}
                  </TableCell>
                  <TableCell className="text-right">{money(row.avgDealPrice)}</TableCell>
                  <TableCell className="text-right">{money(row.unitCost)}</TableCell>
                  <TableCell className="text-right">{money(row.productCost)}</TableCell>
                  <TableCell className="text-right">{money(row.commissionCost)}</TableCell>
                  <TableCell className="text-right font-medium">{money(row.grossProfit)}</TableCell>
                  <TableCell className="text-right">{percent(row.marginRate)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge tone={row.costSource === 'missing' ? statusTone('cost_missing') : 'border-blue-200 bg-blue-50 text-blue-700'}>
                        {costSourceLabels[row.costSource] ?? row.costSource}
                      </StatusBadge>
                      {row.missingCostReasons.map((reason) => (
                        <StatusBadge key={reason} tone="border-amber-200 bg-amber-50 text-amber-700">
                          {missingReasonLabels[reason] ?? reason}
                        </StatusBadge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setSelectedRow(row)}>
                      <FileText className="h-4 w-4" />
                      订单明细
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
              <span>
                第 {page} / {totalPages} 页，共 {total} 个商品
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="上一页商品毛利"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="下一页商品毛利"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={loading || page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyBlock label="当前筛选条件下暂无商品毛利数据" />
      )}

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>订单明细 - {selectedRow?.productName}</DialogTitle>
            <DialogDescription>
              当前商品共 {selectedRow?.orderCount ?? selectedRow?.sourceOrders?.length ?? 0} 单，按商品订单明细汇总收入、退款、提成和毛利。
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单编号</TableHead>
                <TableHead>下单日期</TableHead>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">销售额</TableHead>
                <TableHead className="text-right">退款</TableHead>
                <TableHead className="text-right">净收入</TableHead>
                <TableHead className="text-right">成本单价</TableHead>
                <TableHead className="text-right">成本小计</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="text-right">提成</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(selectedRow?.sourceOrders ?? []).map((source) => (
                <TableRow key={`${source.orderId}-${source.orderItemId}`}>
                  <TableCell className="font-mono text-sm">{source.orderNo}</TableCell>
                  <TableCell>{source.orderedAt || '-'}</TableCell>
                  <TableCell>{source.customerName || '散客'}</TableCell>
                  <TableCell className="text-right">{source.quantity}</TableCell>
                  <TableCell className="text-right">{money(source.salesAmount)}</TableCell>
                  <TableCell className="text-right">{money(source.refundAmount)}</TableCell>
                  <TableCell className="text-right">{money(source.netSalesAmount)}</TableCell>
                  <TableCell className="text-right">{money(source.unitCost)}</TableCell>
                  <TableCell className="text-right">{money(source.productCost)}</TableCell>
                  <TableCell>
                    <div>{costSourceLabels[source.costSource ?? 'missing'] ?? source.costSource ?? '-'}</div>
                    {source.costSourceNo ? <div className="mt-1 text-xs text-muted-foreground">{source.costSourceNo}</div> : null}
                  </TableCell>
                  <TableCell className="text-right">{money(source.commissionCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {selectedRow && (selectedRow.orderCount ?? 0) > (selectedRow.sourceOrders?.length ?? 0) ? (
            <div className="text-xs text-muted-foreground">
              已显示最近 {selectedRow.sourceOrders?.length ?? 0} 单，另外 {(selectedRow.orderCount ?? 0) - (selectedRow.sourceOrders?.length ?? 0)} 单已计入上方商品毛利汇总。
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
