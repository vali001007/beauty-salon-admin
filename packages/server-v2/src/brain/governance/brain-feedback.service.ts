import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  createFeedback(input: {
    runId: number;
    userId: number;
    storeId: number;
    rating: string;
    correction?: Prisma.InputJsonValue;
  }) {
    return this.prisma.brainFeedback.create({ data: input });
  }
}
