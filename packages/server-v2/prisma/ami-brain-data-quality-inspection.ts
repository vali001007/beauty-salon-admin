import 'reflect-metadata';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { BrainModule } from '../src/brain/brain.module.js';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainDomainServiceCapabilityExecutor } from '../src/brain/capability/executors/brain-domain-service-capability.executor.js';
import { BrainInspectionService } from '../src/brain/inspection/brain-inspection.service.js';
import { BrainDataQualityGuardService } from '../src/brain/inspection/brain-data-quality-guard.service.js';
import { buildBrainDataQualityInspectionRules } from '../src/brain/seed/brain-mvp-seed-plan.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), BrainModule] })
class AmiBrainDataQualityInspectionModule {}

async function main() {
  loadWorkspaceEnvironment(await detectWorkspaceRoot());
  const args = process.argv.slice(2);
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const apply = args.includes('--apply');
  const confirmed = args.includes('--yes');
  const run = args.includes('--run');
  const details = args.includes('--details');
  const candidateGuards = args.includes('--candidate-guards');
  const storeId = Number(value('store-id') ?? 6);
  if (apply && !confirmed) throw new Error('data_quality_rule_sync_confirmation_required');
  if (!Number.isInteger(storeId) || storeId < 1) throw new Error('data_quality_inspection_store_id_invalid');

  const rules = buildBrainDataQualityInspectionRules().map((rule) => ({
    ...rule,
    enabled: false,
    condition: rule.condition as Prisma.InputJsonValue,
    suggestionTpl: rule.suggestionTpl as Prisma.InputJsonValue,
  }));
  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', storeId, run, candidateGuards, rules }, null, 2)}\n`);
    return;
  }

  if (candidateGuards) process.env.BRAIN_ALLOW_CANDIDATE_INSPECTION_GUARDS = 'true';
  const app = await NestFactory.createApplicationContext(AmiBrainDataQualityInspectionModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const inspection = app.get(BrainInspectionService, { strict: false });
    const guard = app.get(BrainDataQualityGuardService, { strict: false });
    const domainExecutor = app.get(BrainDomainServiceCapabilityExecutor, { strict: false });
    const synced = [];
    for (const rule of rules) {
      const row = await prisma.brainInspectionRule.upsert({
        where: { ruleKey_version: { ruleKey: rule.ruleKey, version: rule.version } },
        update: rule,
        create: rule,
      });
      synced.push({ id: row.id, ruleKey: row.ruleKey, version: row.version, enabled: row.enabled });
    }
    const inspectionRun = run
      ? await inspection.runInspection({
          storeId,
          triggerType: 'manual',
          ruleKeys: rules.map((rule) => rule.ruleKey),
          includeDisabledRules: true,
          planFindings: false,
        })
      : undefined;
    const findings = run
      ? await prisma.brainInspectionFinding.findMany({
          where: { storeId, runId: inspectionRun?.runId },
          select: { id: true, ruleKey: true, objectType: true, objectId: true, severity: true, title: true, evidence: true, suggestion: true },
          orderBy: [{ severity: 'desc' }, { ruleKey: 'asc' }, { id: 'asc' }],
        })
      : [];
    const findingSummary = rules.reduce<Record<string, number>>((summary, rule) => {
      summary[rule.ruleKey] = 0;
      return summary;
    }, {});
    for (const finding of findings) {
      findingSummary[finding.ruleKey] = (findingSummary[finding.ruleKey] ?? 0) + 1;
    }
    const samples = Object.keys(findingSummary).flatMap((ruleKey) =>
      findings.filter((finding) => finding.ruleKey === ruleKey).slice(0, 3),
    );
    const guardAssessments = candidateGuards
      ? Object.fromEntries(await Promise.all([
          'store_operations_overview',
          'front_desk_operations_overview',
          'beautician_service_overview',
          'inventory_operations_overview',
          'inventory_procurement_advice',
        ].map(async (capabilityKey) => [
          capabilityKey,
          await guard.assess({ storeId, capabilityKey }),
        ])))
      : undefined;
    const guardedExecution = candidateGuards
      ? await domainExecutor.execute({
          card: { key: 'inventory_procurement_advice', version: 1 } as never,
          question: '当前库存采购建议',
          args: { objective: '查询库存采购建议', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
          context: {
            userId: 0,
            storeId,
            visibleStoreIds: [storeId],
            roles: ['system'],
            permissions: ['core:inventory:stock'],
            deniedPermissions: [],
            requestId: `data_quality_guard_${storeId}`,
            timezone: 'Asia/Shanghai',
          },
        } as never)
      : undefined;
    process.stdout.write(`${JSON.stringify({
      mode: 'applied',
      storeId,
      synced,
      inspectionRun,
      findingSummary,
      guardAssessments,
      guardedExecution,
      samples,
      ...(details ? { findings } : {}),
    }, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

async function detectWorkspaceRoot() {
  for (const candidate of [resolve(process.cwd()), resolve(process.cwd(), '..'), resolve(process.cwd(), '..', '..')]) {
    try {
      await access(resolve(candidate, 'packages', 'server-v2', 'package.json'));
      return candidate;
    } catch {
      // Continue searching parent candidates.
    }
  }
  throw new Error('workspace_root_not_found');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
