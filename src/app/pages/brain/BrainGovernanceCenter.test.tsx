import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainGovernanceCenter } from './BrainGovernanceCenter';

const brainApi = vi.hoisted(() => ({
  listBrainTraces: vi.fn(),
  getBrainTrace: vi.fn(),
  listBrainSkills: vi.fn(),
  listBrainResourceVersions: vi.fn(),
  getBrainGovernanceRuntimeConfig: vi.fn(),
  listBrainReleases: vi.fn(),
  createBrainRolloutSequence: vi.fn(),
  activateBrainRelease: vi.fn(),
  rollbackBrainRelease: vi.fn(),
  rollbackBrainReleaseToRules: vi.fn(),
  rejectBrainRelease: vi.fn(),
  submitBrainReleaseModification: vi.fn(),
  listBrainCapabilityRegenerationJobs: vi.fn(),
  retryBrainCapabilityRegenerationJob: vi.fn(),
}));

vi.mock('@/api/brain', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/api/brain');
  return { ...actual, ...brainApi };
});

const capabilitySnapshot = {
  name: '商品销售排行',
  description: '读取商品销售明细并按销量排序',
  readOnly: true,
  sideEffect: false,
  allowedRoles: ['store_manager', 'finance'],
  permissions: ['core:orders:view'],
  riskLevel: 'low',
  requiresConfirmation: false,
  grounding: 'business_definition',
  domains: ['sales'],
  intents: ['ranking'],
  definitionRefs: ['metric.product_sales_quantity@2'],
  tests: { contract: 'passed', security: 'passed', eval: 'passed' },
};

function renderCenter() {
  return render(
    <MemoryRouter>
      <BrainGovernanceCenter />
    </MemoryRouter>,
  );
}

describe('BrainGovernanceCenter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    brainApi.listBrainTraces.mockResolvedValue({
      items: [{ id: 77, status: 'completed', input: { message: '明天下午空档补齐' }, createdAt: '2026-07-13T08:00:00.000Z' }],
      total: 1,
    });
    brainApi.getBrainTrace.mockResolvedValue({
      id: 77,
      status: 'completed',
      input: { message: '明天下午空档补齐' },
      output: {
        cognitionMode: 'model',
        model: 'gpt-test',
        provider: 'openai',
        semanticIntent: {
          schemaVersion: '1.0',
          objective: '明天下午空档补齐',
          intent: 'workflow',
          domains: ['front_desk', 'customer_service'],
          confidence: 0.95,
        },
        adapterMetadata: {
          supervisorPlan: {
            planId: 'workflow:gap-fill',
            objective: '明天下午空档补齐',
            nodes: [
              { id: 'schedule', capabilityKey: 'reservation_list', capabilityVersion: 1, dependsOn: [] },
              { id: 'candidates', capabilityKey: 'customer_facts', capabilityVersion: 1, dependsOn: [] },
              { id: 'draft', capabilityKey: 'customer_follow_up_draft', capabilityVersion: 1, dependsOn: ['schedule', 'candidates'], previewOnly: true },
            ],
          },
          observations: [
            { nodeId: 'schedule', capabilityKey: 'reservation_list', status: 'completed', grounding: 'db_skill' },
            { nodeId: 'candidates', capabilityKey: 'customer_facts', status: 'completed', grounding: 'db_skill' },
          ],
          completion: { status: 'complete', missingCriteria: [], recoverable: false },
        },
      },
      steps: [
        {
          id: 1,
          runId: 77,
          stepKey: 'cognition_diff',
          layer: 'cognition',
          status: 'completed',
          output: {
            intent: { rules: 'operation', model: 'workflow', matched: false },
            domain: { rules: ['front_desk'], model: ['front_desk', 'customer_service'], matched: false },
          },
          createdAt: '2026-07-13T08:00:01.000Z',
        },
        {
          id: 2,
          runId: 77,
          stepKey: 'supervisor_model_plan',
          layer: 'planning',
          status: 'completed',
          output: {
            candidateCapabilities: [
              { key: 'reservation_list', version: 1, name: '预约清单', score: 0.94 },
              { key: 'customer_facts', version: 1, name: '客户事实', score: 0.91 },
            ],
          },
          createdAt: '2026-07-13T08:00:02.000Z',
        },
      ],
    });
    brainApi.listBrainSkills.mockResolvedValue({
      items: [{ id: 11, skillKey: 'product_sales_ranking', version: 2, enabled: true, ...capabilitySnapshot }],
    });
    brainApi.listBrainResourceVersions.mockImplementation((params?: { status?: string }) =>
      Promise.resolve(params?.status
        ? { items: [{ id: 21, resourceType: 'skill', resourceKey: 'product_sales_ranking', version: 2, status: 'draft', snapshot: capabilitySnapshot }] }
        : {
            items: [
              { id: 31, resourceType: 'semantic_intent', resourceKey: 'brain_semantic_intent', version: 2, status: 'active', snapshot: { schemaVersion: '1.0' } },
              { id: 32, resourceType: 'plan_template', resourceKey: 'schedule_candidates_draft', version: 1, status: 'active', snapshot: { objective: '空档补齐', nodes: 3 } },
            ],
          }),
    );
    brainApi.getBrainGovernanceRuntimeConfig.mockResolvedValue({
      configured: { cognitionMode: 'rules', plannerMode: 'rules', capabilityTopK: 8, maxPlanNodes: 8, maxReplans: 2 },
      effective: { mode: 'shadow', releaseId: 60, releaseKey: 'brain-r1-shadow', userPercentage: 100 },
    });
    brainApi.listBrainReleases.mockResolvedValue({
      items: [{
        id: 61,
        releaseKey: 'brain-r2-shadow',
        scope: 'percentage',
        rollout: { stage: 'shadow', mode: 'shadow', userPercentage: 100 },
        status: 'draft',
        previousReleaseId: 60,
        createdAt: '2026-07-13T09:00:00.000Z',
        items: [{ id: 71, resourceType: 'skill', resourceKey: 'product_sales_ranking', version: 2, snapshot: capabilitySnapshot }],
      }],
    });
    brainApi.createBrainRolloutSequence.mockResolvedValue({ items: [], stages: ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'] });
    brainApi.activateBrainRelease.mockResolvedValue({ id: 61, status: 'active' });
    brainApi.rollbackBrainRelease.mockResolvedValue({ id: 60, status: 'active' });
    brainApi.rollbackBrainReleaseToRules.mockResolvedValue({ id: 60, status: 'active' });
    brainApi.rejectBrainRelease.mockResolvedValue({ id: 61, status: 'archived' });
    brainApi.submitBrainReleaseModification.mockResolvedValue({ requestType: 'capability_regeneration', status: 'queued' });
    brainApi.listBrainCapabilityRegenerationJobs.mockResolvedValue({ items: [] });
    brainApi.retryBrainCapabilityRegenerationJob.mockResolvedValue({
      id: 501,
      releaseId: 61,
      status: 'queued',
      progress: 0,
      affectedCapabilities: ['product_sales_ranking'],
      staticGatesPassed: 0,
      contractCompileSecurity: [],
      risk: {},
      blockingReasons: [],
      errorCode: null,
      errorMessage: null,
      retryable: true,
      nextAction: 'retry',
      generatedResourceVersionIds: [],
    });
  });

  it('renders the model planning workspace alongside existing governance areas', () => {
    renderCenter();

    expect(screen.getByRole('button', { name: '会话追踪' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '模型规划' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '评测中心' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布中心' })).toBeInTheDocument();
  });

  it('shows intent versions, runtime config, capability cards, candidates, DAG, observations and completion', async () => {
    renderCenter();
    await userEvent.click(screen.getByRole('button', { name: '模型规划' }));

    expect(await screen.findByText('语义意图版本')).toBeInTheDocument();
    expect(screen.getByText('模型运行配置')).toBeInTheDocument();
    expect(screen.getByText('Capability Card')).toBeInTheDocument();
    expect(screen.getByText('Plan Template')).toBeInTheDocument();
    expect(screen.getByText('规则 / 模型意图差异')).toBeInTheDocument();
    expect(screen.getByText('候选能力')).toBeInTheDocument();
    expect(screen.getByText('执行 DAG')).toBeInTheDocument();
    expect(screen.getByText('Observation')).toBeInTheDocument();
    expect(screen.getByText('完成判定')).toBeInTheDocument();
    expect(screen.getByText('预约清单')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByText('完整完成')).toBeInTheDocument();
  });

  it('uses a business approval card with approve, modify and reject as the only draft commands', async () => {
    renderCenter();
    await userEvent.click(screen.getByRole('button', { name: '发布中心' }));

    expect(await screen.findByText('读取商品销售明细并按销量排序')).toBeInTheDocument();
    expect(screen.getByText('只读')).toBeInTheDocument();
    expect(screen.getByText('低风险')).toBeInTheDocument();
    expect(screen.getByText('店长、财务')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批准发布' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改要求' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '修改要求' }));
    await userEvent.type(screen.getByLabelText('修改要求'), '只允许店长使用，手机号必须脱敏');
    await userEvent.click(screen.getByRole('button', { name: '提交修改要求' }));

    await waitFor(() => {
      expect(brainApi.submitBrainReleaseModification).toHaveBeenCalledWith(61, '只允许店长使用，手机号必须脱敏');
    });
  });

  it('filters capability change requests out of the publishable draft list', async () => {
    brainApi.listBrainResourceVersions.mockResolvedValue({
      items: [
        { id: 21, resourceType: 'skill', resourceKey: 'product_sales_ranking', version: 2, status: 'draft', snapshot: capabilitySnapshot },
        { id: 99, resourceType: 'capability_change_request', resourceKey: 'regeneration.secret', version: 1, status: 'draft', snapshot: { name: '不应展示的变更请求' } },
      ],
    });
    renderCenter();
    await userEvent.click(screen.getByRole('button', { name: '发布中心' }));

    expect((await screen.findAllByText('商品销售排行')).length).toBeGreaterThan(0);
    expect(screen.queryByText('不应展示的变更请求')).not.toBeInTheDocument();
  });

  it('polls an active regeneration job with backoff and stops at completion', async () => {
    const user = userEvent.setup();
    const queued = {
      id: 501,
      releaseId: 61,
      status: 'queued',
      progress: 0,
      affectedCapabilities: ['product_sales_ranking'],
      staticGatesPassed: 0,
      contractCompileSecurity: [],
      risk: { overall: 'medium' },
      blockingReasons: [],
      errorCode: null,
      errorMessage: null,
      retryable: false,
      nextAction: 'none',
      generatedResourceVersionIds: [],
    };
    const completed = {
      ...queued,
      status: 'completed',
      progress: 100,
      staticGatesPassed: 4,
      contractCompileSecurity: ['contract', 'compile', 'security'],
      generatedResourceVersionIds: [88],
    };
    brainApi.listBrainCapabilityRegenerationJobs
      .mockResolvedValueOnce({ items: [queued] })
      .mockResolvedValueOnce({ items: [completed] });

    renderCenter();
    await user.click(screen.getByRole('button', { name: '发布中心' }));
    await waitFor(() => expect(brainApi.listBrainCapabilityRegenerationJobs).toHaveBeenCalled());
    expect(await screen.findByText('等待自动再生成')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批准发布' })).toBeDisabled();

    expect(await screen.findByText('已生成新草稿', {}, { timeout: 5_000 })).toBeInTheDocument();
    const callsAtCompletion = brainApi.listBrainCapabilityRegenerationJobs.mock.calls.length;

    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 3_200)));
    expect(brainApi.listBrainCapabilityRegenerationJobs).toHaveBeenCalledTimes(callsAtCompletion);
  });

  it('shows blocked reasons and retries a blocked regeneration job', async () => {
    brainApi.listBrainCapabilityRegenerationJobs.mockResolvedValue({
      items: [{
        id: 502,
        releaseId: 61,
        status: 'blocked',
        progress: 100,
        affectedCapabilities: ['product_sales_ranking'],
        staticGatesPassed: 2,
        contractCompileSecurity: ['contract', 'compile'],
        risk: { overall: 'blocked' },
        blockingReasons: ['runtime_redaction_policy_unavailable'],
        errorCode: 'regeneration_blocked',
        errorMessage: 'runtime_redaction_policy_unavailable',
        retryable: true,
        nextAction: 'retry',
        generatedResourceVersionIds: [],
      }],
    });
    renderCenter();
    await userEvent.click(screen.getByRole('button', { name: '发布中心' }));

    await waitFor(() => expect(brainApi.listBrainCapabilityRegenerationJobs).toHaveBeenCalled());
    expect(await screen.findByText('runtime_redaction_policy_unavailable')).toBeInTheDocument();
    expect(screen.getByText('需要修改后重试')).toBeInTheDocument();
    expect(screen.queryByText('等待自动再生成')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重新排队' }));
    expect(brainApi.retryBrainCapabilityRegenerationJob).toHaveBeenCalledWith(502);
  });

  it('hides retry and asks for requirement modification for a permanent blocker', async () => {
    brainApi.listBrainCapabilityRegenerationJobs.mockResolvedValue({ items: [{
      id: 503, releaseId: 61, status: 'blocked', progress: 100, affectedCapabilities: [],
      staticGatesPassed: 0, contractCompileSecurity: [], risk: { overall: 'blocked' },
      blockingReasons: ['无法唯一确定需要修改的能力。'], errorCode: 'affected_capability_ambiguous',
      errorMessage: '无法唯一确定需要修改的能力。', retryable: false, nextAction: 'modify_requirement',
      generatedResourceVersionIds: [], availableAt: null, leasedAt: null, completedAt: null, createdAt: null, updatedAt: null,
    }] });
    renderCenter();
    await userEvent.click(screen.getByRole('button', { name: '发布中心' }));

    expect(await screen.findByText('无法唯一确定需要修改的能力。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新排队' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '修改要求' }).length).toBeGreaterThan(0);
  });

  it('shows the business-definition action for a permanent definition blocker', async () => {
    brainApi.listBrainCapabilityRegenerationJobs.mockResolvedValue({ items: [{
      id: 504, releaseId: 61, status: 'blocked', progress: 100, affectedCapabilities: [],
      staticGatesPassed: 0, contractCompileSecurity: [], risk: { overall: 'blocked' },
      blockingReasons: ['业务口径修改待审批。'], errorCode: 'business_definition_change_pending',
      errorMessage: '业务口径修改待审批。', retryable: false, nextAction: 'complete_business_definition',
      generatedResourceVersionIds: [], availableAt: null, leasedAt: null, completedAt: null, createdAt: null, updatedAt: null,
    }] });
    renderCenter();
    await userEvent.click(screen.getByRole('button', { name: '发布中心' }));

    expect(await screen.findByRole('button', { name: '去业务口径中心' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新排队' })).not.toBeInTheDocument();
  });
});
