import type { ScheduleSlot } from '@/types/store';
import { realGetSchedule, realSaveSchedule, realGetSchedulePaginated, realCreateScheduleSlot, realDeleteScheduleSlot } from './real/scheduling';

export const getSchedule: (params: {
  beauticianId: number;
  weekStart: string;
}) => Promise<ScheduleSlot[][]> =
  realGetSchedule;

export const saveSchedule: (data: {
  beauticianId: number;
  weekStart: string;
  slots: ScheduleSlot[][];
}) => Promise<void> =
  realSaveSchedule;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export const getSchedulePaginated: (params: PaginationParams & { beauticianId?: number; weekStart?: string }) => Promise<PaginatedResponse<any>> =
  realGetSchedulePaginated;

export const createScheduleSlot: (data: { beauticianId: number; date: string; time: string; available: boolean }) => Promise<any> =
  realCreateScheduleSlot;

export const deleteScheduleSlot: (id: number) => Promise<void> =
  realDeleteScheduleSlot;
