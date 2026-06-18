import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<any>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: 1,
    username: 'testuser',
    passwordHash: '$2b$12$hashedpassword',
    name: 'Test User',
    phone: '13800138000',
    email: 'test@example.com',
    avatar: null,
    status: 'active',
    deletedAt: null,
    roles: [
      {
        role: {
          key: 'admin',
          permissions: ['user:read', 'user:write'],
        },
      },
    ],
    stores: [{ storeId: 1 }],
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('7d'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: {} },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  describe('login', () => {
    it('should return tokens and user info with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 12);
      const user = { ...mockUser, passwordHash: hashedPassword };
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.refreshToken.create.mockResolvedValue({ token: 'mock-refresh-token' });

      const result = await service.login({ username: 'testuser', password: 'password123' });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.username).toBe('testuser');
      expect(result.user.roles).toEqual(['admin']);
      expect(result.user.permissions).toEqual(['user:read', 'user:write']);
    });

    it('should throw UnauthorizedException with invalid password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 12);
      const user = { ...mockUser, passwordHash: hashedPassword };
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login({ username: 'testuser', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ username: 'nonexistent', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      await expect(
        service.login({ username: 'testuser', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for disabled user', async () => {
      const hashedPassword = await bcrypt.hash('password123', 12);
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
        status: 'disabled',
      });

      await expect(
        service.login({ username: 'testuser', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 2,
        username: 'newuser',
        name: 'New User',
        phone: '13900139000',
      });
      prisma.refreshToken.create.mockResolvedValue({ token: 'mock-refresh-token' });

      const result = await service.register({
        username: 'newuser',
        password: 'password123',
        name: 'New User',
        phone: '13900139000',
      });

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.username).toBe('newuser');
      expect(result.user.roles).toEqual([]);
      expect(result.user.permissions).toEqual([]);
    });

    it('should throw UnauthorizedException for duplicate username', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          username: 'testuser',
          password: 'password123',
          name: 'Test',
          phone: '13800138000',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens with valid refresh token', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        token: 'valid-refresh-token',
        expiresAt: futureDate,
      });
      prisma.refreshToken.delete.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({ token: 'new-refresh-token' });

      const result = await service.refreshToken('valid-refresh-token');

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw UnauthorizedException with invalid refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException with expired refresh token', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        token: 'expired-token',
        expiresAt: pastDate,
      });

      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should delete all refresh tokens for the user', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.logout(1);

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });
  });
});
