type DefaultPromotionAsset = {
  code: string;
  name: string;
  description: string;
  discountText: string;
  type: string;
  source: 'system';
  scenario: string;
  audienceTags: string[];
  applicableCustomerLevels?: string[];
  thresholdAmount?: number;
  discountAmount?: number;
  discountRate?: number;
  giftText?: string;
  validDays?: number;
  maxIssueCount?: number;
  estimatedCost?: number;
  grossMarginGuard?: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

const matchMeta = (input: Record<string, unknown>) => input;

const defaultPromotionAssets: DefaultPromotionAsset[] = [
  {
    code: 'system_new_customer_first_trial',
    name: '新客首护体验价',
    description: '面向新建档未首单客户的低门槛体验权益。',
    discountText: '指定项目新客体验价',
    type: 'trial_price',
    source: 'system',
    scenario: 'new_customer',
    audienceTags: ['新客未首单', '新客户', '未首单', '小程序活跃'],
    validDays: 14,
    estimatedCost: 80,
    grossMarginGuard: { minGrossMarginRate: 0.35, stackable: false, maxPerCustomer: 1 },
    metadata: matchMeta({
      reason: '新客需要低门槛体验和顾问咨询承接。',
      lifecycleTags: ['新客未首单'],
      behaviorTags: ['首次预约', '浏览未预约'],
      preferredExecutionModes: ['activity', 'automation'],
      offerStrength: 'strong',
      maxPerCustomer: 1,
    }),
  },
  {
    code: 'system_new_customer_coupon_pack',
    name: '新客权益礼包',
    description: '新注册会员分阶段释放的项目、体验和产品权益包。',
    discountText: '新客 3 张权益礼包',
    type: 'money_off',
    source: 'system',
    scenario: 'new_customer',
    audienceTags: ['新客户', '新注册', '未首单'],
    validDays: 30,
    estimatedCost: 120,
    grossMarginGuard: { stagedRelease: true, stackable: false, maxPerCustomer: 1 },
    metadata: matchMeta({
      reason: '分阶段释放权益，避免一次性薅券，同时覆盖首次到店与复购。',
      lifecycleTags: ['新客未首单'],
      channelTags: ['小程序活跃'],
      preferredExecutionModes: ['activity', 'automation'],
      offerStrength: 'strong',
      maxPerCustomer: 1,
    }),
  },
  {
    code: 'system_first_booking_lock_coupon',
    name: '首次预约锁客券',
    description: '浏览后未预约的新客首次预约成功可用权益。',
    discountText: '首次预约成功享到店立减',
    type: 'money_off',
    source: 'system',
    scenario: 'first_booking',
    audienceTags: ['新客未首单', '浏览未预约', '预约意向'],
    discountAmount: 50,
    validDays: 7,
    estimatedCost: 50,
    grossMarginGuard: { minThresholdAmount: 299, stackable: false, maxPerCustomer: 1 },
    metadata: matchMeta({
      reason: '有预约意图但未提交的客户适合用短有效期权益锁定下一步动作。',
      lifecycleTags: ['新客未首单'],
      behaviorTags: ['浏览未预约', '预约放弃'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'medium',
      fatigueCooldownDays: 7,
    }),
  },
  {
    code: 'system_care_cycle_due_coupon',
    name: '护理周期预约券',
    description: '面向护理周期到期客户的复购预约权益。',
    discountText: '护理项目满500减80',
    type: 'money_off',
    source: 'system',
    scenario: 'care_cycle_due',
    audienceTags: ['护理周期', '复购窗口', '活跃老客'],
    thresholdAmount: 500,
    discountAmount: 80,
    validDays: 21,
    estimatedCost: 80,
    grossMarginGuard: { minThresholdAmount: 500, minGrossMarginRate: 0.4, stackable: false },
    metadata: matchMeta({
      reason: '护理周期到期客户已有复购时机，小额预约权益即可促进到店。',
      lifecycleTags: ['活跃老客', '首单后未复购'],
      behaviorTags: ['护理周期到期'],
      preferenceTags: ['面部护理', '补水', '修护'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'medium',
      fatigueCooldownDays: 14,
    }),
  },
  {
    code: 'system_post_purchase_next_visit_coupon',
    name: '消费后下次到店券',
    description: '客户完成服务后引导下一次到店的轻权益。',
    discountText: '下次护理满399减50',
    type: 'money_off',
    source: 'system',
    scenario: 'post_purchase_revisit',
    audienceTags: ['刚完成服务', '复购窗口', '老客'],
    thresholdAmount: 399,
    discountAmount: 50,
    validDays: 30,
    estimatedCost: 50,
    grossMarginGuard: { minThresholdAmount: 399, stackable: false },
    metadata: matchMeta({
      reason: '结账后发放下次到店券，能把满意服务体验延续到下一次预约。',
      lifecycleTags: ['活跃老客'],
      behaviorTags: ['刚消费'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_second_visit_bonus',
    name: '二次到店加项礼',
    description: '首单客户 30 天内二次到店赠送护理加项。',
    discountText: '30 天内二次到店赠护理加项',
    type: 'gift',
    source: 'system',
    scenario: 'second_visit',
    audienceTags: ['首单后未复购', '新客转老客'],
    giftText: '护理加项',
    validDays: 30,
    estimatedCost: 60,
    grossMarginGuard: { maxGiftCost: 80, stackable: false },
    metadata: matchMeta({
      reason: '用服务加项推动第二次到店，避免新客只体验一次后流失。',
      lifecycleTags: ['首单后未复购'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'light',
    }),
  },
  {
    code: 'system_dormant_winback_care_gift',
    name: '回店护理礼遇',
    description: '面向沉睡或高流失风险客户的回店护理权益。',
    discountText: '到店护理满300减100',
    type: 'money_off',
    source: 'system',
    scenario: 'churn_winback',
    audienceTags: ['流失风险', '沉睡客户', '久未到店'],
    thresholdAmount: 300,
    discountAmount: 100,
    validDays: 14,
    estimatedCost: 100,
    grossMarginGuard: { minThresholdAmount: 300, minGrossMarginRate: 0.35, stackable: false },
    metadata: matchMeta({
      reason: '高流失客户需要明确回店利益，但保留消费门槛避免过度低价。',
      lifecycleTags: ['沉睡', '流失高风险'],
      preferredExecutionModes: ['automation', 'activity'],
      offerStrength: 'strong',
      fatigueCooldownDays: 30,
    }),
  },
  {
    code: 'system_high_churn_private_offer',
    name: '高流失专属挽回券',
    description: '仅面向高流失风险客户定向发放的回店权益。',
    discountText: '专属回店护理礼已保留',
    type: 'money_off',
    source: 'system',
    scenario: 'high_churn_risk',
    audienceTags: ['高流失风险', '沉睡客户', '顾问跟进'],
    thresholdAmount: 300,
    discountAmount: 100,
    validDays: 7,
    estimatedCost: 100,
    grossMarginGuard: { privateOnly: true, minThresholdAmount: 300, stackable: false },
    metadata: matchMeta({
      reason: '极高流失客户适合定向权益和顾问跟进，不公开展示。',
      lifecycleTags: ['流失高风险'],
      includeTags: ['高流失风险'],
      channelTags: ['顾问微信', '短信可达'],
      preferredExecutionModes: ['automation', 'consultant_task'],
      offerStrength: 'strong',
      requiresManualApproval: true,
    }),
  },
  {
    code: 'system_vip_privilege_care',
    name: 'VIP 专属护理礼遇',
    description: '面向高 LTV 和高等级会员的非低价权益。',
    discountText: '专属顾问服务 + 优先预约',
    type: 'member_privilege',
    source: 'system',
    scenario: 'vip_privilege_care',
    audienceTags: ['高价值客户', 'VIP', '高 LTV'],
    applicableCustomerLevels: ['铂金', '黄金', 'VIP', '钻石'],
    validDays: 90,
    estimatedCost: 40,
    grossMarginGuard: { avoidDeepDiscount: true, stackable: false },
    metadata: matchMeta({
      reason: '高价值客户优先服务礼遇，避免直接大额折扣。',
      valueTags: ['高 LTV', '高价值客户'],
      includeTags: ['VIP'],
      excludeTags: ['低价敏感'],
      preferredExecutionModes: ['automation', 'activity', 'consultant_task'],
      offerStrength: 'light',
    }),
  },
  {
    code: 'system_member_day_coupon',
    name: '会员日专属券',
    description: '会员日短周期参与权益。',
    discountText: '会员日指定项目 8.8 折',
    type: 'discount',
    source: 'system',
    scenario: 'member_day',
    audienceTags: ['会员', '活跃老客', '高响应客户'],
    discountRate: 88,
    validDays: 3,
    estimatedCost: 80,
    grossMarginGuard: { minGrossMarginRate: 0.35, stackable: false },
    metadata: matchMeta({
      reason: '会员日适合短周期触达，制造参与感和复购窗口。',
      lifecycleTags: ['活跃老客'],
      preferredExecutionModes: ['activity'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_birthday_month_gift',
    name: '生日月护理礼',
    description: '生日月客户专属护理加项或到店礼。',
    discountText: '生日月到店赠护理加项',
    type: 'gift',
    source: 'system',
    scenario: 'birthday',
    audienceTags: ['生日客户', '生日月', '会员关怀'],
    giftText: '护理加项或门店小礼',
    validDays: 30,
    estimatedCost: 50,
    grossMarginGuard: { maxGiftCost: 80, stackable: false },
    metadata: matchMeta({
      reason: '生日权益适合提前触达，给客户预留预约时间。',
      behaviorTags: ['生日月'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'light',
      fatigueCooldownDays: 365,
    }),
  },
  {
    code: 'system_birthday_discount_coupon',
    name: '生日专属折扣券',
    description: '生日月指定护理项目折扣权益。',
    discountText: '生日月指定项目 8 折',
    type: 'discount',
    source: 'system',
    scenario: 'birthday',
    audienceTags: ['生日客户', '生日月', '高响应客户'],
    discountRate: 80,
    validDays: 30,
    estimatedCost: 120,
    grossMarginGuard: { levelBasedDiscount: true, minGrossMarginRate: 0.3, stackable: false },
    metadata: matchMeta({
      reason: '生日折扣用于推动生日月预约，折扣力度按会员等级控制。',
      behaviorTags: ['生日月'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_referral_double_reward',
    name: '老带新双边礼',
    description: '推荐成功后老客和新客双方获得护理权益。',
    discountText: '推荐成功双方各得护理券',
    type: 'referral_reward',
    source: 'system',
    scenario: 'referral_campaign',
    audienceTags: ['老带新', '高满意度', '活跃老客'],
    validDays: 30,
    estimatedCost: 100,
    grossMarginGuard: { rewardAfterFirstOrder: true, stackable: false },
    metadata: matchMeta({
      reason: '双边奖励能降低新客决策成本，并激励老客转介绍。',
      lifecycleTags: ['活跃老客'],
      behaviorTags: ['高满意度'],
      preferredExecutionModes: ['activity'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_friend_pair_trial',
    name: '闺蜜同行体验',
    description: '两人同行的护理体验权益。',
    discountText: '两人同行享组合体验价',
    type: 'group_deal',
    source: 'system',
    scenario: 'bring_a_friend',
    audienceTags: ['亲友同行', '闺蜜同行', '新客拓展'],
    validDays: 14,
    estimatedCost: 160,
    grossMarginGuard: { requireGroupSize: 2, stackable: false },
    metadata: matchMeta({
      reason: '同行体验适合拓展亲友客户并提升到店氛围。',
      lifecycleTags: ['活跃老客', '新客未首单'],
      preferredExecutionModes: ['activity'],
      offerStrength: 'strong',
    }),
  },
  {
    code: 'system_review_reward_gift',
    name: '好评反馈礼',
    description: '已消费客户完成真实反馈后赠送低成本小礼。',
    discountText: '完成真实评价赠护理小样',
    type: 'gift',
    source: 'system',
    scenario: 'review_reward',
    audienceTags: ['已消费客户', '高满意度', '内容互动'],
    giftText: '护理小样',
    validDays: 14,
    estimatedCost: 20,
    grossMarginGuard: { maxGiftCost: 30, stackable: false },
    metadata: matchMeta({
      reason: '以反馈礼促进真实评价和服务复盘，不诱导虚假好评。',
      behaviorTags: ['已消费', '评价互动'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'light',
    }),
  },
  {
    code: 'system_spring_sensitive_skin_care',
    name: '春敏修护权益',
    description: '面向敏感肌和修护需求客户的季节护理组合权益。',
    discountText: '春敏修护组合礼遇',
    type: 'package_upgrade',
    source: 'system',
    scenario: 'seasonal_skin_care',
    audienceTags: ['敏感肌', '春敏', '修护需求', '换季护理'],
    validDays: 30,
    estimatedCost: 90,
    grossMarginGuard: { projectCategoryRequired: true, stackable: false },
    metadata: matchMeta({
      reason: '春季敏感修护适合专业护理组合和顾问建议。',
      skinTags: ['敏感', '屏障受损'],
      preferenceTags: ['敏感修护', '修护'],
      preferredExecutionModes: ['activity', 'automation'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_autumn_hydration_repair',
    name: '秋季补水修护礼',
    description: '面向干皮和补水需求客户的秋季护理权益。',
    discountText: '补水修护套餐立减 120',
    type: 'package_upgrade',
    source: 'system',
    scenario: 'seasonal_skin_care',
    audienceTags: ['干皮', '补水', '秋季护理', '修护需求'],
    thresholdAmount: 500,
    discountAmount: 120,
    validDays: 30,
    estimatedCost: 120,
    grossMarginGuard: { minThresholdAmount: 500, minGrossMarginRate: 0.35, stackable: false },
    metadata: matchMeta({
      reason: '秋季补水护理客单适中，适合套餐化满减承接。',
      skinTags: ['干皮', '缺水'],
      preferenceTags: ['补水', '修护'],
      preferredExecutionModes: ['activity', 'automation'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_store_anniversary_coupon',
    name: '店庆周年券',
    description: '门店周年庆期间面向会员和周边新客的限时活动权益。',
    discountText: '店庆限时满减/体验价',
    type: 'money_off',
    source: 'system',
    scenario: 'store_anniversary',
    audienceTags: ['店庆', '节日活动', '会员', '新客'],
    validDays: 10,
    maxIssueCount: 300,
    estimatedCost: 100,
    grossMarginGuard: { maxIssueCountRequired: true, stackable: false },
    metadata: matchMeta({
      reason: '店庆适合限量活动承接，需设置名额和活动周期。',
      preferredExecutionModes: ['activity'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_card_expiry_renew_gift',
    name: '续卡赠护理一次',
    description: '次卡或套餐临近到期时的续费权益。',
    discountText: '续卡赠护理一次',
    type: 'gift',
    source: 'system',
    scenario: 'card_expiry',
    audienceTags: ['次卡到期', '套餐到期', '剩余次数低'],
    giftText: '护理一次',
    validDays: 30,
    estimatedCost: 120,
    grossMarginGuard: { maxGiftCost: 150, stackable: false },
    metadata: matchMeta({
      reason: '权益类赠送比直接打折更适合卡项续费场景。',
      cardTags: ['次卡临期', '套餐临期', '剩余次数低'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_stored_value_bonus_500',
    name: '充值满额加赠',
    description: '储值客户充值或预售时的阶梯加赠权益。',
    discountText: '充 3000 赠 500',
    type: 'stored_value_bonus',
    source: 'system',
    scenario: 'stored_value',
    audienceTags: ['储值客户', '高粘性客户', '预售'],
    thresholdAmount: 3000,
    discountAmount: 500,
    validDays: 365,
    estimatedCost: 500,
    grossMarginGuard: { liabilityTrackingRequired: true, refundable: false, stackable: false },
    metadata: matchMeta({
      reason: '储值加赠适合高粘性客户，但必须计算现金负债和使用规则。',
      valueTags: ['高 LTV', '高频客户'],
      cardTags: ['储值客户'],
      preferredExecutionModes: ['activity', 'consultant_task'],
      offerStrength: 'strong',
      requiresManualApproval: true,
    }),
  },
  {
    code: 'system_product_bundle_coupon',
    name: '产品搭售券',
    description: '护理后购买搭配产品的项目后零售权益。',
    discountText: '护理后购买搭配产品立减',
    type: 'money_off',
    source: 'system',
    scenario: 'product_bundle',
    audienceTags: ['项目后零售', '产品搭售', '护理后客户'],
    discountAmount: 30,
    validDays: 14,
    estimatedCost: 30,
    grossMarginGuard: { productMarginRequired: true, stackable: false },
    metadata: matchMeta({
      reason: '护理后产品搭售能把服务体验延伸到居家护理。',
      behaviorTags: ['刚消费'],
      productCycleTags: ['产品搭售'],
      preferredExecutionModes: ['automation', 'activity'],
      offerStrength: 'medium',
    }),
  },
  {
    code: 'system_inventory_clearance_coupon',
    name: '临期商品消化券',
    description: '面向适配肤质客户的临期商品限时消化权益。',
    discountText: '指定商品临期专享价',
    type: 'money_off',
    source: 'system',
    scenario: 'product_expiry_clearance',
    audienceTags: ['临期库存', '适配肤质', '库存消化'],
    validDays: 14,
    estimatedCost: 60,
    grossMarginGuard: { expiryDisclosureRequired: true, inventoryCapRequired: true, stackable: false },
    metadata: matchMeta({
      reason: '临期商品需要匹配适配客户并控制库存上限。',
      productCycleTags: ['临期库存适配'],
      preferredExecutionModes: ['activity', 'consultant_task'],
      offerStrength: 'medium',
      requiresManualApproval: true,
    }),
  },
  {
    code: 'system_low_peak_booking_gift',
    name: '低峰预约礼',
    description: '排期低峰时段的预约转化权益。',
    discountText: '低峰时段预约赠护理加项',
    type: 'gift',
    source: 'system',
    scenario: 'project_idle_capacity',
    audienceTags: ['低峰排期', '高响应客户', '工作日可约'],
    giftText: '护理加项',
    validDays: 7,
    estimatedCost: 50,
    grossMarginGuard: { usableTimeRangeRequired: true, stackable: false },
    metadata: matchMeta({
      reason: '低峰权益只绑定空闲时段，避免影响黄金时段价格体系。',
      capacityTags: ['低峰可约', '美容师空档'],
      channelTags: ['小程序活跃'],
      preferredExecutionModes: ['activity', 'automation'],
      offerStrength: 'light',
      fatigueCooldownDays: 7,
    }),
  },
  {
    code: 'system_coupon_claimed_unused_reminder',
    name: '已领权益核销提醒',
    description: '提醒客户使用已领取权益，避免重复让利。',
    discountText: '提醒使用已领取权益',
    type: 'member_privilege',
    source: 'system',
    scenario: 'coupon_claimed_unused',
    audienceTags: ['已领券', '未核销', '权益提醒'],
    validDays: 7,
    estimatedCost: 0,
    grossMarginGuard: { noAdditionalDiscount: true, stackable: false },
    metadata: matchMeta({
      reason: '优先推动已领权益核销，不新增无关让利。',
      behaviorTags: ['已领未核销'],
      includeTags: ['已领券'],
      excludeTags: ['近期已核销'],
      preferredExecutionModes: ['automation'],
      offerStrength: 'light',
      fatigueCooldownDays: 3,
    }),
  },
];

export function buildDefaultPromotionAssets() {
  return defaultPromotionAssets.map((item) => ({
    ...item,
    storeId: null,
    applicableProjectIds: [],
    issuedCount: 0,
    usedCount: 0,
    stackable: false,
    approvalStatus: 'approved',
    status: 'active',
  }));
}

export async function seedPromotionAssets(prisma: unknown, dryRun = false) {
  const delegate = (prisma as { promotion?: any }).promotion;
  const assets = buildDefaultPromotionAssets();
  if (!delegate?.findMany) {
    return { expected: assets.length, existing: 0, created: 0, skipped: 0, complete: false };
  }
  const existing = await delegate.findMany({
    where: { code: { in: assets.map((asset) => asset.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((item: { code: string }) => item.code));
  const missing = assets.filter((asset) => !existingCodes.has(asset.code));

  if (!dryRun && missing.length > 0) {
    await delegate.createMany({ data: missing, skipDuplicates: true });
  }

  return {
    expected: assets.length,
    existing: existingCodes.size,
    created: missing.length,
    skipped: assets.length - missing.length,
    complete: missing.length === 0 || !dryRun,
  };
}

export async function verifyPromotionAssets(prisma: unknown) {
  const delegate = (prisma as { promotion?: any }).promotion;
  const assets = buildDefaultPromotionAssets();
  if (!delegate?.findMany) {
    return {
      expected: assets.length,
      existing: 0,
      missing: assets.map((asset) => asset.code),
      invalid: [],
      complete: false,
    };
  }

  const existing = await delegate.findMany({
    where: { code: { in: assets.map((asset) => asset.code) } },
    select: {
      code: true,
      source: true,
      storeId: true,
      status: true,
      approvalStatus: true,
      scenario: true,
      type: true,
      audienceTags: true,
      metadata: true,
      grossMarginGuard: true,
    },
  });
  const byCode = new Map<string, any>(existing.map((item: any) => [item.code, item]));
  const missing = assets.filter((asset) => !byCode.has(asset.code)).map((asset) => asset.code);
  const invalid = assets
    .map((asset) => {
      const current = byCode.get(asset.code);
      if (!current) return null;
      const issues: string[] = [];
      if (current.source !== 'system') issues.push('source');
      if (current.storeId !== null) issues.push('storeId');
      if (current.status !== 'active') issues.push('status');
      if (current.approvalStatus !== 'approved') issues.push('approvalStatus');
      if (!current.scenario) issues.push('scenario');
      if (!current.type) issues.push('type');
      if (!Array.isArray(current.audienceTags) || current.audienceTags.length === 0) issues.push('audienceTags');
      const metadata = current.metadata && typeof current.metadata === 'object' ? current.metadata : {};
      if (!metadata.reason) issues.push('metadata.reason');
      if (!Array.isArray(metadata.preferredExecutionModes) || metadata.preferredExecutionModes.length === 0) {
        issues.push('metadata.preferredExecutionModes');
      }
      if (!metadata.offerStrength) issues.push('metadata.offerStrength');
      if (!current.grossMarginGuard || typeof current.grossMarginGuard !== 'object') issues.push('grossMarginGuard');
      return issues.length ? { code: asset.code, issues } : null;
    })
    .filter(Boolean);

  return {
    expected: assets.length,
    existing: existing.length,
    missing,
    invalid,
    complete: missing.length === 0 && invalid.length === 0,
  };
}
