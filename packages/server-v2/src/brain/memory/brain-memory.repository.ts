import { Injectable } from '@nestjs/common';
import { BrainMemoryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainMemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveMemories(storeId: number, subjectKey: string) {
    return this.prisma.brainMemory.findMany({
      where: {
        storeId,
        subjectKey,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  writeMemory(input: {
    storeId: number;
    userId?: number;
    type: BrainMemoryType;
    subjectKey: string;
    content: Prisma.InputJsonValue;
    confidence: number;
    expiresAt?: Date;
    sourceRunId?: number;
  }) {
    return this.prisma.brainMemory.create({ data: input });
  }
}
