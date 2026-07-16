import 'reflect-metadata';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BrainModule } from '../src/brain/brain.module.js';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainInspectionRepairPreviewService } from '../src/brain/inspection/brain-inspection-repair-preview.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REPAIR_RULE_KEYS = [
  'reception_in_store_state_stale',
  'service_task_state_inconsistent',
  'inventory_safety_stock_invalid',
  'procurement_evidence_missing',
] as const;

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), BrainModule] })
class AmiBrainInspectionRepairPreviewModule {}

async function main() {
  loadWorkspaceEnvironment(await detectWorkspaceRoot());
  const args = process.argv.slice(2);
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const storeId = Number(value('store-id') ?? 6);
  const findingId = value('finding-id') ? Number(value('finding-id')) : undefined;
  if (!Number.isInteger(storeId) || storeId < 1) throw new Error('inspection_repair_preview_store_id_invalid');
  if (findingId !== undefined && (!Number.isInteger(findingId) || findingId < 1)) {
    throw new Error('inspection_repair_preview_finding_id_invalid');
  }

  const app = await NestFactory.createApplicationContext(AmiBrainInspectionRepairPreviewModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const service = app.get(BrainInspectionRepairPreviewService, { strict: false });
    const selected = findingId
      ? await prisma.brainInspectionFinding.findMany({
          where: { storeId, id: findingId },
          select: { id: true, ruleKey: true },
          take: 1,
        })
      : (await Promise.all(REPAIR_RULE_KEYS.map((ruleKey) => prisma.brainInspectionFinding.findFirst({
          where: { storeId, status: { in: ['open', 'in_progress'] }, ruleKey },
          select: { id: true, ruleKey: true },
          orderBy: { id: 'asc' },
        })))).filter((finding): finding is { id: number; ruleKey: string } => finding !== null);
    const previews = await Promise.all(selected.map((finding) => service.getPreview({ storeId, findingId: finding.id })));
    process.stdout.write(`${JSON.stringify({
      mode: 'read-only',
      storeId,
      findingCount: selected.length,
      previews,
      assertions: {
        allPreviewOnly: previews.every((preview) => preview.policy.mode === 'preview_only'),
        noAutoExecute: previews.every((preview) => preview.policy.autoExecute === false),
        noBusinessWrite: previews.every((preview) => preview.policy.createsBusinessWrite === false),
      },
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
