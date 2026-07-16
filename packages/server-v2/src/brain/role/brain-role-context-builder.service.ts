import { Injectable, NotFoundException } from '@nestjs/common';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { BrainDomainRole } from '../domain/brain-domain-adapter.types.js';
import { BrainAgentProfileService } from '../orchestrator/brain-agent-profile.service.js';

const AGENT_ROLES: readonly BrainDomainRole[] = [
  'store_manager',
  'receptionist',
  'marketing',
  'beautician',
  'inventory',
  'finance',
  'customer_service',
];

export interface BrainRoleRuntimeContext {
  role: BrainDomainRole;
  expressionRole: BrainDomainRole;
  source: 'authenticated_role' | 'role_hint' | 'default';
  profileName: string;
  profileVersion: number;
  systemPrompt: string;
  allowedSkills: string[];
  dataScopeRules: Record<string, unknown>;
  knowledgePack: Record<string, unknown>;
}

@Injectable()
export class BrainRoleContextBuilderService {
  constructor(private readonly profiles: BrainAgentProfileService) {}

  async build(input: { context: BrainRequestContext; roleHint?: string }): Promise<BrainRoleRuntimeContext> {
    const authenticatedRole = this.firstAgentRole(input.context.roles);
    const hintedRole = this.agentRole(input.roleHint);
    const role = authenticatedRole ?? hintedRole ?? 'store_manager';
    const profile = await this.profiles.getRuntimeProfile(role);
    if (!profile) throw new NotFoundException(`active_brain_agent_profile_not_found:${role}`);

    return {
      role,
      expressionRole: hintedRole ?? role,
      source: authenticatedRole ? 'authenticated_role' : hintedRole ? 'role_hint' : 'default',
      profileName: profile.name,
      profileVersion: profile.version,
      systemPrompt: profile.systemPrompt,
      allowedSkills: [...profile.allowedSkills],
      dataScopeRules: { ...profile.dataScopeRules },
      knowledgePack: { ...profile.knowledgePack },
    };
  }

  filterCapabilities(
    roleContext: BrainRoleRuntimeContext,
    context: BrainRequestContext,
    cards: readonly BrainCapabilityCard[],
  ): readonly BrainCapabilityCard[] {
    const allowed = new Set(roleContext.allowedSkills);
    return cards.filter(
      (card) =>
        (card.generatedCapability === true
          ? card.allowedRoles.length === 0 || card.allowedRoles.includes(roleContext.role)
          : allowed.has(card.key)) &&
        !context.deniedPermissions.includes('*') &&
        card.requiredPermissions.every(
          (permission) =>
            !context.deniedPermissions.includes(permission) &&
            (context.permissions.includes('*') || context.permissions.includes(permission)),
        ),
    );
  }

  private firstAgentRole(roles: readonly string[] | undefined): BrainDomainRole | undefined {
    return roles?.map((role) => this.agentRole(role)).find((role): role is BrainDomainRole => Boolean(role));
  }

  private agentRole(value: string | undefined): BrainDomainRole | undefined {
    return AGENT_ROLES.includes(value as BrainDomainRole) ? (value as BrainDomainRole) : undefined;
  }
}
