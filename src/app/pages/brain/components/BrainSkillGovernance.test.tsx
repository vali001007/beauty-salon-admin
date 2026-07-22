import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainSkillGovernance } from './BrainSkillGovernance';

const api = vi.hoisted(() => ({
  createBrainSkill: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainSkills: vi.fn(),
  listBrainSkillGovernanceHistory: vi.fn(),
  listBrainSkillGovernanceSummaries: vi.fn(),
  setBrainPublishedSkillEnabled: vi.fn(),
  updateBrainSkill: vi.fn(),
}));

vi.mock('@/api/brain', () => api);
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));

const summary = {
  versionId: 1053,
  skillId: 2053,
  skillKey: 'appointment_gap_list',
  name: '预约空档查询',
  description: '查询指定日期和员工的预约空档。',
  version: 17,
  status: 'draft',
  updatedAt: '2026-07-21T05:33:51.889Z',
  activeVersionId: 986,
  activeVersion: 15,
  enabled: true,
  historyCount: 17,
  managed: true,
  domains: ['reservation', 'staff'],
  entities: ['reservation', 'beautician'],
  metrics: ['appointment_count', 'arrival_rate', 'no_show_rate'],
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/brain-governance']}>
      <Routes>
        <Route path="*" element={<><BrainSkillGovernance /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BrainSkillGovernance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listBrainSkillGovernanceSummaries.mockResolvedValue({ items: [summary] });
    api.listBrainSkills.mockResolvedValue({ items: [] });
    api.listBrainSkillGovernanceHistory.mockResolvedValue({
      items: [{
        ...summary,
        type: 'query',
        riskLevel: 'low',
        permissions: ['core:reservation:view'],
        activatedAt: null,
        archivedAt: null,
      }],
    });
    api.setBrainPublishedSkillEnabled.mockResolvedValue({ enabled: false });
    api.createBrainSkill.mockResolvedValue({ id: 1054, status: 'draft' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows the requested columns and latest skill information', async () => {
    renderPage();

    expect(await screen.findByText('预约空档查询')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '技能 ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '版本' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '技能说明' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '涉及领域' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '实体' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '指标' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '更新时间' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '操作' })).toBeInTheDocument();
    expect(screen.getByText('2053')).toBeInTheDocument();
    expect(screen.getByText('版本记录 #1053')).toBeInTheDocument();
    expect(screen.getByText('生效 v15')).toBeInTheDocument();
    expect(screen.getByText('staff')).toBeInTheDocument();
    expect(screen.getByText('beautician')).toBeInTheDocument();
    expect(screen.getByText('appointment_count')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('opens version history without loading full snapshots in the main table', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '历史版本 (17)' }));

    expect(await screen.findByRole('dialog', { name: '预约空档查询 · 历史版本' })).toBeInTheDocument();
    expect(api.listBrainSkillGovernanceHistory).toHaveBeenCalledWith('appointment_gap_list', { take: 100 });
  });

  it('opens Ami Brain with a prefilled skill-debug question', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '调试' }));

    await waitFor(() => expect(screen.getByLabelText('current-location')).toHaveTextContent('/brain?'));
    expect(screen.getByLabelText('current-location')).toHaveTextContent('debugSkill=appointment_gap_list');
  });

  it('requires confirmation and toggles the published active version', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '停用' }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.setBrainPublishedSkillEnabled).toHaveBeenCalledWith('appointment_gap_list', false));
  });

  it('keeps the create editor out of the page and opens it from the list header', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('预约空档查询')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '创建 Skill 草稿版本' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Skill 配置 JSON')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建 Skill' }));

    expect(screen.getByRole('dialog', { name: '创建 Skill 草稿版本' })).toBeInTheDocument();
    expect((screen.getByLabelText('Skill 配置 JSON') as HTMLTextAreaElement).value).toContain('new_skill');
  });

  it('creates a draft from the create dialog and closes it after saving', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '创建 Skill' }));
    await user.click(screen.getByRole('button', { name: '保存新版本' }));

    await waitFor(() => expect(api.createBrainSkill).toHaveBeenCalledWith(expect.objectContaining({ skillKey: 'new_skill' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '创建 Skill 草稿版本' })).not.toBeInTheDocument());
  });
});
