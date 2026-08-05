import { expect, test, type Page, type Route } from '@playwright/test';

type PermissionSet = string[];

const store = { id: 1, name: 'Ami 治理验收门店', status: 'active' };
const capabilityPolicy = {
  id: 11,
  resourceType: 'capability_policy',
  resourceKey: 'customer_facts',
  version: 2,
  status: 'draft',
  checksum: 'a'.repeat(64),
  snapshot: {},
  createdBy: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  policy: {
    schemaVersion: 1,
    capabilityKey: 'customer_facts',
    riskLevel: 'medium',
    mode: 'preview',
    whitelistStatus: 'pending',
    runtimeEnforcementStatus: 'pending_runtime',
    permissions: ['core:customer:view'],
    owners: { product: 'crm' },
    evidence: [{ receiptId: 'receipt-1', expiresAt: '2099-08-03T00:00:00.000Z' }],
    impact: {},
    reason: '中风险预览能力',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
};
const skillSummary = {
  versionId: 1053,
  skillId: 2053,
  skillKey: 'appointment_gap_list',
  name: '预约空档查询',
  description: '查询指定日期和员工的预约空档。',
  version: 17,
  status: 'active',
  updatedAt: '2026-08-01T00:00:00.000Z',
  activeVersionId: 1053,
  activeVersion: 17,
  enabled: true,
  historyCount: 17,
  managed: true,
  domains: ['reservation'],
  entities: ['reservation'],
  metrics: ['appointment_count'],
};
const legacyDisabledSkill = {
  id: 3054,
  skillKey: 'legacy_disabled_skill',
  name: '历史停用技能',
  description: '已停用但仍需进入治理中心完成纳管判断。',
  type: 'analysis',
  version: 3,
  enabled: false,
  permissions: ['core:brain:use'],
  riskLevel: 'low',
  domains: ['legacy'],
  definitionRefs: [{ definitionKey: 'entity.customer' }, { definitionKey: 'metric.customer_count' }],
  updatedAt: '2026-07-01T00:00:00.000Z',
};
const highRiskPolicy = {
  ...capabilityPolicy,
  id: 12,
  resourceKey: 'high_risk_alert',
  version: 1,
  policy: {
    ...capabilityPolicy.policy,
    capabilityKey: 'high_risk_alert',
    riskLevel: 'high',
    mode: 'alert',
    whitelistStatus: 'not_allowed',
    runtimeEnforcementStatus: 'pending_runtime',
    reason: '高风险能力只允许告警或人工处理',
  },
};
const lowRiskPolicy = {
  ...capabilityPolicy,
  id: 13,
  version: 3,
  policy: {
    ...capabilityPolicy.policy,
    riskLevel: 'low',
    mode: 'readonly',
    whitelistStatus: 'pending',
    runtimeEnforcementStatus: 'pending_runtime',
    evidence: [],
    reason: '低风险只读能力，等待可信 CI 证据自动准入',
  },
};
const waitingEvidenceTask = {
  id: 101,
  idempotencyKey: 'evaluate:customer_facts:waiting-evidence',
  taskType: 'evaluate',
  stage: 'candidate',
  resourceType: 'capability_policy',
  resourceKey: 'customer_facts',
  riskLevel: 'low',
  status: 'revision_required',
  blockerType: 'evidence',
  blockerCode: 'trusted_receipt_missing',
  resolutionType: 'wait_ci',
  candidate: {
    id: 601,
    candidateKey: 'ami/beauty-salon-admin:candidate-head:candidate-merge-base',
    branch: 'ami-brain-governance',
    headCommit: 'd'.repeat(40),
    status: 'governing',
  },
  requiredGates: ['brain_contract', 'cross_client_contract'],
  payload: {},
  result: { blockingReason: 'trusted_receipt_missing' },
  transitionLog: [],
  timeline: [],
  attemptCount: 0,
  maxAttempts: 3,
  availableAt: '2026-08-01T00:00:00.000Z',
  leasedAt: null,
  leaseExpiresAt: null,
  leaseOwner: null,
  errorCode: null,
  errorMessage: null,
  createdBy: 1,
  approvedBy: null,
  completedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};
const runtimeDraftRelease = {
  id: 501,
  releaseKey: 'runtime-r501-shadow',
  scope: 'percentage',
  rollout: { stage: 'shadow', mode: 'model', userPercentage: 100 },
  status: 'draft',
  previousReleaseId: 416,
  createdAt: '2026-08-01T01:00:00.000Z',
  items: [{
    id: 901,
    resourceType: 'skill',
    resourceKey: 'customer_facts',
    version: 2,
    snapshot: {
      name: '客户事实',
      description: '只读查询客户事实',
      readOnly: true,
      sideEffect: false,
      allowedRoles: ['store_manager'],
      riskLevel: 'low',
      requiresConfirmation: false,
      tests: { contract: 'passed', security: 'passed', eval: 'passed' },
    },
  }],
};
const runtimeActiveRelease = {
  ...runtimeDraftRelease,
  id: 416,
  releaseKey: 'runtime-r416',
  status: 'active',
  previousReleaseId: 415,
  rollout: { stage: 'full', mode: 'model', userPercentage: 100 },
};
const governanceCandidate = {
  id: 601,
  candidateKey: 'ami/beauty-salon-admin:candidate-head:candidate-merge-base',
  repository: 'ami/beauty-salon-admin',
  eventName: 'pull_request',
  branch: 'ami-brain-governance',
  baseCommit: 'b'.repeat(40),
  mergeBaseCommit: 'c'.repeat(40),
  headCommit: 'd'.repeat(40),
  changedFilesChecksum: 'e'.repeat(64),
  diffChecksum: 'f'.repeat(64),
  sourceFingerprint: '1'.repeat(64),
  riskLevel: 'medium',
  status: 'observing',
  policyDecision: 'create_snapshot',
  policySnapshotId: 7,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T01:00:00.000Z',
};
const rolloutSequence = {
  id: 701,
  sequenceKey: 'candidate-head-rollout',
  runtimeVersionNumber: 1,
  runtimeVersionCode: 'RT-001',
  displayName: 'Query Only V1',
  productProfile: 'query_only_v1',
  productIdentity: { family: 'runtime', code: 'RT-001', stageCode: 'RT-001-SHADOW', name: 'Query Only V1', internalReleaseId: 711 },
  status: 'active',
  currentStage: 'shadow',
  governanceMode: 'shadow',
  promotionPolicy: { observationMinutes: 30, minimumSampleSize: 20 },
  healthThresholds: { maxErrorRate: 0.02, maxTimeoutRate: 0.01 },
  pauseReason: null,
  candidateId: governanceCandidate.id,
  candidate: governanceCandidate,
  policySnapshot: { id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', status: 'active', releaseFamily: 'policy', displayCode: 'GP-003', displayName: 'Query Only V1 强制治理策略', productIdentity: { family: 'policy', code: 'GP-003', stageCode: null, name: 'Query Only V1 强制治理策略', internalReleaseId: 7 }, createdAt: '2026-08-01T00:00:00.000Z' },
  previousRuntimeRelease: { id: 416, releaseKey: 'runtime-r416', status: 'active' },
  releases: [
    { ...runtimeDraftRelease, id: 711, releaseKey: 'candidate-shadow', status: 'active', rolloutStage: 'shadow', releaseReadiness: { status: 'ready', canRelease: true, evaluationReleaseId: 610, evalRunId: 240, releaseFingerprint: 'f'.repeat(64), suiteChecksum: 's'.repeat(64), questionCount: 100, provider: 'openai_responses', model: 'gpt-5.6-terra', generatedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2099-08-03T00:00:00.000Z', blockers: [] } },
    { ...runtimeDraftRelease, id: 712, releaseKey: 'candidate-canary-5', status: 'draft', rolloutStage: 'canary_5', releaseReadiness: { status: 'ready', canRelease: true, evaluationReleaseId: 610, evalRunId: 240, releaseFingerprint: 'f'.repeat(64), suiteChecksum: 's'.repeat(64), questionCount: 100, provider: 'openai_responses', model: 'gpt-5.6-terra', generatedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2099-08-03T00:00:00.000Z', blockers: [] } },
    { ...runtimeDraftRelease, id: 713, releaseKey: 'candidate-canary-20', status: 'draft', rolloutStage: 'canary_20' },
    { ...runtimeDraftRelease, id: 714, releaseKey: 'candidate-canary-50', status: 'draft', rolloutStage: 'canary_50' },
    { ...runtimeDraftRelease, id: 715, releaseKey: 'candidate-full', status: 'draft', rolloutStage: 'full' },
  ],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T01:00:00.000Z',
  startedAt: '2026-08-01T00:30:00.000Z',
  completedAt: null,
};
const governanceTransition = {
  id: 801,
  transitionKey: 'query-only-v1-transition',
  status: 'validated',
  candidateId: governanceCandidate.id,
  candidate: governanceCandidate,
  oldPolicyReleaseId: 436,
  newPolicyReleaseId: 7,
  oldRuntimeReleaseId: 416,
  runtimeSequenceId: rolloutSequence.id,
  oldPolicy: { id: 436, releaseKey: 'legacy-shadow-policy', scope: 'governance_policy', status: 'active', productIdentity: { family: 'policy', code: 'GP-002', stageCode: null, name: 'Legacy Shadow Policy', internalReleaseId: 436 }, createdAt: '2026-08-01T00:00:00.000Z' },
  newPolicy: rolloutSequence.policySnapshot,
  oldRuntime: { id: 416, releaseKey: 'runtime-r416', scope: 'global', status: 'active', productIdentity: { family: 'legacy', code: 'LEGACY-RT-416', stageCode: null, name: 'Production Baseline', internalReleaseId: 416 }, createdAt: '2026-07-22T00:00:00.000Z' },
  runtimeSequence: rolloutSequence,
  policyApprovedAt: null,
  runtimeApprovedAt: null,
  currentStep: 'validated',
  createdBy: 1,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
};
const governanceRole = {
  id: 61,
  roleKey: 'store_manager',
  name: '店长经营专家',
  status: 'active',
  version: 3,
  description: '门店经营分析与建议',
  skillKeys: ['customer_facts'],
  domainScopes: ['store'],
  dataScopes: ['current_store'],
  updatedAt: '2026-08-01T00:00:00.000Z',
};
const governanceMemory = {
  id: 71,
  storeId: 1,
  userId: 1,
  type: 'semantic',
  subjectKey: 'customer.preference.71',
  content: { preference: '晚间预约' },
  confidence: 0.9,
  validFrom: '2026-08-01T00:00:00.000Z',
  expiresAt: null,
  sourceRunId: 501,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  deletedAt: null,
};
const governanceEvalRun = {
  id: 81,
  releaseId: 416,
  evaluationIdentity: { family: 'evaluation', code: 'EV-001', stageCode: null, name: 'Query Only V1 评测', internalReleaseId: 416 },
  roleKey: null,
  status: 'completed',
  caseCount: 10,
  passedCount: 8,
  failedCount: 2,
  summary: { gateMode: 'release_gate' },
  createdAt: '2026-08-01T00:00:00.000Z',
};
const governanceFinding = {
  id: 91,
  ruleKey: 'inventory.low_stock',
  title: '库存低于安全线',
  severity: 'high',
  status: 'open',
  evidence: { stock: 2 },
  suggestion: { action: '人工复核补货' },
};
const governanceFindingSummary = {
  id: governanceFinding.id,
  ruleKey: governanceFinding.ruleKey,
  title: governanceFinding.title,
  severity: governanceFinding.severity,
  status: governanceFinding.status,
  evidenceCount: 1,
  suggestionCount: 1,
  owner: 'inventory-owner',
  candidateKey: governanceCandidate.candidateKey,
};

const conversation = {
  id: 91,
  storeId: 1,
  userId: 1,
  title: '预约空档治理验收',
  status: 'active',
  createdAt: '2026-08-01T02:00:00.000Z',
  updatedAt: '2026-08-01T02:01:00.000Z',
};
const traceMessages = [
  {
    id: 1001,
    conversationId: 91,
    role: 'user',
    // ami-brain-historical-only: mocked governance trace for latency UI E2E; excluded from product release evaluation.
    content: '找出明天下午空档并给出跟进建议',
    createdAt: '2026-08-01T02:00:00.000Z',
  },
  {
    id: 1002,
    conversationId: 91,
    role: 'assistant',
    content: '已找到 2 个空档并生成只读建议。',
    metadata: {
      runId: 501,
      status: 'completed',
      intentSchemaVersion: 'intent-v3',
      semanticIntent: { intent: 'workflow', objective: '补齐预约空档', schemaVersion: 'intent-v3' },
      provider: 'openai_responses',
      model: 'gpt-5.6-terra',
      adapterMetadata: {
        observations: [{ nodeId: 'find_gaps', capabilityKey: 'appointment_gap_list', status: 'completed', grounding: 'db_skill' }],
        completion: { status: 'complete', missingCriteria: [], reason: '空档与跟进建议均已返回' },
      },
    },
    createdAt: '2026-08-01T02:00:22.000Z',
  },
];
const traceEvents = [
  {
    id: 2001,
    runId: 501,
    stepKey: 'release_runtime_selection',
    layer: 'release',
    status: 'completed',
    output: {
      releaseKey: 'runtime-r416',
      releaseId: 416,
      mode: 'model',
      runtimeProductIdentity: { family: 'legacy', code: 'LEGACY-RT-416', stageCode: null, name: 'Production Baseline', internalReleaseId: 416 },
      governancePolicyIdentity: { family: 'legacy', code: 'LEGACY-GP-436', stageCode: null, name: 'Legacy Shadow Policy', internalReleaseId: 436 },
      releaseFingerprint: 'f'.repeat(64),
      provider: 'openai_responses',
      model: 'gpt-5.6-terra',
    },
    createdAt: '2026-08-01T02:00:01.000Z',
  },
  {
    id: 2002,
    runId: 501,
    stepKey: 'cognition_model',
    layer: 'cognition',
    status: 'completed',
    output: { semanticIntent: { intent: 'workflow', objective: '补齐预约空档', schemaVersion: 'intent-v3' } },
    createdAt: '2026-08-01T02:00:02.000Z',
  },
  {
    id: 2003,
    runId: 501,
    stepKey: 'supervisor_model_plan',
    layer: 'planning',
    status: 'completed',
    output: {
      candidateCapabilities: [{
        key: 'appointment_gap_list',
        name: '预约空档查询',
        version: 17,
        score: 0.96,
        matchedFields: ['intent', 'entity.reservation', 'metric.appointment_count'],
      }],
      plan: {
        objective: '补齐预约空档',
        nodes: [
          { id: 'find_gaps', capabilityKey: 'appointment_gap_list', capabilityVersion: 17, dependsOn: [] },
          { id: 'draft_follow_up', capabilityKey: 'customer_follow_up_draft', capabilityVersion: 4, dependsOn: ['find_gaps'], previewOnly: true },
        ],
      },
    },
    createdAt: '2026-08-01T02:00:03.000Z',
  },
  {
    id: 2004,
    runId: 501,
    stepKey: 'bounded_dag_execution',
    layer: 'execution',
    status: 'completed',
    output: {
      observations: [{ nodeId: 'find_gaps', capabilityKey: 'appointment_gap_list', status: 'completed', grounding: 'db_skill' }],
      completion: { status: 'complete', missingCriteria: [], reason: '空档与跟进建议均已返回' },
    },
    createdAt: '2026-08-01T02:00:22.000Z',
  },
];

function fulfillJson(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

async function installGovernanceMocks(
  page: Page,
  permissions: PermissionSet,
  options: {
    allStores?: boolean;
    delayCapabilityFilters?: boolean;
    draftRollout?: boolean;
    pausedRollout?: boolean;
    evidenceRecovery?: boolean;
    lowRiskAutoAdmission?: boolean;
    reusePolicy?: boolean;
    combinedTransition?: boolean;
  } = {},
) {
  let policyPublished = false;
  let trustedReceiptIngested = false;
  let shadowActivated = false;
  let rolloutPaused = Boolean(options.pausedRollout);
  let transitionState = {
    ...governanceTransition,
    status: String(governanceTransition.status),
    policyApprovedAt: null as string | null,
    runtimeApprovedAt: null as string | null,
    currentStep: String(governanceTransition.currentStep),
    oldPolicy: { ...governanceTransition.oldPolicy, retiredAt: null as string | null },
    runtimeSequence: {
      ...governanceTransition.runtimeSequence,
      status: String(governanceTransition.runtimeSequence.status),
      currentStage: String(governanceTransition.runtimeSequence.currentStage),
    },
  };
  const stores = options.allStores ? [store, { id: 2, name: 'Ami 治理验收二店', status: 'active' }] : [store];
  const user = { id: 1, username: 'admin', name: '治理管理员', roles: ['governance_admin'], permissions, deniedPermissions: [], storeIds: stores.map((item) => item.id) };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    const path = url.pathname.replace(/^\/api/, '') || '/';
    if (path === '/auth/user-info') return fulfillJson(route, user);
    if (path === '/stores/accessible' || path === '/stores') return fulfillJson(route, stores);
    if (path === '/brain/conversations' && request.method() === 'GET') {
      return fulfillJson(route, { items: [conversation], total: 1, page: 1, pageSize: 10, storeId: store.id });
    }
    if (path === '/brain/conversations/91/messages' && request.method() === 'GET') {
      return fulfillJson(route, { conversationId: 91, items: traceMessages, total: traceMessages.length, storeId: store.id });
    }
    if (path === '/brain/runs/501/events' && request.method() === 'GET') {
      return fulfillJson(route, { runId: 501, events: traceEvents, storeId: store.id });
    }
    if (path === '/brain/runs/501/actions' && request.method() === 'GET') {
      return fulfillJson(route, { runId: 501, items: [], storeId: store.id });
    }
    if (path === '/brain/feedback/issues' && request.method() === 'GET') {
      return fulfillJson(route, { items: [], total: 0, page: 1, pageSize: 10, storeId: store.id });
    }
    if (path === '/brain/evals/runtime-question-catalog' && request.method() === 'GET') {
      return fulfillJson(route, { items: [], total: 0, page: 1, pageSize: 10, metadata: { total: 0 } });
    }
    if (path === '/brain/governance/overview') return fulfillJson(route, {
      pending: { unclassified: 2, evaluating: 1, pendingApproval: 1, revisionRequired: 0 },
      risk: { low: 2, medium: 1, high: 0, critical: 0, unclassified: 2 },
      whitelist: { not_allowed: 2, pending: 1, approved: 2, suspended: 0, expired: 0 },
      runtimePending: 1,
      latestPolicySnapshot: { id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: 'active', createdAt: '2026-08-01T00:00:00.000Z' },
      runtimeRelease: { id: 416, releaseKey: 'runtime-r416', scope: 'global', rollout: {}, status: 'active', createdAt: '2026-07-22T00:00:00.000Z' },
      runtimeConsistency: 'policy_published_runtime_pending',
      runtimeGovernance: null,
      efficiency: { completed7d: 4, p50DurationMs: 2000, p95DurationMs: 5000, autoAdmissionRate: 0.5, manualOverrideRate: 0.25 },
      runtimeWarmup: {
        state: 'ready', currentPhase: null, latencyMs: 19_345, runtimeReleaseCount: 2, warmedReleaseCount: 2,
        cacheStatus: 'warm', artifactSource: 'persistent',
        phases: { releaseDiscoveryMs: 1996, artifactLookupMs: 17_349, itemFetchMs: 0, definitionPreloadMs: 0, releaseWarmupMs: 0 },
        completedAt: '2026-08-02T08:00:00.000Z', failureCategory: null, failureReason: null,
        performanceTargetMs: 10_000, performanceTargetMet: false,
      },
    });
    if (path === '/brain/governance/runtime/ontology-warmup' && request.method() === 'GET') return fulfillJson(route, {
      state: 'ready', currentPhase: null, startedAt: '2026-08-02T07:59:40.655Z', completedAt: '2026-08-02T08:00:00.000Z',
      latencyMs: 19_345, activeReleaseCount: 2, warmedReleaseCount: 2, cacheStatus: 'warm', artifactSource: 'persistent',
      phases: { releaseDiscoveryMs: 1996, artifactLookupMs: 17_349, itemFetchMs: 0, definitionPreloadMs: 0, releaseWarmupMs: 0 },
      releases: [{ releaseId: 416, releaseStatus: 'active', mode: 'model', definitionVersionIds: [42], capabilityCount: 41, ontologyFingerprint: 'a'.repeat(64), ontologyLatencyMs: 0, capabilityCatalogLatencyMs: 0, latencyMs: 0, artifactSource: 'persistent', artifactBuiltAt: '2026-08-02T07:00:00.000Z' }],
      failureCategory: null, failureReason: null, performanceTargetMs: 10_000, performanceTargetMet: false,
    });
    if (path === '/brain/governance/quality/latency' && request.method() === 'GET') {
      return fulfillJson(route, {
        range: { from: '2026-07-26T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z', cappedSampleSize: 5000 },
        sampleSize: 12,
        metrics: {
          endToEnd: { p50Ms: 22_000, p95Ms: 82_000, averageMs: 31_000, sampleSize: 12, unavailableReason: null },
          firstVisibleAnswer: { p50Ms: 8_000, p95Ms: 31_000, averageMs: 11_000, sampleSize: 10, unavailableReason: null },
          model: { p50Ms: 12_000, p95Ms: 45_000, averageMs: 19_000, sampleSize: 11, unavailableReason: null },
          toolData: { p50Ms: 2_000, p95Ms: 9_000, averageMs: 4_000, sampleSize: 9, unavailableReason: null },
        },
        filters: { providers: ['openai_responses'], models: ['gpt-5.6-terra'], capabilityKeys: ['customer_facts'] },
        daily: [{ date: '2026-08-02', sampleSize: 12, endToEndP50Ms: 22_000, firstVisibleP50Ms: 8_000, modelP50Ms: 12_000, toolDataP50Ms: 2_000 }],
        dataCompleteness: {
          endToEnd: { available: 12, total: 12, rate: 1, unavailableReason: null },
          firstVisibleAnswer: { available: 10, total: 12, rate: 0.83, unavailableReason: null },
          model: { available: 11, total: 12, rate: 0.92, unavailableReason: null },
          toolData: { available: 9, total: 12, rate: 0.75, unavailableReason: null },
          firstVisibleAnswerMode: 'buffered_answer_ready',
          note: '缺失分段显示暂无数据，不以 0 代替。',
        },
      });
    }
    if (path === '/brain/governance/metrics/latency' && request.method() === 'GET') {
      return fulfillJson(route, {
        range: { from: '2026-07-26T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' },
        candidateCount: 1,
        metrics: {
          candidateGate: { p50Ms: 22_000, p95Ms: 22_000, averageMs: 22_000, sampleSize: 1, unavailableReason: null },
          receiptIngest: { p50Ms: 2_000, p95Ms: 2_000, averageMs: 2_000, sampleSize: 1, unavailableReason: null },
          waitingEvidence: { p50Ms: null, p95Ms: null, averageMs: null, sampleSize: 0, unavailableReason: '暂无完整样本' },
          waitingApproval: { p50Ms: 5_000, p95Ms: 5_000, averageMs: 5_000, sampleSize: 1, unavailableReason: null },
          candidateToShadow: { p50Ms: 31_000, p95Ms: 31_000, averageMs: 31_000, sampleSize: 1, unavailableReason: null },
          shadowToFull: { p50Ms: null, p95Ms: null, averageMs: null, sampleSize: 0, unavailableReason: '尚无 Full 接入样本' },
        },
        gateReuse: {
          reused: 1,
          total: 2,
          rate: 0.5,
          avoidedModelInvocations: 1,
          executedModelInvocations: 1,
        },
        taskOutcomes: {
          terminal: 2,
          firstPass: 1,
          retried: 1,
          firstPassRate: 0.5,
          retryRate: 0.5,
        },
      });
    }
    if (path === '/brain/governance/candidates' && request.method() === 'GET') {
      return fulfillJson(route, { items: [governanceCandidate], total: 1, page: 1, pageSize: 50 });
    }
    if (path === '/brain/governance/transitions' && request.method() === 'GET') {
      return fulfillJson(route, { items: options.combinedTransition ? [transitionState] : [], total: options.combinedTransition ? 1 : 0, page: 1, pageSize: 5 });
    }
    if (path === '/brain/governance/transitions/801/validate' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:manage')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      return fulfillJson(route, { transitionId: 801, valid: true, blockers: [] });
    }
    if (path === '/brain/governance/transitions/801/approve-policy' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:publish')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      transitionState = { ...transitionState, policyApprovedAt: '2026-08-04T00:10:00.000Z', currentStep: 'policy_approved' };
      return fulfillJson(route, transitionState);
    }
    if (path === '/brain/governance/transitions/801/approve-runtime' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      transitionState = { ...transitionState, runtimeApprovedAt: '2026-08-04T00:11:00.000Z', status: transitionState.policyApprovedAt ? 'approved' : transitionState.status, currentStep: 'runtime_approved' };
      return fulfillJson(route, transitionState);
    }
    if (path === '/brain/governance/transitions/801/switch' && request.method() === 'POST') {
      if (!permissions.includes('*') && (!permissions.includes('core:brain-governance:publish') || !permissions.includes('core:brain-governance:release'))) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      transitionState = {
        ...transitionState,
        status: 'observing',
        currentStep: 'runtime_shadow_active',
        oldPolicy: { ...transitionState.oldPolicy, retiredAt: '2026-08-04T00:12:00.000Z' },
        runtimeSequence: { ...transitionState.runtimeSequence, status: 'active', currentStage: 'shadow' },
      };
      return fulfillJson(route, transitionState);
    }
    if (path === '/brain/governance/transitions/801/rollback' && request.method() === 'POST') {
      if (!permissions.includes('*') && (!permissions.includes('core:brain-governance:publish') || !permissions.includes('core:brain-governance:release'))) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      transitionState = { ...transitionState, status: 'rolled_back', currentStep: 'rollback_completed' };
      return fulfillJson(route, transitionState);
    }
    if (path === '/brain/governance/rollout-sequences' && request.method() === 'GET') {
      const sequence = rolloutPaused
        ? { ...rolloutSequence, status: 'paused' }
        : options.draftRollout
        ? {
            ...rolloutSequence,
            status: shadowActivated ? 'active' : 'draft',
            currentStage: 'shadow',
            releases: rolloutSequence.releases.map((item) => item.rolloutStage === 'shadow'
              ? { ...item, status: shadowActivated ? 'active' : 'draft' }
              : item),
          }
        : rolloutSequence;
      return fulfillJson(route, { items: [sequence], total: 1, page: 1, pageSize: 20 });
    }
    if (path === '/brain/governance/rollout-sequences/701/validate' && request.method() === 'POST') {
      if (options.draftRollout && !shadowActivated) {
        return fulfillJson(route, { canActivate: true, canPromote: false, blockers: [], observedHealth: null });
      }
      return fulfillJson(route, {
        canActivate: false,
        canPromote: false,
        blockers: ['minimum_sample_size_not_met'],
        observedHealth: {
          status: 'blocked',
          sampleSize: 5,
          minimumSampleSize: 20,
          elapsedMinutes: 12,
          observationMinutes: 30,
          metrics: { errorRate: 0, timeoutRate: 0, permissionViolationCount: 0, negativeFeedbackRate: 0 },
          blockers: ['minimum_sample_size_not_met', 'observation_window_not_met'],
        },
      });
    }
    if (path === '/brain/governance/rollout-sequences/701/activate-shadow' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      shadowActivated = true;
      return fulfillJson(route, { ...rolloutSequence, status: 'active', currentStage: 'shadow' });
    }
    if (path === '/brain/governance/rollout-sequences/701/promote' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) {
        return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      }
      return fulfillJson(route, {
        message: 'rollout_health_not_ready:minimum_sample_size_not_met', // ami-brain-unit-only: mocked rollout response.
      }, 400);
    }
    if (path === '/brain/governance/rollout-sequences/701/pause' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      rolloutPaused = true;
      return fulfillJson(route, { ...rolloutSequence, status: 'paused' });
    }
    if (path === '/brain/governance/rollout-sequences/701/resume' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      rolloutPaused = false;
      return fulfillJson(route, { ...rolloutSequence, status: 'active' });
    }
    if (path === '/brain/governance/rollout-sequences/701/rollback' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      return fulfillJson(route, { ...rolloutSequence, status: 'rolled_back' });
    }
    if (path === '/brain/governance/capability-policies' && request.method() === 'GET') {
      const riskLevel = url.searchParams.get('riskLevel');
      if (options.delayCapabilityFilters) {
        await new Promise((resolve) => setTimeout(resolve, riskLevel === 'medium' ? 250 : riskLevel === 'high' ? 20 : 0));
      }
      const item = riskLevel === 'high'
        ? highRiskPolicy
        : options.lowRiskAutoAdmission
          ? {
              ...lowRiskPolicy,
              policy: {
                ...lowRiskPolicy.policy,
                whitelistStatus: trustedReceiptIngested ? 'approved' : 'pending',
                evidence: trustedReceiptIngested ? [{ receiptId: 'receipt-ci-1', expiresAt: '2099-08-03T00:00:00.000Z' }] : [],
              },
            }
          : capabilityPolicy;
      return fulfillJson(route, { items: [item], total: 1, page: 1, pageSize: 20 });
    }
    if (path === '/brain/governance/capability-policies/customer_facts' && request.method() === 'GET') {
      const current = options.lowRiskAutoAdmission
        ? {
            ...lowRiskPolicy,
            policy: {
              ...lowRiskPolicy.policy,
              whitelistStatus: trustedReceiptIngested ? 'approved' : 'pending',
              evidence: trustedReceiptIngested ? [{ receiptId: 'receipt-ci-1', expiresAt: '2099-08-03T00:00:00.000Z' }] : [],
            },
          }
        : capabilityPolicy;
      return fulfillJson(route, { current, history: [current], evidence: current.policy.evidence });
    }
    if (path === '/brain/governance/capability-policies/high_risk_alert' && request.method() === 'GET') {
      return fulfillJson(route, { current: highRiskPolicy, history: [highRiskPolicy], evidence: highRiskPolicy.policy.evidence });
    }
    if (path === '/brain/governance/capability-policies/customer_facts/approve' && request.method() === 'POST') {
      // ami-brain-unit-only: mocked HTTP authorization response, not a product question.
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:approve')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      return fulfillJson(route, { ...capabilityPolicy, policy: { ...capabilityPolicy.policy, whitelistStatus: 'approved' } });
    }
    if (path === '/brain/governance/tasks') {
      if (!options.evidenceRecovery) return fulfillJson(route, { items: [], total: 0, page: 1, pageSize: 20 });
      const item = trustedReceiptIngested
        ? {
            ...waitingEvidenceTask,
            status: 'approved',
            blockerType: 'none',
            blockerCode: null,
            resolutionType: null,
            result: { admission: 'approved', receiptId: 'receipt-ci-1' },
            completedAt: '2026-08-01T00:05:00.000Z',
          }
        : waitingEvidenceTask;
      return fulfillJson(route, { items: [item], total: 1, page: 1, pageSize: 20 });
    }
    if (path === '/brain/governance/internal/gate-receipts' && request.method() === 'POST') {
      if (request.headers()['x-brain-receipt-signature'] !== 'valid-machine') {
        return fulfillJson(route, { message: 'receipt_signature_invalid' }, 401); // ami-brain-unit-only: mocked machine-ingest rejection.
      }
      trustedReceiptIngested = true;
      return fulfillJson(route, {
        id: 301,
        receiptKey: 'receipt-ci-1',
        status: 'passed',
        stage: 'candidate',
        trustLevel: 'trusted_candidate',
        rescheduledTaskIds: options.evidenceRecovery ? [waitingEvidenceTask.id] : [],
      });
    }
    if (path === '/brain/governance/roles' && request.method() === 'GET') return fulfillJson(route, { items: [governanceRole] });
    if (path === '/brain/governance/memories' && request.method() === 'GET') return fulfillJson(route, { items: [governanceMemory], total: 1 });
    if (path === '/brain/governance/memories/71/revisions' && request.method() === 'GET') {
      return fulfillJson(route, { items: [{ id: 711, memoryId: 71, revisionType: 'created', nextContent: governanceMemory.content, reason: '初始记忆', createdAt: governanceMemory.createdAt }], total: 1 });
    }
    if (path === '/brain/governance/evals/runs' && request.method() === 'GET') return fulfillJson(route, { items: [governanceEvalRun] });
    if (path === '/brain/inspections/findings' && request.method() === 'GET') return fulfillJson(route, { items: [governanceFindingSummary], total: 1, page: 1, pageSize: 20 });
    if (path === '/brain/inspections/findings/91' && request.method() === 'GET') return fulfillJson(route, governanceFinding);
    if (path === '/brain/governance/inspection-rules' && request.method() === 'GET') {
      return fulfillJson(route, { items: [{ id: 92, ruleKey: governanceFinding.ruleKey, version: 2, status: 'active', name: '库存安全线' }] });
    }
    if (path === '/brain/governance/skill-versions' && request.method() === 'GET') return fulfillJson(route, { items: [skillSummary] });
    if (path === '/brain/governance/skills' && request.method() === 'GET') return fulfillJson(route, { items: [legacyDisabledSkill] });
    if (path === '/brain/governance/resource-versions' && request.method() === 'GET') {
      if (url.searchParams.get('resourceKey') === skillSummary.skillKey) {
        return fulfillJson(route, { items: [{
          id: skillSummary.versionId,
          resourceType: 'skill',
          resourceKey: skillSummary.skillKey,
          version: skillSummary.version,
          status: 'active',
          snapshot: { ...legacyDisabledSkill, skillKey: skillSummary.skillKey, name: skillSummary.name, enabled: true },
          createdAt: '2026-08-01T00:00:00.000Z',
        }] });
      }
      return fulfillJson(route, { items: [] });
    }
    if (path === '/brain/inspections/inbox' && request.method() === 'GET') {
      return fulfillJson(route, {
        items: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        storeId: store.id,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    }
    if (path === '/brain/governance/policy-snapshots' && request.method() === 'GET') {
      return fulfillJson(route, { items: [{ id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: policyPublished ? 'active' : 'draft', previousReleaseId: 6, createdAt: '2026-08-01T00:00:00.000Z', items: [capabilityPolicy] }], total: 1, page: 1, pageSize: 20 });
    }
    if (path === '/brain/governance/policy-snapshots/preview' && request.method() === 'POST' && options.reusePolicy) {
      return fulfillJson(route, {
        decision: 'reuse_active',
        candidateKey: governanceCandidate.candidateKey,
        activeSnapshotId: 7,
        snapshotId: 7,
        affectedCapabilities: ['customer_facts'],
        blockers: [],
        diff: { added: [], changed: [], removed: [], unchanged: ['customer_facts'] },
      });
    }
    if (path.startsWith('/brain/governance/candidates/') && path.endsWith('/prepare-policy') && request.method() === 'POST' && options.reusePolicy) {
      return fulfillJson(route, {
        decision: 'reuse_active',
        candidateKey: governanceCandidate.candidateKey,
        activeSnapshotId: 7,
        snapshotId: 7,
        affectedCapabilities: ['customer_facts'],
        blockers: [],
        diff: { added: [], changed: [], removed: [], unchanged: ['customer_facts'] },
      });
    }
    if (path === '/brain/governance/policy-snapshots/7/publish' && request.method() === 'POST') {
      // ami-brain-unit-only: mocked HTTP authorization response, not a product question.
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:publish')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      policyPublished = true;
      return fulfillJson(route, { id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: 'active', createdAt: '2026-08-01T00:00:00.000Z', items: [capabilityPolicy] });
    }
    if (path === '/brain/governance/releases' && request.method() === 'GET') {
      return fulfillJson(route, { items: [runtimeDraftRelease, runtimeActiveRelease] });
    }
    if (path === '/brain/governance/regeneration-jobs' && request.method() === 'GET') {
      return fulfillJson(route, { items: [] });
    }
    if (path === '/brain/governance/releases/501/activate' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      return fulfillJson(route, { ...runtimeDraftRelease, status: 'active' });
    }
    if (path === '/brain/governance/releases/713/activate' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      return fulfillJson(route, { message: 'rollout_sequence_release_requires_sequence_transition' }, 400); // ami-brain-unit-only: mocked sequence bypass rejection.
    }
    if (path === '/brain/governance/releases/501/reject' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      return fulfillJson(route, { ...runtimeDraftRelease, status: 'archived' });
    }
    if (path === '/brain/governance/releases/416/rollback-to-rules' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:release')) return fulfillJson(route, { message: 'Forbidden' }, 403); // ami-brain-unit-only: mocked permission response.
      return fulfillJson(route, { ...runtimeActiveRelease, status: 'rolled_back' });
    }
    return fulfillJson(route, { items: [], total: 0, page: 1, pageSize: 20 });
  });
  await page.addInitScript(() => window.localStorage.setItem('token', 'token-governance-e2e'));
}

test('governance overview opens a URL-restorable pending approval filter', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 746 });
  await installGovernanceMocks(page, ['*']);
  await page.goto('/brain-governance');
  await expect(page.getByRole('heading', { name: '治理总览' })).toBeVisible();
  await expect(page.getByLabel('治理界面模式')).toContainText('Manage 管理');
  await expect(page.getByLabel('治理界面模式')).toContainText('环境变量显式配置');
  await expect(page.getByRole('link', { name: '治理工作台' })).toBeVisible();
  await expect(page.getByRole('link', { name: '质量中心' })).toBeVisible();
  await expect(page.getByRole('link', { name: '治理策略与运行版本' })).toBeVisible();
  await expect(page.getByRole('link', { name: '技能治理' })).toHaveCount(0);
  await expect(page.getByText('策略已发布，运行待接入')).toBeVisible();
  await expect(page.getByText('19.3 秒', { exact: true })).toBeVisible();
  await expect(page.getByText('运行阶段快照')).toBeVisible();
  await expect(page.getByText('2/2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看详情' }).click();
  await expect(page.getByRole('heading', { name: 'Ontology 运行准备详情' })).toBeVisible();
  await expect(page.getByText('17.3 秒')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /待审批/ }).click();
  await expect(page).toHaveURL(/\/brain-governance\/workbench\?tab=tasks&status=pending_approval$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('combined transition keeps GP and RT identities separate and hides validation from view-only users', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view'], { combinedTransition: true });
  await page.goto('/brain-governance');

  await expect(page.getByText('GP-003 · Query Only V1 强制治理策略')).toBeVisible();
  await expect(page.getByText('RT-001 · Query Only V1', { exact: true })).toBeVisible();
  await expect(page.getByText(/旧策略：GP-002 · Legacy Shadow Policy · 当前策略/)).toBeVisible();
  await expect(page.getByText(/旧运行：LEGACY-RT-416 · Production Baseline · 当前运行版本/)).toBeVisible();
  await expect(page.getByText('33 项 approved + enforced')).toBeVisible();
  await expect(page.getByText('8 项 not_allowed + enforced')).toBeVisible();
  await expect(page.getByRole('button', { name: '组合校验' })).toHaveCount(0);
});

test('combined transition validation requires manage permission and remains separate from GP and RT approval', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage'], { combinedTransition: true });
  await page.goto('/brain-governance');

  await page.getByRole('button', { name: '组合校验' }).click();
  await expect(page.getByText('治理策略与运行版本组合校验已完成')).toBeVisible();
  await expect(page.getByRole('button', { name: '审批 GP' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '审批 RT' })).toHaveCount(0);
});

test('combined transition is the only default GP/RT activation path and completes separate approvals before switching', async ({ page }) => {
  await installGovernanceMocks(page, [
    'core:brain-governance:view',
    'core:brain-governance:manage',
    'core:brain-governance:publish',
    'core:brain-governance:release',
  ], { combinedTransition: true });
  await page.goto('/brain-governance');

  await page.getByRole('button', { name: '审批 GP' }).click();
  await expect(page.getByText('治理策略已审批')).toBeVisible();
  await page.getByRole('button', { name: '审批 RT' }).click();
  await expect(page.getByText('运行版本已审批')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '组合切换' }).click();
  await expect(page.getByText('新治理策略与运行版本 Shadow 已组合生效')).toBeVisible();
  await expect(page.getByText(/已退役，保留组合回滚身份/)).toBeVisible();
  await expect(page.getByText(/回滚备用，不接收新组合正常流量/)).toBeVisible();
  await expect(page.getByRole('button', { name: '组合回滚' })).toBeVisible();

  await page.goto('/brain-governance/releases?tab=policy');
  await expect(page.getByRole('button', { name: '发布策略' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '准备策略' })).toHaveCount(0);
  await page.getByRole('tab', { name: '运行版本（RT）' }).click();
  await expect(page.getByRole('button', { name: /创建运行版本/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /校验并激活 Shadow/ })).toHaveCount(0);
});

test('low-risk trusted receipt is machine-ingested and becomes automatically admitted', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage'], { lowRiskAutoAdmission: true });
  await page.goto('/brain-governance/workbench?tab=capabilities&riskLevel=low');
  const capabilityRow = page.getByRole('row').filter({ hasText: 'customer_facts' });
  await expect(capabilityRow).toContainText('低风险');
  await expect(capabilityRow).toContainText('缺失');
  await expect(page.getByRole('button', { name: /上传.*Receipt|可信 Receipt/ })).toHaveCount(0);

  const ingestStatus = await page.evaluate(async () => (await fetch('/api/brain/governance/internal/gate-receipts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-brain-receipt-issuer': 'CI/CD',
      'x-brain-receipt-timestamp': '2026-08-02T00:00:00.000Z',
      'x-brain-receipt-signature': 'valid-machine',
    },
    body: JSON.stringify({ schemaVersion: 3, receiptId: 'receipt-ci-1' }),
  })).status);
  expect(ingestStatus).toBe(200);

  await page.reload();
  await expect(capabilityRow).toContainText('已准入');
  await expect(capabilityRow).toContainText('1 份');
});

test('missing trusted evidence waits for CI and automatically recovers after receipt ingestion', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage'], { evidenceRecovery: true });
  await page.goto('/brain-governance/workbench?tab=tasks');
  await expect(page.getByText(/等待 CI 可信证据/)).toBeVisible();
  await expect(page.getByText(/ami-brain-governance · dddddddddd/)).toBeVisible();
  await expect(page.getByText('所需 Gate：brain_contract、cross_client_contract')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试系统任务' })).toHaveCount(0);

  const ingestStatus = await page.evaluate(async () => (await fetch('/api/brain/governance/internal/gate-receipts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-brain-receipt-issuer': 'CI/CD',
      'x-brain-receipt-timestamp': '2026-08-02T00:00:00.000Z',
      'x-brain-receipt-signature': 'valid-machine',
    },
    body: JSON.stringify({ schemaVersion: 3, receiptId: 'receipt-ci-1' }),
  })).status);
  expect(ingestStatus).toBe(200);

  await page.reload();
  const recoveredTask = page.locator('[data-slot="card"]').filter({ hasText: '#101 · evaluate' });
  await expect(page.getByText(/等待 CI 可信证据/)).toHaveCount(0);
  await expect(recoveredTask).toContainText('已准入');
  await expect(recoveredTask).toContainText('尝试 0/3');
});

test('medium-risk capability approval uses the dedicated approve permission', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:approve']);
  await page.goto('/brain-governance/workbench?tab=capabilities&riskLevel=medium');
  await expect(page.getByText('customer_facts')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('证据完整，批准预览准入'));
  await page.getByRole('button', { name: '审批准入' }).click();
  await expect(page.getByText('能力策略已审批')).toBeVisible();
});

test('high-risk capability exposes governance approval only and never an execution whitelist', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:approve']);
  await page.goto('/brain-governance/workbench?tab=capabilities&riskLevel=high&selectedId=high_risk_alert');
  await expect(page.getByRole('heading', { name: 'high_risk_alert' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('禁止普通执行白名单');
  await expect(page.getByRole('button', { name: '治理审批' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '审批准入' })).toHaveCount(0);
});

test('policy tab keeps candidate diff preview read-only and routes mutations to the combined transition', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage'], { reusePolicy: true });
  await page.goto(`/brain-governance/releases?tab=policy&candidateKey=${encodeURIComponent(governanceCandidate.candidateKey)}`);
  await expect(page.getByLabel('Candidate')).toHaveValue(governanceCandidate.candidateKey);
  await page.getByRole('button', { name: '预览 diff' }).click();
  await expect(page.getByText('无策略差异，可由组合向导复用当前快照')).toBeVisible();
  await expect(page.getByText('未变')).toBeVisible();
  await expect(page.getByRole('button', { name: '准备策略' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发布策略' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '前往组合切换' })).toBeVisible();
});

test('governance policy snapshots never publish independently from the default UI', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:publish']);
  await page.goto('/brain-governance/releases?tab=policy');
  await expect(page.getByText(/默认页面不再单独发布或回滚 GP/)).toBeVisible();
  await expect(page.getByRole('button', { name: '发布策略' })).toHaveCount(0);
});

test('permission rejection hides approval/publish controls and backend mock returns 403', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage']);
  await page.goto('/brain-governance/workbench?tab=capabilities');
  await expect(page.getByText('customer_facts')).toBeVisible();
  await expect(page.getByRole('button', { name: '审批准入' })).toHaveCount(0);
  const status = await page.evaluate(async () => (await fetch('/api/brain/governance/capability-policies/customer_facts/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'approve', reason: 'unauthorized' }),
  })).status);
  expect(status).toBe(403);
  await page.goto('/brain-governance/releases?tab=policy');
  await expect(page.getByRole('button', { name: '发布策略' })).toHaveCount(0);

  const receiptStatus = await page.evaluate(async () => (await fetch('/api/brain/governance/internal/gate-receipts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 3, receiptId: 'human-forged-receipt' }),
  })).status);
  expect(receiptStatus).toBe(401);
});

test('legacy governance URLs redirect to the consolidated workspace without losing filters', async ({ page }) => {
  await installGovernanceMocks(page, ['*']);
  await page.goto('/brain-governance/capabilities?riskLevel=medium&runtimeStatus=pending_runtime');
  await expect(page).toHaveURL(/\/brain-governance\/workbench\?/);
  await expect.poll(() => new URL(page.url()).searchParams.get('candidateKey'))
    .toBe('ami/beauty-salon-admin:candidate-head:candidate-merge-base');
  const redirectedUrl = new URL(page.url());
  expect(redirectedUrl.searchParams.get('tab')).toBe('capabilities');
  expect(redirectedUrl.searchParams.get('riskLevel')).toBe('medium');
  expect(redirectedUrl.searchParams.get('runtimeStatus')).toBe('pending_runtime');
  expect(redirectedUrl.searchParams.get('candidateKey')).toBe('ami/beauty-salon-admin:candidate-head:candidate-merge-base');
  expect(redirectedUrl.searchParams.get('affectedOnly')).toBe('true');
  await expect(page.getByText('customer_facts')).toBeVisible();
  const routeEvents = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('ami-brain-governance-legacy-route-events') ?? '[]'));
  expect(routeEvents).toEqual(expect.arrayContaining([expect.objectContaining({ sourceRoute: '/brain-governance/capabilities', accessMode: 'redirect' })]));

  await page.goto('/brain-governance/release');
  await expect(page).toHaveURL(/\/brain-governance\/releases\?tab=runtime$/);

  await page.goto('/brain-governance/planning');
  await expect(page).toHaveURL(/\/brain\?panel=trace$/);
  await expect(page.getByRole('tab', { name: '运行轨迹' })).toHaveAttribute('aria-selected', 'true');
});

test('legacy Skill governance redirects into the capability workspace and keeps read-only debugging', async ({ page }) => {
  await installGovernanceMocks(page, ['*']);
  await page.goto('/brain-governance/skills');
  await expect(page).toHaveURL(/\/brain-governance\/workbench\?tab=capabilities&panel=skills$/);
  await expect(page.getByText('Skill 注册与版本')).toBeVisible();
  await expect(page.getByText('预约空档查询', { exact: true })).toBeVisible();
  await expect(page.getByText('历史停用技能')).toBeVisible();
  await expect(page.getByText('待纳管 1')).toBeVisible();
  await page.getByRole('button', { name: '纳管配置' }).click();
  await expect(page.getByRole('dialog')).toContainText('编辑 legacy_disabled_skill');
  await expect(page.getByRole('dialog')).toContainText('保存后创建下一草稿版本，不会直接修改当前生效版本');
  await page.getByRole('button', { name: '取消' }).click();
  await page.getByRole('row').filter({ hasText: 'appointment_gap_list' }).getByRole('button', { name: '调试' }).click();
  await expect(page).toHaveURL(/\/brain\?question=.*&debugSkill=appointment_gap_list$/);
});

test('legacy planning opens a complete runtime trace with explicit duration units', async ({ page }) => {
  await installGovernanceMocks(page, ['*']);
  await page.goto('/brain-governance/planning');
  await expect(page).toHaveURL(/\/brain\?panel=trace$/);
  await expect(page.getByText('问答耗时 22秒')).toBeVisible();
  await expect(page.getByText('LEGACY-RT-416 · Production Baseline', { exact: true })).toBeVisible();
  await expect(page.getByText(/语义版本 intent-v3/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '预约空档查询' })).toBeVisible();
  await expect(page.getByText(/入选依据：intent、entity\.reservation、metric\.appointment_count/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '执行 DAG' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'draft_follow_up' })).toBeVisible();
  await expect(page.getByText('业务结果')).toBeVisible();
  await expect(page.getByText('完整完成')).toBeVisible();
});

test('quality latency uses explicit duration units and remains responsive at desktop and mobile sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 746 });
  await installGovernanceMocks(page, ['core:brain-governance:view']);
  await page.goto('/brain-governance/quality?tab=latency');
  await expect(page.getByRole('heading', { name: '问答耗时' })).toBeVisible();
  await expect(page.getByText('P50 22 秒')).toBeVisible();
  await expect(page.getByText('P95 1 分 22 秒')).toBeVisible();
  await expect(page.getByText('22:41')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText('P50 22 秒')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('runtime release controls require the dedicated release permission', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage']);
  await page.goto('/brain-governance/releases?tab=runtime');
  await expect(page.getByRole('heading', { name: 'RT-001 · Query Only V1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /按真实观察晋级/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /暂停/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /回滚/ })).toHaveCount(0);
  const status = await page.evaluate(async () => (await fetch('/api/brain/governance/rollout-sequences/701/promote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })).status);
  expect(status).toBe(403);
});

test('runtime release permission exposes approve, reject and rollback without widening manage', async ({ page }) => {
  await installGovernanceMocks(page, [
    'core:brain-governance:view',
    'core:brain-governance:manage',
    'core:brain-governance:release',
  ]);
  await page.goto('/brain-governance/releases?tab=runtime');
  await expect(page.getByRole('button', { name: /按真实观察晋级/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /暂停/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /回滚/ })).toBeVisible();
});

test('paused rollout sequence can resume or roll back instead of becoming an operational dead end', async ({ page }) => {
  await installGovernanceMocks(page, [
    'core:brain-governance:view',
    'core:brain-governance:release',
  ], { pausedRollout: true });
  await page.goto('/brain-governance/releases?tab=runtime');
  await expect(page.getByRole('button', { name: '恢复' })).toBeVisible();
  await expect(page.getByRole('button', { name: '回滚' })).toBeVisible();
  await page.getByRole('button', { name: '恢复' }).click();
  await expect(page.getByText('灰度序列已恢复')).toBeVisible();
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible();
});

test('draft rollout sequence returns to the combined transition for first Shadow activation', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:release'], { draftRollout: true });
  await page.goto('/brain-governance/releases?tab=runtime');
  await expect(page.getByRole('button', { name: /校验并激活 Shadow/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回组合切换激活 Shadow' })).toBeVisible();
  await page.getByRole('button', { name: /校验当前阶段/ }).click();
  await expect(page.getByText('当前阶段校验通过')).toBeVisible();
  await page.getByRole('button', { name: '返回组合切换激活 Shadow' }).click();
  await expect(page).toHaveURL(/\/brain-governance\/workbench\?tab=overview$/);
});

test('rollout promotion uses server-observed health and rejects insufficient observation evidence', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:release']);
  await page.goto('/brain-governance/releases?tab=runtime');
  await expect(page.getByLabel(/错误率|超时率|权限异常/)).toHaveCount(0);
  await page.getByRole('button', { name: /校验当前阶段/ }).click();
  await expect(page.getByText('服务端真实观察：暂不可晋级')).toBeVisible();
  await expect(page.getByText('样本 5/20')).toBeVisible();
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/brain/governance/rollout-sequences/701/promote'));
  await page.getByRole('button', { name: /按真实观察晋级/ }).click();
  const promoteRequest = await requestPromise;
  expect(promoteRequest.postDataJSON()).toEqual({});
  await expect(page.getByText(/当前不可晋级：minimum_sample_size_not_met/)).toBeVisible();
});

test('sequence-owned releases reject direct activation and cannot skip rollout stages', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:release']);
  await page.goto('/brain-governance/releases?tab=runtime');
  await expect(page.getByRole('heading', { name: 'RT-001 · Query Only V1' })).toBeVisible();
  const response = await page.evaluate(async () => {
    const result = await fetch('/api/brain/governance/releases/713/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return { status: result.status, body: await result.json() };
  });

  expect(response).toEqual({
    status: 400,
    // ami-brain-unit-only: mocked rollout contract error, not an Ami Brain product question.
    body: { message: 'rollout_sequence_release_requires_sequence_transition' },
  });
});

test('view-only governance users can inspect roles, memories, evals and findings without mutation controls', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view']);

  await page.goto('/brain-governance/settings?tab=roles');
  await expect(page.getByText('店长经营专家')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建角色' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '配置店长经营专家' })).toHaveCount(0);

  await page.goto('/brain-governance/settings?tab=memory');
  await expect(page.getByText('customer.preference.71')).toBeVisible();
  await expect(page.getByRole('button', { name: '纠正记忆' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '删除记忆' })).toHaveCount(0);
  await page.getByRole('button', { name: '查看版本记录' }).click();
  await expect(page.getByText(/初始记忆/)).toBeVisible();

  await page.goto('/brain-governance/quality?tab=eval');
  await expect(page.getByText('Eval Run #81').first()).toBeVisible();
  await expect(page.getByText('EV-001 · Query Only V1 评测')).toBeVisible();
  await expect(page.getByText('目标评测快照数据库记录 #416').locator('..')).not.toHaveAttribute('open');
  await expect(page.getByRole('button', { name: '发起评测' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复测失败' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '逐题结果' })).toBeVisible();

  await page.goto('/brain-governance/workbench?tab=inspection');
  await expect(page.getByText('库存低于安全线')).toBeVisible();
  await expect(page.getByText('已记录 1 项证据、1 项建议')).toBeVisible();
  await expect(page.getByText(/"stock"/)).toHaveCount(0);
  await page.getByRole('button', { name: '查看详情' }).click();
  await expect(page.getByRole('dialog')).toContainText('"stock"');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '立即巡检' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '审查' })).toHaveCount(0);
  await page.getByRole('button', { name: '规则版本' }).click();
  await expect(page.getByRole('cell', { name: 'inventory.low_stock', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存新版本' })).toHaveCount(0);
});

test('all-stores quality detail waits for a store selection before sending scoped requests', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view'], { allStores: true });
  const scopedRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/brain/governance/semantic')) scopedRequests.push(request.url());
  });
  await page.goto('/brain-governance/quality?tab=semantic');
  await expect(page.getByRole('heading', { name: '请先选择一个门店' })).toBeVisible();
  await expect(page.getByText(/选择门店后才会发送请求/)).toBeVisible();
  expect(scopedRequests).toEqual([]);
});

test('all-stores inspection waits for a store selection before loading findings', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view'], { allStores: true });
  const scopedRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/brain/inspections/findings')) scopedRequests.push(request.url());
  });
  await page.goto('/brain-governance/workbench?tab=inspection');
  await expect(page.getByRole('heading', { name: '请先选择一个门店' })).toBeVisible();
  await expect(page.getByText(/选择门店后才会发送请求/)).toBeVisible();
  expect(scopedRequests).toEqual([]);
});

test('capability detail is restored from selectedId and closing it preserves filters', async ({ page }) => {
  await installGovernanceMocks(page, ['*']);
  await page.goto('/brain-governance/workbench?tab=capabilities&riskLevel=medium&selectedId=customer_facts');
  await expect(page.getByRole('dialog')).toContainText('customer_facts');
  await expect(page.getByRole('dialog')).toContainText('中风险');
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('customer_facts');
  await page.keyboard.press('Escape');
  await expect.poll(() => {
    const url = new URL(page.url());
    return {
      tab: url.searchParams.get('tab'),
      riskLevel: url.searchParams.get('riskLevel'),
      candidateKey: url.searchParams.get('candidateKey'),
      affectedOnly: url.searchParams.get('affectedOnly'),
      selectedId: url.searchParams.get('selectedId'),
    };
  }).toEqual({
    tab: 'capabilities',
    riskLevel: 'medium',
    candidateKey: governanceCandidate.candidateKey,
    affectedOnly: 'true',
    selectedId: null,
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('rapid capability filter changes keep the newest result', async ({ page }) => {
  await installGovernanceMocks(page, ['*'], { delayCapabilityFilters: true });
  await page.goto('/brain-governance/workbench?tab=capabilities');
  const risk = page.getByLabel('风险');
  await risk.selectOption('medium');
  await risk.selectOption('high');
  await expect(page).toHaveURL(/riskLevel=high/);
  await expect(page.getByText('high_risk_alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '审批准入' })).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(page.getByText('high_risk_alert')).toBeVisible();
  await expect(page.getByText('customer_facts')).toHaveCount(0);
});

test('legacy diagnostic storage failure never blocks redirect navigation', async ({ page }) => {
  await installGovernanceMocks(page, ['*']);
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (this === window.sessionStorage && key === 'ami-brain-governance-legacy-route-events') {
        throw new Error('diagnostic storage unavailable');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await page.goto('/brain-governance/capabilities?riskLevel=medium');
  await expect(page).toHaveURL(/\/brain-governance\/workbench\?/);
  await expect.poll(() => new URL(page.url()).searchParams.get('candidateKey'))
    .toBe('ami/beauty-salon-admin:candidate-head:candidate-merge-base');
  const redirectedUrl = new URL(page.url());
  expect(redirectedUrl.searchParams.get('tab')).toBe('capabilities');
  expect(redirectedUrl.searchParams.get('riskLevel')).toBe('medium');
  expect(redirectedUrl.searchParams.get('candidateKey')).toBe('ami/beauty-salon-admin:candidate-head:candidate-merge-base');
  expect(redirectedUrl.searchParams.get('affectedOnly')).toBe('true');
  await expect(page.getByText('customer_facts')).toBeVisible();
});

test('compact governance containers do not overflow a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installGovernanceMocks(page, ['*']);
  await page.goto('/brain-governance/workbench?tab=overview');
  await expect(page.getByRole('heading', { name: '治理总览' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
