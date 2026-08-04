import {
  AiStructuredOutputError,
  type AiStructuredOutputErrorCode,
  type AiStructuredOutputInput,
  type AiStructuredOutputResult,
  type AiService,
} from '../ai/ai.service.js';

export type AskDataStructuredOutputAudit = {
  attempts: number;
  retryAttempted: boolean;
  retryLatencyMs: number;
  firstErrorCode?: AiStructuredOutputErrorCode;
  finalErrorCode?: AiStructuredOutputErrorCode;
  repairAttempts?: Array<{
    kind: 'clarification' | 'guard' | 'query_plan';
    reasonCode: string;
    latencyMs: number;
    succeeded: boolean;
    attempts: number;
    retryAttempted: boolean;
    firstErrorCode?: AiStructuredOutputErrorCode;
    finalErrorCode?: AiStructuredOutputErrorCode;
  }>;
};

export class AskDataStructuredOutputCallError extends Error {
  readonly name = 'AskDataStructuredOutputCallError';

  constructor(
    public readonly originalError: unknown,
    public readonly audit: AskDataStructuredOutputAudit,
  ) {
    super(originalError instanceof Error ? originalError.message : String(originalError), { cause: originalError });
  }
}

export async function generateAskDataStructuredWithRetry<T>(
  aiService: Pick<AiService, 'generateStructured'>,
  input: AiStructuredOutputInput,
): Promise<{ result: AiStructuredOutputResult<T>; audit: AskDataStructuredOutputAudit }> {
  const routedInput: AiStructuredOutputInput = {
    ...input,
    allowFallback: input.allowFallback ?? true,
    fallbackMessages: input.fallbackMessages ?? input.messages,
  };
  try {
    const result = await aiService.generateStructured<T>(routedInput);
    return {
      result,
      audit: { attempts: 1, retryAttempted: false, retryLatencyMs: 0 },
    };
  } catch (firstError) {
    const firstErrorCode = askDataStructuredErrorCode(firstError);
    if (!isRetryableAskDataStructuredError(firstError)) {
      throw new AskDataStructuredOutputCallError(firstError, {
        attempts: 1,
        retryAttempted: false,
        retryLatencyMs: 0,
        ...(firstErrorCode ? { firstErrorCode, finalErrorCode: firstErrorCode } : {}),
      });
    }

    const retryStartedAt = Date.now();
    const fallbackRouteRequiresPrimaryProbe = isFallbackRoutePrimaryProbeFailure(firstError);
    const fallbackRouteCanRetryDirectly = isFallbackRouteDirectRetryFailure(firstError);
    try {
      const result = await aiService.generateStructured<T>({
        ...routedInput,
        scenario: `${input.scenario}_transient_retry`,
        ...(fallbackRouteRequiresPrimaryProbe
          ? {
              allowFallback: false,
              forcePrimaryProbe: true,
            }
          : fallbackRouteCanRetryDirectly
            ? {
                allowFallback: true,
                forceFallbackRoute: true,
              }
            : {}),
      });
      return {
        result,
        audit: {
          attempts: 2,
          retryAttempted: true,
          retryLatencyMs: Date.now() - retryStartedAt,
          ...(firstErrorCode ? { firstErrorCode } : {}),
        },
      };
    } catch (finalError) {
      const finalErrorCode = askDataStructuredErrorCode(finalError);
      throw new AskDataStructuredOutputCallError(finalError, {
        attempts: 2,
        retryAttempted: true,
        retryLatencyMs: Date.now() - retryStartedAt,
        ...(firstErrorCode ? { firstErrorCode } : {}),
        ...(finalErrorCode ? { finalErrorCode } : {}),
      });
    }
  }
}

export function askDataStructuredErrorCode(error: unknown): AiStructuredOutputErrorCode | undefined {
  const candidate = error instanceof AskDataStructuredOutputCallError ? error.originalError : error;
  return candidate instanceof AiStructuredOutputError ? candidate.code : undefined;
}

export function recordAskDataStructuredRepair(
  audit: AskDataStructuredOutputAudit,
  repair: Omit<NonNullable<AskDataStructuredOutputAudit['repairAttempts']>[number], 'attempts' | 'retryAttempted' | 'firstErrorCode' | 'finalErrorCode'>,
  callAudit?: AskDataStructuredOutputAudit,
) {
  const attempts = callAudit?.attempts ?? 1;
  audit.attempts += attempts;
  audit.retryAttempted = audit.retryAttempted || Boolean(callAudit?.retryAttempted);
  audit.retryLatencyMs += callAudit?.retryLatencyMs ?? 0;
  audit.repairAttempts = [...(audit.repairAttempts ?? []), {
    ...repair,
    attempts,
    retryAttempted: Boolean(callAudit?.retryAttempted),
    ...(callAudit?.firstErrorCode ? { firstErrorCode: callAudit.firstErrorCode } : {}),
    ...(callAudit?.finalErrorCode ? { finalErrorCode: callAudit.finalErrorCode } : {}),
  }];
}

function isRetryableAskDataStructuredError(error: unknown) {
  if (!(error instanceof AiStructuredOutputError)) return false;
  return (
    ['PROVIDER_UNAVAILABLE', 'JSON_INVALID', 'SCHEMA_INVALID'].includes(error.code) ||
    isFallbackRoutePrimaryProbeFailure(error)
  );
}

function isFallbackRoutePrimaryProbeFailure(error: unknown) {
  return (
    error instanceof AiStructuredOutputError &&
    String(error.provider ?? '').endsWith('(fallback)') &&
    (error.code === 'PROVIDER_AUTH_FAILED' ||
      (error.code === 'PROVIDER_UNAVAILABLE' && /circuit is open/iu.test(error.message)))
  );
}

function isFallbackRouteDirectRetryFailure(error: unknown) {
  return (
    error instanceof AiStructuredOutputError &&
    error.code === 'PROVIDER_UNAVAILABLE' &&
    String(error.provider ?? '').endsWith('(fallback)') &&
    !/circuit is open/iu.test(error.message)
  );
}
