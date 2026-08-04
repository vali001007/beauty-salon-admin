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
