import {
  Activity,
  BarChart3,
  Calendar,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Gift,
  MousePointerClick,
  Sparkles,
  Smartphone,
  Tag,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import type { MarketingActivity, MarketingEffectObjectType, UnifiedMarketingEffectItem } from '@/types';

interface MarketingEffectDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: UnifiedMarketingEffectItem | null;
  activity?: MarketingActivity | null;
}

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

function parsePercent(value?: string) {
  const numeric = Number(String(value ?? '0').replace('%', ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getPromotionLabel(value?: Record<string, unknown> | null) {
  if (!value) return '';
  return String(value.promotionName ?? value.name ?? value.label ?? value.discountText ?? value.promotionId ?? '').trim();
}

function getActivityPromotionLabel(activity?: MarketingActivity | null) {
  return activity?.primaryPromotion?.name || activity?.offerJson?.promotionName || null;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case '进行中':
      return 'bg-green-100 text-green-700';
    case '即将开始':
      return 'bg-yellow-100 text-yellow-700';
    case '已结束':
      return 'bg-gray-100 text-gray-600';
    case '草稿':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-blue-100 text-blue-700';
  }
}

function getTypeStyle(type: MarketingEffectObjectType) {
  const styles: Record<MarketingEffectObjectType, string> = {
    activity: 'bg-blue-100 text-blue-700',
    auto: 'bg-purple-100 text-purple-700',
    page: 'bg-cyan-100 text-cyan-700',
    promotion: 'bg-amber-100 text-amber-700',
    recommendation: 'bg-indigo-100 text-indigo-700',
    glow: 'bg-emerald-100 text-emerald-700',
  };
  return styles[type];
}

function getTypeIcon(type: MarketingEffectObjectType) {
  const icons: Record<MarketingEffectObjectType, typeof Activity> = {
    activity: Target,
    auto: Zap,
    page: FileText,
    promotion: Gift,
    recommendation: Sparkles,
    glow: Smartphone,
  };
  return icons[type];
}

function getRemainingText(activity?: MarketingActivity | null, item?: UnifiedMarketingEffectItem | null) {
  if (!activity) return item?.status || '-';
  if (activity.status !== '进行中') return activity.status;
  const endTime = new Date(activity.endDate).getTime();
  if (Number.isNaN(endTime)) return '进行中';
  const days = Math.max(0, Math.ceil((endTime - Date.now()) / 86400000));
  return `进行中（剩余 ${days} 天）`;
}

export function buildActivityEffectFallback(activity: MarketingActivity): UnifiedMarketingEffectItem {
  const participants = Number(activity.participants ?? 0);
  const conversionRate = activity.conversion || '0%';
  return {
    id: `activity-${activity.id}`,
    objectId: activity.id,
    objectType: 'activity',
    objectTypeLabel: '推广活动',
    objectName: activity.title,
    status: activity.status,
    exposureCount: participants,
    clickCount: 0,
    conversionCount: Math.round((participants * parsePercent(conversionRate)) / 100),
    revenue: 0,
    cost: 0,
    roi: '0',
    conversionRate,
    dateRange: `${formatActivityDate(activity.startDate)} 至 ${formatActivityDate(activity.endDate)}`,
    metricsSource: '活动基础信息，暂无统一效果明细',
    audienceName: activity.targetCustomers,
    promotionName: getActivityPromotionLabel(activity) || activity.discount,
    channelName: activity.publishStatus === 'published' ? '小程序/H5' : '未发布',
    emptyReason: '暂未获取到统一效果明细，当前展示活动基础参与与转化数据。',
  };
}

export function MarketingEffectDetailDialog({ open, onOpenChange, item, activity }: MarketingEffectDetailDialogProps) {
  if (!item) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>效果详情</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-500">暂无可展示的详情数据。</div>
        </DialogContent>
      </Dialog>
    );
  }

  const Icon = getTypeIcon(item.objectType);
  const promotionLabel = getActivityPromotionLabel(activity) || item.promotionName || '';
  const title = activity?.title || item.objectName;
  const description = activity?.description || item.metricsSource || '-';
  const posterImage = activity?.posterImage || activity?.image;
  const posterBg = activity?.posterBg || '#475569';
  const dateRange = activity
    ? `${formatActivityDate(activity.startDate)} 至 ${formatActivityDate(activity.endDate)}`
    : item.dateRange || (item.lastEventAt ? `最近事件：${formatActivityDate(item.lastEventAt)}` : '-');
  const participants = Number(activity?.participants ?? item.exposureCount ?? 0);
  const conversionCount = item.conversionCount ?? Math.round((participants * parsePercent(item.conversionRate)) / 100);
  const metrics = {
    exposureCount: item.exposureCount ?? participants,
    clickCount: item.clickCount ?? 0,
    participants,
    conversionCount,
    conversionRate: item.conversionRate || activity?.conversion || '0%',
    revenue: item.revenue ?? 0,
    cost: item.cost ?? 0,
    roi: item.roi || '0',
  };
  const maxValue = Math.max(metrics.exposureCount, metrics.participants, metrics.conversionCount, 1);
  const behaviorBars = [
    { label: '浏览', value: metrics.exposureCount, color: 'bg-blue-500' },
    { label: '参与', value: metrics.participants, color: 'bg-purple-500' },
    { label: '成交', value: metrics.conversionCount, color: 'bg-green-500' },
  ].map((bar) => ({
    ...bar,
    height: Math.max(8, Math.round((bar.value / maxValue) * 100)),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">{title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-gray-500">
                <span className={`rounded px-2 py-0.5 font-medium ${getTypeStyle(item.objectType)}`}>
                  {item.objectTypeLabel}
                </span>
                <span className={`rounded px-2 py-0.5 font-medium ${getStatusBadgeClass(item.status)}`}>
                  {item.status}
                </span>
                <span>{dateRange}</span>
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="relative min-h-56 overflow-hidden rounded-lg" style={{ backgroundColor: posterBg }}>
            {posterImage ? (
              <img src={posterImage} alt={title} className="absolute inset-0 h-full w-full object-cover opacity-50" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="relative flex min-h-56 flex-col justify-end p-6">
              <div className="mb-3 inline-flex w-fit rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white backdrop-blur">
                {activity?.discount || promotionLabel || item.objectTypeLabel}
              </div>
              <h2 className="text-3xl font-bold text-white">{title}</h2>
              <p className="mt-2 max-w-3xl text-sm text-white/85">{description}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="rounded-lg bg-blue-50 p-5">
              <Eye className="mb-3 h-5 w-5 text-blue-600" />
              <div className="text-2xl font-bold text-blue-900">{metrics.exposureCount.toLocaleString()}</div>
              <div className="text-sm text-blue-600">浏览/曝光</div>
            </div>
            <div className="rounded-lg bg-purple-50 p-5">
              <MousePointerClick className="mb-3 h-5 w-5 text-purple-600" />
              <div className="text-2xl font-bold text-purple-900">{metrics.clickCount.toLocaleString()}</div>
              <div className="text-sm text-purple-600">点击量</div>
            </div>
            <div className="rounded-lg bg-green-50 p-5">
              <Users className="mb-3 h-5 w-5 text-green-600" />
              <div className="text-2xl font-bold text-green-900">{metrics.participants.toLocaleString()}</div>
              <div className="text-sm text-green-600">触达/参与</div>
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
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-lg bg-gray-50 p-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
                <Activity className="h-5 w-5 text-blue-600" />
                {item.objectType === 'activity' ? '活动信息' : '对象信息'}
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="mb-1 text-xs text-gray-500">效果口径</div>
                  <div className="text-sm text-gray-800">{item.metricsSource || '-'}</div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">活动时间</div>
                      <div className="text-sm text-gray-800">{dateRange}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Target className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">目标客户</div>
                      <div className="text-sm text-gray-800">{item.audienceName || activity?.targetCustomers || '-'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Tag className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">权益内容</div>
                      <div className="text-sm font-medium text-blue-600">
                        {activity?.discount || item.promotionName || '-'}
                      </div>
                      {promotionLabel && (
                        <div className="mt-1 text-xs text-amber-700">来自权益资产库：{promotionLabel}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">当前状态</div>
                      <div className="text-sm text-gray-800">{getRemainingText(activity, item)}</div>
                    </div>
                  </div>
                </div>
                {item.relatedObjectName && (
                  <div className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600">
                    <span className="font-medium text-gray-900">关联对象：</span>
                    {item.relatedObjectName}
                  </div>
                )}
                {item.channelName && (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <span className="font-medium text-emerald-700">触达渠道：</span>
                    {item.channelName}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                行为明细
              </h3>
              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-lg font-semibold text-gray-900">{metrics.exposureCount.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">浏览</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-lg font-semibold text-gray-900">{metrics.participants.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">参与</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-lg font-semibold text-gray-900">{metrics.conversionCount.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">成交</div>
                </div>
              </div>
              <div className="flex h-48 items-end gap-4">
                {behaviorBars.map((bar) => (
                  <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end rounded bg-gray-100">
                      <div className={`w-full rounded-t ${bar.color}`} style={{ height: `${bar.height}%` }} />
                    </div>
                    <div className="text-xs text-gray-500">{bar.label}</div>
                    <div className="text-sm font-medium text-gray-900">{bar.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              {item.emptyReason && (
                <div className="mt-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                  {item.emptyReason}
                </div>
              )}
            </div>
          </div>

          {item.recommendationAttribution && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
              <div className="text-sm font-semibold text-indigo-900">智能推荐归因</div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <div className="text-xs font-medium text-indigo-700">算法原推荐</div>
                  <div className="mt-1 text-indigo-950">
                    {getPromotionLabel(item.recommendationAttribution.originalPromotion)
                      || getPromotionLabel(item.recommendationAttribution.originalOffer)
                      || '未记录'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-indigo-700">实际承接权益</div>
                  <div className="mt-1 text-indigo-950">
                    {getPromotionLabel(item.recommendationAttribution.selectedPromotion)
                      || getPromotionLabel(item.recommendationAttribution.selectedOffer)
                      || '未记录'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-indigo-700">运营切换</div>
                  <div className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                    item.recommendationAttribution.promotionSwitched
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {item.recommendationAttribution.promotionSwitched ? '已切换' : '未切换'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
