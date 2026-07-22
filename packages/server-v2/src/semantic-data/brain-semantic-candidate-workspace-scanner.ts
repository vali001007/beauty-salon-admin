import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';
import { BusinessDefinitionRegistryService } from './business-definition-registry.service.js';
import { BrainMetricCandidateGeneratorService } from './brain-metric-candidate-generator.service.js';
import {
  BrainMetricPublishedDefinitionSourceService,
  BrainMetricSourceAdapters,
} from './brain-metric-source-adapters.js';
import { BrainOntologyCandidateGeneratorService } from './brain-ontology-candidate-generator.service.js';
import { BrainSemanticCandidateVerifierService } from './brain-semantic-candidate-verifier.service.js';
import { LEGACY_SEMANTIC_METRICS } from './legacy-semantic-metric.fixture.js';
import { AMI_CORE_BUSINESS_DIMENSION_CONTRACTS } from './ami-core-business-semantic-contracts.js';
import type { CandidateSourceFile, SemanticLabelEvidence } from './brain-semantic-candidate.types.js';

const EVAL_QUESTIONS_PATH =
  'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md';
const TYPESCRIPT_ROOTS = ['packages/server-v2/src', 'src/app'];
const MAX_SOURCE_FILES = 5000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export interface SemanticCandidateEnvelope {
  status: 'draft' | 'blocked';
  blockedReasons: string[];
  draftInput?: { definitionKey: string; [key: string]: unknown };
  metricKey?: string;
  definitionKey?: string;
  [key: string]: unknown;
}

export class BrainSemanticCandidateWorkspaceScanner {
  constructor(private readonly registry: BusinessDefinitionRegistryService) {}

  async scan(workspaceRoot: string) {
    const metricScan = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: new BrainMetricPublishedDefinitionSourceService(this.registry),
      legacyMetricDefinitions: LEGACY_SEMANTIC_METRICS,
    });
    const metricResult = new BrainMetricCandidateGeneratorService().generate(metricScan);
    const ontologyGenerator = new BrainOntologyCandidateGeneratorService();
    const sources = await loadOntologySources(workspaceRoot);
    const codeEvidence = ontologyGenerator.extractTypeScriptEvidence(sources);
    const semanticEvidence = [
      ...codeEvidence,
      ...(await loadEvalEvidence(workspaceRoot, ontologyGenerator, codeEvidence)),
    ];
    const verifier = new BrainSemanticCandidateVerifierService();
    const ontologyCandidates = ontologyGenerator
      .generate({ datamodel: metricScan.datamodel, semanticEvidence })
      .map((candidate) => verifier.verify(candidate, { datamodel: metricScan.datamodel, semanticEvidence }));
    const dimensionCandidates = buildAmiCoreDimensionCandidates(
      metricScan.datamodel,
      metricScan.registeredPermissions,
    );
    const candidates = [
      ...metricResult.candidates,
      ...dimensionCandidates,
      ...ontologyCandidates,
    ] as unknown as SemanticCandidateEnvelope[];
    const summary = {
      total: candidates.length,
      draft: candidates.filter((candidate) => candidate.status === 'draft').length,
      blocked: candidates.filter((candidate) => candidate.status === 'blocked').length,
      metric: metricResult.candidates.length,
      dimension: dimensionCandidates.length,
      ontology: ontologyCandidates.length,
    };
    return {
      candidates,
      summary,
      scanFingerprint: createHash('sha256')
        .update(canonicalizeBusinessDefinition(candidates))
        .digest('hex'),
    };
  }
}

function buildAmiCoreDimensionCandidates(
  datamodel: Parameters<BrainOntologyCandidateGeneratorService['generate']>[0]['datamodel'],
  registeredPermissions: ReadonlySet<string>,
): SemanticCandidateEnvelope[] {
  const models = new Map(datamodel.models.map((model) => [model.name, model]));
  return AMI_CORE_BUSINESS_DIMENSION_CONTRACTS.map((contract) => {
    const blockedReasons: string[] = [];
    const field = models.get(contract.source.model)?.fields.find((item) => item.name === contract.source.field);
    if (!field || field.kind === 'object') {
      blockedReasons.push(`dimension_source_invalid:${contract.source.model}.${contract.source.field}`);
    }
    for (const permission of contract.permissions) {
      if (!registeredPermissions.has(permission)) blockedReasons.push(`unregistered_permission:${permission}`);
    }
    const lifecycleStatus = blockedReasons.length ? 'candidate' : 'draft';
    return {
      status: blockedReasons.length ? 'blocked' : 'draft',
      blockedReasons,
      definitionKey: `dimension.${contract.dimensionKey}`,
      draftInput: {
        definitionKey: `dimension.${contract.dimensionKey}`,
        kind: 'dimension',
        domain: contract.domain,
        name: contract.name,
        ownerType: 'ami_core_semantic_contract',
        ownerId: contract.dimensionKey,
        lifecycleStatus,
        schemaVersion: '1.0',
        payload: {
          dimensionKey: contract.dimensionKey,
          aliases: [...contract.aliases],
          source: { ...contract.source },
          ...(contract.derivation ? { derivation: structuredClone(contract.derivation) } : {}),
          permissionPolicies: contract.capabilityKeys.map((bindingRef) => ({
            bindingRef,
            allOf: [...contract.permissions],
          })),
          bindings: { capability: [...contract.capabilityKeys] },
        },
        timezone: 'Asia/Shanghai',
        storeScope: { mode: 'current_store' },
        evidence: [
          {
            sourceType: 'verified_executable_binding',
            sourcePath: 'packages/server-v2/src/semantic-data/ami-core-business-semantic-contracts.ts',
            sourceSymbol: `AMI_CORE_BUSINESS_DIMENSION_CONTRACTS.${contract.dimensionKey}`,
            evidenceKind: 'verified_executable_binding',
            confidence: 0.95,
          },
        ],
      },
    };
  });
}

export function selectCurrentSemanticCandidates(
  requested: readonly unknown[],
  current: readonly SemanticCandidateEnvelope[],
): SemanticCandidateEnvelope[] {
  const byKey = new Map<string, SemanticCandidateEnvelope>();
  for (const candidate of current) {
    const key = semanticCandidateKey(candidate);
    if (byKey.has(key)) throw new Error(`semantic_candidate_current_duplicate:${key}`);
    byKey.set(key, candidate);
  }
  const selected: SemanticCandidateEnvelope[] = [];
  const seen = new Set<string>();
  for (const imported of requested) {
    const key = semanticCandidateKey(imported);
    if (seen.has(key)) throw new Error(`semantic_candidate_sync_duplicate:${key}`);
    seen.add(key);
    const candidate = byKey.get(key);
    if (!candidate) throw new Error(`semantic_candidate_sync_source_drift:${key}`);
    selected.push(structuredClone(candidate));
  }
  return selected;
}

export function semanticCandidateKey(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('semantic_candidate_sync_identity_invalid');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.draftInput && typeof candidate.draftInput === 'object' && !Array.isArray(candidate.draftInput)) {
    const definitionKey = (candidate.draftInput as Record<string, unknown>).definitionKey;
    if (typeof definitionKey === 'string' && definitionKey.trim()) return definitionKey.trim();
  }
  if (typeof candidate.definitionKey === 'string' && candidate.definitionKey.trim()) {
    return candidate.definitionKey.trim();
  }
  if (typeof candidate.metricKey === 'string' && candidate.metricKey.trim()) {
    return `metric.${candidate.metricKey.trim()}`;
  }
  throw new Error('semantic_candidate_sync_identity_invalid');
}

async function loadOntologySources(workspaceRoot: string): Promise<CandidateSourceFile[]> {
  const files: CandidateSourceFile[] = [];
  for (const sourceRoot of TYPESCRIPT_ROOTS) {
    await walk(resolve(workspaceRoot, sourceRoot), workspaceRoot, files);
  }
  return files;
}

async function walk(directory: string, workspaceRoot: string, files: CandidateSourceFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (files.length >= MAX_SOURCE_FILES) throw new Error('semantic_candidate_source_file_limit_exceeded');
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) continue;
      await walk(absolute, workspaceRoot, files);
      continue;
    }
    if (!entry.isFile() || !['.ts', '.tsx'].includes(extname(entry.name).toLowerCase())) continue;
    if (/\.(spec|test)\.(ts|tsx)$/i.test(entry.name) || /\.generated\.(ts|tsx)$/i.test(entry.name)) continue;
    const content = await readFile(absolute, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_BYTES) continue;
    files.push({ path: relative(workspaceRoot, absolute).replace(/\\/g, '/'), content });
  }
}

async function loadEvalEvidence(
  workspaceRoot: string,
  generator: BrainOntologyCandidateGeneratorService,
  codeEvidence: SemanticLabelEvidence[],
) {
  try {
    const markdown = await readFile(resolve(workspaceRoot, EVAL_QUESTIONS_PATH), 'utf8');
    const aliases = codeEvidence
      .filter((item) => item.targetSymbol !== '__unbound__' && item.confidence >= 0.75)
      .map((item) => ({ targetSymbol: item.targetSymbol, alias: item.label }));
    return generator.extractEvalQuestionEvidence(markdown, EVAL_QUESTIONS_PATH, aliases);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
