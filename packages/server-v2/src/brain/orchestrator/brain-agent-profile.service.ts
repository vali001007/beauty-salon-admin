import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainAgentProfileService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveProfiles() {
    return this.prisma.brainAgentProfile.findMany({
      where: { enabled: true },
      orderBy: [{ roleKey: 'asc' }, { version: 'desc' }],
    });
  }
}
