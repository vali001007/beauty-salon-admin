import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MarketingAudienceService } from './marketing-audience.service.js';

const DELIVERY_BATCH_SIZE = 500;
const ATTRIBUTION_WINDOW_DAYS = 30;

@Injectable()
export class MarketingExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceService: MarketingAudienceService,
  ) {}

  async start(strategyId: number, storeId: number, idempotencyKey: string) {
    const [existing, strategy] = await Promise.all([
      this.prisma.marketingAutomationExecution.findUnique({
        where: { strategyId_idempotencyKey: { strategyId, idempotencyKey } },
      }),
      this.prisma.marketingAutomationStrategy.findFirst({
        where: { id: strategyId, storeId },
      }),
    ]);
    if (existing) return existing;
    if (!strategy) throw new NotFoundException('Strategy not found');
    if (strategy.status !== 'enabled') throw new BadRequestException('Only enabled strategies can execute');

    if (strategy.audienceSnapshotId) {
      return this.startFromPersistedAudience(strategy as any, storeId, idempotencyKey);
    }

    const audience = await this.audienceService.buildForStrategy(strategy as any);
    const channel = this.extractPrimaryChannel(strategy.actions);
    const title = String(strategy.name || '门店服务提醒');
    const content = this.extractPrimaryActionContent(strategy.actions);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const execution = await tx.marketingAutomationExecution.create({
          data: {
            storeId,
            strategyId,
            idempotencyKey,
            strategyName: strategy.name,
            status: audience.customers.length > 0 ? 'pending' : 'success',
            triggeredCount: audience.source.matchedCustomerCount,
            queuedCount: audience.customers.length,
            reachedCount: 0,
            failedCount: 0,
            channel,
            audienceSnapshotJson: audience.source,
            executedAt: now,
            completedAt: audience.customers.length > 0 ? null : now,
            message: audience.customers.length > 0 ? 'delivery_jobs_queued' : 'no_eligible_customers',
          },
        });

        for (const chunk of this.chunk(audience.customers, DELIVERY_BATCH_SIZE)) {
          await tx.marketingAutomationTouch.createMany({
            data: chunk.map((customer) => ({
              executionId: execution.id,
              strategyId,
              customerId: customer.id,
              predictionSnapshotId: customer.prediction?.id ?? null,
              predictedConversionScore: customer.predictedConversionScore,
              predictedRevenue: customer.predictedRevenue,
              channel,
              status: 'queued',
              attemptCount: 0,
              touchedAt: now,
              attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
            })),
          });
        }

        if (audience.customers.length > 0) {
          const touches = await tx.marketingAutomationTouch.findMany({
            where: { executionId: execution.id },
            select: { id: true, customerId: true },
          });
          const touchByCustomerId = new Map<number, number>(
            touches.map((touch: any) => [Number(touch.customerId), Number(touch.id)]),
          );
          const jobs = audience.customers
            .map((customer) => ({
              storeId,
              executionId: execution.id,
              touchId: touchByCustomerId.get(customer.id),
              strategyId,
              customerId: customer.id,
              channel,
              title,
              content,
              status: 'queued',
              attemptCount: 0,
              maxAttempts: 4,
              availableAt: now,
            }))
            .filter((job): job is typeof job & { touchId: number } => Number.isInteger(job.touchId));

          if (jobs.length !== audience.customers.length) {
            throw new Error('marketing_touch_job_link_incomplete');
          }
          for (const chunk of this.chunk(jobs, DELIVERY_BATCH_SIZE)) {
            await tx.marketingDeliveryJob.createMany({ data: chunk });
          }
        }

        await tx.marketingAutomationStrategy.update({
          where: { id: strategyId },
          data: { lastExecutedAt: now, targetCount: audience.customers.length },
        });

        return {
          ...execution,
          status: audience.customers.length > 0 ? 'pending' : 'success',
          triggeredCount: audience.source.matchedCustomerCount,
          queuedCount: audience.customers.length,
          reachedCount: 0,
          failedCount: 0,
          audienceSnapshotJson: audience.source,
        };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const raced = await this.prisma.marketingAutomationExecution.findUnique({
          where: { strategyId_idempotencyKey: { strategyId, idempotencyKey } },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async startFromPersistedAudience(strategy: any, storeId: number, idempotencyKey: string) {
    const channel = this.extractPrimaryChannel(strategy.actions);
    const title = String(strategy.name || '门店服务提醒');
    const content = this.extractPrimaryActionContent(strategy.actions);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      WITH valid_members AS MATERIALIZED (
        SELECT member."customerId", member."predictionData"
        FROM "MarketingRecommendationAudienceMember" member
        INNER JOIN "Customer" customer ON customer."id" = member."customerId"
        WHERE member."snapshotId" = ${String(strategy.audienceSnapshotId)}
          AND member."storeId" = ${storeId}
          AND customer."storeId" = ${storeId}
          AND customer."deletedAt" IS NULL
      ),
      eligible_members AS MATERIALIZED (
        SELECT member.*
        FROM valid_members member
        WHERE NOT EXISTS (
          SELECT 1
          FROM "MarketingAutomationTouch" touch
          INNER JOIN "MarketingAutomationExecution" execution ON execution."id" = touch."executionId"
          WHERE touch."customerId" = member."customerId"
            AND execution."storeId" = ${storeId}
            AND (
              (touch."strategyId" = ${Number(strategy.id)} AND touch."touchedAt" >= ${sevenDaysAgo})
              OR (touch."channel" = ${channel} AND touch."touchedAt" >= ${oneDayAgo})
            )
        )
      ),
      scored_members AS MATERIALIZED (
        SELECT
          member."customerId",
          CASE
            WHEN COALESCE(member."predictionData"->>'predictionSnapshotId', '') ~ '^[0-9]+$'
              THEN (member."predictionData"->>'predictionSnapshotId')::integer
            ELSE NULL
          END AS "predictionSnapshotId",
          LEAST(
            100,
            GREATEST(
              0,
              COALESCE(NULLIF(member."predictionData"->>'marketingResponseScore', '')::numeric, 45) + 5
            )
          )::integer AS "predictedConversionScore",
          COALESCE(NULLIF(member."predictionData"->>'ltv6m', '')::numeric, 800) AS "ltv6m"
        FROM eligible_members member
      ),
      audience_counts AS MATERIALIZED (
        SELECT
          (SELECT COUNT(*)::integer FROM "Customer" customer WHERE customer."storeId" = ${storeId} AND customer."deletedAt" IS NULL) AS "totalCustomerCount",
          (SELECT COUNT(*)::integer FROM valid_members) AS "matchedCustomerCount",
          (SELECT COUNT(*)::integer FROM scored_members) AS "eligibleCustomerCount"
      ),
      inserted_execution AS (
        INSERT INTO "MarketingAutomationExecution" (
          "storeId", "strategyId", "idempotencyKey", "strategyName", "status",
          "triggeredCount", "queuedCount", "reachedCount", "failedCount", "channel",
          "audienceSnapshotJson", "executedAt", "startedAt", "completedAt", "updatedAt", "message"
        )
        SELECT
          ${storeId},
          ${Number(strategy.id)},
          ${idempotencyKey},
          ${String(strategy.name)},
          CASE WHEN counts."eligibleCustomerCount" > 0 THEN 'pending' ELSE 'success' END,
          counts."matchedCustomerCount",
          counts."eligibleCustomerCount",
          0,
          0,
          ${channel},
          jsonb_build_object(
            'predictionRunId', CAST(${strategy.predictionRunId ? Number(strategy.predictionRunId) : null} AS integer),
            'audienceSnapshotId', CAST(${String(strategy.audienceSnapshotId)} AS text),
            'ruleHash', 'persisted_snapshot',
            'totalCustomerCount', counts."totalCustomerCount",
            'matchedCustomerCount', counts."matchedCustomerCount",
            'eligibleCustomerCount', counts."eligibleCustomerCount",
            'frequencyCapFilteredCount', counts."matchedCustomerCount" - counts."eligibleCustomerCount",
            'generatedAt', CAST(${now.toISOString()} AS text)
          ),
          ${now},
          NULL,
          CASE
            WHEN counts."eligibleCustomerCount" > 0 THEN NULL::timestamp
            ELSE CAST(${now} AS timestamp)
          END,
          ${now},
          CASE WHEN counts."eligibleCustomerCount" > 0 THEN 'delivery_jobs_queued' ELSE 'no_eligible_customers' END
        FROM audience_counts counts
        ON CONFLICT ("strategyId", "idempotencyKey") DO NOTHING
        RETURNING *
      ),
      inserted_touches AS (
        INSERT INTO "MarketingAutomationTouch" (
          "executionId", "strategyId", "customerId", "predictionSnapshotId",
          "predictedConversionScore", "predictedRevenue", "channel", "status",
          "attemptCount", "touchedAt", "attributionWindowDays"
        )
        SELECT
          execution."id",
          ${Number(strategy.id)},
          member."customerId",
          member."predictionSnapshotId",
          member."predictedConversionScore",
          ROUND(member."ltv6m" * member."predictedConversionScore" / 100 * 0.18),
          ${channel},
          'queued',
          0,
          ${now},
          ${ATTRIBUTION_WINDOW_DAYS}
        FROM inserted_execution execution
        CROSS JOIN scored_members member
        RETURNING "id", "customerId"
      ),
      inserted_jobs AS (
        INSERT INTO "MarketingDeliveryJob" (
          "storeId", "executionId", "touchId", "strategyId", "customerId",
          "channel", "title", "content", "status", "attemptCount", "maxAttempts", "availableAt"
        )
        SELECT
          ${storeId},
          execution."id",
          touch."id",
          ${Number(strategy.id)},
          touch."customerId",
          ${channel},
          ${title},
          ${content},
          'queued',
          0,
          4,
          ${now}
        FROM inserted_execution execution
        CROSS JOIN inserted_touches touch
        RETURNING "id"
      ),
      updated_strategy AS (
        UPDATE "MarketingAutomationStrategy"
        SET
          "lastExecutedAt" = ${now},
          "targetCount" = (SELECT "eligibleCustomerCount" FROM audience_counts),
          "updatedAt" = ${now}
        WHERE "id" = ${Number(strategy.id)}
          AND EXISTS (SELECT 1 FROM inserted_execution)
        RETURNING "id"
      )
      SELECT * FROM inserted_execution
    `);
    if (rows[0]) return rows[0];

    const raced = await this.prisma.marketingAutomationExecution.findUnique({
      where: { strategyId_idempotencyKey: { strategyId: Number(strategy.id), idempotencyKey } },
    });
    if (raced) return raced;
    throw new Error('marketing_execution_snapshot_initialization_failed');
  }

  private extractPrimaryChannel(actions: unknown) {
    const values = Array.isArray(actions) ? actions : [];
    const action = values.find((item) => item && typeof item === 'object') as Record<string, any> | undefined;
    const channel = String(action?.channel ?? (action?.type === 'terminal' ? 'terminal' : 'in_app'));
    return ['terminal', 'in_app', 'sms', 'wechat'].includes(channel) ? channel : 'in_app';
  }

  private extractPrimaryActionContent(actions: unknown) {
    const values = Array.isArray(actions) ? actions : [];
    const action = values.find((item) => item && typeof item === 'object') as Record<string, any> | undefined;
    return String(action?.content ?? action?.value ?? action?.message ?? '您有一条门店服务提醒');
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
  }
}
