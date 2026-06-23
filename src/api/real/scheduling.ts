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
  id?: number;
  storeId?: number;
  beauticianId?: number;
  date?: string | Date;
  startTime?: string;
  endTime?: string;
  status?: string;
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

function isAvailableStatus(status: string | undefined): boolean {
  return !status || ['available', 'active', 'normal', '可预约', '空闲'].includes(status);
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

      return {
        time,
        period: (toMinutes(time) < 12 ? '上午' : '下午') as ScheduleSlot['period'],
        available: Boolean(matched && isAvailableStatus(matched.status)),
        status: matched?.status,
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
        const blockedStatus = sourceSlots.find((item) => ['booked', 'leave', 'busy'].includes(String(item?.status)))?.status;
        const status = blockedStatus ?? (sourceSlots.every((item) => item?.available) ? 'available' : '');
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
  status: 'available' | 'normal' | 'busy' | 'leave' | string;
  source?: 'existing' | 'generated' | 'reservation';
};

export type SmartSchedulingOptions = {
  storeId?: number;
  runId?: string;
  createdById?: number;
  weekStart: string;
  mode?: 'blank' | 'copy_last_week_optimize' | 'optimize_current';
  objective?: 'cover_reservations' | 'cover_peak' | 'fairness' | 'reduce_staff';
  keepConfirmedReservations?: boolean;
  allowOverrideBusy?: boolean;
  allowOverrideLeave?: boolean;
  peakMinStaff?: Array<{ weekday: number; startTime: string; endTime: string; minStaff: number }>;
  schedules?: SmartScheduleItem[];
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
  hardConflictCount: number;
  softWarningCount: number;
  scheduledSlots: number;
};

export type SmartSchedulingResult = {
  runId?: string;
  weekStart: string;
  score: number;
  summary: SmartSchedulingSummary;
  schedules?: SmartScheduleItem[];
  warnings: SmartSchedulingConflict[];
  conflicts?: SmartSchedulingConflict[];
  explanations: string[];
  savedCount?: number;
};

export type SchedulingDemandSlot = {
  date: string;
  startTime: string;
  endTime: string;
  expectedReservations: number;
  requiredStaff: number;
  scheduledStaff: number;
  level: 'low' | 'medium' | 'high';
};

export type SchedulingDemandResult = {
  weekStart: string;
  slots: SchedulingDemandSlot[];
  summary: {
    highDemandSlots: number;
    underStaffedSlots: number;
  };
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

export async function realEvaluateSmartSchedule(data: SmartSchedulingOptions): Promise<SmartSchedulingResult> {
  return apiClient.post('/scheduling/smart/evaluate', data);
}

export async function realPublishSmartSchedule(data: SmartSchedulingOptions): Promise<SmartSchedulingResult> {
  return apiClient.post('/scheduling/smart/publish', data);
}

export async function realGetSchedulingDemand(params: { weekStart: string }): Promise<SchedulingDemandResult> {
  return apiClient.get('/scheduling/demand', { params });
}
