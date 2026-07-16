import { BrainCapabilityRegenerationService } from './brain-capability-regeneration.service.js';
import { generatedProposalFixture } from '../capability/brain-generated-capability.test-fixtures.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability-scan.types.js';

describe('BrainCapabilityRegenerationService', () => {
  function createService(overrides: Record<string, unknown> = {}) {
    const capability = scanCandidate();
    const proposal = generatedProposalFixture();
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      brainCapabilityRegenerationJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          releaseId: 3,
          requestVersionId: 9,
          requirement: '只允许店长使用',
          inferredChanges: { allowedRoles: ['store_manager'] },
          affectedCapabilities: [capability.key],
          createdBy: 11,
          release: { id: 3, releaseKey: 'brain-r3', items: [{ resourceKey: capability.key }] },
          requestVersion: { id: 9, resourceType: 'capability_change_request' },
        }),
      },
    };
    const scanner = { scan: jest.fn().mockResolvedValue({ schemaVersion: 1, generatedAt: new Date().toISOString(), capabilities: [capability], summary: { total: 1, draft: 1, blocked: 0, explicit: 1 } }) };
    const codegen = { generate: jest.fn().mockResolvedValue({ proposals: [proposal], blocked: [] }) };
    const policy = { apply: jest.fn().mockReturnValue({ status: 'ready', capability, proposal, riskReport: { overall: 'low', rolloutPercentage: null } }) };
    const verifier = { verifyProposal: jest.fn().mockResolvedValue({ manifest: proposal.manifest }) };
    const gates = { evaluate: jest.fn().mockResolvedValue({ passed: true, gates: [{ gate: 'contract', passed: true, reasons: [], remediation: [] }] }) };
    const drafts = { createDraft: jest.fn().mockResolvedValue({ id: 41, resourceKey: capability.key, version: 3 }) };
    const service = new BrainCapabilityRegenerationService(
      (overrides.prisma ?? prisma) as never,
      (overrides.scanner ?? scanner) as never,
      (overrides.codegen ?? codegen) as never,
      (overrides.policy ?? policy) as never,
      (overrides.verifier ?? verifier) as never,
      (overrides.gates ?? gates) as never,
      (overrides.drafts ?? drafts) as never,
    );
    return { service, prisma, scanner, codegen, policy, verifier, gates, drafts, capability, proposal };
  }

  it('scans explicit capabilities, processes only affected keys and creates idempotent drafts', async () => {
    const { service, prisma, scanner, codegen, gates, drafts, capability } = createService();

    const result = await service.executeJob(7, 'worker-a', 'D:/workspace');

    expect(scanner.scan).toHaveBeenCalledWith(expect.objectContaining({ explicitOnly: true }));
    expect(codegen.generate).toHaveBeenCalledWith({
      scan: expect.objectContaining({ capabilities: [expect.objectContaining({ key: capability.key })] }),
      workspaceRoot: 'D:/workspace',
      generationMode: 'published_registry',
    });
    expect(gates.evaluate).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: 'D:/workspace' }));
    expect(drafts.createDraft).toHaveBeenCalledWith(expect.objectContaining({ generatedByJobId: 7, leaseOwner: 'worker-a', workspaceRoot: 'D:/workspace' }));
    const leaseSql = prisma.$queryRaw.mock.calls[0][0].strings.join(' ');
    expect(leaseSql).toContain('"leaseExpiresAt" > NOW()');
    expect(leaseSql).toContain("INTERVAL '5 minutes'");
    expect(result).toMatchObject({
      status: 'completed',
      generatedResourceVersionIds: [41],
      report: {
        affectedCapabilities: [capability.key],
        staticGatesPassed: 1,
        contractCompileSecurity: ['contract'],
      },
    });
    expect(JSON.stringify(result.report)).not.toMatch(/inputSchema|outputSchema|contractArtifact|contractTestSource|bindingSource/);
  });

  it.each([
    ['scanner gap', { scanner: { scan: jest.fn().mockResolvedValue({ schemaVersion: 1, generatedAt: '', capabilities: [], summary: { total: 0, draft: 0, blocked: 0, explicit: 0 } }) } }, 'affected_capability_not_found'],
    ['codegen block', { codegen: { generate: jest.fn().mockResolvedValue({ proposals: [], blocked: [{ capabilityKey: 'product_sales_ranking', reasons: ['gate_failed'] }] }) } }, 'gate_failed'],
    ['policy block', { policy: { apply: jest.fn().mockReturnValue({ status: 'blocked', reasons: ['permission_expansion_forbidden'], riskReport: { overall: 'blocked' } }) } }, 'permission_expansion_forbidden'],
    ['semantic verifier failure', { verifier: { verifyProposal: jest.fn().mockRejectedValue(new Error('semantic_mismatch')) } }, 'semantic_mismatch'],
    ['generation gate failure', { gates: { evaluate: jest.fn().mockResolvedValue({ passed: false, gates: [{ gate: 'security', passed: false, reasons: ['unsafe'], remediation: [] }] }) } }, 'unsafe'],
  ])('returns a visible blocked result when %s occurs', async (_label, override, reason) => {
    const { service } = createService(override);

    await expect(service.executeJob(7, 'worker-a', 'D:/workspace')).resolves.toMatchObject({
      status: 'blocked',
      report: { blockingReasons: expect.arrayContaining([reason]) },
    });
  });

  it('returns only whitelisted business fields from list/detail APIs', async () => {
    const rawJob = {
      id: 7,
      releaseId: 3,
      status: 'completed',
      affectedCapabilities: ['product_sales_ranking'],
      report: { progress: 100, staticGatesPassed: 4, contractCompileSecurity: ['contract'], risk: { overall: 'low' }, forbidden: { inputSchema: { secret: true } } },
      generatedResourceVersionIds: [41],
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      updatedAt: new Date('2026-07-14T00:01:00.000Z'),
      availableAt: new Date('2026-07-14T00:00:00.000Z'),
      leasedAt: null,
      requirement: 'secret raw requirement',
      inferredChanges: { inputSchema: { secret: true } },
      requestVersion: { snapshot: { contractArtifact: 'secret' } },
    };
    const prisma = {
      brainCapabilityRegenerationJob: {
        findMany: jest.fn().mockResolvedValue([rawJob]),
        findUnique: jest.fn().mockResolvedValue(rawJob),
      },
    };
    const { service } = createService({ prisma });

    const list = await service.listPublicJobs(3);
    const detail = await service.getPublicJob(7);

    expect(list.items[0]).toEqual(detail);
    expect(Object.keys(detail).sort()).toEqual([
      'affectedCapabilities', 'availableAt', 'blockingReasons', 'completedAt', 'contractCompileSecurity',
      'createdAt', 'errorCode', 'errorMessage', 'generatedResourceVersionIds', 'id', 'leasedAt', 'progress',
      'nextAction', 'releaseId', 'retryable', 'risk', 'staticGatesPassed', 'status', 'updatedAt',
    ].sort());
    expect(JSON.stringify(detail)).not.toMatch(/requirement|inferredChanges|snapshot|inputSchema|contractArtifact/);
  });

  it('sanitizes internal diagnostics and clears all terminal state on retry', async () => {
    const rawJob = {
      id: 7, releaseId: 3, status: 'dead_letter', affectedCapabilities: ['product_sales_ranking'],
      report: { progress: 100, blockingReasons: ['C:\\repo\\src\\x.ts:12 TS2345 secret'] },
      generatedResourceVersionIds: [41], errorCode: 'regeneration_dead_letter',
      errorMessage: 'Error at C:\\repo\\src\\x.ts:12\n at stack TS2345 secret',
      createdAt: new Date(), updatedAt: new Date(), availableAt: new Date(), leasedAt: null,
    };
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]), brainCapabilityRegenerationJob: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn()
        .mockResolvedValueOnce(rawJob)
        .mockResolvedValueOnce({ ...rawJob, status: 'queued', report: null, generatedResourceVersionIds: [], errorCode: null, errorMessage: null }),
    } };
    const { service } = createService({ prisma });

    expect(JSON.stringify(service.toPublicJob(rawJob))).not.toMatch(/C:\\repo|TS2345|stack/);
    await service.retryJob(7);
    expect(prisma.brainCapabilityRegenerationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ report: expect.anything(), generatedResourceVersionIds: expect.anything(), completedAt: null }),
    }));
  });

  it.each([
    ['business_definition_change_pending', 'complete_business_definition'],
    ['business_definition_registry_failed', 'complete_business_definition'],
    ['affected_capability_ambiguous', 'modify_requirement'],
  ])('marks permanent blocker %s as non-retryable', (errorCode, nextAction) => {
    const { service } = createService();
    expect(service.toPublicJob({
      id: 7, releaseId: 3, status: 'blocked', affectedCapabilities: ['product_sales_ranking'], report: {},
      generatedResourceVersionIds: [], errorCode, errorMessage: 'blocked',
    })).toMatchObject({ retryable: false, nextAction });
  });

  it.each([
    ['prohibited_request:expand_role'],
    ['requirement_interpretation_ambiguous'],
    ['requirement_no_supported_change'],
  ])('requires requirement modification for permanent policy blocker %s', (reason) => {
    const { service } = createService();
    expect(service.toPublicJob({
      id: 7, releaseId: 3, status: 'blocked', affectedCapabilities: ['product_sales_ranking'],
      report: { blockingReasons: [reason] }, generatedResourceVersionIds: [], errorCode: 'regeneration_blocked', errorMessage: reason,
    })).toMatchObject({ retryable: false, nextAction: 'modify_requirement' });
  });

  it('rejects retry for permanent blockers without updating state', async () => {
    const rawJob = {
      id: 7, releaseId: 3, status: 'blocked', affectedCapabilities: [], report: {}, generatedResourceVersionIds: [],
      errorCode: 'affected_capability_ambiguous', errorMessage: 'modify requirement',
    };
    const prisma = { brainCapabilityRegenerationJob: {
      findUnique: jest.fn().mockResolvedValue(rawJob), updateMany: jest.fn(),
    } };
    const { service } = createService({ prisma });

    await expect(service.retryJob(7)).rejects.toMatchObject({ message: 'regeneration_job_not_retryable' });
    expect(prisma.brainCapabilityRegenerationJob.updateMany).not.toHaveBeenCalled();
  });
});

function scanCandidate(): BrainCapabilityCandidate {
  return {
    key: 'product_sales_ranking',
    name: '商品销售排行',
    businessDefinitionKeys: ['metric.product_sales_quantity'],
    status: 'draft',
    enabled: true,
    explicit: true,
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    storeScope: 'required',
    requiredPermissions: ['core:metric:view'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    inputContract: {},
    outputContract: { return: 'object' },
    sourceFingerprint: 'f'.repeat(64),
    evidence: [],
    issues: [],
  };
}
