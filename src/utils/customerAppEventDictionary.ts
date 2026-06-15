import type { AmiGlowEvent } from '@/types/customer-app';

export const CUSTOMER_APP_EVENT_TYPE_OPTIONS = [
  { value: '', label: '全部事件类型' },
  { value: 'page_view', label: '页面浏览' },
  { value: 'click', label: '点击' },
  { value: 'activity_click', label: '活动点击' },
  { value: 'click_cta', label: 'CTA 点击' },
  { value: 'reserve_submit', label: '提交预约' },
  { value: 'miniapp_view_home', label: '浏览首页' },
  { value: 'miniapp_view_project', label: '浏览项目' },
  { value: 'miniapp_click_banner', label: '点击 Banner' },
  { value: 'miniapp_reservation_success', label: '预约成功' },
  { value: 'miniapp_complete_skin_test', label: '完成测肤' },
  { value: 'coupon_claimed', label: '领取优惠' },
  { value: 'coupon_redeemed', label: '核销优惠' },
  { value: 'order_paid', label: '支付成功' },
];

export const CUSTOMER_APP_CHANNEL_OPTIONS = [
  { value: '', label: '全部渠道' },
  { value: 'miniapp', label: '小程序' },
  { value: 'wechat', label: '微信' },
  { value: 'sms', label: '短信' },
  { value: 'staff_share', label: '顾问分享' },
  { value: 'poster', label: '门店海报' },
];

export const CUSTOMER_APP_TARGET_TYPE_OPTIONS = [
  { value: '', label: '全部对象' },
  { value: 'home', label: '首页' },
  { value: 'activity', label: '活动' },
  { value: 'reservation', label: '预约' },
  { value: 'project', label: '项目' },
  { value: 'product', label: '商品' },
  { value: 'card', label: '卡项' },
  { value: 'profile', label: '我的' },
  { value: 'promotion', label: '优惠活动' },
  { value: 'marketing_page', label: '营销页面' },
  { value: 'skin_test', label: '测肤记录' },
];

const labelFrom = (items: Array<{ value: string; label: string }>, value?: string | null, fallback = '-') => {
  if (!value) return fallback;
  return items.find((item) => item.value === value)?.label ?? value;
};

export const formatCustomerAppEventType = (eventType?: string | null) =>
  labelFrom(CUSTOMER_APP_EVENT_TYPE_OPTIONS, eventType);

export const formatCustomerAppTargetType = (targetType?: string | null) =>
  labelFrom(CUSTOMER_APP_TARGET_TYPE_OPTIONS, targetType);

export const formatCustomerAppChannel = (channel?: string | null) =>
  labelFrom(CUSTOMER_APP_CHANNEL_OPTIONS, channel, 'direct');

export const formatCustomerAppTarget = (event: AmiGlowEvent) => {
  const targetType = formatCustomerAppTargetType(event.targetType);
  return event.targetId ? `${targetType} #${event.targetId}` : targetType;
};

export const formatCustomerAppEventTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

export const getCustomerAppEventMetadataSummary = (metadata?: Record<string, unknown> | null) => {
  const payload = metadata?.payload && typeof metadata.payload === 'object'
    ? metadata.payload as Record<string, unknown>
    : metadata;
  if (!payload) return '-';

  const entries = ['page', 'path', 'title', 'button', 'module', 'utmSource']
    .map((key) => [key, payload[key]] as const)
    .filter(([, value]) => value !== undefined && value !== null && value !== '');

  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join('；');
};
