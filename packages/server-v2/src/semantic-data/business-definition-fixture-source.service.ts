import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  BusinessDefinitionFixtureSet,
  BusinessDefinitionFixtureSource,
} from './business-definition-canonical-verifier.service.js';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';

@Injectable()
export class BusinessDefinitionFixtureArtifactSourceService implements BusinessDefinitionFixtureSource {
  constructor(private readonly prisma: PrismaService) {}

  async load(fixtureSetKey: string): Promise<BusinessDefinitionFixtureSet | null> {
    const artifact = await this.prisma.businessDefinitionFixtureArtifact.findFirst({
      where: { fixtureSetKey, status: 'active' },
      orderBy: { version: 'desc' },
    });
    if (!artifact) return null;
    if (artifact.status !== 'active') {
      throw new ConflictException('business_definition_fixture_artifact_not_active');
    }
    const payload = validateFixturePayload(artifact.payload, fixtureSetKey);
    const fingerprint = createBusinessDefinitionFixtureArtifactFingerprint(payload);
    if (fingerprint !== artifact.fingerprint) {
      throw new ConflictException('business_definition_fixture_fingerprint_mismatch');
    }
    return deepFreeze(structuredClone(payload));
  }
}

export function createBusinessDefinitionFixtureArtifactFingerprint(payload: unknown): string {
  return createHash('sha256').update(canonicalizeBusinessDefinition(payload)).digest('hex');
}

function validateFixturePayload(value: unknown, fixtureSetKey: string): BusinessDefinitionFixtureSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConflictException('business_definition_fixture_payload_invalid');
  }
  const payload = value as Record<string, unknown>;
  if (payload.fixtureSetKey !== fixtureSetKey || !Array.isArray(payload.cases) || payload.cases.length === 0) {
    throw new ConflictException('business_definition_fixture_payload_invalid');
  }
  for (const item of payload.cases) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ConflictException('business_definition_fixture_case_invalid');
    }
    const fixtureCase = item as Record<string, unknown>;
    if (typeof fixtureCase.caseKey !== 'string' || !fixtureCase.caseKey.trim() || !('expected' in fixtureCase)) {
      throw new ConflictException('business_definition_fixture_case_invalid');
    }
  }
  return payload as unknown as BusinessDefinitionFixtureSet;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
