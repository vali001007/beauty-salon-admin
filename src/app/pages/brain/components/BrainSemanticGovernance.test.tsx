import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainSemanticGovernance } from './BrainSemanticGovernance';

const api = vi.hoisted(() => ({
  getBrainSemanticGraph: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainSemanticGovernanceHistory: vi.fn(),
  listBrainSemanticGovernanceSummaries: vi.fn(),
  setBrainPublishedSemanticEnabled: vi.fn(),
}));

vi.mock('@/api/brain', () => api);
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));

const metric = {
  id: 33,
  resourceType: 'metric' as const,
  resourceKey: 'paid_amount',
  name: '实收金额',
  version: 3,
  status: 'active',
  semanticDescription: '支付成功后的实际收款金额。',
  dataTables: ['Order', 'PaymentRecord'],
  fuzzyTerms: ['实收', '到账金额'],
  hitCount: 3,
  sampleCount: 12,
  hitRate: 0.25,
  updatedAt: '2026-07-21T10:00:00.000Z',
  managed: true,
  enabled: true,
  definitionId: 41,
  definitionKey: 'paid_amount',
  definitionVersionId: 51,
  historyCount: 3,
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/brain-governance']}>
      <Routes>
        <Route path="*" element={<><BrainSemanticGovernance /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BrainSemanticGovernance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listBrainSemanticGovernanceSummaries.mockResolvedValue({ items: [metric] });
    api.listBrainSemanticGovernanceHistory.mockResolvedValue({
      items: [{
        id: metric.id,
        resourceType: metric.resourceType,
        resourceKey: metric.resourceKey,
        name: metric.name,
        version: metric.version,
        status: metric.status,
        semanticDescription: metric.semanticDescription,
        dataTables: metric.dataTables,
        fuzzyTerms: metric.fuzzyTerms,
        updatedAt: metric.updatedAt,
        managed: true,
        enabled: true,
        definitionId: metric.definitionId,
        definitionKey: metric.definitionKey,
        definitionVersionId: metric.definitionVersionId,
      }],
    });
    api.setBrainPublishedSemanticEnabled.mockResolvedValue({ enabled: false });
    api.getBrainSemanticGraph.mockResolvedValue({
      nodes: [
        { id: 'entity.customer', key: 'entity.customer', label: '客户', kind: 'entity', status: 'active', version: 1, description: '客户实体', dataTables: ['Customer'], fuzzyTerms: ['会员'] },
        { id: 'relation.order.customer', key: 'relation.order.customer', label: '订单客户', kind: 'relation', status: 'active', version: 1, description: '', dataTables: ['ProductOrder', 'Customer'], fuzzyTerms: [] },
        { id: 'metric.paid_amount', key: 'metric.paid_amount', label: '实收金额', kind: 'metric', status: 'active', version: 2, description: '支付实收', dataTables: ['ProductOrder'], fuzzyTerms: ['实收'] },
        { id: 'table:Customer', key: 'Customer', label: 'Customer', kind: 'table', status: 'active', version: null, description: '数据表', dataTables: ['Customer'], fuzzyTerms: [] },
      ],
      edges: [
        { id: 'relation_to', source: 'relation.order.customer', target: 'entity.customer', kind: 'relation_to', label: '指向' },
        { id: 'backed_by', source: 'entity.customer', target: 'table:Customer', kind: 'backed_by', label: '数据表' },
      ],
      summary: { entities: 1, relations: 1, metrics: 1, tables: 1, edges: 2 },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows semantic governance columns and readable metadata instead of a JSON snapshot', async () => {
    renderPage();

    expect(await screen.findByText('实收金额')).toBeInTheDocument();
    for (const column of ['ID', '名称', '版本', '语义说明', '关联数据表', '模糊词条', '命中率', '更新时间', '操作']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getByText('支付成功后的实际收款金额。')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();
    expect(screen.getByText('PaymentRecord')).toBeInTheDocument();
    expect(screen.getByText('实收')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('3/12 次问答')).toBeInTheDocument();
  });

  it('opens historical versions for the selected semantic resource', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '历史版本 (3)' }));

    expect(await screen.findByRole('dialog', { name: '实收金额 · 历史版本' })).toBeInTheDocument();
    expect(api.listBrainSemanticGovernanceHistory).toHaveBeenCalledWith('metrics', 'paid_amount', { take: 100 });
  });

  it('opens Ami Brain with a prefilled semantic debug question', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '调试' }));

    await waitFor(() => expect(screen.getByLabelText('current-location')).toHaveTextContent('/brain?'));
    expect(screen.getByLabelText('current-location')).toHaveTextContent('debugSemantic=metrics%3Apaid_amount');
  });

  it('requires confirmation before disabling the published business definition', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '停用' }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.setBrainPublishedSemanticEnabled).toHaveBeenCalledWith('metrics', 'paid_amount', false));
  });

  it('shows no sample instead of inventing a hit rate', async () => {
    api.listBrainSemanticGovernanceSummaries.mockResolvedValue({ items: [{ ...metric, hitCount: 0, sampleCount: 0, hitRate: null }] });
    renderPage();

    expect(await screen.findByText('暂无样本')).toBeInTheDocument();
  });

  it('opens the semantic graph tab and supports node detail and debug navigation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '语义图谱' }));
    expect(await screen.findByRole('img', { name: 'Ami Brain 语义图谱' })).toBeInTheDocument();
    expect(api.getBrainSemanticGraph).toHaveBeenCalledTimes(1);
    expect(screen.getByText('连接')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '实体：客户' }));
    expect(screen.getByText('entity.customer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '调试此节点' }));

    await waitFor(() => expect(screen.getByLabelText('current-location')).toHaveTextContent('debugSemanticGraph=entity.customer'));
  });
});
