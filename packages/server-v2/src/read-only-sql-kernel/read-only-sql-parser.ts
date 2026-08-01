import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ReadOnlySqlParsed, ReadOnlySqlRelation } from './read-only-sql-kernel.types.js';

export type ReadOnlySqlParseResult =
  | { status: 'parsed'; parsed: ReadOnlySqlParsed }
  | { status: 'blocked'; reasonCode: string; message: string };

const SQL_KEYWORDS = new Set([
  'and',
  'or',
  'not',
  'null',
  'is',
  'in',
  'any',
  'all',
  'between',
  'like',
  'ilike',
  'as',
  'asc',
  'desc',
  'nulls',
  'first',
  'last',
  'true',
  'false',
  'by',
  'on',
  'case',
  'when',
  'then',
  'else',
  'end',
  'distinct',
  'filter',
  'over',
  'partition',
  'interval',
  'current_date',
  'current_timestamp',
]);

const FORBIDDEN_KEYWORDS = new Set([
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'truncate',
  'grant',
  'revoke',
  'copy',
  'call',
  'do',
  'execute',
  'merge',
  'refresh',
  'vacuum',
  'analyze',
  'set',
  'reset',
  'begin',
  'commit',
  'rollback',
  'transaction',
  'into',
  'returning',
  'security',
]);

const DANGEROUS_FUNCTIONS = new Set([
  'pg_read_file',
  'pg_ls_dir',
  'dblink_connect',
  'dblink_exec',
  'lo_import',
  'lo_export',
  'set_config',
  'current_setting',
  'pg_sleep',
  'query_to_xml',
  'xpath',
  'json_populate_record',
]);

@Injectable()
export class ReadOnlySqlParser {
  parse(sql: string): ReadOnlySqlParseResult {
    const tokens = this.tokenize(sql);
    if (!tokens.length) return this.block('empty_sql', 'SQL 为空。');
    if (tokens.includes('--') || tokens.includes('/*') || tokens.includes('*/')) {
      return this.block('sql_comment_not_allowed', '不允许 SQL 注释。');
    }
    if (this.hasMultipleStatements(tokens))
      return this.block('multiple_statements_not_allowed', '只能执行单条只读查询。');

    const lowered = tokens.map((token) => token.toLowerCase());
    if (lowered[0] === 'with' && lowered[1] === 'recursive')
      return this.block('recursive_cte_not_allowed', '不允许递归 WITH 查询。');
    const forbidden = lowered.find((token) => FORBIDDEN_KEYWORDS.has(token));
    if (forbidden) return this.block('write_or_ddl_not_allowed', `不允许执行 ${forbidden.toUpperCase()}。`);
    if (lowered.some((token) => ['union', 'intersect', 'except'].includes(token)))
      return this.block('set_operation_not_allowed', '不允许集合查询。');
    // The first phase does not have a full SQL AST. Reject OR so mandatory
    // store/time predicates cannot be bypassed by boolean precedence.
    if (lowered.includes('or'))
      return this.block('boolean_or_not_allowed', '首期查询不支持 OR 条件，请改用 IN 或 ANY。');

    const cteNames = this.extractCteNames(tokens, lowered);
    if (cteNames.length > 1) return this.block('too_many_ctes', '首期最多允许一个受限 WITH。');
    const selectCount = lowered.filter((token) => token === 'select').length;
    if (selectCount !== cteNames.length + 1)
      return this.block('nested_query_not_allowed', '不允许未登记的嵌套子查询。');
    if (lowered.some((token, index) => ['from', 'join'].includes(token) && tokens[index + 1] === '(')) {
      return this.block('derived_table_not_allowed', '不允许 FROM 或 JOIN 子查询。');
    }
    const firstStatementToken = lowered[0] === 'with' ? 'with' : lowered[0];
    if (!['select', 'with'].includes(firstStatementToken) || !lowered.includes('select')) {
      return this.block('select_only', '只允许 SELECT 或受限 WITH 查询。');
    }

    const relations = this.extractRelations(tokens, lowered, new Set(cteNames));
    if (!relations.length) return this.block('missing_source_view', '缺少查询视图。');
    const functions = this.extractFunctions(tokens);
    const dangerousFunction = functions.find((fn) => DANGEROUS_FUNCTIONS.has(fn.toLowerCase()));
    if (dangerousFunction) return this.block('dangerous_function_not_allowed', `不允许函数 ${dangerousFunction}。`);

    const selectIndex = this.findTopLevelSelectIndex(tokens);
    const fromIndex = this.findTopLevelFromIndex(tokens, selectIndex);
    const columns = fromIndex >= 0 ? this.extractColumns(tokens.slice(selectIndex + 1, fromIndex)) : [];
    const selectReferencedColumns =
      fromIndex >= 0 ? this.extractExpressionIdentifiers(tokens.slice(selectIndex + 1, fromIndex)) : [];
    const limit = this.extractLimit(tokens, lowered);
    const aliases = this.extractAliases(tokens, lowered);
    return {
      status: 'parsed',
      parsed: {
        statementType: 'select',
        columns,
        referencedColumns: [
          ...new Set([...selectReferencedColumns, ...this.extractReferencedColumns(tokens, lowered)]),
        ],
        aliases,
        sourceViews: [...new Set(relations.map((relation) => relation.viewName))],
        relations,
        cteNames,
        functions,
        hasWildcard: columns.some((column) => column === '*' || column.endsWith('.*')),
        hasLimit: limit !== undefined,
        limit,
        hasWhere: lowered.includes('where'),
        hasGroupBy: this.hasKeywordSequence(lowered, ['group', 'by']),
        hasOrderBy: this.hasKeywordSequence(lowered, ['order', 'by']),
        hasJoin: lowered.includes('join'),
        tokens,
      },
    };
  }

  fingerprint(sql: string) {
    return createHash('sha256').update(this.redact(sql).replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex');
  }

  redact(sql: string) {
    return sql.replace(/'[^']*'/g, "'***'").replace(/\b1[3-9]\d{9}\b/g, '***phone***');
  }

  private tokenize(sql: string) {
    const tokens: string[] = [];
    let current = '';
    let quote: string | null = null;
    for (let index = 0; index < sql.length; index += 1) {
      const char = sql[index];
      const next = sql[index + 1];
      if (!quote && char === '-' && next === '-') {
        if (current) tokens.push(current);
        tokens.push('--');
        index += 1;
        continue;
      }
      if (!quote && char === '/' && next === '*') {
        if (current) tokens.push(current);
        tokens.push('/*');
        index += 1;
        continue;
      }
      if (!quote && char === '*' && next === '/') {
        if (current) tokens.push(current);
        tokens.push('*/');
        index += 1;
        continue;
      }
      if (quote) {
        current += char;
        if (char === quote && sql[index - 1] !== '\\') {
          tokens.push(current);
          current = '';
          quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        if (current) tokens.push(current);
        current = char;
        quote = char;
        continue;
      }
      if (/\s/.test(char)) {
        if (current) tokens.push(current);
        current = '';
        continue;
      }
      if (',();'.includes(char)) {
        if (current) tokens.push(current);
        tokens.push(char);
        current = '';
        continue;
      }
      current += char;
    }
    if (current) tokens.push(current);
    return tokens;
  }

  private hasMultipleStatements(tokens: string[]) {
    const semicolons = tokens.filter((token) => token === ';');
    return semicolons.length > 1 || (semicolons.length === 1 && tokens.at(-1) !== ';');
  }

  private extractCteNames(tokens: string[], lowered: string[]) {
    if (lowered[0] !== 'with') return [];
    const names: string[] = [];
    let depth = 0;
    for (let index = 1; index < tokens.length - 1; index += 1) {
      if (tokens[index] === '(') depth += 1;
      if (tokens[index] === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && lowered[index + 1] === 'as' && this.isIdentifier(tokens[index])) {
        names.push(this.normalizeIdentifier(tokens[index]).toLowerCase());
      }
    }
    return [...new Set(names)];
  }

  private extractRelations(tokens: string[], lowered: string[], cteNames: Set<string>): ReadOnlySqlRelation[] {
    const relations: ReadOnlySqlRelation[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      if (!['from', 'join'].includes(lowered[index])) continue;
      const viewName = this.normalizeIdentifier(tokens[index + 1] ?? '').toLowerCase();
      if (!this.isIdentifier(viewName) || cteNames.has(viewName)) continue;
      let alias = viewName;
      const possibleAlias = this.normalizeIdentifier(tokens[index + 2] ?? '');
      if (lowered[index + 2] === 'as')
        alias = this.normalizeIdentifier(tokens[index + 3] ?? '').toLowerCase() || viewName;
      else if (
        this.isIdentifier(possibleAlias) &&
        !SQL_KEYWORDS.has(possibleAlias.toLowerCase()) &&
        !['from', 'join', 'where', 'group', 'order', 'limit', 'on'].includes(possibleAlias.toLowerCase())
      )
        alias = possibleAlias.toLowerCase();
      relations.push({ viewName, alias });
    }
    return relations;
  }

  private findTopLevelSelectIndex(tokens: string[]) {
    let depth = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] === '(') depth += 1;
      if (tokens[index] === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && tokens[index].toLowerCase() === 'select') return index;
    }
    return -1;
  }

  private findTopLevelFromIndex(tokens: string[], startIndex: number) {
    let depth = 0;
    for (let index = Math.max(0, startIndex); index < tokens.length; index += 1) {
      if (tokens[index] === '(') depth += 1;
      if (tokens[index] === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && tokens[index].toLowerCase() === 'from') return index;
    }
    return -1;
  }

  private extractColumns(tokens: string[]) {
    return this.splitByComma(tokens)
      .map((parts) => this.extractColumnIdentifier(parts))
      .filter(Boolean);
  }

  private extractColumnIdentifier(parts: string[]) {
    const first = parts[0] ?? '';
    const second = parts[1]?.toLowerCase() ?? '';
    if (/^[a-z_][a-z0-9_]*$/i.test(first) && parts[1] === '(') {
      const closeIndex = parts.indexOf(')');
      const args = parts
        .slice(2, closeIndex > 1 ? closeIndex : undefined)
        .map((part) => this.normalizeIdentifier(part))
        .filter((part) => part && part !== ',' && part !== '*' && !/^'.*'$/.test(part));
      return args[0] ?? '';
    }
    if (second === 'as') return this.normalizeIdentifier(first);
    return this.normalizeIdentifier(first);
  }

  private extractAliases(tokens: string[], lowered: string[]) {
    const aliases: string[] = [];
    for (let index = 0; index < tokens.length - 1; index += 1) {
      if (lowered[index] === 'as' && this.isIdentifier(tokens[index + 1]))
        aliases.push(this.normalizeIdentifier(tokens[index + 1]));
    }
    return [...new Set(aliases)];
  }

  private extractExpressionIdentifiers(tokens: string[]) {
    return tokens
      .map((token) => this.normalizeIdentifier(token))
      .filter((token) => this.isColumnReference(token, token.toLowerCase()))
      .map((token) => this.cleanColumnIdentifier(token));
  }

  private extractReferencedColumns(tokens: string[], lowered: string[]) {
    return [
      ...new Set([
        ...this.extractClauseIdentifiers(tokens, lowered, 'where', ['group', 'order', 'limit', ';']),
        ...this.extractClauseIdentifiers(tokens, lowered, 'group', ['order', 'limit', ';']),
        ...this.extractClauseIdentifiers(tokens, lowered, 'order', ['limit', ';']),
        ...this.extractClauseIdentifiers(tokens, lowered, 'having', ['order', 'limit', ';']),
        ...this.extractClauseIdentifiers(tokens, lowered, 'on', ['where', 'group', 'order', 'limit', ';']),
      ]),
    ];
  }

  private extractClauseIdentifiers(tokens: string[], lowered: string[], startKeyword: string, stopKeywords: string[]) {
    const startIndex = lowered.indexOf(startKeyword);
    if (startIndex < 0) return [];
    let start = startIndex + 1;
    if (startKeyword === 'group' || startKeyword === 'order') {
      if (lowered[start] === 'by') start += 1;
    }
    const identifiers: string[] = [];
    for (let index = start; index < tokens.length; index += 1) {
      const loweredToken = lowered[index];
      if (stopKeywords.includes(loweredToken)) break;
      const normalized = this.normalizeIdentifier(tokens[index]);
      if (this.isColumnReference(normalized, loweredToken)) identifiers.push(this.cleanColumnIdentifier(normalized));
    }
    return identifiers.filter(Boolean);
  }

  private extractFunctions(tokens: string[]) {
    const functions: string[] = [];
    for (let index = 0; index < tokens.length - 1; index += 1) {
      if (
        tokens[index + 1] === '(' &&
        /^[a-z_][a-z0-9_]*$/i.test(tokens[index]) &&
        !SQL_KEYWORDS.has(tokens[index].toLowerCase())
      ) {
        functions.push(tokens[index].toLowerCase());
      }
    }
    return [...new Set(functions)];
  }

  private extractLimit(tokens: string[], lowered: string[]) {
    const index = lowered.lastIndexOf('limit');
    if (index < 0) return undefined;
    const parsed = Number(tokens[index + 1]);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
  }

  private splitByComma(tokens: string[]) {
    const chunks: string[][] = [];
    let current: string[] = [];
    let depth = 0;
    for (const token of tokens) {
      if (token === '(') depth += 1;
      if (token === ')') depth = Math.max(0, depth - 1);
      if (token === ',' && depth === 0) {
        chunks.push(current);
        current = [];
      } else current.push(token);
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  private normalizeIdentifier(value: string) {
    return value
      .replace(/^"+|"+$/g, '')
      .replace(/;$/, '')
      .trim();
  }

  private cleanColumnIdentifier(value: string) {
    return value.includes('.') ? (value.split('.').at(-1) ?? value) : value;
  }

  private isColumnReference(normalized: string, loweredToken: string) {
    if (!this.isIdentifier(normalized) || SQL_KEYWORDS.has(loweredToken)) return false;
    if (normalized.startsWith(':') || /^'.*'$/.test(normalized) || /^\d/.test(normalized)) return false;
    if (normalized.includes('.') && normalized.split('.').every((part) => this.isIdentifier(part))) return true;
    return !['where', 'group', 'order', 'limit', 'having', 'join', 'on'].includes(loweredToken);
  }

  private isIdentifier(value: string) {
    return /^[a-z_][a-z0-9_.]*$/i.test(value);
  }

  private hasKeywordSequence(tokens: string[], sequence: string[]) {
    return tokens.some((_, index) => sequence.every((part, offset) => tokens[index + offset] === part));
  }

  private block(reasonCode: string, message: string): ReadOnlySqlParseResult {
    return { status: 'blocked', reasonCode, message };
  }
}
