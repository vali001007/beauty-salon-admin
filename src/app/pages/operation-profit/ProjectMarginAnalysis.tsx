import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getProjectMargins, type ProjectMarginRow } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
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
  needs_optimization: '需优化',
  cost_missing: '成本缺口',
};

const PAGE_SIZE = 100;

function materialCostForMargin(row: ProjectMarginRow) {
  return row.actualMaterialCost > 0 ? row.actualMaterialCost : row.standardMaterialCost;
}

function CompactMetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold leading-tight text-foreground">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

type ProjectMarginOrderDetail = NonNullable<ProjectMarginRow['sourceOrders']>[number];
type ProjectMarginCardUsageDetail = NonNullable<ProjectMarginRow['sourceCardUsages']>[number];

type ProjectMarginUnifiedSource = {
  key: string;
  sourceType: 'project_order' | 'card_usage';
  sourceLabel: '项目订单' | '次卡核销';
  sourceTone: string;
  sourceNo: string;
  date?: string;
  customerName: string;
  relatedInfo: string;
  quantity: number;
  income: number;
  materialCost: number;
  commissionCost: number;
  totalCost: number;
  grossProfit: number;
  marginRate: number;
};

function resolveMarginRate(sourceMarginRate: number | undefined, income: number, grossProfit: number) {
  if (typeof sourceMarginRate === 'number') return sourceMarginRate;
  return income > 0 ? grossProfit / income : 0;
}

function mapOrderSource(source: ProjectMarginOrderDetail): ProjectMarginUnifiedSource {
  const materialCost = Number(source.materialCost ?? 0);
  const commissionCost = Number(source.commissionCost ?? 0);
  const totalCost = Number(source.totalCost ?? materialCost + commissionCost);
  const grossProfit = Number(source.grossProfit ?? source.amount - totalCost);
  return {
    key: `project-${source.orderId}-${source.orderItemId}`,
    sourceType: 'project_order',
    sourceLabel: '项目订单',
    sourceTone: 'border-blue-200 bg-blue-50 text-blue-700',
    sourceNo: source.orderNo || String(source.orderId),
    date: source.orderedAt,
    customerName: source.customerName || '散客',
    relatedInfo: '-',
    quantity: source.quantity,
    income: source.amount,
    materialCost,
    commissionCost,
    totalCost,
    grossProfit,
    marginRate: resolveMarginRate(source.marginRate, source.amount, grossProfit),
  };
}

function mapCardUsageSource(source: ProjectMarginCardUsageDetail): ProjectMarginUnifiedSource {
  const materialCost = Number(source.materialCost ?? 0);
  const commissionCost = Number(source.commissionCost ?? 0);
  const totalCost = Number(source.totalCost ?? materialCost + commissionCost);
  const grossProfit = Number(source.grossProfit ?? source.recognizedAmount - totalCost);
  return {
    key: `card-usage-${source.id}`,
    sourceType: 'card_usage',
    sourceLabel: '次卡核销',
    sourceTone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    sourceNo: `#${source.id}`,
    date: source.verifiedAt,
    customerName: source.customerName || (source.customerId ? `客户 ${source.customerId}` : '散客'),
    relatedInfo: source.cardName || source.sourceOrderNo || (source.sourceOrderId ? String(source.sourceOrderId) : '-'),
    quantity: source.times,
    income: source.recognizedAmount,
    materialCost,
    commissionCost,
    totalCost,
    grossProfit,
    marginRate: resolveMarginRate(source.marginRate, source.recognizedAmount, grossProfit),
  };
}

function buildUnifiedSources(row: ProjectMarginRow | null): ProjectMarginUnifiedSource[] {
  if (!row) return [];
  return [
    ...(row.sourceOrders ?? []).map(mapOrderSource),
    ...(row.sourceCardUsages ?? []).map(mapCardUsageSource),
  ].sort((left, right) => String(left.date ?? '').localeCompare(String(right.date ?? '')));
}

export function ProjectMarginAnalysis() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [filters, setFilters] = useState({ from: monthStartText(), to: todayText(), status: '' });
  const [rows, setRows] = useState<ProjectMarginRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<ProjectMarginRow | null>(null);

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

  useEffect(() => {
    const handleProjectBomUpdated = () => {
      void loadData();
    };
    window.addEventListener('project-bom-updated', handleProjectBomUpdated);
    return () => window.removeEventListener('project-bom-updated', handleProjectBomUpdated);
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
  const selectedSources = useMemo(() => buildUnifiedSources(selectedRow), [selectedRow]);
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

      <section className="grid grid-cols-5 gap-2">
        <CompactMetricCard label="项目" value={String(total)} hint={`${rows.length} 项`} />
        <CompactMetricCard label="收入" value={compactMoney(summary.serviceIncome)} />
        <CompactMetricCard label="耗材" value={compactMoney(summary.materialCost)} />
        <CompactMetricCard label="提成" value={compactMoney(summary.commissionCost)} />
        <CompactMetricCard label="当前页贡献毛利" value={compactMoney(summary.contributionProfit)} hint={`缺口 ${summary.missingCount}`} />
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
                <TableHead className="text-right">操作</TableHead>
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
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setSelectedRow(row)}>
                        <FileText className="h-4 w-4" />
                        查看订单
                      </Button>
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

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>订单明细 - {selectedRow?.projectName}</DialogTitle>
            <DialogDescription>
              项目订单 {selectedRow?.sourceOrders?.length ?? 0} 条，次卡核销 {selectedRow?.sourceCardUsages?.length ?? 0} 条；收入、耗材和提成已计入项目毛利汇总。
            </DialogDescription>
          </DialogHeader>

          {selectedSources.length ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>来源</TableHead>
                    <TableHead>编号</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>客户</TableHead>
                    <TableHead>卡项/来源</TableHead>
                    <TableHead className="text-right">数量/次数</TableHead>
                    <TableHead className="text-right">收入</TableHead>
                    <TableHead className="text-right">耗材成本</TableHead>
                    <TableHead className="text-right">提成</TableHead>
                    <TableHead className="text-right">总成本</TableHead>
                    <TableHead className="text-right">毛利</TableHead>
                    <TableHead className="text-right">毛利率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedSources.map((source) => (
                    <TableRow key={source.key}>
                      <TableCell>
                        <StatusBadge tone={source.sourceTone}>{source.sourceLabel}</StatusBadge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{source.sourceNo}</TableCell>
                      <TableCell>{source.date ? String(source.date).slice(0, 10) : '-'}</TableCell>
                      <TableCell>{source.customerName}</TableCell>
                      <TableCell>{source.relatedInfo}</TableCell>
                      <TableCell className="text-right">{source.quantity}</TableCell>
                      <TableCell className="text-right">{money(source.income)}</TableCell>
                      <TableCell className="text-right">{money(source.materialCost)}</TableCell>
                      <TableCell className="text-right">{money(source.commissionCost)}</TableCell>
                      <TableCell className="text-right">{money(source.totalCost)}</TableCell>
                      <TableCell className="text-right font-medium">{money(source.grossProfit)}</TableCell>
                      <TableCell className="text-right">{percent(source.marginRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyBlock label="暂无订单或次卡核销明细" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
