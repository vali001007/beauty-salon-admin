import type {
  AgentEvalQuestionCase,
  AgentQuestionBankPersona,
  AgentQuestionIntentType,
  AgentQuestionOutputKind,
} from '../../agent/agent-eval-question-bank.js';

type ParaphraseExpected = {
  domains?: string[];
  entities?: string[];
  metrics?: string[];
  dimensions?: string[];
  capabilityKeys?: string[];
  answerShape?: string;
  requiresConfirmation?: boolean;
  brainStatus?: 'completed' | 'clarify';
  missingSlots?: string[];
  forbiddenMissingSlots?: string[];
};

type ParaphraseCase = {
  id: string;
  intent: string;
  input: string;
  expected: ParaphraseExpected;
};

type ConversationTurn = {
  id: string;
  intent: string;
  input: string;
  expected: ParaphraseExpected;
};

type ConversationCase = {
  id: string;
  persona?: AgentQuestionBankPersona;
  turns: ConversationTurn[];
};

export type BrainEvalQuestionCase = AgentEvalQuestionCase & {
  expectedAnswerShape?: string;
  expectedBrainStatus?: 'completed' | 'clarify';
  expectedMissingSlots?: string[];
  expectedForbiddenMissingSlots?: string[];
  conversationTurns?: BrainEvalQuestionCase[];
  scenarioId?: string;
  turnId?: string;
  turnIndex?: number;
  turnCount?: number;
};

export function expectedAnswerShapeForQuestion(question: BrainEvalQuestionCase): string | undefined {
  if (question.expectedAnswerShape) return question.expectedAnswerShape;
  if (question.expectedSemanticIntent === 'clarify') return 'clarification';
  if (question.expectedSemanticIntent === 'action' || question.expectedSemanticIntent === 'workflow') {
    return 'action_preview';
  }
  if (question.expectedSemanticIntent === 'ranking') return 'ranking';
  if (question.expectedSemanticIntent === 'comparison') return 'comparison';
  if (question.expectedSemanticIntent === 'trend') return 'trend';
  if (question.expectedSemanticIntent === 'draft') return 'draft';
  const outputKinds = question.expectedOutputKinds ?? [];
  if (
    question.expectedSemanticIntent === 'query' &&
    question.expectedMetrics?.length === 1 &&
    outputKinds.includes('kpi') &&
    !outputKinds.includes('table')
  ) {
    return 'scalar';
  }
  return undefined;
}

export function parseBrainParaphraseEvalJson(raw: string): BrainEvalQuestionCase[] {
  const payload = JSON.parse(raw) as { cases?: unknown };
  if (!Array.isArray(payload.cases)) throw new Error('ami_brain_paraphrase_cases_missing');
  return payload.cases.map((value, index) => {
    if (hasConversationTurns(value)) return toConversationQuestionCase(parseConversationCase(value, index), index);
    return toQuestionCase(parseCase(value, index), index);
  });
}

function hasConversationTurns(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as any).turns));
}

function parseCase(value: unknown, index: number): ParaphraseCase {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ami_brain_paraphrase_case_invalid:${index}`);
  }
  const item = value as Record<string, unknown>;
  const expected = item.expected;
  if (
    typeof item.id !== 'string' || !item.id.trim() ||
    typeof item.intent !== 'string' || !item.intent.trim() ||
    typeof item.input !== 'string' || !item.input.trim() ||
    !expected || typeof expected !== 'object' || Array.isArray(expected)
  ) {
    throw new Error(`ami_brain_paraphrase_case_invalid:${index}`);
  }
  return {
    id: item.id.trim(),
    intent: item.intent.trim(),
    input: item.input.trim(),
    expected: expected as ParaphraseExpected,
  };
}

function toQuestionCase(testCase: ParaphraseCase, index: number): BrainEvalQuestionCase {
  const persona = personaFor(testCase);
  return {
    id: `paraphrase-${testCase.id}`,
    sourceCategory: testCase.intent,
    sourceSection: '模型驱动同义改写门禁',
    sourceIndex: index + 1,
    persona,
    evalRole: persona === 'reception' ? 'reception' : persona === 'beautician' ? 'beautician' : 'manager',
    input: testCase.input,
    priority: 'P0',
    expectedRoute: persona,
    expectedIntentType: intentTypeFor(testCase.intent),
    expectedOutputKinds: outputKindsFor(testCase.expected.answerShape),
    expectedSemanticIntent: testCase.intent,
    expectedDomains: stringList(testCase.expected.domains),
    expectedEntities: stringList(testCase.expected.entities),
    expectedMetrics: stringList(testCase.expected.metrics),
    expectedDimensions: stringList(testCase.expected.dimensions),
    expectedCapabilityKeys: stringList(testCase.expected.capabilityKeys),
    expectedAnswerShape: testCase.expected.answerShape,
    expectedPlanShape: testCase.expected.requiresConfirmation
      ? { requiresPreview: true }
      : undefined,
    expectedBrainStatus: testCase.expected.brainStatus,
    expectedMissingSlots: stringList(testCase.expected.missingSlots),
    expectedForbiddenMissingSlots: stringList(testCase.expected.forbiddenMissingSlots),
    riskLevel: testCase.expected.requiresConfirmation ? 'high' : 'low',
    requiresApproval: testCase.expected.requiresConfirmation === true,
    notes: `同义改写期望输出：${testCase.expected.answerShape ?? '未声明'}`,
    systemSupportStatus: 'system_supported_testable',
    systemSupportReason: '模型驱动语义改写门禁必须经过真实 BrainChat 链路。',
    coverageStage: 'not_run',
  };
}

function parseConversationCase(value: unknown, index: number): ConversationCase {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ami_brain_conversation_case_invalid:${index}`);
  }
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id.trim() || !Array.isArray(item.turns) || item.turns.length < 2) {
    throw new Error(`ami_brain_conversation_case_invalid:${index}`);
  }
  const persona = typeof item.persona === 'string' ? item.persona as AgentQuestionBankPersona : undefined;
  if (persona && !['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance', 'edge'].includes(persona)) {
    throw new Error(`ami_brain_conversation_persona_invalid:${index}`);
  }
  return {
    id: item.id.trim(),
    persona,
    turns: item.turns.map((turn, turnIndex) => parseConversationTurn(turn, index, turnIndex)),
  };
}

function parseConversationTurn(value: unknown, caseIndex: number, turnIndex: number): ConversationTurn {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`ami_brain_conversation_turn_invalid:${caseIndex}:${turnIndex}`);
  }
  const item = value as Record<string, unknown>;
  const expected = item.expected;
  if (
    typeof item.id !== 'string' || !item.id.trim() ||
    typeof item.intent !== 'string' || !item.intent.trim() ||
    typeof item.input !== 'string' || !item.input.trim() ||
    !expected || typeof expected !== 'object' || Array.isArray(expected)
  ) {
    throw new Error(`ami_brain_conversation_turn_invalid:${caseIndex}:${turnIndex}`);
  }
  return {
    id: item.id.trim(),
    intent: item.intent.trim(),
    input: item.input.trim(),
    expected: expected as ParaphraseExpected,
  };
}

function toConversationQuestionCase(testCase: ConversationCase, index: number): BrainEvalQuestionCase {
  const turns = testCase.turns.map((turn, turnIndex) => {
    const question = toQuestionCase({ ...turn }, index);
    return {
      ...question,
      id: `conversation-${testCase.id}:${turn.id}`,
      sourceSection: '模型驱动多轮会话门禁',
      sourceCategory: testCase.id,
      sourceIndex: turnIndex + 1,
      ...(testCase.persona ? {
        persona: testCase.persona,
        evalRole: testCase.persona === 'reception'
          ? 'reception'
          : testCase.persona === 'beautician'
            ? 'beautician'
            : 'manager',
      } : {}),
      scenarioId: testCase.id,
      turnId: turn.id,
      turnIndex: turnIndex + 1,
      turnCount: testCase.turns.length,
    } satisfies BrainEvalQuestionCase;
  });
  const first = turns[0]!;
  return {
    ...first,
    id: `conversation-${testCase.id}`,
    conversationTurns: turns,
    notes: `多轮会话门禁，共 ${turns.length} 轮；每轮必须通过真实 BrainChat 六层评分。`,
  };
}

function personaFor(testCase: ParaphraseCase): AgentQuestionBankPersona {
  const domains = new Set(stringList(testCase.expected.domains));
  if (testCase.intent === 'workflow') return 'edge';
  if (domains.has('front_desk')) return 'reception';
  if (domains.has('marketing_growth')) return 'marketing';
  if (domains.has('beautician') || domains.has('beautician_service')) return 'beautician';
  if (domains.has('inventory_procurement')) return 'inventory';
  if (domains.has('finance_risk')) return 'finance';
  return testCase.intent === 'clarify' ? 'edge' : 'manager';
}

function intentTypeFor(intent: string): AgentQuestionIntentType {
  if (intent === 'draft') return 'draft';
  if (intent === 'clarify') return 'clarify';
  if (['diagnosis', 'recommendation', 'action', 'workflow'].includes(intent)) {
    return 'analysis_and_recommendation';
  }
  return 'query';
}

function outputKindsFor(answerShape?: string): AgentQuestionOutputKind[] {
  if (answerShape === 'ranking') return ['table', 'evidence'];
  if (answerShape === 'trend') return ['chart', 'evidence'];
  if (answerShape === 'scalar') return ['kpi', 'evidence'];
  if (answerShape === 'action_preview') return ['action_card', 'evidence'];
  if (answerShape === 'clarification') return ['clarify'];
  return ['text', 'evidence'];
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  return values.length ? values : undefined;
}
