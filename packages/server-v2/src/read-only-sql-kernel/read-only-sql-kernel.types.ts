export type ReadOnlySqlFieldPolicy = 'allow' | 'mask' | 'deny';

export type ReadOnlySqlField = {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  policy: ReadOnlySqlFieldPolicy;
};

export type ReadOnlySqlView = {
  viewName: string;
  label: string;
  domain: string;
  description: string;
  keywords?: string[];
  dataPolicy?: string;
  noDataHint?: string;
  freshnessField?: string;
  requiredPermissions: string[];
  permissionMode?: 'all' | 'any';
  storeScopeField?: string;
  defaultTimeField?: string;
  requiresTimeScope?: boolean;
  fields: ReadOnlySqlField[];
  allowJoin?: boolean;
};

export type ReadOnlySqlRequestContext = {
  storeIds: number[];
  permissions: string[];
  deniedPermissions?: string[];
  maxLimit?: number;
  maxViews?: number;
  maxRangeDays?: number;
  question?: string;
  parameters?: Record<string, unknown>;
};

export type ReadOnlySqlRelation = {
  viewName: string;
  alias: string;
};

export type ReadOnlySqlParsed = {
  statementType: 'select';
  columns: string[];
  referencedColumns: string[];
  aliases: string[];
  sourceViews: string[];
  relations: ReadOnlySqlRelation[];
  cteNames: string[];
  functions: string[];
  hasWildcard: boolean;
  hasLimit: boolean;
  limit?: number;
  hasWhere: boolean;
  hasGroupBy: boolean;
  hasOrderBy: boolean;
  hasJoin: boolean;
  tokens: string[];
};

export type ReadOnlySqlGuardResult =
  | {
      status: 'pass';
      safeSql: string;
      redactedSql: string;
      params: Record<string, unknown>;
      selectedViews: ReadOnlySqlView[];
      parsed: ReadOnlySqlParsed;
      appliedPolicies: string[];
      sqlFingerprint: string;
    }
  | {
      status: 'blocked';
      reasonCode: string;
      message: string;
      redactedSql?: string;
      parsed?: ReadOnlySqlParsed;
      appliedPolicies: string[];
      sqlFingerprint?: string;
    };

export type ReadOnlySqlExecutionResult = {
  status: 'success' | 'no_data' | 'blocked' | 'failed';
  rows: Array<Record<string, unknown>>;
  executionMs: number;
  blockedReason?: string;
  errorMessage?: string;
  truncated?: boolean;
};
