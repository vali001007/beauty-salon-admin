export type AgentV2TextToSqlConfig = {
  enabled: boolean;
  adminOnly: boolean;
  maxLimit: number;
  timeoutMs: number;
  maxRangeDays: number;
  maxEstimatedCost: number;
  readonlyDatabaseUrl?: string;
};

export function agentV2TextToSqlConfig(): AgentV2TextToSqlConfig {
  return {
    enabled: process.env.AGENT_V2_TEXT_TO_SQL_ENABLED === 'true',
    adminOnly: process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY !== 'false',
    maxLimit: positiveInt(process.env.AGENT_V2_TEXT_TO_SQL_MAX_LIMIT, 100),
    timeoutMs: positiveInt(process.env.AGENT_V2_TEXT_TO_SQL_TIMEOUT_MS, 5000),
    maxRangeDays: positiveInt(process.env.AGENT_V2_TEXT_TO_SQL_MAX_RANGE_DAYS, 365),
    maxEstimatedCost: positiveInt(process.env.AGENT_V2_TEXT_TO_SQL_MAX_ESTIMATED_COST, 100000),
    readonlyDatabaseUrl: process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL,
  };
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
