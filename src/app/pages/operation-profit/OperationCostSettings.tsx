import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Edit2, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  copyOperationCostsFromPreviousMonth,
  createOperationCost,
  deleteOperationCost,
  getOperationCosts,
  updateOperationCost,
  type OperationCost,
  type OperationCostCategory,
} from '@/api/operationProfit';
import { usePermission } from '@/hooks/usePermission';
import { useStoreStore } from '@/stores/storeStore';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  costCategoryLabels,
  currentMonthText,
  dateText,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  money,
  PageHeader,
  previousMonthText,
} from './utils';

const categories = Object.keys(costCategoryLabels) as OperationCostCategory[];

const initialForm = {
  periodMonth: currentMonthText(),
  costDate: `${currentMonthText()}-01`,
  category: 'rent' as OperationCostCategory,
  amount: '',
  allocationType: 'store_month',
  remark: '',
};

function toPayload(form: typeof initialForm) {
  return {
    periodMonth: form.periodMonth,
    costDate: form.costDate,
    category: form.category,
    amount: Number(form.amount || 0),
    allocationType: form.allocationType || 'store_month',
    remark: form.remark.trim() || undefined,
  };
}

export function OperationCostSettings() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const canManage = usePermission('core:operation-cost:manage');
  const canManageCurrentStore = canManage && currentStoreId !== null;
  const [periodMonth, setPeriodMonth] = useState(currentMonthText());
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<OperationCost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OperationCost | null>(null);
  const [form, setForm] = useState(initialForm);

  const loadData = useCallback(async () => {
    if (currentStoreId === null) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const page = await getOperationCosts({
        page: 1,
        pageSize: 200,
        storeId: currentStoreId,
        periodMonth,
        category: category ? (category as OperationCostCategory) : undefined,
      });
      setRows(page.items);
      setTotal(page.total);
    } catch (error) {
      toast.error(errorMessage(error, '经营成本加载失败'));
    } finally {
      setLoading(false);
    }
  }, [category, currentStoreId, periodMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const byCategory = new Map<OperationCostCategory, number>();
    let amount = 0;
    for (const row of rows) {
      amount += Number(row.amount ?? 0);
      byCategory.set(row.category, Number(byCategory.get(row.category) ?? 0) + Number(row.amount ?? 0));
    }
    const largest = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    return { amount, categoryCount: byCategory.size, largest };
  }, [rows]);

  const openCreate = () => {
    if (!canManageCurrentStore) {
      toast.error(currentStoreId === null ? '请先选择具体门店' : '当前账号没有管理经营成本的权限');
      return;
    }
    setEditing(null);
    setForm({ ...initialForm, periodMonth, costDate: `${periodMonth}-01` });
    setDialogOpen(true);
  };

  const openEdit = (row: OperationCost) => {
    if (!canManageCurrentStore) {
      toast.error(currentStoreId === null ? '请先选择具体门店' : '当前账号没有管理经营成本的权限');
      return;
    }
    setEditing(row);
    setForm({
      periodMonth: row.periodMonth,
      costDate: dateText(row.costDate),
      category: row.category,
      amount: String(row.amount ?? ''),
      allocationType: row.allocationType || 'store_month',
      remark: row.remark || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageCurrentStore) {
      toast.error(currentStoreId === null ? '请先选择具体门店' : '当前账号没有管理经营成本的权限');
      return;
    }
    if (!form.periodMonth || !form.costDate || !form.amount) {
      toast.error('请填写月份、日期和金额');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error('成本金额不能小于 0');
      return;
    }
    if (!form.costDate.startsWith(`${form.periodMonth}-`)) {
      toast.error('成本日期必须落在所选月份内');
      return;
    }
    try {
      if (editing) {
        await updateOperationCost(editing.id, { ...toPayload(form), storeId: currentStoreId });
        toast.success('经营成本已更新');
      } else {
        await createOperationCost({ ...toPayload(form), storeId: currentStoreId });
        toast.success('经营成本已新增');
      }
      setDialogOpen(false);
      void loadData();
    } catch (error) {
      toast.error(errorMessage(error, '保存经营成本失败'));
    }
  };

  const handleDelete = async (row: OperationCost) => {
    if (!canManageCurrentStore) {
      toast.error(currentStoreId === null ? '请先选择具体门店' : '当前账号没有管理经营成本的权限');
      return;
    }
    const confirmed = window.confirm(
      `确认删除 ${dateText(row.costDate)} ${costCategoryLabels[row.category] ?? row.category} ${money(row.amount)} 吗？删除后利润看板会立即扣除这条成本记录。`,
    );
    if (!confirmed) return;
    try {
      await deleteOperationCost(row.id);
      toast.success('经营成本已删除');
      void loadData();
    } catch (error) {
      toast.error(errorMessage(error, '删除经营成本失败'));
    }
  };

  const handleCopyPrevious = async () => {
    if (!canManageCurrentStore) {
      toast.error(currentStoreId === null ? '请先选择具体门店' : '当前账号没有管理经营成本的权限');
      return;
    }
    const sourceMonth = previousMonthText(periodMonth);
    const confirmed = window.confirm(`确认将 ${sourceMonth} 的经营成本复制到 ${periodMonth} 吗？如果目标月份已有成本，系统会拒绝重复复制。`);
    if (!confirmed) return;
    try {
      await copyOperationCostsFromPreviousMonth({
        storeId: currentStoreId,
        fromPeriodMonth: sourceMonth,
        toPeriodMonth: periodMonth,
      });
      toast.success('已复制上月经营成本');
      void loadData();
    } catch (error) {
      toast.error(errorMessage(error, '复制上月成本失败'));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="成本配置"
        description="按月维护房租、工资、营销、水电、折旧等经营成本，利润看板会直接引用这里的真实录入。"
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
              <RefreshCcw className="h-4 w-4" />
              刷新
            </Button>
            {canManageCurrentStore ? (
              <>
                <Button variant="outline" className="gap-2" onClick={() => void handleCopyPrevious()}>
                  <Copy className="h-4 w-4" />
                  复制上月
                </Button>
                <Button className="gap-2" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  新增成本
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">月份</span>
          <input
            type="month"
            value={periodMonth}
            onChange={(event) => setPeriodMonth(event.target.value)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">全部分类</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {costCategoryLabels[item]}
            </option>
          ))}
        </select>
        {!canManage ? <span className="text-sm text-muted-foreground">当前账号为只读权限。</span> : null}
        {currentStoreId === null ? <span className="text-sm text-amber-700">请先在顶部选择具体门店后维护经营成本。</span> : null}
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="成本合计" value={money(summary.amount)} />
        <MetricCard label="成本记录" value={String(total)} />
        <MetricCard label="分类数" value={String(summary.categoryCount)} />
        <MetricCard label="最大成本项" value={summary.largest ? money(summary.largest[1]) : money(0)} hint={summary.largest ? costCategoryLabels[summary.largest[0]] : '暂无'} />
      </section>

      {currentStoreId === null ? (
        <EmptyBlock label="请先选择具体门店后查看经营成本记录" />
      ) : loading && !rows.length ? (
        <LoadingBlock />
      ) : rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead>分类</TableHead>
              <TableHead className="text-right">金额</TableHead>
              <TableHead>分摊方式</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>录入人</TableHead>
              {canManage ? <TableHead className="text-right">操作</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div>{dateText(row.costDate)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.periodMonth}</div>
                </TableCell>
                <TableCell>{costCategoryLabels[row.category] ?? row.category}</TableCell>
                <TableCell className="text-right font-medium">{money(row.amount)}</TableCell>
                <TableCell>{row.allocationType || 'store_month'}</TableCell>
                <TableCell className="max-w-[280px] truncate">{row.remark || '-'}</TableCell>
                <TableCell>{row.creatorName || '-'}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(row)}>
                        <Edit2 className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button variant="danger" size="sm" className="gap-1" onClick={() => void handleDelete(row)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyBlock label="当前月份暂无经营成本记录" />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑经营成本' : '新增经营成本'}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">月份</span>
                <input
                  type="month"
                  value={form.periodMonth}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      periodMonth: event.target.value,
                      costDate: prev.costDate.startsWith(event.target.value) ? prev.costDate : `${event.target.value}-01`,
                    }))
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">日期</span>
                <input
                  type="date"
                  value={form.costDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, costDate: event.target.value }))}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">分类</span>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value as OperationCostCategory }))}
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {costCategoryLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">金额</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="0.00"
                />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">分摊方式</span>
              <Input value={form.allocationType} onChange={(event) => setForm((prev) => ({ ...prev, allocationType: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">备注</span>
              <textarea
                value={form.remark}
                onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
                className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="可填写成本说明、合同周期或费用来源"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">{editing ? '保存修改' : '新增成本'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
