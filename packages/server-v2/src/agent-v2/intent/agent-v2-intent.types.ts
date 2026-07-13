export type AgentV2IntentAction =
  | 'lookup'
  | 'list'
  | 'summary'
  | 'diagnose'
  | 'analyze'
  | 'compare'
  | 'draft'
  | 'get_link'
  | 'print'
  | 'unknown';

export type AgentV2TimeIntent = 'occurred' | 'risk' | 'trend' | 'current' | 'historical_pattern' | 'unknown';

export type KnowledgeGraphObjectHint = {
  objectId: string;
  objectType: string;
  displayName: string;
  matchedTerms: string[];
  sourceModels: string[];
  score: number;
};

export type KnowledgeGraphDomainHint = {
  domain: string;
  displayName: string;
  score: number;
  reasons: string[];
};

export type KnowledgeGraphCapabilityHint = {
  capabilityId: string;
  displayName: string;
  domain: string;
  outputKinds: string[];
  triggerTerms: string[];
  score: number;
};

export type KnowledgeGraphExclusionHint = {
  fromCapabilityId: string;
  toCapabilityId: string;
  reason: string;
};

export type KnowledgeGraphIntentContext = {
  question: string;
  normalizedQuestion: string;
  cleanedQuestion: string;
  synonymExpansion: Array<{ term: string; targetId: string; targetType: string }>;
  objectHints: KnowledgeGraphObjectHint[];
  domainHints: KnowledgeGraphDomainHint[];
  capabilityHints: KnowledgeGraphCapabilityHint[];
  exclusions: KnowledgeGraphExclusionHint[];
  fieldHints: Array<{ model: string; field: string; displayName: string }>;
};

export type StructuredIntent = {
  objects: string[];
  domain: string;
  action: AgentV2IntentAction;
  timeIntent: AgentV2TimeIntent;
  keywords: string[];
  candidateCapabilities: string[];
  confidence: number;
  needsClarification: boolean;
  unsupportedReason: string | null;
  trace: {
    source: 'kg_fallback' | 'llm' | 'cache';
    cacheHit?: boolean;
    llmFallbackReason?: string;
    llmRawTextPreview?: string;
    llmPrompt?: {
      system: string;
      userPayloadPreview: string;
      graphContextCounts: {
        objectHints: number;
        domainHints: number;
        capabilityHints: number;
        exclusions: number;
        fieldHints: number;
      };
      activeManifestCount: number;
      outputSchemaKeys: string[];
    };
    llmResponse?: {
      rawTextPreview: string;
      parsed: boolean;
      parsedKeys?: string[];
    };
    normalizedQuestion: string;
    objectHints: KnowledgeGraphObjectHint[];
    domainHints: KnowledgeGraphDomainHint[];
    capabilityHints: KnowledgeGraphCapabilityHint[];
    exclusions: KnowledgeGraphExclusionHint[];
  };
};

export type IntentExtractionInput = {
  question: string;
  role?: string;
  storeId?: number;
  userId?: number;
  manifestVersion?: string | null;
  engine?: 'kg_fallback' | 'llm';
};
