import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
    const entityId = String(input.entityId);
    const actorId = input.actorId === undefined || input.actorId === null ? null : String(input.actorId);
    const payload = input.payload ?? {};
    const resultChecksum = sha256({
      eventType: input.eventType,
      entityType: input.entityType,
      entityId,
      actorType: input.actorType,
      actorId,
      payload,
    });
    return this.prisma.brainGovernanceEvent.create({
      data: {
        candidateId: input.candidateId ?? null,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId,
        actorType: input.actorType,
        actorId,
        payload: json(payload),
        resultChecksum,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  return canonicalStringify(normalized);
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
