import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * 终端设备认证守卫
 * 从 Authorization header 中提取 device token 并验证设备身份
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少设备认证令牌');
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET') || 'fallback-secret',
      });

      if (payload.type !== 'device') {
        const userId = Number(payload.sub);
        if (!userId || Number.isNaN(userId)) {
          throw new UnauthorizedException('无效的终端访问令牌');
        }

        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          include: { stores: true, roles: { include: { role: true } } },
        });

        if (!user || user.deletedAt || user.status !== 'active') {
          throw new UnauthorizedException('用户不存在或已被禁用');
        }

        const requestedStoreId = Number(request.headers['x-store-id']);
        const allowedStoreIds = user.stores.map((store) => store.storeId);
        const isSuperAdmin = user.roles.some(
          (item) => item.role.key === 'super_admin' || item.role.permissions.includes('*'),
        );
        const requestedStore = requestedStoreId
          ? await this.prisma.store.findFirst({
              where: { id: requestedStoreId, deletedAt: null, status: 'active' },
              select: { id: true },
            })
          : null;
        const storeId =
          requestedStore && (isSuperAdmin || allowedStoreIds.includes(requestedStoreId))
            ? requestedStoreId
            : allowedStoreIds[0];
        if (!storeId) {
          throw new UnauthorizedException('当前用户没有可访问门店');
        }

        request.device = {
          id: 0,
          deviceCode: `user-session-${user.id}`,
          storeId,
          name: user.name,
          model: 'Ami Aura Lite',
          status: 'online',
          userId: user.id,
        };

        return true;
      }

      const device = await this.prisma.terminalDevice.findUnique({
        where: { id: payload.deviceId },
        include: { store: true },
      });

      if (!device || device.status === 'disabled') {
        throw new UnauthorizedException('设备不存在或已禁用');
      }

      // 将设备信息附加到请求对象
      request.device = {
        id: device.id,
        deviceCode: device.deviceCode,
        storeId: device.storeId,
        name: device.name,
        model: device.model,
        status: device.status,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('设备令牌无效或已过期');
    }
  }
}
