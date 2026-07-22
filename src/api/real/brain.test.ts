import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

function governanceConfig(extra: Record<string, unknown> = {}) {
  return expect.objectContaining({
    ...extra,
    signal: expect.any(AbortSignal),
    skipRetry: true,
  });
}

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

  it('forwards guidance provenance without changing the chat endpoint', async () => {
    const { sendBrainMessage } = await import('./brain');
    const payload = {
      message: '会员卡负债是多少？',
      timezone: 'Asia/Shanghai',
      guidanceSelection: { kind: 'follow_up' as const, sourceRunId: 102, optionId: 'liability' },
    };

    await sendBrainMessage(1, payload);

    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/conversations/1/messages', payload);
  });

  it('forwards conversation pagination to the workspace endpoint', async () => {
    const { listBrainConversations } = await import('./brain');

    await listBrainConversations({ page: 3, pageSize: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/conversations', {
      params: { page: 3, pageSize: 10 },
    });
  });

  it('forwards feedback issue pagination to the current-user endpoint', async () => {
    const { listBrainFeedbackIssues } = await import('./brain');

    await listBrainFeedbackIssues({ page: 2, pageSize: 10 });

    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/feedback/issues', {
      params: { page: 2, pageSize: 10 },
    });
  });

  it('maps workspace and governance APIs to brain endpoints', async () => {
    const brainApi = await import('./brain');

    await brainApi.listBrainMessages(9);
    await brainApi.getBrainRunEvents(3);
    await brainApi.listBrainActionStatuses(3);
    await brainApi.confirmBrainAction('act_1', 7);
    await brainApi.rejectBrainAction('act_1', 7);
    await brainApi.retryBrainAction('act_1', 7);
    await brainApi.listBrainTraces();
    await brainApi.listBrainSemanticResource('metrics');
    await brainApi.updateBrainSemanticResource('metrics', 'paid_revenue', { status: 'active' });
    await brainApi.listBrainSemanticGovernanceSummaries('entities', { take: 100 });
    await brainApi.listBrainSemanticGovernanceHistory('entities', 'card', { take: 20 });
    await brainApi.setBrainPublishedSemanticEnabled('entities', 'card', false);
    await brainApi.getBrainSemanticGraph();
    await brainApi.listBrainRoleProfiles();
    await brainApi.listBrainMemories();
    await brainApi.correctBrainMemory(5, { content: { preference: '先看毛利' } });
    await brainApi.deleteBrainMemory(5, 'obsolete');
    await brainApi.restoreBrainMemory(5);
    await brainApi.listBrainSkills({ summary: true });
    await brainApi.listBrainSkillGovernanceSummaries({ take: 100 });
    await brainApi.listBrainSkillGovernanceHistory('appointment_gap_list', { take: 20 });
    await brainApi.setBrainPublishedSkillEnabled('appointment_gap_list', false);
    await brainApi.listBrainInspectionRules();
    await brainApi.getBrainInspectionRepairPreview(21);
    await brainApi.decideBrainInspectionRepair(21, { decision: 'modify', modifications: { safetyStock: 12 } });
    await brainApi.createBrainEvalRun({ releaseId: 1, caseKeys: ['metric_001'] });
    await brainApi.listBrainEvalQuestionCatalog({ page: 2, pageSize: 50, status: 'failed' });
    await brainApi.listBrainRuntimeEvalQuestionCatalog({ page: 3, pageSize: 10, search: 'qb-001' });
    await brainApi.getBrainEvalQuestionCatalogDetail('qb/001');
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
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/runs/3/actions');
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/actions/act_1/confirm', { actionId: 'act_1', runId: 7 });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/actions/act_1/reject', { actionId: 'act_1', runId: 7 });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/actions/act_1/retry', { actionId: 'act_1', runId: 7 });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/traces', governanceConfig());
    expect(apiClientMock.get).toHaveBeenCalledWith(
      '/brain/governance/semantic/metrics',
      governanceConfig({ timeout: 15000 }),
    );
    expect(apiClientMock.patch).toHaveBeenCalledWith('/brain/governance/semantic/metrics/paid_revenue', {
      status: 'active',
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/semantic-versions/entities', {
      params: { take: 100 },
      signal: expect.any(AbortSignal),
      skipRetry: true,
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/semantic-versions/entities/card', {
      params: { take: 20 },
      signal: expect.any(AbortSignal),
      skipRetry: true,
    });
    expect(apiClientMock.patch).toHaveBeenCalledWith('/brain/governance/semantic-versions/entities/card/enabled', {
      enabled: false,
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/semantic-graph', governanceConfig());
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/roles', governanceConfig());
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/memories', governanceConfig());
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/memories/5/correct', {
      content: { preference: '先看毛利' },
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/memories/5/delete', { reason: 'obsolete' });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/memories/5/restore', {});
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/skills', governanceConfig());
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/inspection-rules', governanceConfig());
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/inspections/findings/21/repair-preview', governanceConfig());
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/inspections/findings/21/repair-decisions', {
      decision: 'modify',
      modifications: { safetyStock: 12 },
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/evals/runs', {
      releaseId: 1,
      caseKeys: ['metric_001'],
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/evals/catalog', {
      params: { page: 2, pageSize: 50, status: 'failed' },
      signal: expect.any(AbortSignal),
      skipRetry: true,
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/evals/catalog', {
      params: { page: 3, pageSize: 10, search: 'qb-001' },
    });
    expect(apiClientMock.get).toHaveBeenCalledWith(
      '/brain/governance/evals/catalog/qb%2F001',
      governanceConfig(),
    );
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases', { releaseKey: 'brain-mvp-v1' });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/rollout-sequence', {
      releaseKey: 'brain-mvp-v1',
      resourceVersionIds: [11],
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/runtime-config', governanceConfig());
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/skills', {
      params: { summary: true },
      signal: expect.any(AbortSignal),
      skipRetry: true,
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/skill-versions', {
      params: { take: 100 },
      signal: expect.any(AbortSignal),
      skipRetry: true,
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/skill-versions/appointment_gap_list', {
      params: { take: 20 },
      signal: expect.any(AbortSignal),
      skipRetry: true,
    });
    expect(apiClientMock.patch).toHaveBeenCalledWith('/brain/governance/skills/appointment_gap_list/enabled', {
      enabled: false,
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/61/reject', {
      reason: '风险不可接受',
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/61/modification-requirements', {
      requirement: '只允许店长使用，客户手机号必须脱敏',
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/regeneration-jobs', {
      params: { releaseId: 61 },
      signal: expect.any(AbortSignal),
      skipRetry: true,
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/brain/governance/regeneration-jobs/501', governanceConfig());
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/regeneration-jobs/501/retry', {});
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/governance/releases/61/rollback-to-rules', {
      reason: 'emergency_rules_rollback',
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/brain/feedback', { runId: 1, rating: 'helpful' });
  });

  it('aborts governance reads when the active governance tab changes', async () => {
    const brainApi = await import('./brain');
    apiClientMock.get.mockImplementationOnce(
      (_url: string, config: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          config.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('canceled'), { payload: { code: 'ERR_CANCELED' } }));
          });
        }),
    );

    const pending = brainApi.listBrainRoleProfiles();
    const config = apiClientMock.get.mock.calls.at(-1)?.[1] as { signal: AbortSignal };
    brainApi.cancelBrainGovernanceReads();

    expect(config.signal.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ payload: { code: 'ERR_CANCELED' } });
  });
});
