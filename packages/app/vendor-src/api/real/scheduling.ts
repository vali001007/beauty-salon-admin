import type { ScheduleSlot } from '@/types/store';
import apiClient from '../client';

export async function realGetSchedule(params: {
  beauticianId: number;
  weekStart: string;
}): Promise<ScheduleSlot[][]> {
  return apiClient.get('/scheduling', { params });
}

export async function realSaveSchedule(data: {
  beauticianId: number;
  weekStart: string;
  slots: ScheduleSlot[][];
}): Promise<void> {
  return apiClient.put('/scheduling', data);
}
