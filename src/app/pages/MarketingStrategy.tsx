import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Users, Calendar, TrendingUp, Smartphone } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { CreateActivityDialog } from '../components/CreateActivityDialog';
import { ActivityMiniPage, type ActivityPageData } from '../components/ActivityMiniPage';
import {
  buildActivityEffectFallback,
  MarketingEffectDetailDialog,
} from '../components/MarketingEffectDetailDialog';
import { getMarketingActivities, getUnifiedMarketingEffects } from '@/api/marketing';
import { getMarketingPagesPaginated } from '@/api/marketingPage';
import { buildMarketingPageUrl, normalizeMarketingShareUrl } from '@/config/marketingAssets';
import { toast } from 'sonner';
import type { MarketingActivity, MarketingPage, UnifiedMarketingEffectItem } from '@/types';
import type { ActivityPageSchema } from '@/types/ai';
import type { MarketingActivityStatus } from '@/types/marketing';
import { getMarketingActivityStatusLabel } from '@/utils/marketingStatus';

function formatActivityDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
}

function getOfferFromSchema(schema?: ActivityPageSchema) {
  const offerSection = schema?.sections.find((section) => section.type === 'offer');
  return offerSection?.type === 'offer' ? offerSection.offer : undefined;
}

function getLayoutFromSchema(schema?: ActivityPageSchema): ActivityPageData['layout'] {
  switch (schema?.theme?.tone) {
    case 'premium':
      return 'elegant';
    case 'friendly':
      return 'vibrant';
    case 'professional':
      return 'modern';
    default:
      return 'classic';
  }
}

function buildActivityPageData(activity: MarketingActivity): ActivityPageData {
  const schema = activity.pageSchema;
  return {
    title: schema?.title || activity.title,
    description: schema?.subtitle || activity.description,
    discount: getOfferFromSchema(schema) || activity.discount,
    startDate: formatActivityDate(activity.startDate),
    endDate: formatActivityDate(activity.endDate),
    targetCustomers: activity.targetCustomers,
    posterBg: activity.posterBg || schema?.theme?.primaryColor,
    posterImage: activity.posterImage || activity.image,
    posterTitleColor: activity.posterTitleColor || '#FFFFFF',
    layout: activity.posterBg ? 'classic' : getLayoutFromSchema(schema),
    storeName: '心悦茗美容养生会所',
    storePhone: '0571-88888888',
    pageSchema: schema,
    aiGenerationId: activity.aiGenerationId || String(activity.id),
  };
}

function getActivityPromotionLabel(activity: MarketingActivity) {
  return activity.primaryPromotion?.name || activity.offerJson?.promotionName || null;
}

function getMarketingPageUrl(page: MarketingPage) {
  return normalizeMarketingShareUrl(page.shareUrl) || buildMarketingPageUrl(page.slug);
}

export function MarketingStrategy() {
  const [searchParams] = useSearchParams();
  const focusedActivityId = Number(searchParams.get('focusActivityId') || 0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activityStatusFilter, setActivityStatusFilter] = useState<MarketingActivityStatus>('active');
  const [activities, setActivities] = useState<MarketingActivity[]>([]);
  const [activityPageData, setActivityPageData] = useState<ActivityPageData | null>(null);
  const [detailActivity, setDetailActivity] = useState<MarketingActivity | null>(null);
  const [detailEffectItem, setDetailEffectItem] = useState<UnifiedMarketingEffectItem | null>(null);
  const [activityPagesByActivityId, setActivityPagesByActivityId] = useState<Record<number, MarketingPage>>({});
  const [activityEffectsByActivityId, setActivityEffectsByActivityId] = useState<Record<number, UnifiedMarketingEffectItem>>({});

  const loadActivities = useCallback(async () => {
    try {
      const [data, pagesResponse, effectsResponse] = await Promise.all([
        getMarketingActivities(),
        getMarketingPagesPaginated({ page: 1, pageSize: 200, sourceType: 'activity' }),
        getUnifiedMarketingEffects({ objectType: 'activity' }).catch(() => ({ items: [] as UnifiedMarketingEffectItem[] })),
      ]);
      const nextActivityPages = pagesResponse.items.reduce<Record<number, MarketingPage>>((acc, page) => {
        const activityId = Number(page.activityId ?? page.sourceId);
        if (activityId && (!acc[activityId] || page.status === 'published')) {
          acc[activityId] = page;
        }
        return acc;
      }, {});
      const nextActivityEffects = effectsResponse.items.reduce<Record<number, UnifiedMarketingEffectItem>>((acc, item) => {
        const activityId = Number(item.objectId);
        if (activityId && item.objectType === 'activity') acc[activityId] = item;
        return acc;
      }, {});
      setActivities(data);
      setActivityPagesByActivityId(nextActivityPages);
      setActivityEffectsByActivityId(nextActivityEffects);
    } catch {
      toast.error('加载营销活动列表失败');
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    if (!focusedActivityId || activities.length === 0) return;
    const focused = activities.find((activity) => activity.id === focusedActivityId);
    if (focused) setActivityStatusFilter(focused.status);
  }, [activities, focusedActivityId]);

  const filteredActivities = activities.filter(a => a.status === activityStatusFilter);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500 text-white';
      case 'scheduled': return 'bg-yellow-500 text-white';
      case 'ended': return 'bg-gray-400 text-white';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handleOpenActivityDetail = async (activity: MarketingActivity) => {
    const fallback = buildActivityEffectFallback(activity);
    setDetailActivity(activity);
    setDetailEffectItem(fallback);
    try {
      const response = await getUnifiedMarketingEffects({ objectType: 'activity', objectId: activity.id });
      const matchedEffect = response.items.find((item) => Number(item.objectId) === activity.id);
      if (matchedEffect) {
        setDetailEffectItem(matchedEffect);
      }
    } catch {
      toast.warning('统一效果数据暂未加载，当前展示活动基础详情');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm text-gray-500">首页 / 智能营销 / 活动管理</div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">活动管理</h1>
          <p className="text-sm text-gray-500 mt-1">创建和管理营销活动，追踪活动效果</p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> 创建活动
        </button>
      </div>

      {focusedActivityId > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          已从 Agent 草稿定位到活动 ID {focusedActivityId}。请在下方高亮卡片中继续核对客群、权益、活动页和投放配置。
        </div>
      )}

      {/* 状态筛选标签 */}
      <div className="flex items-center gap-2">
        {(['active', 'scheduled', 'ended', 'draft', 'cancelled'] as const).map((status) => {
          const count = activities.filter(a => a.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setActivityStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activityStatusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {getMarketingActivityStatusLabel(status)} ({count})
            </button>
          );
        })}
      </div>

      {/* 活动卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredActivities.map((activity) => {
          const page = activityPagesByActivityId[activity.id];
          const effect = activityEffectsByActivityId[activity.id];
          const viewCount = effect?.exposureCount ?? 0;
          const isPagePublished = page?.status === 'published';
          const focused = activity.id === focusedActivityId;
          return (
          <div key={activity.id} className={`rounded-lg overflow-hidden transition-shadow ${focused ? 'border-2 border-blue-500 shadow-md shadow-blue-100' : 'border border-gray-200 hover:shadow-md'}`}>
            <div className="relative h-48" style={{ backgroundColor: activity.posterBg || '#6366f1' }}>
              {(activity.posterImage || activity.image) ? (
                <img src={activity.posterImage || activity.image} alt="" className="w-full h-full object-cover opacity-40" />
              ) : null}
              <div className="absolute inset-0 flex flex-col justify-between p-5">
                <div>
                  <div className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded text-white text-xs">{activity.discount}</div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white" style={{ color: activity.posterTitleColor || '#FFFFFF' }}>{activity.title}</h3>
                  <p className="text-sm mt-1 line-clamp-1" style={{ color: activity.posterTitleColor || '#FFFFFF', opacity: 0.8 }}>{activity.description}</p>
                </div>
              </div>
              <div className="absolute top-3 right-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(activity.status)}`}>
                  {activity.status}
                </span>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">浏览: {viewCount}次</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">参与: {activity.participants}人</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">转化: {activity.conversion}</span>
                </div>
                <div className="flex items-center gap-2 text-sm col-span-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {formatActivityDate(activity.startDate)} 至 {formatActivityDate(activity.endDate)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">目标客户:</span>
                <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">{activity.targetCustomers}</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">活动页:</span>
                <span className={`px-2 py-1 rounded text-xs ${isPagePublished ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {isPagePublished ? '已发布，可用于小程序/H5链接' : '未发布，仅预览'}
                </span>
              </div>
              {getActivityPromotionLabel(activity) && (
                <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  权益资产：{getActivityPromotionLabel(activity)}｜{activity.discount}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleOpenActivityDetail(activity)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" /> 查看效果
                </button>
                <button
                  onClick={() => {
                    if (isPagePublished) {
                      window.open(getMarketingPageUrl(page), '_blank');
                      return;
                    }
                    setActivityPageData(buildActivityPageData(activity));
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-4 h-4" /> {isPagePublished ? '打开发布页' : '预览活动页'}
                </button>
              </div>
            </div>
          </div>
          );
        })}
        {filteredActivities.length === 0 && (
          <div className="col-span-2 flex flex-col items-center justify-center py-16 text-gray-400">
            <Calendar className="w-12 h-12 mb-3" />
            <p className="text-sm">暂无{getMarketingActivityStatusLabel(activityStatusFilter)}的活动</p>
          </div>
        )}
      </div>

      <CreateActivityDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={loadActivities}
      />

      {/* 活动页面预览 */}
      {activityPageData && (
        <ActivityMiniPage data={activityPageData} onClose={() => setActivityPageData(null)} />
      )}

      <MarketingEffectDetailDialog
        open={Boolean(detailEffectItem)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailEffectItem(null);
            setDetailActivity(null);
          }
        }}
        item={detailEffectItem}
        activity={detailActivity}
      />
    </div>
  );
}
