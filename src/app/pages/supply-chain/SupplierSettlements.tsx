import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, RefreshCcw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import {
  confirmSupplierSettlement,
  generateSupplierSettlement,
  getSupplierSettlementsPaginated,
  getSuppliersPaginated,
  markSupplierSettlementPaid,
} from '@/api/supply-chain';
import { usePermission } from '@/hooks/usePermission';
import { exportToExcel } from '@/utils/excel';
import type { Supplier, SupplierSettlement } from '@/types';

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value?: number | null) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const statusLabels: Record<string, string> = {
  draft: '待确认',
  confirmed: '已确认',
  paid: '已付款',
};

export function SupplierSettlements() {
  const canManageSupply = usePermission('core:supply:manage');
  const [settleMonth, setSettleMonth] = useState(currentMonth());
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<SupplierSettlement[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settlementPage, supplierPage] = await Promise.all([
        getSupplierSettlementsPaginated({
          page: 1,
          pageSize: 300,
          settleMonth: settleMonth || undefined,
          supplierId: supplierId ? Number(supplierId) : undefined,
          status: status || undefined,
        }),
        getSuppliersPaginated({ page: 1, pageSize: 300 }),
      ]);
      setItems(settlementPage.items);
      setSuppliers(supplierPage.items);
    } catch (error: any) {
      toast.error(error?.message || '加载供应商结算单失败');
    } finally {
      setLoading(false);
    }
  }, [settleMonth, status, supplierId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(
    () =>
      items.reduce(
        (sum, item) => ({
          totalAmount: sum.totalAmount + item.totalAmount,
          platformRevenue: sum.platformRevenue + item.platformRevenue,
          netPayable: sum.netPayable + item.netPayable,
          count: sum.count + 1,
        }),
        { totalAmount: 0, platformRevenue: 0, netPayable: 0, count: 0 },
      ),
    [items],
  );

  const handleGenerate = async () => {
    if (!canManageSupply) {
      toast.error('当前账号没有生成供应商结算单的权限');
      return;
    }
    try {
      const result = await generateSupplierSettlement({
        settleMonth,
        supplierId: supplierId ? Number(supplierId) : undefined,
      });
      toast.success(`已生成 ${result.total} 张供应商结算单`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '生成供应商结算单失败');
    }
  };

  const handleConfirm = async (id: number) => {
    if (!canManageSupply) {
      toast.error('当前账号没有确认供应商结算单的权限');
      return;
    }
    try {
      await confirmSupplierSettlement(id);
      toast.success('结算单已确认');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '确认供应商结算单失败');
    }
  };

  const handlePaid = async (id: number) => {
    if (!canManageSupply) {
      toast.error('当前账号没有标记供应商付款的权限');
      return;
    }
    try {
      await markSupplierSettlementPaid(id);
      toast.success('结算单已标记付款');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '标记付款失败');
    }
  };

  const handleExport = () => {
    if (!canManageSupply) {
      toast.error('当前账号没有导出供应商对账单的权限');
      return;
    }
    exportToExcel(
      items.map((item) => ({
        settleMonth: item.settleMonth,
        supplierName: item.supplierName,
        orderCount: item.orderCount,
        totalAmount: item.totalAmount,
        rebateAmount: item.rebateAmount,
        platformFee: item.platformFee,
        platformRevenue: item.platformRevenue,
        netPayable: item.netPayable,
        status: statusLabels[item.status] ?? item.status,
      })),
      [
        { key: 'settleMonth', header: '月份', width: 12 },
        { key: 'supplierName', header: '供应商', width: 22 },
        { key: 'orderCount', header: '采购单数', width: 12 },
        { key: 'totalAmount', header: '采购金额', width: 14 },
        { key: 'rebateAmount', header: '返利', width: 14 },
        { key: 'platformFee', header: '平台服务费', width: 14 },
        { key: 'platformRevenue', header: '平台收入', width: 14 },
        { key: 'netPayable', header: '应付供应商', width: 14 },
        { key: 'status', header: '状态', width: 12 },
      ],
      `供应商对账单-${settleMonth || '全部'}.xlsx`,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">供应商结算</h1>
          <p className="mt-1 text-sm text-muted-foreground">按月汇总供应商采购金额、返利与平台服务费，用于对账和付款。</p>
        </div>
        <div className="flex gap-2">
          {canManageSupply ? (
            <>
              <Button variant="outline" className="gap-2" onClick={handleExport} disabled={!items.length}>
                <Download className="h-4 w-4" /> 导出对账单
              </Button>
              <Button className="gap-2" onClick={handleGenerate}>
                <WalletCards className="h-4 w-4" /> 生成结算单
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">结算单数</div>
          <div className="mt-2 text-2xl font-semibold">{totals.count}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">采购金额</div>
          <div className="mt-2 text-2xl font-semibold">{money(totals.totalAmount)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">平台收入</div>
          <div className="mt-2 text-2xl font-semibold">{money(totals.platformRevenue)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">应付供应商</div>
          <div className="mt-2 text-2xl font-semibold">{money(totals.netPayable)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          type="month"
          value={settleMonth}
          onChange={(event) => setSettleMonth(event.target.value)}
        />
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">全部供应商</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">全部状态</option>
          <option value="draft">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="paid">已付款</option>
        </select>
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>月份</TableHead>
            <TableHead>供应商</TableHead>
            <TableHead>采购单数</TableHead>
            <TableHead>采购金额</TableHead>
            <TableHead>返利</TableHead>
            <TableHead>平台服务费</TableHead>
            <TableHead>平台收入</TableHead>
            <TableHead>应付供应商</TableHead>
            <TableHead>状态</TableHead>
            {canManageSupply ? <TableHead className="w-40 text-right">操作</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.settleMonth}</TableCell>
              <TableCell>{item.supplierName}</TableCell>
              <TableCell>{item.orderCount}</TableCell>
              <TableCell>{money(item.totalAmount)}</TableCell>
              <TableCell>{money(item.rebateAmount)}</TableCell>
              <TableCell>{money(item.platformFee)}</TableCell>
              <TableCell className="font-medium">{money(item.platformRevenue)}</TableCell>
              <TableCell className="font-medium">{money(item.netPayable)}</TableCell>
              <TableCell>{statusLabels[item.status] ?? item.status}</TableCell>
              {canManageSupply ? (
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={item.status !== 'draft'} onClick={() => handleConfirm(item.id)}>
                      确认
                    </Button>
                    <Button size="sm" disabled={item.status !== 'confirmed'} onClick={() => handlePaid(item.id)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> 付款
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {!items.length && (
            <TableRow>
              <TableCell colSpan={canManageSupply ? 10 : 9} className="py-10 text-center text-muted-foreground">
                暂无供应商结算单，先完成采购收货后生成月结。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
