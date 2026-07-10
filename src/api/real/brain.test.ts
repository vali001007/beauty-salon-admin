import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../client', () => ({
  default: apiClientMock,
}));

describe('brain real API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.post.mockResolvedValue({
      conversationId: 1,
      runId: 2,
      status: 'completed',
      answer: 'ok',
      citations: [],
      suggestedActions: [],
    });
    apiClientMock.get.mockResolvedValue({ items: [], total: 0 });
    apiClientMock.patch.mockResolvedValue({ status: 'draft_updated' });
  });

  it('sends chat message without double data unwrap', async () => {
    const { sendBrainMessage } = await import('./brain');

    const response = await sendBrainMessage(1, { message: '今天预约多少', timezone: 'Asia/Shanghai' });

    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/conversations/1/messages', {
      message: '今天预约多少',
      timezone: 'Asia/Shanghai',
    });
    expect(response.answer).toBe('ok');
  });

  it('maps workspace and governance APIs to brain endpoints', async () => {
    const brainApi = await import('./brain');

    await brainApi.listBrainMessages(9);
    await brainApi.getBrainRunEvents(3);
    await brainApi.rejectBrainAction('act_1', 7);
    await brainApi.listBrainTraces();
    await brainApi.listBrainSemanticResource('metrics');
    await brainApi.updateBrainSemanticResource('metrics', 'paid_revenue', { status: 'active' });
    await brainApi.listBrainRoleProfiles();
    await brainApi.listBrainSkills();
    await brainApi.listBrainInspectionRules();
    await brainApi.createBrainEvalRun({ releaseId: 'brain-mvp', caseKeys: ['metric_001'] });
    await brainApi.createBrainRelease({ releaseKey: 'brain-mvp-v1' });
    await brainApi.createBrainFeedback({ runId: 1, rating: 'helpful' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/conversations/9/messages');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/runs/3/events');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/actions/act_1/reject', { actionId: 'act_1', runId: 7 });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/traces');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/semantic/metrics');
    expect(apiClientMock.patch).toHaveBeenCalledWith('/brain/governance/semantic/metrics/paid_revenue', { status: 'active' });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/roles');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/skills');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/inspection-rules');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/evals/runs', {
      releaseId: 'brain-mvp',
      caseKeys: ['metric_001'],
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases', { releaseKey: 'brain-mvp-v1' });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/feedback', { runId: 1, rating: 'helpful' });
  });
});
