import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainMetricRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  findActiveMetric(metricKey: string) {
    return this.prisma.brainMetric.findFirst({
      where: { metricKey, status: 'active' },
      orderBy: { version: 'desc' },
    });
  }

  listActiveMetrics() {
    return this.prisma.brainMetric.findMany({
      where: { status: 'active' },
      orderBy: [{ domain: 'asc' }, { metricKey: 'asc' }],
    });
  }
}
