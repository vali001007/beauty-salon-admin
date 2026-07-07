import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AgentGovernanceCenter } from './AgentGovernanceCenter';

const api = vi.hoisted(() => ({
  createAgentKnowledgeGraphExclude: vi.fn(),
  createAgentKnowledgeGraphSynonym: vi.fn(),
  createAgentV2GrayRule: vi.fn(),
  deleteAgentKnowledgeGraphExclude: vi.fn(),
  deleteAgentKnowledgeGraphSynonym: vi.fn(),
  deleteAgentV2GrayRule: vi.fn(),
  debugAgentGovernanceCompare: vi.fn(),
  debugAgentGovernanceExecute: vi.fn(),
  dryRunAgentV2TextToSql: vi.fn(),
  getAgentCapabilityDrafts: vi.fn(),
  getAgentCapabilityManifestVersions: vi.fn(),
  getAgentToolQueryKeys: vi.fn(),
  getAgentGovernanceAutoPublishLog: vi.fn(),
  getAgentGovernanceAutoPublishLogs: vi.fn(),
  getAgentGovernanceCapabilityHealth: vi.fn(),
  getAgentGovernanceCapabilityHeatMap: vi.fn(),
  getAgentGovernanceEvalCases: vi.fn(),
  getAgentGovernanceEvalRunHistory: vi.fn(),
  getAgentGovernanceEvalRunFailures: vi.fn(),
  getAgentGovernanceEvalRuns: vi.fn(),
  getAgentGovernanceHealth: vi.fn(),
  getAgentGovernanceRunDetail: vi.fn(),
  getAgentGovernanceRuns: vi.fn(),
  getAgentGovernanceRunStats: vi.fn(),
  getAgentGovernanceUncoveredTop: vi.fn(),
  getAgentV2GrayRules: vi.fn(),
  getAgentKnowledgeGraphGaps: vi.fn(),
  getAgentKnowledgeGraphExcludes: vi.fn(),
  getAgentKnowledgeGraphNode: vi.fn(),
  getAgentKnowledgeGraphNodes: vi.fn(),
  getAgentKnowledgeGraphPath: vi.fn(),
  getAgentKnowledgeGraphSummary: vi.fn(),
  getAgentKnowledgeGraphSynonyms: vi.fn(),
  getAgentKnowledgeGraphVisualize: vi.fn(),
  getAgentV2TextToSqlCandidates: vi.fn(),
  getAgentV2TextToSqlRun: vi.fn(),
  getAgentV2TextToSqlRuns: vi.fn(),
  getAgentV2TextToSqlSemanticViews: vi.fn(),
  getAgentV2TextToSqlStatus: vi.fn(),
  importLatestAgentGovernanceEvalRun: vi.fn(),
  inspectAgentV2TextToSqlGuard: vi.fn(),
  promoteAgentV2TextToSqlCandidate: vi.fn(),
  promoteAgentV2TextToSqlRun: vi.fn(),
  replayAgentGovernanceEvalRunFailure: vi.fn(),
  runAgentGovernanceEvalDryRunBatch: vi.fn(),
  simulateAgentGovernanceManifest: vi.fn(),
}));

vi.mock('@/api', () => api);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function listResult<T>(items: T[], pageSize = 20) {
  return { items, total: items.length, page: 1, pageSize };
}

function renderAgentGovernanceCenter(initialEntries = ['/system/agent-governance']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AgentGovernanceCenter />
    </MemoryRouter>,
  );
}

describe('AgentGovernanceCenter', () => {
  it('opens the matching tab from governance child routes', () => {
    renderAgentGovernanceCenter(['/system/agent-governance/debug']);

    expect(screen.getByRole('tab', { name: '单题调试' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByLabelText('调试问题')).toHaveValue('哪些客户买了次卡但最近一直不来用');
  });

  it('loads overview and gray-rule governance smoke data', async () => {
    const now = '2026-07-05T14:42:00.000Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 12,
      byStatus: { completed: 12 },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3576,
      edgeCount: 4109,
      nodeCountsByType: {},
      edgeCountsByType: {},
      businessObjectCount: 15,
      dataModelCount: 131,
      activeCapabilityCount: 34,
      permissionCodeCount: 79,
      passed: true,
      blockerCount: 0,
      warningCount: 4,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 12, completed: 12, failed: 0, successRate: 1, byStatus: { completed: 12 }, runLatencyP99Ms: 320, latencySampleCount: 12 },
      tools: { total: 6, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: 110, latencySampleCount: 6 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 12 }, byFinalEngine: { kg_llm: 12 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 12 },
      cache: { status: 'measured', hitRate: 0.75, sampleCount: 12 },
      cost: { status: 'measured', sampleCount: 2, totalTokens: 1500, promptTokens: 1200, completionTokens: 300, totalChars: 4200, estimatedUsd: 0.0123, source: 'llm_cost_trace' },
      eval: { total: 1, byStatus: { passed: 1 } },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'v-local-smoke',
      total: 34,
      enabled: 34,
      disabled: 0,
      byReleaseStrategy: { auto_publish: 28, approval_required: 6 },
      byRiskLevel: { low: 28, medium: 6 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: true, totalQuestions: 650, p0Questions: 103 },
      metrics: { p0Accuracy: 1, highRiskAutoPublish: 0 },
      gates: [],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([], 5));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([]);
    api.getAgentV2GrayRules.mockResolvedValue(listResult([
      {
        id: 1,
        name: '本地 smoke 灰度',
        mode: 'kg_llm_preferred',
        status: 'active',
        priority: 10,
        storeIds: [],
        personaCodes: ['manager'],
        roles: [],
        entrypoints: ['agent_governance_debug'],
        capabilityIds: ['card.package.inactive-customers.list'],
        scopeSummary: 'manager / card.package.inactive-customers.list',
        reason: '本地 smoke',
        source: 'governance_config',
        createdAt: now,
        updatedAt: now,
      },
    ], 12));

    renderAgentGovernanceCenter();

    expect(await screen.findByRole('heading', { name: 'AI 治理中心' })).toBeInTheDocument();
    expect(await screen.findByText('7天运行数')).toBeInTheDocument();
    expect(screen.getByText('成本观测')).toBeInTheDocument();
    expect(screen.getByText('$0.0123')).toBeInTheDocument();
    expect(screen.getByText('待审核能力')).toBeInTheDocument();
    expect(screen.getByText('图谱缺口')).toBeInTheDocument();
    expect(screen.getByText('高风险自动执行')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('tab', { name: '灰度规则' }));

    expect(await screen.findByText('本地 smoke 灰度')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('规则名称，例如：次卡问数新链路优先')).toBeInTheDocument();
    await waitFor(() => expect(api.getAgentV2GrayRules).toHaveBeenCalledWith({
      page: 1,
      pageSize: 12,
      status: 'active',
      mode: 'all',
    }));
  });

  it('shows capability governance local closure from candidate pool, manifests, query keys and auto publish logs', async () => {
    const now = '2026-07-06T05:24:00.000Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 6,
      byStatus: { completed: 6 },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3576,
      edgeCount: 4109,
      nodeCountsByType: {},
      edgeCountsByType: {},
      businessObjectCount: 15,
      dataModelCount: 131,
      activeCapabilityCount: 34,
      permissionCodeCount: 79,
      passed: true,
      blockerCount: 0,
      warningCount: 0,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 6, completed: 6, failed: 0, successRate: 1, byStatus: { completed: 6 }, runLatencyP99Ms: 280, latencySampleCount: 6 },
      tools: { total: 3, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: 120, latencySampleCount: 3 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 6 }, byFinalEngine: { kg_llm: 6 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 6 },
      cache: { status: 'measured', hitRate: 0.8, sampleCount: 6 },
      eval: { total: 1, byStatus: { passed: 1 } },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'v-local-smoke',
      total: 34,
      enabled: 33,
      disabled: 1,
      byReleaseStrategy: { auto_publish: 28, approval_required: 6 },
      byRiskLevel: { low: 28, medium: 6 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: true, totalQuestions: 650, p0Questions: 103 },
      metrics: { p0Accuracy: 1, highRiskAutoPublish: 0 },
      gates: [],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([
      {
        id: 7,
        runNo: 'AUTO-LOCAL-7',
        status: 'completed',
        input: { trigger: 'local_ci', scanMode: 'fingerprint' },
        result: { trigger: 'local_ci', scanMode: 'fingerprint' },
        startedAt: now,
        completedAt: now,
        createdAt: now,
      },
    ], 20));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([]);
    api.getAgentGovernanceCapabilityHeatMap.mockResolvedValue([
      { domain: 'finance', releaseStrategy: 'auto_publish', count: 8 },
      { domain: 'card', releaseStrategy: 'approval_required', count: 4 },
    ]);
    api.getAgentCapabilityDrafts.mockResolvedValue({
      items: [],
      total: 9,
      page: 1,
      pageSize: 5,
      stats: { total: 9, byStatus: { draft: 2, needs_changes: 1, approved: 3, published: 3 } },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentCapabilityManifestVersions.mockResolvedValue([
      {
        id: 1,
        version: 'v-local-smoke',
        status: 'active',
        source: 'capability_center',
        itemCount: 34,
        autoPublishedCount: 28,
        approvalRequiredCount: 6,
        writeBlockedCount: 0,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    api.getAgentToolQueryKeys.mockResolvedValue([
      {
        id: 1,
        queryKey: 'finance.payment-method-breakdown.metric',
        toolName: 'businessMetricQuery',
        domain: 'finance',
        status: 'active',
        source: 'tool_registry',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    renderAgentGovernanceCenter();

    await userEvent.click(await screen.findByRole('tab', { name: '能力治理' }));

    expect(await screen.findByText('候选池入口')).toBeInTheDocument();
    expect(screen.getByText('打开能力中心')).toBeInTheDocument();
    expect(screen.getByText('QueryKey 注册表')).toBeInTheDocument();
    expect(screen.getByText('finance.payment-method-breakdown.metric')).toBeInTheDocument();
    expect(screen.getByText('AUTO-LOCAL-7')).toBeInTheDocument();
    expect(screen.getByText('人工审核')).toBeInTheDocument();
    await waitFor(() => expect(api.getAgentCapabilityDrafts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 5,
      status: 'all',
      domain: 'all',
      riskLevel: 'all',
      releaseStrategy: 'all',
    }));
  });

  it('routes uncovered questions into debug and graph governance', async () => {
    const now = '2026-07-06T03:08:00.000Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 3,
      byStatus: { failed: 3 },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3576,
      edgeCount: 4109,
      nodeCountsByType: {},
      edgeCountsByType: {},
      businessObjectCount: 15,
      dataModelCount: 131,
      activeCapabilityCount: 34,
      permissionCodeCount: 79,
      passed: true,
      blockerCount: 0,
      warningCount: 4,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 3, completed: 0, failed: 3, successRate: 0, byStatus: { failed: 3 }, runLatencyP99Ms: 410, latencySampleCount: 3 },
      tools: { total: 0, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: null, latencySampleCount: 0 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 3 }, byFinalEngine: { unsupported: 3 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 3 },
      cache: { status: 'unavailable', hitRate: null, sampleCount: 0 },
      eval: { total: 0, byStatus: {} },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'v-local-smoke',
      total: 34,
      enabled: 34,
      disabled: 0,
      byReleaseStrategy: { auto_publish: 28 },
      byRiskLevel: { low: 28 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: false, totalQuestions: 650, p0Questions: 103 },
      metrics: { p0Accuracy: 0.96, highRiskAutoPublish: 0 },
      gates: [],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([], 5));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([
      {
        question: '这个月人效怎么样',
        count: 3,
        latestAt: now,
        lastError: 'unsupported',
      },
    ]);
    api.getAgentKnowledgeGraphNodes.mockResolvedValue(listResult([], 20));
    api.getAgentKnowledgeGraphGaps.mockResolvedValue([]);
    api.getAgentKnowledgeGraphVisualize.mockResolvedValue({ focusId: undefined, depth: 2, nodes: [], edges: [] });
    api.getAgentKnowledgeGraphSynonyms.mockResolvedValue(listResult([], 8));
    api.getAgentKnowledgeGraphExcludes.mockResolvedValue(listResult([], 8));

    renderAgentGovernanceCenter();

    expect(await screen.findByText('这个月人效怎么样')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '能力治理' })).toHaveAttribute('href', '/system/agent-capabilities');

    await userEvent.click(screen.getByRole('button', { name: '单题调试' }));
    expect(screen.getByRole('tab', { name: '单题调试' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByLabelText('调试问题')).toHaveValue('这个月人效怎么样');
    expect(screen.getByPlaceholderText('entrypoint')).toHaveValue('agent_governance_uncovered_debug');

    await userEvent.click(screen.getByRole('tab', { name: '总览' }));
    await userEvent.click(screen.getByRole('button', { name: '图谱治理' }));

    expect(screen.getByRole('tab', { name: '知识图谱' })).toHaveAttribute('data-state', 'active');
    expect(await screen.findByPlaceholderText('搜索节点 ID、名称或描述')).toHaveValue('人效');
    expect(screen.getByPlaceholderText('同义词')).toHaveValue('人效');
    expect(screen.getAllByPlaceholderText('原因')[0]).toHaveValue('从未覆盖问法“这个月人效怎么样”发起图谱治理');
    expect(screen.getByText('未覆盖问法待治理')).toBeInTheDocument();
    expect(screen.getAllByText('word:人效').length).toBeGreaterThan(0);
  });

  it('shows structured evidence audit in run detail', async () => {
    const now = '2026-07-05T14:42:00.000Z';
    const plannerEndedAt = '2026-07-05T14:42:00.080Z';
    const toolEndedAt = '2026-07-05T14:42:00.190Z';
    const renderEndedAt = '2026-07-05T14:42:00.240Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 1,
      byStatus: { completed: 1 },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3576,
      edgeCount: 4109,
      nodeCountsByType: {},
      edgeCountsByType: {},
      businessObjectCount: 15,
      dataModelCount: 131,
      activeCapabilityCount: 34,
      permissionCodeCount: 79,
      passed: true,
      blockerCount: 0,
      warningCount: 4,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 1, completed: 1, failed: 0, successRate: 1, byStatus: { completed: 1 }, runLatencyP99Ms: 320, latencySampleCount: 1 },
      tools: { total: 1, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: 110, latencySampleCount: 1 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 1 }, byFinalEngine: { kg_llm: 1 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 1 },
      cache: { status: 'measured', hitRate: 1, sampleCount: 1 },
      eval: { total: 1, byStatus: { passed: 1 } },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'v-local-smoke',
      total: 34,
      enabled: 34,
      disabled: 0,
      byReleaseStrategy: { auto_publish: 28 },
      byRiskLevel: { low: 28 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: true, totalQuestions: 650, p0Questions: 103 },
      metrics: { p0Accuracy: 1, highRiskAutoPublish: 0 },
      gates: [],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([], 5));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([]);
    api.getAgentGovernanceRuns.mockResolvedValue(listResult([
      {
        id: 101,
        runNo: 'RUN-101',
        storeId: 1,
        role: 'manager',
        entrypoint: 'admin',
        agentCode: 'agent_v2',
        status: 'failed',
        userInput: '今天各支付方式收款',
        errorMessage: 'contract_failed: output kind missing',
        createdAt: now,
        startedAt: now,
        completedAt: renderEndedAt,
        toolCallCount: 1,
        approvalCount: 0,
      },
    ]));
    api.getAgentGovernanceRunDetail.mockResolvedValue({
      run: {
        id: 101,
        runNo: 'RUN-101',
        storeId: 1,
        role: 'manager',
        entrypoint: 'admin',
        agentCode: 'agent_v2',
        status: 'failed',
        userInput: '今天各支付方式收款',
        errorMessage: 'contract_failed: output kind missing',
        createdAt: now,
        evidenceJson: {
          sourceTables: ['PaymentRecord', 'ProductOrder'],
          filters: ['order.storeId=1'],
          sampleSize: 3,
          limitations: ['V2 EvidenceService 已合并工具证据、字段策略审计、通用查询 trace 和脱敏 SQL 摘要。'],
          fieldPolicy: {
            allowedFields: ['methodLabel', 'revenueText'],
            maskedFields: ['reason'],
            deniedFields: ['customerPhone'],
            droppedFields: ['internalId'],
          },
          queryTraces: [
            {
              engine: 'generic_query_engine',
              queryKey: 'finance.payment-method-breakdown.metric',
              kind: 'metric.query',
              sourceModel: 'PaymentRecord',
              filters: ['order.storeId=1'],
            },
          ],
          sqlSummaries: [
            {
              model: 'PaymentRecord',
              statementPreview: 'SELECT * FROM "PaymentRecord" WHERE order.storeId = :storeId LIMIT 2000;',
              sensitiveValuesRedacted: true,
            },
          ],
        },
      },
      messages: [],
      steps: [
        {
          id: 1,
          runId: 101,
          stepType: 'planner',
          name: 'agent.v2.planner',
          status: 'completed',
          inputJson: { question: '今天各支付方式收款' },
          outputJson: { selectedCapabilityId: 'finance.payment-method-breakdown.metric' },
          startedAt: now,
          endedAt: plannerEndedAt,
        },
        {
          id: 2,
          runId: 101,
          stepType: 'tool',
          name: 'businessMetricQuery',
          status: 'completed',
          inputJson: { queryKey: 'finance.payment-method-breakdown.metric' },
          outputJson: {
            queryTrace: {
              engine: 'generic_query_engine',
              queryKey: 'finance.payment-method-breakdown.metric',
              sourceModel: 'PaymentRecord',
              filters: ['order.storeId=1'],
            },
            sqlSummary: {
              model: 'PaymentRecord',
              statementPreview: 'SELECT * FROM "PaymentRecord" WHERE order.storeId = :storeId LIMIT 2000;',
              sensitiveValuesRedacted: true,
            },
          },
          startedAt: plannerEndedAt,
          endedAt: toolEndedAt,
        },
        {
          id: 3,
          runId: 101,
          stepType: 'render',
          name: 'agent.v2.response.render',
          status: 'completed',
          inputJson: {},
          outputJson: { answerContract: { requiredKinds: ['metric'] } },
          startedAt: toolEndedAt,
          endedAt: renderEndedAt,
        },
      ],
      toolCalls: [
        {
          id: 201,
          runId: 101,
          toolName: 'businessMetricQuery',
          riskLevel: 'low',
          status: 'success',
          argsJson: { queryKey: 'finance.payment-method-breakdown.metric' },
          resultJson: { metrics: [{ label: '微信支付', value: 1200 }] },
          latencyMs: 110,
          createdAt: plannerEndedAt,
          completedAt: toolEndedAt,
        },
      ],
      approvals: [],
      replay: {
        dryRun: false,
        runId: 101,
        runNo: 'RUN-101',
        phases: [
          {
            key: 'planner',
            status: 'completed',
            startedAt: now,
            endedAt: plannerEndedAt,
            data: { selectedCapabilityId: 'finance.payment-method-breakdown.metric' },
          },
          {
            key: 'kg_preprocessing',
            status: 'available',
            data: {
              available: true,
              normalizedQuestion: '今天各支付方式收款',
              selectedIntent: {
                objects: ['PaymentRecord'],
                domain: 'finance',
                action: 'metric',
                candidateCapabilities: ['finance.payment-method-breakdown.metric'],
                confidence: 0.92,
              },
            },
          },
          {
            key: 'manifest_mapping',
            status: 'selected',
            data: {
              selectedCapabilityId: 'finance.payment-method-breakdown.metric',
              displayName: '支付方式收款',
              reason: '命中支付方式统计能力',
            },
          },
          {
            key: 'policy_boundary',
            status: 'pass',
            data: { available: true, overallStatus: 'pass', allowed: true, checks: [] },
          },
          {
            key: 'tool_execution',
            status: 'completed',
            data: {
              toolCalls: [],
              toolSteps: [
                {
                  name: 'businessMetricQuery',
                  status: 'completed',
                  input: { queryKey: 'finance.payment-method-breakdown.metric' },
                  output: { metrics: [{ label: '微信支付', value: 1200 }] },
                  startedAt: plannerEndedAt,
                  endedAt: toolEndedAt,
                },
              ],
              queryTraces: [
                {
                  engine: 'generic_query_engine',
                  queryKey: 'finance.payment-method-breakdown.metric',
                  sourceModel: 'PaymentRecord',
                  filters: ['order.storeId=1'],
                },
              ],
              sqlSummaries: [
                {
                  model: 'PaymentRecord',
                  statementPreview: 'SELECT * FROM "PaymentRecord" WHERE order.storeId = :storeId LIMIT 2000;',
                  sensitiveValuesRedacted: true,
                },
              ],
            },
          },
          {
            key: 'contract_and_rendering',
            status: 'completed',
            startedAt: toolEndedAt,
            endedAt: renderEndedAt,
            data: { answerContract: { requiredKinds: ['metric'] }, renderedBlocks: [{ kind: 'metric' }] },
          },
          {
            key: 'evidence_trace',
            status: 'available',
            data: { available: true },
          },
          {
            key: 'final_answer',
            status: 'failed',
            data: { answer: '今天各支付方式收款如下' },
          },
        ],
      },
    });

    renderAgentGovernanceCenter();

    await screen.findByRole('heading', { name: 'AI 治理中心' });
    await userEvent.click(screen.getByRole('tab', { name: '运行审计' }));
    expect(await screen.findByText('RUN-101')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(await screen.findByText('证据审计')).toBeInTheDocument();
    expect(screen.getByText('运行链路摘要')).toBeInTheDocument();
    expect(screen.getByText('意图追溯')).toBeInTheDocument();
    expect(screen.getByText('工具执行链路')).toBeInTheDocument();
    expect(screen.getByText('延迟分解')).toBeInTheDocument();
    expect(screen.getByText('查询证据包')).toBeInTheDocument();
    expect(screen.getAllByText('契约失败').length).toBeGreaterThan(0);
    expect(screen.getByText('PaymentRecord, ProductOrder')).toBeInTheDocument();
    expect(screen.getAllByText('finance.payment-method-breakdown.metric').length).toBeGreaterThan(0);
    expect(screen.getByText('reason')).toBeInTheDocument();
    expect(screen.getByText('customerPhone')).toBeInTheDocument();
    expect(screen.getAllByText(/SELECT \* FROM "PaymentRecord"/).length).toBeGreaterThan(0);
  });

  it('opens eval failure samples and replays one through dry-run planning', async () => {
    const now = '2026-07-05T14:42:00.000Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 1,
      byStatus: { completed: 1 },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3576,
      edgeCount: 4109,
      nodeCountsByType: {},
      edgeCountsByType: {},
      businessObjectCount: 15,
      dataModelCount: 131,
      activeCapabilityCount: 34,
      permissionCodeCount: 79,
      passed: true,
      blockerCount: 0,
      warningCount: 4,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 1, completed: 1, failed: 0, successRate: 1, byStatus: { completed: 1 }, runLatencyP99Ms: 320, latencySampleCount: 1 },
      tools: { total: 1, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: 110, latencySampleCount: 1 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 1 }, byFinalEngine: { kg_llm: 1 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 1 },
      cache: { status: 'measured', hitRate: 1, sampleCount: 1 },
      eval: { total: 1, byStatus: { failed: 1 } },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'v-local-smoke',
      total: 34,
      enabled: 34,
      disabled: 0,
      byReleaseStrategy: { auto_publish: 28 },
      byRiskLevel: { low: 28 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: false, totalQuestions: 650, p0Questions: 103 },
      metrics: { p0Accuracy: 0.97, highRiskAutoPublish: 0 },
      gates: [{ gate: 'P0 正确率', expected: '>=98%', actual: '97%', pass: false }],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([], 5));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([]);
    api.getAgentGovernanceEvalCases.mockResolvedValue(listResult([], 20));
    api.getAgentGovernanceEvalRunHistory.mockResolvedValue(listResult([
      {
        id: 12,
        status: 'failed',
        score: 0.8,
        errorMessage: 'P0 gate failed',
        createdAt: now,
        resultJson: { summary: { totalQuestions: 650, p0Questions: 103 } },
      },
    ], 8));
    api.getAgentGovernanceEvalRunFailures.mockResolvedValue({
      items: [
        {
          type: 'sample_failed',
          category: 'p0WrongRouteRisk',
          index: 0,
          id: 'q002',
          question: '今天核销记录',
          expectedCapabilityId: 'card.usage.records.list',
          actualCapabilityId: 'order.card-package.records.list',
          reason: 'wrong route',
          sample: {},
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      categories: { p0WrongRouteRisk: 1 },
      run: { id: 12, status: 'failed', score: 0.8, createdAt: now },
      summary: '本次评测有 1 条失败或阻断样例。',
    });
    api.replayAgentGovernanceEvalRunFailure.mockImplementation(async (_id: number, data: { toolReplay?: boolean } = {}) => ({
      run: { id: 12, status: 'failed', score: 0.8, createdAt: now },
      failure: {
        type: 'sample_failed',
        category: 'p0WrongRouteRisk',
        index: 0,
        id: 'q002',
        question: '今天核销记录',
        expectedCapabilityId: 'card.usage.records.list',
        actualCapabilityId: 'order.card-package.records.list',
      },
      replay: {
        question: '今天核销记录',
        dryRun: true,
        grayMode: 'kg_llm_preferred',
        selectedCapabilityId: 'card.usage.records.list',
        confidence: 0.91,
        reason: '命中核销记录。',
        debugContext: {
          question: '今天核销记录',
          storeId: 1,
          role: 'manager',
          entrypoint: 'agent_governance_eval_replay',
          grayMode: 'kg_llm_preferred',
          manifestVersion: 'v-local-smoke',
          manifestVersionSource: 'active_manifest',
          dryRun: true,
        },
        graphTrace: {
          available: true,
          source: 'llm',
          cacheHit: false,
          normalizedQuestion: '今天核销记录',
          graphContextCounts: { objectHints: 1, domainHints: 1, capabilityHints: 1, exclusions: 0, fieldHints: 2 },
          selectedIntent: {
            objects: ['CardUsageRecord'],
            domain: 'card',
            action: 'list',
            timeIntent: 'current',
            candidateCapabilities: ['card.usage.records.list'],
            confidence: 0.91,
          },
          objectHints: [
            { objectType: 'CardUsageRecord', displayName: '核销记录', matchedTerms: ['核销记录'], sourceModels: ['CardUsageRecord'] },
          ],
          domainHints: [
            { domain: 'card', displayName: '会员卡', reasons: ['核销'] },
          ],
          capabilityHints: [
            { capabilityId: 'card.usage.records.list', displayName: '核销记录', triggerTerms: ['核销'] },
          ],
          exclusions: [],
        },
        policyTrace: {
          available: true,
          overallStatus: 'pass',
          allowed: true,
          requiresApproval: false,
          capability: {
            capabilityId: 'card.usage.records.list',
            releaseStrategy: 'auto_publish',
            riskLevel: 'low',
          },
          tool: {
            name: 'business.record.query',
            riskLevel: 'low',
            requiresApproval: false,
          },
          fieldPolicySummary: {
            allow: ['orderNo'],
            mask: ['remark'],
            deny: ['customerPhone'],
          },
          checks: [
            { name: 'status', status: 'pass', reason: '能力已启用。' },
            { name: 'permission', status: 'pass', reason: '权限码满足能力要求。' },
            { name: 'tool_approval', status: 'pass', reason: '工具不需要前置审批。' },
          ],
        },
        replay: {},
      },
      comparison: {
        expectedCapabilityId: 'card.usage.records.list',
        previousActualCapabilityId: 'order.card-package.records.list',
        replayCapabilityId: 'card.usage.records.list',
        previousMatchedExpected: false,
        replayMatchedExpected: true,
        changedFromPrevious: true,
      },
      diagnosis: {
        category: 'p0WrongRouteRisk',
        status: 'replay_matched_expected',
        message: '当前运行时 dry-run 已命中预期能力。',
      },
      safety: {
        dryRun: true,
        toolExecution: Boolean(data.toolReplay),
        readOnlyToolReplay: Boolean(data.toolReplay),
        writeExecution: false,
      },
      toolReplay: data.toolReplay ? {
        requested: true,
        executed: true,
        mode: 'read_only_whitelist',
        results: [
          {
            tool: 'business.record.query',
            status: 'success',
            summary: '返回 1 条核销记录，手机号 13987654321。',
            data: {
              items: [{ customerName: '张敏', customerPhone: '13987654321' }],
              accessToken: 'raw-eval-token',
            },
          },
        ],
      } : {
        requested: false,
        executed: false,
        mode: 'planning_only',
      },
      queryReplay: data.toolReplay ? {
        requested: true,
        available: true,
        source: 'read_only_tool_replay',
        toolCount: 1,
        queryTraces: [
          {
            queryKey: 'card.usage.records.list',
            kind: 'record.query',
            sourceModel: 'CardUsageRecord',
            filters: ['customerPhone = 13987654321'],
          },
        ],
        sqlSummaries: [
          {
            model: 'CardUsageRecord',
            statementPreview: 'SELECT * FROM "CardUsageRecord" WHERE customerPhone = 13987654321 LIMIT 50;',
            sensitiveValuesRedacted: true,
          },
        ],
      } : {
        requested: false,
        available: false,
        reason: 'tool_replay_not_requested',
      },
      contractReplay: data.toolReplay ? {
        requested: true,
        executed: true,
        answer: '返回 1 条核销记录。',
        answerContract: { valid: true, errors: [], warnings: [] },
        renderedBlocks: [
          { kind: 'summary_text', content: '返回 1 条核销记录。' },
          { kind: 'table', columns: ['订单编号'], rows: [['CO-001']] },
          { kind: 'evidence_panel', sources: ['CardUsageRecord'], metricDefinition: '核销记录查询' },
        ],
        phaseOutputs: [{ phase: 'core_conclusion', blockKinds: ['summary_text', 'table', 'evidence_panel'] }],
      } : {
        requested: false,
        executed: false,
        reason: 'tool_replay_not_requested',
      },
    }));
    api.runAgentGovernanceEvalDryRunBatch.mockResolvedValue({
      id: 13,
      status: 'failed',
      score: 0.8,
      totalQuestions: 25,
      p0Questions: 25,
      createdAt: now,
      source: 'agent_governance_dry_run_batch',
      trigger: 'manual_governance_eval_batch',
      summary: { totalQuestions: 25, wrongRoute: 1 },
    });

    renderAgentGovernanceCenter();

    await screen.findByRole('heading', { name: 'AI 治理中心' });
    await userEvent.click(screen.getByRole('tab', { name: '评测门禁' }));
    expect(await screen.findByText('103 P0 / 650 题')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '批量 Dry-run' }));
    await waitFor(() => expect(api.runAgentGovernanceEvalDryRunBatch).toHaveBeenCalledWith({
      priority: 'P0',
      limit: 25,
      role: 'manager',
      entrypoint: 'agent_governance_eval_batch',
      grayMode: 'kg_llm_preferred',
      note: 'manual governance center dry-run batch',
    }));

    await userEvent.click(screen.getByRole('button', { name: '失败样例' }));
    expect(await screen.findByRole('heading', { name: '评测失败样例' })).toBeInTheDocument();
    expect(await screen.findByText('今天核销记录')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dry-run 回放' }));

    await waitFor(() => expect(api.replayAgentGovernanceEvalRunFailure).toHaveBeenCalledWith(12, {
      failureId: 'q002',
      category: 'p0WrongRouteRisk',
      index: 0,
      role: 'manager',
      entrypoint: 'agent_governance_eval_replay',
      grayMode: 'kg_llm_preferred',
    }));
    expect(await screen.findByText('当前运行时 dry-run 已命中预期能力。')).toBeInTheDocument();
    expect(screen.getAllByText('card.usage.records.list').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /只读工具回放/ }));

    await waitFor(() => expect(api.replayAgentGovernanceEvalRunFailure).toHaveBeenCalledWith(12, {
      failureId: 'q002',
      category: 'p0WrongRouteRisk',
      index: 0,
      role: 'manager',
      entrypoint: 'agent_governance_eval_replay',
      grayMode: 'kg_llm_preferred',
      toolReplay: true,
    }));
    expect(screen.getAllByText('只读工具回放').length).toBeGreaterThan(0);
    expect(screen.getByText('调试输入')).toBeInTheDocument();
    expect(screen.getByText('Manifest 版本')).toBeInTheDocument();
    expect(screen.getByText('图谱预处理')).toBeInTheDocument();
    expect(screen.getAllByText('CardUsageRecord').length).toBeGreaterThan(0);
    expect(screen.getByText('Policy 决策')).toBeInTheDocument();
    expect(screen.getAllByText('允许执行').length).toBeGreaterThan(0);
    expect(screen.getAllByText('tool_approval').length).toBeGreaterThan(0);
    expect(screen.getByText('Query Plan / SQL 回放')).toBeInTheDocument();
    expect(screen.getAllByText('card.usage.records.list').length).toBeGreaterThan(0);
    expect(screen.getByText(/SELECT \* FROM "CardUsageRecord"/)).toBeInTheDocument();
    expect(screen.getAllByText(/139\*\*\*\*4321/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/13987654321/)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw-eval-token/)).not.toBeInTheDocument();
    expect(screen.getByText('契约与渲染回放')).toBeInTheDocument();
    expect((await screen.findAllByText(/返回 1 条核销记录/)).length).toBeGreaterThan(0);
  });

  it('runs single-question read-only tool replay from debug tab', async () => {
    const now = '2026-07-05T14:42:00.000Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 1,
      byStatus: { completed: 1 },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3576,
      edgeCount: 4109,
      nodeCountsByType: {},
      edgeCountsByType: {},
      businessObjectCount: 15,
      dataModelCount: 131,
      activeCapabilityCount: 34,
      permissionCodeCount: 79,
      passed: true,
      blockerCount: 0,
      warningCount: 4,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 1, completed: 1, failed: 0, successRate: 1, byStatus: { completed: 1 }, runLatencyP99Ms: 320, latencySampleCount: 1 },
      tools: { total: 1, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: 110, latencySampleCount: 1 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 1 }, byFinalEngine: { kg_llm: 1 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 1 },
      cache: { status: 'measured', hitRate: 1, sampleCount: 1 },
      eval: { total: 1, byStatus: { passed: 1 } },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'v-local-smoke',
      total: 34,
      enabled: 34,
      disabled: 0,
      byReleaseStrategy: { auto_publish: 28 },
      byRiskLevel: { low: 28 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: true, totalQuestions: 650, p0Questions: 103 },
      metrics: { p0Accuracy: 1, highRiskAutoPublish: 0 },
      gates: [],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([], 5));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([]);
    api.debugAgentGovernanceExecute.mockResolvedValue({
      question: '哪些客户买了次卡但最近一直不来用',
      dryRun: true,
      grayMode: 'kg_llm_preferred',
      selectedCapabilityId: 'card.package.inactive-customers.list',
      confidence: 0.92,
      reason: '命中沉睡次卡客户。',
      debugContext: {
        question: '哪些客户买了次卡但最近一直不来用',
        storeId: 1,
        role: 'manager',
        entrypoint: 'agent_governance_debug',
        grayMode: 'kg_llm_preferred',
        manifestVersion: 'v-local-smoke',
        manifestVersionSource: 'active_manifest',
        dryRun: true,
      },
      graphTrace: {
        available: true,
        source: 'llm',
        cacheHit: false,
        normalizedQuestion: '哪些客户买了次卡但最近一直不来用',
        graphContextCounts: { objectHints: 2, domainHints: 1, capabilityHints: 1, exclusions: 0, fieldHints: 3 },
        selectedIntent: {
          objects: ['MemberCard', 'Customer'],
          domain: 'card',
          action: 'list',
          timeIntent: 'historical_pattern',
          candidateCapabilities: ['card.package.inactive-customers.list'],
          confidence: 0.92,
        },
        objectHints: [
          { objectType: 'MemberCard', displayName: '次卡', matchedTerms: ['次卡'], sourceModels: ['CustomerPackageCard'] },
          { objectType: 'Customer', displayName: '客户', matchedTerms: ['客户'], sourceModels: ['Customer'] },
        ],
        domainHints: [
          { domain: 'card', displayName: '会员卡', reasons: ['次卡'] },
        ],
        capabilityHints: [
          { capabilityId: 'card.package.inactive-customers.list', displayName: '沉睡次卡客户', triggerTerms: ['次卡', '一直不来用'] },
        ],
        exclusions: [],
      },
      llmTrace: {
        available: true,
        source: 'llm',
        prompt: { activeManifestCount: 34 },
        response: { parsed: true },
      },
      policyTrace: {
        available: true,
        overallStatus: 'pass',
        allowed: true,
        requiresApproval: false,
        capability: {
          capabilityId: 'card.package.inactive-customers.list',
          releaseStrategy: 'auto_publish',
          riskLevel: 'low',
        },
        tool: {
          name: 'business.record.query',
          riskLevel: 'low',
          requiresApproval: false,
        },
        fieldPolicySummary: {
          allow: ['customerName'],
          mask: ['remark'],
          deny: ['customerPhone'],
        },
        checks: [
          { name: 'status', status: 'pass', reason: '能力已启用。' },
          { name: 'permission', status: 'pass', reason: '权限码满足能力要求。' },
          { name: 'tool_approval', status: 'pass', reason: '工具不需要前置审批。' },
        ],
      },
      toolReplay: {
        requested: true,
        executed: true,
        mode: 'read_only_whitelist',
        results: [
          {
            tool: 'business.record.query',
            status: 'success',
            summary: '返回 1 条沉睡次卡客户记录，手机号 13812345678。',
            data: {
              items: [{ customerName: '张敏', customerPhone: '13812345678' }],
              accessToken: 'raw-debug-token',
            },
          },
        ],
      },
      queryReplay: {
        requested: true,
        available: true,
        source: 'read_only_tool_replay',
        toolCount: 1,
        queryTraces: [
          {
            queryKey: 'card.package.inactive-customers.list',
            kind: 'record.query',
            sourceModel: 'CustomerPackageCard',
            filters: ['customerPhone = 13812345678'],
          },
        ],
        sqlSummaries: [
          {
            model: 'CustomerPackageCard',
            statementPreview: 'SELECT * FROM "CustomerPackageCard" WHERE customerPhone = 13812345678 LIMIT 50;',
            sensitiveValuesRedacted: true,
          },
        ],
      },
      contractReplay: {
        requested: true,
        executed: true,
        answer: '返回 1 条沉睡次卡客户记录。',
        answerContract: { valid: true, errors: [], warnings: [] },
        renderedBlocks: [
          { kind: 'summary_text', content: '返回 1 条沉睡次卡客户记录。' },
          { kind: 'table', columns: ['客户'], rows: [['张敏']] },
        ],
        phaseOutputs: [{ phase: 'core_conclusion', blockKinds: ['summary_text', 'table'] }],
      },
    });
    api.debugAgentGovernanceCompare.mockResolvedValue({
      question: '哪些客户买了次卡但最近一直不来用',
      dryRun: true,
      grayMode: 'compare',
      selectedCapabilityId: 'card.package.inactive-customers.list',
      confidence: 0.92,
      modes: {
        legacy_regex: {
          question: '哪些客户买了次卡但最近一直不来用',
          dryRun: true,
          grayMode: 'legacy_regex',
          selectedCapabilityId: 'card.package.inactive-customers.list',
          confidence: 0.9,
          strategy: { finalEngine: 'legacy_regex' },
        },
        kg_llm_only: {
          question: '哪些客户买了次卡但最近一直不来用',
          dryRun: true,
          grayMode: 'kg_llm_only',
          selectedCapabilityId: 'card.package.inactive-customers.list',
          confidence: 0.92,
          strategy: { finalEngine: 'kg_llm' },
        },
      },
      comparison: {
        manifestVersions: {
          active: 'v-local-smoke',
          target: 'cap-prev',
          targetAvailable: true,
          selectedByMode: {
            legacy_regex: 'v-local-smoke',
            kg_llm_only: 'v-local-smoke',
          },
          selectedByVersion: {
            active: 'v-local-smoke',
            target: 'cap-prev',
          },
          changedAcrossModes: false,
        },
        graphContext: {
          withGraphMode: 'kg_llm_only',
          withoutGraphMode: 'legacy_regex',
        },
        legacyVsKgLlm: {
          legacy: {
            selectedCapabilityId: 'card.package.inactive-customers.list',
            finalEngine: 'legacy_regex',
          },
          kgLlm: {
            selectedCapabilityId: 'card.package.inactive-customers.list',
            finalEngine: 'kg_llm',
          },
          changedCapability: false,
          changedOutputShape: false,
          changedEvidence: false,
        },
        consistency: {
          mode: 'kg_llm_preferred',
          iterations: 5,
          stable: true,
          capabilityCounts: { 'card.package.inactive-customers.list': 5 },
          finalEngineCounts: { kg_llm: 5 },
        },
        differences: {
          latencyMs: { byMode: { kg_llm_only: 4 } },
          costEstimate: { byMode: { kg_llm_only: 128 }, unit: 'local_debug_char_estimate' },
        },
        manifestVersionComparison: {
          requestedVersion: 'cap-prev',
          activeVersion: 'v-local-smoke',
          targetVersion: 'cap-prev',
          targetAvailable: true,
          targetStatus: 'archived',
          source: 'database',
          itemCount: 34,
          active: {
            selectedCapabilityId: 'card.package.inactive-customers.list',
            selectedManifestVersion: 'v-local-smoke',
            outputShape: { requiredKinds: ['table', 'evidence_panel'] },
          },
          target: {
            selectedCapabilityId: 'card.package.inactive-customers.list',
            selectedManifestVersion: 'cap-prev',
            outputShape: { requiredKinds: ['chart', 'evidence_panel'] },
          },
          changedManifestVersion: true,
          changedCapability: false,
          changedOutputShape: true,
          changedEvidence: false,
          addedCapabilities: [],
          removedCapabilities: [],
          note: '指定版本对比只在本次调试中使用目标 Manifest 快照，不激活版本。',
        },
        verdict: {
          localDryRunStable: true,
          canJudgeNewArchitectureMoreStable: true,
          reasons: ['kg_llm_preferred 5 次 dry-run 一致。'],
          productionEvidenceRequired: '仍需 7 天 shadow、真实延迟、真实成本和线上有用率后，才能替代旧正则退役判断。',
        },
      },
      differences: {},
    });
    api.simulateAgentGovernanceManifest.mockResolvedValue({
      question: '哪些客户买了次卡但最近一直不来用',
      dryRun: true,
      grayMode: 'kg_llm_preferred',
      selectedCapabilityId: 'card.package.inactive-customers.list',
      confidence: 0.94,
      reason: 'Manifest 模拟命中沉睡次卡客户。',
      debugContext: {
        question: '哪些客户买了次卡但最近一直不来用',
        storeId: 1,
        role: 'manager',
        entrypoint: 'agent_governance_debug',
        grayMode: 'kg_llm_preferred',
        manifestVersion: 'v-local-smoke',
        manifestVersionSource: 'active_manifest',
        dryRun: true,
      },
      simulation: {
        activeManifestVersion: 'v-local-smoke',
        temporaryOnly: true,
        applied: true,
        capabilityId: 'card.package.inactive-customers.list',
        baseSelectedCapabilityId: 'card.package.inactive-customers.list',
        simulatedSelectedCapabilityId: 'card.package.inactive-customers.list',
        changedFields: ['status', 'triggerKeywords', 'outputKinds'],
        patch: {
          enabled: true,
          triggerKeywords: ['沉睡次卡'],
          outputKinds: ['chart', 'evidence_panel'],
        },
        triggerMatched: true,
        negativeMatched: false,
        effect: 'selected_by_temporary_manifest',
        formalEditUrl: '/system/agent-capabilities?capabilityId=card.package.inactive-customers.list',
        note: 'Manifest 模拟仅在本次调试 session 生效，未写入草稿、未发布版本、未修改 active Manifest。',
      },
      plan: {
        outputContract: { requiredKinds: ['chart', 'evidence_panel'] },
      },
      replay: {},
    });

    renderAgentGovernanceCenter();

    await screen.findByRole('heading', { name: 'AI 治理中心' });
    await userEvent.click(screen.getByRole('tab', { name: '单题调试' }));
    await userEvent.type(screen.getByLabelText('目标 Manifest 版本'), 'cap-prev');
    await userEvent.click(screen.getByRole('button', { name: '对比' }));

    await waitFor(() => expect(api.debugAgentGovernanceCompare).toHaveBeenCalledWith(expect.objectContaining({
      question: '哪些客户买了次卡但最近一直不来用',
      grayMode: 'kg_llm_preferred',
      role: 'manager',
      storeId: 1,
      entrypoint: 'agent_governance_debug',
      compareManifestVersion: 'cap-prev',
    })));
    expect(await screen.findByText('对比结论')).toBeInTheDocument();
    expect(screen.getByText('Manifest 版本对比')).toBeInTheDocument();
    expect(screen.getByText('目标版本可用')).toBeInTheDocument();
    expect(screen.getAllByText('cap-prev').length).toBeGreaterThan(0);
    expect(screen.getByText('5 次一致性')).toBeInTheDocument();
    expect(screen.getAllByText('kg_llm').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/7 天 shadow/).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: '只读工具执行' }));

    await waitFor(() => expect(api.debugAgentGovernanceExecute).toHaveBeenLastCalledWith(expect.objectContaining({
      question: '哪些客户买了次卡但最近一直不来用',
      grayMode: 'kg_llm_preferred',
      role: 'manager',
      storeId: 1,
      entrypoint: 'agent_governance_debug',
      toolReplay: true,
    })));
    await waitFor(() => expect(screen.getAllByText('只读工具执行').length).toBeGreaterThan(1));
    expect(screen.getByText('调试输入')).toBeInTheDocument();
    expect(screen.getByText('Manifest 版本')).toBeInTheDocument();
    expect(screen.getAllByText('v-local-smoke').length).toBeGreaterThan(0);
    expect(screen.getByText('图谱预处理')).toBeInTheDocument();
    expect(screen.getByText('MemberCard, Customer')).toBeInTheDocument();
    expect(screen.getByText('Policy 决策')).toBeInTheDocument();
    expect(screen.getAllByText('允许执行').length).toBeGreaterThan(0);
    expect(screen.getAllByText('tool_approval').length).toBeGreaterThan(0);
    expect(screen.getByText('Query Plan / SQL 摘要')).toBeInTheDocument();
    expect(screen.getAllByText('card.package.inactive-customers.list').length).toBeGreaterThan(0);
    expect(screen.getByText(/SELECT \* FROM "CustomerPackageCard"/)).toBeInTheDocument();
    expect(screen.getAllByText(/138\*\*\*\*5678/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/13812345678/)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw-debug-token/)).not.toBeInTheDocument();
    expect(screen.getByText('契约与最终 blocks')).toBeInTheDocument();
    expect(screen.getAllByText(/返回 1 条沉睡次卡客户记录/).length).toBeGreaterThan(0);

    await userEvent.clear(screen.getByLabelText('triggerKeywords'));
    await userEvent.type(screen.getByLabelText('triggerKeywords'), '沉睡次卡');
    await userEvent.selectOptions(screen.getByLabelText('临时状态'), 'enabled');
    await userEvent.clear(screen.getByLabelText('outputKinds'));
    await userEvent.type(screen.getByLabelText('outputKinds'), 'chart, evidence_panel');
    await userEvent.click(screen.getByRole('button', { name: '模拟' }));

    await waitFor(() => expect(api.simulateAgentGovernanceManifest).toHaveBeenCalledWith(expect.objectContaining({
      question: '哪些客户买了次卡但最近一直不来用',
      grayMode: 'kg_llm_preferred',
      role: 'manager',
      storeId: 1,
      entrypoint: 'agent_governance_debug',
      capabilityId: 'card.package.inactive-customers.list',
      enabled: true,
      triggerKeywords: ['沉睡次卡'],
      outputKinds: ['chart', 'evidence_panel'],
    })));
    expect(screen.getAllByText('Manifest 模拟').length).toBeGreaterThan(1);
    expect(await screen.findByText('仅本次调试')).toBeInTheDocument();
    expect(screen.getByText('临时命中')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '跳转能力中心' })).toHaveAttribute(
      'href',
      '/system/agent-capabilities?capabilityId=card.package.inactive-customers.list',
    );
  });

  it('loads controlled Text-to-SQL governance console with semantic views and blocked summary', async () => {
    const now = '2026-07-07T02:40:00.000Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 2,
      byStatus: { completed: 2 },
      activeManifestVersion: 'db-active',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3576,
      edgeCount: 4109,
      nodeCountsByType: {},
      edgeCountsByType: {},
      businessObjectCount: 15,
      dataModelCount: 131,
      activeCapabilityCount: 58,
      permissionCodeCount: 79,
      passed: true,
      blockerCount: 0,
      warningCount: 0,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 2, completed: 2, failed: 0, successRate: 1, byStatus: { completed: 2 }, runLatencyP99Ms: 180, latencySampleCount: 2 },
      tools: { total: 1, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: 80, latencySampleCount: 1 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 2 }, byFinalEngine: { kg_llm: 2 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 2 },
      cache: { status: 'measured', hitRate: 1, sampleCount: 2 },
      eval: { total: 0, byStatus: {} },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'db-active',
      total: 58,
      enabled: 58,
      disabled: 0,
      byReleaseStrategy: { auto_publish: 52, approval_required: 6 },
      byRiskLevel: { low: 52, medium: 6 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: true, totalQuestions: 650, p0Questions: 103 },
      metrics: { p0Accuracy: 1, highRiskAutoPublish: 0 },
      gates: [],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([], 5));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([]);
    api.getAgentV2TextToSqlRuns.mockResolvedValue(listResult([
      {
        id: 12,
        question: '本月销量最好的商品',
        storeScopeJson: { storeId: 1 },
        selectedViewsJson: ['agent_v2_order_item_sales_view'],
        status: 'dry_run',
        rowCount: 0,
        executionMs: 12,
        queryTraceJson: { redactedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10' },
        createdAt: now,
      },
      {
        id: 13,
        question: '导出客户手机号',
        storeScopeJson: { storeId: 1 },
        selectedViewsJson: ['agent_v2_customer_profile_summary_view'],
        status: 'blocked',
        blockedReason: 'sensitive_field_selected',
        rowCount: 0,
        executionMs: 4,
        queryTraceJson: { reasonCode: 'sensitive_field_selected' },
        createdAt: now,
      },
    ], 12));
    api.getAgentV2TextToSqlSemanticViews.mockResolvedValue([
      {
        id: 'agent_v2_order_item_sales_view',
        viewName: 'agent_v2_order_item_sales_view',
        domain: 'product/order',
        description: '商品销量、商品销售额',
        status: 'enabled',
        batch: 'P0',
        requiredPermissions: ['core:order:view'],
        storeScopeField: 'store_id',
        defaultTimeField: 'order_created_at',
        fields: [
          { name: 'product_name', type: 'string', description: '商品名称', policy: 'allow' },
          { name: 'quantity', type: 'number', description: '销量', policy: 'allow' },
        ],
        sampleQuestions: ['本月销量最好的商品'],
      },
      {
        id: 'agent_v2_user_role_permission_view',
        viewName: 'agent_v2_user_role_permission_view',
        domain: 'system',
        description: '用户、角色、权限摘要',
        status: 'planned',
        batch: 'P2',
        adminOnly: true,
        requiredPermissions: ['core:user:view'],
        fields: [
          { name: 'user_id', type: 'number', description: '用户 ID', policy: 'allow' },
        ],
        sampleQuestions: ['哪些用户有管理权限'],
      },
    ]);
    api.getAgentV2TextToSqlCandidates.mockResolvedValue([
      {
        clusterKey: 'sales_top_product',
        selectedViews: ['agent_v2_order_item_sales_view'],
        sampleQuestions: ['本月销量最好的商品'],
        hitCount: 8,
        successCount: 6,
        blockedCount: 0,
        failedCount: 0,
        usefulFeedbackCount: 2,
        feedbackCount: 2,
        successRate: 0.75,
        blockedRate: 0,
        riskLevel: 'low',
        status: 'candidate',
        reason: '高频成功问题',
        suggestedCapabilityId: 'product.sales.top.list',
        displayName: '商品销量排行',
      },
      {
        clusterKey: 'sensitive_customer_export',
        selectedViews: ['agent_v2_customer_profile_summary_view'],
        sampleQuestions: ['导出客户手机号'],
        hitCount: 3,
        successCount: 0,
        blockedCount: 3,
        failedCount: 0,
        usefulFeedbackCount: 0,
        feedbackCount: 0,
        successRate: 0,
        blockedRate: 1,
        riskLevel: 'high',
        status: 'blocked_report',
        reason: 'sensitive_field_selected',
        suggestedCapabilityId: 'customer.sensitive.export',
        displayName: '敏感客户导出',
      },
    ]);
    api.getAgentV2TextToSqlStatus.mockResolvedValue({
      enabled: true,
      adminOnly: true,
      maxLimit: 100,
      timeoutMs: 5000,
      maxRangeDays: 365,
      maxEstimatedCost: 100000,
      readonlyExecutionReady: false,
      executeMode: 'dry_run_only',
      readinessCommands: {
        localGate: 'npm.cmd run check:agent-v2-text-to-sql',
        completionAudit: 'npm.cmd run check:agent-v2-text-to-sql:completion-audit',
        strictReadiness: 'npm.cmd --prefix packages/server-v2 run agent-v2:text-to-sql-readiness:strict -- --store-id=1 --url postgresql://readonly:raw-secret@db.example/app token=deploy-token-raw',
      },
      deploymentReadiness: {
        primaryMigrationName: '20260707013000_agent_v2_text_to_sql',
        completionAuditRequired: true,
        readonlyUrlRequired: true,
      },
      viewReadiness: {
        totalViews: 40,
        enabledViews: 13,
        plannedViews: 27,
        adminViews: 4,
        enabledViewNames: ['agent_v2_order_item_sales_view'],
      },
      executeBlockers: ['readonly_database_url_missing'],
      nextActions: ['配置 AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL=postgresql://readonly:raw-secret@db.example/app?token=deploy-token-raw 后运行 strict readiness。'],
    });

    renderAgentGovernanceCenter(['/system/agent-governance/text-to-sql']);

    expect(await screen.findByRole('heading', { name: 'AI 治理中心' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '受控SQL' })).toHaveAttribute('data-state', 'active');
    expect(await screen.findByText('受控 Text-to-SQL Dry-run')).toBeInTheDocument();
    expect(screen.getByText('Guard Inspect')).toBeInTheDocument();
    expect(screen.getByText('高频候选能力')).toBeInTheDocument();
    expect(screen.getAllByText('审计运行').length).toBeGreaterThan(0);
    expect(screen.getByText('商品销量排行')).toBeInTheDocument();
    expect(screen.getByText('敏感客户导出')).toBeInTheDocument();
    expect(screen.getByText('高频阻断原因：sensitive_field_selected x1')).toBeInTheDocument();
    expect(screen.getByText('dry_run_only')).toBeInTheDocument();
    expect(screen.getByText('执行阻断：readonly_database_url_missing')).toBeInTheDocument();
    expect(screen.getByText('迁移：20260707013000_agent_v2_text_to_sql')).toBeInTheDocument();
    expect(screen.getByText('真实库审计：npm.cmd run check:agent-v2-text-to-sql:completion-audit')).toBeInTheDocument();
    expect(screen.getByText(/只读库验收：npm.cmd --prefix packages\/server-v2 run agent-v2:text-to-sql-readiness:strict/)).toBeInTheDocument();
    expect(screen.getAllByText(/\[redacted-db-url\]/).length).toBeGreaterThan(0);
    expect(screen.getByText(/token=\[redacted\]/)).toBeInTheDocument();
    expect(screen.queryByText(/postgresql:\/\/readonly:raw-secret/)).not.toBeInTheDocument();
    expect(screen.queryByText(/deploy-token-raw/)).not.toBeInTheDocument();
    expect(screen.getByText(/total 40 \/ enabled 13 \/ planned 27 \/ admin 4/)).toBeInTheDocument();
    expect(screen.getAllByText('agent_v2_order_item_sales_view').length).toBeGreaterThan(0);
    expect(screen.getByText('agent_v2_user_role_permission_view')).toBeInTheDocument();
    await waitFor(() => expect(api.getAgentV2TextToSqlSemanticViews).toHaveBeenCalledWith({
      includePlanned: true,
      includeAdmin: true,
    }));
    await waitFor(() => expect(api.getAgentV2TextToSqlCandidates).toHaveBeenCalledWith({
      limit: 500,
      minHitCount: 1,
    }));
  });

  it('drives graph node details into governance actions', async () => {
    const now = '2026-07-06T02:48:00.000Z';
    api.getAgentGovernanceRunStats.mockResolvedValue({
      total: 1,
      byStatus: { completed: 1 },
      activeManifestVersion: 'v-local-smoke',
    });
    api.getAgentKnowledgeGraphSummary.mockResolvedValue({
      generatedAt: now,
      schemaHash: 'hash',
      nodeCount: 3,
      edgeCount: 1,
      nodeCountsByType: { Word: 1, BusinessObject: 1, Capability: 1 },
      edgeCountsByType: { SYNONYM_OF: 1 },
      businessObjectCount: 1,
      dataModelCount: 1,
      activeCapabilityCount: 1,
      permissionCodeCount: 1,
      passed: true,
      blockerCount: 0,
      warningCount: 0,
    });
    api.getAgentGovernanceHealth.mockResolvedValue({
      generatedAt: now,
      window: { days: 7, since: now, until: now },
      runs: { total: 1, completed: 1, failed: 0, successRate: 1, byStatus: { completed: 1 }, runLatencyP99Ms: 120, latencySampleCount: 1 },
      tools: { total: 1, failed: 0, highRiskAutoExecutionCount: 0, byStatus: {}, byRiskLevel: {}, topTools: [], toolLatencyP99Ms: 80, latencySampleCount: 1 },
      approvals: { total: 0, byStatus: {} },
      strategy: { byMode: { kg_llm_preferred: 1 }, byFinalEngine: { kg_llm: 1 }, legacyFallbackCount: 0, shadowCount: 0, sampleCount: 1 },
      cache: { status: 'measured', hitRate: 1, sampleCount: 1 },
      eval: { total: 1, byStatus: { passed: 1 } },
      risks: { unauthorizedEvidenceCount: 0, highRiskAutoExecutionCount: 0 },
    });
    api.getAgentGovernanceCapabilityHealth.mockResolvedValue({
      activeManifestVersion: 'v-local-smoke',
      total: 1,
      enabled: 1,
      disabled: 0,
      byReleaseStrategy: { auto_publish: 1 },
      byRiskLevel: { low: 1 },
    });
    api.getAgentGovernanceEvalRuns.mockResolvedValue({
      generatedAt: now,
      summary: { pass: true, totalQuestions: 1, p0Questions: 1 },
      metrics: { p0Accuracy: 1, highRiskAutoPublish: 0 },
      gates: [],
    });
    api.getAgentGovernanceAutoPublishLogs.mockResolvedValue(listResult([], 5));
    api.getAgentGovernanceUncoveredTop.mockResolvedValue([]);

    const wordNode = {
      id: 'word:人效',
      type: 'Word',
      name: '人效',
      displayName: '人效',
      source: 'manual',
      confidence: 0.9,
      updatedAt: now,
    };
    const businessNode = {
      id: 'business-object:beautician',
      type: 'BusinessObject',
      name: 'Beautician',
      displayName: '美容师',
      source: 'business_object_catalog',
      confidence: 1,
      updatedAt: now,
    };
    const capabilityNode = {
      id: 'capability:finance.staff-commission.metric',
      type: 'Capability',
      name: 'finance.staff-commission.metric',
      displayName: '员工提成统计',
      source: 'manifest',
      confidence: 1,
      updatedAt: now,
    };

    api.getAgentKnowledgeGraphNodes.mockResolvedValue(listResult([wordNode, capabilityNode], 20));
    api.getAgentKnowledgeGraphGaps.mockResolvedValue([]);
    api.getAgentKnowledgeGraphVisualize.mockResolvedValue({
      focusId: undefined,
      depth: 2,
      nodes: [wordNode, businessNode, capabilityNode],
      edges: [
        {
          id: 'SYNONYM_OF:word:人效->business-object:beautician',
          type: 'SYNONYM_OF',
          from: 'word:人效',
          to: 'business-object:beautician',
          label: '人效',
          source: 'manual',
          confidence: 0.9,
          updatedAt: now,
        },
      ],
    });
    api.getAgentKnowledgeGraphSynonyms.mockResolvedValue(listResult([], 8));
    api.getAgentKnowledgeGraphExcludes.mockResolvedValue(listResult([], 8));
    api.getAgentKnowledgeGraphNode.mockImplementation(async (id: string) => {
      if (id === 'capability:finance.staff-commission.metric') {
        return {
          node: capabilityNode,
          outgoing: [],
          incoming: [],
          relatedNodes: [],
        };
      }
      return {
        node: wordNode,
        outgoing: [],
        incoming: [],
        relatedNodes: [businessNode],
      };
    });

    renderAgentGovernanceCenter();

    await screen.findByRole('heading', { name: 'AI 治理中心' });
    await userEvent.click(screen.getByRole('tab', { name: '知识图谱' }));
    expect((await screen.findAllByText('人效')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: '详情' })[0]);
    expect(await screen.findByRole('heading', { name: '图谱节点详情' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '进入同义词治理' }));
    expect(screen.getByPlaceholderText('目标节点 ID')).toHaveValue('business-object:beautician');
    expect(screen.getByPlaceholderText('同义词')).toHaveValue('人效');
    expect(screen.getAllByPlaceholderText('原因')[0]).toHaveValue('从图谱 Word 节点 word:人效 发起同义词治理');

    await userEvent.click(screen.getByRole('button', { name: '创建缺口告警' }));
    expect(screen.getByText('孤立节点待治理')).toBeInTheDocument();
    expect(screen.getByText(/当前定位/)).toBeInTheDocument();
    expect(screen.getAllByText('word:人效').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getAllByRole('button', { name: '详情' })[1]);

    expect((await screen.findAllByText('员工提成统计')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '进入能力中心' })).toHaveAttribute(
      'href',
      '/system/agent-capabilities?capabilityId=finance.staff-commission.metric',
    );
  });
});
