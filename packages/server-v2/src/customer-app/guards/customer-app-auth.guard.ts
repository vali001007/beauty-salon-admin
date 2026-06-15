import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { CustomerAppRequestContext, CustomerAppTokenPayload } from '../types.js';

type CustomerAppRequest = Request & {
  customerApp?: CustomerAppRequestContext;
};

@Injectable()
export class CustomerAppAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerAppRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('请先登录 Ami Glow');

    try {
      const payload = await this.jwtService.verifyAsync<CustomerAppTokenPayload>(token);
      if (!payload.openid) throw new UnauthorizedException('Ami Glow 登录态无效');
      request.customerApp = { ...payload, token };
      return true;
    } catch {
      throw new UnauthorizedException('Ami Glow 登录态已失效，请重新登录');
    }
  }

  private extractToken(request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization) return undefined;
    const [type, token] = authorization.split(' ');
    return type?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
