import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import type { BrainSemanticAnswerShape } from '../cognition/brain-semantic-intent.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { BrainDomainAnswer } from '../domain/brain-domain-adapter.types.js';
import type { BrainCapabilityCard } from './brain-capability.types.js';
import { findForbiddenCapabilityIdentityArg } from './brain-capability-identity-args.js';

export const BRAIN_CAPABILITY_EXECUTORS = Symbol('BRAIN_CAPABILITY_EXECUTORS');

export type BrainCapabilityExecutorKind = 'semantic' | 'domain' | 'action';

export interface BrainCapabilityExecutionInput {
  card: BrainCapabilityCard;
  context: BrainRequestContext;
  runId: number;
  planId?: string;
  question: string;
  answerShape?: BrainSemanticAnswerShape;
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
}

export interface BrainCapabilityExecutor {
  readonly kind: BrainCapabilityExecutorKind;
  readonly capabilityKeys: readonly string[];
  execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer>;
}

@Injectable()
export class BrainCapabilityExecutorRegistryService {
  private readonly executorsByKey = new Map<string, BrainCapabilityExecutor>();

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
