import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {
  Copy,
  Edit,
  Eye,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Users,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router';
import {
  createAutomationStrategy,
  deleteAutomationStrategy,
  enableAutomationStrategy,
  executeAutomationStrategy,
  getAutomationEffects,
  getAutomationExecutionsPaginated,
  getAutomationStrategiesPaginated,
  getAutomationTriggerOptions,
  pauseAutomationStrategy,
  previewAutomationAudience,
  saveAutomationStrategyDraft,
  updateAutomationStrategy,
} from '@/api/marketing';
import type {
  AudiencePreview,
  MarketingAction,
  MarketingAutomationEffect,
  MarketingAutomationExecution,
  MarketingAutomationStrategy,
  MarketingParamValue,
  MarketingRuleRelation,
  MarketingStrategyInput,
  MarketingTriggerOption,
  MarketingTriggerRule,
  MarketingTriggerType,
} from '@/types';
import { createTriggerRuleFromOption, customizeTriggerRule, formatMarketingRuleParams } from '@/utils/marketingAutomation';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

interface StrategyForm {
  name: string;
  description: string;
  executionType: 'auto' | 'manual';
  executionTime: string;
  ruleRelation: MarketingRuleRelation;
  triggerRules: MarketingTriggerRule[];
  actions: MarketingAction[];
}

const emptyForm = (): StrategyForm => ({
  name: '',
  description: '',
  executionType: 'auto',
  executionTime: '09:00',
  ruleRelation: 'AND',
  triggerRules: [],
  actions: [],
});

const STATUS_LABEL: Record<MarketingAutomationStrategy['status'], string> = {
  draft: '草稿',
  enabled: '启用',
  paused: '暂停',
  archived: '已归档',
};

const CHANNEL_OPTIONS: Array<{ value: NonNullable<MarketingAction['channel']>; label: string }> = [
  { value: 'sms', label: '短信' },
  { value: 'miniapp', label: '小程序' },
  { value: 'wechat', label: '微信' },
  { value: 'group', label: '社群' },
  { value: 'store', label: '门店话术' },
  { value: 'moments', label: '朋友圈' },
];

function createInput(form: StrategyForm): MarketingStrategyInput {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    executionType: form.executionType,
    schedule: { type: form.executionType === 'auto' ? 'daily' : 'realtime', time: form.executionTime },
    triggerRules: form.triggerRules,
    ruleRelation: form.ruleRelation,
    actions: form.actions,
  };
}

function createForm(strategy: MarketingAutomationStrategy): StrategyForm {
  return {
    name: strategy.name,
    description: strategy.description,
    executionType: strategy.executionType,
    executionTime: strategy.schedule.time || '09:00',
    ruleRelation: strategy.ruleRelation,
    triggerRules: strategy.triggerRules.map((rule) => ({
      ...rule,
      params: JSON.parse(JSON.stringify(rule.params)) as Record<string, MarketingParamValue>,
    })),
    actions: strategy.actions.map((action) => ({ ...action })),
  };
}

export function CreateMarketing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [triggerOptions, setTriggerOptions] = useState<MarketingTriggerOption[]>([]);
  const [strategies, setStrategies] = useState<MarketingAutomationStrategy[]>([]);
  const [effects, setEffects] = useState<MarketingAutomationEffect[]>([]);
  const [executions, setExecutions] = useState<MarketingAutomationExecution[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<StrategyForm>(emptyForm);
  const [selected, setSelected] = useState<MarketingAutomationStrategy | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [operatingId, setOperatingId] = useState<number | null>(null);

  const loadList = useCallback(async (nextKeyword: string, nextStatus: string) => {
    const [strategyResponse, automationEffects] = await Promise.all([
      getAutomationStrategiesPaginated({ page: 1, pageSize: 50, keyword: nextKeyword || undefined, status: nextStatus }),
      getAutomationEffects(),
    ]);
    setStrategies(strategyResponse.items);
    setEffects(automationEffects);
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const options = await getAutomationTriggerOptions();
        setTriggerOptions(options);
        await loadList('', 'all');
      } catch {
        setLoadError('自动营销数据加载失败，请稍后重试。');
      } finally {
        setLoading(false);
      }
    };
    void loadInitial();
  }, [loadList]);

  useEffect(() => {
    if (!triggerOptions.length || !searchParams.get('name')) return;
    const next = emptyForm();
    next.name = searchParams.get('name') || '';
    next.description = searchParams.get('desc') || '';
    const type = searchParams.get('trigger') as MarketingTriggerType | null;
    const option = triggerOptions.find((item) => item.type === type);
    if (option) next.triggerRules = [createTriggerRuleFromOption(option)];
    try {
      const actions = JSON.parse(searchParams.get('actions') || '[]') as Array<{ type: MarketingAction['type']; value: string }>;
      next.actions = actions.map((action, index) => ({
        ...action,
        channel: (searchParams.get('channels')?.split(',')[index] || 'miniapp') as MarketingAction['channel'],
      }));
    } catch {
      next.actions = [];
    }
    setMode('create');
    setForm(next);
    setPreview(null);
    setStep(1);
    setShowEditor(true);
    setSearchParams({}, { replace: true });
  }, [triggerOptions, searchParams, setSearchParams]);

  const effectByStrategy = useMemo(
    () => new Map(effects.map((item) => [item.strategyId, item])),
    [effects],
  );

  const openCreate = () => {
    setMode('create');
    setSelected(null);
    setForm(emptyForm());
    setPreview(null);
    setStep(1);
    setShowEditor(true);
  };

  const openEdit = (strategy: MarketingAutomationStrategy) => {
    setMode('edit');
    setSelected(strategy);
    setForm(createForm(strategy));
    setPreview(null);
    setStep(1);
    setShowEditor(true);
  };

  const openCopy = (strategy: MarketingAutomationStrategy) => {
    const next = createForm(strategy);
    next.name = `${next.name}（副本）`;
    setMode('create');
    setSelected(null);
    setForm(next);
    setPreview(null);
    setStep(1);
    setShowEditor(true);
  };

  const openDetail = async (strategy: MarketingAutomationStrategy) => {
    setSelected(strategy);
    setShowDetail(true);
    const response = await getAutomationExecutionsPaginated({ page: 1, pageSize: 5, strategyId: strategy.id });
    setExecutions(response.items);
  };

  const toggleRule = (option: MarketingTriggerOption) => {
    setForm((current) => {
      const existing = current.triggerRules.some((rule) => rule.type === option.type);
      return {
        ...current,
        triggerRules: existing
          ? current.triggerRules.filter((rule) => rule.type !== option.type)
          : [...current.triggerRules, createTriggerRuleFromOption(option)],
      };
    });
    setPreview(null);
  };

  const setRuleParam = (type: MarketingTriggerType, key: string, value: MarketingParamValue) => {
    setForm((current) => ({
      ...current,
      triggerRules: current.triggerRules.map((rule) =>
        rule.type === type ? customizeTriggerRule(rule, key, value) : rule
      ),
    }));
    setPreview(null);
  };

  const addAction = () => {
    setForm((current) => ({
      ...current,
      actions: [...current.actions, { type: 'coupon', value: '', channel: 'miniapp' }],
    }));
  };

  const updateAction = (index: number, patch: Partial<MarketingAction>) => {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action, currentIndex) => currentIndex === index ? { ...action, ...patch } : action),
    }));
  };

  const removeAction = (index: number) => {
    setForm((current) => ({ ...current, actions: current.actions.filter((_, currentIndex) => currentIndex !== index) }));
  };

  const handlePreview = async () => {
    if (!form.triggerRules.length) {
      toast.error('请至少选择一条触发规则');
      return;
    }
    setPreviewLoading(true);
    try {
      setPreview(await previewAutomationAudience(selected?.id || 'draft', {
        triggerRules: form.triggerRules,
        ruleRelation: form.ruleRelation,
      }));
    } catch {
      toast.error('命中客户预估失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const validateForm = () => {
    if (!form.name.trim()) return '请输入策略名称';
    if (!form.triggerRules.length) return '请至少选择一条触发规则';
    if (!form.actions.length || form.actions.some((action) => !action.value.trim())) return '请配置至少一项完整营销动作';
    return '';
  };

  const submit = async (draft: boolean) => {
    const validation = validateForm();
    if (validation) {
      toast.error(validation);
      return;
    }
    setSubmitting(true);
    try {
      const payload = createInput(form);
      if (mode === 'edit' && selected) {
        await updateAutomationStrategy(selected.id, payload);
        toast.success('策略已更新');
      } else if (draft) {
        await saveAutomationStrategyDraft(payload);
        toast.success('已保存为草稿');
      } else {
        await createAutomationStrategy(payload);
        toast.success('策略已创建并启用');
      }
      setShowEditor(false);
      await loadList(keyword, status);
    } catch {
      toast.error('策略保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (strategy: MarketingAutomationStrategy) => {
    setOperatingId(strategy.id);
    try {
      if (strategy.status === 'enabled') {
        await pauseAutomationStrategy(strategy.id);
        toast.success('策略已暂停');
      } else {
        await enableAutomationStrategy(strategy.id);
        toast.success('策略已启用');
      }
      await loadList(keyword, status);
    } catch {
      toast.error('状态更新失败');
    } finally {
      setOperatingId(null);
    }
  };

  const executeNow = async (strategy: MarketingAutomationStrategy) => {
    setOperatingId(strategy.id);
    try {
      const result = await executeAutomationStrategy(strategy.id);
      toast.success(`执行完成，已触达 ${result.reachedCount} 位客户`);
      await loadList(keyword, status);
    } catch {
      toast.error('执行失败');
    } finally {
      setOperatingId(null);
    }
  };

  const removeStrategy = async (strategy: MarketingAutomationStrategy) => {
    if (!window.confirm(`确认删除策略“${strategy.name}”吗？`)) return;
    setOperatingId(strategy.id);
    try {
      await deleteAutomationStrategy(strategy.id);
      toast.success('策略已删除');
      await loadList(keyword, status);
    } catch {
      toast.error('删除失败');
    } finally {
      setOperatingId(null);
    }
  };

  if (loading) {
    return <div className="flex h-72 items-center justify-center text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载自动营销策略...</div>;
  }

  if (loadError) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-4 text-sm text-gray-600">
        <span>{loadError}</span>
        <Button onClick={() => window.location.reload()}>重新加载</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">自动营销</h1>
          <p className="mt-1 text-sm text-gray-500">基于客户画像与消费行为配置自动触发策略</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />新建策略</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat title="策略总数" value={strategies.length} icon={<Sparkles className="h-5 w-5 text-blue-600" />} />
        <Stat title="启用中" value={strategies.filter((item) => item.status === 'enabled').length} icon={<Play className="h-5 w-5 text-green-600" />} />
        <Stat title="预计覆盖客户" value={strategies.filter((item) => item.status === 'enabled').reduce((sum, item) => sum + item.targetCount, 0)} icon={<Users className="h-5 w-5 text-purple-600" />} />
      </div>

      <div className="flex items-center gap-3 border-y border-gray-200 py-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索策略名称" className="pl-9" />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm">
          <option value="all">全部状态</option>
          <option value="enabled">启用</option>
          <option value="paused">暂停</option>
          <option value="draft">草稿</option>
        </select>
        <Button variant="outline" onClick={() => void loadList(keyword, status)}>筛选</Button>
      </div>

      {strategies.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center border border-dashed border-gray-300 text-sm text-gray-500">
          <Target className="mb-3 h-8 w-8 text-gray-300" />
          暂无符合条件的自动营销策略
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>策略</TableHead>
              <TableHead>触发规则</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>覆盖客户</TableHead>
              <TableHead>效果</TableHead>
              <TableHead className="w-56">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strategies.map((strategy) => {
              const effect = effectByStrategy.get(strategy.id);
              return (
                <TableRow key={strategy.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{strategy.name}</div>
                    <div className="mt-1 max-w-64 text-xs text-gray-500">{strategy.description}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {strategy.triggerRules.map((rule) => (
                        <span key={rule.type} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                          {triggerOptions.find((option) => option.type === rule.type)?.label || rule.type}
                        </span>
                      ))}
                      <span className="text-xs text-gray-400">{strategy.ruleRelation}</span>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={strategy.status} /></TableCell>
                  <TableCell className="font-medium text-gray-900">{strategy.targetCount} 人</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    <div>回店率 {effect?.returnRate || '-'}</div>
                    <div className="mt-1">ROI {effect?.roi || '-'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <IconButton title="查看详情" onClick={() => void openDetail(strategy)}><Eye className="h-4 w-4" /></IconButton>
                      <IconButton title="编辑" onClick={() => openEdit(strategy)}><Edit className="h-4 w-4" /></IconButton>
                      <IconButton title="复制" onClick={() => openCopy(strategy)}><Copy className="h-4 w-4" /></IconButton>
                      <IconButton title={strategy.status === 'enabled' ? '暂停' : '启用'} onClick={() => void toggleStatus(strategy)} disabled={operatingId === strategy.id}>
                        {strategy.status === 'enabled' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </IconButton>
                      <IconButton title="立即执行" onClick={() => void executeNow(strategy)} disabled={operatingId === strategy.id}><WandSparkles className="h-4 w-4" /></IconButton>
                      <IconButton title="删除" onClick={() => void removeStrategy(strategy)} disabled={operatingId === strategy.id}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" aria-describedby="strategy-editor-description">
          <DialogHeader><DialogTitle>{mode === 'create' ? '新建自动营销策略' : '编辑自动营销策略'}</DialogTitle></DialogHeader>
          <span id="strategy-editor-description" className="sr-only">配置触发规则、营销动作和执行方式</span>
          <div className="mb-5 flex gap-6 border-b border-gray-200 pb-3 text-sm">
            {['触发规则', '营销动作', '确认提交'].map((label, index) => (
              <span key={label} className={step === index + 1 ? 'font-medium text-blue-600' : 'text-gray-400'}>
                {index + 1}. {label}
              </span>
            ))}
          </div>
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <label className="text-sm text-gray-600">策略名称<Input className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label className="text-sm text-gray-600">执行方式
                  <select className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={form.executionType} onChange={(event) => setForm({ ...form, executionType: event.target.value as 'auto' | 'manual' })}>
                    <option value="auto">自动执行</option>
                    <option value="manual">手动执行</option>
                  </select>
                </label>
                <label className="text-sm text-gray-600">执行时间<Input type="time" className="mt-1" value={form.executionTime} onChange={(event) => setForm({ ...form, executionTime: event.target.value })} /></label>
              </div>
              <label className="block text-sm text-gray-600">策略说明
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" rows={2} />
              </label>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">选择触发规则</span>
                  <div className="flex items-center rounded-md border border-gray-200 p-1 text-xs">
                    {(['AND', 'OR'] as MarketingRuleRelation[]).map((relation) => (
                      <button key={relation} type="button" onClick={() => setForm({ ...form, ruleRelation: relation })}
                        className={`rounded px-3 py-1.5 ${form.ruleRelation === relation ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>
                        {relation}
                      </button>
                    ))}
                  </div>
                </div>
                {(['时间触发', '行为触发', '属性触发'] as const).map((category) => (
                  <div key={category} className="mb-4">
                    <div className="mb-2 text-xs font-medium text-gray-500">{category}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {triggerOptions.filter((option) => option.category === category).map((option) => {
                        const checked = form.triggerRules.some((rule) => rule.type === option.type);
                        return (
                          <button key={option.type} type="button" onClick={() => toggleRule(option)}
                            className={`rounded-md border p-3 text-left ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                            <div className="flex items-center justify-between text-sm font-medium text-gray-900">
                              {option.label}<span className="text-[11px] text-gray-400">{option.priority}</span>
                            </div>
                            <div className="mt-1 text-xs text-gray-500">{option.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {form.triggerRules.map((rule) => {
                const option = triggerOptions.find((item) => item.type === rule.type);
                if (!option) return null;
                return (
                  <div key={rule.type} className="rounded-md border border-gray-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-medium text-gray-800">{option.label}参数</span>
                      <span className={`rounded px-2 py-1 text-xs ${rule.parameterSource === 'system_default' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                        {rule.parameterSource === 'system_default' ? '已使用系统推荐值' : '已自定义'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {option.paramSchema.map((field) => (
                        <ParamField key={field.key} field={field} value={rule.params[field.key]}
                          onChange={(value) => setRuleParam(rule.type, field.key, value)} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)}>下一步</Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-800">营销动作与触达渠道</h3>
                <Button variant="outline" size="sm" onClick={addAction}><Plus className="mr-1 h-3.5 w-3.5" />添加动作</Button>
              </div>
              {form.actions.length === 0 && <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">请添加优惠或触达动作</div>}
              {form.actions.map((action, index) => (
                <div key={index} className="space-y-3 rounded-md border border-gray-200 p-3">
                  <div className="grid grid-cols-[130px_150px_1fr_auto] gap-3">
                    <select value={action.type} onChange={(event) => updateAction(index, { type: event.target.value as MarketingAction['type'] })} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
                      <option value="coupon">优惠券</option><option value="discount">折扣</option><option value="gift">赠品</option><option value="points">积分</option><option value="sms">通知</option>
                    </select>
                    <select value={action.channel} onChange={(event) => updateAction(index, { channel: event.target.value as MarketingAction['channel'] })} className="h-9 rounded-md border border-gray-300 px-2 text-sm">
                      {CHANNEL_OPTIONS.map((channel) => <option key={channel.value} value={channel.value}>{channel.label}</option>)}
                    </select>
                    <Input value={action.value} placeholder="例如：护理套餐立减 100 元" onChange={(event) => updateAction(index, { value: event.target.value })} />
                    <Button size="sm" variant="ghost" onClick={() => removeAction(index)}>移除</Button>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                      <span>触达文案</span>
                      <button type="button" className="flex items-center gap-1 text-blue-600" onClick={() => updateAction(index, {
                        contentTemplate: `尊敬的{客户姓名}，${form.name || '专属护理活动'}已为您准备：${action.value || '专属权益'}，欢迎预约到店体验。`,
                      })}>
                        <WandSparkles className="h-3.5 w-3.5" />生成文案
                      </button>
                    </div>
                    <textarea rows={2} value={action.contentTemplate || ''} onChange={(event) => updateAction(index, { contentTemplate: event.target.value })}
                      placeholder="填写对应渠道的客户触达文案" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>
                <Button onClick={() => setStep(3)}>下一步</Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-700">
                <div className="grid grid-cols-2 gap-3">
                  <div>策略名称：<span className="font-medium text-gray-900">{form.name || '-'}</span></div>
                  <div>执行方式：<span className="font-medium text-gray-900">{form.executionType === 'auto' ? '自动执行' : '手动执行'}</span></div>
                  <div>组合关系：<span className="font-medium text-gray-900">{form.ruleRelation}</span></div>
                  <div>营销动作：<span className="font-medium text-gray-900">{form.actions.length} 项</span></div>
                </div>
              </div>
              <div>
                <Button variant="outline" onClick={() => void handlePreview()} disabled={previewLoading}>
                  {previewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
                  预估命中客户
                </Button>
              </div>
              {preview && (
                <div className="space-y-3 rounded-md border border-blue-100 bg-blue-50/30 p-4">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Metric title="预计触达" value={`${preview.estimatedReachedCount ?? preview.total} 人`} />
                    <Metric title="预计转化" value={`${preview.estimatedConvertedCount ?? 0} 人`} />
                    <Metric title="预计收入" value={`¥${(preview.estimatedRevenue ?? 0).toLocaleString()}`} />
                  </div>
                  {preview.samples.length === 0 ? (
                    <div className="py-5 text-center text-sm text-gray-500">当前规则没有命中客户，请调整参数后重试。</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>会员等级</TableHead><TableHead>预测转化</TableHead><TableHead>LTV层级</TableHead><TableHead>预计收入</TableHead><TableHead>命中原因</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {preview.samples.map((customer) => (
                          <TableRow key={customer.id}>
                            <TableCell>{customer.name}<div className="text-xs text-gray-400">{customer.phone}</div></TableCell>
                            <TableCell>{customer.memberLevel}</TableCell>
                            <TableCell>{customer.predictedConversionScore ?? 0}%</TableCell>
                            <TableCell>{customer.ltvTier || '-'}</TableCell>
                            <TableCell>¥{(customer.predictedRevenue ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-xs text-gray-600">{customer.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>上一步</Button>
                <div className="flex gap-3">
                  {mode === 'create' && <Button variant="outline" disabled={submitting} onClick={() => void submit(true)}>保存草稿</Button>}
                  <Button disabled={submitting} onClick={() => void submit(false)}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {mode === 'edit' ? '保存更改' : '创建并启用'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto" aria-describedby="strategy-detail-description">
          <DialogHeader><DialogTitle>策略详情</DialogTitle></DialogHeader>
          <span id="strategy-detail-description" className="sr-only">查看触发参数、效果与执行记录</span>
          {selected && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900">{selected.name}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <p className="text-sm text-gray-600">{selected.description}</p>
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-800">触发规则</h4>
                <div className="space-y-2">
                  {selected.triggerRules.map((rule) => (
                    <div key={rule.type} className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                      <span className="font-medium">{triggerOptions.find((item) => item.type === rule.type)?.label || rule.type}</span>
                      <span className="ml-3 text-blue-600">{formatMarketingRuleParams(rule, triggerOptions.find((item) => item.type === rule.type))}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-800">触达配置</h4>
                {selected.actions.map((action, index) => (
                  <div key={`${action.channel}-${index}`} className="mb-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                    <span className="font-medium text-gray-900">{CHANNEL_OPTIONS.find((channel) => channel.value === action.channel)?.label || action.channel || '门店'}</span>
                    <span className="ml-3 text-gray-700">{action.value}</span>
                    {action.contentTemplate && <div className="mt-1 text-xs text-gray-500">{action.contentTemplate}</div>}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Metric title="预计覆盖" value={`${selected.targetCount} 人`} />
                <Metric title="预测转化" value={`${effectByStrategy.get(selected.id)?.predictedConvertedCount ?? 0} 人`} />
                <Metric title="实际转化" value={`${effectByStrategy.get(selected.id)?.actualConvertedCount ?? 0} 人`} />
                <Metric title="预测/实际收入" value={`¥${(effectByStrategy.get(selected.id)?.predictedRevenue || 0).toLocaleString()} / ¥${(effectByStrategy.get(selected.id)?.actualRevenue || 0).toLocaleString()}`} />
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-800">最近执行记录</h4>
                {executions.length === 0 ? <div className="text-sm text-gray-400">暂无执行记录</div> : executions.map((execution) => (
                  <div key={execution.id} className="mb-2 flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                    <span>{execution.executedAt}</span><span>{execution.channel}</span><span>触达 {execution.reachedCount} 人</span>
                    <span className="text-green-600">{execution.status === 'success' ? '成功' : '部分失败'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between border border-gray-200 px-5 py-4">
      <div><div className="text-sm text-gray-500">{title}</div><div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div></div>
      {icon}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-md bg-gray-50 p-3"><div className="text-xs text-gray-500">{title}</div><div className="mt-1 font-semibold text-gray-900">{value}</div></div>;
}

function StatusBadge({ status }: { status: MarketingAutomationStrategy['status'] }) {
  const style = status === 'enabled' ? 'bg-green-50 text-green-700' : status === 'paused' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-50 text-yellow-700';
  return <span className={`rounded px-2 py-1 text-xs ${style}`}>{STATUS_LABEL[status]}</span>;
}

function IconButton({ title, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button type="button" title={title} className="flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40" {...props}>
      {children}
    </button>
  );
}

function ParamField({
  field,
  value,
  onChange,
}: {
  field: MarketingTriggerOption['paramSchema'][number];
  value: MarketingParamValue | undefined;
  onChange: (value: MarketingParamValue) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <label className="text-sm text-gray-600">{field.label}
        <select value={String(value || '')} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm">
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'multi_select') {
    const selectedValues = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="text-sm text-gray-600">{field.label}
        <div className="mt-2 flex flex-wrap gap-3">
          {field.options?.map((option) => (
            <label key={option.value} className="flex items-center gap-1 text-xs text-gray-700">
              <input type="checkbox" checked={selectedValues.includes(option.value)} onChange={(event) => {
                const next = event.target.checked ? [...selectedValues, option.value] : selectedValues.filter((item) => item !== option.value);
                onChange(next);
              }} />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === 'date_range') {
    const range = Array.isArray(value) ? value as number[] : [-10, 3];
    return (
      <div className="text-sm text-gray-600">{field.label}
        <div className="mt-1 flex items-center gap-2">
          <Input type="number" value={range[0] ?? ''} onChange={(event) => onChange([Number(event.target.value), range[1] || 0])} />
          <span>至</span>
          <Input type="number" value={range[1] ?? ''} onChange={(event) => onChange([range[0] || 0, Number(event.target.value)])} />
        </div>
      </div>
    );
  }
  return (
    <label className="text-sm text-gray-600">{field.label}
      <div className="mt-1 flex items-center gap-2">
        <Input type={field.type === 'number' ? 'number' : 'text'} min={field.min} max={field.max} value={String(value ?? '')}
          onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)} />
        {field.suffix && <span className="text-xs text-gray-500">{field.suffix}</span>}
      </div>
    </label>
  );
}
