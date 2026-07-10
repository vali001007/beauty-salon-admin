import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainPredictionSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  composeChurnInsight(input: { customerName: string; churnScore: number; churnLevel: string }) {
    return {
      conclusion: `${input.customerName} 属于${input.churnLevel}流失风险预测人群`,
      confidence: input.churnScore,
      evidence: ['来源：CustomerPredictionSnapshot.churnScore/churnLevel'],
      action: '生成挽回话术并创建跟进任务',
      entry: '/customer-marketing/workbench',
    };
  }
}
