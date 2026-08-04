import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useStoreStore } from '../stores/storeStore';

export type ApiRetryPolicy = 'safe' | 'idempotent' | 'never';

declare module 'axios' {
  interface AxiosRequestConfig {
    retryPolicy?: ApiRetryPolicy;
  }

  interface InternalAxiosRequestConfig {
    retryPolicy?: ApiRetryPolicy;
  }
}

export interface ApiErrorPayload {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
  category?: 'business_blocker' | 'permission' | 'system' | 'conflict';
  resolutionType?: string;
  retryable?: boolean;
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

function isRetryableFailure(error: AxiosError): boolean {
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

function readHeader(config: InternalAxiosRequestConfig, name: string): string {
  const headers = config.headers as InternalAxiosRequestConfig['headers'] & { get?: (key: string) => unknown };
  const value = typeof headers.get === 'function' ? headers.get(name) : headers[name];
  return typeof value === 'string' ? value.trim() : '';
}

function retryPolicy(config: RetryConfig): ApiRetryPolicy {
  if (config.retryPolicy) return config.retryPolicy;
  const method = String(config.method ?? 'get').toLowerCase();
  return ['get', 'head', 'options'].includes(method) ? 'safe' : 'never';
}

function canRetryRequest(config: RetryConfig): boolean {
  const policy = retryPolicy(config);
  if (policy === 'never') return false;
  if (policy === 'safe') {
    return ['get', 'head', 'options'].includes(String(config.method ?? 'get').toLowerCase());
  }
  return Boolean(readHeader(config, 'Idempotency-Key'));
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
  const response = await axios.get<{ csrfToken?: string }>(`${normalizedBase}/auth/csrf-token`, {
    withCredentials: true,
  });
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

  // Preserve the logical request identity across retries.
  if (!readHeader(config, 'X-Request-Id')) {
    config.headers['X-Request-Id'] = generateRequestId();
  }
  config.headers['X-Ami-Client-Channel'] = 'admin_web';

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
    if (config && !config.skipRetry && canRetryRequest(config) && isRetryableFailure(error)) {
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
      message: (responseData?.message as string) || error.message || '请求失败，请稍后重试',
      code: (responseData?.code as string | undefined) || error.code,
      status,
      details: (responseData?.details ?? responseData) as unknown,
      category: responseData?.category as ApiErrorPayload['category'],
      resolutionType: responseData?.resolutionType as string | undefined,
      retryable: typeof responseData?.retryable === 'boolean' ? responseData.retryable : undefined,
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
