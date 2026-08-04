import {
  AiStructuredOutputError,
  type AiStructuredOutputErrorCode,
  type AiStructuredOutputInput,
  type AiStructuredOutputResult,
  type AiService,
} from '../ai/ai.service.js';
import { acquireAskDataModelSlot } from './ask-data-model-concurrency.js';

export type AskDataStructuredOutputAudit = {
  attempts: number;
  retryAttempted: boolean;
  retryLatencyMs: number;
  firstErrorCode?: AiStructuredOutputErrorCode;
  finalErrorCode?: AiStructuredOutputErrorCode;
  providerRecovery?: {
    role: 'leader' | 'waiter';
    route: 'primary' | 'fallback';
    waitMs: number;
  };
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

type AskDataProviderRecoveryRoute = 'primary' | 'fallback';

type AskDataProviderRecoveryFlight = {
  promise: Promise<AiStructuredOutputResult<unknown>>;
};

type AskDataProviderRecoveryResult<T> = {
  result: AiStructuredOutputResult<T>;
  role: 'leader' | 'waiter';
  route: AskDataProviderRecoveryRoute;
  waitMs: number;
};

const DEFAULT_PROVIDER_RECOVERY_WAIT_MS = 250;
const DEFAULT_PROVIDER_RECOVERY_MAX_WAIT_MS = 5_000;
const MAX_PROVIDER_RECOVERY_MAX_WAIT_MS = 30_000;
const askDataProviderRecoveryFlights = new Map<AskDataProviderRecoveryRoute, AskDataProviderRecoveryFlight>();

export async function generateAskDataStructuredWithRetry<T>(
  aiService: Pick<AiService, 'generateStructured'>,
  input: AiStructuredOutputInput,
): Promise<{ result: AiStructuredOutputResult<T>; audit: AskDataStructuredOutputAudit }> {
  const releaseModelSlot = await acquireAskDataModelSlot();
  try {
    return await generateAskDataStructuredWithRetryInSlot<T>(aiService, input);
  } finally {
    releaseModelSlot();
  }
}

async function generateAskDataStructuredWithRetryInSlot<T>(
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
      const sharedRetry = fallbackRouteRequiresPrimaryProbe
        ? await generateWithSharedProviderProbe<T>(
            aiService,
            routedInput,
            firstError,
            `${input.scenario}_transient_retry`,
            `${input.scenario}_transient_retry_resume`,
          )
        : undefined;
      const result = sharedRetry?.result ?? await aiService.generateStructured<T>({
          ...routedInput,
          scenario: `${input.scenario}_transient_retry`,
          ...(fallbackRouteCanRetryDirectly
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
          ...(sharedRetry
            ? {
                providerRecovery: {
                  role: sharedRetry.role,
                  route: sharedRetry.route,
                  waitMs: sharedRetry.waitMs,
                },
              }
            : {}),
        },
      };
    } catch (finalError) {
      const finalErrorCode = askDataStructuredErrorCode(finalError);
      if (isProviderRecoveryEligible(finalError)) {
        try {
          const recovery = await generateWithSharedProviderProbe<T>(
            aiService,
            routedInput,
            finalError,
            `${input.scenario}_provider_recovery`,
            `${input.scenario}_provider_recovery_resume`,
          );
          return {
            result: recovery.result,
            audit: {
              attempts: 3,
              retryAttempted: true,
              retryLatencyMs: Date.now() - retryStartedAt,
              ...(firstErrorCode ? { firstErrorCode } : {}),
              providerRecovery: {
                role: recovery.role,
                route: recovery.route,
                waitMs: recovery.waitMs,
              },
            },
          };
        } catch (recoveryError) {
          const recoveryErrorCode = askDataStructuredErrorCode(recoveryError);
          throw new AskDataStructuredOutputCallError(recoveryError, {
            attempts: 3,
            retryAttempted: true,
            retryLatencyMs: Date.now() - retryStartedAt,
            ...(firstErrorCode ? { firstErrorCode } : {}),
            ...(recoveryErrorCode ? { finalErrorCode: recoveryErrorCode } : {}),
          });
        }
      }
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

function isProviderRecoveryEligible(error: unknown): error is AiStructuredOutputError {
  return (
    error instanceof AiStructuredOutputError &&
    error.code === 'PROVIDER_UNAVAILABLE' &&
    Boolean(error.provider)
  );
}

function providerRecoveryRoute(error: AiStructuredOutputError): Partial<AiStructuredOutputInput> {
  return String(error.provider ?? '').endsWith('(fallback)')
    ? { allowFallback: false, forcePrimaryProbe: true }
    : { allowFallback: true, forceFallbackRoute: true };
}

function providerRecoveryTarget(error: AiStructuredOutputError): AskDataProviderRecoveryRoute {
  return String(error.provider ?? '').endsWith('(fallback)') ? 'primary' : 'fallback';
}

async function generateWithSharedProviderProbe<T>(
  aiService: Pick<AiService, 'generateStructured'>,
  routedInput: AiStructuredOutputInput,
  error: AiStructuredOutputError,
  probeScenario: string,
  resumeScenario: string,
): Promise<AskDataProviderRecoveryResult<T>> {
  const route = providerRecoveryTarget(error);
  const existing = askDataProviderRecoveryFlights.get(route);
  if (existing) {
    const waitStartedAt = Date.now();
    await existing.promise;
    return {
      result: await aiService.generateStructured<T>({
        ...routedInput,
        scenario: resumeScenario,
      }),
      role: 'waiter',
      route,
      waitMs: Date.now() - waitStartedAt,
    };
  }

  const waitMs = providerRecoveryWaitMs(error);
  const promise = (async () => {
    await waitForProviderRecovery(waitMs);
    return aiService.generateStructured<T>({
      ...routedInput,
      scenario: probeScenario,
      ...providerRecoveryRoute(error),
    });
  })();
  const flight: AskDataProviderRecoveryFlight = {
    promise: promise as Promise<AiStructuredOutputResult<unknown>>,
  };
  askDataProviderRecoveryFlights.set(route, flight);

  try {
    return {
      result: await promise,
      role: 'leader',
      route,
      waitMs,
    };
  } finally {
    if (askDataProviderRecoveryFlights.get(route) === flight) {
      askDataProviderRecoveryFlights.delete(route);
    }
  }
}

function providerRecoveryWaitMs(error: AiStructuredOutputError) {
  const configuredMax = positiveIntegerEnvironment(
    'ASK_DATA_FREE_SQL_PROVIDER_RECOVERY_MAX_WAIT_MS',
    DEFAULT_PROVIDER_RECOVERY_MAX_WAIT_MS,
    MAX_PROVIDER_RECOVERY_MAX_WAIT_MS,
  );
  if (!/circuit is open/iu.test(error.message)) {
    return Math.min(DEFAULT_PROVIDER_RECOVERY_WAIT_MS, configuredMax);
  }
  const circuitOpenMs = positiveIntegerEnvironment(
    'LLM_CIRCUIT_OPEN_MS',
    MAX_PROVIDER_RECOVERY_MAX_WAIT_MS,
    MAX_PROVIDER_RECOVERY_MAX_WAIT_MS,
  );
  return Math.min(circuitOpenMs, configuredMax);
}

function positiveIntegerEnvironment(key: string, fallback: number, maximum: number) {
  const parsed = Number(process.env[key]);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function waitForProviderRecovery(waitMs: number) {
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}
