import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveMetricCandidateScanOutputPath } from '../src/semantic-data/brain-metric-source-adapters.js';
import { BrainSemanticCandidateWorkspaceScanner } from '../src/semantic-data/brain-semantic-candidate-workspace-scanner.js';
import { BusinessDefinitionProjectionCompilerService } from '../src/semantic-data/business-definition-projection-compiler.service.js';
import { BusinessDefinitionRegistryService } from '../src/semantic-data/business-definition-registry.service.js';
import {
  loadWorkspaceEnvironment,
  resolveWorkspacePath,
} from '../src/brain/capability/brain-capability-cli.helpers.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface CliOptions {
  workspaceRoot: string;
  output: string;
}

async function main() {
  const options = await parseOptions(process.argv.slice(2));
  loadWorkspaceEnvironment(options.workspaceRoot);
  const prisma = new PrismaService();
  try {
    const registry = new BusinessDefinitionRegistryService(prisma, new BusinessDefinitionProjectionCompilerService());
    const result = await new BrainSemanticCandidateWorkspaceScanner(registry).scan(options.workspaceRoot);
    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      policy: 'read_only_candidate_generation_no_registry_write_no_publish',
      scanFingerprint: result.scanFingerprint,
      summary: result.summary,
      candidates: result.candidates,
    };
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ output: options.output, ...result.summary })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

async function parseOptions(args: string[]): Promise<CliOptions> {
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const workspaceRoot = resolve(value('workspace-root') ?? (await detectWorkspaceRoot()));
  const requestedOutput = resolveWorkspacePath(workspaceRoot, value('output'));
  return {
    workspaceRoot,
    output: resolveMetricCandidateScanOutputPath(workspaceRoot, requestedOutput),
  };
}

async function detectWorkspaceRoot(): Promise<string> {
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'packages/server-v2/prisma/schema.prisma'));
      return candidate;
    } catch {
      // Keep searching from npm --prefix working directories.
    }
  }
  throw new Error('Cannot locate workspace root; pass --workspace-root=<path>.');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
