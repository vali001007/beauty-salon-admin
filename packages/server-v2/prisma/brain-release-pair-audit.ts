import { writeFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createReleaseFingerprint } from '../src/brain/governance/brain-capability-regeneration-fingerprint.js';

async function main() {
  const prisma = new PrismaService() as any;
  try {
    await prisma.$connect();
    const releases = await prisma.brainRelease.findMany({
      where: { id: { in: [416, 452] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        releaseKey: true,
        scope: true,
        status: true,
        rollout: true,
        versionMap: true,
        activatedAt: true,
        supersededAt: true,
        rolledBackAt: true,
        updatedAt: true,
        items: {
          orderBy: { resourceVersionId: 'asc' },
          select: { resourceVersionId: true, resourceType: true, resourceKey: true, snapshot: true, resourceVersion: { select: { checksum: true } } },
        },
        warmupArtifacts: {
          orderBy: { builtAt: 'desc' },
          take: 3,
          select: { status: true, builderVersion: true, releaseFingerprint: true, ontologyFingerprint: true, capabilityCount: true, builtAt: true, errorCode: true },
        },
      },
    });
    const activeReleases = await prisma.brainRelease.findMany({
      where: { status: 'active' },
      orderBy: { id: 'asc' },
      select: { id: true, releaseKey: true, scope: true, status: true, rollout: true, activatedAt: true },
    });
    const report = {
      mode: 'read-only',
      generatedAt: new Date().toISOString(),
      database: {
        host: new URL(process.env.DATABASE_URL!).hostname,
        database: new URL(process.env.DATABASE_URL!).pathname.replace(/^\//u, ''),
      },
      activeReleases,
      releases: releases.map((release: any) => ({
        id: release.id,
        releaseKey: release.releaseKey,
        scope: release.scope,
        status: release.status,
        rollout: release.rollout,
        versionMap: release.versionMap,
        activatedAt: release.activatedAt,
        supersededAt: release.supersededAt,
        rolledBackAt: release.rolledBackAt,
        updatedAt: release.updatedAt,
        releaseFingerprint: createReleaseFingerprint(release.items, release.rollout),
        itemCount: release.items.length,
        resourceTypes: Object.fromEntries([...new Set(release.items.map((item: any) => item.resourceType))].sort().map((type) => [type, release.items.filter((item: any) => item.resourceType === type).length])),
        warmupArtifacts: release.warmupArtifacts,
      })),
      mutationsExecuted: 0,
    };
    const output = process.env.AMI_AUDIT_OUTPUT;
    if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ mode: report.mode, generatedAt: report.generatedAt, activeReleaseIds: activeReleases.map((item: any) => item.id), releases: report.releases, mutationsExecuted: 0, output }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
