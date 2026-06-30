import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, RefreshCcw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  confirmCommissionSettlement,
  generateCommissionSettlement,
  getCommissionSettlement,
  getCommissionSettlements,
  markCommissionSettlementPaid,
  type CommissionSettlement,
} from '@/api/commission';
import { usePermission } from '@/hooks/usePermission';
import { exportToExcel } from '@/utils/excel';

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statusLabels: Record<string, string> = {
  draft: '待确认',
  confirmed: '已确认',
  paid: '已发放',
};

export function MonthlySettlement() {
  const canManageFinance = usePermission('core:finance:manage');
  const canExportFinance = usePermission('core:finance:export');
  const [settleMonth, setSettleMonth] = useState(currentMonth());
  const [settlements, setSettlements] = useState<CommissionSettlement[]>([]);
  const [detailSettlement, setDetailSettlement] = useState<CommissionSettlement | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getCommissionSettlements({ page: 1, pageSize: 300, settleMonth });
      setSettlements(page.items);
    } catch (error: any) {
      toast.error(error?.message || '加载结算单失败');
    } finally {
      setLoading(false);
    }
  }, [settleMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = settlements.reduce(
    (sum, item) => ({
      totalAmount: sum.totalAmount + item.totalAmount,
      netAmount: sum.netAmount + item.netAmount,
      detailAmount: sum.detailAmount + Number(item.detailAmount ?? item.totalAmount ?? 0),
      detailCount: sum.detailCount + Number(item.detailCount ?? item.settlementRecords?.length ?? 0),
      staleCount: sum.staleCount + (item.needsRegenerate ? 1 : 0),
      count: sum.count + 1,
    }),
    { totalAmount: 0, netAmount: 0, detailAmount: 0, detailCount: 0, staleCount: 0, count: 0 },
  );

  const handleGenerate = async () => {
    if (!canManageFinance) {
      toast.error('当前账号没有生成结算单的权限');
      return;
    }
    try {
      const result: any = await generateCommissionSettlement(settleMonth);
      toast.success(`已生成 ${result?.total ?? result?.items?.length ?? 0} 张结算单`);
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '生成结算单失败，请先确认当月提成流水');
    }
  };

  const handleConfirm = async (id: number) => {
    if (!canManageFinance) {
      toast.error('当前账号没有确认结算单的权限');
      return;
    }
    try {
      await confirmCommissionSettlement(id);
      toast.success('结算单已确认');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '确认失败');
    }
  };

  const handleMarkPaid = async (id: number) => {
    if (!canManageFinance) {
      toast.error('当前账号没有标记发放的权限');
      return;
    }
    try {
      await markCommissionSettlementPaid(id);
      toast.success('已标记发放');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '标记失败');
    }
  };

  const handleExport = () => {
    if (!canExportFinance) {
      toast.error('当前账号没有导出财务报表的权限');
      return;
    }
    exportToExcel(
      settlements.map((item) => ({
        settleMonth: item.settleMonth,
        staffUserName: item.staffUserName ?? item.beauticianName ?? `#${item.staffUserId ?? item.beauticianId ?? '-'}`,
        projectAmount: item.projectAmount,
        productAmount: item.productAmount,
        cardSaleAmount: item.cardSaleAmount,
        rechargeAmount: item.rechargeAmount,
        otherAmount: item.otherAmount,
        detailCount: item.detailCount ?? item.settlementRecords?.length ?? 0,
        detailAmount: item.detailAmount ?? item.totalAmount,
        totalAmount: item.totalAmount,
        deductions: item.deductions,
        netAmount: item.netAmount,
        status: statusLabels[item.status] ?? item.status,
      })),
      [
        { key: 'settleMonth', header: '月份', width: 12 },
        { key: 'staffUserName', header: '员工', width: 16 },
        { key: 'projectAmount', header: '项目提成', width: 14 },
        { key: 'productAmount', header: '商品提成', width: 14 },
        { key: 'cardSaleAmount', header: '办卡提成', width: 14 },
        { key: 'rechargeAmount', header: '充值提成', width: 14 },
        { key: 'otherAmount', header: '其他提成', width: 14 },
        { key: 'detailCount', header: '锁定流水数', width: 14 },
        { key: 'detailAmount', header: '锁定金额', width: 14 },
        { key: 'totalAmount', header: '合计', width: 14 },
        { key: 'deductions', header: '扣款', width: 14 },
        { key: 'netAmount', header: '实发', width: 14 },
        { key: 'status', header: '状态', width: 12 },
      ],
      `提成结算工资表-${settleMonth}.xlsx`,
    );
  };

  const handleOpenDetail = async (id: number) => {
    setDetailLoadingId(id);
    try {
      const detail = await getCommissionSettlement(id);
      setDetailSettlement(detail);
    } catch (error: any) {
      toast.error(error?.message || '加载结算单明细失败');
    } finally {
      setDetailLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">月度结算</h1>
          <p className="mt-1 text-sm text-muted-foreground">按月汇总已确认提成，生成员工结算工资表。</p>
        </div>
        <div className="flex gap-2">
          {canExportFinance ? (
            <Button variant="outline" className="gap-2" onClick={handleExport} disabled={!settlements.length}>
              <Download className="h-4 w-4" /> 导出工资表
            </Button>
          ) : null}
          {canManageFinance ? (
            <Button className="gap-2" onClick={handleGenerate}>
              <WalletCards className="h-4 w-4" /> 生成结算单
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">结算人数</div>
          <div className="mt-2 text-2xl font-semibold">{totals.count}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">应发合计</div>
          <div className="mt-2 text-2xl font-semibold">{money(totals.totalAmount)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">实发合计</div>
          <div className="mt-2 text-2xl font-semibold">{money(totals.netAmount)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 md:col-span-3">
          <div className="text-sm text-muted-foreground">锁定流水</div>
          <div className="mt-2 text-2xl font-semibold">{totals.detailCount} 条 / {money(totals.detailAmount)}</div>
          <p className="mt-1 text-xs text-muted-foreground">确认结算时只会结算这些已锁定流水，生成后新增的同月份提成不会被旧结算单带走。</p>
          {totals.staleCount > 0 ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              {totals.staleCount} 张待确认结算单的锁定流水已变化，需要重新生成后再确认。
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          type="month"
          value={settleMonth}
          onChange={(event) => setSettleMonth(event.target.value)}
        />
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>员工</TableHead>
            <TableHead>项目</TableHead>
            <TableHead>商品</TableHead>
            <TableHead>办卡</TableHead>
            <TableHead>充值</TableHead>
            <TableHead>其他</TableHead>
            <TableHead>锁定流水</TableHead>
            <TableHead>锁定金额</TableHead>
            <TableHead>合计</TableHead>
            <TableHead>实发</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="w-56 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {settlements.map((item) => (
            <React.Fragment key={item.id}>
              <TableRow>
                <TableCell className="font-medium">{item.staffUserName ?? item.beauticianName ?? `#${item.staffUserId ?? item.beauticianId ?? '-'}`}</TableCell>
                <TableCell>{money(item.projectAmount)}</TableCell>
                <TableCell>{money(item.productAmount)}</TableCell>
                <TableCell>{money(item.cardSaleAmount)}</TableCell>
                <TableCell>{money(item.rechargeAmount)}</TableCell>
                <TableCell>{money(item.otherAmount)}</TableCell>
                <TableCell>{item.detailCount ?? item.settlementRecords?.length ?? 0} 条</TableCell>
                <TableCell>{money(item.detailAmount ?? item.totalAmount)}</TableCell>
                <TableCell className="font-medium">{money(item.totalAmount)}</TableCell>
                <TableCell className="font-medium">{money(item.netAmount)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{statusLabels[item.status] ?? item.status}</span>
                    {item.needsRegenerate ? (
                      <span className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> 需重新生成
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="gap-1" disabled={detailLoadingId === item.id} onClick={() => handleOpenDetail(item.id)}>
                      <FileText className="h-3.5 w-3.5" /> 明细
                    </Button>
                    {canManageFinance ? (
                      <>
                        <Button size="sm" variant="outline" disabled={item.status !== 'draft' || item.needsRegenerate} onClick={() => handleConfirm(item.id)}>
                          确认
                        </Button>
                        <Button size="sm" disabled={item.status !== 'confirmed'} onClick={() => handleMarkPaid(item.id)}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> 发放
                        </Button>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
              {item.needsRegenerate ? (
                <TableRow>
                  <TableCell colSpan={12} className="bg-amber-50 text-sm text-amber-700">
                    {item.regenerateReason ?? '结算单明细已变化，请重新生成后再确认。'}
                    {item.regenerateDiffAmount ? ` 差异金额：${money(item.regenerateDiffAmount)}。` : ''}
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          ))}
          {!settlements.length && (
            <TableRow>
              <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">暂无结算单，先确认提成明细后生成。</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={Boolean(detailSettlement)} onOpenChange={(open) => { if (!open) setDetailSettlement(null); }}>
        <DialogContent className="max-w-5xl" aria-describedby="commission-settlement-detail-desc">
          <DialogHeader>
            <DialogTitle>结算单明细</DialogTitle>
            <DialogDescription id="commission-settlement-detail-desc">
              展示生成结算单时锁定的提成流水快照；确认结算只会影响这些流水。
            </DialogDescription>
          </DialogHeader>

          {detailSettlement ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">员工</div>
                  <div className="mt-1 font-medium">{detailSettlement.staffUserName ?? detailSettlement.beauticianName ?? '-'}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">月份</div>
                  <div className="mt-1 font-medium">{detailSettlement.settleMonth}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">锁定流水</div>
                  <div className="mt-1 font-medium">{detailSettlement.detailCount ?? detailSettlement.settlementRecords?.length ?? 0} 条</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">锁定金额</div>
                  <div className="mt-1 font-medium">{money(detailSettlement.detailAmount ?? detailSettlement.totalAmount)}</div>
                </div>
              </div>

              {detailSettlement.needsRegenerate ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  {detailSettlement.regenerateReason ?? '结算单明细已变化，请重新生成后再确认。'}
                </div>
              ) : null}

              <div className="max-h-[52vh] overflow-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 font-medium text-muted-foreground">流水</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">员工</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">类型/项目</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">订单</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">快照金额</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">当前金额</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">快照状态</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">当前状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailSettlement.settlementRecords ?? []).map((item) => {
                      const record = item.commissionRecord;
                      const amountChanged = record ? Number(record.amount ?? 0) !== Number(item.amountSnapshot ?? 0) : false;
                      const statusChanged = record ? record.status !== item.statusSnapshot : false;
                      return (
                        <tr key={item.id ?? item.commissionRecordId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">#{item.commissionRecordId}</td>
                          <td className="px-3 py-2">{record?.staffUserName ?? record?.beauticianName ?? detailSettlement.staffUserName ?? '-'}</td>
                          <td className="px-3 py-2">
                            <div>{record?.type ?? '-'}</div>
                            <div className="text-xs text-muted-foreground">{record?.orderItem?.name ?? record?.assignmentName ?? record?.ruleName ?? '-'}</div>
                          </td>
                          <td className="px-3 py-2">{record?.orderNo ?? '-'}</td>
                          <td className="px-3 py-2">{money(item.amountSnapshot)}</td>
                          <td className={amountChanged ? 'px-3 py-2 font-medium text-amber-700' : 'px-3 py-2'}>{record ? money(record.amount) : '-'}</td>
                          <td className="px-3 py-2">{item.statusSnapshot ?? '-'}</td>
                          <td className={statusChanged ? 'px-3 py-2 font-medium text-amber-700' : 'px-3 py-2'}>{record?.status ?? '-'}</td>
                        </tr>
                      );
                    })}
                    {!detailSettlement.settlementRecords?.length ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">暂无锁定流水明细。</td>
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
