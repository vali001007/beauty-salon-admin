import { createHash } from 'node:crypto';

export function refreshReadyGoldManifestGroup({
  manifest,
  manifestRaw,
  artifact,
  artifactRaw,
  groupKey,
  expectedCount,
  nextManifestVersion,
  refreshedAt,
}) {
  assertReadyManifestShape(manifest);
  if (!nextManifestVersion || nextManifestVersion === manifest.manifestVersion) {
    throw new Error('gold standard ready refresh requires a new manifest version');
  }
  const sourceManifestChecksum = sha256(manifestRaw);
  if (
    artifact?.schemaVersion !== 'ami-brain-gold-standard-truth/v1' ||
    artifact.groupKey !== groupKey ||
    artifact.status !== 'ready' ||
    artifact.manifestChecksum !== sourceManifestChecksum ||
    artifact.groupCaseCount !== expectedCount ||
    artifact.readyCaseCount !== expectedCount ||
    artifact.blockedCaseCount !== 0 ||
    artifact.remainingCaseCount !== 0 ||
    artifact.snapshots?.length !== expectedCount
  ) {
    throw new Error(`gold standard ready refresh artifact invalid:${groupKey}`);
  }
  const artifactChecksum = sha256(artifactRaw);
  const snapshots = new Map();
  for (const snapshot of artifact.snapshots) {
    if (
      snapshot.status !== 'ready' ||
      !snapshot.sourceCaseId ||
      snapshot.valueChecksum !== sha256(stableJson(snapshot.value)) ||
      snapshots.has(snapshot.sourceCaseId)
    ) {
      throw new Error(`gold standard ready refresh snapshot invalid:${snapshot.sourceCaseId ?? 'missing'}`);
    }
    snapshots.set(snapshot.sourceCaseId, snapshot);
  }
  const groupCases = manifest.cases.filter((item) => item.groupKey === groupKey);
  if (groupCases.length !== expectedCount) {
    throw new Error(`gold standard ready refresh group count invalid:${groupKey}`);
  }
  const changedCaseIds = [];
  const cases = manifest.cases.map((item) => {
    if (item.groupKey !== groupKey) return item;
    const snapshot = snapshots.get(item.sourceCaseId);
    if (!snapshot) throw new Error(`gold standard ready refresh truth missing:${item.sourceCaseId}`);
    if (
      snapshot.goldCaseId !== item.goldCaseId ||
      snapshot.resolverKey !== item.audit?.resolverKey ||
      snapshot.comparison !== item.audit?.comparison
    ) {
      throw new Error(`gold standard ready refresh contract mismatch:${item.sourceCaseId}`);
    }
    assertComparisonValueShape(snapshot.comparison, snapshot.value, item.sourceCaseId);
    if (item.expectedSnapshot?.checksum !== snapshot.valueChecksum) changedCaseIds.push(item.sourceCaseId);
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
        truthArtifactPath: manifest.truthArtifacts.find((entry) => entry.groupKey === groupKey)?.path,
        truthArtifactChecksum: artifactChecksum,
      },
    };
  });
  if (snapshots.size !== expectedCount) {
    throw new Error(`gold standard ready refresh truth set mismatch:${groupKey}`);
  }
  const truthArtifacts = manifest.truthArtifacts.map((entry) =>
    entry.groupKey === groupKey
      ? {
          ...entry,
          checksum: artifactChecksum,
          truthVersion: artifact.truthVersion,
          generatedAt: artifact.generatedAt,
          caseCount: expectedCount,
          sourceDatasetChecksum: artifact.sourceDatasetChecksum,
        }
      : entry,
  );
  if (!truthArtifacts.some((entry) => entry.groupKey === groupKey && entry.checksum === artifactChecksum)) {
    throw new Error(`gold standard ready refresh truth artifact missing:${groupKey}`);
  }
  return {
    ...manifest,
    manifestVersion: nextManifestVersion,
    truthRefreshedAt: refreshedAt,
    source: {
      ...manifest.source,
      lastTruthRefreshSourceManifestChecksum: sourceManifestChecksum,
    },
    truthArtifacts,
    truthRefreshHistory: [
      ...(Array.isArray(manifest.truthRefreshHistory) ? manifest.truthRefreshHistory : []),
      {
        refreshedAt,
        groupKey,
        previousManifestVersion: manifest.manifestVersion,
        manifestVersion: nextManifestVersion,
        sourceManifestChecksum,
        truthArtifactChecksum: artifactChecksum,
        truthVersion: artifact.truthVersion,
        changedCaseIds,
        policy: 'ready_group_rebind_from_single_case_audit_refresh',
      },
    ],
    cases,
  };
}

function assertReadyManifestShape(value) {
  if (
    value?.schemaVersion !== 'ami-brain-gold-standard/v1' ||
    value.status !== 'ready' ||
    value.caseCount !== 100 ||
    value.cases?.length !== 100 ||
    !Array.isArray(value.truthArtifacts)
  ) {
    throw new Error('gold standard ready refresh manifest invalid');
  }
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
