import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  Copy,
  Edit,
  Eye,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  cloneMarketingRuleTemplate,
  disableMarketingRuleTemplate,
  enableMarketingRuleTemplate,
  getMarketingRuleTemplateById,
  getMarketingRuleTemplatesPaginated,
  previewMarketingRuleTemplateAudience,
  updateMarketingRuleTemplate,
} from '@/api/marketing';
import type {
  AudiencePreview,
  MarketingAction,
  MarketingParamValue,
  MarketingRuleTemplate,
  MarketingRuleTemplateCategory,
  MarketingRuleFrequencyCap,
  MarketingRuleTemplateInput,
  MarketingRuleTemplateSource,
  MarketingRuleTemplateStatus,
  MarketingSchedule,
  MarketingTriggerParamSchema,
} from '@/types';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet';

const SOURCE_LABELS: Record<string, string> = {
  system: '系统推荐',
  store: '我的规则',
};

const CATEGORY_LABELS: Record<MarketingRuleTemplateCategory, string> = {
  time: '时间触发',
  behavior: '行为触发',
  attribute: '属性触发',
};

const STATUS_LABELS: Record<MarketingRuleTemplateStatus, string> = {
  recommended: '推荐启用',
  enabled: '已启用',
  disabled: '停用',
  draft: '草稿',
  archived: '已归档',
};

const SCENARIOS = ['到期提醒', '流失召回', '转化召回', '会员经营', '个性化推荐', '裂变营销', '活动营销'];
const PRIORITY_FILTER_OPTIONS = [
  ['all', '全部'],
  ['urgent', '紧急'],
  ['recommended', '推荐'],
  ['opportunity', '机会'],
] as const;
const PRIORITY_FORM_OPTIONS = [
  ['P0', '紧急'],
  ['P1', '推荐'],
  ['P2', '机会'],
  ['P3', '机会'],
] as const;
const CHANNEL_LABELS: Record<string, string> = {
  sms: '短信',
  miniapp: '小程序',
  wechat: '微信',
  group: '社群',
  store: '门店话术',
  moments: '朋友圈',
};

interface RuleFormState {
  name: string;
  description: string;
  scenario: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: MarketingRuleTemplateStatus;
  defaultParams: Record<string, MarketingParamValue>;
  recommendedActions: MarketingAction[];
  scheduleDefault: MarketingSchedule;
  frequencyCap: MarketingRuleFrequencyCap;
}

const getRuleFormState = (template: MarketingRuleTemplate): RuleFormState => ({
  name: template.name,
  description: template.description ?? '',
  scenario: template.scenario,
  priority: template.priority,
  status: template.status,
  defaultParams: { ...template.defaultParams },
  recommendedActions: template.recommendedActions?.length
    ? template.recommendedActions.map((action) => ({ ...action }))
    : [{ type: 'push', value: template.name, channel: 'miniapp' }],
  scheduleDefault: template.scheduleDefault ?? { type: 'daily', time: '09:00' },
  frequencyCap: template.frequencyCap ?? { sameCustomerDays: 7, sameChannelDays: 1, maxTouchesPerDay: 1 },
});

function stringifyParamValue(value: MarketingParamValue | undefined) {
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value == null ? '' : String(value);
}

function parseParamValue(field: MarketingTriggerParamSchema, value: string): MarketingParamValue {
  if (field.type === 'number') return Number(value || 0);
  if (field.type === 'boolean') return value === 'true';
  if (field.type === 'multi_select') return value ? value.split(',').filter(Boolean) : [];
  return value;
}

function formatParams(params: Record<string, MarketingParamValue>) {
  const entries = Object.entries(params);
  if (!entries.length) return '暂无参数';
  return entries
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('、') : String(value)}`)
    .join('；');
}

function formatActions(actions: MarketingAction[]) {
  if (!actions?.length) return '暂无动作';
  return actions.map((action) => `${CHANNEL_LABELS[action.channel ?? ''] ?? action.channel ?? '默认'}：${action.value}`).join('；');
}

function formatRulePriority(priority?: string) {
  if (priority === 'P0') return '紧急';
  if (priority === 'P1') return '推荐';
  if (priority === 'P2' || priority === 'P3') return '机会';
  return priority || '-';
}

function priorityClass(priority?: string) {
  if (priority === 'P0') return 'border-red-200 bg-red-50 text-red-700';
  if (priority === 'P1') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function formatSchedule(schedule?: MarketingSchedule) {
  if (!schedule) return '每日 09:00';
  const typeLabels: Record<MarketingSchedule['type'], string> = {
    daily: '每日',
    weekly: '每周',
    monthly: '每月',
    date_range: '日期范围',
    realtime: '实时触发',
  };
  if (schedule.type === 'realtime') return '实时触发';
  return `${typeLabels[schedule.type] ?? schedule.type} ${schedule.time ?? '09:00'}`;
}

function formatFrequencyCap(frequencyCap?: MarketingRuleFrequencyCap) {
  return `同客户 ${frequencyCap?.sameCustomerDays ?? 7} 天，同渠道 ${frequencyCap?.sameChannelDays ?? 1} 天，单日 ${frequencyCap?.maxTouchesPerDay ?? 1} 次`;
}

function statusClass(status: MarketingRuleTemplateStatus) {
  if (status === 'enabled') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'recommended') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'disabled') return 'border-gray-200 bg-gray-50 text-gray-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function MarketingRuleLibrary({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [rules, setRules] = useState<MarketingRuleTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState<'all' | MarketingRuleTemplateSource>('all');
  const [category, setCategory] = useState<'all' | MarketingRuleTemplateCategory>('all');
  const [scenario, setScenario] = useState('all');
  const [priority, setPriority] = useState<(typeof PRIORITY_FILTER_OPTIONS)[number][0]>('all');
  const [status, setStatus] = useState<'all' | MarketingRuleTemplateStatus>('all');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MarketingRuleTemplate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editing, setEditing] = useState<MarketingRuleTemplate | null>(null);
  const [form, setForm] = useState<RuleFormState | null>(null);
  const [enableTarget, setEnableTarget] = useState<MarketingRuleTemplate | null>(null);
  const [enablePreview, setEnablePreview] = useState<AudiencePreview | null>(null);
  const [enablePreviewLoading, setEnablePreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [operatingId, setOperatingId] = useState<number | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getMarketingRuleTemplatesPaginated({
        page,
        pageSize,
        keyword: keyword || undefined,
        source,
        category,
        scenario,
        priority,
        status,
      });
      setRules(response.items ?? response.data ?? []);
      setTotal(response.total ?? 0);
    } catch {
      toast.error('规则库加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [category, keyword, page, pageSize, priority, scenario, source, status]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const resetAndReload = () => {
    setPage(1);
    void loadRules();
  };

  const openDetail = async (rule: MarketingRuleTemplate) => {
    setSelected(rule);
    setPreview(null);
    setDetailOpen(true);
    try {
      const detail = await getMarketingRuleTemplateById(rule.id);
      setSelected(detail);
    } catch {
      setSelected(rule);
    }
  };

  const loadPreview = async (rule: MarketingRuleTemplate) => {
    setPreviewLoading(true);
    try {
      const result = await previewMarketingRuleTemplateAudience(rule.id);
      setPreview(result);
    } catch {
      toast.error('受众预估失败，请确认规则依赖数据是否完整');
    } finally {
      setPreviewLoading(false);
    }
  };

  const cloneRule = async (rule: MarketingRuleTemplate) => {
    setOperatingId(rule.id);
    try {
      const cloned = await cloneMarketingRuleTemplate(rule.id);
      toast.success('已复制为我的规则，可继续调整参数');
      setEditing(cloned);
      setForm(getRuleFormState(cloned));
      setSelected(cloned);
      await loadRules();
    } catch {
      toast.error('复制规则失败');
    } finally {
      setOperatingId(null);
    }
  };

  const startEdit = (rule: MarketingRuleTemplate) => {
    if (rule.source === 'system') {
      toast.info('系统默认规则需先复制为我的规则后再编辑');
      void cloneRule(rule);
      return;
    }
    setEditing(rule);
    setForm(getRuleFormState(rule));
  };

  const saveRule = async () => {
    if (!editing || !form) return;
    setSaving(true);
    try {
      const data: MarketingRuleTemplateInput = {
        name: form.name,
        description: form.description,
        scenario: form.scenario,
        priority: form.priority,
        status: form.status,
        defaultParams: form.defaultParams,
        recommendedActions: form.recommendedActions,
        scheduleDefault: form.scheduleDefault,
        frequencyCap: form.frequencyCap,
      };
      const updated = await updateMarketingRuleTemplate(editing.id, data);
      toast.success('规则已保存');
      setEditing(null);
      setForm(null);
      setSelected(updated);
      await loadRules();
    } catch {
      toast.error('保存失败，系统规则请先复制后编辑');
    } finally {
      setSaving(false);
    }
  };

  const enableRule = async (rule: MarketingRuleTemplate) => {
    setOperatingId(rule.id);
    try {
      const result = await enableMarketingRuleTemplate(rule.id);
      toast.success(`规则已启用，已生成自动触达「${result.strategy.name}」`, {
        action: {
          label: '查看自动触达',
          onClick: () => navigate('/customer-marketing/automation'),
        },
      });
      setPreview(result.preview);
      await loadRules();
    } catch {
      toast.error('启用规则失败');
    } finally {
      setOperatingId(null);
    }
  };

  const openEnableConfirm = async (rule: MarketingRuleTemplate) => {
    setEnableTarget(rule);
    setEnablePreview(null);
    setEnablePreviewLoading(true);
    try {
      const result = await previewMarketingRuleTemplateAudience(rule.id);
      setEnablePreview(result);
    } catch {
      setEnablePreview(null);
    } finally {
      setEnablePreviewLoading(false);
    }
  };

  const confirmEnableRule = async () => {
    if (!enableTarget) return;
    await enableRule(enableTarget);
    setEnableTarget(null);
    setEnablePreview(null);
  };

  const disableRule = async (rule: MarketingRuleTemplate) => {
    setOperatingId(rule.id);
    try {
      await disableMarketingRuleTemplate(rule.id);
      toast.success('规则已停用，关联启用触达已暂停');
      await loadRules();
    } catch {
      toast.error('停用规则失败');
    } finally {
      setOperatingId(null);
    }
  };

  const metrics = useMemo(() => {
    const recommended = rules.filter((rule) => rule.status === 'recommended').length;
    const mine = rules.filter((rule) => rule.source === 'store').length;
    const active = rules.filter((rule) => rule.status === 'enabled').length;
    return { recommended, mine, active };
  }, [rules]);

  return (
    <div className={embedded ? 'space-y-5' : 'flex h-full flex-col gap-5 overflow-auto bg-background p-6'}>
      {!embedded && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">自动触达规则模板</h1>
              <p className="mt-1 text-sm text-gray-500">沉淀系统推荐规则和门店自定义规则，支持预估、复制、调整和一键启用。</p>
            </div>
            <Button onClick={() => void loadRules()} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="text-sm text-blue-700">推荐启用</div>
              <div className="mt-1 text-2xl font-semibold text-blue-900">{metrics.recommended}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="text-sm text-emerald-700">已启用</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{metrics.active}</div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
              <div className="text-sm text-amber-700">我的规则</div>
              <div className="mt-1 text-2xl font-semibold text-amber-900">{metrics.mine}</div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-800">
          <SlidersHorizontal className="h-4 w-4 text-blue-600" />
          筛选规则模板
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-xs text-gray-500">
            搜索
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="pl-9" placeholder="名称/场景/编码" />
            </div>
          </label>
          <SelectBox label="来源" value={source} onChange={(value) => setSource(value as typeof source)} options={[
            ['all', '全部'],
            ['system', '系统推荐'],
            ['store', '我的规则'],
          ]} />
          <SelectBox label="分类" value={category} onChange={(value) => setCategory(value as typeof category)} options={[
            ['all', '全部'],
            ['time', '时间触发'],
            ['behavior', '行为触发'],
            ['attribute', '属性触发'],
          ]} />
          <SelectBox label="场景" value={scenario} onChange={setScenario} options={[['all', '全部'], ...SCENARIOS.map((item) => [item, item] as [string, string])]} />
          <SelectBox label="优先级" value={priority} onChange={(value) => setPriority(value as typeof priority)} options={PRIORITY_FILTER_OPTIONS.map(([value, label]) => [value, label])} />
          <SelectBox label="状态" value={status} onChange={(value) => setStatus(value as typeof status)} options={[
            ['all', '全部'],
            ['recommended', '推荐启用'],
            ['enabled', '已启用'],
            ['disabled', '停用'],
            ['draft', '草稿'],
          ]} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={resetAndReload} className="gap-2">
            <Search className="h-4 w-4" />
            查询
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>规则名称</TableHead>
            <TableHead>来源</TableHead>
            <TableHead>分类</TableHead>
            <TableHead>场景</TableHead>
            <TableHead>优先级</TableHead>
            <TableHead>渠道</TableHead>
            <TableHead>效果</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={9} className="h-40 text-center text-gray-500">
                <Loader2 className="mr-2 inline h-5 w-5 animate-spin text-blue-500" />
                正在加载规则库...
              </TableCell>
            </TableRow>
          ) : rules.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-40 text-center text-gray-500">暂无规则，请调整筛选条件</TableCell>
            </TableRow>
          ) : (
            rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <div className="font-medium text-gray-900">{rule.name}</div>
                  <div className="mt-1 max-w-[320px] truncate text-xs text-gray-500">{rule.description}</div>
                </TableCell>
                <TableCell>{SOURCE_LABELS[rule.source] ?? rule.source}</TableCell>
                <TableCell>{rule.categoryLabel ?? CATEGORY_LABELS[rule.category]}</TableCell>
                <TableCell>{rule.scenario}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${priorityClass(rule.priority)}`}>
                    {formatRulePriority(rule.priority)}
                  </span>
                </TableCell>
                <TableCell className="max-w-[180px] truncate">{formatActions(rule.recommendedActions)}</TableCell>
                <TableCell>
                  <div className="text-xs text-gray-600">触达 {rule.effect?.strategyCount ?? 0}</div>
                  <div className="text-xs text-gray-600">触达 {rule.effect?.reachedCount ?? 0}</div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClass(rule.status)}`}>
                    {STATUS_LABELS[rule.status] ?? rule.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="查看" onClick={() => void openDetail(rule)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="复制" onClick={() => void cloneRule(rule)} disabled={operatingId === rule.id}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="编辑" onClick={() => startEdit(rule)} disabled={operatingId === rule.id}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="启用" onClick={() => void openEnableConfirm(rule)} disabled={operatingId === rule.id}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="停用" onClick={() => void disableRule(rule)} disabled={operatingId === rule.id}>
                      <PauseCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2">
          <select className="rounded border border-gray-200 bg-white px-2 py-1" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[720px]">
          {selected && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{selected.description}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <DetailSection title="规则概览">
                  <InfoGrid items={[
                    ['来源', SOURCE_LABELS[selected.source] ?? selected.source],
                    ['分类', selected.categoryLabel ?? CATEGORY_LABELS[selected.category]],
                    ['场景', selected.scenario],
                    ['优先级', formatRulePriority(selected.priority)],
                    ['状态', STATUS_LABELS[selected.status] ?? selected.status],
                    ['版本', selected.version],
                  ]} />
                </DetailSection>
                <DetailSection title="触发参数">
                  <p className="text-sm text-gray-700">{formatParams(selected.defaultParams)}</p>
                </DetailSection>
                <DetailSection title="推荐动作">
                  <p className="text-sm text-gray-700">{formatActions(selected.recommendedActions)}</p>
                </DetailSection>
                <DetailSection title="数据依赖">
                  <div className="flex flex-wrap gap-2">
                    {selected.dataDependencies.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
                  </div>
                </DetailSection>
                <DetailSection title="频控建议">
                  <InfoGrid items={[
                    ['同客户间隔', `${selected.frequencyCap?.sameCustomerDays ?? 7} 天`],
                    ['同渠道间隔', `${selected.frequencyCap?.sameChannelDays ?? 1} 天`],
                    ['单日上限', `${selected.frequencyCap?.maxTouchesPerDay ?? 1} 次`],
                  ]} />
                </DetailSection>
                <DetailSection title="效果摘要">
                  <InfoGrid items={[
                    ['关联触达', `${selected.effect?.strategyCount ?? 0}`],
                    ['启用触达', `${selected.effect?.activeStrategyCount ?? 0}`],
                    ['触达人数', `${selected.effect?.reachedCount ?? 0}`],
                    ['转化人数', `${selected.effect?.convertedCount ?? 0}`],
                    ['收入', `¥${Number(selected.effect?.revenue ?? 0).toLocaleString()}`],
                    ['ROI', selected.effect?.roi ?? '0'],
                  ]} />
                </DetailSection>
                <DetailSection title="受众预估">
                  <div className="mb-3 flex gap-2">
                    <Button variant="outline" onClick={() => void loadPreview(selected)} disabled={previewLoading} className="gap-2">
                      {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      预估命中客户
                    </Button>
                    <Button onClick={() => void openEnableConfirm(selected)} disabled={operatingId === selected.id} className="gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      一键启用
                    </Button>
                    <Button variant="outline" onClick={() => startEdit(selected)} className="gap-2">
                      <Edit className="h-4 w-4" />
                      修改规则
                    </Button>
                  </div>
                  {preview ? (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                      <div className="font-medium">预计命中 {preview.total ?? preview.estimatedCount ?? 0} 位客户，预计转化 {preview.estimatedConvertedCount ?? 0} 位，预计收入 ¥{Number(preview.estimatedRevenue ?? 0).toLocaleString()}</div>
                      <div className="mt-2 space-y-1">
                        {preview.samples?.slice(0, 5).map((item) => (
                          <div key={item.id} className="text-xs text-blue-800">{item.name}：{item.reason}</div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">点击预估后展示命中客户数、样本客户和命中原因。</p>
                  )}
                </DetailSection>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(editing && form)} onOpenChange={(open) => { if (!open) { setEditing(null); setForm(null); } }}>
        <DialogContent className="sm:max-w-[760px]">
          {editing && form && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.source === 'system' ? '复制并编辑规则' : '编辑我的规则'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm text-gray-600">规则名称
                  <Input className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <SelectBox label="业务场景" value={form.scenario} onChange={(value) => setForm({ ...form, scenario: value })} options={SCENARIOS.map((item) => [item, item])} />
                <SelectBox label="优先级" value={form.priority} onChange={(value) => setForm({ ...form, priority: value as RuleFormState['priority'] })} options={PRIORITY_FORM_OPTIONS.map(([value, label]) => [value, label])} />
                <SelectBox label="状态" value={form.status} onChange={(value) => setForm({ ...form, status: value as MarketingRuleTemplateStatus })} options={[
                  ['draft', '草稿'],
                  ['recommended', '推荐启用'],
                  ['enabled', '已启用'],
                  ['disabled', '停用'],
                ]} />
                <label className="text-sm text-gray-600 md:col-span-2">规则说明
                  <textarea className="mt-1 min-h-20 w-full rounded-md border border-gray-200 px-3 py-2 text-sm" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                </label>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <div className="mb-3 text-sm font-medium text-gray-800">触发参数</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {editing.paramSchema.map((field) => (
                    <ParamEditor
                      key={field.key}
                      field={field}
                      value={form.defaultParams[field.key]}
                      onChange={(value) => setForm({ ...form, defaultParams: { ...form.defaultParams, [field.key]: value } })}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <div className="mb-3 text-sm font-medium text-gray-800">推荐动作</div>
                <div className="space-y-2">
                  {form.recommendedActions.map((action, index) => (
                    <div key={`${action.channel}-${index}`} className="grid gap-2 md:grid-cols-[140px_1fr]">
                      <select
                        className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                        value={action.channel ?? 'miniapp'}
                        onChange={(event) => {
                          const next = [...form.recommendedActions];
                          next[index] = { ...action, channel: event.target.value as MarketingAction['channel'] };
                          setForm({ ...form, recommendedActions: next });
                        }}
                      >
                        {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <Input
                        value={action.value}
                        onChange={(event) => {
                          const next = [...form.recommendedActions];
                          next[index] = { ...action, value: event.target.value };
                          setForm({ ...form, recommendedActions: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-gray-100 p-3">
                  <div className="mb-3 text-sm font-medium text-gray-800">执行计划</div>
                  <div className="grid gap-3">
                    <SelectBox
                      label="执行方式"
                      value={form.scheduleDefault.type}
                      onChange={(value) => {
                        const type = value as MarketingSchedule['type'];
                        setForm({
                          ...form,
                          scheduleDefault: {
                            ...form.scheduleDefault,
                            type,
                            time: type === 'realtime' ? undefined : form.scheduleDefault.time ?? '09:00',
                          },
                        });
                      }}
                      options={[
                        ['daily', '每日'],
                        ['weekly', '每周'],
                        ['monthly', '每月'],
                        ['realtime', '实时触发'],
                      ]}
                    />
                    {form.scheduleDefault.type !== 'realtime' && (
                      <label className="text-sm text-gray-600">
                        触达时间
                        <Input
                          className="mt-1"
                          type="time"
                          value={form.scheduleDefault.time ?? '09:00'}
                          onChange={(event) => setForm({ ...form, scheduleDefault: { ...form.scheduleDefault, time: event.target.value } })}
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-100 p-3">
                  <div className="mb-3 text-sm font-medium text-gray-800">频控建议</div>
                  <div className="grid gap-3">
                    <NumberInput
                      label="同客户间隔（天）"
                      value={form.frequencyCap.sameCustomerDays ?? 7}
                      min={0}
                      onChange={(value) => setForm({ ...form, frequencyCap: { ...form.frequencyCap, sameCustomerDays: value } })}
                    />
                    <NumberInput
                      label="同渠道间隔（天）"
                      value={form.frequencyCap.sameChannelDays ?? 1}
                      min={0}
                      onChange={(value) => setForm({ ...form, frequencyCap: { ...form.frequencyCap, sameChannelDays: value } })}
                    />
                    <NumberInput
                      label="单日触达上限（次）"
                      value={form.frequencyCap.maxTouchesPerDay ?? 1}
                      min={1}
                      onChange={(value) => setForm({ ...form, frequencyCap: { ...form.frequencyCap, maxTouchesPerDay: value } })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditing(null); setForm(null); }}>取消</Button>
                <Button onClick={() => void saveRule()} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  保存规则
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(enableTarget)} onOpenChange={(open) => { if (!open) { setEnableTarget(null); setEnablePreview(null); } }}>
        <DialogContent className="sm:max-w-[680px]">
          {enableTarget && (
            <>
              <DialogHeader>
                <DialogTitle>确认启用规则</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="font-medium text-blue-950">{enableTarget.name}</div>
                  <div className="mt-1 text-sm text-blue-800">{enableTarget.description}</div>
                </div>
                <InfoGrid items={[
                  ['触发条件', formatParams(enableTarget.defaultParams)],
                  ['推荐动作', formatActions(enableTarget.recommendedActions)],
                  ['执行计划', formatSchedule(enableTarget.scheduleDefault)],
                  ['频控建议', formatFrequencyCap(enableTarget.frequencyCap)],
                  ['预计命中', enablePreviewLoading ? '预估中...' : `${enablePreview?.total ?? enablePreview?.estimatedCount ?? 0} 位客户`],
                  ['预计收入', enablePreviewLoading ? '预估中...' : `¥${Number(enablePreview?.estimatedRevenue ?? 0).toLocaleString()}`],
                ]} />
                <p className="text-sm text-gray-500">
                  启用后系统会生成一条自动触达，并记录来源规则，后续执行效果会回流到规则模板。
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEnableTarget(null); setEnablePreview(null); }}>取消</Button>
                <Button onClick={() => void confirmEnableRule()} disabled={operatingId === enableTarget.id} className="gap-2">
                  {operatingId === enableTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  直接启用
                </Button>
                <Button variant="outline" onClick={() => { startEdit(enableTarget); setEnableTarget(null); setEnablePreview(null); }}>
                  修改后启用
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="text-xs text-gray-500">
      {label}
      <select className="mt-1 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-100 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md bg-gray-50 px-3 py-2">
          <div className="text-xs text-gray-500">{label}</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
        </div>
      ))}
    </div>
  );
}

function NumberInput({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm text-gray-600">
      {label}
      <Input
        className="mt-1"
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
      />
    </label>
  );
}

function ParamEditor({
  field,
  value,
  onChange,
}: {
  field: MarketingTriggerParamSchema;
  value: MarketingParamValue | undefined;
  onChange: (value: MarketingParamValue) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="text-sm text-gray-600">
        {field.label}
        <select className="mt-1 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm" value={stringifyParamValue(value)} onChange={(event) => onChange(parseParamValue(field, event.target.value))}>
          <option value="true">是</option>
          <option value="false">否</option>
        </select>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="text-sm text-gray-600">
        {field.label}
        <select className="mt-1 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm" value={stringifyParamValue(value)} onChange={(event) => onChange(parseParamValue(field, event.target.value))}>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }

  if (field.type === 'multi_select') {
    return (
      <label className="text-sm text-gray-600">
        {field.label}
        <select
          multiple
          className="mt-1 min-h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}
        >
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }

  return (
    <label className="text-sm text-gray-600">
      {field.label}
      <Input
        className="mt-1"
        type={field.type === 'number' ? 'number' : 'text'}
        min={field.min}
        max={field.max}
        value={stringifyParamValue(value)}
        onChange={(event) => onChange(parseParamValue(field, event.target.value))}
      />
    </label>
  );
}
