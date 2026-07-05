import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type EvalDraft = {
  id: string;
  question: string;
  roleGroup: string;
  expectedCapabilityId: string;
  expectedIntent: string;
  expectedOutputKinds: string[];
  permissionResult: 'allow' | 'deny' | 'needs_review';
  contractResult: 'pass' | 'needs_review' | 'blocked';
  failureCategory: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
};

type GovernanceReport = {
  generatedAt: string;
  counts: {
    capabilityDrafts: number;
    evalDrafts: number;
    unmappedEval: number;
  };
  gates: {
    inferredPermission: unknown[];
    highRiskAutoPublish: unknown[];
    unmappedEval: unknown[];
  };
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据');
const agentV2DocsRoot = resolve(docsRoot, 'Agent评测与知识治理-2026-06-30至07-03');

const evalDraftPath = resolve(agentV2DocsRoot, 'agent-v2-eval-drafts.json');
const governancePath = resolve(agentV2DocsRoot, 'agent-v2-capability-governance-report.json');
const outputJsonPath = resolve(agentV2DocsRoot, 'agent-v2-eval-gate-report.json');
const outputMdPath = resolve(agentV2DocsRoot, 'agent-v2-eval-gate-report.md');

function main() {
  const generatedAt = formatShanghaiTime(new Date());
  const evalDrafts = readJson<{ drafts: EvalDraft[] }>(evalDraftPath).drafts ?? [];
  const governance = readJson<GovernanceReport>(governancePath);

  const p0 = evalDrafts.filter((draft) => draft.priority === 'P0');
  const p0Unmapped = p0.filter((draft) => draft.expectedCapabilityId.endsWith('.unmapped.eval_candidate'));
  const p0PermissionNeedsReview = p0.filter((draft) => draft.permissionResult !== 'allow');
  const p0ContractNotPass = p0.filter((draft) => draft.contractResult !== 'pass');
  const p0WrongRouteRisk = p0.filter((draft) => ['能力缺失', '语义错路由'].includes(draft.failureCategory));
  const highRiskAutoPublish = governance.gates?.highRiskAutoPublish?.length ?? 0;
  const inferredPermission = governance.gates?.inferredPermission?.length ?? 0;

  const gates = [
    {
      gate: 'P0 问题错路由率',
      expected: '0 个能力缺失或语义错路由',
      actual: `${p0WrongRouteRisk.length} / ${p0.length}`,
      pass: p0WrongRouteRisk.length === 0,
    },
    {
      gate: 'P0 支持问题契约',
      expected: '全部 pass',
      actual: `${p0ContractNotPass.length} 个未通过`,
      pass: p0ContractNotPass.length === 0,
    },
    {
      gate: 'P0 权限确认',
      expected: '全部 allow',
      actual: `${p0PermissionNeedsReview.length} 个需要复核`,
      pass: p0PermissionNeedsReview.length === 0,
    },
    {
      gate: '高风险自动发布',
      expected: '0 个',
      actual: `${highRiskAutoPublish} 个样例`,
      pass: highRiskAutoPublish === 0,
    },
    {
      gate: '候选草稿权限绑定',
      expected: '自动生成草稿进入治理待办，不阻断已发布能力门禁',
      actual: `${inferredPermission} 个候选草稿需补权限`,
      pass: true,
    },
  ];

  const report = {
    generatedAt,
    source: {
      evalDrafts: relativePath(evalDraftPath),
      governance: relativePath(governancePath),
    },
    summary: {
      totalQuestions: evalDrafts.length,
      p0Questions: p0.length,
      p0Unmapped: p0Unmapped.length,
      p0PermissionNeedsReview: p0PermissionNeedsReview.length,
      p0ContractNotPass: p0ContractNotPass.length,
      p0WrongRouteRisk: p0WrongRouteRisk.length,
      highRiskAutoPublish,
      inferredPermission,
      pass: gates.every((gate) => gate.pass),
    },
    gates,
    samples: {
      p0Unmapped: summarizeEval(p0Unmapped),
      p0PermissionNeedsReview: summarizeEval(p0PermissionNeedsReview),
      p0ContractNotPass: summarizeEval(p0ContractNotPass),
      p0WrongRouteRisk: summarizeEval(p0WrongRouteRisk),
    },
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);

  console.log(JSON.stringify(report.summary, null, 2));

  const strict = process.argv.includes('--strict') || process.env.AGENT_V2_EVAL_STRICT === '1';
  if (strict && !report.summary.pass) process.exit(1);
}

function summarizeEval(items: EvalDraft[]) {
  return items.slice(0, 50).map((item) => ({
    id: item.id,
    question: item.question,
    capability: item.expectedCapabilityId,
    permissionResult: item.permissionResult,
    contractResult: item.contractResult,
    failureCategory: item.failureCategory,
  }));
}

function writeMarkdown(path: string, report: ReturnType<typeof buildReportShape>) {
  const lines = [
    '# Agent V2 Eval 门禁报告',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 摘要',
    '',
    `- 总题数：${report.summary.totalQuestions}`,
    `- P0 题数：${report.summary.p0Questions}`,
    `- P0 未映射：${report.summary.p0Unmapped}`,
    `- P0 权限需复核：${report.summary.p0PermissionNeedsReview}`,
    `- P0 契约未通过：${report.summary.p0ContractNotPass}`,
    `- P0 能力缺失/语义错路由：${report.summary.p0WrongRouteRisk}`,
    `- 高风险自动发布样例：${report.summary.highRiskAutoPublish}`,
    `- 推断权限样例：${report.summary.inferredPermission}`,
    `- 门禁结论：${report.summary.pass ? '通过' : '未通过'}`,
    '',
    '## 门禁项',
    '',
    '| 门禁 | 期望 | 实际 | 结果 |',
    '|---|---|---|---|',
    ...report.gates.map((gate) => `| ${gate.gate} | ${gate.expected} | ${gate.actual} | ${gate.pass ? '通过' : '未通过'} |`),
    '',
    '## P0 未映射样例',
    '',
    ...evalSampleTable(report.samples.p0Unmapped),
    '',
    '## P0 权限需复核样例',
    '',
    ...evalSampleTable(report.samples.p0PermissionNeedsReview),
    '',
    '## P0 契约未通过样例',
    '',
    ...evalSampleTable(report.samples.p0ContractNotPass),
  ];
  writeText(path, `${lines.join('\n')}\n`);
}

function buildReportShape() {
  return {
    generatedAt: '',
    summary: {
      totalQuestions: 0,
      p0Questions: 0,
      p0Unmapped: 0,
      p0PermissionNeedsReview: 0,
      p0ContractNotPass: 0,
      p0WrongRouteRisk: 0,
      highRiskAutoPublish: 0,
      inferredPermission: 0,
      pass: false,
    },
    gates: [] as Array<{ gate: string; expected: string; actual: string; pass: boolean }>,
    samples: {
      p0Unmapped: [] as ReturnType<typeof summarizeEval>,
      p0PermissionNeedsReview: [] as ReturnType<typeof summarizeEval>,
      p0ContractNotPass: [] as ReturnType<typeof summarizeEval>,
    },
  };
}

function evalSampleTable(items: ReturnType<typeof summarizeEval>) {
  if (!items.length) return ['无'];
  const lines = ['| ID | 问题 | 能力 | 权限 | 契约 | 失败分类 |', '|---|---|---|---|---|---|'];
  for (const item of items.slice(0, 20)) {
    lines.push(`| ${item.id} | ${item.question} | ${item.capability} | ${item.permissionResult} | ${item.contractResult} | ${item.failureCategory} |`);
  }
  return lines;
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`Missing input file: ${relativePath(path)}`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, data: unknown) {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

function relativePath(path: string) {
  return relative(workspaceRoot, path).replace(/\\/g, '/');
}

function formatShanghaiTime(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')} Asia/Shanghai`;
}

main();
