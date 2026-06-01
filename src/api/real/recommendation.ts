import type { BehaviorProfile } from '@/utils/customerSegmentation';
import type { Recommendation } from '@/utils/marketingRecommendation';
import apiClient from '../client';

export async function realGetMarketingRecommendations(): Promise<Recommendation[]> {
  return apiClient.get('/marketing/recommendations');
}

export async function realGetMarketingRecommendationAudience(recommendationId: number): Promise<BehaviorProfile[]> {
  return apiClient.get(`/marketing/recommendations/${recommendationId}/audience`);
}

export async function realCreateRecommendation(data: Omit<Recommendation, 'id'>): Promise<Recommendation> {
  return apiClient.post('/marketing/recommendations', data);
}

export async function realUpdateRecommendation(id: number, data: Partial<Recommendation>): Promise<Recommendation> {
  return apiClient.put(`/marketing/recommendations/${id}`, data);
}

export async function realDeleteRecommendation(id: number): Promise<void> {
  return apiClient.delete(`/marketing/recommendations/${id}`);
}
