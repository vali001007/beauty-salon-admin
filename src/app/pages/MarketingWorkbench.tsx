import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Loader2,
  Megaphone,
  PhoneCall,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAutomationStrategiesPaginated, getMarketingActivities, getUnifiedMarketingEffects } from '@/api/marketing';
import { getMarketingRecommendationAudience, getMarketingRecommendations } from '@/api/recommendation';
import { batchCreateRecommendationFollowUpTasks } from '@/api/terminal';
import type { MarketingActivity, MarketingAutomationStrategy, UnifiedMarketingEffectsResponse } from '@/types';
import type { BehaviorProfile } from '@/utils/customerSegmentation';
import type { Recommendation } from '@/utils/marketingRecommendation';

type WorkbenchState = {
  recommendations: Recommendation[];
  activities: MarketingActivity[];
  strategies: MarketingAutomationStrategy[];
  effects: UnifiedMarketingEffectsResponse | null;
};

const emptyState: WorkbenchState = {
  recommendations: [],
  activities: [],
  strategies: [],
  effects: null,
};

type RecommendationAudienceCustomer = Partial<BehaviorProfile> & {
  customerId: number;
  name: string;
  phone?: string | null;
  memberLevel?: string | null;
  storeName?: string | null;
  totalSpent?: number;
  visitCount?: number;
  churnScore?: number;
  churnLevel?: string;
  repurchase30dScore?: number;
  marketingResponseScore?: number;
  ltvTier?: string;
  matchReason?: string;
};

type RawRecommendationAudienceCustomer = Partial<
  Omit<
    RecommendationAudienceCustomer,
    'customerId' | 'totalSpent' | 'visitCount' | 'churnScore' | 'repurchase30dScore' | 'marketingResponseScore'
  >
> & {
  id?: number | string;
  customerId?: number | string;
  totalSpent?: number | string;
  visitCount?: number | string;
  churnScore?: number | string;
  repurchase30dScore?: number | string;
  marketingResponseScore?: number | string;
};

type RecommendationAudienceState = {
  open: boolean;
  loading: boolean;
  customers: RecommendationAudienceCustomer[];
  error?: string;
  dispatchedCount?: number;
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatMoney(value: number) {
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function asNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getTodayFollowUpDueAt() {
  const dueAt = new Date();
  dueAt.setHours(18, 0, 0, 0);
  if (dueAt.getTime() < Date.now()) dueAt.setDate(dueAt.getDate() + 1);
  return dueAt.toISOString();
}

function normalizeAudienceCustomer(value: RawRecommendationAudienceCustomer): RecommendationAudienceCustomer | null {
  const customerId = asNumber(value.customerId ?? value.id, 0);
  if (!customerId) return null;

  return {
    ...value,
    customerId,
    name: value.name || `客户${customerId}`,
    phone: value.phone ?? '',
    memberLevel: value.memberLevel ?? '',
    storeName: value.storeName ?? '',
    totalSpent: asNumber(value.totalSpent, 0),
    visitCount: asNumber(value.visitCount, 0),
    churnScore: asNumber(value.churnScore, 0),
    repurchase30dScore: asNumber(value.repurchase30dScore, 0),
    marketingResponseScore: asNumber(value.marketingResponseScore, 0),
  };
}

function getTerminalFollowUpAssignment(rec: Recommendation) {
  const text = [rec.recommendationType, rec.triggerType, rec.source, rec.title, rec.reason].filter(Boolean).join(' ');
  if (/expiry|inventory|stock|capacity|临期|库存|低峰|排期|产能|补货/.test(text)) {
    return {
      role: 'manager',
      roleLabel: '店长',
      reason: '涉及库存、排期或经营协调，先由店长承接。',
    };
  }
  if (/booking|appointment|reservation|预约|浏览|放弃|到店/.test(text)) {
    return {
      role: 'reception',
      roleLabel: '前台',
      reason: '属于预约确认或高意向邀约，前台先确认时间。',
    };
  }
  return {
    role: 'consultant',
    roleLabel: '顾问/美容师',
    reason: '属于客户关系维护，优先由熟悉客户的顾问或美容师跟进。',
  };
}

function buildRecommendationFollowUpScript(rec: Recommendation, customer?: RecommendationAudienceCustomer) {
  const offer = rec.offer?.label || rec.discount || '门店专属护理权益';
  const itemText = rec.recommendedItems?.[0]?.name ? `，可优先推荐${rec.recommendedItems[0].name}` : '';
  const customerText = customer ? `${customer.name}命中「${rec.title}」` : `客户命中「${rec.title}」`;
  return `${customerText}。建议先确认近期护理需求，再介绍${offer}${itemText}；如客户有兴趣，引导预约到店并备注肤况/时间偏好。`;
}

function buildRecommendationFollowUpNote(rec: Recommendation) {
  return `营销工作台下发终端跟进：${rec.reason}`;
}

export function MarketingWorkbench() {
  const navigate = useNavigate();
  const [state, setState] = useState<WorkbenchState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [audienceState, setAudienceState] = useState<Record<number, RecommendationAudienceState>>({});
  const [dispatchingKey, setDispatchingKey] = useState<string | null>(null);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    const nextErrors: string[] = [];
    const [recommendationsResult, activitiesResult, strategiesResult, effectsResult] = await Promise.allSettled([
      getMarketingRecommendations(),
      getMarketingActivities(),
      getAutomationStrategiesPaginated({ page: 1, pageSize: 50, status: 'all' }),
      getUnifiedMarketingEffects(),
    ]);

    const nextState: WorkbenchState = { ...emptyState };

    if (recommendationsResult.status === 'fulfilled') {
      nextState.recommendations = recommendationsResult.value;
    } else {
      nextErrors.push('推荐机会加载失败');
    }

    if (activitiesResult.status === 'fulfilled') {
      nextState.activities = activitiesResult.value;
    } else {
      nextErrors.push('进行中活动加载失败');
    }

    if (strategiesResult.status === 'fulfilled') {
      nextState.strategies = asArray(strategiesResult.value.items ?? strategiesResult.value.data);
    } else {
      nextErrors.push('自动触达策略加载失败');
    }

    if (effectsResult.status === 'fulfilled') {
      nextState.effects = effectsResult.value;
    } else {
      nextErrors.push('数据复盘摘要加载失败');
    }

    setState(nextState);
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadWorkbench();
  }, [loadWorkbench]);

  const activeActivities = useMemo(
    () => state.activities.filter((item) => item.status === 'active'),
    [state.activities],
  );
  const enabledStrategies = useMemo(
    () => state.strategies.filter((item) => item.status === 'enabled'),
    [state.strategies],
  );
  const totalReach = state.effects?.summary.exposureCount ?? 0;
  const totalRevenue = state.effects?.summary.revenue ?? 0;
  const dispatchableOpportunityCount = state.recommendations.filter((item) => item.targetCount > 0).length;

  const loadRecommendationCustomers = async (recommendation: Recommendation) => {
    const current = audienceState[recommendation.id];
    if (current?.open && !current.loading) {
      setAudienceState((prev) => ({
        ...prev,
        [recommendation.id]: { ...current, open: false },
      }));
      return;
    }

    setAudienceState((prev) => ({
      ...prev,
      [recommendation.id]: {
        open: true,
        loading: true,
        customers: prev[recommendation.id]?.customers ?? [],
      },
    }));

    try {
      const profiles = await getMarketingRecommendationAudience(recommendation.id);
      const customers = profiles
        .map((profile) => normalizeAudienceCustomer(profile as RawRecommendationAudienceCustomer))
        .filter((profile): profile is RecommendationAudienceCustomer => Boolean(profile));
      setAudienceState((prev) => ({
        ...prev,
        [recommendation.id]: {
          open: true,
          loading: false,
          customers,
        },
      }));
    } catch (error) {
      setAudienceState((prev) => ({
        ...prev,
        [recommendation.id]: {
          open: true,
          loading: false,
          customers: prev[recommendation.id]?.customers ?? [],
          error: error instanceof Error ? error.message : '客户名单加载失败',
        },
      }));
    }
  };

  const dispatchRecommendationCustomers = async (
    recommendation: Recommendation,
    customers: RecommendationAudienceCustomer[],
    mode: 'single' | 'batch',
  ) => {
    if (!customers.length) {
      toast.error('请先选择需要下发的客户');
      return;
    }

    const key = `${recommendation.id}-${mode}-${customers.map((item) => item.customerId).join('-')}`;
    const assignment = getTerminalFollowUpAssignment(recommendation);
    setDispatchingKey(key);
    try {
      const result = await batchCreateRecommendationFollowUpTasks(recommendation.id, {
        customerId: customers[0].customerId,
        customerIds: customers.map((item) => item.customerId),
        recommendationId: recommendation.id,
        sourceRecommendationKey: recommendation.recommendationKey,
        source: 'marketing_workbench',
        triggerType: recommendation.recommendationType || recommendation.triggerType,
        title: recommendation.title,
        priority: recommendation.urgency,
        assigneeRole: assignment.role,
        channel: 'phone',
        dueAt: getTodayFollowUpDueAt(),
        script: buildRecommendationFollowUpScript(recommendation, mode === 'single' ? customers[0] : undefined),
        note: `${buildRecommendationFollowUpNote(recommendation)}；${assignment.reason}`,
      });
      setAudienceState((prev) => ({
        ...prev,
        [recommendation.id]: {
          ...(prev[recommendation.id] ?? { open: true, loading: false, customers: [] }),
          dispatchedCount: (prev[recommendation.id]?.dispatchedCount ?? 0) + result.createdCount,
        },
      }));
      toast.success(
        `已下发 ${result.createdCount} 位客户到 Ami Aura Lite${result.duplicatedCount ? `，${result.duplicatedCount} 位已有待办未重复下发` : ''}${result.failedCount ? `，${result.failedCount} 位失败` : ''}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下发终端跟进失败');
    } finally {
      setDispatchingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">营销工作台</h1>
          <p className="mt-1 text-sm text-gray-500">
            汇总今日推荐机会、终端跟进、自动触达、推广资产和数据复盘，帮助店长先判断今天该经营哪些客户。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadWorkbench()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          部分摘要暂时不可用：{errors.join('、')}。可继续处理已加载的数据。
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="推荐机会"
          value={state.recommendations.length}
          hint="可发活动、开自动触达或下发终端跟进"
          icon={<Sparkles className="h-5 w-5 text-blue-600" />}
          loading={loading}
        />
        <SummaryCard
          title="可下发终端机会"
          value={dispatchableOpportunityCount}
          hint="客户名单挂在具体推荐机会下"
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          loading={loading}
        />
        <SummaryCard
          title="自动触达运行中"
          value={enabledStrategies.length}
          hint={`累计覆盖 ${enabledStrategies.reduce((sum, item) => sum + Number(item.targetCount || 0), 0)} 位客户`}
          icon={<Zap className="h-5 w-5 text-purple-600" />}
          loading={loading}
        />
        <SummaryCard
          title="成交收入"
          value={formatMoney(totalRevenue)}
          hint={`${totalReach.toLocaleString('zh-CN')} 次触达/访问`}
          icon={<TrendingUp className="h-5 w-5 text-orange-600" />}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-5">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">今日推荐机会</h2>
              <p className="mt-1 text-sm text-gray-500">默认只展示最需要处理的机会，完整推荐可进入推荐明细。</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/customer-marketing/intelligent-recommendation')}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              推荐明细
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <LoadingBlock text="正在加载推荐机会..." />
          ) : state.recommendations.length === 0 ? (
            <EmptyBlock text="暂无推荐机会，可稍后刷新预测结果。" />
          ) : (
            <div className="space-y-3">
              {state.recommendations.slice(0, 5).map((item) => {
                const audience = audienceState[item.id];
                const visibleCustomers = audience?.customers.slice(0, 8) ?? [];
                const batchCustomers = visibleCustomers.slice(0, 8);
                const assignment = getTerminalFollowUpAssignment(item);
                const batchKey = `${item.id}-batch-${batchCustomers.map((customer) => customer.customerId).join('-')}`;

                return (
                  <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-gray-900">{item.title}</h3>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                            {item.urgencyLabel}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                            终端：{assignment.roleLabel}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.reason}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                          <span>{item.targetCustomers}</span>
                          <span>{item.expectedRevenue}</span>
                          <span>{item.offer?.label || item.discount}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void loadRecommendationCustomers(item)}
                          className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          {audience?.open ? '收起客户' : '查看客户'}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/customer-marketing/intelligent-recommendation')}
                          className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          处理机会
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/customer-marketing/automation')}
                          className="rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50"
                        >
                          开启自动触达
                        </button>
                      </div>
                    </div>

                    {audience?.open && (
                      <div className="mt-4 rounded-lg border border-emerald-100 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">跟进客户名单</h4>
                            <p className="mt-1 text-xs text-gray-500">
                              来自当前推荐机会的命中客群，下发后会进入 Ami Aura Lite 终端待办。
                            </p>
                          </div>
                          {visibleCustomers.length > 0 && (
                            <button
                              type="button"
                              disabled={dispatchingKey === batchKey}
                              onClick={() => void dispatchRecommendationCustomers(item, batchCustomers, 'batch')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {dispatchingKey === batchKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <PhoneCall className="h-3.5 w-3.5" />
                              )}
                              下发前 {batchCustomers.length} 位
                            </button>
                          )}
                        </div>

                        {audience.loading ? (
                          <div className="mt-3 flex h-20 items-center justify-center text-sm text-gray-500">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            正在加载当前机会客户...
                          </div>
                        ) : audience.error ? (
                          <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {audience.error}
                          </div>
                        ) : visibleCustomers.length === 0 ? (
                          <div className="mt-3 rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                            当前机会暂无可下发客户。
                          </div>
                        ) : (
                          <div className="mt-3 divide-y divide-gray-100">
                            {visibleCustomers.map((customer) => {
                              const singleKey = `${item.id}-single-${customer.customerId}`;
                              return (
                                <div
                                  key={customer.customerId}
                                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-gray-900">{customer.name}</span>
                                      {customer.phone && (
                                        <span className="text-xs text-gray-500">{customer.phone}</span>
                                      )}
                                      {customer.segment && (
                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                          {customer.segment}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                                      <span>累计消费 {formatMoney(customer.totalSpent ?? 0)}</span>
                                      <span>到店 {customer.visitCount ?? 0} 次</span>
                                      {customer.churnLevel && <span>流失风险 {customer.churnLevel}</span>}
                                      {customer.matchReason && <span>{customer.matchReason}</span>}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={dispatchingKey === singleKey}
                                    onClick={() => void dispatchRecommendationCustomers(item, [customer], 'single')}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                  >
                                    {dispatchingKey === singleKey ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <PhoneCall className="h-3.5 w-3.5" />
                                    )}
                                    下发
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {audience.dispatchedCount ? (
                          <div className="mt-3 text-xs text-emerald-700">
                            本机会已下发 {audience.dispatchedCount} 位客户。
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ActionPanel
          title="自动触达"
          description={`当前 ${enabledStrategies.length} 条策略启用中，适合生日、复购窗口、流失唤醒等长期动作。`}
          icon={<Zap className="h-5 w-5 text-purple-600" />}
          actionLabel="管理自动触达"
          onAction={() => navigate('/customer-marketing/automation')}
        />
        <ActionPanel
          title="推广资产"
          description={`${activeActivities.length} 个活动进行中，可管理推广页、优惠权益和小程序展示。`}
          icon={<Megaphone className="h-5 w-5 text-blue-600" />}
          actionLabel="管理推广资产"
          onAction={() => navigate('/customer-marketing/assets')}
        />
        <ActionPanel
          title="数据复盘"
          description={`已沉淀 ${state.effects?.summary.totalObjects ?? 0} 个推广对象，关注成交收入和投放回报。`}
          icon={<BarChart3 className="h-5 w-5 text-orange-600" />}
          actionLabel="查看数据复盘"
          onAction={() => navigate('/customer-marketing/effect-analysis')}
        />
      </div>

      {activeActivities.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">进行中活动</h2>
              <p className="mt-1 text-sm text-gray-500">活动列表仍保留旧入口，工作台只展示摘要。</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/customer-marketing/activity-management')}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              活动列表
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeActivities.slice(0, 3).map((activity) => (
              <div key={activity.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <CalendarClock className="h-4 w-4 text-blue-600" />
                  {activity.title}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-gray-600">{activity.description}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>{activity.targetCustomers || '目标会员'}</span>
                  <button
                    type="button"
                    onClick={() => navigate('/customer-marketing/effect-analysis?objectType=activity')}
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    复盘
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  icon,
  loading,
}: {
  title: string;
  value: number | string;
  hint: string;
  icon: ReactNode;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">{icon}</div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-gray-700">{title}</div>
      <div className="mt-2 text-xs text-gray-500">{hint}</div>
    </div>
  );
}

function LoadingBlock({ text }: { text: string }) {
  return (
    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-500">
      {text}
    </div>
  );
}

function ActionPanel({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">{icon}</div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 min-h-[44px] text-sm text-gray-500">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
