const RULE_TEMPLATE_VERSION = '1.0.0';

const numberField = (key: string, label: string, suffix = '天', min = 0, max = 365) => ({
  key,
  label,
  type: 'number',
  min,
  max,
  suffix,
});

const booleanField = (key: string, label: string) => ({ key, label, type: 'boolean' });

const multiChannelField = {
  key: 'channels',
  label: '触达渠道',
  type: 'multi_select',
  options: [
    { label: '短信', value: 'sms' },
    { label: '小程序', value: 'miniapp' },
    { label: '微信', value: 'wechat' },
    { label: '门店话术', value: 'store' },
    { label: '社群', value: 'group' },
    { label: '朋友圈', value: 'moments' },
  ],
};

const option = (
  type: string,
  category: string,
  label: string,
  description: string,
  priority: string,
  defaultParams: Record<string, unknown>,
  paramSchema: unknown[] = [],
) => ({ type, category, label, description, priority, defaultParams, paramSchema });

const defaultTriggerOptions = [
  option('coupon_expiry', '时间触发', '优惠券即将到期', '优惠券 D-7/D-3/D-1 到期提醒，推动预约和核销。', 'P0',
    { beforeDays: 7, remindSteps: [7, 3, 1], excludeBooked: true, channels: ['miniapp', 'sms'] },
    [numberField('beforeDays', '提前提醒'), booleanField('excludeBooked', '排除已有预约客户'), multiChannelField]),
  option('card_expiry', '行为触发', '次卡/套餐即将到期', '次卡或套餐剩余次数较少、临近到期时提醒使用或续费。', 'P0',
    { beforeDays: 30, remainingTimes: 1, cardType: 'all', actionIntent: 'use_or_renew', channels: ['miniapp', 'sms'] },
    [numberField('beforeDays', '到期提前'), numberField('remainingTimes', '剩余次数阈值', '次', 0, 20), multiChannelField]),
  option('booking_abandonment', '行为触发', '预约放弃', '客户进入预约流程后未提交，自动召回继续预约。', 'P0',
    { windowHours: 2, recommendAdjacentSlots: true, channels: ['miniapp', 'sms'] },
    [{ key: 'windowHours', label: '放弃后', type: 'number', min: 1, max: 72, suffix: '小时' }, booleanField('recommendAdjacentSlots', '推荐相邻时段'), multiChannelField]),
  option('dormant', '行为触发', '沉睡客户唤醒', '超过指定天数未到店，排除近期购买或已有预约客户。', 'P0',
    { days: 60, excludePurchasedRecently: true, excludeBooked: true, wakeLevel: 'medium', channels: ['sms', 'miniapp'] },
    [numberField('days', '未到店超过'), booleanField('excludePurchasedRecently', '排除近期已购'), booleanField('excludeBooked', '排除已有预约'), multiChannelField]),
  option('care_cycle', '时间触发', '护理周期到期', '上次护理后按 21-45 天周期提醒复购预约。', 'P1',
    { cycleDays: 28, lastServiceType: 'facial_care', remindDaysBefore: 3, channels: ['miniapp', 'sms'] },
    [numberField('cycleDays', '护理周期'), numberField('remindDaysBefore', '提前提醒'), multiChannelField]),
  option('browse_abandonment', '行为触发', '小程序浏览未预约', '浏览项目/活动页后 24 小时未预约，自动推送项目案例和体验券。', 'P1',
    { windowHours: 24, minViewCount: 1, targetType: 'project', excludeBooked: true, channels: ['miniapp'] },
    [{ key: 'windowHours', label: '浏览后', type: 'number', min: 1, max: 168, suffix: '小时' }, { key: 'minViewCount', label: '最低浏览次数', type: 'number', min: 1, max: 20, suffix: '次' }, booleanField('excludeBooked', '排除已有预约'), multiChannelField]),
  option('coupon_claimed_unused', '行为触发', '领券未核销', '客户领券后未预约或未核销，自动提醒使用。', 'P1',
    { unusedDays: 3, excludePurchasedRecently: true, channels: ['miniapp', 'sms'] },
    [numberField('unusedDays', '领券后未使用'), booleanField('excludePurchasedRecently', '排除近期已购'), multiChannelField]),
  option('seasonal_skin_care', '时间触发', '季节换肤护理', '按春敏、夏季控油防晒、秋冬补水修护生成季节护理推荐。', 'P2',
    { season: 'current', leadDays: 15, skinTypes: 'auto_by_season', projectCategories: 'auto_by_season', channels: ['miniapp', 'wechat'] },
    [numberField('leadDays', '提前预热'), multiChannelField]),
  option('seasonal', '时间触发', '季节护理', '兼容旧版季节护理规则，默认映射到季节换肤护理。', 'P2',
    { season: 'current', leadDays: 15, skinTypes: 'auto_by_season', projectCategories: 'auto_by_season', channels: ['miniapp', 'wechat'] },
    [numberField('leadDays', '提前预热'), multiChannelField]),
  option('holiday_campaign', '时间触发', '节假日营销', '节日前 15-30 天预热女神节、母亲节、520、七夕等主题活动。', 'P2',
    { holiday: 'auto_upcoming_major_holiday', leadDays: 21, channels: ['miniapp', 'wechat'] },
    [numberField('leadDays', '提前预热'), multiChannelField]),
  option('holiday', '时间触发', '节日营销', '兼容旧版节日营销规则，默认映射到节假日营销活动。', 'P2',
    { holiday: 'auto_upcoming_major_holiday', leadDays: 21, channels: ['miniapp', 'wechat'] },
    [numberField('leadDays', '提前预热'), multiChannelField]),
  option('vip_privilege_care', '属性触发', '高价值客户权益维护', '铂金/黄金/VIP 客户季度权益、生日或周年关怀。', 'P2',
    { levels: ['gold', 'platinum', 'diamond'], actionIntent: 'privilege_care', channels: ['wechat', 'store'] },
    [{ key: 'levels', label: '会员等级', type: 'multi_select', options: [{ label: '金卡会员', value: 'gold' }, { label: '白金会员', value: 'platinum' }, { label: '钻石会员', value: 'diamond' }] }, multiChannelField]),
  option('product_replenishment', '行为触发', '商品补货提醒', '按护肤品消耗周期提醒补货或搭配护理。', 'P2',
    { replenishmentDays: 45, productCategory: 'skin_care', channels: ['miniapp', 'wechat'] },
    [numberField('replenishmentDays', '预计消耗周期'), multiChannelField]),
  option('referral_campaign', '行为触发', '老带新/闺蜜同行', '稳定客户、分享意愿强客户触发裂变活动。', 'P3',
    { minVisitCount: 3, rewardType: 'coupon', channels: ['miniapp', 'moments', 'group'] },
    [{ key: 'minVisitCount', label: '最低到店次数', type: 'number', min: 1, max: 100, suffix: '次' }, multiChannelField]),
  option('birthday', '时间触发', '生日触发', '生日月或生日前自动触达生日权益。', 'P1',
    { offsetDays: -7, dateScope: 'birthday_month', channels: ['miniapp', 'sms'] },
    [numberField('offsetDays', '生日偏移天数', '天', -30, 30), multiChannelField]),
  option('last_visit', '行为触发', '最近消费时间', '最近到店超过指定天数时触发轻唤醒。', 'P1',
    { operator: 'greater_than', days: 30, excludeBooked: true, channels: ['sms', 'miniapp'] },
    [numberField('days', '未到店超过'), booleanField('excludeBooked', '排除已有预约'), multiChannelField]),
  option('consumption', '行为触发', '消费金额', '累计或周期消费达到门槛，触发会员权益或升级。', 'P2',
    { period: 'cumulative', operator: 'greater_than_or_equal', amount: 5000, tierAction: 'vip_care' },
    [{ key: 'amount', label: '消费金额', type: 'number', min: 0, max: 1000000, suffix: '元' }]),
  option('member_level', '属性触发', '会员等级', '按会员等级触发权益维护。', 'P2',
    { levels: ['gold', 'platinum', 'diamond'], actionIntent: 'privilege_care', channels: ['wechat', 'store'] },
    [{ key: 'levels', label: '会员等级', type: 'multi_select', options: [{ label: '金卡会员', value: 'gold' }, { label: '白金会员', value: 'platinum' }, { label: '钻石会员', value: 'diamond' }] }, multiChannelField]),
  option('skin_type', '属性触发', '肤质类型', '按肤质触发护肤方案推荐。', 'P2',
    { skinTypes: ['dry', 'oily', 'sensitive', 'combination'], sourcePriority: ['aura_lite', 'health_profile', 'manual'], recommendMode: 'skin_care_plan' },
    [{ key: 'skinTypes', label: '肤质类型', type: 'multi_select', options: [{ label: '干性肌肤', value: 'dry' }, { label: '油性肌肤', value: 'oily' }, { label: '敏感肌肤', value: 'sensitive' }, { label: '混合肌肤', value: 'combination' }] }]),
  option('visit_frequency', '行为触发', '到店频次', '观察窗口内到店次数变化。', 'P2',
    { windowDays: 90, operator: 'less_than', count: 2, compareToPreviousWindow: true },
    [numberField('windowDays', '观察窗口'), { key: 'count', label: '次数阈值', type: 'number', min: 0, max: 100, suffix: '次' }]),
  option('visit_gap', '行为触发', '到店间隔异常', '当前到店间隔超过个人历史均值倍数。', 'P1',
    { gapRatio: 1.5, minDays: 45, excludeNewCustomer: true },
    [{ key: 'gapRatio', label: '间隔倍数', type: 'number', min: 1, max: 10, suffix: '倍' }, numberField('minDays', '最小间隔')]),
  option('service_interest', '行为触发', '项目偏好', '按历史项目偏好推荐相关项目或套餐。', 'P2',
    { windowDays: 180, minCount: 2, projectCategory: 'last_top_category', recommendMode: 'related_project' },
    [numberField('windowDays', '观察窗口'), { key: 'minCount', label: '最低次数', type: 'number', min: 1, max: 20, suffix: '次' }]),
  option('new_customer', '属性触发', '新客转化', '新客建档后首单或二次到店引导。', 'P1',
    { withinDays: 7, hasNoOrder: true, touchDay: 3, defaultAction: 'first_order_coupon' },
    [numberField('withinDays', '建档后窗口'), numberField('touchDay', '第几天触达')]),
  option('age_range', '属性触发', '年龄区间', '按年龄段推荐抗初老、维稳等主题。', 'P3',
    { minAge: 25, maxAge: 40, theme: 'anti_aging_entry', channels: ['miniapp', 'wechat'] },
    [{ key: 'minAge', label: '最小年龄', type: 'number', min: 0, max: 100, suffix: '岁' }, { key: 'maxAge', label: '最大年龄', type: 'number', min: 0, max: 100, suffix: '岁' }, multiChannelField]),
];

function mapCategoryToCode(category: string) {
  if (category === '时间触发') return 'time';
  if (category === '属性触发') return 'attribute';
  return 'behavior';
}

function inferScenario(type: string) {
  const scenarioByType: Record<string, string> = {
    coupon_expiry: '到期提醒',
    card_expiry: '到期提醒',
    care_cycle: '到期提醒',
    dormant: '流失召回',
    last_visit: '流失召回',
    visit_gap: '流失召回',
    browse_abandonment: '转化召回',
    coupon_claimed_unused: '转化召回',
    booking_abandonment: '转化召回',
    birthday: '会员经营',
    member_level: '会员经营',
    vip_privilege_care: '会员经营',
    skin_type: '个性化推荐',
    service_interest: '个性化推荐',
    seasonal_skin_care: '个性化推荐',
    seasonal: '个性化推荐',
    product_replenishment: '个性化推荐',
    new_customer: '转化召回',
    referral_campaign: '裂变营销',
    holiday: '活动营销',
    holiday_campaign: '活动营销',
  };
  return scenarioByType[type] ?? '自动营销';
}

function inferDataDependencies(type: string) {
  const dependenciesByType: Record<string, string[]> = {
    coupon_expiry: ['优惠券', '预约记录'],
    coupon_claimed_unused: ['优惠券', '订单记录', '预约记录'],
    card_expiry: ['客户卡项', '核销记录'],
    care_cycle: ['服务记录', '项目记录'],
    dormant: ['客户档案', '消费记录', '预约记录'],
    last_visit: ['客户档案', '消费记录'],
    visit_gap: ['消费记录', '客户画像'],
    browse_abandonment: ['Ami Glow 小程序行为', '预约记录'],
    booking_abandonment: ['预约流程行为', '预约记录'],
    birthday: ['客户档案'],
    member_level: ['客户档案'],
    vip_privilege_care: ['客户档案', '消费记录'],
    skin_type: ['肌肤档案', 'Ami Aura Lite 检测'],
    service_interest: ['项目订单', '消费记录'],
    product_replenishment: ['商品订单', '商品消耗周期'],
    new_customer: ['客户档案', '订单记录'],
  };
  return dependenciesByType[type] ?? ['客户档案'];
}

function inferRecommendedActions(optionItem: (typeof defaultTriggerOptions)[number]) {
  const channels = Array.isArray(optionItem.defaultParams.channels) ? optionItem.defaultParams.channels : ['miniapp'];
  const valueByType: Record<string, string> = {
    dormant: '回归专享满300减80',
    card_expiry: '次卡续费/消耗提醒',
    coupon_expiry: '优惠券即将到期提醒',
    coupon_claimed_unused: '已领优惠券使用提醒',
    browse_abandonment: '项目体验券',
    booking_abandonment: '继续预约提醒',
    birthday: '生日月专属权益',
    care_cycle: '护理周期复购提醒',
  };
  return channels.map((channel) => ({
    type: channel === 'sms' ? 'sms' : 'push',
    value: valueByType[optionItem.type] ?? optionItem.label,
    channel,
  }));
}

function inferScheduleDefault(optionItem: (typeof defaultTriggerOptions)[number]) {
  if (['browse_abandonment', 'booking_abandonment'].includes(optionItem.type)) {
    return { type: 'realtime' };
  }
  return { type: 'daily', time: optionItem.type === 'birthday' ? '08:00' : '09:00' };
}

function inferFrequencyCap(optionItem: (typeof defaultTriggerOptions)[number]) {
  return {
    sameCustomerDays: ['birthday', 'card_expiry', 'coupon_expiry'].includes(optionItem.type) ? 1 : 7,
    sameChannelDays: 1,
    maxTouchesPerDay: 1,
  };
}

export function buildDefaultMarketingRuleTemplates() {
  return defaultTriggerOptions.map((optionItem) => {
    const category = mapCategoryToCode(optionItem.category);
    return {
      code: `system_${optionItem.type}`,
      name: optionItem.label,
      description: optionItem.description,
      source: 'system',
      category,
      categoryLabel: optionItem.category,
      scenario: inferScenario(optionItem.type),
      priority: optionItem.priority,
      status: optionItem.priority === 'P0' || ['birthday', 'care_cycle', 'last_visit', 'visit_gap', 'member_level', 'skin_type', 'new_customer'].includes(optionItem.type)
        ? 'recommended'
        : 'disabled',
      version: RULE_TEMPLATE_VERSION,
      triggerType: optionItem.type,
      paramSchema: optionItem.paramSchema,
      defaultParams: optionItem.defaultParams,
      recommendedActions: inferRecommendedActions(optionItem),
      scheduleDefault: inferScheduleDefault(optionItem),
      frequencyCap: inferFrequencyCap(optionItem),
      dataDependencies: inferDataDependencies(optionItem.type),
      recommendationReason: optionItem.description,
    };
  });
}

export async function seedMarketingRuleTemplates(prisma: unknown, dryRun = false) {
  const delegate = (prisma as { marketingRuleTemplate?: any }).marketingRuleTemplate;
  if (!delegate?.findMany) return { created: 0, skipped: 0 };

  const templates = buildDefaultMarketingRuleTemplates();
  const existing = await delegate.findMany({
    where: { code: { in: templates.map((template) => template.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((item: { code: string }) => item.code));
  const missing = templates.filter((template) => !existingCodes.has(template.code));

  if (!dryRun && missing.length > 0) {
    await delegate.createMany({ data: missing, skipDuplicates: true });
  }

  return { created: missing.length, skipped: templates.length - missing.length };
}
