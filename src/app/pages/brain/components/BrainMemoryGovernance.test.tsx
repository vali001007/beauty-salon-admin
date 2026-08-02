import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainMemoryGovernance } from './BrainMemoryGovernance';

const api = vi.hoisted(() => ({
  correctBrainMemory: vi.fn(),
  deleteBrainMemory: vi.fn(),
  listBrainMemories: vi.fn(),
  listBrainMemoryRevisions: vi.fn(),
  restoreBrainMemory: vi.fn(),
}));
const permissionState = vi.hoisted(() => ({ canManage: false }));

vi.mock('@/api/brain', () => api);
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => permissionState.canManage }));
vi.mock('../brainGovernanceNavigation', () => ({ BRAIN_GOVERNANCE_UI_MODE: 'manage' }));

describe('BrainMemoryGovernance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionState.canManage = false;
    api.listBrainMemories.mockResolvedValue({
      items: [
        {
          id: 7,
          storeId: 1,
          userId: 9,
          type: 'semantic',
          subjectKey: 'customer.preference.7',
          content: { preference: '晚间预约' },
          confidence: 0.9,
          validFrom: '2026-08-01T00:00:00.000Z',
          expiresAt: null,
          sourceRunId: 88,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 8,
          storeId: 1,
          userId: 9,
          type: 'episodic',
          subjectKey: 'customer.deleted.8',
          content: { note: '历史记录' },
          confidence: 0.8,
          validFrom: '2026-07-01T00:00:00.000Z',
          expiresAt: null,
          sourceRunId: 80,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
          deletedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      total: 2,
    });
    api.listBrainMemoryRevisions.mockResolvedValue({
      items: [
        {
          id: 71,
          memoryId: 7,
          revisionType: 'corrected',
          nextContent: { preference: '晚间预约' },
          reason: '人工复核',
          createdAt: '2026-08-01T01:00:00.000Z',
        },
      ],
      total: 1,
    });
  });

  it('lets view-only users inspect history without correcting, deleting or restoring memories', async () => {
    render(<BrainMemoryGovernance />);

    expect(await screen.findByText('customer.preference.7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '纠正记忆' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除记忆' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '恢复记忆' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '查看版本记录' })[0]);
    expect(await screen.findByText(/原因：人工复核/)).toBeInTheDocument();
    expect(api.correctBrainMemory).not.toHaveBeenCalled();
    expect(api.deleteBrainMemory).not.toHaveBeenCalled();
    expect(api.restoreBrainMemory).not.toHaveBeenCalled();
  });
});
