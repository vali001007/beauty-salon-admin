import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshReadyGoldManifestGroup } from './ami-brain-gold-standard-ready-refresh-core.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const OUTPUT_DIR = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-事实金标准');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'ami-brain-gold-standard-manifest-v1.json');
const READY_REPORT_PATH = resolve(OUTPUT_DIR, 'Ami-Brain-100题事实金标准就绪报告-2026-07-29.md');
const GROUPS = {
  finance: 22,
  catalog: 7,
  customer: 11,
  staff: 19,
  fulfillment: 15,
  inventory: 26,
};

const manifestRaw = readFileSync(MANIFEST_PATH, 'utf8');
const manifest = JSON.parse(manifestRaw);
const revalidateSourceIdentity = process.argv.includes('--revalidate-source-identity');
const refreshReadyGroup = valueArg('--refresh-ready-group');
const nextManifestVersion = valueArg('--next-manifest-version');
if (
  manifest.schemaVersion !== 'ami-brain-gold-standard/v1' ||
  manifest.caseCount !== 100 ||
  manifest.cases?.length !== 100
) {
  throw new Error('gold standard candidate manifest invalid');
}

if (manifest.status === 'ready') {
  if (refreshReadyGroup) {
    const expectedCount = GROUPS[refreshReadyGroup];
    if (!expectedCount) throw new Error(`gold standard ready refresh group unsupported:${refreshReadyGroup}`);
    const truthPath = resolve(OUTPUT_DIR, `ami-brain-gold-standard-truth-${refreshReadyGroup}-v1.json`);
    const artifactRaw = readFileSync(truthPath, 'utf8');
    const refreshedAt = new Date().toISOString();
    const refreshedManifest = refreshReadyGoldManifestGroup({
      manifest,
      manifestRaw,
      artifact: JSON.parse(artifactRaw),
      artifactRaw,
      groupKey: refreshReadyGroup,
      expectedCount,
      nextManifestVersion,
      refreshedAt,
    });
    assertReadyManifest(refreshedManifest);
    const readyRaw = `${JSON.stringify(refreshedManifest, null, 2)}\n`;
    writeFileSync(MANIFEST_PATH, readyRaw, 'utf8');
    writeFileSync(READY_REPORT_PATH, renderReadyReport(refreshedManifest, sha256(readyRaw)), 'utf8');
    console.log(
      JSON.stringify(
        {
          output: relative(MANIFEST_PATH),
          report: relative(READY_REPORT_PATH),
          status: refreshedManifest.status,
          caseCount: refreshedManifest.caseCount,
          manifestVersion: refreshedManifest.manifestVersion,
          refreshedGroup: refreshReadyGroup,
          changedCaseIds: refreshedManifest.truthRefreshHistory.at(-1)?.changedCaseIds ?? [],
          checksum: sha256(readyRaw),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const readyManifest = revalidateSourceIdentity ? revalidateReadySourceIdentity(manifest) : manifest;
  assertReadyManifest(readyManifest);
  const readyRaw = `${JSON.stringify(readyManifest, null, 2)}\n`;
  if (revalidateSourceIdentity) {
    writeFileSync(MANIFEST_PATH, readyRaw, 'utf8');
    writeFileSync(READY_REPORT_PATH, renderReadyReport(readyManifest, sha256(readyRaw)), 'utf8');
  }
  console.log(
    JSON.stringify(
      {
        output: relative(MANIFEST_PATH),
        report: relative(READY_REPORT_PATH),
        status: readyManifest.status,
        caseCount: readyManifest.caseCount,
        checksum: sha256(readyRaw),
        unchanged: !revalidateSourceIdentity,
        sourceIdentityRevalidated: revalidateSourceIdentity,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (manifest.status !== 'candidate_pending_truth_snapshot') {
  throw new Error(`gold standard candidate status invalid:${manifest.status}`);
}

const candidateManifestChecksum = sha256(manifestRaw);
const truthArtifacts = [];
const snapshots = new Map();
for (const [groupKey, expectedCount] of Object.entries(GROUPS)) {
  const path = resolve(OUTPUT_DIR, `ami-brain-gold-standard-truth-${groupKey}-v1.json`);
  const raw = readFileSync(path, 'utf8');
  const artifact = JSON.parse(raw);
  if (artifact.schemaVersion !== 'ami-brain-gold-standard-truth/v1') {
    throw new Error(`gold standard truth schema invalid:${groupKey}`);
  }
  if (artifact.groupKey !== groupKey || artifact.status !== 'ready') {
    throw new Error(`gold standard truth not ready:${groupKey}:${artifact.status}`);
  }
  if (artifact.manifestChecksum !== candidateManifestChecksum) {
    throw new Error(`gold standard truth manifest checksum mismatch:${groupKey}`);
  }
  if (
    artifact.groupCaseCount !== expectedCount ||
    artifact.readyCaseCount !== expectedCount ||
    artifact.blockedCaseCount !== 0 ||
    artifact.remainingCaseCount !== 0 ||
    artifact.snapshots?.length !== expectedCount
  ) {
    throw new Error(`gold standard truth count invalid:${groupKey}`);
  }
  for (const snapshot of artifact.snapshots) {
    if (snapshot.status !== 'ready' || snapshot.valueChecksum !== sha256(stableJson(snapshot.value))) {
      throw new Error(`gold standard truth value invalid:${snapshot.sourceCaseId}`);
    }
    assertComparisonValueShape(snapshot.comparison, snapshot.value, snapshot.sourceCaseId);
    if (snapshots.has(snapshot.sourceCaseId)) throw new Error(`gold standard duplicate truth:${snapshot.sourceCaseId}`);
    snapshots.set(snapshot.sourceCaseId, {
      ...snapshot,
      groupKey,
      artifactPath: relative(path),
      artifactChecksum: sha256(raw),
    });
  }
  truthArtifacts.push({
    groupKey,
    path: relative(path),
    checksum: sha256(raw),
    truthVersion: artifact.truthVersion,
    generatedAt: artifact.generatedAt,
    caseCount: expectedCount,
    sourceDatasetChecksum: artifact.sourceDatasetChecksum,
  });
}

const sourceCaseIds = manifest.cases.map((item) => item.sourceCaseId);
const missing = sourceCaseIds.filter((id) => !snapshots.has(id));
const unexpected = [...snapshots.keys()].filter((id) => !sourceCaseIds.includes(id));
if (missing.length || unexpected.length || snapshots.size !== 100) {
  throw new Error(`gold standard truth set mismatch:missing=${missing.join(',')}:unexpected=${unexpected.join(',')}`);
}

const finalizedAt = new Date().toISOString();
const readyCases = manifest.cases.map((item) => {
  const snapshot = snapshots.get(item.sourceCaseId);
  if (
    snapshot.goldCaseId !== item.goldCaseId ||
    snapshot.resolverKey !== item.audit.resolverKey ||
    snapshot.comparison !== item.audit.comparison
  ) {
    throw new Error(`gold standard truth contract mismatch:${item.sourceCaseId}`);
  }
  if (String(item.audit.queryVersion).includes('pending')) {
    throw new Error(`gold standard audit query still pending:${item.sourceCaseId}`);
  }
  return {
    ...item,
    evaluationQuestion: snapshot.evaluationQuestion,
    audit: { ...item.audit, status: 'ready' },
    expectedSnapshot: {
      status: 'ready',
      generatedAt: snapshot.snapshotAt,
      sourceRowCount: snapshot.sourceRowCount,
      sourceChecksum: snapshot.sourceChecksum,
      value: snapshot.value,
      checksum: snapshot.valueChecksum,
      definition: snapshot.definition,
      truthArtifactPath: snapshot.artifactPath,
      truthArtifactChecksum: snapshot.artifactChecksum,
    },
  };
});

const readyManifest = {
  ...manifest,
  manifestVersion: String(manifest.manifestVersion).replace(/-candidate$/u, ''),
  status: 'ready',
  finalizedAt,
  source: { ...manifest.source, candidateManifestChecksum },
  truthReadiness: {
    capabilityMapped: 100,
    auditContractMapped: 100,
    auditQueryReady: 100,
    snapshotReady: 100,
    releaseBlockingUntilReady: true,
  },
  truthArtifacts,
  cases: readyCases,
};
assertReadyManifest(readyManifest);
const readyRaw = `${JSON.stringify(readyManifest, null, 2)}\n`;
writeFileSync(MANIFEST_PATH, readyRaw, 'utf8');
writeFileSync(READY_REPORT_PATH, renderReadyReport(readyManifest, sha256(readyRaw)), 'utf8');
console.log(
  JSON.stringify(
    {
      output: relative(MANIFEST_PATH),
      report: relative(READY_REPORT_PATH),
      status: readyManifest.status,
      caseCount: readyManifest.caseCount,
      auditQueryReady: readyManifest.truthReadiness.auditQueryReady,
      snapshotReady: readyManifest.truthReadiness.snapshotReady,
      checksum: sha256(readyRaw),
      candidateManifestChecksum,
    },
    null,
    2,
  ),
);

function assertReadyManifest(value) {
  if (value.status !== 'ready' || value.caseCount !== 100 || value.cases?.length !== 100) {
    throw new Error('gold standard ready manifest invalid');
  }
  if (value.truthReadiness?.auditQueryReady !== 100 || value.truthReadiness?.snapshotReady !== 100) {
    throw new Error('gold standard ready manifest readiness invalid');
  }
  const ids = new Set();
  for (const item of value.cases) {
    if (ids.has(item.sourceCaseId)) throw new Error(`gold standard ready duplicate case:${item.sourceCaseId}`);
    ids.add(item.sourceCaseId);
    if (item.audit?.status !== 'ready' || String(item.audit?.queryVersion ?? '').includes('pending')) {
      throw new Error(`gold standard ready audit invalid:${item.sourceCaseId}`);
    }
    const snapshot = item.expectedSnapshot;
    if (
      snapshot?.status !== 'ready' ||
      !snapshot.generatedAt ||
      !Number.isInteger(snapshot.sourceRowCount) ||
      !/^[0-9a-f]{64}$/u.test(snapshot.sourceChecksum) ||
      !/^[0-9a-f]{64}$/u.test(snapshot.checksum) ||
      snapshot.checksum !== sha256(stableJson(snapshot.value))
    ) {
      throw new Error(`gold standard ready snapshot invalid:${item.sourceCaseId}`);
    }
    assertComparisonValueShape(item.audit.comparison, snapshot.value, item.sourceCaseId);
  }
}

function revalidateReadySourceIdentity(value) {
  const source = value.source ?? {};
  const classificationPath = resolve(REPO_ROOT, String(source.classificationPath ?? ''));
  const suiteManifestPath = resolve(REPO_ROOT, String(source.suiteManifestPath ?? ''));
  const eligibilityPath = resolve(REPO_ROOT, String(source.productLoopEligibilityPath ?? ''));
  const classificationRaw = readFileSync(classificationPath, 'utf8');
  const suiteRaw = readFileSync(suiteManifestPath, 'utf8');
  const eligibilityRaw = readFileSync(eligibilityPath, 'utf8');
  if (sha256(classificationRaw) !== source.classificationChecksum) {
    throw new Error('gold standard classification changed; rebuild truth manifest instead of rebasing identity');
  }

  const suite = JSON.parse(suiteRaw);
  const standard = suite?.suites?.standardRegression;
  if (
    standard?.key !== source.standardRegressionSuiteKey ||
    standard?.caseIdsChecksum !== source.standardRegressionCaseIdsChecksum ||
    !Array.isArray(standard?.caseIds)
  ) {
    throw new Error('gold standard standard-regression identity changed; rebuild truth manifest');
  }
  if (suite.productLoopEligibility?.path !== source.productLoopEligibilityPath) {
    throw new Error('gold standard product-loop source path changed; rebuild truth manifest');
  }

  const standardIds = new Set(standard.caseIds);
  const eligibility = JSON.parse(eligibilityRaw);
  const eligibilityById = new Map((eligibility.cases ?? []).map((item) => [item.id, item]));
  const projection = value.cases.map((goldCase) => {
    const current = eligibilityById.get(goldCase.sourceCaseId);
    if (!current) throw new Error(`gold standard eligibility case missing:${goldCase.sourceCaseId}`);
    if (!standardIds.has(goldCase.sourceCaseId)) {
      throw new Error(`gold standard case outside current standard-regression:${goldCase.sourceCaseId}`);
    }
    if (
      current.status !== 'current_release_test' ||
      current.question !== goldCase.sourceQuestion ||
      current.domain !== goldCase.domain ||
      current.role !== goldCase.role ||
      current.type !== goldCase.questionType ||
      current.expectedTarget !== goldCase.expectedTarget ||
      current.evidence?.managementEntry?.status !== 'present' ||
      current.evidence?.backendApi?.status !== 'present' ||
      current.evidence?.dataFacts?.status !== 'present' ||
      (current.missingComponents?.length ?? 0) !== 0
    ) {
      throw new Error(`gold standard eligibility contract changed:${goldCase.sourceCaseId}`);
    }
    return {
      id: current.id,
      question: current.question,
      domain: current.domain,
      role: current.role,
      type: current.type,
      expectedTarget: current.expectedTarget,
      status: current.status,
      featureKey: current.featureKey,
      managementEntryStatus: current.evidence.managementEntry.status,
      backendApiStatus: current.evidence.backendApi.status,
      dataFactsStatus: current.evidence.dataFacts.status,
      dataAuditSchemaChecksum: current.evidence.dataFacts.auditSchemaChecksum,
      dataAuditSnapshotChecksum: current.evidence.dataFacts.auditSnapshotChecksum,
      dataStoreId: current.evidence.dataFacts.storeId,
    };
  });
  const revalidatedAt = new Date().toISOString();
  return {
    ...value,
    source: {
      ...source,
      suiteManifestChecksum: sha256(suiteRaw),
      productLoopEligibilityChecksum: sha256(eligibilityRaw),
      goldEligibilityCasesChecksum: sha256(stableJson(projection)),
      sourceIdentityRevalidatedAt: revalidatedAt,
      sourceIdentityRevalidationPolicy:
        'classification_and_standard_case_ids_unchanged;all_gold_cases_current_release_test_with_same_question_contract_and_three_present_evidence',
    },
  };
}

function assertComparisonValueShape(comparison, value, sourceCaseId) {
  if (['id_set_exact', 'ordered_rows'].includes(comparison) && !Array.isArray(value)) {
    throw new Error(`gold standard comparison value shape invalid:${sourceCaseId}:${comparison}`);
  }
  if (comparison === 'boolean_exact' && typeof value !== 'boolean') {
    throw new Error(`gold standard comparison value shape invalid:${sourceCaseId}:${comparison}`);
  }
  if (['money_fen_exact', 'integer_exact', 'decimal_exact'].includes(comparison)) {
    const number =
      typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
    if (!Number.isFinite(number) || (comparison === 'integer_exact' && !Number.isInteger(number))) {
      throw new Error(`gold standard comparison value shape invalid:${sourceCaseId}:${comparison}`);
    }
  }
}

function renderReadyReport(value, checksum) {
  const rows = value.truthArtifacts
    .map((item) => `| ${item.groupKey} | ${item.caseCount} | ${item.checksum} | ${item.sourceDatasetChecksum} |`)
    .join('\n');
  return `# Ami Brain 100 题事实金标准就绪报告

> 最终化时间：${value.finalizedAt}<br>
> manifest 版本：${value.manifestVersion}<br>
> manifest checksum：${checksum}<br>
> 候选 manifest checksum：${value.source.candidateManifestChecksum}

## 结论

- 100 题全部完成可独立复现的只读审计查询。
- 六个领域 truth artifact 均为 ready，总计 100/100，blocked=0。
- 每题已写入 value、value checksum、source row count、source checksum 和业务口径。
- 本产物只证明真值基线就绪，不代表 Ami Brain 已在真实评测中 100/100 回答正确。

## 领域产物

| 领域 | 题数 | artifact checksum | source dataset checksum |
| --- | ---: | --- | --- |
${rows}

## 发布边界

这 100 题必须在 standard-regression 的同一 pipeline identity 中运行并通过确定性比较，才能作为发布证据。任一真值来源、题目合同或 manifest 发生变化，本证据失效。
`;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function relative(value) {
  return value.replace(`${REPO_ROOT}/`, '');
}

function valueArg(name) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}
