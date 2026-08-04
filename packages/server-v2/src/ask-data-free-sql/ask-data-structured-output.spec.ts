import { AiStructuredOutputError } from '../ai/ai.service.js';
import {
  AskDataStructuredOutputCallError,
  generateAskDataStructuredWithRetry,
  recordAskDataStructuredRepair,
} from './ask-data-structured-output.js';

const input = {
  scenario: 'ask_data_test',
  messages: [],
  schema: { type: 'object' },
};

describe('Ami Ask structured output retry', () => {
  const originalRecoveryMaxWaitMs = process.env.ASK_DATA_FREE_SQL_PROVIDER_RECOVERY_MAX_WAIT_MS;
  const originalCircuitOpenMs = process.env.LLM_CIRCUIT_OPEN_MS;

  beforeEach(() => {
    process.env.ASK_DATA_FREE_SQL_PROVIDER_RECOVERY_MAX_WAIT_MS = '1';
    process.env.LLM_CIRCUIT_OPEN_MS = '1';
  });

  afterAll(() => {
    if (originalRecoveryMaxWaitMs === undefined) delete process.env.ASK_DATA_FREE_SQL_PROVIDER_RECOVERY_MAX_WAIT_MS;
    else process.env.ASK_DATA_FREE_SQL_PROVIDER_RECOVERY_MAX_WAIT_MS = originalRecoveryMaxWaitMs;
    if (originalCircuitOpenMs === undefined) delete process.env.LLM_CIRCUIT_OPEN_MS;
    else process.env.LLM_CIRCUIT_OPEN_MS = originalCircuitOpenMs;
  });

  it('retries one transient provider failure and records the recovery', async () => {
    const ai = {
      generateStructured: jest
        .fn()
        .mockRejectedValueOnce(new AiStructuredOutputError('PROVIDER_UNAVAILABLE', 'temporary'))
        .mockResolvedValueOnce({ data: { status: 'ready' } }),
    };

    const result = await generateAskDataStructuredWithRetry<{ status: string }>(ai as any, input);

    expect(result.result.data.status).toBe('ready');
    expect(result.audit).toEqual(expect.objectContaining({
      attempts: 2,
      retryAttempted: true,
      firstErrorCode: 'PROVIDER_UNAVAILABLE',
    }));
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);
    expect(ai.generateStructured.mock.calls[1][0].scenario).toBe('ask_data_test_transient_retry');
    expect(ai.generateStructured.mock.calls[0][0]).toEqual(expect.objectContaining({
      allowFallback: true,
      fallbackMessages: input.messages,
    }));
  });

  it('does not retry provider authentication failures', async () => {
    const ai = {
      generateStructured: jest.fn().mockRejectedValue(new AiStructuredOutputError('PROVIDER_AUTH_FAILED', 'bad key')),
    };

    await expect(generateAskDataStructuredWithRetry(ai as any, input)).rejects.toMatchObject({
      audit: expect.objectContaining({ attempts: 1, retryAttempted: false, finalErrorCode: 'PROVIDER_AUTH_FAILED' }),
    });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
  });

  it('retries fallback authentication failure with one forced primary probe and no fallback', async () => {
    const ai = {
      generateStructured: jest
        .fn()
        .mockRejectedValueOnce(
          new AiStructuredOutputError(
            'PROVIDER_AUTH_FAILED',
            'bad fallback key',
            'kimi(fallback)',
            'kimi-model',
          ),
        )
        .mockResolvedValueOnce({ data: { status: 'ready' } }),
    };

    const result = await generateAskDataStructuredWithRetry<{ status: string }>(ai as any, input);

    expect(result.audit).toEqual(expect.objectContaining({
      attempts: 2,
      retryAttempted: true,
      firstErrorCode: 'PROVIDER_AUTH_FAILED',
    }));
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);
    expect(ai.generateStructured.mock.calls[1][0]).toEqual(expect.objectContaining({
      allowFallback: false,
      forcePrimaryProbe: true,
      scenario: 'ask_data_test_transient_retry',
    }));
  });

  it('retries an unavailable fallback route directly with a fresh full fallback budget', async () => {
    const ai = {
      generateStructured: jest
        .fn()
        .mockRejectedValueOnce(
          new AiStructuredOutputError(
            'PROVIDER_UNAVAILABLE',
            'fallback request budget exhausted',
            'openai_responses(fallback)',
            'gpt-fallback',
          ),
        )
        .mockResolvedValueOnce({ data: { status: 'ready' } }),
    };

    const result = await generateAskDataStructuredWithRetry<{ status: string }>(ai as any, input);

    expect(result.audit).toEqual(expect.objectContaining({
      attempts: 2,
      retryAttempted: true,
      firstErrorCode: 'PROVIDER_UNAVAILABLE',
    }));
    expect(ai.generateStructured.mock.calls[1][0]).toEqual(expect.objectContaining({
      allowFallback: true,
      forceFallbackRoute: true,
      scenario: 'ask_data_test_transient_retry',
    }));
  });

  it('forces a primary probe when the fallback circuit itself is open', async () => {
    const ai = {
      generateStructured: jest
        .fn()
        .mockRejectedValueOnce(
          new AiStructuredOutputError(
            'PROVIDER_UNAVAILABLE',
            'Fallback structured provider circuit is open.',
            'openai_responses(fallback)',
            'gpt-fallback',
          ),
        )
        .mockResolvedValueOnce({ data: { status: 'ready' } }),
    };

    await generateAskDataStructuredWithRetry<{ status: string }>(ai as any, input);

    expect(ai.generateStructured.mock.calls[1][0]).toEqual(expect.objectContaining({
      allowFallback: false,
      forcePrimaryProbe: true,
      scenario: 'ask_data_test_transient_retry',
    }));
  });

  it('uses one final primary recovery probe after repeated fallback unavailability', async () => {
    const unavailableFallback = () => new AiStructuredOutputError(
      'PROVIDER_UNAVAILABLE',
      'fallback request budget exhausted',
      'openai_responses(fallback)',
      'gpt-fallback',
    );
    const ai = {
      generateStructured: jest
        .fn()
        .mockRejectedValueOnce(unavailableFallback())
        .mockRejectedValueOnce(unavailableFallback())
        .mockResolvedValueOnce({ data: { status: 'ready' } }),
    };

    const result = await generateAskDataStructuredWithRetry<{ status: string }>(ai as any, input);

    expect(result.result.data.status).toBe('ready');
    expect(result.audit).toEqual(expect.objectContaining({
      attempts: 3,
      retryAttempted: true,
      firstErrorCode: 'PROVIDER_UNAVAILABLE',
      providerRecovery: {
        role: 'leader',
        route: 'primary',
        waitMs: 1,
      },
    }));
    expect(ai.generateStructured.mock.calls[2][0]).toEqual(expect.objectContaining({
      allowFallback: false,
      forcePrimaryProbe: true,
      scenario: 'ask_data_test_provider_recovery',
    }));
  });

  it('uses one shared recovery probe for concurrent circuit failures and resumes waiters after success', async () => {
    const unavailableFallback = () => new AiStructuredOutputError(
      'PROVIDER_UNAVAILABLE',
      'Fallback structured provider circuit is open.',
      'openai_responses(fallback)',
      'gpt-fallback',
    );
    let releaseProbe!: () => void;
    const probeGate = new Promise<void>((resolve) => {
      releaseProbe = resolve;
    });
    let markProbeStarted!: () => void;
    const probeStarted = new Promise<void>((resolve) => {
      markProbeStarted = resolve;
    });
    const ai = {
      generateStructured: jest.fn().mockImplementation(async (callInput) => {
        if (callInput.scenario.endsWith('_transient_retry')) {
          markProbeStarted();
          await probeGate;
          return { data: { status: 'recovered' } };
        }
        if (callInput.scenario.endsWith('_transient_retry_resume')) {
          return { data: { status: 'resumed' } };
        }
        throw unavailableFallback();
      }),
    };

    const pending = Promise.all([
      generateAskDataStructuredWithRetry<{ status: string }>(ai as any, { ...input, scenario: 'ask_data_concurrent_1' }),
      generateAskDataStructuredWithRetry<{ status: string }>(ai as any, { ...input, scenario: 'ask_data_concurrent_2' }),
      generateAskDataStructuredWithRetry<{ status: string }>(ai as any, { ...input, scenario: 'ask_data_concurrent_3' }),
    ]);

    await probeStarted;
    releaseProbe();
    const results = await pending;

    expect(results.map(({ result }) => result.data.status).sort()).toEqual(['recovered', 'resumed', 'resumed']);
    expect(results.map(({ audit }) => audit.providerRecovery?.role).sort()).toEqual(['leader', 'waiter', 'waiter']);
    expect(ai.generateStructured.mock.calls.filter(([callInput]) => callInput.forcePrimaryProbe === true)).toHaveLength(1);
    expect(ai.generateStructured.mock.calls.filter(([callInput]) => callInput.scenario.endsWith('_transient_retry_resume'))).toHaveLength(2);
    for (const [callInput] of ai.generateStructured.mock.calls) {
      expect(callInput.messages).toBe(input.messages);
      expect(callInput.schema).toBe(input.schema);
    }
  });

  it('propagates one failed shared recovery probe to all waiters without expanding retries', async () => {
    const unavailableFallback = () => new AiStructuredOutputError(
      'PROVIDER_UNAVAILABLE',
      'Fallback structured provider circuit is open.',
      'openai_responses(fallback)',
      'gpt-fallback',
    );
    let releaseProbe!: () => void;
    const probeGate = new Promise<void>((resolve) => {
      releaseProbe = resolve;
    });
    let markProbeStarted!: () => void;
    const probeStarted = new Promise<void>((resolve) => {
      markProbeStarted = resolve;
    });
    const ai = {
      generateStructured: jest.fn().mockImplementation(async (callInput) => {
        if (callInput.scenario.endsWith('_transient_retry')) {
          throw new AiStructuredOutputError(
            'PROVIDER_UNAVAILABLE',
            'primary transient probe failed',
            'openai_responses',
            'gpt-primary',
          );
        }
        if (callInput.scenario.endsWith('_provider_recovery')) {
          markProbeStarted();
          await probeGate;
          throw new AiStructuredOutputError(
            'PROVIDER_UNAVAILABLE',
            'primary recovery probe failed',
            'openai_responses',
            'gpt-primary',
          );
        }
        if (callInput.scenario.endsWith('_provider_recovery_resume')) {
          throw new Error('waiters must not retry after a failed shared probe');
        }
        throw unavailableFallback();
      }),
    };

    const pending = Promise.allSettled([
      generateAskDataStructuredWithRetry(ai as any, { ...input, scenario: 'ask_data_failed_recovery_1' }),
      generateAskDataStructuredWithRetry(ai as any, { ...input, scenario: 'ask_data_failed_recovery_2' }),
      generateAskDataStructuredWithRetry(ai as any, { ...input, scenario: 'ask_data_failed_recovery_3' }),
    ]);

    await probeStarted;
    releaseProbe();
    const results = await pending;

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    for (const result of results) {
      if (result.status !== 'rejected') continue;
      expect(result.reason).toBeInstanceOf(AskDataStructuredOutputCallError);
      expect(result.reason).toMatchObject({
        audit: expect.objectContaining({
          attempts: 3,
          firstErrorCode: 'PROVIDER_UNAVAILABLE',
          finalErrorCode: 'PROVIDER_UNAVAILABLE',
        }),
      });
    }
    expect(ai.generateStructured.mock.calls.filter(([callInput]) => callInput.scenario.endsWith('_transient_retry'))).toHaveLength(1);
    expect(ai.generateStructured.mock.calls.filter(([callInput]) => callInput.scenario.endsWith('_provider_recovery'))).toHaveLength(1);
    expect(ai.generateStructured.mock.calls.filter(([callInput]) => callInput.forcePrimaryProbe === true)).toHaveLength(1);
    expect(ai.generateStructured.mock.calls.filter(([callInput]) => callInput.forceFallbackRoute === true)).toHaveLength(1);
    expect(ai.generateStructured.mock.calls.filter(([callInput]) => callInput.scenario.endsWith('_provider_recovery_resume'))).toHaveLength(0);
  });

  it('stops after one retry and preserves the final structured error', async () => {
    const ai = {
      generateStructured: jest
        .fn()
        .mockRejectedValueOnce(new AiStructuredOutputError('JSON_INVALID', 'invalid json'))
        .mockRejectedValueOnce(new AiStructuredOutputError('PROVIDER_UNAVAILABLE', 'temporary')),
    };

    try {
      await generateAskDataStructuredWithRetry(ai as any, input);
      throw new Error('expected retry failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AskDataStructuredOutputCallError);
      expect(error).toMatchObject({
        audit: expect.objectContaining({
          attempts: 2,
          retryAttempted: true,
          firstErrorCode: 'JSON_INVALID',
          finalErrorCode: 'PROVIDER_UNAVAILABLE',
        }),
      });
    }
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);
  });

  it('records bounded clarification, guard and query-plan repair attempts separately', () => {
    const audit = { attempts: 1, retryAttempted: false, retryLatencyMs: 0 };

    recordAskDataStructuredRepair(audit, {
      kind: 'query_plan',
      reasonCode: 'query_plan_order_by_metric_mismatch',
      latencyMs: 123,
      succeeded: true,
    });

    expect(audit).toEqual({
      attempts: 2,
      retryAttempted: false,
      retryLatencyMs: 0,
      repairAttempts: [{
        kind: 'query_plan',
        reasonCode: 'query_plan_order_by_metric_mismatch',
        latencyMs: 123,
        succeeded: true,
        attempts: 1,
        retryAttempted: false,
      }],
    });
  });

  it('merges a transient repair retry into the parent audit accurately', () => {
    const audit = { attempts: 2, retryAttempted: true, retryLatencyMs: 20 };
    recordAskDataStructuredRepair(audit, {
      kind: 'guard',
      reasonCode: 'query_plan_detail_grouped',
      latencyMs: 80,
      succeeded: true,
    }, {
      attempts: 2,
      retryAttempted: true,
      retryLatencyMs: 15,
      firstErrorCode: 'PROVIDER_UNAVAILABLE',
    });

    expect(audit).toEqual(expect.objectContaining({
      attempts: 4,
      retryAttempted: true,
      retryLatencyMs: 35,
      repairAttempts: [expect.objectContaining({
        attempts: 2,
        retryAttempted: true,
        firstErrorCode: 'PROVIDER_UNAVAILABLE',
      })],
    }));
  });
});
