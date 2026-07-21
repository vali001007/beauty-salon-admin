import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { BrainCapabilityDriftReport, BrainCapabilityScanReport } from './brain-capability-scan.types.js';

export function loadWorkspaceEnvironment(workspaceRoot: string): boolean {
  const envPath = resolve(workspaceRoot, 'packages', 'server-v2', '.env');
  if (!existsSync(envPath)) return false;
  const values = parseEnv(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

export function resolveWorkspacePath(workspaceRoot: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  return isAbsolute(value) ? resolve(value) : resolve(workspaceRoot, value);
}

export function assertNoCapabilityOutputOverrides(args: string[]): void {
  const forbidden = args.find(
    (item) =>
      item === '--output-dir' ||
      item.startsWith('--output-dir=') ||
      item === '--output' ||
      item.startsWith('--output=') ||
      item === '--md' ||
      item.startsWith('--md='),
  );
  if (forbidden) {
    throw new Error(
      `Capability generation output overrides are disabled (${forbidden}); artifacts are created in a private system staging directory.`,
    );
  }
}

export function escapeMarkdownCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

export function renderCapabilityMarkdown(
  scan: BrainCapabilityScanReport,
  drift?: BrainCapabilityDriftReport,
  strict?: { passed: boolean },
): string {
  const cell = escapeMarkdownCell;
  const lines = [
    '# Ami Brain Capability Scan',
    '',
    `- Generated: ${scan.generatedAt}`,
    `- Total: ${scan.summary.total}`,
    `- Draft: ${scan.summary.draft}`,
    `- Blocked: ${scan.summary.blocked}`,
    ...(strict ? [`- Strict: ${strict.passed ? 'PASS' : 'FAIL'}`] : []),
    '',
    '| Capability | Status | Explicit | Permissions | Fingerprint |',
    '| --- | --- | --- | --- | --- |',
    ...scan.capabilities.map(
      (item) =>
        `| ${cell(item.key)} | ${cell(item.status)} | ${item.explicit ? 'yes' : 'no'} | ${cell(item.requiredPermissions.join(', '))} | ${item.sourceFingerprint.slice(0, 12)} |`,
    ),
  ];
  if (drift) {
    lines.push('', '## Drift', '', '| Capability | Type | High Risk | Reasons |', '| --- | --- | --- | --- |');
    for (const item of drift.items) {
      lines.push(
        `| ${cell(item.key)} | ${cell(item.type)} | ${item.highRisk ? 'yes' : 'no'} | ${cell(item.reasons.join(', '))} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
