import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import type {
  BrainDefinitionRef,
  BrainSemanticActionModality,
  BrainSemanticActionSlot,
  BrainSemanticAnswerShape,
} from '../cognition/brain-semantic-intent.types.js';
import type { BrainActionExecutionProvenance } from '../cognition/brain-action-execution-provenance.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { BrainDomainAnswer } from '../domain/brain-domain-adapter.types.js';
import type { BrainCapabilityCard } from './brain-capability.types.js';
import { findForbiddenCapabilityIdentityArg } from './brain-capability-identity-args.js';

export const BRAIN_CAPABILITY_EXECUTORS = Symbol('BRAIN_CAPABILITY_EXECUTORS');
const READ_ONLY_EXECUTION_CACHE_TTL_MS = 60_000;
const MAX_CACHED_RUNS = 512;

export type BrainCapabilityExecutorKind = 'semantic' | 'domain' | 'action';

export interface BrainCapabilityExecutionInput {
  card: BrainCapabilityCard;
  context: BrainRequestContext;
  runId: number;
  planId?: string;
  question: string;
  answerShape?: BrainSemanticAnswerShape;
  actionProvenance?: BrainActionExecutionProvenance;
  args: Record<string, unknown>;
}

export interface BrainCapabilityToolArgs extends Record<string, unknown> {
  objective: string;
  time?: Record<string, unknown>;
  comparisonTarget?: Record<string, unknown>;
  entities: unknown[];
  metrics: unknown[];
  dimensions: unknown[];
  filters: unknown[];
  orderBy: unknown[];
  limit?: number;
  actionRef?: BrainDefinitionRef<'action'>;
  actionModality?: BrainSemanticActionModality;
  actionSlots?: BrainSemanticActionSlot[];
}

export interface BrainCapabilityExecutor {
  readonly kind: BrainCapabilityExecutorKind;
  readonly capabilityKeys: readonly string[];
  execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer>;
}

@Injectable()
export class BrainCapabilityExecutorRegistryService {
  private readonly executorsByKey = new Map<string, BrainCapabilityExecutor>();
  private readonly readOnlyExecutionsByRun = new Map<
    number,
    { expiresAt: number; executions: Map<string, Promise<BrainDomainAnswer>> }
  >();

  constructor(@Optional() @Inject(BRAIN_CAPABILITY_EXECUTORS) executors: BrainCapabilityExecutor[] = []) {
    for (const executor of executors) {
      for (const capabilityKey of executor.capabilityKeys) {
        if (this.executorsByKey.has(capabilityKey)) {
          throw new Error(`Duplicate Ami Brain capability executor key: ${capabilityKey}`);
        }
        this.executorsByKey.set(capabilityKey, executor);
      }
    }
  }

  resolve(capabilityKey: string): BrainCapabilityExecutor {
    const executor = this.executorsByKey.get(capabilityKey);
    if (!executor) throw new Error(`Unknown Ami Brain capability executor key: ${capabilityKey}`);
    return executor;
  }

  async execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    const executor = this.resolve(input.card.key);
    this.assertStoreScope(input.context);
    this.assertPermissions(input.card, input.context);
    this.assertAllowedRoles(input.card, input.context);
    this.assertNoIdentityArgs(input.args);
    this.assertCardDeclaration(input.card, executor.kind);

    if (input.card.readOnly && !input.card.sideEffect) {
      return this.executeReadOnlyOncePerRun(input, executor);
    }
    return this.executeWithLineage(input, executor);
  }

  private async executeReadOnlyOncePerRun(input: BrainCapabilityExecutionInput, executor: BrainCapabilityExecutor) {
    const now = Date.now();
    this.pruneReadOnlyExecutionCache(now);
    let runCache = this.readOnlyExecutionsByRun.get(input.runId);
    if (!runCache) {
      if (this.readOnlyExecutionsByRun.size >= MAX_CACHED_RUNS) {
        const oldestRunId = this.readOnlyExecutionsByRun.keys().next().value as number | undefined;
        if (oldestRunId !== undefined) this.readOnlyExecutionsByRun.delete(oldestRunId);
      }
      runCache = { expiresAt: now + READ_ONLY_EXECUTION_CACHE_TTL_MS, executions: new Map() };
      this.readOnlyExecutionsByRun.set(input.runId, runCache);
    } else {
      runCache.expiresAt = now + READ_ONLY_EXECUTION_CACHE_TTL_MS;
    }
    const executionKey = stableExecutionKey(input);
    const existing = runCache.executions.get(executionKey);
    if (existing) {
      const answer = await existing;
      return {
        ...answer,
        metadata: { ...(answer.metadata ?? {}), executionDeduplication: 'same_run_hit' },
      };
    }
    const execution = this.executeWithLineage(input, executor);
    runCache.executions.set(executionKey, execution);
    try {
      return await execution;
    } catch (error) {
      runCache.executions.delete(executionKey);
      throw error;
    }
  }

  private async executeWithLineage(input: BrainCapabilityExecutionInput, executor: BrainCapabilityExecutor) {
    const answer = await executor.execute(input);
    return {
      ...answer,
      metadata: {
        ...(answer.metadata ?? {}),
        capabilityKey: input.card.key,
        capabilityVersion: input.card.version,
        executorKind: executor.kind,
      },
    };
  }

  private pruneReadOnlyExecutionCache(now: number) {
    for (const [runId, cache] of this.readOnlyExecutionsByRun) {
      if (cache.expiresAt <= now) this.readOnlyExecutionsByRun.delete(runId);
    }
  }

  private assertStoreScope(context: BrainRequestContext) {
    if (
      !Number.isInteger(context.storeId) ||
      context.storeId <= 0 ||
      !context.visibleStoreIds.includes(context.storeId)
    ) {
      throw new ForbiddenException('store_scope_denied');
    }
  }

  private assertPermissions(card: BrainCapabilityCard, context: BrainRequestContext) {
    const denied = new Set(context.deniedPermissions);
    for (const permission of card.requiredPermissions) {
      if (denied.has('*') || denied.has(permission)) {
        throw new ForbiddenException(`permission_denied:${permission}`);
      }
    }

    if (context.permissions.includes('*')) return;
    const granted = new Set(context.permissions);
    for (const permission of card.requiredPermissions) {
      if (!granted.has(permission)) throw new ForbiddenException(`missing_permission:${permission}`);
    }
  }

  private assertAllowedRoles(card: BrainCapabilityCard, context: BrainRequestContext) {
    if (!card.allowedRoles.length) return;
    const roles = context.roles ?? [];
    if (!roles.length) throw new ForbiddenException('role_denied');
    if (roles.includes('*') || card.allowedRoles.includes('*')) return;
    if (!card.allowedRoles.some((role) => roles.includes(role))) throw new ForbiddenException('role_denied');
  }

  private assertNoIdentityArgs(args: Record<string, unknown>) {
    const forbidden = findForbiddenCapabilityIdentityArg(args);
    if (forbidden) throw new ForbiddenException(`identity_arg_forbidden:${forbidden}`);
  }

  private assertCardDeclaration(card: BrainCapabilityCard, kind: BrainCapabilityExecutorKind) {
    const valid =
      kind === 'semantic'
        ? card.readOnly && !card.sideEffect && card.grounding === 'semantic_query'
        : kind === 'domain'
          ? card.readOnly && !card.sideEffect && card.grounding === 'domain_service'
          : !card.readOnly && card.sideEffect && card.requiresConfirmation && card.idempotency === 'required';
    if (!valid) throw new Error(`invalid_capability_card:${kind}`);
  }
}

function stableExecutionKey(input: BrainCapabilityExecutionInput) {
  return JSON.stringify(
    canonicalize({
      storeId: input.context.storeId,
      userId: input.context.userId,
      permissions: [...input.context.permissions].sort(),
      deniedPermissions: [...input.context.deniedPermissions].sort(),
      roles: [...(input.context.roles ?? [])].sort(),
      capabilityKey: input.card.key,
      capabilityVersion: input.card.version,
      sourceFingerprint: input.card.sourceFingerprint,
      answerShape: input.answerShape ?? null,
      args: input.args,
    }),
  );
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}
