import { Injectable } from '@nestjs/common';
import { getBusinessQueryCapability } from '../../business-query/business-query.capabilities.js';
import type { BusinessQueryCapabilityId, BusinessQueryPlannerTrace, BusinessQueryRole } from '../../business-query/business-query.types.js';
import { CapabilityCatalogService } from './capability-catalog.service.js';
import { EntityResolverService } from './entity-resolver.service.js';
import type { CapabilityResolutionResult, EntityResolutionResult } from './knowledge.types.js';

export type UnifiedQueryPlannerStatus = 'planned' | 'clarify' | 'fallback';

export type UnifiedQueryPlannerDecision = {
  status: UnifiedQueryPlannerStatus;
  businessCapabilityId?: BusinessQueryCapabilityId;
  entityResolution: EntityResolutionResult;
  capabilityDecision: CapabilityResolutionResult;
  trace: BusinessQueryPlannerTrace;
  fallbackReason?: string | null;
};

@Injectable()
export class UnifiedQueryPlannerService {
  constructor(
    private readonly entityResolver: EntityResolverService,
    private readonly capabilityCatalog: CapabilityCatalogService,
  ) {}

  async planBusinessQuery(params: { question: string; storeId: number; role: BusinessQueryRole }): Promise<UnifiedQueryPlannerDecision> {
    const entityResolution = await this.entityResolver.resolve({
      text: params.question,
      storeId: params.storeId,
      role: params.role,
      limit: 5,
    });
    const entities = entityResolution.entity ? [entityResolution.entity] : entityResolution.candidates;
    const capabilityDecision = this.capabilityCatalog.resolve({ text: params.question, role: params.role, entities });
    const resolvedCapability = capabilityDecision.capability;
    const businessCapabilityId = resolvedCapability?.businessQueryCapabilityId as BusinessQueryCapabilityId | undefined;
    const traceBase = this.buildTrace(entityResolution, capabilityDecision, businessCapabilityId);

    if (!resolvedCapability) {
      return this.fallback(entityResolution, capabilityDecision, traceBase, 'capability_not_found');
    }
    if (!businessCapabilityId) {
      return this.fallback(entityResolution, capabilityDecision, traceBase, 'business_query_capability_missing');
    }
    if (capabilityDecision.confidence < 0.65) {
      return this.fallback(entityResolution, capabilityDecision, traceBase, 'capability_confidence_below_threshold', businessCapabilityId);
    }

    const businessCapability = getBusinessQueryCapability(businessCapabilityId);
    if (!businessCapability?.implemented) {
      return this.fallback(entityResolution, capabilityDecision, traceBase, 'business_query_capability_not_implemented', businessCapabilityId);
    }
    if (!businessCapability.allowedRoles.includes(params.role)) {
      return this.fallback(entityResolution, capabilityDecision, traceBase, 'business_query_role_not_allowed', businessCapabilityId);
    }
    if (resolvedCapability.requiredEntities.length && entityResolution.status === 'ambiguous') {
      return {
        status: 'clarify',
        businessCapabilityId,
        entityResolution,
        capabilityDecision,
        trace: { ...traceBase, executionPath: 'clarify', fallbackReason: null },
      };
    }
    if (resolvedCapability.requiredEntities.length && entityResolution.status !== 'resolved') {
      return this.fallback(entityResolution, capabilityDecision, traceBase, 'required_entity_not_resolved');
    }

    return {
      status: 'planned',
      businessCapabilityId,
      entityResolution,
      capabilityDecision,
      trace: { ...traceBase, executionPath: 'knowledge_graph', fallbackReason: null },
    };
  }

  private fallback(
    entityResolution: EntityResolutionResult,
    capabilityDecision: CapabilityResolutionResult,
    trace: BusinessQueryPlannerTrace,
    fallbackReason: string,
    businessCapabilityId?: BusinessQueryCapabilityId,
  ): UnifiedQueryPlannerDecision {
    return {
      status: 'fallback',
      businessCapabilityId,
      entityResolution,
      capabilityDecision,
      trace: { ...trace, executionPath: 'legacy_fallback', fallbackReason },
      fallbackReason,
    };
  }

  private buildTrace(
    entityResolution: EntityResolutionResult,
    capabilityDecision: CapabilityResolutionResult,
    businessCapabilityId?: BusinessQueryCapabilityId,
  ): BusinessQueryPlannerTrace {
    const capability = capabilityDecision.capability;
    return {
      parserVersion: 'unified-query-planner-v1',
      entityMatches: entityResolution.candidates.map((item) => ({
        objectType: item.objectType,
        entityId: item.entityId,
        displayName: item.displayName,
        confidence: item.confidence,
        sourceModel: item.sourceModel,
      })),
      actionIntent: capabilityDecision.action,
      capabilityId: capability?.capabilityId,
      queryTemplateId: capability?.queryTemplateId ?? businessCapabilityId,
      executionPath: 'knowledge_graph',
      fallbackReason: null,
      schemaPath: capability?.objectTypes ?? [],
      confidence: capabilityDecision.confidence,
    };
  }
}
