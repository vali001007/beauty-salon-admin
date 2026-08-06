import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { createHash, createHmac } from 'node:crypto';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator.js';
import { BrainGateReceiptVerificationService } from './brain-gate-receipt-verification.service.js';
import {
  BrainGovernanceReceiptIngestGuard,
  type BrainReceiptIngestRequest,
} from './brain-governance-receipt-ingest.guard.js';
import { BrainGovernanceReceiptController } from './brain-governance-receipt.controller.js';

describe('BrainGovernanceReceiptController', () => {
  it('uses only the dedicated machine-ingest guard and no human governance permission metadata', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      BrainGovernanceReceiptController.prototype.ingestReceipt,
    ) ?? [];

    expect(guards).toEqual([BrainGovernanceReceiptIngestGuard]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BrainGovernanceReceiptController.prototype.ingestReceipt))
      .toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, BrainGovernanceReceiptController) ?? [])
      .toEqual([]);
  });

  it('persists only the server-verified receipt and trust level without a human actor', async () => {
    const verificationService = {
      verifyReceipt: jest.fn().mockReturnValue({
        receipt: { receiptId: 'receipt-verified', status: 'passed', candidateId: 'a'.repeat(64) },
        trustLevel: 'trusted_candidate',
      }),
      verifyReleaseEvidence: jest.fn().mockResolvedValue(undefined),
    };
    const governanceControlPlaneService = {
      ingestReceipt: jest.fn().mockResolvedValue({ id: 31, status: 'passed' }),
    };
    const candidateService = {
      upsertFromReceipt: jest.fn().mockResolvedValue({ id: 17, candidateKey: 'candidate-1' }),
    };
    const controller = new BrainGovernanceReceiptController(
      verificationService as never,
      governanceControlPlaneService as never,
      candidateService as never,
    );
    const request = {
      brainReceiptIssuer: 'CI/CD',
      brainReceiptAuthentication: 'github_oidc',
    } as BrainReceiptIngestRequest;
    const body = { receiptId: 'receipt-client', status: 'passed' };

    await expect(controller.ingestReceipt(request, body)).resolves.toEqual({ id: 31, status: 'passed' });
    expect(verificationService.verifyReceipt).toHaveBeenCalledWith(
      body,
      'CI/CD',
      expect.any(Date),
      'github_oidc',
    );
    expect(verificationService.verifyReleaseEvidence).toHaveBeenCalledWith({
      receipt: { receiptId: 'receipt-verified', status: 'passed', candidateId: 'a'.repeat(64) },
      trustLevel: 'trusted_candidate',
    });
    expect(candidateService.upsertFromReceipt).toHaveBeenCalledWith({
      receiptId: 'receipt-verified',
      status: 'passed',
      candidateId: 'a'.repeat(64),
    });
    expect(governanceControlPlaneService.ingestReceipt).toHaveBeenCalledWith(
      {
        receiptId: 'receipt-verified',
        status: 'passed',
        candidateId: 'a'.repeat(64),
        governanceCandidateId: 17,
      },
      undefined,
      'trusted_candidate',
    );
  });

  it('stores HMAC observations as untrusted diagnostics without creating or superseding a candidate', async () => {
    const verificationService = {
      verifyReceipt: jest.fn().mockReturnValue({
        receipt: { receiptId: 'observe-1', stage: 'observe', status: 'passed' },
        trustLevel: 'untrusted_dev',
      }),
      verifyReleaseEvidence: jest.fn().mockResolvedValue(undefined),
    };
    const governanceControlPlaneService = {
      ingestReceipt: jest.fn().mockResolvedValue({ id: 41, status: 'untrusted' }),
    };
    const candidateService = {
      upsertFromReceipt: jest.fn(),
      bindVerifiedReleaseReceipt: jest.fn(),
    };
    const controller = new BrainGovernanceReceiptController(
      verificationService as never,
      governanceControlPlaneService as never,
      candidateService as never,
    );
    const request = {
      brainReceiptIssuer: 'observe-client',
      brainReceiptAuthentication: 'hmac',
    } as BrainReceiptIngestRequest;

    await expect(controller.ingestReceipt(request, { stage: 'observe' }))
      .resolves.toEqual({ id: 41, status: 'untrusted' });
    expect(candidateService.upsertFromReceipt).not.toHaveBeenCalled();
    expect(candidateService.bindVerifiedReleaseReceipt).not.toHaveBeenCalled();
    expect(governanceControlPlaneService.ingestReceipt).toHaveBeenCalledWith(
      expect.not.objectContaining({ governanceCandidateId: expect.anything() }),
      undefined,
      'untrusted_dev',
    );
  });
});

describe('BrainGovernanceReceiptIngestGuard', () => {
  const previousSecret = process.env.BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET;
  const previousHmacFallback = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK;
  const previousIssuers = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS;
  const previousRepositories = process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES;
  const secret = 'receipt-ingest-test-secret';
  const issuer = 'CI/CD';
  const now = new Date('2026-08-02T10:00:00.000Z');

  beforeEach(() => {
    process.env.BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET = secret;
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK = 'true';
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS = issuer;
    process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES = 'owner/repo';
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET', previousSecret);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK', previousHmacFallback);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS', previousIssuers);
    restoreEnv('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES', previousRepositories);
  });

  it('verifies HTTP headers and marks HMAC envelopes as observation-only authentication', async () => {
    const body = { schemaVersion: 3, receiptId: 'receipt-1', repository: 'owner/repo', workflow: issuer };
    const timestamp = now.toISOString();
    const request = requestFor(body, {
      'x-brain-receipt-issuer': issuer,
      'x-brain-receipt-timestamp': timestamp,
      'x-brain-receipt-signature': sign(body, timestamp, issuer, secret),
    });
    const guard = new BrainGovernanceReceiptIngestGuard(new BrainGateReceiptVerificationService());

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.brainReceiptIssuer).toBe(issuer);
    expect(request.brainReceiptAuthentication).toBe('hmac');
  });

  it.each([
    ['unknown issuer', { issuer: 'unknown', timestamp: now.toISOString(), signature: '0'.repeat(64) }, 'receipt_issuer_not_allowed'],
    ['invalid signature', { issuer, timestamp: now.toISOString(), signature: '0'.repeat(64) }, 'receipt_signature_invalid'],
    ['expired timestamp', { issuer, timestamp: '2026-08-02T09:50:00.000Z', signature: '0'.repeat(64) }, 'receipt_timestamp_expired'],
  ])('rejects %s before the controller runs', async (_label, input, expected) => {
    const body = { schemaVersion: 3, receiptId: 'receipt-1', repository: 'owner/repo', workflow: issuer };
    const request = requestFor(body, {
      'x-brain-receipt-issuer': input.issuer,
      'x-brain-receipt-timestamp': input.timestamp,
      'x-brain-receipt-signature': input.signature,
    });
    const guard = new BrainGovernanceReceiptIngestGuard(new BrainGateReceiptVerificationService());

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(expected);
    expect(request.brainReceiptIssuer).toBeUndefined();
  });
});

function contextFor(request: BrainReceiptIngestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function requestFor(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): BrainReceiptIngestRequest {
  return { body, headers } as unknown as BrainReceiptIngestRequest;
}

function sign(body: unknown, timestamp: string, issuer: string, secret: string) {
  const bodyChecksum = createHash('sha256').update(stableStringify(body)).digest('hex');
  return createHmac('sha256', secret).update(`${timestamp}.${issuer}.${bodyChecksum}`).digest('hex');
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
