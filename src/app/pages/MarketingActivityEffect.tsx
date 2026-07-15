import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock,
  DollarSign,
  Eye,
  Loader2,
  MousePointerClick,
  Tag,
  Target,
  Users,
} from 'lucide-react';
import { getMarketingActivityById, getUnifiedMarketingEffects } from '@/api/marketing';
import type { MarketingActivity, UnifiedMarketingEffectItem } from '@/types';
import { getMarketingActivityStatusLabel } from '@/utils/marketingStatus';

function formatActivityDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
}

function formatMoney(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function metricSourceLabel(source?: 'actual' | 'predicted' | 'estimated') {
  if (source === 'actual') return '真实';
  if (source === 'predicted') return '预测';
  if (source === 'estimated') return '估算';
  return '基础字段（非实际效果）';
}

function parsePercent(value?: string) {
  const numeric = Number(String(value ?? '0').replace('%', ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getActivityPromotionLabel(activity: MarketingActivity) {
  return activity.primaryPromotion?.name || activity.offerJson?.promotionName || null;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700';
    case 'scheduled':
      return 'bg-yellow-100 text-yellow-700';
    case 'ended':
      return 'bg-gray-100 text-gray-600';
    case 'draft':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-blue-100 text-blue-700';
  }
}

function getRemainingText(activity: MarketingActivity) {
  if (activity.status !== 'active') return getMarketingActivityStatusLabel(activity.status);
  const endTime = new Date(activity.endDate).getTime();
  if (Number.isNaN(endTime)) return '进行中';
  const days = Math.max(0, Math.ceil((endTime - Date.now()) / 86400000));
  return `进行中（剩余 ${days} 天）`;
}

export function MarketingActivityEffect() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [activity, setActivity] = useState<MarketingActivity | null>(null);
  const [effectItem, setEffectItem] = useState<UnifiedMarketingEffectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadActivityEffect = useCallback(async () => {
    const activityId = Number(id);
    if (!Number.isInteger(activityId) || activityId <= 0) {
      setActivity(null);
      setEffectItem(null);
      setError('活动 ID 无效，无法加载活动详情。');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [activityData, effectsResponse] = await Promise.all([
        getMarketingActivityById(activityId),
        getUnifiedMarketingEffects({ objectType: 'activity', objectId: activityId }),
      ]);
      const matchedEffect = effectsResponse.items.find((item) => Number(item.objectId) === activityId) ?? null;
      setActivity(activityData);
      setEffectItem(matchedEffect);
    } catch {
      setActivity(null);
      setEffectItem(null);
      setError('活动详情加载失败，请确认活动是否存在或稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadActivityEffect();
  }, [loadActivityEffect]);

  const metrics = useMemo(() => {
    const participants = Number(activity?.participants ?? 0);
    const conversionRate = effectItem?.conversionRate ?? activity?.conversion ?? '0%';
    const conversionCount = effectItem?.conversionCount ?? Math.round(participants * parsePercent(activity?.conversion) / 100);
    return {
      exposureCount: effectItem?.exposureCount ?? participants,
      clickCount: effectItem?.clickCount ?? 0,
      participants,
      conversionCount,
      conversionRate,
      revenue: effectItem?.revenue ?? 0,
      cost: effectItem?.cost ?? 0,
      roi: effectItem?.roi ?? '0',
    };
  }, [activity, effectItem]);

  const chartBars = useMemo(() => {
    const maxValue = Math.max(metrics.exposureCount, metrics.clickCount, metrics.conversionCount, 1);
    return [
      { label: '曝光/浏览', value: metrics.exposureCount, color: 'bg-blue-500' },
      { label: '点击', value: metrics.clickCount, color: 'bg-purple-500' },
      { label: '转化', value: metrics.conversionCount, color: 'bg-green-500' },
    ].map((item) => ({
      ...item,
      height: Math.max(8, Math.round((item.value / maxValue) * 100)),
    }));
  }, [metrics]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在加载活动详情...
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-500">
        <AlertCircle className="h-10 w-10 text-orange-500" />
        <div className="text-sm">{error || '未找到活动详情。'}</div>
        <button
          onClick={() => navigate('/customer-marketing/activity-management')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          返回活动列表
        </button>
      </div>
    );
  }

  const posterImage = activity.posterImage || activity.image;
  const promotionLabel = getActivityPromotionLabel(activity);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="mb-2 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{activity.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(activity.status)}`}>
              {activity.status}
            </span>
            <span className="text-sm text-gray-500">
              {formatActivityDate(activity.startDate)} 至 {formatActivityDate(activity.endDate)}
            </span>
            {effectItem?.metricsSource && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                {effectItem.metricsSource}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => navigate(`/customer-marketing/effect-analysis?objectType=activity&objectId=${activity.id}`)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          查看统一效果分析
        </button>
      </div>

      <div
        className="relative min-h-56 overflow-hidden rounded-lg"
        style={{ backgroundColor: activity.posterBg || '#475569' }}
      >
        {posterImage ? (
          <img src={posterImage} alt={activity.title} className="absolute inset-0 h-full w-full object-cover opacity-50" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative flex min-h-56 flex-col justify-end p-6">
          <div className="mb-3 inline-flex w-fit rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white backdrop-blur">
            {activity.discount || promotionLabel || '营销活动'}
          </div>
          <h2 className="text-3xl font-bold text-white">{activity.title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/85">{activity.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-lg bg-blue-50 p-5">
          <Eye className="mb-3 h-5 w-5 text-blue-600" />
          <div className="text-2xl font-bold text-blue-900">{metrics.exposureCount.toLocaleString()}</div>
          <div className="text-sm text-blue-600">浏览/曝光</div>
          <div className="mt-1 text-xs text-blue-500">{metricSourceLabel(effectItem?.metrics?.exposure.source)}</div>
        </div>
        <div className="rounded-lg bg-purple-50 p-5">
          <MousePointerClick className="mb-3 h-5 w-5 text-purple-600" />
          <div className="text-2xl font-bold text-purple-900">{metrics.clickCount.toLocaleString()}</div>
          <div className="text-sm text-purple-600">点击量</div>
        </div>
        <div className="rounded-lg bg-green-50 p-5">
          <Users className="mb-3 h-5 w-5 text-green-600" />
          <div className="text-2xl font-bold text-green-900">{metrics.participants.toLocaleString()}</div>
          <div className="text-sm text-green-600">参与人数</div>
          <div className="mt-1 text-xs text-green-500">活动配置值（非实际转化）</div>
        </div>
        <div className="rounded-lg bg-orange-50 p-5">
          <Target className="mb-3 h-5 w-5 text-orange-600" />
          <div className="text-2xl font-bold text-orange-900">{metrics.conversionRate}</div>
          <div className="text-sm text-orange-600">转化率</div>
        </div>
        <div className="rounded-lg bg-pink-50 p-5">
          <DollarSign className="mb-3 h-5 w-5 text-pink-600" />
          <div className="text-2xl font-bold text-pink-900">{formatMoney(metrics.revenue)}</div>
          <div className="text-sm text-pink-600">归因营收</div>
          <div className="mt-1 text-xs text-pink-500">{metricSourceLabel(effectItem?.metrics?.revenue.source)}收入</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg bg-gray-50 p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
            <Activity className="h-5 w-5 text-blue-600" />
            活动信息
          </h3>
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs text-gray-500">活动描述</div>
              <div className="text-sm text-gray-800">{activity.description || '-'}</div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">活动时间</div>
                  <div className="text-sm text-gray-800">
                    {formatActivityDate(activity.startDate)} 至 {formatActivityDate(activity.endDate)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Target className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">目标客户</div>
                  <div className="text-sm text-gray-800">{effectItem?.audienceName || activity.targetCustomers || '-'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">权益内容</div>
                  <div className="text-sm font-medium text-blue-600">{activity.discount || '-'}</div>
                  {promotionLabel && (
                    <div className="mt-1 text-xs text-amber-700">来自权益资产库：{promotionLabel}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500">活动状态</div>
                  <div className="text-sm text-gray-800">{getRemainingText(activity)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            效果概览
          </h3>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-lg font-semibold text-gray-900">{metrics.conversionCount}</div>
              <div className="text-xs text-gray-500">转化数</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-lg font-semibold text-gray-900">{formatMoney(metrics.cost)}</div>
              <div className="text-xs text-gray-500">投入成本</div>
              <div className="mt-1 text-[11px] text-amber-600">{metricSourceLabel(effectItem?.metrics?.cost.source)}成本</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-lg font-semibold text-gray-900">{metrics.roi}</div>
              <div className="text-xs text-gray-500">ROI</div>
            </div>
          </div>
          <div className="flex h-48 items-end gap-4">
            {chartBars.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end rounded bg-gray-100">
                  <div className={`w-full rounded-t ${bar.color}`} style={{ height: `${bar.height}%` }} />
                </div>
                <div className="text-xs text-gray-500">{bar.label}</div>
                <div className="text-sm font-medium text-gray-900">{bar.value.toLocaleString()}</div>
              </div>
            ))}
          </div>
          {effectItem?.emptyReason && (
            <div className="mt-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              {effectItem.emptyReason}
            </div>
          )}
          {!effectItem && (
            <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              暂未获取到统一效果明细，当前展示活动基础参与与转化数据。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
