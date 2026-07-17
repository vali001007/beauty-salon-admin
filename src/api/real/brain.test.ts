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
    await brainApi.confirmBrainAction('act_1', 7);
    await brainApi.rejectBrainAction('act_1', 7);
    await brainApi.listBrainTraces();
    await brainApi.listBrainSemanticResource('metrics');
    await brainApi.updateBrainSemanticResource('metrics', 'paid_revenue', { status: 'active' });
    await brainApi.listBrainRoleProfiles();
    await brainApi.listBrainMemories();
    await brainApi.correctBrainMemory(5, { content: { preference: '先看毛利' } });
    await brainApi.deleteBrainMemory(5, 'obsolete');
    await brainApi.restoreBrainMemory(5);
    await brainApi.listBrainSkills();
    await brainApi.listBrainInspectionRules();
    await brainApi.getBrainInspectionRepairPreview(21);
    await brainApi.decideBrainInspectionRepair(21, { decision: 'modify', modifications: { safetyStock: 12 } });
    await brainApi.createBrainEvalRun({ releaseId: 1, caseKeys: ['metric_001'] });
    await brainApi.createBrainRelease({ releaseKey: 'brain-mvp-v1' });
    await brainApi.createBrainRolloutSequence({ releaseKey: 'brain-mvp-v1', resourceVersionIds: [11] });
    await brainApi.getBrainGovernanceRuntimeConfig();
    await brainApi.rejectBrainRelease(61, '风险不可接受');
    await brainApi.submitBrainReleaseModification(61, '只允许店长使用，客户手机号必须脱敏');
    await brainApi.listBrainCapabilityRegenerationJobs(61);
    await brainApi.getBrainCapabilityRegenerationJob(501);
    await brainApi.retryBrainCapabilityRegenerationJob(501);
    await brainApi.rollbackBrainReleaseToRules(61, 'emergency_rules_rollback');
    await brainApi.createBrainFeedback({ runId: 1, rating: 'helpful' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/conversations/9/messages');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/runs/3/events');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/actions/act_1/confirm', { actionId: 'act_1', runId: 7 });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/actions/act_1/reject', { actionId: 'act_1', runId: 7 });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/traces');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/semantic/metrics');
    expect(apiClientMock.patch).toHaveBeenCalledWith('/brain/governance/semantic/metrics/paid_revenue', { status: 'active' });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/roles');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/memories');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/memories/5/correct', {
      content: { preference: '先看毛利' },
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/memories/5/delete', { reason: 'obsolete' });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/memories/5/restore', {});
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/skills');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/inspection-rules');
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/inspections/findings/21/repair-preview');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/inspections/findings/21/repair-decisions', {
      decision: 'modify',
      modifications: { safetyStock: 12 },
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/evals/runs', {
      releaseId: 1,
      caseKeys: ['metric_001'],
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases', { releaseKey: 'brain-mvp-v1' });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/rollout-sequence', {
      releaseKey: 'brain-mvp-v1',
      resourceVersionIds: [11],
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/runtime-config');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/61/reject', {
      reason: '风险不可接受',
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/61/modification-requirements', {
      requirement: '只允许店长使用，客户手机号必须脱敏',
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/regeneration-jobs', { params: { releaseId: 61 } });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/regeneration-jobs/501');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/regeneration-jobs/501/retry', {});
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/61/rollback-to-rules', {
      reason: 'emergency_rules_rollback',
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/feedback', { runId: 1, rating: 'helpful' });
  });
});
