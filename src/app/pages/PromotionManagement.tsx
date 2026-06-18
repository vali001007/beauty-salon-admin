import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Loader2, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  approvePromotion,
  createPromotion,
  deletePromotion,
  getPromotionsPaginated,
  offlinePromotion,
  publishPromotion,
  rejectPromotion,
  updatePromotion,
} from '@/api/promotion';
import { getProjects } from '@/api/project';
import { useStoreStore } from '@/stores/storeStore';
import type { Promotion, PromotionPayload, Project } from '@/types';

const emptyForm: PromotionPayload = {
  name: '',
  description: '',
  discountText: '',
  type: 'money_off',
  source: 'store',
  scenario: '',
  audienceTags: [],
  applicableCustomerLevels: [],
  applicableProjectIds: [],
  thresholdAmount: null,
  discountAmount: null,
  discountRate: null,
  giftText: '',
  validDays: null,
  maxIssueCount: null,
  estimatedCost: null,
  stackable: false,
  approvalStatus: 'approved',
  startAt: '',
  endAt: '',
  status: 'draft',
};

const promotionTypeOptions = [
  { value: 'money_off', label: '满减/现金券' },
  { value: 'percentage_off', label: '折扣' },
  { value: 'gift', label: '赠品/赠护理' },
  { value: 'trial_price', label: '体验价' },
  { value: 'member_privilege', label: '会员礼遇' },
  { value: 'package_upgrade', label: '套餐升级' },
];

const scenarioOptions = [
  { value: '', label: '通用权益' },
  { value: 'churn_winback', label: '流失唤醒' },
  { value: 'care_cycle_due', label: '护理周期' },
  { value: 'vip_privilege_care', label: '高价值客户维护' },
  { value: 'birthday', label: '生日关怀' },
  { value: 'new_customer', label: '新客转化' },
  { value: 'browse_abandonment', label: '浏览未预约' },
  { value: 'card_expiry', label: '次卡/套餐到期' },
  { value: 'coupon_claimed_unused', label: '领券未核销' },
  { value: 'seasonal_skin_care', label: '季节护理' },
  { value: 'project_idle_capacity', label: '低峰排期' },
];

function formatDate(value?: string | null) {
  if (!value) return '不限';
  return String(value).slice(0, 10);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    active: '已发布',
    offline: '已下线',
  };
  return labels[status] ?? status;
}

function typeLabel(type?: string) {
  return promotionTypeOptions.find((option) => option.value === type)?.label ?? type ?? '未设置';
}

function scenarioLabel(scenario?: string | null) {
  return scenarioOptions.find((option) => option.value === scenario)?.label ?? scenario ?? '通用权益';
}

function approvalStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
  };
  return labels[status || ''] ?? status ?? '未设置';
}

function splitTags(value: string) {
  return value
    .split(/[,\n，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinTags(value?: string[]) {
  return Array.isArray(value) ? value.join('、') : '';
}

function nullableNumber(value: string) {
  return value === '' ? null : Number(value);
}

export function PromotionManagement({ embedded = false }: { embedded?: boolean }) {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [items, setItems] = useState<Promotion[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<PromotionPayload>(emptyForm);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [scenarioFilter, setScenarioFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');

  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [promotionResult, projectResult] = await Promise.all([
        getPromotionsPaginated({
          page,
          pageSize,
          storeId: currentStoreId,
          keyword: keyword.trim() || undefined,
          type: typeFilter || undefined,
          scenario: scenarioFilter || undefined,
          approvalStatus: approvalFilter || undefined,
        }),
        getProjects(),
      ]);
      const promotionItems = promotionResult.items ?? promotionResult.data ?? [];
      setItems(promotionItems);
      setTotal(promotionResult.total ?? promotionItems.length);
      setProjects(projectResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '权益资产加载失败');
    } finally {
      setLoading(false);
    }
  }, [approvalFilter, currentStoreId, keyword, page, pageSize, scenarioFilter, typeFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, storeId: currentStoreId ?? null });
    setOpen(true);
  };

  const openEdit = (item: Promotion) => {
    setEditing(item);
    setForm({
      storeId: item.storeId ?? null,
      name: item.name,
      description: item.description ?? '',
      discountText: item.discountText,
      type: item.type,
      source: item.source,
      scenario: item.scenario ?? '',
      audienceTags: item.audienceTags ?? [],
      applicableCustomerLevels: item.applicableCustomerLevels ?? [],
      applicableProjectIds: item.applicableProjectIds,
      thresholdAmount: item.thresholdAmount ?? null,
      discountAmount: item.discountAmount ?? null,
      discountRate: item.discountRate ?? null,
      giftText: item.giftText ?? '',
      validDays: item.validDays ?? null,
      maxIssueCount: item.maxIssueCount ?? null,
      estimatedCost: item.estimatedCost ?? null,
      stackable: item.stackable,
      approvalStatus: item.approvalStatus,
      startAt: item.startAt ? item.startAt.slice(0, 10) : '',
      endAt: item.endAt ? item.endAt.slice(0, 10) : '',
      status: item.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('请填写权益名称');
      return;
    }
    if (!form.discountText.trim()) {
      toast.error('请填写权益内容');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        storeId: form.storeId ?? currentStoreId ?? null,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
        applicableProjectIds: form.applicableProjectIds ?? [],
        audienceTags: form.audienceTags ?? [],
        applicableCustomerLevels: form.applicableCustomerLevels ?? [],
        scenario: form.scenario || null,
        giftText: form.giftText || null,
      };
      if (editing) {
        await updatePromotion(editing.id, payload);
        toast.success('权益资产已更新');
      } else {
        await createPromotion(payload);
        toast.success('权益资产已创建');
      }
      setOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: () => Promise<unknown>, successText: string) => {
    try {
      await action();
      toast.success(successText);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  const toggleProject = (projectId: number) => {
    setForm((prev) => {
      const current = prev.applicableProjectIds ?? [];
      return {
        ...prev,
        applicableProjectIds: current.includes(projectId)
          ? current.filter((id) => id !== projectId)
          : [...current, projectId],
      };
    });
  };

  const search = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setTypeFilter('');
    setScenarioFilter('');
    setApprovalFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">权益资产库</h1>
            <p className="mt-1 text-sm text-gray-500">管理活动、自动触达、小程序和终端可复用的权益资产。</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新建权益
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新建权益
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_160px_auto]">
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') search();
              }}
              placeholder="搜索权益名称、内容、标签"
            />
            <Button type="button" variant="outline" onClick={search}>
              搜索
            </Button>
          </div>
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value="">全部权益类型</option>
            {promotionTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={scenarioFilter}
            onChange={(event) => {
              setScenarioFilter(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value="">全部适用场景</option>
            {scenarioOptions.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={approvalFilter}
            onChange={(event) => {
              setApprovalFilter(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border border-gray-300 px-3 text-sm"
          >
            <option value="">全部审核状态</option>
            <option value="draft">草稿</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
          </select>
          <Button type="button" variant="ghost" onClick={resetFilters}>
            重置
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>权益名称</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>权益类型</TableHead>
              <TableHead>权益内容</TableHead>
              <TableHead>适用场景</TableHead>
              <TableHead>适用项目</TableHead>
              <TableHead>发放/核销</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>审核</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-gray-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  加载中
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-gray-500">暂无权益资产</TableCell>
              </TableRow>
            ) : items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium text-gray-900">{item.name}</div>
                  {item.description && <div className="mt-1 text-xs text-gray-500">{item.description}</div>}
                </TableCell>
                <TableCell>{item.storeName || '全部门店'}</TableCell>
                <TableCell>{typeLabel(item.type)}</TableCell>
                <TableCell>{item.discountText}</TableCell>
                <TableCell>
                  <div>{scenarioLabel(item.scenario)}</div>
                  {item.audienceTags?.length ? <div className="mt-1 text-xs text-gray-500">{item.audienceTags.join('、')}</div> : null}
                </TableCell>
                <TableCell>
                  {item.applicableProjectIds.length === 0
                    ? '全部项目'
                    : item.applicableProjectIds.map((id) => projectNameById.get(id) ?? `项目 ${id}`).join('、')}
                </TableCell>
                <TableCell>
                  <div>{item.issuedCount}/{item.maxIssueCount ?? '不限'}</div>
                  <div className="mt-1 text-xs text-gray-500">已核销 {item.usedCount}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{statusLabel(item.status)}</Badge>
                  <div className="mt-1 text-xs text-gray-500">{formatDate(item.startAt)} 至 {formatDate(item.endAt)}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={item.approvalStatus === 'approved' ? 'default' : 'secondary'}>{approvalStatusLabel(item.approvalStatus)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)} className="gap-1">
                      <Edit2 className="h-3.5 w-3.5" />
                      编辑
                    </Button>
                    {item.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => runAction(() => offlinePromotion(item.id), '权益已下线')} className="gap-1">
                        <PowerOff className="h-3.5 w-3.5" />
                        下线
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => runAction(() => publishPromotion(item.id), '权益已发布')} className="gap-1">
                        <Power className="h-3.5 w-3.5" />
                        发布
                      </Button>
                    )}
                    {item.approvalStatus === 'pending' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => runAction(() => approvePromotion(item.id), '权益草稿已通过')} className="gap-1">
                          通过
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => runAction(() => rejectPromotion(item.id), '权益草稿已驳回')} className="gap-1">
                          驳回
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => runAction(() => deletePromotion(item.id), '权益已删除')} className="gap-1 text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 text-sm text-gray-600">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="h-8 rounded border border-gray-300 px-2 text-sm"
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" aria-describedby="promotion-dialog-desc">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑权益资产' : '新建权益资产'}</DialogTitle>
          </DialogHeader>
          <span id="promotion-dialog-desc" className="sr-only">配置活动、自动触达、小程序和终端可复用的权益资产</span>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">权益名称</label>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">状态</label>
                <select
                  className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
                  value={String(form.status ?? 'draft')}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="draft">草稿</option>
                  <option value="active">已发布</option>
                  <option value="offline">已下线</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">权益类型</label>
                <select
                  className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
                  value={String(form.type ?? 'money_off')}
                  onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                >
                  {promotionTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">适用场景</label>
                <select
                  className="h-9 w-full rounded-md border border-gray-300 px-3 text-sm"
                  value={String(form.scenario ?? '')}
                  onChange={(event) => setForm((prev) => ({ ...prev, scenario: event.target.value }))}
                >
                  {scenarioOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">权益内容</label>
              <Input value={form.discountText} onChange={(event) => setForm((prev) => ({ ...prev, discountText: event.target.value }))} placeholder="如：满 399 减 80" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">权益说明</label>
              <textarea
                value={form.description ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">适用人群标签</label>
                <Input
                  value={joinTags(form.audienceTags)}
                  onChange={(event) => setForm((prev) => ({ ...prev, audienceTags: splitTags(event.target.value) }))}
                  placeholder="如：流失风险、敏感肌"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">适用会员等级</label>
                <Input
                  value={joinTags(form.applicableCustomerLevels)}
                  onChange={(event) => setForm((prev) => ({ ...prev, applicableCustomerLevels: splitTags(event.target.value) }))}
                  placeholder="如：铂金、黄金、VIP"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">满减门槛</label>
                <Input type="number" value={form.thresholdAmount ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, thresholdAmount: nullableNumber(event.target.value) }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">减免金额</label>
                <Input type="number" value={form.discountAmount ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, discountAmount: nullableNumber(event.target.value) }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">折扣率</label>
                <Input type="number" value={form.discountRate ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, discountRate: nullableNumber(event.target.value) }))} placeholder="85 表示 8.5 折" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">有效天数</label>
                <Input type="number" value={form.validDays ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, validDays: nullableNumber(event.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">发放上限</label>
                <Input type="number" value={form.maxIssueCount ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, maxIssueCount: nullableNumber(event.target.value) }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">预计成本</label>
                <Input type="number" value={form.estimatedCost ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, estimatedCost: nullableNumber(event.target.value) }))} />
              </div>
              <label className="mt-7 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.stackable)}
                  onChange={(event) => setForm((prev) => ({ ...prev, stackable: event.target.checked }))}
                />
                可与其他权益叠加
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">开始日期</label>
                <Input type="date" value={String(form.startAt ?? '')} onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">结束日期</label>
                <Input type="date" value={String(form.endAt ?? '')} onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">适用项目</label>
                <span className="text-xs text-gray-500">不选表示全部项目</span>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 p-3">
                {projects.length === 0 ? (
                  <div className="py-2 text-center text-sm text-gray-400">暂无项目</div>
                ) : projects.map((project) => (
                  <label key={project.id} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={(form.applicableProjectIds ?? []).includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                    />
                    <span>{project.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
