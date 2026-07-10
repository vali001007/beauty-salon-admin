import { Injectable } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainActionConfirmationService {
  constructor(private readonly prisma: PrismaService) {}

  requiresConfirmation(riskLevel: BrainRiskLevel | 'low' | 'medium' | 'high' | 'critical') {
    return riskLevel === 'high' || riskLevel === 'critical';
  }

  createPreview(input: {
    runId: number;
    userId: number;
    storeId: number;
    skillKey: string;
    riskLevel: BrainRiskLevel;
    preview: Prisma.InputJsonValue;
    payload: Prisma.InputJsonValue;
  }) {
    const actionId = `brain_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.prisma.brainActionConfirmation.create({ data: { actionId, ...input } });
  }
}
