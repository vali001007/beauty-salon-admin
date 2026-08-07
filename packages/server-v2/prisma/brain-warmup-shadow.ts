import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BrainActiveReleaseWarmupService } from '../src/brain/governance/brain-active-release-warmup.service.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { createReleaseFingerprint } from '../src/brain/governance/brain-capability-regeneration-fingerprint.js';
import { extractBrainReleaseDefinitionVersionIds } from '../src/brain/governance/brain-release-definition-versions.js';

type JsonRecord = Record<string, any>;

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
}

function releaseMode(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord).mode : null;
}

function capabilityChecksum(items: Array<{ snapshot: unknown }>) {
  const keys = items
    .map((item) => item.snapshot as JsonRecord)
    .map((item) => String(item.capabilityKey ?? item.skillKey ?? item.key ?? ''))
    .filter(Boolean)
    .sort();
  return sha256(keys);
}

async function measurePipeline(pipeline: 'shared' | 'artifact') {
  process.env.BRAIN_RELEASE_PILOT_MODE = 'true';
  process.env.BRAIN_ONTOLOGY_WARMUP_PIPELINE = pipeline;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService) as any;
    const warmup = app.get(BrainActiveReleaseWarmupService);
    const releaseService = app.get(BrainReleaseService);
    const releases = await prisma.brainRelease.findMany({
      where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        status: true,
        scope: true,
        versionMap: true,
        rollout: true,
        items: {
          where: { resourceType: 'skill' },
          orderBy: { resourceVersionId: 'asc' },
          select: {
            resourceVersionId: true,
            resourceType: true,
            resourceKey: true,
            snapshot: true,
            resourceVersion: { select: { checksum: true } },
          },
        },
      },
    });
    const startedAt = Date.now();
    const results = [];
    for (const release of releases) {
      const mode = releaseMode(release.rollout);
      if (mode !== 'model' && mode !== 'shadow') continue;
      const result = await warmup.warmRelease({ releaseId: release.id, expectedStatus: 'active' });
      const definitionVersionIds = extractBrainReleaseDefinitionVersionIds(release.items.map((item: any) => item.snapshot));
      const releaseFingerprint = createReleaseFingerprint(release.items, release.rollout);
      const artifact = pipeline === 'artifact'
        ? await prisma.brainWarmupArtifact.findFirst({
            where: { releaseId: release.id, releaseFingerprint, status: 'ready' },
            orderBy: { builtAt: 'desc' },
            select: {
              releaseFingerprint: true,
              definitionSetFingerprint: true,
              definitionVersionIds: true,
              ontologyFingerprint: true,
              capabilityCount: true,
              resultChecksum: true,
              builderVersion: true,
              builtAt: true,
            },
          })
        : null;
      results.push({
        releaseId: release.id,
        scope: release.scope,
        mode,
        releaseFingerprint,
        definitionVersionIds,
        capabilityChecksum: capabilityChecksum(release.items),
        capabilityCount: result?.capabilityCount ?? 0,
        ontologyFingerprint: result?.ontologyFingerprint ?? null,
        artifactSource: result?.artifactSource ?? null,
        latencyMs: result?.latencyMs ?? null,
        artifact: artifact ? { ...artifact, builtAt: artifact.builtAt.toISOString() } : null,
      });
    }

    const manifestPath = argValue('manifest');
    const manifest = manifestPath ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
    const contexts = [];
    for (const context of Array.isArray(manifest.contexts) ? manifest.contexts : []) {
      const resolved = await releaseService.resolveRuntimeDeploymentIdentity({
        storeId: Number(context.storeId),
        userId: Number(context.userId),
        roleKey: String(context.roleKey),
      });
      contexts.push({
        id: context.id ?? `${context.storeId}:${context.userId}:${context.roleKey}`,
        input: context,
        releaseId: Number((resolved.release as JsonRecord | null)?.id ?? 0) || null,
        releaseFingerprint: resolved.releaseFingerprint ?? null,
        mode: resolved.mode ?? null,
        productProfile: resolved.productProfile?.productProfile ?? null,
      });
    }
    return { pipeline, totalLatencyMs: Date.now() - startedAt, releases: results, contexts, manifest };
  } finally {
    await app.close();
  }
}

function sanitizeProbe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProbe);
  if (!value || typeof value !== 'object') return value;
  const ignored = new Set(['timestamp', 'requestId', 'traceId', 'latencyMs', 'durationMs', 'generatedAt']);
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .filter(([key]) => !ignored.has(key))
      .map(([key, item]) => [key, sanitizeProbe(item)]),
  );
}

async function runHttpProbes(manifest: JsonRecord) {
  const sharedBaseUrl = argValue('shared-base-url');
  const artifactBaseUrl = argValue('artifact-base-url');
  const probes = Array.isArray(manifest.httpProbes) ? manifest.httpProbes : [];
  if (!probes.length || !sharedBaseUrl || !artifactBaseUrl) return [];
  const output = [];
  for (const probe of probes) {
    const request = async (baseUrl: string) => {
      const response = await fetch(new URL(String(probe.path), baseUrl), {
        method: String(probe.method ?? 'GET'),
        headers: { 'content-type': 'application/json', ...(probe.headers ?? {}) },
        body: probe.body === undefined ? undefined : JSON.stringify(probe.body),
        signal: AbortSignal.timeout(Number(probe.timeoutMs ?? 30_000)),
      });
      const text = await response.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* compare text */ }
      return { status: response.status, body: sanitizeProbe(body) };
    };
    const [shared, artifact] = await Promise.all([request(sharedBaseUrl), request(artifactBaseUrl)]);
    output.push({
      id: String(probe.id),
      category: String(probe.category ?? 'key-trace'),
      passed: stable(shared) === stable(artifact),
      sharedChecksum: sha256(shared),
      artifactChecksum: sha256(artifact),
      sharedStatus: shared.status,
      artifactStatus: artifact.status,
    });
  }
  return output;
}

async function main() {
  const shared = await measurePipeline('shared');
  const artifact = await measurePipeline('artifact');
  const artifactHot = await measurePipeline('artifact');
  const artifactByRelease = new Map(artifact.releases.map((item: any) => [item.releaseId, item]));
  const comparisons = shared.releases.map((item: any) => {
    const other = artifactByRelease.get(item.releaseId) as JsonRecord | undefined;
    const fields = ['releaseFingerprint', 'ontologyFingerprint', 'definitionVersionIds', 'capabilityChecksum', 'capabilityCount'];
    const mismatches = fields.filter((field) => stable(item[field]) !== stable(other?.[field]));
    return { releaseId: item.releaseId, passed: Boolean(other) && mismatches.length === 0, mismatches };
  });
  const scopePassed = stable(shared.contexts) === stable(artifact.contexts);
  const httpProbes = await runHttpProbes(shared.manifest);
  const requiredCategories = ['permission', 'cross-store', 'empty-result', 'key-trace'];
  const coveredCategories = new Set(httpProbes.filter((probe) => probe.passed).map((probe) => probe.category));
  const coverageComplete = requiredCategories.every((category) => coveredCategories.has(category));
  const corePassed = comparisons.every((item) => item.passed) && scopePassed && shared.releases.length > 0;
  const status = corePassed && coverageComplete ? 'passed' : corePassed ? 'partial' : 'failed';
  const report = {
    status,
    generatedAt: new Date().toISOString(),
    identity: {
      commit: process.env.GIT_COMMIT_SHA ?? null,
      diffChecksum: process.env.AMI_DIFF_CHECKSUM ?? null,
      database: new URL(process.env.DATABASE_URL!).pathname.replace(/^\//u, ''),
      migrationInventory: process.env.AMI_MIGRATION_INVENTORY ?? null,
    },
    shared,
    artifact,
    artifactHot,
    comparisons,
    scopeResolutionPassed: scopePassed,
    httpProbes,
    coverage: Object.fromEntries(requiredCategories.map((category) => [category, coveredCategories.has(category)])),
    releaseAudit416452: await readReleaseAudit(),
  };
  const outputPath = argValue('output');
  const receiptPath = argValue('receipt');
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  if (receiptPath) {
    writeFileSync(receiptPath, `${JSON.stringify({
      schemaVersion: '1.0',
      status,
      generatedAt: report.generatedAt,
      identity: report.identity,
      releaseFingerprints: shared.releases.map((item: any) => ({ releaseId: item.releaseId, releaseFingerprint: item.releaseFingerprint })),
      builderVersions: artifact.releases.map((item: any) => ({ releaseId: item.releaseId, builderVersion: item.artifact?.builderVersion ?? null })),
      reportChecksum: sha256(report),
      reportPath: outputPath ?? null,
    }, null, 2)}\n`, { mode: 0o600 });
  }
  console.log(JSON.stringify({ status, comparisons, scopeResolutionPassed: scopePassed, coverage: report.coverage, outputPath, receiptPath }, null, 2));
  if (status === 'failed' || (process.argv.includes('--require-full') && status !== 'passed')) process.exitCode = 1;
}

async function readReleaseAudit() {
  process.env.BRAIN_RELEASE_PILOT_MODE = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService) as any;
    return prisma.brainRelease.findMany({
      where: { id: { in: [416, 452] } },
      orderBy: { id: 'asc' },
      select: { id: true, releaseKey: true, scope: true, status: true, rollout: true, activatedAt: true, supersededAt: true, updatedAt: true },
    });
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
