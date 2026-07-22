import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface DatabasePoolConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export function resolveDatabasePoolConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabasePoolConfig {
  const defaultPoolMax = env.NODE_ENV === 'production' ? 5 : 2;

  return {
    max: readPositiveInteger(env.DATABASE_POOL_MAX, defaultPoolMax),
    idleTimeoutMillis: readPositiveInteger(env.DATABASE_IDLE_TIMEOUT_MS, 10000),
    connectionTimeoutMillis: readPositiveInteger(
      env.DATABASE_CONNECTION_TIMEOUT_MS,
      10000,
    ),
  };
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly queryCounter = new AsyncLocalStorage<{ count: number }>();

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      ...resolveDatabasePoolConfig(),
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
