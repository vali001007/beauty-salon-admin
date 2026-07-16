import { access, readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BrainSemanticCandidateSyncService } from '../src/semantic-data/brain-semantic-candidate-sync.service.js';
import {
  BrainSemanticCandidateWorkspaceScanner,
  semanticCandidateKey,
  selectCurrentSemanticCandidates,
} from '../src/semantic-data/brain-semantic-candidate-workspace-scanner.js';
import { BusinessDefinitionProjectionCompilerService } from '../src/semantic-data/business-definition-projection-compiler.service.js';
import { BusinessDefinitionRegistryService } from '../src/semantic-data/business-definition-registry.service.js';

interface CandidateFile {
  candidates?: unknown[];
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const workspaceRoot = resolve(value('workspace-root') ?? (await detectWorkspaceRoot()));
  loadWorkspaceEnvironment(workspaceRoot);
  const inputValue = value('input');
  if (!inputValue) throw new Error('semantic_candidate_sync_input_required');
  const inputPath = isAbsolute(inputValue) ? resolve(inputValue) : resolve(workspaceRoot, inputValue);
  const parsed = JSON.parse(await readFile(inputPath, 'utf8')) as CandidateFile;
  if (!Array.isArray(parsed.candidates)) throw new Error('semantic_candidate_sync_candidates_invalid');
  const createdBy = Number(value('created-by') ?? process.env.BRAIN_GOVERNANCE_SYSTEM_USER_ID);
  const source = value('source') ?? 'semantic_candidate_scan';
  const definitionKeys = new Set(
    (value('definition-keys') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');

  const prisma = new PrismaService();
  try {
    const registry = new BusinessDefinitionRegistryService(prisma, new BusinessDefinitionProjectionCompilerService());
    const current = await new BrainSemanticCandidateWorkspaceScanner(registry).scan(workspaceRoot);
    const requested = definitionKeys.size
      ? parsed.candidates.filter((candidate) => definitionKeys.has(semanticCandidateKey(candidate)))
      : parsed.candidates;
    if (definitionKeys.size && requested.length !== definitionKeys.size) {
      const found = new Set(requested.map((candidate) => semanticCandidateKey(candidate)));
      const missing = [...definitionKeys].filter((key) => !found.has(key));
      throw new Error(`semantic_candidate_sync_definition_missing:${missing.join(',')}`);
    }
    const selected = selectCurrentSemanticCandidates(requested, current.candidates);
    if (!apply) {
      process.stdout.write(
        `${JSON.stringify({ mode: 'dry_run', input: inputPath, requested: requested.length, verified: selected.length, source, scanFingerprint: current.scanFingerprint }, null, 2)}\n`,
      );
      return;
    }
    if (!yes) throw new Error('semantic_candidate_sync_confirmation_required');
    if (!Number.isInteger(createdBy) || createdBy < 1) throw new Error('semantic_candidate_sync_created_by_required');
    const result = await new BrainSemanticCandidateSyncService(prisma, registry).sync({
      candidates: selected as never,
      createdBy,
      source,
    });
    process.stdout.write(`${JSON.stringify({ mode: 'applied', ...result }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

async function detectWorkspaceRoot(): Promise<string> {
  for (const candidate of [process.cwd(), resolve(process.cwd(), '..', '..')]) {
    try {
      await access(resolve(candidate, 'packages/server-v2/prisma/schema.prisma'));
      return candidate;
    } catch {
      // Continue searching from npm --prefix working directories.
    }
  }
  throw new Error('semantic_candidate_sync_workspace_root_not_found');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
