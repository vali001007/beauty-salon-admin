import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('API Client', () => {
  let requestInterceptorFn: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
  let responseSuccessFn: (response: AxiosResponse) => unknown;
  let responseErrorFn: (error: AxiosError) => Promise<unknown>;

  beforeEach(async () => {
    // Set up localStorage mock
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => {
        if (key === 'token') return 'test-jwt-token';
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    // Mock document.cookie
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf_token=test-csrf-token-123',
      configurable: true,
    });

    // Mock the store
    vi.doMock('../stores/storeStore', () => ({
      useStoreStore: {
        getState: () => ({ currentStoreId: 42 }),
      },
    }));

    // We need to capture the interceptors from the real axios.create call.
    // Mock axios.create to return a mock instance that captures interceptors.
    const { default: axios } = await import('axios');

    const requestHandlers: Array<(config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig> = [];
    const responseHandlers: Array<{
      success: (response: AxiosResponse) => unknown;
      error: (error: AxiosError) => Promise<unknown>;
    }> = [];

    const mockInstance = {
      interceptors: {
        request: {
          use: (fn: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig) => {
            requestHandlers.push(fn);
          },
        },
        response: {
          use: (success: (response: AxiosResponse) => unknown, error: (error: AxiosError) => Promise<unknown>) => {
            responseHandlers.push({ success, error });
          },
        },
      },
      get: vi.fn().mockResolvedValue(undefined),
      defaults: { headers: { common: {} } },
    };

    vi.doMock('axios', () => ({
      default: {
        ...axios,
        create: vi.fn(() => mockInstance),
        AxiosHeaders: axios.AxiosHeaders,
      },
      __esModule: true,
    }));

    vi.resetModules();
    await import('./client');

    requestInterceptorFn = requestHandlers[0];
    responseSuccessFn = responseHandlers[0].success;
    responseErrorFn = responseHandlers[0].error;
  });

  afterEach(() => {
    vi.doUnmock('axios');
    vi.doUnmock('../stores/storeStore');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('request interceptor', () => {
    it('adds Authorization header from localStorage token', async () => {
      const { default: axios } = await import('axios');
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get',
      } as InternalAxiosRequestConfig;

      const result = requestInterceptorFn(config);

      expect(result.headers.Authorization).toBe('Bearer test-jwt-token');
    });

    it('adds X-Store-Id header from store state', async () => {
      const { default: axios } = await import('axios');
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get',
      } as InternalAxiosRequestConfig;

      const result = requestInterceptorFn(config);

      expect(result.headers['X-Store-Id']).toBe('42');
    });

    it('adds X-Request-Id header for tracing', async () => {
      const { default: axios } = await import('axios');
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get',
      } as InternalAxiosRequestConfig;

      const result = requestInterceptorFn(config);

      expect(result.headers['X-Request-Id']).toMatch(/^req_/);
    });

    it('adds X-CSRF-Token on mutating requests', async () => {
      const { default: axios } = await import('axios');
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'post',
      } as InternalAxiosRequestConfig;

      const result = requestInterceptorFn(config);

      expect(result.headers['X-CSRF-Token']).toBe('test-csrf-token-123');
    });

    it('does not add CSRF token on GET requests', async () => {
      const { default: axios } = await import('axios');
      const config = {
        headers: new axios.AxiosHeaders(),
        method: 'get',
      } as InternalAxiosRequestConfig;

      const result = requestInterceptorFn(config);

      expect(result.headers['X-CSRF-Token']).toBeUndefined();
    });
  });

  describe('response interceptor', () => {
    it('unwraps response data on success', () => {
      const response = {
        data: { items: [1, 2, 3], total: 3 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse;

      const result = responseSuccessFn(response);

      expect(result).toEqual({ items: [1, 2, 3], total: 3 });
    });
  });

  describe('retry logic', () => {
    it('does not retry on 4xx errors', async () => {
      const error = {
        response: { status: 400, data: { message: 'Bad Request' } },
        config: { _retryCount: 0 },
        message: 'Request failed',
      } as unknown as AxiosError;

      await expect(responseErrorFn(error)).rejects.toThrow('Bad Request');
    });

    it('does not retry on 401 errors and redirects to login', async () => {
      const originalHref = window.location.href;
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: originalHref },
        configurable: true,
      });

      const error = {
        response: { status: 401, data: { message: 'Unauthorized' } },
        config: { _retryCount: 0 },
        message: 'Unauthorized',
      } as unknown as AxiosError;

      await expect(responseErrorFn(error)).rejects.toThrow('Unauthorized');
      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(window.location.href).toBe('/login');
    });

    it('rejects after max retries on 5xx errors', async () => {
      const error = {
        response: { status: 500, data: { message: 'Internal Server Error' } },
        config: { _retryCount: 3 },
        message: 'Server Error',
      } as unknown as AxiosError;

      await expect(responseErrorFn(error)).rejects.toThrow('Internal Server Error');
    });

    it('normalizes error with payload structure', async () => {
      const error = {
        response: {
          status: 422,
          data: { message: '验证失败', code: 'VALIDATION_ERROR', details: { field: 'name' } },
        },
        config: { _retryCount: 0 },
        message: 'Request failed',
      } as unknown as AxiosError;

      try {
        await responseErrorFn(error);
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        const err = e as Error & { payload: { message: string; code: string; status: number; details: unknown } };
        expect(err.message).toBe('验证失败');
        expect(err.payload.code).toBe('VALIDATION_ERROR');
        expect(err.payload.status).toBe(422);
        expect(err.payload.details).toEqual({ field: 'name' });
      }
    });
  });
});
