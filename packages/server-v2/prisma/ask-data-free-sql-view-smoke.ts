import 'dotenv/config';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';
import { ReadOnlySqlExecutor } from '../src/read-only-sql-kernel/read-only-sql-executor.js';
import { ReadOnlySqlGuard } from '../src/read-only-sql-kernel/read-only-sql-guard.js';
import { ReadOnlySqlParser } from '../src/read-only-sql-kernel/read-only-sql-parser.js';

const strict = process.argv.includes('--strict');
const allowDevelopmentAdmin = process.argv.includes('--allow-development-admin');
const storeId = positiveInt(argumentValue('--store-id='), 6);
const concurrency = positiveInt(argumentValue('--concurrency='), 4);
const dedicatedReadonlyUrl = process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL?.trim();
const developmentAdminUrl = allowDevelopmentAdmin ? process.env.DATABASE_URL?.trim() : undefined;
const connectionString = dedicatedReadonlyUrl || developmentAdminUrl;
const connectionMode = dedicatedReadonlyUrl
  ? 'dedicated_readonly'
  : developmentAdminUrl
    ? 'development_admin'
    : 'unavailable';

if (allowDevelopmentAdmin && process.env.NODE_ENV === 'production') {
  printAndFail({ status: 'fail', reason: 'development_admin_database_forbidden_in_production' });
} else if (!connectionString) {
  const result = { status: strict ? 'fail' : 'skip', reason: 'readonly_database_url_missing' };
  console.log(JSON.stringify(result, null, 2));
  if (strict) process.exitCode = 1;
} else {
  const databaseUrl = new URL(connectionString);
  if (!isApprovedSupabaseHost(databaseUrl.hostname)) {
    printAndFail({ status: 'fail', reason: 'unapproved_database_host', databaseHost: databaseUrl.hostname });
  } else {
    const parser = new ReadOnlySqlParser();
    const guard = new ReadOnlySqlGuard(parser);
    const executor = new ReadOnlySqlExecutor();
    const now = new Date();
    const startAt = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString();
    const endAt = now.toISOString();
    const results = await mapWithConcurrency(ASK_DATA_FREE_SQL_VIEWS, concurrency, async (view) => {
      const selectedFields = ['store_id', view.defaultTimeField]
        .filter((field): field is string => Boolean(field))
        .filter((field, index, fields) => fields.indexOf(field) === index);
      const sql = `SELECT ${selectedFields.map((field) => `v.${field}`).join(', ')} FROM ${view.viewName} v LIMIT 1`;
      const guarded = guard.inspect(sql, ASK_DATA_FREE_SQL_VIEWS, {
        storeIds: [storeId],
        permissions: ['*'],
        deniedPermissions: [],
        maxLimit: 100,
        maxViews: 2,
        maxRangeDays: 730,
        parameters: { startAt, endAt },
      });
      if (guarded.status === 'blocked') {
        return { viewName: view.viewName, status: 'guard_blocked', reasonCode: guarded.reasonCode };
      }
      const execution = await executor.execute({
        guard: guarded,
        connectionString,
        timeoutMs: 5000,
        maxRows: 1,
        dryRunOnly: false,
      });
      return {
        viewName: view.viewName,
        status: execution.status,
        rowCount: execution.rows.length,
        executionMs: execution.executionMs,
        reasonCode: execution.blockedReason,
      };
    });

    const passed = results.filter((item) => item.status === 'success' || item.status === 'no_data').length;
    const report = {
      status: passed === ASK_DATA_FREE_SQL_VIEWS.length ? 'pass' : 'fail',
      strict,
      concurrency,
      connectionMode,
      databaseHost: databaseUrl.hostname,
      registeredViewCount: ASK_DATA_FREE_SQL_VIEWS.length,
      passed,
      failed: ASK_DATA_FREE_SQL_VIEWS.length - passed,
      results,
    };
    console.log(JSON.stringify(report, null, 2));
    if (strict && report.status !== 'pass') process.exitCode = 1;
  }
}

function argumentValue(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function isApprovedSupabaseHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized.endsWith('.supabase.com') || normalized.endsWith('.supabase.co');
}

function printAndFail(result: Record<string, unknown>) {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
