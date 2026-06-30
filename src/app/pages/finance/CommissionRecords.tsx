import React, { useCallback, useEffect, useState } from 'react';
import { Download, Pencil, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  getCommissionRecords,
  getCommissionSummary,
  updateCommissionRecord,
  type CommissionRecord,
  type CommissionType,
  type UpdateCommissionRecordInput,
} from '@/api/commission';
import { getUsers } from '@/api/user';
import { usePermission } from '@/hooks/usePermission';
import { exportToExcel } from '@/utils/excel';
import type { SystemUser } from '@/types/user';

const typeLabels: Record<CommissionType, string> = {
  project: '项目',
  product: '商品',
  card_sale: '办卡',
  recharge: '充值',
  new_customer: '新客',
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
  const [staffUsers, setStaffUsers] = useState<SystemUser[]>([]);
  const [summary, setSummary] = useState({ totalAmount: 0, pendingAmount: 0, confirmedAmount: 0, settledAmount: 0, count: 0 });
  const [editingRecord, setEditingRecord] = useState<CommissionRecord | null>(null);
  const [editForm, setEditForm] = useState({ staffUserId: '', sourceAmount: '', ratePercent: '', amount: '', remark: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ settleMonth: currentMonth(), staffUserId: '', type: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: 1,
        pageSize: 500,
        settleMonth: filters.settleMonth || undefined,
        staffUserId: filters.staffUserId || undefined,
        type: filters.type || undefined,
      };
      const [recordPage, recordSummary, userList] = await Promise.all([
        getCommissionRecords(params),
        getCommissionSummary(params),
        getUsers(),
      ]);
      setRecords(recordPage.items);
      setSummary(recordSummary);
      setStaffUsers(userList.filter((user) => user.status === '启用'));
    } catch (error: any) {
      toast.error(error?.message || '加载提成明细失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openEditDialog = (record: CommissionRecord) => {
    if (!canManageFinance) {
      toast.error('当前账号没有修改提成的权限');
      return;
    }
    if (record.status === 'cancelled') {
      toast.error('已取消提成不能修改');
      return;
    }
    setEditingRecord(record);
    setEditForm({
      staffUserId: record.staffUserId ? String(record.staffUserId) : '',
      sourceAmount: String(record.sourceAmount ?? 0),
      ratePercent: String(Math.round(Number(record.rate ?? 0) * 10000) / 100),
      amount: String(record.amount ?? 0),
      remark: record.remark ?? '',
    });
  };

  const updateEditForm = (patch: Partial<typeof editForm>) => {
    setEditForm((prev) => {
      const next = { ...prev, ...patch };
      if ('sourceAmount' in patch || 'ratePercent' in patch) {
        const sourceAmount = Number(next.sourceAmount);
        const ratePercent = Number(next.ratePercent);
        if (Number.isFinite(sourceAmount) && Number.isFinite(ratePercent)) {
          next.amount = String(Math.round(sourceAmount * (ratePercent / 100) * 100) / 100);
        }
      }
      return next;
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const staffUserId = Number(editForm.staffUserId);
    const sourceAmount = Number(editForm.sourceAmount);
    const ratePercent = Number(editForm.ratePercent);
    const amount = Number(editForm.amount);
    if (!staffUserId) {
      toast.error('请选择员工');
      return;
    }
    if (![sourceAmount, ratePercent, amount].every((value) => Number.isFinite(value) && value >= 0)) {
      toast.error('金额基数、比例和提成金额不能小于 0');
      return;
    }
    const payload: UpdateCommissionRecordInput = {
      staffUserId,
      sourceAmount,
      rate: ratePercent / 100,
      amount,
      remark: editForm.remark.trim(),
    };
    try {
      setSaving(true);
      await updateCommissionRecord(editingRecord.id, payload);
      toast.success('提成已修改，订单成本已按最新提成记录同步');
      setEditingRecord(null);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '修改提成失败');
    } finally {
      setSaving(false);
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
        staffUserName: record.staffUserName ?? record.beauticianName ?? '',
        type: typeLabels[record.type],
        orderNo: record.orderNo ?? '',
        itemName: record.orderItem?.name ?? '',
        sourceAmount: record.sourceAmount,
        rate: `${Math.round(record.rate * 10000) / 100}%`,
        amount: record.amount,
        remark: record.remark ?? '',
      })),
      [
        { key: 'createdAt', header: '日期', width: 14 },
        { key: 'staffUserName', header: '员工', width: 16 },
        { key: 'type', header: '类型', width: 12 },
        { key: 'orderNo', header: '订单号', width: 20 },
        { key: 'itemName', header: '项目/商品', width: 22 },
        { key: 'sourceAmount', header: '金额基数', width: 14 },
        { key: 'rate', header: '比例', width: 10 },
        { key: 'amount', header: '提成金额', width: 14 },
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
          <p className="mt-1 text-sm text-muted-foreground">系统按订单、核销、开卡和充值自动生成提成流水；必要时在此修改，修改后同步订单成本。</p>
        </div>
        <div className="flex gap-2">
          {canExportFinance ? (
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" /> 导出
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['当月总提成', summary.totalAmount],
          ['提成流水数', summary.count],
          ['平均单笔提成', summary.count ? summary.totalAmount / summary.count : 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{label === '提成流水数' ? Number(value) : money(Number(value))}</div>
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
          value={filters.staffUserId}
          onChange={(event) => setFilters((prev) => ({ ...prev, staffUserId: event.target.value }))}
        >
          <option value="">全部员工</option>
          {staffUsers.map((user) => (
            <option key={user.id} value={user.id}>{user.name || user.username}</option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={filters.type} onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}>
          <option value="">全部类型</option>
          {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead>员工</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>订单/项目</TableHead>
            <TableHead>金额基数</TableHead>
            <TableHead>比例</TableHead>
            <TableHead>提成</TableHead>
            {canManageFinance ? <TableHead className="w-24 text-right">操作</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell>{record.createdAt ? String(record.createdAt).slice(0, 10) : '-'}</TableCell>
              <TableCell>{record.staffUserName ?? record.beauticianName ?? `#${record.staffUserId ?? record.beauticianId ?? '-'}`}</TableCell>
              <TableCell>{typeLabels[record.type]}</TableCell>
              <TableCell>
                <div className="font-medium">{record.orderItem?.name ?? record.ruleName ?? '-'}</div>
                <div className="text-xs text-muted-foreground">{record.orderNo ?? '-'}</div>
              </TableCell>
              <TableCell>{money(record.sourceAmount)}</TableCell>
              <TableCell>{Math.round(record.rate * 10000) / 100}%</TableCell>
              <TableCell className="font-medium">{money(record.amount)}</TableCell>
              {canManageFinance ? (
                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" className="gap-1" disabled={record.status === 'cancelled'} onClick={() => openEditDialog(record)}>
                      <Pencil className="h-3.5 w-3.5" />
                      修改
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {!records.length && (
            <TableRow>
              <TableCell colSpan={canManageFinance ? 8 : 7} className="py-10 text-center text-muted-foreground">暂无提成流水</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={Boolean(editingRecord)} onOpenChange={(open) => { if (!open) setEditingRecord(null); }}>
        <DialogContent className="max-w-2xl" aria-describedby="commission-record-edit-desc">
          <DialogHeader>
            <DialogTitle>修改提成</DialogTitle>
          </DialogHeader>
          <div id="commission-record-edit-desc" className="text-sm text-muted-foreground">
            保存后会更新该提成流水，订单利润、商品毛利、项目毛利会按最新提成金额重新计算。
          </div>
          {editingRecord ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm md:grid-cols-3">
                <div>
                  <div className="text-muted-foreground">订单</div>
                  <div className="mt-1 font-medium">{editingRecord.orderNo ?? '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">项目/商品</div>
                  <div className="mt-1 font-medium">{editingRecord.orderItem?.name ?? editingRecord.ruleName ?? '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">类型</div>
                  <div className="mt-1 font-medium">{typeLabels[editingRecord.type]}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">员工</span>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    value={editForm.staffUserId}
                    onChange={(event) => updateEditForm({ staffUserId: event.target.value })}
                  >
                    <option value="">请选择员工</option>
                    {staffUsers.map((user) => (
                      <option key={user.id} value={user.id}>{user.name || user.username}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">金额基数</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.sourceAmount}
                    onChange={(event) => updateEditForm({ sourceAmount: event.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">比例（%）</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.ratePercent}
                    onChange={(event) => updateEditForm({ ratePercent: event.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">提成金额</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(event) => updateEditForm({ amount: event.target.value })}
                  />
                </label>
              </div>

              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">备注</span>
                <textarea
                  className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={editForm.remark}
                  onChange={(event) => updateEditForm({ remark: event.target.value })}
                  placeholder="记录调整原因"
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingRecord(null)} disabled={saving}>
                  取消
                </Button>
                <Button type="button" onClick={() => void handleSaveEdit()} disabled={saving}>
                  {saving ? '保存中...' : '保存修改'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
