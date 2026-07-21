import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { appendFile, mkdir, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import * as metricSourceAdapterModule from './brain-metric-source-adapters.js';
import {
  BrainMetricPublishedDefinitionSourceService,
  BrainMetricSourceAdapters,
  createMetricObservationFingerprint,
  resolveMetricCandidateScanOutputPath,
  validatePublishedMetricDefinitionSnapshot,
} from './brain-metric-source-adapters.js';
import {
  BusinessDefinitionProjectionCompilerService,
  canonicalizeBusinessDefinition,
} from './business-definition-projection-compiler.service.js';
import {
  createBusinessDefinitionEvidenceFingerprint,
  createBusinessDefinitionFingerprint,
  createBusinessDefinitionSourceFingerprint,
} from './business-definition-registry.service.js';
import { BrainMetricCandidateGeneratorService } from './brain-metric-candidate-generator.service.js';
import type { BrainMetricSourceObservation } from './brain-metric-candidate.types.js';

describe('BrainMetricSourceAdapters', () => {
  const temporaryWorkspaces: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryWorkspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true, maxRetries: 3 })),
    );
  });

  it('scans report services and admin metric cards as language-only evidence for newly discovered metric keys', async () => {
    const workspaceRoot = await createMetricScanWorkspace({
      'packages/server-v2/src/analytics/manager-overview.service.ts': `
        export const reportMetrics = [
          {
            key: 'new_customer_net_rate',
            name: '新客净增率',
            description: 'SELECT count(*) / 任意自然语言公式',
            requiredPermission: 'core:finance:view',
          },
        ];
        export const opaqueSql = 'select count(*) from Customer';
      `,
      'src/app/pages/CustomerMetricCards.tsx': `
        export const cards = [
          {
            metricKey: 'return_visit_rate',
            title: '复访率',
            description: 'sum(CustomerVisit.returned) / total',
            permission: 'core:customer:view',
            formula: 'forged_formula',
          },
        ];
      `,
    });

    const result = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
    });
    const reportObservation = result.observations.find(
      (observation) => observation.metricKey === 'new_customer_net_rate',
    );
    const cardObservation = result.observations.find((observation) => observation.metricKey === 'return_visit_rate');

    expect(reportObservation).toEqual(
      expect.objectContaining({
        sourceKind: 'language_evidence',
        authority: 'language_evidence',
        sourcePath: 'packages/server-v2/src/analytics/manager-overview.service.ts',
        aliases: ['新客净增率'],
        evidence: expect.objectContaining({
          sourceType: 'report_service',
          label: '新客净增率',
          description: 'SELECT count(*) / 任意自然语言公式',
        }),
      }),
    );
    expect(cardObservation).toEqual(
      expect.objectContaining({
        sourceKind: 'language_evidence',
        authority: 'language_evidence',
        sourcePath: 'src/app/pages/CustomerMetricCards.tsx',
        aliases: ['复访率'],
        evidence: expect.objectContaining({
          sourceType: 'metric_card',
          label: '复访率',
          description: 'sum(CustomerVisit.returned) / total',
        }),
      }),
    );
    for (const observation of [reportObservation, cardObservation]) {
      expect(observation?.payload).toBeUndefined();
      expect(observation?.payload?.measure).toBeUndefined();
      expect(observation).not.toHaveProperty('binding');
      expect(observation?.evidence).not.toHaveProperty('permission');
      expect(observation?.evidence).not.toHaveProperty('formula');
    }
  });

  it('emits metric candidates that can be canonicalized as a complete scan payload', async () => {
    const workspaceRoot = await createMetricScanWorkspace({
      'src/app/pages/CustomerMetricCards.tsx': `
        export const cards = [
          {
            metricKey: 'return_visit_rate',
            title: '复访率',
          },
        ];
      `,
    });

    const scan = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
    });
    const candidates = new BrainMetricCandidateGeneratorService().generate(scan).candidates;

    expect(() => canonicalizeBusinessDefinition(candidates)).not.toThrow();
  });

  it('skips excluded or missing optional metric evidence roots', async () => {
    const workspaceRoot = await createMetricScanWorkspace({
      'packages/server-v2/src/report/small-report.service.ts': `
        export const metric = { metricKey: 'bounded_metric', title: '受控指标' };
      `,
      'packages/server-v2/src/report/ignored-report.service.spec.ts': `
        export const metric = { metricKey: 'spec_metric', title: '测试指标' };
      `,
      'packages/server-v2/src/report/generated/generated-report.service.ts': `
        export const metric = { metricKey: 'generated_metric', title: '生成指标' };
      `,
      'packages/server-v2/src/report/dist/built-report.service.ts': `
        export const metric = { metricKey: 'dist_metric', title: '构建指标' };
      `,
    });

    const result = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
    });
    const metricKeys = new Set(result.observations.map((observation) => observation.metricKey));

    expect(metricKeys).toContain('bounded_metric');
    expect(metricKeys).not.toContain('spec_metric');
    expect(metricKeys).not.toContain('generated_metric');
    expect(metricKeys).not.toContain('dist_metric');
  });

  it('fails closed when a metric evidence file exceeds maxFileBytes', async () => {
    const workspaceRoot = await createMetricScanWorkspace({
      'packages/server-v2/src/report/oversized-report.service.ts': `
        export const padding = '${'x'.repeat(300_000)}';
        export const metric = { metricKey: 'oversized_metric', title: '超大指标' };
      `,
    });

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_evidence_file_bytes_limit_exceeded');
  });

  it('resolves output and trusted source boundaries through symlinks or junctions', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'brain-metric-realpath-workspace-'));
    const outsideRoot = await mkdtemp(join(tmpdir(), 'brain-metric-realpath-outside-'));
    temporaryWorkspaces.push(workspaceRoot, outsideRoot);
    const workspaceLink = join(outsideRoot, 'workspace-link');
    if (!(await createDirectoryLink(workspaceRoot, workspaceLink))) return;

    expect(() => resolveMetricCandidateScanOutputPath(workspaceRoot, join(workspaceLink, 'scan.json'))).toThrow(
      'metric_candidate_scan_workspace_output_forbidden',
    );

    const linkedWorkspace = await createMetricScanWorkspace({});
    const externalSemanticRoot = await mkdtemp(join(tmpdir(), 'brain-metric-trusted-outside-'));
    temporaryWorkspaces.push(externalSemanticRoot);
    await writeFile(
      join(externalSemanticRoot, 'brain-query-compiler.service.ts'),
      'export const outside = true;',
      'utf8',
    );
    await writeFile(
      join(externalSemanticRoot, 'brain-readonly-query-executor.service.ts'),
      'export const outsideExecutor = true;',
      'utf8',
    );
    const trustedDirectory = resolve(linkedWorkspace, 'packages/server-v2/src/brain/semantic');
    await rm(trustedDirectory, { recursive: true, force: true });
    if (!(await createDirectoryLink(externalSemanticRoot, trustedDirectory))) return;

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot: linkedWorkspace,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_trusted_source_outside_workspace');
  });

  it('fails closed when a workspace language evidence root resolves outside the workspace', async () => {
    const workspaceRoot = await createMetricScanWorkspace({});
    const externalPagesRoot = await mkdtemp(join(tmpdir(), 'brain-metric-pages-outside-'));
    temporaryWorkspaces.push(externalPagesRoot);
    await writeFile(
      join(externalPagesRoot, 'ExternalMetricCards.tsx'),
      `export const metricCards = [{ metricKey: 'external_metric', title: '外部指标' }];`,
      'utf8',
    );
    const pagesRoot = resolve(workspaceRoot, 'src/app/pages');
    await mkdir(dirname(pagesRoot), { recursive: true });
    if (!(await createDirectoryLink(externalPagesRoot, pagesRoot))) return;

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_evidence_source_outside_workspace');
  });

  it('fails closed when a final language evidence file is an external symlink', async () => {
    const workspaceRoot = await createMetricScanWorkspace({});
    const pagesRoot = resolve(workspaceRoot, 'src/app/pages');
    await mkdir(pagesRoot, { recursive: true });
    const externalRoot = await mkdtemp(join(tmpdir(), 'brain-metric-file-outside-'));
    temporaryWorkspaces.push(externalRoot);
    const externalFile = join(externalRoot, 'ExternalMetricCards.tsx');
    await writeFile(
      externalFile,
      `export const metricCards = [{ metricKey: 'external_file_metric', title: '外部文件指标' }];`,
      'utf8',
    );
    if (!(await createFileLink(externalFile, join(pagesRoot, 'LinkedMetricCards.tsx')))) return;

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_evidence_source_outside_workspace');
  });

  it('treats workspace children whose segment starts with two dots as contained', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'brain-metric-dot-segment-'));
    temporaryWorkspaces.push(workspaceRoot);
    const dotPrefixedChild = join(workspaceRoot, '..inside');
    await mkdir(dotPrefixedChild, { recursive: true });

    expect(() => resolveMetricCandidateScanOutputPath(workspaceRoot, join(dotPrefixedChild, 'scan.json'))).toThrow(
      'metric_candidate_scan_workspace_output_forbidden',
    );
  });

  it('realpath-checks and bounds schema.prisma reads', async () => {
    const linkedWorkspace = await createMetricScanWorkspace({});
    const externalPrismaRoot = await mkdtemp(join(tmpdir(), 'brain-metric-schema-outside-'));
    temporaryWorkspaces.push(externalPrismaRoot);
    await writeFile(join(externalPrismaRoot, 'schema.prisma'), 'model Outside {\n  id Int @id\n}', 'utf8');
    const prismaDirectory = resolve(linkedWorkspace, 'packages/server-v2/prisma');
    await rm(prismaDirectory, { recursive: true, force: true });
    if (!(await createDirectoryLink(externalPrismaRoot, prismaDirectory))) return;

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot: linkedWorkspace,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_schema_source_outside_workspace');

    const oversizedWorkspace = await createMetricScanWorkspace({
      'packages/server-v2/prisma/schema.prisma': `// ${'x'.repeat(300_000)}\nmodel Store {\n  id Int @id\n}`,
    });
    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot: oversizedWorkspace,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_schema_source_too_large');
  });

  it('normalizes and verifies trusted source paths directly instead of relying on fingerprint path omission', () => {
    const module = metricSourceAdapterModule as unknown as Record<string, unknown>;
    const normalizeMetricSourcePath = module.normalizeMetricSourcePath as ((value: string) => string) | undefined;
    const isTrustedMetricBindingSourcePath = module.isTrustedMetricBindingSourcePath as
      | ((value: string) => boolean)
      | undefined;
    const isTrustedMetricExecutorSourcePath = module.isTrustedMetricExecutorSourcePath as
      | ((value: string) => boolean)
      | undefined;

    expect(normalizeMetricSourcePath).toEqual(expect.any(Function));
    expect(isTrustedMetricBindingSourcePath).toEqual(expect.any(Function));
    expect(isTrustedMetricExecutorSourcePath).toEqual(expect.any(Function));
    if (!normalizeMetricSourcePath || !isTrustedMetricBindingSourcePath || !isTrustedMetricExecutorSourcePath) return;

    expect(normalizeMetricSourcePath('.\\packages\\server-v2\\src\\brain\\semantic\\brain-query-compiler.ts')).toBe(
      'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
    );
    expect(
      isTrustedMetricBindingSourcePath('packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts'),
    ).toBe(true);
    expect(isTrustedMetricBindingSourcePath('packages/server-v2/src/report/brain-query-compiler.service.ts')).toBe(
      false,
    );
    expect(
      isTrustedMetricExecutorSourcePath(
        'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts',
      ),
    ).toBe(true);
    expect(
      isTrustedMetricExecutorSourcePath('packages/server-v2/src/report/brain-readonly-query-executor.service.ts'),
    ).toBe(false);
  });

  it('streams directory entries under a total budget', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'brain-metric-entry-budget-'));
    temporaryWorkspaces.push(workspaceRoot);
    const reportRoot = resolve(workspaceRoot, 'packages/server-v2/src/report');
    await mkdir(reportRoot, { recursive: true });
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        writeFile(
          join(reportRoot, `budget-${String(index).padStart(2, '0')}-report.service.ts`),
          `export const metrics = [{ metricKey: 'entry_budget_${index}', title: '条目 ${index}' }];`,
          'utf8',
        ),
      ),
    );
    const collectWorkspaceMetricEvidenceSources = (metricSourceAdapterModule as unknown as Record<string, unknown>)
      .collectWorkspaceMetricEvidenceSources as
      | ((root: string, limits?: { maxEntries?: number }) => Promise<Array<{ path: string; content: string }>>)
      | undefined;

    expect(collectWorkspaceMetricEvidenceSources).toEqual(expect.any(Function));
    if (!collectWorkspaceMetricEvidenceSources) return;
    await expect(collectWorkspaceMetricEvidenceSources(workspaceRoot, { maxEntries: 5 })).rejects.toThrow(
      'metric_evidence_entry_limit_exceeded',
    );
  });

  it('fails with the same entry budget error for different creation orders', async () => {
    const paths = Array.from(
      { length: 6 },
      (_, index) => `packages/server-v2/src/report/budget-${index}-report.service.ts`,
    );
    const firstWorkspace = await mkdtemp(join(tmpdir(), 'brain-metric-budget-order-a-'));
    const secondWorkspace = await mkdtemp(join(tmpdir(), 'brain-metric-budget-order-b-'));
    temporaryWorkspaces.push(firstWorkspace, secondWorkspace);
    await writeMetricFilesInOrder(firstWorkspace, paths);
    await writeMetricFilesInOrder(secondWorkspace, [...paths].reverse());

    for (const workspaceRoot of [firstWorkspace, secondWorkspace]) {
      await expect(
        metricSourceAdapterModule.collectWorkspaceMetricEvidenceSources(workspaceRoot, { maxEntries: 5 } as never),
      ).rejects.toThrow('metric_evidence_entry_limit_exceeded');
    }
  });

  it.each([
    ['file', { maxFiles: 1 }, 'metric_evidence_file_limit_exceeded'],
    ['byte', { maxTotalBytes: 40 }, 'metric_evidence_byte_limit_exceeded'],
  ])('fails closed when the global %s budget is exceeded', async (_name, limits, errorCode) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `brain-metric-${_name}-budget-`));
    temporaryWorkspaces.push(workspaceRoot);
    const reportRoot = resolve(workspaceRoot, 'packages/server-v2/src/report');
    await mkdir(reportRoot, { recursive: true });
    await writeFile(
      join(reportRoot, 'alpha-report.service.ts'),
      `export const metrics = [{ metricKey: 'budget_alpha', title: '预算 Alpha' }];`,
      'utf8',
    );
    await writeFile(
      join(reportRoot, 'beta-report.service.ts'),
      `export const metrics = [{ metricKey: 'budget_beta', title: '预算 Beta' }];`,
      'utf8',
    );

    await expect(
      metricSourceAdapterModule.collectWorkspaceMetricEvidenceSources(workspaceRoot, limits as never),
    ).rejects.toThrow(errorCode);
  });

  it('produces deterministic workspace observations across different file creation orders', async () => {
    const paths = [
      'packages/server-v2/src/report/zeta-report.service.ts',
      'packages/server-v2/src/report/alpha-report.service.ts',
      'packages/server-v2/src/report/middle-report.service.ts',
    ];
    const firstWorkspace = await createMetricScanWorkspace({});
    const secondWorkspace = await createMetricScanWorkspace({});
    await writeMetricFilesInOrder(firstWorkspace, paths);
    await writeMetricFilesInOrder(secondWorkspace, [...paths].reverse());

    const [firstScan, secondScan] = await Promise.all(
      [firstWorkspace, secondWorkspace].map((workspaceRoot) =>
        new BrainMetricSourceAdapters().scanWorkspace({
          workspaceRoot,
          publishedDefinitionSource: emptyPublishedDefinitionSource(),
        }),
      ),
    );
    const selectDeterministic = (observations: BrainMetricSourceObservation[]) =>
      observations
        .filter((observation) => observation.metricKey.startsWith('deterministic_'))
        .map((observation) => ({
          metricKey: observation.metricKey,
          sourcePath: observation.sourcePath,
          observationFingerprint: observation.observationFingerprint,
        }));
    const first = selectDeterministic(firstScan.observations);
    const second = selectDeterministic(secondScan.observations);
    const scanFingerprint = (observations: ReturnType<typeof selectDeterministic>) =>
      createHash('sha256').update(canonicalizeBusinessDefinition(observations)).digest('hex');

    expect(first).toEqual(second);
    expect(first.map((observation) => observation.sourcePath)).toEqual(
      [...first.map((observation) => observation.sourcePath)].sort(),
    );
    expect(scanFingerprint(first)).toBe(scanFingerprint(second));
  });

  it('rejects a file that grows beyond maxFileBytes after it is opened', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'brain-metric-bounded-read-'));
    temporaryWorkspaces.push(workspaceRoot);
    const sourcePath = join(workspaceRoot, 'growing-report.service.ts');
    await writeFile(sourcePath, '12345678', 'utf8');
    const file = await open(sourcePath, 'r');
    const readOpenedMetricSourceFileBounded = (metricSourceAdapterModule as unknown as Record<string, unknown>)
      .readOpenedMetricSourceFileBounded as
      | ((handle: Awaited<ReturnType<typeof open>>, maxBytes: number) => Promise<string | undefined>)
      | undefined;
    try {
      await appendFile(sourcePath, '9', 'utf8');
      expect(readOpenedMetricSourceFileBounded).toEqual(expect.any(Function));
      if (!readOpenedMetricSourceFileBounded) return;
      await expect(readOpenedMetricSourceFileBounded(file, 8)).resolves.toBeUndefined();
    } finally {
      await file.close();
    }
  });

  it('uses full trusted paths for authoritative bindings and keeps workspace metric sources language-only', async () => {
    const forgedSourcePath = 'packages/server-v2/src/report/brain-query-compiler.service.ts';
    const forgedSource = `
      const METRIC_SQL = {
        forged_workspace_metric: {
          requiredPermission: 'core:finance:view',
          queryKey: 'forged_workspace_metric',
          valueField: 'forged_workspace_metric',
        },
      };
      export const reportMetrics = [
        { metricKey: 'forged_workspace_metric', title: '伪造工作区指标' },
      ];
      class ForgedExecutor {
        execute(query) {
          switch (query.queryKey) {
            case 'forged_workspace_metric': return this.queryForgedMetric(query);
          }
        }
        queryForgedMetric() { return 1; }
      }
    `;
    const workspaceRoot = await createMetricScanWorkspace({ [forgedSourcePath]: forgedSource });

    const scan = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
    });
    const forgedObservations = scan.observations.filter(
      (observation) =>
        observation.metricKey === 'forged_workspace_metric' && observation.sourcePath === forgedSourcePath,
    );
    const directObservations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['forged_workspace_metric']),
      sources: [{ path: forgedSourcePath, content: forgedSource }],
    });

    expect(forgedObservations).toEqual([
      expect.objectContaining({
        metricKey: 'forged_workspace_metric',
        sourceKind: 'language_evidence',
        evidence: expect.objectContaining({ sourceType: 'report_service' }),
      }),
    ]);
    for (const observation of [...forgedObservations, ...directObservations]) {
      expect(observation.sourceKind).not.toMatch(/legacy_metric_binding|verified_executable_binding/);
    }
  });

  it('stops metric evidence traversal beyond the configured depth limit', async () => {
    const deepPath = Array.from({ length: 30 }, (_, index) => `level-${String(index).padStart(2, '0')}`).join('/');
    const workspaceRoot = await createMetricScanWorkspace({
      'packages/server-v2/src/report/shallow-report.service.ts': `
        export const metrics = [{ metricKey: 'shallow_depth_metric', title: '浅层指标' }];
      `,
      [`packages/server-v2/src/report/${deepPath}/deep-report.service.ts`]: `
        export const metrics = [{ metricKey: 'over_depth_metric', title: '超深指标' }];
      `,
    });

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_evidence_depth_limit_exceeded');
  });

  it('stops metric evidence traversal after the configured directory limit', async () => {
    const directoryFiles = Object.fromEntries(
      Array.from({ length: 520 }, (_, index) => [
        `packages/server-v2/src/report/dir-${String(index).padStart(3, '0')}/directory-report.service.ts`,
        `export const metrics = [{ metricKey: 'directory_limit_${index}', title: '目录指标 ${index}' }];`,
      ]),
    );
    const workspaceRoot = await createMetricScanWorkspace(directoryFiles);

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot,
        publishedDefinitionSource: emptyPublishedDefinitionSource(),
      }),
    ).rejects.toThrow('metric_evidence_directory_limit_exceeded');
  }, 15_000);

  it('supports definitionKey, prioritizes metricKey, and only accepts generic keys in metric collections', async () => {
    const workspaceRoot = await createMetricScanWorkspace({
      'packages/server-v2/src/report/metric-context-report.service.ts': `
        export const reportCards = [
          { definitionKey: 'metric.definition_key_metric', title: '定义键指标' },
          {
            metricKey: 'preferred_metric_key',
            definitionKey: 'metric.ignored_definition_key',
            key: 'ignored_generic_key',
            title: '显式指标键优先',
          },
          { key: 'context_report_metric', label: '报表集合指标' },
        ];
        export const ordinaryConfig = { key: 'ordinary_report_config', label: '普通报表配置' };
      `,
      'src/app/pages/MetricContextPage.tsx': `
        export const kpiCards = [{ key: 'context_card_metric', title: '卡片集合指标' }];
        export const ordinaryConfig = { key: 'ordinary_page_config', title: '普通页面配置' };
      `,
    });

    const scan = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
    });
    const metricKeys = new Set(scan.observations.map((observation) => observation.metricKey));

    expect(metricKeys).toContain('definition_key_metric');
    expect(metricKeys).toContain('preferred_metric_key');
    expect(metricKeys).toContain('context_report_metric');
    expect(metricKeys).toContain('context_card_metric');
    expect(metricKeys).not.toContain('ignored_definition_key');
    expect(metricKeys).not.toContain('ignored_generic_key');
    expect(metricKeys).not.toContain('ordinary_report_config');
    expect(metricKeys).not.toContain('ordinary_page_config');
  });

  it('feeds a newly discovered definitionKey metric into the candidate generator as blocked', async () => {
    const workspaceRoot = await createMetricScanWorkspace({
      'src/app/pages/CandidateMetricCards.tsx': `
        export const metricCards = [
          { definitionKey: 'metric.new_candidate_metric', title: '新候选指标' },
        ];
      `,
    });
    const scan = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
    });

    const result = new BrainMetricCandidateGeneratorService().generate(scan);
    const candidate = result.candidates.find((item) => item.metricKey === 'new_candidate_metric');

    expect(candidate).toEqual(
      expect.objectContaining({
        metricKey: 'new_candidate_metric',
        status: 'blocked',
        aliases: ['新候选指标'],
        blockedReasons: expect.arrayContaining(['incomplete_verified_formula']),
      }),
    );
  });

  it('accepts target-specific V2 metric projections from the shared registry snapshot', () => {
    const evidence = {
      sourceType: 'metric_registry',
      sourcePath: 'packages/server-v2/src/semantic-data/semantic-metric-registry.service.ts',
      sourceSymbol: 'paid_amount',
      lineStart: 1,
      lineEnd: 2,
      evidenceKind: 'metric_declaration',
      confidence: 1,
      conflictGroup: null,
    };
    const sourceFingerprint = createBusinessDefinitionSourceFingerprint([evidence]);
    const payload = {
      metricKey: 'paid_amount',
      aliases: ['实收金额'],
      measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
      sourceModels: ['PaymentRecord'],
      dimensions: [],
      filters: [],
      permissionPolicies: [{ bindingRef: 'capability:order_revenue', allOf: ['core:finance:view'] }],
      bindings: {
        capability: ['order_revenue_analysis'],
        executor: ['SemanticQueryExecutorService.execute'],
        outputField: ['paidAmount'],
      },
    };
    const immutable = {
      definitionKey: 'metric.paid_amount',
      kind: 'metric',
      domain: 'finance',
      name: '实收金额',
      ownerType: 'system',
      ownerId: 'semantic-data',
      schemaVersion: '1.0',
      payload,
      sourceFingerprint,
      canonicalQueryRef: 'semantic.paid_amount',
      fixtureSetKey: 'paid-amount-v1',
      timezone: 'Asia/Shanghai',
      storeScope: { mode: 'current_store' },
    };
    const fingerprint = createBusinessDefinitionFingerprint(immutable);
    const version = {
      id: 901,
      definitionId: 900,
      version: 1,
      ...immutable,
      lifecycleStatus: 'published',
      fingerprint,
      validationStatus: 'passed',
      evidence: [{ ...evidence, evidenceFingerprint: createBusinessDefinitionEvidenceFingerprint(evidence) }],
      definition: {
        id: 900,
        definitionKey: immutable.definitionKey,
        kind: immutable.kind,
        domain: immutable.domain,
        name: immutable.name,
        ownerType: immutable.ownerType,
        ownerId: immutable.ownerId,
      },
    };
    const projections = new BusinessDefinitionProjectionCompilerService().compilePublishedVersion(version);
    const snapshot = {
      definitionId: 900,
      versionId: 901,
      ...immutable,
      version: 1,
      fingerprint,
      evidence: version.evidence,
      projections,
    };

    expect(validatePublishedMetricDefinitionSnapshot(snapshot)).toBe(true);
  });

  it('extracts literal binding evidence from METRIC_SQL and keeps opaque SQL out of the formula', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            const METRIC_SQL = {
              paid_revenue: {
                requiredPermission: 'core:finance:view',
                queryKey: 'paid_revenue',
                valueField: 'paid_revenue',
                dateColumn: 'createdAt',
                sqlPreview: 'select sum(netAmount) from ProductOrder',
                definition: '任何语言描述都不能成为公式',
              },
            };
            class BrainReadonlyQueryExecutorService {
              execute(query) {
                switch (query.queryKey) {
                  case 'paid_revenue': return this.queryPaidRevenue(query);
                }
              }
              queryPaidRevenue(query) { return this.prisma.$queryRaw(Prisma.sql\`opaque sql\`); }
            }
          `,
        },
      ],
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricKey: 'paid_revenue',
          sourceKind: 'legacy_metric_binding',
          binding: expect.objectContaining({
            queryKey: 'paid_revenue',
            outputField: 'paid_revenue',
            permissionAllOf: ['core:finance:view'],
          }),
          blockedReasons: expect.arrayContaining(['opaque_sql_formula']),
        }),
        expect.objectContaining({
          metricKey: 'paid_revenue',
          sourceKind: 'verified_executable_binding',
          binding: expect.objectContaining({ executorRef: expect.stringContaining('queryPaidRevenue') }),
        }),
      ]),
    );
    for (const observation of observations) {
      expect(observation.payload?.measure?.field).toBeUndefined();
    }
  });

  it('does not allow language evidence to supply canonical formula fields', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_amount']),
      sources: [
        {
          path: 'src/report.ts',
          content: `
            export const card = {
              metricKey: 'paid_amount',
              title: '实收金额',
              description: 'sum(ProductOrder.totalAmount) where anything',
            };
          `,
        },
      ],
    });

    expect(observations).toEqual([
      expect.objectContaining({ metricKey: 'paid_amount', sourceKind: 'language_evidence' }),
    ]);
    expect(observations[0].payload).toBeUndefined();
  });

  it('does not create verifiable bindings from dynamic metric keys or permissions', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue', 'paid_amount']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            const metricKey = process.env.METRIC_KEY;
            const requiredPermission = process.env.METRIC_PERMISSION;
            const METRIC_SQL = {
              [metricKey]: {
                requiredPermission: 'core:finance:view',
                queryKey: 'paid_revenue',
                valueField: 'paid_revenue',
              },
              paid_amount: {
                requiredPermission,
                queryKey: 'paid_amount',
                valueField: 'paid_amount',
              },
            };
            class DynamicExecutor {
              execute(query) {
                switch (query.queryKey) {
                  case metricKey: return this.queryPaidRevenue(query);
                }
              }
            }
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: expect.stringMatching(/legacy_metric_binding|verified_executable_binding/),
        }),
      ]),
    );
  });

  it('does not treat unrelated or nested switches as executable metric bindings', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            class UnrelatedService {
              route(marketing) {
                switch (marketing.kind) {
                  case 'paid_revenue': return this.deleteCampaign(marketing);
                }
              }
              execute(query) {
                switch (query.queryKey) {
                  case 'paid_revenue': {
                    switch (query.mode) {
                      case 'danger': return this.deleteRevenue(query);
                    }
                  }
                }
              }
            }
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'verified_executable_binding' })]),
    );
  });

  it('accepts only positive strict queryKey equality and direct parameter switch dispatch', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set([
        'forward_metric',
        'reverse_metric',
        'switch_metric',
        'negative_metric',
        'or_metric',
        'unrelated_metric',
        'local_metric',
        'compiled_metric',
        'block_metric',
        'route_metric',
        'no_parameter_metric',
      ]),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts',
          content: `
            class StrictExecutor {
              executeForward(query) {
                if (query.queryKey === 'forward_metric') return this.queryForward(query);
              }
              executeReverse(request) {
                if ('reverse_metric' === request.queryKey) return this.queryReverse(request);
              }
              executeNegative(input) {
                if (input.queryKey !== 'negative_metric') return this.queryNegative(input);
              }
              executeWithOr(input) {
                if (input.queryKey === 'or_metric' || input.force) return this.queryOr(input);
              }
              executeUnrelated(compiled) {
                const other = compiled;
                if (other.queryKey === 'unrelated_metric') return this.queryUnrelated(other);
              }
              executeLocal(input) {
                const query = input;
                if (query.queryKey === 'local_metric') return this.queryLocal(query);
              }
              executeSwitchInput(input) {
                switch (input.queryKey) {
                  case 'switch_metric': return this.querySwitch(input);
                }
              }
              executeCompiled(compiled) {
                switch (compiled.queryKey) {
                  case 'compiled_metric': return this.queryCompiled(compiled);
                }
              }
              executeSwitchBlock(query) {
                switch (query.queryKey) {
                  case 'block_metric': { return this.queryBlock(query); }
                }
              }
              route(query) {
                if (query.queryKey === 'route_metric') return this.queryRoute(query);
              }
              executeNoParameter() {
                const compiled = { queryKey: 'no_parameter_metric' };
                switch (compiled.queryKey) {
                  case 'no_parameter_metric': return this.queryNoParameter(compiled);
                }
              }
            }
          `,
        },
      ],
    });

    expect(
      observations
        .filter((observation) => observation.sourceKind === 'verified_executable_binding')
        .map((observation) => observation.metricKey),
    ).toEqual(['forward_metric', 'reverse_metric', 'switch_metric', 'compiled_metric']);
  });

  it('rejects executor evidence from TypeScript sources with syntax errors', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['syntax_metric']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts',
          content: `
            class BrokenExecutor {
              execute(query) {
                if (query.queryKey === 'syntax_metric') return this.querySyntax(query)
                else
              }
            }
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'verified_executable_binding' })]),
    );
  });

  it('rejects legacy binding observations from a trusted source with any parse diagnostic', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['broken_metric']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts',
          content: `
            const METRIC_SQL = {
              broken_metric: {
                requiredPermission: 'core:finance:view',
                queryKey: 'broken_metric',
                valueField: 'brokenMetric',
              },
            };
            const broken = ;
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'legacy_metric_binding' })]),
    );
  });

  it('does not discover metric keys from a malformed trusted registry source', async () => {
    const workspaceRoot = await createMetricScanWorkspace({
      'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts': `
        const METRIC_SQL = {
          malformed_discovered_metric: {
            requiredPermission: 'core:finance:view',
            queryKey: 'malformed_discovered_metric',
            valueField: 'malformedMetric',
          },
        };
        const broken = ;
      `,
      'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts': `
        class BrainReadonlyQueryExecutorService {
          execute(compiled) {
            switch (compiled.queryKey) {
              case 'malformed_discovered_metric': return this.queryMalformed(compiled);
            }
          }
        }
      `,
    });

    const scan = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
    });

    expect(scan.observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ metricKey: 'malformed_discovered_metric' })]),
    );
  });

  it('rejects static-looking metric bindings that contain dynamic spread overrides', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            const dynamic = loadOverrides();
            const METRIC_SQL = {
              paid_revenue: {
                requiredPermission: 'core:finance:view',
                queryKey: 'paid_revenue',
                valueField: 'paid_revenue',
                ...dynamic,
              },
            };
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'legacy_metric_binding' })]),
    );
  });

  it('rejects static-looking metric bindings that contain computed overrides', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            const dynamicKey = process.env.BINDING_FIELD;
            const METRIC_SQL = {
              paid_revenue: {
                requiredPermission: 'core:finance:view',
                queryKey: 'paid_revenue',
                valueField: 'paid_revenue',
                [dynamicKey]: process.env.BINDING_VALUE,
              },
            };
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'legacy_metric_binding' })]),
    );
  });

  it.each([
    ['requiredPermission', `requiredPermission: 'core:finance:view', requiredPermission: 'core:admin:view'`],
    ['queryKey', `queryKey: 'paid_revenue', queryKey: 'other_metric'`],
    ['valueField', `valueField: 'paid_revenue', valueField: 'other_field'`],
  ])('rejects metric bindings with duplicate %s properties', (_property, duplicateProperty) => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            const METRIC_SQL = {
              paid_revenue: {
                requiredPermission: 'core:finance:view',
                queryKey: 'paid_revenue',
                valueField: 'paid_revenue',
                ${duplicateProperty},
              },
            };
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'legacy_metric_binding' })]),
    );
  });

  it('rejects duplicate metric keys in the METRIC_SQL registry', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            const METRIC_SQL = {
              paid_revenue: {
                requiredPermission: 'core:finance:view',
                queryKey: 'paid_revenue',
                valueField: 'paid_revenue',
              },
              paid_revenue: {
                requiredPermission: 'core:admin:view',
                queryKey: 'other_metric',
                valueField: 'other_field',
              },
            };
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'legacy_metric_binding' })]),
    );
  });

  it('rejects language metadata objects with duplicate static properties', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_amount', 'forged_amount']),
      sources: [
        {
          path: 'src/app/pages/DuplicateMetricCards.tsx',
          content: `
            export const metricCards = [{
              metricKey: 'paid_amount',
              metricKey: 'forged_amount',
              title: '实收金额',
              title: '伪造金额',
            }];
          `,
        },
      ],
    });

    expect(observations).toEqual([]);
  });

  it.each([
    ['spread', '...dynamicRegistry'],
    ['computed key', '[dynamicMetricKey]: dynamicBinding'],
  ])('rejects the entire METRIC_SQL registry when its outer object contains %s', (_label, override) => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            const METRIC_SQL = {
              paid_revenue: {
                requiredPermission: 'core:finance:view',
                queryKey: 'paid_revenue',
                valueField: 'paid_revenue',
              },
              ${override},
            };
          `,
        },
      ],
    });

    expect(observations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceKind: 'legacy_metric_binding' })]),
    );
  });

  it('only trusts the top-level METRIC_SQL symbol in the designated source module', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_revenue']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.ts',
          content: `
            function forge() {
              const METRIC_SQL = {
                paid_revenue: {
                  requiredPermission: 'core:finance:view',
                  queryKey: 'paid_revenue',
                  valueField: 'paid_revenue',
                },
              };
              return METRIC_SQL;
            }
          `,
        },
      ],
    });

    expect(observations).toEqual([]);
  });

  it('keeps formula-shaped metric card titles as aliases only', () => {
    const observations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['paid_amount']),
      sources: [
        {
          path: 'src/malicious-card.ts',
          content: `
            export const metricCard = {
              metricKey: 'paid_amount',
              title: 'sum(ProductOrder.netAmount) where status != refunded',
            };
          `,
        },
      ],
    });

    expect(observations).toEqual([
      expect.objectContaining({
        metricKey: 'paid_amount',
        sourceKind: 'language_evidence',
        aliases: ['sum(ProductOrder.netAmount) where status != refunded'],
      }),
    ]);
    expect(observations[0]).not.toHaveProperty('payload');
  });

  it('does not allow language evidence to claim verified authority or canonical payload in the type contract', () => {
    // @ts-expect-error language evidence must use language_evidence authority
    const forgedAuthority: BrainMetricSourceObservation = {
      metricKey: 'paid_amount',
      sourceKind: 'language_evidence',
      authority: 'verified_executable_binding',
      sourcePath: 'report.ts',
      sourceSymbol: 'card',
      evidence: {},
    };
    // @ts-expect-error language evidence cannot carry canonical payload
    const forgedPayload: BrainMetricSourceObservation = {
      metricKey: 'paid_amount',
      sourceKind: 'language_evidence',
      authority: 'language_evidence',
      sourcePath: 'report.ts',
      sourceSymbol: 'card',
      payload: {},
      evidence: {},
    };

    expect([forgedAuthority, forgedPayload]).toHaveLength(2);
  });

  it('creates canonical path-independent observation fingerprints', () => {
    const left = createMetricObservationFingerprint({
      metricKey: 'paid_amount',
      sourceKind: 'template_declaration',
      authority: 'metric_template_declaration',
      sourcePath: 'C:/repo-a/packages/server-v2/src/template.ts',
      sourceSymbol: 'template',
      payload: { sourceModels: ['PaymentRecord'], dimensions: ['payMethod'] },
      evidence: { b: 2, a: 1 },
    });
    const right = createMetricObservationFingerprint({
      metricKey: 'paid_amount',
      sourceKind: 'template_declaration',
      authority: 'metric_template_declaration',
      sourcePath: 'D:/repo-b/moved/template.ts',
      sourceSymbol: 'template',
      payload: { dimensions: ['payMethod'], sourceModels: ['PaymentRecord'] },
      evidence: { a: 1, b: 2 },
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps fallback source symbols and fingerprints stable across comments and formatting', () => {
    const adapter = new BrainMetricSourceAdapters();
    const observe = (content: string) =>
      adapter.observeTypeScriptSources({
        knownMetricKeys: new Set(['stable_metric']),
        sources: [{ path: 'src/stable-metric.ts', content }],
      })[0];
    const compact = observe(`export default [{ metricKey: 'stable_metric', title: '稳定指标' }];`);
    const formatted = observe(`
      // inserted comment
      export default [
        {
          metricKey: 'stable_metric',
          title: '稳定指标',
        },
      ];
    `);

    expect(compact.sourceSymbol).toBe(formatted.sourceSymbol);
    expect(compact.sourceSymbol).not.toMatch(/@\d+/);
    expect(compact.observationFingerprint).toBe(formatted.observationFingerprint);
  });

  it('sorts set-like arrays but preserves ordered semantic paths in fingerprints', () => {
    const base = {
      metricKey: 'paid_amount',
      sourceKind: 'template_declaration' as const,
      authority: 'metric_template_declaration' as const,
      sourcePath: 'C:/repo/packages/server-v2/src/template.ts',
      sourceSymbol: 'template',
      evidence: {},
    };
    const left = createMetricObservationFingerprint({
      ...base,
      payload: {
        sourceModels: ['PaymentRecord', 'ProductOrder'],
        dimensions: ['storeId', 'payMethod'],
        joinPath: [
          { fromModel: 'PaymentRecord', relationField: 'order', toModel: 'ProductOrder' },
          { fromModel: 'ProductOrder', relationField: 'store', toModel: 'Store' },
        ],
      },
    });
    const reorderedSets = createMetricObservationFingerprint({
      ...base,
      sourcePath: '/srv/repo/packages/server-v2/src/template.ts',
      payload: {
        sourceModels: ['ProductOrder', 'PaymentRecord'],
        dimensions: ['payMethod', 'storeId'],
        joinPath: [
          { fromModel: 'PaymentRecord', relationField: 'order', toModel: 'ProductOrder' },
          { fromModel: 'ProductOrder', relationField: 'store', toModel: 'Store' },
        ],
      },
    });
    const reorderedPath = createMetricObservationFingerprint({
      ...base,
      payload: {
        sourceModels: ['PaymentRecord', 'ProductOrder'],
        dimensions: ['storeId', 'payMethod'],
        joinPath: [
          { fromModel: 'ProductOrder', relationField: 'store', toModel: 'Store' },
          { fromModel: 'PaymentRecord', relationField: 'order', toModel: 'ProductOrder' },
        ],
      },
    });

    expect(left).toBe(reorderedSets);
    expect(left).not.toBe(reorderedPath);
  });

  it('normalizes Windows and Linux source paths to the same basename', () => {
    const windows = createMetricObservationFingerprint({
      metricKey: 'paid_amount',
      sourceKind: 'language_evidence',
      authority: 'language_evidence',
      sourcePath: 'C:\\repo\\packages\\server-v2\\src\\report.ts',
      sourceSymbol: 'card',
      aliases: ['实收金额'],
      evidence: { title: '实收金额' },
    });
    const linux = createMetricObservationFingerprint({
      metricKey: 'paid_amount',
      sourceKind: 'language_evidence',
      authority: 'language_evidence',
      sourcePath: '/home/runner/repo/packages/server-v2/src/report.ts',
      sourceSymbol: 'card',
      aliases: ['实收金额'],
      evidence: { title: '实收金额' },
    });

    expect(windows).toBe(linux);
  });

  it('does not change fingerprints when an evidence file is renamed or conjunctive policies are reordered', () => {
    const base = {
      metricKey: 'paid_amount',
      sourceKind: 'template_declaration' as const,
      authority: 'metric_template_declaration' as const,
      sourceSymbol: 'template',
      evidence: {},
    };
    const left = createMetricObservationFingerprint({
      ...base,
      sourcePath: 'C:/repo/src/old-name.ts',
      payload: {
        filters: [
          { model: 'PaymentRecord', field: 'status', operator: 'eq', value: 'success' },
          { model: 'ProductOrder', field: 'deletedAt', operator: 'eq', value: null },
        ],
        permissionPolicies: [
          { bindingRef: 'b', allOf: ['core:order:view'] },
          { bindingRef: 'a', allOf: ['core:finance:view'] },
        ],
      },
    });
    const right = createMetricObservationFingerprint({
      ...base,
      sourcePath: '/repo/src/new-name.ts',
      payload: {
        filters: [
          { model: 'ProductOrder', field: 'deletedAt', operator: 'eq', value: null },
          { model: 'PaymentRecord', field: 'status', operator: 'eq', value: 'success' },
        ],
        permissionPolicies: [
          { bindingRef: 'a', allOf: ['core:finance:view'] },
          { bindingRef: 'b', allOf: ['core:order:view'] },
        ],
      },
    });

    expect(left).toBe(right);
  });

  it('normalizes executor references across trusted source file renames', () => {
    const left = createMetricObservationFingerprint({
      metricKey: 'paid_revenue',
      sourceKind: 'verified_executable_binding',
      authority: 'verified_executable_binding',
      sourcePath: 'src/brain-query-compiler.ts',
      sourceSymbol: 'queryPaidRevenue',
      binding: {
        queryKey: 'paid_revenue',
        executorRef: 'brain-query-compiler.ts#queryPaidRevenue',
      },
      evidence: {},
    });
    const right = createMetricObservationFingerprint({
      metricKey: 'paid_revenue',
      sourceKind: 'verified_executable_binding',
      authority: 'verified_executable_binding',
      sourcePath: 'src/brain-query-compiler.service.ts',
      sourceSymbol: 'queryPaidRevenue',
      binding: {
        queryKey: 'paid_revenue',
        executorRef: 'brain-query-compiler.service.ts#queryPaidRevenue',
      },
      evidence: {},
    });

    expect(left).toBe(right);
  });

  it('defaults output to system temp and rejects workspace output', () => {
    const workspaceRoot = resolve('D:/workspace/beauty-salon-admin');
    expect(resolveMetricCandidateScanOutputPath(workspaceRoot)).toContain(resolve(tmpdir()));
    expect(() =>
      resolveMetricCandidateScanOutputPath(workspaceRoot, join(workspaceRoot, 'outputs', 'scan.json')),
    ).toThrow('metric_candidate_scan_workspace_output_forbidden');
    expect(() => resolveMetricCandidateScanOutputPath(workspaceRoot, 'outputs/scan.json')).toThrow(
      'metric_candidate_scan_workspace_output_forbidden',
    );
  });

  async function createMetricScanWorkspace(files: Record<string, string>): Promise<string> {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'brain-metric-source-adapters-'));
    temporaryWorkspaces.push(workspaceRoot);
    const requiredFiles = {
      'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts': '',
      'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts': '',
      'packages/server-v2/src/semantic-query/semantic-query-executor.service.ts': '',
      'packages/server-v2/prisma/schema.prisma': 'model Store {\n  id Int @id\n}',
      ...files,
    };
    await Promise.all(
      Object.entries(requiredFiles).map(async ([path, content]) => {
        const absolutePath = resolve(workspaceRoot, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content, 'utf8');
      }),
    );
    return workspaceRoot;
  }

  async function createDirectoryLink(target: string, path: string): Promise<boolean> {
    try {
      await symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir');
      return true;
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
      throw error;
    }
  }

  async function createFileLink(target: string, path: string): Promise<boolean> {
    try {
      await symlink(target, path, 'file');
      return true;
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
      throw error;
    }
  }

  async function writeMetricFilesInOrder(workspaceRoot: string, paths: string[]): Promise<void> {
    for (const path of paths) {
      const absolutePath = resolve(workspaceRoot, path);
      const metricName = path.split('/').at(-1)?.replace('-report.service.ts', '') ?? 'unknown';
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(
        absolutePath,
        `export const reportMetrics = [{ metricKey: 'deterministic_${metricName}', title: '确定性指标 ${metricName}' }];`,
        'utf8',
      );
    }
  }

  function emptyPublishedDefinitionSource(): BrainMetricPublishedDefinitionSourceService {
    const definitions: unknown[] = [];
    const snapshotFingerprint = createHash('sha256').update(canonicalizeBusinessDefinition(definitions)).digest('hex');
    return new BrainMetricPublishedDefinitionSourceService({
      getPublishedSnapshot: async () => ({ definitions, snapshotFingerprint }),
    } as never);
  }
});
