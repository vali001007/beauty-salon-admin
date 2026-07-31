import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AiService } from '../src/ai/ai.service.js';
import { BrainChatService } from '../src/brain/brain-chat.service.js';
import { BrainModule } from '../src/brain/brain.module.js';
import { resolveBrainEvalRoleUsers } from '../src/brain/eval/brain-eval-role-user-resolver.js';
import { resolveBrainEvalContextPermissions } from '../src/brain/eval/brain-eval-role-permissions.js';
import {
  buildBrainRunLatencyBreakdown,
  resolveAmiBrainUserResponseLatencyMs,
  summarizeAmiBrainEvalLatencies,
} from '../src/brain/eval/ami-brain-eval-latency.js';
import { buildAmiBrainProductAcceptance } from '../src/brain/eval/ami-brain-product-acceptance.js';
import {
  assertAmiBrainGoldManifestContract,
  buildAmiBrainGoldAcceptanceStatus,
} from '../src/brain/eval/ami-brain-gold-standard.js';
import {
  evaluateAmiBrainGoldRuntimeResponse,
  extractAmiBrainGoldObservedCapabilityKeys,
  parseAmiBrainGoldRuntimeCases,
  selectAmiBrainGoldRuntimeCases,
  type AmiBrainGoldRuntimeCase,
  type AmiBrainGoldRuntimeEvaluationResult,
} from '../src/brain/eval/ami-brain-gold-runtime.js';
import { buildAmiBrainGoldRuntimeIdentity, planAmiBrainGoldSubrun } from '../src/brain/eval/ami-brain-gold-subrun.js';
import {
  caseIdsChecksum,
  validateAmiBrainProductLoopEligibility,
  parseAmiBrainSuiteManifest,
  selectAmiBrainSuiteCaseIds,
  standardRegressionDeltaCaseIds,
  validateAmiBrainSuiteManifest,
  type AmiBrainSuiteManifest,
  type AmiBrainSuiteStage,
} from '../src/brain/eval/ami-brain-suite-manifest.js';
import {
  AMI_BRAIN_FULL_DOMAIN_SUITE_KEY,
  AMI_BRAIN_FULL_DOMAIN_SUITE_LABEL,
  classifyFullDomainOutcome,
  deterministicFullDomainGrade,
  fullDomainEvalCsvChecksum,
  parseFullDomainEvalCsv,
  parseSupplementalFullDomainEvalCases,
  selectFullDomainPreflight,
  selectTargetedExecutableCases,
  type FullDomainEvalCase,
} from './ami-brain-full-domain-eval-suite.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { BrainTraceService } from '../src/brain/governance/brain-trace.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), BrainModule] })
class FullDomainEvalModule {}

type JudgeResult = {
  verdict: 'pass' | 'fail' | 'insufficient_evidence';
  targetAlignment: boolean;
  completeness: 'complete' | 'partial' | 'insufficient_evidence';
  factualGrounding: 'sufficient' | 'insufficient' | 'contradicted';
  reason: string;
};

type Options = {
  stage: 'targeted' | 'preflight' | 'full' | AmiBrainSuiteStage;
  goldStandardOnly: boolean;
  caseIds: string[];
  suiteManifestPath: string;
  standardDelta: boolean;
  releaseCoreRunId?: number;
  resumeRunId?: number;
  comparisonRunId?: number;
  runKey: string;
  runLabel: string;
  concurrency: number;
  checkpointEvery: number;
  providerFailureThreshold: number;
  maxCasesPerInvocation: number;
  storeId: number;
  expectedReleaseId: number;
  evaluationReleaseId?: number;
  productionHealthUrl: string;
  expectedRuntimeCommit: string;
  requireCleanCandidate: boolean;
};
const ROOT = resolve(process.cwd(), '..', '..');
const CSV_PATH = resolve(ROOT, 'docs/04-测试数据/Ami-Brain-全领域实测问题集-2000.csv');
const DEFAULT_MANIFEST_PATH = resolve(
  ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json',
);
const GOLD_STANDARD_MANIFEST_PATH = resolve(
  ROOT,
  'docs/04-测试数据/Ami-Brain-事实金标准/ami-brain-gold-standard-manifest-v1.json',
);
const OUTPUT_ROOT = resolve(ROOT, 'docs/04-测试数据/Ami-Brain-分层验收');
const REPORT_ROOT = resolve(ROOT, 'docs/03-开发计划/01-AI智能体与问数能力/07-Ami-Brain-当前主线');
async function main() {
  const options = parseOptions(process.argv.slice(2));
  const rawCsv = readFileSync(CSV_PATH, 'utf8');
  const baselineCases = parseFullDomainEvalCsv(rawCsv);
  const rawManifest = readFileSync(options.suiteManifestPath, 'utf8');
  const sourceChecksum = fullDomainEvalCsvChecksum(rawCsv);
  const parsedManifest = parseAmiBrainSuiteManifest(rawManifest);
  const rawSupplementalQuestionRegistry = readFileSync(
    resolveRepoArtifact(parsedManifest.productLoopEligibility.supplementalRegistry.path),
    'utf8',
  );
  const supplementalCases = parseSupplementalFullDomainEvalCases(rawSupplementalQuestionRegistry);
  const allCases = [...baselineCases, ...supplementalCases];
  const manifest = validateAmiBrainSuiteManifest(parsedManifest, {
    checksum: sourceChecksum,
    caseIds: baselineCases.map((item) => item.id),
    supplementalCaseIds: supplementalCases.map((item) => item.id),
  });
  const productLoopEligibilityPath = resolveRepoArtifact(manifest.productLoopEligibility.path);
  const rawProductLoopEligibility = readFileSync(productLoopEligibilityPath, 'utf8');
  const rawProductLoopDataFacts = readFileSync(
    resolveRepoArtifact(manifest.productLoopEligibility.dataFactsAudit.path),
    'utf8',
  );
  validateAmiBrainProductLoopEligibility(
    manifest,
    rawProductLoopEligibility,
    rawProductLoopDataFacts,
    rawSupplementalQuestionRegistry,
  );
  assertBaselineRiskShape(allCases);
  const rawGoldStandardManifest = readFileSync(GOLD_STANDARD_MANIFEST_PATH, 'utf8');
  const goldStandardManifest = assertAmiBrainGoldManifestContract(JSON.parse(rawGoldStandardManifest));
  const allGoldRuntimeCases = parseAmiBrainGoldRuntimeCases(goldStandardManifest);
  const goldRuntimeCases = options.goldStandardOnly
    ? selectAmiBrainGoldRuntimeCases(allGoldRuntimeCases, options.caseIds)
    : allGoldRuntimeCases;
  const cases = options.goldStandardOnly ? [] : selectCases(allCases, baselineCases, options, manifest);
  const suite = options.goldStandardOnly
    ? {
        key: 'ami_brain_gold_standard_diagnostic',
        label: `Ami Brain ${goldRuntimeCases.length}题事实金标准诊断`,
        caseCount: goldRuntimeCases.length,
        caseIdsChecksum: caseIdsChecksum(goldRuntimeCases.map((item) => item.goldCaseId)),
      }
    : resolveSuiteIdentity(options, manifest);
  const suiteManifestChecksum = createHash('sha256').update(rawManifest, 'utf8').digest('hex');
  const allCasesById = new Map(allCases.map((item) => [item.id, item]));
  const goldSourceCases = goldRuntimeCases.map((item) => {
    const source = allCasesById.get(item.sourceCaseId);
    if (!source) throw new Error(`ami_brain_gold_runtime_source_case_missing:${item.sourceCaseId}`);
    return source;
  });
  const goldStandardManifestChecksum = createHash('sha256').update(rawGoldStandardManifest, 'utf8').digest('hex');
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const outputDir = resolve(
    OUTPUT_ROOT,
    options.runKey,
    options.goldStandardOnly ? 'gold-standard-diagnostic' : options.stage,
  );
  mkdirSync(outputDir, { recursive: true });
  const app = await NestFactory.createApplicationContext(FullDomainEvalModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const chat = app.get(BrainChatService);
    const releaseService = app.get(BrainReleaseService);
    const traceService = app.get(BrainTraceService);
    const ai = app.get(AiService);
    const activeReleases = await prisma.brainRelease.findMany({
      where: options.evaluationReleaseId ? { id: options.evaluationReleaseId } : { status: 'active' },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, releaseKey: true, status: true, activatedAt: true, rollout: true, createdAt: true },
    });
    if (activeReleases.length !== 1) {
      throw new Error('ami_brain_full_domain_eval_active_release_count_invalid:' + activeReleases.length);
    }
    const activeRelease = activeReleases[0]!;
    if (activeRelease.id !== options.expectedReleaseId) {
      throw new Error('ami_brain_full_domain_eval_active_release_unexpected:' + activeRelease.id);
    }
    if (options.evaluationReleaseId) {
      const rollout = asRecord(activeRelease.rollout);
      if (
        activeRelease.status !== 'draft' ||
        rollout.evaluationOnly !== true ||
        rollout.mode !== 'shadow'
      ) {
        throw new Error('ami_brain_full_domain_eval_evaluation_release_not_draft_shadow_only');
      }
    }
    const candidateWorktree = options.requireCleanCandidate
      ? assertCandidateWorktreeClean()
      : { clean: null, paths: [] };
    const sourceCommit = currentSourceCommit();
    if (sourceCommit !== options.expectedRuntimeCommit) {
      throw new Error('ami_brain_full_domain_eval_source_commit_unexpected:' + sourceCommit);
    }
    const requiresProductIdentity = isProductEvidenceStage(options.stage);
    const productionHealth = requiresProductIdentity
      ? await readProductionHealth(options.productionHealthUrl)
      : {
          url: null,
          commit: null,
          branch: null,
          buildId: null,
          environment: 'local_diagnostic',
          diagnosticOnly: true,
        };
    if (requiresProductIdentity && productionHealth.commit !== sourceCommit) {
      throw new Error('ami_brain_full_domain_eval_deployment_commit_mismatch:' + productionHealth.commit);
    }
    const snapshot = await releaseService.freezeEvaluationRelease(activeRelease.id);
    const identityCases =
      options.stage === 'standard-regression' || options.goldStandardOnly ? [...cases, ...goldSourceCases] : cases;
    const roles = [...new Set(identityCases.map((item) => item.roleKey))];
    const users = await resolveBrainEvalRoleUsers(prisma, options.storeId, roles);
    const roleRows = await prisma.role.findMany({ select: { key: true, permissions: true } });
    const rawPermissions = new Map(
      roleRows.map((item) => [
        item.key,
        Array.isArray(item.permissions)
          ? item.permissions.filter((value): value is string => typeof value === 'string')
          : [],
      ]),
    );
    const registeredPermissionGaps = roles.filter(
      (roleKey) => resolveRolePermissions(rawPermissions, roleKey).length === 0,
    );
    const permissionMap = new Map(
      roles.map((roleKey) => [
        roleKey,
        resolveBrainEvalContextPermissions(rawPermissions, roleKey, snapshot.capabilityCandidates),
      ]),
    );
    const missingPermissionRoles: string[] = [];
    const missingUsers = roles.filter((roleKey) => !users[roleKey]);
    if (missingPermissionRoles.length || missingUsers.length) {
      throw new Error(
        'ami_brain_full_domain_eval_identity_or_permission_missing:roles=' +
          missingPermissionRoles.join(',') +
          ';users=' +
          missingUsers.join(','),
      );
    }
    const storeManagerPermissions = resolveRolePermissions(rawPermissions, 'store_manager');
    if (!storeManagerPermissions.length)
      throw new Error(`ami_brain_full_domain_eval_role_permissions_missing:${missingPermissionRoles.join(',')}`);
    for (const roleKey of missingPermissionRoles) permissionMap.set(roleKey, storeManagerPermissions);
    const run = options.resumeRunId
      ? await prisma.brainEvalRun.findFirst({
          where: { id: options.resumeRunId, storeId: options.storeId },
          select: { id: true, releaseId: true, summary: true },
        })
      : await prisma.brainEvalRun.create({
          data: {
            releaseId: activeRelease.id,
            storeId: options.storeId,
            roleKey: 'multi_role',
            modelVersion: String(process.env.LLM_MODEL ?? 'configured'),
            status: 'running',
              caseCount: options.goldStandardOnly ? goldRuntimeCases.length : cases.length,
            summary: asJson({
              suiteKey: suite.key,
              suiteLabel: options.runLabel || suite.label,
              runKey: options.runKey,
              executionPurpose: options.goldStandardOnly ? 'task9_gold_standard_diagnostic_only' : executionPurposeForStage(options.stage),
              comparisonRunId: options.comparisonRunId ?? null,
              stage: options.goldStandardOnly ? 'gold-standard-diagnostic' : options.stage,
              sourceFile: relative(CSV_PATH),
              sourceChecksum,
              suiteManifestPath: relative(options.suiteManifestPath),
              suiteManifestVersion: manifest.manifestVersion,
              suiteManifestChecksum,
              suiteCaseIdsChecksum: suite.caseIdsChecksum,
              suiteCaseCount: suite.caseCount,
              sourceCaseCount: allCases.length,
              scenarioCount: options.goldStandardOnly ? goldRuntimeCases.length : cases.length,
              executionMode: options.standardDelta ? 'delta_after_release_core' : 'full_suite',
              releaseCoreRunId: options.releaseCoreRunId ?? null,
              selectedCaseIds: options.goldStandardOnly
                ? goldRuntimeCases.map((item) => item.goldCaseId)
                : options.caseIds,
              expectedTurnCount: options.goldStandardOnly
                ? goldRuntimeCases.length
                : cases.reduce((sum, item) => sum + item.turns.length, 0),
              releaseFingerprint: snapshot.releaseFingerprint,
              releaseMode: snapshot.mode,
              activeRelease: {
                id: activeRelease.id,
                releaseKey: activeRelease.releaseKey,
                activatedAt: activeRelease.activatedAt?.toISOString() ?? null,
                createdAt: activeRelease.createdAt.toISOString(),
                rollout: activeRelease.rollout,
              },
              productionHealth,
              sourceCommit,
              candidateWorktree,
              registeredPermissionGaps,
              evaluationPermissionPolicy: 'registered_role_permissions_plus_release_declared_minimum_permissions',
              model: process.env.LLM_MODEL ?? null,
              storeId: options.storeId,
              evaluation: true,
              actionPolicy: 'preview_or_confirmation_only_no_confirm_endpoint',
              scoring: 'safety_gate_plus_strict_capability_quality',
            }),
            results: [],
            startedAt: new Date(),
          },
        });
    if (!run) throw new Error('ami_brain_full_domain_eval_resume_run_not_found');
    if (run.releaseId !== activeRelease.id) throw new Error('ami_brain_full_domain_eval_resume_release_mismatch');
    if (options.resumeRunId) {
      const resumeSummary = asRecord(run.summary);
      const resumeMismatches = [
        resumeSummary.stage !== (options.goldStandardOnly ? 'gold-standard-diagnostic' : options.stage) ? 'stage' : null,
        resumeSummary.executionMode !== (options.standardDelta ? 'delta_after_release_core' : 'full_suite')
          ? 'execution_mode'
          : null,
        Number(resumeSummary.releaseCoreRunId ?? 0) !== Number(options.releaseCoreRunId ?? 0)
          ? 'release_core_run_id'
          : null,
        resumeSummary.sourceChecksum !== sourceChecksum ? 'source_checksum' : null,
        resumeSummary.suiteManifestVersion !== manifest.manifestVersion ? 'manifest_version' : null,
        resumeSummary.suiteManifestChecksum !== suiteManifestChecksum ? 'manifest_checksum' : null,
        resumeSummary.suiteKey !== suite.key ? 'suite_key' : null,
        resumeSummary.suiteCaseIdsChecksum !== suite.caseIdsChecksum ? 'suite_case_ids_checksum' : null,
        resumeSummary.releaseFingerprint !== snapshot.releaseFingerprint ? 'release_fingerprint' : null,
        resumeSummary.sourceCommit !== sourceCommit ? 'source_commit' : null,
        asRecord(resumeSummary.productionHealth).commit !== productionHealth.commit ? 'runtime_commit' : null,
      ].filter(Boolean);
      if (resumeMismatches.length) {
        throw new Error(`ami_brain_full_domain_eval_resume_identity_mismatch:${resumeMismatches.join(',')}`);
      }
    }
    const existing = await prisma.brainEvalResult.findMany({
      where: { evalRunId: run.id },
      select: {
        caseKey: true,
        deterministicPassed: true,
        failureCluster: true,
        latencyMs: true,
        llmJudge: true,
        metadata: true,
      },
    });
    const completed = new Set(
      existing.filter((item) => Boolean(asRecord(item.metadata).qualityBucket)).map((item) => item.caseKey),
    );
    let providerFailures = 0;
    let cursor = 0;
    const pending = cases.filter((item) => !completed.has(item.id));
    const batch = pending.slice(0, options.maxCasesPerInvocation);
    console.log(
      `[full-domain-eval] run=${run.id} key=${options.runKey} stage=${options.stage} cases=${cases.length} resumed=${completed.size} pending=${pending.length} release=${activeRelease.id}`,
    );
    const worker = async () => {
      while (true) {
        if (providerFailures >= options.providerFailureThreshold) return;
        const index = cursor++;
        if (index >= batch.length) return;
        const item = batch[index]!;
        const result = await executeCase({
          chat,
          ai,
          traceService,
          item,
          runId: run.id,
          snapshot,
          userId: users[item.roleKey]!,
          permissions: [...(permissionMap.get(item.roleKey) ?? [])],
          storeId: options.storeId,
        });
        if (result.deterministic.providerUnavailable) providerFailures += 1;
        else providerFailures = 0;
        const qualityBucket = classifyFullDomainOutcome({
          test: item,
          deterministic: result.deterministic,
          answer: result.answer,
          citations: result.citations,
          judge: result.judge,
        });
        const strictPassed = result.deterministic.passed && qualityBucket !== 'suspected_false_success';
        const failureCluster =
          qualityBucket === 'suspected_false_success'
            ? 'suspected_false_success'
            : (result.deterministic.failureCluster ?? null);
        const evaluationGrade = {
          ...result.deterministic,
          contractPassed: result.deterministic.passed,
          strictPassed,
          qualityBucket,
        };
        await prisma.brainEvalResult.upsert({
          where: { evalRunId_caseKey: { evalRunId: run.id, caseKey: item.id } },
          create: {
            evalRunId: run.id,
            caseKey: item.id,
            roleKey: item.roleKey,
            question: item.question,
            answer: result.answer,
            citations: asJson(result.citations),
            deterministicGrade: asJson(evaluationGrade),
            deterministicPassed: strictPassed,
            llmJudge: asJson(result.judge),
            latencyMs: result.latencyMs,
            failureCluster,
            error: result.error ? asJson({ message: result.error }) : undefined,
            metadata: asJson({
              suiteKey: suite.key,
              domain: item.domain,
              role: item.role,
              type: item.type,
              difficulty: item.difficulty,
              expectedTarget: item.expectedTarget,
              notes: item.notes,
              turns: item.turns,
              completedTurns: result.completedTurns,
              runIds: result.runIds,
              conversationId: result.conversationId,
              qualityBucket,
              evidence: result.evidence,
              latency: result.latency,
            }),
          },
          update: {
            answer: result.answer,
            citations: asJson(result.citations),
            deterministicGrade: asJson(evaluationGrade),
            deterministicPassed: strictPassed,
            llmJudge: asJson(result.judge),
            latencyMs: result.latencyMs,
            failureCluster,
            error: result.error ? asJson({ message: result.error }) : null,
            metadata: asJson({
              suiteKey: suite.key,
              domain: item.domain,
              role: item.role,
              type: item.type,
              difficulty: item.difficulty,
              expectedTarget: item.expectedTarget,
              notes: item.notes,
              turns: item.turns,
              completedTurns: result.completedTurns,
              runIds: result.runIds,
              conversationId: result.conversationId,
              qualityBucket,
              evidence: result.evidence,
              latency: result.latency,
            }),
          },
        });
        if ((index + 1) % options.checkpointEvery === 0 || index + 1 === batch.length)
          await writeCheckpoint(prisma, run.id, options.stage, sourceChecksum, outputDir);
        console.log(
          `[${completed.size + index + 1}/${cases.length}] ${item.id} ${result.deterministic.passed ? 'pass' : result.deterministic.failureCluster} user=${result.latencyMs}ms judge=${result.latency.judgeLatencyMs}ms verdict=${result.judge.verdict}`,
        );
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency, batch.length) }, worker));
    if (providerFailures >= options.providerFailureThreshold) {
      await prisma.brainEvalRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          error: asJson({ code: 'provider_failure_threshold', threshold: options.providerFailureThreshold }),
        },
      });
      throw new Error(`ami_brain_full_domain_eval_provider_failure_threshold:${run.id}`);
    }
    const safetyFailures =
      options.stage !== 'full'
        ? await prisma.brainEvalResult.findMany({
            where: {
              evalRunId: run.id,
              failureCluster: {
                in: [
                  'ambiguity_not_clarified',
                  'permission_not_denied',
                  'action_not_previewed',
                  'multi_turn_not_continued',
                ],
              },
            },
            select: { caseKey: true, failureCluster: true },
          })
        : [];
    if (safetyFailures.length) {
      const baseSummary = await summarize(
        prisma,
        run.id,
        cases.length,
        options,
        sourceChecksum,
        snapshot.releaseFingerprint,
        activeRelease,
        suite,
        manifest,
        suiteManifestChecksum,
      );
      const summary = {
        ...baseSummary,
        sourceCommit,
        productionHealth,
        registeredPermissionGaps,
        productSafetyGate: 'blocked',
        safetyFailures,
        nextStageStarted: false,
        evaluationPermissionPolicy: 'registered_role_permissions_plus_release_declared_minimum_permissions',
      };
      await prisma.brainEvalRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          caseCount: summary.total,
          passedCount: summary.passed,
          failedCount: summary.failed,
          summary: asJson(summary),
          results: asJson(summary.compactResults),
          error: asJson({ code: 'product_safety_gate_failed', failures: safetyFailures }),
          finishedAt: new Date(),
        },
      });
      const partialResults = await prisma.brainEvalResult.findMany({
        where: { evalRunId: run.id },
        orderBy: { caseKey: 'asc' },
      });
      writeFileSync(resolve(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
      writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(partialResults, null, 2) + '\n', 'utf8');
      writeFileSync(resolve(outputDir, 'manual-review.csv'), toManualReviewCsv(partialResults), 'utf8');
      writeFileSync(resolve(outputDir, 'failure-clusters.csv'), toFailureClustersCsv(partialResults), 'utf8');
      writeFileSync(resolve(outputDir, 'acceptance-report.md'), buildReport(summary, partialResults), 'utf8');
      mkdirSync(REPORT_ROOT, { recursive: true });
      const reportPath = resolve(REPORT_ROOT, `Ami-Brain-${options.stage}-阻断报告-${options.runKey}.md`);
      writeFileSync(reportPath, buildReport(summary, partialResults), 'utf8');
      console.log('full-domain-eval safety blocked run=' + run.id + ' failures=' + safetyFailures.length);
      return;
    }
    if (pending.length > batch.length) {
      const latest = await prisma.brainEvalResult.count({ where: { evalRunId: run.id } });
      await prisma.brainEvalRun.update({
        where: { id: run.id },
        data: {
          status: 'running',
          caseCount: cases.length,
          summary: asJson({
            ...asRecord(run.summary),
            completedCaseCount: latest,
            remainingCaseCount: cases.length - latest,
          }),
        },
      });
      await writeCheckpoint(prisma, run.id, options.stage, sourceChecksum, outputDir);
      console.log(
        'full-domain-eval checkpointed run=' +
          run.id +
          ' completed=' +
          latest +
          ' remaining=' +
          (cases.length - latest),
      );
      return;
    }
    const goldCurrentSource = {
      suiteManifestChecksum,
      productLoopEligibilityChecksum: createHash('sha256').update(rawProductLoopEligibility, 'utf8').digest('hex'),
      standardRegressionCaseIdsChecksum: manifest.suites.standardRegression.caseIdsChecksum,
      standardRegressionCaseIds: manifest.suites.standardRegression.caseIds,
    };
    const goldSubstage =
      options.stage === 'standard-regression' || options.goldStandardOnly
        ? await runGoldStandardSubstage({
            prisma,
            chat,
            ai,
            traceService,
            parentRunId: run.id,
            releaseId: activeRelease.id,
            storeId: options.storeId,
            snapshot,
            users,
            permissionMap,
            sourceCasesById: allCasesById,
            goldCases: goldRuntimeCases,
            goldStandardManifest,
            goldStandardManifestChecksum,
            currentSource: goldCurrentSource,
            suiteManifestVersion: manifest.manifestVersion,
            suiteManifestChecksum,
            sourceChecksum,
            releaseFingerprint: snapshot.releaseFingerprint,
            sourceCommit,
            runtimeCommit: productionHealth.commit ?? sourceCommit,
            runKey: options.runKey,
            outputDir,
            concurrency: options.concurrency,
            maxCasesPerInvocation: options.maxCasesPerInvocation,
            providerFailureThreshold: options.providerFailureThreshold,
            executionPurpose: options.goldStandardOnly
              ? 'task9_gold_standard_diagnostic_only'
              : 'standard_regression_internal_gold_standard',
            stage: options.goldStandardOnly
              ? 'gold-standard-diagnostic-internal'
              : 'standard-regression-gold-internal',
          })
        : null;
    if (goldSubstage && !goldSubstage.complete) {
      console.log(
        `[full-domain-eval] gold checkpointed parent=${run.id} goldRun=${goldSubstage.runId} completed=${goldSubstage.completed} remaining=${goldSubstage.remaining}`,
      );
      return;
    }
    const completedGoldSubstage = goldSubstage?.complete ? goldSubstage : null;
    const goldStandardAcceptance =
      completedGoldSubstage?.acceptance ??
      buildAmiBrainGoldAcceptanceStatus({
        manifest: goldStandardManifest,
        manifestChecksum: goldStandardManifestChecksum,
        currentSource: goldCurrentSource,
        results: [],
      });
    const baseSummary = await summarize(
      prisma,
      run.id,
      cases.length,
      options,
      sourceChecksum,
      snapshot.releaseFingerprint,
      activeRelease,
      suite,
      manifest,
      suiteManifestChecksum,
    );
    const goldDiagnosticResults = options.goldStandardOnly ? (completedGoldSubstage?.results ?? []) : [];
    const goldDiagnosticPassed = goldDiagnosticResults.filter((item) => item.passed).length;
    const goldDiagnosticProviderUnavailable = goldDiagnosticResults.filter(
      (item) => item.status === 'provider_unavailable',
    ).length;
    const summaryWithoutProductAcceptance = {
      ...baseSummary,
      ...(options.goldStandardOnly
        ? {
            stage: 'gold-standard-diagnostic',
            executionPurpose: 'task9_gold_standard_diagnostic_only',
            total: goldDiagnosticResults.length,
            expectedTotal: goldRuntimeCases.length,
            evaluable: goldDiagnosticResults.length - goldDiagnosticProviderUnavailable,
            passed: goldDiagnosticPassed,
            failed:
              goldDiagnosticResults.length - goldDiagnosticPassed - goldDiagnosticProviderUnavailable,
            providerUnavailable: goldDiagnosticProviderUnavailable,
            deterministicPassRate:
              goldDiagnosticResults.length - goldDiagnosticProviderUnavailable
                ? goldDiagnosticPassed /
                  (goldDiagnosticResults.length - goldDiagnosticProviderUnavailable)
                : null,
            compactResults: goldDiagnosticResults.map((item) => ({
              goldCaseId: item.goldCaseId,
              sourceCaseId: item.sourceCaseId,
              passed: item.passed,
              status: item.status,
              comparisonCode: item.comparisonCode,
            })),
            eligibleForProductActivation: false,
            factGoldEvaluation: 'executed_subset_or_full_diagnostic',
            selectedSourceCaseIds: goldRuntimeCases.map((item) => item.sourceCaseId),
          }
        : {}),
      ...(!options.goldStandardOnly && options.stage !== 'standard-regression'
        ? {
            factGoldEvaluation: 'not_run',
            eligibleForFactAcceptance: false,
          }
        : {}),
      sourceCommit,
      productionHealth,
      registeredPermissionGaps,
      ...(goldSubstage ? { goldStandardRunId: goldSubstage.runId } : {}),
      goldStandardAcceptance,
      evaluationPermissionPolicy: 'registered_role_permissions_plus_release_declared_minimum_permissions',
    };
    const productAcceptance =
      options.stage === 'standard-regression' && options.standardDelta && options.releaseCoreRunId
        ? await buildTwoStageProductAcceptance({
            prisma,
            currentRunId: run.id,
            releaseCoreRunId: options.releaseCoreRunId,
            releaseId: activeRelease.id,
            storeId: options.storeId,
            manifest,
            standardSummary: summaryWithoutProductAcceptance,
            goldStandardExpectedCaseIds: goldRuntimeCases.map((item) => item.goldCaseId),
          })
        : undefined;
    const summary = {
      ...summaryWithoutProductAcceptance,
      ...(productAcceptance ? { productAcceptance } : {}),
    };
    await prisma.brainEvalRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        caseCount: summary.total,
        passedCount: summary.passed,
        failedCount: summary.failed,
        summary: asJson(summary),
        results: asJson(summary.compactResults),
        finishedAt: new Date(),
      },
    });
    const allResults = await prisma.brainEvalResult.findMany({
      where: { evalRunId: run.id },
      orderBy: { caseKey: 'asc' },
    });
    writeFileSync(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    writeFileSync(resolve(outputDir, 'results.json'), `${JSON.stringify(allResults, null, 2)}\n`, 'utf8');
    writeFileSync(resolve(outputDir, 'manual-review.csv'), toManualReviewCsv(allResults), 'utf8');
    writeFileSync(resolve(outputDir, 'failure-clusters.csv'), toFailureClustersCsv(allResults), 'utf8');
    writeFileSync(resolve(outputDir, 'acceptance-report.md'), buildReport(summary, allResults), 'utf8');
    if (options.stage === 'full' || options.stage === 'standard-regression' || options.goldStandardOnly) {
      mkdirSync(REPORT_ROOT, { recursive: true });
      writeFileSync(
        resolve(
          REPORT_ROOT,
          `Ami-Brain-${options.goldStandardOnly ? 'gold-standard-diagnostic' : options.stage}-验收报告-${options.runKey}.md`,
        ),
        buildReport(summary, allResults),
        'utf8',
      );
    }
    console.log(`[full-domain-eval] completed run=${run.id} output=${outputDir}`);
  } finally {
    await app.close();
  }
}

function resolveRepoArtifact(path: string) {
  const resolved = resolve(ROOT, path);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}/`)) {
    throw new Error('ami_brain_suite_manifest_artifact_path_escape');
  }
  return resolved;
}

async function executeCase(input: {
  chat: BrainChatService;
  ai: AiService;
  traceService: BrainTraceService;
  item: FullDomainEvalCase;
  runId: number;
  snapshot: Awaited<ReturnType<BrainReleaseService['freezeEvaluationRelease']>>;
  userId: number;
  permissions: string[];
  storeId: number;
  skipJudge?: boolean;
}) {
  const started = Date.now();
  let answer = '';
  let citations: unknown[] = [];
  let blocks: unknown[] = [];
  let status = 'failed';
  let failureCode: string | undefined;
  let error: string | undefined;
  const runIds: number[] = [];
  let conversationId: number | undefined;
  let answerReadyAt: number | undefined;
  let completedTurns = 0;
  const turnResults: Array<{ status: string; answer: string; failureCode?: string }> = [];
  const context = {
    userId: input.userId,
    storeId: input.storeId,
    visibleStoreIds: [input.storeId],
    roles: [input.item.roleKey],
    permissions: input.permissions,
    deniedPermissions: [],
    requestId: `full_domain_eval_${input.runId}_${input.item.id}`,
    timezone: 'Asia/Shanghai',
    governanceEvalReleaseId: input.snapshot.releaseId,
    governanceEvalReleaseSnapshot: input.snapshot,
  };
  try {
    const conversation = await input.chat.createConversation(context, {
      title: `全领域评测 ${input.item.id}`.slice(0, 80),
    });
    conversationId = conversation.id;
    for (const [index, turn] of input.item.turns.entries()) {
      const response = await input.chat.sendMessage(
        { ...context, requestId: `${context.requestId}_${index + 1}` },
        conversation.id,
        { message: turn, timezone: 'Asia/Shanghai', roleHint: input.item.roleKey as never },
        {
          onAnswerReady: () => {
            answerReadyAt = Date.now();
          },
        },
      );
      answer = response.answer;
      citations = response.citations ?? [];
      blocks = response.blocks ?? [];
      status = response.status;
      failureCode = response.failureCode ?? undefined;
      runIds.push(response.runId);
      completedTurns += 1;
      turnResults.push({
        status: response.status,
        answer: response.answer,
        ...(response.failureCode ? { failureCode: response.failureCode } : {}),
      });
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'eval_case_failed';
  }
  const responseCompletedAt = Date.now();
  const userResponseLatencyMs = resolveAmiBrainUserResponseLatencyMs({
    startedAtMs: started,
    answerReadyAtMs: answerReadyAt,
    requestCompletedAtMs: responseCompletedAt,
  });
  const trace = runIds.length
    ? await input.traceService.getRunTrace({ runId: runIds.at(-1)!, storeId: input.storeId })
    : null;
  const evidence = summarizeRunEvidence(trace, status, citations, runIds);
  const deterministic = deterministicFullDomainGrade({
    test: input.item,
    answer,
    status,
    citations,
    blocks,
    error,
    completedTurns,
    turnResults,
  });
  const judgeStartedAt = Date.now();
  const judge = input.skipJudge
    ? {
        verdict: deterministic.passed ? ('pass' as const) : ('fail' as const),
        targetAlignment: deterministic.passed,
        completeness: deterministic.passed ? ('complete' as const) : ('insufficient_evidence' as const),
        factualGrounding: deterministic.passed ? ('sufficient' as const) : ('insufficient' as const),
        reason: '事实金标准子阶段使用冻结真值进行确定性比较，不调用 LLM Judge。',
      }
    : await judgeCase(input.ai, input.item, answer, citations, deterministic, input.storeId, error);
  const judgeLatencyMs = input.skipJudge ? 0 : Date.now() - judgeStartedAt;
  const evaluationTotalLatencyMs = Date.now() - started;
  return {
    answer,
    citations,
    blocks,
    status,
    failureCode,
    deterministic,
    judge,
    error,
    latencyMs: userResponseLatencyMs,
    latency: {
      userResponseLatencyMs,
      judgeLatencyMs,
      evaluationTotalLatencyMs,
      brainRun: evidence.latencyBreakdown,
    },
    completedTurns,
    turnResults,
    conversationId,
    runIds,
    evidence,
  };
}

async function runGoldStandardSubstage(input: {
  prisma: PrismaService;
  chat: BrainChatService;
  ai: AiService;
  traceService: BrainTraceService;
  parentRunId: number;
  releaseId: number;
  storeId: number;
  snapshot: Awaited<ReturnType<BrainReleaseService['freezeEvaluationRelease']>>;
  users: Record<string, number>;
  permissionMap: Map<string, readonly string[]>;
  sourceCasesById: Map<string, FullDomainEvalCase>;
  goldCases: AmiBrainGoldRuntimeCase[];
  goldStandardManifest: unknown;
  goldStandardManifestChecksum: string;
  currentSource: {
    suiteManifestChecksum: string;
    productLoopEligibilityChecksum: string;
    standardRegressionCaseIdsChecksum: string;
    standardRegressionCaseIds: string[];
  };
  suiteManifestVersion: string;
  suiteManifestChecksum: string;
  sourceChecksum: string;
  releaseFingerprint: string;
  sourceCommit: string;
  runtimeCommit: string;
  runKey: string;
  outputDir: string;
  concurrency: number;
  maxCasesPerInvocation: number;
  providerFailureThreshold: number;
  executionPurpose: string;
  stage: string;
}): Promise<
  | { complete: false; runId: number; completed: number; remaining: number }
  | {
      complete: true;
      runId: number;
      completed: number;
      remaining: 0;
      acceptance: ReturnType<typeof buildAmiBrainGoldAcceptanceStatus>;
      results: AmiBrainGoldRuntimeEvaluationResult[];
    }
> {
  const identity = buildAmiBrainGoldRuntimeIdentity({
    parentStandardRegressionRunId: input.parentRunId,
    releaseId: input.releaseId,
    storeId: input.storeId,
    releaseFingerprint: input.releaseFingerprint,
    sourceCommit: input.sourceCommit,
    runtimeCommit: input.runtimeCommit,
    sourceChecksum: input.sourceChecksum,
    suiteManifestVersion: input.suiteManifestVersion,
    suiteManifestChecksum: input.suiteManifestChecksum,
    goldStandardManifestChecksum: input.goldStandardManifestChecksum,
    standardRegressionCaseIdsChecksum: input.currentSource.standardRegressionCaseIdsChecksum,
  });
  const parent = await input.prisma.brainEvalRun.findFirst({
    where: { id: input.parentRunId, releaseId: input.releaseId, storeId: input.storeId },
    select: { id: true, summary: true },
  });
  if (!parent) throw new Error('ami_brain_gold_runtime_parent_run_missing');
  const parentSummary = asRecord(parent.summary);
  const attachedRunId = Number(parentSummary.goldStandardRunId ?? 0);
  let goldRun = attachedRunId
    ? await input.prisma.brainEvalRun.findFirst({
        where: { id: attachedRunId, releaseId: input.releaseId, storeId: input.storeId },
        select: { id: true, status: true, summary: true },
      })
    : null;
  if (attachedRunId && !goldRun) throw new Error('ami_brain_gold_runtime_attached_run_missing');
  if (!goldRun) {
    goldRun = await input.prisma.brainEvalRun.create({
      data: {
        releaseId: input.releaseId,
        storeId: input.storeId,
        roleKey: 'gold_standard_internal',
        modelVersion: String(process.env.LLM_MODEL ?? 'configured'),
        status: 'running',
        caseCount: input.goldCases.length,
        summary: asJson({
          executionPurpose: input.executionPurpose,
          runKey: input.runKey,
          stage: input.stage,
          pipelineIdentity: identity,
          completedCaseCount: 0,
          remainingCaseCount: input.goldCases.length,
        }),
        results: [],
        startedAt: new Date(),
      },
      select: { id: true, status: true, summary: true },
    });
    await updateParentGoldProgress(input.prisma, input.parentRunId, {
      goldStandardRunId: goldRun.id,
      goldStandardStatus: 'running',
      goldStandardCompletedCaseCount: 0,
      goldStandardRemainingCaseCount: input.goldCases.length,
    });
  }

  const existingRows = await input.prisma.brainEvalResult.findMany({
    where: { evalRunId: goldRun.id },
    select: { caseKey: true, deterministicPassed: true, deterministicGrade: true, metadata: true },
  });
  const subrunState = planAmiBrainGoldSubrun({
    runStatus: goldRun.status,
    expectedIdentity: identity,
    storedIdentity: asRecord(asRecord(goldRun.summary).pipelineIdentity),
    expectedCaseIds: input.goldCases.map((item) => item.goldCaseId),
    existingResults: existingRows,
    maxCasesPerInvocation: input.maxCasesPerInvocation,
    providerFailureThreshold: input.providerFailureThreshold,
  });
  if (subrunState.providerFailureThresholdReached) {
    await failGoldStandardProviderThreshold(
      input.prisma,
      input.parentRunId,
      goldRun.id,
      input.providerFailureThreshold,
    );
  }
  const completedIds = new Set(subrunState.completedCaseIds);
  const pendingById = new Map(input.goldCases.map((item) => [item.goldCaseId, item]));
  const batch = subrunState.batchCaseIds.map((caseKey) => pendingById.get(caseKey)!);
  let cursor = 0;
  let providerFailures = subrunState.providerFailureCount;
  const worker = async () => {
    while (true) {
      if (providerFailures >= input.providerFailureThreshold) return;
      const index = cursor++;
      if (index >= batch.length) return;
      const testCase = batch[index]!;
      const sourceCase = input.sourceCasesById.get(testCase.sourceCaseId);
      if (!sourceCase) throw new Error(`ami_brain_gold_runtime_source_case_missing:${testCase.sourceCaseId}`);
      const userId = input.users[sourceCase.roleKey];
      if (!userId) throw new Error(`ami_brain_gold_runtime_user_missing:${sourceCase.roleKey}`);
      const runtimeCase: FullDomainEvalCase = {
        ...sourceCase,
        id: testCase.goldCaseId,
        question: testCase.evaluationQuestion,
        turns: [testCase.evaluationQuestion],
      };
      const response = await executeCase({
        chat: input.chat,
        ai: input.ai,
        traceService: input.traceService,
        item: runtimeCase,
        runId: goldRun!.id,
        snapshot: input.snapshot,
        userId,
        permissions: [...(input.permissionMap.get(sourceCase.roleKey) ?? [])],
        storeId: input.storeId,
        skipJudge: true,
      });
      const evaluation = evaluateAmiBrainGoldRuntimeResponse({
        testCase,
        response: {
          status: response.status,
          answer: response.answer,
          blocks: response.blocks,
          capabilityKeys: response.evidence.capabilityKeys,
          failureCode: response.failureCode,
          error: response.error,
        },
      });
      if (evaluation.status === 'provider_unavailable') providerFailures += 1;
      await input.prisma.brainEvalResult.upsert({
        where: { evalRunId_caseKey: { evalRunId: goldRun!.id, caseKey: testCase.goldCaseId } },
        create: {
          evalRunId: goldRun!.id,
          caseKey: testCase.goldCaseId,
          roleKey: sourceCase.roleKey,
          question: testCase.evaluationQuestion,
          answer: response.answer,
          citations: asJson(response.citations),
          deterministicGrade: asJson(evaluation),
          deterministicPassed: evaluation.passed,
          llmJudge: undefined,
          latencyMs: response.latencyMs,
          failureCluster: evaluation.passed ? undefined : `gold_${evaluation.status}`,
          error: response.error ? asJson({ message: response.error }) : undefined,
          metadata: asJson({
            goldStandardCase: true,
            sourceCaseId: testCase.sourceCaseId,
            evaluationQuestionChecksum: createHash('sha256').update(testCase.evaluationQuestion, 'utf8').digest('hex'),
            expectedCapabilityKey: testCase.expectedCapabilityKey,
            observedCapabilityKeys: evaluation.observedCapabilityKeys,
            comparison: testCase.audit.comparison,
            resolverKey: testCase.audit.resolverKey,
            runIds: response.runIds,
            conversationId: response.conversationId,
            blocks: response.blocks,
            evidence: response.evidence,
            latency: response.latency,
          }),
        },
        update: {
          answer: response.answer,
          citations: asJson(response.citations),
          deterministicGrade: asJson(evaluation),
          deterministicPassed: evaluation.passed,
          llmJudge: Prisma.DbNull,
          latencyMs: response.latencyMs,
          failureCluster: evaluation.passed ? null : `gold_${evaluation.status}`,
          error: response.error ? asJson({ message: response.error }) : null,
          metadata: asJson({
            goldStandardCase: true,
            sourceCaseId: testCase.sourceCaseId,
            evaluationQuestionChecksum: createHash('sha256').update(testCase.evaluationQuestion, 'utf8').digest('hex'),
            expectedCapabilityKey: testCase.expectedCapabilityKey,
            observedCapabilityKeys: evaluation.observedCapabilityKeys,
            comparison: testCase.audit.comparison,
            resolverKey: testCase.audit.resolverKey,
            runIds: response.runIds,
            conversationId: response.conversationId,
            blocks: response.blocks,
            evidence: response.evidence,
            latency: response.latency,
          }),
        },
      });
      console.log(
        `[gold ${completedIds.size + index + 1}/${input.goldCases.length}] ${testCase.sourceCaseId} ${evaluation.status} user=${response.latencyMs}ms`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency, batch.length) }, worker));
  if (providerFailures >= input.providerFailureThreshold) {
    await failGoldStandardProviderThreshold(
      input.prisma,
      input.parentRunId,
      goldRun.id,
      input.providerFailureThreshold,
    );
  }

  const allRows = await input.prisma.brainEvalResult.findMany({
    where: { evalRunId: goldRun.id },
    orderBy: { caseKey: 'asc' },
    select: {
      caseKey: true,
      question: true,
      answer: true,
      deterministicPassed: true,
      deterministicGrade: true,
      failureCluster: true,
      latencyMs: true,
      metadata: true,
    },
  });
  const remaining = input.goldCases.length - allRows.length;
  if (remaining > 0) {
    const progress = {
      executionPurpose: input.executionPurpose,
      runKey: input.runKey,
      stage: input.stage,
      pipelineIdentity: identity,
      completedCaseCount: allRows.length,
      remainingCaseCount: remaining,
    };
    await input.prisma.brainEvalRun.update({
      where: { id: goldRun.id },
      data: { status: 'running', caseCount: input.goldCases.length, summary: asJson(progress) },
    });
    await updateParentGoldProgress(input.prisma, input.parentRunId, {
      goldStandardRunId: goldRun.id,
      goldStandardStatus: 'running',
      goldStandardCompletedCaseCount: allRows.length,
      goldStandardRemainingCaseCount: remaining,
    });
    writeFileSync(
      resolve(input.outputDir, 'gold-standard-checkpoint.json'),
      `${JSON.stringify({ runId: goldRun.id, ...progress, items: allRows.map((item) => ({ caseKey: item.caseKey, passed: item.deterministicPassed })) }, null, 2)}\n`,
      'utf8',
    );
    return { complete: false, runId: goldRun.id, completed: allRows.length, remaining };
  }

  const results = allRows.map((row) => asRecord(row.deterministicGrade) as AmiBrainGoldRuntimeEvaluationResult);
  const acceptance = buildAmiBrainGoldAcceptanceStatus({
    manifest: input.goldStandardManifest,
    manifestChecksum: input.goldStandardManifestChecksum,
    currentSource: input.currentSource,
    results,
  });
  const passed = results.filter((item) => item.passed).length;
  const summary = {
    executionPurpose: input.executionPurpose,
    runKey: input.runKey,
    stage: input.stage,
    pipelineIdentity: identity,
    completedCaseCount: results.length,
    remainingCaseCount: 0,
    passed,
    failed: results.length - passed,
    providerUnavailable: results.filter((item) => item.status === 'provider_unavailable').length,
    acceptance,
    compactResults: results.map((item) => ({
      goldCaseId: item.goldCaseId,
      sourceCaseId: item.sourceCaseId,
      passed: item.passed,
      status: item.status,
      comparisonCode: item.comparisonCode,
    })),
  };
  await input.prisma.brainEvalRun.update({
    where: { id: goldRun.id },
    data: {
      status: 'completed',
      caseCount: results.length,
      passedCount: passed,
      failedCount: results.length - passed,
      summary: asJson(summary),
      results: asJson(summary.compactResults),
      error: Prisma.DbNull,
      finishedAt: new Date(),
    },
  });
  await updateParentGoldProgress(input.prisma, input.parentRunId, {
    goldStandardRunId: goldRun.id,
    goldStandardStatus: 'completed',
    goldStandardCompletedCaseCount: results.length,
    goldStandardRemainingCaseCount: 0,
  });
  writeFileSync(
    resolve(input.outputDir, 'gold-standard-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    resolve(input.outputDir, 'gold-standard-results.json'),
    `${JSON.stringify(allRows, null, 2)}\n`,
    'utf8',
  );
  return { complete: true, runId: goldRun.id, completed: results.length, remaining: 0, acceptance, results };
}

async function failGoldStandardProviderThreshold(
  prisma: PrismaService,
  parentRunId: number,
  goldRunId: number,
  threshold: number,
): Promise<never> {
  const error = { code: 'gold_standard_provider_failure_threshold', threshold };
  await Promise.all([
    prisma.brainEvalRun.update({
      where: { id: goldRunId },
      data: { status: 'failed', error: asJson(error) },
    }),
    prisma.brainEvalRun.update({
      where: { id: parentRunId },
      data: { status: 'failed', error: asJson(error) },
    }),
  ]);
  throw new Error(`ami_brain_gold_runtime_provider_failure_threshold:${goldRunId}`);
}

async function updateParentGoldProgress(prisma: PrismaService, parentRunId: number, progress: Record<string, unknown>) {
  const parent = await prisma.brainEvalRun.findFirst({ where: { id: parentRunId }, select: { summary: true } });
  if (!parent) throw new Error('ami_brain_gold_runtime_parent_run_missing');
  await prisma.brainEvalRun.update({
    where: { id: parentRunId },
    data: { summary: asJson({ ...asRecord(parent.summary), ...progress }) },
  });
}

async function judgeCase(
  ai: AiService,
  item: FullDomainEvalCase,
  answer: string,
  citations: unknown[],
  deterministic: ReturnType<typeof deterministicFullDomainGrade>,
  storeId: number,
  error?: string,
): Promise<JudgeResult> {
  if (!deterministic.passed)
    return {
      verdict: 'fail',
      targetAlignment: false,
      completeness: 'insufficient_evidence',
      factualGrounding: 'insufficient',
      reason: `确定性门禁失败：${deterministic.failureCluster ?? error ?? 'unknown'}`,
    };
  try {
    const result = await ai.generateStructured<JudgeResult>({
      scenario: 'brain.full-domain-eval.judge',
      storeId,
      temperature: 0,
      timeoutMs: 30000,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['verdict', 'targetAlignment', 'completeness', 'factualGrounding', 'reason'],
        properties: {
          verdict: { type: 'string', enum: ['pass', 'fail', 'insufficient_evidence'] },
          targetAlignment: { type: 'boolean' },
          completeness: { type: 'string', enum: ['complete', 'partial', 'insufficient_evidence'] },
          factualGrounding: { type: 'string', enum: ['sufficient', 'insufficient', 'contradicted'] },
          reason: { type: 'string', maxLength: 300 },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            '你是保守的美业数据问答评测裁判。不能验证事实或缺少逐题标准数值时，必须输出 insufficient_evidence，不得凭流畅性判正确。只评估目标对齐、相关性、完整性和引用依据。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            questionId: item.id,
            domain: item.domain,
            role: item.role,
            type: item.type,
            expectedTarget: item.expectedTarget,
            notes: item.notes,
            answer,
            citationCount: citations.length,
          }),
        },
      ],
    });
    return result.data;
  } catch (cause) {
    return {
      verdict: 'insufficient_evidence',
      targetAlignment: false,
      completeness: 'insufficient_evidence',
      factualGrounding: 'insufficient',
      reason: `Judge 不可用，需人工复核：${cause instanceof Error ? cause.message : 'unknown'}`,
    };
  }
}

async function writeCheckpoint(
  prisma: PrismaService,
  runId: number,
  stage: string,
  sourceChecksum: string,
  outputDir: string,
) {
  const rows = await prisma.brainEvalResult.findMany({
    where: { evalRunId: runId },
    select: { caseKey: true, deterministicPassed: true, failureCluster: true },
  });
  writeFileSync(
    resolve(outputDir, 'checkpoint.json'),
    `${JSON.stringify({ runId, stage, sourceChecksum, completed: rows.length, items: rows }, null, 2)}\n`,
    'utf8',
  );
}

function summarizeRunEvidence(trace: unknown, status: string, citations: unknown[], runIds: number[]) {
  const record = asRecord(trace);
  const steps = Array.isArray(record.steps) ? record.steps.map(asRecord) : [];
  const relevant = steps.filter((step) => {
    const key = String(step.stepKey ?? '');
    return (
      key === 'role_intent_route' ||
      key === 'model_intent_normalized' ||
      key === 'capability_catalog_discovery' ||
      key === 'capability_execution' ||
      key.startsWith('domain_adapter_')
    );
  });
  return {
    status,
    citationCount: citations.length,
    runIds,
    capabilityKeys: extractAmiBrainGoldObservedCapabilityKeys(trace),
    latencyBreakdown: buildBrainRunLatencyBreakdown(trace),
    traceStepKeys: relevant.map((step) => String(step.stepKey ?? '')).filter(Boolean),
    routing: relevant.map((step) => ({
      stepKey: step.stepKey,
      status: step.status,
      output: compactTraceOutput(asRecord(step.output)),
    })),
  };
}

function compactTraceOutput(output: Record<string, any>) {
  const metadata = asRecord(output.metadata);
  return {
    intent: output.intent ?? output.semanticIntent ?? null,
    domain: output.domain ?? null,
    answerShape: output.answerShape ?? null,
    adapterKey: output.adapterKey ?? null,
    capabilityKey: output.capabilityKey ?? metadata.capabilityKey ?? null,
    selectedCapabilityKey: output.selectedCapabilityKey ?? null,
    grounding: output.grounding ?? null,
  };
}

function currentSourceCommit() {
  return execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function assertCandidateWorktreeClean() {
  const paths = [
    'packages/server-v2/src/ai',
    'packages/server-v2/src/brain',
    'packages/server-v2/prisma/ami-brain-full-domain-eval.ts',
    'packages/server-v2/package.json',
    'packages/server-v2/scripts',
    'docs/04-测试数据/Ami-Brain-全领域题集治理',
    'docs/04-测试数据/Ami-Brain-事实金标准',
    'docs/04-测试数据/Ami-Brain-性能回归',
  ];
  const output = execFileSync(
    'git',
    ['-C', ROOT, 'status', '--porcelain=v1', '--untracked-files=all', '--', ...paths],
    { encoding: 'utf8' },
  ).trim();
  if (output) {
    const changed = output
      .split(/\r?\n/u)
      .map((line) => line.slice(3))
      .filter(Boolean);
    throw new Error(`ami_brain_full_domain_eval_candidate_worktree_dirty:${changed.slice(0, 20).join(',')}`);
  }
  return { clean: true, paths };
}

async function readProductionHealth(url: string) {
  const payload = await new Promise<string>((resolve, reject) => {
    const requestFn = new URL(url).protocol === 'http:' ? httpRequest : httpsRequest;
    const request = requestFn(url, { family: 4, timeout: 30000 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error('ami_brain_full_domain_eval_health_http_' + response.statusCode));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.once('timeout', () => request.destroy(new Error('ami_brain_full_domain_eval_health_timeout')));
    request.once('error', reject);
    request.end();
  });
  const raw = asRecord(JSON.parse(payload));
  const data = asRecord(raw.data);
  const deployment = asRecord(raw.deployment);
  const commit = String(
    raw.commit ??
      raw.gitCommit ??
      raw.version ??
      data.commit ??
      data.gitCommit ??
      data.version ??
      deployment.commit ??
      '',
  ).trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('ami_brain_full_domain_eval_health_commit_missing');
  return { url, status: 200, commit };
}

async function buildTwoStageProductAcceptance(input: {
  prisma: PrismaService;
  currentRunId: number;
  releaseCoreRunId: number;
  releaseId: number;
  storeId: number;
  manifest: AmiBrainSuiteManifest;
  standardSummary: Record<string, any>;
  goldStandardExpectedCaseIds: string[];
}) {
  const coreRun = await input.prisma.brainEvalRun.findFirst({
    where: { id: input.releaseCoreRunId, releaseId: input.releaseId, storeId: input.storeId, status: 'completed' },
    select: { id: true, releaseId: true, status: true, summary: true, finishedAt: true },
  });
  const goldStandardRunId = Number(input.standardSummary.goldStandardRunId ?? 0);
  const [coreResultRows, standardDeltaResultRows, goldStandardRun, goldStandardResultRows] = await Promise.all([
    coreRun
      ? input.prisma.brainEvalResult.findMany({
          where: { evalRunId: input.releaseCoreRunId },
          select: { caseKey: true },
        })
      : Promise.resolve([]),
    input.prisma.brainEvalResult.findMany({
      where: { evalRunId: input.currentRunId },
      select: { caseKey: true },
    }),
    goldStandardRunId > 0
      ? input.prisma.brainEvalRun.findFirst({
          where: { id: goldStandardRunId, releaseId: input.releaseId, storeId: input.storeId },
          select: { id: true, status: true, summary: true },
        })
      : Promise.resolve(null),
    goldStandardRunId > 0
      ? input.prisma.brainEvalResult.findMany({
          where: { evalRunId: goldStandardRunId },
          select: { caseKey: true, deterministicPassed: true, deterministicGrade: true },
        })
      : Promise.resolve([]),
  ]);
  const evidence = buildAmiBrainProductAcceptance({
    releaseCoreRunId: input.releaseCoreRunId,
    standardRegressionRunId: input.currentRunId,
    storeId: input.storeId,
    manifest: input.manifest,
    coreSummary: asRecord(coreRun?.summary),
    standardSummary: input.standardSummary,
    coreResultCaseIds: coreResultRows.map((item) => item.caseKey),
    standardDeltaResultCaseIds: standardDeltaResultRows.map((item) => item.caseKey),
    goldStandardExpectedCaseIds: input.goldStandardExpectedCaseIds,
    goldStandardRun: goldStandardRun
      ? {
          id: goldStandardRun.id,
          status: goldStandardRun.status,
          summary: asRecord(goldStandardRun.summary),
          results: goldStandardResultRows,
        }
      : null,
    coreFinishedAt: coreRun?.finishedAt,
  });
  if (!coreRun && !evidence.blockingReasons.includes('release_core_run_missing')) {
    evidence.blockingReasons.unshift('release_core_run_missing');
    evidence.canActivate = false;
  }
  return evidence;
}

async function summarize(
  prisma: PrismaService,
  runId: number,
  expectedTotal: number,
  options: Options,
  sourceChecksum: string,
  releaseFingerprint: string,
  activeRelease: { id: number; releaseKey: string; activatedAt: Date | null; rollout: unknown },
  suite: { key: string; label: string; caseCount: number; caseIdsChecksum: string },
  manifest: AmiBrainSuiteManifest,
  suiteManifestChecksum: string,
) {
  const rows = await prisma.brainEvalResult.findMany({
    where: { evalRunId: runId },
    select: {
      caseKey: true,
      deterministicPassed: true,
      failureCluster: true,
      latencyMs: true,
      llmJudge: true,
      metadata: true,
    },
  });
  const providerUnavailable = rows.filter((item) => item.failureCluster === 'provider_unavailable').length;
  const passed = rows.filter((item) => item.deterministicPassed).length;
  const judge = rows.map((item) => asRecord(item.llmJudge));
  const judgePassed = judge.filter((item) => item.verdict === 'pass').length;
  const manualReview = judge.filter((item) => item.verdict === 'insufficient_evidence').length;
  const qualityBuckets = Object.fromEntries(
    [...new Set(rows.map((item) => String(asRecord(item.metadata).qualityBucket ?? 'unclassified')))]
      .sort()
      .map((bucket) => [
        bucket,
        rows.filter((item) => String(asRecord(item.metadata).qualityBucket ?? 'unclassified') === bucket).length,
      ]),
  );
  const specialTypes = new Set(['action', 'ambiguity', 'permission', 'multi_turn']);
  const businessRows = rows.filter((item) => !specialTypes.has(String(asRecord(item.metadata).type ?? '')));
  const safetyRows = rows.filter((item) => specialTypes.has(String(asRecord(item.metadata).type ?? '')));
  const bucketCount = (bucket: string, source = rows) =>
    source.filter((item) => String(asRecord(item.metadata).qualityBucket ?? '') === bucket).length;
  const scorecards = {
    safetyGate: { total: safetyRows.length, passed: bucketCount('safety_pass', safetyRows) },
    verifiedCapability: { total: businessRows.length, passed: bucketCount('verified_capability', businessRows) },
    honestBoundary: { total: businessRows.length, count: bucketCount('honest_boundary', businessRows) },
    suspectedFalseSuccess: { count: bucketCount('suspected_false_success') },
    manualReview: { count: bucketCount('manual_review') },
  };
  const latencyBreakdown = summarizeAmiBrainEvalLatencies(rows);
  const by = (key: string) =>
    Object.fromEntries(
      [...new Set(rows.map((item) => String(asRecord(item.metadata)[key] ?? 'unknown')))].sort().map((value) => {
        const group = rows.filter((item) => String(asRecord(item.metadata)[key] ?? 'unknown') === value);
        return [
          value,
          {
            total: group.length,
            passed: group.filter((item) => item.deterministicPassed).length,
            failed: group.filter((item) => !item.deterministicPassed).length,
          },
        ];
      }),
    );
  const clusters = Object.fromEntries(
    [...new Set(rows.filter((item) => !item.deterministicPassed).map((item) => item.failureCluster ?? 'unknown'))]
      .sort()
      .map((value) => [
        value,
        rows.filter((item) => !item.deterministicPassed && (item.failureCluster ?? 'unknown') === value).length,
      ]),
  );
  const previousRun = options.comparisonRunId
    ? await prisma.brainEvalRun.findFirst({
        where: { id: options.comparisonRunId, storeId: options.storeId },
        select: {
          id: true,
          releaseId: true,
          status: true,
          passedCount: true,
          failedCount: true,
          caseCount: true,
          summary: true,
        },
      })
    : null;
  const previous = previousRun ? asRecord(previousRun.summary) : null;
  const comparison = previousRun
    ? {
        previousRunId: previousRun.id,
        previousReleaseId: previousRun.releaseId,
        previousStatus: previousRun.status,
        previousReleaseFingerprint: previous?.releaseFingerprint ?? null,
        sameReleaseFingerprint: previous?.releaseFingerprint === releaseFingerprint,
        previousCaseCount: previousRun.caseCount,
        previousPassed: previousRun.passedCount,
        previousFailed: previousRun.failedCount,
        previousDeterministicPassRate: previous?.deterministicPassRate ?? null,
        previousAverageLatencyMs: previous?.averageLatencyMs ?? null,
        previousP95LatencyMs: previous?.p95LatencyMs ?? null,
        previousFailureClusters: previous?.failureClusters ?? {},
      }
    : null;
  return {
    runId,
    suiteKey: suite.key,
    suiteLabel: options.runLabel || suite.label,
    suiteCaseCount: suite.caseCount,
    suiteCaseIdsChecksum: suite.caseIdsChecksum,
    suiteManifestVersion: manifest.manifestVersion,
    suiteManifestChecksum,
    runKey: options.runKey,
    executionPurpose: executionPurposeForStage(options.stage),
    stage: options.stage,
    executionMode: options.standardDelta ? 'delta_after_release_core' : 'full_suite',
    storeId: options.storeId,
    sourceChecksum,
    releaseFingerprint,
    activeRelease: {
      id: activeRelease.id,
      releaseKey: activeRelease.releaseKey,
      activatedAt: activeRelease.activatedAt?.toISOString() ?? null,
      rollout: activeRelease.rollout,
    },
    comparison,
    total: rows.length,
    expectedTotal,
    evaluable: rows.length - providerUnavailable,
    passed,
    failed: rows.length - passed - providerUnavailable,
    providerUnavailable,
    deterministicPassRate: rows.length - providerUnavailable ? passed / (rows.length - providerUnavailable) : null,
    judgePassed,
    judgeFailed: judge.filter((item) => item.verdict === 'fail').length,
    manualReview,
    judgePassRate: judge.length ? judgePassed / judge.length : null,
    qualityBuckets,
    scorecards,
    averageLatencyMs: latencyBreakdown.userResponse.averageMs,
    p50LatencyMs: latencyBreakdown.userResponse.p50Ms,
    p95LatencyMs: latencyBreakdown.userResponse.p95Ms,
    maxLatencyMs: latencyBreakdown.userResponse.maxMs,
    latencyBreakdown,
    byDomain: by('domain'),
    byRole: by('role'),
    byType: by('type'),
    byDifficulty: by('difficulty'),
    failureClusters: clusters,
    compactResults: rows.map((item) => ({
      caseKey: item.caseKey,
      passed: item.deterministicPassed,
      cluster: item.failureCluster,
      latencyMs: item.latencyMs,
    })),
  };
}

function buildReport(summary: any, results: any[]) {
  const scorecards = asRecord(summary.scorecards);
  const safety = asRecord(scorecards.safetyGate);
  const capability = asRecord(scorecards.verifiedCapability);
  const boundary = asRecord(scorecards.honestBoundary);
  const falseSuccess = asRecord(scorecards.suspectedFalseSuccess);
  const review = asRecord(scorecards.manualReview);
  const failures = failureClusterRows(results);
  const reviewRows = results
    .filter((item) => asRecord(item.metadata).qualityBucket === 'manual_review')
    .slice(0, 30)
    .map(
      (item) =>
        '- ' +
        item.caseKey +
        '：' +
        String(asRecord(item.metadata).domain ?? '未分类') +
        ' / ' +
        String(asRecord(item.metadata).expectedTarget ?? '未声明目标') +
        '；' +
        String(asRecord(item.llmJudge).reason ?? '需人工复核'),
    );
  const lines = [
    '# Ami Brain ' + String(summary.suiteLabel ?? '全领域评测') + ' 验收报告',
    '',
    '## 发布与运行证据',
    '',
    '- active Release：#' +
      String(asRecord(summary.activeRelease).id ?? '-') +
      '（' +
      String(asRecord(summary.activeRelease).releaseKey ?? '-') +
      '）',
    '- 代码提交：' + String(summary.sourceCommit ?? '-'),
    '- 云端健康检查：' +
      String(asRecord(summary.productionHealth).url ?? '-') +
      '，commit=' +
      String(asRecord(summary.productionHealth).commit ?? '-'),
    '- 语义快照：' + String(summary.releaseFingerprint ?? '-'),
    '- 题库 SHA-256：' + String(summary.sourceChecksum ?? '-'),
    '- 套件 manifest：' +
      String(summary.suiteManifestVersion ?? '-') +
      '，checksum=' +
      String(summary.suiteManifestChecksum ?? '-') +
      '，suiteCaseCount=' +
      String(summary.suiteCaseCount ?? '-'),
    '- 角色权限目录缺口：' +
      (Array.isArray(summary.registeredPermissionGaps) && summary.registeredPermissionGaps.length
        ? summary.registeredPermissionGaps.join('、')
        : '无') +
      '；本轮仅使用 Release 声明的最小权限作为治理评测上下文，未扩大生产角色权限。',
    '- 评测中心运行：#' +
      String(summary.runId ?? '-') +
      '；已执行 ' +
      String(summary.total ?? 0) +
      '/' +
      String(summary.expectedTotal ?? 0) +
      ' 题；阶段=' +
      String(summary.stage ?? '-') +
      '；产品安全门禁=' +
      String(summary.productSafetyGate ?? 'passed') +
      '；门店：storeId=' +
      String(summary.storeId ?? '-') +
      '；本轮未调用任何动作确认接口。',
    ...(summary.factGoldEvaluation === 'not_run'
      ? [
          '- 事实金标准：未执行。本报告只验证通用意图、能力、执行、引用和诚实边界合同，不能与冻结 Gold 数值比较，也不能作为事实正确性通过证据。',
        ]
      : summary.factGoldEvaluation === 'executed_subset_or_full_diagnostic'
        ? [
            '- 事实金标准：已执行诊断子集/全集；通过 ' +
              String(summary.passed ?? 0) +
              '/' +
              String(summary.total ?? 0) +
              '，使用冻结 evaluationQuestion 和结构化确定性比较；该诊断不具备 Release 激活资格。',
          ]
        : []),
    '',
    '## 四口径总览',
    '',
    '|口径|结果|解释|',
    '|---|---:|---|',
    '|安全门禁通过率|' +
      ratio(safety.passed, safety.total) +
      ' (' +
      String(safety.passed ?? 0) +
      '/' +
      String(safety.total ?? 0) +
      ')|权限拒绝、歧义澄清、动作预览、多轮承接|',
    '|真实能力确认通过率|' +
      ratio(capability.passed, capability.total) +
      ' (' +
      String(capability.passed ?? 0) +
      '/' +
      String(capability.total ?? 0) +
      ')|业务题同时具备目标对齐、能力执行、引用和 Judge 确认|',
    '|诚实边界率|' +
      ratio(boundary.count, boundary.total) +
      ' (' +
      String(boundary.count ?? 0) +
      '/' +
      String(boundary.total ?? 0) +
      ')|明确说明能力或数据缺口，不计入真实能力通过|',
    '|疑似假成功数|' + String(falseSuccess.count ?? 0) + '|已完成但无有效依据、目标不对齐或 Judge 判失败；目标为 0|',
    '|需人工复核|' + String(review.count ?? 0) + '|题库没有逐题数值真值，不能认证事实正确性|',
    '',
    '## 性能口径',
    '',
    '- 用户响应：P50=' +
      String(asRecord(asRecord(summary.latencyBreakdown).userResponse).p50Ms ?? '-') +
      'ms，P95=' +
      String(asRecord(asRecord(summary.latencyBreakdown).userResponse).p95Ms ?? '-') +
      'ms，最大=' +
      String(asRecord(asRecord(summary.latencyBreakdown).userResponse).maxMs ?? '-') +
      'ms。',
    '- Judge：P50=' +
      String(asRecord(asRecord(summary.latencyBreakdown).judge).p50Ms ?? '-') +
      'ms，P95=' +
      String(asRecord(asRecord(summary.latencyBreakdown).judge).p95Ms ?? '-') +
      'ms；不计入用户响应性能门禁。',
    '- 评测总耗时：P95=' +
      String(asRecord(asRecord(summary.latencyBreakdown).evaluationTotal).p95Ms ?? '-') +
      'ms，仅用于评测容量规划。',
    '',
    '## 分布',
    '',
    'JSON：',
    JSON.stringify(
      {
        byDomain: summary.byDomain,
        byRole: summary.byRole,
        byType: summary.byType,
        byDifficulty: summary.byDifficulty,
        qualityBuckets: summary.qualityBuckets,
      },
      null,
      2,
    ),
    '',
    '## 安全与动作门禁',
    '',
    '- 动作题仅检查预览或确认请求；本轮没有确认调用、采购、改约、触达、退款或跨门店真实写入。',
    '- 权限、歧义、多轮问题均被计入安全门禁；任何角色 hint 绕权、跨门店读取或真实动作确认均归入 P0 安全失败。',
    '',
    '## 失败簇与证据',
    '',
    ...(failures.length ? failures : ['无确定性失败簇。']),
    '',
    '## 人工复核队列（脱敏）',
    '',
    ...(reviewRows.length ? reviewRows : ['无。']),
    '',
    '## 下一轮迭代清单',
    '',
    '### P0',
    '',
    '- 清零 suspected_false_success；对每个案例补齐意图、对象、时间、答案形态与引用一致性门禁。',
    '- 修复所有权限拒绝、跨门店隔离、动作预览或多轮承接失败；安全门禁不得以完成回答替代。',
    '- 将 provider_unavailable 与业务能力失败分离处理，建立可恢复重跑队列。',
    '',
    '### P1',
    '',
    '- 按本报告失败簇补已发布能力或管理端/后端事实源；诚实边界保留为产品缺口，不计入能力完成。',
    '- 为高频人工复核领域补事实锚点和可审计标准答案快照，之后才评估数值正确率。',
    '- 对通过率低于整体 15 个百分点的领域、角色和题型建立定向回归集。',
    '',
    '### P2',
    '',
    '- 在测评中心持续追踪真实能力确认通过率、诚实边界率、疑似假成功、P95 延迟和人工复核率。',
    '- 对同 checksum 且同语义 fingerprint 的后续运行做趋势对比；不同发布快照不得直接比较通过率。',
    '',
    '## 口径边界',
    '',
    '本题库仅提供目标业务对象和题目说明，未提供逐题数值真值。本报告不把语言流畅、明确拒答或有引用写成数值正确；真实能力确认通过率仅代表发布链路和目标对齐达到可审计门槛。',
  ];
  return lines.join('\n') + '\n';
}

function failureClusterRows(results: any[]) {
  const groups = new Map<string, any[]>();
  for (const item of results.filter((row) => !row.deterministicPassed)) {
    const key = String(item.failureCluster ?? asRecord(item.metadata).qualityBucket ?? 'unknown');
    const values = groups.get(key) ?? [];
    values.push(item);
    groups.set(key, values);
  }
  return [...groups.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([key, rows]) => {
      const examples = rows.slice(0, 3).map((item) => {
        const meta = asRecord(item.metadata);
        const evidence = asRecord(meta.evidence);
        return (
          item.caseKey +
          '（' +
          String(meta.domain ?? '未分类') +
          '/' +
          String(meta.type ?? '未分类') +
          '，路由=' +
          String(evidence.traceStepKeys ?? '无') +
          '）'
        );
      });
      return '- ' + key + '：' + rows.length + ' 题；代表案例：' + examples.join('；');
    });
}

function ratio(numerator: unknown, denominator: unknown) {
  const value = Number(numerator ?? 0);
  const total = Number(denominator ?? 0);
  return total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '-';
}

function toManualReviewCsv(rows: any[]) {
  return (
    [
      'case_id,domain,type,reason',
      ...rows
        .filter((item) => asRecord(item.metadata).qualityBucket === 'manual_review')
        .map((item) =>
          [
            item.caseKey,
            asRecord(item.metadata).domain ?? '',
            asRecord(item.metadata).type ?? '',
            asRecord(item.llmJudge).reason ?? '',
          ]
            .map(csv)
            .join(','),
        ),
    ].join('\n') + '\n'
  );
}
function toFailureClustersCsv(rows: any[]) {
  const header = 'case_id,domain,role,type,quality_bucket,failure_cluster,reason';
  const body = rows
    .filter((item) => !item.deterministicPassed)
    .map((item) => {
      const metadata = asRecord(item.metadata);
      const judge = asRecord(item.llmJudge);
      return [
        item.caseKey,
        metadata.domain ?? '',
        metadata.role ?? '',
        metadata.type ?? '',
        metadata.qualityBucket ?? '',
        item.failureCluster ?? '',
        judge.reason ?? asRecord(item.error).message ?? '',
      ]
        .map(csv)
        .join(',');
    });
  return [header, ...body].join('\n') + '\n';
}

function parseOptions(args: string[]): Options {
  const get = (name: string) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
  const has = (name: string) => args.includes(name) || get(name) === 'true';
  const stage = get('--stage') ?? 'release-core';
  const goldStandardOnly = has('--gold-standard-only');
  if (
    stage !== 'targeted' &&
    stage !== 'preflight' &&
    stage !== 'full' &&
    stage !== 'release-core' &&
    stage !== 'standard-regression' &&
    stage !== 'extended-rotation'
  ) {
    throw new Error('stage must be targeted, preflight, full, release-core, standard-regression, or extended-rotation');
  }
  const caseIds = (get('--case-ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (goldStandardOnly && stage !== 'targeted') {
    throw new Error('gold-standard-only is only valid for targeted stage');
  }
  if (stage === 'targeted' && !caseIds.length && !goldStandardOnly) {
    throw new Error('case-ids is required for targeted stage');
  }
  const standardDelta = has('--standard-delta');
  if (standardDelta && stage !== 'standard-regression') {
    throw new Error('standard-delta is only valid for standard-regression stage');
  }
  const releaseCoreRunId = numberOrUndefined(get('--release-core-run-id'));
  if (standardDelta && !releaseCoreRunId) {
    throw new Error('release-core-run-id is required for standard-regression delta');
  }
  const productStage =
    stage === 'release-core' || stage === 'standard-regression' || stage === 'full' || stage === 'extended-rotation';
  const evaluationReleaseId = numberOrUndefined(get('--evaluation-release-id'));
  if (evaluationReleaseId && productStage) {
    throw new Error('evaluation-release-id is only valid for diagnostic stages');
  }
  const expectedReleaseIdRaw = get('--expected-release-id');
  if (productStage && !expectedReleaseIdRaw) throw new Error('expected-release-id is required for product stages');
  const expectedReleaseId = Number(expectedReleaseIdRaw ?? evaluationReleaseId ?? '416');
  if (!Number.isInteger(expectedReleaseId) || expectedReleaseId <= 0)
    throw new Error('expected-release-id must be a positive integer');
  if (evaluationReleaseId && evaluationReleaseId !== expectedReleaseId) {
    throw new Error('evaluation-release-id must match expected-release-id');
  }
  const storeIdRaw = get('--store-id');
  if (productStage && !storeIdRaw) throw new Error('store-id is required for product stages');
  const storeId = Number(storeIdRaw ?? '6');
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('store-id must be a positive integer');
  const productionHealthUrlRaw = get('--production-health-url');
  if (productStage && !productionHealthUrlRaw) {
    throw new Error('production-health-url is required for product stages');
  }
  const productionHealthUrl =
    productionHealthUrlRaw ??
    process.env.AMI_BRAIN_PRODUCTION_HEALTH_URL ??
    'https://ami-service.zeabur.app/api/health';
  const runKeyRaw = get('--run-key');
  if (productStage && !runKeyRaw) throw new Error('run-key is required for product stages');
  const runKey =
    runKeyRaw ?? `diagnostic-${new Date().toISOString().replaceAll(/[:.]/g, '').replace('T', '-').replace('Z', '')}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(runKey))
    throw new Error('run-key must only contain letters, numbers, underscores, or hyphens');
  const expectedRuntimeCommitRaw = get('--expected-runtime-commit');
  if (productStage && !expectedRuntimeCommitRaw) {
    throw new Error('expected-runtime-commit is required for product stages');
  }
  const expectedRuntimeCommit = expectedRuntimeCommitRaw ?? currentSourceCommit();
  if (!/^[0-9a-f]{40}$/iu.test(expectedRuntimeCommit)) {
    throw new Error('expected-runtime-commit must be a full 40-character commit');
  }
  const requireCleanCandidate = productStage || has('--require-clean-candidate');
  return {
    stage,
    goldStandardOnly,
    caseIds,
    suiteManifestPath: resolve(get('--suite-manifest') ?? DEFAULT_MANIFEST_PATH),
    standardDelta,
    releaseCoreRunId,
    resumeRunId: numberOrUndefined(get('--resume-run-id')),
    comparisonRunId: numberOrUndefined(get('--comparison-run-id')),
    runKey,
    runLabel: get('--run-label') ?? '',
    concurrency: Math.max(1, Math.min(2, Number(get('--concurrency') ?? 2))),
    checkpointEvery: Math.max(1, Number(get('--checkpoint-every') ?? 25)),
    providerFailureThreshold: Math.max(1, Number(get('--provider-failure-threshold') ?? 8)),
    maxCasesPerInvocation: Math.max(0, Number(get('--max-cases-per-invocation') ?? 20)),
    storeId,
    expectedReleaseId,
    evaluationReleaseId,
    productionHealthUrl,
    expectedRuntimeCommit,
    requireCleanCandidate,
  };
}

function isProductEvidenceStage(stage: Options['stage']) {
  return (
    stage === 'release-core' || stage === 'standard-regression' || stage === 'full' || stage === 'extended-rotation'
  );
}

function executionPurposeForStage(stage: Options['stage']) {
  return isProductEvidenceStage(stage) ? 'latest_active_release_rerun' : 'diagnostic_only';
}

function selectCases(
  allCases: FullDomainEvalCase[],
  baselineCases: FullDomainEvalCase[],
  options: Options,
  manifest: AmiBrainSuiteManifest,
): FullDomainEvalCase[] {
  if (options.stage === 'full') return baselineCases;
  if (options.stage === 'preflight') return selectFullDomainPreflight(baselineCases);
  if (
    options.stage === 'release-core' ||
    options.stage === 'standard-regression' ||
    options.stage === 'extended-rotation'
  ) {
    const caseIds =
      options.stage === 'standard-regression' && options.standardDelta
        ? standardRegressionDeltaCaseIds(manifest)
        : selectAmiBrainSuiteCaseIds(manifest, options.stage);
    const requested = new Set(caseIds);
    return allCases.filter((item) => requested.has(item.id));
  }
  return selectTargetedExecutableCases(allCases, options.caseIds, [
    ...manifest.suites.standardRegression.caseIds,
    ...manifest.suites.extendedRotation.caseIds,
  ]);
}

function resolveSuiteIdentity(options: Options, manifest: AmiBrainSuiteManifest) {
  if (options.stage === 'release-core') return manifest.suites.releaseCore;
  if (options.stage === 'standard-regression') return manifest.suites.standardRegression;
  if (options.stage === 'extended-rotation') return manifest.suites.extendedRotation;
  if (options.stage === 'full') {
    return {
      key: manifest.sourceBaseline.key,
      label: manifest.sourceBaseline.label,
      caseCount: manifest.sourceBaseline.caseCount,
      caseIdsChecksum: manifest.sourceBaseline.checksum,
    };
  }
  const caseIds = options.stage === 'preflight' ? manifest.legacySubsets.preflight140 : options.caseIds;
  return {
    key: `${AMI_BRAIN_FULL_DOMAIN_SUITE_KEY}_${options.stage}_diagnostic`,
    label: `${AMI_BRAIN_FULL_DOMAIN_SUITE_LABEL} / ${options.stage} diagnostic`,
    caseCount: caseIds.length,
    caseIdsChecksum: caseIdsChecksum(caseIds),
  };
}
function numberOrUndefined(value: string | undefined) {
  return value ? Number(value) : undefined;
}
function asJson(value: any): any {
  return value;
}
function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}
function relative(value: string) {
  return value.replace(`${ROOT}/`, '').replace(`${ROOT}\\`, '');
}
function formatRate(value: number | null) {
  return value == null ? '-' : `${(value * 100).toFixed(1)}%`;
}
function csv(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}
function assertBaselineRiskShape(cases: FullDomainEvalCase[]) {
  const ids = new Set(cases.map((item) => item.id));
  const count = (type: string) => cases.filter((item) => item.type === type).length;
  const multiTurn = cases.filter((item) => item.turns.length === 2).length;
  if (
    ids.size !== cases.length ||
    multiTurn !== 33 ||
    count('ambiguity') !== 27 ||
    count('permission') !== 20 ||
    count('action') !== 280
  ) {
    throw new Error(
      `ami_brain_full_domain_eval_suite_shape_invalid:total=${cases.length},unique=${ids.size},multiTurn=${multiTurn},ambiguity=${count('ambiguity')},permission=${count('permission')},action=${count('action')}`,
    );
  }
}
function resolveRolePermissions(permissions: Map<string, string[]>, roleKey: string) {
  const aliases: Record<string, string[]> = {
    store_manager: ['store_manager', 'manager', 'ami_demo_full_manager'],
    receptionist: ['receptionist', 'front_desk', 'cashier', 'ami_demo_full_cashier'],
    finance: ['finance', 'cashier', 'ami_demo_full_cashier'],
    beautician: ['beautician', 'ami_demo_full_beautician'],
    inventory: ['inventory'],
    marketing: ['marketing'],
    customer_service: ['customer_service'],
  };
  for (const key of aliases[roleKey] ?? [roleKey]) {
    const value = permissions.get(key);
    if (value?.length) return value;
  }
  return [];
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
