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

const actionSlotSchema = (compactRefs: boolean) => ({
  type: 'object',
  additionalProperties: false,
  required: ['slotKey', 'source', 'confidence'],
  properties: {
    slotKey: { type: 'string', minLength: 1 },
    semanticRole: {
      type: 'string',
      enum: [
        'actor',
        'requester',
        'authorizer',
        'approver',
        'performer',
        'assignee',
        'service_provider',
        'accountable_party',
        'beneficiary',
        'counterparty',
        'object',
        'target',
        'instrument',
        'origin',
        'destination',
        'quantity',
        'time',
        'condition',
      ],
    },
    source: { type: 'string', enum: ['user', 'question', 'conversation', 'memory', 'system'] },
    rawValue: { type: 'string', minLength: 1 },
    numericValue: { type: 'number' },
    unit: { type: 'string', minLength: 1 },
    enumValue: { type: 'string', minLength: 1 },
    booleanValue: { type: 'boolean' },
    timeValue: { type: 'string', minLength: 1 },
    entityKey: { type: 'string', minLength: 1 },
    entityDefinitionRef: compactRefs ? compactDefinitionRefSchema(['entity']) : definitionRefSchema(['entity']),
    resultReferenceId: { type: 'string', pattern: '^run:[1-9][0-9]*:[A-Za-z0-9_-]+:[1-9][0-9]*$' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
});

export const BRAIN_SEMANTIC_INTENT_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://ami-core.local/schemas/brain-semantic-intent-1.1.json',
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
    schemaVersion: { type: 'string', enum: ['1.0', '1.1'] },
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
          fieldRef: definitionRefSchema(['field', 'dimension']),
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
    actionRef: definitionRefSchema(['action']),
    actionPolarity: {
      type: 'string',
      enum: ['affirmative', 'negated'],
    },
    negatedActionRefs: {
      type: 'array',
      minItems: 1,
      maxItems: 16,
      items: definitionRefSchema(['action']),
    },
    actionModality: {
      type: 'string',
      enum: ['request', 'proposal', 'confirm', 'schedule', 'cancel_request'],
    },
    actionSlots: {
      type: 'array',
      maxItems: 32,
      items: actionSlotSchema(false),
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
  allOf: [
    {
      if: { properties: { intent: { const: 'action' } }, required: ['intent'] },
      then: {
        properties: { schemaVersion: { const: '1.1' } },
        oneOf: [
          {
            required: ['actionRef', 'actionPolarity', 'actionModality'],
            properties: {
              actionRef: {},
              actionPolarity: {},
              actionModality: {},
              actionSlots: {},
            },
            allOf: [
              {
                if: { properties: { actionPolarity: { const: 'affirmative' } }, required: ['actionPolarity'] },
                then: { required: ['actionSlots'], properties: { actionSlots: {} } },
              },
            ],
          },
          {
            required: ['missingSlots'],
            properties: {
              missingSlots: {
                type: 'array',
                items: { type: 'string', minLength: 1 },
                contains: { const: 'actionDefinition' },
              },
              actionRef: {},
            },
            not: { required: ['actionRef'] },
          },
        ],
      },
    },
    {
      if: {
        properties: {
          intent: {
            enum: ['query', 'ranking', 'comparison', 'trend', 'diagnosis', 'recommendation', 'draft', 'clarify'],
          },
        },
        required: ['intent'],
      },
      then: {
        properties: {
          actionRef: {},
          actionPolarity: {},
          negatedActionRefs: {},
          actionModality: {},
          actionSlots: {},
        },
        allOf: [
          { not: { required: ['actionRef'] } },
          { not: { properties: { actionPolarity: {} }, required: ['actionPolarity'] } },
          { not: { properties: { negatedActionRefs: {} }, required: ['negatedActionRefs'] } },
          { not: { required: ['actionModality'] } },
          { not: { required: ['actionSlots'] } },
        ],
      },
    },
    {
      if: { required: ['actionRef'] },
      then: { required: ['actionPolarity'], properties: { actionPolarity: {} } },
    },
    {
      if: { required: ['negatedActionRefs'] },
      then: {
        required: ['actionRef', 'actionPolarity'],
        properties: { actionRef: {}, actionPolarity: { const: 'affirmative' } },
      },
    },
  ],
} as const;

export const BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA = buildModelIntentSchema();

function buildModelIntentSchema(): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(BRAIN_SEMANTIC_INTENT_JSON_SCHEMA)) as any;
  schema.$id = 'https://ami-core.local/schemas/brain-semantic-intent-model-1.1.json';
  schema.properties.selectedCapabilityKey = {
    anyOf: [{ type: 'string', minLength: 1, pattern: '^[a-z][a-z0-9_.-]*$' }, { type: 'null' }],
  };
  schema.properties.intent = {
    oneOf: [
      { type: 'string', enum: BRAIN_SEMANTIC_INTENTS },
      {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
        items: { type: 'string', enum: BRAIN_SEMANTIC_INTENTS },
      },
    ],
  };
  schema.properties.answerShape = {
    oneOf: [
      { type: 'string', enum: BRAIN_SEMANTIC_ANSWER_SHAPES },
      {
        type: 'array',
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
        items: { type: 'string', enum: BRAIN_SEMANTIC_ANSWER_SHAPES },
      },
    ],
  };
  schema.properties.entities.items.properties.definitionRef = compactDefinitionRefSchema(['entity']);
  schema.properties.entities.items.properties.source.enum = ['user', 'question', 'conversation', 'memory', 'system'];
  schema.properties.metrics.items = compactDefinitionRefSchema(['metric']);
  schema.properties.dimensions.items = compactDefinitionRefSchema(['dimension']);
  schema.properties.filters.items.properties.fieldRef = compactDefinitionRefSchema(['field', 'dimension']);
  schema.properties.orderBy.items.properties.definitionRef = compactDefinitionRefSchema([
    'metric',
    'dimension',
    'field',
  ]);
  schema.properties.actionRef = compactDefinitionRefSchema(['action']);
  schema.properties.negatedActionRefs.items = compactDefinitionRefSchema(['action']);
  schema.properties.actionSlots.items = actionSlotSchema(true);
  delete schema.properties.timeRange;
  delete schema.properties.comparisonTarget;
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
    schemaVersion: 'literal 1.0 for non-action intents or 1.1 for action/workflow intents',
    objective: 'string',
    domains: 'non-empty string array using governed ontology domains',
    intent: `one string enum: ${BRAIN_SEMANTIC_INTENTS.join(' | ')}`,
    entities:
      'array of {entityType, entityKey?, mention, source(user|conversation|memory|system), definitionRef?, confidence}',
    metrics: 'array of exact governed metric definitionRef objects',
    dimensions: 'array of exact governed dimension definitionRef objects',
    filters: 'array of {fieldRef, operator, value}; use [] when no governed fieldRef exists',
    orderBy: 'array of {definitionRef, direction}',
    limit: 'optional positive integer',
    answerShape: `one string enum: ${BRAIN_SEMANTIC_ANSWER_SHAPES.join(' | ')}`,
    successCriteria: 'non-empty string array',
    actionRef:
      'exact governed action definitionRef; when no matching action is published, omit it and include actionDefinition in missingSlots',
    actionPolarity:
      'affirmative | negated; required whenever actionRef exists. The model judges polarity from the full utterance and context.',
    negatedActionRefs:
      'optional non-empty array of exact governed action refs rejected by a correction; only allowed with an affirmative selected action and must not repeat or equal actionRef',
    actionModality: 'request | proposal | confirm | schedule | cancel_request; required when actionRef exists',
    actionResultReference:
      'When an action slot selects an item from modelContext.resultSets, copy its refId into resultReferenceId.',
    actionSlots:
      'array of controlled slots declared by the selected action definition; every item requires slotKey, source(user|question|conversation|memory|system), confidence, and exactly the applicable typed value fields: rawValue for text, numericValue plus optional unit for numbers, enumValue for enum, booleanValue for boolean, timeValue for time, or entityKey plus entityDefinitionRef for an entity; generic value is forbidden; use [] when no value was supplied',
    ambiguities: 'array of {slot, reason, candidates}',
    missingSlots: 'string array',
    assumptions: 'string array',
    confidence: 'number from 0 to 1',
    decisionSummary: 'short conclusion without hidden reasoning',
    selectedCapabilityKey:
      'optional read-only delivery capability key selected only from rankedCapabilityKeys; use null or omit it when no unique published contract covers the requested deliverable; forbidden for action intent',
  },
  definitionRefRequiredFields: ['definitionType', 'definitionKey'],
  definitionRefResolution: 'The server resolves version and fingerprints from the published Ontology snapshot.',
  additionalProperties: false,
} as const;
