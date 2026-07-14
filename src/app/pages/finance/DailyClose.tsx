import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileClock, History, RefreshCcw, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  confirmDailySettlement,
  createDailySettlementAdjustment,
  getDailySettlementAdjustments,
  getDailySettlements,
  getDailySettlementVersions,
  reopenDailySettlement,
  runFinanceReconciliation,
  cancelDailySettlementAdjustment,
  type DailySettlement,
  type DailySettlementAdjustment,
  type DailySettlementSnapshot,
} from '@/api/commission';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/authStore';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';

function todayText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysAgoText(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function money(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DailyClose() {
  const canManage = usePermission('core:finance:manage');
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = Boolean(user?.permissions?.includes('*') || user?.roles?.includes('super_admin'));
  const [dateFrom, setDateFrom] = useState(daysAgoText(30));
  const [dateTo, setDateTo] = useState(todayText());
  const [items, setItems] = useState<DailySettlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<DailySettlementSnapshot[]>([]);
  const [versionTarget, setVersionTarget] = useState<DailySettlement | null>(null);
  const [adjustmentTarget, setAdjustmentTarget] = useState<DailySettlement | null>(null);
  const [adjustments, setAdjustments] = useState<DailySettlementAdjustment[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getDailySettlements({ page: 1, pageSize: 100, dateFrom, dateTo });
      setItems(page.items);
    } catch (error: any) {
      toast.error(error?.message || '日结单加载失败');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { void loadData(); }, [loadData]);

  const generate = async (date: string) => {
    try {
      const run = await runFinanceReconciliation(date);
      toast.success(run.status === 'blocked' ? '对账完成，存在阻断异常，日结保持草稿' : run.summary?.autoConfirmed ? '对账通过，日结已自动确认' : '对账完成');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '生成日结失败');
    }
  };

  const openAdjustments = async (item: DailySettlement) => {
    try {
      setAdjustments(await getDailySettlementAdjustments(item.id));
      setAdjustmentTarget(item);
    } catch (error: any) {
      toast.error(error?.message || '人工调整加载失败');
    }
  };

  const addAdjustment = async () => {
    if (!adjustmentTarget) return;
    const effectField = window.prompt('请输入影响字段：totalRevenue / cashRevenue / wechatRevenue / alipayRevenue / cardRevenue / balanceRevenue / rechargeIncome / refundAmount / materialCost / commissionTotal', 'cashRevenue');
    if (!effectField) return;
    const amountText = window.prompt('请输入调整金额，可输入负数');
    if (!amountText) return;
    const reason = window.prompt('请输入调整原因（5–500 字）');
    if (!reason) return;
    const voucherNo = window.prompt('请输入凭证号（可留空）') ?? undefined;
    try {
      await createDailySettlementAdjustment(adjustmentTarget.id, {
        adjustmentType: 'manual_correction',
        effectField: effectField as any,
        amount: Number(amountText),
        reason,
        voucherNo,
      });
      toast.success('人工调整已记录，自动确认已关闭');
      setAdjustments(await getDailySettlementAdjustments(adjustmentTarget.id));
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '新增人工调整失败');
    }
  };

  const cancelAdjustment = async (adjustment: DailySettlementAdjustment) => {
    if (!adjustmentTarget) return;
    const reason = window.prompt('请输入取消原因（5–500 字）');
    if (!reason) return;
    try {
      await cancelDailySettlementAdjustment(adjustmentTarget.id, adjustment.id, reason);
      toast.success('人工调整已取消');
      setAdjustments(await getDailySettlementAdjustments(adjustmentTarget.id));
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '取消人工调整失败');
    }
  };

  const adjustmentTotal = (item: DailySettlement, field: string) => Number(item.adjustmentSummary?.[field] ?? 0);
  const hasAdjustments = (item: DailySettlement) => Object.values(item.adjustmentSummary ?? {}).some((value) => Math.abs(Number(value ?? 0)) >= 0.01);

  const reconciliationLabel = (item: DailySettlement) => {
    if (item.reconciliationStatus === 'running') return '自动处理中';
    if (item.reconciliationStatus === 'blocked') return '待人工处理';
    if (item.reconciliationStatus === 'failed') return '自动任务失败';
    if (item.status === 'confirmed' && item.confirmationMode === 'auto') return '已自动确认';
    if (item.status === 'confirmed') return '已人工确认';
    if (item.needsRefresh) return '待刷新';
    return '草稿';
  };

  const confirm = async (id: number) => {
    try {
      await confirmDailySettlement(id);
      toast.success('日结已确认并生成不可变快照');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '确认日结失败');
    }
  };

  const reopen = async (item: DailySettlement) => {
    const reason = window.prompt('请输入重开原因（5–500 字）');
    if (!reason) return;
    try {
      await reopenDailySettlement(item.id, reason);
      toast.success('日结已重开，原确认版本保持不变');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || '重开日结失败');
    }
  };

  const openVersions = async (item: DailySettlement) => {
    try {
      setVersions(await getDailySettlementVersions(item.id));
      setVersionTarget(item);
    } catch (error: any) {
      toast.error(error?.message || '版本记录加载失败');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold">日结总览</h1>
          <p className="mt-1 text-sm text-muted-foreground">这里管理持久化日结单；确认后金额冻结，重开不会删除历史版本。</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <span className="text-sm text-muted-foreground">至</span>
          <input type="date" className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <Button variant="outline" onClick={() => void loadData()}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <FileClock className="mr-2 inline h-4 w-4" />
        01:00 自动生成并对账；无阻断异常、无人工调整时自动确认。利润质量问题仅提醒，不阻断日结。人工调整只影响最终日结金额，不修改支付、退款、库存或提成来源事实。
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>经营日</TableHead><TableHead>门店</TableHead><TableHead>系统收入</TableHead><TableHead>人工调整</TableHead><TableHead>最终收入</TableHead><TableHead>退款</TableHead><TableHead>毛利</TableHead><TableHead>对账/确认</TableHead><TableHead>版本</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">加载中</TableCell></TableRow> : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{String(item.settleDate).slice(0, 10)}</TableCell>
              <TableCell>{item.storeName ?? `门店 #${item.storeId}`}</TableCell>
              <TableCell>{money(item.systemSummary?.totalRevenue ?? item.totalRevenue)}</TableCell>
              <TableCell className={hasAdjustments(item) ? 'text-amber-700' : ''}>{adjustmentTotal(item, 'totalRevenue') !== 0 ? money(adjustmentTotal(item, 'totalRevenue')) : hasAdjustments(item) ? '有调整' : money(0)}</TableCell>
              <TableCell className="font-medium">{money(item.finalSummary?.totalRevenue ?? item.totalRevenue)}</TableCell><TableCell>{money(item.refundAmount)}</TableCell><TableCell>{money(item.grossProfit)}</TableCell>
              <TableCell><span className={`rounded-full px-2 py-1 text-xs ${item.reconciliationStatus === 'failed' ? 'bg-red-100 text-red-700' : item.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : item.reconciliationStatus === 'blocked' || item.needsRefresh ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{reconciliationLabel(item)}</span></TableCell>
              <TableCell>V{item.latestVersion || (item.status === 'confirmed' ? 1 : 0)}</TableCell>
              <TableCell>{item.confirmedAt ? new Date(item.confirmedAt).toLocaleString('zh-CN') : '-'}</TableCell>
              <TableCell><div className="flex justify-end gap-2">
                {canManage && item.status === 'draft' ? <Button size="sm" variant="outline" onClick={() => void generate(String(item.settleDate).slice(0, 10))}><RefreshCcw className="mr-1 h-3.5 w-3.5" />重算</Button> : null}
                {canManage && item.status === 'draft' ? <Button size="sm" variant="outline" onClick={() => void openAdjustments(item)}><SlidersHorizontal className="mr-1 h-3.5 w-3.5" />调整</Button> : null}
                {canManage && item.status === 'draft' ? <Button size="sm" onClick={() => void confirm(item.id)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />确认</Button> : null}
                {isSuperAdmin && item.status === 'confirmed' ? <Button size="sm" variant="outline" onClick={() => void reopen(item)}><RotateCcw className="mr-1 h-3.5 w-3.5" />重开</Button> : null}
                {(item.latestVersion ?? 0) > 0 || item.status === 'confirmed' ? <Button size="sm" variant="ghost" onClick={() => void openVersions(item)}><History className="mr-1 h-3.5 w-3.5" />版本</Button> : null}
              </div></TableCell>
            </TableRow>
          ))}
          {!loading && !items.length ? <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">所选区间暂无日结单</TableCell></TableRow> : null}
        </TableBody>
      </Table>

      <Dialog open={Boolean(versionTarget)} onOpenChange={(open) => !open && setVersionTarget(null)}>
        <DialogContent><DialogHeader><DialogTitle>日结版本记录</DialogTitle><DialogDescription>{versionTarget ? `${String(versionTarget.settleDate).slice(0, 10)} · ${versionTarget.storeName ?? ''}` : ''}，历史版本不可修改。</DialogDescription></DialogHeader>
          <div className="space-y-2">{versions.map((snapshot) => <div key={snapshot.version} className="rounded-lg border border-border p-3 text-sm"><div className="flex justify-between"><strong>版本 V{snapshot.version}</strong><span>{new Date(snapshot.confirmedAt).toLocaleString('zh-CN')}</span></div><div className="mt-2 text-muted-foreground">营业收入 {money(snapshot.totalRevenue)} · 退款 {money(snapshot.refundAmount)} · 毛利 {money(snapshot.grossProfit)}</div></div>)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjustmentTarget)} onOpenChange={(open) => !open && setAdjustmentTarget(null)}>
        <DialogContent><DialogHeader><DialogTitle>日结人工调整</DialogTitle><DialogDescription>调整不会覆盖来源事实；存在有效调整时必须由财务管理员人工确认。</DialogDescription></DialogHeader>
          <div className="flex justify-end">{canManage ? <Button size="sm" onClick={() => void addAdjustment()}>新增调整</Button> : null}</div>
          <div className="max-h-80 space-y-2 overflow-auto">{adjustments.map((adjustment) => <div key={adjustment.id} className="rounded-lg border border-border p-3 text-sm"><div className="flex items-center justify-between"><strong>{adjustment.effectField} {money(adjustment.amount)}</strong><span>{adjustment.status === 'applied' ? '有效' : '已取消'}</span></div><div className="mt-1 text-muted-foreground">{adjustment.reason}{adjustment.voucherNo ? ` · 凭证 ${adjustment.voucherNo}` : ''}</div>{canManage && adjustment.status === 'applied' ? <div className="mt-2 text-right"><Button size="sm" variant="outline" onClick={() => void cancelAdjustment(adjustment)}>取消调整</Button></div> : null}</div>)}{!adjustments.length ? <div className="py-8 text-center text-sm text-muted-foreground">暂无人工调整</div> : null}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
