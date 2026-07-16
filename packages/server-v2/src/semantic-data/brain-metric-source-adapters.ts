import { createHash } from 'node:crypto';
import { realpathSync, type Dirent } from 'node:fs';
import { open, opendir, realpath, type FileHandle } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';
import { scanBrainCapabilitySources } from '../brain/capability/brain-capability-source-adapters.js';
import {
  QueryTemplateRegistryService,
  type SemanticQueryTemplateDefinition,
} from '../semantic-query/query-template-registry.service.js';
import {
  BUSINESS_DEFINITION_PROJECTION_TYPES,
  canonicalizeBusinessDefinition,
  createBusinessDefinitionProjectionFingerprint,
  createBusinessDefinitionProjectionV2Payload,
  isBusinessDefinitionProjectionV2Payload,
  type BusinessDefinitionProjectionTypeValue,
} from './business-definition-projection-compiler.service.js';
import {
  BusinessDefinitionRegistryService,
  createBusinessDefinitionEvidenceFingerprint,
  createBusinessDefinitionFingerprint,
  createBusinessDefinitionSourceFingerprint,
  type NormalizedBusinessDefinitionEvidence,
} from './business-definition-registry.service.js';
import { BrainPrismaSchemaAstAdapter } from './brain-prisma-schema-ast.adapter.js';
import { AMI_CORE_BUSINESS_METRIC_CONTRACTS } from './ami-core-business-semantic-contracts.js';
import type { LegacySemanticMetricDefinition } from './legacy-semantic-metric.fixture.js';
import type {
  BrainMetricCandidateSourceFile,
  BrainMetricPayloadFragment,
  BrainMetricSourceObservation,
  CanonicalMetricPayload,
} from './brain-metric-candidate.types.js';
import type { PrismaDatamodelAst } from './brain-semantic-candidate.types.js';

interface ObserveTypeScriptSourcesInput {
  knownMetricKeys: ReadonlySet<string>;
  sources: BrainMetricCandidateSourceFile[];
}

interface ScanMetricWorkspaceInput {
  workspaceRoot: string;
  publishedDefinitionSource: BrainMetricPublishedDefinitionSource;
  legacyMetricDefinitions?: readonly LegacySemanticMetricDefinition[];
}

export interface BrainMetricPublishedDefinitionSnapshot {
  snapshotFingerprint: string;
  definitions: unknown[];
}

export interface BrainMetricPublishedDefinitionSource {
  loadPublishedSnapshot(): Promise<BrainMetricPublishedDefinitionSnapshot>;
}

@Injectable()
export class BrainMetricPublishedDefinitionSourceService implements BrainMetricPublishedDefinitionSource {
  constructor(private readonly registry: BusinessDefinitionRegistryService) {}

  async loadPublishedSnapshot(): Promise<BrainMetricPublishedDefinitionSnapshot> {
    return (await this.registry.getPublishedSnapshot({ kind: 'metric' })) as BrainMetricPublishedDefinitionSnapshot;
  }
}

const TRUSTED_LEGACY_BINDING_PATHS = new Set([
  'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
  'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts',
]);
const TRUSTED_EXECUTOR_PATHS = new Set([
  ...TRUSTED_LEGACY_BINDING_PATHS,
  'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts',
  'packages/server-v2/src/semantic-query/semantic-query-executor.service.ts',
]);
interface MetricEvidenceScanLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxDepth: number;
  maxDirectories: number;
  maxEntries: number;
}

const METRIC_EVIDENCE_SCAN_LIMITS: MetricEvidenceScanLimits = {
  maxFiles: 512,
  maxFileBytes: 256 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
  maxDepth: 24,
  maxDirectories: 512,
  maxEntries: 4096,
} as const;
const METRIC_SERVICE_PATH_HINTS = ['report', 'analytics', 'metric', 'overview', 'settlement', 'profit'] as const;
const EXCLUDED_SCAN_DIRECTORIES = new Set([
  '__tests__',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'test',
  'tests',
]);
const EXCLUDED_BACKEND_METRIC_SOURCES = new Set([
  'packages/server-v2/src/semantic-data/semantic-metric-registry.service.ts',
  'packages/server-v2/src/semantic-data/legacy-semantic-metric.fixture.ts',
  'packages/server-v2/src/semantic-data/business-metric-catalog.testing.ts',
  'packages/server-v2/src/semantic-query/query-template-registry.service.ts',
]);

type WorkspaceMetricEvidenceSourceType = 'report_service' | 'metric_card';

interface WorkspaceMetricSourceRoot {
  path: string;
  sourceType: WorkspaceMetricEvidenceSourceType;
}

interface StaticMetricMetadata {
  metricKey: string;
  label: string;
  description?: string;
  sourceType?: WorkspaceMetricEvidenceSourceType;
}

export class BrainMetricSourceAdapters {
  observeTypeScriptSources(input: ObserveTypeScriptSourcesInput): BrainMetricSourceObservation[] {
    const observations: BrainMetricSourceObservation[] = [];
    for (const source of input.sources) {
      const file = createTypeScriptSourceFile(source.path, source.content);
      observations.push(...observeMetricBindings(file, source.path, input.knownMetricKeys));
      observations.push(...observeExecutorBindings(file, source.path, input.knownMetricKeys));
      observations.push(...observeLanguageEvidence(file, source.path, input.knownMetricKeys));
    }
    return observations.map((observation) => ({
      ...observation,
      observationFingerprint: createMetricObservationFingerprint(observation),
    }));
  }

  async scanWorkspace(input: ScanMetricWorkspaceInput): Promise<{
    observations: BrainMetricSourceObservation[];
    datamodel: PrismaDatamodelAst;
    registeredPermissions: Set<string>;
  }> {
    if (!(input.publishedDefinitionSource instanceof BrainMetricPublishedDefinitionSourceService)) {
      throw new Error('metric_published_snapshot_source_untrusted');
    }
    const workspaceRoot = resolve(input.workspaceRoot);
    const workspaceRealRoot = await realpath(workspaceRoot);
    const sourcePaths = [
      'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts',
      'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts',
      'packages/server-v2/src/semantic-query/semantic-query-executor.service.ts',
    ];
    const trustedSources = (
      await Promise.all(sourcePaths.map((path) => readOptionalTypeScriptSource(workspaceRoot, workspaceRealRoot, path)))
    ).filter((source): source is BrainMetricCandidateSourceFile => Boolean(source));
    const workspaceMetricSources = await collectWorkspaceMetricEvidenceSources(workspaceRoot);
    const metricDefinitions = [...(input.legacyMetricDefinitions ?? [])];
    const templates = new QueryTemplateRegistryService().list();
    const publishedSnapshot = await input.publishedDefinitionSource.loadPublishedSnapshot();
    const expectedSnapshotFingerprint = createHash('sha256')
      .update(canonicalizeBusinessDefinition(publishedSnapshot.definitions))
      .digest('hex');
    if (publishedSnapshot.snapshotFingerprint !== expectedSnapshotFingerprint) {
      throw new Error('metric_published_snapshot_fingerprint_invalid');
    }
    if (!publishedSnapshot.definitions.every(validPublishedMetricDefinition)) {
      throw new Error('metric_published_definition_invalid');
    }
    const knownMetricKeys = new Set([
      ...AMI_CORE_BUSINESS_METRIC_CONTRACTS.map((contract) => contract.metricKey),
      ...metricDefinitions.map((metric) => metric.key),
      ...templates.flatMap((template) => template.metricKeys),
      ...discoverMetricSqlKeys(trustedSources),
      ...discoverStaticMetricMetadataKeys(workspaceMetricSources),
    ]);
    const capabilities = await scanBrainCapabilitySources(workspaceRoot);
    const observations = [
      ...observePublishedDefinitions(publishedSnapshot.definitions),
      ...observeAmiCoreMetricContracts(capabilities.evidence),
      ...observeLegacyMetricFixture(metricDefinitions),
      ...observeTemplateRegistry(templates),
      ...this.observeTypeScriptSources({ knownMetricKeys, sources: trustedSources }),
      ...observeWorkspaceMetricLanguageEvidence(workspaceMetricSources, knownMetricKeys),
    ].map((observation) => ({
      ...observation,
      observationFingerprint: observation.observationFingerprint ?? createMetricObservationFingerprint(observation),
    }));
    const schemaSourcePath = 'packages/server-v2/prisma/schema.prisma';
    const schema = await readRequiredWorkspaceSource(
      workspaceRoot,
      workspaceRealRoot,
      schemaSourcePath,
      'metric_schema_source_outside_workspace',
      'metric_schema_source_too_large',
    );
    const datamodel = new BrainPrismaSchemaAstAdapter().mergeWithDmmf(
      Prisma.dmmf.datamodel as unknown as PrismaDatamodelAst,
      schema,
      schemaSourcePath,
    );
    return { observations, datamodel, registeredPermissions: capabilities.registeredPermissions };
  }
}

function observeAmiCoreMetricContracts(
  capabilityEvidence: Awaited<ReturnType<typeof scanBrainCapabilitySources>>['evidence'],
): BrainMetricSourceObservation[] {
  return AMI_CORE_BUSINESS_METRIC_CONTRACTS.map((contract) => {
    const decorator = capabilityEvidence.find(
      (item) => item.sourceType === 'decorator' && item.data.key === contract.capabilityKey,
    );
    const reasons: string[] = [];
    const expectedDefinitionKey = `metric.${contract.metricKey}`;
    const definitions = stringArrayValue(decorator?.data.businessDefinitionKeys);
    const permissions = stringArrayValue(decorator?.data.permissions);
    const contractPermissions = contract.payload.permissionPolicies.flatMap((policy) => policy.allOf);
    if (!decorator) reasons.push(`metric_contract_capability_missing:${contract.capabilityKey}`);
    if (decorator && decorator.path !== contract.executorSourcePath) {
      reasons.push(`metric_contract_executor_path_mismatch:${contract.capabilityKey}`);
    }
    if (decorator && decorator.symbol !== contract.executorSymbol) {
      reasons.push(`metric_contract_executor_symbol_mismatch:${contract.capabilityKey}`);
    }
    if (!definitions.includes(expectedDefinitionKey)) {
      reasons.push(`metric_contract_definition_binding_missing:${expectedDefinitionKey}`);
    }
    if (decorator?.data.readOnly !== true || decorator?.data.storeScope !== 'required') {
      reasons.push(`metric_contract_safety_binding_invalid:${contract.capabilityKey}`);
    }
    if (!sameStringSet(permissions, contractPermissions)) {
      reasons.push(`metric_contract_permission_mismatch:${contract.capabilityKey}`);
    }
    return {
      metricKey: contract.metricKey,
      sourceKind: 'verified_executable_binding' as const,
      authority: 'verified_executable_binding' as const,
      sourcePath: 'packages/server-v2/src/semantic-data/ami-core-business-semantic-contracts.ts',
      sourceSymbol: `AMI_CORE_BUSINESS_METRIC_CONTRACTS.${contract.metricKey}`,
      aliases: [...contract.aliases],
      payload: structuredClone(contract.payload),
      binding: {
        queryKey: contract.metricKey,
        executorRef: contract.payload.bindings.executor[0],
        outputField: contract.payload.bindings.outputField[0],
        permissionAllOf: contractPermissions,
        dateField: contract.payload.timePolicy.field,
      },
      ...(reasons.length ? { blockedReasons: reasons } : {}),
      evidence: {
        capabilityKey: contract.capabilityKey,
        executorPath: contract.executorSourcePath,
        executorSymbol: contract.executorSymbol,
        ...(typeof decorator?.data.sourceFingerprint === 'string'
          ? { capabilitySourceFingerprint: decorator.data.sourceFingerprint }
          : {}),
      },
    };
  });
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((item) => rightSet.has(item));
}

async function readOptionalTypeScriptSource(
  workspaceRoot: string,
  workspaceRealRoot: string,
  sourcePath: string,
): Promise<BrainMetricCandidateSourceFile | undefined> {
  const absolutePath = resolve(workspaceRoot, sourcePath);
  try {
    const sourceRealPath = await realpath(absolutePath);
    const expectedRealPath = resolve(workspaceRealRoot, normalizeMetricSourcePath(sourcePath));
    if (!isPathInside(workspaceRealRoot, sourceRealPath) || !sameFilesystemPath(sourceRealPath, expectedRealPath)) {
      throw new Error('metric_trusted_source_outside_workspace');
    }
    const content = await readMetricSourceFileBounded(absolutePath, METRIC_EVIDENCE_SCAN_LIMITS.maxFileBytes);
    if (content === undefined) return undefined;
    return {
      path: normalizeMetricSourcePath(sourcePath),
      content,
    };
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
}

async function readRequiredWorkspaceSource(
  workspaceRoot: string,
  workspaceRealRoot: string,
  sourcePath: string,
  outsideError: string,
  oversizedError: string,
): Promise<string> {
  const absolutePath = resolve(workspaceRoot, sourcePath);
  const sourceRealPath = await realpath(absolutePath);
  const expectedRealPath = resolve(workspaceRealRoot, normalizeMetricSourcePath(sourcePath));
  if (!isPathInside(workspaceRealRoot, sourceRealPath) || !sameFilesystemPath(sourceRealPath, expectedRealPath)) {
    throw new Error(outsideError);
  }
  const content = await readMetricSourceFileBounded(absolutePath, METRIC_EVIDENCE_SCAN_LIMITS.maxFileBytes);
  if (content === undefined) throw new Error(oversizedError);
  return content;
}

export async function collectWorkspaceMetricEvidenceSources(
  workspaceRoot: string,
  limitOverrides: Partial<MetricEvidenceScanLimits> = {},
): Promise<BrainMetricCandidateSourceFile[]> {
  const workspaceRealRoot = await realpath(resolve(workspaceRoot));
  const limits = constrainMetricEvidenceScanLimits(limitOverrides);
  const roots: WorkspaceMetricSourceRoot[] = [
    { path: 'packages/server-v2/src', sourceType: 'report_service' },
    { path: 'src/app/pages', sourceType: 'metric_card' },
    { path: 'src/app/components', sourceType: 'metric_card' },
  ];
  const state = {
    filesVisited: 0,
    directoriesVisited: 0,
    entriesVisited: 0,
    totalBytes: 0,
    sources: [] as BrainMetricCandidateSourceFile[],
    limits,
    workspaceRealRoot,
  };
  for (const root of roots) {
    await collectWorkspaceMetricEvidenceRoot(workspaceRoot, root, resolve(workspaceRoot, root.path), state, 0);
  }
  return state.sources;
}

async function collectWorkspaceMetricEvidenceRoot(
  workspaceRoot: string,
  root: WorkspaceMetricSourceRoot,
  absoluteDirectory: string,
  state: {
    filesVisited: number;
    directoriesVisited: number;
    entriesVisited: number;
    totalBytes: number;
    sources: BrainMetricCandidateSourceFile[];
    limits: MetricEvidenceScanLimits;
    workspaceRealRoot: string;
  },
  depth: number,
): Promise<void> {
  if (depth > state.limits.maxDepth) throw new Error('metric_evidence_depth_limit_exceeded');
  if (state.directoriesVisited >= state.limits.maxDirectories) {
    throw new Error('metric_evidence_directory_limit_exceeded');
  }
  const directoryRealPath = await metricEvidenceRealPath(absoluteDirectory, true);
  if (directoryRealPath === undefined) return;
  assertMetricEvidencePathInside(state.workspaceRealRoot, directoryRealPath);
  state.directoriesVisited += 1;
  let directory;
  try {
    directory = await opendir(absoluteDirectory);
  } catch (error) {
    if (isMissingPathError(error) || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return;
    throw error;
  }
  const entries: Dirent[] = [];
  for await (const entry of directory) {
    if (state.entriesVisited >= state.limits.maxEntries) {
      throw new Error('metric_evidence_entry_limit_exceeded');
    }
    state.entriesVisited += 1;
    entries.push(entry);
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = resolve(absoluteDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      const linkedRealPath = await metricEvidenceRealPath(absolutePath, false);
      assertMetricEvidencePathInside(state.workspaceRealRoot, linkedRealPath);
      continue;
    }
    if (entry.isDirectory()) {
      if (!EXCLUDED_SCAN_DIRECTORIES.has(entry.name.toLowerCase())) {
        await collectWorkspaceMetricEvidenceRoot(workspaceRoot, root, absolutePath, state, depth + 1);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    const sourcePath = normalizeMetricSourcePath(relative(workspaceRoot, absolutePath));
    if (!isWorkspaceMetricEvidenceFile(sourcePath, root.sourceType)) continue;
    if (state.filesVisited >= state.limits.maxFiles) {
      throw new Error('metric_evidence_file_limit_exceeded');
    }
    state.filesVisited += 1;
    const sourceRealPath = await metricEvidenceRealPath(absolutePath, false);
    assertMetricEvidencePathInside(state.workspaceRealRoot, sourceRealPath);
    let content: string | undefined;
    try {
      content = await readMetricSourceFileBounded(absolutePath, state.limits.maxFileBytes);
    } catch (error) {
      if (isMissingPathError(error)) continue;
      throw error;
    }
    if (content === undefined) throw new Error('metric_evidence_file_bytes_limit_exceeded');
    const contentBytes = Buffer.byteLength(content);
    if (state.totalBytes + contentBytes > state.limits.maxTotalBytes) {
      throw new Error('metric_evidence_byte_limit_exceeded');
    }
    state.totalBytes += contentBytes;
    state.sources.push({ path: sourcePath, content });
  }
}

function metricEvidenceRealPath(path: string, allowMissing: false): Promise<string>;
function metricEvidenceRealPath(path: string, allowMissing: true): Promise<string | undefined>;
async function metricEvidenceRealPath(path: string, allowMissing: boolean): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch (error) {
    if (allowMissing && isMissingPathError(error)) return undefined;
    throw new Error('metric_evidence_source_realpath_invalid');
  }
}

function assertMetricEvidencePathInside(workspaceRealRoot: string, sourceRealPath: string): void {
  if (!isPathInside(workspaceRealRoot, sourceRealPath)) {
    throw new Error('metric_evidence_source_outside_workspace');
  }
}

function constrainMetricEvidenceScanLimits(overrides: Partial<MetricEvidenceScanLimits>): MetricEvidenceScanLimits {
  return Object.fromEntries(
    Object.entries(METRIC_EVIDENCE_SCAN_LIMITS).map(([key, defaultValue]) => {
      const override = overrides[key as keyof MetricEvidenceScanLimits];
      const constrained = Number.isFinite(override) ? Math.max(0, Math.floor(Number(override))) : defaultValue;
      return [key, Math.min(defaultValue, constrained)];
    }),
  ) as unknown as MetricEvidenceScanLimits;
}

async function readMetricSourceFileBounded(path: string, maxBytes: number): Promise<string | undefined> {
  const file = await open(path, 'r');
  try {
    return await readOpenedMetricSourceFileBounded(file, maxBytes);
  } finally {
    await file.close();
  }
}

export async function readOpenedMetricSourceFileBounded(
  file: FileHandle,
  maxBytes: number,
): Promise<string | undefined> {
  if (!Number.isInteger(maxBytes) || maxBytes < 0) throw new Error('metric_source_max_bytes_invalid');
  const buffer = Buffer.alloc(maxBytes + 1);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await file.read(buffer, offset, buffer.byteLength - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > maxBytes) return undefined;
  return buffer.subarray(0, offset).toString('utf8');
}

function isWorkspaceMetricEvidenceFile(sourcePath: string, sourceType: WorkspaceMetricEvidenceSourceType): boolean {
  const fileName = portableBasename(sourcePath).toLowerCase();
  const extension = extname(fileName);
  if (!['.ts', '.tsx'].includes(extension)) return false;
  if (
    fileName.includes('.spec.') ||
    fileName.includes('.test.') ||
    fileName.includes('.generated.') ||
    fileName.startsWith('generated.')
  ) {
    return false;
  }
  if (sourceType === 'metric_card') return true;
  return isBackendMetricServicePath(sourcePath);
}

function isBackendMetricServicePath(sourcePath: string): boolean {
  const normalized = normalizeMetricSourcePath(sourcePath).toLowerCase();
  if (!normalized.startsWith('packages/server-v2/src/')) return false;
  if (!portableBasename(normalized).endsWith('.service.ts')) return false;
  if (EXCLUDED_BACKEND_METRIC_SOURCES.has(normalized)) return false;
  return METRIC_SERVICE_PATH_HINTS.some((hint) => normalized.includes(hint));
}

function workspaceMetricEvidenceSourceType(sourcePath: string): WorkspaceMetricEvidenceSourceType | undefined {
  const normalized = normalizeMetricSourcePath(sourcePath).toLowerCase();
  if (normalized.startsWith('src/app/pages/') || normalized.startsWith('src/app/components/')) return 'metric_card';
  return isBackendMetricServicePath(normalized) ? 'report_service' : undefined;
}

function createTypeScriptSourceFile(sourcePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    sourcePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    extname(sourcePath).toLowerCase() === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

export function normalizeMetricSourcePath(value: string): string {
  return value.split('\\').join('/').replace(/^\.\//, '');
}

function isMissingPathError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function createMetricObservationFingerprint(observation: BrainMetricSourceObservation): string {
  const normalized = normalizeFingerprintValue({
    metricKey: observation.metricKey,
    sourceKind: observation.sourceKind,
    authority: observation.authority,
    sourceSymbol: observation.sourceSymbol,
    payload: observation.payload,
    binding: observation.binding,
    aliases: observation.aliases,
    blockedReasons: observation.blockedReasons,
    evidence: observation.evidence,
  });
  return createHash('sha256').update(canonicalizeBusinessDefinition(normalized)).digest('hex');
}

export function resolveMetricCandidateScanOutputPath(workspaceRoot: string, value?: string): string {
  const output = value
    ? isAbsolute(value)
      ? resolve(value)
      : resolve(workspaceRoot, value)
    : resolve(tmpdir(), `ami-brain-semantic-candidates-${process.pid}.json`);
  const realWorkspaceRoot = resolveRealPathAllowMissingSync(workspaceRoot);
  const realOutput = resolveRealPathAllowMissingSync(output);
  if (isPathInside(realWorkspaceRoot, realOutput)) {
    throw new Error('metric_candidate_scan_workspace_output_forbidden');
  }
  return realOutput;
}

function resolveRealPathAllowMissingSync(value: string): string {
  let current = resolve(value);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(realpathSync.native(current), ...missingSegments);
    } catch (error) {
      if (!isMissingPathError(error) && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

function isPathInside(root: string, target: string): boolean {
  const relationship = relative(filesystemPathKey(root), filesystemPathKey(target));
  return (
    relationship === '' || (!isAbsolute(relationship) && relationship !== '..' && !relationship.startsWith(`..${sep}`))
  );
}

function sameFilesystemPath(left: string, right: string): boolean {
  return filesystemPathKey(resolve(left)) === filesystemPathKey(resolve(right));
}

function filesystemPathKey(value: string): string {
  const resolved = resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function observePublishedDefinitions(definitions: unknown[]): BrainMetricSourceObservation[] {
  const observations: BrainMetricSourceObservation[] = [];
  for (const value of definitions) {
    if (!isRecord(value) || value.kind !== 'metric' || typeof value.definitionKey !== 'string') continue;
    if (!value.definitionKey.startsWith('metric.') || !isRecord(value.payload)) continue;
    const metricKey = value.definitionKey.slice('metric.'.length);
    observations.push({
      metricKey,
      sourceKind: 'published_definition',
      authority: 'published_definition',
      sourcePath: `business-definition-registry://${String(value.definitionId ?? 'unknown')}`,
      sourceSymbol: `${value.definitionKey}@${String(value.version ?? 'unknown')}`,
      aliases: Array.from(new Set(stringArrayValue(value.payload.aliases))),
      payload: value.payload as unknown as CanonicalMetricPayload,
      evidence: {
        definitionId: value.definitionId,
        versionId: value.versionId,
        version: value.version,
        fingerprint: value.fingerprint,
        sourceFingerprint: value.sourceFingerprint,
        canonicalQueryRef: value.canonicalQueryRef,
        fixtureSetKey: value.fixtureSetKey,
      },
    });
  }
  return observations;
}

function observeLegacyMetricFixture(metrics: readonly LegacySemanticMetricDefinition[]): BrainMetricSourceObservation[] {
  return metrics.flatMap((metric) => {
    const payload: BrainMetricPayloadFragment = {
      description: metric.description,
      ...(metric.valueType ? { valueType: metric.valueType } : {}),
      ...(metric.defaultAggregation ? { measure: { aggregation: metric.defaultAggregation } } : {}),
      allowedTaskTypes: [...metric.allowedTaskTypes],
      sensitive: metric.sensitive,
      sourceModels: [...metric.source],
    };
    return [
      {
        metricKey: metric.key,
        sourceKind: 'metric_declaration' as const,
        authority: 'metric_template_declaration' as const,
        sourcePath: 'packages/server-v2/src/semantic-data/legacy-semantic-metric.fixture.ts',
        sourceSymbol: `LEGACY_SEMANTIC_METRICS.${metric.key}`,
        payload,
        evidence: {
          domain: metric.domain,
          allowedTaskTypes: metric.allowedTaskTypes,
          filters: metric.filters,
          sensitive: metric.sensitive,
        },
      },
      {
        metricKey: metric.key,
        sourceKind: 'language_evidence' as const,
        authority: 'language_evidence' as const,
        sourcePath: 'packages/server-v2/src/semantic-data/legacy-semantic-metric.fixture.ts',
        sourceSymbol: `LEGACY_SEMANTIC_METRICS.${metric.key}.name`,
        aliases: [metric.name],
        evidence: { label: metric.name, description: metric.description },
      },
    ];
  });
}

function observeTemplateRegistry(templates: SemanticQueryTemplateDefinition[]): BrainMetricSourceObservation[] {
  return templates.flatMap((template) =>
    template.metricKeys.map((metricKey) => ({
      metricKey,
      sourceKind: 'template_declaration' as const,
      authority: 'metric_template_declaration' as const,
      sourcePath: 'packages/server-v2/src/semantic-query/query-template-registry.service.ts',
      sourceSymbol: `QueryTemplateRegistryService.${template.id}.${metricKey}`,
      payload: {
        sourceModels: [...template.sourceModels],
        dimensions: [...template.defaultDimensions],
        bindings: {
          template: [`template:${template.id}`],
          capability: (template.capabilityIds ?? []).map((capability) => `capability:${capability}`),
        },
      },
      evidence: {
        title: template.title,
        supportedOutputShapes: template.supportedOutputShapes,
        ...(template.defaultOrderBy ? { defaultOrderBy: template.defaultOrderBy } : {}),
      },
    })),
  );
}

function discoverMetricSqlKeys(sources: BrainMetricCandidateSourceFile[]): string[] {
  const keys = new Set<string>();
  for (const source of sources) {
    if (!isTrustedSourcePath(source.path, TRUSTED_LEGACY_BINDING_PATHS)) continue;
    const file = createTypeScriptSourceFile(source.path, source.content);
    if (hasTypeScriptParseErrors(file)) continue;
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'METRIC_SQL' &&
        isTopLevelVariableDeclaration(node) &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer) &&
        !hasDynamicObjectMembers(node.initializer)
      ) {
        for (const property of node.initializer.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) continue;
          if (hasDynamicObjectMembers(property.initializer)) continue;
          const key = staticPropertyName(property.name);
          if (key) keys.add(key);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...keys];
}

function observeWorkspaceMetricLanguageEvidence(
  sources: BrainMetricCandidateSourceFile[],
  knownMetricKeys: ReadonlySet<string>,
): BrainMetricSourceObservation[] {
  const observations: BrainMetricSourceObservation[] = [];
  for (const source of sources) {
    observations.push(
      ...observeLanguageEvidence(createTypeScriptSourceFile(source.path, source.content), source.path, knownMetricKeys),
    );
  }
  return observations;
}

function discoverStaticMetricMetadataKeys(sources: BrainMetricCandidateSourceFile[]): string[] {
  const keys = new Set<string>();
  for (const source of sources) {
    const file = createTypeScriptSourceFile(source.path, source.content);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const metadata = staticMetricMetadata(node, source.path, true);
        if (metadata) keys.add(metadata.metricKey);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...keys];
}

function observeMetricBindings(
  file: ts.SourceFile,
  sourcePath: string,
  knownMetricKeys: ReadonlySet<string>,
): BrainMetricSourceObservation[] {
  const observations: BrainMetricSourceObservation[] = [];
  if (!isTrustedSourcePath(sourcePath, TRUSTED_LEGACY_BINDING_PATHS)) return observations;
  if (hasTypeScriptParseErrors(file)) return observations;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'METRIC_SQL' &&
      isTopLevelVariableDeclaration(node) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      if (hasDynamicObjectMembers(node.initializer)) return;
      for (const property of node.initializer.properties) {
        const metricKey = staticPropertyName(property.name);
        if (!metricKey || !knownMetricKeys.has(metricKey) || !ts.isPropertyAssignment(property)) continue;
        if (!ts.isObjectLiteralExpression(property.initializer)) continue;
        if (hasDynamicObjectMembers(property.initializer)) continue;
        const permission = staticStringProperty(property.initializer, 'requiredPermission');
        const queryKey = staticStringProperty(property.initializer, 'queryKey');
        const outputField = staticStringProperty(property.initializer, 'valueField');
        if (!permission || !queryKey || !outputField) continue;
        const dateField = staticStringProperty(property.initializer, 'dateColumn');
        const sqlPreview = staticStringProperty(property.initializer, 'sqlPreview');
        const label = staticStringProperty(property.initializer, 'label');
        observations.push({
          metricKey,
          sourceKind: 'legacy_metric_binding',
          authority: 'metric_template_declaration',
          sourcePath,
          sourceSymbol: `METRIC_SQL.${metricKey}`,
          binding: {
            queryKey,
            outputField,
            permissionAllOf: [permission],
            ...(dateField ? { dateField } : {}),
          },
          blockedReasons: sqlPreview ? ['opaque_sql_formula'] : ['missing_executable_formula'],
          evidence: {
            queryKey,
            outputField,
            permission,
            ...(dateField ? { dateField } : {}),
            ...(sqlPreview ? { opaqueSql: true } : {}),
          },
        });
        if (label) {
          observations.push({
            metricKey,
            sourceKind: 'language_evidence',
            authority: 'language_evidence',
            sourcePath,
            sourceSymbol: `METRIC_SQL.${metricKey}.label`,
            aliases: [label],
            evidence: { label },
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return observations;
}

function observeExecutorBindings(
  file: ts.SourceFile,
  sourcePath: string,
  knownMetricKeys: ReadonlySet<string>,
): BrainMetricSourceObservation[] {
  const observations: BrainMetricSourceObservation[] = [];
  if (!isTrustedSourcePath(sourcePath, TRUSTED_EXECUTOR_PATHS)) return observations;
  if (hasTypeScriptParseErrors(file)) return observations;
  const visit = (node: ts.Node) => {
    if (ts.isSwitchStatement(node) && isAllowedQueryKeyAccess(node.expression, node)) {
      for (const clause of node.caseBlock.clauses) {
        if (!ts.isCaseClause(clause) || !ts.isStringLiteralLike(clause.expression)) continue;
        const metricKey = clause.expression.text;
        if (!knownMetricKeys.has(metricKey)) continue;
        const executorMethod = findReturnedMethodCall(clause);
        if (!executorMethod) continue;
        observations.push({
          metricKey,
          sourceKind: 'verified_executable_binding',
          authority: 'verified_executable_binding',
          sourcePath,
          sourceSymbol: executorMethod,
          binding: { queryKey: metricKey, executorRef: `${portableBasename(sourcePath)}#${executorMethod}` },
          evidence: { switchCase: metricKey, executorMethod },
        });
      }
    }
    if (ts.isIfStatement(node)) {
      const executorMethod = findReturnedMethodInStatement(node.thenStatement);
      const metricKey = strictQueryKeyEqualityMetric(node.expression, node, knownMetricKeys);
      if (executorMethod && metricKey) {
        observations.push({
          metricKey,
          sourceKind: 'verified_executable_binding',
          authority: 'verified_executable_binding',
          sourcePath,
          sourceSymbol: executorMethod,
          binding: {
            queryKey: metricKey,
            executorRef: `${portableBasename(sourcePath)}#${executorMethod}`,
          },
          evidence: { ifDispatch: metricKey, executorMethod },
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return observations;
}

function observeLanguageEvidence(
  file: ts.SourceFile,
  sourcePath: string,
  knownMetricKeys: ReadonlySet<string>,
): BrainMetricSourceObservation[] {
  const observations: BrainMetricSourceObservation[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const metadata = staticMetricMetadata(node, sourcePath, false);
      if (metadata && knownMetricKeys.has(metadata.metricKey)) {
        observations.push({
          metricKey: metadata.metricKey,
          sourceKind: 'language_evidence',
          authority: 'language_evidence',
          sourcePath,
          sourceSymbol: enclosingSymbol(node, metadata.metricKey, metadata.label),
          aliases: [metadata.label],
          evidence: {
            ...(metadata.sourceType ? { sourceType: metadata.sourceType } : {}),
            label: metadata.label,
            ...(metadata.description ? { description: metadata.description } : {}),
          },
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return observations;
}

function staticMetricMetadata(
  node: ts.ObjectLiteralExpression,
  sourcePath: string,
  requireWorkspaceSource: boolean,
): StaticMetricMetadata | undefined {
  if (hasDynamicObjectMembers(node)) return undefined;
  const sourceType = workspaceMetricEvidenceSourceType(sourcePath);
  if (requireWorkspaceSource && !sourceType) return undefined;
  const explicitMetricKey = staticStringProperty(node, 'metricKey');
  const definitionMetricKey = metricKeyFromDefinitionKey(staticStringProperty(node, 'definitionKey'));
  const genericKey = staticStringProperty(node, 'key');
  const metricKey =
    explicitMetricKey ?? definitionMetricKey ?? (isMetricMetadataCollectionObject(node) ? genericKey : undefined);
  const label =
    staticStringProperty(node, 'title') ?? staticStringProperty(node, 'name') ?? staticStringProperty(node, 'label');
  if (!metricKey || !label) return undefined;
  return {
    metricKey,
    label,
    description: staticStringProperty(node, 'description'),
    sourceType,
  };
}

function metricKeyFromDefinitionKey(value: string | undefined): string | undefined {
  if (!value?.startsWith('metric.')) return undefined;
  const metricKey = value.slice('metric.'.length);
  return metricKey.length > 0 ? metricKey : undefined;
}

function isMetricMetadataCollectionObject(node: ts.ObjectLiteralExpression): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isPropertyAssignment(current)) {
      const name = staticPropertyName(current.name);
      if (name && isMetricMetadataCollectionName(name)) return true;
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return isMetricMetadataCollectionName(current.name.text);
    }
    current = current.parent;
  }
  return false;
}

function isMetricMetadataCollectionName(value: string): boolean {
  const normalized = value.toLowerCase();
  return ['card', 'kpi', 'metric', 'report'].some((hint) => normalized.includes(hint));
}

function isTrustedSourcePath(sourcePath: string, trustedPaths: ReadonlySet<string>): boolean {
  return trustedPaths.has(normalizeMetricSourcePath(sourcePath));
}

export function isTrustedMetricBindingSourcePath(sourcePath: string): boolean {
  return isTrustedSourcePath(sourcePath, TRUSTED_LEGACY_BINDING_PATHS);
}

export function isTrustedMetricExecutorSourcePath(sourcePath: string): boolean {
  return isTrustedSourcePath(sourcePath, TRUSTED_EXECUTOR_PATHS);
}

function findReturnedMethodCall(clause: ts.CaseClause): string | undefined {
  if (clause.statements.length !== 1 || !ts.isReturnStatement(clause.statements[0])) return undefined;
  return returnedThisMethodCall(clause.statements[0].expression);
}

function findReturnedMethodInStatement(statement: ts.Statement): string | undefined {
  if (ts.isBlock(statement)) {
    if (statement.statements.length !== 1) return undefined;
    return findReturnedMethodInStatement(statement.statements[0]);
  }
  return ts.isReturnStatement(statement) ? returnedThisMethodCall(statement.expression) : undefined;
}

function returnedThisMethodCall(expression: ts.Expression | undefined): string | undefined {
  if (!expression || !ts.isCallExpression(expression)) return undefined;
  const called = expression.expression;
  if (ts.isPropertyAccessExpression(called) && called.expression.kind === ts.SyntaxKind.ThisKeyword) {
    return called.name.text;
  }
  return undefined;
}

function strictQueryKeyEqualityMetric(
  expression: ts.Expression,
  context: ts.Node,
  knownMetricKeys: ReadonlySet<string>,
): string | undefined {
  const unwrapped = unwrapParentheses(expression);
  if (!ts.isBinaryExpression(unwrapped) || unwrapped.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return undefined;
  }
  return (
    queryKeyEqualityMetric(unwrapped.left, unwrapped.right, context, knownMetricKeys) ??
    queryKeyEqualityMetric(unwrapped.right, unwrapped.left, context, knownMetricKeys)
  );
}

function queryKeyEqualityMetric(
  queryKeyExpression: ts.Expression,
  metricExpression: ts.Expression,
  context: ts.Node,
  knownMetricKeys: ReadonlySet<string>,
): string | undefined {
  const metric = unwrapParentheses(metricExpression);
  if (!isAllowedQueryKeyAccess(queryKeyExpression, context) || !ts.isStringLiteralLike(metric)) return undefined;
  return knownMetricKeys.has(metric.text) ? metric.text : undefined;
}

function isAllowedQueryKeyAccess(expression: ts.Expression, context: ts.Node): boolean {
  const unwrapped = unwrapParentheses(expression);
  const owner = ts.isPropertyAccessExpression(unwrapped)
    ? unwrapped.name.text === 'queryKey' && ts.isIdentifier(unwrapped.expression)
      ? unwrapped.expression
      : undefined
    : ts.isElementAccessExpression(unwrapped) &&
        unwrapped.argumentExpression &&
        ts.isStringLiteralLike(unwrapped.argumentExpression) &&
        unwrapped.argumentExpression.text === 'queryKey' &&
        ts.isIdentifier(unwrapped.expression)
      ? unwrapped.expression
      : undefined;
  if (!owner) return false;
  const method = enclosingMethodDeclaration(context);
  if (!method || !isExecutorEntryMethod(method)) return false;
  return Boolean(
    method.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === owner.text),
  );
}

function isExecutorEntryMethod(method: ts.MethodDeclaration): boolean {
  const methodName = staticPropertyName(method.name);
  return Boolean(methodName && (methodName === 'execute' || methodName.startsWith('execute')));
}

function enclosingMethodDeclaration(node: ts.Node): ts.MethodDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isMethodDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function hasTypeScriptParseErrors(file: ts.SourceFile): boolean {
  return Boolean((file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length);
}

function isTopLevelVariableDeclaration(node: ts.VariableDeclaration): boolean {
  const declarationList = node.parent;
  const statement = declarationList?.parent;
  return (
    ts.isVariableDeclarationList(declarationList) &&
    ts.isVariableStatement(statement) &&
    ts.isSourceFile(statement.parent)
  );
}

function staticStringProperty(object: ts.ObjectLiteralExpression, name: string): string | undefined {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || staticPropertyName(property.name) !== name) continue;
    return ts.isStringLiteralLike(property.initializer) ? property.initializer.text : undefined;
  }
  return undefined;
}

function hasDynamicObjectMembers(object: ts.ObjectLiteralExpression): boolean {
  const propertyNames = new Set<string>();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) return true;
    const propertyName = staticPropertyName(property.name);
    if (propertyName === undefined || propertyNames.has(propertyName)) return true;
    propertyNames.add(propertyName);
  }
  return false;
}

function staticPropertyName(name: ts.PropertyName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function enclosingSymbol(node: ts.Node, metricKey: string, label: string): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return `variable:${current.name.text}:${metricKey}:${label}`;
    }
    if (ts.isPropertyAssignment(current)) {
      const propertyName = staticPropertyName(current.name);
      if (propertyName) return `property:${propertyName}:${metricKey}:${label}`;
    }
    current = current.parent;
  }
  return `metric:${metricKey}:${label}`;
}

function portableBasename(value: string): string {
  return basename(value.replace(/\\/g, '/'));
}

function normalizeFingerprintValue(value: unknown, parentKey?: string): unknown {
  if (parentKey === 'executorRef' && typeof value === 'string') {
    return value.includes('#') ? value.slice(value.lastIndexOf('#') + 1) : value;
  }
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeFingerprintValue(item));
    if (!isSetLikeKey(parentKey)) return normalized;
    const unique = new Map(normalized.map((item) => [canonicalizeBusinessDefinition(item), item]));
    return [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, item]) => item);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, normalizeFingerprintValue(nested, key)]),
    );
  }
  return value;
}

function isSetLikeKey(key?: string): boolean {
  return Boolean(
    key &&
    [
      'sourceModels',
      'dimensions',
      'filters',
      'permissionPolicies',
      'permissionAllOf',
      'allOf',
      'aliases',
      'blockedReasons',
      'template',
      'capability',
      'executor',
      'outputField',
    ].includes(key),
  );
}

function validPublishedMetricDefinition(value: unknown): boolean {
  try {
    if (!isRecord(value) || value.kind !== 'metric') return false;
    if (!positiveInteger(value.definitionId) || !positiveInteger(value.versionId) || !positiveInteger(value.version)) {
      return false;
    }
    for (const key of ['definitionKey', 'domain', 'name', 'ownerType', 'schemaVersion', 'timezone'] as const) {
      if (!nonEmpty(value[key])) return false;
    }
    if (!hexFingerprint(value.fingerprint) || !hexFingerprint(value.sourceFingerprint)) return false;
    if (!nonEmpty(value.canonicalQueryRef) || !nonEmpty(value.fixtureSetKey)) return false;
    const evidence = normalizePublishedEvidence(value.evidence);
    if (!evidence.length) return false;
    if (createBusinessDefinitionSourceFingerprint(evidence) !== value.sourceFingerprint) return false;
    const expectedFingerprint = createBusinessDefinitionFingerprint({
      definitionKey: value.definitionKey,
      kind: value.kind,
      domain: value.domain,
      name: value.name,
      ownerType: value.ownerType,
      ownerId: value.ownerId ?? null,
      schemaVersion: value.schemaVersion,
      payload: value.payload,
      sourceFingerprint: value.sourceFingerprint,
      canonicalQueryRef: value.canonicalQueryRef ?? null,
      fixtureSetKey: value.fixtureSetKey ?? null,
      timezone: value.timezone,
      storeScope: value.storeScope,
    });
    if (expectedFingerprint !== value.fingerprint) return false;
    if (!Array.isArray(value.projections) || !value.projections.length) return false;
    if (
      !value.projections.some((projection) => isRecord(projection) && projection.targetType === 'metric_query_view')
    ) {
      return false;
    }
    return value.projections.every((projection) => validPublishedProjection(value, projection));
  } catch {
    return false;
  }
}

export function validatePublishedMetricDefinitionSnapshot(value: unknown): boolean {
  return validPublishedMetricDefinition(value);
}

function normalizePublishedEvidence(value: unknown): NormalizedBusinessDefinitionEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('invalid evidence');
    const normalized: NormalizedBusinessDefinitionEvidence = {
      sourceType: requiredText(item.sourceType).toLowerCase(),
      sourcePath: requiredText(item.sourcePath).replace(/\\/g, '/').replace(/^\.\//, ''),
      sourceSymbol: optionalText(item.sourceSymbol),
      lineStart: optionalPositiveInteger(item.lineStart),
      lineEnd: optionalPositiveInteger(item.lineEnd),
      evidenceKind: requiredText(item.evidenceKind).toLowerCase(),
      confidence: finiteConfidence(item.confidence),
      conflictGroup: optionalText(item.conflictGroup),
    };
    if (item.evidenceFingerprint !== createBusinessDefinitionEvidenceFingerprint(normalized)) {
      throw new Error('invalid evidence fingerprint');
    }
    return normalized;
  });
}

function validPublishedProjection(definition: Record<string, unknown>, value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.payload)) return false;
  if (
    value.definitionVersionId !== definition.versionId ||
    value.definitionKey !== definition.definitionKey ||
    value.definitionVersion !== definition.version ||
    value.definitionFingerprint !== definition.fingerprint ||
    value.sourceFingerprint !== definition.sourceFingerprint ||
    value.targetKey !== `${String(definition.definitionKey)}@${String(definition.version)}` ||
    value.readOnly !== true ||
    !hexFingerprint(value.projectionFingerprint)
  ) {
    return false;
  }
  const definitionRef = {
    definitionKey: definition.definitionKey,
    definitionVersion: definition.version,
    definitionFingerprint: definition.fingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
  const payload = value.payload;
  if (isBusinessDefinitionProjectionV2Payload(payload)) {
    if (!BUSINESS_DEFINITION_PROJECTION_TYPES.includes(value.targetType as BusinessDefinitionProjectionTypeValue)) {
      return false;
    }
    const expectedPayload = createBusinessDefinitionProjectionV2Payload(
      {
        id: Number(definition.versionId),
        definitionId: Number(definition.definitionId),
        version: Number(definition.version),
        schemaVersion: String(definition.schemaVersion),
        payload: definition.payload,
        lifecycleStatus: 'published',
        fingerprint: String(definition.fingerprint),
        sourceFingerprint: String(definition.sourceFingerprint),
        validationStatus: 'passed',
        validationReport: definition.validationReport ?? null,
        canonicalQueryRef: optionalText(definition.canonicalQueryRef),
        fixtureSetKey: optionalText(definition.fixtureSetKey),
        timezone: String(definition.timezone),
        storeScope: definition.storeScope,
        definition: {
          id: Number(definition.definitionId),
          definitionKey: String(definition.definitionKey),
          kind: String(definition.kind),
          domain: String(definition.domain),
          name: String(definition.name),
          ownerType: String(definition.ownerType),
          ownerId: optionalText(definition.ownerId),
        },
        evidence: Array.isArray(definition.evidence) ? definition.evidence : [],
      },
      value.targetType as BusinessDefinitionProjectionTypeValue,
      false,
    );
    if (canonicalizeBusinessDefinition(payload) !== canonicalizeBusinessDefinition(expectedPayload)) return false;
    return (
      createBusinessDefinitionProjectionFingerprint({
        targetType: value.targetType,
        targetKey: value.targetKey,
        definitionVersionId: value.definitionVersionId,
        definitionRef,
        payload,
        readOnly: true,
      }) === value.projectionFingerprint
    );
  }
  if (
    payload.preview !== false ||
    payload.projectionType !== value.targetType ||
    canonicalizeBusinessDefinition(payload.definitionRef) !== canonicalizeBusinessDefinition(definitionRef) ||
    payload.kind !== definition.kind ||
    payload.domain !== definition.domain ||
    payload.name !== definition.name ||
    payload.schemaVersion !== definition.schemaVersion ||
    payload.timezone !== definition.timezone ||
    canonicalizeBusinessDefinition(payload.storeScope) !== canonicalizeBusinessDefinition(definition.storeScope) ||
    (payload.canonicalQueryRef ?? null) !== (definition.canonicalQueryRef ?? null) ||
    (payload.fixtureSetKey ?? null) !== (definition.fixtureSetKey ?? null) ||
    canonicalizeBusinessDefinition(payload.definition) !== canonicalizeBusinessDefinition(definition.payload)
  ) {
    return false;
  }
  return (
    createBusinessDefinitionProjectionFingerprint({
      targetType: value.targetType,
      targetKey: value.targetKey,
      definitionVersionId: value.definitionVersionId,
      definitionRef,
      payload,
      readOnly: true,
    }) === value.projectionFingerprint
  );
}

function positiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}

function hexFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredText(value: unknown): string {
  if (!nonEmpty(value)) throw new Error('text required');
  return value.trim();
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value);
}

function optionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!positiveInteger(value)) throw new Error('positive integer required');
  return Number(value);
}

function finiteConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error('invalid confidence');
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
