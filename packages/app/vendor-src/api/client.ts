import axios from 'axios';
import { useStoreStore } from '../stores/storeStore';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach auth token and store ID
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const currentStoreId = useStoreStore.getState().currentStoreId;
  if (currentStoreId !== null) {
    config.headers['X-Store-Id'] = String(currentStoreId);
  }

  return config;
});

// Response interceptor — unified error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default apiClient;
