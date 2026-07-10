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

  getRunTrace(runId: number) {
    return this.prisma.brainRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async listTraces() {
    const [items, total] = await Promise.all([
      this.prisma.brainRun.findMany({
        orderBy: { id: 'desc' },
        take: 50,
      }),
      this.prisma.brainRun.count(),
    ]);

    return { items, total };
  }
}
