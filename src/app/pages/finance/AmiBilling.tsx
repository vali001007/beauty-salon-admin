import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Calendar, Loader2, ReceiptText, RefreshCcw, TrendingUp, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { generateAmiMonthlyBill, getAmiMonthlyBills, transitionAmiMonthlyBill, type AmiBillStatus, type AmiMonthlyBill } from '@/api/commission';
import { usePermission } from '@/hooks/usePermission';

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value?: number | null) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRatio(value?: number | null) {
  return `${Number(value ?? 0).toFixed(2)}x`;
}

function formatPercent(value?: number | null) {
  return `${Number(value ?? 0).toFixed(1)}%`;
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

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

const statusLabels: Record<AmiBillStatus, string> = {
  draft: '待确认',
  confirmed: '已确认',
  invoiced: '已开票',
  paid: '已支付',
  voided: '已作废',
};

const statusClassNames: Record<AmiBillStatus, string> = {
  draft: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  confirmed: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  invoiced: 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  paid: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  voided: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

const statusBarClassNames: Record<AmiBillStatus, string> = {
  draft: 'bg-amber-500',
  confirmed: 'bg-sky-500',
  invoiced: 'bg-violet-500',
  paid: 'bg-emerald-500',
  voided: 'bg-slate-500',
};

const statusOrder: AmiBillStatus[] = ['draft', 'confirmed', 'invoiced', 'paid', 'voided'];

type StatusStat = {
  count: number;
  totalFee: number;
  recordCount: number;
};

function createStatusStats(): Record<AmiBillStatus, StatusStat> {
  return {
    draft: { count: 0, totalFee: 0, recordCount: 0 },
    confirmed: { count: 0, totalFee: 0, recordCount: 0 },
    invoiced: { count: 0, totalFee: 0, recordCount: 0 },
    paid: { count: 0, totalFee: 0, recordCount: 0 },
  };
}

function StatusBadge({ status }: { status: AmiBillStatus }) {
  return (
    <Badge variant="outline" className={statusClassNames[status]}>
      {statusLabels[status]}
    </Badge>
  );
}

export function AmiBilling() {
  const canManageFinance = usePermission('core:finance:manage');
  const [settleMonth, setSettleMonth] = useState(currentMonth());
  const [bills, setBills] = useState<AmiMonthlyBill[]>([]);
  const [historyBills, setHistoryBills] = useState<AmiMonthlyBill[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [page, historyPage] = await Promise.all([
        getAmiMonthlyBills({ page: 1, pageSize: 100, settleMonth }),
        getAmiMonthlyBills({ page: 1, pageSize: 500 }),
      ]);
      setBills(page.items);
      setHistoryBills(historyPage.items);
      setSelectedBillId((current) =>
        page.items.some((item) => item.id === current) ? current : (page.items[0]?.id ?? null),
      );
    } catch (error) {
      toast.error(errorMessage(error, '加载 Ami 账单失败'));
    } finally {
      setLoading(false);
    }
  }, [settleMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const statusStats = createStatusStats();
    const totals = bills.reduce(
      (sum, item) => {
        const recordCount = Number(item.breakdown?.recordCount ?? 0);
        const status = item.status;
        if (statusStats[status]) {
          statusStats[status].count += 1;
          statusStats[status].totalFee += item.totalFee;
          statusStats[status].recordCount += recordCount;
        }
        return {
          count: sum.count + 1,
          baseFee: sum.baseFee + item.baseFee,
          commissionFee: sum.commissionFee + item.commissionFee,
          totalFee: sum.totalFee + item.totalFee,
          revenueGenerated: sum.revenueGenerated + item.revenueGenerated,
          recordCount: sum.recordCount + recordCount,
          commissionCap: sum.commissionCap + Number(item.breakdown?.commissionCap ?? 0),
        };
      },
      {
        count: 0,
        baseFee: 0,
        commissionFee: 0,
        totalFee: 0,
        revenueGenerated: 0,
        recordCount: 0,
        commissionCap: 0,
      },
    );

    return {
      totals,
      overallRoi: totals.totalFee > 0 ? totals.revenueGenerated / totals.totalFee : 0,
      capUtilization: totals.commissionCap > 0 ? (totals.commissionFee / totals.commissionCap) * 100 : 0,
      statusRows: statusOrder.map((status) => ({
        status,
        ...statusStats[status],
        share: totals.totalFee > 0 ? (statusStats[status].totalFee / totals.totalFee) * 100 : 0,
      })),
    };
  }, [bills]);
  const selectedBill = useMemo(
    () => bills.find((item) => item.id === selectedBillId) ?? bills[0] ?? null,
    [bills, selectedBillId],
  );
  const selectedBreakdown = selectedBill?.breakdown?.items ?? [];
  const selectedCapUsage = selectedBill?.breakdown?.commissionCap
    ? (Number(selectedBill.commissionFee ?? 0) / Number(selectedBill.breakdown.commissionCap)) * 100
    : 0;
  const historyRows = useMemo(() => {
    const monthMap = new Map<
      string,
      {
        month: string;
        billCount: number;
        revenueGenerated: number;
        baseFee: number;
        commissionFee: number;
        totalFee: number;
        recordCount: number;
      }
    >();
    for (const bill of historyBills) {
      const item = monthMap.get(bill.settleMonth) ?? {
        month: bill.settleMonth,
        billCount: 0,
        revenueGenerated: 0,
        baseFee: 0,
        commissionFee: 0,
        totalFee: 0,
        recordCount: 0,
      };
      item.billCount += 1;
      item.revenueGenerated += Number(bill.revenueGenerated ?? 0);
      item.baseFee += Number(bill.baseFee ?? 0);
      item.commissionFee += Number(bill.commissionFee ?? 0);
      item.totalFee += Number(bill.totalFee ?? 0);
      item.recordCount += Number(bill.breakdown?.recordCount ?? 0);
      monthMap.set(bill.settleMonth, item);
    }
    return Array.from(monthMap.values())
      .map((item) => ({
        ...item,
        roi: item.totalFee > 0 ? item.revenueGenerated / item.totalFee : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [historyBills]);
  const maxHistoryFee = historyRows.reduce((max, item) => Math.max(max, item.totalFee), 0);

  const handleGenerate = async () => {
    if (!canManageFinance) {
      toast.error('当前账号没有生成 Ami 账单的权限');
      return;
    }
    setGenerating(true);
    try {
      await generateAmiMonthlyBill(settleMonth);
      toast.success('Ami 月度账单已生成');
      await loadData();
    } catch (error) {
      toast.error(errorMessage(error, '生成 Ami 账单失败'));
    } finally {
      setGenerating(false);
    }
  };

  const handleTransition = async (bill: AmiMonthlyBill, status: Exclude<AmiBillStatus, 'draft'>) => {
    let reason: string | undefined;
    if (status === 'voided') {
      reason = window.prompt('请输入作废原因（5–500 字）') ?? undefined;
      if (!reason) return;
    }
    try {
      await transitionAmiMonthlyBill(bill.id, status, reason);
      toast.success(status === 'confirmed' ? '账单已确认' : status === 'invoiced' ? '账单已标记开票' : status === 'paid' ? '账单已标记支付' : '账单已作废，可生成下一版本');
      await loadData();
    } catch (error) {
      toast.error(errorMessage(error, '账单状态更新失败'));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">数字员工账单</h1>
            <Badge variant="secondary" className="rounded-md">
              {settleMonth}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            按月汇总 Ami 基础费、绩效费用、应付金额和账单状态；来源收入和 ROI 仅用于解释账单来源。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading || generating}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新
          </Button>
          {canManageFinance ? (
            <Button className="gap-2" onClick={handleGenerate} disabled={generating || loading}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
              生成账单
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>账单数</CardDescription>
              <CardTitle className="mt-2 text-2xl">{summary.totals.count}</CardTitle>
            </div>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ReceiptText className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            覆盖 {summary.totals.recordCount} 条 Ami 贡献记录
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>来源收入参考</CardDescription>
              <CardTitle className="mt-2 text-2xl">{money(summary.totals.revenueGenerated)}</CardTitle>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
              <BarChart3 className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">由营销转化、续费、收银辅助等记录归集，仅作计费来源说明</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>门店应付金额</CardDescription>
              <CardTitle className="mt-2 text-2xl">{money(summary.totals.totalFee)}</CardTitle>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
              <WalletCards className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            基础费 {money(summary.totals.baseFee)} / 绩效费 {money(summary.totals.commissionFee)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardDescription>来源 ROI</CardDescription>
              <CardTitle className="mt-2 text-2xl">{formatRatio(summary.overallRoi)}</CardTitle>
            </div>
            <div className="rounded-lg bg-sky-500/10 p-2 text-sky-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            用于核对账单来源；封顶利用率 {summary.totals.commissionCap ? formatPercent(summary.capUtilization) : '-'}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              查询条件
            </CardTitle>
            <CardDescription>查询接口仍按月份拉取账单，切换月份后自动刷新列表。</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="grid gap-2 text-sm font-medium text-foreground sm:max-w-56">
              账单月份
              <input
                className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm shadow-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                type="month"
                value={settleMonth}
                onChange={(event) => setSettleMonth(event.target.value)}
              />
            </label>
            <p className="mt-4 text-sm text-muted-foreground">
              只有草稿可以重算；已确认账单需先作废，再生成同月份下一版本。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">账单状态</CardTitle>
            <CardDescription>按费用占比观察当前月份账单推进情况。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.statusRows.map((row) => (
              <div key={row.status} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={row.status} />
                  <div className="text-right text-sm">
                    <div className="font-medium text-foreground">{row.count} 张</div>
                    <div className="text-xs text-muted-foreground">{money(row.totalFee)}</div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full ${statusBarClassNames[row.status]}`}
                    style={{ width: `${Math.min(100, row.share)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">账单明细</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              共 {bills.length} 张账单，关联 {summary.totals.recordCount} 条贡献记录。
            </p>
          </div>
          {loading ? <span className="text-sm text-muted-foreground">正在加载...</span> : null}
        </div>

        {bills.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月份</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>门店</TableHead>
                <TableHead className="text-right">基础费</TableHead>
                <TableHead className="text-right">提成费</TableHead>
                <TableHead className="text-right">应付金额</TableHead>
                <TableHead className="text-right">来源收入</TableHead>
                <TableHead className="text-right">来源 ROI</TableHead>
                <TableHead className="text-right">记录数</TableHead>
                <TableHead className="text-right">封顶</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>生成时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((item) => (
                <TableRow key={item.id} className={selectedBill?.id === item.id ? 'bg-primary/5' : undefined}>
                  <TableCell className="font-medium">{item.settleMonth}</TableCell>
                  <TableCell>V{item.version ?? 1}</TableCell>
                  <TableCell>{item.storeName ?? `#${item.storeId}`}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.baseFee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.commissionFee)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(item.totalFee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.revenueGenerated)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatRatio(item.roi)}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.breakdown?.recordCount ?? '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.breakdown?.commissionCap)}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>{dateText(item.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canManageFinance && item.status === 'draft' ? <Button size="sm" onClick={() => void handleTransition(item, 'confirmed')}>确认</Button> : null}
                      {canManageFinance && item.status === 'confirmed' ? <Button size="sm" onClick={() => void handleTransition(item, 'invoiced')}>开票</Button> : null}
                      {canManageFinance && item.status === 'invoiced' ? <Button size="sm" onClick={() => void handleTransition(item, 'paid')}>支付</Button> : null}
                      {canManageFinance && ['confirmed', 'invoiced'].includes(item.status) ? <Button size="sm" variant="outline" onClick={() => void handleTransition(item, 'voided')}>作废</Button> : null}
                      <Button size="sm" variant="outline" onClick={() => setSelectedBillId(item.id)}>详情</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <EmptyState
              icon={ReceiptText}
              title={loading ? '正在加载账单' : '暂无 Ami 账单'}
              description={
                loading ? '正在查询当前月份的数字员工账单。' : '当前月份还没有生成账单，可先生成当月账单后再对账。'
              }
              action={
                canManageFinance && !loading ? (
                  <Button className="gap-2" onClick={handleGenerate} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                    生成账单
                  </Button>
                ) : null
              }
            />
          </div>
        )}
      </section>

      {bills.length ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">账单详情</CardTitle>
                  <CardDescription>
                    {selectedBill?.storeName ?? (selectedBill ? `门店 #${selectedBill.storeId}` : '-')} /{' '}
                    {selectedBill?.settleMonth ?? '-'}
                  </CardDescription>
                </div>
                {selectedBill ? <StatusBadge status={selectedBill.status} /> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {selectedBill ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md bg-muted/35 p-3">
                      <div className="text-xs text-muted-foreground">基础费</div>
                      <div className="mt-1 font-semibold tabular-nums">{money(selectedBill.baseFee)}</div>
                    </div>
                    <div className="rounded-md bg-muted/35 p-3">
                      <div className="text-xs text-muted-foreground">提成费</div>
                      <div className="mt-1 font-semibold tabular-nums">{money(selectedBill.commissionFee)}</div>
                    </div>
                    <div className="rounded-md bg-muted/35 p-3">
                      <div className="text-xs text-muted-foreground">应付金额</div>
                      <div className="mt-1 font-semibold tabular-nums">{money(selectedBill.totalFee)}</div>
                    </div>
                    <div className="rounded-md bg-muted/35 p-3">
                      <div className="text-xs text-muted-foreground">来源 ROI</div>
                      <div className="mt-1 font-semibold tabular-nums">{formatRatio(selectedBill.roi)}</div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">来源收入</div>
                      <div className="mt-1 font-medium tabular-nums">{money(selectedBill.revenueGenerated)}</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">贡献记录</div>
                      <div className="mt-1 font-medium tabular-nums">{selectedBill.breakdown?.recordCount ?? 0} 条</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">封顶利用率</div>
                      <div className="mt-1 font-medium tabular-nums">
                        {selectedBill.breakdown?.commissionCap ? formatPercent(selectedCapUsage) : '-'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 text-sm font-medium">绩效来源说明</div>
                    <div className="space-y-3">
                      {selectedBreakdown.length ? (
                        selectedBreakdown.map((item) => {
                          const percent = selectedBill.revenueGenerated
                            ? (Number(item.revenueAmount ?? 0) / selectedBill.revenueGenerated) * 100
                            : 0;
                          return (
                            <div key={item.category} className="rounded-md border border-border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span className="font-medium">{categoryLabel(item.category)}</span>
                                <span className="text-muted-foreground">
                                  {item.count} 条 / {money(item.commissionAmount)}
                                </span>
                              </div>
                              <div className="mt-2 h-2 rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full bg-primary"
                                  style={{ width: `${Math.min(100, percent)}%` }}
                                />
                              </div>
                              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                                <span>来源收入 {money(item.revenueAmount)}</span>
                                <span>工时 {item.workMinutes ?? 0} 分钟</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-md bg-muted/35 p-4 text-sm text-muted-foreground">暂无分类拆解记录</div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">历史账单对比</CardTitle>
              <CardDescription>按最近 6 个月账单聚合，对比应付费用、来源收入和来源 ROI。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {historyRows.length ? (
                historyRows.map((item) => {
                  const feeShare = maxHistoryFee > 0 ? (item.totalFee / maxHistoryFee) * 100 : 0;
                  return (
                    <div key={item.month} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div>
                          <div className="font-medium text-foreground">{item.month}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.billCount} 张 / {item.recordCount} 条
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium tabular-nums">{formatRatio(item.roi)}</div>
                          <div className="text-xs text-muted-foreground">{money(item.totalFee)}</div>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.min(100, feeShare)}%` }} />
                      </div>
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <span>来源收入 {money(item.revenueGenerated)}</span>
                        <span>
                          基础 {money(item.baseFee)} / 提成 {money(item.commissionFee)}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-md bg-muted/35 p-4 text-sm text-muted-foreground">暂无历史账单可对比</div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
