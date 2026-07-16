import { BRAIN_SEMANTIC_ANSWER_SHAPES, BRAIN_SEMANTIC_INTENTS } from './brain-semantic-intent.types.js';

const definitionRefSchema = (allowedTypes: readonly string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['definitionType', 'definitionKey', 'definitionVersion', 'definitionFingerprint', 'sourceFingerprint'],
  properties: {
    definitionType: { type: 'string', enum: allowedTypes },
    definitionKey: { type: 'string', pattern: '\\S' },
    definitionVersion: { type: 'integer', minimum: 1 },
    definitionFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sourceFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
});

const timeRangeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'timezone'],
  properties: {
    preset: { type: 'string', minLength: 1 },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: 'string', format: 'date' },
    label: { type: 'string', minLength: 1 },
    timezone: { type: 'string', enum: ['Asia/Shanghai', 'UTC'] },
  },
} as const;

export const BRAIN_SEMANTIC_INTENT_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ami-core.local/schemas/brain-semantic-intent-1.0.json',
  title: 'BrainSemanticIntent',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'objective',
    'domains',
    'intent',
    'entities',
    'metrics',
    'dimensions',
    'filters',
    'orderBy',
    'answerShape',
    'successCriteria',
    'ambiguities',
    'missingSlots',
    'assumptions',
    'confidence',
    'decisionSummary',
  ],
  properties: {
    schemaVersion: { type: 'string', const: '1.0' },
    objective: { type: 'string', minLength: 1 },
    domains: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    intent: { type: 'string', enum: BRAIN_SEMANTIC_INTENTS },
    entities: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entityType', 'mention', 'source', 'confidence'],
        properties: {
          entityType: { type: 'string', minLength: 1 },
          entityKey: { type: 'string', minLength: 1 },
          mention: { type: 'string', minLength: 1 },
          source: { type: 'string', enum: ['user', 'conversation', 'memory', 'system'] },
          definitionRef: definitionRefSchema(['entity']),
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    metrics: {
      type: 'array',
      maxItems: 8,
      items: definitionRefSchema(['metric']),
    },
    dimensions: {
      type: 'array',
      maxItems: 8,
      items: definitionRefSchema(['dimension']),
    },
    filters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldRef', 'operator', 'value'],
        properties: {
          fieldRef: definitionRefSchema(['field']),
          operator: { type: 'string', enum: ['eq', 'neq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte'] },
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              {
                type: 'array',
                items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
              },
            ],
          },
        },
      },
    },
    timeRange: timeRangeSchema,
    comparisonTarget: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'timeRange'],
          properties: {
            type: { type: 'string', const: 'time' },
            timeRange: timeRangeSchema,
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'entityKeys'],
          properties: {
            type: { type: 'string', const: 'entity' },
            entityKeys: {
              type: 'array',
              minItems: 2,
              uniqueItems: true,
              items: { type: 'string', minLength: 1 },
            },
          },
        },
      ],
    },
    orderBy: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          definitionRef: definitionRefSchema(['metric', 'dimension', 'field']),
          direction: { type: 'string', enum: ['asc', 'desc'] },
        },
        required: ['definitionRef', 'direction'],
      },
    },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    answerShape: { type: 'string', enum: BRAIN_SEMANTIC_ANSWER_SHAPES },
    successCriteria: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    ambiguities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slot', 'reason', 'candidates'],
        properties: {
          slot: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 },
          candidates: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    missingSlots: { type: 'array', items: { type: 'string', minLength: 1 } },
    assumptions: { type: 'array', items: { type: 'string', minLength: 1 } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    decisionSummary: { type: 'string', minLength: 1 },
  },
} as const;

const compactDefinitionRefSchema = (allowedTypes: readonly string[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['definitionType', 'definitionKey'],
  properties: {
    definitionType: { type: 'string', enum: allowedTypes },
    definitionKey: { type: 'string', pattern: '\\S' },
    definitionVersion: { type: 'integer', minimum: 1 },
    definitionFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sourceFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  },
});

export const BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA = buildModelIntentSchema();

function buildModelIntentSchema(): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(BRAIN_SEMANTIC_INTENT_JSON_SCHEMA)) as any;
  schema.$id = 'https://ami-core.local/schemas/brain-semantic-intent-model-1.0.json';
  schema.properties.intent = {
    oneOf: [
      { type: 'string', enum: BRAIN_SEMANTIC_INTENTS },
      { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'string', enum: BRAIN_SEMANTIC_INTENTS } },
    ],
  };
  schema.properties.answerShape = {
    oneOf: [
      { type: 'string', enum: BRAIN_SEMANTIC_ANSWER_SHAPES },
      { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'string', enum: BRAIN_SEMANTIC_ANSWER_SHAPES } },
    ],
  };
  schema.properties.entities.items.properties.definitionRef = compactDefinitionRefSchema(['entity']);
  schema.properties.entities.items.properties.source.enum = ['user', 'question', 'conversation', 'memory', 'system'];
  schema.properties.metrics.items = compactDefinitionRefSchema(['metric']);
  schema.properties.dimensions.items = compactDefinitionRefSchema(['dimension']);
  schema.properties.filters.items.properties.fieldRef = compactDefinitionRefSchema(['field']);
  schema.properties.orderBy.items.properties.definitionRef = compactDefinitionRefSchema(['metric', 'dimension', 'field']);
  return schema;
}

export const BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA = {
  type: 'BrainSemanticIntent',
  requiredFields: [
    'schemaVersion',
    'objective',
    'domains',
    'intent',
    'entities',
    'metrics',
    'dimensions',
    'filters',
    'orderBy',
    'answerShape',
    'successCriteria',
    'ambiguities',
    'missingSlots',
    'assumptions',
    'confidence',
    'decisionSummary',
  ],
  fieldContract: {
    schemaVersion: 'literal 1.0',
    objective: 'string',
    domains: 'non-empty string array using governed ontology domains',
    intent: `one string enum: ${BRAIN_SEMANTIC_INTENTS.join(' | ')}`,
    entities: 'array of {entityType, entityKey?, mention, source(user|conversation|memory|system), definitionRef?, confidence}',
    metrics: 'array of exact governed metric definitionRef objects',
    dimensions: 'array of exact governed dimension definitionRef objects',
    filters: 'array of {fieldRef, operator, value}; use [] when no governed fieldRef exists',
    timeRange: 'optional {preset?, startDate?, endDate?, label, timezone}',
    comparisonTarget: 'optional time or entity comparison target',
    orderBy: 'array of {definitionRef, direction}',
    limit: 'optional positive integer',
    answerShape: `one string enum: ${BRAIN_SEMANTIC_ANSWER_SHAPES.join(' | ')}`,
    successCriteria: 'non-empty string array',
    ambiguities: 'array of {slot, reason, candidates}',
    missingSlots: 'string array',
    assumptions: 'string array',
    confidence: 'number from 0 to 1',
    decisionSummary: 'short conclusion without hidden reasoning',
  },
  definitionRefRequiredFields: ['definitionType', 'definitionKey'],
  definitionRefResolution: 'The server resolves version and fingerprints from the published Ontology snapshot.',
  additionalProperties: false,
} as const;
