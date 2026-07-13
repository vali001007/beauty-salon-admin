import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

type ScanReport = {
  generatedAt?: string;
  agent?: {
    missingEvalCases?: string[];
  };
};

type KnowledgeMapReport = {
  generatedAt?: string;
  improvementBacklog?: Array<{
    id: string;
    input: string;
    priority: string;
    failureReasons: string[];
    expectedCapabilityId: string;
    expectedPersonaCode: string;
    expectedOutputKinds: string[];
    recommendation: string;
  }>;
};

type RemainingSupportedReport = {
  generatedAt?: string;
  failures?: Array<{
    id?: string;
    question?: string;
    input?: string;
    personaCode?: string;
    expectedCapabilityId?: string;
    failureReason?: string;
    failureReasons?: string[];
  }>;
  agentGapList?: Array<{
    id?: string;
    question?: string;
    capabilityId?: string;
    personaCode?: string;
    reason?: string;
  }>;
};

type EvalDraft = {
  draftId: string;
  priority: 'P1' | 'P2' | 'P3';
  question: string;
  expectedPersona: string;
  expectedCapabilityId: string;
  expectedTool: string;
  expectedOutputKinds: string[];
  source: string;
  failureReasons: string[];
  confirmationNeeded: string[];
};

const workspaceRoot = resolve(process.cwd(), '../..');
const scanReportPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-knowledge-scan-report.json');
const knowledgeMapReportPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-eval-knowledge-map-report.json');
const remainingReportPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-eval-remaining-supported-report.json');
const outputJsonPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-eval-drafts.json');
const outputMdPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-eval-drafts.md');

function main() {
  const scanReport = readJson<ScanReport>(scanReportPath, {});
  const knowledgeMapReport = readJson<KnowledgeMapReport>(knowledgeMapReportPath, {});
  const remainingReport = readJson<RemainingSupportedReport>(remainingReportPath, {});
  const drafts = buildDrafts(scanReport, knowledgeMapReport, remainingReport);

  writeJson(outputJsonPath, {
    generatedAt: new Date().toISOString(),
    sourceReports: [relativeDocsPath(scanReportPath), relativeDocsPath(knowledgeMapReportPath), relativeDocsPath(remainingReportPath)],
    total: drafts.length,
    drafts,
  });
  writeMarkdown(outputMdPath, drafts, scanReport, knowledgeMapReport, remainingReport);
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: drafts.length,
        outputFiles: [relativeDocsPath(outputJsonPath), relativeDocsPath(outputMdPath)],
      },
      null,
      2,
    ),
  );
}

function buildDrafts(scanReport: ScanReport, knowledgeMapReport: KnowledgeMapReport, remainingReport: RemainingSupportedReport) {
  const drafts: EvalDraft[] = [];

  for (const capabilityId of scanReport.agent?.missingEvalCases ?? []) {
    drafts.push({
      draftId: `missing-eval-${capabilityId}`,
      priority: 'P1',
      question: exampleQuestionForCapability(capabilityId),
      expectedPersona: guessPersona(capabilityId),
      expectedCapabilityId: capabilityId,
      expectedTool: 'business.query.ask',
      expectedOutputKinds: ['table', 'evidence'],
      source: 'agent-knowledge-scan missingEvalCases',
      failureReasons: ['missing_eval_case'],
      confirmationNeeded: ['确认标准问法', '补充口语化问法', '补充权限或空数据边界问法'],
    });
  }

  for (const item of knowledgeMapReport.improvementBacklog ?? []) {
    drafts.push({
      draftId: `knowledge-map-${item.id}`,
      priority: item.priority === 'P0' ? 'P1' : item.priority === 'P1' ? 'P2' : 'P3',
      question: item.input,
      expectedPersona: item.expectedPersonaCode,
      expectedCapabilityId: item.expectedCapabilityId,
      expectedTool: 'business.query.ask',
      expectedOutputKinds: item.expectedOutputKinds?.length ? item.expectedOutputKinds : ['table', 'evidence'],
      source: `agent-eval-knowledge-map:${item.id}`,
      failureReasons: item.failureReasons ?? [],
      confirmationNeeded: [item.recommendation, '确认是否应进入正式回归集'],
    });
  }

  for (const failure of remainingReport.failures ?? []) {
    const question = failure.question ?? failure.input;
    if (!question) continue;
    const capabilityId = failure.expectedCapabilityId ?? normalizeId(question);
    drafts.push({
      draftId: `remaining-failure-${failure.id ?? normalizeId(question)}`,
      priority: 'P2',
      question,
      expectedPersona: failure.personaCode ?? guessPersona(capabilityId),
      expectedCapabilityId: capabilityId,
      expectedTool: 'business.query.ask',
      expectedOutputKinds: ['table', 'evidence'],
      source: 'agent-eval-remaining-supported failures',
      failureReasons: failure.failureReasons ?? (failure.failureReason ? [failure.failureReason] : ['unknown_failure']),
      confirmationNeeded: ['确认系统是否已有业务数据', '确认失败是否为 Agent 能力缺口', '确认 expectedOutputKinds'],
    });
  }

  for (const gap of remainingReport.agentGapList ?? []) {
    const question = gap.question;
    if (!question) continue;
    const capabilityId = gap.capabilityId ?? normalizeId(question);
    drafts.push({
      draftId: `remaining-gap-${gap.id ?? normalizeId(question)}`,
      priority: 'P2',
      question,
      expectedPersona: gap.personaCode ?? guessPersona(capabilityId),
      expectedCapabilityId: capabilityId,
      expectedTool: 'business.query.ask',
      expectedOutputKinds: ['table', 'evidence'],
      source: 'agent-eval-remaining-supported agentGapList',
      failureReasons: [gap.reason ?? 'agent_gap'],
      confirmationNeeded: ['确认应补 Skill 还是 Tool', '确认是否进入正式 Eval'],
    });
  }

  return dedupeDrafts(drafts)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.draftId.localeCompare(b.draftId))
    .slice(0, 150);
}

function writeMarkdown(
  path: string,
  drafts: EvalDraft[],
  scanReport: ScanReport,
  knowledgeMapReport: KnowledgeMapReport,
  remainingReport: RemainingSupportedReport,
) {
  const byPriority = groupBy(drafts, (item) => item.priority);
  const lines = [
    '# Agent Eval 草案候选',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 来源',
    '',
    `- ${relativeDocsPath(scanReportPath)}：${scanReport.generatedAt ?? '未读取到生成时间'}`,
    `- ${relativeDocsPath(knowledgeMapReportPath)}：${knowledgeMapReport.generatedAt ?? '未读取到生成时间'}`,
    `- ${relativeDocsPath(remainingReportPath)}：${remainingReport.generatedAt ?? '未读取到生成时间'}`,
    '',
    '## 摘要',
    '',
    `- 草案总数：${drafts.length}`,
    `- P1：${drafts.filter((item) => item.priority === 'P1').length}`,
    `- P2：${drafts.filter((item) => item.priority === 'P2').length}`,
    `- P3：${drafts.filter((item) => item.priority === 'P3').length}`,
    '',
    '## 使用原则',
    '',
    '- 本文件只生成 Eval 草案，不自动写入 `agent-eval.cases.ts`。',
    '- 进入正式回归前必须确认：系统支持该业务、Agent 应覆盖该能力、期望输出类型准确。',
    '- 高风险动作只验证确认卡、草稿或审批门禁，不验证真实扣款、退款、群发。',
    '',
  ];

  for (const priority of ['P1', 'P2', 'P3'] as const) {
    const items = byPriority[priority] ?? [];
    lines.push(`## ${priority} Eval 草案`, '');
    if (!items.length) {
      lines.push('- 无', '');
      continue;
    }
    lines.push('| 问题 | Persona | Capability | Tool | 输出 | 来源 | 失败原因/补充原因 |', '|---|---|---|---|---|---|---|');
    for (const item of items) {
      lines.push(
        `| ${item.question} | ${item.expectedPersona} | ${item.expectedCapabilityId} | ${item.expectedTool} | ${item.expectedOutputKinds.join('/')} | ${item.source} | ${item.failureReasons.join('<br>')} |`,
      );
    }
    lines.push('');
  }

  writeText(path, `${lines.join('\n')}\n`);
}

function exampleQuestionForCapability(capabilityId: string) {
  const examples: Record<string, string> = {
    automation_execution_summary: '自动化执行复盘',
    business_anomaly_alert: '最近一个月门店有哪些经营风险',
    business_overview: '今天我应该重点关注什么',
    member_balance_analysis: '当前会员储值沉淀资金是多少',
    multi_store_comparison: '各门店本月经营对比',
    product_customer_distribution: '这些商品有哪些客户买过',
    product_sales_trend: '最近30天哪些商品卖得最好',
    project_material_margin: '哪些项目耗材成本偏高',
  };
  return examples[capabilityId] ?? capabilityId;
}

function dedupeDrafts(drafts: EvalDraft[]) {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = `${draft.question}:${draft.expectedCapabilityId}:${draft.expectedPersona}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, data: unknown) {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(path: string, text: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, text, 'utf8');
}

function normalizeId(value: string) {
  return String(value || 'unknown')
    .replace(/^\/+/, '')
    .replace(/[{}:]/g, '')
    .split(/[\/_.\s-]+/)
    .filter(Boolean)
    .join('_')
    .toLowerCase();
}

function guessPersona(text: string) {
  const value = text.toLowerCase();
  if (/finance|billing|settlement|commission|profit|refund|payment|cashflow|order/.test(value)) return 'finance';
  if (/inventory|stock|purchase|supplier|replenishment/.test(value)) return 'inventory';
  if (/marketing|campaign|activity|automation|promotion|conversion|churn|growth/.test(value)) return 'marketing';
  if (/reservation|appointment|reception|cashier|card|member/.test(value)) return 'reception';
  if (/beautician|staff|schedule|service/.test(value)) return 'beautician';
  return 'manager';
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((map, item) => {
    const key = getKey(item);
    map[key] = [...(map[key] ?? []), item];
    return map;
  }, {});
}

function priorityRank(priority: EvalDraft['priority']) {
  return priority === 'P1' ? 1 : priority === 'P2' ? 2 : 3;
}

function relativeDocsPath(path: string) {
  return path.replace(`${workspaceRoot}\\`, '').replace(/\\/g, '/');
}

main();
