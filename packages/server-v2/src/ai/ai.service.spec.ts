import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService, AiStructuredOutputError } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { IndustryService } from '../industry/industry.service';

describe('AiService', () => {
  let service: AiService;
  const originalFetch = global.fetch;

  const structuredSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'count'],
    properties: {
      answer: { type: 'string' },
      count: { type: 'integer', minimum: 0 },
    },
  } as const;

  async function createConfiguredService(values: Record<string, string>) {
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
            get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
          },
        },
      ],
    }).compile();

    return { service: module.get<AiService>(AiService), prisma };
  }

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

    expect(industryService.findKnowledgeItems).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 }), true);
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
    expect(result.usage).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 12,
      outputTokens: 7,
    });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'chat',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'success',
      }),
    });
  });

  it('calls Kimi through OpenAI-compatible chat completions without provider-specific thinking payload', async () => {
    const prisma = {
      aiAuditLog: {
        create: jest.fn(),
      },
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'chatcmpl-kimi',
        choices: [{ message: { content: 'Kimi 已返回经营建议。' } }],
        usage: { prompt_tokens: 15, completion_tokens: 9 },
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
                LLM_PROVIDER: 'kimi',
                LLM_API_KEY: 'kimi-placeholder-key',
                LLM_BASE_URL: 'https://api.moonshot.ai/v1',
                LLM_CHAT_PATH: '/chat/completions',
                LLM_MODEL: 'kimi-k2.7-code-highspeed',
                LLM_TEMPERATURE: '0.3',
                LLM_MAX_TOKENS: '8192',
                LLM_STREAM: 'false',
                LLM_THINKING: 'disabled',
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();
    const kimiService = module.get<AiService>(AiService);

    const result = await kimiService.chat([{ role: 'user', content: '今日经营怎么样' }]);
    const request = fetchMock.mock.calls[0];
    const body = JSON.parse(request[1].body);

    expect(request[0]).toBe('https://api.moonshot.ai/v1/chat/completions');
    expect(request[1].headers.Authorization).toBe('Bearer kimi-placeholder-key');
    expect(body).toMatchObject({
      model: 'kimi-k2.7-code-highspeed',
      max_tokens: 8192,
      temperature: 1,
      stream: false,
    });
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(result.text).toBe('Kimi 已返回经营建议。');
    expect(result.usage).toMatchObject({
      provider: 'kimi',
      model: 'kimi-k2.7-code-highspeed',
      inputTokens: 15,
      outputTokens: 9,
    });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'chat',
        provider: 'kimi',
        model: 'kimi-k2.7-code-highspeed',
        status: 'success',
      }),
    });
  });

  it('calls GPT relay through the OpenAI Responses API and parses output text', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'resp-terra-chat',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Terra 已返回经营建议。' }],
          },
        ],
        usage: { input_tokens: 18, output_tokens: 9 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: terraService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'openai_responses',
      LLM_API_KEY: 'relay-test-key',
      LLM_BASE_URL: 'http://relay.example/v1',
      LLM_CHAT_PATH: '/responses',
      LLM_MODEL: 'gpt-5.6-terra',
      LLM_MAX_TOKENS: '512',
      LLM_REASONING_EFFORT: 'medium',
    });

    const result = await terraService.chat([{ role: 'user', content: '分析本月经营情况' }]);
    const request = fetchMock.mock.calls[0];
    const body = JSON.parse(request[1].body);

    expect(request[0]).toBe('http://relay.example/v1/responses');
    expect(request[1].headers.Authorization).toBe('Bearer relay-test-key');
    expect(body).toEqual({
      model: 'gpt-5.6-terra',
      input: [{ role: 'user', content: '分析本月经营情况' }],
      max_output_tokens: 512,
      reasoning: { effort: 'medium' },
    });
    expect(result.text).toBe('Terra 已返回经营建议。');
    expect(result.usage).toEqual({
      provider: 'openai_responses',
      model: 'gpt-5.6-terra',
      inputTokens: 18,
      outputTokens: 9,
    });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'chat',
        provider: 'openai_responses',
        model: 'gpt-5.6-terra',
        status: 'success',
      }),
    });
  });

  it('resolves the GPT relay key indirectly from the configured environment variable name', async () => {
    const previousKey = process.env.AICODEWITH_API_KEY;
    process.env.AICODEWITH_API_KEY = 'indirect-relay-test-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: 'OK', usage: { input_tokens: 1, output_tokens: 1 } }),
    });
    global.fetch = fetchMock as any;

    try {
      const { service: terraService } = await createConfiguredService({
        LLM_PROVIDER: 'openai_responses',
        LLM_API_KEY: 'stale-literal-key',
        LLM_API_KEY_ENV: 'AICODEWITH_API_KEY',
        LLM_BASE_URL: 'http://relay.example/v1',
        LLM_CHAT_PATH: '/responses',
        LLM_MODEL: 'gpt-5.6-terra',
      });

      await terraService.chat([{ role: 'user', content: 'ping' }]);

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer indirect-relay-test-key');
    } finally {
      if (previousKey === undefined) delete process.env.AICODEWITH_API_KEY;
      else process.env.AICODEWITH_API_KEY = previousKey;
    }
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

  it('returns governed structured data and sends strict json_schema to openai-compatible providers', async () => {
    const secretMessage = 'customer-secret-context';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'structured-1',
        choices: [{ message: { content: '{"answer":"ok","count":2}' } }],
        usage: { prompt_tokens: 21, completion_tokens: 8 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_CHAT_PATH: '/chat/completions',
      LLM_MODEL: 'structured-model',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_schema',
      LLM_STREAM: 'true',
    });

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.semantic_intent',
      messages: [{ role: 'user', content: secretMessage }],
      schema: structuredSchema,
      userId: 7,
      storeId: 1,
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'structured-model',
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'brain_semantic_intent',
          strict: true,
          schema: structuredSchema,
        },
      },
    });
    expect(requestBody.messages).toEqual([{ role: 'user', content: secretMessage }]);
    expect(JSON.stringify(requestBody.messages)).not.toContain(JSON.stringify(structuredSchema));
    expect(result).toEqual({
      data: { answer: 'ok', count: 2 },
      rawText: '{"answer":"ok","count":2}',
      usage: { provider: 'openai_compatible', model: 'structured-model', inputTokens: 21, outputTokens: 8 },
      provider: 'openai_compatible',
      model: 'structured-model',
    });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'brain.semantic_intent',
        provider: 'openai_compatible',
        model: 'structured-model',
        inputTokens: 21,
        outputTokens: 8,
        outputSummary: 'structured_output_valid',
        status: 'success',
      }),
    });
    expect(JSON.stringify(prisma.aiAuditLog.create.mock.calls)).not.toContain(secretMessage);
    expect(JSON.stringify(prisma.aiAuditLog.create.mock.calls)).not.toContain(result.rawText);
  });

  it('sends strict json_schema through the OpenAI Responses API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'resp-terra-structured',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"answer":"ok","count":2}' }],
          },
        ],
        usage: { input_tokens: 24, output_tokens: 8 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: terraService } = await createConfiguredService({
      LLM_PROVIDER: 'openai_responses',
      LLM_API_KEY: 'relay-test-key',
      LLM_BASE_URL: 'http://relay.example/v1',
      LLM_CHAT_PATH: '/responses',
      LLM_MODEL: 'gpt-5.6-terra',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_schema',
      LLM_REASONING_EFFORT: 'medium',
    });

    const result = await terraService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.semantic_intent',
      messages: [{ role: 'user', content: '分析客户流失风险' }],
      schema: structuredSchema,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(body).toEqual({
      model: 'gpt-5.6-terra',
      input: [{ role: 'user', content: '分析客户流失风险' }],
      max_output_tokens: expect.any(Number),
      text: {
        format: {
          type: 'json_schema',
          name: 'brain_semantic_intent',
          strict: true,
          schema: structuredSchema,
        },
      },
      reasoning: { effort: 'medium' },
    });
    expect(result).toMatchObject({
      data: { answer: 'ok', count: 2 },
      provider: 'openai_responses',
      model: 'gpt-5.6-terra',
      usage: { inputTokens: 24, outputTokens: 8 },
    });
  });

  it('disables Responses reasoning by default for latency-bounded structured output', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'resp-terra-no-reasoning',
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":"ok","count":1}' }] }],
        usage: { input_tokens: 12, output_tokens: 5 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: terraService } = await createConfiguredService({
      LLM_PROVIDER: 'openai_responses',
      LLM_API_KEY: 'relay-test-key',
      LLM_BASE_URL: 'http://relay.example/v1',
      LLM_CHAT_PATH: '/responses',
      LLM_MODEL: 'gpt-5.6-terra',
      LLM_REASONING_EFFORT: '',
    });

    await terraService.generateStructured({
      scenario: 'brain.semantic_intent.v1',
      messages: [{ role: 'user', content: '分析经营问题' }],
      schema: structuredSchema,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: 'none' });
  });

  it('reports provider authentication failures without converting them into generic timeouts', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { type: 'invalid_authentication_error' } }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'kimi',
      LLM_API_KEY: 'invalid-key',
      LLM_BASE_URL: 'https://api.moonshot.ai/v1',
      LLM_CHAT_PATH: '/chat/completions',
      LLM_MODEL: 'kimi-k2.7-code-highspeed',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.semantic_intent.v1',
        messages: [{ role: 'user', content: '分析经营问题' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_FAILED',
      provider: 'kimi',
      model: 'kimi-k2.7-code-highspeed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('disables DeepSeek thinking for schema-constrained structured output even when global thinking is enabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"answer":"ok","count":1}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 6 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'deepseek',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.deepseek.com',
      LLM_MODEL: 'deepseek-v4-flash',
      LLM_THINKING: 'enabled',
      LLM_REASONING_EFFORT: 'high',
    });

    await structuredService.generateStructured({
      scenario: 'brain.semantic_intent.v1',
      messages: [{ role: 'user', content: 'request' }],
      schema: structuredSchema,
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.thinking).toEqual({ type: 'disabled' });
    expect(requestBody.reasoning_effort).toBeUndefined();
  });

  it.each([
    ['LLM_STRUCTURED_MAX_TOTAL_TOKENS', '0'],
    ['LLM_FALLBACK_STRUCTURED_MAX_TOTAL_TOKENS', '12.5'],
  ])('fails service startup when %s is not a positive integer', async (key, value) => {
    await expect(createConfiguredService({ [key]: value })).rejects.toThrow(`${key} must be a positive integer`);
  });

  it('caps structured max_tokens using the configured total request token budget', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"answer":"ok","count":1}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_MODEL: 'structured-model',
      LLM_MAX_TOKENS: '512',
      LLM_STRUCTURED_MAX_TOTAL_TOKENS: '256',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_schema',
    });

    await structuredService.generateStructured({
      scenario: 'brain.token-cap',
      messages: [{ role: 'user', content: 'request' }],
      schema: structuredSchema,
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.max_tokens).toBeGreaterThan(0);
    expect(requestBody.max_tokens).toBeLessThan(256);
    expect(requestBody.max_tokens).toBeLessThan(512);
  });

  it('fails closed with BUDGET_EXCEEDED when reported usage exceeds the total request token budget', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"answer":"ok","count":1}' } }],
        usage: { prompt_tokens: 900, completion_tokens: 200 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_MODEL: 'structured-model',
      LLM_STRUCTURED_MAX_TOTAL_TOKENS: '1000',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_schema',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.actual-token-overrun',
        messages: [{ role: 'user', content: 'request' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
      usage: { provider: 'openai_compatible', model: 'structured-model', inputTokens: 900, outputTokens: 200 },
    });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outputSummary: 'errorCode=BUDGET_EXCEEDED',
        status: 'failed',
      }),
    });
  });

  it('shares one token budget across primary, fallback, and repair calls', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"invalid","count":"x"}' } }],
          usage: { prompt_tokens: 80, completion_tokens: 20 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"fixed","count":2}' } }],
          usage: { prompt_tokens: 60, completion_tokens: 20 },
        }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_MAX_TOKENS: '512',
      LLM_STRUCTURED_MAX_TOTAL_TOKENS: '2000',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_MODEL: 'fallback-model',
      LLM_FALLBACK_STRUCTURED_MAX_TOTAL_TOKENS: '1000',
    });

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.shared-token-budget',
      messages: [{ role: 'user', content: 'primary request' }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: 'sanitized fallback' }],
      repairMessages: [{ role: 'user', content: 'sanitized repair' }],
      schema: structuredSchema,
    });

    const requestBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(requestBodies[0].max_tokens).toBe(512);
    expect(requestBodies[1].max_tokens).toBeLessThan(requestBodies[0].max_tokens);
    expect(requestBodies[2].max_tokens).toBeLessThan(requestBodies[1].max_tokens);
    expect(result.data).toEqual({ answer: 'fixed', count: 2 });
  });

  it('does not consume generation tokens for an explicit primary 4xx rejection before fallback', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"fallback","count":1}' } }],
          usage: { prompt_tokens: 20, completion_tokens: 5 },
        }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'expired-primary-key',
      LLM_BASE_URL: 'https://primary.example/v1',
      LLM_MODEL: 'primary-model',
      LLM_MAX_TOKENS: '128',
      LLM_STRUCTURED_MAX_TOTAL_TOKENS: '512',
      LLM_FALLBACK_PROVIDER: 'deepseek',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_MODEL: 'fallback-model',
      LLM_FALLBACK_STRUCTURED_MAX_TOTAL_TOKENS: '512',
    });

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.primary-auth-fallback',
      messages: [{ role: 'user', content: 'primary request' }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: 'fallback request' }],
      schema: structuredSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('deepseek(fallback)');
    expect(result.data).toEqual({ answer: 'fallback', count: 1 });
  });

  it('sends Anthropic system messages through the top-level system field', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '{"answer":"ok","count":1}' }],
        usage: { input_tokens: 20, output_tokens: 10 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'claude_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'claude-structured',
    });

    await structuredService.generateStructured({
      scenario: 'brain.anthropic-system',
      messages: [
        { role: 'system', content: 'Follow the governed business ontology.' },
        { role: 'user', content: 'request' },
      ],
      schema: structuredSchema,
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.system).toBe('Follow the governed business ontology.');
    expect(requestBody.messages[0]).toEqual({ role: 'user', content: 'request' });
    expect(JSON.stringify(requestBody.messages)).not.toContain('Follow the governed business ontology.');
  });

  it('fails closed with AUDIT_FAILED when a valid structured result cannot be audited', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"answer":"ok","count":1}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_MODEL: 'structured-model',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_schema',
    });
    prisma.aiAuditLog.create.mockRejectedValue(new Error('audit database unavailable'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.audit-required',
        messages: [{ role: 'user', content: 'request' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({
      code: 'AUDIT_FAILED',
      usage: { provider: 'openai_compatible', model: 'structured-model', inputTokens: 20, outputTokens: 10 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.aiAuditLog.create).toHaveBeenCalledTimes(2);
  });

  it('keeps the original structured error when failure audit logging also fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not-json' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_MODEL: 'structured-model',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_schema',
    });
    prisma.aiAuditLog.create.mockRejectedValue(new Error('audit database unavailable'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.failure-audit-best-effort',
        messages: [{ role: 'user', content: 'request' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject<Partial<AiStructuredOutputError>>({ code: 'JSON_INVALID' });
    expect(prisma.aiAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each(['auto', 'json_object'])(
    'uses json_object with a schema prompt for generic OpenAI-compatible mode %s',
    async (mode) => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"ok","count":1}' } }] }),
      });
      global.fetch = fetchMock as any;
      const { service: structuredService } = await createConfiguredService({
        LLM_PROVIDER: 'openai_compatible',
        LLM_API_KEY: 'test-key',
        LLM_BASE_URL: 'https://llm.example/v1',
        LLM_CHAT_PATH: '/chat/completions',
        LLM_MODEL: 'structured-model',
        LLM_STRUCTURED_OUTPUT_MODE: mode,
      });

      await structuredService.generateStructured({
        scenario: `brain.${mode}`,
        messages: [{ role: 'user', content: 'request' }],
        schema: structuredSchema,
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.response_format).toEqual({ type: 'json_object' });
      expect(requestBody.messages).toHaveLength(2);
      expect(JSON.parse(requestBody.messages[1].content).schema).toEqual(structuredSchema);
    },
  );

  it('uses a compact prompt schema while enforcing the full local validation schema', async () => {
    const promptSchema = {
      type: 'object',
      required: ['answer', 'count'],
      properties: { answer: 'string', count: 'integer' },
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"answer":"invalid","count":"not-an-integer"}' } }] }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_CHAT_PATH: '/chat/completions',
      LLM_MODEL: 'structured-model',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_object',
    });

    await expect(structuredService.generateStructured({
      scenario: 'brain.compact-prompt-schema',
      messages: [{ role: 'user', content: 'request' }],
      schema: structuredSchema,
      promptSchema,
    })).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(requestBody.messages[1].content).schema).toEqual(promptSchema);
  });

  it.each([
    ['LLM_STRUCTURED_OUTPUT_MODE', 'yaml'],
    ['LLM_FALLBACK_STRUCTURED_OUTPUT_MODE', 'strict'],
  ])('fails service startup when %s is invalid', async (key, value) => {
    await expect(createConfiguredService({ [key]: value })).rejects.toThrow(
      `${key} must be one of auto, json_schema, json_object`,
    );
  });

  it('reuses the Ajv validator for structurally equivalent schemas regardless of object identity or key order', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"answer":"ok","count":1}' } }] }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_CHAT_PATH: '/chat/completions',
      LLM_MODEL: 'structured-model',
    });
    const compileSpy = jest.spyOn((structuredService as any).structuredAjv, 'compile');
    const equivalentSchema = {
      required: ['answer', 'count'],
      properties: {
        count: { minimum: 0, type: 'integer' },
        answer: { type: 'string' },
      },
      additionalProperties: false,
      type: 'object',
    };

    await structuredService.generateStructured({ scenario: 'brain.cache-1', messages: [], schema: structuredSchema });
    await structuredService.generateStructured({ scenario: 'brain.cache-2', messages: [], schema: equivalentSchema });

    expect(compileSpy).toHaveBeenCalledTimes(1);
  });

  it('recompiles and validates a schema object after the caller mutates it in place', async () => {
    const mutableSchema: any = {
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: { value: { type: 'integer' } },
    };
    const compileSpy = jest.spyOn((service as any).structuredAjv, 'compile');

    const first = await service.generateStructured<{ value: number }>({
      scenario: 'brain.mutable-schema-1',
      messages: [],
      schema: mutableSchema,
    });
    mutableSchema.properties.value = { type: 'string', minLength: 1 };
    const second = await service.generateStructured<{ value: string }>({
      scenario: 'brain.mutable-schema-2',
      messages: [],
      schema: mutableSchema,
    });

    expect(first.data).toEqual({ value: 0 });
    expect(second.data).toEqual({ value: 'x' });
    expect(compileSpy).toHaveBeenCalledTimes(2);
  });

  it('bounds the structured validator cache', () => {
    for (let index = 0; index < 65; index += 1) {
      (service as any).compileStructuredSchema({ type: 'integer', minimum: index }, `schema-${index}`);
    }

    expect((service as any).structuredValidatorCache.size).toBeLessThanOrEqual(64);
  });

  it('returns deterministic schema-safe placeholders for the mock provider', async () => {
    const result = await service.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.mock',
      messages: [{ role: 'user', content: '真实经营数据是什么' }],
      schema: structuredSchema,
    });

    expect(result.data).toEqual({ answer: '', count: 0 });
    expect(result.rawText).toBe('{"answer":"","count":0}');
    expect(result.provider).toBe('mock');
    expect(result.model).toBe('ami-core-mock-llm');
  });

  it('builds mock values for minItems, standard formats, and negative numeric maxima', async () => {
    const result = await service.generateStructured<{
      items: string[];
      businessDate: string;
      createdAt: string;
      email: string;
      ratio: number;
      count: number;
    }>({
      scenario: 'brain.mock-boundaries',
      messages: [{ role: 'user', content: 'request' }],
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['items', 'businessDate', 'createdAt', 'email', 'ratio', 'count'],
        properties: {
          items: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
          businessDate: { type: 'string', format: 'date' },
          createdAt: { type: 'string', format: 'date-time' },
          email: { type: 'string', format: 'email' },
          ratio: { type: 'number', maximum: -2.5 },
          count: { type: 'integer', maximum: -3 },
        },
      },
    });

    expect(result.data).toEqual({
      items: ['x', 'x'],
      businessDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00Z',
      email: 'mock@example.com',
      ratio: -2.5,
      count: -3,
    });
  });

  it('builds distinct valid values for uniqueItems arrays', async () => {
    const result = await service.generateStructured<string[]>({
      scenario: 'brain.mock-unique-items',
      messages: [],
      schema: {
        type: 'array',
        minItems: 3,
        uniqueItems: true,
        items: { type: 'string', minLength: 1 },
      },
    });

    expect(result.data).toHaveLength(3);
    expect(new Set(result.data).size).toBe(3);
    expect(result.data.every((item) => item.length >= 1)).toBe(true);
  });

  it('reports MOCK_GENERATION_UNSUPPORTED when mock generation cannot construct a pattern', async () => {
    await expect(
      service.generateStructured({
        scenario: 'brain.mock-pattern',
        messages: [],
        schema: { type: 'string', pattern: '^[A-Z]{3}$' },
      }),
    ).rejects.toMatchObject({ code: 'MOCK_GENERATION_UNSUPPORTED', provider: 'mock' });
  });

  it.each(['deepseek', 'kimi'])(
    'adds the target schema to the initial json_object request for %s',
    async (provider) => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"json-object","count":1}' } }],
          usage: { prompt_tokens: 5, completion_tokens: 4 },
        }),
      });
      global.fetch = fetchMock as any;
      const { service: structuredService } = await createConfiguredService({
        LLM_PROVIDER: provider,
        LLM_API_KEY: 'test-key',
        LLM_BASE_URL: 'https://llm.example/v1',
        LLM_CHAT_PATH: '/chat/completions',
        LLM_MODEL: `${provider}-json`,
        LLM_STRUCTURED_OUTPUT_MODE: 'json_schema',
      });

      const result = await structuredService.generateStructured<{ answer: string; count: number }>({
        scenario: 'brain.plan',
        messages: [{ role: 'user', content: 'plan' }],
        schema: structuredSchema,
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.response_format).toEqual({ type: 'json_object' });
      expect(requestBody.stream).toBe(false);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0]).toEqual({ role: 'user', content: 'plan' });
      expect(JSON.parse(requestBody.messages[1].content).schema).toEqual(structuredSchema);
      expect(result.data).toEqual({ answer: 'json-object', count: 1 });
    },
  );

  it('applies the fallback structured output mode independently', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"fallback","count":1}' } }] }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
      LLM_FALLBACK_STRUCTURED_OUTPUT_MODE: 'json_object',
    });

    await structuredService.generateStructured({
      scenario: 'brain.fallback-mode',
      messages: [{ role: 'user', content: 'primary-secret' }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: 'sanitized-fallback' }],
      schema: structuredSchema,
    });

    const fallbackBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fallbackBody.response_format).toEqual({ type: 'json_object' });
    expect(fallbackBody.messages).toHaveLength(2);
    expect(JSON.parse(fallbackBody.messages[1].content).schema).toEqual(structuredSchema);
  });

  it('keeps enough default structured token budget for one fallback when max tokens is 8192', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary authentication failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"fallback","count":1}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'kimi',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://primary.example/v1',
      LLM_MODEL: 'primary-model',
      LLM_MAX_TOKENS: '8192',
      LLM_FALLBACK_PROVIDER: 'deepseek',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    const result = await structuredService.generateStructured({
      scenario: 'brain.large-max-token-fallback',
      messages: [{ role: 'user', content: 'primary request' }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: 'fallback request' }],
      schema: structuredSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ answer: 'fallback', count: 1 });
    expect(result.provider).toBe('deepseek(fallback)');
  });

  it('repairs invalid structured output once without replaying raw context', async () => {
    const secretMessage = 'private-customer-context';
    const sanitizedRepairMessage = 'sanitized-repair-context';
    const invalidRawText = '{"answer":"wrong","count":"not-a-number"}';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: invalidRawText } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"fixed","count":3}' } }],
          usage: { prompt_tokens: 7, completion_tokens: 4 },
        }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'deepseek',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.deepseek.com',
      LLM_CHAT_PATH: '/chat/completions',
      LLM_MODEL: 'deepseek-json',
    });

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.repair',
      messages: [{ role: 'user', content: secretMessage }],
      repairMessages: [{ role: 'user', content: sanitizedRepairMessage }],
      schema: structuredSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const repairPrompt = repairBody.messages.map((message: { content: string }) => message.content).join('\n');
    const repairInstruction = JSON.parse(repairBody.messages.at(-1).content);
    expect(repairBody.response_format).toEqual({ type: 'json_object' });
    expect(repairBody.stream).toBe(false);
    expect(repairPrompt).toContain('must be integer');
    expect(repairInstruction.schema).toEqual(structuredSchema);
    expect(repairPrompt).toContain(sanitizedRepairMessage);
    expect(repairPrompt).not.toContain(secretMessage);
    expect(repairPrompt).not.toContain(invalidRawText);
    expect(result.data).toEqual({ answer: 'fixed', count: 3 });
    expect(result.usage).toEqual({ provider: 'deepseek', model: 'deepseek-json', inputTokens: 17, outputTokens: 9 });
  });

  it('uses a schema prompt for other providers but keeps the repair prompt limited to Ajv errors and schema', async () => {
    const secretMessage = 'anthropic-private-context';
    const sanitizedRepairMessage = 'anthropic-sanitized-context';
    const invalidRawText = '{"answer":"wrong","count":"invalid"}';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: invalidRawText }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: '{"answer":"fixed","count":4}' }] }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'claude_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'claude-structured',
      LLM_STREAM: 'true',
    });

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.anthropic-repair',
      messages: [{ role: 'user', content: secretMessage }],
      repairMessages: [{ role: 'user', content: sanitizedRepairMessage }],
      schema: structuredSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const repairBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const firstInstruction = JSON.parse(firstBody.messages.at(-1).content);
    const repairInstruction = JSON.parse(repairBody.messages.at(-1).content);
    expect(firstBody.stream).toBe(false);
    expect(firstBody.messages).toHaveLength(2);
    expect(firstInstruction.schema).toEqual(structuredSchema);
    expect(repairBody.stream).toBe(false);
    expect(repairBody.messages).toHaveLength(2);
    expect(repairBody.messages[0]).toEqual({ role: 'user', content: sanitizedRepairMessage });
    expect(repairBody.messages[1].content).toContain('must be integer');
    expect(repairInstruction.schema).toEqual(structuredSchema);
    expect(JSON.stringify(repairBody.messages)).not.toContain(secretMessage);
    expect(JSON.stringify(repairBody.messages)).not.toContain(invalidRawText);
    expect(JSON.stringify(repairBody.messages)).not.toContain('Return only one JSON object');
    expect(result.data).toEqual({ answer: 'fixed', count: 4 });
  });

  it('throws SCHEMA_INVALID after one repair and audits only the controlled error code', async () => {
    const secretMessage = 'sensitive-message';
    const invalidRawText = '{"answer":"wrong","count":"invalid"}';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: invalidRawText } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'kimi',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.moonshot.ai/v1',
      LLM_CHAT_PATH: '/chat/completions',
      LLM_MODEL: 'kimi-json',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.invalid',
        messages: [{ role: 'user', content: secretMessage }],
        repairMessages: [{ role: 'user', content: 'sanitized-repair' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject<Partial<AiStructuredOutputError>>({
      name: 'AiStructuredOutputError',
      code: 'SCHEMA_INVALID',
      usage: { provider: 'kimi', model: 'kimi-json', inputTokens: 6, outputTokens: 4 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'brain.invalid',
        provider: 'kimi',
        model: 'kimi-json',
        inputTokens: 6,
        outputTokens: 4,
        outputSummary: 'errorCode=SCHEMA_INVALID',
        safetyBlocked: false,
        status: 'failed',
      }),
    });
    const auditPayload = JSON.stringify(prisma.aiAuditLog.create.mock.calls);
    expect(auditPayload).not.toContain(secretMessage);
    expect(auditPayload).not.toContain(invalidRawText);
    expect(auditPayload).not.toContain(JSON.stringify(structuredSchema));
  });

  it('does not repair invalid JSON unless sanitized repairMessages are provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'deepseek',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.deepseek.com',
      LLM_MODEL: 'deepseek-json',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.invalid-json',
        messages: [{ role: 'user', content: 'request' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({ code: 'JSON_INVALID' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty array', []],
    ['an empty content string', [{ role: 'user', content: '' }]],
    ['whitespace-only content', [{ role: 'user', content: ' \t\r\n ' }]],
    ['malformed non-string content', [null, { role: 'user', content: 123 }]],
    ['a valid message mixed with a malformed entry', [{ role: 'user', content: 'sanitized' }, null]],
    ['a message without a valid role', [{ content: 'sanitized' }]],
  ])('does not repair invalid JSON when repairMessages contain %s', async (_label, repairMessages) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'deepseek',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.deepseek.com',
      LLM_MODEL: 'deepseek-json',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.invalid-repair-messages',
        messages: [{ role: 'user', content: 'request' }],
        repairMessages: repairMessages as any,
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({ code: 'JSON_INVALID', provider: 'deepseek' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces standard JSON Schema formats during local validation', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"businessDate":"2026-02-31"}' } }] }),
    });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'deepseek',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.deepseek.com',
      LLM_MODEL: 'deepseek-json',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.invalid-date',
        messages: [{ role: 'user', content: 'request' }],
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['businessDate'],
          properties: { businessDate: { type: 'string', format: 'date' } },
        },
      }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fallback by default even when a fallback provider is configured', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('primary network failure'));
    global.fetch = fetchMock as any;
    const { service: structuredService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.no-default-fallback',
        messages: [{ role: 'user', content: 'primary-secret' }],
        fallbackMessages: [{ role: 'user', content: 'sanitized-fallback' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      provider: 'claude_compatible',
      model: 'primary-model',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ safetyBlocked: false, status: 'failed' }),
    });
  });

  it('does not fallback when allowFallback is true but fallbackMessages are missing', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('primary network failure'));
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.no-fallback-messages',
        messages: [{ role: 'user', content: 'primary-secret' }],
        allowFallback: true,
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({ provider: 'claude_compatible', model: 'primary-model' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty array', []],
    ['an empty content string', [{ role: 'user', content: '' }]],
    ['whitespace-only content', [{ role: 'user', content: ' \t\r\n ' }]],
    ['malformed non-string content', [null, { role: 'user', content: 123 }]],
    ['a valid message mixed with a malformed entry', [{ role: 'user', content: 'sanitized' }, null]],
    ['a message without a valid role', [{ content: 'sanitized' }]],
  ])('does not fallback when fallbackMessages contain %s', async (_label, fallbackMessages) => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('primary network failure'));
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.invalid-fallback-messages',
        messages: [{ role: 'user', content: 'primary-secret' }],
        allowFallback: true,
        fallbackMessages: fallbackMessages as any,
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', provider: 'claude_compatible', model: 'primary-model' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses one deadline and the smaller of remaining budget and provider timeout across fallback calls', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
    let now = 1000;
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async () => {
        now = 1600;
        throw new Error('primary network failure');
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"fallback","count":1}' } }] }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_TIMEOUT_MS: '300',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
      LLM_FALLBACK_TIMEOUT_MS: '20000',
    });
    jest.spyOn(structuredService as any, 'now').mockImplementation(() => now);

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.timeout',
      messages: [{ role: 'user', content: 'primary-secret' }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: 'sanitized-fallback' }],
      schema: structuredSchema,
      timeoutMs: 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timeoutSpy.mock.calls.map(([timeout]) => timeout)).toEqual([300, 400]);
    const fallbackBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fallbackBody.messages[0]).toEqual({ role: 'user', content: 'sanitized-fallback' });
    expect(JSON.parse(fallbackBody.messages[1].content).schema).toEqual(structuredSchema);
    expect(JSON.stringify(fallbackBody)).not.toContain('primary-secret');
    expect(result.provider).toBe('openai_compatible(fallback)');
    expect((structuredService as any).timeoutMs).toBe(300);
  });

  it('reserves part of a structured request deadline so the fallback provider can actually run', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(new AbortController().signal);
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"fallback","count":1}' } }] }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_TIMEOUT_MS: '30000',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
      LLM_FALLBACK_TIMEOUT_MS: '30000',
    });
    jest.spyOn(structuredService as any, 'now').mockReturnValue(1000);

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.fallback-reserve',
      messages: [{ role: 'user', content: 'primary' }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: 'fallback' }],
      schema: structuredSchema,
      timeoutMs: 15000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(timeoutSpy.mock.calls.map(([timeout]) => timeout)).toEqual([10000, 15000]);
    expect(result).toMatchObject({ provider: 'openai_compatible(fallback)', model: 'fallback-model' });
  });

  it('rejects a fourth reserved call without incrementing callCount', async () => {
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_MODEL: 'structured-model',
    });
    jest.spyOn(structuredService as any, 'now').mockReturnValue(1000);
    const budget = (structuredService as any).createStructuredRequestBudget({ timeoutMs: 1000 }, 1000);
    const providerConfig = {
      provider: 'openai_compatible',
      model: 'structured-model',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example/v1',
      chatPath: '/chat/completions',
      timeoutMs: 300,
      fallback: false,
      structuredOutputMode: 'auto',
    };

    (structuredService as any).reserveStructuredCall(budget, providerConfig);
    (structuredService as any).reserveStructuredCall(budget, providerConfig);
    (structuredService as any).reserveStructuredCall(budget, providerConfig);

    expect(() => (structuredService as any).reserveStructuredCall(budget, providerConfig)).toThrow(
      expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }),
    );
    expect(budget.callCount).toBe(3);
  });

  it('attributes usage by provider and model when primary repair fails before fallback succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"invalid","count":"x"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
      })
      .mockRejectedValueOnce(new Error('primary repair network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"fallback","count":3}' } }],
          usage: { prompt_tokens: 4, completion_tokens: 1 },
        }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService, prisma } = await createConfiguredService({
      LLM_PROVIDER: 'openai_compatible',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://primary.example/v1',
      LLM_MODEL: 'primary-model',
      LLM_STRUCTURED_OUTPUT_MODE: 'json_object',
      LLM_FALLBACK_PROVIDER: 'deepseek',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.cross-provider-usage',
      messages: [{ role: 'user', content: 'primary-secret' }],
      repairMessages: [{ role: 'user', content: 'sanitized-repair' }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: 'sanitized-fallback' }],
      schema: structuredSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.provider).toBe('deepseek(fallback)');
    expect(result.model).toBe('fallback-model');
    expect(result.usage).toEqual({
      provider: 'multiple',
      model: 'multiple',
      inputTokens: 14,
      outputTokens: 3,
      breakdown: [
        { provider: 'openai_compatible', model: 'primary-model', inputTokens: 10, outputTokens: 2 },
        { provider: 'deepseek(fallback)', model: 'fallback-model', inputTokens: 4, outputTokens: 1 },
      ],
    });
    const audit = prisma.aiAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      provider: 'multiple',
      model: 'multiple',
      inputTokens: 14,
      outputTokens: 3,
      status: 'success',
    });
    expect(JSON.parse(audit.inputSummary)).toEqual({ usageBreakdown: (result.usage as any).breakdown });
  });

  it('limits primary failure, fallback, and fallback repair to three calls and aggregates successful usage', async () => {
    const primarySecret = 'primary-secret-context';
    const sanitizedFallbackMessage = 'sanitized-fallback-context';
    const sanitizedRepairMessage = 'sanitized-repair-context';
    const fallbackInvalidRawText = '{"answer":"invalid","count":"x"}';
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: fallbackInvalidRawText } }],
          usage: { prompt_tokens: 6, completion_tokens: 2 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"answer":"fixed","count":2}' } }],
          usage: { prompt_tokens: 4, completion_tokens: 1 },
        }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"unexpected","count":9}' } }] }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    const result = await structuredService.generateStructured<{ answer: string; count: number }>({
      scenario: 'brain.fallback-repair',
      messages: [{ role: 'user', content: primarySecret }],
      allowFallback: true,
      fallbackMessages: [{ role: 'user', content: sanitizedFallbackMessage }],
      repairMessages: [{ role: 'user', content: sanitizedRepairMessage }],
      schema: structuredSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const fallbackBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    const repairBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(JSON.stringify(fallbackBody)).toContain(sanitizedFallbackMessage);
    expect(JSON.stringify(fallbackBody)).not.toContain(primarySecret);
    expect(JSON.stringify(repairBody)).toContain(sanitizedRepairMessage);
    expect(JSON.stringify(repairBody)).not.toContain(primarySecret);
    expect(JSON.stringify(repairBody)).not.toContain(fallbackInvalidRawText);
    expect(result.data).toEqual({ answer: 'fixed', count: 2 });
    expect(result.provider).toBe('openai_compatible(fallback)');
    expect(result.usage).toEqual({
      provider: 'openai_compatible(fallback)',
      model: 'fallback-model',
      inputTokens: 10,
      outputTokens: 3,
    });
  });

  it('never makes a fourth structured upstream call when fallback repair is still invalid', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('primary network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"bad","count":"x"}' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"still-bad","count":"x"}' } }] }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"answer":"fourth","count":4}' } }] }),
      });
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_FALLBACK_PROVIDER: 'openai_compatible',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_CHAT_PATH: '/chat/completions',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.max-calls',
        messages: [{ role: 'user', content: 'primary-secret' }],
        allowFallback: true,
        fallbackMessages: [{ role: 'user', content: 'sanitized-fallback' }],
        repairMessages: [{ role: 'user', content: 'sanitized-repair' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID', provider: 'openai_compatible(fallback)' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects unsupported fallback providers without sending an accidental Anthropic request', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new Error('primary network failure'));
    global.fetch = fetchMock as any;
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'primary-key',
      LLM_BASE_URL: 'https://anthropic.example/v1/messages',
      LLM_MODEL: 'primary-model',
      LLM_FALLBACK_PROVIDER: 'provider-typo',
      LLM_FALLBACK_API_KEY: 'fallback-key',
      LLM_FALLBACK_BASE_URL: 'https://fallback.example/v1',
      LLM_FALLBACK_MODEL: 'fallback-model',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.unsupported-fallback',
        messages: [{ role: 'user', content: 'request' }],
        allowFallback: true,
        fallbackMessages: [{ role: 'user', content: 'sanitized-fallback' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws PROVIDER_UNAVAILABLE when no structured provider can be called', async () => {
    const { service: structuredService } = await createConfiguredService({
      LLM_PROVIDER: 'deepseek',
      LLM_API_KEY: '',
      LLM_MODEL: 'deepseek-json',
    });

    await expect(
      structuredService.generateStructured({
        scenario: 'brain.unavailable',
        messages: [{ role: 'user', content: 'request' }],
        schema: structuredSchema,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
