import type { MarketingParamValue, MarketingTriggerOption, MarketingTriggerRule } from '@/types';

export function createTriggerRuleFromOption(option: MarketingTriggerOption): MarketingTriggerRule {
  return {
    type: option.type,
    params: JSON.parse(JSON.stringify(option.defaultParams)) as Record<string, MarketingParamValue>,
    parameterSource: 'system_default',
  };
}

export function customizeTriggerRule(
  rule: MarketingTriggerRule,
  key: string,
  value: MarketingParamValue,
): MarketingTriggerRule {
  return {
    ...rule,
    params: { ...rule.params, [key]: value },
    parameterSource: 'customized',
  };
}

const VALUE_LABELS: Record<string, string> = {
  birthday_month: '生日当月',
  birthday_day: '生日当天',
  once_per_year: '每年一次',
  auto_upcoming_major_holiday: '下一个主要节日',
  current: '当前季节',
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
  facial_care: '面部护理',
  body_care: '身体护理',
  use_or_renew: '提醒使用或续费',
  greater_than: '超过',
  greater_than_or_equal: '达到或超过',
  less_than: '少于',
  cumulative: '累计消费',
  year: '近一年',
  vip_care: '会员关怀',
  light: '轻度',
  medium: '中等',
  strong: '强力',
  gold: '金卡会员',
  platinum: '白金会员',
  diamond: '钻石会员',
  privilege_care: '专属权益关怀',
  first_order_coupon: '首单体验券',
  coupon_expiry: '优惠券即将到期',
  coupon_claimed_unused: '领券未核销',
  browse_abandonment: '小程序浏览未预约',
  booking_abandonment: '预约放弃',
  seasonal_skin_care: '季节换肤护理',
  holiday_campaign: '节假日营销',
  vip_privilege_care: '高价值客户权益维护',
  product_replenishment: '商品补货提醒',
  referral_campaign: '老带新/闺蜜同行',
  package_remaining: '卡项剩余次数',
  dry: '干性肌肤',
  oily: '油性肌肤',
  sensitive: '敏感肌肤',
  combination: '混合肌肤',
  normal: '中性肌肤',
  aura_lite: 'Ami Aura Lite 检测',
  health_profile: '健康档案',
  manual: '手动维护',
  skin_care_plan: '护肤方案推荐',
  anti_aging_entry: '抗初老主题',
  sms: '短信',
  miniapp: '小程序',
  wechat: '微信',
  group: '社群',
  store: '门店话术',
  moments: '朋友圈',
  auto_by_season: '按季节自动匹配',
  all: '全部',
  project: '项目',
  skin_care: '护肤品',
  last_top_category: '最近偏好项目',
  related_project: '相关项目',
  coupon: '优惠券',
};

function formatValue(value: MarketingParamValue): string {
  if (Array.isArray(value)) return value.map((item) => VALUE_LABELS[String(item)] ?? String(item)).join('、');
  if (typeof value === 'boolean') return value ? '是' : '否';
  return VALUE_LABELS[String(value)] ?? String(value);
}

export function formatMarketingRuleParams(
  rule: MarketingTriggerRule,
  option?: MarketingTriggerOption,
): string {
  const params = rule.params;

  if (rule.type === 'dormant') {
    const parts = [`超过 ${params.days ?? 60} 天未到店`];
    if (params.excludePurchasedRecently) parts.push('排除近期已购买客户');
    if (params.excludeBooked) parts.push('排除已有预约客户');
    if (params.wakeLevel) parts.push(`唤醒力度：${formatValue(params.wakeLevel)}`);
    return parts.join('；');
  }

  if (rule.type === 'last_visit') {
    const operator = params.operator ? formatValue(params.operator) : '超过';
    const parts = [`最近到店时间${operator} ${params.days ?? 30} 天`];
    if (params.excludeBooked) parts.push('排除已有预约客户');
    return parts.join('；');
  }

  if (rule.type === 'birthday') {
    const offset = Number(params.offsetDays ?? -7);
    const timing = offset < 0 ? `生日前 ${Math.abs(offset)} 天` : offset > 0 ? `生日后 ${offset} 天` : '生日当天';
    return [`${timing}触达`, params.dateScope ? `权益周期：${formatValue(params.dateScope)}` : '', params.channels ? `触达渠道：${formatValue(params.channels)}` : '']
      .filter(Boolean)
      .join('；');
  }

  if (rule.type === 'consumption') {
    return [`${formatValue(params.period ?? 'cumulative')} ${formatValue(params.operator ?? 'greater_than_or_equal')} ${params.amount ?? 0} 元`, params.tierAction ? `动作：${formatValue(params.tierAction)}` : '']
      .filter(Boolean)
      .join('；');
  }

  if (rule.type === 'member_level') {
    return [`会员等级：${formatValue(params.levels ?? [])}`, params.actionIntent ? `动作：${formatValue(params.actionIntent)}` : '', params.channels ? `触达渠道：${formatValue(params.channels)}` : '']
      .filter(Boolean)
      .join('；');
  }

  if (rule.type === 'skin_type') {
    return [`肤质类型：${formatValue(params.skinTypes ?? [])}`, params.sourcePriority ? `数据来源：${formatValue(params.sourcePriority)}` : '', params.recommendMode ? `推荐方式：${formatValue(params.recommendMode)}` : '']
      .filter(Boolean)
      .join('；');
  }

  const schemaByKey = new Map(option?.paramSchema.map((field) => [field.key, field]) ?? []);
  return Object.entries(params).map(([key, value]) => {
    const field = schemaByKey.get(key);
    const label = field?.label ?? key;
    const formatted = Array.isArray(value)
      ? value.map((item) => field?.options?.find((optionItem) => optionItem.value === String(item))?.label ?? formatValue(item)).join('、')
      : field?.options?.find((optionItem) => optionItem.value === String(value))?.label ?? formatValue(value);
    return `${label}：${formatted}`;
  }).join('；');
}
