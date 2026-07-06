import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { AgentV2GrayStrategyService, defaultAgentV2GrayMode, isGrayMode } from '../src/agent-v2/agent-v2-gray-strategy.service.js';
import { listAgentV2CapabilityManifests } from '../src/agent-v2/capability/agent-v2-capability-manifest.js';

type RatioMetric = {
  value?: number;
  numerator?: number;
  denominator?: number;
  sampleCount?: number;
  unit?: string;
};

type EvalGateReport = {
  generatedAt?: string;
  summary?: {
    totalQuestions?: number;
    p0Questions?: number;
    p0Unmapped?: number;
    p0PermissionNeedsReview?: number;
    p0ContractNotPass?: number;
    p0WrongRouteRisk?: number;
    highRiskAutoPublish?: number;
    pass?: boolean;
  };
  metrics?: {
    p0RuntimeAccuracy?: RatioMetric;
    p0Consistency?: RatioMetric;
    latencyP99Ms?: RatioMetric;
    cacheHitRate?: RatioMetric;
    kgLegacyDiffRate?: RatioMetric;
    preferredLegacyFallbackRate?: RatioMetric;
  };
};

type DiffAttributionReport = {
  generatedAt?: string;
  summary?: {
    diffTotal?: number;
    kgMatchesExpected?: number;
    legacyMatchesExpected?: number;
    needsKgFix?: number;
    safeToRetireByAttribution?: boolean;
  };
};

type EvalDraft = {
  priority?: string;
  expectedCapabilityId?: string;
};

type ProductionEvidenceReport = {
  generatedAt?: string;
  source?: {
    environment?: string;
    window?: string;
    exportedBy?: string;
  };
  shadow?: {
    observedDays?: number;
    totalRuns?: number;
    shadowRuns?: number;
    kgLlmPreferredRuns?: number;
    kgLlmOnlyRuns?: number;
    majorRegressionCount?: number;
    highRiskAutoExecutionCount?: number;
  };
  usefulness?: {
    relativeToLegacy?: 'better' | 'equal' | 'worse' | 'unknown';
    sampleCount?: number;
    kgHelpfulRate?: number;
    legacyHelpfulRate?: number;
  };
  llmObservability?: {
    enabled?: boolean;
    latencyP99Ms?: number;
    failureRate?: number;
    costObserved?: boolean;
    failureSamplesCaptured?: boolean;
  };
  rollback?: {
    verified?: boolean;
    lastVerifiedAt?: string;
    method?: string;
  };
};

type GateStatus = 'pass' | 'fail' | 'blocked';

type RetirementGate = {
  id: string;
  category: 'local_gate' | 'retirement_safety' | 'production_evidence';
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const evalDraftPath = resolve(docsRoot, 'agent-v2-eval-drafts.json');
const evalGateReportPath = resolve(docsRoot, 'agent-v2-eval-gate-report.json');
const diffAttributionPath = resolve(docsRoot, 'agent-v2-legacy-diff-attribution.json');
const productionEvidencePath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence.json');
const productionEvidenceExamplePath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence.example.json');
const agentV2OrchestratorPath = resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/agent-v2-orchestrator.service.ts');
const outputJsonPath = resolve(docsRoot, 'agent-v2-legacy-retirement-preflight.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-legacy-retirement-preflight.md');

function main() {
  if (!existsSync(evalGateReportPath)) {
    throw new Error(`缺少 eval gate 报告：${relativePath(evalGateReportPath)}。请先运行 npm.cmd --prefix packages/server-v2 run agent-v2:eval-gate:strict。`);
  }

  const evalReport = readJson<EvalGateReport>(evalGateReportPath);
  const evalDrafts = existsSync(evalDraftPath) ? readJson<{ drafts?: EvalDraft[] }>(evalDraftPath).drafts ?? [] : [];
  const diffAttribution = existsSync(diffAttributionPath) ? readJson<DiffAttributionReport>(diffAttributionPath) : null;
  const productionEvidence = existsSync(productionEvidencePath) ? readJson<ProductionEvidenceReport>(productionEvidencePath) : null;
  const gates = buildGates(evalReport, evalDrafts, diffAttribution, productionEvidence);
  const localGates = gates.filter((gate) => gate.category === 'local_gate');
  const retirementSafetyGates = gates.filter((gate) => gate.category === 'retirement_safety');
  const productionEvidenceGates = gates.filter((gate) => gate.category === 'production_evidence');
  const localPreflightPass = localGates.every((gate) => gate.status === 'pass');
  const retirementSafetyPass = retirementSafetyGates.every((gate) => gate.status === 'pass');
  const productionEvidencePass = productionEvidenceGates.every((gate) => gate.status === 'pass');
  const retirementReady = localPreflightPass && retirementSafetyPass && productionEvidencePass;
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const generatedAt = formatShanghaiTime(new Date());
  const report = {
    generatedAt,
    source: {
      evalDrafts: existsSync(evalDraftPath) ? relativePath(evalDraftPath) : null,
      evalGateReport: relativePath(evalGateReportPath),
      evalGateGeneratedAt: evalReport.generatedAt ?? null,
      diffAttributionReport: diffAttribution ? relativePath(diffAttributionPath) : null,
      diffAttributionGeneratedAt: diffAttribution?.generatedAt ?? null,
      productionEvidenceReport: productionEvidence ? relativePath(productionEvidencePath) : null,
      productionEvidenceGeneratedAt: productionEvidence?.generatedAt ?? null,
      productionEvidenceExample: relativePath(productionEvidenceExamplePath),
    },
    summary: {
      localPreflightPass,
      retirementReady,
      blockerCount: blockers.length,
      localGateFailures: localGates.filter((gate) => gate.status !== 'pass').length,
      retirementSafetyBlockers: retirementSafetyGates.filter((gate) => gate.status !== 'pass').length,
      productionEvidenceBlockers: productionEvidenceGates.filter((gate) => gate.status !== 'pass').length,
      recommendation: retirementReady
        ? '可进入旧正则删除 PR；删除后仍需复跑 build、P0 eval 和核心手动场景。'
        : localPreflightPass && retirementSafetyPass
          ? '本地工程门禁和退役安全门禁通过，但旧正则仍不可删除；需要先补齐生产 7 天 shadow/有用率/LLM 观测/回滚证据。'
          : localPreflightPass
            ? '本地工程门禁通过，但旧正则仍不可删除；需要先补齐差异归因和生产 7 天 shadow/有用率/回滚证据。'
          : '本地工程门禁未通过；先修复本地 P0、契约、权限或运行态问题，再考虑灰度退役。',
    },
    gates,
    blockers,
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict-local') && !localPreflightPass) process.exit(1);
  if (process.argv.includes('--strict-retirement') && !retirementReady) process.exit(1);
}

function buildGates(
  report: EvalGateReport,
  evalDrafts: EvalDraft[],
  diffAttribution: DiffAttributionReport | null,
  productionEvidence: ProductionEvidenceReport | null,
): RetirementGate[] {
  const summary = report.summary ?? {};
  const metrics = report.metrics ?? {};
  const attributionSummary = diffAttribution?.summary;
  const kgLegacyDiffRate = Number(metrics.kgLegacyDiffRate?.value ?? 1);
  const preferredFallbackRate = Number(metrics.preferredLegacyFallbackRate?.value ?? 1);
  const diffAttributionReady = Boolean(attributionSummary?.safeToRetireByAttribution);
  const sourceEnvironment = String(productionEvidence?.source?.environment ?? '').trim().toLowerCase();
  const sourceWindow = productionEvidence?.source?.window ?? '';
  const sourceExportedBy = productionEvidence?.source?.exportedBy ?? '';
  const sourceGeneratedAt = productionEvidence?.generatedAt ?? '';
  const sourceIntegrityOk = Boolean(
    productionEvidence
      && sourceEnvironment === 'production'
      && sourceWindow
      && sourceExportedBy
      && sourceGeneratedAt,
  );
  const shadowDays = Number(productionEvidence?.shadow?.observedDays ?? 0);
  const totalRuns = Number(productionEvidence?.shadow?.totalRuns ?? 0);
  const shadowRuns = Number(productionEvidence?.shadow?.shadowRuns ?? 0);
  const kgLlmPreferredRuns = Number(productionEvidence?.shadow?.kgLlmPreferredRuns ?? 0);
  const kgLlmOnlyRuns = Number(productionEvidence?.shadow?.kgLlmOnlyRuns ?? 0);
  const majorRegressionCount = Number(productionEvidence?.shadow?.majorRegressionCount ?? 0);
  const highRiskAutoExecutionCount = Number(productionEvidence?.shadow?.highRiskAutoExecutionCount ?? summary.highRiskAutoPublish ?? 0);
  const shadowEvidenceOk = Boolean(
    productionEvidence
      && shadowDays >= 7
      && totalRuns > 0
      && shadowRuns > 0
      && shadowRuns <= totalRuns
      && (kgLlmPreferredRuns + kgLlmOnlyRuns) > 0
      && majorRegressionCount === 0
      && highRiskAutoExecutionCount === 0,
  );
  const minimumUsefulnessSamples = Number(process.env.AGENT_V2_RETIREMENT_MIN_USEFULNESS_SAMPLES ?? 1);
  const onlineUsefulness = productionEvidence?.usefulness?.relativeToLegacy ?? 'unknown';
  const usefulnessSampleCount = Number(productionEvidence?.usefulness?.sampleCount ?? 0);
  const kgHelpfulRate = toFiniteNumber(productionEvidence?.usefulness?.kgHelpfulRate);
  const legacyHelpfulRate = toFiniteNumber(productionEvidence?.usefulness?.legacyHelpfulRate);
  const usefulnessRatesValid = rateInRange(kgHelpfulRate) && rateInRange(legacyHelpfulRate);
  const onlineUsefulnessOk = Boolean(
    productionEvidence
      && (onlineUsefulness === 'better' || onlineUsefulness === 'equal')
      && usefulnessSampleCount >= minimumUsefulnessSamples
      && usefulnessRatesValid
      && Number(kgHelpfulRate) >= Number(legacyHelpfulRate),
  );
  const rollbackVerified = Boolean(productionEvidence?.rollback?.verified);
  const rollbackEvidenceOk = Boolean(
    productionEvidence
      && rollbackVerified
      && productionEvidence.rollback?.lastVerifiedAt
      && productionEvidence.rollback?.method,
  );
  const llmObservability = productionEvidence?.llmObservability;
  const llmLatencyP99Ms = toFiniteNumber(llmObservability?.latencyP99Ms);
  const llmFailureRate = toFiniteNumber(llmObservability?.failureRate);
  const productionLlmObserved = Boolean(
    productionEvidence
      && llmObservability?.enabled
      && llmObservability.costObserved
      && llmObservability.failureSamplesCaptured
      && Number(llmLatencyP99Ms) > 0
      && rateInRange(llmFailureRate),
  );
  const activeManifestIds = new Set(listAgentV2CapabilityManifests().map((manifest) => manifest.capabilityId));
  const p0ExpectedCapabilityIds = Array.from(new Set(
    evalDrafts
      .filter((draft) => draft.priority === 'P0')
      .map((draft) => String(draft.expectedCapabilityId ?? '').trim())
      .filter((capabilityId) => capabilityId && !capabilityId.endsWith('.unmapped.eval_candidate')),
  ));
  const missingStaticManifestIds = p0ExpectedCapabilityIds.filter((capabilityId) => !activeManifestIds.has(capabilityId));
  const rollbackSafety = inspectRollbackSafety();
  const auditSafety = inspectAuditCompatibility();

  return [
    {
      id: 'eval_gate_pass',
      category: 'local_gate',
      title: 'P0 strict gate',
      expected: 'eval gate summary.pass=true',
      actual: summary.pass ? '通过' : '未通过',
      status: summary.pass ? 'pass' : 'fail',
      impact: '本地 P0 门禁不过时不能灰度，更不能删除旧正则。',
    },
    {
      id: 'p0_zero_blockers',
      category: 'local_gate',
      title: 'P0 阻断项',
      expected: '未映射、权限待审、契约失败、错路由均为 0',
      actual: `未映射 ${summary.p0Unmapped ?? '-'}，权限待审 ${summary.p0PermissionNeedsReview ?? '-'}，契约失败 ${summary.p0ContractNotPass ?? '-'}，错路由 ${summary.p0WrongRouteRisk ?? '-'}`,
      status: [
        summary.p0Unmapped,
        summary.p0PermissionNeedsReview,
        summary.p0ContractNotPass,
        summary.p0WrongRouteRisk,
      ].every((value) => Number(value ?? -1) === 0) ? 'pass' : 'fail',
      impact: 'P0 仍有阻断项时，新架构不能作为正式唯一入口。',
    },
    {
      id: 'runtime_accuracy',
      category: 'local_gate',
      title: 'P0 运行态正确率',
      expected: '>= 98%',
      actual: formatMetric(metrics.p0RuntimeAccuracy),
      status: Number(metrics.p0RuntimeAccuracy?.value ?? 0) >= 0.98 ? 'pass' : 'fail',
      impact: '证明 runtime planning 不只是静态 Manifest 通过。',
    },
    {
      id: 'runtime_consistency',
      category: 'local_gate',
      title: 'P0 同题稳定性',
      expected: '>= 99%',
      actual: formatMetric(metrics.p0Consistency),
      status: Number(metrics.p0Consistency?.value ?? 0) >= 0.99 ? 'pass' : 'fail',
      impact: '同题多次不稳定会导致灰度期间门店感知为答案漂移。',
    },
    {
      id: 'high_risk_auto_publish',
      category: 'local_gate',
      title: '高风险自动发布',
      expected: '0',
      actual: String(summary.highRiskAutoPublish ?? '-'),
      status: Number(summary.highRiskAutoPublish ?? -1) === 0 ? 'pass' : 'fail',
      impact: '高风险动作不能绕过审批或阻断策略。',
    },
    {
      id: 'latency_p99',
      category: 'local_gate',
      title: '规划延迟 P99',
      expected: '<= 800ms',
      actual: `${Number(metrics.latencyP99Ms?.value ?? 0).toFixed(2)}ms / 样本 ${metrics.latencyP99Ms?.sampleCount ?? 0}`,
      status: Number(metrics.latencyP99Ms?.value ?? Number.POSITIVE_INFINITY) <= 800 ? 'pass' : 'fail',
      impact: '本地规划延迟过高会影响管理端和终端问答体验。',
    },
    {
      id: 'static_p0_manifest_fallback',
      category: 'local_gate',
      title: '静态 P0 Manifest 兜底',
      expected: '所有 P0 期望 capabilityId 都存在于静态 enabled Manifest',
      actual: p0ExpectedCapabilityIds.length
        ? `P0 能力 ${p0ExpectedCapabilityIds.length} 个，静态缺失 ${missingStaticManifestIds.length} 个${missingStaticManifestIds.length ? `：${missingStaticManifestIds.slice(0, 10).join(', ')}` : ''}`
        : '未读取到 P0 评测能力列表',
      status: p0ExpectedCapabilityIds.length > 0 && missingStaticManifestIds.length === 0 ? 'pass' : 'fail',
      impact: '删除旧正则前必须保证 DB Manifest 或动态发布异常时，P0 能力仍有静态兜底。'
    },
    {
      id: 'rollback_switch_available',
      category: 'local_gate',
      title: '回滚开关',
      expected: 'legacy_regex/kg_llm_preferred/kg_llm_only/legacy_retired 均可识别，生产默认仍可回 legacy_regex',
      actual: rollbackSafety.actual,
      status: rollbackSafety.ok ? 'pass' : 'fail',
      impact: '旧正则退役前必须保留显式模式开关，确保可以从 kg_llm_only/legacy_retired 快速回到 legacy_regex。'
    },
    {
      id: 'historical_run_audit_compatibility',
      category: 'local_gate',
      title: '历史 run 审计兼容',
      expected: '运行审计仍记录 strategy、决策、候选、工具计划和 AgentRunAuditDetail',
      actual: auditSafety.actual,
      status: auditSafety.ok ? 'pass' : 'fail',
      impact: '旧正则删除后仍需要能回看历史 run 里的新旧引擎选择、回退原因和工具执行证据。'
    },
    {
      id: 'kg_legacy_diff_rate',
      category: 'retirement_safety',
      title: 'KG-only 与旧链路差异率',
      expected: '<= 5% 或已完成逐项业务归因',
      actual: diffAttribution
        ? `${formatMetric(metrics.kgLegacyDiffRate)}；已归因 ${attributionSummary?.diffTotal ?? 0} 条，KG 待修 ${attributionSummary?.needsKgFix ?? 0} 条`
        : `${formatMetric(metrics.kgLegacyDiffRate)}；未生成差异归因报告`,
      status: kgLegacyDiffRate <= 0.05 || diffAttributionReady ? 'pass' : 'blocked',
      impact: '差异率过高时不能直接删除旧正则，需要先判断哪些是新链路改进、哪些是错路由。',
    },
    {
      id: 'kg_legacy_diff_attribution',
      category: 'retirement_safety',
      title: 'KG-only 与旧链路逐项归因',
      expected: '已生成归因报告，且 KG 待修差异为 0',
      actual: diffAttribution
        ? `差异 ${attributionSummary?.diffTotal ?? 0} 条，KG 命中期望 ${attributionSummary?.kgMatchesExpected ?? 0} 条，legacy 命中期望 ${attributionSummary?.legacyMatchesExpected ?? 0} 条，KG 待修 ${attributionSummary?.needsKgFix ?? 0} 条`
        : '未生成归因报告',
      status: diffAttributionReady ? 'pass' : 'blocked',
      impact: '归因未完成或 KG 仍有待修差异时，不能把旧正则从安全兜底中移除。',
    },
    {
      id: 'preferred_legacy_fallback_rate',
      category: 'retirement_safety',
      title: 'kg_llm_preferred 回退旧链路率',
      expected: '<= 1% 或已完成回退原因归因',
      actual: formatMetric(metrics.preferredLegacyFallbackRate),
      status: preferredFallbackRate <= 0.01 ? 'pass' : 'blocked',
      impact: '仍大量回退旧链路说明旧正则还承担安全兜底，不能删除。',
    },
    {
      id: 'production_source_integrity',
      category: 'production_evidence',
      title: '生产证据来源',
      expected: 'environment=production，且包含 window/exportedBy/generatedAt',
      actual: productionEvidence
        ? `environment=${productionEvidence.source?.environment ?? '-'}，window=${sourceWindow || '-'}，exportedBy=${sourceExportedBy || '-'}，generatedAt=${sourceGeneratedAt || '-'}`
        : '未提供生产证据文件',
      status: sourceIntegrityOk ? 'pass' : 'blocked',
      impact: '防止本地 dry-run、staging/local 导出或手工模板被误当成旧正则退役依据。',
    },
    {
      id: 'shadow_7_days',
      category: 'production_evidence',
      title: '生产 shadow 观察',
      expected: '>= 7 天、真实 shadow/灰度样本非 0，且无重大回归',
      actual: productionEvidence
        ? `${shadowDays} 天，总样本 ${totalRuns}，shadow ${shadowRuns}，preferred ${kgLlmPreferredRuns}，only ${kgLlmOnlyRuns}，重大回归 ${majorRegressionCount}，高风险自动执行 ${highRiskAutoExecutionCount}`
        : `${shadowDays} 天；未提供生产证据文件`,
      status: shadowEvidenceOk ? 'pass' : 'blocked',
      impact: '本地 dry-run 不能替代真实门店问题、真实权限和真实入口流量。',
    },
    {
      id: 'online_usefulness',
      category: 'production_evidence',
      title: '线上用户有用率',
      expected: `不低于旧链路，且样本数 >= ${minimumUsefulnessSamples}`,
      actual: productionEvidence
        ? `${onlineUsefulness}，样本 ${usefulnessSampleCount}，KG 有用率 ${formatRate(kgHelpfulRate)}，legacy 有用率 ${formatRate(legacyHelpfulRate)}`
        : '未提供生产观测证据',
      status: onlineUsefulnessOk ? 'pass' : 'blocked',
      impact: '用户有用率不达标时，技术门禁通过也不能切成唯一入口。',
    },
    {
      id: 'production_llm_observability',
      category: 'production_evidence',
      title: '生产 LLM 观测',
      expected: '延迟、成本、失败率和失败样本已纳入线上观测',
      actual: productionEvidence
        ? `enabled=${Boolean(llmObservability?.enabled)}，P99=${llmLatencyP99Ms ?? '-'}ms，失败率=${formatRate(llmFailureRate)}，成本观测=${Boolean(llmObservability?.costObserved)}，失败样本=${Boolean(llmObservability?.failureSamplesCaptured)}`
        : '未接入生产观测',
      status: productionLlmObserved ? 'pass' : 'blocked',
      impact: '没有生产 LLM 观测时，无法判断成本和失败样本是否可接受。',
    },
    {
      id: 'rollback_verified',
      category: 'production_evidence',
      title: '可回滚方案',
      expected: '已在生产或准生产验证',
      actual: productionEvidence
        ? `${rollbackVerified ? '已验证' : '未验证'}，方式=${productionEvidence.rollback?.method ?? '-'}，时间=${productionEvidence.rollback?.lastVerifiedAt ?? '-'}`
        : '未提供回滚验证证据',
      status: rollbackEvidenceOk ? 'pass' : 'blocked',
      impact: '旧正则删除前必须证明可以从 kg_llm_only/legacy_retired 快速回退。',
    },
  ];
}

function writeMarkdown(path: string, report: ReturnType<typeof buildReportShape>) {
  const lines = [
    '# Agent V2 旧正则退役预检报告',
    '',
    `生成时间：${report.generatedAt}`,
    `Eval gate 来源：${report.source.evalGateReport}`,
    `Eval gate 时间：${report.source.evalGateGeneratedAt ?? '-'}`,
    `差异归因来源：${report.source.diffAttributionReport ?? '-'}`,
    `差异归因时间：${report.source.diffAttributionGeneratedAt ?? '-'}`,
    `生产证据来源：${report.source.productionEvidenceReport ?? '-'}`,
    `生产证据时间：${report.source.productionEvidenceGeneratedAt ?? '-'}`,
    `生产证据模板：${report.source.productionEvidenceExample}`,
    '',
    '## 结论',
    '',
    `- 本地退役前置门禁：${report.summary.localPreflightPass ? '通过' : '未通过'}`,
    `- 是否可删除旧正则：${report.summary.retirementReady ? '可以' : '不可以'}`,
    `- 阻塞项数量：${report.summary.blockerCount}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 门禁明细',
    '',
    '| 类别 | 门禁 | 期望 | 当前证据 | 状态 | 交付影响 |',
    '|---|---|---|---|---|---|',
    ...report.gates.map((gate) => `| ${categoryLabel(gate.category)} | ${gate.title} | ${gate.expected} | ${gate.actual} | ${statusLabel(gate.status)} | ${gate.impact} |`),
    '',
    '## 阻塞项',
    '',
    ...blockerLines(report.blockers),
  ];
  writeText(path, `${lines.join('\n')}\n`);
}

function buildReportShape() {
  return {
    generatedAt: '',
    source: {
      evalDrafts: null as string | null,
      evalGateReport: '',
      evalGateGeneratedAt: null as string | null,
      diffAttributionReport: null as string | null,
      diffAttributionGeneratedAt: null as string | null,
      productionEvidenceReport: null as string | null,
      productionEvidenceGeneratedAt: null as string | null,
      productionEvidenceExample: '',
    },
    summary: {
      localPreflightPass: false,
      retirementReady: false,
      blockerCount: 0,
      localGateFailures: 0,
      retirementSafetyBlockers: 0,
      productionEvidenceBlockers: 0,
      recommendation: '',
    },
    gates: [] as RetirementGate[],
    blockers: [] as RetirementGate[],
  };
}

function blockerLines(blockers: RetirementGate[]) {
  if (!blockers.length) return ['无'];
  return blockers.map((gate) => `- ${gate.title}：${gate.actual}。${gate.impact}`);
}

function inspectRollbackSafety() {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGrayMode = process.env.AGENT_V2_GRAY_MODE;
  const originalRetirementConfirmed = process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;
  try {
    process.env.NODE_ENV = 'production';
    const productionDefault = defaultAgentV2GrayMode();
    process.env.AGENT_V2_GRAY_MODE = 'legacy_retired';
    delete process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;
    const unconfirmedRetired = new AgentV2GrayStrategyService().resolve({
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'preflight' },
    });
    process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED = 'true';
    const confirmedRetired = new AgentV2GrayStrategyService().resolve({
      actor: { storeId: 1, userId: 1, role: 'manager', entrypoint: 'preflight' },
    });
    delete process.env.AGENT_V2_GRAY_MODE;
    delete process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;
    process.env.NODE_ENV = 'test';
    const nonProductionDefault = defaultAgentV2GrayMode();
    const requiredModes = ['legacy_regex', 'shadow', 'kg_llm_preferred', 'kg_llm_only', 'legacy_retired'];
    const missingModes = requiredModes.filter((mode) => !isGrayMode(mode));
    const ok = missingModes.length === 0
      && productionDefault.mode === 'legacy_regex'
      && nonProductionDefault.mode === 'kg_llm_preferred'
      && unconfirmedRetired.mode === 'kg_llm_preferred'
      && confirmedRetired.mode === 'legacy_retired';
    return {
      ok,
      actual: `模式缺失 ${missingModes.length ? missingModes.join(', ') : '0'}，生产默认 ${productionDefault.mode}，非生产默认 ${nonProductionDefault.mode}，未确认 legacy_retired -> ${unconfirmedRetired.mode}，确认后 -> ${confirmedRetired.mode}`,
    };
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalGrayMode === undefined) {
      delete process.env.AGENT_V2_GRAY_MODE;
    } else {
      process.env.AGENT_V2_GRAY_MODE = originalGrayMode;
    }
    if (originalRetirementConfirmed === undefined) {
      delete process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;
    } else {
      process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED = originalRetirementConfirmed;
    }
  }
}

function inspectAuditCompatibility() {
  const source = existsSync(agentV2OrchestratorPath) ? readFileSync(agentV2OrchestratorPath, 'utf8') : '';
  const checks = [
    ['persistPlan', source.includes('persistPlan(runId, plan)')],
    ['recordStep', source.includes('recordStep({')],
    ['upsertAuditDetail', source.includes('upsertAuditDetail({')],
    ['strategy', source.includes('strategy: input.agentV2Plan?.strategy')],
    ['capabilityMappingJson', source.includes('capabilityMappingJson')],
    ['toolTraceJson', source.includes('toolTraceJson')],
  ] as const;
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return {
    ok: missing.length === 0,
    actual: missing.length ? `缺失 ${missing.join(', ')}` : 'persistPlan/recordStep/AuditDetail/strategy/capabilityMapping/toolTrace 均存在',
  };
}

function formatMetric(metric?: RatioMetric) {
  if (!metric) return '-';
  const value = Number(metric.value ?? 0);
  if (metric.unit === 'ms') return `${value.toFixed(2)}ms / 样本 ${metric.sampleCount ?? 0}`;
  return `${(value * 100).toFixed(2)}%（${metric.numerator ?? '-'} / ${metric.denominator ?? '-'}）`;
}

function formatRate(value: number | null) {
  if (value === null) return '-';
  return `${(value * 100).toFixed(2)}%`;
}

function categoryLabel(category: RetirementGate['category']) {
  if (category === 'local_gate') return '本地门禁';
  if (category === 'retirement_safety') return '退役安全';
  return '生产证据';
}

function statusLabel(status: GateStatus) {
  if (status === 'pass') return '通过';
  if (status === 'fail') return '失败';
  return '阻塞';
}

function toFiniteNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rateInRange(value: number | null) {
  return value !== null && value >= 0 && value <= 1;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
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
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')} Asia/Shanghai`;
}

main();
