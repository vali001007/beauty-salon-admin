import {
  realCreateCustomerFeedback,
  realGetCustomerFeedback,
  realGetCustomerFeedbackAnalytics,
  realUpdateCustomerFeedback,
} from './real/customerFeedback';

export const getCustomerFeedback = realGetCustomerFeedback;
export const getCustomerFeedbackAnalytics = realGetCustomerFeedbackAnalytics;
export const createCustomerFeedback = realCreateCustomerFeedback;
export const updateCustomerFeedback = realUpdateCustomerFeedback;
