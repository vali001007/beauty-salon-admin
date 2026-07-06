import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class AgentV2DeployHookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = String(process.env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN ?? '').trim();
    if (!expected) throw new ForbiddenException('AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN is not configured.');

    const actual = this.extractToken(request);
    if (!this.safeEqual(actual, expected)) throw new ForbiddenException('Invalid Agent V2 deploy hook token.');
    return true;
  }

  private extractToken(request: Request) {
    const direct =
      request.header('x-agent-v2-deploy-token') ??
      request.header('x-deploy-token') ??
      request.header('x-webhook-token') ??
      '';
    if (direct) return direct.trim();
    const authorization = request.header('authorization') ?? '';
    return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  }

  private safeEqual(actual: string, expected: string) {
    if (!actual || actual.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  }
}
