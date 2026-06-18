import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import {
  batchConfirmCommissionRecords,
  confirmCommissionRecord,
  getCommissionRecords,
  getCommissionSummary,
  type CommissionRecord,
  type CommissionType,
} from '@/api/commission';
import { getBeauticians } from '@/api/beautician';
import { usePermission } from '@/hooks/usePermission';
import { exportToExcel } from '@/utils/excel';
import type { Beautician } from '@/types';

const typeLabels: Record<CommissionType, string> = {
  project: '项目',
  product: '商品',
  card_sale: '办卡',
  recharge: '充值',
  new_customer: '新客',
};

const statusLabels: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  settled: '已结算',
  cancelled: '已取消',
};

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CommissionRecords() {
  const canManageFinance = usePermission('core:finance:manage');
  const canExportFinance = usePermission('core:finance:export');
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [summary, setSummary] = useState({ totalAmount: 0, pendingAmount: 0, confirmedAmount: 0, settledAmount: 0, count: 0 });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ settleMonth: currentMonth(), beauticianId: '', type: '', status: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: 1,
        pageSize: 500,
        settleMonth: filters.settleMonth || undefined,
        beauticianId: filters.beauticianId || undefined,
        type: filters.type || undefined,
        status: filters.status || undefined,
      };
      const [recordPage, recordSummary, beauticianList] = await Promise.all([
        getCommissionRecords(params),
        getCommissionSummary(params),
        getBeauticians(),
      ]);
      setRecords(recordPage.items);
      setSummary(recordSummary);
      setBeauticians(beauticianList);
      setSelectedIds([]);
    } catch (error: any) {
      toast.error(error?.message || '加载提成明细失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectableRecords = useMemo(() => records.filter((record) => record.status === 'pending'), [records]);
  const allSelected = selectableRecords.length > 0 && selectableRecords.every((record) => selectedIds.includes(record.id));

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : selectableRecords.map((record) => record.id));
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleConfirm = async (id: number) => {
    if (!canManageFinance) {
      toast.error('当前账号没有确认提成的权限');
      return;
    }
    try {
      await confirmCommissionRecord(id);
      toast.success('提成已确认');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '确认失败');
    }
  };

  const handleBatchConfirm = async () => {
    if (!canManageFinance) {
      toast.error('当前账号没有批量确认提成的权限');
      return;
    }
    try {
      await batchConfirmCommissionRecords({ ids: selectedIds.length ? selectedIds : undefined, settleMonth: filters.settleMonth });
      toast.success(selectedIds.length ? `已确认 ${selectedIds.length} 条提成` : '已确认当前月份待确认提成');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '批量确认失败');
    }
  };

  const handleExport = () => {
    if (!canExportFinance) {
      toast.error('当前账号没有导出财务报表的权限');
      return;
    }
    exportToExcel(
      records.map((record) => ({
        createdAt: record.createdAt ? String(record.createdAt).slice(0, 10) : '',
        beauticianName: record.beauticianName ?? '',
        type: typeLabels[record.type],
        orderNo: record.orderNo ?? '',
        itemName: record.orderItem?.name ?? '',
        sourceAmount: record.sourceAmount,
        rate: `${Math.round(record.rate * 10000) / 100}%`,
        amount: record.amount,
        status: statusLabels[record.status] ?? record.status,
        remark: record.remark ?? '',
      })),
      [
        { key: 'createdAt', header: '日期', width: 14 },
        { key: 'beauticianName', header: '美容师', width: 16 },
        { key: 'type', header: '类型', width: 12 },
        { key: 'orderNo', header: '订单号', width: 20 },
        { key: 'itemName', header: '项目/商品', width: 22 },
        { key: 'sourceAmount', header: '金额基数', width: 14 },
        { key: 'rate', header: '比例', width: 10 },
        { key: 'amount', header: '提成金额', width: 14 },
        { key: 'status', header: '状态', width: 12 },
        { key: 'remark', header: '备注', width: 24 },
      ],
      `提成明细-${filters.settleMonth || '全部'}.xlsx`,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">提成明细</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看每位美容师的提成流水，确认后可进入月度结算。</p>
        </div>
        <div className="flex gap-2">
          {canExportFinance ? (
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" /> 导出
            </Button>
          ) : null}
          {canManageFinance ? (
            <Button className="gap-2" onClick={handleBatchConfirm} disabled={records.every((record) => record.status !== 'pending')}>
              <CheckCircle2 className="h-4 w-4" /> 批量确认
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['当月总提成', summary.totalAmount],
          ['待确认金额', summary.pendingAmount],
          ['已确认金额', summary.confirmedAmount],
          ['已结算金额', summary.settledAmount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{money(Number(value))}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          type="month"
          value={filters.settleMonth}
          onChange={(event) => setFilters((prev) => ({ ...prev, settleMonth: event.target.value }))}
        />
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.beauticianId}
          onChange={(event) => setFilters((prev) => ({ ...prev, beauticianId: event.target.value }))}
        >
          <option value="">全部美容师</option>
          {beauticians.map((beautician) => (
            <option key={beautician.id} value={beautician.id}>{beautician.name}</option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={filters.type} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}>
          <option value="">全部类型</option>
          {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {canManageFinance ? (
              <TableHead className="w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </TableHead>
            ) : null}
            <TableHead>日期</TableHead>
            <TableHead>美容师</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>订单/项目</TableHead>
            <TableHead>金额基数</TableHead>
            <TableHead>比例</TableHead>
            <TableHead>提成</TableHead>
            <TableHead>状态</TableHead>
            {canManageFinance ? <TableHead className="w-24 text-right">操作</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              {canManageFinance ? (
                <TableCell>
                  <input
                    type="checkbox"
                    disabled={record.status !== 'pending'}
                    checked={selectedIds.includes(record.id)}
                    onChange={() => toggleOne(record.id)}
                  />
                </TableCell>
              ) : null}
              <TableCell>{record.createdAt ? String(record.createdAt).slice(0, 10) : '-'}</TableCell>
              <TableCell>{record.beauticianName ?? `#${record.beauticianId}`}</TableCell>
              <TableCell>{typeLabels[record.type]}</TableCell>
              <TableCell>
                <div className="font-medium">{record.orderItem?.name ?? record.ruleName ?? '-'}</div>
                <div className="text-xs text-muted-foreground">{record.orderNo ?? '-'}</div>
              </TableCell>
              <TableCell>{money(record.sourceAmount)}</TableCell>
              <TableCell>{Math.round(record.rate * 10000) / 100}%</TableCell>
              <TableCell className="font-medium">{money(record.amount)}</TableCell>
              <TableCell>{statusLabels[record.status] ?? record.status}</TableCell>
              {canManageFinance ? (
                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={record.status !== 'pending'} onClick={() => handleConfirm(record.id)}>
                      确认
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {!records.length && (
            <TableRow>
              <TableCell colSpan={canManageFinance ? 10 : 8} className="py-10 text-center text-muted-foreground">暂无提成流水</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
