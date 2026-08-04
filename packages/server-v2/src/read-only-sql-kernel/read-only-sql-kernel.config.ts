export type ReadOnlySqlKernelConfig = {
  enabled: boolean;
  dryRunOnly: boolean;
  maxLimit: number;
  maxViews: number;
  timeoutMs: number;
  connectionTimeoutMs: number;
  maxRangeDays: number;
  maxEstimatedCost: number;
  readonlyDatabaseUrl?: string;
  connectionMode: 'dedicated_readonly' | 'development_admin' | 'unavailable';
};

export function readOnlySqlKernelConfig(env: NodeJS.ProcessEnv = process.env): ReadOnlySqlKernelConfig {
  const explicitReadonlyUrl = env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL?.trim();
  const useDevelopmentAdmin = env.ASK_DATA_FREE_SQL_DEV_USE_ADMIN_DATABASE_URL === 'true';
  if (useDevelopmentAdmin && env.NODE_ENV === 'production') {
    throw new Error('ASK_DATA_FREE_SQL_DEV_USE_ADMIN_DATABASE_URL is forbidden in production.');
  }
  const developmentAdminUrl = useDevelopmentAdmin ? env.DATABASE_URL?.trim() : undefined;
  const readonlyDatabaseUrl = explicitReadonlyUrl || developmentAdminUrl;
  return {
    enabled: env.ASK_DATA_FREE_SQL_ENABLED === 'true',
    dryRunOnly: env.ASK_DATA_FREE_SQL_DRY_RUN_ONLY !== 'false',
    maxLimit: positiveInt(env.ASK_DATA_FREE_SQL_MAX_LIMIT, 100),
    maxViews: positiveInt(env.ASK_DATA_FREE_SQL_MAX_VIEWS, 2),
    timeoutMs: positiveInt(env.ASK_DATA_FREE_SQL_TIMEOUT_MS, 5000),
    connectionTimeoutMs: positiveInt(env.ASK_DATA_FREE_SQL_CONNECTION_TIMEOUT_MS, 5000),
    maxRangeDays: positiveInt(env.ASK_DATA_FREE_SQL_MAX_RANGE_DAYS, 730),
    maxEstimatedCost: positiveInt(env.ASK_DATA_FREE_SQL_MAX_ESTIMATED_COST, 100),
    readonlyDatabaseUrl,
    connectionMode: explicitReadonlyUrl
      ? 'dedicated_readonly'
      : developmentAdminUrl
        ? 'development_admin'
        : 'unavailable',
  };
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
