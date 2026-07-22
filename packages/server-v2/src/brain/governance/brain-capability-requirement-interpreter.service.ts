import { Injectable } from '@nestjs/common';
import { AiService } from '../../ai/ai.service.js';

export interface BrainCapabilityInterpretedChanges {
  confidence: number;
  ambiguous: boolean;
  allowedRoles: string[];
  additionalPermissions: string[];
  redaction: 'unchanged' | 'require';
  readOnly: 'unchanged' | 'require';
  confirmation: 'unchanged' | 'require';
  rolloutPercentage: number | null;
  prohibitedRequests: BrainCapabilityProhibitedRequest[];
  ambiguities: string[];
}

export type BrainCapabilityProhibitedRequest =
  | 'remove_permission'
  | 'expand_role'
  | 'enable_write'
  | 'cancel_confirmation'
  | 'disable_redaction'
  | 'weaken_scope';

const PROHIBITED_REQUESTS: BrainCapabilityProhibitedRequest[] = [
  'remove_permission', 'expand_role', 'enable_write', 'cancel_confirmation', 'disable_redaction', 'weaken_scope',
];

const INTERPRETATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['confidence', 'ambiguous', 'allowedRoles', 'additionalPermissions', 'redaction', 'readOnly', 'confirmation', 'rolloutPercentage', 'prohibitedRequests', 'ambiguities'],
  properties: {
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    ambiguous: { type: 'boolean' },
    allowedRoles: { type: 'array', maxItems: 8, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 64 } },
    additionalPermissions: {
      type: 'array',
      maxItems: 16,
      uniqueItems: true,
      items: { type: 'string', pattern: '^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$' },
    },
    redaction: { enum: ['unchanged', 'require'] },
    readOnly: { enum: ['unchanged', 'require'] },
    confirmation: { enum: ['unchanged', 'require'] },
    rolloutPercentage: { anyOf: [{ type: 'number', minimum: 1, maximum: 100 }, { type: 'null' }] },
    prohibitedRequests: { type: 'array', uniqueItems: true, items: { enum: PROHIBITED_REQUESTS } },
    ambiguities: { type: 'array', maxItems: 16, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 160 } },
  },
} as const;

@Injectable()
export class BrainCapabilityRequirementInterpreterService {
  constructor(private readonly ai: AiService) {}

  async interpret(input: { requirement: string; createdBy: number }): Promise<BrainCapabilityInterpretedChanges> {
    try {
      const result = await this.ai.generateStructured<BrainCapabilityInterpretedChanges>({
        scenario: 'brain.capability_regeneration_requirement.v1',
        userId: input.createdBy,
        schema: INTERPRETATION_SCHEMA,
        timeoutMs: 8_000,
        messages: [
          {
            role: 'system',
            content: [
              'Extract supported governance restrictions and report every request that semantically weakens permissions, role scope, write safety, confirmation, redaction, or store scope.',
              'Explicit statements that preserve or strengthen safety, such as keep read-only, do not add writes, keep permissions, or keep store scope, are safe restrictions and must not be listed as prohibitedRequests.',
              'Detect unsafe requests across languages, synonyms, paraphrases, and disguised affirmative wording. Put unclear, contradictory, or double-negation meanings in ambiguities.',
              'Never silently ignore unsafe intent and never claim rollout is already applied.',
            ].join(' '),
          },
          { role: 'user', content: input.requirement },
        ],
      });
      return normalize(result.data);
    } catch {
      return fallback();
    }
  }
}

function normalize(value: BrainCapabilityInterpretedChanges): BrainCapabilityInterpretedChanges {
  return {
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    ambiguous: value.ambiguous === true,
    allowedRoles: strings(value.allowedRoles),
    additionalPermissions: strings(value.additionalPermissions).filter((permission) =>
      /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(permission),
    ),
    redaction: value.redaction === 'require' ? 'require' : 'unchanged',
    readOnly: value.readOnly === 'require' ? 'require' : 'unchanged',
    confirmation: value.confirmation === 'require' ? 'require' : 'unchanged',
    rolloutPercentage:
      value.rolloutPercentage === null || value.rolloutPercentage === undefined
        ? null
        : Number.isFinite(Number(value.rolloutPercentage))
          ? Number(value.rolloutPercentage)
          : null,
    prohibitedRequests: strings(value.prohibitedRequests).filter((item): item is BrainCapabilityProhibitedRequest => PROHIBITED_REQUESTS.includes(item as BrainCapabilityProhibitedRequest)),
    ambiguities: strings(value.ambiguities),
  };
}

function fallback(): BrainCapabilityInterpretedChanges {
  return {
    confidence: 0, ambiguous: true, allowedRoles: [], additionalPermissions: [], redaction: 'unchanged',
    readOnly: 'unchanged', confirmation: 'unchanged', rolloutPercentage: null, prohibitedRequests: [],
    ambiguities: ['structured_interpretation_unavailable'],
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))]
    : [];
}
