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
  answerShape?: string;
  requiresConfirmation?: boolean;
};

type ParaphraseCase = {
  id: string;
  intent: string;
  input: string;
  expected: ParaphraseExpected;
};

export function parseBrainParaphraseEvalJson(raw: string): AgentEvalQuestionCase[] {
  const payload = JSON.parse(raw) as { cases?: unknown };
  if (!Array.isArray(payload.cases)) throw new Error('ami_brain_paraphrase_cases_missing');
  return payload.cases.map((value, index) => toQuestionCase(parseCase(value, index), index));
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

function toQuestionCase(testCase: ParaphraseCase, index: number): AgentEvalQuestionCase {
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
    expectedPlanShape: testCase.expected.requiresConfirmation
      ? { requiresPreview: true }
      : undefined,
    riskLevel: testCase.expected.requiresConfirmation ? 'high' : 'low',
    requiresApproval: testCase.expected.requiresConfirmation === true,
    notes: `同义改写期望输出：${testCase.expected.answerShape ?? '未声明'}`,
    systemSupportStatus: 'system_supported_testable',
    systemSupportReason: '模型驱动语义改写门禁必须经过真实 BrainChat 链路。',
    coverageStage: 'not_run',
  };
}

function personaFor(testCase: ParaphraseCase): AgentQuestionBankPersona {
  const domains = new Set(stringList(testCase.expected.domains));
  if (testCase.intent === 'workflow') return 'edge';
  if (domains.has('front_desk')) return 'reception';
  if (domains.has('marketing_growth')) return 'marketing';
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
