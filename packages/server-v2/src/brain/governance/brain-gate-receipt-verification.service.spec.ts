import { createHash, createHmac } from 'node:crypto';
import {
  BrainGateReceiptVerificationService,
  verifyGithubOidcClaims,
} from './brain-gate-receipt-verification.service.js';

describe('BrainGateReceiptVerificationService', () => {
  const service = new BrainGateReceiptVerificationService();
  const previousSecret = process.env.BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET;
  const previousHmacFallback = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK;
  const previousIssuers = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS;
  const previousRepositories = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES;
  const previousRefs = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REFS;
  const previousEvents = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_EVENTS;
  const previousJobWorkflowRefs = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_JOB_WORKFLOW_REFS;
  const previousReleaseIssuers = process.env.BRAIN_GOVERNANCE_RECEIPT_RELEASE_ISSUERS;

  beforeEach(() => {
    process.env.BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET = 'test-receipt-secret';
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK = 'true';
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS = 'CI/CD,release-service';
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES = 'owner/repo';
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REFS = 'refs/heads/main,refs/heads/develop';
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_EVENTS = 'push';
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_JOB_WORKFLOW_REFS = 'owner/repo/.github/workflows/ci.yml@refs/heads/main';
    process.env.BRAIN_GOVERNANCE_RECEIPT_RELEASE_ISSUERS = 'release-service';
  });

  afterAll(() => {
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET', previousSecret);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK', previousHmacFallback);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS', previousIssuers);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES', previousRepositories);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REFS', previousRefs);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_EVENTS', previousEvents);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_JOB_WORKFLOW_REFS', previousJobWorkflowRefs);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_RELEASE_ISSUERS', previousReleaseIssuers);
  });

  it('accepts an explicitly enabled HMAC fallback receipt and recomputes identity and result checksums', async () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const receipt = candidateReceipt(now);
    const timestamp = now.toISOString();
    const issuer = 'CI/CD';
    const signature = sign(receipt, timestamp, issuer, 'test-receipt-secret');

    await expect(service.verifyEnvelope({ body: receipt, timestamp, issuer, signature, now })).resolves.toEqual({
      issuer,
      bodyChecksum: sha256(receipt),
    });
    const verified = service.verifyReceipt(receipt, issuer, now);
    expect(verified.trustLevel).toBe('trusted_candidate');
    expect(verified.admissionEligible).toBe(false);
    expect(verified.receipt.verification).toEqual(expect.objectContaining({
      status: 'verified',
      trustLevel: 'trusted_candidate',
      admissionEligible: false,
      issuer,
    }));
  });

  it('marks a fully identified candidate receipt as admission eligible', () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const base = candidateReceipt(now);
    const identity = identityFields({
      ...base,
      releaseFingerprint: 'release-fingerprint-1',
      dataSnapshot: 'snapshot-1',
      provider: 'openai_responses',
      model: 'gpt-test',
    });
    const receipt = { ...base, ...identity, identityChecksum: sha256(identity) };
    expect(service.verifyReceipt(receipt, 'CI/CD', now).admissionEligible).toBe(true);
  });

  it('rejects stale timestamps, unknown issuers and invalid signatures', async () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const receipt = candidateReceipt(now);
    await expect(service.verifyEnvelope({
      body: receipt,
      timestamp: '2026-08-02T09:50:00.000Z',
      issuer: 'CI/CD',
      signature: '0'.repeat(64),
      now,
    })).rejects.toThrow('receipt_timestamp_expired');
    await expect(service.verifyEnvelope({
      body: receipt,
      timestamp: now.toISOString(),
      issuer: 'unknown-workflow',
      signature: '0'.repeat(64),
      now,
    })).rejects.toThrow('receipt_issuer_not_allowed');
    await expect(service.verifyEnvelope({
      body: receipt,
      timestamp: now.toISOString(),
      issuer: 'CI/CD',
      signature: '0'.repeat(64),
      now,
    })).rejects.toThrow('receipt_signature_invalid');
  });

  it('rejects a correctly signed receipt from an unapproved repository or mismatched workflow', async () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const timestamp = now.toISOString();
    const issuer = 'CI/CD';
    const otherRepository = { ...candidateReceipt(now), repository: 'other/repo' };
    const otherWorkflow = { ...candidateReceipt(now), workflow: 'Other Workflow' };

    await expect(service.verifyEnvelope({
      body: otherRepository,
      timestamp,
      issuer,
      signature: sign(otherRepository, timestamp, issuer, 'test-receipt-secret'),
      now,
    })).rejects.toThrow('receipt_repository_not_allowed');
    await expect(service.verifyEnvelope({
      body: otherWorkflow,
      timestamp,
      issuer,
      signature: sign(otherWorkflow, timestamp, issuer, 'test-receipt-secret'),
      now,
    })).rejects.toThrow('receipt_workflow_issuer_mismatch');
  });

  it('fails closed without GitHub OIDC unless the HMAC fallback is explicitly enabled', async () => {
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK = 'false';
    const now = new Date('2026-08-02T10:00:00.000Z');
    const receipt = candidateReceipt(now);
    await expect(service.verifyEnvelope({
      body: receipt,
      timestamp: now.toISOString(),
      issuer: 'CI/CD',
      signature: '0'.repeat(64),
      now,
    })).rejects.toThrow('receipt_oidc_token_required');
  });

  it('binds GitHub OIDC claims to repository, workflow, protected ref, job workflow and head commit', () => {
    const body = {
      repository: 'owner/repo',
      branch: 'main',
      workflow: 'CI/CD',
      eventName: 'push',
      headCommit: 'c'.repeat(40),
    };
    const payload = {
      repository: 'owner/repo',
      workflow: 'CI/CD',
      ref: 'refs/heads/main',
      ref_protected: 'true',
      event_name: 'push',
      sha: 'c'.repeat(40),
      job_workflow_ref: 'owner/repo/.github/workflows/ci.yml@refs/heads/main',
    };
    expect(verifyGithubOidcClaims(payload, body)).toBe('CI/CD');
    expect(() => verifyGithubOidcClaims({ ...payload, sha: 'd'.repeat(40) }, body))
      .toThrow('receipt_oidc_head_commit_mismatch');
    expect(() => verifyGithubOidcClaims({ ...payload, ref: 'refs/pull/1/merge' }, body))
      .toThrow('receipt_oidc_ref_not_allowed');
    expect(() => verifyGithubOidcClaims({ ...payload, ref_protected: 'false' }, body))
      .toThrow('receipt_oidc_ref_not_protected');
    expect(() => verifyGithubOidcClaims({
      ...payload,
      job_workflow_ref: 'owner/repo/.github/workflows/ci.yml@refs/pull/1/merge',
    }, body)).toThrow('receipt_oidc_job_workflow_ref_not_allowed');
  });

  it('rejects forged identity and result checksums', () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const receipt = candidateReceipt(now);
    expect(() => service.verifyReceipt({ ...receipt, identityChecksum: '0'.repeat(64) }, 'CI/CD', now))
      .toThrow('receipt_identity_checksum_mismatch');
    expect(() => service.verifyReceipt({ ...receipt, resultChecksum: '0'.repeat(64) }, 'CI/CD', now))
      .toThrow('receipt_result_checksum_mismatch');
  });

  it.each([
    ['eval run', { evalRunId: null, evaluationReleaseId: 21 }],
    ['evaluation release', { evalRunId: 501, evaluationReleaseId: null }],
    ['candidate', { candidateId: null, evalRunId: 501, evaluationReleaseId: 21 }],
  ])('requires the %s identity before granting verified-release trust', (_label, evalIdentity) => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const candidate = candidateReceipt(now);
    const releaseIdentity = identityFields({
      ...candidate,
      stage: 'release',
      workflow: 'release-service',
      releaseFingerprint: 'release-fingerprint-1',
      dataSnapshot: 'snapshot-1',
      provider: 'openai_responses',
      model: 'gpt-test',
      candidateId: '5'.repeat(64),
      ...evalIdentity,
    });
    const receipt = { ...candidate, ...releaseIdentity, stage: 'release', identityChecksum: sha256(releaseIdentity) };
    expect(() => service.verifyReceipt(receipt, 'release-service', now)).toThrow('release_receipt_identity_incomplete');
  });

  it('rejects a release receipt from a candidate CI issuer even when its workflow and identity are otherwise valid', () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const candidate = candidateReceipt(now);
    const releaseIdentity = identityFields({
      ...candidate,
      stage: 'release',
      workflow: 'CI/CD',
      releaseFingerprint: 'release-fingerprint-1',
      dataSnapshot: 'snapshot-1',
      provider: 'openai_responses',
      model: 'gpt-test',
      candidateId: '5'.repeat(64),
      evalRunId: 501,
      evaluationReleaseId: 21,
    });
    const receipt = {
      ...candidate,
      ...releaseIdentity,
      stage: 'release',
      workflow: 'CI/CD',
      identityChecksum: sha256(releaseIdentity),
    };
    expect(() => service.verifyReceipt(receipt, 'CI/CD', now)).toThrow('release_receipt_issuer_not_allowed');
  });

  it('grants verified-release trust only to the release service with exact eval identities', () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const candidate = candidateReceipt(now);
    const releaseIdentity = identityFields({
      ...candidate,
      stage: 'release',
      workflow: 'release-service',
      releaseFingerprint: 'release-fingerprint-1',
      dataSnapshot: 'snapshot-1',
      provider: 'openai_responses',
      model: 'gpt-test',
      candidateId: '5'.repeat(64),
      evalRunId: 501,
      evaluationReleaseId: 21,
    });
    const receipt = {
      ...candidate,
      ...releaseIdentity,
      stage: 'release',
      workflow: 'release-service',
      identityChecksum: sha256(releaseIdentity),
    };
    expect(() => service.verifyReceipt(receipt, 'CI/CD', now)).toThrow('receipt_workflow_issuer_mismatch');
    const verified = service.verifyReceipt(receipt, 'release-service', now);
    expect(verified.trustLevel).toBe('verified_release');
    expect(verified.admissionEligible).toBe(true);
  });

  it('cross-checks release receipts against the persisted release readiness evidence', async () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const candidate = candidateReceipt(now);
    const releaseIdentity = identityFields({
      ...candidate,
      stage: 'release',
      workflow: 'release-service',
      releaseFingerprint: 'release-fingerprint-1',
      dataSnapshot: 'snapshot-1',
      provider: 'openai_responses',
      model: 'gpt-test',
      candidateId: '5'.repeat(64),
      evalRunId: 501,
      evaluationReleaseId: 21,
    });
    const receipt = {
      ...candidate,
      ...releaseIdentity,
      stage: 'release',
      workflow: 'release-service',
      identityChecksum: sha256(releaseIdentity),
    };
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue({
        status: 'ready',
        canRelease: true,
        contractVersion: 'ami-brain-release-acceptance/v2',
        sourceCommit: receipt.headCommit,
        evaluationReleaseId: 21,
        evalRunId: 501,
        releaseFingerprint: 'release-fingerprint-1',
        suiteChecksum: receipt.suiteChecksum,
        provider: 'openai_responses',
        model: 'gpt-test',
        blockers: [],
      }),
    };
    const verifyingService = new BrainGateReceiptVerificationService(releaseService as never);
    const verified = verifyingService.verifyReceipt(receipt, 'release-service', now);

    await expect(verifyingService.verifyReleaseEvidence(verified)).resolves.toBeUndefined();
    expect(releaseService.getReleaseReadiness).toHaveBeenCalledWith(21);
  });

  it('rejects release receipts whose persisted readiness identity does not match', async () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const candidate = candidateReceipt(now);
    const releaseIdentity = identityFields({
      ...candidate,
      stage: 'release',
      workflow: 'release-service',
      releaseFingerprint: 'release-fingerprint-1',
      dataSnapshot: 'snapshot-1',
      provider: 'openai_responses',
      model: 'gpt-test',
      candidateId: '5'.repeat(64),
      evalRunId: 501,
      evaluationReleaseId: 21,
    });
    const receipt = {
      ...candidate,
      ...releaseIdentity,
      stage: 'release',
      workflow: 'release-service',
      identityChecksum: sha256(releaseIdentity),
    };
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue({
        status: 'ready',
        canRelease: true,
        contractVersion: 'ami-brain-release-acceptance/v2',
        sourceCommit: receipt.headCommit,
        evaluationReleaseId: 21,
        evalRunId: 999,
        releaseFingerprint: 'release-fingerprint-1',
        suiteChecksum: receipt.suiteChecksum,
        provider: 'openai_responses',
        model: 'gpt-test',
        blockers: [],
      }),
    };
    const verifyingService = new BrainGateReceiptVerificationService(releaseService as never);
    const verified = verifyingService.verifyReceipt(receipt, 'release-service', now);

    await expect(verifyingService.verifyReleaseEvidence(verified))
      .rejects.toThrow('release_receipt_evaluation_identity_mismatch');
  });

  it('rejects historical v1 readiness evidence for a release receipt', async () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const receipt = releaseReceipt(now);
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(
        releaseReadiness(receipt, { contractVersion: 'ami-brain-release-acceptance/v1' }),
      ),
    };
    const verifyingService = new BrainGateReceiptVerificationService(releaseService as never);
    const verified = verifyingService.verifyReceipt(receipt, 'release-service', now);

    await expect(verifyingService.verifyReleaseEvidence(verified))
      .rejects.toThrow('release_receipt_acceptance_contract_invalid');
  });

  it('rejects release readiness produced from a different source commit', async () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const receipt = releaseReceipt(now);
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(
        releaseReadiness(receipt, { sourceCommit: 'd'.repeat(40) }),
      ),
    };
    const verifyingService = new BrainGateReceiptVerificationService(releaseService as never);
    const verified = verifyingService.verifyReceipt(receipt, 'release-service', now);

    await expect(verifyingService.verifyReleaseEvidence(verified))
      .rejects.toThrow('release_receipt_source_commit_mismatch');
  });
});

function releaseReceipt(now: Date) {
  const candidate = candidateReceipt(now);
  const releaseIdentity = identityFields({
    ...candidate,
    stage: 'release',
    workflow: 'release-service',
    releaseFingerprint: 'release-fingerprint-1',
    dataSnapshot: 'snapshot-1',
    provider: 'openai_responses',
    model: 'gpt-test',
    candidateId: '5'.repeat(64),
    evalRunId: 501,
    evaluationReleaseId: 21,
  });
  return {
    ...candidate,
    ...releaseIdentity,
    stage: 'release',
    workflow: 'release-service',
    identityChecksum: sha256(releaseIdentity),
  };
}

function releaseReadiness(receipt: ReturnType<typeof releaseReceipt>, overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    canRelease: true,
    contractVersion: 'ami-brain-release-acceptance/v2',
    sourceCommit: receipt.headCommit,
    evaluationReleaseId: 21,
    evalRunId: 501,
    releaseFingerprint: receipt.releaseFingerprint,
    suiteChecksum: receipt.suiteChecksum,
    provider: receipt.provider,
    model: receipt.model,
    blockers: [],
    ...overrides,
  };
}

function candidateReceipt(now: Date) {
  const results = [{ gateId: 'brain_contract', gateKey: 'brain_contract', status: 'passed', inputChecksum: 'a'.repeat(64) }];
  const identity = identityFields({
    stage: 'candidate',
    riskLevel: 'medium',
    changedFilesChecksum: '1'.repeat(64),
    diffChecksum: '2'.repeat(64),
    sourceFingerprint: '3'.repeat(64),
    releaseFingerprint: null,
    suiteChecksum: '4'.repeat(64),
    dataSnapshot: null,
    provider: null,
    model: null,
    timeout: null,
    repository: 'owner/repo',
    branch: 'feature/governance',
    workflow: 'CI/CD',
    eventName: 'pull_request',
    baseCommit: 'a'.repeat(40),
    mergeBaseCommit: 'b'.repeat(40),
    headCommit: 'c'.repeat(40),
    candidateKey: `owner/repo:${'c'.repeat(40)}:${'b'.repeat(40)}`,
  });
  return {
    schemaVersion: 3,
    receiptId: 'receipt-candidate-1',
    ...identity,
    identityChecksum: sha256(identity),
    status: 'passed',
    plan: { capabilities: ['customer_facts'], gates: [{ id: 'brain_contract' }] },
    results,
    resultChecksum: sha256(results),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  };
}

function identityFields(value: Record<string, unknown>) {
  return {
    stage: value.stage,
    riskLevel: value.riskLevel,
    changedFilesChecksum: value.changedFilesChecksum,
    diffChecksum: value.diffChecksum,
    sourceFingerprint: value.sourceFingerprint,
    releaseFingerprint: value.releaseFingerprint ?? null,
    suiteChecksum: value.suiteChecksum,
    dataSnapshot: value.dataSnapshot ?? null,
    provider: value.provider ?? null,
    model: value.model ?? null,
    timeout: value.timeout ?? null,
    repository: value.repository,
    branch: value.branch ?? null,
    workflow: value.workflow,
    eventName: value.eventName,
    baseCommit: value.baseCommit,
    mergeBaseCommit: value.mergeBaseCommit,
    headCommit: value.headCommit,
    candidateKey: value.candidateKey,
    candidateId: value.candidateId ?? null,
    evalRunId: value.evalRunId ?? null,
    evaluationReleaseId: value.evaluationReleaseId ?? null,
  };
}

function sign(body: unknown, timestamp: string, issuer: string, secret: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${issuer}.${sha256(body)}`).digest('hex');
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
