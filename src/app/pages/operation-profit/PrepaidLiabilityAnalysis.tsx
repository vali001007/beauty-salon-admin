import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getPrepaidLiabilities, type PrepaidLiabilityRow } from '@/api/operationProfit';
import type { PrepaidLiabilitySummary } from '@/types/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import {
  dateText,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  compactMoney,
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

type LiabilityPageMode = 'balance' | 'card';
const DEFAULT_PAGE_SIZE = 10;

const pageCopy: Record<
  LiabilityPageMode,
  {
    title: string;
    description: string;
    keywordPlaceholder: string;
    riskOnlyLabel: string;
    emptyLabel: string;
    loadError: string;
  }
> = {
  balance: {
    title: '会员卡（储值）履约',
    description: '独立查看会员储值现金余额和赠送余额形成的待履约权益，识别高余额、沉睡和长期未消费客户。',
    keywordPlaceholder: '搜索客户、权益名称、流水号',
    riskOnlyLabel: '只看有风险的储值权益',
    emptyLabel: '当前没有符合条件的储值履约风险',
    loadError: '会员卡（储值）履约加载失败',
  },
  card: {
    title: '次卡履约',
    description: '独立查看次卡剩余次数折算的待履约权益，识别临期、沉睡和高剩余权益客户。',
    keywordPlaceholder: '搜索客户、卡项名称、订单号',
    riskOnlyLabel: '只看有风险的次卡权益',
    emptyLabel: '当前没有符合条件的次卡履约风险',
    loadError: '次卡履约加载失败',
  },
};

function CompactMetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3 py-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold leading-tight text-foreground">{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function PaginationBar({
  page,
  pageSize,
  total,
  loading,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <div className="text-sm text-muted-foreground">
        共 {total} 条，当前 {from}-{to}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
          上一页
        </Button>
        <span className="text-sm text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          下一页
        </Button>
      </div>
    </div>
  );
}

function PrepaidLiabilityPage({ mode }: { mode: LiabilityPageMode }) {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [riskOnly, setRiskOnly] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PrepaidLiabilityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [serverSummary, setServerSummary] = useState<PrepaidLiabilitySummary | undefined>();
  const [loading, setLoading] = useState(false);
  const copy = pageCopy[mode];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getPrepaidLiabilities({
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        storeId: currentStoreId ?? undefined,
        riskOnly,
        type: mode,
        keyword: keyword.trim() || undefined,
      });
      setRows(response.items);
      setTotal(response.total);
      setServerSummary(response.summary);
    } catch (error) {
      toast.error(errorMessage(error, copy.loadError));
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, currentStoreId, riskOnly, mode, keyword, page]);

  useEffect(() => {
    setPage(1);
  }, [currentStoreId, riskOnly, mode, keyword]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const fallbackSummary = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          totalLiability: sum.totalLiability + row.estimatedRemainingValue,
          cardLiability: sum.cardLiability + (row.liabilityType !== 'balance' ? row.estimatedRemainingValue : 0),
          balanceLiability: sum.balanceLiability + (row.liabilityType === 'balance' ? row.estimatedRemainingValue : 0),
          cashBalance: sum.cashBalance + Number(row.cashBalance ?? 0),
          giftBalance: sum.giftBalance + Number(row.giftBalance ?? 0),
          cardRecognizedIncome: sum.cardRecognizedIncome + (row.liabilityType !== 'balance' ? Number(row.recognizedIncome ?? 0) : 0),
          remainingTimes: sum.remainingTimes + Number(row.remainingTimes ?? 0),
          highRisk: sum.highRisk + (row.riskLevel === 'high' ? 1 : 0),
          mediumRisk: sum.mediumRisk + (row.riskLevel === 'medium' ? 1 : 0),
        }),
        { totalLiability: 0, cardLiability: 0, balanceLiability: 0, cashBalance: 0, giftBalance: 0, cardRecognizedIncome: 0, remainingTimes: 0, highRisk: 0, mediumRisk: 0 },
      ),
    [rows],
  );
  const summary = serverSummary ?? fallbackSummary;
  const remainingTimes = summary.remainingTimes ?? 0;
  const highRiskCount = summary.highRisk;
  const mediumRiskCount = summary.mediumRisk;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={copy.keywordPlaceholder}
          className="h-10 min-w-64 rounded-md border border-border bg-background px-3 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} />
          {copy.riskOnlyLabel}
        </label>
      </div>

      {mode === 'balance' ? (
        <section className="grid grid-cols-5 gap-2">
          <CompactMetricCard label="储值" value={String(total)} hint={`每页 ${DEFAULT_PAGE_SIZE} 条`} />
          <CompactMetricCard label="余额" value={compactMoney(summary.balanceLiability)} />
          <CompactMetricCard label="现金" value={compactMoney(summary.cashBalance)} />
          <CompactMetricCard label="赠送" value={compactMoney(summary.giftBalance)} />
          <CompactMetricCard label="风险" value={String(highRiskCount)} hint={`中危 ${mediumRiskCount}`} />
        </section>
      ) : (
        <section className="grid gap-2 md:grid-cols-5">
          <CompactMetricCard label="次卡" value={String(total)} hint={`每页 ${DEFAULT_PAGE_SIZE} 条`} />
          <CompactMetricCard label="权益" value={compactMoney(summary.cardLiability)} />
          <CompactMetricCard label="已履约收入" value={compactMoney(summary.cardRecognizedIncome)} hint="次卡核销确认收入" />
          <CompactMetricCard label="次数" value={String(remainingTimes)} />
          <CompactMetricCard label="风险" value={String(highRiskCount)} hint={`中危 ${mediumRiskCount}`} />
        </section>
      )}

      {loading && !rows.length ? (
        <LoadingBlock />
      ) : rows.length ? (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              {mode === 'balance' ? (
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead>权益名称</TableHead>
                  <TableHead>风险</TableHead>
                  <TableHead className="text-right">现金余额</TableHead>
                  <TableHead className="text-right">赠送余额</TableHead>
                  <TableHead className="text-right">待履约余额</TableHead>
                  <TableHead>最近流水</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead>卡项</TableHead>
                  <TableHead>风险</TableHead>
                  <TableHead className="text-right">剩余次数</TableHead>
                  <TableHead className="text-right">剩余权益估算</TableHead>
                  <TableHead>到期日</TableHead>
                  <TableHead>最近核销</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.liabilityType ?? 'card'}-${row.customerCardId || row.customerId}`}>
                  <TableCell>
                    <div className="font-medium">{row.customerName || `客户 ${row.customerId}`}</div>
                    <div className="mt-1 text-xs text-muted-foreground">ID {row.customerId}</div>
                  </TableCell>
                  <TableCell>
                    <div>{row.cardName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {mode === 'balance' ? '会员卡储值余额' : `总次数 ${row.totalTimes}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.riskLevel)}>{riskLabels[row.riskLevel] ?? row.riskLevel}</StatusBadge>
                  </TableCell>
                  {mode === 'balance' ? (
                    <>
                      <TableCell className="text-right">{money(row.cashBalance ?? 0)}</TableCell>
                      <TableCell className="text-right">{money(row.giftBalance ?? 0)}</TableCell>
                      <TableCell className="text-right font-medium">{money(row.estimatedRemainingValue)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-right">{row.remainingTimes}</TableCell>
                      <TableCell className="text-right font-medium">{money(row.estimatedRemainingValue)}</TableCell>
                      <TableCell>{dateText(row.expiryDate)}</TableCell>
                    </>
                  )}
                  <TableCell>
                    <div>{dateText(row.lastUsedAt)}</div>
                    {row.lastTransactionOrderNo ? <div className="mt-1 text-xs text-muted-foreground">{row.lastTransactionOrderNo}</div> : null}
                  </TableCell>
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
          <PaginationBar page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} loading={loading} onPageChange={setPage} />
        </div>
      ) : (
        <EmptyBlock label={copy.emptyLabel} />
      )}
    </div>
  );
}

export function PrepaidLiabilityAnalysis() {
  return <PrepaidLiabilityPage mode="balance" />;
}

export function CardPackageLiabilityAnalysis() {
  return <PrepaidLiabilityPage mode="card" />;
}
