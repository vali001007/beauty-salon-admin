import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainKnowledgeGraphService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveRelations(fromEntityKey?: string, toEntityKey?: string) {
    return this.prisma.brainOntologyRelation.findMany({
      where: {
        status: 'active',
        ...(fromEntityKey ? { fromEntityKey } : {}),
        ...(toEntityKey ? { toEntityKey } : {}),
      },
      orderBy: [{ relationKey: 'asc' }, { version: 'desc' }],
    });
  }
}
