import apiClient from './client';

export * from './agent';
export * from './auth';
export * from './store';

export const getCustomers = (params?: unknown) => apiClient.get('/customers', { params });
export const getCustomerById = (id: number) => apiClient.get(`/customers/${id}`);
export const getProductOrders = (params?: unknown) => apiClient.get('/orders/products', { params });
export const getCards = () => apiClient.get('/cards');
export const getProducts = (params?: unknown) => apiClient.get('/products', { params });
export const getStockItems = (params?: unknown) => apiClient.get('/inventory/stock-items', { params });
export const getExpiringProducts = () => apiClient.get('/inventory/expiring-products');
export const getReplenishmentSuggestions = () => apiClient.get('/inventory/replenishment-suggestions');
export const getBeauticians = (params?: unknown) => apiClient.get('/beauticians', { params });
export const getSchedule = (params?: unknown) => apiClient.get('/scheduling', { params });
export const getMarketingActivities = () => apiClient.get('/marketing/activities');
export const getBomList = () => apiClient.get('/bom');
export const getBomConsumption = (bomId: number) => apiClient.get(`/bom/${bomId}/consumption`);
