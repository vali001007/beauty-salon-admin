import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly principalCache = new Map<number, { expiresAt: number; principal: Record<string, unknown> }>();
  private readonly principalCacheTtlMs: number;

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
    const configuredTtl = Number(config.get('JWT_PRINCIPAL_CACHE_TTL_MS') ?? 5_000);
    this.principalCacheTtlMs = Number.isFinite(configuredTtl)
      ? Math.max(0, Math.min(30_000, Math.trunc(configuredTtl)))
      : 5_000;
  }

  async validate(payload: { sub: number }) {
    const now = Date.now();
    const cached = this.principalCache.get(payload.sub);
    if (cached && cached.expiresAt > now) return cached.principal;
    if (cached) this.principalCache.delete(payload.sub);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } }, stores: true, supplySupplier: true },
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

    const principal = {
      id: user.id,
      username: user.username,
      name: user.name,
      roles: user.roles.map((ur) => ur.role.key),
      permissions: Array.from(permissions),
      stores: user.stores.map((us) => us.storeId),
      supplySupplierId: user.supplySupplierId,
      supplySupplierName: user.supplySupplier?.name,
    };
    if (this.principalCacheTtlMs > 0) {
      this.principalCache.set(payload.sub, { expiresAt: now + this.principalCacheTtlMs, principal });
      if (this.principalCache.size > 1_000) {
        const oldestUserId = this.principalCache.keys().next().value;
        if (oldestUserId !== undefined) this.principalCache.delete(oldestUserId);
      }
    }
    return principal;
  }
}
