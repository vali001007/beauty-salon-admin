import { BadRequestException } from '@nestjs/common';
import { BrainCapabilityPublishedGateService } from './brain-capability-published-gate.service.js';
import { generatedProposalFixture } from './brain-generated-capability.test-fixtures.js';

describe('BrainCapabilityPublishedGateService', () => {
  it('requires a fresh scanner match, real generation gates and published semantic verification', async () => {
    const proposal = generatedProposalFixture();
    const candidate = {
      key: proposal.capabilityKey,
      sourceFingerprint: proposal.sourceFingerprint,
    };
    const scanner = { scan: jest.fn().mockResolvedValue({ capabilities: [candidate] }) };
    const gates = { evaluate: jest.fn().mockResolvedValue({ passed: true, gates: [] }) };
    const semanticVerifier = { verifyProposal: jest.fn().mockResolvedValue({ manifest: proposal.manifest }) };
    const service = new BrainCapabilityPublishedGateService(scanner as never, gates as never, semanticVerifier as never);

    await expect(service.verify({ proposal, workspaceRoot: 'D:/workspace' })).resolves.toMatchObject({ passed: true });
    expect(gates.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ capability: candidate, proposal, workspaceRoot: 'D:/workspace' }),
    );
    expect(semanticVerifier.verifyProposal).toHaveBeenCalledWith(proposal);
  });

  it('rejects synthetic proposals before publication verification', async () => {
    const proposal = { ...generatedProposalFixture(), status: 'synthetic_contract_only' } as never;
    const service = new BrainCapabilityPublishedGateService({} as never, {} as never, {} as never);

    await expect(service.verify({ proposal, workspaceRoot: 'D:/workspace' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a verified tightening overlay while preserving scanner minimum permissions', async () => {
    const proposal = generatedProposalFixture();
    proposal.manifest.requiredPermissions = ['core:finance:view', ...proposal.manifest.requiredPermissions].sort();
    proposal.manifest.allowedRoles = ['store_manager'];
    proposal.executorBinding.requiredPermissions = [...proposal.manifest.requiredPermissions];
    proposal.governanceOverlay = {
      verified: true,
      baseRequiredPermissions: ['core:metric:view'],
      additionalPermissions: ['core:finance:view'],
      allowedRoles: ['store_manager'],
    };
    const candidate = { key: proposal.capabilityKey, sourceFingerprint: proposal.sourceFingerprint, requiredPermissions: ['core:metric:view'] };
    const gates = { evaluate: jest.fn().mockResolvedValue({ passed: true, gates: [] }) };
    const service = new BrainCapabilityPublishedGateService(
      { scan: jest.fn().mockResolvedValue({ capabilities: [candidate] }) } as never,
      gates as never,
      { verifyProposal: jest.fn().mockResolvedValue({ manifest: proposal.manifest }) } as never,
    );

    await expect(service.verify({ proposal, workspaceRoot: 'D:/workspace' })).resolves.toMatchObject({ passed: true });
    expect(gates.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      capability: expect.objectContaining({ requiredPermissions: ['core:finance:view', 'core:metric:view'] }),
    }));
  });
});
