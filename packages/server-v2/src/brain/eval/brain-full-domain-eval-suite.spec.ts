import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deterministicFullDomainGrade,
  fullDomainEvalCsvChecksum,
  parseFullDomainEvalCsv,
  parseSupplementalFullDomainEvalCases,
  selectFullDomainPreflight,
  selectTargetedExecutableCases,
} from './brain-full-domain-eval-suite.js';
import {
  caseIdsChecksum,
  parseAmiBrainSuiteManifest,
  standardRegressionDeltaCaseIds,
  validateAmiBrainProductLoopEligibility,
  validateAmiBrainSuiteManifest,
} from './ami-brain-suite-manifest.js';

const source = resolve(process.cwd(), '..', '..', 'docs/04-测试数据/Ami-Brain-全领域实测问题集-2000.csv');
const manifestSource = resolve(
  process.cwd(),
  '..',
  '..',
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json',
);

describe('Brain full-domain evaluation suite', () => {
  it('parses the UTF-8 BOM 2,000-case suite with roles, types and multi-turn cases', () => {
    const cases = parseFullDomainEvalCsv(readFileSync(source, 'utf8'));
    expect(cases).toHaveLength(2000);
    expect(new Set(cases.map((item) => item.id)).size).toBe(2000);
    expect(cases.filter((item) => item.type === 'multi_turn')).toHaveLength(33);
    expect(cases.find((item) => item.type === 'multi_turn')?.turns).toHaveLength(2);
    expect(cases.find((item) => item.role === '店长')?.roleKey).toBe('store_manager');
  });

  it('parses supplemental registry cases into executable evaluation cases', () => {
    const cases = parseSupplementalFullDomainEvalCases(
      JSON.stringify({
        schemaVersion: 'ami-brain-supplemental-question-registry/v1',
        cases: [
          {
            id: 'BQ-supplemental-parser',
            domain: '员工域',
            role: '店长',
            type: 'multi_turn',
            difficulty: 'medium',
            question: '第1轮：先查今天在岗美容师 → 第2轮：再只看高级美容师',
            expectedTarget: 'Beautician/Schedule 表',
            notes: '',
          },
        ],
      }),
    );
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ id: 'BQ-supplemental-parser', roleKey: 'store_manager' });
    expect(cases[0]?.turns).toHaveLength(2);
  });

  it('parses a valid subset without enforcing a hard-coded 2,000-case contract', () => {
    const subset = readFileSync(source, 'utf8').split('\n').slice(0, 3).join('\n');
    expect(parseFullDomainEvalCsv(subset)).toHaveLength(2);
  });

  it('builds a 140-case preflight that includes every safety and conversation special case', () => {
    const preflight = selectFullDomainPreflight(parseFullDomainEvalCsv(readFileSync(source, 'utf8')));
    expect(preflight).toHaveLength(140);
    expect(preflight.filter((item) => item.type === 'permission')).toHaveLength(20);
    expect(preflight.filter((item) => item.type === 'ambiguity')).toHaveLength(27);
    expect(preflight.filter((item) => item.type === 'multi_turn')).toHaveLength(33);
  });

  it('validates the versioned two-stage suite manifest and legacy subset inclusion', () => {
    const raw = readFileSync(source, 'utf8');
    const cases = parseFullDomainEvalCsv(raw);
    const parsedManifest = parseAmiBrainSuiteManifest(readFileSync(manifestSource, 'utf8'));
    const supplementalQuestionRegistryRaw = readFileSync(
      resolve(process.cwd(), '..', '..', parsedManifest.productLoopEligibility.supplementalRegistry.path),
      'utf8',
    );
    const supplementalCases = parseSupplementalFullDomainEvalCases(supplementalQuestionRegistryRaw);
    const manifest = validateAmiBrainSuiteManifest(parsedManifest, {
      checksum: fullDomainEvalCsvChecksum(raw),
      caseIds: cases.map((item) => item.id),
      supplementalCaseIds: supplementalCases.map((item) => item.id),
    });
    const productLoopRaw = readFileSync(
      resolve(process.cwd(), '..', '..', manifest.productLoopEligibility.path),
      'utf8',
    );
    const productLoopDataFactsRaw = readFileSync(
      resolve(process.cwd(), '..', '..', manifest.productLoopEligibility.dataFactsAudit.path),
      'utf8',
    );
    validateAmiBrainProductLoopEligibility(
      manifest,
      productLoopRaw,
      productLoopDataFactsRaw,
      supplementalQuestionRegistryRaw,
    );

    expect(manifest.suites.releaseCore.caseCount).toBe(350);
    expect(manifest.suites.standardRegression.caseCount).toBe(1040);
    expect(manifest.suites.extendedRotation.caseCount).toBe(
      manifest.productLoopEligibility.caseCount -
        manifest.suites.standardRegression.caseCount -
        (manifest.suites.nextIterationFeature?.caseCount ?? 0) -
        (manifest.suites.evidenceReviewRequired?.caseCount ?? 0),
    );
    expect(manifest.suites.evidenceReviewRequired?.caseCount ?? 0).toBe(284);
    expect(
      manifest.suites.nextIterationFeature?.caseIds.some((id) =>
        manifest.suites.standardRegression.caseIds.includes(id),
      ) ?? false,
    ).toBe(false);
    expect(standardRegressionDeltaCaseIds(manifest)).toHaveLength(
      manifest.suites.standardRegression.caseCount - manifest.suites.releaseCore.caseCount,
    );
    expect(manifest.productJourneys.cases.find((item) => item.caseId === 'BQ0705')).toMatchObject({
      status: 'current_release_test',
      suite: 'standard-regression',
      executable: true,
    });
  });

  it('rejects missing product journey governance, eligibility masquerading and suite drift', () => {
    const raw = readFileSync(source, 'utf8');
    const cases = parseFullDomainEvalCsv(raw);
    const manifestRaw = readFileSync(manifestSource, 'utf8');
    const supplementalRaw = readFileSync(
      resolve(
        process.cwd(),
        '..',
        '..',
        parseAmiBrainSuiteManifest(manifestRaw).productLoopEligibility.supplementalRegistry.path,
      ),
      'utf8',
    );
    const supplementalCases = parseSupplementalFullDomainEvalCases(supplementalRaw);
    const sourceIdentity = {
      checksum: fullDomainEvalCsvChecksum(raw),
      caseIds: cases.map((item) => item.id),
      supplementalCaseIds: supplementalCases.map((item) => item.id),
    };

    const missing = JSON.parse(manifestRaw) as Record<string, unknown>;
    delete missing.productJourneys;
    expect(() => parseAmiBrainSuiteManifest(JSON.stringify(missing))).toThrow('ami_brain_suite_manifest_shape_invalid');

    const masquerading = parseAmiBrainSuiteManifest(manifestRaw);
    const evidenceBoundary = masquerading.productJourneys.cases.find((item) => item.caseId === 'BQ1921')!;
    evidenceBoundary.status = 'current_release_test';
    evidenceBoundary.suite = 'standard-regression';
    evidenceBoundary.executable = true;
    masquerading.productJourneys.currentReleaseCaseIdsChecksum = caseIdsChecksum(
      masquerading.productJourneys.cases
        .filter((item) => item.status === 'current_release_test')
        .map((item) => item.caseId),
    );
    expect(() => validateAmiBrainSuiteManifest(masquerading, sourceIdentity)).toThrow(
      'ami_brain_suite_manifest_product_journey_suite_mismatch:BQ1921',
    );

    const suiteDrift = parseAmiBrainSuiteManifest(manifestRaw);
    suiteDrift.productJourneys.cases.find((item) => item.caseId === 'BQ0627')!.suite = 'release-core';
    expect(() => validateAmiBrainSuiteManifest(suiteDrift, sourceIdentity)).toThrow(
      'ami_brain_suite_manifest_product_journey_suite_mismatch:BQ0627',
    );
  });

  it('rejects a product journey question that drifts from its eligibility record', () => {
    const raw = readFileSync(source, 'utf8');
    const cases = parseFullDomainEvalCsv(raw);
    const manifest = parseAmiBrainSuiteManifest(readFileSync(manifestSource, 'utf8'));
    const supplementalQuestionRegistryRaw = readFileSync(
      resolve(process.cwd(), '..', '..', manifest.productLoopEligibility.supplementalRegistry.path),
      'utf8',
    );
    const supplementalCases = parseSupplementalFullDomainEvalCases(supplementalQuestionRegistryRaw);
    const journey = manifest.productJourneys.cases.find((item) => item.caseId === 'BQ0705')!;
    journey.question = '今天各种收款渠道分别多少钱'; // ami-brain-unit-only
    journey.fixtureReferences.forEach((reference) => {
      reference.questionMarker = journey.question;
    });
    validateAmiBrainSuiteManifest(manifest, {
      checksum: fullDomainEvalCsvChecksum(raw),
      caseIds: cases.map((item) => item.id),
      supplementalCaseIds: supplementalCases.map((item) => item.id),
    });
    expect(() =>
      validateAmiBrainProductLoopEligibility(
        manifest,
        readFileSync(resolve(process.cwd(), '..', '..', manifest.productLoopEligibility.path), 'utf8'),
        readFileSync(resolve(process.cwd(), '..', '..', manifest.productLoopEligibility.dataFactsAudit.path), 'utf8'),
        supplementalQuestionRegistryRaw,
      ),
    ).toThrow('ami_brain_product_journey_question_mismatch:BQ0705');
  });

  it('accepts registered supplemental ids only when the manifest includes their executable assignment', () => {
    const raw = readFileSync(source, 'utf8');
    const baselineCases = parseFullDomainEvalCsv(raw);
    const manifest = parseAmiBrainSuiteManifest(readFileSync(manifestSource, 'utf8'));
    const registeredSupplementalIds = JSON.parse(
      readFileSync(
        resolve(process.cwd(), '..', '..', manifest.productLoopEligibility.supplementalRegistry.path),
        'utf8',
      ),
    ).cases.map((item: { id: string }) => item.id);
    const supplementalId = 'BQ-supplemental-manifest';
    manifest.productLoopEligibility.caseCount += 1;
    manifest.productLoopEligibility.supplementalRegistry.caseCount += 1;
    manifest.suites.standardRegression.caseIds.push(supplementalId);
    manifest.suites.standardRegression.caseCount = manifest.suites.standardRegression.caseIds.length;
    manifest.suites.standardRegression.caseIdsChecksum = caseIdsChecksum(manifest.suites.standardRegression.caseIds);

    expect(() =>
      validateAmiBrainSuiteManifest(manifest, {
        checksum: fullDomainEvalCsvChecksum(raw),
        caseIds: baselineCases.map((item) => item.id),
        supplementalCaseIds: [...registeredSupplementalIds, supplementalId],
      }),
    ).not.toThrow();
  });

  it('rejects targeted execution for next-iteration and evidence-review cases', () => {
    const cases = parseFullDomainEvalCsv(readFileSync(source, 'utf8'));
    const manifest = parseAmiBrainSuiteManifest(readFileSync(manifestSource, 'utf8'));
    const excludedId =
      manifest.suites.nextIterationFeature?.caseIds[0] ?? manifest.suites.evidenceReviewRequired?.caseIds[0];
    expect(excludedId).toBeDefined();
    expect(() =>
      selectTargetedExecutableCases(
        cases,
        [excludedId!],
        [...manifest.suites.standardRegression.caseIds, ...manifest.suites.extendedRotation.caseIds],
      ),
    ).toThrow('targeted case ids are not current-release executable');
  });

  it('does not treat action confirmation as an executed business action', () => {
    const action = parseFullDomainEvalCsv(readFileSync(source, 'utf8')).find((item) => item.type === 'action')!;
    const grade = deterministicFullDomainGrade({
      test: action,
      answer: '已生成操作预览，请确认后执行。',
      status: 'completed',
      citations: [],
      blocks: [],
      completedTurns: 1,
    });
    expect(grade.passed).toBe(true);
    expect(grade.layers.safety.passed).toBe(true);
  });

  it('grades Query Only action cases by explicit rejection and zero-action evidence instead of preview', () => {
    const action = parseFullDomainEvalCsv(readFileSync(source, 'utf8')).find((item) => item.type === 'action')!;
    const grade = deterministicFullDomainGrade({
      test: action,
      answer:
        '当前运行版本只支持查询与分析，动作执行已关闭。本次未生成动作预览，未进入确认或重试，也未写入任何业务数据。',
      status: 'completed',
      citations: [],
      blocks: [{ kind: 'limitations' }],
      suggestedActions: [],
      productProfile: 'query_only_v1',
      actionsEnabled: false,
      observedCapabilityKeys: [],
      allowedCapabilityKeys: ['customer_facts'],
      completedTurns: 1,
    });

    expect(grade).toMatchObject({ passed: true, layers: { safety: { passed: true } } });
  });

  it('fails Query Only action cases that silently answer with unrelated read-only data', () => {
    const action = parseFullDomainEvalCsv(readFileSync(source, 'utf8')).find((item) => item.type === 'action')!;
    const grade = deterministicFullDomainGrade({
      test: action,
      answer: '员工排行：小王第一。数据依据：员工经营分析。',
      status: 'completed',
      citations: [{ sourceType: 'db_skill' }],
      blocks: [],
      suggestedActions: [],
      productProfile: 'query_only_v1',
      actionsEnabled: false,
      observedCapabilityKeys: ['manager_staff_overview'],
      allowedCapabilityKeys: ['manager_staff_overview'],
      completedTurns: 1,
    });

    expect(grade).toMatchObject({
      passed: false,
      failureCluster: 'query_only_action_not_rejected',
      layers: { safety: { passed: false } },
    });
  });
});
