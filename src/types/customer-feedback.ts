import type { PaginatedResponse } from './pagination';

export type CustomerFeedbackType = 'complaint' | 'satisfaction' | 'suggestion' | 'praise';
export type CustomerFeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type CustomerFeedbackSeverity = 'normal' | 'warning' | 'critical';

export interface CustomerFeedbackRecord {
  id: number;
  storeId: number;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerMemberLevel: string | null;
  serviceTaskId: number | null;
  reservationId: number | null;
  orderId: number | null;
  beauticianId: number | null;
  beauticianName: string | null;
  projectId: number | null;
  projectName: string | null;
  feedbackType: CustomerFeedbackType;
  rating: number | null;
  category: string | null;
  severity: CustomerFeedbackSeverity;
  content: string | null;
  sourceChannel: string;
  status: CustomerFeedbackStatus;
  assignedUserId: number | null;
  handledByUserId: number | null;
  resolutionNote: string | null;
  occurredAt: string;
  handledAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFeedbackAnalytics {
  range: { startDate: string; endDate: string };
  summary: {
    feedbackCount: number;
    complaintCount: number;
    unresolvedComplaintCount: number;
    ratedFeedbackCount: number;
    ratingTotal: number;
    averageRating: number | null;
    lowRatingCount: number;
    completedServiceTaskCount: number;
    linkedServiceTaskCount: number;
    collectionCoverageRate: number;
  };
  staff: Array<{
    beauticianId: number;
    beauticianName: string;
    feedbackCount: number;
    complaintCount: number;
    unresolvedComplaintCount: number;
    lowRatingCount: number;
    ratedFeedbackCount: number;
    averageRating: number | null;
  }>;
}

export interface CustomerFeedbackQuery {
  page: number;
  pageSize: number;
  feedbackType?: CustomerFeedbackType;
  status?: CustomerFeedbackStatus;
  keyword?: string;
  beauticianId?: number;
  ratingMax?: number;
  startDate?: string;
  endDate?: string;
}

export interface CreateCustomerFeedbackPayload {
  customerId?: number;
  serviceTaskId?: number;
  reservationId?: number;
  orderId?: number;
  beauticianId?: number;
  projectId?: number;
  feedbackType: CustomerFeedbackType;
  rating?: number;
  category?: string;
  severity?: CustomerFeedbackSeverity;
  content?: string;
  sourceChannel?: string;
  assignedUserId?: number;
  occurredAt?: string;
}

export interface UpdateCustomerFeedbackPayload {
  status?: CustomerFeedbackStatus;
  severity?: CustomerFeedbackSeverity;
  assignedUserId?: number;
  resolutionNote?: string;
}

export type CustomerFeedbackPage = PaginatedResponse<CustomerFeedbackRecord>;
