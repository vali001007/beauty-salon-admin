import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly queryCounter = new AsyncLocalStorage<{ count: number }>();

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    });
    super({ adapter, log: [{ emit: 'event', level: 'query' }] });
    (this as any).$on('query', () => {
      const counter = PrismaService.queryCounter.getStore();
      if (counter) counter.count += 1;
    });
  }

  async runWithQueryCounter<T>(task: () => Promise<T>): Promise<{ value: T; queryCount: number }> {
    const counter = { count: 0 };
    const value = await PrismaService.queryCounter.run(counter, task);
    return { value, queryCount: counter.count };
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
