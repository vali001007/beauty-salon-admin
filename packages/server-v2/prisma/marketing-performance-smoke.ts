import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  buildMarketingPerformanceRequestPlan,
  evaluateMarketingReadPerformance,
  resolveRecommendationInstanceId,
  sampleReadEndpoint,
} from '../src/marketing/performance/marketing-performance-gate.ts';

config({ path: resolve(import.meta.dirname, '..', '.env') });

type MarketingPerformanceCliOptions = {
  baseUrl: string;
  token: string;
  storeId: number;
  instanceId?: string;
  iterations?: number;
  warmup?: number;
};

function parseNamedArgs() {
  const values = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.slice(2).split('=');
    values.set(key, value.join('='));
  }
  return values;
}

function parsePositiveInteger(value: string | undefined, name: string, required: boolean) {
  if (!value && !required) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, name: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function parseOptions(): MarketingPerformanceCliOptions {
  const args = parseNamedArgs();
  const token = String(args.get('token') ?? process.env.MARKETING_PERF_TOKEN ?? '').trim();
  if (!token) throw new Error('MARKETING_PERF_TOKEN is required');
  const storeId = parsePositiveInteger(
    args.get('store-id') ?? process.env.MARKETING_PERF_STORE_ID,
    'MARKETING_PERF_STORE_ID',
    true,
  );
  return {
    baseUrl: String(
      args.get('base-url') ?? process.env.MARKETING_PERF_BASE_URL ?? 'http://127.0.0.1:8080/api',
    ).replace(/\/+$/, ''),
    token,
    storeId: storeId!,
    instanceId: String(args.get('instance-id') ?? process.env.MARKETING_PERF_INSTANCE_ID ?? '').trim() || undefined,
    iterations: parsePositiveInteger(
      args.get('iterations') ?? process.env.MARKETING_PERF_ITERATIONS,
      'MARKETING_PERF_ITERATIONS',
      false,
    ),
    warmup: parseNonNegativeInteger(
      args.get('warmup') ?? process.env.MARKETING_PERF_WARMUP,
      'MARKETING_PERF_WARMUP',
    ),
  };
}

async function requestJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { method: 'GET', headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`Marketing performance discovery failed: HTTP ${response.status}${text ? ` ${text}` : ''}`);
  return text ? JSON.parse(text) as unknown : null;
}

async function resolveInstanceId(options: MarketingPerformanceCliOptions) {
  if (options.instanceId) return options.instanceId;
  if (!/^https?:\/\//.test(options.baseUrl)) throw new Error('MARKETING_PERF_BASE_URL must use http or https');
  const payload = await requestJson(
    `${options.baseUrl}/marketing/recommendation-instances?page=1&pageSize=1`,
    { Authorization: `Bearer ${options.token}`, 'X-Store-Id': String(options.storeId) },
  );
  return resolveRecommendationInstanceId(payload);
}

async function main() {
  const options = parseOptions();
  const instanceId = await resolveInstanceId(options);
  const plan = buildMarketingPerformanceRequestPlan({ ...options, instanceId });
  const recommendationListMs = await sampleReadEndpoint({
    url: plan.recommendationListUrl,
    headers: plan.headers,
    iterations: plan.iterations,
    warmup: plan.warmup,
  });
  const audiencePageMs = await sampleReadEndpoint({
    url: plan.audiencePageUrl,
    headers: plan.headers,
    iterations: plan.iterations,
    warmup: plan.warmup,
  });
  const gate = evaluateMarketingReadPerformance({ recommendationListMs, audiencePageMs });
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'read_only',
    storeId: options.storeId,
    instanceId,
    requestCount: {
      discovery: options.instanceId ? 0 : 1,
      warmupPerEndpoint: plan.warmup,
      measuredPerEndpoint: plan.iterations,
    },
    samples: { recommendationListMs, audiencePageMs },
    gate,
  }, null, 2));
  if (!gate.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'read_only',
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
