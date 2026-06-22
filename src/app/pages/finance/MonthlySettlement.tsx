import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCcw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import {
  confirmCommissionSettlement,
  generateCommissionSettlement,
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
      count: sum.count + 1,
    }),
    { totalAmount: 0, netAmount: 0, count: 0 },
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
        { key: 'totalAmount', header: '合计', width: 14 },
        { key: 'deductions', header: '扣款', width: 14 },
        { key: 'netAmount', header: '实发', width: 14 },
        { key: 'status', header: '状态', width: 12 },
      ],
      `提成结算工资表-${settleMonth}.xlsx`,
    );
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
            <TableHead>合计</TableHead>
            <TableHead>实发</TableHead>
            <TableHead>状态</TableHead>
            {canManageFinance ? <TableHead className="w-40 text-right">操作</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {settlements.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.staffUserName ?? item.beauticianName ?? `#${item.staffUserId ?? item.beauticianId ?? '-'}`}</TableCell>
              <TableCell>{money(item.projectAmount)}</TableCell>
              <TableCell>{money(item.productAmount)}</TableCell>
              <TableCell>{money(item.cardSaleAmount)}</TableCell>
              <TableCell>{money(item.rechargeAmount)}</TableCell>
              <TableCell>{money(item.otherAmount)}</TableCell>
              <TableCell className="font-medium">{money(item.totalAmount)}</TableCell>
              <TableCell className="font-medium">{money(item.netAmount)}</TableCell>
              <TableCell>{statusLabels[item.status] ?? item.status}</TableCell>
              {canManageFinance ? (
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={item.status !== 'draft'} onClick={() => handleConfirm(item.id)}>
                      确认
                    </Button>
                    <Button size="sm" disabled={item.status !== 'confirmed'} onClick={() => handleMarkPaid(item.id)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> 发放
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {!settlements.length && (
            <TableRow>
              <TableCell colSpan={canManageFinance ? 10 : 9} className="py-10 text-center text-muted-foreground">暂无结算单，先确认提成明细后生成。</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
