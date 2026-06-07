import { ForbiddenException } from '@nestjs/common';
import { CsrfMiddleware } from './csrf.middleware';

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;
  const next = jest.fn();

  beforeEach(() => {
    middleware = new CsrfMiddleware();
    next.mockClear();
  });

  function request(method: string, originalUrl: string, headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
    return {
      method,
      originalUrl,
      url: originalUrl,
      headers,
      cookies,
    } as any;
  }

  it('skips public marketing page submissions for H5 visitors', () => {
    middleware.use(request('POST', '/api/public/marketing/pages/mp-product-1/leads'), {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('still blocks other mutating requests without a matching CSRF token', () => {
    expect(() => middleware.use(request('POST', '/api/marketing/pages'), {} as any, next)).toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows protected mutating requests with matching CSRF token', () => {
    middleware.use(
      request('POST', '/api/marketing/pages', { 'x-csrf-token': 'token-1' }, { csrf_token: 'token-1' }),
      {} as any,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});
