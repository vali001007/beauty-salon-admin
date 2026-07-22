import { access, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { BrainCapabilityGenerationBundleService } from './brain-capability-generation-bundle.service.js';
import type { BrainCapabilityGenerationResult } from './brain-capability-codegen.service.js';
import { createGeneratedCapabilityProposalFingerprint } from './brain-generated-capability-binding.js';

describe('BrainCapabilityGenerationBundleService', () => {
  it('writes bundle, summary, and markdown into a private random staging root', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'ami-brain-bundle-workspace-'));
    const result = fixtureResult();

    const bundle = await new BrainCapabilityGenerationBundleService().write({
      workspaceRoot,
      result,
      mode: 'synthetic_contract_only',
      scanSummary: { total: 2, draft: 1, blocked: 1, explicit: 2 },
    } as never);

    const tempRoot = await realpath(tmpdir());
    expect(isWithin(tempRoot, bundle.outputDir)).toBe(true);
    expect(isWithin(workspaceRoot, bundle.outputDir)).toBe(false);
    expect(bundle.summaryPath).toBe(join(bundle.outputDir, 'generation-summary.json'));
    expect(bundle.markdownPath).toBe(join(bundle.outputDir, 'generation-report.md'));

    const proposal = JSON.parse(await readFile(join(bundle.outputDir, 'customer_facts', 'proposal.json'), 'utf8'));
    const report = JSON.parse(await readFile(bundle.reportPath, 'utf8'));
    const summary = JSON.parse(await readFile(bundle.summaryPath, 'utf8'));
    expect(await readFile(join(bundle.outputDir, 'customer_facts', 'binding.ts'), 'utf8')).toContain(
      'GeneratedCapabilityInvoker',
    );
    expect(await readFile(join(bundle.outputDir, 'customer_facts', 'contract.spec.ts'), 'utf8')).toContain(
      'bindingFingerprint',
    );
    expect(await readFile(bundle.markdownPath, 'utf8')).toContain('# Ami Brain Capability Generation Proposals');
    expect(proposal.proposalFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(report).toMatchObject({
      policy: 'synthetic_contract_only',
      productionReady: false,
      ready: 0,
      syntheticContracts: 1,
      blocked: 1,
      branchProposals: [expect.objectContaining({ suggestedBranchName: 'codex/ami-brain-capability-missing' })],
    });
    expect(summary).toMatchObject({
      policy: 'synthetic_contract_only',
      productionReady: false,
      scanSummary: { total: 2, draft: 1, blocked: 1, explicit: 2 },
    });
    await expect(access(join(workspaceRoot, 'generation-report.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(bundle.outputDir, { recursive: true, force: true });
  });

  it('creates a unique staging root for each bundle', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'ami-brain-bundle-workspace-'));
    const service = new BrainCapabilityGenerationBundleService();
    const first = await service.write({
      workspaceRoot,
      result: fixtureResult(),
      mode: 'synthetic_contract_only',
    });
    const second = await service.write({
      workspaceRoot,
      result: fixtureResult(),
      mode: 'synthetic_contract_only',
    });

    expect(first.outputDir).not.toBe(second.outputDir);
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(first.outputDir, { recursive: true, force: true });
    await rm(second.outputDir, { recursive: true, force: true });
  });
});

function isWithin(root: string, target: string): boolean {
  const relationship = relative(root, target);
  return relationship === '' || (!relationship.startsWith('..') && !isAbsolute(relationship));
}

function fixtureResult(): BrainCapabilityGenerationResult {
  const proposal = {
    status: 'ready' as const,
    capabilityKey: 'customer_facts',
    sourceFingerprint: 'a'.repeat(64),
    proposalFingerprint: '',
    businessDefinitions: [],
    manifest: { key: 'customer_facts' } as never,
    languageCandidates: {} as never,
    executorBinding: { bindingFingerprint: 'b'.repeat(64) } as never,
    bindingSource: 'export interface GeneratedCapabilityInvoker {}\n',
    contractArtifact: {} as never,
    contractTestSource: 'export const bindingFingerprint = "b";\n',
    gateReport: { passed: true, gates: [] },
  };
  proposal.proposalFingerprint = createGeneratedCapabilityProposalFingerprint({
    sourceFingerprint: proposal.sourceFingerprint,
    manifest: proposal.manifest,
    executorBinding: proposal.executorBinding,
    bindingSource: proposal.bindingSource,
    contractTestSource: proposal.contractTestSource,
  });
  return {
    proposals: [proposal],
    blocked: [
      {
        capabilityKey: 'missing',
        reasons: ['missing_executor_binding'],
        branchProposal: {
          type: 'independent_branch_proposal',
          suggestedBranchName: 'codex/ami-brain-capability-missing',
          filesToAdd: ['packages/server-v2/src/brain/capability/executors/missing.executor.ts'],
          filesToModify: [],
          blockingReasons: ['missing_executor_binding'],
        },
      },
    ],
  };
}
