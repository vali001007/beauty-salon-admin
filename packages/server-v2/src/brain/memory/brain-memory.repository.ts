import { Injectable } from '@nestjs/common';
import { BrainMemoryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainMemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveMemories(storeId: number, subjectKey: string, userId?: number) {
    return this.prisma.brainMemory.findMany({
      where: {
        storeId,
        subjectKey,
        deletedAt: null,
        OR: userId ? [{ userId: null }, { userId }] : [{ userId: null }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findRelevantMemories(input: { storeId: number; userId: number; subjectPrefixes?: string[]; take?: number }) {
    const prefixes = input.subjectPrefixes?.filter(Boolean) ?? [];
    return this.prisma.brainMemory.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        OR: [{ userId: null }, { userId: input.userId }],
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          ...(prefixes.length ? [{ OR: prefixes.map((prefix) => ({ subjectKey: { startsWith: prefix } })) }] : []),
        ],
      },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      take: input.take ?? 20,
    });
  }

  listScoped(input: { storeId: number; userId?: number; includeDeleted?: boolean; take?: number }) {
    return this.prisma.brainMemory.findMany({
      where: {
        storeId: input.storeId,
        ...(input.userId ? { OR: [{ userId: null }, { userId: input.userId }] } : {}),
        ...(input.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { updatedAt: 'desc' },
      take: input.take ?? 100,
    });
  }

  findScopedById(input: { id: number; storeId: number; userId?: number }) {
    return this.prisma.brainMemory.findFirst({
      where: {
        id: input.id,
        storeId: input.storeId,
        ...(input.userId ? { OR: [{ userId: null }, { userId: input.userId }] } : {}),
      },
    });
  }

  findLatestIdentity(input: { storeId: number; userId?: number; type: BrainMemoryType; subjectKey: string }) {
    return this.prisma.brainMemory.findFirst({
      where: {
        storeId: input.storeId,
        userId: input.userId ?? null,
        type: input.type,
        subjectKey: input.subjectKey,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
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

  updateMemory(id: number, data: Prisma.BrainMemoryUpdateInput) {
    return this.prisma.brainMemory.update({ where: { id }, data });
  }

  createRevision(input: {
    memoryId: number;
    previousMemoryId?: number;
    revisionType: string;
    previousContent?: Prisma.InputJsonValue;
    nextContent?: Prisma.InputJsonValue;
    changedByUserId: number;
    reason?: string;
  }) {
    return this.prisma.brainMemoryRevision.create({ data: input });
  }
}
