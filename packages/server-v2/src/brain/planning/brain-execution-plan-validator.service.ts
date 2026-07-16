import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Ajv } from 'ajv';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import { BrainCapabilityArgsValidatorService } from '../capability/brain-capability-args-validator.service.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BrainExecutionBudgetService, capabilityIdentity } from '../execution/brain-execution-budget.service.js';
import {
  BRAIN_EXECUTION_PLAN_JSON_SCHEMA,
  type BrainExecutionPlan,
  type BrainExecutionPlanNode,
} from './brain-execution-plan.schema.js';

@Injectable()
export class BrainExecutionPlanValidatorService {
  private readonly validateSchema = new Ajv({ allErrors: true, strict: true }).compile(
    BRAIN_EXECUTION_PLAN_JSON_SCHEMA,
  );

  constructor(
    private readonly argsValidator: BrainCapabilityArgsValidatorService,
    private readonly budget: BrainExecutionBudgetService,
  ) {}

  validate(input: {
    plan: unknown;
    cards: readonly BrainCapabilityCard[];
    context: BrainRequestContext;
  }): BrainExecutionPlan {
    if (!this.validateSchema(input.plan)) {
      const detail = (this.validateSchema.errors ?? [])
        .map((error) => `${error.instancePath || '/'}:${error.keyword}`)
        .join(',');
      throw new BadRequestException(`brain_execution_plan_invalid:${detail || 'schema_mismatch'}`);
    }
    const plan = structuredClone(input.plan) as BrainExecutionPlan;
    const cards = new Map(input.cards.map((card) => [capabilityIdentity(card.key, card.version), card]));
    this.assertGraph(plan);
    for (const node of plan.nodes) {
      const card = cards.get(capabilityIdentity(node.capabilityKey, node.capabilityVersion));
      if (!card) throw new BadRequestException(`brain_execution_capability_missing:${node.capabilityKey}`);
      this.assertNodePolicy(node, card, input.context);
    }
    this.budget.assertPlanFits(plan, cards);
    return deepFreeze(plan);
  }

  revalidateNodeExecution(input: {
    node: BrainExecutionPlanNode;
    card: BrainCapabilityCard;
    context: BrainRequestContext;
  }): void {
    if (input.node.capabilityKey !== input.card.key || input.node.capabilityVersion !== input.card.version) {
      throw new BadRequestException(`brain_execution_capability_version_changed:${input.node.capabilityKey}`);
    }
    this.assertNodePolicy(input.node, input.card, input.context);
  }

  private assertGraph(plan: BrainExecutionPlan) {
    const ids = new Set<string>();
    for (const node of plan.nodes) {
      if (ids.has(node.id)) throw new BadRequestException(`brain_execution_node_duplicate:${node.id}`);
      ids.add(node.id);
    }
    for (const node of plan.nodes) {
      for (const dependencyId of node.dependsOn) {
        if (!ids.has(dependencyId)) {
          throw new BadRequestException(`brain_execution_dependency_missing:${node.id}:${dependencyId}`);
        }
        if (dependencyId === node.id) throw new BadRequestException(`brain_execution_plan_cycle:${node.id}`);
      }
      for (const mapping of node.inputMappings ?? []) {
        if (!node.dependsOn.includes(mapping.fromNodeId)) {
          throw new BadRequestException(
            `brain_execution_input_mapping_dependency_missing:${node.id}:${mapping.fromNodeId}`,
          );
        }
      }
    }
    const byId = new Map(plan.nodes.map((node) => [node.id, node]));
    const state = new Map<string, 'visiting' | 'visited'>();
    const visit = (nodeId: string) => {
      if (state.get(nodeId) === 'visiting') throw new BadRequestException(`brain_execution_plan_cycle:${nodeId}`);
      if (state.get(nodeId) === 'visited') return;
      state.set(nodeId, 'visiting');
      for (const dependencyId of byId.get(nodeId)!.dependsOn) visit(dependencyId);
      state.set(nodeId, 'visited');
    };
    for (const node of plan.nodes) visit(node.id);
  }

  private assertNodePolicy(node: BrainExecutionPlanNode, card: BrainCapabilityCard, context: BrainRequestContext) {
    this.assertPermissions(card, context);
    this.assertRoles(card, context);
    this.argsValidator.assertValid(card, node.args);
    if (card.sideEffect && !node.previewOnly) {
      throw new BadRequestException(`brain_execution_side_effect_preview_required:${node.id}`);
    }
  }

  private assertPermissions(card: BrainCapabilityCard, context: BrainRequestContext) {
    const denied = new Set(context.deniedPermissions);
    for (const permission of card.requiredPermissions) {
      if (denied.has('*') || denied.has(permission)) throw new ForbiddenException(`permission_denied:${permission}`);
    }
    if (context.permissions.includes('*')) return;
    const granted = new Set(context.permissions);
    for (const permission of card.requiredPermissions) {
      if (!granted.has(permission)) throw new ForbiddenException(`missing_permission:${permission}`);
    }
  }

  private assertRoles(card: BrainCapabilityCard, context: BrainRequestContext) {
    if (!card.allowedRoles.length || card.allowedRoles.includes('*')) return;
    const roles = context.roles ?? [];
    if (!roles.includes('*') && !card.allowedRoles.some((role) => roles.includes(role))) {
      throw new ForbiddenException('role_denied');
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
