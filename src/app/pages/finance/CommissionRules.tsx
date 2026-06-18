import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, RefreshCcw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  batchCreateCommissionRules,
  createCommissionRule,
  deleteCommissionRule,
  getCommissionRules,
  updateCommissionRule,
  type CommissionRule,
  type CommissionTargetType,
  type CommissionType,
} from '@/api/commission';
import { getBeauticianLevels } from '@/api/beauticianLevel';
import type { BeauticianLevel } from '@/api/domain-types';

const typeLabels: Record<CommissionType, string> = {
  project: '项目',
  product: '商品',
  card_sale: '办卡',
  recharge: '充值',
  new_customer: '新客',
};

const targetLabels: Record<CommissionTargetType, string> = {
  all: '全部',
  category: '品类',
  specific: '指定项目/商品',
};

const initialForm = {
  name: '',
  type: 'project' as CommissionType,
  targetType: 'all' as CommissionTargetType,
  targetId: '',
  levelId: '',
  rate: '0.08',
  fixedAmount: '',
  calcBase: 'total',
  isDesignated: false,
  designatedBonus: '',
  minThreshold: '',
  priority: '0',
  status: 'active',
};

function formatPercent(value?: number) {
  return `${Math.round(Number(value ?? 0) * 10000) / 100}%`;
}

function toOptionalNumber(value: string) {
  if (value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

export function CommissionRules() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [levels, setLevels] = useState<BeauticianLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionRule | null>(null);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({ type: '', status: 'active', levelId: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulePage, levelList] = await Promise.all([
        getCommissionRules({
          page: 1,
          pageSize: 200,
          type: filters.type || undefined,
          status: filters.status || undefined,
          levelId: filters.levelId || undefined,
        }),
        getBeauticianLevels(),
      ]);
      setRules(rulePage.items);
      setLevels(levelList);
    } catch (error: any) {
      toast.error(error?.message || '加载提成规则失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groupedRules = useMemo(() => {
    const groups = new Map<string, CommissionRule[]>();
    for (const rule of rules) {
      const key = rule.level?.name ?? (rule.levelId ? `等级 ${rule.levelId}` : '全部等级');
      groups.set(key, [...(groups.get(key) ?? []), rule]);
    }
    return Array.from(groups.entries());
  }, [rules]);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const openEdit = (rule: CommissionRule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      type: rule.type,
      targetType: rule.targetType,
      targetId: rule.targetId ? String(rule.targetId) : '',
      levelId: rule.levelId ? String(rule.levelId) : '',
      rate: String(rule.rate ?? 0),
      fixedAmount: rule.fixedAmount ? String(rule.fixedAmount) : '',
      calcBase: rule.calcBase ?? 'total',
      isDesignated: rule.isDesignated,
      designatedBonus: rule.designatedBonus ? String(rule.designatedBonus) : '',
      minThreshold: rule.minThreshold ? String(rule.minThreshold) : '',
      priority: String(rule.priority ?? 0),
      status: rule.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('规则名称不能为空');
      return;
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      targetType: form.targetType,
      targetId: toOptionalNumber(form.targetId),
      levelId: toOptionalNumber(form.levelId),
      rate: Number(form.rate),
      fixedAmount: toOptionalNumber(form.fixedAmount),
      calcBase: form.calcBase,
      isDesignated: form.isDesignated,
      designatedBonus: toOptionalNumber(form.designatedBonus),
      minThreshold: toOptionalNumber(form.minThreshold),
      priority: Number(form.priority || 0),
      status: form.status as CommissionRule['status'],
    };
    try {
      if (editing) {
        await updateCommissionRule(editing.id, payload);
        toast.success('提成规则已更新');
      } else {
        await createCommissionRule(payload);
        toast.success('提成规则已创建');
      }
      setDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '保存提成规则失败');
    }
  };

  const handleDelete = async (rule: CommissionRule) => {
    try {
      await deleteCommissionRule(rule.id);
      toast.success('规则已归档');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '归档失败');
    }
  };

  const handleImportTemplate = async () => {
    try {
      await batchCreateCommissionRules('beauty_standard');
      toast.success('已导入美业常用提成模板');
      loadData();
    } catch (error: any) {
      toast.error(error?.message || '模板导入失败');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">提成规则</h1>
          <p className="mt-1 text-sm text-muted-foreground">配置项目、商品、办卡、充值的提成比例和适用等级。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleImportTemplate}>
            <Sparkles className="h-4 w-4" /> 导入模板
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> 新增规则
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.type}
          onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
        >
          <option value="">全部类型</option>
          {Object.entries(typeLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.levelId}
          onChange={(event) => setFilters((prev) => ({ ...prev, levelId: event.target.value }))}
        >
          <option value="">全部等级</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>{level.name}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.status}
          onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
        >
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
          <option value="archived">已归档</option>
        </select>
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      <div className="grid gap-4">
        {groupedRules.map(([levelName, levelRules]) => (
          <div key={levelName} className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">{levelName}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>规则名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>范围</TableHead>
                  <TableHead>比例/固定</TableHead>
                  <TableHead>指定加成</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-28 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levelRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{typeLabels[rule.type]}</TableCell>
                    <TableCell>{targetLabels[rule.targetType]}{rule.targetId ? ` #${rule.targetId}` : ''}</TableCell>
                    <TableCell>{rule.fixedAmount ? `¥${rule.fixedAmount}` : formatPercent(rule.rate)}</TableCell>
                    <TableCell>{rule.isDesignated ? `+${formatPercent(rule.designatedBonus ?? 0)}` : '-'}</TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>{rule.status === 'active' ? '启用' : rule.status === 'disabled' ? '停用' : '已归档'}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(rule)} title="编辑">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(rule)} title="归档">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
        {!loading && groupedRules.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            暂无提成规则
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑提成规则' : '新增提成规则'}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>规则名称</span>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span>类型</span>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as CommissionType }))}>
                  {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>适用范围</span>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={form.targetType} onChange={(event) => setForm((prev) => ({ ...prev, targetType: event.target.value as CommissionTargetType }))}>
                  {Object.entries(targetLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>目标 ID</span>
                <Input value={form.targetId} onChange={(event) => setForm((prev) => ({ ...prev, targetId: event.target.value }))} placeholder="全部范围可留空" />
              </label>
              <label className="space-y-1 text-sm">
                <span>美容师等级</span>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={form.levelId} onChange={(event) => setForm((prev) => ({ ...prev, levelId: event.target.value }))}>
                  <option value="">全部等级</option>
                  {levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>比例</span>
                <Input value={form.rate} onChange={(event) => setForm((prev) => ({ ...prev, rate: event.target.value }))} placeholder="0.08" />
              </label>
              <label className="space-y-1 text-sm">
                <span>固定金额</span>
                <Input value={form.fixedAmount} onChange={(event) => setForm((prev) => ({ ...prev, fixedAmount: event.target.value }))} placeholder="留空则按比例" />
              </label>
              <label className="space-y-1 text-sm">
                <span>最低提成</span>
                <Input value={form.minThreshold} onChange={(event) => setForm((prev) => ({ ...prev, minThreshold: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span>优先级</span>
                <Input value={form.priority} onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span>状态</span>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                  <option value="archived">归档</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDesignated} onChange={(event) => setForm((prev) => ({ ...prev, isDesignated: event.target.checked }))} />
              指定美容师加成
            </label>
            {form.isDesignated && (
              <label className="space-y-1 text-sm">
                <span>指定加成比例</span>
                <Input value={form.designatedBonus} onChange={(event) => setForm((prev) => ({ ...prev, designatedBonus: event.target.value }))} placeholder="0.2" />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
