import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('brain pending migration preflight script safety', () => {
  const script = readFileSync(resolve(process.cwd(), 'prisma/ami-brain-pending-migration-preflight.ts'), 'utf8');
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

  it('registers a reusable brain migration preflight command', () => {
    expect(packageJson.scripts['brain:migration:preflight']).toContain('ami-brain-pending-migration-preflight.ts');
  });

  it('does not contain unsafe raw queries or database write commands', () => {
    expect(script).not.toContain('$queryRawUnsafe');
    expect(script).not.toContain('$executeRaw');
    expect(script).not.toContain('migrate deploy');
    expect(script).not.toContain('migrate resolve');
    expect(script).toContain('databaseWritePerformed');
  });
});
