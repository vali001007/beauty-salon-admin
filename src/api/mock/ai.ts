import type {
  AiChatRequest,
  AiGenerationResult,
  ActivityPageSchema,
  ActivityPageVariant,
  CampaignVariantsRequest,
  CustomerInvitationScriptRequest,
  CustomerSummaryRequest,
  GenerateActivityPageRequest,
  GenerateActivityPageResult,
  MarketingCopyChannel,
  MarketingCopyRequest,
  MarketingCopyStructured,
  NextBestActionRequest,
  NextBestActionResult,
  NextBestActionStructured,
  ServiceNoteSummaryRequest,
  SkinPhotoAnalyzeRequest,
  SkinPhotoAnalyzeResult,
  SkinTestExplanationRequest,
  TerminalServiceAdviceRequest,
  TerminalServiceAdviceResult,
  TerminalServiceAdviceStructured,
  TerminalIntentResolveRequest,
  TerminalIntentResolveResult,
} from '@/types/ai';

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 2));
}

function result<TStructured = Record<string, unknown>>(
  scenario: string,
  text: string,
  structured?: TStructured,
  variants?: AiGenerationResult['variants'],
): AiGenerationResult<TStructured> {
  return {
    id: `mock-ai-${scenario}-${Date.now()}`,
    scenario,
    text,
    variants,
    structured,
    safety: {
      masked: true,
      blocked: false,
      reasons: [],
    },
    usage: {
      provider: 'mock',
      model: 'ami-core-mock-llm',
      inputTokens: estimateTokens(JSON.stringify(structured ?? {})),
      outputTokens: estimateTokens(text),
      estimatedCost: 0,
    },
  };
}

export async function mockSendAiChatMessage(data: AiChatRequest): Promise<AiGenerationResult> {
  const lastMessage = data.messages.at(-1)?.content || '请分析当前门店经营情况';
  return result(
    'assistant_chat',
    `已基于当前门店权限和业务上下文处理：${lastMessage}。建议先查看客户分群、库存预警和今日预约，再执行营销或服务动作。`,
    { role: data.role ?? 'manager', messageCount: data.messages.length },
  );
}

export async function mockGenerateCustomerInvitationScript(
  data: CustomerInvitationScriptRequest,
): Promise<AiGenerationResult> {
  const name = data.customerName || '顾客';
  const project = data.projectName || data.promotionName || '专属护理方案';
  const offer = data.specialOffer || '到店可享专属会员礼遇';
  return result(
    'customer_invitation_script',
    `${name}您好，结合您近期护理偏好，为您推荐「${project}」。${offer}，建议提前预约合适时段，我们会为您预留服务安排。`,
    {
      customerId: data.customerId,
      channel: data.channel ?? 'wechat',
      maskedFields: ['phone'],
    },
  );
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getMarketingSignal(data: MarketingCopyRequest) {
  return [
    data.campaignName,
    data.targetAudience,
    data.segment,
    data.source,
    ...(data.triggerReasons ?? []),
  ].filter(Boolean).join(' ');
}

function removeInternalMarketingTerms(text: string) {
  return text
    .replace(/\d+\s*位?客户/g, '')
    .replace(/即将流失|流失风险|高流失风险|沉睡客户|唤醒|需立即|消费能力|高价值客户/g, '')
    .replace(/[，,：:；;]\s*$/g, '')
    .trim();
}

function getCustomerFacingCampaign(data: MarketingCopyRequest) {
  const signal = getMarketingSignal(data);
  if (includesAny(signal, ['流失', '沉睡', '未到店', '回归', '唤醒'])) return '老朋友专属回店礼';
  if (includesAny(signal, ['生日', '寿星'])) return '生日月专属护理礼';
  if (includesAny(signal, ['新客', '首单'])) return '新客首护体验礼';
  if (includesAny(signal, ['敏感肌', '敏感'])) return '敏感肌舒缓护理季';
  if (includesAny(signal, ['干性肌', '补水', '保湿'])) return '补水保湿护理季';
  if (includesAny(signal, ['VIP', '铂金', '高价值', '会员等级'])) return '会员专属护理礼遇';
  return removeInternalMarketingTerms(data.campaignName || '') || '会员专属护理活动';
}

function getCustomerFacingAudience(data: MarketingCopyRequest) {
  const signal = getMarketingSignal(data);
  if (includesAny(signal, ['流失', '沉睡', '未到店', '回归', '唤醒'])) return '老朋友';
  if (includesAny(signal, ['生日', '寿星'])) return '寿星会员';
  if (includesAny(signal, ['新客', '首单'])) return '新朋友';
  return '亲爱的会员';
}

function getCustomerFacingProjectNames(data: MarketingCopyRequest) {
  const signal = getMarketingSignal(data);
  const hasInternalStrategy = includesAny(signal, ['流失', '沉睡', '概率', '触达', '唤醒', '高价值']);
  if (hasInternalStrategy) return ['回店护理关怀方案'];
  return data.projectNames?.filter((name) => !includesAny(name, ['流失', '沉睡', '概率', '触达', '唤醒', '高价值'])) ?? [];
}

function getSafeReasonTags(data: MarketingCopyRequest, styleHint: string) {
  const signal = getMarketingSignal(data);
  const tags = ['已转译内部人群标签'];
  if (includesAny(signal, ['流失', '沉睡', '未到店', '回归', '唤醒'])) tags.push('回店关怀');
  if (includesAny(signal, ['生日', '寿星'])) tags.push('生日礼遇');
  if (includesAny(signal, ['敏感肌', '敏感', '干性肌', '补水', '保湿'])) tags.push('护理需求匹配');
  if (data.projectNames?.length) tags.push('项目偏好匹配');
  tags.push(styleHint);
  return tags.slice(0, 5);
}

export async function mockGenerateMarketingCopy(
  data: MarketingCopyRequest,
): Promise<AiGenerationResult<MarketingCopyStructured>> {
  const campaign = getCustomerFacingCampaign(data);
  const audience = getCustomerFacingAudience(data);
  const offer = data.offer || '到店可享专属礼遇';
  const displayProjectNames = getCustomerFacingProjectNames(data);
  const projectText = displayProjectNames.length ? `，可优先体验${displayProjectNames.join('、')}` : '';
  const productText = data.productNames?.length ? `，并为您搭配${data.productNames.join('、')}` : '';
  const periodText = data.startDate && data.endDate ? `，活动期${data.startDate}至${data.endDate}` : '';
  const channels = (data.channels?.length ? data.channels : [data.channel ?? 'wechat']) as MarketingCopyChannel[];
  const styleHints: Record<string, string> = {
    warmer: '语气更像熟悉顾问的温柔提醒',
    premium: '突出专业、仪式感和高端服务',
    shorter: '压缩为更适合快速阅读的短文案',
    urgent: '强化限时名额和预约行动',
    consultative: '以顾问建议口吻说明原因',
  };
  const styleHint = data.styleInstruction ? styleHints[data.styleInstruction] : '温和专业';
  const baseReasons = getSafeReasonTags(data, styleHint);
  const riskWarnings = ['未承诺疗效', '已隐藏内部客群标签', '优惠规则需以门店配置为准'];
  const greeting = audience === '老朋友' ? '好久不见，' : `${audience}您好，`;
  const templates: Record<MarketingCopyChannel, { title: string; text: string; tone: string }> = {
    sms: {
      title: `${campaign}短信提醒`,
      tone: data.styleInstruction === 'urgent' ? 'urgent' : 'warm',
      text: `【${data.storeName || 'Ami_Core'}】${greeting}门店为您准备了「${campaign}」：${offer}${periodText}。欢迎预约到店，让顾问为您安排合适护理。`,
    },
    wechat: {
      title: `${campaign}微信私聊`,
      tone: data.styleInstruction === 'premium' ? 'premium' : 'warm',
      text: `${greeting}最近门店上新了一组适合换季护理的方案${projectText}${productText}。这次也为您准备了「${campaign}」：${offer}${periodText}。您可以先选一个方便的时间，到店后我们再根据皮肤状态细化护理安排。`,
    },
    miniapp: {
      title: campaign,
      tone: 'professional',
      text: `${campaign}｜为会员准备的护理权益。${offer}${projectText}${productText}${periodText}。在线预约后到店确认方案，服务顾问会根据您的实际状态推荐合适项目。`,
    },
    group: {
      title: `${campaign}社群公告`,
      tone: 'warm',
      text: `本期「${campaign}」开放预约啦：${offer}${projectText}${periodText}。想了解适配项目和可预约时间的会员，可以直接联系门店顾问。`,
    },
    store: {
      title: `${campaign}门店物料`,
      tone: 'consultative',
      text: `把护理留给懂你的人。「${campaign}」限时开启：${offer}${projectText}${productText}${periodText}。欢迎到店咨询，让专业顾问为您定制护理方案。`,
    },
    moments: {
      title: `${campaign}朋友圈文案`,
      tone: data.styleInstruction === 'premium' ? 'premium' : 'warm',
      text: `真正适合自己的护理，不是跟风，而是被认真了解。${campaign}已开启，会员可享${offer}${projectText}${periodText}。把一次到店，变成更稳定的变美节奏。`,
    },
  };
  const variants = channels.map((channel) => {
    const template = templates[channel];
    const text = data.styleInstruction === 'shorter'
      ? template.text.slice(0, channel === 'sms' ? 70 : 110)
      : template.text;
    return {
      id: `copy-${channel}-${Date.now()}`,
      channel,
      title: template.title,
      text,
      tone: template.tone || styleHint,
      reasonTags: baseReasons,
      riskWarnings,
    };
  });
  const recommendedVariantId = variants.find((item) => item.channel === 'wechat')?.id ?? variants[0]?.id;
  const structured: MarketingCopyStructured = {
    variants,
    recommendedVariantId,
    context: {
      campaignName: campaign,
      targetAudience: audience,
      offer,
      source: data.source,
      segment: data.segment,
      skinType: data.skinType,
      triggerReasons: data.triggerReasons ?? [],
    },
  };
  return result<MarketingCopyStructured>(
    'marketing_copy',
    variants.find((item) => item.id === recommendedVariantId)?.text ?? variants[0]?.text ?? '',
    structured,
    variants.map((item) => ({ title: item.title, text: item.text, channel: item.channel })),
  );
}

function buildActivityPageSchema(data: GenerateActivityPageRequest): ActivityPageSchema {
  const signal = [
    data.campaignName,
    data.targetAudience,
    data.source,
    data.segment,
    ...(data.triggerReasons ?? []),
  ].filter(Boolean).join(' ');
  const isReturnCare = /流失|沉睡|未到店|回归|唤醒/.test(signal);
  const isBirthday = /生日|寿星/.test(signal);
  const title = isReturnCare
    ? '老朋友回店护理礼'
    : isBirthday
      ? '生日月专属护理礼'
      : data.campaignName || '会员专属护理活动';
  const audienceLabel = isReturnCare ? '老朋友' : isBirthday ? '寿星会员' : data.targetAudience || '会员';
  const offer = data.offer || '到店可享专属护理权益';
  const startDate = data.startDate || new Date().toISOString().slice(0, 10);
  const endDate = data.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const safeProjectNames = (data.projectNames ?? [])
    .filter((name) => !/流失|沉睡|高风险|风险|唤醒|挽回|LTV|转化率|算法|分层/.test(String(name)))
    .slice(0, 3);
  const projectNames = safeProjectNames.length
    ? safeProjectNames
    : [isReturnCare ? '回店护理关怀方案' : '补水修护护理', '舒缓清洁护理'];
  const productNames = data.productNames ?? [];
  const tone = data.styleInstruction === 'premium' ? 'premium' : data.styleInstruction === 'consultative' ? 'professional' : 'warm';

  return {
    schemaVersion: '1.0',
    title,
    subtitle: isReturnCare ? '好久不见，为你留了一份回店专属心意' : '根据你的护理习惯，为你准备本期专属权益',
    audienceLabel,
    theme: {
      tone,
      primaryColor: tone === 'premium' ? '#B7791F' : '#DB2777',
      backgroundColor: '#FFF7ED',
    },
    sections: [
      {
        type: 'hero',
        badge: '限时活动',
        title,
        subtitle: isReturnCare ? '回店护理礼已为你准备好' : '本期护理权益已开启',
        description: isReturnCare
          ? '不打扰，只是提醒你可以把护理节奏重新接上。到店后顾问会根据当前肤况安排更合适的项目。'
          : '在线预约后到店确认方案，顾问会结合你的肤况与护理记录给出建议。',
      },
      {
        type: 'offer',
        title: '专属优惠',
        offer,
        description: '权益以门店实际核销规则为准，可在预约后由顾问协助确认。',
        validFrom: startDate,
        validTo: endDate,
        highlights: ['在线预约更省心', '到店确认护理方案', '活动名额有限'],
      },
      {
        type: 'benefits',
        title: '为什么适合你',
        items: [
          {
            title: '按护理节奏推荐',
            description: '结合近期到店和护理周期，优先推荐更适合当前状态的方案。',
          },
          {
            title: '顾问到店细化',
            description: '不做夸大承诺，到店后根据肤况和禁忌再确认服务内容。',
          },
          {
            title: '权益清晰可核销',
            description: '优惠、项目和时间范围在页面内说明，减少沟通成本。',
          },
        ],
      },
      {
        type: 'project_recommendation',
        title: '推荐护理',
        items: projectNames.slice(0, 3).map((name, index) => ({
          name,
          description: index === 0 ? '适合作为本次到店的优先体验项目。' : '可由顾问根据肤况搭配选择。',
          originalPrice: index === 0 ? 680 : 480,
          activityPrice: index === 0 ? 380 : 298,
          reason: '与本次活动权益和客户护理需求匹配。',
        })),
      },
      ...(productNames.length
        ? [{
            type: 'product_recommendation' as const,
            title: '可搭配商品',
            items: productNames.slice(0, 2).map((name) => ({
              name,
              description: '适合居家护理搭配使用，到店后由顾问确认是否适合。',
              activityPrice: 199,
              category: '居家护理',
            })),
          }]
        : []),
      {
        type: 'consultant_note',
        title: '顾问提醒',
        note: '预约后请告知近期皮肤状态、过敏史和正在使用的护肤品，门店会据此调整护理细节。',
        consultantName: data.storeName || 'Ami_Core 门店顾问',
      },
      {
        type: 'faq',
        title: '常见问题',
        items: [
          { question: '这个活动一定适合我吗？', answer: '页面仅提供初步推荐，到店后会结合肤况和服务禁忌再确认。' },
          { question: '优惠什么时候可用？', answer: `活动时间为 ${startDate} 至 ${endDate}，具体核销以门店规则为准。` },
        ],
      },
      {
        type: 'notice',
        title: '温馨提示',
        items: ['本活动不替代医疗建议。', '优惠不可与部分活动叠加，以下单或核销页展示为准。', '预约成功后门店会尽快确认服务时间。'],
      },
      {
        type: 'store_info',
        title: '活动门店',
        storeName: data.storeName || '心悦茗美容养生会所',
        phone: data.storePhone || '0571-88888888',
        address: data.storeAddress,
      },
    ],
    cta: {
      text: '立即预约领取',
      action: 'book',
    },
    safety: {
      customerFacing: true,
      blocked: false,
      reasons: [],
    },
  };
}

export async function mockGenerateActivityPage(
  data: GenerateActivityPageRequest,
): Promise<GenerateActivityPageResult> {
  const pageSchema = buildActivityPageSchema(data);
  const variants: ActivityPageVariant[] = [
    {
      id: `activity-page-warm-${Date.now()}`,
      name: '温和关怀版',
      pageSchema,
      reasonTags: ['客户可见表达', '不暴露内部标签', '适合小程序预览'],
    },
    {
      id: `activity-page-premium-${Date.now()}`,
      name: '专业权益版',
      pageSchema: {
        ...pageSchema,
        title: pageSchema.title.replace('护理礼', '护理权益'),
        theme: { ...pageSchema.theme, tone: 'premium', primaryColor: '#B7791F' },
        cta: { text: '预约专属顾问', action: 'contact_consultant' },
      },
      reasonTags: ['专业感更强', '适合高客单活动'],
    },
  ];
  const structured = {
    pageSchema,
    variants,
    recommendedVariantId: variants[0].id,
    promptTemplateVersion: 'marketing.activity_page.v1',
    context: {
      campaignName: pageSchema.title,
      targetAudience: pageSchema.audienceLabel,
      offer: data.offer || '到店可享专属护理权益',
      source: data.source,
      segment: data.segment,
      skinType: data.skinType,
      triggerReasons: data.triggerReasons ?? [],
    },
  };

  return {
    ...result('activity_page', pageSchema.subtitle || pageSchema.title, structured, variants.map((item) => ({
      title: item.name,
      text: item.pageSchema.subtitle || item.pageSchema.title,
      channel: 'miniapp',
    }))),
    pageSchema,
    pageVariants: variants,
  };
}

export async function mockGenerateCampaignVariants(data: CampaignVariantsRequest): Promise<AiGenerationResult> {
  const channels = data.channels.length ? data.channels : ['wechat'];
  const variants = channels.map((channel, index) => ({
    title: `${data.campaignName || '营销活动'}-${channel}`,
    channel,
    text: `版本${index + 1}：${data.targetAudience || '目标客户'}可参与${data.campaignName || '专属活动'}，${data.offer || '到店享优惠'}。`,
  }));
  return result('campaign_variants', variants.map((item) => item.text).join('\n'), { channels }, variants);
}

export async function mockGenerateCustomerSummary(data: CustomerSummaryRequest): Promise<AiGenerationResult> {
  return result(
    'customer_summary',
    `客户 ${data.customerId} 当前摘要：建议关注最近到店、消费偏好、可用次卡和肤质档案，并优先匹配高复购项目。`,
    data as unknown as Record<string, unknown>,
  );
}

export async function mockGenerateServiceNoteSummary(data: ServiceNoteSummaryRequest): Promise<AiGenerationResult> {
  return result(
    'service_note_summary',
    `服务记录摘要：${data.notes.slice(0, 80)}。后续建议补充顾客反馈和下次护理计划。`,
    data as unknown as Record<string, unknown>,
  );
}

export async function mockGenerateSkinTestExplanation(data: SkinTestExplanationRequest): Promise<AiGenerationResult> {
  return result(
    'skin_test_explanation',
    `肌肤检测解读：当前肤质为${data.skinType || '待确认'}，主要问题为${data.mainProblems || '水油状态需持续观察'}。建议采用温和清洁、补水修护和周期复查。`,
    data as unknown as Record<string, unknown>,
  );
}

export async function mockAnalyzeSkinPhoto(data: SkinPhotoAnalyzeRequest): Promise<SkinPhotoAnalyzeResult> {
  const seed = Math.abs(
    [...String(data.customerId ?? data.customerName ?? data.imageDataUrl.length)].reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0,
    ),
  );
  const profiles = [
    {
      skinType: '混干',
      skinStatus: '两颊偏干缺水，T区轻微出油，整体屏障状态一般',
      mainProblems: '毛孔粗大、肤色暗沉、局部轻微泛红',
      goals: '补水保湿、舒缓修护、提亮肤色',
      recommendedCare: '水光补水护理 + 屏障修护管理',
      metrics: { moisture: 42, oil: 58, elasticity: 63, sensitivity: 49, pore: 61, pigmentation: 47 },
    },
    {
      skinType: '敏感',
      skinStatus: '角质层偏薄，局部泛红明显，耐受度偏低',
      mainProblems: '敏感泛红、屏障受损、干痒紧绷',
      goals: '舒缓镇静、修护屏障、降低刺激反应',
      recommendedCare: '舒缓修护护理 + 低敏补水管理',
      metrics: { moisture: 38, oil: 36, elasticity: 52, sensitivity: 78, pore: 44, pigmentation: 39 },
    },
    {
      skinType: '混油',
      skinStatus: 'T区油脂分泌较旺，鼻翼和下巴毛孔更明显',
      mainProblems: 'T区出油、闭口粉刺、毛孔粗大',
      goals: '控油平衡、深层清洁、细致毛孔',
      recommendedCare: '深层清洁护理 + 水油平衡管理',
      metrics: { moisture: 55, oil: 72, elasticity: 61, sensitivity: 35, pore: 74, pigmentation: 42 },
    },
  ];
  const selected = profiles[seed % profiles.length];
  const capturedAt = data.capturedAt || new Date().toISOString();

  return {
    id: `mock-skin-photo-${Date.now()}`,
    customerId: data.customerId,
    customerName: data.customerName,
    ...selected,
    allergyHistory: '需到店确认近期过敏史和正在使用的护肤品',
    instrument: 'Ami AI肤质检测',
    confidence: Math.min(0.96, 0.82 + (seed % 12) / 100),
    capturedAt,
    explanation: `AI 初筛判断为${selected.skinType}肤质，${selected.skinStatus}。建议由美容师结合面诊和过敏史确认后录入最终护理方案。`,
  };
}

export async function mockGenerateTerminalServiceAdvice(
  data: TerminalServiceAdviceRequest,
): Promise<TerminalServiceAdviceResult> {
  const structured: TerminalServiceAdviceStructured = {
    preChecks: [
      data.customerId ? `确认客户 ${data.customerId} 禁忌` : '确认客户禁忌',
      data.skinTestId ? `复核检测 ${data.skinTestId}` : '确认本次护理目标',
    ],
    keySteps: ['确认服务项目', '记录护理过程', '服务后同步反馈'],
    materialUsage: ['按项目 BOM 记录耗材', '异常用量需备注'],
    followUpAdvice: '服务后记录顾客反馈和注意事项。',
    nextBookingHint: '建议结合护理周期预约下次到店。',
  };
  return result(
    'terminal_service_advice',
    `终端服务建议：服务前确认顾客过敏史和本次护理目标，服务中记录耗材用量，服务后引导预约下次护理。`,
    structured,
  );
}

export async function mockRecommendNextBestAction(data: NextBestActionRequest): Promise<NextBestActionResult> {
  const projectName =
    typeof data.context?.projectName === 'string'
      ? data.context.projectName
      : typeof data.context?.lastProjectName === 'string'
        ? data.context.lastProjectName
        : undefined;
  const structured: NextBestActionStructured = {
    action: projectName ? 'recommend_project' : 'send_care_reminder',
    reason: projectName ? `客户适合继续跟进 ${projectName}。` : '客户已有跟进信号，适合发送护理提醒。',
    projectName,
    urgency: 'this_week',
    confidence: 0.78,
  };
  return result(
    'next_best_action',
    '下一步建议：优先选择命中原因最明确的客户，使用低打扰渠道触达，并在顾客到店后记录采纳结果形成闭环。',
    structured,
  );
}
export async function mockResolveTerminalIntent(data: TerminalIntentResolveRequest): Promise<TerminalIntentResolveResult> {
  const text = data.command.trim();
  const available = new Set(data.availableActions);
  const pick = (...actions: string[]) => actions.find((action) => available.has(action)) ?? null;
  let action: string | null = null;
  if (/护理建议|护理方案|适合.*护理/.test(text)) action = pick('beautician.advice');
  else if (/服务记录|记录本次服务/.test(text)) action = pick('beautician.record');
  else if (/登记|新增客户|建档/.test(text)) action = pick('operation.register');
  else if (/办卡|开卡/.test(text)) action = pick('operation.card');
  else if (/充值/.test(text)) action = pick('operation.recharge');
  else if (/打印|小票/.test(text)) action = pick('operation.print');
  else if (/预约|到店|安排|优先处理/.test(text)) {
    action = pick(data.role === 'beautician' ? 'beautician.schedule' : 'reception.appointments');
  } else if (/库存|补货|临期/.test(text)) action = pick('manager.inventory');
  else if (/客户|档案|张三|李四|护理|皮肤/.test(text)) {
    action = pick(data.role === 'beautician' ? 'beautician.customer' : 'manager.customers');
  } else if (/收银|开单|付款|收款/.test(text)) action = pick('operation.cashier');
  else if (/核销|次卡/.test(text)) action = pick('operation.verify');
  else action = pick(data.availableActions[0] ?? '');

  return {
    intentName: action ? 'assistant_chat' : 'unknown.clarify',
    action,
    confidence: action ? 0.78 : 0.3,
    slots: { rawText: text },
    missingSlots: [],
    reason: action ? 'mock AI intent matched by terminal keywords' : 'mock AI could not resolve an allowed action',
  };
}
