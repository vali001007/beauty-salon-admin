import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('Agent V2 controlled Text-to-SQL isolation', () => {
  it('does not depend on legacy query modules in the new runtime namespace', () => {
    const root = join(process.cwd(), 'src', 'agent-v2', 'text-to-sql');
    expect(existsSync(root)).toBe(true);

    const forbidden = ['semantic-sql', 'semantic-query', 'business-query', 'business-task'];
    const files = listFiles(root).filter((file) => file.endsWith('.ts'));
    const hits = files.flatMap((file) => {
      const content = readFileSync(file, 'utf8').toLowerCase();
      return forbidden.filter((term) => content.includes(term)).map((term) => `${file}:${term}`);
    });

    expect(hits).toEqual([]);
  });
});

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const current = join(root, name);
    return statSync(current).isDirectory() ? listFiles(current) : [current];
  });
}
