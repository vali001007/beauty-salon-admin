import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '..', '.env'), quiet: true });

type GovernanceMode = 'daily' | 'weekly';
type Priority = 'P0' | 'P1' | 'P2';
type Trend = 'up' | 'down' | 'flat';

type JsonRecord = Record<string, any>;

type LegacyFallbackSummary = {
  available: boolean;
  scannedRuns: number;
  legacyFallbackRuns: number;
  usageByReason: Array<{ reason: string; count: number; trend: Trend }>;
  samples: Array<{ runId: number; runNo: string; question: string; fallbackReason: string; createdAt: string }>;
  deprecationCandidates: Array<{ reason: string; latestCount: number; previousCount: number; action: string }>;
  dataGap?: string;
};

type GovernanceReport = {
  generatedAt: string;
  mode: GovernanceMode;
  scanReportPath: string;
  evalReportPath: string;
  summary: {
    gatePassed: boolean;
    blockerCount: number;
    warningCount: number;
    p0PassRate?: number | null;
    p0Failed?: number | null;
    missingBusinessObjectMappings: number;
    missingDisplayNames: number;
    missingSkillMappings: number;
    missingEvalCases: number;
    fallbackReasonCount: number;
    legacyFallbackRuns: number;
  };
  businessDictionaryCandidates: Array<{ type: string; key: string; priority: Priority; reason: string }>;
  agentCapabilityGaps: Array<{ type: string; key: string; priority: Priority; reason: string }>;
  evalFailureTop: Array<{ reason: string; count: number; priority: Priority }>;
  legacyFallback: LegacyFallbackSummary;
  reviewChecklist: string[];
};

const args = parseArgs();
const mode = args.mode;
const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '..', '..');
const docsOutputDir = resolve(repoRoot, 'docs/04-测试数据');
const scanReportPath = resolve(docsOutputDir, 'agent-knowledge-scan-report.json');
const evalReportPath = resolve(docsOutputDir, 'agent-eval-knowledge-map-report.json');
const outputJsonPath = resolve(docsOutputDir, `agent-knowledge-${mode}-governance-report.json`);
const outputMarkdownPath = resolve(docsOutputDir, `agent-knowledge-${mode}-governance-report.md`);

async function main() {
  const scanReport = readJson(scanReportPath);
  const evalReport = readJson(evalReportPath);
  const legacyFallback = await buildLegacyFallbackSummary();
  const report = buildGovernanceReport(scanReport, evalReport, legacyFallback);
  writeJson(outputJsonPath, report);
  writeMarkdown(outputMarkdownPath, report);
  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        mode,
        summary: report.summary,
        outputFiles: [
          relativeOutput(outputJsonPath),
          relativeOutput(outputMarkdownPath),
        ],
      },
      null,
      2,
    ),
  );
}

function buildGovernanceReport(scanReport: JsonRecord, evalReport: JsonRecord, legacyFallback: LegacyFallbackSummary): GovernanceReport {
  const missingBusinessObjects = asArray(scanReport?.schema?.missingBusinessObjectMappings);
  const missingDisplayNames = asArray(scanReport?.schema?.missingDisplayNames);
  const missingSkillMappings = asArray(scanReport?.agent?.missingSkillMappings);
  const missingEvalCases = asArray(scanReport?.agent?.missingEvalCases);
  const blockers = asArray(scanReport?.gate?.blockers);
  const warnings = asArray(scanReport?.gate?.warnings);
  const evalFailures = asArray(evalReport?.summary?.topFailureReasons);

  const businessDictionaryCandidates = [
    ...missingBusinessObjects.slice(0, mode === 'weekly' ? 50 : 20).map((model) => ({
      type: 'business_object_mapping',
      key: String(model),
      priority: inferBusinessObjectPriority(String(model)),
      reason: 'Prisma model 尚未映射到 BusinessObjectCatalog，需要确认是否是 Agent 可查询业务对象。',
    })),
    ...missingDisplayNames.slice(0, mode === 'weekly' ? 50 : 20).map((item) => ({
      type: 'display_field_name',
      key: `${String(item.model ?? 'Unknown')}.${String(item.field ?? 'unknown')}`,
      priority: item.risk === 'high' ? 'P1' as const : 'P2' as const,
      reason: '重要展示字段缺少人工确认中文名，需要确认业务含义、金额口径或状态口径。',
    })),
  ];

  const agentCapabilityGaps = [
    ...asArray(scanReport?.agent?.missingExecutionMappings).map((item) => ({
      type: 'execution_mapping_missing',
      key: String(item),
      priority: 'P0' as const,
      reason: '能力已声明 implemented，但缺少 BusinessQueryService 执行映射。',
    })),
    ...asArray(scanReport?.agent?.missingToolRegistryMappings).map((item) => ({
      type: 'tool_registry_missing',
      key: String(item),
      priority: 'P0' as const,
      reason: 'CapabilityCatalog 引用的 toolName 未在 AgentToolRegistry 注册。',
    })),
    ...missingSkillMappings.slice(0, mode === 'weekly' ? 50 : 20).map((item) => ({
      type: 'skill_exposure_missing',
      key: String(item),
      priority: 'P1' as const,
      reason: 'CapabilityCatalog 已有能力，但 SkillRegistry 未暴露成可规划技能。',
    })),
    ...missingEvalCases.slice(0, mode === 'weekly' ? 50 : 20).map((item) => ({
      type: 'eval_case_missing',
      key: String(item),
      priority: 'P1' as const,
      reason: '已实现能力缺少 Eval 覆盖，后续改动容易回归。',
    })),
  ];

  return {
    generatedAt: new Date().toISOString(),
    mode,
    scanReportPath: relativeOutput(scanReportPath),
    evalReportPath: relativeOutput(evalReportPath),
    summary: {
      gatePassed: Boolean(scanReport?.gate?.passed),
      blockerCount: blockers.length,
      warningCount: warnings.length,
      p0PassRate: nullableNumber(evalReport?.gate?.actual?.passRate ?? evalReport?.summary?.passRate),
      p0Failed: nullableNumber(evalReport?.gate?.actual?.failed ?? evalReport?.summary?.failed),
      missingBusinessObjectMappings: missingBusinessObjects.length,
      missingDisplayNames: missingDisplayNames.length,
      missingSkillMappings: missingSkillMappings.length,
      missingEvalCases: missingEvalCases.length,
      fallbackReasonCount: legacyFallback.usageByReason.length,
      legacyFallbackRuns: legacyFallback.legacyFallbackRuns,
    },
    businessDictionaryCandidates,
    agentCapabilityGaps,
    evalFailureTop: evalFailures.map((item) => ({
      reason: String(item.reason ?? item[0] ?? 'unknown'),
      count: Number(item.count ?? item[1] ?? 0),
      priority: Number(item.count ?? item[1] ?? 0) > 5 ? 'P1' as const : 'P2' as const,
    })),
    legacyFallback,
    reviewChecklist: buildReviewChecklist({ scanReport, legacyFallback, businessDictionaryCandidates, agentCapabilityGaps }),
  };
}

async function buildLegacyFallbackSummary(): Promise<LegacyFallbackSummary> {
  let prisma: PrismaClient | null = null;
  try {
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL ?? '',
        max: Number(process.env.DATABASE_POOL_MAX || 5),
        idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
        connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
      }),
    });
    const runs = await (prisma as any).agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: mode === 'weekly' ? 500 : 200,
      select: {
        id: true,
        runNo: true,
        userInput: true,
        planJson: true,
        resultJson: true,
        createdAt: true,
      },
    });
    const windows = buildLegacyFallbackWindows(runs);
    const usageByReason = [...windows.latest.reasonCounts.entries()]
      .map(([reason, count]) => {
        const previousCount = windows.previous.reasonCounts.get(reason) ?? 0;
        const trend: Trend = count > previousCount ? 'up' : count < previousCount ? 'down' : 'flat';
        return { reason, count, trend };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const allLegacyRuns = runs.filter(isLegacyFallbackRun);
    return {
      available: true,
      scannedRuns: runs.length,
      legacyFallbackRuns: allLegacyRuns.length,
      usageByReason,
      samples: allLegacyRuns.slice(0, 10).map((run: any) => ({
        runId: Number(run.id),
        runNo: String(run.runNo),
        question: String(run.userInput ?? ''),
        fallbackReason: extractFallbackReason(run.planJson) ?? extractFallbackReason(run.resultJson) ?? 'legacy_fallback',
        createdAt: new Date(run.createdAt).toISOString(),
      })),
      deprecationCandidates: buildLegacyFallbackDeprecationCandidates(windows),
    };
  } catch (error) {
    return {
      available: false,
      scannedRuns: 0,
      legacyFallbackRuns: 0,
      usageByReason: [],
      samples: [],
      deprecationCandidates: [],
      dataGap: `AgentRun 运行态统计不可用：${sanitizeMessage(error instanceof Error ? error.message : String(error))}`,
    };
  } finally {
    await prisma?.$disconnect().catch(() => undefined);
  }
}

function buildLegacyFallbackWindows(runs: any[]) {
  const midpoint = Math.ceil(runs.length / 2);
  const latest = summarizeLegacyFallbackWindow('latest', runs.slice(0, midpoint));
  const previous = summarizeLegacyFallbackWindow('previous', runs.slice(midpoint));
  const manifest = Array.from(new Set([...knownLegacyFallbackReasons(), ...latest.reasonCounts.keys(), ...previous.reasonCounts.keys()])).sort();
  return { latest, previous, manifest };
}

function summarizeLegacyFallbackWindow(label: string, runs: any[]) {
  const legacyRuns = runs.filter(isLegacyFallbackRun);
  const reasonCounts = new Map<string, number>();
  for (const run of legacyRuns) {
    const reason = extractFallbackReason(run.planJson) ?? extractFallbackReason(run.resultJson) ?? 'legacy_fallback';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  return { label, runs, legacyRuns, reasonCounts };
}

function buildLegacyFallbackDeprecationCandidates(windows: ReturnType<typeof buildLegacyFallbackWindows>) {
  const hasTwoWindows = windows.latest.runs.length > 0 && windows.previous.runs.length > 0;
  return windows.manifest
    .map((reason) => {
      const latestCount = windows.latest.reasonCounts.get(reason) ?? 0;
      const previousCount = windows.previous.reasonCounts.get(reason) ?? 0;
      return {
        reason,
        latestCount,
        previousCount,
        action: hasTwoWindows && latestCount === 0 && previousCount === 0 ? 'move_to_deprecated_candidate' : 'retain_and_monitor',
      };
    })
    .filter((item) => item.action === 'move_to_deprecated_candidate');
}

function isLegacyFallbackRun(run: any) {
  return stringifyJson(run.planJson).includes('legacy_fallback') || stringifyJson(run.resultJson).includes('legacy_fallback');
}

function extractFallbackReason(value: unknown) {
  const text = stringifyJson(value);
  return text.match(/"fallbackReason"\s*:\s*"([^"]+)"/)?.[1] ?? null;
}

function knownLegacyFallbackReasons() {
  return [
    'capability_not_found',
    'business_query_capability_missing',
    'capability_confidence_below_threshold',
    'business_query_capability_not_implemented',
    'business_query_role_not_allowed',
    'required_entity_not_resolved',
    'business_task_preparser_no_executable_plan',
    'business_task_preparser_unavailable',
    'legacy_rule_fallback',
    'legacy_fallback',
  ];
}

function buildReviewChecklist(input: {
  scanReport: JsonRecord;
  legacyFallback: LegacyFallbackSummary;
  businessDictionaryCandidates: GovernanceReport['businessDictionaryCandidates'];
  agentCapabilityGaps: GovernanceReport['agentCapabilityGaps'];
}) {
  const checklist = [
    '确认 P0 阻断项为 0；如不为 0，先修复再发布。',
    '按 P1 优先级确认 BusinessObjectCatalog 与字段中文名候选。',
    '补齐 SkillRegistry 暴露缺口和 Eval 覆盖缺口。',
    '复核前端页面候选是否需要 Agent 能力入口。',
  ];
  if (!input.legacyFallback.available) checklist.push('运行态 AgentRun 统计不可用，需确认数据库连接或迁移状态。');
  if (input.legacyFallback.usageByReason.length) checklist.push('检查 legacy fallback Top 原因，优先把高频原因转入 CapabilityCatalog 或实体字典。');
  if (input.legacyFallback.deprecationCandidates.length) checklist.push('复核 legacy fallback 废弃候选，确认无保留价值后进入清理计划。');
  if (!input.businessDictionaryCandidates.length) checklist.push('本窗口暂无新增业务字典候选。');
  if (!input.agentCapabilityGaps.length) checklist.push('本窗口暂无新增 Agent 能力缺口。');
  return checklist;
}

function writeMarkdown(path: string, report: GovernanceReport) {
  const lines = [
    `# Agent 知识治理${report.mode === 'daily' ? '日报' : '周报'}`,
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 总览',
    '',
    `- 门禁状态：${report.summary.gatePassed ? '通过' : '失败'}`,
    `- 阻断项：${report.summary.blockerCount}`,
    `- 提醒项：${report.summary.warningCount}`,
    `- P0 通过率：${formatRate(report.summary.p0PassRate)}`,
    `- P0 失败数：${report.summary.p0Failed ?? '未知'}`,
    `- BusinessObjectCatalog 缺口：${report.summary.missingBusinessObjectMappings}`,
    `- 字段中文名缺口：${report.summary.missingDisplayNames}`,
    `- SkillRegistry 暴露缺口：${report.summary.missingSkillMappings}`,
    `- Eval 覆盖缺口：${report.summary.missingEvalCases}`,
    `- legacy fallback 命中：${report.summary.legacyFallbackRuns}`,
    '',
    '## Agent 能力缺口',
    '',
    ...topLines(report.agentCapabilityGaps, (item) => `- [${item.priority}] ${item.type}: ${item.key}，${item.reason}`),
    '',
    '## 业务字典候选',
    '',
    ...topLines(report.businessDictionaryCandidates, (item) => `- [${item.priority}] ${item.type}: ${item.key}，${item.reason}`),
    '',
    '## Eval 失败 Top',
    '',
    ...(report.evalFailureTop.length ? report.evalFailureTop.map((item) => `- [${item.priority}] ${item.reason}: ${item.count}`) : ['- 无']),
    '',
    '## Legacy Fallback',
    '',
    `- 运行态统计：${report.legacyFallback.available ? '可用' : '不可用'}`,
    `- 扫描运行数：${report.legacyFallback.scannedRuns}`,
    `- fallback 运行数：${report.legacyFallback.legacyFallbackRuns}`,
    ...(report.legacyFallback.dataGap ? [`- 数据缺口：${report.legacyFallback.dataGap}`] : []),
    '',
    '### Top Reason',
    '',
    ...(report.legacyFallback.usageByReason.length
      ? report.legacyFallback.usageByReason.map((item) => `- ${item.reason}: ${item.count}，趋势 ${item.trend}`)
      : ['- 无']),
    '',
    '### 废弃候选',
    '',
    ...(report.legacyFallback.deprecationCandidates.length
      ? report.legacyFallback.deprecationCandidates.map((item) => `- ${item.reason}: latest=${item.latestCount}, previous=${item.previousCount}, action=${item.action}`)
      : ['- 无']),
    '',
    '## Review Checklist',
    '',
    ...report.reviewChecklist.map((item) => `- ${item}`),
    '',
  ];
  writeFile(path, `${lines.join('\n')}\n`);
}

function topLines<T>(items: T[], render: (item: T) => string) {
  return items.length ? items.slice(0, mode === 'weekly' ? 50 : 20).map(render) : ['- 无'];
}

function inferBusinessObjectPriority(model: string): 'P0' | 'P1' | 'P2' {
  if (/Order|Payment|Refund|Card|Inventory|Stock|Marketing|Reservation|Schedule|Commission|Settlement|Customer/i.test(model)) return 'P1';
  if (/Agent|AiAudit|Terminal/i.test(model)) return 'P2';
  return 'P2';
}

function readJson(path: string): JsonRecord {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path: string, data: unknown) {
  writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeFile(path: string, content: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function nullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
}

function sanitizeMessage(message: string) {
  return message.replace(/\s+/g, ' ').trim() || '未知错误';
}

function relativeOutput(path: string) {
  return path.replace(repoRoot, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
}

function formatRate(value: number | null | undefined) {
  if (typeof value !== 'number') return '未知';
  return `${Math.round(value * 10000) / 100}%`;
}

function parseArgs(): { mode: GovernanceMode } {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] ?? 'daily';
  return { mode: modeArg === 'weekly' ? 'weekly' : 'daily' };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
