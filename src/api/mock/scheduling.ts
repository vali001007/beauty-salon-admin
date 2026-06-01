import type { ScheduleSlot } from '@/types/store';

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
];

function generateWeekSlots(weekStart: string): ScheduleSlot[][] {
  const start = new Date(weekStart);
  const week: ScheduleSlot[][] = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    const slots: ScheduleSlot[] = TIME_SLOTS.map((time) => ({
      time,
      period: parseInt(time) < 12 ? '上午' as const : '下午' as const,
      available: Math.random() > 0.3,
    }));
    week.push(slots);
  }
  return week;
}

const scheduleCache = new Map<string, ScheduleSlot[][]>();

export async function mockGetSchedule(params: {
  beauticianId: number;
  weekStart: string;
}): Promise<ScheduleSlot[][]> {
  const key = `${params.beauticianId}-${params.weekStart}`;
  if (!scheduleCache.has(key)) {
    scheduleCache.set(key, generateWeekSlots(params.weekStart));
  }
  return scheduleCache.get(key)!;
}

export async function mockSaveSchedule(data: {
  beauticianId: number;
  weekStart: string;
  slots: ScheduleSlot[][];
}): Promise<void> {
  const key = `${data.beauticianId}-${data.weekStart}`;
  scheduleCache.set(key, data.slots);
}

import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';

export async function mockGetSchedulePaginated(params: PaginationParams & { beauticianId?: number; weekStart?: string }): Promise<PaginatedResponse<any>> {
  const items: any[] = [];
  return createPaginatedResponse(items, 0, params.page, params.pageSize);
}

export async function mockCreateScheduleSlot(data: { beauticianId: number; date: string; time: string; available: boolean }): Promise<any> {
  return { id: Date.now(), ...data };
}

export async function mockDeleteScheduleSlot(_id: number): Promise<void> {
  // no-op in mock
}
