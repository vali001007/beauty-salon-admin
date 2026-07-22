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

export function resolveBrainDomainRole(value: string | undefined): BrainDomainRole | undefined {
  if (!value) return undefined;
  if (AGENT_ROLES.includes(value as BrainDomainRole)) return value as BrainDomainRole;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('customer_service') || normalized.includes('customer-service')) return 'customer_service';
  if (/(reception|front[_-]?desk|cashier)/.test(normalized)) return 'receptionist';
  if (normalized.includes('marketing')) return 'marketing';
  if (normalized.includes('beautician')) return 'beautician';
  if (normalized.includes('inventory')) return 'inventory';
  if (normalized.includes('finance')) return 'finance';
  if (/(full[_-]?manager|store[_-]?manager|manager|super[_-]?admin|admin)/.test(normalized)) {
    return 'store_manager';
  }
  return undefined;
}

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
    const role = authenticatedRole ?? 'store_manager';
    const profile = await this.profiles.getRuntimeProfile(role);
    if (!profile) throw new NotFoundException(`active_brain_agent_profile_not_found:${role}`);

    return {
      role,
      expressionRole: hintedRole ?? role,
      source: authenticatedRole ? 'authenticated_role' : 'default',
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
    const isSuperAdmin = context.roles?.includes('super_admin') === true;
    return cards.filter(
      (card) =>
        (card.generatedCapability === true
          ? isSuperAdmin || card.allowedRoles.length === 0 || card.allowedRoles.includes(roleContext.role)
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
    return resolveBrainDomainRole(value);
  }
}
