import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainOntologyService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveEntities(domain?: string) {
    return this.prisma.brainOntologyEntity.findMany({
      where: { status: 'active', ...(domain ? { domain } : {}) },
      orderBy: [{ domain: 'asc' }, { entityKey: 'asc' }, { version: 'desc' }],
    });
  }

  findActiveEntity(entityKey: string) {
    return this.prisma.brainOntologyEntity.findFirst({
      where: { entityKey, status: 'active' },
      orderBy: { version: 'desc' },
    });
  }
}
