export const BRAIN_SEMANTIC_INTENTS = [
  'query',
  'ranking',
  'comparison',
  'trend',
  'diagnosis',
  'recommendation',
  'draft',
  'action',
  'workflow',
  'clarify',
] as const;

export const BRAIN_SEMANTIC_ANSWER_SHAPES = [
  'scalar',
  'ranking',
  'list',
  'comparison',
  'trend',
  'diagnosis',
  'draft',
  'action_preview',
] as const;

export type BrainSemanticIntentKind = (typeof BRAIN_SEMANTIC_INTENTS)[number];
export type BrainSemanticAnswerShape = (typeof BRAIN_SEMANTIC_ANSWER_SHAPES)[number];
export type BrainSupportedTimezone = 'Asia/Shanghai' | 'UTC';

export type BrainDefinitionType = 'entity' | 'relation' | 'metric' | 'dimension' | 'field' | 'action';

export interface BrainDefinitionRef<T extends BrainDefinitionType = BrainDefinitionType> {
  definitionType: T;
  definitionKey: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
}

export interface BrainFilterClause {
  fieldRef: BrainDefinitionRef<'field'>;
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string | number | boolean | Array<string | number>;
}

export interface BrainSemanticEntityReference {
  entityType: string;
  entityKey?: string;
  mention: string;
  source: 'user' | 'conversation' | 'memory' | 'system';
  definitionRef?: BrainDefinitionRef<'entity'>;
  confidence: number;
}

export interface BrainSemanticTimeRange {
  preset?: string;
  startDate?: string;
  endDate?: string;
  label: string;
  timezone: BrainSupportedTimezone;
}

export interface BrainSemanticOrderBy {
  definitionRef: BrainDefinitionRef<'metric' | 'dimension' | 'field'>;
  direction: 'asc' | 'desc';
}

export type BrainSemanticComparisonTarget =
  | {
      type: 'time';
      timeRange: BrainSemanticTimeRange;
    }
  | {
      type: 'entity';
      entityKeys: string[];
    };

export interface BrainSemanticAmbiguity {
  slot: string;
  reason: string;
  candidates: string[];
}

export interface BrainSemanticIntent {
  schemaVersion: '1.0';
  objective: string;
  domains: string[];
  intent: BrainSemanticIntentKind;
  entities: BrainSemanticEntityReference[];
  metrics: Array<BrainDefinitionRef<'metric'>>;
  dimensions: Array<BrainDefinitionRef<'dimension'>>;
  filters: BrainFilterClause[];
  timeRange?: BrainSemanticTimeRange;
  comparisonTarget?: BrainSemanticComparisonTarget;
  orderBy: BrainSemanticOrderBy[];
  limit?: number;
  answerShape: BrainSemanticAnswerShape;
  successCriteria: string[];
  ambiguities: BrainSemanticAmbiguity[];
  missingSlots: string[];
  assumptions: string[];
  confidence: number;
  decisionSummary: string;
}
