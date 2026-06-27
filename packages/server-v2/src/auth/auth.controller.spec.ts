import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCookieSameSite = process.env.COOKIE_SAME_SITE;
  const originalCookieSecure = process.env.COOKIE_SECURE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCookieSameSite === undefined) {
      delete process.env.COOKIE_SAME_SITE;
    } else {
      process.env.COOKIE_SAME_SITE = originalCookieSameSite;
    }
    if (originalCookieSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalCookieSecure;
    }
    jest.restoreAllMocks();
  });

  it('sets cross-site compatible CSRF cookie options in production by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SAME_SITE;
    delete process.env.COOKIE_SECURE;

    const controller = new AuthController({} as any);
    const res = { cookie: jest.fn() };

    const result = controller.getCsrfToken(res as any);

    expect(result.csrfToken).toBeTruthy();
    expect(res.cookie).toHaveBeenCalledWith(
      'csrf_token',
      result.csrfToken,
      expect.objectContaining({
        httpOnly: false,
        secure: true,
        sameSite: 'none',
      }),
    );
  });
});
