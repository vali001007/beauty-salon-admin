import type { MarketingActivity } from '@/types';
import apiClient from '../client';

export interface MarketingStrategy {
  id: number;
  name: string;
  description: string;
  executionType: '自动' | '手动';
  executionTime: string;
  status: '启用' | '停用' | '草稿';
}

export async function realCreateStrategy(data: { name: string; description: string; executionType: string; executionTime: string }): Promise<MarketingStrategy> {
  return apiClient.post('/marketing/strategies', data);
}

export async function realSaveStrategyDraft(data: { name: string; description: string; executionType: string; executionTime: string }): Promise<MarketingStrategy> {
  return apiClient.post('/marketing/strategies/draft', data);
}

export async function realGetMarketingActivities(): Promise<MarketingActivity[]> {
  return apiClient.get('/marketing/activities');
}

export async function realCreateMarketingActivity(
  data: Omit<MarketingActivity, 'id'>,
): Promise<MarketingActivity> {
  return apiClient.post('/marketing/activities', data);
}

export async function realUpdateMarketingActivity(
  id: number,
  data: Partial<MarketingActivity>,
): Promise<MarketingActivity> {
  return apiClient.put(`/marketing/activities/${id}`, data);
}

import type { StrategyEffectSummary } from '../mock/marketing';

export async function realGetStrategyEffects(): Promise<StrategyEffectSummary[]> {
  return apiClient.get('/marketing/strategies/effects');
}
