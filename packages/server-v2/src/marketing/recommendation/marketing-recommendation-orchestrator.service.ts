import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MarketingFeatureFlagsService } from '../marketing-feature-flags.service.js';
import { MarketingPredictionRunService } from '../prediction/marketing-prediction-run.service.js';
import { getShanghaiBusinessDate } from '../prediction/marketing-prediction.types.js';
import { LifecycleRecommendationProvider } from './lifecycle-recommendation.provider.js';
import type { RecommendationProvider } from './recommendation-provider.interface.js';
import { PredictionRecommendationProvider } from './prediction-recommendation.provider.js';
import { ProductProjectRecommendationProvider } from './product-project-recommendation.provider.js';
import { MarketingRecommendationOfferService } from './marketing-recommendation-offer.service.js';
import type {
  RecommendationBuildContext,
  RecommendationCandidate,
  RefreshRecommendationInstancesResult,
} from './marketing-recommendation.types.js';

@Injectable()
export class MarketingRecommendationOrchestratorService {
  private readonly inFlightRefreshes = new Map<string, Promise<RefreshRecommendationInstancesResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly predictionRunService: MarketingPredictionRunService,
    private readonly predictionProvider: PredictionRecommendationProvider,
    private readonly lifecycleProvider: LifecycleRecommendationProvider,
    private readonly productProjectProvider: ProductProjectRecommendationProvider,
    private readonly offerMatcher: MarketingRecommendationOfferService,
    private readonly flags: MarketingFeatureFlagsService,
  ) {}

  async refreshForStore(storeId: number, now = new Date()): Promise<RefreshRecommendationInstancesResult> {
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('X-Store-Id is required');
    const businessDate = getShanghaiBusinessDate(now);
    const lockKey = `${storeId}:${businessDate}`;
    const inFlight = this.inFlightRefreshes.get(lockKey);
    if (inFlight) return inFlight;

    const refresh = this.performRefreshForStore(storeId, businessDate, now);
    this.inFlightRefreshes.set(lockKey, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlightRefreshes.get(lockKey) === refresh) this.inFlightRefreshes.delete(lockKey);
    }
  }

  private async performRefreshForStore(
    storeId: number,
    businessDate: string,
    now: Date,
  ): Promise<RefreshRecommendationInstancesResult> {
    const prediction = await this.predictionRunService.runForStore(storeId, now);
    if (prediction.run.status !== 'completed') throw new BadRequestException('prediction_run_not_completed');

    const context: RecommendationBuildContext = {
      storeId,
      businessDate,
      predictionRunId: prediction.run.id,
      predictionModelVersion: prediction.run.modelVersion,
      generatedAt: now,
    };
    const providers: RecommendationProvider[] = [
      this.predictionProvider,
      this.lifecycleProvider,
      this.productProjectProvider,
    ];
    const candidates = (await Promise.all(providers.map((provider) => provider.build(context)))).flat();
    const result: RefreshRecommendationInstancesResult = {
      predictionRunId: prediction.run.id,
      reusedPredictionRun: Boolean(prediction.reused),
      createdInstanceIds: [],
      reusedInstanceIds: [],
      supersededInstanceIds: [],
      generatedAt: now.toISOString(),
    };
    if (!this.flags.isEnabledForStore('recommendationInstanceWrite', storeId)) return result;

    const scopedCandidates = await this.scopeCandidateAudiences(storeId, candidates);
    const matchedCandidates = await this.offerMatcher.matchMany(storeId, scopedCandidates, now);

    for (const matchedCandidate of matchedCandidates) {
      const fingerprint = this.fingerprint(matchedCandidate, context);
      const existing = await this.prisma.marketingRecommendationInstance.findUnique({
        where: {
          storeId_recommendationKey_fingerprint: {
            storeId,
            recommendationKey: matchedCandidate.recommendationKey,
            fingerprint,
          },
        },
      });
      if (existing) {
        result.reusedInstanceIds.push(existing.id);
        continue;
      }

      try {
        const transactionResult = await this.prisma.$transaction(async (tx) => {
          const superseded = await tx.marketingRecommendationInstance.findMany({
            where: {
              storeId,
              recommendationKey: matchedCandidate.recommendationKey,
              status: 'active',
            },
            select: { id: true },
          });
          await tx.marketingRecommendationInstance.updateMany({
            where: {
              storeId,
              recommendationKey: matchedCandidate.recommendationKey,
              status: 'active',
            },
            data: { status: 'superseded', supersededAt: now },
          });
          const created = await tx.marketingRecommendationInstance.create({
            data: {
              storeId,
              recommendationKey: matchedCandidate.recommendationKey,
              sourceType: matchedCandidate.sourceType,
              sourceVersion: matchedCandidate.sourceVersion,
              predictionRunId: context.predictionRunId,
              businessDate: new Date(`${businessDate}T00:00:00.000Z`),
              status: 'active',
              title: matchedCandidate.title,
              description: matchedCandidate.description,
              priority: matchedCandidate.priority,
              urgency: matchedCandidate.urgency,
              preferredMode: matchedCandidate.preferredMode,
              executionModes: matchedCandidate.executionModes,
              evidenceSnapshot: matchedCandidate.evidenceSnapshot,
              strategySnapshot: matchedCandidate.strategySnapshot,
              targetCount: matchedCandidate.customerIds.length,
              fingerprint,
              generatedAt: now,
              expiresAt: matchedCandidate.expiresAt,
            } as any,
          });
          const audience = await tx.marketingRecommendationAudienceSnapshot.create({
            data: {
              recommendationInstanceId: created.id,
              storeId,
              ruleJson: matchedCandidate.audienceRule,
              customerCount: matchedCandidate.customerIds.length,
              generatedAt: now,
            } as any,
          });
          if (matchedCandidate.customerIds.length) {
            const reasonByCustomer = new Map(matchedCandidate.audienceReasons.map((item) => [item.customerId, item]));
            await tx.marketingRecommendationAudienceMember.createMany({
              data: matchedCandidate.customerIds.map((customerId, index) => {
                const reason = reasonByCustomer.get(customerId);
                return {
                  snapshotId: audience.id,
                  storeId,
                  customerId,
                  rank: index + 1,
                  score: reason?.score ?? 0,
                  reasonJson: { reason: reason?.reason ?? '命中推荐规则' },
                };
              }),
              skipDuplicates: true,
            });
          }
          await tx.marketingRecommendationOfferSnapshot.create({
            data: {
              recommendationInstanceId: created.id,
              storeId,
              selectedPromotionId: matchedCandidate.offerContext.selectedPromotionId ?? null,
              offerJson: matchedCandidate.offerContext.offer ?? {},
              alternativesJson: matchedCandidate.offerContext.alternatives ?? [],
              fitBreakdownJson: matchedCandidate.offerContext.fitBreakdown ?? undefined,
              inventorySnapshotJson: matchedCandidate.offerContext.inventorySnapshot ?? undefined,
              capacitySnapshotJson: matchedCandidate.offerContext.capacitySnapshot ?? undefined,
              riskWarningsJson: matchedCandidate.offerContext.riskWarnings ?? [],
              generatedAt: now,
            } as any,
          });
          return { created, supersededIds: superseded.map((item) => item.id) };
        });
        result.createdInstanceIds.push(transactionResult.created.id);
        result.supersededInstanceIds.push(...transactionResult.supersededIds);
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        const raced = await this.prisma.marketingRecommendationInstance.findUnique({
          where: {
            storeId_recommendationKey_fingerprint: {
              storeId,
              recommendationKey: matchedCandidate.recommendationKey,
              fingerprint,
            },
          },
        });
        if (!raced) throw error;
        result.reusedInstanceIds.push(raced.id);
      }
    }
    return result;
  }

  private async scopeCandidateAudiences(
    storeId: number,
    candidates: RecommendationCandidate[],
  ): Promise<RecommendationCandidate[]> {
    const allCustomerIds = [
      ...new Set(
        candidates
          .flatMap((candidate) => candidate.customerIds)
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    if (!allCustomerIds.length) {
      return candidates.map((candidate) => ({ ...candidate, customerIds: [], audienceReasons: [] }));
    }
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: allCustomerIds }, storeId, deletedAt: null },
      select: { id: true },
    });
    const allowed = new Set(customers.map((customer) => customer.id));
    return candidates.map((candidate) => {
      const uniqueIds = [...new Set(candidate.customerIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
      return {
        ...candidate,
        customerIds: uniqueIds.filter((id) => allowed.has(id)),
        audienceReasons: candidate.audienceReasons.filter((item) => allowed.has(item.customerId)),
      };
    });
  }

  private fingerprint(candidate: RecommendationCandidate, context: RecommendationBuildContext) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          recommendationKey: candidate.recommendationKey,
          predictionRunId: context.predictionRunId,
          customerIds: [...candidate.customerIds].sort((left, right) => left - right),
          selectedPromotionId: candidate.offerContext.selectedPromotionId ?? null,
          strategySnapshot: candidate.strategySnapshot ?? null,
          expiresAt: candidate.expiresAt.toISOString(),
        }),
      )
      .digest('hex');
  }
}
