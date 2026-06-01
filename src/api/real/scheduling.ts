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

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetSchedulePaginated(params: PaginationParams & { beauticianId?: number; weekStart?: string }): Promise<PaginatedResponse<any>> {
  return apiClient.get('/scheduling/paginated', { params });
}

export async function realCreateScheduleSlot(data: { beauticianId: number; date: string; time: string; available: boolean }): Promise<any> {
  return apiClient.post('/scheduling/slots', data);
}

export async function realDeleteScheduleSlot(id: number): Promise<void> {
  return apiClient.delete(`/scheduling/slots/${id}`);
}
