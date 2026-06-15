import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Loader2, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import {
  createPromotion,
  deletePromotion,
  getPromotionsPaginated,
  offlinePromotion,
  publishPromotion,
  updatePromotion,
} from '@/api/promotion';
import { getProjects } from '@/api/project';
import { useStoreStore } from '@/stores/storeStore';
import type { Promotion, PromotionPayload, Project } from '@/types';

const emptyForm: PromotionPayload = {
  name: '',
  description: '',
  discountText: '',
  applicableProjectIds: [],
  startAt: '',
  endAt: '',
  status: 'draft',
};

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

  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [promotionResult, projectResult] = await Promise.all([
        getPromotionsPaginated({ page, pageSize, storeId: currentStoreId }),
        getProjects(),
      ]);
      const promotionItems = promotionResult.items ?? promotionResult.data ?? [];
      setItems(promotionItems);
      setTotal(promotionResult.total ?? promotionItems.length);
      setProjects(projectResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '优惠活动加载失败');
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, page, pageSize]);

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
      applicableProjectIds: item.applicableProjectIds,
      startAt: item.startAt ? item.startAt.slice(0, 10) : '',
      endAt: item.endAt ? item.endAt.slice(0, 10) : '',
      status: item.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('请填写活动名称');
      return;
    }
    if (!form.discountText.trim()) {
      toast.error('请填写优惠内容');
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
      };
      if (editing) {
        await updatePromotion(editing.id, payload);
        toast.success('优惠活动已更新');
      } else {
        await createPromotion(payload);
        toast.success('优惠活动已创建');
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

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">优惠活动</h1>
            <p className="mt-1 text-sm text-gray-500">管理终端可读取的门店优惠权益。</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新建活动
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新建优惠
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>活动名称</TableHead>
              <TableHead>门店</TableHead>
              <TableHead>优惠内容</TableHead>
              <TableHead>适用项目</TableHead>
              <TableHead>周期</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-gray-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  加载中
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-gray-500">暂无优惠活动</TableCell>
              </TableRow>
            ) : items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium text-gray-900">{item.name}</div>
                  {item.description && <div className="mt-1 text-xs text-gray-500">{item.description}</div>}
                </TableCell>
                <TableCell>{item.storeName || '全部门店'}</TableCell>
                <TableCell>{item.discountText}</TableCell>
                <TableCell>
                  {item.applicableProjectIds.length === 0
                    ? '全部项目'
                    : item.applicableProjectIds.map((id) => projectNameById.get(id) ?? `项目 ${id}`).join('、')}
                </TableCell>
                <TableCell>{formatDate(item.startAt)} 至 {formatDate(item.endAt)}</TableCell>
                <TableCell>
                  <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{statusLabel(item.status)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)} className="gap-1">
                      <Edit2 className="h-3.5 w-3.5" />
                      编辑
                    </Button>
                    {item.status === 'active' ? (
                      <Button variant="outline" size="sm" onClick={() => runAction(() => offlinePromotion(item.id), '活动已下线')} className="gap-1">
                        <PowerOff className="h-3.5 w-3.5" />
                        下线
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => runAction(() => publishPromotion(item.id), '活动已发布')} className="gap-1">
                        <Power className="h-3.5 w-3.5" />
                        发布
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => runAction(() => deletePromotion(item.id), '活动已删除')} className="gap-1 text-red-600">
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
        <DialogContent className="max-w-2xl" aria-describedby="promotion-dialog-desc">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑优惠活动' : '新建优惠活动'}</DialogTitle>
          </DialogHeader>
          <span id="promotion-dialog-desc" className="sr-only">配置终端可用的优惠活动</span>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">活动名称</label>
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">优惠内容</label>
              <Input value={form.discountText} onChange={(event) => setForm((prev) => ({ ...prev, discountText: event.target.value }))} placeholder="如：满 399 减 80" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">活动说明</label>
              <textarea
                value={form.description ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
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
