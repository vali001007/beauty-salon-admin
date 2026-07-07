import { Injectable } from '@nestjs/common';
import { AGENT_V3_TEXT_TO_SQL_DEFAULT_LIMIT } from './agent-v3-text-to-sql.constants.js';
import { agentV3TextToSqlConfig } from './agent-v3-text-to-sql.config.js';
import { resolveAgentV3QueryDateRange } from '../utils/agent-v3-date-range.js';
import type {
  AgentV3SemanticView,
  AgentV3SqlGuardResult,
  AgentV3TextToSqlRequest,
} from './agent-v3-text-to-sql.types.js';
import { AgentV3SemanticViewRegistryService } from './agent-v3-semantic-view-registry.service.js';
import { AgentV3SqlAstParserService } from './agent-v3-sql-ast-parser.service.js';

@Injectable()
export class AgentV3SqlGuardService {
  constructor(
    private readonly registry: AgentV3SemanticViewRegistryService,
    private readonly parser: AgentV3SqlAstParserService,
  ) {}

  inspect(sql: string, request: Pick<AgentV3TextToSqlRequest, 'storeIds' | 'permissions' | 'roleCodes'> & { question?: string }): AgentV3SqlGuardResult {
    const parsed = this.parser.parse(sql);
    if (parsed.status === 'blocked') {
      return { status: 'blocked', reasonCode: parsed.reasonCode, message: parsed.message, redactedSql: this.redact(sql), appliedPolicies: [] };
    }

    const sourceViews = this.registry.findMany(parsed.parsed.sourceViews);
    if (sourceViews.length !== parsed.parsed.sourceViews.length) {
      return this.block('source_view_not_allowed', '包含未进入白名单的语义视图。', sql, [], []);
    }
    const disabled = sourceViews.find((viewDef) => viewDef.status !== 'enabled');
    if (disabled) return this.block('source_view_not_enabled', `语义视图 ${disabled.viewName} 尚未启用。`, sql, sourceViews, []);
    const adminOnly = sourceViews.find((viewDef) => viewDef.adminOnly && !this.isAdmin(request));
    if (adminOnly) return this.block('admin_only_view', `语义视图 ${adminOnly.viewName} 仅管理员可用。`, sql, sourceViews, []);
    const missingPermission = sourceViews.find((viewDef) => !viewDef.requiredPermissions.every((permission) => request.permissions.includes(permission) || request.permissions.includes('*')));
    if (missingPermission) return this.block('permission_denied', `缺少 ${missingPermission.viewName} 所需权限。`, sql, sourceViews, []);
    if (parsed.parsed.hasWildcard) return this.block('wildcard_not_allowed', '不允许 SELECT *。', sql, sourceViews, []);

    const policies = this.fieldPolicies(sourceViews);
    const fieldsToCheck = [...parsed.parsed.columns, ...(parsed.parsed.referencedColumns ?? [])];
    const unknownField = fieldsToCheck
      .map((column) => this.cleanColumn(column))
      .find((column) => column && !policies.has(column));
    if (unknownField) return this.block('field_not_allowed', `字段 ${unknownField} 未进入语义视图白名单。`, sql, sourceViews, []);
    const deniedField = parsed.parsed.columns.find((column) => policies.get(this.cleanColumn(column)) === 'deny');
    if (deniedField) return this.block('deny_field_selected', `字段 ${deniedField} 不允许返回。`, sql, sourceViews, []);
    const dangerousColumn = parsed.parsed.columns.find((column) => /(password|token|secret|phone|openid|idcard|address|remark)/i.test(column));
    if (dangerousColumn && policies.get(this.cleanColumn(dangerousColumn)) !== 'mask') {
      return this.block('sensitive_field_selected', `字段 ${dangerousColumn} 疑似敏感。`, sql, sourceViews, []);
    }

    const config = agentV3TextToSqlConfig();
    if (parsed.parsed.limit && parsed.parsed.limit > config.maxLimit) {
      return this.block('limit_exceeds_max', `查询数量超过最大限制 ${config.maxLimit}。`, sql, sourceViews, []);
    }
    if (!request.storeIds.length && sourceViews.some((viewDef) => viewDef.storeScopeField)) {
      return this.block('missing_store_scope', '缺少门店范围。', sql, sourceViews, []);
    }

    const timeRange = resolveAgentV3QueryDateRange({ question: request.question ?? '' }, 'this_month', { maxRecentDays: config.maxRangeDays });
    const timeInjected = this.needsTimeRange(sql, sourceViews);
    const safeSql = this.rewrite(sql, sourceViews, {
      injectedLimit: parsed.parsed.hasLimit ? undefined : Math.min(config.maxLimit, AGENT_V3_TEXT_TO_SQL_DEFAULT_LIMIT),
      injectTimeRange: timeInjected,
    });
    return {
      status: 'pass',
      safeSql,
      redactedSql: this.redact(safeSql),
      params: {
        allowedStoreIds: request.storeIds,
        ...(timeInjected ? { startAt: timeRange.start.toISOString(), endAt: timeRange.end.toISOString() } : {}),
        ...(safeSql.includes(':paidStatuses') ? { paidStatuses: ['paid', 'completed', '已付款', '已完成'] } : {}),
      },
      selectedViews: sourceViews,
      parsed: parsed.parsed,
      appliedPolicies: [
        'select_only',
        'semantic_view_whitelist',
        'field_policy_checked',
        'store_scope_required',
        timeInjected ? 'time_range_injected' : 'time_range_checked',
        parsed.parsed.hasLimit ? 'limit_checked' : 'limit_injected',
      ],
    };
  }

  private rewrite(sql: string, views: AgentV3SemanticView[], options: { injectedLimit?: number; injectTimeRange?: boolean }) {
    let rewritten = sql.trim().replace(/;$/, '');
    if (views.some((viewDef) => viewDef.storeScopeField) && !/allowedStoreIds|store_id\s*=\s*any|store_id\s+in/i.test(rewritten)) {
      rewritten = /\bwhere\b/i.test(rewritten)
        ? rewritten.replace(/\bwhere\b\s*/i, 'WHERE store_id = ANY(:allowedStoreIds) AND ')
        : this.insertBeforeClauses(rewritten, 'WHERE store_id = ANY(:allowedStoreIds)');
    }
    for (const field of this.timeFieldsToInject(rewritten, views)) {
      if (!options.injectTimeRange) continue;
      const fragment = `${field} >= :startAt AND ${field} < :endAt`;
      rewritten = /\bwhere\b/i.test(rewritten)
        ? rewritten.replace(/\bwhere\b\s*/i, `WHERE ${fragment} AND `)
        : this.insertBeforeClauses(rewritten, `WHERE ${fragment}`);
    }
    if (options.injectedLimit) rewritten = `${rewritten} LIMIT ${options.injectedLimit}`;
    return `${rewritten};`;
  }

  private needsTimeRange(sql: string, views: AgentV3SemanticView[]) {
    return this.timeFieldsToInject(sql, views).length > 0;
  }

  private timeFieldsToInject(sql: string, views: AgentV3SemanticView[]) {
    return [...new Set(views
      .map((viewDef) => viewDef.defaultTimeField)
      .filter((field): field is string => Boolean(field))
      .filter((field) => !new RegExp(`\\b${field}\\b\\s*(?:>=|>|between|=)`, 'i').test(sql) && !/:startAt|:endAt/.test(sql)))];
  }

  private insertBeforeClauses(sql: string, fragment: string) {
    const match = sql.match(/\b(group\s+by|order\s+by|limit)\b/i);
    if (!match || match.index === undefined) return `${sql} ${fragment}`;
    return `${sql.slice(0, match.index).trim()} ${fragment} ${sql.slice(match.index).trim()}`;
  }

  private fieldPolicies(views: AgentV3SemanticView[]) {
    const policies = new Map<string, string>();
    for (const viewDef of views) {
      for (const field of viewDef.fields) policies.set(field.name, field.policy);
    }
    return policies;
  }

  private cleanColumn(column: string) {
    return column.includes('.') ? column.split('.').at(-1) ?? column : column;
  }

  private isAdmin(request: Pick<AgentV3TextToSqlRequest, 'permissions' | 'roleCodes'>) {
    return request.permissions.includes('*') || request.permissions.includes('core:agent-governance:manage') || request.roleCodes.includes('super_admin');
  }

  private redact(sql: string) {
    return sql.replace(/'[^']*'/g, "'***'").replace(/\b1[3-9]\d{9}\b/g, '***phone***');
  }

  private block(reasonCode: string, message: string, sql: string, _sourceViews: AgentV3SemanticView[], appliedPolicies: string[]): AgentV3SqlGuardResult {
    return { status: 'blocked', reasonCode, message, redactedSql: this.redact(sql), appliedPolicies };
  }
}
