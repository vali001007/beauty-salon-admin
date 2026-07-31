import { createHash } from 'node:crypto';

export type AmiBrainProductSuiteStage = 'release-core' | 'standard-regression';
export type AmiBrainSuiteStage = AmiBrainProductSuiteStage | 'extended-rotation';

export interface AmiBrainSuiteDefinition {
  key: string;
  label: string;
  caseCount: number;
  caseIdsChecksum: string;
  includesSuite?: string;
  caseIds: string[];
}

export type AmiBrainProductJourneyStatus =
  | 'current_release_test'
  | 'next_iteration_feature'
  | 'evidence_review_required'
  | 'metric_definition_governance_required';
export type AmiBrainProductJourneySuite =
  | 'release-core'
  | 'standard-regression'
  | 'extended-rotation'
  | 'next-iteration-feature'
  | 'evidence-review-required'
  | 'metric-definition-governance-required';

export interface AmiBrainProductJourneyCase {
  caseId: string;
  question: string;
  journeyKeys: string[];
  status: AmiBrainProductJourneyStatus;
  suite: AmiBrainProductJourneySuite;
  executable: boolean;
  fixtureReferences: Array<{ path: string; marker: string; questionMarker: string }>;
}

export interface AmiBrainSuiteManifest {
  schemaVersion: 'ami-brain-suite-manifest/v1';
  manifestVersion: string;
  generatedAt: string;
  sourceBaseline: {
    key: string;
    label: string;
    path: string;
    checksum: string;
    caseCount: number;
  };
  productLoopEligibility: {
    schemaVersion: 'ami-brain-product-loop-eligibility/v1';
    path: string;
    checksum: string;
    sourceBaselineChecksum: string;
    caseCount: number;
    baselineCaseCount: number;
    caseIdsChecksum: string;
    supplementalRegistry: {
      schemaVersion: 'ami-brain-supplemental-question-registry/v1';
      path: string;
      checksum: string;
      caseCount: number;
    };
    dataFactsAudit: {
      schemaVersion: 'ami-brain-product-loop-data-facts/v1';
      path: string;
      checksum: string;
      schemaChecksum: string;
      snapshotChecksum: string;
      databaseHost: string;
      storeId: number;
    };
  };
  governancePolicy: Record<string, unknown>;
  legacySubsets: {
    targeted12: string[];
    preflight140: string[];
    targeted12Original?: string[];
    targeted12NextIteration?: string[];
    targeted12EvidenceReview?: string[];
    preflight140Original?: string[];
    preflight140NextIteration?: string[];
    preflight140EvidenceReview?: string[];
    preflight140Replacements?: string[];
  };
  productJourneys: {
    schemaVersion: 'ami-brain-product-journeys/v1';
    policy: string;
    currentReleaseCaseIdsChecksum: string;
    cases: AmiBrainProductJourneyCase[];
  };
  suites: {
    releaseCore: AmiBrainSuiteDefinition;
    standardRegression: AmiBrainSuiteDefinition;
    extendedRotation: AmiBrainSuiteDefinition;
    nextIterationFeature?: AmiBrainSuiteDefinition;
    evidenceReviewRequired?: AmiBrainSuiteDefinition;
    metricDefinitionGovernanceRequired?: AmiBrainSuiteDefinition;
  };
  classificationSummary: {
    KEEP: number;
    ROTATE: number;
    REMOVE: number;
    REVIEW: number;
    NEXT_ITERATION?: number;
  };
}

export function parseAmiBrainSuiteManifest(raw: string): AmiBrainSuiteManifest {
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) || value.schemaVersion !== 'ami-brain-suite-manifest/v1') {
    throw new Error('ami_brain_suite_manifest_schema_invalid');
  }
  const sourceBaseline = value.sourceBaseline;
  const productLoopEligibility = value.productLoopEligibility;
  const legacySubsets = value.legacySubsets;
  const productJourneys = value.productJourneys;
  const suites = value.suites;
  const classificationSummary = value.classificationSummary;
  if (
    typeof value.manifestVersion !== 'string' ||
    typeof value.generatedAt !== 'string' ||
    !isRecord(sourceBaseline) ||
    !isRecord(productLoopEligibility) ||
    !isRecord(legacySubsets) ||
    !isRecord(productJourneys) ||
    !isRecord(suites) ||
    !isRecord(classificationSummary)
  ) {
    throw new Error('ami_brain_suite_manifest_shape_invalid');
  }
  const manifest = value as unknown as AmiBrainSuiteManifest;
  if (
    manifest.productLoopEligibility.schemaVersion !== 'ami-brain-product-loop-eligibility/v1' ||
    typeof manifest.productLoopEligibility.path !== 'string' ||
    !isSha256(manifest.productLoopEligibility.checksum) ||
    !isSha256(manifest.productLoopEligibility.sourceBaselineChecksum) ||
    !isSha256(manifest.productLoopEligibility.caseIdsChecksum) ||
    !Number.isInteger(manifest.productLoopEligibility.caseCount) ||
    manifest.productLoopEligibility.caseCount <= 0 ||
    !Number.isInteger(manifest.productLoopEligibility.baselineCaseCount) ||
    manifest.productLoopEligibility.baselineCaseCount <= 0 ||
    manifest.productLoopEligibility.supplementalRegistry?.schemaVersion !==
      'ami-brain-supplemental-question-registry/v1' ||
    typeof manifest.productLoopEligibility.supplementalRegistry.path !== 'string' ||
    !isSha256(manifest.productLoopEligibility.supplementalRegistry.checksum) ||
    !Number.isInteger(manifest.productLoopEligibility.supplementalRegistry.caseCount) ||
    manifest.productLoopEligibility.supplementalRegistry.caseCount < 0 ||
    manifest.productLoopEligibility.caseCount !==
      manifest.productLoopEligibility.baselineCaseCount +
        manifest.productLoopEligibility.supplementalRegistry.caseCount ||
    manifest.productLoopEligibility.dataFactsAudit?.schemaVersion !== 'ami-brain-product-loop-data-facts/v1' ||
    typeof manifest.productLoopEligibility.dataFactsAudit.path !== 'string' ||
    !isSha256(manifest.productLoopEligibility.dataFactsAudit.checksum) ||
    !isSha256(manifest.productLoopEligibility.dataFactsAudit.schemaChecksum) ||
    !isSha256(manifest.productLoopEligibility.dataFactsAudit.snapshotChecksum) ||
    manifest.productLoopEligibility.dataFactsAudit.databaseHost !== 'aws-1-ap-northeast-1.pooler.supabase.com' ||
    manifest.productLoopEligibility.dataFactsAudit.storeId !== 6
  ) {
    throw new Error('ami_brain_suite_manifest_product_loop_artifact_invalid');
  }
  assertSuiteDefinition(manifest.suites.releaseCore, 'releaseCore');
  assertSuiteDefinition(manifest.suites.standardRegression, 'standardRegression');
  assertSuiteDefinition(manifest.suites.extendedRotation, 'extendedRotation');
  if (manifest.suites.nextIterationFeature) {
    assertSuiteDefinition(manifest.suites.nextIterationFeature, 'nextIterationFeature');
  }
  if (manifest.suites.evidenceReviewRequired) {
    assertSuiteDefinition(manifest.suites.evidenceReviewRequired, 'evidenceReviewRequired');
  }
  if (manifest.suites.metricDefinitionGovernanceRequired) {
    assertSuiteDefinition(manifest.suites.metricDefinitionGovernanceRequired, 'metricDefinitionGovernanceRequired');
  }
  if (!Array.isArray(manifest.legacySubsets.targeted12) || !Array.isArray(manifest.legacySubsets.preflight140)) {
    throw new Error('ami_brain_suite_manifest_legacy_subsets_invalid');
  }
  assertProductJourneys(manifest.productJourneys);
  return manifest;
}

export function validateAmiBrainSuiteManifest(
  manifest: AmiBrainSuiteManifest,
  source: { checksum: string; caseIds: string[]; supplementalCaseIds?: string[] },
) {
  const productLoopPolicy = isRecord(manifest.governancePolicy.productLoopPolicy)
    ? manifest.governancePolicy.productLoopPolicy
    : undefined;
  if (
    productLoopPolicy?.eligibleStatus !== 'current_release_test' ||
    !Array.isArray(productLoopPolicy.requiredEvidence) ||
    !['management_entry', 'backend_api', 'data_facts'].every((item) =>
      productLoopPolicy.requiredEvidence.includes(item),
    )
  ) {
    throw new Error('ami_brain_suite_manifest_product_loop_policy_invalid');
  }
  const baselineIds = new Set(source.caseIds);
  const supplementalIds = new Set(source.supplementalCaseIds ?? []);
  if ([...supplementalIds].some((id) => baselineIds.has(id))) {
    throw new Error('ami_brain_suite_manifest_supplemental_id_overlap');
  }
  const sourceIds = new Set([...baselineIds, ...supplementalIds]);
  if (manifest.sourceBaseline.checksum !== source.checksum) {
    throw new Error('ami_brain_suite_manifest_source_checksum_mismatch');
  }
  if (
    manifest.productLoopEligibility.sourceBaselineChecksum !== source.checksum ||
    manifest.productLoopEligibility.baselineCaseCount !== source.caseIds.length ||
    manifest.productLoopEligibility.supplementalRegistry.caseCount !== supplementalIds.size
  ) {
    throw new Error('ami_brain_suite_manifest_product_loop_source_invalid');
  }
  if (manifest.sourceBaseline.caseCount !== source.caseIds.length || baselineIds.size !== source.caseIds.length) {
    throw new Error('ami_brain_suite_manifest_source_count_invalid');
  }
  const releaseCore = manifest.suites.releaseCore;
  const standard = manifest.suites.standardRegression;
  const rotation = manifest.suites.extendedRotation;
  const nextIteration = manifest.suites.nextIterationFeature;
  const evidenceReview = manifest.suites.evidenceReviewRequired;
  const metricDefinition = manifest.suites.metricDefinitionGovernanceRequired;
  const governedSuites = [releaseCore, standard, rotation, nextIteration, evidenceReview, metricDefinition].filter(
    (suite): suite is AmiBrainSuiteDefinition => Boolean(suite),
  );
  for (const suite of governedSuites) {
    if (suite.caseCount !== suite.caseIds.length || new Set(suite.caseIds).size !== suite.caseIds.length) {
      throw new Error(`ami_brain_suite_manifest_case_count_invalid:${suite.key}`);
    }
    if (suite.caseIdsChecksum !== caseIdsChecksum(suite.caseIds)) {
      throw new Error(`ami_brain_suite_manifest_case_ids_checksum_invalid:${suite.key}`);
    }
    const missing = suite.caseIds.filter((id) => !sourceIds.has(id));
    if (missing.length) throw new Error(`ami_brain_suite_manifest_unknown_case_ids:${suite.key}:${missing.join(',')}`);
  }
  assertSubset('legacy_targeted', manifest.legacySubsets.targeted12, releaseCore.caseIds);
  assertSubset('legacy_preflight', manifest.legacySubsets.preflight140, releaseCore.caseIds);
  assertSubset('release_core', releaseCore.caseIds, standard.caseIds);
  if (standard.includesSuite !== releaseCore.key) {
    throw new Error('ami_brain_suite_manifest_standard_parent_invalid');
  }
  const covered = new Set([
    ...standard.caseIds,
    ...rotation.caseIds,
    ...(nextIteration?.caseIds ?? []),
    ...(evidenceReview?.caseIds ?? []),
    ...(metricDefinition?.caseIds ?? []),
  ]);
  if (covered.size !== sourceIds.size || [...sourceIds].some((id) => !covered.has(id))) {
    throw new Error('ami_brain_suite_manifest_baseline_coverage_invalid');
  }
  const standardIds = new Set(standard.caseIds);
  const overlap = rotation.caseIds.filter((id) => standardIds.has(id));
  if (overlap.length) throw new Error(`ami_brain_suite_manifest_rotation_overlap:${overlap.join(',')}`);
  const executableIds = new Set([...standard.caseIds, ...rotation.caseIds]);
  const nextIterationOverlap = nextIteration?.caseIds.filter((id) => executableIds.has(id)) ?? [];
  if (nextIterationOverlap.length) {
    throw new Error(`ami_brain_suite_manifest_next_iteration_executable_overlap:${nextIterationOverlap.join(',')}`);
  }
  const evidenceReviewOverlap = evidenceReview?.caseIds.filter((id) => executableIds.has(id)) ?? [];
  if (evidenceReviewOverlap.length) {
    throw new Error(`ami_brain_suite_manifest_evidence_review_executable_overlap:${evidenceReviewOverlap.join(',')}`);
  }
  const metricDefinitionOverlap = metricDefinition?.caseIds.filter((id) => executableIds.has(id)) ?? [];
  if (metricDefinitionOverlap.length) {
    throw new Error(
      `ami_brain_suite_manifest_metric_definition_governance_executable_overlap:${metricDefinitionOverlap.join(',')}`,
    );
  }
  validateProductJourneySuiteMembership(manifest);
  return manifest;
}

export function validateAmiBrainProductLoopEligibility(
  manifest: AmiBrainSuiteManifest,
  raw: string,
  dataFactsRaw: string,
  supplementalRegistryRaw: string,
) {
  const metadata = manifest.productLoopEligibility;
  if (sha256(raw) !== metadata.checksum) throw new Error('ami_brain_product_loop_eligibility_checksum_mismatch');
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value) || value.schemaVersion !== metadata.schemaVersion || !Array.isArray(value.cases)) {
    throw new Error('ami_brain_product_loop_eligibility_shape_invalid');
  }
  if (
    value.sourceBaselineChecksum !== manifest.sourceBaseline.checksum ||
    value.cases.length !== metadata.caseCount ||
    value.baselineCaseCount !== metadata.baselineCaseCount ||
    value.caseIdsChecksum !== metadata.caseIdsChecksum
  ) {
    throw new Error('ami_brain_product_loop_eligibility_source_invalid');
  }
  const dataFactsMetadata = metadata.dataFactsAudit;
  const supplementalRegistryMetadata = metadata.supplementalRegistry;
  if (sha256(supplementalRegistryRaw) !== supplementalRegistryMetadata.checksum) {
    throw new Error('ami_brain_supplemental_question_registry_checksum_mismatch');
  }
  const supplementalRegistry = JSON.parse(supplementalRegistryRaw) as Record<string, any>;
  if (
    supplementalRegistry.schemaVersion !== supplementalRegistryMetadata.schemaVersion ||
    !Array.isArray(supplementalRegistry.cases) ||
    supplementalRegistry.cases.length !== supplementalRegistryMetadata.caseCount ||
    JSON.stringify((value as Record<string, any>).supplementalRegistry) !==
      JSON.stringify(supplementalRegistryMetadata)
  ) {
    throw new Error('ami_brain_supplemental_question_registry_source_invalid');
  }
  if (sha256(dataFactsRaw) !== dataFactsMetadata.checksum) {
    throw new Error('ami_brain_product_loop_data_facts_checksum_mismatch');
  }
  const dataFacts = JSON.parse(dataFactsRaw) as Record<string, any>;
  if (
    dataFacts.schemaVersion !== dataFactsMetadata.schemaVersion ||
    dataFacts.schemaChecksum !== dataFactsMetadata.schemaChecksum ||
    dataFacts.snapshotChecksum !== dataFactsMetadata.snapshotChecksum ||
    dataFacts.databaseHost !== dataFactsMetadata.databaseHost ||
    dataFacts.storeId !== dataFactsMetadata.storeId ||
    JSON.stringify((value as Record<string, any>).dataFactsAudit) !== JSON.stringify(dataFactsMetadata)
  ) {
    throw new Error('ami_brain_product_loop_data_facts_source_invalid');
  }
  const cases = value.cases as Array<Record<string, any>>;
  const ids = cases.map((item) => item.id);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('ami_brain_product_loop_eligibility_case_ids_invalid');
  }
  if (caseIdsChecksum(ids) !== metadata.caseIdsChecksum) {
    throw new Error('ami_brain_product_loop_eligibility_case_ids_checksum_mismatch');
  }
  const supplementalIds = new Set(supplementalRegistry.cases.map((item: Record<string, any>) => item.id));
  if (
    supplementalIds.size !== supplementalRegistryMetadata.caseCount ||
    cases.slice(metadata.baselineCaseCount).some((item) => !supplementalIds.has(item.id)) ||
    cases.slice(0, metadata.baselineCaseCount).some((item) => supplementalIds.has(item.id))
  ) {
    throw new Error('ami_brain_supplemental_question_registry_case_ids_invalid');
  }
  const statuses = new Map<string, string>();
  const eligibilityCasesById = new Map<string, Record<string, any>>();
  for (const item of cases) {
    if (
      ![
        'current_release_test',
        'next_iteration_feature',
        'evidence_review_required',
        'metric_definition_governance_required',
      ].includes(item.status)
    ) {
      throw new Error(`ami_brain_product_loop_eligibility_status_invalid:${item.id}`);
    }
    if (item.status === 'current_release_test') {
      if (
        item.evidence?.managementEntry?.status !== 'present' ||
        item.evidence?.backendApi?.status !== 'present' ||
        item.evidence?.dataFacts?.status !== 'present' ||
        item.evidence?.dataFacts?.auditSnapshotChecksum !== dataFactsMetadata.snapshotChecksum ||
        !Array.isArray(item.missingComponents) ||
        item.missingComponents.length
      ) {
        throw new Error(`ami_brain_product_loop_eligibility_evidence_incomplete:${item.id}`);
      }
    }
    if (
      supplementalIds.has(item.id) &&
      item.status !== 'evidence_review_required' &&
      (item.source !== 'supplemental_question_registry_v1' ||
        item.admission?.source !== 'supplemental_question_registry_v1' ||
        !isSha256(item.admission?.questionChecksum) ||
        !isSha256(item.admission?.reviewChecksum) ||
        typeof item.admission?.reviewedBy !== 'string' ||
        typeof item.admission?.reviewedAt !== 'string')
    ) {
      throw new Error(`ami_brain_supplemental_question_admission_invalid:${item.id}`);
    }
    statuses.set(item.id, item.status);
    eligibilityCasesById.set(item.id, item);
  }
  for (const suite of [manifest.suites.releaseCore, manifest.suites.standardRegression, manifest.suites.extendedRotation]) {
    const ineligible = suite.caseIds.filter((id) => statuses.get(id) !== 'current_release_test');
    if (ineligible.length) {
      throw new Error(`ami_brain_product_loop_eligibility_executable_invalid:${suite.key}:${ineligible.join(',')}`);
    }
  }
  const nextIteration = cases.filter((item) => item.status === 'next_iteration_feature').map((item) => item.id);
  const evidenceReview = cases.filter((item) => item.status === 'evidence_review_required').map((item) => item.id);
  const metricDefinition = cases
    .filter((item) => item.status === 'metric_definition_governance_required')
    .map((item) => item.id);
  assertSameIds('next_iteration', manifest.suites.nextIterationFeature?.caseIds ?? [], nextIteration);
  assertSameIds('evidence_review', manifest.suites.evidenceReviewRequired?.caseIds ?? [], evidenceReview);
  assertSameIds(
    'metric_definition_governance',
    manifest.suites.metricDefinitionGovernanceRequired?.caseIds ?? [],
    metricDefinition,
  );
  const currentIds = cases.filter((item) => item.status === 'current_release_test').map((item) => item.id);
  const releaseCoreIds = new Set(manifest.suites.releaseCore.caseIds);
  const standardIds = new Set(manifest.suites.standardRegression.caseIds);
  const rotationIds = new Set(manifest.suites.extendedRotation.caseIds);
  const uncoveredCurrent = currentIds.filter((id) => !standardIds.has(id) && !rotationIds.has(id));
  if (uncoveredCurrent.length) {
    throw new Error(`ami_brain_product_loop_current_uncovered:${uncoveredCurrent.join(',')}`);
  }
  for (const item of cases.slice(metadata.baselineCaseCount)) {
    if (item.status !== 'current_release_test') continue;
    const assignment = item.admission?.suiteAssignment;
    const membership: Record<string, boolean> = {
      'release-core': releaseCoreIds.has(item.id) && standardIds.has(item.id) && !rotationIds.has(item.id),
      'standard-regression': !releaseCoreIds.has(item.id) && standardIds.has(item.id) && !rotationIds.has(item.id),
      'extended-rotation': !releaseCoreIds.has(item.id) && !standardIds.has(item.id) && rotationIds.has(item.id),
    };
    if (!membership[assignment]) {
      throw new Error(`ami_brain_supplemental_suite_assignment_mismatch:${item.id}:${assignment ?? 'missing'}`);
    }
  }
  for (const journey of manifest.productJourneys.cases) {
    const eligibility = eligibilityCasesById.get(journey.caseId);
    if (!eligibility) {
      throw new Error(`ami_brain_product_journey_eligibility_missing:${journey.caseId}`);
    }
    if (journey.status !== eligibility.status) {
      throw new Error(`ami_brain_product_journey_status_mismatch:${journey.caseId}`);
    }
    if (journey.question !== eligibility.question) {
      throw new Error(`ami_brain_product_journey_question_mismatch:${journey.caseId}`);
    }
  }
  return value;
}

export function selectAmiBrainSuiteCaseIds(manifest: AmiBrainSuiteManifest, stage: AmiBrainSuiteStage) {
  if (stage === 'release-core') return manifest.suites.releaseCore.caseIds;
  if (stage === 'standard-regression') return manifest.suites.standardRegression.caseIds;
  return manifest.suites.extendedRotation.caseIds;
}

export function standardRegressionDeltaCaseIds(manifest: AmiBrainSuiteManifest) {
  const core = new Set(manifest.suites.releaseCore.caseIds);
  return manifest.suites.standardRegression.caseIds.filter((id) => !core.has(id));
}

export function caseIdsChecksum(caseIds: string[]) {
  return createHash('sha256').update(caseIds.join('\n'), 'utf8').digest('hex');
}

function assertSuiteDefinition(value: unknown, name: string): asserts value is AmiBrainSuiteDefinition {
  if (
    !isRecord(value) ||
    typeof value.key !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.caseCount !== 'number' ||
    typeof value.caseIdsChecksum !== 'string' ||
    !Array.isArray(value.caseIds) ||
    value.caseIds.some((id) => typeof id !== 'string')
  ) {
    throw new Error(`ami_brain_suite_manifest_suite_invalid:${name}`);
  }
}

function assertProductJourneys(value: unknown): asserts value is AmiBrainSuiteManifest['productJourneys'] {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'ami-brain-product-journeys/v1' ||
    typeof value.policy !== 'string' ||
    !value.policy.trim() ||
    !isSha256(value.currentReleaseCaseIdsChecksum) ||
    !Array.isArray(value.cases) ||
    !value.cases.length
  ) {
    throw new Error('ami_brain_suite_manifest_product_journeys_invalid');
  }
  const caseIds = new Set<string>();
  const journeyKeys = new Set<string>();
  for (const item of value.cases) {
    if (
      !isRecord(item) ||
      typeof item.caseId !== 'string' ||
      !item.caseId ||
      typeof item.question !== 'string' ||
      !item.question ||
      !Array.isArray(item.journeyKeys) ||
      !item.journeyKeys.length ||
      item.journeyKeys.some((key: unknown) => typeof key !== 'string' || !key) ||
      ![
        'current_release_test',
        'next_iteration_feature',
        'evidence_review_required',
        'metric_definition_governance_required',
      ].includes(item.status) ||
      ![
        'release-core',
        'standard-regression',
        'extended-rotation',
        'next-iteration-feature',
        'evidence-review-required',
        'metric-definition-governance-required',
      ].includes(item.suite) ||
      typeof item.executable !== 'boolean' ||
      !Array.isArray(item.fixtureReferences) ||
      !item.fixtureReferences.length
    ) {
      throw new Error('ami_brain_suite_manifest_product_journey_case_invalid');
    }
    if (caseIds.has(item.caseId)) {
      throw new Error(`ami_brain_suite_manifest_product_journey_case_duplicate:${item.caseId}`);
    }
    caseIds.add(item.caseId);
    const localJourneyKeys = new Set<string>();
    for (const key of item.journeyKeys) {
      if (localJourneyKeys.has(key) || journeyKeys.has(key)) {
        throw new Error(`ami_brain_suite_manifest_product_journey_key_duplicate:${key}`);
      }
      localJourneyKeys.add(key);
      journeyKeys.add(key);
    }
    for (const reference of item.fixtureReferences) {
      if (
        !isRecord(reference) ||
        typeof reference.path !== 'string' ||
        !reference.path ||
        reference.marker !== item.caseId ||
        reference.questionMarker !== item.question
      ) {
        throw new Error(`ami_brain_suite_manifest_product_journey_fixture_invalid:${item.caseId}`);
      }
    }
    assertProductJourneyStatusContract(item as AmiBrainProductJourneyCase);
  }
  const currentReleaseCaseIds = value.cases
    .filter((item: Record<string, any>) => item.status === 'current_release_test')
    .map((item: Record<string, any>) => item.caseId);
  if (caseIdsChecksum(currentReleaseCaseIds) !== value.currentReleaseCaseIdsChecksum) {
    throw new Error('ami_brain_suite_manifest_product_journey_checksum_invalid');
  }
}

function assertProductJourneyStatusContract(item: AmiBrainProductJourneyCase) {
  const executableSuites = new Set<AmiBrainProductJourneySuite>([
    'release-core',
    'standard-regression',
    'extended-rotation',
  ]);
  if (item.status === 'current_release_test') {
    if (!item.executable || !executableSuites.has(item.suite)) {
      throw new Error(`ami_brain_suite_manifest_product_journey_execution_invalid:${item.caseId}`);
    }
    return;
  }
  const expectedSuite =
    item.status === 'next_iteration_feature'
      ? 'next-iteration-feature'
      : item.status === 'metric_definition_governance_required'
        ? 'metric-definition-governance-required'
        : 'evidence-review-required';
  if (item.executable || item.suite !== expectedSuite) {
    throw new Error(`ami_brain_suite_manifest_product_journey_execution_invalid:${item.caseId}`);
  }
}

function validateProductJourneySuiteMembership(manifest: AmiBrainSuiteManifest) {
  const releaseCoreIds = new Set(manifest.suites.releaseCore.caseIds);
  const standardIds = new Set(manifest.suites.standardRegression.caseIds);
  const rotationIds = new Set(manifest.suites.extendedRotation.caseIds);
  const nextIterationIds = new Set(manifest.suites.nextIterationFeature?.caseIds ?? []);
  const evidenceReviewIds = new Set(manifest.suites.evidenceReviewRequired?.caseIds ?? []);
  const metricDefinitionIds = new Set(manifest.suites.metricDefinitionGovernanceRequired?.caseIds ?? []);
  for (const item of manifest.productJourneys.cases) {
    const actualSuite: AmiBrainProductJourneySuite | undefined = releaseCoreIds.has(item.caseId)
      ? 'release-core'
      : standardIds.has(item.caseId)
        ? 'standard-regression'
        : rotationIds.has(item.caseId)
          ? 'extended-rotation'
          : nextIterationIds.has(item.caseId)
            ? 'next-iteration-feature'
            : evidenceReviewIds.has(item.caseId)
              ? 'evidence-review-required'
              : metricDefinitionIds.has(item.caseId)
                ? 'metric-definition-governance-required'
                : undefined;
    if (actualSuite !== item.suite) {
      throw new Error(
        `ami_brain_suite_manifest_product_journey_suite_mismatch:${item.caseId}:${actualSuite ?? 'unassigned'}`,
      );
    }
  }
}

function assertSubset(label: string, subset: string[], superset: string[]) {
  const values = new Set(superset);
  const missing = subset.filter((id) => !values.has(id));
  if (missing.length) throw new Error(`ami_brain_suite_manifest_subset_invalid:${label}:${missing.join(',')}`);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSha256(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/iu.test(value);
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertSameIds(label: string, actual: string[], expected: string[]) {
  if (actual.length !== expected.length) throw new Error(`ami_brain_product_loop_eligibility_suite_mismatch:${label}`);
  const expectedIds = new Set(expected);
  const missing = actual.filter((id) => !expectedIds.has(id));
  if (missing.length) {
    throw new Error(`ami_brain_product_loop_eligibility_suite_mismatch:${label}:${missing.join(',')}`);
  }
}
