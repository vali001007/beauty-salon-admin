import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

describe('Brain Prisma schema', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/ami_core_test',
    }),
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exposes brain namespace models', () => {
    expect(prisma.brainConversation).toBeDefined();
    expect(prisma.brainMetric).toBeDefined();
    expect(prisma.brainSkillRegistry).toBeDefined();
    expect(prisma.brainRunStep).toBeDefined();
  });
});
