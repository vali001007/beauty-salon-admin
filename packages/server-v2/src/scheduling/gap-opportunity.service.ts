import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TerminalService } from '../terminal/terminal.service.js';

const ACTIVE_RESERVATION_STATUSES = ['pending', 'confirmed', 'arrived', 'checked_in', 'completed'];
const WORKING_SCHEDULE_STATUSES = ['available', 'normal'];
const DEFAULT_CANDIDATE_LIMIT = 3;
const TOUCH_COOLDOWN_DAYS = 7;
const PERIOD_LABELS: Record<string, string> = {
  morning: '上午',
  afternoon: '下午',
  evening: '晚上',
  other: '非高频时段',
};
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SKIN_PROJECT_MATCHERS = [
  { skin: ['干', '缺水', '脱皮'], project: ['补水', '保湿', '水光', '修护'], label: '缺水/干性护理诉求' },
  { skin: ['敏感', '泛红', '屏障', '刺痛'], project: ['舒缓', '修护', '屏障', '敏感'], label: '敏感修护诉求' },
  { skin: ['油', '痘', '闭口', '粉刺', '毛孔'], project: ['清洁', '控油', '祛痘', '净肤', '毛孔'], label: '清洁控油诉求' },
  { skin: ['暗沉', '色斑', '斑', '黄'], project: ['美白', '提亮', '淡斑', '焕肤'], label: '提亮淡斑诉求' },
  { skin: ['皱', '松弛', '衰', '抗老'], project: ['抗衰', '紧致', '提拉', '抗老'], label: '抗衰紧致诉求' },
];

type GapOpportunityOptions = {
  storeId?: number;
  weekStart?: string;
};

type CandidateOptions = {
  limit?: number;
  projectIds?: number[];
  channel?: string;
};

type FollowUpOptions = {
  candidateIds?: number[];
  assigneeRole?: 'manager' | 'consultant' | 'reception';
  assigneeUserId?: number;
  assigneeBeauticianId?: number;
  dueAt?: string;
  createdById?: number;
};

type ConfirmationDraftOptions = {
  candidateId?: number;
  channel?: string;
};

type BenefitDraftOptions = {
  candidateId?: number;
  channel?: string;
};

export type GapOpportunityPreviewOptions = {
  storeId?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  opportunityLimit?: number;
  candidateLimit?: number;
  channel?: string;
};

@Injectable()
export class GapOpportunityService {
  constructor(
    private prisma: PrismaService,
    private terminalService: TerminalService,
  ) {}

  async list(options: GapOpportunityOptions) {
    const storeId = this.requireStoreId(options.storeId);
    const weekStart = this.normalizeDate(options.weekStart);
    const weekEnd = this.addDays(weekStart, 7);
    try {
      await this.generateWeekOpportunities(storeId, weekStart, weekEnd);
      const opportunities: any[] = await this.loadWeekOpportunities(storeId, weekStart, weekEnd);

      for (const opportunity of opportunities) {
        if (!opportunity.candidates?.length) {
          await this.refreshCandidates(Number(opportunity.id), storeId, { limit: DEFAULT_CANDIDATE_LIMIT });
        }
      }

      const refreshed: any[] = await this.loadWeekOpportunities(storeId, weekStart, weekEnd);
      return {
        weekStart,
        generatedAt: new Date().toISOString(),
        opportunities: refreshed.map((item) => this.mapOpportunity(item)),
        summary: this.buildSummary(refreshed),
      };
    } catch (error) {
      if (this.isGapSchemaMissing(error)) {
        return this.emptyResult(weekStart);
      }
      throw error;
    }
  }

  async preview(options: GapOpportunityPreviewOptions) {
    const storeId = this.requireStoreId(options.storeId);
    const startDate = options.startDate ? this.formatDate(options.startDate) : this.addDays(this.formatDate(new Date()), 1);
    const inclusiveEndDate = options.endDate ? this.formatDate(options.endDate) : startDate;
    const endDateExclusive = this.addDays(inclusiveEndDate, 1);
    const opportunityLimit = Math.max(1, Math.min(5, Number(options.opportunityLimit ?? 3)));
    const candidateLimit = Math.max(1, Math.min(5, Number(options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT)));
    const opportunities = (await this.computeOpportunities(storeId, startDate, endDateExclusive))
      .sort((left, right) => right.score - left.score || left.date.getTime() - right.date.getTime() || left.startTime.localeCompare(right.startTime))
      .slice(0, opportunityLimit);
    const ranked = await Promise.all(
      opportunities.map((opportunity) => this.rankCandidates(opportunity, {
        limit: candidateLimit,
        channel: options.channel,
      })),
    );
    const customerIds = [...new Set(ranked.flat().map((item) => Number(item.customerId)).filter(Boolean))];
    const projectIds = [...new Set(ranked.flat().map((item) => Number(item.projectId)).filter(Boolean))];
    const [customers, projects] = await Promise.all([
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { storeId, id: { in: customerIds }, deletedAt: null },
            select: { id: true, name: true, phone: true },
          })
        : [],
      projectIds.length
        ? this.prisma.project.findMany({
            where: { storeId, id: { in: projectIds }, deletedAt: null },
            select: { id: true, name: true, price: true },
          })
        : [],
    ]);
    const customersById = new Map(customers.map((item) => [item.id, item]));
    const projectsById = new Map(projects.map((item) => [item.id, item]));
    const previews = opportunities.map((opportunity, opportunityIndex) => {
      const candidates = ranked[opportunityIndex]!.map((candidate, candidateIndex) => ({
        ...candidate,
        id: -(opportunityIndex * candidateLimit + candidateIndex + 1),
        customer: customersById.get(Number(candidate.customerId)),
        project: projectsById.get(Number(candidate.projectId)),
        status: 'preview',
      }));
      return this.mapOpportunity({
        ...opportunity,
        id: -(opportunityIndex + 1),
        source: 'brain_readonly_preview',
        gapType: 'available_capacity',
        status: 'preview',
        candidateCount: candidates.length,
        expectedFillRate: candidates[0]?.expectedFillRate ?? 0,
        candidates,
      });
    });
    return {
      startDate,
      endDate: inclusiveEndDate,
      generatedAt: new Date().toISOString(),
      persisted: false,
      opportunities: previews,
      summary: this.buildSummary(previews),
    };
  }

  async refreshCandidates(opportunityId: number, storeId: number | undefined, options: CandidateOptions = {}) {
    const opportunity = await this.requireOpportunity(opportunityId, storeId);
    const limit = Math.max(1, Math.min(20, Number(options.limit ?? DEFAULT_CANDIDATE_LIMIT)));
    const candidates = await this.rankCandidates(opportunity, { ...options, limit });
    const delegate = this.candidateDelegate();

    const saved: any[] = [];
    for (const candidate of candidates) {
      const savedCandidate = await delegate.upsert({
        where: { opportunityId_customerId: { opportunityId: opportunity.id, customerId: candidate.customerId } },
        create: candidate,
        update: {
          projectId: candidate.projectId,
          score: candidate.score,
          expectedFillRate: candidate.expectedFillRate,
          estimatedRevenue: candidate.estimatedRevenue,
          recommendedChannel: candidate.recommendedChannel,
          messageDraft: candidate.messageDraft,
          reasonJson: candidate.reasonJson,
          riskJson: candidate.riskJson,
          scoreBreakdown: candidate.scoreBreakdown,
        },
        include: this.candidateInclude(),
      });
      saved.push(savedCandidate);
    }

    await this.opportunityDelegate().update({
      where: { id: opportunity.id },
      data: {
        candidateCount: saved.length,
        expectedFillRate: saved[0]?.expectedFillRate ?? 0,
        estimatedRevenue: saved[0]?.estimatedRevenue ?? opportunity.estimatedRevenue,
      },
    });
    await this.recordEvent(opportunity.id, opportunity.storeId, 'candidates_refreshed', {
      candidateCount: saved.length,
      limit,
    });
    return saved.map((item) => this.mapCandidate(item));
  }

  async createFollowUpTasks(opportunityId: number, storeId: number | undefined, options: FollowUpOptions) {
    const opportunity = await this.requireOpportunity(opportunityId, storeId);
    const candidates = await this.resolveCandidates(opportunity, options.candidateIds);
    if (!candidates.length) throw new BadRequestException('请选择候补客户');

    const items = [];
    for (const candidate of candidates) {
      const task = await this.terminalService.createFollowUpTask(
        opportunity.storeId,
        undefined,
        {
          customerId: candidate.customerId,
          source: 'gap_fill',
          triggerType: 'appointment_gap',
          sourceRecommendationKey: `gap:${opportunity.id}:${candidate.customerId}`,
          title: `补位邀约：${this.formatDate(opportunity.date)} ${opportunity.startTime}-${opportunity.endTime}`,
          priority: candidate.score >= 80 ? 'urgent' : 'opportunity',
          assigneeRole: options.assigneeBeauticianId ? 'consultant' : options.assigneeRole ?? 'manager',
          assigneeUserId: options.assigneeUserId,
          assigneeBeauticianId: options.assigneeBeauticianId,
          channel: candidate.recommendedChannel ?? 'phone',
          script: candidate.messageDraft ?? this.buildMessageDraft(opportunity, candidate.customer),
          note: `来自需求热力图空档机会 #${opportunity.id}`,
          dueAt: options.dueAt ?? this.addHours(new Date(), 4).toISOString(),
        } as any,
        options.createdById,
      );
      const updated = await this.candidateDelegate().update({
        where: { id: candidate.id },
        data: { followUpTaskId: Number(task.id), status: 'task_created' },
        include: this.candidateInclude(),
      });
      await this.recordEvent(opportunity.id, opportunity.storeId, 'follow_up_task_created', {
        candidateId: candidate.id,
        customerId: candidate.customerId,
        followUpTaskId: task.id,
      }, candidate.id, candidate.customerId);
      items.push({ candidate: this.mapCandidate(updated), task });
    }

    await this.opportunityDelegate().update({ where: { id: opportunity.id }, data: { status: 'matching' } });
    return { items };
  }

  async createConfirmationDraft(opportunityId: number, storeId: number | undefined, options: ConfirmationDraftOptions) {
    const opportunity = await this.requireOpportunity(opportunityId, storeId);
    const candidate = (await this.resolveCandidates(opportunity, options.candidateId ? [options.candidateId] : undefined))[0];
    if (!candidate) throw new BadRequestException('请选择候补客户');
    const channel = options.channel ?? candidate.recommendedChannel ?? 'sms';
    const message = this.buildMessageDraft(opportunity, candidate.customer);
    const draft = {
      opportunityId: opportunity.id,
      candidateId: candidate.id,
      customerId: candidate.customerId,
      channel,
      message,
      status: 'draft',
      sent: false,
      generatedAt: new Date().toISOString(),
    };
    await this.opportunityDelegate().update({
      where: { id: opportunity.id },
      data: { confirmationDraftJson: draft },
    });
    await this.candidateDelegate().update({
      where: { id: candidate.id },
      data: { messageDraft: message, status: candidate.status === 'task_created' ? candidate.status : 'draft_created' },
    });
    await this.recordEvent(opportunity.id, opportunity.storeId, 'confirmation_draft_created', draft, candidate.id, candidate.customerId);
    return draft;
  }

  async createBenefitDraft(opportunityId: number, storeId: number | undefined, options: BenefitDraftOptions) {
    const opportunity = await this.requireOpportunity(opportunityId, storeId);
    const candidate = (await this.resolveCandidates(opportunity, options.candidateId ? [options.candidateId] : undefined))[0];
    if (!candidate) throw new BadRequestException('请选择候补客户');
    const channel = options.channel ?? candidate.recommendedChannel ?? 'sms';
    const projectName = candidate.project?.name ?? '护理项目';
    const customerName = candidate.customer?.name ?? '您好';
    const fillRate = Math.round(this.toNumber(candidate.expectedFillRate) * 100);
    const benefitTitle = `${projectName}空档补位专属权益`;
    const benefitText = fillRate >= 75 ? '到店确认后赠送一次皮肤检测或同项目护理加赠体验' : '到店确认后享受空档补位专属护理权益';
    const link = `/marketing/gap-benefit?opportunityId=${opportunity.id}&candidateId=${candidate.id}&customerId=${candidate.customerId}`;
    const message = `${customerName}，${this.formatDate(opportunity.date)} ${opportunity.startTime}-${opportunity.endTime} 门店有${projectName}空档，已为您生成「${benefitTitle}」：${benefitText}。详情链接：${link}。本内容为权益草稿，当前不会自动发送。`;
    const draft = {
      opportunityId: opportunity.id,
      candidateId: candidate.id,
      customerId: candidate.customerId,
      channel,
      benefitTitle,
      benefitText,
      projectName,
      appointmentTime: `${this.formatDate(opportunity.date)} ${opportunity.startTime}-${opportunity.endTime}`,
      copy: message,
      link,
      status: 'draft',
      sent: false,
      generatedAt: new Date().toISOString(),
    };

    await this.recordEvent(opportunity.id, opportunity.storeId, 'benefit_draft_created', draft, candidate.id, candidate.customerId);
    return draft;
  }

  private async generateWeekOpportunities(storeId: number, weekStart: string, weekEnd: string) {
    const opportunities = await this.computeOpportunities(storeId, weekStart, weekEnd);
    for (const opportunity of opportunities) {
      const { payload, ...data } = opportunity;
      const saved = await this.opportunityDelegate().upsert({
        where: {
          storeId_date_startTime_endTime: {
            storeId,
            date: opportunity.date,
            startTime: opportunity.startTime,
            endTime: opportunity.endTime,
          },
        },
        create: { ...data, payload, lastGeneratedAt: new Date() },
        update: {
          beauticianIds: opportunity.beauticianIds,
          projectIds: opportunity.projectIds,
          durationMinutes: opportunity.durationMinutes,
          capacity: opportunity.capacity,
          bookedCount: opportunity.bookedCount,
          availableCapacity: opportunity.availableCapacity,
          score: opportunity.score,
          estimatedRevenue: opportunity.estimatedRevenue,
          status: 'open',
          expiresAt: opportunity.expiresAt,
          payload,
          lastGeneratedAt: new Date(),
        },
      });
      await this.recordEvent(saved.id, storeId, 'opportunity_generated', {
        capacity: opportunity.capacity,
        bookedCount: opportunity.bookedCount,
        availableCapacity: opportunity.availableCapacity,
      });
    }
  }

  private async computeOpportunities(storeId: number, rangeStart: string, rangeEndExclusive: string) {
    const [schedules, reservations, timeOffs, projects]: any[] = await Promise.all([
      this.prisma.schedule.findMany({
        where: {
          storeId,
          date: { gte: new Date(rangeStart), lt: new Date(rangeEndExclusive) },
          status: { in: WORKING_SCHEDULE_STATUSES },
        },
        select: { beauticianId: true, date: true, startTime: true, endTime: true, status: true },
      }),
      this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: new Date(rangeStart), lt: new Date(rangeEndExclusive) },
          status: { in: ACTIVE_RESERVATION_STATUSES },
        },
        select: { id: true, beauticianId: true, date: true, startTime: true, endTime: true, projectId: true },
      }),
      (this.prisma as any).beauticianTimeOff?.findMany?.({
        where: { storeId, date: { gte: new Date(rangeStart), lt: new Date(rangeEndExclusive) }, status: 'approved' },
        select: { beauticianId: true, date: true, startTime: true, endTime: true },
      }) ?? Promise.resolve([]),
      this.prisma.project.findMany({
        where: { storeId, status: 'active', deletedAt: null },
        select: { id: true, price: true, duration: true, careCycleWeeks: true, treatmentCourseTimes: true },
      }),
    ]);
    const now = new Date();
    const projectIds = projects.map((item: any) => item.id);
    const averageRevenue = this.average(projects.map((item: any) => this.toNumber(item.price)));
    const bySlot = new Map<string, any[]>();
    const opportunities: any[] = [];

    for (const schedule of schedules) {
      const date = this.formatDate(schedule.date);
      const startsAt = this.combineDateTime(date, schedule.startTime);
      if (startsAt <= now) continue;
      if (this.hasTimeOff(schedule, timeOffs)) continue;
      const key = this.slotKey(date, schedule.startTime, schedule.endTime);
      bySlot.set(key, [...(bySlot.get(key) ?? []), schedule]);
    }

    for (const [key, slotSchedules] of bySlot.entries()) {
      const [date, startTime, endTime] = key.split('|');
      const overlappingReservations = reservations.filter((reservation: any) => {
        const reservationDate = this.formatDate(reservation.date);
        const reservationEnd = reservation.endTime ?? this.addMinutes(reservation.startTime, 60);
        return reservationDate === date && this.overlaps(reservation.startTime, reservationEnd, startTime, endTime);
      });
      const capacity = slotSchedules.length;
      const bookedCount = overlappingReservations.length;
      const availableCapacity = Math.max(0, capacity - bookedCount);
      if (availableCapacity <= 0) continue;

      const durationMinutes = this.minutesBetween(startTime, endTime);
      const score = Math.min(100, availableCapacity * 30 + Math.max(0, 48 - this.hoursUntil(this.combineDateTime(date, startTime))));
      opportunities.push({
        storeId,
        date: new Date(date),
        startTime,
        endTime,
        beauticianIds: slotSchedules.map((item) => item.beauticianId),
        projectIds,
        durationMinutes,
        capacity,
        bookedCount,
        availableCapacity,
        score,
        estimatedRevenue: averageRevenue * availableCapacity,
        expectedFillRate: 0,
        status: 'open',
        expiresAt: this.combineDateTime(date, startTime),
        payload: {
          generatedFrom: 'Schedule+Reservation',
          reservationIds: overlappingReservations.map((item: any) => item.id),
        },
      });
    }
    return opportunities;
  }

  private async rankCandidates(opportunity: any, options: CandidateOptions & { limit: number }) {
    const date = this.formatDate(opportunity.date);
    const weekEnd = this.addDays(date, 30);
    const touchSince = this.addDays(this.formatDate(new Date()), -TOUCH_COOLDOWN_DAYS);
    const [customers, identities, snapshots, futureReservations, recentTouches, pendingTasks, cards, history, projects, beauticians]: any[] = await Promise.all([
      this.prisma.customer.findMany({
        where: { storeId: opportunity.storeId, deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          wechat: true,
          memberLevel: true,
          totalSpent: true,
          visitCount: true,
          lastVisitDate: true,
          skinType: true,
          skinCondition: true,
          healthProfile: { select: { skinType: true, skinStatus: true, mainProblems: true, goals: true, recommendedCare: true } },
        },
        take: 500,
      }),
      (this.prisma as any).customerAppIdentity?.findMany?.({
        where: { storeId: opportunity.storeId },
        select: { customerId: true },
      }) ?? Promise.resolve([]),
      (this.prisma as any).customerPredictionSnapshot?.findMany?.({
        where: { storeId: opportunity.storeId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }) ?? Promise.resolve([]),
      this.prisma.reservation.findMany({
        where: { storeId: opportunity.storeId, date: { gte: new Date(), lt: new Date(weekEnd) }, status: { in: ACTIVE_RESERVATION_STATUSES } },
        select: { customerId: true },
      }),
      (this.prisma as any).marketingAutomationTouch?.findMany?.({
        where: { customer: { storeId: opportunity.storeId }, touchedAt: { gte: new Date(touchSince) } },
        select: { customerId: true },
      }) ?? Promise.resolve([]),
      (this.prisma as any).terminalFollowUpTask?.findMany?.({
        where: { storeId: opportunity.storeId, status: { in: ['pending', 'in_progress'] }, deletedAt: null },
        select: { customerId: true, source: true },
      }) ?? Promise.resolve([]),
      (this.prisma as any).customerCard?.findMany?.({
        where: { customer: { storeId: opportunity.storeId }, status: 'active', remainingTimes: { gt: 0 } },
        select: { customerId: true, cardName: true, totalTimes: true, remainingTimes: true, expiryDate: true, recognizedUnitValue: true },
        orderBy: { expiryDate: 'asc' },
      }) ?? Promise.resolve([]),
      this.prisma.reservation.findMany({
        where: { storeId: opportunity.storeId, date: { lt: new Date(date) }, status: { in: ACTIVE_RESERVATION_STATUSES } },
        select: { customerId: true, projectId: true, beauticianId: true, date: true, startTime: true },
        orderBy: { date: 'desc' },
        take: 1000,
      }),
      this.prisma.project.findMany({
        where: { storeId: opportunity.storeId, status: 'active', deletedAt: null, ...(options.projectIds?.length ? { id: { in: options.projectIds } } : {}) },
        select: { id: true, name: true, description: true, price: true, careCycleWeeks: true, treatmentCourseTimes: true },
      }),
      this.prisma.beautician.findMany({
        where: { storeId: opportunity.storeId, status: 'active' },
        select: { id: true, name: true, userId: true },
      }),
    ]);
    const identityCustomers = new Set(identities.map((item: any) => Number(item.customerId)).filter(Boolean));
    const snapshotByCustomer = new Map<number, any>();
    for (const snapshot of snapshots) if (!snapshotByCustomer.has(Number(snapshot.customerId))) snapshotByCustomer.set(Number(snapshot.customerId), snapshot);
    const futureReservationCustomers = new Set(futureReservations.map((item: any) => Number(item.customerId)));
    const recentTouchCounts = this.countByCustomer(recentTouches);
    const pendingTaskCounts = this.countByCustomer(pendingTasks);
    const cardsByCustomer = this.groupByCustomer(cards);
    const historyByCustomer = this.groupByCustomer(history);
    const defaultProject = projects[0] ?? null;
    const candidates: any[] = [];

    for (const customer of customers) {
      if (futureReservationCustomers.has(customer.id)) continue;
      if (!customer.phone && !customer.email && !customer.wechat && !identityCustomers.has(customer.id)) continue;
      if ((recentTouchCounts.get(customer.id) ?? 0) >= 2) continue;
      if ((pendingTaskCounts.get(customer.id) ?? 0) >= 2) continue;

      const snapshot = snapshotByCustomer.get(customer.id);
      const customerCards = cardsByCustomer.get(customer.id) ?? [];
      const customerHistory = historyByCustomer.get(customer.id) ?? [];
      const projectSignal = this.pickRecommendedProject(customer, snapshot, customerCards, customerHistory, projects, opportunity);
      const project = projectSignal.project ?? defaultProject;
      const projectId = project?.id ?? null;
      const scoreData = this.scoreCandidate(opportunity, customer, snapshot, customerCards, customerHistory, project, projectSignal);
      if (scoreData.score <= 0) continue;
      const channel = options.channel ?? this.pickChannel(customer, identityCustomers.has(customer.id));
      const preferredBeautician = this.pickPreferredBeautician(customerHistory, beauticians, opportunity);
      candidates.push({
        opportunityId: opportunity.id,
        storeId: opportunity.storeId,
        customerId: customer.id,
        projectId,
        score: scoreData.score,
        expectedFillRate: Number((scoreData.score / 100).toFixed(2)),
        estimatedRevenue: this.toNumber(project?.price) || scoreData.cardValue || this.toNumber(opportunity.estimatedRevenue),
        recommendedChannel: channel,
        messageDraft: this.buildMessageDraft(opportunity, customer, project),
        reasonJson: scoreData.reasons,
        riskJson: scoreData.risks,
        scoreBreakdown: {
          ...scoreData.breakdown,
          preferredBeauticianId: preferredBeautician?.id,
          preferredBeauticianUserId: preferredBeautician?.userId,
          preferredBeauticianName: preferredBeautician?.name,
        },
      });
    }

    return candidates.sort((a, b) => b.score - a.score || b.estimatedRevenue - a.estimatedRevenue).slice(0, options.limit);
  }

  private scoreCandidate(opportunity: any, customer: any, snapshot: any, cards: any[], history: any[], project: any, projectSignal: any) {
    const timeSignal = this.buildTimePreferenceSignal(opportunity, history);
    const timeFitScore = timeSignal.score;
    const projectFitScore = projectSignal.projectFitScore ?? (project ? 55 : 20);
    const careCycleDueScore = projectSignal.careCycleDueScore ?? 20;
    const treatmentProgressScore = projectSignal.treatmentProgressScore ?? 20;
    const skinFitScore = projectSignal.skinFitScore ?? 30;
    const repurchaseScore = this.toNumber(snapshot?.repurchase30dScore) || Math.min(80, Number(customer.visitCount ?? 0) * 10);
    const marketingResponseScore = this.toNumber(snapshot?.marketingResponseScore) || 40;
    const urgentCard = projectSignal.matchingCard ?? cards[0];
    const daysToExpire = urgentCard?.expiryDate ? Math.ceil((new Date(urgentCard.expiryDate).getTime() - Date.now()) / 86_400_000) : null;
    const cardUrgencyScore = urgentCard ? Math.max(20, Math.min(100, 100 - Math.max(0, Number(daysToExpire ?? 90)))) : 10;
    const beauticianPreferenceScore = history.some((item) => (opportunity.beauticianIds ?? []).includes(Number(item.beauticianId))) ? 100 : 30;
    const ltvScore = String(snapshot?.ltvTier ?? '').includes('高') || this.toNumber(customer.totalSpent) > 3000 ? 80 : 35;
    const score = Math.max(0, Math.round(
      0.2 * timeFitScore +
      0.16 * projectFitScore +
      0.14 * careCycleDueScore +
      0.12 * treatmentProgressScore +
      0.1 * skinFitScore +
      0.12 * repurchaseScore +
      0.06 * marketingResponseScore +
      0.05 * cardUrgencyScore +
      0.03 * beauticianPreferenceScore +
      0.02 * ltvScore,
    ));
    return {
      score,
      cardValue: this.toNumber(urgentCard?.recognizedUnitValue),
      breakdown: {
        timeFitScore,
        projectFitScore,
        careCycleDueScore,
        treatmentProgressScore,
        skinFitScore,
        repurchaseScore,
        marketingResponseScore,
        cardUrgencyScore,
        beauticianPreferenceScore,
        ltvScore,
      },
      reasons: [
        ...projectSignal.reasons,
        ...timeSignal.reasons,
        snapshot ? `复购分 ${repurchaseScore}，响应分 ${marketingResponseScore}` : '暂无预测快照，使用历史消费和卡项降级评分',
        urgentCard ? `${urgentCard.cardName} 剩余 ${urgentCard.remainingTimes} 次` : '无可用卡项信号',
      ],
      risks: [
        !customer.phone ? '手机号缺失，短信不可用' : null,
        daysToExpire !== null && daysToExpire < 0 ? '卡项已过期，需人工确认' : null,
        ...projectSignal.risks,
      ].filter(Boolean),
    };
  }

  private async loadWeekOpportunities(storeId: number, weekStart: string, weekEnd: string) {
    return this.opportunityDelegate().findMany({
      where: { storeId, date: { gte: new Date(weekStart), lt: new Date(weekEnd) }, status: { notIn: ['ignored'] } },
      include: this.opportunityInclude(),
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  private async requireOpportunity(id: number, storeId?: number) {
    const opportunity = await this.opportunityDelegate().findFirst({
      where: { id: Number(id), ...(storeId ? { storeId } : {}) },
      include: this.opportunityInclude(),
    });
    if (!opportunity) throw new NotFoundException('空档机会不存在');
    return opportunity;
  }

  private async resolveCandidates(opportunity: any, candidateIds?: number[]) {
    const ids = (candidateIds ?? []).map(Number).filter(Boolean);
    let candidates = await this.candidateDelegate().findMany({
      where: { opportunityId: opportunity.id, ...(ids.length ? { id: { in: ids } } : {}) },
      include: this.candidateInclude(),
      orderBy: [{ score: 'desc' }],
      take: ids.length ? undefined : DEFAULT_CANDIDATE_LIMIT,
    });
    if (!candidates.length && !ids.length) {
      await this.refreshCandidates(opportunity.id, opportunity.storeId, { limit: DEFAULT_CANDIDATE_LIMIT });
      candidates = await this.candidateDelegate().findMany({
        where: { opportunityId: opportunity.id },
        include: this.candidateInclude(),
        orderBy: [{ score: 'desc' }],
        take: DEFAULT_CANDIDATE_LIMIT,
      });
    }
    return candidates;
  }

  private mapOpportunity(item: any) {
    return {
      id: item.id,
      storeId: item.storeId,
      date: this.formatDate(item.date),
      startTime: item.startTime,
      endTime: item.endTime,
      beauticianIds: item.beauticianIds ?? [],
      projectIds: item.projectIds ?? [],
      durationMinutes: item.durationMinutes,
      capacity: item.capacity,
      bookedCount: item.bookedCount,
      availableCapacity: item.availableCapacity,
      source: item.source,
      gapType: item.gapType,
      score: item.score,
      estimatedRevenue: this.toNumber(item.estimatedRevenue),
      expectedFillRate: this.toNumber(item.expectedFillRate),
      candidateCount: item.candidateCount ?? item.candidates?.length ?? 0,
      status: item.status,
      confirmationDraft: item.confirmationDraftJson ?? null,
      expiresAt: item.expiresAt?.toISOString?.() ?? item.expiresAt,
      candidates: (item.candidates ?? []).map((candidate: any) => this.mapCandidate(candidate)),
    };
  }

  private mapCandidate(item: any) {
    return {
      id: item.id,
      opportunityId: item.opportunityId,
      customerId: item.customerId,
      customerName: item.customer?.name,
      customerPhone: this.maskPhone(item.customer?.phone),
      projectId: item.projectId,
      projectName: item.project?.name,
      followUpTaskId: item.followUpTaskId,
      score: item.score,
      expectedFillRate: this.toNumber(item.expectedFillRate),
      estimatedRevenue: this.toNumber(item.estimatedRevenue),
      recommendedChannel: item.recommendedChannel,
      messageDraft: item.messageDraft,
      reasons: item.reasonJson ?? [],
      risks: item.riskJson ?? [],
      scoreBreakdown: item.scoreBreakdown ?? {},
      preferredBeauticianId: item.scoreBreakdown?.preferredBeauticianId ?? null,
      preferredBeauticianUserId: item.scoreBreakdown?.preferredBeauticianUserId ?? null,
      preferredBeauticianName: item.scoreBreakdown?.preferredBeauticianName ?? null,
      status: item.status,
    };
  }

  private buildSummary(opportunities: any[]) {
    const candidateCount = opportunities.reduce((sum, item) => sum + (item.candidateCount ?? item.candidates?.length ?? 0), 0);
    return {
      opportunityCount: opportunities.length,
      openOpportunityCount: opportunities.filter((item) => item.status === 'open').length,
      availableCapacity: opportunities.reduce((sum, item) => sum + Number(item.availableCapacity ?? 0), 0),
      candidateCount,
      expectedRevenue: Number(opportunities.reduce((sum, item) => sum + this.toNumber(item.estimatedRevenue), 0).toFixed(2)),
      averageFillRate: opportunities.length ? Number((opportunities.reduce((sum, item) => sum + this.toNumber(item.expectedFillRate), 0) / opportunities.length).toFixed(2)) : 0,
    };
  }

  private emptyResult(weekStart: string) {
    return {
      weekStart,
      generatedAt: new Date().toISOString(),
      opportunities: [],
      summary: this.buildSummary([]),
    };
  }

  private isGapSchemaMissing(error: unknown) {
    const text = `${(error as any)?.code ?? ''} ${(error as any)?.message ?? ''} ${(error as any)?.meta?.cause ?? ''}`;
    return (
      text.includes('P2021') ||
      text.includes('P2022') ||
      text.includes('42P01') ||
      text.includes('42703') ||
      text.includes('AppointmentGapOpportunity') ||
      text.includes('AppointmentGapCandidate') ||
      text.includes('AppointmentGapOpportunityEvent')
    );
  }

  private buildMessageDraft(opportunity: any, customer: any, project?: any) {
    const customerName = customer?.name ?? '您好';
    const projectText = project?.name ? `做${project.name}` : '安排护理';
    return `${customerName}，${this.formatDate(opportunity.date)} ${opportunity.startTime}-${opportunity.endTime} 门店刚好有一个${projectText}空档，是否帮您预留？本消息仅为确认草稿，当前不会自动发送。`;
  }

  private maskPhone(value: unknown) {
    const phone = String(value ?? '').replace(/\D/g, '');
    return phone.length >= 4 ? `***${phone.slice(-4)}` : undefined;
  }

  private opportunityDelegate() {
    return (this.prisma as any).appointmentGapOpportunity;
  }

  private candidateDelegate() {
    return (this.prisma as any).appointmentGapCandidate;
  }

  private eventDelegate() {
    return (this.prisma as any).appointmentGapOpportunityEvent;
  }

  private opportunityInclude() {
    return { candidates: { include: this.candidateInclude(), orderBy: { score: 'desc' }, take: DEFAULT_CANDIDATE_LIMIT } };
  }

  private candidateInclude() {
    return { customer: true, project: true, followUpTask: true };
  }

  private async recordEvent(opportunityId: number, storeId: number, eventType: string, payload: unknown, candidateId?: number, customerId?: number) {
    const delegate = this.eventDelegate();
    if (!delegate?.create) return null;
    return delegate.create({ data: { opportunityId, storeId, eventType, candidateId, customerId, payload } });
  }

  private requireStoreId(storeId: number | undefined) {
    const value = Number(storeId);
    if (!value) throw new BadRequestException('缺少门店信息');
    return value;
  }

  private normalizeDate(value?: string) {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const now = new Date();
    const day = now.getDay() || 7;
    return this.addDays(this.formatDate(now), -(day - 1));
  }

  private formatDate(value: Date | string) {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private addHours(date: Date, hours: number) {
    return new Date(date.getTime() + hours * 3_600_000);
  }

  private combineDateTime(date: string, time: string) {
    return new Date(`${date}T${time}:00.000`);
  }

  private addMinutes(time: string, minutes: number) {
    const [hour, minute] = time.split(':').map(Number);
    const value = hour * 60 + minute + minutes;
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  private minutesBetween(startTime: string, endTime: string) {
    return this.toMinutes(endTime) - this.toMinutes(startTime);
  }

  private hoursUntil(date: Date) {
    return Math.max(0, Math.round((date.getTime() - Date.now()) / 3_600_000));
  }

  private toMinutes(time: string) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  }

  private overlaps(startA: string, endA: string, startB: string, endB: string) {
    return this.toMinutes(startA) < this.toMinutes(endB) && this.toMinutes(startB) < this.toMinutes(endA);
  }

  private slotKey(date: string, startTime: string, endTime: string) {
    return `${date}|${startTime}|${endTime}`;
  }

  private hasTimeOff(schedule: any, timeOffs: any[]) {
    return timeOffs.some((item) => Number(item.beauticianId) === Number(schedule.beauticianId) && this.formatDate(item.date) === this.formatDate(schedule.date) && this.overlaps(schedule.startTime, schedule.endTime, item.startTime, item.endTime));
  }

  private toNumber(value: unknown) {
    if (value == null) return 0;
    return Number(value) || 0;
  }

  private average(values: number[]) {
    const valid = values.filter((item) => Number.isFinite(item) && item > 0);
    return valid.length ? Number((valid.reduce((sum, item) => sum + item, 0) / valid.length).toFixed(2)) : 0;
  }

  private countByCustomer(items: any[]) {
    const map = new Map<number, number>();
    for (const item of items) {
      const customerId = Number(item.customerId);
      if (customerId) map.set(customerId, (map.get(customerId) ?? 0) + 1);
    }
    return map;
  }

  private groupByCustomer(items: any[]) {
    const map = new Map<number, any[]>();
    for (const item of items) {
      const customerId = Number(item.customerId);
      if (customerId) map.set(customerId, [...(map.get(customerId) ?? []), item]);
    }
    return map;
  }

  private pickRecommendedProject(customer: any, snapshot: any, cards: any[], history: any[], projects: any[], opportunity: any) {
    if (!projects.length) {
      return {
        project: null,
        matchingCard: null,
        projectFitScore: 20,
        careCycleDueScore: 20,
        treatmentProgressScore: 20,
        skinFitScore: 30,
        reasons: ['暂无可推荐项目，使用空档机会降级推荐'],
        risks: ['缺少可售项目，需人工确认推荐内容'],
      };
    }

    return projects
      .map((project) => this.evaluateProjectSignal(customer, snapshot, cards, history, project, opportunity))
      .sort((a, b) => b.totalScore - a.totalScore || this.toNumber(b.project?.price) - this.toNumber(a.project?.price))[0];
  }

  private evaluateProjectSignal(customer: any, snapshot: any, cards: any[], history: any[], project: any, opportunity: any) {
    const projectHistory = history
      .filter((item) => Number(item.projectId) === Number(project.id))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const matchingCard = cards.find((card) => this.isProjectCardMatch(card, project)) ?? null;
    const lastProjectHistory = projectHistory[0] ?? null;
    const projectFitScore = projectHistory.length ? 90 : matchingCard ? 75 : 45;
    const cycle = this.evaluateCareCycle(project, lastProjectHistory, opportunity);
    const treatment = this.evaluateTreatmentProgress(project, matchingCard);
    const skin = this.evaluateSkinFit(customer, snapshot, project);
    const reasons = [
      projectHistory.length ? `历史做过${project.name}，项目偏好匹配` : matchingCard ? `${matchingCard.cardName} 可承接 ${project.name}` : `推荐项目：${project.name}`,
      ...cycle.reasons,
      ...treatment.reasons,
      ...skin.reasons,
    ];
    const totalScore = Math.round(
      0.3 * projectFitScore +
      0.3 * cycle.score +
      0.2 * treatment.score +
      0.2 * skin.score,
    );

    return {
      project,
      matchingCard,
      totalScore,
      projectFitScore,
      careCycleDueScore: cycle.score,
      treatmentProgressScore: treatment.score,
      skinFitScore: skin.score,
      reasons,
      risks: [...cycle.risks, ...treatment.risks, ...skin.risks],
    };
  }

  private evaluateCareCycle(project: any, lastHistory: any, opportunity: any) {
    const careCycleWeeks = Number(project?.careCycleWeeks ?? 0);
    if (!careCycleWeeks) return { score: lastHistory ? 45 : 25, reasons: [] as string[], risks: [] as string[] };
    if (!lastHistory?.date) {
      return {
        score: 35,
        reasons: [`${project.name}设置了${careCycleWeeks}周护理周期，但客户暂无该项目历史记录`],
        risks: [] as string[],
      };
    }

    const daysSinceLast = this.daysBetween(this.formatDate(lastHistory.date), this.formatDate(opportunity.date));
    const cycleDays = careCycleWeeks * 7;
    if (daysSinceLast >= cycleDays) {
      return {
        score: 100,
        reasons: [`距上次${project.name}已${daysSinceLast}天，已达到${careCycleWeeks}周护理周期`],
        risks: daysSinceLast > cycleDays * 2 ? [`${project.name}护理周期已超出较久，建议先确认客户状态`] : [],
      };
    }
    if (daysSinceLast >= Math.round(cycleDays * 0.75)) {
      return {
        score: 75,
        reasons: [`距上次${project.name}已${daysSinceLast}天，接近${careCycleWeeks}周护理周期`],
        risks: [] as string[],
      };
    }
    return {
      score: 30,
      reasons: [`距上次${project.name}仅${daysSinceLast}天，尚未达到${careCycleWeeks}周护理周期`],
      risks: [] as string[],
    };
  }

  private evaluateTreatmentProgress(project: any, matchingCard: any) {
    const courseTimes = Number(project?.treatmentCourseTimes ?? 0);
    if (!courseTimes) return { score: matchingCard ? 55 : 25, reasons: [] as string[], risks: [] as string[] };
    if (!matchingCard) {
      return {
        score: 30,
        reasons: [`${project.name}建议疗程${courseTimes}次，暂未匹配到对应卡项`],
        risks: [] as string[],
      };
    }

    const totalTimes = Number(matchingCard.totalTimes ?? 0);
    const remainingTimes = Number(matchingCard.remainingTimes ?? 0);
    const completedTimes = Math.max(0, totalTimes - remainingTimes);
    if (remainingTimes <= 0) {
      return {
        score: 15,
        reasons: [`${matchingCard.cardName}暂无剩余次数`],
        risks: [`${matchingCard.cardName}剩余次数不足，需人工确认`],
      };
    }
    if (!totalTimes) {
      return {
        score: 65,
        reasons: [`${matchingCard.cardName}剩余${remainingTimes}次，可承接${project.name}`],
        risks: [] as string[],
      };
    }

    const inCourse = completedTimes < courseTimes;
    return {
      score: inCourse ? 90 : 70,
      reasons: [`${project.name}疗程建议${courseTimes}次，当前${matchingCard.cardName}已做${completedTimes}次、剩余${remainingTimes}次`],
      risks: remainingTimes <= 1 ? [`${matchingCard.cardName}仅剩${remainingTimes}次，需提示续卡或复购`] : [],
    };
  }

  private evaluateSkinFit(customer: any, snapshot: any, project: any) {
    const skinText = this.normalizeText([
      customer?.skinType,
      customer?.skinCondition,
      customer?.healthProfile?.skinType,
      customer?.healthProfile?.skinStatus,
      customer?.healthProfile?.mainProblems,
      customer?.healthProfile?.goals,
      customer?.healthProfile?.recommendedCare,
      this.stringifyJson(snapshot?.featureJson),
      this.stringifyJson(snapshot?.reasonJson),
    ].filter(Boolean).join(' '));
    if (!skinText) return { score: 30, reasons: [] as string[], risks: [] as string[] };
    const projectText = this.normalizeText(`${project?.name ?? ''} ${project?.description ?? ''}`);
    const matched = SKIN_PROJECT_MATCHERS.find((item) => (
      item.skin.some((keyword) => skinText.includes(keyword)) &&
      item.project.some((keyword) => projectText.includes(keyword))
    ));
    if (matched) {
      return {
        score: 92,
        reasons: [`客户${matched.label}与${project.name}适配`],
        risks: [] as string[],
      };
    }
    return {
      score: 45,
      reasons: ['客户有皮肤/画像记录，但与该项目未形成强适配'],
      risks: [] as string[],
    };
  }

  private buildTimePreferenceSignal(opportunity: any, history: any[]) {
    const weekday = new Date(opportunity.date).getDay();
    const period = this.periodOf(opportunity.startTime);
    const hour = Number(String(opportunity.startTime).slice(0, 2));
    const sameWeekdayPeriod = history.filter((item) => new Date(item.date).getDay() === weekday && this.periodOf(item.startTime) === period).length;
    const samePeriod = history.filter((item) => this.periodOf(item.startTime) === period).length;
    const sameWeekday = history.filter((item) => new Date(item.date).getDay() === weekday).length;
    const closeHour = history.filter((item) => Math.abs(Number(String(item.startTime).slice(0, 2)) - hour) <= 1).length;
    const score = Math.min(100, Math.max(
      sameWeekdayPeriod * 45,
      samePeriod * 28,
      sameWeekday * 18,
      closeHour * 30,
      history.length ? 35 : 15,
    ));
    const reasons = [];
    if (sameWeekdayPeriod) {
      reasons.push(`历史偏好${WEEKDAY_LABELS[weekday]}${PERIOD_LABELS[period]}到店`);
    } else if (samePeriod) {
      reasons.push(`历史偏好${PERIOD_LABELS[period]}到店`);
    } else if (closeHour) {
      reasons.push(`历史偏好${opportunity.startTime}前后到店`);
    } else {
      reasons.push(history.length ? '有历史到店记录，但无明确日期/时段强偏好' : '暂无到店时段偏好，使用复购与项目信号推荐');
    }
    return { score, reasons };
  }

  private pickPreferredBeautician(history: any[], beauticians: any[], opportunity: any) {
    const activeBeauticians = new Map<number, any>(beauticians.map((item) => [Number(item.id), item]));
    const counts = new Map<number, number>();
    for (const item of history) {
      const beauticianId = Number(item.beauticianId);
      if (!beauticianId || !activeBeauticians.has(beauticianId)) continue;
      counts.set(beauticianId, (counts.get(beauticianId) ?? 0) + 1);
    }
    const historical = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([id]) => activeBeauticians.get(id))
      .find(Boolean);
    if (historical) return historical;

    const opportunityBeautician = (opportunity.beauticianIds ?? [])
      .map((id: number) => activeBeauticians.get(Number(id)))
      .find(Boolean);
    return opportunityBeautician ?? beauticians[0] ?? null;
  }

  private pickProjectId(history: any[], projects: any[]) {
    const projectIds = new Set(projects.map((item) => Number(item.id)));
    return history.find((item) => projectIds.has(Number(item.projectId)))?.projectId ?? null;
  }

  private isProjectCardMatch(card: any, project: any) {
    const cardName = this.normalizeText(card?.cardName ?? '');
    const projectName = this.normalizeText(project?.name ?? '');
    if (!cardName || !projectName) return false;
    const simplifiedCardName = cardName.replace(/[卡券套餐疗程次]/g, '');
    return cardName.includes(projectName) || (!!simplifiedCardName && projectName.includes(simplifiedCardName));
  }

  private periodOf(time: string) {
    const hour = Number(String(time).slice(0, 2));
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 20) return 'evening';
    return 'other';
  }

  private daysBetween(startDate: string, endDate: string) {
    const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
    return Math.max(0, Math.round((end - start) / 86_400_000));
  }

  private normalizeText(value: string) {
    return value.toLowerCase().replace(/\s+/g, '');
  }

  private stringifyJson(value: unknown) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private pickChannel(customer: any, hasMiniAppIdentity: boolean) {
    if (customer.phone) return 'phone';
    if (customer.wechat) return 'wechat';
    if (hasMiniAppIdentity) return 'miniapp';
    return customer.email ? 'email' : 'offline';
  }
}
