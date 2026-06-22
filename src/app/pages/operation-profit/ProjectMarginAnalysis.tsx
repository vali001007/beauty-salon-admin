import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getProjectMargins, type ProjectMarginRow } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import {
  DateRangeFilters,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
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
  needs_optimization: '需优化',
  cost_missing: '成本缺口',
};

const PAGE_SIZE = 100;

function materialCostForMargin(row: ProjectMarginRow) {
  return row.actualMaterialCost > 0 ? row.actualMaterialCost : row.standardMaterialCost;
}

export function ProjectMarginAnalysis() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [filters, setFilters] = useState({ from: monthStartText(), to: todayText(), status: '' });
  const [rows, setRows] = useState<ProjectMarginRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getProjectMargins({
        page,
        pageSize: PAGE_SIZE,
        storeId: currentStoreId ?? undefined,
        from: filters.from,
        to: filters.to,
        status: filters.status || undefined,
      });
      setRows(response.items);
      setTotal(response.total);
    } catch (error) {
      toast.error(errorMessage(error, '项目毛利加载失败'));
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
          serviceIncome: sum.serviceIncome + row.serviceIncome,
          materialCost: sum.materialCost + materialCostForMargin(row),
          commissionCost: sum.commissionCost + row.commissionCost,
          contributionProfit: sum.contributionProfit + row.contributionProfit,
          missingCount: sum.missingCount + (row.missingCostReasons.length ? 1 : 0),
        }),
        { serviceIncome: 0, materialCost: 0, commissionCost: 0, contributionProfit: 0, missingCount: 0 },
      ),
    [rows],
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const updateFilters = (patch: Partial<typeof filters>) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="项目毛利"
        description="按项目拆解收入、耗材成本、提成成本和贡献毛利，优先暴露高收入低毛利与成本缺口项目。"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilters from={filters.from} to={filters.to} loading={loading} onChange={updateFilters} onRefresh={() => void loadData()} />
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
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="项目数" value={String(total)} hint={`当前页 ${rows.length} 项`} />
        <MetricCard label="当前页项目收入" value={money(summary.serviceIncome)} />
        <MetricCard label="当前页耗材成本" value={money(summary.materialCost)} />
        <MetricCard label="当前页提成成本" value={money(summary.commissionCost)} />
        <MetricCard label="当前页贡献毛利" value={money(summary.contributionProfit)} hint={`${summary.missingCount} 个项目有成本缺口`} />
      </section>

      {loading && !rows.length ? (
        <LoadingBlock />
      ) : rows.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>项目</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">服务次数</TableHead>
                <TableHead className="text-right">收入</TableHead>
                <TableHead className="text-right">成交均价</TableHead>
                <TableHead className="text-right">耗材成本</TableHead>
                <TableHead className="text-right">提成</TableHead>
                <TableHead className="text-right">贡献毛利</TableHead>
                <TableHead className="text-right">毛利率</TableHead>
                <TableHead>缺口</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const materialCost = materialCostForMargin(row);
                return (
                  <TableRow key={row.projectId}>
                    <TableCell>
                      <div className="font-medium">{row.projectName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.projectType || '未分类'} / 标价 {money(row.standardPrice)}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(row.status)}>{statusLabels[row.status] ?? row.status}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">{row.serviceCount}</TableCell>
                    <TableCell className="text-right">{money(row.serviceIncome)}</TableCell>
                    <TableCell className="text-right">{money(row.avgDealPrice)}</TableCell>
                    <TableCell className="text-right">
                      <div>{money(materialCost)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">实耗 {money(row.actualMaterialCost)} / BOM {money(row.standardMaterialCost)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.actualMaterialCost > 0 ? '按实际耗材扣减' : '按 BOM 标准扣减'}</div>
                    </TableCell>
                    <TableCell className="text-right">{money(row.commissionCost)}</TableCell>
                    <TableCell className="text-right font-medium">{money(row.contributionProfit)}</TableCell>
                    <TableCell className="text-right">{percent(row.marginRate)}</TableCell>
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
                );
              })}
            </TableBody>
          </Table>
          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
              <span>
                第 {page} / {totalPages} 页，共 {total} 个项目
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label="上一页项目毛利"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="下一页项目毛利"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={loading || page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyBlock label="当前筛选条件下暂无项目毛利数据" />
      )}
    </div>
  );
}
