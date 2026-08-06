import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type BrainReleaseFamily = 'policy' | 'runtime' | 'evaluation';

export interface BrainProductIdentity {
  family: BrainReleaseFamily | 'legacy';
  code: string;
  stageCode: string | null;
  name: string;
  internalReleaseId: number | null;
}

type IdentityRelease = {
  id: number;
  scope: string;
  releaseKey: string;
  releaseFamily?: string | null;
  displayCode?: string | null;
  displayName?: string | null;
  rollout?: unknown;
  rolloutStage?: string | null;
  rolloutSequence?: {
    runtimeVersionCode?: string | null;
    displayName?: string | null;
  } | null;
};

const FAMILY_PREFIX: Record<BrainReleaseFamily, string> = {
  policy: 'GP',
  runtime: 'RT',
  evaluation: 'EV',
};

const FAMILY_CODE_PATTERN: Record<BrainReleaseFamily, RegExp> = {
  policy: /^GP-\d{3,}$/u,
  runtime: /^RT-\d{3,}$/u,
  evaluation: /^EV-\d{3,}$/u,
};

@Injectable()
export class BrainReleaseIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async assignPolicyIdentity(releaseId: number, displayName: string, expectedCode?: string) {
    return this.serializable((tx) => this.assignPolicyIdentityWithClient(tx, releaseId, displayName, expectedCode));
  }

  async assignPolicyIdentityWithClient(
    tx: Prisma.TransactionClient,
    releaseId: number,
    displayName: string,
    expectedCode?: string,
  ) {
    const release = await tx.brainRelease.findUnique({ where: { id: releaseId } });
    if (!release || release.scope !== 'governance_policy') throw new Error('policy_snapshot_not_found');
    if (release.displayCode) {
      assertStoredIdentity(release.releaseFamily, release.displayCode, 'policy');
      if (expectedCode && release.displayCode !== expectedCode) {
        throw new Error(`policy_identity_expected_code_mismatch:${expectedCode}:${release.displayCode}`);
      }
      familyDisplayName('policy', release.displayName, 'policy_display_name_required');
      return release;
    }
    const identity = expectedCode
      ? await this.allocateExpected(tx, 'policy', expectedCode)
      : await this.allocate(tx, 'policy');
    return tx.brainRelease.update({
      where: { id: release.id },
      data: {
        releaseFamily: 'policy',
        displayCode: identity.code,
        displayName: familyDisplayName('policy', displayName, 'policy_display_name_required'),
      },
    });
  }

  async assignRuntimeIdentity(
    sequenceId: number,
    displayName: string,
    productProfile?: string | null,
    expectedCode?: string,
  ) {
    return this.serializable((tx) => this.assignRuntimeIdentityWithClient(
      tx,
      sequenceId,
      displayName,
      productProfile,
      expectedCode,
    ));
  }

  async assignRuntimeIdentityWithClient(
    tx: Prisma.TransactionClient,
    sequenceId: number,
    displayName: string,
    productProfile?: string | null,
    expectedCode?: string,
  ) {
    const sequence = await tx.brainRolloutSequence.findUnique({ where: { id: sequenceId } });
    if (!sequence) throw new Error('rollout_sequence_not_found');
    if (sequence.runtimeVersionCode) {
      assertCode('runtime', sequence.runtimeVersionCode);
      if (expectedCode && sequence.runtimeVersionCode !== expectedCode) {
        throw new Error(`runtime_identity_expected_code_mismatch:${expectedCode}:${sequence.runtimeVersionCode}`);
      }
      familyDisplayName('runtime', sequence.displayName, 'runtime_display_name_required');
      if (
        sequence.runtimeVersionNumber !== null
        && sequence.runtimeVersionNumber !== undefined
        && sequence.runtimeVersionCode !== codeFor('runtime', sequence.runtimeVersionNumber)
      ) {
        throw new Error('runtime_identity_number_mismatch');
      }
      return sequence;
    }
    const identity = expectedCode
      ? await this.allocateExpected(tx, 'runtime', expectedCode)
      : await this.allocate(tx, 'runtime');
    return tx.brainRolloutSequence.update({
      where: { id: sequence.id },
      data: {
        runtimeVersionNumber: identity.number,
        runtimeVersionCode: identity.code,
        displayName: familyDisplayName('runtime', displayName, 'runtime_display_name_required'),
        productProfile: optionalText(productProfile),
      },
    });
  }

  async assignEvaluationIdentity(releaseId: number, displayName: string) {
    return this.serializable(async (tx) => {
      const release = await tx.brainRelease.findUnique({ where: { id: releaseId } });
      if (!release) throw new Error('evaluation_release_not_found');
      if (release.scope === 'governance_policy' || record(release.rollout).evaluationOnly !== true) {
        throw new Error('evaluation_release_identity_scope_mismatch');
      }
      if (release.displayCode) {
        assertStoredIdentity(release.releaseFamily, release.displayCode, 'evaluation');
        familyDisplayName('evaluation', release.displayName, 'evaluation_display_name_required');
        return release;
      }
      const identity = await this.allocate(tx, 'evaluation');
      return tx.brainRelease.update({
        where: { id: release.id },
        data: {
          releaseFamily: 'evaluation',
          displayCode: identity.code,
          displayName: familyDisplayName('evaluation', displayName, 'evaluation_display_name_required'),
        },
      });
    });
  }

  productIdentity(release: IdentityRelease | null | undefined): BrainProductIdentity | null {
    if (!release) return null;
    const rollout = record(release.rollout);
    const evaluationOnly = rollout.evaluationOnly === true;
    if (release.scope === 'governance_policy') {
      const typedPolicy = release.releaseFamily === 'policy' && isCode('policy', release.displayCode);
      return {
        family: typedPolicy ? 'policy' : 'legacy',
        code: typedPolicy ? release.displayCode! : `LEGACY-GP-${release.id}`,
        stageCode: null,
        name: release.displayName ?? release.releaseKey,
        internalReleaseId: release.id,
      };
    }
    if (evaluationOnly || release.releaseFamily === 'evaluation') {
      const typedEvaluation = release.releaseFamily === 'evaluation' && isCode('evaluation', release.displayCode);
      return {
        family: typedEvaluation ? 'evaluation' : 'legacy',
        code: typedEvaluation ? release.displayCode! : `LEGACY-EV-${release.id}`,
        stageCode: null,
        name: release.displayName ?? release.releaseKey,
        internalReleaseId: release.id,
      };
    }
    const runtimeCode = release.rolloutSequence?.runtimeVersionCode;
    if (isCode('runtime', runtimeCode)) {
      return {
        family: 'runtime',
        code: runtimeCode!,
        stageCode: release.rolloutStage ? `${runtimeCode}-${stageSuffix(release.rolloutStage)}` : runtimeCode,
        name: release.rolloutSequence?.displayName ?? release.displayName ?? release.releaseKey,
        internalReleaseId: release.id,
      };
    }
    return {
      family: 'legacy',
      code: `LEGACY-RT-${release.id}`,
      stageCode: null,
      name: release.displayName ?? release.releaseKey,
      internalReleaseId: release.id,
    };
  }

  releaseKey(input: { family: BrainReleaseFamily; code: string; name: string; stage?: string; date?: string }) {
    assertCode(input.family, input.code);
    if (input.stage && input.family !== 'runtime') throw new Error('release_stage_runtime_only');
    const family = input.family === 'policy' ? 'policy' : input.family === 'runtime' ? 'runtime' : 'eval';
    const stage = input.stage ? `-${slug(input.stage)}` : '';
    const date = input.date ? `-${input.date.replaceAll('-', '')}` : '';
    return `ami-brain-${family}-${input.code.toLowerCase()}-${slug(input.name)}${stage}${date}`;
  }

  private async allocate(tx: Prisma.TransactionClient, family: BrainReleaseFamily) {
    const counter = await tx.brainVersionCounter.upsert({
      where: { family },
      create: { family, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    return {
      number: counter.lastNumber,
      code: codeFor(family, counter.lastNumber),
    };
  }

  private async allocateExpected(tx: Prisma.TransactionClient, family: BrainReleaseFamily, expectedCode: string) {
    assertCode(family, expectedCode);
    const expectedNumber = Number(expectedCode.slice(FAMILY_PREFIX[family].length + 1));
    const current = await tx.brainVersionCounter.findUnique({ where: { family }, select: { lastNumber: true } });
    if (!Number.isInteger(expectedNumber) || expectedNumber <= 0 || (current?.lastNumber ?? 0) !== expectedNumber - 1) {
      throw new Error(`${family}_identity_expected_code_unavailable:${expectedCode}`);
    }
    const counter = await tx.brainVersionCounter.upsert({
      where: { family },
      create: { family, lastNumber: expectedNumber },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    if (counter.lastNumber !== expectedNumber) throw new Error(`${family}_identity_expected_code_raced:${expectedCode}`);
    return { number: expectedNumber, code: expectedCode };
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        if (isPrismaCode(error, 'P2034') && attempt < 3) continue;
        throw error;
      }
    }
    throw new Error('brain_release_identity_allocation_conflict');
  }
}

function codeFor(family: BrainReleaseFamily, number: number) {
  return `${FAMILY_PREFIX[family]}-${String(number).padStart(3, '0')}`;
}

function isCode(family: BrainReleaseFamily, code: string | null | undefined): code is string {
  return typeof code === 'string' && FAMILY_CODE_PATTERN[family].test(code);
}

function assertCode(family: BrainReleaseFamily, code: string) {
  if (!isCode(family, code)) throw new Error(`${family}_identity_code_mismatch`);
}

function assertStoredIdentity(storedFamily: string | null | undefined, code: string, expectedFamily: BrainReleaseFamily) {
  if (storedFamily !== expectedFamily) throw new Error(`${expectedFamily}_identity_family_mismatch`);
  assertCode(expectedFamily, code);
}

function stageSuffix(stage: string) {
  const normalized: Record<string, string> = {
    shadow: 'SHADOW',
    canary_5: 'C05',
    canary_20: 'C20',
    canary_50: 'C50',
    full: 'FULL',
  };
  return normalized[stage] ?? stage.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, '-');
}

function slug(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/^-|-$/gu, '') || 'unnamed';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonEmpty(value: string, code: string) {
  if (!value.trim()) throw new Error(code);
  return value.trim();
}

function familyDisplayName(family: BrainReleaseFamily, value: string | null | undefined, requiredCode: string) {
  const name = nonEmpty(value ?? '', requiredCode);
  const forbidden: Record<BrainReleaseFamily, RegExp> = {
    policy: /(?:\bRT-\d{3,}\b|\bEV-\d{3,}\b|运行版本|评测版本)/iu,
    runtime: /(?:\bGP-\d{3,}\b|\bEV-\d{3,}\b|治理策略|评测版本)/iu,
    evaluation: /(?:\bGP-\d{3,}\b|\bRT-\d{3,}\b|治理策略|运行版本)/iu,
  };
  if (forbidden[family].test(name)) throw new Error(`${family}_display_name_family_mismatch`);
  return name;
}

function optionalText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isPrismaCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}
