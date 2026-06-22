import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getPrepaidLiabilities, type PrepaidLiabilityRow } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import {
  dateText,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  money,
  PageHeader,
  statusTone,
  StatusBadge,
} from './utils';

const riskLabels: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export function PrepaidLiabilityAnalysis() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [riskOnly, setRiskOnly] = useState(true);
  const [rows, setRows] = useState<PrepaidLiabilityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getPrepaidLiabilities({ page: 1, pageSize: 100, storeId: currentStoreId ?? undefined, riskOnly });
      setRows(page.items);
      setTotal(page.total);
    } catch (error) {
      toast.error(errorMessage(error, '会员卡履约加载失败'));
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, riskOnly]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          estimatedRemainingValue: sum.estimatedRemainingValue + row.estimatedRemainingValue,
          highRisk: sum.highRisk + (row.riskLevel === 'high' ? 1 : 0),
          mediumRisk: sum.mediumRisk + (row.riskLevel === 'medium' ? 1 : 0),
          remainingTimes: sum.remainingTimes + Number(row.remainingTimes ?? 0),
        }),
        { estimatedRemainingValue: 0, highRisk: 0, mediumRisk: 0, remainingTimes: 0 },
      ),
    [rows],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="会员卡履约"
        description="把会员卡剩余次数折算为待履约权益，识别临期、沉睡和高剩余权益客户。"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} />
          只看有风险的会员卡
        </label>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="会员卡数" value={String(total)} hint={`当前加载 ${rows.length} 张`} />
        <MetricCard label="剩余权益估算" value={money(summary.estimatedRemainingValue)} />
        <MetricCard label="剩余次数" value={String(summary.remainingTimes)} />
        <MetricCard label="高风险" value={String(summary.highRisk)} />
        <MetricCard label="中风险" value={String(summary.mediumRisk)} />
      </section>

      {loading && !rows.length ? (
        <LoadingBlock />
      ) : rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客户</TableHead>
              <TableHead>卡项</TableHead>
              <TableHead>风险</TableHead>
              <TableHead className="text-right">剩余次数</TableHead>
              <TableHead className="text-right">剩余权益估算</TableHead>
              <TableHead>到期日</TableHead>
              <TableHead>最近消课</TableHead>
              <TableHead>原因</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.customerCardId}>
                <TableCell>
                  <div className="font-medium">{row.customerName || `客户 ${row.customerId}`}</div>
                  <div className="mt-1 text-xs text-muted-foreground">ID {row.customerId}</div>
                </TableCell>
                <TableCell>
                  <div>{row.cardName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">总次数 {row.totalTimes}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone(row.riskLevel)}>{riskLabels[row.riskLevel] ?? row.riskLevel}</StatusBadge>
                </TableCell>
                <TableCell className="text-right">{row.remainingTimes}</TableCell>
                <TableCell className="text-right font-medium">{money(row.estimatedRemainingValue)}</TableCell>
                <TableCell>{dateText(row.expiryDate)}</TableCell>
                <TableCell>{dateText(row.lastUsedAt)}</TableCell>
                <TableCell>
                  {row.riskReasons.length ? (
                    <div className="flex flex-wrap gap-1">
                      {row.riskReasons.map((reason) => (
                        <StatusBadge key={reason} tone="border-amber-200 bg-amber-50 text-amber-700">
                          {reason}
                        </StatusBadge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">暂无</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyBlock label="当前没有符合条件的会员卡履约风险" />
      )}
    </div>
  );
}
