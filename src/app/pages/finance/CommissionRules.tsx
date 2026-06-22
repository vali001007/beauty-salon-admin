import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Loader2, Plus, RefreshCcw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  createCommissionRule,
  deleteCommissionRule,
  getCommissionRules,
  updateCommissionRule,
  type CommissionRule,
  type CommissionTargetType,
  type CommissionType,
} from '@/api/commission';
import { createIndustryAdoption, getIndustrySalaryBenchmarks } from '@/api/industry';
import { getBeauticianLevels } from '@/api/beauticianLevel';
import { getUsers } from '@/api/user';
import type { BeauticianLevel } from '@/api/domain-types';
import type { IndustrySalaryBenchmark } from '@/types';
import type { SystemUser } from '@/types/user';

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
  userId: '',
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

function formatMoneyRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return '未配置';
  if (min != null && max != null) return `¥${Number(min).toFixed(2)} - ¥${Number(max).toFixed(2)}`;
  return `¥${Number(min ?? max).toFixed(2)}`;
}

function averageRange(min?: number | null, max?: number | null) {
  if (min != null && max != null) return (Number(min) + Number(max)) / 2;
  if (min != null) return Number(min);
  if (max != null) return Number(max);
  return undefined;
}

function toOptionalNumber(value: string) {
  if (value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

export function CommissionRules() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [levels, setLevels] = useState<BeauticianLevel[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionRule | null>(null);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({ type: '', status: 'active', userId: '', levelId: '' });
  const [salaryTemplates, setSalaryTemplates] = useState<IndustrySalaryBenchmark[]>([]);
  const [salaryTemplatesLoading, setSalaryTemplatesLoading] = useState(false);
  const [selectedSalaryTemplateId, setSelectedSalaryTemplateId] = useState('');
  const [selectedSalaryUserId, setSelectedSalaryUserId] = useState('');
  const [selectedSalaryLevelId, setSelectedSalaryLevelId] = useState('');
  const [applyingSalaryTemplate, setApplyingSalaryTemplate] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulePage, levelList] = await Promise.all([
        getCommissionRules({
          page: 1,
          pageSize: 200,
          type: filters.type || undefined,
          status: filters.status || undefined,
          userId: filters.userId || undefined,
          levelId: filters.levelId || undefined,
        }),
        getBeauticianLevels(),
      ]);
      setRules(rulePage.items);
      setLevels(levelList);
      const userList = await getUsers();
      setUsers(userList.filter((user) => user.status === '启用'));
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
      const key = rule.user?.name ?? (rule.userId ? `员工 ${rule.userId}` : '未绑定员工');
      groups.set(key, [...(groups.get(key) ?? []), rule]);
    }
    return Array.from(groups.entries());
  }, [rules]);
  const selectedSalaryTemplate = salaryTemplates.find((template) => String(template.id) === selectedSalaryTemplateId);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setDialogOpen(true);
  };

  const openSalaryReference = () => {
    setSelectedSalaryTemplateId('');
    setSelectedSalaryUserId('');
    setSelectedSalaryLevelId('');
    setSalaryDialogOpen(true);
    setSalaryTemplatesLoading(true);
    getIndustrySalaryBenchmarks({ status: 'published', page: 1, pageSize: 200 })
      .then((page) => setSalaryTemplates(page.items))
      .catch((error) => toast.error(error instanceof Error ? error.message : '行业薪酬模板加载失败'))
      .finally(() => setSalaryTemplatesLoading(false));
  };

  const openEdit = (rule: CommissionRule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      type: rule.type,
      targetType: rule.targetType,
      targetId: rule.targetId ? String(rule.targetId) : '',
      levelId: rule.levelId ? String(rule.levelId) : '',
      userId: rule.userId ? String(rule.userId) : '',
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
    if (!form.userId) {
      toast.error('请选择适用员工');
      return;
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      targetType: form.targetType,
      targetId: toOptionalNumber(form.targetId),
      levelId: toOptionalNumber(form.levelId),
      userId: toOptionalNumber(form.userId),
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

  const applySalaryTemplateToRule = async () => {
    if (!selectedSalaryTemplate) {
      toast.error('请选择行业薪酬模板');
      return;
    }
    if (!selectedSalaryUserId) {
      toast.error('请选择适用员工');
      return;
    }
    const recommendedRate = averageRange(
      selectedSalaryTemplate.commissionRateMin,
      selectedSalaryTemplate.commissionRateMax,
    );
    setApplyingSalaryTemplate(true);
    try {
      await createIndustryAdoption({
        adoptionType: 'salary_reference',
        templateVersion: selectedSalaryTemplate.version,
        payload: {
          salaryBenchmarkId: selectedSalaryTemplate.id,
          jobRole: selectedSalaryTemplate.jobRole,
          employeeLevel: selectedSalaryTemplate.employeeLevel,
          targetUserId: Number(selectedSalaryUserId),
          targetLevelId: selectedSalaryLevelId ? Number(selectedSalaryLevelId) : undefined,
          baseSalaryMin: selectedSalaryTemplate.baseSalaryMin,
          baseSalaryMax: selectedSalaryTemplate.baseSalaryMax,
          commissionRateMin: selectedSalaryTemplate.commissionRateMin,
          commissionRateMax: selectedSalaryTemplate.commissionRateMax,
          serviceFeeMin: selectedSalaryTemplate.serviceFeeMin,
          serviceFeeMax: selectedSalaryTemplate.serviceFeeMax,
        },
      });
      setEditing(null);
      setForm({
        ...initialForm,
        name: `${selectedSalaryTemplate.jobRole}行业参考提成`,
        type: 'project',
        targetType: 'all',
        userId: selectedSalaryUserId,
        levelId: selectedSalaryLevelId,
        rate: recommendedRate === undefined ? initialForm.rate : String(Number(recommendedRate.toFixed(4))),
      });
      setSalaryDialogOpen(false);
      setDialogOpen(true);
      toast.success('已带入行业薪酬参考，可确认后保存提成规则');
    } catch (error: any) {
      toast.error(error?.message || '应用行业薪酬参考失败');
    } finally {
      setApplyingSalaryTemplate(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">提成规则</h1>
          <p className="mt-1 text-sm text-muted-foreground">配置项目、商品、办卡、充值的提成比例，并绑定到具体员工。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={openSalaryReference}>
            <Sparkles className="h-4 w-4" /> 行业薪酬参考
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
          value={filters.userId}
          onChange={(event) => setFilters((prev) => ({ ...prev, userId: event.target.value }))}
        >
          <option value="">全部员工</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name || user.username}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.levelId}
          onChange={(event) => setFilters((prev) => ({ ...prev, levelId: event.target.value }))}
        >
          <option value="">全部员工等级</option>
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
                  <TableHead>员工等级</TableHead>
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
                    <TableCell>{rule.level?.name ?? '全部员工等级'}</TableCell>
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

      <Dialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="salary-reference-description">
          <DialogHeader>
            <DialogTitle>行业薪酬参考</DialogTitle>
          </DialogHeader>
          <p id="salary-reference-description" className="text-sm text-muted-foreground">
            选择行业岗位薪酬模板后，可将建议提成率带入新增提成规则；固定工资仅作为参考，不会自动生成工资表。
          </p>
          <div className="space-y-4">
            <label className="space-y-1 text-sm">
              <span>行业薪酬模板</span>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3"
                value={selectedSalaryTemplateId}
                onChange={(event) => setSelectedSalaryTemplateId(event.target.value)}
                disabled={salaryTemplatesLoading || applyingSalaryTemplate}
              >
                <option value="">{salaryTemplatesLoading ? '正在加载行业薪酬模板...' : '请选择行业薪酬模板'}</option>
                {salaryTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.roleCategory || '岗位'} / {template.jobRole} / {template.employeeLevel || '通用等级'}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>适用员工 *</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={selectedSalaryUserId}
                  onChange={(event) => setSelectedSalaryUserId(event.target.value)}
                  disabled={applyingSalaryTemplate}
                >
                  <option value="">请选择员工</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name || user.username}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>员工等级</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={selectedSalaryLevelId}
                  onChange={(event) => setSelectedSalaryLevelId(event.target.value)}
                  disabled={applyingSalaryTemplate}
                >
                  <option value="">全部员工等级</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>{level.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedSalaryTemplate && (
              <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950 md:grid-cols-2">
                <div>
                  <div className="text-xs text-blue-500">岗位</div>
                  <div className="mt-1 font-medium">{selectedSalaryTemplate.jobRole}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">等级</div>
                  <div className="mt-1 font-medium">{selectedSalaryTemplate.employeeLevel || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">固定薪资参考</div>
                  <div className="mt-1 font-medium">
                    {formatMoneyRange(selectedSalaryTemplate.baseSalaryMin, selectedSalaryTemplate.baseSalaryMax)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">提成比例参考</div>
                  <div className="mt-1 font-medium">
                    {selectedSalaryTemplate.commissionRateMin != null || selectedSalaryTemplate.commissionRateMax != null
                      ? `${formatPercent(selectedSalaryTemplate.commissionRateMin ?? 0)} - ${formatPercent(selectedSalaryTemplate.commissionRateMax ?? selectedSalaryTemplate.commissionRateMin ?? 0)}`
                      : '未配置'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">服务费参考</div>
                  <div className="mt-1 font-medium">
                    {formatMoneyRange(selectedSalaryTemplate.serviceFeeMin, selectedSalaryTemplate.serviceFeeMax)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-500">版本</div>
                  <div className="mt-1 font-medium">v{selectedSalaryTemplate.version}</div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSalaryDialogOpen(false)} disabled={applyingSalaryTemplate}>
                取消
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={applySalaryTemplateToRule}
                disabled={!selectedSalaryTemplate || !selectedSalaryUserId || salaryTemplatesLoading || applyingSalaryTemplate}
              >
                {applyingSalaryTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                带入提成规则
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                <span>适用员工 *</span>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={form.userId} onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}>
                  <option value="">请选择员工</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.username}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>员工等级</span>
                <select className="h-10 w-full rounded-md border border-border bg-background px-3" value={form.levelId} onChange={(event) => setForm((prev) => ({ ...prev, levelId: event.target.value }))}>
                  <option value="">全部员工等级</option>
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
              指定员工加成
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
