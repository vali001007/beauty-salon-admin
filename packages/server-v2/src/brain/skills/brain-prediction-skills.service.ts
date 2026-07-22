import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async getCustomerPrediction(input: { storeId: number; customerId: number; now?: Date; staleAfterDays?: number }) {
    const now = input.now ?? new Date();
    const staleAfterDays = input.staleAfterDays ?? 30;
    const snapshot = await this.prisma.customerPredictionSnapshot.findFirst({
      where: { storeId: input.storeId, customerId: input.customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        run: { select: { id: true, status: true, startedAt: true, finishedAt: true } },
        lifecycleSnapshots: {
          orderBy: { computedAt: 'desc' },
          take: 1,
          select: { lifecycleStage: true, churnRiskLevel: true, computedAt: true, evidenceJson: true },
        },
      },
    });
    if (!snapshot) {
      return {
        status: 'missing' as const,
        staleAfterDays,
        boundary: '当前客户没有预测快照，不能用规则或历史记忆冒充模型结果。',
      };
    }
    const ageDays = Math.max(0, Math.floor((now.getTime() - snapshot.createdAt.getTime()) / 86_400_000));
    const lifecycle = snapshot.lifecycleSnapshots[0];
    return {
      status: ageDays > staleAfterDays ? ('stale' as const) : ('available' as const),
      snapshotId: snapshot.id,
      customerId: snapshot.customerId,
      customerName: snapshot.customer.name,
      modelVersion: snapshot.modelVersion,
      generatedAt: snapshot.createdAt.toISOString(),
      predictionRun: {
        id: snapshot.run.id,
        status: snapshot.run.status,
        startedAt: snapshot.run.startedAt.toISOString(),
        finishedAt: snapshot.run.finishedAt?.toISOString() ?? null,
      },
      ageDays,
      staleAfterDays,
      churn: { score: this.score(snapshot.churnScore), level: snapshot.churnLevel },
      repurchase30d: { score: this.score(snapshot.repurchase30dScore) },
      marketingResponse: { score: this.score(snapshot.marketingResponseScore) },
      customerValue: {
        ltv6m: this.number(snapshot.ltv6m),
        ltv12m: this.number(snapshot.ltv12m),
        tier: snapshot.ltvTier,
      },
      features: this.jsonObject(snapshot.featureJson),
      reasons: this.jsonArray(snapshot.reasonJson),
      recommendedActions: this.jsonArray(snapshot.recommendedActionsJson),
      lifecycleStage: lifecycle?.lifecycleStage,
      lifecycleRiskLevel: lifecycle?.churnRiskLevel,
      lifecycleComputedAt: lifecycle?.computedAt.toISOString(),
      lifecycleEvidence: lifecycle ? this.jsonObject(lifecycle.evidenceJson) : undefined,
      boundary:
        ageDays > staleAfterDays
          ? `预测快照已生成 ${ageDays} 天，超过 ${staleAfterDays} 天有效期，只能用于历史解释，不能直接形成执行动作。`
          : '预测用于优先级和建议，不是确定事实；执行前必须回查实时客户、预约和权益状态。',
    };
  }

  private score(value: number) {
    return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
  }

  private number(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }

  private jsonObject(value: Prisma.JsonValue) {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private jsonArray(value: Prisma.JsonValue) {
    return Array.isArray(value) ? value : value == null ? [] : [value];
  }
}
