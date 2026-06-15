import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, EyeOff, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAmiGlowDisplayConfig,
  deleteAmiGlowDisplayConfig,
  getAmiGlowDisplayConfigs,
  updateAmiGlowDisplayConfig,
} from '@/api/customerApp';
import { getCards } from '@/api/card';
import { getMarketingPagesPaginated } from '@/api/marketingPage';
import { getProducts } from '@/api/product';
import { getProjects } from '@/api/project';
import { getPromotionsPaginated } from '@/api/promotion';
import { usePagination } from '@/hooks/usePagination';
import { useStoreStore } from '@/stores/storeStore';
import type {
  AmiGlowDisplayConfig,
  AmiGlowDisplayConfigPayload,
  AmiGlowObjectType,
  AmiGlowPublishStatus,
  Card,
  MarketingPage,
  Product,
  Project,
  Promotion,
} from '@/types';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { CustomerAppEventTable } from '../components/CustomerAppEventTable';

const OBJECT_TYPE_OPTIONS: Array<{ value: AmiGlowObjectType | 'all'; label: string }> = [
  { value: 'all', label: '全部对象' },
  { value: 'project', label: '项目' },
  { value: 'product', label: '商品' },
  { value: 'card', label: '卡项' },
  { value: 'promotion', label: '优惠活动' },
  { value: 'marketing_page', label: '营销页面' },
];

const EDIT_OBJECT_TYPE_OPTIONS = OBJECT_TYPE_OPTIONS.filter(
  (item): item is { value: AmiGlowObjectType; label: string } => item.value !== 'all',
);

const STATUS_OPTIONS: Array<{ value: AmiGlowPublishStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'offline', label: '已下线' },
];

const CTA_OPTIONS = [
  { value: '', label: '不设置' },
  { value: 'book', label: '立即预约' },
  { value: 'consult', label: '咨询顾问' },
  { value: 'claim_coupon', label: '领取权益' },
  { value: 'buy', label: '立即购买' },
  { value: 'view_detail', label: '查看详情' },
];

type FormState = {
  storeId: string;
  objectType: AmiGlowObjectType;
  objectId: string;
  showInAmiGlow: boolean;
  sortOrder: string;
  tagsText: string;
  bannerImage: string;
  summary: string;
  ctaType: string;
  publishStatus: AmiGlowPublishStatus;
  startAt: string;
  endAt: string;
};

type TargetOption = {
  id: number;
  name: string;
  meta?: string;
  status?: string;
};

function formatDate(value?: string | null) {
  if (!value) return '不限';
  return String(value).slice(0, 10);
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function normalizeDateInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function objectTypeLabel(value: string) {
  return OBJECT_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function publishStatusLabel(value: string) {
  return STATUS_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function badgeVariantForStatus(status: AmiGlowPublishStatus) {
  if (status === 'published') return 'default';
  if (status === 'offline') return 'secondary';
  return 'outline';
}

function optionFromCurrentItem(item: AmiGlowDisplayConfig | null): TargetOption | null {
  if (!item?.object) return null;
  return {
    id: item.objectId,
    name: item.object.name,
    meta: item.object.description ?? item.object.slug ?? undefined,
    status: item.object.status,
  };
}

export function AmiGlowManagement({
  embedded = false,
  section = 'all',
}: {
  embedded?: boolean;
  section?: 'all' | 'configs' | 'events';
}) {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const stores = useStoreStore((state) => state.stores);
  const loadStores = useStoreStore((state) => state.loadStores);
  const [activeTab, setActiveTab] = useState<'configs' | 'events'>(section === 'events' ? 'events' : 'configs');
  const [keyword, setKeyword] = useState('');
  const [objectType, setObjectType] = useState<AmiGlowObjectType | 'all'>('all');
  const [publishStatus, setPublishStatus] = useState<AmiGlowPublishStatus | 'all'>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AmiGlowDisplayConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetOptions, setTargetOptions] = useState<TargetOption[]>([]);
  const [form, setForm] = useState<FormState>(() => ({
    storeId: '',
    objectType: 'project',
    objectId: '',
    showInAmiGlow: true,
    sortOrder: '0',
    tagsText: '',
    bannerImage: '',
    summary: '',
    ctaType: 'book',
    publishStatus: 'published',
    startAt: '',
    endAt: '',
  }));

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const defaultStoreId = currentStoreId ?? stores[0]?.id ?? null;

  const configFilters = useMemo(
    () => ({
      storeId: currentStoreId,
      objectType,
      publishStatus,
      keyword: keyword.trim() || undefined,
    }),
    [currentStoreId, keyword, objectType, publishStatus],
  );

  const {
    data: configs,
    total,
    page,
    pageSize,
    loading,
    setPage,
    setPageSize,
    refresh,
  } = usePagination(getAmiGlowDisplayConfigs, configFilters);

  const loadTargetOptions = useCallback(async (nextObjectType: AmiGlowObjectType) => {
    setTargetLoading(true);
    try {
      let options: TargetOption[] = [];
      if (nextObjectType === 'project') {
        const items = await getProjects();
        options = items.map((item: Project) => ({
          id: item.id,
          name: item.name,
          meta: `${item.type || '护理项目'} / ¥${Number(item.price || 0).toLocaleString('zh-CN')}`,
          status: item.status ? 'active' : 'inactive',
        }));
      } else if (nextObjectType === 'product') {
        const items = await getProducts();
        options = items.map((item: Product) => ({
          id: item.id,
          name: item.name,
          meta: `${item.categoryName || '商品'} / ¥${Number(item.salePrice ?? item.retailPrice ?? 0).toLocaleString('zh-CN')}`,
          status: item.status,
        }));
      } else if (nextObjectType === 'card') {
        const items = await getCards();
        options = items.map((item: Card) => ({
          id: item.id,
          name: item.name,
          meta: `${item.totalTimes} 次 / ¥${Number(item.price || 0).toLocaleString('zh-CN')}`,
          status: item.status,
        }));
      } else if (nextObjectType === 'promotion') {
        const result = await getPromotionsPaginated({ page: 1, pageSize: 100, storeId: currentStoreId });
        options = result.items.map((item: Promotion) => ({
          id: item.id,
          name: item.name,
          meta: item.discountText,
          status: item.status,
        }));
      } else if (nextObjectType === 'marketing_page') {
        const result = await getMarketingPagesPaginated({
          page: 1,
          pageSize: 100,
          status: 'published',
          sourceType: 'all',
          storeId: currentStoreId ?? undefined,
        });
        options = result.items.map((item: MarketingPage) => ({
          id: item.id,
          name: item.title,
          meta: item.slug,
          status: item.status,
        }));
      }
      setTargetOptions(options);
    } catch (error) {
      setTargetOptions([]);
      toast.error(error instanceof Error ? error.message : '候选对象加载失败');
    } finally {
      setTargetLoading(false);
    }
  }, [currentStoreId]);

  useEffect(() => {
    if (!open) return;
    void loadTargetOptions(form.objectType);
  }, [form.objectType, loadTargetOptions, open]);

  const openCreate = () => {
    const nextObjectType = objectType === 'all' ? 'project' : objectType;
    setEditing(null);
    setForm({
      storeId: defaultStoreId ? String(defaultStoreId) : '',
      objectType: nextObjectType,
      objectId: '',
      showInAmiGlow: true,
      sortOrder: '0',
      tagsText: '推荐',
      bannerImage: '',
      summary: '',
      ctaType: nextObjectType === 'marketing_page' ? 'view_detail' : 'book',
      publishStatus: 'published',
      startAt: '',
      endAt: '',
    });
    setOpen(true);
  };

  const openEdit = (item: AmiGlowDisplayConfig) => {
    setEditing(item);
    setForm({
      storeId: String(item.storeId),
      objectType: item.objectType,
      objectId: String(item.objectId),
      showInAmiGlow: item.showInAmiGlow,
      sortOrder: String(item.sortOrder ?? 0),
      tagsText: item.tags.join('，'),
      bannerImage: item.bannerImage ?? '',
      summary: item.summary ?? '',
      ctaType: item.ctaType ?? '',
      publishStatus: item.publishStatus,
      startAt: toDateTimeLocal(item.startAt),
      endAt: toDateTimeLocal(item.endAt),
    });
    setOpen(true);
  };

  const saveConfig = async () => {
    if (!form.storeId) {
      toast.error('请选择门店');
      return;
    }
    if (!form.objectId) {
      toast.error('请选择展示对象');
      return;
    }
    const payload: AmiGlowDisplayConfigPayload = {
      storeId: Number(form.storeId),
      objectType: form.objectType,
      objectId: Number(form.objectId),
      showInAmiGlow: form.showInAmiGlow,
      sortOrder: Number(form.sortOrder || 0),
      tags: form.tagsText.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean),
      bannerImage: form.bannerImage.trim() || null,
      summary: form.summary.trim() || null,
      ctaType: form.ctaType || null,
      publishStatus: form.publishStatus,
      startAt: normalizeDateInput(form.startAt),
      endAt: normalizeDateInput(form.endAt),
    };

    setSaving(true);
    try {
      if (editing) {
        await updateAmiGlowDisplayConfig(editing.id, payload);
        toast.success('Ami Glow 展示配置已更新');
      } else {
        await createAmiGlowDisplayConfig(payload);
        toast.success('Ami Glow 展示配置已创建');
      }
      setOpen(false);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleConfigStatus = async (item: AmiGlowDisplayConfig) => {
    const nextStatus: AmiGlowPublishStatus = item.publishStatus === 'published' ? 'offline' : 'published';
    try {
      await updateAmiGlowDisplayConfig(item.id, {
        publishStatus: nextStatus,
        showInAmiGlow: nextStatus === 'published',
      });
      toast.success(nextStatus === 'published' ? '推荐位已发布' : '推荐位已下线');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '状态更新失败');
    }
  };

  const removeConfig = async (item: AmiGlowDisplayConfig) => {
    const ok = window.confirm(`确认删除「${item.object?.name ?? `#${item.objectId}`}」的 Ami Glow 展示配置？`);
    if (!ok) return;
    try {
      await deleteAmiGlowDisplayConfig(item.id);
      toast.success('展示配置已删除');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const selectedObjectFallback = optionFromCurrentItem(editing);
  const visibleTargetOptions =
    selectedObjectFallback && !targetOptions.some((item) => String(item.id) === form.objectId)
      ? [selectedObjectFallback, ...targetOptions]
      : targetOptions;

  if (section === 'events') {
    return (
      <CustomerAppEventTable
        mode="marketingAsset"
        defaultFilters={{ storeId: currentStoreId, source: 'ami_glow' }}
        exportFileName="营销行为事件"
      />
    );
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-gray-500">首页 / 智能营销 / Ami Glow</div>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">Ami Glow 小程序</h1>
            <p className="mt-1 text-sm text-gray-500">管理小程序首页展示内容，查看客户在小程序内的浏览、预约和测肤行为。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              新增推荐位
            </Button>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增推荐位
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'configs' | 'events')}>
        {section === 'all' && (
          <TabsList>
            <TabsTrigger value="configs">展示配置</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="configs" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="w-72 pl-9"
                placeholder="搜索摘要、标签、图片或 CTA"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              value={objectType}
              onChange={(event) => {
                setObjectType(event.target.value as AmiGlowObjectType | 'all');
                setPage(1);
              }}
            >
              {OBJECT_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              value={publishStatus}
              onChange={(event) => {
                setPublishStatus(event.target.value as AmiGlowPublishStatus | 'all');
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" />
                正在加载 Ami Glow 展示配置...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead>展示对象</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>门店</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>标签/CTA</TableHead>
                    <TableHead>展示周期</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex min-w-72 items-center gap-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                            {item.bannerImage || item.object?.image ? (
                              <img src={item.bannerImage || item.object?.image || ''} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Ami</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">{item.object?.name ?? `对象 #${item.objectId}`}</div>
                            <div className="mt-1 line-clamp-2 text-xs text-gray-500">{item.summary || item.object?.description || '未配置展示摘要'}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{objectTypeLabel(item.objectType)}</TableCell>
                      <TableCell>{item.storeName || `门店 #${item.storeId}`}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={badgeVariantForStatus(item.publishStatus)}>
                            {publishStatusLabel(item.publishStatus)}
                          </Badge>
                          <span className="text-xs text-gray-500">{item.showInAmiGlow ? '展示中' : '不展示'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-48 flex-wrap gap-1">
                          {item.tags.length ? item.tags.map((tag) => (
                            <span key={tag} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{tag}</span>
                          )) : <span className="text-xs text-gray-400">无标签</span>}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{CTA_OPTIONS.find((cta) => cta.value === item.ctaType)?.label ?? item.ctaType ?? '不设置'}</div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(item.startAt)} 至 {formatDate(item.endAt)}
                      </TableCell>
                      <TableCell>{item.sortOrder}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(item)}>
                            <Edit2 className="h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => toggleConfigStatus(item)}>
                            {item.publishStatus === 'published' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            {item.publishStatus === 'published' ? '下线' : '发布'}
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1 text-red-600" onClick={() => removeConfig(item)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {configs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-gray-400">
                        暂无 Ami Glow 展示配置。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <div className="text-sm text-gray-600">共 {total} 条</div>
              <div className="flex items-center gap-2">
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded border border-gray-300 px-2 text-sm">
                  <option value={10}>10条/页</option>
                  <option value={20}>20条/页</option>
                  <option value={50}>50条/页</option>
                </select>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                <span className="text-sm text-gray-600">{page} / {Math.ceil(total / pageSize) || 1}</span>
                <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>下一页</Button>
              </div>
            </div>
          </div>
        </TabsContent>

      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" aria-describedby="ami-glow-config-dialog-desc">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑 Ami Glow 推荐位' : '新增 Ami Glow 推荐位'}</DialogTitle>
            <DialogDescription id="ami-glow-config-dialog-desc">
              配置会影响小程序首页推荐项目、活动、商品、卡项和营销页面的展示顺序。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">门店</span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={form.storeId}
                  onChange={(event) => setForm((prev) => ({ ...prev, storeId: event.target.value }))}
                >
                  <option value="">请选择门店</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">对象类型</span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={form.objectType}
                  onChange={(event) => setForm((prev) => ({ ...prev, objectType: event.target.value as AmiGlowObjectType, objectId: '' }))}
                >
                  {EDIT_OBJECT_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">展示对象</span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={form.objectId}
                  disabled={targetLoading}
                  onChange={(event) => setForm((prev) => ({ ...prev, objectId: event.target.value }))}
                >
                  <option value="">{targetLoading ? '加载中...' : '请选择对象'}</option>
                  {visibleTargetOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.meta ? ` / ${item.meta}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">发布状态</span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={form.publishStatus}
                  onChange={(event) => setForm((prev) => ({ ...prev, publishStatus: event.target.value as AmiGlowPublishStatus }))}
                >
                  {STATUS_OPTIONS.filter((item) => item.value !== 'all').map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">排序</span>
                <Input type="number" value={form.sortOrder} onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.showInAmiGlow}
                  onChange={(event) => setForm((prev) => ({ ...prev, showInAmiGlow: event.target.checked }))}
                />
                <span>在小程序展示</span>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">标签</span>
                <Input value={form.tagsText} placeholder="如：热门，补水，会员专享" onChange={(event) => setForm((prev) => ({ ...prev, tagsText: event.target.value }))} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">CTA</span>
                <select
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  value={form.ctaType}
                  onChange={(event) => setForm((prev) => ({ ...prev, ctaType: event.target.value }))}
                >
                  {CTA_OPTIONS.map((item) => (
                    <option key={item.value || 'none'} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">展示摘要</span>
              <textarea
                className="min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                value={form.summary}
                onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">展示图片 URL</span>
              <Input value={form.bannerImage} onChange={(event) => setForm((prev) => ({ ...prev, bannerImage: event.target.value }))} />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">开始展示</span>
                <Input type="datetime-local" value={form.startAt} onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700">结束展示</span>
                <Input type="datetime-local" value={form.endAt} onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))} />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button type="button" onClick={saveConfig} disabled={saving || targetLoading}>
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
