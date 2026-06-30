import type { ScheduleSlot } from '@/types/store';
import apiClient from '../client';
import { extractArray } from './response';
import { addBusinessDays, formatBusinessDate } from '@/utils/businessTime';

const TIME_SLOTS = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
];

const HOUR_SLOTS = [
  { start: '09:00', sourceTimes: ['09:00', '09:30'] },
  { start: '10:00', sourceTimes: ['10:00', '10:30'] },
  { start: '11:00', sourceTimes: ['11:00', '11:30'] },
  { start: '14:00', sourceTimes: ['14:00', '14:30'] },
  { start: '15:00', sourceTimes: ['15:00', '15:30'] },
  { start: '16:00', sourceTimes: ['16:00', '16:30'] },
  { start: '17:00', sourceTimes: ['17:00', '17:30'] },
  { start: '18:00', sourceTimes: ['18:00', '18:30'] },
  { start: '19:00', sourceTimes: ['19:00', '19:30'] },
];

type ApiSchedule = {
  id?: number | string;
  storeId?: number;
  beauticianId?: number;
  date?: string | Date;
  startTime?: string;
  endTime?: string;
  status?: string;
  source?: string;
  reservationId?: number;
  reservationStatus?: string;
  customerId?: number;
  customerName?: string;
  customerPhone?: string | null;
  projectId?: number;
  projectName?: string;
  projectDuration?: number;
  remark?: string | null;
};

function toDateKey(value: string | Date | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return formatBusinessDate(value);
}

function addDays(dateText: string, days: number): string {
  return addBusinessDays(dateText, days);
}

function toMinutes(time: string | undefined): number {
  if (!time) return 0;
  const [hour = '0', minute = '0'] = time.split(':');
  return Number(hour) * 60 + Number(minute);
}

function toEndTime(time: string): string {
  const total = toMinutes(time) + 60;
  const hour = String(Math.floor(total / 60)).padStart(2, '0');
  const minute = String(total % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function normalizeStatus(status: string | undefined): 'available' | 'booked' | 'leave' {
  const value = String(status ?? '').toLowerCase();
  if (['booked', 'reserved', 'reservation', '已预约'].includes(value)) return 'booked';
  if (['leave', 'busy', 'off', '请假', '忙碌'].includes(value)) return 'leave';
  return 'available';
}

function toReservationInfo(item: ApiSchedule | undefined): ScheduleSlot['reservationInfo'] | undefined {
  if (!item?.reservationId) return undefined;
  return {
    id: item.reservationId,
    status: item.reservationStatus,
    customerId: item.customerId,
    customerName: item.customerName,
    customerPhone: item.customerPhone ?? undefined,
    projectId: item.projectId,
    projectName: item.projectName,
    projectDuration: item.projectDuration,
    remark: item.remark ?? undefined,
    startTime: item.startTime,
    endTime: item.endTime,
  };
}

function normalizeSchedule(raw: unknown, beauticianId: number, weekStart: string): ScheduleSlot[][] {
  const schedules = extractArray<ApiSchedule>(raw).filter((item) => {
    if (item.beauticianId !== undefined && Number(item.beauticianId) !== beauticianId) return false;
    const dateKey = toDateKey(item.date);
    return dateKey >= weekStart && dateKey <= addDays(weekStart, 6);
  });

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const dateKey = addDays(weekStart, dayIndex);
    const daySchedules = schedules.filter((item) => toDateKey(item.date) === dateKey);

    return TIME_SLOTS.map((time) => {
      const timeStart = toMinutes(time);
      const matched = daySchedules.find((item) => {
        const start = toMinutes(item.startTime);
        const end = toMinutes(item.endTime);
        return timeStart >= start && timeStart < end;
      });
      const status = normalizeStatus(matched?.status);

      return {
        time,
        period: (toMinutes(time) < 12 ? '上午' : '下午') as ScheduleSlot['period'],
        available: status === 'available',
        status,
        reservationInfo: status === 'booked' ? toReservationInfo(matched) : undefined,
      };
    });
  });
}

function buildSchedulePayload(data: {
  beauticianId: number;
  weekStart: string;
  slots: ScheduleSlot[][];
}): {
  beauticianId: number;
  weekStart: string;
  schedules: Array<{ beauticianId: number; date: string; startTime: string; endTime: string; status: string }>;
} {
  const schedules = data.slots.flatMap((daySlots, dayIndex) => {
    const date = addDays(data.weekStart, dayIndex);
    return HOUR_SLOTS
      .map((slot) => {
        const sourceSlots = slot.sourceTimes.map((time) => daySlots.find((item) => item.time === time));
        const hasBooked = sourceSlots.some((item) => normalizeStatus(item?.status) === 'booked');
        const hasLeave = sourceSlots.some((item) => normalizeStatus(item?.status) === 'leave');
        const allAvailable = sourceSlots.every((item) => item?.available || normalizeStatus(item?.status) === 'available');
        const status = hasBooked ? '' : hasLeave ? 'leave' : allAvailable ? 'available' : '';
        if (!status) return null;
        return {
          beauticianId: data.beauticianId,
          date,
          startTime: slot.start,
          endTime: toEndTime(slot.start),
          status,
        };
      })
      .filter((item): item is { beauticianId: number; date: string; startTime: string; endTime: string; status: string } => Boolean(item));
  });

  return { beauticianId: data.beauticianId, weekStart: data.weekStart, schedules };
}

export async function realGetSchedule(params: {
  beauticianId: number;
  weekStart: string;
}): Promise<ScheduleSlot[][]> {
  const response = await apiClient.get<unknown, unknown>('/scheduling', { params });
  return normalizeSchedule(response, params.beauticianId, params.weekStart);
}

export async function realGetWeeklySchedules(params: {
  beauticianIds: number[];
  weekStart: string;
}): Promise<Record<number, ScheduleSlot[][]>> {
  const response = await apiClient.get<unknown, unknown>('/scheduling', { params: { weekStart: params.weekStart } });
  return Object.fromEntries(
    params.beauticianIds.map((beauticianId) => [
      beauticianId,
      normalizeSchedule(response, beauticianId, params.weekStart),
    ]),
  );
}

export async function realSaveSchedule(data: {
  beauticianId: number;
  weekStart: string;
  slots: ScheduleSlot[][];
}): Promise<void> {
  return apiClient.put('/scheduling', buildSchedulePayload(data));
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export type SmartScheduleItem = {
  beauticianId: number;
  date: string;
  startTime: string;
  endTime: string;
  status: 'available' | 'booked' | 'leave' | string;
  source?: 'existing' | 'generated' | 'reservation' | 'manual' | 'rollback';
  reservationId?: number;
};

export type SmartSchedulingMode = 'balanced' | 'reservation_first' | 'peak_first' | 'cost_first' | 'fairness_first';

export type SmartSchedulingOptions = {
  storeId?: number;
  runId?: string;
  createdById?: number;
  weekStart: string;
  mode?: 'blank' | 'copy_last_week_optimize' | 'optimize_current' | SmartSchedulingMode;
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

export type SmartSchedulingConflict = {
  type: string;
  severity: 'hard' | 'soft';
  message: string;
  beauticianId?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  reservationId?: number;
};

export type SmartSchedulingSummary = {
  reservationCoverageRate: number;
  peakCoverageRate: number;
  skillMatchRate?: number;
  fairnessScore?: number;
  estimatedLaborCost?: number;
  hardConflictCount: number;
  softWarningCount: number;
  scheduledSlots: number;
};

export type SmartSchedulingAlternative = {
  id: string;
  label: string;
  mode: SmartSchedulingMode;
  score: number;
  summary: SmartSchedulingSummary;
  schedules: SmartScheduleItem[];
  conflicts: SmartSchedulingConflict[];
  explanations: string[];
};

export type ScheduleVersion = {
  id: number;
  storeId: number;
  weekStart: string;
  status: string;
  sourceRunId?: string | null;
  publishedById?: number | null;
  publishedAt?: string | null;
  rollbackFromVersionId?: number | null;
  createdAt?: string;
};

export type SmartSchedulingResult = {
  runId?: string;
  weekStart: string;
  mode?: SmartSchedulingMode;
  solverStatus?: 'optimal' | 'feasible' | 'timeout' | 'failed';
  runtimeMs?: number;
  score: number;
  summary: SmartSchedulingSummary;
  schedules?: SmartScheduleItem[];
  recommended?: SmartSchedulingAlternative;
  alternatives?: SmartSchedulingAlternative[];
  warnings: SmartSchedulingConflict[];
  conflicts?: SmartSchedulingConflict[];
  explanations: string[];
  savedCount?: number;
  version?: ScheduleVersion;
};

export type SmartSchedulingRunsResult = {
  weekStart: string;
  currentVersion?: ScheduleVersion | null;
  runs: Array<{
    id?: number;
    runId: string;
    status: string;
    mode?: SmartSchedulingMode;
    solverStatus?: string;
    score?: number;
    runtimeMs?: number;
    generatedSchedules?: SmartScheduleItem[];
    solutionSummary?: SmartSchedulingSummary;
    alternatives?: SmartSchedulingAlternative[];
    createdAt?: string;
    confirmedAt?: string | null;
    publishedScheduleVersionId?: number | null;
  }>;
  versions: ScheduleVersion[];
};

export type DemandLoadLevel = 'low' | 'medium' | 'high';
export type DemandRecommendedAction = 'fill_gap' | 'keep' | 'add_staff';

export type SchedulingDemandSlot = {
  date: string;
  startTime: string;
  endTime: string;
  expectedReservations: number;
  requiredStaff: number;
  scheduledStaff: number;
  expectedServiceDemand?: number;
  requiredServiceCapacity?: number;
  scheduledServiceCapacity?: number;
  level: 'low' | 'medium' | 'high';
  staffDelta?: number;
  loadRatio?: number;
  loadLevel?: DemandLoadLevel;
  recommendedAction?: DemandRecommendedAction;
};

export type SchedulingDemandResult = {
  weekStart: string;
  slots: SchedulingDemandSlot[];
  summary: {
    highDemandSlots: number;
    underStaffedSlots: number;
    highLoadSlots?: number;
    lowLoadSlots?: number;
    matchedLoadSlots?: number;
  };
};

export type GapCandidate = {
  id: number;
  opportunityId: number;
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  projectId?: number;
  projectName?: string;
  followUpTaskId?: number;
  preferredBeauticianId?: number | null;
  preferredBeauticianUserId?: number | null;
  preferredBeauticianName?: string | null;
  score: number;
  expectedFillRate: number;
  estimatedRevenue: number;
  recommendedChannel: string;
  messageDraft?: string;
  reasons?: string[];
  risks?: string[];
  scoreBreakdown?: Record<string, number | string | null | undefined>;
  status: string;
};

export type GapOpportunity = {
  id: number;
  storeId: number;
  date: string;
  startTime: string;
  endTime: string;
  beauticianIds: number[];
  projectIds: number[];
  durationMinutes: number;
  capacity: number;
  bookedCount: number;
  availableCapacity: number;
  source: string;
  gapType: string;
  score: number;
  estimatedRevenue: number;
  expectedFillRate: number;
  candidateCount: number;
  status: string;
  confirmationDraft?: ConfirmationDraft | null;
  expiresAt?: string;
  candidates: GapCandidate[];
};

export type GapOpportunitySummary = {
  opportunityCount: number;
  openOpportunityCount: number;
  availableCapacity: number;
  candidateCount: number;
  expectedRevenue: number;
  averageFillRate: number;
};

export type GapOpportunityResult = {
  weekStart: string;
  generatedAt: string;
  opportunities: GapOpportunity[];
  summary: GapOpportunitySummary;
};

export type ConfirmationDraft = {
  opportunityId: number;
  candidateId: number;
  customerId: number;
  channel: string;
  message: string;
  status: 'draft' | string;
  sent: boolean;
  generatedAt: string;
};

export type BenefitDraft = {
  opportunityId: number;
  candidateId: number;
  customerId: number;
  channel: string;
  benefitTitle: string;
  benefitText: string;
  projectName: string;
  appointmentTime: string;
  copy: string;
  link: string;
  status: 'draft' | string;
  sent: boolean;
  generatedAt: string;
};

export async function realGetSchedulePaginated(params: PaginationParams & { beauticianId?: number; weekStart?: string }): Promise<PaginatedResponse<any>> {
  return apiClient.get('/scheduling/paginated', { params });
}

export async function realCreateScheduleSlot(data: { beauticianId: number; date: string; time: string; available: boolean }): Promise<any> {
  return apiClient.post('/scheduling/slots', data);
}

export async function realDeleteScheduleSlot(id: number): Promise<void> {
  return apiClient.delete(`/scheduling/slots/${id}`);
}

export async function realPreviewSmartSchedule(data: SmartSchedulingOptions): Promise<SmartSchedulingResult> {
  return apiClient.post('/scheduling/smart/preview', data);
}

export async function realOneClickSmartSchedule(data: SmartSchedulingOptions): Promise<SmartSchedulingResult> {
  return apiClient.post('/scheduling/smart/one-click', data);
}

export async function realEvaluateSmartSchedule(data: SmartSchedulingOptions): Promise<SmartSchedulingResult> {
  return apiClient.post('/scheduling/smart/evaluate', data);
}

export async function realPublishSmartSchedule(data: SmartSchedulingOptions): Promise<SmartSchedulingResult> {
  return apiClient.post('/scheduling/smart/publish', data);
}

export async function realRollbackSmartSchedule(data: SmartSchedulingOptions): Promise<SmartSchedulingResult> {
  return apiClient.post('/scheduling/smart/rollback', data);
}

export async function realGetSmartSchedulingRuns(params: { weekStart: string }): Promise<SmartSchedulingRunsResult> {
  return apiClient.get('/scheduling/smart/runs', { params });
}

export async function realGetSchedulingDemand(params: { weekStart: string }): Promise<SchedulingDemandResult> {
  return apiClient.get('/scheduling/demand', { params });
}

export async function realGetGapOpportunities(params: { weekStart: string }): Promise<GapOpportunityResult> {
  return apiClient.get('/scheduling/gap-opportunities', { params });
}

export async function realRefreshGapCandidates(id: number, data: { limit?: number; projectIds?: number[]; channel?: string } = {}): Promise<GapCandidate[]> {
  return apiClient.post(`/scheduling/gap-opportunities/${id}/candidates`, data);
}

export async function realCreateGapFollowUpTasks(
  id: number,
  data: {
    candidateIds?: number[];
    assigneeRole?: 'manager' | 'consultant' | 'reception';
    assigneeUserId?: number;
    assigneeBeauticianId?: number;
    dueAt?: string;
  },
): Promise<{ items: Array<{ candidate: GapCandidate; task: unknown }> }> {
  return apiClient.post(`/scheduling/gap-opportunities/${id}/follow-up-tasks`, data);
}

export async function realCreateGapConfirmationDraft(
  id: number,
  data: { candidateId?: number; channel?: string },
): Promise<ConfirmationDraft> {
  return apiClient.post(`/scheduling/gap-opportunities/${id}/confirmation-draft`, data);
}

export async function realCreateGapBenefitDraft(
  id: number,
  data: { candidateId?: number; channel?: string },
): Promise<BenefitDraft> {
  return apiClient.post(`/scheduling/gap-opportunities/${id}/benefit-draft`, data);
}
