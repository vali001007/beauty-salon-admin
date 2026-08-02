import { Injectable } from '@nestjs/common';
import { ReadOnlySqlParser } from './read-only-sql-parser.js';
import type {
  ReadOnlySqlGuardResult,
  ReadOnlySqlParsed,
  ReadOnlySqlRelation,
  ReadOnlySqlRequestContext,
  ReadOnlySqlView,
} from './read-only-sql-kernel.types.js';

const ALLOWED_FUNCTIONS = new Set([
  'sum',
  'count',
  'avg',
  'min',
  'max',
  'coalesce',
  'round',
  'date_trunc',
  'extract',
  'abs',
  'nullif',
  'greatest',
  'least',
  'cast',
  'lower',
  'upper',
  'left',
  'right',
  'concat',
  'any',
]);
const STRUCTURAL_IDENTIFIERS = new Set([
  'select',
  'from',
  'where',
  'group',
  'order',
  'limit',
  'having',
  'join',
  'with',
  'by',
  'on',
  'case',
  'when',
  'then',
  'else',
  'end',
  'nulls',
  'first',
  'last',
]);

@Injectable()
export class ReadOnlySqlGuard {
  constructor(private readonly parser: ReadOnlySqlParser) {}

  inspect(sql: string, views: ReadOnlySqlView[], context: ReadOnlySqlRequestContext): ReadOnlySqlGuardResult {
    const parsedResult = this.parser.parse(sql);
    const fingerprint = this.parser.fingerprint(sql);
    if (parsedResult.status === 'blocked') {
      return {
        status: 'blocked',
        reasonCode: parsedResult.reasonCode,
        message: parsedResult.message,
        redactedSql: this.parser.redact(sql),
        appliedPolicies: [],
        sqlFingerprint: fingerprint,
      };
    }

    const parsed = parsedResult.parsed;
    const catalog = new Map(views.map((view) => [view.viewName, view]));
    const selectedViews = parsed.sourceViews
      .map((viewName) => catalog.get(viewName))
      .filter((view): view is ReadOnlySqlView => Boolean(view));
    if (selectedViews.length !== parsed.sourceViews.length) {
      return this.block('source_view_not_allowed', 'SQL 包含未登记的问数视图。', sql, parsed, fingerprint);
    }
    if (selectedViews.length > (context.maxViews ?? 2)) {
      return this.block(
        'too_many_views',
        `首期最多关联 ${context.maxViews ?? 2} 个问数视图。`,
        sql,
        parsed,
        fingerprint,
      );
    }
    if (selectedViews.length > 1 && selectedViews.some((view) => !view.allowJoin)) {
      return this.block('view_join_not_allowed', '当前数据域不允许跨视图关联。', sql, parsed, fingerprint);
    }

    const permissionFailure = selectedViews.find((view) => !hasReadOnlySqlViewPermission(view, context));
    if (permissionFailure) {
      return this.block(
        'permission_denied',
        `缺少查询“${permissionFailure.label}”所需权限。`,
        sql,
        parsed,
        fingerprint,
      );
    }
    if (parsed.hasWildcard) return this.block('wildcard_not_allowed', '不允许 SELECT *。', sql, parsed, fingerprint);

    const unsupportedFunction = parsed.functions.find(
      (fn) => !ALLOWED_FUNCTIONS.has(fn.toLowerCase()) && !parsed.cteNames.includes(fn),
    );
    if (unsupportedFunction) {
      return this.block('function_not_allowed', `函数 ${unsupportedFunction} 未进入白名单。`, sql, parsed, fingerprint);
    }
    if (/:(?:startAt|endAt)\s*[+-]\s*INTERVAL\b/i.test(sql)) {
      return this.block(
        'ambiguous_interval_parameter_type',
        '日期参数参与 INTERVAL 运算前必须显式转换为与目录字段一致的 date 或 timestamp 类型。',
        sql,
        parsed,
        fingerprint,
      );
    }
    if (
      /(?:date_trunc|extract|coalesce|greatest|least)\s*\([^)]*:(?:startAt|endAt)(?!\s*::\s*(?:date|timestamp|timestamptz)\b)/i.test(
        sql,
      )
    ) {
      return this.block(
        'ambiguous_date_parameter_type',
        '日期参数作为函数参数时必须显式转换为与目录字段一致的 date、timestamp 或 timestamptz 类型。',
        sql,
        parsed,
        fingerprint,
      );
    }

    const policies = this.fieldPolicies(selectedViews);
    const aliases = new Set(parsed.aliases);
    const relationAliases = new Set(parsed.relations.map((relation) => relation.alias));
    const sourceViews = new Set(parsed.sourceViews);
    const cteNames = new Set(parsed.cteNames);
    const functionNames = new Set(parsed.functions);
    const fieldsToCheck = [...parsed.columns, ...parsed.referencedColumns]
      .map((column) => this.cleanColumn(column))
      .filter(
        (column) =>
          column &&
          !/^\d+(?:\.\d+)?$/.test(column) &&
          !aliases.has(column) &&
          !relationAliases.has(column) &&
          !sourceViews.has(column.toLowerCase()) &&
          !cteNames.has(column.toLowerCase()) &&
          !functionNames.has(column.toLowerCase()) &&
          !STRUCTURAL_IDENTIFIERS.has(column.toLowerCase()),
      );
    const unknownField = fieldsToCheck.find((column) => !policies.has(column));
    if (unknownField)
      return this.block('field_not_allowed', `字段 ${unknownField} 未进入问数目录。`, sql, parsed, fingerprint);
    const deniedField = fieldsToCheck.find((column) => policies.get(column) === 'deny');
    if (deniedField)
      return this.block('deny_field_selected', `字段 ${deniedField} 不允许查询。`, sql, parsed, fingerprint);
    const sensitiveField = fieldsToCheck.find((column) =>
      /(password|token|secret|phone(?!_last4)|openid|idcard|address|salary|remark)/i.test(column),
    );
    if (sensitiveField && policies.get(sensitiveField) !== 'mask') {
      return this.block('sensitive_field_selected', `字段 ${sensitiveField} 疑似敏感。`, sql, parsed, fingerprint);
    }

    const maxLimit = context.maxLimit ?? 100;
    if (parsed.limit !== undefined && (parsed.limit <= 0 || parsed.limit > maxLimit)) {
      return this.block('limit_exceeds_max', `查询数量必须在 1—${maxLimit} 之间。`, sql, parsed, fingerprint);
    }
    if (!context.storeIds.length && selectedViews.some((view) => view.storeScopeField)) {
      return this.block('missing_store_scope', '缺少授权门店范围。', sql, parsed, fingerprint);
    }

    const params = this.normalizeParams(context.parameters ?? {}, context);
    const rangeError = this.validateRange(params, context.maxRangeDays ?? 730);
    if (rangeError) return this.block('time_range_exceeded', rangeError, sql, parsed, fingerprint);

    let safeSql = sql.trim().replace(/;$/, '');
    if (parsed.cteNames.length) {
      const scoped = parsed.relations.every((relation) => this.hasCteStoreScope(safeSql, relation.alias));
      if (!scoped)
        return this.block(
          'cte_store_scope_missing',
          '受限 WITH 查询必须在每个数据源内显式使用授权门店参数。',
          sql,
          parsed,
          fingerprint,
        );
      const timed = parsed.relations.every((relation) => {
        const view = selectedViews.find((item) => item.viewName === relation.viewName);
        return (
          !view ||
          view.requiresTimeScope === false ||
          !view.defaultTimeField ||
          this.hasCteTimeScope(safeSql, relation.alias, view.defaultTimeField)
        );
      });
      if (!timed)
        return this.block(
          'cte_time_scope_missing',
          '受限 WITH 查询必须在每个时序数据源内显式使用开始和结束时间参数。',
          sql,
          parsed,
          fingerprint,
        );
    } else {
      safeSql = this.injectMandatoryScopes(safeSql, parsed.relations, selectedViews, params);
    }
    if (!parsed.hasLimit) safeSql = `${safeSql} LIMIT ${maxLimit}`;
    safeSql = `${safeSql};`;

    return {
      status: 'pass',
      safeSql,
      redactedSql: this.parser.redact(safeSql),
      params,
      selectedViews,
      parsed,
      appliedPolicies: [
        'select_only',
        'single_statement',
        'view_whitelist',
        'field_policy_checked',
        'permission_checked',
        parsed.cteNames.length ? 'cte_store_scope_verified' : 'store_scope_injected',
        'time_range_checked',
        parsed.hasLimit ? 'limit_checked' : 'limit_injected',
      ],
      sqlFingerprint: this.parser.fingerprint(safeSql),
    };
  }

  private fieldPolicies(views: ReadOnlySqlView[]) {
    const policies = new Map<string, string>();
    for (const view of views) {
      for (const field of view.fields) {
        const existing = policies.get(field.name);
        if (!existing || field.policy === 'deny' || (field.policy === 'mask' && existing === 'allow'))
          policies.set(field.name, field.policy);
      }
    }
    return policies;
  }

  private normalizeParams(input: Record<string, unknown>, context: ReadOnlySqlRequestContext) {
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      allowedStoreIds: context.storeIds,
      startAt: this.toIso(input.startAt) ?? defaultStart.toISOString(),
      endAt: this.toIso(input.endAt) ?? now.toISOString(),
      paidStatuses: ['paid', 'completed', '已付款', '已完成'],
    };
  }

  private validateRange(params: Record<string, unknown>, maxRangeDays: number) {
    const start = new Date(String(params.startAt));
    const end = new Date(String(params.endAt));
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end)
      return '查询时间范围无效。';
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    return days > maxRangeDays ? `查询时间范围不能超过 ${maxRangeDays} 天。` : '';
  }

  private injectMandatoryScopes(
    sql: string,
    relations: ReadOnlySqlRelation[],
    views: ReadOnlySqlView[],
    params: Record<string, unknown>,
  ) {
    const byName = new Map(views.map((view) => [view.viewName, view]));
    const fragments: string[] = [];
    for (const relation of relations) {
      const view = byName.get(relation.viewName);
      if (!view) continue;
      if (view.storeScopeField) fragments.push(`${relation.alias}.${view.storeScopeField} = ANY(:allowedStoreIds)`);
      if (view.requiresTimeScope !== false && view.defaultTimeField && params.startAt && params.endAt) {
        fragments.push(
          `${relation.alias}.${view.defaultTimeField} >= :startAt AND ${relation.alias}.${view.defaultTimeField} < :endAt`,
        );
      }
    }
    if (!fragments.length) return sql;
    const mandatory = fragments.join(' AND ');
    return this.topLevelClauses(sql).some((clause) => clause.name === 'where')
      ? this.wrapExistingWhere(sql, mandatory)
      : this.insertBeforeClauses(sql, `WHERE ${mandatory}`);
  }

  private wrapExistingWhere(sql: string, mandatory: string) {
    const clauses = this.topLevelClauses(sql);
    const whereMatch = clauses.find((clause) => clause.name === 'where');
    if (!whereMatch) return sql;
    const whereEnd = whereMatch.end;
    const beforeWhere = sql.slice(0, whereEnd);
    const trailingClause = clauses.find(
      (clause) => clause.index > whereMatch.index && ['group by', 'having', 'order by', 'limit'].includes(clause.name),
    );
    if (!trailingClause) return `${beforeWhere} ${mandatory} AND (${sql.slice(whereEnd).trim()})`;
    const predicate = sql.slice(whereEnd, trailingClause.index).trim();
    const trailingClauses = sql.slice(trailingClause.index).trim();
    return `${beforeWhere} ${mandatory} AND (${predicate}) ${trailingClauses}`;
  }

  private hasCteStoreScope(sql: string, alias: string) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:${escaped}\\.)?store_id\\s*=\\s*ANY\\s*\\(\\s*:allowedStoreIds\\s*\\)`, 'i').test(sql);
  }

  private hasCteTimeScope(sql: string, alias: string, field: string) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (
      new RegExp(`(?:${escapedAlias}\\.)?${escapedField}\\s*>=\\s*:startAt`, 'i').test(sql) &&
      new RegExp(`(?:${escapedAlias}\\.)?${escapedField}\\s*<\\s*:endAt`, 'i').test(sql)
    );
  }

  private insertBeforeClauses(sql: string, fragment: string) {
    const match = this.topLevelClauses(sql).find((clause) =>
      ['group by', 'having', 'order by', 'limit'].includes(clause.name),
    );
    if (!match) return `${sql} ${fragment}`;
    return `${sql.slice(0, match.index).trim()} ${fragment} ${sql.slice(match.index).trim()}`;
  }

  private topLevelClauses(sql: string) {
    const clauses: Array<{ name: string; index: number; end: number }> = [];
    let depth = 0;
    let quote: string | undefined;
    for (let index = 0; index < sql.length; index += 1) {
      const char = sql[index];
      if (quote) {
        if (char === quote) {
          if (sql[index + 1] === quote) index += 1;
          else quote = undefined;
        } else if (char === '\\') index += 1;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === '(') {
        depth += 1;
        continue;
      }
      if (char === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth !== 0 || !/[a-z_]/i.test(char)) continue;
      const wordStart = index;
      while (index + 1 < sql.length && /[a-z0-9_]/i.test(sql[index + 1])) index += 1;
      const word = sql.slice(wordStart, index + 1).toLowerCase();
      if (['where', 'having', 'limit'].includes(word)) {
        clauses.push({ name: word, index: wordStart, end: index + 1 });
        continue;
      }
      if (!['group', 'order'].includes(word)) continue;
      let nextStart = index + 1;
      while (nextStart < sql.length && /\s/.test(sql[nextStart])) nextStart += 1;
      let nextEnd = nextStart;
      while (nextEnd < sql.length && /[a-z0-9_]/i.test(sql[nextEnd])) nextEnd += 1;
      if (sql.slice(nextStart, nextEnd).toLowerCase() === 'by') {
        clauses.push({ name: `${word} by`, index: wordStart, end: nextEnd });
        index = nextEnd - 1;
      }
    }
    return clauses.sort((left, right) => left.index - right.index);
  }

  private toIso(value: unknown) {
    if (!value) return undefined;
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }

  private cleanColumn(column: string) {
    const unqualified = column.includes('.') ? (column.split('.').at(-1) ?? column) : column;
    // PostgreSQL's shorthand date cast is useful for grouping timestamp fields
    // by calendar day. Normalize only this explicitly supported cast so the
    // underlying catalog field is still checked; every other cast remains
    // unknown and is blocked by the field policy gate.
    return unqualified.replace(/::date$/i, '');
  }

  private block(
    reasonCode: string,
    message: string,
    sql: string,
    parsed: ReadOnlySqlParsed,
    fingerprint: string,
  ): ReadOnlySqlGuardResult {
    return {
      status: 'blocked',
      reasonCode,
      message,
      redactedSql: this.parser.redact(sql),
      parsed,
      appliedPolicies: [],
      sqlFingerprint: fingerprint,
    };
  }
}

export function hasReadOnlySqlViewPermission(
  view: ReadOnlySqlView,
  context: Pick<ReadOnlySqlRequestContext, 'permissions' | 'deniedPermissions'>,
) {
  const denied = new Set(context.deniedPermissions ?? []);
  if (view.requiredPermissions.some((permission) => denied.has(permission))) return false;
  if (context.permissions.includes('*')) return true;
  return view.permissionMode === 'any'
    ? view.requiredPermissions.some((permission) => context.permissions.includes(permission))
    : view.requiredPermissions.every((permission) => context.permissions.includes(permission));
}
