import apiClient from '../client';
import type {
  CreateCustomerFeedbackPayload,
  CustomerFeedbackAnalytics,
  CustomerFeedbackPage,
  CustomerFeedbackQuery,
  CustomerFeedbackRecord,
  UpdateCustomerFeedbackPayload,
} from '@/types/customer-feedback';

export function realGetCustomerFeedback(params: CustomerFeedbackQuery): Promise<CustomerFeedbackPage> {
  return apiClient.get('/customer-feedback', { params });
}

export function realGetCustomerFeedbackAnalytics(params: {
  startDate?: string;
  endDate?: string;
} = {}): Promise<CustomerFeedbackAnalytics> {
  return apiClient.get('/customer-feedback/analytics', { params });
}

export function realCreateCustomerFeedback(
  payload: CreateCustomerFeedbackPayload,
): Promise<CustomerFeedbackRecord> {
  return apiClient.post('/customer-feedback', payload);
}

export function realUpdateCustomerFeedback(
  id: number,
  payload: UpdateCustomerFeedbackPayload,
): Promise<CustomerFeedbackRecord> {
  return apiClient.put(`/customer-feedback/${id}`, payload);
}
