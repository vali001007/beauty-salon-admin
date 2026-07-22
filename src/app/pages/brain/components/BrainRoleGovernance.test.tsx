import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainRoleGovernance } from './BrainRoleGovernance';

const brainApi = vi.hoisted(() => ({
  createBrainRoleProfile: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainResourceVersions: vi.fn(),
  listBrainRoleProfiles: vi.fn(),
  updateBrainRoleProfile: vi.fn(),
}));

vi.mock('@/api/brain', () => brainApi);

describe('BrainRoleGovernance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brainApi.listBrainResourceVersions.mockResolvedValue({
      items: [
        {
          id: 21,
          resourceKey: 'store_manager',
          version: 2,
          status: 'draft',
          createdAt: '2026-07-22T02:00:00.000Z',
          snapshot: {
            roleKey: 'store_manager',
            name: '店长经营专家',
            systemPrompt: '基于真实经营事实回答。',
            allowedSkills: ['query_revenue', 'query_margin', 'analyze_trend', 'summarize_actions'],
            dataScopeRules: { storeScope: 'current_user_visible_stores' },
            knowledgePack: { domains: ['beauty_store_operations'] },
          },
        },
      ],
    });
    brainApi.listBrainRoleProfiles.mockResolvedValue({ items: [] });
    brainApi.updateBrainRoleProfile.mockResolvedValue({ id: 22, status: 'draft' });
    brainApi.createBrainRoleProfile.mockResolvedValue({ id: 23, status: 'draft' });
  });

  it('shows role name, business domains, authorized skills and configuration action', async () => {
    render(<BrainRoleGovernance />);

    expect(await screen.findByText('店长经营专家')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '角色名称' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '业务领域范围' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '授权 Skills' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '配置' })).toBeInTheDocument();
    expect(screen.getByText('门店综合经营')).toBeInTheDocument();
    expect(screen.getByText('query_revenue')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('草稿')).toBeInTheDocument();
  });

  it('loads the selected role into the editor and saves a new draft version', async () => {
    render(<BrainRoleGovernance />);

    await userEvent.click(await screen.findByRole('button', { name: '配置店长经营专家' }));

    expect(screen.getByText('配置角色 · store_manager')).toBeInTheDocument();
    expect((screen.getByLabelText('角色配置 JSON') as HTMLTextAreaElement).value).toContain('query_margin');

    await userEvent.click(screen.getByRole('button', { name: '保存新版本' }));

    await waitFor(() => {
      expect(brainApi.updateBrainRoleProfile).toHaveBeenCalledWith(
        'store_manager',
        expect.objectContaining({
          roleKey: 'store_manager',
          name: '店长经营专家',
          allowedSkills: ['query_revenue', 'query_margin', 'analyze_trend', 'summarize_actions'],
        }),
      );
    });
  });
});
