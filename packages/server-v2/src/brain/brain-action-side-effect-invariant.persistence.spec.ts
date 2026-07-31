import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Brain action side-effect invariant persistence', () => {
  const packageRoot = process.cwd();
  const schema = readFileSync(resolve(packageRoot, 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(packageRoot, 'prisma/migrations/20260730190000_brain_action_side_effect_invariant/migration.sql'),
    'utf8',
  );

  it('persists the frozen side-effect invariant profile fingerprint on confirmation and execution', () => {
    const confirmation = schema.match(/model BrainActionConfirmation \{[\s\S]*?\n\}/u)?.[0] ?? '';
    const execution = schema.match(/model BrainActionExecution \{[\s\S]*?\n\}/u)?.[0] ?? '';

    for (const model of [confirmation, execution]) {
      expect(model).toContain('sideEffectInvariantProfileFingerprint String?');
    }
  });

  it('adds only nullable provenance columns and does not rewrite action rows', () => {
    expect(migration).toContain('ALTER TABLE "brain_action_confirmation"');
    expect(migration).toContain('ALTER TABLE "brain_action_execution"');
    expect(migration.match(/ADD COLUMN "sideEffectInvariantProfileFingerprint" TEXT/g)).toHaveLength(2);
    expect(migration).not.toMatch(/DELETE|TRUNCATE|DROP TABLE|UPDATE\s+"brain_action_/iu);
  });
});
