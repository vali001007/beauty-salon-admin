import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../src/ai/ai.service.js';
import {
  BrainCapabilityCodegenService,
  type BrainCapabilityGenerationResult,
} from '../src/brain/capability/brain-capability-codegen.service.js';
import { BrainCapabilityDefinitionSnapshotSourceService } from '../src/brain/capability/brain-capability-definition-snapshot-source.service.js';
import { BrainCapabilityNarrativeGeneratorService } from '../src/brain/capability/brain-capability-narrative.service.js';
import { BrainCapabilityScannerService } from '../src/brain/capability/brain-capability-scanner.service.js';
import type { BrainCapabilityScanReport } from '../src/brain/capability/brain-capability-scan.types.js';
import { BrainCapabilitySemanticCompilerService } from '../src/brain/capability/brain-capability-semantic-compiler.service.js';
import { BrainCapabilitySemanticModelService } from '../src/brain/capability/brain-capability-semantic-model.service.js';
import {
  assertNoCapabilityOutputOverrides,
  loadWorkspaceEnvironment,
} from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainCapabilityGenerationBundleService } from '../src/brain/capability/brain-capability-generation-bundle.service.js';
import { BrainCapabilityContractRefreshNarrativeService } from '../src/brain/capability/brain-capability-contract-refresh-narrative.service.js';
import { createDeterministicCapabilityGenerationFixture } from '../src/brain/capability/brain-capability-generation-fixture.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BrainGeneratedCapabilityDraftService } from '../src/brain/capability/brain-generated-capability-draft.service.js';
import { BrainCapabilityPublishedGateService } from '../src/brain/capability/brain-capability-published-gate.service.js';
import { BrainCapabilityGenerationGateService } from '../src/brain/capability/brain-capability-generation-gate.service.js';
import { BrainCapabilitySemanticVerifierService } from '../src/brain/capability/brain-capability-semantic-verifier.service.js';
import { BusinessDefinitionProjectionCompilerService } from '../src/semantic-data/business-definition-projection-compiler.service.js';
import { BusinessDefinitionRegistryService } from '../src/semantic-data/business-definition-registry.service.js';

interface CliOptions {
  workspaceRoot: string;
  deterministicFixture: boolean;
  preferFallback: boolean;
  refreshExisting: boolean;
  includeUnmarked: boolean;
  persistDrafts: boolean;
  createdBy?: number;
  capabilityKeys: string[];
}

async function main() {
  const options = await parseOptions(process.argv.slice(2));
  if (!options.deterministicFixture) {
    loadWorkspaceEnvironment(options.workspaceRoot);
    if (options.preferFallback) preferConfiguredFallbackAsPrimary();
  }
  const fullScan = await new BrainCapabilityScannerService().scan({
    workspaceRoot: options.workspaceRoot,
    explicitOnly: !options.includeUnmarked,
  });
  const scan = selectCapabilityScan(fullScan, options.capabilityKeys);
  let result: BrainCapabilityGenerationResult;
  if (scan.capabilities.length === 0) {
    result = { proposals: [], blocked: [] };
  } else if (options.deterministicFixture) {
    const fixture = createDeterministicCapabilityGenerationFixture(scan);
    result = await new BrainCapabilityCodegenService(fixture.narrativeGenerator, fixture.definitionSource).generate({
      scan,
      workspaceRoot: options.workspaceRoot,
      generationMode: 'synthetic_contract_only',
    });
  } else {
    const prisma = new PrismaService();
    const aiService = options.refreshExisting ? undefined : new AiService(prisma, new ConfigService(process.env));
    const refreshService = options.refreshExisting
      ? new BrainCapabilityContractRefreshNarrativeService(
          await loadExistingCapabilitySnapshots(prisma, scan.capabilities.map((item) => item.key)),
        )
      : undefined;
    const narrativeGenerator = refreshService ?? new BrainCapabilityNarrativeGeneratorService(aiService!);
    const semanticCompiler = options.refreshExisting
      ? undefined
      : new BrainCapabilitySemanticCompilerService(new BrainCapabilitySemanticModelService(aiService!));
    const registry = new BusinessDefinitionRegistryService(prisma, new BusinessDefinitionProjectionCompilerService());
    const definitionSource = await freezeDefinitionSnapshotSource(new BrainCapabilityDefinitionSnapshotSourceService(registry));
    try {
      result = await new BrainCapabilityCodegenService(
        narrativeGenerator,
        definitionSource,
        semanticCompiler,
        undefined,
        refreshService,
      ).generate({
        scan,
        workspaceRoot: options.workspaceRoot,
        generationMode: 'published_registry',
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  const mode = options.deterministicFixture ? 'synthetic_contract_only' : 'published_registry';
  const persistedDrafts = options.persistDrafts
    ? await persistCapabilityDrafts(result, scan, options.workspaceRoot, options.createdBy, options.capabilityKeys)
    : [];
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: mode === 'synthetic_contract_only' ? 'synthetic_contract_only' : 'published_registry_gate',
    productionReady: mode === 'published_registry' && result.blocked.length === 0,
    scanSummary: scan.summary,
    result,
  };
  const bundle = await new BrainCapabilityGenerationBundleService().write({
    workspaceRoot: options.workspaceRoot,
    result,
    generatedAt: payload.generatedAt,
    mode,
    scanSummary: scan.summary,
  });
  process.stdout.write(
    `${JSON.stringify({ mode, productionReady: payload.productionReady, outputDir: bundle.outputDir, report: bundle.reportPath, summary: bundle.summaryPath, markdown: bundle.markdownPath, proposals: result.proposals.length, blocked: result.blocked.length, persistedDrafts })}\n`,
  );
  if (result.blocked.length > 0 || result.proposals.some((item) => !item.gateReport.passed)) process.exitCode = 1;
}

function selectCapabilityScan(scan: BrainCapabilityScanReport, capabilityKeys: readonly string[]): BrainCapabilityScanReport {
  if (capabilityKeys.length === 0) return scan;

  const requested = [...new Set(capabilityKeys)];
  const selected = scan.capabilities.filter((capability) => requested.includes(capability.key));
  const available = new Set(selected.map((capability) => capability.key));
  const missing = requested.filter((key) => !available.has(key)).sort();
  if (missing.length > 0) {
    throw new Error(
      `capability_generation_selected_scan_missing:${missing.join(',')}:available=${scan.capabilities
        .map((capability) => capability.key)
        .sort()
        .join(',')}`,
    );
  }

  return {
    ...scan,
    capabilities: selected,
    summary: {
      total: selected.length,
      draft: selected.filter((item) => item.status === 'draft').length,
      blocked: selected.filter((item) => item.status === 'blocked').length,
      explicit: selected.filter((item) => item.explicit).length,
    },
  };
}

async function parseOptions(args: string[]): Promise<CliOptions> {
  assertNoCapabilityOutputOverrides(args);
  const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const workspaceRoot = resolve(value('workspace-root') ?? (await detectWorkspaceRoot()));
  return {
    workspaceRoot,
    deterministicFixture: args.includes('--deterministic-fixture'),
    preferFallback: args.includes('--prefer-fallback=true'),
    refreshExisting: args.includes('--refresh-existing=true'),
    includeUnmarked: args.includes('--include-unmarked'),
    persistDrafts: args.includes('--persist-drafts'),
    createdBy: value('created-by') ? Number(value('created-by')) : undefined,
    capabilityKeys: (value('capability-keys') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
  };
}

async function loadExistingCapabilitySnapshots(prisma: PrismaService, capabilityKeys: string[]) {
  const rows = await prisma.brainResourceVersion.findMany({
    where: { resourceType: 'skill', resourceKey: { in: capabilityKeys } },
    select: { resourceKey: true, snapshot: true },
    orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
  });
  const snapshots = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (snapshots.has(row.resourceKey) || !row.snapshot || typeof row.snapshot !== 'object' || Array.isArray(row.snapshot)) {
      continue;
    }
    snapshots.set(row.resourceKey, row.snapshot as Record<string, unknown>);
  }
  return snapshots;
}

function preferConfiguredFallbackAsPrimary() {
  const provider = process.env.LLM_FALLBACK_PROVIDER?.trim();
  const model = process.env.LLM_FALLBACK_MODEL?.trim();
  const apiKey = process.env.LLM_FALLBACK_API_KEY?.trim();
  const baseUrl = process.env.LLM_FALLBACK_BASE_URL?.trim();
  if (!provider || !model || !apiKey || !baseUrl) throw new Error('configured_fallback_unavailable');
  process.env.LLM_PROVIDER = provider;
  process.env.LLM_MODEL = model;
  process.env.LLM_API_KEY = apiKey;
  process.env.LLM_BASE_URL = baseUrl;
  process.env.LLM_CHAT_PATH = process.env.LLM_FALLBACK_CHAT_PATH || '/chat/completions';
  process.env.LLM_FALLBACK_PROVIDER = '';
  process.env.LLM_FALLBACK_MODEL = '';
  process.env.LLM_FALLBACK_API_KEY = '';
  process.env.LLM_FALLBACK_BASE_URL = '';
}

async function persistCapabilityDrafts(
  result: BrainCapabilityGenerationResult,
  sourceScan: BrainCapabilityScanReport,
  workspaceRoot: string,
  createdBy: number | undefined,
  capabilityKeys: readonly string[],
) {
  if (!Number.isInteger(createdBy) || Number(createdBy) < 1) {
    throw new Error('capability_generation_created_by_required');
  }
  const prisma = new PrismaService();
  try {
    const registry = new BusinessDefinitionRegistryService(prisma, new BusinessDefinitionProjectionCompilerService());
    const definitionSource = await freezeDefinitionSnapshotSource(new BrainCapabilityDefinitionSnapshotSourceService(registry));
    const publishedGate = new BrainCapabilityPublishedGateService(
      new BrainCapabilityScannerService(),
      new BrainCapabilityGenerationGateService(),
      new BrainCapabilitySemanticVerifierService(definitionSource),
    );
    const drafts = new BrainGeneratedCapabilityDraftService(prisma, publishedGate);
    const items = [];
    const selected = capabilityKeys.length
      ? result.proposals.filter((proposal) => capabilityKeys.includes(proposal.capabilityKey))
      : result.proposals;
    if (capabilityKeys.length && selected.length !== new Set(capabilityKeys).size) {
      const available = [...new Set(result.proposals.map((proposal) => proposal.capabilityKey))].sort();
      const missing = [...new Set(capabilityKeys)].filter((key) => !available.includes(key)).sort();
      throw new Error(`capability_generation_selected_proposal_missing:${missing.join(',')}:available=${available.join(',')}`);
    }
    for (const proposal of selected) {
      try {
        const created = await drafts.createDraft({
          proposal,
          createdBy: Number(createdBy),
          workspaceRoot,
          sourceScan,
        });
        items.push({ capabilityKey: proposal.capabilityKey, resourceVersionId: created.id, version: created.version });
      } catch (error) {
        throw new Error(`generated_capability_persist_failed:${proposal.capabilityKey}`, { cause: error });
      }
    }
    return items;
  } finally {
    await prisma.$disconnect();
  }
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

async function freezeDefinitionSnapshotSource(source: BrainCapabilityDefinitionSnapshotSourceService) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const snapshot = await source.loadPublishedSnapshot();
      return { loadPublishedSnapshot: async () => snapshot };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
    }
  }
  throw new Error('business_definition_snapshot_preflight_failed', { cause: lastError });
}

main().catch((error) => {
  process.stderr.write(`${formatErrorChain(error)}\n`);
  process.exitCode = 1;
});

function formatErrorChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = 'cause' in error ? error.cause : undefined;
  return cause ? `${error.message}: ${formatErrorChain(cause)}` : error.message;
}
