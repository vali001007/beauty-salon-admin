import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BusinessDefinitionFixtureArtifactSourceService,
  createBusinessDefinitionFixtureArtifactFingerprint,
} from './business-definition-fixture-source.service.js';

describe('BusinessDefinitionFixtureArtifactSourceService', () => {
  const payload = {
    fixtureSetKey: 'semantic.product_sales_quantity.v1',
    cases: [
      {
        caseKey: 'store-6-july',
        input: {
          storeId: 6,
          role: 'manager',
          timeRange: { preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31', label: '2026年7月' },
        },
        expected: {
          status: 'success',
          rows: [{ productId: 101, productName: '抗衰紧致眼霜', quantity: 14 }],
          kpis: [{ label: '最高销量', value: '14' }],
        },
      },
    ],
  };

  it('loads the latest active versioned fixture artifact and verifies its fingerprint', async () => {
    const prisma = {
      businessDefinitionFixtureArtifact: {
        findFirst: jest.fn().mockResolvedValue({
          fixtureSetKey: payload.fixtureSetKey,
          version: 2,
          status: 'active',
          payload,
          fingerprint: createBusinessDefinitionFixtureArtifactFingerprint(payload),
        }),
      },
    };
    const source = new BusinessDefinitionFixtureArtifactSourceService(prisma as any);

    await expect(source.load(payload.fixtureSetKey)).resolves.toEqual(payload);
    expect(prisma.businessDefinitionFixtureArtifact.findFirst).toHaveBeenCalledWith({
      where: { fixtureSetKey: payload.fixtureSetKey, status: 'active' },
      orderBy: { version: 'desc' },
    });
  });

  it('fails closed when the persisted artifact fingerprint is invalid', async () => {
    const source = new BusinessDefinitionFixtureArtifactSourceService({
      businessDefinitionFixtureArtifact: {
        findFirst: jest.fn().mockResolvedValue({
          fixtureSetKey: payload.fixtureSetKey,
          status: 'active',
          payload,
          fingerprint: '0'.repeat(64),
        }),
      },
    } as any);

    await expect(source.load(payload.fixtureSetKey)).rejects.toThrow(
      'business_definition_fixture_fingerprint_mismatch',
    );
  });

  it('returns null when no governed fixture artifact exists', async () => {
    const source = new BusinessDefinitionFixtureArtifactSourceService({
      businessDefinitionFixtureArtifact: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any);

    await expect(source.load('missing.fixture')).resolves.toBeNull();
  });

  it('fails closed if a non-active artifact is returned despite the active query filter', async () => {
    const source = new BusinessDefinitionFixtureArtifactSourceService({
      businessDefinitionFixtureArtifact: {
        findFirst: jest.fn().mockResolvedValue({
          fixtureSetKey: payload.fixtureSetKey,
          version: 2,
          status: 'archived',
          payload,
          fingerprint: createBusinessDefinitionFixtureArtifactFingerprint(payload),
        }),
      },
    } as any);

    await expect(source.load(payload.fixtureSetKey)).rejects.toThrow(
      'business_definition_fixture_artifact_not_active',
    );
  });

  it('declares positive versions and an active/archived database status whitelist', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260712220000_ami_core_business_definition_registry/migration.sql',
      ),
      'utf8',
    );

    expect(schema).toContain('enum BusinessDefinitionFixtureArtifactStatus');
    expect(schema).toContain('status        BusinessDefinitionFixtureArtifactStatus @default(active)');
    expect(migration).toContain(
      'CREATE TYPE "BusinessDefinitionFixtureArtifactStatus" AS ENUM (\'active\', \'archived\')',
    );
    expect(migration).toContain('business_definition_fixture_artifact_version_check');
    expect(migration).toContain('CHECK ("version" > 0)');
    expect(migration).toContain('business_definition_fixture_artifact_status_check');
    expect(migration).toContain('CHECK ("status"::TEXT IN (\'active\', \'archived\'))');
  });
});
