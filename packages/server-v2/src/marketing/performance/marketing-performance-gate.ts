export type MarketingReadPerformanceSamples = {
  recommendationListMs: number[];
  audiencePageMs: number[];
};

export type MarketingPerformanceRequestOptions = {
  baseUrl: string;
  token: string;
  storeId: number;
  instanceId: string;
  iterations?: number;
  warmup?: number;
};

type ReadFetchResponse = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

type ReadFetch = (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<ReadFetchResponse>;

export type MarketingPerformanceScenario = {
  sampleCount: number;
  p95Ms: number | null;
  thresholdMs: number;
  passed: boolean;
};

export function percentile95(samples: number[]): number | null {
  const values = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
  if (!values.length) return null;
  const index = Math.max(0, Math.ceil(values.length * 0.95) - 1);
  return Math.round(values[index] * 10) / 10;
}

export function buildMarketingPerformanceRequestPlan(options: MarketingPerformanceRequestOptions) {
  const baseUrl = String(options.baseUrl ?? '').replace(/\/+$/, '');
  const storeId = Number(options.storeId);
  const instanceId = String(options.instanceId ?? '').trim();
  if (!/^https?:\/\//.test(baseUrl)) throw new Error('MARKETING_PERF_BASE_URL must use http or https');
  if (!String(options.token ?? '').trim()) throw new Error('MARKETING_PERF_TOKEN is required');
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('MARKETING_PERF_STORE_ID must be a positive integer');
  if (!instanceId) throw new Error('A recommendation instance id is required for audience sampling');
  const iterations = Math.max(1, Math.min(100, Math.trunc(Number(options.iterations ?? 20)) || 20));
  const warmup = Math.max(0, Math.min(20, Math.trunc(Number(options.warmup ?? 3)) || 0));
  return {
    recommendationListUrl: `${baseUrl}/marketing/recommendation-instances?page=1&pageSize=50`,
    audiencePageUrl: `${baseUrl}/marketing/recommendation-instances/${encodeURIComponent(instanceId)}/audience?page=1&pageSize=50`,
    headers: {
      Authorization: `Bearer ${String(options.token).trim()}`,
      'X-Store-Id': String(storeId),
    },
    iterations,
    warmup,
  };
}

export function resolveRecommendationInstanceId(payload: unknown) {
  const response = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const candidates = Array.isArray(response.items) ? response.items : Array.isArray(response.data) ? response.data : [];
  const persistedCandidates = candidates.filter((candidate): candidate is Record<string, unknown> =>
    Boolean(candidate && typeof candidate === 'object'),
  );
  const first =
    persistedCandidates.find((candidate) => {
      const audience = candidate.audience;
      return Boolean(audience && typeof audience === 'object');
    }) ??
    persistedCandidates[0] ??
    {};
  const instanceId = String(first.recommendationInstanceId ?? first.id ?? '').trim();
  if (!instanceId) throw new Error('No recommendation instance is available for audience sampling');
  return instanceId;
}

export async function sampleReadEndpoint(options: {
  url: string;
  headers: Record<string, string>;
  iterations: number;
  warmup: number;
  fetchImpl?: ReadFetch;
  now?: () => number;
}) {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as ReadFetch);
  const now = options.now ?? (() => performance.now());
  const samples: number[] = [];
  const total = options.warmup + options.iterations;
  for (let index = 0; index < total; index += 1) {
    const startedAt = now();
    const response = await fetchImpl(options.url, { method: 'GET', headers: options.headers });
    if (!response.ok) {
      const detail = response.text ? await response.text() : '';
      throw new Error(`Marketing performance request failed: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
    }
    if (response.json) await response.json();
    const duration = Math.round((now() - startedAt) * 10) / 10;
    if (index >= options.warmup) samples.push(duration);
  }
  return samples;
}

function evaluateScenario(samples: number[], thresholdMs: number): MarketingPerformanceScenario {
  const p95Ms = percentile95(samples);
  return {
    sampleCount: samples.filter((value) => Number.isFinite(value) && value >= 0).length,
    p95Ms,
    thresholdMs,
    passed: p95Ms !== null && p95Ms < thresholdMs,
  };
}

export function evaluateMarketingReadPerformance(samples: MarketingReadPerformanceSamples) {
  const recommendationList = evaluateScenario(samples.recommendationListMs, 800);
  const audiencePage = evaluateScenario(samples.audiencePageMs, 500);
  return {
    mode: 'read_only' as const,
    passed: recommendationList.passed && audiencePage.passed,
    recommendationList,
    audiencePage,
    implementationEvidence: {
      browserInitialRequestCount: {
        value: 3,
        source: 'component_contract_test' as const,
        definition: '智能推荐首屏仅请求推荐工作台、终端跟进汇总和生命周期质量。',
      },
      serverOfferPoolQueryCount: {
        value: 1,
        source: 'service_unit_test' as const,
        definition: '一次门店推荐编排只加载一次可用权益池，再批量匹配全部候选。',
      },
    },
    notMeasured: ['1000_customer_execution_initialization', 'worker_100_delivery_batch'],
  };
}
