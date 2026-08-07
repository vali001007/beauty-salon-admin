import { BadRequestException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import * as jsonwebtokenModule from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { BrainReleaseService } from './brain-release.service.js';
import {
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
} from './brain-release-product-profile.js';

const jsonwebtoken = (jsonwebtokenModule as typeof jsonwebtokenModule & {
  default?: typeof jsonwebtokenModule;
}).default ?? jsonwebtokenModule;
const { decode: decodeJwt, verify: verifyJwt } = jsonwebtoken;

const RECEIPT_STAGES = ['candidate', 'prerelease', 'release', 'observe'] as const;
const RECEIPT_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const HEX_64 = /^[a-f0-9]{64}$/;
const CAPABILITY_KEY = /^[a-z][a-z0-9_]{1,127}$/;
const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const QUERY_ONLY_REQUIRED_RELEASE_GATES = [
  'release_contract',
  'permission_matrix',
  'cross_client_e2e',
  'target_database',
  'provider_fallback',
  'rollback_drill',
] as const;
const QUERY_ONLY_REQUIRED_PRERELEASE_GATES = QUERY_ONLY_REQUIRED_RELEASE_GATES.filter(
  (gateKey) => gateKey !== 'rollback_drill',
);
const QUERY_ONLY_RELEASE_CAPABILITIES = [
  ...BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  ...BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
];
const GITHUB_OIDC_JWKS = new JwksClient({
  jwksUri: `${GITHUB_OIDC_ISSUER}/.well-known/jwks`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

export interface VerifiedBrainGateReceipt {
  receipt: Record<string, unknown>;
  issuer: string;
  trustLevel: 'untrusted_dev' | 'trusted_candidate' | 'verified_prerelease' | 'verified_release';
  admissionEligible: boolean;
  identityChecksum: string;
  resultChecksum: string;
}

export type BrainReceiptAuthentication = 'github_oidc' | 'hmac';

@Injectable()
export class BrainGateReceiptVerificationService {
  constructor(@Optional() private readonly releaseService?: BrainReleaseService) {}

  async verifyEnvelope(input: {
    body: Record<string, unknown>;
    authorization?: unknown;
    timestamp: unknown;
    signature: unknown;
    issuer: unknown;
    now?: Date;
  }): Promise<{ issuer: string; bodyChecksum: string; authentication: BrainReceiptAuthentication }> {
    const oidcToken = bearerToken(input.authorization);
    if (oidcToken) return this.verifyGithubOidcEnvelope(input.body, oidcToken);
    return this.verifyHmacEnvelope(input);
  }

  private async verifyGithubOidcEnvelope(
    body: Record<string, unknown>,
    token: string,
  ): Promise<{ issuer: string; bodyChecksum: string; authentication: BrainReceiptAuthentication }> {
    const audience = String(process.env.BRAIN_GOVERNANCE_RECEIPT_OIDC_AUDIENCE ?? '').trim();
    if (!audience) throw new UnauthorizedException('receipt_oidc_audience_missing');
    let payload: JwtPayload;
    try {
      const decoded = decodeJwt(token, { complete: true });
      const kid = decoded && typeof decoded === 'object' ? String(decoded.header?.kid ?? '').trim() : '';
      if (!kid || decoded?.header?.alg !== 'RS256') throw new Error('oidc_header_invalid');
      const signingKey = await GITHUB_OIDC_JWKS.getSigningKey(kid);
      const verified = verifyJwt(token, signingKey.getPublicKey(), {
        algorithms: ['RS256'],
        issuer: GITHUB_OIDC_ISSUER,
        audience,
      });
      if (!verified || typeof verified !== 'object') throw new Error('oidc_payload_invalid');
      payload = verified;
    } catch {
      throw new UnauthorizedException('receipt_oidc_token_invalid');
    }
    const issuer = verifyGithubOidcClaims(payload, body);
    return { issuer, bodyChecksum: sha256(body), authentication: 'github_oidc' };
  }

  private verifyHmacEnvelope(input: {
    body: Record<string, unknown>;
    timestamp: unknown;
    signature: unknown;
    issuer: unknown;
    now?: Date;
  }): { issuer: string; bodyChecksum: string; authentication: BrainReceiptAuthentication } {
    if (process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK !== 'true') {
      throw new UnauthorizedException('receipt_oidc_token_required');
    }
    const secret = String(process.env.BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET ?? '').trim();
    if (!secret) throw new UnauthorizedException('receipt_ingest_not_configured');
    const allowedIssuers = String(process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowedIssuers.length) throw new UnauthorizedException('receipt_ingest_issuer_allowlist_missing');
    const allowedRepositories = String(process.env.BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowedRepositories.length) throw new UnauthorizedException('receipt_ingest_repository_allowlist_missing');

    const issuer = requiredString(input.issuer, 'receipt_issuer_missing');
    if (!allowedIssuers.includes(issuer)) throw new UnauthorizedException('receipt_issuer_not_allowed');
    const timestamp = requiredString(input.timestamp, 'receipt_timestamp_missing');
    const timestampMs = Date.parse(timestamp);
    const now = input.now ?? new Date();
    if (!Number.isFinite(timestampMs) || Math.abs(now.getTime() - timestampMs) > 5 * 60 * 1000) {
      throw new UnauthorizedException('receipt_timestamp_expired');
    }

    const signature = requiredString(input.signature, 'receipt_signature_missing').toLowerCase();
    if (!HEX_64.test(signature)) throw new UnauthorizedException('receipt_signature_invalid');
    const bodyChecksum = sha256(input.body);
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${issuer}.${bodyChecksum}`)
      .digest('hex');
    if (!safeEqual(signature, expected)) throw new UnauthorizedException('receipt_signature_invalid');
    const repository = requiredString(input.body.repository, 'receipt_repository_missing');
    if (!allowedRepositories.includes(repository)) throw new UnauthorizedException('receipt_repository_not_allowed');
    const workflow = requiredString(input.body.workflow, 'receipt_workflow_missing');
    if (workflow !== issuer) throw new UnauthorizedException('receipt_workflow_issuer_mismatch');
    return { issuer, bodyChecksum, authentication: 'hmac' };
  }

  verifyReceipt(
    input: Record<string, unknown>,
    issuer: string,
    now = new Date(),
    authentication: BrainReceiptAuthentication = 'github_oidc',
  ): VerifiedBrainGateReceipt {
    if (Number(input.schemaVersion) !== 3) throw new BadRequestException('receipt_schema_version_invalid');
    const stage = enumString(input.stage, RECEIPT_STAGES, 'receipt_stage_invalid');
    if (authentication === 'hmac' && stage !== 'observe') {
      throw new UnauthorizedException('receipt_hmac_admission_forbidden');
    }
    const riskLevel = enumString(input.riskLevel, RECEIPT_RISK_LEVELS, 'receipt_risk_level_invalid');
    const status = requiredString(input.status, 'receipt_status_missing');
    if (status !== 'passed') throw new BadRequestException('trusted_receipt_must_pass');

    const receiptId = requiredString(input.receiptId ?? input.receiptKey, 'receipt_key_missing');
    const repository = requiredString(input.repository, 'receipt_repository_missing');
    const branch = optionalString(input.branch);
    const workflow = requiredString(input.workflow, 'receipt_workflow_missing');
    if (workflow !== issuer) throw new BadRequestException('receipt_workflow_issuer_mismatch');
    const eventName = requiredString(input.eventName, 'receipt_event_name_missing');
    const baseCommit = gitCommit(input.baseCommit, 'receipt_base_commit_invalid');
    const mergeBaseCommit = gitCommit(input.mergeBaseCommit, 'receipt_merge_base_commit_invalid');
    const headCommit = gitCommit(input.headCommit, 'receipt_head_commit_invalid');
    const candidateKey = requiredString(input.candidateKey, 'receipt_candidate_key_missing');
    const changedFilesChecksum = hash64(input.changedFilesChecksum, 'receipt_changed_files_checksum_invalid');
    const diffChecksum = hash64(input.diffChecksum, 'receipt_diff_checksum_invalid');
    const sourceFingerprint = hash64(input.sourceFingerprint, 'receipt_source_fingerprint_invalid');
    const suiteChecksum = hash64(input.suiteChecksum, 'receipt_suite_checksum_invalid');
    const providedIdentityChecksum = hash64(input.identityChecksum, 'receipt_identity_checksum_invalid');
    const providedResultChecksum = hash64(input.resultChecksum, 'receipt_result_checksum_invalid');
    const timeout = input.timeout === null || input.timeout === undefined ? null : positiveInteger(input.timeout, 'receipt_timeout_invalid');
    const releaseFingerprint = optionalString(input.releaseFingerprint);
    const dataSnapshot = optionalString(input.dataSnapshot);
    const provider = optionalString(input.provider);
    const model = optionalString(input.model);
    const candidateId = optionalHash64(input.candidateId, 'receipt_candidate_id_invalid');
    const evalRunId = optionalPositiveInteger(input.evalRunId, 'receipt_eval_run_id_invalid');
    const evaluationReleaseId = optionalPositiveInteger(input.evaluationReleaseId, 'receipt_evaluation_release_id_invalid');

    if (stage === 'prerelease' || stage === 'release') {
      const releaseIssuers = envList('BRAIN_GOVERNANCE_RECEIPT_RELEASE_ISSUERS');
      if (!releaseIssuers.length) throw new BadRequestException('release_receipt_issuer_allowlist_missing');
      if (!releaseIssuers.includes(issuer)) throw new BadRequestException('release_receipt_issuer_not_allowed');
      if (!releaseFingerprint || !dataSnapshot || !provider || !model || !candidateId || !evalRunId || !evaluationReleaseId) {
        throw new BadRequestException('release_receipt_identity_incomplete');
      }
    }

    const identity = {
      stage,
      riskLevel,
      changedFilesChecksum,
      diffChecksum,
      sourceFingerprint,
      releaseFingerprint,
      suiteChecksum,
      dataSnapshot,
      provider,
      model,
      timeout,
      repository,
      branch,
      workflow,
      eventName,
      baseCommit,
      mergeBaseCommit,
      headCommit,
      candidateKey,
      candidateId,
      evalRunId,
      evaluationReleaseId,
    };
    const identityChecksum = sha256(identity);
    if (!safeEqual(providedIdentityChecksum, identityChecksum)) {
      throw new BadRequestException('receipt_identity_checksum_mismatch');
    }

    const results = Array.isArray(input.results) ? input.results : [];
    if (!results.length || results.some((result) => record(result).status !== 'passed')) {
      throw new BadRequestException('receipt_gate_results_invalid');
    }
    const resultChecksum = sha256(results);
    if (!safeEqual(providedResultChecksum, resultChecksum)) {
      throw new BadRequestException('receipt_result_checksum_mismatch');
    }

    const capabilities = record(input.plan).capabilities;
    if (!Array.isArray(capabilities) || capabilities.some((key) => !CAPABILITY_KEY.test(String(key)))) {
      throw new BadRequestException('receipt_capabilities_invalid');
    }
    if (stage === 'prerelease' || stage === 'release') {
      const requiredGates = stage === 'prerelease'
        ? QUERY_ONLY_REQUIRED_PRERELEASE_GATES
        : QUERY_ONLY_REQUIRED_RELEASE_GATES;
      const gateKeys = results.map((result) => String(record(result).gateKey ?? record(result).gateId ?? '')).filter(Boolean);
      const planGateKeys = Array.isArray(record(input.plan).gates)
        ? (record(input.plan).gates as unknown[]).map((gate) => String(record(gate).id ?? '')).filter(Boolean)
        : [];
      if (gateKeys.length !== requiredGates.length
        || planGateKeys.length !== requiredGates.length
        || !sameStringSet(gateKeys, [...requiredGates])
        || !sameStringSet(planGateKeys, [...requiredGates])) {
        throw new BadRequestException(`${stage}_receipt_gate_manifest_invalid`);
      }
      if (capabilities.length !== QUERY_ONLY_RELEASE_CAPABILITIES.length
        || !sameStringSet(capabilities.map(String), QUERY_ONLY_RELEASE_CAPABILITIES)) {
        throw new BadRequestException('release_receipt_capability_manifest_invalid');
      }
    }
    const expiresAt = new Date(requiredString(input.expiresAt, 'receipt_expires_at_missing'));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw new BadRequestException('receipt_expired');
    }

    const trustLevel = authentication === 'hmac'
      ? 'untrusted_dev'
      : stage === 'release'
        ? 'verified_release'
        : stage === 'prerelease'
          ? 'verified_prerelease'
          : 'trusted_candidate';
    const admissionEligible = authentication !== 'hmac' && Boolean(
      releaseFingerprint
      && dataSnapshot
      && provider
      && model
      && (!['prerelease', 'release'].includes(stage) || (candidateId && evalRunId && evaluationReleaseId)),
    );
    return {
      receipt: {
        ...input,
        receiptId,
        ...identity,
        identityChecksum,
        resultChecksum,
        verification: {
          status: 'verified',
          trustLevel,
          admissionEligible,
          authentication,
          issuer,
          verifiedAt: now.toISOString(),
        },
      },
      issuer,
      trustLevel,
      admissionEligible,
      identityChecksum,
      resultChecksum,
    };
  }

  async verifyReleaseEvidence(input: VerifiedBrainGateReceipt): Promise<void> {
    if (input.receipt.stage !== 'prerelease' && input.receipt.stage !== 'release') return;
    if (!this.releaseService) throw new BadRequestException('release_receipt_evidence_verifier_unavailable');
    const evaluationReleaseId = positiveInteger(
      input.receipt.evaluationReleaseId,
      'receipt_evaluation_release_id_invalid',
    );
    const evalRunId = positiveInteger(input.receipt.evalRunId, 'receipt_eval_run_id_invalid');
    const readiness = await this.releaseService.getReleaseReadiness(evaluationReleaseId);
    if (readiness.status !== 'ready' || readiness.canRelease !== true) {
      throw new BadRequestException(`release_receipt_evidence_not_ready:${readiness.blockers.join(',') || readiness.status}`);
    }
    if (readiness.contractVersion !== 'ami-brain-release-acceptance/v2') {
      throw new BadRequestException('release_receipt_acceptance_contract_invalid');
    }
    if (readiness.evaluationReleaseId !== evaluationReleaseId || readiness.evalRunId !== evalRunId) {
      throw new BadRequestException('release_receipt_evaluation_identity_mismatch');
    }
    if (readiness.releaseFingerprint !== input.receipt.releaseFingerprint) {
      throw new BadRequestException('release_receipt_fingerprint_mismatch');
    }
    if (!readiness.suiteChecksum || readiness.suiteChecksum !== input.receipt.suiteChecksum) {
      throw new BadRequestException('release_receipt_suite_checksum_mismatch');
    }
    if (!readiness.provider || readiness.provider !== input.receipt.provider) {
      throw new BadRequestException('release_receipt_provider_mismatch');
    }
    if (!readiness.model || readiness.model !== input.receipt.model) {
      throw new BadRequestException('release_receipt_model_mismatch');
    }
    if (!readiness.sourceCommit || readiness.sourceCommit !== input.receipt.headCommit) {
      throw new BadRequestException('release_receipt_source_commit_mismatch');
    }
  }
}

export function verifyGithubOidcClaims(payload: JwtPayload, body: Record<string, unknown>): string {
  const allowedRepositories = envList('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REPOSITORIES');
  if (!allowedRepositories.length) throw new UnauthorizedException('receipt_ingest_repository_allowlist_missing');
  const allowedWorkflows = envList('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_ISSUERS');
  if (!allowedWorkflows.length) throw new UnauthorizedException('receipt_ingest_issuer_allowlist_missing');
  const allowedRefs = envList('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_REFS');
  if (!allowedRefs.length) throw new UnauthorizedException('receipt_oidc_ref_allowlist_missing');
  const allowedEvents = envList('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_EVENTS');
  if (!allowedEvents.length) throw new UnauthorizedException('receipt_oidc_event_allowlist_missing');
  const allowedJobWorkflowRefs = envList('BRAIN_GOVERNANCE_RECEIPT_ALLOWED_JOB_WORKFLOW_REFS');
  if (!allowedJobWorkflowRefs.length) throw new UnauthorizedException('receipt_oidc_job_workflow_allowlist_missing');

  const repository = claimString(payload, 'repository', 'receipt_oidc_repository_missing');
  if (!allowedRepositories.includes(repository)) throw new UnauthorizedException('receipt_repository_not_allowed');
  if (repository !== requiredString(inputBody(body, 'repository'), 'receipt_repository_missing')) {
    throw new UnauthorizedException('receipt_oidc_repository_mismatch');
  }

  const workflow = claimString(payload, 'workflow', 'receipt_oidc_workflow_missing');
  if (!allowedWorkflows.includes(workflow)) throw new UnauthorizedException('receipt_issuer_not_allowed');
  if (workflow !== requiredString(inputBody(body, 'workflow'), 'receipt_workflow_missing')) {
    throw new UnauthorizedException('receipt_workflow_issuer_mismatch');
  }

  const ref = claimString(payload, 'ref', 'receipt_oidc_ref_missing');
  if (!allowedRefs.includes(ref)) throw new UnauthorizedException('receipt_oidc_ref_not_allowed');
  if (claimString(payload, 'ref_protected', 'receipt_oidc_ref_protection_missing') !== 'true') {
    throw new UnauthorizedException('receipt_oidc_ref_not_protected');
  }
  const bodyBranch = optionalString(inputBody(body, 'branch'));
  const refBranch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
  if (bodyBranch && bodyBranch !== refBranch) throw new UnauthorizedException('receipt_oidc_branch_mismatch');

  const eventName = claimString(payload, 'event_name', 'receipt_oidc_event_missing');
  if (!allowedEvents.includes(eventName)) throw new UnauthorizedException('receipt_oidc_event_not_allowed');
  if (eventName !== requiredString(inputBody(body, 'eventName'), 'receipt_event_name_missing')) {
    throw new UnauthorizedException('receipt_oidc_event_mismatch');
  }
  const sha = claimString(payload, 'sha', 'receipt_oidc_sha_missing').toLowerCase();
  if (sha !== gitCommit(inputBody(body, 'headCommit'), 'receipt_head_commit_invalid')) {
    throw new UnauthorizedException('receipt_oidc_head_commit_mismatch');
  }
  const jobWorkflowRef = claimString(payload, 'job_workflow_ref', 'receipt_oidc_job_workflow_ref_missing');
  if (!allowedJobWorkflowRefs.includes(jobWorkflowRef)) {
    throw new UnauthorizedException('receipt_oidc_job_workflow_ref_not_allowed');
  }
  return workflow;
}

function sha256(value: unknown) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(text).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function safeEqual(left: string, right: string) {
  if (!HEX_64.test(left) || !HEX_64.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function sameStringSet(left: string[], right: string[]) {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function bearerToken(value: unknown) {
  const text = String(value ?? '').trim();
  const match = text.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function envList(key: string) {
  return String(process.env[key] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function claimString(payload: JwtPayload, key: string, code: string) {
  const text = String(payload[key] ?? '').trim();
  if (!text) throw new UnauthorizedException(code);
  return text;
}

function inputBody(body: Record<string, unknown>, key: string) {
  return body[key];
}

function requiredString(value: unknown, code: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new BadRequestException(code);
  return text;
}

function optionalString(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function hash64(value: unknown, code: string) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!HEX_64.test(text)) throw new BadRequestException(code);
  return text;
}

function optionalHash64(value: unknown, code: string) {
  if (value === null || value === undefined || value === '') return null;
  return hash64(value, code);
}

function gitCommit(value: unknown, code: string) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(text)) throw new BadRequestException(code);
  return text;
}

function positiveInteger(value: unknown, code: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new BadRequestException(code);
  return parsed;
}

function optionalPositiveInteger(value: unknown, code: string) {
  if (value === null || value === undefined || value === '') return null;
  return positiveInteger(value, code);
}

function enumString<const T extends readonly string[]>(value: unknown, allowed: T, code: string): T[number] {
  const text = String(value ?? '').trim();
  if (!allowed.includes(text as T[number])) throw new BadRequestException(code);
  return text as T[number];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
