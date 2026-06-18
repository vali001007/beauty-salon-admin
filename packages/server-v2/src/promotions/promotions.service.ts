import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePromotionDto, PromotionMatchDto, UpdatePromotionDto } from './dto.js';

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  async findPaginated(query: {
    page?: number | string;
    pageSize?: number | string;
    status?: string;
    storeId?: number | string;
    type?: string;
    source?: string;
    scenario?: string;
    approvalStatus?: string;
    keyword?: string;
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.max(1, Number(query.pageSize || 10));
    const where: any = {};
    if (query.status) where.status = String(query.status);
    if (query.type) where.type = String(query.type);
    if (query.source) where.source = String(query.source);
    if (query.scenario) where.scenario = String(query.scenario);
    if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus);
    if (query.keyword) {
      const keyword = String(query.keyword).trim();
      if (keyword) {
        where.AND = [
          ...(where.AND ?? []),
          {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { discountText: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
              { scenario: { contains: keyword, mode: 'insensitive' } },
            ],
          },
        ];
      }
    }
    const storeId = Number(query.storeId || 0);
    if (storeId > 0) where.OR = [{ storeId }, { storeId: null }];

    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        include: { store: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promotion.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.toView(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async findAll(query: { status?: string; storeId?: number | string; type?: string; source?: string; scenario?: string; approvalStatus?: string; keyword?: string }) {
    const result = await this.findPaginated({ ...query, page: 1, pageSize: 200 });
    return result.items;
  }

  async match(dto: PromotionMatchDto, headerStoreId?: number) {
    const storeId = Number(dto.storeId ?? headerStoreId ?? 0);
    const projectIds = Array.isArray(dto.projectIds) ? dto.projectIds.map(Number).filter(Boolean) : [];
    const productIds = Array.isArray(dto.productIds) ? dto.productIds.map(Number).filter(Boolean) : [];
    const where: any = {
      status: 'active',
      approvalStatus: 'approved',
      OR: [{ storeId: null }],
    };
    if (storeId > 0) where.OR.push({ storeId });

    const now = new Date();
    where.AND = [
      { OR: [{ startAt: null }, { startAt: { lte: now } }] },
      { OR: [{ endAt: null }, { endAt: { gte: now } }] },
    ];

    const promotions = await this.prisma.promotion.findMany({
      where,
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ source: 'asc' }, { updatedAt: 'desc' }],
      take: 80,
    });

    const scored = promotions
      .map((promotion: any) => {
        const score = this.scorePromotionFit(promotion, dto, projectIds, productIds);
        return {
          promotionId: promotion.id,
          name: promotion.name,
          promotionName: promotion.name,
          discountText: promotion.discountText,
          type: promotion.type,
          scenario: promotion.scenario,
          source: promotion.source,
          fitScore: score.score,
          fitLevel: this.fitLevel(score.score),
          fitReason: score.reason,
          fitReasons: score.reasons,
          riskWarnings: score.riskWarnings,
          scoreBreakdown: score.breakdown,
          estimatedCost: promotion.estimatedCost === null || promotion.estimatedCost === undefined ? undefined : Number(promotion.estimatedCost),
          promotion: this.toView(promotion),
        };
      })
      .filter((item) => item.fitScore >= 35)
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 10);

    return {
      items: scored,
      selected: scored[0],
      draftSuggestion: scored.length ? undefined : this.buildDraftSuggestion(dto),
    };
  }

  async create(dto: CreatePromotionDto, headerStoreId?: number) {
    const data = this.normalizePayload(dto, headerStoreId);
    const item = await this.prisma.promotion.create({
      data,
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async update(id: number, dto: UpdatePromotionDto, headerStoreId?: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: this.normalizePayload(dto, headerStoreId, true),
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async remove(id: number) {
    await this.ensurePromotion(id);
    await this.prisma.promotion.delete({ where: { id } });
    return { id };
  }

  async publish(id: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: { status: 'active' },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async offline(id: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: { status: 'offline' },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async approve(id: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: { approvalStatus: 'approved' },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async reject(id: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: { approvalStatus: 'rejected', status: 'offline' },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  private async ensurePromotion(id: number) {
    const item = await this.prisma.promotion.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('优惠活动不存在');
    return item;
  }

  private normalizePayload(dto: CreatePromotionDto | UpdatePromotionDto, headerStoreId?: number, partial = false) {
    const payload: any = {};
    if (!partial || dto.storeId !== undefined || headerStoreId !== undefined) {
      payload.storeId = dto.storeId ?? headerStoreId ?? null;
    }
    for (const key of [
      'code',
      'name',
      'description',
      'discountText',
      'type',
      'source',
      'scenario',
      'giftText',
      'status',
      'approvalStatus',
      'createdByRecommendationId',
    ] as const) {
      if (!partial || dto[key] !== undefined) payload[key] = dto[key];
    }
    for (const key of [
      'thresholdAmount',
      'discountAmount',
      'estimatedCost',
    ] as const) {
      if (!partial || dto[key] !== undefined) payload[key] = dto[key] ?? null;
    }
    for (const key of ['discountRate', 'validDays', 'maxIssueCount', 'issuedCount', 'usedCount'] as const) {
      if (!partial || dto[key] !== undefined) payload[key] = dto[key] ?? null;
    }
    for (const key of ['audienceTags', 'applicableCustomerLevels', 'grossMarginGuard', 'metadata'] as const) {
      if (!partial || dto[key] !== undefined) payload[key] = dto[key] ?? null;
    }
    if (!partial || dto.stackable !== undefined) payload.stackable = Boolean(dto.stackable);
    if (!partial || dto.applicableProjectIds !== undefined) {
      payload.applicableProjectIds = dto.applicableProjectIds ?? [];
    }
    if (!partial || dto.startAt !== undefined) payload.startAt = dto.startAt ? new Date(dto.startAt) : null;
    if (!partial || dto.endAt !== undefined) payload.endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (!payload.status && !partial) payload.status = 'draft';
    if (!payload.type && !partial) payload.type = this.inferPromotionType(payload.discountText, payload.giftText);
    if (!payload.source && !partial) payload.source = payload.createdByRecommendationId ? 'recommendation' : 'store';
    if (!payload.approvalStatus && !partial) payload.approvalStatus = payload.source === 'recommendation' ? 'pending' : 'approved';
    return payload;
  }

  private toView(item: any) {
    return {
      ...item,
      thresholdAmount: item.thresholdAmount === null || item.thresholdAmount === undefined ? null : Number(item.thresholdAmount),
      discountAmount: item.discountAmount === null || item.discountAmount === undefined ? null : Number(item.discountAmount),
      estimatedCost: item.estimatedCost === null || item.estimatedCost === undefined ? null : Number(item.estimatedCost),
      storeName: item.store?.name ?? (item.storeId ? `门店 ${item.storeId}` : '全部门店'),
      startAt: item.startAt?.toISOString?.() ?? item.startAt,
      endAt: item.endAt?.toISOString?.() ?? item.endAt,
      createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
      updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
      store: undefined,
    };
  }

  private scorePromotionFit(promotion: any, dto: PromotionMatchDto, projectIds: number[], productIds: number[]) {
    const breakdown = {
      scenarioScore: 0,
      audienceScore: 0,
      behaviorIntentScore: 0,
      itemFitScore: 0,
      timingUrgencyScore: 0,
      valueProtectionScore: 0,
      channelFitScore: 0,
      operationFitScore: 0,
      historicalEffectScore: 0,
      fatiguePenalty: 0,
      marginRiskPenalty: 0,
      conflictPenalty: 0,
    };
    const reasons: string[] = [];
    const riskWarnings: string[] = [];
    const scenario = String(dto.scenario || '');
    const recommendationType = String(dto.recommendationType || '');
    const executionMode = String(dto.executionMode || '');
    const tags: string[] = Array.isArray(promotion.audienceTags) ? promotion.audienceTags.map(String) : [];
    const levels: string[] = Array.isArray(promotion.applicableCustomerLevels) ? promotion.applicableCustomerLevels.map(String) : [];
    const promotionProjects = Array.isArray(promotion.applicableProjectIds) ? promotion.applicableProjectIds.map(Number) : [];
    const metadata = this.asObject(promotion.metadata);
    const grossMarginGuard = this.asObject(promotion.grossMarginGuard);
    const customerTags = this.uniqueStrings([
      dto.customerSegment,
      dto.ltvTier,
      dto.skinType,
      ...(Array.isArray(dto.customerTags) ? dto.customerTags : []),
    ]);
    const channelTags = this.uniqueStrings(Array.isArray(dto.channelTags) ? dto.channelTags : []);
    const context = this.asObject(dto.context);
    const effectiveScenario = scenario || recommendationType;

    if (effectiveScenario && promotion.scenario === effectiveScenario) {
      breakdown.scenarioScore = 100;
      reasons.push('适用场景匹配');
    } else if (effectiveScenario && this.scenarioFamily(promotion.scenario) === this.scenarioFamily(effectiveScenario)) {
      breakdown.scenarioScore = 70;
      reasons.push('权益场景相近');
    } else if (!effectiveScenario) {
      breakdown.scenarioScore = 45;
    } else {
      breakdown.scenarioScore = 20;
    }

    if (projectIds.length && promotionProjects.length) {
      const matchedProjects = promotionProjects.filter((id: number) => projectIds.includes(id));
      if (matchedProjects.length) {
        breakdown.itemFitScore += 90;
        reasons.push('适用项目匹配');
      } else {
        breakdown.itemFitScore -= 35;
        riskWarnings.push('推荐项目与权益适用项目不一致');
      }
    } else if (!promotionProjects.length) {
      breakdown.itemFitScore += 45;
      reasons.push('适用于全部项目');
    }

    if (productIds.length && this.matchesAny(metadata.productIds, productIds.map(String))) {
      breakdown.itemFitScore += 80;
      reasons.push('适用商品匹配');
    }

    const audienceHits = this.countTagHits(customerTags, [
      ...tags,
      ...this.metadataTags(metadata, [
        'lifecycleTags',
        'valueTags',
        'includeTags',
      ]),
    ]);
    if (audienceHits > 0) {
      breakdown.audienceScore = Math.min(100, 55 + audienceHits * 15);
      reasons.push('适用客户标签匹配');
    } else if (customerTags.length) {
      breakdown.audienceScore = 25;
    } else {
      breakdown.audienceScore = 45;
    }

    const behaviorHits = this.countTagHits(customerTags, this.metadataTags(metadata, ['behaviorTags']));
    if (behaviorHits > 0) {
      breakdown.behaviorIntentScore = Math.min(100, 60 + behaviorHits * 20);
      reasons.push('行为意图匹配');
    } else if (this.scenarioFamily(effectiveScenario) === 'behavior') {
      breakdown.behaviorIntentScore = 70;
    } else {
      breakdown.behaviorIntentScore = 35;
    }

    const itemTagHits = this.countTagHits(customerTags, this.metadataTags(metadata, [
      'preferenceTags',
      'skinTags',
      'cardTags',
      'productCycleTags',
    ]));
    if (itemTagHits > 0) {
      breakdown.itemFitScore += Math.min(100, 45 + itemTagHits * 18);
      reasons.push('项目/肤质/卡项标签匹配');
    }

    if (dto.ltvTier && levels.some((level) => this.tagMatches(String(dto.ltvTier), level))) {
      breakdown.valueProtectionScore += 80;
      reasons.push('会员等级匹配');
    }

    const offerStrength = String(metadata.offerStrength || '');
    const highValue = customerTags.some((tag) => /VIP|高\s*LTV|高价值|铂金|黄金|钻石/.test(tag));
    if (highValue && ['member_privilege', 'gift'].includes(String(promotion.type))) {
      breakdown.valueProtectionScore += 90;
      reasons.push('高价值客户匹配服务型权益');
    } else if (highValue && offerStrength === 'strong' && ['money_off', 'trial_price', 'discount'].includes(String(promotion.type))) {
      breakdown.marginRiskPenalty += 25;
      riskWarnings.push('高价值客户不建议默认使用强折扣权益');
    } else if (!highValue && offerStrength === 'strong') {
      breakdown.valueProtectionScore += 55;
    } else {
      breakdown.valueProtectionScore += 45;
    }

    if (channelTags.length) {
      const channelHits = this.countTagHits(channelTags, this.metadataTags(metadata, ['channelTags']));
      breakdown.channelFitScore = channelHits ? Math.min(100, 55 + channelHits * 20) : 35;
      if (channelHits) reasons.push('触达渠道匹配');
    } else {
      breakdown.channelFitScore = 45;
    }

    const preferredModes = this.toStringArray(metadata.preferredExecutionModes);
    if (executionMode && preferredModes.length) {
      if (preferredModes.includes(executionMode) || preferredModes.includes('both')) {
        breakdown.operationFitScore += 85;
        reasons.push('执行方式匹配');
      } else {
        breakdown.conflictPenalty += 20;
        riskWarnings.push('该权益更适合其他执行方式');
      }
    } else {
      breakdown.operationFitScore += 45;
    }

    if (this.truthy(grossMarginGuard.usableTimeRangeRequired) && !context.usableTimeRange) {
      breakdown.operationFitScore -= 20;
      riskWarnings.push('低峰权益发布前需绑定可用日期/时段');
    }
    if (this.truthy(grossMarginGuard.inventoryCapRequired) && !context.inventoryCap) {
      riskWarnings.push('库存消化权益发布前需设置库存上限');
    }
    if (this.truthy(grossMarginGuard.avoidDeepDiscount) && ['money_off', 'trial_price', 'discount'].includes(String(promotion.type))) {
      breakdown.marginRiskPenalty += 20;
      riskWarnings.push('该权益存在低价触达风险');
    }

    const validDays = Number(promotion.validDays ?? 0);
    if (validDays > 0 && validDays <= 7) {
      breakdown.timingUrgencyScore = 85;
      reasons.push('短有效期适合即时转化');
    } else if (['coupon_expiry', 'card_expiry', 'project_idle_capacity', 'product_expiry_clearance'].includes(effectiveScenario)) {
      breakdown.timingUrgencyScore = 78;
    } else {
      breakdown.timingUrgencyScore = 45;
    }

    const usedCount = Number(promotion.usedCount ?? 0);
    const issuedCount = Number(promotion.issuedCount ?? 0);
    if (issuedCount > 0) {
      breakdown.historicalEffectScore = Math.min(100, Math.round((usedCount / Math.max(issuedCount, 1)) * 100));
      if (breakdown.historicalEffectScore >= 50) reasons.push('历史核销表现较好');
    } else {
      breakdown.historicalEffectScore = 40;
    }

    if (promotion.maxIssueCount && promotion.issuedCount >= promotion.maxIssueCount) {
      breakdown.conflictPenalty += 80;
      riskWarnings.push('已达到发放上限');
    } else if (promotion.maxIssueCount && promotion.issuedCount >= promotion.maxIssueCount * 0.8) {
      breakdown.conflictPenalty += 20;
      riskWarnings.push('已接近发放上限');
    }

    const excludeHits = this.countTagHits(customerTags, this.metadataTags(metadata, ['excludeTags']));
    if (excludeHits) {
      breakdown.conflictPenalty += 60;
      riskWarnings.push('客户命中该权益排除标签');
    }

    if (customerTags.some((tag) => /触达疲劳|多次未响应|近期已触达/.test(tag))) {
      breakdown.fatiguePenalty += 25;
      riskWarnings.push('客户近期触达较多，建议降低频率或改顾问任务');
    }
    if (customerTags.some((tag) => /已领未核销|已领券/.test(tag)) && !['coupon_claimed_unused', 'coupon_expiry'].includes(effectiveScenario)) {
      breakdown.conflictPenalty += 20;
      riskWarnings.push('客户已有未核销权益，避免重复让利');
    }

    const score = this.clamp(
      breakdown.scenarioScore * 0.22
      + breakdown.audienceScore * 0.18
      + breakdown.behaviorIntentScore * 0.14
      + this.clamp(breakdown.itemFitScore, 0, 100) * 0.12
      + breakdown.timingUrgencyScore * 0.1
      + this.clamp(breakdown.valueProtectionScore, 0, 100) * 0.1
      + breakdown.channelFitScore * 0.06
      + this.clamp(breakdown.operationFitScore, 0, 100) * 0.04
      + breakdown.historicalEffectScore * 0.04
      - breakdown.fatiguePenalty
      - breakdown.marginRiskPenalty
      - breakdown.conflictPenalty,
      0,
      100,
    );

    const reason = reasons.length ? reasons.join('、') : '通用权益，可作为营销承接备选';
    return { score, reason, reasons, riskWarnings, breakdown };
  }

  private buildDraftSuggestion(dto: PromotionMatchDto) {
    const scenario = String(dto.scenario || '');
    const scenarioText: Record<string, { name: string; type: string; discountText: string; reason: string }> = {
      churn_winback: {
        name: '回店护理礼遇',
        type: 'money_off',
        discountText: '到店护理满300减100',
        reason: '高流失客户需要明确回店利益，但保留消费门槛避免过度低价。',
      },
      care_cycle_due: {
        name: '护理周期预约权益',
        type: 'money_off',
        discountText: '护理项目满500减80',
        reason: '护理周期到期客户已有复购时机，小额预约权益即可促进到店。',
      },
      vip_privilege_care: {
        name: 'VIP 专属护理礼遇',
        type: 'member_privilege',
        discountText: '专属顾问服务 + 优先预约',
        reason: '高价值客户优先服务礼遇，避免直接大额折扣。',
      },
      browse_abandonment: {
        name: '浏览专属体验券',
        type: 'trial_price',
        discountText: '浏览项目 7 天内预约享体验礼',
        reason: '浏览未预约客户需要短有效期权益推动决策。',
      },
      coupon_claimed_unused: {
        name: '已领权益核销提醒',
        type: 'member_privilege',
        discountText: '提醒使用已领取权益',
        reason: '优先推动已领权益核销，不新增无关让利。',
      },
      product_expiry_clearance: {
        name: '临期商品消化券',
        type: 'money_off',
        discountText: '指定商品临期专享价',
        reason: '临期商品需要匹配适配客户并控制库存上限。',
      },
      project_idle_capacity: {
        name: '低峰预约礼',
        type: 'gift',
        discountText: '低峰时段预约赠护理加项',
        reason: '低峰权益只绑定空闲时段，避免影响黄金时段价格体系。',
      },
    };
    return scenarioText[scenario] ?? {
      name: '门店专属护理权益',
      type: 'gift',
      discountText: '到店可享专属护理礼遇',
      reason: '当前没有完全匹配的权益资产，建议生成草稿后由运营审核。',
    };
  }

  private inferPromotionType(discountText?: string, giftText?: string) {
    const text = `${discountText || ''} ${giftText || ''}`;
    if (/折/.test(text)) return 'percentage_off';
    if (/体验|特价/.test(text)) return 'trial_price';
    if (/赠|礼/.test(text)) return 'gift';
    if (/VIP|专属|优先/.test(text)) return 'member_privilege';
    return 'money_off';
  }

  private scenarioFamily(value?: string | null) {
    const scenario = String(value || '');
    if (/churn|dormant|winback|last_visit/.test(scenario)) return 'winback';
    if (/cycle|repurchase|revisit|second_visit/.test(scenario)) return 'repurchase';
    if (/vip|ltv|member|birthday/.test(scenario)) return 'member';
    if (/browse|booking|coupon|new_customer|first_booking/.test(scenario)) return 'behavior';
    if (/product_expiry|inventory|replenishment|bundle/.test(scenario)) return 'product';
    if (/idle|capacity|low_peak/.test(scenario)) return 'capacity';
    return scenario;
  }

  private metadataTags(metadata: Record<string, unknown>, keys: string[]) {
    return keys.flatMap((key) => this.toStringArray(metadata[key]));
  }

  private countTagHits(left: string[], right: string[]) {
    if (!left.length || !right.length) return 0;
    let hits = 0;
    for (const item of left) {
      if (right.some((tag) => this.tagMatches(item, tag))) hits += 1;
    }
    return hits;
  }

  private matchesAny(left: unknown, right: string[]) {
    const values = this.toStringArray(left);
    return values.some((value) => right.includes(value));
  }

  private tagMatches(left: string, right: string) {
    const a = String(left || '').trim().toLowerCase();
    const b = String(right || '').trim().toLowerCase();
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
  }

  private uniqueStrings(values: unknown[]) {
    return [...new Set(values.flatMap((value) => this.toStringArray(value)).map((value) => value.trim()).filter(Boolean))];
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (value === null || value === undefined || value === '') return [];
    return [String(value)];
  }

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private truthy(value: unknown) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private fitLevel(score: number) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 35) return 'backup';
    return 'not_recommended';
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
}
