import { BrainController } from './brain.controller.js';
import { BrainContextService } from './context/brain-context.service.js';

describe('BrainController', () => {
  const contextService = new BrainContextService();
  const controller = new BrainController(contextService);

  const request = {
    headers: {
      'x-store-id': '2',
      'x-request-id': 'req_test',
    },
    user: {
      id: 9,
      permissions: ['core:brain:use'],
      deniedPermissions: [],
      storeIds: [2],
    },
  } as never;

  it('creates a conversation with injected store context', () => {
    const response = controller.createConversation(request, { title: '晨会经营复盘' });

    expect(response).toEqual({ id: 0, title: '晨会经营复盘', storeId: 2 });
  });

  it('queues a message under the selected store context', () => {
    const response = controller.sendMessage(request, '12', {
      message: '今天预约多少？',
      timezone: 'Asia/Shanghai',
    });

    expect(response).toMatchObject({
      conversationId: 12,
      runId: 0,
      status: 'queued',
      contextStoreId: 2,
    });
  });

  it('exposes conversation messages and run events contract endpoints', () => {
    expect(controller.listMessages(request, '12')).toMatchObject({ conversationId: 12, items: [] });
    expect(controller.getRunEvents('99')).toMatchObject({ runId: 99, events: [] });
  });

  it('supports rejecting action previews before execution', () => {
    expect(controller.rejectAction(request, 'act_1', { runId: 5, actionId: 'act_1' })).toMatchObject({
      actionId: 'act_1',
      runId: 5,
      status: 'rejected',
      storeId: 2,
    });
  });

  it('exposes governance collection endpoints for the management console', async () => {
    await expect(controller.listTraces()).resolves.toMatchObject({ items: [], total: 0 });
    await expect(controller.listSemanticResource('metrics')).resolves.toMatchObject({ resource: 'metrics', items: [] });
    await expect(controller.listRoleProfiles()).resolves.toMatchObject({ items: [] });
    await expect(controller.listSkills()).resolves.toMatchObject({ items: [] });
    await expect(controller.listInspectionRules()).resolves.toMatchObject({ items: [] });
  });

  it('exposes eval, release and feedback governance endpoints', () => {
    expect(controller.createEvalRun({ releaseId: 'brain-mvp', caseKeys: ['metric_001'] })).toMatchObject({
      status: 'queued',
      caseCount: 1,
    });
    expect(controller.createRelease(request, { releaseKey: 'brain-mvp-v1' })).toMatchObject({
      status: 'draft',
      createdBy: 9,
    });
    expect(controller.createFeedback(request, { runId: 3, rating: 'helpful' })).toMatchObject({
      status: 'open',
      runId: 3,
      storeId: 2,
    });
  });
});
