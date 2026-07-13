import { agentV2TextToSqlConfig } from './agent-v2-text-to-sql.config.js';

describe('agentV2TextToSqlConfig', () => {
  const keys = [
    'AGENT_V2_TEXT_TO_SQL_ENABLED',
    'AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY',
    'AGENT_V2_TEXT_TO_SQL_MAX_LIMIT',
    'AGENT_V2_TEXT_TO_SQL_TIMEOUT_MS',
    'AGENT_V2_TEXT_TO_SQL_MAX_RANGE_DAYS',
    'AGENT_V2_TEXT_TO_SQL_MAX_ESTIMATED_COST',
    'AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL',
  ];

  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    previous.clear();
    for (const key of keys) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults to disabled, admin-only and dry-run-only', () => {
    expect(agentV2TextToSqlConfig()).toEqual({
      enabled: false,
      adminOnly: true,
      maxLimit: 100,
      timeoutMs: 5000,
      maxRangeDays: 365,
      maxEstimatedCost: 100000,
      readonlyDatabaseUrl: undefined,
    });
  });

  it('reads explicit execution limits and readonly database URL', () => {
    process.env.AGENT_V2_TEXT_TO_SQL_ENABLED = 'true';
    process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY = 'false';
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_LIMIT = '25';
    process.env.AGENT_V2_TEXT_TO_SQL_TIMEOUT_MS = '1200';
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_RANGE_DAYS = '30';
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_ESTIMATED_COST = '2000';
    process.env.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL = 'postgresql://readonly.example/db';

    expect(agentV2TextToSqlConfig()).toEqual({
      enabled: true,
      adminOnly: false,
      maxLimit: 25,
      timeoutMs: 1200,
      maxRangeDays: 30,
      maxEstimatedCost: 2000,
      readonlyDatabaseUrl: 'postgresql://readonly.example/db',
    });
  });

  it('falls back to safe positive defaults for invalid numeric values', () => {
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_LIMIT = '-1';
    process.env.AGENT_V2_TEXT_TO_SQL_TIMEOUT_MS = '0';
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_RANGE_DAYS = 'abc';
    process.env.AGENT_V2_TEXT_TO_SQL_MAX_ESTIMATED_COST = 'NaN';

    const config = agentV2TextToSqlConfig();

    expect(config.maxLimit).toBe(100);
    expect(config.timeoutMs).toBe(5000);
    expect(config.maxRangeDays).toBe(365);
    expect(config.maxEstimatedCost).toBe(100000);
  });
});
