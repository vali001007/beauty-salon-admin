import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Brain action institutional-effect persistence', () => {
  const packageRoot = process.cwd();
  const schema = readFileSync(resolve(packageRoot, 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(packageRoot, 'prisma/migrations/20260730200000_brain_action_institutional_effect/migration.sql'),
    'utf8',
  );

  it('persists the frozen institutional-effect profile fingerprint on confirmation and execution', () => {
    const confirmation = schema.match(/model BrainActionConfirmation \{[\s\S]*?\n\}/u)?.[0] ?? '';
    const execution = schema.match(/model BrainActionExecution \{[\s\S]*?\n\}/u)?.[0] ?? '';

    for (const model of [confirmation, execution]) {
      expect(model).toContain('institutionalEffectProfileFingerprint String?');
    }
  });

  it('adds only nullable provenance columns and does not rewrite existing action rows', () => {
    expect(migration).toContain('ALTER TABLE "brain_action_confirmation"');
    expect(migration).toContain('ALTER TABLE "brain_action_execution"');
    expect(migration.match(/ADD COLUMN "institutionalEffectProfileFingerprint" TEXT/g)).toHaveLength(2);
    expect(migration).not.toMatch(/DELETE|TRUNCATE|DROP TABLE|UPDATE\s+"brain_action_/iu);
  });
});
