import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrainEvalCenter } from './BrainEvalCenter';

const api = vi.hoisted(() => ({
  createBrainEvalRun: vi.fn(),
  getBrainEvalRun: vi.fn(),
  getBrainEvalQuestionCatalogDetail: vi.fn(),
  isBrainGovernanceReadCancelled: vi.fn(() => false),
  listBrainEvalQuestionCatalog: vi.fn(),
  listBrainEvalRuns: vi.fn(),
  listBrainEvalSuites: vi.fn(),
}));

vi.mock('@/api/brain', () => api);

const item = {
  questionId: 'qb-manager-business-overview-001',
  question: '今天店里情况怎么样，给我来个总结',
  questionType: '经营概览',
  intentType: 'diagnosis',
  persona: 'manager',
  passed: true,
  status: 'usable_exact',
  hitRate: 1,
  runId: 34319,
  failureReason: null,
  diagnosis: '意图、能力、执行与回答契约通过，未发现阻塞问题。',
  improvementSuggestion: '保持当前语义和能力绑定，并纳入后续版本回归监控。',
  averageLatencyMs: 4844,
};

const detail = {
  ...item,
  semanticKeys: ['domain.finance', 'capability.store_operations_overview'],
  dataTables: ['ProductOrder', 'Reservation'],
  testHistory: [
    {
      releaseId: 362,
      generatedAt: '2026-07-20T22:02:53.420Z',
      runId: 34319,
      status: 'usable_exact',
      brainStatus: 'completed',
      passed: true,
      latencyMs: 4844,
      answer: '实收：0.00 元；订单：0 单。',
      graderReason: '意图、指标引用和回答粒度匹配。',
      expectedIntent: 'diagnosis',
      actualIntent: 'diagnosis',
      expectedShape: 'non_metric',
      actualShape: 'non_metric',
      capabilityKeys: ['store_operations_overview'],
      citations: [],
      layers: [{ layer: 'intent', passed: true, score: 1, checked: 2, failures: [] }],
    },
  ],
};

const response = {
  metadata: {
    generatedAt: '2026-07-21T16:15:47.109Z',
    sourceGeneratedAt: '2026-07-20T22:02:53.42Z',
    releaseId: 362,
    storeId: 6,
    total: 650,
    passed: 360,
    failed: 283,
    unavailable: 7,
    passRate: 0.5598755832037325,
    averageHitRate: 0.7558643790849674,
    sourceQuestionFile: 'agent-eval-questions.md',
    sourceResultFile: 'release362-final-650.json',
  },
  types: [{ value: '经营概览', count: 20 }],
  items: [item],
  total: 650,
  page: 1,
  pageSize: 50,
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/brain-governance']}>
      <Routes><Route path="*" element={<><BrainEvalCenter /><LocationProbe /></>} /></Routes>
    </MemoryRouter>,
  );
}

describe('BrainEvalCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listBrainEvalQuestionCatalog.mockResolvedValue(response);
    api.getBrainEvalQuestionCatalogDetail.mockResolvedValue(detail);
    api.listBrainEvalRuns.mockResolvedValue({ items: [] });
    api.listBrainEvalSuites.mockResolvedValue({ items: [] });
  });

  it('renders the 650-question catalog and requested governance fields', async () => {
    renderPage();

    expect(await screen.findByText('今天店里情况怎么样，给我来个总结')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '650 题 Release #362 基线' })).toBeInTheDocument();
    expect(screen.getByText('360')).toBeInTheDocument();
    expect(screen.getByText('283')).toBeInTheDocument();
    for (const column of ['问题 ID', '问题内容', '问题类型', '问题诊断及改进建议', '平均耗时', '是否通过', '命中率', '操作']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.queryByRole('columnheader', { name: '关联语义' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '关联库表' })).not.toBeInTheDocument();
    expect(screen.getByText(item.diagnosis)).toBeInTheDocument();
    expect(screen.getByText(`建议：${item.improvementSuggestion}`)).toBeInTheDocument();
    expect(screen.queryByText('domain.finance')).not.toBeInTheDocument();
    expect(screen.queryByText('ProductOrder')).not.toBeInTheDocument();
    expect(screen.getByText('4.84 秒')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('filters the catalog through the server-side query contract', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(item.question);

    await user.type(screen.getByPlaceholderText('搜索问题 ID、内容、诊断、语义或库表'), '营业额');
    await user.selectOptions(screen.getAllByRole('combobox')[1]!, '经营概览');

    await waitFor(() => expect(api.listBrainEvalQuestionCatalog).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 50,
      search: '营业额',
      questionType: '经营概览',
    })));
  });

  it('loads semantic associations on demand instead of rendering them in the list', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '语义查询' }));

    expect(await screen.findByRole('dialog', { name: '关联语义与库表' })).toBeInTheDocument();
    expect(api.getBrainEvalQuestionCatalogDetail).toHaveBeenCalledWith(item.questionId);
    expect(screen.getByText('domain.finance')).toBeInTheDocument();
    expect(screen.getByText('ProductOrder')).toBeInTheDocument();
  });

  it('shows the saved historical reply and grader result in a detail dialog', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '查看测试结果' }));

    expect(await screen.findByRole('dialog', { name: '历史测试回复结果' })).toBeInTheDocument();
    expect(api.getBrainEvalQuestionCatalogDetail).toHaveBeenCalledWith(item.questionId);
    expect(screen.getByText('实收：0.00 元；订单：0 单。')).toBeInTheDocument();
    expect(screen.getByText(/意图、指标引用和回答粒度匹配/)).toBeInTheDocument();
    expect(screen.getByText(/4844 ms/)).toBeInTheDocument();
  });

  it('opens Ami Brain with the selected question and its evaluation ID', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '调试' }));

    await waitFor(() => expect(screen.getByLabelText('current-location')).toHaveTextContent('/brain?'));
    expect(screen.getByLabelText('current-location')).toHaveTextContent('debugEvalCase=qb-manager-business-overview-001');
  });

  it('keeps database evaluation runs in a secondary dialog', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '运行记录' }));

    expect(await screen.findByRole('dialog', { name: '治理评测运行记录' })).toBeInTheDocument();
    expect(api.listBrainEvalRuns).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/两者不混算/)).toBeInTheDocument();
  });
});
