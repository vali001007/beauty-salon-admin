import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { roles: { include: { role: true } }, stores: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('账号已被禁用');
    }

    const tokens = await this.generateTokens(user.id);
    const permissions = this.collectPermissions(user.roles);

    return {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        phone: user.phone,
        email: user.email,
        avatar: user.avatar,
        roles: user.roles.map((ur) => ur.role.key),
        permissions,
        stores: user.stores.map((us) => us.storeId),
        storeIds: user.stores.map((us) => us.storeId),
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new UnauthorizedException('用户名已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
      },
    });

    const tokens = await this.generateTokens(user.id);

    return {
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        phone: user.phone,
        roles: [],
        permissions: [],
        stores: [],
        storeIds: [],
      },
    };
  }

  async refreshToken(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = await this.generateTokens(stored.userId);
    return { token: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  async logout(userId: number) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async getUserInfo(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } }, stores: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('用户不存在');
    }

    const permissions = this.collectPermissions(user.roles);

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar,
      roles: user.roles.map((ur) => ur.role.key),
      permissions,
      stores: user.stores.map((us) => us.storeId),
      storeIds: user.stores.map((us) => us.storeId),
    };
  }

  private async generateTokens(userId: number) {
    const accessToken = this.jwtService.sign({ sub: userId });

    const refreshToken = randomBytes(40).toString('hex');
    const refreshExpiry = this.config.get('JWT_REFRESH_EXPIRY', '7d');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(refreshExpiry) || 7);

    await this.prisma.refreshToken.create({
      data: { userId, token: refreshToken, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private collectPermissions(
    roles: Array<{ role: { permissions: string[] } }>,
  ): string[] {
    const allPermissions = new Set<string>();
    for (const { role } of roles) {
      for (const perm of role.permissions) {
        allPermissions.add(perm);
      }
    }
    return Array.from(allPermissions);
  }
}
