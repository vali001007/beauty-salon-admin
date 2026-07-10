import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

const WRITE_PATTERN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i;

@Injectable()
export class BrainReadonlyQueryExecutorService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(sql: string, params: unknown[]) {
    if (WRITE_PATTERN.test(sql)) {
      throw new Error('readonly_query_violation');
    }

    return this.prisma.$queryRawUnsafe(sql, ...params);
  }
}
