import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/store-metrics-client/index.js';

export class StoreMetricsScriptPrisma extends PrismaClient {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL!,
        max: Number(process.env.DATABASE_POOL_MAX || 2),
        idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
        connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 60000),
      }),
    });
  }

  async runWithQueryCounter<T>(task: () => Promise<T>) {
    return { value: await task(), queryCount: 0 };
  }
}
