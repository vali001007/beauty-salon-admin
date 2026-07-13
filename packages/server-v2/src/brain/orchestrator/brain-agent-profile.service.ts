import { BadRequestException, Injectable } from '@nestjs/common';
import type { BrainAgentProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BRAIN_AGENT_CARDS, type BrainAgentRoleKey } from './brain-agent-card.registry.js';

@Injectable()
export class BrainAgentProfileService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveProfiles() {
    return this.prisma.brainAgentProfile.findMany({
      where: { enabled: true },
      orderBy: [{ roleKey: 'asc' }, { version: 'desc' }],
    });
  }

  getActiveProfile(roleKey: BrainAgentRoleKey | string) {
    return this.prisma.brainAgentProfile.findFirst({
      where: { roleKey, enabled: true },
      orderBy: { version: 'desc' },
    });
  }

  validateForPublish(input: {
    profile: Pick<BrainAgentProfile, 'roleKey' | 'allowedSkills' | 'dataScopeRules' | 'version'>;
    availableSkills: string[];
    registeredPermissions: string[];
  }) {
    const knownRole = BRAIN_AGENT_CARDS.some((card) => card.roleKey === input.profile.roleKey);
    if (!knownRole) throw new BadRequestException(`unknown_brain_role:${input.profile.roleKey}`);

    const allowedSkills = this.stringArray(input.profile.allowedSkills);
    const unknownSkills = allowedSkills.filter((skill) => !input.availableSkills.includes(skill));
    if (unknownSkills.length) throw new BadRequestException(`unknown_brain_skills:${unknownSkills.join(',')}`);

    const scope = this.jsonObject(input.profile.dataScopeRules);
    const requiredPermissions = this.stringArray(scope.requiredPermissions as Prisma.JsonValue | undefined);
    const unknownPermissions = requiredPermissions.filter((permission) => !input.registeredPermissions.includes(permission));
    if (unknownPermissions.length) throw new BadRequestException(`unregistered_permissions:${unknownPermissions.join(',')}`);

    return {
      valid: true,
      roleKey: input.profile.roleKey,
      version: input.profile.version,
      allowedSkills,
      requiredPermissions,
    };
  }

  buildReleaseItem(profile: Pick<BrainAgentProfile, 'roleKey' | 'version' | 'allowedSkills' | 'dataScopeRules' | 'knowledgePack'>) {
    return {
      itemType: 'agent_profile',
      itemKey: profile.roleKey,
      version: profile.version,
      snapshot: {
        allowedSkills: profile.allowedSkills,
        dataScopeRules: profile.dataScopeRules,
        knowledgePack: profile.knowledgePack,
      },
    };
  }

  private stringArray(value: Prisma.JsonValue | undefined) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private jsonObject(value: Prisma.JsonValue) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Prisma.JsonObject : {};
  }
}
