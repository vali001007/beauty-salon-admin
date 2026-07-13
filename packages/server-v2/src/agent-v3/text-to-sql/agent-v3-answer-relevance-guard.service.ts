import { Injectable } from '@nestjs/common';
import type {
  AgentV3AnswerRelevanceGuardResult,
  AgentV3SqlGuardResult,
  AgentV3TextToSqlPlan,
} from './agent-v3-text-to-sql.types.js';

@Injectable()
export class AgentV3AnswerRelevanceGuardService {
  inspect(input: { plan: AgentV3TextToSqlPlan; guard: AgentV3SqlGuardResult }): AgentV3AnswerRelevanceGuardResult {
    if (input.guard.status === 'blocked') {
      return { status: 'pass', appliedPolicies: ['sql_guard_blocked_before_relevance'] };
    }
    const queryIntent = input.plan.queryIntent;
    if (!queryIntent) {
      return { status: 'pass', appliedPolicies: ['legacy_plan_without_query_intent'] };
    }

    const selectedViewNames = input.guard.selectedViews.map((viewDef) => viewDef.viewName);
    if (queryIntent.selectedView && !selectedViewNames.includes(queryIntent.selectedView)) {
      return this.block(
        'semantic_view_mismatch',
        `语义路由选择 ${queryIntent.selectedView}，但 SQL 实际查询 ${selectedViewNames.join(', ') || '空视图'}。`,
        ['query_intent_view_checked'],
      );
    }

    const domainMismatch = input.guard.selectedViews.find((viewDef) => viewDef.domain !== queryIntent.domain);
    if (domainMismatch && queryIntent.domain !== 'unknown') {
      return this.block(
        'semantic_domain_mismatch',
        `问题对象是 ${queryIntent.entity.canonicalName}，但 SQL 选择了 ${domainMismatch.domain} 领域视图。`,
        ['query_intent_domain_checked'],
      );
    }

    const selectedColumns = new Set([
      ...input.guard.parsed.columns.map((column) => this.cleanColumn(column)),
      ...(input.guard.parsed.referencedColumns ?? []).map((column) => this.cleanColumn(column)),
    ].filter(Boolean));
    const forbidden = queryIntent.forbiddenFields.find((field) => selectedColumns.has(field));
    if (forbidden) {
      return this.block(
        'forbidden_answer_field_selected',
        `问题对象是 ${queryIntent.entity.canonicalName}，但 SQL 使用了不相关字段 ${forbidden}。`,
        ['query_intent_forbidden_fields_checked'],
      );
    }

    const viewFieldNames = new Set(input.guard.selectedViews.flatMap((viewDef) => viewDef.fields.map((field) => field.name)));
    const expectedInView = queryIntent.expectedFields.filter((field) => viewFieldNames.has(field));
    if (queryIntent.expectedFields.length && !expectedInView.length) {
      return this.block(
        'expected_answer_fields_missing_in_view',
        `问题对象是 ${queryIntent.entity.canonicalName}，但所选视图缺少对应业务字段。`,
        ['query_intent_expected_fields_checked'],
      );
    }

    if (['ranking', 'list', 'detail'].includes(queryIntent.shape)) {
      const expectedInColumns = queryIntent.expectedFields.filter((field) => selectedColumns.has(field));
      if (!expectedInColumns.length && queryIntent.expectedFields.length) {
        return this.block(
          'expected_answer_fields_missing_in_select',
          `问题需要返回 ${queryIntent.entity.canonicalName} 列表，但 SQL 未返回对应业务字段。`,
          ['query_intent_expected_fields_checked'],
        );
      }
    }

    return {
      status: 'pass',
      appliedPolicies: [
        'query_intent_view_checked',
        'query_intent_domain_checked',
        'query_intent_forbidden_fields_checked',
        'query_intent_expected_fields_checked',
      ],
    };
  }

  private cleanColumn(column: string) {
    return column.includes('.') ? column.split('.').at(-1) ?? column : column;
  }

  private block(reasonCode: string, message: string, appliedPolicies: string[]): AgentV3AnswerRelevanceGuardResult {
    return { status: 'blocked', reasonCode, message, appliedPolicies };
  }
}
