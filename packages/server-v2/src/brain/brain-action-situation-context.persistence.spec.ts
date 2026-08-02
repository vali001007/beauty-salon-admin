import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Brain action situation context persistence', () => {
  const packageRoot = process.cwd();
  const schema = readFileSync(resolve(packageRoot, 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(packageRoot, 'prisma/migrations/20260730170000_brain_action_situation_context/migration.sql'),
    'utf8',
  );

  it('persists both the governed profile and the frozen execution situation fingerprints', () => {
    const confirmation = schema.match(/model BrainActionConfirmation \{[\s\S]*?\n\}/u)?.[0] ?? '';
    const execution = schema.match(/model BrainActionExecution \{[\s\S]*?\n\}/u)?.[0] ?? '';

    for (const model of [confirmation, execution]) {
      expect(model).toContain('situationContextProfileFingerprint');
      expect(model).toContain('situationContextFingerprint');
    }
  });

  it('adds the situation fingerprint columns without rewriting existing action rows', () => {
    expect(migration).toContain('ALTER TABLE "brain_action_confirmation"');
    expect(migration).toContain('ALTER TABLE "brain_action_execution"');
    expect(migration).toContain('ADD COLUMN "situationContextProfileFingerprint" TEXT');
    expect(migration).toContain('ADD COLUMN "situationContextFingerprint" TEXT');
    expect(migration).not.toMatch(/DELETE|TRUNCATE|DROP TABLE/iu);
  });
});
