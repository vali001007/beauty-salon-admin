import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrainEvidencePanel } from './BrainEvidencePanel';
import type { BrainMessage, BrainRunEvent } from '@/types/brain';

const message = {
  id: 2,
  conversationId: 42,
  role: 'assistant',
  content: '本周营业额为 10,000 元。',
  metadata: {
    runId: 88,
    status: 'completed',
    citations: [],
    suggestedActions: [],
    intentSchemaVersion: '1.0',
    provider: 'kimi',
    model: 'kimi-k2',
    semanticIntent: { schemaVersion: '1.0', intent: 'metric_query', objective: '汇总本周营业额' },
  },
  createdAt: '2026-07-22T00:00:01.000Z',
} satisfies BrainMessage;

const events: BrainRunEvent[] = [
  {
    id: 1,
    runId: 88,
    stepKey: 'cognition_rules',
    layer: 'cognition',
    input: { question: '本周营业额' },
    output: { intent: 'revenue' },
    status: 'completed',
    durationMs: 120,
    durationSource: 'timeline_estimate',
    createdAt: '2026-07-22T00:00:00.120Z',
  },
  {
    id: 2,
    runId: 88,
    stepKey: 'cognition_model',
    layer: 'cognition',
    input: { question: '本周营业额', role: 'store_manager' },
    output: {
      status: 'valid',
      usage: { provider: 'kimi', model: 'kimi-k2', inputTokens: 10, outputTokens: 8 },
    },
    status: 'completed',
    durationMs: 80,
    durationSource: 'recorded',
    createdAt: '2026-07-22T00:00:00.250Z',
  },
  {
    id: 3,
    runId: 88,
    stepKey: 'release_runtime_selection',
    layer: 'runtime',
    output: { releaseId: 416, releaseKey: 'runtime-r416', releaseFingerprint: 'abcdef1234567890', mode: 'model' },
    status: 'completed',
    durationMs: 10,
    durationSource: 'recorded',
    createdAt: '2026-07-22T00:00:00.260Z',
  },
  {
    id: 4,
    runId: 88,
    stepKey: 'cognition_diff',
    layer: 'cognition',
    output: { intent: { rules: 'metric', model: 'analysis', matched: false } },
    status: 'completed',
    createdAt: '2026-07-22T00:00:00.270Z',
  },
  {
    id: 5,
    runId: 88,
    stepKey: 'supervisor_model_plan',
    layer: 'planning',
    output: {
      candidateCapabilities: [{ key: 'revenue_summary', name: '营收汇总', version: 3, score: 0.96, matchedFields: ['intent', 'metric'] }],
      plan: { objective: '汇总本周营业额', nodes: [{ id: 'revenue', capabilityKey: 'revenue_summary', capabilityVersion: 3, dependsOn: [] }] },
    },
    status: 'completed',
    createdAt: '2026-07-22T00:00:00.280Z',
  },
  {
    id: 6,
    runId: 88,
    stepKey: 'bounded_dag_execution',
    layer: 'execution',
    output: {
      observations: [
        { nodeId: 'revenue', status: 'completed', grounding: 'db_skill' },
        { nodeId: 'forecast', status: 'failed', errorCode: 'provider_timeout' },
      ],
      completion: { status: 'complete', missingCriteria: [] },
    },
    status: 'completed',
    createdAt: '2026-07-22T00:00:00.300Z',
  },
];

describe('BrainEvidencePanel', () => {
  it('shows input, output, token usage and duration for every trace step', () => {
    render(
      <BrainEvidencePanel
        message={message}
        events={events}
        loadingEvents={false}
        actionResults={{}}
        pendingActionId={null}
        feedbackLoading={false}
        onConfirmAction={vi.fn()}
        onRejectAction={vi.fn()}
        onRetryAction={vi.fn()}
        onFeedback={vi.fn()}
        activeTab="trace"
      />,
    );

    expect(screen.getByText('规则认知')).toBeInTheDocument();
    expect(screen.getAllByText('Token 0（非模型）').length).toBeGreaterThan(0);
    expect(screen.getByText('阶段间隔 120 ms')).toBeInTheDocument();
    expect(screen.getByText('模型认知')).toBeInTheDocument();
    expect(screen.getByText('Token 18')).toBeInTheDocument();
    expect(screen.getByText('耗时 80 ms')).toBeInTheDocument();

    fireEvent.click(screen.getByText('模型认知'));
    expect(screen.getByText(/Token：输入 10 · 输出 8 · 总计/)).toBeInTheDocument();
    expect(screen.getByText('模型：kimi / kimi-k2')).toBeInTheDocument();
    expect(screen.getAllByText('输入')).toHaveLength(events.length);
    expect(screen.getAllByText('输出')).toHaveLength(events.length);
    expect(screen.getByText(/"role": "store_manager"/)).toBeInTheDocument();
    expect(screen.getByText('LEGACY-RT-416')).toBeInTheDocument();
    expect(screen.getByText('未记录治理策略')).toBeInTheDocument();
    expect(screen.getByText(/运行数据库记录 #416/).closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText(/语义版本 1.0/)).toBeInTheDocument();
    expect(screen.getByText('营收汇总')).toBeInTheDocument();
    expect(screen.getByText('入选依据：intent、metric')).toBeInTheDocument();
    expect(screen.getByText('业务结果')).toBeInTheDocument();
    expect(screen.getByText('系统错误')).toBeInTheDocument();
    expect(screen.getByText('执行 DAG')).toBeInTheDocument();
    expect(screen.getByText('完整完成')).toBeInTheDocument();
  });

  it('shows runtime and governance policy as separate product identities', () => {
    const identityEvents = events.map((event) => event.stepKey === 'release_runtime_selection' ? {
      ...event,
      output: {
        ...event.output,
        governancePolicyReleaseId: 460,
        governancePolicyMode: 'enforced',
        governanceTransitionStatus: 'completed',
        runtimeProductIdentity: { family: 'runtime', code: 'RT-001', stageCode: 'RT-001-FULL', name: 'Query Only V1' },
        governancePolicyIdentity: { family: 'policy', code: 'GP-003', stageCode: null, name: 'Query Only V1 强制治理策略' },
      },
    } : event);

    render(
      <BrainEvidencePanel
        message={message}
        events={identityEvents}
        loadingEvents={false}
        actionResults={{}}
        pendingActionId={null}
        feedbackLoading={false}
        onConfirmAction={vi.fn()}
        onRejectAction={vi.fn()}
        onRetryAction={vi.fn()}
        onFeedback={vi.fn()}
        activeTab="trace"
      />,
    );

    expect(screen.getByText('RT-001-FULL · Query Only V1')).toBeInTheDocument();
    expect(screen.getByText('GP-003 · Query Only V1 强制治理策略')).toBeInTheDocument();
    expect(screen.getByText('运行版本（RT）')).toBeInTheDocument();
    expect(screen.getByText('治理策略（GP）')).toBeInTheDocument();
  });

  it('switches to the proactive risk tab and keeps paging actions available', () => {
    const onTabChange = vi.fn();
    const onInspectionPageChange = vi.fn();
    const { rerender } = render(
      <BrainEvidencePanel
        message={message}
        events={events}
        loadingEvents={false}
        actionResults={{}}
        pendingActionId={null}
        feedbackLoading={false}
        onConfirmAction={vi.fn()}
        onRejectAction={vi.fn()}
        onRetryAction={vi.fn()}
        onFeedback={vi.fn()}
        activeTab="evidence"
        onTabChange={onTabChange}
        inspectionInbox={{
          items: [],
          summary: { total: 38, critical: 2, high: 12, medium: 20, low: 4 },
          storeId: 6,
          page: 1,
          pageSize: 20,
          totalPages: 2,
        }}
        onInspectionPageChange={onInspectionPageChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: '主动风险 38' }));
    expect(onTabChange).toHaveBeenCalledWith('risks');

    rerender(
      <BrainEvidencePanel
        message={message}
        events={events}
        loadingEvents={false}
        actionResults={{}}
        pendingActionId={null}
        feedbackLoading={false}
        onConfirmAction={vi.fn()}
        onRejectAction={vi.fn()}
        onRetryAction={vi.fn()}
        onFeedback={vi.fn()}
        activeTab="risks"
        onTabChange={onTabChange}
        inspectionInbox={{
          items: [{
            id: 31,
            ruleKey: 'finance_margin_drop',
            domain: 'finance',
            title: '本月毛利下降',
            severity: 'critical',
            status: 'open',
            target: { objectType: 'store', objectId: '6' },
            evidence: { dropRate: 0.2 },
            suggestion: { action: '复核项目成本', entry: '/finance/profit', planningStatus: 'planned', actionPreviewCount: 0 },
            canReview: true,
            firstDetectedAt: '2026-07-20T01:00:00.000Z',
            lastDetectedAt: '2026-07-21T01:00:00.000Z',
          }],
          summary: { total: 38, critical: 2, high: 12, medium: 20, low: 4 },
          storeId: 6,
          page: 1,
          pageSize: 20,
          totalPages: 2,
        }}
        onInspectionPageChange={onInspectionPageChange}
      />,
    );

    expect(screen.getByText('本月毛利下降')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onInspectionPageChange).toHaveBeenCalledWith(2);
  });
});
