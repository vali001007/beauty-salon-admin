import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrainResourceGovernancePanel } from './BrainResourceGovernancePanel';

const brainApi = vi.hoisted(() => ({
  listBrainResourceVersions: vi.fn(),
}));

vi.mock('@/api/brain', () => brainApi);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('BrainResourceGovernancePanel', () => {
  it('loads versions before active resources to avoid concurrent database pressure', async () => {
    const versions = deferred<{ items: Array<Record<string, unknown>> }>();
    const active = deferred<{ items: Array<Record<string, unknown>> }>();
    brainApi.listBrainResourceVersions.mockReturnValue(versions.promise);
    const loadActive = vi.fn(() => active.promise);

    render(
      <BrainResourceGovernancePanel
        title="实体版本"
        description="测试"
        resourceType="ontology_entity"
        keyField="entityKey"
        example={{ entityKey: 'customer' }}
        loadActive={loadActive}
        createResource={vi.fn()}
        updateResource={vi.fn()}
      />,
    );

    expect(brainApi.listBrainResourceVersions).toHaveBeenCalledWith({
      resourceType: 'ontology_entity',
      includeSnapshot: false,
      take: 100,
    });
    expect(loadActive).not.toHaveBeenCalled();

    versions.resolve({ items: [] });

    await waitFor(() => expect(loadActive).toHaveBeenCalledTimes(1));
    active.resolve({
      items: [
        {
          id: 1,
          entityKey: 'customer',
          version: 2,
          status: 'active',
          name: '客户',
        },
      ],
    });

    expect(await screen.findByText('customer')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('keeps active and historical versions visible while hiding draft mutation controls in read-only mode', async () => {
    brainApi.listBrainResourceVersions.mockResolvedValue({ items: [] });
    const loadActive = vi.fn().mockResolvedValue({
      items: [{ id: 2, entityKey: 'appointment', version: 4, status: 'active', name: '预约' }],
    });

    render(
      <BrainResourceGovernancePanel
        title="实体版本"
        description="测试"
        resourceType="ontology_entity"
        keyField="entityKey"
        example={{ entityKey: 'appointment' }}
        loadActive={loadActive}
        createResource={vi.fn()}
        updateResource={vi.fn()}
        canManage={false}
      />,
    );

    expect(await screen.findByText('appointment')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存新版本' })).not.toBeInTheDocument();
  });
});
