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
import {
  getAutomationStrategiesPaginated,
  getMarketingActivities,
  getUnifiedMarketingEffects,
} from '@/api/marketing';
import { getMarketingRecommendations } from '@/api/recommendation';
import { createTerminalFollowUpTask, getTerminalCustomerGrowthCandidates } from '@/api/terminal';
import type {
  MarketingActivity,
  MarketingAutomationStrategy,
  TerminalGrowthCandidate,
  UnifiedMarketingEffectsResponse,
} from '@/types';
import type { Recommendation } from '@/utils/marketingRecommendation';

type WorkbenchState = {
  recommendations: Recommendation[];
  growthCandidates: TerminalGrowthCandidate[];
  activities: MarketingActivity[];
  strategies: MarketingAutomationStrategy[];
  effects: UnifiedMarketingEffectsResponse | null;
};

const emptyState: WorkbenchState = {
  recommendations: [],
  growthCandidates: [],
  activities: [],
  strategies: [],
  effects: null,
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatMoney(value: number) {
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function getTodayFollowUpDueAt() {
  const dueAt = new Date();
  dueAt.setHours(18, 0, 0, 0);
  if (dueAt.getTime() < Date.now()) dueAt.setDate(dueAt.getDate() + 1);
  return dueAt.toISOString();
}

function buildCandidateScript(candidate: TerminalGrowthCandidate) {
  const signal = [
    candidate.reason,
    candidate.churnLevel ? `流失等级 ${candidate.churnLevel}` : '',
    Number.isFinite(candidate.repurchase30dScore) ? `复购分 ${candidate.repurchase30dScore}` : '',
  ].filter(Boolean).join('；');
  return `${candidate.name} 属于今日客户增长优先对象。${signal}。建议顾问先用最近护理记录做关怀，再推荐低压力回店预约或同系列护理方案。`;
}

export function MarketingWorkbench() {
  const navigate = useNavigate();
  const [state, setState] = useState<WorkbenchState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [dispatchingCustomerId, setDispatchingCustomerId] = useState<number | null>(null);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    const nextErrors: string[] = [];
    const [recommendationsResult, growthResult, activitiesResult, strategiesResult, effectsResult] = await Promise.allSettled([
      getMarketingRecommendations(),
      getTerminalCustomerGrowthCandidates(8),
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

    if (growthResult.status === 'fulfilled') {
      nextState.growthCandidates = growthResult.value;
    } else {
      nextErrors.push('终端客户增长候选加载失败');
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
    () => state.activities.filter((item) => item.status === '进行中'),
    [state.activities],
  );
  const enabledStrategies = useMemo(
    () => state.strategies.filter((item) => item.status === 'enabled'),
    [state.strategies],
  );
  const totalReach = state.effects?.summary.exposureCount ?? 0;
  const totalRevenue = state.effects?.summary.revenue ?? 0;

  const createFollowUp = async (candidate: TerminalGrowthCandidate) => {
    setDispatchingCustomerId(candidate.customerId);
    try {
      await createTerminalFollowUpTask({
        customerId: candidate.customerId,
        channel: 'phone',
        dueAt: getTodayFollowUpDueAt(),
        script: buildCandidateScript(candidate),
        note: `营销工作台下发：${candidate.reason}`,
      });
      toast.success(`已同步 ${candidate.name} 到 Ami Aura Lite 客户增长`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下发终端跟进失败');
    } finally {
      setDispatchingCustomerId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">营销工作台</h1>
          <p className="mt-1 text-sm text-gray-500">
            汇总今日客户机会、终端客户增长、自动触达、推广资产和数据复盘，帮助店长先判断今天该经营哪些客户。
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
          title="终端客户增长"
          value={state.growthCandidates.length}
          hint="Ami Aura Lite 今日优先跟进客户"
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.9fr]">
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
              {state.recommendations.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-gray-900">{item.title}</h3>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{item.urgencyLabel}</span>
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
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">终端客户增长</h2>
              <p className="mt-1 text-sm text-gray-500">同步给 Ami Aura Lite，方便店长和前台现场跟进。</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/customer-marketing/intelligent-recommendation')}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              客户机会
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <LoadingBlock text="正在加载客户增长候选..." />
          ) : state.growthCandidates.length === 0 ? (
            <EmptyBlock text="暂无高优先级客户增长候选。" />
          ) : (
            <div className="space-y-3">
              {state.growthCandidates.slice(0, 5).map((candidate) => (
                <div key={candidate.customerId} className="rounded-lg border border-gray-100 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-gray-900">{candidate.name}</h3>
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">{candidate.churnLevel}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{candidate.reason}</p>
                      <div className="mt-2 text-xs text-gray-500">
                        复购分 {candidate.repurchase30dScore} / 流失分 {candidate.churnScore} / 累计 {formatMoney(candidate.totalSpent)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={dispatchingCustomerId === candidate.customerId}
                      onClick={() => void createFollowUp(candidate)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {dispatchingCustomerId === candidate.customerId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                      下发跟进
                    </button>
                  </div>
                </div>
              ))}
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
