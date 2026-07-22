import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

async function main() {
  loadWorkspaceEnvironment(await detectWorkspaceRoot());
  const args = process.argv.slice(2);
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const keepIds = (value('keep-resource-ids') ?? '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const requestedKeys = (value('resource-keys') ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const apply = args.includes('--apply');
  const confirmed = args.includes('--yes');
  if (!keepIds.length && !requestedKeys.length) throw new Error('keep_resource_ids_or_resource_keys_required');
  if (apply && !confirmed) throw new Error('archive_superseded_confirmation_required');

  const prisma = new PrismaService();
  try {
    const requestedRows = requestedKeys.length
      ? await prisma.brainResourceVersion.findMany({
          where: { resourceType: 'skill', resourceKey: { in: [...new Set(requestedKeys)] }, status: 'draft' },
          select: { id: true, resourceKey: true, version: true, status: true },
          orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
        })
      : [];
    const latestByKey = new Map<string, (typeof requestedRows)[number]>();
    for (const row of requestedRows) if (!latestByKey.has(row.resourceKey)) latestByKey.set(row.resourceKey, row);
    const resolvedKeepIds = keepIds.length ? keepIds : [...latestByKey.values()].map((item) => item.id);
    const keep = await prisma.brainResourceVersion.findMany({
      where: { id: { in: resolvedKeepIds }, resourceType: 'skill' },
      select: { id: true, resourceKey: true, version: true, status: true },
      orderBy: { id: 'asc' },
    });
    if (keep.length !== new Set(resolvedKeepIds).size) throw new Error('keep_resource_not_found');
    if (keep.some((item) => item.status !== 'draft')) throw new Error('keep_resource_must_be_draft');
    const resourceKeys = [...new Set(keep.map((item) => item.resourceKey))];
    const missingKeys = requestedKeys.filter((key) => !resourceKeys.includes(key));
    const superseded = await prisma.brainResourceVersion.findMany({
      where: { resourceType: 'skill', resourceKey: { in: resourceKeys }, status: 'draft', id: { notIn: resolvedKeepIds } },
      select: { id: true, resourceKey: true, version: true, status: true },
      orderBy: { id: 'asc' },
    });
    if (apply && superseded.length) {
      await prisma.brainResourceVersion.updateMany({
        where: { id: { in: superseded.map((item) => item.id) }, status: 'draft' },
        data: { status: 'archived' },
      });
    }
    process.stdout.write(`${JSON.stringify({
      mode: apply ? 'applied' : 'dry-run',
      keep,
      missingKeys,
      superseded,
      archivedCount: apply ? superseded.length : 0,
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
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
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
