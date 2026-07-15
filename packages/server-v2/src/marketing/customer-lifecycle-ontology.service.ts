import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ATTRIBUTABLE_TOUCH_STATUS_SET } from './marketing-touch-status.constants.js';

type LifecycleStage = 'lead' | 'new_customer' | 'trial' | 'member' | 'active' | 'growth' | 'at_risk' | 'dormant' | 'lost';
type OpportunityType =
  | 'care_cycle_due'
  | 'card_expiring'
  | 'dormant_winback'
  | 'coupon_claimed_unused'
  | 'browse_abandonment'
  | 'project_cycle_due'
  | 'homecare_bundle'
  | 'service_upgrade'
  | 'project_idle_capacity'
  | 'inventory_clearance';
type ExecutionMode = 'activity' | 'automation' | 'advisor_task';

type RebuildOptions = {
  predictionRunId?: number;
  includeServiceCycles?: boolean;
  includeFulfillmentChecks?: boolean;
  includeAttribution?: boolean;
};

type OpportunitySeed = {
  opportunityType: OpportunityType;
  priority: 'P0' | 'P1' | 'P2';
  score: number;
  recommendedExecutionMode: ExecutionMode;
  channels: Array<{ channel: string; label: string; reason: string; priority: string }>;
  offer?: Record<string, any>;
  items?: Array<Record<string, any>>;
  evidence: string[];
  expiresAt?: Date | null;
};

const P0_OPPORTUNITY_TYPES: OpportunityType[] = [
  'care_cycle_due',
  'card_expiring',
  'dormant_winback',
  'coupon_claimed_unused',
  'browse_abandonment',
];

const P1_OPPORTUNITY_TYPES: OpportunityType[] = [
  'project_cycle_due',
  'homecare_bundle',
  'service_upgrade',
  'project_idle_capacity',
  'inventory_clearance',
];

const ALL_OPPORTUNITY_TYPES: OpportunityType[] = [...P0_OPPORTUNITY_TYPES, ...P1_OPPORTUNITY_TYPES];

const OPPORTUNITY_LABELS: Record<OpportunityType, string> = {
  care_cycle_due: '护理周期到期',
  card_expiring: '次卡/套餐到期',
  dormant_winback: '沉睡客户召回',
  coupon_claimed_unused: '领券未核销',
  browse_abandonment: '浏览未预约',
  project_cycle_due: '项目护理周期到期',
  homecare_bundle: '居家护理搭配',
  service_upgrade: '服务升级机会',
  project_idle_capacity: '低峰产能填充',
  inventory_clearance: '库存消化机会',
};

const STAGE_LABELS: Record<LifecycleStage, string> = {
  lead: '线索',
  new_customer: '新客',
  trial: '体验客',
  member: '会员',
  active: '活跃客',
  growth: '成长客',
  at_risk: '预流失',
  dormant: '沉睡客',
  lost: '流失客',
};

@Injectable()
export class CustomerLifecycleOntologyService {
  constructor(private prisma: PrismaService) {}

  async rebuild(storeId: number, options: RebuildOptions = {}) {
    if (!this.lifecycleDelegatesReady()) return this.emptyRebuildResult('customer_lifecycle_schema_pending');

    const scopedStoreId = storeId;
    const latestRun = await this.resolvePredictionRun(scopedStoreId, options.predictionRunId);
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null, storeId: scopedStoreId },
      include: {
        customerCards: { include: { card: true }, orderBy: { expiryDate: 'asc' } },
        cardUsageRecords: { include: { project: { include: { bomItems: { include: { product: true } } } } }, orderBy: { verifiedAt: 'desc' }, take: 20 },
        reservations: { include: { project: { include: { bomItems: { include: { product: true } } } } }, orderBy: { date: 'desc' }, take: 20 },
        productOrders: { include: { orderItems: true }, orderBy: { createdAt: 'desc' }, take: 10 },
        consumptionRecords: { orderBy: { consumeTime: 'desc' }, take: 10 },
        marketingTouches: { orderBy: { touchedAt: 'desc' }, take: 10 },
        customerAppEvents: { orderBy: { occurredAt: 'desc' }, take: 20 },
        recommendationEvents: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { id: 'asc' },
    });
    if (!customers.length) return { rebuilt: true, reason: null, predictionRunId: latestRun?.id ?? null, snapshotCount: 0, opportunityCount: 0 };

    const customerIds = customers.map((customer: any) => Number(customer.id));
    const [predictionSnapshots, behaviorEvents, oldSnapshots] = await Promise.all([
      this.loadPredictionSnapshots(customerIds, latestRun?.id, scopedStoreId),
      this.loadBehaviorEvents(customerIds, scopedStoreId),
      (this.prisma as any).customerLifecycleSnapshot.findMany({ where: { storeId: scopedStoreId, customerId: { in: customerIds } } }),
    ]);
    const predictionByCustomer = new Map(predictionSnapshots.map((item: any) => [Number(item.customerId), item]));
    const behaviorByCustomer = this.groupByCustomer(behaviorEvents, 'customerId');
    const oldStageByCustomer = new Map(oldSnapshots.map((item: any) => [Number(item.customerId), item.lifecycleStage]));

    let snapshotCount = 0;
    let opportunityCount = 0;
    let serviceCycleCount = 0;
    let fulfillmentCheckCount = 0;
    let attributionEventCount = 0;
    for (const customer of customers as any[]) {
      const prediction = predictionByCustomer.get(Number(customer.id)) ?? null;
      const behavior = behaviorByCustomer.get(Number(customer.id)) ?? [];
      const stageResult = this.classifyLifecycleStage(customer, prediction);
      const serviceCycles = options.includeServiceCycles === false ? [] : await this.rebuildServiceCyclesForCustomer(customer);
      serviceCycleCount += serviceCycles.length;
      const opportunities = [
        ...this.buildOpportunities(customer, prediction, behavior, stageResult.stage),
        ...this.buildP1Opportunities(customer, prediction, serviceCycles),
      ];
      const evidence = this.uniqueStrings([
        ...stageResult.evidence,
        ...opportunities.flatMap((item) => item.evidence).slice(0, 6),
      ]);

      await (this.prisma as any).customerLifecycleSnapshot.upsert({
        where: { storeId_customerId: { storeId: Number(customer.storeId), customerId: Number(customer.id) } },
        create: {
          storeId: Number(customer.storeId),
          customerId: Number(customer.id),
          predictionRunId: latestRun?.id ?? null,
          predictionSnapshotId: prediction?.id ?? null,
          lifecycleStage: stageResult.stage,
          ltvTier: prediction?.ltvTier ?? stageResult.ltvTier,
          churnRiskLevel: prediction?.churnLevel ?? stageResult.churnRiskLevel,
          touchFatigueScore: stageResult.touchFatigueScore,
          assetSummaryJson: this.buildAssetSummary(customer),
          servicePreferenceJson: this.buildServicePreference(customer),
          evidenceJson: evidence,
          computedAt: new Date(),
        },
        update: {
          predictionRunId: latestRun?.id ?? null,
          predictionSnapshotId: prediction?.id ?? null,
          lifecycleStage: stageResult.stage,
          ltvTier: prediction?.ltvTier ?? stageResult.ltvTier,
          churnRiskLevel: prediction?.churnLevel ?? stageResult.churnRiskLevel,
          touchFatigueScore: stageResult.touchFatigueScore,
          assetSummaryJson: this.buildAssetSummary(customer),
          servicePreferenceJson: this.buildServicePreference(customer),
          evidenceJson: evidence,
          computedAt: new Date(),
        },
      });
      snapshotCount += 1;

      const oldStage = oldStageByCustomer.get(Number(customer.id));
      if (oldStage !== stageResult.stage) {
        await (this.prisma as any).customerLifecycleEvent.create({
          data: {
            storeId: Number(customer.storeId),
            customerId: Number(customer.id),
            fromStage: oldStage ?? null,
            toStage: stageResult.stage,
            eventType: oldStage ? 'stage_changed' : 'stage_initialized',
            sourceType: prediction ? 'prediction_snapshot' : 'customer_profile',
            sourceId: prediction?.id ? String(prediction.id) : String(customer.id),
            evidenceJson: stageResult.evidence,
            occurredAt: new Date(),
          },
        });
      }

      const activeTypes = new Set(opportunities.map((item) => item.opportunityType));
      await (this.prisma as any).customerOpportunity.updateMany({
        where: {
          storeId: Number(customer.storeId),
          customerId: Number(customer.id),
          opportunityType: { in: ALL_OPPORTUNITY_TYPES },
          status: 'open',
          NOT: { opportunityType: { in: [...activeTypes] } },
        },
        data: { status: 'stale' },
      });

      for (const opportunity of opportunities) {
        const savedOpportunity = await (this.prisma as any).customerOpportunity.upsert({
          where: {
            storeId_customerId_opportunityType: {
              storeId: Number(customer.storeId),
              customerId: Number(customer.id),
              opportunityType: opportunity.opportunityType,
            },
          },
          create: {
            storeId: Number(customer.storeId),
            customerId: Number(customer.id),
            predictionRunId: latestRun?.id ?? null,
            predictionSnapshotId: prediction?.id ?? null,
            opportunityType: opportunity.opportunityType,
            priority: opportunity.priority,
            status: 'open',
            score: opportunity.score,
            recommendedExecutionMode: opportunity.recommendedExecutionMode,
            recommendedChannelsJson: opportunity.channels,
            recommendedOfferJson: opportunity.offer ?? null,
            recommendedItemsJson: opportunity.items ?? [],
            evidenceJson: opportunity.evidence,
            expiresAt: opportunity.expiresAt ?? null,
          },
          update: {
            predictionRunId: latestRun?.id ?? null,
            predictionSnapshotId: prediction?.id ?? null,
            priority: opportunity.priority,
            status: 'open',
            score: opportunity.score,
            recommendedExecutionMode: opportunity.recommendedExecutionMode,
            recommendedChannelsJson: opportunity.channels,
            recommendedOfferJson: opportunity.offer ?? null,
            recommendedItemsJson: opportunity.items ?? [],
            evidenceJson: opportunity.evidence,
            expiresAt: opportunity.expiresAt ?? null,
          },
        });
        opportunityCount += 1;
        if (options.includeFulfillmentChecks !== false) {
          const check = await this.rebuildFulfillmentCheck(savedOpportunity, opportunity);
          if (check) fulfillmentCheckCount += 1;
        }
        if (options.includeAttribution !== false) {
          attributionEventCount += await this.rebuildAttributionEvents(savedOpportunity, customer, behavior);
        }
      }
    }

    const quality = scopedStoreId ? await this.createQualitySnapshot(scopedStoreId).catch(() => null) : null;
    return { rebuilt: true, reason: null, predictionRunId: latestRun?.id ?? null, snapshotCount, opportunityCount, serviceCycleCount, fulfillmentCheckCount, attributionEventCount, quality };
  }

  async listOpportunities(query: any, storeId: number) {
    if (!this.lifecycleDelegatesReady()) return this.emptyPage('customer_lifecycle_schema_pending', query);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20)));
    const where: any = {
      storeId,
      ...(query.opportunityType ? { opportunityType: String(query.opportunityType) } : {}),
      ...(query.priority ? { priority: String(query.priority) } : {}),
      ...(query.status ? { status: String(query.status) } : { status: 'open' }),
      ...(query.customerId ? { customerId: Number(query.customerId) } : {}),
      ...(query.inventoryReady !== undefined ? { fulfillmentChecks: { some: { inventoryReady: this.toBoolean(query.inventoryReady) } } } : {}),
      ...(query.capacityReady !== undefined ? { fulfillmentChecks: { some: { capacityReady: this.toBoolean(query.capacityReady) } } } : {}),
      ...(query.hasAttribution !== undefined ? { attributionEvents: this.toBoolean(query.hasAttribution) ? { some: {} } : { none: {} } } : {}),
    };
    let [items, total] = await Promise.all([
      (this.prisma as any).customerOpportunity.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true, memberLevel: true, lastVisitDate: true, totalSpent: true } },
          predictionSnapshot: true,
          fulfillmentChecks: { orderBy: { checkedAt: 'desc' }, take: 1 },
          attributionEvents: { orderBy: { occurredAt: 'desc' }, take: 5 },
        },
        orderBy: [{ priority: 'asc' }, { score: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).customerOpportunity.count({ where }),
    ]);
    if (query.projectId) {
      const projectId = Number(query.projectId);
      items = items.filter((item: any) => this.recommendedProjectIds(item).includes(projectId));
      total = items.length;
    }
    return { items: items.map((item: any) => this.serializeOpportunity(item)), data: items.map((item: any) => this.serializeOpportunity(item)), total, page, pageSize };
  }

  async getCustomerContext(customerId: number, storeId: number) {
    if (!this.lifecycleDelegatesReady()) return null;
    const where = { customerId: Number(customerId), storeId };
    const [snapshot, opportunities, events, serviceCycles, attributionEvents] = await Promise.all([
      (this.prisma as any).customerLifecycleSnapshot.findFirst({ where, orderBy: { computedAt: 'desc' } }),
      (this.prisma as any).customerOpportunity.findMany({
        where: { ...where, status: 'open' },
        include: { fulfillmentChecks: { orderBy: { checkedAt: 'desc' }, take: 1 }, attributionEvents: { orderBy: { occurredAt: 'desc' }, take: 5 } },
        orderBy: [{ priority: 'asc' }, { score: 'desc' }],
        take: 8,
      }),
      (this.prisma as any).customerLifecycleEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, take: 5 }),
      this.delegate('customerServiceCycleState')?.findMany
        ? this.delegate('customerServiceCycleState').findMany({ where, include: { project: true }, orderBy: [{ nextDueAt: 'asc' }, { updatedAt: 'desc' }], take: 8 })
        : Promise.resolve([]),
      this.delegate('lifecycleAttributionEvent')?.findMany
        ? this.delegate('lifecycleAttributionEvent').findMany({ where, orderBy: { occurredAt: 'desc' }, take: 12 })
        : Promise.resolve([]),
    ]);
    if (!snapshot && !opportunities.length) return null;
    return {
      snapshot: snapshot ? this.serializeSnapshot(snapshot) : null,
      opportunities: opportunities.map((item: any) => this.serializeOpportunity(item)),
      serviceCycles: serviceCycles.map((item: any) => this.serializeServiceCycle(item)),
      attributionEvents: attributionEvents.map((item: any) => this.serializeAttributionEvent(item)),
      events: events.map((event: any) => ({
        id: event.id,
        fromStage: event.fromStage,
        toStage: event.toStage,
        toStageLabel: STAGE_LABELS[event.toStage as LifecycleStage] ?? event.toStage,
        eventType: event.eventType,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        evidence: this.asStringArray(event.evidenceJson),
        occurredAt: event.occurredAt,
      })),
    };
  }

  async listServiceCycles(query: any, storeId: number) {
    const delegate = this.delegate('customerServiceCycleState');
    if (!delegate?.findMany) return this.emptyPage('customer_service_cycle_schema_pending', query);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20)));
    const where: any = {
      storeId,
      ...(query.customerId ? { customerId: Number(query.customerId) } : {}),
      ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
      ...(query.dueOnly ? { nextDueAt: { lte: new Date(Date.now() + 3 * 86400000) } } : {}),
    };
    const [items, total] = await Promise.all([
      delegate.findMany({ where, include: { customer: { select: { id: true, name: true, phone: true } }, project: true }, orderBy: [{ nextDueAt: 'asc' }, { updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      delegate.count({ where }),
    ]);
    return { items: items.map((item: any) => this.serializeServiceCycle(item)), data: items.map((item: any) => this.serializeServiceCycle(item)), total, page, pageSize };
  }

  async getOpportunityFulfillment(opportunityId: number, storeId: number) {
    const delegate = this.delegate('customerOpportunityFulfillmentCheck');
    if (!delegate?.findMany) return { items: [], reason: 'customer_opportunity_fulfillment_schema_pending' };
    const checks = await delegate.findMany({
      where: { opportunityId: Number(opportunityId), opportunity: { storeId } },
      orderBy: { checkedAt: 'desc' },
      take: 10,
    });
    return { items: checks.map((item: any) => this.serializeFulfillmentCheck(item)), latest: checks[0] ? this.serializeFulfillmentCheck(checks[0]) : null };
  }

  async listAttributionEvents(query: any, storeId: number) {
    const delegate = this.delegate('lifecycleAttributionEvent');
    if (!delegate?.findMany) return this.emptyPage('lifecycle_attribution_schema_pending', query);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20)));
    const where: any = {
      storeId,
      ...(query.customerId ? { customerId: Number(query.customerId) } : {}),
      ...(query.opportunityId ? { opportunityId: Number(query.opportunityId) } : {}),
      ...(query.eventType ? { eventType: String(query.eventType) } : {}),
      ...(query.recommendationKey ? { recommendationKey: String(query.recommendationKey) } : {}),
    };
    const [items, total] = await Promise.all([
      delegate.findMany({ where, orderBy: { occurredAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      delegate.count({ where }),
    ]);
    return { items: items.map((item: any) => this.serializeAttributionEvent(item)), data: items.map((item: any) => this.serializeAttributionEvent(item)), total, page, pageSize };
  }

  async getQualitySnapshot(storeId: number) {
    const scopedStoreId = storeId;
    const delegate = this.delegate('customerLifecycleQualitySnapshot');
    if (!delegate?.findFirst) return null;
    return delegate.findFirst({ where: { storeId: scopedStoreId }, orderBy: { snapshotDate: 'desc' } });
  }

  async listRules(query: any, storeId: number) {
    const delegate = this.delegate('customerLifecycleRuleVersion');
    if (!delegate?.findMany) return this.emptyPage('customer_lifecycle_rule_schema_pending', query);
    const where = {
      OR: [{ storeId }, { storeId: null }],
      ...(query.ruleType ? { ruleType: String(query.ruleType) } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
    };
    const items = await delegate.findMany({ where, orderBy: [{ ruleType: 'asc' }, { version: 'desc' }] });
    return { items, data: items, total: items.length, page: 1, pageSize: items.length };
  }

  async createRule(input: any, storeId: number) {
    const delegate = this.delegate('customerLifecycleRuleVersion');
    if (!delegate?.create) return { created: false, reason: 'customer_lifecycle_rule_schema_pending' };
    const scopedStoreId = storeId;
    const ruleType = String(input.ruleType ?? 'opportunity_rule');
    const latest = await delegate.findFirst({ where: { storeId: scopedStoreId, ruleType }, orderBy: { version: 'desc' } });
    return delegate.create({
      data: {
        storeId: scopedStoreId,
        ruleType,
        version: Number(input.version ?? Number(latest?.version ?? 0) + 1),
        status: 'draft',
        grayPercent: Math.max(0, Math.min(100, Number(input.grayPercent ?? 100))),
        ruleJson: input.ruleJson ?? {},
        evidenceJson: input.evidenceJson ?? ['规则草稿由本体治理入口创建'],
      },
    });
  }

  async publishRule(id: number, storeId: number, userId?: number) {
    const delegate = this.delegate('customerLifecycleRuleVersion');
    if (!delegate?.update) return { published: false, reason: 'customer_lifecycle_rule_schema_pending' };
    const rule = await delegate.findFirst({ where: { id: Number(id), storeId } });
    if (!rule) return { published: false, reason: 'rule_not_found' };
    await delegate.updateMany({ where: { storeId: rule.storeId, ruleType: rule.ruleType, status: 'active', NOT: { id: rule.id } }, data: { status: 'archived' } });
    return delegate.update({ where: { id: rule.id }, data: { status: 'active', publishedBy: userId ?? null, publishedAt: new Date() } });
  }

  async rollbackRule(id: number, storeId: number, userId?: number) {
    const delegate = this.delegate('customerLifecycleRuleVersion');
    if (!delegate?.update) return { rolledBack: false, reason: 'customer_lifecycle_rule_schema_pending' };
    const rule = await delegate.findFirst({ where: { id: Number(id), storeId } });
    if (!rule) return { rolledBack: false, reason: 'rule_not_found' };
    await delegate.update({ where: { id: rule.id }, data: { status: 'rolled_back', publishedBy: userId ?? rule.publishedBy ?? null } });
    const previous = await delegate.findFirst({ where: { storeId: rule.storeId, ruleType: rule.ruleType, status: 'archived', version: { lt: rule.version } }, orderBy: { version: 'desc' } });
    if (!previous) return { rolledBack: true, activeRule: null };
    const activeRule = await delegate.update({ where: { id: previous.id }, data: { status: 'active', rolledBackFromId: rule.id, publishedBy: userId ?? null, publishedAt: new Date() } });
    return { rolledBack: true, activeRule };
  }

  async createBusinessPlan(input: any, storeId: number, userId?: number) {
    const delegate = this.delegate('lifecycleBusinessPlan');
    if (!delegate?.create) return { created: false, reason: 'lifecycle_business_plan_schema_pending' };
    const scopedStoreId = storeId;
    const opportunities = await (this.prisma as any).customerOpportunity.findMany({
      where: { storeId: scopedStoreId, status: 'open' },
      include: { fulfillmentChecks: { orderBy: { checkedAt: 'desc' }, take: 1 } },
      orderBy: [{ priority: 'asc' }, { score: 'desc' }],
      take: 20,
    });
    const actions = this.buildBusinessPlanActions(opportunities);
    return delegate.create({
      data: {
        storeId: scopedStoreId,
        planPeriod: String(input.planPeriod ?? this.currentWeekKey()),
        title: String(input.title ?? '客户生命周期经营周计划'),
        status: 'draft',
        goalsJson: input.goalsJson ?? { focus: ['复购提升', '沉睡召回', '低峰填充'], period: input.planPeriod ?? this.currentWeekKey() },
        actionsJson: actions,
        evidenceJson: this.uniqueStrings(opportunities.flatMap((item: any) => this.asStringArray(item.evidenceJson))).slice(0, 12),
        createdBy: userId ?? null,
      },
    });
  }

  async submitBusinessPlanActions(id: number, storeId: number, input: any = {}, userId?: number) {
    const delegate = this.delegate('lifecycleBusinessPlan');
    if (!delegate?.update) return { submitted: false, reason: 'lifecycle_business_plan_schema_pending' };
    const plan = await delegate.findFirst({ where: { id: Number(id), storeId } });
    if (!plan) return { submitted: false, reason: 'business_plan_not_found' };
    const selectedActionIds = Array.isArray(input.actionIds) ? input.actionIds.map((item: any) => String(item)) : [];
    const actions = Array.isArray(plan.actionsJson) ? plan.actionsJson : [];
    const selectedActions = selectedActionIds.length ? actions.filter((item: any) => selectedActionIds.includes(String(item.id))) : actions;
    const agentApproval = await this.createBusinessPlanApproval(plan, selectedActions, userId, input);
    const updated = await delegate.update({
      where: { id: plan.id },
      data: {
        status: 'waiting_approval',
        submittedAt: new Date(),
        approvalJson: {
          required: true,
          submittedBy: userId ?? null,
          submittedAt: new Date().toISOString(),
          allowedExecution: ['activity_draft', 'automation_draft', 'terminal_follow_up_task'],
          selectedActions,
          sourceAgentCode: input.sourceAgentCode ?? null,
          sourceRunId: input.sourceRunId ?? null,
          sourceEntrypoint: input.sourceEntrypoint ?? null,
          agentRunId: agentApproval?.run?.id ?? null,
          agentApprovalId: agentApproval?.approval?.id ?? null,
          boundary: '审批后仅创建草稿或跟进任务，不自动发券、不群发、不改库存/订单/客户资产。',
        },
      },
    });
    return { submitted: true, approvalRequired: true, agentRun: agentApproval?.run ?? null, approval: agentApproval?.approval ?? null, plan: updated };
  }

  private async createBusinessPlanApproval(plan: any, selectedActions: any[], userId?: number, source: any = {}) {
    const runDelegate = this.delegate('agentRun');
    const approvalDelegate = this.delegate('agentApproval');
    if (!runDelegate?.create || !approvalDelegate?.create) return null;
    const now = new Date();
    const sourceAgentCode = String(source.sourceAgentCode ?? '').trim() || 'lifecycle_business_agent';
    const sourceRunId = source.sourceRunId != null ? Number(source.sourceRunId) : null;
    const sourceEntrypoint = String(source.sourceEntrypoint ?? '').trim() || 'ami-agent:lifecycle-business-plan';
    const run = await runDelegate.create({
      data: {
        runNo: `LIFECYCLE-BP-${plan.id}-${now.getTime()}`,
        storeId: Number(plan.storeId),
        userId: userId ?? null,
        role: 'manager',
        entrypoint: sourceEntrypoint,
        agentCode: sourceAgentCode,
        personaCode: 'manager',
        status: 'waiting_approval',
        userInput: `提交客户生命周期经营计划审批：${plan.title ?? plan.planPeriod}`,
        planJson: {
          businessPlanId: plan.id,
          planPeriod: plan.planPeriod,
          title: plan.title,
          selectedActions,
          sourceRunId,
        },
        contextJson: {
          source: 'customer_lifecycle_ontology',
          boundary: 'approval_required_before_marketing_execution',
          sourceAgentCode,
          sourceRunId,
          sourceEntrypoint,
        },
        evidenceJson: plan.evidenceJson ?? [],
        resultJson: {
          answer: '经营计划已提交审批，审批通过后才允许创建活动草稿、自动规则草稿或终端跟进任务。',
          approvalRequired: true,
        },
      },
    });
    const approval = await approvalDelegate.create({
      data: {
        runId: run.id,
        status: 'pending',
        requestedBy: userId ?? null,
        beforeJson: {
          businessPlanId: plan.id,
          planPeriod: plan.planPeriod,
          title: plan.title,
          selectedActions,
          sourceAgentCode,
          sourceRunId,
          allowedExecution: ['activity_draft', 'automation_draft', 'terminal_follow_up_task'],
          blockedExecution: ['auto_send_coupon', 'mass_send', 'customer_asset_write', 'stock_deduct', 'order_create'],
        },
      },
    });
    return { run, approval };
  }

  async buildRecommendationCards(storeId: number, limit = 20) {
    if (!this.lifecycleDelegatesReady()) return [];
    const opportunities = await (this.prisma as any).customerOpportunity.findMany({
      where: { storeId, status: 'open', opportunityType: { in: ALL_OPPORTUNITY_TYPES } },
      include: { customer: true, predictionSnapshot: true, predictionRun: true, fulfillmentChecks: { orderBy: { checkedAt: 'desc' }, take: 1 }, attributionEvents: { orderBy: { occurredAt: 'desc' }, take: 5 } },
      orderBy: [{ priority: 'asc' }, { score: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(20, limit * 5),
    });
    const grouped = new Map<string, any[]>();
    for (const item of opportunities) {
      if (!grouped.has(item.opportunityType)) grouped.set(item.opportunityType, []);
      grouped.get(item.opportunityType)!.push(item);
    }
    return [...grouped.entries()].map(([type, items], index) => this.buildCardFromOpportunityGroup(type as OpportunityType, items, index));
  }

  private buildCardFromOpportunityGroup(type: OpportunityType, items: any[], index: number) {
    const first = items[0];
    const customerIds = items.map((item) => Number(item.customerId));
    const latestChecks = items.map((item) => item.fulfillmentChecks?.[0]).filter(Boolean);
    const inventoryReady = latestChecks.length ? latestChecks.every((check: any) => check.inventoryReady) : true;
    const capacityReady = latestChecks.length ? latestChecks.every((check: any) => check.capacityReady) : true;
    const attributionCount = items.reduce((sum, item) => sum + Number(item.attributionEvents?.length ?? 0), 0);
    const avgScore = Math.round(items.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / Math.max(items.length, 1));
    const evidence = this.uniqueStrings(items.flatMap((item) => this.asStringArray(item.evidenceJson))).slice(0, 8);
    const run = first.predictionRun;
    const mode = first.recommendedExecutionMode ?? 'automation';
    const label = OPPORTUNITY_LABELS[type];
    const targetLabel = `${label}客户（${items.length}人）`;
    return {
      id: 9000 + index + 1,
      recommendationKey: `lifecycle:${type}`,
      opportunityIds: items.map((item) => Number(item.id)),
      title: `${items.length} 位客户命中${label}`,
      reason: evidence[0] ?? `客户命中${label}规则，建议及时承接。`,
      targetCustomers: targetLabel,
      targetCount: items.length,
      targetCustomerIds: customerIds,
      expectedConversion: `预计转化率 ${Math.max(18, Math.min(48, Math.round(avgScore / 2)))}%`,
      expectedRevenue: `预计营收 ¥${Math.round(items.reduce((sum, item) => sum + Number(item.predictionSnapshot?.ltv6m ?? 0), 0) * 0.08).toLocaleString('zh-CN')}`,
      strategy: this.strategyForOpportunity(type),
      discount: first.recommendedOfferJson?.label ?? '门店专属权益',
      duration: '建议周期: 30天',
      matchScore: Math.max(60, Math.min(98, avgScore)),
      image: undefined,
      tags: [label, '生命周期本体', P1_OPPORTUNITY_TYPES.includes(type) ? 'P1' : 'P0'],
      category: type,
      source: 'customer_lifecycle',
      recommendationType: type,
      triggerType: type === 'card_expiring' ? 'card_expiry' : type,
      triggerRule: { type, params: this.triggerParamsForOpportunity(type), defaultEditable: true, reason: '基于客户生命周期机会自动生成，运营可在创建草稿时调整。' },
      priority: first.priority ?? 'P1',
      urgency: first.priority === 'P0' ? 'urgent' : 'recommended',
      urgencyLabel: first.priority === 'P0' ? '紧急' : '推荐',
      executionModes: mode === 'activity' ? ['activity', 'advisor_task'] : ['automation', 'advisor_task'],
      preferredMode: mode,
      modeReason: mode === 'automation' ? '该机会会随客户状态滚动变化，适合自动规则持续承接。' : '该机会适合先用一次性活动集中验证。',
      recommendedChannels: first.recommendedChannelsJson ?? [],
      recommendedActions: (first.recommendedChannelsJson ?? []).map((channel: any) => ({ type: 'consultant_task', value: first.recommendedOfferJson?.label ?? label, channel: channel.channel, reason: channel.reason })),
      offer: first.recommendedOfferJson ?? { type: 'member_privilege', label: '门店专属权益', reason: '生命周期机会默认使用低风险权益，避免过度促销。' },
      recommendedItems: first.recommendedItemsJson ?? [],
      audienceSnapshot: {
        predictionRunId: run?.id ?? first.predictionRunId ?? undefined,
        generatedAt: new Date().toISOString(),
        ruleSummary: targetLabel,
        customerIds,
        totalCustomers: items.length,
        sampleReasons: items.slice(0, 10).map((item) => ({ customerId: item.customerId, reason: this.asStringArray(item.evidenceJson)[0] ?? label, score: item.score })),
      },
      fulfillment: {
        inventoryReady,
        capacityReady,
        latestChecks: latestChecks.map((check: any) => this.serializeFulfillmentCheck(check)),
      },
      attributionSummary: {
        eventCount: attributionCount,
        hasAttribution: attributionCount > 0,
      },
      sourceSignals: ['customer_lifecycle_ontology', type],
      predictionRunId: run?.id ?? first.predictionRunId ?? undefined,
      modelVersion: run?.modelVersion ?? 'customer-lifecycle-ontology-p0',
      predictionType: type,
      predictionRunFinishedAt: run?.finishedAt ?? run?.startedAt ?? first.updatedAt,
      dataEvidence: evidence,
      totalCustomers: items.length,
      riskWarnings: this.uniqueStrings([
        '只生成建议和草稿，不自动发券、不自动群发、不修改客户资产。',
        inventoryReady ? null : '库存不足或低于安全库存，不建议直接扩大营销曝光。',
        capacityReady ? null : '未来 7 天产能不足，建议先转顾问小范围邀约。',
      ]),
    };
  }

  private async rebuildServiceCyclesForCustomer(customer: any) {
    const delegate = this.delegate('customerServiceCycleState');
    if (!delegate?.upsert) return [];
    const seeds = this.collectServiceCycleSeeds(customer);
    const results: any[] = [];
    for (const seed of seeds) {
      const saved = await delegate.upsert({
        where: { storeId_customerId_projectId: { storeId: Number(customer.storeId), customerId: Number(customer.id), projectId: Number(seed.projectId) } },
        create: {
          storeId: Number(customer.storeId),
          customerId: Number(customer.id),
          projectId: Number(seed.projectId),
          lastServiceAt: seed.lastServiceAt,
          cycleDays: seed.cycleDays,
          nextDueAt: seed.nextDueAt,
          sourceType: seed.sourceType,
          sourceId: seed.sourceId,
          evidenceJson: seed.evidence,
        },
        update: {
          lastServiceAt: seed.lastServiceAt,
          cycleDays: seed.cycleDays,
          nextDueAt: seed.nextDueAt,
          sourceType: seed.sourceType,
          sourceId: seed.sourceId,
          evidenceJson: seed.evidence,
        },
        include: { project: { include: { bomItems: { include: { product: true } } } } },
      });
      results.push(saved);
    }
    return results;
  }

  private collectServiceCycleSeeds(customer: any) {
    const seeds = new Map<number, any>();
    const addSeed = (project: any, lastServiceAt: any, sourceType: string, sourceId: any, evidence: string[]) => {
      const projectId = Number(project?.id);
      if (!projectId || !lastServiceAt) return;
      const cycleDays = Math.max(7, Number(project?.careCycleWeeks ?? 4) * 7 || 28);
      const nextDueAt = new Date(new Date(lastServiceAt).getTime() + cycleDays * 86400000);
      const current = seeds.get(projectId);
      if (current && new Date(current.lastServiceAt).getTime() >= new Date(lastServiceAt).getTime()) return;
      seeds.set(projectId, { projectId, project, lastServiceAt: new Date(lastServiceAt), cycleDays, nextDueAt, sourceType, sourceId: String(sourceId ?? ''), evidence });
    };
    for (const record of customer.cardUsageRecords ?? []) {
      addSeed(record.project, record.verifiedAt, 'card_usage_record', record.id, [`${record.projectName ?? record.project?.name ?? '服务项目'} 已核销，按 ${Number(record.project?.careCycleWeeks ?? 4) * 7 || 28} 天护理周期计算`]);
    }
    for (const reservation of customer.reservations ?? []) {
      if (reservation.checkedInAt || ['completed', 'checked_in', 'done'].includes(String(reservation.status))) {
        addSeed(reservation.project, reservation.checkedInAt ?? reservation.date, 'reservation', reservation.id, [`${reservation.project?.name ?? '服务项目'} 已到店/完成，形成下一次护理窗口`]);
      }
    }
    for (const order of customer.productOrders ?? []) {
      for (const item of order.orderItems ?? []) {
        if (!/project|service/i.test(String(item.itemType ?? ''))) continue;
        addSeed({ id: item.itemId, name: item.name, careCycleWeeks: item.payload?.careCycleWeeks ?? 4, bomItems: [] }, order.createdAt, 'project_order', order.id, [`${item.name} 项目订单已完成，按默认护理周期形成复购窗口`]);
      }
    }
    return [...seeds.values()];
  }

  private buildP1Opportunities(customer: any, prediction: any | null, serviceCycles: any[]): OpportunitySeed[] {
    const opportunities: OpportunitySeed[] = [];
    const responseScore = Number(prediction?.marketingResponseScore ?? 0);
    const totalSpent = Number(customer.totalSpent ?? 0);
    const dueCycles = serviceCycles.filter((cycle) => cycle.nextDueAt && new Date(cycle.nextDueAt).getTime() <= Date.now() + 3 * 86400000);
    const firstDue = dueCycles[0];
    if (firstDue) {
      opportunities.push(this.opportunity('project_cycle_due', Math.max(72, responseScore + 12), 'P1', [
        `${firstDue.project?.name ?? '项目'} 下一次护理窗口 ${this.formatDate(firstDue.nextDueAt)} 已到达`,
        `上次服务 ${this.formatDate(firstDue.lastServiceAt)}，护理周期 ${firstDue.cycleDays} 天`,
      ], 'automation', [{ type: 'project', projectId: firstDue.projectId, name: firstDue.project?.name ?? '周期护理项目', reason: '来自客户-项目服务周期状态', confidence: 88 }]));
    }
    const bundleCycle = serviceCycles.find((cycle) => (cycle.project?.bomItems ?? []).some((item: any) => Number(item.product?.currentStock ?? 0) > Number(item.product?.safetyStock ?? 0)));
    if (bundleCycle) {
      const product = bundleCycle.project.bomItems.find((item: any) => Number(item.product?.currentStock ?? 0) > Number(item.product?.safetyStock ?? 0))?.product;
      opportunities.push(this.opportunity('homecare_bundle', Math.max(65, responseScore), 'P1', [
        `${bundleCycle.project?.name ?? '服务项目'} 关联居家护理商品 ${product?.name ?? '可售商品'}`,
        '商品库存高于安全库存，可做服务后带回家推荐',
      ], 'advisor_task', [{ type: 'project', projectId: bundleCycle.projectId, name: bundleCycle.project?.name }, { type: 'product', productId: product?.id, name: product?.name }]));
    }
    if (totalSpent >= 20000 && dueCycles.length) {
      opportunities.push(this.opportunity('service_upgrade', Math.max(70, responseScore + 8), 'P1', [
        `客户累计消费 ${Math.round(totalSpent)}，具备升级护理承接空间`,
        '建议由顾问先确认需求，再创建活动或跟进任务',
      ], 'advisor_task', [{ type: 'project', projectId: firstDue?.projectId, name: '高阶护理升级方案', reason: '高价值客户 + 护理周期到期' }]));
    }
    if (responseScore >= 60 || ['黄金', '铂金'].includes(String(prediction?.ltvTier ?? ''))) {
      opportunities.push(this.opportunity('project_idle_capacity', Math.max(62, responseScore), 'P1', [
        '客户响应分较高，可优先匹配未来 7 天低峰产能',
        `营销响应分 ${responseScore || '待计算'}`,
      ], 'advisor_task', firstDue ? [{ type: 'project', projectId: firstDue.projectId, name: firstDue.project?.name ?? '低峰可约项目' }] : []));
    }
    const clearanceCycle = serviceCycles.find((cycle) => (cycle.project?.bomItems ?? []).some((item: any) => this.productHasExpiringStock(item.product)));
    if (clearanceCycle) {
      opportunities.push(this.opportunity('inventory_clearance', Math.max(60, responseScore), 'P2', [
        `${clearanceCycle.project?.name ?? '服务项目'} 关联商品存在库存消化机会`,
        '仅生成承接建议，不自动调价或扣库存',
      ], 'activity', [{ type: 'project', projectId: clearanceCycle.projectId, name: clearanceCycle.project?.name ?? '库存消化项目' }]));
    }
    return opportunities;
  }

  private async rebuildFulfillmentCheck(savedOpportunity: any, seed: OpportunitySeed) {
    const delegate = this.delegate('customerOpportunityFulfillmentCheck');
    if (!delegate?.create) return null;
    const storeId = Number(savedOpportunity.storeId);
    const targetCount = 1;
    const projectIds = this.recommendedProjectIds(savedOpportunity, seed);
    const requiredProducts = await this.calculateRequiredProducts(projectIds, targetCount);
    const inventoryReady = requiredProducts.every((item) => item.ready);
    const capacitySnapshot = await this.calculateCapacitySnapshot(storeId, projectIds[0]);
    const capacityReady = capacitySnapshot.ready;
    const risks = this.uniqueStrings([
      inventoryReady ? null : '项目关联耗材库存不足或低于安全库存',
      capacityReady ? null : '未来 7 天未找到足够可预约产能',
    ]);
    return delegate.create({
      data: {
        opportunityId: Number(savedOpportunity.id),
        inventoryReady,
        capacityReady,
        requiredProductsJson: requiredProducts,
        capacitySnapshotJson: capacitySnapshot,
        riskJson: risks,
      },
    });
  }

  private async rebuildAttributionEvents(savedOpportunity: any, customer: any, behaviorEvents: any[] = []) {
    const delegate = this.delegate('lifecycleAttributionEvent');
    if (!delegate?.create) return 0;
    let count = 0;
    for (const [index, touch] of (customer.marketingTouches ?? []).entries()) {
      if (!ATTRIBUTABLE_TOUCH_STATUS_SET.has(String(touch.status))) continue;
      if (await this.createAttributionEventOnce({
        storeId: Number(savedOpportunity.storeId),
        customerId: Number(customer.id),
        opportunityId: Number(savedOpportunity.id),
        recommendationKey: `lifecycle:${savedOpportunity.opportunityType}`,
        eventType: touch.convertedAt || touch.status === 'converted' ? 'touch_converted' : 'touch_reached',
        sourceType: 'marketing_touch',
        sourceId: this.attributionSourceId('marketing_touch', touch, index, touch.touchedAt),
        touchId: Number(touch.id),
        eventValue: Number(touch.actualRevenue ?? 0),
        evidenceJson: [`${touch.channel ?? '未知渠道'} 触达状态 ${touch.status}`],
        occurredAt: touch.convertedAt ?? touch.touchedAt,
      })) count += 1;
    }
    for (const [index, event] of (customer.recommendationEvents ?? []).entries()) {
      if (await this.createAttributionEventOnce({
        storeId: Number(savedOpportunity.storeId),
        customerId: Number(customer.id),
        opportunityId: Number(savedOpportunity.id),
        recommendationKey: `lifecycle:${savedOpportunity.opportunityType}`,
        eventType: String(event.eventType ?? 'recommendation_event'),
        sourceType: 'recommendation_event',
        sourceId: this.attributionSourceId('recommendation_event', event, index, event.createdAt),
        orderId: event.orderId ?? null,
        evidenceJson: [event.note ?? '终端/推荐事件已记录'],
        occurredAt: event.createdAt,
      })) count += 1;
    }
    for (const [index, event] of ([...(behaviorEvents ?? []), ...(customer.customerAppEvents ?? [])]).entries()) {
      const occurredAt = event.occurredAt ?? event.createdAt;
      if (await this.createAttributionEventOnce({
        storeId: Number(savedOpportunity.storeId),
        customerId: Number(customer.id),
        opportunityId: Number(savedOpportunity.id),
        recommendationKey: `lifecycle:${savedOpportunity.opportunityType}`,
        eventType: this.lifecycleBehaviorEventType(event),
        sourceType: event.source ? 'customer_app_event' : 'customer_behavior_event',
        sourceId: this.attributionSourceId(event.source ? 'customer_app_event' : 'customer_behavior_event', event, index, occurredAt),
        eventValue: Number(event.value ?? event.eventValue ?? 0),
        evidenceJson: this.lifecycleBehaviorEvidence(event),
        occurredAt,
      })) count += 1;
    }
    for (const [index, reservation] of (customer.reservations ?? []).entries()) {
      if (await this.createAttributionEventOnce({
        storeId: Number(savedOpportunity.storeId),
        customerId: Number(customer.id),
        opportunityId: Number(savedOpportunity.id),
        recommendationKey: `lifecycle:${savedOpportunity.opportunityType}`,
        eventType: reservation.checkedInAt ? 'reservation_checked_in' : 'reservation_created',
        sourceType: 'reservation',
        sourceId: this.attributionSourceId('reservation', reservation, index, reservation.createdAt ?? reservation.date),
        reservationId: Number(reservation.id),
        evidenceJson: [`预约项目 ${reservation.project?.name ?? reservation.projectId}`],
        occurredAt: reservation.checkedInAt ?? reservation.createdAt,
      })) count += 1;
    }
    for (const [index, usage] of (customer.cardUsageRecords ?? []).entries()) {
      if (await this.createAttributionEventOnce({
        storeId: Number(savedOpportunity.storeId),
        customerId: Number(customer.id),
        opportunityId: Number(savedOpportunity.id),
        recommendationKey: `lifecycle:${savedOpportunity.opportunityType}`,
        eventType: 'card_usage_verified',
        sourceType: 'card_usage_record',
        sourceId: this.attributionSourceId('card_usage_record', usage, index, usage.verifiedAt),
        orderId: null,
        eventValue: Number(usage.recognizedAmount ?? usage.recognizedUnitValue ?? 0),
        evidenceJson: [`核销 ${usage.projectName ?? usage.project?.name ?? '服务项目'} ${usage.times ?? 1} 次`],
        occurredAt: usage.verifiedAt,
      })) count += 1;
    }
    for (const [index, order] of (customer.productOrders ?? []).entries()) {
      const status = String(order.status ?? '');
      if (/cancel|refund|void|取消|退款/.test(status)) continue;
      if (await this.createAttributionEventOnce({
        storeId: Number(savedOpportunity.storeId),
        customerId: Number(customer.id),
        opportunityId: Number(savedOpportunity.id),
        recommendationKey: `lifecycle:${savedOpportunity.opportunityType}`,
        eventType: status === 'completed' ? 'order_completed' : 'order_created',
        sourceType: 'product_order',
        sourceId: this.attributionSourceId('product_order', order, index, order.createdAt),
        orderId: Number(order.id),
        eventValue: Number(order.netAmount ?? order.totalAmount ?? 0),
        evidenceJson: [`订单 ${order.orderNo ?? order.id} 状态 ${status || 'created'}`],
        occurredAt: order.createdAt,
      })) count += 1;
    }
    return count;
  }

  private async createAttributionEventOnce(data: any) {
    const delegate = this.delegate('lifecycleAttributionEvent');
    const normalized = {
      ...data,
      sourceId: String(data.sourceId ?? `${data.sourceType}:${data.customerId}:${data.eventType}:${new Date(data.occurredAt ?? Date.now()).getTime()}`),
      touchId: Number.isFinite(Number(data.touchId)) ? Number(data.touchId) : null,
      orderId: Number.isFinite(Number(data.orderId)) ? Number(data.orderId) : null,
      reservationId: Number.isFinite(Number(data.reservationId)) ? Number(data.reservationId) : null,
      occurredAt: data.occurredAt ?? new Date(),
    };
    const existing = await delegate.findFirst?.({ where: { sourceType: normalized.sourceType, sourceId: normalized.sourceId, opportunityId: normalized.opportunityId } });
    if (existing) return null;
    try {
      return await delegate.create({ data: normalized });
    } catch (error: any) {
      if (error?.code !== 'P2003') throw error;
      return delegate.create({
        data: {
          ...normalized,
          touchId: null,
          orderId: null,
          reservationId: null,
          stockMovementId: null,
          evidenceJson: this.uniqueStrings([
            ...this.asStringArray(normalized.evidenceJson),
            '源事件外键已断裂，仅保留轻量归因证据。',
          ]),
        },
      });
    }
  }

  private attributionSourceId(sourceType: string, item: any, index: number, occurredAt?: Date | string | null) {
    if (item?.id != null) return String(item.id);
    const timestamp = new Date(occurredAt ?? item?.createdAt ?? Date.now()).getTime();
    return `${sourceType}:${item?.customerId ?? 'customer'}:${item?.eventType ?? item?.status ?? 'event'}:${timestamp}:${index}`;
  }

  private lifecycleBehaviorEventType(event: any) {
    const type = String(event.eventType ?? event.type ?? 'behavior_event');
    if (/coupon_used|promotion_used|核销|使用/.test(type)) return 'coupon_used';
    if (/coupon_claimed|promotion_claimed|领券|领取/.test(type)) return 'coupon_claimed';
    if (/booking|appointment|reservation|预约/.test(type)) return 'reservation_intent';
    if (/browse|view|project_view|activity_view|page_view|浏览|查看/.test(type)) return 'behavior_view';
    if (/click|点击/.test(type)) return 'behavior_click';
    return `behavior_${type}`;
  }

  private lifecycleBehaviorEvidence(event: any) {
    const type = String(event.eventType ?? event.type ?? 'behavior_event');
    const label = event.projectName ?? event.activityName ?? event.pageTitle ?? event.pagePath ?? event.source ?? '';
    return [`客户行为 ${type}${label ? `：${label}` : ''}`];
  }

  private async calculateRequiredProducts(projectIds: number[], targetCount: number) {
    if (!projectIds.length) return [];
    const projects = await this.prisma.project.findMany({ where: { id: { in: projectIds } }, include: { bomItems: { include: { product: true } } } });
    return projects.flatMap((project: any) => (project.bomItems ?? []).map((item: any) => {
      const requiredQty = Number(item.standardQty ?? 0) * Math.max(1, targetCount);
      const currentStock = Number(item.product?.currentStock ?? 0);
      const safetyStock = Number(item.product?.safetyStock ?? 0);
      const availableAboveSafety = currentStock - safetyStock;
      return {
        projectId: project.id,
        projectName: project.name,
        productId: item.productId,
        productName: item.product?.name,
        requiredQty,
        unit: item.unit ?? item.product?.specUnit ?? item.product?.unit,
        currentStock,
        safetyStock,
        availableAboveSafety,
        ready: availableAboveSafety >= requiredQty,
      };
    }));
  }

  private async calculateCapacitySnapshot(storeId: number, projectId?: number) {
    if (!projectId) return { ready: true, reason: '未绑定具体项目，跳过产能校验' };
    const start = new Date();
    const end = new Date(Date.now() + 7 * 86400000);
    const [schedules, reservations] = await Promise.all([
      this.prisma.schedule.findMany({ where: { storeId, date: { gte: start, lte: end }, status: { in: ['available', 'open'] } }, take: 200 }),
      this.prisma.reservation.findMany({ where: { storeId, projectId, date: { gte: start, lte: end }, status: { notIn: ['cancelled', 'no_show'] } }, take: 200 }),
    ]);
    const availableSlots = Math.max(0, schedules.length - reservations.length);
    return {
      ready: availableSlots > 0,
      windowDays: 7,
      availableSlots,
      scheduleCount: schedules.length,
      reservationCount: reservations.length,
      projectId,
      dateRange: `${this.formatDate(start)} - ${this.formatDate(end)}`,
    };
  }

  private classifyLifecycleStage(customer: any, prediction: any | null): { stage: LifecycleStage; ltvTier: string; churnRiskLevel: string; touchFatigueScore: number; evidence: string[] } {
    const visitCount = Number(customer.visitCount ?? 0);
    const totalSpent = Number(customer.totalSpent ?? 0);
    const lastVisitDays = this.daysSince(customer.lastVisitDate);
    const activeCards = this.activeCards(customer);
    const touchFatigueScore = this.calculateTouchFatigue(customer.marketingTouches ?? []);
    const evidence: string[] = [];
    let stage: LifecycleStage = 'active';

    if (visitCount <= 0 && totalSpent <= 0) {
      stage = 'lead';
      evidence.push('客户尚无到店或消费记录');
    } else if (visitCount <= 2 || this.daysSince(customer.createdAt) <= 30) {
      stage = 'new_customer';
      evidence.push('客户仍处于首购/新客观察期');
    } else if (activeCards.length > 0) {
      stage = 'member';
      evidence.push(`客户有 ${activeCards.length} 张有效卡项`);
    }
    if (visitCount > 2 && !activeCards.length && totalSpent > 0) {
      stage = 'trial';
      evidence.push('客户有体验或单次消费记录，但未沉淀有效卡项');
    }
    if ((prediction?.ltvTier && ['铂金', '黄金'].includes(prediction.ltvTier)) || totalSpent >= 20000) {
      stage = 'growth';
      evidence.push(`客户价值层级 ${prediction?.ltvTier ?? '高价值'}`);
    }
    if ((prediction?.churnScore ?? 0) >= 70 || lastVisitDays >= 90) {
      stage = lastVisitDays >= 180 ? 'dormant' : 'at_risk';
      evidence.push(lastVisitDays >= 9999 ? '缺少最近到店记录' : `距上次到店 ${lastVisitDays} 天`);
    }
    if (lastVisitDays >= 365 && (prediction?.marketingResponseScore ?? 0) < 30) {
      stage = 'lost';
      evidence.push('长期无到店且营销响应偏低');
    }

    return {
      stage,
      ltvTier: prediction?.ltvTier ?? (totalSpent >= 50000 ? '铂金' : totalSpent >= 25000 ? '黄金' : totalSpent >= 10000 ? '白银' : '青铜'),
      churnRiskLevel: prediction?.churnLevel ?? (lastVisitDays >= 180 ? '极高' : lastVisitDays >= 90 ? '高' : lastVisitDays >= 60 ? '中' : '低'),
      touchFatigueScore,
      evidence: this.uniqueStrings(evidence),
    };
  }

  private buildOpportunities(customer: any, prediction: any | null, behaviorEvents: any[], stage: LifecycleStage): OpportunitySeed[] {
    const opportunities: OpportunitySeed[] = [];
    const lastVisitDays = this.daysSince(customer.lastVisitDate);
    const responseScore = Number(prediction?.marketingResponseScore ?? 0);
    const repurchaseScore = Number(prediction?.repurchase30dScore ?? 0);
    const churnScore = Number(prediction?.churnScore ?? 0);
    const activeCards = this.activeCards(customer);
    const expiringCards = activeCards.filter((card: any) => this.daysUntil(card.expiryDate) <= 30);

    if (lastVisitDays >= 21 && repurchaseScore >= 45) {
      opportunities.push(this.opportunity('care_cycle_due', repurchaseScore + 8, 'P1', [
        `距上次到店 ${lastVisitDays} 天，已进入常见护理周期提醒窗口`,
        `30 天复购分 ${repurchaseScore} 分`,
      ]));
    }
    if (expiringCards.length || Number(prediction?.featureJson?.cardExpiryUrgencyScore ?? 0) >= 50) {
      opportunities.push(this.opportunity('card_expiring', Math.max(78, responseScore + 10), 'P0', [
        expiringCards.length ? `${expiringCards.length} 张有效卡项 30 天内到期或待使用` : '预测特征显示卡项到期风险较高',
        activeCards.length ? `有效卡项 ${activeCards.length} 张` : '需要顾问确认卡项状态',
      ]));
    }
    if (['at_risk', 'dormant', 'lost'].includes(stage) || churnScore >= 70) {
      opportunities.push(this.opportunity('dormant_winback', Math.max(churnScore, 70), 'P0', [
        `生命周期阶段：${STAGE_LABELS[stage] ?? stage}`,
        `流失风险 ${prediction?.churnLevel ?? '高'}，流失分 ${churnScore || '待计算'}`,
      ], 'activity'));
    }
    if (this.hasClaimedUnusedCoupon(behaviorEvents, customer.customerAppEvents ?? [])) {
      opportunities.push(this.opportunity('coupon_claimed_unused', Math.max(68, responseScore), 'P0', [
        '客户存在领券后未核销行为',
        `营销响应分 ${responseScore || '待计算'}`,
      ]));
    }
    if (this.hasBrowseAbandonment(behaviorEvents, customer.customerAppEvents ?? [])) {
      opportunities.push(this.opportunity('browse_abandonment', Math.max(70, responseScore), 'P0', [
        '客户近期浏览项目/活动但未形成预约或成交',
        `复购分 ${repurchaseScore || '待计算'}，营销响应分 ${responseScore || '待计算'}`,
      ]));
    }

    return opportunities.sort((a, b) => b.score - a.score);
  }

  private opportunity(type: OpportunityType, score: number, priority: 'P0' | 'P1' | 'P2', evidence: string[], mode: ExecutionMode = 'automation', items?: Array<Record<string, any>>): OpportunitySeed {
    const validDays = type === 'browse_abandonment' ? 7 : type === 'coupon_claimed_unused' ? 7 : 30;
    const expiresAt = new Date(Date.now() + validDays * 86400000);
    return {
      opportunityType: type,
      priority,
      score: Math.max(0, Math.min(100, Math.round(score))),
      recommendedExecutionMode: mode,
      channels: this.channelsForOpportunity(type),
      offer: this.offerForOpportunity(type),
      items: items?.length ? items : this.itemsForOpportunity(type),
      evidence,
      expiresAt,
    };
  }

  private channelsForOpportunity(type: OpportunityType) {
    const miniapp = { channel: 'miniapp', label: '小程序', reason: '直接承接权益、预约和核销入口。', priority: 'P0' };
    const advisor = { channel: 'store', label: '顾问跟进', reason: '需要人工确认需求和预约意向。', priority: 'P0' };
    const sms = { channel: 'sms', label: '短信', reason: '适合到期、沉睡或未读客户强提醒。', priority: 'P1' };
    if (type === 'dormant_winback' || type === 'card_expiring') return [advisor, miniapp, sms];
    return [miniapp, advisor];
  }

  private offerForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, Record<string, any>> = {
      care_cycle_due: { type: 'money_off', label: '护理周期专享满500减80', threshold: 500, amount: 80, validDays: 21, reason: '小额权益配合护理周期提醒，避免过度让利。' },
      card_expiring: { type: 'gift', label: '续卡专享赠护理一次', validDays: 30, reason: '卡项场景优先用权益赠送推动核销和续卡。' },
      dormant_winback: { type: 'money_off', label: '回归专享满300减100', threshold: 300, amount: 100, validDays: 30, reason: '沉睡召回需要更强权益，但保留消费门槛。' },
      coupon_claimed_unused: { type: 'member_privilege', label: '已领权益核销提醒', validDays: 7, reason: '优先推动已领权益核销，不新增额外让利。' },
      browse_abandonment: { type: 'gift', label: '预约保留提醒 + 到店小礼', validDays: 3, reason: '浏览未预约更适合轻权益和顾问协助。' },
      project_cycle_due: { type: 'money_off', label: '项目护理周期预约礼', threshold: 500, amount: 60, validDays: 14, reason: '按具体项目周期提醒复购，权益强度低于沉睡召回。' },
      homecare_bundle: { type: 'bundle', label: '项目后居家护理组合', validDays: 14, reason: '优先承接服务后的商品连带，不额外强促销。' },
      service_upgrade: { type: 'member_privilege', label: '高阶护理升级顾问权益', validDays: 21, reason: '高价值客户先由顾问确认需求，再决定权益。' },
      project_idle_capacity: { type: 'off_peak', label: '低峰预约专享礼', validDays: 7, reason: '用于填充低峰可售产能，避免占用高峰资源。' },
      inventory_clearance: { type: 'bundle', label: '库存消化护理组合', validDays: 14, reason: '仅在库存可承接时建议小范围活动。' },
    };
    return map[type];
  }

  private itemsForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, Array<Record<string, any>>> = {
      care_cycle_due: [{ type: 'project', name: '护理周期复购项目', category: '面部护理', reason: '匹配客户常见 21-30 天复购节奏。', confidence: 86 }],
      card_expiring: [{ type: 'card', name: '护理次卡续费方案', category: '卡项', reason: '客户已有卡项使用习惯，适合续卡或升级。', confidence: 84 }],
      dormant_winback: [{ type: 'project', name: '回店护理关怀方案', category: '面部护理', reason: '适合长期未到店客户恢复服务关系。', confidence: 82 }],
      coupon_claimed_unused: [{ type: 'project', name: '优惠券适配护理项目', category: '权益核销', reason: '围绕客户已领取权益推动预约核销。', confidence: 78 }],
      browse_abandonment: [{ type: 'project', name: '浏览意向项目', category: '预约召回', reason: '根据客户近期浏览意图推动继续预约。', confidence: 80 }],
      project_cycle_due: [{ type: 'project', name: '具体项目周期复购', category: '服务周期', reason: '来自客户-项目维度的护理周期。', confidence: 88 }],
      homecare_bundle: [{ type: 'product', name: '居家护理搭配商品', category: '商品连带', reason: '来自项目 BOM/耗材关联。', confidence: 82 }],
      service_upgrade: [{ type: 'project', name: '高阶护理升级方案', category: '服务升级', reason: '高价值客户和周期窗口叠加。', confidence: 78 }],
      project_idle_capacity: [{ type: 'project', name: '低峰可约项目', category: '排期填充', reason: '未来 7 天存在可售产能。', confidence: 75 }],
      inventory_clearance: [{ type: 'project', name: '库存消化项目组合', category: '库存经营', reason: '项目承接有助于消化关联库存。', confidence: 72 }],
    };
    return map[type];
  }

  private strategyForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, string> = {
      care_cycle_due: '按护理周期提醒客户预约下一次服务，并搭配低门槛项目券。',
      card_expiring: '到期前提醒客户消耗剩余权益，到店后由顾问推荐续卡或升级。',
      dormant_winback: '对长期未到店客户做分层召回，先用顾问关怀再承接回归权益。',
      coupon_claimed_unused: '围绕客户已领取权益做核销提醒，减少重复发券和运营浪费。',
      browse_abandonment: '客户浏览项目或活动后及时提醒继续预约，必要时由顾问协助。',
      project_cycle_due: '按客户真实服务项目计算下一次护理窗口，优先生成自动规则和顾问跟进。',
      homecare_bundle: '把服务项目与居家护理商品连接起来，做服务后带货或顾问推荐。',
      service_upgrade: '对高价值且处于护理窗口的客户生成升级护理建议，由顾问确认后承接。',
      project_idle_capacity: '将高响应客户匹配未来低峰可售产能，优先创建预约引导任务。',
      inventory_clearance: '在库存可承接的前提下，用项目组合小范围消化库存压力。',
    };
    return map[type];
  }

  private triggerParamsForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, Record<string, any>> = {
      care_cycle_due: { daysAfterLastVisit: 28 },
      card_expiring: { daysBeforeExpiry: 30, remainingTimesGreaterThan: 0 },
      dormant_winback: { inactiveDays: 90 },
      coupon_claimed_unused: { hoursAfterClaim: 24, unusedOnly: true },
      browse_abandonment: { hoursAfterBrowse: 2, noBookingOnly: true },
      project_cycle_due: { remindDaysBefore: 3, useProjectCareCycle: true },
      homecare_bundle: { useProjectBom: true, inventoryAboveSafetyRequired: true },
      service_upgrade: { minLtvTier: '黄金', advisorReviewRequired: true },
      project_idle_capacity: { windowDays: 7, maxUtilizationRate: 0.6 },
      inventory_clearance: { inventoryReadyRequired: true, advisorReviewRequired: true },
    };
    return map[type];
  }

  private async resolvePredictionRun(storeId: number, predictionRunId?: number) {
    if (predictionRunId) {
      return this.prisma.predictionRun.findFirst({
        where: { id: Number(predictionRunId), storeId, status: 'completed' },
      });
    }
    return this.prisma.predictionRun.findFirst({
      where: { status: 'completed', storeId },
      orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
    });
  }

  private async loadPredictionSnapshots(customerIds: number[], runId: number | undefined, storeId: number) {
    if (runId) {
      return this.prisma.customerPredictionSnapshot.findMany({ where: { runId, storeId, customerId: { in: customerIds } } });
    }
    return this.prisma.customerPredictionSnapshot.findMany({
      where: { customerId: { in: customerIds }, storeId },
      orderBy: { createdAt: 'desc' },
    }).then((items) => {
      const latest = new Map<number, any>();
      for (const item of items as any[]) if (!latest.has(Number(item.customerId))) latest.set(Number(item.customerId), item);
      return [...latest.values()];
    });
  }

  private async loadBehaviorEvents(customerIds: number[], storeId: number) {
    const delegate = (this.prisma as any).customerBehaviorEvent;
    if (!delegate?.findMany) return [];
    return delegate.findMany({
      where: { customerId: { in: customerIds }, storeId },
      orderBy: { occurredAt: 'desc' },
      take: Math.max(100, customerIds.length * 10),
    });
  }

  private hasClaimedUnusedCoupon(behaviorEvents: any[], appEvents: any[]) {
    const events = [...behaviorEvents, ...appEvents];
    const latestUsedAt = this.latestEventTime(events, /coupon_used|promotion_used|核销|使用/);
    const latestClaimedAt = this.latestEventTime(events, /coupon_claimed|promotion_claimed|领券|领取/);
    return Boolean(latestClaimedAt && (!latestUsedAt || latestClaimedAt > latestUsedAt));
  }

  private hasBrowseAbandonment(behaviorEvents: any[], appEvents: any[]) {
    const events = [...behaviorEvents, ...appEvents];
    const latestBrowseAt = this.latestEventTime(events, /browse|view|project_view|activity_view|page_view|浏览|查看/);
    const latestBookingAt = this.latestEventTime(events, /booking|appointment|reservation|预约|order_paid|coupon_used/);
    if (!latestBrowseAt) return false;
    return !latestBookingAt || latestBrowseAt > latestBookingAt;
  }

  private latestEventTime(events: any[], pattern: RegExp) {
    const matched = events
      .filter((event) => pattern.test(String(event.eventType ?? '')))
      .map((event) => new Date(event.occurredAt ?? event.createdAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    return matched[0]?.getTime();
  }

  private calculateTouchFatigue(touches: any[]) {
    const recent = touches.filter((touch) => this.daysSince(touch.touchedAt) <= 30);
    if (!recent.length) return 0;
    const converted = recent.filter((touch) => touch.convertedAt || touch.status === 'converted').length;
    return Math.max(0, Math.min(1, Number(((recent.length - converted) / Math.max(recent.length, 1)).toFixed(2))));
  }

  private activeCards(customer: any) {
    return (customer.customerCards ?? []).filter((card: any) => card.status === 'active' && Number(card.remainingTimes ?? 0) > 0);
  }

  private buildAssetSummary(customer: any) {
    const activeCards = this.activeCards(customer);
    return {
      activeCardCount: activeCards.length,
      expiringCardCount: activeCards.filter((card: any) => this.daysUntil(card.expiryDate) <= 30).length,
      remainingTimes: activeCards.reduce((sum: number, card: any) => sum + Number(card.remainingTimes ?? 0), 0),
      nearestExpiryDate: activeCards[0]?.expiryDate ?? null,
    };
  }

  private buildServicePreference(customer: any) {
    const counts = new Map<string, number>();
    for (const record of customer.consumptionRecords ?? []) {
      const name = String(record.consumeContent ?? record.consumeType ?? '').split(',')[0]?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return {
      preferredProjects: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
      lastServiceAt: customer.consumptionRecords?.[0]?.consumeTime ?? customer.lastVisitDate ?? null,
    };
  }

  private serializeSnapshot(snapshot: any) {
    return {
      id: snapshot.id,
      storeId: snapshot.storeId,
      customerId: snapshot.customerId,
      predictionRunId: snapshot.predictionRunId,
      predictionSnapshotId: snapshot.predictionSnapshotId,
      lifecycleStage: snapshot.lifecycleStage,
      lifecycleStageLabel: STAGE_LABELS[snapshot.lifecycleStage as LifecycleStage] ?? snapshot.lifecycleStage,
      ltvTier: snapshot.ltvTier,
      churnRiskLevel: snapshot.churnRiskLevel,
      touchFatigueScore: Number(snapshot.touchFatigueScore ?? 0),
      assetSummary: snapshot.assetSummaryJson ?? {},
      servicePreference: snapshot.servicePreferenceJson ?? {},
      evidence: this.asStringArray(snapshot.evidenceJson),
      computedAt: snapshot.computedAt,
    };
  }

  private serializeOpportunity(item: any) {
    return {
      id: item.id,
      storeId: item.storeId,
      customerId: item.customerId,
      customer: item.customer,
      predictionRunId: item.predictionRunId,
      predictionSnapshotId: item.predictionSnapshotId,
      opportunityType: item.opportunityType,
      opportunityTypeLabel: OPPORTUNITY_LABELS[item.opportunityType as OpportunityType] ?? item.opportunityType,
      priority: item.priority,
      status: item.status,
      score: item.score,
      recommendedExecutionMode: item.recommendedExecutionMode,
      recommendedChannels: item.recommendedChannelsJson ?? [],
      recommendedOffer: item.recommendedOfferJson ?? null,
      recommendedItems: item.recommendedItemsJson ?? [],
      evidence: this.asStringArray(item.evidenceJson),
      fulfillment: item.fulfillmentChecks?.[0] ? this.serializeFulfillmentCheck(item.fulfillmentChecks[0]) : null,
      attributionEvents: (item.attributionEvents ?? []).map((event: any) => this.serializeAttributionEvent(event)),
      attributionEventCount: item.attributionEvents?.length ?? 0,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeServiceCycle(item: any) {
    return {
      id: item.id,
      storeId: item.storeId,
      customerId: item.customerId,
      customer: item.customer,
      projectId: item.projectId,
      project: item.project ? { id: item.project.id, name: item.project.name, careCycleWeeks: item.project.careCycleWeeks, duration: item.project.duration } : undefined,
      lastServiceAt: item.lastServiceAt,
      cycleDays: item.cycleDays,
      nextDueAt: item.nextDueAt,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      evidence: this.asStringArray(item.evidenceJson),
      updatedAt: item.updatedAt,
    };
  }

  private serializeFulfillmentCheck(item: any) {
    return {
      id: item.id,
      opportunityId: item.opportunityId,
      inventoryReady: Boolean(item.inventoryReady),
      capacityReady: Boolean(item.capacityReady),
      requiredProducts: item.requiredProductsJson ?? [],
      capacitySnapshot: item.capacitySnapshotJson ?? {},
      risks: this.asStringArray(item.riskJson),
      checkedAt: item.checkedAt,
    };
  }

  private serializeAttributionEvent(item: any) {
    return {
      id: item.id,
      storeId: item.storeId,
      customerId: item.customerId,
      opportunityId: item.opportunityId,
      recommendationKey: item.recommendationKey,
      eventType: item.eventType,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      touchId: item.touchId,
      orderId: item.orderId,
      reservationId: item.reservationId,
      stockMovementId: item.stockMovementId,
      eventValue: Number(item.eventValue ?? 0),
      evidence: this.asStringArray(item.evidenceJson),
      occurredAt: item.occurredAt,
    };
  }

  private async createQualitySnapshot(storeId: number) {
    const delegate = this.delegate('customerLifecycleQualitySnapshot');
    if (!delegate?.create) return null;
    const [customers, snapshots, opportunities, attributionEvents, checks] = await Promise.all([
      this.prisma.customer.count({ where: { storeId, deletedAt: null } }),
      (this.prisma as any).customerLifecycleSnapshot?.count?.({ where: { storeId } }) ?? Promise.resolve(0),
      (this.prisma as any).customerOpportunity?.count?.({ where: { storeId, status: 'open' } }) ?? Promise.resolve(0),
      this.delegate('lifecycleAttributionEvent')?.count?.({ where: { storeId } }) ?? Promise.resolve(0),
      this.delegate('customerOpportunityFulfillmentCheck')?.findMany?.({
        where: { opportunity: { storeId } },
        orderBy: { checkedAt: 'desc' },
        take: 500,
      }) ?? Promise.resolve([]),
    ]);
    const readyChecks = checks.filter((item: any) => item.inventoryReady && item.capacityReady).length;
    const fieldCoverageRate = customers ? snapshots / customers : 0;
    const ruleHitRate = snapshots ? opportunities / snapshots : 0;
    const attributionCompletenessRate = opportunities ? Math.min(1, attributionEvents / opportunities) : 0;
    const fulfillmentReadyRate = checks.length ? readyChecks / checks.length : 0;
    return delegate.create({
      data: {
        storeId,
        fieldCoverageRate,
        ruleHitRate,
        attributionCompletenessRate,
        fulfillmentReadyRate,
        metricsJson: {
          customers,
          snapshots,
          opportunities,
          attributionEvents,
          fulfillmentChecks: checks.length,
          readyChecks,
        },
      },
    });
  }

  private buildBusinessPlanActions(opportunities: any[]) {
    const grouped = new Map<string, any[]>();
    for (const item of opportunities ?? []) {
      const type = String(item.opportunityType ?? 'unknown');
      const mode = this.businessPlanActionMode(item.recommendedExecutionMode);
      const key = `${type}:${mode}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }

    return [...grouped.entries()].slice(0, 8).map(([key, items], index) => {
      const [type, mode] = key.split(':');
      const opportunityIds = this.uniqueNumbers(items.map((item: any) => Number(item.id)).filter(Boolean));
      const customerIds = this.uniqueNumbers(items.map((item: any) => Number(item.customerId)).filter(Boolean));
      const fulfillment = this.aggregateBusinessPlanFulfillment(items);
      return {
        id: `action-${index + 1}-${type}-${mode}`,
        actionType: mode,
        opportunityType: type,
        opportunityId: opportunityIds[0] ?? null,
        opportunityIds,
        customerId: customerIds[0] ?? null,
        customerIds,
        targetCustomerCount: customerIds.length,
        title: `${OPPORTUNITY_LABELS[type as OpportunityType] ?? type}承接`,
        approvalRequired: true,
        riskLevel: mode === 'terminal_follow_up_task' ? 'low' : 'medium',
        evidence: this.uniqueStrings(items.flatMap((item: any) => this.asStringArray(item.evidenceJson))).slice(0, 5),
        riskControls: fulfillment.riskControls,
        fulfillment,
      };
    });
  }

  private businessPlanActionMode(mode: any) {
    if (mode === 'activity') return 'activity_draft';
    if (mode === 'advisor_task') return 'terminal_follow_up_task';
    return 'automation_draft';
  }

  private aggregateBusinessPlanFulfillment(items: any[]) {
    const checks = items
      .map((item: any) => item.fulfillmentChecks?.[0])
      .filter(Boolean)
      .map((item: any) => this.serializeFulfillmentCheck(item));
    const inventoryReady = checks.length ? checks.every((check: any) => check.inventoryReady !== false) : true;
    const capacityReady = checks.length ? checks.every((check: any) => check.capacityReady !== false) : true;
    const riskControls = this.uniqueStrings([
      '审批后执行草稿',
      inventoryReady ? null : '库存不足或低于安全库存，不建议直接扩大营销曝光。',
      capacityReady ? null : '未来 7 天产能不足，建议先转顾问小范围邀约。',
      ...checks.flatMap((check: any) => this.asStringArray(check.risks)),
    ]).slice(0, 6);
    return {
      inventoryReady,
      capacityReady,
      checkedOpportunityCount: checks.length,
      totalOpportunityCount: items.length,
      latestChecks: checks.slice(0, 5),
      riskControls,
    };
  }

  private recommendedProjectIds(item: any, seed?: OpportunitySeed) {
    const values = [...(Array.isArray(item?.recommendedItemsJson) ? item.recommendedItemsJson : []), ...(seed?.items ?? [])];
    return this.uniqueNumbers(values.map((entry: any) => Number(entry?.projectId ?? entry?.itemId)).filter(Boolean));
  }

  private productHasExpiringStock(product: any) {
    return Boolean(product && Number(product.currentStock ?? 0) > Number(product.safetyStock ?? 0) * 1.5);
  }

  private lifecycleDelegatesReady() {
    return Boolean((this.prisma as any).customerLifecycleSnapshot?.upsert && (this.prisma as any).customerOpportunity?.upsert);
  }

  private delegate(name: string) {
    return (this.prisma as any)[name];
  }

  private emptyRebuildResult(reason: string) {
    return { rebuilt: false, reason, predictionRunId: null, snapshotCount: 0, opportunityCount: 0 };
  }

  private emptyPage(reason: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20)));
    return { items: [], data: [], total: 0, page, pageSize, reason };
  }

  private groupByCustomer(items: any[], key: string) {
    const grouped = new Map<number, any[]>();
    for (const item of items ?? []) {
      const id = Number(item[key]);
      if (!id) continue;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id)!.push(item);
    }
    return grouped;
  }

  private asStringArray(value: any) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : item?.detail ?? item?.label ?? JSON.stringify(item)).filter(Boolean);
    if (typeof value === 'string') return [value];
    return Object.values(value).map((item) => String(item)).filter(Boolean);
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
  }

  private uniqueNumbers(values: number[]) {
    return [...new Set(values.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0))];
  }

  private toBoolean(value: any) {
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
  }

  private formatDate(value?: Date | string | null) {
    if (!value) return '待计算';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '待计算';
    return date.toISOString().slice(0, 10);
  }

  private currentWeekKey() {
    const date = new Date();
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return `${monday.getFullYear()}-W${Math.ceil((((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)}`;
  }

  private daysUntil(value?: Date | string | null) {
    if (!value) return 9999;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 9999;
    return Math.ceil((date.getTime() - Date.now()) / 86400000);
  }

  private daysSince(value?: Date | string | null) {
    if (!value) return 9999;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 9999;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  }
}
