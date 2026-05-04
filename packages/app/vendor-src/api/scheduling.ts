import type { ScheduleSlot } from '@/types/store';
import { mockGetSchedule, mockSaveSchedule } from './mock/scheduling';
import { realGetSchedule, realSaveSchedule } from './real/scheduling';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getSchedule: (params: {
  beauticianId: number;
  weekStart: string;
}) => Promise<ScheduleSlot[][]> =
  isReal ? realGetSchedule : mockGetSchedule;

export const saveSchedule: (data: {
  beauticianId: number;
  weekStart: string;
  slots: ScheduleSlot[][];
}) => Promise<void> =
  isReal ? realSaveSchedule : mockSaveSchedule;
