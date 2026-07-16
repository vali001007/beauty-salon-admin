import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrainCapabilityCandidate } from './brain-capability-scan.types.js';
import type { BrainCapabilityGenerationProposal } from './brain-capability-codegen.service.js';
import { BrainCapabilityGenerationGateService } from './brain-capability-generation-gate.service.js';
import {
  createGeneratedCapabilityBinding,
  createGeneratedCapabilityProposalFingerprint,
  renderGeneratedCapabilityBindingSource,
  renderGeneratedCapabilityContractTestSource,
} from './brain-generated-capability-binding.js';

describe('BrainCapabilityGenerationGateService', () => {
  const gate = new BrainCapabilityGenerationGateService();

  it('passes compile, contract, security and deterministic test gates for a fixed read-only target', async () => {
    const { capability, proposal } = fixture();
    const workspaceRoot = await targetWorkspace();

    const report = await gate.evaluate({ capability, proposal, workspaceRoot } as never);
    expect(report).toMatchObject({ passed: true });
    expect(report.gates).toEqual([
      expect.objectContaining({ gate: 'compile', passed: true }),
      expect.objectContaining({ gate: 'contract', passed: true }),
      expect.objectContaining({ gate: 'security', passed: true }),
      expect.objectContaining({ gate: 'test', passed: true }),
    ]);
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('compiles the virtual generated binding against the real target class and method signature', async () => {
    const { capability, proposal } = fixture();
    const workspaceRoot = await targetWorkspace();
    await writeFile(
      join(workspaceRoot, 'packages/server-v2/src/customers/customers.service.ts'),
      `export class CustomersService { renamed(args: { keyword?: string }): Promise<unknown[]> { return Promise.resolve([]); } }`,
      'utf8',
    );

    const report = await gate.evaluate({ capability, proposal, workspaceRoot } as never);

    expect(report.gates.find((item) => item.gate === 'compile')).toMatchObject({ passed: false });
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('fails compile gate for invalid generated TypeScript', async () => {
    const { capability, proposal } = fixture();
    proposal.bindingSource += '\nconst broken: string = 1;\n';

    const report = await gate.evaluate({ capability, proposal });

    expect(report.gates.find((item) => item.gate === 'compile')).toMatchObject({ passed: false });
    expect(report.passed).toBe(false);
  });

  it('fails contract gate when target identity or binding fingerprint is tampered', async () => {
    const { capability, proposal } = fixture();
    proposal.executorBinding.target.methodName = 'deleteAll';

    const report = await gate.evaluate({ capability, proposal });

    expect(report.gates.find((item) => item.gate === 'contract')).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining([expect.stringContaining('target')]),
    });
  });

  it('fails security gate for dangerous imports and identity arguments', async () => {
    const dangerous = fixture();
    dangerous.proposal.bindingSource = `import { exec } from 'node:child_process';\n${dangerous.proposal.bindingSource}`;
    const dangerousReport = await gate.evaluate(dangerous);
    expect(dangerousReport.gates.find((item) => item.gate === 'security')).toMatchObject({ passed: false });

    const identity = fixture();
    identity.proposal.executorBinding.inputSchema = {
      type: 'object',
      properties: { storeId: { type: 'number' } },
      required: ['storeId'],
      additionalProperties: false,
    };
    const identityReport = await gate.evaluate(identity);
    expect(identityReport.gates.find((item) => item.gate === 'security')).toMatchObject({ passed: false });
  });

  it('fails security and contract gates for permission or store scope drift', async () => {
    const permission = fixture();
    permission.proposal.executorBinding.requiredPermissions = ['core:customer:admin'];
    const permissionReport = await gate.evaluate(permission);
    expect(permissionReport.passed).toBe(false);

    const scope = fixture();
    scope.proposal.executorBinding.storeScope = 'none';
    const scopeReport = await gate.evaluate(scope);
    expect(scopeReport.passed).toBe(false);
  });
});

function fixture(): { capability: BrainCapabilityCandidate; proposal: BrainCapabilityGenerationProposal } {
  const capability: BrainCapabilityCandidate = {
    key: 'customer_facts',
    name: 'CustomersService.list',
    businessDefinitionKeys: ['entity.customer'],
    status: 'draft',
    enabled: false,
    explicit: true,
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    storeScope: 'required',
    requiredPermissions: ['core:customer:view'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    inputContract: { keyword: 'optional:string', storeId: 'required:number' },
    outputContract: { return: 'Promise<Customer[]>' },
    sourceFingerprint: 'a'.repeat(64),
    evidence: [
      {
        sourceType: 'service',
        path: 'packages/server-v2/src/customers/customers.service.ts',
        line: 10,
        symbol: 'CustomersService.list',
        data: {
          executorTarget: {
            kind: 'service',
            className: 'CustomersService',
            methodName: 'list',
            sourcePath: 'packages/server-v2/src/customers/customers.service.ts',
            exportedClass: true,
            methodAccess: 'public',
            parameterCount: 1,
            parameterTypes: ['{ keyword?: string }'],
            returnType: 'Promise<unknown[]>',
          },
        },
      },
    ],
    issues: [],
  };
  const executorBinding = createGeneratedCapabilityBinding({
    capability,
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string' } },
      required: [],
      additionalProperties: false,
    },
    outputSchema: { type: 'array', items: { type: 'object' } },
  });
  const bindingSource = renderGeneratedCapabilityBindingSource(executorBinding);
  const contractTestSource = renderGeneratedCapabilityContractTestSource(executorBinding);
  const manifest = {
    key: capability.key,
    version: 1 as const,
    sourceFingerprint: capability.sourceFingerprint,
    name: '客户事实',
    description: '查询客户事实',
    domains: ['customer'],
    intents: ['query_customer_facts'],
    inputSchema: executorBinding.inputSchema,
    outputSchema: executorBinding.outputSchema,
    requiredPermissions: capability.requiredPermissions,
    allowedRoles: [],
    readOnly: true as const,
    sideEffect: false as const,
    riskLevel: 'low' as const,
    requiresConfirmation: false as const,
    idempotency: 'not_applicable' as const,
    timeoutMs: 10_000,
    grounding: 'domain_service' as const,
    examples: ['查客户'],
    negativeExamples: ['改客户'],
    synonyms: [],
    successSchema: { type: 'array', items: { type: 'object' } },
    definitionRefs: [],
  };
  const contractArtifact = {
    manifest,
    scanEvidence: {
      capabilityKey: capability.key,
      sourceFingerprint: capability.sourceFingerprint,
      requiredPermissions: capability.requiredPermissions,
      storeScope: capability.storeScope,
      inputSchema: executorBinding.inputSchema,
      outputSchema: executorBinding.outputSchema,
      executorBinding,
    },
    proposal: {
      capabilityKey: capability.key,
      sourceFingerprint: capability.sourceFingerprint,
      businessDefinitions: [],
      storeScope: capability.storeScope,
      executorBinding,
    },
  };
  const proposal = {
    status: 'ready' as const,
    capabilityKey: capability.key,
    sourceFingerprint: capability.sourceFingerprint,
    proposalFingerprint: '',
    businessDefinitions: [],
    manifest,
    languageCandidates: {
      description: '查询客户事实',
      positiveExamples: ['查客户'],
      negativeExamples: ['改客户'],
      synonyms: [],
      successSchema: manifest.successSchema,
      riskExplanation: '只读',
    },
    executorBinding,
    bindingSource,
    contractArtifact,
    contractTestSource,
    gateReport: { passed: false, gates: [] },
  } satisfies BrainCapabilityGenerationProposal;
  proposal.proposalFingerprint = createGeneratedCapabilityProposalFingerprint({
    sourceFingerprint: proposal.sourceFingerprint,
    manifest: proposal.manifest,
    executorBinding: proposal.executorBinding,
    bindingSource: proposal.bindingSource,
    contractTestSource: proposal.contractTestSource,
  });
  return {
    capability,
    proposal,
  };
}

async function targetWorkspace() {
  const root = await mkdtemp(join(tmpdir(), 'ami-brain-real-target-'));
  await mkdir(join(root, 'packages/server-v2/src/customers'), { recursive: true });
  await mkdir(join(root, 'packages/server-v2/src/brain/capability'), { recursive: true });
  await writeFile(
    join(root, 'packages/server-v2/src/customers/customers.service.ts'),
    `export class CustomersService { list(args: { keyword?: string }): Promise<unknown[]> { return Promise.resolve([]); } }`,
    'utf8',
  );
  await writeFile(
    join(root, 'packages/server-v2/src/brain/capability/brain-generated-capability-binding.ts'),
    `export function assertGeneratedCapabilityArgs(_schema: Record<string, unknown>, _args: unknown): void {}`,
    'utf8',
  );
  await writeFile(
    join(root, 'packages/server-v2/tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['src/**/*'],
    }),
    'utf8',
  );
  return root;
}
