import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulingService } from './scheduling.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';

type LegacyMode = 'blank' | 'copy_last_week_optimize' | 'optimize_current';
type SmartSchedulingMode = 'balanced' | 'reservation_first' | 'peak_first' | 'cost_first' | 'fairness_first';
type SolverStatus = 'optimal' | 'feasible' | 'timeout' | 'failed';
type DemandLoadLevel = 'low' | 'medium' | 'high';
type DemandRecommendedAction = 'fill_gap' | 'keep' | 'add_staff';

type SmartScheduleItem = {
  beauticianId: number;
  date: string;
  startTime: string;
  endTime: string;
  status?: string;
  source?: 'existing' | 'generated' | 'reservation' | 'manual' | 'rollback';
  reservationId?: number;
};

type SmartSchedulingOptions = {
  storeId?: number;
  weekStart?: string;
  runId?: string;
  createdById?: number;
  mode?: LegacyMode | SmartSchedulingMode;
  objective?: 'cover_reservations' | 'cover_peak' | 'fairness' | 'reduce_staff';
  keepConfirmedReservations?: boolean;
  allowOverrideBusy?: boolean;
  allowOverrideLeave?: boolean;
  peakMinStaff?: Array<{ weekday: number; startTime: string; endTime: string; minStaff: number }>;
  schedules?: SmartScheduleItem[];
  generateAlternatives?: boolean;
  optimizeScope?: 'week' | 'affected';
  respectPublishedLocks?: boolean;
  selectedAlternativeId?: string;
  targetVersionId?: number;
};

type ScheduleConflict = {
  type:
    | 'inactive_beautician'
    | 'leave_overlap'
    | 'busy_reservation_overlap'
    | 'uncovered_reservation'
    | 'duplicate_slot'
    | 'outside_business_hours'
    | 'skill_mismatch'
    | 'max_daily_hours'
    | 'max_weekly_hours'
    | 'min_rest_minutes'
    | 'resource_capacity'
    | 'unassigned_reservation'
    | 'no_resource_config';
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
  expectedServiceDemand: number;
  requiredServiceCapacity: number;
  scheduledServiceCapacity: number;
  level: 'low' | 'medium' | 'high';
  staffDelta: number;
  loadRatio: number;
  loadLevel: DemandLoadLevel;
  recommendedAction: DemandRecommendedAction;
};

type HistoricalDemandItem = {
  weekday: number;
  startTime: string;
  endTime: string;
  expectedReservations: number;
};

type SmartSchedulingRuleConfig = {
  businessStartTime?: string;
  businessEndTime?: string;
  slotMinutes?: number;
  peakRules?: Array<{ weekday: number; startTime: string; endTime: string; minStaff: number }> | null;
  maxDailyHours?: number | null;
  maxWeeklyHours?: number | null;
  minRestMinutes?: number | null;
  defaultMinStaff?: number;
  algorithmMode?: string | null;
  objectiveWeights?: Record<string, number> | null;
  allowReassignUnconfirmedReservation?: boolean;
  allowReassignConfirmedReservation?: boolean;
  walkInBufferRules?: Array<{ weekday?: number; startTime: string; endTime: string; buffer: number }> | null;
  lockedAfterPublished?: boolean;
};

type SmartSchedulingContext = {
  storeId: number;
  weekStart: string;
  weekEnd: string;
  beauticians: any[];
  reservations: any[];
  historicalDemand: HistoricalDemandItem[];
  currentSchedules: any[];
  previousSchedules: any[];
  ruleConfig: SmartSchedulingRuleConfig | null;
  availabilities: any[];
  timeOffs: any[];
  projectSkills: any[];
  resources: any[];
  resourceBookings: any[];
  versions: any[];
};

type Evaluation = {
  score: number;
  conflicts: ScheduleConflict[];
  demandSlots: DemandSlot[];
  summary: {
    reservationCoverageRate: number;
    peakCoverageRate: number;
    skillMatchRate: number;
    fairnessScore: number;
    estimatedLaborCost: number;
    hardConflictCount: number;
    softWarningCount: number;
    scheduledSlots: number;
  };
};

type SmartSchedulingAlternative = {
  id: string;
  name: string;
  mode: SmartSchedulingMode;
  score: number;
  summary: Evaluation['summary'];
  schedules: SmartScheduleItem[];
  conflicts: ScheduleConflict[];
  explanations: string[];
};

const ALGORITHM_VERSION = 'v2';
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
const CANCELLED_VERSION_STATUSES = ['rolled_back'];

@Injectable()
export class SmartSchedulingService {
  constructor(
    private prisma: PrismaService,
    private schedulingService: SchedulingService,
    private commissionService?: CommissionService,
  ) {}

  async oneClick(options: SmartSchedulingOptions) {
    const startedAt = Date.now();
    const context = await this.loadContext(options);
    const requestedMode = this.resolveMode(options.mode, context.ruleConfig);
    const modes = this.resolveAlternativeModes(requestedMode, Boolean(options.generateAlternatives));
    const alternatives = modes.map((mode, index) => this.buildAlternative(context, options, mode, index));
    alternatives.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const recommended = alternatives[0];
    if (!recommended) {
      throw new BadRequestException({ message: '无法生成可用排班方案', code: 'SMART_SCHEDULING_NO_SOLUTION' });
    }

    const runId = this.createRunId(context.storeId, context.weekStart);
    const runtimeMs = Date.now() - startedAt;
    const solverStatus: SolverStatus = runtimeMs > 30_000 ? 'timeout' : recommended.summary.hardConflictCount ? 'failed' : 'feasible';
    await this.safeRecordRun({
      runId,
      storeId: context.storeId,
      weekStart: context.weekStart,
      status: 'preview',
      options: { ...options, mode: requestedMode },
      schedules: recommended.schedules,
      evaluation: {
        score: recommended.score,
        conflicts: recommended.conflicts,
        demandSlots: this.buildDemandSlots(
          context.weekStart,
          context.reservations,
          this.countScheduledStaff(recommended.schedules),
          options,
          context.ruleConfig,
          context.historicalDemand,
        ),
        summary: recommended.summary,
      },
      alternatives,
      runtimeMs,
      solverStatus,
    });

    return {
      runId,
      algorithmVersion: ALGORITHM_VERSION,
      solverStatus,
      weekStart: context.weekStart,
      score: recommended.score,
      summary: recommended.summary,
      recommended,
      alternatives,
      schedules: recommended.schedules,
      warnings: recommended.conflicts.filter((item) => item.severity === 'soft'),
      conflicts: recommended.conflicts,
      explanations: recommended.explanations,
    };
  }

  async preview(options: SmartSchedulingOptions) {
    const result = await this.oneClick({
      ...options,
      mode: this.legacyModeToSmartMode(options.mode, options.objective),
      generateAlternatives: false,
    });
    return {
      runId: result.runId,
      weekStart: result.weekStart,
      score: result.score,
      summary: result.summary,
      schedules: result.schedules,
      warnings: result.warnings,
      conflicts: result.conflicts,
      explanations: result.explanations,
    };
  }

  async evaluate(options: SmartSchedulingOptions) {
    const context = await this.loadContext(options);
    const schedules = this.normalizeInputSchedules(options.schedules ?? []);
    const evaluation = this.evaluateSchedules(context, schedules, options);
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
    const run = options.runId ? await (this.prisma as any).smartSchedulingRun?.findUnique?.({ where: { runId: options.runId } }) : null;
    const alternatives = this.parseJsonArray<SmartSchedulingAlternative>(run?.alternatives);
    const selected = alternatives.find((item) => item.id === options.selectedAlternativeId) ?? alternatives[0];
    const sourceSchedules = options.schedules?.length
      ? options.schedules
      : selected?.schedules?.length
        ? selected.schedules
        : this.parseJsonArray<SmartScheduleItem>(run?.generatedSchedules);
    const schedules = this.normalizeInputSchedules(sourceSchedules);
    if (!schedules.length) {
      throw new BadRequestException({ message: '缺少待发布排班', code: 'SMART_SCHEDULING_EMPTY' });
    }

    const evaluation = this.evaluateSchedules(context, schedules, options);
    if (evaluation.summary.hardConflictCount > 0) {
      throw new BadRequestException({
        message: '存在硬冲突，不能发布排班',
        code: 'SMART_SCHEDULING_CONFLICT',
        conflicts: evaluation.conflicts.filter((item) => item.severity === 'hard'),
      });
    }

    const runId = options.runId ?? this.createRunId(context.storeId, context.weekStart);
    const version = await this.savePublishedVersion(context, schedules, runId, options.createdById);
    await this.recordRun({
      runId,
      storeId: context.storeId,
      weekStart: context.weekStart,
      status: 'published',
      options,
      schedules,
      evaluation,
      alternatives,
      confirmedAt: new Date(),
      publishedScheduleVersionId: version.id,
      solverStatus: 'feasible',
      runtimeMs: run?.runtimeMs ?? 0,
    });
    await this.linkVersionToRun(version.id, runId);

    if (this.commissionService) {
      await this.commissionService.recordAmiContribution({
        storeId: context.storeId,
        category: 'scheduling',
        triggerType: 'smart_scheduling',
        triggerId: this.hashTriggerId(runId),
        workMinutes: 15,
        metadata: { runId, weekStart: context.weekStart, versionId: version.id, savedCount: schedules.length, score: evaluation.score },
      });
    }

    return {
      runId,
      weekStart: context.weekStart,
      score: evaluation.score,
      summary: evaluation.summary,
      savedCount: schedules.length,
      version,
      schedules,
      warnings: evaluation.conflicts.filter((item) => item.severity === 'soft'),
      conflicts: evaluation.conflicts,
      explanations: this.buildExplanations(evaluation.demandSlots, evaluation.summary),
    };
  }

  async rollback(options: SmartSchedulingOptions) {
    const context = await this.loadContext(options);
    const targetVersionId = Number(options.targetVersionId);
    if (!targetVersionId) {
      throw new BadRequestException({ message: '缺少回滚版本', code: 'SCHEDULE_VERSION_REQUIRED' });
    }
    const target = await (this.prisma as any).scheduleVersion.findFirst({
      where: { id: targetVersionId, storeId: context.storeId, weekStart: new Date(context.weekStart) },
      include: { schedules: true },
    });
    if (!target) {
      throw new BadRequestException({ message: '目标排班版本不存在', code: 'SCHEDULE_VERSION_NOT_FOUND' });
    }
    const schedules = this.normalizeStoredSchedules(target.schedules).map((item) => ({ ...item, source: 'rollback' as const }));
    const evaluation = this.evaluateSchedules(context, schedules, options);
    if (evaluation.summary.hardConflictCount > 0) {
      throw new BadRequestException({
        message: '回滚版本与当前预约或规则存在硬冲突，不能回滚',
        code: 'SCHEDULE_ROLLBACK_CONFLICT',
        conflicts: evaluation.conflicts.filter((item) => item.severity === 'hard'),
      });
    }
    const runId = this.createRunId(context.storeId, context.weekStart);
    const version = await this.savePublishedVersion(context, schedules, runId, options.createdById, targetVersionId);
    await this.recordRun({
      runId,
      storeId: context.storeId,
      weekStart: context.weekStart,
      status: 'published',
      options: { ...options, mode: 'balanced' },
      schedules,
      evaluation,
      confirmedAt: new Date(),
      publishedScheduleVersionId: version.id,
      solverStatus: 'feasible',
    });
    await this.linkVersionToRun(version.id, runId);
    return {
      runId,
      weekStart: context.weekStart,
      score: evaluation.score,
      summary: evaluation.summary,
      version,
      schedules,
      warnings: evaluation.conflicts.filter((item) => item.severity === 'soft'),
      conflicts: evaluation.conflicts,
      explanations: this.buildExplanations(evaluation.demandSlots, evaluation.summary),
    };
  }

  async runs(options: SmartSchedulingOptions) {
    const storeId = Number(options.storeId);
    if (!storeId) {
      throw new BadRequestException({ message: '缺少门店信息', code: 'SMART_SCHEDULING_STORE_REQUIRED' });
    }
    const weekStart = this.toDateKey(options.weekStart);
    if (!weekStart) {
      throw new BadRequestException({ message: '缺少排班周起始日期', code: 'SMART_SCHEDULING_WEEK_REQUIRED' });
    }
    try {
      const [runs, versions] = await Promise.all([
        (this.prisma as any).smartSchedulingRun.findMany({
          where: { storeId, weekStart: new Date(weekStart) },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.loadScheduleVersions(storeId, weekStart, 20),
      ]);
      const currentVersion = versions.find((item: any) => item.status === 'published') ?? null;
      return { weekStart, runs, versions, currentVersion };
    } catch {
      return { weekStart, runs: [], versions: [], currentVersion: null };
    }
  }

  private async loadScheduleVersions(storeId: number, weekStart: string, take?: number) {
    try {
      return await ((this.prisma as any).scheduleVersion?.findMany?.({
        where: { storeId, weekStart: new Date(weekStart), status: { notIn: CANCELLED_VERSION_STATUSES } },
        orderBy: { createdAt: 'desc' },
        ...(take ? { take } : {}),
      }) ?? []);
    } catch {
      return [];
    }
  }

  async demand(options: SmartSchedulingOptions) {
    const context = await this.loadContext(options);
    const scheduledStaffBySlot = this.countScheduledStaff(this.buildVisibleScheduleItems(context));
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
        highLoadSlots: demandSlots.filter((item) => item.loadLevel === 'high').length,
        lowLoadSlots: demandSlots.filter((item) => item.loadLevel === 'low').length,
        matchedLoadSlots: demandSlots.filter((item) => item.loadLevel === 'medium').length,
      },
    };
  }

  private async loadContext(options: SmartSchedulingOptions): Promise<SmartSchedulingContext> {
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
    const historicalStart = this.addDays(weekStart, -56);
    const [
      beauticians,
      reservations,
      historicalReservations,
      currentSchedules,
      previousSchedules,
      ruleConfig,
      availabilities,
      timeOffs,
      resources,
      resourceBookings,
      versions,
    ] = await Promise.all([
      this.prisma.beautician.findMany({ where: { storeId, status: 'active', userId: { not: null } }, include: { level: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.reservation.findMany({
        where: { storeId, status: { in: Array.from(BOOKED_RESERVATION_STATUSES) }, date: { gte: new Date(weekStart), lt: new Date(weekEnd) } },
        include: { project: true, beautician: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.reservation.findMany({
        where: { storeId, status: { in: Array.from(BOOKED_RESERVATION_STATUSES) }, date: { gte: new Date(historicalStart), lt: new Date(weekStart) } },
        include: { project: true },
      }),
      this.loadSchedules(storeId, weekStart, weekEnd),
      this.loadSchedules(storeId, previousWeekStart, weekStart),
      this.loadRuleConfig(storeId),
      this.loadAvailabilities(storeId, weekStart, weekEnd),
      this.loadTimeOffs(storeId, weekStart, weekEnd),
      this.loadStoreResources(storeId),
      this.loadResourceBookings(storeId, weekStart, weekEnd),
      this.loadScheduleVersions(storeId, weekStart),
    ]);
    const projectSkills = await this.loadProjectSkills(storeId, reservations);
    return {
      storeId,
      weekStart,
      weekEnd,
      beauticians,
      reservations,
      historicalDemand: this.buildHistoricalDemand(historicalReservations),
      currentSchedules,
      previousSchedules,
      ruleConfig,
      availabilities,
      timeOffs,
      projectSkills,
      resources,
      resourceBookings,
      versions,
    };
  }

  private buildAlternative(context: SmartSchedulingContext, options: SmartSchedulingOptions, mode: SmartSchedulingMode, index: number): SmartSchedulingAlternative {
    const schedules = this.optimizeSchedules(context, { ...options, mode });
    const evaluation = this.evaluateSchedules(context, schedules, { ...options, mode });
    return {
      id: index === 0 ? 'recommended' : mode,
      name: this.modeLabel(mode),
      mode,
      score: evaluation.score,
      summary: evaluation.summary,
      schedules,
      conflicts: evaluation.conflicts,
      explanations: this.buildExplanations(evaluation.demandSlots, evaluation.summary),
    };
  }

  private optimizeSchedules(context: SmartSchedulingContext, options: SmartSchedulingOptions): SmartScheduleItem[] {
    const schedules = this.seedSchedules(context, options);
    const activeBeauticians = context.beauticians.filter((item) => this.isBeauticianActive(item.status));
    const load = this.countHoursByBeautician(schedules);

    for (const reservation of context.reservations) {
      const date = this.toDateKey(reservation.date);
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      const lockedBeauticianId = this.getLockedReservationBeautician(reservation, context.ruleConfig, options);
      const candidate = lockedBeauticianId
        ? activeBeauticians.find((item) => item.id === lockedBeauticianId)
        : this.pickBeautician(activeBeauticians, schedules, load, { date, startTime, endTime, reservation }, context, options);
      if (!candidate) continue;
      const item: SmartScheduleItem = {
        beauticianId: candidate.id,
        date,
        startTime,
        endTime,
        status: 'available',
        source: 'reservation',
        reservationId: reservation.id,
      };
      if (!schedules.some((existing) => this.scheduleKey(existing) === this.scheduleKey(item))) {
        schedules.push(item);
        load.set(candidate.id, (load.get(candidate.id) ?? 0) + this.durationHours(item));
      }
    }

    const demandSlots = this.buildDemandSlots(
      context.weekStart,
      context.reservations,
      this.countScheduledStaff(schedules),
      options,
      context.ruleConfig,
      context.historicalDemand,
    );
    for (const demand of demandSlots) {
      const targetStaff = options.mode === 'cost_first' && demand.expectedReservations === 0 ? 0 : demand.requiredStaff;
      let scheduled = schedules.filter((item) => item.date === demand.date && this.isWorkingStatus(item.status) && this.overlaps(item.startTime, item.endTime, demand.startTime, demand.endTime)).length;
      while (scheduled < targetStaff) {
        const candidate = this.pickBeautician(activeBeauticians, schedules, load, demand, context, options);
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
        load.set(candidate.id, (load.get(candidate.id) ?? 0) + this.durationHours(item));
        scheduled += 1;
      }
    }

    return this.dedupeSchedules(schedules).sort((a, b) =>
      `${a.date} ${a.startTime} ${a.beauticianId}`.localeCompare(`${b.date} ${b.startTime} ${b.beauticianId}`),
    );
  }

  private seedSchedules(context: SmartSchedulingContext, options: SmartSchedulingOptions) {
    const pinned = this.normalizeStoredSchedules(context.currentSchedules.filter((item) => item.status === 'leave' || item.locked)).map((item) => ({
      ...item,
      status: this.normalizeStatus(item.status),
      source: item.source ?? 'existing',
    }));
    const source = options.mode === 'cost_first'
      ? []
      : options.mode === 'fairness_first'
        ? context.currentSchedules
        : context.previousSchedules;
    const carried = this.normalizeStoredSchedules(source).map((item) => ({
      ...item,
      date: source === context.previousSchedules ? this.addDays(context.weekStart, this.daysBetween(this.addDays(context.weekStart, -7), item.date)) : item.date,
      status: this.normalizeStatus(item.status),
      source: item.source ?? 'existing',
    }));
    return this.dedupeSchedules([...pinned, ...carried]);
  }

  private evaluateSchedules(context: SmartSchedulingContext, schedules: SmartScheduleItem[], options: SmartSchedulingOptions): Evaluation {
    const normalized = this.normalizeInputSchedules(schedules);
    const conflicts = this.detectConflicts(context, normalized);
    const demandSlots = this.buildDemandSlots(
      context.weekStart,
      context.reservations,
      this.countScheduledStaff(normalized),
      options,
      context.ruleConfig,
      context.historicalDemand,
    );
    const hardConflictCount = conflicts.filter((item) => item.severity === 'hard').length;
    const softWarningCount = conflicts.filter((item) => item.severity === 'soft').length;
    const reservationCoverageRate = this.calculateReservationCoverage(context.reservations, normalized);
    const peakCoverageRate = this.calculatePeakCoverage(demandSlots);
    const fairnessScore = this.calculateFairnessScore(normalized, context.beauticians.filter((item) => this.isBeauticianActive(item.status)).map((item) => item.id));
    const skillMatchRate = this.calculateSkillScore(context.reservations, normalized, context.projectSkills);
    const estimatedLaborCost = Math.round(this.countTotalHours(normalized) * 80);
    const weights = this.getWeights(this.resolveMode(options.mode, context.ruleConfig), context.ruleConfig);
    const conflictScore = Math.max(0, 1 - hardConflictCount * 0.35 - softWarningCount * 0.08);
    const costScore = Math.max(0, 1 - Math.max(0, normalized.length - context.reservations.length) / Math.max(1, normalized.length));
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          reservationCoverageRate * weights.reservation +
            peakCoverageRate * weights.peak +
            fairnessScore * weights.fairness +
            skillMatchRate * weights.skill +
            costScore * weights.cost +
            conflictScore * weights.stability,
        ),
      ),
    );
    return {
      score,
      conflicts,
      demandSlots,
      summary: {
        reservationCoverageRate,
        peakCoverageRate,
        skillMatchRate,
        fairnessScore,
        estimatedLaborCost,
        hardConflictCount,
        softWarningCount,
        scheduledSlots: normalized.length,
      },
    };
  }

  private detectConflicts(context: SmartSchedulingContext, schedules: SmartScheduleItem[]): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const beauticianById = new Map(context.beauticians.map((item) => [item.id, item]));
    const seen = new Set<string>();
    for (const item of schedules) {
      const beautician = beauticianById.get(item.beauticianId);
      const key = this.scheduleKey(item);
      if (seen.has(key)) conflicts.push(this.conflict('duplicate_slot', 'hard', `美容师 ${item.beauticianId} 在 ${item.date} ${item.startTime}-${item.endTime} 重复排班`, item));
      seen.add(key);
      if (!beautician || !this.isBeauticianActive(beautician.status)) conflicts.push(this.conflict('inactive_beautician', 'hard', `美容师 ${item.beauticianId} 不可排班`, item));
      if (this.isWorkingStatus(item.status) && !this.isWithinBusinessHours(item.startTime, item.endTime, context.ruleConfig)) conflicts.push(this.conflict('outside_business_hours', 'hard', `美容师 ${item.beauticianId} 在 ${item.date} ${item.startTime}-${item.endTime} 超出营业时间`, item));
      if (this.overlapsTimeOff(item, context.timeOffs) && this.isWorkingStatus(item.status)) conflicts.push(this.conflict('leave_overlap', 'hard', `美容师 ${item.beauticianId} 在 ${item.date} ${item.startTime}-${item.endTime} 与请假冲突`, item));
      if (!this.isBeauticianAvailableForSlot(item.beauticianId, item, context.availabilities, context.timeOffs) && this.isWorkingStatus(item.status)) conflicts.push(this.conflict('leave_overlap', 'hard', `美容师 ${item.beauticianId} 在 ${item.date} ${item.startTime}-${item.endTime} 不可用`, item));
      const overlapped = schedules.find((other) => other !== item && other.beauticianId === item.beauticianId && other.date === item.date && this.overlaps(other.startTime, other.endTime, item.startTime, item.endTime));
      if (overlapped && this.scheduleKey(overlapped) < key) conflicts.push(this.conflict('duplicate_slot', 'hard', `美容师 ${item.beauticianId} 在 ${item.date} 存在重叠排班`, item));
    }
    this.addHoursConflicts(context, schedules, conflicts);
    this.addReservationConflicts(context, schedules, conflicts);
    this.addResourceConflicts(context, conflicts);
    return conflicts;
  }

  private addReservationConflicts(context: SmartSchedulingContext, schedules: SmartScheduleItem[], conflicts: ScheduleConflict[]) {
    for (const reservation of context.reservations) {
      const date = this.toDateKey(reservation.date);
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      const matching = schedules.filter((item) => item.date === date && this.covers(item, startTime, endTime) && this.isWorkingStatus(item.status));
      const assignedMatch = matching.find((item) => item.reservationId === reservation.id)
        ?? (reservation.beauticianId ? matching.find((item) => item.beauticianId === reservation.beauticianId) : matching[0]);
      if (!assignedMatch) {
        conflicts.push({
          type: reservation.beauticianId ? 'uncovered_reservation' : 'unassigned_reservation',
          severity: CONFIRMED_RESERVATION_STATUSES.has(reservation.status) ? 'hard' : 'soft',
          message: `预约 ${reservation.id} 未被排班覆盖`,
          beauticianId: reservation.beauticianId ?? undefined,
          date,
          startTime,
          endTime,
          reservationId: reservation.id,
        });
      }
      const skill = this.findProjectSkill(context.projectSkills, reservation.projectId, assignedMatch?.beauticianId ?? reservation.beauticianId);
      if (assignedMatch && !this.isSkillQualified(context.projectSkills, reservation.projectId, skill)) {
        conflicts.push({
          type: 'skill_mismatch',
          severity: this.projectHasSkillConfig(context.projectSkills, reservation.projectId) ? 'hard' : 'soft',
          message: `预约 ${reservation.id} 的项目与美容师 ${assignedMatch.beauticianId} 技能匹配不足`,
          beauticianId: assignedMatch.beauticianId,
          date,
          startTime,
          endTime,
          reservationId: reservation.id,
        });
      }
    }
  }

  private addHoursConflicts(context: SmartSchedulingContext, schedules: SmartScheduleItem[], conflicts: ScheduleConflict[]) {
    const maxDaily = Number(context.ruleConfig?.maxDailyHours ?? 0);
    const maxWeekly = Number(context.ruleConfig?.maxWeeklyHours ?? 0);
    const minRest = Number(context.ruleConfig?.minRestMinutes ?? 0);
    const byBeautician = this.groupSchedulesByBeautician(schedules.filter((item) => this.isWorkingStatus(item.status)));
    for (const [beauticianId, items] of byBeautician.entries()) {
      const weekly = items.reduce((sum, item) => sum + this.durationHours(item), 0);
      if (maxWeekly && weekly > maxWeekly) conflicts.push({ type: 'max_weekly_hours', severity: 'hard', message: `美容师 ${beauticianId} 周工时 ${weekly}h 超过上限 ${maxWeekly}h`, beauticianId });
      const byDate = new Map<string, SmartScheduleItem[]>();
      for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
      for (const [date, dayItems] of byDate.entries()) {
        const daily = dayItems.reduce((sum, item) => sum + this.durationHours(item), 0);
        if (maxDaily && daily > maxDaily) conflicts.push({ type: 'max_daily_hours', severity: 'hard', message: `美容师 ${beauticianId} ${date} 工时 ${daily}h 超过上限 ${maxDaily}h`, beauticianId, date });
        if (minRest) {
          const sorted = dayItems.sort((a, b) => this.toMinutes(a.startTime) - this.toMinutes(b.startTime));
          for (let index = 1; index < sorted.length; index += 1) {
            const rest = this.toMinutes(sorted[index].startTime) - this.toMinutes(sorted[index - 1].endTime);
            if (rest >= 0 && rest < minRest) conflicts.push(this.conflict('min_rest_minutes', 'hard', `美容师 ${beauticianId} ${date} 休息间隔不足 ${minRest} 分钟`, sorted[index]));
          }
        }
      }
    }
  }

  private addResourceConflicts(context: SmartSchedulingContext, conflicts: ScheduleConflict[]) {
    const capacity = context.resources.length;
    if (!capacity) {
      conflicts.push({ type: 'no_resource_config', severity: 'soft', message: '门店未配置房间/床位资源，资源容量按提醒处理' });
      return;
    }
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = this.addDays(context.weekStart, dayIndex);
      for (const [startTime, endTime] of DEFAULT_SLOTS) {
        const reservationCount = context.reservations.filter((item) => this.toDateKey(item.date) === date && this.overlaps(item.startTime || this.toTimeKey(item.date), item.endTime || this.addMinutes(item.startTime || this.toTimeKey(item.date), Number(item.project?.duration ?? 60)), startTime, endTime)).length;
        const reservationIds = new Set(context.reservations.map((item) => Number(item.id)));
        const bookingCount = context.resourceBookings.filter((item) => {
          const sourceType = String(item.sourceType ?? item.source ?? '').toLowerCase();
          const sourceId = Number(item.sourceId ?? item.reservationId ?? 0);
          return !(sourceType.includes('reservation') && reservationIds.has(sourceId))
            && this.toDateKey(item.date) === date
            && this.overlaps(item.startTime, item.endTime, startTime, endTime);
        }).length;
        if (reservationCount + bookingCount > capacity) {
          conflicts.push({ type: 'resource_capacity', severity: 'hard', message: `${date} ${startTime}-${endTime} 房间/床位容量不足`, date, startTime, endTime });
        }
      }
    }
  }

  private async savePublishedVersion(context: SmartSchedulingContext, schedules: SmartScheduleItem[], runId: string, publishedById?: number, rollbackFromVersionId?: number) {
    const delegate = (this.prisma as any);
    return delegate.$transaction(async (tx: any) => {
      await tx.scheduleVersion.updateMany({
        where: { storeId: context.storeId, weekStart: new Date(context.weekStart), status: 'published' },
        data: { status: rollbackFromVersionId ? 'rolled_back' : 'superseded' },
      });
      const version = await tx.scheduleVersion.create({
        data: {
          storeId: context.storeId,
          weekStart: new Date(context.weekStart),
          status: 'published',
          sourceRunId: null,
          publishedById: publishedById ? Number(publishedById) : null,
          publishedAt: new Date(),
          rollbackFromVersionId: rollbackFromVersionId ?? null,
        },
      });
      await tx.schedule.deleteMany({ where: { storeId: context.storeId, date: { gte: new Date(context.weekStart), lt: new Date(context.weekEnd) } } });
      if (schedules.length) {
        await tx.schedule.createMany({
          data: schedules.map((item) => ({
            storeId: context.storeId,
            beauticianId: item.beauticianId,
            date: new Date(item.date),
            startTime: item.startTime,
            endTime: item.endTime,
            status: this.normalizeStatus(item.status),
            source: item.source ?? 'smart',
            locked: Boolean(context.ruleConfig?.lockedAfterPublished),
            versionId: version.id,
            optimizationRunId: runId,
            smartRunId: runId,
          })),
        });
      }
      return version;
    });
  }

  private async linkVersionToRun(versionId: number, runId: string) {
    const delegate = (this.prisma as any).scheduleVersion;
    if (!delegate?.update) return;
    await delegate.update({ where: { id: versionId }, data: { sourceRunId: runId } });
  }

  private async loadRuleConfig(storeId: number): Promise<SmartSchedulingRuleConfig | null> {
    const delegate = (this.prisma as any).schedulingRuleConfig;
    if (!delegate?.findFirst) return null;
    let config: any = null;
    try {
      config = await delegate.findFirst({
        where: { storeId, status: 'active' },
        select: {
          businessStartTime: true,
          businessEndTime: true,
          slotMinutes: true,
          peakRules: true,
          defaultMinStaff: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    } catch {
      return null;
    }
    if (!config) return null;
    return {
      businessStartTime: config.businessStartTime,
      businessEndTime: config.businessEndTime,
      slotMinutes: config.slotMinutes,
      peakRules: Array.isArray(config.peakRules) ? config.peakRules : null,
      maxDailyHours: null,
      maxWeeklyHours: null,
      minRestMinutes: null,
      defaultMinStaff: config.defaultMinStaff,
      algorithmMode: null,
      objectiveWeights: null,
      allowReassignUnconfirmedReservation: undefined,
      allowReassignConfirmedReservation: undefined,
      walkInBufferRules: null,
      lockedAfterPublished: false,
    };
  }

  private async loadSchedules(storeId: number, startDate: string, endDate: string) {
    return this.prisma.schedule.findMany({
      where: { storeId, date: { gte: new Date(startDate), lt: new Date(endDate) } },
      select: {
        id: true,
        storeId: true,
        beauticianId: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        smartRunId: true,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  private async loadAvailabilities(storeId: number, weekStart: string, weekEnd: string) {
    const delegate = (this.prisma as any).beauticianAvailability;
    if (!delegate?.findMany) return [];
    try {
      return await delegate.findMany({
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
    } catch {
      return [];
    }
  }

  private async loadTimeOffs(storeId: number, weekStart: string, weekEnd: string) {
    const delegate = (this.prisma as any).beauticianTimeOff;
    if (!delegate?.findMany) return [];
    try {
      return await delegate.findMany({ where: { storeId, status: { in: ['approved', 'active'] }, date: { gte: new Date(weekStart), lt: new Date(weekEnd) } } });
    } catch {
      return [];
    }
  }

  private async loadProjectSkills(storeId: number, reservations: any[]) {
    const delegate = (this.prisma as any).beauticianProjectSkill;
    if (!delegate?.findMany) return [];
    const projectIds = Array.from(new Set(reservations.map((item) => Number(item.projectId)).filter((id) => id > 0)));
    if (!projectIds.length) return [];
    try {
      return await delegate.findMany({
        where: { projectId: { in: projectIds }, project: { storeId } },
        select: { beauticianId: true, projectId: true, skillLevel: true, certified: true, priority: true },
      });
    } catch {
      return [];
    }
  }

  private async loadStoreResources(storeId: number) {
    const delegate = (this.prisma as any).storeResource;
    if (!delegate?.findMany) return [];
    try {
      return await delegate.findMany({
        where: { storeId, status: 'active', type: { in: ['room', 'bed'] } },
        orderBy: [{ type: 'asc' }, { id: 'asc' }],
      });
    } catch {
      return [];
    }
  }

  private async loadResourceBookings(storeId: number, weekStart: string, weekEnd: string) {
    const delegate = (this.prisma as any).resourceBooking;
    if (!delegate?.findMany) return [];
    try {
      return await delegate.findMany({ where: { storeId, status: 'active', date: { gte: new Date(weekStart), lt: new Date(weekEnd) } } });
    } catch {
      return [];
    }
  }

  private async safeRecordRun(data: Parameters<SmartSchedulingService['recordRun']>[0]) {
    try {
      await this.recordRun(data);
    } catch {
      return;
    }
  }

  private async recordRun(data: {
    runId: string;
    storeId: number;
    weekStart: string;
    status: 'preview' | 'published';
    options: SmartSchedulingOptions;
    schedules: SmartScheduleItem[];
    evaluation: Evaluation;
    alternatives?: SmartSchedulingAlternative[];
    confirmedAt?: Date;
    runtimeMs?: number;
    solverStatus?: SolverStatus;
    publishedScheduleVersionId?: number;
  }) {
    const delegate = (this.prisma as any).smartSchedulingRun;
    if (!delegate?.upsert) return;
    const mode = this.resolveMode(data.options.mode, null);
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
      algorithmVersion: ALGORITHM_VERSION,
      mode,
      objectiveWeights: this.getWeights(mode, null),
      inputSummary: this.buildInputSummary(data.options),
      solutionSummary: data.evaluation.summary,
      alternatives: data.alternatives ?? [],
      runtimeMs: data.runtimeMs ?? null,
      solverStatus: data.solverStatus ?? 'feasible',
      publishedScheduleVersionId: data.publishedScheduleVersionId ?? null,
      createdById: data.options.createdById ? Number(data.options.createdById) : null,
      confirmedAt: data.confirmedAt ?? null,
    };
    await delegate.upsert({ where: { runId: data.runId }, create: { runId: data.runId, ...payload }, update: payload });
  }

  private buildDemandSlots(weekStart: string, reservations: any[], scheduledStaffBySlot: Map<string, number>, options: SmartSchedulingOptions, ruleConfig?: SmartSchedulingRuleConfig | null, historicalDemand: HistoricalDemandItem[] = []): DemandSlot[] {
    return Array.from({ length: 7 }, (_, dayIndex) => {
      const date = this.addDays(weekStart, dayIndex);
      return DEFAULT_SLOTS.filter(([startTime, endTime]) => this.isWithinBusinessHours(startTime, endTime, ruleConfig) && !this.isPastSlot(date, endTime)).map(([startTime, endTime]) => {
        const currentReservations = reservations.filter((item) => this.toDateKey(item.date) === date && this.overlaps(item.startTime || this.toTimeKey(item.date), item.endTime || this.addMinutes(item.startTime || this.toTimeKey(item.date), Number(item.project?.duration ?? 60)), startTime, endTime)).length;
        const historicalExpected = this.getHistoricalExpectedReservations(historicalDemand, dayIndex + 1, startTime, endTime);
        const walkInBuffer = this.getWalkInBuffer(ruleConfig, dayIndex + 1, startTime, endTime);
        const expectedReservations = Math.max(currentReservations, historicalExpected);
        const configuredMinStaff = this.getConfiguredMinStaff(options, ruleConfig, dayIndex + 1, startTime, endTime);
        const requiredStaff = Math.max(configuredMinStaff, expectedReservations + walkInBuffer, expectedReservations > 0 ? 1 : 0);
        const scheduledStaff = scheduledStaffBySlot.get(this.slotKey(date, startTime, endTime)) ?? 0;
        const level: DemandSlot['level'] = requiredStaff >= 3 || expectedReservations >= 5 ? 'high' : requiredStaff >= 2 || expectedReservations >= 2 ? 'medium' : 'low';
        const expectedServiceDemand = expectedReservations;
        const requiredServiceCapacity = requiredStaff;
        const scheduledServiceCapacity = scheduledStaff;
        const load = this.resolveDemandLoad(requiredServiceCapacity, scheduledServiceCapacity);
        return {
          date,
          startTime,
          endTime,
          expectedReservations,
          requiredStaff,
          scheduledStaff,
          expectedServiceDemand,
          requiredServiceCapacity,
          scheduledServiceCapacity,
          level,
          ...load,
        };
      });
    }).flat();
  }

  private resolveDemandLoad(requiredServiceCapacity: number, scheduledServiceCapacity: number): Pick<DemandSlot, 'staffDelta' | 'loadRatio' | 'loadLevel' | 'recommendedAction'> {
    const staffDelta = scheduledServiceCapacity - requiredServiceCapacity;
    const loadRatio = requiredServiceCapacity <= 0 && scheduledServiceCapacity <= 0 ? 0 : requiredServiceCapacity / Math.max(scheduledServiceCapacity, 1);
    const loadLevel: DemandLoadLevel = staffDelta > 0 ? 'low' : staffDelta < 0 ? 'high' : 'medium';
    const recommendedAction: DemandRecommendedAction = loadLevel === 'low' ? 'fill_gap' : loadLevel === 'high' ? 'add_staff' : 'keep';
    return { staffDelta, loadRatio, loadLevel, recommendedAction };
  }

  private isPastSlot(date: string, endTime: string) {
    const today = formatBusinessDate(new Date());
    if (date < today) return true;
    if (date > today) return false;
    return this.toMinutes(endTime) <= this.toMinutes(this.toTimeKey(new Date()));
  }

  private pickBeautician(beauticians: any[], schedules: SmartScheduleItem[], load: Map<number, number>, slot: { date: string; startTime: string; endTime: string; reservation?: any }, context: SmartSchedulingContext, options: SmartSchedulingOptions) {
    return beauticians
      .filter((beautician) => this.isCandidateValid(beautician.id, slot, schedules, context, options))
      .sort((a, b) => this.candidateScore(b, slot, load, context, options) - this.candidateScore(a, slot, load, context, options) || a.id - b.id)[0];
  }

  private isCandidateValid(beauticianId: number, slot: { date: string; startTime: string; endTime: string; reservation?: any }, schedules: SmartScheduleItem[], context: SmartSchedulingContext, options: SmartSchedulingOptions) {
    if (!this.isBeauticianAvailableForSlot(beauticianId, slot, context.availabilities, context.timeOffs)) return false;
    if (!this.isWithinBusinessHours(slot.startTime, slot.endTime, context.ruleConfig)) return false;
    if (schedules.some((item) => item.beauticianId === beauticianId && item.date === slot.date && this.overlaps(item.startTime, item.endTime, slot.startTime, slot.endTime))) return false;
    if (slot.reservation && !this.isSkillQualified(context.projectSkills, slot.reservation.projectId, this.findProjectSkill(context.projectSkills, slot.reservation.projectId, beauticianId))) return false;
    const withCandidate = [...schedules, { beauticianId, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, status: 'available' }];
    const conflicts: ScheduleConflict[] = [];
    this.addHoursConflicts(context, withCandidate, conflicts);
    return !conflicts.some((item) => item.severity === 'hard' && item.beauticianId === beauticianId);
  }

  private candidateScore(beautician: any, slot: { reservation?: any }, load: Map<number, number>, context: SmartSchedulingContext, options: SmartSchedulingOptions) {
    const mode = this.resolveMode(options.mode, context.ruleConfig);
    const skill = slot.reservation ? this.findProjectSkill(context.projectSkills, slot.reservation.projectId, beautician.id) : undefined;
    const skillScore = skill ? Number(skill.skillLevel ?? 1) * 10 + (skill.certified ? 20 : 0) + Number(skill.priority ?? 0) : 5;
    const loadPenalty = load.get(beautician.id) ?? 0;
    const fairnessWeight = mode === 'fairness_first' ? 4 : 1;
    const skillWeight = mode === 'reservation_first' ? 3 : 1;
    return skillScore * skillWeight - loadPenalty * fairnessWeight;
  }

  private getLockedReservationBeautician(reservation: any, ruleConfig: SmartSchedulingRuleConfig | null, options: SmartSchedulingOptions) {
    if (!reservation.beauticianId) return null;
    if (CONFIRMED_RESERVATION_STATUSES.has(reservation.status)) {
      return ruleConfig?.allowReassignConfirmedReservation || options.keepConfirmedReservations === false ? null : reservation.beauticianId;
    }
    return ruleConfig?.allowReassignUnconfirmedReservation === false ? reservation.beauticianId : null;
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
    return Array.from(counts.values()).map((item) => ({ weekday: item.weekday, startTime: item.startTime, endTime: item.endTime, expectedReservations: Math.ceil(item.count / Math.max(1, item.weeks.size)) }));
  }

  private getHistoricalExpectedReservations(demand: HistoricalDemandItem[], weekday: number, startTime: string, endTime: string) {
    return demand.filter((item) => item.weekday === weekday && this.overlaps(item.startTime, item.endTime, startTime, endTime)).reduce((max, item) => Math.max(max, item.expectedReservations), 0);
  }

  private buildExplanations(demandSlots: DemandSlot[], summary: Evaluation['summary']) {
    const highDemand = demandSlots.filter((item) => item.level === 'high');
    const underStaffed = demandSlots.filter((item) => item.scheduledStaff < item.requiredStaff);
    const explanations = [
      `预约覆盖率 ${Math.round(summary.reservationCoverageRate * 100)}%，高峰覆盖率 ${Math.round(summary.peakCoverageRate * 100)}%，技能匹配率 ${Math.round(summary.skillMatchRate * 100)}%。`,
      `预计人力成本 ¥${summary.estimatedLaborCost}，工时公平度 ${Math.round(summary.fairnessScore * 100)}%。`,
    ];
    if (highDemand.length) explanations.push(`本周识别到 ${highDemand.length} 个高需求时段，优先补齐这些时段的人手。`);
    if (underStaffed.length) explanations.push(`仍有 ${underStaffed.length} 个时段人手低于建议值，发布前建议重点检查。`);
    if (summary.hardConflictCount) explanations.push(`存在 ${summary.hardConflictCount} 个硬冲突，当前方案不能发布。`);
    return explanations;
  }

  private calculateReservationCoverage(reservations: any[], schedules: SmartScheduleItem[]) {
    if (!reservations.length) return 1;
    const covered = reservations.filter((reservation) => {
      const date = this.toDateKey(reservation.date);
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      return schedules.some((item) => item.date === date && this.isWorkingStatus(item.status) && this.covers(item, startTime, endTime) && (item.reservationId === reservation.id || !reservation.beauticianId || item.beauticianId === reservation.beauticianId));
    }).length;
    return covered / reservations.length;
  }

  private calculatePeakCoverage(demandSlots: DemandSlot[]) {
    const required = demandSlots.filter((item) => item.requiredStaff > 0);
    if (!required.length) return 1;
    return Number((required.reduce((sum, item) => sum + Math.min(1, item.scheduledStaff / item.requiredStaff), 0) / required.length).toFixed(2));
  }

  private calculateFairnessScore(schedules: SmartScheduleItem[], beauticianIds: number[]) {
    const activeIds = beauticianIds.length ? beauticianIds : Array.from(new Set(schedules.map((item) => item.beauticianId)));
    if (activeIds.length <= 1) return 1;
    const loads = activeIds.map((id) => this.countHoursByBeautician(schedules).get(id) ?? 0);
    const max = Math.max(...loads);
    const min = Math.min(...loads);
    return max === 0 ? 1 : Math.max(0, 1 - (max - min) / Math.max(max, 1));
  }

  private calculateSkillScore(reservations: any[], schedules: SmartScheduleItem[], skills: any[]) {
    const configured = reservations.filter((item) => this.projectHasSkillConfig(skills, item.projectId));
    if (!configured.length) return 1;
    const qualified = configured.filter((reservation) => {
      const date = this.toDateKey(reservation.date);
      const startTime = reservation.startTime || this.toTimeKey(reservation.date);
      const endTime = reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60));
      const covered = schedules.find((item) => item.date === date && this.isWorkingStatus(item.status) && this.covers(item, startTime, endTime));
      return covered && this.isSkillQualified(skills, reservation.projectId, this.findProjectSkill(skills, reservation.projectId, covered.beauticianId));
    }).length;
    return qualified / configured.length;
  }

  private resolveMode(mode?: string, ruleConfig?: SmartSchedulingRuleConfig | null): SmartSchedulingMode {
    const value = String(mode || ruleConfig?.algorithmMode || 'balanced');
    if (['balanced', 'reservation_first', 'peak_first', 'cost_first', 'fairness_first'].includes(value)) return value as SmartSchedulingMode;
    return this.legacyModeToSmartMode(value as LegacyMode, undefined);
  }

  private legacyModeToSmartMode(mode?: string, objective?: string): SmartSchedulingMode {
    if (objective === 'cover_peak') return 'peak_first';
    if (objective === 'fairness') return 'fairness_first';
    if (objective === 'reduce_staff') return 'cost_first';
    return 'reservation_first';
  }

  private resolveAlternativeModes(primary: SmartSchedulingMode, generateAlternatives: boolean) {
    if (!generateAlternatives) return [primary];
    return Array.from(new Set([primary, 'cost_first', 'peak_first', 'fairness_first'] as SmartSchedulingMode[]));
  }

  private getWeights(mode: SmartSchedulingMode, ruleConfig: SmartSchedulingRuleConfig | null) {
    const configured = ruleConfig?.objectiveWeights;
    if (configured && typeof configured === 'object') return { reservation: 30, peak: 20, fairness: 15, skill: 15, cost: 10, stability: 10, ...configured };
    const presets: Record<SmartSchedulingMode, { reservation: number; peak: number; fairness: number; skill: number; cost: number; stability: number }> = {
      balanced: { reservation: 30, peak: 20, fairness: 15, skill: 15, cost: 10, stability: 10 },
      reservation_first: { reservation: 40, peak: 15, fairness: 10, skill: 20, cost: 5, stability: 10 },
      peak_first: { reservation: 25, peak: 35, fairness: 10, skill: 10, cost: 5, stability: 15 },
      cost_first: { reservation: 30, peak: 10, fairness: 10, skill: 10, cost: 30, stability: 10 },
      fairness_first: { reservation: 25, peak: 15, fairness: 30, skill: 10, cost: 10, stability: 10 },
    };
    return presets[mode];
  }

  private modeLabel(mode: SmartSchedulingMode) {
    return {
      balanced: '推荐方案',
      reservation_first: '覆盖更高方案',
      peak_first: '高峰保障方案',
      cost_first: '成本更低方案',
      fairness_first: '更公平方案',
    }[mode];
  }

  private getConfiguredMinStaff(options: SmartSchedulingOptions, ruleConfig: SmartSchedulingRuleConfig | null | undefined, weekday: number, startTime: string, endTime: string) {
    const peakRules = options.peakMinStaff?.length ? options.peakMinStaff : (ruleConfig?.peakRules ?? []);
    const matched = peakRules.find((item) => item.weekday === weekday && this.overlaps(item.startTime, item.endTime, startTime, endTime));
    return Number(matched?.minStaff ?? ruleConfig?.defaultMinStaff ?? 0);
  }

  private getWalkInBuffer(ruleConfig: SmartSchedulingRuleConfig | null | undefined, weekday: number, startTime: string, endTime: string) {
    const matched = ruleConfig?.walkInBufferRules?.find((item) => (!item.weekday || item.weekday === weekday) && this.overlaps(item.startTime, item.endTime, startTime, endTime));
    return Number(matched?.buffer ?? 0);
  }

  private isBeauticianAvailableForSlot(beauticianId: number, slot: { date: string; startTime: string; endTime: string }, availabilities: any[], timeOffs: any[]) {
    const weekday = new Date(slot.date).getDay() || 7;
    const relevantAvailability = availabilities.filter((item) => item.beauticianId === beauticianId && Number(item.weekday) === weekday);
    if (relevantAvailability.some((item) => item.type === 'unavailable' && this.overlaps(item.startTime, item.endTime, slot.startTime, slot.endTime))) return false;
    const availableRules = relevantAvailability.filter((item) => item.type === 'available' || item.type === 'preferred');
    if (availableRules.length && !availableRules.some((item) => this.coversTime(item.startTime, item.endTime, slot.startTime, slot.endTime))) return false;
    return !timeOffs.some((item) => item.beauticianId === beauticianId && this.toDateKey(item.date) === slot.date && ['approved', 'active'].includes(String(item.status)) && this.overlaps(item.startTime, item.endTime, slot.startTime, slot.endTime));
  }

  private overlapsTimeOff(item: SmartScheduleItem, timeOffs: any[]) {
    return timeOffs.some((entry) => entry.beauticianId === item.beauticianId && this.toDateKey(entry.date) === item.date && ['approved', 'active'].includes(String(entry.status)) && this.overlaps(entry.startTime, entry.endTime, item.startTime, item.endTime));
  }

  private isWithinBusinessHours(startTime: string, endTime: string, ruleConfig?: SmartSchedulingRuleConfig | null) {
    if (!ruleConfig?.businessStartTime || !ruleConfig?.businessEndTime) return true;
    return this.toMinutes(startTime) >= this.toMinutes(ruleConfig.businessStartTime) && this.toMinutes(endTime) <= this.toMinutes(ruleConfig.businessEndTime);
  }

  private normalizeInputSchedules(schedules: SmartScheduleItem[]) {
    return schedules.map((item) => ({ beauticianId: Number(item.beauticianId), date: this.toDateKey(item.date), startTime: item.startTime, endTime: item.endTime, status: this.normalizeStatus(item.status), source: item.source, reservationId: item.reservationId })).filter((item) => item.beauticianId && item.date && item.startTime && item.endTime);
  }

  private normalizeStoredSchedules(schedules: Array<{ beauticianId: number; date: Date | string; startTime: string; endTime: string; status: string; source?: string; reservationId?: number }>) {
    return schedules.map((item) => ({ beauticianId: item.beauticianId, date: this.toDateKey(item.date), startTime: item.startTime, endTime: item.endTime, status: this.normalizeStatus(item.status), source: (item.source as SmartScheduleItem['source']) ?? 'existing', reservationId: item.reservationId }));
  }

  private buildVisibleScheduleItems(context: SmartSchedulingContext) {
    const reservationSchedules = context.reservations
      .filter((reservation) => reservation.beauticianId)
      .map((reservation) => {
        const startTime = reservation.startTime || this.toTimeKey(reservation.date);
        return {
          beauticianId: Number(reservation.beauticianId),
          date: this.toDateKey(reservation.date),
          startTime,
          endTime: reservation.endTime || this.addMinutes(startTime, Number(reservation.project?.duration ?? 60)),
          status: 'booked',
          source: 'reservation' as const,
          reservationId: reservation.id,
        };
      });
    return this.normalizeInputSchedules([
      ...this.normalizeStoredSchedules(context.currentSchedules),
      ...reservationSchedules,
    ]);
  }

  private normalizeStatus(status: unknown) {
    const value = String(status ?? '').toLowerCase();
    if (['leave', 'busy', 'off', '请假', '忙碌'].includes(value)) return 'leave';
    return 'available';
  }

  private countScheduledStaff(schedules: SmartScheduleItem[]) {
    const counts = new Map<string, number>();
    const counted = new Set<string>();
    for (const item of schedules) {
      if (!this.isWorkingStatus(item.status)) continue;
      for (const [startTime, endTime] of DEFAULT_SLOTS) {
        if (this.overlaps(item.startTime, item.endTime, startTime, endTime)) {
          const key = this.slotKey(item.date, startTime, endTime);
          const staffKey = `${key}:${item.beauticianId}`;
          if (counted.has(staffKey)) continue;
          counted.add(staffKey);
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

  private countTotalHours(schedules: SmartScheduleItem[]) {
    return schedules.filter((item) => this.isWorkingStatus(item.status)).reduce((sum, item) => sum + this.durationHours(item), 0);
  }

  private groupSchedulesByBeautician(schedules: SmartScheduleItem[]) {
    const grouped = new Map<number, SmartScheduleItem[]>();
    for (const item of schedules) grouped.set(item.beauticianId, [...(grouped.get(item.beauticianId) ?? []), item]);
    return grouped;
  }

  private dedupeSchedules(schedules: SmartScheduleItem[]) {
    const byKey = new Map<string, SmartScheduleItem>();
    for (const item of schedules) byKey.set(this.scheduleKey(item), item);
    return Array.from(byKey.values());
  }

  private conflict(type: ScheduleConflict['type'], severity: ScheduleConflict['severity'], message: string, item: SmartScheduleItem): ScheduleConflict {
    return { type, severity, message, beauticianId: item.beauticianId, date: item.date, startTime: item.startTime, endTime: item.endTime, reservationId: item.reservationId };
  }

  private isBeauticianActive(status: string | null | undefined) {
    return !status || ACTIVE_BEAUTICIAN_STATUSES.has(status);
  }

  private isWorkingStatus(status: string | undefined) {
    return !['leave', 'busy'].includes(String(status));
  }

  private projectHasSkillConfig(skills: any[], projectId: number | string | null | undefined) {
    const normalizedProjectId = Number(projectId);
    return normalizedProjectId > 0 && skills.some((item) => item.projectId === normalizedProjectId);
  }

  private findProjectSkill(skills: any[], projectId: number | string | null | undefined, beauticianId: number | string | null | undefined) {
    return skills.find((item) => item.projectId === Number(projectId) && item.beauticianId === Number(beauticianId));
  }

  private isSkillQualified(skills: any[], projectId: number | string | null | undefined, skill?: any) {
    if (!this.projectHasSkillConfig(skills, projectId)) return true;
    return Boolean(skill?.certified || Number(skill?.skillLevel ?? 0) >= 2);
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
    return Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000);
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
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash % 2147483647;
  }

  private parseJsonArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private parseJsonObject(value: unknown): Record<string, number> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, number>) : null;
  }

  private buildInputSummary(options: SmartSchedulingOptions) {
    return {
      weekStart: options.weekStart,
      mode: options.mode,
      generateAlternatives: Boolean(options.generateAlternatives),
      optimizeScope: options.optimizeScope ?? 'week',
    };
  }
}
