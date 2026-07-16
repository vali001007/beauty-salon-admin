import { BrainSemanticIntentCompilerService } from './cognition/brain-semantic-intent-compiler.service.js';
import { BrainTimeRangeParserService } from './cognition/brain-time-range-parser.service.js';
import { BrainConversationContextService } from './context/brain-conversation-context.service.js';
import type { BrainRequestContext } from './context/brain-request-context.js';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';
import { BrainRoleContextBuilderService } from './role/brain-role-context-builder.service.js';

const sha = (value: string) => value.repeat(64);
const metricRef = {
  definitionType: 'metric' as const,
  definitionKey: 'metric.product_sales_quantity',
  definitionVersion: 2,
  definitionFingerprint: sha('a'),
  sourceFingerprint: sha('b'),
};

describe('Brain role and memory model context integration', () => {
  it('injects the active profile and governed follow-up slots without exposing identity controls', async () => {
    const prisma = {
      brainAgentProfile: {
        findFirst: jest.fn().mockResolvedValue({
          roleKey: 'receptionist',
          name: '前台接待',
          systemPrompt: '从前台接待视角回答，所有动作仅生成预览。',
          allowedSkills: ['product_sales_ranking'],
          dataScopeRules: { storeScope: 'current_user_visible_stores' },
          knowledgePack: { domains: ['front_desk', 'sales'] },
          version: 4,
        }),
      },
      brainConversation: {
        findUnique: jest.fn().mockResolvedValue({
          contextSnapshot: {
            model: {
              version: 1,
              objective: '查询本月商品销售排行',
              definitionRefs: [metricRef],
              metrics: [metricRef],
              dimensions: [],
              entities: [],
              intent: 'ranking',
              answerShape: 'ranking',
              timeRange: {
                label: '本月',
                startDate: '2026-07-01',
                endDate: '2026-07-31',
                timezone: 'Asia/Shanghai',
              },
              capability: { key: 'product_sales_ranking', version: 2 },
              lastCorrections: [],
              updatedFromRunId: 77,
              updatedAt: '2026-07-13T00:00:00.000Z',
            },
          },
        }),
      },
    };
    const timeRangeParser = {
      parse: jest.fn().mockReturnValue({
        mentionedTime: true,
        range: {
          label: '上月',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-30T23:59:59.999Z'),
          granularity: 'month',
        },
        filters: [],
        requiresComparison: false,
        unsupportedExpressions: [],
      }),
    };
    const profileService = new BrainAgentProfileService(prisma as never);
    const roleBuilder = new BrainRoleContextBuilderService(profileService);
    const conversationService = new BrainConversationContextService(prisma as never, timeRangeParser as never);
    const context: BrainRequestContext = {
      userId: 9,
      storeId: 6,
      visibleStoreIds: [6],
      roles: ['receptionist'],
      permissions: ['core:brain:use'],
      deniedPermissions: [],
      requestId: 'integration-role-memory',
      timezone: 'Asia/Shanghai',
    };
    const productionSnapshot = {
      productionReady: true,
      fingerprint: sha('c'),
      entities: [],
      relations: [],
      metrics: [
        {
          definitionKey: metricRef.definitionKey,
          version: metricRef.definitionVersion,
          definitionFingerprint: metricRef.definitionFingerprint,
          sourceFingerprint: metricRef.sourceFingerprint,
          metricKey: 'product_sales_quantity',
          name: '商品销量',
          domain: 'sales',
          formula: {},
          source: {},
          defaultFilters: [],
          permissions: [],
          description: '商品销量',
        },
      ],
      dimensions: [],
    };

    const [roleContext, turn] = await Promise.all([
      roleBuilder.build({ context, roleHint: 'finance' }),
      conversationService.prepareModelTurn({
        conversationId: 12,
        dto: { message: '那上个月呢', roleHint: 'finance', timezone: 'Asia/Shanghai' },
        snapshot: productionSnapshot as never,
      }),
    ]);
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          schemaVersion: '1.0',
          objective: '查询上月商品销售排行',
          domains: ['sales'],
          intent: 'ranking',
          entities: [],
          metrics: [metricRef],
          dimensions: [],
          filters: [],
          timeRange: { label: '上月', startDate: '2026-06-01', endDate: '2026-06-30', timezone: 'Asia/Shanghai' },
          orderBy: [],
          answerShape: 'ranking',
          successCriteria: ['返回商品排行'],
          ambiguities: [],
          missingSlots: [],
          assumptions: [],
          confidence: 0.95,
          decisionSummary: '继承商品销量，时间替换为上月',
        },
        provider: 'openai',
        model: 'gpt-test',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    };
    const compiler = new BrainSemanticIntentCompilerService(
      ai as never,
      { runtime: { modelTimeoutMs: 1000 } } as never,
      new BrainTimeRangeParserService(),
    );

    await compiler.compile({
      question: '那上个月呢',
      audit: { userId: context.userId, storeId: context.storeId },
      timezone: 'Asia/Shanghai',
      role: roleContext.role,
      roleContext,
      conversationSlots: { ...turn.previous, turnDirectives: turn.directives },
      ontologySnapshot: productionSnapshot as never,
      ontologyCandidates: [],
      metricRefs: [metricRef],
      dimensionRefs: [],
      capabilitySummaries: [
        {
          key: 'product_sales_ranking',
          name: '商品销售排行',
          description: '按商品统计销量排行',
          domains: ['sales'],
          intents: ['ranking'],
          readOnly: true,
        },
      ],
    });

    const request = ai.generateStructured.mock.calls[0][0];
    const modelPayload = request.messages.map((message: { content: string }) => message.content).join('\n');
    expect(roleContext).toMatchObject({ role: 'receptionist', expressionRole: 'finance', profileVersion: 4 });
    expect(modelPayload).toContain('从前台接待视角回答');
    expect(modelPayload).toContain('product_sales_ranking');
    expect(modelPayload).toContain('上月');
    expect(modelPayload).not.toContain('visibleStoreIds');
    expect(modelPayload).not.toContain('"permissions":');
    expect(modelPayload).not.toContain('roleHint');
  });
});
