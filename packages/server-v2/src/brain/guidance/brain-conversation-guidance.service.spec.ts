import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { BrainModule } from '../brain.module.js';
import { BrainCapabilityRetrieverService } from '../capability/brain-capability-retriever.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import { BrainConversationGuidanceService } from './brain-conversation-guidance.service.js';

const context = {
  userId: 9,
  storeId: 2,
  visibleStoreIds: [2],
  permissions: ['*'],
  deniedPermissions: [],
  roles: ['store_manager'],
  requestId: 'req_guidance',
  timezone: 'Asia/Shanghai',
};

function card(
  key: string,
  input: Partial<BrainCapabilityCard> & Pick<BrainCapabilityCard, 'name' | 'examples'>,
): BrainCapabilityCard {
  return {
    key,
    version: 1,
    name: input.name,
    description: input.description ?? input.name,
    domains: input.domains ?? ['membership'],
    intents: input.intents ?? ['query'],
    inputSchema: {},
    outputSchema: {},
    requiredPermissions: input.requiredPermissions ?? [],
    allowedRoles: input.allowedRoles ?? [],
    readOnly: input.readOnly ?? true,
    sideEffect: input.sideEffect ?? false,
    riskLevel: input.riskLevel ?? 'low',
    requiresConfirmation: input.requiresConfirmation ?? false,
    idempotency: input.idempotency ?? 'not_applicable',
    timeoutMs: 1000,
    grounding: input.grounding ?? 'domain_service',
    examples: input.examples,
    sourceFingerprint: 'a'.repeat(64),
    definitionRefs: [],
    synonyms: input.synonyms ?? [],
    negativeExamples: [],
    successSchema: {},
  };
}

describe('BrainConversationGuidanceService', () => {
  const retriever = new BrainCapabilityRetrieverService({
    runtime: { capabilityMinConfidence: 0.3, capabilityTopK: 8 },
  } as never);
  const service = new BrainConversationGuidanceService(retriever);
  const cards = [
    card('membership_overview', {
      name: '会员与卡项经营概览',
      examples: ['查看会员与卡项整体经营情况'],
      synonyms: ['会员卡整体情况', '卡项概览'],
    }),
    card('member_liability', {
      name: '会员卡未履约负债',
      examples: ['会员卡未履约负债是多少'],
      synonyms: ['会员卡负债'],
    }),
    card('stored_balance_flow', {
      name: '储值余额与流水',
      examples: ['储值余额和最近流水分别是多少'],
      intents: ['query'],
    }),
    card('card_expiry_risk', {
      name: '卡项到期风险',
      examples: ['哪些会员卡即将到期'],
      intents: ['diagnosis'],
    }),
    card('card_usage_ranking', {
      name: '卡项消耗排行',
      examples: ['本月哪些卡项消耗次数最多'],
      intents: ['ranking'],
    }),
    card('card_write_action', {
      name: '调整会员卡余额',
      examples: ['把会员卡余额调整为一千元'],
      intents: ['action'],
      readOnly: false,
      sideEffect: true,
      riskLevel: 'high',
      requiresConfirmation: true,
      idempotency: 'required',
      grounding: 'preview_action',
    }),
  ];

  it('recognizes a typical broad business question but excludes explicit metric and action questions', () => {
    expect(service.isBroadQuestion('会员卡负责情况', { domains: ['membership'] })).toBe(true);
    expect(service.isBroadQuestion('会员卡负债是多少', { domains: ['membership'] })).toBe(false);
    expect(service.isBroadQuestion('把会员卡余额调整为一千元', { domains: ['membership'] })).toBe(false);
  });

  it('clarifies a broad question when the selected capability is not an overview', () => {
    expect(
      service.shouldClarifySelectedBroadQuestion({
        question: '会员卡负责情况',
        intent: { domains: ['membership'] },
        retrieval: {
          status: 'selected',
          selected: cards[1],
          topK: [{ card: cards[1]!, score: 0.8, matchedFields: ['name'] }],
          confidence: 0.8,
          margin: 0.3,
          reason: 'top1_selected',
        },
      }),
    ).toBe(true);

    const result = service.buildClarification({
      question: '会员卡负责情况',
      intent: { domains: ['membership'] },
      context: context as never,
      cards,
    });
    expect(result.status).toBe('clarify');
    if (result.status !== 'clarify') throw new Error('expected clarification');
    expect(result.options).toHaveLength(4);
    expect(result.options.map((option) => option.capabilityKey)).not.toContain('card_write_action');
    expect(result.pendingClarification).toMatchObject({ missingSlots: ['objective'], turnCount: 1 });
  });

  it('returns exactly three safe and distinct follow-up questions after an overview', () => {
    const questions = service.buildFollowUpQuestions({
      question: '会员卡整体情况怎么样',
      intent: { domains: ['membership'] },
      selected: cards[0]!,
      context: context as never,
      cards,
    });
    expect(questions).toHaveLength(3);
    expect(new Set(questions.map((question) => question.capabilityKey)).size).toBe(3);
    expect(questions.every((question) => question.value.endsWith('？'))).toBe(true);
    expect(questions.map((question) => question.capabilityKey)).not.toContain('card_write_action');
  });

  it('applies the same overview and three-question policy across published business domains', () => {
    for (const domain of ['finance', 'inventory', 'reservation', 'customer', 'staff', 'marketing']) {
      const domainCards = [
        card(`${domain}_overview`, {
          name: `${domain}经营概览`,
          domains: [domain],
          examples: [`查看${domain}整体经营情况`],
        }),
        ...['query', 'diagnosis', 'ranking'].map((intent, index) =>
          card(`${domain}_${intent}`, {
            name: `${domain}细分目标${index + 1}`,
            domains: [domain],
            intents: [intent],
            examples: [`查看${domain}细分目标${index + 1}`],
          }),
        ),
      ];
      const question = `${domain}整体怎么样`;
      expect(service.isBroadQuestion(question, { domains: [domain] })).toBe(true);
      expect(
        service.buildFollowUpQuestions({
          question,
          intent: { domains: [domain] },
          selected: domainCards[0]!,
          context: context as never,
          cards: domainCards,
        }),
      ).toHaveLength(3);
    }
  });

  it('stops after two clarification turns and never fabricates a third round', () => {
    const result = service.buildClarification({
      question: '还是想看整体情况',
      intent: { domains: ['membership'] },
      context: context as never,
      cards,
      previousPending: {
        missingSlots: ['objective'],
        questions: ['请选择目标'],
        ambiguities: [],
        turnCount: 2,
      },
    });
    expect(result).toEqual({ status: 'exhausted', capabilityKeys: [] });
  });

  it('is registered and exported by BrainModule', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BrainModule) as unknown[];
    expect(providers).toContain(BrainConversationGuidanceService);
    expect(exports).toContain(BrainConversationGuidanceService);
  });
});
