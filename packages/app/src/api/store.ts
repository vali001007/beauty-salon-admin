import apiClient from './client';
import type { Store } from '@/types';

export async function getAccessibleStores(): Promise<Store[]> {
  return apiClient.get('/stores/accessible');
}
