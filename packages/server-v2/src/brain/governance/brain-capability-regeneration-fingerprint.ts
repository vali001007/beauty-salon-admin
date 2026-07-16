import { createHash } from 'node:crypto';

type ReleaseCapabilityItem = {
  resourceVersionId: number;
  resourceType: string;
  resourceKey: string;
  resourceVersion: { checksum: string; snapshot?: unknown };
};

export function createReleaseFingerprint(items: ReleaseCapabilityItem[]): string {
  const resources = items
    .map((item) => ({ resourceVersionId: item.resourceVersionId, checksum: item.resourceVersion.checksum }))
    .sort((left, right) => left.resourceVersionId - right.resourceVersionId || left.checksum.localeCompare(right.checksum));
  return createHash('sha256').update(JSON.stringify(resources)).digest('hex');
}

export function selectAffectedCapability(items: ReleaseCapabilityItem[], requirement: string): string[] {
  const capabilities = items.filter((item) => item.resourceType === 'skill');
  if (capabilities.length === 1) return [capabilities[0]!.resourceKey];
  const normalized = requirement.normalize('NFKC').toLowerCase();
  const matched = capabilities.filter((item) => {
    const snapshot = record(item.resourceVersion.snapshot);
    const names = [item.resourceKey, string(snapshot.name), string(snapshot.title)].filter(Boolean);
    return names.some((name) => normalized.includes(name.normalize('NFKC').toLowerCase()));
  });
  return matched.length === 1 ? [matched[0]!.resourceKey] : [];
}

export async function lockReleaseResources(
  tx: { $queryRaw<T = unknown>(query: unknown): Promise<T> },
  releaseId: number,
): Promise<void> {
  const { Prisma } = await import('@prisma/client');
  await tx.$queryRaw(Prisma.sql`
    SELECT release."id"
    FROM "brain_release" release
    WHERE release."id" = ${releaseId}
    FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT version."id"
    FROM "brain_release_item" item
    JOIN "brain_resource_version" version ON version."id" = item."resourceVersionId"
    WHERE item."releaseId" = ${releaseId}
    ORDER BY version."id" ASC
    FOR UPDATE OF version
  `);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
