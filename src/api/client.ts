import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useStoreStore } from '../stores/storeStore';

export interface ApiErrorPayload {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

// --- Retry configuration ---
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
let csrfTokenCache = '';

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _csrfRetry?: boolean;
  skipRetry?: boolean;
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function getCsrfToken(): string {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : csrfTokenCache;
}

function isRetryable(error: AxiosError): boolean {
  const responseData = error.response?.data as Record<string, unknown> | undefined;
  if (error.response?.status === 503 && responseData?.code === 'DATABASE_UNAVAILABLE') {
    return false;
  }
  // Do not retry on 4xx client errors
  if (error.response && error.response.status >= 400 && error.response.status < 500) {
    return false;
  }
  // Retry on 5xx server errors
  if (error.response && error.response.status >= 500) {
    return true;
  }
  // Retry on network errors (no response) and timeouts
  if (!error.response || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK') {
    return true;
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLoginRequest(config?: InternalAxiosRequestConfig): boolean {
  const url = config?.url ?? '';
  return url.endsWith('/auth/login') || url === 'auth/login' || url === '/auth/login';
}

function redirectToLoginOnce(): void {
  if (window.location.pathname === '/login') return;
  window.location.href = '/login';
}

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send cookies with cross-origin requests
});

async function refreshCsrfToken(): Promise<void> {
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
  const normalizedBase = baseURL.replace(/\/$/, '');
  const response = await axios.get<{ csrfToken?: string }>(`${normalizedBase}/auth/csrf-token`, { withCredentials: true });
  csrfTokenCache = response.data?.csrfToken || getCsrfToken();
}

// Request interceptor — attach auth token, store ID, request ID, and CSRF token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const currentStoreId = useStoreStore.getState().currentStoreId;
  if (currentStoreId !== null) {
    config.headers['X-Store-Id'] = String(currentStoreId);
  }

  // Add request ID for tracing
  config.headers['X-Request-Id'] = generateRequestId();

  // Attach CSRF token on mutating requests
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    config.headers['X-CSRF-Token'] = getCsrfToken();
  }

  return config;
});

// Response interceptor — retry logic + unified error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;

    // Retry logic for retryable errors
    if (config && !config.skipRetry && isRetryable(error)) {
      config._retryCount = config._retryCount ?? 0;

      if (config._retryCount < MAX_RETRIES) {
        config._retryCount += 1;
        const backoff = BASE_DELAY_MS * Math.pow(2, config._retryCount - 1);
        await delay(backoff);
        return apiClient(config);
      }
    }

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
      message:
        (responseData?.message as string) ||
        error.message ||
        '请求失败，请稍后重试',
      code: (responseData?.code as string | undefined) || error.code,
      status,
      details: (responseData?.details ?? responseData) as unknown,
    };

    if (status === 401 && !isLoginRequest(config)) {
      localStorage.removeItem('token');
      redirectToLoginOnce();
    }

    const normalizedError = new Error(payload.message) as Error & {
      payload: ApiErrorPayload;
    };
    normalizedError.payload = payload;
    return Promise.reject(normalizedError);
  },
);

export default apiClient;

// Fetch CSRF token on app initialization
export async function initCsrfToken(): Promise<void> {
  await refreshCsrfToken().catch(() => {
    // Silently fail — CSRF token will be fetched on next attempt
  });
}

// Auto-initialize CSRF token
initCsrfToken();
