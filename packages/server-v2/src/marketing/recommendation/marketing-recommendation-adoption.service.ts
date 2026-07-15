import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TerminalService } from '../../terminal/terminal.service.js';

export type AdoptRecommendationInstanceRequest = {
  mode: 'activity' | 'automation' | 'terminal_follow_up';
  clientRequestId: string;
  customerIds?: number[];
  assignments?: Array<{
    customerId: number;
    assigneeRole?: 'manager' | 'consultant' | 'reception';
    assigneeUserId: number;
    assigneeBeauticianId?: number;
  }>;
  activity?: {
    title?: string;
    startDate?: string;
    endDate?: string;
    publishPage: boolean;
  };
};

@Injectable()
export class MarketingRecommendationAdoptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terminalService: TerminalService,
  ) {}

  async adopt(
    instanceId: string,
    storeId: number,
    dto: AdoptRecommendationInstanceRequest,
    userId?: number,
    now = new Date(),
  ): Promise<any> {
    this.validateInput(instanceId, storeId, dto);
    const instance = await this.getInstance(instanceId, storeId);
    if (instance.status !== 'active' || new Date(instance.expiresAt).getTime() <= now.getTime()) {
      throw new BadRequestException('recommendation_instance_expired');
    }
    if (!this.executionModes(instance).includes(dto.mode)) {
      throw new BadRequestException('recommendation_mode_not_supported');
    }
    const adoptionKey = this.adoptionKey(instanceId, dto.mode, dto.clientRequestId);
    const existing = await this.prisma.marketingRecommendationAdoption.findUnique({ where: { adoptionKey } });
    if (existing) return this.toResponse(existing);

    try {
      if (dto.mode === 'activity') return this.adoptActivity(instance, storeId, dto, adoptionKey, userId, now);
      if (dto.mode === 'automation') return this.adoptAutomation(instance, storeId, dto, adoptionKey, userId, now);
      return this.adoptTerminalFollowUp(instance, storeId, dto, adoptionKey, userId);
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const raced = await this.prisma.marketingRecommendationAdoption.findUnique({ where: { adoptionKey } });
      if (!raced) throw error;
      return this.toResponse(raced);
    }
  }

  async resolveLegacyInstance(recommendationId: number, storeId: number) {
    const candidates = await this.prisma.marketingRecommendationInstance.findMany({
      where: { storeId, status: 'active', expiresAt: { gt: new Date() } },
      select: { id: true, evidenceSnapshot: true },
      take: 20,
    });
    const matched = candidates.filter((item: any) =>
      Number(this.object(item.evidenceSnapshot).legacyRecommendationId) === Number(recommendationId),
    );
    if (matched.length !== 1) throw new BadRequestException('legacy_recommendation_ambiguous');
    return matched[0].id;
  }

  private async adoptActivity(instance: any, storeId: number, dto: AdoptRecommendationInstanceRequest, adoptionKey: string, userId: number | undefined, now: Date) {
    const activityInput = dto.activity ?? { publishPage: false };
    const period = this.activityPeriod(now, activityInput.startDate, activityInput.endDate);
    const publishPage = Boolean(activityInput.publishPage);
    return this.prisma.$transaction(async (tx) => {
      const adoption = await tx.marketingRecommendationAdoption.create({
        data: {
          storeId,
          recommendationId: null,
          recommendationInstanceId: instance.id,
          adoptionKey,
          mode: 'activity',
          status: 'pending',
          predictionRunId: instance.predictionRunId,
          snapshotJson: this.snapshot(instance),
          createdBy: userId ?? null,
        } as any,
      });
      const activity = await tx.marketingActivity.create({
        data: {
          storeId,
          title: activityInput.title || instance.title,
          description: instance.description,
          status: publishPage ? 'active' : 'draft',
          startDate: period.startDate,
          endDate: period.endDate,
          targetCustomers: `${instance.audienceSnapshot.customerCount} 位客户`,
          discount: this.object(instance.offerSnapshot?.offerJson).label ?? null,
          sourceRecommendationId: null,
          recommendationInstanceId: instance.id,
          adoptionId: adoption.id,
          predictionRunId: instance.predictionRunId ? String(instance.predictionRunId) : null,
          audienceSnapshotId: instance.audienceSnapshot.id,
          audienceSnapshotJson: {
            snapshotId: instance.audienceSnapshot.id,
            customerCount: instance.audienceSnapshot.customerCount,
            rule: instance.audienceSnapshot.ruleJson,
          },
          sourceSignalsJson: instance.evidenceSnapshot,
          offerJson: instance.offerSnapshot?.offerJson ?? {},
          primaryPromotionId: instance.offerSnapshot?.selectedPromotionId ?? null,
          promotionIdsJson: instance.offerSnapshot?.selectedPromotionId ? [instance.offerSnapshot.selectedPromotionId] : [],
          recommendedItemsJson: this.object(instance.strategySnapshot).recommendedItems ?? [],
          publishStatus: publishPage ? 'published' : null,
          publishedAt: publishPage ? now : null,
        } as any,
      });

      let page: any = null;
      if (publishPage) {
        const pageSchema = this.pageSchema(instance, activity);
        page = await tx.marketingPage.create({
          data: {
            storeId,
            activityId: activity.id,
            recommendationInstanceId: instance.id,
            adoptionId: adoption.id,
            sourceType: 'activity',
            sourceId: String(activity.id),
            title: activity.title,
            slug: `recommendation-${instance.id}-${adoption.id}`,
            pageSchema,
            snapshotJson: { recommendationInstanceId: instance.id, adoptionId: adoption.id },
            status: 'published',
            publishedAt: now,
            createdBy: userId ?? null,
          } as any,
        });
        await tx.marketingPageVersion.create({
          data: {
            pageId: page.id,
            version: 1,
            pageSchema,
            snapshotJson: { recommendationInstanceId: instance.id, adoptionId: adoption.id },
            changeSummary: '推荐实例采纳首次发布',
            createdBy: userId ?? null,
          },
        });
      }

      const completed = await tx.marketingRecommendationAdoption.update({
        where: { id: adoption.id },
        data: { status: page ? 'published' : 'draft', activityId: activity.id, pageId: page?.id ?? null },
      });
      return this.toResponse(completed, { activityId: activity.id, pageId: page?.id });
    });
  }

  private async adoptAutomation(instance: any, storeId: number, _dto: AdoptRecommendationInstanceRequest, adoptionKey: string, userId: number | undefined, now: Date) {
    this.assertAutomationReady(instance, storeId, now);
    await this.assertPromotionUsable(instance.offerSnapshot?.selectedPromotionId, storeId, now);
    const strategy = this.object(instance.strategySnapshot);
    const triggerRule = this.object(strategy.triggerRule);
    const triggerRules = triggerRule.type ? [{ ...triggerRule, parameterSource: 'recommendation_snapshot' }] : [];
    const actions = Array.isArray(strategy.recommendedActions) && strategy.recommendedActions.length
      ? strategy.recommendedActions
      : [{ type: 'push', channel: 'in_app', value: this.object(instance.offerSnapshot?.offerJson).label ?? instance.title }];
    return this.prisma.$transaction(async (tx) => {
      const adoption = await tx.marketingRecommendationAdoption.create({
        data: {
          storeId,
          recommendationId: null,
          recommendationInstanceId: instance.id,
          adoptionKey,
          mode: 'automation',
          status: 'pending',
          predictionRunId: instance.predictionRunId,
          snapshotJson: this.snapshot(instance),
          createdBy: userId ?? null,
        } as any,
      });
      const createdStrategy = await tx.marketingAutomationStrategy.create({
        data: {
          storeId,
          name: instance.title,
          description: instance.description,
          status: 'enabled',
          executionType: 'auto',
          source: 'recommendation',
          recommendationInstanceId: instance.id,
          adoptionId: adoption.id,
          predictionRunId: instance.predictionRunId,
          audienceSnapshotId: instance.audienceSnapshot.id,
          schedule: {
            type: 'daily',
            time: '09:00',
            frequencyCap: { intervalDays: 7, maxTouches: 1 },
            recommendationInstanceId: instance.id,
          },
          triggerRules,
          ruleRelation: 'AND',
          actions,
          targetCount: instance.audienceSnapshot.customerCount,
        } as any,
      });
      const completed = await tx.marketingRecommendationAdoption.update({
        where: { id: adoption.id },
        data: { status: 'enabled', strategyId: createdStrategy.id },
      });
      return this.toResponse(completed, { strategyId: createdStrategy.id });
    });
  }

  private async adoptTerminalFollowUp(instance: any, storeId: number, dto: AdoptRecommendationInstanceRequest, adoptionKey: string, userId?: number) {
    const customerIds = this.selectedCustomerIds(instance, dto.customerIds);
    if (!customerIds.length) throw new BadRequestException('recommendation_audience_empty');
    const adoption = await this.prisma.marketingRecommendationAdoption.create({
      data: {
        storeId,
        recommendationId: null,
        recommendationInstanceId: instance.id,
        adoptionKey,
        mode: 'terminal_follow_up',
        status: 'pending',
        predictionRunId: instance.predictionRunId,
        snapshotJson: this.snapshot(instance),
        createdBy: userId ?? null,
      } as any,
    });
    try {
      const result = await this.terminalService.batchCreateFollowUpTasks(storeId, {
        customerIds,
        assignments: dto.assignments,
        recommendationInstanceId: instance.id,
        adoptionId: adoption.id,
        sourceRecommendationKey: instance.recommendationKey,
        source: 'recommendation',
        triggerType: this.object(this.object(instance.strategySnapshot).triggerRule).type,
        title: instance.title,
        script: instance.description,
        priority: this.followUpPriority(instance.priority),
        assigneeRole: 'manager',
      } as any, userId);
      const taskIds = result.items.map((item: any) => Number(item.id)).filter((id: number) => Number.isInteger(id) && id > 0);
      const duplicatedCustomerIds = result.items.filter((item: any) => item.duplicated).map((item: any) => Number(item.customerId));
      const failedCustomers = result.failures.map((failure: any) => ({
        customerId: Number(failure.customerId),
        code: 'terminal_task_create_failed',
        message: failure.message,
      }));
      const status = failedCustomers.length === 0
        ? 'dispatched'
        : taskIds.length > 0
          ? 'partial_failed'
          : 'failed';
      const completed = await this.prisma.marketingRecommendationAdoption.update({
        where: { id: adoption.id },
        data: {
          status,
          followUpTaskIds: taskIds,
          errorCode: status === 'failed'
            ? 'terminal_task_failed'
            : status === 'partial_failed'
              ? 'terminal_task_partial_failed'
              : null,
          errorMessage: failedCustomers.length ? `${failedCustomers.length} 位客户任务创建失败` : null,
        },
      });
      return this.toResponse(completed, { followUpTaskIds: taskIds, duplicatedCustomerIds, failedCustomers });
    } catch (error: any) {
      await this.prisma.marketingRecommendationAdoption.update({
        where: { id: adoption.id },
        data: { status: 'failed', errorCode: 'terminal_dispatch_failed', errorMessage: error?.message ?? '终端任务下发失败' },
      });
      throw error;
    }
  }

  private getInstance(instanceId: string, storeId: number) {
    return this.prisma.marketingRecommendationInstance.findFirst({
      where: { id: instanceId, storeId },
      include: {
        audienceSnapshot: { include: { members: { select: { customerId: true }, orderBy: { rank: 'asc' } } } },
        offerSnapshot: true,
        predictionRun: { select: { id: true, status: true, startedAt: true, finishedAt: true } },
      },
    }).then((instance) => {
      if (!instance) throw new NotFoundException('recommendation_instance_not_found');
      if (!(instance as any).audienceSnapshot) throw new BadRequestException('recommendation_audience_snapshot_missing');
      return instance as any;
    });
  }

  private assertAutomationReady(instance: any, storeId: number, now: Date) {
    if (!instance.predictionRun || instance.predictionRun.status !== 'completed' || instance.predictionRunId == null) {
      throw new BadRequestException('prediction_freshness_missing');
    }
    const generatedAt = instance.predictionRun.finishedAt ?? instance.predictionRun.startedAt;
    if (!generatedAt || now.getTime() - new Date(generatedAt).getTime() > 30 * 3600000) {
      throw new BadRequestException('prediction_freshness_stale');
    }
    if (instance.storeId !== storeId) throw new NotFoundException('recommendation_instance_not_found');
    if (Number(instance.audienceSnapshot?.customerCount ?? 0) <= 0) throw new BadRequestException('recommendation_audience_empty');
  }

  private async assertPromotionUsable(promotionId: number | null | undefined, storeId: number, now: Date) {
    if (!promotionId) return;
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        id: promotionId,
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId }, { storeId: null }],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      select: { id: true, issuedCount: true, maxIssueCount: true },
    } as any);
    if (!promotion || (promotion.maxIssueCount != null && promotion.issuedCount >= promotion.maxIssueCount)) {
      throw new BadRequestException('recommendation_offer_unavailable');
    }
  }

  private selectedCustomerIds(instance: any, requested?: number[]) {
    const audienceIds = [...new Set((instance.audienceSnapshot.members ?? []).map((item: any) => Number(item.customerId)))];
    if (!requested?.length) return audienceIds;
    const allowed = new Set(audienceIds);
    const selected = [...new Set(requested.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (selected.some((id) => !allowed.has(id))) throw new BadRequestException('customer_outside_recommendation_audience');
    return selected;
  }

  private validateInput(instanceId: string, storeId: number, dto: AdoptRecommendationInstanceRequest) {
    if (!instanceId?.trim()) throw new BadRequestException('recommendation_instance_id_required');
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('X-Store-Id is required');
    if (!['activity', 'automation', 'terminal_follow_up'].includes(dto?.mode)) throw new BadRequestException('recommendation_mode_invalid');
    if (!dto.clientRequestId?.trim()) throw new BadRequestException('client_request_id_required');
  }

  private adoptionKey(instanceId: string, mode: string, clientRequestId: string) {
    return `adoption:${instanceId}:${mode}:${clientRequestId.trim()}`;
  }

  private executionModes(instance: any) {
    return Array.isArray(instance.executionModes) ? instance.executionModes.map(String) : [];
  }

  private activityPeriod(now: Date, start?: string, end?: string) {
    const startDate = start ? new Date(start) : now;
    const endDate = end ? new Date(end) : new Date(startDate.getTime() + 30 * 24 * 3600000);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      throw new BadRequestException('activity_period_invalid');
    }
    return { startDate, endDate };
  }

  private pageSchema(instance: any, activity: any) {
    return {
      title: activity.title,
      description: instance.description,
      offer: instance.offerSnapshot?.offerJson ?? {},
      recommendedItems: this.object(instance.strategySnapshot).recommendedItems ?? [],
      recommendationInstanceId: instance.id,
    };
  }

  private followUpPriority(priority: string) {
    if (priority === 'P0') return 'urgent';
    if (priority === 'P2') return 'opportunity';
    return 'recommended';
  }

  private snapshot(instance: any) {
    return JSON.parse(JSON.stringify(instance));
  }

  private object(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private toResponse(adoption: any, overrides: Record<string, unknown> = {}) {
    return {
      adoptionId: adoption.id,
      recommendationInstanceId: adoption.recommendationInstanceId,
      mode: adoption.mode,
      status: adoption.status,
      activityId: adoption.activityId ?? undefined,
      pageId: adoption.pageId ?? undefined,
      strategyId: adoption.strategyId ?? undefined,
      followUpTaskIds: adoption.followUpTaskIds ?? undefined,
      ...overrides,
    };
  }
}
