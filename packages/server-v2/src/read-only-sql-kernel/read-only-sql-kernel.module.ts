import { Module } from '@nestjs/common';
import { ReadOnlySqlCostGuard } from './read-only-sql-cost-guard.js';
import { ReadOnlySqlExecutor } from './read-only-sql-executor.js';
import { ReadOnlySqlGuard } from './read-only-sql-guard.js';
import { ReadOnlySqlParser } from './read-only-sql-parser.js';

const providers = [ReadOnlySqlParser, ReadOnlySqlGuard, ReadOnlySqlCostGuard, ReadOnlySqlExecutor];

@Module({ providers, exports: providers })
export class ReadOnlySqlKernelModule {}
