import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainTraceService {
  constructor(private readonly prisma: PrismaService) {}

  recordStep(input: {
    runId: number;
    stepKey: string;
    layer: string;
    input?: Prisma.InputJsonValue;
    output?: Prisma.InputJsonValue;
    status: string;
    latencyMs?: number;
    error?: Prisma.InputJsonValue;
  }) {
    return this.prisma.brainRunStep.create({ data: input });
  }

  getRunTrace(input: { runId: number; storeId: number }) {
    return this.prisma.brainRun.findFirst({
      where: { id: input.runId, storeId: input.storeId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async listTraces(input: { storeId: number }) {
    const [items, total] = await Promise.all([
      this.prisma.brainRun.findMany({
        where: { storeId: input.storeId },
        orderBy: { id: 'desc' },
        take: 50,
      }),
      this.prisma.brainRun.count({ where: { storeId: input.storeId } }),
    ]);

    return { items, total };
  }
}
