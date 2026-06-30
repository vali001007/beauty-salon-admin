import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  createCommissionRule,
  createCommissionRuleAssignment,
  deleteCommissionRule,
  deleteCommissionRuleAssignment,
  getCommissionRuleAssignments,
  getCommissionRules,
  updateCommissionRule,
  updateCommissionRuleAssignment,
  type CommissionRule,
  type CommissionRuleAssignment,
  type CommissionStatus,
  type CommissionTargetType,
  type CommissionType,
} from '@/api/commission';
import { getCards } from '@/api/card';
import { getProducts } from '@/api/product';
import { getProjects } from '@/api/project';
import { getUsers } from '@/api/user';
import type { Card } from '@/types/card';
import type { Product, Project } from '@/types';
import type { SystemUser } from '@/types/user';

const typeLabels: Record<CommissionType, string> = {
  project: '项目',
  product: '商品',
  card_sale: '办卡',
  recharge: '充值',
  new_customer: '新客',
};

const calcBaseLabels: Record<string, string> = {
  total: '实收金额',
  service_fee: '服务费',
  profit: '毛利',
};

const statusLabels: Record<CommissionStatus, string> = {
  active: '启用',
  disabled: '停用',
  archived: '已归档',
};

const objectRequiredTypes: CommissionType[] = ['project', 'product', 'card_sale'];

const initialRuleForm = {
  name: '',
  type: 'project' as CommissionType,
  rate: '0.08',
  fixedAmount: '',
  calcBase: 'total',
  minThreshold: '',
  status: 'active' as CommissionStatus,
};

const initialAssignmentForm = {
  ruleId: '',
  targetIds: [] as string[],
  userIds: [] as string[],
  status: 'active' as CommissionStatus,
  remark: '',
};

function formatPercent(value?: number) {
  return `${Math.round(Number(value ?? 0) * 10000) / 100}%`;
}

function formatCurrency(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toOptionalNumber(value: string) {
  if (value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function userName(user?: { name?: string; username?: string }) {
  return user?.name || user?.username || '-';
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function assignmentKey(type: CommissionType, targetId: number | undefined, userId: number) {
  const normalizedTarget = objectRequiredTypes.includes(type) ? Number(targetId ?? 0) : 0;
  return `${normalizedTarget}:${Number(userId)}`;
}

function compactLabels(labels: string[]) {
  if (!labels.length) return '-';
  const shown = labels.slice(0, 4);
  return labels.length > shown.length ? `${shown.join('、')} 等 ${labels.length} 项` : shown.join('、');
}

export function CommissionRules() {
  const [activeTab, setActiveTab] = useState<'rules' | 'assignments'>('rules');
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [assignments, setAssignments] = useState<CommissionRuleAssignment[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<CommissionRuleAssignment | null>(null);
  const [ruleForm, setRuleForm] = useState(initialRuleForm);
  const [assignmentForm, setAssignmentForm] = useState(initialAssignmentForm);
  const [filters, setFilters] = useState({ type: '', status: 'active' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulePage, assignmentPage, userList, projectList, productList, cardList] = await Promise.all([
        getCommissionRules({
          page: 1,
          pageSize: 500,
          type: filters.type || undefined,
          status: filters.status || undefined,
        }),
        getCommissionRuleAssignments({
          page: 1,
          pageSize: 1000,
        }),
        getUsers(),
        getProjects(),
        getProducts({ status: 'active' }),
        getCards(),
      ]);
      setRules(rulePage.items);
      setAssignments(assignmentPage.items);
      setUsers(userList.filter((user) => user.status === '启用'));
      setProjects(projectList.filter((project) => project.status !== false));
      setProducts(productList);
      setCards(cardList.filter((card) => card.status !== '下架'));
    } catch (error: any) {
      toast.error(error?.message || '加载提成规则失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const ruleById = useMemo(() => new Map(rules.map((rule) => [Number(rule.id), rule])), [rules]);
  const selectedRule = assignmentForm.ruleId ? ruleById.get(Number(assignmentForm.ruleId)) : undefined;
  const assignmentType = selectedRule?.type ?? 'project';

  const visibleAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        if (filters.type && assignment.type !== filters.type) return false;
        if (filters.status && assignment.status !== filters.status) return false;
        return true;
      }),
    [assignments, filters],
  );

  const objectOptions = useMemo(() => {
    if (assignmentType === 'project') return projects.map((item) => ({ id: Number(item.id), name: item.name, meta: item.type }));
    if (assignmentType === 'product') return products.map((item) => ({ id: Number(item.id), name: item.name, meta: item.sku }));
    if (assignmentType === 'card_sale') return cards.map((item) => ({ id: Number(item.id), name: item.name, meta: item.type }));
    return [];
  }, [assignmentType, cards, products, projects]);
  const selectedRuleHasActiveAssignments = useMemo(
    () => Boolean(selectedRule && assignments.some((assignment) => Number(assignment.ruleId) === selectedRule.id && assignment.status === 'active')),
    [assignments, selectedRule],
  );

  const objectNameMaps = useMemo(
    () => ({
      project: new Map(projects.map((item) => [Number(item.id), item.name])),
      product: new Map(products.map((item) => [Number(item.id), item.name])),
      card_sale: new Map(cards.map((item) => [Number(item.id), item.name])),
    }),
    [cards, products, projects],
  );

  const getObjectLabel = (assignment: CommissionRuleAssignment) => {
    if (assignment.type === 'recharge') return '全部充值';
    if (assignment.type === 'new_customer') return '全部新客';
    if (!assignment.targetId) return '-';
    return objectNameMaps[assignment.type]?.get(Number(assignment.targetId)) ?? `#${assignment.targetId}`;
  };

  const getRuleSummary = (rule: CommissionRule) => {
    const method = rule.fixedAmount ? formatCurrency(rule.fixedAmount) : formatPercent(rule.rate);
    return `${method} / ${calcBaseLabels[rule.calcBase] ?? rule.calcBase}`;
  };

  const groupedAssignments = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        ruleId: number;
        rule?: CommissionRule;
        ruleName: string;
        type: CommissionType;
        status: CommissionStatus;
        assignments: CommissionRuleAssignment[];
        objectLabels: Set<string>;
        userLabels: Set<string>;
        latestAt?: string;
      }
    >();

    for (const assignment of visibleAssignments) {
      const rule = assignment.rule ?? ruleById.get(Number(assignment.ruleId));
      const key = `${assignment.ruleId}:${assignment.status}`;
      const existed =
        groups.get(key) ??
        {
          key,
          ruleId: Number(assignment.ruleId),
          rule,
          ruleName: assignment.ruleName || rule?.name || `规则 #${assignment.ruleId}`,
          type: assignment.type,
          status: assignment.status,
          assignments: [],
          objectLabels: new Set<string>(),
          userLabels: new Set<string>(),
          latestAt: undefined,
        };
      existed.assignments.push(assignment);
      existed.objectLabels.add(getObjectLabel(assignment));
      existed.userLabels.add(assignment.userName || userName(assignment.user));
      const operatedAt = assignment.updatedAt ?? assignment.createdAt;
      if (operatedAt && (!existed.latestAt || new Date(operatedAt).getTime() > new Date(existed.latestAt).getTime())) {
        existed.latestAt = operatedAt;
      }
      groups.set(key, existed);
    }

    return Array.from(groups.values()).sort((left, right) => {
      const leftTime = left.latestAt ? new Date(left.latestAt).getTime() : 0;
      const rightTime = right.latestAt ? new Date(right.latestAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [getObjectLabel, ruleById, visibleAssignments]);

  const getExistingSelectionForRule = useCallback(
    (ruleId?: number | string) => {
      const rule = ruleId ? ruleById.get(Number(ruleId)) : undefined;
      const existed = assignments.filter((assignment) => Number(assignment.ruleId) === Number(ruleId) && assignment.status === 'active');
      return {
        targetIds: objectRequiredTypes.includes(rule?.type as CommissionType)
          ? Array.from(new Set(existed.map((assignment) => assignment.targetId).filter(Boolean).map(String)))
          : [],
        userIds: Array.from(new Set(existed.map((assignment) => assignment.userId).filter(Boolean).map(String))),
      };
    },
    [assignments, ruleById],
  );

  const openCreateRule = (type?: CommissionType) => {
    setEditingRule(null);
    setRuleForm({ ...initialRuleForm, type: type ?? 'project' });
    setRuleDialogOpen(true);
  };

  const openEditRule = (rule: CommissionRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      type: rule.type,
      rate: String(rule.rate ?? 0),
      fixedAmount: rule.fixedAmount ? String(rule.fixedAmount) : '',
      calcBase: rule.calcBase ?? 'total',
      minThreshold: rule.minThreshold ? String(rule.minThreshold) : '',
      status: rule.status,
    });
    setRuleDialogOpen(true);
  };

  const openCreateAssignment = (rule?: CommissionRule) => {
    const existed = getExistingSelectionForRule(rule?.id);
    setEditingAssignment(null);
    setAssignmentForm({
      ...initialAssignmentForm,
      ruleId: rule ? String(rule.id) : '',
      targetIds: existed.targetIds,
      userIds: existed.userIds,
    });
    setActiveTab('assignments');
    setAssignmentDialogOpen(true);
  };

  const openEditAssignment = (assignment: CommissionRuleAssignment) => {
    setEditingAssignment(assignment);
    setAssignmentForm({
      ruleId: String(assignment.ruleId),
      targetIds: assignment.targetId ? [String(assignment.targetId)] : [],
      userIds: [String(assignment.userId)],
      status: assignment.status,
      remark: assignment.remark ?? '',
    });
    setAssignmentDialogOpen(true);
  };

  const hasExistingActiveAssignment = (ruleId: number, type: CommissionType, targetId: number | undefined, userId: number) =>
    assignments.some((assignment) => {
      if (assignment.status !== 'active') return false;
      const normalizedTarget = objectRequiredTypes.includes(type) ? targetId : undefined;
      const assignmentTarget = objectRequiredTypes.includes(type) ? assignment.targetId : undefined;
      return (
        Number(assignment.ruleId) === ruleId &&
        assignment.type === type &&
        Number(assignment.userId) === userId &&
        Number(assignmentTarget ?? 0) === Number(normalizedTarget ?? 0)
      );
    });

  const handleRuleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ruleForm.name.trim()) {
      toast.error('规则名称不能为空');
      return;
    }
    const payload = {
      name: ruleForm.name.trim(),
      type: ruleForm.type,
      rate: Number(ruleForm.rate || 0),
      fixedAmount: toOptionalNumber(ruleForm.fixedAmount),
      calcBase: ruleForm.calcBase,
      minThreshold: toOptionalNumber(ruleForm.minThreshold),
      status: ruleForm.status,
    };
    try {
      if (editingRule) {
        await updateCommissionRule(editingRule.id, payload);
        toast.success('规则库已更新');
      } else {
        await createCommissionRule(payload);
        toast.success('规则库已创建');
      }
      setRuleDialogOpen(false);
      void loadData();
    } catch (error: any) {
      toast.error(error?.message || '保存规则失败');
    }
  };

  const handleAssignmentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (assignmentSaving) return;
    const rule = selectedRule;
    if (!rule) {
      toast.error('请选择提成规则');
      return;
    }
    if (!assignmentForm.userIds.length) {
      toast.error('请选择适用员工');
      return;
    }
    const requiresObject = objectRequiredTypes.includes(rule.type);
    if (requiresObject && !assignmentForm.targetIds.length) {
      toast.error('请选择适用对象');
      return;
    }
    if (editingAssignment && (assignmentForm.userIds.length > 1 || (requiresObject && assignmentForm.targetIds.length > 1))) {
      toast.error('编辑单条配置时只能选择一个对象和一个员工');
      return;
    }

    const userIds = assignmentForm.userIds.map(Number);
    const targetIds = requiresObject ? assignmentForm.targetIds.map(Number) : [undefined];

    setAssignmentSaving(true);
    const toastId = toast.loading('正在保存规则配置...');
    try {
      if (editingAssignment) {
        await updateCommissionRuleAssignment(editingAssignment.id, {
          ruleId: rule.id,
          type: rule.type,
          targetType: requiresObject ? 'specific' : 'all',
          targetId: requiresObject ? targetIds[0] : undefined,
          userId: userIds[0],
          status: assignmentForm.status,
          remark: assignmentForm.remark.trim() || undefined,
        });
        toast.success('规则配置已更新', { id: toastId });
      } else {
        const selectedKeys = new Set(targetIds.flatMap((targetId) => userIds.map((userId) => assignmentKey(rule.type, targetId, userId))));
        const currentActiveAssignments = assignments.filter(
          (assignment) => Number(assignment.ruleId) === rule.id && assignment.status === 'active',
        );
        const removedCurrentAssignments = currentActiveAssignments.filter((assignment) => {
          const normalizedTarget = objectRequiredTypes.includes(rule.type) ? Number(assignment.targetId ?? 0) : undefined;
          return !selectedKeys.has(assignmentKey(rule.type, normalizedTarget, Number(assignment.userId)));
        });
        const overwrittenAssignments = assignments.filter((assignment) => {
          if (assignment.status !== 'active') return false;
          if (Number(assignment.ruleId) === rule.id) return false;
          if (assignment.type !== rule.type) return false;
          const normalizedTarget = objectRequiredTypes.includes(rule.type) ? Number(assignment.targetId ?? 0) : undefined;
          return selectedKeys.has(assignmentKey(rule.type, normalizedTarget, Number(assignment.userId)));
        });
        const shouldArchive = Array.from(
          new Map([...removedCurrentAssignments, ...overwrittenAssignments].map((assignment) => [assignment.id, assignment])).values(),
        );
        if (shouldArchive.length > 0) {
          const confirmed = window.confirm(
            `本次保存会归档 ${shouldArchive.length} 条原有规则配置。包含：移除当前规则 ${removedCurrentAssignments.length} 条，覆盖其他规则 ${overwrittenAssignments.length} 条。归档后这些适用范围和员工将按当前规则计提，是否确认保存？`,
          );
          if (!confirmed) {
            toast.dismiss(toastId);
            setAssignmentSaving(false);
            return;
          }
        }

        const createPayloads = targetIds.flatMap((targetId) =>
          userIds.flatMap((userId) => {
            if (hasExistingActiveAssignment(rule.id, rule.type, targetId, userId)) return [];
            const targetType: CommissionTargetType = requiresObject ? 'specific' : 'all';
            return [{
              ruleId: rule.id,
              type: rule.type,
              targetType,
              targetId: requiresObject ? targetId : undefined,
              userId,
              status: assignmentForm.status,
              remark: assignmentForm.remark.trim() || undefined,
            }];
          }),
        );
        setAssignmentDialogOpen(false);
        await Promise.all([
          ...shouldArchive.map((assignment) => deleteCommissionRuleAssignment(assignment.id)),
          ...createPayloads.map((payload) => createCommissionRuleAssignment(payload)),
        ]);
        toast.success(`规则配置已更新：新增 ${createPayloads.length} 条，归档 ${shouldArchive.length} 条`, { id: toastId });
      }
      setAssignmentDialogOpen(false);
      void loadData();
    } catch (error: any) {
      toast.error(error?.message || '保存规则配置失败', { id: toastId });
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleDeleteRule = async (rule: CommissionRule) => {
    try {
      await deleteCommissionRule(rule.id);
      toast.success('规则已归档');
      void loadData();
    } catch (error: any) {
      toast.error(error?.message || '归档规则失败');
    }
  };

  const handleDeleteAssignment = async (assignment: CommissionRuleAssignment) => {
    try {
      await deleteCommissionRuleAssignment(assignment.id);
      toast.success('配置已归档');
      void loadData();
    } catch (error: any) {
      toast.error(error?.message || '归档配置失败');
    }
  };

  const handleDeleteAssignmentGroup = async (group: { assignments: CommissionRuleAssignment[] }) => {
    try {
      for (const assignment of group.assignments) {
        if (assignment.status !== 'archived') {
          await deleteCommissionRuleAssignment(assignment.id);
        }
      }
      toast.success(`已归档 ${group.assignments.filter((assignment) => assignment.status !== 'archived').length} 条配置`);
      void loadData();
    } catch (error: any) {
      toast.error(error?.message || '归档配置失败');
    }
  };

  const typeCounts = useMemo(() => {
    const counts = new Map<CommissionType, { rules: number; assignments: number }>();
    for (const type of Object.keys(typeLabels) as CommissionType[]) counts.set(type, { rules: 0, assignments: 0 });
    for (const rule of rules) counts.get(rule.type)!.rules += 1;
    for (const assignment of assignments) counts.get(assignment.type)!.assignments += 1;
    return counts;
  }, [assignments, rules]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">提成规则</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            规则库只维护提成算法；规则配置再绑定项目、商品、卡项和员工。
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-2" onClick={() => openCreateRule()}>
            <Plus className="h-4 w-4" /> 新建规则
          </Button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-5">
        {(Object.keys(typeLabels) as CommissionType[]).map((type) => {
          const count = typeCounts.get(type)!;
          return (
            <button
              key={type}
              type="button"
              onClick={() => openCreateRule(type)}
              className="rounded-lg border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="text-sm text-muted-foreground">{typeLabels[type]}提成</div>
              <div className="mt-2 text-2xl font-semibold">{count.rules}</div>
              <div className="mt-1 text-xs text-muted-foreground">规则 {count.rules} 条 / 配置 {count.assignments} 条</div>
            </button>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-muted/20 p-1">
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm ${activeTab === 'rules' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('rules')}
          >
            规则库
          </button>
          <button
            type="button"
            className={`rounded-md px-4 py-2 text-sm ${activeTab === 'assignments' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('assignments')}
          >
            规则配置
          </button>
        </div>
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
          value={filters.status}
          onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
        >
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
          <option value="archived">已归档</option>
        </select>
        <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> 刷新
        </Button>
      </div>

      {activeTab === 'rules' ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>规则名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>计算方式</TableHead>
              <TableHead>计算基数</TableHead>
              <TableHead>配置数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最新操作时间</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>{typeLabels[rule.type]}</TableCell>
                <TableCell>{rule.fixedAmount ? formatCurrency(rule.fixedAmount) : formatPercent(rule.rate)}</TableCell>
                <TableCell>{calcBaseLabels[rule.calcBase] ?? rule.calcBase}</TableCell>
                <TableCell>{rule.assignments?.filter((item) => item.status !== 'archived').length ?? 0}</TableCell>
                <TableCell>{statusLabels[rule.status]}</TableCell>
                <TableCell>{formatDateTime(rule.updatedAt ?? rule.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => openCreateAssignment(rule)}>
                      配置
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEditRule(rule)} title="编辑规则">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => void handleDeleteRule(rule)} title="归档规则">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  暂无规则库数据
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>规则</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>适用对象</TableHead>
              <TableHead>适用员工</TableHead>
              <TableHead>算法</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最新操作时间</TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedAssignments.map((group) => {
              const rule = group.rule ?? ruleById.get(Number(group.ruleId));
              const objectLabels = Array.from(group.objectLabels).filter(Boolean);
              const userLabels = Array.from(group.userLabels).filter(Boolean);
              return (
                <TableRow key={group.key}>
                  <TableCell className="font-medium">{group.ruleName}</TableCell>
                  <TableCell>{typeLabels[group.type]}</TableCell>
                  <TableCell title={objectLabels.join('、')}>
                    {compactLabels(objectLabels)}
                    <div className="mt-1 text-xs text-muted-foreground">{objectLabels.length} 项对象</div>
                  </TableCell>
                  <TableCell title={userLabels.join('、')}>
                    {compactLabels(userLabels)}
                    <div className="mt-1 text-xs text-muted-foreground">{userLabels.length} 名员工</div>
                  </TableCell>
                  <TableCell>{rule ? getRuleSummary(rule) : '-'}</TableCell>
                  <TableCell>{statusLabels[group.status]}</TableCell>
                  <TableCell>{formatDateTime(group.latestAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => (rule ? openCreateAssignment(rule) : undefined)} title="编辑配置">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void handleDeleteAssignmentGroup(group)} title="归档配置">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!loading && groupedAssignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  暂无规则配置
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? '编辑规则库' : '新建规则库'}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleRuleSubmit}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>规则名称</span>
                <Input value={ruleForm.name} onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span>类型</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={ruleForm.type}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, type: event.target.value as CommissionType }))}
                  disabled={Boolean(editingRule)}
                >
                  {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </div>
            <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              规则库不选择项目、商品、卡项或员工；这些绑定在“规则配置”里维护。
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>比例</span>
                <Input value={ruleForm.rate} onChange={(event) => setRuleForm((prev) => ({ ...prev, rate: event.target.value }))} placeholder="0.08" />
              </label>
              <label className="space-y-1 text-sm">
                <span>固定金额</span>
                <Input value={ruleForm.fixedAmount} onChange={(event) => setRuleForm((prev) => ({ ...prev, fixedAmount: event.target.value }))} placeholder="留空则按比例" />
              </label>
              <label className="space-y-1 text-sm">
                <span>计算基数</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={ruleForm.calcBase}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, calcBase: event.target.value }))}
                >
                  {Object.entries(calcBaseLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>最低提成</span>
                <Input value={ruleForm.minThreshold} onChange={(event) => setRuleForm((prev) => ({ ...prev, minThreshold: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm">
                <span>状态</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={ruleForm.status}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, status: event.target.value as CommissionStatus }))}
                >
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                  <option value="archived">归档</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRuleDialogOpen(false)}>取消</Button>
              <Button type="submit">保存</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAssignment || selectedRuleHasActiveAssignments ? '编辑规则配置' : '新增规则配置'}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleAssignmentSubmit}>
            <label className="space-y-1 text-sm">
              <span>选择规则</span>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3"
                value={assignmentForm.ruleId}
                onChange={(event) => {
                  const ruleId = event.target.value;
                  const existed = getExistingSelectionForRule(ruleId);
                  setAssignmentForm((prev) => ({ ...prev, ruleId, targetIds: existed.targetIds, userIds: existed.userIds }));
                }}
              >
                <option value="">请选择提成规则</option>
                {rules
                  .filter((rule) => rule.status !== 'archived')
                  .map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {typeLabels[rule.type]} / {rule.name} / {getRuleSummary(rule)}
                    </option>
                  ))}
              </select>
            </label>

            {selectedRule ? (
              <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                当前类型：{typeLabels[selectedRule.type]}；同一适用范围和员工只允许一条启用配置。
              </div>
            ) : null}

            {selectedRule && objectRequiredTypes.includes(selectedRule.type) ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span>适用对象</span>
                  <span className="text-xs text-muted-foreground">已选 {assignmentForm.targetIds.length} 项</span>
                </div>
                <div className="max-h-40 overflow-auto rounded-md border border-border bg-background">
                  {objectOptions.map((item) => {
                    const value = String(item.id);
                    return (
                      <label key={item.id} className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-muted/40">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={assignmentForm.targetIds.includes(value)}
                          onChange={() => setAssignmentForm((prev) => ({ ...prev, targetIds: toggleValue(prev.targetIds, value) }))}
                        />
                        <span className="flex-1">
                          {item.name}
                          {item.meta ? <span className="ml-1 text-muted-foreground">/ {item.meta}</span> : null}
                        </span>
                      </label>
                    );
                  })}
                  {objectOptions.length === 0 ? (
                    <div className="px-3 py-6 text-center text-muted-foreground">暂无可选对象</div>
                  ) : null}
                </div>
              </div>
            ) : selectedRule ? (
              <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                {selectedRule.type === 'recharge' ? '充值规则默认覆盖全部充值。' : '新客规则默认覆盖全部新客。'}
              </div>
            ) : null}

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>适用员工</span>
                <span className="text-xs text-muted-foreground">已选 {assignmentForm.userIds.length} 人</span>
              </div>
              <div className="max-h-40 overflow-auto rounded-md border border-border bg-background">
                {users.map((user) => {
                  const value = String(user.id);
                  return (
                    <label key={user.id} className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-muted/40">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={assignmentForm.userIds.includes(value)}
                        onChange={() => setAssignmentForm((prev) => ({ ...prev, userIds: toggleValue(prev.userIds, value) }))}
                      />
                      <span className="flex-1">{user.name || user.username}</span>
                    </label>
                  );
                })}
                {users.length === 0 ? (
                  <div className="px-3 py-6 text-center text-muted-foreground">暂无可选员工</div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>状态</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={assignmentForm.status}
                  onChange={(event) => setAssignmentForm((prev) => ({ ...prev, status: event.target.value as CommissionStatus }))}
                >
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                  <option value="archived">归档</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>备注</span>
                <Input value={assignmentForm.remark} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, remark: event.target.value }))} />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAssignmentDialogOpen(false)} disabled={assignmentSaving}>取消</Button>
              <Button type="submit" disabled={assignmentSaving}>{assignmentSaving ? '保存中...' : '保存'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
