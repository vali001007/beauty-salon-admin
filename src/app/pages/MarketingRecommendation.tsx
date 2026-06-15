import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowDownUp,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { CreateActivityDialog } from '../components/CreateActivityDialog';
import { ActivityMiniPage, type ActivityPageData } from '../components/ActivityMiniPage';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { generateActivityPage, generateMarketingCopy } from '@/api/ai';
import { getCustomerConsumptionRecords, getCustomerHealthProfiles, getCustomersPaginated } from '@/api/customer';
import {
  batchCreateMarketingFollowUpTasks,
  createMarketingActivity,
  getMarketingFollowUpTasks,
  getMarketingFollowUpTaskSummary,
  runPredictions,
} from '@/api/marketing';
import { createMarketingPage, publishMarketingPage } from '@/api/marketingPage';
import { getMarketingRecommendationAudience, getMarketingRecommendations } from '@/api/recommendation';
import type { Customer } from '@/types';
import type { ActivityPageSchema, MarketingCopyChannel } from '@/types/ai';
import type { TerminalFollowUpTask, TerminalFollowUpTaskSummary } from '@/types/terminal';
import type { Recommendation, UrgencyLevel } from '@/utils/marketingRecommendation';
import { computeBehaviorProfiles, type BehaviorProfile } from '@/utils/customerSegmentation';
import { buildMarketingPagePayloadFromActivity } from '@/utils/marketingPageGenerator';

type SelectedCustomerGroup = {
  recommendation: Recommendation;
  profiles: AudienceProfile[];
};

type FollowUpRecordGroup = {
  recommendation: Recommendation;
  items: TerminalFollowUpTask[];
  total: number;
};

type AudienceSortKey = 'churnScore' | 'repurchaseRate' | 'promotionSensitivity' | 'visitCount' | 'avgSpend';

type AudienceProfile = BehaviorProfile & {
  phone?: string;
  storeName?: string;
  lastVisitDate?: string;
  totalSpentValue?: number;
  churnScore?: number;
  repurchase30dScore?: number;
  marketingResponseScore?: number;
  visitCountValue?: number;
  avgSpendValue?: number;
};

type RecommendationPriorityFilterId = 'all' | UrgencyLevel;
type RecommendationTypeFilterId = 'all' | 'customer' | 'product' | 'project' | 'capacity';

type PreviewInitialData = {
  title?: string;
  description?: string;
  targetCustomers?: string;
  discount?: string;
  strategy?: string;
  image?: string;
  category?: string;
  duration?: string;
  displayProjectName?: string;
  originalTitle?: string;
  originalDescription?: string;
  aiGenerated?: string;
  sourceRecommendationId?: string;
  aiGenerationId?: string;
  aiPromptTemplateVersion?: string;
  predictionRunId?: string;
  preferredMode?: string;
  executionModes?: string;
  triggerType?: string;
  triggerRuleJson?: string;
  audienceSnapshotJson?: string;
  recommendedChannelsJson?: string;
  recommendedItemsJson?: string;
  offerJson?: string;
  sourceSignalsJson?: string;
  inventorySnapshotJson?: string;
  capacitySnapshotJson?: string;
  riskWarningsJson?: string;
  pageSchema?: ActivityPageSchema;
  [key: string]: string | ActivityPageSchema | undefined;
};

type RecommendationAudiencePayload = Partial<BehaviorProfile> & {
  customerId: number;
  name: string;
  phone?: string | null;
  storeName?: string | null;
  segment?: string;
  skinType?: string | null;
  visitCount?: number;
  totalSpent?: number;
  lastVisitDate?: string | null;
  matchReason?: string;
  churnScore?: number;
  repurchase30dScore?: number;
  marketingResponseScore?: number;
  ltvTier?: string;
};

const LEVEL_COLORS: Record<string, string> = {
  '高价值客户': 'bg-purple-100 text-purple-700',
  '潜在价值客户': 'bg-blue-100 text-blue-600',
  '稳定客户': 'bg-green-100 text-green-700',
  '流失风险客户': 'bg-red-100 text-red-600',
  '新客户': 'bg-yellow-100 text-yellow-700',
};

const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  in_progress: '处理中',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已逾期',
};

const FOLLOW_UP_RESULT_LABELS: Record<string, string> = {
  contacted: '已联系',
  booked: '已预约',
  not_reached: '未接通',
  refused: '客户拒绝',
  converted: '已成交',
};

const FOLLOW_UP_ROLE_LABELS: Record<string, string> = {
  manager: '店长',
  consultant: '顾问/美容师',
  reception: '前台',
};

const formatFollowUpDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function buildRecommendationRecoveryCard(totalCustomers = 0): Recommendation {
  return {
    id: -1,
    title: '算法数据恢复推荐',
    reason: '当前推荐算法暂未拿到完整预测结果，系统先提供一张可创建活动的恢复卡，避免运营流程中断。请检查客户数据、预测批次或后端迁移后再次刷新。',
    targetCustomers: `待分析客户 ${totalCustomers} 人`,
    targetCount: 0,
    targetCustomerIds: [],
    expectedConversion: '预计转化率 待计算',
    expectedRevenue: '预计营收 待计算',
    strategy: '先创建一次性活动承接门店权益；算法恢复后，再按节假日、次卡到期、优惠券到期和小程序行为生成精准自动规则。',
    discount: '门店专属权益',
    duration: '建议周期: 7天',
    matchScore: 60,
    image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400',
    tags: ['算法恢复', '数据接入'],
    category: 'high-conversion',
    source: 'strategy',
    preferAutoRule: false,
    urgency: 'recommended',
    urgencyLabel: '推荐',
    dataEvidence: ['推荐接口返回为空或预测运行失败，已启用前端恢复卡'],
    totalCustomers,
    modelVersion: 'rules-v2',
    predictionType: 'strategy',
    priority: 'P2',
    executionModes: ['activity'],
    preferredMode: 'activity',
    modeReason: '缺少稳定预测名单时优先创建一次性活动，避免自动规则误触达。',
    recommendedChannels: [
      { channel: 'miniapp', label: '小程序', reason: '用于活动页、领券和预约入口承接。', priority: 'P0' },
      { channel: 'wechat', label: '微信', reason: '适合顾问跟进和解释权益。', priority: 'P1' },
    ],
    offer: { type: 'member_privilege', label: '门店专属权益', validDays: 7, reason: '算法恢复期间使用低风险权益承接。' },
    recommendedItems: [
      { type: 'project', name: '会员护理推荐方案', category: '面部护理', reason: '算法恢复期间先使用门店通用护理方案承接。', confidence: 60 },
    ],
    audienceSnapshot: {
      generatedAt: new Date().toISOString(),
      ruleSummary: '算法恢复卡未固化客户名单',
      customerIds: [],
      totalCustomers: 0,
      sampleReasons: [],
    },
    sourceSignals: ['frontend_recovery', 'algorithm_unavailable'],
    isFallback: true,
  };
}

function ProgressMetric({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-700">{value}</span>
      <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-gray-800" style={{ width: value?.endsWith('%') ? value : '0%' }} />
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function scoreToPercent(value: unknown, fallback = '0%') {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return `${Math.max(0, Math.min(100, Math.round(score)))}%`;
}

function ltvTierToLoyalty(tier?: string) {
  if (tier === '铂金') return '95%';
  if (tier === '黄金') return '82%';
  if (tier === '白银') return '65%';
  if (tier === '青铜') return '45%';
  return '50%';
}

function parseJsonField<T>(value?: string): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function getChannelText(rec: Recommendation) {
  return rec.recommendedChannels?.slice(0, 3).map((item) => item.label).join('、') || '小程序、短信';
}

function getTerminalFollowUpDueAt() {
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 1);
  dueAt.setHours(20, 0, 0, 0);
  return dueAt.toISOString();
}

function buildTerminalFollowUpScript(rec: Recommendation) {
  const offer = rec.offer?.label || rec.discount || '门店专属护理权益';
  const itemText = rec.recommendedItems?.[0]?.name ? `，可优先推荐${rec.recommendedItems[0].name}` : '';
  return `客户命中「${rec.title}」。建议先确认近期护理需求，再介绍${offer}${itemText}；如客户有兴趣，引导预约到店并备注肤况/时间偏好。`;
}

function buildTerminalFollowUpNote(rec: Recommendation) {
  return `智能营销下发客户增长跟进：${rec.reason}`;
}

function getTerminalFollowUpActionState(rec: Recommendation) {
  const executionModes = rec.executionModes ?? (rec.preferAutoRule ? ['automation'] : ['activity']);
  const channels = rec.recommendedChannels ?? [];
  const actions = rec.recommendedActions ?? [];
  const hasAdvisorTask = executionModes.includes('advisor_task');
  const isAdvisorPreferred = rec.preferredMode === 'advisor_task';
  const hasStoreChannel = channels.some((item) => item.channel === 'store' || item.label?.includes('顾问'));
  const hasConsultantAction = actions.some((item) => item.type === 'consultant_task');
  const hasRisk = Boolean(rec.riskWarnings?.length);
  const urgentBusinessSource =
    rec.urgency === 'urgent' && ['churn', 'ltv', 'inventory', 'capacity', 'product', 'project'].includes(rec.source);
  const visible = hasAdvisorTask || isAdvisorPreferred || hasStoreChannel || hasConsultantAction || hasRisk || urgentBusinessSource;
  const disabled = rec.isFallback || !rec.targetCustomerIds?.length;
  const reasons = [
    isAdvisorPreferred ? '算法首选门店人工跟进' : '',
    hasAdvisorTask && !isAdvisorPreferred ? '推荐执行方式包含顾问任务' : '',
    hasStoreChannel ? '推荐渠道包含门店顾问跟进' : '',
    hasConsultantAction ? '推荐动作包含顾问跟进任务' : '',
    hasRisk ? '存在需要人工解释的风险提示' : '',
    urgentBusinessSource ? '紧急经营机会需要门店确认' : '',
  ].filter(Boolean);
  return {
    visible,
    primary: isAdvisorPreferred || (hasAdvisorTask && rec.urgency === 'urgent'),
    disabled,
    reason: disabled
      ? rec.isFallback
        ? '样例建议不下发真实终端任务'
        : '暂无可下发客户名单'
      : reasons[0] || '需要门店人员一对一确认',
    confidence: Math.min(100, 60 + [hasAdvisorTask, isAdvisorPreferred, hasStoreChannel, hasConsultantAction, hasRisk, urgentBusinessSource].filter(Boolean).length * 8),
  };
}

function getFollowUpAssignmentPreview(rec: Recommendation) {
  const text = [rec.recommendationType, rec.triggerType, rec.source, rec.title, rec.reason].filter(Boolean).join(' ');
  if (/expiry|inventory|stock|capacity|临期|库存|低峰|排期|产能|补货/.test(text)) {
    return {
      role: 'manager',
      roleLabel: '店长',
      reason: '涉及库存、排期或经营协调，先由店长把控口径和分派节奏。',
    };
  }
  if (/booking|appointment|reservation|预约|浏览|放弃|到店/.test(text)) {
    return {
      role: 'reception',
      roleLabel: '前台',
      reason: '属于预约确认或高意向邀约，前台先确认时间更高效。',
    };
  }
  return {
    role: 'consultant',
    roleLabel: '顾问/美容师',
    reason: '属于客户关系维护，优先由熟悉客户的顾问或美容师跟进。',
  };
}

function normalizeAudienceProfiles(profiles: RecommendationAudiencePayload[]): AudienceProfile[] {
  return profiles.map((profile) => {
    const visitCount = Number(profile.visitCount ?? 0);
    const totalSpent = Number(profile.totalSpent ?? 0);
    const churnScore = Number(profile.churnScore ?? 0);
    const repurchase30dScore = Number(profile.repurchase30dScore ?? 0);
    const marketingResponseScore = Number(profile.marketingResponseScore ?? 0);
    const avgSpendValue = visitCount > 0 ? totalSpent / visitCount : totalSpent;
    const avgSpend = visitCount > 0 ? formatMoney(totalSpent / visitCount) : totalSpent > 0 ? `累计 ${formatMoney(totalSpent)}` : '暂无消费';

    return {
      customerId: profile.customerId,
      name: profile.name,
      phone: profile.phone || '',
      storeName: profile.storeName || '',
      lastVisitDate: profile.lastVisitDate || '',
      segment: (profile.segment || '普通会员') as BehaviorProfile['segment'],
      skinType: (profile.skinType || '未分类') as BehaviorProfile['skinType'],
      visitFrequency: profile.visitFrequency || (visitCount > 0 ? `${visitCount}次到店` : '暂无到店记录'),
      avgSpend: profile.avgSpend || avgSpend,
      preferredService: profile.preferredService || profile.matchReason || '按预测模型命中',
      promotionSensitivity: profile.promotionSensitivity || scoreToPercent(marketingResponseScore),
      repurchaseRate: profile.repurchaseRate || scoreToPercent(repurchase30dScore),
      loyalty: profile.loyalty || ltvTierToLoyalty(profile.ltvTier),
      seasonalTrend: profile.seasonalTrend || (Number.isFinite(churnScore) ? `流失分 ${churnScore}` : profile.matchReason || '最新预测命中'),
      churnScore,
      repurchase30dScore,
      marketingResponseScore,
      visitCountValue: visitCount,
      totalSpentValue: totalSpent,
      avgSpendValue,
    };
  });
}

function percentTextToNumber(value?: string) {
  const score = Number(String(value ?? '').replace('%', ''));
  return Number.isFinite(score) ? score : 0;
}

function getRecommendationOpportunityType(rec: Recommendation): Exclude<RecommendationTypeFilterId, 'all'> {
  if (rec.source === 'inventory' || rec.source === 'product' || rec.recommendationType?.startsWith('product_')) return 'product';
  if (rec.source === 'capacity' || rec.recommendationType === 'project_idle_capacity') return 'capacity';
  if (rec.source === 'project' || rec.recommendationType?.startsWith('project_')) return 'project';
  return 'customer';
}

export function MarketingRecommendation() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumptionRecords, setConsumptionRecords] = useState<any[]>([]);
  const [healthProfiles, setHealthProfiles] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<RecommendationPriorityFilterId>('all');
  const [typeFilter, setTypeFilter] = useState<RecommendationTypeFilterId>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogInitialData, setCreateDialogInitialData] = useState<Record<string, string> | undefined>(undefined);
  const [previewInitialData, setPreviewInitialData] = useState<PreviewInitialData | undefined>(undefined);
  const [showMiniPreview, setShowMiniPreview] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [isPublishingPreview, setIsPublishingPreview] = useState(false);
  const [, setRefreshKey] = useState(0);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());
  const [selectedCustomerGroup, setSelectedCustomerGroup] = useState<SelectedCustomerGroup | null>(null);
  const [isAudienceLoading, setIsAudienceLoading] = useState(false);
  const [audienceSortKey, setAudienceSortKey] = useState<AudienceSortKey>('churnScore');
  const [followUpGroup, setFollowUpGroup] = useState<SelectedCustomerGroup | null>(null);
  const [isFollowUpAudienceLoading, setIsFollowUpAudienceLoading] = useState(false);
  const [followUpCheckedIds, setFollowUpCheckedIds] = useState<Set<number>>(new Set());
  const [isFollowUpSubmitting, setIsFollowUpSubmitting] = useState(false);
  const [followUpSummary, setFollowUpSummary] = useState<TerminalFollowUpTaskSummary | null>(null);
  const [followUpRecordGroup, setFollowUpRecordGroup] = useState<FollowUpRecordGroup | null>(null);
  const [isFollowUpRecordsLoading, setIsFollowUpRecordsLoading] = useState(false);

  const loadConsumptionRecordsInBackground = useCallback(async () => {
    try {
      const spendData = await getCustomerConsumptionRecords();
      setConsumptionRecords(spendData);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      toast.warning(error instanceof Error ? `消费画像加载较慢：${error.message}` : '消费画像加载较慢，客户名单将先显示基础画像');
    }
  }, []);

  const loadCustomerContextInBackground = useCallback(async () => {
    try {
      const [customerData, healthData] = await Promise.all([
        getCustomersPaginated({ page: 1, pageSize: 2000 }),
        getCustomerHealthProfiles(),
      ]);
      setCustomers(customerData.items.map((customer) => ({ ...customer, tags: customer.tags || [] })));
      setHealthProfiles(healthData);
      setRefreshKey((current) => current + 1);
      void loadConsumptionRecordsInBackground();
    } catch (error) {
      toast.warning(error instanceof Error ? `客户画像加载较慢：${error.message}` : '客户画像加载较慢，推荐结果已先展示');
    }
  }, [loadConsumptionRecordsInBackground]);

  const loadSourceData = useCallback(async (options: { refreshPredictions?: boolean } = {}) => {
    setIsLoading(true);
    try {
      if (options.refreshPredictions) {
        try {
          await runPredictions();
        } catch (predictionError) {
          toast.warning(
            predictionError instanceof Error
              ? `预测运行失败，已尝试加载现有推荐：${predictionError.message}`
              : '预测运行失败，已尝试加载现有推荐',
          );
        }
      }
      const recommendationData = await getMarketingRecommendations();
      setRecommendations(recommendationData.length ? recommendationData : [buildRecommendationRecoveryCard(customers.length)]);
      void getMarketingFollowUpTaskSummary()
        .then(setFollowUpSummary)
        .catch(() => setFollowUpSummary(null));
      if (!recommendationData.length) {
        toast.warning('推荐接口暂未返回卡片，已启用恢复推荐卡');
      }
      setRefreshKey((current) => current + 1);
      void loadCustomerContextInBackground();
    } catch (error) {
      setRecommendations((current) => (current.length ? current : [buildRecommendationRecoveryCard(customers.length)]));
      toast.error(error instanceof Error ? error.message : '推荐数据加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [customers.length, loadCustomerContextInBackground]);

  useEffect(() => {
    void loadSourceData();
  }, [loadSourceData]);

  const behaviorProfiles = useMemo(() => computeBehaviorProfiles(customers, consumptionRecords, healthProfiles), [customers, consumptionRecords, healthProfiles]);
  const sortedAudienceProfiles = useMemo(() => {
    const profiles = selectedCustomerGroup?.profiles ?? [];
    return [...profiles].sort((a, b) => {
      const valueOf = (profile: AudienceProfile) => {
        switch (audienceSortKey) {
          case 'repurchaseRate':
            return profile.repurchase30dScore ?? percentTextToNumber(profile.repurchaseRate);
          case 'promotionSensitivity':
            return profile.marketingResponseScore ?? percentTextToNumber(profile.promotionSensitivity);
          case 'visitCount':
            return profile.visitCountValue ?? Number(profile.visitFrequency.match(/\d+/)?.[0] ?? 0);
          case 'avgSpend':
            return profile.avgSpendValue ?? 0;
          case 'churnScore':
          default:
            return profile.churnScore ?? 0;
        }
      };
      return valueOf(b) - valueOf(a);
    });
  }, [audienceSortKey, selectedCustomerGroup?.profiles]);
  const selectedFollowUpProfiles = useMemo(
    () => (followUpGroup?.profiles ?? []).filter((profile) => followUpCheckedIds.has(profile.customerId)),
    [followUpCheckedIds, followUpGroup?.profiles],
  );
  const followUpScriptPreview = useMemo(
    () => (followUpGroup ? buildTerminalFollowUpScript(followUpGroup.recommendation) : ''),
    [followUpGroup],
  );
  const followUpActionPreview = useMemo(
    () => (followUpGroup ? getTerminalFollowUpActionState(followUpGroup.recommendation) : null),
    [followUpGroup],
  );
  const followUpAssignmentPreview = useMemo(
    () => (followUpGroup ? getFollowUpAssignmentPreview(followUpGroup.recommendation) : null),
    [followUpGroup],
  );

  const getFallbackAudienceProfiles = useCallback((rec: Recommendation) => {
    const targetIds = new Set(rec.targetCustomerIds);
    return targetIds.size
      ? behaviorProfiles.filter((profile) => targetIds.has(profile.customerId))
      : behaviorProfiles.slice(0, Math.min(rec.targetCount || 10, 10));
  }, [behaviorProfiles]);

  const loadAudienceProfilesForRecommendation = useCallback(async (rec: Recommendation) => {
    if (rec.id > 0) {
      try {
        const targetProfiles = await getMarketingRecommendationAudience(rec.id);
        return normalizeAudienceProfiles(targetProfiles as RecommendationAudiencePayload[]);
      } catch (error) {
        const fallbackProfiles = getFallbackAudienceProfiles(rec);
        if (fallbackProfiles.length) {
          toast.warning(error instanceof Error ? `推荐客户名单加载较慢，已使用本地客户画像：${error.message}` : '推荐客户名单加载较慢，已使用本地客户画像');
          return fallbackProfiles;
        }
        throw error;
      }
    }
    return getFallbackAudienceProfiles(rec);
  }, [getFallbackAudienceProfiles]);

  const recommendationsForPriorityFilter = typeFilter === 'all'
    ? recommendations
    : recommendations.filter((rec) => getRecommendationOpportunityType(rec) === typeFilter);
  const recommendationsForTypeFilter = priorityFilter === 'all'
    ? recommendations
    : recommendations.filter((rec) => rec.urgency === priorityFilter);
  const priorityFilters: Array<{ id: RecommendationPriorityFilterId; label: string; count: number; dotClass?: string }> = [
    { id: 'all', label: '全部优先级', count: recommendationsForPriorityFilter.length },
    { id: 'urgent', label: '紧急', count: recommendationsForPriorityFilter.filter((r) => r.urgency === 'urgent').length, dotClass: 'bg-red-500' },
    { id: 'recommended', label: '推荐', count: recommendationsForPriorityFilter.filter((r) => r.urgency === 'recommended').length, dotClass: 'bg-yellow-500' },
    { id: 'opportunity', label: '机会', count: recommendationsForPriorityFilter.filter((r) => r.urgency === 'opportunity').length, dotClass: 'bg-green-500' },
  ];
  const typeFilters: Array<{ id: RecommendationTypeFilterId; label: string; count: number }> = [
    { id: 'all', label: '全部类型', count: recommendationsForTypeFilter.length },
    { id: 'customer', label: '客户机会', count: recommendationsForTypeFilter.filter((r) => getRecommendationOpportunityType(r) === 'customer').length },
    { id: 'product', label: '商品机会', count: recommendationsForTypeFilter.filter((r) => getRecommendationOpportunityType(r) === 'product').length },
    { id: 'project', label: '项目机会', count: recommendationsForTypeFilter.filter((r) => getRecommendationOpportunityType(r) === 'project').length },
    { id: 'capacity', label: '排期机会', count: recommendationsForTypeFilter.filter((r) => getRecommendationOpportunityType(r) === 'capacity').length },
  ];

  const filtered = recommendations.filter((rec) => {
    const priorityMatched = priorityFilter === 'all' || rec.urgency === priorityFilter;
    const typeMatched = typeFilter === 'all' || getRecommendationOpportunityType(rec) === typeFilter;
    return priorityMatched && typeMatched;
  });
  const selectedPriorityLabel = priorityFilters.find((item) => item.id === priorityFilter)?.label ?? '全部优先级';
  const selectedTypeLabel = typeFilters.find((item) => item.id === typeFilter)?.label ?? '全部类型';
  const totalCustomerCount = recommendations[0]?.totalCustomers ?? customers.length;

  const createInitialDataFromRecommendation = (rec: Recommendation): PreviewInitialData => ({
    sourceRecommendationId: String(rec.id),
    predictionRunId: rec.predictionRunId ? String(rec.predictionRunId) : undefined,
    title: rec.title,
    description: rec.reason,
    targetCustomers: rec.targetCustomers,
    discount: rec.offer?.label || rec.discount,
    strategy: rec.recommendedItems?.length
      ? `${rec.strategy}；推荐项目/商品：${rec.recommendedItems.map((item) => item.name).join('、')}`
      : rec.strategy,
    image: rec.image,
    category: rec.category,
    duration: rec.duration,
    preferredMode: rec.preferredMode,
    executionModes: rec.executionModes?.join(','),
    triggerType: rec.triggerType,
    triggerRuleJson: rec.triggerRule ? JSON.stringify(rec.triggerRule) : undefined,
    audienceSnapshotJson: rec.audienceSnapshot ? JSON.stringify(rec.audienceSnapshot) : undefined,
    recommendedChannelsJson: rec.recommendedChannels ? JSON.stringify(rec.recommendedChannels) : undefined,
    recommendedItemsJson: rec.recommendedItems ? JSON.stringify(rec.recommendedItems) : undefined,
    offerJson: rec.offer ? JSON.stringify(rec.offer) : undefined,
    sourceSignalsJson: rec.sourceSignals ? JSON.stringify(rec.sourceSignals) : undefined,
    inventorySnapshotJson: rec.inventorySnapshot ? JSON.stringify(rec.inventorySnapshot) : undefined,
    capacitySnapshotJson: rec.capacitySnapshot ? JSON.stringify(rec.capacitySnapshot) : undefined,
    riskWarningsJson: rec.riskWarnings ? JSON.stringify(rec.riskWarnings) : undefined,
  });

  const getPreviewPeriod = () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);
    return {
      startDate: today.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    };
  };

  const getCustomerFacingFallbackTitle = (data: Record<string, string>) => {
    const signal = [data.title, data.description, data.targetCustomers, data.discount, data.strategy, data.category]
      .filter(Boolean)
      .join(' ');

    if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友回店护理礼';
    if (/复购窗口|护理周期|30\s*天复购|复购/.test(signal)) return '护理焕新礼';
    if (/次卡|套餐|卡项|核销|划扣/.test(signal)) return '卡项护理权益提醒';
    if (/优惠券|券/.test(signal)) return '专属护理优惠';
    if (/生日|寿星/.test(signal)) return '生日月专属护理礼';
    if (/新客|首单|首次/.test(signal)) return '新客首护体验礼';
    if (/敏感|修护|舒缓/.test(signal)) return '敏感肌舒缓护理季';
    if (/补水|保湿|干性/.test(signal)) return '补水保湿护理季';
    if (/LTV|VIP|会员|高价值|铂金|黄金|尊享|权益|优先权/.test(signal)) return 'VIP尊享护理礼遇';

    return '会员专属护理活动';
  };

  const getCustomerFacingActivityTitle = (data: Record<string, string>, campaignName: string) => {
    const signal = [data.title, data.description, data.targetCustomers, data.discount, data.strategy, data.category]
      .filter(Boolean)
      .join(' ');

    if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友回店护理礼已为你留好';
    if (/复购窗口|护理周期|30\s*天复购|复购/.test(signal)) return '本期护理焕新权益已开启';
    if (/次卡|套餐|卡项|核销|划扣/.test(signal)) return '你的卡项护理权益待预约';
    if (/优惠券|券/.test(signal)) return '专属护理优惠限时可领';
    if (/生日|寿星/.test(signal)) return '生日月护理礼遇已送达';
    if (/新客|首单|首次/.test(signal)) return '新客首护体验权益已开启';
    if (/敏感|修护|舒缓/.test(signal)) return '敏感肌舒缓修护权益已开启';
    if (/补水|保湿|干性/.test(signal)) return '补水保湿护理权益已开启';
    if (/LTV|VIP|会员|高价值|铂金|黄金|尊享|权益|优先权/.test(signal)) return '本期VIP专属护理权益已开启';
    return campaignName;
  };

  const getCustomerFacingAudienceLabel = (data: Record<string, string>) => {
    const signal = [data.title, data.description, data.targetCustomers, data.discount, data.strategy, data.category]
      .filter(Boolean)
      .join(' ');
    if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友';
    if (/生日|寿星/.test(signal)) return '寿星会员';
    if (/新客|首单|首次/.test(signal)) return '新朋友';
    if (/LTV|VIP|高价值|铂金|黄金|尊享|权益|优先权/.test(signal)) return 'VIP会员';
    return '会员';
  };

  const hasInternalMarketingTerms = (value?: string) =>
    /(\d+\s*位客户|高\s*LTV|LTV|高价值客户|流失风险|沉睡客户|唤醒|需要维护|转化率|算法|模型|预测|预警|分层|策略|规则)/i.test(
      String(value ?? ''),
    );

  const getSafeRecommendedItemNames = (data: PreviewInitialData) => {
    const parsedItems = parseJsonField<Array<{ name?: string; type?: string }>>(data.recommendedItemsJson);
    const fromItems = (Array.isArray(parsedItems) ? parsedItems : [])
      .map((item) => String(item.name ?? '').trim())
      .filter((name) => name && !hasInternalMarketingTerms(name));

    if (fromItems.length) return fromItems.slice(0, 3);

    const strategyText = String(data.strategy ?? '').trim();
    return strategyText && !hasInternalMarketingTerms(strategyText) ? [strategyText] : [];
  };

  const getCustomerFacingFallbackDescription = (
    data: Record<string, string>,
    title: string,
    startDate: string,
    endDate: string,
  ) => {
    const offer = data.discount || '到店可享专属礼遇';
    const greeting = /流失|沉睡|唤醒|回归|未到店/.test(
      [data.title, data.description, data.targetCustomers, data.strategy].filter(Boolean).join(' '),
    )
      ? '好久不见，门店为老朋友准备了一份回店护理礼。'
      : '为感谢您的信任，门店准备了一份专属护理礼遇。';

    return `${greeting}${title}已开启：${offer}。活动时间 ${startDate} 至 ${endDate}，可在线预约，到店后由顾问结合您的肌肤状态安排合适项目。`;
  };

  const createFallbackActivityPageSchema = (
    data: PreviewInitialData,
    startDate: string,
    endDate: string,
  ): ActivityPageSchema => {
    const textData = toCreateDialogInitialData(data);
    const title = getCustomerFacingFallbackTitle(textData);
    const heroTitle = getCustomerFacingActivityTitle(textData, title);
    const audienceLabel = getCustomerFacingAudienceLabel(textData);
    const description = getCustomerFacingFallbackDescription(textData, title, startDate, endDate);
    const offer = data.discount || '到店可享专属护理权益';
    const isReturnCare = /流失|沉睡|唤醒|回归|未到店/.test(
      [data.title, data.description, data.targetCustomers, data.strategy].filter(Boolean).join(' '),
    );

    return {
      schemaVersion: '1.0',
      title,
      subtitle: isReturnCare ? '好久不见，为你留了一份回店专属心意' : '本期会员专属护理权益已开启',
      audienceLabel,
      theme: {
        tone: isReturnCare ? 'warm' : 'professional',
        primaryColor: isReturnCare ? '#DB2777' : '#0F766E',
        backgroundColor: '#FFF7ED',
      },
      sections: [
        {
          type: 'hero',
          badge: '限时活动',
          title: heroTitle,
          subtitle: isReturnCare ? '回店护理礼已为你准备好' : '专属护理礼遇已开启',
          description,
        },
        {
          type: 'offer',
          title: '专属优惠',
          offer,
          description: '权益以门店实际核销规则为准，可在预约后由顾问协助确认。',
          validFrom: startDate,
          validTo: endDate,
          highlights: ['在线预约更省心', '到店确认护理方案', '活动名额有限'],
        },
        {
          type: 'benefits',
          title: '为什么适合你',
          items: [
            { title: '按护理节奏推荐', description: '结合近期到店和护理周期，优先推荐更适合当前状态的方案。' },
            { title: '顾问到店细化', description: '到店后根据肤况和服务禁忌再确认护理内容。' },
            { title: '权益清晰可核销', description: '优惠、项目和时间范围清楚展示，减少沟通成本。' },
          ],
        },
        {
          type: 'project_recommendation',
          title: '推荐护理',
          items: [
            {
              name: isReturnCare ? '回店护理关怀方案' : '补水修护护理',
              description: '适合作为本次到店的优先体验项目。',
              originalPrice: 680,
              activityPrice: 380,
              reason: '与本次活动权益和护理需求匹配。',
            },
            {
              name: '舒缓清洁护理',
              description: '可由顾问根据肤况搭配选择。',
              originalPrice: 480,
              activityPrice: 298,
              reason: '适合日常护理节奏维护。',
            },
          ],
        },
        {
          type: 'consultant_note',
          title: '顾问提醒',
          note: '预约后请告知近期皮肤状态、过敏史和正在使用的护肤品，门店会据此调整护理细节。',
          consultantName: 'Ami_Core 门店顾问',
        },
        {
          type: 'notice',
          title: '温馨提示',
          items: ['本活动不替代医疗建议。', '优惠不可与部分活动叠加，以下单或核销页展示为准。', '预约成功后门店会尽快确认服务时间。'],
        },
        {
          type: 'store_info',
          title: '活动门店',
          storeName: '心悦茗美容养生会所',
          phone: '0571-88888888',
        },
      ],
      cta: {
        text: '立即预约领取',
        action: 'book',
      },
      safety: {
        customerFacing: true,
        blocked: false,
        reasons: [],
      },
    };
  };

  const generateCustomerFacingPageData = async (data: PreviewInitialData): Promise<PreviewInitialData> => {
    const { startDate, endDate } = getPreviewPeriod();
    const textData = toCreateDialogInitialData(data);
    const customerFacingCampaignName = getCustomerFacingFallbackTitle(textData);
    const customerFacingAudience = getCustomerFacingAudienceLabel(textData);
    const safeProjectNames = getSafeRecommendedItemNames(data);
    const fallbackSchema = createFallbackActivityPageSchema(data, startDate, endDate);

    let result: Awaited<ReturnType<typeof generateActivityPage>> | undefined;
    let pageSchema: ActivityPageSchema | undefined;
    try {
      result = await generateActivityPage({
        sourceRecommendationId: data.sourceRecommendationId,
        campaignName: customerFacingCampaignName,
        targetAudience: customerFacingAudience,
        offer: data.discount,
        source: data.category || 'recommendation',
        segment: customerFacingAudience,
        triggerReasons: [`面向${customerFacingAudience}的${data.discount || '专属护理权益'}`],
        projectNames: safeProjectNames,
        startDate,
        endDate,
        storeName: '心悦茗美容养生会所',
        storePhone: '0571-88888888',
      });
      pageSchema = result.pageSchema ?? result.structured?.pageSchema;
      if (result.safety?.blocked || !pageSchema || pageSchema.safety?.blocked) {
        throw new Error(result.safety?.reasons?.[0] || pageSchema?.safety?.reasons?.[0] || 'AI 活动页结构不完整');
      }
    } catch {
      toast.warning('AI 暂未返回完整活动页，已生成安全活动预览，可继续调整配置');
      pageSchema = fallbackSchema;
    }

    const hero = pageSchema.sections.find((section) => section.type === 'hero');
    const offer = pageSchema.sections.find((section) => section.type === 'offer');

    return {
      ...data,
      title: pageSchema.title,
      description: hero?.description || pageSchema.subtitle || result?.text || data.description,
      discount: offer?.type === 'offer' ? offer.offer : data.discount,
      displayProjectName: `${pageSchema.title || '会员护理'}方案`,
      originalTitle: data.title,
      originalDescription: data.description,
      aiGenerated: 'true',
      aiGenerationId: result?.id || `fallback-activity-page-${Date.now()}`,
      aiPromptTemplateVersion: result?.structured?.promptTemplateVersion || 'marketing.activity_page.fallback.v1',
      pageSchema,
    };
  };

  const _generateCustomerFacingInitialData = async (data: Record<string, string>): Promise<Record<string, string>> => {
    const { startDate, endDate } = getPreviewPeriod();
    const channels: MarketingCopyChannel[] = ['miniapp', 'wechat', 'sms'];
    const result = await generateMarketingCopy({
      campaignName: data.title,
      targetAudience: data.targetCustomers,
      channel: 'miniapp',
      channels,
      offer: data.discount,
      source: data.strategy || data.category || 'recommendation',
      segment: data.targetCustomers,
      triggerReasons: [data.title, data.description, data.targetCustomers, data.strategy].filter(Boolean),
      projectNames: data.strategy ? [data.strategy] : [],
      startDate,
      endDate,
      storeName: 'Ami_Core',
    });
    if (result.safety?.blocked) {
      throw new Error(result.safety.reasons?.[0] || result.text || 'AI 文案生成失败');
    }
    const structuredVariants = Array.isArray(result.structured?.variants) ? result.structured.variants : [];
    const fallbackVariants = Array.isArray(result.variants) ? result.variants : [];
    const miniappVariant = structuredVariants.find((item) => item.channel === 'miniapp');
    const recommendedVariant = structuredVariants.find((item) => item.id === result.structured?.recommendedVariantId);
    const variant = miniappVariant ?? recommendedVariant ?? structuredVariants[0] ?? fallbackVariants[0];
    const fallbackTitle = getCustomerFacingFallbackTitle(data);
    const campaignName = result.structured?.context?.campaignName || variant?.title || fallbackTitle;
    const fallbackDescription = getCustomerFacingFallbackDescription(data, campaignName, startDate, endDate);

    return {
      ...data,
      title: variant?.title || campaignName,
      description: variant?.text || result.text || fallbackDescription,
      displayProjectName: `${campaignName || '会员护理'}方案`,
      originalTitle: data.title,
      originalDescription: data.description,
      aiGenerated: 'true',
    };
  };
  void _generateCustomerFacingInitialData;

  const createFallbackInitialData = (): Record<string, string> => ({
    title: recommendations[0]?.title || '会员专属护理活动',
    description: recommendations[0]?.reason || '基于客户画像与消费偏好，为目标会员推荐专属护理方案。',
    targetCustomers: recommendations[0]?.targetCustomers || '目标会员',
    discount: recommendations[0]?.discount || '到店享专属优惠',
    strategy: recommendations[0]?.strategy || '智能推荐活动',
    image: recommendations[0]?.image || '',
    category: recommendations[0]?.category || 'recommendation',
    duration: recommendations[0]?.duration || '30天',
  });

  const createMiniPreviewData = (data?: PreviewInitialData): ActivityPageData => {
    const source: PreviewInitialData = data || createFallbackInitialData();
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);

    return {
      title: source.title || '会员专属护理活动',
      description: source.description || '基于客户画像与消费偏好，为目标会员推荐专属护理方案。',
      discount: source.discount || '到店享专属优惠',
      startDate: today.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      targetCustomers: source.targetCustomers || '目标会员',
      posterImage: source.image,
      posterTitleColor: '#FFFFFF',
      projects: source.displayProjectName || (!source.aiGenerated && source.strategy)
        ? [{ name: source.displayProjectName || source.strategy || '推荐方案', price: 680, type: '推荐方案' }]
        : undefined,
      storeName: '心悦荟美容养生会所',
      storePhone: '0571-88888888',
      layout: source.category?.includes('ltv') ? 'vibrant' : source.category?.includes('member') ? 'elegant' : 'classic',
      pageSchema: source.pageSchema,
      aiGenerationId: source.aiGenerationId,
    };
  };

  const openMiniPreview = async (data?: PreviewInitialData) => {
    const nextData = data || createFallbackInitialData();
    setIsPreparingPreview(true);
    try {
      const generatedData = await generateCustomerFacingPageData(nextData);
      setPreviewInitialData(generatedData);
      setShowMiniPreview(true);
    } catch (error) {
      toast.error(error instanceof Error ? `活动预览生成失败：${error.message}` : '活动预览生成失败，请稍后重试');
      setPreviewInitialData(undefined);
      setShowMiniPreview(false);
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const toCreateDialogInitialData = (data?: PreviewInitialData): Record<string, string> => {
    const entries = Object.entries(data || createFallbackInitialData()).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return Object.fromEntries(entries);
  };

  const openManualCreateDialog = () => {
    setCreateDialogInitialData(undefined);
    setShowMiniPreview(false);
    setPreviewInitialData(undefined);
    setShowCreateDialog(true);
  };

  const openCreateDialogFromPreview = () => {
    setCreateDialogInitialData(toCreateDialogInitialData(previewInitialData));
    setShowMiniPreview(false);
    setShowCreateDialog(true);
  };

  const publishMiniPreview = async () => {
    if (!previewInitialData) return;
    const preview = createMiniPreviewData(previewInitialData);
    setIsPublishingPreview(true);
    try {
      const activity = await createMarketingActivity({
        title: preview.title,
        description: preview.description,
        image: preview.posterImage || '',
        status: '进行中',
        participants: 0,
        conversion: '0%',
        startDate: preview.startDate,
        endDate: preview.endDate,
        targetCustomers: preview.targetCustomers,
        discount: preview.discount,
        source: '策略自动创建',
        strategyName: previewInitialData.originalTitle || previewInitialData.strategy || preview.title,
        posterBg: preview.posterBg,
        posterImage: preview.posterImage,
        posterTitleColor: preview.posterTitleColor,
        pageSchema: preview.pageSchema,
        sourceRecommendationId: previewInitialData.sourceRecommendationId,
        predictionRunId: previewInitialData.predictionRunId,
        audienceSnapshotJson: parseJsonField(previewInitialData.audienceSnapshotJson),
        sourceSignalsJson: parseJsonField<string[]>(previewInitialData.sourceSignalsJson),
        offerJson: parseJsonField(previewInitialData.offerJson),
        recommendedItemsJson: parseJsonField(previewInitialData.recommendedItemsJson),
        aiGenerationId: previewInitialData.aiGenerationId,
        publishStatus: 'published',
        publishedAt: new Date().toISOString(),
      });
      const page = await createMarketingPage(
        buildMarketingPagePayloadFromActivity(activity, {
          pageSchema: preview.pageSchema!,
          activityType: previewInitialData.category,
          selectedChannels: parseJsonField<Array<{ label?: string; channel?: string }>>(previewInitialData.recommendedChannelsJson)
            ?.map((channel) => channel.label || channel.channel || '')
            .filter(Boolean),
          posterImage: preview.posterImage,
          offerJson: parseJsonField(previewInitialData.offerJson),
          audienceSnapshotJson: parseJsonField(previewInitialData.audienceSnapshotJson),
          recommendedItemsJson: parseJsonField(previewInitialData.recommendedItemsJson),
          sourceSignalsJson: parseJsonField<string[]>(previewInitialData.sourceSignalsJson),
        }),
      );
      await publishMarketingPage(page.id);
      toast.success('活动和推广页已发布，可进入推广资产分发', {
        action: {
          label: '查看推广页',
          onClick: () => navigate('/customer-marketing/assets?tab=pages'),
        },
        cancel: {
          label: '查看数据复盘',
          onClick: () => navigate('/customer-marketing/effect-analysis?objectType=activity'),
        },
      });
      setShowMiniPreview(false);
      setPreviewInitialData(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布失败，请稍后重试');
    } finally {
      setIsPublishingPreview(false);
    }
  };

  const handleRefresh = () => {
    void loadSourceData({ refreshPredictions: true });
  };

  const toggleEvidence = (id: number) => {
    setExpandedEvidence((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const openTargetCustomers = async (rec: Recommendation) => {
    setAudienceSortKey(rec.source === 'churn' || rec.predictionType === 'churn' ? 'churnScore' : 'promotionSensitivity');
    setSelectedCustomerGroup({ recommendation: rec, profiles: [] });
    setIsAudienceLoading(true);
    try {
      const targetProfiles = await loadAudienceProfilesForRecommendation(rec);
      setSelectedCustomerGroup({ recommendation: rec, profiles: targetProfiles });
    } catch (error) {
      setSelectedCustomerGroup({ recommendation: rec, profiles: [] });
      toast.error(error instanceof Error ? error.message : '目标客户列表加载失败');
    } finally {
      setIsAudienceLoading(false);
    }
  };

  const openTerminalFollowUp = async (rec: Recommendation) => {
    setFollowUpGroup({ recommendation: rec, profiles: [] });
    setFollowUpCheckedIds(new Set());
    setIsFollowUpAudienceLoading(true);
    try {
      const targetProfiles = await loadAudienceProfilesForRecommendation(rec);
      setFollowUpGroup({ recommendation: rec, profiles: targetProfiles });
      setFollowUpCheckedIds(new Set(targetProfiles.slice(0, 10).map((profile) => profile.customerId)));
      if (!targetProfiles.length) {
        toast.warning('该推荐暂无可下发到终端的客户名单');
      }
    } catch (error) {
      setFollowUpGroup({ recommendation: rec, profiles: [] });
      toast.error(error instanceof Error ? error.message : '终端跟进客户名单加载失败');
    } finally {
      setIsFollowUpAudienceLoading(false);
    }
  };

  const openFollowUpRecords = async (rec: Recommendation) => {
    if (rec.id <= 0) {
      toast.warning('样例推荐暂无真实跟进记录');
      return;
    }
    setFollowUpRecordGroup({ recommendation: rec, items: [], total: 0 });
    setIsFollowUpRecordsLoading(true);
    try {
      const result = await getMarketingFollowUpTasks({ recommendationId: rec.id, page: 1, pageSize: 20 });
      setFollowUpRecordGroup({ recommendation: rec, items: result.items, total: result.total });
    } catch (error) {
      setFollowUpRecordGroup({ recommendation: rec, items: [], total: 0 });
      toast.error(error instanceof Error ? error.message : '跟进记录加载失败');
    } finally {
      setIsFollowUpRecordsLoading(false);
    }
  };

  const toggleFollowUpCustomer = (customerId: number) => {
    setFollowUpCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  };

  const submitTerminalFollowUp = async () => {
    if (!followUpGroup) return;
    if (!selectedFollowUpProfiles.length) {
      toast.error('请至少选择一位客户');
      return;
    }

    const recommendation = followUpGroup.recommendation;
    setIsFollowUpSubmitting(true);
    try {
      const script = buildTerminalFollowUpScript(recommendation);
      const note = buildTerminalFollowUpNote(recommendation);
      const dueAt = getTerminalFollowUpDueAt();
      const assignment = getFollowUpAssignmentPreview(recommendation);
      const result = await batchCreateMarketingFollowUpTasks(recommendation.id, {
        customerId: selectedFollowUpProfiles[0].customerId,
        customerIds: selectedFollowUpProfiles.map((profile) => profile.customerId),
        recommendationId: recommendation.id > 0 ? recommendation.id : undefined,
        sourceRecommendationKey: recommendation.recommendationKey,
        source: recommendation.source,
        triggerType: recommendation.recommendationType || recommendation.triggerType,
        title: recommendation.title,
        priority: recommendation.urgency,
        assigneeRole: assignment.role,
        channel: 'phone',
        dueAt,
        script,
        note,
      });
      if (result.createdCount || result.duplicatedCount) {
        toast.success(
          `已下发 ${result.createdCount} 个终端跟进任务${result.duplicatedCount ? `，${result.duplicatedCount} 个已有待办未重复下发` : ''}${result.failedCount ? `，${result.failedCount} 个失败` : ''}`,
        );
        void getMarketingFollowUpTaskSummary()
          .then(setFollowUpSummary)
          .catch(() => setFollowUpSummary(null));
        setFollowUpGroup(null);
        setFollowUpCheckedIds(new Set());
      } else {
        toast.error(result.failures?.[0]?.message || '终端跟进任务下发失败，请稍后重试');
      }
    } finally {
      setIsFollowUpSubmitting(false);
    }
  };

  const urgencyBorder = (u: UrgencyLevel) => u === 'urgent' ? 'border-l-4 border-l-red-500' : u === 'recommended' ? 'border-l-4 border-l-yellow-400' : 'border-l-4 border-l-green-400';
  const sourceLabel = (s: Recommendation['source']) => {
    switch (s) {
      case 'churn': return { text: '流失预警', color: 'bg-red-100 text-red-700' };
      case 'association': return { text: '关联分析', color: 'bg-blue-100 text-blue-700' };
      case 'ltv': return { text: 'LTV驱动', color: 'bg-purple-100 text-purple-700' };
      case 'inventory': return { text: '库存机会', color: 'bg-amber-100 text-amber-700' };
      case 'capacity': return { text: '排期机会', color: 'bg-emerald-100 text-emerald-700' };
      case 'product': return { text: '商品复购', color: 'bg-teal-100 text-teal-700' };
      case 'project': return { text: '项目复购', color: 'bg-indigo-100 text-indigo-700' };
      default: return { text: '策略推荐', color: 'bg-gray-100 text-gray-700' };
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">智能推荐</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading && recommendations.length === 0
              ? '正在读取今日智能推荐；如今天尚未生成，将自动运行一次 RFM分群、关联规则、流失预警、LTV预测'
              : `基于 ${totalCustomerCount} 位客户数据，综合 RFM分群、关联规则、流失预警、LTV预测 四大算法智能推荐`}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleRefresh} disabled={isLoading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> {isLoading ? '刷新中...' : '刷新推荐'}
          </button>
          <button onClick={openManualCreateDialog}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-60">
            <Plus className="w-4 h-4" /> {isPreparingPreview ? 'AI生成预览中' : '发一次活动'}
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-6">
        {[
          { label: '待处理', value: followUpSummary?.pending ?? 0, color: 'border-amber-200 bg-amber-50 text-amber-800' },
          { label: '处理中', value: followUpSummary?.in_progress ?? followUpSummary?.inProgress ?? 0, color: 'border-blue-200 bg-blue-50 text-blue-800' },
          { label: '已完成', value: followUpSummary?.completed ?? 0, color: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
          { label: '已逾期', value: followUpSummary?.overdue ?? 0, color: 'border-red-200 bg-red-50 text-red-800' },
          { label: '已预约', value: followUpSummary?.booked ?? 0, color: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
          { label: '已成交', value: followUpSummary?.converted ?? 0, color: 'border-purple-200 bg-purple-50 text-purple-800' },
        ].map((item) => (
          <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.color}`}>
            <div className="text-xs font-medium">{item.label}</div>
            <div className="mt-1 text-2xl font-semibold">{item.value}</div>
          </div>
        ))}
      </div>

      {/* 推荐筛选 */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          <span className="font-medium text-gray-700">优先级</span>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as RecommendationPriorityFilterId)}
            className="h-10 min-w-40 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition-colors hover:border-blue-300 focus:border-blue-500"
          >
            {priorityFilters.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}（{option.count}）
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          <span className="font-medium text-gray-700">机会类型</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as RecommendationTypeFilterId)}
            className="h-10 min-w-40 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition-colors hover:border-blue-300 focus:border-blue-500"
          >
            {typeFilters.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}（{option.count}）
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-gray-500">
          <span>当前：{selectedPriorityLabel} / {selectedTypeLabel}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-blue-600">共 {filtered.length} 条</span>
          {(priorityFilter !== 'all' || typeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setPriorityFilter('all');
                setTypeFilter('all');
              }}
              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-gray-600 hover:bg-gray-100"
            >
              清空筛选
            </button>
          )}
        </div>
      </div>

      {/* 推荐列表 */}
      <div className="flex-1 overflow-auto">
        {isLoading && recommendations.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50/60 text-sm text-blue-700">
            正在读取今日推荐数据，必要时自动完成本日首次计算...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
            暂无匹配推荐，请点击“刷新推荐”重新运行算法。
          </div>
        ) : (
        <div className="space-y-4">
          {filtered.map((rec) => {
            const sl = sourceLabel(rec.source);
            const isExpanded = expandedEvidence.has(rec.id);
            const executionModes = rec.executionModes ?? (rec.preferAutoRule ? ['automation'] : ['activity']);
            const canCreateAutomation = executionModes.includes('automation') && Boolean(rec.triggerType || rec.triggerRule?.type);
            const canCreateActivity = executionModes.includes('activity');
            const followUpAction = getTerminalFollowUpActionState(rec);
            return (
              <div key={rec.id} className={`border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow ${urgencyBorder(rec.urgency)}`}>
                <div className="flex gap-5 p-5">
                  {/* 左侧海报 */}
                  <div className="w-40 h-40 shrink-0 rounded-lg overflow-hidden">
                    <img src={rec.image} alt={rec.title} className="w-full h-full object-cover" />
                  </div>

                  {/* 右侧内容 */}
                  <div className="flex-1 min-w-0">
                    {/* 标题行 */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{rec.urgencyLabel}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${sl.color}`}>{sl.text}</span>
                          {rec.isFallback && (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              样例建议
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">{rec.title}</h3>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="text-xs text-gray-500">匹配度</div>
                        <div className={`text-xl font-bold ${rec.matchScore >= 85 ? 'text-green-600' : rec.matchScore >= 65 ? 'text-blue-600' : 'text-orange-500'}`}>{rec.matchScore}%</div>
                      </div>
                    </div>

                    {/* AI原因 */}
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 mb-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-blue-800">{rec.reason}</p>
                      </div>
                    </div>

                    <div className="mb-3 grid gap-2 text-xs text-gray-600 md:grid-cols-3">
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                        <span className="font-medium">优惠：</span>{rec.offer?.label || rec.discount}
                      </div>
                      <div className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">
                        <span className="font-medium">项目/商品：</span>{rec.recommendedItems?.[0]?.name || '推荐护理方案'}
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                        <span className="font-medium">渠道：</span>{getChannelText(rec)}
                      </div>
                    </div>

                    {/* 关键指标 */}
                    <div className="flex items-center gap-5 mb-3 text-sm">
                      <button
                        type="button"
                        onClick={() => void openTargetCustomers(rec)}
                        className="flex items-center gap-1 rounded px-1 py-0.5 text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                        title="查看对应客户列表"
                      >
                        <Users className="w-3.5 h-3.5" /> {rec.targetCustomers}
                      </button>
                      <span className="flex items-center gap-1 text-green-600 font-medium"><TrendingUp className="w-3.5 h-3.5" /> {rec.expectedRevenue}</span>
                      <span className="flex items-center gap-1 text-gray-500"><Calendar className="w-3.5 h-3.5" /> {rec.duration}</span>
                      {rec.predictionRunFinishedAt && (
                        <span className="text-xs text-gray-400">
                          批次 {new Date(rec.predictionRunFinishedAt).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>

                    {(rec.inventorySnapshot || rec.capacitySnapshot || rec.expectedGrossProfit || rec.expectedLossAvoided) && (
                      <div className="mb-3 grid gap-2 text-xs text-gray-700 md:grid-cols-4">
                        {rec.inventorySnapshot && (
                          <>
                            <div className="rounded-lg bg-orange-50 px-3 py-2 text-orange-800">
                              <span className="font-medium">临期库存：</span>
                              {rec.inventorySnapshot.stock}{rec.recommendedItems?.[0]?.category ? '' : ''}
                            </div>
                            <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
                              <span className="font-medium">剩余天数：</span>
                              {rec.inventorySnapshot.daysToExpiry ?? '-'} 天
                            </div>
                            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                              <span className="font-medium">缺口：</span>
                              {rec.inventorySnapshot.gapQty ?? '-'}
                            </div>
                          </>
                        )}
                        {rec.capacitySnapshot && (
                          <>
                            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
                              <span className="font-medium">时段：</span>
                              {rec.capacitySnapshot.dateRange}
                            </div>
                            <div className="rounded-lg bg-cyan-50 px-3 py-2 text-cyan-800">
                              <span className="font-medium">空闲：</span>
                              {Math.round((rec.capacitySnapshot.idleMinutes ?? 0) / 60)} 小时
                            </div>
                            <div className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800">
                              <span className="font-medium">占用率：</span>
                              {Math.round((rec.capacitySnapshot.utilizationRate ?? 0) * 100)}%
                            </div>
                          </>
                        )}
                        {rec.expectedGrossProfit && (
                          <div className="rounded-lg bg-green-50 px-3 py-2 text-green-700">
                            <span className="font-medium">毛利：</span>{rec.expectedGrossProfit}
                          </div>
                        )}
                        {rec.expectedLossAvoided && (
                          <div className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
                            <span className="font-medium">避免损耗：</span>{rec.expectedLossAvoided}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 数据依据（可折叠） */}
                    {rec.dataEvidence && rec.dataEvidence.length > 0 && (
                      <div className="mb-3">
                        <button onClick={() => toggleEvidence(rec.id)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          数据依据
                        </button>
                        {isExpanded && (
                          <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1">
                            {rec.dataEvidence.map((e, i) => (
                              <div key={i} className="text-xs text-gray-600 flex items-center gap-2">
                                <span className="w-1 h-1 bg-gray-400 rounded-full shrink-0" />
                                {e}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {rec.riskWarnings && rec.riskWarnings.length > 0 && (
                      <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                        <div className="mb-1 text-xs font-medium text-red-700">风险提示</div>
                        <div className="space-y-1">
                          {rec.riskWarnings.map((warning, i) => (
                            <div key={i} className="text-xs text-red-700">{warning}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <span className="flex-1 text-xs text-gray-400">{rec.discount}</span>
                      {canCreateAutomation && (
                        <button onClick={() => {
                          const triggerType = rec.triggerRule?.type || rec.triggerType!;
                          const channels = rec.recommendedChannels?.map((item) => item.channel).join(',') || 'sms,miniapp';
                          const params = new URLSearchParams({
                            name: rec.title, desc: rec.reason, trigger: triggerType,
                            triggerParams: JSON.stringify(rec.triggerRule?.params || {}),
                            actions: JSON.stringify((rec.recommendedActions?.length ? rec.recommendedActions : [{ type: 'coupon', value: rec.offer?.label || rec.discount }]).map((action) => ({
                              type: action.type === 'consultant_task' ? 'push' : action.type,
                              value: action.value,
                            }))),
                            channels,
                            sourceRecommendationId: String(rec.id),
                            predictionRunId: rec.predictionRunId ? String(rec.predictionRunId) : '',
                            targetAudience: rec.targetCustomers || rec.title,
                            offer: rec.offer?.label || rec.discount,
                            strategyText: rec.strategy,
                            recommendedItems: JSON.stringify(rec.recommendedItems?.map((item) => item.name) || []),
                            sourceSignals: JSON.stringify(rec.sourceSignals || []),
                            autoGenerate: 'true',
                          });
                          navigate(`/customer-marketing/automation?${params.toString()}`);
                        }} className="px-4 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5 text-xs">
                          <Zap className="w-3.5 h-3.5" /> 开启自动触达
                        </button>
                      )}
                      <button
                        onClick={() => void openMiniPreview(createInitialDataFromRecommendation(rec))}
                        disabled={isPreparingPreview || !canCreateActivity}
                        title={canCreateActivity ? rec.modeReason : '该推荐更适合开启自动触达'}
                        className={`px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50 ${canCreateAutomation ? 'border border-blue-500 text-blue-600 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        {isPreparingPreview ? 'AI生成中' : canCreateActivity ? '发一次活动' : '不建议活动'} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      {followUpAction.visible && (
                        <button
                          onClick={() => void openTerminalFollowUp(rec)}
                          disabled={followUpAction.disabled || (isFollowUpAudienceLoading && followUpGroup?.recommendation.id === rec.id)}
                          title={followUpAction.reason}
                          className={`px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50 ${
                            followUpAction.primary
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300'
                              : 'border border-emerald-500 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          {isFollowUpAudienceLoading && followUpGroup?.recommendation.id === rec.id ? '加载客户' : '下发终端跟进'}
                        </button>
                      )}
                      {rec.id > 0 && (
                        <button
                          type="button"
                          onClick={() => void openFollowUpRecords(rec)}
                          className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          跟进记录
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      <CreateActivityDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} initialData={createDialogInitialData} />
      {showMiniPreview && previewInitialData && (
        <ActivityMiniPage
          data={createMiniPreviewData(previewInitialData)}
          onClose={() => setShowMiniPreview(false)}
          primaryActionLabel="调整配置"
          onPrimaryAction={openCreateDialogFromPreview}
          publishActionLabel="发布到小程序"
          onPublish={publishMiniPreview}
          isPublishing={isPublishingPreview}
        />
      )}
      <Dialog
        open={Boolean(followUpGroup)}
        onOpenChange={(open) => {
          if (!open) {
            setFollowUpGroup(null);
            setFollowUpCheckedIds(new Set());
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>下发到 Ami Aura Lite 客户增长</DialogTitle>
            <DialogDescription>
              {followUpGroup?.recommendation.title || '选择客户'}，已选 {selectedFollowUpProfiles.length} 位客户。确认后会为这些客户生成终端跟进任务。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 md:grid-cols-3">
            <div>
              <div className="font-medium">下发给谁</div>
              <div className="mt-1 text-blue-800">下发给当前推荐命中的客户名单，默认勾选前 10 位，可手动调整。</div>
            </div>
            <div>
              <div className="font-medium">谁来跟进</div>
              <div className="mt-1 text-blue-800">
                建议进入「{followUpAssignmentPreview?.roleLabel || '门店'}」队列，终端会按角色展示待办。
              </div>
            </div>
            <div>
              <div className="font-medium">如何闭环</div>
              <div className="mt-1 text-blue-800">创建跟进任务并记录下发事件；终端完成跟进后回写完成事件，成交时继续记录转化。</div>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900 md:grid-cols-3">
            <div>
              <div className="font-medium">下发判断</div>
              <div className="mt-1 text-emerald-800">{followUpActionPreview?.reason || '需要门店人员确认客户意向。'}</div>
            </div>
            <div>
              <div className="font-medium">建议角色</div>
              <div className="mt-1 text-emerald-800">
                {followUpAssignmentPreview?.roleLabel || '门店'}：{followUpAssignmentPreview?.reason || '根据客户关系和推荐场景自动分派。'}
              </div>
            </div>
            <div>
              <div className="font-medium">截止时间</div>
              <div className="mt-1 text-emerald-800">默认次日 20:00 前完成；紧急场景后端会按场景缩短。</div>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm text-emerald-800">
            <div className="font-medium">终端跟进话术</div>
            <div className="mt-1 leading-relaxed">{followUpScriptPreview || '请选择推荐后生成跟进话术。'}</div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              默认勾选前 10 位客户，适合先给门店顾问做小批量跟进。
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => setFollowUpCheckedIds(new Set((followUpGroup?.profiles ?? []).slice(0, 10).map((profile) => profile.customerId)))}
              >
                选前 10 位
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => setFollowUpCheckedIds(new Set((followUpGroup?.profiles ?? []).map((profile) => profile.customerId)))}
              >
                全选
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => setFollowUpCheckedIds(new Set())}
              >
                清空
              </button>
            </div>
          </div>

          <div className="max-h-[48vh] overflow-auto rounded-lg border border-gray-200">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead className="w-12">选择</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>门店</TableHead>
                  <TableHead>消费等级</TableHead>
                  <TableHead>建议跟进</TableHead>
                  <TableHead>最后到店</TableHead>
                  <TableHead>偏好服务</TableHead>
                  <TableHead>复购率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFollowUpAudienceLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-gray-500">
                      正在加载可跟进客户...
                    </TableCell>
                  </TableRow>
                ) : followUpGroup?.profiles.length ? (
                  followUpGroup.profiles.map((profile) => (
                    <TableRow key={profile.customerId} className="hover:bg-emerald-50/40">
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={followUpCheckedIds.has(profile.customerId)}
                          onChange={() => toggleFollowUpCustomer(profile.customerId)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-800">{profile.name}</div>
                        <div className="text-xs text-gray-400">ID {profile.customerId}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.phone || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.storeName || '-'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-3 py-1 text-sm ${LEVEL_COLORS[profile.segment] || 'bg-gray-100 text-gray-700'}`}>
                          {profile.segment}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{followUpAssignmentPreview?.roleLabel || '门店'}</TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.lastVisitDate || '-'}</TableCell>
                      <TableCell className="text-gray-700">{profile.preferredService}</TableCell>
                      <TableCell><ProgressMetric value={profile.repurchaseRate} /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-gray-500">
                      暂无可下发客户
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setFollowUpGroup(null);
                setFollowUpCheckedIds(new Set());
              }}
            >
              取消
            </button>
            <button
              type="button"
              disabled={isFollowUpSubmitting || isFollowUpAudienceLoading || selectedFollowUpProfiles.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:bg-emerald-300"
              onClick={() => void submitTerminalFollowUp()}
            >
              <Send className="h-4 w-4" />
              {isFollowUpSubmitting ? '下发中...' : `确认下发 ${selectedFollowUpProfiles.length} 位`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(followUpRecordGroup)} onOpenChange={(open) => !open && setFollowUpRecordGroup(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>推荐跟进记录</DialogTitle>
            <DialogDescription>
              {followUpRecordGroup?.recommendation.title || '当前推荐'}，共 {followUpRecordGroup?.total ?? 0} 条终端跟进任务。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-auto rounded-lg border border-gray-200">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead>状态</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>跟进人/队列</TableHead>
                  <TableHead>分派原因</TableHead>
                  <TableHead>截止时间</TableHead>
                  <TableHead>完成结果</TableHead>
                  <TableHead>预约/订单</TableHead>
                  <TableHead>创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFollowUpRecordsLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                      正在加载跟进记录...
                    </TableCell>
                  </TableRow>
                ) : followUpRecordGroup?.items.length ? (
                  followUpRecordGroup.items.map((task) => {
                    const assigneeName =
                      task.assigneeBeauticianName ||
                      task.assigneeUserName ||
                      FOLLOW_UP_ROLE_LABELS[task.assigneeRole || ''] ||
                      '门店队列';
                    return (
                      <TableRow key={task.id}>
                        <TableCell>
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                            {FOLLOW_UP_STATUS_LABELS[task.status] || task.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-gray-800">{task.customerName || `客户${task.customerId}`}</div>
                          <div className="text-xs text-gray-400">{task.customerPhone || `ID ${task.customerId}`}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-gray-800">{assigneeName}</div>
                          <div className="text-xs text-gray-400">{FOLLOW_UP_ROLE_LABELS[task.assigneeRole || ''] || task.assigneeRole || '-'}</div>
                        </TableCell>
                        <TableCell className="max-w-56 text-sm text-gray-600">{task.assignmentReason || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-gray-700">{formatFollowUpDateTime(task.dueAt)}</TableCell>
                        <TableCell>
                          <div className="text-sm text-gray-800">
                            {task.resultType ? FOLLOW_UP_RESULT_LABELS[task.resultType] || task.resultType : '-'}
                          </div>
                          {task.resultNote && <div className="mt-1 max-w-48 truncate text-xs text-gray-500">{task.resultNote}</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-gray-700">
                          {task.reservationId ? `预约 ${task.reservationId}` : ''}
                          {task.reservationId && task.orderId ? ' / ' : ''}
                          {task.orderId ? `订单 ${task.orderId}` : !task.reservationId ? '-' : ''}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-gray-700">{formatFollowUpDateTime(task.createdAt)}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                      该推荐暂无终端跟进记录；下发任务后会在这里沉淀。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(selectedCustomerGroup)} onOpenChange={(open) => !open && setSelectedCustomerGroup(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{selectedCustomerGroup?.recommendation.targetCustomers || '目标客户列表'}</DialogTitle>
            <DialogDescription>
              {selectedCustomerGroup?.recommendation.title}，共 {selectedCustomerGroup?.profiles.length || 0} 位客户；名单来自预测快照，客户基础字段实时关联客户管理主表。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              高风险流失客户默认按流失分从高到低排列，便于优先触达。
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <ArrowDownUp className="h-4 w-4" />
              <span className="whitespace-nowrap">排序</span>
              <select
                value={audienceSortKey}
                onChange={(event) => setAudienceSortKey(event.target.value as AudienceSortKey)}
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition-colors hover:border-blue-300 focus:border-blue-500"
              >
                <option value="churnScore">流失分从高到低</option>
                <option value="repurchaseRate">复购率从高到低</option>
                <option value="promotionSensitivity">促销敏感度从高到低</option>
                <option value="visitCount">到店频次从高到低</option>
                <option value="avgSpend">平均消费从高到低</option>
              </select>
            </label>
          </div>

          <div className="max-h-[62vh] overflow-auto rounded-lg border border-gray-200">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead>客户ID</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>门店</TableHead>
                  <TableHead>消费等级</TableHead>
                  <TableHead>肌肤类型</TableHead>
                  <TableHead>到店频次</TableHead>
                  <TableHead>累计消费</TableHead>
                  <TableHead>平均消费</TableHead>
                  <TableHead>最后到店</TableHead>
                  <TableHead>偏好服务</TableHead>
                  <TableHead>流失分</TableHead>
                  <TableHead>促销敏感度</TableHead>
                  <TableHead>复购率</TableHead>
                  <TableHead>忠诚度</TableHead>
                  <TableHead>季节趋势</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAudienceLoading ? (
                  <TableRow>
                    <TableCell colSpan={16} className="py-10 text-center text-gray-500">
                      正在加载目标客户名单...
                    </TableCell>
                  </TableRow>
                ) : selectedCustomerGroup?.profiles.length ? (
                  sortedAudienceProfiles.map((profile) => (
                    <TableRow key={profile.customerId} className="hover:bg-blue-50/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">👩</span>
                          <span className="font-medium text-gray-800">{profile.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500">{profile.customerId}</TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.phone || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.storeName || '-'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-3 py-1 text-sm ${LEVEL_COLORS[profile.segment] || 'bg-gray-100 text-gray-700'}`}>
                          {profile.segment}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-3 py-1 text-sm ${profile.skinType === '未分类' ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>
                          {profile.skinType}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-700">{profile.visitFrequency}</TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{formatMoney(profile.totalSpentValue ?? 0)}</TableCell>
                      <TableCell className="text-gray-700">{profile.avgSpend}</TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.lastVisitDate || '-'}</TableCell>
                      <TableCell className="text-gray-700">{profile.preferredService}</TableCell>
                      <TableCell>
                        <span className={`font-semibold ${Number(profile.churnScore ?? 0) >= 85 ? 'text-red-600' : 'text-orange-600'}`}>
                          {Number.isFinite(profile.churnScore) ? profile.churnScore : '-'}
                        </span>
                      </TableCell>
                      <TableCell><ProgressMetric value={profile.promotionSensitivity} /></TableCell>
                      <TableCell><ProgressMetric value={profile.repurchaseRate} /></TableCell>
                      <TableCell><ProgressMetric value={profile.loyalty} /></TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.seasonalTrend}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={16} className="py-10 text-center text-gray-500">
                      暂无匹配客户
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
