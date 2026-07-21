export const BRAIN_EXECUTION_PLAN_SCHEMA_VERSION = '1.0' as const;
export const BRAIN_EXECUTION_MAX_NODES = 8;
export const BRAIN_EXECUTION_MAX_REPLANS = 2;
export const BRAIN_EXECUTION_MAX_BUDGET_MS = 20_000;

export interface BrainExecutionInputMapping {
  fromNodeId: string;
  sourcePath: string;
  targetPath: string;
}

export interface BrainExecutionPlanNode {
  id: string;
  capabilityKey: string;
  capabilityVersion: number;
  dependsOn: string[];
  previewOnly: boolean;
  args: Record<string, unknown>;
  inputMappings?: BrainExecutionInputMapping[];
}

export interface BrainExecutionPlan {
  schemaVersion: typeof BRAIN_EXECUTION_PLAN_SCHEMA_VERSION;
  planId: string;
  objective: string;
  nodes: BrainExecutionPlanNode[];
  replanCount: number;
  budgetMs: number;
  isSingleStep?: boolean;
}

export const BRAIN_EXECUTION_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'planId', 'objective', 'nodes', 'replanCount', 'budgetMs'],
  properties: {
    schemaVersion: { const: BRAIN_EXECUTION_PLAN_SCHEMA_VERSION },
    planId: { type: 'string', minLength: 1, maxLength: 160 },
    objective: { type: 'string', minLength: 1, maxLength: 1000 },
    replanCount: { type: 'integer', minimum: 0, maximum: BRAIN_EXECUTION_MAX_REPLANS },
    budgetMs: { type: 'integer', minimum: 1, maximum: BRAIN_EXECUTION_MAX_BUDGET_MS },
    isSingleStep: { type: 'boolean' },
    nodes: {
      type: 'array',
      minItems: 1,
      maxItems: BRAIN_EXECUTION_MAX_NODES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'capabilityKey', 'capabilityVersion', 'dependsOn', 'previewOnly', 'args'],
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
          capabilityKey: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,127}$' },
          capabilityVersion: { type: 'integer', minimum: 1 },
          dependsOn: {
            type: 'array',
            uniqueItems: true,
            maxItems: BRAIN_EXECUTION_MAX_NODES - 1,
            items: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
          },
          previewOnly: { type: 'boolean' },
          args: { type: 'object' },
          inputMappings: {
            type: 'array',
            maxItems: 32,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['fromNodeId', 'sourcePath', 'targetPath'],
              properties: {
                fromNodeId: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
                sourcePath: { type: 'string', pattern: '^\\$[.]data([.][A-Za-z_][A-Za-z0-9_]*)+$' },
                targetPath: { type: 'string', pattern: '^\\$([.][A-Za-z_][A-Za-z0-9_]*)+$' },
              },
            },
          },
        },
      },
    },
  },
} as const;
