import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useStoreStore } from '@/stores/storeStore';

export interface ApiErrorPayload {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

interface RetryConfig extends InternalAxiosRequestConfig {
  _csrfRetry?: boolean;
}

let csrfTokenCache = '';

function getCsrfToken(): string {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : csrfTokenCache;
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

async function refreshCsrfToken(): Promise<void> {
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
  const normalizedBase = baseURL.replace(/\/$/, '');
  const response = await axios.get<{ csrfToken?: string }>(`${normalizedBase}/auth/csrf-token`, { withCredentials: true });
  csrfTokenCache = response.data?.csrfToken || getCsrfToken();
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const currentStoreId = useStoreStore.getState().currentStoreId;
  if (currentStoreId !== null) {
    config.headers['X-Store-Id'] = String(currentStoreId);
  }

  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    config.headers['X-CSRF-Token'] = getCsrfToken();
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const responseData = error.response?.data as Record<string, unknown> | undefined;

    if (
      config &&
      status === 403 &&
      !config._csrfRetry &&
      typeof responseData?.message === 'string' &&
      responseData.message.includes('CSRF')
    ) {
      config._csrfRetry = true;
      await refreshCsrfToken();
      config.headers['X-CSRF-Token'] = getCsrfToken();
      return apiClient(config);
    }

    const payload: ApiErrorPayload = {
      message: (responseData?.message as string) || error.message || '请求失败，请稍后重试',
      code: responseData?.code as string | undefined,
      status,
      details: (responseData?.details ?? responseData) as unknown,
    };

    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }

    const normalizedError = new Error(payload.message) as Error & { payload: ApiErrorPayload };
    normalizedError.payload = payload;
    return Promise.reject(normalizedError);
  },
);

export async function initCsrfToken(): Promise<void> {
  await refreshCsrfToken().catch(() => {
    // CSRF token will be refreshed on the first mutating request if needed.
  });
}

initCsrfToken();

export default apiClient;
