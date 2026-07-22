import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { createStoreMetricTarget, getStoreMetricTargets, updateStoreMetricTarget } from '@/api/storeMetrics';
import type { StoreMetricTarget } from '@/types/storeMetrics';
import { useStoreStore } from '@/stores/storeStore';
import { Button } from '@/app/components/UI';

function monthText() { return new Date().toISOString().slice(0, 7); }

export function StoreMetricTargets() {
  const navigate = useNavigate();
  const storeId = useStoreStore((state) => state.currentStoreId);
  const [period, setPeriod] = useState(monthText());
  const [targetValue, setTargetValue] = useState('');
  const [existing, setExisting] = useState<StoreMetricTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    const items = await getStoreMetricTargets({ storeId, period });
    const target = items.find((item) => item.metricKey === 'store.operating_revenue.month') ?? null;
    setExisting(target);
    setTargetValue(target ? String(target.targetValue) : '');
  }, [period, storeId]);

  useEffect(() => { void load().catch((error: any) => toast.error(error?.message || '加载目标失败')); }, [load]);

  const save = async () => {
    if (!storeId || !Number(targetValue)) return toast.error('请输入有效的经营收入目标');
    setSaving(true);
    try {
      if (existing) await updateStoreMetricTarget(existing.id, { targetValue: Number(targetValue) });
      else {
        const [year, month] = period.split('-').map(Number);
        const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
        await createStoreMetricTarget({ storeId, metricKey: 'store.operating_revenue.month', periodType: 'month', periodStart: `${period}-01`, periodEnd: end, targetValue: Number(targetValue) });
      }
      toast.success('门店月度目标已保存');
      await load();
    } catch (error: any) {
      toast.error(error?.message || '保存目标失败');
    } finally { setSaving(false); }
  };

  return <div className="p-6"><div className="mx-auto max-w-3xl"><button type="button" onClick={() => navigate('/store-operations/metrics')} className="mb-4 inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft className="h-4 w-4" />返回经营指标</button><div className="rounded-xl border border-border bg-card p-6 shadow-sm"><h1 className="text-2xl font-semibold">门店指标目标</h1><p className="mt-1 text-sm text-muted-foreground">配置月度经营收入目标，店长看板将计算完成率和预测差距。</p><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm"><span className="mb-2 block font-medium">目标月份</span><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2" /></label><label className="text-sm"><span className="mb-2 block font-medium">经营收入目标（元）</span><input type="number" min="0" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2" /></label></div><div className="mt-6 flex justify-end"><Button className="gap-2" onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" />{saving ? '保存中' : '保存目标'}</Button></div></div></div></div>;
}
