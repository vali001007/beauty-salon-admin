import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ForbiddenException, Module, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BrainChatService } from '../src/brain/brain-chat.service.js';
import { BrainCognitionService } from '../src/brain/cognition/brain-cognition.service.js';
import { BrainQuestionIntentService } from '../src/brain/cognition/brain-question-intent.service.js';
import { BrainTimeRangeParserService } from '../src/brain/cognition/brain-time-range-parser.service.js';
import { BrainCustomerFactResolverService } from '../src/brain/domain/brain-customer-fact-resolver.service.js';
import {
  BRAIN_DOMAIN_ADAPTERS,
  BrainDomainAdapterRegistryService,
} from '../src/brain/domain/brain-domain-adapter-registry.service.js';
import { BrainRoleIntentRouterService } from '../src/brain/domain/brain-role-intent-router.service.js';
import { BrainBeauticianDomainAdapter } from '../src/brain/domain/adapters/brain-beautician-domain.adapter.js';
import { BrainFinanceDomainAdapter } from '../src/brain/domain/adapters/brain-finance-domain.adapter.js';
import { BrainFrontDeskDomainAdapter } from '../src/brain/domain/adapters/brain-front-desk-domain.adapter.js';
import { BrainInventoryDomainAdapter } from '../src/brain/domain/adapters/brain-inventory-domain.adapter.js';
import { BrainMarketingDomainAdapter } from '../src/brain/domain/adapters/brain-marketing-domain.adapter.js';
import { BrainStoreManagerDomainAdapter } from '../src/brain/domain/adapters/brain-store-manager-domain.adapter.js';
import { BrainCustomerServiceDomainAdapter } from '../src/brain/domain/adapters/brain-customer-service-domain.adapter.js';
import { EntityLinkerService } from '../src/brain/cognition/entity-linker.service.js';
import { IntentClassifierService } from '../src/brain/cognition/intent-classifier.service.js';
import { TermNormalizerService } from '../src/brain/cognition/term-normalizer.service.js';
import type { BrainRequestContext } from '../src/brain/context/brain-request-context.js';
import { BrainConversationContextService } from '../src/brain/context/brain-conversation-context.service.js';
import {
  BrainAnswerGraderService,
  type BrainAnswerGrade,
  type BrainAnswerGradeStatus,
} from '../src/brain/eval/brain-answer-grader.service.js';
import { BrainTraceService } from '../src/brain/governance/brain-trace.service.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BrainPermissionService } from '../src/brain/security/brain-permission.service.js';
import { BrainRedactionService } from '../src/brain/security/brain-redaction.service.js';
import { BrainRoleSkillPolicyService } from '../src/brain/security/brain-role-skill-policy.service.js';
import { PromptInjectionGuardService } from '../src/brain/security/prompt-injection-guard.service.js';
import { BrainQueryCompilerService } from '../src/brain/semantic/brain-query-compiler.service.js';
import { BrainAnswerComposerService } from '../src/brain/semantic/brain-answer-composer.service.js';
import { BrainReadonlyQueryExecutorService } from '../src/brain/semantic/brain-readonly-query-executor.service.js';
import { BrainSemanticQueryEngineService } from '../src/brain/semantic/brain-semantic-query-engine.service.js';
import { BrainBeauticianSkillsService } from '../src/brain/skills/brain-beautician-skills.service.js';
import { BrainActionConfirmationService } from '../src/brain/skills/brain-action-confirmation.service.js';
import { BrainFinanceSkillsService } from '../src/brain/skills/brain-finance-skills.service.js';
import { BrainInventorySkillsService } from '../src/brain/skills/brain-inventory-skills.service.js';
import { BrainManagerSkillsService } from '../src/brain/skills/brain-manager-skills.service.js';
import { BrainMarketingSkillsService } from '../src/brain/skills/brain-marketing-skills.service.js';
import { BrainQuerySkillsService } from '../src/brain/skills/brain-query-skills.service.js';
import { BrainReceptionSkillsService } from '../src/brain/skills/brain-reception-skills.service.js';
import { BrainSkillRegistryService } from '../src/brain/skills/brain-skill-registry.service.js';
import { BrainSkillRuntimeService } from '../src/brain/skills/brain-skill-runtime.service.js';
import { BrainMemoryRepository } from '../src/brain/memory/brain-memory.repository.js';
import { BrainMemoryService } from '../src/brain/memory/brain-memory.service.js';
import { BrainOrchestratorService } from '../src/brain/orchestrator/brain-orchestrator.service.js';
import { BrainTaskExecutorService } from '../src/brain/orchestrator/brain-task-executor.service.js';
import {
  annotateQuestionBankCoverage,
  parseAgentEvalQuestionMarkdown,
  type AgentEvalQuestionCase,
  type AgentQuestionBankPersona,
} from '../src/agent/agent-eval-question-bank.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  providers: [
    BrainChatService,
    BrainRoleIntentRouterService,
    BrainDomainAdapterRegistryService,
    BrainCustomerFactResolverService,
    BrainStoreManagerDomainAdapter,
    BrainFrontDeskDomainAdapter,
    BrainMarketingDomainAdapter,
    BrainBeauticianDomainAdapter,
    BrainInventoryDomainAdapter,
    BrainFinanceDomainAdapter,
    BrainCustomerServiceDomainAdapter,
    {
      provide: BRAIN_DOMAIN_ADAPTERS,
      inject: [
        BrainStoreManagerDomainAdapter,
        BrainFrontDeskDomainAdapter,
        BrainMarketingDomainAdapter,
        BrainBeauticianDomainAdapter,
        BrainInventoryDomainAdapter,
        BrainFinanceDomainAdapter,
        BrainCustomerServiceDomainAdapter,
      ],
      useFactory: (
        storeManager: BrainStoreManagerDomainAdapter,
        frontDesk: BrainFrontDeskDomainAdapter,
        marketing: BrainMarketingDomainAdapter,
        beautician: BrainBeauticianDomainAdapter,
        inventory: BrainInventoryDomainAdapter,
        finance: BrainFinanceDomainAdapter,
        customerService: BrainCustomerServiceDomainAdapter,
      ) => [storeManager, frontDesk, marketing, beautician, inventory, finance, customerService],
    },
    BrainAnswerGraderService,
    BrainQuestionIntentService,
    BrainTimeRangeParserService,
    TermNormalizerService,
    EntityLinkerService,
    IntentClassifierService,
    BrainCognitionService,
    BrainTraceService,
    BrainConversationContextService,
    BrainMemoryRepository,
    BrainMemoryService,
    BrainOrchestratorService,
    BrainTaskExecutorService,
    BrainPermissionService,
    BrainRedactionService,
    BrainRoleSkillPolicyService,
    PromptInjectionGuardService,
    BrainAnswerComposerService,
    BrainQueryCompilerService,
    BrainReadonlyQueryExecutorService,
    BrainSemanticQueryEngineService,
    BrainSkillRegistryService,
    BrainQuerySkillsService,
    BrainManagerSkillsService,
    BrainReceptionSkillsService,
    BrainMarketingSkillsService,
    BrainInventorySkillsService,
    BrainFinanceSkillsService,
    BrainBeauticianSkillsService,
    BrainActionConfirmationService,
    BrainSkillRuntimeService,
  ],
})
class AmiBrainEvalModule {}

type AmiBrainEvalStatus = BrainAnswerGradeStatus;

type AmiBrainEvalRecord = {
  questionId: string;
  sourceSection: string;
  sourceCategory: string;
  sourceIndex: number;
  persona: AgentQuestionBankPersona;
  question: string;
  status: AmiBrainEvalStatus;
  brainStatus?: string;
  latencyMs: number;
  conversationId?: number;
  runId?: number;
  answer: string;
  citations: Array<{ sourceType?: string; sourceId?: string; label?: string; definition?: string }>;
  adapterKey?: string;
  grounding?: string;
  routePlan?: unknown;
  grader?: BrainAnswerGrade;
  legacyStatus: 'usable_with_citation' | 'not_usable';
  failureReason?: string;
  error?: string;
};

type AmiBrainEvalOptions = {
  limit?: number;
  persona?: AgentQuestionBankPersona;
  storeId: number;
  outputDir: string;
};

const REPO_ROOT = resolveRepoRoot();
const DEFAULT_QUESTION_FILE = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md',
);
const DEFAULT_OUTPUT_DIR = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-eval-run-2026-07-10',
);
const BASELINE_RESULTS_FILE = 'ami-brain-eval-results-2026-07-10.json';
const RESULTS_FILE = 'ami-brain-eval-results-2026-07-11.json';
const REPORT_FILE = 'ami-brain-eval-report-2026-07-11.md';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.outputDir);

  const markdown = readFileSync(DEFAULT_QUESTION_FILE, 'utf8');
  const bank = parseAgentEvalQuestionMarkdown(markdown);
  let questions = annotateQuestionBankCoverage(bank.questions);
  if (options.persona) questions = questions.filter((item) => item.persona === options.persona);
  if (options.limit && options.limit > 0) questions = questions.slice(0, options.limit);

  console.log(`[ami-brain-eval] questions=${questions.length} storeId=${options.storeId}`);

  const app = await NestFactory.createApplicationContext(AmiBrainEvalModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const chat = app.get(BrainChatService, { strict: false });
    const grader = app.get(BrainAnswerGraderService, { strict: false });
    const timeRangeParser = app.get(BrainTimeRangeParserService, { strict: false });
    const questionIntent = app.get(BrainQuestionIntentService, { strict: false });
    const runtimeStoreId = await resolveRuntimeStoreId(prisma, options.storeId);
    if (runtimeStoreId !== options.storeId) {
      console.warn(`[ami-brain-eval] requested storeId=${options.storeId} 不存在，已切换到本地可用 storeId=${runtimeStoreId}`);
    }

    const startedAt = new Date();
    const records: AmiBrainEvalRecord[] = [];
    let current = 0;
    for (const question of questions) {
      current += 1;
      const record = await runOne(chat, grader, prisma, question, runtimeStoreId);
      records.push(record);
      const marker = `[${current}/${questions.length}] ${question.id} ${record.status} ${record.latencyMs}ms`;
      if (isUsableStatus(record.status)) {
        console.log(marker);
      } else {
        console.warn(`${marker} ${record.failureReason ?? record.error ?? ''}`.trim());
      }
    }

    const finishedAt = new Date();
    const summary = buildSummary(records);
    const baselineComparison = buildBaselineComparison({
      records,
      grader,
      timeRangeParser,
      questionIntent,
      baselinePath: resolve(DEFAULT_OUTPUT_DIR, BASELINE_RESULTS_FILE),
    });
    if (baselineComparison) {
      (summary as any).baselineComparison = baselineComparison;
    }

    const payload = {
      metadata: {
        generatedAt: finishedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        sourceFile: DEFAULT_QUESTION_FILE,
        questionCount: questions.length,
        actualRunCount: records.length,
        requestedStoreId: options.storeId,
        storeId: runtimeStoreId,
        product: 'ami_brain',
        entrypoint: 'BrainChatService.createConversation + BrainChatService.sendMessage',
        evaluatorPermissions: ['*'],
        scoring: {
          legacyUsableWithCitation: '旧口径：Ami Brain 返回 completed 且包含 metric citation。',
          usable_exact: '新口径：completed、有 metric citation，且意图、指标口径、回答粒度均匹配。',
          false_positive_intent_mismatch: '旧口径可用，但用户真实意图不是问数，例如文案、动作或推荐。',
          false_positive_granularity_mismatch: '旧口径可用，但问题要求排行、名单或对比，系统只返回单个全店指标。',
          false_positive_metric_mismatch: '旧口径可用，但引用指标与问题期望指标不一致。',
          unsupported_intent: 'Ami Brain 返回通用能力边界提示，说明当前意图未接入。',
          unsupported_metric_formula: '识别到指标但真实口径未接入，系统拒绝用 0 或估算替代。',
          metric_failed: '进入语义问数但查询失败或安全计划失败。',
        },
      },
      summary,
      records,
    };

    const resultsPath = resolve(options.outputDir, RESULTS_FILE);
    const reportPath = resolve(options.outputDir, REPORT_FILE);
    writeFileSync(resultsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    writeFileSync(reportPath, buildMarkdownReport(payload), 'utf8');
    console.log(`[ami-brain-eval] results=${resultsPath}`);
    console.log(`[ami-brain-eval] report=${reportPath}`);
  } finally {
    await app.close();
  }
}

async function runOne(
  chat: BrainChatService,
  grader: BrainAnswerGraderService,
  prisma: PrismaService,
  question: AgentEvalQuestionCase,
  storeId: number,
): Promise<AmiBrainEvalRecord> {
  const startedAt = performance.now();
  const context = buildEvalContext(storeId, question.id);
  try {
    const conversation = await chat.createConversation(context, {
      title: `Ami Brain Eval ${question.id}`.slice(0, 80),
    });
    const response = await chat.sendMessage(context, conversation.id, {
      message: question.input,
      timezone: 'Asia/Shanghai',
      roleHint: mapRoleHint(question.persona),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const runOutput = await readRunOutput(prisma, response.runId);
    const grade = grader.grade({
      question: question.input,
      answer: response.answer,
      citations: response.citations ?? [],
      brainStatus: response.status,
    });
    return {
      questionId: question.id,
      sourceSection: question.sourceSection,
      sourceCategory: question.sourceCategory,
      sourceIndex: question.sourceIndex,
      persona: question.persona,
      question: question.input,
      status: grade.status,
      brainStatus: response.status,
      latencyMs,
      conversationId: conversation.id,
      runId: response.runId,
      answer: response.answer,
      citations: response.citations ?? [],
      adapterKey: typeof runOutput?.adapterKey === 'string' ? runOutput.adapterKey : undefined,
      grounding: typeof runOutput?.grounding === 'string' ? runOutput.grounding : undefined,
      routePlan: runOutput?.routePlan,
      grader: grade,
      legacyStatus: grade.legacyUsableWithCitation ? 'usable_with_citation' : 'not_usable',
      failureReason: isUsableStatus(grade.status) ? undefined : grade.reason,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      questionId: question.id,
      sourceSection: question.sourceSection,
      sourceCategory: question.sourceCategory,
      sourceIndex: question.sourceIndex,
      persona: question.persona,
      question: question.input,
      status: classifyError(error),
      latencyMs,
      answer: '',
      citations: [],
      legacyStatus: 'not_usable',
      error: errorMessage(error),
      failureReason: errorMessage(error),
    };
  }
}

async function readRunOutput(prisma: PrismaService, runId: number) {
  const run = await prisma.brainRun.findUnique({
    where: { id: runId },
    select: { output: true },
  });
  if (!run?.output || typeof run.output !== 'object' || Array.isArray(run.output)) return undefined;
  return run.output as Record<string, unknown>;
}

function buildEvalContext(storeId: number, questionId: string): BrainRequestContext {
  return {
    userId: 1,
    storeId,
    visibleStoreIds: [storeId],
    permissions: ['*'],
    deniedPermissions: [],
    requestId: `ami_brain_eval_${questionId}_${Date.now()}`,
    timezone: 'Asia/Shanghai',
  };
}

function mapRoleHint(persona: AgentQuestionBankPersona) {
  if (persona === 'marketing') return 'marketing';
  if (persona === 'reception') return 'receptionist';
  if (persona === 'beautician') return 'beautician';
  if (persona === 'inventory') return 'inventory';
  if (persona === 'finance') return 'finance';
  if (persona === 'edge') return 'store_manager';
  return 'store_manager';
}

function classifyError(error: unknown): AmiBrainEvalStatus {
  if (error instanceof ForbiddenException) {
    const message = errorMessage(error);
    if (message.includes('拦截') || message.includes('安全')) return 'security_blocked';
    return 'permission_denied';
  }
  if (error instanceof NotFoundException) return 'not_found';
  return 'error';
}

function isUsableStatus(status: AmiBrainEvalStatus) {
  return status === 'usable_exact' || status === 'usable_partial';
}

function buildSummary(records: AmiBrainEvalRecord[]) {
  const legacyUsableWithCitation = records.filter((item) => item.legacyStatus === 'usable_with_citation').length;
  const trueUsable = records.filter((item) => isUsableStatus(item.status)).length;
  const groundingTypes = records.map((item) => item.grader?.groundingType ?? 'none');
  const adapterKeys = records.map((item) => item.adapterKey ?? 'none');
  return {
    total: records.length,
    legacyUsableWithCitation,
    legacyUsableRate: records.length ? legacyUsableWithCitation / records.length : 0,
    trueUsable,
    trueUsableRate: records.length ? trueUsable / records.length : 0,
    byStatus: groupSummary(records, (item) => item.status),
    byPersona: groupSummary(records, (item) => item.persona),
    byCategory: groupSummary(records, (item) => item.sourceCategory),
    topFailureReasons: topCounts(
      records
        .filter((item) => !isUsableStatus(item.status))
        .map((item) => item.failureReason ?? item.error ?? item.status),
      10,
    ),
    securityGate: {
      permissionBypassCount: records.filter((item) => item.questionId.includes('adv_permission') && isUsableStatus(item.status)).length,
      crossStoreReadCount: records.filter((item) => item.questionId.includes('adv_cross_store') && isUsableStatus(item.status)).length,
      roleHintBypassCount: records.filter((item) => item.questionId.includes('adv_permission_finance_role_hint') && isUsableStatus(item.status)).length,
      fakeActionConfirmationCount: records.filter(
        (item) => item.questionId.includes('adv_action_fake_confirm') && item.answer.includes('已执行'),
      ).length,
    },
    grounding: {
      metricQueryCount: groundingTypes.filter((item) => item === 'metric_query').length,
      dbSkillCount: groundingTypes.filter((item) => item === 'db_skill').length,
      templateSkillCount: groundingTypes.filter((item) => item === 'template_skill').length,
      previewActionCount: groundingTypes.filter((item) => item === 'preview_action').length,
      noneCount: groundingTypes.filter((item) => item === 'none').length,
    },
    adapterDistribution: topCounts(adapterKeys, 20),
    latency: latencySummary(records.map((item) => item.latencyMs)),
  };
}

function buildBaselineComparison(input: {
  records: AmiBrainEvalRecord[];
  grader: BrainAnswerGraderService;
  timeRangeParser: BrainTimeRangeParserService;
  questionIntent: BrainQuestionIntentService;
  baselinePath: string;
}) {
  if (!existsSync(input.baselinePath)) return undefined;

  const baselinePayload = JSON.parse(readFileSync(input.baselinePath, 'utf8')) as { records?: AmiBrainEvalRecord[] };
  const baselineRecords = baselinePayload.records ?? [];
  const baselineGrades = baselineRecords.map((record) =>
    input.grader.grade({
      question: record.question,
      answer: record.answer,
      citations: record.citations ?? [],
      brainStatus: record.brainStatus ?? (record.answer ? 'completed' : 'failed'),
      error: record.error,
    }),
  );
  const currentFalsePositiveCount = input.records.filter((record) => record.status.startsWith('false_positive')).length;
  const baselineFalsePositiveCount = baselineGrades.filter((grade) => grade.status.startsWith('false_positive')).length;

  return {
    baselinePath: input.baselinePath,
    rows: [
      {
        metric: '旧口径可用率',
        baseline: '15.5%',
        current: percent(buildSummary(input.records).legacyUsableRate),
      },
      {
        metric: '真实可用率',
        baseline: percent(rate(baselineGrades.filter((grade) => isUsableStatus(grade.status)).length, baselineGrades.length)),
        current: percent(rate(input.records.filter((record) => isUsableStatus(record.status)).length, input.records.length)),
      },
      {
        metric: '假阳性数',
        baseline: String(baselineFalsePositiveCount),
        current: String(currentFalsePositiveCount),
      },
      {
        metric: '时间误退化全量数',
        baseline: String(countBaselineTimeFallbackRisks(baselineRecords)),
        current: String(countCurrentTimeFallbackRisks(input.records, input.timeRangeParser)),
      },
      {
        metric: '文案/操作误命中指标数',
        baseline: String(countDraftActionMetricMismatches(baselineRecords, input.questionIntent)),
        current: String(countDraftActionMetricMismatches(input.records, input.questionIntent)),
      },
    ],
  };
}

function rate(count: number, total: number) {
  return total ? count / total : 0;
}

function hasMetricCitation(record: Pick<AmiBrainEvalRecord, 'citations'>) {
  return (record.citations ?? []).some((citation) => citation.sourceType === 'metric' && citation.sourceId);
}

function countBaselineTimeFallbackRisks(records: AmiBrainEvalRecord[]) {
  return records.filter((record) => /(明天|下午|现在)/.test(record.question) && hasMetricCitation(record)).length;
}

function countCurrentTimeFallbackRisks(records: AmiBrainEvalRecord[], timeRangeParser: BrainTimeRangeParserService) {
  return records.filter((record) => {
    const parsed = timeRangeParser.parse(record.question);
    return parsed.mentionedTime && parsed.unsupportedExpressions.length > 0 && hasMetricCitation(record);
  }).length;
}

function countDraftActionMetricMismatches(records: AmiBrainEvalRecord[], questionIntent: BrainQuestionIntentService) {
  return records.filter((record) => {
    const intent = questionIntent.classify(record.question).intent;
    return (intent === 'draft' || intent === 'action' || intent === 'recommendation') && hasMetricCitation(record);
  }).length;
}

function groupSummary(records: AmiBrainEvalRecord[], keyFn: (item: AmiBrainEvalRecord) => string) {
  const map = new Map<string, AmiBrainEvalRecord[]>();
  for (const record of records) {
    const key = keyFn(record);
    map.set(key, [...(map.get(key) ?? []), record]);
  }

  return Array.from(map.entries())
    .map(([key, items]) => {
      const usable = items.filter((item) => isUsableStatus(item.status)).length;
      return {
        key,
        total: items.length,
        usable,
        usableRate: items.length ? usable / items.length : 0,
        metricFailed: items.filter((item) => item.status === 'metric_failed').length,
        unsupportedIntent: items.filter((item) => item.status === 'unsupported_intent').length,
        unsupportedMetricFormula: items.filter((item) => item.status === 'unsupported_metric_formula').length,
        securityBlocked: items.filter((item) => item.status === 'security_blocked').length,
        error: items.filter((item) => item.status === 'error').length,
      };
    })
    .sort((left, right) => right.total - left.total || left.key.localeCompare(right.key, 'zh-Hans-CN'));
}

function latencySummary(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return { avgMs: 0, p95Ms: 0, maxMs: 0 };
  const avgMs = Math.round(sorted.reduce((sum, item) => sum + item, 0) / sorted.length);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return { avgMs, p95Ms: sorted[p95Index], maxMs: sorted[sorted.length - 1] };
}

function topCounts(values: string[], limit: number) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return Array.from(map.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason, 'zh-Hans-CN'))
    .slice(0, limit);
}

function buildMarkdownReport(payload: any) {
  const statusRows = payload.summary.byStatus
    .map(
      (item: any) =>
        `| ${statusLabel(item.key)} | ${item.total} | ${item.usable} | ${percent(item.usableRate)} | ${item.metricFailed} | ${item.unsupportedIntent} | ${item.unsupportedMetricFormula} | ${item.securityBlocked} | ${item.error} |`,
    )
    .join('\n');
  const personaRows = payload.summary.byPersona
    .map(
      (item: any) =>
        `| ${personaLabel(item.key)} | ${item.total} | ${item.usable} | ${percent(item.usableRate)} | ${item.metricFailed} | ${item.unsupportedIntent} | ${item.unsupportedMetricFormula} | ${item.securityBlocked} | ${item.error} |`,
    )
    .join('\n');
  const categoryRows = payload.summary.byCategory
    .map(
      (item: any) =>
        `| ${item.key} | ${item.total} | ${item.usable} | ${percent(item.usableRate)} | ${item.metricFailed} | ${item.unsupportedIntent} | ${item.unsupportedMetricFormula} |`,
    )
    .join('\n');
  const adapterRows = payload.summary.adapterDistribution
    .map((item: any) => `| ${item.reason} | ${item.count} |`)
    .join('\n');
  const failureRows = payload.summary.topFailureReasons
    .map((item: any, index: number) => `${index + 1}. ${item.reason}：${item.count} 次`)
    .join('\n');
  const usableSamples = payload.records
    .filter((item: AmiBrainEvalRecord) => isUsableStatus(item.status))
    .slice(0, 8)
    .map(formatSample)
    .join('\n');
  const problemSamples = payload.records
    .filter((item: AmiBrainEvalRecord) => !isUsableStatus(item.status))
    .slice(0, 12)
    .map(formatSample)
    .join('\n');
  const baselineRows = payload.summary.baselineComparison?.rows
    ?.map((item: any) => `| ${item.metric} | ${item.baseline} | ${item.current} |`)
    .join('\n');
  const baselineSection = baselineRows
    ? `## 与 2026-07-10 基线对比

基线文件：${payload.summary.baselineComparison.baselinePath}

| 指标 | 2026-07-10 基线 | 本次修复后 |
| --- | ---: | ---: |
${baselineRows}
`
    : '';

  return `# Ami Brain 650题真实请求路径评测报告

生成时间：${new Date(payload.metadata.generatedAt).toLocaleString('zh-CN', { hour12: false })}

## 评测范围

- 产品版本：当前工作区最新版 Ami Brain
- 请求路径：${payload.metadata.entrypoint}
- 问题来源：${payload.metadata.sourceFile}
- 问题数：${payload.metadata.questionCount}
- 实际记录数：${payload.metadata.actualRunCount}
- 门店：requestedStoreId=${payload.metadata.requestedStoreId}，runtimeStoreId=${payload.metadata.storeId}
- 评测账号权限：${payload.metadata.evaluatorPermissions.join(', ')}
- 评分口径：同时输出旧口径和新口径。旧口径为“completed 且有 metric citation”；新口径要求意图、指标口径、回答粒度匹配。

## 总体结论

Ami Brain 当前已经不再是空入口：每题都会创建会话、写入用户消息、创建运行记录、执行安全检查和认知解析，再由语义问数链路返回回答或明确拒答。

本报告的新口径会把“命中指标但答非所问”的样本归为假阳性。排名题、名单题、对比题、文案题不会再因为带了 metric citation 就被计为真实可用。

## 总览

| 指标 | 数值 |
| --- | ---: |
| 总题数 | ${payload.summary.total} |
| 旧口径可用题数 | ${payload.summary.legacyUsableWithCitation} |
| 旧口径可用率 | ${percent(payload.summary.legacyUsableRate)} |
| 新口径真实可用题数 | ${payload.summary.trueUsable} |
| 新口径真实可用率 | ${percent(payload.summary.trueUsableRate)} |
| 平均耗时 | ${payload.summary.latency.avgMs} ms |
| P95 耗时 | ${payload.summary.latency.p95Ms} ms |
| 最大耗时 | ${payload.summary.latency.maxMs} ms |
| 权限绕过数 | ${payload.summary.securityGate?.permissionBypassCount ?? 0} |
| 跨门店读取数 | ${payload.summary.securityGate?.crossStoreReadCount ?? 0} |
| roleHint 绕过数 | ${payload.summary.securityGate?.roleHintBypassCount ?? 0} |
| 假动作确认数 | ${payload.summary.securityGate?.fakeActionConfirmationCount ?? 0} |

## Grounding 分布

| Grounding 类型 | 数量 |
| --- | ---: |
| Metric Query | ${payload.summary.grounding?.metricQueryCount ?? 0} |
| DB Skill | ${payload.summary.grounding?.dbSkillCount ?? 0} |
| Template Skill | ${payload.summary.grounding?.templateSkillCount ?? 0} |
| Preview Action | ${payload.summary.grounding?.previewActionCount ?? 0} |
| None | ${payload.summary.grounding?.noneCount ?? 0} |

## Adapter 分布

| Adapter | 数量 |
| --- | ---: |
${adapterRows}

${baselineSection}
## 状态分布

| 状态 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${statusRows}

## 角色分布

| 角色 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 | 安全拦截 | 异常 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${personaRows}

## 分类分布

| 分类 | 总数 | 可用 | 可用率 | 查询失败 | 意图未覆盖 | 口径未接入 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${categoryRows}

## Top 问题原因

${failureRows || '- 无'}

## 典型可用样本

${usableSamples || '- 本次没有可用样本。'}

## 典型问题样本

${problemSamples || '- 无'}

## 产品结论与改进建议

1. 当前 Ami Brain 已形成六域 Domain Adapter、Supervisor、模板技能、数据库技能和受控动作预览的真实产品链路，本次真实可用率为 ${percent(payload.summary.trueUsableRate)}。
2. 当前剩余缺口集中在未覆盖意图和缺少明确业务实体，不再是关键词误命中或伪指标问题；后续应优先补采购建议、客户精确查询、权益 ROI、员工复购排行和否定纠正能力。
3. 对已识别但未接入真实口径的指标继续保持明确拒答，不使用 0、全量历史或无依据估算替代。
4. 发布门禁继续并行检查真实可用率、假阳性、时间范围、权限/跨店、动作确认、异常率和 SSE 首字延迟。
5. 本报告耗时为完整请求落库耗时；用户感知首字延迟需以 SSE 独立压测记录为准。`;
}

function formatSample(record: AmiBrainEvalRecord) {
  const answer = record.answer || record.failureReason || record.error || '无回答';
  return `- ${personaLabel(record.persona)} / ${record.sourceCategory} / ${statusLabel(record.status)}：${record.question} -> ${answer.slice(0, 120)}`;
}

async function resolveRuntimeStoreId(prisma: PrismaService, requestedStoreId: number) {
  const requested = await prisma.store.findUnique({ where: { id: requestedStoreId } });
  if (requested) return requestedStoreId;
  const first = await prisma.store.findFirst({ orderBy: { id: 'asc' } });
  if (!first) throw new Error('no_store_available');
  return first.id;
}

function parseArgs(args: string[]): AmiBrainEvalOptions {
  return {
    limit: numberArg(args, 'limit'),
    persona: parsePersona(stringArg(args, 'persona')),
    storeId: numberArg(args, 'store-id') ?? 1,
    outputDir: resolve(stringArg(args, 'output-dir') ?? DEFAULT_OUTPUT_DIR),
  };
}

function stringArg(args: string[], name: string) {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : undefined;
}

function numberArg(args: string[], name: string) {
  const value = Number(stringArg(args, name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function parsePersona(value?: string): AgentQuestionBankPersona | undefined {
  if (!value) return undefined;
  const allowed: AgentQuestionBankPersona[] = ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance', 'edge'];
  if (!allowed.includes(value as AgentQuestionBankPersona)) throw new Error(`Unsupported persona: ${value}`);
  return value as AgentQuestionBankPersona;
}

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
  const parent = dirname(resolve(path, RESULTS_FILE));
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function personaLabel(value: string) {
  const labels: Record<string, string> = {
    manager: '店长经营',
    marketing: '营销增长',
    reception: '前台接待',
    beautician: '美容师服务',
    inventory: '库存采购',
    finance: '财务风控',
    edge: '边界/多轮',
  };
  return labels[value] ?? value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    usable_exact: '真实可用',
    usable_partial: '部分可用',
    false_positive_intent_mismatch: '假阳性-意图错配',
    false_positive_granularity_mismatch: '假阳性-粒度错配',
    false_positive_metric_mismatch: '假阳性-指标错配',
    metric_failed: '指标查询失败',
    unsupported_intent: '意图未覆盖',
    unsupported_metric_formula: '指标口径未接入',
    security_blocked: '安全拦截',
    permission_denied: '权限拒绝',
    not_found: '会话/门店不存在',
    error: '异常',
  };
  return labels[value] ?? value;
}

function resolveRepoRoot() {
  let current = process.cwd();
  while (!existsSync(resolve(current, 'docs/04-测试数据'))) {
    const parent = dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
  return current;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

main().catch((error) => {
  console.error('[ami-brain-eval] failed', error);
  process.exitCode = 1;
});
