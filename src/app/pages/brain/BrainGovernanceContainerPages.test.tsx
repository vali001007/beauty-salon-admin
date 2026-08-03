import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoreStore } from '@/stores/storeStore';
import {
  BrainGovernanceQualityPage,
  BrainGovernanceReleasesPage,
  BrainGovernanceSettingsPage,
  BrainGovernanceWorkbenchPage,
} from './BrainGovernanceContainerPages';

const brainApi = vi.hoisted(() => ({ cancelBrainGovernanceReads: vi.fn() }));

vi.mock('@/api/brain', () => brainApi);

vi.mock('./components/BrainGovernanceWorkbench', () => ({
  BrainGovernanceOverviewPage: () => <div>overview-content</div>,
  BrainCapabilityGovernancePage: () => <div>capability-content</div>,
  BrainGovernanceTasksPage: () => <div>task-content</div>,
  BrainPolicySnapshotsPage: () => <div>policy-content</div>,
}));
vi.mock('./components/BrainInspectionGovernance', () => ({ BrainInspectionGovernance: () => <div>inspection-content</div> }));
vi.mock('./components/BrainSemanticGovernance', () => ({ BrainSemanticGovernance: () => <div>semantic-content</div> }));
vi.mock('./components/BrainEvalCenter', () => ({ BrainEvalCenter: () => <div>eval-content</div> }));
vi.mock('./components/BrainFeedbackBoard', () => ({ BrainFeedbackBoard: () => <div>feedback-content</div> }));
vi.mock('./components/BrainQualityLatencyPanel', () => ({ BrainQualityLatencyPanel: () => <div>latency-content</div> }));
vi.mock('./components/BrainReleaseCenter', () => ({ BrainReleaseCenter: () => <div>runtime-content</div> }));
vi.mock('./components/BrainRolloutSequencePage', () => ({ BrainRolloutSequencePage: () => <div>sequence-content</div> }));
vi.mock('./components/BrainRoleGovernance', () => ({ BrainRoleGovernance: () => <div>role-content</div> }));
vi.mock('./components/BrainMemoryGovernance', () => ({ BrainMemoryGovernance: () => <div>memory-content</div> }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage(element: React.ReactNode, path: string) {
  return render(<MemoryRouter initialEntries={[path]}>{element}<LocationProbe /></MemoryRouter>);
}

describe('Brain governance compact containers', () => {
  beforeEach(() => {
    useStoreStore.setState({ currentStoreId: 6, stores: [] });
  });

  it('restores the workbench tab from URL and opens advanced settings without a sidebar entry', async () => {
    const user = userEvent.setup();
    renderPage(<BrainGovernanceWorkbenchPage />, '/brain-governance/workbench?tab=tasks&status=failed');

    expect(screen.getByText('task-content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '任务' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: '能力' }));
    expect(brainApi.cancelBrainGovernanceReads).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/brain-governance/workbench?tab=capabilities&status=failed');
    expect(screen.getByText('capability-content')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '高级设置' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/brain-governance/settings?tab=roles');
  });

  it('consolidates semantic, eval and feedback in the quality center', async () => {
    const user = userEvent.setup();
    renderPage(<BrainGovernanceQualityPage />, '/brain-governance/quality?tab=feedback');

    expect(screen.getByText('feedback-content')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '语义' }));
    expect(screen.getByText('semantic-content')).toBeInTheDocument();
  });

  it('keeps governance policy and runtime version as separately named tabs', async () => {
    const user = userEvent.setup();
    renderPage(<BrainGovernanceReleasesPage />, '/brain-governance/releases?tab=policy');

    expect(screen.getByText('policy-content')).toBeInTheDocument();
    expect(screen.getByText(/治理策略（GP）决定允许与禁止边界/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '治理策略（GP）' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '运行版本（RT）' }));
    expect(screen.getByText('sequence-content')).toBeInTheDocument();
  });

  it('keeps roles and memory in low-frequency advanced settings', () => {
    renderPage(<BrainGovernanceSettingsPage />, '/brain-governance/settings?tab=memory');
    expect(screen.getByText('memory-content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '记忆治理' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not send store-scoped quality requests while the user is viewing all stores', () => {
    useStoreStore.setState({ currentStoreId: null, stores: [] });
    renderPage(<BrainGovernanceQualityPage />, '/brain-governance/quality?tab=eval');

    expect(screen.getByText('请先选择一个门店')).toBeInTheDocument();
    expect(screen.queryByText('eval-content')).not.toBeInTheDocument();
    expect(screen.getByText(/选择门店后才会发送请求/)).toBeInTheDocument();
  });

  it('does not mount store-scoped inspection while the user is viewing all stores', () => {
    useStoreStore.setState({ currentStoreId: null, stores: [] });
    renderPage(<BrainGovernanceWorkbenchPage />, '/brain-governance/workbench?tab=inspection');

    expect(screen.getByText('请先选择一个门店')).toBeInTheDocument();
    expect(screen.queryByText('inspection-content')).not.toBeInTheDocument();
    expect(screen.getByText(/选择门店后才会发送请求/)).toBeInTheDocument();
  });

  it('keeps global question latency available while viewing all stores', () => {
    useStoreStore.setState({ currentStoreId: null, stores: [] });
    renderPage(<BrainGovernanceQualityPage />, '/brain-governance/quality?tab=latency');

    expect(screen.getByText('latency-content')).toBeInTheDocument();
    expect(screen.queryByText('请先选择一个门店')).not.toBeInTheDocument();
  });

  it('falls back to each container default when the URL contains an invalid tab', () => {
    const cases = [
      { element: <BrainGovernanceWorkbenchPage />, path: '/brain-governance/workbench?tab=removed', content: 'overview-content', tab: '总览' },
      { element: <BrainGovernanceQualityPage />, path: '/brain-governance/quality?tab=removed', content: 'semantic-content', tab: '语义' },
      { element: <BrainGovernanceReleasesPage />, path: '/brain-governance/releases?tab=removed', content: 'policy-content', tab: '治理策略（GP）' },
      { element: <BrainGovernanceSettingsPage />, path: '/brain-governance/settings?tab=removed', content: 'role-content', tab: '角色与权限' },
    ];

    for (const item of cases) {
      const view = renderPage(item.element, item.path);
      expect(screen.getByText(item.content)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: item.tab })).toHaveAttribute('aria-selected', 'true');
      view.unmount();
    }
  });
});
