import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BrainCapabilityDriftService } from '../src/brain/capability/brain-capability-drift.service.js';
import {
  renderCapabilityMarkdown,
  resolveWorkspacePath,
} from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainCapabilityScannerService } from '../src/brain/capability/brain-capability-scanner.service.js';
import type {
  BrainCapabilityDriftApprovalManifest,
  BrainCapabilityDriftReport,
  BrainCapabilityScanReport,
} from '../src/brain/capability/brain-capability-scan.types.js';

interface CliOptions {
  workspaceRoot: string;
  baseline?: string;
  approvals?: string;
  output?: string;
  markdown?: string;
  strict: boolean;
  explicitOnly: boolean;
}

async function main() {
  const options = await parseOptions(process.argv.slice(2));
  const scanner = new BrainCapabilityScannerService();
  const scan = await scanner.scan({
    workspaceRoot: options.workspaceRoot,
    explicitOnly: options.explicitOnly,
  });
  let drift: BrainCapabilityDriftReport | undefined;
  let strict: ReturnType<BrainCapabilityDriftService['evaluateStrict']> | undefined;
  const approvals = options.approvals ? await loadApprovalManifest(options.approvals) : [];

  if (options.baseline) {
    const baseline = JSON.parse(await readFile(options.baseline, 'utf8')) as
      | BrainCapabilityScanReport
      | { scan: BrainCapabilityScanReport };
    drift = new BrainCapabilityDriftService().compare(scan, 'scan' in baseline ? baseline.scan : baseline);
    strict = new BrainCapabilityDriftService().evaluateStrict(drift, approvals);
  } else if (options.strict) {
    drift = new BrainCapabilityDriftService().compare(scan, emptyBaseline());
    strict = new BrainCapabilityDriftService().evaluateStrict(drift, approvals);
  }

  const result = { scan, ...(drift ? { drift } : {}), ...(strict ? { strict } : {}) };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) await writeFile(options.output, json, 'utf8');
  else process.stdout.write(json);
  if (options.markdown) await writeFile(options.markdown, renderCapabilityMarkdown(scan, drift, strict), 'utf8');
  if (options.strict && strict && !strict.passed) process.exitCode = 1;
}

function emptyBaseline(): BrainCapabilityScanReport {
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    capabilities: [],
    summary: { total: 0, draft: 0, blocked: 0, explicit: 0 },
  };
}

async function parseOptions(args: string[]): Promise<CliOptions> {
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const workspaceRoot = resolve(value('workspace-root') ?? (await detectWorkspaceRoot()));
  return {
    workspaceRoot,
    baseline: resolveWorkspacePath(workspaceRoot, value('baseline')),
    approvals: resolveWorkspacePath(workspaceRoot, value('approvals')),
    output: resolveWorkspacePath(workspaceRoot, value('output')),
    markdown: resolveWorkspacePath(workspaceRoot, value('md')),
    strict: args.includes('--strict'),
    explicitOnly: args.includes('--explicit-only'),
  };
}

async function loadApprovalManifest(path: string) {
  const manifest = JSON.parse(await readFile(path, 'utf8')) as BrainCapabilityDriftApprovalManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.approvals)) {
    throw new Error(`Invalid Ami Brain capability drift approval manifest: ${path}`);
  }
  const identities = new Set<string>();
  for (const approval of manifest.approvals) {
    if (
      !approval ||
      typeof approval.key !== 'string' ||
      !['added', 'changed'].includes(approval.type) ||
      typeof approval.highRisk !== 'boolean' ||
      !Array.isArray(approval.reasons) ||
      approval.reasons.some((reason) => typeof reason !== 'string') ||
      !fingerprint(approval.afterFingerprint) ||
      (approval.beforeFingerprint !== undefined && !fingerprint(approval.beforeFingerprint)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(approval.approvedAt) ||
      typeof approval.authorization !== 'string' ||
      approval.authorization.length === 0 ||
      typeof approval.note !== 'string' ||
      approval.note.length === 0
    ) {
      throw new Error(`Invalid Ami Brain capability drift approval for ${approval?.key ?? 'unknown'}: ${path}`);
    }
    const identity = [approval.key, approval.type, approval.beforeFingerprint ?? '', approval.afterFingerprint].join(':');
    if (identities.has(identity)) throw new Error(`Duplicate Ami Brain capability drift approval: ${approval.key}`);
    identities.add(identity);
  }
  return manifest.approvals;
}

function fingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

async function detectWorkspaceRoot(): Promise<string> {
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'packages/server-v2/prisma/schema.prisma'));
      return candidate;
    } catch {
      // Continue searching upward from the npm --prefix working directory.
    }
  }
  throw new Error('Cannot locate workspace root; pass --workspace-root=<path>.');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
