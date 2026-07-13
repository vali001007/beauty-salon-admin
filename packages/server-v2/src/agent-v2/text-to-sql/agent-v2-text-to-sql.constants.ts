export const AGENT_V2_TEXT_TO_SQL_FORBIDDEN_SQL_KEYWORDS = new Set([
  'alter',
  'copy',
  'create',
  'delete',
  'drop',
  'execute',
  'grant',
  'insert',
  'merge',
  'revoke',
  'truncate',
  'update',
]);

export const AGENT_V2_TEXT_TO_SQL_DANGEROUS_FUNCTIONS = new Set([
  'pg_sleep',
  'dblink',
  'lo_import',
  'lo_export',
]);

export const AGENT_V2_TEXT_TO_SQL_DEFAULT_LIMIT = 50;
