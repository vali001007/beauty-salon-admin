import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { BrainInspectionGovernance } from './BrainInspectionGovernance';

const api = vi.hoisted(() => ({
  createBrainInspectionRule: vi.fn(),
  cancelBrainGovernanceReads: vi.fn(),
  decideBrainInspectionRepair: vi.fn(),
  getBrainInspectionFinding: vi.fn(),
  getBrainInspectionRepairPreview: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainInspectionFindings: vi.fn(),
  listBrainInspectionRules: vi.fn(),
  listBrainResourceVersions: vi.fn(),
  runBrainInspection: vi.fn(),
  updateBrainInspectionRule: vi.fn(),
}));
const permissionState = vi.hoisted(() => ({
  manage: false,
  execute: false,
}));

vi.mock('@/api/brain', () => api);
vi.mock('@/hooks/usePermission', () => ({
  usePermission: (permission: string) => permission === 'core:brain-governance:manage'
    ? permissionState.manage
    : permission === 'core:brain:execute'
      ? permissionState.execute
      : false,
}));
vi.mock('../brainGovernanceNavigation', () => ({ BRAIN_GOVERNANCE_UI_MODE: 'manage' }));

describe('BrainInspectionGovernance', () => {
  function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}</output>;
  }

  function renderPage(initialEntry = '/brain-governance/workbench?tab=inspection') {
    return render(<MemoryRouter initialEntries={[initialEntry]}><BrainInspectionGovernance /><LocationProbe /></MemoryRouter>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    permissionState.manage = false;
    permissionState.execute = false;
    api.listBrainInspectionFindings.mockResolvedValue({
      items: [{
        id: 21,
        ruleKey: 'inventory.low_stock',
        title: '库存低于安全线',
        severity: 'high',
        status: 'open',
        evidenceCount: 1,
        suggestionCount: 1,
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    api.getBrainInspectionFinding.mockResolvedValue({
      id: 21,
      ruleKey: 'inventory.low_stock',
      title: '库存低于安全线',
      severity: 'high',
      status: 'open',
      evidence: { stock: 2 },
      suggestion: { action: '人工复核补货' },
    });
    api.listBrainResourceVersions.mockResolvedValue({ items: [] });
    api.listBrainInspectionRules.mockResolvedValue({
      items: [{ id: 31, ruleKey: 'inventory.low_stock', version: 2, status: 'active', name: '库存安全线' }],
    });
    api.runBrainInspection.mockResolvedValue({ findingCount: 1 });
  });

  it('keeps findings and rule versions read-only without manage or execute permissions', async () => {
    renderPage();

    expect(await screen.findByText('库存低于安全线')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即巡检' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '审查' })).not.toBeInTheDocument();
    expect(screen.getByText('只读')).toBeInTheDocument();
    expect(screen.queryByText(/"stock"/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    expect(await screen.findByText(/"stock"/)).toBeInTheDocument();
    expect(api.getBrainInspectionFinding).toHaveBeenCalledWith(21);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: '规则版本' }));
    expect(await screen.findByText('inventory.low_stock')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存新版本' })).not.toBeInTheDocument();
  });

  it('allows governance managers to run inspection without granting repair execution', async () => {
    permissionState.manage = true;
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '立即巡检' }));
    await waitFor(() => expect(api.runBrainInspection).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button', { name: '审查' })).not.toBeInTheDocument();
    expect(api.getBrainInspectionRepairPreview).not.toHaveBeenCalled();
  });

  it('restores governance filters from the URL and sends them to the paginated API', async () => {
    renderPage('/brain-governance/workbench?tab=inspection&inspectionStatus=all&inspectionRisk=critical&inspectionOwner=ops&inspectionCandidate=candidate-21&inspectionCreatedFrom=2026-08-01&inspectionCreatedTo=2026-08-02');

    await waitFor(() => expect(api.listBrainInspectionFindings).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: undefined,
      search: undefined,
      severity: 'critical',
      owner: 'ops',
      candidateKey: 'candidate-21',
      createdFrom: '2026-08-01',
      createdTo: '2026-08-02',
    }));
    expect(screen.getByLabelText('巡检风险')).toHaveValue('critical');
    expect(screen.getByLabelText('巡检负责人')).toHaveValue('ops');
    expect(screen.getByLabelText('巡检 Candidate')).toHaveValue('candidate-21');

    fireEvent.change(screen.getByLabelText('巡检负责人'), { target: { value: 'risk-owner' } });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('inspectionOwner=risk-owner'));
    expect(api.cancelBrainGovernanceReads).toHaveBeenCalled();
  });

  it('does not allow a slower previous filter request to overwrite the latest result', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    api.listBrainInspectionFindings
      .mockReset()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        items: [{ id: 22, ruleKey: 'finance.margin_drop', title: '最新筛选结果', severity: 'critical', status: 'open', evidenceCount: 0, suggestionCount: 0 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    renderPage();
    await waitFor(() => expect(api.listBrainInspectionFindings).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('巡检风险'), { target: { value: 'critical' } });
    expect(await screen.findByText('最新筛选结果')).toBeInTheDocument();
    resolveFirst?.({
      items: [{ id: 21, ruleKey: 'inventory.low_stock', title: '过期筛选结果', severity: 'high', status: 'open', evidenceCount: 0, suggestionCount: 0 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    await waitFor(() => expect(screen.queryByText('过期筛选结果')).not.toBeInTheDocument());
    expect(screen.getByText('最新筛选结果')).toBeInTheDocument();
  });
});
