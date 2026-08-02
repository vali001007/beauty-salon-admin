import { createHash } from 'node:crypto';

export type AmiBrainGoldComparison =
  | 'money_fen_exact'
  | 'integer_exact'
  | 'decimal_exact'
  | 'boolean_exact'
  | 'scalar_exact'
  | 'id_set_exact'
  | 'ordered_rows'
  | 'json_exact';

export interface AmiBrainGoldComparisonResult {
  passed: boolean;
  comparison: AmiBrainGoldComparison;
  code: 'matched' | 'value_mismatch' | 'invalid_expected' | 'invalid_actual' | 'duplicate_actual_rows';
  normalizedExpected: unknown;
  normalizedActual: unknown;
}

export interface AmiBrainGoldEvaluationResult {
  sourceCaseId: string;
  passed: boolean;
}

export function compareAmiBrainGoldValue(input: {
  comparison: AmiBrainGoldComparison;
  expected: unknown;
  actual: unknown;
  tolerance?: string | number | null;
}): AmiBrainGoldComparisonResult {
  if (input.comparison === 'money_fen_exact') {
    return compareNormalized(input, moneyFen);
  }
  if (input.comparison === 'integer_exact') {
    return compareNormalized(input, integer);
  }
  if (input.comparison === 'decimal_exact') {
    const expected = decimal(input.expected);
    const actual = decimal(input.actual);
    if (expected === undefined) return invalid(input.comparison, 'invalid_expected', expected, actual);
    if (actual === undefined) return invalid(input.comparison, 'invalid_actual', expected, actual);
    const tolerance = decimal(input.tolerance ?? 0);
    if (tolerance === undefined || tolerance < 0) {
      return invalid(input.comparison, 'invalid_expected', expected, actual);
    }
    return result(input.comparison, Math.abs(expected - actual) <= tolerance, expected, actual);
  }
  if (input.comparison === 'boolean_exact') {
    return compareNormalized(input, booleanValue);
  }
  if (input.comparison === 'scalar_exact') {
    return compareNormalized(input, scalar);
  }
  if (input.comparison === 'id_set_exact') {
    const expected = identitySet(input.expected);
    const actual = identitySet(input.actual);
    if (!expected) return invalid(input.comparison, 'invalid_expected', null, actual?.values ?? null);
    if (!actual) return invalid(input.comparison, 'invalid_actual', expected.values, null);
    if (actual.duplicates.length) {
      return {
        passed: false,
        comparison: input.comparison,
        code: 'duplicate_actual_rows',
        normalizedExpected: expected.values,
        normalizedActual: { values: actual.values, duplicates: actual.duplicates },
      };
    }
    return result(input.comparison, canonicalJson(expected.values) === canonicalJson(actual.values), expected.values, actual.values);
  }
  if (input.comparison === 'ordered_rows') {
    const expected = orderedRows(input.expected);
    const actual = orderedRows(input.actual);
    if (!expected) return invalid(input.comparison, 'invalid_expected', null, actual);
    if (!actual) return invalid(input.comparison, 'invalid_actual', expected, null);
    return result(input.comparison, canonicalJson(expected) === canonicalJson(actual), expected, actual);
  }
  const expected = canonicalValue(input.expected);
  const actual = canonicalValue(input.actual);
  return result(input.comparison, canonicalJson(expected) === canonicalJson(actual), expected, actual);
}

export function amiBrainGoldValueChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(canonicalValue(value)), 'utf8').digest('hex');
}

export function buildAmiBrainGoldAcceptanceStatus(input: {
  manifest: unknown;
  manifestChecksum: string;
  currentSource: {
    suiteManifestChecksum: string;
    productLoopEligibilityChecksum: string;
    standardRegressionCaseIdsChecksum: string;
    standardRegressionCaseIds: string[];
  };
  results: AmiBrainGoldEvaluationResult[];
}) {
  const manifest = assertAmiBrainGoldManifestContract(input.manifest);
  const cases = (manifest.cases as unknown[]).map(record);
  const readiness = record(manifest.truthReadiness);
  const expectedIds = cases.map((item) => text(item.sourceCaseId)!);
  const expectedSet = new Set(expectedIds);
  const actualIds = input.results.map((item) => item.sourceCaseId);
  const actualSet = new Set(actualIds);
  const duplicateIds = [...new Set(actualIds.filter((id, index) => actualIds.indexOf(id) !== index))].sort();
  const missingIds = expectedIds.filter((id) => !actualSet.has(id));
  const unexpectedIds = actualIds.filter((id) => !expectedSet.has(id));
  const failedIds = [
    ...new Set(
      input.results
        .filter((item) => expectedSet.has(item.sourceCaseId) && !item.passed)
        .map((item) => item.sourceCaseId),
    ),
  ].sort();
  const blockingReasons: string[] = [];
  const source = record(manifest.source);
  const currentStandardIds = new Set(input.currentSource.standardRegressionCaseIds);
  if (manifest.status !== 'ready') blockingReasons.push('manifest_not_ready');
  if (!/^[0-9a-f]{64}$/iu.test(input.manifestChecksum)) blockingReasons.push('manifest_checksum_invalid');
  if (source.suiteManifestChecksum !== input.currentSource.suiteManifestChecksum) {
    blockingReasons.push('suite_manifest_identity_mismatch');
  }
  if (source.productLoopEligibilityChecksum !== input.currentSource.productLoopEligibilityChecksum) {
    blockingReasons.push('product_loop_eligibility_identity_mismatch');
  }
  if (source.standardRegressionCaseIdsChecksum !== input.currentSource.standardRegressionCaseIdsChecksum) {
    blockingReasons.push('standard_regression_identity_mismatch');
  }
  const outsideCurrentStandard = expectedIds.filter((id) => !currentStandardIds.has(id));
  if (outsideCurrentStandard.length) {
    blockingReasons.push(`source_cases_outside_current_standard:${outsideCurrentStandard.slice(0, 20).join(',')}`);
  }
  if (Number(readiness.auditQueryReady) !== 100) blockingReasons.push('audit_queries_not_ready');
  if (Number(readiness.snapshotReady) !== 100) blockingReasons.push('truth_snapshots_not_ready');
  if (duplicateIds.length) blockingReasons.push(`duplicate_results:${duplicateIds.slice(0, 20).join(',')}`);
  if (missingIds.length) blockingReasons.push(`missing_results:${missingIds.slice(0, 20).join(',')}`);
  if (unexpectedIds.length) blockingReasons.push(`unexpected_results:${unexpectedIds.slice(0, 20).join(',')}`);
  if (failedIds.length) blockingReasons.push(`fact_mismatches:${failedIds.slice(0, 20).join(',')}`);
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  const evaluated = [...actualSet].filter((id) => expectedSet.has(id)).length;
  const passed = new Set(
    input.results.filter((item) => expectedSet.has(item.sourceCaseId) && item.passed).map((item) => item.sourceCaseId),
  ).size;
  return {
    contractVersion: 'ami-brain-gold-standard-acceptance/v1' as const,
    status: uniqueBlockingReasons.length === 0 ? ('ready' as const) : ('blocked' as const),
    manifestVersion: String(manifest.manifestVersion ?? ''),
    manifestChecksum: input.manifestChecksum,
    caseCount: expectedIds.length,
    auditQueryReady: Number(readiness.auditQueryReady ?? 0),
    snapshotReady: Number(readiness.snapshotReady ?? 0),
    evaluated,
    passed,
    failed: failedIds.length,
    resultCaseIdsChecksum: createHash('sha256').update([...actualSet].sort().join('\n'), 'utf8').digest('hex'),
    blockingReasons: uniqueBlockingReasons,
  };
}

export function assertAmiBrainGoldManifestContract(manifest: unknown) {
  const root = record(manifest);
  const cases = Array.isArray(root.cases) ? root.cases.map(record) : [];
  if (root.schemaVersion !== 'ami-brain-gold-standard/v1') throw new Error('ami_brain_gold_manifest_schema_invalid');
  if (root.status !== 'candidate_pending_truth_snapshot' && root.status !== 'ready') {
    throw new Error('ami_brain_gold_manifest_status_invalid');
  }
  if (Number(root.caseCount) !== 100 || cases.length !== 100) throw new Error('ami_brain_gold_manifest_case_count_invalid');
  const goldIds = cases.map((item) => text(item.goldCaseId));
  const sourceIds = cases.map((item) => text(item.sourceCaseId));
  if (goldIds.some((value) => !value) || new Set(goldIds).size !== goldIds.length) {
    throw new Error('ami_brain_gold_manifest_gold_ids_invalid');
  }
  if (sourceIds.some((value) => !value) || new Set(sourceIds).size !== sourceIds.length) {
    throw new Error('ami_brain_gold_manifest_source_ids_invalid');
  }
  let capabilityMapped = 0;
  let auditContractMapped = 0;
  let auditQueryReady = 0;
  let snapshotReady = 0;
  for (const item of cases) {
    const audit = record(item.audit);
    const snapshot = record(item.expectedSnapshot);
    if (!text(item.expectedCapabilityKey)) throw new Error(`ami_brain_gold_capability_missing:${text(item.goldCaseId)}`);
    capabilityMapped += 1;
    if (!text(audit.resolverKey) || !text(audit.queryVersion)) {
      throw new Error(`ami_brain_gold_audit_contract_missing:${text(item.goldCaseId)}`);
    }
    if (audit.status !== 'contract_mapped' && audit.status !== 'ready') {
      throw new Error(`ami_brain_gold_audit_status_invalid:${text(item.goldCaseId)}`);
    }
    auditContractMapped += 1;
    if (audit.status === 'ready') auditQueryReady += 1;
    if (snapshot.status === 'ready') {
      snapshotReady += 1;
      if (!text(snapshot.checksum) || snapshot.value === undefined || !text(snapshot.generatedAt)) {
        throw new Error(`ami_brain_gold_snapshot_incomplete:${text(item.goldCaseId)}`);
      }
      if (amiBrainGoldValueChecksum(snapshot.value) !== snapshot.checksum) {
        throw new Error(`ami_brain_gold_snapshot_checksum_invalid:${text(item.goldCaseId)}`);
      }
    } else if (snapshot.status !== 'pending') {
      throw new Error(`ami_brain_gold_snapshot_status_invalid:${text(item.goldCaseId)}`);
    }
    if (item.releaseBlocking !== true) throw new Error(`ami_brain_gold_release_blocking_missing:${text(item.goldCaseId)}`);
  }
  const readiness = record(root.truthReadiness);
  const expectedReadiness = { capabilityMapped, auditContractMapped, auditQueryReady, snapshotReady };
  for (const [key, value] of Object.entries(expectedReadiness)) {
    if (Number(readiness[key]) !== value) throw new Error(`ami_brain_gold_readiness_invalid:${key}`);
  }
  if (readiness.releaseBlockingUntilReady !== true) throw new Error('ami_brain_gold_release_blocking_policy_invalid');
  if (root.status === 'ready' && (auditQueryReady !== 100 || snapshotReady !== 100)) {
    throw new Error('ami_brain_gold_manifest_falsely_ready');
  }
  return manifest as Record<string, unknown>;
}

function compareNormalized(
  input: { comparison: AmiBrainGoldComparison; expected: unknown; actual: unknown },
  normalize: (value: unknown) => unknown | undefined,
) {
  const expected = normalize(input.expected);
  const actual = normalize(input.actual);
  if (expected === undefined) return invalid(input.comparison, 'invalid_expected', expected, actual);
  if (actual === undefined) return invalid(input.comparison, 'invalid_actual', expected, actual);
  return result(input.comparison, canonicalJson(expected) === canonicalJson(actual), expected, actual);
}

function result(
  comparison: AmiBrainGoldComparison,
  passed: boolean,
  normalizedExpected: unknown,
  normalizedActual: unknown,
): AmiBrainGoldComparisonResult {
  return {
    passed,
    comparison,
    code: passed ? 'matched' : 'value_mismatch',
    normalizedExpected,
    normalizedActual,
  };
}

function invalid(
  comparison: AmiBrainGoldComparison,
  code: 'invalid_expected' | 'invalid_actual',
  normalizedExpected: unknown,
  normalizedActual: unknown,
): AmiBrainGoldComparisonResult {
  return { passed: false, comparison, code, normalizedExpected, normalizedActual };
}

function moneyFen(value: unknown): string | undefined {
  const decimalValue = decimalText(value, true);
  if (!decimalValue) return undefined;
  const match = decimalValue.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/u);
  if (!match) return undefined;
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = (match[3] ?? '').padEnd(2, '0');
  return (sign * (BigInt(match[2]!) * 100n + BigInt(fraction || '0'))).toString();
}

function integer(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : undefined;
  const normalized = decimalText(value, false)?.replace(/(?:人|个|次|张|单|笔|件|家|位)$/u, '');
  return normalized && /^-?\d+$/u.test(normalized) ? BigInt(normalized).toString() : undefined;
}

function decimal(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  let normalized = decimalText(value, false);
  if (!normalized) return undefined;
  const percent = normalized.endsWith('%');
  if (percent) normalized = normalized.slice(0, -1);
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? (percent ? parsed / 100 : parsed) : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  const normalized = text(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (/^(true|yes|y|是|有|已对平|对平)$/u.test(normalized)) return true;
  if (/^(false|no|n|否|无|没有|未对平|不对平)$/u.test(normalized)) return false;
  return undefined;
}

function scalar(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  return undefined;
}

function identitySet(value: unknown): { values: string[]; duplicates: string[] } | undefined {
  if (!Array.isArray(value)) return undefined;
  const identities = value.map(identity);
  if (identities.some((item) => item === undefined)) return undefined;
  const counts = new Map<string, number>();
  for (const item of identities as string[]) counts.set(item, (counts.get(item) ?? 0) + 1);
  return {
    values: [...counts.keys()].sort(),
    duplicates: [...counts.entries()].filter(([, count]) => count > 1).map(([item]) => item).sort(),
  };
}

function identity(value: unknown): string | undefined {
  const primitive = scalar(value);
  if (primitive !== undefined) return primitive;
  const item = record(value);
  for (const key of ['id', 'caseId', 'customerId', 'orderId', 'productId', 'projectId', 'reservationId', 'staffId']) {
    const candidate = scalar(item[key]);
    if (candidate !== undefined) return `${key}:${candidate}`;
  }
  const idKey = Object.keys(item).sort().find((key) => /Id$/u.test(key) && scalar(item[key]) !== undefined);
  return idKey ? `${idKey}:${scalar(item[idKey])}` : canonicalJson(canonicalValue(item));
}

function orderedRows(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value.map(canonicalValue) : undefined;
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    if ('toJSON' in value && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
      return canonicalValue((value as { toJSON: () => unknown }).toJSON());
    }
    if ('toString' in value && value.constructor?.name === 'Decimal') return String(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function decimalText(value: unknown, stripCurrency: boolean): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    if (stripCurrency) {
      const fen = Math.round(value * 100);
      if (Math.abs(value * 100 - fen) > 1e-7) return undefined;
      return (fen / 100).toFixed(2);
    }
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'string' && (!value || typeof value !== 'object')) return undefined;
  let normalized = String(value).trim().replaceAll(',', '').replaceAll(/\s+/gu, '');
  if (stripCurrency) normalized = normalized.replaceAll(/人民币|RMB|CNY|¥|￥|元/giu, '');
  return normalized || undefined;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
