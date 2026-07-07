export type AgentV3TextToSqlConfig = {
  enabled: boolean;
  adminOnly: boolean;
  dryRunOnly: boolean;
  maxLimit: number;
  timeoutMs: number;
  maxRangeDays: number;
  maxEstimatedCost: number;
  readonlyDatabaseUrl?: string;
};

export function agentV3TextToSqlConfig(): AgentV3TextToSqlConfig {
  return {
    enabled: process.env.AGENT_V3_TEXT_TO_SQL_ENABLED !== 'false',
    adminOnly: process.env.AGENT_V3_TEXT_TO_SQL_ADMIN_ONLY !== 'false',
    dryRunOnly: process.env.AGENT_V3_SQL_DRY_RUN_ONLY !== 'false',
    maxLimit: positiveInt(process.env.AGENT_V3_TEXT_TO_SQL_MAX_LIMIT, 100),
    timeoutMs: positiveInt(process.env.AGENT_V3_TEXT_TO_SQL_TIMEOUT_MS, 5000),
    maxRangeDays: positiveInt(process.env.AGENT_V3_TEXT_TO_SQL_MAX_RANGE_DAYS, 730),
    maxEstimatedCost: positiveInt(process.env.AGENT_V3_TEXT_TO_SQL_MAX_ESTIMATED_COST, 100000),
    readonlyDatabaseUrl: process.env.AGENT_V3_READONLY_DATABASE_URL ?? process.env.AGENT_V3_TEXT_TO_SQL_READONLY_DATABASE_URL,
  };
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
