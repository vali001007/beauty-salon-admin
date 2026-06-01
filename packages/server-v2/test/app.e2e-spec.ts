import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('App (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let validPasswordHash: string;

  beforeAll(async () => {
    // Set required env vars for JWT
    process.env.JWT_SECRET = 'test-secret-key-for-e2e';
    process.env.JWT_ACCESS_EXPIRY = '15m';
    process.env.JWT_REFRESH_EXPIRY = '7d';

    validPasswordHash = await bcrypt.hash('password123', 12);

    const mockPrisma = createMockPrisma();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', {
      exclude: [{ path: 'v1/messages', method: RequestMethod.POST }],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('should return 200 with status ok', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res: any) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 with valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        username: 'admin',
        passwordHash: validPasswordHash,
        name: 'Admin',
        phone: '13800138000',
        email: 'admin@test.com',
        avatar: null,
        status: 'active',
        deletedAt: null,
        roles: [{ role: { key: 'admin', permissions: ['user:read'] } }],
        stores: [{ storeId: 1 }],
      });
      prisma.refreshToken.create.mockResolvedValue({
        token: 'mock-refresh-token',
      });

      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.token).toBeDefined();
          expect(res.body.refreshToken).toBeDefined();
          expect(res.body.user.username).toBe('admin');
        });
    });

    it('should return 401 with invalid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'wrongpassword' })
        .expect(401);
    });
  });

  describe('AI routes', () => {
    it('should expose legacy POST /v1/messages without auth or CSRF token', () => {
      return request(app.getHttpServer())
        .post('/v1/messages')
        .send({
          model: 'claude-test',
          max_tokens: 64,
          messages: [{ role: 'user', content: 'hello' }],
        })
        .expect(201)
        .expect((res: any) => {
          expect(res.body.type).toBe('message');
          expect(res.body.role).toBe('assistant');
          expect(res.body.content?.[0]?.type).toBe('text');
          expect(res.body.content?.[0]?.text).toBeTruthy();
        });
    });

    it('should keep POST /api/ai/chat/messages protected by auth guard', () => {
      return request(app.getHttpServer())
        .post('/api/ai/chat/messages')
        .set('Cookie', ['csrf_token=test-csrf'])
        .set('x-csrf-token', 'test-csrf')
        .send({ messages: [{ role: 'user', content: 'hello' }] })
        .expect(401);
    });
  });

  describe('GET /api/auth/user-info', () => {
    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/auth/user-info')
        .expect(401);
    });

    it('should return user info with valid token', async () => {
      // Setup mock for login
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        username: 'admin',
        passwordHash: validPasswordHash,
        name: 'Admin',
        phone: '13800138000',
        email: 'admin@test.com',
        avatar: null,
        status: 'active',
        deletedAt: null,
        roles: [{ role: { key: 'admin', permissions: ['user:read'] } }],
        stores: [{ storeId: 1 }],
      });
      prisma.refreshToken.create.mockResolvedValue({
        token: 'mock-refresh-token',
      });

      // Login to get a token
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' });

      const token = loginRes.body.token;

      // The JWT strategy also calls prisma.user.findUnique to validate the token
      // Keep the mock returning the same user
      return request(app.getHttpServer())
        .get('/api/auth/user-info')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res: any) => {
          expect(res.body.username).toBe('admin');
          expect(res.body.roles).toContain('admin');
        });
    });
  });
});

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    customer: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
    marketingActivity: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    marketingAutomationStrategy: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    marketingAutomationExecution: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
    consumptionRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    customerHealthProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    role: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userRole: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    userStore: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    store: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    card: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    beautician: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    project: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventory: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    scheduling: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    reservation: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    aiAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };
}
