import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Brain readiness script', () => {
  it('loads server-v2 .env before creating the Prisma adapter', () => {
    const script = readFileSync(resolve(process.cwd(), 'prisma/brain-mvp-readiness.ts'), 'utf8');

    expect(script).toContain("import { config } from 'dotenv'");
    expect(script).toContain("config({ path: resolve(import.meta.dirname, '..', '.env') })");
  });
});
