import { act, render, screen } from '@testing-library/react';
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
  classifyBrainCapabilityPolicy: vi.fn(),
  createBrainPolicySnapshot: vi.fn(),
  evaluateBrainCapabilityPolicy: vi.fn(),
  getBrainCapabilityPolicy: vi.fn(),
  getBrainGovernanceOverview: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainCapabilityPolicies: vi.fn(),
  listBrainGovernanceTasks: vi.fn(),
  listBrainPolicySnapshots: vi.fn(),
  publishBrainPolicySnapshot: vi.fn(),
  retryBrainGovernanceTask: vi.fn(),
  rollbackBrainPolicySnapshot: vi.fn(),
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
    brainApi.listBrainCapabilityPolicies.mockResolvedValue({ items: [highRiskPolicy], total: 1, page: 1, pageSize: 20 });
    brainApi.getBrainCapabilityPolicy.mockResolvedValue({ current: highRiskPolicy, history: [highRiskPolicy], evidence: [] });
    brainApi.listBrainGovernanceTasks.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
    brainApi.listBrainPolicySnapshots.mockResolvedValue({
      items: [{ id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: 'draft', previousReleaseId: 6, createdAt: '2026-08-01T00:00:00.000Z', items: [] }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows policy/runtime separation and sends overview cards to URL-restorable filters', async () => {
    const user = userEvent.setup();
    renderPage(<BrainGovernanceOverviewPage />, '/brain-governance/overview');

    expect(await screen.findByText('治理策略发布不会自动改变当前 Brain 运行状态。')).toBeInTheDocument();
    expect(screen.getByText('governance-v7')).toBeInTheDocument();
    expect(screen.getByText('runtime-r416')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /待审批/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/brain-governance/tasks?status=pending_approval');
  });

  it('restores capability filters from URL and makes high-risk approval explicitly non-executable', async () => {
    state.permissions = new Set(['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:approve']);
    const user = userEvent.setup();
    renderPage(<BrainCapabilityGovernancePage />, '/brain-governance/capabilities?riskLevel=high');

    expect(await screen.findByText('refund_execute')).toBeInTheDocument();
    expect(brainApi.listBrainCapabilityPolicies).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'high' }));
    expect(screen.getByRole('button', { name: '治理审批' })).toHaveAttribute('title', '仅审批治理结论，不进入普通执行白名单');
    expect(screen.queryByRole('button', { name: '审批准入' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '详情' }));
    expect(await screen.findByText('禁止普通执行白名单')).toBeInTheDocument();
  });

  it('keeps policy snapshots read-only without manage/publish permission and states the activation boundary', async () => {
    renderPage(<BrainPolicySnapshotsPage />, '/brain-governance/policy-snapshots');

    expect(await screen.findByText(/这里发布的是治理规则/)).toBeInTheDocument();
    expect(screen.getByText(/不会自动激活 Skill、Semantic 或当前 Brain Runtime Release/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /创建快照/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /发布策略/ })).not.toBeInTheDocument();
  });

  it('polls active governance tasks and stops after they reach a terminal state', async () => {
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
        items: [{ id: 21, idempotencyKey: 'task-21', taskType: 'evaluate', stage: 'candidate', resourceKey: 'customer_facts', riskLevel: 'low', status: 'approved', payload: {}, transitionLog: [], attemptCount: 1, maxAttempts: 3, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:05.000Z' }],
        total: 1,
        page: 1,
        pageSize: 50,
      });

    renderPage(<BrainGovernanceTasksPage />, '/brain-governance/tasks?status=evaluating');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(brainApi.listBrainGovernanceTasks).toHaveBeenCalledTimes(2);
  });
});
