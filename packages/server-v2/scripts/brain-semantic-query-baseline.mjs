#!/usr/bin/env node
import process from 'node:process';
import { existsSync, mkdirSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SemanticDataModule } from '../dist/semantic-data/semantic-data.module.js';
import { BrainTimeRangeParserService } from '../dist/brain/cognition/brain-time-range-parser.service.js';
import { BrainSemanticQueryCapabilityExecutor } from '../dist/brain/capability/executors/brain-semantic-query-capability.executor.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(resolve(packageRoot, '.env'));
loadEnv(resolve(packageRoot, '.env.perf.local'));

const config = {
  storeId: positiveInteger('PERF_STORE_ID'),
  iterations: positiveInteger('PERF_BRAIN_ITERATIONS', 3),
  currentRange: dateRange(
    process.env.PERF_BRAIN_START_DATE,
    process.env.PERF_BRAIN_END_DATE,
    previousMonthRange(1),
  ),
  comparisonRange: dateRange(
    process.env.PERF_BRAIN_COMPARISON_START_DATE,
    process.env.PERF_BRAIN_COMPARISON_END_DATE,
    previousMonthRange(2),
  ),
  outputPath: resolve(
    packageRoot,
    process.env.PERF_BRAIN_INTERNAL_OUTPUT_PATH?.trim()
      || 'performance-baseline-output/brain-semantic-query-baseline-latest.json',
  ),
};

assertCompiledSourceFreshness();

class BrainSemanticQueryBaselineModule {}
Module({
  imports: [SemanticDataModule],
  providers: [BrainTimeRangeParserService, BrainSemanticQueryCapabilityExecutor],
})(BrainSemanticQueryBaselineModule);

const app = await NestFactory.createApplicationContext(BrainSemanticQueryBaselineModule, { logger: false });
try {
  const executor = app.get(BrainSemanticQueryCapabilityExecutor);
  const singlePeriod = await benchmark(executor, false);
  const comparisonPeriod = await benchmark(executor, true);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'internal_read_only_semantic_query',
    storeId: config.storeId,
    metricDefinitions: ['metric.product_sales_quantity', 'metric.product_sales_amount'],
    queryShape: {
      capabilityKey: 'product_sales_ranking',
      sameModel: true,
      sameDimensions: true,
      sameFilters: true,
      sameJoinPath: true,
      sameStoreScope: true,
      sameTimePolicy: true,
    },
    ranges: {
      current: config.currentRange,
      comparison: config.comparisonRange,
    },
    measurements: { singlePeriod, comparisonPeriod },
    acceptance: {
      singlePeriodDatabaseQueryReduction: reduction(
        singlePeriod.logicalQueryCount?.median,
        singlePeriod.databaseQueryCount?.median,
      ),
      comparisonPeriodDatabaseQueryReduction: reduction(
        comparisonPeriod.logicalQueryCount?.median,
        comparisonPeriod.databaseQueryCount?.median,
      ),
      threshold: 0.3,
    },
    safety: {
      readOnly: true,
      createsConversation: false,
      invokesLanguageModel: false,
      writesBusinessData: false,
    },
  };
  report.acceptance.passed =
    report.acceptance.singlePeriodDatabaseQueryReduction >= report.acceptance.threshold
    && report.acceptance.comparisonPeriodDatabaseQueryReduction >= report.acceptance.threshold
    && singlePeriod.failureRate === 0
    && comparisonPeriod.failureRate === 0;

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  mkdirSync(dirname(config.outputPath), { recursive: true });
  writeFileSync(config.outputPath, serialized, 'utf8');
  writeSync(1, serialized);
  if (!report.acceptance.passed) process.exitCode = 1;
} finally {
  await app.close();
}

async function benchmark(executor, withComparison) {
  const samples = [];
  const logicalQueryCounts = [];
  const databaseQueryCounts = [];
  const failures = [];
  for (let index = 0; index < config.iterations; index += 1) {
    const started = performance.now();
    try {
      const result = await executor.execute(executionInput(withComparison, index));
      if (result.status !== 'completed' || result.grounding !== 'metric_query') {
        throw new Error(`unexpected_semantic_result:${result.status}:${result.grounding}`);
      }
      const logicalQueryCount = Number(result.metadata?.queryCount);
      const databaseQueryCount = Number(result.metadata?.databaseQueryCount);
      if (!Number.isFinite(logicalQueryCount) || !Number.isFinite(databaseQueryCount)) {
        throw new Error('semantic_query_count_metadata_missing');
      }
      logicalQueryCounts.push(logicalQueryCount);
      databaseQueryCounts.push(databaseQueryCount);
    } catch (error) {
      failures.push({ iteration: index + 1, error: error instanceof Error ? error.message : String(error) });
    }
    samples.push(performance.now() - started);
  }
  return {
    iterations: config.iterations,
    failureRate: failures.length / config.iterations,
    failures,
    responseMs: summary(samples),
    logicalQueryCount: summary(logicalQueryCounts),
    databaseQueryCount: summary(databaseQueryCounts),
  };
}

function executionInput(withComparison, iteration) {
  const time = structuredTime(config.currentRange, '当前期');
  return {
    card: {
      key: 'product_sales_ranking',
      version: 1,
      intents: ['query', 'ranking'],
      requiredPermissions: ['core:brain:use', 'core:order:products'],
      definitionRefs: [],
    },
    context: {
      userId: 1,
      storeId: config.storeId,
      visibleStoreIds: [config.storeId],
      roles: ['store_manager'],
      permissions: ['core:brain:use', 'core:order:products'],
      deniedPermissions: [],
      requestId: `brain-semantic-perf-${Date.now()}-${iteration}`,
      timezone: 'Asia/Shanghai',
    },
    runId: Date.now() + iteration,
    question: withComparison ? '查询商品销量和商品销售额并与上一期对比' : '查询商品销量和商品销售额',
    answerShape: withComparison ? 'comparison' : 'ranking',
    args: {
      objective: '验证同形状多指标只读取一次数据',
      time,
      ...(withComparison
        ? { comparisonTarget: { type: 'time', timeRange: structuredTime(config.comparisonRange, '对比期') } }
        : {}),
      entities: [],
      metrics: [
        { definitionKey: 'metric.product_sales_quantity' },
        { definitionKey: 'metric.product_sales_amount' },
      ],
      dimensions: [],
      filters: [],
      orderBy: [
        { definitionRef: { definitionKey: 'metric.product_sales_amount' }, direction: 'desc' },
      ],
      limit: 20,
    },
  };
}

function structuredTime(range, label) {
  return {
    label: `${label} ${range.startDate} 至 ${range.endDate}`,
    timezone: 'Asia/Shanghai',
    startDate: range.startDate,
    endDate: range.endDate,
  };
}

function dateRange(startDate, endDate, fallback) {
  if (!startDate?.trim() && !endDate?.trim()) return fallback;
  if (!isoDate(startDate) || !isoDate(endDate) || startDate > endDate) {
    throw new Error('Brain 性能日期范围必须是有效的 YYYY-MM-DD，且开始日期不得晚于结束日期');
  }
  return { startDate, endDate };
}

function previousMonthRange(monthsAgo) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 0));
  return { startDate: isoDateString(start), endDate: isoDateString(end) };
}

function summary(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1)),
  };
}

function percentile(sorted, value) {
  const position = (sorted.length - 1) * value;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function reduction(logicalCount, databaseCount) {
  if (!logicalCount) return 0;
  return round((logicalCount - databaseCount) / logicalCount);
}

function positiveInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function loadEnv(path) {
  if (existsSync(path)) process.loadEnvFile(path);
}

function assertCompiledSourceFreshness() {
  const source = resolve(packageRoot, 'src/brain/capability/executors/brain-semantic-query-capability.executor.ts');
  const compiled = resolve(packageRoot, 'dist/brain/capability/executors/brain-semantic-query-capability.executor.js');
  if (!existsSync(compiled)) throw new Error('缺少 dist，请先在 packages/server-v2 执行 npm run build');
  if (statSync(source).mtimeMs > statSync(compiled).mtimeMs) {
    throw new Error('Brain 执行器源码新于 dist，请先在 packages/server-v2 执行 npm run build');
  }
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && isoDateString(date) === value;
}

function isoDateString(value) {
  return value.toISOString().slice(0, 10);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
