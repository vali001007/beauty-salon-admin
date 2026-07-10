import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainSkillRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  listEnabledSkills() {
    return this.prisma.brainSkillRegistry.findMany({
      where: { enabled: true },
      orderBy: [{ type: 'asc' }, { skillKey: 'asc' }],
    });
  }

  findEnabledSkill(skillKey: string) {
    return this.prisma.brainSkillRegistry.findFirst({
      where: { skillKey, enabled: true },
      orderBy: { version: 'desc' },
    });
  }
}
