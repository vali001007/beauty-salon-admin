import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { IndustryService } from '../industry/industry.service';

describe('AiService', () => {
  let service: AiService;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: PrismaService,
          useValue: {
            aiAuditLog: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback?: string) => fallback),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('generates campaign variants with AiGenerationResult shape', async () => {
    const result = await service.generateCampaignVariants({
      campaignName: '生日护理礼',
      targetAudience: '生日会员',
      channels: ['wechat', 'sms'],
    });

    expect(result.scenario).toBe('campaign_variants');
    expect(result.text).toContain('已生成');
    expect((result as any).variants).toHaveLength(2);
    expect(result.safety).toMatchObject({ masked: true, blocked: false });
  });

  it('generates customer invitation script from structured scenario fields', async () => {
    const result = await service.generateInvitationScript({
      scenario: 'project',
      customerName: '王女士',
      skinType: '干性肌肤',
      projectName: '补水护理',
      offer: '到店享护理建议',
      evidence: ['距上次到店 35 天', '偏好补水项目'],
    });

    expect(result.scenario).toBe('customer_invitation_script');
    expect(result.text).toContain('王女士');
    expect(result.text).toContain('补水护理');
    expect(result.text).not.toContain('LTV');
    expect(result.text).not.toContain('流失风险');
    expect(result.structured?.context).toMatchObject({
      customerName: '王女士',
      skinType: '干性肌肤',
      projectName: '补水护理',
    });
  });

  it('generates terminal service advice with structured fields', async () => {
    const result = await service.generateTerminalServiceAdvice({ customerId: 1, projectId: 2 });

    expect(result.scenario).toBe('terminal_service_advice');
    expect(result.usage.provider).toBe('mock');
    expect(result.structured).toMatchObject({
      preChecks: expect.any(Array),
      keySteps: expect.any(Array),
      materialUsage: expect.any(Array),
      followUpAdvice: expect.any(String),
      nextBookingHint: expect.any(String),
    });
    expect(result.structured?.preChecks.length).toBeGreaterThan(0);
  });

  it('adds only published industry knowledge context to terminal service advice', async () => {
    const prisma = {
      aiAuditLog: {
        create: jest.fn(),
      },
    };
    const industryService = {
      findKnowledgeItems: jest.fn().mockResolvedValue([
        {
          id: 11,
          title: '敏感肌护理禁忌',
          domain: 'contraindication',
          content: '服务前确认过敏史，避免刺激性焕肤操作。',
          reviewStatus: 'approved',
          safetyLevel: 'high',
        },
      ]),
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-terminal-service-advice',
        choices: [
          {
            message: {
              content: JSON.stringify({
                preChecks: ['确认过敏史'],
                keySteps: ['先清洁后舒缓'],
                materialUsage: ['按本地 BOM 记录'],
                followUpAdvice: '服务后观察泛红',
                nextBookingHint: '两周后复查',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      }),
    });
    global.fetch = fetchMock as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        { provide: IndustryService, useValue: industryService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                LLM_PROVIDER: 'deepseek',
                LLM_API_KEY: 'test-key',
                LLM_BASE_URL: 'https://api.deepseek.com',
                LLM_CHAT_PATH: '/chat/completions',
                LLM_MODEL: 'deepseek-v4-flash',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const realService = module.get<AiService>(AiService);

    const result = await realService.generateTerminalServiceAdvice({ customerId: 1, projectId: 2 }, 7, 1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userPayload = JSON.parse(requestBody.messages[1].content);

    expect(industryService.findKnowledgeItems).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 5 }),
      true,
    );
    expect(userPayload.industryKnowledge).toEqual([
      expect.objectContaining({
        id: 11,
        title: '敏感肌护理禁忌',
        sourceType: 'industry_knowledge',
      }),
    ]);
    expect(result.structured?.industryKnowledge).toEqual(userPayload.industryKnowledge);
  });

  it('generates next best action with structured fields', async () => {
    const result = await service.recommendNextBestAction({
      customerId: 1,
      context: { daysSinceVisit: 35, projectName: '舒缓补水护理' },
    });

    expect(result.scenario).toBe('next_best_action');
    expect(result.usage.provider).toBe('mock');
    expect(result.structured).toMatchObject({
      action: expect.stringMatching(/recommend_project|send_care_reminder|offer_card|escalate_to_consultant/),
      reason: expect.any(String),
      urgency: expect.stringMatching(/now|this_week|this_month/),
      confidence: expect.any(Number),
    });
    expect(result.structured?.reason).toContain('35');
  });

  it('returns a usable skin photo fallback when Face++ credentials are not configured', async () => {
    const result = await service.analyzeSkinPhoto({
      customerId: 1,
      customerName: '测试客户',
      imageDataUrl: `data:image/jpeg;base64,${'a'.repeat(120)}`,
    });

    expect(result.customerId).toBe(1);
    expect(result.isFallback).toBe(true);
    expect(result.instrument).toContain('仅供参考');
    expect(result.explanation).toContain('仅供顾问接待参考');
    expect(result.metrics.moisture).toBeGreaterThanOrEqual(0);
    expect(result.metrics.moisture).toBeLessThanOrEqual(100);
  });

  it('calls Face++ skin analyze API when credentials are configured', async () => {
    const prisma = {
      aiAuditLog: {
        create: jest.fn(),
      },
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        request_id: 'facepp-request-1',
        face_rectangle: { top: 1, left: 2, width: 3, height: 4 },
        result: {
          skin_type: { value: 'oily' },
          sensitivity: { score: 0.68 },
          pores_forehead: { score: 72 },
          spot: { score: 41 },
          acne: { score: 55 },
          nasolabial_fold: { score: 30 },
          skin_age: { value: 31 },
        },
      }),
    });
    global.fetch = fetchMock as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                FACEPP_API_KEY: 'facepp-key',
                FACEPP_API_SECRET: 'facepp-secret',
                FACEPP_SKIN_ANALYZE_URL: 'https://api-cn.faceplusplus.com/facepp/v1/skinanalyze',
                FACEPP_SKIN_ANALYZE_TIMEOUT_MS: '30000',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const faceppService = module.get<AiService>(AiService);

    const result = await faceppService.analyzeSkinPhoto({
      customerId: 2,
      customerName: 'Face++客户',
      imageDataUrl: `data:image/jpeg;base64,${'b'.repeat(120)}`,
    });
    const [url, options] = fetchMock.mock.calls[0];
    const body = options.body as URLSearchParams;

    expect(url).toBe('https://api-cn.faceplusplus.com/facepp/v1/skinanalyze');
    expect(body.get('api_key')).toBe('facepp-key');
    expect(body.get('api_secret')).toBe('facepp-secret');
    expect(body.get('image_base64')).toBe('b'.repeat(120));
    expect(result.id).toBe('facepp-request-1');
    expect(result.instrument).toBe('Face++ 皮肤分析-高阶版');
    expect(result.skinType).toBe('油性');
    expect(result.metrics.pore).toBe(72);
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'skin_photo_analyze',
        provider: 'faceplusplus',
        model: 'skin_analyze_premier',
        status: 'success',
      }),
    });
  });

  it('resolves terminal intent to an allowed mock action', async () => {
    const result = await service.resolveTerminalIntent({
      role: 'reception',
      command: '核销次卡',
      availableActions: ['reception.appointments', 'operation.verify'],
      quickActions: [],
    });

    expect(result.action).toBe('operation.verify');
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('streams chat chunks and records a successful audit log', async () => {
    const chunks: string[] = [];

    for await (const chunk of service.chatStream([{ role: 'user', content: '今日经营怎么样' }], 7, 1)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('今日经营怎么样');
    expect((service as any).prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'chat_stream',
        provider: 'mock',
        status: 'success',
        userId: 7,
        storeId: 1,
      }),
    });
  });

  it('normalizes terminal intent when AI returns an unauthorized action', () => {
    const result = (service as any).normalizeTerminalIntentResult(
      {
        intentName: 'manager.dashboard.view',
        action: 'manager.dashboard',
        confidence: 0.9,
        slots: { rawText: '看经营' },
        missingSlots: [],
      },
      {
        role: 'reception',
        command: '看经营',
        availableActions: ['reception.appointments'],
        quickActions: [],
      },
    );

    expect(result.action).toBeNull();
    expect(result.confidence).toBe(0.9);
  });

  it('calls DeepSeek with OpenAI-compatible chat completions and parses usage', async () => {
    const prisma = {
      aiAuditLog: {
        create: jest.fn(),
      },
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-test',
        choices: [{ message: { content: '建议先查看今日预约，再处理待核销客户。' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
      }),
    });
    global.fetch = fetchMock as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                LLM_PROVIDER: 'deepseek',
                LLM_API_KEY: 'test-key',
                LLM_BASE_URL: 'https://api.deepseek.com',
                LLM_CHAT_PATH: '/chat/completions',
                LLM_MODEL: 'deepseek-v4-flash',
                LLM_TEMPERATURE: '0.3',
                LLM_MAX_TOKENS: '512',
                LLM_STREAM: 'false',
                LLM_THINKING: 'disabled',
                LLM_REASONING_EFFORT: 'high',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const deepseekService = module.get<AiService>(AiService);

    const result = await deepseekService.chat([{ role: 'user', content: '今日经营怎么样' }]);
    const request = fetchMock.mock.calls[0];
    const body = JSON.parse(request[1].body);

    expect(request[0]).toBe('https://api.deepseek.com/chat/completions');
    expect(request[1].headers.Authorization).toBe('Bearer test-key');
    expect(body).toMatchObject({
      model: 'deepseek-v4-flash',
      max_tokens: 512,
      temperature: 0.3,
      stream: false,
      thinking: { type: 'disabled' },
    });
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.messages).toEqual([{ role: 'user', content: '今日经营怎么样' }]);
    expect(result.text).toBe('建议先查看今日预约，再处理待核销客户。');
    expect(result.usage).toMatchObject({ provider: 'deepseek', model: 'deepseek-v4-flash', inputTokens: 12, outputTokens: 7 });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'chat',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'success',
      }),
    });
  });

  it('uses fallback provider when primary provider is unavailable', async () => {
    const prisma = {
      aiAuditLog: {
        create: jest.fn(),
      },
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-fallback',
        choices: [{ message: { content: 'fallback provider 已返回建议。' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    global.fetch = fetchMock as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                LLM_PROVIDER: 'anthropic',
                LLM_API_KEY: '',
                LLM_BASE_URL: 'https://primary.example/v1/messages',
                LLM_MODEL: 'claude-primary',
                LLM_FALLBACK_PROVIDER: 'openai-compat',
                LLM_FALLBACK_API_KEY: 'fallback-key',
                LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
                LLM_FALLBACK_CHAT_PATH: '/chat/completions',
                LLM_FALLBACK_MODEL: 'fallback-model',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const fallbackService = module.get<AiService>(AiService);

    const result = await fallbackService.chat([{ role: 'user', content: '今日经营怎么样' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://fallback.example/v1/chat/completions');
    expect(result.text).toBe('fallback provider 已返回建议。');
    expect(result.usage).toMatchObject({
      provider: 'openai_compatible(fallback)',
      model: 'fallback-model',
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'chat',
        provider: 'openai_compatible(fallback)',
        model: 'fallback-model',
        status: 'success',
      }),
    });
  });

  it('returns a readable blocked fallback when DeepSeek key is missing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: PrismaService,
          useValue: {
            aiAuditLog: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                LLM_PROVIDER: 'deepseek',
                LLM_API_KEY: '',
                LLM_MODEL: 'deepseek-v4-flash',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const deepseekService = module.get<AiService>(AiService);

    const result = await deepseekService.chat([{ role: 'user', content: '今日经营怎么样' }]);

    expect(result.safety.blocked).toBe(true);
    expect(result.text).toContain('API Key');
    expect(result.usage.provider).toBe('deepseek');
  });

  it('generates customer-facing activity page schema', async () => {
    const result = await service.generateActivityPage({
      campaignName: '沉睡客户唤醒',
      targetAudience: '60天未到店会员',
      offer: '回店满300减100',
      projectNames: ['补水修护护理'],
      triggerReasons: ['60天未到店'],
    });

    expect(result.scenario).toBe('activity-page');
    expect(result.pageSchema?.schemaVersion).toBe('1.0');
    expect(result.pageSchema?.sections.some((section: any) => section.type === 'offer')).toBe(true);
    expect(JSON.stringify(result.pageSchema)).not.toContain('沉睡客户');
    expect(JSON.stringify(result.pageSchema)).not.toContain('流失风险');
    expect(result.structured?.promptTemplateVersion).toBe('marketing.activity_page.v1');
  });

  it('falls back to a safe activity page when real provider generation fails', async () => {
    const prisma = {
      aiAuditLog: {
        create: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                LLM_PROVIDER: 'deepseek',
                LLM_API_KEY: '',
                LLM_MODEL: 'deepseek-test',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const realProviderService = module.get<AiService>(AiService);

    const result = await realProviderService.generateActivityPage({
      campaignName: '高流失风险客户需要唤醒',
      targetAudience: '高流失风险客户',
      offer: '回归专享满300减100',
      triggerReasons: ['流失风险预警'],
    });

    expect(result.safety.blocked).toBe(false);
    expect(result.pageSchema?.schemaVersion).toBe('1.0');
    expect(result.structured?.promptTemplateVersion).toBe('marketing.activity_page.v1.fallback');
    expect(JSON.stringify(result.pageSchema)).not.toContain('流失风险');
  });

  it('returns customer-facing marketing copy even when real provider key is missing', async () => {
    const prisma = {
      aiAuditLog: {
        create: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                LLM_PROVIDER: 'anthropic',
                LLM_API_KEY: '',
                LLM_MODEL: 'claude-test',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const realService = module.get<AiService>(AiService);

    const result = await realService.generateMarketingCopy({ activityName: 'real-ai-smoke' });

    expect(result.scenario).toBe('marketing-copy');
    expect(result.safety.blocked).toBe(false);
    expect(result.text).toContain('到店可享专属礼遇');
    expect(result.text).not.toContain('API Key');
    expect(result.text).not.toContain('好的，根据');
    expect(result.text).not.toContain('流失风险客户');
    expect(result.structured?.variants?.length).toBeGreaterThan(0);
    expect(result.usage.provider).toBe('mock');
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'marketing-copy',
        provider: 'mock',
        status: 'success',
      }),
    });
  });

  it('removes internal strategy labels from generated marketing copy', async () => {
    const result = await service.generateMarketingCopy({
      campaignName: '1266 位客户进入 30 天复购窗口',
      targetAudience: '1266 位客户进入 30 天复购窗口',
      offer: '复购专享满500减80',
      channel: 'miniapp',
      channels: ['miniapp', 'sms'],
      source: '智能推荐策略：1266 位客户进入 30 天复购窗口',
      segment: '复购窗口客户群体',
      triggerReasons: ['RFM 模型命中', '护理周期复购方案'],
      projectNames: ['护理周期复购方案'],
    });

    const output = JSON.stringify({
      text: result.text,
      variants: result.variants,
      structured: result.structured,
    });

    expect(result.scenario).toBe('marketing-copy');
    expect(result.safety.blocked).toBe(false);
    expect(output).toContain('护理焕新礼');
    expect(output).toContain('复购专享满500减80');
    expect(output).not.toContain('1266');
    expect(output).not.toContain('复购窗口');
    expect(output).not.toContain('客户进入');
    expect(output).not.toContain('护理周期复购方案');
    expect(output).not.toContain('营销策略');
    expect(output).not.toContain('RFM');
    expect(output).not.toContain('算法');
  });

  it('generates customer-facing activity page names for high LTV recommendations', async () => {
    const result = await service.generateActivityPage({
      campaignName: '305 位高 LTV 客户需要维护',
      targetAudience: '高 LTV 客户（305人）',
      offer: 'VIP专属权益',
      source: 'LTV 分层显示这些客户未来 12 个月价值高，建议提供权益维护与预约优先权。',
      segment: '高 LTV 客户',
      triggerReasons: ['LTV 模型命中', '高价值客户'],
      projectNames: ['VIP护理权益方案'],
    });

    const pageSchema = result.pageSchema;
    expect(pageSchema).toBeDefined();
    const output = JSON.stringify({
      title: pageSchema!.title,
      hero: pageSchema!.sections.find((section) => section.type === 'hero'),
      audienceLabel: pageSchema!.audienceLabel,
    });

    expect(result.scenario).toBe('activity-page');
    expect(result.safety.blocked).toBe(false);
    expect(pageSchema!.title).toBe('VIP尊享护理礼遇');
    expect(output).toContain('本期VIP专属护理权益已开启');
    expect(output).not.toContain('305');
    expect(output).not.toContain('LTV');
    expect(output).not.toContain('高价值客户');
    expect(output).not.toContain('需要维护');
  });
});
