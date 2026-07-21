import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Activity,
  ArrowUpRight,
  DollarSign,
  FileText,
  Gift,
  MousePointerClick,
  Sparkles,
  Smartphone,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { getMarketingFollowUpTaskSummary, getUnifiedMarketingEffects } from '@/api/marketing';
import { MarketingEffectDetailDialog } from '@/app/components/MarketingEffectDetailDialog';
import type {
  MarketingEffectObjectType,
  UnifiedMarketingEffectItem,
  UnifiedMarketingEffectsResponse,
} from '@/types';
import type { TerminalFollowUpTaskSummary } from '@/types/terminal';

type FilterType = 'all' | MarketingEffectObjectType;

const FILTERS: Array<{ id: FilterType; label: string; icon: typeof Activity }> = [
  { id: 'all', label: '全部', icon: Activity },
  { id: 'activity', label: '推广活动', icon: Target },
  { id: 'auto', label: '自动触达', icon: Zap },
  { id: 'page', label: '推广页', icon: FileText },
  { id: 'promotion', label: '权益资产', icon: Gift },
  { id: 'recommendation', label: '智能推荐', icon: Sparkles },
  { id: 'glow', label: 'Ami Glow', icon: Smartphone },
];

const normalizeFilter = (value: string | null): FilterType => {
  const allowed = FILTERS.map((item) => item.id);
  return allowed.includes(value as FilterType) ? (value as FilterType) : 'all';
};

const formatMoney = (value: number) => {
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return `¥${value.toLocaleString()}`;
};

const metricSourceLabel = (source?: 'actual' | 'predicted' | 'estimated') => {
  if (source === 'actual') return '真实';
  if (source === 'predicted') return '预测';
  if (source === 'estimated') return '估算';
  return '口径待确认';
};

const getPromotionLabel = (value?: Record<string, unknown> | null) => {
  if (!value) return '';
  return String(value.promotionName ?? value.name ?? value.label ?? value.discountText ?? value.promotionId ?? '').trim();
};

const getTypeStyle = (type: MarketingEffectObjectType) => {
  const styles: Record<MarketingEffectObjectType, string> = {
    activity: 'bg-blue-100 text-blue-700',
    auto: 'bg-purple-100 text-purple-700',
    page: 'bg-cyan-100 text-cyan-700',
    promotion: 'bg-amber-100 text-amber-700',
    recommendation: 'bg-indigo-100 text-indigo-700',
    glow: 'bg-emerald-100 text-emerald-700',
  };
  return styles[type];
};

const getTypeIcon = (type: MarketingEffectObjectType) => {
  const icons: Record<MarketingEffectObjectType, typeof Activity> = {
    activity: Target,
    auto: Zap,
    page: FileText,
    promotion: Gift,
    recommendation: Sparkles,
    glow: Smartphone,
  };
  return icons[type];
};

export function MarketingAnalytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterType>(() => normalizeFilter(searchParams.get('objectType')));
  const [data, setData] = useState<UnifiedMarketingEffectsResponse | null>(null);
  const [followUpSummary, setFollowUpSummary] = useState<TerminalFollowUpTaskSummary | null>(null);
  const [selectedEffectItem, setSelectedEffectItem] = useState<UnifiedMarketingEffectItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFilter(normalizeFilter(searchParams.get('objectType')));
  }, [searchParams]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const objectType = normalizeFilter(searchParams.get('objectType'));
      const objectId = searchParams.get('objectId') || undefined;
      const [response, followUpResult] = await Promise.all([
        getUnifiedMarketingEffects({
          objectType,
          objectId,
        }),
        getMarketingFollowUpTaskSummary().catch(() => null),
      ]);
      setData(response);
      setFollowUpSummary(followUpResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : '数据复盘加载失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const filtered = filter === 'all' ? items : items.filter((item) => item.objectType === filter);
  const filterOptions = useMemo(
    () =>
      FILTERS.map((option) => ({
        ...option,
        count: option.id === 'all' ? items.length : items.filter((item) => item.objectType === option.id).length,
      })),
    [items],
  );
  const selectedFilterLabel = filterOptions.find((item) => item.id === filter)?.label ?? '当前类型';
  const summary = data?.summary ?? {
    totalObjects: 0,
    exposureCount: 0,
    clickCount: 0,
    conversionCount: 0,
    revenue: 0,
    cost: 0,
    roi: '0',
  };
  const metricSummary = data?.metricSummary;

  const stats = [
    {
      title: '推广对象',
      value: String(summary.totalObjects),
      icon: Activity,
      bgColor: 'bg-gradient-to-br from-blue-500 to-blue-600',
      change: `${filterOptions.find((item) => item.id === 'activity')?.count ?? 0}活动 / ${filterOptions.find((item) => item.id === 'auto')?.count ?? 0}规则`,
    },
    {
      title: '触达/访问',
      value: summary.exposureCount.toLocaleString(),
      icon: Users,
      bgColor: 'bg-gradient-to-br from-green-500 to-green-600',
      change: `${summary.clickCount.toLocaleString()} 点击 · ${metricSourceLabel(metricSummary?.exposure.source)}`,
    },
    {
      title: '成交收入',
      value: formatMoney(summary.revenue),
      icon: DollarSign,
      bgColor: 'bg-gradient-to-br from-purple-500 to-purple-600',
      change: `${summary.conversionCount.toLocaleString()} 转化 · ${metricSourceLabel(metricSummary?.revenue.source)}收入`,
    },
    {
      title: '投放回报',
      value: summary.roi,
      icon: TrendingUp,
      bgColor: 'bg-gradient-to-br from-orange-500 to-orange-600',
      change: summary.cost > 0
        ? `${metricSourceLabel(metricSummary?.cost.source)}成本 ${formatMoney(summary.cost)}`
        : '暂无成本',
    },
  ];

  const handleFilterChange = (nextFilter: FilterType) => {
    setFilter(nextFilter);
    if (nextFilter === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ objectType: nextFilter });
    }
  };

  const handleOpenDetail = (item: UnifiedMarketingEffectItem) => {
    setSelectedEffectItem(item);
  };

  const emptyText =
    filter === 'all'
      ? error || '暂无数据复盘记录'
      : data?.emptyReasons?.[filter] || `${selectedFilterLabel}暂无复盘数据，请先产生触达、访问或成交记录。`;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">数据复盘</h1>
          <p className="mt-1 text-sm text-gray-500">
            统一查看推广活动、自动触达、推广页、权益资产与 Ami Glow 的触达、访问、成交和投放回报。
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Activity className="h-4 w-4" />
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.title} className={`${stat.bgColor} rounded-lg p-6 text-white shadow-lg`}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/20">
                    <stat.icon className="h-6 w-6" />
                  </div>
                  <div className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 text-sm font-medium">
                    <ArrowUpRight className="h-4 w-4" />
                    {stat.change}
                  </div>
                </div>
                <div className="mb-1 text-3xl font-bold">{stat.value}</div>
                <div className="text-sm opacity-90">{stat.title}</div>
              </div>
            ))}
          </div>

          {metricSummary && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <span className="font-medium text-slate-800">指标口径：</span>
              <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">真实收入：订单主归因减退款</span>
              <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">估算成本：非渠道账单</span>
              <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">汇总只计算一次，维度仅用于拆解</span>
            </div>
          )}

          <div className="grid gap-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 md:grid-cols-6">
            <div>
              <div className="text-xs font-medium text-emerald-700">终端待跟进</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{followUpSummary?.pending ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-emerald-700">处理中</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">
                {followUpSummary?.in_progress ?? followUpSummary?.inProgress ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-emerald-700">已完成跟进</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{followUpSummary?.completed ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-emerald-700">逾期未处理</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{followUpSummary?.overdue ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-emerald-700">预约/成交</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">
                {followUpSummary?.booked ?? 0}/{followUpSummary?.converted ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-emerald-700">成交金额</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{formatMoney(followUpSummary?.revenue ?? 0)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-gray-900">人员跟进表现</h2>
                <p className="mt-1 text-sm text-gray-500">按店长、前台、顾问/美容师队列统计终端跟进完成率和成交转化。</p>
              </div>
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                数据源：终端跟进任务
              </span>
            </div>
            {followUpSummary?.assigneeStats?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">跟进人/队列</th>
                      <th className="px-3 py-2 font-medium">角色</th>
                      <th className="px-3 py-2 font-medium">任务数</th>
                      <th className="px-3 py-2 font-medium">已完成</th>
                      <th className="px-3 py-2 font-medium">完成率</th>
                      <th className="px-3 py-2 font-medium">预约/成交</th>
                      <th className="px-3 py-2 font-medium">成交率</th>
                      <th className="px-3 py-2 font-medium">逾期</th>
                      <th className="px-3 py-2 font-medium">成交金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {followUpSummary.assigneeStats.map((item) => (
                      <tr key={item.assigneeKey}>
                        <td className="px-3 py-3 font-medium text-gray-900">{item.assigneeName}</td>
                        <td className="px-3 py-3 text-gray-600">{item.assigneeRoleLabel}</td>
                        <td className="px-3 py-3 text-gray-700">{item.total}</td>
                        <td className="px-3 py-3 text-gray-700">{item.completed}</td>
                        <td className="px-3 py-3 text-emerald-700">{item.completionRate}%</td>
                        <td className="px-3 py-3 text-gray-700">
                          {item.booked}/{item.converted}
                        </td>
                        <td className="px-3 py-3 text-blue-700">{item.conversionRate}%</td>
                        <td className="px-3 py-3 text-red-600">{item.overdue}</td>
                        <td className="px-3 py-3 text-gray-900">{formatMoney(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                暂无人员跟进表现；下发并完成终端跟进任务后会自动统计。
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {filterOptions.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleFilterChange(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    filter === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {loading ? (
              <div className="p-12 text-center text-gray-500">正在加载数据复盘...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-500">{emptyText}</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filtered.map((item) => {
                  const Icon = getTypeIcon(item.objectType);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="block w-full p-5 text-left transition-colors hover:bg-gray-50"
                      onClick={() => handleOpenDetail(item)}
                    >
                      <div className="flex items-center gap-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-semibold text-gray-900">{item.objectName}</h3>
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${getTypeStyle(item.objectType)}`}>
                              {item.objectTypeLabel}
                            </span>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{item.status}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {item.exposureCount.toLocaleString()} 触达/访问
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MousePointerClick className="h-4 w-4" />
                              {item.clickCount.toLocaleString()} 点击
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Activity className="h-4 w-4" />
                              {item.metricsSource}
                            </span>
                          </div>
                          {item.relatedObjectName && (
                            <div className="mt-2 text-xs text-gray-500">关联对象：{item.relatedObjectName}</div>
                          )}
                          {(item.audienceName || item.promotionName || item.channelName) && (
                            <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                              {item.audienceName && (
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">
                                  <div className="font-medium text-slate-500">人群</div>
                                  <div className="mt-1 truncate">{item.audienceName}</div>
                                </div>
                              )}
                              {item.promotionName && (
                                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-800">
                                  <div className="font-medium text-amber-600">权益</div>
                                  <div className="mt-1 truncate">{item.promotionName}</div>
                                </div>
                              )}
                              {item.channelName && (
                                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800">
                                  <div className="font-medium text-emerald-600">渠道</div>
                                  <div className="mt-1 truncate">{item.channelName}</div>
                                </div>
                              )}
                            </div>
                          )}
                          {item.objectType === 'recommendation' && item.recommendationAttribution && (
                            <div className="mt-3 grid gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-900 md:grid-cols-3">
                              <div>
                                <div className="font-medium text-indigo-700">算法原推荐</div>
                                <div className="mt-1 truncate">
                                  {getPromotionLabel(item.recommendationAttribution.originalPromotion)
                                    || getPromotionLabel(item.recommendationAttribution.originalOffer)
                                    || '未记录'}
                                </div>
                              </div>
                              <div>
                                <div className="font-medium text-indigo-700">实际承接权益</div>
                                <div className="mt-1 truncate">
                                  {getPromotionLabel(item.recommendationAttribution.selectedPromotion)
                                    || getPromotionLabel(item.recommendationAttribution.selectedOffer)
                                    || '未记录'}
                                </div>
                              </div>
                              <div>
                                <div className="font-medium text-indigo-700">运营切换</div>
                                <div className={`mt-1 inline-flex rounded px-2 py-0.5 font-medium ${
                                  item.recommendationAttribution.promotionSwitched
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {item.recommendationAttribution.promotionSwitched ? '已切换' : '未切换'}
                                </div>
                              </div>
                            </div>
                          )}
                          {item.emptyReason && (
                            <div className="mt-2 text-xs text-amber-600">{item.emptyReason}</div>
                          )}
                        </div>

                        <div className="grid shrink-0 grid-cols-3 gap-6 text-right">
                          <div>
                            <div className="mb-1 text-sm text-gray-500">转化率</div>
                            <div className="text-lg font-bold text-green-600">{item.conversionRate}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-sm text-gray-500">收入</div>
                            <div className="text-lg font-bold text-blue-600">{formatMoney(item.revenue)}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-sm text-gray-500">投放回报</div>
                            <div className="text-lg font-bold text-purple-600">{item.roi}</div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <MarketingEffectDetailDialog
        open={Boolean(selectedEffectItem)}
        onOpenChange={(open) => !open && setSelectedEffectItem(null)}
        item={selectedEffectItem}
      />
    </div>
  );
}
