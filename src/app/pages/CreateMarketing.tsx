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
  getMarketingRuleTemplatesPaginated,
  pauseAutomationStrategy,
  previewAutomationAudience,
  saveAutomationStrategyDraft,
  updateAutomationStrategy,
} from '@/api/marketing';
import { getPromotionsPaginated } from '@/api/promotion';
import { generateMarketingCopy } from '@/api/ai';
import type { MarketingCopyChannel } from '@/types/ai';
import type {
  AudiencePreview,
  MarketingAction,
  MarketingAutomationEffect,
  MarketingAutomationExecution,
  MarketingAutomationStrategy,
  MarketingParamValue,
  Promotion,
  MarketingRuleRelation,
  MarketingRuleTemplate,
  MarketingRuleTemplateSource,
  MarketingRuleTemplateStatus,
  MarketingSchedule,
  MarketingStrategyInput,
  MarketingTriggerOption,
  MarketingTriggerRule,
  MarketingTriggerType,
} from '@/types';
import { createTriggerRuleFromOption, customizeTriggerRule, formatMarketingRuleParams } from '@/utils/marketingAutomation';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/UI';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { MarketingRuleLibrary } from './MarketingRuleLibrary';

interface StrategyForm {
  name: string;
  description: string;
  executionType: 'auto' | 'manual';
  executionTime: string;
  source?: MarketingAutomationStrategy['source'];
  ruleTemplateId?: number;
  ruleTemplateVersion?: string;
  ruleRelation: MarketingRuleRelation;
  triggerRules: MarketingTriggerRule[];
  actions: MarketingAction[];
  attribution?: Record<string, unknown>;
}

type RuleLibraryTriggerOption = MarketingTriggerOption & {
  ruleTemplateId?: number;
  ruleTemplateVersion?: string;
  ruleTemplateSource?: MarketingRuleTemplateSource;
  ruleTemplateStatus?: MarketingRuleTemplateStatus;
  scenario?: string;
  recommendedActions?: MarketingAction[];
  scheduleDefault?: MarketingSchedule;
};

interface MarketingCopyContext {
  targetAudience?: string;
  offer?: string;
  strategyText?: string;
  sourceRecommendationId?: string;
  predictionRunId?: string;
  attribution?: Record<string, unknown>;
  sourceSignals?: string[];
  recommendedItems?: string[];
}

const emptyForm = (): StrategyForm => ({
  name: '',
  description: '',
  executionType: 'auto',
  executionTime: '09:00',
  source: 'manual',
  ruleRelation: 'AND',
  triggerRules: [],
  actions: [],
});

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeCount(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function cloneParams(params: MarketingTriggerRule['params'] | null | undefined): Record<string, MarketingParamValue> {
  return JSON.parse(JSON.stringify(params ?? {})) as Record<string, MarketingParamValue>;
}

function parseJsonParam<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getActionChannel(action: MarketingAction): MarketingCopyChannel {
  const channel = action.channel || 'miniapp';
  return MARKETING_COPY_CHANNELS.has(channel as MarketingCopyChannel) ? channel as MarketingCopyChannel : 'miniapp';
}

const INTERNAL_MARKETING_COPY_PATTERNS = [
  /\d+\s*位客户/,
  /客户进入/,
  /复购窗口/,
  /护理周期复购方案/,
  /高流失风险/,
  /流失风险/,
  /即将流失/,
  /沉睡客户/,
  /待唤醒/,
  /唤醒/,
  /命中客户/,
  /推荐命中/,
  /客户群体/,
  /智能推荐/,
  /策略名称/,
  /营销策略/,
  /策略/,
  /触发规则/,
  /自动规则/,
  /规则条件/,
  /算法/,
  /模型/,
  /RFM/i,
  /LTV/i,
  /P[0-3]\b/i,
  /高优先级/,
  /预测/,
  /预警/,
];

function buildCopySignal(form: StrategyForm, option?: MarketingTriggerOption, context?: MarketingCopyContext) {
  return [
    form.name,
    form.description,
    option?.label,
    option?.description,
    context?.targetAudience,
    context?.strategyText,
    ...(context?.sourceSignals || []),
    ...(context?.recommendedItems || []),
  ]
    .filter(Boolean)
    .join(' ');
}

function hasInternalMarketingTerms(text?: string) {
  if (!text) return false;
  return INTERNAL_MARKETING_COPY_PATTERNS.some((pattern) => pattern.test(text));
}

function stripInternalMarketingTerms(text = '') {
  return text
    .replace(/\d+\s*位客户/g, '')
    .replace(/进入\s*\d+\s*天复购窗口[。；，,、\s]*/g, '')
    .replace(/\d+\s*天复购窗口/g, '护理焕新')
    .replace(/高流失风险客户|流失风险客户|即将流失客户|沉睡客户|待唤醒客户/g, '老朋友')
    .replace(/护理周期复购方案/g, '护理焕新方案')
    .replace(/复购窗口/g, '护理焕新')
    .replace(/推荐命中|命中客户|客户群体|智能推荐|策略名称|营销策略|策略|触发规则|自动规则|规则条件/g, '')
    .replace(/RFM|LTV|算法|模型|预测|预警|P[0-3]\b|高优先级/gi, '')
    .replace(/[，,。；;、\s]*(?=[，,。；;、])/g, '')
    .replace(/^[，,。；;、\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCustomerFacingCampaignName(form: StrategyForm, option?: MarketingTriggerOption, context?: MarketingCopyContext) {
  const signal = buildCopySignal(form, option, context);
  if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友回店护理礼';
  if (/复购窗口|护理周期|30\s*天复购|复购/.test(signal)) return '护理焕新礼';
  if (/次卡|套餐|卡项|核销|划扣/.test(signal)) return '卡项护理权益提醒';
  if (/优惠券|券/.test(signal)) return '专属护理优惠';
  if (/生日|寿星/.test(signal)) return '生日月专属护理礼';
  if (/新客|首单|首次/.test(signal)) return '新客首护体验礼';
  if (/敏感|修护|舒缓/.test(signal)) return '敏感肌舒缓护理季';
  if (/补水|保湿|干性/.test(signal)) return '补水保湿护理季';
  if (/VIP|会员|高价值|铂金|黄金/.test(signal)) return '会员专属护理礼遇';

  const candidate = stripInternalMarketingTerms(form.name || context?.strategyText || option?.label || '');
  return candidate && !hasInternalMarketingTerms(candidate) ? candidate : '会员专属护理活动';
}

function getCustomerFacingAudience(form: StrategyForm, option?: MarketingTriggerOption, context?: MarketingCopyContext) {
  const signal = buildCopySignal(form, option, context);
  if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友';
  if (/生日|寿星/.test(signal)) return '寿星会员';
  if (/新客|首单|首次/.test(signal)) return '新朋友';
  return '会员';
}

function getSafeRecommendedItems(context?: MarketingCopyContext) {
  return (context?.recommendedItems || [])
    .map((item) => stripInternalMarketingTerms(item))
    .filter((item) => item && !hasInternalMarketingTerms(item));
}

function buildFallbackCopy(form: StrategyForm, action: MarketingAction, option?: MarketingTriggerOption, context?: MarketingCopyContext) {
  const target = getCustomerFacingAudience(form, option, context);
  const campaignName = getCustomerFacingCampaignName(form, option, context);
  const offer = action.value || context?.offer || '专属护理权益';
  const recommendedItems = getSafeRecommendedItems(context);
  const itemText = recommendedItems.length ? `，可预约体验${recommendedItems.join('、')}` : '';
  if (action.channel === 'sms') {
    return `【Ami_Core】${campaignName}已开启：${offer}${itemText}。可在线预约，到店后由顾问为您确认合适护理方案。`;
  }
  if (action.channel === 'store') {
    return `${target}您好，门店为您准备了「${campaignName}」：${offer}${itemText}。到店后我们会根据实际肤况帮您细化护理安排。`;
  }
  return `最近正适合给自己安排一次护理焕新。门店为您准备了「${campaignName}」：${offer}${itemText}。可在线预约，到店后由顾问根据您的肤况和护理习惯确认合适方案。`;
}

function sanitizeGeneratedMarketingCopy(
  text: string | undefined,
  form: StrategyForm,
  action: MarketingAction,
  option?: MarketingTriggerOption,
  context?: MarketingCopyContext,
) {
  const cleaned = stripInternalMarketingTerms(text || '');
  if (!cleaned || cleaned.length < 12 || hasInternalMarketingTerms(cleaned)) {
    return buildFallbackCopy(form, action, option, context);
  }
  return cleaned;
}

async function generateCopyTextForAction(
  form: StrategyForm,
  action: MarketingAction,
  option?: MarketingTriggerOption,
  context?: MarketingCopyContext,
) {
  const channel = getActionChannel(action);
  const campaignName = getCustomerFacingCampaignName(form, option, context);
  const targetAudience = getCustomerFacingAudience(form, option, context);
  const recommendedItems = getSafeRecommendedItems(context);
  const triggerReasons = [
    form.name,
    form.description,
    option?.label,
    option?.description,
    context?.strategyText,
    ...(context?.sourceSignals || []),
  ].filter(Boolean) as string[];
  const result = await generateMarketingCopy({
    campaignName,
    targetAudience,
    channel,
    channels: [channel],
    offer: action.value || context?.offer || '专属护理权益',
    source: context?.strategyText || form.description || option?.description,
    segment: targetAudience,
    triggerReasons,
    projectNames: recommendedItems,
    storeName: 'Ami_Core',
    styleInstruction: channel === 'sms' ? 'shorter' : channel === 'store' ? 'consultative' : 'warmer',
  });

  if (result.safety?.blocked) {
    throw new Error(result.safety.reasons?.[0] || 'AI 文案被安全规则拦截');
  }
  const structuredVariant = result.structured?.variants?.find((variant) => variant.channel === channel);
  const plainVariant = result.variants?.find((variant) => variant.channel === channel);
  return sanitizeGeneratedMarketingCopy(
    structuredVariant?.text || plainVariant?.text || result.text,
    form,
    action,
    option,
    context,
  );
}

function normalizeTriggerOption(option: MarketingTriggerOption): MarketingTriggerOption {
  return {
    ...option,
    paramSchema: asArray(option.paramSchema),
    defaultParams: option.defaultParams ?? {},
  };
}

function normalizeStrategy(strategy: MarketingAutomationStrategy): MarketingAutomationStrategy {
  return {
    ...strategy,
    description: strategy.description ?? '',
    executionType: strategy.executionType ?? 'auto',
    schedule: strategy.schedule ?? { type: 'daily', time: '09:00' },
    ruleRelation: strategy.ruleRelation ?? 'AND',
    triggerRules: asArray(strategy.triggerRules).map((rule) => ({
      ...rule,
      params: cloneParams(rule.params),
      parameterSource: rule.parameterSource ?? 'system_default',
    })),
    actions: asArray(strategy.actions).map((action) => ({ ...action })),
    targetCount: safeCount(strategy.targetCount),
  };
}

function normalizePreview(preview: AudiencePreview): AudiencePreview {
  return {
    ...preview,
    total: safeCount(preview.total ?? preview.estimatedCount ?? preview.totalCustomers),
    estimatedReachedCount: safeCount(preview.estimatedReachedCount ?? preview.estimatedCount ?? preview.total),
    estimatedConvertedCount: safeCount(preview.estimatedConvertedCount),
    estimatedRevenue: safeCount(preview.estimatedRevenue),
    samples: asArray(preview.samples),
    ruleRelation: preview.ruleRelation ?? 'AND',
    generatedAt: preview.generatedAt ?? new Date().toISOString(),
  };
}

const STATUS_LABEL: Record<MarketingAutomationStrategy['status'], string> = {
  draft: '草稿',
  enabled: '启用',
  paused: '暂停',
  archived: '已归档',
};

const STRATEGY_SOURCE_LABEL: Record<NonNullable<MarketingAutomationStrategy['source']>, string> = {
  manual: '手动创建',
  rule_library: '规则库',
  recommendation: '智能推荐',
};

const CHANNEL_OPTIONS: Array<{ value: NonNullable<MarketingAction['channel']>; label: string }> = [
  { value: 'sms', label: '短信' },
  { value: 'miniapp', label: '小程序' },
  { value: 'wechat', label: '微信' },
  { value: 'group', label: '社群' },
  { value: 'store', label: '门店话术' },
  { value: 'moments', label: '朋友圈' },
];

const MARKETING_COPY_CHANNELS = new Set<MarketingCopyChannel>(['sms', 'wechat', 'miniapp', 'group', 'store', 'moments']);

function createInput(form: StrategyForm): MarketingStrategyInput {
  const attribution = form.attribution;
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    executionType: form.executionType,
    source: form.source,
    ruleTemplateId: form.ruleTemplateId,
    ruleTemplateVersion: form.ruleTemplateVersion,
    schedule: {
      type: form.executionType === 'auto' ? 'daily' : 'realtime',
      time: form.executionTime,
      ...(attribution ? { attribution } : {}),
    },
    triggerRules: form.triggerRules,
    ruleRelation: form.ruleRelation,
    actions: attribution ? form.actions.map((action) => ({ ...action, attribution: action.attribution ?? attribution })) : form.actions,
    ...(attribution ? { attribution } : {}),
  };
}

function createForm(strategy: MarketingAutomationStrategy): StrategyForm {
  const normalized = normalizeStrategy(strategy);
  return {
    name: normalized.name,
    description: normalized.description,
    executionType: normalized.executionType,
    executionTime: normalized.schedule.time || '09:00',
    source: normalized.source ?? 'manual',
    ruleTemplateId: normalized.ruleTemplateId,
    ruleTemplateVersion: normalized.ruleTemplateVersion,
    ruleRelation: normalized.ruleRelation,
    triggerRules: normalized.triggerRules.map((rule) => ({
      ...rule,
      params: cloneParams(rule.params),
    })),
    actions: normalized.actions.map((action) => ({ ...action })),
    attribution: normalized.schedule.attribution as Record<string, unknown> | undefined,
  };
}

const SELECTABLE_RULE_TEMPLATE_STATUSES = new Set<MarketingRuleTemplateStatus>(['recommended', 'enabled']);

function mapRuleTemplateToTriggerOption(template: MarketingRuleTemplate): RuleLibraryTriggerOption {
  return {
    type: template.triggerType,
    category: template.categoryLabel,
    label: template.name,
    description: template.description || template.recommendationReason || '',
    priority: template.priority,
    paramSchema: template.paramSchema ?? [],
    defaultParams: template.defaultParams ?? {},
    ruleTemplateId: template.id,
    ruleTemplateVersion: template.version,
    ruleTemplateSource: template.source,
    ruleTemplateStatus: template.status,
    scenario: template.scenario,
    recommendedActions: template.recommendedActions ?? [],
    scheduleDefault: template.scheduleDefault,
  };
}

function optionKey(option: RuleLibraryTriggerOption) {
  return option.ruleTemplateId ? `template:${option.ruleTemplateId}` : `type:${option.type}`;
}

function findOptionByKey(options: RuleLibraryTriggerOption[], key: string) {
  if (key.startsWith('template:')) {
    const id = Number(key.replace('template:', ''));
    return options.find((option) => option.ruleTemplateId === id);
  }
  if (key.startsWith('type:')) {
    const type = key.replace('type:', '') as MarketingTriggerType;
    return options.find((option) => option.type === type);
  }
  return undefined;
}

function findOptionForRule(
  options: RuleLibraryTriggerOption[],
  rule?: MarketingTriggerRule,
  ruleTemplateId?: number,
) {
  if (ruleTemplateId) {
    const byTemplate = options.find((option) => option.ruleTemplateId === ruleTemplateId);
    if (byTemplate) return byTemplate;
  }
  return rule ? options.find((option) => option.type === rule.type) : undefined;
}

async function loadTriggerOptionsFromRuleLibrary(): Promise<RuleLibraryTriggerOption[]> {
  try {
    const response = await getMarketingRuleTemplatesPaginated({
      page: 1,
      pageSize: 100,
      source: 'all',
      category: 'all',
      scenario: 'all',
      priority: 'all',
      status: 'all',
    });
    const templates = asArray(response.items ?? response.data)
      .filter((template) => SELECTABLE_RULE_TEMPLATE_STATUSES.has(template.status))
      .sort((a, b) => {
        const sourceWeight = (item: MarketingRuleTemplate) => (item.source === 'store' ? 0 : 1);
        const priorityWeight = (item: MarketingRuleTemplate) => Number(String(item.priority).replace('P', '')) || 9;
        return sourceWeight(a) - sourceWeight(b) || priorityWeight(a) - priorityWeight(b) || a.id - b.id;
      });

    if (templates.length) return templates.map(mapRuleTemplateToTriggerOption);
  } catch {
    // Fall back to the legacy trigger-option endpoint below.
  }

  const options = await getAutomationTriggerOptions();
  return asArray(options).map(normalizeTriggerOption);
}

export function CreateMarketing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'strategies' | 'rules'>('strategies');
  const [triggerOptions, setTriggerOptions] = useState<RuleLibraryTriggerOption[]>([]);
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
  const [previewCustomersOpen, setPreviewCustomersOpen] = useState(false);
  const [previewRequestSignature, setPreviewRequestSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [operatingId, setOperatingId] = useState<number | null>(null);
  const [copyContext, setCopyContext] = useState<MarketingCopyContext>({});
  const [generatingCopyIndex, setGeneratingCopyIndex] = useState<number | null>(null);
  const [autoGenerateCopyPending, setAutoGenerateCopyPending] = useState(false);
  const [promotionOptions, setPromotionOptions] = useState<Promotion[]>([]);

  const loadList = useCallback(async (nextKeyword: string, nextStatus: string) => {
    const [strategyResponse, automationEffects] = await Promise.all([
      getAutomationStrategiesPaginated({ page: 1, pageSize: 50, keyword: nextKeyword || undefined, status: nextStatus }),
      getAutomationEffects(),
    ]);
    setStrategies(asArray(strategyResponse.items ?? strategyResponse.data).map(normalizeStrategy));
    setEffects(asArray(automationEffects));
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const options = await loadTriggerOptionsFromRuleLibrary();
        setTriggerOptions(options);
        await loadList('', 'all');
      } catch {
        setLoadError('自动触达数据加载失败，请稍后重试。');
      } finally {
        setLoading(false);
      }
    };
    void loadInitial();
  }, [loadList]);

  useEffect(() => {
    getPromotionsPaginated({ page: 1, pageSize: 80, status: 'active', approvalStatus: 'approved' })
      .then((result) => setPromotionOptions(result.items ?? result.data ?? []))
      .catch(() => setPromotionOptions([]));
  }, []);

  useEffect(() => {
    if (!triggerOptions.length || !searchParams.get('name')) return;
    const next = emptyForm();
    next.name = searchParams.get('name') || '';
    next.description = searchParams.get('desc') || '';
    if (searchParams.get('sourceRecommendationId')) {
      next.source = 'recommendation';
    }
    const nextContext: MarketingCopyContext = {
      targetAudience: searchParams.get('targetAudience') || undefined,
      offer: searchParams.get('offer') || undefined,
      strategyText: searchParams.get('strategyText') || undefined,
      sourceRecommendationId: searchParams.get('sourceRecommendationId') || undefined,
      predictionRunId: searchParams.get('predictionRunId') || undefined,
      attribution: parseJsonParam<Record<string, unknown> | undefined>(searchParams.get('attribution'), undefined),
      sourceSignals: parseJsonParam<string[]>(searchParams.get('sourceSignals'), []),
      recommendedItems: parseJsonParam<string[]>(searchParams.get('recommendedItems'), []),
    };
    next.attribution = nextContext.attribution ?? (nextContext.sourceRecommendationId ? {
      source: 'recommendation',
      sourceRecommendationId: nextContext.sourceRecommendationId,
      predictionRunId: nextContext.predictionRunId,
      sourceSignals: nextContext.sourceSignals ?? [],
      recommendedItems: nextContext.recommendedItems ?? [],
      targetAudience: nextContext.targetAudience,
      offer: nextContext.offer,
    } : undefined);
    const type = searchParams.get('trigger') as MarketingTriggerType | null;
    const option = triggerOptions.find((item) => item.type === type);
    if (option) {
      const rule = createTriggerRuleFromOption(option);
      try {
        const triggerParams = JSON.parse(searchParams.get('triggerParams') || '{}') as Record<string, MarketingParamValue>;
        next.triggerRules = [{
          ...rule,
          params: { ...rule.params, ...triggerParams },
          parameterSource: Object.keys(triggerParams).length ? 'system_default' : rule.parameterSource,
        }];
        next.ruleTemplateId = option.ruleTemplateId;
        next.ruleTemplateVersion = option.ruleTemplateVersion;
      } catch {
        next.triggerRules = [rule];
        next.ruleTemplateId = option.ruleTemplateId;
        next.ruleTemplateVersion = option.ruleTemplateVersion;
      }
    }
    try {
      const actions = JSON.parse(searchParams.get('actions') || '[]') as Array<{
        type: MarketingAction['type'];
        value: string;
        promotionId?: number;
        promotionName?: string;
      }>;
      const channels = searchParams.get('channels')?.split(',').filter(Boolean) || [];
      next.actions = actions.map((action, index) => ({
        ...action,
        channel: (channels[index] || channels[0] || 'miniapp') as MarketingAction['channel'],
        contentTemplate: buildFallbackCopy(
          next,
          { ...action, channel: (channels[index] || channels[0] || 'miniapp') as MarketingAction['channel'] },
          option,
          nextContext,
        ),
      }));
    } catch {
      next.actions = [];
    }
    setMode('create');
    setActiveTab('strategies');
    setForm(next);
    setCopyContext(nextContext);
    setPreview(null);
    setPreviewCustomersOpen(false);
    setPreviewRequestSignature('');
    const shouldAutoGenerate = searchParams.get('autoGenerate') === 'true' && next.actions.length > 0;
    setStep(shouldAutoGenerate ? 2 : 1);
    setShowEditor(true);
    setAutoGenerateCopyPending(shouldAutoGenerate);
    setSearchParams({}, { replace: true });
  }, [triggerOptions, searchParams, setSearchParams]);

  const effectByStrategy = useMemo(
    () => new Map(asArray(effects).map((item) => [item.strategyId, item])),
    [effects],
  );

  const openCreate = () => {
    setMode('create');
    setSelected(null);
    setForm(emptyForm());
    setCopyContext({});
    setPreview(null);
    setPreviewCustomersOpen(false);
    setPreviewRequestSignature('');
    setStep(1);
    setShowEditor(true);
  };

  const openEdit = (strategy: MarketingAutomationStrategy) => {
    setMode('edit');
    setSelected(normalizeStrategy(strategy));
    setForm(createForm(strategy));
    setCopyContext({});
    setPreview(null);
    setPreviewCustomersOpen(false);
    setPreviewRequestSignature('');
    setStep(1);
    setShowEditor(true);
  };

  const openCopy = (strategy: MarketingAutomationStrategy) => {
    const next = createForm(strategy);
    next.name = `${next.name}（副本）`;
    setMode('create');
    setSelected(null);
    setForm(next);
    setCopyContext({});
    setPreview(null);
    setPreviewCustomersOpen(false);
    setPreviewRequestSignature('');
    setStep(1);
    setShowEditor(true);
  };

  const openDetail = async (strategy: MarketingAutomationStrategy) => {
    setSelected(normalizeStrategy(strategy));
    setShowDetail(true);
    const response = await getAutomationExecutionsPaginated({ page: 1, pageSize: 5, strategyId: strategy.id });
    setExecutions(asArray(response.items ?? response.data));
  };

  const selectRule = (option: RuleLibraryTriggerOption | undefined) => {
    const nextRule = option ? createTriggerRuleFromOption(option) : undefined;
    const templateActions = option?.recommendedActions?.length ? option.recommendedActions.map((action) => ({ ...action })) : [];
    setForm((current) => ({
      ...current,
      source: option?.ruleTemplateId ? 'rule_library' : 'manual',
      ruleTemplateId: option?.ruleTemplateId,
      ruleTemplateVersion: option?.ruleTemplateVersion,
      executionTime: option?.scheduleDefault?.time || current.executionTime,
      ruleRelation: 'AND',
      triggerRules: nextRule
        ? [{
            ...nextRule,
            parameterSource: option?.ruleTemplateSource === 'store' ? 'customized' : 'system_default',
          }]
        : [],
      actions: templateActions.length ? templateActions : current.actions,
    }));
    setPreview(null);
    setPreviewCustomersOpen(false);
    setPreviewRequestSignature('');
  };

  const setRuleParam = (type: MarketingTriggerType, key: string, value: MarketingParamValue) => {
    setForm((current) => ({
      ...current,
      triggerRules: current.triggerRules.map((rule) =>
        rule.type === type ? customizeTriggerRule(rule, key, value) : rule
      ),
    }));
    setPreview(null);
    setPreviewCustomersOpen(false);
    setPreviewRequestSignature('');
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

  const selectPromotionForAction = (index: number, promotionIdText: string) => {
    const promotionId = promotionIdText ? Number(promotionIdText) : undefined;
    const promotion = promotionOptions.find((item) => item.id === promotionId);
    updateAction(index, promotion ? {
      promotionId: promotion.id,
      promotionName: promotion.name,
      value: promotion.discountText,
      type: promotion.type === 'gift' || promotion.type === 'member_privilege' ? 'gift' : promotion.type === 'percentage_off' ? 'discount' : 'coupon',
    } : {
      promotionId: undefined,
      promotionName: undefined,
    });
  };

  const selectedRule = form.triggerRules[0];
  const selectedOption = findOptionForRule(triggerOptions, selectedRule, form.ruleTemplateId);
  const selectedRuleKey = selectedOption ? optionKey(selectedOption) : '';
  const previewSamples = asArray(preview?.samples);
  const previewMetricValues = {
    reached: previewLoading && !preview ? '预估中...' : `${preview?.estimatedReachedCount ?? preview?.total ?? 0} 人`,
    converted: previewLoading && !preview ? '预估中...' : `${preview?.estimatedConvertedCount ?? 0} 人`,
    revenue: previewLoading && !preview ? '预估中...' : `¥${Number(preview?.estimatedRevenue ?? 0).toLocaleString()}`,
  };

  const generateActionCopy = useCallback(async (index: number) => {
    const action = form.actions[index];
    if (!action) return;
    setGeneratingCopyIndex(index);
    try {
      const text = await generateCopyTextForAction(form, action, selectedOption, copyContext);
      updateAction(index, { contentTemplate: text });
      toast.success('AI 文案已生成');
    } catch (error) {
      updateAction(index, { contentTemplate: buildFallbackCopy(form, action, selectedOption, copyContext) });
      toast.warning(error instanceof Error ? `AI 文案生成失败，已使用兜底文案：${error.message}` : 'AI 文案生成失败，已使用兜底文案');
    } finally {
      setGeneratingCopyIndex(null);
    }
  }, [copyContext, form, selectedOption]);

  const generateAllActionCopies = useCallback(async (baseForm: StrategyForm, context: MarketingCopyContext, option?: MarketingTriggerOption) => {
    if (!baseForm.actions.length) return;
    setGeneratingCopyIndex(-1);
    try {
      const generatedActions = await Promise.all(baseForm.actions.map(async (action) => {
        try {
          return {
            ...action,
            contentTemplate: await generateCopyTextForAction(baseForm, action, option, context),
          };
        } catch {
          return {
            ...action,
            contentTemplate: buildFallbackCopy(baseForm, action, option, context),
          };
        }
      }));
      setForm((current) => ({ ...current, actions: generatedActions }));
      toast.success('已根据智能推荐自动生成触达文案');
    } finally {
      setGeneratingCopyIndex(null);
    }
  }, []);

  useEffect(() => {
    if (!autoGenerateCopyPending || !showEditor || step !== 2 || !form.actions.length) return;
    setAutoGenerateCopyPending(false);
    void generateAllActionCopies(form, copyContext, selectedOption);
  }, [autoGenerateCopyPending, copyContext, form, generateAllActionCopies, selectedOption, showEditor, step]);

  const previewSignature = useMemo(
    () => JSON.stringify({
      strategyId: selected?.id ?? 'draft',
      triggerRules: form.triggerRules,
      ruleRelation: form.ruleRelation,
    }),
    [form.ruleRelation, form.triggerRules, selected?.id],
  );

  const handlePreview = useCallback(async (options?: { silent?: boolean }) => {
    if (!form.triggerRules.length) {
      if (!options?.silent) toast.error('请至少选择一个提醒条件');
      return;
    }
    setPreviewLoading(true);
    setPreviewCustomersOpen(false);
    setPreviewRequestSignature(previewSignature);
    try {
      const response = await previewAutomationAudience(selected?.id || 'draft', {
        triggerRules: form.triggerRules,
        ruleRelation: form.ruleRelation,
      });
      setPreview(normalizePreview(response));
    } catch {
      if (!options?.silent) toast.error('命中客户预估失败');
    } finally {
      setPreviewLoading(false);
    }
  }, [form.ruleRelation, form.triggerRules, previewSignature, selected?.id]);

  useEffect(() => {
    if (!showEditor || step !== 3 || !form.triggerRules.length || previewLoading) return;
    if (previewRequestSignature === previewSignature) return;
    void handlePreview({ silent: true });
  }, [form.triggerRules.length, handlePreview, previewLoading, previewRequestSignature, previewSignature, showEditor, step]);

  const validateForm = () => {
    if (!form.name.trim()) return '请输入触达名称';
    if (!form.triggerRules.length) return '请至少选择一个提醒条件';
    if (!form.actions.length || form.actions.some((action) => !action.value.trim())) return '请配置至少一项完整触达动作';
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
        toast.success('自动触达已更新');
      } else if (draft) {
        await saveAutomationStrategyDraft(payload);
        toast.success('已保存为草稿');
      } else {
        await createAutomationStrategy(payload);
        toast.success('自动触达已创建并启用');
      }
      setShowEditor(false);
      await loadList(keyword, status);
    } catch {
      toast.error('自动触达保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (strategy: MarketingAutomationStrategy) => {
    setOperatingId(strategy.id);
    try {
      if (strategy.status === 'enabled') {
        await pauseAutomationStrategy(strategy.id);
        toast.success('自动触达已暂停');
      } else {
        await enableAutomationStrategy(strategy.id);
        toast.success('自动触达已启用');
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
    if (!window.confirm(`确认删除自动触达“${strategy.name}”吗？`)) return;
    setOperatingId(strategy.id);
    try {
      await deleteAutomationStrategy(strategy.id);
      toast.success('自动触达已删除');
      await loadList(keyword, status);
    } catch {
      toast.error('删除失败');
    } finally {
      setOperatingId(null);
    }
  };

  if (loading) {
    return <div className="flex h-72 items-center justify-center text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载自动触达...</div>;
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
          <h1 className="text-xl font-semibold text-gray-900">自动触达</h1>
          <p className="mt-1 text-sm text-gray-500">让系统按客户状态自动提醒，并把需要人工处理的机会交给门店跟进。</p>
        </div>
        {activeTab === 'strategies' && (
          <Button variant="outline" onClick={() => setActiveTab('rules')}>
            从规则模板新建
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-1">
        {[
          { id: 'strategies' as const, label: '运行策略', desc: '已启用、草稿和暂停的自动触达' },
          { id: 'rules' as const, label: '规则模板', desc: '先选模板，再生成自动触达' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex min-w-[180px] flex-col rounded-md px-4 py-3 text-left transition-colors ${
              activeTab === tab.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="text-sm font-medium">{tab.label}</span>
            <span className="mt-0.5 text-xs text-gray-500">{tab.desc}</span>
          </button>
        ))}
      </div>

      {activeTab === 'rules' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-blue-900">从规则模板创建触达</div>
              <div className="mt-1 text-xs text-blue-700">建议优先启用系统推荐或门店自定义规则；需要临时触达时，也可以新建一条触达策略。</div>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新建触达
            </Button>
          </div>
          <MarketingRuleLibrary embedded />
        </div>
      ) : (
        <>

      <div className="grid grid-cols-3 gap-4">
        <Stat title="触达总数" value={strategies.length} icon={<Sparkles className="h-5 w-5 text-blue-600" />} />
        <Stat title="启用中" value={strategies.filter((item) => item.status === 'enabled').length} icon={<Play className="h-5 w-5 text-green-600" />} />
        <Stat title="预计覆盖客户" value={strategies.filter((item) => item.status === 'enabled').reduce((sum, item) => sum + item.targetCount, 0)} icon={<Users className="h-5 w-5 text-purple-600" />} />
      </div>

      <div className="flex items-center gap-3 border-y border-gray-200 py-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索触达名称" className="pl-9" />
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
        <div className="flex h-48 flex-col items-center justify-center gap-3 border border-dashed border-gray-300 text-sm text-gray-500">
          <Target className="mb-3 h-8 w-8 text-gray-300" />
          <div>暂无符合条件的自动触达</div>
          <Button variant="outline" size="sm" onClick={() => setActiveTab('rules')}>
            去规则模板创建
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>规则</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>提醒条件</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>覆盖客户</TableHead>
              <TableHead>效果</TableHead>
              <TableHead className="w-56">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {asArray(strategies).map((strategy) => {
              const effect = effectByStrategy.get(strategy.id);
              return (
                <TableRow key={strategy.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{strategy.name}</div>
                  </TableCell>
                  <TableCell className="max-w-72 text-xs leading-relaxed text-gray-500">
                    {strategy.description || '-'}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {strategy.source ? STRATEGY_SOURCE_LABEL[strategy.source] ?? strategy.source : '手动创建'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {asArray(strategy.triggerRules).map((rule) => (
                        <span key={rule.type} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                          {findOptionForRule(triggerOptions, rule, strategy.ruleTemplateId)?.label || rule.type}
                        </span>
                      ))}
                      <span className="text-xs text-gray-400">{strategy.ruleRelation}</span>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={strategy.status} /></TableCell>
                  <TableCell className="font-medium text-gray-900">{strategy.targetCount} 人</TableCell>
                  <TableCell className="text-xs text-gray-600">
                    <div>回店率 {effect?.returnRate || '-'}</div>
                    <div className="mt-1">回报 {effect?.roi || '-'}</div>
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
          <DialogHeader><DialogTitle>{mode === 'create' ? '新建自动触达' : '编辑自动触达'}</DialogTitle></DialogHeader>
          <span id="strategy-editor-description" className="sr-only">配置提醒条件、触达动作和执行方式</span>
          {copyContext.sourceRecommendationId && (
            <div className="mb-4 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              来自营销工作台推荐，已带入建议客户、权益和触达文案，可直接确认后启用。
            </div>
          )}
          <div className="mb-5 flex gap-6 border-b border-gray-200 pb-3 text-sm">
            {['什么时候提醒', '怎么联系客户', '覆盖多少客户'].map((label, index) => (
              <span key={label} className={step === index + 1 ? 'font-medium text-blue-600' : 'text-gray-400'}>
                {index + 1}. {label}
              </span>
            ))}
          </div>
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <label className="text-sm text-gray-600">触达名称<Input className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label className="text-sm text-gray-600">执行方式
                  <select className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" value={form.executionType} onChange={(event) => setForm({ ...form, executionType: event.target.value as 'auto' | 'manual' })}>
                    <option value="auto">自动执行</option>
                    <option value="manual">手动执行</option>
                  </select>
                </label>
                <label className="text-sm text-gray-600">执行时间<Input type="time" className="mt-1" value={form.executionTime} onChange={(event) => setForm({ ...form, executionTime: event.target.value })} /></label>
              </div>
              <label className="block text-sm text-gray-600">触达说明
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" rows={2} />
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-800">
                  什么时候提醒
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800"
                    value={selectedRuleKey}
                    onChange={(event) => selectRule(findOptionByKey(triggerOptions, event.target.value))}
                  >
                    <option value="">请选择一个触发场景</option>
                    {(['时间触发', '行为触发', '属性触发'] as const).map((category) => (
                      <optgroup key={category} label={category}>
                        {triggerOptions.filter((option) => option.category === category).map((option) => (
                          <option key={optionKey(option)} value={optionKey(option)}>
                            {option.ruleTemplateSource === 'store' ? `${option.label}（我的规则）` : option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {selectedOption && (
                  <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-blue-900">{selectedOption.label}</div>
                      <span className="rounded bg-white px-2 py-0.5 text-xs text-blue-700">{selectedOption.priority}</span>
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-blue-700">{selectedOption.description}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-blue-700">
                      <span className="rounded bg-white px-2 py-0.5">
                        来源：{selectedOption.ruleTemplateSource === 'store' ? '规则库 / 我的规则' : selectedOption.ruleTemplateId ? '规则库 / 系统推荐' : '内置兜底'}
                      </span>
                      {selectedOption.scenario && <span className="rounded bg-white px-2 py-0.5">场景：{selectedOption.scenario}</span>}
                      {selectedOption.ruleTemplateStatus && <span className="rounded bg-white px-2 py-0.5">状态：{selectedOption.ruleTemplateStatus === 'enabled' ? '已启用' : '推荐'}</span>}
                    </div>
                  </div>
                )}
              </div>
              {asArray(form.triggerRules).map((rule) => {
                const option = findOptionForRule(triggerOptions, rule, form.ruleTemplateId);
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
                      {asArray(option.paramSchema).map((field) => (
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
                <h3 className="text-sm font-medium text-gray-800">怎么联系客户</h3>
                <Button variant="outline" size="sm" onClick={addAction}><Plus className="mr-1 h-3.5 w-3.5" />添加动作</Button>
              </div>
              {form.actions.length === 0 && <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">请添加优惠或触达动作</div>}
              {asArray(form.actions).map((action, index) => (
                <div key={index} className="space-y-3 rounded-md border border-gray-200 p-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">关联权益资产</label>
                    <select
                      value={action.promotionId ?? ''}
                      onChange={(event) => selectPromotionForAction(index, event.target.value)}
                      className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                    >
                      <option value="">不关联权益资产，手动填写动作内容</option>
                      {promotionOptions.map((promotion) => (
                        <option key={promotion.id} value={promotion.id}>
                          {promotion.name}｜{promotion.discountText}
                        </option>
                      ))}
                    </select>
                  </div>
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
                      <button
                        type="button"
                        className="flex items-center gap-1 text-blue-600 disabled:opacity-50"
                        disabled={generatingCopyIndex !== null}
                        onClick={() => void generateActionCopy(index)}
                      >
                        <WandSparkles className={`h-3.5 w-3.5 ${generatingCopyIndex === index || generatingCopyIndex === -1 ? 'animate-spin' : ''}`} />
                        {generatingCopyIndex === index || generatingCopyIndex === -1 ? '生成中' : '生成文案'}
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
                  <div>触达名称：<span className="font-medium text-gray-900">{form.name || '-'}</span></div>
                  <div>执行方式：<span className="font-medium text-gray-900">{form.executionType === 'auto' ? '自动执行' : '手动执行'}</span></div>
                  <div>提醒条件：<span className="font-medium text-gray-900">{selectedOption?.label || '-'}</span></div>
                  <div>触达动作：<span className="font-medium text-gray-900">{form.actions.length} 项</span></div>
                </div>
              </div>
              <div className="space-y-3 rounded-md border border-blue-100 bg-blue-50/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    {previewLoading ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <Target className="h-4 w-4 text-blue-600" />}
                    预估命中客户
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void handlePreview()} disabled={previewLoading}>
                      重新预估
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewCustomersOpen((open) => !open)}
                      disabled={previewLoading || !preview}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      {previewCustomersOpen ? '收起用户' : '查看用户'}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Metric title="预计触达" value={previewMetricValues.reached} />
                  <Metric title="预计转化" value={previewMetricValues.converted} />
                  <Metric title="预计收入" value={previewMetricValues.revenue} />
                </div>
                {!preview && !previewLoading && (
                  <div className="rounded-md bg-white px-3 py-2 text-sm text-gray-500">暂未获取预估结果，可点击“重新预估”。</div>
                )}
                {previewCustomersOpen && (
                  previewSamples.length === 0 ? (
                    <div className="rounded-md bg-white py-5 text-center text-sm text-gray-500">当前规则没有命中客户，请调整参数后重试。</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>会员等级</TableHead><TableHead>预测转化</TableHead><TableHead>LTV层级</TableHead><TableHead>预计收入</TableHead><TableHead>命中原因</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {previewSamples.map((customer) => (
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
                  )
                )}
              </div>
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
          <DialogHeader><DialogTitle>自动触达详情</DialogTitle></DialogHeader>
          <span id="strategy-detail-description" className="sr-only">查看触发参数、效果与执行记录</span>
          {selected && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900">{selected.name}</h3>
                <StatusBadge status={selected.status} />
              </div>
              <p className="text-sm text-gray-600">{selected.description}</p>
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-800">提醒条件</h4>
                <div className="space-y-2">
                  {asArray(selected.triggerRules).map((rule) => (
                    <RuleParamSummary
                      key={rule.type}
                      rule={rule}
                      option={findOptionForRule(triggerOptions, rule, selected.ruleTemplateId)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium text-gray-800">触达配置</h4>
                {asArray(selected.actions).map((action, index) => (
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
                {asArray(executions).length === 0 ? <div className="text-sm text-gray-400">暂无执行记录</div> : asArray(executions).map((execution) => (
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
        </>
      )}
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

function RuleParamSummary({
  rule,
  option,
}: {
  rule: MarketingTriggerRule;
  option?: RuleLibraryTriggerOption;
}) {
  return (
    <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
      <span className="font-medium">{option?.label || rule.type}</span>
      <span className="ml-3 text-blue-600">{formatMarketingRuleParams(rule, option)}</span>
    </div>
  );
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
