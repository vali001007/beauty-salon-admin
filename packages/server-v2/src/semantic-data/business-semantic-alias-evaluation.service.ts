import { Injectable } from '@nestjs/common';
import { normalizeBusinessSemanticValue } from './business-semantic-evidence.service.js';

export type BusinessSemanticAliasRegressionCase = {
  id: number;
  caseKey: string;
  input: unknown;
  expected: unknown;
};

export type BusinessSemanticAliasEvaluationInput = {
  alias: string;
  definitionId: number;
  definitionType: string;
  definitionKey: string;
  projections: ReadonlyArray<{ targetType: string; payload: unknown }>;
  regressionCases: BusinessSemanticAliasRegressionCase[];
};

export type BusinessSemanticAliasEvaluationResult = {
  passed: boolean;
  checks: {
    intentSemanticIndexContainsAlias: boolean;
    evalCaseProjectionContainsAlias: boolean;
    regressionCasesPassed: boolean;
  };
  caseResults: Array<{ caseId: number; caseKey: string; passed: boolean; errors?: string[] }>;
  errors: string[];
};

export abstract class BusinessSemanticAliasEvaluationPort {
  abstract evaluate(input: BusinessSemanticAliasEvaluationInput): Promise<BusinessSemanticAliasEvaluationResult>;
}

@Injectable()
export class BusinessSemanticAliasEvaluationService implements BusinessSemanticAliasEvaluationPort {
  async evaluate(input: BusinessSemanticAliasEvaluationInput): Promise<BusinessSemanticAliasEvaluationResult> {
    const normalizedAlias = normalizeBusinessSemanticValue(input.alias);
    const intentProjection = input.projections.find((item) => item.targetType === 'intent_semantic_index');
    const evalProjection = input.projections.find((item) => item.targetType === 'eval_case_projection');
    const intentAliases = stringArray(record(record(intentProjection?.payload).data).aliases);
    const evalInputs = array(record(record(evalProjection?.payload).data).cases)
      .map((item) => record(item).input)
      .filter((item): item is string => typeof item === 'string');
    const intentSemanticIndexContainsAlias = intentAliases.some(
      (item) => normalizeBusinessSemanticValue(item) === normalizedAlias,
    );
    const evalCaseProjectionContainsAlias = evalInputs.some(
      (item) => normalizeBusinessSemanticValue(item) === normalizedAlias,
    );
    const caseResults = input.regressionCases.map((item) => {
      const caseInput = record(item.input);
      const expected = record(item.expected);
      const errors: string[] = [];
      const message = String(caseInput.message ?? caseInput.question ?? '');
      if (normalizeBusinessSemanticValue(message) !== normalizedAlias) errors.push('regression_alias_mismatch');
      if (
        String(expected.definitionType ?? '') !== input.definitionType ||
        String(expected.definitionKey ?? '') !== input.definitionKey
      ) {
        errors.push('regression_definition_mismatch');
      }
      return {
        caseId: item.id,
        caseKey: item.caseKey,
        passed: errors.length === 0,
        ...(errors.length ? { errors } : {}),
      };
    });
    const regressionCasesPassed = caseResults.every((item) => item.passed);
    const errors = [
      ...(intentSemanticIndexContainsAlias ? [] : ['intent_semantic_index_alias_missing']),
      ...(evalCaseProjectionContainsAlias ? [] : ['eval_case_projection_alias_missing']),
      ...(regressionCasesPassed ? [] : ['regression_case_failed']),
    ];
    return {
      passed: errors.length === 0,
      checks: {
        intentSemanticIndexContainsAlias,
        evalCaseProjectionContainsAlias,
        regressionCasesPassed,
      },
      caseResults,
      errors,
    };
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return array(value).filter((item): item is string => typeof item === 'string');
}
