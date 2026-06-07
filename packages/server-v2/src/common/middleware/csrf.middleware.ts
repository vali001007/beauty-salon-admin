import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * CSRF protection middleware.
 * Validates X-CSRF-Token header on state-changing requests (POST, PUT, PATCH, DELETE).
 * Skips validation for login and device auth endpoints.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly skipPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/csrf-token',
    '/api/terminal', // device auth endpoints
    '/api/public/marketing/pages', // public H5 event and lead submission
    '/v1/messages', // legacy public AI proxy
  ];

  private readonly mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  use(req: Request, _res: Response, next: NextFunction) {
    // Only validate on state-changing methods
    if (!this.mutatingMethods.includes(req.method)) {
      return next();
    }

    // Skip CSRF for whitelisted paths
    const path = req.originalUrl || req.url;
    if (this.skipPaths.some((skip) => path.startsWith(skip))) {
      return next();
    }

    const csrfCookie = req.cookies?.csrf_token;
    const csrfHeader = req.headers['x-csrf-token'] as string | undefined;

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException('CSRF token 验证失败');
    }

    next();
  }
}
