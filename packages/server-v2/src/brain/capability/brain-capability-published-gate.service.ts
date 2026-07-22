import { BadRequestException, Injectable } from '@nestjs/common';
import type { BrainCapabilityGenerationProposal } from './brain-capability-codegen.service.js';
import { BrainCapabilityGenerationGateService } from './brain-capability-generation-gate.service.js';
import { BrainCapabilityScannerService } from './brain-capability-scanner.service.js';
import { BrainCapabilitySemanticVerifierService } from './brain-capability-semantic-verifier.service.js';
import { canonicalizeBusinessDefinition } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type { BrainCapabilityScanReport } from './brain-capability-scan.types.js';

@Injectable()
export class BrainCapabilityPublishedGateService {
  constructor(
    private readonly scanner: BrainCapabilityScannerService,
    private readonly generationGates: BrainCapabilityGenerationGateService,
    private readonly semanticVerifier: BrainCapabilitySemanticVerifierService,
  ) {}

  async verify(input: {
    proposal: BrainCapabilityGenerationProposal;
    workspaceRoot: string;
    sourceScan?: BrainCapabilityScanReport;
  }) {
    if (input.proposal.status !== 'ready') {
      throw new BadRequestException('generated_capability_published_gate_requires_registry_proposal');
    }
    const scan = input.sourceScan ?? await this.scanner.scan({ workspaceRoot: input.workspaceRoot, explicitOnly: true });
    const capability = scan.capabilities.find((item) => item.key === input.proposal.capabilityKey);
    if (!capability || capability.sourceFingerprint !== input.proposal.sourceFingerprint) {
      throw new BadRequestException('generated_capability_published_gate_scanner_mismatch');
    }
    const gatedCapability = this.applyVerifiedOverlay(capability, input.proposal);
    const report = await this.generationGates.evaluate({
      capability: gatedCapability,
      proposal: input.proposal,
      workspaceRoot: input.workspaceRoot,
    });
    if (!report.passed) throw new BadRequestException('generated_capability_published_gate_failed');
    const verified = await this.semanticVerifier.verifyProposal(input.proposal);
    return { ...report, manifest: verified.manifest };
  }

  private applyVerifiedOverlay<T extends { requiredPermissions: string[] }>(
    capability: T,
    proposal: BrainCapabilityGenerationProposal,
  ): T {
    const overlay = proposal.governanceOverlay;
    if (!overlay) return capability;
    const base = [...new Set(capability.requiredPermissions)].sort();
    const additional = [...new Set(overlay.additionalPermissions)].filter((item) => !base.includes(item)).sort();
    const tightened = [...new Set([...base, ...additional])].sort();
    if (
      overlay.verified !== true ||
      canonicalizeBusinessDefinition(overlay.baseRequiredPermissions) !== canonicalizeBusinessDefinition(base) ||
      canonicalizeBusinessDefinition(tightened) !== canonicalizeBusinessDefinition(proposal.manifest.requiredPermissions) ||
      canonicalizeBusinessDefinition(tightened) !== canonicalizeBusinessDefinition(proposal.executorBinding.requiredPermissions) ||
      canonicalizeBusinessDefinition(overlay.allowedRoles) !== canonicalizeBusinessDefinition(proposal.manifest.allowedRoles)
    ) {
      throw new BadRequestException('generated_capability_governance_overlay_invalid');
    }
    return { ...capability, requiredPermissions: tightened };
  }
}
