import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainPredictionSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async rankLatestCustomerPredictions(input: {
    storeId: number;
    metric: 'repurchase30d' | 'marketingResponse';
    limit?: number;
  }) {
    const run = await this.latestCompletedRun(input.storeId);
    if (!run) {
      return {
        status: 'missing' as const,
        boundary: '当前门店没有已完成的客户预测批次，不能用普通客户分群或历史消费冒充预测排行。',
      };
    }
    const limit = Math.max(1, Math.min(50, input.limit ?? 10));
    const scoreField = input.metric === 'repurchase30d' ? 'repurchase30dScore' : 'marketingResponseScore';
    const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
      where: {
        storeId: input.storeId,
        runId: run.id,
        customer: { deletedAt: null },
      },
      select: {
        id: true,
        repurchase30dScore: true,
        marketingResponseScore: true,
        ltv12m: true,
        ltvTier: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: [{ [scoreField]: 'desc' }, { ltv12m: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return {
      status: 'available' as const,
      metric: input.metric,
      predictionRun: this.runMetadata(run),
      rows: snapshots.map((snapshot, index) => ({
        rank: index + 1,
        customerId: snapshot.customer.id,
        customerName: snapshot.customer.name,
        maskedPhone: this.maskPhone(snapshot.customer.phone),
        repurchase30dScore: snapshot.repurchase30dScore,
        marketingResponseScore: snapshot.marketingResponseScore,
        ltv12m: this.number(snapshot.ltv12m),
        ltvTier: snapshot.ltvTier,
      })),
      boundary:
        input.metric === 'repurchase30d'
          ? '当前资产是未来 30 天复购评分，不是周末专属复购概率；只能作为本周末人工跟进优先级参考。'
          : '营销响应评分是预测优先级，不代表客户一定响应；触达前仍需人工复核实时状态和授权。',
    };
  }

  async getLatestCustomerLtv12m(input: {
    storeId: number;
    customerName?: string;
    phoneTail?: string;
  }) {
    const run = await this.latestCompletedRun(input.storeId);
    if (!run) {
      return {
        status: 'missing_run' as const,
        boundary: '当前门店没有已完成的客户预测批次，不能临时估算12个月生命周期价值。',
      };
    }
    const customerName = input.customerName?.trim();
    const phoneTail = input.phoneTail?.trim();
    if (!customerName && !phoneTail) {
      return {
        status: 'missing_identity' as const,
        predictionRun: this.runMetadata(run),
        boundary: '请提供客户姓名或手机号后四位后查询12个月生命周期价值。',
      };
    }
    const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
      where: {
        storeId: input.storeId,
        runId: run.id,
        customer: {
          deletedAt: null,
          ...(customerName && phoneTail
            ? { AND: [{ name: { contains: customerName } }, { phone: { endsWith: phoneTail } }] }
            : customerName
              ? { name: { contains: customerName } }
              : { phone: { endsWith: phoneTail! } }),
        },
      },
      select: {
        id: true,
        ltv12m: true,
        ltvTier: true,
        customer: { select: { id: true, name: true, phone: true, memberLevel: true } },
      },
      orderBy: [{ customerId: 'asc' }],
      take: 10,
    });
    if (!snapshots.length) {
      return {
        status: 'not_found' as const,
        predictionRun: this.runMetadata(run),
        boundary: '最新完成预测批次中没有找到匹配客户，请核对姓名或手机号后四位。',
      };
    }
    if (snapshots.length > 1) {
      return {
        status: 'ambiguous' as const,
        predictionRun: this.runMetadata(run),
        candidates: snapshots.map((snapshot) => ({
          customerId: snapshot.customer.id,
          customerName: snapshot.customer.name,
          maskedPhone: this.maskPhone(snapshot.customer.phone),
          memberLevel: snapshot.customer.memberLevel,
        })),
        boundary: '找到多位同名客户，必须先用手机号后四位确认身份，不能猜测其中一位的生命周期价值。',
      };
    }
    const snapshot = snapshots[0]!;
    return {
      status: 'available' as const,
      snapshotId: snapshot.id,
      customerId: snapshot.customer.id,
      customerName: snapshot.customer.name,
      maskedPhone: this.maskPhone(snapshot.customer.phone),
      memberLevel: snapshot.customer.memberLevel,
      ltv12m: this.number(snapshot.ltv12m),
      ltvTier: snapshot.ltvTier,
      predictionRun: this.runMetadata(run),
      boundary: '12个月生命周期价值是预测值，不是已实现收入；只能用于人工经营判断。',
    };
  }

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

  private latestCompletedRun(storeId: number) {
    return this.prisma.predictionRun.findFirst({
      where: { storeId, status: 'completed' },
      orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        modelVersion: true,
        businessDate: true,
        customerCount: true,
        startedAt: true,
        finishedAt: true,
      },
    });
  }

  private runMetadata(run: {
    id: number;
    modelVersion: string;
    businessDate: Date | null;
    customerCount: number;
    startedAt: Date;
    finishedAt: Date | null;
  }) {
    return {
      id: run.id,
      modelVersion: run.modelVersion,
      businessDate: run.businessDate?.toISOString().slice(0, 10) ?? null,
      customerCount: run.customerCount,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  private maskPhone(phone?: string | null) {
    if (!phone) return '未记录';
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 4 ? `***${digits.slice(-4)}` : '***';
  }
}
