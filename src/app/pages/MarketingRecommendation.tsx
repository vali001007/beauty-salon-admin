import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, TrendingUp, Users, Calendar, ArrowRight, RefreshCw, Plus, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { CreateActivityDialog } from '../components/CreateActivityDialog';
import { ActivityMiniPage, type ActivityPageData } from '../components/ActivityMiniPage';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { generateActivityPage, generateMarketingCopy } from '@/api/ai';
import { getCustomerConsumptionRecords, getCustomerHealthProfiles, getCustomersPaginated } from '@/api/customer';
import { createMarketingActivity, runPredictions } from '@/api/marketing';
import { getMarketingRecommendationAudience, getMarketingRecommendations } from '@/api/recommendation';
import type { Customer } from '@/types';
import type { ActivityPageSchema, MarketingCopyChannel } from '@/types/ai';
import type { Recommendation, UrgencyLevel } from '@/utils/marketingRecommendation';
import { computeBehaviorProfiles, type BehaviorProfile } from '@/utils/customerSegmentation';

type SelectedCustomerGroup = {
  recommendation: Recommendation;
  profiles: BehaviorProfile[];
};

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
  pageSchema?: ActivityPageSchema;
  [key: string]: string | ActivityPageSchema | undefined;
};

type RecommendationAudiencePayload = Partial<BehaviorProfile> & {
  customerId: number;
  name: string;
  segment?: string;
  skinType?: string | null;
  visitCount?: number;
  totalSpent?: number;
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

function normalizeAudienceProfiles(profiles: RecommendationAudiencePayload[]): BehaviorProfile[] {
  return profiles.map((profile) => {
    const visitCount = Number(profile.visitCount ?? 0);
    const totalSpent = Number(profile.totalSpent ?? 0);
    const avgSpend = visitCount > 0 ? formatMoney(totalSpent / visitCount) : totalSpent > 0 ? `累计 ${formatMoney(totalSpent)}` : '暂无消费';

    return {
      customerId: profile.customerId,
      name: profile.name,
      segment: (profile.segment || '普通会员') as BehaviorProfile['segment'],
      skinType: (profile.skinType || '未分类') as BehaviorProfile['skinType'],
      visitFrequency: profile.visitFrequency || (visitCount > 0 ? `${visitCount}次到店` : '暂无到店记录'),
      avgSpend: profile.avgSpend || avgSpend,
      preferredService: profile.preferredService || profile.matchReason || '按预测模型命中',
      promotionSensitivity: profile.promotionSensitivity || scoreToPercent(profile.marketingResponseScore),
      repurchaseRate: profile.repurchaseRate || scoreToPercent(profile.repurchase30dScore),
      loyalty: profile.loyalty || ltvTierToLoyalty(profile.ltvTier),
      seasonalTrend: profile.seasonalTrend || (Number.isFinite(Number(profile.churnScore)) ? `流失分 ${profile.churnScore}` : profile.matchReason || '最新预测命中'),
    };
  });
}

export function MarketingRecommendation() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumptionRecords, setConsumptionRecords] = useState<any[]>([]);
  const [healthProfiles, setHealthProfiles] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | UrgencyLevel>('all');
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

  const filters = [
    { id: 'all' as const, label: '全部', count: recommendations.length },
    { id: 'urgent' as const, label: '🔴 紧急', count: recommendations.filter((r) => r.urgency === 'urgent').length },
    { id: 'recommended' as const, label: '🟡 推荐', count: recommendations.filter((r) => r.urgency === 'recommended').length },
    { id: 'opportunity' as const, label: '🟢 机会', count: recommendations.filter((r) => r.urgency === 'opportunity').length },
  ];

  const filtered = activeFilter === 'all' ? recommendations : recommendations.filter((r) => r.urgency === activeFilter);
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
    const signal = [data.title, data.description, data.targetCustomers, data.strategy, data.category].filter(Boolean).join(' ');

    if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友回店护理礼';
    if (/生日|寿星/.test(signal)) return '生日月专属护理礼';
    if (/新客|首单|首次/.test(signal)) return '新客首护体验礼';
    if (/敏感|修护|舒缓/.test(signal)) return '敏感肌舒缓护理季';
    if (/补水|保湿|干性/.test(signal)) return '补水保湿护理季';
    if (/VIP|会员|高价值|铂金|黄金/.test(signal)) return '会员专属护理礼遇';

    return '会员专属护理活动';
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
    const description = getCustomerFacingFallbackDescription(textData, title, startDate, endDate);
    const offer = data.discount || '到店可享专属护理权益';
    const isReturnCare = /流失|沉睡|唤醒|回归|未到店/.test(
      [data.title, data.description, data.targetCustomers, data.strategy].filter(Boolean).join(' '),
    );

    return {
      schemaVersion: '1.0',
      title,
      subtitle: isReturnCare ? '好久不见，为你留了一份回店专属心意' : '本期会员专属护理权益已开启',
      audienceLabel: isReturnCare ? '老朋友' : data.targetCustomers || '会员',
      theme: {
        tone: isReturnCare ? 'warm' : 'professional',
        primaryColor: isReturnCare ? '#DB2777' : '#0F766E',
        backgroundColor: '#FFF7ED',
      },
      sections: [
        {
          type: 'hero',
          badge: '限时活动',
          title,
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
    const strategyText = data.strategy || '';
    const safeProjectNames = /流失|沉睡|高风险|风险|唤醒|挽回|LTV|转化率|算法|分层/.test(strategyText)
      ? []
      : strategyText
        ? [strategyText]
        : [];
    const fallbackSchema = createFallbackActivityPageSchema(data, startDate, endDate);

    let result: Awaited<ReturnType<typeof generateActivityPage>> | undefined;
    let pageSchema: ActivityPageSchema | undefined;
    try {
      result = await generateActivityPage({
        sourceRecommendationId: data.sourceRecommendationId,
        campaignName: data.title,
        targetAudience: data.targetCustomers,
        offer: data.discount,
        source: data.strategy || data.category || 'recommendation',
        segment: data.targetCustomers,
        triggerReasons: [data.title, data.description, data.targetCustomers, data.strategy].filter(Boolean) as string[],
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
      await createMarketingActivity({
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
      toast.success('活动已发布，并推送到小程序端');
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
    setSelectedCustomerGroup({ recommendation: rec, profiles: [] });
    setIsAudienceLoading(true);
    try {
      const targetProfiles = await getMarketingRecommendationAudience(rec.id);
      setSelectedCustomerGroup({ recommendation: rec, profiles: normalizeAudienceProfiles(targetProfiles as RecommendationAudiencePayload[]) });
    } catch (error) {
      const targetIds = new Set(rec.targetCustomerIds);
      const fallbackProfiles = behaviorProfiles.filter((profile) => targetIds.has(profile.customerId));
      setSelectedCustomerGroup({ recommendation: rec, profiles: fallbackProfiles });
      toast.error(error instanceof Error ? error.message : '目标客户列表加载失败');
    } finally {
      setIsAudienceLoading(false);
    }
  };

  const urgencyBorder = (u: UrgencyLevel) => u === 'urgent' ? 'border-l-4 border-l-red-500' : u === 'recommended' ? 'border-l-4 border-l-yellow-400' : 'border-l-4 border-l-green-400';
  const sourceLabel = (s: Recommendation['source']) => {
    switch (s) {
      case 'churn': return { text: '流失预警', color: 'bg-red-100 text-red-700' };
      case 'association': return { text: '关联分析', color: 'bg-blue-100 text-blue-700' };
      case 'ltv': return { text: 'LTV驱动', color: 'bg-purple-100 text-purple-700' };
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
            <Plus className="w-4 h-4" /> {isPreparingPreview ? 'AI生成预览中' : '创建活动'}
          </button>
        </div>
      </div>

      {/* 紧急度筛选 */}
      <div className="flex gap-3 mb-6">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setActiveFilter(f.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeFilter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label} ({f.count})
          </button>
        ))}
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
                          navigate(`/customer-marketing/strategy-templates?${params.toString()}`);
                        }} className="px-4 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5 text-xs">
                          <Zap className="w-3.5 h-3.5" /> 创建自动规则
                        </button>
                      )}
                      <button
                        onClick={() => void openMiniPreview(createInitialDataFromRecommendation(rec))}
                        disabled={isPreparingPreview || !canCreateActivity}
                        title={canCreateActivity ? rec.modeReason : '该推荐更适合配置为自动营销规则'}
                        className={`px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50 ${canCreateAutomation ? 'border border-blue-500 text-blue-600 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        {isPreparingPreview ? 'AI生成中' : canCreateActivity ? '创建活动' : '不建议活动'} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
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
      <Dialog open={Boolean(selectedCustomerGroup)} onOpenChange={(open) => !open && setSelectedCustomerGroup(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedCustomerGroup?.recommendation.targetCustomers || '目标客户列表'}</DialogTitle>
            <DialogDescription>
              {selectedCustomerGroup?.recommendation.title}，共 {selectedCustomerGroup?.profiles.length || 0} 位客户；字段与“客户管理 / 客户画像 / 消费画像”保持一致。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-auto rounded-lg border border-gray-200">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead>客户</TableHead>
                  <TableHead>消费等级</TableHead>
                  <TableHead>肌肤类型</TableHead>
                  <TableHead>到店频次</TableHead>
                  <TableHead>平均消费</TableHead>
                  <TableHead>偏好服务</TableHead>
                  <TableHead>促销敏感度</TableHead>
                  <TableHead>复购率</TableHead>
                  <TableHead>忠诚度</TableHead>
                  <TableHead>季节趋势</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAudienceLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-gray-500">
                      正在加载目标客户名单...
                    </TableCell>
                  </TableRow>
                ) : selectedCustomerGroup?.profiles.length ? (
                  selectedCustomerGroup.profiles.map((profile) => (
                    <TableRow key={profile.customerId} className="hover:bg-blue-50/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">👩</span>
                          <span className="font-medium text-gray-800">{profile.name}</span>
                        </div>
                      </TableCell>
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
                      <TableCell className="text-gray-700">{profile.avgSpend}</TableCell>
                      <TableCell className="text-gray-700">{profile.preferredService}</TableCell>
                      <TableCell><ProgressMetric value={profile.promotionSensitivity} /></TableCell>
                      <TableCell><ProgressMetric value={profile.repurchaseRate} /></TableCell>
                      <TableCell><ProgressMetric value={profile.loyalty} /></TableCell>
                      <TableCell className="whitespace-nowrap text-gray-700">{profile.seasonalTrend}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-gray-500">
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
