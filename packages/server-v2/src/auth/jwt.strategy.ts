import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.access_token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') || 'fallback-secret',
    });
  }

  async validate(payload: { sub: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } }, stores: true },
    });

    if (!user || user.deletedAt || user.status !== 'active') {
      return null;
    }

    const permissions = new Set<string>();
    for (const { role } of user.roles) {
      for (const perm of role.permissions) {
        permissions.add(perm);
      }
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      roles: user.roles.map((ur) => ur.role.key),
      permissions: Array.from(permissions),
      stores: user.stores.map((us) => us.storeId),
    };
  }
}
