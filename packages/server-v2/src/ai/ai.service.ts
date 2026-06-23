import { BadGatewayException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import { IndustryService } from '../industry/industry.service.js';

type AiMessage = { role: string; content: string };
type AiUsage = { provider: string; model: string; inputTokens: number; outputTokens: number };
type TerminalIntentResolveRequest = {
  role: 'manager' | 'reception' | 'beautician';
  command: string;
  availableActions: string[];
  quickActions: Array<{ label: string; action: string }>;
  currentStoreName?: string;
};
type TerminalIntentResolveResult = {
  intentName: string;
  action: string | null;
  confidence: number;
  slots: Record<string, unknown>;
  missingSlots: string[];
  reason?: string;
};
type TerminalDashboardInsight = {
  title: string;
  severity?: 'high' | 'medium' | 'low' | string;
  reason: string;
  action: string;
  relatedType?: string;
  relatedId?: number | string;
};
type TerminalDashboardInsights = {
  risks: TerminalDashboardInsight[];
  suggestions: TerminalDashboardInsight[];
};
type TerminalServiceAdviceStructured = {
  preChecks: string[];
  keySteps: string[];
  materialUsage: string[];
  followUpAdvice: string;
  nextBookingHint: string;
};
type IndustryKnowledgeContextItem = {
  id: number;
  title: string;
  domain?: string;
  content: string;
  safetyLevel?: string;
  sourceType: 'industry_knowledge';
};
type NextBestActionStructured = {
  action: 'recommend_project' | 'send_care_reminder' | 'offer_card' | 'escalate_to_consultant';
  reason: string;
  projectName?: string;
  urgency: 'now' | 'this_week' | 'this_month';
  confidence: number;
};
type AiGenerationResult = {
  id: string;
  scenario: string;
  text: string;
  variants?: any[];
  structured?: any;
  pageSchema?: ActivityPageSchema;
  pageVariants?: any[];
  safety: { masked: boolean; blocked: boolean; reasons: string[] };
  usage: AiUsage;
};

type SkinPhotoAnalyzeRequest = {
  customerId?: number;
  customerName?: string;
  storeName?: string;
  imageDataUrl: string;
  capturedAt?: string;
};

type CustomerInvitationScriptRequest = {
  scenario?: 'project' | 'promotion' | 'custom';
  customerId?: number;
  customerName?: string;
  skinType?: string;
  lastVisit?: string;
  projectName?: string;
  activityName?: string;
  promotionName?: string;
  offer?: string;
  targetAudience?: string;
  invitationReason?: string;
  preferredTime?: string;
  specialOffer?: string;
  channel?: string;
  evidence?: string[];
};

type SkinPhotoAnalyzeResult = {
  id: string;
  customerId?: number;
  customerName?: string;
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  allergyHistory?: string;
  goals: string;
  recommendedCare: string;
  instrument: string;
  isFallback?: boolean;
  metrics: {
    moisture: number;
    oil: number;
    elasticity: number;
    sensitivity: number;
    pore: number;
    pigmentation: number;
  };
  confidence: number;
  imageUrl?: string;
  capturedAt: string;
  explanation: string;
};

type FacePlusPlusSkinAnalyzeResponse = {
  request_id?: string;
  time_used?: number;
  error_message?: string;
  face_rectangle?: unknown;
  result?: Record<string, unknown>;
  [key: string]: unknown;
};

type ActivityPageSchema = {
  schemaVersion: '1.0';
  title: string;
  subtitle?: string;
  audienceLabel: string;
  theme: { tone: string; primaryColor?: string; backgroundColor?: string };
  sections: any[];
  cta: { text: string; action: string };
  safety: { customerFacing: boolean; blocked: boolean; reasons: string[] };
};

class AiProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class AiService {
  private provider: string;
  private model: string;
  private apiKey: string;
  private baseUrl: string;
  private chatPath: string;
  private timeoutMs: number;
  private temperature: number;
  private maxTokens: number;
  private stream: boolean;
  private thinking: string;
  private reasoningEffort: string;
  private fallbackProvider: string;
  private fallbackModel: string;
  private fallbackApiKey: string;
  private fallbackBaseUrl: string;
  private fallbackChatPath: string;
  private fallbackTimeoutMs: number;
  private faceppApiKey: string;
  private faceppApiSecret: string;
  private faceppSkinAnalyzeUrl: string;
  private faceppSkinAnalyzeTimeoutMs: number;
  private faceppSkinAnalyzeFallback: boolean;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private industryService?: IndustryService,
  ) {
    this.provider = String(config.get('LLM_PROVIDER', 'mock')).trim().toLowerCase();
    this.model = config.get('LLM_MODEL', 'deepseek-v4-flash');
    this.apiKey = config.get('LLM_API_KEY', '');
    this.baseUrl = config.get('LLM_BASE_URL', 'https://api.deepseek.com');
    this.chatPath = config.get('LLM_CHAT_PATH', '/chat/completions');
    this.timeoutMs = Number(config.get('LLM_TIMEOUT_MS', 30000));
    this.temperature = Number(config.get('LLM_TEMPERATURE', 0.3));
    this.maxTokens = Number(config.get('LLM_MAX_TOKENS', 512));
    this.stream = String(config.get('LLM_STREAM', 'false')).toLowerCase() === 'true';
    this.thinking = String(config.get('LLM_THINKING', 'disabled')).toLowerCase();
    this.reasoningEffort = String(config.get('LLM_REASONING_EFFORT', 'high')).toLowerCase();
    this.fallbackProvider = String(config.get('LLM_FALLBACK_PROVIDER', '')).trim().toLowerCase();
    this.fallbackModel = String(config.get('LLM_FALLBACK_MODEL', '')).trim();
    this.fallbackApiKey = String(config.get('LLM_FALLBACK_API_KEY', '')).trim();
    this.fallbackBaseUrl = String(config.get('LLM_FALLBACK_BASE_URL', '')).trim();
    this.fallbackChatPath = String(config.get('LLM_FALLBACK_CHAT_PATH', this.chatPath)).trim();
    this.fallbackTimeoutMs = Number(config.get('LLM_FALLBACK_TIMEOUT_MS', 20000));
    this.faceppApiKey = String(config.get('FACEPP_API_KEY', '')).trim();
    this.faceppApiSecret = String(config.get('FACEPP_API_SECRET', '')).trim();
    this.faceppSkinAnalyzeUrl = String(
      config.get('FACEPP_SKIN_ANALYZE_URL', 'https://api-cn.faceplusplus.com/facepp/v1/skinanalyze'),
    ).trim();
    this.faceppSkinAnalyzeTimeoutMs = Number(config.get('FACEPP_SKIN_ANALYZE_TIMEOUT_MS', String(this.timeoutMs)));
    this.faceppSkinAnalyzeFallback = String(config.get('FACEPP_SKIN_ANALYZE_FALLBACK', 'true')).toLowerCase() !== 'false';

    this.validateProductionConfig();
    console.info(
      `[AiService] provider=${this.provider || 'mock'} model=${this.model || 'n/a'} fallback=${this.hasFallbackProvider() ? `${this.fallbackProvider}:${this.fallbackModel}` : 'disabled'}`,
    );
  }

  async chat(messages: AiMessage[], userId?: number, storeId?: number) {
    return this.runScenario('chat', userId, storeId, () =>
      this.isMockProvider() ? this.mockChat(messages) : this.callLlm('chat', messages),
    );
  }

  async *chatStream(messages: AiMessage[], userId?: number, storeId?: number): AsyncGenerator<string> {
    const start = Date.now();
    let text = '';
    try {
      for await (const chunk of this.streamChatChunks(messages)) {
        text += chunk;
        yield chunk;
      }
      await this.logAudit('chat_stream', userId, storeId, this.buildMockResult('chat_stream', text), Date.now() - start, 'success');
    } catch (error) {
      const result = this.buildFailureResult('chat_stream', error);
      await this.logAudit('chat_stream', userId, storeId, result, Date.now() - start, 'failed');
      yield result.text;
    }
  }

  async generateTerminalDashboardInsights(
    data: { storeName?: string; context: any; fallback: TerminalDashboardInsights },
    userId?: number,
    storeId?: number,
  ) {
    const fallback = this.normalizeTerminalDashboardInsights(data.fallback);
    return this.runScenario('terminal_dashboard_insights', userId, storeId, async () => {
      if (this.isMockProvider()) {
        return this.buildMockResult('terminal_dashboard_insights', JSON.stringify(fallback), fallback);
      }

      const result = await this.callLlm('terminal_dashboard_insights', [
        {
          role: 'system',
          content:
            '你是美容门店店长驾驶舱分析助手。只能基于用户提供的 Ami_Core JSON 数据输出风险和建议，不得编造客户、员工、预约、库存、订单或金额。必须输出 JSON，格式为 {"risks":[],"suggestions":[]}。每条必须包含 title、severity、reason、action，可选 relatedType、relatedId。reason 必须带具体证据，action 必须是可执行动作。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            storeName: data.storeName,
            context: data.context,
            fallback,
          }),
        },
      ]);

      const parsed = this.parseJsonObject(result.text);
      const structured = this.normalizeTerminalDashboardInsights(parsed, fallback);
      return {
        ...result,
        text: JSON.stringify(structured),
        structured,
      };
    });
  }

  async generateInvitationScript(data: CustomerInvitationScriptRequest, userId?: number, storeId?: number) {
    return this.runScenario('customer-invitation-script', userId, storeId, async () => {
      const context = await this.buildInvitationScriptContext(data);
      if (this.isMockProvider()) {
        return this.buildInvitationScriptMockResult(data, context);
      }

      const prompt = this.buildInvitationScriptPrompt(data, context);
      const result = await this.callLlm('customer-invitation-script', [{ role: 'user', content: prompt }]);
      return {
        ...result,
        scenario: 'customer_invitation_script',
        structured: {
          ...(((result as AiGenerationResult).structured as Record<string, unknown> | undefined) ?? {}),
          context,
        },
      };
    });
  }

  private async buildInvitationScriptContext(data: CustomerInvitationScriptRequest) {
    const customerId = Number(data.customerId || 0);
    let customer: any = null;
    if (customerId && this.prisma.customer?.findUnique) {
      customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          healthProfile: true,
          consumptionRecords: {
            orderBy: { consumeTime: 'desc' },
            take: 3,
          },
        },
      }).catch(() => null);
    }

    const evidence = [
      ...(Array.isArray(data.evidence) ? data.evidence : []),
      customer?.lastVisitDate ? `上次到店：${customer.lastVisitDate.toISOString?.().slice(0, 10)}` : '',
      customer?.healthProfile?.skinType || data.skinType ? `肤质：${customer?.healthProfile?.skinType ?? data.skinType}` : '',
      ...(customer?.consumptionRecords ?? [])
        .map((record: any) => record.consumeContent || record.projectName || record.consumeType)
        .filter(Boolean)
        .slice(0, 2)
        .map((item: string) => `近期消费：${item}`),
    ].filter(Boolean).slice(0, 6);

    return {
      customerId: customer?.id ?? data.customerId,
      customerName: customer?.name ?? data.customerName ?? '会员',
      memberLevel: customer?.memberLevel,
      skinType: customer?.healthProfile?.skinType ?? customer?.skinType ?? data.skinType,
      lastVisit: customer?.lastVisitDate?.toISOString?.().slice(0, 10) ?? data.lastVisit,
      scenario: data.scenario ?? 'custom',
      projectName: data.projectName,
      activityName: data.activityName ?? data.promotionName,
      offer: data.offer ?? data.specialOffer,
      targetAudience: data.targetAudience,
      invitationReason: data.invitationReason,
      preferredTime: data.preferredTime,
      channel: data.channel ?? 'wechat',
      evidence,
    };
  }

  private buildInvitationScriptPrompt(data: CustomerInvitationScriptRequest, context: Record<string, any>) {
    return [
      '你是美容门店顾问的客户邀约助手。请生成一段客户可见的邀约话术。',
      '要求：只基于输入数据和证据生成，不编造客户事实；不得暴露 LTV、流失风险、模型分、内部标签；不承诺疗效；语气温暖、简洁、适合微信私聊。',
      JSON.stringify({
        scenario: data.scenario ?? context.scenario,
        customer: {
          name: context.customerName,
          memberLevel: context.memberLevel,
          skinType: context.skinType,
          lastVisit: context.lastVisit,
        },
        campaign: {
          projectName: data.projectName,
          activityName: data.activityName ?? data.promotionName,
          offer: data.offer ?? data.specialOffer,
          targetAudience: data.targetAudience,
          invitationReason: data.invitationReason,
          preferredTime: data.preferredTime,
          channel: data.channel,
        },
        evidence: context.evidence,
      }),
    ].join('\n');
  }

  private buildInvitationScriptMockResult(data: CustomerInvitationScriptRequest, context: Record<string, any>) {
    const name = this.sanitizeMarketingInputText(String(context.customerName || data.customerName || '会员')) || '会员';
    const project = this.sanitizeMarketingInputText(String(data.projectName || context.projectName || '适合您的护理方案')) || '适合您的护理方案';
    const offer = this.sanitizeMarketingInputText(String(data.offer || data.specialOffer || context.offer || '到店可享专属护理建议')) || '到店可享专属护理建议';
    const evidenceText = Array.isArray(context.evidence) && context.evidence.length
      ? `结合${context.evidence.slice(0, 2).join('、')}`
      : '结合您近期的护理需求';
    const text = [
      `${name}您好，${evidenceText}，门店这边为您准备了「${project}」。`,
      `${offer}，到店后顾问会先确认您的肌肤状态和时间安排，再为您细化护理方案。`,
      context.preferredTime ? `如果方便，可以优先为您预留 ${context.preferredTime}。` : '这周有空的话，可以帮您先预留一个合适时段。',
    ].join('\n');

    return this.buildMockResult(
      'customer_invitation_script',
      text,
      {
        context,
        channel: data.channel ?? 'wechat',
        customerFacing: true,
      },
    );
  }

  async generateMarketingCopy(
    data: {
      activityName?: string;
      campaignName?: string;
      targetAudience?: string;
      channel?: string;
      channels?: string[];
      offer?: string;
      source?: string;
      segment?: string;
      skinType?: string;
      triggerReasons?: string[];
      projectNames?: string[];
      productNames?: string[];
      startDate?: string;
      endDate?: string;
      storeName?: string;
      styleInstruction?: string;
    },
    userId?: number,
    storeId?: number,
  ) {
    const campaignName = this.toCustomerFacingMarketingCampaignName(data);
    const targetAudience = this.toCustomerFacingMarketingAudience(data);
    const offer = this.sanitizeMarketingInputText(data.offer || '到店可享专属礼遇') || '到店可享专属礼遇';
    const channels = data.channels?.length ? data.channels : [data.channel || 'wechat'];
    const periodText = data.startDate && data.endDate ? `，活动期 ${data.startDate} 至 ${data.endDate}` : '';
    const projectNames = this.getSafeMarketingItemNames(data.projectNames);
    const productNames = this.getSafeMarketingItemNames(data.productNames);
    const projectText = projectNames.length ? `，可预约体验${projectNames.join('、')}` : '';
    const productText = productNames.length ? `，并为您搭配${productNames.join('、')}` : '';
    const greeting = targetAudience === '老朋友' ? '好久不见，' : `${targetAudience}您好，`;
    const channelTemplates: Record<string, { title: string; text: string; tone: string }> = {
      sms: {
        title: `${campaignName}短信提醒`,
        tone: data.styleInstruction === 'urgent' ? 'urgent' : 'warm',
        text: `【${data.storeName || 'Ami_Core'}】${greeting}门店为您准备了「${campaignName}」：${offer}${periodText}。欢迎预约到店，让顾问为您安排合适护理。`,
      },
      wechat: {
        title: `${campaignName}微信私聊`,
        tone: data.styleInstruction === 'premium' ? 'premium' : 'warm',
        text: `${greeting}门店最近准备了一组适合换季护理的方案${projectText}${productText}。这次也为您准备了「${campaignName}」：${offer}${periodText}。您可以先选一个方便的时间，到店后我们再根据肌肤状态细化护理安排。`,
      },
      miniapp: {
        title: campaignName,
        tone: 'professional',
        text: `最近正适合给自己安排一次护理焕新。门店为您准备了「${campaignName}」：${offer}${projectText}${productText}${periodText}。在线预约后到店确认方案，服务顾问会根据您的实际状态推荐合适项目。`,
      },
      group: {
        title: `${campaignName}社群公告`,
        tone: 'warm',
        text: `本期「${campaignName}」开放预约：${offer}${projectText}${periodText}。想了解适配项目和可预约时间的会员，可以直接联系门店顾问。`,
      },
      store: {
        title: `${campaignName}门店物料`,
        tone: 'consultative',
        text: `把护理留给懂你的人。「${campaignName}」限时开启：${offer}${projectText}${productText}${periodText}。欢迎到店咨询，让专业顾问为您定制护理方案。`,
      },
      moments: {
        title: `${campaignName}朋友圈文案`,
        tone: data.styleInstruction === 'premium' ? 'premium' : 'warm',
        text: `真正适合自己的护理，不是跟风，而是被认真了解。「${campaignName}」已开启，会员可享${offer}${projectText}${periodText}。把一次到店，变成更稳定的变美节奏。`,
      },
    };
    const variants = channels.map((channel, index) => {
      const template = channelTemplates[channel] || channelTemplates.wechat;
      const rawText = data.styleInstruction === 'shorter' ? template.text.slice(0, channel === 'sms' ? 70 : 110) : template.text;
      const text = this.sanitizeCustomerFacingMarketingCopy(
        rawText,
        this.buildSafeMarketingFallbackCopy(channel, campaignName, targetAudience, offer, projectNames, periodText),
      );
      return {
        id: `copy-${channel}-${Date.now()}-${index}`,
        channel,
        title: this.sanitizeMarketingInputText(template.title) || campaignName,
        text,
        tone: template.tone,
        reasonTags: ['已转为客户可见文案', '已隐藏内部人群标签'],
        riskWarnings: ['不承诺疗效', '优惠规则以门店配置为准'],
      };
    });
    const recommendedVariantId = variants.find((item) => item.channel === 'miniapp')?.id ?? variants[0]?.id;
    const structured = {
      variants,
      recommendedVariantId,
      context: {
        campaignName,
        targetAudience,
        offer,
        source: this.sanitizeMarketingInputText(data.source || ''),
        segment: targetAudience,
        skinType: data.skinType,
        triggerReasons: (data.triggerReasons ?? [])
          .map((item) => this.sanitizeMarketingInputText(item))
          .filter((item) => item && !this.hasInternalMarketingCopyTerms(item)),
      },
    };
    const recommendedText = variants.find((item) => item.id === recommendedVariantId)?.text ?? variants[0]?.text ?? '';

    return this.runScenario('marketing-copy', userId, storeId, () =>
      this.buildMockResult(
        'marketing-copy',
        recommendedText,
        structured,
        variants.map((item) => ({ title: item.title, text: item.text, channel: item.channel })),
      ),
    );
  }

  async generateActivityPage(
    data: {
      strategyId?: number;
      sourceRecommendationId?: number | string;
      campaignName?: string;
      targetAudience?: string;
      offer?: string;
      source?: string;
      segment?: string;
      skinType?: string;
      triggerReasons?: string[];
      projectNames?: string[];
      productNames?: string[];
      startDate?: string;
      endDate?: string;
      storeName?: string;
      storePhone?: string;
      storeAddress?: string;
      styleInstruction?: string;
    },
    userId?: number,
    storeId?: number,
  ) {
    const promptTemplateVersion = 'marketing.activity_page.v1';
    return this.runScenario('activity-page', userId, storeId, async () => {
      if (this.isMockProvider()) {
        return this.buildActivityPageResult(data, promptTemplateVersion);
      }

      try {
        const prompt = this.buildActivityPagePrompt(data, promptTemplateVersion);
        const llmResult = await this.callLlm('activity-page', [{ role: 'user', content: prompt }]);
        const pageSchema = this.extractActivityPageSchema(llmResult.text);
        this.validateActivityPageSchema(pageSchema);
        return this.buildActivityPageResult(data, promptTemplateVersion, pageSchema, llmResult.usage);
      } catch (error) {
        const fallback = this.buildActivityPageResult(data, `${promptTemplateVersion}.fallback`, undefined, {
          provider: this.provider,
          model: this.model,
          inputTokens: 0,
          outputTokens: 0,
        });
        fallback.structured = {
          ...fallback.structured,
          fallbackReason: this.getUserFacingError(error),
          fallbackCode: error instanceof AiProviderError ? error.code : 'AI_ACTIVITY_PAGE_FALLBACK',
        } as any;
        return fallback;
      }
    });
  }

  async generateCampaignVariants(
    data: { campaignName?: string; targetAudience?: string; channels?: string[]; variantCount?: number; offer?: string },
    userId?: number,
    storeId?: number,
  ) {
    const channels = data.channels?.length ? data.channels : ['wechat'];
    const count = Math.max(1, data.variantCount || channels.length);
    const variants = channels.slice(0, count).map((channel, index) => ({
      title: `${data.campaignName || '会员护理活动'}-${index + 1}`,
      channel,
      text: `${data.targetAudience || '会员'}专属：${data.offer || '到店享专属护理权益'}，欢迎预约体验。`,
    }));

    return this.runScenario('campaign_variants', userId, storeId, () =>
      this.isMockProvider()
        ? this.buildMockResult(
            'campaign_variants',
            `已生成 ${variants.length} 个活动版本，可用于 ${variants.map((item) => item.channel).join(', ')} 渠道。`,
            {
              channels: variants.map((item) => item.channel),
              variantCount: variants.length,
              campaignName: data.campaignName,
              targetAudience: data.targetAudience,
            },
            variants,
          )
        : this.callLlm('campaign_variants', [{ role: 'user', content: JSON.stringify(data) }]),
    );
  }

  async generateCustomerSummary(data: { customerId: number; customerData: any }, userId?: number, storeId?: number) {
    return this.runScenario('customer-summary', userId, storeId, () =>
      this.isMockProvider()
        ? this.buildMockResult('customer-summary', '该客户消费频次稳定，建议关注护理周期、偏好项目和近期复购窗口。')
        : this.callLlm('customer-summary', [{ role: 'user', content: JSON.stringify(data.customerData) }]),
    );
  }

  async generateServiceNoteSummary(data: { notes?: string; customerId?: number; serviceTaskId?: number }, userId?: number, storeId?: number) {
    const text = data.notes?.trim() || '本次服务记录暂无详细备注';
    return this.runScenario('service_note_summary', userId, storeId, () =>
      this.isMockProvider()
        ? this.buildMockResult('service_note_summary', `服务摘要：${text.slice(0, 120)}。建议补充顾客反馈、使用耗材和下次护理计划。`, data)
        : this.callLlm('service_note_summary', [{ role: 'user', content: JSON.stringify(data) }]),
    );
  }

  async generateSkinTestExplanation(data: { metrics: any; skinType: string }, userId?: number, storeId?: number) {
    return this.runScenario('skin-test-explanation', userId, storeId, () =>
      this.isMockProvider()
        ? this.buildMockResult('skin-test-explanation', `检测结果显示当前肤质为${data.skinType}，建议结合水油状态与敏感程度安排护理。`)
        : this.callLlm('skin-test-explanation', [{ role: 'user', content: JSON.stringify(data) }]),
    );
  }

  async analyzeSkinPhoto(data: SkinPhotoAnalyzeRequest, userId?: number, storeId?: number): Promise<SkinPhotoAnalyzeResult> {
    const start = Date.now();
    try {
      const result = this.hasFacePlusPlusSkinAnalyzer()
        ? await this.callFacePlusPlusSkinAnalyze(data)
        : {
            ...this.buildSkinPhotoAnalyzeResult(data),
            isFallback: true,
            instrument: 'Ami AI 初筛（仅供参考）',
            explanation:
              '正式肤质检测暂不可用，以下为 AI 初筛结果，仅供顾问接待参考；建议到店后由顾问使用专业仪器复核。',
          };

      await this.logAudit(
        'skin_photo_analyze',
        userId,
        storeId,
        this.buildSkinPhotoAuditResult(
          result,
          this.hasFacePlusPlusSkinAnalyzer() ? 'faceplusplus' : 'mock',
          this.hasFacePlusPlusSkinAnalyzer() ? 'skin_analyze_premier' : 'ami-core-skin-fallback',
        ),
        Date.now() - start,
        'success',
      );
      return result;
    } catch (error) {
      if (!this.faceppSkinAnalyzeFallback) {
        await this.logAudit(
          'skin_photo_analyze',
          userId,
          storeId,
          this.buildFailureResult('skin_photo_analyze', error),
          Date.now() - start,
          'failed',
        );
        throw new BadGatewayException(this.getUserFacingError(error));
      }

      const fallback = {
        ...this.buildSkinPhotoAnalyzeResult(data),
        isFallback: true,
        instrument: 'Ami AI 初筛（仅供参考）',
        explanation:
          '正式肤质检测暂不可用，以下为 AI 初筛结果，仅供顾问接待参考；建议到店后由顾问使用专业仪器复核。',
      };
      await this.logAudit(
        'skin_photo_analyze',
        userId,
        storeId,
        this.buildSkinPhotoAuditResult(fallback, 'faceplusplus_fallback', 'skin_analyze_premier'),
        Date.now() - start,
        'failed_fallback',
      );
      return fallback;
    }
  }

  async generateTerminalServiceAdvice(data: { customerId?: number; projectId?: number; taskId?: number; skinTestId?: number }, userId?: number, storeId?: number) {
    const fallback = this.buildTerminalServiceAdviceFallback(data);
    const customerProfile = data.customerId ? await this.buildCustomerProfileContext(data.customerId) : null;
    const industryKnowledge = await this.getPublishedIndustryKnowledgeContext({ pageSize: 5 });
    return this.runScenario('terminal_service_advice', userId, storeId, async () => {
      if (this.isMockProvider()) {
        return this.buildMockResult(
          'terminal_service_advice',
          this.formatTerminalServiceAdviceText(fallback),
          { ...fallback, industryKnowledge },
        );
      }

      const result = await this.callLlm('terminal_service_advice', [
        {
          role: 'system',
          content:
            '你是美容门店服务规划助手。只能基于用户提供的 JSON 数据输出服务建议，不得编造项目名称、客户信息或耗材数量。必须输出合法 JSON，格式为 {"preChecks":[],"keySteps":[],"materialUsage":[],"followUpAdvice":"","nextBookingHint":""}。数组最多 4 条，每条不超过 30 字。',
        },
        { role: 'user', content: JSON.stringify({ input: data, customerProfile, industryKnowledge, fallback }) },
      ]);
      const structured = this.normalizeTerminalServiceAdvice(this.safeParseJsonObject(result.text), fallback);
      return {
        ...result,
        text: this.formatTerminalServiceAdviceText(structured),
        structured: { ...structured, industryKnowledge },
      };
    });
  }

  async getPublishedIndustryKnowledgeContext(query: { keyword?: string; domain?: string; pageSize?: number } = {}) {
    if (!this.industryService?.findKnowledgeItems) return [];
    try {
      const items = await this.industryService.findKnowledgeItems(
        {
          keyword: query.keyword,
          domain: query.domain,
          pageSize: query.pageSize ?? 5,
        } as any,
        true,
      );
      return items
        .map((item: any): IndustryKnowledgeContextItem | null => {
          const title = String(item?.title ?? '').trim();
          const content = String(item?.content ?? '').trim();
          if (!title || !content) return null;
          return {
            id: Number(item.id),
            title: title.slice(0, 80),
            domain: item.domain,
            content: content.slice(0, 600),
            safetyLevel: item.safetyLevel,
            sourceType: 'industry_knowledge',
          };
        })
        .filter(Boolean)
        .slice(0, query.pageSize ?? 5) as IndustryKnowledgeContextItem[];
    } catch (error) {
      console.warn('AI industry knowledge context load failed', error);
      return [];
    }
  }

  async recommendNextBestAction(data: { customerId: number; context: any }, userId?: number, storeId?: number) {
    const enrichedData = {
      ...data,
      context: await this.buildNextBestActionContext(data.customerId, data.context),
    };
    const fallback = this.buildNextBestActionFallback(enrichedData);
    return this.runScenario('next_best_action', userId, storeId, async () => {
      if (this.isMockProvider()) {
        return this.buildMockResult('next_best_action', this.formatNextBestActionText(fallback), fallback);
      }

      const result = await this.callLlm('next_best_action', [
        {
          role: 'system',
          content:
            '你是客户下一步行动推荐助手。只能从 recommend_project、send_care_reminder、offer_card、escalate_to_consultant 中选择 action，基于用户提供的 JSON 给出唯一最优建议。必须输出合法 JSON，格式为 {"action":"","reason":"","projectName":"","urgency":"","confidence":0}。reason 必须引用具体数据证据，不得泛泛而谈。',
        },
        { role: 'user', content: JSON.stringify({ input: enrichedData, fallback }) },
      ]);
      const structured = this.normalizeNextBestAction(this.safeParseJsonObject(result.text), fallback);
      return {
        ...result,
        text: this.formatNextBestActionText(structured),
        structured,
      };
    });
  }

  async resolveTerminalIntent(data: TerminalIntentResolveRequest, userId?: number, storeId?: number): Promise<TerminalIntentResolveResult> {
    if (this.isMockProvider()) {
      return this.normalizeTerminalIntentResult(this.mockTerminalIntent(data), data);
    }

    const prompt = [
      '你是 Ami Aura Lite 智能终端的意图解析器。',
      '只输出合法 JSON，不要输出 Markdown。',
      '只能从 availableActions 中选择 action；如果没有合适动作，action 必须为 null。',
      '不要决定业务事实，不要执行写入动作，只解析用户想进入哪个终端微应用。',
      'JSON 字段必须包含 intentName, action, confidence, slots, missingSlots, reason。',
      JSON.stringify({
        role: data.role,
        command: data.command,
        currentStoreName: data.currentStoreName,
        availableActions: data.availableActions,
        quickActions: data.quickActions,
      }),
    ].join('\n');

    const result = await this.runScenario('terminal_intent', userId, storeId, () =>
      this.callLlm('terminal_intent', [{ role: 'user', content: prompt }]),
    );

    if (result.safety.blocked) {
      return this.normalizeTerminalIntentResult(
        { intentName: 'unknown.clarify', action: null, confidence: 0.2, slots: {}, missingSlots: [], reason: result.text },
        data,
      );
    }

    return this.normalizeTerminalIntentResult(this.parseJsonObject(result.text), data);
  }

  private buildActivityPageResult(
    data: any,
    promptTemplateVersion: string,
    providedSchema?: ActivityPageSchema,
    usage?: AiUsage,
  ): AiGenerationResult {
    const pageSchema = providedSchema ?? this.buildActivityPageSchema(data);
    const variants = [
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
          title: String(pageSchema.title).replace('护理礼', '护理权益'),
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
      promptTemplateVersion,
      context: {
        campaignName: pageSchema.title,
        targetAudience: pageSchema.audienceLabel,
        offer: this.sanitizeMarketingInputText(data.offer || '到店可享专属护理权益') || '到店可享专属护理权益',
        source: this.sanitizeMarketingInputText(data.source || ''),
        segment: pageSchema.audienceLabel,
        skinType: data.skinType,
        triggerReasons: (data.triggerReasons ?? [])
          .map((item: string) => this.sanitizeMarketingInputText(item))
          .filter((item: string) => item && !this.hasInternalMarketingCopyTerms(item)),
      },
    };

    return {
      id: `ai-activity-page-${Date.now()}`,
      scenario: 'activity-page',
      text: pageSchema.subtitle || pageSchema.title,
      variants: variants.map((item) => ({
        title: item.name,
        text: item.pageSchema.subtitle || item.pageSchema.title,
        channel: 'miniapp',
      })),
      structured,
      pageSchema,
      pageVariants: variants,
      safety: {
        masked: true,
        blocked: pageSchema.safety.blocked,
        reasons: pageSchema.safety.reasons,
      },
      usage: usage ?? this.mockUsage(),
    };
  }

  private getMarketingCopySignal(data: any) {
    return [
      data.activityName,
      data.campaignName,
      data.targetAudience,
      data.source,
      data.segment,
      ...(data.triggerReasons ?? []),
      ...(data.projectNames ?? []),
      ...(data.productNames ?? []),
    ]
      .filter(Boolean)
      .join(' ');
  }

  private hasInternalMarketingCopyTerms(text?: string) {
    if (!text) return false;
    return [
      /\d+\s*位客户/,
      /客户进入/,
      /复购窗口/,
      /护理周期复购方案/,
      /高流失风险/,
      /流失风险/,
      /高价值客户/,
      /高\s*LTV/i,
      /客户需要维护/,
      /即将流失/,
      /沉睡客户/,
      /待唤醒/,
      /唤醒/,
      /命中客户/,
      /推荐命中/,
      /客户群体/,
      /智能推荐/,
      /策略名称/,
      /营销策略/,
      /策略/,
      /触发规则/,
      /自动规则/,
      /规则条件/,
      /算法/,
      /模型/,
      /RFM/i,
      /LTV/i,
      /P[0-3]\b/i,
      /高优先级/,
      /预测/,
      /预警/,
    ].some((pattern) => pattern.test(text));
  }

  private sanitizeMarketingInputText(text = '') {
    return String(text)
      .replace(/\d+\s*位客户/g, '')
      .replace(/进入\s*\d+\s*天复购窗口[。；，,、\s]*/g, '')
      .replace(/\d+\s*天复购窗口/g, '护理焕新')
      .replace(/高流失风险客户|流失风险客户|即将流失客户|沉睡客户|待唤醒客户/g, '老朋友')
      .replace(/高\s*LTV\s*客户|高价值客户/g, 'VIP会员')
      .replace(/客户需要维护/g, '会员权益维护')
      .replace(/护理周期复购方案/g, '护理焕新方案')
      .replace(/复购窗口/g, '护理焕新')
      .replace(/推荐命中|命中客户|客户群体|智能推荐|策略名称|营销策略|策略|触发规则|自动规则|规则条件/g, '')
      .replace(/RFM|LTV|算法|模型|预测|预警|P[0-3]\b|高优先级/gi, '')
      .replace(/[，,。；;、\s]*(?=[，,。；;、])/g, '')
      .replace(/^[，,。；;、\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toCustomerFacingMarketingCampaignName(data: any) {
    const signal = this.getMarketingCopySignal(data);
    if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友回店护理礼';
    if (/复购窗口|护理周期|30\s*天复购|复购/.test(signal)) return '护理焕新礼';
    if (/次卡|套餐|卡项|核销|划扣/.test(signal)) return '卡项护理权益提醒';
    if (/优惠券|券/.test(signal)) return '专属护理优惠';
    if (/生日|寿星/.test(signal)) return '生日月专属护理礼';
    if (/新客|首单|首次/.test(signal)) return '新客首护体验礼';
    if (/敏感|修护|舒缓/.test(signal)) return '敏感肌舒缓护理季';
    if (/补水|保湿|干性/.test(signal)) return '补水保湿护理季';
    if (/LTV|VIP|会员|高价值|铂金|黄金|尊享|权益|优先权/.test(signal)) return 'VIP尊享护理礼遇';

    const candidate = this.sanitizeMarketingInputText(data.campaignName || data.activityName || '');
    return candidate && !this.hasInternalMarketingCopyTerms(candidate) ? candidate : '会员专属护理活动';
  }

  private toCustomerFacingActivityTitle(data: any, campaignName: string) {
    const signal = this.getMarketingCopySignal(data);
    if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友回店护理礼已为你留好';
    if (/复购窗口|护理周期|30\s*天复购|复购/.test(signal)) return '本期护理焕新权益已开启';
    if (/次卡|套餐|卡项|核销|划扣/.test(signal)) return '你的卡项护理权益待预约';
    if (/优惠券|券/.test(signal)) return '专属护理优惠限时可领';
    if (/生日|寿星/.test(signal)) return '生日月护理礼遇已送达';
    if (/新客|首单|首次/.test(signal)) return '新客首护体验权益已开启';
    if (/敏感|修护|舒缓/.test(signal)) return '敏感肌舒缓修护权益已开启';
    if (/补水|保湿|干性/.test(signal)) return '补水保湿护理权益已开启';
    if (/LTV|VIP|会员|高价值|铂金|黄金|尊享|权益|优先权/.test(signal)) return '本期VIP专属护理权益已开启';
    return campaignName;
  }

  private toCustomerFacingMarketingAudience(data: any) {
    const signal = this.getMarketingCopySignal(data);
    if (/流失|沉睡|唤醒|回归|未到店/.test(signal)) return '老朋友';
    if (/生日|寿星/.test(signal)) return '寿星会员';
    if (/新客|首单|首次/.test(signal)) return '新朋友';
    if (/LTV|VIP|高价值|铂金|黄金|尊享|权益|优先权/.test(signal)) return 'VIP会员';
    return '会员';
  }

  private getSafeMarketingItemNames(names?: string[]) {
    return (Array.isArray(names) ? names : [])
      .map((name) => this.sanitizeMarketingInputText(name))
      .filter((name) => name && !this.hasInternalMarketingCopyTerms(name))
      .slice(0, 3);
  }

  private buildSafeMarketingFallbackCopy(
    channel: string,
    campaignName: string,
    targetAudience: string,
    offer: string,
    projectNames: string[],
    periodText: string,
  ) {
    const itemText = projectNames.length ? `，可预约体验${projectNames.join('、')}` : '';
    if (channel === 'sms') {
      return `【Ami_Core】${campaignName}已开启：${offer}${itemText}${periodText}。可在线预约，到店后由顾问为您确认合适护理方案。`;
    }
    if (channel === 'store') {
      return `${targetAudience}您好，门店为您准备了「${campaignName}」：${offer}${itemText}${periodText}。到店后我们会根据实际肤况帮您细化护理安排。`;
    }
    return `最近正适合给自己安排一次护理焕新。门店为您准备了「${campaignName}」：${offer}${itemText}${periodText}。可在线预约，到店后由顾问根据您的肤况和护理习惯确认合适方案。`;
  }

  private sanitizeCustomerFacingMarketingCopy(text: string, fallback: string) {
    const cleaned = this.sanitizeMarketingInputText(text);
    if (!cleaned || cleaned.length < 12 || this.hasInternalMarketingCopyTerms(cleaned)) {
      return fallback;
    }
    return cleaned;
  }

  private buildActivityPageSchema(data: any): ActivityPageSchema {
    const signal = [
      data.campaignName,
      data.targetAudience,
      data.source,
      data.segment,
      ...(data.triggerReasons ?? []),
    ].filter(Boolean).join(' ');
    const isReturnCare = /流失|沉睡|未到店|回归|唤醒/.test(signal);
    const isBirthday = /生日|寿星/.test(signal);
    const title = this.toCustomerFacingMarketingCampaignName(data);
    const heroTitle = this.toCustomerFacingActivityTitle(data, title);
    const audienceLabel = this.toCustomerFacingMarketingAudience(data);
    const offer = data.offer || '到店可享专属护理权益';
    const startDate = data.startDate || formatBusinessDate(new Date());
    const endDate = data.endDate || formatBusinessDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    const rawProjectNames = Array.isArray(data.projectNames) ? data.projectNames : [];
    const projectNames = rawProjectNames
      .map((name: string) => this.sanitizeMarketingInputText(name))
      .filter((name: string) => name && !this.hasInternalMarketingCopyTerms(name))
      .slice(0, 3);
    if (projectNames.length === 0) {
      projectNames.push(isReturnCare ? '回店护理关怀方案' : '补水修护护理', '舒缓清洁护理');
    }
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
          title: heroTitle,
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
            { title: '按护理节奏推荐', description: '结合近期到店和护理周期，优先推荐更适合当前状态的方案。' },
            { title: '顾问到店细化', description: '不做夸大承诺，到店后根据肤况和禁忌再确认服务内容。' },
            { title: '权益清晰可核销', description: '优惠、项目和时间范围在页面内说明，减少沟通成本。' },
          ],
        },
        {
          type: 'project_recommendation',
          title: '推荐护理',
          items: projectNames.slice(0, 3).map((name: string, index: number) => ({
            name,
            description: index === 0 ? '适合作为本次到店的优先体验项目。' : '可由顾问根据肤况搭配选择。',
            originalPrice: index === 0 ? 680 : 480,
            activityPrice: index === 0 ? 380 : 298,
            reason: '与本次活动权益和客户护理需求匹配。',
          })),
        },
        ...(
          productNames.length
            ? [{
                type: 'product_recommendation',
                title: '可搭配商品',
                items: productNames.slice(0, 2).map((name: string) => ({
                  name,
                  description: '适合居家护理搭配使用，到店后由顾问确认是否适合。',
                  activityPrice: 199,
                  category: '居家护理',
                })),
              }]
            : []
        ),
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

  private buildActivityPagePrompt(data: any, promptTemplateVersion: string) {
    return [
      `Prompt template: ${promptTemplateVersion}`,
      '你是美业门店的小程序营销页策划，请只输出合法 JSON，不要输出 Markdown。',
      '目标：生成客户可见的小程序活动页结构，不得生成 HTML、CSS、JS 或任意代码。',
      '禁止出现内部经营标签：流失风险、沉睡客户、高价值客户、唤醒、LTV、转化率、算法命中。',
      '禁止制造焦虑、夸大疗效、承诺医疗效果。',
      'JSON 字段必须包含 schemaVersion,title,subtitle,audienceLabel,theme,sections,cta,safety。',
      'sections.type 只允许 hero,offer,benefits,project_recommendation,product_recommendation,skin_care_advice,consultant_note,faq,notice,store_info。',
      JSON.stringify(data),
    ].join('\n');
  }

  private extractActivityPageSchema(text: string): ActivityPageSchema {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new AiProviderError('SCHEMA_INVALID', 'AI 生成的活动页结构不可解析', 422);
    }
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parsed.pageSchema ?? parsed;
    } catch {
      throw new AiProviderError('SCHEMA_INVALID', 'AI 生成的活动页 JSON 格式不正确', 422);
    }
  }

  private validateActivityPageSchema(schema: ActivityPageSchema) {
    const allowedSections = new Set([
      'hero',
      'offer',
      'benefits',
      'project_recommendation',
      'product_recommendation',
      'skin_care_advice',
      'consultant_note',
      'faq',
      'notice',
      'store_info',
    ]);
    if (!schema || schema.schemaVersion !== '1.0' || !schema.title || !Array.isArray(schema.sections)) {
      throw new AiProviderError('SCHEMA_INVALID', 'AI 生成的活动页结构缺少必要字段', 422);
    }
    if (!schema.cta?.text || !schema.cta?.action) {
      throw new AiProviderError('SCHEMA_INVALID', 'AI 生成的活动页缺少 CTA 配置', 422);
    }
    if (!schema.safety?.customerFacing || schema.safety.blocked) {
      throw new AiProviderError('SCHEMA_BLOCKED', 'AI 生成内容未通过客户可见安全检查', 422);
    }
    const serialized = JSON.stringify(schema);
    if (/<\/?[a-z][\s\S]*>/i.test(serialized)) {
      throw new AiProviderError('SCHEMA_INVALID', 'AI 活动页不允许包含 HTML', 422);
    }
    if (/流失风险|沉睡客户|高价值客户|高风险|风险客户|唤醒|挽回|LTV|转化率|算法命中/.test(serialized)) {
      throw new AiProviderError('SCHEMA_INVALID', 'AI 活动页包含内部经营标签', 422);
    }
    for (const section of schema.sections) {
      if (!allowedSections.has(section?.type)) {
        throw new AiProviderError('SCHEMA_INVALID', `AI 活动页包含未知模块：${section?.type}`, 422);
      }
    }
  }

  async getAuditLogs(query: { page?: number | string; pageSize?: number | string; scenario?: string; status?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Number(query.pageSize) || 20);
    const scenario = query.scenario?.trim();
    const status = query.status?.trim();
    const where: any = {};
    if (scenario) where.scenario = scenario;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.aiAuditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiAuditLog.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async getAuditLogSummary(query: { scenario?: string; status?: string }) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const scenario = query.scenario?.trim();
    const status = query.status?.trim();
    const where: any = { createdAt: { gte: since } };
    if (scenario) where.scenario = scenario;
    if (status) where.status = status;

    const [total, successCount, failedCount, blockedCount, latencyStats] = await Promise.all([
      this.prisma.aiAuditLog.count({ where }),
      this.prisma.aiAuditLog.count({ where: { ...where, status: 'success' } }),
      this.prisma.aiAuditLog.count({ where: { ...where, status: { in: ['failed', 'failed_fallback'] } } }),
      this.prisma.aiAuditLog.count({ where: { ...where, safetyBlocked: true } }),
      this.prisma.aiAuditLog.aggregate({ where, _avg: { latencyMs: true } }),
    ]);

    return {
      total,
      successCount,
      failedCount,
      successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
      averageLatencyMs: Math.round(Number(latencyStats._avg.latencyMs ?? 0)),
      blockedCount,
    };
  }

  private isMockProvider() {
    return this.provider === 'mock';
  }

  private validateProductionConfig() {
    if (process.env.NODE_ENV !== 'production') return;

    if (!this.isMockProvider() && (!this.apiKey || !this.baseUrl || !this.model)) {
      throw new Error('LLM_API_KEY, LLM_BASE_URL and LLM_MODEL must be configured for non-mock AI provider in production.');
    }

    if (!this.faceppSkinAnalyzeFallback && !this.hasFacePlusPlusSkinAnalyzer()) {
      throw new Error(
        'FACEPP_API_KEY, FACEPP_API_SECRET and FACEPP_SKIN_ANALYZE_URL must be configured when Face++ fallback is disabled in production.',
      );
    }
  }

  private async runScenario(
    scenario: string,
    userId: number | undefined,
    storeId: number | undefined,
    producer: () => Promise<AiGenerationResult> | AiGenerationResult,
  ) {
    const start = Date.now();
    try {
      const result = await producer();
      await this.logAudit(scenario, userId, storeId, result, Date.now() - start, 'success');
      return result;
    } catch (error) {
      const result = this.buildFailureResult(scenario, error);
      await this.logAudit(scenario, userId, storeId, result, Date.now() - start, 'failed');
      return result;
    }
  }

  private mockChat(messages: AiMessage[]) {
    const lastMessage = messages[messages.length - 1]?.content || '';
    return this.buildMockResult(
      'chat',
      `收到您的消息：「${lastMessage.slice(0, 80)}」。我会基于 Ami Core 的业务数据给出解释和下一步建议。`,
    );
  }

  private async *streamChatChunks(messages: AiMessage[]): AsyncGenerator<string> {
    if (this.isMockProvider()) {
      yield* this.chunkText(this.mockChat(messages).text);
      return;
    }

    if (this.provider === 'deepseek' || this.provider === 'openai_compatible') {
      try {
        yield* this.callOpenAiCompatibleStream('chat_stream', messages, {
          provider: this.provider,
          model: this.model,
          apiKey: this.apiKey,
          baseUrl: this.baseUrl,
          chatPath: this.chatPath,
          timeoutMs: this.timeoutMs,
        });
        return;
      } catch (error) {
        if (!this.hasFallbackProvider()) throw error;
      }
    }

    if (this.hasFallbackProvider()) {
      try {
        yield* this.callOpenAiCompatibleStream('chat_stream', messages, {
          provider: this.fallbackProvider === 'openai-compat' ? 'openai_compatible' : this.fallbackProvider,
          model: this.fallbackModel,
          apiKey: this.fallbackApiKey,
          baseUrl: this.fallbackBaseUrl,
          chatPath: this.fallbackChatPath || this.chatPath,
          timeoutMs: this.fallbackTimeoutMs || this.timeoutMs,
        });
        return;
      } catch {
        // Fall through to non-stream response.
      }
    }

    const result = await this.callLlm('chat', messages);
    yield* this.chunkText(result.text);
  }

  private async *chunkText(text: string): AsyncGenerator<string> {
    const source = text || '';
    for (let index = 0; index < source.length; index += 12) {
      yield source.slice(index, index + 12);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }

  private buildSkinPhotoAnalyzeResult(data: SkinPhotoAnalyzeRequest): SkinPhotoAnalyzeResult {
    const seed = Math.abs(
      [...String(data.customerId ?? data.customerName ?? data.imageDataUrl?.length ?? Date.now())].reduce(
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
      id: `skin-photo-${Date.now()}`,
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

  private hasFacePlusPlusSkinAnalyzer() {
    return Boolean(this.faceppApiKey && this.faceppApiSecret && this.faceppSkinAnalyzeUrl);
  }

  private async callFacePlusPlusSkinAnalyze(data: SkinPhotoAnalyzeRequest): Promise<SkinPhotoAnalyzeResult> {
    const imageBase64 = this.extractBase64Image(data.imageDataUrl);
    const body = new URLSearchParams();
    body.set('api_key', this.faceppApiKey);
    body.set('api_secret', this.faceppApiSecret);
    body.set('image_base64', imageBase64);

    const response = await fetch(this.faceppSkinAnalyzeUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(this.faceppSkinAnalyzeTimeoutMs),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }).catch((error) => {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new AiProviderError('TIMEOUT', 'Face++ 肤质检测请求超时');
      }
      throw new AiProviderError('NETWORK_ERROR', 'Face++ 肤质检测网络请求失败');
    });

    const payload = (await response.json().catch(() => ({}))) as FacePlusPlusSkinAnalyzeResponse;
    if (!response.ok || payload.error_message) {
      throw new AiProviderError(
        'FACEPP_UPSTREAM_ERROR',
        `Face++ 肤质检测返回异常：${payload.error_message || response.status}`,
        response.status,
      );
    }

    return this.mapFacePlusPlusSkinResult(data, payload);
  }

  private extractBase64Image(imageDataUrl: string) {
    const raw = String(imageDataUrl || '').trim();
    if (!raw) throw new AiProviderError('IMAGE_REQUIRED', '请先拍摄或上传顾客面部照片');
    const commaIndex = raw.indexOf(',');
    const base64 = raw.startsWith('data:') && commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
    if (!base64 || base64.length < 64) {
      throw new AiProviderError('IMAGE_INVALID', '图片数据不完整，请重新拍摄');
    }
    return base64;
  }

  private mapFacePlusPlusSkinResult(
    request: SkinPhotoAnalyzeRequest,
    payload: FacePlusPlusSkinAnalyzeResponse,
  ): SkinPhotoAnalyzeResult {
    const result = (payload.result ?? {}) as Record<string, unknown>;
    const skinType = this.normalizeSkinType(
      this.pickLabel(result, ['skin_type', 'skinType', 'skin_texture', 'skinTexture', 'skin_quality', 'skinQuality']),
      result,
    );
    const sensitivityScore = this.pickScore(result, ['sensitivity', 'sensitive', 'red_area', 'redArea', 'skin_sensitivity']);
    const poreScore = this.pickScore(result, ['pores_forehead', 'pores_left_cheek', 'pores_right_cheek', 'pores_jaw', 'pore', 'pores']);
    const pigmentationScore = this.pickScore(result, ['spot', 'spots', 'pigmentation', 'mole', 'skin_color_level', 'skin_tone']);
    const acneScore = this.pickScore(result, ['acne', 'pimple', 'closed_comedones', 'blackhead']);
    const wrinkleScore = this.pickScore(result, ['nasolabial_fold', 'forehead_wrinkle', 'crows_feet', 'eye_finelines', 'glabella_wrinkle']);
    const skinAge = this.pickNumber(result, ['skin_age', 'skinAge', 'age']);
    const oil = this.deriveOilScore(skinType, result);
    const moisture = this.deriveMoistureScore(skinType, sensitivityScore, acneScore);
    const elasticity = this.clampScore(82 - wrinkleScore * 0.35 - (skinAge ? Math.max(0, skinAge - 28) * 0.8 : 0));

    const problemItems = [
      sensitivityScore >= 55 ? '敏感泛红' : '',
      poreScore >= 55 ? '毛孔粗大' : '',
      pigmentationScore >= 55 ? '肤色不均或色沉' : '',
      acneScore >= 45 ? '痘痘/闭口/黑头' : '',
      wrinkleScore >= 45 ? '细纹或法令纹' : '',
      moisture < 50 ? '缺水干燥' : '',
    ].filter(Boolean);
    const mainProblems = problemItems.length ? problemItems.join('、') : '整体肤况较稳定，建议持续观察水油平衡';
    const goals = this.buildSkinGoals(skinType, problemItems);
    const recommendedCare = this.buildSkinCareRecommendation(skinType, problemItems);
    const skinStatus = this.buildSkinStatus(skinType, {
      moisture,
      oil,
      sensitivity: sensitivityScore,
      pore: poreScore,
      pigmentation: pigmentationScore,
      skinAge,
    });

    return {
      id: payload.request_id || `facepp-skin-photo-${Date.now()}`,
      customerId: request.customerId,
      customerName: request.customerName,
      skinType,
      skinStatus,
      mainProblems,
      allergyHistory: sensitivityScore >= 55 ? '检测到敏感/泛红风险，需到店确认近期过敏史与护肤品使用情况' : '需到店确认近期过敏史和正在使用的护肤品',
      goals,
      recommendedCare,
      instrument: 'Face++ 皮肤分析-高阶版',
      metrics: {
        moisture,
        oil,
        elasticity,
        sensitivity: sensitivityScore,
        pore: poreScore,
        pigmentation: pigmentationScore,
      },
      confidence: this.deriveFacePlusPlusConfidence(payload, result),
      capturedAt: request.capturedAt || new Date().toISOString(),
      explanation: `Face++ 高阶肤质检测判断当前偏${skinType}，主要关注${mainProblems}。建议由美容师结合面诊、过敏史和门店项目禁忌确认后，再录入最终护理方案。`,
    };
  }

  private buildSkinPhotoAuditResult(result: SkinPhotoAnalyzeResult, provider: string, model: string): AiGenerationResult {
    return {
      id: result.id,
      scenario: 'skin_photo_analyze',
      text: result.explanation,
      structured: {
        promptTemplateVersion: provider === 'faceplusplus' ? 'facepp.skin_analyze_premier.v1' : 'ami.skin_photo_fallback.v1',
        skinType: result.skinType,
        mainProblems: result.mainProblems,
        metrics: result.metrics,
      },
      safety: {
        masked: true,
        blocked: false,
        reasons: [],
      },
      usage: {
        provider,
        model,
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }

  private pickLabel(source: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.deepPick(source, key);
      const label = this.extractLabel(value);
      if (label) return label;
    }
    return undefined;
  }

  private pickScore(source: Record<string, unknown>, keys: string[]): number {
    const scores = keys
      .map((key) => this.deepPick(source, key))
      .map((value) => this.extractScore(value))
      .filter((value): value is number => Number.isFinite(value));
    if (!scores.length) return 35;
    return this.clampScore(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  }

  private pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = this.extractScore(this.deepPick(source, key));
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  private deepPick(source: unknown, targetKey: string): unknown {
    if (!source || typeof source !== 'object') return undefined;
    const record = source as Record<string, unknown>;
    if (targetKey in record) return record[targetKey];
    const normalizedTarget = this.normalizeKey(targetKey);
    for (const [key, value] of Object.entries(record)) {
      if (this.normalizeKey(key) === normalizedTarget) return value;
      const nested = this.deepPick(value, targetKey);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  private normalizeKey(value: string) {
    return String(value).replace(/[_\-\s]/g, '').toLowerCase();
  }

  private extractLabel(value: unknown): string | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.extractLabel(item)).find(Boolean);
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['label', 'name', 'type', 'value', 'category', 'skin_type']) {
        const label = this.extractLabel(record[key]);
        if (label) return label;
      }
    }
    return undefined;
  }

  private extractScore(value: unknown): number {
    if (typeof value === 'number') return this.normalizeScore(value);
    if (typeof value === 'string') {
      const numeric = Number(value.replace('%', ''));
      return Number.isFinite(numeric) ? this.normalizeScore(numeric) : NaN;
    }
    if (Array.isArray(value)) {
      const scores = value.map((item) => this.extractScore(item)).filter(Number.isFinite);
      return scores.length ? scores.reduce((sum, item) => sum + item, 0) / scores.length : NaN;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['score', 'confidence', 'value', 'degree', 'level', 'severity', 'count']) {
        const score = this.extractScore(record[key]);
        if (Number.isFinite(score)) return score;
      }
    }
    return NaN;
  }

  private normalizeScore(value: number) {
    if (!Number.isFinite(value)) return NaN;
    if (value >= 0 && value <= 1) return value * 100;
    if (value >= 0 && value <= 5) return value * 20;
    return this.clampScore(value);
  }

  private clampScore(value: number) {
    return Math.round(Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)));
  }

  private normalizeSkinType(label: string | undefined, result: Record<string, unknown>) {
    const text = `${label ?? ''} ${JSON.stringify(result).slice(0, 300)}`.toLowerCase();
    if (/mixed|combination|混合/.test(text)) return '混合';
    if (/oily|oil|油/.test(text)) return '油性';
    if (/dry|干/.test(text)) return '干性';
    if (/sensitive|敏感|red/.test(text)) return '敏感';
    if (/normal|neutral|中性/.test(text)) return '中性';
    return '混合';
  }

  private deriveOilScore(skinType: string, result: Record<string, unknown>) {
    const explicit = this.pickScore(result, ['oil', 'oily', 'skin_oil']);
    if (explicit !== 35) return explicit;
    if (skinType === '油性') return 78;
    if (skinType === '混合') return 62;
    if (skinType === '干性') return 34;
    if (skinType === '敏感') return 38;
    return 50;
  }

  private deriveMoistureScore(skinType: string, sensitivity: number, acne: number) {
    const base = skinType === '干性' ? 38 : skinType === '敏感' ? 42 : skinType === '油性' ? 55 : skinType === '混合' ? 50 : 58;
    return this.clampScore(base - Math.max(0, sensitivity - 55) * 0.2 - Math.max(0, acne - 60) * 0.1);
  }

  private deriveFacePlusPlusConfidence(payload: FacePlusPlusSkinAnalyzeResponse, result: Record<string, unknown>) {
    const faceDetected = payload.face_rectangle || this.deepPick(payload, 'face_rectangle') ? 0.9 : 0.82;
    const values = [
      this.pickScore(result, ['skin_type', 'skin_color', 'sensitivity']),
      this.pickScore(result, ['pore', 'pores']),
      this.pickScore(result, ['spot', 'pigmentation']),
    ].filter((value) => value !== 35);
    return Number(Math.min(0.97, faceDetected + values.length * 0.015).toFixed(2));
  }

  private buildSkinStatus(
    skinType: string,
    metrics: { moisture: number; oil: number; sensitivity: number; pore: number; pigmentation: number; skinAge?: number },
  ) {
    const parts = [
      `肤质倾向为${skinType}`,
      metrics.moisture < 50 ? '含水水平偏低' : '含水水平尚可',
      metrics.oil > 65 ? '油脂分泌偏旺' : metrics.oil < 40 ? '油脂分泌偏低' : '水油状态相对平衡',
      metrics.sensitivity > 55 ? '存在敏感泛红风险' : '敏感风险较低',
      metrics.pore > 55 ? '毛孔问题较明显' : '毛孔状态可控',
      metrics.pigmentation > 55 ? '肤色不均或色沉需关注' : '',
      metrics.skinAge ? `参考肤龄约 ${Math.round(metrics.skinAge)} 岁` : '',
    ].filter(Boolean);
    return parts.join('，');
  }

  private buildSkinGoals(skinType: string, problems: string[]) {
    const goals = new Set<string>();
    if (skinType === '干性' || problems.includes('缺水干燥')) goals.add('补水保湿');
    if (skinType === '敏感' || problems.includes('敏感泛红')) goals.add('舒缓修护');
    if (skinType === '油性' || problems.includes('痘痘/闭口/黑头')) goals.add('控油清洁');
    if (problems.includes('毛孔粗大')) goals.add('细致毛孔');
    if (problems.includes('肤色不均或色沉')) goals.add('提亮肤色');
    if (problems.includes('细纹或法令纹')) goals.add('紧致抗初老');
    if (!goals.size) goals.add('维持稳定肤况');
    return Array.from(goals).join('、');
  }

  private buildSkinCareRecommendation(skinType: string, problems: string[]) {
    if (skinType === '敏感' || problems.includes('敏感泛红')) return '舒缓修护护理 + 低敏补水管理';
    if (skinType === '油性' || problems.includes('痘痘/闭口/黑头')) return '深层清洁护理 + 控油平衡管理';
    if (problems.includes('细纹或法令纹')) return '补水修护护理 + 紧致抗初老管理';
    if (problems.includes('肤色不均或色沉')) return '提亮焕肤护理 + 屏障修护管理';
    if (skinType === '干性' || problems.includes('缺水干燥')) return '水光补水护理 + 屏障修护管理';
    return '基础清洁补水护理 + 周期复查';
  }

  private mockTerminalIntent(data: TerminalIntentResolveRequest): TerminalIntentResolveResult {
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

  private normalizeTerminalIntentResult(raw: any, request: TerminalIntentResolveRequest): TerminalIntentResolveResult {
    const allowed = new Set(request.availableActions);
    const action = typeof raw?.action === 'string' && allowed.has(raw.action) ? raw.action : null;
    const confidence = Math.min(1, Math.max(0, Number(raw?.confidence ?? (action ? 0.7 : 0.2))));
    return {
      intentName: typeof raw?.intentName === 'string' && raw.intentName ? raw.intentName : action ? 'assistant_chat' : 'unknown.clarify',
      action,
      confidence,
      slots: raw?.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots) ? raw.slots : { rawText: request.command },
      missingSlots: Array.isArray(raw?.missingSlots) ? raw.missingSlots.map(String) : [],
      reason: typeof raw?.reason === 'string' ? raw.reason : action ? 'AI resolved to allowed action' : 'AI did not return an allowed action',
    };
  }

  private parseJsonObject(text: string): Record<string, unknown> {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return {};
    }
  }

  private async callLlm(scenario: string, messages: AiMessage[]) {
    try {
      return await this.callPrimaryLlm(scenario, messages);
    } catch (primaryError) {
      if (this.isMockProvider() || !this.hasFallbackProvider()) throw primaryError;
      try {
        return await this.callFallbackLlm(scenario, messages);
      } catch {
        throw primaryError;
      }
    }
  }

  private async callPrimaryLlm(scenario: string, messages: AiMessage[]) {
    if (!this.apiKey) {
      throw new AiProviderError('CONFIG_MISSING', 'AI 服务尚未配置 API Key');
    }

    if (this.provider === 'deepseek' || this.provider === 'openai_compatible') {
      return this.callOpenAiCompatible(scenario, messages);
    }

    return this.callAnthropicCompatible(scenario, messages);
  }

  private hasFallbackProvider() {
    return Boolean(
      !this.isMockProvider() &&
      this.fallbackProvider &&
      this.fallbackApiKey &&
      this.fallbackBaseUrl &&
      this.fallbackModel,
    );
  }

  private async callFallbackLlm(scenario: string, messages: AiMessage[]) {
    const normalizedProvider = this.fallbackProvider === 'openai-compat' ? 'openai_compatible' : this.fallbackProvider;
    if (normalizedProvider !== 'openai_compatible' && normalizedProvider !== 'deepseek') {
      throw new AiProviderError('FALLBACK_PROVIDER_UNSUPPORTED', 'Fallback AI Provider 仅支持 OpenAI-compatible 或 DeepSeek', 502);
    }
    const result = await this.callOpenAiCompatibleWithConfig(scenario, messages, {
      provider: normalizedProvider,
      model: this.fallbackModel,
      apiKey: this.fallbackApiKey,
      baseUrl: this.fallbackBaseUrl,
      chatPath: this.fallbackChatPath || this.chatPath,
      timeoutMs: this.fallbackTimeoutMs || this.timeoutMs,
    });
    return {
      ...result,
      usage: {
        ...result.usage,
        provider: `${result.usage.provider}(fallback)`,
      },
    };
  }

  private getOpenAiCompatibleUrl() {
    const base = this.baseUrl.replace(/\/+$/, '');
    const path = this.chatPath.startsWith('/') ? this.chatPath : `/${this.chatPath}`;
    return base.endsWith(path) ? base : `${base}${path}`;
  }

  private getOpenAiCompatibleUrlFor(baseUrl: string, chatPath: string) {
    const base = baseUrl.replace(/\/+$/, '');
    const path = chatPath.startsWith('/') ? chatPath : `/${chatPath}`;
    return base.endsWith(path) ? base : `${base}${path}`;
  }

  private normalizeMessages(messages: AiMessage[]) {
    return messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
      content: String(message.content ?? ''),
    }));
  }

  private async callOpenAiCompatible(scenario: string, messages: AiMessage[]) {
    return this.callOpenAiCompatibleWithConfig(scenario, messages, {
      provider: this.provider,
      model: this.model,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      chatPath: this.chatPath,
      timeoutMs: this.timeoutMs,
    });
  }

  private async callOpenAiCompatibleWithConfig(
    scenario: string,
    messages: AiMessage[],
    providerConfig: {
      provider: string;
      model: string;
      apiKey: string;
      baseUrl: string;
      chatPath: string;
      timeoutMs: number;
    },
  ) {
    const body: Record<string, unknown> = {
      model: providerConfig.model,
      messages: this.normalizeMessages(messages),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: this.stream,
    };

    if (providerConfig.provider === 'deepseek') {
      if (this.thinking === 'enabled') {
        body.thinking = { type: 'enabled' };
        if (this.reasoningEffort) {
          body.reasoning_effort = this.reasoningEffort;
        }
      } else if (this.thinking === 'disabled') {
        body.thinking = { type: 'disabled' };
      }
    }

    if (
      scenario === 'terminal_intent' ||
      scenario === 'terminal_dashboard_insights' ||
      scenario === 'terminal_service_advice' ||
      scenario === 'next_best_action'
    ) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(this.getOpenAiCompatibleUrlFor(providerConfig.baseUrl, providerConfig.chatPath), {
      method: 'POST',
      signal: AbortSignal.timeout(providerConfig.timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    }).catch((error) => {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new AiProviderError('TIMEOUT', 'AI 服务请求超时');
      }
      throw new AiProviderError('NETWORK_ERROR', 'AI 服务网络请求失败');
    });

    if (!response.ok) {
      throw new AiProviderError('UPSTREAM_ERROR', `AI 服务返回 ${response.status}`, response.status);
    }

    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
    return {
      id: data.id || `ai-${scenario}-${Date.now()}`,
      scenario,
      text,
      safety: {
        masked: false,
        blocked: false,
        reasons: [],
      },
      usage: {
        provider: providerConfig.provider,
        model: providerConfig.model,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  private async *callOpenAiCompatibleStream(
    scenario: string,
    messages: AiMessage[],
    providerConfig: {
      provider: string;
      model: string;
      apiKey: string;
      baseUrl: string;
      chatPath: string;
      timeoutMs: number;
    },
  ): AsyncGenerator<string> {
    if (!providerConfig.apiKey) {
      throw new AiProviderError('CONFIG_MISSING', 'AI 服务尚未配置 API Key');
    }

    const body: Record<string, unknown> = {
      model: providerConfig.model,
      messages: this.normalizeMessages(messages),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: true,
    };

    if (providerConfig.provider === 'deepseek') {
      if (this.thinking === 'enabled') {
        body.thinking = { type: 'enabled' };
        if (this.reasoningEffort) {
          body.reasoning_effort = this.reasoningEffort;
        }
      } else if (this.thinking === 'disabled') {
        body.thinking = { type: 'disabled' };
      }
    }

    const response = await fetch(this.getOpenAiCompatibleUrlFor(providerConfig.baseUrl, providerConfig.chatPath), {
      method: 'POST',
      signal: AbortSignal.timeout(providerConfig.timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(body),
    }).catch((error) => {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new AiProviderError('TIMEOUT', 'AI 服务请求超时');
      }
      throw new AiProviderError('NETWORK_ERROR', 'AI 服务网络请求失败');
    });

    if (!response.ok) {
      throw new AiProviderError('UPSTREAM_ERROR', `AI 服务返回 ${response.status}`, response.status);
    }

    if (!response.body) {
      const result = await this.callOpenAiCompatibleWithConfig(scenario, messages, providerConfig);
      yield* this.chunkText(result.text);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const data = JSON.parse(payload);
          const delta =
            data.choices?.[0]?.delta?.content ??
            data.choices?.[0]?.message?.content ??
            data.choices?.[0]?.text ??
            '';
          if (delta) yield String(delta);
        } catch {
          if (payload) yield payload;
        }
      }
    }
  }

  private async callAnthropicCompatible(scenario: string, messages: AiMessage[]) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: messages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: String(message.content ?? ''),
        })),
      }),
    }).catch((error) => {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new AiProviderError('TIMEOUT', 'AI 服务请求超时');
      }
      throw new AiProviderError('NETWORK_ERROR', 'AI 服务网络请求失败');
    });

    if (!response.ok) {
      throw new AiProviderError('UPSTREAM_ERROR', `AI 服务返回 ${response.status}`, response.status);
    }

    const data = (await response.json()) as any;
    const text = data.content?.find((item: any) => item.type === 'text')?.text ?? data.content?.[0]?.text ?? '';
    return {
      id: data.id || `ai-${scenario}-${Date.now()}`,
      scenario,
      text,
      safety: {
        masked: false,
        blocked: false,
        reasons: [],
      },
      usage: {
        provider: this.provider,
        model: this.model,
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  }

  private mockUsage() {
    return { provider: 'mock', model: 'ami-core-mock-llm', inputTokens: 100, outputTokens: 200 };
  }

  private safeParseJsonObject(text: string) {
    try {
      return this.parseJsonObject(text);
    } catch {
      return null;
    }
  }

  private async buildCustomerProfileContext(customerId: number) {
    if (!this.prisma.customer?.findUnique || !this.prisma.customerPredictionSnapshot?.findFirst) return null;
    const [customer, prediction] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          skinType: true,
          skinCondition: true,
          memberLevel: true,
          visitCount: true,
          totalSpent: true,
          lastVisitDate: true,
          healthProfile: {
            select: {
              skinType: true,
              skinStatus: true,
              mainProblems: true,
              allergyHistory: true,
              goals: true,
              recommendedCare: true,
            },
          },
        },
      }),
      this.prisma.customerPredictionSnapshot.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        select: {
          churnScore: true,
          churnLevel: true,
          repurchase30dScore: true,
          marketingResponseScore: true,
          ltvTier: true,
          featureJson: true,
          reasonJson: true,
          recommendedActionsJson: true,
          createdAt: true,
        },
      }),
    ]);
    if (!customer && !prediction) return null;
    return {
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            memberLevel: customer.memberLevel,
            visitCount: customer.visitCount,
            totalSpent: Number(customer.totalSpent ?? 0),
            lastVisitDate: customer.lastVisitDate?.toISOString?.() ?? null,
            skinType: customer.healthProfile?.skinType ?? customer.skinType,
            skinCondition: customer.skinCondition,
            skinStatus: customer.healthProfile?.skinStatus,
            mainProblems: customer.healthProfile?.mainProblems,
            allergyHistory: customer.healthProfile?.allergyHistory,
            goals: customer.healthProfile?.goals,
            recommendedCare: customer.healthProfile?.recommendedCare,
          }
        : null,
      prediction: prediction
        ? {
            churnScore: prediction.churnScore,
            churnLevel: prediction.churnLevel,
            repurchase30dScore: prediction.repurchase30dScore,
            marketingResponseScore: prediction.marketingResponseScore,
            ltvTier: prediction.ltvTier,
            featureJson: prediction.featureJson,
            reasonJson: prediction.reasonJson,
            recommendedActionsJson: prediction.recommendedActionsJson,
            updatedAt: prediction.createdAt.toISOString(),
          }
        : null,
    };
  }

  private async buildNextBestActionContext(customerId: number, context: any) {
    const customerProfile = await this.buildCustomerProfileContext(customerId);
    return {
      ...(context ?? {}),
      customerProfile,
      prediction: customerProfile?.prediction ?? null,
    };
  }

  private buildTerminalServiceAdviceFallback(data: { customerId?: number; projectId?: number; taskId?: number; skinTestId?: number }): TerminalServiceAdviceStructured {
    return {
      preChecks: [
        data.customerId ? `确认客户 ${data.customerId} 禁忌` : '确认客户禁忌',
        data.skinTestId ? `复核检测 ${data.skinTestId}` : '确认本次护理目标',
      ],
      keySteps: ['确认服务项目', '记录护理过程', '服务后同步反馈'],
      materialUsage: ['按项目 BOM 记录耗材', '异常用量需备注'],
      followUpAdvice: '服务后记录顾客反馈和注意事项。',
      nextBookingHint: '建议结合护理周期预约下次到店。',
    };
  }

  private normalizeTerminalServiceAdvice(value: unknown, fallback: TerminalServiceAdviceStructured): TerminalServiceAdviceStructured {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const list = (key: keyof TerminalServiceAdviceStructured, fallbackItems: string[]) => {
      const source = Array.isArray(record[key]) ? (record[key] as unknown[]) : fallbackItems;
      return source
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 4)
        .map((item) => item.slice(0, 40));
    };
    const text = (key: keyof TerminalServiceAdviceStructured, fallbackText: string) => {
      const value = String(record[key] ?? '').trim();
      return (value || fallbackText).slice(0, 80);
    };
    return {
      preChecks: list('preChecks', fallback.preChecks),
      keySteps: list('keySteps', fallback.keySteps),
      materialUsage: list('materialUsage', fallback.materialUsage),
      followUpAdvice: text('followUpAdvice', fallback.followUpAdvice),
      nextBookingHint: text('nextBookingHint', fallback.nextBookingHint),
    };
  }

  private formatTerminalServiceAdviceText(advice: TerminalServiceAdviceStructured) {
    return [
      `服务前确认：${advice.preChecks.join('；')}`,
      `关键步骤：${advice.keySteps.join('；')}`,
      `耗材提示：${advice.materialUsage.join('；')}`,
      `服务后：${advice.followUpAdvice}`,
      `预约建议：${advice.nextBookingHint}`,
    ].join('\n');
  }

  private buildNextBestActionFallback(data: { customerId?: number; context?: any }): NextBestActionStructured {
    const projectName = data.context?.projectName || data.context?.lastProjectName;
    const daysSinceVisit = Number(data.context?.daysSinceVisit ?? data.context?.lastVisitDays ?? 0);
    return {
      action: projectName ? 'recommend_project' : daysSinceVisit >= 30 ? 'send_care_reminder' : 'escalate_to_consultant',
      reason:
        daysSinceVisit > 0
          ? `客户距上次到店 ${daysSinceVisit} 天，适合安排下一步跟进。`
          : '当前数据不足，建议由顾问确认客户需求后跟进。',
      projectName,
      urgency: daysSinceVisit >= 45 ? 'now' : daysSinceVisit >= 21 ? 'this_week' : 'this_month',
      confidence: projectName || daysSinceVisit > 0 ? 0.78 : 0.6,
    };
  }

  private normalizeNextBestAction(value: unknown, fallback: NextBestActionStructured): NextBestActionStructured {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const allowedActions = new Set(['recommend_project', 'send_care_reminder', 'offer_card', 'escalate_to_consultant']);
    const allowedUrgency = new Set(['now', 'this_week', 'this_month']);
    const action = String(record.action ?? fallback.action);
    const urgency = String(record.urgency ?? fallback.urgency);
    const confidence = Number(record.confidence ?? fallback.confidence);
    const reason = String(record.reason ?? '').trim() || fallback.reason;
    const projectName = String(record.projectName ?? fallback.projectName ?? '').trim();
    return {
      action: (allowedActions.has(action) ? action : fallback.action) as NextBestActionStructured['action'],
      reason: reason.slice(0, 120),
      projectName: projectName || undefined,
      urgency: (allowedUrgency.has(urgency) ? urgency : fallback.urgency) as NextBestActionStructured['urgency'],
      confidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : fallback.confidence)),
    };
  }

  private formatNextBestActionText(action: NextBestActionStructured) {
    const projectText = action.projectName ? `，推荐项目：${action.projectName}` : '';
    return `下一步动作：${action.action}${projectText}。原因：${action.reason} 优先级：${action.urgency}，置信度 ${Math.round(action.confidence * 100)}%。`;
  }

  private normalizeTerminalDashboardInsights(
    value: unknown,
    fallback: TerminalDashboardInsights = { risks: [], suggestions: [] },
  ): TerminalDashboardInsights {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const normalizeItems = (items: unknown, fallbackItems: TerminalDashboardInsight[]) => {
      const source = Array.isArray(items) ? items : fallbackItems;
      return source
        .map((item) => {
          const current = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const title = String(current.title ?? '').trim();
          const reason = String(current.reason ?? '').trim();
          const action = String(current.action ?? '').trim();
          if (!title || !reason || !action) return null;
          return {
            title: title.slice(0, 40),
            severity: String(current.severity ?? 'medium'),
            reason: reason.slice(0, 120),
            action: action.slice(0, 120),
            relatedType: typeof current.relatedType === 'string' ? current.relatedType : undefined,
            relatedId:
              typeof current.relatedId === 'string' || typeof current.relatedId === 'number'
                ? current.relatedId
                : undefined,
          };
        })
        .filter(Boolean)
        .slice(0, 3) as TerminalDashboardInsight[];
    };

    return {
      risks: normalizeItems(record.risks, fallback.risks),
      suggestions: normalizeItems(record.suggestions, fallback.suggestions),
    };
  }

  private buildMockResult(scenario: string, text: string, structured?: any, variants?: any[]): AiGenerationResult {
    return {
      id: `ai-${scenario}-${Date.now()}`,
      scenario,
      text,
      variants,
      structured,
      safety: {
        masked: true,
        blocked: false,
        reasons: [],
      },
      usage: this.mockUsage(),
    };
  }

  private buildFailureResult(scenario: string, error: unknown): AiGenerationResult {
    const message = this.getUserFacingError(error);
    return {
      id: `ai-${scenario}-${Date.now()}`,
      scenario,
      text: message,
      structured: {
        errorCode: error instanceof AiProviderError ? error.code : 'AI_GENERATION_FAILED',
        status: error instanceof AiProviderError ? error.status : undefined,
      },
      safety: {
        masked: true,
        blocked: true,
        reasons: [message],
      },
      usage: {
        provider: this.provider,
        model: this.model,
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }

  private getUserFacingError(error: unknown) {
    if (!(error instanceof AiProviderError)) return 'AI 生成暂时失败，请稍后重试。';
    if (error.code === 'CONFIG_MISSING') return 'AI 服务尚未配置 API Key，请在后端环境变量中配置后重试。';
    if (error.code === 'TIMEOUT') return 'AI 服务请求超时，请稍后重试。';
    if (error.status === 401 || error.status === 403) return 'AI 服务认证失败，请检查后端模型密钥和权限。';
    if (error.status === 429) return 'AI 服务请求过于频繁，请稍后重试。';
    if (error.status && error.status >= 500) return 'AI 服务暂时不可用，请稍后再试。';
    return 'AI 生成暂时失败，请稍后重试。';
  }

  private async logAudit(
    scenario: string,
    userId?: number,
    storeId?: number,
    result?: AiGenerationResult,
    latencyMs?: number,
    status = 'success',
  ) {
    try {
      const auditData: any = {
        userId,
        storeId,
        scenario,
        promptTemplate: result?.structured?.promptTemplateVersion,
        provider: result?.usage?.provider || this.provider,
        model: result?.usage?.model || this.model,
        inputTokens: result?.usage?.inputTokens || 0,
        outputTokens: result?.usage?.outputTokens || 0,
        outputSummary: result?.text?.slice(0, 200),
        safetyBlocked: Boolean(result?.safety?.blocked),
        latencyMs,
        status,
      };
      await this.prisma.aiAuditLog.create({
        data: auditData,
      });
    } catch (error) {
      console.warn('AI audit log write failed', error);
    }
  }
}
