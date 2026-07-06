import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type CompletionGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

type UncheckedItem = {
  line: number;
  section: string;
  text: string;
  classification: string;
  deferredReason: string;
};

type ReportValue = Record<string, any>;

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const taskPath = resolve(workspaceRoot, 'docs/03-开发计划/01-AI智能体与问数能力/task.md');
const outputJsonPath = resolve(docsRoot, 'agent-v2-local-completion-audit.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-local-completion-audit.md');

const reportFiles = {
  evalGate: 'agent-v2-eval-gate-report.json',
  legacyDiffAttribution: 'agent-v2-legacy-diff-attribution.json',
  legacyDependencyAudit: 'agent-v2-legacy-dependency-audit.json',
  rollbackDrill: 'agent-v2-rollback-drill.json',
  productionConfigReadiness: 'agent-v2-production-config-readiness.json',
  retirementPreflight: 'agent-v2-legacy-retirement-preflight.json',
  productionEvidenceCheck: 'agent-v2-legacy-retirement-production-evidence-check.json',
  retirementHandoff: 'agent-v2-retirement-handoff.json',
  releaseReadinessAudit: 'agent-v2-release-readiness-audit.json',
  githubReleaseHandoff: 'agent-v2-github-release-handoff.json',
  productionLiveConfigAudit: 'agent-v2-production-live-config-audit.json',
  productionDeploymentSyncAudit: 'agent-v2-production-deployment-sync-audit.json',
  productionRolloutPlan: 'agent-v2-production-rollout-plan.json',
  postMergeDeployVerify: 'agent-v2-post-merge-deploy-verify.json',
};

const canonicalProductionEvidencePath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence.json');

function main() {
  const taskText = readText(taskPath);
  const uncheckedItems = collectUncheckedItems(taskText);
  const localOpenItems = uncheckedItems.filter((item) => item.classification === 'local_open');
  const reports = readReports();
  const gates = buildGates(taskText, uncheckedItems, localOpenItems, reports);
  const localClosureReady = gates.every((gate) => gate.status === 'pass');
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      localClosureReady,
      productionReady: reports.retirementHandoff?.summary?.productionReady === true,
      gateCount: gates.length,
      blockerCount: gates.filter((gate) => gate.status !== 'pass').length,
      uncheckedCount: uncheckedItems.length,
      deferredUncheckedCount: uncheckedItems.length - localOpenItems.length,
      localOpenUncheckedCount: localOpenItems.length,
      recommendation: localClosureReady
        ? '本地开发闭环已可审计：task.md 剩余未勾选项均属于生产/真实流量/旧正则最终退役后置项。'
        : '仍存在本地未收口项；先补齐 local_open 项，再进入生产证据采集阶段。',
    },
    source: {
      task: relativePath(taskPath),
      reports: Object.fromEntries(Object.entries(reportFiles).map(([key, name]) => [key, relativePath(reportPath(name))])),
      canonicalProductionEvidence: relativePath(canonicalProductionEvidencePath),
    },
    gates,
    uncheckedItems,
    localOpenItems,
    deferredItems: uncheckedItems.filter((item) => item.classification !== 'local_open'),
    nextActions: [
      '继续保持本地 strict gate、生产配置 readiness、回滚演练和退役交接包在 CI 中通过。',
      '生产 API 域名、deploy token、GitHub Secrets、后端环境变量和调度任务稳定后，再进入生产/准生产证据采集。',
      '完成 7 天 shadow、线上有用率、生产 LLM 延迟/失败率/成本观测和真实回滚验证后，再写正式生产证据并申请旧正则删除授权。',
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && !localClosureReady) process.exit(1);
}

function buildGates(
  taskText: string,
  uncheckedItems: UncheckedItem[],
  localOpenItems: UncheckedItem[],
  reports: Record<string, ReportValue | null>,
): CompletionGate[] {
  const evalSummary = reports.evalGate?.summary ?? {};
  const dependencySummary = reports.legacyDependencyAudit?.summary ?? {};
  const rollbackSummary = reports.rollbackDrill?.summary ?? {};
  const configSummary = reports.productionConfigReadiness?.summary ?? {};
  const preflightSummary = reports.retirementPreflight?.summary ?? {};
  const evidenceSummary = reports.productionEvidenceCheck?.summary ?? {};
  const handoffSummary = reports.retirementHandoff?.summary ?? {};
  const releaseSummary = reports.releaseReadinessAudit?.summary ?? {};
  const githubHandoffSummary = reports.githubReleaseHandoff?.summary ?? {};
  const liveConfigSummary = reports.productionLiveConfigAudit?.summary ?? {};
  const deploymentSyncSummary = reports.productionDeploymentSyncAudit?.summary ?? {};
  const rolloutSummary = reports.productionRolloutPlan?.summary ?? {};
  const postMergeSummary = reports.postMergeDeployVerify?.summary ?? {};

  const missingReports = Object.entries(reportFiles)
    .filter(([, name]) => !existsSync(reportPath(name)))
    .map(([key]) => key);

  return [
    gate(
      'task_unchecked_classification',
      'task.md 剩余未勾选项均已分类为后置生产项',
      'localOpenUncheckedCount=0',
      `unchecked=${uncheckedItems.length}, deferred=${uncheckedItems.length - localOpenItems.length}, localOpen=${localOpenItems.length}`,
      localOpenItems.length === 0,
      '避免把本地尚未开发的任务误归入生产后置。'
    ),
    gate(
      'task_local_closure_statement',
      '任务文档声明本地闭环边界',
      '包含“本地可闭环项已收口，生产/真实流量/授权项保留为后续上线阶段任务”',
      taskText.includes('本地可闭环项已收口') ? 'present' : 'missing',
      taskText.includes('本地可闭环项已收口'),
      '产品交付口径明确：当前可验收本地开发，不误报生产完成。'
    ),
    gate(
      'required_reports_exist',
      '本地闭环依赖报告齐备',
      'eval、diff、dependency、rollback、config、preflight、evidence、handoff 报告均存在',
      missingReports.length ? `missing=${missingReports.join(', ')}` : 'all reports exist',
      missingReports.length === 0,
      '审计不是只看 task.md 文案，而是读取当前报告证据。'
    ),
    gate(
      'strict_eval_and_dependency_gates',
      '核心本地门禁通过',
      'strict eval pass=true，旧正则依赖审计 pass=true',
      `eval=${evalSummary.pass}, dependency=${dependencySummary.pass}, predicates=${dependencySummary.legacyRegexPredicateCount ?? 'n/a'}`,
      evalSummary.pass === true && dependencySummary.pass === true,
      '证明本地能力映射、权限、契约和旧正则依赖边界没有回退。'
    ),
    gate(
      'rollback_and_config_readiness',
      '回滚演练和生产配置预留通过',
      'rollback pass=true，production config readiness pass=true',
      `rollback=${rollbackSummary.pass}, config=${configSummary.pass}`,
      rollbackSummary.pass === true && configSummary.pass === true,
      '证明后续生产配置和回滚路径有本地保护。'
    ),
    gate(
      'handoff_local_ready_not_production_ready',
      '退役交接包本地就绪但生产不误放行',
      'handoffReady=true，localReady=true，productionReady=false',
      `handoff=${handoffSummary.handoffReady}, local=${handoffSummary.localReady}, production=${handoffSummary.productionReady}`,
      handoffSummary.handoffReady === true
        && handoffSummary.localReady === true
        && handoffSummary.productionReady === false,
      '可以进入生产/准生产证据采集，但不能删除旧正则或切 legacy_retired。'
    ),
    gate(
      'github_release_handoff_ready',
      'GitHub 提交/PR 交接已准备好但仍需授权',
      'secretFindingCount=0，github handoffReady=true，stageDryRunReady=true，authorizationRequired=true',
      [
        `releaseSecretFindings=${releaseSummary.secretFindingCount ?? 'n/a'}`,
        `changedEntryCount=${releaseSummary.changedEntryCount ?? 'n/a'}`,
        `handoffReady=${githubHandoffSummary.handoffReady}`,
        `stageDryRunReady=${githubHandoffSummary.stageDryRunReady}`,
        `authorizationRequired=${githubHandoffSummary.authorizationRequired}`,
      ].join(', '),
      releaseSummary.secretFindingCount === 0
        && githubHandoffSummary.handoffReady === true
        && githubHandoffSummary.stageDryRunReady === true
        && githubHandoffSummary.authorizationRequired === true,
      '证明后续只差用户授权执行 stage/commit/PR，且当前发布范围未发现疑似 Secret。'
    ),
    gate(
      'deployment_and_hook_not_misreported',
      'Zeabur 部署和生产 hook 状态未被误报为完成',
      'rolloutReady=true，postMergeVerifierReady=true，productionVerified=false，deploymentSyncProven=false，productionHookTriggerReady=false',
      [
        `rolloutReady=${rolloutSummary.rolloutPlanReady}`,
        `postMergeVerifierReady=${postMergeSummary.verifierReady}`,
        `postMergeProductionVerified=${postMergeSummary.postMergeProductionVerified}`,
        `deploymentSyncProven=${deploymentSyncSummary.deploymentSyncProven}`,
        `productionHealthReady=${deploymentSyncSummary.productionHealthReady}`,
        `hookTriggerReady=${liveConfigSummary.productionHookTriggerReady}`,
      ].join(', '),
      rolloutSummary.rolloutPlanReady === true
        && postMergeSummary.verifierReady === true
        && postMergeSummary.postMergeProductionVerified === false
        && deploymentSyncSummary.deploymentSyncProven === false
        && deploymentSyncSummary.productionHealthReady === true
        && liveConfigSummary.productionHookTriggerReady === false,
      '确认本地发布材料已准备好，但 GitHub 合入、Zeabur commit 证明和生产 hook 启用仍后置。'
    ),
    gate(
      'production_evidence_still_blocks_retirement',
      '生产证据继续阻塞旧正则退役',
      'retirementReady=false，productionEvidenceCheck pass=false，正式生产证据文件不存在',
      [
        `retirementReady=${preflightSummary.retirementReady}`,
        `productionBlockers=${preflightSummary.productionEvidenceBlockers ?? 'n/a'}`,
        `evidencePass=${evidenceSummary.pass}`,
        `canonicalEvidenceExists=${existsSync(canonicalProductionEvidencePath)}`,
      ].join(', '),
      preflightSummary.retirementReady === false
        && Number(preflightSummary.productionEvidenceBlockers ?? 0) > 0
        && evidenceSummary.pass === false
        && !existsSync(canonicalProductionEvidencePath),
      '确认当前没有伪造生产证据，旧正则最终退役仍后置。'
    ),
  ];
}

function collectUncheckedItems(taskText: string): UncheckedItem[] {
  const items: UncheckedItem[] = [];
  let section = '未命名章节';
  const lines = taskText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    if (heading) section = heading[2];
    if (!/^\s*-\s+\[\s\]\s+/.test(line)) continue;
    const text = line.replace(/^\s*-\s+\[\s\]\s+/, '').trim();
    const classification = classifyUncheckedItem(text, section);
    items.push({
      line: index + 1,
      section,
      text,
      classification,
      deferredReason: deferredReason(classification),
    });
  }
  return items;
}

function classifyUncheckedItem(text: string, section: string) {
  const value = `${section} ${text}`;
  if (/shadow|7\s*天|线上|生产|真实流量|真实线上|真实生产|有用率|失败率|成本|LLM Key|模型延迟|调度|定时任务|GitHub Secrets|deploy token|DB migration|管理员|授权/.test(value)) {
    return 'production_evidence_deferred';
  }
  if (/旧正则|旧规则|CapabilityDecisionService|isXxx|legacy_regex|kg_llm_preferred|kg_llm_only|legacy_retired|正式能力选择|新架构稳定接管|删除或降级|删除后|过时测试|重复手写查询逻辑/.test(value)) {
    return 'legacy_retirement_deferred';
  }
  if (/M12|18\.4|Sprint 6/.test(section)) {
    return 'legacy_retirement_deferred';
  }
  return 'local_open';
}

function deferredReason(classification: string) {
  if (classification === 'production_evidence_deferred') return '需要生产/准生产配置、真实流量、线上 LLM 观测或运维授权。';
  if (classification === 'legacy_retirement_deferred') return '旧正则最终删除必须等待生产证据、回滚验证和授权。';
  return '本地仍需开发或验证，不能归为后置生产项。';
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): CompletionGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', impact };
}

function readReports() {
  return Object.fromEntries(Object.entries(reportFiles).map(([key, name]) => {
    const path = reportPath(name);
    return [key, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null];
  })) as Record<string, ReportValue | null>;
}

function reportPath(name: string) {
  return resolve(docsRoot, name);
}

function readText(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(path: string, report: {
  generatedAt: string;
  summary: Record<string, unknown>;
  source: { task: string; reports: Record<string, string>; canonicalProductionEvidence: string };
  gates: CompletionGate[];
  uncheckedItems: UncheckedItem[];
  localOpenItems: UncheckedItem[];
  deferredItems: UncheckedItem[];
  nextActions: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 本地完成度审计',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 本地闭环可审计：${report.summary.localClosureReady ? '是' : '否'}`,
    `- 生产退役就绪：${report.summary.productionReady ? '是' : '否'}`,
    `- 剩余未勾选项：${report.summary.uncheckedCount}`,
    `- 后置未勾选项：${report.summary.deferredUncheckedCount}`,
    `- 本地未收口项：${report.summary.localOpenUncheckedCount}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 审计门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 影响 |',
    '| --- | --- | --- | --- | --- |',
    ...report.gates.map((gate) => `| ${escapeMd(gate.title)} | ${statusLabel(gate.status)} | ${escapeMd(gate.expected)} | ${escapeMd(gate.actual)} | ${escapeMd(gate.impact)} |`),
    '',
    '## 剩余未勾选项分类',
    '',
    '| 行号 | 章节 | 分类 | 内容 | 原因 |',
    '| ---: | --- | --- | --- | --- |',
    ...report.uncheckedItems.map((item) => `| ${item.line} | ${escapeMd(item.section)} | ${item.classification} | ${escapeMd(item.text)} | ${escapeMd(item.deferredReason)} |`),
    '',
    '## 来源',
    '',
    `- task: \`${report.source.task}\``,
    `- canonicalProductionEvidence: \`${report.source.canonicalProductionEvidence}\``,
    ...Object.entries(report.source.reports).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 下一步',
    '',
    ...report.nextActions.map((item) => `- ${item}`),
    '',
    '## 边界',
    '',
    '- 本审计只读取本地文档和报告，不连接生产库、不调用生产 API、不写正式生产证据。',
    '- 本地闭环可审计不等于生产退役完成；旧正则删除仍以后续生产证据和授权为准。',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function statusLabel(status: GateStatus) {
  return status === 'pass' ? '通过' : '失败';
}

function escapeMd(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function relativePath(path: string) {
  return relative(workspaceRoot, path).replace(/\\/g, '/');
}

function formatShanghaiTime(date: Date) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${formatter.format(date).replace(/\//g, '-')} Asia/Shanghai`;
}

main();
