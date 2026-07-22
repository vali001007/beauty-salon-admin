import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

type RecommendationInstanceQuery = {
  sourceType?: string;
  priority?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

type AudienceQuery = { page?: number; pageSize?: number };

@Injectable()
export class MarketingRecommendationQueryService {
  private readonly readCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  constructor(private readonly prisma: PrismaService) {}

  async findMany(storeId: number, query: RecommendationInstanceQuery = {}, now = new Date()) {
    const page = this.page(query.page);
    const pageSize = this.pageSize(query.pageSize, 20, 100);
    const cacheKey = [
      'instances',
      storeId,
      query.sourceType ?? '',
      query.priority ?? '',
      query.status ?? 'active',
      page,
      pageSize,
    ].join(':');
    return this.cachedRead(cacheKey, 3_000, () => this.findManyUncached(storeId, query, now));
  }

  private async findManyUncached(storeId: number, query: RecommendationInstanceQuery = {}, now = new Date()) {
    this.assertStoreId(storeId);
    const page = this.page(query.page);
    const pageSize = this.pageSize(query.pageSize, 20, 100);
    const status = query.status ?? 'active';
    const skip = (page - 1) * pageSize;
    const where: any = {
      storeId,
      status,
      ...(status === 'active' ? { expiresAt: { gt: now } } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };

    const [items, total, coverage, adoptionsByInstance] = await Promise.all([
      this.prisma.marketingRecommendationInstance.findMany({
        where,
        include: this.instanceInclude(),
        orderBy: [{ priority: 'asc' }, { generatedAt: 'desc' }],
        skip,
        take: pageSize,
      } as any),
      this.prisma.marketingRecommendationInstance.count({ where }),
      this.loadCoverage(storeId),
      this.loadLatestAdoptionsForPage(storeId, query, status, now, skip, pageSize),
    ]);

    return {
      items: (items as any[]).map((item) =>
        this.toView({
          ...item,
          adoptions: adoptionsByInstance.get(String(item.id)) ?? [],
        }),
      ),
      total,
      page,
      pageSize,
      coverage: {
        totalCustomers: coverage.totalCustomers,
        predictedCustomers: coverage.predictedCustomers,
        coverageRate:
          coverage.totalCustomers > 0
            ? Number(((coverage.predictedCustomers / coverage.totalCustomers) * 100).toFixed(2))
            : 0,
        predictionRunId: coverage.predictionRunId,
        generatedAt: coverage.generatedAt?.toISOString() ?? null,
        freshness: this.freshness(coverage.generatedAt, now),
      },
    };
  }

  async getById(instanceId: string, storeId: number) {
    this.assertStoreId(storeId);
    const instance = await this.prisma.marketingRecommendationInstance.findFirst({
      where: { id: instanceId, storeId },
      include: this.instanceInclude(),
    } as any);
    if (!instance) throw new NotFoundException('recommendation_instance_not_found');
    const adoptionsByInstance = await this.loadLatestAdoptions([instanceId]);
    return this.toView({
      ...(instance as any),
      adoptions: adoptionsByInstance.get(instanceId) ?? [],
    });
  }

  async getAudience(instanceId: string, storeId: number, query: AudienceQuery = {}) {
    const page = this.page(query.page);
    const pageSize = this.pageSize(query.pageSize, 50, 200);
    const cacheKey = ['audience', storeId, instanceId, page, pageSize].join(':');
    return this.cachedRead(cacheKey, 5_000, () => this.getAudienceUncached(instanceId, storeId, query));
  }

  private async getAudienceUncached(instanceId: string, storeId: number, query: AudienceQuery = {}) {
    this.assertStoreId(storeId);
    const page = this.page(query.page);
    const pageSize = this.pageSize(query.pageSize, 50, 200);
    const skip = (page - 1) * pageSize;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        instance."id" AS "instanceId",
        snapshot."id" AS "snapshotId",
        snapshot."customerCount" AS "customerCount",
        snapshot."generatedAt" AS "generatedAt",
        COALESCE((
          SELECT COUNT(*)::int
          FROM "MarketingRecommendationAudienceMember" counted
          WHERE counted."snapshotId" = snapshot."id"
            AND counted."storeId" = ${storeId}
        ), 0)::int AS "total",
        page_member."id" AS "memberId",
        page_member."customerId" AS "customerId",
        page_member."rank" AS "rank",
        page_member."score" AS "score",
        page_member."reasonJson" AS "reasonJson",
        page_member."predictionData" AS "predictionData",
        page_member."customerName" AS "customerName",
        page_member."customerPhone" AS "customerPhone",
        page_member."memberLevel" AS "memberLevel",
        page_member."tags" AS "tags",
        page_member."lastVisitDate" AS "lastVisitDate",
        page_member."skinType" AS "skinType",
        page_member."visitCount" AS "visitCount",
        page_member."totalSpent" AS "totalSpent",
        page_member."storeName" AS "storeName"
      FROM "MarketingRecommendationInstance" instance
      LEFT JOIN "MarketingRecommendationAudienceSnapshot" snapshot
        ON snapshot."recommendationInstanceId" = instance."id"
       AND snapshot."storeId" = ${storeId}
      LEFT JOIN LATERAL (
        SELECT
          member."id",
          member."customerId",
          member."rank",
          member."score",
          member."reasonJson",
          member."predictionData",
          customer."name" AS "customerName",
          customer."phone" AS "customerPhone",
          customer."memberLevel",
          customer."tags",
          customer."lastVisitDate",
          customer."skinType",
          customer."visitCount",
          customer."totalSpent",
          store."name" AS "storeName"
        FROM "MarketingRecommendationAudienceMember" member
        JOIN "Customer" customer
          ON customer."id" = member."customerId"
         AND customer."storeId" = ${storeId}
         AND customer."deletedAt" IS NULL
        LEFT JOIN "Store" store ON store."id" = customer."storeId"
        WHERE member."snapshotId" = snapshot."id"
          AND member."storeId" = ${storeId}
        ORDER BY member."rank" ASC, member."id" ASC
        OFFSET ${skip}
        LIMIT ${pageSize}
      ) page_member ON TRUE
      WHERE instance."id" = ${instanceId}
        AND instance."storeId" = ${storeId}
    `);
    if (!rows.length) throw new NotFoundException('recommendation_instance_not_found');
    const snapshot = rows[0];
    if (!snapshot.snapshotId) throw new NotFoundException('recommendation_audience_snapshot_not_found');
    const items = rows
      .filter((item) => item.memberId !== null && item.memberId !== undefined)
      .map((item) => ({
        id: item.memberId,
        customerId: item.customerId,
        rank: item.rank,
        score: item.score,
        reason: item.reasonJson,
        predictionData: item.predictionData,
        customer: {
          id: item.customerId,
          name: item.customerName,
          phone: item.customerPhone,
          memberLevel: item.memberLevel,
          tags: item.tags,
          lastVisitDate: item.lastVisitDate,
          skinType: item.skinType,
          visitCount: item.visitCount,
          totalSpent: item.totalSpent,
          store: { name: item.storeName },
        },
      }));

    return {
      recommendationInstanceId: instanceId,
      snapshotId: snapshot.snapshotId,
      customerCount: snapshot.customerCount,
      generatedAt: new Date(snapshot.generatedAt).toISOString(),
      items,
      total: Number(snapshot.total ?? 0),
      page,
      pageSize,
    };
  }

  async findLegacy(storeId: number, query: RecommendationInstanceQuery = {}) {
    const response = await this.findMany(storeId, query);
    return response.items.map((item: any) => ({
      ...item,
      id: item.recommendationInstanceId,
      reason: item.description,
      targetCustomers: `${item.targetCount} 位客户`,
      targetCustomerIds: [],
      predictionFreshness: {
        predictionRunId: response.coverage.predictionRunId,
        generatedAt: response.coverage.generatedAt,
        ageHours: response.coverage.generatedAt
          ? Number(((Date.now() - new Date(response.coverage.generatedAt).getTime()) / 3600000).toFixed(2))
          : null,
        status: response.coverage.freshness,
      },
    }));
  }

  private instanceInclude() {
    return {
      audienceSnapshot: true,
      offerSnapshot: true,
    };
  }

  private async loadLatestAdoptions(instanceIds: string[]) {
    const ids = [...new Set(instanceIds.map((id) => id.trim()).filter(Boolean))];
    const grouped = new Map<string, any[]>();
    if (ids.length === 0) return grouped;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT latest.*
      FROM (
        SELECT DISTINCT ON ("recommendationInstanceId", "mode")
          "id", "recommendationInstanceId", "mode", "status", "activityId", "pageId",
          "strategyId", "followUpTaskIds", "createdAt"
        FROM "MarketingRecommendationAdoption"
        WHERE "recommendationInstanceId" IN (${Prisma.join(ids)})
        ORDER BY "recommendationInstanceId", "mode", "createdAt" DESC, "id" DESC
      ) latest
      ORDER BY latest."createdAt" DESC, latest."id" DESC
    `);
    return this.groupAdoptions(rows);
  }

  private async loadLatestAdoptionsForPage(
    storeId: number,
    query: RecommendationInstanceQuery,
    status: string,
    now: Date,
    skip: number,
    take: number,
  ) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`instance."storeId" = ${storeId}`,
      Prisma.sql`instance."status" = ${status}`,
    ];
    if (status === 'active') conditions.push(Prisma.sql`instance."expiresAt" > ${now}`);
    if (query.sourceType) conditions.push(Prisma.sql`instance."sourceType" = ${query.sourceType}`);
    if (query.priority) conditions.push(Prisma.sql`instance."priority" = ${query.priority}`);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      WITH page_instances AS (
        SELECT instance."id"
        FROM "MarketingRecommendationInstance" instance
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY instance."priority" ASC, instance."generatedAt" DESC
        OFFSET ${skip}
        LIMIT ${take}
      )
      SELECT latest.*
      FROM (
        SELECT DISTINCT ON (adoption."recommendationInstanceId", adoption."mode")
          adoption."id", adoption."recommendationInstanceId", adoption."mode", adoption."status",
          adoption."activityId", adoption."pageId", adoption."strategyId", adoption."followUpTaskIds",
          adoption."createdAt"
        FROM "MarketingRecommendationAdoption" adoption
        JOIN page_instances page_instance ON page_instance."id" = adoption."recommendationInstanceId"
        ORDER BY adoption."recommendationInstanceId", adoption."mode", adoption."createdAt" DESC, adoption."id" DESC
      ) latest
      ORDER BY latest."createdAt" DESC, latest."id" DESC
    `);
    return this.groupAdoptions(rows);
  }

  private async loadCoverage(storeId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      WITH latest_run AS (
        SELECT run."id", COALESCE(run."finishedAt", run."startedAt") AS "generatedAt"
        FROM "PredictionRun" run
        WHERE run."storeId" = ${storeId}
          AND run."scopeStatus" = 'store_scoped'
          AND run."status" = 'completed'
        ORDER BY run."businessDate" DESC, run."finishedAt" DESC NULLS LAST, run."id" DESC
        LIMIT 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM "Customer" customer
          WHERE customer."storeId" = ${storeId} AND customer."deletedAt" IS NULL) AS "totalCustomers",
        (SELECT latest_run."id" FROM latest_run) AS "predictionRunId",
        (SELECT latest_run."generatedAt" FROM latest_run) AS "generatedAt",
        COALESCE((SELECT COUNT(*)::int
          FROM "CustomerPredictionSnapshot" snapshot
          WHERE snapshot."storeId" = ${storeId}
            AND snapshot."runId" = (SELECT latest_run."id" FROM latest_run)), 0)::int AS "predictedCustomers"
    `);
    const coverage = rows[0] ?? {};
    return {
      totalCustomers: Number(coverage.totalCustomers ?? 0),
      predictedCustomers: Number(coverage.predictedCustomers ?? 0),
      predictionRunId:
        coverage.predictionRunId === null || coverage.predictionRunId === undefined
          ? null
          : Number(coverage.predictionRunId),
      generatedAt: coverage.generatedAt ? new Date(coverage.generatedAt) : null,
    };
  }

  private groupAdoptions(rows: any[]) {
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
      const instanceId = String(row.recommendationInstanceId);
      const current = grouped.get(instanceId) ?? [];
      current.push(row);
      grouped.set(instanceId, current);
    }
    return grouped;
  }

  private cachedRead<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.readCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value as Promise<T>;
    if (cached) this.readCache.delete(key);

    const value = loader();
    const entry = { expiresAt: now + ttlMs, value: value as Promise<unknown> };
    this.readCache.set(key, entry);
    if (this.readCache.size > 200) {
      const oldestKey = this.readCache.keys().next().value;
      if (oldestKey) this.readCache.delete(oldestKey);
    }
    value.catch(() => {
      if (this.readCache.get(key) === entry) this.readCache.delete(key);
    });
    return value;
  }

  private toView(instance: any) {
    return {
      recommendationInstanceId: instance.id,
      recommendationKey: instance.recommendationKey,
      sourceType: instance.sourceType,
      sourceVersion: instance.sourceVersion,
      predictionRunId: instance.predictionRunId,
      businessDate: this.iso(instance.businessDate),
      status: instance.status,
      title: instance.title,
      description: instance.description,
      priority: instance.priority,
      urgency: instance.urgency,
      preferredMode: instance.preferredMode,
      executionModes: instance.executionModes,
      evidence: instance.evidenceSnapshot,
      strategy: instance.strategySnapshot,
      targetCount: instance.targetCount,
      generatedAt: this.iso(instance.generatedAt),
      expiresAt: this.iso(instance.expiresAt),
      audience: instance.audienceSnapshot
        ? {
            snapshotId: instance.audienceSnapshot.id,
            customerCount: instance.audienceSnapshot.customerCount,
            rule: instance.audienceSnapshot.ruleJson,
            generatedAt: this.iso(instance.audienceSnapshot.generatedAt),
          }
        : null,
      offer: instance.offerSnapshot
        ? {
            snapshotId: instance.offerSnapshot.id,
            selectedPromotionId: instance.offerSnapshot.selectedPromotionId,
            offer: instance.offerSnapshot.offerJson,
            alternatives: instance.offerSnapshot.alternativesJson,
            fitBreakdown: instance.offerSnapshot.fitBreakdownJson,
            inventorySnapshot: instance.offerSnapshot.inventorySnapshotJson,
            capacitySnapshot: instance.offerSnapshot.capacitySnapshotJson,
            riskWarnings: instance.offerSnapshot.riskWarningsJson,
            generatedAt: this.iso(instance.offerSnapshot.generatedAt),
          }
        : null,
      executionState: this.executionState(instance.adoptions ?? []),
    };
  }

  private executionState(adoptions: any[]) {
    const latestByMode = new Map<string, any>();
    for (const adoption of adoptions) {
      if (!latestByMode.has(adoption.mode)) latestByMode.set(adoption.mode, adoption);
    }
    return {
      adopted: adoptions.length > 0,
      latestAdoptionId: adoptions[0]?.id ?? null,
      activity: latestByMode.get('activity') ?? null,
      automation: latestByMode.get('automation') ?? null,
      terminalFollowUp: latestByMode.get('terminal_follow_up') ?? null,
    };
  }

  private freshness(generatedAt: Date | null, now: Date): 'fresh' | 'stale' | 'missing' {
    if (!generatedAt) return 'missing';
    return now.getTime() - generatedAt.getTime() > 30 * 3600000 ? 'stale' : 'fresh';
  }

  private assertStoreId(storeId: number) {
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('X-Store-Id is required');
  }

  private page(value?: number) {
    return Math.max(1, Number(value) || 1);
  }

  private pageSize(value: number | undefined, fallback: number, max: number) {
    return Math.max(1, Math.min(max, Number(value) || fallback));
  }

  private iso(value: Date | string | null | undefined) {
    if (!value) return null;
    return new Date(value).toISOString();
  }
}
