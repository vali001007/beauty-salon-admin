import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type BrainGovernanceActorType = 'user' | 'ci' | 'service' | 'system';

@Injectable()
export class BrainGovernanceEventService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    candidateId?: number | null;
    eventType: string;
    entityType: string;
    entityId: string | number;
    actorType: BrainGovernanceActorType;
    actorId?: string | number | null;
    payload?: Record<string, unknown>;
    createdAt?: Date;
  }) {
    return this.prisma.brainGovernanceEvent.create({
      data: {
        candidateId: input.candidateId ?? null,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: String(input.entityId),
        actorType: input.actorType,
        actorId: input.actorId === undefined || input.actorId === null ? null : String(input.actorId),
        payload: json(input.payload ?? {}),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
