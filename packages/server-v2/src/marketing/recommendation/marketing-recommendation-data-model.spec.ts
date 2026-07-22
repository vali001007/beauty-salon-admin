import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function model(name: string) {
  return Prisma.dmmf.datamodel.models.find((item) => item.name === name);
}

function fieldNames(modelName: string) {
  return new Set(model(modelName)?.fields.map((field) => field.name) ?? []);
}

describe('marketing recommendation v2 data model', () => {
  it('exposes persistent recommendation instance, audience and offer models', () => {
    expect(model('MarketingRecommendationInstance')).toBeDefined();
    expect(model('MarketingRecommendationAudienceSnapshot')).toBeDefined();
    expect(model('MarketingRecommendationAudienceMember')).toBeDefined();
    expect(model('MarketingRecommendationOfferSnapshot')).toBeDefined();
  });

  it('adds store business-day idempotency fields to prediction runs', () => {
    expect([...fieldNames('PredictionRun')]).toEqual(
      expect.arrayContaining(['businessDate', 'runKey', 'scopeStatus']),
    );
  });

  it('links adoptions and downstream marketing objects to recommendation instances', () => {
    expect([...fieldNames('MarketingRecommendationAdoption')]).toEqual(
      expect.arrayContaining(['recommendationInstanceId', 'adoptionKey', 'errorCode', 'errorMessage']),
    );
    expect(fieldNames('MarketingActivity').has('recommendationInstanceId')).toBe(true);
    expect([...fieldNames('MarketingAutomationStrategy')]).toEqual(
      expect.arrayContaining(['recommendationInstanceId', 'adoptionId', 'predictionRunId', 'audienceSnapshotId']),
    );
    expect(fieldNames('MarketingPage').has('recommendationInstanceId')).toBe(true);
    expect(fieldNames('TerminalFollowUpTask').has('recommendationInstanceId')).toBe(true);
  });

  it('keeps the store-scoped marketing activity index declared in Prisma schema', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const activityModel = schema.match(/model MarketingActivity \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(activityModel).toContain('storeId                Int');
    expect(activityModel).toContain('@@index([storeId, status])');
  });

  it('indexes persisted audience pagination by snapshot rank and id', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const audienceMemberModel = schema.match(/model MarketingRecommendationAudienceMember \{[\s\S]*?\n\}/)?.[0] ?? '';
    const migration = readFileSync(
      join(process.cwd(), 'prisma', 'migrations', '20260713180000_marketing_recommendation_instance_foundation', 'migration.sql'),
      'utf8',
    );

    expect(audienceMemberModel).toContain('@@index([snapshotId, rank, id])');
    expect(migration).toContain('MarketingRecommendationAudienceMember_snapshotId_rank_id_idx');
    expect(migration).toContain('("snapshotId", "rank", "id")');
  });

  it('indexes latest adoption lookups by instance mode and creation order', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const adoptionModel = schema.match(/model MarketingRecommendationAdoption \{[\s\S]*?\n\}/)?.[0] ?? '';
    const migration = readFileSync(
      join(process.cwd(), 'prisma', 'migrations', '20260713180000_marketing_recommendation_instance_foundation', 'migration.sql'),
      'utf8',
    );

    expect(adoptionModel).toContain('@@index([recommendationInstanceId, mode, createdAt(sort: Desc), id(sort: Desc)])');
    expect(migration).toContain('MarketingRecommendationAdoption_instance_mode_created_id_idx');
    expect(migration).toContain('("recommendationInstanceId", "mode", "createdAt" DESC, "id" DESC)');
  });
});
