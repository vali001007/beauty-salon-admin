import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface Options {
  workspaceRoot: string;
  baseReleaseId: number;
  releaseKey: string;
  resourceVersionIds: number[];
  createdBy: number;
}

async function main() {
  const options = await parseOptions(process.argv.slice(2));
  loadWorkspaceEnvironment(options.workspaceRoot);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const existing = await prisma.brainRelease.findUnique({ where: { releaseKey: options.releaseKey } });
    if (existing) {
      process.stdout.write(`${JSON.stringify({ id: existing.id, releaseKey: existing.releaseKey, status: existing.status, reused: true })}\n`);
      return;
    }
    const base = await prisma.brainRelease.findUnique({
      where: { id: options.baseReleaseId },
      include: { items: true },
    });
    if (!base) throw new Error(`evaluation_release_base_not_found:${options.baseReleaseId}`);
    const additions = await prisma.brainResourceVersion.findMany({
      where: { id: { in: options.resourceVersionIds } },
      select: { id: true, resourceType: true, resourceKey: true },
    });
    if (additions.length !== new Set(options.resourceVersionIds).size) {
      throw new Error('evaluation_release_resource_versions_incomplete');
    }
    const resources = new Map(
      base.items.map((item) => [`${item.resourceType}:${item.resourceKey}`, item.resourceVersionId]),
    );
    for (const item of additions) resources.set(`${item.resourceType}:${item.resourceKey}`, item.id);
    const release = await new BrainReleaseService(prisma).createRelease({
      releaseKey: options.releaseKey,
      scope: 'percentage',
      rollout: { stage: 'shadow', mode: 'shadow', evaluationOnly: true, userPercentage: 100 },
      resourceVersionIds: [...resources.values()],
      createdBy: options.createdBy,
    });
    process.stdout.write(`${JSON.stringify({
      id: release.id,
      releaseKey: release.releaseKey,
      status: release.status,
      baseReleaseId: options.baseReleaseId,
      itemCount: resources.size,
      addedResourceVersionIds: options.resourceVersionIds,
      reused: false,
    })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

async function parseOptions(args: string[]): Promise<Options> {
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const workspaceRoot = resolve(value('workspace-root') ?? (await detectWorkspaceRoot()));
  const baseReleaseId = Number(value('base-release-id'));
  const createdBy = Number(value('created-by'));
  const releaseKey = value('release-key')?.trim() ?? '';
  const resourceVersionIds = (value('resource-version-ids') ?? '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
  if (!Number.isInteger(baseReleaseId) || baseReleaseId < 1) throw new Error('evaluation_release_base_release_id_required');
  if (!Number.isInteger(createdBy) || createdBy < 1) throw new Error('evaluation_release_created_by_required');
  if (!releaseKey) throw new Error('evaluation_release_key_required');
  if (!resourceVersionIds.length) throw new Error('evaluation_release_resource_version_ids_required');
  return { workspaceRoot, baseReleaseId, releaseKey, resourceVersionIds: [...new Set(resourceVersionIds)], createdBy };
}

async function detectWorkspaceRoot() {
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'packages/server-v2/prisma/schema.prisma'));
      return candidate;
    } catch {
      // Keep searching from npm --prefix working directories.
    }
  }
  throw new Error('evaluation_release_workspace_root_not_found');
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
