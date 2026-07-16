import { Injectable } from '@nestjs/common';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { BrainCapabilityGenerationResult } from './brain-capability-codegen.service.js';
import { createGeneratedCapabilityProposalFingerprint } from './brain-generated-capability-binding.js';
import {
  nodeCapabilityOutputFsPort,
  type BrainCapabilityOutputFsPort,
} from './brain-capability-output-fs.port.js';

export type BrainCapabilityGenerationMode = 'published_registry' | 'synthetic_contract_only';
export interface BrainCapabilityGenerationScanSummary {
  total: number;
  draft: number;
  blocked: number;
  explicit: number;
}

export interface BrainCapabilityGenerationBundle {
  outputDir: string;
  reportPath: string;
  summaryPath: string;
  markdownPath: string;
}

@Injectable()
export class BrainCapabilityGenerationBundleService {
  constructor(private readonly fs: BrainCapabilityOutputFsPort = nodeCapabilityOutputFsPort) {}

  async write(input: {
    workspaceRoot: string;
    result: BrainCapabilityGenerationResult;
    generatedAt?: string;
    mode?: BrainCapabilityGenerationMode;
    scanSummary?: BrainCapabilityGenerationScanSummary;
  }): Promise<BrainCapabilityGenerationBundle> {
    const systemTempRoot = await this.fs.realpath(tmpdir());
    const outputDir = await this.fs.mkdtemp(join(systemTempRoot, 'ami-brain-capability-generation-'));
    await this.fs.chmodPrivate(outputDir);
    const realOutputDir = await this.fs.realpath(outputDir);
    if (!isWithin(systemTempRoot, realOutputDir)) {
      throw new Error('Capability generation staging root escaped the system temporary directory.');
    }
    const workspaceRoot = await this.fs.realpath(resolve(input.workspaceRoot));
    if (isWithin(workspaceRoot, realOutputDir)) {
      throw new Error('Capability generation staging root must not be inside the workspace.');
    }
    const mode = input.mode ?? 'published_registry';
    const synthetic = mode === 'synthetic_contract_only';
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const policy = synthetic ? 'synthetic_contract_only' : 'published_registry_gate';
    const productionReady = !synthetic && input.result.blocked.length === 0;

    for (const proposal of input.result.proposals) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(proposal.capabilityKey)) {
        throw new Error(`Invalid capability key for bundle path: ${proposal.capabilityKey}`);
      }
      const expectedFingerprint = createGeneratedCapabilityProposalFingerprint({
        sourceFingerprint: proposal.sourceFingerprint,
        manifest: proposal.manifest,
        executorBinding: proposal.executorBinding,
        bindingSource: proposal.bindingSource,
        contractTestSource: proposal.contractTestSource,
      });
      if (expectedFingerprint !== proposal.proposalFingerprint) {
        throw new Error(`Capability proposal fingerprint mismatch: ${proposal.capabilityKey}`);
      }
      const capabilityDir = join(realOutputDir, proposal.capabilityKey);
      await this.fs.mkdirExclusive(capabilityDir);
      await this.safeWrite(realOutputDir, join(capabilityDir, 'manifest.json'), json(proposal.manifest));
      await this.safeWrite(realOutputDir, join(capabilityDir, 'binding.ts'), proposal.bindingSource);
      await this.safeWrite(realOutputDir, join(capabilityDir, 'contract.spec.ts'), proposal.contractTestSource);
      await this.safeWrite(realOutputDir, join(capabilityDir, 'gate-report.json'), json(proposal.gateReport));
      await this.safeWrite(
        realOutputDir,
        join(capabilityDir, 'proposal.json'),
        json({
          schemaVersion: 1,
          policy,
          productionReady: !synthetic,
          proposalStatus: proposal.status,
          capabilityKey: proposal.capabilityKey,
          sourceFingerprint: proposal.sourceFingerprint,
          proposalFingerprint: proposal.proposalFingerprint,
          bindingFingerprint: proposal.executorBinding.bindingFingerprint,
          executorBinding: proposal.executorBinding,
          businessDefinitions: proposal.businessDefinitions,
          artifacts: {
            manifest: 'manifest.json',
            binding: 'binding.ts',
            contractTest: 'contract.spec.ts',
            gateReport: 'gate-report.json',
          },
        }),
      );
    }

    const branchProposals = input.result.blocked.flatMap((item) => (item.branchProposal ? [item.branchProposal] : []));
    const reportPath = join(realOutputDir, 'generation-report.json');
    const report = {
      schemaVersion: 1,
      generatedAt,
      policy,
      productionReady,
      ready: synthetic ? 0 : input.result.proposals.length,
      syntheticContracts: synthetic ? input.result.proposals.length : 0,
      blocked: input.result.blocked.length,
      gateReports: input.result.proposals.map((item) => ({
        capabilityKey: item.capabilityKey,
        proposalFingerprint: item.proposalFingerprint,
        ...item.gateReport,
      })),
      blockedItems: input.result.blocked,
      branchProposals,
    };
    await this.safeWrite(realOutputDir, reportPath, json(report));

    const summaryPath = join(realOutputDir, 'generation-summary.json');
    await this.safeWrite(
      realOutputDir,
      summaryPath,
      json({
        schemaVersion: 1,
        generatedAt,
        policy,
        productionReady,
        scanSummary: input.scanSummary,
        result: input.result,
      }),
    );

    const markdownPath = join(realOutputDir, 'generation-report.md');
    await this.safeWrite(
      realOutputDir,
      markdownPath,
      renderMarkdown({
        generatedAt,
        scanSummary: input.scanSummary,
        result: input.result,
      }),
    );
    return { outputDir: realOutputDir, reportPath, summaryPath, markdownPath };
  }

  private async safeWrite(root: string, target: string, content: string): Promise<void> {
    const parentPath = resolve(target, '..');
    const parentBefore = await this.fs.realpath(parentPath);
    if (!isWithin(root, parentBefore)) {
      throw new Error('Capability generation bundle path escaped the output directory.');
    }
    if (await this.exists(target)) throw new Error('Capability generation bundle target already exists.');
    await this.fs.openExclusive(target, content);
    const parentAfter = await this.fs.realpath(parentPath);
    if (parentAfter !== parentBefore || !isWithin(root, parentAfter)) {
      await this.fs.removeFile(target).catch(() => undefined);
      throw new Error('Capability generation output parent changed during write.');
    }
    const targetRealPath = await this.fs.realpath(target);
    if (!isWithin(root, targetRealPath)) {
      await this.fs.removeFile(target).catch(() => undefined);
      throw new Error('Capability generation bundle path escaped the output directory.');
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await this.fs.lstat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}

function isWithin(root: string, target: string): boolean {
  const relationship = relative(root, target);
  return relationship === '' || (!relationship.startsWith('..') && !isAbsolute(relationship));
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderMarkdown(input: {
  generatedAt: string;
  scanSummary?: BrainCapabilityGenerationScanSummary;
  result: BrainCapabilityGenerationResult;
}): string {
  const lines = [
    '# Ami Brain Capability Generation Proposals',
    '',
    `Generated: ${input.generatedAt}`,
    '',
    `- Explicit candidates: ${input.scanSummary?.explicit ?? input.result.proposals.length + input.result.blocked.length}`,
    `- Ready proposals: ${input.result.proposals.length}`,
    `- Blocked proposals: ${input.result.blocked.length}`,
    '',
    '## Ready',
    '',
  ];
  if (!input.result.proposals.length) lines.push('- None');
  for (const item of input.result.proposals) {
    lines.push(
      `- ${item.capabilityKey}: ${item.manifest.name} (${item.proposalFingerprint}) gates=${item.gateReport.passed ? 'PASS' : 'FAIL'}`,
    );
  }
  lines.push('', '## Blocked', '');
  if (!input.result.blocked.length) lines.push('- None');
  for (const item of input.result.blocked) {
    lines.push(`- ${item.capabilityKey}: ${item.reasons.join(', ')}`);
    if (item.branchProposal) lines.push(`  - Branch proposal: ${item.branchProposal.suggestedBranchName}`);
  }
  return `${lines.join('\n')}\n`;
}
