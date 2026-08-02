import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrainCapabilityGovernancePage,
  BrainGovernanceOverviewPage,
  BrainGovernanceTasksPage,
  BrainPolicySnapshotsPage,
} from './BrainGovernanceWorkbench';

const state = vi.hoisted(() => ({ permissions: new Set<string>() }));
const brainApi = vi.hoisted(() => ({
  approveBrainCapabilityPolicy: vi.fn(),
  cancelBrainGovernanceReads: vi.fn(),
  cancelBrainGovernanceTask: vi.fn(),
  classifyBrainCapabilityPolicy: vi.fn(),
  createBrainPolicySnapshot: vi.fn(),
  evaluateBrainCapabilityPolicy: vi.fn(),
  evaluateBrainGovernanceCandidate: vi.fn(),
  getBrainCapabilityPolicy: vi.fn(),
  getBrainGovernanceCandidate: vi.fn(),
  getBrainGovernanceProcessLatency: vi.fn(),
  getBrainGovernanceOverview: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainCapabilityPolicies: vi.fn(),
  listBrainGovernanceCandidates: vi.fn(),
  listBrainGovernanceTasks: vi.fn(),
  listBrainPolicySnapshots: vi.fn(),
  publishBrainPolicySnapshot: vi.fn(),
  prepareBrainGovernanceCandidatePolicy: vi.fn(),
  previewBrainPolicySnapshot: vi.fn(),
  retryBrainGovernanceTask: vi.fn(),
  rollbackBrainPolicySnapshot: vi.fn(),
  updateBrainCapabilityPolicyOwners: vi.fn(),
  createBrainSkill: vi.fn(),
  listBrainSkills: vi.fn(),
  listBrainSkillGovernanceHistory: vi.fn(),
  listBrainSkillGovernanceSummaries: vi.fn(),
  setBrainPublishedSkillEnabled: vi.fn(),
  updateBrainSkill: vi.fn(),
}));

vi.mock('@/api/brain', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/api/brain');
  return { ...actual, ...brainApi };
});
vi.mock('@/hooks/usePermission', () => ({ usePermission: (permission: string) => state.permissions.has(permission) }));
vi.mock('../brainGovernanceNavigation', () => ({ BRAIN_GOVERNANCE_UI_MODE: 'manage' }));

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output>;
}

function renderPage(element: React.ReactNode, path: string) {
  return render(<MemoryRouter initialEntries={[path]}>{element}<LocationProbe /></MemoryRouter>);
}

function apiError(payload: Record<string, unknown>) {
  return Object.assign(new Error(String(payload.message ?? '请求失败')), { payload });
}

const highRiskPolicy = {
  id: 11,
  resourceType: 'capability_policy',
  resourceKey: 'refund_execute',
  version: 2,
  status: 'draft',
  checksum: 'a'.repeat(64),
  snapshot: {},
  createdBy: 9,
  createdAt: '2026-08-01T00:00:00.000Z',
  policy: {
    schemaVersion: 1 as const,
    capabilityKey: 'refund_execute',
    riskLevel: 'high' as const,
    mode: 'preview' as const,
    whitelistStatus: 'pending' as const,
    runtimeEnforcementStatus: 'pending_runtime' as const,
    permissions: ['core:order:refund'],
    owners: { product: 'finance' },
    evidence: [{ receiptId: 'receipt-1' }],
    impact: {},
    reason: '退款只允许预览',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
};

describe('Brain governance V2 workbench', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    state.permissions = new Set(['core:brain-governance:view']);
    brainApi.getBrainGovernanceOverview.mockResolvedValue({
      pending: { unclassified: 3, evaluating: 2, pendingApproval: 1, revisionRequired: 4 },
      risk: { low: 5, medium: 2, high: 1, critical: 0, unclassified: 3 },
      whitelist: { not_allowed: 3, pending: 1, approved: 4, suspended: 0, expired: 1 },
      runtimePending: 2,
      latestPolicySnapshot: { id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: 'active', createdAt: '2026-08-01T00:00:00.000Z' },
      runtimeRelease: { id: 416, releaseKey: 'runtime-r416', scope: 'global', rollout: {}, status: 'active', createdAt: '2026-07-22T00:00:00.000Z' },
      runtimeConsistency: 'policy_published_runtime_pending',
      runtimeGovernance: null,
      efficiency: { completed7d: 8, p50DurationMs: 2000, p95DurationMs: 8000, autoAdmissionRate: 0.5, manualOverrideRate: 0.125 },
    });
    brainApi.getBrainGovernanceProcessLatency.mockResolvedValue({
      range: { from: '2026-07-26T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' },
      candidateCount: 3,
      metrics: {
        candidateGate: { p50Ms: 12_000, p95Ms: 20_000, averageMs: 14_000, sampleSize: 3, unavailableReason: null },
        waitingEvidence: { p50Ms: 60_000, p95Ms: 90_000, averageMs: 65_000, sampleSize: 2, unavailableReason: null },
        waitingApproval: { p50Ms: null, p95Ms: null, averageMs: null, sampleSize: 0, unavailableReason: 'no_complete_samples' },
        candidateToShadow: { p50Ms: 120_000, p95Ms: 180_000, averageMs: 130_000, sampleSize: 2, unavailableReason: null },
        shadowToFull: { p50Ms: 300_000, p95Ms: 420_000, averageMs: 320_000, sampleSize: 1, unavailableReason: null },
        receiptIngest: { p50Ms: 500, p95Ms: 800, averageMs: 600, sampleSize: 3, unavailableReason: null },
      },
      gateReuse: { reused: 6, total: 10, rate: 0.6, avoidedModelInvocations: 4, executedModelInvocations: 2 },
      taskOutcomes: { terminal: 8, firstPass: 6, retried: 2, firstPassRate: 0.75, retryRate: 0.25 },
    });
    brainApi.listBrainCapabilityPolicies.mockResolvedValue({ items: [highRiskPolicy], total: 1, page: 1, pageSize: 20 });
    brainApi.listBrainGovernanceCandidates.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 3 });
    brainApi.getBrainCapabilityPolicy.mockResolvedValue({ current: highRiskPolicy, history: [highRiskPolicy], evidence: [] });
    brainApi.getBrainGovernanceCandidate.mockResolvedValue({
      id: 17,
      candidateKey: 'owner/repo:head:merge',
      repository: 'owner/repo',
      eventName: 'pull_request',
      branch: 'feature/governance',
      baseCommit: '1'.repeat(40),
      mergeBaseCommit: '2'.repeat(40),
      headCommit: '3'.repeat(40),
      changedFilesChecksum: 'a'.repeat(64),
      diffChecksum: 'b'.repeat(64),
      sourceFingerprint: 'c'.repeat(64),
      riskLevel: 'medium',
      status: 'ready',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
      receipts: [],
      tasks: [],
      affectedCapabilities: ['customer_facts'],
      blockers: [],
      policyDiff: { added: [{ capabilityKey: 'customer_facts' }], changed: [], removed: [], unchanged: [], hasDiff: true },
      policyReadiness: { decision: 'create_snapshot', blockers: [] },
      releaseReadiness: { sequenceId: 71, currentStage: 'shadow', releaseId: 91, releaseKey: 'candidate-shadow', status: 'ready', canRelease: true, blockers: [] },
      rolloutSequence: { id: 71 },
    });
    brainApi.previewBrainPolicySnapshot.mockResolvedValue({
      candidate: { id: 17, candidateKey: 'owner/repo:head:merge', headCommit: '3'.repeat(40), status: 'ready' },
      decision: 'create_snapshot',
      activeSnapshot: null,
      preparedSnapshot: null,
      affectedCapabilities: ['customer_facts'],
      diff: { added: [{ capabilityKey: 'customer_facts' }], changed: [], removed: [], unchanged: [], hasDiff: true },
      blockers: [],
      resourceVersionIds: [11],
    });
    brainApi.prepareBrainGovernanceCandidatePolicy.mockResolvedValue({
      candidate: { id: 17, candidateKey: 'owner/repo:head:merge', headCommit: '3'.repeat(40), status: 'ready' },
      decision: 'created',
      activeSnapshot: null,
      preparedSnapshot: null,
      snapshot: { id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', status: 'draft', createdAt: '2026-08-02T00:00:00.000Z' },
      affectedCapabilities: ['customer_facts'],
      diff: { added: [{ capabilityKey: 'customer_facts' }], changed: [], removed: [], unchanged: [], hasDiff: true },
      blockers: [],
      resourceVersionIds: [11],
    });
    brainApi.listBrainGovernanceTasks.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    brainApi.listBrainPolicySnapshots.mockResolvedValue({
      items: [{ id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: 'draft', previousReleaseId: 6, createdAt: '2026-08-01T00:00:00.000Z', items: [] }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    brainApi.listBrainSkillGovernanceSummaries.mockResolvedValue({ items: [] });
    brainApi.listBrainSkills.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows policy/runtime separation and sends overview cards to URL-restorable filters', async () => {
    const user = userEvent.setup();
    renderPage(<BrainGovernanceOverviewPage />, '/brain-governance/workbench?tab=overview');

    expect(await screen.findByText('治理策略发布不会自动改变当前 Brain 运行状态。')).toBeInTheDocument();
    expect(screen.getByText('governance-v7')).toBeInTheDocument();
    expect(screen.getByText('runtime-r416')).toBeInTheDocument();
    expect(screen.getByText('最近 7 天端到端治理效率')).toBeInTheDocument();
    expect(screen.getByText('12 秒（3 个样本）')).toBeInTheDocument();
    expect(screen.getByText('<1 秒（3 个样本）')).toBeInTheDocument();
    expect(screen.getByText('暂无完整样本')).toBeInTheDocument();
    expect(screen.getByText('60%（6/10）')).toBeInTheDocument();
    expect(screen.getByText('75% / 25%')).toBeInTheDocument();
    expect(screen.getByText('4 / 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /待审批/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/brain-governance/workbench?tab=tasks&status=pending_approval');
  });

  it('shows the current Candidate as the governance command context and evaluates affected capabilities in one action', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage']);
    brainApi.listBrainGovernanceCandidates.mockResolvedValue({
      items: [{
        id: 17,
        candidateKey: 'owner/repo:head:merge',
        repository: 'owner/repo',
        eventName: 'pull_request',
        branch: 'feature/governance',
        baseCommit: '1'.repeat(40),
        mergeBaseCommit: '2'.repeat(40),
        headCommit: '3'.repeat(40),
        changedFilesChecksum: 'a'.repeat(64),
        diffChecksum: 'b'.repeat(64),
        sourceFingerprint: 'c'.repeat(64),
        riskLevel: 'medium',
        status: 'checking',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
        _count: { receipts: 1, tasks: 2 },
      }],
      total: 1,
      page: 1,
      pageSize: 3,
    });
    brainApi.evaluateBrainGovernanceCandidate.mockResolvedValue({ candidateId: 17, taskIds: [201, 202], status: 'governing' });
    const user = userEvent.setup();
    renderPage(<BrainGovernanceOverviewPage />, '/brain-governance/workbench?tab=overview');

    expect(await screen.findByText('feature/governance')).toBeInTheDocument();
    expect(screen.getByText('3333333333')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '评估受影响能力' }));
    expect(brainApi.evaluateBrainGovernanceCandidate).toHaveBeenCalledWith('owner/repo:head:merge');
    await user.click(screen.getByRole('button', { name: '候选详情' }));
    expect(await screen.findByText(/Release candidate-shadow 已满足当前阶段门禁/)).toBeInTheDocument();
    expect(screen.getByText('策略差异与发布准备度')).toBeInTheDocument();
  });

  it('restores capability filters from URL and makes high-risk approval explicitly non-executable', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:approve']);
    const user = userEvent.setup();
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities&riskLevel=high&owner=finance&blockerType=business&actionableOnly=true');

    expect(await screen.findByText('refund_execute')).toBeInTheDocument();
    expect(brainApi.listBrainCapabilityPolicies).toHaveBeenCalledWith(expect.objectContaining({
      riskLevel: 'high',
      owner: 'finance',
      blockerType: 'business',
      actionableOnly: true,
    }));
    expect(screen.getByRole('button', { name: '治理审批' })).toHaveAttribute('title', '仅审批治理结论，不进入普通执行白名单');
    expect(screen.queryByRole('button', { name: '审批准入' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '分类' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '详情' }));
    expect(screen.getByTestId('location')).toHaveTextContent('riskLevel=high&owner=finance&blockerType=business&actionableOnly=true&selectedId=refund_execute');
    expect(await screen.findByText('禁止普通执行白名单')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/brain-governance/workbench?tab=capabilities&riskLevel=high&owner=finance&blockerType=business&actionableOnly=true'));
    expect(screen.getByTestId('location')).not.toHaveTextContent('selectedId');
  });

  it('restores an open capability drawer from selectedId and ignores a slower previous filter response', async () => {
    const user = userEvent.setup();
    let resolveHigh: ((value: { items: Array<typeof highRiskPolicy>; total: number; page: number; pageSize: number }) => void) | undefined;
    const mediumPolicy = {
      ...highRiskPolicy,
      id: 12,
      resourceKey: 'customer_facts',
      policy: { ...highRiskPolicy.policy, capabilityKey: 'customer_facts', riskLevel: 'medium' as const, reason: '客户事实预览' },
    };
    brainApi.listBrainCapabilityPolicies.mockImplementation((query: { riskLevel?: string }) => {
      if (query.riskLevel === 'high') {
        return new Promise((resolve) => { resolveHigh = resolve; });
      }
      return Promise.resolve({ items: [mediumPolicy], total: 1, page: 1, pageSize: 20 });
    });
    renderPage(
      <BrainCapabilityGovernancePage />,
      '/brain-governance/workbench?tab=capabilities&riskLevel=high&selectedId=refund_execute',
    );

    expect(await screen.findByRole('dialog', { name: 'refund_execute' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('风险'), 'medium');
    expect(brainApi.cancelBrainGovernanceReads).toHaveBeenCalled();
    expect(await screen.findByText('customer_facts')).toBeInTheDocument();
    resolveHigh?.({ items: [highRiskPolicy], total: 1, page: 1, pageSize: 20 });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('customer_facts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'refund_execute' })).not.toBeInTheDocument();
  });

  it('uses server pagination so all capability policies remain reachable', async () => {
    brainApi.listBrainCapabilityPolicies.mockResolvedValue({ items: [highRiskPolicy], total: 41, page: 1, pageSize: 20 });
    const user = userEvent.setup();
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities&page=1');

    expect(await screen.findByText('第 1/3 页，共 41 项')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(brainApi.listBrainCapabilityPolicies).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    expect(screen.getByTestId('location')).toHaveTextContent('page=2');
  });

  it('defaults a direct capability entry to the latest non-terminal Candidate', async () => {
    brainApi.listBrainGovernanceCandidates.mockResolvedValue({
      items: [
        { id: 18, candidateKey: 'owner/repo:completed', branch: 'old', headCommit: '2'.repeat(40), status: 'completed' },
        { id: 17, candidateKey: 'owner/repo:current', branch: 'feature/governance', headCommit: '3'.repeat(40), status: 'governing' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities');

    await waitFor(() => expect(brainApi.listBrainCapabilityPolicies).toHaveBeenCalledWith(expect.objectContaining({
      candidateKey: 'owner/repo:current',
      affectedOnly: true,
    })));
    expect(screen.getByTestId('location')).toHaveTextContent('candidateKey=owner%2Frepo%3Acurrent');
    expect(screen.getByTestId('location')).toHaveTextContent('affectedOnly=true');
    expect(screen.getByRole('button', { name: '查看全部能力' })).toBeInTheDocument();
  });

  it('keeps an explicit all-capabilities scope and does not redirect back to a Candidate', async () => {
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities&scope=all');

    expect(await screen.findByText('refund_execute')).toBeInTheDocument();
    expect(brainApi.listBrainGovernanceCandidates).not.toHaveBeenCalled();
    expect(brainApi.listBrainCapabilityPolicies).toHaveBeenCalledWith(expect.objectContaining({
      candidateKey: undefined,
      affectedOnly: false,
    }));
    expect(screen.getByTestId('location')).toHaveTextContent('scope=all');
  });

  it('evaluates all affected capabilities through the current Candidate batch action', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage']);
    brainApi.evaluateBrainGovernanceCandidate.mockResolvedValue({ candidateId: 17, taskIds: [201, 202], status: 'governing' });
    const user = userEvent.setup();
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities&candidateKey=owner%2Frepo%3Ahead%3Amerge&affectedOnly=true');

    expect(await screen.findByText('refund_execute')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '批量评估当前 Candidate' }));

    expect(brainApi.evaluateBrainGovernanceCandidate).toHaveBeenCalledWith('owner/repo:head:merge');
    await user.click(screen.getByRole('button', { name: '查看全部能力' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/brain-governance/workbench?tab=capabilities&scope=all');
  });

  it('updates the owner without reclassifying or resetting the governance conclusion', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage']);
    brainApi.updateBrainCapabilityPolicyOwners.mockResolvedValue({
      ...highRiskPolicy,
      version: 3,
      policy: { ...highRiskPolicy.policy, owners: { product: 'finance', primary: 'risk-team' } },
    });
    const user = userEvent.setup();
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities');

    expect(await screen.findByText('refund_execute')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '负责人' }));
    const dialog = await screen.findByRole('dialog', { name: '指定治理负责人' });
    const input = within(dialog).getByLabelText('负责人');
    await user.type(input, 'risk-team');
    await user.click(within(dialog).getByRole('button', { name: '保存负责人' }));

    expect(brainApi.updateBrainCapabilityPolicyOwners).toHaveBeenCalledWith('refund_execute', {
      owners: { product: 'finance', primary: 'risk-team' },
      reason: '更新治理负责人：risk-team',
    });
    expect(brainApi.classifyBrainCapabilityPolicy).not.toHaveBeenCalled();
  });

  it('returns a pending capability for revision with an approval reason', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:approve']);
    vi.spyOn(window, 'prompt').mockReturnValue('补充权限覆盖证据');
    const user = userEvent.setup();
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities');

    expect(await screen.findByText('refund_execute')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '退回修订' }));

    expect(brainApi.approveBrainCapabilityPolicy).toHaveBeenCalledWith('refund_execute', {
      decision: 'revision_required',
      reason: '补充权限覆盖证据',
    });
  });

  it('groups trusted, expired, stale and signature-failed evidence in capability details', async () => {
    brainApi.getBrainCapabilityPolicy.mockResolvedValue({
      current: highRiskPolicy,
      history: [highRiskPolicy],
      evidence: [
        { id: 1, receiptKey: 'trusted', trustLevel: 'trusted_candidate', verificationStatus: 'verified', status: 'passed', expiresAt: '2099-01-01T00:00:00.000Z' },
        { id: 2, receiptKey: 'expired', trustLevel: 'trusted_candidate', verificationStatus: 'verified', status: 'passed', expiresAt: '2020-01-01T00:00:00.000Z' },
        { id: 3, receiptKey: 'stale', trustLevel: 'trusted_candidate', verificationStatus: 'verified', status: 'stale', expiresAt: '2099-01-01T00:00:00.000Z' },
        { id: 4, receiptKey: 'bad-signature', trustLevel: 'trusted_candidate', verificationStatus: 'rejected', verificationError: 'signature_invalid', status: 'passed', expiresAt: '2099-01-01T00:00:00.000Z' },
      ],
      candidateImpacts: [{ id: 5, changeType: 'modified', impactRuleId: 'resolver-change', receipt: { candidate: { candidateKey: 'owner/repo:head:merge', branch: 'feature/governance', headCommit: '3'.repeat(40) } } }],
      tasks: [{ id: 21, idempotencyKey: 'task-21', taskType: 'evaluate', stage: 'candidate', resourceKey: 'refund_execute', riskLevel: 'high', status: 'pending_approval', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:05.000Z' }],
      auditEvents: [{ id: 31, eventType: 'task_pending_approval', actorType: 'system', createdAt: '2026-08-01T00:00:05.000Z' }],
    });
    const user = userEvent.setup();
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities');

    expect(await screen.findByText('refund_execute')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '详情' }));

    expect(await screen.findByText('可信证据')).toBeInTheDocument();
    expect(screen.getByText(/有效至/)).toBeInTheDocument();
    expect(screen.getByText(/已于.*过期/)).toBeInTheDocument();
    expect(screen.getByText('候选身份或能力证据已变化，当前不可复用')).toBeInTheDocument();
    expect(screen.getByText('验签失败：signature_invalid')).toBeInTheDocument();
    expect(screen.getByText(/feature\/governance · modified/)).toBeInTheDocument();
    expect(screen.getByText(/#21 · evaluate · 待审批/)).toBeInTheDocument();
    expect(screen.getByText(/task_pending_approval/)).toBeInTheDocument();
  });

  it('moves Skill registration and unmanaged history into the capability workspace', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain:use']);
    brainApi.listBrainSkillGovernanceSummaries.mockResolvedValue({
      items: [{
        versionId: 1053,
        skillId: 2053,
        skillKey: 'appointment_gap_list',
        name: '预约空档查询',
        description: '查询预约空档',
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
      }],
    });
    brainApi.listBrainSkills.mockResolvedValue({
      items: [{ id: 99, skillKey: 'legacy_follow_up', name: '历史跟进技能', version: 1, enabled: false, domains: [] }],
    });

    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities&panel=skills');

    expect(await screen.findByText('预约空档查询')).toBeInTheDocument();
    expect(screen.getByText('历史跟进技能')).toBeInTheDocument();
    expect(screen.getByText('已纳管 1')).toBeInTheDocument();
    expect(screen.getByText('待纳管 1')).toBeInTheDocument();
    expect(screen.getAllByText('待纳管').length).toBeGreaterThan(0);
    expect(brainApi.listBrainCapabilityPolicies).not.toHaveBeenCalled();
  });

  it('keeps policy snapshots read-only without manage/publish permission and states the activation boundary', async () => {
    renderPage(<BrainPolicySnapshotsPage />, '/brain-governance/policy-snapshots');

    expect(await screen.findByText(/这里发布的是治理规则/)).toBeInTheDocument();
    expect(screen.getByText(/不会自动激活 Skill、Semantic 或当前 Brain Runtime Release/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /创建快照/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /发布策略/ })).not.toBeInTheDocument();
  });

  it('prepares a policy through the candidate-scoped endpoint', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage']);
    brainApi.listBrainGovernanceCandidates.mockResolvedValue({
      items: [{
        id: 17,
        candidateKey: 'owner/repo:head:merge',
        repository: 'owner/repo',
        eventName: 'pull_request',
        branch: 'feature/governance',
        baseCommit: '1'.repeat(40),
        mergeBaseCommit: '2'.repeat(40),
        headCommit: '3'.repeat(40),
        changedFilesChecksum: 'a'.repeat(64),
        diffChecksum: 'b'.repeat(64),
        sourceFingerprint: 'c'.repeat(64),
        riskLevel: 'medium',
        status: 'ready',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    const user = userEvent.setup();
    renderPage(<BrainPolicySnapshotsPage />, '/brain-governance/policy-snapshots');

    await waitFor(() => expect(screen.getAllByRole('combobox').length).toBeGreaterThan(1));
    await user.selectOptions(screen.getAllByRole('combobox')[0]!, 'owner/repo:head:merge');
    await user.click(screen.getByRole('button', { name: '准备策略' }));

    expect(brainApi.prepareBrainGovernanceCandidatePolicy).toHaveBeenCalledWith(
      'owner/repo:head:merge',
      'governance_ui_candidate_prepare',
    );
  });

  it('backs active governance task polling off from 5 to 10 seconds and stops at a terminal state', async () => {
    vi.useFakeTimers();
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage']);
    brainApi.listBrainGovernanceTasks
      .mockResolvedValueOnce({
        items: [{ id: 21, idempotencyKey: 'task-21', taskType: 'evaluate', stage: 'candidate', resourceKey: 'customer_facts', riskLevel: 'low', status: 'evaluating', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
        total: 1,
        page: 1,
        pageSize: 50,
      })
      .mockResolvedValueOnce({
        items: [{ id: 21, idempotencyKey: 'task-21', taskType: 'evaluate', stage: 'candidate', resourceKey: 'customer_facts', riskLevel: 'low', status: 'evaluating', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:05.000Z' }],
        total: 1,
        page: 1,
        pageSize: 50,
      })
      .mockResolvedValueOnce({
        items: [{ id: 21, idempotencyKey: 'task-21', taskType: 'evaluate', stage: 'candidate', resourceKey: 'customer_facts', riskLevel: 'low', status: 'approved', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:05.000Z' }],
        total: 1,
        page: 1,
        pageSize: 50,
      });

    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/tasks?status=evaluating');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(3);
  });

  it('continues polling an evidence-blocked task and stops after CI evidence restores it', async () => {
    vi.useFakeTimers();
    const waiting = { id: 44, idempotencyKey: 'task-44', taskType: 'evaluate', stage: 'candidate', resourceKey: 'customer_facts', riskLevel: 'low', status: 'revision_required', blockerType: 'evidence', blockerCode: 'valid_gate_receipt_missing', resolutionType: 'wait_ci', payload: {}, transitionLog: [], attemptCount: 0, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' };
    brainApi.listBrainGovernanceTasks
      .mockResolvedValueOnce({ items: [waiting], total: 1, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({ items: [{ ...waiting, status: 'approved', blockerType: 'none', blockerCode: null, resolutionType: null }], total: 1, page: 1, pageSize: 20 });

    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/workbench?tab=tasks&view=evidence');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);
  });

  it('navigates pending approval to the selected capability and only labels it as approval for approvers', async () => {
    const pending = { id: 45, idempotencyKey: 'task-45', taskType: 'evaluate', stage: 'candidate', resourceKey: 'refund_execute', riskLevel: 'high', status: 'pending_approval', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:05.000Z' };
    brainApi.listBrainGovernanceTasks.mockResolvedValue({ items: [pending], total: 1, page: 1, pageSize: 20 });
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:approve']);
    const user = userEvent.setup();
    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/workbench?tab=tasks&status=pending_approval');

    await user.click(await screen.findByRole('button', { name: '查看并审批能力' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/brain-governance/workbench?tab=capabilities&actionableOnly=true&selectedId=refund_execute');
  });

  it('pauses task polling while hidden and refreshes one second after the page becomes visible', async () => {
    vi.useFakeTimers();
    const activeTaskResponse = {
      items: [{ id: 22, idempotencyKey: 'task-22', taskType: 'evaluate', stage: 'candidate', resourceKey: 'customer_facts', riskLevel: 'low', status: 'evaluating', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
      total: 1,
      page: 1,
      pageSize: 50,
    };
    brainApi.listBrainGovernanceTasks.mockResolvedValue(activeTaskResponse);

    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/tasks?status=evaluating');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(3);
  });

  it('keeps the current task list visible when a background refresh fails', async () => {
    vi.useFakeTimers();
    brainApi.listBrainGovernanceTasks
      .mockResolvedValueOnce({
        items: [{ id: 23, idempotencyKey: 'task-23', taskType: 'evaluate', stage: 'candidate', resourceKey: 'customer_facts', riskLevel: 'low', status: 'evaluating', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
        total: 1,
        page: 1,
        pageSize: 50,
      })
      .mockRejectedValueOnce(apiError({
        message: '治理任务服务暂时不可用',
        category: 'system',
        resolutionType: 'retry_system',
        retryable: true,
      }));

    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/tasks?status=evaluating');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText('#23 · evaluate')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(screen.getByText('#23 · evaluate')).toBeInTheDocument();
    expect(screen.getByText(/自动刷新失败，当前列表可能不是最新/)).toBeInTheDocument();
    expect(screen.queryByText('正在加载治理任务…')).not.toBeInTheDocument();
  });

  it('shows missing Receipt as waiting for CI and never offers a meaningless retry', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage']);
    brainApi.listBrainGovernanceTasks.mockResolvedValue({
      items: [{
        id: 44,
        idempotencyKey: 'task-44',
        taskType: 'evaluate',
        stage: 'candidate',
        resourceKey: 'customer_facts',
        riskLevel: 'low',
        status: 'revision_required',
        blockerType: 'evidence',
        blockerCode: 'valid_gate_receipt_missing',
        resolutionType: 'wait_ci',
        candidate: {
          id: 17,
          candidateKey: 'owner/repo:head:merge',
          branch: 'feature/governance',
          headCommit: '3'.repeat(40),
          status: 'governing',
        },
        requiredGates: ['brain_contract', 'release_eval'],
        payload: {},
        result: { blockingReason: 'valid_gate_receipt_missing' },
        transitionLog: [],
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/workbench?tab=tasks&view=evidence');

    expect(await screen.findByText(/等待 CI 可信证据/)).toBeInTheDocument();
    expect(screen.getByText(/feature\/governance · 3333333333 · owner\/repo:head:merge/)).toBeInTheDocument();
    expect(screen.getByText('所需 Gate：brain_contract、release_eval')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重试/ })).not.toBeInTheDocument();
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledWith(expect.objectContaining({ blockerType: 'evidence' }));
  });

  it('turns a store-scope blocker into a concrete top-store-selector instruction', async () => {
    brainApi.listBrainGovernanceTasks.mockResolvedValue({
      items: [{
        id: 46,
        idempotencyKey: 'task-46',
        taskType: 'evaluate',
        stage: 'candidate',
        resourceKey: 'store_inventory',
        riskLevel: 'medium',
        status: 'revision_required',
        blockerType: 'business',
        blockerCode: 'store_scope_required',
        resolutionType: 'select_store',
        payload: {},
        transitionLog: [],
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/workbench?tab=tasks');

    expect(await screen.findByText('需要指定门店范围。请在页面顶部的门店选择器中选择具体门店后再继续。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重试/ })).not.toBeInTheDocument();
  });

  it('uses structured permission metadata and does not offer a meaningless retry', async () => {
    brainApi.getBrainGovernanceOverview.mockRejectedValue(apiError({
      message: '缺少执行该治理操作所需的权限。',
      code: 'brain_governance_permission_denied',
      category: 'permission',
      resolutionType: 'request_approval',
      retryable: false,
    }));

    renderPage(<BrainGovernanceOverviewPage />, '/brain-governance/workbench?tab=overview');

    expect(await screen.findByText('权限不足')).toBeInTheDocument();
    expect(screen.getByText('请联系管理员或具备相应权限的审批人处理。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
  });

  it('offers retry only when the structured governance error says it is retryable', async () => {
    brainApi.listBrainCapabilityPolicies.mockRejectedValue(apiError({
      message: '治理服务暂时不可用，请稍后重试。',
      code: 'brain_governance_system_error',
      category: 'system',
      resolutionType: 'retry_system',
      retryable: true,
    }));

    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/workbench?tab=capabilities');

    expect(await screen.findByText('治理服务请求失败')).toBeInTheDocument();
    expect(screen.getByText('这是系统错误，可以安全重试。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
