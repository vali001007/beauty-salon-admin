import { Injectable } from '@nestjs/common';
import {
  AGENT_V3_TEXT_TO_SQL_DANGEROUS_FUNCTIONS,
  AGENT_V3_TEXT_TO_SQL_FORBIDDEN_SQL_KEYWORDS,
} from './agent-v3-text-to-sql.constants.js';
import type { AgentV3ParsedSelectSql } from './agent-v3-text-to-sql.types.js';

export type AgentV3SqlParseResult =
  | { status: 'parsed'; parsed: AgentV3ParsedSelectSql }
  | { status: 'blocked'; reasonCode: string; message: string };

@Injectable()
export class AgentV3SqlAstParserService {
  parse(sql: string): AgentV3SqlParseResult {
    const tokens = this.tokenize(sql);
    if (!tokens.length) return this.blocked('empty_sql', 'SQL 为空。');
    if (this.hasMultipleStatements(tokens)) return this.blocked('multiple_statements_not_allowed', '只能执行单条 SELECT。');
    const lowered = tokens.map((token) => token.toLowerCase());
    const forbidden = lowered.find((token) => AGENT_V3_TEXT_TO_SQL_FORBIDDEN_SQL_KEYWORDS.has(token));
    if (forbidden) return this.blocked('write_or_ddl_not_allowed', `不允许执行 ${forbidden.toUpperCase()}。`);
    if (lowered[0] !== 'select') return this.blocked('select_only', '只允许 SELECT 查询。');
    if (lowered.includes('union')) return this.blocked('union_not_allowed', '不允许 UNION 查询。');
    if (lowered.includes('--') || lowered.includes('/*') || lowered.includes('*/')) {
      return this.blocked('sql_comment_not_allowed', '不允许 SQL 注释。');
    }

    const fromIndex = this.findTopLevelFromIndex(lowered);
    if (fromIndex < 0) return this.blocked('missing_from', '缺少 FROM。');
    const columns = this.extractColumns(tokens.slice(1, fromIndex));
    const sourceViews = this.extractSourceViews(tokens, lowered);
    if (!sourceViews.length) return this.blocked('missing_source_view', '缺少查询视图。');
    const functions = this.extractFunctions(tokens);
    const dangerousFunction = functions.find((fn) => AGENT_V3_TEXT_TO_SQL_DANGEROUS_FUNCTIONS.has(fn.toLowerCase()));
    if (dangerousFunction) return this.blocked('dangerous_function_not_allowed', `不允许函数 ${dangerousFunction}。`);
    const limit = this.extractLimit(tokens, lowered);

    return {
      status: 'parsed',
      parsed: {
        statementType: 'select',
        columns,
        referencedColumns: this.extractReferencedColumns(tokens, lowered),
        sourceViews,
        functions,
        hasWildcard: columns.some((column) => column === '*' || column.endsWith('.*')),
        hasLimit: limit !== undefined,
        limit,
        hasWhere: lowered.includes('where'),
        hasGroupBy: this.hasKeywordSequence(lowered, ['group', 'by']),
        hasOrderBy: this.hasKeywordSequence(lowered, ['order', 'by']),
        tokens,
      },
    };
  }

  private tokenize(sql: string) {
    const tokens: string[] = [];
    let current = '';
    let quote: string | null = null;
    for (let index = 0; index < sql.length; index += 1) {
      const char = sql[index];
      const next = sql[index + 1];
      if (!quote && char === '-' && next === '-') {
        tokens.push('--');
        index += 1;
        continue;
      }
      if (!quote && char === '/' && next === '*') {
        tokens.push('/*');
        index += 1;
        continue;
      }
      if (!quote && char === '*' && next === '/') {
        tokens.push('*/');
        index += 1;
        continue;
      }
      if (quote) {
        current += char;
        if (char === quote) {
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
    if (semicolons.length > 1) return true;
    if (semicolons.length === 1 && tokens[tokens.length - 1] !== ';') return true;
    return false;
  }

  private extractColumns(tokens: string[]) {
    return this.splitByComma(tokens)
      .map((parts) => this.extractColumnIdentifier(parts))
      .filter(Boolean);
  }

  private extractColumnIdentifier(parts: string[]) {
    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    if (/^[a-z_][a-z0-9_]*$/i.test(first) && second === '(') {
      const closeIndex = parts.indexOf(')');
      const args = parts.slice(2, closeIndex > 1 ? closeIndex : undefined)
        .map((part) => this.normalizeIdentifier(part))
        .filter((part) => part && part !== ',' && part !== '*' && !/^'.*'$/.test(part));
      return args[0] ?? '';
    }
    return this.normalizeIdentifier(first);
  }

  private extractSourceViews(tokens: string[], lowered: string[]) {
    const sourceViews: string[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const loweredToken = lowered[index];
      if (['from', 'join'].includes(loweredToken)) {
        const next = this.normalizeIdentifier(tokens[index + 1] ?? '');
        if (this.isIdentifier(next)) sourceViews.push(next);
      }
    }
    return [...new Set(sourceViews)];
  }

  private extractReferencedColumns(tokens: string[], lowered: string[]) {
    return [...new Set([
      ...this.extractClauseIdentifiers(tokens, lowered, 'where', ['group', 'order', 'limit', ';']),
      ...this.extractClauseIdentifiers(tokens, lowered, 'group', ['order', 'limit', ';']),
    ])];
  }

  private extractClauseIdentifiers(tokens: string[], lowered: string[], startKeyword: string, stopKeywords: string[]) {
    const startIndex = lowered.indexOf(startKeyword);
    if (startIndex < 0) return [];
    let start = startIndex + 1;
    if (startKeyword === 'group' && lowered[start] === 'by') start += 1;
    const identifiers: string[] = [];
    for (let index = start; index < tokens.length; index += 1) {
      const loweredToken = lowered[index];
      if (stopKeywords.includes(loweredToken)) break;
      const normalized = this.normalizeIdentifier(tokens[index]);
      if (this.isColumnReference(normalized, loweredToken)) identifiers.push(this.cleanColumnIdentifier(normalized));
    }
    return identifiers.filter(Boolean);
  }

  private isColumnReference(normalized: string, loweredToken: string) {
    if (!this.isIdentifier(normalized)) return false;
    if (this.sqlKeywords().has(loweredToken)) return false;
    if (/^(agent_v3_|system:)/i.test(normalized)) return false;
    if (normalized.startsWith(':')) return false;
    return true;
  }

  private cleanColumnIdentifier(value: string) {
    return value.includes('.') ? value.split('.').at(-1) ?? value : value;
  }

  private findTopLevelFromIndex(tokens: string[]) {
    let depth = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === '(') depth += 1;
      if (token === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && token === 'from') return index;
    }
    return -1;
  }

  private extractFunctions(tokens: string[]) {
    const functions: string[] = [];
    for (let index = 0; index < tokens.length - 1; index += 1) {
      if (tokens[index + 1] === '(' && /^[a-z_][a-z0-9_]*$/i.test(tokens[index])) functions.push(tokens[index].toLowerCase());
    }
    return functions;
  }

  private extractLimit(tokens: string[], lowered: string[]) {
    const index = lowered.indexOf('limit');
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
      } else {
        current.push(token);
      }
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  private normalizeIdentifier(value: string) {
    return value.replace(/^"+|"+$/g, '').replace(/;$/, '').trim();
  }

  private isIdentifier(value: string) {
    return /^[a-z_][a-z0-9_.]*$/i.test(value);
  }

  private sqlKeywords() {
    return new Set([
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
      'true',
      'false',
      'by',
      'on',
    ]);
  }

  private hasKeywordSequence(tokens: string[], sequence: string[]) {
    return tokens.some((_, index) => sequence.every((part, offset) => tokens[index + offset] === part));
  }

  private blocked(reasonCode: string, message: string): AgentV3SqlParseResult {
    return { status: 'blocked', reasonCode, message };
  }
}
