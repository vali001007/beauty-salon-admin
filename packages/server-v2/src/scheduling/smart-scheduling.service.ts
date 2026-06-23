import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulingService } from './scheduling.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';

type SmartScheduleStatus = 'available' | 'busy' | 'leave';

type SmartScheduleItem = {
  beauticianId: number;
  date: string;
  startTime: string;
  endTime: string;
  status?: SmartScheduleStatus | string;
  source?: 'existing' | 'generated' | 'reservation';
};

type HistoricalDemandItem = {
  weekday: number;
  startTime: string;
  endTime: string;
  expectedReservations: number;
};

type SmartSchedulingOptions = {
  storeId?: number;
  weekStart?: string;
  runId?: string;
  createdById?: number;
  mode?: 'blank' | 'copy_last_week_optimize' | 'optimize_current';
  objective?: 'cover_reservations' | 'cover_peak' | 'fairness' | 'reduce_staff';
  keepConfirmedReservations?: boolean;
  allowOverrideBusy?: boolean;
  allowOverrideLeave?: boolean;
  peakMinStaff?: Array<{ weekday: number; startTime: string; endTime: string; minStaff: number }>;
  schedules?: SmartScheduleItem[];
};

type ScheduleConflict = {
  type:
    | 'inactive_beautician'
    | 'leave_overlap'
    | 'busy_reservation_overlap'
    | 'uncovered_reservation'
    | 'duplicate_slot'
    | 'outside_business_hours'
    | 'skill_mismatch';
  severity: 'hard' | 'soft';
  message: string;
  beauticianId?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  reservationId?: number;
};

type DemandSlot = {
  date: string;
  startTime: string;
  endTime: string;
  expectedReservations: number;
  requiredStaff: number;
  scheduledStaff: number;
  level: 'low' | 'medium' | 'high';
};

type SmartSchedulingRuleConfig = {
  businessStartTime?: string;
  businessEndTime?: string;
  slotMinutes?: number;
  peakRules?: Array<{ weekday: number; startTime: string; endTime: string; minStaff: number }> | null;
  defaultMinStaff?: number;
};

type BeauticianAvailabilityRule = {
  beauticianId: number;
  weekday: number;
  startTime: string;
  endTime: string;
  type: string;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
};

type BeauticianTimeOffRule = {
  beauticianId: number;
  date: Date | string;
  startTime: string;
  endTime: string;
  status: string;
};

type BeauticianProjectSkillRule = {
  beauticianId: number;
  projectId: number;
  skillLevel: number;
  certified: boolean;
};

type SmartSchedulingContext = {
  storeId: number;
  weekStart: string;
  beauticians: any[];
  reservations: any[];
  historicalReservations: any[];
  historicalDemand: HistoricalDemandItem[];
  currentSchedules: any[];
  previousSchedules: any[];
  ruleConfig: SmartSchedulingRuleConfig | null;
  availabilities: BeauticianAvailabilityRule[];
  timeOffs: BeauticianTimeOffRule[];
  projectSkills: BeauticianProjectSkillRule[];
};

const DEFAULT_SLOTS = [
  ['09:00', '10:00'],
  ['10:00', '11:00'],
  ['11:00', '12:00'],
  ['14:00', '15:00'],
  ['15:00', '16:00'],
  ['16:00', '17:00'],
  ['17:00', '18:00'],
  ['18:00', '19:00'],
  ['19:00', '20:00'],
] as const;

const ACTIVE_BEAUTICIAN_STATUSES = new Set(['active', 'normal', 'available', '在职', '鍦ㄨ亴']);
const BOOKED_RESERVATION_STATUSES = new Set(['pending', 'confirmed', 'checked_in', 'in_progress']);
const CONFIRMED_RESERVATION_STATUSES = new Set(['confirmed', 'checked_in', 'in_progress']);

@Injectable()
export class SmartSchedulingService {
  constructor(
    private prisma: PrismaService,
    private schedulingService: SchedulingService,
    private commissionService?: CommissionService,
  ) {}

  async preview(options: SmartSchedulingOptions) {
    const context = await this.loadContext(options);
    const baseSchedules = await this.buildBaseSchedules(context.storeId, context.weekStart, options.mode);
    const schedules = this.generateSchedules({
      ...context,
      baseSchedules,
      options,
    });
    const evaluation = this.evaluateSchedules({
      ...context,
      schedules,
      options,
    });

    const runId = this.createRunId(context.storeId, context.weekStart);
    await this.recordRun({
      runId,
      storeId: context.storeId,
      weekStart: context.weekStart,
      status: 'preview',
      options,
      schedules,
      evaluation,
    });

    return {
      runId,
      weekStart: context.weekStart,
      score: evaluation.score,
      summary: evaluation.summary,
      schedules,
      warnings: evaluation.conflicts.filter((item) => item.severity === 'soft'),
      conflicts: evaluation.conflicts,
      explanations: this.buildExplanations(evaluation.demandSlots, evaluation.summary),
    };
  }

  async evaluate(options: SmartSchedulingOptions) {
    const context = await this.loadContext(options);
    const schedules = this.normalizeInputSchedules(options.schedules ?? []);
    const evaluation = this.evaluateSchedules({
      ...context,
      schedules,
      options,
    });

    return {
      weekStart: context.weekStart,
      score: evaluation.score,
      summary: evaluation.summary,
      demandSlots: evaluation.demandSlots,
      conflicts: evaluation.conflicts,
      warnings: evaluation.conflicts.filter((item) => item.severity === 'soft'),
      explanations: this.buildExplanations(evaluation.demandSlots, evaluation.summary),
    };
  }

  async publish(options: SmartSchedulingOptions) {
    const context = await this.loadContext(options);
    const schedules = this.mergeConfirmedReservationSchedules(
      this.normalizeInputSchedules(options.schedules ?? []),
      context.reservations,
      options,
    );
    if (!schedules.length) {
      throw new BadRequestException({ message: '缺少待发布排班', code: 'SMART_SCHEDULING_EMPTY' });
    }

    const evaluation = this.evaluateSchedules({
      ...context,
      schedules,
      options,
    });
    if (evaluation.summary.hardConflictCount > 0) {
      throw new BadRequestException({
        message: '存在硬冲突，不能发布排班',
        code: 'SMART_SCHEDULING_CONFLICT',
        conflicts: evaluation.conflicts.filter((item) => item.severity === 'hard'),
      });
    }

    const runId = options.runId ?? this.createRunId(context.storeId, context.weekStart);
    await this.recordRun({
      runId,
      storeId: context.storeId,
      weekStart: context.weekStart,
      status: 'preview',
      options,
      schedules,
      evaluation,
    });

    const grouped = this.groupSchedulesByBeautician(schedules);
    const saved = [];
    for (const [beauticianId, items] of grouped.entries()) {
      saved.push(
        ...(await this.schedulingService.save(
          items.map((item) => ({
            storeId: context.storeId,
            beauticianId,
            date: item.date,
            startTime: item.startTime,
            endTime: item.endTime,
            status: item.status,
            smartRunId: runId,
          })),
          context.storeId,
          beauticianId,
          context.weekStart,
        )),
      );
    }

    await this.recordRun({
      runId,
      storeId: context.storeId,
      weekStart: context.weekStart,
      status: 'published',
      options,
      schedules,
      evaluation,
      confirmedAt: new Date(),
    });
    if (this.commissionService) {
      await this.commissionService.recordAmiContribution({
        storeId: context.storeId,
        category: 'scheduling',
        triggerType: 'smart_scheduling',
        triggerId: this.hashTriggerId(runId),
        workMinutes: 15,
        metadata: { runId, weekStart: context.weekStart, savedCount: saved.length, score: evaluation.score },
      });
    }

    return {
      runId,
      weekStart: context.weekStart,
      score: evaluation.score,
      summary: evaluation.summary,
      savedCount: saved.length,
      schedules: saved,
    };
  }

  async demand(options: SmartSchedulingOptions) {
    const context = await this.loadContext(options);
    const scheduledStaffBySlot = this.countScheduledStaff(this.normalizeStoredSchedules(context.currentSchedules));
    const demandSlots = this.buildDemandSlots(
      context.weekStart,
      context.reservations,
      scheduledStaffBySlot,
      options,
      context.ruleConfig,
      context.historicalDemand,
    );

    return {
      weekStart: context.weekStart,
      slots: demandSlots,
      summary: {
        highDemandSlots: demandSlots.filter((item) => item.level === 'high').length,
        underStaffedSlots: demandSlots.filter((item) => item.scheduledStaff < item.requiredStaff).length,
      },
    };
  }

  private async loadContext(options: SmartSchedulingOptions) {
    const storeId = Number(options.storeId);
    if (!storeId) {
      throw new BadRequestException({ message: '缺少门店信息', code: 'SMART_SCHEDULING_STORE_REQUIRED' });
    }
    const weekStart = this.toDateKey(options.weekStart);
    if (!weekStart) {
      throw new BadRequestException({ message: '缺少排班周起始日期', code: 'SMART_SCHEDULING_WEEK_REQUIRED' });
    }

    const weekEnd = this.addDays(weekStart, 7);
    const previousWeekStart = this.addDays(weekStart, -7);
    const historicalStart = this.addDays(weekStart, -28);
    const [beauticians, reservations, historicalReservations, currentSchedules, previousSchedules, ruleConfig, availabilities, timeOffs] = await Promise.all([
      this.prisma.beautician.findMany({
        where: { storeId },
        include: { level: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          storeId,
          status: { in: Array.from(BOOKED_RESERVATION_STATUSES) },
          date: { gte: new Date(weekStart), lt: new Date(weekEnd) },
        },
        include: { project: true, beautician: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.reservation.findMany({
        where: {
          storeId,
          status: { in: Array.from(BOOKED_RESERVATION_STATUSES) },
          date: { gte: new Date(historicalStart), lt: new Date(weekStart) },
        },
        include: { project: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.schedule.findMany({
        where: { storeId, date: { gte: new Date(weekStart), lt: new Date(weekEnd) } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.schedule.findMany({
        where: { storeId, date: { gte: new Date(previousWeekStart), lt: new Date(weekStart) } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.loadRuleConfig(storeId),
      this.loadAvailabilities(storeId, weekStart, weekEnd),
      this.loadTimeOffs(storeId, weekStart, weekEnd),
    ]);

    const projectSkills = await this.loadProjectSkills(storeId, reservations);
    const historicalDemand = this.buildHistoricalDemand(historicalReservations);

    return {
      storeId,
      weekStart,
      beauticians,
      reservations,
      historicalReservations,
      historicalDemand,
      currentSchedules,
      previousSchedules,
      ruleConfig,
      availabilities,
      timeOffs,
      projectSkills,
    };
  }

  private async buildBaseSchedules(storeId: number, weekStart: string, mode?: SmartSchedulingOptions['mode']) {
    if (mode === 'blank') return [];
    const sourceWeekStart = mode === 'copy_last_week_optimize' ? this.addDays(weekStart, -7) : weekStart;
    const sourceWeekEnd = this.addDays(sourceWeekStart, 7);
    const sourceSchedules = await this.prisma.schedule.findMany({
      where: { storeId, date: { gte: new Date(sourceWeekStart), lt: new Date(sourceWeekEnd) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return sourceSchedules.map((item) => ({
      beauticianId: item.beauticianId,
      date: this.addDays(weekStart, this.daysBetween(sourceWeekStart, this.toDateKey(item.date))),
      startTime: item.startTime,
      endTime: item.endTime,
      status: item.status,
      source: 'existing' as const,
    }));
  }

  private async loadRuleConfig(storeId: number): Promise<SmartSchedulingRuleConfig | null> {
    const delegate = (this.prisma as any).schedulingRuleConfig;
    if (!delegate?.findFirst) return null;
    const config = await delegate.findFirst({
      where: { storeId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!config) return null;
    return {
      businessStartTime: config.businessStartTime,
      businessEndTime: config.businessEndTime,
      slotMinutes: config.slotMinutes,
      peakRules: Array.isArray(config.peakRules) ? config.peakRules : null,
      defaultMinStaff: config.defaultMinStaff,
    };
  }

  private async loadAvailabilities(storeId: number, weekStart: string, weekEnd: string): Promise<BeauticianAvailabilityRule[]> {
    const delegate = (this.prisma as any).beauticianAvailability;
    if (!delegate?.findMany) return [];
    return delegate.findMany({
      where: {
        storeId,
        OR: [
          { effectiveFrom: null, effectiveTo: null },
          { effectiveFrom: null, effectiveTo: { gte: new Date(weekStart) } },
          { effectiveFrom: { lt: new Date(weekEnd) }, effectiveTo: null },
          { effectiveFrom: { lt: new Date(weekEnd) }, effectiveTo: { gte: new Date(weekStart) } },
        ],
      },
    });
  }

  private async loadTimeOffs(storeId: number, weekStart: string, weekEnd: string): Promise<BeauticianTimeOffRule[]> {
    const delegate = (this.prisma as any).beauticianTimeOff;
    if (!delegate?.findMany) return [];
    return delegate.findMany({
      where: {
        storeId,
        status: { in: ['approved', 'active'] },
        date: { gte: new Date(weekStart), lt: new Date(weekEnd) },
      },
    });
  }

  private async loadProjectSkills(storeId: number, reservations: any[]): Promise<BeauticianProjectSkillRule[]> {
    const delegate = (this.prisma as any).beauticianProjectSkill;
    if (!delegate?.findMany) return [];
    const projectIds = Array.from(new Set(reservations.map((item) => Number(item.projectId)).filter((id) => id > 0)));
    if (!projectIds.length) return [];
    return delegate.findMany({
      where: {
        projectId: { in: projectIds },
        project: { storeId },
      },
      select: {
        beauticianId: true,
        projectId: true,
        skillLevel: true,
        certified: true,
      },
    });
  }

  private async recordRun(data: {
    runId: string;
    storeId: number;
    weekStart: string;
    status: 'preview' | 'published';
    options: SmartSchedulingOptions;
    schedules: SmartScheduleItem[];
    evaluation: ReturnType<SmartSchedulingService['evaluateSchedules']>;
    confirmedAt?: Date;
  }) {
    const delegate = (this.prisma as any).smartSchedulingRun;
    if (!delegate?.upsert) return;
    const payload = {
      storeId: data.storeId,
      weekStart: new Date(data.weekStart),
      status: data.status,
      inputSnapshot: data.options,
      generatedSchedules: data.schedules,
      score: data.evaluation.score,
      warnings: {
        conflicts: data.evaluation.conflicts,
        summary: data.evaluation.summary,
        explanations: this.buildExplanations(data.evaluation.demandSlots, data.evaluation.summary),
      },
      createdById: data.options.createdById ? Number(data.options.createdById) : null,
      confirmedAt: data.confirmedAt ?? null,
    };
    await delegate.upsert({
      where: { runId: data.runId },
      create: { runId: data.runId, ...payload },
      update: payload,
    });
  }

  private generateSchedules(context: SmartSchedulingContext & {
    baseSchedules: SmartScheduleItem[];
    options: SmartSchedulingOptions;
  }) {
    const activeBeauticians = context.beauticians.filter((item) => this.isBeauticianActive(item.status));
    const schedules = this.dedupeSchedules(this.normalizeInputSchedules(context.baseSchedules));
    const scheduleKeys = new Set(schedules.map((item) => this.scheduleKey(item)));
    const bookedLoad = this.countHoursByBeautician(schedules);
    const demandSlots = this.buildDemandSlots(
      context.weekStart,
      context.reservations,
      this.countScheduledStaff(schedules),
      context.options,
      context.ruleConfig,
      context.historicalDemand,
    );

    for (const reservation of context.reservations) {
      if (!reservation.beauticianId) continue;
      if (context.options.keepConfirmedReservations === false && CONFIRMED_RESERVATION_STATUSES.has(reservation.status)) continue;
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      const item: SmartScheduleItem = {
        beauticianId: reservation.beauticianId,
        date: this.toDateKey(reservation.date),
        startTime,
        endTime,
        status: 'available',
        source: 'reservation',
      };
      const key = this.scheduleKey(item);
      if (!scheduleKeys.has(key)) {
        schedules.push(item);
        scheduleKeys.add(key);
        bookedLoad.set(item.beauticianId, (bookedLoad.get(item.beauticianId) ?? 0) + this.durationHours(item));
      }
    }

    for (const demand of demandSlots) {
      let scheduled = schedules.filter(
        (item) =>
          item.date === demand.date &&
          this.overlaps(item.startTime, item.endTime, demand.startTime, demand.endTime) &&
          this.isWorkingStatus(item.status),
      ).length;
      while (scheduled < demand.requiredStaff) {
        const candidate = this.pickBeautician(activeBeauticians, schedules, bookedLoad, demand, context.options, context.availabilities, context.timeOffs);
        if (!candidate) break;
        const item: SmartScheduleItem = {
          beauticianId: candidate.id,
          date: demand.date,
          startTime: demand.startTime,
          endTime: demand.endTime,
          status: 'available',
          source: 'generated',
        };
        schedules.push(item);
        scheduleKeys.add(this.scheduleKey(item));
        bookedLoad.set(candidate.id, (bookedLoad.get(candidate.id) ?? 0) + this.durationHours(item));
        scheduled += 1;
      }
    }

    return this.dedupeSchedules(schedules).sort((a, b) =>
      `${a.date} ${a.startTime} ${a.beauticianId}`.localeCompare(`${b.date} ${b.startTime} ${b.beauticianId}`),
    );
  }

  private mergeConfirmedReservationSchedules(
    schedules: SmartScheduleItem[],
    reservations: any[],
    options: SmartSchedulingOptions,
  ) {
    if (options.keepConfirmedReservations === false) return schedules;
    const next = [...schedules];
    const keys = new Set(next.map((item) => this.scheduleKey(item)));
    for (const reservation of reservations) {
      if (!reservation.beauticianId || !CONFIRMED_RESERVATION_STATUSES.has(reservation.status)) continue;
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const item: SmartScheduleItem = {
        beauticianId: reservation.beauticianId,
        date: this.toDateKey(reservation.date),
        startTime,
        endTime: reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60)),
        status: 'available',
        source: 'reservation',
      };
      const key = this.scheduleKey(item);
      if (!keys.has(key)) {
        next.push(item);
        keys.add(key);
      }
    }
    return this.dedupeSchedules(next);
  }

  private evaluateSchedules(context: SmartSchedulingContext & {
    schedules: SmartScheduleItem[];
    options: SmartSchedulingOptions;
  }) {
    const schedules = this.normalizeInputSchedules(context.schedules);
    const conflicts = this.detectConflicts(context, schedules);
    const demandSlots = this.buildDemandSlots(
      context.weekStart,
      context.reservations,
      this.countScheduledStaff(schedules),
      context.options,
      context.ruleConfig,
      context.historicalDemand,
    );
    const hardConflictCount = conflicts.filter((item) => item.severity === 'hard').length;
    const softWarningCount = conflicts.filter((item) => item.severity === 'soft').length;
    const reservationCoverageRate = this.calculateReservationCoverage(context.reservations, schedules);
    const peakCoverageRate = this.calculatePeakCoverage(demandSlots);
    const fairnessScore = this.calculateFairnessScore(schedules, context.beauticians.map((item) => item.id));
    const skillScore = this.calculateSkillScore(context.reservations, schedules, context.projectSkills);
    const conflictScore = Math.max(0, 20 - hardConflictCount * 8 - softWarningCount * 2);
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(reservationCoverageRate * 30 + peakCoverageRate * 20 + conflictScore + fairnessScore * 15 + skillScore * 10 + 5),
      ),
    );

    return {
      score,
      conflicts,
      demandSlots,
      summary: {
        reservationCoverageRate,
        peakCoverageRate,
        hardConflictCount,
        softWarningCount,
        scheduledSlots: schedules.length,
      },
    };
  }

  private detectConflicts(
    context: SmartSchedulingContext,
    schedules: SmartScheduleItem[],
  ): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const beauticianById = new Map(context.beauticians.map((item) => [item.id, item]));
    const seen = new Set<string>();

    for (const item of schedules) {
      const beautician = beauticianById.get(item.beauticianId);
      if (this.isWorkingStatus(item.status) && !this.isWithinBusinessHours(item.startTime, item.endTime, context.ruleConfig)) {
        conflicts.push({
          type: 'outside_business_hours',
          severity: 'hard',
          message: `美容师 ${item.beauticianId} 在 ${item.date} ${item.startTime}-${item.endTime} 超出门店营业时间`,
          beauticianId: item.beauticianId,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
        });
      }
      if (!beautician || !this.isBeauticianActive(beautician.status)) {
        conflicts.push({
          type: 'inactive_beautician',
          severity: 'hard',
          message: `美容师 ${item.beauticianId} 不可排班`,
          beauticianId: item.beauticianId,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
        });
      }
      const key = this.scheduleKey(item);
      if (seen.has(key)) {
        conflicts.push({
          type: 'duplicate_slot',
          severity: 'hard',
          message: `美容师 ${item.beauticianId} 在 ${item.date} ${item.startTime}-${item.endTime} 重复排班`,
          beauticianId: item.beauticianId,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
        });
      }
      seen.add(key);

      const timeOff = context.timeOffs.find(
        (entry) =>
          entry.beauticianId === item.beauticianId &&
          this.toDateKey(entry.date) === item.date &&
          ['approved', 'active'].includes(String(entry.status)) &&
          this.overlaps(entry.startTime, entry.endTime, item.startTime, item.endTime),
      );
      if (timeOff && this.isWorkingStatus(item.status)) {
        conflicts.push({
          type: 'leave_overlap',
          severity: 'hard',
          message: `美容师 ${item.beauticianId} 在 ${item.date} ${item.startTime}-${item.endTime} 与请假时段冲突`,
          beauticianId: item.beauticianId,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
        });
      }

      const overlapped = schedules.find(
        (other) =>
          other !== item &&
          other.beauticianId === item.beauticianId &&
          other.date === item.date &&
          this.overlaps(other.startTime, other.endTime, item.startTime, item.endTime),
      );
      if (overlapped && this.scheduleKey(overlapped) < key) {
        conflicts.push({
          type: 'duplicate_slot',
          severity: 'hard',
          message: `美容师 ${item.beauticianId} 在 ${item.date} 存在重叠排班`,
          beauticianId: item.beauticianId,
          date: item.date,
          startTime: item.startTime,
          endTime: item.endTime,
        });
      }
    }

    for (const reservation of context.reservations) {
      const date = this.toDateKey(reservation.date);
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      const matching = schedules.filter((item) => item.beauticianId === reservation.beauticianId && item.date === date && this.covers(item, startTime, endTime));
      if (reservation.beauticianId && !matching.some((item) => item.status !== 'leave' && item.status !== 'busy')) {
        conflicts.push({
          type: 'uncovered_reservation',
          severity: CONFIRMED_RESERVATION_STATUSES.has(reservation.status) ? 'hard' : 'soft',
          message: `预约 ${reservation.id} 未被排班覆盖`,
          beauticianId: reservation.beauticianId,
          date,
          startTime,
          endTime,
          reservationId: reservation.id,
        });
      }
      const blocked = schedules.find(
        (item) =>
          item.beauticianId === reservation.beauticianId &&
          item.date === date &&
          ['busy', 'leave'].includes(String(item.status)) &&
          this.overlaps(item.startTime, item.endTime, startTime, endTime),
      );
      if (blocked) {
        conflicts.push({
          type: blocked.status === 'leave' ? 'leave_overlap' : 'busy_reservation_overlap',
          severity: CONFIRMED_RESERVATION_STATUSES.has(reservation.status) ? 'hard' : 'soft',
          message: `预约 ${reservation.id} 与${blocked.status === 'leave' ? '请假' : '忙碌'}时段冲突`,
          beauticianId: reservation.beauticianId ?? undefined,
          date,
          startTime,
          endTime,
          reservationId: reservation.id,
        });
      }
      const skill = this.findProjectSkill(context.projectSkills, reservation.projectId, reservation.beauticianId);
      if (reservation.beauticianId && !this.isSkillQualified(context.projectSkills, reservation.projectId, skill)) {
        conflicts.push({
          type: 'skill_mismatch',
          severity: 'soft',
          message: `预约 ${reservation.id} 的项目与美容师 ${reservation.beauticianId} 技能匹配不足，建议发布前人工确认`,
          beauticianId: reservation.beauticianId,
          date,
          startTime,
          endTime,
          reservationId: reservation.id,
        });
      }
    }

    return conflicts;
  }

  private buildDemandSlots(
    weekStart: string,
    reservations: any[],
    scheduledStaffBySlot: Map<string, number>,
    options: SmartSchedulingOptions,
    ruleConfig?: SmartSchedulingRuleConfig | null,
    historicalDemand: HistoricalDemandItem[] = [],
  ): DemandSlot[] {
    return Array.from({ length: 7 }, (_, dayIndex) => {
      const date = this.addDays(weekStart, dayIndex);
      return DEFAULT_SLOTS.filter(([startTime, endTime]) => this.isWithinBusinessHours(startTime, endTime, ruleConfig)).map(([startTime, endTime]) => {
        const currentReservations = reservations.filter(
          (item) => this.toDateKey(item.date) === date && this.overlaps(item.startTime || this.toTimeKey(item.date), item.endTime || this.addMinutes(item.startTime || this.toTimeKey(item.date), Number(item.project?.duration ?? 60)), startTime, endTime),
        ).length;
        const historicalExpected = this.getHistoricalExpectedReservations(historicalDemand, dayIndex + 1, startTime, endTime);
        const expectedReservations = Math.max(currentReservations, historicalExpected);
        const configuredMinStaff = this.getConfiguredMinStaff(options, ruleConfig, dayIndex + 1, startTime, endTime);
        const requiredStaff = Math.max(configuredMinStaff, expectedReservations, expectedReservations > 0 ? 1 : 0);
        const scheduledStaff = scheduledStaffBySlot.get(this.slotKey(date, startTime, endTime)) ?? 0;
        const level: DemandSlot['level'] = requiredStaff >= 3 || expectedReservations >= 5 ? 'high' : requiredStaff >= 2 || expectedReservations >= 2 ? 'medium' : 'low';
        return { date, startTime, endTime, expectedReservations, requiredStaff, scheduledStaff, level };
      });
    }).flat();
  }

  private buildHistoricalDemand(reservations: any[]): HistoricalDemandItem[] {
    const counts = new Map<string, { weekday: number; startTime: string; endTime: string; count: number; weeks: Set<string> }>();
    for (const reservation of reservations) {
      const date = this.toDateKey(reservation.date);
      if (!date) continue;
      const weekday = new Date(date).getDay() || 7;
      const weekStart = this.addDays(date, -(weekday - 1));
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      for (const [slotStart, slotEnd] of DEFAULT_SLOTS) {
        if (!this.overlaps(startTime, endTime, slotStart, slotEnd)) continue;
        const key = `${weekday}:${slotStart}:${slotEnd}`;
        const current = counts.get(key) ?? { weekday, startTime: slotStart, endTime: slotEnd, count: 0, weeks: new Set<string>() };
        current.count += 1;
        current.weeks.add(weekStart);
        counts.set(key, current);
      }
    }

    return Array.from(counts.values()).map((item) => ({
      weekday: item.weekday,
      startTime: item.startTime,
      endTime: item.endTime,
      expectedReservations: Math.ceil(item.count / Math.max(1, item.weeks.size)),
    }));
  }

  private getHistoricalExpectedReservations(
    demand: HistoricalDemandItem[],
    weekday: number,
    startTime: string,
    endTime: string,
  ) {
    return demand
      .filter((item) => item.weekday === weekday && this.overlaps(item.startTime, item.endTime, startTime, endTime))
      .reduce((max, item) => Math.max(max, item.expectedReservations), 0);
  }

  private pickBeautician(
    beauticians: any[],
    schedules: SmartScheduleItem[],
    load: Map<number, number>,
    demand: DemandSlot,
    options: SmartSchedulingOptions,
    availabilities: BeauticianAvailabilityRule[],
    timeOffs: BeauticianTimeOffRule[],
  ) {
    return beauticians
      .filter(
        (beautician) =>
          this.isBeauticianAvailableForSlot(beautician.id, demand, availabilities, timeOffs) &&
          !schedules.some((item) => {
            if (item.beauticianId !== beautician.id || item.date !== demand.date) return false;
            if (!this.overlaps(item.startTime, item.endTime, demand.startTime, demand.endTime)) return false;
            if (item.status === 'busy') return options.allowOverrideBusy !== true;
            if (item.status === 'leave') return options.allowOverrideLeave !== true;
            return true;
          }),
      )
      .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.id - b.id)[0];
  }

  private buildExplanations(demandSlots: DemandSlot[], summary: { reservationCoverageRate: number; peakCoverageRate: number; hardConflictCount: number; softWarningCount: number }) {
    const highDemand = demandSlots.filter((item) => item.level === 'high');
    const underStaffed = demandSlots.filter((item) => item.scheduledStaff < item.requiredStaff);
    const explanations = [
      `预约覆盖率 ${Math.round(summary.reservationCoverageRate * 100)}%，高峰覆盖率 ${Math.round(summary.peakCoverageRate * 100)}%。`,
    ];
    if (highDemand.length) explanations.push(`本周识别到 ${highDemand.length} 个高需求时段，优先补齐这些时段的人手。`);
    if (underStaffed.length) explanations.push(`仍有 ${underStaffed.length} 个时段人手低于建议值，发布前建议重点检查。`);
    if (summary.hardConflictCount) explanations.push(`存在 ${summary.hardConflictCount} 个硬冲突，当前方案不能发布。`);
    return explanations;
  }

  private calculateReservationCoverage(reservations: any[], schedules: SmartScheduleItem[]) {
    const assignedReservations = reservations.filter((item) => item.beauticianId);
    if (!assignedReservations.length) return 1;
    const covered = assignedReservations.filter((reservation) => {
      const date = this.toDateKey(reservation.date);
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      return schedules.some(
        (item) =>
          item.beauticianId === reservation.beauticianId &&
          item.date === date &&
          item.status !== 'busy' &&
          item.status !== 'leave' &&
          this.covers(item, startTime, endTime),
      );
    }).length;
    return covered / assignedReservations.length;
  }

  private calculatePeakCoverage(demandSlots: DemandSlot[]) {
    const required = demandSlots.filter((item) => item.requiredStaff > 0);
    if (!required.length) return 1;
    const ratio = required.reduce((sum, item) => sum + Math.min(1, item.scheduledStaff / item.requiredStaff), 0) / required.length;
    return Number(ratio.toFixed(2));
  }

  private calculateFairnessScore(schedules: SmartScheduleItem[], beauticianIds: number[]) {
    const activeIds = beauticianIds.length ? beauticianIds : Array.from(new Set(schedules.map((item) => item.beauticianId)));
    if (activeIds.length <= 1) return 1;
    const loads = activeIds.map((id) => this.countHoursByBeautician(schedules).get(id) ?? 0);
    const max = Math.max(...loads);
    const min = Math.min(...loads);
    if (max === 0) return 1;
    return Math.max(0, 1 - (max - min) / Math.max(max, 1));
  }

  private calculateSkillScore(reservations: any[], schedules: SmartScheduleItem[], skills: BeauticianProjectSkillRule[]) {
    const assignedReservations = reservations.filter((item) => item.beauticianId && this.projectHasSkillConfig(skills, item.projectId));
    if (!assignedReservations.length) return 1;
    const qualified = assignedReservations.filter((reservation) => {
      const date = this.toDateKey(reservation.date);
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      const covered = schedules.some(
        (item) =>
          item.beauticianId === reservation.beauticianId &&
          item.date === date &&
          this.isWorkingStatus(item.status) &&
          this.covers(item, startTime, endTime),
      );
      if (!covered) return false;
      return this.isSkillQualified(skills, reservation.projectId, this.findProjectSkill(skills, reservation.projectId, reservation.beauticianId));
    }).length;
    return qualified / assignedReservations.length;
  }

  private projectHasSkillConfig(skills: BeauticianProjectSkillRule[], projectId: number | string | null | undefined) {
    const normalizedProjectId = Number(projectId);
    return normalizedProjectId > 0 && skills.some((item) => item.projectId === normalizedProjectId);
  }

  private findProjectSkill(
    skills: BeauticianProjectSkillRule[],
    projectId: number | string | null | undefined,
    beauticianId: number | string | null | undefined,
  ) {
    const normalizedProjectId = Number(projectId);
    const normalizedBeauticianId = Number(beauticianId);
    return skills.find((item) => item.projectId === normalizedProjectId && item.beauticianId === normalizedBeauticianId);
  }

  private isSkillQualified(
    skills: BeauticianProjectSkillRule[],
    projectId: number | string | null | undefined,
    skill?: BeauticianProjectSkillRule,
  ) {
    if (!this.projectHasSkillConfig(skills, projectId)) return true;
    return Boolean(skill?.certified || Number(skill?.skillLevel ?? 0) >= 2);
  }

  private countScheduledStaff(schedules: SmartScheduleItem[]) {
    const counts = new Map<string, number>();
    for (const item of schedules) {
      if (!this.isWorkingStatus(item.status)) continue;
      for (const [startTime, endTime] of DEFAULT_SLOTS) {
        if (this.overlaps(item.startTime, item.endTime, startTime, endTime)) {
          const key = this.slotKey(item.date, startTime, endTime);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  private countHoursByBeautician(schedules: SmartScheduleItem[]) {
    const counts = new Map<number, number>();
    for (const item of schedules) {
      if (!this.isWorkingStatus(item.status)) continue;
      counts.set(item.beauticianId, (counts.get(item.beauticianId) ?? 0) + this.durationHours(item));
    }
    return counts;
  }

  private groupSchedulesByBeautician(schedules: SmartScheduleItem[]) {
    const grouped = new Map<number, SmartScheduleItem[]>();
    for (const item of schedules) {
      const list = grouped.get(item.beauticianId) ?? [];
      list.push(item);
      grouped.set(item.beauticianId, list);
    }
    return grouped;
  }

  private normalizeInputSchedules(schedules: SmartScheduleItem[]) {
    return schedules
      .map((item) => ({
        beauticianId: Number(item.beauticianId),
        date: this.toDateKey(item.date),
        startTime: item.startTime,
        endTime: item.endTime,
        status: item.status || 'available',
        source: item.source,
      }))
      .filter((item) => item.beauticianId && item.date && item.startTime && item.endTime);
  }

  private normalizeStoredSchedules(schedules: Array<{ beauticianId: number; date: Date | string; startTime: string; endTime: string; status: string }>) {
    return schedules.map((item) => ({
      beauticianId: item.beauticianId,
      date: this.toDateKey(item.date),
      startTime: item.startTime,
      endTime: item.endTime,
      status: item.status,
      source: 'existing' as const,
    }));
  }

  private dedupeSchedules(schedules: SmartScheduleItem[]) {
    const byKey = new Map<string, SmartScheduleItem>();
    for (const item of schedules) {
      byKey.set(this.scheduleKey(item), item);
    }
    return Array.from(byKey.values());
  }

  private getConfiguredMinStaff(
    options: SmartSchedulingOptions,
    ruleConfig: SmartSchedulingRuleConfig | null | undefined,
    weekday: number,
    startTime: string,
    endTime: string,
  ) {
    const peakRules = options.peakMinStaff?.length ? options.peakMinStaff : (ruleConfig?.peakRules ?? []);
    const matched = peakRules.find(
      (item) => item.weekday === weekday && this.overlaps(item.startTime, item.endTime, startTime, endTime),
    );
    return Number(matched?.minStaff ?? ruleConfig?.defaultMinStaff ?? 0);
  }

  private isWithinBusinessHours(startTime: string, endTime: string, ruleConfig?: SmartSchedulingRuleConfig | null) {
    if (!ruleConfig?.businessStartTime || !ruleConfig?.businessEndTime) return true;
    return this.toMinutes(startTime) >= this.toMinutes(ruleConfig.businessStartTime) && this.toMinutes(endTime) <= this.toMinutes(ruleConfig.businessEndTime);
  }

  private isBeauticianAvailableForSlot(
    beauticianId: number,
    slot: DemandSlot,
    availabilities: BeauticianAvailabilityRule[],
    timeOffs: BeauticianTimeOffRule[],
  ) {
    const weekday = new Date(slot.date).getDay() || 7;
    const relevantAvailability = availabilities.filter((item) => item.beauticianId === beauticianId && Number(item.weekday) === weekday);
    const unavailable = relevantAvailability.some(
      (item) => item.type === 'unavailable' && this.overlaps(item.startTime, item.endTime, slot.startTime, slot.endTime),
    );
    if (unavailable) return false;

    const availableRules = relevantAvailability.filter((item) => item.type === 'available' || item.type === 'preferred');
    if (availableRules.length && !availableRules.some((item) => this.coversTime(item.startTime, item.endTime, slot.startTime, slot.endTime))) {
      return false;
    }

    return !timeOffs.some(
      (item) =>
        item.beauticianId === beauticianId &&
        this.toDateKey(item.date) === slot.date &&
        ['approved', 'active'].includes(String(item.status)) &&
        this.overlaps(item.startTime, item.endTime, slot.startTime, slot.endTime),
    );
  }

  private isBeauticianActive(status: string | null | undefined) {
    return !status || ACTIVE_BEAUTICIAN_STATUSES.has(status);
  }

  private isWorkingStatus(status: string | undefined) {
    return !['busy', 'leave'].includes(String(status));
  }

  private covers(item: SmartScheduleItem, startTime: string, endTime: string) {
    return this.coversTime(item.startTime, item.endTime, startTime, endTime);
  }

  private coversTime(containerStart: string, containerEnd: string, startTime: string, endTime: string) {
    return this.toMinutes(containerStart) <= this.toMinutes(startTime) && this.toMinutes(containerEnd) >= this.toMinutes(endTime);
  }

  private overlaps(startA: string, endA: string, startB: string, endB: string) {
    return this.toMinutes(startA) < this.toMinutes(endB) && this.toMinutes(startB) < this.toMinutes(endA);
  }

  private durationHours(item: SmartScheduleItem) {
    return Math.max(0, (this.toMinutes(item.endTime) - this.toMinutes(item.startTime)) / 60);
  }

  private toMinutes(time: string) {
    const [hour = '0', minute = '0'] = String(time).split(':');
    return Number(hour) * 60 + Number(minute);
  }

  private addMinutes(time: string, minutes: number) {
    const total = this.toMinutes(time) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  private toDateKey(value?: string | Date | null) {
    if (!value) return '';
    if (value instanceof Date) return formatBusinessDate(value);
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? '' : formatBusinessDate(date);
  }

  private toTimeKey(value?: string | Date | null) {
    if (!value) return '00:00';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '00:00' : date.toTimeString().slice(0, 5);
  }

  private addDays(dateText: string, days: number) {
    const date = new Date(dateText);
    date.setDate(date.getDate() + days);
    return formatBusinessDate(date);
  }

  private daysBetween(startDate: string, endDate: string) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return Math.round((end - start) / 86_400_000);
  }

  private scheduleKey(item: SmartScheduleItem) {
    return `${item.beauticianId}:${item.date}:${item.startTime}:${item.endTime}`;
  }

  private slotKey(date: string, startTime: string, endTime: string) {
    return `${date}:${startTime}:${endTime}`;
  }

  private createRunId(storeId: number, weekStart: string) {
    return `smart_${storeId}_${weekStart.replace(/-/g, '')}_${Date.now()}`;
  }

  private hashTriggerId(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash % 2147483647;
  }
}
