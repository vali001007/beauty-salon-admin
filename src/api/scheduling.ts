import type { ScheduleSlot } from '@/types/store';
import {
  realGetSchedule,
  realGetWeeklySchedules,
  realSaveSchedule,
  realGetSchedulePaginated,
  realCreateScheduleSlot,
  realDeleteScheduleSlot,
  realPreviewSmartSchedule,
  realEvaluateSmartSchedule,
  realPublishSmartSchedule,
  realGetSchedulingDemand,
} from './real/scheduling';
import type {
  SchedulingDemandResult,
  SmartSchedulingOptions,
  SmartSchedulingResult,
} from './real/scheduling';

export const getSchedule: (params: {
  beauticianId: number;
  weekStart: string;
}) => Promise<ScheduleSlot[][]> =
  realGetSchedule;

export const getWeeklySchedules: (params: {
  beauticianIds: number[];
  weekStart: string;
}) => Promise<Record<number, ScheduleSlot[][]>> =
  realGetWeeklySchedules;

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

export type {
  SchedulingDemandResult,
  SchedulingDemandSlot,
  SmartScheduleItem,
  SmartSchedulingConflict,
  SmartSchedulingOptions,
  SmartSchedulingResult,
  SmartSchedulingSummary,
} from './real/scheduling';

export const previewSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realPreviewSmartSchedule;

export const evaluateSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realEvaluateSmartSchedule;

export const publishSmartSchedule: (data: SmartSchedulingOptions) => Promise<SmartSchedulingResult> =
  realPublishSmartSchedule;

export const getSchedulingDemand: (params: { weekStart: string }) => Promise<SchedulingDemandResult> =
  realGetSchedulingDemand;
