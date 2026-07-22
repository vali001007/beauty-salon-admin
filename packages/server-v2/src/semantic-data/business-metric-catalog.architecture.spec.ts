import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const SOURCE_ROOT = join(process.cwd(), 'src');
const LEGACY_IMPORT = 'legacy-semantic-metric.fixture';
const ALLOWED_LEGACY_IMPORTERS = new Set([
  'semantic-data/brain-metric-source-adapters.ts',
  'semantic-data/brain-semantic-candidate-workspace-scanner.ts',
  'semantic-data/business-metric-catalog.testing.ts',
]);

describe('Business metric catalog architecture', () => {
  it('keeps the legacy metric fixture outside production runtime modules and consumers', () => {
    const importers = sourceFiles(SOURCE_ROOT)
      .filter((file) => !file.endsWith('.spec.ts') && !file.endsWith('.test.ts'))
      .filter((file) => {
        const source = readFileSync(join(SOURCE_ROOT, file), 'utf8');
        return source
          .split(/\r?\n/)
          .some((line) => /^\s*import\b/.test(line) && line.includes(LEGACY_IMPORT));
      });

    expect(importers.sort()).toEqual([...ALLOWED_LEGACY_IMPORTERS].sort());
    expect(importers.some((file) => file.endsWith('.module.ts'))).toBe(false);
  });

  it('does not register or consume the removed SemanticMetricRegistryService at runtime', () => {
    const runtimeFiles = sourceFiles(SOURCE_ROOT).filter(
      (file) => !file.endsWith('.spec.ts') && !file.endsWith('.test.ts'),
    );
    const offenders = runtimeFiles.filter((file) =>
      readFileSync(join(SOURCE_ROOT, file), 'utf8').includes('SemanticMetricRegistryService'),
    );

    expect(offenders).toEqual([]);
    const agentModule = readFileSync(join(SOURCE_ROOT, 'agent/agent.module.ts'), 'utf8');
    expect(agentModule).toContain('SemanticDataModule');
    expect(agentModule).not.toContain('BusinessMetricCatalogService');
  });

  it('uses the governed published catalog for eval unless legacy fixture mode is explicit', () => {
    const source = readFileSync(join(process.cwd(), 'prisma/agent-eval-remaining-supported.ts'), 'utf8');

    expect(source).toContain("flags.has('legacy-fixture')");
    expect(source).toContain('BusinessMetricCatalogService');
    expect(source).toContain('PublishedBusinessDefinitionSnapshotProviderService');
    expect(source).toContain('legacy_fixture_non_production');
    expect(source).toContain("productionReadiness: runtime.mode === 'governed_published_snapshot'");
  });
});

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  walk(root, files);
  return files.map((file) => relative(root, file).replace(/\\/g, '/'));
}

function walk(directory: string, files: string[]) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
      continue;
    }
    if (entry.isFile() && extname(entry.name) === '.ts') files.push(absolute);
  }
}
