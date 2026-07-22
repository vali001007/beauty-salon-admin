import 'reflect-metadata';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BrainModule } from '../src/brain/brain.module.js';
import { BrainCapabilityCatalogService } from '../src/brain/capability/brain-capability-catalog.service.js';
import type { BrainCapabilityCandidate } from '../src/brain/capability/brain-capability.types.js';
import { BrainOntologyRuntimeService } from '../src/brain/cognition/brain-ontology-runtime.service.js';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainEvalService } from '../src/brain/governance/brain-eval.service.js';
import { BrainGovernanceApprovalService } from '../src/brain/governance/brain-governance-approval.service.js';
import { BrainCapabilityRegenerationWorkerService } from '../src/brain/governance/brain-capability-regeneration-worker.service.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), BrainModule] })
class AmiBrainReleasePilotModule {}

type PilotOptions = {
  releaseKey: string;
  resourceVersionIds: number[];
  storeId: number;
  userId: number;
  rollbackAfterEval: boolean;
  preferFallback: boolean;
  dryRun: boolean;
  evaluateOnly: boolean;
  resumeEvalRunId?: number;
  caseKeys: string[];
  archiveOnFailure: boolean;
  regenerationRequirement?: string;
};

async function main() {
  loadWorkspaceEnvironment(await detectWorkspaceRoot());
  const options = parseOptions(process.argv.slice(2));
  process.env.BRAIN_COGNITION_MODE = 'model';
  process.env.BRAIN_PLANNER_MODE = 'model';
  process.env.TERMINAL_AUTOMATION_SCHEDULER = 'disabled';
  if (options.preferFallback) preferConfiguredFallbackAsPrimary();
  process.stderr.write('[ami-brain-release-pilot] bootstrapping application context\n');
  const app = await NestFactory.createApplicationContext(AmiBrainReleasePilotModule, {
    logger: ['error', 'warn'],
  });
  try {
    process.stderr.write('[ami-brain-release-pilot] application context ready\n');
    const prisma = app.get(PrismaService, { strict: false });
    const releaseService = app.get(BrainReleaseService, { strict: false });
    const evalService = app.get(BrainEvalService, { strict: false });
    const capabilityCatalog = app.get(BrainCapabilityCatalogService, { strict: false });
    const ontologyRuntime = app.get(BrainOntologyRuntimeService, { strict: false });
    const approvalService = app.get(BrainGovernanceApprovalService, { strict: false });
    const regenerationWorker = app.get(BrainCapabilityRegenerationWorkerService, { strict: false });
    if (options.dryRun) {
      const resources = await prisma.brainResourceVersion.findMany({
        where: { id: { in: options.resourceVersionIds } },
        select: { id: true, resourceType: true, resourceKey: true, version: true, status: true, snapshot: true },
        orderBy: { id: 'asc' },
      });
      if (resources.length !== new Set(options.resourceVersionIds).size) throw new Error('release_pilot_resource_not_found');
      const catalogReport = await capabilityCatalog.validateEnabledCapabilities(
        resources
          .filter((item) => item.resourceType === 'skill' && item.snapshot && typeof item.snapshot === 'object' && !Array.isArray(item.snapshot))
          .map((item) => item.snapshot as unknown as BrainCapabilityCandidate),
      );
      console.log(JSON.stringify({
        mode: 'dry-run',
        releaseKey: options.releaseKey,
        resources: resources.map(({ snapshot: _snapshot, ...item }) => item),
        catalogValid: catalogReport.valid,
        catalogIssues: catalogReport.issues,
        willActivate: false,
      }, null, 2));
      return;
    }
    process.stderr.write('[ami-brain-release-pilot] creating rollout sequence\n');
    const sequence = await loadOrCreateSequence(prisma, releaseService, options);
    const shadow = (sequence.items as Array<{ id: number; releaseKey: string }>)[0];
    if (!shadow) throw new Error('shadow_release_not_created');
    const releaseSnapshot = await releaseService.freezeEvaluationRelease(shadow.id);
    process.stderr.write(`[ami-brain-release-pilot] shadow release ${shadow.id} frozen\n`);
    const resumedRun = options.resumeEvalRunId
      ? await prisma.brainEvalRun.findFirst({ where: { id: options.resumeEvalRunId, releaseId: shadow.id } })
      : undefined;
    if (options.resumeEvalRunId && !resumedRun) throw new Error('resume_eval_run_not_found');
    const resumedSummary = asRecord(resumedRun?.summary);
    if (
      resumedRun &&
      resumedSummary.releaseFingerprint !== releaseSnapshot.releaseFingerprint
    ) {
      throw new Error('resume_eval_release_fingerprint_changed');
    }
    let catalogReport = resumedRun
      ? { valid: true, issues: [] }
      : await capabilityCatalog.validateEnabledCapabilities(releaseSnapshot.capabilityCandidates);
    if (resumedRun) {
      try {
        catalogReport = await capabilityCatalog.validateEnabledCapabilities(releaseSnapshot.capabilityCandidates);
      } catch (error) {
        process.stderr.write(
          `[ami-brain-release-pilot] resume catalog prewarm skipped: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }
    if (options.regenerationRequirement) {
      const submitted = await approvalService.submitModificationRequirement({
        releaseId: shadow.id,
        requirement: options.regenerationRequirement,
        createdBy: options.userId,
      });
      await regenerationWorker.processQueued(1, `ami-brain-release-pilot-${process.pid}`);
      const job = await prisma.brainCapabilityRegenerationJob.findUnique({
        where: { id: submitted.job.id },
        select: {
          id: true,
          status: true,
          affectedCapabilities: true,
          generatedResourceVersionIds: true,
          report: true,
          errorCode: true,
          errorMessage: true,
        },
      });
      console.log(JSON.stringify({ catalogIssues: catalogReport.issues, regenerationJob: job }, null, 2));
      return;
    }
    if (!catalogReport.valid) {
      throw new Error(`candidate_catalog_invalid:${JSON.stringify(catalogReport.issues)}`);
    }
    const definitionVersionIds = [
      ...new Set(
        releaseSnapshot.capabilityCandidates.flatMap((candidate) => {
          if (!Array.isArray(candidate.definitionRefs)) return [];
          return candidate.definitionRefs.flatMap((ref) => {
            if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return [];
            const versionId = Number((ref as Record<string, unknown>).versionId);
            return Number.isInteger(versionId) && versionId > 0 ? [versionId] : [];
          });
        }),
      ),
    ];
    await ontologyRuntime.loadEvaluationSnapshot(definitionVersionIds);

    const run = resumedRun ?? await evalService.createEvalRun({
          storeId: options.storeId,
          userId: options.userId,
          permissions: [],
          releaseId: shadow.id,
        });
    if (!run) throw new Error('eval_run_not_created');
    process.stderr.write(`[ami-brain-release-pilot] eval run ${run.id} ${options.resumeEvalRunId ? 'resuming' : 'started'}\n`);
    if (options.resumeEvalRunId) {
      await evalService.runEvalNow({
        evalRunId: run.id,
        storeId: options.storeId,
        userId: options.userId,
        permissions: [],
        ...(options.caseKeys.length ? { caseKeys: options.caseKeys } : {}),
      });
    }
    const completed = await waitForEval(prisma, run.id);
    const summary = asRecord(completed.summary);
    if (completed.status !== 'completed' || summary.canRelease !== true) {
      let archivedReleaseIds: number[] = [];
      if (options.archiveOnFailure) {
        const releases = sequence.items as Array<{ id: number; status?: string }>;
        for (const release of releases) {
          if (release.status === 'draft') {
            await releaseService.rejectRelease({ releaseId: release.id, reason: `eval_run_${run.id}_gate_failed` });
            archivedReleaseIds.push(release.id);
          }
        }
      }
      throw new Error(`release_gate_failed:${run.id}:${completed.status}:archived=${archivedReleaseIds.join(',')}:${JSON.stringify(summary)}`);
    }

    if (options.evaluateOnly) {
      console.log(JSON.stringify({
        mode: 'evaluate-only',
        sequenceReleaseIds: (sequence.items as Array<{ id: number }>).map((item) => item.id),
        shadowReleaseId: shadow.id,
        evalRunId: run.id,
        evalSummary: summary,
        activated: false,
      }, null, 2));
      return;
    }

    const activated = await releaseService.activateRelease({
      releaseId: shadow.id,
      activatedBy: options.userId,
    });
    let rollbackTarget: unknown;
    if (options.rollbackAfterEval) {
      rollbackTarget = await releaseService.rollbackToRules({
        releaseId: shadow.id,
        reason: 'candidate_shadow_release_pilot_completed',
      });
    }

    console.log(
      JSON.stringify(
        {
          sequenceReleaseIds: (sequence.items as Array<{ id: number }>).map((item) => item.id),
          shadowReleaseId: shadow.id,
          evalRunId: run.id,
          evalSummary: summary,
          activatedStatus: (activated as { status?: string }).status,
          rolledBackToRules: options.rollbackAfterEval,
          rollbackTarget,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function detectWorkspaceRoot(): Promise<string> {
  for (const candidate of [process.cwd(), resolve(process.cwd(), '..', '..')]) {
    try {
      await access(resolve(candidate, 'packages/server-v2/prisma/schema.prisma'));
      return candidate;
    } catch {
      // Continue searching from npm --prefix working directories.
    }
  }
  throw new Error('ami_brain_release_pilot_workspace_root_not_found');
}

async function loadOrCreateSequence(
  prisma: PrismaService,
  releaseService: BrainReleaseService,
  options: PilotOptions,
) {
  const existing = await prisma.brainRelease.findMany({
    where: { releaseKey: { startsWith: `${options.releaseKey}-` } },
    select: {
      id: true,
      releaseKey: true,
      status: true,
      items: { select: { resourceVersionId: true } },
    },
    orderBy: { id: 'asc' },
  });
  if (!existing.length) {
    return releaseService.createRolloutSequence({
      releaseKey: options.releaseKey,
      resourceVersionIds: options.resourceVersionIds,
      createdBy: options.userId,
    });
  }
  const expectedKeys = ['shadow', 'canary-5', 'canary-20', 'canary-50', 'full'].map(
    (suffix) => `${options.releaseKey}-${suffix}`,
  );
  if (
    existing.length !== expectedKeys.length ||
    existing.some((release, index) => release.releaseKey !== expectedKeys[index]) ||
    existing.some(
      (release) =>
        release.items.length !== options.resourceVersionIds.length ||
        release.items.some((item) => !options.resourceVersionIds.includes(item.resourceVersionId)),
    )
  ) {
    throw new Error('release_sequence_conflict');
  }
  if (existing[0].status !== 'draft') throw new Error(`shadow_release_not_draft:${existing[0].status}`);
  return {
    items: existing,
    stages: ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'],
  };
}

async function waitForEval(prisma: PrismaService, evalRunId: number) {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const run = await prisma.brainEvalRun.findUnique({ where: { id: evalRunId } });
    if (!run) throw new Error(`eval_run_not_found:${evalRunId}`);
    if (run.status === 'completed' || run.status === 'failed') return run;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`eval_run_timeout:${evalRunId}`);
}

function parseOptions(args: string[]): PilotOptions {
  const values = new Map(
    args
      .filter((arg) => arg.startsWith('--') && arg.includes('='))
      .map((arg) => {
        const separator = arg.indexOf('=');
        return [arg.slice(2, separator), arg.slice(separator + 1)] as const;
      }),
  );
  const releaseKey = required(values.get('release-key'), 'release-key');
  const resourceVersionIds = required(values.get('resource-version-ids'), 'resource-version-ids')
    .split(',')
    .map((value) => Number(value.trim()));
  const storeId = Number(required(values.get('store-id'), 'store-id'));
  const userId = Number(required(values.get('user-id'), 'user-id'));
  const resumeEvalRunId = values.get('resume-eval-run-id') ? Number(values.get('resume-eval-run-id')) : undefined;
  if (resourceVersionIds.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('resource-version-ids must contain positive integers');
  }
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('store-id must be a positive integer');
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('user-id must be a positive integer');
  if (resumeEvalRunId !== undefined && (!Number.isInteger(resumeEvalRunId) || resumeEvalRunId <= 0)) {
    throw new Error('resume-eval-run-id must be a positive integer');
  }
  return {
    releaseKey,
    resourceVersionIds,
    storeId,
    userId,
    rollbackAfterEval: values.get('rollback-after-eval') === 'true',
    preferFallback: values.get('prefer-fallback') === 'true',
    dryRun: values.get('dry-run') === 'true',
    evaluateOnly: values.get('evaluate-only') === 'true',
    resumeEvalRunId,
    caseKeys: (values.get('case-keys') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    archiveOnFailure: values.get('archive-on-failure') === 'true',
    regenerationRequirement: values.get('regeneration-requirement')?.trim() || undefined,
  };
}

function preferConfiguredFallbackAsPrimary() {
  const provider = process.env.LLM_FALLBACK_PROVIDER?.trim();
  const model = process.env.LLM_FALLBACK_MODEL?.trim();
  const apiKey = process.env.LLM_FALLBACK_API_KEY?.trim();
  const baseUrl = process.env.LLM_FALLBACK_BASE_URL?.trim();
  if (!provider || !model || !apiKey || !baseUrl) throw new Error('configured_fallback_unavailable');
  process.env.LLM_PROVIDER = provider;
  process.env.LLM_MODEL = model;
  process.env.LLM_API_KEY = apiKey;
  process.env.LLM_BASE_URL = baseUrl;
  process.env.LLM_CHAT_PATH = process.env.LLM_FALLBACK_CHAT_PATH || '/chat/completions';
  process.env.LLM_FALLBACK_PROVIDER = '';
  process.env.LLM_FALLBACK_MODEL = '';
  process.env.LLM_FALLBACK_API_KEY = '';
  process.env.LLM_FALLBACK_BASE_URL = '';
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`missing --${name}`);
  return value.trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
