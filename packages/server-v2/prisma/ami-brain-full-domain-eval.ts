import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AiService } from '../src/ai/ai.service.js';
import { BrainChatService } from '../src/brain/brain-chat.service.js';
import { BrainModule } from '../src/brain/brain.module.js';
import { resolveBrainEvalRoleUsers } from '../src/brain/eval/brain-eval-role-user-resolver.js';
import {
  AMI_BRAIN_FULL_DOMAIN_SUITE_KEY,
  AMI_BRAIN_FULL_DOMAIN_SUITE_LABEL,
  deterministicFullDomainGrade,
  fullDomainEvalCsvChecksum,
  parseFullDomainEvalCsv,
  selectFullDomainPreflight,
  type FullDomainEvalCase,
} from '../src/brain/eval/brain-full-domain-eval-suite.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
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
  stage: 'preflight' | 'full';
  resumeRunId?: number;
  comparisonRunId?: number;
  runKey: string;
  runLabel: string;
  concurrency: number;
  checkpointEvery: number;
  providerFailureThreshold: number;
};
const ROOT = resolve(process.cwd(), '..', '..');
const CSV_PATH = resolve(ROOT, 'docs/04-测试数据/Ami-Brain-全领域实测问题集-2000.csv');
const OUTPUT_ROOT = resolve(ROOT, 'docs/04-测试数据/Ami-Brain-全领域实测-2026-07-22');
const REPORT_ROOT = resolve(ROOT, 'docs/03-开发计划/01-AI智能体与问数能力');

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const rawCsv = readFileSync(CSV_PATH, 'utf8');
  const allCases = parseFullDomainEvalCsv(rawCsv);
  assertSuiteShape(allCases);
  const cases = options.stage === 'preflight' ? selectFullDomainPreflight(allCases) : allCases;
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const outputDir = resolve(OUTPUT_ROOT, options.runKey, options.stage);
  mkdirSync(outputDir, { recursive: true });
  const app = await NestFactory.createApplicationContext(FullDomainEvalModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const chat = app.get(BrainChatService);
    const releaseService = app.get(BrainReleaseService);
    const ai = app.get(AiService);
    const activeRelease = await prisma.brainRelease.findFirst({
      where: { status: 'active' },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, releaseKey: true, activatedAt: true, rollout: true, createdAt: true },
    });
    if (!activeRelease) throw new Error('ami_brain_full_domain_eval_active_release_missing');
    const snapshot = await releaseService.freezeEvaluationRelease(activeRelease.id);
    const roles = [...new Set(cases.map((item) => item.roleKey))];
    const users = await resolveBrainEvalRoleUsers(prisma, 6, roles);
    const roleRows = await prisma.role.findMany({ select: { key: true, permissions: true } });
    const rawPermissions = new Map(roleRows.map((item) => [item.key, Array.isArray(item.permissions) ? item.permissions.filter((value): value is string => typeof value === 'string') : []]));
    const permissionMap = new Map(roles.map((roleKey) => [roleKey, resolveRolePermissions(rawPermissions, roleKey)]));
    const missingPermissionRoles = [...permissionMap.entries()].filter(([, permissions]) => permissions.length === 0).map(([roleKey]) => roleKey);
    const storeManagerPermissions = resolveRolePermissions(rawPermissions, 'store_manager');
    if (!storeManagerPermissions.length) throw new Error(`ami_brain_full_domain_eval_role_permissions_missing:${missingPermissionRoles.join(',')}`);
    for (const roleKey of missingPermissionRoles) permissionMap.set(roleKey, storeManagerPermissions);
    const sourceChecksum = fullDomainEvalCsvChecksum(rawCsv);
    const run = options.resumeRunId
      ? await prisma.brainEvalRun.findFirst({ where: { id: options.resumeRunId, storeId: 6 }, select: { id: true, releaseId: true, summary: true } })
      : await prisma.brainEvalRun.create({
          data: {
            releaseId: activeRelease.id,
            storeId: 6,
            roleKey: 'multi_role',
            modelVersion: String(process.env.LLM_MODEL ?? 'configured'),
            status: 'running',
            caseCount: cases.length,
            summary: asJson({
              suiteKey: AMI_BRAIN_FULL_DOMAIN_SUITE_KEY,
              suiteLabel: options.runLabel,
              runKey: options.runKey,
              executionPurpose: 'latest_active_release_rerun',
              comparisonRunId: options.comparisonRunId ?? null,
              stage: options.stage,
              sourceFile: relative(CSV_PATH),
              sourceChecksum,
              sourceCaseCount: allCases.length,
              scenarioCount: cases.length,
              expectedTurnCount: cases.reduce((sum, item) => sum + item.turns.length, 0),
              releaseFingerprint: snapshot.releaseFingerprint,
              releaseMode: snapshot.mode,
              activeRelease: {
                id: activeRelease.id,
                releaseKey: activeRelease.releaseKey,
                activatedAt: activeRelease.activatedAt?.toISOString() ?? null,
                createdAt: activeRelease.createdAt.toISOString(),
                rollout: activeRelease.rollout,
              },
              model: process.env.LLM_MODEL ?? null,
              storeId: 6,
              evaluation: true,
              actionPolicy: 'preview_or_confirmation_only_no_confirm_endpoint',
              missingRoleCatalogFallback: missingPermissionRoles,
              scoring: 'deterministic_gate_plus_llm_judge',
            }),
            results: [],
            startedAt: new Date(),
          },
        });
    if (!run) throw new Error('ami_brain_full_domain_eval_resume_run_not_found');
    if (run.releaseId !== activeRelease.id) throw new Error('ami_brain_full_domain_eval_resume_release_mismatch');
    const existing = await prisma.brainEvalResult.findMany({ where: { evalRunId: run.id }, select: { caseKey: true, deterministicPassed: true, failureCluster: true, latencyMs: true, llmJudge: true } });
    const completed = new Set(existing.map((item) => item.caseKey));
    let providerFailures = 0;
    let cursor = 0;
    const pending = cases.filter((item) => !completed.has(item.id));
    console.log(`[full-domain-eval] run=${run.id} key=${options.runKey} stage=${options.stage} cases=${cases.length} resumed=${completed.size} pending=${pending.length} release=${activeRelease.id}`);
    const worker = async () => {
      while (true) {
        if (providerFailures >= options.providerFailureThreshold) return;
        const index = cursor++;
        if (index >= pending.length) return;
        const item = pending[index]!;
        const result = await executeCase({ chat, ai, item, runId: run.id, snapshot, userId: users[item.roleKey]!, permissions: permissionMap.get(item.roleKey) ?? [] });
        if (result.deterministic.providerUnavailable) providerFailures += 1; else providerFailures = 0;
        await prisma.brainEvalResult.upsert({
          where: { evalRunId_caseKey: { evalRunId: run.id, caseKey: item.id } },
          create: { evalRunId: run.id, caseKey: item.id, roleKey: item.roleKey, question: item.question, answer: result.answer, citations: asJson(result.citations), deterministicGrade: asJson(result.deterministic), deterministicPassed: result.deterministic.passed, llmJudge: asJson(result.judge), latencyMs: result.latencyMs, failureCluster: result.deterministic.failureCluster ?? null, error: result.error ? asJson({ message: result.error }) : undefined, metadata: asJson({ suiteKey: AMI_BRAIN_FULL_DOMAIN_SUITE_KEY, domain: item.domain, role: item.role, type: item.type, difficulty: item.difficulty, expectedTarget: item.expectedTarget, notes: item.notes, turns: item.turns, completedTurns: result.completedTurns, runIds: result.runIds }) },
          update: { answer: result.answer, citations: asJson(result.citations), deterministicGrade: asJson(result.deterministic), deterministicPassed: result.deterministic.passed, llmJudge: asJson(result.judge), latencyMs: result.latencyMs, failureCluster: result.deterministic.failureCluster ?? null, error: result.error ? asJson({ message: result.error }) : null, metadata: asJson({ suiteKey: AMI_BRAIN_FULL_DOMAIN_SUITE_KEY, domain: item.domain, role: item.role, type: item.type, difficulty: item.difficulty, expectedTarget: item.expectedTarget, notes: item.notes, turns: item.turns, completedTurns: result.completedTurns, runIds: result.runIds }) },
        });
        if ((index + 1) % options.checkpointEvery === 0 || index + 1 === pending.length) await writeCheckpoint(prisma, run.id, options.stage, sourceChecksum, outputDir);
        console.log(`[${completed.size + index + 1}/${cases.length}] ${item.id} ${result.deterministic.passed ? 'pass' : result.deterministic.failureCluster} ${result.latencyMs}ms judge=${result.judge.verdict}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency, pending.length) }, worker));
    if (providerFailures >= options.providerFailureThreshold) {
      await prisma.brainEvalRun.update({ where: { id: run.id }, data: { status: 'failed', error: asJson({ code: 'provider_failure_threshold', threshold: options.providerFailureThreshold }) } });
      throw new Error(`ami_brain_full_domain_eval_provider_failure_threshold:${run.id}`);
    }
    const summary = await summarize(prisma, run.id, cases.length, options, sourceChecksum, snapshot.releaseFingerprint, activeRelease);
    await prisma.brainEvalRun.update({ where: { id: run.id }, data: { status: 'completed', caseCount: summary.total, passedCount: summary.passed, failedCount: summary.failed, summary: asJson(summary), results: asJson(summary.compactResults), finishedAt: new Date() } });
    const allResults = await prisma.brainEvalResult.findMany({ where: { evalRunId: run.id }, orderBy: { caseKey: 'asc' } });
    writeFileSync(resolve(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    writeFileSync(resolve(outputDir, 'results.json'), `${JSON.stringify(allResults, null, 2)}\n`, 'utf8');
    writeFileSync(resolve(outputDir, 'manual-review.csv'), toManualReviewCsv(allResults), 'utf8');
    if (options.stage === 'full') {
      mkdirSync(REPORT_ROOT, { recursive: true });
      writeFileSync(resolve(REPORT_ROOT, `Ami-Brain-全领域实测2000题最新发布快照复测报告-2026-07-22-${options.runKey}.md`), buildReport(summary, allResults), 'utf8');
    }
    console.log(`[full-domain-eval] completed run=${run.id} output=${outputDir}`);
  } finally { await app.close(); }
}

async function executeCase(input: { chat: BrainChatService; ai: AiService; item: FullDomainEvalCase; runId: number; snapshot: Awaited<ReturnType<BrainReleaseService['freezeEvaluationRelease']>>; userId: number; permissions: string[] }) {
  const started = Date.now(); let answer = ''; let citations: unknown[] = []; let blocks: unknown[] = []; let status = 'failed'; let error: string | undefined; const runIds: number[] = []; let conversationId: number | undefined; let completedTurns = 0;
  const context = { userId: input.userId, storeId: 6, visibleStoreIds: [6], roles: [input.item.roleKey], permissions: input.permissions, deniedPermissions: [], requestId: `full_domain_eval_${input.runId}_${input.item.id}`, timezone: 'Asia/Shanghai', governanceEvalReleaseId: input.snapshot.releaseId, governanceEvalReleaseSnapshot: input.snapshot };
  try {
    const conversation = await input.chat.createConversation(context, { title: `全领域评测 ${input.item.id}`.slice(0, 80) }); conversationId = conversation.id;
    for (const [index, turn] of input.item.turns.entries()) {
      const response = await input.chat.sendMessage({ ...context, requestId: `${context.requestId}_${index + 1}` }, conversation.id, { message: turn, timezone: 'Asia/Shanghai', roleHint: input.item.roleKey as never });
      answer = response.answer; citations = response.citations ?? []; blocks = response.blocks ?? []; status = response.status; runIds.push(response.runId); completedTurns += 1;
    }
  } catch (cause) { error = cause instanceof Error ? cause.message : 'eval_case_failed'; }
  const deterministic = deterministicFullDomainGrade({ test: input.item, answer, status, citations, blocks, error, completedTurns });
  const judge = await judgeCase(input.ai, input.item, answer, citations, deterministic, error);
  return { answer, citations, deterministic, judge, error, latencyMs: Date.now() - started, completedTurns, conversationId, runIds };
}

async function judgeCase(ai: AiService, item: FullDomainEvalCase, answer: string, citations: unknown[], deterministic: ReturnType<typeof deterministicFullDomainGrade>, error?: string): Promise<JudgeResult> {
  if (!deterministic.passed) return { verdict: 'fail', targetAlignment: false, completeness: 'insufficient_evidence', factualGrounding: 'insufficient', reason: `确定性门禁失败：${deterministic.failureCluster ?? error ?? 'unknown'}` };
  try {
    const result = await ai.generateStructured<JudgeResult>({ scenario: 'brain.full-domain-eval.judge', storeId: 6, temperature: 0, timeoutMs: 30000, schema: { type: 'object', additionalProperties: false, required: ['verdict', 'targetAlignment', 'completeness', 'factualGrounding', 'reason'], properties: { verdict: { type: 'string', enum: ['pass', 'fail', 'insufficient_evidence'] }, targetAlignment: { type: 'boolean' }, completeness: { type: 'string', enum: ['complete', 'partial', 'insufficient_evidence'] }, factualGrounding: { type: 'string', enum: ['sufficient', 'insufficient', 'contradicted'] }, reason: { type: 'string', maxLength: 300 } } }, messages: [{ role: 'system', content: '你是保守的美业数据问答评测裁判。不能验证事实或缺少逐题标准数值时，必须输出 insufficient_evidence，不得凭流畅性判正确。只评估目标对齐、相关性、完整性和引用依据。' }, { role: 'user', content: JSON.stringify({ questionId: item.id, domain: item.domain, role: item.role, type: item.type, expectedTarget: item.expectedTarget, notes: item.notes, answer, citationCount: citations.length }) }] });
    return result.data;
  } catch (cause) { return { verdict: 'insufficient_evidence', targetAlignment: false, completeness: 'insufficient_evidence', factualGrounding: 'insufficient', reason: `Judge 不可用，需人工复核：${cause instanceof Error ? cause.message : 'unknown'}` }; }
}

async function writeCheckpoint(prisma: PrismaService, runId: number, stage: string, sourceChecksum: string, outputDir: string) {
  const rows = await prisma.brainEvalResult.findMany({ where: { evalRunId: runId }, select: { caseKey: true, deterministicPassed: true, failureCluster: true } });
  writeFileSync(resolve(outputDir, 'checkpoint.json'), `${JSON.stringify({ runId, stage, sourceChecksum, completed: rows.length, items: rows }, null, 2)}\n`, 'utf8');
}

async function summarize(
  prisma: PrismaService,
  runId: number,
  expectedTotal: number,
  options: Options,
  sourceChecksum: string,
  releaseFingerprint: string,
  activeRelease: { id: number; releaseKey: string; activatedAt: Date | null; rollout: unknown },
) {
  const rows = await prisma.brainEvalResult.findMany({ where: { evalRunId: runId }, select: { caseKey: true, deterministicPassed: true, failureCluster: true, latencyMs: true, llmJudge: true, metadata: true } });
  const providerUnavailable = rows.filter((item) => item.failureCluster === 'provider_unavailable').length;
  const passed = rows.filter((item) => item.deterministicPassed).length;
  const judge = rows.map((item) => asRecord(item.llmJudge)); const judgePassed = judge.filter((item) => item.verdict === 'pass').length; const manualReview = judge.filter((item) => item.verdict === 'insufficient_evidence').length;
  const latencies = rows.map((item) => item.latencyMs ?? 0).filter((item) => item > 0).sort((a, b) => a - b);
  const by = (key: string) => Object.fromEntries([...new Set(rows.map((item) => String(asRecord(item.metadata)[key] ?? 'unknown')))].sort().map((value) => { const group = rows.filter((item) => String(asRecord(item.metadata)[key] ?? 'unknown') === value); return [value, { total: group.length, passed: group.filter((item) => item.deterministicPassed).length, failed: group.filter((item) => !item.deterministicPassed).length }]; }));
  const clusters = Object.fromEntries([...new Set(rows.filter((item) => !item.deterministicPassed).map((item) => item.failureCluster ?? 'unknown'))].sort().map((value) => [value, rows.filter((item) => !item.deterministicPassed && (item.failureCluster ?? 'unknown') === value).length]));
  const previousRun = options.comparisonRunId
    ? await prisma.brainEvalRun.findFirst({
        where: { id: options.comparisonRunId, storeId: 6 },
        select: { id: true, releaseId: true, status: true, passedCount: true, failedCount: true, caseCount: true, summary: true },
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
    suiteKey: AMI_BRAIN_FULL_DOMAIN_SUITE_KEY,
    suiteLabel: options.runLabel,
    runKey: options.runKey,
    executionPurpose: 'latest_active_release_rerun',
    stage: options.stage,
    sourceChecksum,
    releaseFingerprint,
    activeRelease: { id: activeRelease.id, releaseKey: activeRelease.releaseKey, activatedAt: activeRelease.activatedAt?.toISOString() ?? null, rollout: activeRelease.rollout },
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
    averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
    p95LatencyMs: percentile(latencies, .95),
    byDomain: by('domain'),
    byRole: by('role'),
    byType: by('type'),
    byDifficulty: by('difficulty'),
    failureClusters: clusters,
    compactResults: rows.map((item) => ({ caseKey: item.caseKey, passed: item.deterministicPassed, cluster: item.failureCluster, latencyMs: item.latencyMs })),
  };
}

function buildReport(summary: any, results: any[]) {
  const manual = results.filter((item) => asRecord(item.llmJudge).verdict === 'insufficient_evidence').slice(0, 20).map((item) => `- ${item.caseKey}：${String(asRecord(item.metadata).domain ?? '未分类')} / ${String(asRecord(item.metadata).type ?? '未分类')}；${String(asRecord(item.llmJudge).reason ?? '需人工复核')}`);
  const comparison = asRecord(summary.comparison);
  const comparisonSection = comparison.previousRunId
    ? `## 与上一轮 #${comparison.previousRunId} 对比\n\n|项目|上一轮|本轮|\n|---|---:|---:|\n|发布 ID|${comparison.previousReleaseId ?? '-'}|${summary.activeRelease?.id ?? '-'}|\n|发布指纹|${comparison.previousReleaseFingerprint ?? '-'}|${summary.releaseFingerprint}|\n|确定性通过率|${formatRate(comparison.previousDeterministicPassRate ?? null)}|${formatRate(summary.deterministicPassRate)}|\n|平均耗时|${comparison.previousAverageLatencyMs ?? '-'} ms|${summary.averageLatencyMs ?? '-'} ms|\n|P95 耗时|${comparison.previousP95LatencyMs ?? '-'} ms|${summary.p95LatencyMs ?? '-'} ms|\n\n结论：${comparison.sameReleaseFingerprint ? '两轮使用同一发布指纹，本轮是可复现性复测。' : '两轮发布指纹不同，结果差异必须按发布快照解释。'}\n\n上一轮失败簇：\n\n\`\`\`json\n${JSON.stringify(comparison.previousFailureClusters ?? {}, null, 2)}\n\`\`\`\n\n`
    : '';
  return `# Ami Brain 全领域实测 2000 题最新发布快照复测报告\n\n- 评测日期：2026-07-22\n- 套件：${summary.suiteLabel}\n- 运行标识：\`${summary.runKey}\`\n- 当前 active Release：#${summary.activeRelease?.id ?? '-'}（${summary.activeRelease?.releaseKey ?? '-'}）\n- 冻结发布指纹：\`${summary.releaseFingerprint}\`\n- 题库 SHA-256：\`${summary.sourceChecksum}\`\n- 门店：storeId=6\n- 运行边界：评测会话、运行与评分记录可写；未确认任何业务动作，未改 Agent 架构、能力目录、语义或业务 API。\n\n## 总览\n\n|场景|确定性通过|确定性失败|基础设施异常|Judge 通过|需人工复核|平均/P95 耗时|\n|---:|---:|---:|---:|---:|---:|---:|\n|${summary.total}|${summary.passed}|${summary.failed}|${summary.providerUnavailable}|${summary.judgePassed}|${summary.manualReview}|${summary.averageLatencyMs ?? '-'} / ${summary.p95LatencyMs ?? '-'} ms|\n\n确定性通过率：${formatRate(summary.deterministicPassRate)}；Judge 通过率：${formatRate(summary.judgePassRate)}。Judge 不覆盖任何确定性失败。\n\n${comparisonSection}## 六层门禁与安全\n\n- 动作题仅允许预览或确认请求；本轮未调用确认接口。\n- 权限题必须拒绝或脱敏；歧义题必须澄清；多轮题必须在同一评测会话完成两轮。\n- 无法验证逐题事实时，Judge 一律标记“需人工复核”。\n\n## 分布与失败簇\n\n\`\`\`json\n${JSON.stringify({ byDomain: summary.byDomain, byRole: summary.byRole, byType: summary.byType, byDifficulty: summary.byDifficulty, failureClusters: summary.failureClusters }, null, 2)}\n\`\`\`\n\n## 人工复核队列（脱敏）\n\n${manual.join('\n') || '无'}\n\n## 下一轮迭代建议\n\n### P0\n\n- 优先修复失败簇最高的确定性门禁问题，特别是权限拒绝、歧义澄清、动作预览和多轮承接。\n- 对基础设施异常建立单独可恢复队列；不得混入产品能力失败。\n\n### P1\n\n- 对 Judge 标记为需人工复核的高频领域补齐可审计的事实锚点和标准答案快照。\n- 对领域/角色通过率差异超过整体 15 个百分点的组合做定向回归题集。\n\n### P2\n\n- 在不改变发布门禁的前提下，引入长期趋势看板，追踪耗时 P95、人工复核率和失败簇收敛。\n`;
}
function toManualReviewCsv(rows: any[]) { return ['case_id,domain,type,reason', ...rows.filter((item) => asRecord(item.llmJudge).verdict === 'insufficient_evidence').map((item) => [item.caseKey, asRecord(item.metadata).domain ?? '', asRecord(item.metadata).type ?? '', asRecord(item.llmJudge).reason ?? ''].map(csv).join(','))].join('\n') + '\n'; }
function parseOptions(args: string[]): Options {
  const get = (name: string) => args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
  const stage = get('--stage') ?? 'preflight';
  if (stage !== 'preflight' && stage !== 'full') throw new Error('stage must be preflight or full');
  const runKey = get('--run-key') ?? `latest-snapshot-rerun-${new Date().toISOString().replaceAll(/[:.]/g, '').replace('T', '-').replace('Z', '')}`;
  if (!/^[a-zA-Z0-9_-]+$/.test(runKey)) throw new Error('run-key must only contain letters, numbers, underscores, or hyphens');
  return {
    stage,
    resumeRunId: numberOrUndefined(get('--resume-run-id')),
    comparisonRunId: numberOrUndefined(get('--comparison-run-id')),
    runKey,
    runLabel: get('--run-label') ?? 'Ami Brain 全领域实测 2000 / 最新快照复测',
    concurrency: Math.max(1, Math.min(2, Number(get('--concurrency') ?? 2))),
    checkpointEvery: Math.max(1, Number(get('--checkpoint-every') ?? 25)),
    providerFailureThreshold: Math.max(1, Number(get('--provider-failure-threshold') ?? 8)),
  };
}
function numberOrUndefined(value: string | undefined) { return value ? Number(value) : undefined; }
function asJson(value: any): any { return value; }
function asRecord(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function percentile(values: number[], p: number) { return values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null; }
function relative(value: string) { return value.replace(`${ROOT}\\`, ''); }
function formatRate(value: number | null) { return value == null ? '-' : `${(value * 100).toFixed(1)}%`; }
function csv(value: unknown) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function assertSuiteShape(cases: FullDomainEvalCase[]) {
  const ids = new Set(cases.map((item) => item.id));
  const count = (type: string) => cases.filter((item) => item.type === type).length;
  const multiTurn = cases.filter((item) => item.turns.length === 2).length;
  if (cases.length !== 2000 || ids.size !== 2000 || multiTurn !== 33 || count('ambiguity') !== 27 || count('permission') !== 20 || count('action') !== 280) {
    throw new Error(`ami_brain_full_domain_eval_suite_shape_invalid:total=${cases.length},unique=${ids.size},multiTurn=${multiTurn},ambiguity=${count('ambiguity')},permission=${count('permission')},action=${count('action')}`);
  }
}
function resolveRolePermissions(permissions: Map<string, string[]>, roleKey: string) {
  const aliases: Record<string, string[]> = { store_manager: ['store_manager', 'manager', 'ami_demo_full_manager'], receptionist: ['receptionist', 'front_desk', 'cashier', 'ami_demo_full_cashier'], finance: ['finance', 'cashier', 'ami_demo_full_cashier'], beautician: ['beautician', 'ami_demo_full_beautician'], inventory: ['inventory'], marketing: ['marketing'], customer_service: ['customer_service'] };
  for (const key of aliases[roleKey] ?? [roleKey]) { const value = permissions.get(key); if (value?.length) return value; }
  return [];
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
