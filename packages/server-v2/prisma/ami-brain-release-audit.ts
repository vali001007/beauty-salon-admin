import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

async function main() {
  loadWorkspaceEnvironment(await detectWorkspaceRoot());
  const value = (name: string) => process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const releaseKey = value('release-key')?.trim();
  const details = process.argv.includes('--details');
  if (!releaseKey) throw new Error('release_audit_release_key_required');
  const prisma = new PrismaService();
  try {
    const releases = await prisma.brainRelease.findMany({
      where: { releaseKey: { startsWith: `${releaseKey}-` } },
      include: { items: { select: { resourceVersionId: true, resourceKey: true, version: true } } },
      orderBy: { id: 'asc' },
    });
    const releaseIds = releases.map((release) => release.id);
    const activeReleases = await prisma.brainRelease.findMany({
      where: { status: 'active' },
      select: { id: true, releaseKey: true, scope: true, status: true, activatedAt: true },
      orderBy: { id: 'asc' },
    });
    const evalRuns = releaseIds.length
      ? await prisma.brainEvalRun.findMany({
          where: { releaseId: { in: releaseIds } },
          include: { _count: { select: { evalResults: true } } },
          orderBy: { id: 'desc' },
        })
      : [];
    const failedResults = details && evalRuns.length
      ? await prisma.brainEvalResult.findMany({
          where: { evalRunId: evalRuns[0]!.id, deterministicPassed: false },
          select: {
            caseKey: true,
            roleKey: true,
            question: true,
            answer: true,
            deterministicGrade: true,
            failureCluster: true,
            error: true,
            metadata: true,
            latencyMs: true,
          },
          orderBy: { caseKey: 'asc' },
        })
      : [];
    const failedRunIds = failedResults
      .map((result) => Number(record(result.metadata).runId))
      .filter((id) => Number.isInteger(id) && id > 0);
    const failedRuns = details && failedRunIds.length
      ? await prisma.brainRun.findMany({
          where: { id: { in: failedRunIds } },
          select: {
            id: true,
            status: true,
            error: true,
            steps: {
              select: { stepKey: true, layer: true, status: true, error: true },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: { id: 'asc' },
        })
      : [];
    process.stdout.write(`${JSON.stringify({
      mode: 'read-only',
      releaseKey,
      activeReleases,
      releases: releases.map((release) => ({
        id: release.id,
        releaseKey: release.releaseKey,
        status: release.status,
        itemCount: release.items.length,
        resourceVersionIds: release.items.map((item) => item.resourceVersionId).sort((a, b) => a - b),
      })),
      evalRuns: evalRuns.map((run) => ({
        id: run.id,
        releaseId: run.releaseId,
        status: run.status,
        caseCount: run.caseCount,
        resultCount: run._count.evalResults,
        passedCount: run.passedCount,
        failedCount: run.failedCount,
        summary: run.summary,
        error: run.error,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      })),
      ...(details ? { failedResults: failedResults.map(summarizeFailedResult) } : {}),
      ...(details ? { failedRuns } : {}),
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

function summarizeFailedResult(result: {
  caseKey: string;
  roleKey: string | null;
  question: string;
  answer: string;
  deterministicGrade: unknown;
  failureCluster: string | null;
  error: unknown;
  metadata: unknown;
  latencyMs: number | null;
}) {
  const metadata = record(result.metadata);
  const actual = record(metadata.actual);
  const expected = record(metadata.expected);
  const grade = record(result.deterministicGrade);
  const layers = record(grade.layers);
  return {
    caseKey: result.caseKey,
    roleKey: result.roleKey,
    question: result.question,
    answer: result.answer,
    failureCluster: result.failureCluster,
    latencyMs: result.latencyMs,
    runId: Number(metadata.runId) || null,
    expectedCapabilities: strings(expected.capabilityKeys),
    actualCapabilities: strings(actual.capabilityKeys),
    semanticIntent: record(actual.semanticIntent),
    completion: record(actual.completion),
    layerFailures: Object.fromEntries(Object.entries(layers).flatMap(([key, value]) => {
      const failures = strings(record(value).failures);
      return failures.length ? [[key, failures]] : [];
    })),
    error: result.error,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
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
