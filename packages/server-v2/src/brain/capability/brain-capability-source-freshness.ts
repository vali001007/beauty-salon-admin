import type { BrainCapabilityScanReport } from './brain-capability-scan.types.js';

export type BrainCapabilitySourceFreshnessIssue = {
  capabilityKey: string;
  code: 'source_capability_missing' | 'stale_source_fingerprint';
  publishedFingerprint?: string;
  currentFingerprint?: string;
  implementationDependencies?: string[];
};

export function evaluateCapabilitySourceFreshness(
  published: ReadonlyArray<{ key?: unknown; sourceFingerprint?: unknown }>,
  scan: BrainCapabilityScanReport,
) {
  const currentByKey = new Map(scan.capabilities.map((item) => [item.key, item]));
  const issues: BrainCapabilitySourceFreshnessIssue[] = [];
  for (const candidate of published) {
    const capabilityKey = typeof candidate.key === 'string' ? candidate.key : '';
    if (!capabilityKey) continue;
    const current = currentByKey.get(capabilityKey);
    if (!current) {
      issues.push({ capabilityKey, code: 'source_capability_missing' });
      continue;
    }
    const publishedFingerprint = typeof candidate.sourceFingerprint === 'string'
      ? candidate.sourceFingerprint
      : undefined;
    if (publishedFingerprint !== current.sourceFingerprint) {
      issues.push({
        capabilityKey,
        code: 'stale_source_fingerprint',
        ...(publishedFingerprint ? { publishedFingerprint } : {}),
        currentFingerprint: current.sourceFingerprint,
        implementationDependencies: [...(current.implementationDependencies ?? [])],
      });
    }
  }
  return { valid: issues.length === 0, issues };
}
