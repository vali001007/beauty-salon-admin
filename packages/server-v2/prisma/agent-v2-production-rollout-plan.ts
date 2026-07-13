import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type StepStatus = 'ready' | 'blocked' | 'manual';

type RolloutStep = {
  id: string;
  phase: string;
  title: string;
  owner: string;
  status: StepStatus;
  expectedEvidence: string;
  actions: string[];
  commands: string[];
};

type ReportValue = Record<string, any>;

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-production-rollout-plan.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-production-rollout-plan.md');
const canonicalEvidencePath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence.json');

const reportFiles = {
  evalGate: 'agent-v2-eval-gate-report.json',
  productionConfigReadiness: 'agent-v2-production-config-readiness.json',
  productionEvidenceCheck: 'agent-v2-legacy-retirement-production-evidence-check.json',
  retirementPreflight: 'agent-v2-legacy-retirement-preflight.json',
  retirementHandoff: 'agent-v2-retirement-handoff.json',
  localCompletionAudit: 'agent-v2-local-completion-audit.json',
};

const optionalReportFiles = {
  productionLiveConfigAudit: 'agent-v2-production-live-config-audit.json',
  productionDeploymentSyncAudit: 'agent-v2-production-deployment-sync-audit.json',
  releaseReadinessAudit: 'agent-v2-release-readiness-audit.json',
  githubReleaseHandoff: 'agent-v2-github-release-handoff.json',
  postMergeDeployVerify: 'agent-v2-post-merge-deploy-verify.json',
};

function main() {
  const reports = readReports();
  const summary = buildSummary(reports);
  const steps = buildSteps(summary);
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary,
    source: {
      reports: Object.fromEntries(Object.entries(reportFiles).map(([key, name]) => [key, relativePath(reportPath(name))])),
      optionalReports: Object.fromEntries(Object.entries(optionalReportFiles).map(([key, name]) => [key, relativePath(reportPath(name))])),
      canonicalProductionEvidence: relativePath(canonicalEvidencePath),
    },
    steps,
    dailyShadowChecklist: [
      '确认当日生产默认仍可回退到 legacy_regex 或 kg_llm_preferred。',
      '抽查 AgentRun / AgentRunAuditDetail / AgentToolCall 是否持续落库。',
      '抽查 LLM latencyP99、failureRate、cost 和失败样本是否可见。',
      '抽查高风险自动执行数量是否为 0。',
      '抽查用户反馈样本，区分 shadow 下用户实际看到的 legacy 结果和 KG 侧观测结果。',
    ],
    finalRetirementConditions: [
      '生产或准生产连续 7 天 shadow / kg_llm_preferred / kg_llm_only 运行导出通过校验。',
      '线上用户有用率样本非 0，且新链路不低于旧链路。',
      '生产 LLM 延迟、失败率、成本和失败样本均可观测。',
      '高风险自动执行为 0。',
      '真实回滚验证已记录时间、执行人、方法和结果。',
      '正式生产证据写入后，`agent-v2:legacy-retirement-preflight -- --strict-retirement` 通过。',
      '产品、研发和运维共同授权删除旧正则。'
    ],
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && !summary.rolloutPlanReady) process.exit(1);
}

function buildSummary(reports: Record<string, ReportValue | null>) {
  const evalSummary = reports.evalGate?.summary ?? {};
  const configSummary = reports.productionConfigReadiness?.summary ?? {};
  const evidenceSummary = reports.productionEvidenceCheck?.summary ?? {};
  const preflightSummary = reports.retirementPreflight?.summary ?? {};
  const handoffSummary = reports.retirementHandoff?.summary ?? {};
  const localCompletionSummary = reports.localCompletionAudit?.summary ?? {};
  const liveConfigSummary = reports.productionLiveConfigAudit?.summary ?? {};
  const deploymentSyncSummary = reports.productionDeploymentSyncAudit?.summary ?? {};
  const releaseReadinessSummary = reports.releaseReadinessAudit?.summary ?? {};
  const githubReleaseHandoffSummary = reports.githubReleaseHandoff?.summary ?? {};
  const postMergeDeployVerifySummary = reports.postMergeDeployVerify?.summary ?? {};
  const missingReports = Object.entries(reportFiles)
    .filter(([, name]) => !existsSync(reportPath(name)))
    .map(([key]) => key);
  const productionEvidenceExists = existsSync(canonicalEvidencePath);
  const localPrerequisitesReady =
    evalSummary.pass === true
    && configSummary.pass === true
    && handoffSummary.handoffReady === true
    && handoffSummary.localReady === true
    && localCompletionSummary.localClosureReady === true
    && missingReports.length === 0;
  const productionStillBlocked =
    handoffSummary.productionReady === false
    && preflightSummary.retirementReady === false
    && evidenceSummary.pass === false
    && !productionEvidenceExists;
  const rolloutPlanReady = localPrerequisitesReady && productionStillBlocked;
  return {
    rolloutPlanReady,
    localPrerequisitesReady,
    productionExecutionAllowed: false,
    productionReady: handoffSummary.productionReady === true,
    productionStillBlocked,
    missingReportCount: missingReports.length,
    missingReports,
    productionEvidenceExists,
    localOpenTaskItems: localCompletionSummary.localOpenUncheckedCount ?? 'n/a',
    productionEvidenceBlockers: preflightSummary.productionEvidenceBlockers ?? evidenceSummary.blockerCount ?? 'n/a',
    productionLiveConfigAuditPresent: Boolean(reports.productionLiveConfigAudit),
    githubHookUrlSecretPresent: liveConfigSummary.githubHookUrlSecretPresent === true,
    productionApiHealthReady: liveConfigSummary.productionApiHealthReady === true,
    productionBackendEnvConfirmed: liveConfigSummary.productionBackendEnvConfirmed === true,
    githubProductionHookEnabled: liveConfigSummary.githubProductionHookEnabled === true,
    productionHookTriggerReady: liveConfigSummary.productionHookTriggerReady === true,
    productionDeploymentSyncAuditPresent: Boolean(reports.productionDeploymentSyncAudit),
    productionDeploymentSyncProven: deploymentSyncSummary.deploymentSyncProven === true,
    productionHealthReady: deploymentSyncSummary.productionHealthReady === true,
    productionCommit: deploymentSyncSummary.productionCommit ?? null,
    localChangedEntryCount: deploymentSyncSummary.localChangedEntryCount ?? 'n/a',
    releaseReadinessAuditPresent: Boolean(reports.releaseReadinessAudit),
    releaseReady: releaseReadinessSummary.releaseReady === true,
    releaseSecretFindingCount: releaseReadinessSummary.secretFindingCount ?? 'n/a',
    releaseChangedEntryCount: releaseReadinessSummary.changedEntryCount ?? 'n/a',
    githubReleaseHandoffPresent: Boolean(reports.githubReleaseHandoff),
    githubReleaseHandoffReady: githubReleaseHandoffSummary.handoffReady === true,
    githubReleaseBatchCount: githubReleaseHandoffSummary.releaseBatchCount ?? 'n/a',
    githubReleaseAuthorizationRequired: githubReleaseHandoffSummary.authorizationRequired === true,
    postMergeDeployVerifyPresent: Boolean(reports.postMergeDeployVerify),
    postMergeVerifierReady: postMergeDeployVerifySummary.verifierReady === true,
    postMergeProductionVerified: postMergeDeployVerifySummary.postMergeProductionVerified === true,
    postMergeDeployVerifyBlockers: postMergeDeployVerifySummary.blockerCount ?? 'n/a',
    postMergeTargetCommit: postMergeDeployVerifySummary.targetCommit ?? null,
    postMergeProductionCommit: postMergeDeployVerifySummary.productionCommit ?? null,
    recommendation: buildRecommendation({
      rolloutPlanReady,
      liveConfigPresent: Boolean(reports.productionLiveConfigAudit),
      deploymentSyncPresent: Boolean(reports.productionDeploymentSyncAudit),
      deploymentSyncProven: deploymentSyncSummary.deploymentSyncProven === true,
      releaseReadinessPresent: Boolean(reports.releaseReadinessAudit),
      releaseReady: releaseReadinessSummary.releaseReady === true,
      githubReleaseHandoffPresent: Boolean(reports.githubReleaseHandoff),
      githubReleaseHandoffReady: githubReleaseHandoffSummary.handoffReady === true,
      postMergeDeployVerifyPresent: Boolean(reports.postMergeDeployVerify),
      postMergeProductionVerified: postMergeDeployVerifySummary.postMergeProductionVerified === true,
      postMergeDeployVerifyBlockers: typeof postMergeDeployVerifySummary.blockerCount === 'number'
        ? postMergeDeployVerifySummary.blockerCount
        : null,
      releaseSecretFindingCount: typeof releaseReadinessSummary.secretFindingCount === 'number'
        ? releaseReadinessSummary.secretFindingCount
        : null,
      localChangedEntryCount: typeof deploymentSyncSummary.localChangedEntryCount === 'number'
        ? deploymentSyncSummary.localChangedEntryCount
        : null,
      productionCommit: deploymentSyncSummary.productionCommit ?? null,
      githubHookUrlSecretPresent: liveConfigSummary.githubHookUrlSecretPresent === true,
      productionApiHealthReady: liveConfigSummary.productionApiHealthReady === true,
      productionBackendEnvConfirmed: liveConfigSummary.productionBackendEnvConfirmed === true,
      githubProductionHookEnabled: liveConfigSummary.githubProductionHookEnabled === true,
    })
  };
}

function buildRecommendation(input: {
  rolloutPlanReady: boolean;
  liveConfigPresent: boolean;
  deploymentSyncPresent: boolean;
  deploymentSyncProven: boolean;
  releaseReadinessPresent: boolean;
  releaseReady: boolean;
  githubReleaseHandoffPresent: boolean;
  githubReleaseHandoffReady: boolean;
  postMergeDeployVerifyPresent: boolean;
  postMergeProductionVerified: boolean;
  postMergeDeployVerifyBlockers: number | null;
  releaseSecretFindingCount: number | null;
  localChangedEntryCount: number | null;
  productionCommit: string | null;
  githubHookUrlSecretPresent: boolean;
  productionApiHealthReady: boolean;
  productionBackendEnvConfirmed: boolean;
  githubProductionHookEnabled: boolean;
}) {
  if (!input.rolloutPlanReady) return '生产 rollout runbook 前置证据不完整；先补齐本地交接或生产证据阻塞检查。';
  if (input.releaseReadinessPresent && !input.releaseReady) {
    if (input.releaseSecretFindingCount && input.releaseSecretFindingCount > 0) {
      return `发布前安全审计发现 ${input.releaseSecretFindingCount} 个疑似 Secret；先清理 Secret 风险，再提交/PR。当前仍不能删除旧正则。`;
    }
    if (input.githubReleaseHandoffPresent && input.githubReleaseHandoffReady) {
      return '发布前安全审计无疑似 Secret，GitHub 发布交接包已就绪；需用户授权后按交接包 stage/commit/PR，再由 Zeabur 自动部署。当前仍不能删除旧正则。';
    }
    return '发布前安全审计已确认无疑似 Secret，但工作区尚未整理成 GitHub 可部署提交；需用户授权后提交/PR，再由 Zeabur 自动部署。当前仍不能删除旧正则。';
  }
  if (input.deploymentSyncPresent && !input.deploymentSyncProven) {
    if (input.localChangedEntryCount && input.localChangedEntryCount > 0) {
      return `Zeabur 自动部署只会读取 GitHub 提交；当前本地仍有 ${input.localChangedEntryCount} 个改动条目未进入可部署提交。需提交并合入 Zeabur 跟踪分支后，再用 health commit 证明生产部署。当前仍不能删除旧正则。`;
    }
    if (!input.productionCommit) {
      return 'Zeabur 后端在线，但生产 health 尚不能返回 commit；需等本轮 health 元信息代码部署后，再只读确认生产运行版本。当前仍不能删除旧正则。';
    }
    return 'Zeabur 生产运行版本尚未证明与目标提交一致；先完成 GitHub 合入和自动部署确认。当前仍不能删除旧正则。';
  }
  if (input.postMergeDeployVerifyPresent && !input.postMergeProductionVerified) {
    return `合并后 Zeabur 部署验收器已接入，但仍有 ${input.postMergeDeployVerifyBlockers ?? 'n/a'} 个阻塞；需等 GitHub 合入、Agent V2 Gate 成功、Zeabur health commit 匹配后再进入生产 shadow。当前仍不能删除旧正则。`;
  }
  if (input.postMergeProductionVerified) {
    return '合并后 Zeabur 部署已只读验证；下一步进入生产 shadow、LLM 观测和旧正则退役证据采集。当前仍不能删除旧正则。';
  }
  if (!input.liveConfigPresent) {
    return '生产 rollout runbook 已就绪；建议先执行 live 配置审计，确认生产 API、Secrets 和 hook 开关状态。';
  }
  if (input.githubHookUrlSecretPresent && input.productionApiHealthReady && !input.productionBackendEnvConfirmed) {
    return '当前产品策略已定为 GitHub main 提交后自动发布 Agent V2 能力治理结果，平时不做定时发布；下一步需确认 Zeabur 后端同轮 token，再受控打开生产 hook 开关并做 hook smoke。当前仍不能删除旧正则。';
  }
  if (input.productionBackendEnvConfirmed && !input.githubProductionHookEnabled) {
    return 'Zeabur 后端 env 已确认后，按 GitHub 提交触发 auto-publish 策略，在受控窗口把 AGENT_V2_PRODUCTION_HOOK_ENABLED 设为 true 并做 hook smoke；当前仍不能删除旧正则。';
  }
  return '生产 rollout runbook 已就绪：可以在获得生产 API、Secrets、DB migration、LLM 观测和运维授权后执行；当前仍不能删除旧正则。';
}

function buildSteps(summary: Record<string, any>): RolloutStep[] {
  return [
    {
      id: 'p0_local_baseline',
      phase: 'D-1 本地基线',
      title: '冻结本地验收基线',
      owner: '研发',
      status: summary.localPrerequisitesReady ? 'ready' : 'blocked',
      expectedEvidence: 'strict eval、production config readiness、retirement handoff、local completion audit 均通过。',
      actions: [
        '确认当前 PR 或发布分支包含最新报告。',
        '确认 Agent V2 变更已提交并合入 Zeabur 跟踪的 GitHub 分支；本地未提交改动不会被 Zeabur 自动部署。',
        '提交前先生成 GitHub 发布交接包，按批次确认 Agent V2 范围和验证命令。',
        '合并后运行 post-merge deploy verify，确认 GitHub gate、Zeabur health 和生产 commit 均指向目标提交。',
        '确认发布前安全审计 secretFindingCount=0。',
        '确认本地完成度审计仍显示 localOpenUncheckedCount=0。',
      ],
      commands: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:release-readiness-audit',
        'npm.cmd --prefix packages/server-v2 run agent-v2:github-release-handoff:strict',
        'npm.cmd --prefix packages/server-v2 run agent-v2:production-deployment-sync-audit',
        'npm.cmd --prefix packages/server-v2 run agent-v2:post-merge-deploy-verify',
        'npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict',
        'npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict',
        'npm.cmd --prefix packages/server-v2 run agent-v2:retirement-handoff:strict',
        'npm.cmd --prefix packages/server-v2 run agent-v2:local-completion-audit:strict',
      ],
    },
    {
      id: 'p1_production_config',
      phase: 'D0 生产配置',
      title: '配置生产 API、Secrets、LLM 观测和治理权限',
      owner: '运维/研发',
      status: 'manual',
      expectedEvidence: '生产 API hook URL、deploy token、GitHub Secrets、Zeabur 后端环境变量、DB migration 授权和 core:agent-governance:view/manage 权限记录。',
      actions: [
        'Zeabur GitHub 自动部署负责代码同步、构建和服务重启，不依赖 Agent V2 deploy hook。',
        'Agent V2 deploy hook 负责让 GitHub workflow 在 main 分支提交后自动触发能力治理数据 auto-publish；workflow 不配置 schedule，后端 AGENT_V2_AUTO_PUBLISH_CRON 保持 false。',
        '启用前先在 Zeabur 后端配置同轮 AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN，并把 AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED 作为审计证据置为 true。',
        '只有受控 hook smoke 窗口才把 GitHub Variable AGENT_V2_PRODUCTION_HOOK_ENABLED 设为 true；打开后每次 main push 通过 gate 都会尝试触发 auto-publish。',
        '保持 AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=false。',
        '生产默认仍保留 legacy_regex 或受控治理表灰度。',
      ],
      commands: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:production-live-config-audit',
        'npm.cmd --prefix packages/server-v2 run agent-v2:production-config-readiness:strict',
        'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence',
      ],
    },
    {
      id: 'p2_shadow_window',
      phase: 'D1-D7 Shadow 观察',
      title: '开启 7 天 shadow / kg_llm_preferred / 受控 kg_llm_only 观察',
      owner: '产品/研发/运维',
      status: 'manual',
      expectedEvidence: '连续 7 天 AgentRun、AgentRunAuditDetail、AgentToolCall、AgentFeedback、rollback 记录导出。',
      actions: [
        '优先按门店、persona、entrypoint、capabilityId 小范围开启。',
        '每日检查重大回归、高风险自动执行、LLM 失败率和用户有用率。',
        '有异常时立即回到 legacy_regex 或 kg_llm_preferred。',
      ],
      commands: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --dry-run --days 7 --environment production',
      ],
    },
    {
      id: 'p3_evidence_aggregate',
      phase: 'D8 证据聚合',
      title: '聚合 shadow 导出为 candidate 证据',
      owner: '研发/运维',
      status: 'manual',
      expectedEvidence: 'candidate evidence、shadow evidence aggregate JSON/Markdown，且不自动写正式生产证据。',
      actions: [
        '使用真实生产导出文件作为输入。',
        '确认 shadow 模式反馈口径：用户实际看到 legacy，KG 侧只做观测。',
      ],
      commands: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-evidence -- --input <production-export.json>',
      ],
    },
    {
      id: 'p4_evidence_validate',
      phase: 'D8 证据校验',
      title: '校验并写入正式生产证据',
      owner: '研发/产品/运维',
      status: 'manual',
      expectedEvidence: 'production evidence check pass=true，正式 agent-v2-legacy-retirement-production-evidence.json 写入。',
      actions: [
        '先只读校验 candidate 证据。',
        '只有产品、研发和运维确认来源可信后，才使用 --write-canonical。',
      ],
      commands: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json>',
        'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <validated-production-evidence.json> --write-canonical',
      ],
    },
    {
      id: 'p5_retirement_approval',
      phase: 'D9 退役审批',
      title: '旧正则删除前最终门禁',
      owner: '产品/研发/运维',
      status: summary.productionReady ? 'ready' : 'blocked',
      expectedEvidence: 'strict retirement preflight 通过、真实回滚验证通过、删除 PR 验证通过。',
      actions: [
        '确认正式生产证据通过后再切 legacy_retired 或删除旧正则。',
        '删除旧正则后复跑 server-v2 build、P0 eval、管理端 build 和 Kiosk build。',
      ],
      commands: [
        'npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-preflight -- --strict-retirement',
        'npm.cmd --prefix packages/server-v2 run build',
        'npm.cmd run build',
        'npm.cmd --prefix packages/Ami-Aura-Lite-Kiosk run build',
      ],
    },
  ];
}

function readReports() {
  return Object.fromEntries(Object.entries({ ...reportFiles, ...optionalReportFiles }).map(([key, name]) => {
    const path = reportPath(name);
    return [key, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null];
  })) as Record<string, ReportValue | null>;
}

function reportPath(name: string) {
  return resolve(docsRoot, name);
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(path: string, report: {
  generatedAt: string;
  summary: Record<string, unknown>;
  source: { reports: Record<string, string>; optionalReports: Record<string, string>; canonicalProductionEvidence: string };
  steps: RolloutStep[];
  dailyShadowChecklist: string[];
  finalRetirementConditions: string[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 生产灰度与旧正则退役 Runbook',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- Runbook 就绪：${report.summary.rolloutPlanReady ? '是' : '否'}`,
    `- 本地前置就绪：${report.summary.localPrerequisitesReady ? '是' : '否'}`,
    `- 允许直接执行生产：${report.summary.productionExecutionAllowed ? '是' : '否'}`,
    `- 生产退役就绪：${report.summary.productionReady ? '是' : '否'}`,
    `- 生产证据仍阻塞：${report.summary.productionStillBlocked ? '是' : '否'}`,
    `- 生产证据阻塞项：${report.summary.productionEvidenceBlockers}`,
    `- Live 配置审计：${report.summary.productionLiveConfigAuditPresent ? '已接入' : '未接入'}`,
    `- 生产 API health：${report.summary.productionApiHealthReady ? '可达' : '未确认'}`,
    `- Zeabur 后端 env 已确认：${report.summary.productionBackendEnvConfirmed ? '是' : '否'}`,
    `- GitHub 生产 hook 开关：${report.summary.githubProductionHookEnabled ? '已开启' : '关闭'}`,
    `- 生产 hook 触发条件就绪：${report.summary.productionHookTriggerReady ? '是' : '否'}`,
    `- 生产部署同步审计：${report.summary.productionDeploymentSyncAuditPresent ? '已接入' : '未接入'}`,
    `- 生产部署同步已证明：${report.summary.productionDeploymentSyncProven ? '是' : '否'}`,
    `- 生产 commit：${report.summary.productionCommit ?? '<missing>'}`,
    `- 本地改动条目：${report.summary.localChangedEntryCount}`,
    `- 发布前安全审计：${report.summary.releaseReadinessAuditPresent ? '已接入' : '未接入'}`,
    `- 可直接发布：${report.summary.releaseReady ? '是' : '否'}`,
    `- 疑似 Secret：${report.summary.releaseSecretFindingCount}`,
    `- 发布前改动条目：${report.summary.releaseChangedEntryCount}`,
    `- GitHub 发布交接包：${report.summary.githubReleaseHandoffPresent ? '已接入' : '未接入'}`,
    `- GitHub 发布交接就绪：${report.summary.githubReleaseHandoffReady ? '是' : '否'}`,
    `- GitHub 发布批次：${report.summary.githubReleaseBatchCount}`,
    `- GitHub 提交仍需授权：${report.summary.githubReleaseAuthorizationRequired ? '是' : '否'}`,
    `- 合并后 Zeabur 验收：${report.summary.postMergeDeployVerifyPresent ? '已接入' : '未接入'}`,
    `- 合并后验收器就绪：${report.summary.postMergeVerifierReady ? '是' : '否'}`,
    `- 合并后生产已验证：${report.summary.postMergeProductionVerified ? '是' : '否'}`,
    `- 合并后验收阻塞项：${report.summary.postMergeDeployVerifyBlockers}`,
    `- 合并后目标提交：${report.summary.postMergeTargetCommit ?? '<missing>'}`,
    `- 合并后生产 commit：${report.summary.postMergeProductionCommit ?? '<missing>'}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 执行阶段',
    '',
    '| 阶段 | 状态 | 标题 | 责任方 | 证据 |',
    '| --- | --- | --- | --- | --- |',
    ...report.steps.map((step) => `| ${escapeMd(step.phase)} | ${statusLabel(step.status)} | ${escapeMd(step.title)} | ${escapeMd(step.owner)} | ${escapeMd(step.expectedEvidence)} |`),
    '',
    '## 阶段动作',
    '',
    ...report.steps.flatMap((step) => [
      `### ${step.phase} ${step.title}`,
      '',
      `- 状态：${statusLabel(step.status)}`,
      `- 责任方：${step.owner}`,
      `- 证据：${step.expectedEvidence}`,
      '',
      ...step.actions.map((action) => `- ${action}`),
      '',
      '```powershell',
      ...step.commands,
      '```',
      '',
    ]),
    '## 每日 Shadow 检查',
    '',
    ...report.dailyShadowChecklist.map((item) => `- ${item}`),
    '',
    '## 最终退役条件',
    '',
    ...report.finalRetirementConditions.map((item) => `- ${item}`),
    '',
    '## 来源',
    '',
    `- canonicalProductionEvidence: \`${report.source.canonicalProductionEvidence}\``,
    ...Object.entries(report.source.reports).map(([key, value]) => `- ${key}: \`${value}\``),
    ...Object.entries(report.source.optionalReports).map(([key, value]) => `- ${key} (optional): \`${value}\``),
    '',
    '## 边界',
    '',
    '- 本 runbook 只生成生产执行计划，不配置 Secrets、不调用生产 API、不连接生产库、不写正式生产证据。',
    '- 生产执行必须等待生产域名、token、Secrets、LLM 观测、DB migration、权限和运维窗口明确授权。',
    '- Runbook 就绪不等于旧正则退役完成。',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function statusLabel(status: StepStatus) {
  if (status === 'ready') return '就绪';
  if (status === 'manual') return '需授权执行';
  return '阻塞';
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
