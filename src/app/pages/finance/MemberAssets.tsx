import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CreditCard, RefreshCcw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { getPrepaidLiabilities, type PrepaidLiabilityRow } from '@/api/operationProfit';
import type { PrepaidLiabilitySummary } from '@/types/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button } from '../../components/UI';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { CardPackageLiabilityAnalysis, PrepaidLiabilityAnalysis } from '../operation-profit/PrepaidLiabilityAnalysis';
import { compactMoney, money } from '../operation-profit/utils';

type MemberAssetTab = 'balance' | 'cards' | 'risks';
const DEFAULT_PAGE_SIZE = 10;

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
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

function useMemberAssetData(riskPage: number) {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [liabilitySummary, setLiabilitySummary] = useState<PrepaidLiabilitySummary | undefined>();
  const [riskRows, setRiskRows] = useState<PrepaidLiabilityRow[]>([]);
  const [riskTotal, setRiskTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const baseStoreParams = currentStoreId ? { storeId: currentStoreId } : {};
      const [liabilities, risks] = await Promise.all([
        getPrepaidLiabilities({ ...baseStoreParams, page: 1, pageSize: 1, type: 'all' }),
        getPrepaidLiabilities({ ...baseStoreParams, page: riskPage, pageSize: DEFAULT_PAGE_SIZE, type: 'all', riskOnly: true }),
      ]);
      setLiabilitySummary(liabilities.summary);
      setRiskRows(risks.items);
      setRiskTotal(risks.total);
    } catch (error: any) {
      toast.error(error?.message || '加载会员资产数据失败');
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, riskPage]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return { liabilitySummary, riskRows, riskTotal, loading, loadData };
}

function RiskCustomersPane({
  summary,
  rows,
  total,
  page,
  loading,
  onRefresh,
  onPageChange,
}: {
  summary?: PrepaidLiabilitySummary;
  rows: PrepaidLiabilityRow[];
  total: number;
  page: number;
  loading: boolean;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
}) {
  const highRiskCount = summary?.highRisk ?? 0;
  const mediumRiskCount = summary?.mediumRisk ?? 0;
  const riskTotal = highRiskCount + mediumRiskCount;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-foreground">风险客户</div>
          <p className="mt-1 text-sm text-muted-foreground">高余额、临期、长期未消课和剩余权益较高的客户集中处理。</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={onRefresh} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="会员总负债" value={compactMoney(summary?.totalLiability)} />
        <MetricCard label="储值余额" value={compactMoney(summary?.balanceLiability)} />
        <MetricCard label="次卡剩余权益" value={compactMoney(summary?.cardLiability)} />
        <MetricCard label="风险客户" value={`${riskTotal}`} hint={`高风险 ${highRiskCount} / 中风险 ${mediumRiskCount}`} />
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1fr_1fr_0.8fr_1.2fr] gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground">
          <div>客户</div>
          <div>资产</div>
          <div>风险</div>
          <div>原因</div>
        </div>
        {rows.length ? (
          rows.map((row) => (
            <div key={`${row.liabilityType}-${row.customerId}-${row.customerCardId}`} className="grid grid-cols-[1fr_1fr_0.8fr_1.2fr] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0">
              <div>
                <div className="font-medium text-foreground">{row.customerName || `客户 ${row.customerId}`}</div>
                <div className="mt-1 text-xs text-muted-foreground">#{row.customerId}</div>
              </div>
              <div>
                <div>{row.cardName}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {row.liabilityType === 'balance' ? `现金 ${money(row.cashBalance)} / 赠送 ${money(row.giftBalance)}` : `剩余 ${row.remainingTimes}/${row.totalTimes} 次`}
                </div>
              </div>
              <div className={row.riskLevel === 'high' ? 'text-red-700' : row.riskLevel === 'medium' ? 'text-amber-700' : 'text-emerald-700'}>
                {row.riskLevel === 'high' ? '高风险' : row.riskLevel === 'medium' ? '中风险' : '低风险'}
              </div>
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                {row.riskReasons.length ? row.riskReasons.map((reason) => <span key={reason} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">{reason}</span>) : '暂无'}
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {loading ? '正在读取风险客户...' : '暂无中高风险会员资产。'}
          </div>
        )}
        {total > 0 ? <PaginationBar page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} loading={loading} onPageChange={onPageChange} /> : null}
      </div>
    </div>
  );
}

export function MemberAssets() {
  const [tab, setTab] = useState<MemberAssetTab>('balance');
  const [riskPage, setRiskPage] = useState(1);
  const { liabilitySummary, riskRows, riskTotal, loading, loadData } = useMemberAssetData(riskPage);

  return (
    <div className="flex flex-col gap-6">
      <Tabs value={tab} onValueChange={(value) => setTab(value as MemberAssetTab)} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="balance" className="gap-2">
            <WalletCards className="h-4 w-4" />
            储值余额
          </TabsTrigger>
          <TabsTrigger value="cards" className="gap-2">
            <CreditCard className="h-4 w-4" />
            次卡履约
          </TabsTrigger>
          <TabsTrigger value="risks" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            风险客户
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balance">{tab === 'balance' ? <PrepaidLiabilityAnalysis /> : null}</TabsContent>
        <TabsContent value="cards">{tab === 'cards' ? <CardPackageLiabilityAnalysis /> : null}</TabsContent>
        <TabsContent value="risks">
          {tab === 'risks' ? (
            <RiskCustomersPane
              summary={liabilitySummary}
              rows={riskRows}
              total={riskTotal}
              page={riskPage}
              loading={loading}
              onRefresh={() => void loadData()}
              onPageChange={setRiskPage}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
